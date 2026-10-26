/**
 * A conferência das missões (L31), pura: cada missão com uma gravação sintética (os eventos que ela exige, e os que quase a
 * cumprem), as regras de verdade dando as consequências e a partida de depois, e quatro tacadas com a física real. O que NÃO
 * conta também tem teste: falta, bola do adversário, bola que volta à mesa, a derrota de quem tacou.
 */
import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, cacapas, criarRng, mesaInicial, simularTacada, type EventoTacada, type Gravacao, type ParametrosTacada } from '@sinuca/fisica';
import { MISSOES } from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESET_MATA_MATA, aplicarTacada, novaPartida, type EstadoPartida, type Jogador } from '@sinuca/regras';
import { conferirFimDaPartida, conferirTacada, PREFIXO_DAS_CACAPAS_DO_MEIO, type ConferenciaDaTacada } from './missoes';
import { acharTacada, tacadaDaVisao } from './para-testes';

const DOIS: readonly Jogador[] = [
  { id: 'lugar-0', nome: 'Ana', equipe: 0 },
  { id: 'lugar-1', nome: 'Beto', equipe: 1 },
];
const TRES: readonly Jogador[] = [...DOIS, { id: 'lugar-2', nome: 'Cida', equipe: 2 }];

const CANTO = 'canto-x-z-';
const MEIO = 'meio-z+';

const PARADA: ParametrosTacada = { angulo: 0, velocidadeTaco: 2, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 };
const com = (mudanca: Omit<Partial<ParametrosTacada>, 'efeito'> & { efeito?: Partial<ParametrosTacada['efeito']> }): ParametrosTacada => ({
  ...PARADA,
  ...mudanca,
  efeito: { ...PARADA.efeito, ...mudanca.efeito },
});

// ---------------------------------------------------------------- eventos e gravação sintéticos

type SemT<E> = E extends unknown ? Omit<E, 't'> : never;
type Passo = SemT<EventoTacada>;
const bate = (v = 2): Passo => ({ tipo: 'taco-bola', bola: 0, velocidade: v, miscue: false });
const toca = (a: number, b: number): Passo => ({ tipo: 'bola-bola', a, b, velocidade: 1 });
const tabela = (bola: number): Passo => ({ tipo: 'bola-tabela', bola, tabela: 0, velocidade: 1 });
const cai = (bola: number, cacapa = CANTO): Passo => ({ tipo: 'cacapa', bola, cacapa });
const parou: Passo = { tipo: 'parou' };

/** Eventos em ordem de `t`: um a cada 0,1 s, e o `parou` no fim. */
const eventos = (...passos: Passo[]): EventoTacada[] => [...passos, parou].map((p, i) => ({ ...p, t: i / 10 }) as EventoTacada);

/** Gravação de 2 quadros com as bolas parados em `onde` (a branca em `branca`); só o primeiro quadro importa para as missões. */
function gravar(evs: readonly EventoTacada[], onde: Readonly<Record<number, readonly [number, number]>> = {}, branca: readonly [number, number] = [-1, 0]): Gravacao {
  const ids = [0, ...Array.from({ length: 15 }, (_, i) => i + 1)];
  const posicoes = new Float32Array(2 * ids.length * 3);
  ids.forEach((id, i) => {
    const [x, z] = id === 0 ? branca : (onde[id] ?? [0.5 + id * 0.01, 0.2]);
    for (const q of [0, 1]) posicoes.set([x, 0.03, z], (q * ids.length + i) * 3);
  });
  return { frequencia: 100, ids, quadros: 2, duracao: 1, posicoes, orientacoes: new Float32Array(2 * ids.length * 4), naMesa: new Uint8Array(2 * ids.length).fill(1), eventos: evs };
}

const rng = () => criarRng(7);

/** Par ou ímpar, Ana (equipe 0) com a vez; `grupos` já definidos (Ana par, Beto ímpar) se `definidos`. */
function boteco(definidos: boolean): EstadoPartida {
  const { partida } = novaPartida(PRESET_BOTECO.regras, DOIS, rng());
  return definidos ? { ...partida, grupos: ['par', 'impar'], fase: 'grupos' } : partida;
}

