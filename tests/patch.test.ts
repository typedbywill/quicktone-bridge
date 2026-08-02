import { describe, it, expect } from 'vitest';
import { PatchDecoder } from '../src/patch/PatchDecoder.js';
import { PatchEncoder } from '../src/patch/PatchEncoder.js';

describe('Patch Serialization Tests', () => {
  it('should decode raw patch bytes into structured PatchData object', () => {
    const dummyBytes = new Uint8Array(222);
    dummyBytes[0] = 0x01; // Scene 2
    dummyBytes[1] = 120;  // 120 BPM

    const patch = PatchDecoder.decode(dummyBytes);
    expect(patch.bpm).toBe(120);
    expect(patch.scene).toBe(2);
    expect(patch.signalChain.length).toBe(10);
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
});
