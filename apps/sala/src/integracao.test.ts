import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PROTOCOLO_VERSAO, type MensagemDaSala } from '@sinuca/protocolo';
import { aplicarTacada } from '@sinuca/regras';
import { CONFIG_SALA_PADRAO } from './config';
import { TACADA_FORTE, TACADA_MEDIA, lugarDoJogador, sortearDeTeste, tacadaDaVisao } from './para-testes';
import { ClienteWs } from './para-testes-ws';
import { iniciarServidor, type Servidor } from './servidor';

let pasta: string;
beforeAll(() => {
  pasta = mkdtempSync(join(tmpdir(), 'sala-integracao-'));
  writeFileSync(join(pasta, 'index.html'), '<title>x</title>');
});
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

const servidores: Servidor[] = [];
const clientes: ClienteWs[] = [];
afterEach(async () => {
  for (const c of clientes.splice(0)) c.derrubar();
  await Promise.all(servidores.splice(0).map((s) => s.fechar()));
});

// Sorteio semeado: com sorteio livre ~2% das quebras acabam a partida (a 8 cai) antes da 3ª tacada, e o teste supõe três.
/** Cada servidor tem a sua pasta de dados: a pasta tem um dono só (trava). */
let contadorDePastas = 0;
async function subir(): Promise<Servidor> {
  const s = await iniciarServidor({ ...CONFIG_SALA_PADRAO, porta: 0, pastaWeb: pasta, pastaDados: join(pasta, `dados-${++contadorDePastas}`) }, { registro: { sortear: sortearDeTeste() } });
  servidores.push(s);
  return s;
}

async function cliente(s: Servidor, nome: string): Promise<ClienteWs> {
  const c = await ClienteWs.conectar(s.porta, nome);
  clientes.push(c);
  return c;
}

const doTipo = <T extends MensagemDaSala['tipo']>(c: ClienteWs, tipo: T) => c.recebidas.filter((m): m is Extract<MensagemDaSala, { tipo: T }> => m.tipo === tipo);

