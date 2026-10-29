/**
 * As estatísticas por carteira dentro da sala (L38): quando uma partida conta (acabou de verdade, aposta valendo, física padrão),
 * o que ela soma por modalidade, o resumo público de cada lugar no `estado-sala` e o log curto. A física e as regras são as de
 * verdade nas tacadas reais; as partidas que precisam ACABAR usam o motor falso das regras, como em `sala-aposta.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { CONTAGEM_ZERADA, diaDaMissao, missoesDoDia, type ContagemDeEstatisticas, type IdMissao, type ModoSala, type MsgTacada } from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESET_MATA_MATA, aplicarTacada, novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { conferirTacada } from './missoes';
import { ClienteDeTeste, SEM_LIMITE, TACADA_MEDIA, acharTacada, criarAmbiente, type Ambiente } from './para-testes';
import type { ConfigSala } from './config';
import type { MotorDeRegras } from './regras';

const DIA_MS = 86_400_000;

const fim = (p: EstadoPartida, vencedor: number | null): ResultadoRegras => ({
  partida: { ...p, fase: 'fim', vencedor },
  consequencias: { faltas: [], retirar: [], recolocar: [], proximo: p.vez, vencedor, texto: 'fim' },
});

interface Carteira {
  readonly codigo: string;
  readonly id: string;
}
const carteira = (amb: Ambiente): Carteira => amb.registro.carteiras.criar()!;
const estatisticasDe = (amb: Ambiente, c: Carteira) => amb.registro.carteiras.ler(c.id)!.estatisticas!;
const contagem = (c: Partial<ContagemDeEstatisticas>): ContagemDeEstatisticas => ({ ...CONTAGEM_ZERADA, ...c });
const saldoDe = (amb: Ambiente, c: Carteira): number => amb.registro.carteiras.ler(c.id)!.saldo;
const logsDe = (amb: Ambiente, evento: string) => amb.logs.filter((l) => l.startsWith(`${evento} `)).map((l) => JSON.parse(l.slice(evento.length + 1)) as Record<string, unknown>);

/** Ambiente em que `terminar` acaba a partida para a `equipe` (ou sem vencedor); fora disso as regras são as de verdade. */
function ambiente(config: Partial<ConfigSala> = {}) {
  const controle: { proximo?: (p: EstadoPartida) => ResultadoRegras } = {};
  const regras: MotorDeRegras = { novaPartida, aplicarTacada: (p, eventos) => (controle.proximo ? controle.proximo(p) : aplicarTacada(p, eventos)) };
  const amb = criarAmbiente({ missoesDiarias: false, ...config }, { regras });
  const jogar = (quem: ClienteDeTeste, depois: (p: EstadoPartida) => ResultadoRegras): void => {
    controle.proximo = depois;
    const v = quem.visao!;
    quem.enviar({ tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: depois(v.partida).partida, mesa: v.mesa });
    delete controle.proximo;
  };
  const terminar = (quem: ClienteDeTeste, equipe: number | null): void => jogar(quem, (p) => fim(p, equipe));
  return { amb, jogar, terminar };
}

const NOMES = ['Ana', 'Beto', 'Cida', 'Davi'];

/** Sala do `modo` e da modalidade das `regras` com as carteiras (null = sem) nos lugares; anfitrião no 0. */
function sentar(amb: Ambiente, modo: ModoSala, carteiras: readonly (Carteira | null)[], opcoes: { regras?: typeof PRESET_BOTECO.regras; iniciar?: boolean } = {}): ClienteDeTeste[] {
  const jogadores = carteiras.map((_, i) => new ClienteDeTeste(amb, NOMES[i]!));
  jogadores[0]!.criar(modo, opcoes.regras ?? PRESET_BOTECO.regras, SEM_LIMITE, undefined, carteiras[0] ? { carteira: carteiras[0].codigo } : {});
  jogadores.slice(1).forEach((c, i) => c.entrar(jogadores[0]!.codigo, undefined, carteiras[i + 1]?.codigo));
  if (opcoes.iniciar !== false) jogadores[0]!.enviar({ tipo: 'iniciar' });
  return jogadores;
}

