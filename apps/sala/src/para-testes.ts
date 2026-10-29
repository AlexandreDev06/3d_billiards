/** Apoio dos testes da sala: conexões falsas, relógio manual e um "cliente" que joga com a física real. Não é usado em produção. */
import {
  CONFIG_FISICA_PADRAO,
  bolaParada,
  criarRng,
  lugares,
  medidasDaBola,
  mesaInicial,
  posicaoLivre,
  simularTacada,
  type EstadoMesa,
  type EventoTacada,
  type ParametrosTacada,
} from '@sinuca/fisica';
import {
  LUGARES_POR_MODO,
  PROTOCOLO_VERSAO,
  type MensagemDaSala,
  type MensagemDoCliente,
  type ModoSala,
  type MsgCriarSala,
  type MsgErro,
  type MsgEstadoSala,
  type MsgTacada,
} from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESETS_DE_FABRICA, aplicarTacada, type ConfigRegras, type Consequencias, type EstadoPartida, type LugarMesa } from '@sinuca/regras';
import { CONFIG_SALA_PADRAO, type ConfigSala } from './config';
import { Registro, type DependenciasRegistro } from './registro';
import { criarRng as criarRngDaSala } from './rng';
import type { Conexao } from './sala';

/**
 * As skins que os testes compram para conferir preço. A vitrine do dia (L34) dá 20% de desconto em 3 skins e troca todo dia;
 * por isso o servidor de teste sobe com o relógio em `INSTANTE_SEM_VITRINE`, um dia em que nenhuma delas está na vitrine, e
 * nenhum teste de preço muda de resultado conforme o dia em que roda. Quem testa a vitrine pede o seu relógio.
 */
export const SKINS_QUE_OS_TESTES_COMPRAM = ['ebano', 'boteco', 'marfim', 'carbono', 'chamas', 'neon', 'ouro'] as const;
export const INSTANTE_SEM_VITRINE = Date.parse('2026-11-02T15:00:00Z');

/** Relógio de teste que corre em tempo real, mas começando em `INSTANTE_SEM_VITRINE` (meio-dia no horário da missão). */
export function relogioSemVitrine(): () => number {
  const inicio = Date.now();
  return () => INSTANTE_SEM_VITRINE + (Date.now() - inicio);
}

/** Semente do sorteio dos testes; `SEMENTE_TESTE_SALA` troca (para varrer outras e ver que nenhum teste depende de sorte). */
export const SEMENTE_DOS_TESTES = Number(process.env.SEMENTE_TESTE_SALA ?? 20_261_009);

/**
 * `sortear` semeado da sala (arrumação, mesa, código): sem ele cada rodada sorteia uma quebra diferente, e a 7 ou a 8
 * caírem na quebra mudava o rumo de testes que jogam tacadas de verdade. Cada chamada gasta um número da sequência.
 */
export function sortearDeTeste(semente: number = SEMENTE_DOS_TESTES): (max: number) => number {
  const rng = criarRngDaSala(semente);
  return (max) => Math.floor(rng.proximo() * max);
}

export class ConexaoFalsa implements Conexao {
  readonly recebidas: MensagemDaSala[] = [];
  fechada: { codigo: number; motivo: string } | null = null;
  /** A versão do protocolo que o cliente declarou em `criar-sala`/`entrar` (a sala guarda, L47). */
  versao?: number;
  /** Pesos de cada infração que a sala mandou o transporte contar. */
  readonly punicoes: number[] = [];

  constructor(
    readonly id: string,
    readonly ip = '198.51.100.1',
  ) {}

  get totalPunido(): number {
    return this.punicoes.reduce((a, b) => a + b, 0);
  }

  punir(peso: number): void {
    this.punicoes.push(peso);
  }

  enviar(mensagem: MensagemDaSala): void {
    this.recebidas.push(mensagem);
  }

  fechar(codigo: number, motivo: string): void {
    this.fechada = { codigo, motivo };
  }

  todas<T extends MensagemDaSala['tipo']>(tipo: T): Extract<MensagemDaSala, { tipo: T }>[] {
    return this.recebidas.filter((m): m is Extract<MensagemDaSala, { tipo: T }> => m.tipo === tipo);
  }

  ultima<T extends MensagemDaSala['tipo']>(tipo: T): Extract<MensagemDaSala, { tipo: T }> | undefined {
    return this.todas(tipo).at(-1);
  }

  limpar(): void {
    this.recebidas.length = 0;
  }
}

