import type { Cinematica, Corrente } from '@sinuca/personagens';
import type { MaoCalibrada } from './mao-calibrada';
import type { PoseDeMao } from './pose-das-maos';

/** Os dedos longos da mão (o polegar fica de fora: ele faz o V da ponte). */
const DEDOS = ['indicador', 'medio', 'anelar', 'minimo'] as const;

/** A altura (m) do que sustenta uma mão no ponto (`x`, `z`) da mesa; `-Infinity` onde não há nada. */
export type ApoioDosDedos = (x: number, z: number) => number;

const ITERACOES = 9;

/** Os pontos em volta do centro da ponta, em frações do raio, onde se procura o apoio mais alto: a ponta repousa no que a cobre. */
const PEGADA_DA_PONTA: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Faz as pontas dos quatro dedos longos da ponte pousarem no que há embaixo delas (L27): o pano, a borracha ou a moldura, sem
 * deformar a mão: cada dedo só ganha uma dobra a mais (ou a menos), em partes iguais nas três juntas, sobre a pose `ponte_v` do
 * arquivo. Cada dedo tem um parâmetro `t` de -1 (o mais esticado que a mão alcança) a 1 (o mais dobrado), com 0 = a pose do
 * arquivo; o alvo é o `t` em que o ponto mais baixo da ponta toca o apoio sob ela (o mais alto debaixo da ponta, não só o do
 * centro), achado por bissecção (a ponta só desce quando `t` cresce). Onde não alcança, o dedo fica no extremo; onde não há apoio,
 * fica na pose do arquivo. O `t` que se mostra anda até o alvo em vez de saltar. Nada aloca.
 */
export class PlantadorDeDedos {
  /** O `t` de cada dedo agora, na ordem indicador, médio, anelar e mínimo. */
  readonly t = new Float32Array(DEDOS.length);
  private readonly correntes: Corrente[];
  private readonly cinematica: Cinematica;
  private readonly ponta = { x: 0, y: 0, z: 0 };
  private readonly local = { x: 0, y: 0, z: 0 };
  private primeira = true;

  constructor(
    private readonly mao: MaoCalibrada,
    /** A pose do arquivo em que os dedos estão. */
    pose: string,
    /** Quanto o dedo dobra a mais ou a menos em `t` = 1 ou -1 (rad). */
    private readonly alcance: number,
    /** O teto de `subidaNecessaria` (m). */
    private readonly subidaMaxima: number,
  ) {
    this.correntes = DEDOS.map((nome) => {
      const c = mao.modelo.correntes.get(nome);
      if (c === undefined) throw new Error(`a mão não tem o dedo "${nome}"`);
      return c;
    });
    this.cinematica = mao.cinematica(pose);
  }

  /** A dobra a mais de cada dedo agora (rad, a que se manda ao desenho; positiva fecha). */
  dobra(i: number): number {
    return this.t[i]! * this.alcance;
  }

  get quantos(): number {
    return DEDOS.length;
  }

  /** O próximo quadro põe os dedos no apoio de uma vez, sem andar do que eram (mão nova, vez nova). */
  reiniciar(): void {
    this.primeira = true;
  }

  /**
   * Quanto a mão em `pose` precisa subir (m, de 0 ao teto) para que nenhuma ponta afunde, mesmo com o dedo no ponto mais esticado que
   * alcança: a tabela ao lado do dedo pede mais do que ele sobe sozinho. Quem escolhe o lugar da mão soma isto à altura dela.
   */
  subidaNecessaria(pose: PoseDeMao, apoio: ApoioDosDedos): number {
    let falta = 0;
    for (let i = 0; i < DEDOS.length; i++) {
      const folga = this.folga(i, -1, pose, apoio);
      if (folga < 0) falta = Math.max(falta, -folga);
    }
    return Math.min(falta, this.subidaMaxima);
  }

  /** Anda o `t` de cada dedo para o apoio sob a mão em `pose`; depois disso `dobra(i)` diz o quanto cada dedo dobra a mais. */
  plantar(dt: number, taxa: number, pose: PoseDeMao, apoio: ApoioDosDedos): void {
    const passo = 1 - Math.exp(-taxa * Math.max(dt, 0));
    for (let i = 0; i < DEDOS.length; i++) {
      const alvo = this.alvoDoDedo(i, pose, apoio);
      this.t[i] = this.primeira ? alvo : this.t[i]! + (alvo - this.t[i]!) * passo;
    }
    this.primeira = false;
  }

  /**
   * A folga (m) entre o ponto mais baixo da ponta do dedo `i` no `t` dado e o apoio sob ela: positiva flutua, negativa afunda; sem
   * apoio nenhum, infinita.
   */
  private folga(i: number, t: number, pose: PoseDeMao, apoio: ApoioDosDedos): number {
    const corrente = this.correntes[i]!;
    const p = this.cinematica.pontaDaCorrente(corrente, t * this.alcance, this.ponta);
    const l = this.mao.local(p.x, p.y, p.z, this.local);
    // o quadro da mão: x = d, y = u, z = d × u
    const wx = pose.dy * pose.uz - pose.dz * pose.uy;
    const wy = pose.dz * pose.ux - pose.dx * pose.uz;
    const wz = pose.dx * pose.uy - pose.dy * pose.ux;
    const x = pose.x + l.x * pose.dx + l.y * pose.ux + l.z * wx;
    const y = pose.y + l.x * pose.dy + l.y * pose.uy + l.z * wy;
    const z = pose.z + l.x * pose.dz + l.y * pose.uz + l.z * wz;
    const raio = corrente.raioDaPonta * this.mao.escala;
    let chao = -Infinity;
    for (const [a, b] of PEGADA_DA_PONTA) chao = Math.max(chao, apoio(x + a * raio, z + b * raio));
    return chao === -Infinity ? Infinity : y - raio - chao;
  }

  private alvoDoDedo(i: number, pose: PoseDeMao, apoio: ApoioDosDedos): number {
    if (this.folga(i, 0, pose, apoio) === Infinity) return 0;
    if (this.folga(i, -1, pose, apoio) <= 0) return -1;
    if (this.folga(i, 1, pose, apoio) >= 0) return 1;
    // `a` flutua e `b` toca ou afunda; onde o apoio dá um degrau, fica o lado que flutua (nunca dentro da borracha).
    let a = -1;
    let b = 1;
    for (let n = 0; n < ITERACOES; n++) {
      const meio = (a + b) / 2;
      if (this.folga(i, meio, pose, apoio) > 0) a = meio;
      else b = meio;
    }
    return a;
  }
}

/** Os nomes das correntes dos dedos que o plantador mexe, na ordem de `t`. */
export const NOMES_DOS_DEDOS_PLANTADOS: readonly string[] = DEDOS;
