import { NuxMG30Client } from '../src/index.js';

async function main() {
  const targetPreset = process.argv[2] || "01A";
  console.log(`🎛️ Switching NUX MG-30 Preset to: ${targetPreset}...`);

  const client = new NuxMG30Client();

  try {
    await client.connect();
    client.setPreset(targetPreset);
    console.log(`✅ Sent Program Change command for preset ${targetPreset}`);
    
    // Give MIDI bus a moment to settle
    await new Promise(r => setTimeout(r, 500));
    await client.disconnect();
  } catch (err: any) {
    console.error('❌ Error switching preset:', err.message);
    process.exit(1);
  }
}

main();
