/**
 * O saldo no Banco (L57), com `SALDO_NO_BANCO` ligado: o espelho (`Guardada.saldo`, a conta síncrona de sempre) mais a caixa de saída que
 * manda cada escrita de saldo ao Banco. O Banco aqui é o de verdade (o `Moedas` do apps/conta sobre `node:sqlite` em memória), atrás de
 * uma casca que cai quando o teste manda; a sala é a de verdade, até a tacada que acaba a partida (essa o teste manda acabar para a
 * equipe que escolhe). O que se prova: cada momento põe a operação certa, depois de drenar o Banco e o espelho dizem o mesmo, a
 * ordem reservar → liquidar se mantém, a queda não perde nem repete nada, e a chave da aposta é única no mundo.
 */
import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { LUGARES_POR_MODO, SALDO_INICIAL, TAMANHO_CODIGO, diaDaMissao, missoesDoDia, premioDaMissao, type ApostaSala, type ModoSala } from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESET_MATA_MATA, aplicarTacada, novaPartida, type ConfigRegras, type EstadoPartida, type Jogador, type ResultadoRegras } from '@sinuca/regras';
import { CarteirasEmMemoria, type CarteirasBase } from './carteiras-base';
import { CarteirasNoDO } from './carteiras-sqlite';
import { ClienteDeTeste, SEM_LIMITE, TACADA_MEDIA, criarAmbiente, type Ambiente } from './para-testes';
import { bancoDeTeste, type BancoDeTeste } from './para-testes-banco';
import { banco as bancoSqlite, escritasDe } from './para-testes-sqlite';
import type { PresenteDeTeste } from './config-nucleo';
import type { MotorDeRegras } from './regras';

const SEM_MISSOES = { missoesDiarias: false };
const NOMES = ['Ana', 'Beto', 'Cida', 'Davi'];

const fim = (p: EstadoPartida, vencedor: number | null): ResultadoRegras => ({
  partida: { ...p, fase: 'fim', vencedor },
  consequencias: { faltas: [], retirar: [], recolocar: [], proximo: p.vez, vencedor, texto: 'fim' },
});

interface Carteira {
  readonly codigo: string;
  readonly id: string;
}

interface Mundo {
  readonly amb: Ambiente;
  readonly bt: BancoDeTeste;
  readonly carteiras: CarteirasBase;
  readonly logs: string[];
  readonly controle: { acabaCom?: number | 'ninguem' };
  /** Uma carteira nova (ela entra na caixa). */
  nova(): Carteira;
  /** O Banco e o espelho dizem o mesmo para a carteira (depois de drenar). */
  drenar(): Promise<void>;
}

interface OpcoesDoMundo {
  readonly presente?: PresenteDeTeste;
  readonly sortear?: (max: number) => number;
  readonly banco?: BancoDeTeste;
  readonly missoes?: boolean;
}

function mundo(opcoes: OpcoesDoMundo = {}): Mundo {
  const bt = opcoes.banco ?? bancoDeTeste();
  const logs: string[] = [];
  const controle: Mundo['controle'] = {};
  const regras: MotorDeRegras = {
    novaPartida,
    aplicarTacada: (p, eventos) => (controle.acabaCom === undefined ? aplicarTacada(p, eventos) : fim(p, controle.acabaCom === 'ninguem' ? null : controle.acabaCom)),
  };
  const ref: { amb?: Ambiente } = {};
  const carteiras = new CarteirasEmMemoria({
    maxCarteiras: 100,
    relogio: () => ref.amb!.agora(),
    log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
    banco: bt.banco,
    ...(opcoes.presente ? { presenteDeTeste: opcoes.presente } : {}),
  });
  const amb = criarAmbiente(opcoes.missoes ? {} : SEM_MISSOES, { regras, carteiras, ...(opcoes.sortear ? { sortear: opcoes.sortear } : {}) });
  ref.amb = amb;
  return {
    amb,
    bt,
    carteiras,
    logs,
    controle,
    nova: () => carteiras.criar()!,
    drenar: () => carteiras.drenarCaixa(),
  };
}

interface Mesa {
  readonly m: Mundo;
  readonly jogadores: ClienteDeTeste[];
  readonly carteiras: (Carteira | null)[];
}

function sentar(m: Mundo, modo: ModoSala, carteiras: readonly (Carteira | null)[], opcoes: { regras?: ConfigRegras; aposta?: ApostaSala; iniciar?: boolean } = {}): Mesa {
  const quantos = LUGARES_POR_MODO[modo];
  const jogadores = NOMES.slice(0, quantos).map((n) => new ClienteDeTeste(m.amb, n));
  const extra = { ...(opcoes.aposta === undefined ? {} : { aposta: opcoes.aposta }), ...(carteiras[0] ? { carteira: carteiras[0].codigo } : {}) };
  jogadores[0]!.criar(modo, opcoes.regras ?? PRESET_BOTECO.regras, SEM_LIMITE, undefined, extra);
  jogadores.slice(1).forEach((c, i) => c.entrar(jogadores[0]!.codigo, undefined, carteiras[i + 1]?.codigo));
  if (opcoes.iniciar !== false) jogadores[0]!.enviar({ tipo: 'iniciar' });
  return { m, jogadores, carteiras: [...carteiras] };
}

const quemTemAVez = (mesa: Mesa): ClienteDeTeste => mesa.jogadores.find((c) => c.lugar === mesa.jogadores[0]!.estado.vez)!;

/** A tacada de quem tem a vez que acaba a partida para a `equipe`. */
function terminar(mesa: Mesa, equipe: number | 'ninguem'): void {
  mesa.m.controle.acabaCom = equipe;
  const quem = quemTemAVez(mesa);
  const v = quem.visao!;
  const fimDaPartida = fim(v.partida, equipe === 'ninguem' ? null : equipe).partida;
  quem.enviar({ tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fimDaPartida, mesa: v.mesa });
  delete mesa.m.controle.acabaCom;
}

