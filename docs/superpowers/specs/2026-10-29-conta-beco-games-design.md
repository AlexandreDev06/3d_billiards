# Conta Beco Games — documento de projeto

**Data:** 2026-10-29. **Estado:** aprovado pelo usuário em 2026-10-29. Plano: `docs/superpowers/plans/2026-10-29-conta-beco-games.md`.

## Por quê

O usuário vai criar um jogo novo na Beco Games (`becogames.app`). As moedas serão **as mesmas em todos os jogos**: o que a pessoa ganha na sinuca, ela gasta no jogo novo, e o contrário.

Hoje a moeda é da sinuca:
- vive na carteira do Durable Object `SalaDO` do Worker `sinuca-sala`;
- é identificada por um código secreto guardado no `localStorage` de `sinuca.becogames.app` (no servidor fica só o SHA-256 dele);
- não tem login. Outro jogo, em outro subdomínio, não enxerga nada disso.

## O que o usuário decidiu

- **Conta com e-mail e senha.** Sem confirmação de e-mail ("é apenas um login"), sem login social.
- **A conta guarda o nome e as moedas.** O nome é o apelido que aparece na mesa.
- **Moedas comuns** a todos os jogos e a qualquer aparelho.
- **Modo convidado:** joga sem criar nada, como hoje, com a carteira só naquele navegador.
- **Do convidado para a conta:** ao criar a conta, as moedas que o convidado já juntou passam para ela. Quem já tem moedas na sinuca hoje leva tudo ao criar a conta naquele navegador.
- **Login único:** entra uma vez e vale para todos os jogos do domínio.
- **Itens da sinuca** (tacos, enfeites do balão, missões e estatísticas): continuam sendo da sinuca, presos à conta (vão junto para outro aparelho), sem aparecer no jogo novo.
- **Esqueci a senha:** um link por e-mail, enviado pelo **Resend** de `nao-responda@becogames.app`.
  - O domínio já está verificado no Resend (região São Paulo).
  - A chave de envio está em `~/.config/sinuca/resend-api-key` (600, fora do repo).
  - O envio de teste chegou na caixa de entrada.

## Objetivos

1. Uma pessoa cria a conta (e-mail, senha e nome) em qualquer jogo ou no portal, e entra nos outros jogos já logada.
2. **As moedas têm um dono só, um serviço da Beco Games:** saldo, crédito e débito valem para qualquer jogo, com a mesma garantia de hoje (tudo ou nada e nada de gasto duplo).
3. **O convidado continua como hoje.** Criar a conta transforma a carteira dele na conta, com o mesmo saldo e os mesmos itens da sinuca.
4. Entrar em outro aparelho com e-mail e senha traz o saldo e os itens da sinuca.
5. Esqueci a senha → e-mail com link → senha nova.
6. **Migração sem perder uma moeda:** as carteiras que existem hoje na Cloudflare seguem valendo, para convidado e para quem criar a conta.

## Não objetivos

- Confirmação de e-mail, login social, autenticação em dois fatores.
- Dinheiro de verdade: as moedas continuam virtuais, sem compra nem saque (é o que dizem os termos).
- Mostrar os itens da sinuca no jogo novo.
- Construir o jogo novo. Aqui entra só o que ele vai usar: a conta e as moedas.

## Antiobjetivos (fracasso mesmo funcionando)

- **Perder ou duplicar moedas** de alguém na migração, numa aposta ou numa compra.
- **Moeda infinita.** Hoje cada carteira nova ganha o presente de teste (`PRESENTE_DE_TESTE`, 10 000 moedas). Se várias carteiras de convidado puderem ser somadas numa conta, alguém fabrica moedas sem fim.
- **Senha ou código em log, em URL, ou guardado sem hash.** Recuperação de senha que diga se um e-mail tem conta.
- **Derrubar partidas** em andamento por causa da conta: as publicações continuam só com a sala vazia.

## Restrições

- **Cloudflare no plano grátis:**
  - Worker com 10 ms de CPU por requisição;
  - Durable Object com até 30 s de CPU por requisição e SQLite;
  - 100 000 requisições ao objeto por dia.
  - **O hash da senha não cabe nos 10 ms do Worker:** vai dentro de um Durable Object.
- **O PBKDF2 do Workers tem teto de 100 000 iterações.** A recomendação para SHA-256 é bem maior, então o hash leva também um segredo do servidor (pepper, `wrangler secret`), além do sal por conta.
- **Resend grátis:** 100 e-mails por dia e 3 000 por mês. Só a recuperação de senha manda e-mail.
- **Regras do repositório que continuam valendo:**
  - publicar só com 0 salas (`.outros/publicar-quando-vazio.sh`) e a cópia das carteiras logo depois;
  - nunca segredo em arquivo versionado nem em log;
  - LGPD: a política de privacidade passa a dizer que guardamos o e-mail;
  - contrato de `packages/*` só muda pelo dono;
  - o cliente da versão anterior aberto num navegador não pode quebrar (a janela de versões do protocolo, como no L47).
