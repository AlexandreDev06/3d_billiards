import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { TEMPOS_POR_TACADA_S } from '@sinuca/protocolo';
import { novaPartida, passarVez, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { CONFIG_SALA_PADRAO } from './config';
import { ClienteDeTeste, TACADA_MEDIA, criarAmbiente, salaIniciada } from './para-testes';

const PADRAO = CONFIG_SALA_PADRAO.relogioTacada;
const tipos = (c: ClienteDeTeste) => c.conn.recebidas.map((m) => m.tipo);

describe('relógio — configuração ao criar a sala', () => {
  it('sem o campo relogio a sala usa o padrão: 30 s e perde-a-vez, e o prazo corre desde o início da partida', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criarSemRelogio();
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    expect(ana.estado.relogio).toEqual({ tempoS: 30, aoEsgotar: 'perde-a-vez' });
    expect(ana.estado.prazoMs).toBeNull();
    amb.avancar(100_000); // esperar na sala não gasta o tempo de ninguém
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.estado.prazoMs).toBe(30_000);
    expect(beto.estado.prazoMs).toBe(30_000);
    expect(beto.estado.relogio).toEqual({ tempoS: 30, aoEsgotar: 'perde-a-vez' });
  });

  it.each(TEMPOS_POR_TACADA_S)('o anfitrião escolhe %i s: o estado diz o tempo e o prazo começa cheio', (tempoS) => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS }) as [ClienteDeTeste, ClienteDeTeste];
    for (const c of [ana, beto]) {
      expect(c.estado.relogio).toEqual({ tempoS, aoEsgotar: 'perde-a-vez' });
      expect(c.estado.prazoMs).toBe(tempoS * 1000);
    }
  });

  it('sem limite: o relógio diz tempoS nulo, o prazo é nulo e a vez nunca passa por tempo', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: null }) as [ClienteDeTeste, ClienteDeTeste];
    expect(ana.estado.relogio).toEqual({ tempoS: null, aoEsgotar: 'perde-a-vez' });
    expect(ana.estado.prazoMs).toBeNull();
    amb.avancar(10 * 3600_000);
    expect(beto.estado.vez).toBe(0);
    expect(beto.conn.todas('tempo-esgotado')).toHaveLength(0);
  });

  it('relogio parcial: só o tempo escolhido, o resto no padrão', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb, '1x1', { tempoS: 45 }) as [ClienteDeTeste, ClienteDeTeste];
    expect(ana.estado.relogio).toEqual({ tempoS: 45, aoEsgotar: 'perde-a-vez' });
    const amb2 = criarAmbiente();
    const [ana2] = salaIniciada(amb2, '1x1', {}) as [ClienteDeTeste, ClienteDeTeste];
    expect(ana2.estado.relogio).toEqual({ tempoS: 30, aoEsgotar: 'perde-a-vez' });
  });

  it("aoEsgotar 'falta' ainda não existe: criar a sala é recusado com um erro claro e nada é criado", () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', undefined, { tempoS: 30, aoEsgotar: 'falta' });
    expect(ana.conn.recebidas).toHaveLength(1);
    expect(ana.ultimoErro).toMatchObject({ codigo: 'regras-invalidas' });
    expect(ana.ultimoErro!.mensagem).toMatch(/falta/i);
    expect(ana.ultimoErro!.mensagem).toMatch(/perde-a-vez/);
    expect(amb.registro.totalSalas).toBe(0);
  });

  it('aoEsgotar sem tempo escolhido também é recusado quando é falta', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', undefined, { aoEsgotar: 'falta' });
    expect(ana.ultimoErro?.codigo).toBe('regras-invalidas');
    expect(amb.registro.totalSalas).toBe(0);
  });
});

