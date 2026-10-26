import { describe, expect, it } from 'vitest';
import { devAtivo } from './ativo';

describe('devAtivo', () => {
  it('em desenvolvimento (Vite dev) está ligado', () => {
    expect(devAtivo(true, '')).toBe(true);
  });

  it('em produção só liga com ?dev=1', () => {
    expect(devAtivo(false, '')).toBe(false);
    expect(devAtivo(false, '?dev=1')).toBe(true);
    expect(devAtivo(false, '?semente=3&dev=1')).toBe(true);
  });

  it('qualquer outro valor de dev não liga', () => {
    expect(devAtivo(false, '?dev=0')).toBe(false);
    expect(devAtivo(false, '?dev=true')).toBe(false);
    expect(devAtivo(false, '?dev=')).toBe(false);
    expect(devAtivo(false, '?devx=1')).toBe(false);
  });
});
