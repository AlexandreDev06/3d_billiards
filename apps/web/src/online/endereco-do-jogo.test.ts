import { describe, expect, it } from 'vitest';
import { CHAVE_DA_CARTEIRA } from './carteira';
import { ENDERECO_DO_JOGO, LINK_DE_PRIVACIDADE, destinoDaMudanca, ehEnderecoAntigo, mudarParaOEnderecoNovo } from './endereco-do-jogo';
import { lerFragmentoDaCarteira } from './levar-carteira';
import type { ArmazenamentoMinimo } from '../armazenamento';

const letra = (n: number): string => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[n % 64]!;
const CODIGO = Array.from({ length: 43 }, (_, i) => letra(5 * 7 + i * 3)).join('');
const OUTRO = Array.from({ length: 43 }, (_, i) => letra(9 * 7 + i * 3)).join('');
const ANTIGO = 'sinuca-sala.alexandre-macedo1712.workers.dev';

function armazem(conteudo: Record<string, string> = {}): ArmazenamentoMinimo {
  return { getItem: (k) => conteudo[k] ?? null, setItem: (k, v) => void (conteudo[k] = v), removeItem: (k) => void delete conteudo[k] };
}
const comCarteira = (codigo: string): ArmazenamentoMinimo => armazem({ [CHAVE_DA_CARTEIRA]: JSON.stringify({ versao: 1, codigo }) });

describe('ehEnderecoAntigo: só os *.workers.dev', () => {
  it('o endereço antigo e qualquer workers.dev valem', () => {
    expect(ehEnderecoAntigo(ANTIGO)).toBe(true);
    expect(ehEnderecoAntigo('outro.workers.dev')).toBe(true);
    expect(ehEnderecoAntigo('SINUCA.WORKERS.DEV')).toBe(true);
  });
  it('localhost, 127.0.0.1, ngrok, o endereço novo e imitações não valem', () => {
    for (const h of ['localhost', '127.0.0.1', 'abc.ngrok.app', 'abc.ngrok-free.app', new URL(ENDERECO_DO_JOGO).hostname, 'workers.dev', 'evil-workers.dev', 'workers.dev.evil.com', '192.168.0.2', '']) {
      expect(ehEnderecoAntigo(h), h).toBe(false);
    }
  });
});

describe('destinoDaMudanca', () => {
  it('com carteira: o endereço novo com o código no FRAGMENTO', () => {
    const d = destinoDaMudanca(CODIGO);
    expect(d).toBe(`${ENDERECO_DO_JOGO}#carteira=${CODIGO}`);
    const url = new URL(d);
    expect(url.search).toBe('');
    expect(url.pathname).toBe('/');
    expect(lerFragmentoDaCarteira(url.hash)).toEqual({ tipo: 'codigo', codigo: CODIGO, resto: '' });
  });
  it('sem carteira: o endereço novo puro', () => {
    expect(destinoDaMudanca(undefined)).toBe(ENDERECO_DO_JOGO);
  });
  it('o endereço novo é https e fica numa constante só', () => {
    expect(ENDERECO_DO_JOGO).toBe('https://sinuca.becogames.app/');
    expect(LINK_DE_PRIVACIDADE).toBe('https://becogames.app/privacidade');
  });
});

describe('mudarParaOEnderecoNovo', () => {
  const pedido = (hostname: string, armazenamento: ArmazenamentoMinimo | null, hash = '', search = '') => {
    const trocas: string[] = [];
    const mudou = mudarParaOEnderecoNovo({ hostname, hash, search, replace: (u) => void trocas.push(u) }, armazenamento);
    return { mudou, trocas };
  };

  it('no endereço antigo com carteira: replace para o novo com o código só no fragmento', () => {
    const { mudou, trocas } = pedido(ANTIGO, comCarteira(CODIGO));
    expect(mudou).toBe(true);
    expect(trocas).toEqual([`${ENDERECO_DO_JOGO}#carteira=${CODIGO}`]);
    expect(trocas[0]!.split('#')[0]).not.toContain(CODIGO);
  });
  it('no endereço antigo sem carteira: replace para o novo puro', () => {
    expect(pedido(ANTIGO, armazem()).trocas).toEqual([ENDERECO_DO_JOGO]);
    expect(pedido(ANTIGO, null).trocas).toEqual([ENDERECO_DO_JOGO]);
  });
  it('guardado inválido não vai adiante: endereço novo puro', () => {
    expect(pedido(ANTIGO, armazem({ [CHAVE_DA_CARTEIRA]: JSON.stringify({ versao: 1, codigo: 'lixo' }) })).trocas).toEqual([ENDERECO_DO_JOGO]);
    expect(pedido(ANTIGO, armazem({ [CHAVE_DA_CARTEIRA]: '{quebrado' })).trocas).toEqual([ENDERECO_DO_JOGO]);
  });
  it('a carteira guardada vale mais que um #carteira= do endereço antigo; sem guardada, o do link segue', () => {
    expect(pedido(ANTIGO, comCarteira(CODIGO), `#carteira=${OUTRO}`).trocas).toEqual([`${ENDERECO_DO_JOGO}#carteira=${CODIGO}`]);
    expect(pedido(ANTIGO, armazem(), `#carteira=${OUTRO}`).trocas).toEqual([`${ENDERECO_DO_JOGO}#carteira=${OUTRO}`]);
  });
  it('o convite ?sala=CODIGO passa para o endereço novo, antes do fragmento da carteira', () => {
    expect(pedido(ANTIGO, comCarteira(CODIGO), '', '?sala=K7M2P').trocas).toEqual([`${ENDERECO_DO_JOGO}?sala=K7M2P#carteira=${CODIGO}`]);
    expect(pedido(ANTIGO, armazem(), '', '?sala=K7M2P').trocas).toEqual([`${ENDERECO_DO_JOGO}?sala=K7M2P`]);
    expect(pedido(ANTIGO, armazem(), '', '?sala=k7-m2p').trocas).toEqual([`${ENDERECO_DO_JOGO}?sala=K7M2P`]);
  });
  it('só o parâmetro sala passa, e só com a forma de um código; o resto da busca fica de fora', () => {
    expect(pedido(ANTIGO, armazem(), '', '?dev=1&sala=K7M2P&semente=3&local=1').trocas).toEqual([`${ENDERECO_DO_JOGO}?sala=K7M2P`]);
    for (const search of ['?sala=', '?sala=ABC', '?sala=K7M2P9', '?sala=K70M2', '?sala=<script>', '?dev=1']) {
      const { trocas } = pedido(ANTIGO, comCarteira(CODIGO), '', search);
      expect(trocas[0], search).toBe(`${ENDERECO_DO_JOGO}#carteira=${CODIGO}`);
    }
  });
  it('o código da carteira nunca vai na busca', () => {
    const [url] = pedido(ANTIGO, comCarteira(CODIGO), '', '?sala=K7M2P').trocas;
    expect(new URL(url!).search).toBe('?sala=K7M2P');
    expect(new URL(url!).hash).toBe(`#carteira=${CODIGO}`);
  });
  it('fora do workers.dev nunca redireciona', () => {
    for (const h of ['localhost', '127.0.0.1', 'abc.ngrok.app', 'sinuca.becogames.app']) {
      const { mudou, trocas } = pedido(h, comCarteira(CODIGO));
      expect(mudou, h).toBe(false);
      expect(trocas, h).toEqual([]);
    }
  });
});
