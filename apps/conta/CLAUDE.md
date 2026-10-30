# apps/conta — o Banco da Beco Games

Contas, sessões e as moedas comuns a todos os jogos (dono: Backend). Worker `becogames-conta` com um Durable Object `BancoDO` (SQLite) que será a única fonte do saldo. Plano e spec: `docs/superpowers/plans/2026-10-29-conta-beco-games.md` e `docs/superpowers/specs/2026-10-29-conta-beco-games-design.md`. **Estado (L55b):** núcleo (moedas, contas, sessões, recuperação), HTTP (`HttpDaConta`), Worker (`Banco`, `BancoDO`) e contrato (`ApiDoBanco`) prontos e provados no workerd (`wrangler dev --local`). Os ajustes da revisão do Juiz (L55b: `excluir` limitado, baldes no SQLite, teto do `liquidar`, chaves reservadas) estão feitos. Falta o portal chamar (L56) e a sinuca ler o saldo (Parte 2). Nada foi ao ar.

## Mapa

```text
package.json            @sinuca/conta; typecheck (núcleo e worker), dev (wrangler dev --local), types (wrangler types --include-runtime=false); exports "./contrato" e "./nucleo"
tsconfig.json           núcleo e testes (tipos node, só para os testes)
tsconfig.worker.json    src/worker, só com @cloudflare/workers-types (sem node: o typecheck prova que o worker não usa Node)
wrangler.jsonc          becogames-conta, BancoDO (migração v1 new_sqlite_classes), vars, workers_dev; o comentário lista os dois segredos
worker-configuration.d.ts  gerado por `pnpm types` (o Env dos vars e do BANCO); refazer ao mudar o wrangler.jsonc
src/contrato.ts         só tipos; o que os outros Workers importam (`@sinuca/conta/contrato`). Variacao, Lancamento, ErroDeMoeda, ResultadoDeMoeda, SaldoDaConta, ResultadoDeSenha, ContaPublica, ErroDeConta, ComSessao, PedidoDaConta, RespostaDaConta e `ApiDoBanco` (o que o entrypoint `Banco` oferece por RPC)
src/sql.ts              SqlMinimo, CursorMinimo, Transacao (o mesmo formato de apps/sala/src/carteiras-sqlite.ts) e transacaoReentrante(base)
src/esquema.ts          CREATE TABLE/INDEX (contas, sessoes, recuperacoes, operacoes, livro, reservas, baldes) e criarEsquema(sql)
src/baldes-sql.ts       BaldesNoSql (balde por chave guardado na tabela `baldes`, a conta do BaldeDeTokens) e limparBaldesAntigos(sql, agora, max = 50)
src/campos.ts           normalizarEmail, validarNome, validarSenha, ehIdDeConta, ehChave, ehCodigoDeConvidado
src/cripto.ts           resumoHex, tokenAleatorio, hashDaSenha, senhaConfere, iguaisEmTempoConstante, bytesParaHex/hexParaBytes, aleatorioDoSistema, ITERACOES
src/moedas.ts           class Moedas: saldo, livro, idempotência por chave (`operacao(chave)` consulta; `anularSeNaoFeita(chave)` fecha a janela com uma lápide), reservas da aposta, `saldos(ids)` e `importarSaldos(lote)` (até 500 por chamada; o saldo importado pode ser negativo, a abertura `migracao:<id>` leva o delta negativo ao livro: perder aposta na sinuca não tem piso)
src/contas.ts           class Contas: criar (do zero ou convertendo o convidado), entrar, sessao, sair, mudarNome, excluir, contaDoCodigo, pedirRecuperacao, novaSenha, excluidasDesde (L61: a varredura dos jogos)
src/carteiro.ts         interface Carteiro, carteiroDoResend (fetch injetado, nunca lança), emailDeNovaSenha, LINK_DE_NOVA_SENHA
src/para-testes.ts      bancoDeTeste() sobre node:sqlite (BEGIN/COMMIT/ROLLBACK simples + transacaoReentrante, como o objeto), escritasDe, relogioFalso, aleatorioFixo, carteiroFalso
src/limite-taxa.ts      cópia de apps/sala/src/limite-taxa.ts (BaldeDeTokens, BaldesPorChave); mudou um, mude o outro
src/ip.ts               chaveDoIp: a chave do balde por IP (IPv4 inteiro, `::ffff:` vira IPv4, IPv6 pelo /64)
src/config.ts           configDoBanco(env): lê e confere os vars (valor ruim ou ORIGENS_DE_DEV em produção lança com o nome); lerPepper (menos de 32 caracteres = sem pepper); puro, testável no Node
src/http.ts             class HttpDaConta (PedidoDaConta -> RespostaDaConta): rotas, Origin, corpo, baldes, cookie, mensagens, log; MAX_CORPO
src/isolamento.test.ts  o grafo de imports de worker/entrada.ts só puxa o núcleo e `cloudflare:workers` (sem node:* nem módulo do Node sem o prefixo, sem import() dinâmico, sem @sinuca/*, para-testes)
src/worker/banco-do.ts  class BancoDO extends DurableObject: esquema no blockConcurrencyWhile, monta Moedas, Contas e HttpDaConta uma vez, implementa ApiDoBanco
src/worker/entrada.ts   class Banco extends WorkerEntrypoint (repassa ao objeto `idFromName('banco')` com locationHint de LOCAL_DO); fetch padrão: só GET /saude -> { ok: true }, o resto 404
src/nucleo.ts           o `exports` `./nucleo`: reexporta `Moedas`, `Contas`, `HttpDaConta`, `aleatorioDoSistema`, `lerPepper`, `criarEsquema` e `transacaoReentrante` (e os tipos do SQL); quem usa é a sala Node (`apps/sala/src/banco-local.ts`, o Banco local sobre `node:sqlite`); nunca o Worker
src/worker/env-extra.d.ts  os secrets (PEPPER_DA_SENHA, RESEND_API_KEY), que o `wrangler types` não conhece
```

