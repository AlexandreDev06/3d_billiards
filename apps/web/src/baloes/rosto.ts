import { BOLA, BOLAO, ID_BOLAO, cacapas, pontasTabela, type Cacapa, type Gravacao, type MedidasMesa, type PontaTabela } from '@sinuca/fisica';
import type { ConfigBaloes } from '../config';

/**
 * A cara do balão de quem joga, segundo o que acontece na mesa: `sorriso` (encaçapou), `comemorando` (duas ou mais bolas numa
 * tacada), `susto` (a bola dele raspou a caçapa) e depois `desanimado` (e não caiu), `desconfiado` (a bola de quem joga contra ele
 * corre para uma caçapa: o suspense) e `ufa` (o alívio: ela raspou e não caiu), `bravo` (a falta) e, quando o outro errou e o balão
 * aparece, `rindo` e depois `convencido` (a provocação de boteco).
 */
export type Rosto = 'neutro' | 'sorriso' | 'comemorando' | 'susto' | 'desanimado' | 'desconfiado' | 'ufa' | 'bravo' | 'rindo' | 'convencido';

/** Todas as caras que o jogo pede ao balão: as da mesa, a de quem perdeu, e as do estado (mirando e esperando). */
export type CaraDoBalao = Rosto | 'triste' | 'concentrado' | 'tedio';

/** As caras que o balão procedural (a reserva sem arquivo) sabe desenhar. */
export type CaraNoAtlas = 'neutro' | 'sorriso' | 'susto' | 'bravo' | 'triste';

/** A ordem das caras na imagem que o desenho procedural monta (uma por quadro). */
export const CARAS_DO_BALAO: readonly CaraNoAtlas[] = ['neutro', 'sorriso', 'susto', 'bravo', 'triste'];

/** Qual das caras do procedural substitui cada cara nova (o balão do artista tem as dele; o procedural recua para a mais parecida). */
export const CARA_NO_ATLAS: Readonly<Record<CaraDoBalao, CaraNoAtlas>> = {
  neutro: 'neutro',
  sorriso: 'sorriso',
  comemorando: 'sorriso',
  susto: 'susto',
  desanimado: 'triste',
  desconfiado: 'neutro',
  ufa: 'neutro',
  bravo: 'bravo',
  rindo: 'sorriso',
  convencido: 'sorriso',
  triste: 'triste',
  concentrado: 'neutro',
  tedio: 'neutro',
};

/** O rosto que a gravação provoca (a mesa); a provocação (`rindo`, `convencido`) vem do jogo, não da gravação. */
export type RostoDaMesa = 'sorriso' | 'comemorando' | 'susto' | 'desanimado' | 'desconfiado' | 'ufa' | 'bravo';

/**
 * De quem é a bola da tacada que toca, em relação ao dono do balão: `dono` (a bola dele: ele se assusta e desanima) ou `contra` (a
 * de quem joga contra ele: ele desconfia enquanto ela corre para uma caçapa e se alivia se ela raspa e não cai).
 */
export type QuemTacou = 'dono' | 'contra';

