import { Input, Output } from '@julusian/midi';
import { BaseTransport } from './BaseTransport.js';
import { MidiPortInfo } from '../types.js';
import { DEFAULT_INPUT_PORT_NAME, DEFAULT_OUTPUT_PORT_NAME } from '../constants.js';

export class NodeTransport extends BaseTransport {
  private input: Input;
  private output: Output;

  constructor() {
    super();
    this.input = new Input();
    this.output = new Output();
    // Do not ignore SysEx, timing, or active sensing
    this.input.ignoreTypes(false, false, false);
  }

  public listInputPorts(): MidiPortInfo[] {
    const ports: MidiPortInfo[] = [];
    const count = this.input.getPortCount();
    for (let i = 0; i < count; i++) {
      ports.push({ index: i, name: this.input.getPortName(i) });
    }
    return ports;
  }

  public listOutputPorts(): MidiPortInfo[] {
    const ports: MidiPortInfo[] = [];
    const count = this.output.getPortCount();
    for (let i = 0; i < count; i++) {
      ports.push({ index: i, name: this.output.getPortName(i) });
    }
    return ports;
  }

  public async connect(
    inputPortIndexOrName: number | string = DEFAULT_INPUT_PORT_NAME,
    outputPortIndexOrName: number | string = DEFAULT_OUTPUT_PORT_NAME
  ): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }

    const inPort = this.findPortIndex(this.listInputPorts(), inputPortIndexOrName);
    const outPort = this.findPortIndex(this.listOutputPorts(), outputPortIndexOrName);

    if (inPort === -1) {
      throw new Error(`Input MIDI port not found matching "${inputPortIndexOrName}".`);
    }
    if (outPort === -1) {
      throw new Error(`Output MIDI port not found matching "${outputPortIndexOrName}".`);
    }

    this.input.openPort(inPort);
    this.output.openPort(outPort);
    this.isConnected = true;

    this.input.on('message', (deltaTime: number, message: number[]) => {
      this.notifyMessage(deltaTime, new Uint8Array(message));
    });
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected) {
      try {
        this.input.removeAllListeners();
        this.input.closePort();
      } catch {}
      try {
        this.output.closePort();
      } catch {}
      this.isConnected = false;
    }
  }

  public send(message: Uint8Array | number[]): void {
    if (!this.isConnected) {
      throw new Error('Cannot send MIDI message: Transport is not connected.');
    }
    const arr = message instanceof Uint8Array ? Array.from(message) : message;
    this.output.sendMessage(arr);
  }

  private findPortIndex(ports: MidiPortInfo[], identifier: number | string): number {
    if (typeof identifier === 'number') {
      return identifier >= 0 && identifier < ports.length ? identifier : -1;
    }
    const lower = identifier.toLowerCase();
    const exact = ports.find(p => p.name.toLowerCase() === lower);
    if (exact) return exact.index;
    const partial = ports.find(p => p.name.toLowerCase().includes(lower));
    return partial ? partial.index : -1;
  }
}
