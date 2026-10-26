import { describe, expect, it } from 'vitest';
import { origemPermitida } from './origem';

const LISTA = ['https://mayfly-one-mainly.ngrok-free.app', 'http://localhost:8001', 'http://127.0.0.1:5173'];

describe('origemPermitida', () => {
  it('sem Origin (cliente que não é navegador) passa: o navegador sempre manda', () => {
    expect(origemPermitida(undefined, LISTA)).toBe(true);
  });

  it('só as origens da lista, comparadas por inteiro', () => {
    expect(origemPermitida('https://mayfly-one-mainly.ngrok-free.app', LISTA)).toBe(true);
    expect(origemPermitida('http://localhost:8001', LISTA)).toBe(true);
    expect(origemPermitida('http://127.0.0.1:5173', LISTA)).toBe(true);
  });

  it('outro site, outra porta, outro esquema ou subdomínio parecido não passam', () => {
    for (const ruim of [
      'https://evil.example',
      'http://localhost:8002',
      'http://mayfly-one-mainly.ngrok-free.app',
      'https://mayfly-one-mainly.ngrok-free.app.evil.example',
      'https://evil.mayfly-one-mainly.ngrok-free.app',
      'https://ngrok-free.app',
      'null',
      '',
      'file://',
      'http://localhost',
    ]) {
      expect(origemPermitida(ruim, LISTA), ruim).toBe(false);
    }
  });

  it('maiúsculas não enganam, mas barra no fim ou caminho não são Origin válido', () => {
    expect(origemPermitida('HTTPS://Mayfly-One-Mainly.ngrok-free.app', LISTA)).toBe(true);
    expect(origemPermitida('https://mayfly-one-mainly.ngrok-free.app/', LISTA)).toBe(false);
    expect(origemPermitida('https://mayfly-one-mainly.ngrok-free.app/x', LISTA)).toBe(false);
  });

  it('lista vazia recusa todo navegador', () => {
    expect(origemPermitida('http://localhost:8001', [])).toBe(false);
    expect(origemPermitida(undefined, [])).toBe(true);
  });
});
