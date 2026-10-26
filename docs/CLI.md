# CLI da NUX MG-30

Requer Node.js 20+, MIDI nativo e MG-30 ligada por USB para comandos de hardware. No Nix, execute `nix-shell` para disponibilizar ALSA ao módulo MIDI. A ajuda e os catálogos locais funcionam sem abrir portas MIDI.

```bash
npm ci
npm run build
node dist/cli.js --help
npm run nux -- ports
# Opcional: disponibilizar o comando nux globalmente
npm run install:cli
```

Cada comando conecta, consulta o aparelho e fecha suas portas ao terminar. Não existe sessão em segundo plano nem cache de estado. Códigos de saída: 0 para conclusão, 1 para argumentos inválidos, timeout ou falha de operação.

## Conexão e diagnóstico

```bash
nux ports                      # Lista índices e nomes sem conectar ao aparelho
nux --input 1 --output 1 status
nux --timeout 5000 --json ping  # Tempo de ida/volta real
nux doctor                     # Estado, portas e ambiente Node
nux info
nux connect                    # Abre, sincroniza e fecha
nux disconnect                 # Explica o ciclo por comando
nux sync                       # As três cenas correntes
nux dump --scene 2             # Payload bruto de uma cena
nux logs                       # MIDI recebido/enviado até Ctrl+C
nux device info
nux device firmware
```

`--input` e `--output` aceitam nome ou índice. Não há fallback para uma porta de outro equipamento; nomes ambíguos precisam de seleção explícita. `--json` produz saída de dados em JSON e erros em JSON no stderr. O comando `device reboot` retorna erro, pois não existe uma operação comprovada implementada para isso.

## Presets e persistência

Slots `01A` a `32D`, ou índices numéricos de 0 a 127. Cenas são numeradas de 1 a 3.

```bash
nux preset list --from 01A --limit 8
nux preset show 01A             # As três cenas salvas
nux preset load 02B             # Recall e confirmação de estado
nux preset up
nux preset down
nux preset save                 # Salva as três cenas correntes no slot ativo
nux preset save 03A             # Salva as três cenas em outro slot
nux preset rename 03A "Meu Som" # Recall, nome nas três cenas e persistência
nux preset clone 01A 02A        # Copia todas as cenas salvas sem recall
nux preset delete 02A           # Bypass dos efeitos, preserva parâmetros e VOL
nux preset delete 02A --keep-amp-cab
```

`delete` não reproduz um preset de fábrica: salva um estado de bypass nas três cenas. `preset rename`, `preset load` e `preset delete` podem fazer recall e substituir edições ainda não salvas no buffer corrente.

Edições comuns modificam o buffer corrente por `0C`; não persistem automaticamente. `--save` nos comandos abaixo salva **as três cenas correntes**, inclusive outras edições já existentes. As transferências enviam as três cenas completas antes da leitura de volta; no firmware v6.0.5, uma cena isolada recebe ACK mas não aplica a edição. Sucesso exige comparar todos os corpos. Uma falha pode ocorrer depois de uma cena já ter sido salva.

## Cenas, efeitos e parâmetros

```bash
nux scene list
nux scene show 2
nux scene select 2              # Usa o mapa Custom MIDI do aparelho
nux scene up
nux scene down
nux scene clone 1 3 --save      # Corpo completo: modelos, parâmetros, campos opacos
nux scene reset 2               # Bypass dos efeitos, preserva VOL e parâmetros
nux block list                 # Catálogo local de modelos
nux block AMP                  # Estado real
nux block AMP on
nux block state AMP off --save
nux block show IR
nux block enable AMP
nux block disable AMP
nux block toggle AMP --save
nux block model AMP             # Catálogo local deste bloco
nux block model AMP 6 --save
nux block reset AMP             # Seleciona modelo zero, não inventa defaults
nux block params AMP
nux block get AMP Gain
nux block set AMP Gain 80 --save
nux block min AMP Gain
nux block max AMP Gain
nux param get AMP Gain          # Alias dos comandos de parâmetro
nux param set MOD 2 214 --raw
nux tempo 120 --save
nux tempo
```

Existem 12 blocos físicos: `WAH CMP EFX AMP EQ NG MOD DLY RVB IR SR VOL`. `CAB` é alias de `IR`. Parâmetros comuns aceitam inteiros de 0 a 100; `--raw` aceita um byte de 0 a 255. Nomes de parâmetros/modelos vêm de um catálogo local, cujas legendas podem variar conforme modelo e firmware. Detalhes em [Parameters.md](Parameters.md).

## Cadeia

```bash
nux chain show
nux chain move DLY RVB          # Move DLY imediatamente antes de RVB
nux chain swap AMP IR --save
nux chain reset --save          # Ordem dos IDs de hardware 0..11
```

A ordem tem exatamente os 12 blocos, sem duplicar CAB/IR. O byte de configuração recebido do aparelho é preservado ao reorganizar.

## Exportação, backup e restauração

```bash
nux preset export 01A preset.json
nux preset export 01A preset.syx
nux preset export 01A editado.json --current
nux preset import preset.json --to 02A --dry-run
nux preset import preset.json --to 02A
nux preset backup banco.json
nux preset restore banco.json --dry-run
nux preset restore banco.json
# Aliases
nux export preset 01A preset.json
nux export bank banco.json
nux import preset preset.json --to 02A
nux import bank banco.json
```

O padrão de exportação lê dados salvos. `--current` exige que o slot solicitado seja o ativo e exporta o buffer de edição. Cada preset contém as três cenas; o banco contém 128 presets e 384 cenas. Os bytes opacos são conservados, mas amostras de IR, configurações globais e firmware não estão incluídos.

JSON usa o formato próprio `quicktone-bridge`, versão 1, com SHA-256 por corpo de cena. SysEx `.syx` contém exatamente três frames completos de cena do mesmo preset. Arquivos incompletos, checksums incorretos e outros comandos SysEx são rejeitados. Arquivos nativos `.mg30patch` não são suportados.

A CLI valida o arquivo inteiro antes de conectar. `--dry-run` valida sem MIDI; `--to` vale somente para arquivos de um preset. Exportações usam publicação atômica e não sobrescrevem arquivos existentes sem `--force`. Restaurações param na primeira falha, informando slot e progresso concluído; o dispositivo não oferece rollback do banco.

## Validação desta revisão

`npm test` exercita protocolo, transportes, CLI e dispositivo virtual; `npm run build` produz os binários e tipos. No ambiente Nix, use `nix-shell --run 'npm test'`.

Em 26/10/2026 foram confirmados em uma MG-30 v6.0.5: estado, firmware, leitura das três cenas, backup dos 128 presets, troca de cena e edição temporária de ganho, seguida de restauração byte a byte. Não houve comandos de persistência `0B 01`; gravação permanente/restauração física e outros firmwares continuam pendentes. Evidências estáticas e limites estão em [QuickTone.md](QuickTone.md).
