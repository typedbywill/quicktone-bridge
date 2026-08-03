import { createConnectedClient } from '../src/cli/helpers.js';
import { SysExEncoder } from '../src/protocol/SysExEncoder.js';

async function main() {
  const action = process.argv[2] || 'on';
  const block = process.argv[3] || 'MOD';

  console.log(`Testing CC Block Toggle for ${block} -> ${action}...`);
  const { client, connected } = await createConnectedClient();
  if (!connected) {
    console.error('Failed to connect');
    process.exit(1);
  }

  // MOD blockId is 6
  // CC message: 0xB0, 0x06, (action === 'on' ? 0x41 : 0x00)
  const isEnabled = action === 'on';
  
  // Test sending CC message directly
  const ccMsg = SysExEncoder.buildControlChange(6, isEnabled ? 0x41 : 0x00);
  console.log(`Sending MIDI CC: ${Array.from(ccMsg).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  (client as any).transport.send(ccMsg);

  await new Promise(r => setTimeout(r, 500));
  await client.disconnect();
  console.log('Done!');
}

main().catch(console.error);
