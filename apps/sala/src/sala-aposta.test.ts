/**
 * A aposta e a carteira dentro da sala (L22): a aposta como regra da sala, o saldo e a skin de cada lugar, e o pote pago no fim
 * da partida. O motor das regras é o de verdade até a tacada que acaba a partida: essa o teste manda acabar para a equipe que
 * escolhe (a conta que se prova aqui é a do dinheiro, não a do jogo).
 */
import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { APOSTAS_DA_SALA, APOSTA_PADRAO, LUGARES_POR_MODO, SALDO_INICIAL, type ApostaSala, type MensagemDaSala, type ModoSala, type MsgApostaPaga } from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESET_MATA_MATA, aplicarTacada, novaPartida, type ConfigRegras, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { ClienteDeTeste, SEM_LIMITE, TACADA_MEDIA, criarAmbiente, type Ambiente } from './para-testes';
import type { MotorDeRegras } from './regras';

const fim = (p: EstadoPartida, vencedor: number | null): ResultadoRegras => ({
  partida: { ...p, fase: 'fim', vencedor },
  consequencias: { faltas: [], retirar: [], recolocar: [], proximo: p.vez, vencedor, texto: 'fim' },
});

interface Carteira {
  readonly codigo: string;
  readonly id: string;
}

interface Mesa {
  readonly amb: Ambiente;
  /** Quem vence a próxima tacada que o teste mandar acabar a partida; `undefined` = regras de verdade. */
  controle: { acabaCom?: number | 'ninguem' };
  readonly jogadores: ClienteDeTeste[];
  readonly carteiras: (Carteira | null)[];
}

/** O dinheiro que se prova aqui é o do pote: as missões (que também pagam no fim da partida) têm o arquivo delas. */
const SEM_MISSOES = { missoesDiarias: false };

const NOMES = ['Ana', 'Beto', 'Cida', 'Davi'];

function novoAmbiente() {
  const controle: Mesa['controle'] = {};
  const regras: MotorDeRegras = {
    novaPartida,
    aplicarTacada: (p, eventos) => (controle.acabaCom === undefined ? aplicarTacada(p, eventos) : fim(p, controle.acabaCom === 'ninguem' ? null : controle.acabaCom)),
  };
  return { amb: criarAmbiente(SEM_MISSOES, { regras }), controle };
}

/** Uma carteira nova com `saldo` moedas. */
function carteira(amb: Ambiente, saldo = SALDO_INICIAL): Carteira {
  const nova = amb.registro.carteiras.criar()!;
  if (saldo !== SALDO_INICIAL) amb.registro.carteiras.aplicar([{ id: nova.id, delta: saldo - SALDO_INICIAL }]);
  return nova;
}

interface OpcoesDaMesa {
  readonly regras?: ConfigRegras;
  readonly aposta?: ApostaSala;
  readonly iniciar?: boolean;
}

/** Sala do `modo` com as `carteiras` nos lugares (null = sem carteira). Anfitrião no 0, convidados nos seguintes. */
function sentar(modo: ModoSala, carteiras: readonly (Carteira | null)[], opcoes: OpcoesDaMesa = {}, base = novoAmbiente()): Mesa {
  const quantos = LUGARES_POR_MODO[modo];
  const jogadores = NOMES.slice(0, quantos).map((n) => new ClienteDeTeste(base.amb, n));
  const extra = { ...(opcoes.aposta === undefined ? {} : { aposta: opcoes.aposta }), ...(carteiras[0] ? { carteira: carteiras[0].codigo } : {}) };
  jogadores[0]!.criar(modo, opcoes.regras ?? PRESET_BOTECO.regras, SEM_LIMITE, undefined, extra);
  jogadores.slice(1).forEach((c, i) => c.entrar(jogadores[0]!.codigo, undefined, carteiras[i + 1]?.codigo));
  if (opcoes.iniciar !== false) jogadores[0]!.enviar({ tipo: 'iniciar' });
  return { amb: base.amb, controle: base.controle, jogadores, carteiras: [...carteiras] };
}

const saldoDe = (m: Mesa, lugar: number): number => m.amb.registro.carteiras.ler(m.carteiras[lugar]!.id)!.saldo;
const saldos = (m: Mesa): (number | null)[] => m.carteiras.map((c) => (c ? m.amb.registro.carteiras.ler(c.id)!.saldo : null));

const quemTemAVez = (m: Mesa): ClienteDeTeste => m.jogadores.find((c) => c.lugar === m.jogadores[0]!.estado.vez)!;

/** A tacada de quem tem a vez que acaba a partida para a `equipe`. Devolve o que cada cliente já tinha recebido antes dela. */
function terminar(m: Mesa, equipe: number | 'ninguem', quem: ClienteDeTeste = quemTemAVez(m)): number[] {
  const marcas = m.jogadores.map((c) => c.conn.recebidas.length);
  m.controle.acabaCom = equipe;
  const v = quem.visao!;
  const fimDaPartida = fim(v.partida, equipe === 'ninguem' ? null : equipe).partida;
  quem.enviar({ tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fimDaPartida, mesa: v.mesa });
  delete m.controle.acabaCom;
  return marcas;
}

