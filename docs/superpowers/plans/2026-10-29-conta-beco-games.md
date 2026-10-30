# Conta Beco Games — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development, aqui pelo fluxo de lotes do time (`sinuca-maestri-time`). Cada tarefa é um lote com prompt em `.outros/prompts/`, subagente novo, `model` e `effort` explícitos. Os passos usam caixas (`- [ ]`) para o acompanhamento.

**Objetivo:** uma conta da Beco Games (e-mail, senha, nome) com moedas comuns a todos os jogos. O convidado continua jogando como hoje e vira conta sem perder nada.

**Arquitetura:**
- Um Worker novo, `becogames-conta` (`apps/conta`, dono Backend), com um único Durable Object `BancoDO` em SQLite. Ele é a única fonte do saldo, das contas, das sessões e da recuperação.
- O núcleo é puro: TypeScript sobre `SqlMinimo` e Web Crypto, testado em Node com `node:sqlite`. O Worker e o objeto só ligam as peças.
- Os jogos e o portal falam com o Banco por service binding (RPC, entrypoint `Banco`), nunca pela internet.
- Este plano detalha a **Parte 1**: o Banco, as contas, a sessão, a recuperação e as telas no portal. As Partes 2 a 4 estão esboçadas no fim.

**Stack:** TypeScript strict · Cloudflare Workers + Durable Objects (SQLite, plano grátis) · Web Crypto (PBKDF2-SHA256, HMAC, SHA-256) · Resend (HTTP) · Vitest com `node:sqlite` · `wrangler dev --local` para a integração.

**Spec:** `docs/superpowers/specs/2026-10-29-conta-beco-games-design.md` (aprovado em 2026-10-29). Quem executa lê os dois.

## Restrições globais

**Valores fixos da spec:**
- Cookie `becogames_sessao` com `HttpOnly; Secure; SameSite=Lax; Domain=.becogames.app; Path=/`, `Max-Age=7776000` (90 dias), renovado ao usar.
- Token de sessão aleatório de 32 bytes (base64url, 43 caracteres). O Banco guarda só o SHA-256 dele.
- Recuperação:
  - token de 32 bytes, guardado só como SHA-256, válido por 1 h e de uso único;
  - o link é `https://becogames.app/nova-senha#token=<token>` (fragmento, nunca query);
  - enviado pelo Resend de `Beco Games <nao-responda@becogames.app>`;
  - a resposta do pedido é sempre a mesma, com ou sem conta.
- Senha: PBKDF2-SHA256 com **100 000** iterações (o teto do Workers), sal de 16 bytes por conta e o pepper `PEPPER_DA_SENHA` (`wrangler secret`). O hash roda **dentro do `BancoDO`**, nunca no Worker (10 ms de CPU).
- Campos:
  - **e-mail:** único, normalizado (`trim` e minúsculas), até 254 caracteres;
  - **nome:** 1 a 20 caracteres (contados por ponto de código, depois do `trim`), não único;
  - **senha:** de 8 a 128 caracteres.
- Conta criada do zero começa com `SALDO_INICIAL` = 100 (var do Worker).
- O limite de criação por IP é 3 por hora (o `criarPorIp` de hoje).
- `POST` só com `Origin` igual a `https://becogames.app` ou `https://<sub>.becogames.app`. Fora isso, só o que estiver em `ORIGENS_DE_DEV`, que fica vazio em produção.
- Nenhum e-mail, senha, token ou código de convidado em log; da conta, só `conta: id.slice(0, 8)`.
- Reserva sem liquidação por mais de 24 h volta sozinha.
- O saldo só fica negativo pelo `liquidar` (a aposta, como hoje); `debitar` e `aplicar` têm piso no **disponível** (saldo menos o reservado).

**Fronteiras e regras do repositório:**
- `apps/conta` não importa `@sinuca/*` nem `node:*` no código de produção (os testes podem). O contrato que os outros consomem fica em `apps/conta/src/contrato.ts`, exportado como `@sinuca/conta/contrato`. `apps/sala` e `apps/portal` importam dele só tipos.
- Código: identificadores em português sem acento, TSDoc só no `contrato.ts`, nenhum `Math.random` (aleatório injetado, de `crypto.getRandomValues`).
- **Commit, push, `wrangler deploy`, `wrangler secret` e conta Cloudflare** só com pedido do usuário. `.dev.vars` já está no `.gitignore`.
- Nunca `git reset --hard`, `checkout .`, `clean` nem `stash`.
- Nada de marca real nos textos. O nome do serviço de e-mail aparece só na política de privacidade, como processador.

**Concorrência no objeto:** entre dois `await` do Web Crypto, outro pedido pode entrar no `BancoDO`. Por isso, todo método assíncrono faz **primeiro** os `await` (hash, resumo) e **depois** um único bloco síncrono `transacao(() => …)` com as leituras e escritas. Nenhum `await` dentro da transação.

## Foco da revisão

1. **Dois pedidos iguais ao mesmo tempo.** Dois `criar` com o mesmo e-mail, ou duas conversões do mesmo convidado, intercalados no `await` do PBKDF2: um ganha, o outro recebe `email-em-uso` ou `convidado-ja-e-conta`, nunca erro 500 nem duas linhas. Teste na Tarefa 3.
2. **O mesmo e-mail escrito de outro jeito.** `" Ana@Gmail.COM "` cria e entra na mesma conta que `ana@gmail.com`. Teste na Tarefa 1 (normalização) e na Tarefa 3 (entrar).
3. **Senha ou corpo enorme antes do hash.** Um corpo de 1 MB ou uma senha de 10 000 caracteres são recusados **sem** rodar o PBKDF2 (`413` ou `senha-longa`): não dá para gastar a CPU do objeto. Teste na Tarefa 5 (corpo) e na Tarefa 3 (senha, conferindo que o hash não foi chamado).
4. **Sessões antigas depois de trocar a senha e de excluir a conta.** A senha nova pelo link derruba **todas** as sessões da conta; excluir também. O cookie de outro subdomínio para de valer na hora. Teste na Tarefa 3 (excluir) e na Tarefa 4 (nova senha).
5. **Repetir depois de um tempo esgotado.** O jogo repete a mesma chave com o mesmo conteúdo e recebe o mesmo resultado, com `repetida: true` e sem efeito. A mesma chave com outro conteúdo dá `chave-reusada`. Teste na Tarefa 2.

---

## Estrutura de arquivos (Parte 1)

```text
apps/conta/
  package.json            @sinuca/conta; scripts typecheck, dev (wrangler dev --local), types; exports "./contrato"
  tsconfig.json           núcleo e testes (tipos node, só para os testes)
  tsconfig.worker.json    src/worker (tipos @cloudflare/workers-types)
  wrangler.jsonc          becogames-conta, BancoDO (migração v1 new_sqlite_classes), vars, workers_dev true (só /saude)
  CLAUDE.md               mapa, fronteiras, variáveis e segredos
  src/contrato.ts         tipos públicos: ContaPublica, PedidoDaConta, RespostaDaConta, Variacao, ResultadoDeMoeda, ApiDoBanco
  src/sql.ts              SqlMinimo, CursorMinimo, Transacao (o mesmo formato de apps/sala/src/carteiras-sqlite.ts:17-26)
  src/esquema.ts          CREATE TABLE/INDEX, versão do esquema
  src/campos.ts           normalizarEmail, validarNome, validarSenha, ehIdDeConta, ehChave, ehCodigoDeConvidado
  src/cripto.ts           resumoHex, tokenAleatorio, hashDaSenha, senhaConfere, iguaisEmTempoConstante
  src/moedas.ts           class Moedas (saldo, livro, idempotência, reservas)
  src/contas.ts           class Contas (criar, entrar, sessão, nome, sair, excluir, recuperação)
  src/carteiro.ts         interface Carteiro, carteiroDoResend, emailDeNovaSenha
  src/limite-taxa.ts      cópia de apps/sala/src/limite-taxa.ts (BaldeDeTokens, BaldesPorChave)
  src/http.ts             class HttpDaConta: PedidoDaConta → RespostaDaConta (Origin, baldes, cookie, mensagens)
  src/para-testes.ts      bancoDeTeste() sobre node:sqlite, relogioFalso, aleatorioFixo, carteiroFalso
  src/worker/entrada.ts   export default { fetch } (/saude), class Banco extends WorkerEntrypoint, re-export BancoDO
  src/worker/banco-do.ts  class BancoDO extends DurableObject: monta Moedas, Contas e HttpDaConta e expõe os métodos de ApiDoBanco
apps/portal/
  wrangler.jsonc          + main, assets.binding ASSETS, run_worker_first ["/api/*"], services CONTA → becogames-conta/Banco
  src/entrada.ts          /api/conta/<acao> → env.CONTA.tratar(pedido); o resto → env.ASSETS
  public/{entrar,criar-conta,esqueci-a-senha,nova-senha,minha-conta}/index.html, public/conta.js
  public/_headers         connect-src 'self'
  public/privacidade/index.html, public/termos/index.html   a conta e o e-mail
eslint.config.*           bloco apps/conta (sem @sinuca/*, sem node:*, sem Math.random fora de testes e para-testes)
CLAUDE.md (raiz), docs/decisoes.md   a linha de apps/conta no mapa e o dono
```

