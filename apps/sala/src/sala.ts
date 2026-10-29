/**
 * Uma sala: lugares, vez, `seq` e a partida em curso. Sem rede nem timers: fala com
 * `Conexao` (o ws em produção, sockets falsos nos testes) e o tempo entra por `relogio`/`tick`.
 *
 * A sala é a verdade de lugares, vez e `seq`; a partida só avança por `aplicarTacada`
 * (regras) sobre os eventos da gravação. Ela NÃO re-simula a física.
 */
import { isDeepStrictEqual } from 'node:util';
import type { EstadoMesa } from '@sinuca/fisica';
import {
  APARENCIA_PADRAO,
  APOSTA_PADRAO,
  EMOJIS_DA_SALA,
  FISICA_DA_SALA_PADRAO,
  FORCA_DA_SALA_PADRAO,
  GIZ_DA_SALA_PADRAO,
  LIMITES_PROTOCOLO,
  LUGARES_POR_MODO,
  PLACAR_VAZIO,
  PROTOCOLO_VERSAO,
  SKIN_PADRAO,
  premioDaMissao,
  coerenciaDaGravacao,
  completarFisicaDaSala,
  equipeDoLugar,
  fisicaDiferenteDoPadrao,
  placarNoFio,
  registrarPartida,
  resumoPublico,
  type ApostaSala,
  type CodigoErro,
  type EmojiSala,
  type FaseSala,
  type FisicaSala,
  type ForcaSala,
  type GizSala,
  type JogadorDoPlacar,
  type LinhaSala,
  type LugarSala,
  type MensagemDaSala,
  type MensagemDoCliente,
  type ModoSala,
  type MotivoRetrato,
  type MsgApostaPaga,
  type MsgConfigurarSala,
  type MsgDiagnostico,
  type MsgEstadoSala,
  type MsgExpulsar,
  type MsgFisicaAlterada,
  type MsgMissoes,
  type MsgRetrato,
  type MsgTacada,
  type PartidaTerminada,
  type PlacarGuardado,
  type RelogioSala,
  type UltimaTacada,
} from '@sinuca/protocolo';
import { jogadoresDaProxima, type ConfigRegras, type Consequencias, type EstadoPartida, type Jogador, type Modalidade } from '@sinuca/regras';
import type { Rng } from '@sinuca/fisica';
import { completarAposta, completarGiz, completarLinha, completarRelogio, escolherModo, type LinhaCompleta } from './ajustes';
import { calcularAposta, valeMoeda, type ParticipanteDoRol } from './aposta';
import type { CarteirasBase } from './carteiras-base';
import type { ConfigDoNucleo } from './config-nucleo';
import { PESO_DA_RECUSA, TEXTO_DO_ERRO } from './erros';
import { contarMissoesCumpridas, contarTacada, estatisticasDaPartida, parcialVazio, type ParcialDaPartida } from './estatisticas';
import { conferirFimDaPartida, conferirTacada, type ValoresDasMissoes } from './missoes';
import { BaldeDeTokens } from './limite-taxa';
import type { Logger } from './log';
import { PrazoDaVez } from './prazo';
import type { DetalheDeSaida } from './rastro';
import { criarRng } from './rng';
import { presetDaModalidade, type MotorDeRegras } from './regras';

export interface Conexao {
  readonly id: string;
  /** Endereço de quem está do outro lado, só para limites (nunca registrar em log). */
  readonly ip: string;
  /**
   * A versão do protocolo que o cliente declarou em `criar-sala`/`entrar` (L47: a sala atende a janela de `PROTOCOLO_VERSAO_MINIMA`
   * a `PROTOCOLO_VERSAO`). O `Registro` a grava ao aceitar a entrada; a ligação a usa para falar com cada um como ele entende.
   */
  versao?: number;
  enviar(mensagem: MensagemDaSala): void;
  fechar(codigo: number, motivo: string): void;
  /** Conta uma infração de `peso` fichas da tolerância da conexão; esgotada, ela é derrubada. */
  punir(peso: number): void;
}

/** Códigos de fechamento da sala (faixa 4000 do WebSocket). `expulso`: o anfitrião tirou esta pessoa da sala. */
export const FECHAMENTO = { substituida: 4000, expirada: 4001, expulso: 4002 } as const;

/** Quantos tokens de expulsos a sala lembra (os mais antigos saem primeiro): o teto evita que expulsar em série encha a memória. */
const MAX_TOKENS_REVOGADOS = 64;

/** Quantas identidades de quem saiu da sala (token → identidade) ela guarda para devolver a quem volta; mesmo teto, pelo mesmo motivo. */
const MAX_IDENTIDADES_LEMBRADAS = 64;

export interface DadosDaSala {
  readonly codigo: string;
  readonly modo: ModoSala;
  /** Rótulo do preset da modalidade com que a sala nasce (a modalidade é a de `regras.modalidade`). */
  readonly preset: string;
  /** A casa da modalidade com que a sala nasce; as outras modalidades jogam com o preset de fábrica. */
  readonly regras: ConfigRegras;
  /** O relógio da tacada, já resolvido (o padrão da sala onde o anfitrião não escolheu). */
  readonly relogio: RelogioSala;
  /** A linha de previsão; ausente = desligada. */
  readonly linha?: LinhaSala;
  /** O giz, já completo; ausente = o padrão. */
  readonly giz?: GizSala;
  /** O controle de força; ausente = o padrão (`linha`). */
  readonly forca?: ForcaSala;
  /** Quanto cada carteira põe no pote por partida; ausente = `APOSTA_PADRAO`. */
  readonly aposta?: ApostaSala;
  /** IP de quem criou a sala (limite de salas por IP); nunca vai a log. */
  readonly ipCriador: string;
}

export interface DependenciasSala {
  readonly config: ConfigDoNucleo;
  readonly relogio: () => number;
  readonly gerarToken: () => string;
  /** Inteiro em [0, max). */
  readonly sortear: (max: number) => number;
  readonly regras: MotorDeRegras;
  readonly passarVez: (partida: EstadoPartida) => EstadoPartida;
  readonly log: Logger;
  /** As carteiras (L22): a sala só lê saldo e skin, e paga a aposta; o código secreto nunca chega aqui, só o `id` resolvido. */
  readonly carteiras: CarteirasBase;
}

interface Participante {
  /** Identidade da pessoa na sala, estável enquanto ela volta com o mesmo token (nunca vai para a rede nem para o log). */
  readonly id: string;
  readonly token: string;
  readonly nome: string;
  lugar: number | null;
  readonly anfitriao: boolean;
  conn: Conexao | null;
  desconectadoEm: number | null;
  readonly balde: BaldeDeTokens;
  /** Balde dos emojis: não gasta o do chat. */
  readonly baldeEmoji: BaldeDeTokens;
  /** Quando o último `diagnostico` desta conexão foi aceito; zera ao religar. */
  diagnosticoEm: number | null;
  /** O `id` da carteira com que entrou (nunca o código); fixo enquanto a pessoa volta com o mesmo token. `null` = joga sem apostar. */
  readonly carteira: string | null;
}

/** O que vale desde que a partida começou, para pagar no fim: a aposta daquela hora e quem estava em cada lugar. */
interface ApostaEmCurso {
  readonly valor: ApostaSala;
  readonly rol: readonly ParticipanteDoRol[];
  /** Faltas de cada lugar desde que a partida começou (o Limpinho precisa de zero). */
  readonly faltas: Map<number, number>;
  /** Bolas que cada lugar vem matando em tacadas seguidas (o Embalado); zera quando a vez dele passa ou ele erra. */
  readonly seguidas: Map<number, number>;
  /** O que cada lugar fez na partida (L38): só vira estatística da carteira se ela acabar de verdade, com aposta valendo e a física padrão. */
  readonly parciais: Map<number, ParcialDaPartida>;
}

/** Por que a física não muda agora (`fase-errada` com o motivo no texto: o código é o mesmo da fase, o texto diz qual). */
const TEXTO_FISICA_TRAVADA = 'A física fica travada enquanto há aposta valendo na partida.';
const TEXTO_FISICA_TRAVADA_NO_FIM = 'Com aposta valendo a física só muda na espera: volte ao lobby para mexer nela.';
const TEXTO_FISICA_EM_VOO = 'Espere a tacada terminar para mexer na física.';

