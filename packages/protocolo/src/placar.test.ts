import { describe, expect, it } from 'vitest';
import { LIMITES_PROTOCOLO } from './limites';
import { PLACAR_VAZIO, placarNoFio, registrarPartida, type JogadorDoPlacar, type PartidaTerminada, type PlacarGuardado } from './placar';
import { validarMensagemDaSala } from './esquemas';
import { codificarMensagem, decodificarMensagemDaSala } from './fio';
import { codificarUtf8 } from './utf8';

const pessoa = (id: string, nome = id): JogadorDoPlacar => ({ id, nome });
const [ana, beto, cida, davi, eva] = ['Ana', 'Beto', 'Cida', 'Davi', 'Eva'].map((n) => pessoa(n.toLowerCase(), n));
const A = ana!;
const B = beto!;
const C = cida!;
const D = davi!;
const E = eva!;

/** `venceu` é a equipe vencedora da partida (0 ou 1). */
const jogo = (equipe0: JogadorDoPlacar[], equipe1: JogadorDoPlacar[], venceu: 0 | 1): PartidaTerminada => ({ equipes: [equipe0, equipe1], vencedor: venceu });

const contar = (partidas: PartidaTerminada[], inicio: PlacarGuardado = PLACAR_VAZIO, maximo?: number): PlacarGuardado =>
  partidas.reduce((p, partida) => registrarPartida(p, partida, maximo), inicio);

/** O placar do fio num formato curto: "Ana 3 x 1 Beto" (e o histórico, do mais recente para o mais antigo). */
function resumo(p: PlacarGuardado): { atual: string | null; historico: string[] } {
  const texto = (c: NonNullable<ReturnType<typeof placarNoFio>['atual']>): string =>
    `${c.lados[0].nomes.join(' e ')} ${c.lados[0].vitorias} x ${c.lados[1].vitorias} ${c.lados[1].nomes.join(' e ')}`;
  const fio = placarNoFio(p);
  return { atual: fio.atual ? texto(fio.atual) : null, historico: fio.historico.map(texto) };
}

describe('registrarPartida — a primeira partida e a soma', () => {
  it('o placar começa sem confronto nem histórico', () => {
    expect(placarNoFio(PLACAR_VAZIO)).toEqual({ atual: null, historico: [] });
  });

  it('a primeira partida abre um confronto em 1 x 0 para quem venceu: equipe 0 ou equipe 1', () => {
    expect(resumo(contar([jogo([A], [B], 0)]))).toEqual({ atual: 'Ana 1 x 0 Beto', historico: [] });
    expect(resumo(contar([jogo([A], [B], 1)]))).toEqual({ atual: 'Ana 0 x 1 Beto', historico: [] });
  });

  it('mesma formação soma: 3 x 1 depois de quatro partidas', () => {
    const p = contar([jogo([A], [B], 0), jogo([A], [B], 0), jogo([A], [B], 1), jogo([A], [B], 0)]);
    expect(resumo(p)).toEqual({ atual: 'Ana 3 x 1 Beto', historico: [] });
  });

  it('a ordem dentro do lado não importa: Ana e Cida contra Beto e Davi, dos dois jeitos', () => {
    const p = contar([jogo([A, C], [B, D], 0), jogo([C, A], [D, B], 0), jogo([A, C], [D, B], 1)]);
    expect(resumo(p)).toEqual({ atual: 'Ana e Cida 2 x 1 Beto e Davi', historico: [] });
  });

  it('o apelido do confronto é o de quando ele abriu; a identidade é o id, não o nome', () => {
    const p = contar([jogo([A], [B], 0), jogo([pessoa('ana', 'Aninha')], [B], 0)]);
    expect(resumo(p)).toEqual({ atual: 'Ana 2 x 0 Beto', historico: [] });
  });
});

