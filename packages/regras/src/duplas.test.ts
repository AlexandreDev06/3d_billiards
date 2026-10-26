import type { IdBola } from '@sinuca/fisica';
import { describe, expect, it } from 'vitest';
import { bolasRestantes, jogadoresDaProxima, objetivo } from './leitura';
import { aplicarTacada, novaPartida, passarVez } from './partida';
import {
  ANA,
  BETO,
  CAIO,
  CASTIGO_1,
  DANI,
  DUPLAS,
  JOGADORES,
  SEM_FINAL,
  config,
  congelar,
  eventos,
  numeros,
  partidaCom,
  rngDeTeste,
  type Mesa,
  type Tacada,
} from './para-testes';
import type { ConfigRegras, Consequencias, EstadoPartida, Jogador } from './tipos';

const ordenado = (l: readonly number[]) => [...l].sort((a, b) => a - b);

describe('novaPartida em duplas', () => {
  it('4 jogadores em 2 equipes: a roda é a ordem dada, sai jogadores[0], grupos por equipe', () => {
    const { partida, arrumacao } = novaPartida(config(), DUPLAS, rngDeTeste(1));
    expect(partida).toEqual<EstadoPartida>({
      config: config(),
      jogadores: DUPLAS,
      vez: ANA,
      grupos: [null, null],
      fase: 'saida',
      naMesa: numeros(2, 14),
      encacapadas: [],
      retiradas: [],
      vencedor: null,
    });
    expect(partida).not.toHaveProperty('vezDaRoda');
    expect(ordenado(arrumacao)).toEqual(numeros(2, 14));
    expect(arrumacao[4]).toBe(8);
  });

  it('a arrumação só depende do rng: igual no 1×1 e nas duplas', () => {
    expect(novaPartida(config(), DUPLAS, rngDeTeste(5)).arrumacao).toEqual(novaPartida(config(), JOGADORES, rngDeTeste(5)).arrumacao);
  });

  it('recusa 6 jogadores, equipe de 3, equipe que não é 0 ou 1 e roda que não alterna as equipes (3 jogadores: o 2×1, em equipes.test.ts)', () => {
    const [ana, beto, caio, dani] = DUPLAS as [Jogador, Jogador, Jogador, Jogador];
    const rng = rngDeTeste(1);
    const seis = [...DUPLAS, { id: 'e', nome: 'Edu', equipe: 0 }, { id: 'f', nome: 'Fê', equipe: 1 }];
    expect(() => novaPartida(config(), seis, rng)).toThrow(/2 jogadores \(1×1\), 3 \(2×1\) ou 4 \(2×2\)/);
    expect(() => novaPartida(config(), [ana, beto, caio, { ...dani, equipe: 0 }], rng)).toThrow(/cada uma com 1 ou 2 jogadores/);
    expect(() => novaPartida(config(), [ana, beto, caio, { ...dani, equipe: 2 }], rng)).toThrow(/as equipes são 0 e 1/);
    expect(() => novaPartida(config(), [ana, caio, beto, dani], rng)).toThrow(/alternar/);
    expect(() => novaPartida(config(), [ana, beto, caio, { ...dani, id: 'a' }], rng)).toThrow(/id/);
  });
});

interface Cenario {
  readonly nome: string;
  readonly antes: Omit<Mesa, 'jogadores'>;
  readonly tacada: Tacada;
  readonly partida?: Partial<EstadoPartida>;
  readonly consequencias?: Partial<Consequencias>;
  /** Depois da tacada, quem taca é quem a roda escolheu (`vezDaRoda` ausente). */
  readonly semRoda?: true;
}

// Ana e Caio (equipe 0): pares 2 4 6. Beto e Dani (equipe 1): ímpares 3 5 7. A 8 é a final.
const MEIO: Mesa = { naMesa: [2, 3, 4, 5, 6, 7, 8] };
const SAIDA: Mesa = { naMesa: numeros(2, 14), grupos: [null, null], fase: 'saida' };
const ABERTA: Mesa = { naMesa: numeros(2, 14), grupos: [null, null] };
const PARCEIRO: Partial<ConfigRegras> = { quemContinua: 'parceiro' };
const marca = { bola: 0, lugar: 'marca-saida' } as const;
const falta = (...nomes: Consequencias['faltas'][number]['nome'][]) => nomes.map((nome) => ({ nome }));

