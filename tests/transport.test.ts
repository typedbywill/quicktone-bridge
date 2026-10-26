import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NodeTransport } from '../src/transport/NodeTransport.js';
import { WebMidiTransport } from '../src/transport/WebMidiTransport.js';

let mockInputInstances: any[] = [];
let mockOutputInstances: any[] = [];

vi.mock('@julusian/midi', () => {
  return {
    Input: vi.fn().mockImplementation(() => {
      const listeners: Record<string, Function[]> = {};
      const inst = {
        ignoreTypes: vi.fn(),
        getPortCount: vi.fn().mockReturnValue(1),
        getPortName: vi.fn().mockReturnValue('NUX MG-30 MIDI IN'),
        openPort: vi.fn(),
        closePort: vi.fn(),
        on: vi.fn((event: string, cb: Function) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(cb);
        }),
        removeAllListeners: vi.fn(() => {
          for (const k of Object.keys(listeners)) {
            delete listeners[k];
          }
        }),
        _emitMessage: (deltaTime: number, message: number[]) => {
          (listeners['message'] || []).forEach(cb => cb(deltaTime, message));
        },
        _listeners: listeners
      };
      mockInputInstances.push(inst);
      return inst;
    }),
    Output: vi.fn().mockImplementation(() => {
      const inst = {
        getPortCount: vi.fn().mockReturnValue(1),
        getPortName: vi.fn().mockReturnValue('NUX MG-30 MIDI OUT'),
        openPort: vi.fn(),
        closePort: vi.fn(),
        sendMessage: vi.fn()
      };
      mockOutputInstances.push(inst);
      return inst;
    })
  };
});

describe('NodeTransport Lifecycle & Port Selection Tests', () => {
  beforeEach(() => {
    mockInputInstances = [];
    mockOutputInstances = [];
    vi.clearAllMocks();
  });

  it('should connect, send MIDI, receive messages, and disconnect', async () => {
    const transport = new NodeTransport();
    const received: Uint8Array[] = [];

    transport.onMessage((_delta, msg) => {
      received.push(msg);
    });

    await transport.connect();
    expect(transport.getIsConnected()).toBe(true);

    const inputMock = mockInputInstances[0];
    const outputMock = mockOutputInstances[0];

    expect(inputMock.openPort).toHaveBeenCalledWith(0);
    expect(outputMock.openPort).toHaveBeenCalledWith(0);

    // Send
    const payload = new Uint8Array([0xF0, 0x43, 0x58, 0x70, 0xF7]);
    transport.send(payload);
    expect(outputMock.sendMessage).toHaveBeenCalledWith([0xF0, 0x43, 0x58, 0x70, 0xF7]);

    // Simulate incoming message
    inputMock._emitMessage(0, [0xF0, 0x43, 0x58, 0x70, 0x01, 0xF7]);
    expect(received.length).toBe(1);
    expect(Array.from(received[0])).toEqual([0xF0, 0x43, 0x58, 0x70, 0x01, 0xF7]);

    // Disconnect
    await transport.disconnect();
    expect(transport.getIsConnected()).toBe(false);
    expect(inputMock.closePort).toHaveBeenCalled();
    expect(outputMock.closePort).toHaveBeenCalled();
  });

  it('should reject connection when port is not found without hardware fallback', async () => {
    const transport = new NodeTransport();

    // Look for non-existent device
    await expect(transport.connect('Focusrite 2i2', 'Focusrite 2i2')).rejects.toThrow(
      /Input MIDI port not found matching "Focusrite 2i2"/
    );
    expect(transport.getIsConnected()).toBe(false);
  });

  it('should rollback and close both ports if output open fails after input open', async () => {
    const transport = new NodeTransport();

    // Pre-create input and output by accessing listPorts
    transport.listInputPorts();
    transport.listOutputPorts();

    const inputMock = mockInputInstances[0];
    const outputMock = mockOutputInstances[0];

    outputMock.openPort.mockImplementationOnce(() => {
      throw new Error('Port busy or unavailable');
    });

    await expect(transport.connect()).rejects.toThrow('Port busy or unavailable');

    expect(transport.getIsConnected()).toBe(false);
    expect(inputMock.openPort).toHaveBeenCalled();
    expect(inputMock.removeAllListeners).toHaveBeenCalled();
    expect(inputMock.closePort).toHaveBeenCalled();
    expect(outputMock.closePort).toHaveBeenCalled();
  });

  it('should await closing on disconnect instead of deferring to setImmediate', async () => {
    const transport = new NodeTransport();
    await transport.connect();

    const inputMock = mockInputInstances[0];
    const outputMock = mockOutputInstances[0];

    let closeFinished = false;
    inputMock.closePort.mockImplementation(() => {
      closeFinished = true;
    });

    await transport.disconnect();
    expect(closeFinished).toBe(true);
    expect(outputMock.closePort).toHaveBeenCalled();
    expect(transport.getIsConnected()).toBe(false);
  });

  it('should preserve BaseTransport message listeners across reconnect for the same client', async () => {
    const transport = new NodeTransport();
    const received: Uint8Array[] = [];

    // Client registers listener once
    transport.onMessage((_delta, msg) => {
      received.push(msg);
    });

    await transport.connect();
    const inputMock1 = mockInputInstances[0];
    inputMock1._emitMessage(0, [0xF0, 0x01, 0xF7]);
    expect(received.length).toBe(1);

    // Disconnect
    await transport.disconnect();
    expect(transport.getIsConnected()).toBe(false);

    // Reconnect
    await transport.connect();
    const inputMock2 = mockInputInstances[mockInputInstances.length - 1];
    inputMock2._emitMessage(0, [0xF0, 0x02, 0xF7]);

    // Listener was NOT dropped on BaseTransport; it should receive the second message!
    expect(received.length).toBe(2);
    expect(Array.from(received[1])).toEqual([0xF0, 0x02, 0xF7]);
  });
});

