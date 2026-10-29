/**
 * O contrato do balão fora do catálogo (L47): o que o HTTP da carteira e o `estado-sala` carregam, os pedidos de comprar e equipar,
 * os erros novos, a versão 10 do protocolo e o cliente da versão 9, que segue jogando e vê o balão padrão.
 */
import { describe, expect, it } from 'vitest';
import {
  APARENCIA_PADRAO,
  CABECALHO_DO_PROTOCOLO,
  ITENS_DO_BALAO,
  PROTOCOLO_VERSAO,
  PROTOCOLO_VERSAO_MINIMA,
  SKIN_PADRAO,
  VERSAO_DO_BALAO,
  codificarMensagem,
  decodificarMensagemDaSala,
  estadoDaCarteiraParaVersao,
  falaDoBalao,
  ordemDoItemDoBalao,
  paraVersaoDoCliente,
  validarAparenciaDoBalao,
  validarErroDaCarteira,
  validarEstadoDaCarteira,
  validarMensagemDaSala,
  validarPedidoDeAparencia,
  validarPedidoDeItemDoBalao,
  versaoAceita,
  versaoDoCabecalho,
  type AparenciaDoBalao,
  type EstadoCarteira,
  type IdItemDoBalao,
  type MensagemDaSala,
  type MsgEstadoSala,
} from './index';

const GRATIS: IdItemDoBalao[] = ['olho_normal', 'castanho'];
const emOrdem = (ids: IdItemDoBalao[]): IdItemDoBalao[] => [...ids].sort((a, b) => ordemDoItemDoBalao(a) - ordemDoItemDoBalao(b));

const carteiraBase = { saldo: 100, skins: [SKIN_PADRAO], skin: SKIN_PADRAO };
const cheia: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_kawaii', corDosOlhos: 'dourado' };

describe('versão 10 do protocolo, com a 9 ainda aceita', () => {
  it('a versão atual é a 10 (aparência do balão, L47) e a mínima aceita é a 9', () => {
    expect(PROTOCOLO_VERSAO).toBe(10);
    expect(PROTOCOLO_VERSAO_MINIMA).toBe(9);
    expect(VERSAO_DO_BALAO).toBe(10);
  });

  it('versaoAceita: inteiros de 9 a 10, nada de fora', () => {
    expect([8, 9, 10, 11].map(versaoAceita)).toEqual([false, true, true, false]);
    for (const ruim of [0, -1, 9.5, Number.NaN, Infinity, '10', null, undefined]) expect(versaoAceita(ruim as number), String(ruim)).toBe(false);
  });

  it('falaDoBalao: só a partir da 10', () => {
    expect(falaDoBalao(9)).toBe(false);
    expect(falaDoBalao(10)).toBe(true);
  });

  it('versaoDoCabecalho: o número do cabeçalho do HTTP; ausente, mal formado ou fora da faixa vale a mínima (cliente de antes não manda nada)', () => {
    expect(CABECALHO_DO_PROTOCOLO).toBe('x-sinuca-protocolo');
    expect(versaoDoCabecalho('10')).toBe(10);
    expect(versaoDoCabecalho('9')).toBe(9);
    for (const ruim of [undefined, '', 'dez', '10.5', '-10', '010x', '1e1', ' 10', '99999', '0']) expect(versaoDoCabecalho(ruim), String(ruim)).toBe(PROTOCOLO_VERSAO_MINIMA);
    // mais nova que a da sala (um cliente adiante) não vira poder: vale no máximo a da sala
    expect(versaoDoCabecalho('11')).toBe(PROTOCOLO_VERSAO);
  });
});

describe('LugarSala.aparencia no estado-sala', () => {
  const lugar = (n: number, extra: object = {}) => ({ lugar: n, equipe: n % 2, nome: n < 2 ? `J${n}` : null, conectado: n < 2, anfitriao: n === 0, ...extra });
  const estado = (lugares: object[]) => ({ tipo: 'estado-sala', codigo: 'K7M2P', modo: '1x1', preset: 'Boteco', fase: 'espera', seq: 0, vez: null, lugares, espectadores: 0 });

  it('cada lugar pode levar a aparência completa, ou null (lugar vago); sem o campo continua valendo (montagens de teste)', () => {
    expect(validarMensagemDaSala(estado([lugar(0, { aparencia: cheia }), lugar(1, { aparencia: APARENCIA_PADRAO }), lugar(2, { aparencia: null }), lugar(3)])).ok).toBe(true);
  });

  it('recusa aparência com id que não existe, de outro tipo, campo a mais ou faltando', () => {
    const ruins: unknown[] = [
      { ...cheia, chapeu: 'cartolinha' },
      { ...cheia, bigode: 'coroa' },
      { ...cheia, corDosOlhos: 'olho_bravo' },
      { ...cheia, barba: 'longa' },
      { chapeu: null, bigode: null, olhos: 'olho_normal' },
      'coroa',
      [],
    ];
    for (const aparencia of ruins) {
      expect(validarMensagemDaSala(estado([lugar(0, { aparencia }), lugar(1), lugar(2), lugar(3)])).ok, JSON.stringify(aparencia)).toBe(false);
    }
  });

  it('a aparência passa pelo fio (JSON) inteira e sem mudar', () => {
    const m = { ...estado([lugar(0, { aparencia: cheia }), lugar(1), lugar(2), lugar(3)]) } as unknown as MsgEstadoSala;
    const r = decodificarMensagemDaSala(codificarMensagem(m));
    expect(r.ok && r.valor.tipo === 'estado-sala' && r.valor.lugares[0]!.aparencia).toEqual(cheia);
  });
});

