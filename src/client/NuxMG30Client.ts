import { BaseTransport } from '../transport/BaseTransport.js';
import { NodeTransport } from '../transport/NodeTransport.js';
import { WebMidiTransport } from '../transport/WebMidiTransport.js';
import { SysExEncoder } from '../protocol/SysExEncoder.js';
import { SysExDecoder } from '../protocol/SysExDecoder.js';
import { PatchDecoder } from '../patch/PatchDecoder.js';
import { 
  programChangeToPresetName, 
  presetNameToProgramChange, 
  blockTypeToId, 
  idToBlockType, 
  CC_MAPPINGS, 
  DEFAULT_INPUT_PORT_NAME, 
  DEFAULT_OUTPUT_PORT_NAME 
} from '../constants.js';
import { PatchData, PresetInfo, BlockType, SysExPacket, SysExCommand, NuxClientEvents } from '../types.js';

export interface NuxClientOptions {
  transport?: BaseTransport;
  inputPortName?: string;
  outputPortName?: string;
  autoHeartbeat?: boolean;
  heartbeatIntervalMs?: number;
}

export class NuxMG30Client {
  private transport: BaseTransport;
  private inputPortName: string;
  private outputPortName: string;
  private autoHeartbeat: boolean;
  private heartbeatIntervalMs: number;
  private heartbeatTimer: any = null;
  private activePresetIndex = 0;
  private patchResolver: ((patch: PatchData) => void) | null = null;

  private eventListeners: { [K in keyof NuxClientEvents]?: Function[] } = {};

  constructor(options: NuxClientOptions = {}) {
    if (options.transport) {
      this.transport = options.transport;
    } else {
      // Auto-detect environment
      if (typeof window !== 'undefined' && typeof (navigator as any)?.requestMIDIAccess !== 'undefined') {
        this.transport = new WebMidiTransport();
      } else {
        this.transport = new NodeTransport();
      }
    }

    this.inputPortName = options.inputPortName || DEFAULT_INPUT_PORT_NAME;
    this.outputPortName = options.outputPortName || DEFAULT_OUTPUT_PORT_NAME;
    this.autoHeartbeat = options.autoHeartbeat ?? false;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 5000;

    this.transport.onMessage(this.handleMidiMessage.bind(this));
  }

  /**
   * Connects to the NUX MG-30 device via MIDI.
   */
  public async connect(): Promise<void> {
    await this.transport.connect(this.inputPortName, this.outputPortName);
    this.emit('connected', { inputPort: this.inputPortName, outputPort: this.outputPortName });

    if (this.autoHeartbeat) {
      this.startHeartbeatTimer();
    }
  }

  /**
   * Disconnects from the NUX MG-30 device.
   */
  public async disconnect(): Promise<void> {
    this.stopHeartbeatTimer();
    await this.transport.disconnect();
    this.emit('disconnected');
  }

  /**
   * Switches to a specific preset by 0-indexed integer (0..127) or string name (e.g. "01A", "05C").
   */
  public setPreset(preset: number | string): void {
    let pc: number;
    if (typeof preset === 'string') {
      pc = presetNameToProgramChange(preset);
    } else {
      pc = preset & 0x7F;
    }

    this.activePresetIndex = pc;
    const msg = SysExEncoder.buildProgramChange(pc);
    this.transport.send(msg);

    const presetInfo: PresetInfo = {
      index: pc,
      ...programChangeToPresetName(pc)
    };
    this.emit('presetChanged', presetInfo);
  }

  /**
   * Returns current active preset 0-indexed position (0..127).
   */
  public getActivePresetIndex(): number {
    return this.activePresetIndex;
  }

  /**
   * Returns current active preset information.
   */
  public getActivePresetInfo(): PresetInfo {
    return {
      index: this.activePresetIndex,
      ...programChangeToPresetName(this.activePresetIndex)
    };
  }