const depoisDe = (m: Mesa, quem: number, marcas: number[]): MensagemDaSala[] => m.jogadores[quem]!.conn.recebidas.slice(marcas[quem]);
const apostaPaga = (c: ClienteDeTeste): MsgApostaPaga | undefined => c.conn.ultima('aposta-paga');

/** Volta ao lobby e inicia outra partida com os mesmos lugares. */
function outraPartida(m: Mesa): void {
  m.jogadores[0]!.enviar({ tipo: 'voltar-ao-lobby' });
  m.jogadores[0]!.enviar({ tipo: 'iniciar' });
}

describe('a aposta é regra da sala (L22)', () => {
  it('o padrão é 10 e o estado-sala sempre a leva', () => {
    const m = sentar('1x1', [null, null]);
    expect(APOSTA_PADRAO).toBe(10);
    for (const c of m.jogadores) expect(c.estado.aposta, c.nome).toBe(10);
  });

  it('o anfitrião escolhe uma aposta do catálogo ao criar a sala', () => {
    for (const aposta of APOSTAS_DA_SALA) {
      const m = sentar('1x1', [null, null], { aposta, iniciar: false });
      expect(m.jogadores[1]!.estado.aposta, String(aposta)).toBe(aposta);
    }
  });

  it('na espera o anfitrião troca a aposta e todos veem; ela fica quando a partida volta ao lobby', () => {
    const m = sentar('1x1', [null, null], { iniciar: false });
    m.jogadores[0]!.enviar({ tipo: 'configurar-sala', aposta: 100 });
    for (const c of m.jogadores) expect(c.estado.aposta, c.nome).toBe(100);
    m.jogadores[0]!.enviar({ tipo: 'iniciar' });
    terminar(m, 0);
    m.jogadores[0]!.enviar({ tipo: 'voltar-ao-lobby' });
    for (const c of m.jogadores) expect(c.estado, c.nome).toMatchObject({ fase: 'espera', aposta: 100 });
  });

  it('configurar-sala sem dizer a aposta não a muda, e junto de outras mudanças vale tudo ou nada', () => {
    const m = sentar('1x1', [null, null], { aposta: 50, iniciar: false });
    m.jogadores[0]!.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 45 } });
    expect(m.jogadores[0]!.estado).toMatchObject({ aposta: 50, relogio: { tempoS: 45 } });
    m.jogadores[0]!.enviar({ tipo: 'configurar-sala', aposta: 20, relogio: { tempoS: 15 }, giz: { desgasteMin: 0.4, desgasteMax: 0.1 } });
    expect(m.jogadores[0]!.ultimoErro).toMatchObject({ codigo: 'regras-invalidas' });
    expect(m.jogadores[0]!.estado).toMatchObject({ aposta: 50, relogio: { tempoS: 45 } });
  });

  it('só o anfitrião e só na espera: o convidado leva nao-anfitriao, e com a partida em curso, fase-errada', () => {
    const m = sentar('1x1', [null, null], { iniciar: false });
    m.jogadores[1]!.enviar({ tipo: 'configurar-sala', aposta: 100 });
    expect(m.jogadores[1]!.ultimoErro).toMatchObject({ codigo: 'nao-anfitriao' });
    m.jogadores[0]!.enviar({ tipo: 'iniciar' });
    m.jogadores[0]!.enviar({ tipo: 'configurar-sala', aposta: 100 });
    expect(m.jogadores[0]!.ultimoErro).toMatchObject({ codigo: 'fase-errada' });
    expect(m.jogadores[0]!.estado.aposta).toBe(10);
  });

  it('valor fora do catálogo é recusado pela sala mesmo que a forma tenha passado (criar e configurar), sem mudar nada', () => {
    const amb = criarAmbiente(SEM_MISSOES);
    const ana = new ClienteDeTeste(amb, 'Ana');
    for (const aposta of [0, 5, 15, 101, -10, 10.5]) {
      ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { aposta } as never);
      expect(ana.ultimoErro, String(aposta)).toMatchObject({ codigo: 'regras-invalidas' });
    }
    expect(amb.registro.totalSalas).toBe(0);
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { aposta: 20 });
    for (const aposta of [0, 15, 1000]) {
      ana.enviar({ tipo: 'configurar-sala', aposta } as never);
      expect(ana.ultimoErro, String(aposta)).toMatchObject({ codigo: 'regras-invalidas' });
    }
    expect(ana.estado.aposta).toBe(20);
  });
});

