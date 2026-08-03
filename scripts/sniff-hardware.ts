import { NodeTransport } from '../src/transport/NodeTransport.js';
import { DEFAULT_INPUT_PORT_NAME } from '../src/constants.js';

async function main() {
  console.log('====================================================');
  console.log('  NUX MG-30 REALTIME MIDI SNIFFER');
  console.log('====================================================');
  console.log('Escutando todas as mensagens MIDI vindas do NUX MG-30...');
  console.log('👉 Por favor, aperte o botão/footswitch do bloco MOD no pedal ou altere no QuickTone!');
  console.log('Pressione CTRL+C para sair.\n');

  const transport = new NodeTransport();
  
  // List ports
  const inputs = transport.listInputPorts();
  console.log('Portas de Entrada MIDI encontradas:', inputs.map(p => `[${p.index}] ${p.name}`));

  const targetPort = inputs.find(p => p.name.toLowerCase().includes('mg-30') || p.name.toLowerCase().includes('nux'));
  if (!targetPort) {
    console.error('❌ Porta NUX MG-30 não encontrada!');
    process.exit(1);
  }

  console.log(`\n🔌 Abrindo porta de entrada: "${targetPort.name}"...`);
  
  // Connect input only
  try {
    const input = (transport as any).getInput();
    input.openPort(targetPort.index);
    input.ignoreTypes(false, false, false); // Do not ignore SysEx, timing, active sensing

    input.on('message', (deltaTime: number, message: number[]) => {
      const bytes = new Uint8Array(message);
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
      const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);

      let detail = '';
      if (bytes[0] === 0xF0) {
        detail = ' [SysEx Message]';
      } else if ((bytes[0] & 0xF0) === 0xB0) {
        detail = ` [Control Change CC=${bytes[1]} (0x${bytes[1].toString(16)}), Val=${bytes[2]}]`;
      } else if ((bytes[0] & 0xF0) === 0xC0) {
        detail = ` [Program Change PC=${bytes[1]}]`;
      }

      console.log(`[${timestamp}] Rx (${bytes.length} bytes): ${hex}${detail}`);
    });

    console.log('✅ Monitor ativo! Aguardando ações no pedal...\n');
    
    // Keep process running until interrupted
    await new Promise(() => {});
  } catch (err: any) {
    console.error('❌ Erro ao abrir porta MIDI:', err.message);
  }
}

main().catch(err => {
  console.error('Erro fatal:', err);
});
