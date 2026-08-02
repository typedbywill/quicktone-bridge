import { NuxMG30Client } from '../src/index.js';

async function main() {
  console.log('🎸 Initializing NUX MG-30 Live Monitor...');

  const client = new NuxMG30Client();

  console.log('\n--- Input Ports ---');
  client.listInputPorts().forEach(p => console.log(` [${p.index}] ${p.name}`));

  console.log('\n--- Output Ports ---');
  client.listOutputPorts().forEach(p => console.log(` [${p.index}] ${p.name}`));

  client.on('connected', ({ inputPort, outputPort }) => {
    console.log(`\n✅ Connected to NUX MG-30!`);
    console.log(` Input:  ${inputPort}`);
    console.log(` Output: ${outputPort}`);
    console.log('\nListening for events... Press CTRL+C to exit.\n');
  });

  client.on('presetChanged', (preset) => {
    console.log(`🎵 PRESET CHANGED: ${preset.name} (Bank ${preset.bank}, Channel ${preset.channel}, Index ${preset.index})`);
  });

  client.on('expressionPedal', (val) => {
    const percent = Math.round((val / 127) * 100);
    console.log(`🎛️ EXP PEDAL: ${val}/127 (${percent}%)`);
  });

  client.on('patchReceived', (patch) => {
    console.log(`📦 PATCH DUMP RECEIVED: Preset ${patch.presetName}, BPM: ${patch.bpm}, Scene: ${patch.scene}`);
  });

  client.on('sysex', (packet) => {
    console.log(`⚡ SYSEX: Cmd 0x${packet.command.toString(16).padStart(2, '0').toUpperCase()}, Direction 0x${packet.direction.toString(16).padStart(2, '0')}, Payload ${packet.payload.length} bytes`);
  });

  try {
    await client.connect();
  } catch (err: any) {
    console.error('❌ Connection error:', err.message);
    process.exit(1);
  }
}

main();