const mataMata = (jogadores: readonly Jogador[] = TRES): EstadoPartida => novaPartida(PRESET_MATA_MATA.regras, jogadores, rng()).partida;

interface Opcoes {
  readonly parametros?: ParametrosTacada;
  readonly onde?: Readonly<Record<number, readonly [number, number]>>;
  readonly branca?: readonly [number, number];
  readonly seguidasAntes?: number;
}

/** Aplica as regras de verdade aos eventos e confere a tacada; devolve também a partida de depois. */
function conferir(antes: EstadoPartida, passos: readonly Passo[], o: Opcoes = {}): ConferenciaDaTacada & { depois: EstadoPartida } {
  const evs = eventos(...passos);
  const r = aplicarTacada(antes, evs);
  const c = conferirTacada({
    parametros: o.parametros ?? PARADA,
    gravacao: gravar(evs, o.onde, o.branca),
    consequencias: r.consequencias,
    antes,
    depois: r.partida,
    seguidasAntes: o.seguidasAntes ?? 0,
  });
  return { ...c, depois: r.partida };
}

// ---------------------------------------------------------------- o catálogo e as caçapas do meio

describe('o que a conferência supõe da física e do catálogo', () => {
  it('o prefixo das caçapas do meio bate com os ids de `cacapas()` da física: as duas do meio e nenhuma de canto', () => {
    const ids = cacapas(CONFIG_FISICA_PADRAO.mesa).map((c) => c.id);
    expect(ids.filter((id) => id.startsWith(PREFIXO_DAS_CACAPAS_DO_MEIO))).toHaveLength(2);
    expect(ids.filter((id) => !id.startsWith(PREFIXO_DAS_CACAPAS_DO_MEIO)).every((id) => id.startsWith('canto-'))).toBe(true);
  });

  it('toda missão de tacada tem um caso aqui; só as de partida inteira ficam com conferirFimDaPartida', () => {
    const deFim = new Set(['fregues-da-casa', 'fecha-a-conta', 'limpinho']);
    const deTacada = MISSOES.map((m) => m.id).filter((id) => !deFim.has(id));
    expect(deTacada).toEqual(['mao-quente', 'pelo-meio', 'saida-premiada', 'embalado', 'na-pancada', 'no-carinho', 'efeito-ingles', 'siga', 'puxada', 'tabelada', 'de-longe', 'volta-ao-mundo']);
  });
});

// ---------------------------------------------------------------- bola matada

describe('bola matada (o que conta e o que não conta)', () => {
  it('par ou ímpar com grupos: conta a bola do grupo de quem tacou; a do adversário não', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 2), cai(2), cai(3)]);
    expect(c.mortas).toEqual([2]);
    expect(c.valores['mao-quente']).toBe(1);
  });

  it('a bola final de verdade (o castigo) conta quando o grupo já acabou e a partida é de quem tacou', () => {
    const base = boteco(true);
    const soAsDoMeio = { ...base, naMesa: [8], fase: 'castigo' as const };
    const c = conferir(soAsDoMeio, [bate(), toca(0, 8), cai(8)]);
    expect(c.depois.vencedor).toBe(0);
    expect(c.mortas).toEqual([8]);
  });

  it('a bola final antes da hora perde a partida: nada dessa tacada conta (ninguém comemora a que perdeu o jogo)', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 8), cai(8), cai(2)]);
    expect(c.depois.vencedor).toBe(1);
    expect(c.mortas).toEqual([]);
    expect(c.valores).toEqual({});
  });

  it('bola que volta à mesa não conta: o castigo encaçapado na saída volta', () => {
    const c = conferir(boteco(false), [bate(), toca(0, 8), cai(8)]);
    expect(c.mortas).toEqual([]);
    expect(c.valores).toEqual({});
  });

  it('mesa aberta: a primeira bola define o grupo e conta; a do outro grupo, na mesma tacada, não', () => {
    const c = conferir(boteco(false), [bate(), toca(0, 4), cai(4), cai(5)]);
    expect(c.mortas).toEqual([4]);
  });

  it('com falta nada conta, mesmo que a bola do próprio grupo tenha caído (a branca caiu junto)', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 2), cai(2), cai(0, MEIO)]);
    expect(c.depois.encacapadas.map((e) => e.bola)).toContain(2);
    expect(c.mortas).toEqual([]);
    expect(c.valores).toEqual({});
  });

  it('com falta de toque (a branca encostou antes numa bola do adversário) nada conta', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 3), toca(3, 2), cai(2)]);
    expect(c.mortas).toEqual([]);
  });

  it('mata-mata: qualquer bola conta, par ou ímpar, e a falta de cegar tira tudo', () => {
    expect(conferir(mataMata(), [bate(), toca(0, 3), cai(3), cai(4)]).mortas).toEqual([3, 4]);
    const cego = conferir(mataMata(), [bate(), cai(5)]);
    expect(cego.mortas).toEqual([]);
    expect(cego.valores).toEqual({});
  });

  it('tacada que não mata nada não mexe em missão nenhuma', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 2), tabela(0)]);
    expect(c.valores).toEqual({});
    expect(c.seguidas).toBe(0);
  });
});

