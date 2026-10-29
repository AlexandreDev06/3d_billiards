/**
 * Mata-mata, giz, força e modalidade pelo WebSocket de verdade: clientes reais, o codec do fio, a sala, a física e as
 * regras de verdade. Nenhum motor falso: a partida acaba porque a mesa esvaziou.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, criarRng, simularTacada, type ParametrosTacada } from '@sinuca/fisica';
import { FORCA_DA_SALA_PADRAO, GIZ_DA_SALA_PADRAO, PROTOCOLO_VERSAO, type MensagemDaSala, type MsgTacada } from '@sinuca/protocolo';
import { PRESET_MATA_MATA, aplicarTacada, pontosPorEquipe } from '@sinuca/regras';
import { CONFIG_SALA_PADRAO } from './config';
import { acharTacada, brancaSaiu, cegou, numeradasEncacapadas, numeradasNosEventos, sortearDeTeste, tacadaDaVisao, type VisaoDoCliente } from './para-testes';
import { ClienteWs } from './para-testes-ws';
import { iniciarServidor, type Servidor } from './servidor';

let pasta: string;
beforeAll(() => {
  pasta = mkdtempSync(join(tmpdir(), 'sala-integracao-mm-'));
  writeFileSync(join(pasta, 'index.html'), '<title>x</title>');
});
afterAll(() => rmSync(pasta, { recursive: true, force: true }));

const servidores: Servidor[] = [];
const clientes: ClienteWs[] = [];
afterEach(async () => {
  for (const c of clientes.splice(0)) c.derrubar();
  await Promise.all(servidores.splice(0).map((s) => s.fechar()));
});

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

/** Uma sala de mata-mata com `nomes.length` pessoas sentadas, ainda na espera. */
async function esperaDeMataMata(s: Servidor, nomes: string[], modo: '1x1' | '1x1x1' | '1x1x1x1', extra: Partial<Parameters<ClienteWs['criar']>[4]> = {}) {
  const cs: ClienteWs[] = [];
  for (const n of nomes) cs.push(await cliente(s, n));
  cs[0]!.criar(modo, { tempoS: null }, undefined, PRESET_MATA_MATA.regras, extra);
  const bv = await cs[0]!.esperarTipo('boas-vindas');
  for (const c of cs.slice(1)) {
    c.entrar(bv.codigo);
    await c.esperarTipo('boas-vindas');
  }
  await cs[0]!.esperar((m) => m.tipo === 'estado-sala' && m.lugares.slice(0, nomes.length).every((l) => l.nome !== null));
  return { cs, codigo: bv.codigo, token: bv.token };
}

/** Espera uma mensagem que `serve` e chegou DEPOIS da posição `marca` (as da partida anterior não valem). */
const depois = (c: ClienteWs, marca: number, serve: (m: MensagemDaSala) => boolean) => c.esperar((m) => c.recebidas.indexOf(m) >= marca && serve(m));

const retransmitidas = (c: ClienteWs) => c.recebidas.filter((m): m is Extract<MensagemDaSala, { tipo: 'tacada-retransmitida' }> => m.tipo === 'tacada-retransmitida');

