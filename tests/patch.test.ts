import { describe, it, expect } from 'vitest';
import { PatchDecoder } from '../src/patch/PatchDecoder.js';
import { PatchEncoder, createCanonicalDecodedBody } from '../src/patch/PatchEncoder.js';
import { unpackTriplet, packTriplet, packNuxPayload } from '../src/protocol/nuxEncoding.js';
import { PatchData } from '../src/types.js';

/**
 * Builds the exact 142-byte decoded body from docs/protocol.md §0B.
 */
function buildOfficialDocDecodedBody(overrides?: { tempoLow?: number; tempoHigh?: number }): Uint8Array {
  const decoded = new Uint8Array(142);
  // Offsets 0..11: 12 model bytes
  decoded.set([0x41, 0x41, 0x45, 0x02, 0x03, 0x01, 0x02, 0x07, 0x05, 0x14, 0x41, 0x01], 0);

  let o = 12;
  const writeBlock = (count: number, values: number[]) => {
    decoded[o++] = count;
    for (const v of values) decoded[o++] = v;
  };

  // Knobs for 12 blocks
  writeBlock(0, [0x32, 0x80]); // WAH (count 0, 2 slots)
  writeBlock(2, [0x14, 0x35, 0x45, 0x00]); // CMP (count 2, 4 slots)
  writeBlock(3, [0x00, 0x31, 0x64, 0x00, 0x00, 0x00]); // EFX (count 3, 6 slots)
  writeBlock(7, [0x0e, 0x41, 0x24, 0x33, 0x3b, 0x29, 0x46, 0x4c]); // AMP (count 7, 8 slots)
  writeBlock(12, [0x36, 0x2b, 0x38, 0x3a, 0x32, 0x2c, 0x34, 0x30, 0x2f, 0x30, 0x2f, 0x2d]); // EQ (count 12, 12 slots)
  writeBlock(2, [0x14, 0x32, 0x00, 0x00]); // NG (count 2, 4 slots)
  writeBlock(3, [0x45, 0x15, 0xd6, 0x00, 0x00, 0x00]); // MOD (count 3, 6 slots)
  writeBlock(8, [0x13, 0x31, 0xd6, 0x45, 0x4c, 0xd5, 0x46, 0x34]); // DLY (count 8, 8 slots)
  writeBlock(3, [0x0d, 0x48, 0x0d, 0x00]); // RVB (count 3, 4 slots)
  writeBlock(6, [0x00, 0x00, 0x32, 0x25, 0x64, 0x00]); // IR (count 6, 6 slots)
  writeBlock(3, [0x32, 0x32, 0x80]); // SR (count 3, 3 slots)
  writeBlock(2, [0x00, 0x64]); // VOL (count 2, 2 slots)

  // Offsets 89, 90
  decoded[89] = 0x32;
  decoded[90] = 0x00;

  // Offsets 91-92: tempo
  decoded[91] = overrides?.tempoHigh ?? 0x00;
  decoded[92] = overrides?.tempoLow ?? 0x62; // 98 BPM

  // Offset 93
  decoded[93] = 0x00;

  // Offsets 94..105: signal chain permutation of 12 blocks
  decoded.set([0x05, 0x00, 0x01, 0x02, 0x03, 0x09, 0x04, 0x0a, 0x06, 0x07, 0x08, 0x0b], 94);

  // Offsets 106..121: preset name "CT-AmbientClean"
  const name = 'CT-AmbientClean';
  for (let i = 0; i < name.length; i++) decoded[106 + i] = name.charCodeAt(i);

  // Offsets 122..141: opaque trailing bytes from protocol.md
  const opaqueTail = [0x01, 0x08, 0x02, 0x01, 0x00, 0x00, 0x64, 0x00, 0x64, 0x00, 0x00, 0x00, 0x50, 0x00, 0xf8, 0x0b, 0xf8, 0x0b, 0xf8, 0x0b];
  decoded.set(opaqueTail, 122);

  return decoded;
}

