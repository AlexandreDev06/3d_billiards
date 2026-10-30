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
| `apps/sala` | sala online: um núcleo e duas entradas (Node + `ws` com ngrok; Worker com Durable Object na Cloudflare); variáveis e deploy | Backend | `apps/sala/CLAUDE.md` |
| `apps/portal` | portal `becogames.app`: site estático (Worker só de assets) com a página inicial, privacidade, termos, ads.txt e CSP | Frontend | `apps/portal/CLAUDE.md` |
| `apps/conta` | Banco da Beco Games: contas, sessões e moedas comuns a todos os jogos (Worker `becogames-conta` + Durable Object SQLite); sem `@sinuca/*` e sem `node:*` em produção | Backend | `apps/conta/CLAUDE.md` |
| `apps/web` | cliente three.js, HUD, áudio, lobby, cliente online; atalhos do jogo | Frontend | `apps/web/CLAUDE.md` |

Quem criar, mover ou renomear estrutura atualiza o `CLAUDE.md` da pasta mexida e `docs/decisoes.md` na mesma tarefa.

Alvo (ainda não existe): `e2e/` e `testes/cenarios/` (QA).

## Comandos

pnpm 12 via corepack (`corepack enable pnpm --install-directory ~/.local/bin`). Na raiz:

```text
pnpm i            instala tudo
pnpm dev          Vite em http://localhost:5173 (proxy de `/sala`: suba a sala com `pnpm --filter @sinuca/sala dev`)
pnpm build        typecheck + build do apps/web
pnpm test         Vitest (packages/*/src e apps/*/src, arquivos *.test.ts)
pnpm typecheck    tsc em cada pacote
pnpm lint         ESLint; em packages/fisica bloqueia import de three/@sinuca/* e Math.random; em packages/regras, só `import type` de @sinuca/fisica; em packages/protocolo, só `import type` de fisica e regras; em apps/sala, só `import type` de fisica (não re-simula) e de `@sinuca/conta` (contrato do Banco; só `banco-local.ts` importa o núcleo); em apps/conta, nenhum `@sinuca/*` nem `node:*` fora dos testes; em packages/personagens, nenhum `@sinuca/*` e, fora de `src/three/`, nem `three`
pnpm online       build do apps/web + sala: cliente e WebSocket /sala em http://127.0.0.1:8001 (mesma porta)
pnpm --filter @sinuca/sala dev   só a sala (tsx watch), para o Vite fazer proxy de /sala
```

## Repositório

Git desde 2026-10-26 (commit-base `b8ce47c`; remote `origin` no GitHub, branch `main`). Use-o para se organizar: `git status` e `git diff --stat` mostram o que mudou desde a linha de base do lote (o índice, `git add -A` ao aprovar); `git log` e `git show <commit>:<arquivo>` dão o histórico e o estado anterior. A árvore é compartilhada e outros subagentes têm mudanças não commitadas: nunca `git reset --hard`, `checkout .`, `clean` nem `stash`; para desfazer algo seu, reverta só os seus arquivos. Commit e push: regra abaixo.

## Regras invioláveis (valem em TODO prompt)

- **Física:** nunca motor genérico (Rapier, cannon-es, Ammo, Havok, Jolt). Nunca copiar código do tailuge/billiards (GPL-3.0); só comparar comportamento.
- **Pureza:** `packages/fisica` e `packages/regras` sem DOM, sem `three`, sem rede, sem `Math.random` direto (RNG semeado injetado). Passo de física fixo, nunca o `dt` do quadro de tela.
- **Regras são dados:** nenhuma regra de casa hardcoded fora do preset JSON + config.
- **Medidas num lugar só:** dimensões de mesa, bolas e caçapas vêm de `packages/fisica`; a geometria 3D importa de lá.
- **Online:** a gravação transmitida é a verdade; nunca depender de dois clientes simularem igual.
- **Sem linha de mira**, exceto a linha de previsão de teste do painel dev (pedido do usuário, `docs/decisoes.md`).
- **Fronteiras:** cada pasta tem um dono (`docs/decisoes.md`). Mudança de contrato (tipos exportados por `packages/*`) passa pelo Principal.
- **Commits (autorização permanente do usuário em 2026-10-30):** o Principal commita e dá `git push origin main` sem perguntar, depois de aprovar um lote (ou de publicá-lo), só com o que está no índice, conferido antes que não entra `.env*`, `.dev.vars`, `.wrangler/`, `.outros/no-ar/` nem cópia de carteira. Formato: `<tipo>(<escopo>): <descrição curta em inglês>`, só a primeira linha (tipos: feat, fix, refactor, chore, test, docs). Subagente nunca commita nem dá push.
- **Deploy (autorização permanente do usuário em 2026-10-30):** o Principal publica sem perguntar a sinuca, o portal e o Banco (`wrangler deploy` a partir de uma cópia do índice em `.outros/no-ar/`), sempre com 0 salas em `/admin/uso` e as carteiras copiadas antes. Continuam só a pedido do usuário: wipe ou migração de carteiras, `wrangler secret`, trocar variáveis de jogo (como o presente de teste) e mexer na conta Cloudflare (domínios, DNS, regras). Subagente nunca publica.
- **Segredos:** nunca commitar `.env*`, `.dev.vars` ou tokens; nunca imprimir nem colar segredo (nem em nota do Maestri).
- **Assets:** só CC0, Pixabay ou CC-BY (fontes também SIL OFL 1.1, liberada pelo usuário em 2026-10-29), com crédito em `docs/creditos.md`.
- **Código:** identificadores do domínio em português sem acento (`bola`, `tacada`, `cacapa`, `castigo`); TSDoc só na API pública dos pacotes; sem comentário que repete o código.

## Time multiagente (subagentes)

O jogo é desenvolvido por um time de papéis: Principal (este chat, só planeja/despacha/revisa), Brainstormer, Dev, Frontend, Backend, QA, Artista e Revisor, cada um um subagente do Claude Code com prompt de lote em `.outros/prompts/` e status em `.outros/status.md`. Carregue `sinuca-maestri-time` para orquestrar, ou ao ser despachado sob um papel. O fluxo com terminais do Maestri está parado (licença travada desde 2026-10-12) e descrito em `maestri.md` da mesma skill.

**Modelo por tarefa (economia de tokens, pedido do usuário em 2026-10-14).** Opus só para o Principal (este chat) e o Revisor (Juiz). Todo o resto, inclusive o Dev da física e das regras e o Brainstormer, sobe com Sonnet. Busca e coleta de dados (Explore) vão com Haiku. Subagente do Claude Code (ferramenta Agent) **sempre** com `model` e `effort` explícitos: `model` omitido herda o Opus do Principal, e foi esse o desperdício; `effort` omitido cai no `xhigh` do `modelSettings` global. **Esforço por tarefa (pedido do usuário em 2026-10-28):** `low` para busca pontual e ajuste mecânico, `medium` para lote bem especificado (padrão), `high` para física, contrato, segurança e bug sem causa, `xhigh` só no Artista e na varredura de fase do Juiz, `max` só a pedido; tabela em "Esforço por tarefa" de `sinuca-maestri-time`. Revisão do Juiz só em lote de risco (física, contrato, segurança); ajuste pequeno não passa por ela. Nunca `/effort` no terminal: ele grava o nível como padrão global do usuário. (Esforço por terminal do Maestri: `time.sh despachar --esforco` e `time.sh esforco`, em `maestri.md`.)

## Quando carregar cada skill

| Situação | Skill |
| --- | --- |
| Orquestrar o time: despachar lote, revisar, economizar tokens, reiniciar a sala; ou descobrir o protocolo do seu papel | `sinuca-maestri-time` |
| Mexer em `packages/fisica`, ajustar sensação/parâmetros, escrever ou revisar teste de física | `sinuca-fisica` |
| Mexer em `packages/regras`, presets, tela "Regras da casa", ou testar/revisar uma regra | `sinuca-regras` |
| Antes de dizer "pronto" ou reportar um lote | `sinuca-fechando-tarefa` |

Globais úteis: `superpowers:test-driven-development` (pacotes), `superpowers:systematic-debugging` (bug), `e2e-testing` e `chrome-devtools-mcp:chrome-devtools` (QA), `performance-optimizer` (FPS), `cost-tracking` (fechar fase).