describe('EstadoCarteira.balao: a aparência em uso e os itens que a carteira tem', () => {
  const balao = (itens: IdItemDoBalao[], aparencia: AparenciaDoBalao = APARENCIA_PADRAO) => ({ aparencia, itens });
  const com = (b: object) => ({ ...carteiraBase, balao: b });

  it('o estado sem `balao` continua valendo (o tipo é opcional para o web de antes compilar)', () => {
    expect(validarEstadoDaCarteira(carteiraBase).ok).toBe(true);
  });

  it('a carteira nova: só os grátis, com a aparência padrão', () => {
    expect(validarEstadoDaCarteira(com(balao(GRATIS))).ok).toBe(true);
  });

  it('com itens comprados, em ordem da loja, e a aparência que usa só deles', () => {
    const itens = emOrdem([...GRATIS, 'coroa', 'bigodao', 'olho_kawaii', 'dourado']);
    expect(validarEstadoDaCarteira(com(balao(itens, cheia))).ok).toBe(true);
    // pode ter itens que não está usando
    expect(validarEstadoDaCarteira(com(balao(itens))).ok).toBe(true);
  });

  it('recusa aparência com item que a carteira não tem', () => {
    const r = validarEstadoDaCarteira(com(balao(GRATIS, cheia)));
    expect(r.ok).toBe(false);
  });

  it('recusa lista sem os grátis, fora da ordem da loja, repetida ou com id que não existe', () => {
    const ruins: IdItemDoBalao[][] = [
      ['coroa'],
      ['olho_normal', 'coroa'],
      ['castanho', 'olho_normal', 'coroa'],
      [...GRATIS, ...GRATIS],
      emOrdem(GRATIS).reverse(),
      ['castanho', 'bigode_guidao', 'olho_normal'],
    ];
    for (const itens of ruins) expect(validarEstadoDaCarteira(com(balao(itens))).ok, JSON.stringify(itens)).toBe(false);
    expect(validarEstadoDaCarteira(com({ aparencia: APARENCIA_PADRAO, itens: [...GRATIS, 'barba_longa'] })).ok).toBe(false);
    expect(validarEstadoDaCarteira(com({ aparencia: APARENCIA_PADRAO })).ok).toBe(false);
    expect(validarEstadoDaCarteira(com({ itens: GRATIS })).ok).toBe(false);
    expect(validarEstadoDaCarteira(com({ aparencia: APARENCIA_PADRAO, itens: GRATIS, extra: 1 })).ok).toBe(false);
  });

  it('a lista inteira (25 itens) cabe no esquema', () => {
    const todos = ITENS_DO_BALAO.map((i) => i.id);
    expect(validarEstadoDaCarteira(com(balao(todos, cheia))).ok).toBe(true);
  });
});

describe('pedidos de comprar e equipar', () => {
  it('comprar: { item } e, opcional, { preco } inteiro de 1 a 1 000 000 (o teto que a tela mostrou, como nas skins)', () => {
    expect(validarPedidoDeItemDoBalao({ item: 'coroa' })).toEqual({ ok: true, valor: { item: 'coroa' } });
    expect(validarPedidoDeItemDoBalao({ item: 'coroa', preco: 500 })).toEqual({ ok: true, valor: { item: 'coroa', preco: 500 } });
    // que o id exista é com a sala (`item-invalido`); o esquema só confere a forma
    expect(validarPedidoDeItemDoBalao({ item: 'barba_longa' }).ok).toBe(true);
    for (const ruim of [null, 'coroa', [], {}, { item: 7 }, { item: '' }, { item: 'x'.repeat(40) }, { item: 'coroa', preco: 0 }, { item: 'coroa', preco: 1.5 }, { item: 'coroa', preco: 1_000_001 }, { item: 'coroa', preco: '500' }, { item: 'coroa', skin: 'ebano' }, { skin: 'ebano' }]) {
      expect(validarPedidoDeItemDoBalao(ruim).ok, JSON.stringify(ruim)).toBe(false);
    }
  });

  it('equipar: { aparencia } só; o conteúdo é conferido à parte (`aparencia-invalida`)', () => {
    expect(validarPedidoDeAparencia({ aparencia: cheia })).toEqual({ ok: true, valor: { aparencia: cheia } });
    // a forma do pedido passa mesmo com a aparência torta: quem diz que ela não vale é validarAparenciaDoBalao
    const torto = validarPedidoDeAparencia({ aparencia: { chapeu: 'barba_longa' } });
    expect(torto.ok).toBe(true);
    if (torto.ok) expect(validarAparenciaDoBalao(torto.valor.aparencia).ok).toBe(false);
    for (const ruim of [null, [], {}, cheia, { aparencia: cheia, preco: 5 }, { aparencias: cheia }]) expect(validarPedidoDeAparencia(ruim).ok, JSON.stringify(ruim)).toBe(false);
  });

  it('os erros novos do HTTP: item-invalido e aparencia-invalida', () => {
    for (const erro of ['item-invalido', 'aparencia-invalida']) expect(validarErroDaCarteira({ erro, mensagem: 'x' }).ok, erro).toBe(true);
    expect(validarErroDaCarteira({ erro: 'barba-invalida', mensagem: 'x' }).ok).toBe(false);
    // os de sempre seguem
    for (const erro of ['ja-tem', 'nao-tem', 'saldo-insuficiente', 'preco-mudou']) expect(validarErroDaCarteira({ erro, mensagem: 'x' }).ok, erro).toBe(true);
  });
});

