import {
  APARENCIA_PADRAO,
  ITENS_DO_BALAO,
  SALDO_INICIAL,
  aparenciaCabeNosItens,
  ehCodigoDeCarteira,
  itensDaAparencia,
  ordemDoItemDoBalao,
  precoDoItemDoBalao,
  type AparenciaDoBalao,
  type CodigoErroCarteira,
  type IdItemDoBalao,
} from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { CarteiraDoAparelho, textoDoErroDaCarteira, type PedidoHttp, type RespostaHttp } from './carteira';
import { ArmazenamentoFalso, RelogioFalso } from './para-testes';

const CODIGO = Array.from({ length: 43 }, (_, i) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[(i * 3 + 5) % 64]).join('');

interface Chamada {
  readonly url: string;
  readonly init: PedidoHttp;
}

/**
 * A sala como o cliente da versão 10 a vê: só com o cabeçalho `X-Sinuca-Protocolo: 10` a carteira volta com `balao` (sem ele, como a
 * sala de verdade, volta como a da versão 9: sem a chave).
 */
class SalaFalsa {
  readonly chamadas: Chamada[] = [];
  saldo = SALDO_INICIAL;
  itens: IdItemDoBalao[] = ['olho_normal', 'castanho'];
  aparencia: AparenciaDoBalao = { ...APARENCIA_PADRAO };
  cair = false;

  private estado(versao10: boolean): Record<string, unknown> {
    const base = { saldo: this.saldo, skins: ['classico'], skin: 'classico' };
    return versao10 ? { ...base, balao: { aparencia: this.aparencia, itens: this.itens } } : base;
  }

  readonly pedir = async (url: string, init: PedidoHttp): Promise<RespostaHttp> => {
    this.chamadas.push({ url, init });
    if (this.cair) throw new TypeError('Failed to fetch');
    const resposta = (status: number, corpo: unknown): RespostaHttp => ({ ok: status < 300, status, json: async () => corpo });
    const erro = (codigo: CodigoErroCarteira, status: number): RespostaHttp => resposta(status, { erro: codigo, mensagem: 'texto cru do servidor' });
    const v10 = init.headers['X-Sinuca-Protocolo'] === '10';
    if (url === '/carteira' && init.method === 'POST') return resposta(201, { codigo: CODIGO, ...this.estado(v10) });
    if (init.headers.Authorization !== `Bearer ${CODIGO}`) return erro('carteira-invalida', 401);
    if (url === '/carteira' && init.method === 'GET') return resposta(200, this.estado(v10));
    if (url === '/carteira/balao/comprar') {
      const { item } = JSON.parse(init.body ?? '{}') as { item: IdItemDoBalao };
      if (!ITENS_DO_BALAO.some((i) => i.id === item)) return erro('item-invalido', 422);
      if (this.itens.includes(item)) return erro('ja-tem', 409);
      if (this.saldo < precoDoItemDoBalao(item)) return erro('saldo-insuficiente', 402);
      this.saldo -= precoDoItemDoBalao(item);
      this.itens = [...this.itens, item].sort((a, b) => ordemDoItemDoBalao(a) - ordemDoItemDoBalao(b));
      return resposta(200, this.estado(true));
    }
    if (url === '/carteira/balao/equipar') {
      const { aparencia } = JSON.parse(init.body ?? '{}') as { aparencia: AparenciaDoBalao };
      if (!aparenciaCabeNosItens(aparencia, this.itens)) return erro('nao-tem', 409);
      this.aparencia = aparencia;
      return resposta(200, this.estado(true));
    }
    return erro('requisicao-invalida', 404);
  };
}

function montar() {
  const sala = new SalaFalsa();
  const relogio = new RelogioFalso();
  const armazenamento = new ArmazenamentoFalso();
  const carteira = new CarteiraDoAparelho({ armazenamento, pedir: sala.pedir, agendar: relogio.agendar, esperaMaximaMs: 5000 });
  return { sala, carteira };
}

describe('X-Sinuca-Protocolo: 10 em todo /carteira* (o cliente da 10 se declara; sem o cabeçalho a sala o trata como a 9 e nunca manda o balão)', () => {
  it('cria, lê, compra e usa skin, compra item, equipa e confere: todo pedido leva o cabeçalho com o valor 10', async () => {
    const { sala, carteira } = montar();
    await carteira.garantir(); // POST /carteira
    await carteira.garantir(); // GET /carteira
    await carteira.comprar('classico');
    await carteira.usar('classico');
    await carteira.comprarItemDoBalao('mel');
    await carteira.equiparAparencia({ ...APARENCIA_PADRAO, corDosOlhos: 'mel' });
    const outra = await carteira.conferir(CODIGO);
    expect(outra.ok).toBe(true);
    expect(sala.chamadas.length).toBeGreaterThanOrEqual(7);
    for (const c of sala.chamadas) {
      expect(c.url.startsWith('/carteira'), c.url).toBe(true);
      expect(c.init.headers['X-Sinuca-Protocolo'], `${c.init.method} ${c.url}`).toBe('10');
    }
  });

  it('com o cabeçalho a carteira lida traz o balão (aparência e itens)', async () => {
    const { carteira } = montar();
    const r = await carteira.garantir();
    expect(r.ok).toBe(true);
    expect(carteira.estado()?.balao).toEqual({ aparencia: APARENCIA_PADRAO, itens: ['olho_normal', 'castanho'] });
  });
});

