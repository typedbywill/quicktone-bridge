import { Command, InvalidArgumentError, CommanderError } from 'commander';
import type { NuxMG30Client, NuxClientOptions } from '../client/NuxMG30Client.js';
import type { BlockType, PatchData, PresetData } from '../types.js';
import { BLOCK_LIST, NUX_MODEL_CATALOG, NUX_BLOCK_PARAM_CATALOG, blockTypeToId, idToBlockType, presetNameToProgramChange, programChangeToPresetName, findBlockParam, findModel } from '../constants.js';
import { readPresetFile, writePresetFile } from './files.js';

export interface CliDependencies {
  clientFactory?: (options: NuxClientOptions) => NuxMG30Client | Promise<NuxMG30Client>;
  readFile?: typeof readPresetFile;
  writeFile?: typeof writePresetFile;
  log?: (text: string) => void;
  error?: (text: string) => void;
}
function number(text: string, min: number, max: number, label: string): number {
  const value = Number(text);
  if (!text.trim() || !Number.isInteger(value) || value < min || value > max) throw new InvalidArgumentError(`${label}: expected an integer ${min}..${max}.`);
  return value;
}
function pc(id: string): number {
  return /^\d+$/.test(id) ? number(id, 0, 127, 'Preset') : presetNameToProgramChange(id);
}
function block(id: string): BlockType { return idToBlockType(blockTypeToId(/^\d+$/.test(id) ? Number(id) : id)); }
function scene(id: string): number { return number(id, 1, 3, 'Scene'); }
function name(text: string): string {
  if (!text.length || text.length > 16 || /[^\x20-\x7e]/.test(text)) throw new Error('Preset names use 1..16 printable ASCII characters.');
  return text;
}
const sceneView = (patch: PatchData) => ({ scene: patch.scene, name: patch.userPatchName ?? '', bpm: patch.bpm, chain: patch.signalChain, blocks: Object.fromEntries(BLOCK_LIST.map(b => [b, patch.blocks[b]])) });
const presetView = (preset: PresetData) => ({ preset: programChangeToPresetName(preset.index).name, index: preset.index, scenes: preset.scenes.map(sceneView) });

