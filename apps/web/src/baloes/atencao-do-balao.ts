import { cacapas, type Gravacao, type MedidasMesa } from '@sinuca/fisica';

/** Que vaga de interesse do olhar (`PersonagemDeRosto.definirInteresse`) cada coisa que o balão olha usa. */
export const INTERESSE = { branca: 0, bolaQueAnda: 1, cacapa: 2, mira: 3, camera: 4 } as const;

/** Quantas vagas o balão usa. */
export const QUANTOS_INTERESSES = 5;

/** Um ponto de interesse do olhar (m) e quanto ele vale agora: zero o tira. */
export interface InteresseDoBalao {
  x: number;
  y: number;
  z: number;
  prioridade: number;
}

/** O quanto cada coisa vale para o olhar do balão (ver `Atencao`: o ponto de agora é interrompido por um que vale `fatorDeInterrupcao` vezes mais). */
export interface ConfigDaAtencaoDoBalao {
  /** A branca, com o outro mirando (o que ele está prestes a bater). */
  readonly branca: number;
  /** A branca quando alguma bola anda: ela já foi batida, e vale menos que a bola que anda. */
  readonly brancaComBolaAndando: number;
  /** O ponto da mira: a bola que a linha da mira acerta primeiro. */
  readonly mira: number;
  /** A bola que anda mais rápido depois da tacada. */
  readonly bolaQueAnda: number;
  /** A caçapa onde uma bola vai cair: passa à frente de tudo. */
  readonly cacapa: number;
  /** A câmera, o olhar nos olhos de quem vê: de vez em quando (a prioridade é baixa); no fim da partida, o único. */
  readonly camera: number;
  readonly cameraNoFim: number;
  /** A caçapa passa a valer isto antes da queda (s) e segue valendo isto depois (s). */
  readonly previsaoDaCacapaS: number;
  readonly seguraACacapaS: number;
}

/** O que o balão sabe do jogo neste quadro, para escolher o que olhar. Os pontos estão no mundo (m). */
export interface SituacaoDoOlhar {
  /** O outro está mirando (nada anda). */
  readonly mirando: boolean;
  readonly fim: boolean;
  readonly branca: { readonly x: number; readonly y: number; readonly z: number };
  /** A branca está na mesa. Caiu (o bolão foi para a caçapa ou saiu): o balão não a segue; olha o que vem a seguir. */
  readonly brancaNaMesa: boolean;
  /** A bola que mais anda, ou `null` se nenhuma anda. */
  readonly bolaQueAnda: { readonly x: number; readonly y: number; readonly z: number } | null;
  /** A caçapa onde uma bola está para cair, ou `null`. */
  readonly cacapa: { readonly x: number; readonly y: number; readonly z: number } | null;
  /** O ponto da mira, ou `null`. */
  readonly mira: { readonly x: number; readonly y: number; readonly z: number } | null;
  readonly camera: { readonly x: number; readonly y: number; readonly z: number };
}

/** As vagas do balão, todas zeradas (a saída de `interessesDoBalao`, que se reaproveita a cada quadro). */
export function interessesVazios(): InteresseDoBalao[] {
  return Array.from({ length: QUANTOS_INTERESSES }, () => ({ x: 0, y: 0, z: 0, prioridade: 0 }));
}

function por(saida: InteresseDoBalao[], vaga: number, p: { readonly x: number; readonly y: number; readonly z: number } | null, prioridade: number): void {
  const i = saida[vaga]!;
  if (p === null) {
    i.prioridade = 0;
    return;
  }
  i.x = p.x;
  i.y = p.y;
  i.z = p.z;
  i.prioridade = prioridade;
}

