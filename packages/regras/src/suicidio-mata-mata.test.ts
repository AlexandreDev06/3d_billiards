import { describe, expect, it } from 'vitest';
import { jogadoresDaProxima, pontosPorEquipe } from './leitura';
import { aplicarTacada, novaPartida, passarVez } from './partida';
import {
  ANA,
  BETO,
  CAIO,
  DANI,
  DUPLAS,
  JOGADORES,
  QUARTETO,
  SEM_PENA_NO_SUICIDIO,
  TRIO,
  configMataMata,
  congelar,
  eventos,
  matou,
  mataMataCom,
  numeros,
  partidaCom,
  rngDeTeste,
  type Tacada,
} from './para-testes';
import { PRESET_MATA_MATA } from './presets';
import type { EstadoPartida, Jogador } from './tipos';

const todas = numeros(1, 15);

const CAI: Tacada = { toca: 5, branca: 'cai' };
const FORA: Tacada = { toca: 5, branca: 'fora' };
const LIMPA: Tacada = { toca: 5 };

/** Uma tacada de quem tem a vez numa partida congelada; confere a pureza e a coerência entre partida e consequências. */
function tacar(partida: EstadoPartida, t: Tacada = LIMPA) {
  const antes = congelar(partida);
  const evs = congelar(eventos(t));
  const r = aplicarTacada(antes, evs);
  expect(aplicarTacada(antes, evs), 'pura').toEqual(r);
  expect(r.partida.vez).toBe(r.consequencias.proximo);
  expect(r.partida.vencedor).toBe(r.consequencias.vencedor);
  return r;
}

/** Joga as tacadas em fila e devolve de quem foi a vez depois de cada uma, com a partida no fim. */
function jogar(partida: EstadoPartida, ...tacadas: Tacada[]) {
  const vezes: number[] = [];
  let atual = partida;
  for (const t of tacadas) {
    atual = tacar(atual, t).partida;
    vezes.push(atual.vez);
  }
  return { vezes, partida: atual };
}

const sorteadas = (n: number): Tacada[] => Array.from({ length: n }, () => LIMPA);

describe('suicídio no mata-mata: o preset e a forma do estado', () => {
  it('o mata-mata liga "perde-proxima-vez"; o estado começa sem o campo', () => {
    expect(PRESET_MATA_MATA.regras.suicidioNoMataMata).toBe('perde-proxima-vez');
    for (const jogadores of [JOGADORES, TRIO, QUARTETO]) {
      const { partida } = novaPartida(configMataMata(), jogadores, rngDeTeste(1));
      expect(partida).not.toHaveProperty('perdemAProximaVez');
    }
  });

  it('sem suicídio o campo não aparece, nem vazio: a forma é a de sempre', () => {
    const r = tacar(mataMataCom({ naMesa: todas, jogadores: TRIO }), { toca: 5, caem: [5] });
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    expect(Object.keys(r.partida).sort()).toEqual(Object.keys(mataMataCom({ naMesa: todas, jogadores: TRIO })).sort());
  });

  it('bola fora da mesa é falta sem pena: só a branca fora do jogo (e cegar, em cegar-mata-mata.test.ts) custa a vez', () => {
    const pulou = tacar(mataMataCom({ naMesa: todas, regras: { bolaForaDaMesa: 'falta' } }), { toca: 5, pulam: [7] });
    expect(pulou.consequencias.faltas).toEqual([{ nome: 'bola-fora' }]);
    expect(pulou.consequencias.texto).toBe('Bola fora da mesa! Falta sem pena. A 7 pulou da mesa. Vez de Beto.');
    expect(pulou.partida).not.toHaveProperty('perdemAProximaVez');
  });

  it('com "sem-pena" nada muda em relação ao mata-mata de antes: nem campo, nem pulo, nem frase nova', () => {
    const casa = { naMesa: todas, jogadores: TRIO, regras: SEM_PENA_NO_SUICIDIO };
    const r = tacar(mataMataCom(casa), CAI);
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    expect(r.consequencias.texto).toBe('Suicídio! Falta sem pena: branca na marca. Vez de Beto.');
    expect(jogar(mataMataCom(casa), CAI, CAI, CAI, CAI, CAI).vezes).toEqual([BETO, CAIO, ANA, BETO, CAIO]);
  });
});

