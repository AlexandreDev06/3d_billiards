/**
 * As missões diárias dentro da sala (L31): quem recebe a mensagem `missoes` e em que ordem, o prêmio do nível no saldo, o que
 * NÃO conta (sem aposta valendo, carteira repetida, falta, interruptor desligado, a mesma missão em duas salas) e as de
 * partida inteira. A física e as regras são as de verdade nos testes das tacadas; nos de fim de partida o motor das regras é
 * canônico (a conta que se prova é a das missões, não a do jogo).
 */
import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import {
  PREMIO_POR_NIVEL,
  diaDaMissao,
  missaoDoCatalogo,
  missoesDoDia,
  premioDaMissao,
  type IdMissao,
  type MensagemDaSala,
  type MsgMissoes,
  type MsgTacada,
} from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESET_MATA_MATA, aplicarTacada, novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { CONFIG_SALA_PADRAO } from './config';
import { conferirTacada } from './missoes';
import { ClienteDeTeste, SEM_LIMITE, TACADA_MEDIA, acharTacada, brancaSaiu, cegou, criarAmbiente, numeradasEncacapadas, type Ambiente } from './para-testes';
import type { MotorDeRegras } from './regras';

const DIA_MS = 86_400_000;
const TETO = CONFIG_SALA_PADRAO.tetoDaVezApostadaMs;
const FOLGA = CONFIG_SALA_PADRAO.relogioTacada.folgaMs;
const ANIMACAO = CONFIG_SALA_PADRAO.relogioTacada.animacaoMaximaMs + CONFIG_SALA_PADRAO.relogioTacada.margemAnimacaoMs;

/** O primeiro dia, a partir de 26/10/2026, cujas 3 missões servem ao teste. */
function diaCom(serve: (ids: readonly IdMissao[]) => boolean): string {
  for (let d = 0; d < 1500; d++) {
    const dia = diaDaMissao(Date.parse('2026-10-26T15:00:00Z') + d * DIA_MS);
    if (serve(missoesDoDia(dia).map((m) => m.id))) return dia;
  }
  throw new Error('nenhum dia tem essas missões');
}

/** Leva o relógio do ambiente para o meio do dia da missão (antes de criar salas, que contam o tempo a partir dali). */
function irParaODia(amb: Ambiente, dia: string): void {
  amb.semTick(Date.parse(`${dia}T15:00:00Z`) - amb.agora());
}

const missoesDe = (c: ClienteDeTeste): MsgMissoes[] => c.conn.todas('missoes');
const tipos = (c: ClienteDeTeste, desde: number): MensagemDaSala['tipo'][] => c.conn.recebidas.slice(desde).map((m) => m.tipo);
const saldoDe = (amb: Ambiente, id: string): number => amb.registro.carteiras.ler(id)!.saldo;
/** O contador de bolas de cada taco que a carteira tem (L34), por skin. */
const bolasDe = (amb: Ambiente, id: string): Record<string, number> => Object.fromEntries(amb.registro.carteiras.ler(id)!.itens!.map((i) => [i.skin, i.bolas]));
const premioTotal = (ids: readonly IdMissao[]): number => ids.reduce((soma, id) => soma + premioDaMissao(id), 0);

interface Carteira {
  readonly codigo: string;
  readonly id: string;
}
const carteira = (amb: Ambiente): Carteira => amb.registro.carteiras.criar()!;

/** Sala iniciada com as carteiras (null = sem carteira) nos lugares; anfitrião no 0. */
function sentar(amb: Ambiente, carteiras: readonly (Carteira | null)[], regras = PRESET_BOTECO.regras): ClienteDeTeste[] {
  const nomes = ['Ana', 'Beto', 'Cida', 'Davi'];
  const jogadores = carteiras.map((_, i) => new ClienteDeTeste(amb, nomes[i]!));
  jogadores[0]!.criar('1x1', regras, SEM_LIMITE, undefined, carteiras[0] ? { carteira: carteiras[0].codigo } : {});
  jogadores.slice(1).forEach((c, i) => c.entrar(jogadores[0]!.codigo, undefined, carteiras[i + 1]?.codigo));
  jogadores[0]!.enviar({ tipo: 'iniciar' });
  return jogadores;
}

