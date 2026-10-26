import type { ConfigMaos } from '../config';
import type { EixoDoTaco } from './eixo';
import { poseVaziaDeMao, type PoseDeMao } from './pose-das-maos';

type ConfigDoGiz = ConfigMaos['giz'];

/** As fases do gesto de passar o giz, na ordem. */
export type FaseDoGiz = 'parado' | 'pegar' | 'levar' | 'girar' | 'trazer' | 'voltar';

/** O que a animação precisa saber de cada quadro. */
export interface EntradaDoGiz {
  /** O giz do jogo está passando (a passada em curso). */
  readonly passando: boolean;
  /** G segue apertada: a próxima passada começa logo que esta acabar. */
  readonly encadeando: boolean;
  /** É a minha vez e a mão aparece: fora disso o gesto se desfaz. */
  readonly ativo: boolean;
  /** Quanto dura cada passada (s): o gesto cabe nela e encolhe com ela. */
  readonly passadaS: number;
}

const limitar = (v: number, a = 0, b = 1): number => Math.min(Math.max(v, a), b);
const suave = (t: number): number => t * t * (3 - 2 * t);
const MEIA_VOLTA_DE_QUADRANTE = Math.PI / 2;
/** Quão depressa os dedos fecham e abrem (1/s): uns 0,1 s. */
const TAXA_DA_PINCA = 14;
/** Quanto leva para o balanço e o círculo do giro chegarem à amplitude cheia (s). */
const ENTRADA_DO_GIRO_S = 0.15;

function copiarPose(de: PoseDeMao, para: PoseDeMao): void {
  para.x = de.x;
  para.y = de.y;
  para.z = de.z;
  para.dx = de.dx;
  para.dy = de.dy;
  para.dz = de.dz;
  para.ux = de.ux;
  para.uy = de.uy;
  para.uz = de.uz;
}

/**
 * Passa de uma pose a outra: a posição anda em linha reta (com o arco `arco`, m, para cima no meio do caminho) e a direção da
 * mão e o "para cima" dela giram juntos pelo caminho curto. `t` de 0 a 1.
 */
export function entrePoses(a: PoseDeMao, b: PoseDeMao, t: number, arco: number, saida: PoseDeMao): PoseDeMao {
  saida.x = a.x + (b.x - a.x) * t;
  saida.y = a.y + (b.y - a.y) * t + Math.sin(Math.PI * t) * arco;
  saida.z = a.z + (b.z - a.z) * t;
  let dx = a.dx + (b.dx - a.dx) * t;
  let dy = a.dy + (b.dy - a.dy) * t;
  let dz = a.dz + (b.dz - a.dz) * t;
  const nd = Math.hypot(dx, dy, dz) || 1;
  dx /= nd;
  dy /= nd;
  dz /= nd;
  let ux = a.ux + (b.ux - a.ux) * t;
  let uy = a.uy + (b.uy - a.uy) * t;
  let uz = a.uz + (b.uz - a.uz) * t;
  // O "para cima" perde a parte ao longo da direção: continua perpendicular a ela.
  const p = ux * dx + uy * dy + uz * dz;
  ux -= p * dx;
  uy -= p * dy;
  uz -= p * dz;
  const nu = Math.hypot(ux, uy, uz) || 1;
  saida.dx = dx;
  saida.dy = dy;
  saida.dz = dz;
  saida.ux = ux / nu;
  saida.uy = uy / nu;
  saida.uz = uz / nu;
  return saida;
}

/** Gira a mão em torno da própria direção (o eixo do taco, ou o da argola) por `rad`. */
export function rolarMao(mao: PoseDeMao, rad: number, saida: PoseDeMao): PoseDeMao {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // w = d × u
  const wx = mao.dy * mao.uz - mao.dz * mao.uy;
  const wy = mao.dz * mao.ux - mao.dx * mao.uz;
  const wz = mao.dx * mao.uy - mao.dy * mao.ux;
  const ux = mao.ux * c + wx * s;
  const uy = mao.uy * c + wy * s;
  const uz = mao.uz * c + wz * s;
  copiarPose(mao, saida);
  saida.ux = ux;
  saida.uy = uy;
  saida.uz = uz;
  return saida;
}

