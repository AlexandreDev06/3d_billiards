/**
 * A física pelo anfitrião e as estatísticas por carteira de ponta a ponta (L38), pelo servidor de verdade: HTTP da carteira,
 * WebSocket com o decodificador estrito, a sala, a física e as regras reais. Dois clientes: a física chega a todos, uma partida
 * inteira acaba, e as estatísticas aparecem no `GET /carteira` e no resumo público do `estado-sala`, sobrevivem a reiniciar o
 * servidor e não vazam código nem contagem inteira. Uma segunda partida, com a física mexida, paga a aposta e não conta.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, criarRng, simularTacada, type ParametrosTacada } from '@sinuca/fisica';
import { FISICA_DA_SALA_PADRAO, SALDO_INICIAL, validarEstadoDaCarteira, type EstadoCarteira, type MensagemDaSala } from '@sinuca/protocolo';
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

/** O que o navegador da página faz: Origin do próprio servidor nos POST e o código no `Authorization`. */
async function carteiraHttp(s: Servidor, metodo: 'GET' | 'POST', codigo?: string): Promise<{ status: number; corpo: EstadoCarteira & { codigo?: string } }> {
  const cabecalhos: Record<string, string> = {};
  if (codigo) cabecalhos.Authorization = `Bearer ${codigo}`;
  if (metodo === 'POST') cabecalhos.Origin = `http://localhost:${s.porta}`;
  const r = await fetch(`http://127.0.0.1:${s.porta}/carteira`, { method: metodo, headers: cabecalhos });
  return { status: r.status, corpo: (await r.json()) as EstadoCarteira & { codigo?: string } };
}

const criarCarteira = async (s: Servidor): Promise<string> => {
  const r = await carteiraHttp(s, 'POST');
  expect(r.status).toBe(201);
  expect(r.corpo.saldo).toBe(SALDO_INICIAL);
  return r.corpo.codigo!;
};

/** A tacada que a física padrão acha: encaçapa numeradas sem derrubar a branca; sem nenhuma, um toque de leve. */
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

/** Joga a partida até o fim (a física no padrão da sala, que é o que `escolher` simula) e devolve o vencedor. */
async function jogarAteOFim(cs: readonly ClienteWs[]): Promise<number> {
  const [ana] = cs as [ClienteWs, ...ClienteWs[]];
  for (let turno = 0; turno < 200; turno++) {
    const estado = ana.ultimoEstado!;
    if (estado.vez === null) break;
    const seq = estado.seq;
    const quem = cs[estado.vez]!;
    const marcas = cs.map((c) => c.recebidas.length);
    quem.enviar(escolher(quem.visao!, turno));
    await Promise.all(cs.map((c, i) => depois(c, marcas[i]!, (x) => x.tipo === 'estado-sala' && x.seq === seq + 1)));
  }
  expect(ana.ultimoEstado!.vez, 'a partida não acabou em 200 tacadas').toBeNull();
  const fim = ana.recebidas.filter((m) => m.tipo === 'tacada-retransmitida').at(-1)!;
  if (fim.tipo !== 'tacada-retransmitida') throw new Error('impossível');
  expect(fim.partida.fase).toBe('fim');
  return fim.partida.vencedor!;
}

