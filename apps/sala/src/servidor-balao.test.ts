/**
 * O balão pelo HTTP da carteira (L47), no servidor de verdade: comprar item, equipar aparência, os erros, as defesas de sempre nas
 * rotas novas, e o cliente da versão 9 (sem o cabeçalho de protocolo), que continua recebendo a carteira exatamente como antes.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  APARENCIA_PADRAO,
  CABECALHO_DO_PROTOCOLO,
  PROTOCOLO_VERSAO,
  validarCarteiraCriada,
  validarErroDaCarteira,
  validarEstadoDaCarteira,
  type AparenciaDoBalao,
  type CodigoErroCarteira,
  type EstadoCarteira,
} from '@sinuca/protocolo';
import { AmbienteDeRede } from './para-testes-ws';
import type { Servidor } from './servidor';

const rede = new AmbienteDeRede();
const pastas: string[] = [];
afterAll(() => rede.encerrar());
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

const subir = (): Promise<Servidor> => {
  const pasta = mkdtempSync(join(tmpdir(), 'sala-http-balao-'));
  pastas.push(pasta);
  return rede.subir({ pastaDados: pasta });
};

interface Resposta {
  readonly status: number;
  readonly texto: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly corpo: any;
}

interface Pedido {
  readonly codigo?: string;
  readonly corpo?: string | object;
  /** O cabeçalho de protocolo: `PROTOCOLO_VERSAO` para o cliente novo; sem ele, o cliente da versão 9. */
  readonly versao?: number | string;
  readonly origem?: string | null;
  readonly tipo?: string | null;
}

async function chamar(s: Servidor, metodo: string, caminho: string, p: Pedido = {}): Promise<Resposta> {
  const cabecalhos: Record<string, string> = {};
  if (p.codigo !== undefined) cabecalhos.Authorization = `Bearer ${p.codigo}`;
  const origem = p.origem === undefined ? (metodo === 'GET' ? null : `http://localhost:${s.porta}`) : p.origem;
  if (origem !== null) cabecalhos.Origin = origem;
  if (p.versao !== undefined) cabecalhos[CABECALHO_DO_PROTOCOLO] = String(p.versao);
  let corpo: string | undefined;
  if (p.corpo !== undefined) {
    corpo = typeof p.corpo === 'string' ? p.corpo : JSON.stringify(p.corpo);
    const tipo = p.tipo === undefined ? 'application/json' : p.tipo;
    if (tipo !== null) cabecalhos['Content-Type'] = tipo;
  }
  const r = await fetch(`http://127.0.0.1:${s.porta}${caminho}`, { method: metodo, headers: cabecalhos, body: corpo });
  const texto = await r.text();
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    json = undefined;
  }
  return { status: r.status, texto, corpo: json };
}

const erroDe = (r: Resposta): CodigoErroCarteira => {
  const v = validarErroDaCarteira(r.corpo);
  if (!v.ok) throw new Error(`a resposta não é um erro da carteira: ${r.texto}`);
  return v.valor.erro;
};

/** Uma carteira com `saldo` moedas (o servidor cria com 100). */
async function carteiraComSaldo(s: Servidor, saldo: number): Promise<string> {
  const r = await chamar(s, 'POST', '/carteira', { versao: PROTOCOLO_VERSAO });
  expect(r.status).toBe(201);
  const codigo = (r.corpo as { codigo: string }).codigo;
  if (saldo !== 100) s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: saldo - 100 }]);
  return codigo;
}

const comprar = (s: Servidor, codigo: string, item: string, extra: object = {}) =>
  chamar(s, 'POST', '/carteira/balao/comprar', { codigo, versao: PROTOCOLO_VERSAO, corpo: { item, ...extra } });
const equipar = (s: Servidor, codigo: string, aparencia: unknown) =>
  chamar(s, 'POST', '/carteira/balao/equipar', { codigo, versao: PROTOCOLO_VERSAO, corpo: { aparencia } });
/** Lê a carteira; `null` no lugar da versão é o cliente da 9, que não manda o cabeçalho. */
const ler = (s: Servidor, codigo: string, versao: number | null = PROTOCOLO_VERSAO) => chamar(s, 'GET', '/carteira', { codigo, ...(versao === null ? {} : { versao }) });

