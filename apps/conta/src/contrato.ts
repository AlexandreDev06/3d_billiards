/**
 * O que os outros Workers (sinuca, portal, jogos novos) enxergam do Banco da Beco Games. Só tipos: `apps/sala` e `apps/portal`
 * importam daqui por `@sinuca/conta/contrato`, nunca o código do núcleo. Quem chama usa o service binding (RPC) para o entrypoint
 * `Banco`, que implementa `ApiDoBanco`; nada disto passa pela internet.
 */

/** Resultado da conferência do tamanho da senha. */
export type ResultadoDeSenha = 'ok' | 'senha-curta' | 'senha-longa';

/** Uma mudança de saldo de uma conta: positiva credita, negativa debita. Nunca zero. */
export interface Variacao {
  id: string;
  delta: number;
}

/**
 * De onde veio o movimento, para o livro: `jogo` em `/^[a-z0-9-]{1,20}$/` e `motivo` de até 60 caracteres. São rótulos do livro, não
 * do efeito: ficam FORA da assinatura da idempotência. A mesma chave com as mesmas variações é a mesma operação (`repetida: true`)
 * mesmo que o `jogo` ou o `motivo` mudem na repetição, e o livro guarda os rótulos da primeira vez.
 */
export interface Lancamento {
  jogo: string;
  motivo: string;
}

export type ErroDeMoeda = 'conta-inexistente' | 'saldo-insuficiente' | 'valor-invalido' | 'conta-repetida' | 'chave-reusada' | 'reserva-inexistente';

/**
 * `saldos` são os saldos das contas da operação depois dela. `repetida: true` quer dizer que a mesma chave, com o mesmo conteúdo,
 * já tinha sido aplicada: nada mudou agora e `saldos` é o que a primeira vez devolveu.
 */
export type ResultadoDeMoeda = { ok: true; saldos: Readonly<Record<string, number>>; repetida: boolean } | { ok: false; erro: ErroDeMoeda };

/** `disponivel` = `saldo` menos o que está reservado numa aposta; é nele que `debitar` e `aplicar` têm piso. */
export interface SaldoDaConta {
  saldo: number;
  reservado: number;
  disponivel: number;
}

/** A conta como o navegador a vê. O HTTP tira o `id` antes de responder. */
export interface ContaPublica {
  id: string;
  nome: string;
  email: string;
  saldo: number;
}

export type ErroDeConta =
  | 'email-invalido'
  | 'senha-curta'
  | 'senha-longa'
  | 'nome-invalido'
  | 'email-em-uso'
  | 'email-ou-senha'
  | 'convidado-ja-e-conta'
  | 'sem-sessao'
  | 'senha-errada'
  | 'link-vencido'
  | 'cheio'
  | 'nao-configurado';

/** Conta criada ou aberta: o `token` é o da sessão (o cookie), que o Banco só guarda como resumo. */
export type ComSessao = { ok: true; conta: ContaPublica; token: string } | { ok: false; erro: ErroDeConta };

/** O pedido HTTP da conta como o portal o entrega ao Banco: já separado em partes, sem `Request`. */
export interface PedidoDaConta {
  /** A rota: `criar`, `entrar`, `eu`, `sair`, `nome`, `excluir`, `esqueci` ou `nova-senha`. Outra coisa é 404. */
  acao: string;
  /** `GET` ou `POST`, em maiúsculas. */
  metodo: string;
  /** O cabeçalho `Origin`, ou `null` se não veio. `POST` só passa com a Beco Games (ou uma origem de desenvolvimento). */
  origem: string | null;
  /** O IP do cliente (`CF-Connecting-IP`), só para os limites; nunca vai a log. */
  ip: string;
  /** O cabeçalho `Cookie` inteiro, ou `null`. */
  cookie: string | null;
  /** O código secreto da carteira de convidado (43 caracteres), para `criar` transformar o convidado em conta; `null` fora disso. */
  convidado: string | null;
  /** O corpo cru (JSON) de até `MAX_CORPO` (8 KB); o portal nem lê além disso. `null` se não há corpo. */
  corpo: string | null;
}

/**
 * A resposta para o portal repassar: `status`, o `corpo` em JSON e, se houver, o cabeçalho `Set-Cookie` inteiro em `cookie`.
 * Erros têm `{ erro, mensagem }` (e `tenteEmS` no 429); o `conta` de sucesso é `{ nome, email, saldo }`, nunca com o `id`.
 */
export interface RespostaDaConta {
  status: number;
  corpo: Readonly<Record<string, unknown>>;
  cookie?: string;
}

/**
 * O que o Banco oferece aos outros Workers (service binding, entrypoint `Banco`). Tudo assíncrono. Recusa de moeda é retorno
 * `{ ok: false, erro }`; argumento mal formado (id que não é de conta, lote grande demais) lança `RangeError`.
 */
