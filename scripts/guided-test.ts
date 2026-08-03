import readline from 'node:readline';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface TestCase {
  id: number;
  category: string;
  name: string;
  description: string;
  args: string[];
}

interface TestResult {
  id: number;
  category: string;
  name: string;
  description: string;
  command: string;
  output: string;
  errorOutput: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  notes: string;
  timestamp: string;
}

const TEST_CASES: TestCase[] = [
  // 1. Conexão & Diagnóstico
  { id: 1, category: 'Conexão & Diagnóstico', name: 'Ping de conectividade', description: 'Envia ping de heartbeat e verifica conectividade com o pedal', args: ['ping'] },
  { id: 2, category: 'Conexão & Diagnóstico', name: 'Status das portas MIDI', description: 'Lista o status de conexão e portas MIDI de entrada/saída', args: ['status'] },
  { id: 3, category: 'Conexão & Diagnóstico', name: 'Informações do Sistema', description: 'Exibe informações gerais do cliente NUX', args: ['info'] },
  { id: 4, category: 'Conexão & Diagnóstico', name: 'Diagnóstico de Ambiente (Doctor)', description: 'Diagnóstica a versão do Node, OS e disponibilidade MIDI', args: ['doctor'] },
  { id: 5, category: 'Conexão & Diagnóstico', name: 'Conexão direta', description: 'Estabelece conexão com o dispositivo NUX MG-30', args: ['connect'] },
  { id: 6, category: 'Conexão & Diagnóstico', name: 'Sincronização de Patch', description: 'Solicita dump de dados do patch ativo no NUX', args: ['sync'] },
  { id: 7, category: 'Conexão & Diagnóstico', name: 'Raw SysEx Dump', description: 'Exibe o hex dump bruto do patch ativo', args: ['dump'] },
  { id: 8, category: 'Conexão & Diagnóstico', name: 'Visualização de Logs', description: 'Exibe logs de eventos de comunicação', args: ['logs'] },
  { id: 9, category: 'Conexão & Diagnóstico', name: 'Desconexão', description: 'Encerra a conexão MIDI', args: ['disconnect'] },

  // 2. Navegação e Seleção de Presets
  { id: 10, category: 'Presets (Navegação)', name: 'Listar Presets', description: 'Lista os 128 presets do dispositivo (32 Bancos de A a D)', args: ['preset', 'list'] },
  { id: 11, category: 'Presets (Navegação)', name: 'Exibir Preset 01A', description: 'Exibe os detalhes do Preset 01A', args: ['preset', 'show', '01A'] },
  { id: 12, category: 'Presets (Navegação)', name: 'Carregar Preset 01B', description: 'Carrega o Preset 01B no hardware', args: ['preset', 'load', '01B'] },
  { id: 13, category: 'Presets (Navegação)', name: 'Carregar Preset 01A', description: 'Retorna e carrega o Preset 01A no hardware', args: ['preset', 'load', '01A'] },
  { id: 14, category: 'Presets (Navegação)', name: 'Preset Up', description: 'Avança para o próximo preset no pedal', args: ['preset', 'up'] },
  { id: 15, category: 'Presets (Navegação)', name: 'Preset Down', description: 'Recua para o preset anterior no pedal', args: ['preset', 'down'] },
  { id: 16, category: 'Presets (Navegação)', name: 'Preset-Up (Atalho Global)', description: 'Executa atalho global nux preset-up', args: ['preset-up'] },
  { id: 17, category: 'Presets (Navegação)', name: 'Preset-Down (Atalho Global)', description: 'Executa atalho global nux preset-down', args: ['preset-down'] },

  // 3. Modificação & Gerenciamento de Presets
  { id: 18, category: 'Presets (Gerenciamento)', name: 'Salvar Patch Ativo', description: 'Salva as alterações do patch atual', args: ['preset', 'save'] },
  { id: 19, category: 'Presets (Gerenciamento)', name: 'Renomear Preset', description: 'Renomeia o Preset 01A para "Novo Nome"', args: ['preset', 'rename', '01A', 'Novo Nome'] },
  { id: 20, category: 'Presets (Gerenciamento)', name: 'Exportar Preset', description: 'Exporta o Preset 01A para um arquivo JSON local', args: ['preset', 'export', '01A', 'test-preset-export.json'] },
  { id: 21, category: 'Presets (Gerenciamento)', name: 'Importar Preset', description: 'Importa um preset do arquivo JSON local', args: ['preset', 'import', 'test-preset-export.json'] },
  { id: 22, category: 'Presets (Gerenciamento)', name: 'Backup de Presets', description: 'Realiza backup completo em arquivo JSON', args: ['preset', 'backup'] },
  { id: 23, category: 'Presets (Gerenciamento)', name: 'Clonar Preset', description: 'Clona preset 32C para 32D', args: ['preset', 'clone', '32C', '32D'] },
  { id: 24, category: 'Presets (Gerenciamento)', name: 'Deletar / Resetar Preset', description: 'Reseta o preset 32D para o padrão limpo', args: ['preset', 'delete', '32D'] },

  // 4. Controle de Cenas
  { id: 25, category: 'Cenas', name: 'Listar Cenas', description: 'Lista as cenas disponíveis no preset', args: ['scene', 'list'] },
  { id: 26, category: 'Cenas', name: 'Exibir Cena 1', description: 'Exibe detalhes da Cena 1', args: ['scene', 'show', '1'] },
  { id: 27, category: 'Cenas', name: 'Selecionar Cena 2', description: 'Seleciona/ativa a Cena 2 no NUX MG-30', args: ['scene', 'select', '2'] },
  { id: 28, category: 'Cenas', name: 'Selecionar Cena 1', description: 'Retorna e ativa a Cena 1 no pedal', args: ['scene', 'select', '1'] },
  { id: 29, category: 'Cenas', name: 'Clonar Cena', description: 'Clona a Cena 1 para a Cena 2', args: ['scene', 'clone', '1', '2'] },
  { id: 30, category: 'Cenas', name: 'Resetar Cena', description: 'Reseta a Cena 2 para o padrão', args: ['scene', 'reset', '2'] },

  // 5. Controle de Blocos de Efeito
  { id: 31, category: 'Blocos de Efeito', name: 'Listar Blocos', description: 'Lista todos os blocos de efeito e seus modelos', args: ['block', 'list'] },
  { id: 32, category: 'Blocos de Efeito', name: 'Exibir Bloco MOD', description: 'Exibe os detalhes do bloco MOD', args: ['block', 'show', 'MOD'] },
  { id: 33, category: 'Blocos de Efeito', name: 'Estado do Bloco MOD', description: 'Exibe o estado (ligado/desligado) do bloco MOD', args: ['block', 'state', 'MOD'] },
  { id: 34, category: 'Blocos de Efeito', name: 'Ativar Bloco MOD', description: 'Liga o bloco MOD no pedal', args: ['block', 'enable', 'MOD'] },
  { id: 35, category: 'Blocos de Efeito', name: 'Desativar Bloco MOD', description: 'Desliga o bloco MOD no pedal', args: ['block', 'disable', 'MOD'] },
  { id: 36, category: 'Blocos de Efeito', name: 'Toggle Bloco MOD', description: 'Alterna o estado do bloco MOD', args: ['block', 'toggle', 'MOD'] },
  { id: 37, category: 'Blocos de Efeito', name: 'Resetar Bloco MOD', description: 'Reseta os parâmetros do bloco MOD para os padrões', args: ['block', 'reset', 'MOD'] },

  // 6. Controle de Parâmetros
  { id: 38, category: 'Parâmetros', name: 'Listar Parâmetros', description: 'Lista os parâmetros de efeito disponíveis', args: ['param', 'list'] },
  { id: 39, category: 'Parâmetros', name: 'Exibir Parâmetro Gain', description: 'Exibe detalhes do parâmetro Gain', args: ['param', 'show', 'Gain'] },
  { id: 40, category: 'Parâmetros', name: 'Obter Parâmetro Gain', description: 'Obtém o valor atual do Gain', args: ['param', 'get', 'Gain'] },
  { id: 41, category: 'Parâmetros', name: 'Definir Parâmetro Gain (80)', description: 'Define o valor do Gain para 80', args: ['param', 'set', 'Gain', '80'] },
  { id: 42, category: 'Parâmetros', name: 'Definir Gain Mínimo (0)', description: 'Define o Gain para o valor mínimo (0)', args: ['param', 'min', 'Gain'] },
  { id: 43, category: 'Parâmetros', name: 'Definir Gain Máximo (127)', description: 'Define o Gain para o valor máximo (127)', args: ['param', 'max', 'Gain'] },

  // 7. Cadeia de Efeitos (Chain)
  { id: 44, category: 'Cadeia de Efeitos', name: 'Exibir Cadeia de Sinal', description: 'Exibe a ordem atual dos blocos na cadeia', args: ['chain', 'show'] },
  { id: 45, category: 'Cadeia de Efeitos', name: 'Mover Bloco', description: 'Move o bloco MOD para antes do EFX', args: ['chain', 'move', 'MOD', 'EFX'] },
  { id: 46, category: 'Cadeia de Efeitos', name: 'Trocar Posicionamento de Blocos', description: 'Troca a posição dos blocos MOD e RVB', args: ['chain', 'swap', 'MOD', 'RVB'] },
  { id: 47, category: 'Cadeia de Efeitos', name: 'Resetar Cadeia de Sinal', description: 'Reseta a cadeia para a ordem padrão', args: ['chain', 'reset'] },

  // 8. Hardware & Export/Import Subcomandos
  { id: 48, category: 'Hardware & Export/Import', name: 'Info do Hardware', description: 'Exibe detalhes do hardware NUX MG-30', args: ['device', 'info'] },
  { id: 49, category: 'Hardware & Export/Import', name: 'Versão do Firmware', description: 'Exibe a versão de firmware registrada', args: ['device', 'firmware'] },
  { id: 50, category: 'Hardware & Export/Import', name: 'Exportar Preset (Comando Top-Level)', description: 'Comando global export preset 01A', args: ['export', 'preset', '01A', 'test-export-top.json'] },
  { id: 51, category: 'Hardware & Export/Import', name: 'Exportar Banco Completo', description: 'Comando global export bank', args: ['export', 'bank', 'test-bank-top.json'] },
  { id: 52, category: 'Hardware & Export/Import', name: 'Importar Preset (Comando Top-Level)', description: 'Comando global import preset', args: ['import', 'preset', 'test-export-top.json'] },
  { id: 53, category: 'Hardware & Export/Import', name: 'Importar Banco Completo', description: 'Comando global import bank', args: ['import', 'bank', 'test-bank-top.json'] }
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const askQuestion = (query: string): Promise<string> => {
  return new Promise(resolve => rl.question(query, resolve));
};

// Cores ANSI
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;
const gray = (text: string) => `\x1b[90m${text}\x1b[0m`;

function executeCliCommand(args: string[]): { stdout: string; stderr: string; code: number | null } {
  const cliPath = path.resolve('src/cli/index.ts');
  const result = spawnSync('npx', ['tsx', cliPath, ...args], {
    encoding: 'utf-8',
    shell: true
  });

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    code: result.status
  };
}

