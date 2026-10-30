import { describe, expect, it } from 'vitest';
import { alturaDaFaixa, anunciosPermitidos, criarEmpurradorUnico, criarRegistroDeEspacos, deveCarregarScript, deveMostrarEspaco } from './modelo';

const PROD = 'sinuca.becogames.app';

describe('anunciosPermitidos', () => {
  it('só no host de produção', () => {
    expect(anunciosPermitidos(PROD, '')).toBe(true);
    expect(anunciosPermitidos('SINUCA.becogames.app', '?x=1')).toBe(true);
  });
  it.each(['localhost', '127.0.0.1', 'abc-123.ngrok-free.app', 'abc.ngrok.io', 'becogames.app', 'evil.com'])('nunca em %s', (host) => {
    expect(anunciosPermitidos(host, '')).toBe(false);
  });
  it('nunca com ?dev=1, nem em produção', () => {
    expect(anunciosPermitidos(PROD, '?dev=1')).toBe(false);
    expect(anunciosPermitidos(PROD, '?a=2&dev=1')).toBe(false);
  });
});

describe('deveCarregarScript', () => {
  it('só com host liberado e ao menos um bloco com id', () => {
    expect(deveCarregarScript(PROD, '', ['', 'abc'])).toBe(true);
    expect(deveCarregarScript(PROD, '', ['', '', ''])).toBe(false);
    expect(deveCarregarScript('localhost', '', ['abc'])).toBe(false);
    expect(deveCarregarScript('127.0.0.1', '', ['abc'])).toBe(false);
    expect(deveCarregarScript(PROD, '?dev=1', ['abc'])).toBe(false);
  });
});

describe('deveMostrarEspaco', () => {
  it('slot vazio ou host de teste: não aparece', () => {
    expect(deveMostrarEspaco('', PROD, '', false)).toBe(false);
    expect(deveMostrarEspaco('123', 'localhost', '', false)).toBe(false);
    expect(deveMostrarEspaco('123', PROD, '?dev=1', false)).toBe(false);
    expect(deveMostrarEspaco('123', PROD, '', false)).toBe(true);
  });
  it('a prova visual mostra sempre', () => {
    expect(deveMostrarEspaco('', 'localhost', '?dev=1', true)).toBe(true);
  });
});

describe('alturaDaFaixa', () => {
  it('0 sem faixa; 60 em janela baixa; 90 nas demais', () => {
    expect(alturaDaFaixa(false, 1080)).toBe(0);
    expect(alturaDaFaixa(true, 720)).toBe(60);
    expect(alturaDaFaixa(true, 799)).toBe(60);
    expect(alturaDaFaixa(true, 800)).toBe(90);
    expect(alturaDaFaixa(true, 1080)).toBe(90);
  });
  it('fica entre 60 e 90 px', () => {
    for (const h of [200, 480, 720, 900, 1440]) {
      const v = alturaDaFaixa(true, h);
      expect(v).toBeGreaterThanOrEqual(60);
      expect(v).toBeLessThanOrEqual(90);
    }
  });
});

describe('criarRegistroDeEspacos', () => {
  const montar = () => {
    const pushes: object[] = [];
    const descartados: object[] = [];
    const r = criarRegistroDeEspacos<object>(() => ({}), (e) => pushes.push(e), (e) => descartados.push(e));
    return { r, pushes, descartados };
  };
  it('cria o espaço uma vez e dá um push só, por mais que peçam', () => {
    const { r, pushes } = montar();
    const a = r.obter('menu', 'real');
    expect(r.obter('menu', 'real')).toBe(a);
    expect(r.obter('menu', 'real')).toBe(a);
    expect(pushes).toEqual([a]);
  });
  it('um push por espaço', () => {
    const { r, pushes } = montar();
    r.obter('menu', 'real');
    r.obter('fim', 'real');
    r.obter('partida', 'real');
    r.obter('menu', 'real');
    expect(pushes).toHaveLength(3);
  });
  it('trocar a variante descarta o velho e refaz', () => {
    const { r, descartados } = montar();
    const velho = r.obter('menu', 'real');
    const novo = r.obter('menu', 'prova');
    expect(novo).not.toBe(velho);
    expect(descartados).toEqual([velho]);
  });
});

describe('criarRegistroDeEspacos com ids de bloco iguais', () => {
  it('a chave é o lugar, não o id: três lugares com id vazio dão três espaços', () => {
    const r = criarRegistroDeEspacos<object>(() => ({}), () => {}, () => {});
    expect(new Set([r.obter('menu', 'real'), r.obter('fim', 'real'), r.obter('partida', 'real')]).size).toBe(3);
  });
});

describe('criarEmpurradorUnico', () => {
  it('nunca dá push com largura 0 (escondido)', () => {
    let n = 0;
    const e = criarEmpurradorUnico(() => n++);
    expect(e.tentar(0)).toBe(false);
    expect(e.tentar(-1)).toBe(false);
    expect(e.tentar(Number.NaN)).toBe(false);
    expect(n).toBe(0);
  });
  it('dá o push quando a largura aparece, e só uma vez', () => {
    let n = 0;
    const e = criarEmpurradorUnico(() => n++);
    e.tentar(0);
    expect(e.tentar(320)).toBe(true);
    expect(e.tentar(320)).toBe(false);
    expect(e.tentar(1280)).toBe(false);
    expect(n).toBe(1);
    expect(e.feito()).toBe(true);
  });
});
