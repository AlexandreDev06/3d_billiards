**`packages/regras`** — máquina de estados pura das regras (par ou ímpar, mata-mata) e presets JSON. Dono: Dev (`docs/decisoes.md`). Mapa raiz e regras do repo: `CLAUDE.md` da raiz.

## Fronteiras

- `packages/regras` importa de `fisica` só tipos (`import type`), nunca a simulação; sem DOM, `three` nem rede; regras são dados (preset JSON + config), nenhuma regra de casa hardcoded fora deles.
- Lint: em `packages/regras`, só `import type` de `@sinuca/fisica`.
- Mudança de contrato (tipos exportados) passa pelo Principal. Skill `sinuca-regras` ao mexer aqui.
- Quem criar, mover ou renomear arquivo aqui atualiza este arquivo e `docs/decisoes.md` na mesma tarefa.

## Mapa

```text
packages/regras/src/tipos.ts     contrato: ConfigRegras, EstadoPartida, Consequencias
packages/regras/src/partida.ts   novaPartida (1×1, 2×1, 1×2 ou 2×2: a vez alterna as equipes e cada uma reveza os seus; 2×1 = A1, B1, A2, B1; roda.ts interno; testes em equipes.test.ts), aplicarTacada (fatos → faltas → pena → grupos → vez → fim), passarVez (jogador que caiu no online); texto.ts (frase do HUD); testes de duplas em duplas.test.ts
packages/regras/src/leitura.ts   bolasDaCasa, grupoDaBola(bola, config), bolaDeCastigo (a bola final: a 8 no Boteco), nomeDaBolaFinal, rotuloDaFalta, bolasRestantes, objetivo, bolasAlvo (o que o jogador pode tocar primeiro sem falta; `aplicarTacada` decide direta e fora de hora por ela), ROTULO_FALTA, ROTULO_GRUPO, jogadoresDaProxima
packages/regras/src/modalidades.ts L15: `ConfigRegras.modalidade` (`par-ou-impar` | `mata-mata`), `formacoesAceitas(config)` (tamanhos das equipes: par ou ímpar [1,1] [2,1] [1,2] [2,2]; mata-mata [1,1] [1,1,1] [1,1,1,1]; o catálogo de modos da sala e do lobby sai daqui), `rotuloDaFormacao`, `formacaoDosJogadores`, `ROTULO_MODALIDADE`; mata-mata.ts (cada um por si, 15 bolas, a vez sempre passa, 1 ponto por bola, falta sem pena de bola com a branca na marca; L19: `suicidioNoMataMata` (`sem-pena` | `perde-proxima-vez`, ligada no preset do mata-mata; `validarPreset` recusa `perde-proxima-vez` no par ou ímpar) põe quem tirou a branca do jogo (caçapa ou fora da mesa) em `EstadoPartida.perdemAProximaVez` (opcional, índices de `jogadores` crescentes; ausente = ninguém, escrito só quando há alguém; some no fim); L21: `cegarNoMataMata` (mesmos valores, mesma validação, mesmo preset) faz o mesmo com quem cegou (a branca não tocou bola), cada falta com a sua opção e, na mesma tacada, uma entrada só; a roda pula e gasta a pena (em `aplicarTacada` e em `passarVez`, que não pune quem perdeu o tempo) e `vez`/`consequencias.proximo` já saem com o pulo, a frase diz "Suicídio! Ana perde a próxima vez. Branca na marca.", "Cegou! Ana perde a próxima vez." ("Cegou e suicídio! Ana perde a próxima vez. Branca na marca." nas duas) e "Ana perdeu a vez: joga Beto"; fim com a mesa vazia, empate = quem matou por último) e `pontosPorEquipe` em leitura.ts; fatos.ts (fatos da tacada, comum às modalidades)
packages/regras/                 presets/boteco.json (2–14, a 8 final no centro do triângulo) e presets/mata-mata.json (1–15); src/presets.ts (OPCOES_REGRAS, validarPreset: também bola final fora das bolas e grupos desiguais); src/para-testes.ts (apoio dos testes; CASTIGO_1 e SEM_FINAL = as casas de antes)
```
