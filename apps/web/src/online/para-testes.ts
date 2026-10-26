/** Apoio dos testes do cliente online: socket, relógio e uma sala falsa com o contrato do protocolo. Não entra no build. */
import { criarRng, type EstadoMesa } from '@sinuca/fisica';
import {
  APOSTA_PADRAO,
  FORCA_DA_SALA_PADRAO,
  GIZ_DA_SALA_PADRAO,
  LUGARES_POR_MODO,
  MODALIDADE_PADRAO,
  PROTOCOLO_VERSAO,
  codificarMensagem,
  decodificarMensagemDoCliente,
  equipeDoLugar,
  type ApostaSala,
  type FaseSala,
  type ForcaSala,
  type GizSala,
  type LinhaSala,
  type LugarSala,
  type MensagemDaSala,
  type MensagemDoCliente,
  type ModoSala,
  type MsgEstadoSala,
  type MsgRetrato,
  type MsgTacada,
  type RelogioSala,
  type SkinTaco,
  type UltimaTacada,
} from '@sinuca/protocolo';
import { PRESETS_DE_FABRICA, aplicarTacada, novaPartida, passarVez, type ConfigRegras, type EstadoPartida, type Jogador, type Modalidade } from '@sinuca/regras';
import type { ArmazenamentoMinimo } from '../armazenamento';
import { CATALOGO, modoAoTrocarDeModalidade } from '../lobby/catalogo';
import type { SocketMinimo } from './cliente-sala';

export class ArmazenamentoFalso implements ArmazenamentoMinimo {
  readonly dados = new Map<string, string>();
  getItem(chave: string): string | null {
    return this.dados.get(chave) ?? null;
  }
  setItem(chave: string, valor: string): void {
    this.dados.set(chave, valor);
  }
  removeItem(chave: string): void {
    this.dados.delete(chave);
  }
}

/** Relógio e `setTimeout` à mão: `avancar(ms)` dispara o que venceu, na ordem. */
export class RelogioFalso {
  agoraMs = 0;
  private proximoId = 1;
  private readonly tarefas = new Map<number, { quando: number; fn: () => void }>();

  readonly agora = (): number => this.agoraMs;

  readonly agendar = (fn: () => void, ms: number): (() => void) => {
    const id = this.proximoId++;
    this.tarefas.set(id, { quando: this.agoraMs + ms, fn });
    return () => void this.tarefas.delete(id);
  };

  get pendentes(): number {
    return this.tarefas.size;
  }

  avancar(ms: number): void {
    const alvo = this.agoraMs + ms;
    for (;;) {
      let proximo: [number, { quando: number; fn: () => void }] | null = null;
      for (const entrada of this.tarefas) if (entrada[1].quando <= alvo && (!proximo || entrada[1].quando < proximo[1].quando)) proximo = entrada;
      if (!proximo) break;
      this.tarefas.delete(proximo[0]);
      this.agoraMs = proximo[1].quando;
      proximo[1].fn();
    }
    this.agoraMs = alvo;
  }
}

