/**
 * NUX MG-30 7-bit SysEx encapsulation helpers.
 *
 * Two 8-bit bytes are packed into three 7-bit data bytes:
 *
 *   x x x x x x a a
 *   x a a a a a a b
 *   x b b b b b b b
 */

/** Decode three 7-bit bytes into two 8-bit bytes. */
export function unpackTriplet(data0: number, data1: number, data2: number): [number, number] {
  const c1 = ((data0 & 0x7f) << 6) | ((data1 & 0x7e) >> 1);
  const c2 = (data2 & 0x7f) | ((data1 & 1) << 7);
  return [c1 & 0xff, c2 & 0xff];
}

/** Encode two 8-bit bytes into three 7-bit bytes. */
export function packTriplet(c1: number, c2: number): [number, number, number] {
  const a = c1 & 0xff;
  const b = c2 & 0xff;
  const d0 = (a >> 6) & 0x03;
  const d1 = ((a & 0x3f) << 1) | ((b >> 7) & 1);
  const d2 = b & 0x7f;
  return [d0, d1, d2];
}

/**
 * Unpack a contiguous run of 7-bit encoded bytes (length multiple of 3 preferred).
 * Trailing incomplete triplets are ignored.
 */
export function unpackNuxPayload(encoded: Uint8Array | number[]): Uint8Array {
  const src = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
  const out: number[] = [];
  for (let i = 0; i + 2 < src.length; i += 3) {
    const [c1, c2] = unpackTriplet(src[i], src[i + 1], src[i + 2]);
    out.push(c1, c2);
  }
  return new Uint8Array(out);
}

/**
 * Pack 8-bit bytes into 7-bit triplets. Odd trailing byte is paired with 0x00.
 */
export function packNuxPayload(decoded: Uint8Array | number[]): Uint8Array {
  const src = decoded instanceof Uint8Array ? decoded : new Uint8Array(decoded);
  const out: number[] = [];
  for (let i = 0; i < src.length; i += 2) {
    const c1 = src[i];
    const c2 = i + 1 < src.length ? src[i + 1] : 0;
    out.push(...packTriplet(c1, c2));
  }
  return new Uint8Array(out);
}