export interface Ambiente {
  readonly registro: Registro;
  readonly config: ConfigSala;
  /** Linhas de log, para provar que não vazam dado pessoal. */
  readonly logs: string[];
  /** Avança o relógio e roda o `tick` da sala. */
  avancar(ms: number): void;
  /** Avança o relógio sem `tick`: o tempo passa, mas ninguém na sala percebe até a próxima mensagem. */
  semTick(ms: number): void;
  agora(): number;
}

export function criarAmbiente(config: Partial<ConfigSala> = {}, extra: Partial<DependenciasRegistro> = {}): Ambiente {
  let agora = 1_000_000;
  const logs: string[] = [];
  const cfg: ConfigSala = { ...CONFIG_SALA_PADRAO, ...config };
  let contador = 0;
  const registro = new Registro({
    config: cfg,
    relogio: () => agora,
    log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
    gerarToken: () => `token-de-teste-${String(++contador).padStart(4, '0')}-xxxxxxxxxxxxxxxx`,
    sortear: sortearDeTeste(),
    ...extra,
  });
  return {
    registro,
    config: cfg,
    logs,
    avancar(ms) {
      agora += ms;
      registro.tick();
    },
    semTick(ms) {
      agora += ms;
    },
    agora: () => agora,
  };
}

/**
 * O relógio da tacada dos testes antigos: sem limite, para que eles continuem provando o que provavam (tolerância da vez,
 * expiração etc.) sem o relógio de 30 s padrão da sala atrapalhar. Os testes do relógio passam o deles.
 */
export const SEM_LIMITE: NonNullable<MsgCriarSala['relogio']> = { tempoS: null };

export const TACADA_FORTE: ParametrosTacada = { angulo: 0, velocidadeTaco: 6, efeito: { lateral: 0, vertical: 0.1 }, elevacao: 0, giz: 1 };
export const TACADA_MEDIA: ParametrosTacada = { angulo: 0.4, velocidadeTaco: 2.5, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 };

const IDS_LUGAR = /^lugar-(\d)$/;
export const lugarDoJogador = (partida: EstadoPartida, indice: number): number => Number(IDS_LUGAR.exec(partida.jogadores[indice]!.id)![1]);

/** Onde cada `LugarMesa` das consequências cai na mesa (o mesmo mapa que o cliente web usa). */
function pontoDoLugar(lugar: LugarMesa, pontos: ReturnType<typeof lugares>): { x: number; z: number } {
  switch (lugar) {
    case 'marca-saida':
      return pontos.marcaSaida;
    case 'tabela-lado-saida':
      return pontos.tabelaLadoSaida;
    case 'marca-pe':
      return pontos.marcaPe;
    case 'centro-mesa':
      return { x: 0, z: 0 };
  }
}

/** `aplicarConsequencias` do cliente (retirar, depois recolocar um a um), com a API pública da física. */
export function mesaDepoisDasConsequencias(final: EstadoMesa, c: Pick<Consequencias, 'retirar' | 'recolocar'>): EstadoMesa {
  const cfg = CONFIG_FISICA_PADRAO;
  const tirar = (m: EstadoMesa, id: number): EstadoMesa => ({
    bolas: m.bolas.map((b) => (b.id === id ? { ...b, velocidade: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 }, movimento: 'parada' as const, naMesa: false } : b)),
  });
  let mesa: EstadoMesa = { bolas: final.bolas.map((b) => (c.retirar.includes(b.id) ? tirar({ bolas: [b] }, b.id).bolas[0]! : b)) };
  for (const { bola, lugar } of c.recolocar) {
    const sem = tirar(mesa, bola);
    const raio = medidasDaBola(bola, cfg).raio;
    const pontos = lugares(cfg.mesa, raio);
    const alvo = pontoDoLugar(lugar, pontos);
    const nova = bolaParada(bola, posicaoLivre(sem, alvo, raio, cfg.mesa, cfg), cfg);
    mesa = { bolas: sem.bolas.some((b) => b.id === bola) ? sem.bolas.map((b) => (b.id === bola ? nova : b)) : [...sem.bolas, nova] };
  }
  return mesa;
}

export interface VisaoDoCliente {
  readonly partida: EstadoPartida;
  readonly mesa: EstadoMesa;
  readonly seq: number;
}