describe('NUX 7-bit encoding', () => {
  it('should unpack triplet to ASCII bytes correctly', () => {
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

describe('PatchDecoder Structural Decoding', () => {
  it('should parse 142-byte decoded body from protocol.md', () => {
    const decoded = buildOfficialDocDecodedBody();
    const patch = PatchDecoder.decode(decoded);

    expect(patch.bpm).toBe(98);
    expect(patch.scene).toBe(1);
    expect(patch.userPatchName).toBe('CT-AmbientClean');

    // Hardware blocks
    expect(patch.blocks.AMP.enabled).toBe(true);
    expect(patch.blocks.AMP.modelId).toBe(2);
    expect(patch.blocks.AMP.modelName).toBe('Bass Mate');
    expect(patch.blocks.AMP.params[0]).toBe(0x0e); // Gain
    expect(patch.blocks.AMP.params[1]).toBe(0x41); // Master

    expect(patch.blocks.WAH.enabled).toBe(false);
    expect(patch.blocks.WAH.modelId).toBe(1);

    // IR block and CAB alias
    expect(patch.blocks.IR.enabled).toBe(true);
    expect(patch.blocks.IR.modelId).toBe(0x14); // User IR 1-24
    expect(patch.blocks.CAB).toBeDefined();
    expect(patch.blocks.CAB.id).toBe('CAB');
    expect(patch.blocks.CAB.enabled).toBe(true);
    expect(patch.blocks.CAB.modelId).toBe(0x14);

    // Signal chain has 12 blocks without CAB
    expect(patch.signalChain.length).toBe(12);
    expect(patch.signalChain.includes('CAB' as any)).toBe(false);
    expect(patch.signalChain[0]).toBe('NG');
    expect(patch.signalChain[1]).toBe('WAH');
    expect(patch.signalChain[5]).toBe('IR');
  });

  it('should decode 215-byte SysEx payload [preset, scene, 213 packed]', () => {
    const body = buildOfficialDocDecodedBody({ tempoHigh: 0x00, tempoLow: 0x78 }); // 120 BPM
    const packed = packNuxPayload(body);
    expect(packed.length).toBe(213);

    const payload = new Uint8Array(215);
    payload[0] = 0x02; // Preset index 2 -> 01C
    payload[1] = 0x01; // Scene index 1 -> Scene 2
    payload.set(packed, 2);

    const patch = PatchDecoder.decode(payload);
    expect(patch.presetName).toBe('01C');
    expect(patch.scene).toBe(2);
    expect(patch.bpm).toBe(120);
    expect(patch.blocks.AMP.params[0]).toBe(0x0e);
    expect(patch.signalChain.length).toBe(12);
  });

  it('should reject non-Uint8Array inputs', () => {
    expect(() => PatchDecoder.decode([1, 2, 3] as any)).toThrow(/must be a Uint8Array/);
  });

  it('should reject buffers of invalid lengths (neither 215 nor 142)', () => {
    expect(() => PatchDecoder.decode(new Uint8Array(222))).toThrow(/Invalid patch payload length 222/);
    expect(() => PatchDecoder.decode(new Uint8Array(100))).toThrow(/Invalid patch payload length 100/);
    expect(() => PatchDecoder.decode(new Uint8Array(0))).toThrow(/Invalid patch payload length 0/);
  });

  it('should reject 215-byte payload with invalid preset or scene index', () => {
    const payload = new Uint8Array(215);
    payload[0] = 128; // invalid preset
    payload[1] = 0;
    expect(() => PatchDecoder.decode(payload)).toThrow(/Invalid preset byte 128/);

    payload[0] = 0;
    payload[1] = 3; // invalid scene (must be 0..2)
    expect(() => PatchDecoder.decode(payload)).toThrow(/Invalid scene byte 3/);
  });

  it('should reject scene body with knob count exceeding slot maximum', () => {
    const decoded = buildOfficialDocDecodedBody();
    // WAH is at offset 12 with 2 slots max. Set count to 5.
    decoded[12] = 5;
    expect(() => PatchDecoder.decode(decoded)).toThrow(/Invalid knob count 5 for block WAH/);
  });

  it('should reject scene body with corrupted signal chain violating 12-block permutation', () => {
    const decoded = buildOfficialDocDecodedBody();
    // Offset 94 and 95 both set to 0 (WAH)
    decoded[94] = 0;
    decoded[95] = 0;
    expect(() => PatchDecoder.decode(decoded)).toThrow(/violates the strict 12-block permutation/);
  });
});

describe('PatchEncoder Serialization & Preservation', () => {
  it('should encode patch into 215-byte payload decodable by PatchDecoder', () => {
    const decoded = buildOfficialDocDecodedBody();
    const patch = PatchDecoder.decode(decoded);

    const encoded = PatchEncoder.encode(patch);
    expect(encoded.length).toBe(215);

    const roundtrip = PatchDecoder.decode(encoded);
    expect(roundtrip.bpm).toBe(98);
    expect(roundtrip.userPatchName).toBe('CT-AmbientClean');
    expect(roundtrip.blocks.AMP.modelId).toBe(2);
    expect(roundtrip.blocks.AMP.params[0]).toBe(0x0e);
    expect(roundtrip.signalChain.length).toBe(12);
  });

  it('should preserve existing opaque bytes when serializing modified patch', () => {
    const decoded = buildOfficialDocDecodedBody();
    const patch = PatchDecoder.decode(decoded);

    // Modify some structured fields
    patch.bpm = 135;
    patch.blocks.AMP.params[0] = 0x50; // New Gain
    patch.userPatchName = 'OpaqueCheck';

    const encodedBody = PatchEncoder.encodeBody(patch);
    expect(encodedBody.length).toBe(142);

    // Offsets 89, 90, 93 should be preserved intact
    expect(encodedBody[89]).toBe(0x32);
    expect(encodedBody[90]).toBe(0x00);
    expect(encodedBody[93]).toBe(0x00);

    // Offsets 122..141 trailing opaque bytes should be preserved intact
    expect(encodedBody[122]).toBe(0x01);
    expect(encodedBody[123]).toBe(0x08);
    expect(encodedBody[140]).toBe(0xf8);
    expect(encodedBody[141]).toBe(0x0b);

    // Modified fields must reflect edits
    expect(((encodedBody[91] & 0x7f) << 7) | (encodedBody[92] & 0x7f)).toBe(135);
    expect(encodedBody[28]).toBe(0x50); // AMP Gain at offset 28
  });

  it('should construct valid canonical body when no raw is provided', () => {
    const scratchPatch: PatchData = {
      raw: new Uint8Array(0),
      presetName: '01A',
      bpm: 120,
      scene: 1,
      blocks: {
        WAH: { id: 'WAH', enabled: false, modelId: 0, params: [] },
        CMP: { id: 'CMP', enabled: false, modelId: 0, params: [] },
        EFX: { id: 'EFX', enabled: false, modelId: 0, params: [] },
        AMP: { id: 'AMP', enabled: true, modelId: 1, params: [50, 60] },
        EQ: { id: 'EQ', enabled: false, modelId: 0, params: [] },
        NG: { id: 'NG', enabled: false, modelId: 0, params: [] },
        MOD: { id: 'MOD', enabled: false, modelId: 0, params: [] },
        DLY: { id: 'DLY', enabled: false, modelId: 0, params: [] },
        RVB: { id: 'RVB', enabled: false, modelId: 0, params: [] },
        IR: { id: 'IR', enabled: true, modelId: 0, params: [] },
        CAB: { id: 'CAB', enabled: true, modelId: 0, params: [] },
        SR: { id: 'SR', enabled: false, modelId: 0, params: [] },
        VOL: { id: 'VOL', enabled: true, modelId: 0, params: [] },
      },
      signalChain: ['WAH', 'CMP', 'EFX', 'AMP', 'EQ', 'NG', 'MOD', 'DLY', 'RVB', 'IR', 'SR', 'VOL'],
    };

    const encoded = PatchEncoder.encode(scratchPatch);
    expect(encoded.length).toBe(215);

    const decoded = PatchDecoder.decode(encoded);
    expect(decoded.presetName).toBe('01A');
    expect(decoded.scene).toBe(1);
    expect(decoded.bpm).toBe(120);
    expect(decoded.blocks.AMP.enabled).toBe(true);
    expect(decoded.blocks.AMP.modelId).toBe(1);
    expect(decoded.blocks.AMP.params[0]).toBe(50);
    expect(decoded.blocks.AMP.params[1]).toBe(60);
    expect(decoded.signalChain.length).toBe(12);
  });

  it('createCanonicalDecodedBody should return valid 142-byte body', () => {
    const canonical = createCanonicalDecodedBody({ bpm: 125, name: 'DefaultInit' });
    expect(canonical.length).toBe(142);

    const decoded = PatchDecoder.decode(canonical);
    expect(decoded.bpm).toBe(125);
    expect(decoded.userPatchName).toBe('DefaultInit');
    expect(decoded.signalChain.length).toBe(12);
  });

  it('should validate 8-bit parameter values up to 255 without artificial 100 capping', () => {
    const canonical = createCanonicalDecodedBody();
    const patch = PatchDecoder.decode(canonical);

    // Hardware parameters can use values above 100 (e.g. 16-bit or bitpacked values like 214)
    patch.blocks.AMP.params[0] = 214;
    const encoded = PatchEncoder.encode(patch);
    const decoded = PatchDecoder.decode(encoded);
    expect(decoded.blocks.AMP.params[0]).toBe(214);
  });

  it('should reject invalid values in PatchEncoder', () => {
    const canonical = createCanonicalDecodedBody();
    const patch = PatchDecoder.decode(canonical);

    // Negative param
    patch.blocks.AMP.params[0] = -1;
    expect(() => PatchEncoder.encode(patch)).toThrow(/must be an integer between 0 and 255/);

    // Param > 255
    patch.blocks.AMP.params[0] = 256;
    expect(() => PatchEncoder.encode(patch)).toThrow(/must be an integer between 0 and 255/);

    // Float param
    patch.blocks.AMP.params[0] = 50.5;
    expect(() => PatchEncoder.encode(patch)).toThrow(/must be an integer between 0 and 255/);

    patch.blocks.AMP.params[0] = 50;

    // Invalid modelId
    patch.blocks.AMP.modelId = 70;
    expect(() => PatchEncoder.encode(patch)).toThrow(/Invalid modelId 70/);

    patch.blocks.AMP.modelId = 1;

    // Invalid BPM
    patch.bpm = 300;
    expect(() => PatchEncoder.encode(patch)).toThrow(/Invalid BPM 300/);

    patch.bpm = 120;

    // Invalid preset name: too long (> 16)
    patch.userPatchName = '12345678901234567';
    expect(() => PatchEncoder.encode(patch)).toThrow(/exceeds 16 ASCII characters limit/);

    // Invalid preset name: non-ASCII
    patch.userPatchName = 'Acústico';
    expect(() => PatchEncoder.encode(patch)).toThrow(/non-ASCII printable character/);
  });
});


describe('Lossless preservation and framing', () => {
  it('round trips every documented body byte including native parameter counts', () => {
    const body = buildOfficialDocDecodedBody();
    expect(PatchEncoder.encodeBody(PatchDecoder.decode(body))).toEqual(body);
  });
  it('rejects noncanonical packed bytes instead of masking them', () => {
    const payload = Uint8Array.from([0, 0, ...packNuxPayload(buildOfficialDocDecodedBody())]);
    payload[2] = 4;
    expect(() => PatchDecoder.decode(payload)).toThrow(/canonical/);
    payload[2] = 0; payload[3] = 128;
    expect(() => PatchDecoder.decode(payload)).toThrow(/canonical/);
  });
  it('rejects incomplete chains and oversized parameter arrays', () => {
    const patch = PatchDecoder.decode(buildOfficialDocDecodedBody());
    patch.signalChain = ['AMP'];
    expect(() => PatchEncoder.encodeBody(patch)).toThrow(/every hardware block/);
    patch.signalChain = PatchDecoder.decode(buildOfficialDocDecodedBody()).signalChain;
    patch.blocks.VOL.params = [1, 2, 3];
    expect(() => PatchEncoder.encodeBody(patch)).toThrow(/Too many parameters/);
  });
});
