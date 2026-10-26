import { describe, expect, it } from 'vitest';
import { pontosPorEquipe } from './leitura';
import { aplicarTacada, novaPartida, passarVez } from './partida';
import {
  ANA,
  BETO,
  CAIO,
  DANI,
  DUPLAS,
  DOIS_CONTRA_UM,
  JOGADORES,
  QUARTETO,
  SEM_PENA_NAS_FALTAS,
  SEM_PENA_NO_CEGAR,
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
import { PRESET_BOTECO, PRESET_MATA_MATA } from './presets';
import type { EstadoPartida } from './tipos';

const todas = numeros(1, 15);

const CEGA: Tacada = {};
const CEGA_E_CAI: Tacada = { branca: 'cai' };
const CEGA_E_SAI: Tacada = { branca: 'fora' };
const CAI: Tacada = { toca: 5, branca: 'cai' };
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

describe('cegar no mata-mata: o preset e a forma do estado', () => {
  it('o mata-mata liga "perde-proxima-vez"; o Boteco fica em "sem-pena"; o estado começa sem o campo', () => {
    expect(PRESET_MATA_MATA.regras.cegarNoMataMata).toBe('perde-proxima-vez');
    expect(PRESET_BOTECO.regras.cegarNoMataMata).toBe('sem-pena');
    for (const jogadores of [JOGADORES, TRIO, QUARTETO]) {
      const { partida } = novaPartida(configMataMata(), jogadores, rngDeTeste(1));
      expect(partida).not.toHaveProperty('perdemAProximaVez');
    }
  });

  it('as duas opções são independentes: o preset liga as duas, e cada uma desliga sem mexer na outra', () => {
    expect(PRESET_MATA_MATA.regras).toMatchObject({ suicidioNoMataMata: 'perde-proxima-vez', cegarNoMataMata: 'perde-proxima-vez' });
    expect(configMataMata(SEM_PENA_NO_CEGAR)).toMatchObject({ suicidioNoMataMata: 'perde-proxima-vez', cegarNoMataMata: 'sem-pena' });
    expect(configMataMata(SEM_PENA_NO_SUICIDIO)).toMatchObject({ suicidioNoMataMata: 'sem-pena', cegarNoMataMata: 'perde-proxima-vez' });
    expect(configMataMata(SEM_PENA_NAS_FALTAS)).toMatchObject({ suicidioNoMataMata: 'sem-pena', cegarNoMataMata: 'sem-pena' });
  });

  it('tacada que não cega nem tira a branca não escreve o campo, nem vazio: a forma é a de sempre', () => {
    const base = mataMataCom({ naMesa: todas, jogadores: TRIO });
    const r = tacar(base, { toca: 5, caem: [5] });
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    expect(Object.keys(r.partida).sort()).toEqual(Object.keys(base).sort());
  });

  it('bola fora da mesa sozinha segue sem pena: só cegar e a branca fora do jogo custam a vez', () => {
    const pulou = tacar(mataMataCom({ naMesa: todas, regras: { bolaForaDaMesa: 'falta' } }), { toca: 5, pulam: [7] });
    expect(pulou.consequencias.faltas).toEqual([{ nome: 'bola-fora' }]);
    expect(pulou.consequencias.texto).toBe('Bola fora da mesa! Falta sem pena. A 7 pulou da mesa. Vez de Beto.');
    expect(pulou.partida).not.toHaveProperty('perdemAProximaVez');
  });
});

describe('cegar no mata-mata: 1×1', () => {
  it('a vez passa a Beto, e quando voltaria a Ana ele joga outra vez', () => {
    const cego = tacar(mataMataCom({ naMesa: todas }), CEGA);
    expect(cego.consequencias).toEqual({
      faltas: [{ nome: 'cegar' }],
      retirar: [],
      recolocar: [],
      proximo: BETO,
      vencedor: null,
      texto: 'Cegou! Ana perde a próxima vez. Vez de Beto.',
    });
    expect(cego.partida).toMatchObject({ vez: BETO, perdemAProximaVez: [ANA], fase: 'aberta', naMesa: todas, retiradas: [] });

    const seguinte = tacar(cego.partida);
    expect(seguinte.consequencias).toMatchObject({ proximo: BETO, texto: 'Beto não matou nenhuma. Ana perdeu a vez: joga Beto.' });
    expect(seguinte.partida.vez).toBe(BETO);
    expect(seguinte.partida, 'a pena foi cumprida: o campo sai').not.toHaveProperty('perdemAProximaVez');

    const terceira = tacar(seguinte.partida);
    expect(terceira.consequencias).toMatchObject({ proximo: ANA, texto: 'Beto não matou nenhuma. Vez de Ana.' });
    expect(terceira.partida).not.toHaveProperty('perdemAProximaVez');
  });

  it('a branca não se mexe: cegar sozinho não recoloca nada (só o suicídio põe a branca na marca)', () => {
    const r = tacar(mataMataCom({ naMesa: todas }), CEGA);
    expect(r.consequencias.recolocar).toEqual([]);
    expect(r.consequencias.texto).not.toContain('Branca na marca');
  });

  it('a pena vale uma vez só: quem a cumpre volta à roda normal', () => {
    const { vezes } = jogar(mataMataCom({ naMesa: todas }), CEGA, ...sorteadas(5));
    expect(vezes).toEqual([BETO, BETO, ANA, BETO, ANA, BETO]);
  });

  it('o outro também cega: as duas penas se consomem e a vez cai em Ana', () => {
    const primeira = tacar(mataMataCom({ naMesa: todas }), CEGA);
    const segunda = tacar(primeira.partida, CEGA);
    expect(segunda.consequencias.texto).toBe('Cegou! Beto perde a próxima vez. Ana e Beto perderam a vez: joga Ana.');
    expect(segunda.partida).toMatchObject({ vez: ANA });
    expect(segunda.partida).not.toHaveProperty('perdemAProximaVez');
    expect(jogar(segunda.partida, ...sorteadas(3)).vezes).toEqual([BETO, ANA, BETO]);
  });

  it('na tacada de saída também vale', () => {
    const saida = novaPartida(configMataMata(), JOGADORES, rngDeTeste(1)).partida;
    const r = tacar(saida, CEGA);
    expect(r.partida).toMatchObject({ fase: 'aberta', vez: BETO, perdemAProximaVez: [ANA] });
  });

  it('cegar com uma bola que pulou da mesa (bolaForaDaMesa "falta"): as duas faltas na frase e a pena é uma só', () => {
    const r = tacar(mataMataCom({ naMesa: todas, regras: { bolaForaDaMesa: 'falta' } }), { pulam: [7] });
    expect(r.consequencias.faltas).toEqual([{ nome: 'cegar' }, { nome: 'bola-fora' }]);
    expect(r.consequencias.texto).toBe('Cegou e bola fora da mesa! Ana perde a próxima vez. A 7 pulou da mesa. Vez de Beto.');
    expect(r.partida.perdemAProximaVez).toEqual([ANA]);
  });
});

describe('cegar no mata-mata: 3 jogadores', () => {
  const trio = (vez = ANA) => mataMataCom({ naMesa: todas, jogadores: TRIO, vez });

  it('a vez passa a Beto como sempre; ao chegar em Ana, ela é pulada e joga Beto', () => {
    const { vezes } = jogar(trio(), CEGA, ...sorteadas(5));
    expect(vezes).toEqual([BETO, CAIO, BETO, CAIO, ANA, BETO]);
  });

  it('a frase de quem passa a vez por cima de Ana diz quem perdeu e quem joga', () => {
    const { partida } = jogar(trio(), CEGA, LIMPA);
    const r = tacar(partida);
    expect(r.consequencias.texto).toBe('Caio não matou nenhuma. Ana perdeu a vez: joga Beto.');
    expect(r.consequencias.proximo).toBe(BETO);
  });

  it('quem cega no meio da roda: Beto perde a vez dele na volta', () => {
    const { vezes, partida } = jogar(trio(BETO), CEGA);
    expect(vezes).toEqual([CAIO]);
    expect(partida.perdemAProximaVez).toEqual([BETO]);
    expect(jogar(partida, ...sorteadas(4)).vezes).toEqual([ANA, CAIO, ANA, BETO]);
  });

  it('dois cegos seguidos de pessoas diferentes: o campo guarda os dois, em ordem crescente', () => {
    const ana = tacar(trio(), CEGA);
    const beto = tacar(ana.partida, CEGA);
    expect(beto.partida).toMatchObject({ vez: CAIO, perdemAProximaVez: [ANA, BETO] });
    expect(beto.consequencias.texto).toBe('Cegou! Beto perde a próxima vez. Vez de Caio.');

    const caio = tacar(beto.partida);
    expect(caio.consequencias).toMatchObject({ proximo: CAIO, texto: 'Caio não matou nenhuma. Ana e Beto perderam a vez: joga Caio.' });
    expect(caio.partida).not.toHaveProperty('perdemAProximaVez');
  });

  it('um cego e um suicida de pessoas diferentes entram na mesma lista', () => {
    const ana = tacar(trio(), CEGA);
    const beto = tacar(ana.partida, CAI);
    expect(beto.partida).toMatchObject({ vez: CAIO, perdemAProximaVez: [ANA, BETO] });
    expect(beto.consequencias.texto).toBe('Suicídio! Beto perde a próxima vez. Branca na marca. Vez de Caio.');
  });

  it('todos na lista: cada pulo gasta uma pena, a roda segue e não trava', () => {
    const { partida } = jogar(trio(), CEGA, CEGA);
    expect(partida.perdemAProximaVez).toEqual([ANA, BETO]);
    const caio = tacar(partida, CEGA);
    expect(caio.consequencias.texto).toBe('Cegou! Caio perde a próxima vez. Ana, Beto e Caio perderam a vez: joga Ana.');
    expect(caio.partida).toMatchObject({ vez: ANA });
    expect(caio.partida).not.toHaveProperty('perdemAProximaVez');
    expect(jogar(caio.partida, ...sorteadas(4)).vezes).toEqual([BETO, CAIO, ANA, BETO]);
  });
});

describe('cegar no mata-mata: 4 jogadores', () => {
  const quarteto = (vez = ANA) => mataMataCom({ naMesa: todas, jogadores: QUARTETO, vez });

  it('Beto cega no meio da roda: perde a vez dele na volta e só ele', () => {
    const { vezes, partida } = jogar(quarteto(BETO), CEGA);
    expect(vezes).toEqual([CAIO]);
    expect(partida.perdemAProximaVez).toEqual([BETO]);
    expect(jogar(partida, ...sorteadas(6)).vezes).toEqual([DANI, ANA, CAIO, DANI, ANA, BETO]);
  });

  it('Dani, a última da roda, cega: perde a vez e a roda recomeça em Ana', () => {
    const { vezes, partida } = jogar(quarteto(DANI), CEGA, ...sorteadas(4));
    expect(vezes).toEqual([ANA, BETO, CAIO, ANA, BETO]);
    expect(partida).not.toHaveProperty('perdemAProximaVez');
  });

  it('dois cegos seguidos de pessoas diferentes: os dois são pulados na volta, na ordem da roda', () => {
    const dani = tacar(quarteto(DANI), CEGA);
    const ana = tacar(dani.partida, CEGA);
    expect(ana.partida).toMatchObject({ vez: BETO, perdemAProximaVez: [ANA, DANI] });
    const beto = tacar(ana.partida);
    const caio = tacar(beto.partida);
    expect(caio.consequencias).toMatchObject({ proximo: BETO, texto: 'Caio não matou nenhuma. Dani e Ana perderam a vez: joga Beto.' });
  });

  it('os quatro cegam em fila: no último a roda consome tudo e para em Ana', () => {
    const { partida } = jogar(quarteto(), CEGA, CEGA, CEGA);
    expect(partida).toMatchObject({ vez: DANI, perdemAProximaVez: [ANA, BETO, CAIO] });
    const dani = tacar(partida, CEGA);
    expect(dani.consequencias.texto).toBe('Cegou! Dani perde a próxima vez. Ana, Beto, Caio e Dani perderam a vez: joga Ana.');
    expect(dani.partida).toMatchObject({ vez: ANA });
    expect(dani.partida).not.toHaveProperty('perdemAProximaVez');
  });
});

describe('cegar e suicídio na mesma tacada: uma pena só', () => {
  it.each([
    ['a branca cai', CEGA_E_CAI, 'Cegou e suicídio! Ana perde a próxima vez. Branca na marca. Vez de Beto.'],
    ['a branca sai da mesa', CEGA_E_SAI, 'Cegou e bolão fora da mesa! Ana perde a próxima vez. Branca na marca. Vez de Beto.'],
  ] as const)('1×1, %s: uma entrada na lista, a frase cita as duas faltas sem repetir a pena', (_, tacada, frase) => {
    const r = tacar(mataMataCom({ naMesa: todas }), tacada);
    expect(r.consequencias.faltas.map((f) => f.nome)).toEqual(['cegar', tacada.branca === 'cai' ? 'suicidio' : 'branca-fora']);
    expect(r.consequencias.recolocar).toEqual([{ bola: 0, lugar: 'marca-saida' }]);
    expect(r.consequencias.texto).toBe(frase);
    expect(r.consequencias.texto.match(/perde a próxima vez/g)).toHaveLength(1);
    expect(r.partida.perdemAProximaVez, 'uma entrada, não duas').toEqual([ANA]);
  });

  it('a pena é uma só também na roda: Ana é pulada uma vez, não duas', () => {
    const trio = mataMataCom({ naMesa: todas, jogadores: TRIO });
    const { vezes, partida } = jogar(trio, CEGA_E_CAI, ...sorteadas(5));
    expect(vezes).toEqual([BETO, CAIO, BETO, CAIO, ANA, BETO]);
    expect(partida).not.toHaveProperty('perdemAProximaVez');

    const um = mataMataCom({ naMesa: todas });
    expect(jogar(um, CEGA_E_CAI, ...sorteadas(3)).vezes).toEqual([BETO, BETO, ANA, BETO]);
  });

  it('só o suicídio ligado: a mesma tacada pune uma vez, pelo suicídio', () => {
    const r = tacar(mataMataCom({ naMesa: todas, regras: SEM_PENA_NO_CEGAR }), CEGA_E_CAI);
    expect(r.consequencias.texto).toBe('Cegou e suicídio! Ana perde a próxima vez. Branca na marca. Vez de Beto.');
    expect(r.partida.perdemAProximaVez).toEqual([ANA]);
  });

  it('só cegar ligado: a mesma tacada pune uma vez, por cegar', () => {
    const r = tacar(mataMataCom({ naMesa: todas, regras: SEM_PENA_NO_SUICIDIO }), CEGA_E_CAI);
    expect(r.consequencias.texto).toBe('Cegou e suicídio! Ana perde a próxima vez. Branca na marca. Vez de Beto.');
    expect(r.partida.perdemAProximaVez).toEqual([ANA]);
  });

  it('as duas desligadas: a frase é a de antes e ninguém perde a vez', () => {
    const casa = { naMesa: todas, regras: SEM_PENA_NAS_FALTAS };
    const r = tacar(mataMataCom(casa), CEGA_E_CAI);
    expect(r.consequencias.texto).toBe('Cegou e suicídio! Falta sem pena: branca na marca. Vez de Beto.');
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    expect(jogar(mataMataCom({ ...casa, jogadores: TRIO }), CEGA_E_CAI, ...sorteadas(3)).vezes).toEqual([BETO, CAIO, ANA, BETO]);
  });

  it('duas pessoas, cada uma cegando e tirando a branca: cada uma entra uma vez na lista', () => {
    const ana = tacar(mataMataCom({ naMesa: todas, jogadores: TRIO }), CEGA_E_CAI);
    const beto = tacar(ana.partida, CEGA_E_CAI);
    expect(beto.partida).toMatchObject({ vez: CAIO, perdemAProximaVez: [ANA, BETO] });
    expect(beto.consequencias.texto).toBe('Cegou e suicídio! Beto perde a próxima vez. Branca na marca. Vez de Caio.');
  });
});

describe('cegar com a pena desligada (só o suicídio ligado)', () => {
  const casa = { naMesa: todas, regras: SEM_PENA_NO_CEGAR };

  it('cegar é falta sem pena, como no L15: a frase de antes e ninguém perde a vez', () => {
    const antes = mataMataCom(casa);
    const r = tacar(antes);
    expect(r.consequencias).toEqual({
      faltas: [],
      retirar: [],
      recolocar: [],
      proximo: BETO,
      vencedor: null,
      texto: 'Ana não matou nenhuma. Vez de Beto.',
    });
    const cego = tacar(antes, CEGA);
    expect(cego.consequencias).toEqual({
      faltas: [{ nome: 'cegar' }],
      retirar: [],
      recolocar: [],
      proximo: BETO,
      vencedor: null,
      texto: 'Cegou! Falta sem pena. Vez de Beto.',
    });
    expect(cego.partida).toEqual({ ...antes, vez: BETO });
    expect(jogar(mataMataCom({ ...casa, jogadores: TRIO }), CEGA, CEGA, CEGA, CEGA).vezes).toEqual([BETO, CAIO, ANA, BETO]);
  });

  it('o suicídio segue punido', () => {
    const r = tacar(mataMataCom(casa), CAI);
    expect(r.consequencias.texto).toBe('Suicídio! Ana perde a próxima vez. Branca na marca. Vez de Beto.');
    expect(r.partida.perdemAProximaVez).toEqual([ANA]);
  });
});

describe('suicídio com a pena desligada (só cegar ligado)', () => {
  const casa = { naMesa: todas, regras: SEM_PENA_NO_SUICIDIO };

  it('o suicídio é falta sem pena, a branca volta à marca, e ninguém perde a vez', () => {
    const r = tacar(mataMataCom(casa), CAI);
    expect(r.consequencias.texto).toBe('Suicídio! Falta sem pena: branca na marca. Vez de Beto.');
    expect(r.consequencias.recolocar).toEqual([{ bola: 0, lugar: 'marca-saida' }]);
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    expect(jogar(mataMataCom({ ...casa, jogadores: TRIO }), CAI, CAI, CAI, CAI).vezes).toEqual([BETO, CAIO, ANA, BETO]);
  });

  it('a branca fora da mesa também, e cegar segue punido', () => {
    const fora = tacar(mataMataCom(casa), { toca: 5, branca: 'fora' });
    expect(fora.consequencias.texto).toBe('Bolão fora da mesa! Falta sem pena: branca na marca. Vez de Beto.');
    expect(fora.partida).not.toHaveProperty('perdemAProximaVez');

    const cego = tacar(mataMataCom(casa), CEGA);
    expect(cego.consequencias.texto).toBe('Cegou! Ana perde a próxima vez. Vez de Beto.');
    expect(cego.partida.perdemAProximaVez).toEqual([ANA]);
  });
});

describe('cegar no mata-mata: a partida acaba', () => {
  const ultima = (extra: Partial<EstadoPartida> = {}): EstadoPartida => ({
    ...mataMataCom({ naMesa: [15], jogadores: TRIO, encacapadas: matou(0, numeros(1, 7), 1, numeros(8, 14)) }),
    ...extra,
  });

  // A física não faz a branca cegar e encaçapar uma bola na mesma tacada; o contrato das regras, porém, vale para qualquer lista de eventos.
  it('a tacada que esvazia a mesa não pune: a frase não promete uma próxima vez', () => {
    const r = tacar(ultima(), { caem: [15] });
    expect(r.consequencias.faltas).toEqual([{ nome: 'cegar' }]);
    expect(r.partida).toMatchObject({ fase: 'fim', vencedor: ANA, vez: BETO });
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    expect(r.consequencias.texto).toBe('Cegou! Falta sem pena. Ana matou a 15 (+1). Acabaram as bolas. Ana venceu com 8 pontos!');
    expect(pontosPorEquipe(r.partida)).toEqual([8, 7, 0]);
  });

  it('a lista que existia fica de fora do estado final', () => {
    const r = tacar(ultima({ perdemAProximaVez: [CAIO] }), { caem: [15] });
    expect(r.partida.fase).toBe('fim');
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
  });
});

describe('cegar no mata-mata: passarVez (tempo esgotado ou queda)', () => {
  it('passar a vez de quem cegou não pune ninguém, e a pena que já existia segue valendo', () => {
    const cego = tacar(mataMataCom({ naMesa: todas, jogadores: TRIO, vez: BETO }), CEGA).partida;
    expect(cego).toMatchObject({ vez: CAIO, perdemAProximaVez: [BETO] });
    const passou = passarVez(congelar(cego));
    expect(passou).toMatchObject({ vez: ANA, perdemAProximaVez: [BETO] });
    expect(passarVez(congelar(passou))).toMatchObject({ vez: CAIO });
    expect(passarVez(congelar(passou))).not.toHaveProperty('perdemAProximaVez');
  });
});

describe('cegar: o par ou ímpar não muda', () => {
  it('Boteco: cegar paga a bola e o estado depois é o de antes (nenhuma chave nova, nenhum pulo)', () => {
    const antes = congelar(partidaCom({ naMesa: [2, 3, 4, 5, 6, 7, 8] }));
    const { partida, consequencias } = aplicarTacada(antes, eventos({}));
    expect(consequencias.faltas).toEqual([{ nome: 'cegar' }]);
    expect(consequencias.texto).toBe('Cegou! Beto recebe a 3.');
    expect(Object.keys(partida).sort()).toEqual(Object.keys(antes).sort());
    expect(partida).not.toHaveProperty('perdemAProximaVez');
  });

  it('Boteco: nenhuma tacada que cega (1×1, 2×1, 2×2) nem passarVez escreve o campo', () => {
    for (const jogadores of [JOGADORES, DOIS_CONTRA_UM, DUPLAS]) {
      const antes = congelar(partidaCom({ naMesa: [2, 3, 4, 5, 6, 7, 8], jogadores }));
      for (const t of [{}, { branca: 'cai' }, { branca: 'fora' }] as const) {
        const depois = aplicarTacada(antes, eventos(t)).partida;
        expect(depois, JSON.stringify(t)).not.toHaveProperty('perdemAProximaVez');
        expect(Object.keys(depois).sort()).toEqual(Object.keys(antes).sort());
      }
      expect(passarVez(antes)).not.toHaveProperty('perdemAProximaVez');
    }
  });

  it('Boteco: um estado com a chave ligada (que `validarPreset` recusa ali) é ignorado pela roda do par ou ímpar', () => {
    const base = partidaCom({ naMesa: [2, 3, 4, 5, 6, 7, 8] });
    const sem = aplicarTacada(congelar(base), eventos({})).partida;
    const com = aplicarTacada(congelar({ ...base, config: { ...base.config, cegarNoMataMata: 'perde-proxima-vez' } }), eventos({})).partida;
    expect(com.vez).toBe(sem.vez);
    expect(com).not.toHaveProperty('perdemAProximaVez');
  });
});
