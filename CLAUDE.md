# Sinuca 3D Par ou Ímpar — Guia do Repositório

Jogo de sinuca 3D de boteco ("par ou ímpar") para PC, no navegador, entre amigos: sem linha de mira, tacada pelo mouse, efeito e giz; hot-seat primeiro, online depois.
**Estado (2026-10-22): Fase 0 em andamento.** Hot-seat e online (sala auto-hospedada, `pnpm online`) jogam de ponta a ponta, com par ou ímpar e mata-mata, emojis, carteira, loja de tacos e aposta; falta a varredura da fase.
O que cada parte faz está no `CLAUDE.md` da própria pasta (carregado quando você lê arquivos dela); fases e lotes em `docs/roteiro.md`.

## Fonte da verdade

- `docs/decisoes.md` — decisões fixas, estrutura do repo, **dono de cada pasta** e fronteiras de dependência. Leia antes de qualquer tarefa.
- `docs/roteiro.md` — fases e lotes; o que está feito e o que vem.
- `docs/estudo-viabilidade.md` — estudo congelado. Leia só a seção necessária (`sed -n '/^### 3\./,/^### 4\./p'`), nunca inteiro.
- `docs/design/` — game design (Brainstormer).
- `docs/decisoes-arquivo.md` — registros antigos de decisão (o que saiu de `docs/decisoes.md`); consulte só se precisar da história.
- `.outros/status.md` — status dos lotes recentes; `.outros/status-arquivo.md` — status de lotes antigos.

## Stack

TypeScript strict · Vite · pnpm workspaces · three.js (WebGLRenderer + EffectComposer) · física própria em TS · Vitest · Playwright · servidor Node + `ws` auto-hospedado (L5; mesmo protocolo para migrar a Cloudflare Durable Objects via PartyServer depois).

TypeScript fica em 6.0: o typescript-eslint 8 ainda não aceita o 7.

## Mapa

Cada pasta tem o seu `CLAUDE.md` com o mapa dos arquivos, as fronteiras e o que só interessa a ela.

| Pasta | O que é | Dono | Detalhe |
| --- | --- | --- | --- |
| `packages/fisica` | motor de física puro, medidas, `simularTacada`, `Gravacao` | Dev | `packages/fisica/CLAUDE.md` |
| `packages/regras` | regras puras, modalidades e presets JSON | Dev | `packages/regras/CLAUDE.md` |
| `packages/protocolo` | contrato cliente↔sala, codec da gravação, carteira e aposta | Backend | `packages/protocolo/CLAUDE.md` |
| `packages/personagens` | camada genérica dos personagens (.glb, látex, poses e gestos, contatos); sem nada de sinuca | Frontend | `packages/personagens/CLAUDE.md` |
| `apps/sala` | servidor Node + `ws` da sala online; ngrok e variáveis | Backend | `apps/sala/CLAUDE.md` |
| `apps/web` | cliente three.js, HUD, áudio, lobby, cliente online; atalhos do jogo | Frontend | `apps/web/CLAUDE.md` |

Quem criar, mover ou renomear estrutura atualiza o `CLAUDE.md` da pasta mexida e `docs/decisoes.md` na mesma tarefa.

Alvo (ainda não existe): `e2e/` e `testes/cenarios/` (QA); a sala em Cloudflare Durable Objects (PartyServer), se o auto-hospedado não bastar.

## Comandos

pnpm 12 via corepack (`corepack enable pnpm --install-directory ~/.local/bin`). Na raiz:

