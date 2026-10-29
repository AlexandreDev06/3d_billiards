import { describe, expect, it } from 'vitest';
import { acaoDaTecla } from './teclas';

describe('teclas do treino', () => {
  it('cada tecla pede a sua ação', () => {
    expect(acaoDaTecla('KeyP', 'mirar')).toBe('bola-na-mao');
    expect(acaoDaTecla('KeyE', 'mirar')).toBe('arrumar');
    expect(acaoDaTecla('KeyR', 'mirar')).toBe('refazer');
    expect(acaoDaTecla('KeyN', 'mirar')).toBe('novo-triangulo');
    expect(acaoDaTecla('KeyT', 'mirar')).toBe('cenarios');
  });

  it('a tecla do modo sai dele; Esc sai de qualquer modo da mão e em mirar não é do treino', () => {
    expect(acaoDaTecla('KeyP', 'branca')).toBe('sair-do-modo');
    expect(acaoDaTecla('KeyE', 'arrumar')).toBe('sair-do-modo');
    expect(acaoDaTecla('Escape', 'branca')).toBe('sair-do-modo');
    expect(acaoDaTecla('Escape', 'arrumar')).toBe('sair-do-modo');
    expect(acaoDaTecla('Escape', 'mirar')).toBeNull();
  });

  it('X e Delete só tiram bola no modo arrumar', () => {
    expect(acaoDaTecla('KeyX', 'arrumar')).toBe('tirar-bola');
    expect(acaoDaTecla('Delete', 'arrumar')).toBe('tirar-bola');
    expect(acaoDaTecla('KeyX', 'mirar')).toBeNull();
    expect(acaoDaTecla('Delete', 'branca')).toBeNull();
  });

  it('não pega as teclas do jogo', () => {
    for (const code of ['KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyG', 'KeyH', 'KeyL', 'KeyM', 'KeyS', 'KeyW', 'Tab', 'F1', 'F3', 'Digit1']) {
      expect(acaoDaTecla(code, 'mirar')).toBeNull();
    }
  });
});