const espelho = (m: Mundo, c: Carteira): number => m.carteiras.ler(c.id)!.saldo;
const nomesDasChamadas = (bt: BancoDeTeste): string[] => bt.chamadas.slice();
const operacoesDaCaixa = (m: Mundo): string[] => (m.carteiras as unknown as { caixa: { entradas: { op: { tipo: string } }[] } }).caixa.entradas.map((e) => e.op.tipo);

describe('cada momento põe a operação certa, e depois de drenar o Banco e o espelho dizem o mesmo', () => {
  it('carteira nova: garantirConta com o saldo inicial', async () => {
    const m = mundo();
    const c = m.nova();
    expect(operacoesDaCaixa(m)).toEqual(['garantir']);
    expect(m.bt.saldo(c.id)).toBeNull(); // nada vai ao Banco dentro do código que criou
    await m.drenar();
    expect(nomesDasChamadas(m.bt)).toEqual(['garantirConta']);
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL);
    expect(espelho(m, c)).toBe(SALDO_INICIAL);
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
  });

  it('presente: creditar com a chave sinuca:presente:<rotulo>:<id>, uma vez só por rótulo', async () => {
    const m = mundo({ presente: { valor: 500, rotulo: 'skins-cs' } });
    const c = m.nova();
    expect(operacoesDaCaixa(m)).toEqual(['garantir', 'creditar']);
    expect(espelho(m, c)).toBe(SALDO_INICIAL + 500);
    await m.drenar();
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL + 500);
    expect(espelho(m, c)).toBe(SALDO_INICIAL + 500);
    expect(m.bt.local.moedas.operacao(`sinuca:presente:skins-cs:${c.id}`)).toMatchObject({ ok: true, saldos: { [c.id]: SALDO_INICIAL + 500 } });
    // abrir de novo pelo código não paga (nem enfileira) outra vez
    m.carteiras.resolver(c.codigo);
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    expect(m.bt.local.moedas.saldo(c.id)!.saldo).toBe(SALDO_INICIAL + 500);
  });

  it('prêmio de missão: um creditar por missão fechada, chave sinuca:missao:<dia>:<missao>:<id>, com jogo sinuca e motivo missao no livro', async () => {
    const m = mundo();
    const c = m.nova();
    await m.drenar();
    const agora = m.amb.agora();
    const [facil] = missoesDoDia(diaDaMissao(agora));
    const andou = m.carteiras.registrarMissoes(c.id, { [facil!.id]: facil!.meta });
    expect(andou?.cumpridas).toEqual([facil!.id]);
    expect(operacoesDaCaixa(m)).toEqual(['creditar']);
    expect(espelho(m, c)).toBe(SALDO_INICIAL + premioDaMissao(facil!.id));
    await m.drenar();
    expect(m.bt.saldo(c.id)).toBe(SALDO_INICIAL + premioDaMissao(facil!.id));
    const chave = `sinuca:missao:${diaDaMissao(agora)}:${facil!.id}:${c.id}`;
    expect(m.bt.local.moedas.operacao(chave)).toMatchObject({ ok: true });
    // a mesma missão no mesmo dia não paga de novo, nem na carteira nem no Banco
    expect(m.carteiras.registrarMissoes(c.id, { [facil!.id]: 1 })).toBeNull();
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
  });

  it('aposta: reservar quando a partida começa e liquidar no fim, com a mesma chave; o pote muda de mãos no Banco como no espelho', async () => {
    const m = mundo();
    const [a, b] = [m.nova(), m.nova()];
    await m.drenar();
    m.bt.chamadas.length = 0;
    const mesa = sentar(m, '1x1', [a, b], { aposta: 50 });
    expect(operacoesDaCaixa(m)).toEqual(['reservar']);
    await m.drenar();
    expect(m.bt.reservado(a.id)).toBe(50);
    expect(m.bt.reservado(b.id)).toBe(50);
    expect(m.bt.saldo(a.id)).toBe(100);

    terminar(mesa, 0);
    expect([espelho(m, a), espelho(m, b)]).toEqual([150, 50]); // o espelho paga na hora, síncrono
    expect(operacoesDaCaixa(m)).toEqual(['liquidar']);
    await m.drenar();
    expect(nomesDasChamadas(m.bt)).toEqual(['reservar', 'liquidar']);
    expect([m.bt.saldo(a.id), m.bt.saldo(b.id)]).toEqual([150, 50]);
    expect([m.bt.reservado(a.id), m.bt.reservado(b.id)]).toEqual([0, 0]);
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
  });

  it('a ordem reservar → liquidar se mantém mesmo com o Banco fora do ar a partida inteira', async () => {
    const m = mundo();
    const [a, b] = [m.nova(), m.nova()];
    await m.drenar();
    m.bt.chamadas.length = 0;
    m.bt.fora = true;
    const mesa = sentar(m, '1x1', [a, b]);
    terminar(mesa, 1);
    await m.drenar();
    expect(operacoesDaCaixa(m)).toEqual(['reservar', 'liquidar']);
    expect([espelho(m, a), espelho(m, b)]).toEqual([90, 110]);
    expect(m.bt.saldo(a.id)).toBe(100);
    m.bt.fora = false;
    m.amb.semTick(5000);
    await m.drenar();
    expect(nomesDasChamadas(m.bt).slice(-3)).toEqual(['reservar', 'reservar', 'liquidar']); // a que falhou, a que passou, e o pagamento
    expect([m.bt.saldo(a.id), m.bt.saldo(b.id)]).toEqual([90, 110]);
    expect([espelho(m, a), espelho(m, b)]).toEqual([90, 110]);
    expect(m.bt.reservado(a.id)).toBe(0);
  });

  it('mata-mata de 3, o vencedor sem carteira: ninguém paga, e a reserva volta pelo devolver (nunca fica presa)', async () => {
    const m = mundo();
    const [a, b] = [m.nova(), m.nova()];
    await m.drenar();
    const mesa = sentar(m, '1x1x1', [a, b, null], { regras: PRESET_MATA_MATA.regras });
    await m.drenar();
    expect(m.bt.reservado(a.id)).toBe(10);
    terminar(mesa, 2);
    expect(operacoesDaCaixa(m)).toEqual(['devolver']);
    await m.drenar();
    expect([m.bt.saldo(a.id), m.bt.saldo(b.id)]).toEqual([100, 100]);
    expect([m.bt.reservado(a.id), m.bt.reservado(b.id)]).toEqual([0, 0]);
  });

  it('partida sem aposta que mexa dinheiro (uma carteira só): nada de reserva', async () => {
    const m = mundo();
    const a = m.nova();
    await m.drenar();
    m.bt.chamadas.length = 0;
    const mesa = sentar(m, '1x1', [a, null]);
    terminar(mesa, 0);
    await m.drenar();
    expect(m.bt.chamadas).toEqual([]);
  });
});

