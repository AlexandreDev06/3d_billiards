import { describe, expect, it } from 'vitest';
import { configDoBanco, lerPepper, PEPPER_MINIMO } from './config';

describe('configDoBanco', () => {
  it('lê os vars do wrangler.jsonc', () => {
    expect(configDoBanco({ SALDO_INICIAL: '100', MAX_CONTAS: '50000', DOMINIO_DO_COOKIE: '.becogames.app', COOKIE_SEGURO: '1', ORIGENS_DE_DEV: '', LOCAL_DO: 'sam' })).toEqual({
      saldoInicial: 100,
      maxContas: 50_000,
      dominioDoCookie: '.becogames.app',
      cookieSeguro: true,
      origensDeDev: [],
      localDo: 'sam',
    });
  });
  it('ausente = padrão seguro: Secure ligado, sem domínio, sem origem de dev', () => {
    expect(configDoBanco({})).toEqual({ saldoInicial: 100, maxContas: 50_000, dominioDoCookie: null, cookieSeguro: true, origensDeDev: [], localDo: '' });
  });
  it('desenvolvimento: sem Secure, sem domínio, origens em minúsculas', () => {
    const c = configDoBanco({ COOKIE_SEGURO: '0', DOMINIO_DO_COOKIE: '', ORIGENS_DE_DEV: 'http://localhost:5173, HTTP://127.0.0.1:8788 ,' });
    expect(c).toMatchObject({ cookieSeguro: false, dominioDoCookie: null, origensDeDev: ['http://localhost:5173', 'http://127.0.0.1:8788'] });
  });
  it('valor ruim lança com o nome da variável', () => {
    for (const [nome, valor] of [['SALDO_INICIAL', '-1'], ['SALDO_INICIAL', '1.5'], ['SALDO_INICIAL', 'cem'], ['MAX_CONTAS', '0'], ['COOKIE_SEGURO', 'talvez'], ['DOMINIO_DO_COOKIE', 'a b'], ['ORIGENS_DE_DEV', 'localhost'], ['ORIGENS_DE_DEV', 'http://a/b'], ['LOCAL_DO', 'lua']] as const) {
      expect(() => configDoBanco({ [nome]: valor }), `${nome}=${valor}`).toThrow(nome);
    }
  });
});

describe('configDoBanco: origens de desenvolvimento na produção', () => {
  const producao = { COOKIE_SEGURO: '1', DOMINIO_DO_COOKIE: '.becogames.app' };
  it('ORIGENS_DE_DEV junto com COOKIE_SEGURO=1 e o domínio de produção não sobe', () => {
    expect(() => configDoBanco({ ...producao, ORIGENS_DE_DEV: 'http://localhost:5173' })).toThrow('ORIGENS_DE_DEV');
    expect(() => configDoBanco({ ...producao, DOMINIO_DO_COOKIE: 'becogames.app', ORIGENS_DE_DEV: 'http://localhost:5173' })).toThrow('ORIGENS_DE_DEV');
    expect(() => configDoBanco({ ...producao, DOMINIO_DO_COOKIE: '.Sinuca.BecoGames.app', ORIGENS_DE_DEV: 'http://localhost:5173' })).toThrow('ORIGENS_DE_DEV');
    // Secure ausente é Secure ligado
    expect(() => configDoBanco({ DOMINIO_DO_COOKIE: '.becogames.app', ORIGENS_DE_DEV: 'http://localhost:5173' })).toThrow('ORIGENS_DE_DEV');
  });
  it('a produção sem origens de dev sobe, e o desenvolvimento com elas também', () => {
    expect(configDoBanco({ ...producao, ORIGENS_DE_DEV: '' }).origensDeDev).toEqual([]);
    expect(configDoBanco({ ...producao }).dominioDoCookie).toBe('.becogames.app');
    expect(configDoBanco({ COOKIE_SEGURO: '0', DOMINIO_DO_COOKIE: '', ORIGENS_DE_DEV: 'http://localhost:5173' }).origensDeDev).toEqual(['http://localhost:5173']);
    expect(configDoBanco({ COOKIE_SEGURO: '0', DOMINIO_DO_COOKIE: '.becogames.app', ORIGENS_DE_DEV: 'http://localhost:5173' }).origensDeDev).toHaveLength(1);
    expect(configDoBanco({ COOKIE_SEGURO: '1', DOMINIO_DO_COOKIE: '', ORIGENS_DE_DEV: 'https://localhost:5173' }).origensDeDev).toHaveLength(1);
    expect(configDoBanco({ ...producao, DOMINIO_DO_COOKIE: '.evilbecogames.app' }).dominioDoCookie).toBe('.evilbecogames.app');
  });
});

describe('lerPepper', () => {
  it('ausente ou vazio é sem pepper, sem aviso', () => {
    for (const x of [undefined, '', null, 42]) expect(lerPepper(x)).toEqual({ pepper: null, curto: false });
  });
  it('com menos de 32 caracteres conta como sem pepper, e avisa que foi por ser curto', () => {
    expect(lerPepper('x'.repeat(PEPPER_MINIMO - 1))).toEqual({ pepper: null, curto: true });
    expect(lerPepper('pepper-de-teste')).toEqual({ pepper: null, curto: true });
  });
  it('com 32 ou mais vale', () => {
    expect(lerPepper('x'.repeat(32))).toEqual({ pepper: 'x'.repeat(32), curto: false });
    expect(lerPepper('y'.repeat(64)).pepper).toBe('y'.repeat(64));
  });
});
