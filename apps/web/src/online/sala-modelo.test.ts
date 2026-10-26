import { describe, expect, it } from 'vitest';
import type { ConfrontoPlacar, LugarSala, ModoSala, MsgEstadoSala, MsgTempoEsgotado, PlacarSala } from '@sinuca/protocolo';
import { avisoDeTempoEsgotado, avisosDePresenca, faixaDeVez, formacaoSentada, jogadoresOnline, modeloDaSala, quantosLugares, tituloDaSala } from './sala-modelo';

function estado(modo: ModoSala, ocupados: readonly (string | null | [string, boolean])[], extra: Partial<MsgEstadoSala> = {}): MsgEstadoSala {
  const lugares: LugarSala[] = [0, 1, 2, 3].map((lugar) => {
    const o = ocupados[lugar] ?? null;
    const nome = Array.isArray(o) ? o[0] : o;
    const conectado = Array.isArray(o) ? o[1] : nome !== null;
    return { lugar, equipe: lugar % 2, nome, conectado, anfitriao: lugar === 0 && nome !== null };
  });
  return { tipo: 'estado-sala', codigo: 'K7M2P', modo, preset: 'Boteco', fase: 'espera', seq: 0, vez: null, lugares, espectadores: 0, ...extra };
}

describe('modeloDaSala', () => {
  it('1x1 mostra só dois lugares e 2x2 os quatro, com as equipes', () => {
    expect(quantosLugares('1x1')).toBe(2);
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto']), 0, true).assentos).toHaveLength(2);
    const m = modeloDaSala(estado('2x2', ['Ana', 'Beto', 'Caio', 'Dani']), 1, false);
    expect(m.assentos.map((a) => [a.lugar, a.equipe, a.nome, a.meu])).toEqual([
      [0, 0, 'Ana', false],
      [1, 1, 'Beto', true],
      [2, 0, 'Caio', false],
      [3, 1, 'Dani', false],
    ]);
  });

  it('o anfitrião só inicia com todos os lugares cheios e conectados', () => {
    expect(modeloDaSala(estado('1x1', ['Ana']), 0, true)).toMatchObject({ podeIniciar: false, aviso: 'Falta 1 jogador' });
    expect(modeloDaSala(estado('2x2', ['Ana', 'Beto']), 0, true)).toMatchObject({ podeIniciar: false, aviso: 'Faltam 2 jogadores' });
    expect(modeloDaSala(estado('1x1', ['Ana', ['Beto', false]]), 0, true)).toMatchObject({ podeIniciar: false });
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto']), 0, true)).toMatchObject({ podeIniciar: true, aviso: 'Todos aqui: pode começar' });
  });

  it('quem não é anfitrião nunca inicia e vê que espera', () => {
    const m = modeloDaSala(estado('1x1', ['Ana', 'Beto']), 1, false);
    expect(m.podeIniciar).toBe(false);
    expect(m.aviso).toBe('Esperando o anfitrião começar');
  });

  it('só dá para sentar em lugar vago, na espera, e não sendo o anfitrião', () => {
    const m = modeloDaSala(estado('2x2', ['Ana', 'Beto']), 1, false);
    expect(m.assentos.map((a) => a.podeSentar)).toEqual([false, false, true, true]);
    expect(modeloDaSala(estado('2x2', ['Ana', 'Beto']), 0, true).assentos.some((a) => a.podeSentar)).toBe(false);
    expect(modeloDaSala(estado('2x2', ['Ana', 'Beto'], { fase: 'jogando' }), 1, false).assentos.some((a) => a.podeSentar)).toBe(false);
  });

  it('espectador é reconhecido', () => {
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto'], { espectadores: 1 }), null, false)).toMatchObject({ souEspectador: true, espectadores: 1 });
  });
});

