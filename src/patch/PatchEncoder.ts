import { PatchData, BlockType } from '../types.js';
import {
  BLOCK_LIST,
  SCENE_DUMP_BLOCK_ORDER,
  SCENE_DUMP_KNOB_SLOTS,
  blockTypeToId,
  presetNameToProgramChange,
} from '../constants.js';
import { PatchDecoder } from './PatchDecoder.js';
import { packNuxPayload, unpackNuxPayload } from '../protocol/nuxEncoding.js';

/**
 * Creates a canonically valid 142-byte decoded scene body from scratch
 * without musical bias or all-zero invalid states.
 */
export function createCanonicalDecodedBody(options?: {
  bpm?: number;
  name?: string;
  chain?: BlockType[];
}): Uint8Array {
  const body = new Uint8Array(142);

  // 12 hardware models (offsets 0..11): all disabled (bit 0x40 set), modelId 0
  for (let i = 0; i < 12; i++) {
    body[i] = 0x40;
  }

  // Knob slots (offsets 12..88): count bytes and slot values default to 0

  // Tempo (offsets 91-92): default 120 BPM
  const bpm = options?.bpm ?? 120;
  if (!Number.isInteger(bpm) || bpm < 40 || bpm > 240) {
    throw new Error(`Invalid canonical BPM ${bpm}: must be between 40 and 240.`);
  }
  body[91] = (bpm >> 7) & 0x7f;
  body[92] = bpm & 0x7f;

  // Signal chain (offsets 94..105): strict 12-block permutation
  const chain = (options?.chain ?? BLOCK_LIST).map(b => b === 'CAB' ? 'IR' : b) as BlockType[];
  if (chain.length !== 12 || new Set(chain.map(blockTypeToId)).size !== 12) throw new Error('Signal chain must contain every hardware block exactly once.');
  for (let i = 0; i < 12; i++) {
    body[94 + i] = blockTypeToId(chain[i]);
  }

  // Preset name (offsets 106..121): up to 16 ASCII printable characters
  if (options?.name) {
    const name = options.name;
    if (name.length > 16) {
      throw new Error(`Canonical patch name exceeds 16 characters: "${name}"`);
    }
    for (let i = 0; i < name.length; i++) {
      const code = name.charCodeAt(i);
      if (code < 0x20 || code > 0x7e) {
        throw new Error(`Canonical patch name contains non-ASCII printable character: "${name[i]}"`);
      }
      body[106 + i] = code;
    }
  }

  return body;
}