describe('relógio — o prazo que o cliente vê', () => {
  it('prazoMs é o que falta no instante do envio, não um instante absoluto', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(10_000);
    new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo); // qualquer mudança manda estado-sala a todos
    expect(ana.estado.prazoMs).toBe(20_000);
    amb.avancar(5_000);
    new ClienteDeTeste(amb, 'Esp2').entrar(ana.codigo);
    expect(ana.estado.prazoMs).toBe(15_000);
  });

  it('dentro da folga o prazo mostrado é 0, nunca negativo', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(31_000);
    new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    expect(ana.estado.vez).toBe(0);
    expect(ana.estado.prazoMs).toBe(0);
  });

  it('quem volta no meio da vez recebe o que falta, e voltar não zera o relógio', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(10_000);
    ana.sair();
    amb.avancar(10_000);
    ana.reconectar();
    expect(ana.estado.prazoMs).toBe(10_000);
    amb.avancar(11_499);
    expect(ana.estado.vez).toBe(0);
    amb.avancar(1);
    expect(ana.estado.vez).toBe(1);
  });

  it('o prazo recomeça a cada partida nova', () => {
    const fimDeJogo = (p: EstadoPartida): ResultadoRegras => ({
      partida: { ...p, fase: 'fim', vez: 1, vencedor: 0, naMesa: p.naMesa.filter((b) => b !== 1) },
      consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1, vencedor: 0, texto: 'fim' },
    });
    const amb = criarAmbiente({}, { regras: { novaPartida, aplicarTacada: (p) => fimDeJogo(p) } });
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fimDeJogo(v.partida).partida, mesa: v.mesa });
    expect(ana.erros).toHaveLength(0);
    expect(ana.estado.vez).toBeNull();
    expect(ana.estado.prazoMs).toBeNull();
    amb.avancar(10 * 60_000); // partida acabada: relógio parado, nada passa nem estoura
    expect(beto.conn.todas('tempo-esgotado')).toHaveLength(0);
    ana.enviar({ tipo: 'nova-partida' });
    expect(ana.erros).toHaveLength(0);
    expect(ana.estado.prazoMs).toBe(30_000);
    expect(beto.estado.prazoMs).toBe(30_000);
  });
});

