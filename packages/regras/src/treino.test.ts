import { describe, expect, it } from 'vitest';
import boteco from '../presets/boteco.json';
import mataMata from '../presets/mata-mata.json';
import treino from '../presets/treino.json';
import { bolasAlvo, jogadoresDaProxima, pontosPorEquipe } from './leitura';
import { ehTreino, formacoesAceitas } from './modalidades';
import { aplicarTacada, novaPartida, passarVez } from './partida';
import { ANA, BETO, JOGADORES, SOLO, config, configMataMata, configTreino, congelar, eventos, numeros, rngDeTeste, treinoCom, type Tacada } from './para-testes';
import { OPCOES_REGRAS, PRESET_BOTECO, PRESET_MATA_MATA, PRESET_TREINO, PRESETS_DE_FABRICA, incoerenciasDaConfig, validarPreset } from './presets';
import { sincronizarMesa } from './treino';
import type { Consequencias, EstadoPartida } from './tipos';

const todas = numeros(1, 15);
const sem = (...bolas: number[]) => todas.filter((b) => !bolas.includes(b));

/** Uma tacada numa partida congelada; confere a pureza e que a vez não anda. */
function tacar(partida: EstadoPartida, t: Tacada = {}) {
  const antes = congelar(partida);
  const evs = congelar(eventos(t));
  const r = aplicarTacada(antes, evs);
  expect(aplicarTacada(antes, evs), 'pura').toEqual(r);
  expect(r.partida.vez, 'a vez nunca passa').toBe(ANA);
  expect(r.consequencias.proximo).toBe(ANA);
  expect(r.partida.vencedor).toBe(r.consequencias.vencedor);
  expect(r.partida.perdemAProximaVez, 'ninguém perde a vez no treino').toBeUndefined();
  expect(r.consequencias.retirar, 'nada sai como pena').toEqual([]);
  expect(r.partida.retiradas, 'nada sai como pena').toEqual(antes.retiradas);
  return r;
}

/** Cada bola da casa em um lugar só (`naMesa`, `encacapadas`, `retiradas`). */
function conservada(p: EstadoPartida): void {
  const lugares = [...p.naMesa, ...p.encacapadas.map((e) => e.bola), ...p.retiradas];
  expect([...lugares].sort((a, b) => a - b)).toEqual(todas);
}

describe('treino: novaPartida', () => {
  it('uma pessoa, as 15 bolas, sem grupo, na saída', () => {
    const { partida, arrumacao } = novaPartida(configTreino(), SOLO, rngDeTeste(1));
    expect(partida).toEqual<EstadoPartida>({
      config: configTreino(),
      jogadores: SOLO,
      vez: 0,
      grupos: [null],
      fase: 'saida',
      naMesa: todas,
      encacapadas: [],
      retiradas: [],
      vencedor: null,
    });
    expect([...arrumacao].sort((a, b) => a - b)).toEqual(todas);
    expect(bolasAlvo(partida)).toEqual(todas);
  });

  it('o rng embaralha o triângulo', () => {
    const ordem = (s: number) => novaPartida(configTreino(), SOLO, rngDeTeste(s)).arrumacao;
    expect(ordem(3)).toEqual(ordem(3));
    expect(ordem(3)).not.toEqual(ordem(4));
  });

  it('só aceita uma pessoa: dois, três ou nenhum jogador são recusados', () => {
    expect(() => novaPartida(configTreino(), JOGADORES, rngDeTeste(1))).toThrow(/treino é de uma pessoa só, não de 2/);
    expect(() => novaPartida(configTreino(), [...JOGADORES, { id: 'c', nome: 'Caio', equipe: 2 }], rngDeTeste(1))).toThrow(/pessoa só/);
    expect(() => novaPartida(configTreino(), [], rngDeTeste(1))).toThrow(/pessoa só, não de 0/);
    expect(() => novaPartida(configTreino(), [{ id: 'b', nome: 'Beto', equipe: 1 }], rngDeTeste(1))).toThrow(/equipe 0/);
  });

  it('recusa a config que não fecha, dizendo o que sobra', () => {
    expect(() => novaPartida(configTreino({ suicidioNoMataMata: 'perde-proxima-vez' }), SOLO, rngDeTeste(1))).toThrow(/config do treino não fecha[\s\S]*suicidioNoMataMata/);
    expect(() => novaPartida(configTreino({ cegarNoMataMata: 'perde-proxima-vez' }), SOLO, rngDeTeste(1))).toThrow(/cegarNoMataMata/);
    expect(() => novaPartida(configTreino({ bolas: '2-14', bolaFinal: 8 }), SOLO, rngDeTeste(1))).toThrow(/regras\.bolas[\s\S]*regras\.bolaFinal/);
    expect(() => novaPartida(configTreino({ modalidade: 'par-ou-impar' }), SOLO, rngDeTeste(1))).toThrow(/regras\.treino/);
  });

  it('o mata-mata e o par ou ímpar seguem recusando uma pessoa só', () => {
    expect(() => novaPartida(configMataMata(), SOLO, rngDeTeste(1))).toThrow(/não aceita 1 jogador/);
    expect(() => novaPartida(config(), SOLO, rngDeTeste(1))).toThrow(/2 jogadores/);
  });
});

