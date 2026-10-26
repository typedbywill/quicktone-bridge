/**
 * NUX MG-30 Protocol Constants & Complete Official Model Catalog
 */

import { BlockType } from './types.js';

export const NUX_SYSEX_HEADER = [0xF0, 0x43, 0x58, 0x70] as const;
export const SYSEX_END = 0xF7;

export const DEFAULT_INPUT_PORT_NAME = "NUX MG-30 MIDI IN";
export const DEFAULT_OUTPUT_PORT_NAME = "NUX MG-30 MIDI OUT";

/**
 * Standard CC control mappings for NUX MG-30
 */
export const CC_MAPPINGS = {
  EXPRESSION_PEDAL: 0x4F, // 79
  TAP_TEMPO: 0x40,        // 64
  TUNER_TOGGLE: 0x4B,     // 75
  CTRL_FOOTSWITCH: 0x50,  // 80
  SCENE_SELECT: 0x50,     // 80 (0=Scene 1, 1=Scene 2, 2=Scene 3)
} as const;

/**
 * Knob parameter MIDI CC base (QuickTone Settings → Custom MIDI / docs/ControlChanges.md).
 * CC number = baseCc + paramId (0-based knob index within the block).
 * Note: While the QuickTone CC mapping slider uses 0..100, hardware SysEx knobs
 * are 8-bit / bitpacked (0..255).
 */
export const PARAM_CC_MAX = 100;

export const PARAM_CC_MAP: Record<BlockType, { baseCc: number; maxKnobs: number } | null> = {
  WAH: { baseCc: 12, maxKnobs: 2 },
  CMP: { baseCc: 14, maxKnobs: 4 },
  EFX: { baseCc: 18, maxKnobs: 6 },
  AMP: { baseCc: 24, maxKnobs: 8 },
  EQ: { baseCc: 32, maxKnobs: 12 },
  NG: { baseCc: 44, maxKnobs: 4 },
  MOD: { baseCc: 48, maxKnobs: 6 },
  DLY: { baseCc: 54, maxKnobs: 8 },
  RVB: { baseCc: 62, maxKnobs: 4 },
  IR: { baseCc: 66, maxKnobs: 6 },
  SR: { baseCc: 72, maxKnobs: 3 }, // Send, Return, SR Routing
  VOL: { baseCc: 75, maxKnobs: 3 }, // Patch Min, Patch Max, Patch Volume
  CAB: { baseCc: 66, maxKnobs: 6 }, // Alias to IR for API compatibility
};

/**
 * Resolve MIDI CC number for a block knob, or null if the block has no CC knobs.
 */
export function paramToCc(block: BlockType, paramId: number): number | null {
  if (typeof paramId !== 'number' || !Number.isInteger(paramId)) {
    return null;
  }
  const target: BlockType = block === 'CAB' ? 'IR' : block;
  const entry = PARAM_CC_MAP[target];
  if (!entry) return null;
  if (paramId < 0 || paramId >= entry.maxKnobs) return null;
  return entry.baseCc + paramId;
}

/**
 * Scene dump block order (protocol.md §0B) — 12 hardware blocks.
 */
export const SCENE_DUMP_BLOCK_ORDER: BlockType[] = [
  'WAH', 'CMP', 'EFX', 'AMP', 'EQ', 'NG', 'MOD', 'DLY', 'RVB', 'IR', 'SR', 'VOL',
];

/**
 * Fixed knob slot sizes in the decoded scene dump (count byte + N value slots).
 * Matches protocol.md §0B layout offsets 12–88.
 */
export const SCENE_DUMP_KNOB_SLOTS: Record<string, number> = {
  WAH: 2,
  CMP: 4,
  EFX: 6,
  AMP: 8,
  EQ: 12,
  NG: 4,
  MOD: 6,
  DLY: 8,
  RVB: 4,
  IR: 6,
  CAB: 6, // Alias to IR
  SR: 3,
  VOL: 2,
};

/** Bit set on a scene-dump model byte when the effect block is OFF. */
export const SCENE_MODEL_OFF_BIT = 0x40;

