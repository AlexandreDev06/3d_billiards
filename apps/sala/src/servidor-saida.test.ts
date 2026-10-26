import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { ClienteWs } from './para-testes-ws';
import { AmbienteDeRede } from './para-testes-ws';
import type { Servidor } from './servidor';

const rede = new AmbienteDeRede();
afterAll(() => rede.encerrar());
afterEach(() => vi.restoreAllMocks());

interface Linha {
  readonly evento: string;
  readonly campos: Record<string, string | number | boolean | null>;
}

/** Sobe um servidor cujo log vai para uma lista, com relógio manual opcional. */
async function subirComLog(config: Parameters<AmbienteDeRede['subir']>[0] = {}, relogio?: () => number): Promise<{ s: Servidor; logs: Linha[] }> {
  const logs: Linha[] = [];
  const s = await rede.subir(config, { log: (evento, campos = {}) => logs.push({ evento, campos: { ...campos } }), ...(relogio ? { relogio } : {}) });
  return { s, logs };
}

async function esperarLinha(logs: Linha[], evento: string, ms = 3000): Promise<Linha> {
  const limite = Date.now() + ms;
  for (;;) {
    const achada = logs.find((l) => l.evento === evento);
    if (achada) return achada;
    if (Date.now() > limite) throw new Error(`o log não ganhou "${evento}"; tem ${logs.map((l) => l.evento).join(', ')}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function salaComAna(s: Servidor): Promise<ClienteWs> {
  const ana = await rede.conectar(s, 'Ana');
  ana.criar();
  await ana.esperarTipo('boas-vindas');
  return ana;
}

describe("log do 'saiu' — por que a conexão caiu", () => {
  it('fechamento limpo do cliente: código, motivo, tempo de conexão e de silêncio, lugar e sala', async () => {
    let agora = 1_000_000;
    const { s, logs } = await subirComLog({}, () => agora);
    const ana = await salaComAna(s);
    const codigo = ana.boasVindas!.codigo;
    agora += 5_000;
    ana.enviar({ tipo: 'ping', t: 1 });
    await ana.esperarTipo('pong');
    agora += 7_000;
    ana.ws.close(1000, 'tchau');
    const saiu = await esperarLinha(logs, 'saiu');
    expect(saiu.campos).toEqual({ sala: codigo, nome: 'Ana', lugar: 0, codigo: 1000, motivo: 'tchau', duracaoS: 12, origem: 'cliente-ou-rede', presos: 0, silencioS: 7 });
  });

  it('o pong do heartbeat conta como sinal de vida: quem responde ao ping não está em silêncio', async () => {
    let agora = 1_000_000;
    const { s, logs } = await subirComLog({ heartbeatMs: 30 }, () => agora);
    const ana = await salaComAna(s);
    agora += 9_000;
    await new Promise((r) => setTimeout(r, 120)); // alguns pings, todos respondidos
    ana.ws.close(1000, 'tchau');
    const saiu = await esperarLinha(logs, 'saiu');
    expect(saiu.campos).toMatchObject({ duracaoS: 9, silencioS: 0 });
  });

  it('conexão derrubada sem fechar (a rede some, o navegador trava): 1006, sem motivo, origem cliente-ou-rede', async () => {
    const { s, logs } = await subirComLog();
    const ana = await salaComAna(s);
    ana.derrubar();
    const saiu = await esperarLinha(logs, 'saiu');
    expect(saiu.campos).toMatchObject({ nome: 'Ana', codigo: 1006, motivo: '', origem: 'cliente-ou-rede' });
  });

  it('o heartbeat que derruba aparece como origem heartbeat, com o silêncio de quem não respondeu', async () => {
    const { s, logs } = await subirComLog({ heartbeatMs: 40 });
    const ana = await rede.conectar(s, 'Ana', { autoPong: false });
    ana.criar();
    await ana.esperarTipo('boas-vindas');
    const saiu = await esperarLinha(logs, 'saiu');
    expect(saiu.campos).toMatchObject({ nome: 'Ana', codigo: 1006, origem: 'heartbeat' });
    expect(saiu.campos.silencioS).toBeGreaterThanOrEqual(0);
  });

  it('quem estoura a tolerância é derrubado pelo servidor (1008): origem tolerancia, com o motivo que o servidor deu', async () => {
    const { s, logs } = await subirComLog({ tolerancia: { capacidade: 3, porSegundo: 0.001 } });
    const ana = await salaComAna(s);
    for (let i = 0; i < 6; i++) ana.enviarBruto('isto não é json');
    const saiu = await esperarLinha(logs, 'saiu');
    expect(saiu.campos).toMatchObject({ nome: 'Ana', codigo: 1008, origem: 'tolerancia' });
    expect(String(saiu.campos.motivo)).toMatch(/demais/);
  });

  it('cliente lento demais (buffer de envio estourado): origem envio-lento, com os bytes presos', async () => {
    const { s, logs } = await subirComLog();
    const ana = await salaComAna(s);
    vi.spyOn(WebSocket.prototype, 'bufferedAmount', 'get').mockReturnValue(5 * 1024 * 1024);
    ana.enviar({ tipo: 'ping', t: 1 }); // a resposta (pong) bate no limite de envio
    const saiu = await esperarLinha(logs, 'saiu');
    expect(saiu.campos).toMatchObject({ nome: 'Ana', origem: 'envio-lento', presos: 5 * 1024 * 1024 });
  });

  it('os bytes presos vêm da amostra do heartbeat, porque na hora de fechar a leitura já volta zerada', async () => {
    let preso = 123_456;
    vi.spyOn(WebSocket.prototype, 'bufferedAmount', 'get').mockImplementation(() => preso);
    const { s, logs } = await subirComLog({ heartbeatMs: 40 });
    const ana = await rede.conectar(s, 'Ana', { autoPong: false });
    ana.ws.once('ping', () => {
      preso = 0; // depois da primeira batida o buffer "esvazia"; a amostra dela é o que sobra no log
    });
    ana.criar();
    await ana.esperarTipo('boas-vindas');
    const saiu = await esperarLinha(logs, 'saiu');
    expect(saiu.campos).toMatchObject({ origem: 'heartbeat', presos: 123_456 });
  });

  it('conexão que nunca entrou numa sala não gera linha de saiu', async () => {
    const { s, logs } = await subirComLog();
    const solto = await rede.conectar(s, 'Solto');
    solto.derrubar();
    await new Promise((r) => setTimeout(r, 150));
    expect(logs.filter((l) => l.evento === 'saiu')).toEqual([]);
  });

  it('o log não leva IP nem token', async () => {
    const { s, logs } = await subirComLog();
    const ana = await salaComAna(s);
    const token = ana.boasVindas!.token;
    ana.ws.close(1000, 'tchau');
    await esperarLinha(logs, 'saiu');
    const tudo = JSON.stringify(logs);
    expect(tudo).not.toContain(token);
    expect(tudo).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });
});

describe("log do 'voltou' — quanto tempo o jogador ficou fora", () => {
  it('diz quanto tempo esteve ausente e se a conexão antiga ainda estava de pé', async () => {
    let agora = 2_000_000;
    const { s, logs } = await subirComLog({}, () => agora);
    const ana = await salaComAna(s);
    const { codigo, token } = ana.boasVindas!;
    ana.derrubar();
    await esperarLinha(logs, 'saiu');
    agora += 20_000;
    const volta = await rede.conectar(s, 'Ana');
    volta.entrar(codigo, token);
    await volta.esperarTipo('boas-vindas');
    const voltou = await esperarLinha(logs, 'voltou');
    expect(voltou.campos).toMatchObject({ nome: 'Ana', lugar: 0, ausenteS: 20, substituiu: false });
  });

  it('voltar com a conexão antiga ainda de pé (o cliente percebeu a queda antes do servidor) marca substituiu', async () => {
    const { s, logs } = await subirComLog();
    const ana = await salaComAna(s);
    const { codigo, token } = ana.boasVindas!;
    const volta = await rede.conectar(s, 'Ana');
    volta.entrar(codigo, token);
    await volta.esperarTipo('boas-vindas');
    const voltou = await esperarLinha(logs, 'voltou');
    expect(voltou.campos).toMatchObject({ nome: 'Ana', ausenteS: 0, substituiu: true });
    expect((await ana.esperarFechar()).codigo).toBe(4000);
  });
});
