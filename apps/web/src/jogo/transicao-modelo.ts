import type { IdBola } from '@sinuca/fisica';
import { grupoDaBola, rotuloDaFalta, type Consequencias, type EstadoPartida, type Recolocacao } from '@sinuca/regras';
import { fichaDaBola, type FichaDaBola } from '../cena/bola-estilo';
import { avisoDaPena, vezPerdida } from './vez-perdida';

export interface ConfigDaTransicao {
  /** O anel vermelho pulsando na bola paga (s). */
  readonly anelS: number;
  /** A bola paga subindo e voando até a ficha de quem recebeu (s). */
  readonly vooS: number;
  /** As recolocações deslizando até o lugar (s). */
  readonly deslizeS: number;
  /** O aviso grande fica na tela por tanto tempo; não segura a mira. */
  readonly avisoS: number;
  /** Online: a sala só começa o relógio da vez tanto tempo depois da animação; a transição não passa disso (s). */
  readonly margemOnlineS: number;
}

/** O aviso grande: o nome da falta, quem recebe e a bola. */
export interface AvisoDaTransicao {
  readonly titulo: string;
  readonly detalhes: readonly string[];
  /** A bola paga, para o desenho da ficha; `null` quando ninguém recebe bola. */
  readonly bola: FichaDaBola | null;
  /** `true`: é falta (vermelho); `false`: só uma bola do adversário que caiu. */
  readonly falta: boolean;
  readonly duracaoS: number;
}

export interface ItemDeVoo {
  readonly bola: IdBola;
  /** Índice em `jogadores` da linha do placar onde fica a ficha dela (o primeiro da equipe que recebe). */
  readonly paraJogador: number;
  /** `mesa`: a bola ainda está na mesa e sobe antes de voar; `cacapa`: já caiu e o voo começa no buraco. */
  readonly origem: 'mesa' | 'cacapa';
}

export type FaseDaTransicao =
  | { readonly tipo: 'anel'; readonly inicioS: number; readonly duracaoS: number; readonly bolas: readonly IdBola[] }
  | { readonly tipo: 'voo'; readonly inicioS: number; readonly duracaoS: number; readonly itens: readonly ItemDeVoo[] }
  | { readonly tipo: 'deslize'; readonly inicioS: number; readonly duracaoS: number; readonly itens: readonly Recolocacao[] };

/** O que mostrar depois da animação da tacada: as fases uma depois da outra e o aviso, que fica na tela por conta própria. */
export interface PlanoDaTransicao {
  readonly aviso: AvisoDaTransicao | null;
  readonly fases: readonly FaseDaTransicao[];
  /** Quando a última fase acaba (s); a mira só volta depois disso. */
  readonly duracaoS: number;
}

export interface EntradaDoPlano {
  readonly consequencias: Consequencias;
  /** A partida antes da tacada (para saber o que caiu agora). */
  readonly antes: EstadoPartida;
  /** A partida depois da tacada (os grupos valem os de agora). */
  readonly depois: EstadoPartida;
  /** Índice em `jogadores` de quem tacou. */
  readonly quemTacou: number;
}

type SemInicio<F> = F extends unknown ? Omit<F, 'inicioS'> : never;

/** Os nomes da equipe, na ordem da roda: "Beto" ou "Beto e Dani". */
function nomesDaEquipe(partida: EstadoPartida, equipe: number): string {
  return partida.jogadores
    .filter((j) => j.equipe === equipe)
    .map((j) => j.nome)
    .join(' e ');
}

function equipeDaBola(partida: EstadoPartida, bola: IdBola): number | null {
  const grupo = grupoDaBola(bola, partida.config);
  if (grupo === null) return null;
  const equipe = partida.grupos.indexOf(grupo);
  return equipe < 0 ? null : equipe;
}

/** O primeiro jogador da roda que é da equipe: a linha do placar para onde a ficha voa. */
function primeiroDaEquipe(partida: EstadoPartida, equipe: number): number {
  return Math.max(0, partida.jogadores.findIndex((j) => j.equipe === equipe));
}