/**
 * Byte offset of a block's model id inside the unpacked scene body (protocol.md §0B).
 * Accepts CAB as alias to IR.
 */
export function sceneModelOffset(block: BlockType): number {
  const target: BlockType = block === 'CAB' ? 'IR' : block;
  const idx = SCENE_DUMP_BLOCK_ORDER.indexOf(target);
  if (idx < 0) {
    throw new Error(`Block ${block} has no model slot in the scene dump.`);
  }
  return idx;
}

/**
 * Byte offset of a knob value inside the unpacked scene body.
 * Layout: 12 model bytes, then per block [count][slot0..N-1].
 * Accepts CAB as alias to IR.
 */
export function sceneKnobOffset(block: BlockType, paramId: number): number {
  if (typeof paramId !== 'number' || !Number.isInteger(paramId)) {
    throw new Error(`Invalid paramId ${paramId}: must be an integer.`);
  }
  const target: BlockType = block === 'CAB' ? 'IR' : block;
  let offset = 12;
  for (const b of SCENE_DUMP_BLOCK_ORDER) {
    const slots = SCENE_DUMP_KNOB_SLOTS[b] ?? 0;
    offset += 1; // count byte
    if (b === target) {
      if (paramId < 0 || paramId >= slots) {
        throw new Error(`Block ${block} param ${paramId} out of range (0..${slots - 1}).`);
      }
      return offset + paramId;
    }
    offset += slots;
  }
  throw new Error(`Block ${block} has no knob slots in the scene dump.`);
}

/**
 * Block types in signal routing order & index mapping (12 physical hardware blocks).
 * CAB is an alias for IR (both map to index 9).
 */
export const BLOCK_LIST: BlockType[] = [
  'WAH', // 0
  'CMP', // 1
  'EFX', // 2
  'AMP', // 3
  'EQ',  // 4
  'NG',  // 5
  'MOD', // 6
  'DLY', // 7
  'RVB', // 8
  'IR',  // 9
  'SR',  // 10
  'VOL'  // 11
];

/** Alias pointing to the 12 hardware blocks */
export const HARDWARE_BLOCK_LIST: BlockType[] = BLOCK_LIST;
export const HARDWARE_BLOCK_IDS = BLOCK_LIST;

/**
 * Numbered MG-30 UI tables from QuickTone 2.6.7.16 (Windows).
 * Executable SHA-256: 0d64728f8f0e013114c228c8e6f9a8f3c648a5f82ff54ff03081c930ebd771d6.
 * Original file offsets 0x955e4c..0x956714, bounded by "NUX MG-30" and "NUX MG-400".
 * Preserve the shipped labels and numbering, including duplicate AMP labels.
 * IR USER/COLLECTION headings are not numbered model IDs; their slot mapping is omitted.
 */
const CAB_IR_MODELS = [
  { id: 0, name: 'BYPASS' },
  { id: 1, name: 'JZ120' },
  { id: 2, name: 'DR112' },
  { id: 3, name: 'BS410' },
  { id: 4, name: 'A212' },
  { id: 5, name: 'TR212' },
  { id: 6, name: '1960' },
  { id: 7, name: 'GB412' },
  { id: 8, name: 'V412' },
  { id: 9, name: 'SWAMP THANG' },
  { id: 10, name: 'CANNABIS REX 12' },
  { id: 11, name: 'LEGEND 1058' },
  { id: 12, name: 'CV-75' },
  { id: 13, name: 'AGL DB810' },
  { id: 14, name: 'AMP SV810' },
  { id: 15, name: 'AMP SV410' },
  { id: 16, name: 'AMP SV212' },
  { id: 17, name: 'MKB 410' },
  { id: 18, name: 'TRC 410' },
  { id: 19, name: 'EDEN 410' },
  { id: 20, name: 'BASSGUY 410' },
  { id: 21, name: 'M-D45' },
  { id: 22, name: 'G-HBIRD' },
  { id: 23, name: 'G-J15' },
];

