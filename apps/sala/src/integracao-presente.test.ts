/**
 * O presente de teste de ponta a ponta (L34c), pelo servidor de verdade: carteiras novas e antigas, HTTP e WebSocket reais. Quem
 * aparece pela primeira vez (`POST`/`GET /carteira`, `criar-sala` ou `entrar` com o código) recebe o valor uma vez por rótulo, e o
 * saldo novo já chega no `estado-sala` de todos. Cada servidor usa uma pasta de dados própria, nunca `apps/sala/dados/`.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { SALDO_INICIAL, validarCarteiraCriada, validarEstadoDaCarteira, type EstadoCarteira } from '@sinuca/protocolo';
import { PRESET_BOTECO } from '@sinuca/regras';
import type { PresenteDeTeste } from './config';
import { SEM_LIMITE } from './para-testes';
import { AmbienteDeRede, type ClienteWs } from './para-testes-ws';
import type { Servidor } from './servidor';

const PRESENTE: PresenteDeTeste = { valor: 10_000, rotulo: 'skins-cs' };

const rede = new AmbienteDeRede();
const pastas: string[] = [];
afterAll(() => rede.encerrar());
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

const pastaDeDados = (): string => {
  const p = mkdtempSync(join(tmpdir(), 'sala-integracao-presente-'));
  pastas.push(p);
  return p;
};

async function http<T = EstadoCarteira>(s: Servidor, metodo: 'GET' | 'POST', caminho: string, codigo?: string): Promise<{ status: number; corpo: T }> {
  const cabecalhos: Record<string, string> = {};
  if (codigo) cabecalhos.Authorization = `Bearer ${codigo}`;
  if (metodo === 'POST') cabecalhos.Origin = `http://localhost:${s.porta}`;
  const r = await fetch(`http://127.0.0.1:${s.porta}${caminho}`, { method: metodo, headers: cabecalhos });
  return { status: r.status, corpo: (await r.json()) as T };
}

const criarCarteira = async (s: Servidor): Promise<{ codigo: string; saldo: number }> => {
  const r = await http<{ codigo: string; saldo: number }>(s, 'POST', '/carteira');
  expect(r.status).toBe(201);
  return r.corpo;
};

const saldoNoEstado = (c: ClienteWs, lugar: number, saldo: number) =>
  c.esperar((m) => m.tipo === 'estado-sala' && m.lugares[lugar]!.saldo === saldo);

const registrar = () => {
  const logs: string[] = [];
  return { logs, log: (evento: string, campos: Record<string, unknown> = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`) };
};
const presentesNoLog = (logs: string[]) => logs.filter((l) => l.startsWith('presente ')).map((l) => JSON.parse(l.slice('presente '.length)) as Record<string, unknown>);

describe('presente de teste pelo servidor de verdade', () => {
  it('antiga ou nova, a carteira recebe na primeira vez que aparece (HTTP, criar-sala ou entrar) e o saldo novo chega no estado-sala de todos', async () => {
    const pastaDados = pastaDeDados();

    // antes: uma sala sem o presente cria duas carteiras (uma com saldo mexido) e fecha
    const antes = await rede.subir({ pastaDados });
    const ana = await criarCarteira(antes);
    const beto = await criarCarteira(antes);
    expect(ana.saldo).toBe(SALDO_INICIAL);
    antes.carteiras.aplicar([{ id: antes.carteiras.resolver(ana.codigo)!, delta: 300 }]);
    await antes.fechar();

    // depois: a mesma pasta, com o presente ligado
    const { logs, log } = registrar();
    const s = await rede.subir({ pastaDados, presenteDeTeste: PRESENTE }, { log });

    // a Ana aparece pela primeira vez ao criar a sala (antiga, nunca abriu o HTTP): 400 + 10 000
    const wsAna = await rede.conectar(s, 'Ana');
    wsAna.criar('1x1', SEM_LIMITE, undefined, PRESET_BOTECO.regras, { aposta: 10, carteira: ana.codigo });
    const bv = await wsAna.esperarTipo('boas-vindas');
    await saldoNoEstado(wsAna, 0, 10_400);

    // o Beto aparece ao entrar com o código: 100 + 10 000, e a Ana vê o saldo dele no estado-sala
    const wsBeto = await rede.conectar(s, 'Beto');
    wsBeto.entrar(bv.codigo, undefined, beto.codigo);
    await wsBeto.esperarTipo('boas-vindas');
    await saldoNoEstado(wsBeto, 1, 10_100);
    await saldoNoEstado(wsAna, 1, 10_100);
    await saldoNoEstado(wsBeto, 0, 10_400);

    // uma carteira nova já nasce com o presente, no POST e no GET (o formato é o do protocolo)
    const nova = await http<{ codigo: string }>(s, 'POST', '/carteira');
    expect(nova.status).toBe(201);
    expect(validarCarteiraCriada(nova.corpo).ok).toBe(true);
    expect((nova.corpo as unknown as EstadoCarteira).saldo).toBe(SALDO_INICIAL + 10_000);
    const lida = await http(s, 'GET', '/carteira', nova.corpo.codigo);
    expect(validarEstadoDaCarteira(lida.corpo).ok).toBe(true);
    expect(lida.corpo.saldo).toBe(10_100);

    // o GET da antiga já mostra o saldo novo, e abrir de novo (duas abas ao mesmo tempo) não paga de novo
    const abas = await Promise.all(Array.from({ length: 10 }, () => http(s, 'GET', '/carteira', ana.codigo)));
    expect(abas.map((a) => a.corpo.saldo)).toEqual(Array(10).fill(10_400));

    // três pagamentos, um por carteira, e nada do código no log
    expect(presentesNoLog(logs)).toHaveLength(3);
    expect(presentesNoLog(logs)).toContainEqual({ apelido: null, valor: 10_000, rotulo: 'skins-cs' });
    for (const c of [ana.codigo, beto.codigo, nova.corpo.codigo]) expect(logs.join('\n')).not.toContain(c);
    await s.fechar();

    // o saldo e a marca foram juntos ao disco
    const arquivo = JSON.parse(readFileSync(join(pastaDados, 'carteiras.json'), 'utf8')) as { carteiras: Record<string, { saldo: number; presentes?: Record<string, number> }> };
    const carteiras = Object.values(arquivo.carteiras);
    expect(carteiras.map((c) => c.saldo).sort((a, b) => a - b)).toEqual([10_100, 10_100, 10_400]);
    for (const c of carteiras) expect(c.presentes).toEqual({ 'skins-cs': 10_000 });

    // reiniciar com o mesmo rótulo não paga de novo; um rótulo novo paga
    const mesmo = await rede.subir({ pastaDados, presenteDeTeste: PRESENTE });
    expect((await http(mesmo, 'GET', '/carteira', ana.codigo)).corpo.saldo).toBe(10_400);
    await mesmo.fechar();
    const outro = await rede.subir({ pastaDados, presenteDeTeste: { valor: 500, rotulo: 'rodada-2' } });
    expect((await http(outro, 'GET', '/carteira', ana.codigo)).corpo.saldo).toBe(10_900);
    expect((await http(outro, 'GET', '/carteira', ana.codigo)).corpo.saldo).toBe(10_900);
  });

  it('desligado, ninguém recebe nada: carteira nova e antiga seguem com o que têm, no HTTP e no estado-sala', async () => {
    const { logs, log } = registrar();
    const s = await rede.subir({ pastaDados: pastaDeDados() }, { log });
    const ana = await criarCarteira(s);
    expect(ana.saldo).toBe(SALDO_INICIAL);
    expect((await http(s, 'GET', '/carteira', ana.codigo)).corpo.saldo).toBe(SALDO_INICIAL);
    const wsAna = await rede.conectar(s, 'Ana');
    wsAna.criar('1x1', SEM_LIMITE, undefined, PRESET_BOTECO.regras, { aposta: 10, carteira: ana.codigo });
    await wsAna.esperarTipo('boas-vindas');
    await saldoNoEstado(wsAna, 0, SALDO_INICIAL);
    expect(presentesNoLog(logs)).toEqual([]);
  });
});