/** Uma tacada de quem tem a vez que mata ao menos uma bola da sua conta (`conferirTacada` diz), sem falta. */
function tacadaQueMata(c: ClienteDeTeste, seguidasAntes = 0): MsgTacada {
  const v = c.visao!;
  return acharTacada(v, (m) => {
    const r = aplicarTacada(v.partida, m.gravacao.eventos);
    return conferirTacada({ parametros: m.parametros, gravacao: m.gravacao, consequencias: r.consequencias, antes: v.partida, depois: r.partida, seguidasAntes }).mortas.length > 0;
  });
}

/** Uma tacada tranquila que não mata nada (nem falta): passa a vez no mata-mata sem mexer em missão. */
function tacadaQueNaoMata(c: ClienteDeTeste): MsgTacada {
  return acharTacada(c.visao!, (m) => numeradasEncacapadas(m).length === 0 && !brancaSaiu(m) && !cegou(m), [2, 1.5]);
}

describe('uma tacada que cumpre uma missão', () => {
  const dia = diaCom((ids) => ids[0] === 'saida-premiada');

  it('paga o prêmio do nível, avisa só o dono da carteira (depois da tacada, antes do estado) e o outro não recebe nada de missão', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const b = carteira(amb);
    const [ana, beto] = sentar(amb, [a, b]) as [ClienteDeTeste, ClienteDeTeste];
    const marcaAna = ana.conn.recebidas.length;
    const marcaBeto = beto.conn.recebidas.length;
    const quebra = tacadaQueMata(ana);
    ana.enviar(quebra);

    const avisos = missoesDe(ana);
    expect(avisos).toHaveLength(1);
    const { cumpridas, missoes } = avisos[0]!;
    expect(cumpridas).toContain('saida-premiada');
    expect(missoes.dia).toBe(dia);
    expect(missoes.itens.find((i) => i.id === 'saida-premiada')).toMatchObject({ progresso: 1, cumprida: true });
    // todo quadro de missões cumpridas diz o que pagou: o saldo é 100 mais o prêmio de cada uma que fechou
    expect(saldoDe(amb, a.id)).toBe(100 + premioTotal(cumpridas));
    expect(saldoDe(amb, a.id)).toBeGreaterThanOrEqual(100 + PREMIO_POR_NIVEL.facil);
    expect(ana.estado.lugares[0]!.saldo).toBe(saldoDe(amb, a.id));
    // a ordem do fio: tacada, (aposta-paga só no fim), missões, estado
    expect(tipos(ana, marcaAna)).toEqual(['tacada-retransmitida', 'missoes', 'estado-sala']);
    // o outro vê o saldo novo no estado (é público) mas nunca a mensagem de missões, nem a dele (não andou)
    expect(missoesDe(beto)).toHaveLength(0);
    expect(tipos(beto, marcaBeto)).toEqual(['tacada-retransmitida', 'estado-sala']);
    expect(beto.estado.lugares[0]!.saldo).toBe(saldoDe(amb, a.id));
    expect(saldoDe(amb, b.id)).toBe(100);
    // a carteira do outro não andou
    expect(amb.registro.carteiras.ler(b.id)!.missoes!.itens.every((i) => i.progresso === 0)).toBe(true);
  });

  it('o log `missao` diz a sala, o apelido, a missão e as moedas do nível; nunca o código da carteira', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana] = sentar(amb, [a, carteira(amb)]) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(tacadaQueMata(ana));
    const linha = amb.logs.find((l) => l.startsWith('missao ') && l.includes('saida-premiada'))!;
    expect(linha).toBeDefined();
    expect(JSON.parse(linha.slice('missao '.length))).toEqual({ sala: ana.codigo, nome: 'Ana', missao: 'saida-premiada', moedas: 50 });
    expect(amb.logs.join('\n')).not.toContain(a.codigo);
    expect(amb.logs.join('\n')).not.toContain(a.id);
  });

  it('a mesma missão no mesmo dia não paga de novo: uma sala nova com a mesma carteira (outra "aba") quebra e a saída premiada não volta', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana] = sentar(amb, [a, carteira(amb)]) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(tacadaQueMata(ana));
    const saldoDepois = saldoDe(amb, a.id);

    const [ana2, cida] = sentar(amb, [a, carteira(amb)]) as [ClienteDeTeste, ClienteDeTeste];
    expect(ana2.codigo).not.toBe(ana.codigo);
    const quebra2 = tacadaQueMata(ana2);
    const marca = ana2.conn.recebidas.length;
    ana2.enviar(quebra2);
    for (const m of missoesDe(ana2)) expect(m.cumpridas).not.toContain('saida-premiada');
    const novas = missoesDe(ana2).flatMap((m) => m.cumpridas);
    expect(saldoDe(amb, a.id)).toBe(saldoDepois + premioTotal(novas));
    expect(ana2.conn.recebidas.slice(marca).some((m) => m.tipo === 'estado-sala')).toBe(true);
    expect(missoesDe(cida)).toHaveLength(0);
    expect(amb.registro.carteiras.ler(a.id)!.missoes!.itens.find((i) => i.id === 'saida-premiada')).toMatchObject({ progresso: 1, cumprida: true });
  });
});