describe('modeloDaSala: 2x1', () => {
  it('usa 3 lugares: a equipe de 2 (lugares 0 e 2) e a equipe de 1 (lugar 1), lado a lado', () => {
    expect(quantosLugares('2x1')).toBe(3);
    const m = modeloDaSala(estado('2x1', ['Ana', 'Beto', 'Caio', 'Dani']), 1, false);
    expect(m.assentos.map((a) => [a.lugar, a.equipe, a.nome, a.meu])).toEqual([
      [0, 0, 'Ana', false],
      [1, 1, 'Beto', true],
      [2, 0, 'Caio', false],
    ]);
    expect(m.equipes).toEqual([
      { equipe: 0, rotulo: 'Equipe A', assentos: [m.assentos[0], m.assentos[2]] },
      { equipe: 1, rotulo: 'Equipe B', assentos: [m.assentos[1]] },
    ]);
  });

  it('o lugar 3 que a sala sempre manda não conta: com os 3 cheios e conectados já dá para iniciar', () => {
    expect(modeloDaSala(estado('2x1', ['Ana', 'Beto']), 0, true)).toMatchObject({ podeIniciar: false, aviso: 'Falta 1 jogador' });
    expect(modeloDaSala(estado('2x1', ['Ana']), 0, true)).toMatchObject({ podeIniciar: false, aviso: 'Faltam 2 jogadores' });
    expect(modeloDaSala(estado('2x1', ['Ana', 'Beto', ['Caio', false]]), 0, true)).toMatchObject({ podeIniciar: false });
    expect(modeloDaSala(estado('2x1', ['Ana', 'Beto', 'Caio']), 0, true)).toMatchObject({ podeIniciar: true, aviso: 'Todos aqui: pode começar' });
  });

  it('quem não é anfitrião pode sentar nos lugares vagos de qualquer equipe, nunca no 3', () => {
    const m = modeloDaSala(estado('2x1', ['Ana', 'Beto']), 1, false);
    expect(m.assentos.map((a) => a.podeSentar)).toEqual([false, false, true]);
    const vazio = modeloDaSala(estado('2x1', ['Ana']), null, false);
    expect(vazio.assentos.map((a) => a.podeSentar)).toEqual([false, true, true]);
  });

  it('o título diz o modo; só o 2x1 e o 2x2 agrupam por equipe', () => {
    expect([tituloDaSala('1x1'), tituloDaSala('2x1'), tituloDaSala('2x2')]).toEqual(['Sala 1 x 1', 'Sala 2 x 1', 'Sala 2 x 2']);
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto']), 0, true).equipes).toEqual([]);
    expect(modeloDaSala(estado('2x2', ['Ana', 'Beto', 'Caio', 'Dani']), 0, true).equipes.map((e) => e.assentos.map((a) => a.lugar))).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });
});

describe('modeloDaSala: saldos, skins e aposta', () => {
  const comCarteira = (extra: Partial<MsgEstadoSala> = {}): MsgEstadoSala => {
    const base = estado('1x1x1', ['Ana', 'Beto', 'Caio'], extra);
    const lugares = base.lugares.map((l) => (l.lugar === 0 ? { ...l, saldo: 100, skin: 'ebano' as const } : l.lugar === 1 ? { ...l, saldo: -30, skin: 'classico' as const } : l.lugar === 2 ? { ...l, saldo: null, skin: 'classico' as const } : l));
    return { ...base, lugares };
  };

  it('cada lugar leva o saldo público e a skin; negativo fica negativo e sem carteira é null', () => {
    const m = modeloDaSala(comCarteira(), 0, true);
    expect(m.assentos.map((a) => [a.saldo, a.skin])).toEqual([
      [100, 'ebano'],
      [-30, 'classico'],
      [null, 'classico'],
    ]);
  });

  it('lugar vago não tem saldo, e a sala que não manda saldo nem skin (só montagem de teste) vale sem carteira e o clássico', () => {
    const m = modeloDaSala(estado('1x1', ['Ana']), 0, true);
    expect(m.assentos.map((a) => [a.saldo, a.skin])).toEqual([
      [null, 'classico'],
      [null, 'classico'],
    ]);
  });

  it('a aposta da sala vem nas regras; sem ela, os 10 de fábrica', () => {
    expect(modeloDaSala(comCarteira({ aposta: 20 }), 0, true).regras.aposta).toBe(20);
    expect(modeloDaSala(comCarteira(), 0, true).regras.aposta).toBe(10);
  });
});

