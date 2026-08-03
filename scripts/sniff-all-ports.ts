import { Input } from '@julusian/midi';

/**
 * Sniffer DUPLO: escuta TODAS as portas MIDI (input e output)
 * O NUX MG-30 expõe 2 portas:
 *   - "NUX MG-30 MIDI IN" (input) → o que o pedal manda pro PC
 *   - "NUX MG-30 MIDI OUT" (output, que vira input virtual) → o que o PC manda pro pedal
 * 
 * Este script abre TODAS as portas de INPUT para capturar tudo.
 */

async function main() {
  console.log('====================================================');
  console.log('  NUX MG-30 DUAL MIDI SNIFFER (ALL PORTS)');
  console.log('====================================================');

  const input = new Input();
  const count = input.getPortCount();
  
  console.log(`\nPortas de ENTRADA MIDI encontradas: ${count}`);
  for (let i = 0; i < count; i++) {
    console.log(`  [${i}] ${input.getPortName(i)}`);
  }

  // Abrir listeners em TODAS as portas
  const inputs: Input[] = [];
  for (let i = 0; i < count; i++) {
    const inp = new Input();
    inp.ignoreTypes(false, false, false);
    inp.openPort(i);
    const portName = inp.getPortName(i);
    
    inp.on('message', (_dt: number, message: number[]) => {
      const bytes = new Uint8Array(message);
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);

      let detail = '';
      if (bytes[0] === 0xF0) {
        detail = ` [SysEx, ${bytes.length} bytes]`;
        // Se for uma mensagem SysEx longa, mostrar breakdown
        if (bytes.length > 10) {
          detail += `\n           Header: ${hex.substring(0, 14)}`;
          detail += `\n           Payload: ${hex.substring(15)}`;
        }
      } else if ((bytes[0] & 0xF0) === 0xB0) {
        detail = ` [CC=${bytes[1]} (0x${bytes[1].toString(16)}), Val=${bytes[2]}]`;
      } else if ((bytes[0] & 0xF0) === 0xC0) {
        detail = ` [Program Change PC=${bytes[1]}]`;
      }

      console.log(`[${timestamp}] PORT[${i}] "${portName}" (${bytes.length}b): ${hex}${detail}`);
    });
    
    inputs.push(inp);
    console.log(`✅ Escutando porta [${i}] "${portName}"`);
  }

  console.log('\n👉 Agora troque blocos no QuickTone! Pressione CTRL+C para sair.\n');

  // Keep running
  await new Promise(() => {});
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