describe('treino: a vez nunca passa', () => {
  it('tacada sem bola, com e sem toque: a vez fica, sem "Vez de"', () => {
    const r = tacar(treinoCom({ naMesa: todas }), { toca: 5 });
    expect(r.partida.fase).toBe('aberta');
    expect(r.consequencias.texto).toBe('Ana não matou nenhuma.');
    expect(tacar(r.partida, {}).partida.vez).toBe(ANA);
  });

  it('bola encaçapada, falta ou as duas: a vez fica', () => {
    const p = treinoCom({ naMesa: todas });
    expect(tacar(p, { toca: 5, caem: [5, 9] }).partida.naMesa).toEqual(sem(5, 9));
    expect(tacar(p, { toca: 5, branca: 'cai' }).partida.vez).toBe(ANA);
    expect(tacar(p, { toca: 5, caem: [5], branca: 'fora' }).partida.vez).toBe(ANA);
  });

  it('várias tacadas seguidas, da saída à mesa limpa: a vez é sempre a dela', () => {
    let { partida } = novaPartida(configTreino(), SOLO, rngDeTeste(7));
    expect(partida.fase).toBe('saida');
    for (const bola of todas) {
      const r = tacar(partida, { toca: bola, caem: [bola] });
      partida = r.partida;
      expect(partida.fase).toBe(bola === 15 ? 'fim' : 'aberta');
    }
  });

  it('passarVez devolve a partida como está: a vez e as bolas não mudam', () => {
    const p = congelar(treinoCom({ naMesa: sem(5), fase: 'aberta' }));
    expect(passarVez(p)).toEqual(p);
    expect(passarVez(p).vez).toBe(ANA);
    expect(passarVez(treinoCom({ naMesa: todas, fase: 'saida' })).fase).toBe('saida');
  });

  it('passarVez depois da mesa limpa lança, como nas outras modalidades', () => {
    expect(() => passarVez(treinoCom({ naMesa: [], fase: 'fim' }))).toThrow(/terminou/);
  });
});

