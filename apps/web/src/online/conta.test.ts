import { describe, expect, it } from 'vitest';
import { CHAVE_DA_CONTA, ContaDoAparelho, type PedidoDaContaHttp } from './conta';
import type { RespostaHttp } from './carteira';
import { ArmazenamentoFalso, RelogioFalso } from './para-testes';

const CODIGO = 'A'.repeat(43);

interface Chamada {
  readonly url: string;
  readonly init: PedidoDaContaHttp;
}

function montar(respostas: Array<{ status: number; corpo: unknown } | 'cair' | 'pendurar'>, codigo: string | null = CODIGO) {
  const chamadas: Chamada[] = [];
  const fila = [...respostas];
  const armazenamento = new ArmazenamentoFalso();
  const relogio = new RelogioFalso();
  const conta = new ContaDoAparelho({
    armazenamento,
    agendar: relogio.agendar,
    codigoDoConvidado: () => codigo ?? undefined,
    esperaMaximaMs: 1000,
    pedir: async (url, init): Promise<RespostaHttp> => {
      chamadas.push({ url, init });
      const r = fila.shift();
      if (r === 'cair' || r === undefined) throw new TypeError('Failed to fetch');
      if (r === 'pendurar') return new Promise<RespostaHttp>(() => {});
      return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.corpo };
    },
  });
  return { conta, chamadas, armazenamento, relogio };
}

const CONTA = { conta: { nome: 'Ana', email: 'ana@exemplo.com', saldo: 100 } };