describe('a aposta que não é paga devolve a reserva', () => {
  it('partida sem vencedor + voltar ao lobby', async () => {
    const m = mundo();
    const [a, b] = [m.nova(), m.nova()];
    await m.drenar();
    const mesa = sentar(m, '1x1', [a, b]);
    await m.drenar();
    expect(m.bt.reservado(a.id)).toBe(10);
    terminar(mesa, 'ninguem');
    expect(operacoesDaCaixa(m)).toEqual([]); // ainda não: a partida acabou sem pagar, mas a sala não largou a aposta
    mesa.jogadores[0]!.enviar({ tipo: 'voltar-ao-lobby' });
    expect(operacoesDaCaixa(m)).toEqual(['devolver']);
    await m.drenar();
    expect([m.bt.reservado(a.id), m.bt.reservado(b.id)]).toEqual([0, 0]);
    expect([m.bt.saldo(a.id), m.bt.saldo(b.id)]).toEqual([100, 100]);
  });

  it('sala fechada no meio (expirou)', async () => {
    const m = mundo();
    const [a, b] = [m.nova(), m.nova()];
    await m.drenar();
    sentar(m, '1x1', [a, b]);
    await m.drenar();
    expect(m.bt.reservado(a.id)).toBe(10);
    m.amb.avancar(m.amb.config.salaOciosaMs + 1);
    expect(m.amb.registro.totalSalas).toBe(0);
    await m.drenar();
    expect([m.bt.reservado(a.id), m.bt.reservado(b.id)]).toEqual([0, 0]);
  });

  it('servidor saindo: devolverApostas solta a reserva de cada sala, e só uma vez', async () => {
    const m = mundo();
    const [a, b] = [m.nova(), m.nova()];
    await m.drenar();
    sentar(m, '1x1', [a, b]);
    m.amb.registro.devolverApostas();
    m.amb.registro.devolverApostas();
    await m.drenar();
    expect(nomesDasChamadas(m.bt).filter((n) => n === 'devolver')).toHaveLength(1);
    expect(m.bt.reservado(a.id)).toBe(0);
  });
});

describe('a queda', () => {
  it('o RPC lança na 2ª operação: a caixa para, nada se perde e depois drena tudo', async () => {
    const m = mundo({ presente: { valor: 400, rotulo: 'teste' } });
    const a = m.nova(); // garantir + creditar
    const b = m.nova(); // garantir + creditar
    m.bt.cair(2);
    await m.drenar();
    expect(nomesDasChamadas(m.bt)).toEqual(['garantirConta', 'creditar']);
    expect(m.carteiras.pendentesNaCaixa).toBe(3);
    // uma exceção só desta operação, com o Banco respondendo à sonda (L60b): é golpe nela, não Banco fora do ar
    expect(m.logs.some((l) => l.startsWith('banco-golpe'))).toBe(true);
    // o espelho não perde o crédito que ainda espera: 100 do Banco + 400 na caixa
    expect(espelho(m, a)).toBe(500);
    expect(m.bt.saldo(a.id)).toBe(100);
    // dentro da espera de 5 s o despachante nem chama o Banco
    const chamadasAntes = m.bt.chamadas.length;
    await m.drenar();
    expect(m.bt.chamadas.length).toBe(chamadasAntes);
    expect(m.carteiras.proximaTentativaDaCaixa).toBe(m.amb.agora() + 5000);

    m.amb.semTick(5000);
    await m.drenar();
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    for (const c of [a, b]) {
      expect(m.bt.saldo(c.id)).toBe(500);
      expect(espelho(m, c)).toBe(500);
    }
  });

  it('a resposta se perde depois de o Banco aplicar: o reenvio volta repetida e não paga duas vezes', async () => {
    const m = mundo({ presente: { valor: 400, rotulo: 'teste' } });
    const a = m.nova();
    m.bt.cair(2, { depois: true }); // o creditar é aplicado no Banco, mas a resposta não chega
    await m.drenar();
    expect(m.bt.saldo(a.id)).toBe(500);
    expect(m.carteiras.pendentesNaCaixa).toBe(1);
    expect(espelho(m, a)).toBe(500);
    m.amb.semTick(5000);
    await m.drenar();
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    expect(m.bt.saldo(a.id)).toBe(500);
    expect(espelho(m, a)).toBe(500);
    expect(m.bt.local.moedas.operacao(`sinuca:presente:teste:${a.id}`)).toMatchObject({ ok: true, repetida: true });
  });

  it('a queda no meio da aposta: reservar e liquidar chegam uma vez só cada, e o pote fecha', async () => {
    const m = mundo();
    const [a, b] = [m.nova(), m.nova()];
    await m.drenar();
    m.bt.chamadas.length = 0;
    const mesa = sentar(m, '1x1', [a, b], { aposta: 20 });
    terminar(mesa, 0);
    m.bt.cair(1, { depois: true }); // o reservar é aplicado e a resposta se perde
    await m.drenar();
    m.amb.semTick(5000);
    m.bt.cair(2, { depois: true }); // o reservar repetido responde, o liquidar é aplicado e a resposta se perde
    await m.drenar();
    m.amb.semTick(10_000);
    await m.drenar();
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    expect([m.bt.saldo(a.id), m.bt.saldo(b.id)]).toEqual([120, 80]);
    expect([espelho(m, a), espelho(m, b)]).toEqual([120, 80]);
    expect([m.bt.reservado(a.id), m.bt.reservado(b.id)]).toEqual([0, 0]);
    expect(m.logs.filter((l) => l.startsWith('banco-recusou'))).toEqual([]);
  });
});