describe('o saldo e a skin de cada lugar', () => {
  it('quem senta com carteira mostra o saldo e a skin dela; sem carteira, ou lugar vago, é null e clássico', () => {
    const base = novoAmbiente();
    const ana = carteira(base.amb, 250);
    base.amb.registro.carteiras.aplicar([{ id: ana.id, delta: 1000 }]);
    base.amb.registro.carteiras.comprar(ana.id, 'ouro');
    base.amb.registro.carteiras.usar(ana.id, 'ouro');
    const m = sentar('2x1', [ana, null, null], { iniciar: false }, base);
    for (const c of m.jogadores) {
      expect(c.estado.lugares.map((l) => [l.saldo, l.skin]), c.nome).toEqual([[250 + 1000 - 500, 'ouro'], [null, 'classico'], [null, 'classico'], [null, 'classico']]);
    }
  });

  it('o saldo é público: o espectador também o vê', () => {
    const base = novoAmbiente();
    const ana = carteira(base.amb, 70);
    const m = sentar('1x1', [ana, null], { iniciar: false }, base);
    const esp = new ClienteDeTeste(base.amb, 'Esp');
    esp.entrar(m.jogadores[0]!.codigo);
    expect(esp.lugar).toBeNull();
    expect(esp.estado.lugares[0]).toMatchObject({ saldo: 70, skin: 'classico' });
  });

  it('código que a sala não conhece (servidor que perdeu os dados) é jogar sem carteira, sem erro', () => {
    const amb = criarAmbiente(SEM_MISSOES);
    const ana = new ClienteDeTeste(amb, 'Ana');
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { carteira: 'z'.repeat(43) });
    expect(ana.erros).toEqual([]);
    expect(ana.estado.lugares[0]).toMatchObject({ nome: 'Ana', saldo: null, skin: 'classico' });
  });

  it('o código da carteira nunca vai a ninguém, nem o id interno, nem ao log', () => {
    const base = novoAmbiente();
    const ana = carteira(base.amb, 300);
    const beto = carteira(base.amb, 40);
    const m = sentar('1x1', [ana, beto], {}, base);
    terminar(m, 0);
    base.amb.registro.carteiras.comprar(ana.id, 'ebano');
    base.amb.registro.carteiras.usar(ana.id, 'ebano');
    const esp = new ClienteDeTeste(base.amb, 'Esp');
    esp.entrar(m.jogadores[0]!.codigo);
    const tudo = [...m.jogadores, esp].map((c) => JSON.stringify(c.conn.recebidas)).join('\n') + '\n' + base.amb.logs.join('\n');
    for (const c of [ana, beto]) {
      expect(tudo).not.toContain(c.codigo);
      expect(tudo).not.toContain(c.id);
    }
  });

  it('quem volta com o token conserva a carteira; uma carteira diferente no retorno não a troca', () => {
    const base = novoAmbiente();
    const ana = carteira(base.amb, 100);
    const beto = carteira(base.amb, 150);
    const intruso = carteira(base.amb, 9999);
    const m = sentar('1x1', [ana, beto], { iniciar: false }, base);
    const b = m.jogadores[1]!;
    const { codigo, token } = b;
    b.sair();
    const volta = new ClienteDeTeste(base.amb, 'Beto');
    volta.entrar(codigo, token, intruso.codigo);
    expect(volta.lugar).toBe(1);
    expect(m.jogadores[0]!.estado.lugares[1]).toMatchObject({ saldo: 150, conectado: true });
  });

  it('comprar ou trocar a skin pelo armazém manda estado-sala novo a quem está na sala dessa carteira, e só a ela', () => {
    const base = novoAmbiente();
    const ana = carteira(base.amb, 1000);
    const cida = carteira(base.amb, 1000);
    const salaA = sentar('1x1', [ana, null], { iniciar: false }, base);
    const salaB = sentar('1x1', [cida, null], { iniciar: false }, base);
    const lojas = base.amb.registro.carteiras;
    const contar = (m: Mesa) => m.jogadores.map((c) => c.conn.todas('estado-sala').length);
    const antesA = contar(salaA);
    const antesB = contar(salaB);
    lojas.comprar(ana.id, 'neon');
    expect(contar(salaA)).toEqual(antesA.map((n) => n + 1));
    expect(contar(salaB)).toEqual(antesB);
    expect(salaA.jogadores[1]!.estado.lugares[0]).toMatchObject({ saldo: 700, skin: 'classico' });
    lojas.usar(ana.id, 'neon');
    expect(salaA.jogadores[1]!.estado.lugares[0]).toMatchObject({ skin: 'neon' });
    expect(contar(salaB)).toEqual(antesB);
  });

  it('a mesma carteira em duas salas: as duas são avisadas', () => {
    const base = novoAmbiente();
    const ana = carteira(base.amb, 1000);
    const a = sentar('1x1', [ana, null], { iniciar: false }, base);
    const b = sentar('1x1', [ana, null], { iniciar: false }, base);
    base.amb.registro.carteiras.comprar(ana.id, 'ebano');
    expect(a.jogadores[1]!.estado.lugares[0]!.saldo).toBe(950);
    expect(b.jogadores[1]!.estado.lugares[0]!.saldo).toBe(950);
  });

  it('carteira de espectador (sem lugar) não tem o que mostrar: mudar nela não manda estado a ninguém', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [null, null], { iniciar: false }, base);
    const espectadora = carteira(base.amb, 1000);
    const esp = new ClienteDeTeste(base.amb, 'Esp');
    esp.entrar(m.jogadores[0]!.codigo, undefined, espectadora.codigo);
    const antes = m.jogadores[0]!.conn.todas('estado-sala').length;
    base.amb.registro.carteiras.comprar(espectadora.id, 'ebano');
    expect(m.jogadores[0]!.conn.todas('estado-sala').length).toBe(antes);
  });
});