describe('registrarPartida — lados trocados espelham', () => {
  it('Ana e Beto trocam de equipe: o confronto é o mesmo e a vitória segue a pessoa', () => {
    // a 2ª partida tem Beto na equipe 0 e Ana na 1; a equipe 1 (Ana) vence: conta para a Ana
    const p = contar([jogo([A], [B], 0), jogo([B], [A], 1)]);
    expect(resumo(p)).toEqual({ atual: 'Ana 2 x 0 Beto', historico: [] });
    // o Beto vence como equipe 0 depois da troca: conta para o Beto
    expect(resumo(registrarPartida(p, jogo([B], [A], 0)))).toEqual({ atual: 'Ana 2 x 1 Beto', historico: [] });
  });

  it('a orientação do confronto não gira com a troca: lados[0] continua sendo quem abriu', () => {
    const p = contar([jogo([A, C], [B, D], 1), jogo([B, D], [A, C], 0), jogo([D, B], [C, A], 0)]);
    expect(resumo(p)).toEqual({ atual: 'Ana e Cida 0 x 3 Beto e Davi', historico: [] });
  });

  it('um lado igual e o outro diferente não é o mesmo confronto, nem espelhado: quem repete o adversário, mas não o outro, abre confronto novo', () => {
    // Ana x Beto; depois Beto (agora na equipe 0) x Cida: o Beto repete, mas do lado de lá
    expect(resumo(contar([jogo([A], [B], 0), jogo([B], [C], 0)]))).toEqual({ atual: 'Beto 1 x 0 Cida', historico: ['Ana 1 x 0 Beto'] });
    // e Cida x Ana: a Ana repete, do lado de lá
    expect(resumo(contar([jogo([A], [B], 0), jogo([C], [A], 1)]))).toEqual({ atual: 'Cida 0 x 1 Ana', historico: ['Ana 1 x 0 Beto'] });
    // em duplas: um dos quatro diferente, nos dois sentidos
    expect(resumo(contar([jogo([A, C], [B, D], 0), jogo([B, D], [A, E], 0)])).historico).toEqual(['Ana e Cida 1 x 0 Beto e Davi']);
    expect(resumo(contar([jogo([A, C], [B, D], 0), jogo([B, E], [A, C], 0)])).historico).toEqual(['Ana e Cida 1 x 0 Beto e Davi']);
  });

  it('espelhar não abre confronto novo nem mexe no histórico', () => {
    const p = contar([jogo([A], [C], 0), jogo([A], [B], 0), jogo([B], [A], 0)]);
    expect(resumo(p)).toEqual({ atual: 'Ana 1 x 1 Beto', historico: ['Ana 1 x 0 Cida'] });
  });
});

describe('registrarPartida — formação diferente abre confronto novo', () => {
  it('trocar um jogador: o confronto anterior vai para o histórico e o novo começa em 1 x 0', () => {
    const p = contar([jogo([A], [B], 0), jogo([A], [B], 0), jogo([A], [C], 1)]);
    expect(resumo(p)).toEqual({ atual: 'Ana 0 x 1 Cida', historico: ['Ana 2 x 0 Beto'] });
  });

  it('em duplas, trocar um dos quatro abre confronto novo', () => {
    const p = contar([jogo([A, C], [B, D], 0), jogo([A, C], [B, E], 0)]);
    expect(resumo(p)).toEqual({ atual: 'Ana e Cida 1 x 0 Beto e Eva', historico: ['Ana e Cida 1 x 0 Beto e Davi'] });
  });

  it('mudar o modo (2x1 para 1x1 com os mesmos dois de antes) também abre confronto novo', () => {
    const p = contar([jogo([A, C], [B], 0), jogo([A], [B], 0)]);
    expect(resumo(p)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: ['Ana e Cida 1 x 0 Beto'] });
  });

  it('só a partida anterior decide: voltar à formação antiga abre outro confronto, não retoma o velho', () => {
    const p = contar([jogo([A], [B], 0), jogo([A], [C], 0), jogo([A], [B], 0)]);
    expect(resumo(p)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: ['Ana 1 x 0 Cida', 'Ana 1 x 0 Beto'] });
  });

  it('o histórico vai do mais recente para o mais antigo', () => {
    const p = contar([jogo([A], [B], 0), jogo([A], [C], 0), jogo([A], [D], 0), jogo([A], [E], 0)]);
    expect(resumo(p).historico).toEqual(['Ana 1 x 0 Davi', 'Ana 1 x 0 Cida', 'Ana 1 x 0 Beto']);
  });

  it('duas pessoas com o mesmo apelido mas ids diferentes não são a mesma pessoa', () => {
    const p = contar([jogo([pessoa('p1', 'Zé')], [B], 0), jogo([pessoa('p2', 'Zé')], [B], 0)]);
    expect(resumo(p)).toEqual({ atual: 'Zé 1 x 0 Beto', historico: ['Zé 1 x 0 Beto'] });
  });

  it('1x1, 2x1 e 2x2 em sequência: cada formação é seu confronto, e dentro dela a soma segue', () => {
    const p = contar([
      jogo([A], [B], 0),
      jogo([A], [B], 1),
      jogo([A, C], [B], 0),
      jogo([B], [C, A], 0),
      jogo([A, C], [B, D], 1),
      jogo([D, B], [A, C], 0),
    ]);
    expect(resumo(p)).toEqual({
      atual: 'Ana e Cida 0 x 2 Beto e Davi',
      historico: ['Ana e Cida 1 x 1 Beto', 'Ana 1 x 1 Beto'],
    });
  });
});