/**
 * O quadro do cubo na borda, em que a postura da pinça está escrita: a origem no centro do cubo, a direção para baixo (a face da
 * covinha é a de `-d`, então fica para cima) e o "para cima" apontando para quem taca (contra a mira horizontal `angulo`): a mão
 * chega ao cubo pelo lado de quem taca e o pega pelas faces de lado.
 */
export function poseDoCubo(x: number, y: number, z: number, angulo: number, saida: PoseDeMao = poseVaziaDeMao()): PoseDeMao {
  saida.dx = 0;
  saida.dy = -1;
  saida.dz = 0;
  saida.ux = -Math.cos(angulo);
  saida.uy = 0;
  saida.uz = -Math.sin(angulo);
  saida.x = x;
  saida.y = y;
  saida.z = z;
  return saida;
}

/**
 * O quadro do cubo na ponta do taco: a direção é a do taco e o cubo encosta a face da covinha na ponta (o centro dele, a origem do
 * quadro, fica meio lado à frente dela). A mão o pega pelas faces de lado, por cima, e a ponta chega por trás, sem nada no caminho.
 */
export function poseDaPonta(eixo: EixoDoTaco, lado: number, saida: PoseDeMao = poseVaziaDeMao()): PoseDeMao {
  saida.dx = eixo.dx;
  saida.dy = eixo.dy;
  saida.dz = eixo.dz;
  const k = Math.hypot(eixo.dx, eixo.dz) || 1;
  saida.ux = (-eixo.dx * eixo.dy) / k;
  saida.uy = k;
  saida.uz = (-eixo.dz * eixo.dy) / k;
  const adiante = lado / 2;
  saida.x = eixo.px + eixo.dx * adiante;
  saida.y = eixo.py + eixo.dy * adiante;
  saida.z = eixo.pz + eixo.dz * adiante;
  return saida;
}

/**
 * O cubo de giz no quadro dele (o da pinça): o centro dele é a origem; a face com a covinha (a normal em `d`) olha para trás, para a
 * ponta; `giro` é o quanto ele rolou em torno dessa normal. `u` é uma direção perpendicular à normal (a do cubo de lado).
 */
export function cuboNaMao(mao: PoseDeMao, giro: number, saida: PoseDeMao = poseVaziaDeMao()): PoseDeMao {
  rolarMao(mao, giro, saida);
  saida.dx = -mao.dx;
  saida.dy = -mao.dy;
  saida.dz = -mao.dz;
  return saida;
}

/**
 * O gesto de passar o giz, só conta (sem three nem DOM): a mão da ponte vai ao cubo na borda, o pega, leva à ponta do taco, gira o
 * cubo nela enquanto a passada dura (e enquanto G seguir apertada), traz o cubo de volta e volta à ponte. Cada fase dura o de
 * `ConfigMaos.giz`, encolhido para caber numa passada curta. O tamanho do gesto (`recuo`) e as poses a cada quadro saem daqui;
 * `poseDaMao` põe a mão no caminho certo e `afasta` diz o quanto o taco já saiu da frente da bola.
 *
 * Fora de `ativo` (a vez passou, a tacada foi armada, as mãos sumiram) o gesto se desfaz: o cubo volta à borda e a mão volta à
 * ponte rápido, a partir de onde estava.
 */
export class AnimacaoDoGiz {
  fase: FaseDoGiz = 'parado';
  /** Quanto da fase já passou (0 a 1), sem suavizar. */
  progresso = 0;
  /** O quanto o cubo rolou na ponta (rad). */
  giro = 0;
  /** O cubo está na mão (da hora em que ela o pega até o devolver). */
  cuboNaMao = false;
  /** 0 a 1: o taco recuou até onde o gesto pede. */
  afasta = 0;
  /** 0 a 1: o quanto a mão já fechou na pinça do cubo (0 = a ponte aberta). Fecha ao chegar no cubo e abre ao devolvê-lo. */
  pinca = 0;
  /** O cubo está girando na ponta neste quadro (de onde sai o pó). */
  get girando(): boolean {
    return this.fase === 'girar';
  }