  /**
   * Advances to the next preset (or by specified step count).
   */
  public presetUp(step: number = 1): PresetInfo {
    const nextPc = (this.activePresetIndex + step + 128 * Math.ceil(Math.abs(step))) % 128;
    this.setPreset(nextPc);
    return this.getActivePresetInfo();
  }

  /**
   * Recedes to the previous preset (or by specified step count).
   */
  public presetDown(step: number = 1): PresetInfo {
    const prevPc = (this.activePresetIndex - step + 128 * Math.ceil(Math.abs(step))) % 128;
    this.setPreset(prevPc);
    return this.getActivePresetInfo();
  }

  /**
   * Selects an active scene (1, 2, or 3) on the hardware.
   */
  public selectScene(scene: number): void {
    const validScene = Math.min(3, Math.max(1, scene));
    const sceneVal = validScene - 1;

    // 1. SysEx Command 0x0C (SCENE_SELECT)
    const sysexMsg = SysExEncoder.buildSceneSelectSysEx(validScene);
    this.transport.send(sysexMsg);

    // 2. MIDI CC 80 (0x50)
    const cc80Msg = SysExEncoder.buildSceneSelect(validScene);
    this.transport.send(cc80Msg);

    // 3. MIDI CC 60 (0x3C)
    const cc60Msg = SysExEncoder.buildControlChange(0x3C, sceneVal);
    this.transport.send(cc60Msg);

    // 4. Realtime Param Change on Block 13 (0x0D - Scene Block)
    const paramMsg = SysExEncoder.buildParameterChange(13, 0, sceneVal);
    this.transport.send(paramMsg);

    this.emit('sceneChanged', { scene: validScene });
  }

  /**
   * Toggles an effect block ON or OFF (e.g. 'WAH', 'CMP', 'EFX', 'AMP', 'EQ', 'NG', 'MOD', 'DLY', 'RVB', 'CAB').
   */
  public setBlockState(block: BlockType | number, enabled: boolean): void {
    const blockId = blockTypeToId(block);
    const blockName = idToBlockType(blockId);
    const msg = SysExEncoder.buildBlockToggle(blockId, enabled);
    this.transport.send(msg);

    this.emit('blockToggled', { block: blockName, enabled });
  }

  /**
   * Selects an effect model for a specific block.
   */
  public setModel(block: BlockType | number, modelId: number): void {
    const blockId = blockTypeToId(block);
    const blockName = idToBlockType(blockId);
    const msg = SysExEncoder.buildModelSelect(blockId, modelId);
    this.transport.send(msg);

    this.emit('modelChanged', { block: blockName, modelId });
  }

  /**
   * Sets a parameter value for a block (0..127).
   */
  public setParameter(block: BlockType | number, paramId: number, value: number): void {
    const blockId = blockTypeToId(block);
    const blockName = idToBlockType(blockId);
    const msg = SysExEncoder.buildParameterChange(blockId, paramId, value);
    this.transport.send(msg);

    this.emit('paramChanged', { block: blockName, paramId, value });
  }

  /**
   * Saves/stores the current edited patch into target hardware preset slot.
   */
  public savePatch(preset: number | string = this.activePresetIndex): void {
    const pc = typeof preset === 'string' ? presetNameToProgramChange(preset) : (preset & 0x7F);
    const presetInfo = programChangeToPresetName(pc);
    const msg = SysExEncoder.buildSavePatch(pc);
    this.transport.send(msg);

    this.emit('patchSaved', { presetName: presetInfo.name, index: pc });
  }