/** Uma missão que andou: a mensagem vai só a quem está sentado no `lugar`. */
interface AvisoDeMissao {
  readonly lugar: number;
  readonly mensagem: MsgMissoes;
}

const ID_DO_LUGAR = /^lugar-(\d)$/;

/** Lugar do jogador `indice` da partida (o id é `lugar-N`, estável entre partidas). */
function lugarDoJogador(partida: EstadoPartida, indice: number): number {
  return Number(ID_DO_LUGAR.exec(partida.jogadores[indice]!.id)![1]);
}

const porNumero = (a: number, b: number): number => a - b;

/** Quem joga na próxima partida, na ordem das regras, como ids de lugar; `null` se a partida não tem vencedor para as regras ordenarem. */
function ordemDaProxima(partida: EstadoPartida): readonly string[] | null {
  try {
    return jogadoresDaProxima(partida).map((j) => j.id);
  } catch {
    return null;
  }
}

/** O que uma modalidade joga na sala: o rótulo do preset e a casa (as regras completas). */
interface CasaDaModalidade {
  readonly preset: string;
  readonly regras: ConfigRegras;
}

export class Sala {
  readonly codigo: string;
  private modoDaSala: ModoSala;
  private modalidadeDaSala: Modalidade;
  /** A casa que o anfitrião mandou ao criar a sala: vale para a modalidade de criação, e volta quando a sala volta a ela. */
  private readonly casaDaCriacao: CasaDaModalidade;
  private relogioDaSala: RelogioSala;
  private linhaDaSala: LinhaCompleta;
  private gizDaSala: GizSala;
  private forcaDaSala: ForcaSala;
  private apostaDaSala: ApostaSala;
  /** A física da sala (L38), os 8 valores do painel: o padrão até o anfitrião mexer. Vale para toda partida da sala, até ele restaurar. */
  private fisicaDaSala: FisicaSala = FISICA_DA_SALA_PADRAO;
  /** Alguma tacada desta partida foi aceita com a física mexida: a partida inteira fica fora das missões de partida e das estatísticas. */
  private fisicaMexidaNaPartida = false;
  /** Até quando a última tacada aceita ainda está animando (relógio da sala): a física não muda antes disso. */
  private voandoAte = 0;
  /** A aposta e o rol da partida em curso, fixados quando ela começa; some quando é paga ou a sala volta ao lobby. */
  private apostaEmCurso: ApostaEmCurso | null = null;
  /** A ordem de quem joga na próxima partida (`jogadoresDaProxima`), guardada ao voltar ao lobby; o `iniciar` a consome. */
  private ordemDaProxima: readonly string[] | null = null;
  /** Tokens de quem foi expulso: `entrar` com um deles é recusado (`token-invalido`); sem token, a pessoa entra como nova. */
  private readonly tokensRevogados = new Set<string>();
  /**
   * Quem saiu da sala sem ser expulso (lugar liberado, espectador que caiu, fim da partida): token → identidade. Quem volta
   * com esse token entra como nova entrada, mas conserva a identidade, para o placar não a tomar por outra pessoa.
   */
  private readonly identidadesLembradas = new Map<string, string>();
  private entradas = 0;
  /** O placar da sala: só cresce quando uma partida termina e vive tanto quanto a sala. */
  private placar: PlacarGuardado = PLACAR_VAZIO;
  private readonly participantes: Participante[] = [];
  private readonly porConexao = new Map<Conexao, Participante>();
  private fase: FaseSala = 'espera';
  private partida: EstadoPartida | null = null;
  private arrumacao: readonly number[] = [];
  private semente = 0;
  private mesa: EstadoMesa | null = null;
  private seq = 0;
  private ultima: UltimaTacada | null = null;
  private vezDesde = 0;
  private prazo: PrazoDaVez;
  private atividade: number;
  private vazioDesde: number | null = null;

  constructor(
    private readonly dados: DadosDaSala,
    private readonly deps: DependenciasSala,
  ) {
    this.codigo = dados.codigo;
    this.modoDaSala = dados.modo;
    this.modalidadeDaSala = dados.regras.modalidade;
    this.casaDaCriacao = { preset: dados.preset, regras: dados.regras };
    this.relogioDaSala = dados.relogio;
    this.linhaDaSala = completarLinha(dados.linha);
    this.gizDaSala = dados.giz ?? GIZ_DA_SALA_PADRAO;
    this.forcaDaSala = dados.forca ?? FORCA_DA_SALA_PADRAO;
    this.apostaDaSala = dados.aposta ?? APOSTA_PADRAO;
    this.prazo = new PrazoDaVez(dados.relogio.tempoS, deps.config.relogioTacada.folgaMs);
    this.atividade = deps.relogio();
  }

  get modo(): ModoSala {
    return this.modoDaSala;
  }

  get modalidade(): Modalidade {
    return this.modalidadeDaSala;
  }

  get conectados(): number {
    return this.porConexao.size;
  }

  get ipCriador(): string {
    return this.dados.ipCriador;
  }

  /**
   * A tacada de `conn` com este `seq` poderia ser aceita agora? Só olha lugar, vez e `seq`: serve para recusar
   * ANTES de decodificar a gravação (o passo caro). O único efeito colateral é tirar a vez de quem já estourou
   * o tempo, para a resposta ser a mesma que a tacada receberia.
   */
  conferirTacada(conn: Conexao, seq: number): CodigoErro | null {
    this.vencerAVez();
    const p = this.porConexao.get(conn);
    if (!p) return 'fora-da-sala';
    return this.conferirDaVez(p, seq);
  }

  /** Recusa uma tacada que o transporte já barrou: erro mais retrato, e conta a infração. */
  recusarTacada(conn: Conexao, codigo: CodigoErro): void {
    const p = this.porConexao.get(conn);
    if (p) this.recusar(p, codigo, true);
  }

  private conferirDaVez(p: Participante, seq: number): CodigoErro | null {
    const partida = this.partida;
    if (!partida) return 'fase-errada';
    if (this.terminou(partida)) return 'partida-acabou';
    if (p.lugar === null || p.lugar !== this.lugarDaVez) return 'nao-e-sua-vez';
    if (seq !== this.seq) return 'seq-errado';
    return null;
  }

  // ---------------------------------------------------------------- entrada e saída

  /** Cria a sala com o anfitrião no lugar 0. `carteira` é o `id` já resolvido no armazém, ou `null`. */
  abrir(conn: Conexao, nome: string, carteira: string | null = null): CodigoErro | null {
    const limpo = limparNome(nome);
    if (limpo === null) return 'nome-invalido';
    this.juntar(conn, limpo, 0, true, carteira);
    return null;
  }

  /**
   * `token` é de alguém que está na sala (conectado ou caído): quem chega com ele volta ao próprio lugar e a carteira que mandar
   * é ignorada. Token revogado (expulso) não conta.
   */
  reconhece(token: string | undefined): boolean {
    return token !== undefined && !this.tokensRevogados.has(token) && this.participantes.some((p) => p.token === token);
  }

  /**
   * Entra (ou volta, com `token`). Devolve o erro, ou `null` se entrou; as mensagens de boas-vindas já foram enviadas. Quem
   * volta com o token conserva a carteira com que entrou: a que vier agora não a troca.
   */
  entrar(conn: Conexao, nome: string, token?: string, carteira: string | null = null): CodigoErro | null {
    if (token !== undefined && this.tokensRevogados.has(token)) return 'token-invalido';
    const existente = token === undefined ? undefined : this.participantes.find((p) => p.token === token);
    if (existente) {
      this.religar(existente, conn);
      return null;
    }
    const limpo = limparNome(nome);
    if (limpo === null) return 'nome-invalido';
    const lugar = this.fase === 'espera' ? this.primeiroLugarLivre() : null;
    if (lugar === null && this.espectadores >= this.deps.config.maxEspectadores) return 'sala-cheia';
    const identidade = token === undefined ? undefined : this.identidadesLembradas.get(token);
    if (token !== undefined) this.identidadesLembradas.delete(token);
    this.juntar(conn, limpo, lugar, false, carteira, identidade);
    return null;
  }

