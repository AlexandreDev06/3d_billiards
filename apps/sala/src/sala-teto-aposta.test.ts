/**
 * O teto da vez apostada (M1 do L22, decisão do usuário): quando a partida vale moeda, a vez de quem está conectado passa
 * sozinha depois de 2 minutos mesmo numa sala "sem limite", para quem está perdendo não segurar o pote sem tacar. É o mesmo
 * caminho do tempo esgotado (`tempo-esgotado` e `passarVez`), e o cliente vê o prazo pelo `prazoMs` de sempre.
 */
import { describe, expect, it } from 'vitest';
import { LUGARES_POR_MODO, PROTOCOLO_VERSAO, type ModoSala } from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESET_MATA_MATA, type ConfigRegras } from '@sinuca/regras';
import { CONFIG_SALA_PADRAO } from './config';
import { ClienteDeTeste, SEM_LIMITE, criarAmbiente, type Ambiente } from './para-testes';

const TETO = CONFIG_SALA_PADRAO.tetoDaVezApostadaMs;
const FOLGA = CONFIG_SALA_PADRAO.relogioTacada.folgaMs;
const NOMES = ['Ana', 'Beto', 'Cida', 'Davi'];

interface Mesa {
  readonly amb: Ambiente;
  readonly jogadores: ClienteDeTeste[];
}

/** Sala iniciada; `carteiras[i]` = o lugar `i` entra com uma carteira nova (`true`), a mesma de outro lugar (`número`) ou sem carteira (`false`). */
function sentar(
  modo: ModoSala,
  carteiras: readonly (boolean | number)[],
  opcoes: { relogio?: Parameters<ClienteDeTeste['criar']>[2]; regras?: ConfigRegras; amb?: Ambiente } = {},
): Mesa {
  const amb = opcoes.amb ?? criarAmbiente({ missoesDiarias: false });
  const codigos: (string | undefined)[] = [];
  carteiras.forEach((c, i) => {
    if (c === true) codigos[i] = amb.registro.carteiras.criar()!.codigo;
    else if (typeof c === 'number') codigos[i] = codigos[c];
  });
  const jogadores = NOMES.slice(0, LUGARES_POR_MODO[modo]).map((n) => new ClienteDeTeste(amb, n));
  jogadores[0]!.criar(modo, opcoes.regras ?? PRESET_BOTECO.regras, opcoes.relogio ?? SEM_LIMITE, undefined, codigos[0] ? { carteira: codigos[0] } : {});
  jogadores.slice(1).forEach((c, i) => c.entrar(jogadores[0]!.codigo, undefined, codigos[i + 1]));
  jogadores[0]!.enviar({ tipo: 'iniciar' });
  return { amb, jogadores };
}

const vez = (m: Mesa): number | null => m.jogadores[0]!.estado.vez;
const esgotados = (m: Mesa) => m.jogadores[0]!.conn.todas('tempo-esgotado');

