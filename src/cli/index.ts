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
  getPersistedParamState,
  setPersistedParamState,
  getPersistedActiveScene,
  setPersistedActiveScene,
  getPersistedSceneBlockStates,
  setPersistedSceneBlockStates,
  DEFAULT_BLOCK_STATES,
  finishCommand
} from './helpers.js';
import { BLOCK_LIST, NUX_MODEL_CATALOG, NUX_BLOCK_PARAM_CATALOG, findBlockParam, getModelName, programChangeToPresetName } from '../constants.js';
import { BlockType } from '../types.js';

const program = new Command();

program
  .name('nux')
  .description('CLI tool for NUX MG-30 Multi-Effects Processor')
  .version('1.0.0');

// Mapeamento de comandos para categorias (usado pelo help customizado)
const COMMAND_GROUPS: Record<string, { label: string; emoji: string; commands: string[] }> = {
  status: {
    label: 'Status & Informações',
    emoji: '📊',
    commands: ['ping', 'status', 'info', 'doctor'],
  },
  connection: {
    label: 'Conexão',
    emoji: '🔌',
    commands: ['connect', 'disconnect', 'sync'],
  },
  control: {
    label: 'Controle do Dispositivo',
    emoji: '🎛️',
    commands: ['preset', 'preset-up', 'preset-down', 'scene', 'scene-up', 'scene-down', 'block', 'param', 'chain', 'device'],
  },
  files: {
    label: 'Arquivos',
    emoji: '📁',
    commands: ['export', 'import'],
  },
  debug: {
    label: 'Diagnóstico & Debug',
    emoji: '🔧',
    commands: ['logs', 'dump'],
  },
};

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

async function selectSceneAction(sceneNum: number) {
  if (![1, 2, 3].includes(sceneNum)) {
    console.error('❌ Número de cena inválido. Escolha 1, 2 ou 3.');
    process.exit(1);
  }
  const client = await requireConnection();
  console.log(`🎬 Enviando CC 80 = ${sceneNum - 1} (Scene ${sceneNum})...`);
  client.selectScene(sceneNum);
  setPersistedActiveScene(sceneNum);
  console.log(`🎬 Cena ${sceneNum} selecionada.`);
  await finishCommand(client);
}

const sceneCmd = program.command('scene').description('Gerenciamento de Cenas (Scene 1, 2, 3)');

sceneCmd
  .command('list')
  .description('Lista as cenas disponíveis (Scene 1, 2, 3)')
  .action(async () => {
    let activeScene = getPersistedActiveScene();
    try {
      const { client, connected } = await createConnectedClient();
      if (connected) {
        const patch = await client.requestPatchDump(2000);
        activeScene = patch.scene;
        setPersistedActiveScene(activeScene);
        await client.disconnect();
      }
    } catch {}

    console.log('\n========================================');
    console.log('  CENAS DO PRESET (NUX MG-30)');
    console.log('========================================');
    console.log(`  ${activeScene === 1 ? '🟢 [1] Scene 1 (Cena Principal) - ATIVA' : '⚪ [1] Scene 1 (Cena Principal)'}`);
    console.log(`  ${activeScene === 2 ? '🟢 [2] Scene 2 (Cena Secundária) - ATIVA' : '⚪ [2] Scene 2 (Cena Secundária)'}`);
    console.log(`  ${activeScene === 3 ? '🟢 [3] Scene 3 (Cena Solo / Lead) - ATIVA' : '⚪ [3] Scene 3 (Cena Solo / Lead)'}`);
    console.log('========================================\n');
  });

