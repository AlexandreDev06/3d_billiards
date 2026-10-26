import type { IdBola } from '@sinuca/fisica';
import { progressoDaFase, type FaseDaTransicao, type ItemDeVoo, type PlanoDaTransicao } from '../jogo/transicao-modelo';
import type { FichaDaBola } from './bola-estilo';
import type { PontoNaTela } from './projecao';

/** O que a transição mexe em cada bola da cena (um `THREE.Mesh` serve). */
export interface BolaDaCena {
  readonly position: { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown };
  readonly scale: { setScalar(valor: number): unknown };
  visible: boolean;
}

export interface ConfigDoMovimento {
  /** Quanto a bola paga sobe antes de voar (m). */
  readonly levantarM: number;
  /** Fração do voo gasta na subida; passada ela, a bola vira a ficha de tela. */
  readonly subidaDoVoo: number;
  /** Altura do arco da ficha de tela no meio do voo (px). */
  readonly arcoPx: number;
  /** Quanto a ficha do placar fica acesa depois da chegada (ms). */
  readonly acenderMs: number;
  readonly pulsosPorSegundo: number;
  /** Quanto o anel cresce e encolhe ao pulsar (fração do tamanho). */
  readonly pulsoEscala: number;
}

export interface AdaptadoresDaTransicao {
  readonly bolas: readonly (BolaDaCena | undefined)[];
  /** Os anéis vermelhos (`AneisDeBolas`). */
  readonly aneis: {
    mostrar(ids: readonly IdBola[], bolas: readonly (BolaDaCena | undefined)[], intensidade: number, escala: number): void;
    esconder(): void;
  };
  /** Mundo → tela (px) e o diâmetro, em px, de uma esfera de `raio` ali; falso se não aparece. */
  readonly projetar: (x: number, y: number, z: number, raio: number, saida: PontoNaTela) => boolean;
  readonly placar: {
    /** O centro, em px da janela, da ficha da bola na linha do jogador (ou da linha, se a ficha não está lá); `null` se não há. */
    posicaoDaFicha(bola: IdBola, jogador: number): PontoNaTela | null;
    acenderFicha(bola: IdBola, jogador: number, agoraMs: number, ms: number): void;
  };
  /** As fichas voando em cima da tela (DOM), uma por item do voo. */
  readonly voos: {
    mostrar(indice: number, ficha: FichaDaBola, x: number, y: number, escala: number): void;
    esconder(indice: number): void;
  };
  readonly raioDaBola: (id: IdBola) => number;
  readonly cfg: ConfigDoMovimento;
}

export interface ContextoDaTransicao {
  readonly plano: PlanoDaTransicao;
  /** A ficha (número e estilo) de cada bola que voa. */
  readonly fichas: ReadonlyMap<IdBola, FichaDaBola>;
  /** Onde a bola recolocada termina, na mesa de depois da tacada. */
  readonly destino: (bola: IdBola) => { readonly x: number; readonly z: number };
  /** A bola estava na mesa antes da tacada (ela desliza da caçapa ou de onde saiu); senão ela nasce no lugar. */
  readonly existiaAntes: (bola: IdBola) => boolean;
  /** A transição acabou (ou foi pulada): sincronize a cena com a mesa de depois. */
  readonly aoFim: () => void;
}

interface Voo {
  readonly item: ItemDeVoo;
  /** A ficha de tela já saiu (tem partida e chegada). */
  noAr: boolean;
  /** Não deu para montar o voo de tela (sem ficha no placar ou fora do campo de visão): só some. */
  semTela: boolean;
  chegou: boolean;
  sx: number;
  sy: number;
  escala0: number;
  tx: number;
  ty: number;
}

interface Deslize {
  readonly bola: IdBola;
  iniciou: boolean;
  de: { x: number; z: number } | null;
  readonly para: { readonly x: number; readonly z: number };
}

/** Parte e chega devagar: 3p² − 2p³. */
const suave = (p: number): number => p * p * (3 - 2 * p);

