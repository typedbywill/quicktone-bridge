import { isNuxSysEx } from '../utils/midiUtils.js';
import { SysExPacket, SysExCommand, SysExDirection } from '../types.js';

export class SysExDecoder {
  /**
   * Parses a raw byte array into a structured SysExPacket object or null if not valid NUX SysEx.
   */
  public static parseSysEx(bytes: Uint8Array | number[]): SysExPacket | null {
    if (!isNuxSysEx(bytes)) {
      return null;
    }
    const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (raw.length < 6) {
      return null;
    }
    const header = Array.from(raw.subarray(0, 4));
    const command = raw[4] as SysExCommand;
    const direction = raw[5] as SysExDirection;
    const endIdx = raw[raw.length - 1] === 0xF7 ? raw.length - 1 : raw.length;
    const payload = raw.subarray(6, endIdx);

    return {
      header,
      command,
      direction,
      payload,
      raw
    };
  }

  /**
   * Helper to check if a MIDI message is a Program Change (0xC0..0xCF)
   */
  public static isProgramChange(bytes: Uint8Array | number[]): boolean {
    if (bytes.length < 2) return false;
    return (bytes[0] & 0xF0) === 0xC0;
  }

  /**
   * Helper to check if a MIDI message is a Control Change (0xB0..0xBF)
   */
  public static isControlChange(bytes: Uint8Array | number[]): boolean {
    if (bytes.length < 3) return false;
    return (bytes[0] & 0xF0) === 0xB0;
  }
}
