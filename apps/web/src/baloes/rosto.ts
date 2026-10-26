import { BOLA, BOLAO, ID_BOLAO, cacapas, pontasTabela, type Cacapa, type Gravacao, type MedidasMesa, type PontaTabela } from '@sinuca/fisica';
import type { ConfigBaloes } from '../config';

/** A cara do balão de quem joga, segundo o que acontece na mesa. */
export type Rosto = 'neutro' | 'sorriso' | 'susto' | 'bravo';

/** Todas as caras que o desenho sabe fazer: as de quem joga e a de quem perdeu, no fim da partida. */
export type CaraDoBalao = Rosto | 'triste';

/** A ordem das caras na imagem que o desenho monta (uma por quadro). */
export const CARAS_DO_BALAO: readonly CaraDoBalao[] = ['neutro', 'sorriso', 'susto', 'bravo', 'triste'];

/** Um instante da gravação em que o rosto muda, e por quanto tempo vale. */
export interface MomentoDoRosto {
  /** Segundos desde o impacto do taco. */
  readonly t: number;
  readonly rosto: Exclude<Rosto, 'neutro'>;
  readonly duracao: number;
}

/** Quantos quadros para trás vale conferir se a bola chegou andando à zona do susto (não parada nela). */
const QUADROS_DE_CHEGADA = 6;
/** O quanto ela tem de ter andado nesses quadros (m). */
const CHEGADA_MINIMA = 0.04;
/** Uma bola que bate perto da boca e cai logo depois não assustou: sorriso (ou bravo) vem a seguir. */
const QUEDA_LOGO_DEPOIS_S = 1;

const contato = { x: 0, z: 0 };

/**
 * Onde a bola `i` estava no instante `t` do choque: o último quadro antes dele andando mais o que o passo anterior dizia para a
 * fração que falta (o choque entorta o caminho, então a conta usa o lado de antes). Vai para `saida`.
 */
function ondeBateu(g: Gravacao, i: number, t: number, saida: { x: number; z: number }): void {
  const n = g.ids.length;
  const posicaoDoQuadro = t * g.frequencia;
  const q = Math.min(Math.max(Math.floor(posicaoDoQuadro), 0), g.quadros - 1);
  const x = g.posicoes[(q * n + i) * 3]!;
  const z = g.posicoes[(q * n + i) * 3 + 2]!;
  if (q === 0) {
    saida.x = x;
    saida.z = z;
    return;
  }
  const f = posicaoDoQuadro - q;
  saida.x = x + (x - g.posicoes[((q - 1) * n + i) * 3]!) * f;
  saida.z = z + (z - g.posicoes[((q - 1) * n + i) * 3 + 2]!) * f;
}

/** A distância do ponto (`x`, `z`) ao segmento de `a` a `b`. */
function distanciaAoSegmento(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const k = Math.min(Math.max(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0), 1);
  return Math.hypot(x - (a.x + dx * k), z - (a.z + dz * k));
}

/**
 * A bola `i` bateu, no instante `t`, na ponta arredondada ou na face de alguma das `pontas` (as da tabela do evento): o centro dela
 * a `raioDaBola` do arco ou da face, com `folga` de erro (m). Bater no nariz reto, longe da quina, não conta.
 */
function batidaNaQuina(g: Gravacao, i: number, t: number, pontas: readonly PontaTabela[], raioDaBola: number, folga: number, saida: { x: number; z: number }): boolean {
  ondeBateu(g, i, t, saida);
  for (const p of pontas) {
    if (Math.abs(Math.hypot(saida.x - p.centro.x, saida.z - p.centro.z) - (p.raio + raioDaBola)) <= folga) return true;
    if (Math.abs(distanciaAoSegmento(saida.x, saida.z, p.naFace, p.fimDaFace) - raioDaBola) <= folga) return true;
  }
  return false;
}

/**
 * Os momentos de rosto de uma tacada, lidos só da gravação:
 *
 * - `sorriso`: uma bola numerada caiu numa caçapa;
 * - `bravo`: o bolão caiu (a falta que a gravação já mostra; a falta de regra vem depois, pela `RostoDoBalao`);
 * - `susto`: uma bola chegou andando à zona de uma caçapa, a menos de `margemDoSusto` do círculo de queda (ela passou perto ou
 *   parou na garganta), ou bateu na quina da caçapa (na ponta arredondada da tabela ou na face que guia para dentro, e não no
 *   nariz reto), e não caiu logo depois. Dois sustos a menos de `juntarSustosS` contam como um.
 *
 * Em ordem de `t`.
 */
