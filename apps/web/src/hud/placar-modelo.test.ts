import { describe, expect, it } from 'vitest';
import { PRESET_BOTECO, PRESET_MATA_MATA, bolasDaCasa, type ConfigRegras, type EstadoPartida } from '@sinuca/regras';
import { jogaPorPontos, modeloDoPlacar } from './placar-modelo';

/** A casa com a bola final na 8 (bolas 2–14) e a antiga, com a 1 (bolas 1–15): o placar lê o número das regras. */
const CASA_8: ConfigRegras = { ...PRESET_BOTECO.regras, bolas: '2-14', bolaFinal: 8 };
const CASA_1: ConfigRegras = { ...PRESET_BOTECO.regras, bolas: '1-15', bolaFinal: 1 };
const TODAS = bolasDaCasa(CASA_8);

function partida(mudancas: Partial<EstadoPartida> = {}): EstadoPartida {
  return {
    config: CASA_8,
    jogadores: [
      { id: 'a', nome: 'Ana', equipe: 0 },
      { id: 'b', nome: 'Beto', equipe: 1 },
    ],
    vez: 0,
    grupos: [null, null],
    fase: 'saida',
    naMesa: TODAS,
    encacapadas: [],
    retiradas: [],
    vencedor: null,
    ...mudancas,
  };
}

