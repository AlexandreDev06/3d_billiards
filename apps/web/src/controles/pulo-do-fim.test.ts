import { describe, expect, it } from 'vitest';
import { TeclaDoPulo, ouvirPuloDoFim, teclaPulaOFim } from './pulo-do-fim';

describe('teclaPulaOFim', () => {
  it('qualquer tecla comum pula', () => {
    expect(teclaPulaOFim('Space', false, false)).toBe(true);
    expect(teclaPulaOFim('KeyG', false, false)).toBe(true);
    expect(teclaPulaOFim('Escape', false, false)).toBe(true);
  });

  it('modificador sozinho, repetição e campo de texto não pulam', () => {
    expect(teclaPulaOFim('ShiftLeft', false, false)).toBe(false);
    expect(teclaPulaOFim('ControlRight', false, false)).toBe(false);
    expect(teclaPulaOFim('Space', true, false)).toBe(false);
    expect(teclaPulaOFim('KeyA', false, true)).toBe(false);
  });
});

describe('TeclaDoPulo', () => {
  it('engole a tecla que pulou até soltar, e só ela', () => {
    const t = new TeclaDoPulo();
    expect(t.engolir('keydown', 'Enter')).toBe(false);
    t.segurar('Enter');
    expect(t.engolir('keydown', 'Enter')).toBe(true);
    expect(t.engolir('keydown', 'Space')).toBe(false);
    expect(t.engolir('keyup', 'Enter')).toBe(true);
    expect(t.engolir('keydown', 'Enter')).toBe(false);
  });
});

type Ouvinte = EventListenerOrEventListenerObject;

function alvoFalso(): { alvo: Parameters<typeof ouvirPuloDoFim>[0]; disparar: (tipo: string, evento: Record<string, unknown>) => void; quantos: () => number } {
  const ouvintes = new Map<string, Ouvinte[]>();
  return {
    alvo: {
      addEventListener: (tipo: string, o: Ouvinte | null) => ouvintes.set(tipo, [...(ouvintes.get(tipo) ?? []), o!]),
      removeEventListener: (tipo: string, o: Ouvinte | null) => ouvintes.set(tipo, (ouvintes.get(tipo) ?? []).filter((x) => x !== o)),
    },
    disparar: (tipo, evento) => {
      for (const o of ouvintes.get(tipo) ?? []) (o as (e: unknown) => void)(evento);
    },
    quantos: () => [...ouvintes.values()].reduce((n, l) => n + l.length, 0),
  };
}

function evento(extra: Record<string, unknown> = {}): Record<string, unknown> & { parou: string[] } {
  const parou: string[] = [];
  return {
    parou,
    code: 'KeyX',
    repeat: false,
    target: null,
    stopPropagation: () => parou.push('propagacao'),
    stopImmediatePropagation: () => parou.push('imediata'),
    preventDefault: () => parou.push('padrao'),
    ...extra,
  };
}

describe('ouvirPuloDoFim', () => {
  it('um clique enquanto ativo pula e não chega à tela de fim', () => {
    const { alvo, disparar } = alvoFalso();
    let pulos = 0;
    ouvirPuloDoFim(alvo, () => true, () => pulos++);
    const e = evento();
    disparar('click', e);
    expect(pulos).toBe(1);
    expect(e.parou).toEqual(['propagacao', 'padrao']);
  });

  it('sem o fim ativo, nada acontece e o clique segue', () => {
    const { alvo, disparar } = alvoFalso();
    let pulos = 0;
    ouvirPuloDoFim(alvo, () => false, () => pulos++);
    const e = evento();
    disparar('click', e);
    disparar('keydown', e);
    expect(pulos).toBe(0);
    expect(e.parou).toEqual([]);
  });

  it('uma tecla pula, e os eventos dela são engolidos até soltar', () => {
    const { alvo, disparar } = alvoFalso();
    let ativo = true;
    let pulos = 0;
    ouvirPuloDoFim(alvo, () => ativo, () => {
      pulos++;
      ativo = false;
    });
    disparar('keydown', evento({ code: 'Enter' }));
    expect(pulos).toBe(1);
    const repetida = evento({ code: 'Enter', repeat: true });
    disparar('keydown', repetida);
    expect(repetida.parou).toEqual(['imediata', 'padrao']);
    const soltou = evento({ code: 'Enter' });
    disparar('keyup', soltou);
    expect(soltou.parou).toEqual(['imediata', 'padrao']);
    const outra = evento({ code: 'Space' });
    disparar('keyup', outra);
    expect(outra.parou).toEqual([]);
    expect(pulos).toBe(1);
  });

  it('tecla digitada num campo de texto não pula; modificador também não', () => {
    const { alvo, disparar } = alvoFalso();
    let pulos = 0;
    ouvirPuloDoFim(alvo, () => true, () => pulos++);
    disparar('keydown', evento({ target: { tagName: 'INPUT', type: 'text' } }));
    disparar('keydown', evento({ code: 'ShiftLeft' }));
    expect(pulos).toBe(0);
  });

  it('desligar tira os três ouvintes', () => {
    const { alvo, quantos } = alvoFalso();
    const desligar = ouvirPuloDoFim(alvo, () => true, () => undefined);
    expect(quantos()).toBe(3);
    desligar();
    expect(quantos()).toBe(0);
  });
});