const quemTemAVez = (cs: readonly ClienteDeTeste[]): ClienteDeTeste => cs.find((c) => c.lugar === cs[0]!.estado.vez)!;

/** Uma tacada de quem tem a vez que mata ao menos uma bola da sua conta, sem falta, e o que a conferência das missões diz dela. */
function tacadaQueMata(c: ClienteDeTeste) {
  const v = c.visao!;
  let conferida!: ReturnType<typeof conferirTacada>;
  const m: MsgTacada = acharTacada(v, (x) => {
    const r = aplicarTacada(v.partida, x.gravacao.eventos);
    conferida = conferirTacada({ parametros: x.parametros, gravacao: x.gravacao, consequencias: r.consequencias, antes: v.partida, depois: r.partida, seguidasAntes: 0 });
    return conferida.mortas.length > 0;
  });
  return { m, conferida };
}

describe('uma partida que acaba de verdade, com aposta valendo e a física padrão', () => {
  it('soma uma partida a cada carteira, a vitória só à da equipe vencedora, e as moedas que a aposta pagou a mais', () => {
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const b = carteira(amb);
    const cs = sentar(amb, '1x1', [a, b]);
    terminar(quemTemAVez(cs), 0);
    expect(estatisticasDe(amb, a)).toEqual({ total: contagem({ partidas: 1, vitorias: 1, moedas: 10 }), modalidades: { 'par-ou-impar': contagem({ partidas: 1, vitorias: 1, moedas: 10 }) } });
    expect(estatisticasDe(amb, b)).toEqual({ total: contagem({ partidas: 1 }), modalidades: { 'par-ou-impar': contagem({ partidas: 1 }) } });
    expect([saldoDe(amb, a), saldoDe(amb, b)]).toEqual([110, 90]);
  });

  it('a física que o slider deixou com sobra de ponto flutuante no padrão (0,020000000000000004) continua sendo a padrão: a partida conta', () => {
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const b = carteira(amb);
    const cs = sentar(amb, '1x1', [a, b], { iniciar: false });
    cs[0]!.enviar({ tipo: 'configurar-sala', fisica: { atritoRolamento: 0.002 + 36 * 0.0005, fatorEfeitoLateral: 0.2 + 8 * 0.05, restituicaoBolaTabela: 0.5 + 35 * 0.01 } });
    cs[0]!.enviar({ tipo: 'iniciar' });
    expect(cs[0]!.estado.fisicaMexida).toBe(false);
    terminar(quemTemAVez(cs), 0);
    expect(estatisticasDe(amb, a).total).toMatchObject({ partidas: 1, vitorias: 1 });
    expect(estatisticasDe(amb, b).total).toMatchObject({ partidas: 1, vitorias: 0 });
    expect(logsDe(amb, 'estatistica')).toEqual([expect.objectContaining({ contou: true })]);
  });

  it('soma por modalidade: o total é a soma, e a mesma carteira acumula em salas e partidas diferentes', () => {
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const b = carteira(amb);
    const [ana, beto] = sentar(amb, '1x1', [a, b]) as [ClienteDeTeste, ClienteDeTeste];
    terminar(quemTemAVez([ana, beto]), 0); // par ou ímpar: Ana
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata' });
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.estado.modalidade).toBe('mata-mata');
    terminar(quemTemAVez([ana, beto]), 1); // mata-mata: Beto
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar' });
    ana.enviar({ tipo: 'iniciar' });
    terminar(quemTemAVez([ana, beto]), 0); // par ou ímpar: Ana de novo

    expect(estatisticasDe(amb, a)).toEqual({
      total: contagem({ partidas: 3, vitorias: 2, moedas: 20 }),
      modalidades: { 'par-ou-impar': contagem({ partidas: 2, vitorias: 2, moedas: 20 }), 'mata-mata': contagem({ partidas: 1 }) },
    });
    expect(estatisticasDe(amb, b)).toEqual({
      total: contagem({ partidas: 3, vitorias: 1, moedas: 10 }),
      modalidades: { 'par-ou-impar': contagem({ partidas: 2 }), 'mata-mata': contagem({ partidas: 1, vitorias: 1, moedas: 10 }) },
    });
    expect([saldoDe(amb, a), saldoDe(amb, b)]).toEqual([110, 90]); // +10 -10 +10 e o contrário
  });

  it('bolas, maior sequência e tabeladas saem da mesma conferência das missões, com MISSOES_DIARIAS desligado ou ligado', () => {
    for (const missoesDiarias of [false, true]) {
      const { amb, terminar } = ambiente({ missoesDiarias });
      const a = carteira(amb);
      const b = carteira(amb);
      const cs = sentar(amb, '1x1', [a, b]);
      const quem = quemTemAVez(cs);
      const dono = quem === cs[0] ? a : b;
      const { m, conferida } = tacadaQueMata(quem);
      expect(conferida.mortas.length, 'a varredura achou uma tacada que mata').toBeGreaterThan(0);
      quem.enviar(m);
      expect(quemTemAVez(cs)).toBe(quem); // matou sem falta: segue com a mesa
      // a estatística só aparece quando a partida acaba
      expect(estatisticasDe(amb, dono).total.partidas).toBe(0);
      terminar(quem, quem === cs[0] ? 0 : 1);
      const total = estatisticasDe(amb, dono).total;
      expect(total, String(missoesDiarias)).toMatchObject({
        partidas: 1,
        vitorias: 1,
        bolas: conferida.mortas.length,
        sequencia: conferida.valores.embalado ?? 0,
        tabeladas: conferida.valores.tabelada ?? 0,
      });
      expect(total.sequencia).toBe(conferida.mortas.length);
      const outro = estatisticasDe(amb, dono === a ? b : a).total;
      expect(outro).toMatchObject({ partidas: 1, vitorias: 0, bolas: 0, sequencia: 0, tabeladas: 0 });
    }
  });

  it('a maior sequência é a maior, não a soma: a segunda partida sem bola não a muda e as bolas somam', () => {
    const { amb, terminar } = ambiente({ missoesDiarias: false });
    const a = carteira(amb);
    const b = carteira(amb);
    const cs = sentar(amb, '1x1', [a, b]);
    const quem = quemTemAVez(cs);
    const dono = quem === cs[0] ? a : b;
    const { m, conferida } = tacadaQueMata(quem);
    quem.enviar(m);
    terminar(quem, quem === cs[0] ? 0 : 1);
    cs[0]!.enviar({ tipo: 'voltar-ao-lobby' });
    cs[0]!.enviar({ tipo: 'iniciar' });
    terminar(quemTemAVez(cs), 0);
    const total = estatisticasDe(amb, dono).total;
    expect(total.partidas).toBe(2);
    expect(total.bolas).toBe(conferida.mortas.length);
    expect(total.sequencia).toBe(conferida.mortas.length);
  });

  it('missões cumpridas e os prêmios entram: as moedas ganhas são a aposta mais as missões, e batem com o que o saldo subiu', () => {
    const dia = diaDe((ids) => ids[0] === 'fregues-da-casa' && ids[1] === 'fecha-a-conta' && ids[2] === 'limpinho');
    const { amb, jogar } = ambiente({ missoesDiarias: true });
    amb.semTick(Date.parse(`${dia}T15:00:00Z`) - amb.agora());
    const a = carteira(amb);
    const b = carteira(amb);
    const [ana, beto] = sentar(amb, '1x1', [a, b]) as [ClienteDeTeste, ClienteDeTeste];
    const passa = (p: EstadoPartida): ResultadoRegras => ({ partida: { ...p, vez: 1 - p.vez }, consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1 - p.vez, vencedor: null, texto: 'passou' } });
    // partida 1: Ana ganha (Fecha a conta; sem falta, Limpinho só na 2ª porque Freguês e Limpinho dependem de contar uma partida a mais)
    const jogarPartida = (): void => {
      const vez1 = quemTemAVez([ana, beto]);
      jogar(vez1, passa);
      jogar(quemTemAVez([ana, beto]), passa);
      jogar(quemTemAVez([ana, beto]), (p) => fim(p, 0));
    };
    jogarPartida();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'iniciar' });
    jogarPartida();

    const premios = (c: ClienteDeTeste) => c.conn.todas('missoes').flatMap((x) => x.cumpridas);
    const deAna = premios(ana);
    const deBeto = premios(beto);
    expect(deAna.length).toBeGreaterThanOrEqual(3);
    const eA = estatisticasDe(amb, a).total;
    const eB = estatisticasDe(amb, b).total;
    expect(eA).toMatchObject({ partidas: 2, vitorias: 2, missoes: deAna.length });
    expect(eB).toMatchObject({ partidas: 2, vitorias: 0, missoes: deBeto.length });
    // moedas ganhas = tudo que o saldo subiu em cima do que a carteira pôs: aposta ganha (+10 por partida) e prêmios de missão
    expect(eA.moedas).toBe(saldoDe(amb, a) - 100);
    expect(eB.moedas).toBe(saldoDe(amb, b) - 100 + 20); // Beto perdeu 10 duas vezes: o que perdeu não é "ganho"
  });
});