```text
pnpm i            instala tudo
pnpm dev          Vite em http://localhost:5173 (proxy de `/sala`: suba a sala com `pnpm --filter @sinuca/sala dev`)
pnpm build        typecheck + build do apps/web
pnpm test         Vitest (packages/*/src e apps/*/src, arquivos *.test.ts)
pnpm typecheck    tsc em cada pacote
pnpm lint         ESLint; em packages/fisica bloqueia import de three/@sinuca/* e Math.random; em packages/regras, só `import type` de @sinuca/fisica; em packages/protocolo, só `import type` de fisica e regras; em apps/sala, só `import type` de fisica (não re-simula); em packages/personagens, nenhum `@sinuca/*` e, fora de `src/three/`, nem `three`
pnpm online       build do apps/web + sala: cliente e WebSocket /sala em http://127.0.0.1:8001 (mesma porta)
pnpm --filter @sinuca/sala dev   só a sala (tsx watch), para o Vite fazer proxy de /sala
```

## Regras invioláveis (valem em TODO prompt)

- **Física:** nunca motor genérico (Rapier, cannon-es, Ammo, Havok, Jolt). Nunca copiar código do tailuge/billiards (GPL-3.0); só comparar comportamento.
- **Pureza:** `packages/fisica` e `packages/regras` sem DOM, sem `three`, sem rede, sem `Math.random` direto (RNG semeado injetado). Passo de física fixo, nunca o `dt` do quadro de tela.
- **Regras são dados:** nenhuma regra de casa hardcoded fora do preset JSON + config.
- **Medidas num lugar só:** dimensões de mesa, bolas e caçapas vêm de `packages/fisica`; a geometria 3D importa de lá.
- **Online:** a gravação transmitida é a verdade; nunca depender de dois clientes simularem igual.
- **Sem linha de mira**, exceto a linha de previsão de teste do painel dev (pedido do usuário, `docs/decisoes.md`).
- **Fronteiras:** cada pasta tem um dono (`docs/decisoes.md`). Mudança de contrato (tipos exportados por `packages/*`) passa pelo Principal.
- **Commits:** NUNCA commite automaticamente. `git commit`/`git push` só quando o usuário pedir explicitamente ("commita", "sobe isso"); implementar ou aprovar plano não autoriza. Quando autorizado: `<tipo>(<escopo>): <descrição curta em inglês>`, só a primeira linha (tipos: feat, fix, refactor, chore, test, docs).
- **Deploy e segredos:** `wrangler deploy` e conta Cloudflare só com pedido do usuário. Nunca commitar `.env*`, `.dev.vars` ou tokens; nunca colar segredo em nota do Maestri.
- **Assets:** só CC0, Pixabay ou CC-BY com crédito em `docs/creditos.md`.
- **Código:** identificadores do domínio em português sem acento (`bola`, `tacada`, `cacapa`, `castigo`); TSDoc só na API pública dos pacotes; sem comentário que repete o código.

## Time multiagente (Maestri)

O jogo é desenvolvido por um time no Maestri: Principal (este chat, só planeja/despacha/revisa), Brainstormer, Dev, Frontend, Backend, QA e Revisor. Carregue `sinuca-maestri-time` para orquestrar, ou ao rodar sob um role `Sinuca *`. Recrutas rodam em `.maestri/roles/<id>/`: se as skills `sinuca-*` não aparecerem na sua lista, leia o `SKILL.md` direto em `.claude/skills/<nome>/` da raiz do projeto.

**Modelo por tarefa (economia de tokens, pedido do usuário em 2026-10-14).** Opus só para o Principal (este chat) e o Revisor (Juiz). Todo o resto, inclusive o Dev da física e das regras e o Brainstormer, sobe com Sonnet. Busca e coleta de dados (Explore) vão com Haiku. Subagente do Claude Code (ferramenta Agent) **sempre** com `model` explícito: omitido, ele herda o Opus do Principal, e foi esse o desperdício. Revisão do Juiz só em lote de risco (física, contrato, segurança); ajuste pequeno não passa por ela. Esforço: todo recruta sobe com `--effort high` (`time.sh`); lote difícil (física, malha de personagem) passa a `xhigh` com `time.sh esforco <papel> xhigh` e volta com `time.sh religar <papel>`. Nunca `/effort` no terminal: ele grava o nível como padrão global do usuário.

## Quando carregar cada skill

| Situação | Skill |
| --- | --- |
| Orquestrar o time: montar/retomar terminais, despachar lote, revisar, economizar tokens; ou descobrir o protocolo do seu papel | `sinuca-maestri-time` |
| Mexer em `packages/fisica`, ajustar sensação/parâmetros, escrever ou revisar teste de física | `sinuca-fisica` |
| Mexer em `packages/regras`, presets, tela "Regras da casa", ou testar/revisar uma regra | `sinuca-regras` |
| Antes de dizer "pronto" ou reportar um lote | `sinuca-fechando-tarefa` |

Globais úteis: `superpowers:test-driven-development` (pacotes), `superpowers:systematic-debugging` (bug), `e2e-testing` e `maestri-portal` (QA), `performance-optimizer` (FPS), `cost-tracking` (fechar fase).
