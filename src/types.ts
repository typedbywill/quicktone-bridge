/**
 * NUX MG-30 Data Types & Interfaces
 */

export interface MidiPortInfo {
  index: number;
  name: string;
}

export enum SysExCommand {
  /** @deprecated Legacy bridge id — prefer SCENE_CURRENT_DATA (0x0C) for dumps */
  HANDSHAKE_PATCH_DUMP = 0x0A,
  /** @deprecated Unsupported legacy ID. Use current-scene read-modify-write. */
  REALTIME_PARAM_CHANGE = 0x01,
  /** @deprecated Unsupported legacy meaning. Prefer client.setBlockState(). */
  BLOCK_TOGGLE = 0x02,
  TEMPO = 0x03,
  /** @deprecated Misnamed legacy alias: command 03 controls tempo, not models. */
  MODEL_SELECT = 0x03,
  /** @deprecated Misnamed legacy alias for TEMPO. */
  SYSTEM_VOL_GLOBAL = 0x03,
  HARDWARE_INFO_1 = 0x04,
  HARDWARE_INFO_2 = 0x05,
  /** protocol.md: Get/Set scene saved data — also used historically as SAVE_PATCH in this bridge */
  SAVE_PATCH = 0x0B,
  SCENE_SAVED_DATA = 0x0B,
  /** protocol.md: Get scene current data (on edit) */
  SCENE_CURRENT_DATA = 0x0C,
  /** @deprecated Alias — 0x0C is scene current dump, not realtime scene select (use CC 80) */
  SCENE_SELECT = 0x0C,
  /** @deprecated No verified heartbeat command 0E; ping queries CURRENT_PRESET_SCENE. */
  HEARTBEAT_PING = 0x0E,
  SIGNAL_CHAIN_ROUTING = 0x0D,
  CUSTOM_MIDI_CONFIG = 0x0F,
  CURRENT_PRESET_SCENE = 0x15,
  STATUS = 0x7E,
  GLOBAL_EQ_SETUP = 0x14,
  /** @deprecated Misnamed legacy alias for CURRENT_PRESET_SCENE. */
  EXP_TUNER_STATUS = 0x15,
}

export enum SysExDirection {
  QUERY = 0x00,
  HOST_TO_DEVICE = 0x01,
  DEVICE_TO_HOST = 0x02,
  ACKNOWLEDGEMENT = 0x03
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
  scene: number; // Scene represented by this payload (1, 2, 3)
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
  midiSent: (bytes: Uint8Array) => void;
  midiReceived: (bytes: Uint8Array) => void;
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
  sceneChanged: (data: { scene: number }) => void;
  sysex: (packet: SysExPacket) => void;
  error: (err: Error) => void;
}

/** Live device state returned by command 15. Indices are zero based. */
export interface DeviceState { preset: number; sceneIndex: number; raw: Uint8Array; }
export interface DeviceInfo { firmware: string; serialNumber: string; raw: Uint8Array; }
/** Complete preset: every scene, including opaque fields retained in raw. */
export interface PresetData { index: number; scenes: [PatchData, PatchData, PatchData]; }
export interface SignalChain { blocks: BlockType[]; configuration: number; }