describe('registrarPartida — limite do histórico', () => {
  const contrarios = (n: number): PartidaTerminada[] => Array.from({ length: n }, (_, i) => jogo([A], [pessoa(`c${i}`, `C${i}`)], 0));

  it('o limite padrão são 10 confrontos ao todo: o atual e 9 anteriores', () => {
    expect(LIMITES_PROTOCOLO.confrontosNoPlacar).toBe(10);
    const dez = placarNoFio(contar(contrarios(10)));
    expect(dez.historico).toHaveLength(9);
    expect(dez.atual?.lados[1].nomes).toEqual(['C9']);
    expect(dez.historico.map((c) => c.lados[1].nomes[0])).toEqual(['C8', 'C7', 'C6', 'C5', 'C4', 'C3', 'C2', 'C1', 'C0']);
  });

  it('o 11º confronto empurra o mais antigo para fora', () => {
    const onze = placarNoFio(contar(contrarios(11)));
    expect(onze.historico).toHaveLength(9);
    expect(onze.atual?.lados[1].nomes).toEqual(['C10']);
    expect(onze.historico.at(-1)!.lados[1].nomes).toEqual(['C1']);
    expect(onze.historico.map((c) => c.lados[1].nomes[0])).not.toContain('C0');
  });

  it('muitas partidas do mesmo confronto não enchem o histórico', () => {
    const p = contar(Array.from({ length: 50 }, () => jogo([A], [B], 0)));
    expect(placarNoFio(p).historico).toEqual([]);
    expect(resumo(p).atual).toBe('Ana 50 x 0 Beto');
  });

  it('o limite é um parâmetro: 3 confrontos ao todo; com 1, só o atual', () => {
    expect(placarNoFio(contar(contrarios(6), PLACAR_VAZIO, 3)).historico).toHaveLength(2);
    const so = placarNoFio(contar(contrarios(6), PLACAR_VAZIO, 1));
    expect(so.historico).toEqual([]);
    expect(so.atual?.lados[1].nomes).toEqual(['C5']);
  });

  it('o pior caso (10 confrontos, 4 apelidos de 24 letras de 4 bytes cada) passa pelo fio e cabe com folga no teto do texto da sala', () => {
    const emoji = '\u{1F3B1}'.repeat(LIMITES_PROTOCOLO.nome);
    const gigante = (i: number): PartidaTerminada => jogo([pessoa(`a${i}`, emoji), pessoa(`b${i}`, emoji)], [pessoa(`c${i}`, emoji), pessoa(`d${i}`, emoji)], 0);
    const cheio = contar(Array.from({ length: 12 }, (_, i) => gigante(i)));
    const estado = {
      tipo: 'estado-sala' as const, codigo: 'K7M2P', modo: '2x2' as const, preset: 'Boteco', fase: 'espera' as const, seq: 0, vez: null, espectadores: 0,
      lugares: [0, 1, 2, 3].map((lugar) => ({ lugar, equipe: lugar % 2, nome: emoji, conectado: true, anfitriao: lugar === 0 })),
      placar: placarNoFio(cheio),
    };
    expect(estado.placar.historico).toHaveLength(LIMITES_PROTOCOLO.confrontosNoPlacar - 1);
    const fio = codificarMensagem(estado);
    expect(typeof fio === 'string' ? codificarUtf8(fio).length : fio.length).toBeLessThan(LIMITES_PROTOCOLO.bytesTextoDaSala / 4);
    const volta = decodificarMensagemDaSala(fio);
    expect(volta.ok, volta.ok ? '' : volta.erro).toBe(true);
    if (volta.ok) expect(volta.valor).toEqual(estado);
  });

  it('o tamanho que a sala guarda cabe no que o esquema do fio aceita', () => {
    const cheio = contar(contrarios(40));
    const estado = {
      tipo: 'estado-sala', codigo: 'K7M2P', modo: '1x1', preset: 'Boteco', fase: 'espera', seq: 0, vez: null, espectadores: 0,
      lugares: [0, 1, 2, 3].map((lugar) => ({ lugar, equipe: lugar % 2, nome: null, conectado: false, anfitriao: false })),
      placar: placarNoFio(cheio),
    };
    const r = validarMensagemDaSala(estado);
    expect(r.ok, r.ok ? '' : r.erro).toBe(true);
  });
});