async function runGuidedTests() {
  console.clear();
  console.log(bold(cyan('========================================================================')));
  console.log(bold(cyan('  🧪 NUX MG-30 CLI - TESTE GUIADO E INTERATIVO DE FUNCIONALIDADE')));
  console.log(bold(cyan('========================================================================')));
  console.log(gray(' Este script executará cada comando da CLI e solicitará a sua validação.'));
  console.log(gray(' Ao final, um relatório completo em formato JSON será salvo em disco.\n'));
  console.log(` Total de testes mapeados: ${bold(String(TEST_CASES.length))}\n`);

  const results: TestResult[] = [];
  let currentCategory = '';

  for (let i = 0; i < TEST_CASES.length; i++) {
    const test = TEST_CASES[i];

    if (test.category !== currentCategory) {
      currentCategory = test.category;
      console.log('\n' + bold(yellow(`------------------------------------------------------------------------`)));
      console.log(bold(yellow(` 📂 CATEGORIA: ${currentCategory.toUpperCase()}`)));
      console.log(bold(yellow(`------------------------------------------------------------------------`)));
    }

    const fullCommandStr = `nux ${test.args.join(' ')}`;
    console.log(`\n[${i + 1}/${TEST_CASES.length}] ${bold(cyan(test.name))}`);
    console.log(`   ${gray('Descrição:')} ${test.description}`);
    console.log(`   ${gray('Comando:')}   ${bold(fullCommandStr)}`);

    const action = await askQuestion(`\n   👉 Pressione ${bold('[ENTER]')} para executar o comando | ${bold('[S]')} para pular | ${bold('[Q]')} para sair: `);
    const actionClean = action.trim().toLowerCase();

    if (actionClean === 'q') {
      console.log(yellow('\n⚠️ Testes encerrados antecipadamente pelo usuário. Salvando progresso...'));
      break;
    }

    if (actionClean === 's') {
      console.log(gray('   ⏭️ Teste pulado.'));
      results.push({
        id: test.id,
        category: test.category,
        name: test.name,
        description: test.description,
        command: fullCommandStr,
        output: '',
        errorOutput: '',
        status: 'SKIP',
        notes: 'Pulado pelo usuário',
        timestamp: new Date().toISOString()
      });
      continue;
    }

    console.log(gray('\n   ⏳ Executando comando na CLI...'));
    const execResult = executeCliCommand(test.args);

    console.log(cyan('   --- SAÍDA DA CLI ---'));
    if (execResult.stdout.trim()) {
      console.log(execResult.stdout.trim());
    }
    if (execResult.stderr.trim()) {
      console.log(red(execResult.stderr.trim()));
    }
    console.log(cyan('   ---------------------'));

    const feedback = await askQuestion(`\n   ❓ A alteração/comando funcionou no dispositivo/CLI? [${green('s')}=Sim / ${red('n')}=Não / ${yellow('p')}=Pular]: `);
    const ans = feedback.trim().toLowerCase();

    let status: 'PASS' | 'FAIL' | 'SKIP' = 'FAIL';
    if (ans === 's' || ans === 'sim' || ans === 'y' || ans === 'yes') {
      status = 'PASS';
      console.log(green('   ✅ Marcado como: FUNCIONOU (PASS)'));
    } else if (ans === 'p' || ans === 'pular') {
      status = 'SKIP';
      console.log(yellow('   ⏭️ Marcado como: PULADO (SKIP)'));
    } else {
      status = 'FAIL';
      console.log(red('   ❌ Marcado como: NÃO FUNCIONOU (FAIL)'));
    }

    const notesInput = await askQuestion(`   💬 Detalhes / observações (opcional, pressione Enter para pular): `);

    results.push({
      id: test.id,
      category: test.category,
      name: test.name,
      description: test.description,
      command: fullCommandStr,
      output: execResult.stdout.trim(),
      errorOutput: execResult.stderr.trim(),
      status,
      notes: notesInput.trim(),
      timestamp: new Date().toISOString()
    });
  }

  // Estatísticas
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;
  const totalExecuted = passed + failed;
  const passRate = totalExecuted > 0 ? `${((passed / totalExecuted) * 100).toFixed(1)}%` : '0%';

  const now = new Date();
  const timestampStr = now.toISOString().replace(/[:.]/g, '-');
  const reportFileName = `nux-test-results.json`;
  const archiveFileName = `nux-test-results-${timestampStr}.json`;

  const finalPayload = {
    summary: {
      date: now.toISOString(),
      totalMapped: TEST_CASES.length,
      totalExecuted: results.length,
      passed,
      failed,
      skipped,
      passRate
    },
    results
  };

  fs.writeFileSync(reportFileName, JSON.stringify(finalPayload, null, 2), 'utf-8');
  fs.writeFileSync(archiveFileName, JSON.stringify(finalPayload, null, 2), 'utf-8');

  console.log('\n' + bold(cyan('========================================================================')));
  console.log(bold(cyan('  📊 RESUMO FINAL DOS TESTES DA CLI NUX MG-30')));
  console.log(bold(cyan('========================================================================')));
  console.log(`  Total Mapeado : ${TEST_CASES.length}`);
  console.log(`  Total Testado : ${results.length}`);
  console.log(`  ${green('🟢 PASSOU')}       : ${passed}`);
  console.log(`  ${red('🔴 FALHOU')}       : ${failed}`);
  console.log(`  ${yellow('🟡 PULOU')}        : ${skipped}`);
  console.log(`  Taxa de Sucesso: ${bold(passRate)}`);
  console.log(bold(cyan('========================================================================')));
  console.log(`\n💾 Relatório salvo em: ${bold(reportFileName)}`);
  console.log(`💾 Backup salvo em:    ${bold(archiveFileName)}\n`);

  // Limpeza de arquivos temporários criados pelos testes
  const tempFiles = [
    'test-preset-export.json',
    'test-export-top.json',
    'test-bank-top.json',
    'exp-cmd.json',
    'exp-bank.json'
  ];
  for (const file of tempFiles) {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        // Ignora erro de limpeza
      }
    }
  }

  rl.close();
}

runGuidedTests().catch(err => {
  console.error(red('Erro ao executar o teste guiado:'), err);
  rl.close();
  process.exit(1);
});
