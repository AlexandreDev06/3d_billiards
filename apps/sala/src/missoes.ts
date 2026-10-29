/**
 * A conferência das missões diárias (L31), pura: sem rede, sem relógio, sem disco. Recebe uma tacada que a sala aceitou (os
 * parâmetros, a gravação, as consequências das regras e a partida de antes e a de depois) e diz quanto ela vale para cada
 * missão; no fim da partida, `conferirFimDaPartida` diz o mesmo para as três missões de partida inteira. Quem soma, guarda e
 * paga é o armazém de carteiras e a sala.
 *
 * Nada aqui importa valor de física (o lint barra): os limiares vêm do catálogo do protocolo, e as medidas, da gravação.
 *
 * **Bola matada** é a bola objeto que cai numa tacada sem falta e não volta à mesa. No par ou ímpar conta a bola do grupo de
 * quem tacou (o grupo que a tacada deixou, já com o que ela definiu) ou a bola final; no mata-mata, qualquer bola. Leituras
 * onde a decisão não fechou o caso, as que um jogador de boteco aceitaria:
 * - no par ou ímpar, tacada que acaba a partida com a derrota de quem tacou (a bola final antes da hora, por exemplo) não conta
 *   nada: ninguém comemora a tacada que perdeu o jogo;
 * - "seguidas" do Embalado: no par ou ímpar são as bolas de quem fica com a mesa; no mata-mata, onde a vez passa a cada tacada,
 *   são tacadas dele seguidas que mataram (as dos outros no meio não interrompem), e errar a dele zera;
 * - a velocidade e o efeito são os `parametros` que o cliente mandou (a sala não re-simula, e é o mesmo risco aceito da aposta);
 * - **tabela é só o nariz** (L34, o A1 da revisão do L31): o raspão na boca da caçapa (`parte: 'boca'`) não vale, e uma batida de
 *   verdade tem a velocidade normal do evento no mínimo igual à `batida` do catálogo (raspar ou rolar colado na tabela não é
 *   tabela). A *Tabelada* é a tacada de tabela: a branca manda a bola à tabela (o último choque dela antes da batida é com a
 *   branca), a batida é de verdade, ela cai direto (nenhum outro choque dela depois) e a caçapa fica a `caminho` metros da
 *   batida (o que a gravação diz das posições). Os números saíram de uma varredura com a física real (o resumo está em `docs/decisoes.md`, L34);
 * - a *Volta ao mundo* não vale na tacada que perde a partida, como as bolas.
 */
import type { EventoTacada, Gravacao, IdBola, ParametrosTacada } from '@sinuca/fisica';
import { MISSOES, missaoDoCatalogo, type IdMissao } from '@sinuca/protocolo';
import { bolaDeCastigo, grupoDaBola, type Consequencias, type EstadoPartida } from '@sinuca/regras';

/** O bolão (= `ID_BOLAO` da física, que a sala não importa em tempo de execução). */
const BOLAO: IdBola = 0;

/**
 * As caçapas do meio, pelo prefixo do id que a gravação traz (`meio-z-`, `meio-z+`; as de canto são `canto-...`). Um teste da
 * sala confere esse prefixo contra `cacapas()` da física.
 */
export const PREFIXO_DAS_CACAPAS_DO_MEIO = 'meio-';

/** O que cada missão vale: quanto somar (`acumulo: soma`) ou o valor a comparar com o melhor do dia (`maximo`). Só as que andaram. */
export type ValoresDasMissoes = Partial<Record<IdMissao, number>>;

export interface TacadaParaConferir {
  readonly parametros: ParametrosTacada;
  readonly gravacao: Gravacao;
  readonly consequencias: Consequencias;
  /** A partida antes da tacada; quem tacou é `antes.jogadores[antes.vez]`. */
  readonly antes: EstadoPartida;
  /** A partida que as regras devolveram. */
  readonly depois: EstadoPartida;
  /** Bolas que quem tacou vinha matando em tacadas seguidas (a `seguidas` da conferência anterior dele; 0 no começo). */
  readonly seguidasAntes: number;
}

export interface ConferenciaDaTacada {
  /** Bolas matadas nesta tacada, na ordem da queda. */
  readonly mortas: readonly IdBola[];
  readonly valores: ValoresDasMissoes;
  /** A sequência de quem tacou depois desta tacada (guardada por ele para a próxima conferência). */
  readonly seguidas: number;
  /** A vez do par ou ímpar acabou para a equipe de quem tacou (perdeu a mesa ou a partida acabou): zere a sequência de todos dela. */
  readonly encerraAVez: boolean;
}

const limiarDe = (id: IdMissao): number => missaoDoCatalogo(id).limiar!;
const batidaDe = (id: IdMissao): number => missaoDoCatalogo(id).batida!;
const caminhoDe = (id: IdMissao): number => missaoDoCatalogo(id).caminho!;

