import { describe, expect, it } from 'vitest';
import { teclaEmCampo, teclaEmCampoDeTexto } from './campo';

/** Alvo falso: `closest` acha o seletor se algum dos seletores pedidos é a tag dele. */
const alvo = (tag: string) => ({
  closest: (seletores: string) =>
    seletores
      .split(',')
      .map((s) => s.trim())
      .includes(tag)
      ? {}
      : null,
});

describe('teclaEmCampo', () => {
  it.each(['input', 'textarea', 'select', 'button'])('tecla em <%s> não é atalho do jogo', (tag) => {
    expect(teclaEmCampo(alvo(tag) as unknown as EventTarget)).toBe(true);
  });

  it('tecla no corpo da página ou no canvas é atalho do jogo', () => {
    expect(teclaEmCampo(alvo('canvas') as unknown as EventTarget)).toBe(false);
    expect(teclaEmCampo(alvo('body') as unknown as EventTarget)).toBe(false);
  });

  it('sem alvo, ou alvo que não é elemento (window, document), é atalho do jogo', () => {
    expect(teclaEmCampo(null)).toBe(false);
    expect(teclaEmCampo({} as EventTarget)).toBe(false);
  });
});

describe('teclaEmCampoDeTexto', () => {
  const elemento = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, ...extra }) as unknown as EventTarget;

  it('textarea, select e input de texto (inclusive sem tipo, número e busca) são campos', () => {
    expect(teclaEmCampoDeTexto(elemento('TEXTAREA'))).toBe(true);
    expect(teclaEmCampoDeTexto(elemento('SELECT'))).toBe(true);
    expect(teclaEmCampoDeTexto(elemento('INPUT'))).toBe(true);
    for (const type of ['text', 'number', 'search', 'password', 'email', 'TEXT']) expect(teclaEmCampoDeTexto(elemento('INPUT', { type }))).toBe(true);
  });

  it('elemento editável é campo', () => {
    expect(teclaEmCampoDeTexto(elemento('DIV', { isContentEditable: true }))).toBe(true);
    expect(teclaEmCampoDeTexto(elemento('DIV', { isContentEditable: false }))).toBe(false);
  });

  it('botão e controle sem texto (caixa de marcar, slider) deixam o dígito passar', () => {
    expect(teclaEmCampoDeTexto(elemento('BUTTON'))).toBe(false);
    for (const type of ['button', 'checkbox', 'radio', 'range', 'submit', 'color']) expect(teclaEmCampoDeTexto(elemento('INPUT', { type }))).toBe(false);
  });

  it('corpo, canvas, window e nada: não é campo', () => {
    expect(teclaEmCampoDeTexto(elemento('BODY'))).toBe(false);
    expect(teclaEmCampoDeTexto(elemento('CANVAS'))).toBe(false);
    expect(teclaEmCampoDeTexto(null)).toBe(false);
    expect(teclaEmCampoDeTexto({} as EventTarget)).toBe(false);
  });
});