describe('modeloDaSala: expulsar', () => {
  it('o anfitrião vê "expulsar" em todo outro lugar ocupado, conectado ou não, e em nenhum vago nem no dele', () => {
    const m = modeloDaSala(estado('2x1', ['Ana', ['Beto', false]]), 0, true);
    expect(m.assentos.map((a) => a.podeExpulsar)).toEqual([false, true, false]);
    const cheia = modeloDaSala(estado('2x2', ['Ana', 'Beto', 'Caio', 'Dani']), 0, true);
    expect(cheia.assentos.map((a) => a.podeExpulsar)).toEqual([false, true, true, true]);
  });

  it('quem não é anfitrião, espectador ou com a partida em curso não vê o botão', () => {
    expect(modeloDaSala(estado('2x1', ['Ana', 'Beto', 'Caio']), 1, false).assentos.some((a) => a.podeExpulsar)).toBe(false);
    expect(modeloDaSala(estado('2x1', ['Ana', 'Beto', 'Caio']), null, false).assentos.some((a) => a.podeExpulsar)).toBe(false);
    expect(modeloDaSala(estado('2x1', ['Ana', 'Beto', 'Caio'], { fase: 'jogando' }), 0, true).assentos.some((a) => a.podeExpulsar)).toBe(false);
  });

  it('no 1x1 também', () => {
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto']), 0, true).assentos.map((a) => a.podeExpulsar)).toEqual([false, true]);
  });
});

describe('modeloDaSala: as regras da sala', () => {
  it('traz o tempo por tacada e a linha de previsão da sala', () => {
    const m = modeloDaSala(estado('1x1', ['Ana', 'Beto'], { relogio: { tempoS: 45, aoEsgotar: 'perde-a-vez' }, linha: { previsao: true, bolaAtingida: true } }), 0, true);
    expect(m.tempoS).toBe(45);
    expect(m.linha).toEqual({ previsao: true, bolaAtingida: true });
  });

  it('sem limite é null; sala que não diz nada: tempo indefinido e linha desligada', () => {
    expect(modeloDaSala(estado('1x1', ['Ana'], { relogio: { tempoS: null, aoEsgotar: 'perde-a-vez' } }), 0, true).tempoS).toBeNull();
    const sem = modeloDaSala(estado('1x1', ['Ana']), 0, true);
    expect(sem.tempoS).toBeUndefined();
    expect(sem.linha).toEqual({ previsao: false, bolaAtingida: false });
  });

  it('a linha com a bola atingida mas sem a previsão não conta como ligada', () => {
    expect(modeloDaSala(estado('1x1', ['Ana'], { linha: { previsao: false, bolaAtingida: true } }), 0, true).linha).toEqual({ previsao: false, bolaAtingida: false });
  });

  it('só o anfitrião configura, e só na espera (de volta do fim da partida também é espera)', () => {
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto']), 0, true).podeConfigurar).toBe(true);
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto']), 1, false).podeConfigurar).toBe(false);
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto']), null, false).podeConfigurar).toBe(false);
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto'], { fase: 'jogando' }), 0, true).podeConfigurar).toBe(false);
  });
});

const confronto = (a: readonly string[], va: number, b: readonly string[], vb: number): ConfrontoPlacar => ({
  lados: [
    { nomes: a, vitorias: va },
    { nomes: b, vitorias: vb },
  ],
});

