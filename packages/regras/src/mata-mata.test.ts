import { describe, expect, it } from 'vitest';
import {
  bolaDeCastigo,
  bolasAlvo,
  bolasDaCasa,
  bolasRestantes,
  grupoDaBola,
  jogadoresDaProxima,
  nomeDaBolaFinal,
  objetivo,
  pontosPorEquipe,
  rotuloDaFalta,
} from './leitura';
import { aplicarTacada, novaPartida, passarVez } from './partida';
import {
  ANA,
  BETO,
  CAIO,
  DANI,
  DUPLAS,
  JOGADORES,
  QUARTETO,
  TRIO,
  SEM_PENA_NAS_FALTAS,
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
import type { EstadoPartida, Jogador } from './tipos';

const todas = numeros(1, 15);
const sem = (...bolas: number[]) => todas.filter((b) => !bolas.includes(b));

/** Uma tacada de quem tem a vez numa partida congelada; confere a pureza. */
function tacar(partida: EstadoPartida, t: Tacada = {}) {
  const antes = congelar(partida);
  const evs = congelar(eventos(t));
  const r = aplicarTacada(antes, evs);
  expect(aplicarTacada(antes, evs), 'pura').toEqual(r);
  expect(r.partida.vez).toBe(r.consequencias.proximo);
  expect(r.partida.vencedor).toBe(r.consequencias.vencedor);
  return r;
}

describe('mata-mata: novaPartida', () => {
  it.each([JOGADORES, TRIO, QUARTETO].map((j) => [j.length, j] as const))('%i jogadores: as 15 bolas, sem grupos, cada um na sua equipe, quem entrou primeiro sai', (n, jogadores) => {
    const { partida, arrumacao } = novaPartida(configMataMata(), jogadores, rngDeTeste(1));
    expect(partida).toEqual<EstadoPartida>({
      config: configMataMata(),
      jogadores,
      vez: 0,
      grupos: Array.from({ length: n }, () => null),
      fase: 'saida',
      naMesa: todas,
      encacapadas: [],
      retiradas: [],
      vencedor: null,
    });
    expect([...arrumacao].sort((a, b) => a - b)).toEqual(todas);
  });

  it('o rng embaralha o triângulo de 15, e não há bola final no meio', () => {
    const ordem = (s: number) => novaPartida(configMataMata(), TRIO, rngDeTeste(s)).arrumacao;
    expect(ordem(3)).toEqual(ordem(3));
    expect(ordem(3)).not.toEqual(ordem(4));
    expect(new Set(Array.from({ length: 20 }, (_, s) => ordem(s + 1)[4])).size).toBeGreaterThan(5);
  });

  it('aceita a roda girada por jogadoresDaProxima: a equipe de cada um não depende da posição', () => {
    const [ana, beto, caio] = TRIO as [Jogador, Jogador, Jogador];
    expect(() => novaPartida(configMataMata(), [beto, caio, ana], rngDeTeste(1))).not.toThrow();
  });

  it('recusa o que a modalidade não aceita, dizendo o que aceita', () => {
    const [ana, beto, caio, dani] = QUARTETO as [Jogador, Jogador, Jogador, Jogador];
    const config = configMataMata();
    const aceita = /aceita 1×1, 1×1×1, 1×1×1×1$/;
    expect(() => novaPartida(config, [ana], rngDeTeste(1))).toThrow(/o Mata-mata não aceita 1 jogador;/);
    expect(() => novaPartida(config, [ana], rngDeTeste(1))).toThrow(aceita);
    expect(() => novaPartida(config, [], rngDeTeste(1))).toThrow(/o Mata-mata não aceita 0 jogadores;/);
    const cinco = [ana, beto, caio, dani, { id: 'e', nome: 'Edu', equipe: 4 }];
    expect(() => novaPartida(config, cinco, rngDeTeste(1))).toThrow(/o Mata-mata não aceita 5 jogadores em 1×1×1×1×1;/);
    expect(() => novaPartida(config, cinco, rngDeTeste(1))).toThrow(aceita);
  });

  it('recusa duplas e equipes repetidas ou fora de 0 a N−1', () => {
    const [ana, beto, caio, dani] = QUARTETO as [Jogador, Jogador, Jogador, Jogador];
    const config = configMataMata();
    const e = (j: Jogador, equipe: number) => ({ ...j, equipe });
    expect(() => novaPartida(config, [ana, beto, e(caio, 0)], rngDeTeste(1))).toThrow(/cada jogador fica na sua equipe, de 0 a 2/);
    expect(() => novaPartida(config, [ana, beto, e(caio, 0), e(dani, 1)], rngDeTeste(1))).toThrow(/de 0 a 3/);
    expect(() => novaPartida(config, [ana, e(beto, 0)], rngDeTeste(1))).toThrow(/de 0 a 1/);
    expect(() => novaPartida(config, [ana, e(beto, 2)], rngDeTeste(1))).toThrow(/de 0 a 1/);
    expect(() => novaPartida(config, [ana, e(beto, -1)], rngDeTeste(1))).toThrow(/de 0 a 1/);
    expect(() => novaPartida(config, [ana, e(beto, 0.5)], rngDeTeste(1))).toThrow(/de 0 a 1/);
    expect(() => novaPartida(config, [ana, e(beto, Number.NaN)], rngDeTeste(1))).toThrow(/de 0 a 1/);
  });

  it('recusa id repetido', () => {
    const [ana, beto] = JOGADORES as [Jogador, Jogador];
    expect(() => novaPartida(configMataMata(), [ana, { ...beto, id: 'a' }], rngDeTeste(1))).toThrow(/id/);
  });

  it('recusa config que não é de mata-mata: outras bolas ou bola final', () => {
    expect(() => novaPartida(configMataMata({ bolas: '2-14' }), TRIO, rngDeTeste(1))).toThrow(/15 bolas/);
    expect(() => novaPartida(configMataMata({ bolaFinal: 8 }), TRIO, rngDeTeste(1))).toThrow(/nenhuma bola final|não tem bola final/);
  });
});

describe('mata-mata: a vez', () => {
  it.each([JOGADORES, TRIO, QUARTETO].map((j) => [j.length, j] as const))('%i jogadores: a vez anda um na roda a cada tacada, mate ou não, e volta ao primeiro', (n, jogadores) => {
    let partida = novaPartida(configMataMata(), jogadores, rngDeTeste(1)).partida;
    const vistos: number[] = [];
    for (let k = 0; k < 3 * n; k++) {
      vistos.push(partida.vez);
      const bola = partida.naMesa[0]!;
      partida = tacar(partida, k % 2 === 0 ? { toca: bola, caem: [bola] } : { toca: bola }).partida;
      expect(partida, 'a roda não precisa de memória').not.toHaveProperty('vezDaRoda');
      expect(partida).not.toHaveProperty('proximoDaRoda');
    }
    expect(vistos).toEqual(Array.from({ length: 3 * n }, (_, k) => k % n));
  });

  it('encaçapar não segura a vez, nem a saída nem depois dela', () => {
    const saida = novaPartida(configMataMata(), TRIO, rngDeTeste(1)).partida;
    const r = tacar(saida, { toca: 5, caem: [5, 9] });
    expect(r.partida).toMatchObject({ vez: BETO, fase: 'aberta' });
    expect(tacar(r.partida, { toca: 2, caem: [2] }).partida).toMatchObject({ vez: CAIO, fase: 'aberta' });
  });

  it('tacada sem bola passa a vez, e a última da roda devolve ao primeiro', () => {
    expect(tacar(mataMataCom({ naMesa: todas, jogadores: TRIO, vez: CAIO }), { toca: 4 }).partida.vez).toBe(ANA);
    expect(tacar(mataMataCom({ naMesa: todas, jogadores: QUARTETO, vez: DANI }), { toca: 4, caem: [4] }).partida.vez).toBe(ANA);
  });
});

describe('mata-mata: pontos', () => {
  it('cada bola encaçapada vale 1 ponto para quem tacou, inclusive na saída', () => {
    const saida = novaPartida(configMataMata(), TRIO, rngDeTeste(1)).partida;
    const r = tacar(saida, { toca: 3, caem: [3, 7, 12] });
    expect(r.partida.encacapadas).toEqual(matou(0, [3, 7, 12]));
    expect(pontosPorEquipe(r.partida)).toEqual([3, 0, 0]);
    expect(r.partida.naMesa).toEqual(sem(3, 7, 12));
    expect(r.consequencias.texto).toBe('Ana matou a 3, a 7 e a 12 (+3). Vez de Beto.');
  });

  it('o ponto vai para quem tacou, na ordem em que a bola caiu', () => {
    let partida = mataMataCom({ naMesa: todas, jogadores: QUARTETO });
    for (const caem of [[1], [], [2, 3], [4], [5]]) partida = tacar(partida, { toca: partida.naMesa[0]!, caem }).partida;
    expect(partida.encacapadas).toEqual(matou(0, [1], 2, [2, 3], 3, [4], 0, [5]));
    expect(pontosPorEquipe(partida)).toEqual([2, 0, 2, 1]);
  });

  it('a tacada com falta também pontua', () => {
    const r = tacar(mataMataCom({ naMesa: todas }), { toca: 5, caem: [5], branca: 'cai' });
    expect(pontosPorEquipe(r.partida)).toEqual([1, 0]);
    expect(r.consequencias.faltas).toEqual([{ nome: 'suicidio' }]);
    expect(r.partida.naMesa).toEqual(sem(5));
  });

  it('bola que só bate na caçapa e volta não pontua', () => {
    const r = tacar(mataMataCom({ naMesa: todas }), { toca: 5, batem: [5] });
    expect(pontosPorEquipe(r.partida)).toEqual([0, 0]);
    expect(r.partida.naMesa).toEqual(todas);
  });

  it('bola fora da lista da mesa não pode cair', () => {
    expect(() => tacar(mataMataCom({ naMesa: sem(9) }), { toca: 5, caem: [9] })).toThrow(/9/);
    expect(() => tacar(mataMataCom({ naMesa: todas }), { toca: 5, caem: [16] })).toThrow(/16/);
  });
});

describe('mata-mata: falta sem pena (suicidioNoMataMata e cegarNoMataMata "sem-pena", a casa de antes do L19)', () => {
  const SEM_PENA = { naMesa: todas, regras: SEM_PENA_NAS_FALTAS };

  it('cegar: só passa a vez, nada sai da mesa', () => {
    const antes = mataMataCom(SEM_PENA);
    const r = tacar(antes);
    expect(r.consequencias).toEqual({
      faltas: [{ nome: 'cegar' }],
      retirar: [],
      recolocar: [],
      proximo: BETO,
      vencedor: null,
      texto: 'Cegou! Falta sem pena. Vez de Beto.',
    });
    expect(r.partida).toEqual({ ...antes, vez: BETO });
  });

  it('suicídio: a branca volta à marca de saída, e o próximo joga com ela lá', () => {
    const r = tacar(mataMataCom(SEM_PENA), { toca: 5, branca: 'cai' });
    expect(r.consequencias).toEqual({
      faltas: [{ nome: 'suicidio' }],
      retirar: [],
      recolocar: [{ bola: 0, lugar: 'marca-saida' }],
      proximo: BETO,
      vencedor: null,
      texto: 'Suicídio! Falta sem pena: branca na marca. Vez de Beto.',
    });
    expect(r.partida.retiradas).toEqual([]);
    expect(r.partida.naMesa).toEqual(todas);
  });

  it('bolão fora da mesa: também volta à marca de saída', () => {
    const r = tacar(mataMataCom(SEM_PENA), { toca: 5, branca: 'fora' });
    expect(r.consequencias.faltas).toEqual([{ nome: 'branca-fora' }]);
    expect(r.consequencias.recolocar).toEqual([{ bola: 0, lugar: 'marca-saida' }]);
    expect(r.consequencias.texto).toBe('Bolão fora da mesa! Falta sem pena: branca na marca. Vez de Beto.');
  });

  it('suicídio matando: a bola vale e a frase diz as duas coisas', () => {
    const r = tacar(mataMataCom(SEM_PENA), { toca: 5, caem: [5], branca: 'cai' });
    expect(r.consequencias.texto).toBe('Suicídio! Falta sem pena: branca na marca. Ana matou a 5 (+1). Vez de Beto.');
    expect(r.consequencias.retirar).toEqual([]);
  });

  it('duas faltas juntas: os dois nomes, uma pena (nenhuma)', () => {
    const r = tacar(mataMataCom(SEM_PENA), { branca: 'cai' });
    expect(r.consequencias.faltas).toEqual([{ nome: 'cegar' }, { nome: 'suicidio' }]);
    expect(r.consequencias.texto).toBe('Cegou e suicídio! Falta sem pena: branca na marca. Vez de Beto.');
  });

  it('tocar qualquer bola primeiro vale: não há direta nem castigo fora de hora', () => {
    for (const toca of [1, 8, 15]) expect(tacar(mataMataCom({ naMesa: todas }), { toca }).consequencias.faltas, `a ${toca}`).toEqual([]);
    expect(tacar(mataMataCom({ naMesa: todas }), { toca: [3, 4] }).consequencias.faltas).toEqual([]);
  });

  it('a numerada que pula volta ao centro, sem falta, e não conta ponto', () => {
    const r = tacar(mataMataCom({ naMesa: todas }), { toca: 5, pulam: [7] });
    expect(r.consequencias.faltas).toEqual([]);
    expect(r.consequencias.recolocar).toEqual([{ bola: 7, lugar: 'centro-mesa' }]);
    expect(r.partida.naMesa).toEqual(todas);
    expect(pontosPorEquipe(r.partida)).toEqual([0, 0]);
    expect(r.consequencias.texto).toBe('Ana não matou nenhuma. A 7 pulou da mesa. Vez de Beto.');
  });

  it('com bolaForaDaMesa "falta" a que pula é falta reconhecida, também sem pena', () => {
    const r = tacar(mataMataCom({ naMesa: todas, regras: { bolaForaDaMesa: 'falta' } }), { toca: 5, pulam: [7, 9] });
    expect(r.consequencias).toMatchObject({
      faltas: [{ nome: 'bola-fora' }],
      retirar: [],
      recolocar: [
        { bola: 7, lugar: 'centro-mesa' },
        { bola: 9, lugar: 'centro-mesa' },
      ],
      texto: 'Bola fora da mesa! Falta sem pena. A 7 e a 9 pularam da mesa. Vez de Beto.',
    });
    expect(r.partida.retiradas).toEqual([]);
  });

  it('as recolocações vêm na ordem: as que pularam e, por último, a branca', () => {
    const r = tacar(mataMataCom({ naMesa: todas }), { toca: 5, pulam: [7], branca: 'cai' });
    expect(r.consequencias.recolocar).toEqual([
      { bola: 7, lugar: 'centro-mesa' },
      { bola: 0, lugar: 'marca-saida' },
    ]);
  });

  it('a numerada que pula na saída também volta, sem a regra da bola final', () => {
    const saida = novaPartida(configMataMata(), TRIO, rngDeTeste(1)).partida;
    const r = tacar(saida, { toca: 5, pulam: [8] });
    expect(r.consequencias.recolocar).toEqual([{ bola: 8, lugar: 'centro-mesa' }]);
    expect(r.partida.naMesa).toEqual(todas);
  });
});

describe('mata-mata: fim da partida', () => {
  it('quando não sobra bola na mesa a partida acaba; ganha quem tem mais pontos', () => {
    const antes = mataMataCom({ naMesa: [15], encacapadas: matou(0, [1, 2, 3, 4, 5, 6, 7], 1, [8, 9, 10, 11, 12, 13, 14]) });
    const r = tacar(antes, { toca: 15, caem: [15] });
    expect(r.partida).toMatchObject({ fase: 'fim', vencedor: ANA, naMesa: [] });
    expect(pontosPorEquipe(r.partida)).toEqual([8, 7]);
    expect(r.consequencias).toMatchObject({
      vencedor: ANA,
      proximo: BETO,
      texto: 'Ana matou a 15 (+1). Acabaram as bolas. Ana venceu com 8 pontos!',
    });
  });

  it('vence quem tem mais pontos, mesmo não tendo matado a última', () => {
    const antes = mataMataCom({ naMesa: [15], vez: BETO, encacapadas: matou(0, [1, 2, 3, 4, 5, 6, 7, 8], 1, [9, 10, 11, 12, 13, 14]) });
    const r = tacar(antes, { toca: 15, caem: [15] });
    expect(pontosPorEquipe(r.partida)).toEqual([8, 7]);
    expect(r.partida.vencedor).toBe(ANA);
    expect(r.consequencias.texto).toBe('Beto matou a 15 (+1). Acabaram as bolas. Ana venceu com 8 pontos!');
  });

  it('a mesa esvazia de uma vez: tudo vale ponto de quem tacou', () => {
    const r = tacar(mataMataCom({ naMesa: [4, 9, 15], encacapadas: matou(0, [1, 2, 3], 1, [5, 6, 7, 8, 10, 11, 12, 13, 14]), vez: BETO }), { toca: 4, caem: [4, 9, 15] });
    expect(pontosPorEquipe(r.partida)).toEqual([3, 12]);
    expect(r.consequencias.texto).toBe('Beto matou a 4, a 9 e a 15 (+3). Acabaram as bolas. Beto venceu com 12 pontos!');
  });

  it('empate entre dois, o terceiro atrás: ganha quem encaçapou bola por último entre os dois', () => {
    // Ana 6 (1-5 e 12), Beto 6 (6-11), Caio 3 (13, 14, 15): Beto matou antes, Ana por último entre os empatados.
    const ordem = matou(0, [1, 2, 3, 4, 5], 1, [6, 7, 8, 9, 10, 11], 0, [12], 2, [13, 14]);
    const r = tacar(mataMataCom({ naMesa: [15], jogadores: TRIO, vez: CAIO, encacapadas: ordem }), { toca: 15, caem: [15] });
    expect(pontosPorEquipe(r.partida)).toEqual([6, 6, 3]);
    expect(r.partida).toMatchObject({ fase: 'fim', vencedor: ANA });
    expect(r.consequencias.texto).toBe('Caio matou a 15 (+1). Acabaram as bolas. Ana e Beto empataram com 6 pontos; Ana matou por último e venceu!');

    // O mesmo placar, com Beto matando por último entre os dois: Beto vence.
    const outra = matou(1, [1, 2, 3, 4, 5], 0, [6, 7, 8, 9, 10, 11], 1, [12], 2, [13, 14]);
    const r2 = tacar(mataMataCom({ naMesa: [15], jogadores: TRIO, vez: CAIO, encacapadas: outra }), { toca: 15, caem: [15] });
    expect(pontosPorEquipe(r2.partida)).toEqual([6, 6, 3]);
    expect(r2.partida.vencedor).toBe(BETO);
  });

  it('empate entre todos: ganha quem matou a última bola da partida', () => {
    const antes = mataMataCom({ naMesa: [15], jogadores: TRIO, vez: CAIO, encacapadas: matou(0, [1, 2, 3, 4, 5], 1, [6, 7, 8, 9, 10], 2, [11, 12, 13, 14]) });
    const r = tacar(antes, { toca: 15, caem: [15] });
    expect(pontosPorEquipe(r.partida)).toEqual([5, 5, 5]);
    expect(r.partida.vencedor).toBe(CAIO);
    expect(r.consequencias.texto).toBe('Caio matou a 15 (+1). Acabaram as bolas. Ana, Beto e Caio empataram com 5 pontos; Caio matou por último e venceu!');
  });

  it('empate de quatro: o último a matar entre os três empatados, não o quarto', () => {
    // Ana 4, Beto 4, Caio 4, Dani 3. Dani mata a última, mas Caio foi o último dos empatados.
    const ordem = matou(0, [1, 2, 3, 4], 1, [5, 6, 7, 8], 2, [9, 10, 11, 12], 3, [13, 14]);
    const r = tacar(mataMataCom({ naMesa: [15], jogadores: QUARTETO, vez: DANI, encacapadas: ordem }), { toca: 15, caem: [15] });
    expect(pontosPorEquipe(r.partida)).toEqual([4, 4, 4, 3]);
    expect(r.partida.vencedor).toBe(CAIO);
  });

  it('o desempate conta as bolas da tacada final: quem empata matando as duas últimas vence', () => {
    // Caio tinha 4 contra os 6 de Ana; com a 14 e a 15 empata em 6 e, por ter matado por último, vence.
    const ordem = matou(0, [1, 2, 3, 4, 5, 6], 2, [7, 8, 9, 10], 1, [11, 12, 13]);
    const r = tacar(mataMataCom({ naMesa: [14, 15], jogadores: TRIO, vez: CAIO, encacapadas: ordem }), { toca: 14, caem: [14, 15] });
    expect(pontosPorEquipe(r.partida)).toEqual([6, 3, 6]);
    expect(r.partida.vencedor).toBe(CAIO);
  });

  it('com a última bola entra também a branca: a falta não tira a vitória nem o ponto', () => {
    const antes = mataMataCom({ naMesa: [15], encacapadas: matou(0, [1, 2, 3, 4, 5, 6, 7], 1, [8, 9, 10, 11, 12, 13, 14]) });
    const r = tacar(antes, { toca: 15, caem: [15], branca: 'cai' });
    expect(r.partida.vencedor).toBe(ANA);
    expect(r.consequencias.faltas).toEqual([{ nome: 'suicidio' }]);
    expect(r.consequencias.retirar).toEqual([]);
    expect(r.consequencias.texto).toBe('Suicídio! Falta sem pena: branca na marca. Ana matou a 15 (+1). Acabaram as bolas. Ana venceu com 8 pontos!');
  });

  it('a última bola que pula da mesa não acaba a partida: ela volta', () => {
    const antes = mataMataCom({ naMesa: [15], encacapadas: matou(0, [1, 2, 3, 4, 5, 6, 7], 1, [8, 9, 10, 11, 12, 13, 14]) });
    const r = tacar(antes, { toca: 15, pulam: [15] });
    expect(r.partida).toMatchObject({ fase: 'aberta', vencedor: null, naMesa: [15], vez: BETO });
    expect(r.consequencias.recolocar).toEqual([{ bola: 15, lugar: 'centro-mesa' }]);
  });

  it('um ponto só se diz no singular', () => {
    const r = tacar(mataMataCom({ naMesa: [15], encacapadas: [] }), { toca: 15, caem: [15] });
    expect(r.consequencias.texto).toBe('Ana matou a 15 (+1). Acabaram as bolas. Ana venceu com 1 ponto!');
  });

  it('depois do fim não há mais tacada nem vez a passar', () => {
    const antes = mataMataCom({ naMesa: [15], encacapadas: matou(0, [1, 2, 3, 4, 5, 6, 7], 1, [8, 9, 10, 11, 12, 13, 14]) });
    const { partida } = tacar(antes, { toca: 15, caem: [15] });
    expect(() => aplicarTacada(partida, eventos({ toca: 1 }))).toThrow(/terminou/);
    expect(() => passarVez(partida)).toThrow(/terminou/);
    expect(bolasAlvo(partida)).toEqual([]);
  });
});

describe('mata-mata: a próxima partida', () => {
  const acabada = (jogadores: readonly Jogador[]): EstadoPartida => {
    const encacapadas = matou(0, numeros(1, 14));
    const antes = mataMataCom({ naMesa: [15], jogadores, vez: ANA, encacapadas });
    return tacar(antes, { toca: 15, caem: [15] }).partida;
  };

  it.each([JOGADORES, TRIO, QUARTETO].map((j) => [j.length, j] as const))('%i jogadores: sai o próximo da roda depois de quem saiu nesta, sem renumerar equipes', (n, jogadores) => {
    const fim = acabada(jogadores);
    expect(fim.vez).toBe(1);
    const proxima = jogadoresDaProxima(fim);
    expect(proxima).toEqual([...jogadores.slice(1), jogadores[0]]);
    expect(proxima.map((j) => j.equipe)).toEqual([...jogadores.slice(1), jogadores[0]!].map((j) => j.equipe));
    const { partida } = novaPartida(fim.config, proxima, rngDeTeste(2));
    expect(partida.jogadores[partida.vez]).toBe(jogadores[1]);
    expect(partida.grupos).toHaveLength(n);
  });

  it('três partidas seguidas: cada um sai uma vez, e na quarta volta o primeiro', () => {
    let jogadores: readonly Jogador[] = TRIO;
    const saiu: string[] = [];
    for (let k = 0; k < 4; k++) {
      let partida = novaPartida(configMataMata(), jogadores, rngDeTeste(k + 1)).partida;
      saiu.push(partida.jogadores[partida.vez]!.nome);
      partida = tacar({ ...partida, naMesa: [15], encacapadas: matou(0, numeros(1, 14)), fase: 'aberta' }, { toca: 15, caem: [15] }).partida;
      jogadores = jogadoresDaProxima(partida);
    }
    expect(saiu).toEqual(['Ana', 'Beto', 'Caio', 'Ana']);
  });

  it('antes do fim não há próxima', () => {
    expect(() => jogadoresDaProxima(mataMataCom({ naMesa: todas }))).toThrow(/ainda não terminou/);
  });
});

describe('mata-mata: passarVez (o jogador caiu da sala)', () => {
  it.each([JOGADORES, TRIO, QUARTETO].map((j) => [j.length, j] as const))('%i jogadores: a vez anda um, sem tacada, e volta ao primeiro', (n, jogadores) => {
    let partida = mataMataCom({ naMesa: todas, jogadores });
    const vistos: number[] = [];
    for (let k = 0; k < 2 * n; k++) {
      vistos.push(partida.vez);
      const depois = passarVez(congelar(partida));
      expect({ ...depois, vez: 0 }, 'só a vez muda').toEqual({ ...partida, vez: 0 });
      partida = depois;
    }
    expect(vistos).toEqual(Array.from({ length: 2 * n }, (_, k) => k % n));
  });

  it('na saída segue na saída; depois dela, aberta', () => {
    const saida = novaPartida(configMataMata(), TRIO, rngDeTeste(1)).partida;
    expect(passarVez(saida)).toMatchObject({ vez: BETO, fase: 'saida' });
    expect(passarVez(mataMataCom({ naMesa: todas, jogadores: TRIO }))).toMatchObject({ vez: BETO, fase: 'aberta' });
  });

  it('quem caiu e volta a tempo taca normalmente: a vez dele só passou', () => {
    const r = tacar(passarVez(mataMataCom({ naMesa: todas, jogadores: TRIO })), { toca: 5, caem: [5] });
    expect(r.partida.encacapadas).toEqual(matou(1, [5]));
    expect(r.partida.vez).toBe(CAIO);
  });
});

describe('mata-mata: leitura', () => {
  const partida = mataMataCom({ naMesa: sem(3, 8), jogadores: TRIO, encacapadas: matou(0, [3], 1, [8]) });

  it('sem grupos: nenhuma bola é de grupo, não há bola final nem castigo', () => {
    for (const bola of [0, ...todas]) expect(grupoDaBola(bola, partida.config), `a ${bola}`).toBeNull();
    expect(bolaDeCastigo(partida.config)).toBeNull();
    expect(nomeDaBolaFinal(partida.config)).toBeNull();
    expect(bolasDaCasa(partida.config)).toEqual(todas);
    expect(rotuloDaFalta('castigo-fora-de-hora', partida.config)).toBe('Castigo fora de hora');
    expect(rotuloDaFalta('cegar', partida.config)).toBe('Cegou');
  });

  it('o objetivo é qualquer bola, para todos e em todas as fases', () => {
    for (const fase of ['saida', 'aberta'] as const) {
      const p = mataMataCom({ naMesa: todas, jogadores: QUARTETO, fase });
      for (let i = 0; i < 4; i++) expect(objetivo(p, i)).toBe('qualquer');
    }
    expect(bolasRestantes(partida, ANA)).toEqual([]);
  });

  it('as bolas alvo são todas as que estão na mesa, para qualquer jogador, inclusive a 8', () => {
    for (let i = 0; i < 3; i++) expect(bolasAlvo(partida, i)).toEqual(sem(3, 8));
    expect(bolasAlvo(mataMataCom({ naMesa: todas, fase: 'saida' }))).toEqual(todas);
    expect(bolasAlvo(mataMataCom({ naMesa: [12, 4, 9] }))).toEqual([4, 9, 12]);
  });

  it('o pedaço da config sem modalidade segue sendo o par ou ímpar', () => {
    expect(grupoDaBola(3, { bolas: '2-14', bolaFinal: 8 })).toBe('impar');
    expect(grupoDaBola(8, { bolas: '2-14', bolaFinal: 8 })).toBeNull();
    expect(bolaDeCastigo({ bolaFinal: 8 })).toBe(8);
    expect(nomeDaBolaFinal({ bolaFinal: 8 })).toBe('a 8');
  });

  it('pontosPorEquipe no par ou ímpar: uma conta por equipe (duas), não por jogador', () => {
    const duplas = { ...partidaCom({ naMesa: [8], jogadores: DUPLAS, vez: CAIO }), encacapadas: matou(2, [3, 5], 3, [4], 1, [2], 0, [6, 7]) };
    expect(pontosPorEquipe(duplas)).toEqual([4, 2]);
  });

  it('pontosPorEquipe: uma conta por equipe, com zero para quem ainda não matou', () => {
    expect(pontosPorEquipe(partida)).toEqual([1, 1, 0]);
    expect(pontosPorEquipe(mataMataCom({ naMesa: todas, jogadores: QUARTETO }))).toEqual([0, 0, 0, 0]);
    expect(pontosPorEquipe(mataMataCom({ naMesa: sem(1, 2, 3), jogadores: QUARTETO, encacapadas: matou(3, [1, 2, 3]) }))).toEqual([0, 0, 0, 3]);
  });
});