describe('treino: falta informada, sem pena', () => {
  it('cegar: a falta vem nas consequências, nenhuma bola sai e nada volta', () => {
    const p = treinoCom({ naMesa: todas });
    const r = tacar(p, {});
    expect(r.consequencias.faltas).toEqual([{ nome: 'cegar' }]);
    expect(r.consequencias.recolocar).toEqual([]);
    expect(r.partida.naMesa).toEqual(todas);
    expect(r.partida.encacapadas).toEqual([]);
    expect(r.consequencias.texto).toBe('Cegou! Falta sem pena.');
    expect(r.consequencias.brancaNaMao).toBeUndefined();
  });

  it('suicídio: a falta vem, a bola que caiu conta, e o resto da mesa fica como está', () => {
    const r = tacar(treinoCom({ naMesa: todas }), { toca: 4, caem: [4], branca: 'cai' });
    expect(r.consequencias.faltas).toEqual([{ nome: 'suicidio' }]);
    expect(r.partida.naMesa).toEqual(sem(4));
    expect(r.partida.encacapadas).toEqual([{ bola: 4, jogador: ANA }]);
    expect(r.consequencias.texto).toBe('Suicídio! Falta sem pena: branca na mão. Ana matou a 4.');
  });

  it('bolão fora da mesa: falta com nome, sem pena', () => {
    const r = tacar(treinoCom({ naMesa: todas }), { toca: 4, branca: 'fora' });
    expect(r.consequencias.faltas).toEqual([{ nome: 'branca-fora' }]);
    expect(r.partida.naMesa).toEqual(todas);
    expect(r.consequencias.texto).toBe('Bolão fora da mesa! Falta sem pena: branca na mão.');
  });

  it('cegar e suicídio na mesma tacada: as duas informadas, nenhuma paga', () => {
    const r = tacar(treinoCom({ naMesa: todas }), { branca: 'cai' });
    expect(r.consequencias.faltas).toEqual([{ nome: 'cegar' }, { nome: 'suicidio' }]);
    expect(r.consequencias.retirar).toEqual([]);
    expect(r.partida.naMesa).toEqual(todas);
    expect(r.consequencias.texto).toBe('Cegou e suicídio! Falta sem pena: branca na mão.');
  });

  it('nada de castigo nem de bola devolvida: a mesa só perde o que caiu, falta após falta', () => {
    let p = treinoCom({ naMesa: todas });
    for (const t of [{ toca: 8, caem: [8], branca: 'cai' }, { branca: 'fora' }, { toca: 15, caem: [15] }, {}] satisfies Tacada[]) {
      const antes = p.naMesa.length;
      const r = tacar(p, t);
      expect(r.partida.naMesa.length).toBe(antes - (t.caem?.length ?? 0));
      expect(r.consequencias.recolocar.every((x) => x.bola === 0), 'só a branca volta').toBe(true);
      expect(r.partida.grupos).toEqual([null]);
      p = r.partida;
    }
    conservada(p);
  });

  it('bola que pula da mesa: volta ao centro sem falta (`sem-falta`), e com `falta` a falta é informada sem pena', () => {
    const livre = tacar(treinoCom({ naMesa: todas }), { toca: 6, pulam: [6] });
    expect(livre.consequencias.faltas).toEqual([]);
    expect(livre.consequencias.recolocar).toEqual([{ bola: 6, lugar: 'centro-mesa' }]);
    expect(livre.partida.naMesa).toEqual(todas);
    expect(livre.consequencias.texto).toBe('Ana não matou nenhuma. A 6 pulou da mesa.');

    const falta = tacar(treinoCom({ naMesa: todas, regras: { bolaForaDaMesa: 'falta' } }), { toca: 6, pulam: [6] });
    expect(falta.consequencias.faltas).toEqual([{ nome: 'bola-fora' }]);
    expect(falta.consequencias.recolocar).toEqual([{ bola: 6, lugar: 'centro-mesa' }]);
    expect(falta.partida.naMesa).toEqual(todas);
    expect(falta.partida.retiradas).toEqual([]);
  });

  it('mesmo com `penaDireta`, `penaInvertida` e `ultimaPorPenaOuAdversario` de outra casa, a pena não existe', () => {
    const r = tacar(treinoCom({ naMesa: todas, regras: { penaDireta: 2, penaInvertida: true, penaDupla: true, ultimaPorPenaOuAdversario: 'volta' } }), { toca: 2, branca: 'cai' });
    expect(r.consequencias.retirar).toEqual([]);
    expect(r.consequencias.recolocar).toEqual([{ bola: 0, lugar: 'marca-saida' }]);
    expect(r.partida.naMesa).toEqual(todas);
  });
});