describe('modeloDaSala: o placar da sala', () => {
  const placar = (atual: ConfrontoPlacar | null, historico: readonly ConfrontoPlacar[] = []): PlacarSala => ({ atual, historico });

  it('antes da primeira partida não há placar para a espera mostrar (e sem o campo, igual)', () => {
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto'], { placar: placar(null) }), 0, true).placar.contou).toBe(false);
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto']), 0, true).placar.contou).toBe(false);
  });

  it('a mesma dupla de antes: o confronto da sala, "Ana 3 × 1 Beto", e o histórico do mais recente ao mais antigo', () => {
    const antigos = [confronto(['Ana', 'Caio'], 1, ['Beto'], 1), confronto(['Ana'], 0, ['Dani'], 2)];
    const m = modeloDaSala(estado('1x1', ['Ana', 'Beto'], { placar: placar(confronto(['Ana'], 3, ['Beto'], 1), antigos) }), 1, false);
    expect(m.placar.contou).toBe(true);
    expect(m.placar.novo).toBe(false);
    expect(m.placar.atual?.texto).toBe('Ana 3 × 1 Beto');
    expect(m.placar.historico.map((c) => c.texto)).toEqual(['Ana e Caio 1 × 1 Beto', 'Ana 0 × 2 Dani']);
  });

  it('quem está sentado agora não é a formação do confronto: a espera já mostra o confronto novo em 0 × 0, e o de antes no histórico', () => {
    const m = modeloDaSala(estado('2x1', ['Ana', 'Beto', 'Caio'], { placar: placar(confronto(['Ana'], 3, ['Beto'], 1)) }), 0, true);
    expect(m.placar.novo).toBe(true);
    expect(m.placar.atual?.texto).toBe('Ana e Caio 0 × 0 Beto');
    expect(m.placar.historico.map((c) => c.texto)).toEqual(['Ana 3 × 1 Beto']);
  });

  it('trocar o apelido de lado (os lados invertidos) segue o mesmo confronto', () => {
    const m = modeloDaSala(estado('1x1', ['Beto', 'Ana'], { placar: placar(confronto(['Ana'], 3, ['Beto'], 1)) }), 0, true);
    expect(m.placar.novo).toBe(false);
    expect(m.placar.atual?.texto).toBe('Ana 3 × 1 Beto');
  });

  it('com lugar vago a formação não se conhece: o confronto fica como a sala o mandou (quem voltar continua nele)', () => {
    const m = modeloDaSala(estado('1x1', ['Ana'], { placar: placar(confronto(['Ana'], 3, ['Beto'], 1)) }), 0, true);
    expect(m.placar.novo).toBe(false);
    expect(m.placar.atual?.texto).toBe('Ana 3 × 1 Beto');
  });

  it('quem caiu mas segura o lugar continua sentado: a formação é a mesma', () => {
    const m = modeloDaSala(estado('1x1', ['Ana', ['Beto', false]], { placar: placar(confronto(['Ana'], 3, ['Beto'], 1)) }), 0, true);
    expect(m.placar.novo).toBe(false);
  });
});

describe('formacaoSentada', () => {
  const assento = (lugar: number, nome: string | null) => ({ lugar, equipe: lugar % 2, nome }) as Parameters<typeof formacaoSentada>[0][number];

  it('os apelidos por equipe, a 0 primeiro; com algum lugar vago, nada', () => {
    expect(formacaoSentada([assento(0, 'Ana'), assento(1, 'Beto'), assento(2, 'Caio')])).toEqual([['Ana', 'Caio'], ['Beto']]);
    expect(formacaoSentada([assento(0, 'Ana'), assento(1, null)])).toBeNull();
  });
});