describe('suicídio no mata-mata: 1×1', () => {
  it.each([
    ['a branca cai', CAI, 'Suicídio! Ana perde a próxima vez. Branca na marca. Vez de Beto.'],
    ['a branca sai da mesa', FORA, 'Bolão fora da mesa! Ana perde a próxima vez. Branca na marca. Vez de Beto.'],
  ])('%s: a vez passa a Beto, e quando voltaria a Ana ele joga outra vez', (_, tacada, frase) => {
    const suicidio = tacar(mataMataCom({ naMesa: todas }), tacada);
    expect(suicidio.consequencias).toMatchObject({
      proximo: BETO,
      texto: frase,
      retirar: [],
      recolocar: [{ bola: 0, lugar: 'marca-saida' }],
    });
    expect(suicidio.partida).toMatchObject({ vez: BETO, perdemAProximaVez: [ANA], fase: 'aberta' });
    expect(suicidio.partida.retiradas).toEqual([]);

    const seguinte = tacar(suicidio.partida);
    expect(seguinte.consequencias).toMatchObject({ proximo: BETO, texto: 'Beto não matou nenhuma. Ana perdeu a vez: joga Beto.' });
    expect(seguinte.partida.vez).toBe(BETO);
    expect(seguinte.partida, 'a pena foi cumprida: o campo sai').not.toHaveProperty('perdemAProximaVez');

    const terceira = tacar(seguinte.partida);
    expect(terceira.consequencias).toMatchObject({ proximo: ANA, texto: 'Beto não matou nenhuma. Vez de Ana.' });
    expect(terceira.partida).not.toHaveProperty('perdemAProximaVez');
  });

  it('o suicídio mata e pontua: a bola vale, a pena também', () => {
    const r = tacar(mataMataCom({ naMesa: todas }), { toca: 5, caem: [5], branca: 'cai' });
    expect(r.consequencias.texto).toBe('Suicídio! Ana perde a próxima vez. Branca na marca. Ana matou a 5 (+1). Vez de Beto.');
    expect(pontosPorEquipe(r.partida)).toEqual([1, 0]);
    expect(r.partida).toMatchObject({ vez: BETO, perdemAProximaVez: [ANA] });
  });

  it('cegar e suicídio na mesma tacada: as duas faltas na frase, uma pena só', () => {
    const r = tacar(mataMataCom({ naMesa: todas }), { branca: 'cai' });
    expect(r.consequencias.faltas).toEqual([{ nome: 'cegar' }, { nome: 'suicidio' }]);
    expect(r.consequencias.texto).toBe('Cegou e suicídio! Ana perde a próxima vez. Branca na marca. Vez de Beto.');
    expect(r.partida.perdemAProximaVez).toEqual([ANA]);
  });

  it('quem sofre a pena e depois joga a vez seguinte volta à roda normal (a pena vale uma vez só)', () => {
    const { vezes } = jogar(mataMataCom({ naMesa: todas }), CAI, ...sorteadas(5));
    expect(vezes).toEqual([BETO, BETO, ANA, BETO, ANA, BETO]);
  });

  it('o outro também comete suicídio: as duas penas se consomem e a vez cai em Ana', () => {
    const primeira = tacar(mataMataCom({ naMesa: todas }), CAI);
    const segunda = tacar(primeira.partida, CAI);
    expect(segunda.consequencias.texto).toBe(
      'Suicídio! Beto perde a próxima vez. Branca na marca. Ana e Beto perderam a vez: joga Ana.',
    );
    expect(segunda.partida).toMatchObject({ vez: ANA });
    expect(segunda.partida).not.toHaveProperty('perdemAProximaVez');
    expect(jogar(segunda.partida, ...sorteadas(3)).vezes).toEqual([BETO, ANA, BETO]);
  });

  it('suicídio na tacada de saída também vale', () => {
    const saida = novaPartida(configMataMata(), JOGADORES, rngDeTeste(1)).partida;
    const r = tacar(saida, CAI);
    expect(r.partida).toMatchObject({ fase: 'aberta', vez: BETO, perdemAProximaVez: [ANA] });
  });
});