describe('o pote no fim da partida', () => {
  it('1x1: o vencedor leva a aposta do perdedor, e a ordem é tacada, aposta-paga, estado-sala (um estado só, já com os saldos novos)', () => {
    const base = novoAmbiente();
    const ana = carteira(base.amb);
    const beto = carteira(base.amb);
    const m = sentar('1x1', [ana, beto], {}, base);
    const esp = new ClienteDeTeste(base.amb, 'Esp');
    esp.entrar(m.jogadores[0]!.codigo);
    const marcaEsp = esp.conn.recebidas.length;
    const marcas = terminar(m, 0);

    expect(saldos(m)).toEqual([110, 90]);
    const esperado: MsgApostaPaga = {
      tipo: 'aposta-paga',
      valor: 10,
      variacoes: [{ lugar: 0, nome: 'Ana', delta: 10, saldo: 110 }, { lugar: 1, nome: 'Beto', delta: -10, saldo: 90 }],
    };
    for (const [i, c] of m.jogadores.entries()) {
      expect(depoisDe(m, i, marcas).map((x) => x.tipo), c.nome).toEqual(['tacada-retransmitida', 'aposta-paga', 'estado-sala']);
      expect(apostaPaga(c), c.nome).toEqual(esperado);
      expect(c.estado.lugares.slice(0, 2).map((l) => l.saldo), c.nome).toEqual([110, 90]);
    }
    expect(esp.conn.recebidas.slice(marcaEsp).map((x) => x.tipo)).toEqual(['tacada-retransmitida', 'aposta-paga', 'estado-sala']);
    expect(apostaPaga(esp)).toEqual(esperado);
  });

  it('o log da aposta diz a sala, o valor, os apelidos e os deltas', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], { aposta: 20 }, base);
    terminar(m, 1);
    const linha = base.amb.logs.find((l) => l.startsWith('aposta '))!;
    expect(linha).toBeDefined();
    const campos = JSON.parse(linha.slice('aposta '.length));
    expect(campos).toEqual({ sala: m.jogadores[0]!.codigo, valor: 20, venceu: 'Beto', deltas: 'Ana -20, Beto +20' });
  });

  it('o saldo vai abaixo de zero sem limite: três derrotas de 100 deixam −200', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], { aposta: 100, iniciar: false }, base);
    m.jogadores[0]!.enviar({ tipo: 'iniciar' });
    const historico: (number | null)[][] = [];
    for (let partida = 0; partida < 3; partida++) {
      if (partida > 0) outraPartida(m);
      terminar(m, 0);
      historico.push(saldos(m));
    }
    expect(historico).toEqual([[200, 0], [300, -100], [400, -200]]);
    expect(m.jogadores[1]!.estado.lugares[1]!.saldo).toBe(-200);
    expect(apostaPaga(m.jogadores[1]!)!.variacoes[1]).toEqual({ lugar: 1, nome: 'Beto', delta: -100, saldo: -200 });
  });

  it('2x1, a dupla vence: os dois dividem o que o solitário paga', () => {
    const base = novoAmbiente();
    const m = sentar('2x1', [carteira(base.amb), carteira(base.amb), carteira(base.amb)], {}, base);
    terminar(m, 0); // lugares 0 e 2
    expect(saldos(m)).toEqual([105, 90, 105]);
    expect(apostaPaga(m.jogadores[1]!)!.variacoes.map((v) => v.delta)).toEqual([5, -10, 5]);
  });

  it('2x1, o solitário vence: leva a aposta dos dois da dupla', () => {
    const base = novoAmbiente();
    const m = sentar('2x1', [carteira(base.amb), carteira(base.amb), carteira(base.amb)], { aposta: 50 }, base);
    terminar(m, 1);
    expect(saldos(m)).toEqual([50, 200, 50]);
  });

  it('2x2: cada vencedor ganha a aposta de um perdedor', () => {
    const base = novoAmbiente();
    const m = sentar('2x2', [carteira(base.amb), carteira(base.amb), carteira(base.amb), carteira(base.amb)], { aposta: 20 }, base);
    terminar(m, 1); // lugares 1 e 3
    expect(saldos(m)).toEqual([80, 120, 80, 120]);
    expect(apostaPaga(m.jogadores[0]!)!.variacoes.map((v) => [v.lugar, v.delta])).toEqual([[0, -20], [1, 20], [2, -20], [3, 20]]);
  });

  it('mata-mata de 3: o vencedor leva a aposta dos outros dois', () => {
    const base = novoAmbiente();
    const m = sentar('1x1x1', [carteira(base.amb), carteira(base.amb), carteira(base.amb)], { regras: PRESET_MATA_MATA.regras }, base);
    terminar(m, 2);
    expect(saldos(m)).toEqual([90, 90, 120]);
  });

  it('mata-mata de 4: o vencedor leva as três apostas', () => {
    const base = novoAmbiente();
    const m = sentar('1x1x1x1', [carteira(base.amb), carteira(base.amb), carteira(base.amb), carteira(base.amb)], { regras: PRESET_MATA_MATA.regras, aposta: 50 }, base);
    terminar(m, 0);
    expect(saldos(m)).toEqual([250, 50, 50, 50]);
  });

  it('o dinheiro só muda de mãos: em toda formação a soma dos saldos é a mesma de antes', () => {
    const casos: [ModoSala, ConfigRegras, number][] = [['1x1', PRESET_BOTECO.regras, 1], ['2x1', PRESET_BOTECO.regras, 0], ['2x2', PRESET_BOTECO.regras, 1], ['1x1x1', PRESET_MATA_MATA.regras, 1], ['1x1x1x1', PRESET_MATA_MATA.regras, 3]];
    for (const [modo, regras, vencedor] of casos) {
      const base = novoAmbiente();
      const m = sentar(modo, Array.from({ length: LUGARES_POR_MODO[modo] }, () => carteira(base.amb)), { regras, aposta: 100 }, base);
      terminar(m, vencedor);
      expect(saldos(m)!.reduce((a, b) => a! + b!, 0), modo).toBe(SALDO_INICIAL * LUGARES_POR_MODO[modo]);
    }
  });

  it('quem saiu no meio paga igual: o perdedor desconectado ainda perde a aposta', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], {}, base);
    const quem = quemTemAVez(m);
    const outro = m.jogadores.find((c) => c !== quem)!;
    outro.sair();
    terminar(m, m.jogadores.indexOf(quem), quem);
    expect(saldos(m)[m.jogadores.indexOf(quem)]).toBe(110);
    expect(saldos(m)[m.jogadores.indexOf(outro)]).toBe(90);
    expect(apostaPaga(quem)!.variacoes.find((v) => v.nome === outro.nome)).toMatchObject({ delta: -10, saldo: 90 });
  });

  it('quem saiu no meio recebe igual: o vencedor desconectado leva o pote quando a tacada final é do outro', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], {}, base);
    const quem = quemTemAVez(m);
    const quemSaiu = m.jogadores.find((c) => c !== quem)!;
    quemSaiu.sair();
    terminar(m, m.jogadores.indexOf(quemSaiu), quem);
    expect(saldos(m)[m.jogadores.indexOf(quemSaiu)]).toBe(110);
    expect(saldos(m)[m.jogadores.indexOf(quem)]).toBe(90);
  });

  it('o rol é o de quando a partida começou: uma compra no meio não é desfeita, o pote soma ao saldo de agora', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], {}, base);
    base.amb.registro.carteiras.comprar(m.carteiras[0]!.id, 'ebano'); // 100 → 50
    terminar(m, 0);
    expect(saldos(m)).toEqual([60, 90]);
  });

  it('a aposta trocada na espera é a que vale na partida seguinte (e a anterior valeu a que era)', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], { aposta: 10 }, base);
    terminar(m, 0);
    expect(saldos(m)).toEqual([110, 90]);
    m.jogadores[0]!.enviar({ tipo: 'voltar-ao-lobby' });
    m.jogadores[0]!.enviar({ tipo: 'configurar-sala', aposta: 50 });
    m.jogadores[0]!.enviar({ tipo: 'iniciar' });
    terminar(m, 1);
    expect(saldos(m)).toEqual([60, 140]);
    expect(apostaPaga(m.jogadores[0]!)!.valor).toBe(50);
  });

  it('paga uma vez só: a tacada depois do fim é recusada e o saldo não se mexe; uma partida nova paga de novo', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], {}, base);
    terminar(m, 0);
    expect(saldos(m)).toEqual([110, 90]);
    const v = m.jogadores[0]!.visao!;
    m.jogadores[0]!.enviar({ tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: v.partida, mesa: v.mesa });
    expect(m.jogadores[0]!.ultimoErro).toMatchObject({ codigo: 'partida-acabou' });
    expect(saldos(m)).toEqual([110, 90]);
    expect(m.jogadores[0]!.conn.todas('aposta-paga')).toHaveLength(1);
    m.jogadores[0]!.enviar({ tipo: 'nova-partida' });
    terminar(m, 0);
    expect(saldos(m)).toEqual([120, 80]);
  });

  it('a mesma sala pode trocar de modo entre partidas: o rol é sempre o da partida que acabou', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], {}, base);
    terminar(m, 0);
    m.jogadores[0]!.enviar({ tipo: 'voltar-ao-lobby' });
    const cida = new ClienteDeTeste(base.amb, 'Cida');
    const cidaCarteira = carteira(base.amb);
    m.jogadores[0]!.enviar({ tipo: 'configurar-sala', modo: '2x1' });
    cida.entrar(m.jogadores[0]!.codigo, undefined, cidaCarteira.codigo);
    m.jogadores[0]!.enviar({ tipo: 'iniciar' });
    terminar({ ...m, jogadores: [...m.jogadores, cida] }, 1);
    // Ana (110) e Beto (90) vêm da primeira partida; agora o Beto (90 + 20) ganha da dupla Ana (110 - 10) e Cida (100 - 10)
    expect(saldos(m)).toEqual([100, 110]);
    expect(m.amb.registro.carteiras.ler(cidaCarteira.id)!.saldo).toBe(90);
  });
});

