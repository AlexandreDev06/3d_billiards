/**
 * As skins de taco de ponta a ponta (L34), pelo servidor de verdade: carteiras e loja pelo HTTP, dois clientes WebSocket
 * reais, a física e as regras reais. O taco único (a semente) e o contador de bolas de cada um chegam ao outro pelo
 * `estado-sala`; o contador anda com as bolas matadas de quem tacou, no taco que ele tem em uso naquela tacada, e trocar de
 * skin no meio da partida vale para as tacadas seguintes. O servidor sobe com o relógio de `relogioSemVitrine` (preços cheios).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, criarRng, simularTacada, type ParametrosTacada } from '@sinuca/fisica';
import { ehSemente, type EstadoCarteira, type LugarSala, type MensagemDaSala, type SkinTaco } from '@sinuca/protocolo';
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

async function loja<T = EstadoCarteira>(s: Servidor, metodo: 'GET' | 'POST', caminho: string, codigo?: string, corpo?: object): Promise<{ status: number; corpo: T }> {
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
const itemEmUso = (e: EstadoCarteira) => e.itens!.find((i) => i.skin === e.skin)!;
const bolasPorSkin = (e: EstadoCarteira): Record<string, number> => Object.fromEntries(e.itens!.map((i) => [i.skin, i.bolas]));

describe('skins de taco pelo servidor de verdade: HTTP, WebSocket, física e regras reais', () => {
  it('a semente e o contador chegam ao outro pelo estado-sala; o contador soma as bolas matadas no taco em uso, e trocar no meio vale dali em diante', async () => {
    const pastaDados = mkdtempSync(join(tmpdir(), 'sala-integracao-skins-'));
    pastas.push(pastaDados);
    const logs: string[] = [];
    const s = await rede.subir({ pastaDados }, { log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`) });

    const codigos = [await criarCarteira(s), await criarCarteira(s)];
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigos[0]!)!, delta: 400 }]);
    const comprou = await loja(s, 'POST', '/carteira/comprar', codigos[0]!, { skin: 'ebano' });
    expect(comprou.status).toBe(200);
    expect(comprou.corpo.saldo).toBe(500 - 50);
    const ebano = comprou.corpo.itens!.find((i) => i.skin === 'ebano')!;
    const classicoDaAna = comprou.corpo.itens!.find((i) => i.skin === 'classico')!;
    expect(ehSemente(ebano.semente) && ehSemente(classicoDaAna.semente)).toBe(true);
    const classicoDoBeto = (await loja(s, 'GET', '/carteira', codigos[1]!)).corpo.itens![0]!;

    const ana = await rede.conectar(s, 'Ana');
    const beto = await rede.conectar(s, 'Beto');
    const cs = [ana, beto];
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras, { aposta: 20, carteira: codigos[0]! });
    const bv = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv.codigo, undefined, codigos[1]);
    await beto.esperarTipo('boas-vindas');
    const vendo = (c: ClienteWs, lugar: number, serve: (l: LugarSala) => boolean) =>
      c.esperar((m) => m.tipo === 'estado-sala' && m.lugares[lugar]!.nome !== null && serve(m.lugares[lugar]!));

    // cada um vê o taco do outro: a skin em uso, a semente e o contador zerado
    await vendo(beto, 0, (l) => l.skin === 'classico' && l.semente === classicoDaAna.semente && l.bolas === 0);
    await vendo(ana, 1, (l) => l.semente === classicoDoBeto.semente && l.bolas === 0);

    // trocar de skin pelo HTTP chega ao outro, com a semente daquele taco
    const marca = beto.recebidas.length;
    expect((await loja(s, 'POST', '/carteira/usar', codigos[0]!, { skin: 'ebano' })).corpo.skin).toBe('ebano');
    await depois(beto, marca, (m) => m.tipo === 'estado-sala' && m.lugares[0]!.skin === 'ebano' && m.lugares[0]!.semente === ebano.semente && m.lugares[0]!.bolas === 0);

    ana.enviar({ tipo: 'iniciar' });
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));

    let trocou = false;
    const mortasPorAna: Record<string, number> = { ebano: 0, classico: 0 };
    for (let turno = 0; turno < 200; turno++) {
      const estado = ana.ultimoEstado!;
      if (estado.vez === null) break;
      const atirador = estado.vez;
      const quem = cs[atirador]!;
      // a Ana, depois de matar a primeira bola com o ébano, passa ao clássico: as próximas contam nele
      if (atirador === 0 && !trocou && mortasPorAna.ebano! > 0) {
        const m0 = cs.map((c) => c.recebidas.length);
        expect((await loja(s, 'POST', '/carteira/usar', codigos[0]!, { skin: 'classico' })).corpo.skin).toBe('classico');
        await Promise.all(cs.map((c, i) => depois(c, m0[i]!, (m) => m.tipo === 'estado-sala' && m.lugares[0]!.skin === 'classico' && m.lugares[0]!.semente === classicoDaAna.semente)));
        trocou = true;
      }
      const marcas = cs.map((c) => c.recebidas.length);
      const antesDoTaco = (await loja(s, 'GET', '/carteira', codigos[atirador]!)).corpo;
      const usadoNaTacada = itemEmUso(antesDoTaco);
      quem.enviar(escolher(quem.visao!, turno));
      await Promise.all(cs.map((c, i) => depois(c, marcas[i]!, (x) => x.tipo === 'estado-sala' && x.seq === turno + 1)));
      const tacada = quem.recebidas.slice(marcas[atirador]!).find((m) => m.tipo === 'tacada-retransmitida');
      if (tacada?.tipo !== 'tacada-retransmitida') throw new Error('sem tacada retransmitida');

      const depoisDoTaco = (await loja(s, 'GET', '/carteira', codigos[atirador]!)).corpo;
      const ganhou = itemEmUso(depoisDoTaco).bolas - usadoNaTacada.bolas;
      expect(ganhou, `turno ${turno}: só soma`).toBeGreaterThanOrEqual(0);
      expect(ganhou, `turno ${turno}: no máximo as numeradas que caíram`).toBeLessThanOrEqual(numeradasNosEventos(tacada.gravacao.eventos).length);
      // os outros tacos da carteira não mexem
      for (const [skin, bolas] of Object.entries(bolasPorSkin(antesDoTaco))) if (skin !== antesDoTaco.skin) expect(bolasPorSkin(depoisDoTaco)[skin], `turno ${turno}: ${skin}`).toBe(bolas);
      // os dois clientes veem o mesmo contador, o do taco em uso, no estado da tacada
      for (const c of cs) {
        const visto = c.ultimoEstado!.lugares[atirador]!;
        expect(visto.bolas, `${c.nome} vendo o lugar ${atirador}, turno ${turno}`).toBe(itemEmUso(depoisDoTaco).bolas);
        expect(visto.semente, `${c.nome} vendo o lugar ${atirador}`).toBe(usadoNaTacada.semente);
      }
      if (atirador === 0) mortasPorAna[antesDoTaco.skin] = (mortasPorAna[antesDoTaco.skin] ?? 0) + ganhou;
      if (trocou && mortasPorAna.classico! > 0) break;
    }

    expect(mortasPorAna.ebano, 'a Ana matou bolas com o ébano antes de trocar').toBeGreaterThan(0);
    expect(mortasPorAna.classico, 'e matou outras com o clássico depois da troca').toBeGreaterThan(0);
    // o que a Ana fez com cada taco está no item dele, no HTTP e na tela do Beto
    const fim = (await loja(s, 'GET', '/carteira', codigos[0]!)).corpo;
    expect(bolasPorSkin(fim)).toEqual({ classico: mortasPorAna.classico, ebano: mortasPorAna.ebano });
    expect(fim.itens!.map((i) => i.semente)).toEqual([classicoDaAna.semente, ebano.semente]); // a semente nunca muda
    expect(beto.ultimoEstado!.lugares[0]).toMatchObject({ skin: 'classico', semente: classicoDaAna.semente, bolas: mortasPorAna.classico });

    // o arquivo guarda os contadores e as sementes, e nunca o código
    await s.fechar();
    const arquivo = readFileSync(join(pastaDados, 'carteiras.json'), 'utf8');
    for (const codigo of codigos) expect(arquivo).not.toContain(codigo);
    const reiniciado = await rede.subir({ pastaDados });
    expect(bolasPorSkin((await loja(reiniciado, 'GET', '/carteira', codigos[0]!)).corpo)).toEqual({ classico: mortasPorAna.classico, ebano: mortasPorAna.ebano });
    const tudo = cs.map((c) => JSON.stringify(c.recebidas)).join('\n') + '\n' + logs.join('\n');
    for (const codigo of codigos) expect(tudo).not.toContain(codigo);
    expect(logs.filter((l) => l.startsWith('compra '))).toHaveLength(1);
    for (const c of cs) expect(c.invalidas, c.nome).toEqual([]);
  }, 300_000);

  it('quem não tem carteira não mostra semente nem contador (null), e o outro lugar mostra o seu', async () => {
    const s = await rede.subir();
    const codigo = await criarCarteira(s);
    const classico = (await loja(s, 'GET', '/carteira', codigo)).corpo.itens![0]! as { skin: SkinTaco; semente: number; bolas: number };
    const ana = await rede.conectar(s, 'Ana');
    const beto = await rede.conectar(s, 'Beto');
    ana.criar('1x1', SEM_LIMITE, undefined, undefined, { carteira: codigo });
    const bv = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv.codigo);
    await beto.esperarTipo('boas-vindas');
    const estado = await beto.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');
    if (estado.tipo !== 'estado-sala') throw new Error('impossível');
    expect(estado.lugares[0]).toMatchObject({ nome: 'Ana', semente: classico.semente, bolas: 0 });
    expect(estado.lugares[1]).toMatchObject({ nome: 'Beto', semente: null, bolas: null });
    expect(estado.lugares[2]).toMatchObject({ nome: null, semente: null, bolas: null });
  });
});