describe('jogadoresOnline e faixaDeVez', () => {
  it('lista só os lugares ocupados do modo, com quem está caído e quem sou eu', () => {
    const e = estado('1x1', ['Ana', ['Beto', false]]);
    expect(jogadoresOnline(e, 1)).toEqual([
      { lugar: 0, nome: 'Ana', conectado: true, voce: false },
      { lugar: 1, nome: 'Beto', conectado: false, voce: true },
    ]);
  });

  it('a faixa diz de quem é a vez, com o nome', () => {
    const jogando = (vez: number | null, o: Parameters<typeof estado>[1] = ['Ana', 'Beto']) => estado('1x1', o, { fase: 'jogando', vez });
    expect(faixaDeVez(jogando(0), 0, false)).toEqual({ texto: 'Sua vez', tipo: 'minha' });
    expect(faixaDeVez(jogando(1), 0, false)).toEqual({ texto: 'Vez de Beto', tipo: 'outro' });
    expect(faixaDeVez(jogando(1, ['Ana', ['Beto', false]]), 0, false)).toEqual({ texto: 'Beto caiu: se não voltar, perde a vez', tipo: 'ausente' });
    expect(faixaDeVez(jogando(0), 0, true)).toEqual({ texto: 'Confirmando a tacada com a sala…', tipo: 'aguardando' });
    expect(faixaDeVez(jogando(null), 0, false).tipo).toBe('nenhuma');
    expect(faixaDeVez(estado('1x1', ['Ana', 'Beto']), 0, false).tipo).toBe('nenhuma');
    expect(faixaDeVez(null, 0, false).tipo).toBe('nenhuma');
  });
});

describe('avisosDePresenca', () => {
  it('avisa quem entrou, saiu, caiu e voltou; nada na primeira vez nem sem mudança', () => {
    const base = estado('2x2', ['Ana', 'Beto']);
    expect(avisosDePresenca(null, base)).toEqual([]);
    expect(avisosDePresenca(base, base)).toEqual([]);
    expect(avisosDePresenca(base, estado('2x2', ['Ana', 'Beto', 'Caio']))).toEqual(['Caio entrou na sala']);
    expect(avisosDePresenca(estado('2x2', ['Ana', 'Beto', 'Caio']), base)).toEqual(['Caio saiu da sala']);
    expect(avisosDePresenca(base, estado('2x2', ['Ana', ['Beto', false]]))).toEqual(['Beto caiu']);
    expect(avisosDePresenca(estado('2x2', ['Ana', ['Beto', false]]), base)).toEqual(['Beto voltou']);
  });
});

describe('avisoDeTempoEsgotado', () => {
  const jogando = estado('1x1', ['Ana', 'Beto'], { fase: 'jogando', vez: 0 });
  const msg = (extra: Partial<MsgTempoEsgotado> = {}): MsgTempoEsgotado => ({
    tipo: 'tempo-esgotado',
    lugar: 1,
    proximo: 0,
    motivo: 'tempo',
    consequencia: 'perde-a-vez',
    ...extra,
  });

  it('o tempo acabou para outro jogador: diz o nome de quem perdeu a vez', () => {
    expect(avisoDeTempoEsgotado(msg({ lugar: 1 }), jogando, 0)).toBe('Beto perdeu a vez');
  });

  it('quem estava desconectado: o motivo é a queda', () => {
    expect(avisoDeTempoEsgotado(msg({ lugar: 1, motivo: 'ausencia' }), jogando, 0)).toBe('Beto caiu e perdeu a vez');
  });

  it('para quem perdeu a vez o aviso fala com ele', () => {
    expect(avisoDeTempoEsgotado(msg({ lugar: 0 }), jogando, 0)).toBe('Seu tempo acabou: você perdeu a vez');
    expect(avisoDeTempoEsgotado(msg({ lugar: 0, motivo: 'ausencia' }), jogando, 0)).toBe('Você caiu e perdeu a vez');
  });

  it('espectador vê o nome de quem perdeu', () => {
    expect(avisoDeTempoEsgotado(msg({ lugar: 1 }), jogando, null)).toBe('Beto perdeu a vez');
  });

  it('sem o estado da sala (ou sem nome no lugar) usa o número do jogador', () => {
    expect(avisoDeTempoEsgotado(msg({ lugar: 1 }), null, 0)).toBe('Jogador 2 perdeu a vez');
    expect(avisoDeTempoEsgotado(msg({ lugar: 3 }), jogando, 0)).toBe('Jogador 4 perdeu a vez');
  });
});

// ---------------------------------------------------------------- L17: mata-mata (3 e 4 lugares, cada um por si) e as regras da sala