describe('o que NÃO conta', () => {
  it('a partida em andamento, a que acaba sem vencedor e a que ninguém terminou não somam nada', () => {
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const b = carteira(amb);
    const cs = sentar(amb, '1x1', [a, b]);
    terminar(quemTemAVez(cs), null);
    for (const c of [a, b]) expect(estatisticasDe(amb, c).total, c.id).toEqual(CONTAGEM_ZERADA);
    expect(logsDe(amb, 'estatistica')).toEqual([]);
  });

  it('a aposta anulada (a mesma carteira nos dois lugares) não conta, e o log diz por quê', () => {
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const cs = sentar(amb, '1x1', [a, a]);
    terminar(quemTemAVez(cs), 0);
    expect(cs[0]!.conn.ultima('aposta-paga')).toMatchObject({ anulada: 'carteira-repetida' });
    expect(estatisticasDe(amb, a).total).toEqual(CONTAGEM_ZERADA);
    expect(logsDe(amb, 'estatistica')).toEqual([{ sala: cs[0]!.codigo, modalidade: 'par-ou-impar', contou: false, motivo: 'carteira-repetida' }]);
  });

  it('com só uma carteira na mesa (sem contraparte) não conta para ninguém', () => {
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const cs = sentar(amb, '1x1', [a, null]);
    terminar(quemTemAVez(cs), 0);
    expect(estatisticasDe(amb, a).total).toEqual(CONTAGEM_ZERADA);
    expect(logsDe(amb, 'estatistica')).toEqual([{ sala: cs[0]!.codigo, modalidade: 'par-ou-impar', contou: false, motivo: 'menos-de-duas-carteiras' }]);
  });

  it('com a física mexida não conta, mas a aposta continua valendo e muda de mãos', () => {
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const b = carteira(amb);
    const cs = sentar(amb, '1x1', [a, b], { iniciar: false });
    cs[0]!.enviar({ tipo: 'configurar-sala', fisica: { atritoRolamento: 0.03 } });
    cs[0]!.enviar({ tipo: 'iniciar' });
    terminar(quemTemAVez(cs), 0);
    expect(cs[1]!.conn.ultima('aposta-paga')!.variacoes.map((v) => v.delta)).toEqual([10, -10]);
    expect([saldoDe(amb, a), saldoDe(amb, b)]).toEqual([110, 90]);
    for (const c of [a, b]) expect(estatisticasDe(amb, c).total, c.id).toEqual(CONTAGEM_ZERADA);
    expect(logsDe(amb, 'estatistica')).toEqual([{ sala: cs[0]!.codigo, modalidade: 'par-ou-impar', contou: false, motivo: 'fisica-mexida' }]);
    // restaurar a física na espera e jogar de novo: a partida seguinte conta
    cs[0]!.enviar({ tipo: 'voltar-ao-lobby' });
    cs[0]!.enviar({ tipo: 'configurar-sala', fisica: null });
    cs[0]!.enviar({ tipo: 'iniciar' });
    terminar(quemTemAVez(cs), 0);
    expect(estatisticasDe(amb, a).total).toMatchObject({ partidas: 1, vitorias: 1 });
  });

  it('uma tacada que mata bola com a física mexida não deixa bola na estatística: a partida inteira fica de fora, e a seguinte, com o padrão de volta, conta só as bolas dela', () => {
    // O filtro por tacada não aparece sozinho: UMA tacada mexida já marca a partida inteira, e com aposta valendo a física nem muda no meio
    // dela. O que se prova aqui é o efeito: nada da partida mexida sobra no total, e a partida seguinte começa do zero.
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const b = carteira(amb);
    const cs = sentar(amb, '1x1', [a, b], { iniciar: false });
    cs[0]!.enviar({ tipo: 'configurar-sala', fisica: { velocidadeMaxTaco: 10 } });
    cs[0]!.enviar({ tipo: 'iniciar' });
    const quem = quemTemAVez(cs);
    const mortasMexida = tacadaQueMata(quem);
    expect(mortasMexida.conferida.mortas.length).toBeGreaterThan(0); // a tacada seria contada com a física padrão
    quem.enviar(mortasMexida.m);
    terminar(quem, quem === cs[0] ? 0 : 1);
    for (const c of [a, b]) expect(estatisticasDe(amb, c).total, c.id).toEqual(CONTAGEM_ZERADA);

    cs[0]!.enviar({ tipo: 'voltar-ao-lobby' });
    cs[0]!.enviar({ tipo: 'configurar-sala', fisica: null });
    cs[0]!.enviar({ tipo: 'iniciar' });
    const segundo = quemTemAVez(cs);
    const mortasPadrao = tacadaQueMata(segundo);
    segundo.enviar(mortasPadrao.m);
    terminar(segundo, segundo === cs[0] ? 0 : 1);
    const dono = segundo === cs[0] ? a : b;
    const outro = dono === a ? b : a;
    expect(estatisticasDe(amb, dono).total).toMatchObject({ partidas: 1, vitorias: 1, bolas: mortasPadrao.conferida.mortas.length });
    expect(estatisticasDe(amb, outro).total).toMatchObject({ partidas: 1, vitorias: 0, bolas: 0 });
  });
});

