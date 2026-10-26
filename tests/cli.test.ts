import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/cli/program.js';
import { BLOCK_LIST, programChangeToPresetName } from '../src/constants.js';
import type { NuxMG30Client, NuxClientOptions } from '../src/client/NuxMG30Client.js';
import type { PatchData, PresetData } from '../src/types.js';

function fixture() {
  const patch = { scene: 2, bpm: 120, presetName: '02A', userPatchName: 'Hardware', signalChain: [...BLOCK_LIST], blocks: Object.fromEntries(BLOCK_LIST.map(b => [b, { id: b, enabled: true, modelId: 0, params: [61, 22] }])) } as PatchData;
  const snapshot = (index: number): PresetData => ({ index, scenes: [patch, patch, patch] });
  const client = {
    connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
    ping: vi.fn(async () => 32), getActivePresetIndex: vi.fn(() => 4), getActiveSceneIndex: vi.fn(() => 1),
    getActivePresetInfo: vi.fn(() => ({ index: 4, ...programChangeToPresetName(4) })),
    listInputPorts: vi.fn(() => []), listOutputPorts: vi.fn(() => []),
    requestPatchDump: vi.fn(async () => patch), requestSavedScene: vi.fn(async () => patch),
    readPreset: vi.fn(async (index: number) => snapshot(index)), writePreset: vi.fn(async () => {}),
    loadPreset: vi.fn(async (index: number) => ({ preset: index, sceneIndex: 1 })),
    clonePreset: vi.fn(async () => {}), cloneScene: vi.fn(async () => {}), resetScene: vi.fn(async () => {}),
    savePatch: vi.fn(async () => {}), setPresetName: vi.fn(async () => {}), clearPreset: vi.fn(async () => {}),
    selectSceneVerified: vi.fn(async () => {}), setBlockState: vi.fn(async () => {}), setModel: vi.fn(async () => {}),
    setParameter: vi.fn(async () => {}), setParameterByte: vi.fn(async () => {}), setTempo: vi.fn(async () => {}),
    requestSignalChain: vi.fn(async () => ({ blocks: [...BLOCK_LIST] })), setSignalChain: vi.fn(async () => {}),
    requestDeviceInfo: vi.fn(async () => ({ firmware: '5.0.1', serialNumber: '123' })),
  };
  const options: NuxClientOptions[] = [], log = vi.fn(), error = vi.fn();
  const clientFactory = vi.fn((opts: NuxClientOptions) => { options.push(opts); return client as unknown as NuxMG30Client; });
  const deps = { clientFactory, log, error };
  return { client, deps, options, log, error, snapshot, run: (args: string[]) => runCli(args, deps) };
}