describe('WebMidiTransport Lifecycle Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createMockWebMidi() {
    const inputPort = {
      name: 'NUX MG-30 MIDI IN',
      state: 'connected',
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      onmidimessage: null as any,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    const outputPort = {
      name: 'NUX MG-30 MIDI OUT',
      state: 'connected',
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    const midiAccess = {
      inputs: new Map([[0, inputPort]]),
      outputs: new Map([[0, outputPort]])
    };

    vi.stubGlobal('navigator', {
      requestMIDIAccess: vi.fn().mockResolvedValue(midiAccess)
    });

    return { inputPort, outputPort, midiAccess };
  }

  it('should open and close ports when supported by WebMIDI', async () => {
    const { inputPort, outputPort } = createMockWebMidi();
    const transport = new WebMidiTransport();

    await transport.connect();
    expect(transport.getIsConnected()).toBe(true);
    expect(inputPort.open).toHaveBeenCalled();
    expect(outputPort.open).toHaveBeenCalled();

    transport.send(new Uint8Array([0xF0, 0x7E, 0xF7]));
    expect(outputPort.send).toHaveBeenCalled();

    await transport.disconnect();
    expect(transport.getIsConnected()).toBe(false);
    expect(inputPort.close).toHaveBeenCalled();
    expect(outputPort.close).toHaveBeenCalled();
  });

  it('should rollback on WebMidi connect failure if output open throws', async () => {
    const { inputPort, outputPort } = createMockWebMidi();
    outputPort.open.mockRejectedValueOnce(new Error('WebMIDI output denied'));

    const transport = new WebMidiTransport();
    await expect(transport.connect()).rejects.toThrow('WebMIDI output denied');

    expect(transport.getIsConnected()).toBe(false);
    expect(inputPort.open).toHaveBeenCalled();
    expect(inputPort.close).toHaveBeenCalled();
    expect(inputPort.onmidimessage).toBeNull();
  });

  it('should preserve BaseTransport listeners across WebMidi reconnect', async () => {
    const { inputPort } = createMockWebMidi();
    const transport = new WebMidiTransport();
    const received: Uint8Array[] = [];

    transport.onMessage((_delta, msg) => {
      received.push(msg);
    });

    await transport.connect();
    expect(inputPort.onmidimessage).toBeDefined();

    inputPort.onmidimessage({ timeStamp: 10, data: new Uint8Array([0xF0, 0x43, 0xF7]) });
    expect(received.length).toBe(1);

    await transport.disconnect();
    await transport.connect();

    inputPort.onmidimessage({ timeStamp: 20, data: new Uint8Array([0xF0, 0x43, 0x01, 0xF7]) });
    expect(received.length).toBe(2);
  });
});
