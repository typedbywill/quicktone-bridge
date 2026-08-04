import { describe, it, expect } from 'vitest';
import { SysExEncoder } from '../src/protocol/SysExEncoder.js';
import { SysExDecoder } from '../src/protocol/SysExDecoder.js';
import { SysExCommand, SysExDirection } from '../src/types.js';
import { programChangeToPresetName, presetNameToProgramChange } from '../src/constants.js';

describe('Protocol & Conversion Tests', () => {
  it('should encode SysEx patch dump request correctly', () => {
    const bytes = SysExEncoder.buildPatchDumpRequest();
    expect(Array.from(bytes)).toEqual([
      0xF0, 0x43, 0x58, 0x70, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF7,
    ]);
    expect(Array.from(SysExEncoder.buildPatchDumpRequest(1))).toEqual([
      0xF0, 0x43, 0x58, 0x70, 0x0C, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF7,
    ]);
  });

  it('should encode AMP Gain parameter as MIDI CC 24', () => {
    const bytes = SysExEncoder.buildParameterChange('AMP', 0, 80);
    expect(Array.from(bytes)).toEqual([0xB0, 24, 80]);

    const master = SysExEncoder.buildParameterChange('AMP', 1, 65);
    expect(Array.from(master)).toEqual([0xB0, 25, 65]);
  });

  it('should clamp parameter CC values to 0..100', () => {
    expect(Array.from(SysExEncoder.buildParameterChange('AMP', 0, 150))).toEqual([0xB0, 24, 100]);
    expect(Array.from(SysExEncoder.buildParameterChange('AMP', 0, -5))).toEqual([0xB0, 24, 0]);
  });

  it('should encode block toggle to MIDI CC correctly', () => {
    const modOn = SysExEncoder.buildBlockToggle('MOD', true);
    expect(Array.from(modOn)).toEqual([0xB0, 0x06, 0x00]);

    const modOff = SysExEncoder.buildBlockToggle('MOD', false);
    expect(Array.from(modOff)).toEqual([0xB0, 0x06, 0x41]);
  });

  it('should encode scene select MIDI CC 80 correctly', () => {
    const scene1 = SysExEncoder.buildSceneSelect(1);
    expect(Array.from(scene1)).toEqual([0xB0, 0x50, 0x00]);

    const scene2 = SysExEncoder.buildSceneSelect(2);
    expect(Array.from(scene2)).toEqual([0xB0, 0x50, 0x01]);

    const scene3 = SysExEncoder.buildSceneSelect(3);
    expect(Array.from(scene3)).toEqual([0xB0, 0x50, 0x02]);
  });

  it('should encode scene select SysEx 0x0C correctly', () => {
    // Dump/sync packet from QuickTone (not used for realtime select)
    const scene2 = SysExEncoder.buildSceneSelectSysEx(2);
    expect(Array.from(scene2)).toEqual([
      0xF0, 0x43, 0x58, 0x70, 0x0C, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xF7,
    ]);
  });

  it('should decode valid NUX SysEx packet', () => {
    const raw = [0xF0, 0x43, 0x58, 0x70, 0x0A, 0x02, 0x12, 0x34, 0xF7];
    const packet = SysExDecoder.parseSysEx(raw);
    expect(packet).not.toBeNull();
    expect(packet?.command).toBe(SysExCommand.HANDSHAKE_PATCH_DUMP);
    expect(packet?.direction).toBe(SysExDirection.DEVICE_TO_HOST);
    expect(Array.from(packet?.payload || [])).toEqual([0x12, 0x34]);
  });

  it('should convert program change index to preset name and back', () => {
    expect(programChangeToPresetName(0)).toEqual({ bank: 1, channel: 'A', name: '01A' });
    expect(programChangeToPresetName(1)).toEqual({ bank: 1, channel: 'B', name: '01B' });
    expect(programChangeToPresetName(4)).toEqual({ bank: 2, channel: 'A', name: '02A' });
    expect(programChangeToPresetName(127)).toEqual({ bank: 32, channel: 'D', name: '32D' });

    expect(presetNameToProgramChange('01A')).toBe(0);
    expect(presetNameToProgramChange('01B')).toBe(1);
    expect(presetNameToProgramChange('02A')).toBe(4);
    expect(presetNameToProgramChange('32D')).toBe(127);
  });
});
