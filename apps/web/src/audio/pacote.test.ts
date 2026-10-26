import { describe, expect, it } from 'vitest';
import manifestoJson from '../../public/sons/manifesto.json';
import { CONFIG_WEB } from '../config';
import type { PedidoDeSom } from './mapeamento';
import type { Sessao } from './motor-audio';
import { criarSonsDoJogo, type DependenciasDoPacote } from './pacote';

const MANIFESTO: unknown = manifestoJson;
const NOMES = ['taco-bola', 'bola-bola', 'bola-tabela', 'cacapa', 'vez-outro', 'vez-sua', 'tempo-esgotado', 'moedas'] as const;

const pedido = (som: PedidoDeSom['som'], intensidade = 0.9): PedidoDeSom => ({ som, volume: 0.8, tom: 1, intensidade });

function montar(opcoes: { falhar?: (url: string) => boolean; formato?: 'ogg' | 'mp3'; raiz?: string } = {}) {
  const pedidos: string[] = [];
  const decodificados: ArrayBuffer[] = [];
  const avisos: string[] = [];
  const deps: DependenciasDoPacote = {
    raiz: opcoes.raiz ?? '/',
    formato: opcoes.formato ?? 'ogg',
    sortear: () => 0.5,
    aviso: (t) => avisos.push(t),
    buscar: async (url) => {
      pedidos.push(url);
      const falha = opcoes.falhar?.(url) ?? false;
      return {
        ok: !falha,
        status: falha ? 404 : 200,
        json: async () => MANIFESTO,
        arrayBuffer: async () => new ArrayBuffer(16),
      } as Pick<Response, 'ok' | 'status' | 'json' | 'arrayBuffer'>;
    },
  };
  const sons = criarSonsDoJogo(CONFIG_WEB.audio, deps);
  const sessao = {
    saida: {
      ctx: {
        decodeAudioData: async (bytes: ArrayBuffer) => {
          decodificados.push(bytes);
          return { duration: 0.25 } as AudioBuffer;
        },
      },
    },
  } as unknown as Sessao;
  return { sons, sessao, pedidos, decodificados, avisos };
}

describe('criarSonsDoJogo', () => {
  it('tem um gerador para cada som do jogo', () => {
    const { sons } = montar();
    expect(Object.keys(sons.geradores).sort()).toEqual([...NOMES].sort());
  });

  it('antes do contexto abrir (sem gesto) nada é buscado e todo som sai sintetizado', () => {
    const { sons, pedidos } = montar();
    expect(pedidos).toEqual([]);
    for (const nome of NOMES) expect(sons.geradores[nome].preparar(pedido(nome))!.id).toBe(`sintetizado:${nome}`);
  });

  it('abrir o contexto é o que dispara o carregamento: o manifesto é pedido na hora, sem ninguém chamar carregar()', () => {
    const { sons, sessao, pedidos } = montar();
    sons.aoAbrir(sessao);
    expect(pedidos).toEqual(['/sons/manifesto.json']);
    expect(sons.banco.estado).toBe('carregando');
  });

  it('ao abrir o contexto carrega o manifesto e os 13 arquivos ogg, decodificando no contexto, e passa a tocar as amostras', async () => {
    const { sons, sessao, pedidos, decodificados } = montar();
    sons.aoAbrir(sessao);
    await sons.banco.carregar();
    expect(pedidos[0]).toBe('/sons/manifesto.json');
    expect(pedidos.slice(1).every((u) => /^\/sons\/[a-z0-9-]+\.ogg$/.test(u))).toBe(true);
    expect(pedidos).toHaveLength(14);
    expect(decodificados).toHaveLength(13);
    expect(sons.banco.estado).toBe('pronto');
    expect(sons.geradores['bola-bola'].preparar(pedido('bola-bola', 0.95))!.id).toBe('bola-bola-4');
    expect(sons.geradores['taco-bola'].preparar(pedido('taco-bola', 0.1))!.id).toBe('taco-bola-1');
    expect(sons.geradores['cacapa'].preparar(pedido('cacapa', 0.5))!.id).toMatch(/^cacapa-[12]$/);
    expect(sons.geradores['vez-sua'].preparar(pedido('vez-sua'))!.id).toBe('vez-sua');
    expect(sons.geradores['vez-outro'].preparar(pedido('vez-outro'))!.id).toBe('vez-outro');
    expect(sons.geradores['tempo-esgotado'].preparar(pedido('tempo-esgotado'))!.id).toBe('tempo-esgotado');
  });

  it('no navegador sem Vorbis (Safari) busca os mp3', async () => {
    const { sons, sessao, pedidos } = montar({ formato: 'mp3' });
    sons.aoAbrir(sessao);
    await sons.banco.carregar();
    expect(pedidos.slice(1).every((u) => u.endsWith('.mp3'))).toBe(true);
  });

  it('respeita a raiz do site (BASE_URL) no manifesto e nos arquivos', async () => {
    const { sons, sessao, pedidos } = montar({ raiz: '/jogo/' });
    sons.aoAbrir(sessao);
    await sons.banco.carregar();
    expect(pedidos[0]).toBe('/jogo/sons/manifesto.json');
    expect(pedidos.slice(1).every((u) => u.startsWith('/jogo/sons/'))).toBe(true);
  });

  it('arquivo que dá 404 fica na reserva sintetizada; os demais tocam amostra', async () => {
    const { sons, sessao, avisos } = montar({ falhar: (url) => url.endsWith('vez-sua.ogg') });
    sons.aoAbrir(sessao);
    await sons.banco.carregar();
    expect(sons.geradores['vez-sua'].preparar(pedido('vez-sua'))!.id).toBe('sintetizado:vez-sua');
    expect(sons.geradores['vez-outro'].preparar(pedido('vez-outro'))!.id).toBe('vez-outro');
    expect(avisos.some((a) => a.includes('vez-sua'))).toBe(true);
  });

  it('manifesto que dá 404: tudo continua sintetizado, sem lançar', async () => {
    const { sons, sessao, pedidos } = montar({ falhar: (url) => url.endsWith('manifesto.json') });
    sons.aoAbrir(sessao);
    await expect(sons.banco.carregar()).resolves.toBeUndefined();
    expect(sons.banco.estado).toBe('falhou');
    expect(pedidos).toEqual(['/sons/manifesto.json']);
    for (const nome of NOMES) expect(sons.geradores[nome].preparar(pedido(nome))!.id).toBe(`sintetizado:${nome}`);
  });

  it('abrir o contexto duas vezes não carrega duas vezes', async () => {
    const { sons, sessao, pedidos } = montar();
    sons.aoAbrir(sessao);
    sons.aoAbrir(sessao);
    await sons.banco.carregar();
    expect(pedidos).toHaveLength(14);
  });
});
