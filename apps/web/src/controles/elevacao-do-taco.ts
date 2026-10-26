import type { EstadoMesa, MedidasMesa, MedidasTaco } from '@sinuca/fisica';
import { ID_BOLAO, cacapas } from '@sinuca/fisica';
import type { ConfigElevacaoDoTaco, ConfigMesa } from '../config';
import { larguraDaMoldura } from '../cena/geometria-mesa';

/**
 * O vão de uma caçapa na borracha e na moldura: a garganta (o canal entre as faces das quinas, `raio` de cada lado do eixo, da
 * boca até o centro do círculo de queda) e o círculo de queda. Ali não há tabela nem madeira para o taco atravessar.
 * Medidas em m, a partir do centro do pano.
 */
export interface VaoDeCacapa {
  /** Meio da linha da boca. */
  readonly bx: number;
  readonly bz: number;
  /** Eixo da boca, unitário, para fora da mesa. */
  readonly ex: number;
  readonly ez: number;
  /** Meia boca: metade da largura da garganta e raio do círculo de queda. */
  readonly raio: number;
  /** Da boca ao centro do círculo de queda (`fundo + raio`): onde a garganta acaba e só o círculo continua. */
  readonly profundidade: number;
  /** Centro do círculo de queda. */
  readonly cx: number;
  readonly cz: number;
}

/**
 * A parte da mesa que o taco pode atravessar: a borracha da tabela (do nariz para fora, `larguraBorracha`) e, depois dela, a
 * moldura de madeira (`larguraMoldura`), exceto no vão das caçapas (`vaos`). Medidas em m, a partir do centro do pano; as
 * alturas contam do pano.
 */
export interface ObstaculosDaMesa {
  /** Metade da área de jogo, de nariz a nariz, em X e em Z. */
  readonly semiX: number;
  readonly semiZ: number;
  readonly larguraBorracha: number;
  readonly larguraMoldura: number;
  readonly alturaBorracha: number;
  readonly alturaMoldura: number;
  /** As seis caçapas: por elas o taco passa sem subir. */
  readonly vaos: readonly VaoDeCacapa[];
}

/**
 * As alturas vêm de `alturaTabela` e do que o desenho passa dela (`chanfroTopo` na borracha, `sobraMoldura` na moldura); a
 * largura da moldura é a que o desenho usa (alargada para o buraco do meio caber, `larguraDaMoldura`) e os vãos, os das
 * caçapas da física.
 */
export function obstaculosDaMesa(mesa: MedidasMesa, desenho: Pick<ConfigMesa, 'chanfroTopo' | 'sobraMoldura' | 'paredeDaCacapa'>): ObstaculosDaMesa {
  return {
    semiX: mesa.comprimento / 2,
    semiZ: mesa.largura / 2,
    larguraBorracha: mesa.larguraTabela,
    larguraMoldura: larguraDaMoldura(mesa, desenho),
    alturaBorracha: mesa.alturaTabela + desenho.chanfroTopo,
    alturaMoldura: mesa.alturaTabela + desenho.sobraMoldura,
    vaos: cacapas(mesa).map((c) => ({
      bx: c.boca.x,
      bz: c.boca.z,
      ex: c.eixo.x,
      ez: c.eixo.z,
      raio: c.queda.raio,
      profundidade: c.fundo + c.raio,
      cx: c.queda.centro.x,
      cz: c.queda.centro.z,
    })),
  };
}

/** Passo (m) com que a faixa da tabela e da moldura é percorrida, procurando onde o taco passa a ficar sobre madeira ou borracha. */
const PASSO_NO_VAO = 0.002;

const LIMITE_DE_BOLAS = 16;
/** 2^-22 de uma faixa de ~1,3 rad: bem abaixo do que se enxerga. */
const PASSOS_DA_BUSCA = 22;
/** Diferença (rad) abaixo da qual a elevação desenhada já é o alvo. */
const IGUAL = 1e-6;

