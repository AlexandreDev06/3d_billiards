import type { EstadoCarteira } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { campoFaltando, carteiraDoConvidadoTemAlgo, textoDaEspera } from './conta-modelo';

const base = { saldo: 100, skins: ['classico'], skin: 'classico' } as unknown as EstadoCarteira;

describe('carteiraDoConvidadoTemAlgo', () => {
  it('sem carteira lida não avisa', () => expect(carteiraDoConvidadoTemAlgo(null)).toBe(false));
  it('com moedas avisa', () => expect(carteiraDoConvidadoTemAlgo(base)).toBe(true));
  it('zerada e sem item não avisa', () => expect(carteiraDoConvidadoTemAlgo({ ...base, saldo: 0 })).toBe(false));
  it('zerada mas com um taco comprado avisa', () => expect(carteiraDoConvidadoTemAlgo({ ...base, saldo: 0, skins: ['classico', 'coral'] } as unknown as EstadoCarteira)).toBe(true));
});

describe('campoFaltando', () => {
  it('acha o primeiro vazio', () => {
    expect(campoFaltando({ email: ' ', senha: '' })?.campo).toBe('email');
    expect(campoFaltando({ email: 'a@b.co', senha: '' })?.campo).toBe('senha');
    expect(campoFaltando({ email: 'a@b.co', nome: '', senha: 'x' })?.campo).toBe('nome');
    expect(campoFaltando({ email: 'a@b.co', nome: 'A', senha: 'x' })).toBeNull();
  });
});

describe('textoDaEspera', () => {
  it('em segundos, minutos e horas', () => {
    expect(textoDaEspera(undefined)).toBe('');
    expect(textoDaEspera(30)).toBe(' Tente de novo em 30 s.');
    expect(textoDaEspera(90)).toBe(' Tente de novo em 2 min.');
    expect(textoDaEspera(7200)).toBe(' Tente de novo em 2 h.');
  });
});