describe('treino: branca na mão', () => {
  it('caindo na caçapa ou saindo da mesa, volta à mão; `recolocar` guarda o lugar de partida', () => {
    for (const branca of ['cai', 'fora'] as const) {
      const r = tacar(treinoCom({ naMesa: todas }), { toca: 3, branca });
      expect(r.consequencias.brancaNaMao, branca).toBe(true);
      expect(r.consequencias.recolocar, branca).toEqual([{ bola: 0, lugar: 'marca-saida' }]);
    }
  });

  it('a bola que pulou volta antes da branca, que é sempre a última a ser posta', () => {
    const r = tacar(treinoCom({ naMesa: todas }), { toca: 3, pulam: [3], branca: 'cai' });
    expect(r.consequencias.recolocar).toEqual([{ bola: 3, lugar: 'centro-mesa' }, { bola: 0, lugar: 'marca-saida' }]);
    expect(r.consequencias.brancaNaMao).toBe(true);
  });

  it('tacada limpa ou só com falta de toque: a chave nem aparece', () => {
    for (const t of [{ toca: 3 }, { toca: 3, caem: [3] }, {}, { toca: 3, pulam: [3] }] satisfies Tacada[]) {
      const c: Consequencias = tacar(treinoCom({ naMesa: todas }), t).consequencias;
      expect('brancaNaMao' in c, JSON.stringify(t)).toBe(false);
    }
  });

  it('no mata-mata e no par ou ímpar a branca não vai à mão', () => {
    const mm = aplicarTacada(
      { ...treinoCom({ naMesa: todas }), config: configMataMata(), jogadores: JOGADORES, grupos: [null, null] },
      eventos({ toca: 3, branca: 'cai' }),
    );
    expect('brancaNaMao' in mm.consequencias).toBe(false);
    const po = aplicarTacada(novaPartida(config(), JOGADORES, rngDeTeste(1)).partida, eventos({ toca: 3, branca: 'cai' }));
    expect('brancaNaMao' in po.consequencias).toBe(false);
  });
});

describe('treino: fim da mesa', () => {
  it('a tacada que encaçapa a última bola acaba: fim, a pessoa vence, a vez fica e a frase diz', () => {
    const r = tacar(treinoCom({ naMesa: [11] }), { toca: 11, caem: [11] });
    expect(r.partida).toMatchObject({ fase: 'fim', vencedor: 0, vez: 0, naMesa: [] });
    expect(r.consequencias).toMatchObject({ vencedor: 0, proximo: 0, texto: 'Ana matou a 11. Mesa limpa!' });
    expect(pontosPorEquipe(r.partida)).toEqual([15]);
    conservada(r.partida);
  });

  it('as duas últimas na mesma tacada também acabam; uma delas só, não', () => {
    expect(tacar(treinoCom({ naMesa: [3, 4] }), { toca: 3, caem: [3, 4] }).partida.fase).toBe('fim');
    const meio = tacar(treinoCom({ naMesa: [3, 4] }), { toca: 3, caem: [3] });
    expect(meio.partida).toMatchObject({ fase: 'aberta', vencedor: null, naMesa: [4] });
    expect(meio.consequencias.texto).not.toMatch(/Mesa limpa/);
  });

  it('a última cai mas outra pula da mesa na mesma tacada: continua, a que pulou volta', () => {
    const r = tacar(treinoCom({ naMesa: [3, 4] }), { toca: 3, caem: [3], pulam: [4] });
    expect(r.partida).toMatchObject({ fase: 'aberta', vencedor: null, naMesa: [4] });
    expect(r.consequencias.recolocar).toEqual([{ bola: 4, lugar: 'centro-mesa' }]);
  });

  it('a última cai com falta (suicídio): acaba, com a falta informada e sem pena', () => {
    const r = tacar(treinoCom({ naMesa: [7] }), { toca: 7, caem: [7], branca: 'cai' });
    expect(r.partida.fase).toBe('fim');
    expect(r.consequencias.faltas).toEqual([{ nome: 'suicidio' }]);
    expect(r.consequencias.texto).toBe('Suicídio! Falta sem pena: branca na mão. Ana matou a 7. Mesa limpa!');
  });

  it('mesa que o jogador esvaziou à mão: uma tacada sem bola não a encerra', () => {
    const vazia = sincronizarMesa(treinoCom({ naMesa: [5, 6] }), []);
    expect(vazia).toMatchObject({ naMesa: [], fase: 'aberta', vencedor: null });
    const r = tacar(vazia, {});
    expect(r.partida).toMatchObject({ fase: 'aberta', vencedor: null });
    expect(r.consequencias.faltas).toEqual([{ nome: 'cegar' }]);
  });

  it('depois do fim a tacada lança, e a próxima partida é da mesma pessoa', () => {
    const { partida } = aplicarTacada(treinoCom({ naMesa: [11] }), eventos({ toca: 11, caem: [11] }));
    expect(() => aplicarTacada(partida, eventos({ toca: 3 }))).toThrow(/terminou/);
    expect(jogadoresDaProxima(partida)).toEqual(SOLO);
    expect(() => novaPartida(partida.config, jogadoresDaProxima(partida), rngDeTeste(2))).not.toThrow();
  });
});

