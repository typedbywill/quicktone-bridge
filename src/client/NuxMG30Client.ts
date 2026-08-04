import { BaseTransport } from '../transport/BaseTransport.js';
import { NodeTransport } from '../transport/NodeTransport.js';
import { WebMidiTransport } from '../transport/WebMidiTransport.js';
import { SysExEncoder } from '../protocol/SysExEncoder.js';
import { SysExDecoder } from '../protocol/SysExDecoder.js';
import { PatchDecoder } from '../patch/PatchDecoder.js';
import { unpackNuxPayload, packNuxPayload } from '../protocol/nuxEncoding.js';
import {
  programChangeToPresetName,
  presetNameToProgramChange,
  blockTypeToId,
  idToBlockType,
  CC_MAPPINGS,
  DEFAULT_INPUT_PORT_NAME,
  DEFAULT_OUTPUT_PORT_NAME,
  PARAM_CC_MAX,
  sceneModelOffset,
  sceneKnobOffset,
  SCENE_MODEL_OFF_BIT,
} from '../constants.js';
import { PatchData, PresetInfo, BlockType, SysExCommand, NuxClientEvents } from '../types.js';

export interface NuxClientOptions {
  transport?: BaseTransport;
  inputPortName?: string;
  outputPortName?: string;
  autoHeartbeat?: boolean;
  heartbeatIntervalMs?: number;
}

export interface SceneWriteOptions {
  /** Reload preset via Program Change so 0C edit buffer matches saved data (default true). */
  reload?: boolean;
  /** Settle time after SysEx write before reload/read (ms). */
  settleMs?: number;
}

export class NuxMG30Client {
  private transport: BaseTransport;
  private inputPortName: string;
  private outputPortName: string;
  private autoHeartbeat: boolean;
  private heartbeatIntervalMs: number;
  private heartbeatTimer: any = null;
  private activePresetIndex = 0;
  /** 0-based scene index matching SysEx dumps (0=Scene1 … 2=Scene3). */
  private activeSceneIndex = 0;
  private patchResolver: ((patch: PatchData) => void) | null = null;

  private eventListeners: { [K in keyof NuxClientEvents]?: Function[] } = {};

  constructor(options: NuxClientOptions = {}) {
    if (options.transport) {
      this.transport = options.transport;
    } else if (typeof window !== 'undefined' && typeof (navigator as any)?.requestMIDIAccess !== 'undefined') {
      this.transport = new WebMidiTransport();
    } else {
      this.transport = new NodeTransport();
    }

    this.inputPortName = options.inputPortName || DEFAULT_INPUT_PORT_NAME;
    this.outputPortName = options.outputPortName || DEFAULT_OUTPUT_PORT_NAME;
    this.autoHeartbeat = options.autoHeartbeat ?? false;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 5000;

    this.transport.onMessage(this.handleMidiMessage.bind(this));
  }

  public async connect(): Promise<void> {
    await this.transport.connect(this.inputPortName, this.outputPortName);
    this.emit('connected', { inputPort: this.inputPortName, outputPort: this.outputPortName });

    if (this.autoHeartbeat) {
      this.startHeartbeatTimer();
    }
  }

  public async disconnect(): Promise<void> {
    this.stopHeartbeatTimer();
    await this.transport.disconnect();
    this.emit('disconnected');
  }

  public setPreset(preset: number | string): void {
    let pc: number;
    if (typeof preset === 'string') {
      pc = presetNameToProgramChange(preset);
    } else {
      pc = preset & 0x7f;
    }

    this.activePresetIndex = pc;
    this.transport.send(SysExEncoder.buildProgramChange(pc));

    const presetInfo: PresetInfo = {
      index: pc,
      ...programChangeToPresetName(pc),
    };
    this.emit('presetChanged', presetInfo);
  }

  public getActivePresetIndex(): number {
    return this.activePresetIndex;
  }

  public getActivePresetInfo(): PresetInfo {
    return {
      index: this.activePresetIndex,
      ...programChangeToPresetName(this.activePresetIndex),
    };
  }

  public presetUp(step: number = 1): PresetInfo {
    const nextPc = (this.activePresetIndex + step + 128 * Math.ceil(Math.abs(step))) % 128;
    this.setPreset(nextPc);
    return this.getActivePresetInfo();
  }

  public presetDown(step: number = 1): PresetInfo {
    const prevPc = (this.activePresetIndex - step + 128 * Math.ceil(Math.abs(step))) % 128;
    this.setPreset(prevPc);
    return this.getActivePresetInfo();
  }

