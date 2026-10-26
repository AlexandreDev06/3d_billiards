/**
 * As missões diárias de ponta a ponta (L31), pelo servidor de verdade: carteiras do HTTP, dois clientes WebSocket reais, a
 * física e as regras reais. Um mata-mata de 2 é jogado até o fim, e depois outro na mesma sala: a missão que se cumpre paga o
 * prêmio do nível uma vez, a mensagem `missoes` chega ao dono da carteira e a ninguém mais, o `GET /carteira` mostra o
 * progresso, e repetir a missão no mesmo dia não paga de novo. O relógio do servidor fica num dia escolhido (o de verdade
 * corre a partir dele) para as missões do dia serem as que o teste conhece.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, criarRng, simularTacada, type ParametrosTacada } from '@sinuca/fisica';
import { diaDaMissao, missoesDoDia, premioDaMissao, type IdMissao, type MensagemDaSala, type MsgMissoes, type EstadoCarteira } from '@sinuca/protocolo';
import { PRESET_MATA_MATA } from '@sinuca/regras';
import { numeradasNosEventos, tacadaDaVisao, SEM_LIMITE, type VisaoDoCliente } from './para-testes';
import { AmbienteDeRede, type ClienteWs } from './para-testes-ws';
import type { Servidor } from './servidor';

const rede = new AmbienteDeRede();
const pastas: string[] = [];
afterAll(() => rede.encerrar());
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

const DIA_MS = 86_400_000;

/** O primeiro dia a partir de 26/10/2026 que tem Mão quente de fácil e nenhuma das duas de partida inteira como média ou difícil. */
function diaDoTeste(): string {
  for (let d = 0; d < 1500; d++) {
    const dia = diaDaMissao(Date.parse('2026-10-26T15:00:00Z') + d * DIA_MS);
    const [facil, media, dificil] = missoesDoDia(dia).map((m) => m.id);
    if (facil === 'mao-quente' && media !== 'fecha-a-conta' && dificil !== 'limpinho') return dia;
  }
  throw new Error('nenhum dia serve');
}

