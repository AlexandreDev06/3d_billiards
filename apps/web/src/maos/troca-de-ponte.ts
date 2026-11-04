import type { Quadro } from '@sinuca/personagens';
import type { NomeDaPonte } from './pontes';
import { poseVaziaDeMao, type PoseDeMao } from './pose-das-maos';

const limitar = (v: number): number => Math.min(Math.max(v, 0), 1);
const suave = (t: number): number => t * t * (3 - 2 * t);

/** Um ponto do caminho que a mão faz para sair da ponte (L65b): quanto da pose aberta já vale (0 a 1) e o afastamento (m) no referencial da pose. */
export type PassoDaRota = readonly [abertura: number, lado: number, subida: number, recuo: number];

/** Como a mão troca de ponte: passa pela pose aberta, com a duração, os instantes da virada e a rota de cada ponte. */
export interface ConfigDaTroca {
  readonly duracaoS: number;
  readonly permanenciaS: number;
  /** A pose do arquivo em que a mão passa de uma ponte à outra: os dedos abertos, que não tocam o taco. */
  readonly aberta: string;
  /** Até que fração da troca a mão sai da ponte antiga, e a partir de que fração chega à nova (no meio, aberta, ela troca de lugar). */
  readonly saidaAte: number;
  readonly chegadaDe: number;
  /** Da pose de repouso da ponte (primeiro passo, tudo zero) à mão aberta num lugar livre do taco (último passo, abertura 1). */
  readonly rotas: Readonly<Record<NomeDaPonte, readonly PassoDaRota[]>>;
}

export type FaseDaTroca = 'saida' | 'viagem' | 'chegada';

/** O ponto da rota em `tau` (0 a 1), os passos a tempos iguais, reta entre eles. */
function pontoDaRota(rota: readonly PassoDaRota[], tau: number, saida: Float64Array): void {
  const n = rota.length - 1;
  const x = limitar(tau) * n;
  const i = Math.min(Math.floor(x), n - 1);
  const f = x - i;
  const a = rota[i]!;
  const b = rota[i + 1]!;
  for (let k = 0; k < 4; k++) saida[k] = a[k]! + (b[k]! - a[k]!) * f;
}

/**
 * A troca de uma ponte por outra (L65b): a mão não desliza pelo taco nem mistura um anel de dedos com outro (a pele atravessaria o
 * taco no meio do caminho). Ela sai da ponte antiga (afasta-se do taco e abre os dedos até a pose aberta, que não toca nele), troca
 * de lugar com a mão aberta e chega à nova (fecha os dedos e vem ao taco). Só conta o tempo: guarda as duas pontes e a pose de onde
 * saiu (congelada, no quadro daquela ponte) e diz, a cada quadro, em que fase está, quanto a pose aberta vale (`abertura`), quanto
 * o quadro da mão já foi do de saída ao de chegada (`viagem`) e quanto cada um dos dois está afastado do taco. Quem desenha
 * mistura com isso. Nada aloca.
 */
export class TrocaDePonte {
  /** 0 = acabou de começar, 1 = pousou (ou nunca houve troca). */
  progresso = 1;
  /** A ponte de onde a mão saiu e a para onde vai. */
  de: NomeDaPonte = 'v';
  para: NomeDaPonte = 'v';
  /** A pose da mão quando a troca começou, no quadro da ponte `de`. */
  readonly pose: PoseDeMao = poseVaziaDeMao();
  /** Saindo, trocando de lugar ou chegando. */
  fase: FaseDaTroca = 'chegada';
  /** Quanto a pose aberta vale (0 a 1) na mistura dos dedos: na saída é a mistura de `de`, na chegada a de `para`. */
  abertura = 0;
  /** 0 = o quadro da mão é o da ponte `de`, 1 = o da `para`. */
  viagem = 1;
  /** Quanto a mão de cada ponte está afastada do lugar dela (m): de lado, para cima e para trás, no referencial da pose dessa ponte. */
  readonly afastaDe = new Float64Array(3);
  readonly afastaPara = new Float64Array(3);
  private duracao = 0;
  private readonly ponto = new Float64Array(4);

  /** Sem `cfg` (os testes de quem só conta o tempo) a troca não passa pela pose aberta: só a viagem anda. */
  constructor(private readonly cfg: ConfigDaTroca | null = null) {}