## Esquema (Tarefa 1, usado por todas)

```sql
CREATE TABLE contas (id TEXT PRIMARY KEY, email TEXT UNIQUE, nome TEXT, hash TEXT, sal TEXT, iteracoes INTEGER,
  convidado INTEGER NOT NULL, saldo INTEGER NOT NULL, criada_em INTEGER NOT NULL, excluida_em INTEGER);
CREATE TABLE sessoes (hash TEXT PRIMARY KEY, conta TEXT NOT NULL, vence_em INTEGER NOT NULL, criada_em INTEGER NOT NULL);
CREATE INDEX sessoes_conta ON sessoes(conta);
CREATE TABLE recuperacoes (hash TEXT PRIMARY KEY, conta TEXT NOT NULL, vence_em INTEGER NOT NULL, usada INTEGER NOT NULL);
CREATE TABLE operacoes (chave TEXT PRIMARY KEY, assinatura TEXT NOT NULL, resultado TEXT NOT NULL, em INTEGER NOT NULL);
CREATE TABLE livro (chave TEXT NOT NULL, conta TEXT NOT NULL, delta INTEGER NOT NULL, jogo TEXT NOT NULL, motivo TEXT NOT NULL,
  em INTEGER NOT NULL, PRIMARY KEY (chave, conta));
CREATE TABLE reservas (chave TEXT NOT NULL, conta TEXT NOT NULL, valor INTEGER NOT NULL, em INTEGER NOT NULL, PRIMARY KEY (chave, conta));
CREATE INDEX reservas_em ON reservas(em);
```

- **`id`:** 64 caracteres hexadecimais minúsculos. No convidado é o SHA-256 do código, o mesmo de `apps/sala/src/carteiras-base.ts:178`. Na conta criada do zero é o `resumoHex` de um token aleatório que ninguém guarda.
- **Conta excluída:** a linha fica, com `email`, `nome`, `hash` e `sal` nulos, `saldo` 0 e `excluida_em` preenchido. O `id` nunca volta a ser usado.

---

### Tarefa 1: andaime de `apps/conta`, campos e criptografia (lote L53a, Backend, sonnet, `high`)

**Arquivos:**
- **Criar:** em `apps/conta/`, `package.json`, `tsconfig.json`, `tsconfig.worker.json`, `wrangler.jsonc` e `CLAUDE.md`; em `apps/conta/src/`, `sql.ts`, `esquema.ts`, `campos.ts`, `cripto.ts`, `para-testes.ts` e `contrato.ts` (só os tipos desta tarefa, completado nas seguintes).
- **Mudar:** `eslint.config.*` (bloco novo depois do `apps/sala/**`), `CLAUDE.md` da raiz (linha no mapa) e `docs/decisoes.md` (a pasta e o dono).
- **Testes:** `apps/conta/src/campos.test.ts` e `apps/conta/src/cripto.test.ts`.

**Interfaces que esta tarefa produz:**
- **`campos.ts`:**
  - `normalizarEmail(bruto: unknown): string | null`;
  - `validarNome(bruto: unknown): string | null` (já com `trim`);
  - `validarSenha(bruto: unknown): 'ok' | 'senha-curta' | 'senha-longa'`;
  - `ehIdDeConta(x: unknown): x is string`, com o padrão `/^[0-9a-f]{64}$/`;
  - `ehChave(x)`, com `/^[a-z0-9][a-z0-9:._-]{0,119}$/`;
  - `ehCodigoDeConvidado(x)`, com `/^[A-Za-z0-9_-]{43}$/`.
- **`cripto.ts`:**
  - `resumoHex(texto: string): Promise<string>`;
  - `tokenAleatorio(aleatorio: (n: number) => Uint8Array): string` (32 bytes em base64url);
  - `hashDaSenha(senha: string, sal: Uint8Array, pepper: string, iteracoes?: number): Promise<Uint8Array>`;
  - `senhaConfere(senha: string, guardado: { hash: Uint8Array; sal: Uint8Array; iteracoes: number }, pepper: string): Promise<boolean>`;
  - `iguaisEmTempoConstante(a: Uint8Array, b: Uint8Array): boolean`;
  - `ITERACOES = 100_000`.
- **`para-testes.ts`:** `bancoDeTeste(): { sql: SqlMinimo; transacao: Transacao; comandos: string[] }`, sobre `node:sqlite` em memória com o esquema aplicado, no molde de `apps/sala/src/para-testes-sqlite.ts`; mais `relogioFalso(inicio?): { agora: () => number; avancar(ms: number): void }` e `aleatorioFixo(semente)`.

- [ ] **Passo 1: testes que falham**

```ts
it('normaliza o e-mail', () => {
  expect(normalizarEmail('  Ana@Gmail.COM ')).toBe('ana@gmail.com');
  for (const ruim of ['', 'ana', 'ana@', '@x.com', 'a b@x.com', 'a@x', 'a'.repeat(250) + '@x.com', 42, null]) expect(normalizarEmail(ruim)).toBeNull();
});
it('nome de 1 a 20 caracteres por ponto de código', () => {
  expect(validarNome('  Zé  ')).toBe('Zé');
  expect(validarNome('🎱'.repeat(20))).toBe('🎱'.repeat(20));
  for (const ruim of ['', '   ', 'a'.repeat(21), 'a\u0000b', 'a\nb', 7]) expect(validarNome(ruim)).toBeNull();
});
it('senha de 8 a 128', () => {
  expect(validarSenha('1234567')).toBe('senha-curta');
  expect(validarSenha('12345678')).toBe('ok');
  expect(validarSenha('x'.repeat(129))).toBe('senha-longa');
});
it('o resumo é o mesmo da carteira da sinuca', async () => {
  const codigo = 'A'.repeat(43);
  expect(await resumoHex(codigo)).toBe(createHash('sha256').update(codigo).digest('hex')); // node:crypto só no teste
});
it('a senha confere só com o mesmo pepper', async () => {
  const sal = new Uint8Array(16).fill(7);
  const hash = await hashDaSenha('segredo-bom', sal, 'pepper-1');
  expect(await senhaConfere('segredo-bom', { hash, sal, iteracoes: ITERACOES }, 'pepper-1')).toBe(true);
  expect(await senhaConfere('segredo-bom', { hash, sal, iteracoes: ITERACOES }, 'pepper-2')).toBe(false);
  expect(await senhaConfere('segredo-boM', { hash, sal, iteracoes: ITERACOES }, 'pepper-1')).toBe(false);
});
it('o código de convidado tem o formato da sinuca', () => {
  // import { ehCodigoDeCarteira } from '@sinuca/protocolo' (só no teste)
  const codigo = tokenAleatorio(aleatorioFixo(1));
  expect(ehCodigoDeConvidado(codigo)).toBe(true);
  expect(ehCodigoDeCarteira(codigo)).toBe(true);
});
```