  /** `saida`: o que o transporte sabe da queda (código, motivo, duração...), para o log; opcional nos testes. */
  desconectar(conn: Conexao, saida?: DetalheDeSaida): void {
    const p = this.porConexao.get(conn);
    if (!p) return;
    this.porConexao.delete(conn);
    p.conn = null;
    p.desconectadoEm = this.deps.relogio();
    if (this.porConexao.size === 0) this.vazioDesde = this.deps.relogio();
    this.deps.log('saiu', { sala: this.codigo, nome: p.nome, lugar: p.lugar, ...(saida ? camposDaSaida(saida) : {}) });
    if (p.lugar === null) this.remover(p);
    this.transmitirEstado();
  }

  /** Tira da sala quem saiu por conta própria, lembrando a identidade para quando voltar com o mesmo token. */
  private remover(p: Participante): void {
    this.participantes.splice(this.participantes.indexOf(p), 1);
    this.identidadesLembradas.set(p.token, p.id);
    if (this.identidadesLembradas.size > MAX_IDENTIDADES_LEMBRADAS) this.identidadesLembradas.delete(this.identidadesLembradas.keys().next().value!);
  }

  private juntar(conn: Conexao, nome: string, lugar: number | null, anfitriao: boolean, carteira: string | null, identidade?: string): void {
    const { chat, emoji } = this.deps.config;
    const p: Participante = {
      id: identidade ?? `entrada-${++this.entradas}`,
      token: this.deps.gerarToken(),
      nome,
      lugar,
      anfitriao,
      conn,
      desconectadoEm: null,
      balde: new BaldeDeTokens(chat.capacidade, chat.porSegundo, this.deps.relogio),
      baldeEmoji: new BaldeDeTokens(emoji.capacidade, emoji.porSegundo, this.deps.relogio),
      diagnosticoEm: null,
      carteira,
    };
    this.participantes.push(p);
    this.porConexao.set(conn, p);
    this.vazioDesde = null;
    this.atividade = this.deps.relogio();
    this.deps.log(anfitriao ? 'sala-aberta' : 'entrou', { sala: this.codigo, nome, lugar });
    this.boasVindas(p, conn);
    this.transmitirEstado();
    if (this.partida) conn.enviar(this.retrato('entrada', true));
  }

  private religar(p: Participante, conn: Conexao): void {
    const substituiu = p.conn !== null;
    const ausenteMs = p.desconectadoEm === null ? 0 : this.deps.relogio() - p.desconectadoEm;
    if (p.conn) {
      this.porConexao.delete(p.conn);
      p.conn.fechar(FECHAMENTO.substituida, 'substituída por uma conexão nova');
    }
    p.conn = conn;
    p.desconectadoEm = null;
    p.diagnosticoEm = null;
    this.porConexao.set(conn, p);
    this.vazioDesde = null;
    this.atividade = this.deps.relogio();
    this.deps.log('voltou', { sala: this.codigo, nome: p.nome, lugar: p.lugar, ausenteS: segundos(ausenteMs), substituiu });
    this.boasVindas(p, conn);
    this.transmitirEstado();
    if (this.partida) conn.enviar(this.retrato('entrada', true));
  }

  private boasVindas(p: Participante, conn: Conexao): void {
    conn.enviar({ tipo: 'boas-vindas', versao: PROTOCOLO_VERSAO, codigo: this.codigo, token: p.token, lugar: p.lugar, anfitriao: p.anfitriao });
  }

  // ---------------------------------------------------------------- mensagens

  receber(conn: Conexao, mensagem: MensagemDoCliente): void {
    const p = this.porConexao.get(conn);
    if (!p) return;
    // O diagnóstico é automático do cliente: não prova que tem gente na sala, então não segura a sala aberta.
    if (mensagem.tipo !== 'diagnostico') this.atividade = this.deps.relogio();
    this.vencerAVez();
    switch (mensagem.tipo) {
      case 'escolher-lugar':
        return this.escolherLugar(p, mensagem.lugar);
      case 'iniciar':
        return this.iniciar(p);
      case 'tacada':
        return this.tacada(p, mensagem);
      case 'mira':
        return this.mira(p, mensagem);
      case 'chat':
        return this.chat(p, mensagem.texto);
      case 'emoji':
        return this.emoji(p, mensagem.emoji);
      case 'nova-partida':
        return this.novaPartida(p);
      case 'voltar-ao-lobby':
        return this.voltarAoLobby(p);
      case 'configurar-sala':
        return this.configurar(p, mensagem);
      case 'expulsar':
        return this.expulsar(p, mensagem);
      case 'diagnostico':
        return this.diagnostico(p, mensagem);
      default:
        return this.recusar(p, 'mensagem-invalida');
    }
  }

  private escolherLugar(p: Participante, lugar: number | null): void {
    if (this.fase !== 'espera') return this.recusar(p, 'fase-errada');
    if (lugar === null) {
      if (p.anfitriao) return this.recusar(p, 'lugar-invalido');
      if (p.lugar === null) return;
      if (this.espectadores >= this.deps.config.maxEspectadores) return this.recusar(p, 'sala-cheia');
      p.lugar = null;
    } else {
      if (lugar >= this.quantosLugares || (p.anfitriao && lugar !== 0)) return this.recusar(p, 'lugar-invalido');
      if (this.participantes.some((q) => q !== p && q.lugar === lugar)) return this.recusar(p, 'lugar-ocupado');
      p.lugar = lugar;
    }
    this.transmitirEstado();
  }

  private iniciar(p: Participante): void {
    if (!p.anfitriao) return this.recusar(p, 'nao-anfitriao');
    if (this.fase !== 'espera') return this.recusar(p, 'fase-errada');
    if (!this.lugaresCheios()) return this.recusar(p, 'lugares-incompletos');
    const jogadores: Jogador[] = [];
    for (let lugar = 0; lugar < this.quantosLugares; lugar++) {
      const dono = this.participantes.find((q) => q.lugar === lugar)!;
      jogadores.push({ id: `lugar-${lugar}`, nome: dono.nome, equipe: equipeDoLugar(this.modoDaSala, lugar) });
    }
    this.comecar('inicio', this.naOrdemDaProxima(jogadores));
  }

  /** Como `iniciar`, só com todos os lugares conectados: quem saiu depois do fim não é posto na partida (nem no pote da aposta). */
  private novaPartida(p: Participante): void {
    if (!p.anfitriao) return this.recusar(p, 'nao-anfitriao');
    if (this.fase !== 'jogando' || !this.partida) return this.recusar(p, 'fase-errada');
    if (!this.terminou(this.partida)) return this.recusar(p, 'partida-em-andamento');
    if (!this.lugaresCheios()) return this.recusar(p, 'lugares-incompletos');
    this.comecar('nova-partida', jogadoresDaProxima(this.partida));
  }

  private lugaresCheios(): boolean {
    for (let lugar = 0; lugar < this.quantosLugares; lugar++) {
      if (!this.participantes.some((q) => q.lugar === lugar && q.conn)) return false;
    }
    return true;
  }

  /**
   * Fim da partida → espera, com os mesmos lugares. Quem saiu da sala (sem conexão) perde o lugar na hora; os que estão
   * ficam onde estavam. A ordem de quem joga na próxima fica guardada para o `iniciar`.
   */
  private voltarAoLobby(p: Participante): void {
    if (!p.anfitriao) return this.recusar(p, 'nao-anfitriao');
    if (this.fase !== 'jogando' || !this.partida) return this.recusar(p, 'fase-errada');
    if (!this.terminou(this.partida)) return this.recusar(p, 'partida-em-andamento');
    this.ordemDaProxima = ordemDaProxima(this.partida);
    let liberados = 0;
    for (const q of [...this.participantes]) {
      if (q.conn || q.anfitriao) continue;
      this.remover(q);
      this.deps.log('lugar-liberado', { sala: this.codigo, nome: q.nome });
      liberados++;
    }
    this.fase = 'espera';
    this.partida = null;
    this.arrumacao = [];
    this.semente = 0;
    this.mesa = null;
    this.seq = 0;
    this.ultima = null;
    this.apostaEmCurso = null;
    this.fisicaMexidaNaPartida = false;
    this.voandoAte = 0;
    this.prazo.parar();
    this.deps.log('lobby', { sala: this.codigo, liberados });
    this.transmitirEstado();
  }