const CENARIOS: readonly Cenario[] = [
  // Rodízio: A1 → B1 → A2 → B2 → A1.
  {
    nome: 'Ana erra: vez de Beto',
    antes: { ...MEIO, vez: ANA },
    tacada: { toca: 2 },
    partida: { vez: BETO, fase: 'grupos' },
    consequencias: { texto: 'Nenhuma bola caiu. Vez de Beto.' },
  },
  { nome: 'Beto erra: vez de Caio', antes: { ...MEIO, vez: BETO }, tacada: { toca: 3 }, partida: { vez: CAIO, fase: 'grupos' } },
  { nome: 'Caio erra: vez de Dani', antes: { ...MEIO, vez: CAIO }, tacada: { toca: 4 }, partida: { vez: DANI, fase: 'grupos' } },
  { nome: 'Dani erra: a roda volta a Ana', antes: { ...MEIO, vez: DANI }, tacada: { toca: 5 }, partida: { vez: ANA, fase: 'grupos' } },
  {
    nome: 'mesmo-jogador: Caio encaçapa uma par e continua',
    antes: { ...MEIO, vez: CAIO },
    tacada: { toca: 2, caem: [2] },
    partida: { vez: CAIO, encacapadas: expect.arrayContaining([{ bola: 2, jogador: CAIO }]) },
    consequencias: { texto: 'Caio encaçapou a 2 e continua.' },
    semRoda: true,
  },
  {
    nome: 'parceiro: Caio encaçapa e Ana continua a vez dele',
    antes: { ...MEIO, vez: CAIO, regras: PARCEIRO },
    tacada: { toca: 2, caem: [2] },
    partida: { vez: ANA, vezDaRoda: CAIO, fase: 'grupos' },
    consequencias: { proximo: ANA, texto: 'Caio encaçapou a 2 e Ana continua.' },
  },
  {
    nome: 'parceiro: Ana, na vez de Caio, encaçapa e o taco volta para Caio',
    antes: { ...MEIO, vez: ANA, vezDaRoda: CAIO, regras: PARCEIRO },
    tacada: { toca: 4, caem: [4] },
    partida: { vez: CAIO },
    consequencias: { texto: 'Ana encaçapou a 4 e Caio continua.' },
    semRoda: true,
  },
  {
    nome: 'parceiro: Ana erra na vez de Caio: a roda segue de Caio, vez de Dani',
    antes: { ...MEIO, vez: ANA, vezDaRoda: CAIO, regras: PARCEIRO },
    tacada: { toca: 4 },
    partida: { vez: DANI },
    consequencias: { texto: 'Nenhuma bola caiu. Vez de Dani.' },
    semRoda: true,
  },
  {
    nome: 'parceiro: direta de Ana na vez de Caio: Beto e Dani recebem a menor, vez de Dani',
    antes: { ...MEIO, vez: ANA, vezDaRoda: CAIO, regras: PARCEIRO },
    tacada: { toca: 5 },
    partida: { vez: DANI, retiradas: [3] },
    consequencias: { faltas: falta('direta'), retirar: [3], texto: 'Direta! Beto e Dani recebem a 3.' },
    semRoda: true,
  },
  {
    nome: 'parceiro: a última par cai e o parceiro vai para a 8',
    antes: { naMesa: [2, 3, 5, 8], vez: CAIO, regras: PARCEIRO },
    tacada: { toca: 2, caem: [2] },
    partida: { vez: ANA, vezDaRoda: CAIO, fase: 'castigo' },
    consequencias: { texto: 'Caio encaçapou a 2 e Ana vai para a 8.' },
  },
  {
    nome: 'parceiro: o parceiro mata a 8 e a equipe vence',
    antes: { naMesa: [3, 5, 8], vez: ANA, vezDaRoda: CAIO, regras: PARCEIRO },
    tacada: { toca: 8, caem: [8] },
    partida: { fase: 'fim', vencedor: 0, vez: BETO },
    consequencias: { vencedor: 0, proximo: BETO },
    semRoda: true,
  },

  // Grupo da equipe.
  {
    nome: 'a saída de Ana define o grupo da equipe: Ana e Caio ficam com as pares',
    antes: { ...SAIDA, vez: ANA },
    tacada: { toca: 9, caem: [4] },
    partida: { vez: ANA, grupos: ['par', 'impar'], fase: 'grupos' },
    consequencias: { texto: 'Ana e Caio ficam com as pares e Ana continua.' },
  },
  {
    nome: 'Dani define o grupo com a mesa aberta: Beto e Dani ficam com as ímpares, Ana e Caio com as pares',
    antes: { ...ABERTA, vez: DANI },
    tacada: { toca: 3, caem: [3] },
    partida: { vez: DANI, grupos: ['par', 'impar'], fase: 'grupos' },
    consequencias: { texto: 'Beto e Dani ficam com as ímpares e Dani continua.' },
  },
  {
    nome: 'mesa aberta: Caio encaçapa par e ímpar, vale a primeira e perde a vez',
    antes: { ...ABERTA, vez: CAIO },
    tacada: { toca: 3, caem: [3, 4] },
    partida: { vez: DANI, grupos: ['impar', 'par'] },
    consequencias: { texto: 'Ana e Caio ficam com as ímpares. A 4 conta para Beto e Dani. Vez de Dani.' },
  },
  {
    nome: 'Caio toca primeiro a par que Ana deixou: não é direta',
    antes: { ...MEIO, vez: CAIO },
    tacada: { toca: 6, caem: [6] },
    partida: { vez: CAIO },
    consequencias: { faltas: [] },
  },
  {
    nome: 'Beto encaçapa uma sua e uma de Ana e Caio: conta para eles e passa a vez',
    antes: { ...MEIO, vez: BETO },
    tacada: { toca: 3, caem: [3, 4] },
    partida: { vez: CAIO },
    consequencias: { texto: 'Beto encaçapou a 3. A 4 conta para Ana e Caio. Vez de Caio.' },
  },

  // Falta e pena para a equipe certa.
  {
    nome: 'Caio toca primeiro uma ímpar: direta, Beto e Dani recebem a menor deles',
    antes: { ...MEIO, vez: CAIO },
    tacada: { toca: 5 },
    partida: { vez: DANI, retiradas: [3], naMesa: [2, 4, 5, 6, 7, 8] },
    consequencias: { faltas: falta('direta'), retirar: [3], texto: 'Direta! Beto e Dani recebem a 3.' },
  },
  {
    nome: 'Dani suicida: Ana e Caio recebem a menor par e a branca vai à marca',
    antes: { ...MEIO, vez: DANI },
    tacada: { toca: 3, branca: 'cai' },
    partida: { vez: ANA, retiradas: [2] },
    consequencias: { faltas: falta('suicidio'), retirar: [2], recolocar: [marca], texto: 'Suicídio! Ana e Caio recebem a 2.' },
  },
  {
    nome: 'pena com a equipe adversária na 8: ninguém recebe',
    antes: { naMesa: [3, 5, 8], vez: DANI },
    tacada: {},
    partida: { vez: ANA, retiradas: [] },
    consequencias: { faltas: falta('cegar'), retirar: [], texto: 'Cegou! Ana e Caio não têm bola para receber.' },
  },
  {
    nome: 'pena invertida: Caio devolve a menor par que a equipe já encaçapou (de Ana)',
    antes: { ...MEIO, vez: CAIO, regras: { penaInvertida: true } },
    tacada: {},
    partida: { vez: DANI, naMesa: [2, 3, 4, 5, 6, 7, 8, 10] },
    consequencias: { faltas: falta('cegar'), retirar: [], recolocar: [{ bola: 10, lugar: 'centro-mesa' }], texto: 'Cegou! Caio devolve a 10.' },
  },

  // Vitória da equipe.
  {
    nome: 'Caio mata a 8 depois que Ana tirou as pares: Ana e Caio vencem, Beto sai na próxima',
    antes: { naMesa: [3, 5, 8], vez: CAIO },
    tacada: { toca: 8, caem: [8] },
    partida: { fase: 'fim', vencedor: 0, vez: BETO },
    consequencias: { vencedor: 0, proximo: BETO, texto: 'Caio matou a 8! Ana e Caio venceram.' },
  },
  {
    nome: '1-15 (opção): Caio mata o castigo e Ana e Caio vencem',
    antes: { naMesa: [1, 3, 5], vez: CAIO, regras: CASTIGO_1 },
    tacada: { toca: 1, caem: [1] },
    partida: { fase: 'fim', vencedor: 0, vez: BETO },
    consequencias: { vencedor: 0, proximo: BETO, texto: 'Caio matou o castigo! Ana e Caio venceram.' },
  },
  {
    nome: 'Dani mata a 8 antes da hora: Ana e Caio vencem',
    antes: { ...MEIO, vez: DANI },
    tacada: { toca: 3, caem: [8] },
    partida: { fase: 'fim', vencedor: 0 },
    consequencias: { vencedor: 0, texto: 'A 8 antes da hora! Beto e Dani perdem e Ana e Caio vencem.' },
  },
  {
    nome: 'suicídio com a 8 (derrota): Beto e Dani vencem',
    antes: { naMesa: [3, 5, 8], vez: CAIO, regras: { castigoEBrancaJuntos: 'derrota' } },
    tacada: { toca: 8, caem: [8], branca: 'cai' },
    partida: { fase: 'fim', vencedor: 1 },
    consequencias: { vencedor: 1, texto: 'Suicídio com a 8! Ana e Caio perdem e Beto e Dani vencem.' },
  },
  {
    nome: '2-15: Dani encaçapa a última ímpar e Beto e Dani vencem',
    antes: { naMesa: [2, 4, 7], vez: DANI, regras: SEM_FINAL },
    tacada: { toca: 7, caem: [7] },
    partida: { fase: 'fim', vencedor: 1, vez: CAIO },
    consequencias: { vencedor: 1, proximo: CAIO, texto: 'Dani encaçapou a última! Beto e Dani venceram.' },
  },
  {
    nome: '2-15: a pena de Caio tira a última de Beto e Dani, e eles vencem',
    antes: { naMesa: [2, 4, 7], vez: CAIO, regras: SEM_FINAL },
    tacada: { toca: 7 },
    partida: { fase: 'fim', vencedor: 1 },
    consequencias: { vencedor: 1, retirar: [7], texto: 'Direta! Beto e Dani recebem a 7. Beto e Dani ficaram sem bolas e venceram!' },
  },

  // Quem sai na próxima: a roda continua.
  {
    nome: 'perdedor: sai o primeiro da equipe perdedora depois de quem saiu nesta',
    antes: { naMesa: [2, 8], vez: DANI },
    tacada: { toca: 8, caem: [8] },
    consequencias: { vencedor: 1, proximo: CAIO },
  },
  {
    nome: 'alternado: sai a outra equipe, o próximo da roda',
    antes: { naMesa: [3, 5, 8], vez: CAIO, regras: { proximaSaida: 'alternado' } },
    tacada: { toca: 8, caem: [8] },
    consequencias: { vencedor: 0, proximo: BETO },
  },
  {
    nome: 'ranca-saia: a equipe vencedora sai, com o parceiro de quem saiu nesta',
    antes: { naMesa: [3, 5, 8], vez: ANA, regras: { proximaSaida: 'ranca-saia' } },
    tacada: { toca: 8, caem: [8] },
    consequencias: { vencedor: 0, proximo: CAIO },
  },
];

