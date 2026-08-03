import { Input, Output } from '@julusian/midi';

/**
 * Captura a resposta do comando SIGNAL_CHAIN_ROUTING (0x0F) 
 * antes e depois de uma troca na cadeia, mostrando o diff.
 */

const NUX_HEADER = [0xF0, 0x43, 0x58, 0x70];
const SYSEX_END = 0xF7;
const BLOCK_LIST = ['WAH', 'CMP', 'EFX', 'AMP', 'EQ', 'NG', 'MOD', 'DLY', 'RVB', 'CAB', 'IR', 'SR', 'VOL'];

function waitForKeypress(msg: string): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(`\n${msg} [ENTER] `);
    process.stdin.once('data', () => resolve());
  });
}

function requestChainRouting(input: Input, output: Output): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      input.removeAllListeners('message');
      reject(new Error('Timeout esperando resposta'));
    }, 5000);

    input.on('message', (_dt: number, message: number[]) => {
      // Procura resposta do comando 0x0F
      if (message[0] === 0xF0 && message[1] === 0x43 && message[2] === 0x58 && message[3] === 0x70 && message[4] === 0x0F) {
        clearTimeout(timeout);
        input.removeAllListeners('message');
        const payload = message.slice(6, message.length - 1);
        resolve(payload);
      }
    });

    output.sendMessage([...NUX_HEADER, 0x0F, 0x00, SYSEX_END]);
  });
}

async function main() {
  console.log('====================================================');
  console.log('  NUX MG-30 - Signal Chain Diff (Comando 0x0F)');
  console.log('====================================================\n');

  process.stdin.setRawMode?.(false);
  process.stdin.resume();

  const input = new Input();
  const output = new Output();

  const inCount = input.getPortCount();
  const outCount = output.getPortCount();

  let inIdx = -1, outIdx = -1;
  for (let i = 0; i < inCount; i++) if (input.getPortName(i).toLowerCase().includes('mg-30')) inIdx = i;
  for (let i = 0; i < outCount; i++) if (output.getPortName(i).toLowerCase().includes('mg-30')) outIdx = i;

  if (inIdx < 0 || outIdx < 0) { console.error('❌ NUX MG-30 não encontrado'); process.exit(1); }

  input.ignoreTypes(false, false, false);
  input.openPort(inIdx);
  output.openPort(outIdx);

  // Captura ANTES
  await waitForKeypress('📌 Passo 1: Estado ORIGINAL da cadeia. Confirme que está no estado padrão');
  console.log('🔄 Capturando cadeia ANTES...');
  const before = await requestChainRouting(input, output);
  console.log(`✅ Capturado: ${before.length} bytes`);
  console.log(`   Primeiros 13: [${before.slice(0, 13).join(', ')}]`);
  console.log(`   Blocos: ${before.slice(0, 13).map(i => BLOCK_LIST[i] || `?${i}`).join(' → ')}`);

  // Captura DEPOIS
  await waitForKeypress('📌 Passo 2: Agora TROQUE DLY ↔ RVB no QuickTone');
  
  // Pequeno delay para dar tempo da troca propagar
  await new Promise(r => setTimeout(r, 500));
  
  console.log('🔄 Capturando cadeia DEPOIS...');
  const after = await requestChainRouting(input, output);
  console.log(`✅ Capturado: ${after.length} bytes`);
  console.log(`   Primeiros 13: [${after.slice(0, 13).join(', ')}]`);
  console.log(`   Blocos: ${after.slice(0, 13).map(i => BLOCK_LIST[i] || `?${i}`).join(' → ')}`);

  // Diff
  console.log('\n========================================');
  console.log('  DIFERENÇAS ENCONTRADAS');
  console.log('========================================');
  
  let diffs = 0;
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    if (before[i] !== after[i]) {
      diffs++;
      const bName = before[i] < BLOCK_LIST.length ? BLOCK_LIST[before[i]] : `?`;
      const aName = after[i] < BLOCK_LIST.length ? BLOCK_LIST[after[i]] : `?`;
      console.log(`  Byte [${i.toString().padStart(2)}]: ${before[i]} (${bName}) → ${after[i]} (${aName})`);
    }
  }

  if (diffs === 0) {
    console.log('  Nenhuma diferença! Os payloads são idênticos.');
  } else {
    console.log(`\n  Total: ${diffs} byte(s) diferentes`);
  }
  console.log('========================================\n');

  input.closePort();
  output.closePort();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