describe('paraVersaoDoCliente: o cliente da versão 9 segue jogando e vê o balão padrão', () => {
  const lugares = [0, 1, 2, 3].map((n) => ({ lugar: n, equipe: n % 2, nome: n < 2 ? `J${n}` : null, conectado: n < 2, anfitriao: n === 0, saldo: 90, skin: SKIN_PADRAO, aparencia: n === 0 ? cheia : n === 1 ? APARENCIA_PADRAO : null }));
  const estado = { tipo: 'estado-sala', codigo: 'K7M2P', modo: '1x1', preset: 'Boteco', fase: 'espera', seq: 0, vez: null, lugares, espectadores: 0, aposta: 10 } as unknown as MsgEstadoSala;

  it('tira a aparência de cada lugar do estado-sala e deixa o resto igual', () => {
    const velho = paraVersaoDoCliente(estado, 9) as MsgEstadoSala;
    for (const l of velho.lugares) expect(Object.keys(l), `lugar ${l.lugar}`).not.toContain('aparencia');
    expect(velho.lugares.map((l) => ({ ...l, aparencia: undefined }))).toEqual(estado.lugares.map((l) => ({ ...l, aparencia: undefined })));
    expect(velho.aposta).toBe(10);
    expect(JSON.stringify(velho)).not.toContain('aparencia');
    // e a mensagem original não foi mexida (a mesma vai aos clientes da versão 10)
    expect(estado.lugares[0]!.aparencia).toEqual(cheia);
  });

  it('para a versão 10 devolve a mesma mensagem, sem copiar', () => {
    expect(paraVersaoDoCliente(estado, 10)).toBe(estado);
  });

  it('as outras mensagens vão como estão; as boas-vindas dizem a versão que o cliente fala', () => {
    const pong: MensagemDaSala = { tipo: 'pong', t: 5 };
    expect(paraVersaoDoCliente(pong, 9)).toBe(pong);
    const boas: MensagemDaSala = { tipo: 'boas-vindas', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', token: 't'.repeat(32), lugar: 0, anfitriao: true };
    expect(paraVersaoDoCliente(boas, 9)).toEqual({ ...boas, versao: 9 });
    expect(paraVersaoDoCliente(boas, 10)).toBe(boas);
  });

  it('o que sobra é uma mensagem válida da sala', () => {
    expect(validarMensagemDaSala(paraVersaoDoCliente(estado, 9)).ok).toBe(true);
  });
});

describe('estadoDaCarteiraParaVersao: o HTTP da carteira para o cliente da versão 9', () => {
  const estado: EstadoCarteira = { ...carteiraBase, balao: { aparencia: cheia, itens: emOrdem([...GRATIS, 'coroa', 'bigodao', 'olho_kawaii', 'dourado']) } };

  it('tira o balão e deixa o resto como está, sem mexer no original', () => {
    const velho = estadoDaCarteiraParaVersao(estado, 9);
    expect(Object.keys(velho)).not.toContain('balao');
    expect(velho).toEqual(carteiraBase);
    expect(estado.balao).toBeDefined();
  });

  it('para a versão 10 devolve o mesmo estado', () => {
    expect(estadoDaCarteiraParaVersao(estado, 10)).toBe(estado);
  });

  it('o que sobra para a 9 é um estado válido', () => {
    expect(validarEstadoDaCarteira(estadoDaCarteiraParaVersao(estado, 9)).ok).toBe(true);
  });

  it('serve também à carteira recém-criada (com o código)', () => {
    const criada = { ...estado, codigo: 'x'.repeat(43) };
    const velho = estadoDaCarteiraParaVersao(criada, 9);
    expect(velho.codigo).toBe(criada.codigo);
    expect(Object.keys(velho)).not.toContain('balao');
  });
});