describe('quem estava na partida', () => {
  it('quem perdeu o adversário no meio segue a regra da aposta: o rol é o do começo e a partida conta para os dois', () => {
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const b = carteira(amb);
    const cs = sentar(amb, '1x1', [a, b]);
    const quem = quemTemAVez(cs);
    const outro = quem === cs[0] ? cs[1]! : cs[0]!;
    outro.sair();
    terminar(quem, quem === cs[0] ? 0 : 1);
    const dono = quem === cs[0] ? a : b;
    const perdedor = dono === a ? b : a;
    expect(estatisticasDe(amb, dono).total).toMatchObject({ partidas: 1, vitorias: 1, moedas: 10 });
    expect(estatisticasDe(amb, perdedor).total).toMatchObject({ partidas: 1, vitorias: 0, moedas: 0 });
    expect(saldoDe(amb, perdedor)).toBe(90);
  });

  it('quem estava sem carteira não tem estatística, e as outras duas contam (2x2: a dupla vencedora tem as duas vitórias)', () => {
    const { amb, terminar } = ambiente();
    const [a, b, c] = [carteira(amb), carteira(amb), carteira(amb)];
    const cs = sentar(amb, '2x2', [a, b, c, null]);
    terminar(quemTemAVez(cs), 0); // equipe 0: lugares 0 e 2 (Ana e Cida)
    expect(estatisticasDe(amb, a).total).toMatchObject({ partidas: 1, vitorias: 1 });
    expect(estatisticasDe(amb, c).total).toMatchObject({ partidas: 1, vitorias: 1 });
    expect(estatisticasDe(amb, b).total).toMatchObject({ partidas: 1, vitorias: 0 });
    // o pote: 3 apostaram 10, dois vencedores dividem 30 (15 cada, +5)
    expect([saldoDe(amb, a), saldoDe(amb, b), saldoDe(amb, c)]).toEqual([105, 90, 105]);
    expect(estatisticasDe(amb, a).total.moedas).toBe(5);
  });

  it('sem moeda em jogo ninguém tem estatística (partida de amigos sem carteira)', () => {
    const { amb, terminar } = ambiente();
    const cs = sentar(amb, '1x1', [null, null]);
    terminar(quemTemAVez(cs), 0);
    expect(logsDe(amb, 'estatistica')).toEqual([{ sala: cs[0]!.codigo, modalidade: 'par-ou-impar', contou: false, motivo: 'menos-de-duas-carteiras' }]);
    expect(cs[0]!.estado.lugares.slice(0, 2).map((l) => l.estatisticas)).toEqual([null, null]);
  });
});

