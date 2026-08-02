import { PatchData } from '../types.js';

export class PatchEncoder {
  /**
   * Serializes a PatchData object into raw bytes ready for sending via SysEx.
   */
  public static encode(patch: PatchData): Uint8Array {
    if (patch.raw && patch.raw.length > 0) {
      return new Uint8Array(patch.raw);
    }
    // Default dummy 222 byte buffer if starting from scratch
    const buf = new Uint8Array(222);
    buf[0] = (patch.scene - 1) & 0x07;
    buf[1] = patch.bpm & 0x7F;
    return buf;
  }
}
