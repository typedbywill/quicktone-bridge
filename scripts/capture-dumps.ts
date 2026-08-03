import { createConnectedClient } from '../src/cli/helpers.js';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('========================================');
  console.log('  NUX MG-30 SYSEX DUMP CAPTURE SCRIPT');
  console.log('========================================');
  console.log('Este script solicita dumps SysEx do NUX MG-30 em tempo real.');
  console.log('Altere o preset/parâmetros no pedal quando solicitado para podermos mapear os offsets exatos!\n');

  const { client, connected } = await createConnectedClient();

  if (!connected) {
    console.error('❌ Falha ao conectar ao NUX MG-30. Certifique-se de que o pedal está ligado via USB.');
    process.exit(1);
  }

  const captures: Array<{ step: string; timestamp: string; length: number; hex: string }> = [];

  const captureDump = async (stepName: string) => {
    console.log(`\n⏳ Solicitando dump SysEx para: "${stepName}"...`);
    try {
      const patch = await client.requestPatchDump(3000);
      const hex = Buffer.from(patch.raw).toString('hex');
      console.log(`✅ Recebido ${patch.raw.length} bytes!`);
      console.log(`   Hex preview (primeiros 64 bytes): ${hex.slice(0, 64)}...`);
      captures.push({
        step: stepName,
        timestamp: new Date().toISOString(),
        length: patch.raw.length,
        hex
      });
    } catch (e: any) {
      console.error(`❌ Timeout ou erro ao obter dump: ${e.message}`);
    }
  };

  await captureDump('Dump 1: Estado Inicial Atual');

  const outputFile = path.join(process.cwd(), `nux-dumps-triangulation-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify({ device: 'NUX MG-30', captures }, null, 2), 'utf-8');

  console.log('\n========================================');
  console.log(`💾 Capturas salvas em: ${outputFile}`);
  console.log('========================================\n');

  await client.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