  /**
   * Selects scene 1/2/3 via MIDI CC 80 and tracks which scene `0C` dumps request.
   */
  public selectScene(scene: number): void {
    const validScene = Math.min(3, Math.max(1, scene));
    this.activeSceneIndex = validScene - 1;
    this.transport.send(SysExEncoder.buildSceneSelect(validScene));
    this.emit('sceneChanged', { scene: validScene });
  }

  /**
   * Toggle block ON/OFF by rewriting scene SysEx (`0B`).
   */
  public async setBlockState(
    block: BlockType | number,
    enabled: boolean,
    options: SceneWriteOptions = {}
  ): Promise<void> {
    const blockName = idToBlockType(blockTypeToId(block));
    await this.modifyActiveScene((decoded) => {
      const idx = sceneModelOffset(blockName);
      const modelId = decoded[idx] & 0x3f;
      decoded[idx] = enabled ? modelId : modelId | SCENE_MODEL_OFF_BIT;
    }, options);
    this.emit('blockToggled', { block: blockName, enabled });
  }

  /**
   * Select block model by rewriting scene SysEx (`0B`).
   * Note: SysEx `0x03` is tempo in protocol.md — not model select.
   */
  public async setModel(
    block: BlockType | number,
    modelId: number,
    options: SceneWriteOptions = {}
  ): Promise<void> {
    const blockName = idToBlockType(blockTypeToId(block));
    await this.modifyActiveScene((decoded) => {
      const idx = sceneModelOffset(blockName);
      const off = decoded[idx] & SCENE_MODEL_OFF_BIT;
      decoded[idx] = off | (modelId & 0x3f);
    }, options);
    this.emit('modelChanged', { block: blockName, modelId });
  }

  /**
   * Set a knob by rewriting scene SysEx (`0B`). Also emits Custom-MIDI CC best-effort.
   * Range: 0..100.
   */
  public async setParameter(
    block: BlockType | number,
    paramId: number,
    value: number,
    options: SceneWriteOptions = {}
  ): Promise<void> {
    const blockName = idToBlockType(blockTypeToId(block));
    const clamped = Math.min(PARAM_CC_MAX, Math.max(0, value | 0));

    try {
      this.transport.send(SysExEncoder.buildParameterChange(blockName, paramId, clamped));
    } catch {
      // Blocks without CC mapping (e.g. CAB) skip the CC path.
    }

    await this.modifyActiveScene((decoded) => {
      decoded[sceneKnobOffset(blockName, paramId)] = clamped;
    }, options);

    this.emit('paramChanged', { block: blockName, paramId, value: clamped });
  }

  public savePatch(preset: number | string = this.activePresetIndex): void {
    const pc = typeof preset === 'string' ? presetNameToProgramChange(preset) : preset & 0x7f;
    const presetInfo = programChangeToPresetName(pc);
    this.transport.send(SysExEncoder.buildSavePatch(pc));
    this.emit('patchSaved', { presetName: presetInfo.name, index: pc });
  }

  /**
   * Set user patch name by modifying offsets 106..121 in the decoded scene dump.
   */
  public async setPresetName(
    name: string,
    options: SceneWriteOptions = {}
  ): Promise<void> {
    const cleanName = name.slice(0, 16);
    await this.modifyActiveScene((decoded) => {
      for (let i = 0; i < 16; i++) {
        if (106 + i < decoded.length) {
          decoded[106 + i] = i < cleanName.length ? cleanName.charCodeAt(i) : 0;
        }
      }
    }, options);
  }

  public async clearPreset(preset?: number | string, options: { keepAmpCab?: boolean } = {}): Promise<void> {
    if (preset !== undefined) {
      this.setPreset(preset);
      await this.sleep(800);
    }

    const blocksToDisable: BlockType[] = ['WAH', 'CMP', 'EFX', 'EQ', 'NG', 'MOD', 'DLY', 'RVB'];
    for (const block of blocksToDisable) {
      await this.setBlockState(block, false, { reload: false });
      await this.sleep(200);
    }

    if (!options.keepAmpCab) {
      await this.setModel('AMP', 1, { reload: false });
      await this.setBlockState('AMP', true, { reload: false });
    }

    this.setPreset(preset !== undefined ? preset : this.activePresetIndex);
    await this.sleep(500);
    this.savePatch(preset !== undefined ? preset : this.activePresetIndex);
    await this.sleep(800);
  }

