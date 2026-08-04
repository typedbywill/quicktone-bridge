import { describe, it, expect } from 'vitest';
import { PatchDecoder } from '../src/patch/PatchDecoder.js';
import { PatchEncoder } from '../src/patch/PatchEncoder.js';
import { unpackTriplet, packTriplet, packNuxPayload } from '../src/protocol/nuxEncoding.js';

function buildProtocolStyleDecodedBody(overrides?: { tempoLow?: number; tempoHigh?: number }): Uint8Array {
  const decoded = new Uint8Array(142);
  decoded.set([0x41, 0x41, 0x45, 0x02, 0x03, 0x01, 0x02, 0x07, 0x05, 0x14, 0x41, 0x01], 0);
  let o = 12;
  const writeBlock = (count: number, values: number[]) => {
    decoded[o++] = count;
    for (const v of values) decoded[o++] = v;
  };
  writeBlock(0, [0x32, 0x80]);
  writeBlock(2, [0x14, 0x35, 0x45, 0x00]);
  writeBlock(3, [0x00, 0x31, 0x64, 0x00, 0x00, 0x00]);
  writeBlock(7, [0x0e, 0x41, 0x24, 0x33, 0x3b, 0x29, 0x46, 0x4c]);
  writeBlock(12, [0x36, 0x2b, 0x38, 0x3a, 0x32, 0x2c, 0x34, 0x30, 0x2f, 0x30, 0x2f, 0x2d]);
  writeBlock(2, [0x14, 0x32, 0x00, 0x00]);
  writeBlock(3, [0x45, 0x15, 0xd6, 0x00, 0x00, 0x00]);
  writeBlock(8, [0x13, 0x31, 0xd6, 0x45, 0x4c, 0xd5, 0x46, 0x34]);
  writeBlock(3, [0x0d, 0x48, 0x0d, 0x00]);
  writeBlock(6, [0x00, 0x00, 0x32, 0x25, 0x64, 0x00]);
  writeBlock(3, [0x32, 0x32, 0x80]);
  writeBlock(2, [0x00, 0x64]);
  while (o < 91) decoded[o++] = 0;
  decoded[91] = overrides?.tempoHigh ?? 0x00;
  decoded[92] = overrides?.tempoLow ?? 0x62;
  decoded.set([0x05, 0x00, 0x01, 0x02, 0x03, 0x09, 0x04, 0x0a, 0x06, 0x07, 0x08, 0x0b], 94);
  const name = 'CT-AmbientClean';
  for (let i = 0; i < name.length; i++) decoded[106 + i] = name.charCodeAt(i);
  return decoded;
}

describe('NUX 7-bit encoding', () => {
  it('should unpack the IR-name style triplet to ASCII bytes', () => {
    const [c1, c2] = unpackTriplet(0x01, 0x06, 0x48);
    expect(c1).toBe(0x43);
    expect(c2).toBe(0x48);
  });

  it('should round-trip pack/unpack triplets', () => {
    const [d0, d1, d2] = packTriplet(0x41, 0x0e);
    const [a, b] = unpackTriplet(d0, d1, d2);
    expect(a).toBe(0x41);
    expect(b).toBe(0x0e);
  });
});

describe('Patch Serialization Tests', () => {
  it('should decode raw patch bytes into structured PatchData object', () => {
    const dummyBytes = new Uint8Array(222);
    dummyBytes[0] = 0x01;
    dummyBytes[1] = 120;

    const patch = PatchDecoder.decode(dummyBytes);
    expect(patch.bpm).toBe(120);
    expect(patch.scene).toBe(2);
    expect(patch.signalChain.length).toBe(13);
    expect(patch.blocks.AMP).toBeDefined();
    expect(patch.blocks.CAB).toBeDefined();
  });

  it('should encode patch data back to byte array', () => {
    const dummyBytes = new Uint8Array(222);
    dummyBytes[0] = 0x02;
    dummyBytes[1] = 135;

    const patch = PatchDecoder.decode(dummyBytes);
    const encoded = PatchEncoder.encode(patch);
    expect(encoded.length).toBe(222);
  });

  it('should parse AMP knobs from protocol.md decoded scene layout', () => {
    const decoded = buildProtocolStyleDecodedBody();
    const patch = PatchDecoder.decode(decoded);
    expect(patch.blocks.AMP.enabled).toBe(true);
    expect(patch.blocks.AMP.modelId).toBe(0x02);
    expect(patch.blocks.AMP.params[0]).toBe(0x0e);
    expect(patch.blocks.AMP.params[1]).toBe(0x41);
    expect(patch.blocks.WAH.enabled).toBe(false);
    expect(patch.bpm).toBe(98);
    expect(patch.userPatchName).toBe('CT-AmbientClean');
  });

  it('should decode encoded 0C-style payload (preset+scene+triplets)', () => {
    const decodedBody = buildProtocolStyleDecodedBody({ tempoHigh: 0x00, tempoLow: 0x78 });
    const packed = packNuxPayload(decodedBody);
    const payload = new Uint8Array(2 + packed.length);
    payload[0] = 0x02;
    payload[1] = 0x01;
    payload.set(packed, 2);

    const patch = PatchDecoder.decode(payload);
    expect(patch.scene).toBe(2);
    expect(patch.blocks.AMP.params[0]).toBe(0x0e);
    expect(patch.bpm).toBe(120);
  });
});
