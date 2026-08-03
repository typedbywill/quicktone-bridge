import { NodeTransport } from '../src/transport/NodeTransport.js';
import { NUX_SYSEX_HEADER, SYSEX_END } from '../src/constants.js';

async function sendPacket(transport: NodeTransport, bytes: number[], label: string) {
  console.log(`\n👉 Testing ${label}: [${bytes.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}]`);
  try {
    transport.send(new Uint8Array(bytes));
    await new Promise(r => setTimeout(r, 2000));
  } catch (err: any) {
    console.error(`Error sending ${label}:`, err.message);
  }
}

async function main() {
  const transport = new NodeTransport();
  await transport.connect();
  console.log('====================================================');
  console.log('  NUX MG-30 SCENE SYSEX CANDIDATE DIAGNOSTIC');
  console.log('====================================================');
  console.log('Verifique a tela do pedal NUX MG-30 enquanto os testes são enviados...\n');

  // Candidate 1: Realtime Param Change on Block 13 (Scene) -> Scene 2 (val 1)
  await sendPacket(transport, [...NUX_SYSEX_HEADER, 0x01, 0x01, 0x0D, 0x00, 0x01, SYSEX_END], 'Candidate 1 (Param Change Block 13 -> Scene 2)');
  await sendPacket(transport, [...NUX_SYSEX_HEADER, 0x01, 0x01, 0x0D, 0x00, 0x00, SYSEX_END], 'Candidate 1 (Param Change Block 13 -> Scene 1)');

  // Candidate 2: Realtime Param Change with 0x5B -> Scene 2 (val 1)
  await sendPacket(transport, [...NUX_SYSEX_HEADER, 0x01, 0x01, 0x5B, 0x00, 0x01, SYSEX_END], 'Candidate 2 (Param Change 0x5B -> Scene 2)');
  await sendPacket(transport, [...NUX_SYSEX_HEADER, 0x01, 0x01, 0x5B, 0x00, 0x00, SYSEX_END], 'Candidate 2 (Param Change 0x5B -> Scene 1)');

  // Candidate 3: SysEx Command 0x0D -> Scene 2 (val 1)
  await sendPacket(transport, [...NUX_SYSEX_HEADER, 0x0D, 0x01, 0x01, SYSEX_END], 'Candidate 3 (SysEx 0x0D -> Scene 2)');
  await sendPacket(transport, [...NUX_SYSEX_HEADER, 0x0D, 0x01, 0x00, SYSEX_END], 'Candidate 3 (SysEx 0x0D -> Scene 1)');

  // Candidate 4: SysEx Command 0x07 -> Scene 2 (val 1)
  await sendPacket(transport, [...NUX_SYSEX_HEADER, 0x07, 0x01, 0x01, SYSEX_END], 'Candidate 4 (SysEx 0x07 -> Scene 2)');
  await sendPacket(transport, [...NUX_SYSEX_HEADER, 0x07, 0x01, 0x00, SYSEX_END], 'Candidate 4 (SysEx 0x07 -> Scene 1)');

  // Candidate 5: SysEx Command 0x10 -> Scene 2 (val 1)
  await sendPacket(transport, [...NUX_SYSEX_HEADER, 0x10, 0x01, 0x01, SYSEX_END], 'Candidate 5 (SysEx 0x10 -> Scene 2)');
  await sendPacket(transport, [...NUX_SYSEX_HEADER, 0x10, 0x01, 0x00, SYSEX_END], 'Candidate 5 (SysEx 0x10 -> Scene 1)');

  await transport.disconnect();
  console.log('\n✅ Diagnóstico concluído!');
}

main().catch(err => console.error('Fatal error:', err));