## Fronteiras

- **Sem `@sinuca/*` e sem `node:*` em produção** (o lint barra; `*.test.ts` e `para-testes.ts` ficam de fora). O contrato que os outros consomem é `src/contrato.ts`; `apps/sala` e `apps/portal` importam dele só tipos.
- Só Web Crypto (`crypto.subtle`, `crypto.getRandomValues`) e SQL pelo `SqlMinimo`. Sem `nodejs_compat`. Nada de `Math.random`: o aleatório entra injetado (`Aleatorio`).
- Identificadores em português sem acento; TSDoc só no `contrato.ts` (e nas classes públicas do núcleo).
- **Concorrência:** todo método assíncrono faz primeiro os `await` (hash, resumo) e depois um único bloco síncrono `transacao(() => …)`. Nenhum `await` dentro da transação (outro pedido entraria no objeto).
- **Senha:** `PBKDF2(HMAC-SHA256(pepper, senha), sal de 16 bytes, 100 000 iterações)`, 32 bytes. 100 000 é o teto do Workers; o pepper cobre a diferença. O hash roda dentro do `BancoDO`, nunca no Worker (10 ms de CPU).

## Moedas (`moedas.ts`)

- Tudo ou nada: cada operação é uma transação; recusa não escreve nada, nem a chave.
- Idempotência: tabela `operacoes` (`chave`, `assinatura` = tipo + variações ordenadas por id, `resultado`). Mesma chave e assinatura = o resultado guardado, `repetida: true`, sem efeito; assinatura outra = `chave-reusada` (inclusive entre tipos: `reservar(k)` e depois `creditar(k)`, ou `creditar(k)` e depois `aplicar(k)`, com as mesmas variações). Só sucesso grava a chave (uma recusa por saldo pode ser repetida depois). **O `Lancamento` (`jogo` e `motivo`) fica FORA da assinatura** (decisão do Principal): são rótulos do livro, não do efeito; repetir com outro rótulo é a mesma operação e o livro guarda o da primeira vez.
- Reserva da aposta: `reservar(lote, chave)` usa a chave, `liquidar` usa `<chave>:liquidar`, `devolver` usa `<chave>:devolver` (por isso a chave da reserva tem no máximo 110 caracteres). `reservar` não tira do saldo e não tem piso; `liquidar` aplica os deltas à reserva (só contas reservadas, sem piso, é o único que deixa o saldo negativo) e apaga a reserva inteira; `devolver` só a apaga. Reserva com mais de 24 h (`em < agora − 24 h`) some antes de qualquer operação.
- Piso: `debitar` e delta negativo de `aplicar` exigem `disponivel >= |delta|`, com `disponivel = saldo − reservas`.
- Chaves reservadas: a chave que vem de fora (`aplicar`, `debitar`, `creditar`, `reservar`) não pode terminar em `:liquidar` nem `:devolver`, nem começar com `excluir:`, `abertura:` ou `migracao:` (as que o próprio Banco escreve no livro e em `operacoes`): `valor-invalido`, sem escrever nada.
- Teto do `liquidar`: cada delta tem de ser no mínimo -(o que aquela conta reservou nesta chave) e a soma dos deltas no máximo zero (o pote só muda de mãos, nunca cria moeda); fora disso, `valor-invalido` e a reserva fica intacta. A soma do que uma conta tem reservado (com a reserva nova) tem de ser inteiro seguro, senão `reservar` dá `valor-invalido`.
- Validação: valor e delta inteiros seguros e diferentes de zero (lote vazio, com zero ou com mais de 100 contas é `valor-invalido`); ids distintos (`conta-repetida`); saldo resultante tem de ser inteiro seguro; chave pelo `ehChave`; `jogo` em `/^[a-z0-9-]{1,20}$/`, `motivo` até 60.
- Livro: uma linha por conta e movimento (`chave`, `conta`, `delta`, `jogo`, `motivo`); `garantirConta` grava a abertura (`abertura:<id>`, jogo `banco`) e `zerar` a saída; por isso a soma do livro de uma conta é o saldo dela (teste).
- `operacoes` e `livro` só crescem: limpeza dos antigos fica para quando o plano gratuito apertar.
- Transação: `transacaoReentrante(base)` (sql.ts) é a que `Contas` e `Moedas` recebem; a de dentro só roda a função, sem SAVEPOINT (o `transactionSync` do Durable Object não garante aninhada). O `para-testes` a usa sobre um BEGIN/COMMIT/ROLLBACK simples; o L55 a usa sobre `ctx.storage.transactionSync`. Quem chama `Moedas` de dentro de uma transação nunca captura a exceção para seguir: recusa é retorno `{ ok: false }`, exceção desfaz tudo na de fora.
- `operacao(chave)` devolve o resultado guardado (sempre `repetida: true`) ou `null` (nunca aplicada, ou anulada): o jogo que perdeu a resposta pergunta antes de repetir. **`anularSeNaoFeita(chave)` (L60)** é a pergunta definitiva, numa transação só: chave já aplicada devolve `{ feita }` (o resultado guardado); chave nova grava uma **lápide** (a chave em `operacoes` com a assinatura `anulada`) e devolve `{ anulada: true }`; um `debitar`, `creditar` ou `aplicar` que chegue depois com a chave anulada dá `chave-reusada`, sem efeito (o `jaFeita` vê a assinatura diferente). Repetir dá `anulada` de novo; chave de reserva, abertura, migração ou exclusão lança `RangeError`. A sinuca a usa na reconciliação das compras pendentes: sem ela, o objeto que cai com o `debitar` a caminho cobrava sem dar o item. A chave vale para a conta INTEIRA do banco: duas contas com a mesma chave colidem em `chave-reusada` (teste), por isso a sinuca põe o `id` inteiro na chave.