- **Origens:**
  - o portal está em `becogames.app` (Worker `becogames-portal`, só assets);
  - a sinuca em `sinuca.becogames.app` (Worker `sinuca-sala`);
  - o `workers.dev` antigo redireciona para o novo.

## Como fica (decisões técnicas do Principal, para o usuário conferir)

**1. O Banco: um serviço novo de contas e moedas.**
- É um Worker novo, `becogames-conta`, numa pasta nova `apps/conta/` cujo dono é o Backend.
- Tem um Durable Object só, `BancoDO`, com SQLite, que guarda:
  - **as contas:** o `id`, o e-mail normalizado (único), o nome, o hash da senha com o sal, a data de criação e se é de convidado;
  - **o saldo de cada conta;**
  - **as sessões:** o SHA-256 do token, a conta e a validade;
  - **os pedidos de recuperação de senha:** o SHA-256 do token, a conta, a validade de 1 h e se já foi usado;
  - **o livro das moedas:** cada crédito e débito com a chave de idempotência, o jogo, o motivo e o valor.
- **O convidado também é uma conta** do Banco, só que sem e-mail e sem senha, identificada pelo código secreto de hoje: o mesmo `id`, o SHA-256 do código.
- Assim, "criar a conta a partir do convidado" é só pôr o e-mail, a senha e o nome na mesma linha. O `id` não muda, então os itens da sinuca presos a ele continuam valendo.
- **API para os jogos,** por service binding (RPC entre Workers, sem passar pela internet):
  - `contaDaSessao(token)` e `contaDoCodigo(codigo)`;
  - `saldo(id)`;
  - `aplicar(variacoes, chave)`: lote tudo ou nada de créditos e débitos em várias contas;
  - `reservar`, `liquidar` e `devolver`: a aposta (item 10);
  - `debitar(id, valor, chave)` e `creditar(id, valor, chave, motivo)`.
- **A `chave` torna cada operação repetível sem efeito duplo:** a mesma chave duas vezes aplica uma vez só.

**2. A sinuca passa a pedir as moedas ao Banco.**
- O `SalaDO` continua dono dos itens da sinuca (tacos, sementes, balão, missões, estatísticas) e das apostas, mas o **saldo** sai dele.
- **Aposta:** a sala reserva no começo e liquida no fim (item 10), com a chave da partida. As estatísticas e o progresso continuam na sinuca.
- **Compra:** primeiro o `debitar` com a chave da compra; depois a sala dá o item.
  - Se dar o item falhar, a sala credita de volta com a chave do estorno.
  - O livro do Banco e um registro de compras pendentes na sinuca fecham a conta depois de uma queda.
- **Prêmio de missão e presente de teste:** `creditar` com a chave do dia, da missão ou do rótulo.
- **A janela de versões do protocolo continua:** o cliente aberto da versão anterior segue jogando.

**3. A migração (o maior risco).** O saldo de cada carteira existente sai do `SalaDO` para o Banco com o mesmo `id`.
- É uma operação de administração, uma vez, com as salas fechadas:
  - exporta as carteiras;
  - importa no Banco;
  - confere que a soma dos saldos é igual nos dois lados, carteira por carteira;
  - só então a sinuca passa a ler do Banco.
- O caminho de volta é escrito e testado antes, como no L47b.
- A revisão do Juiz é obrigatória.

**4. A sessão e o login.**
- **O cookie:** `becogames_sessao`, com `HttpOnly`, `Secure`, `SameSite=Lax`, `Domain=.becogames.app` e `Path=/`, para valer em todos os subdomínios.
  - A validade é de 90 dias e se renova ao usar.
  - O cookie leva um token aleatório de 32 bytes; o Banco guarda só o hash dele.
- **As telas de entrar, criar conta, esqueci a senha e nova senha** ficam dentro de cada jogo e também no portal (item 8).
- **A sinuca recebe o cookie no próprio domínio:**
  - no `/carteira*` e no WebSocket `/sala`, o Worker da sinuca pergunta ao Banco de quem é a sessão;
  - sem cookie, vale o código do convidado como hoje.
  - O cliente da sinuca não lê o cookie (`HttpOnly`): pergunta "quem sou eu" à sala.
- **Proteções:**
  - `POST` só com `Origin` de `*.becogames.app`;
  - baldes por IP e por e-mail no entrar e no esqueci;
  - comparação em tempo constante;
  - nenhum código, senha, token nem e-mail nos logs;
  - na recuperação, a resposta é sempre a mesma, com ou sem conta.
- **Criar conta diz "este e-mail já tem conta"** quando é o caso: é uma revelação aceitável num jogo e evita confusão. É escolha do Principal.

**5. O convidado e a conta, regras para não fabricar moedas.**
- **Criar a conta a partir do convidado:** a carteira do convidado (saldo e itens) vira a conta, uma para uma. Só a carteira deste navegador.
- **Entrar numa conta que já existe, com uma carteira de convidado no navegador:** as duas **não se somam**. A do convidado fica guardada e esquecida neste navegador, e a pessoa passa a ver a da conta (como a troca do L43, com aviso).
- **Uma conta por e-mail.** O presente de teste continua uma vez por carteira, e a conta herda a marca da carteira de onde veio.