describe('modeloDaSala: mata-mata', () => {
  const mata = (modo: ModoSala, ocupados: readonly (string | null | [string, boolean])[], extra: Partial<MsgEstadoSala> = {}): MsgEstadoSala => estado(modo, ocupados, { modalidade: 'mata-mata', preset: 'Mata-mata', ...extra });

  it('1x1x1 usa 3 lugares e 1x1x1x1 os 4, cada lugar é a própria equipe (0 a 3)', () => {
    expect(quantosLugares('1x1x1')).toBe(3);
    expect(quantosLugares('1x1x1x1')).toBe(4);
    const m = modeloDaSala(mata('1x1x1x1', ['Ana', 'Beto', 'Caio', 'Dani']), 2, false);
    expect(m.assentos.map((a) => [a.lugar, a.equipe, a.nome, a.meu])).toEqual([
      [0, 0, 'Ana', false],
      [1, 1, 'Beto', false],
      [2, 2, 'Caio', true],
      [3, 3, 'Dani', false],
    ]);
    expect(modeloDaSala(mata('1x1x1', ['Ana', 'Beto', 'Caio', 'Dani']), 0, true).assentos.map((a) => a.equipe)).toEqual([0, 1, 2]);
  });

  it('não há colunas de equipe (nenhuma tem mais de uma pessoa)', () => {
    expect(modeloDaSala(mata('1x1x1', ['Ana', 'Beto', 'Caio']), 0, true).equipes).toEqual([]);
    expect(modeloDaSala(mata('1x1x1x1', ['Ana', 'Beto', 'Caio', 'Dani']), 0, true).equipes).toEqual([]);
    expect(modeloDaSala(mata('1x1', ['Ana', 'Beto']), 0, true).equipes).toEqual([]);
  });

  it('o lugar 3 de uma sala de 3 não conta: com os 3 cheios dá para iniciar; com 2 faltam 1', () => {
    expect(modeloDaSala(mata('1x1x1', ['Ana', 'Beto']), 0, true)).toMatchObject({ podeIniciar: false, aviso: 'Falta 1 jogador' });
    expect(modeloDaSala(mata('1x1x1', ['Ana', 'Beto', 'Caio']), 0, true)).toMatchObject({ podeIniciar: true });
    expect(modeloDaSala(mata('1x1x1x1', ['Ana']), 0, true)).toMatchObject({ podeIniciar: false, aviso: 'Faltam 3 jogadores' });
  });

  it('a modalidade e o nome da sala saem do catálogo: "Sala 4 jogadores · Mata-mata", "Sala 2×2 · Par ou ímpar"', () => {
    expect(modeloDaSala(mata('1x1x1x1', ['Ana', 'Beto', 'Caio', 'Dani']), 0, true)).toMatchObject({ modalidade: 'mata-mata', titulo: 'Sala 4 jogadores · Mata-mata' });
    expect(modeloDaSala(mata('1x1x1', ['Ana', 'Beto', 'Caio']), 0, true).titulo).toBe('Sala 3 jogadores · Mata-mata');
    expect(modeloDaSala(estado('2x2', ['Ana', 'Beto', 'Caio', 'Dani']), 0, true)).toMatchObject({ modalidade: 'par-ou-impar', titulo: 'Sala 2×2 · Par ou ímpar' });
  });

  it('tituloDaSala com três e quatro lugares troca todos os x: "Sala 1 x 1 x 1"', () => {
    expect(tituloDaSala('1x1x1')).toBe('Sala 1 x 1 x 1');
    expect(tituloDaSala('1x1x1x1')).toBe('Sala 1 x 1 x 1 x 1');
  });

  it('o anfitrião pode expulsar e os outros sentam nos lugares vagos, como nos outros modos', () => {
    const m = modeloDaSala(mata('1x1x1x1', ['Ana', 'Beto']), 0, true);
    expect(m.assentos.map((a) => a.podeExpulsar)).toEqual([false, true, false, false]);
    expect(modeloDaSala(mata('1x1x1x1', ['Ana', 'Beto']), 1, false).assentos.map((a) => a.podeSentar)).toEqual([false, false, true, true]);
  });

  it('a formação sentada tem um lado por pessoa; com um lugar vago não se conhece', () => {
    const m = modeloDaSala(mata('1x1x1', ['Ana', 'Beto', 'Caio']), 0, true);
    expect(formacaoSentada(m.assentos)).toEqual([['Ana'], ['Beto'], ['Caio']]);
    expect(formacaoSentada(modeloDaSala(mata('1x1x1', ['Ana', 'Beto']), 0, true).assentos)).toBeNull();
  });

  it('o placar da espera é o do mata-mata: mesmas pessoas e mesma modalidade continuam o confronto; troca de modalidade abre um novo', () => {
    const placar: PlacarSala = { atual: { modalidade: 'mata-mata', lados: [{ nomes: ['Ana'], vitorias: 2 }, { nomes: ['Beto'], vitorias: 1 }, { nomes: ['Caio'], vitorias: 0 }] }, historico: [] };
    const mesmo = modeloDaSala(mata('1x1x1', ['Ana', 'Beto', 'Caio'], { placar }), 0, true).placar;
    expect(mesmo.atual?.texto).toBe('Ana 2 · Beto 1 · Caio 0');
    expect(mesmo.novo).toBe(false);
    // as mesmas três pessoas, mas a sala voltou ao par ou ímpar (2x1): confronto novo
    const outra = modeloDaSala(estado('2x1', ['Ana', 'Beto', 'Caio'], { placar }), 0, true).placar;
    expect(outra.novo).toBe(true);
    expect(outra.atual?.texto).toBe('Ana e Caio 0 × 0 Beto');
    expect(outra.historico.map((h) => h.texto)).toEqual(['Ana 2 · Beto 1 · Caio 0']);
  });
});