  /**
   * Só na espera: completa o que veio com o que a sala tem e avisa todos (o `estado-sala` sai mesmo sem mudança, como
   * confirmação para o anfitrião). Tudo ou nada: uma recusa (`regras-invalidas`, com o motivo) deixa a sala como estava.
   * Trocar a modalidade sem dizer o modo, se o atual não servir à nova, leva a sala ao modo dela com o mesmo número de
   * lugares (2x2→1x1x1x1, 2x1→1x1x1: ninguém perde o lugar) e, só se não houver, ao primeiro do catálogo; dizendo o modo, ele
   * precisa servir. Quem fica sem lugar num modo menor (2x2→2x1, 2x1→1x1, 1x1x1x1→1x1x1) vira espectador e recebe novas
   * `boas-vindas` (mesmo token) com o lugar `null`, antes do `estado-sala`.
   */
  private configurar(p: Participante, m: MsgConfigurarSala): void {
    if (!p.anfitriao) return this.recusar(p, 'nao-anfitriao');
    if (this.fase !== 'espera') return this.configurarFisicaNaPartida(p, m);
    const relogio = completarRelogio(m.relogio, this.relogioDaSala);
    if (typeof relogio === 'string') return this.recusar(p, 'regras-invalidas', false, relogio);
    const giz = completarGiz(m.giz, this.gizDaSala);
    if (typeof giz === 'string') return this.recusar(p, 'regras-invalidas', false, giz);
    const aposta = completarAposta(m.aposta, this.apostaDaSala);
    if (typeof aposta === 'string') return this.recusar(p, 'regras-invalidas', false, aposta);
    const fisica = completarFisicaDaSala(m.fisica, this.fisicaDaSala);
    const modalidade = m.modalidade ?? this.modalidadeDaSala;
    const escolhido = escolherModo(modalidade, m.modo, this.modoDaSala);
    if ('recusa' in escolhido) return this.recusar(p, 'regras-invalidas', false, escolhido.recusa);
    const { modo } = escolhido;

    if (modalidade !== this.modalidadeDaSala || modo !== this.modoDaSala) this.ordemDaProxima = null;
    this.modalidadeDaSala = modalidade;
    if (modo !== this.modoDaSala) {
      this.modoDaSala = modo;
      for (const q of this.participantes) {
        if (q.lugar === null || q.lugar < this.quantosLugares) continue;
        q.lugar = null;
        if (q.conn) this.boasVindas(q, q.conn); // o cliente só aprende o próprio lugar pelas boas-vindas
      }
    }
    if (relogio.tempoS !== this.relogioDaSala.tempoS) this.prazo = new PrazoDaVez(relogio.tempoS, this.deps.config.relogioTacada.folgaMs);
    this.relogioDaSala = relogio;
    this.linhaDaSala = completarLinha(m.linha, this.linhaDaSala);
    this.gizDaSala = giz;
    this.forcaDaSala = m.forca ?? this.forcaDaSala;
    this.apostaDaSala = aposta;
    this.fisicaDaSala = fisica;
    this.deps.log('configurou', {
      sala: this.codigo,
      modalidade,
      modo,
      tempoS: relogio.tempoS,
      linha: this.linhaDaSala.previsao,
      bolaAtingida: this.linhaDaSala.bolaAtingida,
      forca: this.forcaDaSala,
      aposta,
      giz: `${giz.desgasteMin}-${giz.desgasteMax}/${giz.passada}/${giz.passadaS}`,
      fisica: fisicaDiferenteDoPadrao(fisica) ? 'mexida' : 'padrao',
    });
    this.transmitirEstado();
  }

  /**
   * `configurar-sala` fora da espera (L38): só a `fisica` do anfitrião passa; qualquer outro campo, ou a falta dela, é `fase-errada`
   * como sempre foi. A sala ainda recusa, sem mudar nada, quando há aposta valendo (`fisicaTravada`: a aposta trava a física na
   * partida em andamento e também na tela de fim, onde um `nova-partida` abriria uma aposta nova com os mesmos lugares: L38b, com
   * aposta a física só muda na espera, que todos veem) e, com a partida em andamento, enquanto a última tacada aceita ainda anima.
   * Partida terminada sem aposta valendo (à espera do `voltar-ao-lobby`) não tem mais tacada, então muda como na espera. Mudou:
   * todos recebem `fisica-alterada` e o `estado-sala` novo; pedir o que a sala já tem só confirma com o `estado-sala`. A física
   * nova vale da próxima tacada aceita em diante: a que já está em voo foi aceita com a antiga.
   */
  private configurarFisicaNaPartida(p: Participante, m: MsgConfigurarSala): void {
    const soFisica = m.fisica !== undefined && Object.entries(m).every(([chave, valor]) => chave === 'tipo' || chave === 'fisica' || valor === undefined);
    if (!soFisica) return this.recusar(p, 'fase-errada');
    const emAndamento = this.partida !== null && !this.terminou(this.partida);
    if (this.fisicaTravada) return this.recusar(p, 'fase-errada', false, emAndamento ? TEXTO_FISICA_TRAVADA : TEXTO_FISICA_TRAVADA_NO_FIM);
    if (emAndamento && this.deps.relogio() < this.voandoAte) return this.recusar(p, 'fase-errada', false, TEXTO_FISICA_EM_VOO);
    const nova = completarFisicaDaSala(m.fisica, this.fisicaDaSala);
    if (isDeepStrictEqual(nova, this.fisicaDaSala)) return this.transmitirEstado();
    const mudaram = Object.keys(nova).filter((chave) => nova[chave as keyof FisicaSala] !== this.fisicaDaSala[chave as keyof FisicaSala]);
    this.fisicaDaSala = nova;
    const mexida = fisicaDiferenteDoPadrao(nova);
    this.deps.log('fisica', { sala: this.codigo, por: p.nome, mexida, mudou: mudaram.join(',') });
    const aviso: MsgFisicaAlterada = { tipo: 'fisica-alterada', por: p.nome, fisica: nova, mexida };
    this.transmitir(aviso);
    this.transmitirEstado();
  }

  /**
   * Só na espera, só o anfitrião, e não a si mesmo: tira da sala quem está em `lugar` (conectado ou só segurando o lugar).
   * Quem está conectado recebe `expulso` e a conexão é fechada com `FECHAMENTO.expulso`; o token dele é revogado, então
   * recarregar a página não o devolve ao lugar, mas entrar de novo sem token, pelo mesmo link, vale como entrada nova.
   * Todos os que ficam recebem o `estado-sala` novo.
   */
  private expulsar(p: Participante, m: MsgExpulsar): void {
    if (!p.anfitriao) return this.recusar(p, 'nao-anfitriao');
    if (this.fase !== 'espera') return this.recusar(p, 'fase-errada');
    const alvo = this.participantes.find((q) => q.lugar === m.lugar);
    if (!alvo || alvo.anfitriao) return this.recusar(p, 'lugar-invalido');
    this.participantes.splice(this.participantes.indexOf(alvo), 1);
    this.revogar(alvo.token);
    this.deps.log('expulso', { sala: this.codigo, nome: alvo.nome, lugar: m.lugar, por: p.nome, conectado: alvo.conn !== null });
    const conn = alvo.conn;
    if (conn) {
      this.porConexao.delete(conn);
      alvo.conn = null;
      conn.enviar({ tipo: 'expulso', motivo: 'anfitriao' });
      conn.fechar(FECHAMENTO.expulso, 'expulso pelo anfitrião');
    }
    this.transmitirEstado();
  }

  private revogar(token: string): void {
    this.tokensRevogados.add(token);
    if (this.tokensRevogados.size > MAX_TOKENS_REVOGADOS) this.tokensRevogados.delete(this.tokensRevogados.values().next().value!);
  }