describe('a recusa definitiva', () => {
  it('sai da fila, loga banco-recusou com o tipo e o erro (8 caracteres do id, nunca ele inteiro) e a caixa segue', async () => {
    const m = mundo({ presente: { valor: 400, rotulo: 'teste' } });
    const a = m.nova();
    const b = m.nova();
    await m.drenar(); // tudo certo até aqui
    m.logs.length = 0;
    m.bt.recusar('creditar', 'conta-inexistente');
    m.carteiras.registrarMissoes(a.id, { [missoesDoDia(diaDaMissao(m.amb.agora()))[0]!.id]: 99 });
    m.carteiras.registrarMissoes(b.id, { [missoesDoDia(diaDaMissao(m.amb.agora()))[0]!.id]: 99 });
    await m.drenar();
    const recusas = m.logs.filter((l) => l.startsWith('banco-recusou'));
    expect(recusas).toEqual([`banco-recusou {"tipo":"creditar","erro":"conta-inexistente","conta":"${a.id.slice(0, 8)}"}`]);
    for (const l of m.logs) expect(l).not.toContain(a.id);
    expect(m.carteiras.pendentesNaCaixa).toBe(0); // a segunda (da outra carteira) passou
    expect(m.bt.saldo(b.id)).toBe(espelho(m, b));
    expect(m.carteiras.proximaTentativaDaCaixa).toBeNull(); // uma recusa não é falha: sem espera
  });
});

describe('a chave da aposta é única no mundo', () => {
  /** Dois servidores (dois mundos) com o mesmo Banco, o mesmo código de sala e o mesmo relógio; só o sorteio da chave difere. */
  function sorteioComCodigoFixo(variacao: number): (max: number) => number {
    let n = 0;
    return (max) => {
      n++;
      return (n <= TAMANHO_CODIGO ? 7 * n : n * variacao) % max; // as primeiras (o código da sala) iguais; as outras, por servidor
    };
  }

  it('a chave tem o formato sinuca:aposta:<sala em minúsculas>:<ms>:<sorteio>, cabe no ehChave e nenhuma reserva fica sem a mesma', async () => {
    const m = mundo();
    const [a, b] = [m.nova(), m.nova()];
    await m.drenar();
    const mesa = sentar(m, '1x1', [a, b]);
    const e = (m.carteiras as unknown as { caixa: { entradas: { op: { tipo: string; chave?: string } }[] } }).caixa.entradas[0]!;
    expect(e.op.tipo).toBe('reservar');
    expect(e.op.chave).toMatch(new RegExp(`^sinuca:aposta:${mesa.jogadores[0]!.codigo.toLowerCase()}:${m.amb.agora()}:\\d{1,10}$`));
    expect(e.op.chave).toMatch(/^[a-z0-9:._-]{1,110}$/);
  });

  it('duas salas com o mesmo código, no mesmo milissegundo, reservam no mesmo Banco sem colidir (sem o sorteio na chave, colidem e o pote some)', async () => {
    const bt = bancoDeTeste();
    const m1 = mundo({ banco: bt, sortear: sorteioComCodigoFixo(7919) });
    const m2 = mundo({ banco: bt, sortear: sorteioComCodigoFixo(104_729) });
    const [a1, b1] = [m1.nova(), m1.nova()];
    const [a2, b2] = [m2.nova(), m2.nova()];
    await Promise.all([m1.drenar(), m2.drenar()]);
    const mesa1 = sentar(m1, '1x1', [a1, b1]);
    const mesa2 = sentar(m2, '1x1', [a2, b2]);
    expect(mesa1.jogadores[0]!.codigo).toBe(mesa2.jogadores[0]!.codigo); // o mesmo código de sala
    expect(m1.amb.agora()).toBe(m2.amb.agora()); // no mesmo instante
    await Promise.all([m1.drenar(), m2.drenar()]);
    expect(m1.logs.concat(m2.logs).filter((l) => l.startsWith('banco-recusou'))).toEqual([]);
    for (const c of [a1, b1, a2, b2]) expect(bt.reservado(c.id)).toBe(10);
    terminar(mesa1, 0);
    terminar(mesa2, 1);
    await Promise.all([m1.drenar(), m2.drenar()]);
    expect([a1, b1, a2, b2].map((c) => bt.saldo(c.id))).toEqual([110, 90, 90, 110]);
    for (const c of [a1, b1, a2, b2]) expect(bt.reservado(c.id)).toBe(0);
  });
});

describe('o espelho', () => {
  it('um crédito que ainda espera na caixa não some da tela quando o anterior chega', async () => {
    const m = mundo({ presente: { valor: 400, rotulo: 'teste' } });
    const a = m.nova(); // garantir, creditar
    m.bt.cair(2);
    await m.drenar(); // o garantir passa e devolve 100; o creditar de 400 cai
    expect(m.bt.saldo(a.id)).toBe(100);
    expect(espelho(m, a)).toBe(500);
  });

  it('o saldo do Banco manda: se ele diz outro número, o espelho o adota, avisa a sala e loga', async () => {
    const m = mundo();
    const a = m.nova();
    await m.drenar();
    // outro jogo gastou 30 do Banco
    m.bt.local.moedas.debitar(a.id, 30, 'outro-jogo:1', { jogo: 'outro', motivo: 'teste' });
    const avisos: string[] = [];
    m.carteiras.aoMudar((id) => void avisos.push(id));
    m.carteiras.registrarMissoes(a.id, { [missoesDoDia(diaDaMissao(m.amb.agora()))[0]!.id]: 99 });
    const premio = espelho(m, a) - SALDO_INICIAL;
    await m.drenar();
    expect(m.bt.saldo(a.id)).toBe(SALDO_INICIAL - 30 + premio);
    expect(espelho(m, a)).toBe(SALDO_INICIAL - 30 + premio);
    expect(avisos).toContain(a.id);
    expect(m.logs.some((l) => l.startsWith('banco-espelho-corrigido'))).toBe(true);
  });

  it('aplicar com dinheiro e sem a chave da aposta é recusado com a caixa ligada (o espelho não mexe no saldo sem o Banco saber)', () => {
    const m = mundo();
    const a = m.nova();
    expect(m.carteiras.aplicar([{ id: a.id, delta: 10 }])).toBe(false);
    expect(m.logs.some((l) => l.includes('sem-chave-da-aposta'))).toBe(true);
    expect(espelho(m, a)).toBe(SALDO_INICIAL);
    // só estatística (sem dinheiro) segue valendo
    expect(m.carteiras.aplicar([])).toBe(true);
  });
});

