import { NodeTransport } from '../src/transport/NodeTransport.js';

async function testCC(transport: NodeTransport, cc: number, val: number, label: string) {
  console.log(`Sending ${label} (CC ${cc} = ${val})...`);
  try {
    transport.send(new Uint8Array([0xB0, cc & 0x7F, val & 0x7F]));
    await new Promise(r => setTimeout(r, 2000));
  } catch (err: any) {
    console.error(`❌ Frame send error (QuickTone may be locking MIDI port):`, err.message);
  }
}

async function main() {
  console.log('====================================================');
  console.log('  NUX MG-30 DIRECT SCENE TEST');
  console.log('====================================================');
  console.log('⚠️ IMPORTANTE: Feche o software QuickTone antes de rodar este teste!\n');

  const transport = new NodeTransport();
  try {
    await transport.connect();
  } catch (err: any) {
    console.error('❌ Não foi possível conectar ao NUX MG-30.');
    console.error('Se o QuickTone estiver aberto, feche-o para liberar a porta MIDI.\n');
    process.exit(1);
  }

  const ccsToTest = [60, 50, 52, 68, 80];

  for (const cc of ccsToTest) {
    console.log(`\n--- Testando CC ${cc} ---`);
    await testCC(transport, cc, 1, `Scene 2 via CC ${cc}`);
    await testCC(transport, cc, 2, `Scene 3 via CC ${cc}`);
    await testCC(transport, cc, 0, `Scene 1 via CC ${cc}`);
  }

  await transport.disconnect();
  console.log('\n✅ Teste concluído!');
}

main().catch(console.error);