describe('CLI command execution', () => {
  it('awaits the actual ping response, passes global runtime options and closes ports', async () => {
    const f = fixture();
    expect(await f.run(['--json', '--input', '2', '--output', 'MG-30 MIDI', '--timeout', '1234', 'ping'])).toBe(0);
    expect(f.options).toEqual([{ inputPortName: 2, outputPortName: 'MG-30 MIDI', timeoutMs: 1234, synchronizeOnConnect: false }]);
    expect(f.client.ping).toHaveBeenCalledOnce();
    expect(JSON.parse(f.log.mock.calls[0][0])).toEqual({ connected: true, roundTripMs: 32 });
    expect(f.client.disconnect).toHaveBeenCalledOnce();
  });

  it('reports timeout as failure without printing successful hardware results', async () => {
    const f = fixture(); f.client.ping.mockRejectedValueOnce(new Error('Heartbeat timed out'));
    expect(await f.run(['--json', 'ping'])).toBe(1);
    expect(f.log).not.toHaveBeenCalled();
    expect(JSON.parse(f.error.mock.calls[0][0])).toEqual({ error: 'Heartbeat timed out' });
    expect(f.client.disconnect).toHaveBeenCalledOnce();
  });

  it('closes partially connected clients after connect failure', async () => {
    const f = fixture(); f.client.connect.mockRejectedValueOnce(new Error('Port busy'));
    expect(await f.run(['status'])).toBe(1);
    expect(f.client.disconnect).toHaveBeenCalledOnce();
    expect(f.client.getActivePresetInfo).not.toHaveBeenCalled();
  });

  it.each([
    ['preset', 'load', '128'], ['preset', 'load', '-1'], ['scene', 'select', '4'],
    ['block', 'set', 'AMP', 'Gain', 'NaN'], ['block', 'set', 'AMP', 'Gain', '1.5'],
    ['block', 'set', 'AMP', 'Gain', '101'], ['tempo', '241'], ['block', 'state', 'AMP', 'maybe'],
  ])('rejects invalid values before opening MIDI: %j', async (...args) => {
    const f = fixture();
    expect(await f.run(args)).toBe(1);
    expect(f.deps.clientFactory).not.toHaveBeenCalled();
    expect(f.log).not.toHaveBeenCalled();
  });

  it('toggles using hardware block state instead of an assumed or cached value', async () => {
    const f = fixture();
    expect(await f.run(['block', 'toggle', 'AMP'])).toBe(0);
    expect(f.client.requestPatchDump).toHaveBeenCalledOnce();
    expect(f.client.setBlockState).toHaveBeenCalledWith('AMP', false);
    expect(f.client.savePatch).not.toHaveBeenCalled();
    expect(JSON.parse(f.log.mock.calls[0][0])).toEqual({ block: 'AMP', enabled: false, saved: false });
  });

  it('awaits optional save after the live edit and reports it accurately', async () => {
    const f = fixture();
    expect(await f.run(['block', 'set', 'AMP', 'Gain', '80', '--save'])).toBe(0);
    expect(f.client.setParameter).toHaveBeenCalledWith('AMP', 0, 80);
    expect(f.client.setParameter.mock.invocationCallOrder[0]).toBeLessThan(f.client.savePatch.mock.invocationCallOrder[0]);
    expect(JSON.parse(f.log.mock.calls[0][0])).toMatchObject({ block: 'AMP', value: 80, saved: true });
  });

  it('passes explicit raw bytes without percentage conversion', async () => {
    const f = fixture();
    expect(await f.run(['param', 'set', 'AMP', '0', '214', '--raw'])).toBe(0);
    expect(f.client.setParameterByte).toHaveBeenCalledWith('AMP', 0, 214);
    expect(f.client.setParameter).not.toHaveBeenCalled();
  });

  it('requests the selected scene when showing a nonactive scene', async () => {
    const f = fixture();
    expect(await f.run(['scene', 'show', '3'])).toBe(0);
    expect(f.client.requestPatchDump).toHaveBeenCalledWith(undefined, 2);
    expect(f.client.selectSceneVerified).not.toHaveBeenCalled();
  });

  it('uses actual active scene and preset indices for navigation', async () => {
    const f = fixture(); f.client.getActiveSceneIndex.mockReturnValue(2); f.client.getActivePresetIndex.mockReturnValue(127);
    expect(await f.run(['scene', 'up'])).toBe(0);
    expect(f.client.selectSceneVerified).toHaveBeenCalledWith(1);
    const p = fixture(); p.client.getActivePresetIndex.mockReturnValue(127);
    expect(await p.run(['preset', 'up'])).toBe(0);
    expect(p.client.loadPreset).toHaveBeenCalledWith(0);
  });

  it('moves a block before its destination without losing or duplicating blocks', async () => {
    const f = fixture();
    expect(await f.run(['chain', 'move', 'AMP', 'WAH'])).toBe(0);
    const order = f.client.setSignalChain.mock.calls[0][0] as string[];
    expect(order.slice(0, 2)).toEqual(['AMP', 'WAH']);
    expect([...order].sort()).toEqual([...BLOCK_LIST].sort());
  });

  it('leaves local catalog commands offline and rejects an unverified reboot', async () => {
    const f = fixture(); expect(await f.run(['block', 'list'])).toBe(0);
    expect(f.deps.clientFactory).not.toHaveBeenCalled();
    const r = fixture(); expect(await r.run(['device', 'reboot'])).toBe(1);
    expect(r.deps.clientFactory).not.toHaveBeenCalled();
  });
});