// ---------------------------------------------------------------- uma missão por vez

describe('Mão quente', () => {
  it('cada bola matada soma 1 (duas na tacada, 2)', () => {
    expect(conferir(boteco(true), [bate(), toca(0, 2), cai(2)]).valores['mao-quente']).toBe(1);
    expect(conferir(boteco(true), [bate(), toca(0, 2), cai(2), toca(2, 4), cai(4)]).valores['mao-quente']).toBe(2);
  });
});

describe('Pelo meio', () => {
  it('só as bolas que caíram nas caçapas do meio', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 2), cai(2, MEIO), toca(0, 4), cai(4, 'canto-x+z+'), cai(6, 'meio-z-')]);
    expect(c.valores['pelo-meio']).toBe(2);
    expect(c.valores['mao-quente']).toBe(3);
  });

  it('na caçapa de canto não conta', () => {
    expect(conferir(boteco(true), [bate(), toca(0, 2), cai(2, CANTO)]).valores['pelo-meio']).toBeUndefined();
  });
});

describe('Saída premiada', () => {
  it('matar na tacada de saída conta; na seguinte, não', () => {
    const saida = boteco(false);
    expect(saida.fase).toBe('saida');
    expect(conferir(saida, [bate(), toca(0, 2), cai(2)]).valores['saida-premiada']).toBe(1);
    expect(conferir(boteco(true), [bate(), toca(0, 2), cai(2)]).valores['saida-premiada']).toBeUndefined();
  });

  it('saída sem matar nada, ou com falta, não conta', () => {
    expect(conferir(boteco(false), [bate(), toca(0, 2)]).valores['saida-premiada']).toBeUndefined();
    expect(conferir(boteco(false), [bate(), toca(0, 2), cai(2), cai(0)]).valores['saida-premiada']).toBeUndefined();
  });
});

describe('Embalado (2 bolas seguidas na mesma vez)', () => {
  it('a bola de agora soma à sequência de antes: 1 antes + 1 agora = 2', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 2), cai(2)], { seguidasAntes: 1 });
    expect(c.valores.embalado).toBe(2);
    expect(c.seguidas).toBe(2);
    expect(c.encerraAVez).toBe(false);
  });

  it('uma só, sem sequência de antes, vale 1 (anda, mas não cumpre)', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 2), cai(2)]);
    expect(c.valores.embalado).toBe(1);
    expect(c.seguidas).toBe(1);
  });

  it('errar a tacada zera a sequência', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 2)], { seguidasAntes: 1 });
    expect(c.valores.embalado).toBeUndefined();
    expect(c.seguidas).toBe(0);
    expect(c.encerraAVez).toBe(true);
  });

  it('matar a sua e a do adversário passa a vez: a sua conta na sequência, e a sequência recomeça (encerra a vez)', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 2), cai(2), cai(3)], { seguidasAntes: 1 });
    expect(c.mortas).toEqual([2]);
    expect(c.valores.embalado).toBe(2);
    expect(c.encerraAVez).toBe(true);
    expect(c.seguidas).toBe(0);
  });

  it('mata-mata: a vez passa a cada tacada, e a sequência é a das tacadas dele que mataram (sem encerrar a vez)', () => {
    const c = conferir(mataMata(), [bate(), toca(0, 3), cai(3)], { seguidasAntes: 1 });
    expect(c.depois.vez).not.toBe(0);
    expect(c.encerraAVez).toBe(false);
    expect(c.valores.embalado).toBe(2);
    expect(c.seguidas).toBe(2);
    expect(conferir(mataMata(), [bate(), toca(0, 3)], { seguidasAntes: 1 }).seguidas).toBe(0);
  });
});