describe('o resumo público no estado-sala', () => {
  it('cada lugar com carteira mostra partidas, vitórias e bolas do TOTAL; sem carteira e vago são null; todos veem o mesmo, espectador inclusive', () => {
    const { amb, terminar } = ambiente({ missoesDiarias: false });
    const a = carteira(amb);
    const b = carteira(amb);
    const cs = sentar(amb, '1x1', [a, b]) as [ClienteDeTeste, ClienteDeTeste];
    expect(cs[0].estado.lugares.map((l) => l.estatisticas)).toEqual([{ partidas: 0, vitorias: 0, bolas: 0 }, { partidas: 0, vitorias: 0, bolas: 0 }, null, null]);
    const espectador = new ClienteDeTeste(amb, 'Cida').entrar(cs[0].codigo);
    const quem = quemTemAVez(cs);
    const { m, conferida } = tacadaQueMata(quem);
    quem.enviar(m);
    terminar(quem, quem === cs[0] ? 0 : 1);
    const venceu = quem === cs[0] ? 0 : 1;
    const esperado = [0, 1].map((lugar) => ({ partidas: 1, vitorias: lugar === venceu ? 1 : 0, bolas: lugar === venceu ? conferida.mortas.length : 0 }));
    for (const c of [cs[0], cs[1], espectador]) {
      expect(c.estado.lugares.slice(0, 2).map((l) => l.estatisticas), c.nome).toEqual(esperado);
      expect(c.estado.lugares.slice(2).map((l) => l.estatisticas), c.nome).toEqual([null, null]);
    }
  });

  it('o resumo é da carteira, não da sala: uma sala nova com a mesma carteira mostra o histórico; quem entra sem carteira vê null', () => {
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const b = carteira(amb);
    const cs = sentar(amb, '1x1', [a, b]);
    terminar(quemTemAVez(cs), 0);
    const [ana2, davi2] = sentar(amb, '1x1', [a, null], { iniciar: false }) as [ClienteDeTeste, ClienteDeTeste];
    expect(ana2.estado.lugares.slice(0, 2).map((l) => l.estatisticas)).toEqual([{ partidas: 1, vitorias: 1, bolas: 0 }, null]);
    expect(davi2.estado.lugares[1]!.estatisticas).toBeNull();
  });

  it('nada que identifique a carteira sai do servidor: nem o código, nem o id, nem a contagem inteira, em mensagem ou em log', () => {
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const b = carteira(amb);
    const cs = sentar(amb, '1x1', [a, b]);
    terminar(quemTemAVez(cs), 0);
    const tudo = cs.map((c) => JSON.stringify(c.conn.recebidas)).join('\n') + '\n' + amb.logs.join('\n');
    for (const c of [a, b]) {
      expect(tudo).not.toContain(c.codigo);
      expect(tudo).not.toContain(c.id);
    }
    const lugar = cs[0]!.estado.lugares[0]!;
    expect(Object.keys(lugar.estatisticas!).sort()).toEqual(['bolas', 'partidas', 'vitorias']);
    expect(JSON.stringify(cs[0]!.conn.recebidas)).not.toContain('modalidades');
  });
});

