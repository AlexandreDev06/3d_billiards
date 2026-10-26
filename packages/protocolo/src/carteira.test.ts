import { describe, expect, it } from 'vitest';
import { PRESET_BOTECO } from '@sinuca/regras';
import {
  APOSTAS_DA_SALA,
  APOSTA_PADRAO,
  PROTOCOLO_VERSAO,
  SALDO_INICIAL,
  SKINS_DE_TACO,
  SKIN_PADRAO,
  TAMANHO_CODIGO_CARTEIRA,
  ehCodigoDeCarteira,
  ehSkinDeTaco,
  precoDaSkin,
  validarCarteiraCriada,
  validarErroDaCarteira,
  validarEstadoDaCarteira,
  validarMensagemDaSala,
  validarMensagemDoCliente,
  validarPedidoDeSkin,
} from './index';

/** 32 bytes em base64url: 43 caracteres, sem preenchimento. */
const CODIGO = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCde';

describe('catálogo de skins, apostas e saldo (L22)', () => {
  it('as skins são as do pedido, nesta ordem, com id, nome e preço', () => {
    expect(SKINS_DE_TACO).toEqual([
      { id: 'classico', nome: 'Clássico', preco: 0 },
      { id: 'ebano', nome: 'Ébano', preco: 50 },
      { id: 'boteco', nome: 'Boteco', preco: 80 },
      { id: 'marfim', nome: 'Marfim', preco: 100 },
      { id: 'carbono', nome: 'Carbono', preco: 150 },
      { id: 'chamas', nome: 'Chamas', preco: 200 },
      { id: 'neon', nome: 'Neon', preco: 300 },
      { id: 'ouro', nome: 'Ouro', preco: 500 },
    ]);
    expect(SKIN_PADRAO).toBe('classico');
    expect(precoDaSkin('classico')).toBe(0);
    expect(precoDaSkin('ouro')).toBe(500);
  });

  it('ehSkinDeTaco só aceita ids do catálogo (nada herdado do protótipo)', () => {
    expect(ehSkinDeTaco('neon')).toBe(true);
    for (const ruim of ['Neon', 'ouro ', '', 'toString', '__proto__', 'constructor', 7, null, undefined, {}]) expect(ehSkinDeTaco(ruim), String(ruim)).toBe(false);
  });

  it('apostas 10, 20, 50 e 100 (padrão 10) e saldo inicial 100', () => {
    expect(APOSTAS_DA_SALA).toEqual([10, 20, 50, 100]);
    expect(APOSTA_PADRAO).toBe(10);
    expect(SALDO_INICIAL).toBe(100);
  });

  it('a versão do protocolo subiu para 7 (missões diárias, L31)', () => {
    expect(PROTOCOLO_VERSAO).toBe(7);
  });
});

describe('código da carteira', () => {
  it('tem 43 caracteres base64url (32 bytes), e só isso', () => {
    expect(TAMANHO_CODIGO_CARTEIRA).toBe(43);
    expect(ehCodigoDeCarteira(CODIGO)).toBe(true);
    for (const ruim of [CODIGO.slice(1), CODIGO + 'A', CODIGO.replace('A', '+'), CODIGO.replace('A', '='), CODIGO.replace('A', ' '), '', 5, null]) {
      expect(ehCodigoDeCarteira(ruim), String(ruim)).toBe(false);
    }
  });
});

