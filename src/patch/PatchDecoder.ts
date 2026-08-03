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
      NG:  { id: 'NG',  enabled: true,  modelId: 0, modelName: getModelName('NG',  0), params: [] },
      CMP: { id: 'CMP', enabled: false, modelId: 0, modelName: getModelName('CMP', 0), params: [] },
      MOD: { id: 'MOD', enabled: false, modelId: 0, modelName: getModelName('MOD', 0), params: [] },
      EFX: { id: 'EFX', enabled: false, modelId: 0, modelName: getModelName('EFX', 0), params: [] },
      AMP: { id: 'AMP', enabled: true,  modelId: 0, modelName: getModelName('AMP', 0), params: [] },
      IR:  { id: 'IR',  enabled: true,  modelId: 0, modelName: getModelName('IR',  0), params: [] },
      EQ:  { id: 'EQ',  enabled: false, modelId: 0, modelName: getModelName('EQ',  0), params: [] },
      SR:  { id: 'SR',  enabled: false, modelId: 0, modelName: getModelName('SR',  0), params: [] },
      DLY: { id: 'DLY', enabled: false, modelId: 0, modelName: getModelName('DLY', 0), params: [] },
      RVB: { id: 'RVB', enabled: false, modelId: 0, modelName: getModelName('RVB', 0), params: [] },
      VOL: { id: 'VOL', enabled: true,  modelId: 0, modelName: getModelName('VOL', 0), params: [] },
      CAB: { id: 'CAB', enabled: true,  modelId: 0, modelName: getModelName('CAB', 0), params: [] }
    };

    let bpm = 120;
    let scene = 1;

    // Extract BPM from raw dump if present
    if (raw.length > 169 && raw[169] >= 40 && raw[169] <= 240) {
      bpm = raw[169];
    } else if (raw.length >= 2 && raw[1] >= 40 && raw[1] <= 240) {
      bpm = raw[1];
    }

    // Extract Scene (1..3)
    if (raw.length > 176 && raw[176] >= 1 && raw[176] <= 3) {
      scene = raw[176];
    } else if (raw.length >= 1) {
      const rawScene = (raw[0] & 0x03) + 1;
      if (rawScene >= 1 && rawScene <= 3) {
        scene = rawScene;
      }
    }

    // Set default block states based on raw[1] active block toggle state
    const isHardwareBlockOn = raw.length > 1 ? (raw[1] === 1) : false;
    for (const b of BLOCK_LIST) {
      if (b === 'MOD' || b === 'EFX' || b === 'DLY' || b === 'RVB' || b === 'WAH' || b === 'CMP' || b === 'EQ' || b === 'NG' || b === 'SR') {
        blocks[b].enabled = isHardwareBlockOn;
      }
    }

    // Attempt ascii patch name extraction by scanning for printable string runs of >= 3 chars
    let userPatchName = "";
    if (raw.length >= 20) {
      for (let offset = 0; offset < raw.length - 8; offset++) {
        let ascii = "";
        let j = offset;
        while (j < raw.length && raw[j] >= 0x20 && raw[j] <= 0x7E) {
          ascii += String.fromCharCode(raw[j]);
          j++;
        }
        const cleaned = ascii.trim();
        if (cleaned.length >= 3 && cleaned.length <= 20 && !cleaned.includes('QuickTone') && !cleaned.startsWith('7d')) {
          userPatchName = cleaned;
          break;
        }
      }
    }

    // Extract signal chain if present in payload
    let signalChain = Array.from(BLOCK_LIST) as BlockType[];
    if (raw.length >= 160) {
      const chainCandidates: BlockType[] = [];
      for (let i = 140; i < Math.min(180, raw.length); i++) {
        const id = raw[i];
        if (id >= 0 && id < BLOCK_LIST.length) {
          const b = BLOCK_LIST[id];
          if (!chainCandidates.includes(b)) {
            chainCandidates.push(b);
          }
        }
      }
      if (chainCandidates.length >= 5) {
        for (const b of BLOCK_LIST) {
          if (!chainCandidates.includes(b)) {
            chainCandidates.push(b);
          }
        }
        signalChain = chainCandidates;
      }
    }

    return {
      raw,
      presetName: "Current",
      userPatchName: userPatchName || undefined,
      bpm,
      scene,
      blocks,
      signalChain
    };
  }
}