- [ ] **Passo 2:** `pnpm exec vitest run apps/conta` → FALHA (os módulos não existem).
- [ ] **Passo 3: implementar.**
  - O hash é `PBKDF2(HMAC-SHA256(pepper, senha), sal, iteracoes, SHA-256, 256 bits)`, todo em `crypto.subtle`.
  - Normalização: o e-mail não leva `normalize`; o nome leva `normalize('NFC')`.
  - O `wrangler.jsonc` traz:
    - `name: becogames-conta`, `main: src/worker/entrada.ts`, `compatibility_date` `2026-10-26`, **sem** `nodejs_compat`, `send_metrics: false`;
    - `durable_objects.bindings` `[{ name: 'BANCO', class_name: 'BancoDO' }]` e `migrations` `[{ tag: 'v1', new_sqlite_classes: ['BancoDO'] }]`;
    - `vars`: `SALDO_INICIAL` "100", `MAX_CONTAS` "50000", `DOMINIO_DO_COOKIE` ".becogames.app", `COOKIE_SEGURO` "1", `ORIGENS_DE_DEV` "" e `LOCAL_DO` "sam";
    - `workers_dev: true`;
    - `observability` como na sala (`invocation_logs: false`);
    - um comentário com os dois segredos (`PEPPER_DA_SENHA`, `RESEND_API_KEY`) e o comando `wrangler secret put`.
  - O bloco do eslint proíbe `@sinuca/*`, `node:*` e `Math.random` em `apps/conta/src/**`, menos `*.test.ts` e `para-testes.ts`.
- [ ] **Passo 4:** `pnpm exec vitest run apps/conta` → PASSA; `pnpm --filter @sinuca/conta typecheck` e `pnpm lint` → limpos.
- [ ] **Passo 5: aprovar.** O Principal confere e faz `git add apps/conta eslint.config.* CLAUDE.md docs/decisoes.md`. Sem commit.

---

### Tarefa 2: as moedas no núcleo (lote L53b, Backend, sonnet, `high`)

**Arquivos:**
- **Criar:** `apps/conta/src/moedas.ts` e o teste `apps/conta/src/moedas.test.ts`.
- **Mudar:** `apps/conta/src/contrato.ts`.

**Interfaces:**
- **Usa:** `SqlMinimo`, `Transacao`, `ehIdDeConta` e `ehChave` (Tarefa 1).
- **Produz, em `contrato.ts`:**
  - `Variacao { id: string; delta: number }`;
  - `Lancamento { jogo: string; motivo: string }`, com `jogo` no padrão `/^[a-z0-9-]{1,20}$/` e `motivo` de até 60 caracteres;
  - `ErroDeMoeda = 'conta-inexistente' | 'saldo-insuficiente' | 'valor-invalido' | 'conta-repetida' | 'chave-reusada' | 'reserva-inexistente'`;
  - `ResultadoDeMoeda = { ok: true; saldos: Readonly<Record<string, number>>; repetida: boolean } | { ok: false; erro: ErroDeMoeda }`;
  - `SaldoDaConta { saldo: number; reservado: number; disponivel: number }`.
- **Produz, em `moedas.ts`, a classe `Moedas`:**
  - construtor: `constructor(sql: SqlMinimo, transacao: Transacao, relogio: () => number)`;
  - contas e saldo:
    - `garantirConta(id: string, saldoInicial: number): { criada: boolean; saldo: number }`;
    - `saldo(id: string): SaldoDaConta | null`;
  - movimentos:
    - `aplicar(variacoes: readonly Variacao[], chave: string, l: Lancamento): ResultadoDeMoeda`;
    - `debitar(id: string, valor: number, chave: string, l: Lancamento): ResultadoDeMoeda`;
    - `creditar(id: string, valor: number, chave: string, l: Lancamento): ResultadoDeMoeda`;
  - aposta:
    - `reservar(lote: readonly { id: string; valor: number }[], chave: string, l: Lancamento): ResultadoDeMoeda`;
    - `liquidar(chave: string, variacoes: readonly Variacao[], l: Lancamento): ResultadoDeMoeda`;
    - `devolver(chave: string): ResultadoDeMoeda`;
  - manutenção: `zerar(id: string, chave: string): void`, usado pelo excluir da Tarefa 3, e `vencerReservas(): number`.

**Regras que os testes fixam:**
- **Tudo ou nada.** Cada operação é uma `transacao`; qualquer erro não escreve nada.
- **Idempotência pela tabela `operacoes`:**
  - a `assinatura` é o JSON do tipo da operação mais as variações ordenadas por `id`;
  - a mesma chave com a mesma assinatura devolve o `resultado` guardado, com `repetida: true`;
  - a mesma chave com outra assinatura dá `chave-reusada`.
- **Piso:** `debitar` e o delta negativo de `aplicar` exigem `disponivel >= |delta|`. Só o `liquidar` não tem piso.
- **Validação:** valor inteiro positivo; o saldo resultante tem de ser `Number.isSafeInteger`, senão `valor-invalido`. Conta excluída ou inexistente dá `conta-inexistente`.
- **Reservas:**
  - `reservar` não tira do saldo, só prende o disponível, e não tem piso (a aposta de hoje deixa o saldo negativo);
  - `liquidar` aceita só contas da reserva, aplica os deltas ao saldo, apaga a reserva e grava no livro com a `chave`;
  - `devolver` apaga a reserva sem mexer no saldo;
  - em `operacoes` e no `livro`, o `reservar` usa a `chave`, o `liquidar` usa `<chave>:liquidar` e o `devolver` usa `<chave>:devolver`: liquidar de novo com outro conteúdo dá `chave-reusada` e liquidar depois de devolver dá `reserva-inexistente`;
  - toda operação chama `vencerReservas()` antes, que apaga as reservas com `em < agora − 24 h`.

- [ ] **Passo 1: testes que falham**

```ts
const L = { jogo: 'sinuca', motivo: 'teste' };
it('garantirConta cria uma vez com o saldo inicial', () => {
  expect(m.garantirConta(A, 100)).toEqual({ criada: true, saldo: 100 });
  expect(m.garantirConta(A, 500)).toEqual({ criada: false, saldo: 100 });
});
it('debitar acima do disponível recusa sem escrever', () => {
  const antes = escritas();
  expect(m.debitar(A, 101, 'compra:1', L)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
  expect(escritas()).toEqual(antes);
});
it('a mesma chave com o mesmo conteúdo aplica uma vez', () => {
  expect(m.creditar(A, 50, 'missao:2026-10-29:x', L)).toEqual({ ok: true, saldos: { [A]: 150 }, repetida: false });
  expect(m.creditar(A, 50, 'missao:2026-10-29:x', L)).toEqual({ ok: true, saldos: { [A]: 150 }, repetida: true });
  expect(m.saldo(A)!.saldo).toBe(150);
});
it('a mesma chave com outro conteúdo é chave-reusada', () => {
  m.creditar(A, 50, 'k1', L);
  expect(m.creditar(A, 60, 'k1', L)).toEqual({ ok: false, erro: 'chave-reusada' });
});
it('aplicar é tudo ou nada', () => {
  expect(m.aplicar([{ id: A, delta: 10 }, { id: SEM_CONTA, delta: 5 }], 'k2', L)).toEqual({ ok: false, erro: 'conta-inexistente' });
  expect(m.aplicar([{ id: A, delta: 10 }, { id: A, delta: 5 }], 'k3', L)).toEqual({ ok: false, erro: 'conta-repetida' });
  expect(m.saldo(A)!.saldo).toBe(100);
});
it('a reserva prende o disponível sem tirar do saldo', () => {
  m.reservar([{ id: A, valor: 80 }, { id: B, valor: 80 }], 'aposta:p1', L);
  expect(m.saldo(A)).toEqual({ saldo: 100, reservado: 80, disponivel: 20 });
  expect(m.debitar(A, 30, 'compra:2', L)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
});
it('liquidar paga da reserva e só ele deixa negativo', () => {
  m.reservar([{ id: A, valor: 150 }, { id: B, valor: 150 }], 'aposta:p2', L);   // A tem 100: a aposta não tem piso
  expect(m.liquidar('aposta:p2', [{ id: A, delta: -150 }, { id: B, delta: 150 }], L)).toMatchObject({ ok: true, saldos: { [A]: -50, [B]: 250 } });
  expect(m.saldo(A)).toEqual({ saldo: -50, reservado: 0, disponivel: -50 });
  expect(m.liquidar('aposta:p2', [{ id: C, delta: 1 }], L)).toEqual({ ok: false, erro: 'chave-reusada' });
});
it('liquidar com conta fora da reserva recusa', () => {
  m.reservar([{ id: A, valor: 10 }], 'aposta:p3', L);
  expect(m.liquidar('aposta:p3', [{ id: B, delta: 10 }], L)).toEqual({ ok: false, erro: 'reserva-inexistente' });
});
it('a reserva com mais de 24 h volta sozinha', () => {
  m.reservar([{ id: A, valor: 60 }], 'aposta:p4', L);
  relogio.avancar(24 * 3600_000 + 1);
  expect(m.saldo(A)).toEqual({ saldo: 100, reservado: 0, disponivel: 100 });
  expect(m.liquidar('aposta:p4', [{ id: A, delta: -60 }], L)).toEqual({ ok: false, erro: 'reserva-inexistente' });
});
it('cada movimento vai ao livro com a chave, o jogo e o motivo', () => {
  m.creditar(A, 5, 'presente:skins-cs', { jogo: 'sinuca', motivo: 'presente' });
  expect(livro()).toContainEqual({ chave: 'presente:skins-cs', conta: A, delta: 5, jogo: 'sinuca', motivo: 'presente' });
});
```