describe('modeloDaSala: as regras da sala (modalidade, tempo, linha, giz e força)', () => {
  it('lê tudo do estado-sala', () => {
    const m = modeloDaSala(
      estado('1x1', ['Ana', 'Beto'], {
        modalidade: 'mata-mata',
        relogio: { tempoS: 45, aoEsgotar: 'perde-a-vez' },
        linha: { previsao: true, bolaAtingida: true },
        giz: { desgasteMin: 0.2, desgasteMax: 0.4, passada: 0.15, passadaS: 2 },
        forca: 'empurrar',
      }),
      0,
      true,
    );
    expect(m.regras).toMatchObject({ modalidade: 'mata-mata', modo: '1x1', tempoS: 45, forca: 'empurrar', giz: { desgasteMin: 0.2, desgasteMax: 0.4, passada: 0.15, passadaS: 2 } });
    expect(m.regras.linha).toEqual({ previsao: true, bolaAtingida: true });
    expect(m.giz).toBe(m.regras.giz);
    expect(m.forca).toBe('empurrar');
    expect(m.tempoS).toBe(45);
    expect(m.linha.previsao).toBe(true);
  });

  it('sem giz, força nem modalidade no estado (versão que não os manda): valem os padrões', () => {
    const m = modeloDaSala(estado('1x1', ['Ana', 'Beto']), 0, true);
    expect(m.modalidade).toBe('par-ou-impar');
    expect(m.forca).toBe('linha');
    expect(m.giz).toEqual({ desgasteMin: 0.1, desgasteMax: 0.3, passada: 0.1, passadaS: 3 });
    expect(m.tempoS).toBeUndefined();
    expect(m.regras.tempoS).toBe(30);
  });

  it('só o anfitrião, e só na espera, pode configurar', () => {
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto']), 0, true).podeConfigurar).toBe(true);
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto']), 1, false).podeConfigurar).toBe(false);
    expect(modeloDaSala(estado('1x1', ['Ana', 'Beto'], { fase: 'jogando' }), 0, true).podeConfigurar).toBe(false);
  });
});