describe('o que não conta', () => {
  const dia = diaCom((ids) => ids[0] === 'saida-premiada');

  function semProgresso(amb: Ambiente, jogador: ClienteDeTeste, id: string, saldo = 100): void {
    expect(missoesDe(jogador)).toHaveLength(0);
    expect(saldoDe(amb, id)).toBe(saldo);
    expect(amb.registro.carteiras.ler(id)!.missoes!.itens.every((i) => i.progresso === 0)).toBe(true);
    expect(amb.logs.some((l) => l.startsWith('missao '))).toBe(false);
    expect(bolasDe(amb, id), 'o que não conta para a missão não conta para o contador do taco').toEqual({ classico: 0 });
  }

  it('partida sem aposta valendo: só uma das duas pessoas tem carteira (sem contraparte, como o pote)', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana] = sentar(amb, [a, null]) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(tacadaQueMata(ana));
    semProgresso(amb, ana, a.id);
  });

  it('as duas sem carteira: nada a contar, e a sala segue normal', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const [ana, beto] = sentar(amb, [null, null]) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(tacadaQueMata(ana));
    expect(missoesDe(ana)).toHaveLength(0);
    expect(missoesDe(beto)).toHaveLength(0);
    expect(ana.ultimoErro).toBeUndefined();
  });

  it('a mesma carteira nos dois lugares anula a aposta e as missões', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana, beto] = sentar(amb, [a, a]) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(tacadaQueMata(ana));
    semProgresso(amb, ana, a.id);
    expect(missoesDe(beto)).toHaveLength(0);
  });

  it('o interruptor desligado (MISSOES_DIARIAS=0): nada anda nem paga, mas a carteira ainda mostra o quadro', () => {
    const amb = criarAmbiente({ missoesDiarias: false });
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana] = sentar(amb, [a, carteira(amb)]) as [ClienteDeTeste, ClienteDeTeste];
    const quebra = tacadaQueMata(ana);
    ana.enviar(quebra);
    expect(missoesDe(ana)).toHaveLength(0);
    expect(saldoDe(amb, a.id)).toBe(100);
    expect(amb.registro.carteiras.ler(a.id)!.missoes!.itens.every((i) => i.progresso === 0)).toBe(true);
    expect(amb.registro.carteiras.ler(a.id)!.missoes!.itens).toHaveLength(3);
    // o contador do taco não depende do interruptor das missões: as bolas matadas valendo moeda contam do mesmo jeito
    expect(bolasDe(amb, a.id).classico).toBe(numeradasEncacapadas(quebra).length);
    expect(bolasDe(amb, a.id).classico).toBeGreaterThan(0);
  });

  it('tacada com falta não conta, mesmo que uma bola tenha caído (a branca caiu junto)', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana] = sentar(amb, [a, carteira(amb)]) as [ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    const falta = acharTacada(v, (m) => {
      const r = aplicarTacada(v.partida, m.gravacao.eventos);
      return r.consequencias.faltas.length > 0 && r.partida.encacapadas.length > 0;
    });
    ana.enviar(falta);
    expect(ana.erros).toHaveLength(0);
    semProgresso(amb, ana, a.id);
  });

  it('a tacada que não mata nada (e sem falta) não mexe em missão nenhuma', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana] = sentar(amb, [a, carteira(amb)]) as [ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    ana.enviar(
      acharTacada(v, (m) => numeradasEncacapadas(m).length === 0 && !brancaSaiu(m) && !cegou(m), [3, 2]),
    );
    expect(ana.erros).toHaveLength(0);
    semProgresso(amb, ana, a.id);
  });
});

