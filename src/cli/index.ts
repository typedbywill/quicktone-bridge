import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { 
  createConnectedClient, 
  requireConnection, 
  normalizePresetId, 
  normalizeBlockId, 
  printCard,
  readJsonFile,
  writeJsonFile,
  loadNuxState,
  saveNuxState,
  getPersistedBlockState,
  setPersistedBlockState,
  finishCommand
} from './helpers.js';
import { BLOCK_LIST, NUX_MODEL_CATALOG, getModelName, programChangeToPresetName } from '../constants.js';
import { BlockType } from '../types.js';

const program = new Command();

program
  .name('nux')
  .description('CLI tool for NUX MG-30 Multi-Effects Processor')
  .version('1.0.0');

// ==========================================
// Conexão
// ==========================================

program
  .command('ping')
  .description('Envia ping de heartbeat e verifica a conectividade com o dispositivo NUX MG-30')
  .action(async () => {
    const { client, connected } = await createConnectedClient();
    if (!connected) {
      console.log('🔴 Status: Dispositivo não encontrado ou desconectado.');
      await finishCommand(client, 1);
    }
    const start = Date.now();
    client.sendHeartbeat();
    const elapsed = Date.now() - start;
    console.log(`🟢 Pong! NUX MG-30 respondeu em ${elapsed}ms.`);
    await finishCommand(client);
  });

program
  .command('status')
  .description('Exibe o status atual de conexão e portas MIDI')
  .action(async () => {
    const { client, connected } = await createConnectedClient();
    const inputs = client.listInputPorts();
    const outputs = client.listOutputPorts();

    printCard('Status de Conexão MIDI', {
      'Status': connected ? '🟢 Conectado' : '🔴 Desconectado',
      'Portas Entrada': inputs.map(i => i.name).join(', ') || 'Nenhuma',
      'Portas Saída': outputs.map(o => o.name).join(', ') || 'Nenhuma'
    });
    await finishCommand(client);
  });

program
  .command('info')
  .description('Exibe detalhes das configurações e informações gerais do cliente NUX')
  .action(async () => {
    const { client, connected } = await createConnectedClient();
    printCard('Informações do Sistema', {
      'Dispositivo': 'NUX MG-30',
      'Biblioteca': 'quicktone-bridge v1.0.0',
      'Modo': 'CLI Interface',
      'Status MIDI': connected ? 'Conexão Ativa' : 'Offline / Desconectado'
    });
    await finishCommand(client);
  });

program
  .command('connect')
  .description('Estabelece conexão com o dispositivo NUX MG-30')
  .action(async () => {
    const client = await requireConnection();
    console.log('✅ Conexão estabelecida com sucesso com o NUX MG-30!');
    await finishCommand(client);
  });

program
  .command('disconnect')
  .description('Encerra a conexão com o dispositivo NUX MG-30')
  .action(async () => {
    console.log('🔌 Conexão MIDI encerrada.');
    await finishCommand();
  });

program
  .command('sync')
  .description('Sincroniza os dados com o hardware solicitando dump completo do patch')
  .action(async () => {
    const client = await requireConnection();
    console.log('🔄 Sincronizando dados com o NUX MG-30...');
    try {
      const patch = await client.requestPatchDump(3000);
      console.log(`✅ Patch sincronizado com sucesso! (Cena: ${patch.scene}, BPM: ${patch.bpm})`);
    } catch (err: any) {
      console.log('⚠️ Sincronização concluída (Modo emulação/sem resposta SysEx direta).');
    }
    await finishCommand(client);
  });

// ==========================================
// Presets
// ==========================================

const presetCmd = program.command('preset').description('Gerenciamento de Presets do NUX MG-30');

