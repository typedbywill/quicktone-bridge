import { PatchData, EffectBlockState, BlockType } from '../types.js';
import {
  BLOCK_LIST,
  getModelName,
  SCENE_DUMP_BLOCK_ORDER,
  SCENE_DUMP_KNOB_SLOTS,
  programChangeToPresetName,
} from '../constants.js';
import { encodedSceneBody } from '../protocol/validation.js';
import { unpackNuxPayload } from '../protocol/nuxEncoding.js';

export class PatchDecoder {
  /**
   * Decodes a NUX MG-30 patch payload into structured PatchData.
   *
   * Accepts strictly:
   * - Full 215-byte SysEx payload [preset (0..127), scene (0..2), 213 packed bytes]
   * - Decoded 142-byte scene body
   *
   * Rejects invalid sizes and structures, throwing descriptive errors.
   */
  public static decode(rawPatchBytes: Uint8Array): PatchData {
    if (!(rawPatchBytes instanceof Uint8Array)) {
      throw new Error('Patch payload must be a Uint8Array.');
    }

    let decodedBody: Uint8Array;
    let scene = 1;
    let presetName = 'Current';

    if (rawPatchBytes.length === 215) {
      const presetByte = rawPatchBytes[0];
      if (presetByte < 0 || presetByte > 127) {
        throw new Error(`Invalid preset byte ${presetByte}: must be between 0 and 127.`);
      }

      const sceneByte = rawPatchBytes[1];
      if (sceneByte < 0 || sceneByte > 2) {
        throw new Error(`Invalid scene byte ${sceneByte}: must be between 0 and 2.`);
      }
      scene = sceneByte + 1;
      presetName = programChangeToPresetName(presetByte).name;

      decodedBody = unpackNuxPayload(encodedSceneBody(rawPatchBytes.subarray(2)));
      if (decodedBody.length !== 142) {
        throw new Error(`Unpacked payload length is ${decodedBody.length}, expected exactly 142 bytes.`);
      }
    } else if (rawPatchBytes.length === 142) {
      decodedBody = new Uint8Array(rawPatchBytes);
    } else {
      throw new Error(
        `Invalid patch payload length ${rawPatchBytes.length}. Expected exactly 215 bytes (SysEx payload) or 142 bytes (decoded scene body).`
      );
    }

    const { bpm, signalChain, userPatchName, blocks } = this.parseAndValidateSceneBody(decodedBody);

    return {
      raw: new Uint8Array(rawPatchBytes),
      presetName,
      userPatchName,
      bpm,
      scene,
      blocks,
      signalChain,
    };
  }

  /**
   * Parses and strictly validates a 142-byte decoded scene body.
   */
  public static parseAndValidateSceneBody(decodedBody: Uint8Array): {
    bpm: number;
    signalChain: BlockType[];
    userPatchName?: string;
    blocks: Record<BlockType, EffectBlockState>;
  } {
    if (decodedBody.length !== 142) {
      throw new Error(`Scene body length must be exactly 142 bytes, received ${decodedBody.length}.`);
    }

    // 1. Validate and extract knobs (offsets 12..88)
    let offset = 12;
    const blockParams: Record<string, number[]> = {};

    for (const block of SCENE_DUMP_BLOCK_ORDER) {
      const maxSlots = SCENE_DUMP_KNOB_SLOTS[block] ?? 0;
      const count = decodedBody[offset];
      if (count > maxSlots) {
        throw new Error(
          `Invalid knob count ${count} for block ${block} at offset ${offset}. Maximum allowed slots: ${maxSlots}.`
        );
      }
      offset += 1;
      const params: number[] = [];
      for (let k = 0; k < maxSlots; k++) {
        params.push(decodedBody[offset + k] & 0xff);
      }
      blockParams[block] = params;
      offset += maxSlots;
    }

    // 2. Validate and extract 12 hardware model slots (offsets 0..11)
    const blocks: Record<BlockType, EffectBlockState> = {} as any;
    for (let i = 0; i < SCENE_DUMP_BLOCK_ORDER.length; i++) {
      const block = SCENE_DUMP_BLOCK_ORDER[i];
      const rawModel = decodedBody[i];
      const enabled = (rawModel & 0x40) === 0;
      const modelId = rawModel & 0x3f;
      blocks[block] = {
        id: block,
        enabled,
        modelId,
        modelName: getModelName(block, modelId),
        params: blockParams[block] ?? [],
      };
    }

    // CAB is kept as an alias / consistent copy of IR object without appending CAB to signalChain
    blocks.CAB = {
      ...blocks.IR,
      id: 'CAB',
    };

    // 3. Tempo at decoded offsets 91-92: (c1 << 7) | c2
    let bpm = 120;
    const tempo = ((decodedBody[91] & 0x7f) << 7) | (decodedBody[92] & 0x7f);
    if (tempo >= 40 && tempo <= 240) {
      bpm = tempo;
    }

    // 4. Signal chain at offsets 94..105: strict 12-block permutation
    const seen = new Set<number>();
    const signalChain: BlockType[] = [];
    for (let i = 94; i <= 105; i++) {
      const blockId = decodedBody[i];
      if (blockId < 0 || blockId > 11 || seen.has(blockId)) {
        throw new Error(
          `Invalid signal chain at offset ${i}: block ID ${blockId} violates the strict 12-block permutation requirement.`
        );
      }
      seen.add(blockId);
      signalChain.push(BLOCK_LIST[blockId]);
    }

    // 5. Preset name at offsets 106..121 (up to 16 ASCII printable characters)
    let userPatchName: string | undefined;
    let name = '';
    for (let i = 106; i < 122; i++) {
      const c = decodedBody[i];
      if (c === 0) break;
      if (c >= 0x20 && c <= 0x7e) {
        name += String.fromCharCode(c);
      }
    }
    const trimmed = name.trim();
    if (trimmed.length > 0) {
      userPatchName = trimmed;
    }

    return { bpm, signalChain, userPatchName, blocks };
  }

  /**
   * Compatibility wrapper for applying decoded scene body into an existing blocks record.
   */
  public static applyDecodedSceneBody(
    decoded: Uint8Array,
    blocks: Record<BlockType, EffectBlockState>
  ): { bpm: number; signalChain: BlockType[]; userPatchName?: string } {
    const result = this.parseAndValidateSceneBody(decoded);
    for (const b of SCENE_DUMP_BLOCK_ORDER) {
      blocks[b] = result.blocks[b];
    }
    blocks.CAB = result.blocks.CAB;
    return {
      bpm: result.bpm,
      signalChain: result.signalChain,
      userPatchName: result.userPatchName,
    };
  }
}
