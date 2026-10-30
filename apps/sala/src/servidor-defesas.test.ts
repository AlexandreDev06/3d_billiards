import { afterEach, describe, expect, it, vi } from 'vitest';
import { bytesDeGravacaoBomba, quadroBinario } from '../../../packages/protocolo/src/para-testes';
import { decodificarGravacao } from '../../../packages/protocolo/src/gravacao-codec';
import { PRESET_BOTECO } from '@sinuca/regras';
import { tacadaDaVisao } from './para-testes';
import { AmbienteDeRede, httpBruto } from './para-testes-ws';

vi.mock('../../../packages/protocolo/src/gravacao-codec', async (original) => {
  const m = await original<typeof import('../../../packages/protocolo/src/gravacao-codec')>();
  return { ...m, decodificarGravacao: vi.fn(m.decodificarGravacao) };
});

const rede = new AmbienteDeRede();
afterEach(async () => {
  vi.mocked(decodificarGravacao).mockClear();
});
import { afterAll } from 'vitest';
afterAll(() => rede.encerrar());

const forjado = (i: number, real: string) => ({ headers: { 'X-Forwarded-For': `10.9.9.${i}, ${real}` } });

describe('A2 — IP do cliente atrás do proxy: vale o último item do X-Forwarded-For', () => {
  it('forjado, real: trocar o primeiro item não fura o limite por IP', async () => {
    const s = await rede.subir({ maxConexoesPorIp: 3 });
    for (let i = 0; i < 3; i++) await rede.conectar(s, `f${i}`, forjado(i, '203.0.113.7'));
    await expect(rede.conectar(s, 'f4', forjado(4, '203.0.113.7'))).rejects.toThrow(/429/);
  });

  it('real diferente, mesmo forjado: IPs diferentes, cada um com o seu limite', async () => {
    const s = await rede.subir({ maxConexoesPorIp: 1 });
    await rede.conectar(s, 'a', forjado(1, '203.0.113.1'));
    await rede.conectar(s, 'b', forjado(1, '203.0.113.2'));
    await expect(rede.conectar(s, 'c', forjado(2, '203.0.113.1'))).rejects.toThrow(/429/);
  });
});

describe('A1.4 — conexões novas por IP por minuto', () => {
  it('o balde de conexões novas não zera ao reconectar: a 4ª em pouco tempo leva 429, até com as anteriores fechadas', async () => {
    const s = await rede.subir({ conexoesNovasPorIp: { capacidade: 3, porSegundo: 0.001 }, maxConexoesPorIp: 50 });
    for (let i = 0; i < 3; i++) {
      const c = await rede.conectar(s, `r${i}`, forjado(0, '203.0.113.50'));
      c.fechar();
      await c.esperarFechar();
    }
    await expect(rede.conectar(s, 'r4', forjado(0, '203.0.113.50'))).rejects.toThrow(/429/);
    const outro = await rede.conectar(s, 'outro', forjado(0, '203.0.113.51'));
    expect(outro.fechou).toBeNull();
  });
});

