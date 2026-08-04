import { PatchData, EffectBlockState, BlockType } from '../types.js';
import {
  BLOCK_LIST,
  getModelName,
  SCENE_DUMP_BLOCK_ORDER,
  SCENE_DUMP_KNOB_SLOTS,
} from '../constants.js';
import { unpackNuxPayload } from '../protocol/nuxEncoding.js';

export class PatchDecoder {
  /**
   * Decodes a NUX MG-30 scene/patch payload into structured PatchData.
   *
   * Accepts either:
   * - Full SysEx payload after header (preset, scene, then 7-bit encoded body) — typical `0B`/`0C` response
   * - Already-decoded 8-bit scene body (models + knobs layout from protocol.md §0B)
   * - Legacy raw blobs (heuristic fallback)
   */
  public static decode(rawPatchBytes: Uint8Array): PatchData {
    const raw = new Uint8Array(rawPatchBytes);

    const blocks: Record<BlockType, EffectBlockState> = {
      WAH: { id: 'WAH', enabled: false, modelId: 0, modelName: getModelName('WAH', 0), params: [] },
      NG: { id: 'NG', enabled: true, modelId: 0, modelName: getModelName('NG', 0), params: [] },
      CMP: { id: 'CMP', enabled: false, modelId: 0, modelName: getModelName('CMP', 0), params: [] },
      MOD: { id: 'MOD', enabled: false, modelId: 0, modelName: getModelName('MOD', 0), params: [] },
      EFX: { id: 'EFX', enabled: false, modelId: 0, modelName: getModelName('EFX', 0), params: [] },
      AMP: { id: 'AMP', enabled: true, modelId: 0, modelName: getModelName('AMP', 0), params: [] },
      IR: { id: 'IR', enabled: true, modelId: 0, modelName: getModelName('IR', 0), params: [] },
      EQ: { id: 'EQ', enabled: false, modelId: 0, modelName: getModelName('EQ', 0), params: [] },
      SR: { id: 'SR', enabled: false, modelId: 0, modelName: getModelName('SR', 0), params: [] },
      DLY: { id: 'DLY', enabled: false, modelId: 0, modelName: getModelName('DLY', 0), params: [] },
      RVB: { id: 'RVB', enabled: false, modelId: 0, modelName: getModelName('RVB', 0), params: [] },
      VOL: { id: 'VOL', enabled: true, modelId: 0, modelName: getModelName('VOL', 0), params: [] },
      CAB: { id: 'CAB', enabled: true, modelId: 0, modelName: getModelName('CAB', 0), params: [] },
    };

    let bpm = 120;
    let scene = 1;
    let signalChain = Array.from(BLOCK_LIST) as BlockType[];
    let userPatchName: string | undefined;

    // Try scene-dump path: payload = [preset, scene, ...encoded]
    const sceneParsed = this.tryDecodeScenePayload(raw, blocks);
    if (sceneParsed) {
      scene = sceneParsed.scene;
      bpm = sceneParsed.bpm;
      signalChain = sceneParsed.signalChain;
      userPatchName = sceneParsed.userPatchName;
    } else {
      this.applyLegacyHeuristics(raw, blocks, (v) => {
        bpm = v.bpm ?? bpm;
        scene = v.scene ?? scene;
        if (v.signalChain) signalChain = v.signalChain;
        if (v.userPatchName) userPatchName = v.userPatchName;
      });
    }

    return {
      raw,
      presetName: 'Current',
      userPatchName,
      bpm,
      scene,
      blocks,
      signalChain,
    };
  }

  /**
   * Decode protocol.md §0B/§0C scene body (already unpacked to 8-bit).
   */
  public static applyDecodedSceneBody(
    decoded: Uint8Array,
    blocks: Record<BlockType, EffectBlockState>
  ): { bpm: number; signalChain: BlockType[]; userPatchName?: string } {
    // Models at offsets 0..11 — bit 0x40 means effect OFF
    for (let i = 0; i < SCENE_DUMP_BLOCK_ORDER.length; i++) {
      if (i >= decoded.length) break;
      const block = SCENE_DUMP_BLOCK_ORDER[i];
      const rawModel = decoded[i];
      const enabled = (rawModel & 0x40) === 0;
      const modelId = rawModel & 0x3f;
      blocks[block].enabled = enabled;
      blocks[block].modelId = modelId;
      blocks[block].modelName = getModelName(block, modelId);
    }

    // Knobs: each block has [count][slot0..slotN-1] with fixed slot sizes
    let offset = 12;
    for (const block of SCENE_DUMP_BLOCK_ORDER) {
      const slots = SCENE_DUMP_KNOB_SLOTS[block] ?? 0;
      if (offset >= decoded.length) break;
      const count = decoded[offset];
      offset += 1;
      const params: number[] = [];
      for (let k = 0; k < slots; k++) {
        params.push(offset + k < decoded.length ? decoded[offset + k] & 0xff : 0);
      }
      // Keep full slot array so paramId matches MIDI CC knob index (ControlChanges.md)
      void count;
      blocks[block].params = params;
      offset += slots;
    }

    // Tempo at decoded offsets 91-92: (c1 << 7) | c2 — protocol example 00 62 = 98 bpm
    let bpm = 120;
    if (decoded.length > 92) {
      const tempo = ((decoded[91] & 0x7f) << 7) | (decoded[92] & 0x7f);
      if (tempo >= 40 && tempo <= 240) bpm = tempo;
    }

    // Signal chain at offsets 94..105
    let signalChain = Array.from(BLOCK_LIST) as BlockType[];
    if (decoded.length >= 106) {
      const chain: BlockType[] = [];
      const idToSceneBlock = (id: number): BlockType | null => {
        // Protocol block IDs: 0 WAH .. 0B VOL (no CAB)
        if (id >= 0 && id < SCENE_DUMP_BLOCK_ORDER.length) return SCENE_DUMP_BLOCK_ORDER[id];
        return null;
      };
      for (let i = 94; i <= 105 && i < decoded.length; i++) {
        const b = idToSceneBlock(decoded[i]);
        if (b && !chain.includes(b)) chain.push(b);
      }
      if (chain.length >= 5) {
        for (const b of BLOCK_LIST) {
          if (!chain.includes(b)) chain.push(b);
        }
        signalChain = chain;
      }
    }

    // Preset name at offsets 106..121
    let userPatchName: string | undefined;
    if (decoded.length >= 122) {
      let name = '';
      for (let i = 106; i < 122 && i < decoded.length; i++) {
        const c = decoded[i];
        if (c === 0) break;
        if (c >= 0x20 && c <= 0x7e) name += String.fromCharCode(c);
      }
      const cleaned = name.trim();
      if (cleaned.length >= 1) userPatchName = cleaned;
    }

    return { bpm, signalChain, userPatchName };
  }

