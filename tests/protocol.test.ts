import { describe, it, expect } from 'vitest';
import { SysExEncoder } from '../src/protocol/SysExEncoder.js';
import { SysExDecoder } from '../src/protocol/SysExDecoder.js';
import { SysExCommand, SysExDirection } from '../src/types.js';
import { programChangeToPresetName, presetNameToProgramChange } from '../src/constants.js';

describe('Protocol & Conversion Tests', () => {
  it('should encode SysEx patch dump request correctly', () => {
    const bytes = SysExEncoder.buildPatchDumpRequest();
    expect(Array.from(bytes)).toEqual([0xF0, 0x43, 0x58, 0x70, 0x0A, 0x00, 0xF7]);
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
