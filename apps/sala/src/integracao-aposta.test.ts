/**
 * A aposta de ponta a ponta (L22), pelo servidor de verdade: HTTP da carteira, WebSocket com o decodificador estrito, a sala,
 * a física e as regras reais. Nenhum motor falso: duas carteiras criadas pelo HTTP sentam num mata-mata de 2, a mesa
 * esvazia por tacadas jogadas, o pote muda de mãos, a loja mexe no que a sala mostra e tudo sobrevive a reiniciar o servidor.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, criarRng, simularTacada, type ParametrosTacada } from '@sinuca/fisica';
import { SALDO_INICIAL, type MensagemDaSala } from '@sinuca/protocolo';
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

interface EstadoDaLoja {
  readonly saldo: number;
  readonly skins: string[];
  readonly skin: string;
}

/** O que o navegador da página faz: Origin do próprio servidor nos POST e o código no `Authorization`. */
async function loja<T = unknown>(s: Servidor, metodo: 'GET' | 'POST', caminho: string, codigo?: string, corpo?: object): Promise<{ status: number; corpo: T }> {
  const cabecalhos: Record<string, string> = {};
  if (codigo) cabecalhos.Authorization = `Bearer ${codigo}`;
  if (metodo === 'POST') cabecalhos.Origin = `http://localhost:${s.porta}`;
  if (corpo) cabecalhos['Content-Type'] = 'application/json';
  const r = await fetch(`http://127.0.0.1:${s.porta}${caminho}`, { method: metodo, headers: cabecalhos, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
  return { status: r.status, corpo: (await r.json()) as T };
}

const criarCarteira = async (s: Servidor): Promise<string> => {
  const r = await loja<{ codigo: string; saldo: number }>(s, 'POST', '/carteira');
  expect(r.status).toBe(201);
  expect(r.corpo.saldo).toBe(SALDO_INICIAL);
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

describe('aposta pelo servidor de verdade: carteiras do HTTP, WebSocket, física e regras reais', () => {
  it('uma partida inteira de mata-mata de 2 paga o pote, a loja mexe na sala, e tudo sobrevive a reiniciar o servidor', async () => {
    const pastaDados = mkdtempSync(join(tmpdir(), 'sala-integracao-aposta-'));
    pastas.push(pastaDados);
    const logs: string[] = [];
    const log = (evento: string, campos: Record<string, unknown> = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`);
    const s = await rede.subir({ pastaDados, missoesDiarias: false }, { log });

    const codigoAna = await criarCarteira(s);
    const codigoBeto = await criarCarteira(s);
    const codigos = [codigoAna, codigoBeto];

    const ana = await rede.conectar(s, 'Ana');
    const beto = await rede.conectar(s, 'Beto');
    const cs = [ana, beto];
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras, { aposta: 20, carteira: codigoAna });
    const bv = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv.codigo, undefined, codigoBeto);
    await beto.esperarTipo('boas-vindas');
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');
    for (const c of cs) {
      const estado = c.ultimoEstado!;
      expect(estado.aposta, c.nome).toBe(20);
      expect(estado.lugares.slice(0, 2).map((l) => [l.saldo, l.skin]), c.nome).toEqual([[100, 'classico'], [100, 'classico']]);
    }

    ana.enviar({ tipo: 'iniciar' });
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    for (let turno = 0; turno < 200; turno++) {
      const estado = ana.ultimoEstado!;
      if (estado.vez === null) break;
      expect(estado.seq).toBe(turno);
      const quem = cs[estado.vez]!;
      const m = escolher(quem.visao!, turno);
      const marcas = cs.map((c) => c.recebidas.length);
      quem.enviar(m);
      await Promise.all(cs.map((c, i) => depois(c, marcas[i]!, (x) => x.tipo === 'estado-sala' && x.seq === turno + 1)));
    }
    expect(ana.ultimoEstado!.vez, 'a partida não acabou em 200 tacadas').toBeNull();

    // quem ganhou, e o pote: o vencedor leva os 20 do outro
    const fim = ana.recebidas.filter((m) => m.tipo === 'tacada-retransmitida').at(-1)!;
    if (fim.tipo !== 'tacada-retransmitida') throw new Error('impossível');
    const vencedor = fim.partida.vencedor!;
    expect(fim.partida.fase).toBe('fim');
    const perdedor = 1 - vencedor;
    for (const c of cs) {
      const paga = await c.esperar((m) => m.tipo === 'aposta-paga');
      if (paga.tipo !== 'aposta-paga') throw new Error('impossível');
      expect(paga.valor, c.nome).toBe(20);
      expect(paga.variacoes, c.nome).toEqual([
        { lugar: 0, nome: 'Ana', delta: vencedor === 0 ? 20 : -20, saldo: vencedor === 0 ? 120 : 80 },
        { lugar: 1, nome: 'Beto', delta: vencedor === 1 ? 20 : -20, saldo: vencedor === 1 ? 120 : 80 },
      ]);
      // a ordem do fim: tacada, depois o pagamento, depois o estado já com os saldos novos
      const tipos = c.recebidas.map((m) => m.tipo);
      expect(tipos.lastIndexOf('tacada-retransmitida'), c.nome).toBeLessThan(tipos.indexOf('aposta-paga'));
      expect(tipos.indexOf('aposta-paga'), c.nome).toBeLessThan(tipos.lastIndexOf('estado-sala'));
      expect(c.ultimoEstado!.lugares.slice(0, 2).map((l) => l.saldo), c.nome).toEqual([vencedor === 0 ? 120 : 80, vencedor === 1 ? 120 : 80]);
      expect(c.recebidas.filter((m) => m.tipo === 'aposta-paga')).toHaveLength(1);
    }
    expect((await loja<EstadoDaLoja>(s, 'GET', '/carteira', codigos[vencedor])).corpo.saldo).toBe(120);
    expect((await loja<EstadoDaLoja>(s, 'GET', '/carteira', codigos[perdedor])).corpo.saldo).toBe(80);
    expect(logs.filter((l) => l.startsWith('aposta '))).toHaveLength(1);

    // o vencedor compra uma skin pelo HTTP (120 → 70) e a sala inteira vê o saldo novo, sem ele mexer em nada no jogo
    const marcasLoja = cs.map((c) => c.recebidas.length);
    const compra = await loja<EstadoDaLoja>(s, 'POST', '/carteira/comprar', codigos[vencedor], { skin: 'ebano' });
    expect(compra).toMatchObject({ status: 200, corpo: { saldo: 70, skins: ['classico', 'ebano'], skin: 'classico' } });
    await Promise.all(cs.map((c, i) => depois(c, marcasLoja[i]!, (m) => m.tipo === 'estado-sala' && m.lugares[vencedor]!.saldo === 70)));
    const uso = await loja<EstadoDaLoja>(s, 'POST', '/carteira/usar', codigos[vencedor], { skin: 'ebano' });
    expect(uso.corpo.skin).toBe('ebano');
    await Promise.all(cs.map((c, i) => depois(c, marcasLoja[i]!, (m) => m.tipo === 'estado-sala' && m.lugares[vencedor]!.skin === 'ebano')));
    expect(beto.ultimoEstado!.lugares[perdedor]).toMatchObject({ saldo: 80, skin: 'classico' });

    // ninguém, em nenhum quadro nem log, viu o código de ninguém
    const tudo = cs.map((c) => JSON.stringify(c.recebidas)).join('\n') + '\n' + logs.join('\n');
    for (const codigo of codigos) expect(tudo).not.toContain(codigo);
    for (const c of cs) expect(c.invalidas, c.nome).toEqual([]);

    // reiniciar o servidor: o arquivo guarda saldo e skins, e não guarda código
    await s.fechar();
    const arquivo = readFileSync(join(pastaDados, 'carteiras.json'), 'utf8');
    for (const codigo of codigos) expect(arquivo).not.toContain(codigo);
    const depoisDeReiniciar = await rede.subir({ pastaDados, missoesDiarias: false });
    expect((await loja<EstadoDaLoja>(depoisDeReiniciar, 'GET', '/carteira', codigos[vencedor])).corpo).toMatchObject({ saldo: 70, skins: ['classico', 'ebano'], skin: 'ebano' });
    expect((await loja<EstadoDaLoja>(depoisDeReiniciar, 'GET', '/carteira', codigos[perdedor])).corpo).toMatchObject({ saldo: 80, skins: ['classico'], skin: 'classico' });

    // e a carteira que voltou do disco senta numa sala nova com o saldo de antes
    const volta = await rede.conectar(depoisDeReiniciar, 'Ana');
    volta.criar('1x1', SEM_LIMITE, undefined, undefined, { carteira: codigos[vencedor]! });
    await volta.esperarTipo('boas-vindas');
    expect((await volta.esperarTipo('estado-sala')).lugares[0]).toMatchObject({ saldo: 70, skin: 'ebano' });
  }, 180_000);
});
