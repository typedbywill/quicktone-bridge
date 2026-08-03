import { describe, it, expect } from 'vitest';
import { findMatchingPortIndex } from '../src/utils/midiUtils.js';

describe('MIDI Port Matching Tests (Linux / macOS / Windows)', () => {
  it('should match Linux ALSA port names without IN/OUT in string', () => {
    const linuxPorts = [
      { index: 0, name: 'Midi Through:Midi Through Port-0 14:0' },
      { index: 1, name: 'NUX MG-30:NUX MG-30 MIDI 1 28:0' }
    ];

    expect(findMatchingPortIndex(linuxPorts, 'NUX MG-30 MIDI IN')).toBe(1);
    expect(findMatchingPortIndex(linuxPorts, 'NUX MG-30 MIDI OUT')).toBe(1);
    expect(findMatchingPortIndex(linuxPorts, 'NUX MG-30')).toBe(1);
  });

  it('should match Windows port names with exact or partial match', () => {
    const winPorts = [
      { index: 0, name: 'LoopBe Internal MIDI 0' },
      { index: 1, name: 'NUX MG-30 MIDI IN' },
      { index: 2, name: 'NUX MG-30 MIDI OUT' }
    ];

    expect(findMatchingPortIndex(winPorts, 'NUX MG-30 MIDI IN')).toBe(1);
    expect(findMatchingPortIndex(winPorts, 'NUX MG-30 MIDI OUT')).toBe(2);
  });

  it('should match macOS port names', () => {
    const macPorts = [
      { index: 0, name: 'IAC Driver Bus 1' },
      { index: 1, name: 'NUX MG-30' }
    ];

    expect(findMatchingPortIndex(macPorts, 'NUX MG-30 MIDI IN')).toBe(1);
  });

  it('should return -1 when no port matches', () => {
    const ports = [
      { index: 0, name: 'Midi Through:Midi Through Port-0 14:0' }
    ];

    expect(findMatchingPortIndex(ports, 'NUX MG-30 MIDI IN')).toBe(-1);
  });
});