describe('aplicarTacada em duplas: cenários', () => {
  it.each(CENARIOS.map((c) => [c.nome, c] as const))('%s', (_, c) => {
    const antes = congelar(partidaCom({ ...c.antes, jogadores: DUPLAS }));
    const { partida, consequencias } = aplicarTacada(antes, eventos(c.tacada));
    if (c.partida) expect(partida).toMatchObject(c.partida);
    if (c.consequencias) expect(consequencias).toMatchObject(c.consequencias);
    if (c.semRoda) expect(partida).not.toHaveProperty('vezDaRoda');
    expect(partida.vez).toBe(consequencias.proximo);
    expect(partida.jogadores).toBe(DUPLAS);
  });

  it('a bola encaçapada fica com o índice de quem tacou', () => {
    const { partida } = aplicarTacada(partidaCom({ ...MEIO, vez: DANI, jogadores: DUPLAS }), eventos({ toca: 3, caem: [3] }));
    expect(partida.encacapadas.at(-1)).toEqual({ bola: 3 as IdBola, jogador: DANI });
  });

  it('o grupo é da equipe: o objetivo e as bolas restantes de Caio seguem o que Ana definiu', () => {
    const { partida } = aplicarTacada(partidaCom({ ...SAIDA, jogadores: DUPLAS }), eventos({ toca: 9, caem: [4] }));
    expect(objetivo(partida, CAIO)).toBe('grupo');
    expect(bolasRestantes(partida, CAIO)).toEqual([2, 6, 10, 12, 14]);
    expect(bolasRestantes(partida, DANI)).toEqual([3, 5, 7, 9, 11, 13]);
    expect(bolasRestantes(partida, BETO)).toEqual(bolasRestantes(partida, DANI));
  });

  it('a equipe vai junta para a 8: Caio sem tacar ainda tem a 8 como objetivo', () => {
    const { partida } = aplicarTacada(partidaCom({ naMesa: [2, 3, 5, 8], vez: ANA, jogadores: DUPLAS }), eventos({ toca: 2, caem: [2] }));
    expect(partida.fase).toBe('castigo');
    expect(objetivo(partida, CAIO)).toBe('castigo');
    expect(objetivo(partida, BETO)).toBe('grupo');
  });
});

