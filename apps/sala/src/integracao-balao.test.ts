/**
 * O balão de ponta a ponta (L47), pelo servidor de verdade: compra e troca pelo HTTP, clientes WebSocket reais, a física e as
 * regras reais. Um cliente da versão 10 e outro da 9 (que ainda não conhece o balão) na mesma sala: o da 10 vê a aparência de cada
 * lugar e a troca no meio da partida; o da 9 segue jogando e não recebe NADA do que não conhece (provado no texto cru do fio,
 * não só no que o decodificador devolve). O cliente não manda a aparência de ninguém. O arquivo guarda o balão e nunca o código.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { APARENCIA_PADRAO, CABECALHO_DO_PROTOCOLO, PROTOCOLO_VERSAO, PROTOCOLO_VERSAO_MINIMA, type AparenciaDoBalao, type EstadoCarteira, type MensagemDaSala } from '@sinuca/protocolo';
import { SEM_LIMITE, mensagemDeCriar, tacadaDaVisao } from './para-testes';
import { AmbienteDeRede, type ClienteWs } from './para-testes-ws';
import type { Servidor } from './servidor';

const rede = new AmbienteDeRede();
const pastas: string[] = [];
afterAll(() => rede.encerrar());
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

/** O HTTP da carteira como o cliente o faz; `versao` é o cabeçalho que o cliente da 10 manda (sem ele, a sala responde como à 9). */
async function http<T = EstadoCarteira>(s: Servidor, metodo: 'GET' | 'POST', caminho: string, codigo?: string, corpo?: object, versao: number | null = PROTOCOLO_VERSAO): Promise<{ status: number; corpo: T }> {
  const cabecalhos: Record<string, string> = {};
  if (codigo) cabecalhos.Authorization = `Bearer ${codigo}`;
  if (metodo === 'POST') cabecalhos.Origin = `http://localhost:${s.porta}`;
  if (corpo) cabecalhos['Content-Type'] = 'application/json';
  if (versao !== null) cabecalhos[CABECALHO_DO_PROTOCOLO] = String(versao);
  const r = await fetch(`http://127.0.0.1:${s.porta}${caminho}`, { method: metodo, headers: cabecalhos, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
  return { status: r.status, corpo: (await r.json()) as T };
}

const criarCarteira = async (s: Servidor): Promise<string> => {
  const r = await http<{ codigo: string }>(s, 'POST', '/carteira', undefined, undefined, null);
  expect(r.status).toBe(201);
  return r.corpo.codigo;
};

/** Uma carteira com saldo e os itens comprados pelo HTTP. */
async function carteiraComItens(s: Servidor, itens: readonly string[]): Promise<string> {
  const codigo = await criarCarteira(s);
  s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 5000 }]);
  for (const item of itens) expect((await http(s, 'POST', '/carteira/balao/comprar', codigo, { item })).status, `comprar ${item}`).toBe(200);
  return codigo;
}

const depois = (c: ClienteWs, marca: number, serve: (m: MensagemDaSala) => boolean) => c.esperar((m) => c.recebidas.indexOf(m) >= marca && serve(m));

/** As chaves que um `LugarSala` tinha na versão 9. */
const CHAVES_DO_LUGAR_NA_9 = ['anfitriao', 'bolas', 'conectado', 'equipe', 'estatisticas', 'lugar', 'nome', 'saldo', 'semente', 'skin'];

const ENFEITADA: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_kawaii', corDosOlhos: 'dourado' };
const OUTRA: AparenciaDoBalao = { chapeu: 'cartola', bigode: null, olhos: 'olho_normal', corDosOlhos: 'dourado' };
const ITENS = ['coroa', 'bigodao', 'olho_kawaii', 'dourado', 'cartola'] as const;