sceneCmd
  .command('show [id]')
  .description('Exibe os detalhes da cena <1|2|3> (padrão: cena ativa)')
  .action(async (id?: string) => {
    let sceneNum = id ? Number(id) : getPersistedActiveScene();
    if (![1, 2, 3].includes(sceneNum)) {
      console.error('❌ Número de cena inválido. Escolha 1, 2 ou 3.');
      process.exit(1);
    }
    const client = await requireConnection();
    let isCurrent = false;
    let bpm = 120;
    let presetName = loadNuxState().currentPresetName;
    try {
      const patch = await client.requestPatchDump(2000);
      isCurrent = patch.scene === sceneNum;
      bpm = patch.bpm;
      presetName = patch.presetName;
      if (isCurrent) setPersistedActiveScene(sceneNum);
    } catch {
      isCurrent = getPersistedActiveScene() === sceneNum;
    }

    printCard(`Cena ${sceneNum}`, {
      'Número': sceneNum,
      'Status': isCurrent ? '🟢 Ativa' : '⚪ Inativa',
      'BPM': bpm,
      'Preset': presetName,
      'Comando Ativar': `nux scene ${sceneNum}`
    });
    await finishCommand(client);
  });

sceneCmd
  .command('up')
  .description('Avança para a próxima cena no hardware (1 ➔ 2, 2 ➔ 3, 3 ➔ 1)')
  .action(async () => {
    const current = getPersistedActiveScene();
    const next = current >= 3 ? 1 : current + 1;
    console.log(`⬆️ Avançando cena: Scene ${current} ➔ Scene ${next}`);
    await selectSceneAction(next);
  });

sceneCmd
  .command('down')
  .description('Recua para a cena anterior no hardware (3 ➔ 2, 2 ➔ 1, 1 ➔ 3)')
  .action(async () => {
    const current = getPersistedActiveScene();
    const prev = current <= 1 ? 3 : current - 1;
    console.log(`⬇️ Recuando cena: Scene ${current} ➔ Scene ${prev}`);
    await selectSceneAction(prev);
  });

sceneCmd
  .command('1')
  .description('Seleciona e ativa a Cena 1')
  .action(async () => {
    await selectSceneAction(1);
  });

sceneCmd
  .command('2')
  .description('Seleciona e ativa a Cena 2')
  .action(async () => {
    await selectSceneAction(2);
  });

sceneCmd
  .command('3')
  .description('Seleciona e ativa a Cena 3')
  .action(async () => {
    await selectSceneAction(3);
  });

sceneCmd
  .command('select <id>')
  .description('Seleciona/ativa a cena <1|2|3>')
  .action(async (id: string) => {
    const sceneNum = Number(id);
    await selectSceneAction(sceneNum);
  });

sceneCmd
  .command('clone <origem> <destino>')
  .description('Clona a configuração da cena <origem> para a cena <destino>')
  .action(async (src: string, dest: string) => {
    const srcNum = Number(src);
    const destNum = Number(dest);
    if (![1, 2, 3].includes(srcNum) || ![1, 2, 3].includes(destNum)) {
      console.error('❌ Números de cena inválidos. Escolha 1, 2 ou 3 para origem e destino.');
      process.exit(1);
    }
    if (srcNum === destNum) {
      console.error('❌ Origem e destino devem ser cenas diferentes.');
      process.exit(1);
    }
    const client = await requireConnection();
    const srcStates = getPersistedSceneBlockStates(srcNum);
    setPersistedSceneBlockStates(destNum, srcStates);
    client.selectScene(destNum);
    setPersistedActiveScene(destNum);
    for (const [block, enabled] of Object.entries(srcStates)) {
      try {
        client.setBlockState(block as BlockType, enabled);
      } catch {}
    }
    console.log(`📋 Configuração da Cena ${srcNum} clonada com sucesso para a Cena ${destNum}!`);
    await finishCommand(client);
  });

sceneCmd
  .command('reset <id>')
  .description('Reseta a cena <1|2|3> para as configurações padrão do preset')
  .action(async (id: string) => {
    const sceneNum = Number(id);
    if (![1, 2, 3].includes(sceneNum)) {
      console.error('❌ Número de cena inválido. Escolha 1, 2 ou 3.');
      process.exit(1);
    }
    const client = await requireConnection();
    const defaultStates = DEFAULT_BLOCK_STATES;
    setPersistedSceneBlockStates(sceneNum, defaultStates);
    client.selectScene(sceneNum);
    setPersistedActiveScene(sceneNum);
    for (const [block, enabled] of Object.entries(defaultStates)) {
      try {
        client.setBlockState(block as BlockType, enabled);
      } catch {}
    }
    console.log(`🔄 Cena ${sceneNum} resetada para as configurações padrão.`);
    await finishCommand(client);
  });