/** Partida em duplas que a equipe `vencedora` termina agora: alguém dela mata a 8. */
function terminar(jogadores: readonly Jogador[], vencedora: number, regras: Partial<ConfigRegras> = {}): EstadoPartida {
  const quem = jogadores.findIndex((j) => j.equipe === vencedora);
  const grupos = vencedora === 0 ? (['par', 'impar'] as const) : (['impar', 'par'] as const);
  const r = aplicarTacada(partidaCom({ naMesa: [3, 5, 8], grupos, vez: quem, jogadores, regras }), eventos({ toca: 8, caem: [8] }));
  expect(r.partida.vencedor).toBe(vencedora);
  return r.partida;
}

describe('nova partida em duplas', () => {
  const nomes = (js: readonly Jogador[]) => js.map((j) => j.nome);

  it('perdedor: a equipe perdedora sai, e cada equipe alterna quem sai', () => {
    let roda: readonly Jogador[] = DUPLAS;
    const saidas: string[] = [roda[0]!.nome];
    for (const vencedora of [0, 0, 1, 1]) {
      roda = jogadoresDaProxima(terminar(roda, vencedora));
      expect(() => novaPartida(config(), roda, rngDeTeste(1))).not.toThrow();
      expect(roda[0]!.equipe).toBe(1 - vencedora);
      saidas.push(roda[0]!.nome);
    }
    expect(saidas).toEqual(['Ana', 'Beto', 'Dani', 'Caio', 'Ana']);
    expect(nomes(roda)).toEqual(['Ana', 'Beto', 'Caio', 'Dani']);
  });

  it('alternado: as quatro saídas giram A1 → B1 → A2 → B2, ganhe quem ganhar', () => {
    let roda: readonly Jogador[] = DUPLAS;
    const saidas: string[] = [];
    for (const vencedora of [1, 0, 0, 1]) {
      roda = jogadoresDaProxima(terminar(roda, vencedora, { proximaSaida: 'alternado' }));
      saidas.push(roda[0]!.nome);
    }
    expect(saidas).toEqual(['Beto', 'Caio', 'Dani', 'Ana']);
  });

  it('ranca-saia: a equipe vencedora sai, alternando os parceiros', () => {
    let roda: readonly Jogador[] = DUPLAS;
    const saidas: string[] = [];
    for (const vencedora of [0, 0, 1]) {
      roda = jogadoresDaProxima(terminar(roda, vencedora, { proximaSaida: 'ranca-saia' }));
      saidas.push(roda[0]!.nome);
    }
    expect(saidas).toEqual(['Caio', 'Ana', 'Beto']);
  });

  it('a roda segue alternando as equipes e a nova partida começa de quem sai', () => {
    const roda = jogadoresDaProxima(terminar(DUPLAS, 0));
    const { partida } = novaPartida(config(), roda, rngDeTeste(2));
    expect(partida.vez).toBe(0);
    expect(nomes(partida.jogadores)).toEqual(['Beto', 'Caio', 'Dani', 'Ana']);
  });
});

