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
 * Cabinets / Impulse Response catalog
 */
const CAB_IR_MODELS = [
  { id: 0, name: 'Jazz 212', description: '2x12 Roland JC-120 Cabinet' },
  { id: 1, name: 'Black 112', description: '1x12 Fender Deluxe Reverb Cabinet' },
  { id: 2, name: 'Tweed 410', description: '4x10 Fender Bassman Cabinet' },
  { id: 3, name: 'Tweed 112', description: '1x12 Fender Tweed Deluxe Cabinet' },
  { id: 4, name: 'Twin 212', description: '2x12 Fender Twin Reverb Cabinet' },
  { id: 5, name: 'DR112', description: '1x12 Deluxe Reverb Cabinet' },
  { id: 6, name: 'Vibro 212', description: '2x12 Vibro-King Cabinet' },
  { id: 7, name: 'Super 212', description: '2x12 Super Reverb Cabinet' },
  { id: 8, name: 'Brit 212', description: '2x12 Vox AC30 Cabinet' },
  { id: 9, name: 'Brit 412', description: '4x12 Marshall 1960A Cabinet' },
  { id: 10, name: 'Green 412', description: '4x12 Marshall Greenback Cabinet' },
  { id: 11, name: 'Rect 412', description: '4x12 Mesa Rectifier Cabinet' },
  { id: 12, name: 'SLO 412', description: '4x12 Soldano Cabinet' },
  { id: 13, name: 'HBE 412', description: '4x12 Friedman BE-100 Cabinet' },
  { id: 14, name: 'Botm 412', description: '4x12 Bogner Ecstasy Cabinet' },
  { id: 15, name: 'Eden 410', description: '4x10 Eden Bass Cabinet' },
  { id: 16, name: 'AGL DB810', description: '8x10 Aguilar Bass Cabinet' },
  { id: 17, name: 'Amp SV810', description: '8x10 Ampeg SVT Bass Cabinet' },
  { id: 18, name: 'Amp SV410', description: '4x10 Ampeg SVT Bass Cabinet' },
  { id: 19, name: 'Amp SV212', description: '2x12 Ampeg SVT Bass Cabinet' },
  { id: 20, name: 'User IR 1-24', description: 'Custom User Impulse Response Slots' }
];

/**
 * Complete Official Catalog of Models/Pedals/Amps/Cabinets extracted from QuickTone
 */