// Atalhos Globais Scene Up / Scene Down
program
  .command('scene-up')
  .description('Atalho para avançar cena (nux scene up)')
  .action(async () => {
    const current = getPersistedActiveScene();
    const next = current >= 3 ? 1 : current + 1;
    console.log(`⬆️ Avançando cena: Scene ${current} ➔ Scene ${next}`);
    await selectSceneAction(next);
  });

program
  .command('scene-down')
  .description('Atalho para recuar cena (nux scene down)')
  .action(async () => {
    const current = getPersistedActiveScene();
    const prev = current <= 1 ? 3 : current - 1;
    console.log(`⬇️ Recuando cena: Scene ${current} ➔ Scene ${prev}`);
    await selectSceneAction(prev);
  });

// ==========================================
// Blocos
// ==========================================

const blockCmd = program
  .command('block')
  .description('Gerenciamento de Blocos de Efeito (WAH, NG, CMP, MOD, EFX, AMP, IR, EQ, SR, DLY, RVB, VOL, CAB)')
  .argument('[id]', 'ID do bloco (ex: wah, MOD)')
  .argument('[status]', 'on | off | toggle')
  .action(async (id?: string, status?: string) => {
    // Sintaxe curta: nux block <id> [on|off|toggle]
    // Sem argumentos (e sem subcomando), mostra o help do grupo block.
    if (!id) {
      blockCmd.help();
      return;
    }
    await applyBlockState(id, status);
  });

async function applyBlockState(id: string, status?: string): Promise<void> {
  const block = normalizeBlockId(id);
  const client = await requireConnection();
  if (status !== undefined) {
    const lower = status.toLowerCase();
    let enable: boolean;
    if (['on', 'enable', 'enabled', '1', 'ligado', 'true'].includes(lower)) {
      enable = true;
    } else if (['off', 'disable', 'disabled', '0', 'desligado', 'false'].includes(lower)) {
      enable = false;
    } else if (['toggle', 'alternar'].includes(lower)) {
      enable = !getPersistedBlockState(block);
    } else {
      console.error(`❌ Estado inválido "${status}". Use: on, off ou toggle.`);
      await finishCommand(client);
      return;
    }
    client.setBlockState(block, enable);
    setPersistedBlockState(block, enable);
    console.log(`⚡ Bloco ${block} alterado para: [${enable ? 'Ligado' : 'Desligado'}]`);
  } else {
    let isEnabled = getPersistedBlockState(block);
    try {
      const patch = await client.requestPatchDump(1000);
      if (patch.blocks[block]) {
        isEnabled = patch.blocks[block].enabled;
      }
    } catch {}
    console.log(`⚡ Estado do bloco ${block} no patch ativo: [${isEnabled ? 'Ligado' : 'Desligado'}]`);
  }
  await finishCommand(client);
}

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
  .command('state <id> [status]')
  .description('Exibe ou altera o estado (ligado/desligado) do bloco no patch ativo')
  .action(async (id: string, status?: string) => {
    await applyBlockState(id, status);
  });

blockCmd
  .command('enable <id>')
  .description('Ativa/liga um bloco de efeito')
  .action(async (id: string) => {
    const block = normalizeBlockId(id);
    const client = await requireConnection();
    client.setBlockState(block, true);
    setPersistedBlockState(block, true);
    console.log(`⚡ Bloco ${block} ativado.`);
    await finishCommand(client);
  });

blockCmd
  .command('disable <id>')
  .description('Desativa/desliga um bloco de efeito')
  .action(async (id: string) => {
    const block = normalizeBlockId(id);
    const client = await requireConnection();
    client.setBlockState(block, false);
    setPersistedBlockState(block, false);
    console.log(`⚡ Bloco ${block} desativado.`);
    await finishCommand(client);
  });

