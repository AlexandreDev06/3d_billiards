import { SALDO_INICIAL } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { CarteiraDoAparelho, CHAVE_DA_CARTEIRA, type PedidoHttp, type RespostaHttp } from './carteira';
import { MENSAGEM_SESSAO_ACABOU } from './mensagens-da-conta';
import { ArmazenamentoFalso, RelogioFalso } from './para-testes';

const CODIGO = 'B'.repeat(43);
const NOVO = 'C'.repeat(43);
const ESTADO = { saldo: 250, skins: ['classico'], skin: 'classico' };

interface Chamada {
  readonly url: string;
  readonly init: PedidoHttp;
}

function montar(opcoes: { codigo?: string; sessaoPerdida?: boolean; respostas: Array<{ status: number; corpo: unknown }> }) {
  const chamadas: Chamada[] = [];
  const fila = [...opcoes.respostas];
  const armazenamento = new ArmazenamentoFalso();
  if (opcoes.codigo) armazenamento.setItem(CHAVE_DA_CARTEIRA, JSON.stringify({ versao: 1, codigo: opcoes.codigo }));
  let perdeu = 0;
  const carteira = new CarteiraDoAparelho({
    armazenamento,
    agendar: new RelogioFalso().agendar,
    sessaoPerdida: () => opcoes.sessaoPerdida ?? false,
    aoPerderASessao: () => void perdeu++,
    pedir: async (url, init): Promise<RespostaHttp> => {
      chamadas.push({ url, init });
      const r = fila.shift() ?? { status: 500, corpo: {} };
      return { ok: r.status < 300, status: r.status, json: async () => r.corpo };
    },
  });
  return { carteira, chamadas, armazenamento, perdeu: () => perdeu };
}

const INVALIDA = { status: 401, corpo: { erro: 'carteira-invalida', mensagem: 'x' } };

describe('CarteiraDoAparelho com a conta', () => {
  it('em modo conta lê a carteira sem código e sem Authorization', async () => {
    const { carteira, chamadas } = montar({ respostas: [{ status: 200, corpo: ESTADO }] });
    carteira.definirModoConta(true);
    const r = await carteira.garantir();
    expect(r.ok).toBe(true);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.url).toBe('/carteira');
    expect(chamadas[0]!.init.method).toBe('GET');
    expect(chamadas[0]!.init.headers.Authorization).toBeUndefined();
    expect(carteira.estado()?.saldo).toBe(250);
  });

  it('em modo conta, carteira-invalida não cria carteira nova', async () => {
    const { carteira, chamadas } = montar({ codigo: CODIGO, respostas: [INVALIDA] });
    carteira.definirModoConta(true);
    const r = await carteira.garantir();
    expect(r).toMatchObject({ ok: false, erro: 'carteira-invalida' });
    expect(chamadas).toHaveLength(1);
    expect(carteira.aviso()).toBeNull();
  });

  it('código que virou conta, sem sessão: não recomeça e avisa a sessão acabada', async () => {
    const { carteira, chamadas, armazenamento, perdeu } = montar({ codigo: CODIGO, sessaoPerdida: true, respostas: [INVALIDA] });
    const r = await carteira.garantir();
    expect(r).toMatchObject({ ok: false, erro: 'sessao-acabou', mensagem: MENSAGEM_SESSAO_ACABOU });
    expect(chamadas).toHaveLength(1);
    expect(perdeu()).toBe(1);
    expect(carteira.aviso()).toBeNull();
    expect(JSON.parse(armazenamento.getItem(CHAVE_DA_CARTEIRA)!).codigo).toBe(CODIGO);
  });

  it('convidado comum com carteira perdida continua ganhando uma nova', async () => {
    const { carteira } = montar({ codigo: CODIGO, respostas: [INVALIDA, { status: 201, corpo: { codigo: NOVO, ...ESTADO, saldo: SALDO_INICIAL } }] });
    const r = await carteira.garantir();
    expect(r.ok).toBe(true);
    expect(carteira.aviso()).not.toBeNull();
  });

  it('comecarDoZero apaga o código velho e cria uma carteira vazia, sem aviso', async () => {
    const { carteira, chamadas, armazenamento } = montar({ codigo: CODIGO, respostas: [{ status: 201, corpo: { codigo: NOVO, ...ESTADO, saldo: SALDO_INICIAL } }] });
    carteira.definirModoConta(true);
    const r = await carteira.comecarDoZero();
    expect(r.ok).toBe(true);
    expect(carteira.modoConta()).toBe(false);
    expect(carteira.codigo()).toBe(NOVO);
    expect(JSON.parse(armazenamento.getItem(CHAVE_DA_CARTEIRA)!).codigo).toBe(NOVO);
    expect(chamadas[0]!.init.method).toBe('POST');
    expect(chamadas[0]!.init.headers.Authorization).toBeUndefined();
    expect(carteira.estado()?.saldo).toBe(SALDO_INICIAL);
    expect(carteira.aviso()).toBeNull();
  });

  it('definirModoConta esquece o estado de antes e avisa', async () => {
    const { carteira } = montar({ codigo: CODIGO, respostas: [{ status: 200, corpo: ESTADO }] });
    await carteira.garantir();
    let vezes = 0;
    carteira.aoMudar(() => void vezes++);
    carteira.definirModoConta(true);
    expect(carteira.estado()).toBeNull();
    expect(vezes).toBe(1);
  });

  it('nunca manda cookie para fora do endereço: o fetch real usa same-origin', async () => {
    const { pedirPeloNavegador } = await import('./carteira');
    const original = globalThis.fetch;
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_u: unknown, i?: RequestInit) => {
      init = i;
      return new Response('{}');
    }) as typeof fetch;
    try {
      await pedirPeloNavegador('/carteira', { method: 'GET', headers: {} });
    } finally {
      globalThis.fetch = original;
    }
    expect(init?.credentials).toBe('same-origin');
  });
});
