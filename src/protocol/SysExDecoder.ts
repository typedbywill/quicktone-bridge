import { SysExPacket } from '../types.js';

export class SysExDecoder {
  /** Parse one complete MIDI message. Transports supply whole messages, not USB packets. */
  public static parseSysEx(bytes: Uint8Array | number[]): SysExPacket | null {
    if (bytes.length < 7 || bytes[0] !== 0xf0 || bytes[1] !== 0x43 ||
        bytes[2] !== 0x58 || bytes[3] !== 0x70 || bytes[bytes.length - 1] !== 0xf7 ||
        Array.from(bytes).slice(1, -1).some(b => !Number.isInteger(b) || b < 0 || b > 127)) return null;
    const raw = Uint8Array.from(bytes);
    return { header: Array.from(raw.subarray(0, 4)), command: raw[4], direction: raw[5], payload: raw.slice(6, -1), raw };
  }
  public static isProgramChange(bytes: Uint8Array | number[]): boolean {
    return bytes.length === 2 && (bytes[0] & 0xf0) === 0xc0 && bytes[1] >= 0 && bytes[1] < 128;
  }
  public static isControlChange(bytes: Uint8Array | number[]): boolean {
    return bytes.length === 3 && (bytes[0] & 0xf0) === 0xb0 && bytes[1] >= 0 && bytes[1] < 128 && bytes[2] >= 0 && bytes[2] < 128;
  }
}