describe('registrarPartida — o contador satura e a entrada é conferida', () => {
  it('as vitórias param em vitoriasNoPlacar, para o esquema nunca recusar o que a sala conta', () => {
    const teto = LIMITES_PROTOCOLO.vitoriasNoPlacar;
    let p = contar([jogo([A], [B], 0)]);
    p = { atual: { modalidade: 'par-ou-impar', lados: [{ ...p.atual!.lados[0], vitorias: teto - 1 }, p.atual!.lados[1]] }, historico: [] };
    p = registrarPartida(p, jogo([A], [B], 0));
    expect(p.atual!.lados[0].vitorias).toBe(teto);
    p = registrarPartida(p, jogo([A], [B], 0));
    expect(p.atual!.lados[0].vitorias).toBe(teto);
    p = registrarPartida(p, jogo([A], [B], 1));
    expect(p.atual!.lados[1].vitorias).toBe(1);
  });

  it('não altera o placar recebido nem a lista de jogadores recebida', () => {
    const antes = contar([jogo([A, C], [B, D], 0)]);
    const foto = JSON.stringify(antes);
    const equipe0 = [A, C];
    const depois = registrarPartida(antes, jogo(equipe0, [B, D], 1));
    expect(JSON.stringify(antes)).toBe(foto);
    expect(depois).not.toBe(antes);
    const novo = registrarPartida(antes, jogo(equipe0, [B, E], 0));
    equipe0.push(D);
    expect(placarNoFio(novo).atual!.lados[0].nomes).toEqual(['Ana', 'Cida']);
    const equipe1 = [B, D];
    const outro = registrarPartida(antes, jogo([A], equipe1, 0));
    equipe1.push(E);
    expect(placarNoFio(outro).atual!.lados[1].nomes).toEqual(['Beto', 'Davi']);
  });

  it('recusa equipe vazia, a mesma pessoa nos dois lados ou repetida, e limite inválido', () => {
    expect(() => registrarPartida(PLACAR_VAZIO, jogo([], [B], 0))).toThrow(RangeError);
    expect(() => registrarPartida(PLACAR_VAZIO, jogo([A], [], 1))).toThrow(RangeError);
    expect(() => registrarPartida(PLACAR_VAZIO, jogo([A], [A], 0))).toThrow(RangeError);
    expect(() => registrarPartida(PLACAR_VAZIO, jogo([A, A], [B], 0))).toThrow(RangeError);
    for (const maximo of [0, -1, 1.5, Number.NaN]) expect(() => registrarPartida(PLACAR_VAZIO, jogo([A], [B], 0), maximo), String(maximo)).toThrow(RangeError);
  });
});

