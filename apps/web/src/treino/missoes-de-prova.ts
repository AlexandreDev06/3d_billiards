import { ID_BOLAO, type EventoTacada, type Gravacao, type IdBola, type ResultadoTacada } from '@sinuca/fisica';
import { missaoDoCatalogo } from '@sinuca/protocolo';
import { aplicarTacada, type EstadoPartida } from '@sinuca/regras';

/**
 * Só para PROVA (testes e varreduras de cenário): diz se uma tacada simulada cumpriria uma das três missões que os
 * cenários do treino armam. É a conferência da sala (`apps/sala/src/missoes.ts`) lida da gravação e dos eventos, sem a parte
 * de carteira e de partida; o treino não confere missão nenhuma, então nada do jogo importa este arquivo. Os limiares vêm
 * do catálogo do protocolo (nunca copiados aqui), e a tabelada, a volta ao mundo e o "de longe" só valem sem falta.
 */
export type MissaoDeCenario = 'tabelada' | 'de-longe' | 'volta-ao-mundo';

const limiarDe = (id: MissaoDeCenario): number => missaoDoCatalogo(id).limiar!;
const batidaDe = (id: MissaoDeCenario): number => missaoDoCatalogo(id).batida!;
const caminhoDe = (id: MissaoDeCenario): number => missaoDoCatalogo(id).caminho!;

const choqueDa = (e: EventoTacada, bola: IdBola): boolean => e.tipo === 'bola-bola' && (e.a === bola || e.b === bola);

/** Onde a bola está no instante `t` (o quadro mais próximo da gravação), ou `null` se ela não está na gravação. */
function posicaoEm(gravacao: Gravacao, bola: IdBola, t: number): { x: number; z: number } | null {
  const i = gravacao.ids.indexOf(bola);
  if (i < 0) return null;
  const quadro = Math.max(0, Math.min(gravacao.quadros - 1, Math.round(t * gravacao.frequencia)));
  const k = (quadro * gravacao.ids.length + i) * 3;
  return { x: gravacao.posicoes[k]!, z: gravacao.posicoes[k + 2]! };
}

/** A bola que caiu em `caiuEm` fez uma tabelada (ver a conferência da sala). */
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
    if (ultimo?.tipo !== 'bola-bola' || (ultimo.a !== ID_BOLAO && ultimo.b !== ID_BOLAO)) return false;
    if (choques.some((c) => c > i)) return false;
    const ini = posicaoEm(gravacao, bola, e.t);
    return ini !== null && Math.hypot(ini.x - fim.x, ini.z - fim.z) >= caminhoDe('tabelada');
  });
}

/** Distância da branca à bola no primeiro quadro da gravação (m). */
function distanciaNoPrimeiroQuadro(gravacao: Gravacao, bola: IdBola): number | null {
  const a = gravacao.ids.indexOf(ID_BOLAO);
  const b = gravacao.ids.indexOf(bola);
  if (a < 0 || b < 0) return null;
  const p = gravacao.posicoes;
  return Math.hypot(p[a * 3]! - p[b * 3]!, p[a * 3 + 1]! - p[b * 3 + 1]!, p[a * 3 + 2]! - p[b * 3 + 2]!);
}

/** As batidas de verdade no nariz da tabela que a branca deu antes do primeiro choque dela com outra bola. */
function tabelasDaBrancaAntesDeTocar(eventos: readonly EventoTacada[]): number {
  let tabelas = 0;
  for (const e of eventos) {
    if (choqueDa(e, ID_BOLAO)) break;
    if (e.tipo === 'bola-tabela' && e.bola === ID_BOLAO && e.parte === 'nariz' && e.velocidade >= batidaDe('volta-ao-mundo')) tabelas++;
  }
  return tabelas;
}

/**
 * Essa tacada, dada na `partida` (a do cenário armado), cumpre a missão? Sem falta (`aplicarTacada` das regras do treino diz
 * quais houve), e com o que cada missão pede da gravação.
 */
export function cumpreAMissao(missao: MissaoDeCenario, partida: EstadoPartida, resultado: ResultadoTacada): boolean {
  const { consequencias, partida: depois } = aplicarTacada(partida, resultado.eventos);
  if (consequencias.faltas.length > 0) return false;
  const gravacao = resultado.gravacao;
  const jaCaidas = new Set(partida.encacapadas.map((e) => e.bola));
  const mortas = depois.encacapadas.map((e) => e.bola).filter((b) => !jaCaidas.has(b));
  const quedas = new Map(mortas.map((bola) => [bola, gravacao.eventos.findIndex((e) => e.tipo === 'cacapa' && e.bola === bola)]));
  switch (missao) {
    case 'tabelada':
      return mortas.some((bola) => foiTabelada(gravacao, bola, quedas.get(bola)!));
    case 'de-longe':
      return mortas.some((bola) => (distanciaNoPrimeiroQuadro(gravacao, bola) ?? 0) > limiarDe('de-longe'));
    case 'volta-ao-mundo':
      return tabelasDaBrancaAntesDeTocar(gravacao.eventos) >= limiarDe('volta-ao-mundo');
  }
}