## Contas e sessões (`contas.ts`)

- Criar: valida campos (e-mail, senha, nome, nessa ordem), `nao-configurado` sem pepper, confere cedo e-mail em uso / convidado / teto (sem gastar hash), faz os `await` (hash, `id`, token da sessão) e SÓ ENTÃO uma transação síncrona: `garantirConta(id, saldoInicial, false)` + `UPDATE` dos campos pessoais + sessão. O `UNIQUE(email)` é a última palavra: a violação (fora da transação, já desfeita) vira `email-em-uso`; quem perde a conversão do convidado recebe `convidado-ja-e-conta`. Sem `convidadoId` o `id` é `resumoHex(token aleatório)`; com ele, o mesmo `id` e o mesmo saldo (linha inexistente é criada com o saldo inicial).
- Só a violação do UNIQUE de `contas.email` vira `email-em-uso`; qualquer outra violação (`contas.id`, por exemplo) sobe como erro.
- Hash e sal ficam em hexadecimal, em colunas `TEXT` (L55; antes diziam BLOB): `SqlMinimo` só liga texto e número, e o Durable Object devolve BLOB como `ArrayBuffer`.
- Entrar: e-mail sem conta roda um hash de mentira (sal zerado) e responde `email-ou-senha`, igual à senha errada; senha curta ou e-mail ruim também; só senha enorme dá `senha-longa` (sem hash). Depois do hash a transação confere que a senha não mudou nesse meio-tempo.
- Sessão: token de 32 bytes, o banco guarda o `resumoHex`; vale 90 dias a partir da última renovação, `sessao` renova (e diz `renovada: true`) se passou mais de 1 dia; no máximo 20 por conta (a de `criada_em` mais velha sai); vencida ou de conta excluída é apagada e dá `null`.
- Excluir: pede a senha; numa transação, `Moedas.zerar(id, 'excluir:<id>')` (zera o saldo no livro e solta as reservas da conta), campos pessoais nulos, `excluida_em`, e apaga todas as sessões e recuperações. O e-mail fica livre.
- `contaDoCodigo(codigo)`: `{ id, convidado }` do `resumoHex` do código de 43 caracteres, `null` se não há linha ou foi excluída (continua achando a conta convertida, com `convidado: false`).