describe('Na pancada e No carinho (a velocidade do taco)', () => {
  const mata = [bate(), toca(0, 2), cai(2)];

  it('Na pancada: 3,4 m/s ou mais', () => {
    expect(conferir(boteco(true), mata, { parametros: com({ velocidadeTaco: 3.4 }) }).valores['na-pancada']).toBe(1);
    expect(conferir(boteco(true), mata, { parametros: com({ velocidadeTaco: 6 }) }).valores['na-pancada']).toBe(1);
    expect(conferir(boteco(true), mata, { parametros: com({ velocidadeTaco: 3.39 }) }).valores['na-pancada']).toBeUndefined();
  });

  it('No carinho: 1,0 m/s ou menos', () => {
    expect(conferir(boteco(true), mata, { parametros: com({ velocidadeTaco: 1.0 }) }).valores['no-carinho']).toBe(1);
    expect(conferir(boteco(true), mata, { parametros: com({ velocidadeTaco: 0.3 }) }).valores['no-carinho']).toBe(1);
    expect(conferir(boteco(true), mata, { parametros: com({ velocidadeTaco: 1.01 }) }).valores['no-carinho']).toBeUndefined();
  });

  it('sem matar, a força não vale nada', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 2)], { parametros: com({ velocidadeTaco: 6 }) });
    expect(c.valores['na-pancada']).toBeUndefined();
  });
});

describe('Efeito inglês, Siga! e Puxada (o efeito do taco)', () => {
  const mata = [bate(), toca(0, 2), cai(2)];
  const valor = (efeito: { lateral?: number; vertical?: number }) => conferir(boteco(true), mata, { parametros: com({ efeito }) }).valores;

  it('Efeito inglês: lateral de 0,5 ou mais, para qualquer lado', () => {
    expect(valor({ lateral: 0.5 })['efeito-ingles']).toBe(1);
    expect(valor({ lateral: -0.7 })['efeito-ingles']).toBe(1);
    expect(valor({ lateral: 0.49 })['efeito-ingles']).toBeUndefined();
    expect(valor({ vertical: 0.9 })['efeito-ingles']).toBeUndefined();
  });

  it('Siga!: vertical de +0,5 ou mais', () => {
    expect(valor({ vertical: 0.5 }).siga).toBe(1);
    expect(valor({ vertical: 0.49 }).siga).toBeUndefined();
    expect(valor({ vertical: -0.9 }).siga).toBeUndefined();
  });

  it('Puxada: vertical de −0,5 ou menos', () => {
    expect(valor({ vertical: -0.5 }).puxada).toBe(1);
    expect(valor({ vertical: -0.49 }).puxada).toBeUndefined();
    expect(valor({ vertical: 0.9 }).puxada).toBeUndefined();
  });

  it('as três juntas numa tacada que usa os dois efeitos', () => {
    const v = valor({ lateral: 0.6, vertical: -0.6 });
    expect(v['efeito-ingles']).toBe(1);
    expect(v.puxada).toBe(1);
    expect(v.siga).toBeUndefined();
  });
});

describe('Tabelada (a bola bate na tabela depois de tocada e antes de cair)', () => {
  it('tocada pela branca, bate na tabela e cai', () => {
    expect(conferir(boteco(true), [bate(), toca(0, 2), tabela(2), cai(2)]).valores.tabelada).toBe(1);
  });

  it('tocada por outra bola (a branca bateu na 3, a 3 na 2) também vale', () => {
    expect(conferir(boteco(true), [bate(), toca(0, 4), toca(4, 2), tabela(2), cai(2)]).valores.tabelada).toBe(1);
  });

  it('a tabela tem de ser da bola que caiu, depois do primeiro toque nela', () => {
    expect(conferir(boteco(true), [bate(), tabela(2), toca(0, 2), cai(2)]).valores.tabelada).toBeUndefined();
    expect(conferir(boteco(true), [bate(), tabela(0), toca(0, 2), cai(2)]).valores.tabelada).toBeUndefined();
    expect(conferir(boteco(true), [bate(), toca(0, 2), tabela(4), cai(2)]).valores.tabelada).toBeUndefined();
  });

  it('sem tabela entre o toque e a caçapa, nada; e a tabela depois de cair não existe', () => {
    expect(conferir(boteco(true), [bate(), toca(0, 2), cai(2)]).valores.tabelada).toBeUndefined();
  });

  it('só a bola que bateu na tabela conta, não a do lado dela (2 bateu, 4 não)', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 2), toca(0, 4), tabela(2), cai(2), cai(4)]);
    expect(c.valores.tabelada).toBe(1);
    expect(c.valores['mao-quente']).toBe(2);
  });
});

