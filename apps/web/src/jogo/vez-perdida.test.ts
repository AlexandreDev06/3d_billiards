import { describe, expect, it } from 'vitest';
import type { EventoTacada } from '@sinuca/fisica';
import { bolasDaCasa, passarVez, type EstadoPartida } from '@sinuca/regras';
import { CASA_8, CASA_MATA_MATA, TRIO_POR_SI, partidaDeTeste } from './para-testes';
import { REGRAS_DO_PACOTE } from './regras';
import { avisoDaPena, avisoDoPulo, vezPerdida } from './vez-perdida';

const BOLAO = 0;
const TACO: EventoTacada = { tipo: 'taco-bola', t: 0, bola: BOLAO, velocidade: 2, miscue: false };
const TOQUE: EventoTacada = { tipo: 'bola-bola', t: 0.1, a: BOLAO, b: 5, velocidade: 1 };
const PAROU: EventoTacada = { tipo: 'parou', t: 1 };

/** Toca a 5 e nada cai. */
const NORMAL: readonly EventoTacada[] = [TACO, TOQUE, PAROU];
/** A branca cai na caçapa depois de tocar a 5: suicídio. */
const SUICIDIO: readonly EventoTacada[] = [TACO, TOQUE, { tipo: 'cacapa', t: 0.5, bola: BOLAO, cacapa: 'canto-1' }, PAROU];
/** A branca anda e não toca bola nenhuma: cegou (a branca fica onde parou). */
const CEGAR: readonly EventoTacada[] = [TACO, PAROU];

/** Mata-mata no meio da partida, com `n` pessoas (2 a 4), a vez em `vez` e quem já perde a próxima vez em `perdem`. */
function mata(n: 2 | 3 | 4, vez: number, perdem?: readonly number[]): EstadoPartida {
  const jogadores = [...TRIO_POR_SI, { id: 'd', nome: 'Dani', equipe: 3 }].slice(0, n);
  return partidaDeTeste({
    config: CASA_MATA_MATA,
    jogadores,
    grupos: jogadores.map(() => null),
    fase: 'aberta',
    naMesa: bolasDaCasa(CASA_MATA_MATA),
    vez,
    ...(perdem === undefined ? {} : { perdemAProximaVez: perdem }),
  });
}

const tacar = (antes: EstadoPartida, eventos: readonly EventoTacada[]) => REGRAS_DO_PACOTE.aplicarTacada(antes, eventos).partida;

