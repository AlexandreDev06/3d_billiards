import { describe, expect, it } from 'vitest';
import { Atencao } from './atencao';
import { sorteioDeTeste } from './para-testes';
import { TEMPO_DO_PERFILADOR_MS, provarSemAlocar } from './alocacao-para-testes';


interface Trecho {
  id: number;
  duracao: number;
}

/** Roda a atenção e devolve os trechos em que ela ficou em cada ponto. */
function trechos(a: Atencao, segundos: number, dt = 1 / 60): Trecho[] {
  const lista: Trecho[] = [];
  for (let t = 0; t < segundos; t += dt) {
    a.atualizar(dt);
    const ultimo = lista[lista.length - 1];
    if (ultimo && ultimo.id === a.id) ultimo.duracao += dt;
    else lista.push({ id: a.id, duracao: dt });
  }
  return lista;
}

describe('Atencao', () => {
  it('sem pontos de interesse não tem alvo', () => {
    const a = new Atencao(sorteioDeTeste(1));
    a.atualizar(0.1);
    expect(a.id).toBe(-1);
    expect(a.temAlvo).toBe(false);
  });

  it('com um ponto, olha para ele e acompanha o ponto que se mexe', () => {
    const a = new Atencao(sorteioDeTeste(1));
    a.definir(2, 1, 2, 3, 1);
    a.atualizar(0.1);
    expect(a.id).toBe(2);
    expect([a.x, a.y, a.z]).toEqual([1, 2, 3]);
    a.definir(2, 4, 5, 6, 1);
    a.atualizar(0.1);
    expect([a.x, a.y, a.z]).toEqual([4, 5, 6]);
  });

  it('prefere o de maior prioridade, olha o outro de vez em quando e volta', () => {
    const a = new Atencao(sorteioDeTeste(5));
    a.definir(0, 0, 0, 0, 4);
    a.definir(1, 1, 0, 0, 1);
    const lista = trechos(a, 240);
    const noPrincipal = lista.filter((t) => t.id === 0).reduce((s, t) => s + t.duracao, 0);
    const espiadas = lista.filter((t) => t.id === 1);
    expect(noPrincipal / 240).toBeGreaterThan(0.6);
    expect(espiadas.length).toBeGreaterThan(5);
    // depois de toda espiada vem o principal
    for (let i = 0; i < lista.length - 1; i++) if (lista[i]!.id === 1) expect(lista[i + 1]!.id).toBe(0);
  });

  it('o tempo é natural: fixa por 1 a 5 s e espia por 0,4 a 1,5 s', () => {
    const a = new Atencao(sorteioDeTeste(9));
    a.definir(0, 0, 0, 0, 4);
    a.definir(1, 1, 0, 0, 1);
    const lista = trechos(a, 600);
    for (const t of lista.slice(1, -1)) {
      if (t.id === 1) {
        expect(t.duracao).toBeGreaterThanOrEqual(0.5 - 0.05);
        expect(t.duracao).toBeLessThanOrEqual(1.3 + 0.05);
      }
    }
    const fixacoes = lista.filter((t) => t.id === 0).slice(1, -1);
    expect(Math.max(...fixacoes.map((t) => t.duracao))).toBeGreaterThan(2);
    expect(Math.min(...fixacoes.map((t) => t.duracao))).toBeGreaterThanOrEqual(1.8 - 0.05);
  });

  it('a câmera, de prioridade baixa, é olhada de vez em quando e por pouco tempo', () => {
    const a = new Atencao(sorteioDeTeste(3));
    a.definir(0, 0, 0, 0, 4); // a bola
    a.definir(4, 9, 9, 9, 1); // a câmera
    const lista = trechos(a, 600);
    const camera = lista.filter((t) => t.id === 4);
    const total = camera.reduce((s, t) => s + t.duracao, 0) / 600;
    expect(total).toBeGreaterThan(0.05);
    expect(total).toBeLessThan(0.4);
    expect(Math.max(...camera.map((t) => t.duracao))).toBeLessThan(1.5);
  });

  it('um ponto muito mais importante que o de agora interrompe já', () => {
    const a = new Atencao(sorteioDeTeste(2));
    a.definir(0, 0, 0, 0, 2);
    a.atualizar(0.1);
    a.definir(3, 5, 5, 5, 3);
    a.atualizar(0.016);
    expect(a.id).toBe(0); // 3 contra 2: não é o dobro
    a.definir(3, 5, 5, 5, 6);
    a.atualizar(0.016);
    expect(a.id).toBe(3);
  });

  it('a bola que começa a rolar interrompe até uma olhada na câmera', () => {
    const a = new Atencao(sorteioDeTeste(3));
    a.definir(0, 0, 0, 0, 4);
    a.definir(4, 9, 9, 9, 1);
    let t = 0;
    while (a.id !== 4 && t < 120) {
      a.atualizar(1 / 60);
      t += 1 / 60;
    }
    expect(a.id).toBe(4);
    a.definir(0, 0, 0, 0, 10);
    a.atualizar(1 / 60);
    expect(a.id).toBe(0);
    expect(a.espiando).toBe(false);
  });

  it('tirar o ponto de agora passa para outro na hora; sem nenhum, fica sem alvo', () => {
    const a = new Atencao(sorteioDeTeste(2));
    a.definir(0, 0, 0, 0, 2);
    a.definir(1, 1, 1, 1, 1);
    a.atualizar(0.1);
    expect(a.id).toBe(0);
    a.remover(0);
    a.atualizar(0.016);
    expect(a.id).toBe(1);
    a.remover(1);
    a.atualizar(0.016);
    expect(a.temAlvo).toBe(false);
    a.definir(1, 1, 1, 1, 1);
    a.limpar();
    a.atualizar(0.016);
    expect(a.id).toBe(-1);
  });

  it('prioridade zero ou negativa não é ponto de interesse', () => {
    const a = new Atencao(sorteioDeTeste(2));
    a.definir(0, 0, 0, 0, 0);
    a.definir(1, 1, 1, 1, -3);
    a.atualizar(0.1);
    expect(a.id).toBe(-1);
  });

  it('o mesmo sorteio escolhe igual; outro sorteio, diferente', () => {
    const rodada = (semente: number): number[] => {
      const a = new Atencao(sorteioDeTeste(semente));
      a.definir(0, 0, 0, 0, 3);
      a.definir(1, 1, 0, 0, 2);
      a.definir(2, 2, 0, 0, 1);
      return trechos(a, 120).map((t) => t.id);
    };
    expect(rodada(4)).toEqual(rodada(4));
    expect(rodada(4)).not.toEqual(rodada(5));
  });

  it('id fora da capacidade lança', () => {
    const a = new Atencao(sorteioDeTeste(1), 3);
    expect(() => a.definir(3, 0, 0, 0, 1)).toThrow();
    expect(() => a.definir(-1, 0, 0, 0, 1)).toThrow();
  });

  it('temPontos diz se há algum ponto dado, antes mesmo de a atenção escolher', () => {
    const a = new Atencao(sorteioDeTeste(1));
    expect(a.temPontos).toBe(false);
    a.definir(2, 1, 0, 0, 3);
    expect(a.temPontos).toBe(true);
    expect(a.temAlvo).toBe(false);
    a.atualizar(0.01);
    expect(a.temAlvo).toBe(true);
    a.remover(2);
    expect(a.temPontos).toBe(false);
    a.definir(0, 0, 0, 0, 1);
    a.limpar();
    expect(a.temPontos).toBe(false);
  });

  it('não aloca por quadro: nenhum objeto novo no código do pacote (perfilador de alocação)', async () => {
    const a = new Atencao(sorteioDeTeste(7));
    const passo = (i: number): void => {
      a.definir(0, Math.sin(i), 0, 0, 4);
      a.definir(1, 1, 0, 0, 2 + (i % 7));
      a.definir(2, 0, 1, 0, 1);
      if (i % 500 === 0) a.remover(1);
      a.atualizar(1 / 60);
    };
    await provarSemAlocar(passo);
  }, TEMPO_DO_PERFILADOR_MS);
});
