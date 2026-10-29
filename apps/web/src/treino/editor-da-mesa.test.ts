import { CONFIG_FISICA_PADRAO, ID_BOLAO, bolaParada, criarRng, mesaInicial, type EstadoMesa } from '@sinuca/fisica';
import { PRESET_TREINO, novaPartida, sincronizarMesa } from '@sinuca/regras';
import { describe, expect, it } from 'vitest';
import { EditorDaMesa } from './editor-da-mesa';
import { numeradasNaMesa } from './mesa-de-treino';

const cfg = CONFIG_FISICA_PADRAO;
const raio = cfg.bola.raio;

function treino() {
  const { partida, arrumacao } = novaPartida(PRESET_TREINO.regras, [{ id: 'j1', nome: 'Treino', equipe: 0 }], criarRng(5));
  return { partida, mesa: mesaInicial(arrumacao, cfg, criarRng(5)), casa: [...partida.naMesa] };
}
const duas = (): EstadoMesa => ({ bolas: [bolaParada(ID_BOLAO, { x: -0.5, z: 0 }, cfg), bolaParada(1, { x: 0.2, z: 0.1 }, cfg)] });
const pos = (m: EstadoMesa, id: number) => m.bolas.find((b) => b.id === id)!.posicao;

describe('bola na mão (só a branca)', () => {
  it('a branca vem ao cursor onde quer que o clique caia, e fica onde cabe', () => {
    const e = new EditorDaMesa(duas(), [1]);
    expect(e.pegar({ x: 0.7, z: -0.3 }, 'branca')).toBe(ID_BOLAO);
    expect(e.arraste).toMatchObject({ id: ID_BOLAO, valido: true });
    expect(pos(e.mesaDesenhada(), ID_BOLAO)).toMatchObject({ x: 0.7, z: -0.3 });
    expect(pos(e.mesa, ID_BOLAO).x).toBe(-0.5);
    expect(e.soltar()).toEqual({ id: ID_BOLAO, colocada: true });
    expect(pos(e.mesa, ID_BOLAO)).toMatchObject({ x: 0.7, z: -0.3 });
    expect(e.arraste).toBeNull();
  });

  it('soltar onde encosta em outra bola devolve a branca de onde ela saiu', () => {
    const e = new EditorDaMesa(duas(), [1]);
    e.pegar({ x: 0, z: 0 }, 'branca');
    e.mover({ x: 0.2 + raio, z: 0.1 });
    expect(e.arraste?.valido).toBe(false);
    expect(e.soltar()).toEqual({ id: ID_BOLAO, colocada: false });
    expect(pos(e.mesa, ID_BOLAO)).toMatchObject({ x: -0.5, z: 0 });
  });

  it('arrastar para fora da mesa mostra a branca na borda e não deixa soltar lá', () => {
    const e = new EditorDaMesa(duas(), [1]);
    e.pegar({ x: 0, z: 0 }, 'branca');
    e.mover({ x: 5, z: 0 });
    const d = pos(e.mesaDesenhada(), ID_BOLAO);
    expect(d.x).toBeLessThan(cfg.mesa.comprimento / 2);
    expect(e.arraste?.valido).toBe(false);
  });

  it('o bolão não encosta em outra bola na mão nem a um fio de distância', () => {
    const e = new EditorDaMesa(duas(), [1]);
    e.pegar({ x: 0, z: 0 }, 'branca');
    e.mover({ x: 0.2 + raio + cfg.bolao.raio, z: 0.1 });
    expect(e.arraste?.valido).toBe(false);
    e.mover({ x: 0.2 + raio + cfg.bolao.raio + 0.003, z: 0.1 });
    expect(e.arraste?.valido).toBe(true);
  });
});

