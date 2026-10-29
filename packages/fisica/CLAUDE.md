**`packages/fisica`** — motor de física puro em TypeScript (medidas da mesa, bolas e taco, `simularTacada`, `Gravacao`). Dono: Dev (`docs/decisoes.md`). Mapa raiz e regras do repo: `CLAUDE.md` da raiz.

## Fronteiras

- `packages/fisica` não importa nenhum outro pacote, nem `three`, DOM ou rede; sem `Math.random` (RNG semeado injetado); passo de física fixo, nunca o `dt` do quadro de tela.
- Lint: em `packages/fisica` bloqueia import de `three`/`@sinuca/*` e `Math.random`.
- Mudança de contrato (tipos exportados) passa pelo Principal. Skill `sinuca-fisica` ao mexer aqui.
- Quem criar, mover ou renomear arquivo aqui atualiza este arquivo e `docs/decisoes.md` na mesma tarefa.

## Mapa

```text
packages/fisica/src/medidas.ts   medidas de mesa, bolas, taco (bocas 8,5/9,5 cm, raioQuina, fundoCanto/fundoMeio = a caçapa funda do L15: a bola cai ao entrar em `Cacapa.queda`, 1 diâmetro atrás da boca no canto e ¾ no meio); cacapas(), tabelas(), pontasTabela() (ponta arredondada e face de cada quina), pontoDeSaida()
packages/fisica/src/tipos.ts     contrato: EstadoMesa, ParametrosTacada, EventoTacada (`bola-tabela` traz `parte`: `nariz` = trecho reto de `tabelas()`, `boca` = face da garganta ou ponta arredondada, L31b), Gravacao, ConfigFisica, Rng
packages/fisica/src/simulacao.ts simularTacada: passo fixo, amostras a 60 Hz, evento parou
packages/fisica/src/motor.ts     estados da bola, choques bola-bola (em série ou em grupo na janela)/tabela (nariz = `parte` nariz; ponta arredondada e face da quina = `parte` boca), caçapas (interno)
packages/fisica/src/taco.ts      golpeDoTaco: v e ω iniciais, squirt, miscue (interno); o lateral do mini-bolão chega ao contato × fatorEfeitoLateral (0,6), o miscue segue o mini-bolão
packages/fisica/src/lugares.ts   lugares(), posicaoLivre(), mesaInicial() (15 cheio; 14 sem o centro; 13 sem as pontas da base), bolaParada()
packages/fisica/src/             tabela-parte.test.ts (L31b: nariz × boca, varredura de tacadas), config.ts (CONFIG_FISICA_PADRAO), rng.ts, triangulo.ts, gravacao.ts (gravacaoDeTeste)
```
