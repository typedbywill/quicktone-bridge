import { NodeTransport } from '../src/transport/NodeTransport.js';

async function testCC(cc: number, ccName: string) {
  console.log(`\n----------------------------------------------------`);
  console.log(`Testing CC ${cc} (0x${cc.toString(16).toUpperCase()}) - ${ccName}`);
  console.log(`----------------------------------------------------`);
  const transport = new NodeTransport();
  await transport.connect();

  console.log(`Sending CC ${cc} = 1 (Scene 2)...`);
  transport.send(new Uint8Array([0xB0, cc & 0x7F, 1]));
  await new Promise(r => setTimeout(r, 2000));

  console.log(`Sending CC ${cc} = 2 (Scene 3)...`);
  transport.send(new Uint8Array([0xB0, cc & 0x7F, 2]));
  await new Promise(r => setTimeout(r, 2000));

  console.log(`Sending CC ${cc} = 0 (Scene 1)...`);
  transport.send(new Uint8Array([0xB0, cc & 0x7F, 0]));
  await new Promise(r => setTimeout(r, 2000));

  await transport.disconnect();
}

async function main() {
  const ccToTest = process.argv[2] ? Number(process.argv[2]) : 60;
  await testCC(ccToTest, `CC ${ccToTest}`);
}

main().catch(err => {
  console.error('Error:', err);
});
