import { describe, expect, it } from 'vitest';
import { bolasAlvo, bolasRestantes, jogadoresDaProxima, objetivo } from './leitura';
import { aplicarTacada, novaPartida, passarVez } from './partida';
import {
  ANA,
  BETO,
  CAIO,
  DOIS_CONTRA_UM,
  JOGADORES,
  SEM_FINAL,
  UM_CONTRA_DOIS,
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

/** Dani no 1×2 (`UM_CONTRA_DOIS`): o terceiro da roda. */
const DANI = 2;

// Ana e Caio (equipe 0): pares 2 4 6. Beto (equipe 1): ímpares 3 5 7. A 8 é a final.
const MEIO: Mesa = { naMesa: [2, 3, 4, 5, 6, 7, 8] };
const PARCEIRO: Partial<ConfigRegras> = { quemContinua: 'parceiro' };
const marca = { bola: 0, lugar: 'marca-saida' } as const;
const falta = (...nomes: Consequencias['faltas'][number]['nome'][]) => nomes.map((nome) => ({ nome }));
const nomes = (js: readonly Jogador[]) => js.map((j) => j.nome);
const ERRA: Tacada = { toca: 6 };

/** Joga as tacadas uma a uma, conferindo a pureza; devolve o estado final e quem teve a vez depois de cada uma. */
function jogar(inicio: EstadoPartida, tacadas: readonly (Tacada | 'passa')[]): { partida: EstadoPartida; vezes: number[]; textos: string[] } {
  let partida = congelar(inicio);
  const vezes: number[] = [];
  const textos: string[] = [];
  for (const t of tacadas) {
    if (t === 'passa') {
      partida = congelar(passarVez(partida));
    } else {
      const r = aplicarTacada(partida, eventos(t));
      expect(r.partida.vez).toBe(r.consequencias.proximo);
      textos.push(r.consequencias.texto);
      partida = congelar(r.partida);
    }
    vezes.push(partida.vez);
  }
  return { partida, vezes, textos };
}

describe('novaPartida com equipes de 1 ou 2 jogadores', () => {
  it('2×1: a roda é A1, B1, A2, sai jogadores[0], sem proximoDaRoda nem vezDaRoda', () => {
    const { partida, arrumacao } = novaPartida(config(), DOIS_CONTRA_UM, rngDeTeste(1));
    expect(partida).toEqual<EstadoPartida>({
      config: config(),
      jogadores: DOIS_CONTRA_UM,
      vez: ANA,
      grupos: [null, null],
      fase: 'saida',
      naMesa: numeros(2, 14),
      encacapadas: [],
      retiradas: [],
      vencedor: null,
    });
    expect(partida).not.toHaveProperty('proximoDaRoda');
    expect(partida).not.toHaveProperty('vezDaRoda');
    expect(arrumacao).toEqual(novaPartida(config(), JOGADORES, rngDeTeste(1)).arrumacao);
  });

  it('1×2 (a equipe de 1 sai): A1, B1, B2, com a equipe de 2 sendo a 0 ou a 1', () => {
    const [ana, beto, caio] = DOIS_CONTRA_UM as [Jogador, Jogador, Jogador];
    expect(novaPartida(config(), UM_CONTRA_DOIS, rngDeTeste(1)).partida.jogadores).toBe(UM_CONTRA_DOIS);
    expect(nomes(novaPartida(config(), [beto, ana, caio], rngDeTeste(1)).partida.jogadores)).toEqual(['Beto', 'Ana', 'Caio']);
  });

  it('recusa equipe vazia ou com 3, equipe que não é 0 ou 1, menos de 2 ou mais de 4 jogadores e roda que não alterna', () => {
    const [ana, beto, caio] = DOIS_CONTRA_UM as [Jogador, Jogador, Jogador];
    const dani = UM_CONTRA_DOIS[2]!;
    const edu: Jogador = { id: 'e', nome: 'Edu', equipe: 0 };
    const rng = rngDeTeste(1);
    expect(() => novaPartida(config(), [ana], rng)).toThrow(/2 jogadores \(1×1\), 3 \(2×1\) ou 4 \(2×2\)/);
    expect(() => novaPartida(config(), [ana, beto, caio, dani, edu], rng)).toThrow(/2 jogadores \(1×1\), 3 \(2×1\) ou 4 \(2×2\)/);
    expect(() => novaPartida(config(), [ana, caio, edu], rng)).toThrow(/cada uma com 1 ou 2 jogadores/);
    expect(() => novaPartida(config(), [ana, beto, caio, edu], rng)).toThrow(/cada uma com 1 ou 2 jogadores/);
    expect(() => novaPartida(config(), [ana, beto, { ...caio, equipe: 2 }], rng)).toThrow(/as equipes são 0 e 1/);
    expect(() => novaPartida(config(), [ana, caio, beto], rng)).toThrow(/alternar/);
    expect(() => novaPartida(config(), [beto, dani, ana], rng)).toThrow(/alternar/);
    expect(() => novaPartida(config(), [ana, beto, { ...caio, id: 'b' }], rng)).toThrow(/id/);
  });
});

describe('rodízio no 2×1 (Ana e Caio contra Beto)', () => {
  const inicio = () => partidaCom({ ...MEIO, jogadores: DOIS_CONTRA_UM });

  it('a vez alterna entre as equipes e Ana e Caio revezam: Beto joga todas as vezes da equipe dele', () => {
    const { vezes, textos } = jogar(inicio(), [ERRA, { toca: 3 }, ERRA, { toca: 3 }, ERRA, { toca: 3 }, ERRA, { toca: 3 }]);
    expect(vezes).toEqual([BETO, CAIO, BETO, ANA, BETO, CAIO, BETO, ANA]);
    expect(textos.slice(0, 4)).toEqual([
      'Nenhuma bola caiu. Vez de Beto.',
      'Nenhuma bola caiu. Vez de Caio.',
      'Nenhuma bola caiu. Vez de Beto.',
      'Nenhuma bola caiu. Vez de Ana.',
    ]);
  });

  it('proximoDaRoda só aparece quando Beto joga depois de Caio: a próxima de Ana e Caio volta para Ana', () => {
    let p = inicio();
    const estados: Partial<EstadoPartida>[] = [];
    for (const t of [ERRA, { toca: 3 }, ERRA, { toca: 3 }]) {
      p = aplicarTacada(p, eventos(t)).partida;
      estados.push({ vez: p.vez, ...(p.proximoDaRoda === undefined ? {} : { proximoDaRoda: p.proximoDaRoda }) });
      expect(p).not.toHaveProperty('vezDaRoda');
    }
    expect(estados).toEqual([{ vez: BETO }, { vez: CAIO }, { vez: BETO, proximoDaRoda: ANA }, { vez: ANA }]);
  });

  it('Beto continua enquanto encaçapa, sem mexer na roda; ao errar, a vez é de quem a roda guardou', () => {
    const { partida, vezes, textos } = jogar(inicio(), [ERRA, { toca: 3 }, ERRA, { toca: 3, caem: [3] }, { toca: 5, caem: [5] }]);
    expect(vezes).toEqual([BETO, CAIO, BETO, BETO, BETO]);
    expect(textos.slice(3)).toEqual(['Beto encaçapou a 3 e continua.', 'Beto encaçapou a 5 e continua.']);
    expect(partida.proximoDaRoda).toBe(ANA);
    expect(jogar(partida, [{ toca: 7 }]).vezes).toEqual([ANA]);
  });

  it('mesmo-jogador: Caio encaçapa e continua; ao errar, vez de Beto e depois de Ana', () => {
    const { vezes } = jogar(partidaCom({ ...MEIO, jogadores: DOIS_CONTRA_UM, vez: CAIO }), [{ toca: 2, caem: [2] }, ERRA, { toca: 3 }]);
    expect(vezes).toEqual([CAIO, BETO, ANA]);
  });

  it('parceiro: Ana encaçapa e Caio continua a vez dela; Caio erra, Beto erra, e a vez seguinte da dupla é de Caio', () => {
    const { vezes, textos } = jogar(partidaCom({ ...MEIO, jogadores: DOIS_CONTRA_UM, regras: PARCEIRO }), [
      { toca: 2, caem: [2] },
      { toca: 4 },
      { toca: 3 },
      { toca: 4 },
      { toca: 3 },
    ]);
    expect(vezes).toEqual([CAIO, BETO, CAIO, BETO, ANA]);
    expect(textos[0]).toBe('Ana encaçapou a 2 e Caio continua.');
  });

  it('parceiro: Beto, sozinho, continua ele mesmo, sem vezDaRoda', () => {
    const { partida } = jogar(partidaCom({ ...MEIO, jogadores: DOIS_CONTRA_UM, vez: BETO, regras: PARCEIRO }), [{ toca: 3, caem: [3] }]);
    expect(partida.vez).toBe(BETO);
    expect(partida).not.toHaveProperty('vezDaRoda');
  });

  it('passarVez segue a mesma roda, misturado com tacadas', () => {
    expect(jogar(inicio(), ['passa', 'passa', 'passa', 'passa', 'passa']).vezes).toEqual([BETO, CAIO, BETO, ANA, BETO]);
    expect(jogar(inicio(), [ERRA, 'passa', ERRA, 'passa', { toca: 2, caem: [2] }, 'passa']).vezes).toEqual([BETO, CAIO, BETO, ANA, ANA, BETO]);
  });

  it('passarVez na vez do parceiro: a roda segue de quem começou a vez', () => {
    const { vezes } = jogar(partidaCom({ ...MEIO, jogadores: DOIS_CONTRA_UM, regras: PARCEIRO }), [{ toca: 2, caem: [2] }, 'passa', 'passa']);
    expect(vezes).toEqual([CAIO, BETO, CAIO]);
  });

  it('passarVez só muda a vez e a roda; a fase acompanha quem recebe', () => {
    const antes = congelar(partidaCom({ naMesa: [3, 5, 8], jogadores: DOIS_CONTRA_UM, vez: BETO, fase: 'grupos' }));
    const depois = passarVez(antes);
    expect(depois).toEqual({ ...antes, vez: CAIO, fase: 'castigo' });
    expect(passarVez(depois)).toMatchObject({ vez: BETO, fase: 'grupos', proximoDaRoda: ANA });
  });

  it('na saída, quem recebe a vez dá a saída', () => {
    const saida = partidaCom({ naMesa: numeros(2, 14), grupos: [null, null], fase: 'saida', jogadores: DOIS_CONTRA_UM });
    expect(jogar(saida, ['passa', 'passa']).partida).toMatchObject({ vez: CAIO, fase: 'saida' });
  });
});

describe('rodízio no 1×2 (Ana contra Beto e Dani)', () => {
  it('Ana joga todas as vezes da equipe dela, Beto e Dani revezam', () => {
    const inicio = partidaCom({ ...MEIO, jogadores: UM_CONTRA_DOIS });
    const { vezes, textos } = jogar(inicio, [ERRA, { toca: 3 }, ERRA, { toca: 3 }, ERRA, { toca: 3 }]);
    expect(vezes).toEqual([BETO, ANA, DANI, ANA, BETO, ANA]);
    expect(textos[2]).toBe('Nenhuma bola caiu. Vez de Dani.');
    expect(jogar(inicio, ['passa', 'passa', 'passa', 'passa', 'passa']).vezes).toEqual([BETO, ANA, DANI, ANA, BETO]);
  });

  it('com a equipe de 1 saindo, a dupla começa pelo primeiro dela', () => {
    const [ana, beto, caio] = DOIS_CONTRA_UM as [Jogador, Jogador, Jogador];
    const { partida } = novaPartida(config(), [beto, ana, caio], rngDeTeste(3));
    const { vezes } = jogar(partida, [{ toca: 2 }, { toca: 3 }, { toca: 2 }, { toca: 3 }, { toca: 2 }]);
    expect(vezes.map((v) => partida.jogadores[v]!.nome)).toEqual(['Ana', 'Beto', 'Caio', 'Beto', 'Ana']);
  });
});

interface Cenario {
  readonly nome: string;
  readonly antes: Omit<Mesa, 'jogadores'>;
  readonly jogadores?: readonly Jogador[];
  readonly tacada: Tacada;
  readonly partida?: Partial<EstadoPartida>;
  readonly consequencias?: Partial<Consequencias>;
}

const CENARIOS: readonly Cenario[] = [
  // Grupo da equipe.
  {
    nome: 'a saída de Ana define o grupo da equipe: Ana e Caio ficam com as pares',
    antes: { naMesa: numeros(2, 14), grupos: [null, null], fase: 'saida' },
    tacada: { toca: 9, caem: [4] },
    partida: { vez: ANA, grupos: ['par', 'impar'], fase: 'grupos' },
    consequencias: { texto: 'Ana e Caio ficam com as pares e Ana continua.' },
  },
  {
    nome: 'Beto define com a mesa aberta: fica com as ímpares, Ana e Caio com as pares',
    antes: { naMesa: numeros(2, 14), grupos: [null, null], vez: BETO },
    tacada: { toca: 3, caem: [3] },
    partida: { vez: BETO, grupos: ['par', 'impar'], fase: 'grupos' },
    consequencias: { texto: 'Beto fica com as ímpares e continua.' },
  },
  {
    nome: 'Caio encaçapa uma sua e uma de Beto: conta para Beto e passa a vez',
    antes: { ...MEIO, vez: CAIO },
    tacada: { toca: 4, caem: [4, 3] },
    partida: { vez: BETO, proximoDaRoda: ANA },
    consequencias: { texto: 'Caio encaçapou a 4. A 3 conta para Beto. Vez de Beto.' },
  },

  // Falta e pena para a equipe certa.
  {
    nome: 'Caio toca primeiro uma ímpar: direta, Beto recebe a menor dele',
    antes: { ...MEIO, vez: CAIO },
    tacada: { toca: 5 },
    partida: { vez: BETO, proximoDaRoda: ANA, retiradas: [3], naMesa: [2, 4, 5, 6, 7, 8] },
    consequencias: { faltas: falta('direta'), retirar: [3], texto: 'Direta! Beto recebe a 3.' },
  },
  {
    nome: 'Beto toca primeiro uma par: direta, Ana e Caio recebem a menor deles',
    antes: { ...MEIO, vez: BETO },
    tacada: { toca: 4 },
    partida: { vez: CAIO, retiradas: [2] },
    consequencias: { faltas: falta('direta'), retirar: [2], texto: 'Direta! Ana e Caio recebem a 2.' },
  },
  {
    nome: 'Beto suicida depois de Caio: Ana e Caio recebem a 2, a branca vai à marca, vez de Ana',
    antes: { ...MEIO, vez: BETO, proximoDaRoda: ANA },
    tacada: { toca: 3, branca: 'cai' },
    partida: { vez: ANA, retiradas: [2] },
    consequencias: { faltas: falta('suicidio'), retirar: [2], recolocar: [marca], texto: 'Suicídio! Ana e Caio recebem a 2.' },
  },
  {
    nome: 'pena com Beto na 8: ele não tem bola para receber',
    antes: { naMesa: [2, 4, 8], vez: CAIO },
    tacada: {},
    partida: { vez: BETO, proximoDaRoda: ANA, retiradas: [] },
    consequencias: { faltas: falta('cegar'), retirar: [], texto: 'Cegou! Beto não tem bola para receber.' },
  },
  {
    nome: 'pena invertida: Caio devolve a menor par que a equipe já encaçapou',
    antes: { ...MEIO, vez: CAIO, regras: { penaInvertida: true } },
    tacada: {},
    partida: { vez: BETO, proximoDaRoda: ANA, naMesa: [2, 3, 4, 5, 6, 7, 8, 10] },
    consequencias: { recolocar: [{ bola: 10, lugar: 'centro-mesa' }], texto: 'Cegou! Caio devolve a 10.' },
  },

  // Vitória da equipe de 1 e da de 2; quem sai na próxima.
  {
    nome: 'Beto mata a 8: a equipe de 1 vence e Caio (o próximo de Ana e Caio) sai na próxima',
    antes: { naMesa: [2, 4, 8], vez: BETO, proximoDaRoda: ANA },
    tacada: { toca: 8, caem: [8] },
    partida: { fase: 'fim', vencedor: 1, vez: CAIO },
    consequencias: { vencedor: 1, proximo: CAIO, texto: 'Beto matou a 8 e venceu!' },
  },
  {
    nome: 'Caio mata a 8: a equipe de 2 vence e Beto sai na próxima',
    antes: { naMesa: [3, 5, 8], vez: CAIO },
    tacada: { toca: 8, caem: [8] },
    partida: { fase: 'fim', vencedor: 0, vez: BETO },
    consequencias: { vencedor: 0, proximo: BETO, texto: 'Caio matou a 8! Ana e Caio venceram.' },
  },
  {
    nome: 'Beto mata a 8 antes da hora: Ana e Caio vencem',
    antes: { ...MEIO, vez: BETO },
    tacada: { toca: 3, caem: [8] },
    partida: { fase: 'fim', vencedor: 0 },
    consequencias: { vencedor: 0, texto: 'A 8 antes da hora! Beto perde e Ana e Caio vencem.' },
  },
  {
    nome: 'Caio mata a 8 antes da hora: Beto vence',
    antes: { ...MEIO, vez: CAIO },
    tacada: { toca: 2, caem: [8] },
    partida: { fase: 'fim', vencedor: 1 },
    consequencias: { vencedor: 1, texto: 'A 8 antes da hora! Ana e Caio perdem e Beto vence.' },
  },
  {
    nome: '2-15: a pena de Caio tira a última de Beto, e Beto vence',
    antes: { naMesa: [2, 4, 7], vez: CAIO, regras: SEM_FINAL },
    tacada: { toca: 7 },
    partida: { fase: 'fim', vencedor: 1 },
    consequencias: { vencedor: 1, retirar: [7], texto: 'Direta! Beto recebe a 7. Beto ficou sem bolas e venceu!' },
  },
  {
    nome: '1×2: Dani suicida e Ana recebe a 2',
    jogadores: UM_CONTRA_DOIS,
    antes: { ...MEIO, vez: DANI },
    tacada: { toca: 3, branca: 'cai' },
    partida: { vez: ANA, retiradas: [2] },
    consequencias: { texto: 'Suicídio! Ana recebe a 2.' },
  },
  {
    nome: '1×2: Ana faz direta e Beto e Dani recebem a 3',
    jogadores: UM_CONTRA_DOIS,
    antes: { ...MEIO, vez: ANA },
    tacada: { toca: 3 },
    partida: { vez: BETO, retiradas: [3] },
    consequencias: { texto: 'Direta! Beto e Dani recebem a 3.' },
  },
  {
    nome: '1×2: Dani mata a 8 e Beto e Dani vencem; Ana sai na próxima',
    jogadores: UM_CONTRA_DOIS,
    antes: { naMesa: [2, 4, 8], vez: DANI },
    tacada: { toca: 8, caem: [8] },
    partida: { fase: 'fim', vencedor: 1, vez: ANA },
    consequencias: { texto: 'Dani matou a 8! Beto e Dani venceram.' },
  },
];

describe('aplicarTacada no 2×1 e no 1×2: cenários', () => {
  it.each(CENARIOS.map((c) => [c.nome, c] as const))('%s', (_, c) => {
    const jogadores = c.jogadores ?? DOIS_CONTRA_UM;
    const antes = congelar(partidaCom({ ...c.antes, jogadores }));
    const { partida, consequencias } = aplicarTacada(antes, eventos(c.tacada));
    if (c.partida) expect(partida).toMatchObject(c.partida);
    if (c.consequencias) expect(consequencias).toMatchObject(c.consequencias);
    if (c.partida?.proximoDaRoda === undefined) expect(partida).not.toHaveProperty('proximoDaRoda');
    expect(partida.vez).toBe(consequencias.proximo);
    expect(partida.jogadores).toBe(jogadores);
  });

  it('o grupo é da equipe: o objetivo, as bolas restantes e as bolas alvo de Caio seguem o que Ana definiu', () => {
    const saida = partidaCom({ naMesa: numeros(2, 14), grupos: [null, null], fase: 'saida', jogadores: DOIS_CONTRA_UM });
    const { partida } = aplicarTacada(saida, eventos({ toca: 9, caem: [4] }));
    expect(objetivo(partida, CAIO)).toBe('grupo');
    expect(bolasRestantes(partida, CAIO)).toEqual([2, 6, 10, 12, 14]);
    expect(bolasAlvo(partida, CAIO)).toEqual([2, 6, 10, 12, 14]);
    expect(bolasAlvo(partida, BETO)).toEqual([3, 5, 7, 9, 11, 13]);
  });

  it('a dupla vai junta para a 8: Caio, sem tacar, já tem a 8 como objetivo', () => {
    const { partida } = aplicarTacada(partidaCom({ naMesa: [2, 3, 5, 8], jogadores: DOIS_CONTRA_UM }), eventos({ toca: 2, caem: [2] }));
    expect(partida.fase).toBe('castigo');
    expect(objetivo(partida, CAIO)).toBe('castigo');
    expect(bolasAlvo(partida, CAIO)).toEqual([8]);
    expect(objetivo(partida, BETO)).toBe('grupo');
  });

  it('o fim não guarda a roda', () => {
    const { partida } = aplicarTacada(partidaCom({ naMesa: [2, 4, 8], jogadores: DOIS_CONTRA_UM, vez: BETO, proximoDaRoda: ANA }), eventos({ toca: 8, caem: [8] }));
    expect(partida).not.toHaveProperty('proximoDaRoda');
    expect(partida).not.toHaveProperty('vezDaRoda');
  });
});

/** Partida que a equipe `vencedora` termina agora: alguém dela mata a 8. */
function terminar(jogadores: readonly Jogador[], vencedora: number, regras: Partial<ConfigRegras> = {}): EstadoPartida {
  const quem = jogadores.findIndex((j) => j.equipe === vencedora);
  const grupos = vencedora === 0 ? (['par', 'impar'] as const) : (['impar', 'par'] as const);
  const r = aplicarTacada(partidaCom({ naMesa: [3, 5, 8], grupos, vez: quem, jogadores, regras }), eventos({ toca: 8, caem: [8] }));
  expect(r.partida.vencedor).toBe(vencedora);
  return r.partida;
}

describe('nova partida no 2×1 e no 1×2', () => {
  /** Joga uma partida por vencedora e devolve quem saiu em cada uma, depois da primeira, e a última roda. */
  function saidas(inicio: readonly Jogador[], vencedoras: readonly number[], regras: Partial<ConfigRegras> = {}) {
    let roda = inicio;
    const sairam: string[] = [];
    for (const vencedora of vencedoras) {
      roda = jogadoresDaProxima(terminar(roda, vencedora, regras));
      expect(() => novaPartida(config(regras), roda, rngDeTeste(1)), nomes(roda).join(', ')).not.toThrow();
      sairam.push(roda[0]!.nome);
    }
    return { sairam, roda: nomes(roda) };
  }

  it('perdedor: a equipe perdedora sai; Ana e Caio alternam, Beto sai sempre que a equipe dele perde', () => {
    expect(saidas(DOIS_CONTRA_UM, [1, 1, 0, 1, 0])).toEqual({ sairam: ['Caio', 'Ana', 'Beto', 'Caio', 'Beto'], roda: ['Beto', 'Ana', 'Caio'] });
  });

  it('alternado: as equipes alternam a saída, ganhe quem ganhar', () => {
    expect(saidas(DOIS_CONTRA_UM, [1, 0, 0, 1], { proximaSaida: 'alternado' }).sairam).toEqual(['Beto', 'Caio', 'Beto', 'Ana']);
  });

  it('ranca-saia: a equipe vencedora sai, alternando Ana e Caio', () => {
    expect(saidas(DOIS_CONTRA_UM, [0, 0, 1, 0], { proximaSaida: 'ranca-saia' }).sairam).toEqual(['Caio', 'Ana', 'Beto', 'Caio']);
  });

  it('1×2: Beto e Dani alternam a saída, e a roda volta a A1, B1, B2', () => {
    expect(saidas(UM_CONTRA_DOIS, [0, 0, 1])).toEqual({ sairam: ['Beto', 'Dani', 'Ana'], roda: ['Ana', 'Beto', 'Dani'] });
  });

  it('a nova partida começa de quem sai e a roda segue alternando as equipes', () => {
    const roda = jogadoresDaProxima(terminar(DOIS_CONTRA_UM, 1));
    const { partida } = novaPartida(config(), roda, rngDeTeste(2));
    expect(nomes(partida.jogadores)).toEqual(['Caio', 'Beto', 'Ana']);
    expect(partida.vez).toBe(0);
    const meio = partidaCom({ ...MEIO, jogadores: partida.jogadores });
    const { vezes } = jogar(meio, [ERRA, { toca: 3 }, ERRA, { toca: 3 }, ERRA]);
    expect(vezes.map((v) => partida.jogadores[v]!.nome)).toEqual(['Beto', 'Ana', 'Beto', 'Caio', 'Beto']);
  });
});
