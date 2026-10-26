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

  it('should normalize MG-30 / MG30 and case variations', () => {
    const ports = [
      { index: 0, name: 'MIDI Through 0' },
      { index: 1, name: 'nux mg30 midi in' },
      { index: 2, name: 'NUX MG-30 MIDI OUT' }
    ];

    expect(findMatchingPortIndex(ports, 'NUX MG-30 MIDI IN')).toBe(1);
    expect(findMatchingPortIndex(ports, 'nux mg-30 midi out')).toBe(2);
    expect(findMatchingPortIndex(ports, 'NUX MG30 MIDI OUT')).toBe(2);
    expect(findMatchingPortIndex(ports, 'mg30')).toBe(-1); // Ambiguous input/output names
  });

  it('should NEVER fall back to unrelated single hardware port', () => {
    const unrelatedPorts = [
      { index: 0, name: 'Midi Through Port-0' },
      { index: 1, name: 'Focusrite Scarlett 18i20 MIDI' }
    ];

    // Must NOT fall back to Focusrite even if it is the only hardware port
    expect(findMatchingPortIndex(unrelatedPorts, 'NUX MG-30 MIDI IN')).toBe(-1);
    expect(findMatchingPortIndex(unrelatedPorts, 'NUX MG-30')).toBe(-1);
  });

  it('should NEVER fall back when an explicit unknown device name is requested', () => {
    const portsWithNux = [
      { index: 0, name: 'Midi Through Port-0' },
      { index: 1, name: 'NUX MG-30:NUX MG-30 MIDI 1 28:0' }
    ];

    // Explicit request for a different device must not select NUX MG-30
    expect(findMatchingPortIndex(portsWithNux, 'Scarlett 2i2')).toBe(-1);
    expect(findMatchingPortIndex(portsWithNux, 'Roland UM-ONE')).toBe(-1);
  });

  it('should reject generic NUX or other NUX models without MG-30 identification', () => {
    const otherModelPorts = [
      { index: 0, name: 'Midi Through' },
      { index: 1, name: 'NUX MG-300 MIDI' },
      { index: 2, name: 'NUX MG-400' },
      { index: 3, name: 'NUX Generic Audio' }
    ];

    // Must NOT match other models when MG-30 is requested
    expect(findMatchingPortIndex(otherModelPorts, 'NUX MG-30 MIDI IN')).toBe(-1);
    expect(findMatchingPortIndex(otherModelPorts, 'NUX MG-30')).toBe(-1);

    // Generic 'NUX' request must not blindly match
    expect(findMatchingPortIndex(otherModelPorts, 'NUX')).toBe(-1);
  });

  it('should handle numeric indices strictly as integer matching port.index', () => {
    const ports = [
      { index: 10, name: 'Port Ten' },
      { index: 20, name: 'Port Twenty' }
    ];

    // Must match actual port.index, NOT array position (e.g. index 0 does not exist)
    expect(findMatchingPortIndex(ports, 10)).toBe(10);
    expect(findMatchingPortIndex(ports, 20)).toBe(20);
    expect(findMatchingPortIndex(ports, 0)).toBe(-1);
    expect(findMatchingPortIndex(ports, 1)).toBe(-1);

    // Reject non-integers, negative numbers, NaN
    expect(findMatchingPortIndex(ports, 10.5)).toBe(-1);
    expect(findMatchingPortIndex(ports, -1)).toBe(-1);
    expect(findMatchingPortIndex(ports, NaN)).toBe(-1);
  });
});


it('does not replace an explicit missing MG-30 port with another instance', () => {
  const ports = [{ index: 3, name: 'NUX MG-30 MIDI IN' }];
  expect(findMatchingPortIndex(ports, 'NUX MG-30 Device 2')).toBe(-1);
});
