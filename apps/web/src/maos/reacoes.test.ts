import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { metaDoArtista } from './para-testes';
import { MOMENTO_DO_ROSTO, ReacoesDaJogada } from './reacoes';

const cfg = CONFIG_WEB.maos.reacoes;
const meta = metaDoArtista();

/** Um sorteio que devolve a sequência dada, em círculo. */
const sorteio = (...valores: number[]): (() => number) => {
  let i = 0;
  return () => valores[i++ % valores.length]!;
};

describe('ReacoesDaJogada: a reação certa para cada momento', () => {
  it('uma bola numerada que cai: o joinha ou o soco no ar, na mão da ponte só', () => {
    const joinha = new ReacoesDaJogada(cfg, meta, sorteio(0.1));
    expect(joinha.ouvir('caiu', 0)).toBe(true);
    expect(joinha.atual?.gesto).toBe('joinha');
    expect(joinha.atual?.ambas).toBe(false);
    const soco = new ReacoesDaJogada(cfg, meta, sorteio(0.9));
    soco.ouvir('caiu', 0);
    expect(soco.atual?.gesto).toBe('soco_ar');
  });

  it('nunca repete a mesma de seguida, qualquer que seja o sorteio', () => {
    const r = new ReacoesDaJogada(cfg, meta, sorteio(0.1));
    const vistas: string[] = [];
    for (let i = 0; i < 6; i++) {
      r.ouvir('caiu', i * 5);
      vistas.push(r.atual!.gesto);
      r.atualizar(i * 5 + 4);
    }
    for (let i = 1; i < vistas.length; i++) expect(vistas[i]).not.toBe(vistas[i - 1]);
    expect(new Set(vistas)).toEqual(new Set(['joinha', 'soco_ar']));
  });

  it('falta: o tapinha; bola que passou raspando: as duas mãos abrem', () => {
    const f = new ReacoesDaJogada(cfg, meta, sorteio(0.5));
    f.ouvir('falta', 0);
    expect(f.atual?.gesto).toBe('tapinha');
    const q = new ReacoesDaJogada(cfg, meta, sorteio(0.5));
    q.ouvir('quase', 0);
    expect(q.atual?.gesto).toBe('quase');
    expect(q.atual?.ambas).toBe(true);
  });

  it('cada uma dura o do arquivo, no máximo `duracaoMaximaS`', () => {
    for (const [momento, gesto] of [['caiu', 'joinha'], ['falta', 'tapinha'], ['quase', 'quase']] as const) {
      const r = new ReacoesDaJogada(cfg, meta, sorteio(0.1));
      r.ouvir(momento, 0);
      const real = meta.gestos.get(gesto)!.duracaoS;
      expect(r.atual?.duracaoS).toBeCloseTo(Math.min(real, cfg.duracaoMaximaS), 9);
      expect(r.atual!.duracaoS).toBeLessThanOrEqual(cfg.duracaoMaximaS);
    }
  });

  it('o ápice do gesto vem do arquivo (para o som), em s desde o começo', () => {
    const r = new ReacoesDaJogada(cfg, meta, sorteio(0.9));
    r.ouvir('caiu', 0);
    expect(r.atual?.picoS).toBeCloseTo(13 / 30, 6);
  });

  it('sem as notas do artista dura `duracaoMaximaS`', () => {
    const r = new ReacoesDaJogada(cfg, null, sorteio(0.1));
    r.ouvir('falta', 0);
    expect(r.atual?.duracaoS).toBe(cfg.duracaoMaximaS);
  });
});

describe('ReacoesDaJogada: o tempo e as prioridades', () => {
  it('acaba sozinha no fim da duração', () => {
    const r = new ReacoesDaJogada(cfg, meta, sorteio(0.1));
    r.ouvir('caiu', 10);
    r.atualizar(10.5);
    expect(r.atual).not.toBeNull();
    r.atualizar(10 + r.atual!.duracaoS + 0.01);
    expect(r.atual).toBeNull();
  });

  it('a falta ganha da bola que caiu e esta da raspada; a de menos valor não interrompe a de mais', () => {
    const r = new ReacoesDaJogada(cfg, meta, sorteio(0.1));
    r.ouvir('quase', 0);
    expect(r.ouvir('caiu', 0.2)).toBe(true);
    expect(r.atual?.gesto).toBe('joinha');
    expect(r.ouvir('quase', 0.3)).toBe(false);
    expect(r.atual?.gesto).toBe('joinha');
    expect(r.ouvir('falta', 0.4)).toBe(true);
    expect(r.atual?.gesto).toBe('tapinha');
    expect(r.ouvir('caiu', 0.5)).toBe(false);
    expect(r.atual?.gesto).toBe('tapinha');
  });

  it('com a anterior já acabada qualquer momento começa', () => {
    const r = new ReacoesDaJogada(cfg, meta, sorteio(0.1));
    r.ouvir('falta', 0);
    r.atualizar(5);
    expect(r.ouvir('quase', 5)).toBe(true);
    expect(r.atual?.gesto).toBe('quase');
  });

  it('cancelar a faz sumir já (a próxima mira começou)', () => {
    const r = new ReacoesDaJogada(cfg, meta, sorteio(0.1));
    r.ouvir('caiu', 0);
    r.cancelar();
    expect(r.atual).toBeNull();
  });

  it('a falta que a regra acusa depois da gravação não bate duas vezes na mesma jogada', () => {
    const r = new ReacoesDaJogada(cfg, meta, sorteio(0.1));
    r.comecarJogada();
    expect(r.ouvir('falta', 1)).toBe(true);
    r.atualizar(4);
    expect(r.ouvir('falta', 4)).toBe(false);
    expect(r.atual).toBeNull();
    r.comecarJogada();
    expect(r.ouvir('falta', 10)).toBe(true);
  });

  it('não aloca: a reação em curso é sempre o mesmo objeto', () => {
    const r = new ReacoesDaJogada(cfg, meta, sorteio(0.1));
    r.ouvir('caiu', 0);
    const a = r.atual;
    r.atualizar(5);
    r.ouvir('falta', 5.1);
    expect(r.atual).toBe(a);
  });
});

describe('MOMENTO_DO_ROSTO: o que cada rosto do balão é para as mãos', () => {
  it('o sorriso é a bola que caiu, o bravo a falta (a branca caiu) e o susto a raspada', () => {
    expect(MOMENTO_DO_ROSTO).toEqual({ sorriso: 'caiu', bravo: 'falta', susto: 'quase' });
  });
});