describe('Embalado no mata-mata (a vez passa a cada tacada)', () => {
  const dia = diaCom((ids) => ids[1] === 'embalado');
  const missao = (c: ClienteDeTeste, id: IdMissao) => c.conn.ultima('missoes')?.missoes.itens.find((i) => i.id === id);

  it('duas tacadas dele que mataram, com a de Beto no meio, cumprem e pagam o prêmio de nível médio', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana, beto] = sentar(amb, [a, carteira(amb)], PRESET_MATA_MATA.regras) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(tacadaQueMata(ana));
    expect(missao(ana, 'embalado')).toMatchObject({ progresso: 1, cumprida: false });
    beto.enviar(tacadaQueNaoMata(beto));
    ana.enviar(tacadaQueMata(ana, 1));
    expect(missao(ana, 'embalado')).toMatchObject({ progresso: 2, cumprida: true });
    expect(ana.conn.ultima('missoes')!.cumpridas).toContain('embalado');
    expect(saldoDe(amb, a.id)).toBeGreaterThanOrEqual(100 + PREMIO_POR_NIVEL.media);
  });

  it('errar a tacada dele zera a sequência: mata, erra, mata de novo = 1 de 2', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana, beto] = sentar(amb, [a, carteira(amb)], PRESET_MATA_MATA.regras) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(tacadaQueMata(ana));
    beto.enviar(tacadaQueNaoMata(beto));
    ana.enviar(tacadaQueNaoMata(ana));
    beto.enviar(tacadaQueNaoMata(beto));
    ana.enviar(tacadaQueMata(ana));
    expect(amb.registro.carteiras.ler(a.id)!.missoes!.itens.find((i) => i.id === 'embalado')).toMatchObject({ progresso: 1, cumprida: false });
  });

  it('perder a vez por tempo no meio também zera: mata, a vez dele estoura, mata de novo = 1 de 2', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana, beto] = sentar(amb, [a, carteira(amb)], PRESET_MATA_MATA.regras) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(tacadaQueMata(ana));
    beto.enviar(tacadaQueNaoMata(beto));
    amb.avancar(TETO + FOLGA + ANIMACAO); // a vez de Ana estoura (só há teto porque a aposta vale; o prazo só corre depois da animação)
    expect(ana.estado.vez).toBe(1);
    beto.enviar(tacadaQueNaoMata(beto));
    ana.enviar(tacadaQueMata(ana));
    expect(amb.registro.carteiras.ler(a.id)!.missoes!.itens.find((i) => i.id === 'embalado')).toMatchObject({ progresso: 1, cumprida: false });
  });
});

describe('Embalado na dupla com "parceiro continua" (M1 da revisão do L31)', () => {
  // A decisão: conta as bolas da pessoa enquanto a equipe dela fica com a mesa, mesmo com o parceiro tacando no meio.
  const dia = diaCom((ids) => ids[1] === 'embalado');
  const regras = { ...PRESET_BOTECO.regras, quemContinua: 'parceiro' as const };
  const item = (amb: Ambiente, id: string) => amb.registro.carteiras.ler(id)!.missoes!.itens.find((i) => i.id === 'embalado')!;

  function dupla(amb: Ambiente) {
    const [a, b, c] = [carteira(amb), carteira(amb), carteira(amb)] as [Carteira, Carteira, Carteira];
    const ana = new ClienteDeTeste(amb, 'Ana');
    ana.criar('2x2', regras, SEM_LIMITE, undefined, { carteira: a.codigo });
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo, undefined, b.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo, undefined, c.codigo);
    const davi = new ClienteDeTeste(amb, 'Davi').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    return { ana, beto, cida, davi, a, b, c };
  }

  it('Ana mata, a parceira Cida mata no meio e Ana mata de novo: Ana cumpre (2 bolas dela, a equipe não perdeu a mesa) e a Cida anda 1', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const { ana, cida, a, c } = dupla(amb);
    expect(ana.estado.lugares.map((l) => l.equipe)).toEqual([0, 1, 0, 1]);
    ana.enviar(tacadaQueMata(ana));
    expect(ana.estado.vez).toBe(2); // a mesa passou à parceira, a equipe continua
    expect(item(amb, a.id)).toMatchObject({ progresso: 1, cumprida: false });
    cida.enviar(tacadaQueMata(cida));
    expect(ana.estado.vez).toBe(0);
    expect(item(amb, c.id)).toMatchObject({ progresso: 1, cumprida: false });
    expect(item(amb, a.id)).toMatchObject({ progresso: 1, cumprida: false }); // a bola da parceira não é dela
    ana.enviar(tacadaQueMata(ana, 1));
    expect(item(amb, a.id)).toMatchObject({ progresso: 2, cumprida: true });
    expect(ana.conn.ultima('missoes')!.cumpridas).toContain('embalado');
    expect(item(amb, c.id)).toMatchObject({ progresso: 1, cumprida: false });
  });

  it('se a equipe perde a mesa no meio (a parceira erra), a sequência de Ana recomeça: mata, parceira erra, Ana mata = 1 de 2', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const { ana, beto, cida, a } = dupla(amb);
    ana.enviar(tacadaQueMata(ana));
    cida.enviar(tacadaQueNaoMata(cida));
    expect(ana.estado.vez).toBe(1); // a mesa passou ao outro lado
    beto.enviar(tacadaQueNaoMata(beto));
    ana.enviar(tacadaQueMata(ana));
    expect(item(amb, a.id)).toMatchObject({ progresso: 1, cumprida: false });
  });
});