describe('suicídio no mata-mata: 3 jogadores', () => {
  const trio = () => mataMataCom({ naMesa: todas, jogadores: TRIO });

  it('a vez passa a Beto como sempre; ao chegar em Ana, ela é pulada e joga Beto', () => {
    const { vezes } = jogar(trio(), CAI, ...sorteadas(5));
    expect(vezes).toEqual([BETO, CAIO, BETO, CAIO, ANA, BETO]);
  });

  it('a frase de quem passa a vez por cima de Ana diz quem perdeu e quem joga', () => {
    const { partida } = jogar(trio(), CAI, LIMPA);
    const r = tacar(partida);
    expect(r.consequencias.texto).toBe('Caio não matou nenhuma. Ana perdeu a vez: joga Beto.');
    expect(r.consequencias.proximo).toBe(BETO);
  });

  it('quem comete suicídio no meio da roda: Beto perde a vez dele na volta', () => {
    const { vezes, partida } = jogar(mataMataCom({ naMesa: todas, jogadores: TRIO, vez: BETO }), CAI);
    expect(vezes).toEqual([CAIO]);
    expect(partida.perdemAProximaVez).toEqual([BETO]);
    expect(jogar(partida, ...sorteadas(4)).vezes).toEqual([ANA, CAIO, ANA, BETO]);
  });

  it('dois suicídios seguidos de pessoas diferentes: o campo guarda os dois, em ordem crescente', () => {
    const ana = tacar(trio(), CAI);
    const beto = tacar(ana.partida, CAI);
    expect(beto.partida).toMatchObject({ vez: CAIO, perdemAProximaVez: [ANA, BETO] });
    expect(beto.consequencias.texto).toBe('Suicídio! Beto perde a próxima vez. Branca na marca. Vez de Caio.');

    // Caio joga; a roda volta a Ana e Beto, que perdem a vez, e Caio joga de novo.
    const caio = tacar(beto.partida);
    expect(caio.consequencias).toMatchObject({ proximo: CAIO, texto: 'Caio não matou nenhuma. Ana e Beto perderam a vez: joga Caio.' });
    expect(caio.partida).not.toHaveProperty('perdemAProximaVez');
    expect(jogar(caio.partida, ...sorteadas(3)).vezes).toEqual([ANA, BETO, CAIO]);
  });

  it('todos na lista: cada pulo gasta uma pena, a roda segue e não trava', () => {
    const { partida } = jogar(trio(), CAI, CAI);
    expect(partida.perdemAProximaVez).toEqual([ANA, BETO]);
    const caio = tacar(partida, CAI);
    expect(caio.consequencias.texto).toBe(
      'Suicídio! Caio perde a próxima vez. Branca na marca. Ana, Beto e Caio perderam a vez: joga Ana.',
    );
    expect(caio.partida).toMatchObject({ vez: ANA });
    expect(caio.partida).not.toHaveProperty('perdemAProximaVez');
    expect(jogar(caio.partida, ...sorteadas(4)).vezes).toEqual([BETO, CAIO, ANA, BETO]);
  });
});

describe('suicídio no mata-mata: 4 jogadores', () => {
  const quarteto = (vez = ANA) => mataMataCom({ naMesa: todas, jogadores: QUARTETO, vez });

  it('Beto comete suicídio no meio da roda: perde a vez dele na volta e só ele', () => {
    const { vezes, partida } = jogar(quarteto(BETO), CAI);
    expect(vezes).toEqual([CAIO]);
    expect(partida.perdemAProximaVez).toEqual([BETO]);
    expect(jogar(partida, ...sorteadas(6)).vezes).toEqual([DANI, ANA, CAIO, DANI, ANA, BETO]);
  });

  it('Dani, a última da roda, comete suicídio: perde a vez e a roda recomeça em Ana', () => {
    const { vezes, partida } = jogar(quarteto(DANI), CAI, ...sorteadas(4));
    expect(vezes).toEqual([ANA, BETO, CAIO, ANA, BETO]);
    expect(partida).not.toHaveProperty('perdemAProximaVez');
  });

  it('dois suicídios seguidos de pessoas diferentes: os dois são pulados na volta, na ordem da roda', () => {
    const dani = tacar(quarteto(DANI), CAI);
    const ana = tacar(dani.partida, CAI);
    expect(ana.partida).toMatchObject({ vez: BETO, perdemAProximaVez: [ANA, DANI] });
    expect(ana.consequencias.texto).toBe('Suicídio! Ana perde a próxima vez. Branca na marca. Vez de Beto.');

    const beto = tacar(ana.partida);
    expect(beto.partida, 'a roda ainda não chegou neles').toMatchObject({ vez: CAIO, perdemAProximaVez: [ANA, DANI] });
    const { vezes, partida } = jogar(beto.partida, LIMPA, LIMPA);
    expect(vezes).toEqual([BETO, CAIO]);
    expect(partida).not.toHaveProperty('perdemAProximaVez');
  });

  it('a frase do pulo duplo traz os nomes na ordem em que a roda os alcançou', () => {
    const dani = tacar(quarteto(DANI), CAI);
    const ana = tacar(dani.partida, CAI);
    const beto = tacar(ana.partida);
    const caio = tacar(beto.partida);
    expect(caio.consequencias).toMatchObject({ proximo: BETO, texto: 'Caio não matou nenhuma. Dani e Ana perderam a vez: joga Beto.' });
    expect(caio.partida).toMatchObject({ vez: BETO });
  });

  it('os quatro cometem suicídio em fila: no último a roda consome tudo e para em Ana', () => {
    const { partida } = jogar(quarteto(), CAI, CAI, CAI);
    expect(partida).toMatchObject({ vez: DANI, perdemAProximaVez: [ANA, BETO, CAIO] });
    const dani = tacar(partida, CAI);
    expect(dani.consequencias.texto).toBe(
      'Suicídio! Dani perde a próxima vez. Branca na marca. Ana, Beto, Caio e Dani perderam a vez: joga Ana.',
    );
    expect(dani.partida).toMatchObject({ vez: ANA });
    expect(dani.partida).not.toHaveProperty('perdemAProximaVez');
  });

  it('Dani comete suicídio logo antes de Ana, que já perdia a vez: Ana é pulada ali mesmo e só Dani fica na lista', () => {
    const { partida } = jogar(quarteto(), CAI, LIMPA, LIMPA);
    expect(partida).toMatchObject({ vez: DANI, perdemAProximaVez: [ANA] });
    const dani = tacar(partida, CAI);
    expect(dani.partida).toMatchObject({ vez: BETO, perdemAProximaVez: [DANI] });
    expect(dani.consequencias.texto).toBe('Suicídio! Dani perde a próxima vez. Branca na marca. Ana perdeu a vez: joga Beto.');
  });
});

