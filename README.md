# 🎸 NUX CLI (`nux`) & quicktone-bridge

> Dynamic CLI tool and TypeScript library to control, configure, backup, and interact with the **NUX MG-30** multi-effects processor via USB MIDI & SysEx.

---

## ✨ NUX CLI Overview

The **NUX CLI** (`nux`) allows you to interact with your **NUX MG-30** multi-effects pedal directly from the terminal.

```bash
# Install globally or run via npx
npm install -g quicktone-bridge

# Run NUX CLI
nux --help
```

---

## 💻 CLI Commands Structure

### 🔌 Conexão
```bash
nux ping              # Test hardware connection response
nux status            # Show connection status and MIDI ports
nux info              # Display device & client state info
nux connect           # Establish MIDI connection to NUX MG-30
nux disconnect        # Disconnect MIDI ports
nux sync              # Request full patch dump & sync state
```

### 🎛️ Presets
```bash
nux preset list                 # List all 128 presets (32 Banks A-D)
nux preset show <id>            # Show preset details (e.g. 01A, 05C)
nux preset load <id>            # Switch to hardware preset (e.g. 01A)
nux preset save [id]            # Save current patch edits to slot
nux preset rename <id> <nome>   # Rename preset
nux preset clone <src> <dest>   # Clone preset from src to dest
nux preset delete <id>          # Reset preset to clean default baseline
nux preset backup               # Create backup file of all presets
nux preset restore <arquivo>    # Restore presets from backup file
nux preset export <id> [file]   # Export preset to JSON/SysEx file
nux preset import <arquivo>     # Import preset from file
```

### 🎬 Cenas
```bash
nux scene list                  # List scenes (Scene 1, 2, 3)
nux scene show <1|2|3>          # Display scene settings
nux scene select <1|2|3>        # Switch active scene
nux scene clone <src> <dest>    # Copy scene settings from src to dest
nux scene reset <1|2|3>         # Reset scene parameters
```

### ⚡ Blocos de Efeito
```bash
nux block list                  # List all 10 effect blocks and models
nux block show <id>             # Show block details and parameters
nux block state <id>            # Show ON/OFF status of block
nux block enable <id>           # Turn effect block ON
nux block disable <id>          # Turn effect block OFF
nux block toggle <id>           # Toggle effect block status
nux block reset <id>            # Reset block parameters to default
```

### 🎚️ Parâmetros
```bash
nux param list                  # List effect parameters
nux param show <id>             # Show parameter info
nux param get <id>              # Get parameter value
nux param set <id> <valor>      # Set parameter value (0..127)
nux param min <id>              # Set parameter value to minimum (0)
nux param max <id>              # Set parameter value to maximum (127)
```

### 🔗 Cadeia de Efeitos
```bash
nux chain show                  # Show current signal chain order
nux chain reset                 # Reset signal chain to default order
nux chain move <origem> <dest>  # Move block to position in chain
nux chain swap <origem> <dest>  # Swap positions of two blocks
```

### 🧰 Hardware
```bash
nux device info                 # Display NUX MG-30 device info
nux device firmware             # Display firmware version
nux device reboot               # Restart NUX MG-30 device
```

### 📁 Arquivos (Export / Import)
```bash
nux export preset <id> <file>   # Export preset <id> to file
nux import preset <file>        # Import preset from file
nux export bank <file>          # Export complete bank to file
nux import bank <file>          # Import complete bank from file
```

### 🩺 Diagnóstico & Utilidades
```bash
nux doctor                      # Run diagnostics on Node environment & MIDI ports
nux logs                        # Display communication log stream
nux dump                        # Dump raw SysEx patch bytes from device
nux version                     # Show CLI version
nux help                        # Show help information
```

---

## ⚡ Quick Start (TypeScript / JavaScript Library)

You can also import `quicktone-bridge` as a library in Node.js or browser apps:

```typescript
import { NuxMG30Client } from 'quicktone-bridge';

async function main() {
  const client = new NuxMG30Client();
  await client.connect();

  // Switch preset to 02B
  client.setPreset('02B');

  // Turn EFX block ON
  client.setBlockState('EFX', true);

  // Select Amp Model #6 and set Gain
  client.setModel('AMP', 6);
  client.setParameter('AMP', 0, 85);

  await client.disconnect();
}

main();
```

---

## 📄 License

[MIT License](LICENSE) © 2026 William