describe('placarNoFio', () => {
  it('leva só apelidos e vitórias: nenhum id de pessoa vai para a rede', () => {
    const p = contar([jogo([pessoa('segredo-1', 'Ana')], [pessoa('segredo-2', 'Beto')], 0)]);
    const json = JSON.stringify(placarNoFio(p));
    expect(json).not.toContain('segredo');
    expect(JSON.parse(json)).toEqual({
      atual: { modalidade: 'par-ou-impar', lados: [{ nomes: ['Ana'], vitorias: 1 }, { nomes: ['Beto'], vitorias: 0 }] },
      historico: [],
    });
  });
});

/** Mata-mata: cada pessoa é uma equipe (`jogadores[i]` é a equipe `i`) e `venceu` é o índice de quem venceu. */
const todosContra = (jogadores: JogadorDoPlacar[], venceu: number): PartidaTerminada => ({
  equipes: jogadores.map((j) => [j]) as unknown as PartidaTerminada['equipes'],
  vencedor: venceu,
});

/** "Ana 2 | Beto 0 | Cida 1": todos os lados do confronto atual, na ordem em que ele abriu. */
const lados = (p: PlacarGuardado): string => placarNoFio(p).atual!.lados.map((l) => `${l.nomes.join(' e ')} ${l.vitorias}`).join(' | ');
const historicoDe = (p: PlacarGuardado): string[] => placarNoFio(p).historico.map((c) => c.lados.map((l) => `${l.nomes.join(' e ')} ${l.vitorias}`).join(' | '));

