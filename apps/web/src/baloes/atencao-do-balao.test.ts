import { ID_BOLAO, MESA_BAR, cacapas, type EventoTacada, type Gravacao } from '@sinuca/fisica';
import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { CacapasDaGravacao, INTERESSE, QUANTOS_INTERESSES, interessesDoBalao, interessesVazios, type SituacaoDoOlhar } from './atencao-do-balao';

const cfg = CONFIG_WEB.baloes.arquivo.olhar.atencao;
const ponto = (x: number, z: number) => ({ x, y: 0.0286, z });
const situacao = (extra: Partial<SituacaoDoOlhar> = {}): SituacaoDoOlhar => ({
  mirando: false,
  fim: false,
  branca: ponto(-0.5, 0),
  brancaNaMesa: true,
  bolaQueAnda: null,
  cacapa: null,
  mira: null,
  camera: { x: 0, y: 1, z: 2 },
  ...extra,
});
const calcular = (s: SituacaoDoOlhar) => {
  const saida = interessesVazios();
  interessesDoBalao(s, cfg, saida);
  return saida;
};
const prioridades = (s: SituacaoDoOlhar): number[] => calcular(s).map((i) => i.prioridade);

describe('interessesDoBalao: no que o balão presta atenção', () => {
  it('um interesse por vaga, todos zerados quando nada pede', () => {
    expect(interessesVazios()).toHaveLength(QUANTOS_INTERESSES);
    expect(interessesVazios().every((i) => i.prioridade === 0)).toBe(true);
  });

  it('o outro mirando: a branca e o ponto da mira, e a câmera só de vez em quando (prioridade bem menor)', () => {
    const i = calcular(situacao({ mirando: true, mira: ponto(0.3, 0.1) }));
    expect(i[INTERESSE.branca]!.prioridade).toBeGreaterThan(i[INTERESSE.mira]!.prioridade);
    expect(i[INTERESSE.mira]!.prioridade).toBeGreaterThan(3 * i[INTERESSE.camera]!.prioridade);
    expect(i[INTERESSE.mira]).toMatchObject({ x: 0.3, z: 0.1 });
    expect(i[INTERESSE.branca]).toMatchObject({ x: -0.5, z: 0 });
    expect(i[INTERESSE.bolaQueAnda]!.prioridade).toBe(0);
    expect(i[INTERESSE.cacapa]!.prioridade).toBe(0);
  });

  it('sem ponto de mira, só a branca (e a câmera)', () => {
    const i = calcular(situacao({ mirando: true }));
    expect(i[INTERESSE.mira]!.prioridade).toBe(0);
    expect(i[INTERESSE.branca]!.prioridade).toBeGreaterThan(0);
  });

  it('com uma bola andando ela passa à frente da branca (e interrompe: pelo menos o fator da atenção)', () => {
    const i = calcular(situacao({ bolaQueAnda: ponto(0.2, 0.2) }));
    expect(i[INTERESSE.bolaQueAnda]!.prioridade).toBeGreaterThan(1.8 * i[INTERESSE.branca]!.prioridade);
    expect(i[INTERESSE.bolaQueAnda]).toMatchObject({ x: 0.2, z: 0.2 });
    expect(i[INTERESSE.mira]!.prioridade).toBe(0);
  });

  it('a caçapa onde a bola vai cair passa à frente de tudo', () => {
    const p = prioridades(situacao({ bolaQueAnda: ponto(0.2, 0.2), cacapa: ponto(0.7, 0.4) }));
    expect(p[INTERESSE.cacapa]).toBeGreaterThan(p[INTERESSE.bolaQueAnda]!);
    expect(p[INTERESSE.cacapa]).toBeGreaterThan(p[INTERESSE.camera]!);
  });

  it('a branca que caiu (fora da mesa) sai da atenção: o balão não segue o bolão que rola para fora; as outras vagas seguem', () => {
    const fora = calcular(situacao({ mirando: true, mira: ponto(0.3, 0.1), brancaNaMesa: false, branca: ponto(0.9, 3) }));
    expect(fora[INTERESSE.branca]!.prioridade).toBe(0);
    expect(fora[INTERESSE.mira]!.prioridade).toBeGreaterThan(0);
    expect(fora[INTERESSE.camera]!.prioridade).toBeGreaterThan(0);
    const dentro = calcular(situacao({ mirando: true, mira: ponto(0.3, 0.1), brancaNaMesa: true }));
    expect(dentro[INTERESSE.branca]!.prioridade).toBeGreaterThan(0);
    expect(calcular(situacao({ bolaQueAnda: ponto(0.2, 0.2), brancaNaMesa: false }))[INTERESSE.bolaQueAnda]!.prioridade).toBeGreaterThan(0);
  });

  it('o fim da partida: só a câmera, o olhar nos olhos de quem vê', () => {
    const i = calcular(situacao({ fim: true, mirando: true, bolaQueAnda: ponto(0, 0), mira: ponto(1, 1) }));
    expect(i.map((x) => x.prioridade).filter((p) => p > 0)).toHaveLength(1);
    expect(i[INTERESSE.camera]!.prioridade).toBeGreaterThan(0);
    expect(i[INTERESSE.camera]).toMatchObject({ x: 0, y: 1, z: 2 });
  });

  it('a câmera sempre tem alguma prioridade, para o balão olhar para quem joga de vez em quando', () => {
    for (const s of [situacao(), situacao({ mirando: true }), situacao({ bolaQueAnda: ponto(0, 0) })]) expect(prioridades(s)[INTERESSE.camera]).toBeGreaterThan(0);
  });

  it('escreve na saída, sem alocar', () => {
    const saida = interessesVazios();
    const s = situacao({ mirando: true });
    const antes = saida.map((i) => i);
    interessesDoBalao(s, cfg, saida);
    expect(saida.every((i, k) => i === antes[k])).toBe(true);
  });
});