describe('vezPerdida com as regras de verdade: o que a roda fez nesta passagem da vez', () => {
  it('a tacada comum não pune nem pula ninguém', () => {
    const antes = mata(3, 0);
    const depois = tacar(antes, NORMAL);
    expect(depois.vez).toBe(1);
    expect(vezPerdida(antes, depois)).toEqual({ puniu: false, pulados: [] });
  });

  it('o suicídio põe quem tacou na lista (puniu) e a vez passa ao seguinte sem pular ninguém', () => {
    const antes = mata(3, 0);
    const depois = tacar(antes, SUICIDIO);
    expect(depois.perdemAProximaVez).toEqual([0]);
    expect(depois.vez).toBe(1);
    expect(vezPerdida(antes, depois)).toEqual({ puniu: true, pulados: [] });
  });

  it('quando a roda volta a quem perdia a vez, ele é pulado: quem tacou não é punido e o seguinte ao pulado joga', () => {
    const antes = mata(3, 2, [0]);
    const depois = tacar(antes, NORMAL);
    expect(depois.vez).toBe(1);
    expect(depois.perdemAProximaVez).toBeUndefined();
    expect(vezPerdida(antes, depois)).toEqual({ puniu: false, pulados: [0] });
  });

  it('no 1×1 o outro joga duas seguidas: quem suicida é punido, e na tacada do outro o suicida é pulado', () => {
    const a = mata(2, 0);
    const b = tacar(a, SUICIDIO);
    expect(vezPerdida(a, b)).toEqual({ puniu: true, pulados: [] });
    const c = tacar(b, NORMAL);
    expect(c.vez).toBe(1);
    expect(vezPerdida(b, c)).toEqual({ puniu: false, pulados: [0] });
  });

  it('dois pulados na mesma passagem saem na ordem em que a roda os alcançou', () => {
    const antes = mata(4, 3, [0, 1]);
    const depois = tacar(antes, NORMAL);
    expect(depois.vez).toBe(2);
    expect(vezPerdida(antes, depois)).toEqual({ puniu: false, pulados: [0, 1] });
  });

  it('suicídio de quem acaba de voltar de um pulo: pune de novo e pula o outro da lista', () => {
    const antes = mata(3, 1, [2]);
    const depois = tacar(antes, SUICIDIO);
    expect(depois.perdemAProximaVez).toEqual([1]);
    expect(depois.vez).toBe(0);
    expect(vezPerdida(antes, depois)).toEqual({ puniu: true, pulados: [2] });
  });

  it('a roda que dá a volta e pula até quem acabou de tacar: todos perdem a vez e a roda para no seguinte a quem tacou', () => {
    const antes = mata(3, 2, [0, 1]);
    const depois = tacar(antes, SUICIDIO);
    expect(depois.vez).toBe(0);
    expect(depois.perdemAProximaVez).toBeUndefined();
    expect(vezPerdida(antes, depois)).toEqual({ puniu: true, pulados: [0, 1, 2] });
  });

  it('o mesmo com dois: o outro e quem tacou são pulados e joga o outro', () => {
    const antes = mata(2, 0, [1]);
    const depois = tacar(antes, SUICIDIO);
    expect(depois.vez).toBe(1);
    expect(vezPerdida(antes, depois)).toEqual({ puniu: true, pulados: [1, 0] });
  });

  it('o tempo que acaba (passarVez) pula quem perdia a vez e não pune quem perdeu o tempo', () => {
    const antes = mata(3, 0, [1]);
    const depois = passarVez(antes);
    expect(depois.vez).toBe(2);
    expect(depois.perdemAProximaVez).toBeUndefined();
    expect(vezPerdida(antes, depois)).toEqual({ puniu: false, pulados: [1] });
  });

  it('o tempo que acaba com todos os outros na lista: a roda dá a volta e quem perdeu o tempo joga de novo', () => {
    const antes = mata(3, 0, [1, 2]);
    const depois = passarVez(antes);
    expect(depois.vez).toBe(0);
    expect(vezPerdida(antes, depois)).toEqual({ puniu: false, pulados: [1, 2] });
  });

  it('o tempo que acaba sem ninguém na lista só passa a vez', () => {
    const antes = mata(3, 1);
    expect(vezPerdida(antes, passarVez(antes))).toEqual({ puniu: false, pulados: [] });
  });

  it('no fim da partida a lista some do estado, e isso não é pulo', () => {
    const antes = { ...mata(3, 0, [1]), naMesa: [5] };
    const depois = tacar(antes, [TACO, { tipo: 'bola-bola', t: 0.1, a: BOLAO, b: 5, velocidade: 1 }, { tipo: 'cacapa', t: 0.5, bola: 5, cacapa: 'canto-1' }, PAROU]);
    expect(depois.fase).toBe('fim');
    expect(depois.perdemAProximaVez).toBeUndefined();
    expect(vezPerdida(antes, depois)).toEqual({ puniu: false, pulados: [] });
  });

  it('no fim da partida com todos os outros na lista: a lista some e a roda não "deu a volta"', () => {
    const antes = { ...mata(3, 0, [1, 2]), naMesa: [5] };
    const depois = tacar(antes, [TACO, TOQUE, { tipo: 'cacapa', t: 0.5, bola: 5, cacapa: 'canto-1' }, PAROU]);
    expect(depois.fase).toBe('fim');
    expect(depois.vez).toBe(1);
    expect(vezPerdida(antes, depois)).toEqual({ puniu: false, pulados: [] });
  });

  it('no par ou ímpar, que não tem a lista, nunca há pena nem pulo', () => {
    const antes = partidaDeTeste({ config: CASA_8, fase: 'aberta' });
    expect(vezPerdida(antes, tacar(antes, NORMAL))).toEqual({ puniu: false, pulados: [] });
    expect(vezPerdida(antes, tacar(antes, SUICIDIO))).toEqual({ puniu: false, pulados: [] });
    expect(vezPerdida(antes, passarVez(antes))).toEqual({ puniu: false, pulados: [] });
  });
});