describe('modeloDoPlacar', () => {
  it('na saída: ninguém tem grupo e a vez é do primeiro', () => {
    const m = modeloDoPlacar(partida());
    expect(m.linhas.map((l) => l.naVez)).toEqual([true, false]);
    expect(m.linhas.map((l) => l.rotuloGrupo)).toEqual(['A definir', 'A definir']);
    expect(m.linhas.every((l) => l.restantes.length === 0)).toBe(true);
    expect(m.objetivo).toBe('Tacada de saída');
  });

  it('mesa aberta explica como definir o grupo', () => {
    expect(modeloDoPlacar(partida({ fase: 'aberta' })).objetivo).toMatch(/Mesa aberta/);
  });

  it('com grupos: lista as bolas que faltam de cada um, sem a bola final', () => {
    const m = modeloDoPlacar(partida({ fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3, 4, 7, 8, 9, 13] }));
    expect(m.linhas[0]).toMatchObject({ nome: 'Ana', rotuloGrupo: 'Pares' });
    expect(m.linhas[1]).toMatchObject({ nome: 'Beto', rotuloGrupo: 'Ímpares' });
    expect(m.linhas[0]!.restantes.map((f) => f.id)).toEqual([2, 4]);
    expect(m.linhas[1]!.restantes.map((f) => f.id)).toEqual([3, 7, 9, 13]);
    expect(m.objetivo).toBe('Encaçape as pares');
  });

  it('as fichas seguem a regra: as das ímpares são listradas e as das pares lisas, mesmo a 3, a 5 e a 7 que antes eram lisas', () => {
    const m = modeloDoPlacar(partida({ fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3, 4, 7, 8, 9, 10, 13] }));
    expect(m.linhas[0]!.restantes).toEqual([
      { id: 2, estilo: 'lisa' },
      { id: 4, estilo: 'lisa' },
      { id: 10, estilo: 'lisa' },
    ]);
    expect(m.linhas[1]!.restantes).toEqual([
      { id: 3, estilo: 'listrada' },
      { id: 7, estilo: 'listrada' },
      { id: 9, estilo: 'listrada' },
      { id: 13, estilo: 'listrada' },
    ]);
  });

  it('com os grupos trocados (Ana nas ímpares) o estilo acompanha o grupo, não a pessoa', () => {
    const m = modeloDoPlacar(partida({ fase: 'grupos', grupos: ['impar', 'par'], naMesa: [2, 3, 5, 6] }));
    expect(m.linhas[0]!.restantes.map((f) => f.estilo)).toEqual(['listrada', 'listrada']);
    expect(m.linhas[1]!.restantes.map((f) => f.estilo)).toEqual(['lisa', 'lisa']);
  });

  it('o objetivo acompanha quem tem a vez', () => {
    const m = modeloDoPlacar(partida({ fase: 'grupos', grupos: ['par', 'impar'], vez: 1 }));
    expect(m.linhas.map((l) => l.naVez)).toEqual([false, true]);
    expect(m.objetivo).toBe('Encaçape as ímpares');
  });

  it('na hora da bola final, o objetivo é ela, com o número das regras, e a linha de quem joga marca', () => {
    const m = modeloDoPlacar(partida({ fase: 'castigo', grupos: ['par', 'impar'], naMesa: [8, 3, 5], vez: 0 }));
    expect(m.objetivo).toBe('Só falta a 8: encaçape-a!');
    expect(m.linhas.map((l) => l.noCastigo)).toEqual([true, false]);
    expect(m.linhas.map((l) => l.bolaFinal)).toEqual([{ id: 8, estilo: 'lisa' }, null]);
    expect(m.linhas.map((l) => l.nomeDaBolaFinal)).toEqual(['a 8', null]);
    expect(m.linhas[0]!.restantes).toEqual([]);
    expect(m.linhas[1]!.restantes.map((f) => f.id)).toEqual([3, 5]);
  });

  it('o nome da bola final vem do pacote de regras: com a casa antiga (a 1 é o castigo) a marca e o texto dizem "o castigo"', () => {
    const m = modeloDoPlacar(partida({ config: CASA_1, fase: 'castigo', grupos: ['par', 'impar'], naMesa: [1, 3, 5], vez: 0 }));
    expect(m.objetivo).toBe('Só falta o castigo: encaçape-o!');
    expect(m.linhas[0]!.bolaFinal).toEqual({ id: 1, estilo: 'lisa' });
    expect(m.linhas[0]!.nomeDaBolaFinal).toBe('o castigo');
  });

  it('a marca da bola final só vale para quem tem a vez', () => {
    const m = modeloDoPlacar(partida({ fase: 'castigo', grupos: ['par', 'impar'], naMesa: [8, 3, 5], vez: 1 }));
    expect(m.linhas.map((l) => l.noCastigo)).toEqual([false, false]);
    expect(m.linhas.map((l) => l.bolaFinal)).toEqual([null, null]);
  });

  it('com bolas do grupo na mesa, o castigo ainda não é o objetivo', () => {
    const m = modeloDoPlacar(partida({ fase: 'grupos', grupos: ['par', 'impar'], naMesa: [8, 2, 4], vez: 0 }));
    expect(m.objetivo).toBe('Encaçape as pares');
    expect(m.linhas.map((l) => l.noCastigo)).toEqual([false, false]);
  });

  it('em 2-15 as ímpares incluem a bola 3 em diante e a 1 não aparece', () => {
    const m = modeloDoPlacar(
      partida({ config: { ...PRESET_BOTECO.regras, bolas: '2-15' }, fase: 'grupos', grupos: [null, 'impar'], naMesa: [2, 3, 5] }),
    );
    expect(m.linhas[1]!.restantes.map((f) => f.id)).toEqual([3, 5]);
    expect(m.linhas[1]!.restantes.every((f) => f.estilo === 'listrada')).toBe(true);
  });

  it('duplas: os jogadores da mesma equipe dividem a linha, o grupo e as fichas; o de quem taca fica marcado', () => {
    const m = modeloDoPlacar(
      partida({
        jogadores: [
          { id: 'a', nome: 'Ana', equipe: 0 },
          { id: 'b', nome: 'Beto', equipe: 1 },
          { id: 'c', nome: 'Caio', equipe: 0 },
          { id: 'd', nome: 'Duda', equipe: 1 },
        ],
        fase: 'grupos',
        grupos: ['par', 'impar'],
        naMesa: [2, 3],
        vez: 2,
      }),
    );
    expect(m.linhas.map((l) => [l.nome, l.jogador, l.rotuloGrupo, l.naVez])).toEqual([
      ['Ana e Caio', 0, 'Pares', true],
      ['Beto e Duda', 1, 'Ímpares', false],
    ]);
    expect(m.linhas[0]!.membros.map((x) => [x.nome, x.naVez])).toEqual([
      ['Ana', false],
      ['Caio', true],
    ]);
    expect(m.linhas[1]!.membros.some((x) => x.naVez)).toBe(false);
    expect(m.linhas[0]!.restantes.map((f) => f.id)).toEqual([2]);
  });

  it('no fim ninguém está na vez', () => {
    const m = modeloDoPlacar(partida({ fase: 'fim', vencedor: 0 }));
    expect(m.linhas.some((l) => l.naVez)).toBe(false);
    expect(m.objetivo).toBe('Fim de partida');
  });

  it('não muta o estado nem a lista de bolas', () => {
    const naMesa = [5, 3, 8];
    const p = partida({ fase: 'grupos', grupos: ['par', 'impar'], naMesa });
    modeloDoPlacar(p);
    expect(naMesa).toEqual([5, 3, 8]);
  });
});