  /** A ordem guardada ao voltar ao lobby, se ainda serve para estes lugares (mesmo modo); senão a ordem dos lugares. Consome a guardada. */
  private naOrdemDaProxima(jogadores: readonly Jogador[]): readonly Jogador[] {
    const ordem = this.ordemDaProxima;
    this.ordemDaProxima = null;
    if (!ordem || ordem.length !== jogadores.length) return jogadores;
    const porId = new Map(jogadores.map((j) => [j.id, j]));
    const reordenados = ordem.map((id) => porId.get(id));
    return reordenados.every((j): j is Jogador => j !== undefined) ? reordenados : jogadores;
  }

  private comecar(motivo: MotivoRetrato, jogadores: readonly Jogador[]): void {
    this.ordemDaProxima = null;
    const rng: Rng = criarRng(this.deps.sortear(2 ** 32));
    const { partida, arrumacao } = this.deps.regras.novaPartida(this.casa.regras, jogadores, rng);
    this.partida = partida;
    const rol = this.rolDaPartida(partida);
    this.apostaEmCurso = { valor: this.apostaDaSala, rol, faltas: new Map(), seguidas: new Map(), parciais: new Map() };
    this.fisicaMexidaNaPartida = false;
    this.voandoAte = 0;
    this.deps.carteiras.registrarPartida(rol.flatMap((q) => (q.carteira === null ? [] : [q.carteira])));
    this.arrumacao = arrumacao;
    this.semente = this.deps.sortear(2 ** 32);
    this.mesa = null;
    this.seq = 0;
    this.ultima = null;
    this.fase = 'jogando';
    this.vezDesde = this.deps.relogio();
    this.iniciarPrazo(this.vezDesde);
    this.deps.log(motivo === 'inicio' ? 'iniciou' : 'nova-partida', { sala: this.codigo, jogadores: jogadores.length });
    this.transmitirEstado();
    this.transmitir(this.retrato(motivo, false));
  }

  private tacada(p: Participante, m: MsgTacada): void {
    const partida = this.partida!;
    const falha = this.conferirDaVez(p, m.seq);
    if (falha) return this.recusar(p, falha, true);
    const lugar = p.lugar!; // `conferirDaVez` já garantiu que é o lugar da vez
    if (coerenciaDaGravacao(m.gravacao) !== null) return this.recusar(p, 'gravacao-invalida', true);

    let resultado;
    try {
      resultado = this.deps.regras.aplicarTacada(partida, m.gravacao.eventos);
    } catch {
      return this.recusar(p, 'gravacao-invalida', true);
    }
    if (!isDeepStrictEqual(resultado.partida, m.partida)) return this.recusar(p, 'partida-diverge', true);
    if (!mesaCoerente(m.mesa, resultado.partida)) return this.recusar(p, 'mesa-incoerente', true);

    this.ultima = { seq: this.seq, lugar, parametros: m.parametros, gravacao: m.gravacao, consequencias: resultado.consequencias };
    this.partida = resultado.partida;
    this.mesa = m.mesa;
    this.seq++;
    // a física da sala na hora em que a tacada é aceita é a dela (a gravação é a verdade, mas a sala não sabe com que valores o cliente simulou)
    const fisicaMexida = fisicaDiferenteDoPadrao(this.fisicaDaSala);
    if (fisicaMexida) this.fisicaMexidaNaPartida = true;
    this.voandoAte = this.fimDaAnimacao(m.gravacao.duracao);
    this.contarPartida(resultado.partida);
    const avisos = this.contarMissoes(partida, resultado.partida, m, resultado.consequencias, lugar, fisicaMexida);
    const aposta = this.pagarAposta(resultado.partida);
    this.vezDesde = this.deps.relogio();
    this.reiniciarPrazoDepoisDa(m.gravacao.duracao, resultado.partida);
    this.deps.log('tacada', { sala: this.codigo, seq: this.ultima.seq, lugar });
    this.transmitir({
      tipo: 'tacada-retransmitida',
      seq: this.ultima.seq,
      lugar,
      parametros: m.parametros,
      gravacao: m.gravacao,
      partida: resultado.partida,
      mesa: m.mesa,
      consequencias: resultado.consequencias,
    });
    if (aposta) this.transmitir(aposta);
    for (const { lugar: dono, mensagem } of avisos) this.participantes.find((q) => q.lugar === dono)?.conn?.enviar(mensagem);
    this.transmitirEstado();
  }

  /**
   * As missões do dia (L31) que esta tacada fez andar e o contador de bolas do taco (L34). Só conta numa partida em que a aposta
   * vale (o critério do pote: carteiras em duas equipes ou mais, nenhuma repetida) e só para quem tem carteira no rol. Soma o
   * progresso no armazém, que paga o prêmio do nível de cada missão que chegar à meta, uma vez por dia por carteira, e soma as
   * bolas matadas (as mesmas das missões) ao taco que a carteira tem em uso agora, tudo na mesma chamada e na mesma gravação; no
   * fim da partida entram as três de partida inteira, para todo o rol. Com `MISSOES_DIARIAS=0` só o contador anda. Devolve as
   * mensagens `missoes` (uma por dono que andou), sem enviá-las: a ordem do fio é tacada, aposta, missões, estado. Tem de rodar
   * antes de `pagarAposta`, que apaga o rol.
   *
   * L38: tacada aceita com a física mexida (`fisicaMexida`) não conta para missão, nem para o contador do taco, nem para as
   * estatísticas, e zera a sequência de quem tacou; as três missões de partida inteira não pagam se alguma tacada da partida teve a
   * física mexida. O que conta vai para o parcial do lugar, que só vira estatística da carteira se a partida acabar de verdade.
   */
  private contarMissoes(antes: EstadoPartida, depois: EstadoPartida, m: MsgTacada, consequencias: Consequencias, lugar: number, fisicaMexida: boolean): AvisoDeMissao[] {
    const emCurso = this.apostaEmCurso;
    if (!emCurso || !valeMoeda(emCurso.rol)) return [];
    const missoesLigadas = this.deps.config.missoesDiarias;
    const { rol, faltas, seguidas, parciais } = emCurso;
    const doRol = rol.find((q) => q.lugar === lugar);
    if (consequencias.faltas.length > 0) faltas.set(lugar, (faltas.get(lugar) ?? 0) + 1);

    const valores = new Map<number, ValoresDasMissoes>();
    const bolas = new Map<number, number>();
    const parcialDe = (dono: number): ParcialDaPartida => parciais.get(dono) ?? parciais.set(dono, parcialVazio()).get(dono)!;
    if (doRol?.carteira && fisicaMexida) {
      this.zerarSeguidas(rol.filter((q) => q.equipe === doRol.equipe).map((q) => q.lugar));
    } else if (doRol?.carteira) {
      const conferida = conferirTacada({ parametros: m.parametros, gravacao: m.gravacao, consequencias, antes, depois, seguidasAntes: seguidas.get(lugar) ?? 0 });
      if (conferida.encerraAVez) this.zerarSeguidas(rol.filter((q) => q.equipe === doRol.equipe).map((q) => q.lugar));
      else seguidas.set(lugar, conferida.seguidas);
      if (missoesLigadas) valores.set(lugar, conferida.valores);
      if (conferida.mortas.length > 0) bolas.set(lugar, conferida.mortas.length);
      // a sequência do Embalado dessa tacada, mesmo quando a vez acaba nela (a que fecha a partida, por exemplo)
      contarTacada(parcialDe(lugar), { mortas: conferida.mortas.length, sequencia: conferida.valores.embalado ?? 0, tabeladas: conferida.valores.tabelada ?? 0 });
    }
    if (missoesLigadas && !this.fisicaMexidaNaPartida) {
      const fim = conferirFimDaPartida(rol.map((q) => ({ lugar: q.lugar, equipe: q.equipe, faltas: faltas.get(q.lugar) ?? 0 })), depois.vencedor);
      for (const [dono, doFim] of fim) valores.set(dono, { ...valores.get(dono), ...doFim });
    }

    const avisos: AvisoDeMissao[] = [];
    for (const dono of new Set([...valores.keys(), ...bolas.keys()])) {
      const entrada = rol.find((q) => q.lugar === dono);
      const v = valores.get(dono) ?? {};
      const mortas = bolas.get(dono) ?? 0;
      if (!entrada?.carteira || (Object.keys(v).length === 0 && mortas === 0)) continue;
      const andou = this.deps.carteiras.registrarMissoes(entrada.carteira, v, this, mortas);
      if (!andou) continue;
      contarMissoesCumpridas(parcialDe(dono), andou.cumpridas);
      for (const missao of andou.cumpridas) this.deps.log('missao', { sala: this.codigo, nome: entrada.nome, missao, moedas: premioDaMissao(missao) });
      avisos.push({ lugar: dono, mensagem: { tipo: 'missoes', missoes: andou.missoes, cumpridas: andou.cumpridas } });
    }
    return avisos;
  }

