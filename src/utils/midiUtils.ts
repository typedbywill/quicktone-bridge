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

export interface PortItem {
  index: number;
  name: string;
}

export function findMatchingPortIndex(ports: PortItem[], identifier: number | string): number {
  if (typeof identifier === 'number') {
    return identifier >= 0 && identifier < ports.length ? identifier : -1;
  }

  if (!ports || ports.length === 0) return -1;

  const target = identifier.toLowerCase().trim();

  // 1. Exact match (case insensitive)
  const exact = ports.find(p => p.name.toLowerCase().trim() === target);
  if (exact) return exact.index;

  // 2. Contains full target substring
  const partial = ports.find(p => p.name.toLowerCase().includes(target));
  if (partial) return partial.index;

  // 3. Fallback for OS differences (Linux ALSA vs Windows/macOS):
  const realPorts = ports.filter(p => {
    const lname = p.name.toLowerCase();
    return !lname.includes('midi through') && !lname.includes('through');
  });

  // Try matching "nux mg-30" or "nux mg30"
  const nuxMg30Match = realPorts.find(p => {
    const lname = p.name.toLowerCase();
    return (lname.includes('nux') && lname.includes('mg-30')) || 
           (lname.includes('nux') && lname.includes('mg30')) ||
           lname.includes('mg-30') || 
           lname.includes('mg30');
  });
  if (nuxMg30Match) return nuxMg30Match.index;

  // Try matching any port with "nux"
  const nuxMatch = realPorts.find(p => p.name.toLowerCase().includes('nux'));
  if (nuxMatch) return nuxMatch.index;

  // If there is only 1 real hardware port available, pick it
  if (realPorts.length === 1) {
    return realPorts[0].index;
  }

  return -1;
}