describe('modeloDoPlacar — resumo da linha', () => {
  it('diz o grupo e quantas bolas faltam, para não precisar contar as fichas', () => {
    const m = modeloDoPlacar(partida({ fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3, 4, 7, 8, 9, 13] }));
    expect(m.linhas.map((l) => l.resumo)).toEqual(['Pares · 2 restantes', 'Ímpares · 4 restantes']);
  });

  it('no singular quando falta uma; "todas encaçapadas" quando não falta nenhuma', () => {
    const m = modeloDoPlacar(partida({ fase: 'grupos', grupos: ['par', 'impar'], naMesa: [8, 3, 5, 7, 9, 11, 13, 2] }));
    expect(m.linhas[0]!.resumo).toBe('Pares · 1 restante');
    const fim = modeloDoPlacar(partida({ fase: 'castigo', grupos: ['par', 'impar'], naMesa: [8, 3, 5, 7, 9, 11, 13] }));
    expect(fim.linhas[0]!.resumo).toBe('Pares · todas encaçapadas');
  });

  it('sem grupo definido não há contagem', () => {
    const m = modeloDoPlacar(partida({ fase: 'aberta' }));
    expect(m.linhas.map((l) => l.resumo)).toEqual(['Grupo a definir', 'Grupo a definir']);
  });
  it('no hot-seat não há presença; online cada jogador diz se está na sala e se sou eu', () => {
    expect(modeloDoPlacar(partida()).linhas.map((l) => l.membros.map((x) => x.presenca))).toEqual([[null], [null]]);
    const m = modeloDoPlacar(partida(), (id) => (id === 'a' ? { conectado: true, voce: true } : { conectado: false, voce: false }));
    expect(m.linhas.map((l) => l.membros.map((x) => x.presenca))).toEqual([
      [{ conectado: true, voce: true }],
      [{ conectado: false, voce: false }],
    ]);
  });
});

/** 2×1 na ordem da roda: Ana e Caio (equipe 0) contra Beto, sozinho (equipe 1). */
const TRIO = [
  { id: 'lugar-0', nome: 'Ana', equipe: 0 },
  { id: 'lugar-1', nome: 'Beto', equipe: 1 },
  { id: 'lugar-2', nome: 'Caio', equipe: 0 },
];