  /**
   * Request scene dump for the active (or given 0-based) scene.
   */
  public async requestPatchDump(
    timeoutMs: number = 3000,
    sceneIndex: number = this.activeSceneIndex
  ): Promise<PatchData> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.patchResolver = null;
        reject(new Error(`Timed out waiting for NUX MG-30 patch dump response after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.patchResolver = (patch: PatchData) => {
        clearTimeout(timer);
        resolve(patch);
      };

      this.transport.send(SysExEncoder.buildPatchDumpRequest(sceneIndex));
    });
  }

  /**
   * Read-modify-write active preset/scene via SysEx `0B`, then optionally reload PC.
   */
  public async modifyActiveScene(
    mutator: (decoded: Uint8Array, meta: { preset: number; sceneIndex: number }) => void,
    options: SceneWriteOptions = {}
  ): Promise<void> {
    const settleMs = options.settleMs ?? 350;
    const reload = options.reload ?? true;

    const patch = await this.requestPatchDump(2500);
    if (!patch.raw || patch.raw.length < 12) {
      throw new Error('Scene dump too short to modify.');
    }

    const preset = patch.raw[0] & 0x7f;
    const sceneIndex = Math.min(2, Math.max(0, patch.raw[1] & 0x7f));
    this.activePresetIndex = preset;
    this.activeSceneIndex = sceneIndex;

    const decoded = unpackNuxPayload(patch.raw.subarray(2));
    if (decoded.length < 90) {
      throw new Error('Unpacked scene body too short to modify.');
    }

    mutator(decoded, { preset, sceneIndex });

    this.transport.send(SysExEncoder.buildSceneDataSet(preset, sceneIndex, packNuxPayload(decoded)));
    await this.sleep(settleMs);

    if (reload) {
      this.setPreset(preset);
      await this.sleep(Math.max(400, settleMs));
    }
  }

  public sendHeartbeat(): void {
    this.transport.send(SysExEncoder.buildHeartbeatPing());
  }

  public sendCC(ccNumber: number, value: number): void {
    this.transport.send(SysExEncoder.buildControlChange(ccNumber, value));
  }

  public listInputPorts() {
    return this.transport.listInputPorts();
  }

  public listOutputPorts() {
    return this.transport.listOutputPorts();
  }

  public on<K extends keyof NuxClientEvents>(event: K, listener: NuxClientEvents[K]): this {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event]!.push(listener as Function);
    return this;
  }

  public off<K extends keyof NuxClientEvents>(event: K, listener: NuxClientEvents[K]): this {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event]!.filter((l) => l !== listener);
    }
    return this;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private emit<K extends keyof NuxClientEvents>(event: K, ...args: Parameters<NuxClientEvents[K]>): void {
    const listeners = this.eventListeners[event];
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(...args);
        } catch (err) {
          console.error(`Error in event listener for "${event}":`, err);
        }
      }
    }
  }

  private handleMidiMessage(_deltaTime: number, message: Uint8Array): void {
    const packet = SysExDecoder.parseSysEx(message);
    if (packet) {
      this.emit('sysex', packet);

      if (
        packet.command === SysExCommand.SCENE_CURRENT_DATA ||
        packet.command === SysExCommand.SCENE_SAVED_DATA ||
        packet.command === SysExCommand.HANDSHAKE_PATCH_DUMP
      ) {
        // Ignore short set-ack frames (e.g. 0B 03 …).
        if (packet.payload.length < 90) {
          return;
        }
        const patch = PatchDecoder.decode(packet.payload);
        patch.presetName = programChangeToPresetName(this.activePresetIndex).name;
        if (patch.raw.length >= 2) {
          this.activeSceneIndex = Math.min(2, Math.max(0, patch.raw[1] & 0x7f));
        }

        this.emit('patchReceived', patch);
        if (this.patchResolver) {
          this.patchResolver(patch);
          this.patchResolver = null;
        }
      } else if (packet.command === SysExCommand.HEARTBEAT_PING) {
        this.emit('heartbeat');
      }
      return;
    }

    if (SysExDecoder.isProgramChange(message)) {
      const pc = message[1] & 0x7f;
      this.activePresetIndex = pc;
      this.emit('presetChanged', {
        index: pc,
        ...programChangeToPresetName(pc),
      });
      return;
    }

    if (SysExDecoder.isControlChange(message)) {
      const ccNum = message[1] & 0x7f;
      const ccVal = message[2] & 0x7f;
      if (ccNum === CC_MAPPINGS.EXPRESSION_PEDAL) {
        this.emit('expressionPedal', ccVal);
      } else if (ccNum === CC_MAPPINGS.SCENE_SELECT && ccVal >= 0 && ccVal <= 2) {
        this.activeSceneIndex = ccVal;
        this.emit('sceneChanged', { scene: ccVal + 1 });
      }
    }
  }

  private startHeartbeatTimer(): void {
    this.stopHeartbeatTimer();
    this.heartbeatTimer = setInterval(() => {
      if (this.transport.getIsConnected()) {
        this.sendHeartbeat();
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