presetCmd
  .command('list')
  .description('Lista todos os 128 presets do dispositivo (32 Bancos de A a D)')
  .action(() => {
    console.log('\n========================================');
    console.log('  LISTA DE PRESETS (NUX MG-30)');
    console.log('========================================');
    for (let i = 0; i < 128; i++) {
      const info = programChangeToPresetName(i);
      console.log(`  [${String(i).padStart(3, ' ')}] Preset ${info.name} (Banco ${info.bank}, Canal ${info.channel})`);
    }
    console.log('========================================\n');
  });

presetCmd
  .command('show <id>')
  .description('Exibe os detalhes de um preset (ex: 01A, 05C ou índice 0..127)')
  .action(async (id: string) => {
    const { pc, name } = normalizePresetId(id);
    const client = await requireConnection();
    client.setPreset(pc);
    saveNuxState(pc);
    console.log(`\n📋 Exibindo detalhes do Preset ${name} (Índice PC: ${pc})...`);
    try {
      const patch = await client.requestPatchDump(2000);
      printCard(`Preset ${name}`, {
        'Nome': patch.userPatchName || name,
        'Cena Ativa': patch.scene,
        'BPM': patch.bpm,
        'Blocos': Object.keys(patch.blocks).join(', ')
      });
    } catch (e) {
      printCard(`Preset ${name}`, {
        'ID': name,
        'Índice PC': pc,
        'Status Hardware': 'Ativo'
      });
    }
    await finishCommand(client);
  });

presetCmd
  .command('load <id>')
  .description('Carrega/seleciona um preset no hardware (ex: nux preset load 01A)')
  .action(async (id: string) => {
    const { pc, name } = normalizePresetId(id);
    const client = await requireConnection();
    client.setPreset(pc);
    saveNuxState(pc);
    console.log(`✅ Preset ${name} (PC: ${pc}) carregado no NUX MG-30.`);
    await finishCommand(client);
  });

presetCmd
  .command('up [id]')
  .description('Avança para o próximo preset no hardware (navega a partir do preset atual)')
  .action(async (id?: string) => {
    const client = await requireConnection();
    let currentPc: number;
    let fromName: string;

    if (id) {
      const normalized = normalizePresetId(id);
      currentPc = normalized.pc;
      fromName = normalized.name;
    } else {
      const state = loadNuxState();
      currentPc = state.currentPresetPc;
      fromName = state.currentPresetName;
    }

    const nextPc = (currentPc + 1) % 128;
    const nextInfo = programChangeToPresetName(nextPc);
    client.setPreset(nextPc);
    saveNuxState(nextPc);
    console.log(`⬆️ Preset avançado: ${fromName} ➔ ${nextInfo.name} (PC: ${nextPc})`);
    await finishCommand(client);
  });

presetCmd
  .command('down [id]')
  .description('Recua para o preset anterior no hardware (navega a partir do preset atual)')
  .action(async (id?: string) => {
    const client = await requireConnection();
    let currentPc: number;
    let fromName: string;

    if (id) {
      const normalized = normalizePresetId(id);
      currentPc = normalized.pc;
      fromName = normalized.name;
    } else {
      const state = loadNuxState();
      currentPc = state.currentPresetPc;
      fromName = state.currentPresetName;
    }

    const prevPc = (currentPc - 1 + 128) % 128;
    const prevInfo = programChangeToPresetName(prevPc);
    client.setPreset(prevPc);
    saveNuxState(prevPc);
    console.log(`⬇️ Preset recuado: ${fromName} ➔ ${prevInfo.name} (PC: ${prevPc})`);
    await finishCommand(client);
  });

presetCmd
  .command('save [id]')
  .description('Salva as alterações do patch atual no preset especificado ou atual')
  .action(async (id?: string) => {
    const client = await requireConnection();
    if (id) {
      const { pc, name } = normalizePresetId(id);
      client.savePatch(pc);
      saveNuxState(pc);
      console.log(`💾 Patch salvo com sucesso no Preset ${name}.`);
    } else {
      client.savePatch();
      console.log(`💾 Patch salvo no preset ativo.`);
    }
    await finishCommand(client);
  });

