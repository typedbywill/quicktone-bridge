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

  it('NUX_MODEL_CATALOG should map IR to the complete official cabinet catalog', () => {
    expect(NUX_MODEL_CATALOG.IR.length).toBe(21);
    expect(NUX_MODEL_CATALOG.IR[0].name).toBe('Jazz 212');
    expect(NUX_MODEL_CATALOG.IR[20].name).toBe('User IR 1-24');

    expect(getModelName('IR', 0)).toBe('Jazz 212');
    expect(getModelName('CAB', 0)).toBe('Jazz 212');

    const modelFound = findModel('IR', 'Black 112');
    expect(modelFound.id).toBe(1);
    const cabFound = findModel('CAB', 'Black 112');
    expect(cabFound.id).toBe(1);
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