## Recuperação de senha

- `pedirRecuperacao(email)`: `null` se o e-mail é inválido ou sem conta (o HTTP responde igual). Senão guarda só o `resumoHex` do token (1 h, `usada = 0`), marca os pedidos antigos da conta como usados (apaga os já vencidos) e devolve `{ para, link }` com `LINK_DE_NOVA_SENHA` + token (fragmento, nunca query). O envio fica com quem chamou (o `HttpDaConta`, por `depois` = `ctx.waitUntil`).
- `novaSenha(token, senha)`: token fora da forma, usado, vencido ou de conta excluída é `link-vencido`; senha inválida é recusada antes do hash e não gasta o link. Numa transação: hash novo, todos os pedidos da conta usados, TODAS as sessões apagadas e uma sessão nova.
- `carteiroDoResend(chave, fetch)` faz `POST https://api.resend.com/emails` (remetente `Beco Games <nao-responda@becogames.app>`, prazo de 10 s) e nunca lança: falha é `{ ok: false, status }` (0 sem resposta). O texto do e-mail é o fixo do plano; o HTML tem o link escapado, sem imagem nem rastreio. Teste com `carteiroFalso()`.

## Varredura das contas excluídas (L61)

`excluidasDesde(ms, limite)` (RPC do `Banco`, `ApiDoBanco`, `Contas.excluidasDesde`): os `id`s das contas com `excluida_em >= ms`, em ordem de `excluida_em` e `id`, até `limite` (1 a `MAX_EXCLUIDAS_POR_CHAMADA` = 500; fora disso `RangeError`), e `ate` = a última `excluida_em` devolvida (ou `ms` se nenhuma). O `>=` repete a última, de propósito: duas excluídas no mesmo milissegundo não se perdem na quebra de página, e apagar de novo a carteira de itens que a sinuca já apagou não faz nada. Quem pagina continua de `ate` enquanto a página vem cheia. Índice parcial `contas_excluida_em` (só as excluídas). A sinuca (`apps/sala`, `varredura-de-excluidas.ts`) chama ao acordar e no máximo 1x por hora; só `id`s, nunca e-mail.

## HTTP da conta (`http.ts`)

O portal (L56) entrega o pedido já em partes (`PedidoDaConta`: ação, método, `Origin`, IP de `CF-Connecting-IP`, `Cookie`, código de convidado, corpo cru de até 8 KB) pela RPC `tratar`, e repassa a `RespostaDaConta` (`status`, `corpo`, `cookie` = o `Set-Cookie` inteiro).

| Ação | Método | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `criar` | POST | `{ email, senha, nome }` (+ `convidado` do pedido) | 201 `{ conta }` + cookie | 400 campo, 409 `email-em-uso` / `convidado-ja-e-conta`, 429, 503 (`ocupado` ou fora do ar) |
| `entrar` | POST | `{ email, senha }` | 200 `{ conta }` + cookie | 401 `email-ou-senha`, 429, 503 `ocupado` |
| `eu` | GET | — | 200 `{ conta }` (+ cookie se a sessão renovou) | 401 `sem-sessao` (cookie desconhecido é apagado) |
| `sair` | POST | — | 200 `{ ok: true }` + cookie apagado | — |
| `nome` | POST | `{ nome }` | 200 `{ conta }` | 400, 401 |
| `excluir` | POST | `{ senha }` | 200 `{ ok: true }` + cookie apagado | 401 `senha-errada` / `sem-sessao`, 429, 503 `ocupado` |
| `esqueci` | POST | `{ email }` | 200 `{ ok: true, mensagem }`, sempre igual | 400 e-mail que não é e-mail, 429 |
| `nova-senha` | POST | `{ token, senha }` | 200 `{ conta }` + cookie | 400 `link-vencido` e campo, 429, 503 `ocupado` |

