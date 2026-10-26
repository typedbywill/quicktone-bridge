import { describe, expect, it, vi } from 'vitest';
import { NuxMG30Client } from '../src/client/NuxMG30Client.js';
import { VirtualMG30, canonicalSceneBody, frame, packBody } from './support/VirtualMG30.js';

async function connected(options: { timeoutMs?: number } = {}) {
  const transport = new VirtualMG30();
  const client = new NuxMG30Client({ transport, timeoutMs: options.timeoutMs ?? 100 });
  await client.connect();
  return { client, transport };
}

const sceneSets = (transport: VirtualMG30, command: number) => transport.sent.filter(bytes => bytes[0] === 0xf0 && bytes[4] === command && bytes[5] === 1);
const programChanges = (transport: VirtualMG30) => transport.sent.filter(bytes => (bytes[0] & 0xf0) === 0xc0);
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe('MG-30 verified client against a stateful virtual device', () => {
  it('reads active preset and scene from their actual positions in the 15 response', async () => {
    const { client, transport } = await connected();
    expect(client.getActivePresetIndex()).toBe(17);
    expect(client.getActiveSceneIndex()).toBe(2);
    const state = await client.synchronize();
    expect(state.preset).toBe(17);
    expect(state.sceneIndex).toBe(2);
    expect(Array.from(state.raw)).toEqual([17, 7, 0, 2, 1, 0, 0, 0]);
    expect(transport.sent[0]).toEqual(frame(0x15, 0));
    await client.disconnect();
  });

  it('edits only the current scene and preserves saved data, other scenes, and opaque bytes', async () => {
    const { client, transport } = await connected();
    const saved = transport.savedScenes(17).map(body => body.slice());
    const oldCurrent = transport.current.map(body => body.slice());
    await client.setParameter('AMP', 0, 83);
    const expected = oldCurrent[2].slice(); expected[28] = 83;
    expect(transport.current[2]).toEqual(expected);
    expect(transport.current[0]).toEqual(oldCurrent[0]);
    expect(transport.current[1]).toEqual(oldCurrent[1]);
    expect(transport.savedScenes(17)).toEqual(saved);
    expect(sceneSets(transport, 0x0c)).toHaveLength(1);
    expect(sceneSets(transport, 0x0b)).toHaveLength(0);
    expect(programChanges(transport)).toHaveLength(0);
    expect(transport.sent.filter(bytes => (bytes[0] & 0xf0) === 0xb0)).toHaveLength(0);
    expect(client.getActiveSceneIndex()).toBe(2);
    await client.disconnect();
  });

  it('recalling a preset discards unsaved edits and restores the saved scenes', async () => {
    const { client, transport } = await connected();
    const saved = transport.savedScenes(17).map(body => body.slice());
    await client.setParameter('AMP', 0, 83);
    expect(transport.current[2][28]).toBe(83);
    const state = await client.loadPreset(17);
    expect(transport.current).toEqual(saved);
    expect(state.preset).toBe(17);
    expect(state.sceneIndex).toBe(0);
    expect(programChanges(transport)).toHaveLength(1);
    await client.disconnect();
  });

  it('serializes concurrent edits so a later edit retains the earlier edit', async () => {
    const { client, transport } = await connected();
    await Promise.all([client.setParameter('AMP', 0, 83), client.setParameter('AMP', 1, 74)]);
    expect(transport.current[2][28]).toBe(83);
    expect(transport.current[2][29]).toBe(74);
    expect(sceneSets(transport, 0x0c)).toHaveLength(2);
    await client.disconnect();
  });

  it('saves all three edited scenes to the destination and verifies each saved scene', async () => {
    const { client, transport } = await connected();
    transport.current.forEach((body, scene) => { body[28] = 80 + scene; body[141] = 250 - scene; });
    const expected = transport.current.map(body => body.slice());
    const sourceSaved = transport.savedScenes(17).map(body => body.slice());
    await client.savePatch(31);
    expect(transport.savedScenes(31)).toEqual(expected);
    expect(transport.savedScenes(17)).toEqual(sourceSaved);
    expect(sceneSets(transport, 0x0b).map(bytes => [bytes[6], bytes[7]])).toEqual([[31, 0], [31, 1], [31, 2]]);
    expect(transport.sent.filter(bytes => bytes[4] === 0x0b && bytes[5] === 0).map(bytes => bytes[7])).toEqual([0, 1, 2]);
    expect(programChanges(transport)).toHaveLength(0);
    expect(client.getActivePresetIndex()).toBe(17);
    expect(client.getActiveSceneIndex()).toBe(2);
    await client.disconnect();
  });

  it('clones every saved scene without loading or altering the source or current edit buffer', async () => {
    const { client, transport } = await connected();
    const source = transport.savedScenes(4).map(body => body.slice());
    transport.current[2][28] = 99;
    const current = transport.current.map(body => body.slice());
    await client.clonePreset(4, 5);
    expect(transport.savedScenes(5)).toEqual(source);
    expect(transport.savedScenes(4)).toEqual(source);
    expect(transport.current).toEqual(current);
    expect(sceneSets(transport, 0x0b).map(bytes => bytes[7])).toEqual([0, 1, 2]);
    expect(programChanges(transport)).toHaveLength(0);
    expect(client.getActivePresetIndex()).toBe(17);
    expect(client.getActiveSceneIndex()).toBe(2);
    await client.disconnect();
  });

  it('does not confuse reading saved or nonactive current scenes with changing the active scene', async () => {
    const { client } = await connected();
    const saved = await client.requestSavedScene(5, 0);
    expect(saved.presetName).toBe('02B');
    expect(saved.scene).toBe(1);
    expect(client.getActivePresetIndex()).toBe(17);
    expect(client.getActiveSceneIndex()).toBe(2);
    const current = await client.requestPatchDump(undefined, 0);
    expect(current.scene).toBe(1);
    expect(client.getActiveSceneIndex()).toBe(2);
    await client.disconnect();
  });

  it('uses the device Custom MIDI scene assignment and confirms selection via state query', async () => {
    const { client, transport } = await connected();
    await client.selectSceneVerified(2);
    expect(transport.sent.some(bytes => bytes[4] === 0x0f && bytes[5] === 0)).toBe(true);
    expect(transport.sent.some(bytes => bytes.length === 3 && bytes[0] === 0xb0 && bytes[1] === 99 && bytes[2] === 1)).toBe(true);
    expect(transport.sceneIndex).toBe(1);
    expect(client.getActiveSceneIndex()).toBe(1);
    await client.disconnect();
  });

  it('reads, sets, and verifies command 0D routing while retaining the configuration byte', async () => {
    const { client, transport } = await connected();
    const chain = await client.requestSignalChain();
    expect(chain.configuration).toBe(37);
    const reversed = chain.blocks.slice().reverse();
    await client.setSignalChain(reversed);
    expect(Array.from(transport.chain)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 37]);
    const readback = await client.requestSignalChain();
    expect(readback.blocks).toEqual(reversed);
    expect(readback.configuration).toBe(37);
    await client.disconnect();
  });

  it('rejects a scene write whose acknowledged bytes do not match readback', async () => {
    const { client, transport } = await connected();
    transport.corruptNextReadback = true;
    const changed = vi.fn(); client.on('paramChanged', changed);
    await expect(client.setParameter('AMP', 0, 83)).rejects.toThrow(/verification/i);
    expect(changed).not.toHaveBeenCalled();
    await client.disconnect();
  });

  it('stops a multi-scene save at the first failed verification and reports partial persistence', async () => {
    const { client, transport } = await connected();
    transport.corruptNextReadback = true;
    await expect(client.savePatch(31)).rejects.toThrow(/scene 1.*earlier scenes may already be saved/i);
    expect(sceneSets(transport, 0x0b)).toHaveLength(1);
    await client.disconnect();
  });

  it('rejects invalid parameter arguments before sending any message', async () => {
    const { client, transport } = await connected();
    const before = transport.sent.length;
    await expect(client.setParameter('AMP', -1, 40)).rejects.toThrow();
    await expect(client.setParameter('AMP', 0, Number.NaN)).rejects.toThrow();
    await expect(client.setParameter('AMP', 0, 101)).rejects.toThrow();
    expect(transport.sent).toHaveLength(before);
    await client.disconnect();
  });
});

