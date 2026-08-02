import { NuxMG30Client } from '../src/index.js';

async function main() {
  console.log('🎛️ NUX MG-30 Effect Parameter & Block Control Demo...\n');

  const client = new NuxMG30Client();

  client.on('blockToggled', ({ block, enabled }) => {
    console.log(`  -> Block [${block}] toggled: ${enabled ? '⚡ ON' : '⚪ OFF'}`);
  });

  client.on('modelChanged', ({ block, modelId }) => {
    console.log(`  -> Block [${block}] model changed to: #${modelId}`);
  });

  client.on('paramChanged', ({ block, paramId, value }) => {
    console.log(`  -> Block [${block}] Param #${paramId} set to: ${value}`);
  });

  try {
    await client.connect();
    console.log('✅ Connected to NUX MG-30!\n');

    // 1. Toggle EFX block ON
    console.log('1. Toggling EFX Block ON...');
    client.setBlockState('EFX', true);
    await new Promise(r => setTimeout(r, 600));

    // 2. Select EFX Model #1
    console.log('2. Selecting EFX Model #1...');
    client.setModel('EFX', 1);
    await new Promise(r => setTimeout(r, 600));

    // 3. Set AMP Gain (Param 0) to 85
    console.log('3. Adjusting AMP Gain (Param #0) to 85...');
    client.setParameter('AMP', 0, 85);
    await new Promise(r => setTimeout(r, 600));

    // 4. Toggle EFX block back OFF
    console.log('4. Toggling EFX Block OFF...');
    client.setBlockState('EFX', false);
    await new Promise(r => setTimeout(r, 600));

    // 5. Fetch updated patch dump to verify
    console.log('5. Requesting Patch Dump to confirm hardware state...');
    const patch = await client.requestPatchDump();
    console.log(`\n📦 Current Preset: ${patch.presetName}`);
    console.log('   Block Statuses:');
    for (const [blockId, block] of Object.entries(patch.blocks)) {
      console.log(`     - ${blockId.padEnd(4)}: ${block.enabled ? 'ON ' : 'OFF'} (Model #${block.modelId})`);
    }

    await client.disconnect();
    console.log('\n✅ Demo completed successfully!');
  } catch (err: any) {
    console.error('❌ Error during effect control demo:', err.message);
    process.exit(1);
  }
}

main();
