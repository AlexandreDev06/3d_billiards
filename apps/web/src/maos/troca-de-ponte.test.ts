import { describe, expect, it } from 'vitest';
import { quadroVazio } from '@sinuca/personagens';
import { CONFIG_WEB } from '../config';
import { PONTES } from './pontes';
import { poseVaziaDeMao } from './pose-das-maos';
import { afastarQuadro, TrocaDePonte } from './troca-de-ponte';

const cfg = CONFIG_WEB.maos.escolha.troca;

describe('TrocaDePonte: a mão sai, abre, troca de lugar e fecha', () => {
  it('nasce sem troca: o progresso é 1, pousada, sem afastamento', () => {
    const t = new TrocaDePonte(cfg);
    expect(t.ativa).toBe(false);
    expect(t.progresso).toBe(1);
    expect(t.viagem).toBe(1);
    expect(t.abertura).toBe(0);
    expect([...t.afastaPara]).toEqual([0, 0, 0]);
  });

  it('começa na ponte de saída (fechada, sem afastar) e acaba na de chegada (fechada, sem afastar)', () => {
    const t = new TrocaDePonte(cfg);
    t.iniciar('laco', 'colada', poseVaziaDeMao(), cfg.duracaoS);
    expect(t.ativa).toBe(true);
    expect(t.fase).toBe('saida');
    expect(t.abertura).toBe(0);
    expect(t.viagem).toBe(0);
    expect([...t.afastaDe]).toEqual([0, 0, 0]);
    t.atualizar(cfg.duracaoS);
    expect(t.ativa).toBe(false);
    expect(t.fase).toBe('chegada');
    expect(t.abertura).toBe(0);
    expect(t.viagem).toBe(1);
    expect([...t.afastaPara]).toEqual([0, 0, 0]);
  });

  it('passa pela pose aberta no meio, afastada do fim da rota de cada ponte, e a viagem só anda aí', () => {
    const t = new TrocaDePonte(cfg);
    t.iniciar('laco', 'canto', poseVaziaDeMao(), cfg.duracaoS);
    t.atualizar(cfg.duracaoS * 0.5);
    expect(t.fase).toBe('viagem');
    expect(t.abertura).toBe(1);
    expect(t.viagem).toBeCloseTo(0.5, 6);
    const fimLaco = cfg.rotas.laco[cfg.rotas.laco.length - 1]!;
    const fimCanto = cfg.rotas.canto[cfg.rotas.canto.length - 1]!;
    expect([...t.afastaDe]).toEqual([fimLaco[1], fimLaco[2], fimLaco[3]]);
    expect([...t.afastaPara]).toEqual([fimCanto[1], fimCanto[2], fimCanto[3]]);
  });

  it('o afastamento da saída e da chegada anda sem saltos de quadro (o salto da pele é medido em troca-varrida.test.ts)', () => {
    for (const de of PONTES) {
      for (const para of PONTES) {
        if (de === para) continue;
        const t = new TrocaDePonte(cfg);
        t.iniciar(de, para, poseVaziaDeMao(), cfg.duracaoS);
        let ant = [...t.afastaDe, ...t.afastaPara];
        while (t.ativa) {
          t.atualizar(1 / 60);
          const agora = [...t.afastaDe, ...t.afastaPara];
          agora.forEach((v, i) => expect(Math.abs(v - ant[i]!)).toBeLessThan(0.07));
          ant = agora;
        }
      }
    }
  });

  it('toda rota começa na pose de repouso da ponte e termina aberta', () => {
    for (const ponte of PONTES) {
      const rota = cfg.rotas[ponte];
      expect([...rota[0]!]).toEqual([0, 0, 0, 0]);
      expect(rota[rota.length - 1]![0]).toBe(1);
    }
    expect(cfg.duracaoS).toBeLessThanOrEqual(0.25);
    expect(cfg.saidaAte).toBeLessThan(cfg.chegadaDe);
  });

  it('guarda as pontes de onde saiu e para onde vai, e uma cópia da pose (mexer na original depois não muda a saída)', () => {
    const t = new TrocaDePonte(cfg);
    const pose = { ...poseVaziaDeMao(), x: 1, y: 2, z: 3 };
    t.iniciar('laco', 'v', pose, 0.25);
    pose.x = 99;
    expect(t.de).toBe('laco');
    expect(t.para).toBe('v');
    expect(t.pose).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('duração 0 não deixa troca nenhuma; cancelar larga a troca em curso', () => {
    const t = new TrocaDePonte(cfg);
    t.iniciar('v', 'laco', poseVaziaDeMao(), 0);
    expect(t.ativa).toBe(false);
    t.iniciar('v', 'laco', poseVaziaDeMao(), 1);
    t.atualizar(0.2);
    t.cancelar();
    expect(t.ativa).toBe(false);
    expect(t.progresso).toBe(1);
  });

  it('dt negativo não anda para trás e um dt enorme termina sem passar de 1', () => {
    const t = new TrocaDePonte(cfg);
    t.iniciar('v', 'laco', poseVaziaDeMao(), 0.5);
    t.atualizar(0.2);
    const p = t.progresso;
    t.atualizar(-1);
    expect(t.progresso).toBe(p);
    t.atualizar(100);
    expect(t.progresso).toBe(1);
  });

  it('sem a config só a viagem anda (suavizada) e nada se afasta', () => {
    const t = new TrocaDePonte();
    t.iniciar('v', 'laco', poseVaziaDeMao(), 1);
    t.atualizar(0.5);
    expect(t.viagem).toBeCloseTo(0.5, 9);
    expect(t.abertura).toBe(0);
  });
});

describe('afastarQuadro', () => {
  it('lado é -w (w = d × u), subida é u e recuo é -d; escala 0 não mexe', () => {
    const pose = { ...poseVaziaDeMao(), dx: 1, dy: 0, dz: 0, ux: 0, uy: 1, uz: 0 };
    // w = d × u = (0, 0, 1)
    const q = afastarQuadro(quadroVazio(), pose, [0.1, 0.02, 0.03], 1);
    expect(q.px).toBeCloseTo(-0.03, 9);
    expect(q.py).toBeCloseTo(0.02, 9);
    expect(q.pz).toBeCloseTo(-0.1, 9);
    const parado = afastarQuadro(quadroVazio(), pose, [0.1, 0.02, 0.03], 0);
    expect([parado.px, parado.py, parado.pz]).toEqual([0, 0, 0]);
  });
});