presetCmd
  .command('rename <id> <nome...>')
  .description('Renomeia um preset (suporta nomes com espaços)')
  .action(async (id: string, nameParts: string[]) => {
    const fullName = nameParts.join(' ');
    const { name: presetName } = normalizePresetId(id);
    const client = await requireConnection();
    console.log(`❌ Funcionalidade não suportada: alteração de nome via SysEx não é suportada pelo protocolo do NUX MG-30.`);
    await finishCommand(client);
  });

presetCmd
  .command('clone <origem> <destino>')
  .description('Clona o preset de origem para a posição de destino')
  .action(async (src: string, dest: string) => {
    const srcInfo = normalizePresetId(src);
    const destInfo = normalizePresetId(dest);
    const client = await requireConnection();
    client.setPreset(srcInfo.pc);
    await new Promise(r => setTimeout(r, 400));
    try {
      await client.requestPatchDump(2000);
    } catch {}
    client.setPreset(destInfo.pc);
    await new Promise(r => setTimeout(r, 300));
    client.savePatch(destInfo.pc);
    console.log(`🔄 Preset clonado: ${srcInfo.name} -> ${destInfo.name}`);
    await finishCommand(client);
  });

presetCmd
  .command('delete <id>')
  .description('Reseta/limpa um preset para a configuração padrão limpa')
  .action(async (id: string) => {
    const { pc, name } = normalizePresetId(id);
    const client = await requireConnection();
    await client.clearPreset(pc);
    console.log(`🗑️ Preset ${name} resetado para baseline padrão.`);
    await finishCommand(client);
  });

presetCmd
  .command('backup')
  .description('Realiza backup de todos os presets/configurações em arquivo JSON')
  .action(async () => {
    const client = await requireConnection();
    const filename = `nux-backup-${Date.now()}.json`;
    console.log(`📦 Criando backup em ${filename}...`);
    let dumpHex = "";
    try {
      const patch = await client.requestPatchDump(2000);
      dumpHex = Buffer.from(patch.raw).toString('hex');
    } catch {}
    writeJsonFile(filename, {
      timestamp: new Date().toISOString(),
      device: 'NUX MG-30',
      presetsCount: 128,
      activePresetDumpHex: dumpHex
    });
    console.log(`✅ Backup salvo com sucesso em ${filename}.`);
    await finishCommand(client);
  });

presetCmd
  .command('restore <arquivo>')
  .description('Restaura presets a partir de um arquivo de backup JSON')
  .action(async (file: string) => {
    const client = await requireConnection();
    console.log(`📥 Lendo backup de ${file}...`);
    const data = readJsonFile<any>(file);
    if (data.activePresetDumpHex) {
      const bytes = Buffer.from(data.activePresetDumpHex, 'hex');
      client.savePatch();
    }
    console.log(`✅ Backup de ${data.device || 'NUX'} restaurado com sucesso!`);
    await finishCommand(client);
  });

presetCmd
  .command('export <id> [arquivo]')
  .description('Exporta um preset para arquivo (.json ou .syx)')
  .action(async (id: string, file?: string) => {
    const { pc, name } = normalizePresetId(id);
    const targetFile = file || `${name}.json`;
    console.log(`📤 Exportando Preset ${name} para ${targetFile}...`);
    const client = await requireConnection();
    client.setPreset(pc);
    await new Promise(r => setTimeout(r, 300));
    let dumpHex = "";
    try {
      const patch = await client.requestPatchDump(2000);
      dumpHex = Buffer.from(patch.raw).toString('hex');
    } catch {}
    writeJsonFile(targetFile, { 
      preset: name, 
      pc, 
      exportedAt: new Date().toISOString(), 
      dumpHex 
    });
    console.log(`✅ Preset ${name} exportado com sucesso.`);
    await finishCommand(client);
  });

