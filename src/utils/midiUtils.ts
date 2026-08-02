/**
 * MIDI Utility Functions
 */

export function bytesToHex(bytes: Uint8Array | number[]): string {
  const arr = Array.from(bytes);
  return arr.map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

export function isNuxSysEx(bytes: Uint8Array | number[]): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0xF0 &&
    bytes[1] === 0x43 &&
    bytes[2] === 0x58 &&
    bytes[3] === 0x70
  );
}