describe('as missões de partida inteira: Freguês da casa, Fecha a conta e Limpinho', () => {
  const dia = diaCom((ids) => ids[0] === 'fregues-da-casa' && ids[1] === 'fecha-a-conta' && ids[2] === 'limpinho');

  const fim = (p: EstadoPartida, vencedor: number): ResultadoRegras => ({
    partida: { ...p, fase: 'fim', vencedor },
    consequencias: { faltas: [], retirar: [], recolocar: [], proximo: p.vez, vencedor, texto: 'fim' },
  });
  const passaComFalta = (p: EstadoPartida): ResultadoRegras => ({
    partida: { ...p, vez: 1 - p.vez },
    consequencias: { faltas: [{ nome: 'direta' }], retirar: [], recolocar: [], proximo: 1 - p.vez, vencedor: null, texto: 'falta' },
  });
  const passaLimpo = (p: EstadoPartida): ResultadoRegras => ({
    partida: { ...p, vez: 1 - p.vez },
    consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1 - p.vez, vencedor: null, texto: 'passou' },
  });

  it('uma partida com falta de Ana e outra limpa: Fecha a conta na 1ª, Limpinho só na 2ª, Freguês nas duas para os dois', () => {
    const controle: { proximo?: (p: EstadoPartida) => ResultadoRegras } = {};
    const regras: MotorDeRegras = { novaPartida, aplicarTacada: (p, eventos) => (controle.proximo ? controle.proximo(p) : aplicarTacada(p, eventos)) };
    const amb = criarAmbiente({}, { regras });
    irParaODia(amb, dia);
    const a = carteira(amb);
    const b = carteira(amb);
    const [ana, beto] = sentar(amb, [a, b]) as [ClienteDeTeste, ClienteDeTeste];
    const doDia = (c: ClienteDeTeste, id: string) => amb.registro.carteiras.ler(id)!.missoes!.itens;

    const jogar = (c: ClienteDeTeste, depois: (p: EstadoPartida) => ResultadoRegras): void => {
      controle.proximo = depois;
      const v = c.visao!;
      c.enviar({ tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: depois(v.partida).partida, mesa: v.mesa });
      delete controle.proximo;
    };

    // partida 1: Ana comete uma falta (a 1ª tacada), Beto passa limpo, Ana ganha
    jogar(ana, passaComFalta);
    jogar(beto, passaLimpo);
    expect(missoesDe(ana)).toHaveLength(0); // falta e passar a vez não são missão
    const marca = ana.conn.recebidas.length;
    const marcaBeto = beto.conn.recebidas.length;
    jogar(ana, (p) => fim(p, 0));

    expect(tipos(ana, marca)).toEqual(['tacada-retransmitida', 'aposta-paga', 'missoes', 'estado-sala']);
    expect(tipos(beto, marcaBeto)).toEqual(['tacada-retransmitida', 'aposta-paga', 'missoes', 'estado-sala']);
    const deAna = missoesDe(ana).at(-1)!;
    expect(deAna.cumpridas).toEqual(['fecha-a-conta']);
    expect(deAna.missoes.itens.find((i) => i.id === 'limpinho')).toMatchObject({ progresso: 0, cumprida: false });
    expect(deAna.missoes.itens.find((i) => i.id === 'fregues-da-casa')).toMatchObject({ progresso: 1, cumprida: false });
    const deBeto = missoesDe(beto).at(-1)!;
    expect(deBeto.cumpridas).toEqual([]);
    expect(deBeto.missoes.itens.map((i) => i.progresso)).toEqual([1, 0, 0]);
    expect(doDia(ana, a.id).map((i) => i.cumprida)).toEqual([false, true, false]);
    expect(saldoDe(amb, a.id)).toBe(100 + 70 + 10); // Fecha a conta (média) e o pote
    expect(saldoDe(amb, b.id)).toBe(100 - 10);

    // partida 2: ninguém erra, Ana ganha de novo
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'iniciar' });
    const vez1 = ana.estado.vez === 0 ? ana : beto;
    const outro = vez1 === ana ? beto : ana;
    jogar(vez1, passaLimpo);
    jogar(outro, passaLimpo);
    const marca2 = ana.conn.recebidas.length;
    jogar(vez1, (p) => fim(p, 0));
    // quem deu o último tacape foi vez1: o fim vale para a equipe 0 (Ana) qualquer que seja o atirador
    const ultimaAna = missoesDe(ana).at(-1)!;
    expect([...ultimaAna.cumpridas].sort()).toEqual(['fregues-da-casa', 'limpinho'].sort());
    expect(missoesDe(beto).at(-1)!.cumpridas).toEqual(['fregues-da-casa']);
    expect(ana.conn.recebidas.slice(marca2).filter((m) => m.tipo === 'missoes')).toHaveLength(1);
    // Fecha a conta já tinha pago na partida 1: não paga de novo
    expect(saldoDe(amb, a.id)).toBe(100 + 70 + 10 + 50 + 100 + 10);
    expect(saldoDe(amb, b.id)).toBe(100 - 10 + 50 - 10);
    expect(amb.logs.filter((l) => l.startsWith('missao ')).map((l) => JSON.parse(l.slice(7)).missao)).toEqual(['fecha-a-conta', 'fregues-da-casa', 'limpinho', 'fregues-da-casa']);
    expect(missaoDoCatalogo('limpinho').nivel).toBe('dificil');
  });
});