/** Um instante da gravação em que o rosto muda, e por quanto tempo vale. */
export interface MomentoDoRosto {
  /** Segundos desde o impacto do taco. */
  readonly t: number;
  readonly rosto: RostoDaMesa;
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

interface JanelaDeSuspense {
  /** A bola (índice em `ids`). */
  readonly i: number;
  /** Quando ela passou a correr para uma caçapa (s). */
  readonly ini: number;
  /** Quando o resultado chegou: caiu ou parou (s). */
  readonly fim: number;
}

/**
 * Para cada bola, o trecho em que ela corre para uma caçapa e o resultado ainda não veio: do primeiro quadro em que anda depressa,
 * perto e no rumo de uma caçapa até ela cair ou parar (a gravação acaba quando tudo para). Uma janela por bola.
 */
function janelasDeSuspense(g: Gravacao, bocas: readonly Cacapa[], cfg: ConfigBaloes['rosto']): JanelaDeSuspense[] {
  const janelas: JanelaDeSuspense[] = [];
  const n = g.ids.length;
  const dt = 1 / g.frequencia;
  for (let i = 0; i < n; i++) {
    let ini = -1;
    let fim = g.duracao;
    for (let q = 0; q < g.quadros - 1; q++) {
      if (g.naMesa[q * n + i] === 0) break;
      const x = g.posicoes[(q * n + i) * 3]!;
      const z = g.posicoes[(q * n + i) * 3 + 2]!;
      const vx = (g.posicoes[((q + 1) * n + i) * 3]! - x) / dt;
      const vz = (g.posicoes[((q + 1) * n + i) * 3 + 2]! - z) / dt;
      const v = Math.hypot(vx, vz);
      if (ini < 0) {
        if (v >= cfg.desconfiadoVelocidadeMinima && correParaUmaCacapa(bocas, x, z, vx, vz, v, cfg)) ini = q * dt;
      } else if (v < cfg.desconfiadoParouAbaixoDe) {
        fim = q * dt;
        break;
      }
      if (ini >= 0 && g.naMesa[(q + 1) * n + i] === 0) {
        fim = (q + 1) * dt;
        break;
      }
    }
    if (ini < 0) continue;
    // a queda registrada vale mais que o quadro em que a bola some da mesa
    const queda = g.eventos.find((e) => e.tipo === 'cacapa' && e.bola === g.ids[i] && e.t >= ini);
    janelas.push({ i, ini, fim: queda === undefined ? fim : Math.min(fim, queda.t) });
  }
  return janelas;
}

function correParaUmaCacapa(bocas: readonly Cacapa[], x: number, z: number, vx: number, vz: number, v: number, cfg: ConfigBaloes['rosto']): boolean {
  for (const boca of bocas) {
    const rx = boca.queda.centro.x - x;
    const rz = boca.queda.centro.z - z;
    const d = Math.hypot(rx, rz);
    if (d <= cfg.desconfiadoAlcanceM && d > 1e-9 && (vx * rx + vz * rz) / (v * d) >= cfg.desconfiadoCosMinimo) return true;
  }
  return false;
}

/**
 * Os momentos de rosto de uma tacada, lidos só da gravação:
 *
 * - `sorriso`: uma bola numerada caiu numa caçapa;
 * - `comemorando`: duas ou mais bolas numeradas caíram na mesma tacada (vale a partir da queda da segunda);
 * - `bravo`: o bolão caiu (a falta que a gravação já mostra; a falta de regra vem depois, pela `RostoDoBalao`);
 * - **a raspada**: uma bola chegou andando à zona de uma caçapa, a menos de `margemDoSusto` do círculo de queda (ela passou perto ou
 *   parou na garganta), ou bateu na quina da caçapa (na ponta arredondada da tabela ou na face que guia para dentro, e não no
 *   nariz reto), e não caiu logo depois. Dois sustos a menos de `juntarSustosS` contam como um. O que o balão faz depende de quem
 *   tacou (`quemTacou`, padrão `dono`):
 *   - `dono`: `susto` e, quando ele passa (`sustoS` depois), `desanimado` (a bola dele não caiu). Sem `ufa`;
 *   - `contra`: nenhum susto. O `ufa`, o alívio, vem quando o suspense acaba;
 * - `desconfiado` (só `contra`): o suspense. Vale desde que uma bola corre para uma caçapa (andando a `desconfiadoVelocidadeMinima`,
 *   a menos de `desconfiadoAlcanceM` dela e no rumo dela dentro de `desconfiadoCosMinimo`) até o resultado: a bola cai, ou para, ou
 *   raspou e `sustoS` passou.
 *
 * Em ordem de `t`.
 */
export function momentosDaGravacao(gravacao: Gravacao, mesa: MedidasMesa, cfg: ConfigBaloes['rosto'], quemTacou: QuemTacou = 'dono'): MomentoDoRosto[] {
  const momentos: MomentoDoRosto[] = [];
  const { ids, eventos, frequencia } = gravacao;
  const bocas = cacapas(mesa);
  const caiu = (bola: number, depoisDe: number, ateT: number, cacapa?: string): boolean =>
    eventos.some((e) => e.tipo === 'cacapa' && e.bola === bola && e.t >= depoisDe && e.t <= ateT && (cacapa === undefined || e.cacapa === cacapa));

  let numeradas = 0;
  for (const e of eventos) {
    if (e.tipo !== 'cacapa') continue;
    if (e.bola === ID_BOLAO) momentos.push({ t: e.t, rosto: 'bravo', duracao: cfg.bravoS });
    else {
      momentos.push({ t: e.t, rosto: 'sorriso', duracao: cfg.sorrisoS });
      numeradas++;
      // a segunda bola e as seguintes: a comemoração recomeça a cada queda a partir da segunda
      if (numeradas >= 2) momentos.push({ t: e.t, rosto: 'comemorando', duracao: cfg.comemorandoS });
    }
  }

  const sustos: { t: number; i: number }[] = [];
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
    if (!caiu(e.bola, e.t, e.t + QUEDA_LOGO_DEPOIS_S)) sustos.push({ t: e.t, i });
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
        if (!caiu(ids[i]!, t, Infinity, boca.id)) sustos.push({ t, i });
      }
    }
  }

  sustos.sort((a, b) => a.t - b.t);
  const janelas = quemTacou === 'contra' ? janelasDeSuspense(gravacao, bocas, cfg) : [];
  // o suspense de uma bola acaba, no máximo, `sustoS` depois de ela raspar: dali em diante é alívio
  const raspou = (i: number): number | undefined => sustos.find((x) => x.i === i)?.t;
  const fimDaJanela = new Map<number, number>();
  for (const j of janelas) {
    const r = raspou(j.i);
    const fim = r !== undefined && r >= j.ini ? Math.min(j.fim, r + cfg.sustoS) : j.fim;
    fimDaJanela.set(j.i, fim);
    momentos.push({ t: j.ini, rosto: 'desconfiado', duracao: Math.max(fim - j.ini, 0) });
  }
  let ultimo = -Infinity;
  for (const { t, i } of sustos) {
    if (t - ultimo < cfg.juntarSustosS) continue;
    ultimo = t;
    if (quemTacou === 'dono') {
      momentos.push({ t, rosto: 'susto', duracao: cfg.sustoS });
      momentos.push({ t: t + cfg.sustoS, rosto: 'desanimado', duracao: cfg.desanimadoS });
    } else {
      // o alívio vem quando o suspense acaba; sem suspense (a bola raspou sem ter corrido para a caçapa) vem `sustoS` depois da raspada
      momentos.push({ t: fimDaJanela.get(i) ?? t + cfg.sustoS, rosto: 'ufa', duracao: cfg.ufaS });
    }
  }
  return momentos.sort((a, b) => a.t - b.t);
}