describe('sincronizarMesa', () => {
  const comMesa = (naMesa: number[], extra: Partial<Parameters<typeof treinoCom>[0]> = {}) => congelar(treinoCom({ naMesa, ...extra }));

  it('a mesma lista não muda nada, em qualquer ordem', () => {
    const p = comMesa(sem(2, 3));
    expect(sincronizarMesa(p, p.naMesa)).toEqual(p);
    expect(sincronizarMesa(p, [...p.naMesa].reverse())).toEqual(p);
  });

  it('tirar uma bola: ela sai de `naMesa` e vai para `retiradas`, sem virar ponto', () => {
    const p = comMesa(todas);
    const depois = sincronizarMesa(p, sem(5));
    expect(depois.naMesa).toEqual(sem(5));
    expect(depois.retiradas).toEqual([5]);
    expect(depois.encacapadas).toEqual([]);
    expect(pontosPorEquipe(depois)).toEqual([0]);
    expect(depois).toMatchObject({ vez: 0, fase: 'aberta', vencedor: null });
    conservada(depois);
  });

  it('tirar várias de uma vez: `retiradas` na ordem em que estavam na mesa', () => {
    const depois = sincronizarMesa(comMesa(todas), sem(12, 3, 7));
    expect(depois.retiradas).toEqual([3, 7, 12]);
    conservada(depois);
  });

  it('devolver à mesa uma bola que tirou: volta, em ordem, e `retiradas` esvazia', () => {
    const tirada = sincronizarMesa(comMesa(todas), sem(5, 9));
    const devolvida = sincronizarMesa(tirada, [...sem(5, 9), 5]);
    expect(devolvida.naMesa).toEqual(sem(9));
    expect(devolvida.retiradas).toEqual([9]);
    conservada(devolvida);
  });

  it('tirar e devolver a mesma bola deixa a partida como estava, e `retiradas` guarda a ordem em que saíram', () => {
    const p = comMesa(sem(1, 2, 14), { retiradas: [14] });
    const ida = sincronizarMesa(p, sem(1, 2, 14, 6));
    expect(ida.retiradas).toEqual([14, 6]);
    expect(sincronizarMesa(ida, p.naMesa)).toEqual(p);
    expect(sincronizarMesa(ida, [...ida.naMesa, 14]).retiradas).toEqual([6]);
  });

  it('devolver uma bola que tinha caído: ela sai de `encacapadas` e o ponto some', () => {
    const p = comMesa(sem(4, 8, 10));
    expect(pontosPorEquipe(p)).toEqual([3]);
    const depois = sincronizarMesa(p, [...p.naMesa, 8]);
    expect(depois.naMesa).toEqual(sem(4, 10));
    expect(depois.encacapadas.map((e) => e.bola)).toEqual([4, 10]);
    expect(pontosPorEquipe(depois)).toEqual([2]);
    conservada(depois);
  });

  it('o bolão na lista é ignorado (a branca está sempre em jogo)', () => {
    const p = comMesa(sem(4));
    expect(sincronizarMesa(p, [0, ...p.naMesa])).toEqual(p);
    expect(sincronizarMesa(p, [...p.naMesa, 0, 4]).naMesa).toEqual(todas);
  });

  it('esvaziar a mesa à mão não acaba a partida', () => {
    const depois = sincronizarMesa(comMesa(todas), []);
    expect(depois).toMatchObject({ naMesa: [], fase: 'aberta', vencedor: null });
    expect(depois.retiradas).toEqual(todas);
    conservada(depois);
  });

  it('depois da mesa limpa, pôr bola de volta reabre a partida; sem bola, continua acabada', () => {
    const fim = comMesa([], { fase: 'fim' });
    expect(fim).toMatchObject({ fase: 'fim', vencedor: 0 });
    const reaberta = sincronizarMesa(fim, [6]);
    expect(reaberta).toMatchObject({ fase: 'aberta', vencedor: null, naMesa: [6] });
    expect(reaberta.encacapadas.map((e) => e.bola)).toEqual(sem(6));
    expect(aplicarTacada(reaberta, eventos({ toca: 6, caem: [6] })).partida).toMatchObject({ fase: 'fim', vencedor: 0 });
    expect(sincronizarMesa(fim, [])).toEqual(fim);
  });

  it('a saída continua saída até a primeira tacada', () => {
    const p = treinoCom({ naMesa: todas, fase: 'saida' });
    expect(sincronizarMesa(p, sem(3)).fase).toBe('saida');
  });

  it('depois de arrumar, as regras jogam com a mesa nova: bola tirada não existe, bola devolvida cai', () => {
    const p = sincronizarMesa(comMesa(todas), sem(5));
    expect(() => aplicarTacada(p, eventos({ toca: 2, caem: [5] }))).toThrow(/5/);
    const devolvida = sincronizarMesa(p, todas);
    expect(aplicarTacada(devolvida, eventos({ toca: 5, caem: [5] })).partida.naMesa).toEqual(sem(5));
    expect(bolasAlvo(p)).toEqual(sem(5));
  });

  it('não muda a entrada (congelada) e devolve outra partida', () => {
    const p = comMesa(todas);
    const depois = sincronizarMesa(p, sem(1));
    expect(depois).not.toBe(p);
    expect(p.naMesa).toEqual(todas);
    expect(p.retiradas).toEqual([]);
  });

  it('recusa bola que a partida não usa, bola repetida e o que não for treino', () => {
    const p = comMesa(todas);
    expect(() => sincronizarMesa(p, [...todas, 16])).toThrow(/a bola 16 não é desta partida/);
    expect(() => sincronizarMesa(p, [-1])).toThrow(/-1/);
    expect(() => sincronizarMesa(p, [1.5])).toThrow(/1\.5/);
    expect(() => sincronizarMesa(p, [3, 3])).toThrow(/a bola 3 aparece duas vezes/);
    const mm = novaPartida(configMataMata(), JOGADORES, rngDeTeste(1)).partida;
    expect(() => sincronizarMesa(mm, mm.naMesa)).toThrow(/só o treino/);
    const po = novaPartida(config(), JOGADORES, rngDeTeste(1)).partida;
    expect(() => sincronizarMesa(po, po.naMesa)).toThrow(/só o treino/);
  });
});