describe('suicídio no mata-mata: a partida acaba', () => {
  const ultima = (extra: Partial<EstadoPartida> = {}): EstadoPartida => ({
    ...mataMataCom({ naMesa: [15], jogadores: TRIO, encacapadas: matou(0, numeros(1, 7), 1, numeros(8, 14)) }),
    ...extra,
  });

  it('suicídio na bola que esvazia a mesa: ninguém perde vez, a frase não promete uma próxima', () => {
    const r = tacar(ultima(), { toca: 15, caem: [15], branca: 'cai' });
    expect(r.partida).toMatchObject({ fase: 'fim', vencedor: ANA, vez: BETO });
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    expect(r.consequencias.texto).toBe('Suicídio! Falta sem pena: branca na marca. Ana matou a 15 (+1). Acabaram as bolas. Ana venceu com 8 pontos!');
  });

  it('a lista que existia fica de fora do estado final, e a roda da próxima não depende dela', () => {
    const r = tacar(ultima({ perdemAProximaVez: [CAIO] }), { toca: 15, caem: [15] });
    expect(r.partida.fase).toBe('fim');
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    expect(r.consequencias.proximo).toBe(BETO);

    const proxima = jogadoresDaProxima(r.partida);
    expect(proxima.map((j: Jogador) => j.nome)).toEqual(['Beto', 'Caio', 'Ana']);
    const { partida } = novaPartida(r.partida.config, proxima, rngDeTeste(2));
    expect(partida).not.toHaveProperty('perdemAProximaVez');
  });

  it('não se passa a vez depois do fim, com ou sem lista', () => {
    const { partida } = tacar(ultima(), { toca: 15, caem: [15] });
    expect(() => passarVez(partida)).toThrow(/terminou/);
  });
});