/**
 * A elevação visual do taco: a mínima que o põe por cima da tabela, da moldura e das outras bolas, com o taco girando em torno
 * do ponto onde toca o bolão (a ponta recua com o recuo). É só desenho: a física segue com `elevacao: 0` e o que o jogador deu.
 *
 * - `alvo` é a conta (menor elevação sem atravessar nada, entre `minima` e `maxima`); só é refeita quando a mira, o efeito, o
 *   recuo, o bolão ou as outras bolas mudam;
 * - `atual` é o que se desenha: vai ao alvo com `taxaSubida`/`taxaDescida`, sem alocar.
 *
 * O taco é um cone de `comprimento` m (raio `raioPonta` na ponta e `raioBase` na outra ponta) para trás da ponta, subindo.
 * A borracha e a moldura contam como uma parede em volta da área de jogo, aberta nas caçapas: onde o eixo do taco passa pela
 * garganta ou pelo buraco (com a folga da largura do próprio taco ali) não há o que atravessar, e quem manda é o primeiro ponto
 * em que ele passa a ficar sobre a borracha ou a madeira.
 */
export class ElevacaoDoTaco {
  /** A elevação a desenhar agora (rad). */
  atual: number;
  /** A menor elevação sem atravessar nada, na última conta (rad). */
  alvo: number;
  /** Quantas vezes a conta foi refeita (para o gancho de teste e a prova de que não roda todo quadro). */
  calculos = 0;

  private readonly bolasX = new Float64Array(LIMITE_DE_BOLAS);
  private readonly bolasZ = new Float64Array(LIMITE_DE_BOLAS);
  private quantasBolas = 0;
  private mesaVista: EstadoMesa | null = null;
  private versaoDasBolas = 0;
  private versaoCalculada = -1;
  private angulo = NaN;
  private lateral = NaN;
  private vertical = NaN;
  private recuo = NaN;
  private x = NaN;
  private z = NaN;
  private saltar = true;

  constructor(
    private readonly obstaculos: ObstaculosDaMesa,
    private readonly taco: MedidasTaco,
    /** Raio do bolão (m). */
    private readonly raioBolao: number,
    /** Raio das outras bolas (m). */
    private readonly raioBola: number,
    private readonly cfg: ConfigElevacaoDoTaco,
  ) {
    this.atual = cfg.minima;
    this.alvo = cfg.minima;
  }

  /**
   * As outras bolas da mesa (o bolão não conta). Chame todo quadro com o estado atual: com o mesmo objeto de antes não faz
   * nada; com outro, copia as posições e a próxima conta é refeita.
   */
  definirBolas(mesa: EstadoMesa): void {
    if (mesa === this.mesaVista) return;
    this.mesaVista = mesa;
    this.versaoDasBolas++;
    let n = 0;
    for (const b of mesa.bolas) {
      if (b.id === ID_BOLAO || !b.naMesa || n === LIMITE_DE_BOLAS) continue;
      this.bolasX[n] = b.posicao.x;
      this.bolasZ[n] = b.posicao.z;
      n++;
    }
    this.quantasBolas = n;
  }

  /** A próxima `atualizar` desenha o alvo de uma vez, sem deslizar de onde estava (partida nova, vez de outro taco). */
  reiniciar(): void {
    this.saltar = true;
  }

