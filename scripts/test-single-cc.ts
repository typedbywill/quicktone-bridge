import { NodeTransport } from '../src/transport/NodeTransport.js';

async function testSingleCC(cc: number) {
  console.log(`\n====================================================`);
  console.log(`  TESTANDO APENAS O CC ${cc} (0x${cc.toString(16).toUpperCase()})`);
  console.log(`====================================================`);
  const transport = new NodeTransport();
  await transport.connect();

  console.log(`👉 Enviando CC ${cc} = 1 (Mudando para Scene 2)...`);
  transport.send(new Uint8Array([0xB0, cc & 0x7F, 1]));
  await new Promise(r => setTimeout(r, 3000));

  console.log(`👉 Enviando CC ${cc} = 2 (Mudando para Scene 3)...`);
  transport.send(new Uint8Array([0xB0, cc & 0x7F, 2]));
  await new Promise(r => setTimeout(r, 3000));

  console.log(`👉 Enviando CC ${cc} = 0 (Mudando para Scene 1)...`);
  transport.send(new Uint8Array([0xB0, cc & 0x7F, 0]));
  await new Promise(r => setTimeout(r, 3000));

  await transport.disconnect();
  console.log(`Finalizado teste do CC ${cc}.`);
}

const targetCC = process.argv[2] ? Number(process.argv[2]) : 60;
testSingleCC(targetCC).catch(console.error);