describe('sala sem limite com aposta: a vez tem teto de 2 minutos', () => {
  it('o padrão é 2 minutos', () => {
    expect(TETO).toBe(120_000);
  });

  it('1×1 com duas carteiras: a vez passa quando o teto e a folga acabam, e não antes', () => {
    const m = sentar('1x1', [true, true]);
    const { amb } = m;
    expect(vez(m)).toBe(0);
    amb.avancar(TETO + FOLGA - 1);
    expect(vez(m)).toBe(0);
    expect(esgotados(m)).toHaveLength(0);
    amb.avancar(1);
    expect(vez(m)).toBe(1);
    expect(esgotados(m)).toHaveLength(1);
  });

  it('passa pelo mesmo caminho do tempo esgotado: tempo-esgotado com motivo tempo, a consequência da sala e o retrato da vez que passou', () => {
    const m = sentar('1x1', [true, true]);
    m.amb.avancar(TETO + FOLGA);
    for (const c of m.jogadores) {
      expect(c.conn.todas('tempo-esgotado'), c.nome).toEqual([{ tipo: 'tempo-esgotado', lugar: 0, proximo: 1, motivo: 'tempo', consequencia: 'perde-a-vez' }]);
      expect(c.conn.ultima('retrato'), c.nome).toMatchObject({ motivo: 'vez-passou' });
    }
    expect(m.amb.logs.some((l) => l.startsWith('vez-passou ') && l.includes('"motivo":"tempo"'))).toBe(true);
  });

  it('a vez seguinte também tem o teto, e a roda segue passando enquanto ninguém taca (a partida não fica parada para sempre)', () => {
    const m = sentar('1x1', [true, true]);
    const lugares: (number | null)[] = [];
    for (let i = 0; i < 4; i++) {
      m.amb.avancar(TETO + FOLGA);
      lugares.push(vez(m));
    }
    expect(lugares).toEqual([1, 0, 1, 0]);
    expect(esgotados(m)).toHaveLength(4);
  });

  it('o cliente vê o prazo pelo prazoMs de sempre: 2 minutos cheios na vez, a contagem baixa e o relógio da sala continua dizendo sem limite', () => {
    const m = sentar('1x1', [true, true]);
    const { amb } = m;
    expect(m.jogadores[0]!.estado.prazoMs).toBe(TETO);
    expect(m.jogadores[1]!.estado.prazoMs).toBe(TETO);
    expect(m.jogadores[0]!.estado.relogio).toEqual({ tempoS: null, aoEsgotar: 'perde-a-vez' });
    amb.avancar(45_000);
    new ClienteDeTeste(amb, 'Esp').entrar(m.jogadores[0]!.codigo); // qualquer mudança manda estado-sala a todos
    expect(m.jogadores[0]!.estado.prazoMs).toBe(TETO - 45_000);
    amb.avancar(TETO - 45_000 + FOLGA);
    expect(vez(m)).toBe(1);
    expect(m.jogadores[0]!.estado.prazoMs).toBe(TETO); // a vez nova começa com o teto cheio, já no estado-sala do pulo
  });

  it('quem volta no meio da vez recebe o que falta do teto, e voltar não o zera', () => {
    const m = sentar('1x1', [true, true]);
    const [ana] = m.jogadores as [ClienteDeTeste, ClienteDeTeste];
    m.amb.avancar(30_000);
    ana.sair();
    m.amb.avancar(20_000);
    ana.reconectar();
    expect(ana.estado.prazoMs).toBe(TETO - 50_000);
  });

  it('depois de uma tacada o teto da vez seguinte só começa a contar quando a animação acaba, como o relógio comum', () => {
    const m = sentar('1x1', [true, true]);
    const [ana] = m.jogadores as [ClienteDeTeste, ClienteDeTeste];
    const tacada = ana.jogar();
    const { margemAnimacaoMs, animacaoMaximaMs } = CONFIG_SALA_PADRAO.relogioTacada;
    const animacao = Math.min(tacada.gravacao.duracao * 1000, animacaoMaximaMs) + margemAnimacaoMs;
    expect(ana.erros).toHaveLength(0);
    expect(ana.estado.prazoMs).toBe(Math.round(animacao + TETO));
  });

  it('o lugar de quem tem a vez e está desconectado segue valendo a tolerância de ausência (60 s), mais curta que o teto', () => {
    const m = sentar('1x1', [true, true]);
    const [ana, beto] = m.jogadores as [ClienteDeTeste, ClienteDeTeste];
    ana.sair();
    m.amb.avancar(CONFIG_SALA_PADRAO.toleranciaVezMs - 1000);
    expect(beto.estado.vez).toBe(0);
    m.amb.avancar(1000);
    expect(beto.estado.vez).toBe(1);
    expect(beto.conn.todas('tempo-esgotado')[0]).toMatchObject({ motivo: 'ausencia' });
  });
});

