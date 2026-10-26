export function integer(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

export function encodedSceneBody(body: Uint8Array | number[]): Uint8Array {
  if (body.length !== 213 || Array.from(body).some((b, i) =>
    !Number.isInteger(b) || b < 0 || b > 127 || (i % 3 === 0 && b > 3))) {
    throw new Error('Expected a canonical 213-byte packed MG-30 scene body.');
  }
  return Uint8Array.from(body);
}