  private tempoGirando = 0;
  private duracao = 0;
  private apressada = false;
  private readonly origem: PoseDeMao = poseVaziaDeMao();
  private readonly ultima: PoseDeMao = poseVaziaDeMao();
  private girosAntes = 0;
  private temUltima = false;
  private origemPendente = false;

  constructor(private readonly cfg: ConfigDoGiz) {}

  /** Esquece o gesto (partida nova): tudo volta ao começo sem animar. */
  reiniciar(): void {
    this.fase = 'parado';
    this.progresso = 0;
    this.giro = 0;
    this.cuboNaMao = false;
    this.afasta = 0;
    this.pinca = 0;
    this.tempoGirando = 0;
    this.temUltima = false;
    this.origemPendente = false;
  }

  private escalaDoTempo(passadaS: number): number {
    return limitar(passadaS / this.cfg.referenciaS, this.cfg.escalaMinima, 1);
  }

  private entrar(fase: FaseDoGiz, passadaS: number): void {
    this.fase = fase;
    this.progresso = 0;
    const k = this.escalaDoTempo(passadaS);
    const base = { pegar: this.cfg.pegarS, levar: this.cfg.levarS, trazer: this.cfg.trazerS, voltar: this.cfg.voltarS, girar: 0, parado: 0 }[fase];
    this.duracao = Math.max(base * k * (this.apressada ? 0.4 : 1), 1e-3);
    if (this.temUltima) copiarPose(this.ultima, this.origem);
    else this.origemPendente = true;
    if (fase === 'girar') this.tempoGirando = 0;
    if (fase === 'trazer') this.girosAntes = this.giro;
  }

  /** Uma vez por quadro. */
  atualizar(dt: number, e: EntradaDoGiz): void {
    const passo = Math.max(dt, 0);
    const quer = e.passando || e.encadeando;

    if (!e.ativo && this.fase !== 'parado') {
      // Desfaz: o cubo volta à borda já e a mão volta à ponte depressa.
      this.cuboNaMao = false;
      this.giro = 0;
      if (this.fase !== 'voltar') {
        this.apressada = true;
        this.entrar('voltar', e.passadaS);
      }
    }

    switch (this.fase) {
      case 'parado':
        if (e.ativo && e.passando) {
          this.apressada = false;
          this.giro = 0;
          this.entrar('pegar', e.passadaS);
        }
        break;
      case 'pegar':
        this.progresso = limitar(this.progresso + passo / this.duracao);
        if (this.progresso >= 1) {
          this.cuboNaMao = true;
          this.entrar('levar', e.passadaS);
        }
        break;
      case 'levar':
        this.progresso = limitar(this.progresso + passo / this.duracao);
        if (this.progresso >= 1) this.entrar('girar', e.passadaS);
        break;
      case 'girar': {
        this.tempoGirando += passo;
        this.giro += this.cfg.giro.voltasPorS * 2 * Math.PI * passo;
        const minimo = this.cfg.giroMinimoS * this.escalaDoTempo(e.passadaS);
        this.progresso = limitar(this.tempoGirando / Math.max(minimo, 1e-3));
        if (this.tempoGirando >= minimo && !quer) this.entrar('trazer', e.passadaS);
        break;
      }
      case 'trazer':
        if (e.ativo && quer && this.progresso < 0.6) {
          // G apertada de novo no meio da volta: a mão dá meia-volta e retoma o giz.
          this.entrar('levar', e.passadaS);
          break;
        }
        this.progresso = limitar(this.progresso + passo / this.duracao);
        // O cubo cai de volta alinhado: o giro termina num múltiplo de um quarto de volta.
        this.giro = this.girosAntes + (Math.round(this.girosAntes / MEIA_VOLTA_DE_QUADRANTE) * MEIA_VOLTA_DE_QUADRANTE - this.girosAntes) * suave(this.progresso);
        if (this.progresso >= 1) {
          this.cuboNaMao = false;
          this.giro = 0;
          this.entrar('voltar', e.passadaS);
        }
        break;
      case 'voltar':
        if (e.ativo && e.passando) {
          this.apressada = false;
          this.entrar('pegar', e.passadaS);
          break;
        }
        this.progresso = limitar(this.progresso + passo / this.duracao);
        if (this.progresso >= 1) {
          this.fase = 'parado';
          this.progresso = 0;
          this.apressada = false;
          this.temUltima = false;
        }
        break;
    }

    // O taco sai da frente da bola de quando a mão pega o giz até começar a trazê-lo de volta.
    const alvo = this.fase === 'pegar' || this.fase === 'levar' || this.fase === 'girar' || (this.fase === 'trazer' && this.progresso < 0.5) ? 1 : 0;
    this.afasta += (alvo - this.afasta) * (1 - Math.exp(-this.cfg.taxaDoTaco * passo));
    if (Math.abs(alvo - this.afasta) < 0.002) this.afasta = alvo;

    // Os dedos fecham quando a mão está chegando ao cubo e abrem quando ela o larga: o fator anda atrás do alvo, sem salto.
    const fecha = this.fase === 'levar' || this.fase === 'girar' || this.fase === 'trazer' || (this.fase === 'pegar' && this.progresso > 0.5);
    this.pinca += ((fecha ? 1 : 0) - this.pinca) * (1 - Math.exp(-TAXA_DA_PINCA * passo));
    if (Math.abs((fecha ? 1 : 0) - this.pinca) < 0.002) this.pinca = fecha ? 1 : 0;
  }

