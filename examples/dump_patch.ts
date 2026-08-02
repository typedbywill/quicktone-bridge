import { NuxMG30Client } from '../src/index.js';

async function main() {
  console.log('📦 Fetching Active Patch Dump from NUX MG-30...');
  const client = new NuxMG30Client();

  try {
    await client.connect();
    console.log('Connected! Sending SysEx 0x0A request...');

    const patch = await client.requestPatchDump(3000);
    console.log('\n✅ Patch Dump Successfully Received!');
    console.log('--------------------------------------------------');
    console.log(`Preset Name:    ${patch.presetName}`);
    console.log(`BPM:            ${patch.bpm}`);
    console.log(`Active Scene:   ${patch.scene}`);
    console.log(`Raw Data Size:  ${patch.raw.length} bytes`);
    console.log('Signal Chain:  ', patch.signalChain.join(' -> '));
    console.log('Block Summary:');
    for (const [blockId, block] of Object.entries(patch.blocks)) {
      console.log(`  - [${blockId.padEnd(3)}] ${block.enabled ? 'ON ' : 'OFF'} (Model #${block.modelId})`);
    }
    console.log('--------------------------------------------------\n');

    await client.disconnect();
  } catch (err: any) {
    console.error('❌ Error fetching patch dump:', err.message);
    process.exit(1);
  }
}

main();