describe('ContaDoAparelho', () => {
  it('começa convidado e eu() com 401 continua convidado, com sucesso', async () => {
    const { conta, chamadas } = montar([{ status: 401, corpo: { erro: 'sem-sessao', mensagem: 'Você não está na sua conta.' } }]);
    expect(conta.estado()).toEqual({ tipo: 'convidado' });
    const r = await conta.eu();
    expect(r.ok).toBe(true);
    expect(chamadas[0]!.url).toBe('/conta/eu');
    expect(chamadas[0]!.init.method).toBe('GET');
    expect(chamadas[0]!.init.credentials).toBe('same-origin');
    expect(chamadas[0]!.init.headers.Authorization).toBeUndefined();
  });

  it('eu() com sessão vira conta e avisa', async () => {
    const { conta } = montar([{ status: 200, corpo: CONTA }]);
    const vistos: string[] = [];
    conta.aoMudar((e) => vistos.push(e.tipo));
    await conta.eu();
    expect(conta.estado()).toEqual({ tipo: 'conta', nome: 'Ana', email: 'ana@exemplo.com' });
    expect(vistos).toEqual(['conta']);
    expect(conta.teveConta()).toBe(true);
  });

  it('eu() com a rede caída é fora-do-ar e não muda o estado', async () => {
    const { conta } = montar(['cair']);
    const r = await conta.eu();
    expect(r).toMatchObject({ ok: false, erro: 'fora-do-ar' });
    expect(conta.estado().tipo).toBe('convidado');
  });

  it('criar leva o Bearer do convidado, a senha só no corpo, e vira conta', async () => {
    const { conta, chamadas, armazenamento } = montar([{ status: 201, corpo: CONTA }]);
    const r = await conta.criar({ email: 'ana@exemplo.com', senha: 'segredo123', nome: 'Ana' });
    expect(r.ok).toBe(true);
    const c = chamadas[0]!;
    expect(c.url).toBe('/conta/criar');
    expect(c.init.method).toBe('POST');
    expect(c.init.headers.Authorization).toBe(`Bearer ${CODIGO}`);
    expect(JSON.parse(c.init.body!)).toEqual({ email: 'ana@exemplo.com', senha: 'segredo123', nome: 'Ana' });
    expect(JSON.stringify([...armazenamento.dados])).not.toContain('segredo123');
    expect(JSON.stringify(conta.estado())).not.toContain('segredo123');
  });

  it('criar sem carteira de convidado não leva Authorization', async () => {
    const { conta, chamadas } = montar([{ status: 201, corpo: CONTA }], null);
    await conta.criar({ email: 'a@b.co', senha: '12345678', nome: 'Ana' });
    expect(chamadas[0]!.init.headers.Authorization).toBeUndefined();
  });

  it('entrar não leva o código do convidado', async () => {
    const { conta, chamadas } = montar([{ status: 200, corpo: CONTA }]);
    await conta.entrar({ email: 'a@b.co', senha: '12345678' });
    expect(chamadas[0]!.init.headers.Authorization).toBeUndefined();
    expect(conta.estado().tipo).toBe('conta');
  });

  it('erro da API devolve a mensagem dela e o tenteEmS', async () => {
    const { conta } = montar([{ status: 429, corpo: { erro: 'limite', mensagem: 'Muitas tentativas.', tenteEmS: 90.2 } }]);
    const r = await conta.entrar({ email: 'a@b.co', senha: 'x' });
    expect(r).toEqual({ ok: false, erro: 'limite', mensagem: 'Muitas tentativas.', tenteEmS: 91 });
    expect(conta.estado().tipo).toBe('convidado');
  });

  it('resposta sem a forma esperada é fora-do-ar', async () => {
    const { conta } = montar([{ status: 200, corpo: { conta: { nome: 3 } } }]);
    expect(await conta.entrar({ email: 'a@b.co', senha: 'x' })).toMatchObject({ ok: false, erro: 'fora-do-ar' });
  });

  it('prazo estourado é fora-do-ar', async () => {
    const { conta, relogio } = montar(['pendurar']);
    const p = conta.eu();
    relogio.avancar(1000);
    expect(await p).toMatchObject({ ok: false, erro: 'fora-do-ar' });
  });

  it('sair só vira convidado se o servidor confirmou, e esquece o sinal', async () => {
    const { conta, armazenamento } = montar([{ status: 200, corpo: CONTA }, 'cair', { status: 200, corpo: { ok: true } }]);
    await conta.eu();
    expect((await conta.sair()).ok).toBe(false);
    expect(conta.estado().tipo).toBe('conta');
    expect((await conta.sair()).ok).toBe(true);
    expect(conta.estado().tipo).toBe('convidado');
    expect(armazenamento.getItem(CHAVE_DA_CONTA)).toBeNull();
    expect(conta.teveConta()).toBe(false);
  });

  it('nome troca o nome', async () => {
    const { conta, chamadas } = montar([{ status: 200, corpo: CONTA }, { status: 200, corpo: { conta: { nome: 'Bia', email: 'ana@exemplo.com', saldo: 1 } } }]);
    await conta.eu();
    await conta.nome('Bia');
    expect(JSON.parse(chamadas[1]!.init.body!)).toEqual({ nome: 'Bia' });
    expect(conta.estado()).toEqual({ tipo: 'conta', nome: 'Bia', email: 'ana@exemplo.com' });
  });

  it('nome com sessão vencida (401 sem-sessao) vira convidado', async () => {
    const { conta } = montar([{ status: 200, corpo: CONTA }, { status: 401, corpo: { erro: 'sem-sessao', mensagem: 'Você não está na sua conta.' } }]);
    await conta.eu();
    const r = await conta.nome('Bia');
    expect(r.ok).toBe(false);
    expect(conta.estado().tipo).toBe('convidado');
  });

  it('excluir com senha errada mantém a conta; com a certa vira convidado', async () => {
    const { conta, chamadas } = montar([{ status: 200, corpo: CONTA }, { status: 401, corpo: { erro: 'senha-errada', mensagem: 'Senha errada.' } }, { status: 200, corpo: { ok: true } }]);
    await conta.eu();
    expect(await conta.excluir('errada')).toMatchObject({ ok: false, erro: 'senha-errada', mensagem: 'Senha errada.' });
    expect(conta.estado().tipo).toBe('conta');
    expect((await conta.excluir('certa123')).ok).toBe(true);
    expect(conta.estado().tipo).toBe('convidado');
    expect(JSON.parse(chamadas[2]!.init.body!)).toEqual({ senha: 'certa123' });
  });

  it('esqueci devolve a mensagem da API', async () => {
    const { conta, chamadas } = montar([{ status: 200, corpo: { ok: true, mensagem: 'Se existe uma conta, enviamos o e-mail.' } }]);
    expect(await conta.esqueci('a@b.co')).toEqual({ ok: true, mensagem: 'Se existe uma conta, enviamos o e-mail.' });
    expect(chamadas[0]!.url).toBe('/conta/esqueci');
  });

  it('esquecerSinal apaga o sinal sem rede', async () => {
    const { conta, chamadas } = montar([{ status: 200, corpo: CONTA }]);
    await conta.eu();
    conta.esquecerSinal();
    expect(conta.teveConta()).toBe(false);
    expect(chamadas).toHaveLength(1);
  });
});