describe('A1.1 — tetos por tipo de quadro e custo por tamanho', () => {
  it('texto acima de 16 KB é recusado com mensagem-grande, a conexão continua e a tolerância gasta', async () => {
    const s = await rede.subir({ tolerancia: { capacidade: 12, porSegundo: 0.001 } });
    const c = await rede.conectar(s);
    c.enviarBruto(' '.repeat(16 * 1024 + 1));
    const erro = await c.esperarTipo('erro');
    expect(erro.codigo).toBe('mensagem-grande');
    expect(c.fechou).toBeNull();
    // peso 5: a terceira estoura os 12 de tolerância
    c.enviarBruto(' '.repeat(20_000));
    c.enviarBruto(' '.repeat(20_000));
    expect((await c.esperarFechar()).codigo).toBe(1008);
  });

  it('JSON aninhado de 512 KB (a bomba de CPU) nem é interpretado: recusado na hora, atacante derrubado', async () => {
    const s = await rede.subir({ tolerancia: { capacidade: 12, porSegundo: 0.001 } });
    const c = await rede.conectar(s);
    const bomba = '['.repeat(256 * 1024) + ']'.repeat(256 * 1024);
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) c.enviarBruto(bomba);
    expect((await c.esperarFechar()).codigo).toBe(1008);
    // a primeira cabe no balde (e é recusada por tamanho); as outras gastam tolerância sem custar CPU
    expect(c.recebidas.some((m) => m.tipo === 'erro' && m.codigo === 'mensagem-grande')).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('cabeçalho de quadro binário acima de 32 KB é recusado sem decodificar nada', async () => {
    const s = await rede.subir();
    const c = await rede.conectar(s);
    c.enviarBruto(quadroBinario('{"tipo":"tacada"}' + ' '.repeat(33 * 1024), new Uint8Array(0)));
    expect((await c.esperarTipo('erro')).codigo).toBe('mensagem-grande');
    expect(decodificarGravacao).not.toHaveBeenCalled();
  });

  it('o custo no balde cresce com os bytes: 3 pings de 16 KB cabem num balde de 6; o 4º não', async () => {
    const s = await rede.subir({ mensagens: { capacidade: 6, porSegundo: 0.001 }, tolerancia: { capacidade: 100, porSegundo: 1 } });
    const c = await rede.conectar(s);
    const grande = '{"tipo":"ping","t":1}' + ' '.repeat(16 * 1024 - 21);
    for (let i = 0; i < 4; i++) c.enviarBruto(grande);
    await c.esperar((m) => m.tipo === 'erro' && m.codigo === 'limite-mensagens');
    expect(c.recebidas.filter((m) => m.tipo === 'pong')).toHaveLength(3);
  });
});

describe('A1.2 — a gravação só é decodificada depois de conferir sala, vez e seq', () => {
  it('tacada de gravação-bomba vinda de quem não está em sala: fora-da-sala, e a gravação nunca é decodificada', async () => {
    const s = await rede.subir();
    const c = await rede.conectar(s);
    const cabecalho = {
      tipo: 'tacada',
      seq: 0,
      parametros: { angulo: 0, velocidadeTaco: 1, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 },
      partida: { config: PRESET_BOTECO.regras, jogadores: [{ id: 'a', nome: 'a', equipe: 0 }, { id: 'b', nome: 'b', equipe: 1 }], vez: 0, grupos: [null, null], fase: 'saida', naMesa: [], encacapadas: [], retiradas: [], vencedor: null },
      mesa: { bolas: [{ id: 0, posicao: { x: 0, y: 0, z: 0 }, velocidade: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 }, orientacao: { x: 0, y: 0, z: 0, w: 1 }, movimento: 'parada', naMesa: true }] },
    };
    c.enviarBruto(quadroBinario(cabecalho, bytesDeGravacaoBomba(3601, 16, 60)));
    expect((await c.esperarTipo('erro')).codigo).toBe('fora-da-sala');
    expect(decodificarGravacao).not.toHaveBeenCalled();
  });

  it('quem não tem a vez, ou erra o seq, também barra antes: nada decodificado, retrato de ressincronia', async () => {
    const s = await rede.subir();
    const ana = await rede.conectar(s, 'Ana');
    const beto = await rede.conectar(s, 'Beto');
    ana.criar();
    const bv = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv.codigo);
    await beto.esperarTipo('boas-vindas');
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all([ana, beto].map((x) => x.esperarTipo('retrato')));
    vi.mocked(decodificarGravacao).mockClear();

    beto.enviar(tacadaDaVisao(beto.visao!)); // fora da vez
    expect((await beto.esperarTipo('erro')).codigo).toBe('nao-e-sua-vez');
    await beto.esperar((m) => m.tipo === 'retrato' && m.motivo === 'ressincronia');
    ana.enviar({ ...tacadaDaVisao(ana.visao!), seq: 5 }); // seq errado
    expect((await ana.esperarTipo('erro')).codigo).toBe('seq-errado');
    expect(decodificarGravacao).not.toHaveBeenCalled();

    // quem pode (vez e seq certos) paga a decodificação, uma vez
    ana.enviar(tacadaDaVisao(ana.visao!));
    await beto.esperar((m) => m.tipo === 'tacada-retransmitida');
    expect(decodificarGravacao).toHaveBeenCalled();
  });
});

