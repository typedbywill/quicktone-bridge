import {
  NUX_SYSEX_HEADER,
  SYSEX_END,
  blockTypeToId,
  idToBlockType,
  presetNameToProgramChange,
  CC_MAPPINGS,
  paramToCc,
  PARAM_CC_MAX,
} from '../constants.js';
import { SysExCommand, SysExDirection, BlockType } from '../types.js';

export class SysExEncoder {
  /**
   * Builds a raw NUX MG-30 SysEx packet
   * `F0 43 58 70 [CMD] [DIR] [PAYLOAD...] F7`
   */
  public static buildSysExPacket(
    command: SysExCommand | number,
    direction: SysExDirection | number = SysExDirection.HOST_TO_DEVICE,
    payload: number[] | Uint8Array = []
  ): Uint8Array {
    const payloadArr = Array.from(payload);
    const bytes = [
      ...NUX_SYSEX_HEADER,
      command & 0x7f,
      direction & 0x7f,
      ...payloadArr,
      SYSEX_END,
    ];
    return new Uint8Array(bytes);
  }

  /**
   * Request scene data (protocol.md command `0C`).
   * Query: F0 43 58 70 0C 00 00 <scene0..2> 00 00 00 00 00 00 F7
   * `sceneIndex` is 0-based (0=Scene1, 1=Scene2, 2=Scene3).
   */
  public static buildPatchDumpRequest(sceneIndex: number = 0): Uint8Array {
    const scene = Math.min(2, Math.max(0, sceneIndex | 0));
    return new Uint8Array([
      ...NUX_SYSEX_HEADER,
      SysExCommand.SCENE_CURRENT_DATA,
      0x00,
      0x00,
      scene,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      SYSEX_END,
    ]);
  }

  /**
   * Write saved scene body (protocol.md command `0B` set).
   * `encodedBody` must already be 7-bit packed (no preset/scene prefix).
   */
  public static buildSceneDataSet(
    preset: number,
    sceneIndex: number,
    encodedBody: Uint8Array | number[]
  ): Uint8Array {
    const scene = Math.min(2, Math.max(0, sceneIndex | 0));
    const body = encodedBody instanceof Uint8Array ? encodedBody : new Uint8Array(encodedBody);
    return new Uint8Array([
      ...NUX_SYSEX_HEADER,
      SysExCommand.SCENE_SAVED_DATA,
      SysExDirection.HOST_TO_DEVICE,
      preset & 0x7f,
      scene,
      ...body,
      SYSEX_END,
    ]);
  }

  /**
   * Toggle an effect block ON or OFF using MIDI CC.
   * NUX MG-30 uses 0x00 for ON (Enabled) and 0x41 for OFF (Disabled).
   */
  public static buildBlockToggle(block: BlockType | number, enabled: boolean): Uint8Array {
    const blockId = blockTypeToId(block);
    const value = enabled ? 0x00 : 0x41;
    return this.buildControlChange(blockId, value);
  }

  /**
   * Select an effect model for a block (0x03)
   */
  public static buildModelSelect(block: BlockType | number, modelId: number): Uint8Array {
    const blockId = typeof block === 'number' ? block : blockTypeToId(block);
    return new Uint8Array([
      ...NUX_SYSEX_HEADER,
      SysExCommand.MODEL_SELECT,
      SysExDirection.HOST_TO_DEVICE,
      blockId & 0x7f,
      modelId & 0x7f,
      SYSEX_END,
    ]);
  }

  /**
   * Set a block knob via MIDI CC (docs/ControlChanges.md).
   * Example: AMP Gain (knob 0) → CC 24 → `B0 18 <value>`
   * Value is clamped to 0..100 (device MIDI map range).
   */
  public static buildParameterChange(block: BlockType | number, paramId: number, value: number): Uint8Array {
    const bt: BlockType = typeof block === 'number' ? idToBlockType(block) : block;
    const cc = paramToCc(bt, paramId);
    if (cc === null) {
      throw new Error(`Block ${bt} has no MIDI CC mapping for param ${paramId}`);
    }
    const clamped = Math.min(PARAM_CC_MAX, Math.max(0, value | 0));
    return this.buildControlChange(cc, clamped);
  }

  /**
   * Save current patch edits to hardware preset slot (0x0B)
   */
  public static buildSavePatch(preset: number | string): Uint8Array {
    const pc = typeof preset === 'string' ? presetNameToProgramChange(preset) : preset & 0x7f;
    return new Uint8Array([
      ...NUX_SYSEX_HEADER,
      SysExCommand.SAVE_PATCH,
      SysExDirection.HOST_TO_DEVICE,
      pc,
      SYSEX_END,
    ]);
  }

  /**
   * Request signal routing chain / custom MIDI config (0x0F)
   */
  public static buildSignalChainRequest(): Uint8Array {
    return new Uint8Array([...NUX_SYSEX_HEADER, SysExCommand.SIGNAL_CHAIN_ROUTING, 0x00, SYSEX_END]);
  }

  /**
   * Request global EQ / USB routing setup (0x14)
   */
  public static buildGlobalEqRequest(): Uint8Array {
    return new Uint8Array([...NUX_SYSEX_HEADER, SysExCommand.GLOBAL_EQ_SETUP, 0x00, SYSEX_END]);
  }

  /**
   * Build connection heartbeat ping (0x0E)
   */
  public static buildHeartbeatPing(): Uint8Array {
    return new Uint8Array([...NUX_SYSEX_HEADER, SysExCommand.HEARTBEAT_PING, 0x00, SYSEX_END]);
  }

  /**
   * Request/sync scene bank data (QuickTone).
   * WARNING: this triggers large SysEx dump replies — not a realtime scene select.
   * Prefer `buildSceneSelect` (CC 80) to change the active scene.
   */
  public static buildSceneSelectSysEx(sceneNumber: number): Uint8Array {
    const sceneVal = Math.min(2, Math.max(0, sceneNumber - 1));
    return new Uint8Array([
      ...NUX_SYSEX_HEADER,
      SysExCommand.SCENE_CURRENT_DATA,
      0x00,
      0x00,
      sceneVal,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      SYSEX_END,
    ]);
  }

  /**
   * Select active scene (1, 2, 3) using MIDI CC 80 (0x50).
   */
  public static buildSceneSelect(sceneNumber: number, channel: number = 0): Uint8Array {
    const validScene = Math.min(3, Math.max(1, sceneNumber));
    const sceneVal = validScene - 1;
    return this.buildControlChange(CC_MAPPINGS.SCENE_SELECT, sceneVal, channel);
  }

  public static buildProgramChange(presetIndex: number, channel: number = 0): Uint8Array {
    const status = 0xc0 | (channel & 0x0f);
    return new Uint8Array([status, presetIndex & 0x7f]);
  }

  public static buildControlChange(ccNumber: number, value: number, channel: number = 0): Uint8Array {
    const status = 0xb0 | (channel & 0x0f);
    return new Uint8Array([status, ccNumber & 0x7f, value & 0x7f]);
  }
}