describe('passarVez', () => {
  const comMesa = (m: Mesa) => congelar(partidaCom({ jogadores: DUPLAS, ...m }));

  it('1×1: a vez vai para o adversário, sem mexer nas bolas', () => {
    const antes = congelar(partidaCom(MEIO));
    const depois = passarVez(antes);
    expect(depois).toEqual({ ...antes, vez: BETO });
  });

  it('duplas: segue a roda Ana → Beto → Caio → Dani → Ana', () => {
    let p: EstadoPartida = comMesa(MEIO);
    const vezes: number[] = [];
    for (let i = 0; i < 4; i++) {
      p = passarVez(p);
      vezes.push(p.vez);
    }
    expect(vezes).toEqual([BETO, CAIO, DANI, ANA]);
  });

  it('com o parceiro tacando na vez de Caio: segue a roda de Caio (Dani) e esquece o parceiro', () => {
    const depois = passarVez(comMesa({ ...MEIO, vez: ANA, vezDaRoda: CAIO, regras: PARCEIRO }));
    expect(depois.vez).toBe(DANI);
    expect(depois).not.toHaveProperty('vezDaRoda');
  });

  it('na saída, quem recebe a vez dá a saída', () => {
    const depois = passarVez(comMesa(SAIDA));
    expect(depois).toMatchObject({ vez: BETO, fase: 'saida', naMesa: numeros(2, 14), grupos: [null, null] });
  });

  it('a fase acompanha quem recebe a vez (bola final, grupo, mesa aberta)', () => {
    expect(passarVez(comMesa({ naMesa: [3, 5, 8], vez: DANI })).fase).toBe('castigo');
    expect(passarVez(comMesa({ naMesa: [3, 5, 8], vez: ANA, fase: 'castigo' })).fase).toBe('grupos');
    expect(passarVez(comMesa({ ...ABERTA, vez: CAIO })).fase).toBe('aberta');
  });

  it('pura: não muta a entrada e repete a saída', () => {
    const antes = comMesa(MEIO);
    expect(passarVez(antes)).toEqual(passarVez(antes));
    expect(passarVez(antes)).not.toBe(antes);
    expect(antes.vez).toBe(ANA);
  });

  it('não passa a vez de partida terminada', () => {
    expect(() => passarVez(terminar(DUPLAS, 0))).toThrow(/terminou/);
  });
});

describe('1×1 com as chaves de duplas', () => {
  it('parceiro sem parceiro: quem encaçapou continua, sem vezDaRoda', () => {
    const { partida } = aplicarTacada(partidaCom({ naMesa: [2, 3, 4, 5, 8], regras: PARCEIRO }), eventos({ toca: 2, caem: [2] }));
    expect(partida.vez).toBe(ANA);
    expect(partida).not.toHaveProperty('vezDaRoda');
  });
});