describe('treino: preset e config', () => {
  it('é o mata-mata de uma pessoa, sem pendência, congelado, com `treino: true`', () => {
    expect(PRESET_TREINO.nome).toBe('Treino');
    expect(PRESET_TREINO.provisorio).toEqual([]);
    expect(PRESET_TREINO.regras).toMatchObject({ modalidade: 'mata-mata', bolas: '1-15', bolaFinal: 'ultima-do-grupo', treino: true, suicidioNoMataMata: 'sem-pena', cegarNoMataMata: 'sem-pena' });
    expect(Object.isFrozen(PRESET_TREINO)).toBe(true);
    expect(Object.isFrozen(PRESET_TREINO.regras)).toBe(true);
    expect(ehTreino(PRESET_TREINO.regras)).toBe(true);
  });

  it('tem as chaves do mata-mata e mais `treino`; cada valor é uma das opções', () => {
    expect(Object.keys(PRESET_TREINO.regras).sort()).toEqual([...Object.keys(PRESET_MATA_MATA.regras), 'treino'].sort());
    for (const [chave, opcoes] of Object.entries(OPCOES_REGRAS)) {
      expect(opcoes, chave).toContain(PRESET_TREINO.regras[chave as keyof typeof OPCOES_REGRAS]);
    }
    expect(incoerenciasDaConfig(PRESET_TREINO.regras)).toEqual([]);
  });

  it('não entra no catálogo de modos da sala: nem nos presets de fábrica, nem nas opções, nem nas formações do mata-mata', () => {
    expect(PRESETS_DE_FABRICA).toEqual([PRESET_BOTECO, PRESET_MATA_MATA]);
    expect(PRESETS_DE_FABRICA.some((p) => ehTreino(p.regras))).toBe(false);
    expect(OPCOES_REGRAS.modalidade).toEqual(['par-ou-impar', 'mata-mata']);
    expect(Object.keys(OPCOES_REGRAS)).not.toContain('treino');
    expect(formacoesAceitas(PRESET_MATA_MATA.regras)).toEqual([[1, 1], [1, 1, 1], [1, 1, 1, 1]]);
    expect(formacoesAceitas(PRESET_TREINO.regras)).toEqual([[1]]);
    expect(formacoesAceitas({ modalidade: 'mata-mata' })).toEqual(formacoesAceitas(PRESET_MATA_MATA.regras));
  });

  it('a sala recusa: `validarPreset` sem `aceitaTreino` não deixa passar `treino`', () => {
    expect(() => validarPreset(treino)).toThrow(/regras\.treino: o treino é só local/);
    expect(() => validarPreset(treino, {})).toThrow(/só local/);
    expect(() => validarPreset(treino, { aceitaTreino: false })).toThrow(/só local/);
    expect(() => validarPreset(treino, { aceitaTreino: true })).not.toThrow();
    const doMataMata = { ...mataMata, regras: { ...mataMata.regras, treino: true } };
    expect(() => validarPreset(doMataMata)).toThrow(/só local/);
  });

  it('`treino` só pode ser `true` ou ficar de fora', () => {
    for (const valor of [false, 'sim', 1, null]) {
      const dado = { ...treino, regras: { ...treino.regras, treino: valor } };
      expect(() => validarPreset(dado, { aceitaTreino: true }), String(valor)).toThrow(/regras\.treino: precisa ser true/);
    }
    expect(() => validarPreset(mataMata)).not.toThrow();
    expect(() => validarPreset(boteco)).not.toThrow();
  });

  it('o treino não aceita pena nem outras bolas, nem outra modalidade', () => {
    const com = (mudanca: Record<string, unknown>) => ({ ...treino, regras: { ...treino.regras, ...mudanca } });
    const opcoes = { aceitaTreino: true };
    expect(() => validarPreset(com({ suicidioNoMataMata: 'perde-proxima-vez' }), opcoes)).toThrow(/regras\.suicidioNoMataMata: o treino não tem pena/);
    expect(() => validarPreset(com({ cegarNoMataMata: 'perde-proxima-vez' }), opcoes)).toThrow(/regras\.cegarNoMataMata/);
    expect(() => validarPreset(com({ bolas: '2-14', bolaFinal: 8 }), opcoes)).toThrow(/regras\.bolas[\s\S]*regras\.bolaFinal/);
    expect(() => validarPreset(com({ modalidade: 'par-ou-impar' }), opcoes)).toThrow(/regras\.treino: o treino é o mata-mata de uma pessoa/);
  });

  it('o jogo normal não muda: sem `treino`, o mata-mata continua de 2 a 4 e passa a vez', () => {
    expect(ehTreino(PRESET_MATA_MATA.regras)).toBe(false);
    expect(ehTreino(PRESET_BOTECO.regras)).toBe(false);
    expect('treino' in PRESET_MATA_MATA.regras).toBe(false);
    expect('treino' in PRESET_BOTECO.regras).toBe(false);
    const { partida } = novaPartida(configMataMata(), JOGADORES, rngDeTeste(1));
    const r = aplicarTacada({ ...partida, fase: 'aberta' }, eventos({ toca: 2, caem: [2] }));
    expect(r.partida.vez).toBe(BETO);
    expect(passarVez(partida).vez).toBe(BETO);
  });
});

