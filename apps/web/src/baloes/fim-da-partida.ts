import type { ConfigBaloes } from '../config';
import type { CaraDoBalao } from './rosto';

type ConfigDoFim = ConfigBaloes['fim'];

/** Onde um balão do fim paira (m, mundo) e o quanto o círculo de balões se abre em volta da mesa (rad, a partir de +X). */
export interface LugarDoFim {
  x: number;
  z: number;
}

/** Os ângulos extremos do arco de balões: o lado da câmera (+Z) fica livre, para ninguém ficar entre ela e a mesa. */
const ARCO = { de: (190 * Math.PI) / 180, ate: (350 * Math.PI) / 180 };

/**
 * Os lugares dos `quantos` balões em volta da mesa, de uma ponta à outra pelo fundo (do lado oposto ao da câmera): uma elipse
 * `folga` m maior que a moldura (`semiX`, `semiZ`), com os balões espaçados igualmente no arco. A equipe `i` fica no lugar `i`.
 */
export function lugaresDoFim(quantos: number, semiX: number, semiZ: number, folga: number): LugarDoFim[] {
  const lugares: LugarDoFim[] = [];
  for (let i = 0; i < quantos; i++) {
    const t = quantos === 1 ? 0.5 : i / (quantos - 1);
    const angulo = ARCO.de + (ARCO.ate - ARCO.de) * t;
    lugares.push({ x: (semiX + folga) * Math.cos(angulo), z: (semiZ + folga) * Math.sin(angulo) });
  }
  return lugares;
}

/** O que o desenho de um balão pede, neste instante do fim (relativo ao balão cheio de `cfg.tamanho`). */
export interface QuadroDoFim {
  /** 0 a 1: aparece. */
  escala: number;
  largura: number;
  altura: number;
  /** Quanto pende para o lado (rad), além do balanço. */
  caida: number;
  /** Quanto o centro desceu do lugar do balão cheio, em alturas do balão cheio (quem desenha converte em m). */
  descida: number;
  cara: CaraDoBalao;
}

export function quadroVazioDoFim(): QuadroDoFim {
  return { escala: 0, largura: 1, altura: 1, caida: 0, descida: 0, cara: 'neutro' };
}

const limitar = (v: number, a = 0, b = 1): number => Math.min(Math.max(v, a), b);
const suave = (t: number): number => 1 - (1 - t) * (1 - t) * (1 - t);
/** Passa do alvo um pouco e volta: o balão cheio "estufa" com folga antes de assentar. */
const comSobra = (t: number): number => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/**
 * O balão de uma equipe `tempoS` s depois de o fim começar. Todos entram juntos, do mesmo tamanho e de cara neutra; depois de
 * `entraS` quem ganhou estufa (passa um pouco do tamanho, assenta e fica pulsando de leve, sorrindo) e quem perdeu murcha (encolhe,
 * pende para o lado, desce e fica triste). `lado` (±1) escolhe o lado em que o murcho pende, para não penderem todos igual.
 */
export function quadroDoFim(ganhou: boolean, lado: number, tempoS: number, cfg: ConfigDoFim, saida: QuadroDoFim = quadroVazioDoFim()): QuadroDoFim {
  saida.escala = suave(limitar(tempoS / cfg.entraS));
  const virada = limitar((tempoS - cfg.entraS) / cfg.viraS);
  if (ganhou) {
    const k = comSobra(virada);
    const pulso = virada >= 1 ? Math.sin((2 * Math.PI * (tempoS - cfg.entraS - cfg.viraS)) / cfg.estufa.pulsoS) * cfg.estufa.pulso : 0;
    saida.largura = 1 + (cfg.estufa.largura - 1) * k + pulso;
    saida.altura = 1 + (cfg.estufa.altura - 1) * k + pulso;
    saida.caida = 0;
    saida.descida = 0;
    saida.cara = virada > 0 ? 'sorriso' : 'neutro';
  } else {
    const k = suave(virada);
    saida.largura = 1 + (cfg.murcha.largura - 1) * k;
    saida.altura = 1 + (cfg.murcha.altura - 1) * k;
    saida.caida = Math.sign(lado || 1) * cfg.murcha.caida * k;
    saida.descida = cfg.murcha.descida * k;
    saida.cara = virada > 0 ? 'triste' : 'neutro';
  }
  return saida;
}

/**
 * O roteiro do fim da partida: dura `duracaoS` (a tela de fim entra depois) e pode ser pulado. Só conta o tempo: quem desenha lê o
 * `tempoS`. O relógio é o do chamador (ms da página), e a câmera lenta de um teste não o muda.
 */
export class FimDaPartida {
  private inicioMs: number | null = null;
  private pulado = false;
  private fixo: number | null = null;
  private _ganhou: readonly boolean[] = [];

  /** Recomeça o roteiro: `ganhou[i]` é se a equipe `i` ganhou. */
  iniciar(agoraMs: number, ganhou: readonly boolean[]): void {
    this.inicioMs = agoraMs;
    this.pulado = false;
    this.fixo = null;
    this._ganhou = ganhou;
  }

  /** Para tudo e esquece (partida nova, sala voltou à espera). */
  cancelar(): void {
    this.inicioMs = null;
    this.pulado = false;
    this.fixo = null;
    this._ganhou = [];
  }

  /** Para o relógio do roteiro em `tempoS` (capturas de teste); `null` solta. Parado, o roteiro não acaba. */
  fixar(tempoS: number | null): void {
    this.fixo = tempoS;
  }

  /** Acaba já: o quadro seguinte vê o roteiro inteiro. */
  pular(): void {
    if (this.inicioMs !== null) this.pulado = true;
  }

  /** O roteiro começou e ainda não acabou nem foi pulado. */
  ativo(agoraMs: number, duracaoS: number): boolean {
    if (this.inicioMs === null || this.pulado) return false;
    return this.fixo !== null || (agoraMs - this.inicioMs) / 1000 < duracaoS;
  }

  /** O roteiro foi iniciado (tocando, acabado ou pulado) e não foi cancelado: os balões seguem na cena. */
  get existe(): boolean {
    return this.inicioMs !== null;
  }

  /** Segundos desde o começo, inteiros do roteiro se foi pulado (nunca passa de `duracaoS`). */
  tempoS(agoraMs: number, duracaoS: number): number {
    if (this.inicioMs === null) return 0;
    if (this.pulado) return duracaoS;
    if (this.fixo !== null) return Math.min(Math.max(this.fixo, 0), duracaoS);
    return Math.min(Math.max((agoraMs - this.inicioMs) / 1000, 0), duracaoS);
  }

  get equipes(): number {
    return this._ganhou.length;
  }

  ganhou(equipe: number): boolean {
    return this._ganhou[equipe] === true;
  }
}