- [ ] **Passo 2:** `pnpm exec vitest run apps/conta/src/moedas.test.ts` → FALHA.
- [ ] **Passo 3: implementar `Moedas` em `apps/conta/src/moedas.ts`.** O `disponivel` sai de `saldo − SUM(reservas.valor)` numa consulta só.
- [ ] **Passo 4:** a mesma linha de comando → PASSA. Mutação: com o piso tirado do `debitar`, o teste do `saldo-insuficiente` fica vermelho.
- [ ] **Passo 5:** aprovar (`git add apps/conta`).

---

### Tarefa 3: as contas e as sessões (lote L54a, Backend, sonnet, `high`)

**Arquivos:**
- **Criar:** `apps/conta/src/contas.ts` e o teste `apps/conta/src/contas.test.ts`.
- **Mudar:** `apps/conta/src/contrato.ts`.

**Interfaces:**
- **Usa:** `Moedas` (Tarefa 2) e as funções de `campos.ts` e de `cripto.ts` (Tarefa 1).
- **Produz, em `contrato.ts`:**
  - `ContaPublica { id: string; nome: string; email: string; saldo: number }` (o HTTP tira o `id` antes de responder ao navegador);
  - `ErroDeConta = 'email-invalido' | 'senha-curta' | 'senha-longa' | 'nome-invalido' | 'email-em-uso' | 'email-ou-senha' | 'convidado-ja-e-conta' | 'sem-sessao' | 'senha-errada' | 'link-vencido' | 'cheio' | 'nao-configurado'`;
  - `ComSessao = { ok: true; conta: ContaPublica; token: string } | { ok: false; erro: ErroDeConta }`.
- **Produz, em `contas.ts`, a classe `Contas`:**
  - construtor: `constructor(o: { sql; transacao; relogio; aleatorio: (n: number) => Uint8Array; moedas: Moedas; pepper: string | null; saldoInicial: number; maxContas: number; hash?: typeof hashDaSenha })`, onde o `hash` injetável serve para o teste contar as chamadas;
  - conta e sessão:
    - `criar(d: { email: unknown; senha: unknown; nome: unknown; convidadoId?: string }): Promise<ComSessao>`;
    - `entrar(email: unknown, senha: unknown): Promise<ComSessao>`;
    - `sessao(token: string): Promise<{ conta: ContaPublica; renovada: boolean } | null>`;
    - `sair(token: string): Promise<void>`;
  - perfil:
    - `mudarNome(token: string, nome: unknown): Promise<{ ok: true; conta: ContaPublica } | { ok: false; erro: ErroDeConta }>`;
    - `excluir(token: string, senha: unknown): Promise<{ ok: true } | { ok: false; erro: ErroDeConta }>`;
  - para os jogos: `contaDoCodigo(codigo: string): Promise<{ id: string; convidado: boolean } | null>`.

**Regras que os testes fixam:**
- **Antes de qualquer hash:** os campos são validados primeiro; sem `pepper`, toda operação de senha dá `nao-configurado` e o hash nem é chamado.
- **Criar:**
  - do zero: `id = resumoHex(tokenAleatorio())`, `convidado = 0` e `garantirConta(id, saldoInicial)`, tudo na mesma transação;
  - `contas` não excluídas ≥ `maxContas` dá `cheio`.
- **Converter o convidado** (`convidadoId`):
  - a linha existe, é convidado e não foi excluída → ganha `email`, `nome`, `hash`, `sal` e `iteracoes`, com o mesmo `id` e o mesmo saldo;
  - a linha não existe → é criada com esse `id` e o `saldoInicial`;
  - a linha já é conta ou foi excluída → `convidado-ja-e-conta`.
- **Sessão:**
  - criar e entrar geram uma sessão (o token volta, só o resumo fica) que vence em 90 dias;
  - há no máximo 20 sessões por conta, e a mais velha sai;
  - `sessao` com mais de 1 dia desde a última renovação empurra o `vence_em` para agora + 90 dias e diz `renovada: true`;
  - sessão vencida ou de conta excluída dá `null` (e é apagada).
- **Entrar** com e-mail sem conta roda um hash de mentira, para gastar o mesmo tempo, e responde `email-ou-senha`, igual à senha errada.
- **Excluir:** pede a senha (`senha-errada`); depois, numa transação só, `Moedas.zerar(id, 'excluir:<id>')`, as reservas da conta devolvidas, os campos pessoais nulos, `excluida_em` preenchido e todas as sessões e recuperações apagadas.
- **Concorrência:** os `await` vêm primeiro e a transação depois; a violação de `UNIQUE(email)` vira `email-em-uso`.

- [ ] **Passo 1: testes que falham**

```ts
it('cria do zero com 100 e entra com o e-mail escrito de outro jeito', async () => {
  const r = await contas.criar({ email: 'ana@gmail.com', senha: 'segredo-bom', nome: 'Ana' });
  expect(r).toMatchObject({ ok: true, conta: { nome: 'Ana', email: 'ana@gmail.com', saldo: 100 } });
  expect(await contas.entrar('  ANA@gmail.com ', 'segredo-bom')).toMatchObject({ ok: true, conta: { email: 'ana@gmail.com' } });
});
it('o e-mail já usado avisa', async () => {
  await contas.criar({ email: 'ana@gmail.com', senha: 'segredo-bom', nome: 'Ana' });
  expect(await contas.criar({ email: 'Ana@Gmail.com', senha: 'outra-senha', nome: 'Outra' })).toEqual({ ok: false, erro: 'email-em-uso' });
});
it('dois criar ao mesmo tempo com o mesmo e-mail: um ganha', async () => {
  const [a, b] = await Promise.all([1, 2].map(() => contas.criar({ email: 'x@y.com', senha: 'segredo-bom', nome: 'X' })));
  expect([a.ok, b.ok].sort()).toEqual([false, true]);
  expect(contarLinhas('contas')).toBe(1);
});
it('o convidado vira conta com o mesmo id e o mesmo saldo', async () => {
  const id = await resumoHex(CODIGO);
  moedas.garantirConta(id, 100); moedas.creditar(id, 900, 'k', L);
  const r = await contas.criar({ email: 'c@d.com', senha: 'segredo-bom', nome: 'C', convidadoId: id });
  expect(r).toMatchObject({ ok: true, conta: { id, saldo: 1000 } });
  expect(await contas.criar({ email: 'e@f.com', senha: 'segredo-bom', nome: 'E', convidadoId: id })).toEqual({ ok: false, erro: 'convidado-ja-e-conta' });
});
it('duas conversões do mesmo convidado ao mesmo tempo: uma ganha', async () => { /* como o de cima, com Promise.all e e-mails diferentes */ });
it('senha enorme é recusada sem hash', async () => {
  expect(await contas.criar({ email: 'a@b.com', senha: 'x'.repeat(10_000), nome: 'A' })).toEqual({ ok: false, erro: 'senha-longa' });
  expect(hashChamado).toBe(0);
});
it('e-mail sem conta e senha errada respondem igual', async () => {
  await contas.criar({ email: 'ana@gmail.com', senha: 'segredo-bom', nome: 'Ana' });
  expect(await contas.entrar('ninguem@gmail.com', 'segredo-bom')).toEqual({ ok: false, erro: 'email-ou-senha' });
  expect(await contas.entrar('ana@gmail.com', 'errada-123')).toEqual({ ok: false, erro: 'email-ou-senha' });
});
it('a sessão renova depois de um dia e vence em 90', async () => {
  const { token } = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
  expect((await contas.sessao(token))!.renovada).toBe(false);
  relogio.avancar(DIA + 1); expect((await contas.sessao(token))!.renovada).toBe(true);
  relogio.avancar(90 * DIA + 1); expect(await contas.sessao(token)).toBeNull();
});
it('excluir zera, apaga os dados pessoais e derruba todas as sessões', async () => {
  const s1 = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
  const s2 = ok(await contas.entrar('a@b.com', 'segredo-bom'));
  expect(await contas.excluir(s1.token, 'errada-123')).toEqual({ ok: false, erro: 'senha-errada' });
  expect(await contas.excluir(s1.token, 'segredo-bom')).toEqual({ ok: true });
  expect(await contas.sessao(s2.token)).toBeNull();
  expect(linha('contas', s1.conta.id)).toMatchObject({ email: null, nome: null, hash: null, saldo: 0 });
  expect(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' })).toMatchObject({ ok: true }); // o e-mail fica livre
});
it('sem pepper nada de senha', async () => {
  expect(await semPepper.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' })).toEqual({ ok: false, erro: 'nao-configurado' });
});
```

