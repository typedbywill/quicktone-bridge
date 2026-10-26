# Teste físico — 26/10/2026

Dispositivo: NUX MG-30, firmware **v6.0.5**, porta ALSA `NUX MG-30:NUX MG-30 MIDI 1 32:0`. Estado inicial: preset 01A, cena 1, nome `AC30 Dotted`.

## Resultado

- Conexão e leitura de estado: confirmadas.
- Ping observado: 2 ms em uma medição, sem pretensão de benchmark.
- Firmware/modelo: `v6.0.5` / `MG-30`.
- Leitura das três cenas correntes e salvas: confirmada.
- Leitura da cadeia e do mapa Custom MIDI: confirmada.
- Backup: 128 presets / 384 cenas em JSON, com validação de checksums.
- Edição temporária via cliente e via CLI compilada: AMP Gain de 20 para 21, leitura confirmou 21; restauração para 20, leitura confirmou 20.
- Seleção de cena 2 e retorno à cena 1: confirmados por consulta de estado.
- As três cenas correntes foram restauradas byte a byte.
- Comparação dos backups anterior/posterior: todos os 128 presets e 384 corpos de cena salvos idênticos.

Não foram enviados comandos de persistência `0B 01`. Save, importação/restauração e clonagem de presets persistidos continuam validados em simulação, sem teste físico de gravação permanente nesta rodada. Também não foram testados upload de IR, atualização de firmware, outros firmwares ou qualidade do áudio.

## Problemas encontrados e corrigidos

1. **Informação do aparelho invertida:** a resposta de 45 bytes traz firmware em `[4:36]` e modelo em `[36:44]`. O campo tratado anteriormente como serial continha `v6.0.5`; nenhum número de série foi inferido.
2. **Consulta cedo demais após troca de cena:** o primeiro `15 02` pode trazer a cena anterior. O cliente repete consultas em intervalos de 20 ms, até confirmar ou esgotar o timeout, sem reenviar o CC.
3. **Transferência incompleta de buffer:** um `0C 01` isolado recebeu ACK, mas não alterou o buffer mesmo após 3 segundos. O envio das três cenas em ordem 0, 1, 2 aplicou a edição. A implementação preserva as três cenas, muda os bytes necessários, transmite o lote completo e só então faz a verificação. Isso também segue a sequência do setter nativo do QuickTone.
4. **ACK final não ecoa necessariamente o índice enviado:** a terceira cena recebeu `0C 03 00 00 01 ...`, com índice zero. O cliente serializa os pedidos e verifica os três corpos, sem exigir que esse campo seja um identificador de transação.

A transferência de presets salvos também segue o lote de três cenas usado pelo QuickTone; sua aplicação no armazenamento físico não foi exercitada nesta sessão.

## Evidências locais

Capturas e scripts estão em `analysis/hardware-2026-10-26/`, ignorado pelo Git para não incluir os presets pessoais no repositório:

- `before-bank.json`, `after-bank.json`: backups completos antes/depois.
- `live-test-first-results.json`: falhas iniciais e tráfego MIDI.
- `live-test-single-scene-results.json`: envio isolado não aplicado após espera.
- `live-test-bulk-ack-results.json`: lote aplicado e peculiaridade do ACK.
- `live-test-results.json`: rodada concluída com edição/restauração e troca de cena.
- `cli-test-results.json`: execução da CLI compilada e comparação dos bancos.
- `final-current-verification.json`: comparação independente dos três corpos correntes.

Após as correções: **132 testes passaram**, TypeScript sem erros e build CJS/ESM/tipos concluído.

## Sessão posterior: preset Hendrix no índice 30 / slot 08C

A pedido do usuário, o slot 08C foi sobrescrito com `JIMI EXPERIENCE`, usando somente comandos da CLI para todas as consultas e alterações MIDI. O preset anterior foi exportado para `analysis/hendrix-preset-30/original-08C.json` antes da edição. O arquivo `commands.json` nesse diretório registra os comandos e resultados.

Foram confirmados fisicamente nesta sessão:

- Seleção de modelos e parâmetros, ativação/desativação de blocos e cadeia.
- Clonagem completa da cena 1 para cenas 2 e 3.
- Persistência das três cenas por `preset save 30`.
- Renomeação das três cenas por `preset rename 30 "JIMI EXPERIENCE"`.
- Exportação do resultado salvo, recall e leitura independente das três cenas.

Cena 1: base de amp britânico com reverb discreto. Cena 2: fuzz. Cena 3: fuzz com vibe. Os modelos selecionados são os IDs do catálogo local AMP8, IR10, EFX3, MOD8, RVB0; as legendas são Plexi 100, Green 412, Fuzz Face, U-Vibe e Room Reverb. A seleção dos IDs e o estado persistido foram verificados; a avaliação auditiva fica com o usuário.

A cadeia revelou uma diferença adicional: o setter `0D 01` devolveu `0D 02` com os 13 bytes da ordem/configuração, sem ACK `0D 03`. O cliente passou a aceitar essa resposta quando a ordem corresponde à solicitada, mantendo a leitura de confirmação. O simulador e a regressão de cadeia agora reproduzem a resposta capturada em `analysis/hendrix-preset-30/chain-midi.jsonl`.

Esta sessão amplia o escopo da validação: save e renomeação persistente foram comprovados no slot autorizado; restauração de banco e importação completa continuam sem exercício físico. A cena 2 ficou ativa ao término.