export const NUX_MODEL_CATALOG: Record<BlockType, { id: number; name: string; description?: string }[]> = {
  WAH: [
    { id: 0, name: 'BYPASS' },
    { id: 1, name: 'CLYDE' },
    { id: 2, name: 'CRY BB' },
    { id: 3, name: 'V847' },
    { id: 4, name: 'HORSE WAH' },
    { id: 5, name: 'OCTAVE-SHIFT' },
  ],
  CMP: [
    { id: 0, name: 'BYPASS' },
    { id: 1, name: 'ROSE COMP' },
    { id: 2, name: 'K COMP' },
    { id: 3, name: 'STUDIO COMP' },
  ],
  EFX: [
    { id: 0, name: 'BYPASS' },
    { id: 1, name: 'DISTORTION+' },
    { id: 2, name: 'RC BOOST' },
    { id: 3, name: 'AC BOOST' },
    { id: 4, name: 'DIST ONE' },
    { id: 5, name: 'T SCREAM' },
    { id: 6, name: 'BLUES DRV' },
    { id: 7, name: 'MORNING DRV' },
    { id: 8, name: 'EAT DIST' },
    { id: 9, name: 'RED DIRT' },
    { id: 10, name: 'CRUNCH' },
    { id: 11, name: 'MUFF FUZZ' },
    { id: 12, name: 'KATANA' },
    { id: 13, name: 'ST SINGER' },
    { id: 14, name: 'RED FUZZ' },
    { id: 15, name: 'TOUCH WAH' },
    { id: 16, name: 'FULL-OD HP' },
    { id: 17, name: 'HORSEMAN OD' },
    { id: 18, name: 'NOB PDR' },
    { id: 19, name: 'RIV BLUEFLOG' },
    { id: 20, name: 'TURBO OD' },
  ],
  AMP: [
    { id: 0, name: 'BYPASS' },
    { id: 1, name: 'JAZZ CLEAN' },
    { id: 2, name: 'DELXUE RVB' },
    { id: 3, name: 'BASSMATE' },
    { id: 4, name: 'TWEEDY' },
    { id: 5, name: 'TWIN RVB' },
    { id: 6, name: 'HIWIRE' },
    { id: 7, name: 'CALI CRUNCH' },
    { id: 8, name: 'CLASS A15' },
    { id: 9, name: 'CLASS A30' },
    { id: 10, name: 'PLEXI 100' },
    { id: 11, name: 'PLEXI 45' },
    { id: 12, name: 'BRIT 800' },
    { id: 13, name: '1987 X 50' },
    { id: 14, name: 'SLO 100' },
    { id: 15, name: 'FIREMAN HBE' },
    { id: 16, name: 'DUAL RECT' },
    { id: 17, name: 'DIE VH4' },
    { id: 18, name: 'VIB KING' },
    { id: 19, name: 'BUDDA' },
    { id: 20, name: 'MR.Z 38' },
    { id: 21, name: 'SUPER RVB' },
    { id: 22, name: 'BRIT BLUES' },
    { id: 23, name: 'MATCH' },
    { id: 24, name: 'BRIT 2000' },
    { id: 25, name: 'UBER' },
    { id: 26, name: 'AGL' },
    { id: 27, name: 'BASSGUY' },
    { id: 28, name: 'MLD' },
    { id: 29, name: 'OPTIMA AIR' },
    { id: 30, name: 'STAGEMAN' },
    { id: 31, name: 'DGLASS' },
    { id: 32, name: 'STARLIFT' },
    { id: 33, name: 'VIVO' },
    { id: 34, name: 'PRINCETONE' },
    { id: 35, name: 'L STAR' },
    { id: 36, name: 'DELUXE RVB' },
    { id: 37, name: 'CLASS A30' },
    { id: 38, name: 'FIREMAN HBE' },
  ],
  EQ: [
    { id: 0, name: 'BYPASS' },
    { id: 1, name: '6-BAND EQ' },
    { id: 2, name: 'ALIGN EQ' },
    { id: 3, name: '10-BAND EQ' },
    { id: 4, name: 'PARA EQ' },
  ],
  NG: [
    { id: 0, name: 'BYPASS' },
    { id: 1, name: 'NOISE GATE' },
  ],
  MOD: [
    { id: 0, name: 'BYPASS' },
    { id: 1, name: 'CE-1' },
    { id: 2, name: 'CE-2' },
    { id: 3, name: 'ST.CHORUS' },
    { id: 4, name: 'VIBRATOR' },
    { id: 5, name: 'DETUNE' },
    { id: 6, name: 'FLANGER' },
    { id: 7, name: 'PHASE 90' },
    { id: 8, name: 'PHASE 100' },
    { id: 9, name: 'S.C.F' },
    { id: 10, name: 'U-VIBE' },
    { id: 11, name: 'TREMOLO' },
    { id: 12, name: 'ROTARY SPEAKER' },
    { id: 13, name: 'HARMONIST' },
    { id: 14, name: 'SCH-1' },
    { id: 15, name: 'SUOCTAVE' },
  ],
  DLY: [
    { id: 0, name: 'BYPASS' },
    { id: 1, name: 'ANALOG DELAY' },
    { id: 2, name: 'DIGITAL DELAY' },
    { id: 3, name: 'MODULATION' },
    { id: 4, name: 'TAPE ECHO' },
    { id: 5, name: 'REVERSE' },
    { id: 6, name: 'PAN DELAY' },
    { id: 7, name: 'DUOTIME' },
    { id: 8, name: 'PHI DELAY' },
  ],
  RVB: [
    { id: 0, name: 'BYPASS' },
    { id: 1, name: 'ROOM' },
    { id: 2, name: 'HALL' },
    { id: 3, name: 'PLATE' },
    { id: 4, name: 'SPRING' },
    { id: 5, name: 'SHIMMER' },
    { id: 6, name: 'DAMP' },
  ],
  CAB: CAB_IR_MODELS,
  IR: CAB_IR_MODELS,
  SR: [
    { id: 0, name: 'BYPASS' },
    { id: 1, name: 'SEND/RETURN' },
  ],
  VOL: [
    { id: 0, name: 'BYPASS' },
    { id: 1, name: 'PATCH LEVEL' },
  ],
};

