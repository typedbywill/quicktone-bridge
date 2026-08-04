# NUX CLI (`nux`)

Guia de uso da CLI para controlar o **NUX MG-30** via USB MIDI / SysEx.

O binário principal é `nux` (alias: `quicktone-bridge`). Ajuda agrupada:

```bash
nux --help
nux <comando> --help
```

## Requisitos

- Node.js 18+
- NUX MG-30 ligado e conectado por USB
- Porta MIDI do MG-30 disponível no sistema (Windows/macOS/Linux)

## Instalação

### Global (recomendado)

```bash
npm install -g .
# ou, a partir do repo:
npm run install:cli
```

Depois:

```bash
nux --help
```

### Sem instalar globalmente

```bash
# Desenvolvimento (tsx, sem build)
npm run nux -- --help
npm run nux -- ping

# Build local
npm run build
npm start -- --help
```

Remover instalação global:

```bash
npm run uninstall:cli
```

## Conceitos rápidos

### Presets

128 slots, nomeados `01A` … `32D` (32 bancos × canais A–D), ou índice Program Change `0`–`127`.

Aceitos em qualquer comando de preset:

| Forma | Exemplo |
| ----- | ------- |
| Nome | `01A`, `05C`, `32D` |
| Índice | `0`, `4`, `127` |

### Cenas

Cada preset tem 3 cenas: `1`, `2`, `3`. Troca via CC 80.

### Blocos

IDs (case-insensitive): `WAH`, `NG`, `CMP`, `MOD`, `EFX`, `AMP`, `IR`, `EQ`, `SR`, `DLY`, `RVB`, `VOL`, `CAB`.

Parâmetros (knobs) usam faixa **0–100**. Detalhes em [Parameters.md](Parameters.md).

### Estado local

A CLI guarda um cache em `~/.nux-mg30-state.json` (preset atual, cena, ON/OFF de blocos, knobs). Útil para `preset up/down` e `block toggle` sem dump. O hardware continua sendo a fonte da verdade quando o dump SysEx responde.

---

## Status e conexão

```bash
nux ping          # Heartbeat — confirma que o MG-30 responde
nux status        # Status + lista de portas MIDI In/Out
nux info          # Info do cliente / modo CLI
nux connect       # Abre a conexão MIDI (falha se o pedaleiro não estiver presente)
nux disconnect    # Encerra a sessão MIDI
nux sync          # Solicita dump do patch ativo e sincroniza
nux doctor        # Diagnóstico: Node, OS, portas MIDI, conexão
```

Fluxo típico ao ligar o pedaleiro:

```bash
nux doctor
nux ping
nux sync
```

---

## Presets

```bash
nux preset list
nux preset show 01A
nux preset load 01A
nux preset up              # próximo (usa o PC persistido, ou [id] como base)
nux preset down
nux preset save            # salva no slot ativo
nux preset save 02B        # salva no slot indicado
nux preset rename 01A Meu Tone
nux preset clone 01A 02A
nux preset delete 03C      # reseta o slot para baseline limpa
nux preset backup          # JSON com timestamp (dump do preset ativo)
nux preset restore <arquivo>
nux preset export 01A              # → 01A.json
nux preset export 01A meu.json
nux preset import meu.json
```

Exemplos:

```bash
nux preset load 05B
nux preset rename 05B Worship Clean
nux preset clone 05B 06A
```

---

## Cenas

```bash
nux scene list
nux scene show             # cena ativa
nux scene show 2
nux scene 1                # atalhos
nux scene 2
nux scene 3
nux scene select 2
nux scene up               # 1 → 2 → 3 → 1
nux scene down
nux scene clone 1 2        # copia estados de bloco (persistidos) 1 → 2
nux scene reset 3
```

---

## Blocos

### Ligar / desligar

Sintaxe curta ou subcomandos equivalentes:

```bash
nux block AMP              # mostra ON/OFF
nux block AMP on
nux block AMP off
nux block AMP toggle

nux block enable DLY
nux block disable RVB
nux block toggle MOD
nux block state EFX on
```

Sinônimos aceitos em `on`/`off`: `enable`, `1`, `ligado` / `disable`, `0`, `desligado`, etc.

### Listar e inspecionar

```bash
nux block list
nux block show AMP
nux block params           # knobs de todos os blocos
nux block params AMP
```

### Modelo

```bash
nux block model AMP        # lista modelos do catálogo
nux block model AMP 6      # seleciona por ID
nux block model AMP "nome" # por nome (quando existir no catálogo)
nux block reset AMP        # volta ao modelo 0
```

### Parâmetros (knobs)

```bash
nux block get AMP Gain
nux block set AMP Gain 80
nux block min AMP Gain
nux block max AMP Gain
```

Também funciona só com o nome do parâmetro quando ele é único no catálogo:

```bash
nux block set Gain 75
```

Sem argumentos, `nux block get` lista os knobs do **AMP**.

Leitura e escrita usam dump/escrita SysEx da cena (`0C` / `0B`). Ver [Parameters.md](Parameters.md).

---

## Cadeia de sinal

```bash
nux chain show             # ordem atual (do dump, se disponível)
```

`chain reset`, `chain move` e `chain swap` **não são suportados** pelo MG-30 via MIDI — a CLI informa isso explicitamente.

---

## Hardware

```bash
nux device info
```

`device firmware` e `device reboot` **não são suportados** via MIDI neste pedaleiro.

---

## Export / import

Além de `preset export` / `preset import`:

```bash
nux export preset 01A tone.json
nux import preset tone.json
nux export bank bank.json
nux import bank bank.json
```

Os arquivos de preset são JSON com metadados e, quando o dump responde, o campo `dumpHex` (bytes SysEx em hex).

---

## Diagnóstico

```bash
nux doctor                 # ambiente + MIDI + detecção do MG-30
nux dump                   # hex dump do SysEx do patch ativo
nux logs                   # ainda não implementado
nux --version
```

---

## Exemplos de fluxo

### Trocar preset e ajustar amp

```bash
nux connect
nux preset load 02A
nux scene 1
nux block AMP on
nux block model AMP 6
nux block set AMP Gain 72
nux block set AMP Volume 65
nux preset save
```

### Montar um lead rápido na cena 3

```bash
nux scene 3
nux block DLY on
nux block RVB on
nux block set DLY Level 45
nux block set RVB Mix 30
```

### Backup antes de experimentar

```bash
nux preset export 01A backups/01A.json
# … edições …
nux preset import backups/01A.json
```

---

## Limitações conhecidas

| Recurso | Status |
| ------- | ------ |
| Reordenar cadeia (`chain move/swap/reset`) | Não suportado pelo hardware via MIDI |
| Firmware / reboot remoto | Não suportado |
| Logs de comunicação (`nux logs`) | Não implementado |
| Backup/restore completo dos 128 presets | Parcial — hoje captura principalmente o patch ativo |
| CC de knobs via USB | Não atualiza o edit buffer; a CLI usa SysEx `0B` (ver [Parameters.md](Parameters.md)) |

---

## Documentação relacionada

- [QuickTone.md](QuickTone.md) — como a CLI espelha o editor oficial
- [protocol.md](protocol.md) — comandos SysEx
- [ControlChanges.md](ControlChanges.md) — mapa de MIDI CC
- [Parameters.md](Parameters.md) — contrato get/set de parâmetros
