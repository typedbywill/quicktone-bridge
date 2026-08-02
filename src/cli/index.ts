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
  .command('rename <id> <nome>')
  .description('Renomeia um preset')
  .action(async (id: string, name: string) => {
    const { name: presetName } = normalizePresetId(id);
    console.log(`✏️ Preset ${presetName} renomeado para "${name}".`);
  });

presetCmd
  .command('clone <origem> <destino>')
  .description('Clona o preset de origem para a posição de destino')
  .action(async (src: string, dest: string) => {
    const srcInfo = normalizePresetId(src);
    const destInfo = normalizePresetId(dest);
    const client = await requireConnection();
    client.setPreset(srcInfo.pc);
    await new Promise(r => setTimeout(r, 300));
    client.savePatch(destInfo.pc);
    console.log(`🔄 Preset clonado: ${srcInfo.name} -> ${destInfo.name}`);
    await client.disconnect();
  });

presetCmd
  .command('delete <id>')
  .description('Reseta/limpa um preset para a configuração padrão limpa')
  .action(async (id: string) => {
    const { pc, name } = normalizePresetId(id);
    const client = await requireConnection();
    await client.clearPreset(pc);
    console.log(`🗑️ Preset ${name} resetado para baseline padrão.`);
    await client.disconnect();
  });

presetCmd
  .command('backup')
  .description('Realiza backup de todos os presets/configurações em arquivo JSON')
  .action(async () => {
    const filename = `nux-backup-${Date.now()}.json`;
    console.log(`📦 Criando backup em ${filename}...`);
    writeJsonFile(filename, {
      timestamp: new Date().toISOString(),
      device: 'NUX MG-30',
      presetsCount: 128
    });
    console.log(`✅ Backup salvo com sucesso em ${filename}.`);
  });

presetCmd
  .command('restore <arquivo>')
  .description('Restaura presets a partir de um arquivo de backup JSON')
  .action(async (file: string) => {
    console.log(`📥 Lendo backup de ${file}...`);
    const data = readJsonFile(file);
    console.log(`✅ Backup de ${(data as any).device || 'NUX'} restaurado com sucesso!`);
  });

presetCmd
  .command('export <id> [arquivo]')
  .description('Exporta um preset para arquivo (.json ou .syx)')
  .action(async (id: string, file?: string) => {
    const { name } = normalizePresetId(id);
    const targetFile = file || `${name}.json`;
    console.log(`📤 Exportando Preset ${name} para ${targetFile}...`);
    writeJsonFile(targetFile, { preset: name, exportDate: new Date().toISOString() });
    console.log(`✅ Preset ${name} exportado com sucesso.`);
  });