describe('integração — dois clientes reais, física real, três tacadas', () => {
  it('jogam três tacadas e terminam com a mesma partida e a mesma mesa; um espectador tardio e uma volta com token recebem o retrato', async () => {
    const s = await subir();
    const ana = await cliente(s, 'Ana');
    const beto = await cliente(s, 'Beto');

    ana.criar('1x1');
    const bvAna = await ana.esperarTipo('boas-vindas');
    expect(bvAna).toMatchObject({ versao: PROTOCOLO_VERSAO, lugar: 0, anfitriao: true });
    beto.entrar(bvAna.codigo);
    expect((await beto.esperarTipo('boas-vindas')).lugar).toBe(1);
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');

    ana.enviar({ tipo: 'iniciar' });
    await Promise.all([ana, beto].map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    const retratoAna = doTipo(ana, 'retrato')[0]!;
    const retratoBeto = doTipo(beto, 'retrato')[0]!;
    expect(retratoBeto.semente).toBe(retratoAna.semente);
    expect(retratoBeto.arrumacao).toEqual(retratoAna.arrumacao);

    const jogadores = [ana, beto];
    const lugaresQueTacaram: number[] = [];
    const tamanhos: number[] = [];
    for (let i = 0; i < 3; i++) {
      const estado = jogadores[0]!.ultimoEstado!;
      expect(estado.seq).toBe(i);
      const quem = jogadores[estado.vez!]!;
      const msg = tacadaDaVisao(quem.visao!, i === 0 ? TACADA_FORTE : TACADA_MEDIA, 30 + i);
      lugaresQueTacaram.push(estado.vez!);
      quem.enviar(msg);
      for (const c of jogadores) await c.esperar((m) => m.tipo === 'tacada-retransmitida' && m.seq === i);
      await Promise.all(jogadores.map((c) => c.esperar((m) => m.tipo === 'estado-sala' && m.seq === i + 1)));
      tamanhos.push(...jogadores.flatMap((c) => c.quadros.filter((q) => q.tipo === 'tacada-retransmitida').map((q) => q.bytes)));
    }

    // os dois acabam iguais
    expect(ana.visao).toEqual(beto.visao);
    expect(ana.visao!.seq).toBe(3);
    expect(doTipo(beto, 'tacada-retransmitida').map((t) => t.lugar)).toEqual(lugaresQueTacaram);
    // as consequências que chegaram são as das regras sobre os eventos que chegaram
    let partida = retratoAna.partida;
    for (const t of doTipo(beto, 'tacada-retransmitida')) {
      const r = aplicarTacada(partida, t.gravacao.eventos);
      expect(t.consequencias).toEqual(r.consequencias);
      expect(t.partida).toEqual(r.partida);
      expect(r.consequencias.proximo).toBe(r.partida.vez);
      partida = r.partida;
    }
    // tamanho no fio: tacada típica < 50 KB; a quebra (primeira) < 150 KB
    expect(Math.max(...tamanhos)).toBeLessThan(150_000);
    expect(tamanhos.slice(2).every((b) => b < 50_000)).toBe(true);

    // espectador tardio
    const esp = await cliente(s, 'Esp');
    esp.entrar(bvAna.codigo);
    const entrada = await esp.esperar((m) => m.tipo === 'retrato' && m.motivo === 'entrada');
    expect(entrada).toMatchObject({ seq: 3, ultima: { seq: 2 } });
    expect(esp.visao).toEqual(ana.visao);
    expect((await esp.esperarTipo('boas-vindas')).lugar).toBeNull();

    // Ana cai e volta com o token
    const token = bvAna.token;
    ana.derrubar();
    await beto.esperar((m) => m.tipo === 'estado-sala' && !m.lugares[0]!.conectado);
    const ana2 = await cliente(s, 'Ana');
    ana2.entrar(bvAna.codigo, token);
    const volta = await ana2.esperarTipo('boas-vindas');
    expect(volta).toMatchObject({ lugar: 0, anfitriao: true, token });
    await ana2.esperar((m) => m.tipo === 'retrato' && m.motivo === 'entrada');
    expect(ana2.visao).toEqual(beto.visao);
    await beto.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.conectado);

    // a partida segue depois da volta
    const estado = beto.ultimoEstado!;
    const quem = estado.vez === 0 ? ana2 : beto;
    quem.enviar(tacadaDaVisao(quem.visao!, TACADA_MEDIA, 77));
    await beto.esperar((m) => m.tipo === 'tacada-retransmitida' && m.seq === 3);
  }, 60_000);

  it('tacada com partida adulterada é recusada e o adversário não recebe nada', async () => {
    const s = await subir();
    const ana = await cliente(s, 'Ana');
    const beto = await cliente(s, 'Beto');
    ana.criar();
    const bv = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv.codigo);
    await beto.esperarTipo('boas-vindas');
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all([ana, beto].map((c) => c.esperarTipo('retrato')));

    const boa = tacadaDaVisao(ana.visao!, TACADA_FORTE, 5);
    ana.enviar({ ...boa, partida: { ...boa.partida, vencedor: 0 } });
    const erro = await ana.esperarTipo('erro');
    expect(erro.codigo).toBe('partida-diverge');
    await ana.esperar((m) => m.tipo === 'retrato' && m.motivo === 'ressincronia');
    expect(doTipo(beto, 'tacada-retransmitida')).toHaveLength(0);

    ana.enviar(boa);
    await beto.esperar((m) => m.tipo === 'tacada-retransmitida' && m.seq === 0);
  }, 30_000);

  it('2x2: os quatro entram, a sala inicia e a primeira tacada vale para todos', async () => {
    const s = await subir();
    const nomes = ['Ana', 'Beto', 'Cida', 'Davi'];
    const todos: ClienteWs[] = [];
    for (const n of nomes) todos.push(await cliente(s, n));
    todos[0]!.criar('2x2');
    const bv = await todos[0]!.esperarTipo('boas-vindas');
    for (const c of todos.slice(1)) {
      c.entrar(bv.codigo);
      await c.esperarTipo('boas-vindas');
    }
    await todos[0]!.esperar((m) => m.tipo === 'estado-sala' && m.lugares.every((l) => l.nome !== null));
    expect(todos.map((c) => c.boasVindas!.lugar)).toEqual([0, 1, 2, 3]);

    todos[0]!.enviar({ tipo: 'iniciar' });
    await Promise.all(todos.map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    expect(todos[0]!.recebidas.find((m) => m.tipo === 'retrato')).toMatchObject({ partida: { jogadores: [{ equipe: 0 }, { equipe: 1 }, { equipe: 0 }, { equipe: 1 }] } });

    todos[0]!.enviar(tacadaDaVisao(todos[0]!.visao!, TACADA_FORTE, 9));
    await Promise.all(todos.map((c) => c.esperar((m) => m.tipo === 'tacada-retransmitida' && m.seq === 0)));
    await Promise.all(todos.map((c) => c.esperar((m) => m.tipo === 'estado-sala' && m.seq === 1)));
    const visoes = todos.map((c) => c.visao);
    for (const v of visoes) expect(v).toEqual(visoes[0]);
    const estado = todos[3]!.ultimoEstado!;
    expect(estado.vez).toBe(lugarDoJogador(visoes[0]!.partida, visoes[0]!.partida.vez));
  }, 30_000);
});