describe('MG-30 request correlation and lifecycle', () => {
  it('keeps concurrent scene queries queued and ignores unrelated commands, scenes, ACKs, and truncated frames', async () => {
    const { client, transport } = await connected();
    transport.autoReply = false;
    const before = transport.sent.length;
    const resolved = vi.fn();
    const first = client.requestPatchDump(1000, 0).then(patch => { resolved(); return patch; });
    const second = client.requestPatchDump(1000, 1);
    await flush();
    expect(transport.sent).toHaveLength(before + 1);
    transport.inject(frame(0x0c, 3));
    transport.inject(frame(0x0b, 2, [17, 0, ...packBody(canonicalSceneBody(17, 0))]));
    transport.inject(frame(0x0c, 2, [17, 1, ...packBody(canonicalSceneBody(17, 1))]));
    transport.inject(frame(0x0c, 2, [17, 0, 0, 0]));
    await flush();
    expect(resolved).not.toHaveBeenCalled();
    expect(transport.sent).toHaveLength(before + 1);
    transport.respond(transport.sent[before]);
    expect((await first).scene).toBe(1);
    await flush();
    expect(transport.sent).toHaveLength(before + 2);
    transport.respond(transport.sent[before + 1]);
    expect((await second).scene).toBe(2);
    await client.disconnect();
  });

  it('recovers the queue after a timeout', async () => {
    const { client, transport } = await connected();
    transport.dropCommands.add(0x0c);
    await expect(client.requestPatchDump(10, 0)).rejects.toThrow(/Timed out/i);
    transport.dropCommands.delete(0x0c);
    expect((await client.requestPatchDump(100, 1)).scene).toBe(2);
    await client.disconnect();
  });

  it('rejects pending and queued requests on disconnect without sending the queued command', async () => {
    const { client, transport } = await connected();
    transport.autoReply = false;
    const before = transport.sent.length;
    const results = Promise.allSettled([client.requestPatchDump(1000, 0), client.requestPatchDump(1000, 1)]);
    await flush();
    expect(transport.sent).toHaveLength(before + 1);
    await client.disconnect();
    const settled = await results;
    expect(settled.every(result => result.status === 'rejected')).toBe(true);
    expect(transport.sent).toHaveLength(before + 1);
    transport.autoReply = true;
    await client.connect();
    await client.disconnect();
  });

  it('recovers the request queue after a synchronous MIDI send error', async () => {
    const { client, transport } = await connected();
    transport.rejectNextSend = true;
    await expect(client.requestPatchDump()).rejects.toThrow(/Virtual send failure/);
    expect((await client.requestPatchDump()).scene).toBe(3);
    await client.disconnect();
  });
});


describe('Device information and write failures', () => {
  it('queries firmware using the distinct five-byte handshake and fixed response offsets', async () => {
    const { client, transport } = await connected();
    const info = await client.requestDeviceInfo();
    expect(info.serialNumber).toBe('VirtualSerial');
    expect(info.firmware).toBe('5.0.1');
    expect(transport.sent.at(-1)).toEqual(Uint8Array.from([0xf0, 0x43, 0x58, 0, 0xf7]));
    await client.disconnect();
  });
  it('does not emit patchSaved when the write acknowledgement never arrives', async () => {
    const { client, transport } = await connected({ timeoutMs: 15 });
    transport.dropCommands.add(0x0b);
    const saved = vi.fn(); client.on('patchSaved', saved);
    await expect(client.savePatch()).rejects.toThrow(/Timed out/);
    expect(saved).not.toHaveBeenCalled();
    expect(sceneSets(transport, 0x0b)).toHaveLength(1);
    await client.disconnect();
  });
});