- [ ] **Passo 2:** `pnpm exec vitest run apps/conta/src/contas.test.ts` → FALHA.
- [ ] **Passo 3: implementar `Contas`** conforme as regras acima.
- [ ] **Passo 4:** → PASSA. Mutação: com o `await` do hash dentro da transação, ou sem o tratamento do `UNIQUE`, o teste dos dois `criar` fica vermelho.
- [ ] **Passo 5:** aprovar.

---

### Tarefa 4: esqueci a senha e o e-mail pelo Resend (lote L54b, Backend, sonnet, `high`)

**Arquivos:**
- **Criar:** `apps/conta/src/carteiro.ts` e o teste `carteiro.test.ts`.
- **Mudar:** `apps/conta/src/contas.ts`, o teste `contas.test.ts` e `apps/conta/src/para-testes.ts` (`carteiroFalso()`: `{ carteiro, enviados }`).

**Interfaces:**
- **Produz, em `carteiro.ts`:**
  - `interface Carteiro { enviar(m: { para: string; assunto: string; texto: string; html: string }): Promise<{ ok: boolean; status: number }> }`;
  - `carteiroDoResend(chave: string, pedir: typeof fetch): Carteiro`, que faz `POST https://api.resend.com/emails` com `Authorization: Bearer <chave>` e o corpo `{ from: 'Beco Games <nao-responda@becogames.app>', to: [para], subject, text, html }` e nunca lança (rede caída dá `{ ok: false, status: 0 }`);
  - `emailDeNovaSenha(link: string): { assunto: string; texto: string; html: string }`;
  - `LINK_DE_NOVA_SENHA = 'https://becogames.app/nova-senha#token='`.
- **Produz, em `Contas`:**
  - `pedirRecuperacao(email: unknown): Promise<{ para: string; link: string } | null>`, onde `null` quer dizer sem conta ou e-mail inválido, e o HTTP responde igual;
  - `novaSenha(token: unknown, senha: unknown): Promise<ComSessao>`.

**O texto do e-mail (fixo):**
- **Assunto:** "Sua nova senha na Beco Games".
- **Corpo:**
  > Alguém pediu uma senha nova para a sua conta na Beco Games. Para criar a senha nova, abra o link abaixo. Ele vale por 1 hora e só uma vez.
  >
  > `<link>`
  >
  > Se não foi você, ignore este e-mail: a sua senha continua a mesma.
- **HTML:** o mesmo texto, com o link num `<a>`, sem imagem nem rastreio.

**Regras:**
- Pedir de novo **invalida** os pedidos anteriores da conta (`usada = 1`).
- `novaSenha`:
  - o token tem de ser válido, não usado e não vencido (1 h), senão `link-vencido`;
  - a senha nova passa pela validação de antes do hash;
  - numa transação: o hash novo, o pedido marcado como usado, **todas** as sessões da conta apagadas e uma sessão nova criada.

- [ ] **Passo 1: testes que falham**

```ts
it('o link leva o token só no fragmento e funciona uma vez', async () => {
  await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' });
  const { para, link } = (await contas.pedirRecuperacao('A@B.com'))!;
  expect(para).toBe('a@b.com');
  expect(link.startsWith('https://becogames.app/nova-senha#token=')).toBe(true);
  const token = link.split('#token=')[1]!;
  expect(await contas.novaSenha(token, 'senha-nova-1')).toMatchObject({ ok: true });
  expect(await contas.novaSenha(token, 'senha-nova-2')).toEqual({ ok: false, erro: 'link-vencido' });
  expect(await contas.entrar('a@b.com', 'senha-nova-1')).toMatchObject({ ok: true });
});
it('a senha nova derruba as sessões antigas', async () => {
  const antiga = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
  const token = tokenDoLink((await contas.pedirRecuperacao('a@b.com'))!.link);
  await contas.novaSenha(token, 'senha-nova-1');
  expect(await contas.sessao(antiga.token)).toBeNull();
});
it('vence em 1 hora e o pedido novo invalida o velho', async () => {
  await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' });
  const velho = tokenDoLink((await contas.pedirRecuperacao('a@b.com'))!.link);
  const novo = tokenDoLink((await contas.pedirRecuperacao('a@b.com'))!.link);
  expect(await contas.novaSenha(velho, 'senha-nova-1')).toEqual({ ok: false, erro: 'link-vencido' });
  relogio.avancar(3600_000 + 1);
  expect(await contas.novaSenha(novo, 'senha-nova-1')).toEqual({ ok: false, erro: 'link-vencido' });
});
it('sem conta não há e-mail', async () => { expect(await contas.pedirRecuperacao('ninguem@b.com')).toBeNull(); });
it('o Resend recebe o remetente e a chave, e a rede caída não lança', async () => {
  const pedidos: Request[] = [];
  const c = carteiroDoResend('re_teste', async (r) => { pedidos.push(new Request(r)); return new Response('{}', { status: 200 }); });
  expect(await c.enviar({ para: 'a@b.com', ...emailDeNovaSenha('https://becogames.app/nova-senha#token=x') })).toEqual({ ok: true, status: 200 });
  expect(pedidos[0]!.headers.get('authorization')).toBe('Bearer re_teste');
  expect(JSON.parse(await pedidos[0]!.text())).toMatchObject({ from: 'Beco Games <nao-responda@becogames.app>', to: ['a@b.com'] });
  const caido = carteiroDoResend('re_teste', async () => { throw new Error('rede'); });
  expect(await caido.enviar({ para: 'a@b.com', ...emailDeNovaSenha('x') })).toEqual({ ok: false, status: 0 });
});
```

- [ ] **Passo 2:** → FALHA. **Passo 3:** implementar. **Passo 4:** → PASSA.
- [ ] **Passo 5: e-mail de verdade, uma vez.** Com a chave de `~/.config/sinuca/resend-api-key`, lida pelo script e nunca impressa, um script de prova em `.outros/lote-54/` manda `emailDeNovaSenha` com um link de mentira para `contato@becogames.app`, que encaminha ao Gmail do usuário. Registre só o status. Depois, aprovar.

---

### Tarefa 5: o HTTP da conta, o Worker e o objeto (lote L55, Backend, sonnet, `high`)

**Arquivos:**
- **Criar, em `apps/conta/src/`:**
  - `http.ts` e o teste `http.test.ts`;
  - `limite-taxa.ts`, cópia de `apps/sala/src/limite-taxa.ts`, com o comentário de onde veio;
  - `worker/entrada.ts` e `worker/banco-do.ts`.
- **Mudar:** `apps/conta/src/contrato.ts` e `apps/conta/CLAUDE.md`.