const CHEIA: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_kawaii', corDosOlhos: 'dourado' };

describe('GET /carteira: o balão vai a quem declara a versão 10, e a quem não declara nada (a 9) vai a carteira de antes', () => {
  it('com o cabeçalho de protocolo 10: balao com a aparência padrão e os itens grátis, validado pelo esquema', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 100);
    const r = await ler(s, codigo);
    expect(r.status).toBe(200);
    expect(validarEstadoDaCarteira(r.corpo).ok).toBe(true);
    expect(r.corpo.balao).toEqual({ aparencia: APARENCIA_PADRAO, itens: ['olho_normal', 'castanho'] });
  });

  it('sem o cabeçalho (cliente da versão 9): nenhuma chave `balao`, e tudo o mais como sempre foi', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 100);
    const antigo = await ler(s, codigo, null);
    expect(antigo.status).toBe(200);
    expect(Object.keys(antigo.corpo).sort()).toEqual(['estatisticas', 'itens', 'missoes', 'saldo', 'skin', 'skins', 'vitrine']);
    expect(antigo.texto).not.toContain('balao');
    expect(antigo.texto).not.toContain('aparencia');
    expect(validarEstadoDaCarteira(antigo.corpo).ok).toBe(true);
    // o mesmo estado do novo, menos o balão
    const novo = await ler(s, codigo);
    const resto: Record<string, unknown> = { ...novo.corpo };
    delete resto.balao;
    expect(antigo.corpo).toEqual(resto);
  });

  it('cabeçalho que não é um número (ou 9, ou menor) vale como a versão 9; mais novo que a sala vale a da sala', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 100);
    for (const versao of ['', 'dez', '10.5', '9', '8', '0', '-10', '1e1']) {
      const r = await chamar(s, 'GET', '/carteira', { codigo, versao });
      expect(r.status, versao).toBe(200);
      expect(r.corpo, versao).not.toHaveProperty('balao');
    }
    for (const versao of ['10', '11', '99']) {
      const r = await chamar(s, 'GET', '/carteira', { codigo, versao });
      expect(r.corpo, versao).toHaveProperty('balao');
    }
  });

  it('criar a carteira (POST /carteira) e comprar/usar skin seguem a mesma regra: a 9 não recebe o balão, a 10 recebe', async () => {
    const s = await subir();
    const velha = await chamar(s, 'POST', '/carteira');
    expect(velha.status).toBe(201);
    expect(velha.texto).not.toContain('balao');
    expect(validarCarteiraCriada(velha.corpo).ok).toBe(true);
    const nova = await chamar(s, 'POST', '/carteira', { versao: PROTOCOLO_VERSAO });
    expect(nova.corpo.balao).toEqual({ aparencia: APARENCIA_PADRAO, itens: ['olho_normal', 'castanho'] });
    expect(validarCarteiraCriada(nova.corpo).ok).toBe(true);

    const codigo = velha.corpo.codigo as string;
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 400 }]);
    const compra = await chamar(s, 'POST', '/carteira/comprar', { codigo, corpo: { skin: 'ebano' } });
    expect(compra.status).toBe(200);
    expect(compra.texto).not.toContain('balao');
    expect(validarEstadoDaCarteira(compra.corpo).ok).toBe(true);
    const uso = await chamar(s, 'POST', '/carteira/usar', { codigo, corpo: { skin: 'classico' }, versao: PROTOCOLO_VERSAO });
    expect(uso.status).toBe(200);
    expect(uso.corpo).toHaveProperty('balao');
  });
});