describe('suicídio no mata-mata: passarVez (tempo esgotado ou queda)', () => {
  it('a vez de Ana passa por tempo: Ana não ganha pena', () => {
    const r = passarVez(congelar(mataMataCom({ naMesa: todas, jogadores: TRIO })));
    expect(r).toMatchObject({ vez: BETO });
    expect(r).not.toHaveProperty('perdemAProximaVez');
    expect(jogar(r, ...sorteadas(3)).vezes).toEqual([CAIO, ANA, BETO]);
  });

  it('1×1: se Ana perde a próxima vez, passar a de Beto o devolve a Beto e gasta a pena', () => {
    const antes = congelar({ ...mataMataCom({ naMesa: todas, vez: BETO }), perdemAProximaVez: [ANA] });
    const depois = passarVez(antes);
    expect(depois, 'só a lista some, a vez fica em Beto').toEqual(mataMataCom({ naMesa: todas, vez: BETO }));
    expect(depois).not.toHaveProperty('perdemAProximaVez');
  });

  it('3 jogadores: a roda pula quem perde a vez e deixa a lista dos que não alcançou', () => {
    const base = mataMataCom({ naMesa: todas, jogadores: TRIO, vez: CAIO });
    expect(passarVez(congelar({ ...base, perdemAProximaVez: [ANA] }))).toMatchObject({ vez: BETO });
    expect(passarVez(congelar({ ...base, perdemAProximaVez: [ANA] }))).not.toHaveProperty('perdemAProximaVez');
    expect(passarVez(congelar({ ...base, perdemAProximaVez: [ANA, BETO] }))).toMatchObject({ vez: CAIO });
    expect(passarVez(congelar({ ...base, perdemAProximaVez: [ANA, BETO] }))).not.toHaveProperty('perdemAProximaVez');
  });

  it('4 jogadores: quem a roda não alcançou continua na lista', () => {
    const base = mataMataCom({ naMesa: todas, jogadores: QUARTETO, vez: ANA });
    expect(passarVez(congelar({ ...base, perdemAProximaVez: [CAIO, DANI] }))).toMatchObject({ vez: BETO, perdemAProximaVez: [CAIO, DANI] });
    const duasPenas = passarVez(congelar({ ...base, vez: BETO, perdemAProximaVez: [CAIO, DANI] }));
    expect(duasPenas.vez).toBe(ANA);
    expect(duasPenas).not.toHaveProperty('perdemAProximaVez');
  });

  it('passar a vez duas vezes seguidas anda a roda e só gasta a pena de quem é alcançado', () => {
    const base = congelar({ ...mataMataCom({ naMesa: todas, jogadores: TRIO, vez: BETO }), perdemAProximaVez: [ANA] });
    const primeira = passarVez(base);
    expect(primeira).toMatchObject({ vez: CAIO, perdemAProximaVez: [ANA] });
    const segunda = passarVez(congelar(primeira));
    expect(segunda).toMatchObject({ vez: BETO });
    expect(segunda).not.toHaveProperty('perdemAProximaVez');
  });

  it('não muda mais nada na partida', () => {
    const base = congelar({ ...mataMataCom({ naMesa: todas, jogadores: QUARTETO, vez: CAIO }), perdemAProximaVez: [ANA] });
    expect(passarVez(base), 'a roda não chega em Ana').toEqual({ ...base, vez: DANI });
    expect(passarVez({ ...base, vez: DANI }), 'chega e a pena se gasta').toEqual(mataMataCom({ naMesa: todas, jogadores: QUARTETO, vez: BETO }));
  });
});

describe('suicídio no mata-mata: o par ou ímpar não muda de forma', () => {
  it('Boteco: o estado depois de um suicídio é exatamente o de antes do L19 (nenhuma chave nova)', () => {
    const antes = congelar(partidaCom({ naMesa: [2, 3, 4, 5, 6, 7, 8] }));
    const { partida } = aplicarTacada(antes, eventos({ toca: 2, branca: 'cai' }));
    expect(partida).toEqual({
      config: antes.config,
      jogadores: JOGADORES,
      vez: BETO,
      grupos: ['par', 'impar'],
      fase: 'grupos',
      naMesa: [2, 4, 5, 6, 7, 8],
      encacapadas: matou(0, [9, 10, 11, 12, 13, 14]),
      retiradas: [3],
      vencedor: null,
    });
  });

  it('Boteco: nenhuma tacada de suicídio (1×1, 2×1, 2×2) nem passarVez escreve o campo', () => {
    for (const jogadores of [JOGADORES, DUPLAS]) {
      const antes = congelar(partidaCom({ naMesa: [2, 3, 4, 5, 6, 7, 8], jogadores }));
      for (const t of [{ toca: 2, branca: 'cai' }, { toca: 2, branca: 'fora' }, { toca: 3, branca: 'cai' }] as const) {
        const depois = aplicarTacada(antes, eventos(t)).partida;
        expect(depois, JSON.stringify(t)).not.toHaveProperty('perdemAProximaVez');
        expect(Object.keys(depois).sort()).toEqual(Object.keys(antes).sort());
      }
      expect(passarVez(antes)).not.toHaveProperty('perdemAProximaVez');
    }
  });

  it('Boteco: um estado com o campo (que as regras nunca escrevem ali) é ignorado pela roda do par ou ímpar', () => {
    const base = partidaCom({ naMesa: [2, 3, 4, 5, 6, 7, 8] });
    const sem = aplicarTacada(congelar(base), eventos({ toca: 2 })).partida;
    const com = aplicarTacada(congelar({ ...base, perdemAProximaVez: [BETO] }), eventos({ toca: 2 })).partida;
    expect(com.vez).toBe(sem.vez);
  });
});