export function createProgram(deps: CliDependencies = {}): Command {
  const program = new Command().name('nux').description('NUX MG-30: live editing, verified preset writes and complete three-scene backups.').version('1.0.0');
  program.option('--input <name-or-index>', 'MIDI input port').option('--output <name-or-index>', 'MIDI output port')
    .option('--timeout <ms>', 'Response timeout', s => number(s, 1, 120000, 'Timeout'), 3000).option('--json', 'Machine-readable JSON output');
  const print = (data: unknown) => {
    const output = typeof data === 'string' && !program.opts().json ? data : JSON.stringify(data, (_key, v) => v instanceof Uint8Array ? Array.from(v) : v, program.opts().json ? undefined : 2);
    (deps.log ?? console.log)(output);
  };
  const read = deps.readFile ?? readPresetFile, write = deps.writeFile ?? writePresetFile;
  const withClient = async <T>(fn: (client: NuxMG30Client) => Promise<T>, synchronize = true): Promise<T> => {
    const opts = program.opts();
    const port = (v?: string) => v !== undefined && /^\d+$/.test(v) ? Number(v) : v;
    const options: NuxClientOptions = { inputPortName: port(opts.input), outputPortName: port(opts.output), timeoutMs: opts.timeout, synchronizeOnConnect: synchronize };
    const factory = deps.clientFactory ?? (async options => { const { NuxMG30Client } = await import('../client/NuxMG30Client.js'); return new NuxMG30Client(options); });
    const client = await factory(options);
    let failed = false;
    try { await client.connect(); return await fn(client); }
    catch (error) { failed = true; throw error; }
    finally { try { await client.disconnect(); } catch (error) { if (!failed) throw error; } }
  };
  const saveIfRequested = async (client: NuxMG30Client, cmd: Command) => { if (cmd.opts().save) await client.savePatch(); };
  const edited = (cmd: Command) => print({ edited: true, saved: Boolean(cmd.opts().save) });
  const current = (client: NuxMG30Client) => client.requestPatchDump();

  program.command('ports').description('List MIDI port names and indices without opening a device').action(async () => {
    const factory = deps.clientFactory ?? (async options => { const { NuxMG30Client } = await import('../client/NuxMG30Client.js'); return new NuxMG30Client(options); });
    const client = await factory({ synchronizeOnConnect: false });
    try { print({ inputs: client.listInputPorts(), outputs: client.listOutputPorts() }); }
    finally { await client.disconnect(); }
  });
  program.command('version').description('Show CLI version').action(() => print({ version: program.version() }));
  program.command('ping').description('Measure an actual round-trip response').action(async () => {
    await withClient(async client => print({ connected: true, roundTripMs: await client.ping() }), false);
  });
  for (const command of ['status', 'info', 'connect', 'doctor']) {
    program.command(command).description(command === 'connect' ? 'Open, synchronize and close the connection' : 'Read device state and MIDI port information').action(async () => {
      await withClient(async client => print({ connected: true, preset: client.getActivePresetInfo(), scene: client.getActiveSceneIndex() + 1, inputs: client.listInputPorts(), outputs: client.listOutputPorts(), ...(command === 'doctor' ? { node: process.version, platform: process.platform } : {}) }));
    });
  }
  program.command('disconnect').description('Explain per-command connection lifecycle').action(() => print('Each command closes its MIDI ports on completion; there is no background MIDI session.'));
  program.command('sync').description('Read live state and every scene in the active edit buffer').action(async () => {
    await withClient(async client => print(presetView(await client.readPreset(client.getActivePresetIndex(), 'current'))));
  });
  program.command('dump').description('Read one complete raw scene payload').option('--scene <id>', 'Scene 1..3', s => scene(s)).action(async (_opts, cmd: Command) => {
    await withClient(async client => {
      const patch = await client.requestPatchDump(undefined, cmd.opts().scene === undefined ? client.getActiveSceneIndex() : cmd.opts().scene - 1);
      print({ preset: patch.presetName, scene: patch.scene, payloadBytes: patch.raw.length, dumpHex: Buffer.from(patch.raw).toString('hex') });
    });
  });
  program.command('logs').description('Stream actual MIDI traffic (Ctrl+C to close)').action(async () => {
    await withClient(async client => {
      const log = (direction: string, bytes: Uint8Array) => print({ direction, hex: Buffer.from(bytes).toString('hex') });
      client.on('midiSent', b => log('tx', b)); client.on('midiReceived', b => log('rx', b));
      await new Promise<void>(resolve => {
        const stop = () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); resolve(); };
        process.once('SIGINT', stop); process.once('SIGTERM', stop);
      });
    });
  });

  const presets = program.command('preset').description('Presets 01A..32D (numeric indices are zero based)');
  presets.command('list').description('Read names from saved presets without recalling them').option('--from <id>', 'Starting preset', '01A').option('--limit <n>', 'Number of presets', s => number(s, 1, 128, 'Limit'), 128)
    .action(async (_opts, cmd: Command) => {
      const start = pc(cmd.opts().from), end = Math.min(128, start + cmd.opts().limit);
      await withClient(async client => {
        const list = [];
        for (let i = start; i < end; i++) { const patch = await client.requestSavedScene(i, 0); list.push({ index: i, slot: programChangeToPresetName(i).name, name: patch.userPatchName ?? '' }); }
        print(list);
      });
    });
  presets.command('show <id>').description('Read all three saved scenes').action(async (id: string) => {
    const index = pc(id); await withClient(async c => print(presetView(await c.readPreset(index))));
  });
  presets.command('load <id>').description('Recall a preset and confirm live state').action(async (id: string) => {
    const index = pc(id); await withClient(async c => { const state = await c.loadPreset(index); print({ preset: programChangeToPresetName(state.preset).name, scene: state.sceneIndex + 1 }); });
  });
  for (const [direction, delta] of [['up', 1], ['down', -1]] as const) {
    presets.command(direction).description('Navigate from the hardware preset, with wraparound').action(async () => {
      await withClient(async c => { const index = (c.getActivePresetIndex() + delta + 128) % 128; await c.loadPreset(index); print({ preset: c.getActivePresetInfo().name }); });
    });
  }
  presets.command('save [id]').description('Save all three current scenes, verify each saved scene').action(async (id?: string) => {
    const destination = id === undefined ? undefined : pc(id);
    await withClient(async c => { await c.savePatch(destination); print({ saved: true, preset: programChangeToPresetName(destination ?? c.getActivePresetIndex()).name, scenes: 3 }); });
  });
  presets.command('rename <id> <name...>').description('Recall, rename all three scenes and save the preset').action(async (id: string, parts: string[]) => {
    const index = pc(id), newName = name(parts.join(' '));
    await withClient(async c => { await c.loadPreset(index); await c.setPresetName(newName); await c.savePatch(index); print({ preset: programChangeToPresetName(index).name, name: newName, saved: true }); });
  });
  presets.command('clone <source> <destination>').description('Copy all saved scenes, with write verification').action(async (source: string, destination: string) => {
    const from = pc(source), to = pc(destination); if (from === to) throw new Error('Source and destination must differ.');
    await withClient(async c => { await c.clonePreset(from, to); print({ source: programChangeToPresetName(from).name, destination: programChangeToPresetName(to).name, saved: true }); });
  });
  presets.command('delete <id>').description('Save a bypass baseline for every scene (not a factory preset)').option('--keep-amp-cab', 'Preserve AMP and IR enabled states').action(async (id: string, _opts, cmd: Command) => {
    const index = pc(id); await withClient(async c => { await c.clearPreset(index, { keepAmpCab: cmd.opts().keepAmpCab }); print({ preset: programChangeToPresetName(index).name, baseline: 'bypass', saved: true }); });
  });

  const exportPreset = async (id: string, filename: string, cmd: Command) => {
    const index = pc(id);
    await withClient(async c => { const snapshot = await c.readPreset(index, cmd.opts().current ? 'current' : 'saved'); write(filename, [snapshot], 'preset', Boolean(cmd.opts().force)); print({ exported: filename, preset: programChangeToPresetName(index).name, scenes: 3 }); });
  };
  const backupBank = async (filename: string, cmd: Command) => {
    await withClient(async c => {
      const bank: PresetData[] = [];
      for (let i = 0; i < 128; i++) {
        bank.push(await c.readPreset(i));
        if (!program.opts().json) (deps.error ?? console.error)(`Reading presets ${i + 1}/128`);
      }
      write(filename, bank, 'bank', Boolean(cmd.opts().force));
      print({ exported: filename, presets: 128, scenes: 384, includesIrSamples: false });
    });
  };
  const importFile = async (filename: string, cmd: Command, requiredKind?: 'preset' | 'bank') => {
    const data = read(filename); // Full schema and checksum validation BEFORE connecting.
    if (requiredKind && data.kind !== requiredKind) throw new Error(`Expected a ${requiredKind} file.`);
    const to = cmd.opts().to === undefined ? undefined : pc(cmd.opts().to);
    if (to !== undefined && data.kind === 'bank') throw new Error('--to applies to a single preset file.');
    if (cmd.opts().dryRun) { print({ valid: true, kind: data.kind, destinations: data.presets.map(p => to ?? p.index), scenes: data.presets.length * 3 }); return; }
    await withClient(async c => {
      let count = 0;
      for (const preset of data.presets) {
        const destination = to ?? preset.index;
        try { await c.writePreset(preset, destination); }
        catch (error) { throw new Error(`Restore stopped at ${programChangeToPresetName(destination).name}; ${count} presets completed. ${String(error)}`); }
        count++;
      }
      print({ restored: true, presets: count, scenes: count * 3 });
    });
  };
  const exportOptions = (cmd: Command) => cmd.option('--force', 'Replace an existing export file').option('--current', 'Export the active edit buffer instead of saved data');
  const importOptions = (cmd: Command) => cmd.option('--to <id>', 'Destination for one preset').option('--dry-run', 'Validate complete file without opening MIDI');
  exportOptions(presets.command('export <id> [file]').description('Export a complete preset (.json or three-frame .syx)')).action(async (id: string, filename: string | undefined, _opts, cmd: Command) => exportPreset(id, filename ?? `${programChangeToPresetName(pc(id)).name}.json`, cmd));
  importOptions(presets.command('import <file>').description('Import a complete preset')).action(async (filename: string, _opts, cmd: Command) => importFile(filename, cmd, 'preset'));
  presets.command('backup [file]').description('Back up 128 saved presets / 384 scenes (IR samples excluded)').option('--force', 'Replace existing file').action(async (filename: string | undefined, _opts, cmd: Command) => backupBank(filename ?? `nux-backup-${Date.now()}.json`, cmd));
  importOptions(presets.command('restore <file>').description('Restore a validated bank or preset')).action(async (filename: string, _opts, cmd: Command) => importFile(filename, cmd));
  const exports = program.command('export').description('Export presets and banks');
  exportOptions(exports.command('preset <id> <file>')).action(async (id: string, filename: string, _opts, cmd: Command) => exportPreset(id, filename, cmd));
  exports.command('bank <file>').option('--force', 'Replace existing file').action(async (filename: string, _opts, cmd: Command) => backupBank(filename, cmd));
  const imports = program.command('import').description('Import validated presets and banks');
  importOptions(imports.command('preset <file>')).action(async (filename: string, _opts, cmd: Command) => importFile(filename, cmd, 'preset'));
  importOptions(imports.command('bank <file>')).action(async (filename: string, _opts, cmd: Command) => importFile(filename, cmd, 'bank'));

  const scenes = program.command('scene').description('Live scenes; edits persist only with preset save or --save');
  scenes.command('list').action(async () => withClient(async c => print({ active: c.getActiveSceneIndex() + 1, scenes: (await c.readPreset(c.getActivePresetIndex(), 'current')).scenes.map(sceneView) })));
  scenes.command('show [id]').action(async (id?: string) => {
    const index = id === undefined ? undefined : scene(id) - 1; await withClient(async c => print(sceneView(await c.requestPatchDump(undefined, index ?? c.getActiveSceneIndex()))));
  });
  const select = async (id: number) => withClient(async c => { await c.selectSceneVerified(id); print({ scene: id, confirmed: true }); });
  scenes.command('select <id>').action(async (id: string) => select(scene(id)));
  for (const id of [1, 2, 3]) scenes.command(String(id)).action(async () => select(id));
  for (const [direction, delta] of [['up', 1], ['down', -1]] as const) scenes.command(direction).action(async () => {
    await withClient(async c => { const next = (c.getActiveSceneIndex() + delta + 3) % 3 + 1; await c.selectSceneVerified(next); print({ scene: next, confirmed: true }); });
  });
  scenes.command('clone <source> <destination>').description('Copy the complete live scene, including models and knobs').option('--save', 'Save all current scenes after editing').action(async (source: string, destination: string, _opts, cmd: Command) => {
    const from = scene(source), to = scene(destination); if (from === to) throw new Error('Source and destination must differ.');
    await withClient(async c => { await c.cloneScene(from, to); await saveIfRequested(c, cmd); edited(cmd); });
  });
  scenes.command('reset <id>').description('Bypass effects in one live scene, preserving parameter bytes').option('--save', 'Save all current scenes').action(async (id: string, _opts, cmd: Command) => {
    const target = scene(id); await withClient(async c => { await c.resetScene(target); await saveIfRequested(c, cmd); edited(cmd); });
  });

  const blocks = program.command('block').description('Effect blocks (CAB is an alias for IR)').argument('[id]').argument('[state]').action(async (id?: string, state?: string) => {
    if (id === undefined) { print(BLOCK_LIST); return; }
    const b = block(id);
    if (state !== undefined && !['on', 'off'].includes(state.toLowerCase())) throw new Error('Block state must be on or off.');
    await withClient(async c => { if (state === undefined) print((await current(c)).blocks[b]); else { await c.setBlockState(b, state.toLowerCase() === 'on'); print({ block: b, enabled: state.toLowerCase() === 'on', saved: false }); } });
  });
  blocks.command('list').description('List the local model catalog').action(() => print(Object.fromEntries(BLOCK_LIST.map(b => [b, NUX_MODEL_CATALOG[b]]))));
  blocks.command('show <id>').action(async (id: string) => { const b = block(id); await withClient(async c => print((await current(c)).blocks[b])); });
  blocks.command('state <id> [value]').option('--save', 'Save after editing').action(async (id: string, value: string | undefined, _opts, cmd: Command) => {
    const b = block(id); if (value !== undefined && !['on', 'off'].includes(value.toLowerCase())) throw new Error('State must be on or off.');
    await withClient(async c => { if (value === undefined) print({ block: b, enabled: (await current(c)).blocks[b].enabled }); else { await c.setBlockState(b, value.toLowerCase() === 'on'); await saveIfRequested(c, cmd); edited(cmd); } });
  });
  for (const action of ['enable', 'disable', 'toggle']) blocks.command(`${action} <id>`).option('--save', 'Save after editing').action(async (id: string, _opts, cmd: Command) => {
    const b = block(id); await withClient(async c => { const enabled = action === 'toggle' ? !(await current(c)).blocks[b].enabled : action === 'enable'; await c.setBlockState(b, enabled); await saveIfRequested(c, cmd); print({ block: b, enabled, saved: Boolean(cmd.opts().save) }); });
  });
  blocks.command('model <id> [selector]').description('List or select a model; names are catalog labels').option('--save', 'Save after editing').action(async (id: string, selector: string | undefined, _opts, cmd: Command) => {
    const b = block(id); if (selector === undefined) { print(NUX_MODEL_CATALOG[b]); return; }
    const model = findModel(b, selector); await withClient(async c => { await c.setModel(b, model.id); await saveIfRequested(c, cmd); print({ block: b, model, saved: Boolean(cmd.opts().save) }); });
  });
  blocks.command('reset <id>').description('Select model zero; does not invent model-specific defaults').option('--save', 'Save after editing').action(async (id: string, _opts, cmd: Command) => {
    const b = block(id); await withClient(async c => { await c.setModel(b, 0); await saveIfRequested(c, cmd); edited(cmd); });
  });
  const registerParameters = (parent: Command) => {
    parent.command('params [id]').description('List slot labels; exact labels depend on the loaded model').action((id?: string) => print(id ? NUX_BLOCK_PARAM_CATALOG[block(id)] : NUX_BLOCK_PARAM_CATALOG));
    parent.command('get <block-or-param> [param]').action(async (first: string, second?: string) => {
      const p = findBlockParam(first, second); await withClient(async c => print({ ...p, value: (await current(c)).blocks[p.block].params[p.paramId] }));
    });
    parent.command('set <block-or-param> <param-or-value> [value]').option('--raw', 'Raw byte 0..255 instead of 0..100').option('--save', 'Save after editing').action(async (first: string, second: string, third: string | undefined, _opts, cmd: Command) => {
      const p = third === undefined ? findBlockParam(first) : findBlockParam(first, second), value = number(third ?? second, 0, cmd.opts().raw ? 255 : 100, 'Parameter value');
      await withClient(async c => { if (cmd.opts().raw) await c.setParameterByte(p.block, p.paramId, value); else await c.setParameter(p.block, p.paramId, value); await saveIfRequested(c, cmd); print({ ...p, value, saved: Boolean(cmd.opts().save) }); });
    });
    for (const [action, value] of [['min', 0], ['max', 100]] as const) parent.command(`${action} <block-or-param> [param]`).option('--save', 'Save after editing').action(async (first: string, second: string | undefined, _opts, cmd: Command) => {
      const p = findBlockParam(first, second); await withClient(async c => { await c.setParameter(p.block, p.paramId, value); await saveIfRequested(c, cmd); print({ ...p, value, saved: Boolean(cmd.opts().save) }); });
    });
  };
  registerParameters(blocks);
  const params = program.command('param').description('Alias for block parameter commands'); registerParameters(params);
  params.command('show <block-or-param> [param]').action(async (first: string, second?: string) => {
    const p = findBlockParam(first, second); await withClient(async c => print({ ...p, value: (await current(c)).blocks[p.block].params[p.paramId] }));
  });
  program.command('tempo [bpm]').description('Read or edit tempo (40..240 BPM)').option('--save', 'Save after editing').action(async (bpm: string | undefined, _opts, cmd: Command) => {
    const value = bpm === undefined ? undefined : number(bpm, 40, 240, 'Tempo');
    await withClient(async c => { if (value === undefined) print({ bpm: (await current(c)).bpm }); else { await c.setTempo(value); await saveIfRequested(c, cmd); print({ bpm: value, saved: Boolean(cmd.opts().save) }); } });
  });
  const chain = program.command('chain').description('Read and edit signal order while preserving routing flags');
  chain.command('show').action(async () => withClient(async c => print(await c.requestSignalChain())));
  chain.command('reset').option('--save', 'Save after editing').action(async (_opts, cmd: Command) => {
    await withClient(async c => { await c.setSignalChain([...BLOCK_LIST]); await saveIfRequested(c, cmd); edited(cmd); });
  });
  for (const action of ['move', 'swap']) chain.command(`${action} <source> <destination>`).description(action === 'move' ? 'Move source immediately before destination' : 'Swap two blocks').option('--save', 'Save after editing').action(async (source: string, destination: string, _opts, cmd: Command) => {
    const from = block(source), to = block(destination); if (from === to) throw new Error('Choose two different blocks.');
    await withClient(async c => {
      const order = [...(await c.requestSignalChain()).blocks], first = order.indexOf(from), second = order.indexOf(to);
      if (action === 'swap') [order[first], order[second]] = [order[second], order[first]];
      else { order.splice(first, 1); order.splice(order.indexOf(to), 0, from); }
      await c.setSignalChain(order); await saveIfRequested(c, cmd); print({ blocks: order, saved: Boolean(cmd.opts().save) });
    });
  });
  const device = program.command('device').description('Information returned by the hardware');
  device.command('info').action(async () => withClient(async c => print(await c.requestDeviceInfo())));
  device.command('firmware').action(async () => withClient(async c => print({ firmware: (await c.requestDeviceInfo()).firmware })));
  device.command('reboot').description('Unavailable: no verified reboot command for MG-30').action(() => { throw new Error('No verified MG-30 reboot operation is available. Power-cycle the device manually.'); });
  return program;
}

export async function runCli(argv: string[], deps: CliDependencies = {}): Promise<number> {
  const program = createProgram(deps).exitOverride().configureOutput({ writeErr: () => {} });
  try { await program.parseAsync(argv, { from: 'user' }); return 0; }
  catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) return 0;
    const message = error instanceof Error ? error.message : String(error);
    (deps.error ?? console.error)(program.opts().json ? JSON.stringify({ error: message }) : `Error: ${message}`);
    return 1;
  }
}