const IR_PARAM_CATALOG = [
  { id: 0, name: 'Knob 1' },
  { id: 1, name: 'Knob 2' },
  { id: 2, name: 'Level' },
  { id: 3, name: 'Low Cut' },
  { id: 4, name: 'High Cut' },
  { id: 5, name: 'Knob 6' },
];

/**
 * Knob names aligned with scene-dump order (protocol.md §0B) and ControlChanges.md knob indices.
 * Slot count matches SCENE_DUMP_KNOB_SLOTS / PARAM_CC_MAP.maxKnobs where applicable.
 */
export const NUX_BLOCK_PARAM_CATALOG: Record<BlockType, { id: number; name: string }[]> = {
  WAH: [
    { id: 0, name: 'Knob 1' },
    { id: 1, name: 'Knob 2' },
  ],
  CMP: [
    { id: 0, name: 'Sustain' },
    { id: 1, name: 'Level' },
    { id: 2, name: 'Attack' },
    { id: 3, name: 'Clipping' },
  ],
  EFX: [
    { id: 0, name: 'Drive' },
    { id: 1, name: 'Tone' },
    { id: 2, name: 'Level' },
    { id: 3, name: 'Knob 4' },
    { id: 4, name: 'Knob 5' },
    { id: 5, name: 'Knob 6' },
  ],
  AMP: [
    { id: 0, name: 'Gain' },
    { id: 1, name: 'Master' },
    { id: 2, name: 'Bass' },
    { id: 3, name: 'Middle' },
    { id: 4, name: 'Treble' },
    { id: 5, name: 'Presence' },
    { id: 6, name: 'Bias' },
    { id: 7, name: 'Level' },
  ],
  EQ: [
    { id: 0, name: 'Band 1' },
    { id: 1, name: 'Band 2' },
    { id: 2, name: 'Band 3' },
    { id: 3, name: 'Band 4' },
    { id: 4, name: 'Band 5' },
    { id: 5, name: 'Band 6' },
    { id: 6, name: 'Band 7' },
    { id: 7, name: 'Band 8' },
    { id: 8, name: 'Band 9' },
    { id: 9, name: 'Band 10' },
    { id: 10, name: 'Band 11' },
    { id: 11, name: 'Band 12' },
  ],
  NG: [
    { id: 0, name: 'Sens' },
    { id: 1, name: 'Decay' },
    { id: 2, name: 'Knob 3' },
    { id: 3, name: 'Knob 4' },
  ],
  MOD: [
    { id: 0, name: 'Rate' },
    { id: 1, name: 'Depth' },
    { id: 2, name: 'Mix' },
    { id: 3, name: 'Tone' },
    { id: 4, name: 'Knob 5' },
    { id: 5, name: 'Knob 6' },
  ],
  DLY: [
    { id: 0, name: 'Level' },
    { id: 1, name: 'Time' },
    { id: 2, name: 'Knob 3' },
    { id: 3, name: 'Repeat' },
    { id: 4, name: 'Time 2' },
    { id: 5, name: 'Knob 6' },
    { id: 6, name: 'Repeat 2' },
    { id: 7, name: 'Parameter' },
  ],
  RVB: [
    { id: 0, name: 'Mix' },
    { id: 1, name: 'Decay' },
    { id: 2, name: 'Shim' },
    { id: 3, name: 'Knob 4' },
  ],
  CAB: IR_PARAM_CATALOG,
  IR: IR_PARAM_CATALOG,
  SR: [
    { id: 0, name: 'Send' },
    { id: 1, name: 'Return' },
    { id: 2, name: 'Routing' },
  ],
  VOL: [
    { id: 0, name: 'Min' },
    { id: 1, name: 'Max' },
    { id: 2, name: 'Volume' },
  ],
};