describe('De longe (a bola estava a mais de 1,5 m da branca)', () => {
  const mata = [bate(), toca(0, 2), cai(2)];

  it('mede no primeiro quadro: 1,6 m conta', () => {
    expect(conferir(boteco(true), mata, { branca: [-1, 0], onde: { 2: [0.6, 0] } }).valores['de-longe']).toBe(1);
  });

  it('exatamente 1,5 m, ou menos, não conta (é "mais de")', () => {
    expect(conferir(boteco(true), mata, { branca: [0, 0], onde: { 2: [1.5, 0] } }).valores['de-longe']).toBeUndefined();
    expect(conferir(boteco(true), mata, { branca: [0, 0], onde: { 2: [0.8, 0.5] } }).valores['de-longe']).toBeUndefined();
  });

  it('conta a distância em z também (a mesa é larga)', () => {
    expect(conferir(boteco(true), mata, { branca: [0, -0.9], onde: { 2: [1.2, 0.9] } }).valores['de-longe']).toBe(1);
  });

  it('só a bola longe conta quando duas caem', () => {
    const c = conferir(boteco(true), [bate(), toca(0, 2), cai(2), toca(0, 4), cai(4)], { branca: [-1, 0], onde: { 2: [0.8, 0], 4: [-0.5, 0.2] } });
    expect(c.valores['de-longe']).toBe(1);
    expect(c.valores['mao-quente']).toBe(2);
  });
});

describe('Volta ao mundo (3 tabelas da branca antes de tocar bola, sem falta)', () => {
  it('três tabelas e depois toca: conta, mesmo sem matar nada', () => {
    const c = conferir(boteco(true), [bate(), tabela(0), tabela(0), tabela(0), toca(0, 2)]);
    expect(c.valores['volta-ao-mundo']).toBe(1);
    expect(c.mortas).toEqual([]);
  });

  it('duas tabelas não bastam; as depois do primeiro toque não contam; as de outra bola também não', () => {
    expect(conferir(boteco(true), [bate(), tabela(0), tabela(0), toca(0, 2)]).valores['volta-ao-mundo']).toBeUndefined();
    expect(conferir(boteco(true), [bate(), tabela(0), tabela(0), toca(0, 2), tabela(0)]).valores['volta-ao-mundo']).toBeUndefined();
    expect(conferir(boteco(true), [bate(), tabela(0), tabela(0), tabela(5), toca(0, 2)]).valores['volta-ao-mundo']).toBeUndefined();
  });

  it('com falta não conta: a branca cai depois, ou toca primeiro a bola do adversário, ou não toca ninguém', () => {
    expect(conferir(boteco(true), [bate(), tabela(0), tabela(0), tabela(0), toca(0, 2), cai(0)]).valores['volta-ao-mundo']).toBeUndefined();
    expect(conferir(boteco(true), [bate(), tabela(0), tabela(0), tabela(0), toca(0, 3)]).valores['volta-ao-mundo']).toBeUndefined();
    expect(conferir(boteco(true), [bate(), tabela(0), tabela(0), tabela(0)]).valores['volta-ao-mundo']).toBeUndefined();
  });

  it('mais de três também conta', () => {
    expect(conferir(boteco(true), [bate(), tabela(0), tabela(0), tabela(0), tabela(0), toca(0, 2)]).valores['volta-ao-mundo']).toBe(1);
  });
});

// ---------------------------------------------------------------- fim da partida