/** O socket que o cliente enxerga; do outro lado está a `SalaFalsa` (ou o teste, que lê `enviadas`). */
export class SocketFalso implements SocketMinimo {
  binaryType = '';
  onopen: (() => void) | null = null;
  onmessage: ((evento: { readonly data: unknown }) => void) | null = null;
  onclose: ((evento: { readonly code: number; readonly reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  aberto = false;
  fechado = false;
  readonly enviadas: (string | Uint8Array)[] = [];
  /** Quem atende o que o cliente manda; a `SalaFalsa` se põe aqui. */
  aoEnviar: ((dado: string | Uint8Array) => void) | null = null;

  send(dado: string | Uint8Array): void {
    if (!this.aberto || this.fechado) throw new Error('socket fechado');
    this.enviadas.push(dado);
    this.aoEnviar?.(dado);
  }

  close(codigo = 1000, motivo = ''): void {
    if (this.fechado) return;
    this.fechado = true;
    this.aberto = false;
    this.onclose?.({ code: codigo, reason: motivo });
  }

  // Do lado da sala:
  abrir(): void {
    this.aberto = true;
    this.onopen?.();
  }

  entregar(mensagem: MensagemDaSala): void {
    if (!this.aberto || this.fechado) return;
    const dado = codificarMensagem(mensagem);
    this.onmessage?.({ data: typeof dado === 'string' ? dado : dado.buffer.slice(dado.byteOffset, dado.byteOffset + dado.byteLength) });
  }

  /** A sala (ou a rede) fechou a conexão. */
  fecharDoOutroLado(codigo = 1006): void {
    this.close(codigo);
  }

  mensagensEnviadas(): MensagemDoCliente[] {
    return this.enviadas.map((d) => {
      const r = decodificarMensagemDoCliente(d);
      if (!r.ok) throw new Error(r.erro);
      return r.valor;
    });
  }
}

interface Participante {
  readonly token: string;
  readonly nome: string;
  lugar: number | null;
  readonly anfitriao: boolean;
  socket: SocketFalso | null;
  /** O código da carteira com que entrou (a sala falsa não o devolve a ninguém). */
  readonly carteira?: string;
}

const ID_DO_LUGAR = /^lugar-(\d)$/;

/** O que veio de `linha` completa o que a sala já tinha; campo ausente não muda nada. */
const completarLinha = (m: Partial<LinhaSala> | undefined, atual: Required<LinhaSala>): Required<LinhaSala> => {
  const previsao = m?.previsao ?? atual.previsao;
  return { previsao, bolaAtingida: previsao && (m?.bolaAtingida ?? atual.bolaAtingida) };
};

/**
 * Uma sala mínima com o contrato do protocolo (não é a de `apps/sala`: o teste de verdade, com dois
 * clientes `ws`, mora lá). Usa as regras de verdade para validar a tacada e retransmitir, e não
 * simula física nenhuma.
 */
export class SalaFalsa {
  readonly codigo = 'K7M2P';
  readonly sockets: SocketFalso[] = [];
  /** Tudo o que a sala recebeu, na ordem (para o teste conferir). */
  readonly recebidas: MensagemDoCliente[] = [];
  modo: ModoSala = '1x1';
  /** O jeito de jogar da sala, como veio no `criar-sala` (sem ele, par ou ímpar). */
  modalidade: Modalidade = MODALIDADE_PADRAO;
  /** O giz da sala, sempre completo como na sala de verdade (`criar-sala` parcial ou ausente = o padrão). */
  giz: GizSala = GIZ_DA_SALA_PADRAO;
  /** O controle de força da sala (`criar-sala` ausente = o padrão). */
  forca: ForcaSala = FORCA_DA_SALA_PADRAO;
  /** Quanto cada jogador com carteira põe na partida (`criar-sala` ausente = o padrão). */
  aposta: ApostaSala = APOSTA_PADRAO;
  /** As carteiras que a sala conhece, pelo código; os testes as põem aqui. Código que não está aqui = sem carteira. */
  readonly carteiras = new Map<string, { saldo: number; skin: SkinTaco }>();
  /** O relógio da sala, como veio no `criar-sala` (sem ele, o padrão de 30 s). */
  relogio: RelogioSala = { tempoS: 30, aoEsgotar: 'perde-a-vez' };
  /** A linha de previsão da sala, sempre completa como na sala de verdade (`criar-sala` ausente = desligada). */
  linha: Required<LinhaSala> = { previsao: false, bolaAtingida: false };
  /** O `prazoMs` que o próximo `estado-sala` leva durante a partida (a sala falsa não conta tempo). */
  prazoMs: number | null = null;
  private regras: ConfigRegras | null = null;
  private readonly participantes: Participante[] = [];
  private fase: FaseSala = 'espera';
  private partida: EstadoPartida | null = null;
  private arrumacao: readonly number[] = [];
  private mesa: EstadoMesa | null = null;
  private seq = 0;
  private ultima: UltimaTacada | null = null;
  private tokens = 0;
  /** Tokens de quem foi expulso: `entrar` com um deles é recusado, como na sala de verdade. */
  private readonly revogados = new Set<string>();

  readonly criarSocket = (): SocketFalso => {
    const socket = new SocketFalso();
    socket.aoEnviar = (dado) => this.receber(socket, dado);
    this.sockets.push(socket);
    return socket;
  };

  /** Abre os sockets que ainda não abriram. */
  abrirPendentes(): void {
    for (const socket of this.sockets) if (!socket.aberto && !socket.fechado) socket.abrir();
  }

  /** A rede de `socket` caiu: o jogador fica desconectado, mas guarda o lugar. */
  derrubar(socket: SocketFalso): void {
    socket.fecharDoOutroLado();
    const p = this.participantes.find((q) => q.socket === socket);
    if (p) p.socket = null;
    this.transmitirEstado();
  }

  /** Termina a partida à força (o vencedor é o jogador 0), como se a última bola tivesse caído; todos recebem o `estado-sala`. */
  encerrarPartida(): void {
    if (!this.partida) return;
    this.partida = { ...this.partida, vencedor: 0, fase: 'fim' };
    this.pagarAposta();
    this.transmitirEstado();
  }

  /**
   * Como a sala de verdade (resumido): quem tem carteira pôs a aposta; perdedor paga a sua, os vencedores dividem o pote (a
   * sobra vai ao primeiro). Sem vencedor ou sem perdedor com carteira ninguém paga e não há mensagem. Vem antes do `estado-sala`.
   */
  private pagarAposta(): void {
    const vencedor = this.partida?.vencedor;
    if (vencedor === null || vencedor === undefined) return;
    const rol = this.participantes
      .filter((p) => p.lugar !== null && p.carteira !== undefined && this.carteiras.has(p.carteira))
      .sort((a, b) => a.lugar! - b.lugar!);
    const ganhadores = rol.filter((p) => equipeDoLugar(this.modo, p.lugar!) === vencedor);
    const perdedores = rol.filter((p) => equipeDoLugar(this.modo, p.lugar!) !== vencedor);
    if (ganhadores.length === 0 || perdedores.length === 0) return;
    const pote = this.aposta * rol.length;
    const parte = Math.floor(pote / ganhadores.length);
    const sobra = pote - parte * ganhadores.length;
    const variacoes = rol.map((p) => {
      const ganhou = ganhadores.includes(p);
      const delta = ganhou ? parte + (p === ganhadores[0] ? sobra : 0) - this.aposta : -this.aposta;
      const carteira = this.carteiras.get(p.carteira!)!;
      carteira.saldo += delta;
      return { lugar: p.lugar!, nome: p.nome, delta, saldo: carteira.saldo };
    });
    for (const p of this.participantes) p.socket?.entregar({ tipo: 'aposta-paga', valor: this.aposta, variacoes });
  }

  /** O que a sala tem como verdade agora. */
  get partidaAtual(): EstadoPartida | null {
    return this.partida;
  }

  get mesaAtual(): EstadoMesa | null {
    return this.mesa;
  }

  get seqAtual(): number {
    return this.seq;
  }

  private receber(socket: SocketFalso, dado: string | Uint8Array): void {
    const r = decodificarMensagemDoCliente(dado);
    if (!r.ok) throw new Error(`a sala falsa recebeu lixo: ${r.erro}`);
    const m = r.valor;
    this.recebidas.push(m);
    if (m.tipo === 'ping') return socket.entregar({ tipo: 'pong', t: m.t });
    if (m.tipo === 'criar-sala') {
      this.modo = m.modo;
      this.modalidade = m.modalidade ?? MODALIDADE_PADRAO;
      this.regras = m.regras;
      this.giz = { ...GIZ_DA_SALA_PADRAO, ...m.giz };
      this.forca = m.forca ?? FORCA_DA_SALA_PADRAO;
      this.relogio = { tempoS: m.relogio?.tempoS === undefined ? 30 : m.relogio.tempoS, aoEsgotar: 'perde-a-vez' };
      this.linha = completarLinha(m.linha, this.linha);
      this.aposta = m.aposta ?? APOSTA_PADRAO;
      return this.juntar(socket, m.nome, 0, true, m.carteira);
    }
    if (m.tipo === 'entrar') return this.entrar(socket, m.nome, m.token, m.carteira);
    const p = this.participantes.find((q) => q.socket === socket);
    if (!p) return;
    switch (m.tipo) {
      case 'escolher-lugar':
        return this.escolherLugar(p, m.lugar);
      case 'iniciar':
        return this.iniciar(p);
      case 'tacada':
        return this.tacada(p, m);
      case 'mira':
        if (p.lugar !== null && p.lugar === this.lugarDaVez) {
          for (const q of this.participantes) if (q !== p) q.socket?.entregar({ tipo: 'mira-retransmitida', lugar: p.lugar, angulo: m.angulo, lateral: m.lateral, vertical: m.vertical, recuo: m.recuo, ...(m.giz === true ? { giz: true as const } : {}) });
        }
        return;
      case 'chat':
        for (const q of this.participantes) q.socket?.entregar({ tipo: 'chat-retransmitido', lugar: p.lugar, nome: p.nome, texto: m.texto });
        return;
      case 'emoji':
        // Como a sala de verdade, em qualquer fase e de espectador também; o balde é problema da sala (aqui não há).
        for (const q of this.participantes) q.socket?.entregar({ tipo: 'emoji-retransmitido', lugar: p.lugar, nome: p.nome, emoji: m.emoji });
        return;
      case 'nova-partida':
        if (p.anfitriao && this.partida && (this.partida.vencedor !== null || this.partida.fase === 'fim')) this.comecar('nova-partida', this.partida.jogadores);
        return;
      case 'voltar-ao-lobby':
        return this.voltarAoLobby(p);
      case 'configurar-sala':
        return this.configurar(p, m);
      case 'expulsar':
        return this.expulsar(p, m.lugar);
    }
  }

  /**
   * Como a sala de verdade: só o anfitrião, só na espera, e não a si mesmo nem um lugar vago ou fora do modo. O expulso
   * recebe `expulso`, a conexão fecha com 4002 e o token dele deixa de valer; os outros recebem o `estado-sala` novo.
   */
  private expulsar(p: Participante, lugar: number): void {
    if (!p.anfitriao) return p.socket?.entregar({ tipo: 'erro', codigo: 'nao-anfitriao', mensagem: 'só o anfitrião' });
    if (this.fase !== 'espera') return p.socket?.entregar({ tipo: 'erro', codigo: 'fase-errada', mensagem: 'só na espera' });
    const alvo = this.participantes.find((q) => q.lugar === lugar);
    if (!alvo || alvo.anfitriao) return p.socket?.entregar({ tipo: 'erro', codigo: 'lugar-invalido', mensagem: 'lugar inválido' });
    this.participantes.splice(this.participantes.indexOf(alvo), 1);
    this.revogados.add(alvo.token);
    const socket = alvo.socket;
    alvo.socket = null;
    socket?.entregar({ tipo: 'expulso', motivo: 'anfitriao' });
    socket?.fecharDoOutroLado(4002);
    this.transmitirEstado();
  }

  /** Como a sala de verdade: partida terminada, anfitrião; quem saiu da sala perde o lugar e a sala volta à espera. */
  private voltarAoLobby(p: Participante): void {
    const acabou = this.partida !== null && (this.partida.vencedor !== null || this.partida.fase === 'fim');
    if (!p.anfitriao || this.fase !== 'jogando' || !acabou) {
      return p.socket?.entregar({ tipo: 'erro', codigo: p.anfitriao ? (this.fase !== 'jogando' ? 'fase-errada' : 'partida-em-andamento') : 'nao-anfitriao', mensagem: 'não pode voltar ao lobby' });
    }
    for (const q of [...this.participantes]) if (!q.socket && !q.anfitriao) this.participantes.splice(this.participantes.indexOf(q), 1);
    this.fase = 'espera';
    this.partida = null;
    this.arrumacao = [];
    this.mesa = null;
    this.seq = 0;
    this.ultima = null;
    this.transmitirEstado();
  }

  /** Só na espera, só o anfitrião; ao reduzir o modo (2x2 → 2x1 → 1x1) quem estava nos lugares que sobram vira espectador e recebe novas boas-vindas. */
  private configurar(p: Participante, m: Extract<MensagemDoCliente, { tipo: 'configurar-sala' }>): void {
    if (!p.anfitriao) return p.socket?.entregar({ tipo: 'erro', codigo: 'nao-anfitriao', mensagem: 'só o anfitrião' });
    if (this.fase !== 'espera') return p.socket?.entregar({ tipo: 'erro', codigo: 'fase-errada', mensagem: 'só na espera' });
    if (m.modalidade !== undefined && m.modalidade !== this.modalidade) {
      // como a sala de verdade: a modalidade nova joga com o preset de fábrica dela e, sem `modo`, o formato com o mesmo número de lugares
      this.modalidade = m.modalidade;
      this.regras = PRESETS_DE_FABRICA.find((preset) => preset.regras.modalidade === m.modalidade)?.regras ?? this.regras;
    }
    const modo = m.modo ?? modoAoTrocarDeModalidade(CATALOGO, this.modalidade, this.modo);
    if (modo !== this.modo) {
      this.modo = modo;
      for (const q of this.participantes) {
        if (q.lugar === null || q.lugar < this.quantos) continue;
        q.lugar = null;
        q.socket?.entregar({ tipo: 'boas-vindas', versao: PROTOCOLO_VERSAO, codigo: this.codigo, token: q.token, lugar: null, anfitriao: q.anfitriao });
      }
    }
    if (m.relogio?.tempoS !== undefined) this.relogio = { ...this.relogio, tempoS: m.relogio.tempoS };
    this.linha = completarLinha(m.linha, this.linha);
    if (m.giz !== undefined) this.giz = { ...this.giz, ...m.giz };
    if (m.forca !== undefined) this.forca = m.forca;
    if (m.aposta !== undefined) this.aposta = m.aposta;
    this.transmitirEstado();
  }

  private juntar(socket: SocketFalso, nome: string, lugar: number | null, anfitriao: boolean, carteira?: string): void {
    const p: Participante = { token: `token-da-sala-falsa-${++this.tokens}`, nome, lugar, anfitriao, socket, ...(carteira === undefined ? {} : { carteira }) };
    this.participantes.push(p);
    this.boasVindas(p);
  }

  private boasVindas(p: Participante): void {
    p.socket!.entregar({ tipo: 'boas-vindas', versao: PROTOCOLO_VERSAO, codigo: this.codigo, token: p.token, lugar: p.lugar, anfitriao: p.anfitriao });
    this.transmitirEstado();
    if (this.partida) p.socket!.entregar(this.retrato('entrada', true));
  }

  private entrar(socket: SocketFalso, nome: string, token?: string, carteira?: string): void {
    if (token !== undefined && this.revogados.has(token)) {
      return socket.entregar({ tipo: 'erro', codigo: 'token-invalido', mensagem: 'Você foi removido desta sala pelo anfitrião. Abra o link de novo para entrar.' });
    }
    const antigo = this.participantes.find((p) => p.token === token);
    if (antigo) {
      antigo.socket = socket;
      return this.boasVindas(antigo);
    }
    const lugar = this.fase === 'espera' ? this.primeiroLivre() : null;
    this.juntar(socket, nome, lugar, false, carteira);
  }

  private get quantos(): number {
    return LUGARES_POR_MODO[this.modo];
  }

  private primeiroLivre(): number | null {
    for (let l = 0; l < this.quantos; l++) if (!this.participantes.some((p) => p.lugar === l)) return l;
    return null;
  }

  private escolherLugar(p: Participante, lugar: number | null): void {
    if (this.fase !== 'espera') return;
    if (lugar !== null && lugar >= this.quantos) return p.socket?.entregar({ tipo: 'erro', codigo: 'lugar-invalido', mensagem: 'lugar inválido' });
    if (lugar !== null && this.participantes.some((q) => q !== p && q.lugar === lugar)) {
      return p.socket?.entregar({ tipo: 'erro', codigo: 'lugar-ocupado', mensagem: 'Lugar ocupado.' });
    }
    p.lugar = lugar;
    this.transmitirEstado();
  }

  private iniciar(p: Participante): void {
    if (!p.anfitriao || this.fase !== 'espera') return;
    const jogadores: Jogador[] = [];
    for (let lugar = 0; lugar < this.quantos; lugar++) {
      const dono = this.participantes.find((q) => q.lugar === lugar);
      if (!dono?.socket) return p.socket?.entregar({ tipo: 'erro', codigo: 'lugares-incompletos', mensagem: 'Faltam jogadores.' });
      jogadores.push({ id: `lugar-${lugar}`, nome: dono.nome, equipe: equipeDoLugar(this.modo, lugar) });
    }
    this.comecar('inicio', jogadores);
  }

  private comecar(motivo: 'inicio' | 'nova-partida', jogadores: readonly Jogador[]): void {
    const { partida, arrumacao } = novaPartida(this.regras!, jogadores, criarRng(11));
    this.partida = partida;
    this.arrumacao = arrumacao;
    this.mesa = null;
    this.seq = 0;
    this.ultima = null;
    this.fase = 'jogando';
    this.transmitirEstado();
    for (const p of this.participantes) p.socket?.entregar(this.retrato(motivo, false));
  }

  private get lugarDaVez(): number | null {
    const partida = this.partida;
    if (this.fase !== 'jogando' || !partida || partida.vencedor !== null || partida.fase === 'fim') return null;
    return Number(ID_DO_LUGAR.exec(partida.jogadores[partida.vez]!.id)![1]);
  }

  private tacada(p: Participante, m: MsgTacada): void {
    const partida = this.partida;
    const recusar = (codigo: 'nao-e-sua-vez' | 'seq-errado' | 'partida-diverge'): void => {
      p.socket?.entregar({ tipo: 'erro', codigo, mensagem: codigo });
      p.socket?.entregar(this.retrato('ressincronia', false));
    };
    if (!partida || p.lugar === null || p.lugar !== this.lugarDaVez) return recusar('nao-e-sua-vez');
    if (m.seq !== this.seq) return recusar('seq-errado');
    const r = aplicarTacada(partida, m.gravacao.eventos);
    if (JSON.stringify(r.partida) !== JSON.stringify(m.partida)) return recusar('partida-diverge');
    this.ultima = { seq: this.seq, lugar: p.lugar, parametros: m.parametros, gravacao: m.gravacao, consequencias: r.consequencias };
    this.partida = r.partida;
    this.mesa = m.mesa;
    const seq = this.seq++;
    for (const q of this.participantes) {
      q.socket?.entregar({ tipo: 'tacada-retransmitida', seq, lugar: p.lugar, parametros: m.parametros, gravacao: m.gravacao, partida: r.partida, mesa: m.mesa, consequencias: r.consequencias });
    }
    this.transmitirEstado();
  }

  /**
   * Passa a vez de quem esgotou o tempo (ou sumiu: a sala de verdade faz isto depois de 60 s). Na ordem da sala:
   * `tempo-esgotado`, `estado-sala` e `retrato` `vez-passou`.
   */
  passarAVez(motivo: 'tempo' | 'ausencia' = 'ausencia'): void {
    if (!this.partida) return;
    const quem = this.lugarDaVez!;
    this.partida = passarVez(this.partida);
    for (const p of this.participantes) {
      p.socket?.entregar({ tipo: 'tempo-esgotado', lugar: quem, proximo: this.lugarDaVez ?? quem, motivo, consequencia: 'perde-a-vez' });
    }
    this.transmitirEstado();
    for (const p of this.participantes) p.socket?.entregar(this.retrato('vez-passou', false));
  }

  private retrato(motivo: MsgRetrato['motivo'], comUltima: boolean): MsgRetrato {
    return { tipo: 'retrato', motivo, seq: this.seq, partida: this.partida!, arrumacao: this.arrumacao, semente: 5, mesa: this.mesa, ultima: comUltima ? this.ultima : null };
  }

  private estado(): MsgEstadoSala {
    const lugares: LugarSala[] = [0, 1, 2, 3].map((lugar) => {
      const dono = this.participantes.find((p) => p.lugar === lugar);
      const carteira = dono?.carteira === undefined ? undefined : this.carteiras.get(dono.carteira);
      return {
        lugar,
        equipe: equipeDoLugar(this.modo, lugar),
        nome: dono?.nome ?? null,
        conectado: dono?.socket != null,
        anfitriao: dono?.anfitriao ?? false,
        saldo: carteira?.saldo ?? null,
        skin: carteira?.skin ?? 'classico',
      };
    });
    return {
      tipo: 'estado-sala',
      codigo: this.codigo,
      modo: this.modo,
      modalidade: this.modalidade,
      preset: this.modalidade === 'mata-mata' ? 'Mata-mata' : 'Boteco',
      fase: this.fase,
      seq: this.seq,
      vez: this.lugarDaVez,
      lugares,
      espectadores: this.participantes.filter((p) => p.lugar === null).length,
      relogio: this.relogio,
      linha: this.linha,
      giz: this.giz,
      forca: this.forca,
      aposta: this.aposta,
      prazoMs: this.fase === 'jogando' && this.lugarDaVez !== null ? this.prazoMs : null,
    };
  }

  private transmitirEstado(): void {
    const estado = this.estado();
    for (const p of this.participantes) p.socket?.entregar(estado);
  }
}