describe('integração — mata-mata com 3 clientes reais e a física real', () => {
  it('algumas tacadas: a vez gira 0-1-2, os pontos são de quem encaçapou, e quem entra tarde ou volta com o token vê a mesma partida', async () => {
    const s = await subir();
    const { cs, codigo, token } = await esperaDeMataMata(s, ['Ana', 'Beto', 'Cida'], '1x1x1');
    for (const c of cs) expect(c.ultimoEstado).toMatchObject({ modalidade: 'mata-mata', modo: '1x1x1', preset: 'Mata-mata', giz: GIZ_DA_SALA_PADRAO, forca: FORCA_DA_SALA_PADRAO });
    expect(cs[0]!.ultimoEstado!.lugares.map((l) => l.equipe)).toEqual([0, 1, 2, 3]);

    cs[0]!.enviar({ tipo: 'iniciar' });
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    expect(cs[1]!.recebidas.find((m) => m.tipo === 'retrato')).toMatchObject({ partida: { config: { modalidade: 'mata-mata' }, jogadores: [{ equipe: 0 }, { equipe: 1 }, { equipe: 2 }] } });

    const pontos = [0, 0, 0];
    const vezes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const estado = cs[0]!.ultimoEstado!;
      expect(estado.seq).toBe(i);
      const lugar = estado.vez!;
      vezes.push(lugar);
      const quem = cs[lugar]!;
      const m = i === 0 || i === 4 ? acharTacada(quem.visao!, (t) => numeradasEncacapadas(t).length > 0 && !t.gravacao.eventos.some((e) => e.tipo === 'cacapa' && e.bola === 0)) : tacadaDaVisao(quem.visao!, { angulo: 0.4 + i, velocidadeTaco: 5, efeito: { lateral: 0, vertical: 0.1 }, elevacao: 0, giz: 1 }, 20 + i);
      const antes = quem.visao!.partida;
      pontos[lugar]! += numeradasEncacapadas(m).length;
      quem.enviar(m);
      await Promise.all(cs.map((c) => c.esperar((x) => x.tipo === 'tacada-retransmitida' && x.seq === i)));
      await Promise.all(cs.map((c) => c.esperar((x) => x.tipo === 'estado-sala' && x.seq === i + 1)));
      const r = retransmitidas(cs[1]!).at(-1)!;
      expect(r.lugar).toBe(lugar);
      expect(r.partida).toEqual(aplicarTacada(antes, r.gravacao.eventos).partida);
      expect(r.consequencias).toEqual(aplicarTacada(antes, r.gravacao.eventos).consequencias);
      expect(pontosPorEquipe(r.partida), `pontos depois da tacada ${i}`).toEqual(pontos);
      expect(r.consequencias.retirar).toEqual([]);
      expect(cs[0]!.ultimoEstado!.vez).toBe((lugar + 1) % 3);
    }
    expect(vezes).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(pontos.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    for (const c of cs) expect(c.visao).toEqual(cs[0]!.visao);

    // espectador tardio recebe o retrato da entrada
    const esp = await cliente(s, 'Esp');
    esp.entrar(codigo);
    expect(await esp.esperar((m) => m.tipo === 'retrato' && m.motivo === 'entrada')).toMatchObject({ seq: 7, ultima: { seq: 6, lugar: 0 } });
    expect(esp.visao).toEqual(cs[0]!.visao);
    expect(esp.ultimoEstado).toMatchObject({ modalidade: 'mata-mata', modo: '1x1x1' });

    // Ana (a anfitriã, lugar 0) cai e volta com o token: a partida de mata-mata segue de onde estava
    cs[0]!.derrubar();
    await cs[1]!.esperar((m) => m.tipo === 'estado-sala' && !m.lugares[0]!.conectado);
    const ana2 = await cliente(s, 'Ana');
    ana2.entrar(codigo, token);
    expect(await ana2.esperarTipo('boas-vindas')).toMatchObject({ lugar: 0, anfitriao: true, token });
    await ana2.esperar((m) => m.tipo === 'retrato' && m.motivo === 'entrada');
    expect(ana2.visao).toEqual(cs[1]!.visao);
    expect(ana2.ultimoEstado!.vez).toBe(1); // 7 tacadas: a roda está em Beto
    cs[1]!.enviar(tacadaDaVisao(cs[1]!.visao!, { angulo: 1.1, velocidadeTaco: 4, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 }, 77));
    await ana2.esperar((m) => m.tipo === 'tacada-retransmitida' && m.seq === 7);
  }, 60_000);

  it('suicídio: a tacada com a pena atravessa o fio, todos os clientes decodificam a lista, a roda pula Ana e quem entra ou volta recebe a partida certa', async () => {
    const s = await subir();
    const { cs, codigo, token } = await esperaDeMataMata(s, ['Ana', 'Beto', 'Cida'], '1x1x1');
    const [ana, beto, cida] = cs as [ClienteWs, ClienteWs, ClienteWs];
    expect(ana.ultimoEstado!.modalidade).toBe('mata-mata');
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));

    const derrubaABranca = (t: MsgTacada): boolean => t.gravacao.eventos.some((e) => e.tipo === 'cacapa' && e.bola === 0);
    const tranquila = (c: ClienteWs) => acharTacada(c.visao!, (t) => !brancaSaiu(t) && !cegou(t));
    const passou = async (seq: number) => {
      await Promise.all(cs.map((c) => c.esperar((x) => x.tipo === 'tacada-retransmitida' && x.seq === seq)));
      await Promise.all(cs.map((c) => c.esperar((x) => x.tipo === 'estado-sala' && x.seq === seq + 1)));
    };

    // 1ª: Ana derruba a branca. A tacada que ela manda leva `perdemAProximaVez: [0]` na partida, e o servidor a aceita.
    const suicidio = acharTacada(ana.visao!, derrubaABranca, [4, 2, 1, 8, 6]);
    expect(suicidio.partida.perdemAProximaVez).toEqual([0]);
    ana.enviar(suicidio);
    await passou(0);
    for (const c of cs) {
      expect(retransmitidas(c).at(-1)!.partida, c.nome).toMatchObject({ vez: 1, perdemAProximaVez: [0] });
      expect(retransmitidas(c).at(-1)!.consequencias.faltas.map((f) => f.nome), c.nome).toContain('suicidio');
      expect(c.ultimoEstado!.vez, c.nome).toBe(1);
    }

    // quem entra agora (espectador) e quem volta (Ana, com o token) recebem o retrato com a lista
    const esp = await cliente(s, 'Esp');
    esp.entrar(codigo);
    expect(await esp.esperar((m) => m.tipo === 'retrato' && m.motivo === 'entrada')).toMatchObject({ seq: 1, partida: { vez: 1, perdemAProximaVez: [0] } });
    ana.derrubar();
    await beto.esperar((m) => m.tipo === 'estado-sala' && !m.lugares[0]!.conectado);
    const ana2 = await cliente(s, 'Ana');
    ana2.entrar(codigo, token);
    expect(await ana2.esperar((m) => m.tipo === 'retrato' && m.motivo === 'entrada')).toMatchObject({ partida: { vez: 1, perdemAProximaVez: [0] } });
    expect(ana2.visao).toEqual(beto.visao);

    // uma lista malformada pelo fio é recusada pelo servidor (mensagem-invalida) e a conexão segue
    const boa = tranquila(beto);
    const marca = beto.recebidas.length;
    beto.enviar({ ...boa, partida: { ...boa.partida, perdemAProximaVez: [0, 0] } });
    expect(await beto.esperar((m) => beto.recebidas.indexOf(m) >= marca && m.tipo === 'erro')).toMatchObject({ codigo: 'mensagem-invalida' });
    expect(beto.fechou).toBeNull();

    // 2ª e 3ª: Beto e Cida jogam e, na volta, Ana é pulada
    const participantes = [ana2, beto, cida, esp];
    beto.enviar(boa);
    await Promise.all(participantes.map((c) => c.esperar((x) => x.tipo === 'tacada-retransmitida' && x.seq === 1)));
    await Promise.all(participantes.map((c) => c.esperar((x) => x.tipo === 'estado-sala' && x.seq === 2)));
    expect(retransmitidas(cida).at(-1)!.partida).toMatchObject({ vez: 2, perdemAProximaVez: [0] });

    cida.enviar(tranquila(cida));
    await Promise.all(participantes.map((c) => c.esperar((x) => x.tipo === 'tacada-retransmitida' && x.seq === 2)));
    await Promise.all(participantes.map((c) => c.esperar((x) => x.tipo === 'estado-sala' && x.seq === 3)));
    for (const c of participantes) {
      const r = retransmitidas(c).at(-1)!;
      expect(r.partida.vez, c.nome).toBe(1);
      expect(r.partida, c.nome).not.toHaveProperty('perdemAProximaVez');
      expect(r.consequencias.proximo, c.nome).toBe(1);
      expect(c.ultimoEstado!.vez, c.nome).toBe(1);
    }
    expect(beto.visao).toEqual(ana2.visao);

    // quem chega depois do pulo recebe a partida sem a lista
    const tarde = await cliente(s, 'Tarde');
    tarde.entrar(codigo);
    const retrato = await tarde.esperar((m) => m.tipo === 'retrato' && m.motivo === 'entrada');
    expect(retrato).toMatchObject({ seq: 3, partida: { vez: 1 } });
    if (retrato.tipo === 'retrato') expect(retrato.partida).not.toHaveProperty('perdemAProximaVez');

    // nenhum quadro da sala deixou de ser decodificado por nenhum cliente
    for (const c of [...cs, esp, ana2, tarde]) expect(c.invalidas, c.nome).toEqual([]);
  }, 60_000);

  it('cegar (L21): a tacada com a pena atravessa o fio, todos decodificam a lista e a roda pula Ana', async () => {
    const s = await subir();
    const { cs } = await esperaDeMataMata(s, ['Ana', 'Beto', 'Cida'], '1x1x1');
    const [ana, beto, cida] = cs as [ClienteWs, ClienteWs, ClienteWs];
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    const passou = async (seq: number) => {
      await Promise.all(cs.map((c) => c.esperar((x) => x.tipo === 'tacada-retransmitida' && x.seq === seq)));
      await Promise.all(cs.map((c) => c.esperar((x) => x.tipo === 'estado-sala' && x.seq === seq + 1)));
    };

    const cega = acharTacada(ana.visao!, (t) => cegou(t) && !brancaSaiu(t), [2, 1, 0.5]);
    expect(cega.partida.perdemAProximaVez).toEqual([0]);
    ana.enviar(cega);
    await passou(0);
    for (const c of cs) {
      const r = retransmitidas(c).at(-1)!;
      expect(r.partida, c.nome).toMatchObject({ vez: 1, perdemAProximaVez: [0] });
      expect(r.consequencias.faltas, c.nome).toEqual([{ nome: 'cegar' }]);
      expect(c.ultimoEstado!.vez, c.nome).toBe(1);
    }

    const tranquila = (c: ClienteWs) => acharTacada(c.visao!, (t) => !brancaSaiu(t) && !cegou(t));
    beto.enviar(tranquila(beto));
    await passou(1);
    cida.enviar(tranquila(cida));
    await passou(2);
    for (const c of cs) {
      const r = retransmitidas(c).at(-1)!;
      expect(r.partida.vez, c.nome).toBe(1);
      expect(r.partida, c.nome).not.toHaveProperty('perdemAProximaVez');
      expect(c.invalidas, c.nome).toEqual([]);
    }
  }, 60_000);

  it('uma partida inteira: a mesa esvazia, ganha quem tem mais pontos, o placar tem 3 lados e a segunda partida soma na roda girada', async () => {
    const s = await subir();
    const nomes = ['Ana', 'Beto', 'Cida'];
    const { cs } = await esperaDeMataMata(s, nomes, '1x1x1');

    /** A tacada que a física acha para esta mesa: encaçapa numeradas sem derrubar a branca; sem nenhuma, um toque de leve. */
    const escolher = (v: VisaoDoCliente, turno: number) => {
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
    };

    const somaDeVitorias = (c: ClienteWs): number => c.ultimoEstado!.placar!.atual!.lados.reduce((a, l) => a + l.vitorias, 0);
    const vencedores: number[] = [];
    for (let partida = 0; partida < 2; partida++) {
      const aoIniciar = cs.map((c) => c.recebidas.length);
      cs[0]!.enviar({ tipo: 'iniciar' });
      await Promise.all(cs.map((c, i) => depois(c, aoIniciar[i]!, (m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
      if (partida === 1) {
        // a roda girou: quem saiu na primeira (lugar 0) é o último; Beto abre. Cada um mantém a equipe.
        const retrato = cs[0]!.recebidas.filter((m) => m.tipo === 'retrato').at(-1)!;
        if (retrato.tipo !== 'retrato') throw new Error('impossível');
        expect(retrato.partida.jogadores.map((j) => [j.id, j.equipe])).toEqual([['lugar-1', 1], ['lugar-2', 2], ['lugar-0', 0]]);
        expect(cs[0]!.ultimoEstado!.vez).toBe(1);
      }
      const pontos = [0, 0, 0];
      let turno = 0;
      for (; turno < 200; turno++) {
        const estado = cs[0]!.ultimoEstado!;
        if (estado.vez === null) break;
        expect(estado.seq).toBe(turno);
        const quem = cs[estado.vez]!;
        const m = escolher(quem.visao!, turno);
        const antes = quem.visao!.partida;
        const equipeDeQuemTaca = antes.jogadores[antes.vez]!.equipe;
        pontos[equipeDeQuemTaca]! += numeradasEncacapadas(m).length;
        const marcas = cs.map((c) => c.recebidas.length);
        quem.enviar(m);
        await Promise.all(cs.map((c, i) => depois(c, marcas[i]!, (x) => x.tipo === 'tacada-retransmitida' && x.seq === turno)));
        await Promise.all(cs.map((c, i) => depois(c, marcas[i]!, (x) => x.tipo === 'estado-sala' && x.seq === turno + 1)));
        const r = retransmitidas(quem).at(-1)!;
        expect(r.partida).toEqual(aplicarTacada(antes, m.gravacao.eventos).partida);
        expect(pontosPorEquipe(r.partida)).toEqual(pontos);
      }
      const estado = cs[0]!.ultimoEstado!;
      expect(estado.vez, `a partida ${partida + 1} acabou antes de ${turno} tacadas`).toBeNull();
      const fim = retransmitidas(cs[1]!).at(-1)!.partida;
      expect(fim.fase).toBe('fim');
      expect(fim.naMesa).toEqual([]);
      expect(pontos.reduce((a, b) => a + b, 0)).toBe(15);
      expect(pontos[fim.vencedor!]).toBe(Math.max(...pontos));
      vencedores.push(fim.vencedor!);
      // o placar: 3 lados, a vitória na pessoa da equipe vencedora, e a mesma tela para todos
      for (const c of cs) {
        await c.esperar((m) => m.tipo === 'estado-sala' && m.placar?.atual?.lados.reduce((a, l) => a + l.vitorias, 0) === partida + 1);
        expect(c.ultimoEstado!.placar!.atual!.lados.map((l) => l.nomes)).toEqual([['Ana'], ['Beto'], ['Cida']]);
        expect(c.ultimoEstado!.placar!.atual!.modalidade).toBe('mata-mata');
        expect(somaDeVitorias(c)).toBe(partida + 1);
      }
      const aoVoltar = cs.map((c) => c.recebidas.length);
      cs[0]!.enviar({ tipo: 'voltar-ao-lobby' });
      await Promise.all(cs.map((c, i) => depois(c, aoVoltar[i]!, (m) => m.tipo === 'estado-sala' && m.fase === 'espera')));
    }
    const final = cs[0]!.ultimoEstado!.placar!;
    expect(final.historico).toEqual([]);
    const esperado = [0, 0, 0];
    for (const equipe of vencedores) esperado[equipe]!++;
    expect(final.atual!.lados.map((l) => l.vitorias)).toEqual(esperado);
    expect(PROTOCOLO_VERSAO).toBe(10);
  }, 120_000);
});

describe('integração — modalidade, giz e força pelo WebSocket real', () => {
  it('o anfitrião troca a modalidade, o giz e a força na espera; todos veem, quem sobra vira espectador e as recusas chegam como erro', async () => {
    const s = await subir();
    const nomes = ['Ana', 'Beto', 'Cida', 'Davi'];
    const cs: ClienteWs[] = [];
    for (const n of nomes) cs.push(await cliente(s, n));
    cs[0]!.criar('2x2', { tempoS: 30 });
    const bv = await cs[0]!.esperarTipo('boas-vindas');
    for (const c of cs.slice(1)) {
      c.entrar(bv.codigo);
      await c.esperarTipo('boas-vindas');
    }
    await cs[0]!.esperar((m) => m.tipo === 'estado-sala' && m.lugares.every((l) => l.nome !== null));
    expect(cs[0]!.ultimoEstado).toMatchObject({ modalidade: 'par-ou-impar', modo: '2x2', preset: 'Boteco', forca: 'linha', giz: GIZ_DA_SALA_PADRAO });

    // modalidade nova sem dizer o modo: o 2x2 não serve, vai ao de mesmo número de lugares (1x1x1x1) e os quatro seguem sentados
    cs[0]!.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata', giz: { desgasteMax: 0.5, passadaS: 1.5 }, forca: 'empurrar' });
    const giz = { desgasteMin: 0.1, desgasteMax: 0.5, passada: 0.1, passadaS: 1.5 };
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'estado-sala' && m.modalidade === 'mata-mata')));
    for (const c of cs) expect(c.ultimoEstado, c.nome).toMatchObject({ modalidade: 'mata-mata', modo: '1x1x1x1', preset: 'Mata-mata', giz, forca: 'empurrar', relogio: { tempoS: 30 }, espectadores: 0 });
    expect(cs[0]!.ultimoEstado!.lugares.map((l) => [l.nome, l.equipe])).toEqual([['Ana', 0], ['Beto', 1], ['Cida', 2], ['Davi', 3]]);
    for (const c of cs) expect(c.recebidas.filter((m) => m.tipo === 'boas-vindas'), c.nome).toHaveLength(1);

    // um modo menor dito: Cida e Davi viram espectadores (boas-vindas novas, lugar null)
    cs[0]!.enviar({ tipo: 'configurar-sala', modo: '1x1' });
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'estado-sala' && m.modo === '1x1')));
    expect(cs[0]!.ultimoEstado!.lugares.map((l) => l.nome)).toEqual(['Ana', 'Beto', null, null]);
    for (const c of cs.slice(2)) expect(c.recebidas.filter((m) => m.tipo === 'boas-vindas').at(-1), c.nome).toMatchObject({ lugar: null });
    expect(cs[0]!.ultimoEstado!.espectadores).toBe(2);

    // recusas: de forma (o esquema do fio, mensagem-invalida) e de regra (a sala, regras-invalidas com o motivo)
    const espera = (c: ClienteWs, codigo: string, mensagem?: string) =>
      c.esperar((m) => m.tipo === 'erro' && m.codigo === codigo && (mensagem === undefined || m.mensagem === mensagem));
    cs[0]!.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata', modo: '2x2' } as never);
    cs[0]!.enviar({ tipo: 'configurar-sala', giz: { passadaS: 7 } } as never);
    await espera(cs[0]!, 'mensagem-invalida');
    cs[0]!.enviar({ tipo: 'configurar-sala', modo: '2x1' });
    await espera(cs[0]!, 'regras-invalidas', 'Mata-mata não joga em 2x1 (aceita 1x1, 1x1x1, 1x1x1x1).');
    cs[0]!.enviar({ tipo: 'configurar-sala', giz: { desgasteMax: 0.05 } });
    await espera(cs[0]!, 'regras-invalidas', 'O desgaste mínimo do giz (10%) passa do máximo (5%).');
    expect(cs[0]!.recebidas.filter((m) => m.tipo === 'erro' && m.codigo === 'mensagem-invalida')).toHaveLength(2);
    cs[1]!.enviar({ tipo: 'configurar-sala', forca: 'linha' });
    await espera(cs[1]!, 'nao-anfitriao');
    expect(cs[0]!.ultimoEstado).toMatchObject({ modalidade: 'mata-mata', modo: '1x1', giz, forca: 'empurrar' });

    // de volta ao par ou ímpar, no 2x1, com a casa de fábrica; e a partida sai com ela
    cs[0]!.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar', modo: '2x1', forca: 'linha' });
    await cs[0]!.esperar((m) => m.tipo === 'estado-sala' && m.modalidade === 'par-ou-impar' && m.modo === '2x1');
    expect(cs[0]!.ultimoEstado).toMatchObject({ preset: 'Boteco', forca: 'linha', giz });
  });

  it('criar-sala com combinação inválida ou giz fora da faixa chega recusada; o v2 recebe o pedido de recarregar', async () => {
    const s = await subir();
    const c = await cliente(s, 'Ana');
    c.criar('1x1x1', { tempoS: null }); // par ou ímpar não joga em 1x1x1
    c.criar('1x1', { tempoS: null }, undefined, PRESET_MATA_MATA.regras, { giz: { passada: 0.9 } });
    c.criar('1x1', { tempoS: null }, undefined, undefined, { versao: 2 });
    await c.esperar((m) => m.tipo === 'erro' && m.codigo === 'versao');
    expect(c.recebidas.filter((m) => m.tipo === 'erro').map((e) => (e.tipo === 'erro' ? e.codigo : ''))).toEqual(['mensagem-invalida', 'mensagem-invalida', 'versao']);
    expect(c.boasVindas).toBeUndefined();
  });
});