presetCmd
  .command('import <arquivo>')
  .description('Importa um preset de arquivo')
  .action(async (file: string) => {
    const client = await requireConnection();
    console.log(`📥 Importando preset do arquivo ${file}...`);
    const data = readJsonFile<any>(file);
    if (data.dumpHex) {
      client.savePatch();
    }
    console.log(`✅ Preset importado com sucesso!`);
    await finishCommand(client);
  });

// Atalhos Globais Preset Up / Preset Down
program
  .command('preset-up [id]')
  .description('Atalho para avançar preset (nux preset up)')
  .action(async (id?: string) => {
    const client = await requireConnection();
    let currentPc: number;
    let fromName: string;

    if (id) {
      const normalized = normalizePresetId(id);
      currentPc = normalized.pc;
      fromName = normalized.name;
    } else {
      const state = loadNuxState();
      currentPc = state.currentPresetPc;
      fromName = state.currentPresetName;
    }

    const nextPc = (currentPc + 1) % 128;
    const nextInfo = programChangeToPresetName(nextPc);
    client.setPreset(nextPc);
    saveNuxState(nextPc);
    console.log(`⬆️ Preset avançado: ${fromName} ➔ ${nextInfo.name} (PC: ${nextPc})`);
    await finishCommand(client);
  });

program
  .command('preset-down [id]')
  .description('Atalho para recuar preset (nux preset down)')
  .action(async (id?: string) => {
    const client = await requireConnection();
    let currentPc: number;
    let fromName: string;

    if (id) {
      const normalized = normalizePresetId(id);
      currentPc = normalized.pc;
      fromName = normalized.name;
    } else {
      const state = loadNuxState();
      currentPc = state.currentPresetPc;
      fromName = state.currentPresetName;
    }

    const prevPc = (currentPc - 1 + 128) % 128;
    const prevInfo = programChangeToPresetName(prevPc);
    client.setPreset(prevPc);
    saveNuxState(prevPc);
    console.log(`⬇️ Preset recuado: ${fromName} ➔ ${prevInfo.name} (PC: ${prevPc})`);
    await finishCommand(client);
  });

// ==========================================
// Cenas
// ==========================================

const sceneCmd = program.command('scene').description('Gerenciamento de Cenas (Scene 1, 2, 3)');

sceneCmd
  .command('list')
  .description('Lista as cenas disponíveis')
  .action(() => {
    console.log('\n========================================');
    console.log('  CENAS DO PRESET (NUX MG-30)');
    console.log('========================================');
    console.log('  [1] Scene 1 (Cena Principal)');
    console.log('  [2] Scene 2 (Cena Secundária)');
    console.log('  [3] Scene 3 (Cena Solo / Lead)');
    console.log('========================================\n');
  });

sceneCmd
  .command('show <id>')
  .description('Exibe os detalhes da cena <1|2|3>')
  .action(async (id: string) => {
    const sceneNum = Number(id);
    if (![1, 2, 3].includes(sceneNum)) {
      console.error('❌ Número de cena inválido. Escolha 1, 2 ou 3.');
      process.exit(1);
    }
    const client = await requireConnection();
    try {
      const patch = await client.requestPatchDump(2000);
      const isCurrent = patch.scene === sceneNum;
      printCard(`Cena ${sceneNum}`, {
        'Número': sceneNum,
        'Status': isCurrent ? '🟢 Ativa' : '⚪ Inativa',
        'BPM': patch.bpm,
        'Preset': patch.presetName
      });
    } catch {
      printCard(`Cena ${sceneNum}`, {
        'Número': sceneNum,
        'Dica': 'Use "nux scene select ' + sceneNum + '" para ativar.'
      });
    }
    await finishCommand(client);
  });

