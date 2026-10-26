import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createPresetFile, parsePresetFile, parsePresetSysEx, readPresetFile, writePresetFile } from '../src/cli/files.js';
import { PatchDecoder } from '../src/patch/PatchDecoder.js';
import { packNuxPayload, unpackNuxPayload } from '../src/protocol/nuxEncoding.js';
import { SysExEncoder } from '../src/protocol/SysExEncoder.js';
import type { PresetData } from '../src/types.js';

function preset(index = 7): PresetData {
  const scenes = [0, 1, 2].map(scene => {
    const body = new Uint8Array(142);
    body.fill(0x40, 0, 12);
    body[28] = 210 + scene;
    body[92] = 98 + scene;
    body.set([5, 0, 1, 2, 3, 9, 4, 10, 6, 7, 8, 11], 94);
    body.set(Buffer.from(`Scene ${scene + 1}`), 106);
    body.set([0xff, scene, 0x80, 0x01], 138);
    return PatchDecoder.decode(Uint8Array.from([index, scene, ...packNuxPayload(body)]));
  });
  return { index, scenes: scenes as PresetData['scenes'] };
}
const directories: string[] = [];
function file(extension: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nux-files-test-'));
  directories.push(directory);
  return path.join(directory, `preset${extension}`);
}
afterEach(() => { for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });

describe('complete preset files', () => {
  it.each(['.json', '.syx'])('round-trips all three distinct scenes and opaque bytes through %s', extension => {
    const source = preset(76), filename = file(extension);
    writePresetFile(filename, [source], 'preset');
    const restored = readPresetFile(filename);
    expect(restored.kind).toBe('preset');
    expect(restored.presets).toHaveLength(1);
    expect(restored.presets[0].index).toBe(76);
    for (let i = 0; i < 3; i++) expect(restored.presets[0].scenes[i].raw).toEqual(source.scenes[i].raw);
    if (extension === '.syx') {
      const bytes = fs.readFileSync(filename);
      expect(Array.from(bytes.subarray(0, 8))).toEqual([0xf0, 0x43, 0x58, 0x70, 0x0b, 1, 76, 0]);
      expect(bytes.filter(b => b === 0xf7)).toHaveLength(3);
    }
  });

  it('round-trips a full bank and retains each destination index', () => {
    const filename = file('.json'), bank = Array.from({ length: 128 }, (_, index) => preset(index));
    writePresetFile(filename, bank, 'bank');
    const result = readPresetFile(filename);
    expect(result.kind).toBe('bank');
    expect(result.presets.map(p => p.index)).toEqual(Array.from({ length: 128 }, (_, i) => i));
    expect(result.presets[127].scenes[2].raw).toEqual(bank[127].scenes[2].raw);
  });

  it('sorts scenes by index rather than trusting the JSON array order', () => {
    const data = createPresetFile([preset()], 'preset');
    data.presets[0].scenes.reverse();
    const result = parsePresetFile(data);
    expect(result.presets[0].scenes.map(s => s.scene)).toEqual([1, 2, 3]);
    expect(result.presets[0].scenes.map(s => s.userPatchName)).toEqual(['Scene 1', 'Scene 2', 'Scene 3']);
  });

  it('rejects tampered scene bytes even if they still decode', () => {
    const data = createPresetFile([preset()], 'preset');
    const scene = data.presets[0].scenes[1];
    scene.bodyHex = scene.bodyHex.slice(0, -2) + 'ff';
    expect(() => parsePresetFile(data)).toThrow(/Checksum mismatch.*scene 2/);
  });

  it('rejects structurally corrupt scenes even when the checksum is recomputed', () => {
    const data = createPresetFile([preset()], 'preset'), scene = data.presets[0].scenes[0];
    const body = Buffer.from(scene.bodyHex, 'hex');
    body[94] = body[95];
    scene.bodyHex = body.toString('hex');
    scene.sha256 = createHash('sha256').update(body).digest('hex');
    expect(() => parsePresetFile(data)).toThrow(/signal chain/);
  });

  it('rejects missing scenes, duplicate scenes, incomplete banks and duplicate preset slots', () => {
    const data = createPresetFile([preset()], 'preset');
    const missing = structuredClone(data); missing.presets[0].scenes.pop();
    expect(() => parsePresetFile(missing)).toThrow(/Invalid or incomplete/);
    const duplicate = structuredClone(data); duplicate.presets[0].scenes[2].sceneIndex = 0;
    expect(() => parsePresetFile(duplicate)).toThrow(/exactly once/);
    expect(() => parsePresetFile({ ...data, kind: 'bank' })).toThrow(/128 complete presets/);
    const bank = createPresetFile(Array.from({ length: 128 }, (_, i) => preset(i)), 'bank');
    bank.presets[127].index = 0;
    expect(() => parsePresetFile(bank)).toThrow(/Duplicate preset indices/);
  });

  it('rejects old metadata-only pseudo backups and malformed JSON', () => {
    expect(() => parsePresetFile({ count: 128, bank: 'ALL' })).toThrow(/Invalid or incomplete/);
    const filename = file('.json'); fs.writeFileSync(filename, '{');
    expect(() => readPresetFile(filename)).toThrow(/Cannot parse preset JSON/);
  });

  it('refuses to overwrite an existing backup unless requested and cleans temporary files', () => {
    const filename = file('.json');
    writePresetFile(filename, [preset(1)], 'preset');
    const original = fs.readFileSync(filename);
    expect(() => writePresetFile(filename, [preset(2)], 'preset')).toThrow();
    expect(fs.readFileSync(filename)).toEqual(original);
    expect(fs.readdirSync(path.dirname(filename))).toEqual(['preset.json']);
    writePresetFile(filename, [preset(2)], 'preset', true);
    expect(readPresetFile(filename).presets[0].index).toBe(2);
  });

  it('keeps an existing backup intact when replacement data fails validation', () => {
    const filename = file('.json'); writePresetFile(filename, [preset()], 'preset');
    const original = fs.readFileSync(filename), invalid = preset();
    invalid.scenes[0].raw = new Uint8Array(0);
    expect(() => writePresetFile(filename, [invalid], 'preset', true)).toThrow();
    expect(fs.readFileSync(filename)).toEqual(original);
  });

  it('rejects unsupported output extensions and bank SysEx exports', () => {
    expect(() => writePresetFile(file('.mg30patch'), [preset()], 'preset')).toThrow(/different format/);
    expect(() => writePresetFile(file('.syx'), Array.from({ length: 128 }, (_, i) => preset(i)), 'bank')).toThrow(/Bank files use JSON/);
  });

  it('rejects truncated, mixed-preset and duplicate-scene SysEx streams', () => {
    const source = preset(), frames = source.scenes.map(s => SysExEncoder.buildSceneDataSet(source.index, s.scene - 1, packNuxPayload(unpackNuxPayload(s.raw.slice(2)))));
    const join = (items: Uint8Array[]) => Uint8Array.from(items.flatMap(a => Array.from(a)));
    expect(() => parsePresetSysEx(join(frames).slice(0, -1))).toThrow(/exactly three complete/);
    expect(() => parsePresetSysEx(join([frames[0], frames[0], frames[2]]))).toThrow(/cover all three/);
    const mixed = Uint8Array.from(frames[2]); mixed[6] = source.index + 1;
    expect(() => parsePresetSysEx(join([frames[0], frames[1], mixed]))).toThrow(/belong to one preset/);
  });
});
