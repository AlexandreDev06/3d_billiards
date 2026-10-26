import { describe, expect, it } from 'vitest';
import type { AvisoDeMissao } from '../online/missoes-modelo';
import { PilhaDeAvisosDeMissao } from './avisos-de-missao-modelo';

const CFG = { progressoMs: 3000, cumpridaMs: 5000, maximo: 3 };
const progresso = (id: string): AvisoDeMissao => ({ tipo: 'progresso', id: 'mao-quente', texto: id });
const festa: AvisoDeMissao = { tipo: 'cumprida', id: 'tabelada', texto: 'Missão cumprida! Tabelada +100' };

describe('PilhaDeAvisosDeMissao', () => {
  it('o progresso sai em 3 s e a festa em 5 s', () => {
    const p = new PilhaDeAvisosDeMissao(CFG);
    p.empilhar([progresso('a'), festa], 1000);
    expect(p.atualizar(3999).map((i) => i.texto)).toEqual(['a', festa.texto]);
    expect(p.atualizar(4000).map((i) => i.texto)).toEqual([festa.texto]);
    expect(p.atualizar(6000)).toEqual([]);
  });

  it('o teto tira o mais velho', () => {
    const p = new PilhaDeAvisosDeMissao(CFG);
    p.empilhar([progresso('a'), progresso('b')], 0);
    p.empilhar([progresso('c'), progresso('d')], 100);
    expect(p.atualizar(200).map((i) => i.texto)).toEqual(['b', 'c', 'd']);
  });

  it('limpar esvazia', () => {
    const p = new PilhaDeAvisosDeMissao(CFG);
    p.empilhar([festa], 0);
    p.limpar();
    expect(p.atualizar(1)).toEqual([]);
  });
});