**Interfaces:**
- **Produz, em `contrato.ts`:**
  - `PedidoDaConta { acao: string; metodo: string; origem: string | null; ip: string; cookie: string | null; convidado: string | null; corpo: string | null }`;
  - `RespostaDaConta { status: number; corpo: Readonly<Record<string, unknown>>; cookie?: string }`;
  - `interface ApiDoBanco`, com todos os métodos async:
    - `tratar(p: PedidoDaConta): Promise<RespostaDaConta>`;
    - `contaDaSessao(token: string): Promise<{ id: string; nome: string } | null>`;
    - `contaDoCodigo(codigo: string): Promise<{ id: string; convidado: boolean } | null>`;
    - `garantirConta(id: string, saldoInicial: number)`;
    - `saldo(id: string)`;
    - `aplicar`, `debitar`, `creditar`, `reservar`, `liquidar` e `devolver`, com as assinaturas da Tarefa 2, só que assíncronas;
    - `operacao(chave: string): Promise<ResultadoDeMoeda | null>`: o resultado guardado de uma chave, ou `null` se ela nunca foi aplicada. A sinuca precisa disso para fechar uma compra pendente depois de uma queda sem fabricar moeda. Vem de `Moedas.operacao`, acrescentado no L54.
    - `saldos(ids: readonly string[]): Promise<Readonly<Record<string, SaldoDaConta | null>>>`, com até 500 ids por chamada;
    - `importarSaldos(lote: readonly { id: string; saldo: number }[]): Promise<{ criadas: number; iguais: number; conflitos: readonly string[] }>`, com até 500 por chamada (é a migração da Parte 3): cria só a conta de convidado que falta, com a abertura no livro e a chave `migracao:<id>`; a que existe com outro saldo vai para `conflitos`, sem mudar nada.
- **Produz, em `http.ts`:**
  - `class HttpDaConta`, com o construtor `constructor(o: { contas: Contas; carteiro: Carteiro | null; log: (evento: string, dados: Record<string, unknown>) => void; relogio: () => number; dominioDoCookie: string | null; cookieSeguro: boolean; origensDeDev: readonly string[]; depois: (p: Promise<unknown>) => void })`, e o método `tratar(p: PedidoDaConta): Promise<RespostaDaConta>`;
  - a constante `MAX_CORPO = 8 * 1024`.
- **Produz, no Worker:**
  - `BancoDO extends DurableObject` monta `Moedas`, `Contas` e `HttpDaConta` uma vez, cria o esquema no construtor (`blockConcurrencyWhile`), tem `depois = (p) => this.ctx.waitUntil(p)` e implementa `ApiDoBanco`;
  - `Banco extends WorkerEntrypoint` repassa cada método ao objeto `env.BANCO.get(env.BANCO.idFromName('banco'), { locationHint: env.LOCAL_DO })` (sem a dica quando `LOCAL_DO` é vazio);
  - o `fetch` padrão responde `GET /saude` com `{ ok: true }` e 404 a todo o resto.

**As rotas (`acao`):**

| Ação | Método | Corpo | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `criar` | POST | `{ email, senha, nome }`, com o `convidado` do pedido (o jogo, na Parte 4) | 201 `{ conta }` + cookie | 400 campo, 409 `email-em-uso` e `convidado-ja-e-conta`, 429, 503 |
| `entrar` | POST | `{ email, senha }` | 200 `{ conta }` + cookie | 401 `email-ou-senha`, 429 |
| `eu` | GET | — | 200 `{ conta }` (+ cookie se `renovada`) | 401 `sem-sessao` |
| `sair` | POST | — | 200 `{ ok: true }` + cookie apagado | — |
| `nome` | POST | `{ nome }` | 200 `{ conta }` | 400, 401 |
| `excluir` | POST | `{ senha }` | 200 `{ ok: true }` + cookie apagado | 401 `senha-errada` e `sem-sessao` |
| `esqueci` | POST | `{ email }` | 200 `{ ok: true, mensagem }`, **sempre** | 429 |
| `nova-senha` | POST | `{ token, senha }` | 200 `{ conta }` + cookie | 400 `link-vencido` e campo, 429 |

**Regras do `tratar`:**
- **A ordem das checagens:**
  1. ação desconhecida → 404; método errado → 405;
  2. `POST` sem `Origin` permitido → 403 `origem`;
  3. corpo acima de `MAX_CORPO` → 413;
  4. JSON inválido ou campo que falta → 400;
  5. os baldes → 429 com `tenteEmS`;
  6. só então `Contas`.
- **O `conta` da resposta** é `{ nome, email, saldo }`, sem `id`.
- **O cookie:**
  - `becogames_sessao=<token>; Max-Age=7776000; Domain=<dominioDoCookie>; Path=/; HttpOnly; Secure; SameSite=Lax`;
  - sem `Domain` quando `dominioDoCookie` é nulo (dev); sem `Secure` só quando `cookieSeguro` é falso;
  - para apagar, o mesmo cookie com o valor vazio e `Max-Age=0`;
  - o token lido do cookie tem de casar com `/^[A-Za-z0-9_-]{43}$/`, senão é ignorado.
- **Os baldes**, em `BaldesPorChave` com capacidade e reposição por segundo. A chave de e-mail é o `resumoHex` do e-mail normalizado, nunca o e-mail:

  | Balde | Capacidade | Reposição |
  | --- | --- | --- |
  | `entrarPorIp` | 20 | 20/h |
  | `entrarPorEmail` | 5 | 5 a cada 15 min |
  | `criarPorIp` | 3 | 3/h |
  | `esqueciPorIp` | 5 | 5/h |
  | `esqueciPorEmail` | 3 | 3/h |
  | `novaSenhaPorIp` | 10 | 10/h |
- **Esqueci:** com conta e carteiro, o envio vai em `depois(...)` e a resposta não espera por ele. A `mensagem` é sempre "Se houver uma conta com este e-mail, mandamos um link para criar a senha nova. Confira também o spam."
- **Mensagens dos erros** (o campo `mensagem` do corpo):

  | Erro | Mensagem |
  | --- | --- |
  | `email-invalido` | "Confira o e-mail." |
  | `senha-curta` | "A senha precisa ter pelo menos 8 caracteres." |
  | `senha-longa` | "A senha pode ter até 128 caracteres." |
  | `nome-invalido` | "O nome precisa ter de 1 a 20 caracteres." |
  | `email-em-uso` | "Este e-mail já tem conta. Entre com ele ou peça uma senha nova." |
  | `email-ou-senha` | "E-mail ou senha errados." |
  | `link-vencido` | "Este link venceu ou já foi usado. Peça outro." |
  | `sem-sessao` | "Você não está na sua conta." |
  | `senha-errada` | "Senha errada." |
  | `convidado-ja-e-conta` | "Esta carteira já é de uma conta." |
  | `cheio` e `nao-configurado` | "A conta está fora do ar. Tente mais tarde." |
  | 429 | "Muitas tentativas. Tente de novo daqui a pouco." |
  | 403 | "Pedido recusado." |
- **O log** leva só o `evento` (`conta-criada`, `entrou`, `recuperacao-pedida`, `recuperacao-enviada` com o `status`, `limite`, `origem-recusada`) e `conta: id.slice(0, 8)`. O teste varre o log atrás de e-mail, senha, token e código.

- [ ] **Passo 1: testes que falham** (em `http.test.ts`, com `bancoDeTeste` e `carteiroFalso`)

