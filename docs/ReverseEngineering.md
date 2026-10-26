# Ambiente de engenharia reversa do QuickTone

## Ferramentas

O QuickTone fornecido é um PE nativo Windows x86. A análise estática usa
REA 6.7.0 com Ghidra 12.1.2 e OpenJDK 21.0.12 (JDK completo), instalados pelo
Nix. `binutils` fornece `objdump`, `strings`, `nm` e `readelf`; `procps`,
`file` e `unzip` completam os utilitários básicos.

O conjunto está em `~/.local/share/quicktone-rea-toolchain`, um link persistente
para o Nix store. Java, javac, Ghidra, analyzeHeadless, file e unzip estão
acessíveis em `~/.local/bin`. Não foi necessário instalar Hopper ou IDA.
No shell Nix, `alsa-lib` e `LD_LIBRARY_PATH` permitem carregar o módulo MIDI
nativo do Node para testes com mocks, sem comunicar com hardware.

Para preparar outro ambiente Nix com os mesmos tipos de ferramentas:

```sh
nix-shell
bash scripts/rea.sh doctor --provider ghidra --json
```

`shell.nix` usa o nixpkgs local: não fixa a revisão. Antes de atualizar,
confirme que o REA instalado suporta a versão do Ghidra resultante.

No ambiente já instalado, o wrapper funciona diretamente:

```sh
bash scripts/rea.sh doctor --provider ghidra --json
bash scripts/rea.sh search /caminho/QuickTone.exe handleIncomingMidiMessage: --provider ghidra --json
bash scripts/rea.sh function /caminho/QuickTone.exe --procedure=0xENDERECO --provider ghidra --json
```

Use endereços retornados pela análise. Preserve as evidências JSON; não trate
pseudocódigo como código-fonte original. Esses comandos analisam o arquivo;
não executam o QuickTone nem comunicam com a pedaleira.
O wrapper permite até 20 minutos para a análise inicial do Ghidra e usa heap
de até 4 GiB. `REA_GHIDRA_STARTUP_TIMEOUT_MS` e `GHIDRA_HEADLESS_MAXMEM`
permitem escolher outros limites explicitamente.

## Integração com o Codex

A configuração existente em `~/.codex/config.toml` recebeu somente
`GHIDRA_INSTALL_DIR` e `JAVA_HOME` em `[mcp_servers.rea.env]`. O backup anterior
está em `~/.codex/config.toml.before-quicktone-ghidra-20261026`.
O processo MCP já iniciado pode precisar ser reconectado para herdar essas
variáveis. O wrapper permite usar o REA imediatamente pelo terminal.

Referências: [instalação do REA](https://github.com/morluto/rea/blob/main/docs/installation.md)
e [configuração MCP do Codex](https://learn.chatgpt.com/docs/extend/mcp).

## Validação

`analysis/quicktone-2.6.7.16/toolchain-doctor-path.json` registra o diagnóstico
com `healthy: true` para o provedor Ghidra. O diagnóstico geral também inclui
ferramentas opcionais e a ausência do NixOS no instalador automático; isso é
distinto da disponibilidade do provedor.

`toolchain-pe-smoke.json`, no mesmo diretório, registra a análise real de um
PE x86 mínimo contendo `mov eax, 42; ret`: o Ghidra retornou pseudocódigo com
`return 0x2a;`. O executável de teste não foi executado.

## Artefato selecionado

- ZIP: `refs/NUX_QuickTone_V2.6.7.16_Windows.zip`
- SHA-256 ZIP: `95990e1e57079439c89b13e16d19f17c1769ec0c60336b546bc7f43b4ee91f2a`
- Conteúdo extraído pelo REA: `QuickTone.exe`, 190.296.504 bytes, PE x86
- SHA-256 EXE: `0d64728f8f0e013114c228c8e6f9a8f3c648a5f82ff54ff03081c930ebd771d6`

A inspeção inicial está em `analysis/quicktone-2.6.7.16/initial-evidence.json`.
A validação das ferramentas não significa que o protocolo do QuickTone já foi
reconstruído ou que o funcionamento da CLI no hardware esteja comprovado.

## Correções implementadas após revisão

A CLI agora separa buffer corrente (`0C`) e dados persistidos (`0B`), preserva
os 142 bytes de cada cena, confirma gravações por leitura e opera sobre as
três cenas em save, clone, backup e restauração. Estado vem de `15 02`, com
cena no quarto byte do payload; a seleção usa o mapa Custom MIDI consultado
por `0F`. O roteamento usa `0D`, preservando seu byte de configuração.

A revisão semântica e os endereços das rotinas estão em [QuickTone.md](QuickTone.md).
Relatórios de agentes são hipóteses até serem comparados com o binário.
Em particular, interpretações de `03` como parâmetro, `07` como toggle e do
segundo argumento de `15 01` como cena foram rejeitadas.

Testes de integração executam a CLI, o cliente e os arquivos contra um
simulador com buffers salvos/correntes distintos. Isso valida a lógica local;
a compatibilidade física e as diferenças entre firmwares ainda precisam ser
verificadas no aparelho.