/**
 * Toca o plano da transição quadro a quadro: o anel vermelho na bola paga, ela subindo e voando até a ficha do
 * placar de quem recebeu (a ficha acende) e as recolocações deslizando até o lugar. Não conhece three.js nem o DOM:
 * tudo passa pelos adaptadores. Sem alocar por quadro depois de `iniciar`.
 */
export class TransicaoDaTacada {
  private ctx: ContextoDaTransicao | null = null;
  private inicioMs = 0;
  private voos: Voo[] = [];
  private deslizes: Deslize[] = [];
  private readonly ponto: PontoNaTela = { x: 0, y: 0, tamanho: 0 };
  private velocidadeAtual = 1;

  constructor(private readonly ad: AdaptadoresDaTransicao) {}

  get ativa(): boolean {
    return this.ctx !== null;
  }

  get velocidade(): number {
    return this.velocidadeAtual;
  }

  /** Fator do tempo da transição (1 = normal, 0,25 = quatro vezes mais devagar); só para teste e captura. */
  set velocidade(valor: number) {
    if (!(valor > 0)) throw new RangeError(`velocidade da transição inválida: ${valor}`);
    this.velocidadeAtual = valor;
  }

  iniciar(ctx: ContextoDaTransicao, agoraMs: number): void {
    this.cancelar();
    this.ctx = ctx;
    this.inicioMs = agoraMs;
    this.voos = [];
    this.deslizes = [];
    for (const fase of ctx.plano.fases) {
      if (fase.tipo === 'voo') {
        for (const item of fase.itens) this.voos.push({ item, noAr: false, semTela: false, chegou: false, sx: 0, sy: 0, escala0: 1, tx: 0, ty: 0 });
      } else if (fase.tipo === 'deslize') {
        for (const { bola } of fase.itens) this.deslizes.push({ bola, iniciou: false, de: null, para: ctx.destino(bola) });
      }
    }
  }

  /** Um clique pula: tudo some e `aoFim` roda já. */
  pular(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.encerrar();
    ctx.aoFim();
  }

  /** A partida foi trocada por outra (retrato da sala, partida nova): apaga tudo sem avisar o fim. */
  cancelar(): void {
    if (this.ctx) this.encerrar();
  }

  atualizar(agoraMs: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const tS = ((agoraMs - this.inicioMs) / 1000) * this.velocidadeAtual;
    let vooAtual = 0;
    let deslizeAtual = 0;
    let aneisAcesos = false;
    for (const fase of ctx.plano.fases) {
      if (fase.tipo === 'anel') {
        if (tS >= fase.inicioS && tS < fase.inicioS + fase.duracaoS) {
          this.mostrarAnel(fase, tS);
          aneisAcesos = true;
        }
      } else if (fase.tipo === 'voo') {
        for (let i = 0; i < fase.itens.length; i++) this.moverVoo(this.voos[vooAtual++]!, fase, tS, agoraMs);
      } else {
        for (let i = 0; i < fase.itens.length; i++) this.moverDeslize(this.deslizes[deslizeAtual++]!, fase, tS);
      }
    }
    if (!aneisAcesos) this.ad.aneis.esconder();
    if (tS >= ctx.plano.duracaoS) {
      this.encerrar();
      ctx.aoFim();
    }
  }

  private encerrar(): void {
    this.ctx = null;
    this.ad.aneis.esconder();
    for (let i = 0; i < this.voos.length; i++) this.ad.voos.esconder(i);
  }

  private mostrarAnel(fase: Extract<FaseDaTransicao, { tipo: 'anel' }>, tS: number): void {
    const { cfg } = this.ad;
    const noAnel = tS - fase.inicioS;
    const entrada = Math.min(1, noAnel / Math.max(fase.duracaoS * 0.15, 1e-6));
    const pulso = Math.sin(noAnel * 2 * Math.PI * cfg.pulsosPorSegundo);
    this.ad.aneis.mostrar(fase.bolas, this.ad.bolas, entrada * (0.8 + 0.2 * pulso), 1 + cfg.pulsoEscala * pulso);
  }