  /**
   * Uma vez por quadro enquanto o taco mira. `lateral` e `vertical` são o efeito (fração do raio), `recuo` a distância da
   * ponta à superfície da bola e (`x`, `z`) o centro do bolão. Devolve a elevação a desenhar.
   */
  atualizar(dt: number, angulo: number, lateral: number, vertical: number, recuo: number, x: number, z: number): number {
    if (
      this.versaoCalculada !== this.versaoDasBolas ||
      angulo !== this.angulo ||
      lateral !== this.lateral ||
      vertical !== this.vertical ||
      recuo !== this.recuo ||
      x !== this.x ||
      z !== this.z
    ) {
      this.versaoCalculada = this.versaoDasBolas;
      this.angulo = angulo;
      this.lateral = lateral;
      this.vertical = vertical;
      this.recuo = recuo;
      this.x = x;
      this.z = z;
      this.alvo = this.menorElevacaoLivre(angulo, lateral, vertical, recuo, x, z);
      this.calculos++;
    }
    const diferenca = this.alvo - this.atual;
    if (this.saltar || Math.abs(diferenca) < IGUAL) {
      this.atual = this.alvo;
      this.saltar = false;
    } else {
      const taxa = diferenca > 0 ? this.cfg.taxaSubida : this.cfg.taxaDescida;
      this.atual += diferenca * (1 - Math.exp(-taxa * Math.max(dt, 0)));
    }
    return this.atual;
  }

  /**
   * A menor elevação em [`minima`, `maxima`] com o taco livre de tudo. A busca binária parte de uma ponta livre, então o
   * resultado nunca atravessa nada (se nem `maxima` livra, devolve `maxima`).
   */
  private menorElevacaoLivre(angulo: number, lateral: number, vertical: number, recuo: number, cx: number, cz: number): number {
    const { minima, maxima } = this.cfg;
    const R = this.raioBolao;
    const ca = Math.cos(angulo);
    const sa = Math.sin(angulo);
    // O taco gira em torno do ponto de contato: (centro + efeito) e a ponta fica a `t0` dele, para trás.
    const px = cx - sa * lateral * R;
    const py = R + vertical * R;
    const pz = cz + ca * lateral * R;
    const t0 = R * Math.sqrt(Math.max(1 - lateral * lateral - vertical * vertical, 0)) + recuo;
    if (this.livre(minima, ca, sa, px, py, pz, t0)) return minima;
    if (!this.livre(maxima, ca, sa, px, py, pz, t0)) return maxima;
    let baixo = minima;
    let alto = maxima;
    for (let i = 0; i < PASSOS_DA_BUSCA; i++) {
      const meio = (baixo + alto) / 2;
      if (this.livre(meio, ca, sa, px, py, pz, t0)) alto = meio;
      else baixo = meio;
    }
    return alto;
  }

  /** O taco com elevação `e` (pivô em (`px`,`py`,`pz`), direção `ca`/`sa` no plano, ponta a `t0` do pivô) passa por tudo? */
  private livre(e: number, ca: number, sa: number, px: number, py: number, pz: number, t0: number): boolean {
    const { taco, cfg } = this;
    const ce = Math.cos(e);
    const se = Math.sin(e);
    const comprimento = taco.comprimento;
    const afunilamento = (taco.raioBase - taco.raioPonta) / comprimento;
    // Eixo do taco a `q` do pivô, para trás e para cima: (px − ca·ce·q, py + se·q, pz − sa·ce·q); raio ali: raioPonta + afunilamento·(q − t0).
    const vx = -ca * ce;
    const vz = -sa * ce;

    // Tabela e moldura: o fundo do taco, onde o eixo cruza a borda da borracha e a da moldura, tem de estar acima delas
    // (o taco só sobe, então são esses os dois pontos que mandam).
    const o = this.obstaculos;
    if (!this.passaPorCima(px, py, pz, vx, vz, se, ce, t0, afunilamento, 0, o.larguraBorracha, o.alturaBorracha + cfg.folga)) return false;
    if (!this.passaPorCima(px, py, pz, vx, vz, se, ce, t0, afunilamento, o.larguraBorracha, o.larguraMoldura, o.alturaMoldura + cfg.folga)) return false;

    // Outras bolas: o ponto do eixo mais perto do centro delas tem de ficar a mais que os dois raios (e a folga).
    const raioBola = this.raioBola;
    for (let i = 0; i < this.quantasBolas; i++) {
      const wx = this.bolasX[i]! - px;
      const wy = raioBola - py;
      const wz = this.bolasZ[i]! - pz;
      // O eixo anda na direção (vx, se, vz), de comprimento 1; o ponto mais perto do centro, preso ao pedaço que existe do taco.
      const proj = wx * vx + wy * se + wz * vz;
      const q = Math.min(Math.max(proj, t0), t0 + comprimento);
      const dx = wx - vx * q;
      const dy = wy - se * q;
      const dz = wz - vz * q;
      const minimo = raioBola + taco.raioPonta + afunilamento * (q - t0) + cfg.folga;
      if (dx * dx + dy * dy + dz * dz < minimo * minimo) return false;
    }
    return true;
  }