describe('com a chave desligada, é como sempre foi', () => {
  it('sem Banco não há caixa, nem chamada, nem espera; reservar e devolver não fazem nada', async () => {
    const carteiras = new CarteirasEmMemoria({ maxCarteiras: 10, relogio: () => 1, log: () => {} });
    const c = carteiras.criar()!;
    expect(carteiras.saldoNoBanco).toBe(false);
    expect(carteiras.pendentesNaCaixa).toBe(0);
    expect(carteiras.proximaTentativaDaCaixa).toBeNull();
    carteiras.reservarAposta('aposta:x', [{ id: c.id, valor: 10 }]);
    carteiras.devolverAposta('aposta:x');
    expect(carteiras.pendentesNaCaixa).toBe(0);
    expect(carteiras.aplicar([{ id: c.id, delta: 5 }])).toBe(true);
    await carteiras.drenarCaixa();
    expect(carteiras.ler(c.id)!.saldo).toBe(SALDO_INICIAL + 5);
  });
});

describe('no Durable Object: a caixa vai na mesma transação do saldo e sobrevive ao objeto despejado', () => {
  function abrirNoDO(sqlite: ReturnType<typeof bancoSqlite>, bt: BancoDeTeste | null, agora: { valor: number }, logs: string[] = []) {
    return new CarteirasNoDO({
      sql: sqlite.sql,
      transacao: sqlite.transacao,
      maxCarteiras: 100,
      relogio: () => agora.valor,
      log: (e, c = {}) => logs.push(`${e} ${JSON.stringify(c)}`),
      banco: bt ? bt.banco : null,
    });
  }
  const linhasDaSaida = (sqlite: ReturnType<typeof bancoSqlite>) => sqlite.db.prepare('SELECT ordem, op, tentativas FROM saida_do_banco ORDER BY ordem').all() as { ordem: number; op: string; tentativas: number }[];

  it('com o Banco fora, a tabela guarda as operações; o objeto novo as lê e as drena uma vez só', async () => {
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    bt.fora = true;
    const sqlite = bancoSqlite();
    const antes = abrirNoDO(sqlite, bt, agora);
    const a = antes.criar()!;
    const b = antes.criar()!;
    await antes.drenarCaixa();
    expect(linhasDaSaida(sqlite).map((l) => [l.ordem, JSON.parse(l.op).tipo, l.tentativas])).toEqual([[1, 'garantir', 1], [2, 'garantir', 0]]);
    expect(antes.proximaTentativaDaCaixa).toBe(agora.valor + 5000);

    // o objeto é despejado e acorda: mesma tabela, outro objeto, o Banco ainda fora do ar
    const depois = abrirNoDO(sqlite, bt, agora);
    expect(depois.pendentesNaCaixa).toBe(2);
    expect(depois.total).toBe(2);
    bt.fora = false;
    agora.valor += 5000;
    await depois.drenarCaixa();
    expect(depois.pendentesNaCaixa).toBe(0);
    expect(linhasDaSaida(sqlite)).toEqual([]);
    expect([bt.saldo(a.id), bt.saldo(b.id)]).toEqual([100, 100]);
    // acordar de novo depois de tudo enviado não manda nada
    const chamadas = bt.chamadas.length;
    const outro = abrirNoDO(sqlite, bt, agora);
    await outro.drenarCaixa();
    expect(bt.chamadas.length).toBe(chamadas);
  });

  it('o objeto que acorda com a caixa cheia começa a drenar sozinho (sem alarm nem requisição)', async () => {
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    bt.fora = true;
    const sqlite = bancoSqlite();
    const antes = abrirNoDO(sqlite, bt, agora);
    const a = antes.criar()!;
    await antes.drenarCaixa();
    bt.fora = false;
    abrirNoDO(sqlite, bt, agora);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(bt.saldo(a.id)).toBe(100);
    expect(linhasDaSaida(sqlite)).toEqual([]);
  });

  it('a operação e o saldo entram juntos ou nenhum: gravação que falha não deixa um sem o outro', async () => {
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    bt.fora = true;
    const sqlite = bancoSqlite();
    const logs: string[] = [];
    const c = abrirNoDO(sqlite, bt, agora, logs);
    sqlite.falharQuando = /INSERT INTO saida_do_banco/;
    const nova = c.criar()!;
    expect(c.ler(nova.id)!.saldo).toBe(100); // a memória vale
    expect(sqlite.db.prepare('SELECT COUNT(*) AS n FROM carteiras').get()).toEqual({ n: 0 }); // e a carteira não entrou sem a operação
    expect(linhasDaSaida(sqlite)).toEqual([]);
    expect(c.pendentes).toBeGreaterThan(0);
    sqlite.falharQuando = null;
    c.tentarPendentes();
    expect(sqlite.db.prepare('SELECT COUNT(*) AS n FROM carteiras').get()).toEqual({ n: 1 });
    expect(linhasDaSaida(sqlite)).toHaveLength(1);
    expect(c.pendentes).toBe(0);
    expect(escritasDe(sqlite.comandos).some((s) => s.startsWith('INSERT INTO saida_do_banco'))).toBe(true);
  });

  it('desligado, o esquema é o de sempre (sem a tabela) e uma tabela que sobrou é ignorada', () => {
    const agora = { valor: 1 };
    const sqlite = bancoSqlite();
    const sem = abrirNoDO(sqlite, null, agora);
    sem.criar();
    expect(sqlite.db.prepare("SELECT name FROM sqlite_master WHERE name = 'saida_do_banco'").all()).toEqual([]);
    expect(sem.saldoNoBanco).toBe(false);
  });

  it('linha da tabela que não presta não é enviada nem apagada, e a ordem seguinte passa dela', async () => {
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    const sqlite = bancoSqlite();
    const logs: string[] = [];
    abrirNoDO(sqlite, bt, agora, logs);
    sqlite.db.prepare("INSERT INTO saida_do_banco (ordem, op, tentativas, criada_em) VALUES (7, 'nao é json', 0, 1)").run();
    const c = abrirNoDO(sqlite, bt, agora, logs);
    expect(c.pendentesNaCaixa).toBe(0);
    expect(logs.some((l) => l.startsWith('saida-invalida'))).toBe(true);
    const nova = c.criar()!;
    await c.drenarCaixa();
    expect(bt.saldo(nova.id)).toBe(100);
    expect(linhasDaSaida(sqlite).map((l) => l.ordem)).toEqual([7]);
  });
});