export function findBlockParam(blockInput?: string, paramInput?: string | number): { block: BlockType; paramId: number; paramName: string } {
  let block: BlockType | undefined;
  let selector: string | number;
  if (blockInput && paramInput !== undefined) {
    block = idToBlockType(blockTypeToId(blockInput)); selector = paramInput;
  } else if (blockInput) {
    try { block = idToBlockType(blockTypeToId(blockInput)); } catch { /* Treat a single argument as a parameter name. */ }
    selector = block ? (NUX_BLOCK_PARAM_CATALOG[block][0]?.name ?? '0') : blockInput;
  } else { block = 'AMP'; selector = paramInput ?? 'Gain'; }
  if (typeof selector === 'number' || /^\d+$/.test(String(selector))) {
    if (!block) throw new Error('A numeric parameter index requires an explicit block.');
    const paramId = Number(selector); sceneKnobOffset(block, paramId);
    return { block, paramId, paramName: NUX_BLOCK_PARAM_CATALOG[block].find(p => p.id === paramId)?.name ?? `Param #${paramId}` };
  }
  const search = String(selector).trim().toLowerCase();
  if (!search) throw new Error('Parameter name cannot be empty.');
  const candidates = (block ? [block] : BLOCK_LIST).flatMap(b => NUX_BLOCK_PARAM_CATALOG[b].map(p => ({ block: b, paramId: p.id, paramName: p.name })));
  const exact = candidates.filter(p => p.paramName.toLowerCase() === search);
  const matches = exact.length ? exact : candidates.filter(p => p.paramName.toLowerCase().includes(search));
  if (matches.length !== 1) throw new Error(matches.length ? `Ambiguous parameter "${selector}"; specify a block.` : `Unknown parameter "${selector}".`);
  sceneKnobOffset(matches[0].block, matches[0].paramId);
  return matches[0];
}

export function getModelName(block: BlockType, modelId: number): string {
  const target: BlockType = block === 'CAB' ? 'IR' : block;
  const list = NUX_MODEL_CATALOG[target];
  if (!list) return `Model #${modelId}`;
  const found = list.find(m => m.id === modelId);
  return found ? found.name : `Model #${modelId}`;
}