```ts
const pedido = (acao: string, corpo?: object, extra: Partial<PedidoDaConta> = {}): PedidoDaConta =>
  ({ acao, metodo: corpo ? 'POST' : 'GET', origem: 'https://becogames.app', ip: '1.2.3.4', cookie: null, convidado: null, corpo: corpo ? JSON.stringify(corpo) : null, ...extra });

it('criar devolve o cookie com todos os atributos e sem o id', async () => {
  const r = await http.tratar(pedido('criar', { email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
  expect(r.status).toBe(201);
  expect(r.corpo).toEqual({ conta: { nome: 'A', email: 'a@b.com', saldo: 100 } });
  expect(r.cookie).toMatch(/^becogames_sessao=[A-Za-z0-9_-]{43}; Max-Age=7776000; Domain=\.becogames\.app; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
});
it('Origin de fora, nulo ou ausente é recusado antes de tudo', async () => {
  for (const origem of ['https://evil.app', 'https://becogames.app.evil.app', 'http://becogames.app', 'null', null])
    expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: 'x' }, { origem }))).status).toBe(403);
  expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: 'segredo-bom' }, { origem: 'https://sinuca.becogames.app' }))).status).not.toBe(403);
});
it('corpo grande é 413 sem hash', async () => {
  expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: 'x'.repeat(MAX_CORPO) }))).status).toBe(413);
  expect(hashChamado).toBe(0);
});
it('esqueci responde igual com e sem conta e não espera o e-mail', async () => {
  await http.tratar(pedido('criar', { email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
  const com = await http.tratar(pedido('esqueci', { email: 'a@b.com' }));
  const sem = await http.tratar(pedido('esqueci', { email: 'z@b.com' }));
  expect(com).toEqual(sem);
  expect(carteiro.enviados).toHaveLength(0); await depoisTudo(); expect(carteiro.enviados).toHaveLength(1);
});
it('o quarto criar do mesmo IP na hora é 429', async () => {
  for (let i = 0; i < 3; i++) expect((await http.tratar(pedido('criar', { email: `c${i}@b.com`, senha: 'segredo-bom', nome: 'C' }))).status).toBe(201);
  expect((await http.tratar(pedido('criar', { email: 'c9@b.com', senha: 'segredo-bom', nome: 'C' }))).status).toBe(429);
});
it('o sexto entrar errado no mesmo e-mail é 429 mesmo de outro IP', async () => { /* 5 erros com IPs diferentes, o 6º → 429 */ });
it('eu renova o cookie só quando a sessão renovou', async () => { /* relógio + 1 dia → r.cookie definido; logo depois → undefined */ });
it('sair apaga o cookie', async () => { expect((await http.tratar(pedido('sair', {}, { cookie: c }))).cookie).toMatch(/^becogames_sessao=; Max-Age=0;/); });
it('o log não leva nada sensível', async () => {
  /* faz criar, entrar, esqueci e nova-senha; depois: */
  const texto = JSON.stringify(logs);
  for (const proibido of ['a@b.com', 'segredo-bom', tokenDaSessao, tokenDoLink, CODIGO]) expect(texto).not.toContain(proibido);
});
it('em dev, sem domínio, o cookie é do host', async () => { expect(httpDev(...).cookie).not.toContain('Domain='); });
```

- [ ] **Passo 2:** → FALHA. **Passo 3:** implementar `http.ts` e o Worker.
- [ ] **Passo 4: provas.**
  - `pnpm exec vitest run apps/conta` → PASSA.
  - Na fumaça, com um `.dev.vars` de mentira (`PEPPER_DA_SENHA` aleatório, sem `RESEND_API_KEY`), `cd apps/conta && pnpm dev` numa porta livre: `curl -s localhost:<porta>/saude` → `{"ok":true}` e `curl -s -o /dev/null -w '%{http_code}' localhost:<porta>/entrar` → `404`. Feche o processo por `kill <PID>` e apague `.wrangler`.
- [ ] **Passo 5:** aprovar. **O Juiz (opus, `high`) revisa a Tarefa 1 até a 5 juntas** (segurança): `apps/conta/src/**`, com foco na seção "Foco da revisão", no cookie, no Origin, nos baldes, no log e na transação sem `await`.

---

### Tarefa 6: as telas de conta no portal (lote L56, Frontend, sonnet, `medium`)

**Arquivos:**
- **Criar, em `apps/portal/`:**
  - `src/entrada.ts` e `src/entrada.test.ts`, mais `tsconfig.json` e o script `typecheck` no `package.json`;
  - em `public/`: `entrar/index.html`, `criar-conta/index.html`, `esqueci-a-senha/index.html`, `nova-senha/index.html`, `minha-conta/index.html` e `conta.js`;
  - o teste de integração `apps/portal/src/integracao.test.ts`.
- **Mudar, em `apps/portal/`:** `wrangler.jsonc`, `public/_headers`, `public/estilo.css`, `public/robots.txt`, `public/privacidade/index.html`, `public/termos/index.html` e `CLAUDE.md`.

**Interfaces:**
- **Usa:** `import type { ApiDoBanco, PedidoDaConta, RespostaDaConta } from '@sinuca/conta/contrato'`.
- **Produz:**
  - `export default { fetch(request: Request, env: { ASSETS: Fetcher; CONTA: ApiDoBanco }): Promise<Response> }`;
  - `pedidoDoRequest(request: Request, acao: string): Promise<PedidoDaConta | Response>`, que lê o corpo com o limite de 8 KB e devolve 413 direto;
  - `respostaDaConta(r: RespostaDaConta): Response`, com JSON, `Cache-Control: no-store`, `Set-Cookie` quando houver, `X-Content-Type-Options: nosniff`.

**Regras:**
- **No `wrangler.jsonc`:** `main: src/entrada.ts`, `assets.binding: "ASSETS"`, `run_worker_first: ["/api/*"]` e `services: [{ binding: "CONTA", service: "becogames-conta", entrypoint: "Banco" }]`. As `routes`, o `workers_dev: false` e o `html_handling` ficam como estão.
- **Na rota:** `/api/conta/<acao>`, com `acao` em `/^[a-z-]{1,20}$/`; o resto de `/api/*` dá 404. O `ip` sai de `CF-Connecting-IP`, e `convidado` é sempre `null` no portal.
- **No `_headers`:** só `connect-src 'self'` muda. As páginas de conta levam `<meta name="robots" content="noindex">` e o `robots.txt` ganha `Disallow` para elas; ficam fora do `sitemap.xml`.
- **Nas páginas:**
  - o mesmo cabeçalho e rodapé do L51, com formulários de `<label>` visível e `autocomplete` (`email`, `current-password`, `new-password`, `nickname`);
  - erros num `role="alert"` com a `mensagem` da API e o botão desabilitado enquanto espera;
  - nada inline: o `conta.js` serve todas as páginas pelo `data-pagina` do `<body>`.
- **Os fluxos:**
  - **entrar:** e-mail e senha; com sucesso vai a `/minha-conta`, com os links "Criar conta" e "Esqueci a senha";
  - **criar-conta:** e-mail, nome e senha (com a regra dos 8 caracteres na tela), e a frase "Sem confirmação de e-mail: é só um login.";
  - **esqueci-a-senha:** e-mail, e mostra sempre a `mensagem` da API;
  - **nova-senha:** lê o `#token=`, apaga o fragmento na hora (`history.replaceState`), pede a senha duas vezes e faz `POST`; sem token mostra "Este link venceu ou já foi usado. Peça outro." com o link para o esqueci;
  - **minha-conta:** `GET eu`; com 401 vai a `/entrar`; mostra o nome (editável), o e-mail e o saldo em moedas, mais "Sair" e "Excluir minha conta", que pede a senha num campo e confirma num segundo botão, nunca por `confirm()`.
- **O link "Entrar" do cabeçalho** fica escondido (`hidden`) até a Parte 4 ser publicada. As páginas existem e funcionam pelo endereço.
- **A política de privacidade** ganha a seção "Conta", com:
  - o que fica guardado: e-mail, nome, a senha só como hash, o saldo e o registro das moedas;
  - o cookie `becogames_sessao`, essencial, só para manter o login, sem consentimento;
  - o e-mail, que serve só para a senha nova e sai por um serviço de envio (Resend);
  - como excluir: em Minha conta;
  - o que acontece ao excluir: tudo apagado, menos o registro das moedas sem dados pessoais.
- **Os termos** ganham uma linha: "Cada pessoa cuida da própria senha; as moedas não valem dinheiro."

- [ ] **Passo 1: testes que falham.**
  - **`entrada.test.ts`**, com um `CONTA` falso que grava o pedido:
    - `/api/conta/entrar` repassa a `Origin`, o IP do `CF-Connecting-IP`, o cookie e o corpo, com `convidado: null`;
    - o corpo de 9 KB dá 413 sem chamar o `CONTA`;
    - `/api/outra` dá 404;
    - `/` vai ao `ASSETS`;
    - a resposta tem o `Set-Cookie` e `no-store`.
  - **`integracao.test.ts`**, no molde de `apps/sala/src/worker-integracao.test.ts`:
    - sobe `wrangler dev --local -c apps/portal/wrangler.jsonc -c apps/conta/wrangler.jsonc` com o `.dev.vars` de teste, mais `DOMINIO_DO_COOKIE=""` e `COOKIE_SEGURO="0"`;
    - roda criar → eu → sair → eu (401) → entrar → esqueci (200, a mesma mensagem com e sem conta) → `Origin` de fora (403) → nome → excluir → entrar (401).
