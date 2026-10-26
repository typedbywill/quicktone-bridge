import { BaseTransport } from '../transport/BaseTransport.js';
import { NodeTransport } from '../transport/NodeTransport.js';
import { WebMidiTransport } from '../transport/WebMidiTransport.js';
import { SysExEncoder } from '../protocol/SysExEncoder.js';
import { SysExDecoder } from '../protocol/SysExDecoder.js';
import { integer } from '../protocol/validation.js';
import { PatchDecoder } from '../patch/PatchDecoder.js';
import { unpackNuxPayload, packNuxPayload } from '../protocol/nuxEncoding.js';
import { programChangeToPresetName, presetNameToProgramChange, blockTypeToId, idToBlockType, CC_MAPPINGS, DEFAULT_INPUT_PORT_NAME, DEFAULT_OUTPUT_PORT_NAME, sceneModelOffset, sceneKnobOffset, SCENE_DUMP_BLOCK_ORDER } from '../constants.js';
import { PatchData, PresetInfo, BlockType, NuxClientEvents, SysExPacket, DeviceState, DeviceInfo, PresetData, SignalChain } from '../types.js';

export interface NuxClientOptions {
  transport?: BaseTransport;
  inputPortName?: string | number;
  outputPortName?: string | number;
  autoHeartbeat?: boolean;
  heartbeatIntervalMs?: number;
  timeoutMs?: number;
  synchronizeOnConnect?: boolean;
}
/** Writes are acknowledged and read back. Editing uses 0C; saving uses 0B. */
export interface SceneWriteOptions { reload?: boolean; settleMs?: number; }
interface Pending {
  match: (message: Uint8Array) => boolean;
  resolve: (message: Uint8Array) => void;
  reject: (error: Error) => void;
}

export class NuxMG30Client {
  private transport: BaseTransport;
  private options: NuxClientOptions;
  private activePresetIndex = 0;
  private activeSceneIndex = 0;
  private stateKnown = false;
  private pending?: Pending;
  private queryTail: Promise<void> = Promise.resolve();
  private operationTail: Promise<void> = Promise.resolve();
  private generation = 0;
  private operationGeneration?: number;
  private queries = 0;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private eventListeners: { [K in keyof NuxClientEvents]?: Function[] } = {};

