import { describe, expect, it } from 'vitest';
import { REGRAS_GIZ_PADRAO, sanearRegrasGiz } from './regras-giz';

describe('RegrasGiz', () => {
  it('o padrão é o pedido: desgaste de 10 a 30% por tacada, passada de 10% em 3 s', () => {
    expect(REGRAS_GIZ_PADRAO).toEqual({ desgasteMin: 0.1, desgasteMax: 0.3, passada: 0.1, passadaS: 3 });
  });

  it('sanear sem nada devolve o padrão; o que faltar vem dele', () => {
    expect(sanearRegrasGiz(null)).toEqual(REGRAS_GIZ_PADRAO);
    expect(sanearRegrasGiz({})).toEqual(REGRAS_GIZ_PADRAO);
    expect(sanearRegrasGiz({ passadaS: 5 })).toEqual({ ...REGRAS_GIZ_PADRAO, passadaS: 5 });
  });

  it('corta cada número na faixa e ignora o que não é número', () => {
    const r = sanearRegrasGiz({ desgasteMin: -3, desgasteMax: 9, passada: 0, passadaS: 1000 });
    expect(r.desgasteMin).toBe(0);
    expect(r.desgasteMax).toBe(1);
    expect(r.passada).toBe(0.01);
    expect(r.passadaS).toBe(30);
    const lixo = sanearRegrasGiz({ desgasteMin: 'x', desgasteMax: NaN, passada: Infinity, passadaS: undefined });
    expect(lixo).toEqual(REGRAS_GIZ_PADRAO);
  });

  it('mínimo maior que o máximo: os dois trocam de lugar (o sorteio sempre tem intervalo)', () => {
    const r = sanearRegrasGiz({ desgasteMin: 0.4, desgasteMax: 0.2 });
    expect(r.desgasteMin).toBe(0.2);
    expect(r.desgasteMax).toBe(0.4);
  });
});