  /** A vez de `lugar` passou sem tacada (tempo ou ausência): a sequência do Embalado dele, e da equipe dele, recomeça. */
  private perdeuAMesaSemTacar(lugar: number): void {
    const rol = this.apostaEmCurso?.rol;
    const equipe = rol?.find((q) => q.lugar === lugar)?.equipe;
    if (rol && equipe !== undefined) this.zerarSeguidas(rol.filter((q) => q.equipe === equipe).map((q) => q.lugar));
  }

  private zerarSeguidas(lugares: readonly number[]): void {
    for (const l of lugares) this.apostaEmCurso?.seguidas.delete(l);
  }

  /**
   * Quem está em cada lugar da partida que começa, com a carteira de cada um: é este o rol que a aposta vai pagar. Só entra
   * a carteira de quem está conectado agora (quem já saiu nunca é posto no pote por uma partida que não aceitou jogar).
   * Com `contarDesconectados`, a de quem está sentado conta também: é o rol que a próxima partida teria se todos voltassem (a
   * trava da física no fim da partida).
   */
  private rolDaPartida(partida: EstadoPartida, contarDesconectados = false): readonly ParticipanteDoRol[] {
    return partida.jogadores
      .map((j, indice): ParticipanteDoRol => {
        const lugar = lugarDoJogador(partida, indice);
        const dono = this.participantes.find((q) => q.lugar === lugar);
        // carteira que o armazém já não tem (foi reaproveitada no teto enquanto a pessoa esperava) é como não ter carteira
        const carteira = dono && (dono.conn || contarDesconectados) && dono.carteira !== null && this.deps.carteiras.ler(dono.carteira) ? dono.carteira : null;
        return { lugar, equipe: j.equipe, nome: dono?.nome ?? j.nome, carteira };
      })
      .sort((a, b) => a.lugar - b.lugar);
  }

  /**
   * Fim de partida com vencedor: o pote da aposta muda de mãos, uma vez só (o rol some ao pagar). Só paga quem tinha
   * carteira quando a partida começou, esteja ou não na sala agora; quem não tinha não aposta nem recebe, e a mesma carteira
   * em dois lugares anula tudo. Devolve a mensagem do pagamento, ou `null` se nenhum dinheiro mudou de mãos (sem aposta,
   * sem contraparte, partida sem vencedor).
   *
   * L38: a partida que acabou de verdade e conta (a aposta vale, `valeMoeda`, e nenhuma tacada teve a física mexida) soma as
   * estatísticas de cada carteira do rol, na MESMA chamada do armazém que move o saldo (tudo ou nada). A física mexida não tira a
   * aposta: todos viram a física na espera ou foram avisados, então o pote muda de mãos como sempre.
   */
  private pagarAposta(partida: EstadoPartida): MsgApostaPaga | null {
    const emCurso = this.apostaEmCurso;
    if (!emCurso || partida.vencedor === null) return null;
    this.apostaEmCurso = null;
    const { valor, rol } = emCurso;
    const modalidade = partida.config.modalidade;
    const conta = calcularAposta(rol, valor, partida.vencedor);
    if (conta.anulada) {
      this.deps.log('aposta', { sala: this.codigo, valor, anulada: conta.motivo });
      this.deps.log('estatistica', { sala: this.codigo, modalidade, contou: false, motivo: conta.motivo });
      return { tipo: 'aposta-paga', valor, variacoes: [], anulada: conta.motivo };
    }
    const motivoDeNaoContar = !valeMoeda(rol) ? 'menos-de-duas-carteiras' : this.fisicaMexidaNaPartida ? 'fisica-mexida' : null;
    const estatisticas = motivoDeNaoContar === null ? estatisticasDaPartida({ rol, vencedor: partida.vencedor, modalidade, parciais: emCurso.parciais, pagamentos: conta.pagamentos }) : [];
    const semDinheiro = conta.pagamentos.every((pg) => pg.delta === 0);
    if (semDinheiro && estatisticas.length === 0) {
      this.deps.log('estatistica', { sala: this.codigo, modalidade, contou: false, motivo: motivoDeNaoContar ?? 'sem-carteira' });
      return null;
    }
    const variacoes = semDinheiro ? [] : conta.pagamentos.map((pg) => ({ id: pg.carteira, delta: pg.delta }));
    if (!this.deps.carteiras.aplicar(variacoes, this, estatisticas)) {
      // sem dinheiro a mover, o que falhou foi só a estatística: o log não acusa a aposta (tudo ou nada: com dinheiro, é o lote)
      if (semDinheiro) this.deps.log('estatistica', { sala: this.codigo, modalidade, contou: false, motivo: 'falhou' });
      else this.deps.log('aposta-falhou', { sala: this.codigo, valor });
      return null;
    }
    this.logarEstatistica(modalidade, motivoDeNaoContar, estatisticas);
    if (semDinheiro) return null;
    const pagamentos = conta.pagamentos;
    const variacoesNoFio = pagamentos.map((pg) => ({ lugar: pg.lugar, nome: pg.nome, delta: pg.delta, saldo: this.deps.carteiras.ler(pg.carteira)?.saldo ?? 0 }));
    const venceu = rol.filter((q) => q.equipe === partida.vencedor).map((q) => q.nome).join(' e ');
    const deltas = pagamentos.map((pg) => `${pg.nome} ${pg.delta < 0 ? '' : '+'}${pg.delta}`).join(', ');
    this.deps.log('aposta', { sala: this.codigo, valor, venceu, deltas });
    return { tipo: 'aposta-paga', valor, variacoes: variacoesNoFio };
  }

  /** O log curto do fim da partida (L38): contou ou não, e por quê; nunca o código nem o `id` da carteira. */
  private logarEstatistica(modalidade: Modalidade, motivoDeNaoContar: string | null, estatisticas: readonly { readonly contagem: { readonly bolas: number } }[]): void {
    if (motivoDeNaoContar !== null) return void this.deps.log('estatistica', { sala: this.codigo, modalidade, contou: false, motivo: motivoDeNaoContar });
    this.deps.log('estatistica', { sala: this.codigo, modalidade, contou: true, carteiras: estatisticas.length, bolas: estatisticas.reduce((soma, e) => soma + e.contagem.bolas, 0) });
  }

  /** O apelido de quem está sentado nesta sala com a carteira `id` (o log da compra o usa), ou `null` se ninguém está. */
  apelidoDaCarteira(id: string): string | null {
    return this.participantes.find((p) => p.lugar !== null && p.carteira === id)?.nome ?? null;
  }

  /**
   * Uma carteira mudou fora desta sala (compra ou troca de skin pelo HTTP, pagamento de outra sala): quem está sentado com ela
   * vê o saldo e a skin novos. Espectador não aparece no estado, então não há o que avisar por ele.
   */
  carteiraMudou(id: string): void {
    if (this.participantes.some((p) => p.lugar !== null && p.carteira === id)) this.transmitirEstado();
  }

