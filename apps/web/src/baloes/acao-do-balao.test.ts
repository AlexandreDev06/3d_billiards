import { describe, expect, it } from 'vitest';
import { NOME_DA_ACAO, NOME_DA_CARA, pedidoDoBalao } from './acao-do-balao';
import { CARAS_DO_BALAO } from './rosto';

describe('pedidoDoBalao (o que o corpo e a cara do arquivo do artista fazem em cada momento)', () => {
  it('parado e sem nada acontecendo: a parada, de cara neutra', () => {
    expect(pedidoDoBalao('neutro', false, null)).toEqual({ acao: 'parado', repetir: false, cara: 'neutro' });
  });

  it('o outro mirando: inclina, repetindo o trecho do meta enquanto a mira durar', () => {
    expect(pedidoDoBalao('neutro', true, null)).toEqual({ acao: 'inclinar', repetir: true, cara: 'neutro' });
  });

  it('encaçapou: pulinho com cara de sorriso, uma vez (mesmo mirando de novo)', () => {
    expect(pedidoDoBalao('sorriso', false, null)).toEqual({ acao: 'pulinho', repetir: false, cara: 'sorriso' });
    expect(pedidoDoBalao('sorriso', true, null).acao).toBe('pulinho');
  });

  it('raspou a caçapa ou faltou: susto com cara de susto (o bravo de hoje vira susto)', () => {
    expect(pedidoDoBalao('susto', false, null)).toEqual({ acao: 'susto', repetir: false, cara: 'susto' });
    expect(pedidoDoBalao('bravo', false, null)).toEqual({ acao: 'susto', repetir: false, cara: 'susto' });
  });

  it('no fim, quem ganhou estufa e quem perdeu murcha, repetindo o trecho do meta', () => {
    expect(pedidoDoBalao('sorriso', false, 'ganhou')).toEqual({ acao: 'estufar', repetir: true, cara: 'sorriso' });
    expect(pedidoDoBalao('triste', false, 'perdeu')).toEqual({ acao: 'murchar', repetir: true, cara: 'triste' });
    // antes da virada a cara é neutra, e o corpo já faz a ação
    expect(pedidoDoBalao('neutro', false, 'ganhou').acao).toBe('estufar');
  });

  it('a mira não atrapalha o fim', () => {
    expect(pedidoDoBalao('neutro', true, 'perdeu').acao).toBe('murchar');
  });

  it('toda ação e toda cara do jogo têm o nome que o arquivo do artista usa', () => {
    expect(NOME_DA_ACAO).toEqual({ parado: 'balao_parado', inclinar: 'balao_inclinar', pulinho: 'balao_pulinho', susto: 'balao_susto', estufar: 'balao_estufar', murchar: 'balao_murchar' });
    for (const cara of CARAS_DO_BALAO) expect(NOME_DA_CARA[cara]).toBe(`cara_${cara}`);
  });

  it('escreve na saída passada, sem alocar', () => {
    const saida = { acao: 'parado' as const, repetir: false, cara: 'neutro' as const };
    expect(pedidoDoBalao('susto', false, null, saida)).toBe(saida);
    expect(saida.acao).toBe('susto');
  });
});