describe('quando só a estatística falha', () => {
  it('sem dinheiro a mover e a soma recusada pelo armazém: ninguém é cobrado, nada soma, e o log não acusa a aposta (diz que a estatística falhou)', () => {
    const { amb, terminar } = ambiente();
    const a = carteira(amb);
    const b = carteira(amb);
    // mata-mata de 3: a vencedora (lugar 2) não tem carteira, então ninguém paga (semDinheiro) e a estatística de a e b é o que vai ao armazém
    const cs = sentar(amb, '1x1x1', [a, b, null], { regras: PRESET_MATA_MATA.regras });
    // o contador de partidas de a já está no limite de um inteiro exato: somar uma partida estoura e o armazém recusa o lote
    expect(amb.registro.carteiras.aplicar([], undefined, [{ id: a.id, modalidade: 'mata-mata', contagem: contagem({ partidas: Number.MAX_SAFE_INTEGER }) }])).toBe(true);
    const antes = estatisticasDe(amb, a);
    terminar(quemTemAVez(cs), 2);
    expect(cs[0]!.conn.todas('aposta-paga')).toEqual([]);
    expect(estatisticasDe(amb, a)).toEqual(antes);
    expect(estatisticasDe(amb, b).total).toEqual(CONTAGEM_ZERADA);
    expect([saldoDe(amb, a), saldoDe(amb, b)]).toEqual([100, 100]);
    expect(amb.logs.some((l) => l.startsWith('aposta-falhou '))).toBe(false);
    expect(logsDe(amb, 'estatistica')).toEqual([{ sala: cs[0]!.codigo, modalidade: 'mata-mata', contou: false, motivo: 'falhou' }]);
    expect(logsDe(amb, 'carteiras-estatistica-recusada')).toEqual([{ motivo: 'no-limite' }]);
  });
});

