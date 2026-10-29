import { describe, expect, it } from 'vitest';
import { Cinematica, type Corrente } from './cinematica';
import { poseDeRepouso } from './ficha';
import { quaternioDoEixo } from './quaternios';
import { fichaDeBrinquedo } from './para-testes';
import { pontoVazio } from './tipos';
import { TEMPO_DO_PERFILADOR_MS, provarSemAlocar } from './alocacao-para-testes';

/** A dobra positiva leva a ponta para -z (fecha o dedo de brinquedo): o eixo é -x. */
const DEDO: Corrente = { nome: 'dedo', ossos: [2, 3, 4], eixoDeDobra: [-1, 0, 0], ponta: [0, 0.03, 0], raioDaPonta: 0.01, partes: [1 / 3, 1 / 3, 1 / 3] };

describe('Cinematica', () => {
  it('em repouso, cada osso fica onde as posições locais somadas dizem', () => {
    const f = fichaDeBrinquedo();
    const c = new Cinematica(f).calcular(poseDeRepouso(f));
    expect(c.posicao[13]).toBeCloseTo(0.15, 9);
    const ponta = c.ponto(4, 0, 0.03, 0, pontoVazio());
    expect(ponta.y).toBeCloseTo(0.18);
  });

  it('a pose dobrada leva a ponta para baixo de z e mais perto da palma', () => {
    const f = fichaDeBrinquedo();
    const c = new Cinematica(f).calcular(f.poses.get('garra')!);
    const ponta = c.ponto(4, 0, 0.03, 0, pontoVazio());
    expect(ponta.z).toBeLessThan(-0.02);
    expect(ponta.y).toBeLessThan(0.18);
    expect(Math.hypot(ponta.y - 0.09, ponta.z)).toBeLessThan(0.1);
  });

  it('a ponta da corrente sem dobra a mais é a mesma que a conta inteira dá, e com dobra é a da pose dobrada à mão', () => {
    const f = fichaDeBrinquedo();
    const pose = poseDeRepouso(f);
    const c = new Cinematica(f).calcular(pose);
    const direto = c.ponto(4, 0, 0.03, 0, pontoVazio());
    const daCorrente = c.pontaDaCorrente(DEDO, 0, pontoVazio());
    expect(daCorrente.x).toBeCloseTo(direto.x, 9);
    expect(daCorrente.y).toBeCloseTo(direto.y, 9);
    expect(daCorrente.z).toBeCloseTo(direto.z, 9);

    // 60° a mais, em partes iguais: cada osso dobra 20° a mais em torno de x
    const dobrada = poseDeRepouso(f);
    for (const i of [2, 3, 4]) quaternioDoEixo(-1, 0, 0, Math.PI / 9, dobrada.rotacoes, 4 * i);
    const verdade = new Cinematica(f).calcular(dobrada).ponto(4, 0, 0.03, 0, pontoVazio());
    const conta = c.pontaDaCorrente(DEDO, Math.PI / 3, pontoVazio());
    expect(conta.x).toBeCloseTo(verdade.x, 9);
    expect(conta.y).toBeCloseTo(verdade.y, 9);
    expect(conta.z).toBeCloseTo(verdade.z, 9);
  });

  it('a dobra positiva fecha o dedo: a ponta desce', () => {
    const f = fichaDeBrinquedo();
    const c = new Cinematica(f).calcular(poseDeRepouso(f));
    const reto = c.pontaDaCorrente(DEDO, 0, pontoVazio()).z;
    const fechado = c.pontaDaCorrente(DEDO, 0.5, pontoVazio()).z;
    expect(fechado).toBeLessThan(reto);
  });

  it('não aloca por conta: nenhum objeto novo no código do pacote (perfilador de alocação)', async () => {
    const f = fichaDeBrinquedo();
    const c = new Cinematica(f);
    const saida = pontoVazio();
    c.calcular(f.poses.get('garra')!);
    c.pontaDaCorrente(DEDO, 0.2, saida);
    await provarSemAlocar((i) => {
      c.calcular(f.poses.get('garra')!);
      c.pontaDaCorrente(DEDO, (i % 10) * 0.05, saida);
      c.ponto(4, 0, 0.03, 0, saida);
    });
  }, TEMPO_DO_PERFILADOR_MS);
});
