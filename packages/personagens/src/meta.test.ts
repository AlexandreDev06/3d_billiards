import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lerMeta } from './meta';

const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../arte/personagens/exportados');
const arquivo = JSON.parse(readFileSync(resolve(PASTA, 'mao-meta.json'), 'utf8')) as unknown;

describe('lerMeta (mao-meta.json do artista)', () => {
  const meta = lerMeta(arquivo);

  it('lê os gestos pelo nome sem o prefixo, com os tempos em segundos', () => {
    expect([...meta.gestos.keys()].sort()).toEqual(['joinha', 'mole', 'palmas', 'quase', 'respirar', 'soco_ar', 'tamborilar', 'tapinha']);
    const joinha = meta.gestos.get('joinha')!;
    expect(joinha.duracaoS).toBeCloseTo(1.233, 3);
    expect(joinha.aditivo).toBe(false);
    expect(joinha.picosS).toEqual([]);
  });

  it('o pico e os picos viram segundos (quadro / fps)', () => {
    const soco = meta.gestos.get('soco_ar')!;
    expect(soco.picoS).toBeCloseTo(13 / 30, 6);
    const palmas = meta.gestos.get('palmas')!;
    expect(palmas.picosS.map((s) => Math.round(s * 30))).toEqual([8, 16, 24]);
    expect(palmas.cicloS![0]).toBeCloseTo(4 / 30, 6);
    expect(palmas.cicloS![1]).toBeCloseTo(12 / 30, 6);
  });

  it('o respirar é aditivo e em ciclo, o tamborilar só em ciclo, e o mole termina pendurado', () => {
    expect(meta.gestos.get('respirar')!.aditivo).toBe(true);
    expect(meta.gestos.get('respirar')!.cicloS).toBeDefined();
    expect(meta.gestos.get('tamborilar')!.aditivo).toBe(false);
    expect(meta.gestos.get('tamborilar')!.cicloS![0]).toBe(0);
    expect(meta.gestos.get('tamborilar')!.comecaEm).toBe('pose_punho');
    expect(meta.gestos.get('mole')!.terminaPendurado).toBe(true);
    expect(meta.gestos.get('quase')!.terminaPendurado).toBe(false);
  });

  it('as poses não entram nos gestos', () => {
    expect(meta.gestos.has('pose_punho')).toBe(false);
    expect(meta.gestos.has('punho')).toBe(false);
  });

  it('lança dizendo qual campo está errado', () => {
    expect(() => lerMeta(null)).toThrow(/objeto/);
    expect(() => lerMeta({ acoes: { gesto_x: { quadros: 10, fps: 30, tipo: 'gesto', pico: 'a' } } })).toThrow(/gesto_x\.pico/);
    expect(() => lerMeta({ acoes: { gesto_x: { quadros: 10, fps: 30, tipo: 'gesto', ciclo: [4] } } })).toThrow(/gesto_x\.ciclo/);
  });
});
