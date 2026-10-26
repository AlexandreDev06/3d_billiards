import { describe, expect, it } from 'vitest';
import { codigoDaUrl, codigoValido, comSalaNaUrl, linkDoConvite, semSalaNaUrl, urlDoSocket } from './convite';

describe('código da sala', () => {
  it('aceita 5 caracteres do alfabeto, com espaços, hífens e minúsculas', () => {
    expect(codigoValido('K7M2P')).toBe(true);
    expect(codigoValido(' k7m-2p ')).toBe(true);
  });

  it('recusa tamanho errado e letras ambíguas (0, 1, I, L, O)', () => {
    expect(codigoValido('K7M2')).toBe(false);
    expect(codigoValido('K7M2PX')).toBe(false);
    expect(codigoValido('K7M2O')).toBe(false);
    expect(codigoValido('K7M21')).toBe(false);
    expect(codigoValido('')).toBe(false);
  });

  it('lê ?sala= da URL e normaliza; ignora o que não é código', () => {
    expect(codigoDaUrl('?sala=k7m2p')).toBe('K7M2P');
    expect(codigoDaUrl('?semente=3&sala=K7M-2P')).toBe('K7M2P');
    expect(codigoDaUrl('?sala=lixo')).toBeNull();
    expect(codigoDaUrl('?semente=3')).toBeNull();
    expect(codigoDaUrl('')).toBeNull();
  });
});

describe('links', () => {
  it('o convite é a página com ?sala= e não duplica a barra', () => {
    expect(linkDoConvite('https://mayfly.ngrok-free.app', 'K7M2P')).toBe('https://mayfly.ngrok-free.app/?sala=K7M2P');
    expect(linkDoConvite('http://127.0.0.1:8001/', 'K7M2P')).toBe('http://127.0.0.1:8001/?sala=K7M2P');
  });

  it('o socket usa o mesmo endereço da página: wss atrás de https (ngrok), ws no resto', () => {
    expect(urlDoSocket({ protocol: 'https:', host: 'mayfly.ngrok-free.app' })).toBe('wss://mayfly.ngrok-free.app/sala');
    expect(urlDoSocket({ protocol: 'http:', host: '127.0.0.1:8001' })).toBe('ws://127.0.0.1:8001/sala');
    expect(urlDoSocket({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/sala');
  });

  it('põe e tira ?sala= da busca sem perder o resto', () => {
    expect(comSalaNaUrl('?semente=4', 'K7M2P')).toBe('?semente=4&sala=K7M2P');
    expect(comSalaNaUrl('', 'K7M2P')).toBe('?sala=K7M2P');
    expect(semSalaNaUrl('?semente=4&sala=K7M2P')).toBe('?semente=4');
    expect(semSalaNaUrl('?sala=K7M2P')).toBe('');
  });
});
