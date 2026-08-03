import { Input, Output } from '@julusian/midi';

/**
 * Envia o request SIGNAL_CHAIN_ROUTING (0x0F) e também tenta
 * outros comandos SysEx para descobrir a cadeia de sinal.
 */

const NUX_HEADER = [0xF0, 0x43, 0x58, 0x70];
const SYSEX_END = 0xF7;

async function main() {
  const input = new Input();
  const output = new Output();

  const inCount = input.getPortCount();
  const outCount = output.getPortCount();

  console.log('=== Portas MIDI ===');
  for (let i = 0; i < inCount; i++) console.log(`  IN[${i}] ${input.getPortName(i)}`);
  for (let i = 0; i < outCount; i++) console.log(`  OUT[${i}] ${output.getPortName(i)}`);

  const inIdx = (() => { for (let i = 0; i < inCount; i++) if (input.getPortName(i).toLowerCase().includes('mg-30')) return i; return -1; })();
  const outIdx = (() => { for (let i = 0; i < outCount; i++) if (output.getPortName(i).toLowerCase().includes('mg-30')) return i; return -1; })();

  if (inIdx < 0 || outIdx < 0) { console.error('NUX MG-30 não encontrado'); process.exit(1); }

  input.ignoreTypes(false, false, false);
  input.openPort(inIdx);
  output.openPort(outIdx);

  const responses: { label: string; data: number[] }[] = [];

  input.on('message', (_dt: number, message: number[]) => {
    const hex = message.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    const ts = new Date().toISOString().split('T')[1].slice(0, 12);
    
    console.log(`  [${ts}] Rx (${message.length}b): ${hex}`);
    
    // Parse NUX SysEx
    if (message[0] === 0xF0 && message[1] === 0x43 && message[2] === 0x58 && message[3] === 0x70) {
      const cmd = message[4];
      const dir = message[5];
      const payload = message.slice(6, message.length - 1);
      console.log(`         CMD=0x${cmd.toString(16).toUpperCase()} DIR=0x${dir.toString(16).toUpperCase()} Payload(${payload.length}b): [${payload.map(b => b.toString(16).padStart(2, '0')).join(', ')}]`);
      console.log(`         Payload decimal: [${payload.join(', ')}]`);
    }

    responses.push({ label: 'response', data: message });
  });

  // Testes de requests SysEx
  const tests = [
    { label: 'SIGNAL_CHAIN_ROUTING (0x0F)', msg: [...NUX_HEADER, 0x0F, 0x00, SYSEX_END] },
    { label: 'SIGNAL_CHAIN_ROUTING dir=0x01', msg: [...NUX_HEADER, 0x0F, 0x01, SYSEX_END] },
    { label: 'CMD 0x7E (visto na resposta)', msg: [...NUX_HEADER, 0x7E, 0x00, SYSEX_END] },
    { label: 'CMD 0x7E dir=0x01', msg: [...NUX_HEADER, 0x7E, 0x01, SYSEX_END] },
    { label: 'PATCH DUMP (0x0A)', msg: [...NUX_HEADER, 0x0A, 0x00, SYSEX_END] },
    { label: 'CMD 0x10 (possível chain)', msg: [...NUX_HEADER, 0x10, 0x00, SYSEX_END] },
    { label: 'CMD 0x11', msg: [...NUX_HEADER, 0x11, 0x00, SYSEX_END] },
    { label: 'CMD 0x12', msg: [...NUX_HEADER, 0x12, 0x00, SYSEX_END] },
    { label: 'CMD 0x13', msg: [...NUX_HEADER, 0x13, 0x00, SYSEX_END] },
  ];

  for (const test of tests) {
    console.log(`\n>>> Enviando: ${test.label}`);
    console.log(`    Hex: ${test.msg.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}`);
    output.sendMessage(test.msg);
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n\n=== Aguardando respostas pendentes (3s)... ===');
  await new Promise(r => setTimeout(r, 3000));

  console.log(`\n=== Total de respostas recebidas: ${responses.length} ===`);
  
  input.closePort();
  output.closePort();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