export const NUX_MODEL_CATALOG: Record<BlockType, { id: number; name: string; description?: string }[]> = {
  WAH: [
    { id: 0, name: 'Clyde Wah', description: 'Fulltone Clyde Wah pedal' },
    { id: 1, name: 'Cry Baby', description: 'Dunlop GCB95 Crybaby Wah' },
    { id: 2, name: 'V847', description: 'Vox V847 Wah pedal' },
    { id: 3, name: 'Horse Wah', description: 'Klon Wah / Contour Wah' }
  ],
  CMP: [
    { id: 0, name: 'Red Comp', description: 'MXR Dyna Comp Style' },
    { id: 1, name: 'Rose Comp', description: 'Custom Rose Compressor' },
    { id: 2, name: 'K Comp', description: 'Keeley 2-Knob Compressor Style' },
    { id: 3, name: 'Studio Comp', description: 'Transparent 19\" Studio Rack Compressor' },
    { id: 4, name: 'C Comp', description: 'Clean Optical Compressor' }
  ],
  EFX: [
    { id: 0, name: 'Touch Wah', description: 'Envelope Filter Auto-Wah' },
    { id: 1, name: 'Uni Vibe', description: 'Shin-ei Uni-Vibe Rotary Chorus/Vibrato' },
    { id: 2, name: 'Muff Fuzz', description: 'Electro-Harmonix Big Muff Pi Fuzz' },
    { id: 3, name: 'Fuzz Face', description: 'Dallas Arbiter Fuzz Face' },
    { id: 4, name: 'RC Boost', description: 'Xotic RC Booster Clean Drive' },
    { id: 5, name: 'AC Boost', description: 'Xotic AC Booster Drive' },
    { id: 6, name: 'Distortion+', description: 'MXR Distortion+' },
    { id: 7, name: 'Dist One', description: 'Boss DS-1 Distortion' },
    { id: 8, name: 'T Screamer', description: 'Ibanez Tube Screamer TS808' },
    { id: 9, name: 'Blues Drive', description: 'Boss BD-2 Blues Driver' },
    { id: 10, name: 'Morning Drive', description: 'JHS Morning Glory Overdrive' },
    { id: 11, name: 'Modern Dist', description: 'Mesa Grid Slammer / Modern High-Gain Dist' },
    { id: 12, name: 'Red Dist', description: 'ProCo RAT Distortion' },
    { id: 13, name: 'Katana', description: 'Keeley Katana Clean Boost' },
    { id: 14, name: 'Red Fuzz', description: 'Fuzz Factory / Red Fuzz' },
    { id: 15, name: 'Full-OD HP', description: 'Fulltone Full-Drive 2 High Peak' },
    { id: 16, name: 'Horseman OD', description: 'Klon Centaur Gold Overdrive' },
    { id: 17, name: 'Nob Pdr', description: 'Nobels ODR-1 Natural Overdrive' },
    { id: 18, name: 'Turbo OD', description: 'Boss OD-2 Turbo Overdrive' }
  ],
  AMP: [
    { id: 0, name: 'Jazz Clean', description: 'Roland JC-120 Jazz Chorus' },
    { id: 1, name: 'Deluxe Rvb', description: 'Fender 65 Deluxe Reverb' },
    { id: 2, name: 'Bass Mate', description: 'Fender 59 Bassman 410' },
    { id: 3, name: 'Tweedy', description: 'Fender Tweed Deluxe' },
    { id: 4, name: 'Twin Rvb', description: 'Fender 65 Twin Reverb' },
    { id: 5, name: 'Super Rvb', description: 'Fender Super Reverb' },
    { id: 6, name: 'Class A15', description: 'Vox AC15' },
    { id: 7, name: 'Class A30', description: 'Vox AC30 Top Boost' },
    { id: 8, name: 'Plexi 100', description: 'Marshall 1959 Super Lead 100W' },
    { id: 9, name: 'Plexi 45', description: 'Marshall JTM45' },
    { id: 10, name: 'Brit 800', description: 'Marshall JCM800 2203' },
    { id: 11, name: 'Brit Blues', description: 'Marshall Bluesbreaker 1962' },
    { id: 12, name: 'Brit 2000', description: 'Marshall DSL100 Dual Super Lead' },
    { id: 13, name: '1987X 50W', description: 'Marshall 1987X 50W Vintage Plexi' },
    { id: 14, name: 'SLO 100', description: 'Soldano SLO-100 Super Lead Overdrive' },
    { id: 15, name: 'Fireman HBE', description: 'Friedman BE-100 HBE Channel' },
    { id: 16, name: 'Dual Rect', description: 'Mesa/Boogie Dual Rectifier Solo Head' },
    { id: 17, name: 'Die VH4', description: 'Diezel VH4 Channel 4' },
    { id: 18, name: 'Vibro King', description: 'Fender Custom Vibro-King' },
    { id: 19, name: 'Budda', description: 'Budda Twinmaster 30' },
    { id: 20, name: 'Bogner XTC', description: 'Bogner Ecstasy Red Channel' },
    { id: 21, name: 'MarkBass', description: 'Markbass Little Mark III (Bass Amp)' },
    { id: 22, name: 'AGL DB810', description: 'Aguilar DB751 (Bass Amp)' },
    { id: 23, name: 'Ampeg SVT', description: 'Ampeg SVT-CL Classic (Bass Amp)' }
  ],
  EQ: [
    { id: 0, name: '6-Band EQ', description: 'Graphic 6-band equalizer' },
    { id: 1, name: '10-Band EQ', description: 'Graphic 10-band equalizer' },
    { id: 2, name: 'Parametric EQ', description: '3-band parametric equalizer' },
    { id: 3, name: 'Align EQ', description: 'Acoustic Guitar Compensated EQ' }
  ],
  NG: [
    { id: 0, name: 'Noise Gate', description: 'Smart noise reduction gate' }
  ],
  MOD: [
    { id: 0, name: 'CE-1', description: 'Boss CE-1 Chorus Ensemble' },
    { id: 1, name: 'CE-2', description: 'Boss CE-2 Chorus' },
    { id: 2, name: 'ST Chorus', description: 'Stereo Chorus' },
    { id: 3, name: 'Flanger', description: 'Analog Flanger' },
    { id: 4, name: 'Phaser', description: 'MXR Phase 90 style phaser' },
    { id: 5, name: 'Tremolo', description: 'Opto & bias tremolo' },
    { id: 6, name: 'Vibrato', description: 'Pitch vibrato' },
    { id: 7, name: 'Detune', description: 'Pitch shifter micro-detune' },
    { id: 8, name: 'U-Vibe', description: 'Univibe Rotary Modulation' },
    { id: 9, name: 'Rotary Speaker', description: 'Leslie 145 Rotary Speaker' },
    { id: 10, name: 'Harmonist', description: 'Smart Pitch Harmonizer' },
    { id: 11, name: 'Pitch Bender', description: 'Whammy Pitch Bending' },
    { id: 12, name: 'Octave-Shift', description: 'Polyphonic Octave Shifter' },
    { id: 13, name: 'SCH-1', description: 'Arion SCH-1 Stereo Chorus' }
  ],
  DLY: [
    { id: 0, name: 'Analog Delay', description: 'Bucket-Brigade Analog Delay' },
    { id: 1, name: 'Digital Delay', description: 'Clean 24-bit digital delay' },
    { id: 2, name: 'Modulation Delay', description: 'Modulated chorus delay' },
    { id: 3, name: 'Tape Echo', description: 'Maestro Echoplex EP-3 tape echo' },
    { id: 4, name: 'Pan Delay', description: 'Ping-pong stereo panning delay' },
    { id: 5, name: 'Reverse Delay', description: 'Backward reverse delay' },
    { id: 6, name: 'Ping Pong', description: 'Stereo ping-pong delay' }
  ],
  RVB: [
    { id: 0, name: 'Room Reverb', description: 'Acoustic room simulation' },
    { id: 1, name: 'Hall Reverb', description: 'Concert hall reverb' },
    { id: 2, name: 'Plate Reverb', description: 'EMT 140 studio plate reverb' },
    { id: 3, name: 'Spring Reverb', description: 'Fender 3-spring tank reverb' },
    { id: 4, name: 'Shimmer', description: 'Octave pitched shimmer reverb' },
    { id: 5, name: 'Damp Reverb', description: 'High frequency damped reverb' }
  ],
  CAB: CAB_IR_MODELS,
  IR: CAB_IR_MODELS,
  SR: [
    { id: 0, name: 'Send/Return Loop', description: 'FX Loop Send & Return' }
  ],
  VOL: [
    { id: 0, name: 'Volume Pedal', description: 'Master Volume Block' }
  ]
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
    { id: 5, name: 'Bias' },
    { id: 6, name: 'Level' },
    { id: 7, name: 'Knob 8' },
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
  const exact = list.find(m => m.name.toLowerCase() === search);
  if (exact) return exact;

  const partial = list.filter(m => m.name.toLowerCase().includes(search));
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