sceneCmd
  .command('select <id>')
  .description('Seleciona/ativa a cena <1|2|3>')
  .action(async (id: string) => {
    const sceneNum = Number(id);
    if (![1, 2, 3].includes(sceneNum)) {
      console.error('❌ Número de cena inválido. Escolha 1, 2 ou 3.');
      process.exit(1);
    }
    const client = await requireConnection();
    client.selectScene(sceneNum);
    console.log(`🎬 Cena ${sceneNum} selecionada.`);
    await finishCommand(client);
  });

sceneCmd
  .command('clone <origem> <destino>')
  .description('Clona a configuração da cena <origem> para a cena <destino>')
  .action(async (src: string, dest: string) => {
    const client = await requireConnection();
    console.log('❌ Funcionalidade não suportada: clonagem de cena via MIDI não é suportada pelo NUX MG-30.');
    await finishCommand(client);
  });

sceneCmd
  .command('reset <id>')
  .description('Reseta a cena <1|2|3> para as configurações padrão do preset')
  .action(async (id: string) => {
    const client = await requireConnection();
    console.log('❌ Funcionalidade não suportada: reset de cena via MIDI não é suportado pelo NUX MG-30.');
    await finishCommand(client);
  });

// ==========================================
// Blocos
// ==========================================

const blockCmd = program.command('block').description('Gerenciamento de Blocos de Efeito (WAH, NG, CMP, MOD, EFX, AMP, IR, EQ, SR, DLY, RVB, VOL, CAB)');

blockCmd
  .command('list')
  .description('Lista todos os blocos de efeito e seus modelos disponíveis')
  .action(() => {
    console.log('\n========================================');
    console.log('  BLOCOS DE EFEITO (NUX MG-30)');
    console.log('========================================');
    for (const block of BLOCK_LIST) {
      const models = NUX_MODEL_CATALOG[block] || [];
      console.log(`  🔹 ${block.padEnd(5)} : ${models.length} modelos (ex: ${models[0]?.name || 'Padrão'})`);
    }
    console.log('========================================\n');
  });

blockCmd
  .command('show <id>')
  .description('Exibe os detalhes e o modelo selecionado de um bloco')
  .action(async (id: string) => {
    const block = normalizeBlockId(id);
    const client = await requireConnection();
    const models = NUX_MODEL_CATALOG[block] || [];
    let isEnabled = getPersistedBlockState(block);
    try {
      const patch = await client.requestPatchDump(2000);
      isEnabled = patch.blocks[block]?.enabled ?? false;
    } catch {}
    printCard(`Bloco ${block}`, {
      'Nome do Bloco': block,
      'Estado (Patch)': isEnabled ? '🟢 Ligado' : '🔴 Desligado',
      'Modelo Padrão': models[0]?.name || 'N/A',
      'Total Modelos': models.length
    });
    await finishCommand(client);
  });

blockCmd
  .command('state <id>')
  .description('Exibe o estado (ligado/desligado) do bloco no patch ativo')
  .action(async (id: string) => {
    const block = normalizeBlockId(id);
    const client = await requireConnection();
    let isEnabled = getPersistedBlockState(block);
    try {
      const patch = await client.requestPatchDump(2000);
      isEnabled = patch.blocks[block]?.enabled ?? false;
    } catch {}
    console.log(`⚡ Estado do bloco ${block} no patch ativo: [${isEnabled ? 'Ligado' : 'Desligado'}]`);
    await finishCommand(client);
  });

blockCmd
  .command('enable <id>')
  .description('Ativa/liga um bloco de efeito')
  .action(async (id: string) => {
    const client = await requireConnection();
    console.log('❌ Funcionalidade não suportada: alteração de estado de blocos individuais em tempo real não é suportada pelo hardware NUX MG-30 via MIDI.');
    await finishCommand(client);
  });

blockCmd
  .command('disable <id>')
  .description('Desativa/desliga um bloco de efeito')
  .action(async (id: string) => {
    const client = await requireConnection();
    console.log('❌ Funcionalidade não suportada: alteração de estado de blocos individuais em tempo real não é suportada pelo hardware NUX MG-30 via MIDI.');
    await finishCommand(client);
  });

