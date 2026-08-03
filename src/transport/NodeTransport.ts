import { Input, Output } from '@julusian/midi';
import { BaseTransport } from './BaseTransport.js';
import { MidiPortInfo } from '../types.js';
import { DEFAULT_INPUT_PORT_NAME, DEFAULT_OUTPUT_PORT_NAME } from '../constants.js';
import { findMatchingPortIndex } from '../utils/midiUtils.js';

export class NodeTransport extends BaseTransport {
  private input: Input | null = null;
  private output: Output | null = null;

  constructor() {
    super();
  }

  private getInput(): Input {
    if (!this.input) {
      this.input = new Input();
      this.input.ignoreTypes(false, false, false);
    }
    return this.input;
  }

  private getOutput(): Output {
    if (!this.output) {
      this.output = new Output();
    }
    return this.output;
  }

  public listInputPorts(): MidiPortInfo[] {
    try {
      const input = this.getInput();
      const ports: MidiPortInfo[] = [];
      const count = input.getPortCount();
      for (let i = 0; i < count; i++) {
        ports.push({ index: i, name: input.getPortName(i) });
      }
      return ports;
    } catch {
      return [];
    }
  }

  public listOutputPorts(): MidiPortInfo[] {
    try {
      const output = this.getOutput();
      const ports: MidiPortInfo[] = [];
      const count = output.getPortCount();
      for (let i = 0; i < count; i++) {
        ports.push({ index: i, name: output.getPortName(i) });
      }
      return ports;
    } catch {
      return [];
    }
  }

  public async connect(
    inputPortIndexOrName: number | string = DEFAULT_INPUT_PORT_NAME,
    outputPortIndexOrName: number | string = DEFAULT_OUTPUT_PORT_NAME
  ): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }

    const input = this.getInput();
    const output = this.getOutput();

    const inPort = this.findPortIndex(this.listInputPorts(), inputPortIndexOrName);
    const outPort = this.findPortIndex(this.listOutputPorts(), outputPortIndexOrName);

    if (inPort === -1) {
      throw new Error(`Input MIDI port not found matching "${inputPortIndexOrName}".`);
    }
    if (outPort === -1) {
      throw new Error(`Output MIDI port not found matching "${outputPortIndexOrName}".`);
    }

    input.openPort(inPort);
    output.openPort(outPort);
    this.isConnected = true;

    input.on('message', (deltaTime: number, message: number[]) => {
      this.notifyMessage(deltaTime, new Uint8Array(message));
    });
  }

  public async disconnect(): Promise<void> {
    if (!this.isConnected && !this.input && !this.output) {
      return;
    }

    this.isConnected = false;

    // On Windows, closePort() can block indefinitely if a large SysEx flood is
    // in flight (e.g. scene-bank dumps). Drop listeners and release refs first;
    // defer close so callers (CLI) can process.exit cleanly.
    const input = this.input;
    const output = this.output;
    this.input = null;
    this.output = null;

    if (input) {
      try {
        input.removeAllListeners();
      } catch {}
      setImmediate(() => {
        try {
          input.closePort();
        } catch {}
      });
    }

    if (output) {
      try {
        output.closePort();
      } catch {}
    }
  }

  public send(message: Uint8Array | number[]): void {
    if (!this.isConnected || !this.output) {
      throw new Error('Cannot send MIDI message: Transport is not connected.');
    }
    const arr = message instanceof Uint8Array ? Array.from(message) : message;
    try {
      this.output.sendMessage(arr);
    } catch (err: any) {
      throw new Error(`MIDI send failed: ${err?.message || err}`);
    }
  }

  private findPortIndex(ports: MidiPortInfo[], identifier: number | string): number {
    return findMatchingPortIndex(ports, identifier);
  }
}

