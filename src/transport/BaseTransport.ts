import { MidiPortInfo } from '../types.js';

export type MidiMessageHandler = (deltaTime: number, message: Uint8Array) => void;

export abstract class BaseTransport {
  protected isConnected = false;
  protected messageListeners: MidiMessageHandler[] = [];

  public abstract listInputPorts(): MidiPortInfo[];
  public abstract listOutputPorts(): MidiPortInfo[];
  public abstract connect(inputPortIndexOrName?: number | string, outputPortIndexOrName?: number | string): Promise<void>;
  public abstract disconnect(): Promise<void>;
  public abstract send(message: Uint8Array | number[]): void;

  public onMessage(handler: MidiMessageHandler): void {
    this.messageListeners.push(handler);
  }

  public removeMessageListener(handler: MidiMessageHandler): void {
    this.messageListeners = this.messageListeners.filter(l => l !== handler);
  }

  protected notifyMessage(deltaTime: number, message: Uint8Array): void {
    for (const listener of this.messageListeners) {
      try {
        listener(deltaTime, message);
      } catch (err) {
        console.error('Error in MIDI message listener:', err);
      }
    }
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }
}