async function loja<T = unknown>(s: Servidor, metodo: 'GET' | 'POST', caminho: string, codigo?: string, corpo?: object): Promise<{ status: number; corpo: T }> {
  const cabecalhos: Record<string, string> = {};
  if (codigo) cabecalhos.Authorization = `Bearer ${codigo}`;
  if (metodo === 'POST') cabecalhos.Origin = `http://localhost:${s.porta}`;
  if (corpo) cabecalhos['Content-Type'] = 'application/json';
  const r = await fetch(`http://127.0.0.1:${s.porta}${caminho}`, { method: metodo, headers: cabecalhos, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
  return { status: r.status, corpo: (await r.json()) as T };
}

const criarCarteira = async (s: Servidor): Promise<string> => {
  const r = await loja<{ codigo: string }>(s, 'POST', '/carteira');
  expect(r.status).toBe(201);
  return r.corpo.codigo;
};

/** A tacada que a física acha: encaçapa numeradas sem derrubar a branca; sem nenhuma, um toque de leve. */
function escolher(v: VisaoDoCliente, turno: number) {
  let melhor: { m: ReturnType<typeof tacadaDaVisao>; n: number } | null = null;
  for (const velocidadeTaco of [3, 5, 7]) {
    for (let a = -Math.PI; a < Math.PI; a += 0.03) {
      const p: ParametrosTacada = { angulo: a, velocidadeTaco, efeito: { lateral: 0, vertical: 0.1 }, elevacao: 0, giz: 1 };
      const sim = simularTacada(v.mesa, p, criarRng(11), CONFIG_FISICA_PADRAO);
      const brancaCaiu = sim.eventos.some((e) => (e.tipo === 'cacapa' || e.tipo === 'fora-da-mesa') && e.bola === 0);
      const n = numeradasNosEventos(sim.eventos).length;
      if (brancaCaiu || n === 0) continue;
      if (!melhor || n > melhor.n) melhor = { m: tacadaDaVisao(v, p, 11), n };
      if (n >= 2) return melhor.m;
    }
    if (melhor) return melhor.m;
  }
  return tacadaDaVisao(v, { angulo: 0.3 + turno * 0.7, velocidadeTaco: 1.5, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 }, 11);
}

const depois = (c: ClienteWs, marca: number, serve: (m: MensagemDaSala) => boolean) => c.esperar((m) => c.recebidas.indexOf(m) >= marca && serve(m));
const missoesDe = (c: ClienteWs): MsgMissoes[] => c.recebidas.filter((m): m is MsgMissoes => m.tipo === 'missoes');
const premios = (ids: readonly IdMissao[]): number => ids.reduce((soma, id) => soma + premioDaMissao(id), 0);

describe('missões diárias pelo servidor de verdade: HTTP, WebSocket, física e regras reais', () => {
  it('duas partidas seguidas de mata-mata: a missão cumprida paga o prêmio do nível uma vez, avisa só o dono, aparece no GET /carteira e sobrevive a reiniciar', async () => {
    const dia = diaDoTeste();
    const inicio = Date.parse(`${dia}T15:00:00Z`);
    const t0 = Date.now();
    const relogio = () => inicio + (Date.now() - t0);
    const pastaDados = mkdtempSync(join(tmpdir(), 'sala-integracao-missoes-'));
    pastas.push(pastaDados);
    const logs: string[] = [];
    const log = (evento: string, campos: Record<string, unknown> = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`);
    const s = await rede.subir({ pastaDados }, { log, relogio });

    const codigos = [await criarCarteira(s), await criarCarteira(s)];
    // antes de jogar, o GET /carteira já traz as 3 missões de hoje, zeradas
    for (const codigo of codigos) {
      const { status, corpo } = await loja<EstadoCarteira>(s, 'GET', '/carteira', codigo);
      expect(status).toBe(200);
      expect(corpo.missoes).toMatchObject({ dia, fimMs: Date.parse(`${dia}T15:00:00Z`) - 15 * 3_600_000 + 27 * 3_600_000 });
      expect(corpo.missoes!.itens.map((i) => i.id)).toEqual(missoesDoDia(dia).map((m) => m.id));
      expect(corpo.missoes!.itens.every((i) => i.progresso === 0 && !i.cumprida)).toBe(true);
    }

    const ana = await rede.conectar(s, 'Ana');
    const beto = await rede.conectar(s, 'Beto');
    const cs = [ana, beto];
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras, { aposta: 20, carteira: codigos[0]! });
    const bv = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv.codigo, undefined, codigos[1]);
    await beto.esperarTipo('boas-vindas');
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');

    /** Joga a partida em curso até o fim, conferindo turno a turno quem recebe a mensagem de missões. */
    async function jogarPartida(): Promise<{ vencedor: number; pagas: number[] }> {
      const pagas: number[] = [0, 0];
      for (let turno = 0; turno < 200; turno++) {
        const estado = ana.ultimoEstado!;
        if (estado.vez === null) break;
        expect(estado.seq).toBe(turno);
        const atirador = estado.vez;
        const quem = cs[atirador]!;
        const outro = cs[1 - atirador]!;
        const saldoAntes = estado.lugares[atirador]!.saldo!;
        const marcas = cs.map((c) => c.recebidas.length);
        quem.enviar(escolher(quem.visao!, turno));
        await Promise.all(cs.map((c, i) => depois(c, marcas[i]!, (x) => x.tipo === 'estado-sala' && x.seq === turno + 1)));

        // só o dono da carteira que andou recebe a mensagem de missões; o outro, nenhuma neste turno
        const doTurno = (c: ClienteWs, i: number) => c.recebidas.slice(marcas[i]!).filter((m): m is MsgMissoes => m.tipo === 'missoes');
        expect(doTurno(outro, 1 - atirador), `turno ${turno}: o outro não recebe missões`).toHaveLength(0);
        const meus = doTurno(quem, atirador);
        expect(meus.length, `turno ${turno}`).toBeLessThanOrEqual(1);
        const tipos = quem.recebidas.slice(marcas[atirador]!).map((m) => m.tipo);
        if (meus.length === 1) {
          // a ordem do fio: tacada, (pagamento só no fim), missões, estado
          expect(tipos.indexOf('tacada-retransmitida')).toBeLessThan(tipos.indexOf('missoes'));
          expect(tipos.indexOf('missoes')).toBeLessThan(tipos.lastIndexOf('estado-sala'));
          pagas[atirador]! += premios(meus[0]!.cumpridas);
          // fora do último turno o saldo novo é o antigo mais o prêmio de cada missão que fechou nesta tacada
          const terminou = quem.ultimoEstado!.vez === null;
          if (!terminou) expect(quem.ultimoEstado!.lugares[atirador]!.saldo, `turno ${turno}`).toBe(saldoAntes + premios(meus[0]!.cumpridas));
        } else if (quem.ultimoEstado!.vez !== null) {
          expect(quem.ultimoEstado!.lugares[atirador]!.saldo, `turno ${turno}: sem missão, sem moeda`).toBe(saldoAntes);
        }
      }
      expect(ana.ultimoEstado!.vez, 'a partida não acabou em 200 tacadas').toBeNull();
      const fim = ana.recebidas.filter((m) => m.tipo === 'tacada-retransmitida').at(-1)!;
      if (fim.tipo !== 'tacada-retransmitida') throw new Error('impossível');
      return { vencedor: fim.partida.vencedor!, pagas };
    }

    ana.enviar({ tipo: 'iniciar' });
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    const primeira = await jogarPartida();

    // quem fechou a Mão quente ganhou 50; ninguém pagou a mesma missão duas vezes; o pote foi de 20
    const cumpridasDe = (c: ClienteWs): IdMissao[] => missoesDe(c).flatMap((m) => [...m.cumpridas]);
    for (const c of cs) expect(new Set(cumpridasDe(c)).size, `${c.nome}: nenhuma missão paga duas vezes`).toBe(cumpridasDe(c).length);
    const quemFechou = cs.findIndex((c) => cumpridasDe(c).includes('mao-quente'));
    expect(quemFechou, 'alguém matou 5 bolas numa partida inteira de 15').toBeGreaterThanOrEqual(0);
    const saldoEsperado = (i: number, vencedor: number, extras: number): number => 100 + extras + (i === vencedor ? 20 : -20);
    for (const [i, codigo] of codigos.entries()) {
      const { corpo } = await loja<EstadoCarteira>(s, 'GET', '/carteira', codigo);
      expect(corpo.saldo, cs[i]!.nome).toBe(saldoEsperado(i, primeira.vencedor, premios(cumpridasDe(cs[i]!))));
      // o GET mostra o mesmo quadro que a última mensagem de missões do dono
      const ultima = missoesDe(cs[i]!).at(-1);
      if (ultima) expect(corpo.missoes, cs[i]!.nome).toEqual(ultima.missoes);
      const mao = corpo.missoes!.itens.find((it) => it.id === 'mao-quente')!;
      expect(mao.cumprida, cs[i]!.nome).toBe(cumpridasDe(cs[i]!).includes('mao-quente'));
      if (mao.cumprida) expect(mao.progresso).toBe(mao.meta);
    }
    const paga = await ana.esperar((m) => m.tipo === 'aposta-paga');
    if (paga.tipo !== 'aposta-paga') throw new Error('impossível');
    expect(paga.variacoes.map((v) => v.delta)).toEqual(primeira.vencedor === 0 ? [20, -20] : [-20, 20]);

    // a segunda partida na mesma sala: a Mão quente que já pagou hoje não paga outra vez
    const antes2 = await Promise.all(codigos.map((c) => loja<EstadoCarteira>(s, 'GET', '/carteira', c)));
    const jaPagas = cs.map((c) => cumpridasDe(c));
    const marcasNova = cs.map((c) => c.recebidas.length);
    ana.enviar({ tipo: 'nova-partida' });
    await Promise.all(cs.map((c, i) => depois(c, marcasNova[i]!, (m) => m.tipo === 'retrato' && m.motivo === 'nova-partida')));
    const segunda = await jogarPartida();
    for (const [i, c] of cs.entries()) {
      const novas = missoesDe(c).filter((m) => c.recebidas.indexOf(m) >= marcasNova[i]!).flatMap((m) => [...m.cumpridas]);
      for (const id of novas) expect(jaPagas[i], `${c.nome}: ${id} já tinha pago hoje`).not.toContain(id);
      expect(new Set(novas).size, `${c.nome}: nenhuma missão paga duas vezes na 2ª partida`).toBe(novas.length);
      const { corpo } = await loja<EstadoCarteira>(s, 'GET', '/carteira', codigos[i]!);
      expect(corpo.saldo, c.nome).toBe(antes2[i]!.corpo.saldo + (i === segunda.vencedor ? 20 : -20) + premios(novas));
      // o que estava cumprido segue cumprido, com o mesmo progresso
      for (const item of antes2[i]!.corpo.missoes!.itens.filter((it) => it.cumprida)) {
        expect(corpo.missoes!.itens.find((it) => it.id === item.id), c.nome).toEqual(item);
      }
    }

    // o log `missao`: a sala, o apelido, a missão e as moedas do nível; nunca o código
    const missaoLogs = logs.filter((l) => l.startsWith('missao ')).map((l) => JSON.parse(l.slice(7)) as { sala: string; nome: string; missao: IdMissao; moedas: number });
    expect(missaoLogs.length).toBe(cs.reduce((soma, c) => soma + cumpridasDe(c).length, 0));
    for (const l of missaoLogs) {
      expect(l.sala).toBe(bv.codigo);
      expect(['Ana', 'Beto']).toContain(l.nome);
      expect(l.moedas).toBe(premioDaMissao(l.missao));
    }
    expect(missaoLogs.some((l) => l.missao === 'mao-quente' && l.moedas === 50)).toBe(true);
    const tudo = cs.map((c) => JSON.stringify(c.recebidas)).join('\n') + '\n' + logs.join('\n');
    for (const codigo of codigos) expect(tudo).not.toContain(codigo);
    for (const c of cs) expect(c.invalidas, c.nome).toEqual([]);

    // reiniciar o servidor no mesmo dia: o arquivo guarda o progresso, sem código, e o GET mostra o mesmo quadro
    const antesDeReiniciar = await Promise.all(codigos.map((c) => loja<EstadoCarteira>(s, 'GET', '/carteira', c)));
    await s.fechar();
    const arquivo = readFileSync(join(pastaDados, 'carteiras.json'), 'utf8');
    for (const codigo of codigos) expect(arquivo).not.toContain(codigo);
    expect(arquivo).toContain('"missoes"');
    const reiniciado = await rede.subir({ pastaDados }, { relogio });
    for (const [i, codigo] of codigos.entries()) {
      const { corpo } = await loja<EstadoCarteira>(reiniciado, 'GET', '/carteira', codigo);
      expect(corpo.saldo).toBe(antesDeReiniciar[i]!.corpo.saldo);
      expect(corpo.missoes!.itens).toEqual(antesDeReiniciar[i]!.corpo.missoes!.itens);
    }
  }, 300_000);
});
