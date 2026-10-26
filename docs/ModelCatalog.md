# Modelos e parâmetros: correção a partir do QuickTone 2.6.7.16

O catálogo anterior continha IDs incorretos e não deveria ter sido tratado como confirmação do modelo enviado ao aparelho. O teste de timbre revelou o problema: AMP8 aparecia na CLI como Plexi, mas o QuickTone mostrava Class A15. A inspeção dos recursos numerados do executável confirmou o erro.

O catálogo foi substituído pelos nomes e IDs da família MG-30 encontrados no executável identificado em ReverseEngineering.md. Os trechos e a extração estão em `analysis/quicktone-2.6.7.16/model-catalog-evidence.json` e na pasta `parameter-audit/` (dados locais de investigação). IDs zero correspondem a BYPASS; as tabelas de modelos começam em 1. Não foram inferidos IDs para as entradas USER/COLLECTION sem numeração.

| Bloco | ID real | Nome no QuickTone |
| --- | --- | --- |
| AMP | 5 | TWIN RVB |
| AMP | 8 | CLASS A15 |
| AMP | 10 | PLEXI 100 |
| AMP | 23 | MATCH |
| IR | 5 | TR212 |
| IR | 7 | GB412 |
| EFX | 3 | AC BOOST |
| EFX | 14 | RED FUZZ |
| MOD | 2 | CE-2 |
| MOD | 8 | PHASE 100 |
| MOD | 10 | U-VIBE |
| RVB | 1 | ROOM |

Os JSONs de painéis embutidos no executável contêm `midiCC` para cada controle, permitindo verificar o índice sem adivinhar pela posição visual. Duas variantes MG-30 concordam nos controles relevantes:

- Plexi100: 0Gain, 1Master, 2Bass, 3Middle, 4Treble, 5Presence, 6Bias, 7Level.
- TwinRvb: 0Gain, 1Master, 2Bass, 3Middle, 4Treble, **5Bright (0/1)**, 6Bias, 7Level.
- RedFuzz: 0Gain, 1Tone, 2Output.
- CE-2: 0Rate, 1Depth.
- U-Vibe: 0Speed, 1Volume, 2Intensity.
- Room: 0Decay, 1Tone, 2Level.

A CLI conserva um catálogo genérico de nomes de parâmetros por bloco, não um resolvedor completo por modelo. O índice 5 de AMP, por exemplo, é Presence no Plexi e Bright no Twin. Os ajustes de timbre desta revisão usaram índices numéricos verificados nos JSONs do modelo, inclusive Bright=0 no Twin. Não se deve apresentar todos os nomes genéricos da CLI como rótulos universais.

Os filtros IR também usam escalas não lineares. As tabelas nativas mostram low-cut raw35=78Hz, high-cut raw15=6155Hz e high-cut raw25=7071Hz. Não equivalem a percentuais lineares entre os extremos. O nome do microfone para raw4 e o significado textual da posição1 não foram comprovados; não são apresentados como identificação confirmada.

No slot autorizado 08C/índice30, o timbre foi refeito como JIMI CLEAN: Twin5, TR2125, CE-2 nas cenas1/2, U-Vibe10 na cena3, Room1 e EFX0 em bypass/desligado nas três. Foram confirmados save, recall e leitura dos corpos. A avaliação auditiva pertence ao usuário.

A janela do QuickTone pode continuar exibindo dados antigos após alterações feitas por outra aplicação. A captura somente de leitura nesta sessão mostrou JIMI EXPERIENCE/ClassA15, enquanto as consultas MIDI diretas já retornavam JIMICLEAN/Twin5. A confirmação da CLI deve ser distinguida do cache visual do editor.