describe('arrumar a mesa (todas as bolas)', () => {
  it('pega a bola sob o ponto e a leva para outro lugar livre', () => {
    const e = new EditorDaMesa(duas(), [1]);
    expect(e.pegar({ x: 0.2, z: 0.1 }, 'todas')).toBe(1);
    e.mover({ x: 0.8, z: -0.4 });
    expect(e.soltar()).toEqual({ id: 1, colocada: true });
    expect(pos(e.mesa, 1)).toMatchObject({ x: 0.8, z: -0.4 });
  });

  it('clicar no vazio não pega nada', () => {
    const e = new EditorDaMesa(duas(), [1]);
    expect(e.pegar({ x: 0, z: 0.4 }, 'todas')).toBeNull();
    expect(e.arraste).toBeNull();
    expect(e.soltar()).toBeNull();
  });

  it('a bola pega segura onde estava até a mão mexer', () => {
    const e = new EditorDaMesa(duas(), [1]);
    e.pegar({ x: 0.2, z: 0.1 }, 'todas');
    expect(e.arraste).toMatchObject({ valido: true, atual: { x: 0.2, z: 0.1 } });
  });

  it('tira a bola para a bandeja e a devolve; a branca nunca sai', () => {
    const { mesa, casa } = treino();
    const e = new EditorDaMesa(mesa, casa);
    expect(e.tirar(ID_BOLAO)).toBe(false);
    expect(e.tirar(7)).toBe(true);
    expect(e.bandeja).toEqual([7]);
    expect(numeradasNaMesa(e.mesa)).not.toContain(7);
    expect(e.devolver(7)).toBe(true);
    expect(e.bandeja).toEqual([]);
    expect(e.devolver(7)).toBe(false);
    expect(e.devolver(99)).toBe(false);
  });

  it('tirar pela bola sob o mouse', () => {
    const e = new EditorDaMesa(duas(), [1]);
    expect(e.tirarSob({ x: 0.2, z: 0.1 })).toBe(1);
    expect(e.tirarSob({ x: 0.2, z: 0.1 })).toBeNull();
    expect(e.bandeja).toEqual([1]);
  });

  it('a bola devolvida entra num lugar livre mesmo com o meio ocupado', () => {
    const { mesa, casa } = treino();
    const e = new EditorDaMesa(mesa, casa);
    e.tirar(1);
    e.devolver(1, { x: -0.5, z: 0 });
    const b = e.mesa.bolas.find((x) => x.id === 1)!;
    expect(b.naMesa).toBe(true);
    for (const o of e.mesa.bolas) if (o.id !== 1 && o.naMesa) expect(Math.hypot(o.posicao.x - b.posicao.x, o.posicao.z - b.posicao.z)).toBeGreaterThan(2 * raio - 1e-6);
  });

  it('cancelar larga a bola de volta e tirar a bola da mão a larga também', () => {
    const e = new EditorDaMesa(duas(), [1]);
    e.pegar({ x: 0.2, z: 0.1 }, 'todas');
    e.mover({ x: 0.8, z: 0.4 });
    e.cancelar();
    expect(e.arraste).toBeNull();
    expect(pos(e.mesa, 1)).toMatchObject({ x: 0.2, z: 0.1 });
    e.pegar({ x: 0.2, z: 0.1 }, 'todas');
    e.tirar(1);
    expect(e.arraste).toBeNull();
  });
});

describe('ao sair: sincronizarMesa', () => {
  it('as regras ficam com as bolas que ficaram na mesa', () => {
    const { partida, mesa, casa } = treino();
    const e = new EditorDaMesa(mesa, casa);
    e.tirar(2);
    e.tirar(15);
    const depois = sincronizarMesa(partida, numeradasNaMesa(e.mesa));
    expect(depois.naMesa).not.toContain(2);
    expect(depois.naMesa).not.toContain(15);
    expect(depois.naMesa).toHaveLength(13);
    e.devolver(2);
    expect(sincronizarMesa(depois, numeradasNaMesa(e.mesa)).naMesa).toContain(2);
  });
});
