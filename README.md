# 🎸 quicktone-bridge

> A fully-typed TypeScript library and bridge to reverse-engineer, control, and configure the **NUX MG-30** multi-effects processor via USB MIDI & SysEx. Supports both **Node.js** and **Browser (WebMIDI)** environments.

---

## ✨ Features

- 🔌 **Universal Compatibility**: Works seamlessly in **Node.js** (`@julusian/midi`) and **Web Browsers** (`WebMIDI API`).
- 🎛️ **Full Preset & Patch Control**: Select presets (`01A` to `32D`), query 215+ byte active patch dumps, and save modified patches directly to hardware memory.
- ⚡ **Real-Time Effect Editing**: Toggle effect blocks ON/OFF, select effect models, and adjust knob parameters (Gain, Bass, Treble, Time, Mix, etc.) in real time.
- 📊 **Real-Time Event Streams**: Listen for Program Changes, Expression Pedal movements, Tuner stream data, and raw SysEx packets.
- 🛠️ **CLI Executables**: Out-of-the-box CLI utilities for monitoring, dumping patches, switching presets, and live testing.
- 📦 **Modern TS Build**: Bundled with `tsup` producing CommonJS (`.js`), ES Modules (`.mjs`), and TypeScript declarations (`.d.ts`).

---

## 🚀 Installation

```bash
npm install quicktone-bridge
```

---

## ⚡ Quick Start

```typescript
import { NuxMG30Client } from 'quicktone-bridge';

async function main() {
  const client = new NuxMG30Client();

  // Listen for events
  client.on('presetChanged', (preset) => {
    console.log(`🎵 Switched to Preset: ${preset.name} (Bank ${preset.bank}${preset.channel})`);
  });

  client.on('expressionPedal', (val) => {
    console.log(`🎛️ Expression Pedal: ${val}/127`);
  });

  // Connect to NUX MG-30
  await client.connect();

  // 1. Switch preset to 02B
  client.setPreset('02B');

  // 2. Toggle EFX block ON
  client.setBlockState('EFX', true);

  // 3. Set AMP Gain (Param #0) to 85
  client.setParameter('AMP', 0, 85);

  // 4. Fetch full active patch dump from hardware
  const patch = await client.requestPatchDump();
  console.log('Active Scene:', patch.scene);
  console.log('BPM:', patch.bpm);
  console.log('Signal Chain:', patch.signalChain.join(' -> '));

  // Disconnect when finished
  await client.disconnect();
}

main();
```

---

## 🔬 Protocol & Reverse-Engineering Specifications

The **NUX MG-30** uses System Exclusive (SysEx) messages for full communication with its official **QuickTone** software:

- **SysEx Header**: `F0 43 58 70` (`0xF0`, `'C'`, `'X'`, `'p'`)
- **SysEx End**: `F7`
- **Vendor ID**: `0x43` (Cherub Technology / NUX)

### Command Opcodes Map

| Opcode | Hex | Description | SysEx Structure |
| :--- | :--- | :--- | :--- |
| **Patch Dump** | `0x0A` | Request/receive 215-byte patch state | `F0 43 58 70 0A 00 F7` |
| **Block Toggle** | `0x02` | Turn block ON (`0x01`) or OFF (`0x00`) | `F0 43 58 70 02 01 [BLOCK_ID] [STATE] F7` |
| **Model Select** | `0x03` | Select effect model index | `F0 43 58 70 03 01 [BLOCK_ID] [MODEL_ID] F7` |
| **Param Change** | `0x01` | Adjust parameter/knob value (0..127) | `F0 43 58 70 01 01 [BLOCK_ID] [PARAM_ID] [VAL] F7` |
| **Save Patch** | `0x0B` | Store current edits into hardware slot | `F0 43 58 70 0B 01 [PRESET_INDEX] F7` |
| **Heartbeat** | `0x0E` | Connection health check | `F0 43 58 70 0E 00 F7` |
| **Global EQ** | `0x14` | Request system I/O & Global EQ setup | `F0 43 58 70 14 00 F7` |

### Block ID Index Table

| Index | Block Name | Description |
| :---: | :---: | :--- |
| **0** | `WAH` | Wah / Volume pedal block |
| **1** | `CMP` | Compressor block |
| **2** | `EFX` | Overdrive / Distortion / Boost block |
| **3** | `AMP` | Amp model block |
| **4** | `EQ` | Graphic / Parametric EQ block |
| **5** | `NG` | Noise Gate block |
| **6** | `MOD` | Modulation block (Chorus, Flanger, Phaser, Tremolo) |
| **7** | `DLY` | Delay block |
| **8** | `RVB` | Reverb block |
| **9** | `CAB` | Cabinet IR block |

---

## 🛠️ API Reference

### `NuxMG30Client`

#### Options

```typescript
const client = new NuxMG30Client({
  inputPortName?: string;       // Default: "NUX MG-30 MIDI IN"
  outputPortName?: string;      // Default: "NUX MG-30 MIDI OUT"
  autoHeartbeat?: boolean;      // Auto send ping every 5s (default: false)
  heartbeatIntervalMs?: number; // Heartbeat interval in ms (default: 5000)
});
```

#### Core Methods

- `connect(): Promise<void>`: Connects to the hardware MIDI ports.
- `disconnect(): Promise<void>`: Closes input and output MIDI ports.
- `setPreset(preset: number | string): void`: Switches to a preset by index (`0..127`) or string (`"01A"`, `"02B"`, `"32D"`).
- `setBlockState(block: BlockType | number, enabled: boolean): void`: Toggles an effect block ON/OFF.
- `setModel(block: BlockType | number, modelId: number): void`: Changes model for an effect block.
- `setParameter(block: BlockType | number, paramId: number, value: number): void`: Adjusts parameter value.
- `savePatch(preset?: number | string): void`: Saves current patch edits directly to pedal memory.
- `requestPatchDump(timeoutMs?: number): Promise<PatchData>`: Requests full active patch state.
- `listInputPorts(): MidiPortInfo[]`: Lists available input MIDI ports.
- `listOutputPorts(): MidiPortInfo[]`: Lists available output MIDI ports.

#### Events

- `client.on('connected', ({ inputPort, outputPort }) => ...)`
- `client.on('presetChanged', (preset: PresetInfo) => ...)`
- `client.on('patchReceived', (patch: PatchData) => ...)`
- `client.on('blockToggled', ({ block, enabled }) => ...)`
- `client.on('modelChanged', ({ block, modelId }) => ...)`
- `client.on('paramChanged', ({ block, paramId, value }) => ...)`
- `client.on('expressionPedal', (value: number) => ...)`
- `client.on('sysex', (packet: SysExPacket) => ...)`

---

## 🛠️ CLI Utilities & NPM Scripts

This package comes with ready-to-use CLI scripts:

```bash
# Fetch and print active patch dump from connected hardware
npm run dump

# Live effect control demo (toggles EFX, changes model, tweaks gain)
npm run edit

# Switch preset bank (e.g. switch to 02B)
npm run switch 02B

# Real-time event monitor logging CC, PC, and SysEx messages
npm run monitor

# Run unit test suite
npm test

# Build distribution bundle (dist/ index.js, index.mjs, index.d.ts)
npm run build
```

---

## 📄 License

[MIT License](LICENSE) © 2026 William