describe('POST /carteira/balao/comprar', () => {
  it('compra: desconta o preço do catálogo, guarda o item e devolve o estado completo; não o põe em uso', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 1000);
    const r = await comprar(s, codigo, 'cartola');
    expect(r.status).toBe(200);
    expect(validarEstadoDaCarteira(r.corpo).ok).toBe(true);
    expect(r.corpo.saldo).toBe(1000 - 260);
    expect(r.corpo.balao).toEqual({ aparencia: APARENCIA_PADRAO, itens: ['cartola', 'olho_normal', 'castanho'] });
    // o GET depois vê a mesma coisa
    expect((await ler(s, codigo)).corpo).toEqual(r.corpo);
  });

  it('a resposta da rota nova leva o balão mesmo sem o cabeçalho (só a 10 conhece a rota)', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 1000);
    const r = await chamar(s, 'POST', '/carteira/balao/comprar', { codigo, corpo: { item: 'mel' } });
    expect(r.status).toBe(200);
    expect(r.corpo.balao.itens).toContain('mel');
  });

  it('saldo-insuficiente (402): nada muda; igual ao preço compra e fica em zero', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 499);
    const r = await comprar(s, codigo, 'coroa');
    expect(r.status).toBe(402);
    expect(erroDe(r)).toBe('saldo-insuficiente');
    expect((await ler(s, codigo)).corpo.saldo).toBe(499);
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 1 }]);
    expect((await comprar(s, codigo, 'coroa')).corpo.saldo).toBe(0);
  });

  it('ja-tem (409), inclusive os grátis, e não cobra de novo', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 1000);
    expect((await comprar(s, codigo, 'boina')).status).toBe(200);
    for (const item of ['boina', 'olho_normal', 'castanho']) {
      const r = await comprar(s, codigo, item);
      expect(r.status, item).toBe(409);
      expect(erroDe(r), item).toBe('ja-tem');
    }
    expect((await ler(s, codigo)).corpo.saldo).toBe(1000 - 180);
  });

  it('item-invalido (400): id que não existe, de skin, ou nome de propriedade do Object', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 1000);
    for (const item of ['barba_longa', 'ebano', 'toString', '__proto__', 'Coroa', 'x'.repeat(24)]) {
      const r = await comprar(s, codigo, item);
      expect(r.status, item).toBe(400);
      expect(erroDe(r), item).toBe('item-invalido');
    }
    expect((await ler(s, codigo)).corpo.saldo).toBe(1000);
  });

  it('preco-mudou (409): o preço visto menor que o do catálogo recusa sem cobrar; igual ou maior cobra o do catálogo', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 1000);
    const r = await comprar(s, codigo, 'cartola', { preco: 200 });
    expect(r.status).toBe(409);
    expect(erroDe(r)).toBe('preco-mudou');
    expect((await ler(s, codigo)).corpo.saldo).toBe(1000);
    expect((await comprar(s, codigo, 'cartola', { preco: 5000 })).corpo.saldo).toBe(740);
  });

  it('o corpo malformado, sem item, com chave a mais ou tipo errado é requisicao-invalida (400), sem tocar na carteira', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 1000);
    const corpos: (string | object)[] = ['{', 'null', '[]', '7', {}, { item: 7 }, { item: '' }, { item: 'coroa', skin: 'ebano' }, { skin: 'ebano' }, { item: 'coroa', preco: 0 }, { item: 'coroa', preco: 1.5 }, { item: 'coroa', preco: '500' }];
    for (const corpo of corpos) {
      const r = await chamar(s, 'POST', '/carteira/balao/comprar', { codigo, corpo });
      expect(r.status, JSON.stringify(corpo)).toBe(400);
      expect(erroDe(r), JSON.stringify(corpo)).toBe('requisicao-invalida');
    }
    expect((await ler(s, codigo)).corpo.saldo).toBe(1000);
  });

  it('duas compras do mesmo item ao mesmo tempo: uma passa e nove são ja-tem; o dinheiro sai uma vez só', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 1000);
    const rs = await Promise.all(Array.from({ length: 10 }, () => comprar(s, codigo, 'chapeu_palha')));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 409 && erroDe(r) === 'ja-tem')).toHaveLength(9);
    expect((await ler(s, codigo)).corpo.saldo).toBe(1000 - 160);
  });

  it('compras diferentes ao mesmo tempo que juntas passam do saldo: só entra o que cabe, e o saldo nunca fica negativo', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 400);
    const rs = await Promise.all(['coroa', 'cartola', 'chapeu_panama', 'boina', 'bigode_dali'].map((i) => comprar(s, codigo, i)));
    const saldo = ((await ler(s, codigo)).corpo as EstadoCarteira).saldo;
    expect(saldo).toBeGreaterThanOrEqual(0);
    const gasto = 400 - saldo;
    expect(rs.filter((r) => r.status === 200).length).toBeGreaterThanOrEqual(1);
    expect(rs.filter((r) => r.status !== 200).every((r) => erroDe(r) === 'saldo-insuficiente')).toBe(true);
    expect(gasto).toBeGreaterThan(0);
  });
});