  private moverVoo(voo: Voo, fase: Extract<FaseDaTransicao, { tipo: 'voo' }>, tS: number, agoraMs: number): void {
    if (tS < fase.inicioS || voo.chegou) return;
    const { cfg, bolas } = this.ad;
    const bola = bolas[voo.item.bola];
    const p = progressoDaFase(fase, tS);
    const daMesa = voo.item.origem === 'mesa';
    const subida = daMesa ? cfg.subidaDoVoo : 0;
    const raio = this.ad.raioDaBola(voo.item.bola);
    if (bola && p < subida) {
      const u = p / subida;
      bola.position.y = raio + cfg.levantarM * (1 - (1 - u) * (1 - u));
      return;
    }
    if (!voo.noAr && !voo.semTela) this.largarFicha(voo, bola, daMesa ? raio + cfg.levantarM : raio);
    if (voo.noAr && p < 1) {
      const u = (p - subida) / (1 - subida);
      const e = suave(u);
      this.ad.voos.mostrar(
        this.indiceDoVoo(voo),
        this.ctx!.fichas.get(voo.item.bola) ?? { id: voo.item.bola, estilo: 'lisa' },
        voo.sx + (voo.tx - voo.sx) * e,
        voo.sy + (voo.ty - voo.sy) * e - cfg.arcoPx * Math.sin(Math.PI * u),
        voo.escala0 + (1 - voo.escala0) * e,
      );
    }
    if (p >= 1) {
      voo.chegou = true;
      this.ad.voos.esconder(this.indiceDoVoo(voo));
      this.ad.placar.acenderFicha(voo.item.bola, voo.item.paraJogador, agoraMs, cfg.acenderMs);
    }
  }

  /** A bola vira a ficha de tela: ela some da mesa e a ficha parte de onde ela estava, rumo à ficha do placar. */
  private largarFicha(voo: Voo, bola: BolaDaCena | undefined, altura: number): void {
    if (bola) bola.visible = false;
    const alvo = this.ad.placar.posicaoDaFicha(voo.item.bola, voo.item.paraJogador);
    if (!bola || !alvo || !this.ad.projetar(bola.position.x, altura, bola.position.z, this.ad.raioDaBola(voo.item.bola), this.ponto)) {
      voo.semTela = true;
      return;
    }
    voo.noAr = true;
    voo.sx = this.ponto.x;
    voo.sy = this.ponto.y;
    voo.escala0 = Math.max(1, this.ponto.tamanho / Math.max(alvo.tamanho, 1));
    voo.tx = alvo.x;
    voo.ty = alvo.y;
  }

  private indiceDoVoo(voo: Voo): number {
    return this.voos.indexOf(voo);
  }

  private moverDeslize(d: Deslize, fase: Extract<FaseDaTransicao, { tipo: 'deslize' }>, tS: number): void {
    if (tS < fase.inicioS) return;
    const bola = this.ad.bolas[d.bola];
    if (!bola) return;
    const raio = this.ad.raioDaBola(d.bola);
    if (!d.iniciou) {
      d.iniciou = true;
      d.de = this.ctx!.existiaAntes(d.bola) ? { x: bola.position.x, z: bola.position.z } : null;
    }
    const p = progressoDaFase(fase, tS);
    const e = suave(p);
    bola.visible = true;
    if (d.de === null) {
      bola.position.set(d.para.x, raio, d.para.z);
      bola.scale.setScalar(p >= 1 ? 1 : e);
      return;
    }
    bola.position.set(d.de.x + (d.para.x - d.de.x) * e, raio, d.de.z + (d.para.z - d.de.z) * e);
    bola.scale.setScalar(p < 0.25 ? 0.5 + 2 * p : 1);
  }
}