describe('corpos e respostas do HTTP da carteira', () => {
  it('estado da carteira: saldo inteiro (pode ser negativo), skins do catálogo sem repetir e a skin em uso entre elas', () => {
    expect(validarEstadoDaCarteira({ saldo: 100, skins: ['classico'], skin: 'classico' }).ok).toBe(true);
    expect(validarEstadoDaCarteira({ saldo: -35, skins: ['classico', 'ouro'], skin: 'ouro' }).ok).toBe(true);
    const ruins: unknown[] = [
      { saldo: 1.5, skins: ['classico'], skin: 'classico' },
      { saldo: '100', skins: ['classico'], skin: 'classico' },
      { saldo: 100, skins: [], skin: 'classico' },
      { saldo: 100, skins: ['classico', 'classico'], skin: 'classico' },
      { saldo: 100, skins: ['classico', 'diamante'], skin: 'classico' },
      { saldo: 100, skins: ['classico'], skin: 'ouro' },
      { saldo: 100, skins: ['classico'], skin: 'classico', codigo: CODIGO },
      { saldo: 100, skins: ['classico'] },
    ];
    for (const r of ruins) expect(validarEstadoDaCarteira(r).ok, JSON.stringify(r)).toBe(false);
  });

  it('carteira criada leva o código e o estado, nada mais', () => {
    expect(validarCarteiraCriada({ codigo: CODIGO, saldo: 100, skins: ['classico'], skin: 'classico' }).ok).toBe(true);
    expect(validarCarteiraCriada({ saldo: 100, skins: ['classico'], skin: 'classico' }).ok).toBe(false);
    expect(validarCarteiraCriada({ codigo: 'curto', saldo: 100, skins: ['classico'], skin: 'classico' }).ok).toBe(false);
  });

  it('pedido de skin: só { skin }, texto curto (o catálogo é conferido pela sala, que responde skin-invalida)', () => {
    expect(validarPedidoDeSkin({ skin: 'neon' })).toEqual({ ok: true, valor: { skin: 'neon' } });
    expect(validarPedidoDeSkin({ skin: 'nao-existe' }).ok).toBe(true);
    for (const r of [{}, { skin: 3 }, { skin: '' }, { skin: 'a'.repeat(25) }, { skin: 'neon', extra: 1 }, [], null, 'neon', { skin: 'neon', __proto__: { x: 1 } }]) {
      expect(validarPedidoDeSkin(r).ok, JSON.stringify(r)).toBe(false);
    }
    expect(validarPedidoDeSkin(JSON.parse('{"skin":"neon","__proto__":{"x":1}}')).ok).toBe(false);
  });

  it('erro da carteira: um dos sete códigos e uma mensagem', () => {
    for (const erro of ['carteira-invalida', 'saldo-insuficiente', 'skin-invalida', 'ja-tem', 'nao-tem', 'limite', 'requisicao-invalida']) {
      expect(validarErroDaCarteira({ erro, mensagem: 'x' }).ok, erro).toBe(true);
    }
    expect(validarErroDaCarteira({ erro: 'outro', mensagem: 'x' }).ok).toBe(false);
    expect(validarErroDaCarteira({ erro: 'limite' }).ok).toBe(false);
  });
});