describe('registrarPartida — N lados (mata-mata: cada pessoa é um lado)', () => {
  it('a primeira partida de três abre um confronto com 3 lados, 1 vitória para quem ganhou', () => {
    expect(lados(contar([todosContra([A, B, C], 1)]))).toBe('Ana 0 | Beto 1 | Cida 0');
    expect(lados(contar([todosContra([A, B, C, D], 3)]))).toBe('Ana 0 | Beto 0 | Cida 0 | Davi 1');
    expect(placarNoFio(contar([todosContra([A, B, C], 0)])).atual!.lados).toHaveLength(3);
  });

  it('os mesmos lados somam: cada vitória vai para a pessoa que venceu', () => {
    const p = contar([todosContra([A, B, C], 0), todosContra([A, B, C], 2), todosContra([A, B, C], 0), todosContra([A, B, C], 1)]);
    expect(lados(p)).toBe('Ana 2 | Beto 1 | Cida 1');
    expect(historicoDe(p)).toEqual([]);
  });

  it('a ordem das equipes na partida não importa: a vitória segue a pessoa e a orientação do confronto não gira', () => {
    // 2ª partida: a roda saiu girada (Cida, Ana, Beto), e a equipe 1 (Ana) venceu; 3ª: Beto, Cida, Ana, e a equipe 2 (Ana) venceu
    const p = contar([todosContra([A, B, C], 1), todosContra([C, A, B], 1), todosContra([B, C, A], 2)]);
    expect(lados(p)).toBe('Ana 2 | Beto 1 | Cida 0');
    expect(historicoDe(p)).toEqual([]);
  });

  it('4 pessoas em qualquer ordem são o mesmo confronto', () => {
    const p = contar([todosContra([A, B, C, D], 0), todosContra([D, C, B, A], 3), todosContra([B, D, A, C], 3)]);
    expect(lados(p)).toBe('Ana 2 | Beto 0 | Cida 1 | Davi 0');
  });

  it('qualquer mudança abre confronto novo e manda o anterior ao histórico: pessoa trocada, a mais ou a menos', () => {
    const p1 = contar([todosContra([A, B, C], 0), todosContra([A, B, D], 2)]);
    expect(lados(p1)).toBe('Ana 0 | Beto 0 | Davi 1');
    expect(historicoDe(p1)).toEqual(['Ana 1 | Beto 0 | Cida 0']);
    const p2 = contar([todosContra([A, B, C], 0), todosContra([A, B, C, D], 3)]);
    expect(lados(p2)).toBe('Ana 0 | Beto 0 | Cida 0 | Davi 1');
    expect(historicoDe(p2)).toEqual(['Ana 1 | Beto 0 | Cida 0']);
    const p3 = contar([todosContra([A, B, C], 0), todosContra([A, B], 1)]);
    expect(lados(p3)).toBe('Ana 0 | Beto 1');
    expect(historicoDe(p3)).toEqual(['Ana 1 | Beto 0 | Cida 0']);
  });

  it('só a partida anterior decide: voltar aos três de antes abre outro confronto, não retoma o velho', () => {
    const p = contar([todosContra([A, B, C], 0), todosContra([A, B], 0), todosContra([A, B, C], 2)]);
    expect(lados(p)).toBe('Ana 0 | Beto 0 | Cida 1');
    expect(historicoDe(p)).toEqual(['Ana 1 | Beto 0', 'Ana 1 | Beto 0 | Cida 0']);
  });

  it('as mesmas pessoas em formação diferente (dupla contra um, depois cada um por si) são confrontos diferentes', () => {
    const p = contar([jogo([A, C], [B], 0), todosContra([A, B, C], 0)]);
    expect(lados(p)).toBe('Ana 1 | Beto 0 | Cida 0');
    expect(historicoDe(p)).toEqual(['Ana e Cida 1 | Beto 0']);
    // e o inverso
    const q = contar([todosContra([A, B, C], 0), jogo([A, C], [B], 1)]);
    expect(lados(q)).toBe('Ana e Cida 0 | Beto 1');
    expect(historicoDe(q)).toEqual(['Ana 1 | Beto 0 | Cida 0']);
  });

  it('o 1x1 do mata-mata é o mesmo confronto do 1x1 do par ou ímpar entre as mesmas duas pessoas', () => {
    const p = contar([jogo([A], [B], 0), todosContra([B, A], 1), todosContra([A, B], 1)]);
    expect(lados(p)).toBe('Ana 2 | Beto 1');
    expect(historicoDe(p)).toEqual([]);
  });

  it('o histórico e o teto de confrontos valem com N lados', () => {
    const muitos = Array.from({ length: 12 }, (_, i) => todosContra([pessoa(`a${i}`), pessoa(`b${i}`), pessoa(`c${i}`)], 0));
    const p = contar(muitos);
    expect(placarNoFio(p).historico).toHaveLength(LIMITES_PROTOCOLO.confrontosNoPlacar - 1);
    expect(lados(p)).toBe('a11 1 | b11 0 | c11 0');
  });

  it('as vitórias saturam no teto também com N lados', () => {
    const teto = LIMITES_PROTOCOLO.vitoriasNoPlacar;
    let p = contar([todosContra([A, B, C], 2)]);
    p = { atual: { modalidade: 'par-ou-impar', lados: [p.atual!.lados[0], p.atual!.lados[1], { ...p.atual!.lados[2]!, vitorias: teto }] }, historico: [] };
    p = registrarPartida(p, todosContra([A, B, C], 2));
    expect(p.atual!.lados[2]!.vitorias).toBe(teto);
  });

  it('o fio leva os N lados, sem id, e o esquema da sala os aceita de ponta a ponta', () => {
    const p = contar([todosContra([pessoa('s1', 'Ana'), pessoa('s2', 'Beto'), pessoa('s3', 'Cida'), pessoa('s4', 'Davi')], 3)]);
    const fio = placarNoFio(p);
    expect(JSON.stringify(fio)).not.toMatch(/"s\d"/);
    const estado = {
      tipo: 'estado-sala', codigo: 'K7M2P', modo: '1x1x1x1', modalidade: 'mata-mata', preset: 'Mata-mata', fase: 'espera', seq: 0, vez: null, espectadores: 0,
      lugares: [0, 1, 2, 3].map((lugar) => ({ lugar, equipe: lugar, nome: null, conectado: false, anfitriao: false })),
      placar: fio,
    };
    const r = validarMensagemDaSala(estado);
    expect(r.ok, r.ok ? '' : r.erro).toBe(true);
    const volta = decodificarMensagemDaSala(codificarMensagem(estado as never));
    expect(volta.ok && (volta.valor as { placar: unknown }).placar).toEqual(fio);
  });

  it('o pior caso de N lados (10 confrontos de 4 lados com apelidos de 24 letras de 4 bytes) cabe no teto do texto da sala', () => {
    const emoji = '\u{1F3B1}'.repeat(LIMITES_PROTOCOLO.nome);
    const gigante = (i: number): PartidaTerminada => todosContra([0, 1, 2, 3].map((k) => pessoa(`p${i}-${k}`, emoji)), 0);
    const cheio = contar(Array.from({ length: 12 }, (_, i) => gigante(i)));
    const estado = {
      tipo: 'estado-sala' as const, codigo: 'K7M2P', modo: '1x1x1x1' as const, preset: 'Mata-mata', fase: 'espera' as const, seq: 0, vez: null, espectadores: 0,
      lugares: [0, 1, 2, 3].map((lugar) => ({ lugar, equipe: lugar, nome: emoji, conectado: true, anfitriao: lugar === 0 })),
      placar: placarNoFio(cheio),
    };
    const fio = codificarMensagem(estado);
    expect(typeof fio === 'string' ? codificarUtf8(fio).length : fio.length).toBeLessThan(LIMITES_PROTOCOLO.bytesTextoDaSala / 4);
    expect(decodificarMensagemDaSala(fio).ok).toBe(true);
  });

  it('recusa vencedor fora das equipes, equipes demais ou de menos, e a mesma pessoa em duas equipes', () => {
    for (const vencedor of [3, -1, 1.5, Number.NaN]) expect(() => registrarPartida(PLACAR_VAZIO, todosContra([A, B, C], vencedor)), String(vencedor)).toThrow(RangeError);
    expect(() => registrarPartida(PLACAR_VAZIO, todosContra([A, B, C, D, E], 0))).toThrow(RangeError);
    expect(() => registrarPartida(PLACAR_VAZIO, { equipes: [[A]] as never, vencedor: 0 })).toThrow(RangeError);
    expect(() => registrarPartida(PLACAR_VAZIO, todosContra([A, B, A], 0))).toThrow(RangeError);
    expect(() => registrarPartida(PLACAR_VAZIO, { equipes: [[A], [B], []], vencedor: 0 })).toThrow(RangeError);
  });
});

