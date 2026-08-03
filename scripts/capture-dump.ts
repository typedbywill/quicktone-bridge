import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { Input } from '@julusian/midi';

interface CapturedEvent {
  timestamp: string;
  deltaTime: number;
  length: number;
  hex: string;
  detail: string;
}

interface DumpTurn {
  turn: number;
  startedAt: string;
  endedAt: string;
  eventCount: number;
  events: CapturedEvent[];
}

function describeMessage(bytes: Uint8Array): string {
  if (bytes[0] === 0xF0) {
    return `SysEx (${bytes.length} bytes)`;
  }
  if ((bytes[0] & 0xF0) === 0xB0) {
    return `CC=${bytes[1]} (0x${bytes[1].toString(16).toUpperCase()}), Val=${bytes[2]}`;
  }
  if ((bytes[0] & 0xF0) === 0xC0) {
    return `Program Change PC=${bytes[1]}`;
  }
  if ((bytes[0] & 0xF0) === 0x80) {
    return `Note Off note=${bytes[1]} vel=${bytes[2]}`;
  }
  if ((bytes[0] & 0xF0) === 0x90) {
    return `Note On note=${bytes[1]} vel=${bytes[2]}`;
  }
  return 'MIDI';
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log('====================================================');
  console.log('  NUX MG-30 CAPTURE DUMP');
  console.log('====================================================');
  console.log('Cada ENTER fecha o turno atual e abre o próximo.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const observation = await ask(rl, '📝 Observação (o que você vai fazer no dispositivo): ');
  if (!observation) {
    console.error('❌ Observação obrigatória.');
    rl.close();
    process.exit(1);
  }

  const dumpsRaw = await ask(rl, '🔢 Quantidade de dumps (turnos): ');
  const dumpCount = Number.parseInt(dumpsRaw, 10);
  if (!Number.isFinite(dumpCount) || dumpCount < 1) {
    console.error('❌ Informe um número válido de dumps (>= 1).');
    rl.close();
    process.exit(1);
  }

  const probe = new Input();
  const portCount = probe.getPortCount();
  const ports: Array<{ index: number; name: string }> = [];
  for (let i = 0; i < portCount; i++) {
    ports.push({ index: i, name: probe.getPortName(i) });
  }

  console.log('\nPortas MIDI de entrada:');
  for (const port of ports) {
    console.log(`  [${port.index}] ${port.name}`);
  }

  const nuxPorts = ports.filter(
    (p) => p.name.toLowerCase().includes('mg-30') || p.name.toLowerCase().includes('nux')
  );
  const listenPorts = nuxPorts.length > 0 ? nuxPorts : ports;

  if (listenPorts.length === 0) {
    console.error('❌ Nenhuma porta MIDI encontrada.');
    rl.close();
    process.exit(1);
  }

  const turns: DumpTurn[] = [];
  let currentTurn = 1;
  let currentEvents: CapturedEvent[] = [];
  let turnStartedAt = new Date().toISOString();
  let capturing = true;

  const inputs: Input[] = [];
  for (const port of listenPorts) {
    const input = new Input();
    input.ignoreTypes(false, false, false);
    input.openPort(port.index);
    input.on('message', (deltaTime: number, message: number[]) => {
      if (!capturing) return;

      const bytes = new Uint8Array(message);
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      const detail = describeMessage(bytes);
      const timestamp = new Date().toISOString();
      currentEvents.push({
        timestamp,
        deltaTime,
        length: bytes.length,
        hex,
        detail,
      });

      const clock = timestamp.split('T')[1]?.slice(0, 12) ?? timestamp;
      console.log(
        `[T${currentTurn}/${dumpCount}] [${clock}] ${port.name} (${bytes.length}b) ${detail}`
      );
      if (bytes[0] === 0xF0 && bytes.length > 16) {
        console.log(`           ${hex.slice(0, 80)}${hex.length > 80 ? '...' : ''}`);
      } else {
        console.log(`           ${hex}`);
      }
    });
    inputs.push(input);
    console.log(`✅ Escutando: [${port.index}] ${port.name}`);
  }

  console.log(`\n👀 Observação: ${observation}`);
  console.log(`🎞  Turno 1/${dumpCount} — faça a ação no dispositivo.`);
  console.log('   Pressione ENTER para fechar este turno e abrir o próximo.\n');

  while (currentTurn <= dumpCount) {
    await ask(
      rl,
      currentTurn < dumpCount
        ? `⏎  ENTER = fechar turno ${currentTurn}/${dumpCount} e abrir o próximo... `
        : `⏎  ENTER = fechar turno final ${currentTurn}/${dumpCount} e salvar... `
    );

    const endedAt = new Date().toISOString();
    turns.push({
      turn: currentTurn,
      startedAt: turnStartedAt,
      endedAt,
      eventCount: currentEvents.length,
      events: currentEvents,
    });

    console.log(
      `\n✅ Turno ${currentTurn}/${dumpCount} fechado — ${currentEvents.length} evento(s).\n`
    );

    if (currentTurn >= dumpCount) break;

    currentTurn += 1;
    currentEvents = [];
    turnStartedAt = new Date().toISOString();
    console.log(`🎞  Turno ${currentTurn}/${dumpCount} — faça a próxima ação no dispositivo.\n`);
  }

  capturing = false;

  for (const input of inputs) {
    try {
      input.removeAllListeners();
      input.closePort();
    } catch {}
  }

  const output = {
    device: 'NUX MG-30',
    observation,
    dumpCount,
    capturedAt: new Date().toISOString(),
    ports: listenPorts.map((p) => p.name),
    turns,
  };

  const outDir = path.join(process.cwd(), 'captures');
  fs.mkdirSync(outDir, { recursive: true });
  const slug = observation
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  const outputFile = path.join(outDir, `capture-dump-${slug || 'session'}-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf-8');

  console.log('====================================================');
  console.log(`💾 Captura salva em: ${outputFile}`);
  console.log(
    `📊 Total: ${turns.length} turno(s), ${turns.reduce((n, t) => n + t.eventCount, 0)} evento(s)`
  );
  console.log('====================================================\n');

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