export interface ApiDoBanco {
  /** O HTTP da conta (rotas, Origin, limites, cookie e mensagens). O portal só repassa. */
  tratar(pedido: PedidoDaConta): Promise<RespostaDaConta>;
  /** A conta de um token de sessão (o do cookie), renovando-a se for o caso; `null` se não há, venceu ou a conta foi excluída. */
  contaDaSessao(token: string): Promise<{ id: string; nome: string } | null>;
  /** O `id` de quem tem este código de convidado e se ainda é convidado; `null` se não há conta ou foi excluída. */
  contaDoCodigo(codigo: string): Promise<{ id: string; convidado: boolean } | null>;
  /** Cria a conta de convidado com `saldoInicial` se ela não existe (o saldo entra no livro). Conta existente não muda. */
  garantirConta(id: string, saldoInicial: number): Promise<{ criada: boolean; saldo: number }>;
  /** `null` se a conta não existe ou foi excluída. */
  saldo(id: string): Promise<SaldoDaConta | null>;
  /** Aplica várias variações de uma vez (tudo ou nada); delta negativo exige `disponivel >= |delta|`. Idempotente pela `chave`. */
  aplicar(variacoes: readonly Variacao[], chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda>;
  /** Tira `valor` (inteiro positivo) da conta, com piso no disponível. Idempotente pela `chave`. */
  debitar(id: string, valor: number, chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda>;
  /** Põe `valor` (inteiro positivo) na conta. Idempotente pela `chave`. */
  creditar(id: string, valor: number, chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda>;
  /** Prende `valor` do disponível de cada conta à partida `chave`; não mexe no saldo. */
  reservar(lote: readonly { id: string; valor: number }[], chave: string, lancamento: Lancamento): Promise<ResultadoDeMoeda>;
  /** Paga da reserva `chave`: aplica os deltas (único jeito de o saldo ficar negativo) e apaga a reserva. */
  liquidar(chave: string, variacoes: readonly Variacao[], lancamento: Lancamento): Promise<ResultadoDeMoeda>;
  /** Solta a reserva `chave` sem mexer em saldo (partida sem vencedor ou anulada). */
  devolver(chave: string): Promise<ResultadoDeMoeda>;
  /**
   * O resultado guardado para esta chave exata (sempre com `repetida: true`), ou `null` se ela nunca foi aplicada. O jogo que
   * perdeu a resposta pergunta aqui antes de repetir. A chave da reserva é `<chave>`; a do pagamento, `<chave>:liquidar`; a da
   * devolução, `<chave>:devolver`.
   */
  operacao(chave: string): Promise<ResultadoDeMoeda | null>;
  /**
   * Fecha a janela da operação ainda a caminho (a sinuca que perdeu a resposta de um `debitar`). Numa transação: se a chave já foi
   * aplicada, devolve o resultado guardado em `feita` (com `repetida: true`); se não, grava uma lápide e devolve `{ anulada: true }`,
   * e um `debitar`, `creditar` ou `aplicar` que chegue depois com essa chave dá `chave-reusada`, sem efeito. Repetir depois da lápide
   * dá `anulada` de novo. Chave que um jogo não pode mandar (de reserva, abertura, migração ou exclusão) lança `RangeError`.
   */
  anularSeNaoFeita(chave: string): Promise<{ feita: ResultadoDeMoeda } | { anulada: true }>;
  /** Os saldos de até 500 contas de uma vez; `null` para a que não existe ou foi excluída. Mais de 500 ids lança `RangeError`. */
  saldos(ids: readonly string[]): Promise<Readonly<Record<string, SaldoDaConta | null>>>;
  /**
   * A migração das carteiras da sinuca (até 500 por chamada): cria só a conta de convidado que falta, com a abertura no livro
   * (chave `migracao:<id>`). O saldo pode ser negativo (a sinuca não tem piso de aposta). Conta que já existe com o mesmo saldo
   * conta em `iguais`; com outro saldo vai para `conflitos`, sem mudar nada. Repetir o mesmo lote não faz nada.
   */
  importarSaldos(lote: readonly { id: string; saldo: number }[]): Promise<{ criadas: number; iguais: number; conflitos: readonly string[] }>;
  /**
   * As contas excluídas com `excluida_em >= ms` (ms desde 1970), da mais antiga para a mais nova, até `limite` (1 a 500; fora disso
   * lança `RangeError`). `ate` é o instante da última devolvida (ou `ms`, se não há): guarde-o e passe-o como `ms` na vez seguinte. O
   * `>=` repete a última no pedido seguinte, então quem limpa precisa aceitar `id` repetido. Serve para o jogo apagar o que é só dele
   * quando a conta foi excluída por outro caminho (o portal).
   */
  excluidasDesde(ms: number, limite: number): Promise<{ ids: string[]; ate: number }>;
}
