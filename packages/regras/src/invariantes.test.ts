import type { IdBola, Rng } from '@sinuca/fisica';
import { describe, expect, it } from 'vitest';
import { bolaDeCastigo, bolasAlvo, bolasDaCasa, grupoDaBola, jogadoresDaProxima } from './leitura';
import { aplicarTacada, novaPartida, passarVez } from './partida';
import {
  ANA,
  BETO,
  CASTIGO_1,
  DOIS_CONTRA_UM,
  DUPLAS,
  JOGADORES,
  SEM_FINAL,
  UM_CONTRA_DOIS,
  config,
  congelar,
  eventos,
  rngDeTeste,
  type Tacada,
} from './para-testes';
import type { ConfigRegras, EstadoPartida, FasePartida, Jogador, NomeFalta, ResultadoRegras } from './tipos';

const sorteio = (rng: Rng, p: number) => rng.proximo() < p;

function embaralhar<T>(lista: readonly T[], rng: Rng): T[] {
  const r = [...lista];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng.proximo() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

/** Tacada qualquer, mas fisicamente possível: só bolas da mesa (na saída, sem a bola final que ainda não entrou); sem toque, nada cai. */
function tacadaAoAcaso(partida: EstadoPartida, rng: Rng): Tacada {
  const castigo = bolaDeCastigo(partida.config);
  const foraNaSaida = partida.fase === 'saida' && partida.config.castigoInicio === 'depois-da-saida';
  const mesa = partida.naMesa.filter((b) => !foraNaSaida || b !== castigo);
  if (sorteio(rng, 0.12)) return { branca: sorteio(rng, 0.3) ? 'cai' : undefined };
  const ordem = embaralhar(mesa, rng);
  const toca = sorteio(rng, 0.1) ? ordem.slice(0, 2) : ordem.slice(0, 1);
  const caem = embaralhar(mesa, rng).filter(() => sorteio(rng, 0.15));
  const pulam = mesa.filter((b) => !caem.includes(b) && sorteio(rng, 0.02));
  const branca = sorteio(rng, 0.1) ? 'cai' : sorteio(rng, 0.03) ? 'fora' : undefined;
  return { toca, caem, pulam, branca };
}

const ordenado = (l: readonly number[]) => [...l].sort((a, b) => a - b);

/** As invariantes da skill sinuca-regras, conferidas depois de cada tacada. */
function conferir(antes: EstadoPartida, depois: ResultadoRegras): void {
  const { partida: p, consequencias: c } = depois;
  const todas = [...p.naMesa, ...p.encacapadas.map((e) => e.bola), ...p.retiradas];
  expect(ordenado(todas), 'conservação: mesa + encaçapadas + retiradas = config').toEqual(bolasDaCasa(p.config));
  expect(p.naMesa).toEqual(ordenado(p.naMesa));

  expect(p.jogadores).toBe(antes.jogadores);
  expect(p.vez).toBe(c.proximo);
  expect(p.vencedor).toBe(c.vencedor);
  expect(p.fase === 'fim').toBe(p.vencedor !== null);
  if (p.vencedor === null) conferirRoda(antes, p);
  for (const e of p.encacapadas) {
    if (!antes.encacapadas.some((a) => a.bola === e.bola)) expect(e.jogador, 'a bola que caiu é de quem tacou').toBe(antes.vez);
  }

  const [g0, g1] = p.grupos;
  if (g0 === null || g1 === null) expect([g0, g1]).toEqual([null, null]);
  else expect(g0).not.toBe(g1);
  if (antes.grupos[0] !== null) expect(p.grupos).toEqual(antes.grupos);

  const faltoso = p.grupos[antes.jogadores[antes.vez]!.equipe];
  for (const b of c.retirar) {
    expect(antes.naMesa).toContain(b);
    expect(p.retiradas).toContain(b);
    expect(grupoDaBola(b, p.config), 'a pena nunca tira bola do faltoso').not.toBe(faltoso);
    expect(b, 'a pena nunca tira a bola final').not.toBe(bolaDeCastigo(p.config));
  }
  if (c.retirar.length > 0) expect(c.faltas.length).toBeGreaterThan(0);
  for (const r of c.recolocar) if (r.bola !== 0) expect(p.naMesa).toContain(r.bola);

  if (p.config.bolaForaDaMesa === 'sem-falta') expect(c.faltas.map((f) => f.nome)).not.toContain('bola-fora');
  const semFinal = bolaDeCastigo(p.config) === null;
  if (semFinal && p.vencedor === null) {
    for (const g of p.grupos) if (g !== null) expect(p.naMesa.some((b) => grupoDaBola(b, p.config) === g), 'sem bola final: grupo vazio encerra').toBe(true);
  }
  if (!semFinal && p.vencedor === null) expect(p.naMesa, 'a bola final só sai da mesa no fim').toContain(bolaDeCastigo(p.config));
  const equipe = antes.jogadores[antes.vez]!.equipe;
  if (semFinal && p.config.ultimaPorPenaOuAdversario === 'volta' && p.vencedor !== null) {
    const suicidio = c.faltas.some((f) => f.nome === 'suicidio');
    if (!suicidio) expect(p.vencedor, 'com "volta", só vence quem encaçapa a última').toBe(equipe);
  }
}

const equipeDe = (p: EstadoPartida, i: number) => p.jogadores[i]!.equipe;
const daRoda = (p: EstadoPartida) => p.vezDaRoda ?? p.vez;
/** Índices dos jogadores da equipe, na ordem em que entraram (a de `jogadores`). */
const membros = (p: EstadoPartida, equipe: number) => p.jogadores.flatMap((j, i) => (j.equipe === equipe ? [i] : []));
const equipesIguais = (p: EstadoPartida) => membros(p, 0).length === membros(p, 1).length;

/**
 * Uma vez, de um jogador; a roda só anda quando a equipe perde a mesa, e o parceiro só taca com `quemContinua: 'parceiro'`.
 * Com equipes iguais a roda é a ordem de `jogadores`; com equipes desiguais (2×1), quem recebe é conferido em `jogar`.
 */
function conferirRoda(antes: EstadoPartida, p: EstadoPartida): void {
  const n = p.jogadores.length;
  expect(Number.isInteger(p.vez) && p.vez >= 0 && p.vez < n, 'uma vez, de um jogador').toBe(true);
  if (equipesIguais(p)) expect(p, 'equipes iguais: a roda é a ordem de jogadores, sem proximoDaRoda').not.toHaveProperty('proximoDaRoda');
  else if (p.proximoDaRoda !== undefined) expect(equipeDe(p, p.proximoDaRoda), 'proximoDaRoda é da outra equipe').not.toBe(equipeDe(p, p.vez));
  if (p.vezDaRoda !== undefined) {
    expect(p.config.quemContinua, 'só o parceiro taca na vez de outro').toBe('parceiro');
    expect(p.vezDaRoda).not.toBe(p.vez);
    expect(equipeDe(p, p.vezDaRoda)).toBe(equipeDe(p, p.vez));
  }
  if (equipeDe(p, p.vez) !== equipeDe(antes, antes.vez)) {
    if (equipesIguais(p)) expect(p.vez, 'a roda anda um a partir de quem ela escolheu').toBe((daRoda(antes) + 1) % n);
    expect(p).not.toHaveProperty('vezDaRoda');
  } else {
    expect(daRoda(p), 'continuar não move a roda').toBe(daRoda(antes));
    expect(p.proximoDaRoda, 'continuar não muda quem a roda escolhe depois').toBe(antes.proximoDaRoda);
    if (p.config.quemContinua === 'mesmo-jogador' || membros(p, equipeDe(p, p.vez)).length === 1) expect(p.vez).toBe(antes.vez);
    else expect(p.vez, 'o taco passa para o parceiro').not.toBe(antes.vez);
  }
}

describe('invariantes em partidas ao acaso', () => {
  const casas: readonly Partial<ConfigRegras>[] = [
    {},
    { castigoNaSaida: 'antes-da-hora' },
    { castigoNaSaida: 'vence', castigoEBrancaJuntos: 'derrota' },
    CASTIGO_1,
    { ...CASTIGO_1, castigoInicio: 'centro-triangulo', castigoNaSaida: 'vence' },
    SEM_FINAL,
    { penaDupla: true, penaDireta: 2 },
    { penaInvertida: true },
    { castigoEBrancaJuntos: 'derrota', castigoPrimeiroMesaAberta: 'livre', proximaSaida: 'alternado' },
    { ...SEM_FINAL, ultimaPorPenaOuAdversario: 'volta', penaDireta: 2, bolaForaDaMesa: 'falta' },
    { ...CASTIGO_1, penaInvertida: true, penaInvertidaBola: 'ultima', bolaForaDaMesa: 'falta' },
    { penaInvertida: true, penaInvertidaBola: 'maior', penaDupla: true },
  ];

  it.each(casas.map((c) => [JSON.stringify(c), c] as const))('casa %s: 60 partidas', (_, casa) => {
    let terminadas = 0;
    for (let semente = 1; semente <= 60; semente++) {
      const rng = rngDeTeste(semente);
      let partida = congelar(novaPartida(config(casa), JOGADORES, rng).partida);
      for (let tacada = 0; tacada < 400 && partida.vencedor === null; tacada++) {
        const evs = congelar(eventos(tacadaAoAcaso(partida, rng)));
        const r = aplicarTacada(partida, evs);
        expect(aplicarTacada(partida, evs), 'pura: mesma entrada, mesma saída').toEqual(r);
        conferir(partida, r);
        partida = congelar(r.partida);
      }
      if (partida.vencedor !== null) {
        terminadas++;
        expect(() => aplicarTacada(partida, eventos({ toca: partida.naMesa[0] }))).toThrow(/terminou/);
      }
    }
    expect(terminadas).toBeGreaterThan(50);
  });
});

/** Com 4%, quem tem a vez caiu e a sala passa a vez dele. `inicios`: quem começou a última vez de cada equipe. */
function jogarEmEquipes(partida: EstadoPartida, rng: Rng, inicios: Map<number, number>): EstadoPartida {
  let depois: EstadoPartida;
  if (sorteio(rng, 0.04)) {
    depois = passarVez(partida);
    expect(passarVez(partida), 'pura').toEqual(depois);
    expect({ ...depois, vez: 0, fase: 'saida', proximoDaRoda: undefined }, 'só a vez muda').toEqual({
      ...partida,
      vez: 0,
      fase: 'saida',
      vezDaRoda: undefined,
      proximoDaRoda: undefined,
    });
    conferirRoda(partida, depois);
  } else {
    const evs = congelar(eventos(tacadaAoAcaso(partida, rng)));
    const r = aplicarTacada(partida, evs);
    expect(aplicarTacada(partida, evs), 'pura: mesma entrada, mesma saída').toEqual(r);
    conferir(partida, r);
    depois = r.partida;
  }
  if (depois.vencedor === null && equipeDe(depois, depois.vez) !== equipeDe(partida, partida.vez)) {
    const equipe = equipeDe(depois, depois.vez);
    const daEquipe = membros(depois, equipe);
    const anterior = inicios.get(equipe);
    const esperado = anterior === undefined ? daEquipe[0] : daEquipe[(daEquipe.indexOf(anterior) + 1) % daEquipe.length];
    expect(depois.vez, 'a vez alterna as equipes, e cada equipe reveza quem começa a vez dela, na ordem em que entrou').toBe(esperado);
    if (daEquipe.length > 1) expect(depois.vez, 'cada equipe alterna quem começa a vez dela').not.toBe(anterior);
    inicios.set(equipe, depois.vez);
  }
  return depois;
}

/** 40 sequências de 3 partidas a partir de `inicio`, com a roda de cada uma vinda de `jogadoresDaProxima`; devolve quantas terminaram. */
function sequenciasDePartidas(casa: Partial<ConfigRegras>, inicio: readonly Jogador[]): number {
  let terminadas = 0;
  for (let semente = 1; semente <= 40; semente++) {
    const rng = rngDeTeste(semente);
    let roda: readonly Jogador[] = inicio;
    const saiu = new Map<number, string>();
    for (let jogo = 0; jogo < 3; jogo++) {
      let partida = congelar(novaPartida(config(casa), roda, rng).partida);
      const inicios = new Map([[equipeDe(partida, 0), 0]]);
      for (let tacada = 0; tacada < 600 && partida.vencedor === null; tacada++) partida = congelar(jogarEmEquipes(partida, rng, inicios));
      if (partida.vencedor === null) break;
      terminadas++;
      expect(() => passarVez(partida)).toThrow(/terminou/);
      const anterior = roda[0]!;
      roda = jogadoresDaProxima(partida);
      const sai = roda[0]!;
      const equipeQueSai = { perdedor: 1 - partida.vencedor, 'ranca-saia': partida.vencedor, alternado: 1 - anterior.equipe }[partida.config.proximaSaida];
      expect(sai.equipe, `proximaSaida: ${partida.config.proximaSaida}`).toBe(equipeQueSai);
      expect(roda.map((j) => j.id).sort(), 'os mesmos jogadores').toEqual(inicio.map((j) => j.id).sort());
      const [x, y] = [membros(partida, sai.equipe).length, membros(partida, 1 - sai.equipe).length];
      const alternando = [sai.equipe, 1 - sai.equipe, ...(x === 2 ? [sai.equipe] : []), ...(y === 2 ? [1 - sai.equipe] : [])];
      expect(roda.map((j) => j.equipe), 'a roda alterna as equipes (A1, B1, A2, B2, sem quem não existe)').toEqual(alternando);
      saiu.set(anterior.equipe, anterior.id);
      if (x > 1) expect(sai.id, 'cada equipe alterna quem sai').not.toBe(saiu.get(sai.equipe));
    }
  }
  return terminadas;
}

const CASAS_DE_EQUIPES: readonly Partial<ConfigRegras>[] = [
  {},
  { quemContinua: 'parceiro' },
  { ...CASTIGO_1, quemContinua: 'parceiro' },
  { ...SEM_FINAL, quemContinua: 'parceiro', ultimaPorPenaOuAdversario: 'volta', bolaForaDaMesa: 'falta' },
  { penaInvertida: true, penaInvertidaBola: 'ultima', proximaSaida: 'ranca-saia' },
  { penaDupla: true, penaDireta: 2, castigoEBrancaJuntos: 'derrota', proximaSaida: 'alternado' },
];

describe('invariantes em duplas ao acaso', () => {
  it.each(CASAS_DE_EQUIPES.map((c) => [JSON.stringify(c), c] as const))('casa %s: 40 sequências de 3 partidas', (_, casa) => {
    expect(sequenciasDePartidas(casa, DUPLAS)).toBeGreaterThan(100);
  });
});

describe('invariantes no 2×1 ao acaso (a sequência passa pelo 2×1 e pelo 1×2)', () => {
  const inicios = [['2×1', DOIS_CONTRA_UM], ['1×2', UM_CONTRA_DOIS]] as const;
  it.each(CASAS_DE_EQUIPES.flatMap((c) => inicios.map(([nome, js]) => [JSON.stringify(c), nome, c, js] as const)))(
    'casa %s, começando no %s: 40 sequências de 3 partidas',
    (_, __, casa, jogadores) => {
      expect(sequenciasDePartidas(casa, jogadores)).toBeGreaterThan(100);
    },
  );
});

describe('bolasAlvo coerente com aplicarTacada em partidas ao acaso', () => {
  const casas: readonly Partial<ConfigRegras>[] = [
    {},
    { castigoPrimeiroMesaAberta: 'livre' },
    { castigoNaSaida: 'antes-da-hora', penaDireta: 2 },
    CASTIGO_1,
    { ...CASTIGO_1, castigoPrimeiroMesaAberta: 'livre' },
    { ...CASTIGO_1, castigoInicio: 'centro-triangulo', castigoNaSaida: 'vence' },
    SEM_FINAL,
    { ...SEM_FINAL, ultimaPorPenaOuAdversario: 'volta', castigoPrimeiroMesaAberta: 'livre' },
  ];
  const rodas = [
    ['1×1', JOGADORES, 'mesmo-jogador'],
    ['2×2', DUPLAS, 'mesmo-jogador'],
    ['2×2 parceiro', DUPLAS, 'parceiro'],
    ['2×1', DOIS_CONTRA_UM, 'mesmo-jogador'],
    ['1×2 parceiro', UM_CONTRA_DOIS, 'parceiro'],
  ] as const;
  const DO_TOQUE: readonly NomeFalta[] = ['direta', 'castigo-fora-de-hora'];

  /** Faltas de toque (direta, bola final fora de hora) de uma tacada de `jogador` que toca `toca` primeiro. */
  function faltasDoToque(partida: EstadoPartida, jogador: number, toca: readonly number[]): NomeFalta[] {
    const { consequencias } = aplicarTacada({ ...partida, vez: jogador }, eventos({ toca }));
    return consequencias.faltas.map((f) => f.nome).filter((f) => DO_TOQUE.includes(f));
  }

  /** Para cada jogador: a bola alvo não dá falta de toque, as outras bolas em jogo dão; e as simultâneas, se uma for alvo. */
  function conferirAlvo(partida: EstadoPartida, rng: Rng, contagem: { dentro: number; fora: number }): void {
    const castigo = bolaDeCastigo(partida.config);
    const foraNaSaida = partida.fase === 'saida' && partida.config.castigoInicio === 'depois-da-saida';
    const emJogo = partida.naMesa.filter((b) => !foraNaSaida || b !== castigo);
    expect(bolasAlvo(partida), 'sem o jogador, quem tem a vez').toEqual(bolasAlvo(partida, partida.vez));
    for (let j = 0; j < partida.jogadores.length; j++) {
      const alvo = bolasAlvo(partida, j);
      expect(alvo, 'em ordem').toEqual(ordenado(alvo));
      for (const b of alvo) expect(emJogo, 'bolas fora da mesa não entram').toContain(b);
      for (const b of emJogo) {
        const faltas = faltasDoToque(partida, j, [b]);
        if (alvo.includes(b)) {
          expect(faltas, `a ${b} é alvo de ${j} (${partida.fase})`).toEqual([]);
          contagem.dentro++;
        } else {
          expect(faltas, `a ${b} não é alvo de ${j} (${partida.fase})`).toHaveLength(1);
          contagem.fora++;
        }
      }
      const par = embaralhar(emJogo, rng).slice(0, 2);
      const vale = par.some((b) => alvo.includes(b));
      expect(faltasDoToque(partida, j, par).length === 0, `toque simultâneo em ${par.join(' e ')}`).toBe(vale);
    }
  }

  it.each(casas.flatMap((c) => rodas.map(([nome, jogadores, quemContinua]) => [JSON.stringify(c), nome, c, jogadores, quemContinua] as const)))(
    'casa %s, %s: 15 partidas',
    (_, __, casa, jogadores, quemContinua) => {
      const fases = new Set<FasePartida>();
      const contagem = { dentro: 0, fora: 0 };
      for (let semente = 1; semente <= 15; semente++) {
        const rng = rngDeTeste(semente);
        let partida = congelar(novaPartida(config({ ...casa, quemContinua }), jogadores, rng).partida);
        for (let tacada = 0; tacada < 400 && partida.vencedor === null; tacada++) {
          fases.add(partida.fase);
          conferirAlvo(partida, rng, contagem);
          partida = congelar(aplicarTacada(partida, eventos(tacadaAoAcaso(partida, rng))).partida);
        }
        expect(partida.vencedor).not.toBeNull();
        for (let j = 0; j < jogadores.length; j++) expect(bolasAlvo(partida, j), 'partida encerrada: nenhuma').toEqual([]);
      }
      const semFinal = bolaDeCastigo(config(casa)) === null;
      expect([...fases].sort()).toEqual(semFinal ? ['aberta', 'grupos', 'saida'] : ['aberta', 'castigo', 'grupos', 'saida']);
      expect(contagem.dentro).toBeGreaterThan(100);
      expect(contagem.fora).toBeGreaterThan(100);
    },
  );
});

describe('uma partida inteira, só com eventos escritos à mão', () => {
  /** Joga a partida tacada a tacada, conferindo quem tacou, o estado e a frase. */
  function jogador(casa: Partial<ConfigRegras>) {
    let { partida } = novaPartida(config(casa), JOGADORES, rngDeTeste(9));
    const jogar = (t: Tacada, quem: number, esperado: Partial<EstadoPartida>, texto?: string) => {
      expect(partida.vez).toBe(quem);
      const r = aplicarTacada(partida, eventos(t));
      expect(r.partida).toMatchObject(esperado);
      if (texto !== undefined) expect(r.consequencias.texto).toBe(texto);
      partida = r.partida;
    };
    return { jogar, partida: () => partida };
  }

  it('Boteco: Ana sai, os dois jogam, pagam bola, chegam à 8, e Ana vence', () => {
    const { jogar, partida } = jogador({});
    jogar({ toca: 9, caem: [4] }, ANA, { vez: ANA, grupos: ['par', 'impar'], fase: 'grupos' }, 'Ana fica com as pares e continua.');
    jogar({ toca: 2, caem: [2] }, ANA, { vez: ANA });
    jogar({ toca: 6 }, ANA, { vez: BETO }, 'Nenhuma bola caiu. Vez de Beto.');
    jogar({ toca: 3, caem: [3, 5] }, BETO, { vez: BETO });
    jogar({ toca: 7, branca: 'cai' }, BETO, { vez: ANA, retiradas: [6] }, 'Suicídio! Ana recebe a 6.');
    jogar({ toca: 10, caem: [10, 12] }, ANA, { vez: ANA });
    jogar({ toca: 14, caem: [14] }, ANA, { vez: ANA, fase: 'castigo' }, 'Ana encaçapou a 14 e vai para a 8.');
    jogar({ toca: 7 }, ANA, { vez: BETO, retiradas: [6, 7] }, 'Direta! Beto recebe a 7.');
    jogar({ toca: 9, caem: [9, 11] }, BETO, { vez: BETO, fase: 'grupos' });
    jogar({ toca: 13, caem: [13] }, BETO, { vez: BETO, fase: 'castigo' });
    jogar({ toca: 8 }, BETO, { vez: ANA, fase: 'castigo' });
    jogar({ toca: 8, caem: [8] }, ANA, { fase: 'fim', vencedor: 0, vez: BETO }, 'Ana matou a 8 e venceu!');

    expect(partida().naMesa).toEqual([]);
    expect(partida().encacapadas.map((e) => e.bola)).toEqual([4, 2, 3, 5, 10, 12, 14, 9, 11, 13, 8]);
    expect(partida().retiradas).toEqual<IdBola[]>([6, 7]);
  });

  it('opção 1-15: Ana sai, os dois jogam, pagam bola, chegam ao castigo, e Ana vence', () => {
    const { jogar, partida } = jogador(CASTIGO_1);
    jogar({ toca: 9, caem: [4] }, ANA, { vez: ANA, grupos: ['par', 'impar'], fase: 'grupos' }, 'Ana fica com as pares e continua.');
    jogar({ toca: 2, caem: [2] }, ANA, { vez: ANA });
    jogar({ toca: 6 }, ANA, { vez: BETO }, 'Nenhuma bola caiu. Vez de Beto.');
    jogar({ toca: 3, caem: [3, 5] }, BETO, { vez: BETO });
    jogar({ toca: 7, branca: 'cai' }, BETO, { vez: ANA, retiradas: [6] }, 'Suicídio! Ana recebe a 6.');
    jogar({ toca: 8, caem: [8, 10] }, ANA, { vez: ANA });
    jogar({ toca: 12, caem: [12] }, ANA, { vez: ANA, fase: 'grupos' });
    jogar({ toca: 14, caem: [14] }, ANA, { vez: ANA, fase: 'castigo' }, 'Ana encaçapou a 14 e vai para o castigo.');
    jogar({ toca: 7 }, ANA, { vez: BETO, retiradas: [6, 7] }, 'Direta! Beto recebe a 7.');
    jogar({ toca: 9, caem: [9, 11, 13] }, BETO, { vez: BETO, fase: 'grupos' });
    jogar({ toca: 15, caem: [15] }, BETO, { vez: BETO, fase: 'castigo' });
    jogar({ toca: 1 }, BETO, { vez: ANA, fase: 'castigo' });
    jogar({ toca: 1, caem: [1] }, ANA, { fase: 'fim', vencedor: 0, vez: BETO }, 'Ana matou o castigo e venceu!');

    expect(partida().naMesa).toEqual([]);
    expect(partida().encacapadas.map((e) => e.bola)).toEqual([4, 2, 3, 5, 8, 10, 12, 14, 9, 11, 13, 15, 1]);
    expect(partida().retiradas).toEqual<IdBola[]>([6, 7]);
  });
});