describe('o balão pelo servidor de verdade: HTTP, WebSocket, física e regras reais', () => {
  it('o cliente da 10 vê o balão de cada lugar e a troca no meio da partida; o da 9 segue jogando sem receber nada que não conhece', async () => {
    const pastaDados = mkdtempSync(join(tmpdir(), 'sala-integracao-balao-'));
    pastas.push(pastaDados);
    const logs: string[] = [];
    const s = await rede.subir({ pastaDados }, { log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`) });

    const doAna = await carteiraComItens(s, ITENS);
    const doBeto = await criarCarteira(s);
    expect((await http(s, 'POST', '/carteira/balao/equipar', doAna, { aparencia: ENFEITADA })).status).toBe(200);

    const ana = await rede.conectar(s, 'Ana'); // versão 10
    const beto = await rede.conectar(s, 'Beto'); // versão 9
    const davi = await rede.conectar(s, 'Davi'); // versão 10, só olha
    ana.criar('1x1', SEM_LIMITE, undefined, undefined, { carteira: doAna });
    const bv = await ana.esperarTipo('boas-vindas');
    expect(bv.versao).toBe(PROTOCOLO_VERSAO);
    beto.enviar({ tipo: 'entrar', versao: PROTOCOLO_VERSAO_MINIMA, codigo: bv.codigo, nome: 'Beto', carteira: doBeto });
    expect((await beto.esperarTipo('boas-vindas')).versao).toBe(PROTOCOLO_VERSAO_MINIMA);
    davi.entrar(bv.codigo);
    await davi.esperarTipo('boas-vindas');

    // o da 10 vê o balão de cada lugar: o equipado da Ana e o padrão do Beto
    for (const quem of [ana, davi]) {
      const e = await quem.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto' && m.lugares[0]!.aparencia !== undefined);
      if (e.tipo !== 'estado-sala') throw new Error('impossível');
      expect(e.lugares[0]!.aparencia, quem.nome).toEqual(ENFEITADA);
      expect(e.lugares[1]!.aparencia, quem.nome).toEqual(APARENCIA_PADRAO);
      expect(e.lugares[2]!.aparencia, `${quem.nome}: lugar vago`).toBeNull();
    }

    // o da 9 vê o resto do estado, mas nenhuma chave nova, nem no que o decodificador devolve nem no texto cru do fio
    await beto.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');
    const veBeto = beto.ultimoEstado!;
    expect(veBeto.lugares[0]).toMatchObject({ nome: 'Ana', saldo: expect.any(Number) });
    for (const lugar of veBeto.lugares) expect(Object.keys(lugar).sort(), `lugar ${lugar.lugar}`).toEqual(CHAVES_DO_LUGAR_NA_9);
    expect(beto.brutos.length).toBeGreaterThan(0);
    expect(beto.brutos.join('\n')).not.toContain('aparencia');

    // a partida roda com a física real; o da 9 joga a vez dele
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all([ana, beto, davi].map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    const cs = [ana, beto];

    // troca no meio da partida pelo HTTP: chega ao da 10 (a Ana e o Davi) e ao da 9 chega um estado novo, sem a chave
    const marcas = [ana, beto, davi].map((c) => c.recebidas.length);
    const trocou = await http(s, 'POST', '/carteira/balao/equipar', doAna, { aparencia: OUTRA });
    expect(trocou.status).toBe(200);
    await depois(ana, marcas[0]!, (m) => m.tipo === 'estado-sala' && m.fase === 'jogando' && m.lugares[0]!.aparencia?.chapeu === 'cartola');
    await depois(davi, marcas[2]!, (m) => m.tipo === 'estado-sala' && m.fase === 'jogando' && m.lugares[0]!.aparencia?.chapeu === 'cartola');
    const aoBeto = await depois(beto, marcas[1]!, (m) => m.tipo === 'estado-sala' && m.fase === 'jogando');
    if (aoBeto.tipo !== 'estado-sala') throw new Error('impossível');
    for (const lugar of aoBeto.lugares) expect(Object.keys(lugar).sort(), `lugar ${lugar.lugar} depois da troca`).toEqual(CHAVES_DO_LUGAR_NA_9);
    expect(beto.brutos.join('\n')).not.toContain('aparencia');
    expect(davi.ultimoEstado!.lugares[1]!.aparencia).toEqual(APARENCIA_PADRAO);

    // tacadas até o Beto (versão 9) jogar a dele: a sala o atende como a qualquer um
    let betoJogou = false;
    for (let turno = 0; turno < 30 && !betoJogou; turno++) {
      const estado = ana.ultimoEstado!;
      if (estado.vez === null) break;
      const quem = cs[estado.vez]!;
      const m0 = cs.map((c) => c.recebidas.length);
      quem.enviar(tacadaDaVisao(quem.visao!));
      await Promise.all(cs.map((c, i) => depois(c, m0[i]!, (m) => m.tipo === 'estado-sala' && m.seq === estado.seq + 1)));
      if (quem === beto) betoJogou = true;
    }
    expect(betoJogou, 'o cliente da 9 jogou a vez dele').toBe(true);
    for (const c of [ana, beto, davi]) expect(c.invalidas, c.nome).toEqual([]);
    expect(beto.brutos.join('\n')).not.toContain('aparencia');
    for (const c of [ana, beto]) expect(c.recebidas.filter((m) => m.tipo === 'erro'), c.nome).toEqual([]);

    // o balão equipado está no arquivo à parte (L47b: o carteiras.json fica como a versão anterior o lê) e nunca o código, e volta depois de reiniciar o servidor
    await s.fechar();
    const arquivo = readFileSync(join(pastaDados, 'carteiras.json'), 'utf8');
    const arquivoDoBalao = readFileSync(join(pastaDados, 'carteiras-balao.json'), 'utf8');
    expect(arquivoDoBalao).toContain('cartola');
    expect(arquivo).not.toContain('balao');
    expect(arquivo).not.toContain('cartola');
    for (const codigo of [doAna, doBeto]) {
      expect(arquivo).not.toContain(codigo);
      expect(arquivoDoBalao).not.toContain(codigo);
    }
    const reiniciado = await rede.subir({ pastaDados });
    const volta = await http(reiniciado, 'GET', '/carteira', doAna);
    expect(volta.corpo.balao?.aparencia).toEqual(OUTRA);
    expect(volta.corpo.balao?.itens).toEqual(expect.arrayContaining([...ITENS]));
    // a carteira do Beto nunca mexeu em balão: segue no padrão, sem nada comprado além dos grátis
    expect((await http(reiniciado, 'GET', '/carteira', doBeto)).corpo.balao).toEqual({ aparencia: APARENCIA_PADRAO, itens: ['olho_normal', 'castanho'] });

    // o log diz o que foi comprado e equipado, nunca o código
    const tudo = [ana, beto, davi].map((c) => JSON.stringify(c.recebidas)).join('\n') + '\n' + logs.join('\n');
    for (const codigo of [doAna, doBeto]) expect(tudo).not.toContain(codigo);
    expect(logs.filter((l) => l.startsWith('compra-balao '))).toHaveLength(ITENS.length);
    expect(logs.filter((l) => l.startsWith('equipou-balao ')).length).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('o cliente não manda aparência: o `entrar` e o `criar-sala` com ela são `mensagem-invalida`, e o balão dos lugares não muda', async () => {
    const s = await rede.subir();
    const doAna = await carteiraComItens(s, ITENS);
    expect((await http(s, 'POST', '/carteira/balao/equipar', doAna, { aparencia: ENFEITADA })).status).toBe(200);
    const ana = await rede.conectar(s, 'Ana');
    ana.criar('1x1', SEM_LIMITE, undefined, undefined, { carteira: doAna });
    const bv = await ana.esperarTipo('boas-vindas');

    const intruso = await rede.conectar(s, 'Intruso');
    intruso.enviarBruto(JSON.stringify({ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: bv.codigo, nome: 'Intruso', aparencia: ENFEITADA }));
    expect((await intruso.esperarTipo('erro')).codigo).toBe('mensagem-invalida');
    const outro = await rede.conectar(s, 'Outro');
    outro.enviarBruto(JSON.stringify({ ...mensagemDeCriar('Outro'), aparencia: ENFEITADA }));
    expect((await outro.esperarTipo('erro')).codigo).toBe('mensagem-invalida');

    // quem entra por direito, sem carteira, fica com o padrão
    const beto = await rede.conectar(s, 'Beto');
    beto.entrar(bv.codigo);
    await beto.esperarTipo('boas-vindas');
    const e = await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');
    if (e.tipo !== 'estado-sala') throw new Error('impossível');
    expect(e.lugares[0]!.aparencia).toEqual(ENFEITADA);
    expect(e.lugares[1]!.aparencia).toEqual(APARENCIA_PADRAO);
  });
});