describe('relógio — a vez passa quando o tempo acaba', () => {
  it('perde-a-vez: no prazo mais a folga a vez passa com passarVez, e todos recebem o aviso, o estado e o retrato nessa ordem', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    const antes = beto.visao!.partida;
    amb.avancar(31_499);
    expect(beto.estado.vez).toBe(0);
    expect(beto.conn.todas('tempo-esgotado')).toHaveLength(0);
    ana.conn.limpar();
    beto.conn.limpar();

    amb.avancar(1);
    for (const c of [ana, beto]) {
      expect(c.conn.todas('tempo-esgotado')).toEqual([{ tipo: 'tempo-esgotado', lugar: 0, proximo: 1, motivo: 'tempo', consequencia: 'perde-a-vez' }]);
      expect(tipos(c)).toEqual(['tempo-esgotado', 'estado-sala', 'retrato']);
      expect(c.estado.vez).toBe(1);
      expect(c.estado.prazoMs).toBe(30_000);
      expect(c.conn.ultima('retrato')).toMatchObject({ motivo: 'vez-passou', seq: 0, ultima: null });
    }
    expect(beto.conn.ultima('retrato')!.partida).toEqual(passarVez(antes));
    expect(amb.logs.find((l) => l.startsWith('vez-passou'))).toContain('"motivo":"tempo"');
  });

  it('a vez nova tem o tempo inteiro, e a vez passada não passa de novo no segundo seguinte', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(31_500);
    expect(ana.estado.vez).toBe(1);
    amb.avancar(1000);
    amb.avancar(1000);
    expect(ana.estado.vez).toBe(1);
    expect(ana.conn.todas('tempo-esgotado')).toHaveLength(1);
    amb.avancar(28_000); // 30 s depois de a vez chegar a Beto
    beto.jogar(TACADA_MEDIA, 5);
    expect(beto.erros).toHaveLength(0);
    expect(beto.estado.seq).toBe(1);
  });

  it('2x2: a vez anda na roda A1, B1, A2, B2 a cada estouro', () => {
    const amb = criarAmbiente();
    const clientes = salaIniciada(amb, '2x2', { tempoS: 15 });
    const vistos: (number | null)[] = [];
    for (let i = 0; i < 5; i++) {
      amb.avancar(16_500);
      vistos.push(clientes[0]!.estado.vez);
    }
    expect(vistos).toEqual([1, 2, 3, 0, 1]);
    expect(clientes[3]!.conn.todas('tempo-esgotado').map((m) => [m.lugar, m.proximo])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [0, 1],
    ]);
  });

  it('a função que passa a vez é a injetada e seu resultado é a partida nova', () => {
    const chamadas: EstadoPartida[] = [];
    const amb = criarAmbiente(
      {},
      {
        passarVez: (p) => {
          chamadas.push(p);
          return { ...p, vez: 1 };
        },
      },
    );
    const [, beto] = salaIniciada(amb, '1x1', { tempoS: 15 }) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(16_499);
    expect(chamadas).toHaveLength(0);
    amb.avancar(1);
    expect(chamadas).toHaveLength(1);
    expect(beto.estado.vez).toBe(1);
  });

  it('mira e chat não adiam o relógio, nem a tacada recusada', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(29_000);
    ana.enviar({ tipo: 'mira', angulo: 0.7, lateral: 0, vertical: 0, recuo: 0.1 });
    ana.enviar({ tipo: 'chat', texto: 'calma, já vou' });
    beto.enviar({ tipo: 'chat', texto: 'anda logo' });
    ana.enviar({ ...ana.montarTacada(TACADA_MEDIA, 5), seq: 7 });
    expect(ana.ultimoErro?.codigo).toBe('seq-errado');
    amb.avancar(2_499);
    expect(beto.estado.vez).toBe(0);
    amb.avancar(1);
    expect(beto.estado.vez).toBe(1);
  });
});

describe('relógio — folga de rede e a tacada que chega tarde', () => {
  it('a tacada que chega até a folga depois do prazo ainda vale', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    const m = ana.montarTacada(TACADA_MEDIA, 5);
    amb.semTick(31_499);
    ana.enviar(m);
    expect(ana.erros).toHaveLength(0);
    expect(beto.estado.seq).toBe(1);
    expect(beto.conn.todas('tempo-esgotado')).toHaveLength(0);
  });

  it('a que chega depois da folga é recusada, mesmo sem tick no meio: a vez passa antes de a mensagem ser lida', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    const m = ana.montarTacada(TACADA_MEDIA, 5);
    amb.semTick(31_500);
    ana.enviar(m);
    expect(ana.ultimoErro?.codigo).toBe('nao-e-sua-vez');
    expect(beto.conn.todas('tempo-esgotado')).toEqual([{ tipo: 'tempo-esgotado', lugar: 0, proximo: 1, motivo: 'tempo', consequencia: 'perde-a-vez' }]);
    expect(beto.estado.vez).toBe(1);
    expect(beto.estado.seq).toBe(0);
  });

  it('a conferência que o transporte faz antes de decodificar a gravação também vê o prazo vencido', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    amb.semTick(31_499);
    expect(amb.registro.conferirTacada(ana.conn, 0)).toBeNull();
    amb.semTick(1);
    expect(amb.registro.conferirTacada(ana.conn, 0)).toBe('nao-e-sua-vez');
    expect(beto.estado.vez).toBe(1);
  });

  it('a folga é configurável', () => {
    const amb = criarAmbiente({ relogioTacada: { ...PADRAO, folgaMs: 200 } });
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 15 }) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(15_199);
    expect(ana.estado.vez).toBe(0);
    amb.avancar(1);
    expect(beto.estado.vez).toBe(1);
  });
});