describe('uma partida nova solta a reserva da anterior que ainda tinha chave (L60b, baixo 4)', () => {
  it('comecar devolve a chave da aposta em curso antes de reservar a nova: nada fica preso no Banco', async () => {
    const m = mundo();
    const [a, b] = [m.nova(), m.nova()];
    await m.drenar();
    const mesa = sentar(m, '1x1', [a, b], { aposta: 50 });
    await m.drenar();
    expect([m.bt.reservado(a.id), m.bt.reservado(b.id)]).toEqual([50, 50]);

    expect(mesa.jogadores).toHaveLength(2);
    const sala = [...(m.amb.registro as unknown as { salaDe: Map<unknown, unknown> }).salaDe.values()][0] as { partida: EstadoPartida; comecar(motivo: string, jogadores: Jogador[]): void };
    sala.comecar('nova-partida', sala.partida.jogadores as Jogador[]);
    await m.drenar();
    expect(nomesDasChamadas(m.bt).filter((n) => n === 'devolver')).toHaveLength(1);
    expect([m.bt.reservado(a.id), m.bt.reservado(b.id)]).toEqual([50, 50]); // só a reserva da partida nova: a anterior foi solta
  });
});

describe('a queda', () => {
  it('o RPC lança na 2ª operação: a caixa para, nada se perde e depois drena tudo', async () => {
    const m = mundo({ presente: { valor: 400, rotulo: 'teste' } });
    const a = m.nova(); // garantir + creditar
    const b = m.nova(); // garantir + creditar
    m.bt.cair(2);
    await m.drenar();
    expect(nomesDasChamadas(m.bt)).toEqual(['garantirConta', 'creditar']);
    expect(m.carteiras.pendentesNaCaixa).toBe(3);
    // uma exceção só desta operação, com o Banco respondendo à sonda (L60b): é golpe nela, não Banco fora do ar
    expect(m.logs.some((l) => l.startsWith('banco-golpe'))).toBe(true);
    // o espelho não perde o crédito que ainda espera: 100 do Banco + 400 na caixa
    expect(espelho(m, a)).toBe(500);
    expect(m.bt.saldo(a.id)).toBe(100);
    // dentro da espera de 5 s o despachante nem chama o Banco
    const chamadasAntes = m.bt.chamadas.length;
    await m.drenar();
    expect(m.bt.chamadas.length).toBe(chamadasAntes);
    expect(m.carteiras.proximaTentativaDaCaixa).toBe(m.amb.agora() + 5000);

    m.amb.semTick(5000);
    await m.drenar();
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    for (const c of [a, b]) {
      expect(m.bt.saldo(c.id)).toBe(500);
      expect(espelho(m, c)).toBe(500);
    }
  });

  it('a resposta se perde depois de o Banco aplicar: o reenvio volta repetida e não paga duas vezes', async () => {
    const m = mundo({ presente: { valor: 400, rotulo: 'teste' } });
    const a = m.nova();
    m.bt.cair(2, { depois: true }); // o creditar é aplicado no Banco, mas a resposta não chega
    await m.drenar();
    expect(m.bt.saldo(a.id)).toBe(500);
    expect(m.carteiras.pendentesNaCaixa).toBe(1);
    expect(espelho(m, a)).toBe(500);
    m.amb.semTick(5000);
    await m.drenar();
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    expect(m.bt.saldo(a.id)).toBe(500);
    expect(espelho(m, a)).toBe(500);
    expect(m.bt.local.moedas.operacao(`sinuca:presente:teste:${a.id}`)).toMatchObject({ ok: true, repetida: true });
  });

  it('a queda no meio da aposta: reservar e liquidar chegam uma vez só cada, e o pote fecha', async () => {
    const m = mundo();
    const [a, b] = [m.nova(), m.nova()];
    await m.drenar();
    m.bt.chamadas.length = 0;
    const mesa = sentar(m, '1x1', [a, b], { aposta: 20 });
    terminar(mesa, 0);
    m.bt.cair(1, { depois: true }); // o reservar é aplicado e a resposta se perde
    await m.drenar();
    m.amb.semTick(5000);
    m.bt.cair(2, { depois: true }); // o reservar repetido responde, o liquidar é aplicado e a resposta se perde
    await m.drenar();
    m.amb.semTick(10_000);
    await m.drenar();
    expect(m.carteiras.pendentesNaCaixa).toBe(0);
    expect([m.bt.saldo(a.id), m.bt.saldo(b.id)]).toEqual([120, 80]);
    expect([espelho(m, a), espelho(m, b)]).toEqual([120, 80]);
    expect([m.bt.reservado(a.id), m.bt.reservado(b.id)]).toEqual([0, 0]);
    expect(m.logs.filter((l) => l.startsWith('banco-recusou'))).toEqual([]);
  });
});

describe('a recusa definitiva', () => {
  it('sai da fila, loga banco-recusou com o tipo e o erro (8 caracteres do id, nunca ele inteiro) e a caixa segue', async () => {
    const m = mundo({ presente: { valor: 400, rotulo: 'teste' } });
    const a = m.nova();
    const b = m.nova();
    await m.drenar(); // tudo certo até aqui
    m.logs.length = 0;
    m.bt.recusar('creditar', 'conta-inexistente');
    m.carteiras.registrarMissoes(a.id, { [missoesDoDia(diaDaMissao(m.amb.agora()))[0]!.id]: 99 });
    m.carteiras.registrarMissoes(b.id, { [missoesDoDia(diaDaMissao(m.amb.agora()))[0]!.id]: 99 });
    await m.drenar();
    const recusas = m.logs.filter((l) => l.startsWith('banco-recusou'));
    expect(recusas).toEqual([`banco-recusou {"tipo":"creditar","erro":"conta-inexistente","conta":"${a.id.slice(0, 8)}"}`]);
    for (const l of m.logs) expect(l).not.toContain(a.id);
    expect(m.carteiras.pendentesNaCaixa).toBe(0); // a segunda (da outra carteira) passou
    expect(m.bt.saldo(b.id)).toBe(espelho(m, b));
    expect(m.carteiras.proximaTentativaDaCaixa).toBeNull(); // uma recusa não é falha: sem espera
  });
});