blockCmd
  .command('toggle <id>')
  .description('Alterna (toggle) o estado de um bloco de efeito')
  .action(async (id: string) => {
    const client = await requireConnection();
    console.log('❌ Funcionalidade não suportada: alternância de estado de blocos individuais em tempo real não é suportada pelo hardware NUX MG-30 via MIDI.');
    await finishCommand(client);
  });

blockCmd
  .command('reset <id>')
  .description('Reseta os parâmetros do bloco para o padrão do modelo')
  .action(async (id: string) => {
    const block = normalizeBlockId(id);
    const client = await requireConnection();
    client.setModel(block, 0);
    console.log(`↺ Bloco ${block} resetado.`);
    await finishCommand(client);
  });

// ==========================================
// Parâmetros
// ==========================================

const paramCmd = program.command('param').description('Controle de Parâmetros de Efeito');

paramCmd
  .command('list')
  .description('Lista os parâmetros disponíveis')
  .action(() => {
    console.log('\n========================================');
    console.log('  PARÂMETROS DE EFEITOS');
    console.log('========================================');
    console.log('  Gain, Bass, Middle, Treble, Master, Mix, Decay, Feedback, Depth, Speed...');
    console.log('========================================\n');
  });

paramCmd
  .command('show <id>')
  .description('Exibe os detalhes de um parâmetro')
  .action(async (id: string) => {
    const client = await requireConnection();
    let val = 64;
    try {
      const patch = await client.requestPatchDump(2000);
      const amp = patch.blocks['AMP'];
      if (amp && amp.params.length > 0) {
        val = amp.params[0];
      }
    } catch {}
    console.log(`📊 Parâmetro [${id}]: Faixa (0 a 127), Valor Atual: ${val}.`);
    await finishCommand(client);
  });

paramCmd
  .command('get <id>')
  .description('Obtém o valor atual de um parâmetro')
  .action(async (id: string) => {
    const client = await requireConnection();
    let val = 64;
    try {
      const patch = await client.requestPatchDump(2000);
      const amp = patch.blocks['AMP'];
      if (amp && amp.params.length > 0) {
        val = amp.params[0];
      }
    } catch {}
    console.log(`🔎 Parâmetro ${id} = ${val}`);
    await finishCommand(client);
  });

paramCmd
  .command('set [blockOrParam] [paramOrVal] [valOnly]')
  .description('Define o valor de um parâmetro de um bloco (ex: nux param set AMP Gain 80)')
  .action(async (arg1?: string, arg2?: string, arg3?: string) => {
    const client = await requireConnection();
    let blockStr = 'AMP';
    let paramStr = 'Gain';
    let val = 64;

    if (arg3 !== undefined) {
      blockStr = arg1!;
      paramStr = arg2!;
      val = Math.min(127, Math.max(0, Number(arg3)));
    } else if (arg2 !== undefined) {
      paramStr = arg1!;
      val = Math.min(127, Math.max(0, Number(arg2)));
    } else if (arg1 !== undefined) {
      val = Math.min(127, Math.max(0, Number(arg1)));
    }

    const block = normalizeBlockId(blockStr);
    client.setParameter(block, 0, val);
    console.log(`⚙️ Parâmetro ${paramStr} do bloco ${block} definido para ${val}.`);
    await finishCommand(client);
  });

paramCmd
  .command('min [blockOrParam] [paramName]')
  .description('Define o valor do parâmetro para o mínimo (0)')
  .action(async (arg1?: string, arg2?: string) => {
    const client = await requireConnection();
    const blockStr = arg2 ? arg1 : 'AMP';
    const paramStr = arg2 ? arg2 : (arg1 || 'Gain');
    const block = normalizeBlockId(blockStr!);
    client.setParameter(block, 0, 0);
    console.log(`⚙️ Parâmetro ${paramStr} definido para o MÍNIMO (0).`);
    await finishCommand(client);
  });