export function momentosDaGravacao(gravacao: Gravacao, mesa: MedidasMesa, cfg: ConfigBaloes['rosto']): MomentoDoRosto[] {
  const momentos: MomentoDoRosto[] = [];
  const { ids, eventos, frequencia } = gravacao;
  const bocas = cacapas(mesa);
  const caiu = (bola: number, depoisDe: number, ateT: number, cacapa?: string): boolean =>
    eventos.some((e) => e.tipo === 'cacapa' && e.bola === bola && e.t >= depoisDe && e.t <= ateT && (cacapa === undefined || e.cacapa === cacapa));

  for (const e of eventos) {
    if (e.tipo !== 'cacapa') continue;
    if (e.bola === ID_BOLAO) momentos.push({ t: e.t, rosto: 'bravo', duracao: cfg.bravoS });
    else momentos.push({ t: e.t, rosto: 'sorriso', duracao: cfg.sorrisoS });
  }

  const sustos: number[] = [];
  const n = ids.length;
  const indice = new Map<number, number>(ids.map((id, i) => [id, i]));

  // A bola bateu na quina da caçapa (a ponta arredondada ou a face), não no nariz reto da tabela.
  const pontas = pontasTabela(mesa);
  for (const e of eventos) {
    if (e.tipo !== 'bola-tabela' || e.velocidade < cfg.velocidadeMinimaDoSusto) continue;
    const i = indice.get(e.bola);
    if (i === undefined) continue;
    const raioDaBola = e.bola === ID_BOLAO ? BOLAO.raio : BOLA.raio;
    if (!batidaNaQuina(gravacao, i, e.t, pontas.filter((p) => p.tabela === e.tabela), raioDaBola, cfg.folgaDaQuina, contato)) continue;
    if (!caiu(e.bola, e.t, e.t + QUEDA_LOGO_DEPOIS_S)) sustos.push(e.t);
  }

  // A bola chegou andando perto do círculo de queda e não caiu nele.
  const naZona: boolean[] = new Array(bocas.length * n).fill(false);
  for (let q = 0; q < gravacao.quadros; q++) {
    for (let i = 0; i < n; i++) {
      if (gravacao.naMesa[q * n + i] === 0) continue;
      const x = gravacao.posicoes[(q * n + i) * 3]!;
      const z = gravacao.posicoes[(q * n + i) * 3 + 2]!;
      for (let c = 0; c < bocas.length; c++) {
        const boca: Cacapa = bocas[c]!;
        const dentro = Math.hypot(boca.queda.centro.x - x, boca.queda.centro.z - z) < boca.queda.raio + cfg.margemDoSusto;
        const antes = naZona[c * n + i]!;
        naZona[c * n + i] = dentro;
        if (!dentro || antes) continue;
        const t = q / frequencia;
        if (q >= QUADROS_DE_CHEGADA) {
          const p = ((q - QUADROS_DE_CHEGADA) * n + i) * 3;
          const andou = Math.hypot(gravacao.posicoes[p]! - x, gravacao.posicoes[p + 2]! - z);
          if (andou < CHEGADA_MINIMA) continue;
        }
        if (!caiu(ids[i]!, t, Infinity, boca.id)) sustos.push(t);
      }
    }
  }

  sustos.sort((a, b) => a - b);
  let ultimo = -Infinity;
  for (const t of sustos) {
    if (t - ultimo < cfg.juntarSustosS) continue;
    ultimo = t;
    momentos.push({ t, rosto: 'susto', duracao: cfg.sustoS });
  }
  return momentos.sort((a, b) => a.t - b.t);
}

/** Quando dois momentos valem ao mesmo tempo, o de maior peso fica: a falta e o sorriso passam à frente do susto. */
const PESO: Readonly<Record<Exclude<Rosto, 'neutro'>, number>> = { susto: 1, sorriso: 2, bravo: 3 };

/**
 * O rosto no instante `t` (s desde o impacto): o do momento que ainda vale, ou `neutro`. Com dois valendo, o de maior peso
 * (bravo, sorriso, susto); com o mesmo peso, o que começou depois.
 */
export function rostoNoTempo(momentos: readonly MomentoDoRosto[], t: number): Rosto {
  let rosto: Rosto = 'neutro';
  let peso = 0;
  for (const m of momentos) {
    if (m.t > t) break;
    if (t >= m.t + m.duracao) continue;
    if (PESO[m.rosto] >= peso) {
      rosto = m.rosto;
      peso = PESO[m.rosto];
    }
  }
  return rosto;
}

/**
 * O rosto de quem joga, ao longo da vez: segue a gravação que toca e, quando ela acaba, o relógio dela continua até o último
 * rosto passar. Uma falta de regra (que só se sabe com a tacada concluída) põe a cara de bravo por `bravoS`.
 */
export class RostoDoBalao {
  private momentos: readonly MomentoDoRosto[] = [];
  private ultimoT: number | null = null;
  private ultimoAgora = 0;
  private bravoDesde: number | null = null;

  constructor(private readonly cfg: ConfigBaloes['rosto']) {}

  /** Uma gravação nova vai tocar. */
  comecar(momentos: readonly MomentoDoRosto[]): void {
    this.momentos = momentos;
    this.ultimoT = null;
    this.bravoDesde = null;
  }

  /** A tacada foi concluída com falta de regra. */
  faltou(agoraS: number): void {
    this.bravoDesde = agoraS;
  }

  /** Vez nova ou partida nova: cara neutra. */
  reiniciar(): void {
    this.momentos = [];
    this.ultimoT = null;
    this.bravoDesde = null;
  }

  /**
   * `tempoDaGravacaoS`: o instante da gravação que toca, ou nulo se nenhuma toca. `agoraS`: o relógio da página. `velocidade`: a da
   * reprodução (1 = normal); depois que a gravação acaba, o relógio dela segue nessa velocidade até o último rosto passar.
   */
  rosto(tempoDaGravacaoS: number | null, agoraS: number, velocidade = 1): Rosto {
    if (this.bravoDesde !== null && agoraS - this.bravoDesde < this.cfg.bravoS) return 'bravo';
    if (tempoDaGravacaoS !== null) {
      this.ultimoT = tempoDaGravacaoS;
      this.ultimoAgora = agoraS;
      return rostoNoTempo(this.momentos, tempoDaGravacaoS);
    }
    if (this.ultimoT === null) return 'neutro';
    return rostoNoTempo(this.momentos, this.ultimoT + (agoraS - this.ultimoAgora) * velocidade);
  }
}