describe('CLI complete preset transfers', () => {
  it('exports all three saved scenes and forwards overwrite only when requested', async () => {
    const f = fixture(), writeFile = vi.fn();
    expect(await runCli(['preset', 'export', '02A', 'out.syx', '--force'], { ...f.deps, writeFile })).toBe(0);
    expect(f.client.readPreset).toHaveBeenCalledWith(4, 'saved');
    expect(writeFile).toHaveBeenCalledWith('out.syx', [f.snapshot(4)], 'preset', true);
    expect(f.client.loadPreset).not.toHaveBeenCalled();
  });

  it('reads all 128 saved presets before writing a complete bank', async () => {
    const f = fixture(), writeFile = vi.fn();
    expect(await runCli(['--json', 'export', 'bank', 'backup.json'], { ...f.deps, writeFile })).toBe(0);
    expect(f.client.readPreset.mock.calls.map(call => call[0])).toEqual(Array.from({ length: 128 }, (_, i) => i));
    expect(writeFile).toHaveBeenCalledOnce();
    expect(writeFile.mock.calls[0][1]).toHaveLength(128);
    expect(JSON.parse(f.log.mock.calls[0][0])).toMatchObject({ presets: 128, scenes: 384, includesIrSamples: false });
    expect(f.error).not.toHaveBeenCalled();
  });

  it('never publishes a metadata-only backup after one preset fails to read', async () => {
    const f = fixture(), writeFile = vi.fn();
    f.client.readPreset.mockImplementation(async index => { if (index === 3) throw new Error('Timeout'); return f.snapshot(index); });
    expect(await runCli(['preset', 'backup', 'backup.json'], { ...f.deps, writeFile })).toBe(1);
    expect(writeFile).not.toHaveBeenCalled();
    expect(f.client.disconnect).toHaveBeenCalledOnce();
    expect(f.log).not.toHaveBeenCalled();
  });

  it('fully validates imports before connecting and allows offline destination dry runs', async () => {
    const f = fixture(), readFile = vi.fn(() => ({ kind: 'preset' as const, presets: [f.snapshot(9)] }));
    expect(await runCli(['--json', 'preset', 'import', 'in.json', '--to', '32D', '--dry-run'], { ...f.deps, readFile })).toBe(0);
    expect(readFile).toHaveBeenCalledWith('in.json');
    expect(f.deps.clientFactory).not.toHaveBeenCalled();
    expect(JSON.parse(f.log.mock.calls[0][0])).toEqual({ valid: true, kind: 'preset', destinations: [127], scenes: 3 });
  });

  it('does not connect or write when file validation fails or bank kind is wrong', async () => {
    const f = fixture();
    expect(await runCli(['import', 'preset', 'bad.json'], { ...f.deps, readFile: () => { throw new Error('Checksum mismatch'); } })).toBe(1);
    expect(f.deps.clientFactory).not.toHaveBeenCalled();
    expect(await runCli(['import', 'bank', 'preset.json'], { ...f.deps, readFile: () => ({ kind: 'preset', presets: [f.snapshot(0)] }) })).toBe(1);
    expect(f.deps.clientFactory).not.toHaveBeenCalled();
    expect(f.client.writePreset).not.toHaveBeenCalled();
  });

  it('writes imported data to the requested destination rather than saving the current patch', async () => {
    const f = fixture(), source = f.snapshot(8);
    expect(await runCli(['preset', 'import', 'in.json', '--to', '03D'], { ...f.deps, readFile: () => ({ kind: 'preset', presets: [source] }) })).toBe(0);
    expect(f.client.writePreset).toHaveBeenCalledWith(source, 11);
    expect(f.client.savePatch).not.toHaveBeenCalled();
    expect(f.client.disconnect).toHaveBeenCalledOnce();
  });

  it('stops restore on verification failure and reports the exact partial progress', async () => {
    const f = fixture(), bank = Array.from({ length: 128 }, (_, i) => f.snapshot(i));
    f.client.writePreset.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Verification failed'));
    expect(await runCli(['--json', 'preset', 'restore', 'bank.json'], { ...f.deps, readFile: () => ({ kind: 'bank', presets: bank }) })).toBe(1);
    expect(f.client.writePreset).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.error.mock.calls[0][0]).error).toMatch(/01B; 1 presets completed.*Verification failed/);
    expect(f.log).not.toHaveBeenCalled();
    expect(f.client.disconnect).toHaveBeenCalledOnce();
  });
});


describe('CLI error integrity', () => {
  it('keeps the command error when closing the transport also fails', async () => {
    const f = fixture();
    f.client.ping.mockRejectedValueOnce(new Error('Original timeout'));
    f.client.disconnect.mockRejectedValueOnce(new Error('Close failure'));
    expect(await f.run(['--json', 'ping'])).toBe(1);
    expect(JSON.parse(f.error.mock.calls[0][0])).toEqual({ error: 'Original timeout' });
  });
  it('formats parser errors as one JSON error', async () => {
    const f = fixture();
    expect(await f.run(['--json', '--timeout', 'oops', 'status'])).toBe(1);
    expect(f.error).toHaveBeenCalledOnce();
    expect(JSON.parse(f.error.mock.calls[0][0]).error).toMatch(/Timeout/);
    expect(f.deps.clientFactory).not.toHaveBeenCalled();
  });
  it('lists ports without opening a connection', async () => {
    const f = fixture();
    expect(await f.run(['--json', 'ports'])).toBe(0);
    expect(f.client.connect).not.toHaveBeenCalled();
    expect(JSON.parse(f.log.mock.calls[0][0])).toEqual({ inputs: [], outputs: [] });
    expect(f.client.disconnect).toHaveBeenCalledOnce();
  });
});