describe('integração — linha e configuração da sala pelo WebSocket real', () => {
  it('a linha vai do criar-sala para o estado de todos; o anfitrião reconfigura na espera e a sala recusa o que não pode', async () => {
    const s = await subir();
    const ana = await cliente(s, 'Ana');
    const beto = await cliente(s, 'Beto');
    ana.criar('1x1', { tempoS: 30 }, { previsao: true, bolaAtingida: true });
    const bv = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv.codigo);
    await beto.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');
    for (const c of [ana, beto]) expect(c.ultimoEstado).toMatchObject({ fase: 'espera', linha: { previsao: true, bolaAtingida: true }, relogio: { tempoS: 30 } });

    ana.enviar({ tipo: 'configurar-sala', modo: '2x2', relogio: { tempoS: 15 }, linha: { bolaAtingida: false } });
    await Promise.all([ana, beto].map((c) => c.esperar((m) => m.tipo === 'estado-sala' && m.modo === '2x2')));
    for (const c of [ana, beto]) expect(c.ultimoEstado).toMatchObject({ modo: '2x2', relogio: { tempoS: 15 }, linha: { previsao: true, bolaAtingida: false } });

    beto.enviar({ tipo: 'configurar-sala', linha: { previsao: false } });
    expect((await beto.esperarTipo('erro')).codigo).toBe('nao-anfitriao');
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    expect((await ana.esperarTipo('erro')).codigo).toBe('fase-errada');
    ana.enviar({ tipo: 'configurar-sala', modo: '3x3' } as never);
    await ana.esperar((m) => m.tipo === 'erro' && m.codigo === 'mensagem-invalida');
    expect(ana.ultimoEstado).toMatchObject({ modo: '2x2', linha: { previsao: true } });
  });
});

describe('integração — emojis pelo WebSocket real', () => {
  it('chega a todos (inclusive a quem soltou e ao espectador), a rajada de 3 passa e a 4ª some sem erro, e o emoji fora da lista é recusado sem derrubar a conexão', async () => {
    const s = await subir();
    const ana = await cliente(s, 'Ana');
    const beto = await cliente(s, 'Beto');
    const esp = await cliente(s, 'Esp');
    ana.criar('1x1');
    const bv = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv.codigo);
    await beto.esperarTipo('boas-vindas');
    esp.entrar(bv.codigo);
    await esp.esperarTipo('boas-vindas');
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all([ana, beto, esp].map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo !== 'ressincronia')));

    esp.enviar({ tipo: 'emoji', emoji: '💩' });
    for (const c of [ana, beto, esp]) {
      expect(await c.esperarTipo('emoji-retransmitido')).toEqual({ tipo: 'emoji-retransmitido', lugar: null, nome: 'Esp', emoji: '💩' });
    }

    // quatro seguidas: o `pong` do `ping` vem depois de todas elas serem tratadas, na mesma conexão
    for (const e of ['😂', '👏', '🔥', '😱'] as const) beto.enviar({ tipo: 'emoji', emoji: e });
    beto.enviar({ tipo: 'ping', t: 1 });
    await beto.esperarTipo('pong');
    await Promise.all([ana, beto, esp].map((c) => c.esperar((m) => m.tipo === 'emoji-retransmitido' && m.emoji === '🔥')));
    const deBeto = (c: ClienteWs) => doTipo(c, 'emoji-retransmitido').filter((m) => m.nome === 'Beto').map((m) => ({ lugar: m.lugar, emoji: m.emoji }));
    for (const c of [ana, beto, esp]) expect(deBeto(c), c.nome).toEqual([{ lugar: 1, emoji: '😂' }, { lugar: 1, emoji: '👏' }, { lugar: 1, emoji: '🔥' }]);
    expect(doTipo(beto, 'erro')).toEqual([]);

    // fora da lista: nem outro emoji, nem texto, nem emoji com modificador de pele chegam a alguém
    const antes = doTipo(ana, 'emoji-retransmitido').length;
    for (const ruim of ['😀', 'oi', '👏🏽']) ana.enviarBruto(JSON.stringify({ tipo: 'emoji', emoji: ruim }));
    await ana.esperar((m) => m.tipo === 'erro' && m.codigo === 'mensagem-invalida');
    ana.enviar({ tipo: 'ping', t: 2 });
    await ana.esperar((m) => m.tipo === 'pong' && m.t === 2);
    expect(doTipo(ana, 'erro').map((e) => e.codigo)).toEqual(['mensagem-invalida', 'mensagem-invalida', 'mensagem-invalida']);
    expect(ana.fechou).toBeNull();
    expect(doTipo(ana, 'emoji-retransmitido')).toHaveLength(antes);
    expect(doTipo(beto, 'emoji-retransmitido')).toHaveLength(antes);

    // a conexão que errou continua a soltar emoji
    ana.enviar({ tipo: 'emoji', emoji: '🎱' });
    expect(await beto.esperar((m) => m.tipo === 'emoji-retransmitido' && m.emoji === '🎱')).toMatchObject({ lugar: 0, nome: 'Ana' });
  }, 30_000);
});