describe('A1.4 / M2 — recusas de quem não pode derrubam a conexão', () => {
  it('insistir em mensagens de jogo sem estar numa sala (fora-da-sala) leva ao fechamento 1008', async () => {
    const s = await rede.subir({ tolerancia: { capacidade: 5, porSegundo: 0.001 } });
    const c = await rede.conectar(s);
    for (let i = 0; i < 12; i++) c.enviar({ tipo: 'chat', texto: 'oi' });
    expect((await c.esperarFechar()).codigo).toBe(1008);
    expect(c.recebidas.filter((m) => m.tipo === 'erro' && m.codigo === 'fora-da-sala').length).toBeLessThanOrEqual(6);
  });

  it('adivinhar códigos de sala: 11 tentativas esgotam a tolerância padrão e a conexão cai', async () => {
    const s = await rede.subir();
    const c = await rede.conectar(s);
    for (let i = 0; i < 15; i++) c.entrar('ZZZZZ');
    expect((await c.esperarFechar()).codigo).toBe(1008);
    expect(c.recebidas.filter((m) => m.tipo === 'erro' && m.codigo === 'sala-inexistente').length).toBeLessThanOrEqual(11);
  });

  it('reconectar não zera as tentativas: o orçamento de falhas é por IP', async () => {
    const s = await rede.subir({ falhasPorIp: { capacidade: 4, porSegundo: 0.001 }, conexoesNovasPorIp: { capacidade: 100, porSegundo: 100 } });
    let total = 0;
    for (let rodada = 0; rodada < 6; rodada++) {
      const c = await rede.conectar(s, `t${rodada}`, forjado(0, '203.0.113.99'));
      c.entrar('ZZZZZ');
      c.entrar('ZZZZZ');
      await new Promise((r) => setTimeout(r, 50));
      total += c.recebidas.filter((m) => m.tipo === 'erro' && m.codigo === 'sala-inexistente').length;
      c.derrubar();
    }
    expect(total).toBe(4);
  });
});

describe('A1.5 — permessage-deflate não é negociado', () => {
  it('mesmo que o cliente ofereça, a resposta não traz extensão (sem entrada comprimida)', async () => {
    const s = await rede.subir();
    const c = await rede.conectar(s, 'c', { perMessageDeflate: true });
    expect(c.ws.extensions).toBe('');
    const bruta = await httpBruto(
      s.porta,
      'GET /sala HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Extensions: permessage-deflate; client_max_window_bits\r\n\r\n',
    );
    expect(bruta).toMatch(/^HTTP\/1\.1 101/);
    expect(bruta.toLowerCase()).not.toContain('sec-websocket-extensions');
  });
});

describe('M3 — Origin do upgrade', () => {
  const comOrigem = (origin: string) => ({ headers: { Origin: origin } });

  it('sem Origin passa; a lista padrão (ngrok do usuário, localhost, Vite dev) passa; o próprio servidor passa', async () => {
    const s = await rede.subir();
    await rede.conectar(s, 'sem');
    for (const o of ['https://mayfly-one-mainly.ngrok-free.app', 'http://localhost:8001', 'http://127.0.0.1:5173', 'http://localhost:5174', `http://127.0.0.1:${s.porta}`, `http://localhost:${s.porta}`]) {
      await rede.conectar(s, o, comOrigem(o));
    }
  });

  it('outro site leva 403 e não abre conexão', async () => {
    const s = await rede.subir();
    for (const o of ['https://evil.example', 'http://localhost:9999', 'http://mayfly-one-mainly.ngrok-free.app', 'null']) {
      await expect(rede.conectar(s, o, comOrigem(o)), o).rejects.toThrow(/403/);
    }
    expect(s.registro.totalConexoes).toBe(0);
  });

  it('a lista é configurável: troca a padrão por inteiro', async () => {
    const s = await rede.subir({ origensPermitidas: ['https://meu.example'] });
    await rede.conectar(s, 'ok', comOrigem('https://meu.example'));
    await expect(rede.conectar(s, 'ngrok', comOrigem('https://mayfly-one-mainly.ngrok-free.app'))).rejects.toThrow(/403/);
  });
});