- [ ] **Passo 2:** → FALHA. **Passo 3:** implementar.
- [ ] **Passo 4: provas.**
  - **Testes:** `pnpm exec vitest run apps/portal`.
  - **Navegador:** no Chrome headless contra o `wrangler dev` dos dois, as capturas desktop (1440) e celular (390) de entrar, criar conta e minha conta em `.outros/lote-56/`, e a `folha.png`. Exigido: 0 erros de console, 0 violações de CSP e sem rolagem horizontal.
  - **Lighthouse** de `/entrar`: ≥ 90 nas quatro notas.
  - **Fim:** `pnpm test`, `pnpm typecheck` e `pnpm lint`. Feche os processos por `kill <PID>` e apague `/tmp/sinuca-chrome-*` e os `.wrangler`.
- [ ] **Passo 5:** aprovar.

---

## Partes 2 a 4 (esboço; cada uma ganha o seu plano detalhado quando a anterior fechar)

### Parte 2: a sinuca lendo o saldo do Banco (Backend, `high`; Juiz obrigatório)

**Desenho: espelho e caixa de saída.**
- A máquina da sala (`sala.ts`) e a `CarteirasBase` são síncronas. Elas continuam assim: o Banco é o dono do saldo, e a sinuca guarda só um **espelho**, o `Guardada.saldo` de hoje, e uma **caixa de saída** (a tabela `saida_do_banco` no `SalaDO`).
- Cada operação de moeda vira uma linha da caixa, com a chave idempotente, gravada **na mesma transação** que o estado da sinuca (estatísticas, missões, itens).
- Um despachante manda as linhas ao Banco em ordem, apaga cada uma no sucesso e atualiza o espelho com os `saldos` devolvidos. A linha que falhou volta pelo alarm, com a mesma chave.

**A ligação:**
- no `apps/sala/wrangler.jsonc`, `services: [{ binding: "CONTA", service: "becogames-conta", entrypoint: "Banco" }]`;
- a var `SALDO_NO_BANCO`, "0" até a migração. Desligada, não há caixa nem chamada ao Banco: tudo fica como hoje.
- A sala Node usa o núcleo `Moedas` do `apps/conta` sobre `node:sqlite` (`PASTA_DADOS/banco.sqlite`), atrás da mesma interface `BancoDaSala` (um subconjunto de `ApiDoBanco`).

**Cada movimento e a sua chave** (a chave leva sempre o `id` inteiro, porque `operacoes` é única por chave):
- **Carteira nova:** a caixa manda `garantirConta(id, SALDO_INICIAL)`.
- **Presente:** a caixa manda `creditar(id, valor, 'presente:<rotulo>:<id>')`. A marca `presentes` continua na carteira e é gravada junto.
- **Prêmio de missão:** a caixa manda `creditar(id, premio, 'missao:<dia>:<missao>:<id>')`, junto com o progresso.
- **Aposta:**
  - no `comecar`, a caixa manda `reservar(lote, 'aposta:<sala>:<n>')`;
  - no `pagarAposta`, as estatísticas mais `liquidar(chave, variacoes)`, na mesma transação;
  - a anulada manda `devolver`;
  - a `aposta-paga` sai na hora, com o saldo do espelho mais o delta (o `liquidar` não tem piso, então o resultado é esse);
  - `reserva-inexistente` no despacho só loga `aposta-falhou`, como a carteira sumida de hoje.
- **Compra** (a única que precisa de resposta antes): o HTTP já é assíncrono.
  1. grava `compras_pendentes` (`chave`, `id`, item, preço);
  2. `await debitar(id, preco, 'compra:<id>:<n>')`;
  3. com `ok`, dá o item e apaga a pendência numa transação; com recusa, apaga a pendência e responde o erro de hoje (`saldo-insuficiente`).
  - Ao acordar e no alarm, cada pendência pergunta `operacao(chave)`: aplicada, dá o item; nunca aplicada, apaga. Nunca estorna às cegas.
- **Leitura:** `GET /carteira` e o `entrar` na sala atualizam o espelho com `saldo(id)`, porque outro jogo pode ter gastado. O espelho só mostra; o piso é sempre o do Banco.

**O que não muda:** o campo `saldo` das mensagens e do `/carteira*`. O cliente não muda, e a janela de versões do protocolo continua.

**Testes:**
- queda entre o débito e o item: a pendência dá o item ao acordar;
- débito que não chegou: a pendência apaga sem estornar;
- o despacho repetido não paga duas vezes;
- o Banco fora do ar: a caixa cresce, o jogo segue e o alarm drena depois;
- com `SALDO_NO_BANCO=0`, a suíte de hoje passa sem mudança.

### Parte 3: a migração (Backend, `high`; Juiz `high` obrigatório; janela com 0 salas)

**Pelo RPC, sem rota pública no Banco.** O service binding já é a autorização, e o `ApiDoBanco` ganha (no L55):
- `saldos(ids)`: até 500 por chamada;
- `importarSaldos(lote: { id, saldo }[])`: cria só as contas de convidado que faltam, com esse saldo e a abertura no livro com a chave `migracao:<id>`. A que já existe com o mesmo saldo conta como `iguais`; com outro saldo vai para `conflitos`, sem mudar nada.

**A sinuca ganha duas rotas de administração**, com o `SEGREDO_ADMIN` de hoje e só com 0 salas:
- `POST /admin/levar-saldos-ao-banco` manda os espelhos em lotes e devolve `{ criadas, iguais, conflitos, somaSinuca, somaBanco }`;
- `POST /admin/espelhar-saldos` copia os saldos do Banco para os espelhos. É o caminho de volta.

**O passo a passo** (os roteiros `.outros/migrar-saldos.sh` e `.outros/voltar-saldos.sh`, do L60):
0. **Antes da janela:** o `becogames-conta` publicado, com os segredos, e a sinuca publicada com as rotas novas e `SALDO_NO_BANCO=0`.
1. Esperar 0 salas.
2. `migrar-saldos.sh`:
   - faz a cópia das carteiras;
   - roda `levar-saldos-ao-banco`;
   - para com `erro` (409 para conflito, somas diferentes, `mudou-durante`, `caixa-cheia` e `salas-abertas`).
3. Publicar a sinuca com `SALDO_NO_BANCO=1`.
4. `migrar-saldos.sh depois`: a cópia de depois.

**O caminho de volta:**
1. `voltar-saldos.sh` (`espelhar-saldos`), com a chave ainda ligada;
2. só depois, publicar com `SALDO_NO_BANCO=0`.

O ensaio está no `worker-migracao-integracao.test.ts` (ida, chave ligada e volta, sobre o mesmo estado). Sem ele verde, a volta está proibida.

### Parte 4: o login na sinuca (Backend `high` e Frontend `medium`)

- **No Worker da sinuca:**
  - `/conta/*` → `env.CONTA.tratar` com o `convidado` do `Authorization: Bearer` (o código de hoje);
  - no `/carteira*` e no WebSocket `/sala`, o cookie de sessão válido manda: `contaDaSessao` → o `id` da conta; sem ele, o código do convidado;
  - a carteira de itens do `id` de uma conta criada no portal nasce vazia na primeira vez que a sinuca o vê, com o presente uma vez.
- **No cliente:**
  - "Entrar / Criar conta" no menu e no perfil, mais o nome, sair e excluir;
  - "Sair" volta a ser um convidado novo e vazio;
  - entrar numa conta existente com uma carteira de convidado no navegador avisa que as duas não se somam (como o L43);
  - o apelido da mesa passa a ser o nome da conta.
- **Excluir:** a sinuca apaga os itens do `id` na hora quando o pedido passou por ela. Do portal, isso fica para uma varredura: o RPC `excluidasDesde(ms)` no alarm da sala.
- **A publicação:** a sinuca primeiro, depois o portal com o link "Entrar" visível.
- **Antes do jogo novo:** recomendar ao usuário desligar o `PRESENTE_DE_TESTE`.

## Publicação (cada passo só com o pedido do usuário)

1. **Depois da Tarefa 5 aprovada:** os segredos (`wrangler secret put PEPPER_DA_SENHA`, de 32 bytes aleatórios gerados na hora e sem eco; e `RESEND_API_KEY`, lida de `~/.config/sinuca/resend-api-key`) e o `wrangler deploy` de `becogames-conta`. Não tem efeito público: só `/saude`.
2. **O portal da Tarefa 6** sobe só com a Parte 4. Antes disso, uma conta criada no portal não teria onde jogar.
3. **As Partes 2 e 3** sobem juntas, na janela da migração.