describe('CarteiraDoAparelho: o balão', () => {
  it('comprar um item manda { item, preco } com o Bearer e adota o estado: saldo menor, item novo, a mesma aparência', async () => {
    const { sala, carteira } = montar();
    sala.saldo = 1000;
    await carteira.garantir();
    const r = await carteira.comprarItemDoBalao('olho_kawaii', precoDoItemDoBalao('olho_kawaii'));
    expect(r.ok).toBe(true);
    const chamada = sala.chamadas.at(-1)!;
    expect(chamada.url).toBe('/carteira/balao/comprar');
    expect(chamada.init.method).toBe('POST');
    expect(chamada.init.headers.Authorization).toBe(`Bearer ${CODIGO}`);
    expect(JSON.parse(chamada.init.body!)).toEqual({ item: 'olho_kawaii', preco: 150 });
    expect(carteira.estado()!.saldo).toBe(850);
    expect(carteira.estado()!.balao!.itens).toContain('olho_kawaii');
    expect(carteira.estado()!.balao!.aparencia).toEqual(APARENCIA_PADRAO);
  });

  it('saldo curto: a sala recusa, a frase diz quanto falta e o saldo não muda', async () => {
    const { sala, carteira } = montar();
    await carteira.garantir();
    sala.saldo = 100;
    await carteira.garantir();
    const r = await carteira.comprarItemDoBalao('coroa', 500);
    expect(r).toMatchObject({ ok: false, erro: 'saldo-insuficiente' });
    if (!r.ok) {
      expect(r.mensagem).toContain('400');
      expect(r.mensagem).not.toContain('texto cru');
    }
    expect(carteira.estado()!.saldo).toBe(100);
  });

  it('já tem: frase em português do item, não da skin', async () => {
    const { carteira } = montar();
    await carteira.garantir();
    await carteira.comprarItemDoBalao('mel', 40);
    const r = await carteira.comprarItemDoBalao('mel', 40);
    expect(r).toMatchObject({ ok: false, erro: 'ja-tem' });
    if (!r.ok) expect(r.mensagem).toBe('Você já tem esse item.');
  });

  it('id que não é do catálogo do balão nem chega à rede', async () => {
    const { sala, carteira } = montar();
    await carteira.garantir();
    const antes = sala.chamadas.length;
    const r = await carteira.comprarItemDoBalao('barba' as IdItemDoBalao);
    expect(r).toMatchObject({ ok: false, erro: 'item-invalido' });
    expect(sala.chamadas.length).toBe(antes);
  });

  it('equipar manda { aparencia } inteira e adota a resposta', async () => {
    const { sala, carteira } = montar();
    sala.saldo = 1000;
    await carteira.garantir();
    await carteira.comprarItemDoBalao('coroa', 500);
    await carteira.comprarItemDoBalao('bigode_dali', 160);
    const nova: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigode_dali', olhos: 'olho_normal', corDosOlhos: 'castanho' };
    const r = await carteira.equiparAparencia(nova);
    expect(r.ok).toBe(true);
    const chamada = sala.chamadas.at(-1)!;
    expect(chamada.url).toBe('/carteira/balao/equipar');
    expect(JSON.parse(chamada.init.body!)).toEqual({ aparencia: nova });
    expect(carteira.estado()!.balao!.aparencia).toEqual(nova);
  });

  it('equipar o que a carteira não tem: a sala recusa com nao-tem, a frase é do item e a aparência não muda', async () => {
    const { sala, carteira } = montar();
    await carteira.garantir();
    // a tela acha que tem (estado velho), mas a sala diz que não: nada muda
    const r = await carteira.equiparAparencia({ ...APARENCIA_PADRAO, chapeu: 'cartola' });
    expect(r).toMatchObject({ ok: false, erro: 'nao-tem' });
    if (!r.ok) expect(r.mensagem).toBe('Você ainda não tem esse item.');
    expect(sala.aparencia).toEqual(APARENCIA_PADRAO);
    expect(carteira.estado()!.balao!.aparencia).toEqual(APARENCIA_PADRAO);
  });

  it('aparência que não tem a forma do protocolo nem chega à rede', async () => {
    const { sala, carteira } = montar();
    await carteira.garantir();
    const antes = sala.chamadas.length;
    const r = await carteira.equiparAparencia({ chapeu: 'chapeu_x', bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' } as unknown as AparenciaDoBalao);
    expect(r).toMatchObject({ ok: false, erro: 'aparencia-invalida' });
    expect(sala.chamadas.length).toBe(antes);
  });

  it('rede fora: fora-do-ar, e o estado de antes segue valendo', async () => {
    const { sala, carteira } = montar();
    await carteira.garantir();
    sala.cair = true;
    const r = await carteira.comprarItemDoBalao('mel', 40);
    expect(r).toMatchObject({ ok: false, erro: 'fora-do-ar' });
    expect(carteira.estado()!.saldo).toBe(SALDO_INICIAL);
  });

  it('o código da carteira nunca aparece nas mensagens', async () => {
    const { carteira } = montar();
    await carteira.garantir();
    const r = await carteira.comprarItemDoBalao('coroa', 500);
    expect(JSON.stringify(r)).not.toContain(CODIGO);
    expect(ehCodigoDeCarteira(CODIGO)).toBe(true);
  });

  it('tudo o que o item novo precisa da frase de erro tem frase própria (nao-tem e ja-tem falam em item quando é do balão)', () => {
    expect(textoDoErroDaCarteira('nao-tem', undefined, 'balao')).toBe('Você ainda não tem esse item.');
    expect(textoDoErroDaCarteira('ja-tem', undefined, 'balao')).toBe('Você já tem esse item.');
    expect(textoDoErroDaCarteira('saldo-insuficiente', 30, 'balao')).toContain('30');
    expect(textoDoErroDaCarteira('nao-tem')).toBe('Você ainda não tem essa skin.');
    expect(itensDaAparencia(APARENCIA_PADRAO)).toEqual(['olho_normal', 'castanho']);
  });
});