- **Ordem das checagens:** rota (404) -> método (405) -> `Origin` do POST (403 `origem`) -> corpo acima de 8 KB (413, em bytes) -> JSON objeto e campos (400) -> baldes por IP, e-mail e conta (429 com `tenteEmS`) -> teto de hash de todos (503 `ocupado`) -> `Contas`. Nenhum hash roda antes dos baldes. No `excluir` a sessão é resolvida antes (sem hash), para o balde ser da conta. Campo ruim em `criar`, `esqueci` e `nova-senha` é 400 ANTES do balde: errar o formulário não gasta as criações do IP.
- **Origin do POST:** `https://becogames.app` ou `https://<sub>.becogames.app` (regex ancorada, uma etiqueta, sem porta, sem `http`), mais `ORIGENS_DE_DEV` por igualdade. GET não confere. `endsWith`/`startsWith` aceitam `evilbecogames.app` ou `becogames.app.evil.app`: não usar (mutação em `.outros/lote-55/mutacoes.txt`).
- **Cookie:** `becogames_sessao=<token>; Max-Age=7776000; Domain=<DOMINIO_DO_COOKIE>; Path=/; HttpOnly; Secure; SameSite=Lax`. Sem `Domain` com domínio nulo (dev), sem `Secure` só com `COOKIE_SEGURO=0`. Apagar = valor vazio e `Max-Age=0`. O token do `Cookie` tem de casar com `/^[A-Za-z0-9_-]{43}$/`, senão é ignorado.
- **Baldes** (capacidade / reposição). No **SQLite do objeto** (tabela `baldes`, uma linha por chave `nome:chave`, sobrevivem ao despejo): `entrarPorEmail` 5 / 5 a cada 15 min, `esqueciPorEmail` 3 / 3 por hora, `criarPorIp` 3 / 3 por hora, `excluirPorConta` 5 / 5 a cada 15 min (chave = o `id` da conta da sessão). Na **memória** (`BaldesPorChave`): `entrarPorIp` 20 / 20 por hora, `esqueciPorIp` 5 / 5 por hora, `novaSenhaPorIp` 10 / 10 por hora, `excluirPorIp` 10 / 10 por hora. A chave de IP é `chaveDoIp` (IPv6 pelo /64); a de e-mail é o `resumoHex` do e-mail normalizado, nunca o e-mail. `tenteEmS` é o tempo de uma ficha voltar (pior caso). `eu`, `sair` e `nome` não têm balde (exigem sessão e não fazem hash).
- **Baldes no SQLite** (`baldes-sql.ts`): a conta é a do `BaldeDeTokens`; a linha só é escrita quando gasta (a recusa não escreve), e a chave sem linha vale balde cheio. Todo balde tem de encher em menos de 1 dia (o construtor confere), porque a limpeza apaga, a cada pedido que passa das primeiras checagens, no máximo 50 linhas paradas há mais de 1 dia (as mais velhas primeiro; índice `baldes_atualizado`). `criarEsquema` cria a tabela também para quem usa o núcleo fora do Worker (a sala).
- **Teto de hash de todos:** balde global `hashPorSegundo` (capacidade 40, 20 fichas por segundo, memória), gasto por `criar`, `entrar`, `nova-senha` e `excluir` logo antes de chamar `Contas` (depois dos baldes por chave). Esgotado: 503 `ocupado`, "Muitos pedidos agora. Tente de novo em alguns segundos.", `tenteEmS: 1`, log `limite` com `balde: hashPorSegundo`; nenhum hash roda. Limita o PBKDF2 a no máximo uns 20 por segundo no objeto, venha o ataque de quantos IPs e e-mails vier.
- **Esqueci:** responde igual com e sem conta. Com conta e carteiro, o e-mail sai por `depois` (`ctx.waitUntil`) e a resposta não espera. Sem `RESEND_API_KEY` só registra `email-nao-configurado` (nem grava o pedido). Sem pepper (ausente ou com menos de 32 caracteres) responde igual e não grava nada (`pedirRecuperacao` devolve `null`). O `esqueciPorEmail` é gasto ANTES de `pedirRecuperacao`: o 429 não grava pedido nem invalida o último link (teste).
- **Convidado no `criar`:** o `convidado` do pedido (43 caracteres) vira o `id` (SHA-256) e o Banco converte a carteira ou a cria com o saldo inicial; código malformado é ignorado. O `conta` da resposta é `{ nome, email, saldo }`, nunca com `id`.
- **Log** (uma linha JSON por evento): `conta-criada`, `entrou`, `nova-senha`, `conta-excluida`, `recuperacao-pedida`, `recuperacao-enviada` (`status`), `email-nao-configurado`, `limite` (`balde`), `pepper-curto` (`minimo`, uma vez ao subir o objeto), `origem-recusada` (`acao`), `erro-interno` (`acao`, tipo do erro); da conta, só `conta: id.slice(0, 8)`. Nunca e-mail, senha, token, código nem IP; um teste varre o log atrás deles. Erro inesperado vira 500 sem mensagem.
- **Limite conhecido:** só os baldes de IP de `entrar`, `esqueci`, `nova-senha` e `excluir` e o global ficam na memória e somem se o runtime despejar o objeto (parado por uns 70 a 140 s); os por e-mail, o de criar por IP e o de excluir por conta sobrevivem. Um ataque lento por IP ainda recarrega o de IP, mas não o do e-mail nem o da conta, e o PBKDF2 tem o teto de todos.
- **Peso do hash:** o PBKDF2 (100 000 iterações) bloqueia o objeto por uns 15 a 30 ms a cada `entrar`, `criar`, `nova-senha` e `excluir`; os baldes acima e o teto de todos (`hashPorSegundo`) limitam quantos chegam. Os outros pedidos esperam a vez.