  /**
   * O cubo na ponta do taco enquanto gira (`ponta` é a pose dele parado, de `poseDaPonta`): ele rola em torno do eixo do taco, que
   * passa pelo centro dele, e o centro faz um círculo pequeno, de modo que a sola anda pela face sem sair dela. É no cubo, e não na
   * mão, que o giro se faz: a mão o segue pela pinça, e a face fica no plano da ponta qualquer que seja a mão.
   */
  cuboGirando(ponta: PoseDeMao, saida: PoseDeMao): PoseDeMao {
    const { balancoRad, raioM, voltasPorS } = this.cfg.giro;
    const fase = 2 * Math.PI * voltasPorS * this.tempoGirando;
    // Entra no giro sem salto: a amplitude sobe do zero em `ENTRADA_DO_GIRO_S`.
    const k = suave(limitar(this.tempoGirando / ENTRADA_DO_GIRO_S));
    rolarMao(ponta, Math.sin(fase * 0.5) * balancoRad * k, saida);
    const wx = ponta.dy * ponta.uz - ponta.dz * ponta.uy;
    const wy = ponta.dz * ponta.ux - ponta.dx * ponta.uz;
    const wz = ponta.dx * ponta.uy - ponta.dy * ponta.ux;
    const c = Math.cos(fase) * raioM * k;
    const sn = Math.sin(fase) * raioM * k;
    saida.x = ponta.x + ponta.ux * c + wx * sn;
    saida.y = ponta.y + ponta.uy * c + wy * sn;
    saida.z = ponta.z + ponta.uz * c + wz * sn;
    return saida;
  }

  /**
   * A pose da mão neste quadro: `ponte` é onde ela estaria sem o giz, `cubo` a mão em volta do cubo na borda e `ponta` a mão na
   * ponta do taco (girando, a de `cuboGirando`, já com o balanço). Parado, devolve a ponte.
   */
  poseDaMao(ponte: PoseDeMao, cubo: PoseDeMao, ponta: PoseDeMao, saida: PoseDeMao): PoseDeMao {
    // O gesto começa de onde a mão estava: a ponte.
    if (this.origemPendente) {
      copiarPose(ponte, this.origem);
      this.origemPendente = false;
    }
    const t = suave(this.progresso);
    switch (this.fase) {
      case 'parado':
        copiarPose(ponte, saida);
        break;
      case 'pegar':
        entrePoses(this.origem, cubo, t, 0.03, saida);
        break;
      case 'levar':
        entrePoses(this.origem, ponta, t, 0.04, saida);
        break;
      case 'girar':
        // O balanço e o círculo já estão em `ponta`: `cuboGirando` os faz no cubo, antes de a mão o pinçar.
        copiarPose(ponta, saida);
        break;
      case 'trazer':
        entrePoses(this.origem, cubo, t, 0.04, saida);
        break;
      case 'voltar':
        entrePoses(this.origem, ponte, t, 0.03, saida);
        break;
    }
    copiarPose(saida, this.ultima);
    this.temUltima = true;
    return saida;
  }
}
