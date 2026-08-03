import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { Input, Output } from '@julusian/midi';

interface MidiPortRef {
  index: number;
  name: string;
  direction: 'input' | 'output';
}

interface CapturedEvent {
  timestamp: string;
  deltaTime: number;
  portIndex: number;
  portName: string;
  length: number;
  status: number;
  channel: number | null;
  type: string;
  hex: string;
  bytes: number[];
  detail: string;
}

interface DumpTurn {
  turn: number;
  startedAt: string;
  endedAt: string;
  eventCount: number;
  events: CapturedEvent[];
}

function midiChannel(status: number): number | null {
  if (status >= 0x80 && status <= 0xef) {
    return (status & 0x0f) + 1;
  }
  return null;
}

function describeMessage(bytes: Uint8Array): { type: string; detail: string; channel: number | null } {
  if (bytes.length === 0) {
    return { type: 'empty', detail: 'Empty message', channel: null };
  }

  const status = bytes[0];
  const channel = midiChannel(status);

  // System messages
  if (status === 0xf0) {
    const cmd = bytes[4];
    const dir = bytes[5];
    const preview = bytes.length > 8
      ? `cmd=0x${(cmd ?? 0).toString(16).toUpperCase().padStart(2, '0')} dir=0x${(dir ?? 0).toString(16).toUpperCase().padStart(2, '0')}`
      : 'short';
    return {
      type: 'sysex',
      detail: `SysEx (${bytes.length} bytes) ${preview}`,
      channel: null,
    };
  }
  if (status === 0xf1) return { type: 'mtc', detail: `MTC Quarter Frame data=${bytes[1]}`, channel: null };
  if (status === 0xf2) return { type: 'song_position', detail: `Song Position LSB=${bytes[1]} MSB=${bytes[2]}`, channel: null };
  if (status === 0xf3) return { type: 'song_select', detail: `Song Select song=${bytes[1]}`, channel: null };
  if (status === 0xf6) return { type: 'tune_request', detail: 'Tune Request', channel: null };
  if (status === 0xf7) return { type: 'eox', detail: 'End of SysEx', channel: null };
  if (status === 0xf8) return { type: 'timing_clock', detail: 'Timing Clock', channel: null };
  if (status === 0xfa) return { type: 'start', detail: 'Start', channel: null };
  if (status === 0xfb) return { type: 'continue', detail: 'Continue', channel: null };
  if (status === 0xfc) return { type: 'stop', detail: 'Stop', channel: null };
  if (status === 0xfe) return { type: 'active_sensing', detail: 'Active Sensing', channel: null };
  if (status === 0xff) return { type: 'reset', detail: 'System Reset', channel: null };

  const chLabel = channel !== null ? ` ch${channel}` : '';

  switch (status & 0xf0) {
    case 0x80:
      return { type: 'note_off', detail: `Note Off${chLabel} note=${bytes[1]} vel=${bytes[2]}`, channel };
    case 0x90:
      return {
        type: bytes[2] === 0 ? 'note_off' : 'note_on',
        detail: `${bytes[2] === 0 ? 'Note Off' : 'Note On'}${chLabel} note=${bytes[1]} vel=${bytes[2]}`,
        channel,
      };
    case 0xa0:
      return { type: 'poly_aftertouch', detail: `Poly Aftertouch${chLabel} note=${bytes[1]} pressure=${bytes[2]}`, channel };
    case 0xb0:
      return {
        type: 'cc',
        detail: `CC${chLabel} cc=${bytes[1]} (0x${bytes[1].toString(16).toUpperCase().padStart(2, '0')}) val=${bytes[2]}`,
        channel,
      };
    case 0xc0:
      return { type: 'program_change', detail: `Program Change${chLabel} pc=${bytes[1]}`, channel };
    case 0xd0:
      return { type: 'channel_aftertouch', detail: `Channel Aftertouch${chLabel} pressure=${bytes[1]}`, channel };
    case 0xe0: {
      const value = bytes[1] | (bytes[2] << 7);
      return { type: 'pitch_bend', detail: `Pitch Bend${chLabel} value=${value}`, channel };
    }
    default:
      return {
        type: 'unknown',
        detail: `Unknown status=0x${status.toString(16).toUpperCase().padStart(2, '0')}`,
        channel,
      };
  }
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function listPorts(): { inputs: MidiPortRef[]; outputs: MidiPortRef[] } {
  const inputProbe = new Input();
  const outputProbe = new Output();

  const inputs: MidiPortRef[] = [];
  for (let i = 0; i < inputProbe.getPortCount(); i++) {
    inputs.push({ index: i, name: inputProbe.getPortName(i), direction: 'input' });
  }

  const outputs: MidiPortRef[] = [];
  for (let i = 0; i < outputProbe.getPortCount(); i++) {
    outputs.push({ index: i, name: outputProbe.getPortName(i), direction: 'output' });
  }

  return { inputs, outputs };
}

async function main() {
  console.log('====================================================');
  console.log('  NUX MG-30 CAPTURE DUMP (ALL MIDI)');
  console.log('====================================================');
  console.log('Escuta TODAS as portas de entrada MIDI, todos os canais,');
  console.log('SysEx, CC, PC, clock, active sensing, etc.');
  console.log('Cada ENTER fecha o turno atual e abre o próximo.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const observation = await ask(rl, '📝 Observação (o que você vai fazer): ');
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

  const { inputs: inputPorts, outputs: outputPorts } = listPorts();

  console.log(`\nPortas MIDI de ENTRADA (${inputPorts.length}):`);
  for (const port of inputPorts) {
    console.log(`  [IN ${port.index}] ${port.name}`);
  }

  console.log(`\nPortas MIDI de SAÍDA (${outputPorts.length}) — só listadas (host→device não aparece aqui):`);
  for (const port of outputPorts) {
    console.log(`  [OUT ${port.index}] ${port.name}`);
  }

  if (inputPorts.length === 0) {
    console.error('\n❌ Nenhuma porta MIDI de entrada encontrada.');
    rl.close();
    process.exit(1);
  }

  const turns: DumpTurn[] = [];
  let currentTurn = 1;
  let currentEvents: CapturedEvent[] = [];
  let turnStartedAt = new Date().toISOString();
  let capturing = true;
  let totalLive = 0;

  const openInputs: Input[] = [];
  const listeningPorts: MidiPortRef[] = [];
  const failedPorts: Array<{ port: MidiPortRef; error: string }> = [];

  console.log('\nAbrindo TODAS as portas de entrada...');
  for (const port of inputPorts) {
    try {
      const input = new Input();
      // Não ignorar SysEx, timing clock, nem active sensing
      input.ignoreTypes(false, false, false);
      input.openPort(port.index);

      input.on('message', (deltaTime: number, message: number[]) => {
        if (!capturing) return;

        const bytes = new Uint8Array(message);
        const { type, detail, channel } = describeMessage(bytes);
        const hex = Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
          .join(' ');
        const timestamp = new Date().toISOString();

        const event: CapturedEvent = {
          timestamp,
          deltaTime,
          portIndex: port.index,
          portName: port.name,
          length: bytes.length,
          status: bytes[0] ?? 0,
          channel,
          type,
          hex,
          bytes: Array.from(bytes),
          detail,
        };

        currentEvents.push(event);
        totalLive += 1;

        const clock = timestamp.split('T')[1]?.slice(0, 12) ?? timestamp;
        console.log(
          `[T${currentTurn}/${dumpCount}] [${clock}] IN[${port.index}] "${port.name}" (${bytes.length}b) ${detail}`
        );
        if (type === 'sysex' && hex.length > 96) {
          console.log(`           ${hex.slice(0, 96)}...`);
        } else {
          console.log(`           ${hex}`);
        }
      });

      openInputs.push(input);
      listeningPorts.push(port);
      console.log(`  ✅ Escutando [IN ${port.index}] ${port.name}`);
    } catch (err: any) {
      failedPorts.push({ port, error: err?.message || String(err) });
      console.log(`  ⚠️  Falha [IN ${port.index}] ${port.name}: ${err?.message || err}`);
    }
  }

  if (listeningPorts.length === 0) {
    console.error('\n❌ Não foi possível abrir nenhuma porta MIDI de entrada.');
    rl.close();
    process.exit(1);
  }

  console.log(`\n👀 Observação: ${observation}`);
  console.log(`🎞  Turno 1/${dumpCount} — faça a ação agora (QuickTone, pedaleira, etc.).`);
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
    console.log(`🎞  Turno ${currentTurn}/${dumpCount} — faça a próxima ação.\n`);
  }

  capturing = false;

  for (const input of openInputs) {
    try {
      input.removeAllListeners();
      input.closePort();
    } catch {}
  }

  const output = {
    device: 'NUX MG-30',
    mode: 'all-midi-inputs',
    observation,
    dumpCount,
    capturedAt: new Date().toISOString(),
    inputPorts: inputPorts.map((p) => ({ index: p.index, name: p.name })),
    outputPorts: outputPorts.map((p) => ({ index: p.index, name: p.name })),
    listeningPorts: listeningPorts.map((p) => ({ index: p.index, name: p.name })),
    failedPorts: failedPorts.map((f) => ({
      index: f.port.index,
      name: f.port.name,
      error: f.error,
    })),
    turns,
    summary: {
      totalEvents: turns.reduce((n, t) => n + t.eventCount, 0),
      byType: turns
        .flatMap((t) => t.events)
        .reduce<Record<string, number>>((acc, e) => {
          acc[e.type] = (acc[e.type] || 0) + 1;
          return acc;
        }, {}),
      byPort: turns
        .flatMap((t) => t.events)
        .reduce<Record<string, number>>((acc, e) => {
          const key = `[${e.portIndex}] ${e.portName}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
      byChannel: turns
        .flatMap((t) => t.events)
        .reduce<Record<string, number>>((acc, e) => {
          const key = e.channel === null ? 'system' : `ch${e.channel}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
    },
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
  console.log(`📊 Total: ${output.summary.totalEvents} evento(s) em ${turns.length} turno(s)`);
  console.log(`📡 Portas escutadas: ${listeningPorts.length}/${inputPorts.length}`);
  if (Object.keys(output.summary.byType).length > 0) {
    console.log('   Tipos:', JSON.stringify(output.summary.byType));
  }
  if (Object.keys(output.summary.byChannel).length > 0) {
    console.log('   Canais:', JSON.stringify(output.summary.byChannel));
  }
  console.log('====================================================\n');

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
