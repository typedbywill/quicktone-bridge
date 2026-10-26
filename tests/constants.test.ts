import { describe, it, expect } from 'vitest';
import {
  BLOCK_LIST,
  HARDWARE_BLOCK_LIST,
  blockTypeToId,
  idToBlockType,
  sceneModelOffset,
  sceneKnobOffset,
  paramToCc,
  PARAM_CC_MAP,
  NUX_MODEL_CATALOG,
  NUX_BLOCK_PARAM_CATALOG,
  findModel,
  getModelName,
  programChangeToPresetName,
  presetNameToProgramChange,
} from '../src/constants.js';

describe('Constants & Hardware Block Identity', () => {
  it('BLOCK_LIST and HARDWARE_BLOCK_LIST should contain exactly 12 hardware blocks', () => {
    expect(BLOCK_LIST.length).toBe(12);
    expect(HARDWARE_BLOCK_LIST.length).toBe(12);
    expect(BLOCK_LIST).toEqual([
      'WAH',
      'CMP',
      'EFX',
      'AMP',
      'EQ',
      'NG',
      'MOD',
      'DLY',
      'RVB',
      'IR',
      'SR',
      'VOL',
    ]);
    expect(BLOCK_LIST.includes('CAB' as any)).toBe(false);
  });

  it('blockTypeToId should map IR and CAB alias to index 9', () => {
    expect(blockTypeToId('IR')).toBe(9);
    expect(blockTypeToId('CAB')).toBe(9);
    expect(blockTypeToId('cab')).toBe(9);
    expect(blockTypeToId('ir')).toBe(9);
    expect(blockTypeToId('SR')).toBe(10);
    expect(blockTypeToId('S/R')).toBe(10);
    expect(blockTypeToId('VOL')).toBe(11);
    expect(blockTypeToId('WAH')).toBe(0);
    expect(blockTypeToId(9)).toBe(9);
    expect(blockTypeToId(0)).toBe(0);
    expect(blockTypeToId(11)).toBe(11);
  });

  it('blockTypeToId should validate integer ranges and reject invalid inputs', () => {
    expect(() => blockTypeToId(-1)).toThrow(/Invalid block ID/);
    expect(() => blockTypeToId(12)).toThrow(/Invalid block ID/);
    expect(() => blockTypeToId(2.5)).toThrow(/Invalid block ID/);
    expect(() => blockTypeToId(NaN)).toThrow(/Invalid block ID/);
    expect(() => blockTypeToId('UNKNOWN')).toThrow(/Unknown block name/);
  });

  it('idToBlockType should map index 9 to IR and validate integer limits', () => {
    expect(idToBlockType(0)).toBe('WAH');
    expect(idToBlockType(9)).toBe('IR');
    expect(idToBlockType(10)).toBe('SR');
    expect(idToBlockType(11)).toBe('VOL');

    expect(() => idToBlockType(-1)).toThrow(/Invalid block ID/);
    expect(() => idToBlockType(12)).toThrow(/Invalid block ID/);
    expect(() => idToBlockType(3.5)).toThrow(/Invalid block ID/);
  });

  it('sceneModelOffset and sceneKnobOffset should accept CAB alias to IR', () => {
    expect(sceneModelOffset('IR')).toBe(9);
    expect(sceneModelOffset('CAB')).toBe(9);

    const irKnob0 = sceneKnobOffset('IR', 0);
    const cabKnob0 = sceneKnobOffset('CAB', 0);
    expect(irKnob0).toBe(cabKnob0);

    const irKnob5 = sceneKnobOffset('IR', 5);
    const cabKnob5 = sceneKnobOffset('CAB', 5);
    expect(irKnob5).toBe(cabKnob5);

    // Range validation
    expect(() => sceneKnobOffset('IR', 6)).toThrow(/out of range/);
    expect(() => sceneKnobOffset('CAB', 6)).toThrow(/out of range/);
    expect(() => sceneKnobOffset('WAH', 2)).toThrow(/out of range/);
    expect(() => sceneKnobOffset('AMP', -1)).toThrow(/out of range/);
    expect(() => sceneKnobOffset('AMP', 1.5)).toThrow(/must be an integer/);
  });

  it('PARAM_CC_MAP and paramToCc should map CAB as alias to IR', () => {
    expect(PARAM_CC_MAP.CAB).not.toBeNull();
    expect(PARAM_CC_MAP.CAB).toEqual(PARAM_CC_MAP.IR);
    expect(PARAM_CC_MAP.CAB?.baseCc).toBe(66);
    expect(PARAM_CC_MAP.CAB?.maxKnobs).toBe(6);

    expect(paramToCc('CAB', 0)).toBe(66);
    expect(paramToCc('IR', 0)).toBe(66);
    expect(paramToCc('CAB', 5)).toBe(71);
    expect(paramToCc('IR', 5)).toBe(71);

    expect(paramToCc('CAB', 6)).toBeNull();
    expect(paramToCc('IR', -1)).toBeNull();
    expect(paramToCc('AMP', 1.5)).toBeNull();
  });

  it('uses the exact numbered MG-30 cabinet table and aliases CAB to IR', () => {
    expect(NUX_MODEL_CATALOG.IR).toHaveLength(24);
    expect(NUX_MODEL_CATALOG.CAB).toBe(NUX_MODEL_CATALOG.IR);
    expect(getModelName('IR', 0)).toBe('BYPASS');
    expect(getModelName('IR', 1)).toBe('JZ120');
    expect(getModelName('CAB', 6)).toBe('1960');
    expect(findModel('IR', 'GB412').id).toBe(7);
    expect(findModel('CAB', 'CANNABIS REX 12').id).toBe(10);
    expect(getModelName('IR', 23)).toBe('G-J15');
    expect(() => findModel('IR', 'USER')).toThrow(/não encontrado/);
    expect(() => findModel('IR', 'COLLECTION')).toThrow(/não encontrado/);
  });

  it('keeps every numbered model in the shipped MG-30 tables, with zero reserved for BYPASS', () => {
    const counts = { WAH: 5, CMP: 3, NG: 1, EFX: 20, AMP: 38, IR: 23, EQ: 4, SR: 1, VOL: 1, MOD: 15, DLY: 8, RVB: 6 };
    for (const [block, count] of Object.entries(counts)) {
      const models = NUX_MODEL_CATALOG[block as keyof typeof NUX_MODEL_CATALOG];
      expect(models.map(m => m.id)).toEqual(Array.from({ length: count + 1 }, (_, i) => i));
      expect(models[0].name).toBe('BYPASS');
    }
  });

  it('resolves the actual MG-30 amplifier IDs instead of the former invented catalog', () => {
    expect(findModel('AMP', 'PLEXI 100').id).toBe(10);
    expect(findModel('AMP', 'CLASS A15').id).toBe(8);
    expect(findModel('AMP', 'MATCH').id).toBe(23);
    expect(findModel('AMP', 'BRIT 2000').id).toBe(24);
    expect(findModel('AMP', 2).name).toBe('DELXUE RVB');
    expect(findModel('AMP', 36).name).toBe('DELUXE RVB');
    expect(getModelName('AMP', 63)).toBe('Model #63');
  });

  it('preserves duplicate shipped labels and requires a numeric ID to disambiguate them', () => {
    expect(() => findModel('AMP', 'CLASS A30')).toThrow(/ambíguo/);
    expect(() => findModel('AMP', 'FIREMAN HBE')).toThrow(/ambíguo/);
    expect(findModel('AMP', 9).name).toBe('CLASS A30');
    expect(findModel('AMP', 37).name).toBe('CLASS A30');
    expect(findModel('AMP', 15).name).toBe('FIREMAN HBE');
    expect(findModel('AMP', 38).name).toBe('FIREMAN HBE');
  });

  it('resolves the actual MG-30 effects, modulation, delay and reverb numbering', () => {
    expect(findModel('EFX', 'RED FUZZ').id).toBe(14);
    expect(findModel('EFX', 'DISTORTION+').id).toBe(1);
    expect(findModel('EFX', 'TOUCH WAH').id).toBe(15);
    expect(findModel('WAH', 'OCTAVE-SHIFT').id).toBe(5);
    expect(findModel('MOD', 'U-VIBE').id).toBe(10);
    expect(findModel('DLY', 'DUOTIME').id).toBe(7);
    expect(findModel('RVB', 'ROOM').id).toBe(1);
    expect(findModel('EQ', 'ALIGN EQ').id).toBe(2);
  });

  it('NUX_BLOCK_PARAM_CATALOG should provide consistent parameter names for IR and CAB', () => {
    expect(NUX_BLOCK_PARAM_CATALOG.IR.length).toBe(6);
    expect(NUX_BLOCK_PARAM_CATALOG.CAB.length).toBe(6);
    expect(NUX_BLOCK_PARAM_CATALOG.IR).toEqual(NUX_BLOCK_PARAM_CATALOG.CAB);
  });

  it('programChangeToPresetName and presetNameToProgramChange round-trip and validation', () => {
    expect(programChangeToPresetName(0)).toEqual({ bank: 1, channel: 'A', name: '01A' });
    expect(programChangeToPresetName(127)).toEqual({ bank: 32, channel: 'D', name: '32D' });

    expect(presetNameToProgramChange('01A')).toBe(0);
    expect(presetNameToProgramChange('32D')).toBe(127);

    // Validation
    expect(() => programChangeToPresetName(-1)).toThrow(/between 0 and 127/);
    expect(() => programChangeToPresetName(128)).toThrow(/between 0 and 127/);
    expect(() => programChangeToPresetName(1.5)).toThrow(/Must be an integer/);

    expect(() => presetNameToProgramChange('00A')).toThrow(/Invalid bank 0/);
    expect(() => presetNameToProgramChange('33A')).toThrow(/Invalid bank 33/);
    expect(() => presetNameToProgramChange('01E')).toThrow(/Invalid preset format/);
    expect(() => presetNameToProgramChange('invalid')).toThrow(/Invalid preset format/);
  });
});

it('maps the confirmed Plexi parameter order without swapping output and bias', async () => {
  const { findBlockParam } = await import('../src/constants.js');
  expect(findBlockParam('AMP', 'Presence').paramId).toBe(5);
  expect(findBlockParam('AMP', 'Bias').paramId).toBe(6);
  expect(findBlockParam('AMP', 'Level').paramId).toBe(7);
});
