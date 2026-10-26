import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PresetData } from '../types.js';
import { PatchDecoder } from '../patch/PatchDecoder.js';
import { unpackNuxPayload, packNuxPayload } from '../protocol/nuxEncoding.js';
import { SysExDecoder } from '../protocol/SysExDecoder.js';
import { SysExEncoder } from '../protocol/SysExEncoder.js';

const sceneSchema = z.object({ sceneIndex: z.number().int().min(0).max(2), bodyHex: z.string().regex(/^[0-9a-fA-F]{284}$/), sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
const presetSchema = z.object({ index: z.number().int().min(0).max(127), scenes: z.array(sceneSchema).length(3) }).strict();
const fileSchema = z.object({
  format: z.literal('quicktone-bridge'), version: z.literal(1), device: z.literal('NUX MG-30'),
  kind: z.enum(['preset', 'bank']), createdAt: z.string().datetime(),
  presets: z.array(presetSchema).min(1).max(128),
}).strict();
export type PresetFile = z.infer<typeof fileSchema>;
const digest = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');

export function createPresetFile(presets: PresetData[], kind: 'preset' | 'bank'): PresetFile {
  const file: PresetFile = {
    format: 'quicktone-bridge', version: 1, device: 'NUX MG-30', kind, createdAt: new Date().toISOString(),
    presets: presets.map(preset => ({ index: preset.index, scenes: preset.scenes.map(scene => {
      PatchDecoder.decode(scene.raw);
      const body = scene.raw.length === 215 ? unpackNuxPayload(scene.raw.slice(2)) : scene.raw;
      PatchDecoder.decode(body);
      return { sceneIndex: scene.scene - 1, bodyHex: Buffer.from(body).toString('hex'), sha256: digest(body) };
    }) })),
  };
  parsePresetFile(file); return file;
}
/** Validate the entire file, all scenes and checksums, before any MIDI write. */
export function parsePresetFile(input: unknown): { file: PresetFile; presets: PresetData[] } {
  const result = fileSchema.safeParse(input);
  if (!result.success) throw new Error(`Invalid or incomplete preset file: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const file = result.data;
  if (file.presets.length !== (file.kind === 'bank' ? 128 : 1)) throw new Error(`${file.kind} file must contain ${file.kind === 'bank' ? 128 : 1} complete presets.`);
  if (new Set(file.presets.map(p => p.index)).size !== file.presets.length) throw new Error('Duplicate preset indices in file.');
  const presets: PresetData[] = file.presets.map(preset => {
    if (new Set(preset.scenes.map(s => s.sceneIndex)).size !== 3) throw new Error(`Preset ${preset.index} must contain scenes 0, 1 and 2 exactly once.`);
    const scenes = [...preset.scenes].sort((a, b) => a.sceneIndex - b.sceneIndex).map(scene => {
      const body = Uint8Array.from(Buffer.from(scene.bodyHex, 'hex'));
      if (digest(body) !== scene.sha256) throw new Error(`Checksum mismatch in preset ${preset.index}, scene ${scene.sceneIndex + 1}.`);
      PatchDecoder.decode(body);
      return PatchDecoder.decode(Uint8Array.from([preset.index, scene.sceneIndex, ...packNuxPayload(body)]));
    });
    return { index: preset.index, scenes: scenes as PresetData['scenes'] };
  });
  return { file, presets };
}
export function parsePresetSysEx(bytes: Uint8Array): PresetData {
  const packets: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0xf7) { packets.push(bytes.slice(start, i + 1)); start = i + 1; }
  if (start !== bytes.length || packets.length !== 3) throw new Error('Preset SysEx must contain exactly three complete scene frames.');
  const scenes = packets.map(bytes => {
    const packet = SysExDecoder.parseSysEx(bytes);
    if (!packet || ![0x0b, 0x0c].includes(packet.command) || ![1, 2].includes(packet.direction)) throw new Error('SysEx file contains an unsupported command or operation.');
    return PatchDecoder.decode(packet.payload);
  }).sort((a, b) => a.scene - b.scene);
  if (new Set(scenes.map(s => s.scene)).size !== 3 || new Set(scenes.map(s => s.raw[0])).size !== 1) throw new Error('SysEx scenes must belong to one preset and cover all three scenes.');
  return { index: scenes[0].raw[0], scenes: scenes as PresetData['scenes'] };
}
export function readPresetFile(filename: string): { kind: 'preset' | 'bank'; presets: PresetData[] } {
  const content = fs.readFileSync(path.resolve(filename));
  if (path.extname(filename).toLowerCase() === '.syx') return { kind: 'preset', presets: [parsePresetSysEx(content)] };
  let input: unknown;
  try { input = JSON.parse(content.toString('utf8')); } catch { throw new Error('Cannot parse preset JSON file.'); }
  const result = parsePresetFile(input); return { kind: result.file.kind, presets: result.presets };
}
/** Atomic publication; a failed read/validation never replaces an existing backup. */
export function writePresetFile(filename: string, presets: PresetData[], kind: 'preset' | 'bank', overwrite = false): void {
  const file = createPresetFile(presets, kind), target = path.resolve(filename), extension = path.extname(filename).toLowerCase();
  let data: Uint8Array | string;
  if (extension === '.syx') {
    if (kind !== 'preset') throw new Error('Bank files use JSON; .syx exports contain one complete preset.');
    data = Uint8Array.from(file.presets[0].scenes.flatMap(scene => Array.from(SysExEncoder.buildSceneDataSet(file.presets[0].index, scene.sceneIndex, packNuxPayload(Buffer.from(scene.bodyHex, 'hex'))))));
  } else if (extension === '.json') data = JSON.stringify(file, null, 2) + '\n';
  else throw new Error('Use .json or .syx. Native QuickTone .mg30patch files are a different format.');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, data, { flag: 'wx' });
    if (overwrite) fs.renameSync(temporary, target);
    else { fs.linkSync(temporary, target); fs.unlinkSync(temporary); }
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
