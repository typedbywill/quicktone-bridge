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

function normalizeString(str: string): string {
  return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Normalizes MG-30 / MG 30 / MG30 variations to "mg30",
 * while preserving distinct model numbers like mg300 or mg400.
 */
function normalizeMg30Tokens(str: string): string {
  return normalizeString(str).replace(/\bmg[-_\s]*30\b/gi, 'mg30');
}

function isOtherNuxModel(str: string): boolean {
  const norm = normalizeString(str);
  return /\bmg[-_\s]*(?!30\b)\d+/i.test(norm);
}

function isMg30Requested(target: string): boolean {
  if (isOtherNuxModel(target)) return false;
  const norm = normalizeMg30Tokens(target);
  return /\bmg30\b/.test(norm);
}

function isUnequivocalMg30Port(portName: string): boolean {
  if (isOtherNuxModel(portName)) return false;
  const norm = normalizeMg30Tokens(portName);
  return /\bmg30\b/.test(norm);
}

export function findMatchingPortIndex(ports: PortItem[], identifier: number | string): number {
  if (typeof identifier === 'number') {
    if (!Number.isInteger(identifier) || identifier < 0) {
      return -1;
    }
    const match = ports.find(p => p.index === identifier);
    return match !== undefined ? match.index : -1;
  }

  if (typeof identifier !== 'string' || !ports || ports.length === 0) {
    return -1;
  }

  const rawTarget = identifier.trim();
  if (!rawTarget) return -1;

  const targetLower = normalizeString(rawTarget);
  // Never accept generic 'nux' without specific model identification
  if (targetLower === 'nux') {
    return -1;
  }

  const isMg30 = isMg30Requested(rawTarget);

  // Ambiguous names require an explicit port name or numeric index.
  for (const predicate of [
    (name: string) => normalizeString(name) === targetLower,
    (name: string) => normalizeMg30Tokens(name) === normalizeMg30Tokens(rawTarget),
    (name: string) => normalizeString(name).includes(targetLower) || normalizeMg30Tokens(name).includes(normalizeMg30Tokens(rawTarget)),
  ]) {
    const matches = ports.filter(p => !(isMg30 && isOtherNuxModel(p.name)) && predicate(p.name));
    if (matches.length === 1) return matches[0].index;
    if (matches.length > 1) return -1;
  }

  // 4. OS Fallback: ONLY when the requested target is specifically NUX MG-30 / MG30 (or variant)
  // and there is an unequivocal MG-30 identification in available ports.
  // Never fallback for generic 'NUX', other models, unrelated hardware, or when realPorts.length === 1.
  if (isMg30 && /^(?:nux )?mg30(?: midi (?:in|out))?$/.test(normalizeMg30Tokens(rawTarget))) {
    const mg30Candidates = ports.filter(p => isUnequivocalMg30Port(p.name));

    if (mg30Candidates.length === 1) {
      return mg30Candidates[0].index;
    }

    if (mg30Candidates.length > 1) {
      const isInput = /\b(?:in|input)\b/i.test(rawTarget);
      const isOutput = /\b(?:out|output)\b/i.test(rawTarget);

      if (isInput && !isOutput) {
        const inMatch = mg30Candidates.filter(p => /\b(?:in|input)\b/i.test(p.name));
        if (inMatch.length === 1) return inMatch[0].index;
      } else if (isOutput && !isInput) {
        const outMatch = mg30Candidates.filter(p => /\b(?:out|output)\b/i.test(p.name));
        if (outMatch.length === 1) return outMatch[0].index;
      }
    }
  }

  return -1;
}
