import { BaseTransport } from './BaseTransport.js';
import { MidiPortInfo } from '../types.js';
import { DEFAULT_INPUT_PORT_NAME, DEFAULT_OUTPUT_PORT_NAME } from '../constants.js';
import { findMatchingPortIndex } from '../utils/midiUtils.js';

export class WebMidiTransport extends BaseTransport {
  private midiAccess: any = null;
  private selectedInput: any = null;
  private selectedOutput: any = null;

  public async initWebMidi(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      throw new Error('WebMIDI API is not supported in this environment.');
    }
    if (!this.midiAccess) {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
    }
  }

  public listInputPorts(): MidiPortInfo[] {
    if (!this.midiAccess) return [];
    const ports: MidiPortInfo[] = [];
    let idx = 0;
    for (const entry of this.midiAccess.inputs.values()) {
      ports.push({ index: idx++, name: entry.name || `MIDI Input ${idx}` });
    }
    return ports;
  }

  public listOutputPorts(): MidiPortInfo[] {
    if (!this.midiAccess) return [];
    const ports: MidiPortInfo[] = [];
    let idx = 0;
    for (const entry of this.midiAccess.outputs.values()) {
      ports.push({ index: idx++, name: entry.name || `MIDI Output ${idx}` });
    }
    return ports;
  }

  public async connect(
    inputPortIndexOrName: number | string = DEFAULT_INPUT_PORT_NAME,
    outputPortIndexOrName: number | string = DEFAULT_OUTPUT_PORT_NAME
  ): Promise<void> {
    await this.initWebMidi();

    if (this.isConnected) {
      await this.disconnect();
    }

    const inputs = Array.from(this.midiAccess.inputs.values());
    const outputs = Array.from(this.midiAccess.outputs.values());

    this.selectedInput = this.findPort(inputs, inputPortIndexOrName);
    this.selectedOutput = this.findPort(outputs, outputPortIndexOrName);

    if (!this.selectedInput) {
      throw new Error(`WebMIDI Input port matching "${inputPortIndexOrName}" not found.`);
    }
    if (!this.selectedOutput) {
      throw new Error(`WebMIDI Output port matching "${outputPortIndexOrName}" not found.`);
    }

    this.selectedInput.onmidimessage = (event: any) => {
      this.notifyMessage(event.timeStamp, new Uint8Array(event.data));
    };

    this.isConnected = true;
  }

  public async disconnect(): Promise<void> {
    if (this.selectedInput) {
      this.selectedInput.onmidimessage = null;
      this.selectedInput = null;
    }
    this.selectedOutput = null;
    this.isConnected = false;
  }

  public send(message: Uint8Array | number[]): void {
    if (!this.isConnected || !this.selectedOutput) {
      throw new Error('Cannot send WebMIDI message: Transport is not connected.');
    }
    const arr = message instanceof Uint8Array ? message : new Uint8Array(message);
    this.selectedOutput.send(arr);
  }

  private findPort(ports: any[], identifier: number | string): any {
    const portItems = ports.map((p, index) => ({ index, name: p.name || '' }));
    const matchIndex = findMatchingPortIndex(portItems, identifier);
    return matchIndex !== -1 ? ports[matchIndex] : null;
  }
}