/** Uma partida de mata-mata (cada pessoa é uma equipe) ou, com `modalidade: 'par-ou-impar'`, de duas equipes de uma pessoa. */
const naModalidade = (modalidade: 'par-ou-impar' | 'mata-mata', pessoas: JogadorDoPlacar[], venceu: number): PartidaTerminada => ({
  ...(todosContra(pessoas, venceu) as PartidaTerminada),
  modalidade,
});
const modalidadeDe = (p: PlacarGuardado): string | undefined => placarNoFio(p).atual?.modalidade;

describe('registrarPartida — a modalidade entra na chave do confronto (L16b)', () => {
  it('o mesmo 1x1 de par ou ímpar e de mata-mata entre as mesmas duas pessoas são confrontos diferentes, cada um com a sua modalidade', () => {
    const p = contar([naModalidade('par-ou-impar', [A, B], 0), naModalidade('mata-mata', [A, B], 1)]);
    expect(lados(p)).toBe('Ana 0 | Beto 1');
    expect(modalidadeDe(p)).toBe('mata-mata');
    expect(historicoDe(p)).toEqual(['Ana 1 | Beto 0']);
    expect(placarNoFio(p).historico[0]!.modalidade).toBe('par-ou-impar');
  });

  it('a mesma modalidade e as mesmas pessoas somam, e a modalidade do confronto segue a que abriu', () => {
    const p = contar([naModalidade('mata-mata', [A, B], 0), naModalidade('mata-mata', [B, A], 0), naModalidade('mata-mata', [A, B], 1)]);
    expect(lados(p)).toBe('Ana 1 | Beto 2');
    expect(modalidadeDe(p)).toBe('mata-mata');
    expect(historicoDe(p)).toEqual([]);
  });

  it('só a partida anterior decide: voltar à modalidade de antes abre outro confronto, não retoma o velho', () => {
    const p = contar([naModalidade('par-ou-impar', [A, B], 0), naModalidade('mata-mata', [A, B], 0), naModalidade('par-ou-impar', [A, B], 0)]);
    expect(lados(p)).toBe('Ana 1 | Beto 0');
    expect(historicoDe(p)).toEqual(['Ana 1 | Beto 0', 'Ana 1 | Beto 0']);
    expect(placarNoFio(p).historico.map((c) => c.modalidade)).toEqual(['mata-mata', 'par-ou-impar']);
  });

  it('sem modalidade na partida (a chamada de antes, de 2 lados) vale par ou ímpar: junta com o confronto de par ou ímpar e não com o de mata-mata', () => {
    const antigo = contar([jogo([A], [B], 0)]);
    expect(modalidadeDe(antigo)).toBe('par-ou-impar');
    const junta = registrarPartida(antigo, naModalidade('par-ou-impar', [A, B], 1));
    expect(lados(junta)).toBe('Ana 1 | Beto 1');
    const sozinha = registrarPartida(junta, jogo([A], [B], 0));
    expect(lados(sozinha)).toBe('Ana 2 | Beto 1');
    const mata = contar([naModalidade('mata-mata', [A, B], 0)]);
    const separa = registrarPartida(mata, jogo([A], [B], 0));
    expect(lados(separa)).toBe('Ana 1 | Beto 0');
    expect(historicoDe(separa)).toEqual(['Ana 1 | Beto 0']);
    expect(modalidadeDe(separa)).toBe('par-ou-impar');
  });

  it('o 2x1 de par ou ímpar e o mata-mata das mesmas três pessoas continuam confrontos diferentes (já eram pela formação)', () => {
    const p = contar([{ ...jogo([A, C], [B], 0), modalidade: 'par-ou-impar' }, naModalidade('mata-mata', [A, B, C], 0)]);
    expect(modalidadeDe(p)).toBe('mata-mata');
    expect(placarNoFio(p).historico).toHaveLength(1);
  });

  it('a modalidade vai no fio e o esquema da sala a aceita nos confrontos atual e anteriores; sem ela também passa', () => {
    const p = contar([naModalidade('par-ou-impar', [A, B], 0), naModalidade('mata-mata', [A, B, C], 2)]);
    const fio = placarNoFio(p);
    expect(fio.atual!.modalidade).toBe('mata-mata');
    expect(fio.historico[0]!.modalidade).toBe('par-ou-impar');
    const estado = (placar: unknown) => ({
      tipo: 'estado-sala', codigo: 'K7M2P', modo: '1x1x1', modalidade: 'mata-mata', preset: 'Mata-mata', fase: 'espera', seq: 0, vez: null, espectadores: 0,
      lugares: [0, 1, 2, 3].map((lugar) => ({ lugar, equipe: lugar, nome: null, conectado: false, anfitriao: false })),
      placar,
    });
    const r = validarMensagemDaSala(estado(fio));
    expect(r.ok, r.ok ? '' : r.erro).toBe(true);
    const volta = decodificarMensagemDaSala(codificarMensagem(estado(fio) as never));
    expect(volta.ok && (volta.valor as { placar: unknown }).placar).toEqual(fio);
    // o cliente antigo / a montagem de teste sem modalidade no confronto
    const semModalidade = { atual: { lados: fio.atual!.lados }, historico: [] };
    expect(validarMensagemDaSala(estado(semModalidade)).ok).toBe(true);
    for (const ruim of ['festa', '', null, 3]) expect(validarMensagemDaSala(estado({ atual: { ...fio.atual!, modalidade: ruim }, historico: [] })).ok, String(ruim)).toBe(false);
  });
});
