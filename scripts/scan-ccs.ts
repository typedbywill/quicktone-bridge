import { NodeTransport } from '../src/transport/NodeTransport.js';

async function main() {
  const startCC = process.argv[2] ? Number(process.argv[2]) : 40;
  const endCC = process.argv[3] ? Number(process.argv[3]) : 85;

  const transport = new NodeTransport();
  await transport.connect();

  console.log(`====================================================`);
  console.log(`  SCANNING MIDI CONTROL CHANGES (CC ${startCC} to ${endCC})`);
  console.log(`====================================================`);
  console.log(`Observe a tela do pedal NUX MG-30 (Atualmente na Cena 3)...`);

  for (let cc = startCC; cc <= endCC; cc++) {
    // Skip CC 81 (Drum loop) and CC 75 (Tuner)
    if (cc === 81 || cc === 75) continue;

    console.log(`Testing CC ${cc} (0x${cc.toString(16).toUpperCase()}) -> Val 0 (Scene 1)...`);
    transport.send(new Uint8Array([0xB0, cc, 0]));
    await new Promise(r => setTimeout(r, 800));
  }

  await transport.disconnect();
  console.log('\nScan finalizado!');
}

main().catch(console.error);