describe('a chave da aposta é única no mundo', () => {
  /** Dois servidores (dois mundos) com o mesmo Banco, o mesmo código de sala e o mesmo relógio; só o sorteio da chave difere. */
  function sorteioComCodigoFixo(variacao: number): (max: number) => number {
    let n = 0;
    return (max) => {
      n++;
      return (n <= TAMANHO_CODIGO ? 7 * n : n * variacao) % max; // as primeiras (o código da sala) iguais; as outras, por servidor
    };
  }

  it('a chave tem o formato sinuca:aposta:<sala em minúsculas>:<ms>:<sorteio>, cabe no ehChave e nenhuma reserva fica sem a mesma', async () => {
    const m = mundo();
    const [a, b] = [m.nova(), m.nova()];
    await m.drenar();
    const mesa = sentar(m, '1x1', [a, b]);
    const e = (m.carteiras as unknown as { caixa: { entradas: { op: { tipo: string; chave?: string } }[] } }).caixa.entradas[0]!;
    expect(e.op.tipo).toBe('reservar');
    expect(e.op.chave).toMatch(new RegExp(`^sinuca:aposta:${mesa.jogadores[0]!.codigo.toLowerCase()}:${m.amb.agora()}:\\d{1,10}$`));
    expect(e.op.chave).toMatch(/^[a-z0-9:._-]{1,110}$/);
  });

  it('duas salas com o mesmo código, no mesmo milissegundo, reservam no mesmo Banco sem colidir (sem o sorteio na chave, colidem e o pote some)', async () => {
    const bt = bancoDeTeste();
    const m1 = mundo({ banco: bt, sortear: sorteioComCodigoFixo(7919) });
    const m2 = mundo({ banco: bt, sortear: sorteioComCodigoFixo(104_729) });
    const [a1, b1] = [m1.nova(), m1.nova()];
    const [a2, b2] = [m2.nova(), m2.nova()];
    await Promise.all([m1.drenar(), m2.drenar()]);
    const mesa1 = sentar(m1, '1x1', [a1, b1]);
    const mesa2 = sentar(m2, '1x1', [a2, b2]);
    expect(mesa1.jogadores[0]!.codigo).toBe(mesa2.jogadores[0]!.codigo); // o mesmo código de sala
    expect(m1.amb.agora()).toBe(m2.amb.agora()); // no mesmo instante
    await Promise.all([m1.drenar(), m2.drenar()]);
    expect(m1.logs.concat(m2.logs).filter((l) => l.startsWith('banco-recusou'))).toEqual([]);
    for (const c of [a1, b1, a2, b2]) expect(bt.reservado(c.id)).toBe(10);
    terminar(mesa1, 0);
    terminar(mesa2, 1);
    await Promise.all([m1.drenar(), m2.drenar()]);
    expect([a1, b1, a2, b2].map((c) => bt.saldo(c.id))).toEqual([110, 90, 90, 110]);
    for (const c of [a1, b1, a2, b2]) expect(bt.reservado(c.id)).toBe(0);
  });
});

describe('o espelho', () => {
  it('um crédito que ainda espera na caixa não some da tela quando o anterior chega', async () => {
    const m = mundo({ presente: { valor: 400, rotulo: 'teste' } });
    const a = m.nova(); // garantir, creditar
    m.bt.cair(2);
    await m.drenar(); // o garantir passa e devolve 100; o creditar de 400 cai
    expect(m.bt.saldo(a.id)).toBe(100);
    expect(espelho(m, a)).toBe(500);
  });

  it('o saldo do Banco manda: se ele diz outro número, o espelho o adota, avisa a sala e loga', async () => {
    const m = mundo();
    const a = m.nova();
    await m.drenar();
    // outro jogo gastou 30 do Banco
    m.bt.local.moedas.debitar(a.id, 30, 'outro-jogo:1', { jogo: 'outro', motivo: 'teste' });
    const avisos: string[] = [];
    m.carteiras.aoMudar((id) => void avisos.push(id));
    m.carteiras.registrarMissoes(a.id, { [missoesDoDia(diaDaMissao(m.amb.agora()))[0]!.id]: 99 });
    const premio = espelho(m, a) - SALDO_INICIAL;
    await m.drenar();
    expect(m.bt.saldo(a.id)).toBe(SALDO_INICIAL - 30 + premio);
    expect(espelho(m, a)).toBe(SALDO_INICIAL - 30 + premio);
    expect(avisos).toContain(a.id);
    expect(m.logs.some((l) => l.startsWith('banco-espelho-corrigido'))).toBe(true);
  });

  it('aplicar com dinheiro e sem a chave da aposta é recusado com a caixa ligada (o espelho não mexe no saldo sem o Banco saber)', () => {
    const m = mundo();
    const a = m.nova();
    expect(m.carteiras.aplicar([{ id: a.id, delta: 10 }])).toBe(false);
    expect(m.logs.some((l) => l.includes('sem-chave-da-aposta'))).toBe(true);
    expect(espelho(m, a)).toBe(SALDO_INICIAL);
    // só estatística (sem dinheiro) segue valendo
    expect(m.carteiras.aplicar([])).toBe(true);
  });
});