describe('treino: partidas ao acaso', () => {
  /** Uma tacada ao acaso com bolas que existem na mesa. */
  function tacadaAoAcaso(naMesa: readonly number[], rng: () => number): Tacada {
    const pega = (n: number) => {
      const resto = [...naMesa];
      const pegas: number[] = [];
      while (pegas.length < n && resto.length > 0) pegas.push(resto.splice(Math.floor(rng() * resto.length), 1)[0]!);
      return pegas;
    };
    const [primeira, ...outras] = pega(1 + Math.floor(rng() * 3));
    const t: { -readonly [K in keyof Tacada]: Tacada[K] } = {};
    if (primeira !== undefined && rng() < 0.85) t.toca = primeira;
    t.caem = [primeira, ...outras].filter((b): b is number => b !== undefined && rng() < 0.5);
    const pula = naMesa.filter((b) => !t.caem!.includes(b) && rng() < 0.03);
    if (pula.length > 0) t.pulam = pula.slice(0, 1);
    const r = rng();
    if (r < 0.1) t.branca = 'cai';
    else if (r < 0.15) t.branca = 'fora';
    return t;
  }

  it.each([1, 2, 3, 4, 5, 6])('semente %i: 300 passos de tacada e arrumação, e as invariantes valem sempre', (semente) => {
    const rng = rngDeTeste(semente);
    const sorteio = () => rng.proximo();
    let p = novaPartida(configTreino(), SOLO, rng).partida;
    let marcaDeFim = 0;
    for (let passo = 0; passo < 300; passo++) {
      if (sorteio() < 0.3) {
        // O jogador arruma a mesa: tira umas, devolve outras.
        const lista = todas.filter((b) => (p.naMesa.includes(b) ? sorteio() < 0.8 : sorteio() < 0.2));
        const antes = congelar(p);
        p = sincronizarMesa(antes, sorteio() < 0.5 ? lista : [0, ...lista].reverse());
        expect(p.naMesa, 'sincronizar põe a mesa que o jogador montou').toEqual(lista);
      } else if (p.vencedor === null) {
        const antes = congelar(p);
        const t = tacadaAoAcaso(antes.naMesa, sorteio);
        const r = aplicarTacada(antes, eventos(t));
        const caiu = t.caem?.length ?? 0;
        expect(r.partida.naMesa.length + caiu, 'só cai o que caiu').toBe(antes.naMesa.length);
        expect((r.partida.fase === 'fim'), 'acaba só quando a tacada esvazia a mesa').toBe(caiu > 0 && r.partida.naMesa.length === 0);
        expect(r.consequencias.retirar).toEqual([]);
        expect(r.consequencias.proximo).toBe(0);
        expect(r.consequencias.brancaNaMao === true).toBe(t.branca !== undefined);
        if (r.partida.fase === 'fim') marcaDeFim++;
        p = r.partida;
      } else {
        expect(() => aplicarTacada(p, eventos({}))).toThrow(/terminou/);
        p = sincronizarMesa(p, [1 + Math.floor(sorteio() * 15)]);
      }
      conservada(p);
      expect(p.vez).toBe(0);
      expect(p.perdemAProximaVez).toBeUndefined();
      expect(p.naMesa).toEqual([...p.naMesa].sort((a, b) => a - b));
      expect(p.fase === 'fim', 'fim e vencedor andam juntos').toBe(p.vencedor !== null);
    }
    expect(marcaDeFim, 'a mesa foi limpa ao menos uma vez').toBeGreaterThan(0);
  });
});