describe('modeloDoPlacar: 2x1, três nomes em duas linhas', () => {
  const noMeio = (mudancas: Partial<EstadoPartida> = {}): EstadoPartida =>
    partida({ jogadores: TRIO, fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 4, 3, 5, 7, 8], ...mudancas });

  it('uma linha por equipe com todos os nomes: "Ana e Caio" (de 2) e "Beto" (de 1), cada uma com o seu grupo e as suas bolas', () => {
    const m = modeloDoPlacar(noMeio());
    expect(m.linhas).toHaveLength(2);
    expect(m.linhas.map((l) => [l.nome, l.equipe, l.jogador, l.rotuloGrupo, l.resumo])).toEqual([
      ['Ana e Caio', 0, 0, 'Pares', 'Pares · 2 restantes'],
      ['Beto', 1, 1, 'Ímpares', 'Ímpares · 3 restantes'],
    ]);
    expect(m.linhas[0]!.restantes.map((f) => f.id)).toEqual([2, 4]);
    expect(m.linhas[1]!.restantes.map((f) => f.id)).toEqual([3, 5, 7]);
    expect(m.linhas[0]!.membros.map((x) => x.nome)).toEqual(['Ana', 'Caio']);
    expect(m.linhas[1]!.membros.map((x) => x.nome)).toEqual(['Beto']);
  });

  it('a vez: a linha da equipe e o nome de quem taca (A1, B1, A2, B1...)', () => {
    const quem = (vez: number) => {
      const m = modeloDoPlacar(noMeio({ vez }));
      return [m.linhas.map((l) => l.naVez), m.linhas.flatMap((l) => l.membros.filter((x) => x.naVez).map((x) => x.nome))];
    };
    expect(quem(0)).toEqual([[true, false], ['Ana']]);
    expect(quem(1)).toEqual([[false, true], ['Beto']]);
    expect(quem(2)).toEqual([[true, false], ['Caio']]);
  });

  it('o objetivo acompanha quem tem a vez, de qualquer equipe', () => {
    expect(modeloDoPlacar(noMeio({ vez: 2 })).objetivo).toBe('Encaçape as pares');
    expect(modeloDoPlacar(noMeio({ vez: 1 })).objetivo).toBe('Encaçape as ímpares');
  });

  it('grupos trocados: a equipe de 1 nas pares e a de 2 nas ímpares, com o estilo seguindo o grupo', () => {
    const m = modeloDoPlacar(noMeio({ grupos: ['impar', 'par'] }));
    expect(m.linhas.map((l) => l.rotuloGrupo)).toEqual(['Ímpares', 'Pares']);
    expect(m.linhas[0]!.restantes.every((f) => f.estilo === 'listrada')).toBe(true);
    expect(m.linhas[1]!.restantes.every((f) => f.estilo === 'lisa')).toBe(true);
  });

  it('o castigo é da equipe: a dupla toda vai à 8 quando acaba o grupo, e só a linha de quem tem a vez marca', () => {
    const base = noMeio({ fase: 'castigo', naMesa: [8, 3, 5] });
    const daDupla = modeloDoPlacar({ ...base, vez: 2 });
    expect(daDupla.objetivo).toBe('Só falta a 8: encaçape-a!');
    expect(daDupla.linhas.map((l) => l.noCastigo)).toEqual([true, false]);
    expect(daDupla.linhas[0]!.bolaFinal).toEqual({ id: 8, estilo: 'lisa' });
    expect(modeloDoPlacar({ ...base, vez: 1 }).linhas.map((l) => l.noCastigo)).toEqual([false, false]);
  });

  it('online cada nome leva a sua presença; no 1x2 (a equipe de 1 sai) as linhas seguem a ordem da roda', () => {
    const presenca = (id: string) => (id === 'lugar-2' ? { conectado: false, voce: false } : { conectado: true, voce: id === 'lugar-0' });
    const m = modeloDoPlacar(noMeio(), presenca);
    expect(m.linhas[0]!.membros.map((x) => x.presenca)).toEqual([
      { conectado: true, voce: true },
      { conectado: false, voce: false },
    ]);
    const saiB = [TRIO[1]!, TRIO[0]!, TRIO[2]!];
    const k = modeloDoPlacar(noMeio({ jogadores: saiB, vez: 0 }));
    expect(k.linhas.map((l) => [l.nome, l.jogador, l.naVez])).toEqual([
      ['Beto', 0, true],
      ['Ana e Caio', 1, false],
    ]);
  });

  it('no fim ninguém está na vez, nem o nome de ninguém', () => {
    const m = modeloDoPlacar(noMeio({ fase: 'fim', vencedor: 1 }));
    expect(m.linhas.some((l) => l.naVez || l.membros.some((x) => x.naVez))).toBe(false);
  });
});

// ---------------------------------------------------------------- L17: mata-mata (placar por pontos)

