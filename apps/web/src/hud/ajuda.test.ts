import { describe, expect, it } from 'vitest';
import { LINHAS_DE_AJUDA, TEXTO_DA_TACADA } from './ajuda';

describe('linhas da ajuda', () => {
  it('documenta a tecla B (mostrar de novo as bolas da vez, segurando)', () => {
    const linha = LINHAS_DE_AJUDA.find((l) => l.teclas.includes('B'));
    expect(linha?.texto).toMatch(/bolas da vez/i);
    expect(linha?.texto).toMatch(/segure/i);
  });

  it('o botão esquerdo explica a linha de força (o padrão) e, na outra regra, o empurrar', () => {
    const linha = LINHAS_DE_AJUDA.find((l) => l.teclas.includes('Botão esq.'));
    expect(linha?.texto).toBe(TEXTO_DA_TACADA.linha);
    expect(TEXTO_DA_TACADA.linha).toMatch(/solte/i);
    expect(TEXTO_DA_TACADA.empurrar).toMatch(/empurre/i);
  });

  it('G diz que segurar encadeia as passadas', () => {
    expect(LINHAS_DE_AJUDA.find((l) => l.teclas.includes('G'))?.texto).toMatch(/segure/i);
  });

  it('documenta as teclas 1 a 8 como emoji, só online', () => {
    const linha = LINHAS_DE_AJUDA.find((l) => l.teclas.includes('1 a 8'));
    expect(linha?.texto).toMatch(/emoji/i);
    expect(linha?.texto).toMatch(/online/i);
  });

  it('a linha dos emojis diz onde escolher os oito (C ou o ✎)', () => {
    const texto = LINHAS_DE_AJUDA.find((l) => l.teclas.includes('1 a 8'))?.texto ?? '';
    expect(texto).toMatch(/escolhe/i);
    expect(texto).toContain('C');
    expect(texto).toContain('✎');
  });

  it('nenhuma tecla aparece duas vezes', () => {
    const teclas = LINHAS_DE_AJUDA.flatMap((l) => l.teclas);
    expect(new Set(teclas).size).toBe(teclas.length);
  });
});