describe('com a chave desligada, é como sempre foi', () => {
  it('sem Banco não há caixa, nem chamada, nem espera; reservar e devolver não fazem nada', async () => {
    const carteiras = new CarteirasEmMemoria({ maxCarteiras: 10, relogio: () => 1, log: () => {} });
    const c = carteiras.criar()!;
    expect(carteiras.saldoNoBanco).toBe(false);
    expect(carteiras.pendentesNaCaixa).toBe(0);
    expect(carteiras.proximaTentativaDaCaixa).toBeNull();
    carteiras.reservarAposta('aposta:x', [{ id: c.id, valor: 10 }]);
    carteiras.devolverAposta('aposta:x');
    expect(carteiras.pendentesNaCaixa).toBe(0);
    expect(carteiras.aplicar([{ id: c.id, delta: 5 }])).toBe(true);
    await carteiras.drenarCaixa();
    expect(carteiras.ler(c.id)!.saldo).toBe(SALDO_INICIAL + 5);
  });
});

describe('no Durable Object: a caixa vai na mesma transação do saldo e sobrevive ao objeto despejado', () => {
  function abrirNoDO(sqlite: ReturnType<typeof bancoSqlite>, bt: BancoDeTeste | null, agora: { valor: number }, logs: string[] = []) {
    return new CarteirasNoDO({
      sql: sqlite.sql,
      transacao: sqlite.transacao,
      maxCarteiras: 100,
      relogio: () => agora.valor,
      log: (e, c = {}) => logs.push(`${e} ${JSON.stringify(c)}`),
      banco: bt ? bt.banco : null,
    });
  }
  const linhasDaSaida = (sqlite: ReturnType<typeof bancoSqlite>) => sqlite.db.prepare('SELECT ordem, op, tentativas FROM saida_do_banco ORDER BY ordem').all() as { ordem: number; op: string; tentativas: number }[];

  it('com o Banco fora, a tabela guarda as operações; o objeto novo as lê e as drena uma vez só', async () => {
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    bt.fora = true;
    const sqlite = bancoSqlite();
    const antes = abrirNoDO(sqlite, bt, agora);
    const a = antes.criar()!;
    const b = antes.criar()!;
    await antes.drenarCaixa();
    expect(linhasDaSaida(sqlite).map((l) => [l.ordem, JSON.parse(l.op).tipo, l.tentativas])).toEqual([[1, 'garantir', 1], [2, 'garantir', 0]]);
    expect(antes.proximaTentativaDaCaixa).toBe(agora.valor + 5000);

    // o objeto é despejado e acorda: mesma tabela, outro objeto, o Banco ainda fora do ar
    const depois = abrirNoDO(sqlite, bt, agora);
    expect(depois.pendentesNaCaixa).toBe(2);
    expect(depois.total).toBe(2);
    bt.fora = false;
    agora.valor += 5000;
    await depois.drenarCaixa();
    expect(depois.pendentesNaCaixa).toBe(0);
    expect(linhasDaSaida(sqlite)).toEqual([]);
    expect([bt.saldo(a.id), bt.saldo(b.id)]).toEqual([100, 100]);
    // acordar de novo depois de tudo enviado não manda nada
    const chamadas = bt.chamadas.length;
    const outro = abrirNoDO(sqlite, bt, agora);
    await outro.drenarCaixa();
    expect(bt.chamadas.length).toBe(chamadas);
  });

  it('o objeto que acorda com a caixa cheia começa a drenar sozinho (sem alarm nem requisição)', async () => {
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    bt.fora = true;
    const sqlite = bancoSqlite();
    const antes = abrirNoDO(sqlite, bt, agora);
    const a = antes.criar()!;
    await antes.drenarCaixa();
    bt.fora = false;
    abrirNoDO(sqlite, bt, agora);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(bt.saldo(a.id)).toBe(100);
    expect(linhasDaSaida(sqlite)).toEqual([]);
  });

  it('a operação e o saldo entram juntos ou nenhum: gravação que falha não deixa um sem o outro', async () => {
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    bt.fora = true;
    const sqlite = bancoSqlite();
    const logs: string[] = [];
    const c = abrirNoDO(sqlite, bt, agora, logs);
    sqlite.falharQuando = /INSERT INTO saida_do_banco/;
    const nova = c.criar()!;
    expect(c.ler(nova.id)!.saldo).toBe(100); // a memória vale
    expect(sqlite.db.prepare('SELECT COUNT(*) AS n FROM carteiras').get()).toEqual({ n: 0 }); // e a carteira não entrou sem a operação
    expect(linhasDaSaida(sqlite)).toEqual([]);
    expect(c.pendentes).toBeGreaterThan(0);
    sqlite.falharQuando = null;
    c.tentarPendentes();
    expect(sqlite.db.prepare('SELECT COUNT(*) AS n FROM carteiras').get()).toEqual({ n: 1 });
    expect(linhasDaSaida(sqlite)).toHaveLength(1);
    expect(c.pendentes).toBe(0);
    expect(escritasDe(sqlite.comandos).some((s) => s.startsWith('INSERT INTO saida_do_banco'))).toBe(true);
  });

  it('desligado, o esquema é o de sempre (sem a tabela) e uma tabela que sobrou é ignorada', () => {
    const agora = { valor: 1 };
    const sqlite = bancoSqlite();
    const sem = abrirNoDO(sqlite, null, agora);
    sem.criar();
    expect(sqlite.db.prepare("SELECT name FROM sqlite_master WHERE name = 'saida_do_banco'").all()).toEqual([]);
    expect(sem.saldoNoBanco).toBe(false);
  });

  it('linha da tabela que não presta não é enviada nem apagada, e a ordem seguinte passa dela', async () => {
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    const sqlite = bancoSqlite();
    const logs: string[] = [];
    abrirNoDO(sqlite, bt, agora, logs);
    sqlite.db.prepare("INSERT INTO saida_do_banco (ordem, op, tentativas, criada_em) VALUES (7, 'nao é json', 0, 1)").run();
    const c = abrirNoDO(sqlite, bt, agora, logs);
    expect(c.pendentesNaCaixa).toBe(0);
    expect(logs.some((l) => l.startsWith('saida-invalida'))).toBe(true);
    const nova = c.criar()!;
    await c.drenarCaixa();
    expect(bt.saldo(nova.id)).toBe(100);
    expect(linhasDaSaida(sqlite).map((l) => l.ordem)).toEqual([7]);
  });
});