describe('modeloDoPlacar no mata-mata: uma linha por jogador, com os pontos', () => {
  const trio: EstadoPartida['jogadores'] = [
    { id: 'a', nome: 'Ana', equipe: 0 },
    { id: 'b', nome: 'Beto', equipe: 1 },
    { id: 'c', nome: 'Caio', equipe: 2 },
  ];
  const mata = (mudancas: Partial<EstadoPartida> = {}): EstadoPartida =>
    partida({ config: PRESET_MATA_MATA.regras, jogadores: trio, grupos: [null, null, null], naMesa: bolasDaCasa(PRESET_MATA_MATA.regras), fase: 'aberta', ...mudancas });

  it('as três linhas, na ordem das equipes, com a vez em destaque', () => {
    const m = modeloDoPlacar(mata({ vez: 1 }));
    expect(m.linhas.map((l) => [l.nome, l.equipe, l.naVez])).toEqual([
      ['Ana', 0, false],
      ['Beto', 1, true],
      ['Caio', 2, false],
    ]);
  });

  it('cada bola encaçapada vale um ponto para quem tacou: a linha diz os pontos (pontosPorEquipe) e mostra as bolas que a pessoa matou', () => {
    const encacapadas = [
      { bola: 1, jogador: 0 },
      { bola: 9, jogador: 0 },
      { bola: 4, jogador: 2 },
    ];
    const m = modeloDoPlacar(mata({ encacapadas, naMesa: bolasDaCasa(PRESET_MATA_MATA.regras).filter((b) => ![1, 9, 4].includes(b)) }));
    expect(m.linhas.map((l) => [l.pontos, l.resumo])).toEqual([
      [2, '2 pontos'],
      [0, '0 pontos'],
      [1, '1 ponto'],
    ]);
    expect(m.linhas[0]!.encacapadas.map((f) => f.id)).toEqual([1, 9]);
    expect(m.linhas[2]!.encacapadas.map((f) => f.id)).toEqual([4]);
    expect(m.linhas[1]!.encacapadas).toEqual([]);
  });

  it('as fichas seguem a convenção do par ou ímpar: ímpar listrada, par lisa, a 8 também lisa', () => {
    const m = modeloDoPlacar(mata({ encacapadas: [1, 2, 8, 9, 15].map((bola) => ({ bola, jogador: 0 })) }));
    expect(m.linhas[0]!.encacapadas).toEqual([
      { id: 1, estilo: 'listrada' },
      { id: 2, estilo: 'lisa' },
      { id: 8, estilo: 'lisa' },
      { id: 9, estilo: 'listrada' },
      { id: 15, estilo: 'listrada' },
    ]);
  });

  it('não há grupo, bolas que faltam nem bola final: o objetivo é o ponto de cada bola', () => {
    const m = modeloDoPlacar(mata());
    expect(m.linhas.every((l) => l.grupo === null && l.restantes.length === 0 && !l.noCastigo && l.bolaFinal === null)).toBe(true);
    expect(m.objetivo).toBe('Cada bola encaçapada vale 1 ponto');
  });

  it('na saída e no fim o objetivo é o de sempre', () => {
    expect(modeloDoPlacar(mata({ fase: 'saida' })).objetivo).toBe('Tacada de saída');
    expect(modeloDoPlacar(mata({ fase: 'fim', vencedor: 0 })).objetivo).toBe('Fim de partida');
  });

  it('no fim ninguém está na vez', () => {
    expect(modeloDoPlacar(mata({ fase: 'fim', vencedor: 0 })).linhas.some((l) => l.naVez)).toBe(false);
  });

  it('quatro jogadores: quatro linhas com as equipes 0 a 3', () => {
    const m = modeloDoPlacar(mata({ jogadores: [...trio, { id: 'd', nome: 'Dani', equipe: 3 }], grupos: [null, null, null, null] }));
    expect(m.linhas.map((l) => l.equipe)).toEqual([0, 1, 2, 3]);
  });

  it('o par ou ímpar continua sem pontos nem bolas encaçapadas na linha', () => {
    const m = modeloDoPlacar(partida({ fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3] }));
    expect(m.linhas.every((l) => l.pontos === null && l.encacapadas.length === 0)).toBe(true);
    expect(jogaPorPontos(partida())).toBe(false);
    expect(jogaPorPontos(mata())).toBe(true);
  });

  it('o placar guarda o número da equipe em cada linha, mesmo quando a roda não começa por ela (a pessoa mantém a equipe)', () => {
    const girada = [trio[1]!, trio[2]!, trio[0]!];
    const m = modeloDoPlacar(mata({ jogadores: girada, vez: 0 }));
    expect(m.linhas.map((l) => [l.nome, l.equipe, l.jogador])).toEqual([
      ['Beto', 1, 0],
      ['Caio', 2, 1],
      ['Ana', 0, 2],
    ]);
  });
});