describe('as missões de partida inteira (conferirFimDaPartida)', () => {
  const rol = (faltasA: number, faltasB: number) => [
    { lugar: 0, equipe: 0, faltas: faltasA },
    { lugar: 1, equipe: 1, faltas: faltasB },
  ];

  it('Freguês da casa conta para todo o rol; Fecha a conta e Limpinho, só para a equipe vencedora', () => {
    const fim = conferirFimDaPartida(rol(0, 0), 0);
    expect(fim.get(0)).toEqual({ 'fregues-da-casa': 1, 'fecha-a-conta': 1, limpinho: 1 });
    expect(fim.get(1)).toEqual({ 'fregues-da-casa': 1 });
  });

  it('Limpinho exige zero faltas de quem ganhou; a falta do adversário não atrapalha', () => {
    expect(conferirFimDaPartida(rol(1, 0), 0).get(0)).toEqual({ 'fregues-da-casa': 1, 'fecha-a-conta': 1 });
    expect(conferirFimDaPartida(rol(0, 5), 0).get(0)).toHaveProperty('limpinho');
  });

  it('na dupla, cada um responde só pelas faltas dele', () => {
    const dupla = [
      { lugar: 0, equipe: 0, faltas: 0 },
      { lugar: 1, equipe: 1, faltas: 0 },
      { lugar: 2, equipe: 0, faltas: 2 },
      { lugar: 3, equipe: 1, faltas: 0 },
    ];
    const fim = conferirFimDaPartida(dupla, 0);
    expect(fim.get(0)).toHaveProperty('limpinho');
    expect(fim.get(2)).not.toHaveProperty('limpinho');
    expect(fim.get(2)).toHaveProperty('fecha-a-conta');
  });

  it('mata-mata: o vencedor é uma equipe de um só', () => {
    const fim = conferirFimDaPartida([{ lugar: 0, equipe: 0, faltas: 0 }, { lugar: 1, equipe: 1, faltas: 0 }, { lugar: 2, equipe: 2, faltas: 1 }], 1);
    expect(fim.get(1)).toHaveProperty('limpinho');
    expect(fim.get(2)).toEqual({ 'fregues-da-casa': 1 });
  });

  it('partida sem vencedor não conta para ninguém', () => {
    expect(conferirFimDaPartida(rol(0, 0), null).size).toBe(0);
  });
});

// ---------------------------------------------------------------- a física de verdade