export class PatchEncoder {
  /**
   * Serializes a PatchData object into a 142-byte decoded scene body,
   * preserving any existing opaque or unmodeled bytes from patch.raw.
   */
  public static encodeBody(patch: PatchData): Uint8Array {
    let body: Uint8Array;

    const hasRaw = Boolean(patch.raw?.length);
    if (hasRaw) {
      PatchDecoder.decode(patch.raw);
      body = patch.raw.length === 215 ? unpackNuxPayload(patch.raw.subarray(2)) : Uint8Array.from(patch.raw);
    } else body = createCanonicalDecodedBody({ bpm: patch.bpm, name: patch.userPatchName });
    const original = hasRaw ? PatchDecoder.decode(patch.raw) : undefined;

    // 1. Serialize hardware block model IDs and enabled state (offsets 0..11)
    for (let i = 0; i < SCENE_DUMP_BLOCK_ORDER.length; i++) {
      const block = SCENE_DUMP_BLOCK_ORDER[i];
      const state = patch.blocks?.[block] ?? (block === 'IR' ? patch.blocks?.['CAB'] : undefined);
      if (state) {
        if (
          typeof state.modelId !== 'number' ||
          !Number.isFinite(state.modelId) ||
          !Number.isInteger(state.modelId) ||
          state.modelId < 0 ||
          state.modelId > 0x3f
        ) {
          throw new Error(
            `Invalid modelId ${state.modelId} for block ${block}: must be an integer between 0 and 63.`
          );
        }
        const rawModel = (state.enabled ? 0x00 : 0x40) | (state.modelId & 0x3f);
        if (!original || original.blocks[block].modelId !== state.modelId || original.blocks[block].enabled !== state.enabled) body[i] = rawModel;
      }
    }

    // 2. Serialize knob parameters (offsets 12..88)
    let offset = 12;
    for (const block of SCENE_DUMP_BLOCK_ORDER) {
      const slots = SCENE_DUMP_KNOB_SLOTS[block] ?? 0;
      const state = patch.blocks?.[block] ?? (block === 'IR' ? patch.blocks?.['CAB'] : undefined);
      if (state && Array.isArray(state.params)) {
        for (let k = 0; k < state.params.length; k++) {
          const val = state.params[k];
          if (
            typeof val !== 'number' ||
            !Number.isFinite(val) ||
            !Number.isInteger(val) ||
            val < 0 ||
            val > 255
          ) {
            throw new Error(
              `Invalid param value ${val} at block ${block} knob #${k}: must be an integer between 0 and 255.`
            );
          }
        }

        if (state.params.length > slots) throw new Error(`Too many parameters for ${block}: maximum ${slots}.`);
        // A decoded params array includes unused slots. Keep the native count on round trips.
        if (!hasRaw || state.params.length !== slots) body[offset] = state.params.length;

        // Write knob slot values
        for (let k = 0; k < slots; k++) {
          if (k < state.params.length) {
            body[offset + 1 + k] = state.params[k] & 0xff;
          }
        }
      }
      offset += 1 + slots;
    }

    // 3. Serialize BPM (offsets 91-92)
    if (patch.bpm !== undefined && patch.bpm !== original?.bpm) {
      if (
        typeof patch.bpm !== 'number' ||
        !Number.isFinite(patch.bpm) ||
        !Number.isInteger(patch.bpm) ||
        patch.bpm < 40 ||
        patch.bpm > 240
      ) {
        throw new Error(`Invalid BPM ${patch.bpm}: must be an integer between 40 and 240.`);
      }
      body[91] = (patch.bpm >> 7) & 0x7f;
      body[92] = patch.bpm & 0x7f;
    }

    // 4. Serialize signal chain (offsets 94..105)
    if (Array.isArray(patch.signalChain) && patch.signalChain.length > 0) {
      const chain = patch.signalChain.map(b => b === 'CAB' ? 'IR' : b) as BlockType[];
      if (chain.length !== 12 || new Set(chain.map(blockTypeToId)).size !== 12) throw new Error('Signal chain must contain every hardware block exactly once.');
      for (let i = 0; i < 12; i++) {
        body[94 + i] = blockTypeToId(chain[i]);
      }
    }

    // 5. Serialize preset name / user patch name (offsets 106..121)
    const nameCandidate =
      patch.userPatchName ??
      (patch.presetName && !patch.presetName.match(/^\d{2}[A-D]$/) && patch.presetName !== 'Current'
        ? patch.presetName
        : undefined);

    if (nameCandidate !== undefined && nameCandidate !== original?.userPatchName) {
      if (typeof nameCandidate !== 'string') {
        throw new Error('Preset name must be a string.');
      }
      if (nameCandidate.length > 16) {
        throw new Error(`Preset name "${nameCandidate}" exceeds 16 ASCII characters limit.`);
      }
      for (let i = 0; i < 16; i++) {
        if (i < nameCandidate.length) {
          const code = nameCandidate.charCodeAt(i);
          if (code < 0x20 || code > 0x7e) {
            throw new Error(`Preset name contains non-ASCII printable character: "${nameCandidate[i]}"`);
          }
          body[106 + i] = code;
        } else {
          body[106 + i] = 0x00;
        }
      }
    }

    return body;
  }

  /**
   * Serializes a PatchData object into raw 215-byte SysEx payload ready for transmission:
   * [preset (0..127), scene (0..2), 213 packed 7-bit bytes].
   *
   * Fully decodable by PatchDecoder.decode().
   */
  public static encode(patch: PatchData): Uint8Array {
    const body = this.encodeBody(patch);

    // Determine preset byte (0..127)
    let presetByte = 0;
    if (patch.presetName && patch.presetName.match(/^\d{2}[A-D]$/)) {
      presetByte = presetNameToProgramChange(patch.presetName);
    } else if (patch.raw && patch.raw.length === 215) {
      presetByte = patch.raw[0];
    }

    if (
      typeof presetByte !== 'number' ||
      !Number.isFinite(presetByte) ||
      !Number.isInteger(presetByte) ||
      presetByte < 0 ||
      presetByte > 127
    ) {
      throw new Error(`Invalid preset byte ${presetByte}: must be between 0 and 127.`);
    }

    // Determine scene byte (0..2)
    let sceneByte = 0;
    if (typeof patch.scene === 'number') {
      if (
        !Number.isFinite(patch.scene) ||
        !Number.isInteger(patch.scene) ||
        patch.scene < 1 ||
        patch.scene > 3
      ) {
        throw new Error(`Invalid scene ${patch.scene}: must be 1, 2, or 3.`);
      }
      sceneByte = patch.scene - 1;
    } else if (patch.raw && patch.raw.length === 215) {
      sceneByte = patch.raw[1];
    }

    if (sceneByte < 0 || sceneByte > 2) {
      throw new Error(`Invalid scene byte ${sceneByte}: must be between 0 and 2.`);
    }

    // Pack 142 decoded bytes into 213 7-bit bytes (71 triplets)
    const packed213 = packNuxPayload(body);
    if (packed213.length !== 213) {
      throw new Error(`Packed payload length is ${packed213.length}, expected 213 bytes.`);
    }

    const payload = new Uint8Array(215);
    payload[0] = presetByte;
    payload[1] = sceneByte;
    payload.set(packed213, 2);

    return payload;
  }
}