  /**
   * Se a tacada acabou a partida com um vencedor, soma ao placar (mesma modalidade e formação, soma; outra, confronto novo). Os lados saem dos jogadores da
   * partida (a equipe é a dela: duas no par ou ímpar, uma por pessoa no mata-mata), que a sala conhece pelo lugar (`lugar-N`) e lista
   * na ordem dos lugares; quem já saiu da sala continua no placar pelo apelido.
   */
  private contarPartida(partida: EstadoPartida): void {
    const vencedor = partida.vencedor;
    if (vencedor === null) return;
    const porLugar: { lugar: number; equipe: number; quem: JogadorDoPlacar }[] = partida.jogadores.map((j, indice) => {
      const lugar = lugarDoJogador(partida, indice);
      const dono = this.participantes.find((q) => q.lugar === lugar);
      return { lugar, equipe: j.equipe, quem: { id: dono?.id ?? j.id, nome: dono?.nome ?? j.nome } };
    });
    porLugar.sort((a, b) => a.lugar - b.lugar);
    const quantasEquipes = Math.max(...porLugar.map((q) => q.equipe)) + 1;
    const equipes = Array.from({ length: quantasEquipes }, (_, equipe) => porLugar.filter((q) => q.equipe === equipe).map((q) => q.quem));
    try {
      this.placar = registrarPartida(this.placar, { equipes: equipes as unknown as PartidaTerminada['equipes'], vencedor, modalidade: partida.config.modalidade });
    } catch {
      // o placar é secundário: uma partida de equipes inválidas (as regras não as produzem) não pode travar a tacada
      return this.deps.log('placar-falhou', { sala: this.codigo });
    }
    const lados = this.placar.atual!.lados;
    const nomes = (jogadores: readonly JogadorDoPlacar[]): string => jogadores.map((j) => j.nome).join(' e ');
    this.deps.log('placar', {
      sala: this.codigo,
      modalidade: this.placar.atual!.modalidade,
      venceu: nomes(equipes[vencedor]!),
      ladoA: nomes(lados[0].jogadores),
      ladoB: nomes(lados[1].jogadores),
      vitoriasA: lados[0].vitorias,
      vitoriasB: lados[1].vitorias,
      // com 3 ou 4 lados (mata-mata) os demais seguem aqui, na ordem do confronto
      ...(lados.length > 2 ? { outros: lados.slice(2).map((l) => `${nomes(l.jogadores)} ${l.vitorias}`).join(' | ') } : {}),
      novoConfronto: lados.reduce((soma, l) => soma + l.vitorias, 0) === 1,
      confrontos: 1 + this.placar.historico.length,
    });
  }

  private mira(p: Participante, m: Extract<MensagemDoCliente, { tipo: 'mira' }>): void {
    if (this.fase !== 'jogando' || p.lugar === null || p.lugar !== this.lugarDaVez) return;
    this.transmitir({ tipo: 'mira-retransmitida', lugar: p.lugar, angulo: m.angulo, lateral: m.lateral, vertical: m.vertical, recuo: m.recuo, ...(m.giz ? { giz: true as const } : {}) }, p);
  }

  /** Medidas de desempenho do cliente, só para o log; mais de uma por janela é descartado em silêncio. */
  private diagnostico(p: Participante, m: MsgDiagnostico): void {
    const agora = this.deps.relogio();
    if (p.diagnosticoEm !== null && agora - p.diagnosticoEm < LIMITES_PROTOCOLO.intervaloDiagnosticoMs) return;
    p.diagnosticoEm = agora;
    this.deps.log('diagnostico', {
      sala: this.codigo,
      nome: p.nome,
      lugar: p.lugar,
      fps: m.fpsMedio,
      piorQuadroMs: m.piorQuadroMs,
      qualidade: m.qualidade,
      gpu: m.gpu,
      ...(m.memoriaMb === undefined ? {} : { memoriaMb: m.memoriaMb }),
    });
  }

  private chat(p: Participante, texto: string): void {
    const limpo = texto.trim();
    if (limpo === '') return;
    if (!p.balde.tentar()) return this.recusar(p, 'limite-mensagens');
    this.transmitir({ tipo: 'chat-retransmitido', lugar: p.lugar, nome: p.nome, texto: limpo });
  }

  /**
   * Qualquer fase, de jogador ou espectador. A forma já veio conferida do transporte; a lista fechada vale de novo aqui
   * porque a sala só retransmite o que está nela, seja qual for o transporte. Rajada acima do balde some calada
   * (sem `erro`) e nada do emoji vai ao log.
   */
  private emoji(p: Participante, emoji: EmojiSala): void {
    if (!(EMOJIS_DA_SALA as readonly string[]).includes(emoji)) return this.recusar(p, 'mensagem-invalida');
    if (!p.baldeEmoji.tentar()) return;
    this.transmitir({ tipo: 'emoji-retransmitido', lugar: p.lugar, nome: p.nome, emoji });
  }

  // ---------------------------------------------------------------- tempo

  /** Chamado a cada segundo: libera lugar de quem sumiu na espera e tira a vez de quem estourou o tempo ou sumiu. */
  tick(): void {
    if (this.fase === 'espera') return this.liberarLugaresAusentes();
    this.vencerAVez();
  }

  private liberarLugaresAusentes(): void {
    const agora = this.deps.relogio();
    const { lugarEsperaMs } = this.deps.config;
    let mudou = false;
    for (const p of [...this.participantes]) {
      if (!p.conn && !p.anfitriao && p.desconectadoEm !== null && agora - p.desconectadoEm >= lugarEsperaMs) {
        this.remover(p);
        this.deps.log('lugar-liberado', { sala: this.codigo, nome: p.nome });
        mudou = true;
      }
    }
    if (mudou) this.transmitirEstado();
  }

  /**
   * O prazo da vez seguinte corre depois que a animação da tacada acaba (duração da gravação, com teto, mais a
   * margem), ou a partir de agora se a tacada acabou com a partida: aí não há mais vez.
   */
  private reiniciarPrazoDepoisDa(duracaoS: number, partida: EstadoPartida): void {
    if (this.terminou(partida)) return this.prazo.parar();
    this.iniciarPrazo(this.fimDaAnimacao(duracaoS));
  }

  /** Quando acaba a animação de uma tacada aceita agora (duração da gravação, com teto, mais a margem): dali em diante o prazo da vez corre e a física pode mudar. */
  private fimDaAnimacao(duracaoS: number): number {
    const { margemAnimacaoMs, animacaoMaximaMs } = this.deps.config.relogioTacada;
    return this.deps.relogio() + Math.min(duracaoS * 1000, animacaoMaximaMs) + margemAnimacaoMs;
  }

  /**
   * Começa a contar a vez em `inicio`. Com moeda em jogo (aposta fixada no começo da partida, com contraparte) a vez de quem
   * está conectado tem o teto da config mesmo numa sala sem limite; o cliente o vê pelo `prazoMs` do `estado-sala`.
   */
  private iniciarPrazo(inicio: number): void {
    const apostada = this.apostaEmCurso !== null && valeMoeda(this.apostaEmCurso.rol);
    this.prazo.iniciar(inicio, apostada ? this.deps.config.tetoDaVezApostadaMs : null);
  }

  /**
   * O que vence primeiro tira a vez de quem a tem: o relógio da tacada (prazo mais folga) ou, com o jogador
   * desconectado, a tolerância de ausência. Chamado a cada tick e antes de ler qualquer mensagem, para a sala
   * nunca depender da granularidade do tick para decidir se uma tacada chegou a tempo.
   */
  private vencerAVez(): void {
    const lugar = this.lugarDaVez;
    if (lugar === null || !this.partida) return;
    const agora = this.deps.relogio();
    const motivo = this.motivoDeVencer(lugar, agora);
    if (motivo === null) return;
    this.perdeuAMesaSemTacar(lugar);
    this.partida = this.deps.passarVez(this.partida);
    this.vezDesde = agora;
    this.iniciarPrazo(agora);
    const proximo = this.lugarDaVez!;
    this.deps.log('vez-passou', { sala: this.codigo, de: lugar, para: proximo, motivo });
    this.transmitir({ tipo: 'tempo-esgotado', lugar, proximo, motivo, consequencia: this.relogioDaSala.aoEsgotar });
    this.transmitirEstado();
    this.transmitir(this.retrato('vez-passou', false));
  }

  private motivoDeVencer(lugar: number, agora: number): 'tempo' | 'ausencia' | null {
    const dono = this.participantes.find((p) => p.lugar === lugar);
    const vencimentos: [number, 'tempo' | 'ausencia'][] = [];
    if (this.prazo.vencimento !== null) vencimentos.push([this.prazo.vencimento, 'tempo']);
    if (dono && !dono.conn) {
      const desde = Math.max(dono.desconectadoEm ?? this.vezDesde, this.vezDesde);
      vencimentos.push([desde + this.deps.config.toleranciaVezMs, 'ausencia']);
    }
    const primeiro = vencimentos.sort((a, b) => a[0] - b[0])[0];
    return primeiro && agora >= primeiro[0] ? primeiro[1] : null;
  }