**6. O nome.** O nome é o apelido da mesa, de 1 a 20 caracteres. Não é único, porque o único é o e-mail. A pessoa o muda no perfil. No convidado, continua o `sinuca.apelido` do navegador.

**7. Sair e excluir.**
- **"Sair"** apaga a sessão (no Banco e o cookie). O navegador volta a ser convidado, com uma carteira nova e vazia.
- **"Excluir minha conta"** existe por causa da LGPD: pede a senha, apaga o e-mail, o nome e o hash, e zera o saldo.
  - Os itens da sinuca ficam órfãos e são apagados pela sinuca.
- A política de privacidade passa a falar da conta e do e-mail.

**8. Onde ficam as telas de conta (decisão do Principal, depois da revisão).**
- **O código do convidado mora no `localStorage` de cada jogo.** O portal não o lê, e nada de CORS nem código em URL.
- **As telas de conta ficam dentro de cada jogo** (no menu e no perfil da sinuca), com a API no mesmo endereço do jogo: `sinuca.becogames.app/conta/*`.
  - O Worker do jogo repassa ao Banco pelo service binding, junto com o código do convidado (no cabeçalho, como o `/carteira` hoje).
  - O cookie é gravado com `Domain=.becogames.app`, permitido porque o jogo é um subdomínio, então vale nos outros jogos e no portal.
- **O portal também tem "Entrar" e "Esqueci a senha"** (`becogames.app/api/conta/*`), sem convidado: criar conta no portal cria uma conta do zero.
- **Quem cria a conta no portal** e depois abre a sinuca com uma carteira de convidado no navegador segue a regra 5: as duas não se somam.
- **O link do e-mail de nova senha** abre `becogames.app/nova-senha#token=...`. O token vai no fragmento, que não vai para a rede nem para o log de acesso; a página o manda por `POST`.

**9. Quanto nasce uma conta nova** (decisão do Principal; o usuário pode mudar):
- **Criada do zero** (no portal ou num jogo sem carteira de convidado): nasce com o `SALDO_INICIAL` de hoje (100), como um convidado novo. Ganha o presente de teste se ele estiver ligado, uma vez por conta.
- **O convidado depois de "Sair"** também nasce assim.
- **O abuso de criar contas para perder apostas de propósito** e passar moedas para outra conta já existe hoje com os convidados. A conta não piora isso. O limite de criação continua por IP (hoje 3 por hora, `criarPorIp`) e vale também para criar conta.
- **Antes do jogo novo,** o presente de teste (10 000 moedas por carteira) deve ser desligado. Ele é o que faz valer a pena fabricar contas.

**10. A aposta com moeda comum.** A sala **reserva** a aposta de cada carteira no começo da partida, com `reservar(lote, chave)` no Banco: o valor sai do saldo disponível e fica preso à partida.
- No fim, `liquidar(chave, variacoes)` paga a partir da reserva.
- Partida sem vencedor, ou anulada, faz `devolver(chave)`.
- Assim ninguém gasta em outro jogo o que está apostado, e o vencedor sempre recebe.
- Reserva sem liquidação por mais de 24 h volta sozinha.
- O saldo nunca fica negativo por moeda comum. O saldo negativo que a aposta permite hoje continua só onde já acontece.

**11. A sala Node (`pnpm online`) continua só para desenvolvimento e testes.**
- Usa o mesmo núcleo do Banco (um módulo puro, como o `CarteirasBase`) em memória ou num arquivo da pasta de dados, sem migração da Cloudflare.
- Os amigos jogam só no Worker.

**12. O caminho de volta depois da migração não pode perder movimentos.**
- Voltar à versão anterior exige antes regravar no `SalaDO` os saldos **atuais** do Banco, com uma exportação do Banco e a importação com `sobrescrever` do L47b, ambas testadas.
- Sem esse passo, o rollback está proibido no passo a passo.

## O que fica para quem construir

- **A divisão em lotes.** A ordem sugerida:
  1. o Banco com as contas, a sessão e a recuperação, mais as telas no portal;
  2. a sinuca lendo o saldo do Banco;
  3. a migração;
  4. a sinuca com o login no menu e no perfil.
- O texto e o visual das telas de conta, no estilo do portal.
- O número de iterações e o formato do hash, dentro do teto do Workers; os tamanhos dos baldes.
- Como o jogo novo vai chamar o Banco: a API acima basta, e os detalhes ficam para quando ele existir.

## Riscos

- **A migração do saldo:** perda ou duplicação de moedas reais dos amigos. Pede revisão do Juiz em `high`, cópia antes e depois, e conferência por carteira.
- **Compra e aposta em dois serviços:** a garantia de tudo ou nada passa a depender da chave de idempotência e do estorno. Pede testes de queda no meio.
- **Cota do objeto:** cada operação de moeda passa a ser também uma requisição ao `BancoDO`. Na conta das partidas por dia (`apps/sala/CLAUDE.md`), uma partida custa poucas operações de moeda (a aposta e o prêmio), então o teto continua o das mensagens da mira.