describe('baixos — 503 sem caminho absoluto e Content-Security-Policy no HTML', () => {
  it('sem build, o 503 não revela a pasta', async () => {
    const s = await rede.subir({ pastaWeb: '/home/alguem/segredo/projeto/apps/web/dist' });
    const r = await fetch(`http://127.0.0.1:${s.porta}/`);
    expect(r.status).toBe(503);
    const corpo = await r.text();
    expect(corpo).toContain('pnpm');
    expect(corpo).not.toContain('/home/');
    expect(corpo).not.toContain('segredo');
  });

  async function csp(porta: number, host: string, caminho = '/'): Promise<string> {
    const bruta = await httpBruto(porta, `GET ${caminho} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
    return /content-security-policy: ([^\r\n]*)/i.exec(bruta)?.[1] ?? '';
  }

  it('o HTML (e o fallback de SPA) leva CSP fechada: scripts só do próprio site, sem eval nem inline, wss para o mesmo host', async () => {
    const s = await rede.subir();
    for (const caminho of ['/', '/sala/ABCDE', '/index.html']) {
      const politica = await csp(s.porta, 'mayfly-one-mainly.ngrok-free.app', caminho);
      expect(politica, caminho).toContain("default-src 'self'");
      expect(politica).toMatch(/script-src 'self'(;|$)/);
      expect(politica).not.toContain('unsafe-eval');
      expect(politica).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(politica).toContain("connect-src 'self' blob: ws://mayfly-one-mainly.ngrok-free.app wss://mayfly-one-mainly.ngrok-free.app");
      expect(politica).toContain("object-src 'none'");
      expect(politica).toContain("frame-ancestors 'none'");
      expect(politica).toContain("base-uri 'none'");
      expect(politica).toContain("img-src 'self' data: blob:");
    }
  });

  it('o Host entra na CSP só se parecer um host; lixo no Host não injeta política', async () => {
    const s = await rede.subir();
    const lixo = await csp(s.porta, "evil.com; script-src *; x='");
    expect(lixo).toContain("connect-src 'self'");
    expect(lixo).not.toContain('evil.com');
    expect(lixo).not.toContain('script-src *');
    const local = await csp(s.porta, `127.0.0.1:${s.porta}`);
    expect(local).toContain(`ws://127.0.0.1:${s.porta} wss://127.0.0.1:${s.porta}`);
  });

  it('L52: a sala Node não libera o AdSense nem com Host sinuca.becogames.app (só o Worker, com nonce, faz isso)', async () => {
    const s = await rede.subir();
    for (const host of ['sinuca.becogames.app', `127.0.0.1:${s.porta}`]) {
      const politica = await csp(s.porta, host);
      expect(politica, host).toMatch(/script-src 'self'(;|$)/);
      expect(politica, host).not.toMatch(/google|doubleclick|googlesyndication|adtrafficquality|nonce|strict-dynamic|frame-src/);
    }
  });

  it('o JS e os assets não precisam de CSP; erros em texto simples seguem com os cabeçalhos de segurança', async () => {
    const s = await rede.subir();
    const r = await fetch(`http://127.0.0.1:${s.porta}/nao-existe.js`);
    expect(r.status).toBe(404);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

