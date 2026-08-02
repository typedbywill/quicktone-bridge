import { PatchData, EffectBlockState, BlockType } from '../types.js';
import { BLOCK_LIST, getModelName } from '../constants.js';

export class PatchDecoder {
  /**
   * Decodes a 215-222 byte NUX MG-30 patch dump into a structured PatchData object.
   */
  public static decode(rawPatchBytes: Uint8Array): PatchData {
    const raw = new Uint8Array(rawPatchBytes);

    // Default block setup
    const blocks: Record<BlockType, EffectBlockState> = {
      WAH: { id: 'WAH', enabled: false, modelId: 0, modelName: getModelName('WAH', 0), params: [] },
      CMP: { id: 'CMP', enabled: false, modelId: 0, modelName: getModelName('CMP', 0), params: [] },
      EFX: { id: 'EFX', enabled: false, modelId: 0, modelName: getModelName('EFX', 0), params: [] },
      AMP: { id: 'AMP', enabled: true,  modelId: 0, modelName: getModelName('AMP', 0), params: [] },
      EQ:  { id: 'EQ',  enabled: false, modelId: 0, modelName: getModelName('EQ',  0), params: [] },
      NG:  { id: 'NG',  enabled: true,  modelId: 0, modelName: getModelName('NG',  0), params: [] },
      MOD: { id: 'MOD', enabled: false, modelId: 0, modelName: getModelName('MOD', 0), params: [] },
      DLY: { id: 'DLY', enabled: false, modelId: 0, modelName: getModelName('DLY', 0), params: [] },
      RVB: { id: 'RVB', enabled: false, modelId: 0, modelName: getModelName('RVB', 0), params: [] },
      CAB: { id: 'CAB', enabled: true,  modelId: 0, modelName: getModelName('CAB', 0), params: [] }
    };

    // Extract BPM and Scene if payload is standard length
    let bpm = 120;
    let scene = 1;
    if (raw.length >= 20) {
      scene = (raw[0] & 0x07) + 1;
      bpm = raw[1] > 0 ? raw[1] : 120;
    }

    // Extract block ON/OFF statuses if present in raw bytes
    // In NUX patch dump: bytes 6..15 map to block statuses
    if (raw.length >= 16) {
      const blockKeys: BlockType[] = ['WAH', 'CMP', 'EFX', 'AMP', 'EQ', 'NG', 'MOD', 'DLY', 'RVB', 'CAB'];
      for (let i = 0; i < blockKeys.length; i++) {
        const key = blockKeys[i];
        const statusByte = raw[6 + i];
        if (typeof statusByte !== 'undefined') {
          blocks[key].enabled = statusByte > 0;
        }
      }
    }

    // Attempt ascii patch name extraction if embedded at offset 180+
    let userPatchName = "";
    if (raw.length >= 200) {
      const nameBytes = raw.subarray(180, 200);
      const str = String.fromCharCode(...Array.from(nameBytes)).replace(/[^\x20-\x7E]/g, '').trim();
      if (str.length > 0) {
        userPatchName = str;
      }
    }

    return {
      raw,
      presetName: "Current",
      userPatchName,
      bpm,
      scene,
      blocks,
      signalChain: Array.from(BLOCK_LIST) as BlockType[]
    };
  }
}
