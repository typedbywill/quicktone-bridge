import { NUX_SYSEX_HEADER, blockTypeToId, idToBlockType, presetNameToProgramChange, CC_MAPPINGS, paramToCc } from '../constants.js';
import { SysExCommand, SysExDirection, BlockType } from '../types.js';
import { integer, encodedSceneBody } from './validation.js';

export class SysExEncoder {
  public static buildSysExPacket(command: number, direction: number = SysExDirection.HOST_TO_DEVICE, payload: number[] | Uint8Array = []): Uint8Array {
    integer(command, 0, 127, 'Command'); integer(direction, 0, 127, 'Operation');
    for (const b of payload) integer(b, 0, 127, 'SysEx data byte');
    return Uint8Array.from([...NUX_SYSEX_HEADER, command, direction, ...payload, 0xf7]);
  }
  public static buildPatchDumpRequest(sceneIndex = 0): Uint8Array {
    integer(sceneIndex, 0, 2, 'Scene index');
    return this.buildSysExPacket(0x0c, 0, [0, sceneIndex, 0, 0, 0, 0, 0, 0]);
  }
  public static buildSavedSceneRequest(preset: number, sceneIndex: number): Uint8Array {
    integer(preset, 0, 127, 'Preset'); integer(sceneIndex, 0, 2, 'Scene index');
    return this.buildSysExPacket(0x0b, 0, [preset, sceneIndex, 0, 0, 0, 0, 0, 0]);
  }
  public static buildSceneDataSet(preset: number, sceneIndex: number, encodedBody: Uint8Array | number[]): Uint8Array {
    return this.sceneSet(0x0b, preset, sceneIndex, encodedBody);
  }
  public static buildCurrentSceneDataSet(preset: number, sceneIndex: number, encodedBody: Uint8Array | number[]): Uint8Array {
    return this.sceneSet(0x0c, preset, sceneIndex, encodedBody);
  }
  private static sceneSet(command: number, preset: number, sceneIndex: number, body: Uint8Array | number[]): Uint8Array {
    integer(preset, 0, 127, 'Preset'); integer(sceneIndex, 0, 2, 'Scene index');
    return this.buildSysExPacket(command, 1, [preset, sceneIndex, ...encodedSceneBody(body)]);
  }
  /** Saving requires all scene bytes; a preset number alone is not a valid write. */
  public static buildSavePatch(preset: number | string, sceneIndex?: number, body?: Uint8Array | number[]): Uint8Array {
    if (sceneIndex === undefined || body === undefined) throw new Error('Saving requires a scene index and complete scene body. Use client.savePatch().');
    return this.buildSceneDataSet(typeof preset === 'string' ? presetNameToProgramChange(preset) : preset, sceneIndex, body);
  }
  public static buildCurrentStateRequest(): Uint8Array { return this.buildSysExPacket(0x15, 0); }
  public static buildSignalChainRequest(): Uint8Array { return this.buildSysExPacket(0x0d, 0); }
  public static buildSignalChainSet(order: number[], configuration: number): Uint8Array {
    if (order.length !== 12 || new Set(order).size !== 12) throw new Error('Signal chain must contain every hardware block exactly once.');
    order.forEach(id => integer(id, 0, 11, 'Block ID')); integer(configuration, 0, 127, 'Chain configuration');
    return this.buildSysExPacket(0x0d, 1, [...order, configuration]);
  }
  public static buildGlobalEqRequest(): Uint8Array { return this.buildSysExPacket(0x14, 0); }
  /** @deprecated Prefer a response-correlated current-state query for connectivity. */
  public static buildHeartbeatPing(): Uint8Array { return this.buildCurrentStateRequest(); }
  public static buildSceneSelectSysEx(sceneNumber: number): Uint8Array {
    integer(sceneNumber, 1, 3, 'Scene'); return this.buildPatchDumpRequest(sceneNumber - 1);
  }
  public static buildSceneSelect(sceneNumber: number, channel = 0): Uint8Array {
    integer(sceneNumber, 1, 3, 'Scene'); return this.buildControlChange(CC_MAPPINGS.SCENE_SELECT, sceneNumber - 1, channel);
  }
  /** @deprecated Current model is needed to preserve it while toggling. Prefer client.setBlockState(). */
  public static buildBlockToggle(block: BlockType | number, enabled: boolean): Uint8Array {
    return this.buildControlChange(blockTypeToId(block), enabled ? 0 : 0x41);
  }
  /** A standalone 03 model command was erroneous: 03 is tempo. */
  public static buildModelSelect(_block: BlockType | number, _modelId: number): Uint8Array {
    throw new Error('Model selection requires scene data. Use client.setModel().');
  }
  /** External Custom-MIDI mapping; it can be remapped by the device. */
  public static buildParameterChange(block: BlockType | number, paramId: number, value: number): Uint8Array {
    const name = typeof block === 'number' ? idToBlockType(block) : block;
    integer(paramId, 0, 11, 'Parameter');
    if (!Number.isFinite(value)) throw new Error('Parameter value must be finite.');
    const cc = paramToCc(name, paramId);
    if (cc === null) throw new Error(`Block ${name} has no MIDI CC mapping for param ${paramId}`);
    return this.buildControlChange(cc, Math.min(100, Math.max(0, Math.trunc(value))));
  }
  public static buildProgramChange(preset: number, channel = 0): Uint8Array {
    integer(preset, 0, 127, 'Preset'); integer(channel, 0, 15, 'MIDI channel');
    return Uint8Array.from([0xc0 | channel, preset]);
  }
  public static buildControlChange(cc: number, value: number, channel = 0): Uint8Array {
    integer(cc, 0, 127, 'CC'); integer(value, 0, 127, 'CC value'); integer(channel, 0, 15, 'MIDI channel');
    return Uint8Array.from([0xb0 | channel, cc, value]);
  }
}