/** Quando dois momentos valem ao mesmo tempo, o de maior peso fica: a falta passa à frente da comemoração, do sorriso e do susto; o suspense e o alívio cedem a todos. */
const PESO: Readonly<Record<RostoDaMesa, number>> = { desconfiado: 0.4, ufa: 0.5, desanimado: 0.8, susto: 1, sorriso: 2, comemorando: 3, bravo: 4 };

/**
 * O rosto no instante `t` (s desde o impacto): o do momento que ainda vale, ou `neutro`. Com dois valendo, o de maior peso
 * (bravo, comemorando, sorriso, susto, desanimado, ufa, desconfiado); com o mesmo peso, o que começou depois.
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
  private provocouDesde: number | null = null;

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

  /** Quem joga contra este balão errou (falta ou vez perdida) e o balão está à vista: ri e depois fica convencido. */
  provocou(agoraS: number): void {
    this.provocouDesde = agoraS;
  }

  /** Vez nova ou partida nova: cara neutra. */
  reiniciar(): void {
    this.momentos = [];
    this.ultimoT = null;
    this.bravoDesde = null;
    this.provocouDesde = null;
  }

  /**
   * `tempoDaGravacaoS`: o instante da gravação que toca, ou nulo se nenhuma toca. `agoraS`: o relógio da página. `velocidade`: a da
   * reprodução (1 = normal); depois que a gravação acaba, o relógio dela segue nessa velocidade até o último rosto passar.
   */
  rosto(tempoDaGravacaoS: number | null, agoraS: number, velocidade = 1): Rosto {
    if (this.bravoDesde !== null && agoraS - this.bravoDesde < this.cfg.bravoS) return 'bravo';
    let rosto: Rosto = 'neutro';
    if (tempoDaGravacaoS !== null) {
      this.ultimoT = tempoDaGravacaoS;
      this.ultimoAgora = agoraS;
      rosto = rostoNoTempo(this.momentos, tempoDaGravacaoS);
    } else if (this.ultimoT !== null) rosto = rostoNoTempo(this.momentos, this.ultimoT + (agoraS - this.ultimoAgora) * velocidade);
    // o que a mesa provoca vale mais que a provocação do jogo
    if (rosto !== 'neutro' || this.provocouDesde === null) return rosto;
    const passou = agoraS - this.provocouDesde;
    if (passou < 0) return 'neutro';
    if (passou < this.cfg.rindoS) return 'rindo';
    return passou < this.cfg.rindoS + this.cfg.convencidoS ? 'convencido' : 'neutro';
  }
}
