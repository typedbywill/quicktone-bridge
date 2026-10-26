# Parâmetros, modelos e estado dos blocos

A edição usa leitura, alteração e gravação do **buffer corrente**, sem salvar implicitamente o preset:

1. Consulta estado real (`15 00`) e cena corrente (`0C 00`).
2. Desempacota os 213 bytes em um corpo de 142 bytes.
3. Modifica somente o byte necessário, preservando os demais.
4. Envia `0C 01`, aguarda `0C 03` e lê novamente a cena para comparar o corpo inteiro.

`preset save` lê as três cenas correntes, grava cada cena salva com `0B 01` (222 bytes por frame), aguarda `0B 03` e verifica via `0B 00`. `--save` solicita essa persistência depois da edição.

```bash
nux block params AMP
nux block get AMP Gain
nux block set AMP Gain 80
nux block model AMP 6 --save
nux block toggle AMP --save
nux param set MOD 2 214 --raw
```

Valores comuns são inteiros de 0 a 100; valores inválidos são rejeitados, sem truncamento. `--raw` permite gravar um byte de 0 a 255. Alguns parâmetros usam codificações compostas: alterar um byte bruto não equivale necessariamente a definir uma grandeza física inteira.

Os nomes do catálogo dependem do modelo e não são metadados consultados no dispositivo. Índices são baseados em zero. Nomes desconhecidos ou ambíguos produzem erro; não há escolha silenciosa de AMP/Gain.

| Bloco | Índices de slots no corpo |
| --- | --- |
| WAH | 0–1 |
| CMP | 0–3 |
| EFX | 0–5 |
| AMP | 0–7 |
| EQ | 0–11 |
| NG | 0–3 |
| MOD | 0–5 |
| DLY | 0–7 |
| RVB | 0–3 |
| IR / CAB | 0–5 |
| SR | 0–2 |
| VOL | 0–1 |

`CAB` é alias de `IR`, ID 9; existem 12 blocos físicos. O catálogo externo Custom MIDI também descreve um controle de volume adicional, mas ele não é um terceiro slot VOL nessa estrutura. Sua edição por esta API é rejeitada enquanto seu mapeamento não estiver comprovado.

Os modelos ocupam os primeiros 12 bytes; o bit `0x40` significa desligado. O comando `03` é relacionado a tempo, não uma operação genérica de seleção de modelo. A CLI não envia um CC de parâmetro como tentativa adicional: o mapa Custom MIDI pode ser remapeado.

Leituras falhadas produzem erro. Não há fallback para dados locais apresentados como estado atual.
