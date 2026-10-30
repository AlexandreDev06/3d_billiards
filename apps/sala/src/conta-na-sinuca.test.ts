/**
 * O `/conta/*` da sinuca (L61) com um Banco de mentira: o que ela repassa, o que faz na carteira só depois de o Banco dizer que deu certo,
 * o que não faz quando ele recusa, e o que acontece com ele fora do ar. A varredura das excluídas também (ordem, `ate`, páginas, falhas).
 */
import { describe, expect, it } from 'vitest';
import type { PedidoDaConta, RespostaDaConta } from '@sinuca/conta/contrato';
import { MAX_CORPO_DA_CONTA, ehCaminhoDaConta, tratarContaDaSinuca, type BancoDaConta } from './conta-na-sinuca';
import type { PedidoDaCarteira } from './carteira-http';
import { idDoCodigo } from './id-da-carteira';
import { INTERVALO_DA_VARREDURA_MS, LIMITE_POR_CHAMADA, VarreduraDeExcluidas } from './varredura-de-excluidas';

const CODIGO_DE_TESTE = 'Q'.repeat(43);
const TOKEN = 'T'.repeat(43);
const ID_DA_SESSAO = 'd'.repeat(64);

interface Montagem {
  readonly corpo?: string;
  readonly cabecalhos?: Record<string, string>;
  readonly metodo?: string;
}