## Worker e objeto

- `Banco` (entrypoint, service binding `{ service: "becogames-conta", entrypoint: "Banco" }`) repassa cada método de `ApiDoBanco` ao `BancoDO` único (`idFromName('banco')`, `locationHint` de `LOCAL_DO`, sem dica se vazio). O `fetch` padrão só responde `GET /saude`; o resto é 404, então nada de conta fica exposto no `workers.dev`.
- `BancoDO`: esquema no `blockConcurrencyWhile`; `transacaoReentrante(fn => ctx.storage.transactionSync(fn))` (provado no workerd: `Moedas` dentro de `Contas` e o hash no objeto); `PEPPER_DA_SENHA` ausente ou com menos de 32 caracteres = operações de senha dão `nao-configurado` e o esqueci não grava (o objeto loga `pepper-curto` uma vez, no construtor, se foi por ser curto); `configDoBanco` lança no construtor se `ORIGENS_DE_DEV` não é vazio junto com `COOKIE_SEGURO=1` e `DOMINIO_DO_COOKIE` de `becogames.app`; `RESEND_API_KEY` ausente = sem carteiro; `depois` = `ctx.waitUntil`.
- Argumento mal formado numa chamada RPC de moeda (id que não é de conta, lote com mais de 500) lança `RangeError`; recusa de regra é retorno `{ ok: false }`.

## Variáveis e segredos

Variáveis (texto, em `wrangler.jsonc`): `SALDO_INICIAL` (100), `MAX_CONTAS` (50000), `DOMINIO_DO_COOKIE` (`.becogames.app`), `COOKIE_SEGURO` (`1`), `ORIGENS_DE_DEV` (vazio em produção), `LOCAL_DO` (`sam`).

Segredos (só os nomes; nunca valor em arquivo versionado, log ou nota):
- `PEPPER_DA_SENHA`: somado ao hash da senha; trocar invalida todas as senhas. Mínimo de 32 caracteres (menos que isso conta como ausente).
- `RESEND_API_KEY`: envio da recuperação de senha. Em desenvolvimento a chave está em `~/.config/sinuca/resend-api-key`, fora do repositório.

Local: `apps/conta/.dev.vars` (já no `.gitignore`), uma linha `PEPPER_DA_SENHA=<texto aleatório de teste, com 32 caracteres ou mais>`; sem `RESEND_API_KEY` o esqueci não manda e-mail. `wrangler secret put` e `wrangler deploy` só pelo Principal, a pedido do usuário.

## Testes

`pnpm exec vitest run apps/conta` (Node, `node:sqlite` em memória). `pnpm --filter @sinuca/conta typecheck` confere o núcleo e o worker (este sem tipos de Node).

## Rodar local

```text
cd apps/conta && pnpm dev            wrangler dev --local (porta 8787); precisa do .dev.vars; GET /saude é a única rota de internet
pnpm types                           refaz worker-configuration.d.ts depois de mudar o wrangler.jsonc
```

Para chamar o Banco como o portal fará: um Worker de prova com `services: [{ binding, service: "becogames-conta", entrypoint: "Banco" }]` e `wrangler dev -c <prova> -c apps/conta/wrangler.jsonc` (o primeiro config recebe o HTTP). O molde está em `.outros/lote-55/prova/` (a saída em `prova-workerd.txt`). Apague o `.wrangler` e o `.dev.vars` de teste depois.
