/**
 * NUX MG-30 Protocol Constants
 */

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
} as const;

/**
 * Block types in signal routing order
 */
export const BLOCK_LIST = [
  'WAH',
  'CMP',
  'EFX',
  'AMP',
  'EQ',
  'NG',
  'MOD',
  'DLY',
  'RVB',
  'CAB'
] as const;

/**
 * Helper to convert 0-indexed Program Change (0..127) to MG-30 preset string (e.g. 0 -> "01A", 1 -> "01B", 4 -> "02A")
 */
export function programChangeToPresetName(pc: number): { bank: number; channel: 'A' | 'B' | 'C' | 'D'; name: string } {
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