const BOCAS = cacapas(MESA_BAR);
function gravacao(eventos: EventoTacada[]): Gravacao {
  return { frequencia: 30, ids: [ID_BOLAO, 5], quadros: 4, duracao: 3, posicoes: new Float32Array(24), orientacoes: new Float32Array(32), naMesa: new Uint8Array(8), eventos };
}

describe('CacapasDaGravacao: a caçapa onde a bola vai cair, vista antes de ela cair', () => {
  const quedas = new CacapasDaGravacao();
  const saida = { x: 0, y: 0, z: 0 };

  it('olha a caçapa a partir de `previsaoS` antes da queda e a segura `seguraS` depois', () => {
    quedas.comecar(gravacao([{ tipo: 'cacapa', t: 2, bola: 5, cacapa: BOCAS[3]!.id }]), MESA_BAR, 0.03);
    expect(quedas.naVista(0.5, 0.9, 0.4, saida)).toBe(false);
    expect(quedas.naVista(1.2, 0.9, 0.4, saida)).toBe(true);
    expect(saida.x).toBeCloseTo(BOCAS[3]!.queda.centro.x, 9);
    expect(saida.z).toBeCloseTo(BOCAS[3]!.queda.centro.z, 9);
    expect(saida.y).toBe(0.03);
    expect(quedas.naVista(2.3, 0.9, 0.4, saida)).toBe(true);
    expect(quedas.naVista(2.5, 0.9, 0.4, saida)).toBe(false);
  });

  it('com duas quedas escolhe a que vem primeiro; sem queda nenhuma, nada', () => {
    quedas.comecar(gravacao([{ tipo: 'cacapa', t: 1.5, bola: 5, cacapa: BOCAS[0]!.id }, { tipo: 'cacapa', t: 1.9, bola: 6, cacapa: BOCAS[1]!.id }]), MESA_BAR, 0.03);
    expect(quedas.naVista(1.2, 0.9, 0.4, saida)).toBe(true);
    expect(saida.x).toBeCloseTo(BOCAS[0]!.queda.centro.x, 9);
    quedas.comecar(gravacao([]), MESA_BAR, 0.03);
    expect(quedas.naVista(1, 0.9, 0.4, saida)).toBe(false);
  });

  it('sem gravação tocando (tempo nulo) não há caçapa em vista', () => {
    quedas.comecar(gravacao([{ tipo: 'cacapa', t: 2, bola: 5, cacapa: BOCAS[0]!.id }]), MESA_BAR, 0.03);
    expect(quedas.naVista(null, 0.9, 0.4, saida)).toBe(false);
  });
});