  /**
   * Clears/resets a preset slot to a completely clean slate (disables all effect blocks, resets AMP/CAB to clean baseline).
   */
  public async clearPreset(preset?: number | string, options: { keepAmpCab?: boolean } = {}): Promise<void> {
    if (preset !== undefined) {
      this.setPreset(preset);
      await new Promise(r => setTimeout(r, 800));
    }

    // Disable all optional effect blocks with generous pause between messages
    const blocksToDisable: BlockType[] = ['WAH', 'CMP', 'EFX', 'EQ', 'NG', 'MOD', 'DLY', 'RVB'];
    for (const block of blocksToDisable) {
      this.setBlockState(block, false);
      await new Promise(r => setTimeout(r, 300));
    }

    if (!options.keepAmpCab) {
      // Set AMP & CAB to clean default baseline (Class A30 Vox AC30 #7 or Deluxe Rvb #1 & 1x12 Cab #1)
      this.setModel('AMP', 1); // Deluxe Rvb
      await new Promise(r => setTimeout(r, 400));
      this.setBlockState('AMP', true);
      await new Promise(r => setTimeout(r, 400));
      this.setModel('CAB', 1); // Black 112
      await new Promise(r => setTimeout(r, 400));
      this.setBlockState('CAB', true);
      await new Promise(r => setTimeout(r, 400));
    }

    // Save cleared state to hardware memory
    this.savePatch(preset !== undefined ? preset : this.activePresetIndex);
    await new Promise(r => setTimeout(r, 800));
  }

  /**
   * Requests the full 222-byte patch dump from the device.
   */
  public async requestPatchDump(timeoutMs: number = 3000): Promise<PatchData> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.patchResolver = null;
        reject(new Error(`Timed out waiting for NUX MG-30 patch dump response after ${timeoutMs}ms.`));
      }, timeoutMs);

      this.patchResolver = (patch: PatchData) => {
        clearTimeout(timer);
        resolve(patch);
      };

      const req = SysExEncoder.buildPatchDumpRequest();
      this.transport.send(req);
    });
  }

  /**
   * Sends a heartbeat ping message (0x0E) to verify device responsiveness.
   */
  public sendHeartbeat(): void {
    const ping = SysExEncoder.buildHeartbeatPing();
    this.transport.send(ping);
  }

  /**
   * Sends a custom Control Change message.
   */
  public sendCC(ccNumber: number, value: number): void {
    const cc = SysExEncoder.buildControlChange(ccNumber, value);
    this.transport.send(cc);
  }

  /**
   * Gets the list of available input MIDI ports.
   */
  public listInputPorts() {
    return this.transport.listInputPorts();
  }

  /**
   * Gets the list of available output MIDI ports.
   */
  public listOutputPorts() {
    return this.transport.listOutputPorts();
  }

  /**
   * Attach event listener
   */
  public on<K extends keyof NuxClientEvents>(event: K, listener: NuxClientEvents[K]): this {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event]!.push(listener as Function);
    return this;
  }

  /**
   * Remove event listener
   */
  public off<K extends keyof NuxClientEvents>(event: K, listener: NuxClientEvents[K]): this {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event]!.filter(l => l !== listener);
    }
    return this;
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

  private handleMidiMessage(deltaTime: number, message: Uint8Array): void {
    // 1. Check for SysEx
    const packet = SysExDecoder.parseSysEx(message);
    if (packet) {
      this.emit('sysex', packet);

      if (packet.command === SysExCommand.HANDSHAKE_PATCH_DUMP) {
        const patch = PatchDecoder.decode(packet.payload);
        const presetInfo = programChangeToPresetName(this.activePresetIndex);
        patch.presetName = presetInfo.name;

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

    // 2. Check for Program Change (PC)
    if (SysExDecoder.isProgramChange(message)) {
      const pc = message[1] & 0x7F;
      this.activePresetIndex = pc;
      const info: PresetInfo = {
        index: pc,
        ...programChangeToPresetName(pc)
      };
      this.emit('presetChanged', info);
      return;
    }

    // 3. Check for Control Change (CC)
    if (SysExDecoder.isControlChange(message)) {
      const ccNum = message[1] & 0x7F;
      const ccVal = message[2] & 0x7F;
      if (ccNum === CC_MAPPINGS.EXPRESSION_PEDAL) {
        this.emit('expressionPedal', ccVal);
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