describe('o log estatistica', () => {
  it('uma linha curta no fim da partida que contou: sala, modalidade, quantas carteiras e quantas bolas; sem apelido, código nem id', () => {
    const { amb, terminar } = ambiente({ missoesDiarias: false });
    const a = carteira(amb);
    const b = carteira(amb);
    const cs = sentar(amb, '1x1', [a, b]);
    const quem = quemTemAVez(cs);
    const { m, conferida } = tacadaQueMata(quem);
    quem.enviar(m);
    terminar(quem, quem === cs[0] ? 0 : 1);
    expect(logsDe(amb, 'estatistica')).toEqual([{ sala: cs[0]!.codigo, modalidade: 'par-ou-impar', contou: true, carteiras: 2, bolas: conferida.mortas.length }]);
    const linha = amb.logs.find((l) => l.startsWith('estatistica '))!;
    expect(linha.length).toBeLessThan(140);
    for (const c of [a, b]) expect(linha).not.toContain(c.id);
  });
});

/** O primeiro dia, a partir de 26/10/2026, cujas 3 missões servem ao teste. */
function diaDe(serve: (ids: readonly IdMissao[]) => boolean): string {
  for (let d = 0; d < 1500; d++) {
    const dia = diaDaMissao(Date.parse('2026-10-26T15:00:00Z') + d * DIA_MS);
    if (serve(missoesDoDia(dia).map((m) => m.id))) return dia;
  }
  throw new Error('nenhum dia tem essas missões');
}