describe('POST /carteira/balao/equipar', () => {
  it('equipa o que a carteira tem; a aparência fica e o GET a mostra', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 5000);
    for (const i of ['coroa', 'bigodao', 'olho_kawaii', 'dourado']) expect((await comprar(s, codigo, i)).status).toBe(200);
    const r = await equipar(s, codigo, CHEIA);
    expect(r.status).toBe(200);
    expect(validarEstadoDaCarteira(r.corpo).ok).toBe(true);
    expect(r.corpo.balao.aparencia).toEqual(CHEIA);
    expect((await ler(s, codigo)).corpo.balao.aparencia).toEqual(CHEIA);
    expect(r.corpo.saldo).toBe(5000 - 500 - 120 - 150 - 80);
  });

  it('os grátis equipa qualquer um, sem ter comprado nada', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 100);
    const r = await equipar(s, codigo, APARENCIA_PADRAO);
    expect(r.status).toBe(200);
  });

  it('nao-tem (409): item pago que a carteira não tem, e a aparência anterior fica inteira', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 5000);
    await comprar(s, codigo, 'coroa');
    await equipar(s, codigo, { ...APARENCIA_PADRAO, chapeu: 'coroa' });
    const r = await equipar(s, codigo, { chapeu: 'coroa', bigode: 'bigode_dali', olhos: 'olho_normal', corDosOlhos: 'castanho' });
    expect(r.status).toBe(409);
    expect(erroDe(r)).toBe('nao-tem');
    expect((await ler(s, codigo)).corpo.balao.aparencia).toEqual({ ...APARENCIA_PADRAO, chapeu: 'coroa' });
  });

  it('aparencia-invalida (400): id que não existe, de outro tipo, campo faltando ou a mais; recusada inteira', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 5000);
    await comprar(s, codigo, 'coroa');
    await equipar(s, codigo, { ...APARENCIA_PADRAO, chapeu: 'coroa' });
    const ruins: unknown[] = [
      { ...APARENCIA_PADRAO, chapeu: 'barba_longa' },
      { ...APARENCIA_PADRAO, chapeu: 'bigodao' },
      { ...APARENCIA_PADRAO, olhos: 'azul' },
      { chapeu: null, bigode: null, olhos: 'olho_normal' },
      { ...APARENCIA_PADRAO, barba: 'longa' },
      { ...APARENCIA_PADRAO, chapeu: 'coroa', corDosOlhos: 'cor_inexistente' },
      null,
      'coroa',
      [],
    ];
    for (const ruim of ruins) {
      const r = await equipar(s, codigo, ruim);
      expect(r.status, JSON.stringify(ruim)).toBe(400);
      expect(erroDe(r), JSON.stringify(ruim)).toBe('aparencia-invalida');
    }
    expect((await ler(s, codigo)).corpo.balao.aparencia).toEqual({ ...APARENCIA_PADRAO, chapeu: 'coroa' });
  });

  it('o pedido sem `aparencia`, com chave a mais ou que não é JSON é requisicao-invalida (400)', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 100);
    for (const corpo of ['{', '[]', {}, CHEIA, { aparencia: CHEIA, extra: 1 }] as (string | object)[]) {
      const r = await chamar(s, 'POST', '/carteira/balao/equipar', { codigo, corpo });
      expect(r.status, JSON.stringify(corpo)).toBe(400);
      expect(erroDe(r), JSON.stringify(corpo)).toBe('requisicao-invalida');
    }
  });

  it('cada carteira equipa a sua: o que uma tem não vale para a outra, e equipar uma não mexe na outra', async () => {
    const s = await subir();
    const ana = await carteiraComSaldo(s, 5000);
    const beto = await carteiraComSaldo(s, 5000);
    await comprar(s, ana, 'coroa');
    expect((await equipar(s, ana, { ...APARENCIA_PADRAO, chapeu: 'coroa' })).status).toBe(200);
    const doBeto = await equipar(s, beto, { ...APARENCIA_PADRAO, chapeu: 'coroa' });
    expect(doBeto.status).toBe(409);
    expect(erroDe(doBeto)).toBe('nao-tem');
    expect((await ler(s, beto)).corpo.balao.aparencia).toEqual(APARENCIA_PADRAO);
    expect((await ler(s, ana)).corpo.balao.aparencia.chapeu).toBe('coroa');
  });

  it('a troca vai à carteira do disco: reiniciar a sala não perde itens nem aparência', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'sala-http-balao-'));
    pastas.push(pasta);
    const s1 = await rede.subir({ pastaDados: pasta });
    const codigo = await carteiraComSaldo(s1, 5000);
    await comprar(s1, codigo, 'bigode_guidao');
    await equipar(s1, codigo, { ...APARENCIA_PADRAO, bigode: 'bigode_guidao' });
    await s1.fechar();
    const s2 = await rede.subir({ pastaDados: pasta });
    const r = await ler(s2, codigo);
    expect(r.corpo.saldo).toBe(5000 - 140);
    expect(r.corpo.balao).toEqual({ aparencia: { ...APARENCIA_PADRAO, bigode: 'bigode_guidao' }, itens: ['bigode_guidao', 'olho_normal', 'castanho'] });
  });
});