// ---------------------------------------------------------------- L19: quem perde a próxima vez

describe('modeloDoPlacar: quem perde a próxima vez (perdemAProximaVez)', () => {
  const trio: EstadoPartida['jogadores'] = [
    { id: 'a', nome: 'Ana', equipe: 0 },
    { id: 'b', nome: 'Beto', equipe: 1 },
    { id: 'c', nome: 'Caio', equipe: 2 },
  ];
  const mata = (mudancas: Partial<EstadoPartida> = {}): EstadoPartida =>
    partida({ config: PRESET_MATA_MATA.regras, jogadores: trio, grupos: [null, null, null], naMesa: bolasDaCasa(PRESET_MATA_MATA.regras), fase: 'aberta', ...mudancas });

  it('quem está na lista ganha a marca na própria linha e no próprio membro; os outros não', () => {
    const m = modeloDoPlacar(mata({ vez: 1, perdemAProximaVez: [0] }));
    expect(m.linhas.map((l) => [l.nome, l.perdeAProxima])).toEqual([
      ['Ana', true],
      ['Beto', false],
      ['Caio', false],
    ]);
    expect(m.linhas[0]!.membros[0]!.perdeAProxima).toBe(true);
    expect(m.linhas[1]!.membros[0]!.perdeAProxima).toBe(false);
  });

  it('mais de um na lista: cada um na sua linha', () => {
    const m = modeloDoPlacar(mata({ vez: 2, perdemAProximaVez: [0, 1] }));
    expect(m.linhas.map((l) => l.perdeAProxima)).toEqual([true, true, false]);
  });

  it('o campo ausente (o de sempre) ou vazio não marca ninguém', () => {
    expect(modeloDoPlacar(mata()).linhas.every((l) => !l.perdeAProxima && l.membros.every((x) => !x.perdeAProxima))).toBe(true);
    expect(modeloDoPlacar(mata({ perdemAProximaVez: [] })).linhas.some((l) => l.perdeAProxima)).toBe(false);
  });

  it('a marca não depende da modalidade: o campo basta (no par ou ímpar, se viesse, também marcaria)', () => {
    const m = modeloDoPlacar(partida({ fase: 'grupos', grupos: ['par', 'impar'], vez: 1, perdemAProximaVez: [0] }));
    expect(m.linhas.map((l) => l.perdeAProxima)).toEqual([true, false]);
  });

  it('no fim da partida ninguém é marcado, mesmo que a lista tenha ficado', () => {
    const m = modeloDoPlacar(mata({ fase: 'fim', vencedor: 0, perdemAProximaVez: [1] }));
    expect(m.linhas.some((l) => l.perdeAProxima)).toBe(false);
  });

  it('o resto da linha (pontos, bolas, vez) não muda por causa da marca', () => {
    const com = modeloDoPlacar(mata({ vez: 1, perdemAProximaVez: [0], encacapadas: [{ bola: 4, jogador: 0 }], naMesa: bolasDaCasa(PRESET_MATA_MATA.regras).filter((b) => b !== 4) }));
    const sem = modeloDoPlacar(mata({ vez: 1, encacapadas: [{ bola: 4, jogador: 0 }], naMesa: bolasDaCasa(PRESET_MATA_MATA.regras).filter((b) => b !== 4) }));
    const semMarca = (l: (typeof com.linhas)[number]) => ({ ...l, perdeAProxima: false, membros: l.membros.map((x) => ({ ...x, perdeAProxima: false })) });
    expect(com.linhas.map(semMarca)).toEqual(sem.linhas.map(semMarca));
    expect(com.objetivo).toBe(sem.objetivo);
  });

  it('a marca entra na chave do que o placar desenha (o modelo muda, então a linha é refeita)', () => {
    const com = JSON.stringify(modeloDoPlacar(mata({ vez: 1, perdemAProximaVez: [0] })));
    const sem = JSON.stringify(modeloDoPlacar(mata({ vez: 1 })));
    expect(com).not.toBe(sem);
  });
});