describe('um pagamento que o armazém recusa não vale pela metade', () => {
  it('saldo que estouraria o limite seguro: ninguém muda, não há aposta-paga e o log avisa, sem o código', () => {
    const base = novoAmbiente();
    const ana = carteira(base.amb);
    const beto = carteira(base.amb);
    base.amb.registro.carteiras.aplicar([{ id: ana.id, delta: Number.MAX_SAFE_INTEGER - SALDO_INICIAL - 5 }]);
    const m = sentar('1x1', [ana, beto], {}, base);
    terminar(m, 0);
    expect(saldos(m)).toEqual([Number.MAX_SAFE_INTEGER - 5, 100]);
    for (const c of m.jogadores) expect(c.conn.todas('aposta-paga'), c.nome).toEqual([]);
    expect(base.amb.logs.some((l) => l.startsWith('aposta-falhou '))).toBe(true);
    expect(base.amb.logs.join('\n')).not.toContain(ana.codigo);
  });
});

describe('quem não tem carteira não aposta e não recebe', () => {
  it.each([
    ['vencedor sem carteira', [null, 'c'], 0],
    ['perdedor sem carteira', ['c', null], 0],
    ['ninguém com carteira', [null, null], 0],
  ] as const)('1x1, %s: nada muda de mãos e não há aposta-paga', (_nome, tem, equipe) => {
    const base = novoAmbiente();
    const m = sentar('1x1', tem.map((t) => (t ? carteira(base.amb) : null)), {}, base);
    terminar(m, equipe);
    expect(saldos(m).filter((s) => s !== null)).toEqual(tem.filter((t) => t).map(() => 100));
    for (const c of m.jogadores) {
      expect(c.conn.todas('aposta-paga'), c.nome).toEqual([]);
      expect(c.estado.fase, c.nome).toBe('jogando');
    }
  });

  it('2x1, a dupla vence e só uma das duas tem carteira: ela leva o que o solitário paga, a outra nada', () => {
    const base = novoAmbiente();
    const m = sentar('2x1', [carteira(base.amb), carteira(base.amb), null], {}, base);
    terminar(m, 0);
    expect(saldos(m)).toEqual([110, 90, null]);
    expect(apostaPaga(m.jogadores[0]!)!.variacoes).toEqual([{ lugar: 0, nome: 'Ana', delta: 10, saldo: 110 }, { lugar: 1, nome: 'Beto', delta: -10, saldo: 90 }]);
  });

  it('mata-mata de 3 com um perdedor sem carteira: o vencedor leva só do outro', () => {
    const base = novoAmbiente();
    const m = sentar('1x1x1', [carteira(base.amb), null, carteira(base.amb)], { regras: PRESET_MATA_MATA.regras }, base);
    terminar(m, 0);
    expect(saldos(m)).toEqual([110, null, 90]);
  });
});

