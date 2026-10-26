import { BaseTransport } from '../../src/transport/BaseTransport.js';
import { MidiPortInfo } from '../../src/types.js';

/** Stateful protocol fixture, independent of production encoders/decoders.
 * Models only the MG-30 commands used by client regressions; it is not hardware evidence.
 */
export class VirtualMG30 extends BaseTransport {
  public readonly sent: Uint8Array[] = [];
  public readonly saved = new Map<number, Uint8Array[]>();
  public current: Uint8Array[] = [];
  public preset = 17;
  public sceneIndex = 2;
  public readonly mode = 7;
  public sceneCc = 99;
  public autoReply = true;
  public readonly dropCommands = new Set<number>();
  public corruptNextReadback = false;
  public rejectNextSend = false;
  public chain = Uint8Array.from([...Array.from({ length: 12 }, (_, i) => i), 37]);
  private corruptReadback = false;

  constructor() {
    super();
    this.current = this.savedScenes(this.preset).map(body => body.slice());
  }

  public listInputPorts(): MidiPortInfo[] { return [{ index: 0, name: 'Virtual MG-30' }]; }
  public listOutputPorts(): MidiPortInfo[] { return this.listInputPorts(); }
  public async connect(): Promise<void> { this.isConnected = true; }
  public async disconnect(): Promise<void> { this.isConnected = false; }

  public savedScenes(preset: number): Uint8Array[] {
    if (!this.saved.has(preset)) {
      this.saved.set(preset, [0, 1, 2].map(scene => canonicalSceneBody(preset, scene)));
    }
    return this.saved.get(preset)!;
  }

  public inject(bytes: Uint8Array | number[]): void {
    this.notifyMessage(0, Uint8Array.from(bytes));
  }

  public send(message: Uint8Array | number[]): void {
    if (!this.isConnected) throw new Error('Virtual MIDI port disconnected.');
    if (this.rejectNextSend) { this.rejectNextSend = false; throw new Error('Virtual send failure.'); }
    const copy = Uint8Array.from(message);
    this.sent.push(copy);
    if (this.autoReply) queueMicrotask(() => {
      if (this.isConnected) this.respond(copy);
    });
  }

  public respond(message: Uint8Array | number[]): void {
    const bytes = Uint8Array.from(message);
    if ((bytes[0] & 0xf0) === 0xc0) {
      this.preset = bytes[1];
      this.sceneIndex = 0;
      this.current = this.savedScenes(this.preset).map(body => body.slice());
      return;
    }
    if ((bytes[0] & 0xf0) === 0xb0) {
      if (bytes[1] === this.sceneCc && bytes[2] <= 2) this.sceneIndex = bytes[2];
      return;
    }
    if (bytes.length === 5 && bytes[3] === 0 && bytes[4] === 0xf7) {
      const reply = new Uint8Array(45);
      reply.set([0xf0, 0x43, 0x58, 0]); reply[44] = 0xf7;
      reply.set(Array.from('VirtualSerial', char => char.charCodeAt(0)), 4);
      reply.set(Array.from('5.0.1', char => char.charCodeAt(0)), 36);
      this.inject(reply); return;
    }
    const command = bytes[4], operation = bytes[5];
    if (this.dropCommands.has(command)) return;
    if (command === 0x15 && operation === 0) {
      this.inject(frame(command, 2, [this.preset, this.mode, 0, this.sceneIndex, 1, 0, 0, 0]));
    } else if (command === 0x0f && operation === 0) {
      const map = Uint8Array.from({ length: 86 }, (_, i) => i);
      map[80] = this.sceneCc;
      this.inject(frame(command, 2, map));
    } else if ((command === 0x0b || command === 0x0c) && operation === 0) {
      const pc = command === 0x0b ? bytes[6] : this.preset;
      const scene = bytes[7];
      let body = (command === 0x0b ? this.savedScenes(pc)[scene] : this.current[scene]).slice();
      if (this.corruptReadback) { this.corruptReadback = false; body[28] ^= 1; }
      this.inject(frame(command, 2, [pc, scene, ...packBody(body)]));
    } else if ((command === 0x0b || command === 0x0c) && operation === 1) {
      if (bytes.length !== 222) throw new Error('Virtual device requires a 222-byte scene set.');
      const pc = bytes[6], scene = bytes[7], body = unpackBody(bytes.slice(8, -1));
      if (command === 0x0b) this.savedScenes(pc)[scene] = body;
      else {
        if (pc !== this.preset) throw new Error('Current scene write targets a nonactive preset.');
        this.current[scene] = body;
      }
      if (this.corruptNextReadback) { this.corruptNextReadback = false; this.corruptReadback = true; }
      this.inject(frame(command, 3, []));
    } else if (command === 0x0d && operation === 0) {
      this.inject(frame(command, 2, this.chain));
    } else if (command === 0x0d && operation === 1) {
      this.chain = bytes.slice(6, -1);
      this.inject(frame(command, 3, []));
    }
  }
}

export function frame(command: number, operation: number, payload: Uint8Array | number[] = []): Uint8Array {
  return Uint8Array.from([0xf0, 0x43, 0x58, 0x70, command, operation, ...payload, 0xf7]);
}

export function canonicalSceneBody(preset = 0, scene = 0): Uint8Array {
  const body = new Uint8Array(142);
  // Native fixed layout: 12 model bytes, then twelve count/value records.
  const slots = [2, 4, 6, 8, 12, 4, 6, 8, 4, 6, 3, 2];
  let offset = 12;
  for (let block = 0; block < 12; block++) {
    body[block] = (block % 4) | (block % 2 ? 0x40 : 0);
    body[offset++] = slots[block];
    for (let param = 0; param < slots[block]; param++) body[offset++] = (preset + scene * 20 + block + param) % 101;
  }
  body[91] = 0;
  body[92] = 100 + scene;
  body.set(Array.from({ length: 12 }, (_, i) => i), 94);
  const name = `Preset${preset}-S${scene + 1}`;
  body.set(Array.from(name, char => char.charCodeAt(0)), 106);
  // Retain opaque bytes through all read-modify-write and copying paths.
  for (let i = 122; i < 142; i++) body[i] = (0x80 + preset + scene + i) & 255;
  return body;
}

export function packBody(body: Uint8Array): Uint8Array {
  const packed: number[] = [];
  for (let i = 0; i < body.length; i += 2) {
    packed.push(body[i] >>> 6, ((body[i] & 63) << 1) | (body[i + 1] >>> 7), body[i + 1] & 127);
  }
  return Uint8Array.from(packed);
}

function unpackBody(packed: Uint8Array): Uint8Array {
  const body: number[] = [];
  for (let i = 0; i < packed.length; i += 3) {
    body.push((packed[i] << 6) | (packed[i + 1] >>> 1), ((packed[i + 1] & 1) << 7) | packed[i + 2]);
  }
  return Uint8Array.from(body);
}
