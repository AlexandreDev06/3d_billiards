import { describe, expect, it } from 'vitest';
import { poseVaziaDeMao } from './pose-das-maos';
import { TrocaDePonte } from './troca-de-ponte';

describe('TrocaDePonte: a mão que levanta, faz um arco e pousa', () => {
  it('nasce sem troca: o progresso é 1, a mistura é 1 e a mão não levanta', () => {
    const t = new TrocaDePonte();
    expect(t.ativa).toBe(false);
    expect(t.progresso).toBe(1);
    expect(t.mistura).toBe(1);
    expect(t.levanta(0.04)).toBe(0);
  });

  it('começa na saída (mistura 0, sem levantar), chega ao arco máximo no meio e pousa no fim', () => {
    const t = new TrocaDePonte();
    t.iniciar('v', poseVaziaDeMao(), 0.25);
    expect(t.ativa).toBe(true);
    expect(t.progresso).toBe(0);
    expect(t.mistura).toBe(0);
    expect(t.levanta(0.04)).toBe(0);
    t.atualizar(0.125);
    expect(t.progresso).toBeCloseTo(0.5, 9);
    expect(t.mistura).toBeCloseTo(0.5, 9);
    expect(t.levanta(0.04)).toBeCloseTo(0.04, 9);
    t.atualizar(0.125);
    expect(t.ativa).toBe(false);
    expect(t.progresso).toBe(1);
    expect(t.mistura).toBe(1);
    expect(t.levanta(0.04)).toBe(0);
  });

  it('o arco sobe e desce (simétrico) e a mistura só cresce', () => {
    const t = new TrocaDePonte();
    t.iniciar('tabela', poseVaziaDeMao(), 1);
    let anteriorMistura = -1;
    const alturas: number[] = [];
    for (let i = 0; i < 10; i++) {
      t.atualizar(0.1);
      expect(t.mistura).toBeGreaterThanOrEqual(anteriorMistura);
      anteriorMistura = t.mistura;
      alturas.push(t.levanta(1));
    }
    expect(alturas[4]!).toBeGreaterThan(0.9);
    expect(alturas[0]!).toBeCloseTo(alturas[8]!, 6);
    expect(alturas[1]!).toBeCloseTo(alturas[7]!, 6);
  });

  it('guarda a ponte de onde saiu e uma cópia da pose (mexer na original depois não muda a saída)', () => {
    const t = new TrocaDePonte();
    const pose = { ...poseVaziaDeMao(), x: 1, y: 2, z: 3 };
    t.iniciar('laco', pose, 0.25);
    pose.x = 99;
    expect(t.de).toBe('laco');
    expect(t.pose).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('duração 0 não deixa troca nenhuma; cancelar larga a troca em curso', () => {
    const t = new TrocaDePonte();
    t.iniciar('v', poseVaziaDeMao(), 0);
    expect(t.ativa).toBe(false);
    t.iniciar('v', poseVaziaDeMao(), 1);
    t.atualizar(0.2);
    t.cancelar();
    expect(t.ativa).toBe(false);
    expect(t.progresso).toBe(1);
  });

  it('dt negativo não anda para trás e um dt enorme termina sem passar de 1', () => {
    const t = new TrocaDePonte();
    t.iniciar('v', poseVaziaDeMao(), 0.5);
    t.atualizar(0.2);
    const p = t.progresso;
    t.atualizar(-1);
    expect(t.progresso).toBe(p);
    t.atualizar(100);
    expect(t.progresso).toBe(1);
  });
});
