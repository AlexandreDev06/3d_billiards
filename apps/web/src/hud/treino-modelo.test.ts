import { describe, expect, it } from 'vitest';
import { dicaDoModo, hudDoTreino, textoDasBolas, textoDasTacadas, type EntradaDoHudTreino } from './treino-modelo';

const base: EntradaDoHudTreino = { bolasNaMesa: 15, tacadas: 0, modo: 'mirar', cenario: null, mesaLimpa: false, podeRefazer: false, bandeja: [] };

describe('textos do HUD do treino', () => {
  it('conta as bolas que restam', () => {
    expect(textoDasBolas(15)).toBe('15 bolas na mesa');
    expect(textoDasBolas(1)).toBe('1 bola na mesa');
    expect(textoDasBolas(0)).toBe('Mesa limpa');
  });

  it('conta as tacadas dadas', () => {
    expect(textoDasTacadas(0)).toBe('Nenhuma tacada');
    expect(textoDasTacadas(1)).toBe('1 tacada');
    expect(textoDasTacadas(12)).toBe('12 tacadas');
  });

  it('mirando não há dica; a bola na mão e o arrumar dizem como sair', () => {
    expect(dicaDoModo('mirar', false, 3)).toBeNull();
    expect(dicaDoModo('branca', false, 3)).toMatch(/Bola na mão.*P ou Esc/);
    expect(dicaDoModo('arrumar', false, 3)).toMatch(/Arrumando a mesa.*X tira.*E ou Esc/);
  });

  it('mesa limpa diz em quantas tacadas e o que fazer a seguir', () => {
    expect(dicaDoModo('mirar', true, 1)).toBe('Mesa limpa em 1 tacada! N arruma de novo, R refaz a última tacada.');
    expect(dicaDoModo('mirar', true, 9)).toMatch(/em 9 tacadas/);
  });

  it('o modo da mão manda mais que a mesa limpa (dá para arrumar de novo)', () => {
    expect(dicaDoModo('arrumar', true, 9)).toMatch(/Arrumando/);
  });
});

describe('hudDoTreino', () => {
  it('mostra o estado do começo: 15 bolas, nenhuma tacada, sem placar de adversário', () => {
    const h = hudDoTreino(base);
    expect(h).toMatchObject({ bolas: '15 bolas na mesa', tacadas: 'Nenhuma tacada', dica: null, refazerAtivo: false, mostrarBandeja: false });
    expect(JSON.stringify(h)).not.toMatch(/adversário|Jogador 2/);
  });

  it('a bandeja só aparece arrumando a mesa', () => {
    expect(hudDoTreino({ ...base, bandeja: [3, 9], modo: 'mirar' }).mostrarBandeja).toBe(false);
    expect(hudDoTreino({ ...base, bandeja: [3, 9], modo: 'arrumar' })).toMatchObject({ mostrarBandeja: true, bandeja: [3, 9] });
  });

  it('leva o cenário armado e se dá para refazer', () => {
    const h = hudDoTreino({ ...base, cenario: { nome: 'Tabelada', descricao: 'Mate uma bola de tabelada.' }, podeRefazer: true });
    expect(h.cenario?.nome).toBe('Tabelada');
    expect(h.refazerAtivo).toBe(true);
  });
});