const indiceDaCacapa = (eventos: readonly EventoTacada[], bola: IdBola): number => eventos.findIndex((e) => e.tipo === 'cacapa' && e.bola === bola);

/** Onde a bola está no instante `t` (o quadro mais próximo da gravação), ou `null` se ela não está na gravação. */
function posicaoEm(gravacao: Gravacao, bola: IdBola, t: number): { x: number; z: number } | null {
  const i = gravacao.ids.indexOf(bola);
  if (i < 0) return null;
  const quadro = Math.max(0, Math.min(gravacao.quadros - 1, Math.round(t * gravacao.frequencia)));
  const k = (quadro * gravacao.ids.length + i) * 3;
  return { x: gravacao.posicoes[k]!, z: gravacao.posicoes[k + 2]! };
}

/** Choque bola-bola em que a bola participa. */
const choqueDa = (e: EventoTacada, bola: IdBola): boolean => e.tipo === 'bola-bola' && (e.a === bola || e.b === bola);

/**
 * A bola que caiu em `caiuEm` fez uma tabelada: bateu no nariz da tabela com a `batida` de verdade, o último choque dela antes
 * da batida foi com a branca, nenhum outro choque até cair e a caçapa fica a `caminho` metros da batida.
 */
function foiTabelada(gravacao: Gravacao, bola: IdBola, caiuEm: number): boolean {
  const eventos = gravacao.eventos;
  const queda = eventos[caiuEm];
  if (queda?.tipo !== 'cacapa') return false;
  const fim = posicaoEm(gravacao, bola, queda.t);
  if (fim === null) return false;
  const choques = eventos.flatMap((e, i) => (i < caiuEm && choqueDa(e, bola) ? [i] : []));
  return eventos.some((e, i) => {
    if (i >= caiuEm || e.tipo !== 'bola-tabela' || e.bola !== bola || e.parte !== 'nariz' || e.velocidade < batidaDe('tabelada')) return false;
    const ultimo = eventos[choques.filter((c) => c < i).at(-1) ?? -1];
    if (ultimo?.tipo !== 'bola-bola' || (ultimo.a !== BOLAO && ultimo.b !== BOLAO)) return false;
    if (choques.some((c) => c > i)) return false;
    const ini = posicaoEm(gravacao, bola, e.t);
    return ini !== null && Math.hypot(ini.x - fim.x, ini.z - fim.z) >= caminhoDe('tabelada');
  });
}

/** Distância da branca à bola no primeiro quadro da gravação (m), ou `null` se uma das duas não está nela. */
function distanciaNoPrimeiroQuadro(gravacao: Gravacao, bola: IdBola): number | null {
  const a = gravacao.ids.indexOf(BOLAO);
  const b = gravacao.ids.indexOf(bola);
  if (a < 0 || b < 0) return null;
  const p = gravacao.posicoes;
  return Math.hypot(p[a * 3]! - p[b * 3]!, p[a * 3 + 1]! - p[b * 3 + 1]!, p[a * 3 + 2]! - p[b * 3 + 2]!);
}

/** As batidas de verdade no nariz da tabela que a branca deu antes do primeiro choque dela com outra bola. */
function tabelasDaBrancaAntesDeTocar(eventos: readonly EventoTacada[]): number {
  let tabelas = 0;
  for (const e of eventos) {
    if (choqueDa(e, BOLAO)) break;
    if (e.tipo === 'bola-tabela' && e.bola === BOLAO && e.parte === 'nariz' && e.velocidade >= batidaDe('volta-ao-mundo')) tabelas++;
  }
  return tabelas;
}

/** No par ou ímpar, a tacada acabou a partida com a vitória do outro lado (a bola final antes da hora, por exemplo). */
function perdeuAPartida(t: TacadaParaConferir): boolean {
  const { antes, depois } = t;
  return antes.config.modalidade !== 'mata-mata' && depois.vencedor !== null && depois.vencedor !== antes.jogadores[antes.vez]!.equipe;
}

/** As bolas que esta tacada matou (ver o texto do módulo); vazio se houve falta ou se quem tacou perdeu a partida com ela. */
function bolasMatadas(t: TacadaParaConferir): IdBola[] {
  const { antes, depois, consequencias } = t;
  if (consequencias.faltas.length > 0) return [];
  const equipe = antes.jogadores[antes.vez]!.equipe;
  const mataMata = antes.config.modalidade === 'mata-mata';
  if (perdeuAPartida(t)) return [];
  const jaCaidas = new Set(antes.encacapadas.map((e) => e.bola));
  const volta = new Set(consequencias.recolocar.map((r) => r.bola));
  const castigo = bolaDeCastigo(antes.config);
  return depois.encacapadas
    .map((e) => e.bola)
    .filter((bola) => !jaCaidas.has(bola) && !volta.has(bola))
    .filter((bola) => mataMata || bola === castigo || grupoDaBola(bola, depois.config) === depois.grupos[equipe]);
}