describe('com a física real (a mesa arrumada, o taco batendo)', () => {
  const partida = boteco(false);
  const { arrumacao } = novaPartida(PRESET_BOTECO.regras, DOIS, rng());
  const mesa = mesaInicial(arrumacao, CONFIG_FISICA_PADRAO, criarRng(3));
  const visao = { partida, mesa, seq: 0 };

  /** A tacada da visão já montada como o cliente a monta, conferida com as consequências das regras sobre os mesmos eventos. */
  function conferirReal(m: ReturnType<typeof tacadaDaVisao>, seguidasAntes = 0) {
    const r = aplicarTacada(partida, m.gravacao.eventos);
    return { r, c: conferirTacada({ parametros: m.parametros, gravacao: m.gravacao, consequencias: r.consequencias, antes: partida, depois: r.partida, seguidasAntes }) };
  }

  it('uma quebra que mata sem falta: mortas = o que as regras puseram em encacapadas, e vale Mão quente e Saída premiada', () => {
    const m = acharTacada(visao, (t) => {
      const { r, c } = conferirReal(t);
      return c.mortas.length > 0 && r.consequencias.faltas.length === 0;
    });
    const { r, c } = conferirReal(m);
    expect(c.mortas).toEqual(r.partida.encacapadas.map((e) => e.bola));
    expect(c.valores['mao-quente']).toBe(c.mortas.length);
    expect(c.valores['saida-premiada']).toBe(1);
    // o triângulo está a 1,05 a 1,24 m da branca na saída: perto demais para "de longe" (mais de 1,5 m)
    expect(c.valores['de-longe']).toBeUndefined();
  });

  it('com a branca recuada até a tabela da cabeceira, uma bola do triângulo que cai vale De longe (a distância medida no quadro 0 da gravação)', () => {
    const recuada = { bolas: mesa.bolas.map((b) => (b.id === 0 ? { ...b, posicao: { ...b.posicao, x: -1.05 } } : b)) };
    const dos = { partida: { ...partida, grupos: ['par', 'impar'] as const, fase: 'grupos' as const }, mesa: recuada, seq: 0 };
    const m = acharTacada(dos, (t) => {
      const r = aplicarTacada(dos.partida, t.gravacao.eventos);
      return r.consequencias.faltas.length === 0 && r.partida.encacapadas.length > 0 && r.partida.encacapadas.every((e) => e.bola % 2 === 0 && e.bola !== 8);
    });
    const r = aplicarTacada(dos.partida, m.gravacao.eventos);
    const c = conferirTacada({ parametros: m.parametros, gravacao: m.gravacao, consequencias: r.consequencias, antes: dos.partida, depois: r.partida, seguidasAntes: 0 });
    const g = m.gravacao;
    const dist = (id: number): number => {
      const a = g.ids.indexOf(0) * 3;
      const b = g.ids.indexOf(id) * 3;
      return Math.hypot(g.posicoes[a]! - g.posicoes[b]!, g.posicoes[a + 2]! - g.posicoes[b + 2]!);
    };
    expect(c.mortas.length).toBeGreaterThan(0);
    expect(c.valores['de-longe']).toBe(c.mortas.filter((b) => dist(b) > 1.5).length || undefined);
    expect(c.mortas.every((b) => dist(b) > 1.5)).toBe(true);
  });

  it('uma quebra que cai a branca e uma bola do grupo: falta, e nada conta', () => {
    const m = acharTacada(visao, (t) => {
      const { r } = conferirReal(t);
      return r.consequencias.faltas.some((f) => f.nome === 'suicidio') && r.partida.encacapadas.length > 0;
    });
    const { r, c } = conferirReal(m);
    expect(r.partida.encacapadas.length).toBeGreaterThan(0);
    expect(c.mortas).toEqual([]);
    expect(c.valores).toEqual({});
  });

  it('uma tacada que bate na tabela e cai uma bola depois de tocada: Tabelada, confirmada nos eventos', () => {
    // varre ângulos, forças e efeitos até a física dar uma bola que tocou, bateu na tabela e caiu
    let achada: ReturnType<typeof tacadaDaVisao> | null = null;
    for (const velocidadeTaco of [8, 6, 4]) {
      for (let a = -Math.PI; a < Math.PI && !achada; a += 0.01) {
        const t = tacadaDaVisao(visao, { angulo: a, velocidadeTaco, efeito: { lateral: 0, vertical: 0.1 }, elevacao: 0, giz: 1 }, 11);
        if (conferirReal(t).c.valores.tabelada) achada = t;
      }
      if (achada) break;
    }
    expect(achada, 'a física não deu nenhuma tabelada na quebra varrida').not.toBeNull();
    const { c } = conferirReal(achada!);
    const evs = achada!.gravacao.eventos;
    const bola = c.mortas.find((b) => {
      const toque = evs.findIndex((e) => e.tipo === 'bola-bola' && (e.a === b || e.b === b));
      const queda = evs.findIndex((e) => e.tipo === 'cacapa' && e.bola === b);
      const banda = evs.findIndex((e) => e.tipo === 'bola-tabela' && e.bola === b);
      return toque >= 0 && banda > toque && queda > banda;
    });
    expect(bola, 'a bola da Tabelada tem toque, tabela e queda nessa ordem').toBeDefined();
  });

  it('o efeito e a força vêm dos parâmetros da tacada: a mesma quebra com efeito lateral 0,6 também vale Efeito inglês', () => {
    const base = acharTacada(visao, (t) => {
      const { r, c } = conferirReal(t);
      return c.mortas.length > 0 && r.consequencias.faltas.length === 0;
    });
    const parametros: ParametrosTacada = { ...base.parametros, efeito: { lateral: 0.6, vertical: base.parametros.efeito.vertical } };
    const { c } = conferirReal({ ...base, parametros });
    expect(c.valores['efeito-ingles']).toBe(1);
    expect(conferirReal(base).c.valores['efeito-ingles']).toBeUndefined();
    // e a simulação com esse efeito mesmo existe (a conferência não depende dela, mas o parâmetro é um que a física aceita)
    expect(() => simularTacada(mesa, parametros, criarRng(11), CONFIG_FISICA_PADRAO)).not.toThrow();
  });
});