  /** Vazia há muito tempo, ou parada (sem jogada, chat nem lugar) há mais ainda. */
  expirou(): boolean {
    const agora = this.deps.relogio();
    const { salaVaziaEsperaMs, salaVaziaMs, salaOciosaMs } = this.deps.config;
    if (this.porConexao.size === 0 && this.vazioDesde !== null) {
      const limite = this.fase === 'espera' ? salaVaziaEsperaMs : salaVaziaMs;
      if (agora - this.vazioDesde >= limite) return true;
    }
    return agora - this.atividade >= salaOciosaMs;
  }

  encerrar(motivo: string): void {
    for (const conn of [...this.porConexao.keys()]) conn.fechar(FECHAMENTO.expirada, motivo);
    this.porConexao.clear();
    this.participantes.length = 0;
  }

  // ---------------------------------------------------------------- estado

  private get quantosLugares(): number {
    return LUGARES_POR_MODO[this.modoDaSala];
  }

  /** A casa da modalidade em jogo: a que o anfitrião mandou, na modalidade de criação; nas outras, o preset de fábrica. */
  private get casa(): CasaDaModalidade {
    if (this.modalidadeDaSala === this.casaDaCriacao.regras.modalidade) return this.casaDaCriacao;
    const { nome, regras } = presetDaModalidade(this.modalidadeDaSala);
    return { preset: nome, regras };
  }

  /**
   * A aposta trava a física (L38): há partida em andamento com aposta valendo (`valeMoeda`), ou a partida acabou (à espera do
   * `voltar-ao-lobby` ou do `nova-partida`) e a próxima, com os mesmos lugares, teria aposta valendo. No fim a conta é do rol que
   * um `nova-partida` fixaria com todos de volta (a carteira de quem saiu depois do fim conta: ele pode voltar), porque senão o
   * anfitrião mudaria a física enquanto alguém está fora e a aposta nova valeria com uma física que ninguém viu na espera.
   * Na espera nada trava; para mexer com aposta valendo é preciso voltar ao lobby.
   */
  private get fisicaTravada(): boolean {
    if (this.fase !== 'jogando' || this.partida === null) return false;
    if (!this.terminou(this.partida)) return this.apostaEmCurso !== null && valeMoeda(this.apostaEmCurso.rol);
    return valeMoeda(this.rolDaPartida(this.partida, true));
  }

  private get espectadores(): number {
    return this.participantes.filter((p) => p.lugar === null).length;
  }

  private get lugarDaVez(): number | null {
    if (this.fase !== 'jogando' || !this.partida || this.terminou(this.partida)) return null;
    return lugarDoJogador(this.partida, this.partida.vez);
  }

  private terminou(partida: EstadoPartida): boolean {
    return partida.vencedor !== null || partida.fase === 'fim';
  }

  private primeiroLugarLivre(): number | null {
    for (let lugar = 0; lugar < this.quantosLugares; lugar++) {
      if (!this.participantes.some((p) => p.lugar === lugar)) return lugar;
    }
    return null;
  }

  private estado(): MsgEstadoSala {
    const lugares: LugarSala[] = [0, 1, 2, 3].map((lugar) => {
      const dono = this.participantes.find((p) => p.lugar === lugar);
      const carteira = dono?.carteira ? this.deps.carteiras.ler(dono.carteira) : undefined;
      const emUso = carteira?.itens?.find((i) => i.skin === carteira.skin);
      return {
        lugar,
        equipe: equipeDoLugar(this.modoDaSala, lugar),
        nome: dono?.nome ?? null,
        conectado: dono?.conn != null,
        anfitriao: dono?.anfitriao ?? false,
        saldo: carteira?.saldo ?? null,
        skin: carteira?.skin ?? SKIN_PADRAO,
        // o taco em uso de quem tem carteira: todo mundo vê a semente e o contador (L34)
        semente: emUso?.semente ?? null,
        bolas: emUso?.bolas ?? null,
        // o resumo público (L38): só números do total, nunca o código nem o id da carteira
        estatisticas: carteira?.estatisticas ? resumoPublico(carteira.estatisticas) : null,
        // o balão em uso (L47) vem SEMPRE da carteira de quem está sentado, nunca de uma mensagem do cliente; sentado sem carteira é o padrão
        aparencia: dono ? (carteira?.balao?.aparencia ?? APARENCIA_PADRAO) : null,
      };
    });
    return {
      tipo: 'estado-sala',
      codigo: this.codigo,
      modo: this.modoDaSala,
      modalidade: this.modalidadeDaSala,
      preset: this.casa.preset,
      fase: this.fase,
      seq: this.seq,
      vez: this.lugarDaVez,
      lugares,
      espectadores: this.espectadores,
      relogio: this.relogioDaSala,
      linha: this.linhaDaSala,
      giz: this.gizDaSala,
      forca: this.forcaDaSala,
      aposta: this.apostaDaSala,
      fisica: this.fisicaDaSala,
      fisicaMexida: fisicaDiferenteDoPadrao(this.fisicaDaSala),
      fisicaTravada: this.fisicaTravada,
      prazoMs: this.prazo.restanteMs(this.deps.relogio()),
      placar: placarNoFio(this.placar),
    };
  }

  private retrato(motivo: MotivoRetrato, comUltima: boolean): MsgRetrato {
    return {
      tipo: 'retrato',
      motivo,
      seq: this.seq,
      partida: this.partida!,
      arrumacao: this.arrumacao,
      semente: this.semente,
      mesa: this.mesa,
      ultima: comUltima ? this.ultima : null,
    };
  }

  private transmitirEstado(): void {
    this.transmitir(this.estado());
  }

  private transmitir(mensagem: MensagemDaSala, menos?: Participante): void {
    for (const p of this.participantes) if (p.conn && p !== menos) p.conn.enviar(mensagem);
  }

  /** Erro só para quem pediu; com `ressincronizar`, junto vai o retrato para o cliente descartar o estado local. */
  private recusar(p: Participante, codigo: CodigoErro, ressincronizar = false, mensagem: string = TEXTO_DO_ERRO[codigo]): void {
    if (!p.conn) return;
    this.deps.log('recusou', { sala: this.codigo, codigo, lugar: p.lugar });
    const conn = p.conn;
    conn.enviar({ tipo: 'erro', codigo, mensagem });
    if (ressincronizar && this.partida) conn.enviar(this.retrato('ressincronia', false));
    const peso = PESO_DA_RECUSA[codigo];
    if (peso) conn.punir(peso);
  }
}

const segundos = (ms: number): number => Math.round(ms / 100) / 10;

function camposDaSaida(d: DetalheDeSaida) {
  return { codigo: d.codigo, motivo: d.motivo, duracaoS: segundos(d.duracaoMs), origem: d.origem, presos: d.presosNoEnvio, silencioS: segundos(d.silencioMs) };
}

function limparNome(nome: string): string | null {
  const limpo = nome.trim();
  const tamanho = [...limpo].length;
  return tamanho >= 1 && tamanho <= LIMITES_PROTOCOLO.nome ? limpo : null;
}

/** A mesa que o cliente mandou tem de ter exatamente as bolas que a partida diz, o bolão (enquanto há jogo) e tudo dentro da mesa. */
function mesaCoerente(mesa: EstadoMesa, partida: EstadoPartida): boolean {
  const naMesa = mesa.bolas.filter((b) => b.naMesa);
  const numeradas = naMesa.filter((b) => b.id !== 0).map((b) => b.id).sort(porNumero);
  if (!isDeepStrictEqual(numeradas, [...partida.naMesa].sort(porNumero))) return false;
  if (partida.vencedor === null && !naMesa.some((b) => b.id === 0)) return false;
  return naMesa.every(
    (b) =>
      Math.abs(b.posicao.x) <= LIMITES_PROTOCOLO.mesaX &&
      Math.abs(b.posicao.z) <= LIMITES_PROTOCOLO.mesaZ &&
      b.posicao.y >= -0.05 &&
      b.posicao.y <= LIMITES_PROTOCOLO.mesaAltura,
  );
}