describe('o teto só vale quando há moeda em jogo', () => {
  const passaDeDezHoras = (m: Mesa) => {
    m.amb.avancar(10 * 3600_000);
    expect(vez(m)).toBe(0);
    expect(esgotados(m)).toHaveLength(0);
  };

  it('sem aposta nenhuma (ninguém com carteira), sala sem limite continua sem limite', () => {
    const m = sentar('1x1', [false, false]);
    expect(m.jogadores[0]!.estado.prazoMs).toBeNull();
    passaDeDezHoras(m);
  });

  it('só um dos dois com carteira: não há contraparte, não há teto', () => {
    for (const carteiras of [[true, false], [false, true]]) {
      const m = sentar('1x1', carteiras);
      expect(m.jogadores[0]!.estado.prazoMs, String(carteiras)).toBeNull();
      passaDeDezHoras(m);
    }
  });

  it('as carteiras todas na mesma dupla (2×1 com o solitário sem carteira): ninguém paga, não há teto', () => {
    const m = sentar('2x1', [true, false, true].map((t, i) => (i === 1 ? false : t)) as boolean[]);
    // lugares 0 e 2 são a dupla (equipe 0); o 1 é o solitário sem carteira
    expect(m.jogadores[0]!.estado.prazoMs).toBeNull();
    passaDeDezHoras(m);
  });

  it('2×1 com o solitário com carteira: a dupla tem contraparte e o teto vale', () => {
    const m = sentar('2x1', [true, true, false]);
    expect(m.jogadores[0]!.estado.prazoMs).toBe(TETO);
    m.amb.avancar(TETO + FOLGA);
    expect(vez(m)).toBe(1);
  });

  it('a mesma carteira em dois lugares anula a aposta, então não há teto', () => {
    const m = sentar('1x1', [true, 0]);
    expect(m.jogadores[0]!.estado.prazoMs).toBeNull();
    passaDeDezHoras(m);
  });

  it('mata-mata de 3 com duas carteiras: o teto vale; com uma só, não', () => {
    const duas = sentar('1x1x1', [true, false, true], { regras: PRESET_MATA_MATA.regras });
    expect(duas.jogadores[0]!.estado.prazoMs).toBe(TETO);
    const uma = sentar('1x1x1', [true, false, false], { regras: PRESET_MATA_MATA.regras });
    expect(uma.jogadores[0]!.estado.prazoMs).toBeNull();
  });

  it('na espera não há vez, nem prazo, nem teto', () => {
    const amb = criarAmbiente({ missoesDiarias: false });
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { carteira: amb.registro.carteiras.criar()!.codigo });
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo, undefined, amb.registro.carteiras.criar()!.codigo);
    amb.avancar(10 * 3600_000 - 30 * 60_000); // abaixo do tempo em que a sala ociosa expira (1 h) quando há mensagens; só confere o estado
    expect(ana.estado).toMatchObject({ fase: 'espera', vez: null, prazoMs: null });
  });
});

describe('o relógio escolhido pelo anfitrião vale quando é menor que o teto', () => {
  it.each([15, 30, 45, 60] as const)('relógio de %s s com aposta: passa em %s s mais a folga, não em 2 minutos', (tempoS) => {
    const m = sentar('1x1', [true, true], { relogio: { tempoS } });
    expect(m.jogadores[0]!.estado.prazoMs).toBe(tempoS * 1000);
    m.amb.avancar(tempoS * 1000 + FOLGA - 1);
    expect(vez(m)).toBe(0);
    m.amb.avancar(1);
    expect(vez(m)).toBe(1);
  });

  it('o padrão da sala (30 s) também vale por cima do teto', () => {
    const amb = criarAmbiente({ missoesDiarias: false });
    const c = [amb.registro.carteiras.criar()!, amb.registro.carteiras.criar()!];
    const ana = new ClienteDeTeste(amb, 'Ana');
    ana.enviar({ tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Ana', modo: '1x1', preset: 'Boteco', regras: PRESET_BOTECO.regras, carteira: c[0]!.codigo });
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo, undefined, c[1]!.codigo);
    ana.enviar({ tipo: 'iniciar' });
    expect(beto.estado.relogio?.tempoS).toBe(30);
    expect(beto.estado.prazoMs).toBe(30_000);
  });
});

describe('o teto na configuração', () => {
  it('é o da config da sala, e uma sala com outro teto passa a vez nele', () => {
    const m = sentar('1x1', [true, true], { amb: criarAmbiente({ missoesDiarias: false, tetoDaVezApostadaMs: 45_000 }) });
    expect(m.jogadores[0]!.estado.prazoMs).toBe(45_000);
    m.amb.avancar(45_000 + FOLGA);
    expect(vez(m)).toBe(1);
  });
});

describe('a partida apostada que o teto faz andar ainda paga no fim', () => {
  it('o perdedor parado não segura o pote: as vezes dele passam e o outro joga até o fim', () => {
    const m = sentar('1x1', [true, true]);
    const [ana, beto] = m.jogadores as [ClienteDeTeste, ClienteDeTeste];
    m.amb.avancar(TETO + FOLGA); // a vez da Ana passa para o Beto
    expect(beto.estado.vez).toBe(1);
    beto.jogar();
    expect(beto.erros).toHaveLength(0);
    expect(ana.conn.todas('tacada-retransmitida')).toHaveLength(1);
  });
});