describe('relógio — a tacada anterior ainda está animando', () => {
  it('o prazo da vez nova só começa quando a animação acaba, mais a margem', () => {
    const amb = criarAmbiente({ relogioTacada: { ...PADRAO, margemAnimacaoMs: 800 } });
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    const m = ana.jogar(TACADA_MEDIA, 5);
    const animacao = m.gravacao.duracao * 1000;
    expect(animacao).toBeGreaterThan(1000);
    const quem = ana.estado.vez!;
    const c = quem === 0 ? ana : beto;
    expect(ana.estado.prazoMs).toBe(Math.round(animacao + 800 + 30_000));
    expect(beto.estado.prazoMs).toBe(Math.round(animacao + 800 + 30_000));

    const vence = Math.ceil(animacao + 800 + 31_500);
    amb.avancar(vence - 1);
    expect(c.estado.vez).toBe(quem);
    amb.avancar(1);
    expect(c.estado.vez).not.toBe(quem);
    expect(c.conn.ultima('tempo-esgotado')).toMatchObject({ lugar: quem, motivo: 'tempo' });
  });

  it('a duração que o cliente declara tem teto: gravação de 100 000 s não congela o relógio de ninguém', () => {
    const amb = criarAmbiente({ relogioTacada: { ...PADRAO, margemAnimacaoMs: 1000, animacaoMaximaMs: 60_000 } });
    const [ana] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    const m = ana.montarTacada(TACADA_MEDIA, 5);
    const eventos = m.gravacao.eventos.map((e) => (e.tipo === 'parou' ? { ...e, t: 100_000 } : e));
    ana.enviar({ ...m, gravacao: { ...m.gravacao, duracao: 100_000, eventos } });
    expect(ana.erros).toHaveLength(0);
    expect(ana.estado.prazoMs).toBe(60_000 + 1000 + 30_000);
  });
});

describe('relógio — jogador desconectado: vale o menor dos dois prazos', () => {
  it('o relógio vence antes da tolerância de ausência: passa com motivo tempo', () => {
    const amb = criarAmbiente(); // tolerância de 60 s
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(25_000);
    ana.sair();
    amb.avancar(6_499);
    expect(beto.estado.vez).toBe(0);
    amb.avancar(1);
    expect(beto.estado.vez).toBe(1);
    expect(beto.conn.ultima('tempo-esgotado')).toMatchObject({ lugar: 0, proximo: 1, motivo: 'tempo' });
  });

  it('a tolerância vence antes do relógio: passa com motivo ausencia', () => {
    const amb = criarAmbiente({ toleranciaVezMs: 10_000 });
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 60 }) as [ClienteDeTeste, ClienteDeTeste];
    ana.sair();
    amb.avancar(9_999);
    expect(beto.estado.vez).toBe(0);
    amb.avancar(1);
    expect(beto.estado.vez).toBe(1);
    expect(beto.conn.ultima('tempo-esgotado')).toMatchObject({ lugar: 0, proximo: 1, motivo: 'ausencia', consequencia: 'perde-a-vez' });
    expect(amb.logs.find((l) => l.startsWith('vez-passou'))).toContain('"motivo":"ausencia"');
  });

  it('sem limite de tempo, a tolerância de ausência continua valendo', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: null }) as [ClienteDeTeste, ClienteDeTeste];
    ana.sair();
    amb.avancar(59_999);
    expect(beto.estado.vez).toBe(0);
    amb.avancar(1);
    expect(beto.estado.vez).toBe(1);
    expect(beto.conn.ultima('tempo-esgotado')).toMatchObject({ motivo: 'ausencia' });
    expect(beto.estado.prazoMs).toBeNull();
  });

  it('a ausência de quem não tem a vez não mexe no relógio de quem joga', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    beto.sair();
    amb.avancar(31_499);
    expect(ana.estado.vez).toBe(0);
    amb.avancar(1);
    expect(ana.estado.vez).toBe(1);
  });
});
