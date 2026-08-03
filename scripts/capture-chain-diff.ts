import { NodeTransport } from '../src/transport/NodeTransport.js';

/**
 * Script para capturar dois dumps SysEx e comparar byte a byte.
 * Uso:
 *   1. Certifique-se de que o NUX MG-30 está conectado.
 *   2. Rode: npx tsx scripts/capture-chain-diff.ts
 *   3. O script captura o dump ANTES, depois pede pra você trocar a cadeia no QuickTone,
 *      e captura o dump DEPOIS. Mostra o diff byte a byte.
 */

async function waitForKeypress(msg: string): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(`\n${msg} [ENTER para continuar] `);
    process.stdin.once('data', () => resolve());
  });
}

async function captureSysExDump(transport: NodeTransport): Promise<Uint8Array | null> {
  const inputs = transport.listInputPorts();
  const outputs = transport.listOutputPorts();

  const inputPort = inputs.find(p => p.name.toLowerCase().includes('mg-30') || p.name.toLowerCase().includes('nux'));
  const outputPort = outputs.find(p => p.name.toLowerCase().includes('mg-30') || p.name.toLowerCase().includes('nux'));

  if (!inputPort || !outputPort) {
    console.error('❌ NUX MG-30 não encontrado nas portas MIDI!');
    return null;
  }

  return new Promise<Uint8Array | null>((resolve) => {
    const input = (transport as any).getInput();
    const output = (transport as any).getOutput();

    input.openPort(inputPort.index);
    output.openPort(outputPort.index);
    input.ignoreTypes(false, false, false);

    let sysexData: Uint8Array | null = null;

    input.on('message', (_dt: number, message: number[]) => {
      const bytes = new Uint8Array(message);
      if (bytes[0] === 0xF0 && bytes.length > 50) {
        sysexData = bytes;
        input.closePort();
        output.closePort();
        resolve(sysexData);
      }
    });

    // Send heartbeat to trigger patch dump response
    // NUX MG-30 heartbeat/request: F0 00 00 00 00 00 60 01 F7
    const heartbeat = [0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x60, 0x01, 0xF7];
    output.sendMessage(heartbeat);

    // Also send a patch dump request
    // Standard NUX request: F0 00 00 00 00 00 60 04 F7
    setTimeout(() => {
      try {
        const patchRequest = [0xF0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x60, 0x04, 0xF7];
        output.sendMessage(patchRequest);
      } catch {}
    }, 300);

    setTimeout(() => {
      if (!sysexData) {
        input.closePort();
        output.closePort();
        resolve(null);
      }
    }, 5000);
  });
}

function formatHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function printDiff(before: Uint8Array, after: Uint8Array) {
  const maxLen = Math.max(before.length, after.length);
  let diffs = 0;

  console.log('\n========================================');
  console.log('  DIFF BYTE A BYTE (antes vs depois)');
  console.log('========================================');
  console.log(`  Tamanho ANTES: ${before.length} bytes`);
  console.log(`  Tamanho DEPOIS: ${after.length} bytes`);
  console.log('');

  for (let i = 0; i < maxLen; i++) {
    const bBefore = i < before.length ? before[i] : undefined;
    const bAfter = i < after.length ? after[i] : undefined;

    if (bBefore !== bAfter) {
      diffs++;
      const bStr = bBefore !== undefined ? `0x${bBefore.toString(16).padStart(2, '0').toUpperCase()} (${bBefore})` : 'N/A';
      const aStr = bAfter !== undefined ? `0x${bAfter.toString(16).padStart(2, '0').toUpperCase()} (${bAfter})` : 'N/A';
      console.log(`  ⚠️  Byte [${i.toString().padStart(3)}]: ${bStr} → ${aStr}`);
    }
  }

  if (diffs === 0) {
    console.log('  ✅ NENHUMA diferença encontrada! Os dumps são idênticos.');
  } else {
    console.log(`\n  Total de diferenças: ${diffs} byte(s)`);
  }
  console.log('========================================\n');

  // Show raw hex context around differences
  if (diffs > 0 && diffs <= 20) {
    console.log('Contexto expandido (±5 bytes ao redor de cada diferença):');
    for (let i = 0; i < maxLen; i++) {
      const bBefore = i < before.length ? before[i] : undefined;
      const bAfter = i < after.length ? after[i] : undefined;
      if (bBefore !== bAfter) {
        const start = Math.max(0, i - 5);
        const end = Math.min(maxLen - 1, i + 5);
        console.log(`\n  Offset ${i} (±5 bytes):`);
        let lineBefore = '  ANTES : ';
        let lineAfter  = '  DEPOIS: ';
        for (let j = start; j <= end; j++) {
          const bB = j < before.length ? before[j].toString(16).padStart(2, '0').toUpperCase() : '--';
          const bA = j < after.length  ? after[j].toString(16).padStart(2, '0').toUpperCase() : '--';
          const marker = (j === i) ? `[${bB}]` : ` ${bB} `;
          const markerA = (j === i) ? `[${bA}]` : ` ${bA} `;
          lineBefore += marker;
          lineAfter  += markerA;
        }
        console.log(lineBefore);
        console.log(lineAfter);
      }
    }
  }

  // Print full hex for further analysis
  console.log('\n\n=== DUMP COMPLETO ANTES ===');
  for (let i = 0; i < before.length; i += 16) {
    const slice = before.slice(i, Math.min(i + 16, before.length));
    const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`  ${i.toString(16).padStart(4, '0')}: ${hex}`);
  }

  console.log('\n=== DUMP COMPLETO DEPOIS ===');
  for (let i = 0; i < after.length; i += 16) {
    const slice = after.slice(i, Math.min(i + 16, after.length));
    const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    console.log(`  ${i.toString(16).padStart(4, '0')}: ${hex}`);
  }
}

async function main() {
  console.log('====================================================');
  console.log('  NUX MG-30 - Captura Diff da Cadeia de Sinal');
  console.log('====================================================');
  console.log('Este script captura dois dumps SysEx e compara byte a byte');
  console.log('para identificar onde a cadeia de sinal é armazenada.\n');

  process.stdin.setRawMode?.(false);
  process.stdin.resume();

  // Dump 1: ANTES
  await waitForKeypress('📌 Passo 1: NÃO altere nada na cadeia. Vamos capturar o estado ATUAL');
  console.log('🔄 Capturando dump ANTES...');
  const transport1 = new NodeTransport();
  const before = await captureSysExDump(transport1);
  if (!before) {
    console.error('❌ Falha ao capturar dump ANTES.');
    process.exit(1);
  }
  console.log(`✅ Dump ANTES capturado: ${before.length} bytes`);

  // Dump 2: DEPOIS
  await waitForKeypress('📌 Passo 2: AGORA troque DLY ↔ RVB no QuickTone e pressione ENTER');
  console.log('🔄 Capturando dump DEPOIS...');

  // Need a short delay to let previous transport fully release
  await new Promise(r => setTimeout(r, 1000));
  const transport2 = new NodeTransport();
  const after = await captureSysExDump(transport2);
  if (!after) {
    console.error('❌ Falha ao capturar dump DEPOIS.');
    process.exit(1);
  }
  console.log(`✅ Dump DEPOIS capturado: ${after.length} bytes`);

  // Diff
  printDiff(before, after);

  process.exit(0);
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