  private static tryDecodeScenePayload(
    raw: Uint8Array,
    blocks: Record<BlockType, EffectBlockState>
  ): { scene: number; bpm: number; signalChain: BlockType[]; userPatchName?: string } | null {
    // Encoded SysEx payload: [preset][scene 0..2][triplets...]
    // scene byte must be 0..2 — distinguishes from legacy blobs that store BPM at index 1
    if (raw.length >= 11) {
      const sceneByte = raw[1] & 0x7f;
      const encoded = raw.subarray(2);
      if (sceneByte <= 2 && encoded.length >= 9) {
        const decoded = unpackNuxPayload(encoded);
        if (decoded.length >= 90 && this.looksLikeDecodedScene(decoded)) {
          const applied = this.applyDecodedSceneBody(decoded, blocks);
          return { scene: sceneByte + 1, ...applied };
        }
      }
    }

    // Already-decoded 8-bit scene body (models + knobs)
    if (raw.length >= 90 && this.looksLikeDecodedScene(raw)) {
      const applied = this.applyDecodedSceneBody(raw, blocks);
      return { scene: 1, ...applied };
    }

    return null;
  }

  private static looksLikeDecodedScene(data: Uint8Array): boolean {
    if (data.length < 36) return false;
    const wahCount = data[12];
    const cmpCount = data[15];
    const ampCount = data[27];
    // Amps always expose knobs in real dumps; all-zero blobs fall through to legacy heuristics
    if (wahCount > 8 || cmpCount > 8 || ampCount < 1 || ampCount > 12) return false;
    let modelSum = 0;
    for (let i = 0; i < 12; i++) modelSum += data[i];
    return modelSum > 0;
  }

  private static applyLegacyHeuristics(
    raw: Uint8Array,
    blocks: Record<BlockType, EffectBlockState>,
    setMeta: (v: { bpm?: number; scene?: number; signalChain?: BlockType[]; userPatchName?: string }) => void
  ): void {
    let bpm: number | undefined;
    let scene: number | undefined;

    if (raw.length > 169 && raw[169] >= 40 && raw[169] <= 240) {
      bpm = raw[169];
    } else if (raw.length >= 2 && raw[1] >= 40 && raw[1] <= 240) {
      bpm = raw[1];
    }

    if (raw.length > 176 && raw[176] >= 1 && raw[176] <= 3) {
      scene = raw[176];
    } else if (raw.length >= 1) {
      const rawScene = (raw[0] & 0x03) + 1;
      if (rawScene >= 1 && rawScene <= 3) scene = rawScene;
    }

    const isHardwareBlockOn = raw.length > 1 ? raw[1] === 1 : false;
    for (const b of BLOCK_LIST) {
      if (b === 'MOD' || b === 'EFX' || b === 'DLY' || b === 'RVB' || b === 'WAH' || b === 'CMP' || b === 'EQ' || b === 'NG' || b === 'SR') {
        blocks[b].enabled = isHardwareBlockOn;
      }
    }

    let userPatchName: string | undefined;
    if (raw.length >= 20) {
      for (let offset = 0; offset < raw.length - 8; offset++) {
        let ascii = '';
        let j = offset;
        while (j < raw.length && raw[j] >= 0x20 && raw[j] <= 0x7e) {
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

    let signalChain: BlockType[] | undefined;
    if (raw.length >= 160) {
      const chainCandidates: BlockType[] = [];
      for (let i = 140; i < Math.min(180, raw.length); i++) {
        const id = raw[i];
        if (id >= 0 && id < BLOCK_LIST.length) {
          const b = BLOCK_LIST[id];
          if (!chainCandidates.includes(b)) chainCandidates.push(b);
        }
      }
      if (chainCandidates.length >= 5) {
        for (const b of BLOCK_LIST) {
          if (!chainCandidates.includes(b)) chainCandidates.push(b);
        }
        signalChain = chainCandidates;
      }
    }

    setMeta({ bpm, scene, signalChain, userPatchName });
  }
}