export function findModel(
  block: BlockType,
  selector: string | number
): { id: number; name: string; description?: string } {
  const target: BlockType = block === 'CAB' ? 'IR' : block;
  const list = NUX_MODEL_CATALOG[target] || [];
  if (list.length === 0) {
    throw new Error(`Bloco ${block} não possui modelos no catálogo.`);
  }

  if (typeof selector === 'number' || (typeof selector === 'string' && selector.trim() !== '' && !isNaN(Number(selector)))) {
    const id = Number(selector);
    const found = list.find(m => m.id === id);
    if (found) return found;
    throw new Error(
      `Modelo #${id} não encontrado no bloco ${block}. Use: nux block model ${block}`
    );
  }

  const search = selector.toString().toLowerCase().trim();
  const exact = list.filter(m => m.name.toLowerCase() === search);
  if (exact.length === 1) return exact[0];

  const partial = exact.length > 1 ? exact : list.filter(m => m.name.toLowerCase().includes(search));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    const names = partial.map(m => `[${m.id}] ${m.name}`).join(', ');
    throw new Error(`Modelo ambíguo "${selector}" em ${block}. Candidatos: ${names}`);
  }

  throw new Error(
    `Modelo "${selector}" não encontrado no bloco ${block}. Use: nux block model ${block}`
  );
}

export function blockTypeToId(block: BlockType | number | string): number {
  if (typeof block === 'number') {
    if (!Number.isInteger(block) || block < 0 || block >= BLOCK_LIST.length) {
      throw new Error(`Invalid block ID ${block}. Expected integer between 0 and ${BLOCK_LIST.length - 1}.`);
    }
    return block;
  }
  const str = block.toString().toUpperCase().trim().replace('/', '');
  if (str === 'CAB' || str === 'IR') {
    return 9;
  }
  if (str === 'SR' || str === 'S/R') {
    return 10;
  }
  const idx = BLOCK_LIST.findIndex(b => b.toUpperCase() === str);
  if (idx === -1) {
    throw new Error(`Unknown block name "${block}". Expected one of: ${BLOCK_LIST.join(', ')}, CAB.`);
  }
  return idx;
}

export function idToBlockType(id: number): BlockType {
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 0 || id >= BLOCK_LIST.length) {
    throw new Error(`Invalid block ID ${id}. Expected integer between 0 and ${BLOCK_LIST.length - 1}.`);
  }
  return BLOCK_LIST[id];
}

/**
 * Helper to convert 0-indexed Program Change (0..127) to MG-30 preset string (e.g. 0 -> "01A", 1 -> "01B", 4 -> "02A")
 */
export function programChangeToPresetName(pc: number): { bank: number; channel: 'A' | 'B' | 'C' | 'D'; name: string } {
  if (typeof pc !== 'number' || !Number.isInteger(pc) || pc < 0 || pc > 127) {
    throw new Error(`Invalid program change number ${pc}. Must be an integer between 0 and 127.`);
  }
  const bank = Math.floor(pc / 4) + 1;
  const channels: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
  const channel = channels[pc % 4];
  const formattedBank = bank.toString().padStart(2, '0');
  return {
    bank,
    channel,
    name: `${formattedBank}${channel}`
  };
}

/**
 * Helper to convert preset string (e.g. "01A", "02C") to 0-indexed Program Change byte (0..127)
 */
export function presetNameToProgramChange(presetStr: string): number {
  if (typeof presetStr !== 'string') {
    throw new Error(`Invalid preset string: must be a string.`);
  }
  const match = presetStr.trim().toUpperCase().match(/^(\d{1,2})([A-D])$/);
  if (!match) {
    throw new Error(`Invalid preset format "${presetStr}". Expected format like "01A" or "12C".`);
  }
  const bank = parseInt(match[1], 10);
  if (bank < 1 || bank > 32) {
    throw new Error(`Invalid bank ${bank}. Must be between 1 and 32.`);
  }
  const channelMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  const channelIdx = channelMap[match[2]];
  return (bank - 1) * 4 + channelIdx;
}
