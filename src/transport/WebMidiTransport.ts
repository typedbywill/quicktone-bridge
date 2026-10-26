import { BaseTransport } from './BaseTransport.js';
import { MidiPortInfo } from '../types.js';
import { DEFAULT_INPUT_PORT_NAME, DEFAULT_OUTPUT_PORT_NAME } from '../constants.js';
import { findMatchingPortIndex } from '../utils/midiUtils.js';

export class WebMidiTransport extends BaseTransport {
  private midiAccess: any = null;
  private selectedInput: any = null;
  private selectedOutput: any = null;
  private stateChangeHandler: any = null;

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

    const inputCandidate = this.findPort(inputs, inputPortIndexOrName);
    const outputCandidate = this.findPort(outputs, outputPortIndexOrName);

    if (!inputCandidate) {
      throw new Error(`WebMIDI Input port matching "${inputPortIndexOrName}" not found.`);
    }
    if (!outputCandidate) {
      throw new Error(`WebMIDI Output port matching "${outputPortIndexOrName}" not found.`);
    }

    let inputOpened = false;
    let outputOpened = false;

    try {
      if (typeof inputCandidate.open === 'function') {
        await inputCandidate.open();
        inputOpened = true;
      }
      if (typeof outputCandidate.open === 'function') {
        await outputCandidate.open();
        outputOpened = true;
      }

      this.selectedInput = inputCandidate;
      this.selectedOutput = outputCandidate;

      this.selectedInput.onmidimessage = (event: any) => {
        this.notifyMessage(event.timeStamp, new Uint8Array(event.data));
      };

      this.stateChangeHandler = (event: any) => {
        const port = event?.port;
        if (port && (port === this.selectedInput || port === this.selectedOutput)) {
          if (port.state === 'disconnected') {
            this.disconnect().catch(() => {});
          }
        }
      };

      if (typeof this.selectedInput.addEventListener === 'function') {
        this.selectedInput.addEventListener('statechange', this.stateChangeHandler);
      } else {
        this.selectedInput.onstatechange = this.stateChangeHandler;
      }

      if (typeof this.selectedOutput.addEventListener === 'function') {
        this.selectedOutput.addEventListener('statechange', this.stateChangeHandler);
      } else {
        this.selectedOutput.onstatechange = this.stateChangeHandler;
      }

      this.isConnected = true;
    } catch (err) {
      this.isConnected = false;
      if (inputCandidate) {
        inputCandidate.onmidimessage = null;
        if (inputOpened && typeof inputCandidate.close === 'function') {
          try {
            await inputCandidate.close();
          } catch {}
        }
      }
      if (outputCandidate && outputOpened && typeof outputCandidate.close === 'function') {
        try {
          await outputCandidate.close();
        } catch {}
      }
      this.selectedInput = null;
      this.selectedOutput = null;
      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    const input = this.selectedInput;
    const output = this.selectedOutput;
    const handler = this.stateChangeHandler;

    this.selectedInput = null;
    this.selectedOutput = null;
    this.stateChangeHandler = null;
    this.isConnected = false;

    if (input) {
      input.onmidimessage = null;
      if (handler) {
        if (typeof input.removeEventListener === 'function') {
          try {
            input.removeEventListener('statechange', handler);
          } catch {}
        } else if (input.onstatechange === handler) {
          input.onstatechange = null;
        }
      }
      if (typeof input.close === 'function') {
        try {
          await input.close();
        } catch {}
      }
    }

    if (output) {
      if (handler) {
        if (typeof output.removeEventListener === 'function') {
          try {
            output.removeEventListener('statechange', handler);
          } catch {}
        } else if (output.onstatechange === handler) {
          output.onstatechange = null;
        }
      }
      if (typeof output.close === 'function') {
        try {
          await output.close();
        } catch {}
      }
    }
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