describe('física e estatísticas pelo servidor de verdade: dois clientes ws, carteiras do HTTP, física e regras reais', () => {
  it('a física chega a todos, a partida que conta aparece no GET /carteira e no estado-sala, e a que tem física mexida não conta', async () => {
    const pastaDados = mkdtempSync(join(tmpdir(), 'sala-integracao-estatisticas-'));
    pastas.push(pastaDados);
    const logs: string[] = [];
    const log = (evento: string, campos: Record<string, unknown> = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`);
    const s = await rede.subir({ pastaDados, missoesDiarias: false }, { log });

    const codigos = [await criarCarteira(s), await criarCarteira(s)];
    expect((await carteiraHttp(s, 'GET', codigos[0])).corpo.estatisticas?.total.partidas).toBe(0);

    const ana = await rede.conectar(s, 'Ana');
    const beto = await rede.conectar(s, 'Beto');
    const cs = [ana, beto];
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras, { aposta: 20, carteira: codigos[0]! });
    const bv = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv.codigo, undefined, codigos[1]);
    await beto.esperarTipo('boas-vindas');
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');

    // física: o anfitrião muda na espera e os dois recebem; o convidado não pode; null restaura
    for (const c of cs) expect(c.ultimoEstado, c.nome).toMatchObject({ fisica: FISICA_DA_SALA_PADRAO, fisicaMexida: false, fisicaTravada: false });
    let marcas = cs.map((c) => c.recebidas.length);
    beto.enviar({ tipo: 'configurar-sala', fisica: { atritoRolamento: 0.04 } });
    await beto.esperar((m) => m.tipo === 'erro' && m.codigo === 'nao-anfitriao');
    ana.enviar({ tipo: 'configurar-sala', fisica: { atritoRolamento: 0.03, velocidadeMaxTaco: 99 } });
    await Promise.all(cs.map((c, i) => depois(c, marcas[i]!, (m) => m.tipo === 'estado-sala' && m.fisica?.atritoRolamento === 0.03)));
    for (const c of cs) {
      expect(c.ultimoEstado, c.nome).toMatchObject({ fisicaMexida: true, fisica: { ...FISICA_DA_SALA_PADRAO, atritoRolamento: 0.03, velocidadeMaxTaco: 12 } });
    }
    marcas = cs.map((c) => c.recebidas.length);
    ana.enviar({ tipo: 'configurar-sala', fisica: null });
    await Promise.all(cs.map((c, i) => depois(c, marcas[i]!, (m) => m.tipo === 'estado-sala' && m.fisica?.atritoRolamento === FISICA_DA_SALA_PADRAO.atritoRolamento)));
    for (const c of cs) expect(c.ultimoEstado, c.nome).toMatchObject({ fisica: FISICA_DA_SALA_PADRAO, fisicaMexida: false });

    // partida 1: física padrão, aposta valendo, acaba de verdade
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    for (const c of cs) expect(c.ultimoEstado, c.nome).toMatchObject({ fisicaTravada: true, fisicaMexida: false });
    // com a aposta marcada a física não muda na partida (e a recusa não derruba ninguém)
    const antes = ana.recebidas.length;
    ana.enviar({ tipo: 'configurar-sala', fisica: { atritoRolamento: 0.03 } });
    await ana.esperar((m) => ana.recebidas.indexOf(m) >= antes && m.tipo === 'erro');
    expect(ana.ultimoEstado!.fisica).toEqual(FISICA_DA_SALA_PADRAO);

    const vencedor = await jogarAteOFim(cs);
    const perdedor = 1 - vencedor;
    for (const c of cs) await c.esperar((m) => m.tipo === 'aposta-paga');

    // o resumo público: a partida e a vitória do vencedor (bolas dependem da mesa), igual para os dois, sem o que identifica
    for (const c of cs) {
      const resumo = c.ultimoEstado!.lugares.slice(0, 2).map((l) => l.estatisticas);
      expect(resumo.map((r) => [r?.partidas, r?.vitorias]), c.nome).toEqual([0, 1].map((lugar) => [1, lugar === vencedor ? 1 : 0]));
      for (const r of resumo) expect(Object.keys(r!).sort(), c.nome).toEqual(['bolas', 'partidas', 'vitorias']);
    }
    const bolasDoVencedor = ana.ultimoEstado!.lugares[vencedor]!.estatisticas!.bolas;
    expect(bolasDoVencedor).toBeGreaterThan(0); // mata-mata: ganhou esvaziando a mesa

    // o GET /carteira: total e modalidade batem entre si, o vencedor ganhou 20 e o perdedor nada
    const gv = await carteiraHttp(s, 'GET', codigos[vencedor]);
    const gp = await carteiraHttp(s, 'GET', codigos[perdedor]);
    expect(validarEstadoDaCarteira(gv.corpo).ok).toBe(true);
    expect(gv.corpo.estatisticas!.total).toMatchObject({ partidas: 1, vitorias: 1, bolas: bolasDoVencedor, moedas: 20 });
    expect(gv.corpo.estatisticas!.total.sequencia).toBeGreaterThan(0);
    expect(gv.corpo.estatisticas!.modalidades['mata-mata']).toEqual(gv.corpo.estatisticas!.total);
    expect(gp.corpo.estatisticas!.total).toMatchObject({ partidas: 1, vitorias: 0, moedas: 0 });
    expect(gv.corpo.saldo).toBe(SALDO_INICIAL + 20);
    expect(logs.filter((l) => l.startsWith('estatistica '))).toEqual([expect.stringContaining('"contou":true')]);

    // partida 2, na mesma sala: física mexida na espera; a aposta continua valendo e o saldo muda, a estatística não
    marcas = cs.map((c) => c.recebidas.length);
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    await Promise.all(cs.map((c, i) => depois(c, marcas[i]!, (m) => m.tipo === 'estado-sala' && m.fase === 'espera')));
    marcas = cs.map((c) => c.recebidas.length);
    ana.enviar({ tipo: 'configurar-sala', fisica: { restituicaoBolaTabela: 0.9 } });
    await Promise.all(cs.map((c, i) => depois(c, marcas[i]!, (m) => m.tipo === 'estado-sala' && m.fisica?.restituicaoBolaTabela === 0.9)));
    marcas = cs.map((c) => c.recebidas.length);
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all(cs.map((c, i) => depois(c, marcas[i]!, (m) => m.tipo === 'estado-sala' && m.fase === 'jogando' && m.vez !== null)));
    for (const c of cs) expect(c.ultimoEstado, c.nome).toMatchObject({ fisicaMexida: true, fisicaTravada: true });
    const vencedor2 = await jogarAteOFim(cs);
    for (const c of cs) await c.esperar((m) => m.tipo === 'aposta-paga' && c.recebidas.filter((x) => x.tipo === 'aposta-paga').length === 2);
    // a aposta valeu: quem ganhou a segunda levou 20 do outro
    const saldos = [0, 1].map((lugar) => SALDO_INICIAL + (lugar === vencedor ? 20 : -20) + (lugar === vencedor2 ? 20 : -20));
    expect((await carteiraHttp(s, 'GET', codigos[0])).corpo.saldo).toBe(saldos[0]);
    expect((await carteiraHttp(s, 'GET', codigos[1])).corpo.saldo).toBe(saldos[1]);
    // e a estatística não andou: a partida com a física mexida não conta, nem no GET nem no resumo do estado-sala
    expect((await carteiraHttp(s, 'GET', codigos[vencedor])).corpo.estatisticas!.total).toMatchObject({ partidas: 1, vitorias: 1, moedas: 20 });
    expect((await carteiraHttp(s, 'GET', codigos[perdedor])).corpo.estatisticas!.total).toMatchObject({ partidas: 1, vitorias: 0, moedas: 0 });
    for (const c of cs) expect(c.ultimoEstado!.lugares.slice(0, 2).map((l) => l.estatisticas?.partidas), c.nome).toEqual([1, 1]);
    expect(logs.filter((l) => l.startsWith('estatistica '))).toEqual([expect.stringContaining('"contou":true'), expect.stringContaining('"motivo":"fisica-mexida"')]);

    // ninguém, em nenhum quadro nem log, viu o código de ninguém nem a contagem inteira
    const tudo = cs.map((c) => JSON.stringify(c.recebidas)).join('\n') + '\n' + logs.join('\n');
    for (const codigo of codigos) expect(tudo).not.toContain(codigo);
    expect(tudo).not.toContain('modalidades');
    for (const c of cs) expect(c.invalidas, c.nome).toEqual([]);

    // reiniciar o servidor: o arquivo guarda as estatísticas (e nunca o código) e a carteira volta com elas
    const antesDeReiniciar = [await carteiraHttp(s, 'GET', codigos[0]), await carteiraHttp(s, 'GET', codigos[1])].map((r) => r.corpo.estatisticas);
    await s.fechar();
    const arquivo = readFileSync(join(pastaDados, 'carteiras.json'), 'utf8');
    for (const codigo of codigos) expect(arquivo).not.toContain(codigo);
    expect(arquivo).toContain('estatisticas');
    const depoisDeReiniciar = await rede.subir({ pastaDados, missoesDiarias: false });
    expect((await carteiraHttp(depoisDeReiniciar, 'GET', codigos[0])).corpo.estatisticas).toEqual(antesDeReiniciar[0]);
    expect((await carteiraHttp(depoisDeReiniciar, 'GET', codigos[1])).corpo.estatisticas).toEqual(antesDeReiniciar[1]);

    // e a carteira que voltou do disco senta numa sala nova mostrando o histórico no resumo público
    const volta = await rede.conectar(depoisDeReiniciar, 'Ana');
    volta.criar('1x1', SEM_LIMITE, undefined, undefined, { carteira: codigos[0]! });
    await volta.esperarTipo('boas-vindas');
    expect((await volta.esperarTipo('estado-sala')).lugares[0]!.estatisticas).toMatchObject({ partidas: 1, vitorias: vencedor === 0 ? 1 : 0 });
  }, 240_000);
});