describe('a mesma carteira em dois lugares anula a aposta', () => {
  it('ninguém paga nem recebe, e todos recebem aposta-paga anulada', () => {
    const base = novoAmbiente();
    const unica = carteira(base.amb);
    const m = sentar('1x1', [unica, unica], {}, base);
    terminar(m, 0);
    expect(saldoDe(m, 0)).toBe(100);
    for (const c of m.jogadores) expect(apostaPaga(c), c.nome).toEqual({ tipo: 'aposta-paga', valor: 10, variacoes: [], anulada: 'carteira-repetida' });
    const linha = base.amb.logs.find((l) => l.startsWith('aposta '))!;
    expect(JSON.parse(linha.slice('aposta '.length))).toEqual({ sala: m.jogadores[0]!.codigo, valor: 10, anulada: 'carteira-repetida' });
    expect(linha).not.toContain(unica.codigo);
  });

  it('vale também com outras pessoas na partida (2x2): a repetida anula para todas', () => {
    const base = novoAmbiente();
    const repetida = carteira(base.amb);
    const m = sentar('2x2', [repetida, carteira(base.amb), carteira(base.amb), repetida], {}, base);
    terminar(m, 0);
    expect(saldos(m)).toEqual([100, 100, 100, 100]);
    expect(apostaPaga(m.jogadores[1]!)).toMatchObject({ anulada: 'carteira-repetida', variacoes: [] });
  });
});