  /**
   * A faixa de `largura` m que começa `fora` m além do nariz da tabela: onde o taco entra nela (o eixo chega à borda de dentro, ou a
   * ponta, se já está dentro), o fundo dele está acima de `altura`? O taco só sobe, então a entrada é o ponto que manda. Se o
   * taco acaba antes da faixa, ou só começa depois dela, nada a conferir.
   */
  private passaPorCima(
    px: number,
    py: number,
    pz: number,
    vx: number,
    vz: number,
    se: number,
    ce: number,
    t0: number,
    afunilamento: number,
    fora: number,
    largura: number,
    altura: number,
  ): boolean {
    const o = this.obstaculos;
    const entra = Math.max(Math.min(this.qAteALinha(px, vx, o.semiX + fora), this.qAteALinha(pz, vz, o.semiZ + fora)), t0);
    const sai = Math.min(this.qAteALinha(px, vx, o.semiX + fora + largura), this.qAteALinha(pz, vz, o.semiZ + fora + largura));
    const limite = Math.min(sai, t0 + this.taco.comprimento);
    if (entra >= limite) return true;
    // Anda pela faixa enquanto o eixo está no vão de uma caçapa: o primeiro ponto fora dele é onde o taco passa a ficar sobre a
    // borracha (ou a madeira), e como o taco só sobe, é esse que manda.
    let q = entra;
    while (q < limite && this.noVaoDeCacapa(px, pz, vx, vz, q, t0, afunilamento)) q += PASSO_NO_VAO;
    if (q >= limite) return true;
    const fundo = py + se * q - (this.taco.raioPonta + afunilamento * (q - t0)) / ce;
    return fundo >= altura;
  }

  /**
   * O eixo do taco, a `q` do pivô, está dentro do vão de alguma caçapa com folga para a largura do cone ali? (a garganta: até
   * `raio` de cada lado do eixo da boca, da boca ao centro do círculo; ou o círculo de queda inteiro).
   */
  private noVaoDeCacapa(px: number, pz: number, vx: number, vz: number, q: number, t0: number, afunilamento: number): boolean {
    const x = px + vx * q;
    const z = pz + vz * q;
    const folga = this.taco.raioPonta + afunilamento * (q - t0) + this.cfg.folga;
    for (const v of this.obstaculos.vaos) {
      const dx = x - v.bx;
      const dz = z - v.bz;
      const s = dx * v.ex + dz * v.ez;
      const t = -dx * v.ez + dz * v.ex;
      if (s >= 0 && s <= v.profundidade && Math.abs(t) < v.raio - folga) return true;
      const rx = x - v.cx;
      const rz = z - v.cz;
      if (Math.hypot(rx, rz) < v.raio - folga) return true;
    }
    return false;
  }

  /** `q` em que a coordenada `p0 + v·q` chega a |·| = `limite`, andando; 0 se já está além, infinito se nunca chega. */
  private qAteALinha(p0: number, v: number, limite: number): number {
    if (Math.abs(p0) >= limite) return 0;
    if (v === 0) return Infinity;
    return ((v > 0 ? limite : -limite) - p0) / v;
  }
}
