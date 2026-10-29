/** O corpo do pedido do Worker: limite, prazo, UTF-8, e a tradução do `Request` no pedido neutro da carteira. */
import { describe, expect, it } from 'vitest';
import { lerCorpoDoPedido, pedidoDoRequest, respostaDoResultado } from './corpo-do-pedido';

const pedido = (corpo: BodyInit | null, metodo = 'POST') => new Request('https://sala.exemplo/carteira', { method: metodo, ...(corpo === null ? {} : { body: corpo }) });

describe('lerCorpoDoPedido', () => {
  it('sem corpo é texto vazio', async () => {
    expect(await lerCorpoDoPedido(pedido(null, 'GET'), 100, 1000)).toEqual({ tipo: 'texto', texto: '' });
  });

  it('lê o texto inteiro, com acento', async () => {
    expect(await lerCorpoDoPedido(pedido('{"skin":"ébano"}'), 100, 1000)).toEqual({ tipo: 'texto', texto: '{"skin":"ébano"}' });
  });

  it('passou do limite: grande, sem ler o resto (no limite exato ainda cabe)', async () => {
    expect(await lerCorpoDoPedido(pedido('x'.repeat(10)), 10, 1000)).toMatchObject({ tipo: 'texto' });
    expect(await lerCorpoDoPedido(pedido('x'.repeat(11)), 10, 1000)).toEqual({ tipo: 'grande' });
  });

  it('o limite vale mesmo em pedaços pequenos que só juntos passam dele', async () => {
    const pedacos = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 20; i++) c.enqueue(new Uint8Array(1).fill(97));
        c.close();
      },
    });
    const r = new Request('https://sala.exemplo/x', { method: 'POST', body: pedacos, duplex: 'half' } as RequestInit);
    expect(await lerCorpoDoPedido(r, 10, 1000)).toEqual({ tipo: 'grande' });
  });

  it('corpo que não é UTF-8 é ilegível, e o BOM de UTF-8 é tirado como na sala Node', async () => {
    expect(await lerCorpoDoPedido(pedido(new Uint8Array([0xff, 0xfe, 0xfd])), 100, 1000)).toEqual({ tipo: 'ilegivel' });
    const comBom = await lerCorpoDoPedido(pedido(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), 100, 1000);
    expect(comBom).toEqual({ tipo: 'texto', texto: '{}' });
  });

  it('corpo que não termina no prazo é lento', async () => {
    const parado = new ReadableStream<Uint8Array>({ start: (c) => c.enqueue(new Uint8Array([97])) });
    const r = new Request('https://sala.exemplo/x', { method: 'POST', body: parado, duplex: 'half' } as RequestInit);
    const t0 = Date.now();
    expect(await lerCorpoDoPedido(r, 100, 50)).toEqual({ tipo: 'lento' });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('corpo que quebra no meio é abortado', async () => {
    const quebrado = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([97]));
        c.error(new Error('conexão caiu'));
      },
    });
    const r = new Request('https://sala.exemplo/x', { method: 'POST', body: quebrado, duplex: 'half' } as RequestInit);
    expect(await lerCorpoDoPedido(r, 100, 1000)).toEqual({ tipo: 'abortado' });
  });
});

describe('pedidoDoRequest e respostaDoResultado', () => {
  it('traduz método, caminho (sem a query), IP e cabeçalhos em minúsculas, e não tem corpo pendente a fechar', async () => {
    const r = new Request('https://sala.exemplo/carteira/comprar?x=1', { method: 'POST', headers: { Origin: 'https://sala.exemplo', 'Content-Type': 'application/json' }, body: '{}' });
    const p = pedidoDoRequest(r, '1.2.3.4');
    expect(p).toMatchObject({ metodo: 'POST', caminho: '/carteira/comprar', ip: '1.2.3.4' });
    expect(p.cabecalho('origin')).toBe('https://sala.exemplo');
    expect(p.cabecalho('authorization')).toBeUndefined();
    expect(p.corpoPendente()).toBe(false);
    expect(await p.lerCorpo(100, 1000)).toEqual({ tipo: 'texto', texto: '{}' });
  });

  it('a resposta neutra vira Response com status, corpo e cabeçalhos', async () => {
    const resposta = respostaDoResultado({ status: 429, corpo: '{"erro":"limite"}', cabecalhos: { 'Content-Type': 'application/json', 'Retry-After': 60 } });
    expect(resposta.status).toBe(429);
    expect(resposta.headers.get('retry-after')).toBe('60');
    expect(await resposta.text()).toBe('{"erro":"limite"}');
  });
});