  /** Quanto dura a troca que começou por último (s). */
  get duracaoS(): number {
    return this.duracao;
  }

  /** Há troca em curso. */
  get ativa(): boolean {
    return this.progresso < 1;
  }

  /** Começa uma troca de `de` (cuja pose, agora, é `pose`) para `para`, em `duracaoS`. Duração 0 não faz troca. */
  iniciar(de: NomeDaPonte, para: NomeDaPonte, pose: PoseDeMao, duracaoS: number): void {
    this.de = de;
    this.para = para;
    Object.assign(this.pose, pose);
    this.duracao = duracaoS;
    this.progresso = duracaoS > 0 ? 0 : 1;
    this.calcular();
  }

  atualizar(dt: number): void {
    if (this.progresso >= 1) return;
    this.progresso = limitar(this.progresso + Math.max(dt, 0) / this.duracao);
    // Quadros de 1/60 s somados não fecham o 1 exato (15 quadros de 0,25 s dão 0,9999999999999998): sem isto a troca levaria um quadro a mais.
    if (this.progresso > 1 - 1e-9) this.progresso = 1;
    this.calcular();
  }

  /** Para a troca já: a mão fica onde a ponte nova a pôs. */
  cancelar(): void {
    this.progresso = 1;
    this.calcular();
  }

  private calcular(): void {
    const p = this.progresso;
    const cfg = this.cfg;
    if (cfg === null) {
      this.fase = p >= 1 ? 'chegada' : 'saida';
      this.abertura = 0;
      this.viagem = suave(p);
      this.afastaDe.fill(0);
      this.afastaPara.fill(0);
      return;
    }
    const a = cfg.saidaAte;
    const b = cfg.chegadaDe;
    const rotaDe = cfg.rotas[this.de];
    const rotaPara = cfg.rotas[this.para];
    const v = this.ponto;
    // O fim de cada rota: a mão aberta, longe do taco, onde as duas se encontram.
    const fimDe = rotaDe[rotaDe.length - 1]!;
    const fimPara = rotaPara[rotaPara.length - 1]!;
    this.afastaDe[0] = fimDe[1]!;
    this.afastaDe[1] = fimDe[2]!;
    this.afastaDe[2] = fimDe[3]!;
    this.afastaPara[0] = fimPara[1]!;
    this.afastaPara[1] = fimPara[2]!;
    this.afastaPara[2] = fimPara[3]!;
    if (p < a) {
      this.fase = 'saida';
      this.viagem = 0;
      pontoDaRota(rotaDe, suave(p / a), v);
      this.abertura = v[0]!;
      this.afastaDe[0] = v[1]!;
      this.afastaDe[1] = v[2]!;
      this.afastaDe[2] = v[3]!;
    } else if (p < b) {
      this.fase = 'viagem';
      this.abertura = 1;
      this.viagem = suave((p - a) / (b - a));
    } else {
      this.fase = 'chegada';
      this.viagem = 1;
      pontoDaRota(rotaPara, 1 - suave((p - b) / (1 - b)), v);
      this.abertura = v[0]!;
      this.afastaPara[0] = v[1]!;
      this.afastaPara[1] = v[2]!;
      this.afastaPara[2] = v[3]!;
    }
  }
}

/**
 * Afasta `quadro` (o quadro da mão numa pose) de `afasta` (lado, subida, recuo; m), no referencial da `pose`: o lado é `-w` (com
 * `w = d × u`), a subida é `u` e o recuo é `-d`. `escala` é a presença da mão (0 a 1).
 */
export function afastarQuadro(quadro: Quadro, pose: PoseDeMao, afasta: ArrayLike<number>, escala: number): Quadro {
  const wx = pose.dy * pose.uz - pose.dz * pose.uy;
  const wy = pose.dz * pose.ux - pose.dx * pose.uz;
  const wz = pose.dx * pose.uy - pose.dy * pose.ux;
  const lado = afasta[0]! * escala;
  const subida = afasta[1]! * escala;
  const recuo = afasta[2]! * escala;
  quadro.px += -wx * lado + pose.ux * subida - pose.dx * recuo;
  quadro.py += -wy * lado + pose.uy * subida - pose.dy * recuo;
  quadro.pz += -wz * lado + pose.uz * subida - pose.dz * recuo;
  return quadro;
}