describe('as rotas novas têm as defesas de sempre', () => {
  it('exigem o código: sem ele, mal formado ou errado é 401 carteira-invalida, e nada muda', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 1000);
    for (const caminho of ['/carteira/balao/comprar', '/carteira/balao/equipar']) {
      const corpo = caminho.endsWith('comprar') ? { item: 'mel' } : { aparencia: APARENCIA_PADRAO };
      for (const c of [undefined, 'curto', 'x'.repeat(43)]) {
        const r = await chamar(s, 'POST', caminho, { ...(c === undefined ? {} : { codigo: c }), corpo });
        expect(r.status, `${caminho} ${String(c)}`).toBe(401);
        expect(erroDe(r)).toBe('carteira-invalida');
      }
    }
    expect((await ler(s, codigo)).corpo.saldo).toBe(1000);
  });

  it('só POST: GET e outros métodos são 405 com Allow', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 100);
    for (const caminho of ['/carteira/balao/comprar', '/carteira/balao/equipar']) {
      for (const metodo of ['GET', 'PUT', 'DELETE']) {
        const r = await fetch(`http://127.0.0.1:${s.porta}${caminho}`, { method: metodo, headers: { Authorization: `Bearer ${codigo}`, Origin: `http://localhost:${s.porta}` } });
        expect(r.status, `${metodo} ${caminho}`).toBe(405);
        expect(r.headers.get('allow')).toBe('POST');
      }
    }
  });

  it('exigem corpo JSON: sem Content-Type é 415 e nada é comprado; Origin de outro site é 403', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 1000);
    const semTipo = await chamar(s, 'POST', '/carteira/balao/comprar', { codigo, corpo: { item: 'mel' }, tipo: null });
    expect(semTipo.status).toBe(415);
    const deFora = await chamar(s, 'POST', '/carteira/balao/comprar', { codigo, corpo: { item: 'mel' }, origem: 'https://outro-site.example' });
    expect(deFora.status).toBe(403);
    expect((await ler(s, codigo)).corpo.saldo).toBe(1000);
  });

  it('o corpo passa de 1 KB: 413, e nada muda', async () => {
    const s = await subir();
    const codigo = await carteiraComSaldo(s, 1000);
    const r = await chamar(s, 'POST', '/carteira/balao/comprar', { codigo, corpo: JSON.stringify({ item: 'mel', lixo: 'x'.repeat(1100) }) });
    expect(r.status).toBe(413);
    expect((await ler(s, codigo)).corpo.saldo).toBe(1000);
  });

  it('o log da compra e da troca nunca leva o código', async () => {
    const logs: string[] = [];
    const pasta = mkdtempSync(join(tmpdir(), 'sala-http-balao-'));
    pastas.push(pasta);
    const s = await rede.subir({ pastaDados: pasta }, { log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`) });
    const codigo = await carteiraComSaldo(s, 1000);
    await comprar(s, codigo, 'mel');
    await equipar(s, codigo, { ...APARENCIA_PADRAO, corDosOlhos: 'mel' });
    expect(logs.some((l) => l.startsWith('compra-balao '))).toBe(true);
    expect(logs.some((l) => l.startsWith('equipou-balao '))).toBe(true);
    expect(logs.join('\n')).not.toContain(codigo);
  });
});