/** Quanto esta tacada vale para cada missão (as de partida inteira ficam com `conferirFimDaPartida`). */
export function conferirTacada(t: TacadaParaConferir): ConferenciaDaTacada {
  const { parametros, gravacao, consequencias, antes, depois } = t;
  const eventos = gravacao.eventos;
  const jogador = antes.jogadores[antes.vez]!;
  const mataMata = antes.config.modalidade === 'mata-mata';
  const mortas = bolasMatadas(t);
  const caiuEm = new Map(mortas.map((bola) => [bola, indiceDaCacapa(eventos, bola)]));
  const contar = (serve: (bola: IdBola, caiuEm: number) => boolean): number => mortas.filter((bola) => serve(bola, caiuEm.get(bola)!)).length;

  const velocidade = parametros.velocidadeTaco;
  const { lateral, vertical } = parametros.efeito;
  const mataSe = (condicao: boolean): number => (condicao && mortas.length > 0 ? 1 : 0);

  const noMeio = contar((_, i) => {
    const e = eventos[i];
    return e?.tipo === 'cacapa' && e.cacapa.startsWith(PREFIXO_DAS_CACAPAS_DO_MEIO);
  });
  const embalado = mortas.length > 0 ? t.seguidasAntes + mortas.length : 0;

  const valores: Record<IdMissao, number> = {
    // fáceis
    'fregues-da-casa': 0,
    'mao-quente': mortas.length,
    'pelo-meio': noMeio,
    'saida-premiada': mataSe(antes.fase === 'saida'),
    // médias
    embalado,
    'na-pancada': mataSe(velocidade >= limiarDe('na-pancada')),
    'no-carinho': mataSe(velocidade <= limiarDe('no-carinho')),
    'efeito-ingles': mataSe(Math.abs(lateral) >= limiarDe('efeito-ingles')),
    siga: mataSe(vertical >= limiarDe('siga')),
    puxada: mataSe(vertical <= -limiarDe('puxada')),
    'fecha-a-conta': 0,
    // difíceis
    tabelada: contar((bola, i) => foiTabelada(gravacao, bola, i)),
    'de-longe': contar((bola) => (distanciaNoPrimeiroQuadro(gravacao, bola) ?? 0) > limiarDe('de-longe')),
    'volta-ao-mundo': consequencias.faltas.length === 0 && !perdeuAPartida(t) && tabelasDaBrancaAntesDeTocar(eventos) >= limiarDe('volta-ao-mundo') ? 1 : 0,
    limpinho: 0,
  };

  const encerraAVez = !mataMata && (depois.vencedor !== null || depois.jogadores[depois.vez]!.equipe !== jogador.equipe);
  return {
    mortas,
    valores: andaram(valores),
    seguidas: mortas.length > 0 && !encerraAVez ? embalado : 0,
    encerraAVez,
  };
}

/** Só as missões que a tacada fez andar (valor positivo), na ordem do catálogo. */
function andaram(valores: Readonly<Record<IdMissao, number>>): ValoresDasMissoes {
  const saida: Partial<Record<IdMissao, number>> = {};
  for (const { id } of MISSOES) if (valores[id] > 0) saida[id] = valores[id];
  return saida;
}

// ---------------------------------------------------------------- fim da partida

export interface ParticipanteDoFim {
  readonly lugar: number;
  readonly equipe: number;
  /** Faltas que esta pessoa cometeu desde que a partida começou (inclusive na tacada que a acabou). */
  readonly faltas: number;
}

/**
 * As missões de partida inteira, por lugar: todo mundo do rol que chegou ao fim ganha 1 em Freguês da casa; quem está na equipe
 * vencedora ganha 1 em Fecha a conta e, se não cometeu nenhuma falta na partida (a dele, não a do parceiro), 1 em Limpinho.
 * Vazio para a partida sem vencedor.
 */
export function conferirFimDaPartida(rol: readonly ParticipanteDoFim[], vencedor: number | null): ReadonlyMap<number, ValoresDasMissoes> {
  const saida = new Map<number, ValoresDasMissoes>();
  if (vencedor === null) return saida;
  for (const p of rol) {
    const venceu = p.equipe === vencedor;
    saida.set(p.lugar, {
      'fregues-da-casa': 1,
      ...(venceu ? { 'fecha-a-conta': 1 } : {}),
      ...(venceu && p.faltas === 0 ? { limpinho: 1 } : {}),
    });
  }
  return saida;
}
