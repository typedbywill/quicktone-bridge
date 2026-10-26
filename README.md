# NUX CLI / quicktone-bridge

CLI e biblioteca TypeScript para a NUX MG-30 por USB MIDI. Permite consultar o aparelho, editar cenas, salvar presets e exportar/restaurar as três cenas de cada preset.

A implementação foi revisada com análise estática do QuickTone 2.6.7.16, testes simulados e testes físicos em uma MG-30 com firmware v6.0.5. No aparelho foram confirmados estado, firmware, leituras, backup completo, troca de cena e edição temporária com restauração. Save e renomeação persistente também foram confirmados no slot autorizado 08C. Restauração de banco/importação no aparelho e outros firmwares ainda não foram validados.

Requer Node.js 20 ou superior e o suporte MIDI nativo do sistema. No Linux, o módulo `@julusian/midi` precisa da biblioteca ALSA.

```bash
npm ci
npm run build
node dist/cli.js --help
# Instalação local global opcional:
npm run install:cli
```

No ambiente Nix deste repositório:

```bash
nix-shell
npm test
npm run nux -- ports
npm run nux -- doctor
```

Cada comando abre e fecha sua conexão MIDI. O estado é consultado no aparelho; a CLI não usa o antigo cache do diretório pessoal. `ports` lista as portas sem abrir uma sessão com a pedaleira. Se houver nomes ambíguos, selecione os índices explicitamente:

```bash
nux ports
nux --input 1 --output 1 --timeout 5000 --json status
nux ping
nux sync
```

As edições de bloco, modelo, parâmetros, tempo e cena afetam o buffer corrente. Use `--save` nos comandos de edição ou `preset save` para persistir todas as três cenas. Cada gravação aguarda confirmação e compara os dados lidos de volta; uma falha produz código de saída 1 e não informa sucesso.

```bash
nux block get AMP Gain
nux block set AMP Gain 80
nux block model AMP 6 --save
nux scene select 2
nux scene clone 1 3 --save
nux tempo 120 --save
nux preset save
nux preset clone 01A 02A
nux chain show
```

Um backup contém os 128 presets salvos, com 384 cenas completas e os bytes ainda sem interpretação conhecida. Amostras de IR e configurações globais não fazem parte desse arquivo. Exportação de preset aceita JSON próprio ou três frames SysEx (`.syx`); não há suporte ao formato nativo `.mg30patch` do QuickTone. Arquivos antigos que só contêm parte de uma cena são rejeitados.

```bash
nux preset export 01A meu-preset.json
nux preset export 01A buffer-atual.syx --current
nux preset import meu-preset.json --to 02A --dry-run
nux preset import meu-preset.json --to 02A
nux preset backup banco.json
nux preset restore banco.json --dry-run
nux preset restore banco.json
```

Exportações não sobrescrevem arquivos existentes sem `--force`. A restauração valida o arquivo inteiro antes de abrir MIDI; uma falha no meio interrompe a operação e identifica onde parou. As cenas já gravadas permanecem gravadas: não há transação atômica do banco no dispositivo.

Documentação: [comandos](docs/CLI.md), [parâmetros](docs/Parameters.md), [protocolo e evidências](docs/QuickTone.md), [ambiente REA](docs/ReverseEngineering.md).

Uso da biblioteca:

```typescript
import { NuxMG30Client } from 'quicktone-bridge';

const client = new NuxMG30Client();
try {
  await client.connect();
  await client.loadPreset('02B');
  await client.selectSceneVerified(2);
  await client.setBlockState('AMP', true);
  await client.setParameter('AMP', 0, 85);
  await client.savePatch();
} finally {
  await client.disconnect();
}
```

`setPreset()` e `selectScene()` são APIs antigas sem confirmação. Prefira as variantes assíncronas acima. Serialização de pedidos e edições evita sobreposição de respostas; não faça mudanças de preset/cena em paralelo com uma edição ou restauração.

[MIT License](LICENSE).