describe('partida que não acaba não paga', () => {
  it('no meio da partida nada se mexe; a sala que expira não paga', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], {}, base);
    quemTemAVez(m).jogar();
    expect(saldos(m)).toEqual([100, 100]);
    m.jogadores[0]!.enviar({ tipo: 'voltar-ao-lobby' });
    expect(m.jogadores[0]!.ultimoErro).toMatchObject({ codigo: 'partida-em-andamento' });
    base.amb.avancar(base.amb.config.salaOciosaMs + 1000);
    expect(base.amb.registro.totalSalas).toBe(0);
    expect(saldos(m)).toEqual([100, 100]);
    expect(base.amb.logs.some((l) => l.startsWith('aposta '))).toBe(false);
  });

  it('partida que termina sem vencedor não paga, e o rol da próxima é outro', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], {}, base);
    terminar(m, 'ninguem');
    expect(saldos(m)).toEqual([100, 100]);
    for (const c of m.jogadores) expect(c.conn.todas('aposta-paga'), c.nome).toEqual([]);
    outraPartida(m);
    terminar(m, 0);
    expect(saldos(m)).toEqual([110, 90]);
  });

  it('a vez que passa por tempo ou ausência não mexe em dinheiro', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], {}, base);
    quemTemAVez(m).sair();
    base.amb.avancar(base.amb.config.toleranciaVezMs + 1000);
    expect(saldos(m)).toEqual([100, 100]);
  });
});

describe('várias salas, um armazém', () => {
  it('a carteira que ganha numa sala aparece com o saldo novo na outra em que também está sentada', () => {
    const base = novoAmbiente();
    const ana = carteira(base.amb);
    const salaA = sentar('1x1', [ana, carteira(base.amb)], {}, base);
    const salaB = sentar('1x1', [carteira(base.amb), ana], { iniciar: false }, base);
    terminar(salaA, 0);
    expect(saldoDe(salaA, 0)).toBe(110);
    expect(salaB.jogadores[0]!.estado.lugares[1]!.saldo).toBe(110);
    // e a sala que pagou só mandou um estado depois da tacada, não um por carteira mexida
    expect(salaA.jogadores[0]!.conn.todas('estado-sala').slice(-2).map((e) => e.fase)).toEqual(['jogando', 'jogando']);
  });
});

describe('os tipos da mensagem batem com o que o fio aceita', () => {
  it('toda aposta-paga que a sala monta passa pelo esquema do protocolo', async () => {
    const { validarMensagemDaSala } = await import('@sinuca/protocolo');
    const base = novoAmbiente();
    const m = sentar('2x2', [carteira(base.amb), carteira(base.amb), carteira(base.amb), carteira(base.amb)], { aposta: 100 }, base);
    terminar(m, 0);
    for (const c of m.jogadores) {
      for (const msg of c.conn.recebidas) expect(validarMensagemDaSala(msg).ok, `${c.nome} ${msg.tipo}`).toBe(true);
    }
  });
});