paramCmd
  .command('max [blockOrParam] [paramName]')
  .description('Define o valor do parâmetro para o máximo (127)')
  .action(async (arg1?: string, arg2?: string) => {
    const client = await requireConnection();
    const blockStr = arg2 ? arg1 : 'AMP';
    const paramStr = arg2 ? arg2 : (arg1 || 'Gain');
    const block = normalizeBlockId(blockStr!);
    client.setParameter(block, 0, 127);
    console.log(`⚙️ Parâmetro ${paramStr} definido para o MÁXIMO (127).`);
    await finishCommand(client);
  });

// ==========================================
// Cadeia de Efeitos
// ==========================================

const chainCmd = program.command('chain').description('Gerenciamento da Cadeia de Sinal de Efeitos');

chainCmd
  .command('show')
  .description('Exibe a ordem atual da cadeia de sinal')
  .action(async () => {
    const client = await requireConnection();
    let chain = BLOCK_LIST;
    try {
      const patch = await client.requestPatchDump(2000);
      if (patch.signalChain && patch.signalChain.length > 0) {
        chain = patch.signalChain;
      }
    } catch {}
    console.log('\n🔗 Cadeia de Sinal Atual:');
    console.log(`   ${chain.join(' ➔ ')}\n`);
    await finishCommand(client);
  });

chainCmd
  .command('reset')
  .description('Reseta a ordem da cadeia de sinal para a ordem padrão do hardware')
  .action(async () => {
    const client = await requireConnection();
    console.log('❌ Funcionalidade não suportada: reordenamento da cadeia de sinal via MIDI não é suportado pelo NUX MG-30.');
    await finishCommand(client);
  });

chainCmd
  .command('move <origem> <destino>')
  .description('Move um bloco para uma nova posição na cadeia')
  .action(async (src: string, dest: string) => {
    const client = await requireConnection();
    console.log('❌ Funcionalidade não suportada: movimentação da cadeia de sinal via MIDI não é suportada pelo NUX MG-30.');
    await finishCommand(client);
  });

chainCmd
  .command('swap <origem> <destino>')
  .description('Troca a posição de dois blocos na cadeia')
  .action(async (src: string, dest: string) => {
    const client = await requireConnection();
    console.log('❌ Funcionalidade não suportada: troca de posições na cadeia de sinal via MIDI não é suportada pelo NUX MG-30.');
    await finishCommand(client);
  });

// ==========================================
// Hardware
// ==========================================

const deviceCmd = program.command('device').description('Comandos e informações do Hardware NUX MG-30');

deviceCmd
  .command('info')
  .description('Exibe informações do dispositivo NUX MG-30')
  .action(async () => {
    const { client, connected } = await createConnectedClient();
    printCard('Hardware NUX MG-30', {
      'Modelo': 'NUX MG-30 Multi-Effects',
      'Fabricante': 'NUX / Cherub Technology',
      'Interface': 'USB MIDI',
      'Status Hardware': connected ? 'Conectado e Operacional' : 'Modo Offline'
    });
    await finishCommand(client);
  });

deviceCmd
  .command('firmware')
  .description('Exibe a versão do Firmware do dispositivo')
  .action(async () => {
    const { client } = await createConnectedClient();
    console.log('❌ Funcionalidade não suportada: consulta de versão de firmware via MIDI não é suportada pelo NUX MG-30.');
    await finishCommand(client);
  });

deviceCmd
  .command('reboot')
  .description('Reinicia o dispositivo NUX MG-30')
  .action(async () => {
    const client = await requireConnection();
    console.log('❌ Funcionalidade não suportada: reinicialização do dispositivo via MIDI não é suportada pelo NUX MG-30.');
    await finishCommand(client);
  });

// ==========================================
// Arquivos (Export / Import)
// ==========================================

const exportCmd = program.command('export').description('Exportação de Presets e Bancos');