/**
 * No que o balão presta atenção neste quadro:
 *
 * - **o outro mirando**: a branca (enquanto está na mesa), e o ponto da mira (a bola que a mira acerta); a câmera só de vez em quando;
 * - **com uma bola andando**: a bola que anda passa à frente da branca (interrompe), e a caçapa onde ela vai cair passa à frente de tudo;
 * - **o fim da partida**: só a câmera.
 *
 * Quem olha, e quando, é a `Atencao` do personagem: ela fixa o mais importante, espia os outros na proporção da prioridade e volta.
 * Escreve em `saida` (`interessesVazios()`); nada aloca.
 */
export function interessesDoBalao(s: SituacaoDoOlhar, cfg: ConfigDaAtencaoDoBalao, saida: InteresseDoBalao[]): void {
  if (s.fim) {
    por(saida, INTERESSE.branca, null, 0);
    por(saida, INTERESSE.bolaQueAnda, null, 0);
    por(saida, INTERESSE.cacapa, null, 0);
    por(saida, INTERESSE.mira, null, 0);
    por(saida, INTERESSE.camera, s.camera, cfg.cameraNoFim);
    return;
  }
  const andando = s.bolaQueAnda !== null;
  por(saida, INTERESSE.branca, s.brancaNaMesa ? s.branca : null, andando ? cfg.brancaComBolaAndando : cfg.branca);
  por(saida, INTERESSE.bolaQueAnda, s.bolaQueAnda, cfg.bolaQueAnda);
  por(saida, INTERESSE.cacapa, s.cacapa, cfg.cacapa);
  por(saida, INTERESSE.mira, s.mirando && !andando ? s.mira : null, cfg.mira);
  por(saida, INTERESSE.camera, s.camera, cfg.camera);
}

/**
 * As caçapas onde as bolas da gravação caem, para o olhar do balão ir até a caçapa um instante **antes** de a bola cair (a
 * gravação é conhecida de antemão: é isso que faz o olhar parecer de quem entende o jogo). `comecar` a cada gravação nova;
 * `naVista` a cada quadro, sem alocar.
 */
export class CacapasDaGravacao {
  private tempos = new Float64Array(0);
  private xs = new Float64Array(0);
  private zs = new Float64Array(0);
  private altura = 0;

  /** Lê as quedas da gravação; `altura` é onde o olhar mira (m): a altura do centro de uma bola. */
  comecar(gravacao: Gravacao, mesa: MedidasMesa, altura: number): void {
    const bocas = cacapas(mesa);
    const quedas = gravacao.eventos.filter((e) => e.tipo === 'cacapa').sort((a, b) => a.t - b.t);
    this.tempos = new Float64Array(quedas.length);
    this.xs = new Float64Array(quedas.length);
    this.zs = new Float64Array(quedas.length);
    quedas.forEach((e, i) => {
      const boca = bocas.find((b) => b.id === e.cacapa);
      this.tempos[i] = e.t;
      this.xs[i] = boca?.queda.centro.x ?? 0;
      this.zs[i] = boca?.queda.centro.z ?? 0;
      if (boca === undefined) this.tempos[i] = Infinity;
    });
    this.altura = altura;
  }

  /** Não há gravação (volta ao começo). */
  limpar(): void {
    this.tempos = new Float64Array(0);
    this.xs = new Float64Array(0);
    this.zs = new Float64Array(0);
  }

  /**
   * Há uma queda entre `previsaoS` antes de `tempoS` e `seguraS` depois dele? Escreve o ponto em `saida` (a primeira que vale, em
   * ordem de queda). `tempoS` nulo: nenhuma gravação toca.
   */
  naVista(tempoS: number | null, previsaoS: number, seguraS: number, saida: { x: number; y: number; z: number }): boolean {
    if (tempoS === null) return false;
    for (let i = 0; i < this.tempos.length; i++) {
      const t = this.tempos[i]!;
      if (tempoS >= t - previsaoS && tempoS <= t + seguraS) {
        saida.x = this.xs[i]!;
        saida.y = this.altura;
        saida.z = this.zs[i]!;
        return true;
      }
    }
    return false;
  }
}