  constructor(options: NuxClientOptions = {}) {
    this.options = options;
    this.transport = options.transport ?? (typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function' ? new WebMidiTransport() : new NodeTransport());
    integer(options.timeoutMs ?? 3000, 1, 120000, 'Timeout');
    this.transport.onMessage(this.handleMidiMessage.bind(this));
  }
  public async connect(): Promise<void> {
    try {
      await this.transport.connect(this.options.inputPortName ?? DEFAULT_INPUT_PORT_NAME, this.options.outputPortName ?? DEFAULT_OUTPUT_PORT_NAME);
      if (this.options.synchronizeOnConnect !== false) await this.synchronize();
      this.emit('connected', { inputPort: String(this.options.inputPortName ?? DEFAULT_INPUT_PORT_NAME), outputPort: String(this.options.outputPortName ?? DEFAULT_OUTPUT_PORT_NAME) });
      if (this.options.autoHeartbeat) {
        this.heartbeatTimer = setInterval(() => {
          if (!this.queries) void this.ping().catch(error => this.emit('error', error));
        }, this.options.heartbeatIntervalMs ?? 5000);
      }
    } catch (error) {
      await this.disconnect().catch(() => {});
      throw error;
    }
  }
  public async disconnect(): Promise<void> {
    this.generation++;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
    this.pending?.reject(new Error('NUX MIDI connection disconnected.'));
    this.stateKnown = false;
    await this.transport.disconnect();
    this.emit('disconnected');
  }
  private send(message: Uint8Array): void {
    this.transport.send(message);
    this.emit('midiSent', Uint8Array.from(message));
  }
  /** One in-flight exchange: MG-30 has no transaction identifiers. */
  private request(message: Uint8Array, match: Pending['match'], timeout = this.options.timeoutMs ?? 3000): Promise<Uint8Array> {
    integer(timeout, 1, 120000, 'Timeout');
    if (this.operationGeneration !== undefined && this.operationGeneration !== this.generation) return Promise.reject(new Error('NUX operation cancelled by disconnect.'));
    const generation = this.generation;
    this.queries++;
    const result = this.queryTail.then(() => {
      if (generation !== this.generation) throw new Error('NUX request cancelled by disconnect.');
      return new Promise<Uint8Array>((resolve, reject) => {
        const cleanup = () => { clearTimeout(timer); if (this.pending === pending) this.pending = undefined; };
        const pending: Pending = {
          match,
          resolve: bytes => { cleanup(); resolve(bytes); },
          reject: error => { cleanup(); reject(error); },
        };
        const timer = setTimeout(() => pending.reject(new Error(`Timed out waiting for NUX response to command 0x${message[4]?.toString(16)} after ${timeout}ms.`)), timeout);
        this.pending = pending;
        try { this.send(message); } catch (error) { pending.reject(error instanceof Error ? error : new Error(String(error))); }
      });
    }).finally(() => { this.queries--; });
    this.queryTail = result.then(() => {}, () => {});
    return result;
  }
  private transaction<T>(action: () => Promise<T>): Promise<T> {
    const generation = this.generation;
    const result = this.operationTail.then(() => {
      if (generation !== this.generation) throw new Error('NUX operation cancelled by disconnect.');
      this.operationGeneration = generation;
      return action().finally(() => { this.operationGeneration = undefined; });
    });
    this.operationTail = result.then(() => {}, () => {});
    return result;
  }
  private async exchange(message: Uint8Array, match: (packet: SysExPacket) => boolean, timeout?: number): Promise<SysExPacket> {
    const bytes = await this.request(message, bytes => {
      const packet = SysExDecoder.parseSysEx(bytes);
      return packet !== null && match(packet);
    }, timeout);
    return SysExDecoder.parseSysEx(bytes)!;
  }
  public async synchronize(timeoutMs?: number): Promise<DeviceState> {
    const packet = await this.exchange(SysExEncoder.buildCurrentStateRequest(), p => p.command === 0x15 && p.direction === 2 && p.payload.length >= 5 && p.payload[0] < 128 && p.payload[3] < 3, timeoutMs);
    this.activePresetIndex = packet.payload[0]; this.activeSceneIndex = packet.payload[3]; this.stateKnown = true;
    return { preset: this.activePresetIndex, sceneIndex: this.activeSceneIndex, raw: packet.payload.slice() };
  }
  private async waitForState(match: (state: DeviceState) => boolean): Promise<DeviceState> {
    const deadline = Date.now() + (this.options.timeoutMs ?? 3000);
    const generation = this.generation;
    let state: DeviceState;
    do {
      if (generation !== this.generation) throw new Error('NUX operation cancelled by disconnect.');
      state = await this.synchronize();
      if (match(state)) return state;
      if (Date.now() >= deadline) break;
      await this.sleep(20);
    } while (Date.now() < deadline);
    return state!;
  }
  public async ping(timeoutMs?: number): Promise<number> {
    const start = Date.now(); await this.synchronize(timeoutMs); this.emit('heartbeat'); return Date.now() - start;
  }
  public sendHeartbeat(): Promise<number> { return this.ping(); }
  public getActivePresetIndex(): number { return this.activePresetIndex; }
  public getActiveSceneIndex(): number { return this.activeSceneIndex; }
  public getActivePresetInfo(): PresetInfo { return { index: this.activePresetIndex, ...programChangeToPresetName(this.activePresetIndex) }; }
  private presetNumber(preset: number | string): number {
    return typeof preset === 'string' ? presetNameToProgramChange(preset) : integer(preset, 0, 127, 'Preset');
  }
  public setPreset(preset: number | string): void {
    const pc = this.presetNumber(preset);
    this.send(SysExEncoder.buildProgramChange(pc));
    this.activePresetIndex = pc; this.stateKnown = true;
    this.emit('presetChanged', this.getActivePresetInfo());
  }
  public async loadPreset(preset: number | string): Promise<DeviceState> {
    const pc = this.presetNumber(preset);
    this.setPreset(pc);
    const state = await this.waitForState(state => state.preset === pc);
    if (state.preset !== pc) throw new Error(`Preset change was not confirmed (requested ${pc}, device reports ${state.preset}).`);
    return state;
  }
  public presetUp(step = 1): PresetInfo {
    integer(step, 0, Number.MAX_SAFE_INTEGER, 'Step'); this.setPreset((this.activePresetIndex + step % 128) % 128); return this.getActivePresetInfo();
  }
  public presetDown(step = 1): PresetInfo {
    integer(step, 0, Number.MAX_SAFE_INTEGER, 'Step'); this.setPreset((this.activePresetIndex - step % 128 + 128) % 128); return this.getActivePresetInfo();
  }
  public selectScene(scene: number): void {
    integer(scene, 1, 3, 'Scene'); this.send(SysExEncoder.buildSceneSelect(scene)); this.activeSceneIndex = scene - 1; this.emit('sceneChanged', { scene });
  }
  public async selectSceneVerified(scene: number): Promise<void> {
    integer(scene, 1, 3, 'Scene');
    if (!this.stateKnown) await this.synchronize();
    const mapping = await this.exchange(SysExEncoder.buildSysExPacket(0x0f, 0), p => p.command === 0x0f && p.direction === 2 && p.payload.length >= 86);
    this.send(SysExEncoder.buildControlChange(mapping.payload[80], scene - 1));
    const state = await this.waitForState(state => state.sceneIndex === scene - 1);
    if (state.sceneIndex !== scene - 1) throw new Error(`Scene ${scene} was not confirmed by the device.`);
  }
  public async requestPatchDump(timeoutMs = this.options.timeoutMs ?? 3000, sceneIndex = this.activeSceneIndex): Promise<PatchData> {
    integer(sceneIndex, 0, 2, 'Scene index');
    const preset = this.stateKnown ? this.activePresetIndex : undefined;
    const packet = await this.exchange(SysExEncoder.buildPatchDumpRequest(sceneIndex), p =>
      p.command === 0x0c && p.direction === 2 && p.payload.length === 215 && p.payload[1] === sceneIndex && (preset === undefined || p.payload[0] === preset), timeoutMs);
    const patch = PatchDecoder.decode(packet.payload);
    this.activePresetIndex = packet.payload[0]; this.stateKnown = true;
    return patch;
  }
  public async requestSavedScene(preset: number | string, sceneIndex: number, timeoutMs?: number): Promise<PatchData> {
    const pc = this.presetNumber(preset); integer(sceneIndex, 0, 2, 'Scene index');
    const packet = await this.exchange(SysExEncoder.buildSavedSceneRequest(pc, sceneIndex), p =>
      p.command === 0x0b && p.direction === 2 && p.payload.length === 215 && p.payload[0] === pc && p.payload[1] === sceneIndex, timeoutMs);
    return PatchDecoder.decode(packet.payload);
  }
  public async readPreset(preset: number | string = this.activePresetIndex, source: 'saved' | 'current' = 'saved'): Promise<PresetData> {
    const pc = this.presetNumber(preset);
    if (source === 'current' && pc !== this.activePresetIndex) throw new Error('Only the active preset has an edit buffer.');
    const scenes: PatchData[] = [];
    for (let i = 0; i < 3; i++) scenes.push(source === 'saved' ? await this.requestSavedScene(pc, i) : await this.requestPatchDump(undefined, i));
    return { index: pc, scenes: scenes as PresetData['scenes'] };
  }
  private body(patch: PatchData): Uint8Array {
    const raw = patch.raw;
    PatchDecoder.decode(raw);
    const body = raw.length === 215 ? unpackNuxPayload(raw.subarray(2)) : Uint8Array.from(raw);
    if (body.length !== 142) throw new Error('Invalid MG-30 scene body length.');
    PatchDecoder.decode(body);
    return body;
  }
  private validatePreset(data: PresetData): void {
    integer(data.index, 0, 127, 'Preset');
    if (!Array.isArray(data.scenes) || data.scenes.length !== 3) throw new Error('A preset must contain all three scenes.');
    data.scenes.forEach((scene, index) => { if (scene.scene !== index + 1) throw new Error('Preset scenes must be ordered 1, 2, 3.'); this.body(scene); });
  }
  private async writeScenes(pc: number, bodies: Uint8Array[], saved: boolean): Promise<void> {
    if (bodies.length !== 3) throw new Error('Writing requires all three scene bodies.');
    bodies.forEach(body => PatchDecoder.decode(body));
    const command = saved ? 0x0b : 0x0c;
    // The device stages the frames; the third scene completes the transfer.
    // Do not try to verify an individual scene before submitting all three.
    for (let scene = 0; scene < 3; scene++) {
      const encoded = packNuxPayload(bodies[scene]);
      const frame = saved ? SysExEncoder.buildSceneDataSet(pc, scene, encoded) : SysExEncoder.buildCurrentSceneDataSet(pc, scene, encoded);
      try { await this.exchange(frame, p => p.command === command && p.direction === 3); }
      catch (error) { throw new Error(`Write stopped at ${programChangeToPresetName(pc).name}, scene ${scene + 1}; earlier scenes may already be saved. ${String(error)}`); }
    }
    const generation = this.generation;
    for (let scene = 0; scene < 3; scene++) {
      const deadline = Date.now() + (this.options.timeoutMs ?? 3000);
      let matched = false;
      do {
        if (generation !== this.generation) throw new Error('NUX operation cancelled by disconnect.');
        const result = saved ? await this.requestSavedScene(pc, scene) : await this.requestPatchDump(undefined, scene);
        if (this.equal(this.body(result), bodies[scene])) { matched = true; break; }
        if (Date.now() >= deadline) break;
        await this.sleep(20);
      } while (Date.now() < deadline);
      if (!matched) throw new Error(`Write verification failed at ${programChangeToPresetName(pc).name}, scene ${scene + 1}; earlier scenes may already be saved.`);
    }
  }
  private equal(a: Uint8Array, b: Uint8Array): boolean { return a.length === b.length && a.every((v, i) => v === b[i]); }
  public async writePreset(data: PresetData, destination: number | string = data.index): Promise<void> {
    this.validatePreset(data); const pc = this.presetNumber(destination);
    const snapshot: PresetData = { index: data.index, scenes: data.scenes.map(patch => PatchDecoder.decode(Uint8Array.from([data.index, patch.scene - 1, ...packNuxPayload(this.body(patch))]))) as PresetData['scenes'] };
    return this.transaction(() => this.writePresetInternal(snapshot, pc));
  }
  private async writePresetInternal(data: PresetData, pc: number): Promise<void> {
    await this.writeScenes(pc, data.scenes.map(scene => this.body(scene)), true);
    this.emit('patchSaved', { presetName: programChangeToPresetName(pc).name, index: pc });
  }
  public async savePatch(preset?: number | string): Promise<void> {
    if (preset !== undefined) this.presetNumber(preset);
    return this.transaction(async () => {
      if (!this.stateKnown) await this.synchronize();
      const current = await this.readPreset(this.activePresetIndex, 'current');
      await this.writePresetInternal(current, preset === undefined ? this.activePresetIndex : this.presetNumber(preset));
    });
  }
  public async clonePreset(source: number | string, destination: number | string): Promise<void> {
    const src = this.presetNumber(source), dest = this.presetNumber(destination);
    if (src === dest) throw new Error('Source and destination preset must differ.');
    return this.transaction(async () => this.writePresetInternal(await this.readPreset(src), dest));
  }
  public async modifyActiveScene(mutator: (decoded: Uint8Array, meta: { preset: number; sceneIndex: number }) => void, options: SceneWriteOptions = {}): Promise<void> {
    return this.transaction(async () => {
      await this.synchronize();
      const pc = this.activePresetIndex, scene = this.activeSceneIndex;
      const snapshot = await this.readPreset(pc, 'current');
      const bodies = snapshot.scenes.map(patch => this.body(patch)), body = bodies[scene];
      mutator(body, { preset: pc, sceneIndex: scene });
      if (this.activePresetIndex !== pc || this.activeSceneIndex !== scene) throw new Error('Active preset or scene changed during editing; retry the operation.');
      await this.writeScenes(pc, bodies, false);
      if (options.settleMs) await this.sleep(integer(options.settleMs, 0, 10000, 'Settle time'));
      // `reload` remains accepted for API compatibility. Editing never reloads or persists.
    });
  }
  public async setBlockState(block: BlockType | number, enabled: boolean, options: SceneWriteOptions = {}): Promise<void> {
    const name = idToBlockType(blockTypeToId(block)), offset = sceneModelOffset(name);
    await this.modifyActiveScene(body => { body[offset] = (body[offset] & 0x3f) | (enabled ? 0 : 0x40); }, options);
    this.emit('blockToggled', { block: name, enabled });
  }
  public async setModel(block: BlockType | number, modelId: number, options: SceneWriteOptions = {}): Promise<void> {
    const name = idToBlockType(blockTypeToId(block)), offset = sceneModelOffset(name); integer(modelId, 0, 63, 'Model');
    await this.modifyActiveScene(body => { body[offset] = (body[offset] & 0x40) | modelId; }, options);
    this.emit('modelChanged', { block: name, modelId });
  }
  public async setParameter(block: BlockType | number, paramId: number, value: number, options: SceneWriteOptions = {}): Promise<void> {
    const name = idToBlockType(blockTypeToId(block)), offset = sceneKnobOffset(name, paramId); integer(value, 0, 100, 'Parameter value');
    await this.modifyActiveScene(body => { body[offset] = value; }, options);
    this.emit('paramChanged', { block: name, paramId, value });
  }
  public async setParameterByte(block: BlockType | number, paramId: number, value: number): Promise<void> {
    const name = idToBlockType(blockTypeToId(block)), offset = sceneKnobOffset(name, paramId); integer(value, 0, 255, 'Raw parameter byte');
    await this.modifyActiveScene(body => { body[offset] = value; });
    this.emit('paramChanged', { block: name, paramId, value });
  }
  public async setTempo(bpm: number): Promise<void> {
    integer(bpm, 40, 240, 'Tempo'); await this.modifyActiveScene(body => { body[91] = bpm >> 7; body[92] = bpm & 127; });
  }
  public async setPresetName(name: string): Promise<void> {
    if (!name.length || name.length > 16 || /[^\x20-\x7e]/.test(name)) throw new Error('Preset name must contain 1..16 printable ASCII characters.');
    return this.transaction(async () => {
      if (!this.stateKnown) await this.synchronize();
      const snapshot = await this.readPreset(this.activePresetIndex, 'current');
      const bodies = snapshot.scenes.map(patch => this.body(patch));
      for (const body of bodies) {
        body.fill(0, 106, 122);
        for (let j = 0; j < name.length; j++) body[106 + j] = name.charCodeAt(j);
      }
      await this.writeScenes(snapshot.index, bodies, false);
    });
  }
  public async cloneScene(source: number, destination: number): Promise<void> {
    integer(source, 1, 3, 'Source scene'); integer(destination, 1, 3, 'Destination scene');
    if (source === destination) throw new Error('Source and destination scene must differ.');
    return this.transaction(async () => {
      if (!this.stateKnown) await this.synchronize();
      const snapshot = await this.readPreset(this.activePresetIndex, 'current');
      const bodies = snapshot.scenes.map(patch => this.body(patch));
      bodies[destination - 1] = bodies[source - 1].slice();
      await this.writeScenes(snapshot.index, bodies, false);
    });
  }
  public async resetScene(scene: number): Promise<void> {
    integer(scene, 1, 3, 'Scene');
    return this.transaction(async () => {
      const snapshot = await this.readPreset(this.activePresetIndex, 'current');
      const bodies = snapshot.scenes.map(patch => this.body(patch)), body = bodies[scene - 1];
      for (const block of SCENE_DUMP_BLOCK_ORDER) if (block !== 'VOL') body[sceneModelOffset(block)] |= 0x40;
      await this.writeScenes(snapshot.index, bodies, false);
    });
  }
  public async clearPreset(preset?: number | string, options: { keepAmpCab?: boolean } = {}): Promise<void> {
    if (preset !== undefined) await this.loadPreset(preset);
    return this.transaction(async () => {
      const snapshot = await this.readPreset(this.activePresetIndex, 'current');
      for (const scene of snapshot.scenes) {
        const body = this.body(scene);
        for (const block of SCENE_DUMP_BLOCK_ORDER) {
          if (block === 'VOL' || (options.keepAmpCab && (block === 'AMP' || block === 'IR'))) continue;
          body[sceneModelOffset(block)] |= 0x40;
        }
        scene.raw = Uint8Array.from([snapshot.index, scene.scene - 1, ...packNuxPayload(body)]);
      }
      await this.writePresetInternal(snapshot, snapshot.index);
      await this.loadPreset(snapshot.index);
    });
  }
  public async requestSignalChain(): Promise<SignalChain> {
    const packet = await this.exchange(SysExEncoder.buildSignalChainRequest(), p => p.command === 0x0d && p.direction === 2 && p.payload.length === 13);
    const ids = Array.from(packet.payload.slice(0, 12));
    if (new Set(ids).size !== 12 || ids.some(id => id > 11)) throw new Error('Device returned an invalid signal chain.');
    return { blocks: ids.map(idToBlockType), configuration: packet.payload[12] };
  }
  public async setSignalChain(blocks: BlockType[]): Promise<void> {
    const ids = blocks.map(blockTypeToId);
    if (ids.length !== 12 || new Set(ids).size !== 12) throw new Error('Signal chain must contain each of the twelve blocks exactly once.');
    return this.transaction(async () => {
      const old = await this.requestSignalChain();
      await this.exchange(SysExEncoder.buildSignalChainSet(ids, old.configuration), p => p.command === 0x0d && (p.direction === 3 || (p.direction === 2 && p.payload.length === 13 && ids.every((id, index) => p.payload[index] === id))));
      const actual = await this.requestSignalChain();
      if (actual.blocks.some((b, i) => blockTypeToId(b) !== ids[i]) || actual.configuration !== old.configuration) throw new Error('Signal-chain update failed verification.');
    });
  }
  public async requestDeviceInfo(): Promise<DeviceInfo> {
    const raw = await this.request(Uint8Array.from([0xf0, 0x43, 0x58, 0, 0xf7]), b => b.length === 45 && b[0] === 0xf0 && b[1] === 0x43 && b[2] === 0x58 && b[44] === 0xf7);
    const text = (bytes: Uint8Array) => Array.from(bytes).filter(b => b !== 0).map(b => String.fromCharCode(b)).join('').trim();
    const firmware = text(raw.slice(4, 36)), model = text(raw.slice(36, 44));
    if (!firmware || !model || /[^\x20-\x7e]/.test(firmware + model)) throw new Error('Device info response contains an unsupported text encoding.');
    return { firmware, model, raw: raw.slice() };
  }
  public sendCC(cc: number, value: number): void { this.send(SysExEncoder.buildControlChange(cc, value)); }
  public listInputPorts() { return this.transport.listInputPorts(); }
  public listOutputPorts() { return this.transport.listOutputPorts(); }
  public on<K extends keyof NuxClientEvents>(event: K, listener: NuxClientEvents[K]): this {
    const listeners: Function[] = this.eventListeners[event] ?? [];
    listeners.push(listener); this.eventListeners[event] = listeners; return this;
  }
  public off<K extends keyof NuxClientEvents>(event: K, listener: NuxClientEvents[K]): this {
    this.eventListeners[event] = this.eventListeners[event]?.filter(l => l !== listener); return this;
  }
  private emit<K extends keyof NuxClientEvents>(event: K, ...args: Parameters<NuxClientEvents[K]>): void {
    for (const listener of this.eventListeners[event] ?? []) {
      try { listener(...args); } catch (error) { console.error(`Error in ${event} listener:`, error); }
    }
  }
  private handleMidiMessage(_delta: number, message: Uint8Array): void {
    this.emit('midiReceived', Uint8Array.from(message));
    const packet = SysExDecoder.parseSysEx(message);
    if (packet?.command === 0x15 && packet.direction === 2 && packet.payload.length >= 5 && packet.payload[3] <= 2) {
      this.activePresetIndex = packet.payload[0]; this.activeSceneIndex = packet.payload[3]; this.stateKnown = true;
    }
    if (packet?.command === 0x0c && packet.direction === 2 && packet.payload.length === 215) {
      this.activePresetIndex = packet.payload[0]; this.stateKnown = true;
    }
    // Resolve and clear before publishing events; listeners may submit another request.
    if (this.pending?.match(message)) this.pending.resolve(Uint8Array.from(message));
    if (packet) {
      this.emit('sysex', packet);
      if ((packet.command === 0x0b || packet.command === 0x0c) && packet.direction === 2 && packet.payload.length === 215) {
        try {
          const patch = PatchDecoder.decode(packet.payload);
          patch.presetName = programChangeToPresetName(packet.payload[0]).name;
          this.emit('patchReceived', patch);
        } catch (error) { this.emit('error', error instanceof Error ? error : new Error(String(error))); }
      }
      return;
    }
    if (SysExDecoder.isProgramChange(message)) {
      this.activePresetIndex = message[1]; this.stateKnown = true; this.emit('presetChanged', this.getActivePresetInfo());
    } else if (SysExDecoder.isControlChange(message)) {
      if (message[1] === CC_MAPPINGS.SCENE_SELECT && message[2] <= 2) {
        this.activeSceneIndex = message[2]; this.emit('sceneChanged', { scene: message[2] + 1 });
      } else if (message[1] === CC_MAPPINGS.EXPRESSION_PEDAL) this.emit('expressionPedal', message[2]);
    }
  }
  private sleep(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
}