/** "a 3", "a 3 e a 7", "a 3, a 7 e a 9". */
function listarBolas(bolas: readonly IdBola[]): string {
  const nomes = bolas.map((b) => `a ${b}`);
  return nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

const plural = (nomes: string): boolean => nomes.includes(' e ');

/**
 * Transforma o que a tacada causou numa lista de passos para mostrar com calma, na ordem: o aviso grande (nome da
 * falta, quem recebe, a bola), o anel vermelho na bola paga, a bola voando até a ficha de quem recebeu (e a das
 * bolas do adversário que caíram, que contam para ele) e as recolocações deslizando até o lugar. Pura: só lê as
 * consequências e as duas partidas. Sem nada a mostrar, o plano é vazio.
 */
export function planoDaTransicao({ consequencias, antes, depois, quemTacou }: EntradaDoPlano, cfg: ConfigDaTransicao): PlanoDaTransicao {
  const { faltas, retirar, recolocar } = consequencias;
  const equipeDeQuemTacou = depois.jogadores[quemTacou]?.equipe ?? antes.jogadores[quemTacou]?.equipe ?? -1;

  const voos: ItemDeVoo[] = [];
  const detalhes: string[] = [];

  // Bola paga pela falta: sai da mesa e vai para quem ela favorece (o dono do grupo dela).
  const porEquipe = new Map<number, IdBola[]>();
  for (const bola of retirar) {
    const dona = equipeDaBola(depois, bola) ?? (equipeDeQuemTacou === 0 ? 1 : 0);
    porEquipe.set(dona, [...(porEquipe.get(dona) ?? []), bola]);
    voos.push({ bola, paraJogador: primeiroDaEquipe(depois, dona), origem: 'mesa' });
  }
  for (const [equipe, bolas] of porEquipe) {
    const nomes = nomesDaEquipe(depois, equipe);
    detalhes.push(`${nomes} ${plural(nomes) ? 'recebem' : 'recebe'} ${listarBolas(bolas)}`);
  }

  // Bola do adversário que caiu nesta tacada: conta para ele.
  const jaCaiam = new Set(antes.encacapadas.map((e) => e.bola));
  const doAdversario = new Map<number, IdBola[]>();
  for (const { bola } of depois.encacapadas) {
    if (jaCaiam.has(bola)) continue;
    const dona = equipeDaBola(depois, bola);
    if (dona === null || dona === equipeDeQuemTacou) continue;
    doAdversario.set(dona, [...(doAdversario.get(dona) ?? []), bola]);
    voos.push({ bola, paraJogador: primeiroDaEquipe(depois, dona), origem: 'cacapa' });
  }
  const bolasDoAdversario: IdBola[] = [];
  for (const [equipe, bolas] of doAdversario) {
    const nomes = nomesDaEquipe(depois, equipe);
    const lista = listarBolas(bolas);
    detalhes.push(`${lista.charAt(0).toUpperCase()}${lista.slice(1)} ${bolas.length > 1 ? 'valem' : 'vale'} para ${nomes}`);
    bolasDoAdversario.push(...bolas);
  }

  const fases: FaseDaTransicao[] = [];
  let inicioS = 0;
  const acrescentar = (fase: SemInicio<FaseDaTransicao>): void => {
    fases.push({ ...fase, inicioS } as FaseDaTransicao);
    inicioS += fase.duracaoS;
  };
  if (retirar.length > 0) acrescentar({ tipo: 'anel', duracaoS: cfg.anelS, bolas: retirar });
  if (voos.length > 0) acrescentar({ tipo: 'voo', duracaoS: cfg.vooS, itens: voos });
  if (recolocar.length > 0) acrescentar({ tipo: 'deslize', duracaoS: cfg.deslizeS, itens: recolocar });

  let aviso: AvisoDaTransicao | null = null;
  if (faltas.length > 0) {
    const titulo = `${faltas.map((f) => rotuloDaFalta(f.nome, depois.config)).join(' + ')}!`;
    let linhas = detalhes;
    if (retirar.length === 0) {
      const quemVence = consequencias.vencedor === null ? null : nomesDaEquipe(depois, consequencias.vencedor);
      const proximo = depois.jogadores[consequencias.proximo]?.nome;
      const fim = quemVence === null ? (proximo === undefined ? [] : [`Vez de ${proximo}`]) : [`${quemVence} ${plural(quemVence) ? 'vencem' : 'vence'}`];
      linhas = [...fim, ...detalhes];
    }
    // Quem tacou entrou na lista de quem perde a próxima vez (cegar ou a branca fora do jogo no mata-mata): o aviso diz que ele perde a próxima.
    // Só a lista de antes e depois decide, nunca o nome da falta: cegar e suicídio na mesma tacada são uma linha só.
    const pena = avisoDaPena(depois, quemTacou, vezPerdida(antes, depois).puniu);
    if (pena !== '') linhas = [...linhas, pena];
    aviso = { titulo, detalhes: linhas, bola: retirar[0] === undefined ? null : fichaDaBola(retirar[0], depois.config), falta: true, duracaoS: cfg.avisoS };
  } else if (bolasDoAdversario.length > 0) {
    aviso = { titulo: 'Bola do adversário', detalhes, bola: fichaDaBola(bolasDoAdversario[0]!, depois.config), falta: false, duracaoS: cfg.avisoS };
  }

  return { aviso, fases, duracaoS: inicioS };
}

/**
 * Encolhe as fases, todas na mesma proporção e emendadas, para o plano caber em `limiteS` (online: a margem que a
 * sala dá antes de começar o relógio da vez). O aviso fica como está. Já cabendo, devolve o mesmo plano.
 */
export function encurtarPlano(plano: PlanoDaTransicao, limiteS: number): PlanoDaTransicao {
  if (plano.duracaoS <= limiteS) return plano;
  const fator = Math.max(0, limiteS) / plano.duracaoS;
  let inicioS = 0;
  const fases = plano.fases.map((fase): FaseDaTransicao => {
    const duracaoS = fase.duracaoS * fator;
    const nova = { ...fase, inicioS, duracaoS };
    inicioS += duracaoS;
    return nova;
  });
  return { aviso: plano.aviso, fases, duracaoS: inicioS };
}

/** De 0 (antes da fase) a 1 (depois dela) no instante `tS` da transição. */
export function progressoDaFase(fase: Pick<FaseDaTransicao, 'inicioS' | 'duracaoS'>, tS: number): number {
  if (fase.duracaoS <= 0 || tS >= fase.inicioS + fase.duracaoS) return 1;
  return Math.max(0, (tS - fase.inicioS) / fase.duracaoS);
}