function pedido(caminho: string, m: Montagem = {}): PedidoDaCarteira {
  const cab = Object.fromEntries(Object.entries(m.cabecalhos ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    metodo: m.metodo ?? 'POST',
    caminho,
    ip: 'chave',
    cabecalho: (n) => cab[n],
    lerCorpo: async () => ({ tipo: 'texto', texto: m.corpo ?? '' }),
    corpoPendente: () => false,
    descartarCorpo: () => {},
  };
}

function mundo(resposta: RespostaDaConta = { status: 200, corpo: { ok: true } }) {
  const vistos: PedidoDaConta[] = [];
  const sessoes: string[] = [];
  const marcadas: string[] = [];
  const apagadas: string[] = [];
  const esquecidas: string[] = [];
  const sessoesEsquecidas: (string | undefined)[] = [];
  const adiadas: string[] = [];
  const logs: string[] = [];
  const estado = { banco: 'ok' as 'ok' | 'fora', falhaNoEfeito: 0 };
  const banco: Pick<BancoDaConta, 'tratar' | 'contaDaSessao'> = {
    tratar: async (p) => {
      if (estado.banco === 'fora') throw new Error('fora');
      vistos.push(p);
      return resposta;
    },
    contaDaSessao: async (t) => {
      sessoes.push(t);
      return t === TOKEN ? { id: ID_DA_SESSAO, nome: 'Ana' } : null;
    },
  };
  const efeitos = {
    marcarDaConta: (id: string) => {
      if (estado.falhaNoEfeito > 0) {
        estado.falhaNoEfeito--;
        throw new Error('falhou');
      }
      marcadas.push(id);
    },
    apagarDaConta: (id: string) => {
      if (estado.falhaNoEfeito > 0) {
        estado.falhaNoEfeito--;
        throw new Error('falhou');
      }
      apagadas.push(id);
    },
    esquecerConta: (id: string, sessao?: string) => {
      if (estado.falhaNoEfeito > 0) {
        estado.falhaNoEfeito--;
        throw new Error('falhou');
      }
      esquecidas.push(id);
      sessoesEsquecidas.push(sessao);
    },
    adiarMarca: (id: string) => {
      adiadas.push(id);
    },
  };
  const tratar = (p: PedidoDaCarteira) => tratarContaDaSinuca({ pedido: p, ipParaOBanco: '203.0.113.9', banco, efeitos, tempoDoCorpoMs: 1000, log: (e) => logs.push(e), prazoDoBancoMs: 200 });
  return { vistos, sessoes, marcadas, apagadas, esquecidas, sessoesEsquecidas, adiadas, logs, estado, tratar };
}

describe('tratarContaDaSinuca: o que repassa', () => {
  it('ehCaminhoDaConta só olha o prefixo', () => {
    expect(ehCaminhoDaConta('/conta/criar')).toBe(true);
    expect(ehCaminhoDaConta('/conta')).toBe(false);
    expect(ehCaminhoDaConta('/contas/x')).toBe(false);
  });

  it('traduz o pedido: ação, método, Origin, IP cru, cookie, corpo e o convidado do Bearer', async () => {
    const m = mundo({ status: 201, corpo: { ok: true }, cookie: 'becogames_sessao=x; HttpOnly' });
    const codigo = 'C'.repeat(43);
    const r = await m.tratar(pedido('/conta/criar', { corpo: '{"a":1}', cabecalhos: { origin: 'https://becogames.app', cookie: 'k=v', authorization: `Bearer ${codigo}` } }));
    expect(r).not.toBe('abortada');
    if (r === 'abortada') return;
    expect(r.status).toBe(201);
    expect(r.cabecalhos['Set-Cookie']).toBe('becogames_sessao=x; HttpOnly');
    expect(r.cabecalhos['Cache-Control']).toBe('no-store');
    expect(m.vistos[0]).toEqual({ acao: 'criar', metodo: 'POST', origem: 'https://becogames.app', ip: '203.0.113.9', cookie: 'k=v', convidado: codigo, corpo: '{"a":1}' });
  });

  it('Bearer que não tem a forma de um código não vira convidado', async () => {
    const m = mundo({ status: 201, corpo: { ok: true } });
    await m.tratar(pedido('/conta/criar', { corpo: '{}', cabecalhos: { authorization: 'Bearer curto' } }));
    expect(m.vistos[0]!.convidado).toBeNull();
    expect(m.marcadas).toEqual([]);
  });

  it('rota desconhecida é 404 e método errado 405, sem falar com o Banco', async () => {
    const m = mundo();
    const a = await m.tratar(pedido('/conta/nada'));
    const b = await m.tratar(pedido('/conta/eu', { metodo: 'POST' }));
    expect(a !== 'abortada' && a.status).toBe(404);
    expect(b !== 'abortada' && b.status).toBe(405);
    expect(m.vistos).toEqual([]);
  });

  it('corpo acima do teto é 413 sem chegar ao Banco', async () => {
    const m = mundo();
    const r = await m.tratar(pedido('/conta/entrar', { cabecalhos: { 'content-length': String(MAX_CORPO_DA_CONTA + 1) } }));
    expect(r !== 'abortada' && r.status).toBe(413);
    expect(m.vistos).toEqual([]);
  });
});

describe('tratarContaDaSinuca: o que faz na carteira', () => {
  const codigo = CODIGO_DE_TESTE;

  it('criar com convidado e 201: marca a carteira do convidado (o id do código)', async () => {
    const m = mundo({ status: 201, corpo: { ok: true } });
    await m.tratar(pedido('/conta/criar', { corpo: '{}', cabecalhos: { authorization: `Bearer ${codigo}` } }));
    expect(m.marcadas).toEqual([idDoCodigo(codigo)]);
  });

  it('criar sem convidado, ou recusado pelo Banco, não marca nada', async () => {
    const a = mundo({ status: 201, corpo: { ok: true } });
    await a.tratar(pedido('/conta/criar', { corpo: '{}' }));
    expect(a.marcadas).toEqual([]);
    const b = mundo({ status: 409, corpo: { erro: 'email-em-uso' } });
    await b.tratar(pedido('/conta/criar', { corpo: '{}', cabecalhos: { authorization: `Bearer ${codigo}` } }));
    expect(b.marcadas).toEqual([]);
  });

  it('excluir com 200: lê a sessão ANTES do Banco e apaga a carteira desse id', async () => {
    const m = mundo({ status: 200, corpo: { ok: true } });
    await m.tratar(pedido('/conta/excluir', { corpo: '{}', cabecalhos: { cookie: `becogames_sessao=${TOKEN}` } }));
    expect(m.sessoes).toEqual([TOKEN]);
    expect(m.apagadas).toEqual([ID_DA_SESSAO]);
  });

  it('excluir recusado (senha errada) ou sem sessão não apaga nada', async () => {
    const a = mundo({ status: 401, corpo: { erro: 'senha-errada' } });
    await a.tratar(pedido('/conta/excluir', { corpo: '{}', cabecalhos: { cookie: `becogames_sessao=${TOKEN}` } }));
    expect(a.apagadas).toEqual([]);
    const b = mundo({ status: 200, corpo: { ok: true } });
    await b.tratar(pedido('/conta/excluir', { corpo: '{}' }));
    expect(b.apagadas).toEqual([]);
  });

  it('o efeito falha uma vez: tenta de novo; falha duas: loga sem desfazer a resposta do Banco', async () => {
    const a = mundo({ status: 200, corpo: { ok: true } });
    a.estado.falhaNoEfeito = 1;
    await a.tratar(pedido('/conta/excluir', { corpo: '{}', cabecalhos: { cookie: `becogames_sessao=${TOKEN}` } }));
    expect(a.apagadas).toEqual([ID_DA_SESSAO]);
    const b = mundo({ status: 200, corpo: { ok: true } });
    b.estado.falhaNoEfeito = 2;
    const r = await b.tratar(pedido('/conta/excluir', { corpo: '{}', cabecalhos: { cookie: `becogames_sessao=${TOKEN}` } }));
    expect(r !== 'abortada' && r.status).toBe(200);
    expect(b.apagadas).toEqual([]);
    expect(b.logs).toContain('conta-apagar-falhou');
  });

  it('sair e excluir com 200 esquecem a conta (a sessão é lida ANTES do Banco); recusado ou sem sessão não esquece nada', async () => {
    for (const acao of ['sair', 'excluir']) {
      const m = mundo({ status: 200, corpo: { ok: true } });
      await m.tratar(pedido(`/conta/${acao}`, { corpo: '{}', cabecalhos: { cookie: `becogames_sessao=${TOKEN}` } }));
      expect(m.sessoes, acao).toEqual([TOKEN]);
      expect(m.esquecidas, acao).toEqual([ID_DA_SESSAO]);
      // L61c: o sair esquece só a sessão que saiu (o Banco apaga só aquela); o excluir leva a conta toda
      expect(m.sessoesEsquecidas, acao).toEqual([acao === 'sair' ? TOKEN : undefined]);
      expect(m.apagadas, acao).toEqual(acao === 'excluir' ? [ID_DA_SESSAO] : []);
      const recusado = mundo({ status: 401, corpo: { erro: 'senha-errada' } });
      await recusado.tratar(pedido(`/conta/${acao}`, { corpo: '{}', cabecalhos: { cookie: `becogames_sessao=${TOKEN}` } }));
      expect(recusado.esquecidas, acao).toEqual([]);
      const semSessao = mundo({ status: 200, corpo: { ok: true } });
      await semSessao.tratar(pedido(`/conta/${acao}`, { corpo: '{}' }));
      expect(semSessao.esquecidas, acao).toEqual([]);
    }
  });

  it('esquecer falha duas vezes: loga e não desfaz a resposta do Banco', async () => {
    const m = mundo({ status: 200, corpo: { ok: true } });
    m.estado.falhaNoEfeito = 2;
    const r = await m.tratar(pedido('/conta/sair', { corpo: '{}', cabecalhos: { cookie: `becogames_sessao=${TOKEN}` } }));
    expect(r !== 'abortada' && r.status).toBe(200);
    expect(m.logs).toContain('conta-esquecer-falhou');
  });

  it('a marca que falhou duas vezes fica pendente (adiarMarca) em vez de só ir ao log', async () => {
    const m = mundo({ status: 201, corpo: { ok: true } });
    m.estado.falhaNoEfeito = 2;
    await m.tratar(pedido('/conta/criar', { corpo: '{}', cabecalhos: { authorization: `Bearer ${codigo}` } }));
    expect(m.marcadas).toEqual([]);
    expect(m.logs).toContain('conta-marca-falhou');
    expect(m.adiadas).toEqual([idDoCodigo(codigo)]);
    const bom = mundo({ status: 201, corpo: { ok: true } });
    await bom.tratar(pedido('/conta/criar', { corpo: '{}', cabecalhos: { authorization: `Bearer ${codigo}` } }));
    expect(bom.adiadas).toEqual([]);
  });

  it('Banco fora do ar: 503 com Retry-After e nada na carteira', async () => {
    const m = mundo({ status: 201, corpo: { ok: true } });
    m.estado.banco = 'fora';
    const r = await m.tratar(pedido('/conta/criar', { corpo: '{}', cabecalhos: { authorization: `Bearer ${codigo}` } }));
    expect(r !== 'abortada' && r.status).toBe(503);
    expect(r !== 'abortada' && r.cabecalhos['Retry-After']).toBe(30);
    expect(m.marcadas).toEqual([]);
    expect(m.logs).toContain('conta-fora');
  });
});

describe('VarreduraDeExcluidas', () => {
  function varredura(paginas: { ids: string[]; ate: number }[], extra: { falhar?: boolean } = {}) {
    let agora = 10_000_000;
    let ate = 0;
    const chamadas: [number, number][] = [];
    const apagados: string[][] = [];
    const logs: string[] = [];
    const v = new VarreduraDeExcluidas({
      banco: {
        excluidasDesde: async (ms, limite) => {
          chamadas.push([ms, limite]);
          if (extra.falhar) throw new Error('banco fora');
          return paginas.shift() ?? { ids: [], ate: ms };
        },
      },
      apagar: (ids, n) => {
        apagados.push([...ids]);
        ate = n;
        return ids.length;
      },
      relogio: () => agora,
      log: (e) => logs.push(e),
      lerAte: () => ate,
    });
    return { v, chamadas, apagados, logs, ate: () => ate, avancar: (ms: number) => void (agora += ms) };
  }

  it('apaga o que o Banco diz e guarda onde parou', async () => {
    const t = varredura([{ ids: ['a', 'b'], ate: 777 }]);
    expect(await t.v.varrer(true)).toBe(2);
    expect(t.apagados).toEqual([['a', 'b']]);
    expect(t.ate()).toBe(777);
    expect(t.chamadas[0]).toEqual([0, LIMITE_POR_CHAMADA]);
    expect(t.logs).toContain('varredura-de-excluidas');
  });

  it('no alarm, só uma vez por hora; ao acordar (forcar) sempre', async () => {
    const t = varredura([]);
    await t.v.varrer();
    await t.v.varrer();
    expect(t.chamadas).toHaveLength(1);
    t.avancar(INTERVALO_DA_VARREDURA_MS - 1);
    await t.v.varrer();
    expect(t.chamadas).toHaveLength(1);
    t.avancar(1);
    await t.v.varrer();
    expect(t.chamadas).toHaveLength(2);
    await t.v.varrer(true);
    expect(t.chamadas).toHaveLength(3);
  });

  it('página cheia continua do `ate` devolvido; página curta para', async () => {
    const cheia = Array.from({ length: LIMITE_POR_CHAMADA }, (_, i) => `id${i}`);
    const t = varredura([{ ids: cheia, ate: 100 }, { ids: ['z'], ate: 200 }]);
    expect(await t.v.varrer(true)).toBe(LIMITE_POR_CHAMADA + 1);
    expect(t.chamadas.map((c) => c[0])).toEqual([0, 100]);
    expect(t.ate()).toBe(200);
  });

  it('página cheia que não anda não vira laço sem fim', async () => {
    const cheia = Array.from({ length: LIMITE_POR_CHAMADA }, (_, i) => `id${i}`);
    const t = varredura(Array.from({ length: 50 }, () => ({ ids: cheia, ate: 0 })));
    await t.v.varrer(true);
    expect(t.chamadas).toHaveLength(1);
  });

  it('Banco fora do ar: nunca lança, loga e não anda o ponto', async () => {
    const t = varredura([], { falhar: true });
    expect(await t.v.varrer(true)).toBe(0);
    expect(t.logs).toContain('varredura-de-excluidas-falhou');
    expect(t.ate()).toBe(0);
  });

  it('Banco que não responde: desiste no prazo, loga e não segura nada', async () => {
    const logs: string[] = [];
    const v = new VarreduraDeExcluidas({
      banco: { excluidasDesde: () => new Promise(() => {}) },
      apagar: () => 0,
      relogio: () => 1,
      log: (e) => logs.push(e),
      lerAte: () => 0,
      prazoMs: 20,
    });
    expect(await v.varrer(true)).toBe(0);
    expect(logs).toContain('varredura-de-excluidas-falhou');
  });

  it('duas chamadas juntas dividem a mesma varredura', async () => {
    const t = varredura([{ ids: ['a'], ate: 5 }]);
    const [x, y] = await Promise.all([t.v.varrer(true), t.v.varrer(true)]);
    expect([x, y]).toEqual([1, 1]);
    expect(t.chamadas).toHaveLength(1);
  });
});