describe('contador de bolas do taco (L34): a mesma definição e o mesmo critério das missões', () => {
  const dia = diaCom((ids) => ids[0] === 'saida-premiada');
  /** As bolas que `conferirTacada` conta como mortas (a mesma conta das missões) para esta tacada. */
  const mortasDa = (c: ClienteDeTeste, m: MsgTacada): number => {
    const v = c.visao!;
    const r = aplicarTacada(v.partida, m.gravacao.eventos);
    return conferirTacada({ parametros: m.parametros, gravacao: m.gravacao, consequencias: r.consequencias, antes: v.partida, depois: r.partida, seguidasAntes: 0 }).mortas.length;
  };
  const comTaco = (amb: Ambiente, id: string, skin: string): void => {
    amb.registro.carteiras.aplicar([{ id, delta: 1000 }]);
    expect(amb.registro.carteiras.comprar(id, skin)).toMatchObject({ ok: true });
  };

  it('soma as bolas mortas no taco em uso e o outro lugar vê semente e contador no estado-sala', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana, beto] = sentar(amb, [a, carteira(amb)]) as [ClienteDeTeste, ClienteDeTeste];
    const tacada = tacadaQueMata(ana);
    const mortas = mortasDa(ana, tacada);
    expect(mortas).toBeGreaterThan(0);
    const semente = amb.registro.carteiras.ler(a.id)!.itens![0]!.semente;
    expect(beto.estado.lugares[0]).toMatchObject({ skin: 'classico', semente, bolas: 0 });
    ana.enviar(tacada);
    expect(bolasDe(amb, a.id)).toEqual({ classico: mortas });
    expect(ana.estado.lugares[0]).toMatchObject({ semente, bolas: mortas });
    expect(beto.estado.lugares[0]).toMatchObject({ semente, bolas: mortas });
    expect(beto.estado.lugares[1]).toMatchObject({ bolas: 0 }); // o do Beto não andou
  });

  it('o contador soma no taco que está em uso na tacada: trocar de skin no meio vale para as seguintes e o antigo fica como estava', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    comTaco(amb, a.id, 'ouro');
    const [ana, beto] = sentar(amb, [a, carteira(amb)], PRESET_MATA_MATA.regras) as [ClienteDeTeste, ClienteDeTeste];
    amb.registro.carteiras.usar(a.id, 'ouro');
    const primeira = tacadaQueMata(ana);
    const m1 = mortasDa(ana, primeira);
    ana.enviar(primeira);
    expect(bolasDe(amb, a.id)).toEqual({ classico: 0, ouro: m1 });
    beto.enviar(tacadaQueNaoMata(beto));
    amb.registro.carteiras.usar(a.id, 'classico'); // no meio da partida
    expect(ana.estado.lugares[0]).toMatchObject({ skin: 'classico', bolas: 0 });
    const segunda = tacadaQueMata(ana);
    const m2 = mortasDa(ana, segunda);
    ana.enviar(segunda);
    expect(bolasDe(amb, a.id)).toEqual({ classico: m2, ouro: m1 });
    expect(beto.estado.lugares[0]).toMatchObject({ skin: 'classico', bolas: m2 });
  });

  it('só uma pessoa com carteira: a partida não vale moeda e o contador não anda (nem a semente aparece no outro lugar)', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana, beto] = sentar(amb, [a, null]) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(tacadaQueMata(ana));
    expect(bolasDe(amb, a.id)).toEqual({ classico: 0 });
    expect(beto.estado.lugares[0]!.bolas).toBe(0);
    expect(beto.estado.lugares[1]).toMatchObject({ semente: null, bolas: null });
  });

  it('a tacada que não mata nada não soma, e a que mata sem falta soma só as bolas dela (a branca não conta)', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana, beto] = sentar(amb, [a, carteira(amb)], PRESET_MATA_MATA.regras) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(tacadaQueNaoMata(ana));
    expect(bolasDe(amb, a.id)).toEqual({ classico: 0 });
    beto.enviar(tacadaQueNaoMata(beto));
    const tacada = tacadaQueMata(ana);
    const mortas = mortasDa(ana, tacada);
    ana.enviar(tacada);
    expect(mortas).toBeGreaterThan(0);
    expect(bolasDe(amb, a.id).classico).toBe(mortas);
    expect(bolasDe(amb, a.id).classico).toBeLessThanOrEqual(numeradasEncacapadas(tacada).length);
  });

  it('uma tacada que mata duas bolas soma duas, não uma', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana] = sentar(amb, [a, carteira(amb)], PRESET_MATA_MATA.regras) as [ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    const dupla = acharTacada(v, (m) => {
      const r = aplicarTacada(v.partida, m.gravacao.eventos);
      return conferirTacada({ parametros: m.parametros, gravacao: m.gravacao, consequencias: r.consequencias, antes: v.partida, depois: r.partida, seguidasAntes: 0 }).mortas.length >= 2;
    });
    const mortas = mortasDa(ana, dupla);
    ana.enviar(dupla);
    expect(mortas).toBeGreaterThanOrEqual(2);
    expect(bolasDe(amb, a.id).classico).toBe(mortas);
  });

  it('as bolas e o prêmio entram na mesma gravação: um aviso de carteira só para a tacada, com o saldo e o contador já novos', () => {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const [ana] = sentar(amb, [a, carteira(amb)]) as [ClienteDeTeste, ClienteDeTeste];
    const vistos: { saldo: number; bolas: number }[] = [];
    amb.registro.carteiras.aoMudar((id) => {
      if (id === a.id) vistos.push({ saldo: saldoDe(amb, id), bolas: bolasDe(amb, id).classico! });
    });
    ana.enviar(tacadaQueMata(ana));
    // nenhum aviso mostra o prêmio sem o contador, nem o contador sem o prêmio
    expect(vistos.length).toBeGreaterThan(0);
    for (const v of vistos) expect(v.bolas > 0, JSON.stringify(v)).toBe(v.saldo > 100 || v.bolas > 0);
    expect(vistos.at(-1)!.bolas).toBeGreaterThan(0);
    expect(vistos.at(-1)!.saldo).toBe(100 + premioTotal(ana.conn.ultima('missoes')!.cumpridas));
  });
});