/** Partida, mesa e `seq` como o cliente os reconstrói das mensagens da sala (o último `retrato` ou `tacada-retransmitida` vale). */
export function visaoDasMensagens(recebidas: readonly MensagemDaSala[]): VisaoDoCliente | null {
  let v: VisaoDoCliente | null = null;
  for (const m of recebidas) {
    if (m.tipo === 'retrato') {
      const mesa = m.mesa ?? mesaInicial(m.arrumacao, CONFIG_FISICA_PADRAO, criarRng(m.semente));
      v = { partida: m.partida, mesa, seq: m.seq };
    } else if (m.tipo === 'tacada-retransmitida') v = { partida: m.partida, mesa: m.mesa, seq: m.seq + 1 };
  }
  return v;
}

/** A tacada que o cliente web manda: física, regras e mesa feitas por ele. */
export function tacadaDaVisao(v: VisaoDoCliente, parametros: ParametrosTacada = TACADA_FORTE, semente = 11): MsgTacada {
  const sim = simularTacada(v.mesa, parametros, criarRng(semente), CONFIG_FISICA_PADRAO);
  const regras = aplicarTacada(v.partida, sim.eventos);
  return {
    tipo: 'tacada',
    seq: v.seq,
    parametros,
    gravacao: sim.gravacao,
    partida: regras.partida,
    mesa: mesaDepoisDasConsequencias(sim.estadoFinal, regras.consequencias),
  };
}

/** O rótulo do preset de fábrica da modalidade das `regras` (o que a tela mandaria em `preset`). */
const rotuloDoPreset = (regras: ConfigRegras): string => PRESETS_DE_FABRICA.find((p) => p.regras.modalidade === regras.modalidade)?.nome ?? 'Boteco';

/** O `criar-sala` que um cliente da modalidade das `regras` manda; usado pelo cliente falso e pelo cliente WebSocket real. */
export function mensagemDeCriar(
  nome: string,
  modo: ModoSala = '1x1',
  regras: ConfigRegras = PRESET_BOTECO.regras,
  relogio: MsgCriarSala['relogio'] = SEM_LIMITE,
  linha?: MsgCriarSala['linha'],
  extra: Partial<MsgCriarSala> = {},
): MsgCriarSala {
  return {
    tipo: 'criar-sala',
    versao: PROTOCOLO_VERSAO,
    nome,
    modo,
    preset: rotuloDoPreset(regras),
    ...(regras.modalidade === 'par-ou-impar' ? {} : { modalidade: regras.modalidade }),
    regras,
    ...(relogio ? { relogio } : {}),
    ...(linha ? { linha } : {}),
    ...extra,
  };
}

/**
 * Varre ângulos e forças (a física real) até achar uma tacada, montada como o cliente a monta, que `serve`; lança se nenhuma
 * serve. Serve para provar o que a sala faz com um tipo de tacada (encaçapar, cegar, derrubar a branca) sem depender de sorte:
 * a mesa, o ângulo e a física são os mesmos em qualquer rodada.
 */
export function acharTacada(visao: VisaoDoCliente, serve: (m: MsgTacada) => boolean, velocidades: readonly number[] = [8, 6, 4, 2], passo = 0.02): MsgTacada {
  for (const velocidadeTaco of velocidades) {
    for (let a = -Math.PI; a < Math.PI; a += passo) {
      const parametros: ParametrosTacada = { angulo: a, velocidadeTaco, efeito: { lateral: 0, vertical: 0.1 }, elevacao: 0, giz: 1 };
      const m = tacadaDaVisao(visao, parametros, 11);
      if (serve(m)) return m;
    }
  }
  throw new Error('nenhuma tacada varrida serve para o que o teste pede');
}

/** Bolas numeradas que caíram numa caçapa nestes eventos, sem repetir, na ordem da queda. */
export const numeradasNosEventos = (eventos: readonly EventoTacada[]): number[] => [
  ...new Set(eventos.flatMap((e) => (e.tipo === 'cacapa' && e.bola !== 0 ? [e.bola] : []))),
];

/** Bolas numeradas que caíram numa caçapa nesta tacada, sem repetir, na ordem da queda. */
export const numeradasEncacapadas = (m: Pick<MsgTacada, 'gravacao'>): number[] => numeradasNosEventos(m.gravacao.eventos);

/** A branca saiu do jogo nesta tacada: caiu numa caçapa ou saltou da mesa (os dois casos de suicídio no mata-mata). */
export const brancaSaiu = (m: Pick<MsgTacada, 'gravacao'>): boolean =>
  m.gravacao.eventos.some((e) => (e.tipo === 'cacapa' || e.tipo === 'fora-da-mesa') && e.bola === 0);

