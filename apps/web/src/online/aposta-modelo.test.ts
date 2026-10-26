import type { MsgApostaPaga } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { apostaNaTela } from './aposta-modelo';

const PAGA: MsgApostaPaga = {
  tipo: 'aposta-paga',
  valor: 20,
  variacoes: [
    { lugar: 0, nome: 'Ana', delta: 20, saldo: 120 },
    { lugar: 1, nome: 'Beto', delta: -20, saldo: -5 },
  ],
};

describe('apostaNaTela', () => {
  it('sem aposta paga, nada a mostrar', () => {
    expect(apostaNaTela(null, '1x1', 0)).toBeNull();
  });

  it('uma linha por lugar com carteira: o sinal da variação, o saldo novo e quem ganhou ou perdeu', () => {
    const a = apostaNaTela(PAGA, '1x1', 0)!;
    expect(a.anulada).toBe(false);
    expect(a.titulo).toBe('Aposta de 20 moedas');
    expect(a.linhas.map((l) => [l.nome, l.textoDelta, l.sentido, l.textoSaldo])).toEqual([
      ['Ana', '+20', 'ganhou', '120 moedas'],
      ['Beto', '−20', 'perdeu', '−5 moedas'],
    ]);
  });

  it('o saldo no vermelho é marcado, e quem sou eu também', () => {
    const a = apostaNaTela(PAGA, '1x1', 1)!;
    expect(a.linhas.map((l) => l.saldoNegativo)).toEqual([false, true]);
    expect(a.linhas.map((l) => l.voce)).toEqual([false, true]);
    expect(apostaNaTela(PAGA, '1x1', null)!.linhas.some((l) => l.voce)).toBe(false);
  });

  it('a cor da linha é a da equipe do lugar, como no chat e no placar', () => {
    const tres: MsgApostaPaga = {
      tipo: 'aposta-paga',
      valor: 10,
      variacoes: [
        { lugar: 0, nome: 'Ana', delta: 20, saldo: 120 },
        { lugar: 1, nome: 'Beto', delta: -10, saldo: 90 },
        { lugar: 2, nome: 'Caio', delta: -10, saldo: 90 },
      ],
    };
    expect(apostaNaTela(tres, '1x1x1', 0)!.linhas.map((l) => l.equipe)).toEqual([0, 1, 2]);
    // 2x1: os lugares 0 e 2 são a mesma equipe
    expect(apostaNaTela(tres, '2x1', 0)!.linhas.map((l) => l.equipe)).toEqual([0, 1, 0]);
  });

  it('quem ficou no zero a zero aparece como "0", sem sinal de ganho nem de perda', () => {
    const a = apostaNaTela({ tipo: 'aposta-paga', valor: 10, variacoes: [{ lugar: 0, nome: 'Ana', delta: 0, saldo: 100 }] }, '1x1', 0)!;
    expect(a.linhas[0]).toMatchObject({ textoDelta: '0', sentido: 'igual' });
  });

  it('aposta anulada: a frase da carteira repetida e nenhuma linha', () => {
    const a = apostaNaTela({ tipo: 'aposta-paga', valor: 10, variacoes: [], anulada: 'carteira-repetida' }, '1x1', 0)!;
    expect(a.anulada).toBe(true);
    expect(a.titulo).toBe('Aposta anulada: a mesma carteira em dois lugares');
    expect(a.linhas).toEqual([]);
  });

  it('a frase de cada pessoa para o leitor de tela', () => {
    const a = apostaNaTela(PAGA, '1x1', 0)!;
    expect(a.linhas.map((l) => l.descricao)).toEqual(['Ana ganhou 20 moedas e ficou com 120 moedas', 'Beto perdeu 20 moedas e ficou com −5 moedas']);
    const zero = apostaNaTela({ tipo: 'aposta-paga', valor: 10, variacoes: [{ lugar: 0, nome: 'Ana', delta: 0, saldo: 100 }] }, '1x1', 0)!;
    expect(zero.linhas[0]!.descricao).toBe('Ana não ganhou nem perdeu e ficou com 100 moedas');
  });
});