describe('vezPerdida: o que a lista diz, sem confiar nas regras', () => {
  it('sem lista antes nem depois não há nada, qualquer que seja a vez', () => {
    const antes = mata(3, 0);
    for (const vez of [0, 1, 2]) expect(vezPerdida(antes, { ...antes, vez })).toEqual({ puniu: false, pulados: [] });
  });

  it('uma vez fora da roda (estado torto) não trava: dá nada', () => {
    const antes = mata(3, 0, [1]);
    for (const vez of [-1, 3, 1.5, Number.NaN]) expect(vezPerdida(antes, { ...antes, vez })).toEqual({ puniu: false, pulados: [] });
  });

  it('quem continua na lista depois da passagem não foi pulado, mesmo que esteja no caminho', () => {
    const antes = mata(3, 0, [1]);
    expect(vezPerdida(antes, { ...antes, vez: 2 })).toEqual({ puniu: false, pulados: [] });
  });

  it('quem saiu da lista mas não está no caminho da roda não conta como pulado', () => {
    const antes = mata(4, 0, [3]);
    const depois = { ...mata(4, 1) };
    expect(vezPerdida(antes, depois)).toEqual({ puniu: false, pulados: [] });
  });
});

describe('vezPerdida: cegar punido como o suicídio, pela mesma lista', () => {
  it('cegar põe quem tacou na lista (puniu) e a vez passa ao seguinte, com a branca onde parou', () => {
    const antes = mata(3, 0);
    const depois = tacar(antes, CEGAR);
    expect(depois.perdemAProximaVez).toEqual([0]);
    expect(depois.vez).toBe(1);
    expect(vezPerdida(antes, depois)).toEqual({ puniu: true, pulados: [] });
  });

  it('quem cegou é pulado quando a roda volta: o aviso é o mesmo do suicídio', () => {
    const a = mata(3, 0);
    const b = tacar(a, CEGAR);
    const c = tacar(b, NORMAL);
    const d = tacar(c, NORMAL);
    expect(d.vez).toBe(1);
    expect(d.perdemAProximaVez).toBeUndefined();
    const pulo = vezPerdida(c, d);
    expect(pulo).toEqual({ puniu: false, pulados: [0] });
    expect(avisoDoPulo(d, pulo.pulados)).toBe('Ana pula a vez (falta)');
  });

  it('no 1×1 o outro joga duas seguidas depois de um cegar', () => {
    const a = mata(2, 0);
    const b = tacar(a, CEGAR);
    expect(vezPerdida(a, b)).toEqual({ puniu: true, pulados: [] });
    const c = tacar(b, NORMAL);
    expect(c.vez).toBe(1);
    expect(vezPerdida(b, c)).toEqual({ puniu: false, pulados: [0] });
  });

  it('cegar e suicídio na mesma tacada: uma pena só, um aviso só', () => {
    const antes = mata(3, 0);
    const depois = tacar(antes, [TACO, { tipo: 'cacapa', t: 0.5, bola: BOLAO, cacapa: 'canto-1' }, PAROU]);
    expect(depois.perdemAProximaVez).toEqual([0]);
    expect(vezPerdida(antes, depois)).toEqual({ puniu: true, pulados: [] });
  });

  it('cegar com a pena desligada (o aviso não aparece, a lista não existe)', () => {
    const antes = { ...mata(3, 0), config: { ...CASA_MATA_MATA, cegarNoMataMata: 'sem-pena' as const } };
    const depois = tacar(antes, CEGAR);
    expect(depois.perdemAProximaVez).toBeUndefined();
    expect(vezPerdida(antes, depois)).toEqual({ puniu: false, pulados: [] });
  });
});

describe('os textos', () => {
  const partida = mata(4, 0);

  it('um pulado: "Ana pula a vez (falta)"; mais de um, no plural, na ordem dada', () => {
    expect(avisoDoPulo(partida, [0])).toBe('Ana pula a vez (falta)');
    expect(avisoDoPulo(partida, [1, 3])).toBe('Beto e Dani pulam a vez (falta)');
    expect(avisoDoPulo(partida, [0, 1, 2])).toBe('Ana, Beto e Caio pulam a vez (falta)');
  });

  it('ninguém pulado, nenhum aviso', () => {
    expect(avisoDoPulo(partida, [])).toBe('');
  });

  it('a pena: "Ana perde a próxima vez" só se quem tacou foi punido', () => {
    expect(avisoDaPena(partida, 0, true)).toBe('Ana perde a próxima vez');
    expect(avisoDaPena(partida, 2, true)).toBe('Caio perde a próxima vez');
    expect(avisoDaPena(partida, 0, false)).toBe('');
  });
});
