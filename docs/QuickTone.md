# QuickTone 2.6.7.16 e implementação do protocolo

A investigação usa o PE x86 distribuído em `refs/NUX_QuickTone_V2.6.7.16_Windows.zip`, analisado por REA/Ghidra e disassembly. A identidade do arquivo e o ambiente estão em [ReverseEngineering.md](ReverseEngineering.md). O arquivo [protocol.md](protocol.md) é uma referência histórica; correções derivadas do binário estão abaixo.

| Operação implementada | Frame / interpretação |
| --- | --- |
| Estado | `15 00`; resposta `15 02`, preset no payload[0], cena no payload[3] |
| Cena salva | `0B 00`, preset e cena explícitos |
| Buffer corrente | `0C 00`, cena explícita |
| Persistir cena | `0B 01`, preset + cena + 213 bytes empacotados; 222 bytes no frame |
| Editar cena | `0C 01`, mesmo tamanho; não recarrega o preset |
| Confirmação | Comando correspondente com operação `03`, seguido de leitura e comparação |
| Cadeia | `0D 00` / `0D 01`; 12 IDs e um byte de configuração preservado |
| Selecionar preset | Program Change, seguido de consulta de estado |
| Selecionar cena | Consulta `0F 00`; CC indicado no mapa Custom MIDI[80], valor 0/1/2; confirma via `15 00` |
| Informações | Query de 5 bytes `F0 43 58 00 F7`; resposta de 45 bytes, serial[4:36], firmware[36:44] |

Índices acima se referem ao payload depois dos seis bytes de cabeçalho, exceto os offsets da resposta de informações, que se referem ao frame inteiro. Os demais campos da resposta de estado continuam opacos.

A função `0x4a5f30` lê cinco bytes da resposta de estado e chama `0x4b2000` com o quarto: este seleciona o buffer de cena. `0x4b2180` devolve o preset e `0x4b21a0` a cena. As rotinas de UI em `0x5b1268..0x5b13ae` usam o controle configurado no offset 80 do mapa MIDI para selecionar cenas.

O setter `0x4a6ac0` monta frames `0C 01`, empacota corpos de 142 bytes e envia as cenas. O setter `0x4a7130` faz o equivalente em `0B 01`; seu callback `0x4a72f0` reconhece `0B 03`. O callback de tempo `0x4a79b0` encaminha três campos para `0x4b2950`, que escreve os offsets 91, 92 e 90 do corpo: isso refuta a interpretação antiga de `03` como bloco/parâmetro/valor.

A operação `15 01` recebe dois argumentos, mas não há base para chamar o segundo de cena: seu callback atualiza os campos de estado 0 e 1. A CLI não a usa para selecionar cenas. Também não usa `07` como toggle genérico, nem presume que `0E` seja heartbeat. `ping` mede uma resposta real de estado.

Os relatórios individuais do Antigravity contêm hipóteses que não foram todas confirmadas. Os resultados foram revisados contra as instruções e callbacks; o material bruto permanece em `analysis/quicktone-2.6.7.16/`. Os testes normais excluem os testes antigos de investigação, que reproduziam bugs anteriores à correção.

Os testes com dispositivo virtual verificam a lógica do cliente, frames, persistência de três cenas, preservação de bytes, fila, timeouts e erros parciais. Ainda é necessário confrontar essas operações com capturas de uma MG-30 física e seu firmware. Não foram implementados upload de amostras IR, atualização de firmware, reboot, configurações globais ou leitura/gravação do formato nativo `.mg30patch`.