/** A branca não tocou bola nenhuma nesta tacada (cegou): nenhum choque bola-bola com ela. No mata-mata toda numerada está em jogo. */
export const cegou = (m: Pick<MsgTacada, 'gravacao'>): boolean => !m.gravacao.eventos.some((e) => e.tipo === 'bola-bola' && (e.a === 0 || e.b === 0));

/** Um jogador na sala: guarda o que a sala lhe disse e joga tacadas reais (física, regras e mesa feitas como o cliente web faz). */
export class ClienteDeTeste {
  conn: ConexaoFalsa;

  constructor(
    readonly amb: Ambiente,
    readonly nome: string,
    readonly ip = '198.51.100.1',
  ) {
    this.conn = new ConexaoFalsa(nome, ip);
  }

  enviar(mensagem: MensagemDoCliente): this {
    this.amb.registro.receber(this.conn, mensagem);
    return this;
  }

  /**
   * `criar-sala` completo. A modalidade acompanha `regras` (só vai no campo `modalidade` quando não é a padrão, para os
   * testes antigos seguirem provando a mensagem sem ele); `extra` acrescenta ou troca qualquer campo da mensagem (giz, força...).
   */
  criar(modo: ModoSala = '1x1', regras: ConfigRegras = PRESET_BOTECO.regras, relogio: MsgCriarSala['relogio'] = SEM_LIMITE, linha?: MsgCriarSala['linha'], extra: Partial<MsgCriarSala> = {}): this {
    return this.enviar(mensagemDeCriar(this.nome, modo, regras, relogio, linha, extra));
  }

  /** Como o cliente de antes do relógio: sem o campo `relogio`, a sala usa o padrão dela. */
  criarSemRelogio(modo: ModoSala = '1x1'): this {
    return this.enviar({ tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: this.nome, modo, preset: 'Boteco', regras: PRESET_BOTECO.regras });
  }

  /** `carteira` é o código secreto da carteira (L22); sem ele (ou com um que a sala não conhece) a pessoa joga sem apostar. */
  entrar(codigo: string, token?: string, carteira?: string): this {
    return this.enviar({ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo, nome: this.nome, ...(token ? { token } : {}), ...(carteira ? { carteira } : {}) });
  }

  /** Cai e volta com o mesmo token, numa conexão nova. */
  reconectar(): this {
    const { codigo, token } = this;
    this.conn = new ConexaoFalsa(this.nome + '*', this.ip);
    return this.entrar(codigo, token);
  }

  sair(): void {
    this.amb.registro.desconectar(this.conn);
  }

  get codigo(): string {
    return this.conn.ultima('boas-vindas')!.codigo;
  }

  get token(): string {
    return this.conn.ultima('boas-vindas')!.token;
  }

  get lugar(): number | null {
    return this.conn.ultima('boas-vindas')!.lugar;
  }

  get estado(): MsgEstadoSala {
    return this.conn.ultima('estado-sala')!;
  }

  get erros(): MsgErro[] {
    return this.conn.todas('erro');
  }

  get ultimoErro(): MsgErro | undefined {
    return this.erros.at(-1);
  }

  get visao(): VisaoDoCliente | null {
    return visaoDasMensagens(this.conn.recebidas);
  }

  montarTacada(parametros: ParametrosTacada = TACADA_FORTE, semente = 11): MsgTacada {
    return tacadaDaVisao(this.visao!, parametros, semente);
  }

  jogar(parametros: ParametrosTacada = TACADA_FORTE, semente = 11): MsgTacada {
    const m = this.montarTacada(parametros, semente);
    this.enviar(m);
    return m;
  }
}

/** Sala pronta e iniciada (1x1 por padrão, no par ou ímpar): anfitrião no 0 e convidados nos lugares seguintes, até cobrir os do modo. */
export function salaIniciada(
  amb: Ambiente,
  modo: ModoSala = '1x1',
  relogio: MsgCriarSala['relogio'] = SEM_LIMITE,
  linha?: MsgCriarSala['linha'],
  regras: ConfigRegras = PRESET_BOTECO.regras,
): ClienteDeTeste[] {
  const nomes = ['Ana', 'Beto', 'Cida', 'Davi'];
  const quantos = LUGARES_POR_MODO[modo];
  const clientes = nomes.slice(0, quantos).map((n) => new ClienteDeTeste(amb, n));
  clientes[0]!.criar(modo, regras, relogio, linha);
  for (const c of clientes.slice(1)) c.entrar(clientes[0]!.codigo);
  clientes[0]!.enviar({ tipo: 'iniciar' });
  return clientes;
}
