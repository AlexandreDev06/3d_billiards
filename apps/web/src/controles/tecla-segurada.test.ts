import { describe, expect, it } from 'vitest';
import { ligarTeclaSegurada } from './tecla-segurada';

function tecla(tipo: 'keydown' | 'keyup', code: string, extra: { target?: unknown; [chave: string]: unknown } = {}): Event {
  const { target, ...resto } = extra;
  const evento = Object.assign(new Event(tipo), { code, ctrlKey: false, altKey: false, metaKey: false, ...resto });
  // `target` só tem getter no Event: o `dispatchEvent` o preencheria com o alvo; o teste quer um campo no lugar.
  if (target !== undefined) Object.defineProperty(evento, 'target', { value: target });
  return evento;
}

describe('ligarTeclaSegurada: vale enquanto a tecla está apertada', () => {
  it('liga ao apertar e desliga ao soltar', () => {
    const alvo = new EventTarget();
    const b = ligarTeclaSegurada(alvo, 'KeyB');
    expect(b.segurando).toBe(false);
    alvo.dispatchEvent(tecla('keydown', 'KeyB'));
    expect(b.segurando).toBe(true);
    alvo.dispatchEvent(tecla('keyup', 'KeyB'));
    expect(b.segurando).toBe(false);
  });

  it('o auto-repetir do teclado não atrapalha', () => {
    const alvo = new EventTarget();
    const b = ligarTeclaSegurada(alvo, 'KeyB');
    for (let i = 0; i < 5; i++) alvo.dispatchEvent(tecla('keydown', 'KeyB', { repeat: true }));
    expect(b.segurando).toBe(true);
    alvo.dispatchEvent(tecla('keyup', 'KeyB'));
    expect(b.segurando).toBe(false);
  });

  it('só a tecla pedida conta', () => {
    const alvo = new EventTarget();
    const b = ligarTeclaSegurada(alvo, 'KeyB');
    alvo.dispatchEvent(tecla('keydown', 'KeyG'));
    expect(b.segurando).toBe(false);
    alvo.dispatchEvent(tecla('keydown', 'KeyB'));
    alvo.dispatchEvent(tecla('keyup', 'KeyG'));
    expect(b.segurando).toBe(true);
  });

  it('Ctrl, Alt e Meta (atalho do navegador) não contam', () => {
    const alvo = new EventTarget();
    const b = ligarTeclaSegurada(alvo, 'KeyB');
    alvo.dispatchEvent(tecla('keydown', 'KeyB', { ctrlKey: true }));
    alvo.dispatchEvent(tecla('keydown', 'KeyB', { altKey: true }));
    alvo.dispatchEvent(tecla('keydown', 'KeyB', { metaKey: true }));
    expect(b.segurando).toBe(false);
  });

  it('digitando num campo (slider, texto, botão) não liga', () => {
    const alvo = new EventTarget();
    const b = ligarTeclaSegurada(alvo, 'KeyB');
    const campo = { closest: (seletores: string) => (seletores.includes('input') ? {} : null) };
    alvo.dispatchEvent(tecla('keydown', 'KeyB', { target: campo }));
    expect(b.segurando).toBe(false);
  });

  it('perder o foco da janela solta a tecla (o keyup nunca chega)', () => {
    const alvo = new EventTarget();
    const b = ligarTeclaSegurada(alvo, 'KeyB');
    alvo.dispatchEvent(tecla('keydown', 'KeyB'));
    alvo.dispatchEvent(new Event('blur'));
    expect(b.segurando).toBe(false);
  });

  it('soltar uma tecla apertada num campo enquanto segura fora: o keyup sempre solta', () => {
    const alvo = new EventTarget();
    const b = ligarTeclaSegurada(alvo, 'KeyB');
    alvo.dispatchEvent(tecla('keydown', 'KeyB'));
    alvo.dispatchEvent(tecla('keyup', 'KeyB', { target: { closest: () => ({}) } }));
    expect(b.segurando).toBe(false);
  });

  it('dispose tira os ouvintes e solta a tecla', () => {
    const alvo = new EventTarget();
    const b = ligarTeclaSegurada(alvo, 'KeyB');
    alvo.dispatchEvent(tecla('keydown', 'KeyB'));
    b.dispose();
    expect(b.segurando).toBe(false);
    alvo.dispatchEvent(tecla('keydown', 'KeyB'));
    expect(b.segurando).toBe(false);
  });
});