describe('nova-partida não aposta a carteira de quem já saiu (A1 do L22)', () => {
  it('1×1, aposta 100: com o Beto fora, três nova-partida seguidas são recusadas e nenhum saldo se mexe', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], { aposta: 100 }, base);
    terminar(m, 0);
    expect(saldos(m)).toEqual([200, 0]);
    m.jogadores[1]!.sair();
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      m.jogadores[0]!.enviar({ tipo: 'nova-partida' });
      expect(m.jogadores[0]!.ultimoErro, `tentativa ${tentativa}`).toMatchObject({ codigo: 'lugares-incompletos' });
      base.amb.avancar(base.amb.config.toleranciaVezMs + 1000); // o tempo que a vez do ausente levaria para vencer por ausência
      expect(saldos(m), `tentativa ${tentativa}`).toEqual([200, 0]);
    }
    expect(m.jogadores[0]!.conn.todas('aposta-paga')).toHaveLength(1);
    expect(m.jogadores[0]!.estado.fase).toBe('jogando');
    expect(m.jogadores[0]!.visao!.partida.vencedor).toBe(0);
  });

  it('defesa em profundidade: mesmo chamado por dentro, o rol só leva a carteira de quem está conectado (as mensagens não chegam aqui, então a conta é feita direto)', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], { aposta: 100 }, base);
    type ComRol = { salas: Map<string, { partida: EstadoPartida; rolDaPartida(p: EstadoPartida): { lugar: number; carteira: string | null }[] }> };
    const sala = (base.amb.registro as unknown as ComRol).salas.get(m.jogadores[0]!.codigo)!;
    expect(sala.rolDaPartida(sala.partida).map((q) => q.carteira)).toEqual([m.carteiras[0]!.id, m.carteiras[1]!.id]);
    m.jogadores[1]!.sair();
    expect(sala.rolDaPartida(sala.partida).map((q) => q.carteira)).toEqual([m.carteiras[0]!.id, null]);
  });

  it('com todos de volta nos lugares, nova-partida recomeça e a aposta segue valendo para os dois', () => {
    const base = novoAmbiente();
    const m = sentar('1x1', [carteira(base.amb), carteira(base.amb)], { aposta: 100 }, base);
    terminar(m, 0);
    m.jogadores[1]!.sair();
    m.jogadores[0]!.enviar({ tipo: 'nova-partida' });
    expect(m.jogadores[0]!.ultimoErro).toMatchObject({ codigo: 'lugares-incompletos' });
    m.jogadores[1]!.reconectar();
    m.jogadores[0]!.enviar({ tipo: 'nova-partida' });
    terminar(m, 1);
    expect(saldos(m)).toEqual([100, 100]);
  });

  it('2×1, o lugar de um dos dois da dupla fica vazio: a recusa vale igual', () => {
    const base = novoAmbiente();
    const m = sentar('2x1', [carteira(base.amb), carteira(base.amb), carteira(base.amb)], { aposta: 50 }, base);
    terminar(m, 0);
    const antes = saldos(m);
    m.jogadores[2]!.sair();
    m.jogadores[0]!.enviar({ tipo: 'nova-partida' });
    expect(m.jogadores[0]!.ultimoErro).toMatchObject({ codigo: 'lugares-incompletos' });
    base.amb.avancar(base.amb.config.toleranciaVezMs + 1000);
    expect(saldos(m)).toEqual(antes);
  });
});

describe('o teto de carteiras e as salas (L25)', () => {
  it('quem sentou numa partida que começou não é reaproveitado no teto, mesmo sem ter pago nada', () => {
    const base = novoAmbiente();
    const amb = criarAmbiente({ ...SEM_MISSOES, maxCarteiras: 3 });
    const ana = carteira(amb);
    amb.avancar(1000);
    const beto = carteira(amb);
    amb.avancar(1000);
    const m = sentar('1x1', [ana, beto], {}, { amb, controle: base.controle });
    const livre = carteira(amb); // a terceira, mais nova que as duas sentadas, nunca usada
    amb.avancar(1000);
    const chegou = amb.registro.carteiras.criar()!; // no teto: toma o lugar da nunca usada mais velha
    expect(amb.registro.carteiras.resolver(livre.codigo)).toBeUndefined();
    expect(amb.registro.carteiras.resolver(ana.codigo)).toBe(ana.id);
    expect(amb.registro.carteiras.resolver(beto.codigo)).toBe(beto.id);
    expect(amb.registro.carteiras.resolver(chegou.codigo)).toBe(chegou.id);
    expect(m.jogadores[0]!.estado.fase).toBe('jogando');
  });

  it('carteira reaproveitada enquanto o dono esperava na sala: ele joga sem carteira, ninguém é cobrado e nada quebra', () => {
    const base = novoAmbiente();
    const amb = criarAmbiente({ ...SEM_MISSOES, maxCarteiras: 2 }, { regras: { novaPartida, aplicarTacada: (p, eventos) => (base.controle.acabaCom === undefined ? aplicarTacada(p, eventos) : fim(p, base.controle.acabaCom === 'ninguem' ? null : base.controle.acabaCom)) } });
    const ana = carteira(amb);
    amb.avancar(1000);
    const beto = carteira(amb);
    const m = sentar('1x1', [ana, beto], { iniciar: false }, { amb, controle: base.controle });
    amb.avancar(1000);
    amb.registro.carteiras.criar(); // o teto: a de Ana, a mais velha nunca usada, vai embora
    expect(amb.registro.carteiras.ler(ana.id)).toBeUndefined();
    expect(m.jogadores[0]!.estado.lugares[0]!.saldo).toBe(SALDO_INICIAL); // ainda não mandou estado novo
    m.jogadores[0]!.enviar({ tipo: 'iniciar' });
    expect(m.jogadores[0]!.ultimoErro).toBeUndefined();
    terminar(m, 0);
    expect(m.jogadores[0]!.conn.todas('aposta-paga')).toEqual([]);
    expect(m.jogadores[0]!.estado.lugares[0]!.saldo).toBeNull();
    expect(amb.registro.carteiras.ler(beto.id)!.saldo).toBe(SALDO_INICIAL);
    expect(amb.logs.some((l) => l.startsWith('aposta-falhou '))).toBe(false);
  });
});
