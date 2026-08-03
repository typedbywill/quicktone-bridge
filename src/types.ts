/**
 * NUX MG-30 Data Types & Interfaces
 */

export interface MidiPortInfo {
  index: number;
  name: string;
}

export enum SysExCommand {
  HANDSHAKE_PATCH_DUMP = 0x0A,
  REALTIME_PARAM_CHANGE = 0x01,
  BLOCK_TOGGLE = 0x02,
  MODEL_SELECT = 0x03,
  SYSTEM_VOL_GLOBAL = 0x03,
  HARDWARE_INFO_1 = 0x04,
  HARDWARE_INFO_2 = 0x05,
  SAVE_PATCH = 0x0B,
  HEARTBEAT_PING = 0x0E,
  SIGNAL_CHAIN_ROUTING = 0x0F,
  GLOBAL_EQ_SETUP = 0x14,
  EXP_TUNER_STATUS = 0x15
}

export enum SysExDirection {
  HOST_TO_DEVICE = 0x01,
  DEVICE_TO_HOST = 0x02
}

export type BlockType = 
  | 'WAH' 
  | 'CMP' 
  | 'EFX' 
  | 'AMP' 
  | 'EQ' 
  | 'NG' 
  | 'MOD' 
  | 'DLY' 
  | 'RVB' 
  | 'CAB'
  | 'IR'
  | 'SR'
  | 'VOL';

export interface EffectBlockState {
  id: BlockType;
  enabled: boolean;
  modelId: number;
  modelName?: string;
  params: number[];
}

export interface PresetInfo {
  index: number; // 0 to 127
  bank: number;  // 1 to 32
  channel: 'A' | 'B' | 'C' | 'D'; // A, B, C, D
  name: string; // Preset name (e.g. "01A")
}

export interface PatchData {
  raw: Uint8Array;
  presetName: string;
  userPatchName?: string;
  bpm: number;
  scene: number; // Active scene (1, 2, 3)
  blocks: Record<BlockType, EffectBlockState>;
  signalChain: BlockType[];
}

export interface SysExPacket {
  header: number[]; // [0xF0, 0x43, 0x58, 0x70]
  command: SysExCommand | number;
  direction: SysExDirection | number;
  payload: Uint8Array;
  raw: Uint8Array;
}

export interface GlobalEqSettings {
  enabled: boolean;
  lowGain: number;
  midGain: number;
  highGain: number;
  masterLevel: number;
  raw: Uint8Array;
}

export interface NuxClientEvents {
  connected: (info: { inputPort: string; outputPort: string }) => void;
  disconnected: () => void;
  patchReceived: (patch: PatchData) => void;
  presetChanged: (preset: PresetInfo) => void;
  expressionPedal: (val: number) => void;
  heartbeat: () => void;
  blockToggled: (data: { block: BlockType; enabled: boolean }) => void;
  modelChanged: (data: { block: BlockType; modelId: number }) => void;
  paramChanged: (data: { block: BlockType; paramId: number; value: number }) => void;
  patchSaved: (data: { presetName: string; index: number }) => void;
  sysex: (packet: SysExPacket) => void;
  error: (err: Error) => void;
}