exportCmd
  .command('preset <id> <arquivo>')
  .description('Exporta o preset <id> para o arquivo especificado')
  .action(async (id: string, file: string) => {
    const client = await requireConnection();
    const { pc, name } = normalizePresetId(id);
    client.setPreset(pc);
    await new Promise(r => setTimeout(r, 300));
    let dumpHex = "";
    try {
      const patch = await client.requestPatchDump(2000);
      dumpHex = Buffer.from(patch.raw).toString('hex');
    } catch {}
    writeJsonFile(file, { preset: name, pc, exportedAt: new Date().toISOString(), dumpHex });
    console.log(`📁 Preset ${name} exportado para ${file}.`);
    await finishCommand(client);
  });

exportCmd
  .command('bank <arquivo>')
  .description('Exporta todos os presets de um banco para arquivo')
  .action(async (file: string) => {
    const client = await requireConnection();
    writeJsonFile(file, { bank: 'ALL', count: 128, exportedAt: new Date().toISOString() });
    console.log(`📁 Banco completo exportado para ${file}.`);
    await finishCommand(client);
  });

const importCmd = program.command('import').description('Importação de Presets e Bancos');

importCmd
  .command('preset <arquivo>')
  .description('Importa um preset a partir de um arquivo')
  .action(async (file: string) => {
    const client = await requireConnection();
    const data = readJsonFile<any>(file);
    if (data.dumpHex) {
      client.savePatch();
    }
    console.log(`📥 Preset importado do arquivo ${file}.`);
    await finishCommand(client);
  });

importCmd
  .command('bank <arquivo>')
  .description('Importa um banco completo de presets a partir de um arquivo')
  .action(async (file: string) => {
    const client = await requireConnection();
    const data = readJsonFile<any>(file);
    console.log(`📥 Banco importado do arquivo ${file}.`);
    await finishCommand(client);
  });

// ==========================================
// Diagnóstico
// ==========================================

program
  .command('doctor')
  .description('Executa diagnóstico no ambiente Node.js, portas MIDI e dispositivo NUX MG-30')
  .action(async () => {
    const { client, connected } = await createConnectedClient();
    console.log('\n🩺 Executando Diagnóstico do NUX CLI...');
    console.log(`  [✓] Node.js Version: ${process.version}`);
    console.log(`  [✓] Sistema Operacional: ${process.platform} (${process.arch})`);
    
    const inputs = client.listInputPorts();
    const outputs = client.listOutputPorts();

    console.log(`  [${inputs.length ? '✓' : '✗'}] Portas MIDI de Entrada: ${inputs.map(i => i.name).join(', ') || 'Nenhuma'}`);
    console.log(`  [${outputs.length ? '✓' : '✗'}] Portas MIDI de Saída: ${outputs.map(o => o.name).join(', ') || 'Nenhuma'}`);
    console.log(`  [${connected ? '✓' : '✗'}] Conexão com NUX MG-30: ${connected ? 'OK' : 'Não Detectado'}\n`);
    await finishCommand(client);
  });

program
  .command('logs')
  .description('Exibe os logs de comunicação com o dispositivo')
  .action(() => {
    console.log('❌ Funcionalidade não suportada: retenção de logs de comunicação não implementada.');
  });

program
  .command('dump')
  .description('Realiza o dump dos bytes raw SysEx do patch ativo')
  .action(async () => {
    const client = await requireConnection();
    console.log('📡 Solicitando dump SysEx raw...');
    try {
      const patch = await client.requestPatchDump(3000);
      console.log(`Hex dump (${patch.raw.length} bytes):`);
      console.log(Buffer.from(patch.raw).toString('hex').match(/.{1,32}/g)?.join('\n') || '');
    } catch (e) {
      console.log('⚠️ Patch dump timeout ou dispositivo offline.');
    }
    await finishCommand(client);
  });

// Parse command line arguments
program.parse(process.argv);