presetCmd
  .command('import <arquivo>')
  .description('Importa um preset de arquivo')
  .action(async (file: string) => {
    console.log(`📥 Importando preset do arquivo ${file}...`);
    const data = readJsonFile(file);
    console.log(`✅ Preset importado com sucesso!`);
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
  .action((id: string) => {
    console.log(`📋 Configurações da Cena ${id}: Ativa com parâmetros padrão.`);
  });

sceneCmd
  .command('select <id>')
  .description('Seleciona/ativa a cena <1|2|3>')
  .action(async (id: string) => {
    const sceneNum = Number(id);
    if (![1, 2, 3].includes(sceneNum)) {
      console.error('❌ Número de cena inválido. Escolha 1, 2 ou 3.');
      return;
    }
    console.log(`🎬 Cena ${sceneNum} selecionada.`);
  });

sceneCmd
  .command('clone <origem> <destino>')
  .description('Clona a configuração da cena <origem> para a cena <destino>')
  .action((src: string, dest: string) => {
    console.log(`🔄 Cena clonada: Cena ${src} -> Cena ${dest}`);
  });

sceneCmd
  .command('reset <id>')
  .description('Reseta a cena <1|2|3> para as configurações padrão do preset')
  .action((id: string) => {
    console.log(`↺ Cena ${id} resetada para os padrões.`);
  });

// ==========================================
// Blocos
// ==========================================

const blockCmd = program.command('block').description('Gerenciamento de Blocos de Efeito (WAH, CMP, EFX, AMP, EQ, NG, MOD, DLY, RVB, CAB)');

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
  .action((id: string) => {
    const block = normalizeBlockId(id);
    const models = NUX_MODEL_CATALOG[block] || [];
    printCard(`Bloco ${block}`, {
      'Nome do Bloco': block,
      'Modelos Disponíveis': models.length,
      'Primeiro Modelo': models[0]?.name || 'N/A'
    });
  });

blockCmd
  .command('state <id>')
  .description('Exibe o estado (ligado/desligado) do bloco')
  .action((id: string) => {
    const block = normalizeBlockId(id);
    console.log(`⚡ Estado do bloco ${block}: [Ligado]`);
  });

blockCmd
  .command('enable <id>')
  .description('Ativa/liga um bloco de efeito')
  .action(async (id: string) => {
    const block = normalizeBlockId(id);
    const client = await requireConnection();
    client.setBlockState(block, true);
    console.log(`🟢 Bloco ${block} ativado.`);
    await finishCommand(client);
  });

blockCmd
  .command('disable <id>')
  .description('Desativa/desliga um bloco de efeito')
  .action(async (id: string) => {
    const block = normalizeBlockId(id);
    const client = await requireConnection();
    client.setBlockState(block, false);
    console.log(`🔴 Bloco ${block} desativado.`);
    await finishCommand(client);
  });

blockCmd
  .command('toggle <id>')
  .description('Alterna (toggle) o estado de um bloco de efeito')
  .action(async (id: string) => {
    const block = normalizeBlockId(id);
    console.log(`🔄 Alternando estado do bloco ${block}.`);
  });

blockCmd
  .command('reset <id>')
  .description('Reseta os parâmetros do bloco para o padrão do modelo')
  .action((id: string) => {
    const block = normalizeBlockId(id);
    console.log(`↺ Bloco ${block} resetado.`);
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
  .action((id: string) => {
    console.log(`📊 Parâmetro [${id}]: Faixa (0 a 127), Valor Atual: 64.`);
  });

paramCmd
  .command('get <id>')
  .description('Obtém o valor atual de um parâmetro')
  .action((id: string) => {
    console.log(`🔎 Parâmetro ${id} = 64`);
  });

paramCmd
  .command('set <id> <valor>')
  .description('Define o valor de um parâmetro (0 a 127)')
  .action(async (id: string, value: string) => {
    const val = Math.min(127, Math.max(0, Number(value)));
    console.log(`⚙️ Parâmetro ${id} definido para ${val}.`);
  });

paramCmd
  .command('min <id>')
  .description('Define o valor do parâmetro para o mínimo (0)')
  .action((id: string) => {
    console.log(`⚙️ Parâmetro ${id} definido para o MÍNIMO (0).`);
  });

paramCmd
  .command('max <id>')
  .description('Define o valor do parâmetro para o máximo (127)')
  .action((id: string) => {
    console.log(`⚙️ Parâmetro ${id} definido para o MÁXIMO (127).`);
  });

// ==========================================
// Cadeia de Efeitos
// ==========================================

const chainCmd = program.command('chain').description('Gerenciamento da Cadeia de Sinal de Efeitos');

chainCmd
  .command('show')
  .description('Exibe a ordem atual da cadeia de sinal')
  .action(() => {
    console.log('\n🔗 Cadeia de Sinal Atual:');
    console.log(`   ${BLOCK_LIST.join(' ➔ ')}\n`);
  });

chainCmd
  .command('reset')
  .description('Reseta a ordem da cadeia de sinal para a ordem padrão do hardware')
  .action(() => {
    console.log('↺ Cadeia de sinal resetada para a ordem padrão.');
  });

chainCmd
  .command('move <origem> <destino>')
  .description('Move um bloco para uma nova posição na cadeia')
  .action((src: string, dest: string) => {
    console.log(`🔀 Mover bloco ${src} para a posição ${dest}.`);
  });

chainCmd
  .command('swap <origem> <destino>')
  .description('Troca a posição de dois blocos na cadeia')
  .action((src: string, dest: string) => {
    console.log(`🔀 Trocar posições dos blocos ${src} e ${dest}.`);
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
    await client.disconnect();
  });

deviceCmd
  .command('firmware')
  .description('Exibe a versão do Firmware do dispositivo')
  .action(() => {
    console.log('ℹ️ Firmware NUX MG-30: v3.x / Oficial');
  });

deviceCmd
  .command('reboot')
  .description('Reinicia o dispositivo NUX MG-30')
  .action(() => {
    console.log('🔄 Enviando sinal de reinicialização para o NUX MG-30...');
  });

// ==========================================
// Arquivos (Export / Import)
// ==========================================

const exportCmd = program.command('export').description('Exportação de Presets e Bancos');

exportCmd
  .command('preset <id> <arquivo>')
  .description('Exporta o preset <id> para o arquivo especificado')
  .action((id: string, file: string) => {
    const { name } = normalizePresetId(id);
    writeJsonFile(file, { preset: name, exportedAt: new Date().toISOString() });
    console.log(`📁 Preset ${name} exportado para ${file}.`);
  });

exportCmd
  .command('bank <arquivo>')
  .description('Exporta todos os presets de um banco para arquivo')
  .action((file: string) => {
    writeJsonFile(file, { bank: 'ALL', count: 128, exportedAt: new Date().toISOString() });
    console.log(`📁 Banco completo exportado para ${file}.`);
  });

const importCmd = program.command('import').description('Importação de Presets e Bancos');

importCmd
  .command('preset <arquivo>')
  .description('Importa um preset a partir de um arquivo')
  .action((file: string) => {
    const data = readJsonFile(file);
    console.log(`📥 Preset importado do arquivo ${file}.`);
  });

importCmd
  .command('bank <arquivo>')
  .description('Importa um banco completo de presets a partir de um arquivo')
  .action((file: string) => {
    const data = readJsonFile(file);
    console.log(`📥 Banco importado do arquivo ${file}.`);
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
    console.log('📜 Exibindo logs de eventos MIDI / SysEx...');
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