describe('mensagens do WebSocket com carteira e aposta (L22)', () => {
  const criar = { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Boteco', modo: '1x1', regras: PRESET_BOTECO.regras } as const;

  it('criar-sala e entrar levam a carteira (43 caracteres base64url); configurar-sala e criar-sala levam a aposta do catálogo', () => {
    expect(validarMensagemDoCliente({ ...criar, carteira: CODIGO, aposta: 50 }).ok).toBe(true);
    expect(validarMensagemDoCliente({ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Ana', carteira: CODIGO }).ok).toBe(true);
    expect(validarMensagemDoCliente({ tipo: 'configurar-sala', aposta: 100 }).ok).toBe(true);
    for (const aposta of [0, 5, 30, 101, -10, 10.5, '10', null]) {
      expect(validarMensagemDoCliente({ ...criar, aposta }).ok, `criar aposta=${String(aposta)}`).toBe(false);
      expect(validarMensagemDoCliente({ tipo: 'configurar-sala', aposta }).ok, `configurar aposta=${String(aposta)}`).toBe(false);
    }
    for (const carteira of ['curto', CODIGO + 'A', 'a b'.padEnd(43, 'x'), '', 7, null]) {
      expect(validarMensagemDoCliente({ ...criar, carteira }).ok, `criar carteira=${String(carteira)}`).toBe(false);
      expect(validarMensagemDoCliente({ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Ana', carteira }).ok, `entrar carteira=${String(carteira)}`).toBe(false);
    }
  });

  const lugar = (n: number, extra: object = {}) => ({ lugar: n, equipe: n % 2, nome: n < 2 ? `J${n}` : null, conectado: n < 2, anfitriao: n === 0, ...extra });
  const estado = (lugares: object[], extra: object = {}) => ({
    tipo: 'estado-sala', codigo: 'K7M2P', modo: '1x1', preset: 'Boteco', fase: 'espera', seq: 0, vez: null, lugares, espectadores: 0, ...extra,
  });

  it('estado-sala leva a aposta e, em cada lugar, o saldo (null sem carteira) e a skin', () => {
    const lugares = [lugar(0, { saldo: 90, skin: 'ouro' }), lugar(1, { saldo: null, skin: 'classico' }), lugar(2), lugar(3)];
    expect(validarMensagemDaSala(estado(lugares, { aposta: 20 })).ok).toBe(true);
    // saldo negativo é legítimo (a conta pode ficar no vermelho)
    expect(validarMensagemDaSala(estado([lugar(0, { saldo: -1230, skin: 'classico' }), lugar(1), lugar(2), lugar(3)], { aposta: 10 })).ok).toBe(true);
  });

  it('estado-sala recusa aposta fora do catálogo, saldo quebrado e skin desconhecida', () => {
    const base = [lugar(0), lugar(1), lugar(2), lugar(3)];
    expect(validarMensagemDaSala(estado(base, { aposta: 15 })).ok).toBe(false);
    expect(validarMensagemDaSala(estado([lugar(0, { saldo: 1.5 }), lugar(1), lugar(2), lugar(3)])).ok).toBe(false);
    expect(validarMensagemDaSala(estado([lugar(0, { saldo: 'x' }), lugar(1), lugar(2), lugar(3)])).ok).toBe(false);
    expect(validarMensagemDaSala(estado([lugar(0, { skin: 'diamante' }), lugar(1), lugar(2), lugar(3)])).ok).toBe(false);
    expect(validarMensagemDaSala(estado([lugar(0, { carteira: CODIGO }), lugar(1), lugar(2), lugar(3)])).ok, 'o código nunca viaja').toBe(false);
  });

  const paga = { tipo: 'aposta-paga', valor: 20, variacoes: [{ lugar: 0, nome: 'Ana', delta: 20, saldo: 120 }, { lugar: 1, nome: 'Beto', delta: -20, saldo: 80 }] };

  it('aposta-paga: o valor, as variações por lugar (com delta e saldo novo) ou a anulação', () => {
    expect(validarMensagemDaSala(paga).ok).toBe(true);
    expect(validarMensagemDaSala({ tipo: 'aposta-paga', valor: 10, variacoes: [], anulada: 'carteira-repetida' }).ok).toBe(true);
    expect(validarMensagemDaSala({ ...paga, variacoes: [{ lugar: 0, nome: 'Ana', delta: -10, saldo: -5 }] }).ok, 'saldo negativo').toBe(true);
  });

  it('aposta-paga recusa valor fora do catálogo, delta ou saldo quebrado, lugar repetido, anulação com variações e motivo desconhecido', () => {
    const ruins: unknown[] = [
      { ...paga, valor: 15 },
      { ...paga, variacoes: [{ lugar: 0, nome: 'Ana', delta: 1.5, saldo: 120 }] },
      { ...paga, variacoes: [{ lugar: 0, nome: 'Ana', delta: 20, saldo: '120' }] },
      { ...paga, variacoes: [{ lugar: 0, nome: 'Ana', delta: 20, saldo: 120 }, { lugar: 0, nome: 'Beto', delta: -20, saldo: 80 }] },
      { ...paga, variacoes: [{ lugar: 4, nome: 'Ana', delta: 20, saldo: 120 }] },
      { ...paga, variacoes: Array.from({ length: 5 }, (_, i) => ({ lugar: i % 4, nome: 'x', delta: 0, saldo: 0 })) },
      { ...paga, variacoes: [{ lugar: 0, nome: 'Ana', delta: 20, saldo: 120, carteira: CODIGO }] },
      { ...paga, anulada: 'carteira-repetida' },
      { tipo: 'aposta-paga', valor: 10, variacoes: [], anulada: 'outra' },
      { tipo: 'aposta-paga', valor: 10 },
    ];
    for (const r of ruins) expect(validarMensagemDaSala(r).ok, JSON.stringify(r)).toBe(false);
  });

  it('o cliente não manda aposta-paga: é só da sala', () => {
    expect(validarMensagemDoCliente(paga).ok).toBe(false);
  });
});
