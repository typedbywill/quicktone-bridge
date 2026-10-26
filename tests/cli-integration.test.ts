import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli/program.js';
import { readPresetFile } from '../src/cli/files.js';
import { NuxMG30Client } from '../src/client/NuxMG30Client.js';
import { unpackNuxPayload } from '../src/protocol/nuxEncoding.js';
import { VirtualMG30 } from './support/VirtualMG30.js';
import type { PresetData } from '../src/types.js';

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nux-cli-integration-')); directories.push(directory);
  const transport = new VirtualMG30(), log = vi.fn(), error = vi.fn();
  const clientFactory = vi.fn(options => new NuxMG30Client({ transport, ...options }));
  return {
    transport, log, error, clientFactory,
    file: (name: string) => path.join(directory, name),
    run: (args: string[]) => runCli(['--json', '--timeout', '100', ...args], { clientFactory, log, error }),
  };
}
const bodyOf = (preset: PresetData, scene: number) => unpackNuxPayload(preset.scenes[scene].raw.subarray(2));
const sceneSets = (device: VirtualMG30, command: number) => device.sent.filter(bytes => bytes[4] === command && bytes[5] === 1);
const cloneBodies = (bodies: Uint8Array[]) => bodies.map(body => body.slice());

describe('CLI → real client → protocol → virtual device → files integration', () => {
  it('edits only the active live scene until an explicit --save persists all three scenes', async () => {
    const f = fixture(), original = cloneBodies(f.transport.savedScenes(17)), before = cloneBodies(f.transport.current);
    expect(await f.run(['block', 'set', 'AMP', 'Gain', '80'])).toBe(0);
    expect(f.error).not.toHaveBeenCalled();
    const expected = before[2].slice(); expected[28] = 80;
    expect(f.transport.current).toEqual([before[0], before[1], expected]);
    expect(f.transport.savedScenes(17)).toEqual(original);
    expect(sceneSets(f.transport, 0x0b)).toHaveLength(0);
    expect(sceneSets(f.transport, 0x0c)).toHaveLength(1);
    expect(JSON.parse(f.log.mock.calls.at(-1)![0])).toMatchObject({ value: 80, saved: false });
    expect(f.transport.getIsConnected()).toBe(false);

    expect(await f.run(['block', 'set', 'AMP', 'Gain', '81', '--save'])).toBe(0);
    expected[28] = 81;
    expect(f.transport.savedScenes(17)).toEqual([before[0], before[1], expected]);
    expect(sceneSets(f.transport, 0x0b)).toHaveLength(3);
    expect(sceneSets(f.transport, 0x0b).every(frame => frame.length === 222)).toBe(true);
    expect(f.transport.savedScenes(17)[2].slice(122)).toEqual(before[2].slice(122));
    expect(JSON.parse(f.log.mock.calls.at(-1)![0])).toMatchObject({ value: 81, saved: true });
    expect(f.transport.getIsConnected()).toBe(false);
  });

  it('backs up 128 complete presets, validates 384 scenes, and restores every changed destination byte', async () => {
    const f = fixture(), filename = f.file('full-bank.json');
    const original = new Map(Array.from({ length: 128 }, (_, index) => [index, cloneBodies(f.transport.savedScenes(index))]));
    expect(await f.run(['preset', 'backup', filename])).toBe(0);
    expect(f.error).not.toHaveBeenCalled();
    const bank = readPresetFile(filename);
    expect(bank.kind).toBe('bank'); expect(bank.presets).toHaveLength(128);
    expect(bank.presets.reduce((sum, preset) => sum + preset.scenes.length, 0)).toBe(384);
    for (const preset of bank.presets) for (let scene = 0; scene < 3; scene++) expect(bodyOf(preset, scene)).toEqual(original.get(preset.index)![scene]);
    expect(sceneSets(f.transport, 0x0b)).toHaveLength(0);
    expect(f.transport.sent.some(bytes => (bytes[0] & 0xf0) === 0xc0)).toBe(false);

    for (let index = 0; index < 128; index++) for (const body of f.transport.savedScenes(index)) {
      body[28] ^= 63; body[122] ^= 255; body[106] = 88;
    }
    expect(await f.run(['preset', 'restore', filename])).toBe(0);
    expect(f.error).not.toHaveBeenCalled();
    for (let index = 0; index < 128; index++) expect(f.transport.savedScenes(index)).toEqual(original.get(index));
    expect(sceneSets(f.transport, 0x0b)).toHaveLength(384);
    expect(JSON.parse(f.log.mock.calls.at(-1)![0])).toEqual({ restored: true, presets: 128, scenes: 384 });
    expect(f.transport.getIsConnected()).toBe(false);
  });

  it.each(['json', 'syx'])('exports a saved preset as %s then imports every scene into another destination', async extension => {
    const f = fixture(), filename = f.file(`source.${extension}`), source = cloneBodies(f.transport.savedScenes(5));
    const originalSource = cloneBodies(source), unrelated = cloneBodies(f.transport.savedScenes(6));
    expect(await f.run(['preset', 'export', '02B', filename])).toBe(0);
    expect(readPresetFile(filename).presets[0].index).toBe(5);
    expect(await f.run(['preset', 'import', filename, '--to', '32D'])).toBe(0);
    expect(f.error).not.toHaveBeenCalled();
    expect(f.transport.savedScenes(127)).toEqual(source);
    expect(f.transport.savedScenes(5)).toEqual(originalSource);
    expect(f.transport.savedScenes(6)).toEqual(unrelated);
    const writes = sceneSets(f.transport, 0x0b);
    expect(writes.map(frame => [frame[6], frame[7]])).toEqual([[127, 0], [127, 1], [127, 2]]);
    expect(f.transport.preset).toBe(17);
    expect(f.transport.getIsConnected()).toBe(false);
  });

  it('renames and saves all three scenes while retaining every other byte', async () => {
    const f = fixture(), index = 22, original = cloneBodies(f.transport.savedScenes(index)), name = 'ABCDEFGHIJKLMNOP';
    expect(await f.run(['preset', 'rename', '06C', name])).toBe(0);
    expect(f.error).not.toHaveBeenCalled();
    for (let scene = 0; scene < 3; scene++) {
      const expected = original[scene].slice(); expected.set(Buffer.from(name, 'ascii'), 106);
      expect(f.transport.savedScenes(index)[scene]).toEqual(expected);
      expect(f.transport.current[scene]).toEqual(expected);
    }
    expect(sceneSets(f.transport, 0x0c).map(frame => frame[7])).toEqual([0, 1, 2]);
    expect(sceneSets(f.transport, 0x0b).map(frame => frame[7])).toEqual([0, 1, 2]);
    expect(f.transport.preset).toBe(index);
  });

  it('clones full scene models, knobs, names and opaque bytes, leaving saved data untouched unless requested', async () => {
    const f = fixture(), initial = cloneBodies(f.transport.current), saved = cloneBodies(f.transport.savedScenes(17));
    expect(await f.run(['scene', 'clone', '2', '1'])).toBe(0);
    expect(f.error).not.toHaveBeenCalled();
    expect(f.transport.current).toEqual([initial[1], initial[1], initial[2]]);
    expect(f.transport.savedScenes(17)).toEqual(saved);
    expect(sceneSets(f.transport, 0x0b)).toHaveLength(0);
    expect(f.transport.sceneIndex).toBe(2);

    expect(await f.run(['scene', 'clone', '1', '3', '--save'])).toBe(0);
    expect(f.transport.savedScenes(17)).toEqual([initial[1], initial[1], initial[1]]);
    expect(f.transport.current).toEqual([initial[1], initial[1], initial[1]]);
    expect(sceneSets(f.transport, 0x0b)).toHaveLength(3);
  });

  it('exports --current from the live edit buffer, including unsaved raw bytes, and can import it elsewhere', async () => {
    const f = fixture(), filename = f.file('current.syx'), savedFilename = f.file('saved.json');
    const original = cloneBodies(f.transport.savedScenes(17));
    expect(await f.run(['param', 'set', 'AMP', '0', '214', '--raw'])).toBe(0);
    expect(await f.run(['preset', 'export', '05B', filename, '--current'])).toBe(0);
    expect(await f.run(['preset', 'export', '05B', savedFilename])).toBe(0);
    const live = readPresetFile(filename).presets[0], saved = readPresetFile(savedFilename).presets[0];
    expect(bodyOf(live, 2)[28]).toBe(214);
    expect(bodyOf(saved, 2)).toEqual(original[2]);
    expect(bodyOf(live, 2).slice(122)).toEqual(original[2].slice(122));
    expect(bodyOf(live, 0)).toEqual(original[0]); expect(bodyOf(live, 1)).toEqual(original[1]);
    expect(await f.run(['import', 'preset', filename, '--to', '01A'])).toBe(0);
    expect(f.error).not.toHaveBeenCalled();
    expect(f.transport.savedScenes(0)).toEqual(live.scenes.map((_scene, index) => bodyOf(live, index)));
    expect(f.transport.savedScenes(17)).toEqual(original);
  });

  it('rejects --current export for an inactive preset without producing a file or saving changes', async () => {
    const f = fixture(), filename = f.file('wrong.json');
    expect(await f.run(['preset', 'export', '01A', filename, '--current'])).toBe(1);
    expect(fs.existsSync(filename)).toBe(false);
    expect(JSON.parse(f.error.mock.calls.at(-1)![0]).error).toMatch(/Only the active preset/);
    expect(sceneSets(f.transport, 0x0b)).toHaveLength(0);
    expect(f.transport.getIsConnected()).toBe(false);
  });

  it('reports a failed write verification without saving the edit or claiming success', async () => {
    const f = fixture(), original = cloneBodies(f.transport.savedScenes(17));
    f.transport.corruptNextReadback = true;
    expect(await f.run(['block', 'set', 'AMP', 'Gain', '80', '--save'])).toBe(1);
    expect(f.log).not.toHaveBeenCalled();
    expect(JSON.parse(f.error.mock.calls.at(-1)![0]).error).toMatch(/failed write verification/);
    expect(f.transport.savedScenes(17)).toEqual(original);
    expect(sceneSets(f.transport, 0x0b)).toHaveLength(0);
    expect(f.transport.getIsConnected()).toBe(false);
  });
});