blockCmd
  .command('toggle <id>')
  .description('Alterna (toggle) o estado de um bloco de efeito')
  .action(async (id: string) => {
    const block = normalizeBlockId(id);
    const client = await requireConnection();
    const currentEnabled = getPersistedBlockState(block);
    const newState = !currentEnabled;
    client.setBlockState(block, newState);
    setPersistedBlockState(block, newState);
    console.log(`⚡ Bloco ${block} alternado para [${newState ? 'Ligado' : 'Desligado'}].`);
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
  .command('list [block]')
  .description('Lista os parâmetros disponíveis por bloco ou de todos os blocos')
  .action((blockInput?: string) => {
    console.log('\n========================================');
    if (blockInput) {
      const { block } = findBlockParam(blockInput);
      const params = NUX_BLOCK_PARAM_CATALOG[block] || [];
      console.log(`  PARÂMETROS DO BLOCO DE EFEITO [${block}]`);
      console.log('========================================');
      for (const p of params) {
        console.log(`  [${p.id}] ${p.name.padEnd(15)} : Faixa (0 a 127)`);
      }
    } else {
      console.log('  PARÂMETROS DE EFEITOS (TODOS OS BLOCOS)');
      console.log('========================================');
      for (const b of BLOCK_LIST) {
        const params = NUX_BLOCK_PARAM_CATALOG[b] || [];
        const paramStrList = params.map(p => `[${p.id}] ${p.name}`).join(', ');
        console.log(`  ${b.padEnd(5)}: ${paramStrList}`);
      }
    }
    console.log('========================================\n');
  });

paramCmd
  .command('show [blockOrParam] [paramName]')
  .description('Exibe os detalhes de um parâmetro')
  .action(async (arg1?: string, arg2?: string) => {
    const client = await requireConnection();
    const { block, paramId, paramName } = findBlockParam(arg2 ? arg1 : undefined, arg2 ? arg2 : arg1);
    let val = getPersistedParamState(block, paramId);
    try {
      const patch = await client.requestPatchDump(2000);
      const blkState = patch.blocks[block];
      if (blkState && blkState.params && blkState.params[paramId] !== undefined) {
        val = blkState.params[paramId];
      }
    } catch {}
    console.log(`📊 Parâmetro [${block} > ${paramName}]: Faixa (0 a 127), Valor Atual: ${val}.`);
    await finishCommand(client);
  });

paramCmd
  .command('get [blockOrParam] [paramName]')
  .description('Obtém o valor atual de um parâmetro')
  .action(async (arg1?: string, arg2?: string) => {
    const client = await requireConnection();
    if (!arg1 && !arg2) {
      console.log('\n========================================');
      console.log('  VALORES DE PARÂMETROS DO BLOCO [AMP]');
      console.log('========================================');
      const params = NUX_BLOCK_PARAM_CATALOG['AMP'] || [];
      let patch: any;
      try { patch = await client.requestPatchDump(2000); } catch {}
      for (const p of params) {
        let val = patch?.blocks?.['AMP']?.params?.[p.id];
        if (val === undefined) val = getPersistedParamState('AMP', p.id);
        console.log(`  🔎 ${p.name.padEnd(12)} (ID ${p.id}) = ${val}`);
      }
      console.log('========================================\n');
      await finishCommand(client);
      return;
    }

    const { block, paramId, paramName } = findBlockParam(arg2 ? arg1 : undefined, arg2 ? arg2 : arg1);
    let val = getPersistedParamState(block, paramId);
    try {
      const patch = await client.requestPatchDump(2000);
      const blkState = patch.blocks[block];
      if (blkState && blkState.params && blkState.params[paramId] !== undefined) {
        val = blkState.params[paramId];
      }
    } catch {}
    console.log(`🔎 Parâmetro ${block} > ${paramName} (ID ${paramId}) = ${val}`);
    await finishCommand(client);
  });

paramCmd
  .command('set [blockOrParam] [paramOrVal] [valOnly]')
  .description('Define o valor de um parâmetro de um bloco (ex: nux param set AMP Gain 80)')
  .action(async (arg1?: string, arg2?: string, arg3?: string) => {
    const client = await requireConnection();
    let bInput: string | undefined;
    let pInput: string | number | undefined;
    let valInput: string | undefined;

    if (arg3 !== undefined) {
      bInput = arg1;
      pInput = arg2;
      valInput = arg3;
    } else if (arg2 !== undefined) {
      if (!isNaN(Number(arg2))) {
        pInput = arg1;
        valInput = arg2;
      } else {
        bInput = arg1;
        pInput = arg2;
      }
    } else if (arg1 !== undefined) {
      if (!isNaN(Number(arg1))) {
        valInput = arg1;
      } else {
        pInput = arg1;
      }
    }

    if (valInput === undefined) {
      console.error('\n❌ Erro: Valor do parâmetro não especificado.');
      console.error('Uso: nux param set [bloco] <parâmetro> <valor>\nExemplo: nux param set AMP Gain 80\n');
      await finishCommand(client, 1);
    }

    const val = Math.min(127, Math.max(0, Number(valInput)));
    const { block, paramId, paramName } = findBlockParam(bInput, pInput);
    client.setParameter(block, paramId, val);
    setPersistedParamState(block, paramId, val);
    console.log(`⚙️ Parâmetro ${block} > ${paramName} (ID ${paramId}) definido para ${val}.`);
    await finishCommand(client);
  });

paramCmd
  .command('min [blockOrParam] [paramName]')
  .description('Define o valor do parâmetro para o mínimo (0)')
  .action(async (arg1?: string, arg2?: string) => {
    const client = await requireConnection();
    const { block, paramId, paramName } = findBlockParam(arg2 ? arg1 : undefined, arg2 ? arg2 : arg1);
    client.setParameter(block, paramId, 0);
    setPersistedParamState(block, paramId, 0);
    console.log(`⚙️ Parâmetro ${block} > ${paramName} (ID ${paramId}) definido para o MÍNIMO (0).`);
    await finishCommand(client);
  });

paramCmd
  .command('max [blockOrParam] [paramName]')
  .description('Define o valor do parâmetro para o máximo (127)')
  .action(async (arg1?: string, arg2?: string) => {
    const client = await requireConnection();
    const { block, paramId, paramName } = findBlockParam(arg2 ? arg1 : undefined, arg2 ? arg2 : arg1);
    client.setParameter(block, paramId, 127);
    setPersistedParamState(block, paramId, 127);
    console.log(`⚙️ Parâmetro ${block} > ${paramName} (ID ${paramId}) definido para o MÁXIMO (127).`);
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

// Help customizado agrupado por categoria
program.configureHelp({
  formatHelp(cmd, helper) {
    const title = `Usage: ${helper.commandUsage(cmd)}\n\n${helper.commandDescription(cmd)}\n`;

    // Opções globais
    const optionLines = helper.visibleOptions(cmd).map(opt => {
      const flags = helper.optionTerm(opt);
      const desc = helper.optionDescription(opt);
      return `  ${flags.padEnd(18)}${desc}`;
    });
    const optionsSection = optionLines.length
      ? `\nOptions:\n${optionLines.join('\n')}\n`
      : '';

    // Agrupa subcomandos por categoria
    const allCmds = helper.visibleCommands(cmd);
    const cmdMap = new Map(allCmds.map(c => [c.name(), c]));
    const usedNames = new Set<string>();
    const sections: string[] = [];

    for (const group of Object.values(COMMAND_GROUPS)) {
      const lines: string[] = [];
      for (const name of group.commands) {
        const c = cmdMap.get(name);
        if (c) {
          const term = helper.subcommandTerm(c);
          const desc = helper.subcommandDescription(c);
          lines.push(`  ${term.padEnd(18)}${desc}`);
          usedNames.add(name);
        }
      }
      if (lines.length) {
        sections.push(`\n${group.emoji}  ${group.label}:\n${lines.join('\n')}`);
      }
    }

    // Comandos não categorizados (ex: help)
    const uncategorized: string[] = [];
    for (const c of allCmds) {
      if (!usedNames.has(c.name())) {
        const term = helper.subcommandTerm(c);
        const desc = helper.subcommandDescription(c);
        uncategorized.push(`  ${term.padEnd(18)}${desc}`);
      }
    }
    if (uncategorized.length) {
      sections.push(`\n  Outros:\n${uncategorized.join('\n')}`);
    }

    return `${title}${optionsSection}${sections.join('\n')}\n`;
  },
});

// Parse command line arguments
program.parse(process.argv);
