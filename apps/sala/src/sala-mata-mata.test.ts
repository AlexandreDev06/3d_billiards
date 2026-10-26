import { describe, expect, it } from 'vitest';
import { FORCA_DA_SALA_PADRAO, GIZ_DA_SALA_PADRAO, LUGARES_POR_MODO, type ModoSala } from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESET_MATA_MATA, aplicarTacada, pontosPorEquipe, type EstadoPartida } from '@sinuca/regras';
import {
  ClienteDeTeste,
  SEM_LIMITE,
  acharTacada,
  brancaSaiu,
  cegou,
  criarAmbiente,
  mensagemDeCriar,
  numeradasEncacapadas,
  salaIniciada,
} from './para-testes';

const MM = PRESET_MATA_MATA.regras;
const ids = (p: EstadoPartida): string[] => p.jogadores.map((j) => j.id);
const equipesDe = (c: ClienteDeTeste): number[] => c.estado.lugares.map((l) => l.equipe);

/** Sala de mata-mata ainda na espera, com `quantos` pessoas sentadas (a primeira é a anfitriã). */
function esperaMataMata(modo: ModoSala, quantos = LUGARES_POR_MODO[modo], relogio: Parameters<ClienteDeTeste['criar']>[2] = SEM_LIMITE) {
  const amb = criarAmbiente();
  const clientes = ['Ana', 'Beto', 'Cida', 'Davi'].slice(0, quantos).map((n) => new ClienteDeTeste(amb, n));
  clientes[0]!.criar(modo, MM, relogio);
  for (const c of clientes.slice(1)) c.entrar(clientes[0]!.codigo);
  return { amb, clientes, ana: clientes[0]! };
}

describe('mata-mata — criar a sala', () => {
  it('a sala nasce com a modalidade, o preset, os lugares (cada um é a própria equipe) e o giz e a força padrão', () => {
    const { ana } = esperaMataMata('1x1x1');
    expect(ana.estado).toMatchObject({ modo: '1x1x1', modalidade: 'mata-mata', preset: 'Mata-mata', fase: 'espera', giz: GIZ_DA_SALA_PADRAO, forca: FORCA_DA_SALA_PADRAO });
    expect(equipesDe(ana)).toEqual([0, 1, 2, 3]);
  });

  it('sem `modalidade` a sala é de par ou ímpar (o padrão), com o preset e o giz e a força do padrão', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    expect(ana.estado).toMatchObject({ modo: '1x1', modalidade: 'par-ou-impar', preset: 'Boteco', giz: GIZ_DA_SALA_PADRAO, forca: 'linha' });
  });

  it.each<[ModoSala, number[]]>([
    ['1x1', [0, 1, 0, 1]],
    ['1x1x1', [0, 1, 2, 3]],
    ['1x1x1x1', [0, 1, 2, 3]],
  ])('mata-mata em %s: as equipes dos lugares são %j', (modo, equipes) => {
    const { ana } = esperaMataMata(modo, 1);
    expect(ana.estado.modalidade).toBe('mata-mata');
    expect(equipesDe(ana)).toEqual(equipes);
  });

  it('o modo que a modalidade não joga é recusado ao criar (regras-invalidas, com o que ela aceita) e nada é criado', () => {
    const amb = criarAmbiente();
    for (const modo of ['2x1', '2x2'] as const) {
      const ana = new ClienteDeTeste(amb, 'Ana').enviar(mensagemDeCriar('Ana', modo, MM));
      expect(ana.ultimoErro, modo).toMatchObject({ codigo: 'regras-invalidas' });
      expect(ana.ultimoErro!.mensagem).toBe(`Mata-mata não joga em ${modo} (aceita 1x1, 1x1x1, 1x1x1x1).`);
    }
    for (const modo of ['1x1x1', '1x1x1x1'] as const) {
      const ana = new ClienteDeTeste(amb, 'Ana').enviar(mensagemDeCriar('Ana', modo, PRESET_BOTECO.regras));
      expect(ana.ultimoErro, modo).toMatchObject({ codigo: 'regras-invalidas' });
      expect(ana.ultimoErro!.mensagem).toBe(`Par ou ímpar não joga em ${modo} (aceita 1x1, 2x1, 2x2).`);
    }
    expect(amb.registro.totalSalas).toBe(0);
  });

  it('a modalidade e as regras mandadas têm de ser a mesma: nenhuma das duas vence a outra em silêncio', () => {
    const amb = criarAmbiente();
    const mataComBoteco = new ClienteDeTeste(amb, 'Ana').enviar({ ...mensagemDeCriar('Ana', '1x1', PRESET_BOTECO.regras), modalidade: 'mata-mata' });
    expect(mataComBoteco.ultimoErro).toMatchObject({ codigo: 'regras-invalidas', mensagem: 'A sala é de Mata-mata, mas as regras mandadas são de Par ou ímpar.' });
    const semModalidadeComMata = new ClienteDeTeste(amb, 'Beto').enviar({ ...mensagemDeCriar('Beto', '1x1', MM), modalidade: undefined });
    expect(semModalidadeComMata.ultimoErro).toMatchObject({ codigo: 'regras-invalidas', mensagem: 'A sala é de Par ou ímpar, mas as regras mandadas são de Mata-mata.' });
    const explicita = new ClienteDeTeste(amb, 'Cida').enviar({ ...mensagemDeCriar('Cida', '1x1', PRESET_BOTECO.regras), modalidade: 'par-ou-impar' });
    expect(explicita.ultimoErro).toBeUndefined();
    expect(amb.registro.totalSalas).toBe(1);
  });

  it('regras de mata-mata fora do que a modalidade permite são recusadas como qualquer preset inválido', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').enviar(mensagemDeCriar('Ana', '1x1x1', { ...MM, bolas: '2-14' }));
    expect(ana.ultimoErro?.codigo).toBe('regras-invalidas');
    expect(amb.registro.totalSalas).toBe(0);
  });
});

describe('mata-mata — iniciar a partida', () => {
  it.each<ModoSala>(['1x1', '1x1x1', '1x1x1x1'])('%s: exige todos os lugares conectados e monta uma equipe por pessoa, com as 15 bolas', (modo) => {
    const { amb, clientes, ana } = esperaMataMata(modo, LUGARES_POR_MODO[modo] - 1);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.ultimoErro?.codigo).toBe('lugares-incompletos');
    expect(ana.estado.fase).toBe('espera');
    const ultimo = new ClienteDeTeste(amb, 'Edu').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.estado.fase).toBe('jogando');
    for (const c of [...clientes, ultimo]) {
      const retrato = c.conn.todas('retrato').at(-1)!;
      expect(retrato.motivo).toBe('inicio');
      expect(retrato.partida.config.modalidade).toBe('mata-mata');
      expect(retrato.partida.jogadores.map((j) => j.equipe)).toEqual([...Array(LUGARES_POR_MODO[modo]).keys()]);
      expect(ids(retrato.partida)).toEqual([...Array(LUGARES_POR_MODO[modo]).keys()].map((l) => `lugar-${l}`));
      expect(retrato.partida.naMesa).toHaveLength(15);
      expect(retrato.arrumacao).toHaveLength(15);
      expect(retrato.partida.grupos).toEqual(Array(LUGARES_POR_MODO[modo]).fill(null));
    }
    expect(ana.estado.vez).toBe(0);
  });
});

/**
 * A roda do mata-mata com as penas do suicídio e do cegar, escrita à parte das regras (do pedido: quem derruba a branca ou
 * cega perde a próxima vez; a vez passa ao seguinte, e quando a roda chega em quem perde ele é pulado uma vez; as duas faltas
 * na mesma tacada são uma pena só). Serve de oráculo para os testes da sala.
 */
class RodaComPena {
  private readonly perdem = new Set<number>();
  constructor(private readonly jogadores: number) {}

  /** A vez depois de `lugar` tacar; `pena` (suicídio, cegar ou os dois) põe `lugar` na lista, uma vez, antes de a roda andar. */
  depoisDe(lugar: number, pena: boolean): number {
    if (pena) this.perdem.add(lugar);
    let vez = (lugar + 1) % this.jogadores;
    while (this.perdem.delete(vez)) vez = (vez + 1) % this.jogadores;
    return vez;
  }

  get lista(): number[] {
    return [...this.perdem].sort((a, b) => a - b);
  }
}

describe('mata-mata — a vez gira e os pontos são de quem tacou (física real)', () => {
  it('três pessoas jogam nove tacadas: a vez anda 0, 1, 2, 0... (pulando quem perdeu a vez no suicídio ou no cegar), o ponto vai para quem encaçapou e a conta fecha com a mesa', () => {
    const amb = criarAmbiente();
    const clientes = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM);
    const [ana] = clientes as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const esperados = [0, 0, 0];
    const roda = new RodaComPena(3);
    let vezEsperada = 0;
    let encontradas = 0;
    let comPena = 0;
    for (let i = 0; i < 9; i++) {
      const lugar = ana.estado.vez!;
      expect(lugar, `a vez da tacada ${i}`).toBe(vezEsperada);
      const quem = clientes[lugar]!;
      // 1ª e 4ª: uma que encaçapa; as outras, uma que não toca em nada (cegar) ou o que vier
      const m =
        i === 0 || i === 3
          ? acharTacada(quem.visao!, (t) => numeradasEncacapadas(t).length > 0 && !t.gravacao.eventos.some((e) => e.tipo === 'cacapa' && e.bola === 0))
          : quem.montarTacada();
      const antes = quem.visao!.partida;
      const caidas = numeradasEncacapadas(m);
      if (i === 0 || i === 3) expect(caidas.length, `a tacada ${i} pedia bola na caçapa`).toBeGreaterThan(0);
      encontradas += caidas.length;
      esperados[lugar]! += caidas.length;

      const pena = brancaSaiu(m) || cegou(m);
      if (pena) comPena++;
      vezEsperada = roda.depoisDe(lugar, pena);
      quem.enviar(m);
      expect(quem.erros, `tacada ${i}`).toHaveLength(0);
      const retransmitida = ana.conn.todas('tacada-retransmitida').at(-1)!;
      expect(retransmitida).toMatchObject({ seq: i, lugar });
      // quem decide a partida são as regras da sala sobre os eventos que chegaram
      expect(retransmitida.partida).toEqual(aplicarTacada(antes, m.gravacao.eventos).partida);
      const partida = retransmitida.partida;
      expect(pontosPorEquipe(partida), `pontos depois da tacada ${i}`).toEqual(esperados);
      expect(partida.encacapadas.slice(partida.encacapadas.length - caidas.length)).toEqual(caidas.map((bola) => ({ bola, jogador: lugar })));
      expect(partida.retiradas, 'no mata-mata nada sai da mesa como pena').toEqual([]);
      expect(partida.naMesa.length + partida.encacapadas.length).toBe(15);
      expect(partida.vez).toBe(vezEsperada);
      expect(partida.perdemAProximaVez ?? [], 'quem ainda deve a vez').toEqual(roda.lista);
      expect(retransmitida.consequencias.retirar).toEqual([]);
      expect(retransmitida.consequencias.proximo).toBe(vezEsperada);
      for (const c of clientes) {
        expect(c.estado.vez, c.nome).toBe(vezEsperada);
        expect(c.estado.seq, c.nome).toBe(i + 1);
      }
    }
    expect(encontradas).toBeGreaterThan(0);
    expect(comPena, 'alguma dessas tacadas cegou ou derrubou a branca: o pulo da roda foi posto à prova').toBeGreaterThan(0);
    expect(amb.logs.filter((l) => l.startsWith('placar')), 'nenhuma dessas tacadas acabou a partida: nada a contar, nem falha').toEqual([]);
    expect(esperados.reduce((a, b) => a + b, 0)).toBe(encontradas);
    // todos acabam vendo a mesma coisa
    for (const c of clientes) expect(c.visao).toEqual(ana.visao);
  }, 60_000);

  it('cegar não tira bola nem mexe nos pontos: só passa a vez e anota que quem cegou perde a próxima', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const antes = ana.visao!.partida;
    const cega = acharTacada(ana.visao!, (t) => t.gravacao.eventos.every((e) => e.tipo === 'taco-bola' || e.tipo === 'bola-tabela' || e.tipo === 'parou'), [2, 1, 0.5]);
    ana.enviar(cega);
    expect(ana.erros).toHaveLength(0);
    const r = beto.conn.todas('tacada-retransmitida').at(-1)!;
    expect(r.consequencias.faltas).toEqual([{ nome: 'cegar' }]);
    expect(r.consequencias.retirar).toEqual([]);
    expect(r.partida.naMesa).toEqual(antes.naMesa);
    expect(r.partida.encacapadas).toEqual([]);
    expect(r.partida).toMatchObject({ vez: 1, perdemAProximaVez: [0] });
    expect(beto.estado.vez).toBe(1);
  });

  it('a branca que cai volta à marca de saída pelo `recolocar`, sem tirar bola, e a vez passa', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const suicida = acharTacada(ana.visao!, (t) => t.gravacao.eventos.some((e) => e.tipo === 'cacapa' && e.bola === 0) && numeradasEncacapadas(t).length === 0, [4, 2, 1, 8, 6]);
    ana.enviar(suicida);
    expect(ana.erros).toHaveLength(0);
    const r = beto.conn.todas('tacada-retransmitida').at(-1)!;
    expect(r.consequencias.faltas.map((f) => f.nome)).toContain('suicidio');
    expect(r.consequencias.retirar).toEqual([]);
    expect(r.consequencias.recolocar.at(-1)).toEqual({ bola: 0, lugar: 'marca-saida' });
    expect(beto.estado.vez).toBe(1);
  });
});

describe('mata-mata — relógio e queda: a vez passa pela roda', () => {
  it('o tempo esgota e a vez anda 0 → 1 → 2 → 0 (passarVez do mata-mata), cada uma com o aviso e o retrato', () => {
    const amb = criarAmbiente();
    const clientes = salaIniciada(amb, '1x1x1', { tempoS: 15 }, undefined, MM);
    const [ana, , cida] = clientes as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const vistos: (number | null)[] = [];
    for (let i = 0; i < 4; i++) {
      amb.avancar(16_500);
      vistos.push(ana.estado.vez);
    }
    expect(vistos).toEqual([1, 2, 0, 1]);
    expect(cida.conn.todas('tempo-esgotado').map((m) => [m.lugar, m.proximo, m.motivo])).toEqual([
      [0, 1, 'tempo'],
      [1, 2, 'tempo'],
      [2, 0, 'tempo'],
      [0, 1, 'tempo'],
    ]);
    const retrato = cida.conn.todas('retrato').at(-1)!;
    expect(retrato).toMatchObject({ motivo: 'vez-passou' });
    expect(retrato.partida.vez).toBe(1);
    expect(retrato.partida.config.modalidade).toBe('mata-mata');
  });

  it('quem tacou depois de o tempo passar a vez a ele joga normalmente (a roda segue de onde estava)', () => {
    const amb = criarAmbiente();
    const clientes = salaIniciada(amb, '1x1x1', { tempoS: 15 }, undefined, MM);
    amb.avancar(16_500); // a vez foi de Ana para Beto
    const beto = clientes[1]!;
    expect(beto.estado.vez).toBe(1);
    beto.jogar();
    expect(beto.erros).toHaveLength(0);
    expect(clientes[0]!.estado.vez).toBe(2);
  });

  it('o jogador da vez cai: depois da tolerância a vez passa ao próximo da roda, por ausência', () => {
    const amb = criarAmbiente({ toleranciaVezMs: 10_000 });
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    ana.sair();
    amb.avancar(9_999);
    expect(beto.estado.vez).toBe(0);
    amb.avancar(1);
    expect(beto.estado.vez).toBe(1);
    expect(cida.conn.ultima('tempo-esgotado')).toMatchObject({ lugar: 0, proximo: 1, motivo: 'ausencia' });
    // a vez de quem está fora também passa, e a roda volta a quem sobrou
    beto.sair();
    amb.avancar(10_000);
    expect(cida.estado.vez).toBe(2);
    cida.sair();
    ana.reconectar();
    amb.avancar(10_000);
    expect(ana.estado.vez).toBe(0);
  });
});

describe('modalidade na espera — configurar-sala', () => {
  const quantosLugaresDe = (c: ClienteDeTeste): number => LUGARES_POR_MODO[c.estado.modo];

  it('par ou ímpar → mata-mata sem dizer o modo: o modo atual serve (1x1), fica; quem sobra num modo menor vira espectador', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const boasVindas = beto.conn.todas('boas-vindas').length;
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata' });
    expect(ana.estado).toMatchObject({ modalidade: 'mata-mata', modo: '1x1', preset: 'Mata-mata' });
    expect(beto.estado.modalidade).toBe('mata-mata');
    expect(beto.conn.todas('boas-vindas')).toHaveLength(boasVindas); // ninguém mudou de lugar
    expect(beto.estado.lugares[1]!.nome).toBe('Beto');
  });

  it.each<[ModoSala, ModoSala]>([
    ['2x1', '1x1x1'],
    ['2x2', '1x1x1x1'],
  ])('par ou ímpar %s → mata-mata sem dizer o modo: o atual não serve, vai ao de MESMO número de lugares (%s) e ninguém perde o lugar', (modo, esperado) => {
    const amb = criarAmbiente();
    const quantos = LUGARES_POR_MODO[modo];
    const clientes = ['Ana', 'Beto', 'Cida', 'Davi'].slice(0, quantos).map((n) => new ClienteDeTeste(amb, n));
    clientes[0]!.criar(modo);
    for (const c of clientes.slice(1)) c.entrar(clientes[0]!.codigo);
    const nomes = clientes[0]!.estado.lugares.map((l) => l.nome);
    const boasVindas = clientes.map((c) => c.conn.todas('boas-vindas').length);
    clientes[0]!.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata' });
    expect(clientes[0]!.estado).toMatchObject({ modalidade: 'mata-mata', modo: esperado, preset: 'Mata-mata', espectadores: 0 });
    expect(clientes[0]!.estado.lugares.map((l) => l.nome)).toEqual(nomes);
    expect(equipesDe(clientes[0]!)).toEqual([0, 1, 2, 3]);
    // ninguém mudou de lugar, então ninguém recebe boas-vindas novas
    clientes.forEach((c, i) => {
      expect(c.conn.todas('boas-vindas'), c.nome).toHaveLength(boasVindas[i]!);
      expect(c.lugar, c.nome).toBe(i);
    });
    // e dá para iniciar com os mesmos sentados
    clientes[0]!.enviar({ tipo: 'iniciar' });
    expect(clientes[0]!.estado.fase).toBe('jogando');
  });

  it.each<[ModoSala, ModoSala]>([
    ['1x1x1', '2x1'],
    ['1x1x1x1', '2x2'],
  ])('mata-mata %s → par ou ímpar sem dizer o modo: o atual não serve, vai ao de MESMO número de lugares (%s) e ninguém perde o lugar', (modo, esperado) => {
    const { ana, clientes } = esperaMataMata(modo);
    const nomes = ana.estado.lugares.map((l) => l.nome);
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar' });
    expect(ana.estado).toMatchObject({ modalidade: 'par-ou-impar', modo: esperado, preset: 'Boteco', espectadores: 0 });
    expect(ana.estado.lugares.map((l) => l.nome)).toEqual(nomes);
    expect(equipesDe(ana)).toEqual([0, 1, 0, 1]);
    for (const c of clientes) expect(c.lugar, c.nome).not.toBeNull();
  });

  it('modalidade nova com um modo menor dito junto: quem sobra vira espectador, com boas-vindas novas antes do estado-sala', () => {
    const amb = criarAmbiente();
    const clientes = ['Ana', 'Beto', 'Cida', 'Davi'].map((n) => new ClienteDeTeste(amb, n));
    clientes[0]!.criar('2x2');
    for (const c of clientes.slice(1)) c.entrar(clientes[0]!.codigo);
    const [ana, beto, cida, davi] = clientes as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata', modo: '1x1' });
    expect(ana.estado).toMatchObject({ modalidade: 'mata-mata', modo: '1x1', espectadores: 2 });
    expect(ana.estado.lugares.map((l) => l.nome)).toEqual(['Ana', 'Beto', null, null]);
    for (const c of [cida, davi]) {
      expect(c.conn.ultima('boas-vindas'), c.nome).toMatchObject({ lugar: null, token: c.token });
      expect(c.conn.recebidas.at(-1)!.tipo).toBe('estado-sala');
      expect(c.conn.recebidas.at(-2)!.tipo).toBe('boas-vindas');
    }
    expect(beto.lugar).toBe(1);
  });

  it('modalidade e modo juntos: o modo precisa servir, e o par escolhido vale', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x2');
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata', modo: '1x1x1x1' });
    expect(ana.estado).toMatchObject({ modalidade: 'mata-mata', modo: '1x1x1x1' });
    expect(equipesDe(ana)).toEqual([0, 1, 2, 3]);
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar', modo: '2x1' });
    expect(ana.estado).toMatchObject({ modalidade: 'par-ou-impar', modo: '2x1', preset: 'Boteco' });
    expect(quantosLugaresDe(ana)).toBe(3);
  });

  it('só o modo, na mesma modalidade: mata-mata vai a 1x1x1x1 e volta a 1x1; par ou ímpar vai a 2x1', () => {
    const { ana } = esperaMataMata('1x1x1', 1);
    ana.enviar({ tipo: 'configurar-sala', modo: '1x1x1x1' });
    expect(ana.estado).toMatchObject({ modalidade: 'mata-mata', modo: '1x1x1x1' });
    ana.enviar({ tipo: 'configurar-sala', modo: '1x1' });
    expect(ana.estado).toMatchObject({ modalidade: 'mata-mata', modo: '1x1' });
  });

  it.each<[ModoSala, ModoSala]>([
    ['1x1x1', '1x1x1'],
    ['1x1x1x1', '1x1x1x1'],
  ])('configurar sem dizer a modalidade nem o modo não mexe no modo nem nos lugares (mata-mata em %s)', (modo) => {
    const { ana, clientes } = esperaMataMata(modo);
    const nomes = ana.estado.lugares.map((l) => l.nome);
    ana.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 45 }, forca: 'empurrar' });
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata' });
    expect(ana.estado).toMatchObject({ modalidade: 'mata-mata', modo, forca: 'empurrar' });
    expect(ana.estado.lugares.map((l) => l.nome)).toEqual(nomes);
    expect(ana.estado.espectadores).toBe(0);
    for (const c of clientes) expect(c.lugar, c.nome).not.toBeNull();
  });

  it.each<ModoSala>(['2x1', '2x2'])('configurar sem dizer a modalidade nem o modo não mexe no modo nem nos lugares (par ou ímpar em %s)', (modo) => {
    const amb = criarAmbiente();
    const clientes = ['Ana', 'Beto', 'Cida', 'Davi'].slice(0, LUGARES_POR_MODO[modo]).map((n) => new ClienteDeTeste(amb, n));
    clientes[0]!.criar(modo);
    for (const c of clientes.slice(1)) c.entrar(clientes[0]!.codigo);
    const nomes = clientes[0]!.estado.lugares.map((l) => l.nome);
    clientes[0]!.enviar({ tipo: 'configurar-sala', giz: { passada: 0.2 }, linha: { previsao: true } });
    clientes[0]!.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar' });
    expect(clientes[0]!.estado).toMatchObject({ modalidade: 'par-ou-impar', modo });
    expect(clientes[0]!.estado.lugares.map((l) => l.nome)).toEqual(nomes);
    expect(clientes[0]!.estado.espectadores).toBe(0);
  });

  it('combinação inválida é recusada com o que a modalidade aceita, e NADA muda (nem a modalidade, nem o giz que veio junto)', () => {
    const { ana } = esperaMataMata('1x1x1');
    const antes = ana.estado;
    ana.enviar({ tipo: 'configurar-sala', modo: '2x2', giz: { passadaS: 5 }, forca: 'empurrar' });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'regras-invalidas', mensagem: 'Mata-mata não joga em 2x2 (aceita 1x1, 1x1x1, 1x1x1x1).' });
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar', modo: '1x1x1x1' });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'regras-invalidas', mensagem: 'Par ou ímpar não joga em 1x1x1x1 (aceita 1x1, 2x1, 2x2).' });
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar', giz: { desgasteMin: 0.5, desgasteMax: 0.1 } });
    expect(ana.erros.at(-1)?.codigo).toBe('regras-invalidas');
    expect(ana.estado).toEqual(antes);
    const paridade = new ClienteDeTeste(criarAmbiente(), 'Zé').criar('1x1'); // par ou ímpar não aceita o 1x1x1
    paridade.enviar({ tipo: 'configurar-sala', modo: '1x1x1' });
    expect(paridade.ultimoErro).toMatchObject({ codigo: 'regras-invalidas', mensagem: 'Par ou ímpar não joga em 1x1x1 (aceita 1x1, 2x1, 2x2).' });
    expect(paridade.estado.modo).toBe('1x1');
  });

  it('a casa que o anfitrião escolheu ao criar volta quando a sala volta à modalidade dela; a outra joga com o preset de fábrica', () => {
    const amb = criarAmbiente();
    const minhaCasa = { ...PRESET_BOTECO.regras, penaDireta: 2 as const };
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', minhaCasa, SEM_LIMITE, undefined, { preset: 'Minha casa' });
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    expect(ana.estado.preset).toBe('Minha casa');
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata' });
    expect(ana.estado.preset).toBe('Mata-mata');
    ana.enviar({ tipo: 'iniciar' });
    expect(beto.conn.todas('retrato').at(-1)!.partida.config).toEqual(MM);
    // outra sala: criada em mata-mata, vai ao par ou ímpar de fábrica
    const bia = new ClienteDeTeste(amb, 'Bia').criar('1x1', MM);
    new ClienteDeTeste(amb, 'Caio').entrar(bia.codigo);
    bia.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar' });
    expect(bia.estado.preset).toBe('Boteco');
    bia.enviar({ tipo: 'iniciar' });
    expect(bia.conn.todas('retrato').at(-1)!.partida.config).toEqual(PRESET_BOTECO.regras);
  });

  it('a casa escolhida volta depois de ir e voltar de modalidade, e é a que a partida usa', () => {
    const amb = criarAmbiente();
    const minhaCasa = { ...PRESET_BOTECO.regras, penaDireta: 2 as const };
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', minhaCasa, SEM_LIMITE, undefined, { preset: 'Minha casa' });
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata' });
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar' });
    expect(ana.estado).toMatchObject({ modalidade: 'par-ou-impar', preset: 'Minha casa' });
    ana.enviar({ tipo: 'iniciar' });
    expect(beto.conn.todas('retrato').at(-1)!.partida.config).toEqual(minhaCasa);
  });

  it('iniciar depois de trocar de modalidade usa os lugares do modo novo', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x2');
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata', modo: '1x1x1' });
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.ultimoErro?.codigo).toBe('lugares-incompletos');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    expect([beto.lugar, cida.lugar]).toEqual([1, 2]);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.estado.fase).toBe('jogando');
    expect(cida.conn.todas('retrato').at(-1)!.partida.jogadores.map((j) => j.equipe)).toEqual([0, 1, 2]);
  });

  it('só o anfitrião troca a modalidade, e só na espera', () => {
    const { ana, clientes } = esperaMataMata('1x1x1');
    clientes[1]!.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar' });
    expect(clientes[1]!.ultimoErro?.codigo).toBe('nao-anfitriao');
    expect(ana.estado.modalidade).toBe('mata-mata');
    ana.enviar({ tipo: 'iniciar' });
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar' });
    expect(ana.ultimoErro?.codigo).toBe('fase-errada');
    expect(ana.estado.modalidade).toBe('mata-mata');
  });
});

describe('giz e força — regras da sala', () => {
  it('ao criar: o giz parcial é completado com o padrão e a força vai como veio', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', undefined, SEM_LIMITE, undefined, { giz: { desgasteMax: 0.5, passadaS: 6 }, forca: 'empurrar' });
    expect(ana.estado.giz).toEqual({ desgasteMin: 0.1, desgasteMax: 0.5, passada: 0.1, passadaS: 6 });
    expect(ana.estado.forca).toBe('empurrar');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    expect(beto.estado.giz).toEqual(ana.estado.giz);
    expect(beto.estado.forca).toBe('empurrar');
  });

  it('sem nada a sala manda o padrão: gasto de 10 a 30%, passada de 10% em 3 s, força em linha', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    expect(ana.estado.giz).toEqual({ desgasteMin: 0.1, desgasteMax: 0.3, passada: 0.1, passadaS: 3 });
    expect(ana.estado.forca).toBe('linha');
  });

  it('ao criar, o mínimo do desgaste acima do máximo depois de completar é recusado (regras-invalidas) e nada é criado', () => {
    const amb = criarAmbiente();
    for (const giz of [{ desgasteMin: 0.4 }, { desgasteMax: 0.05 }, { desgasteMin: 0.5, desgasteMax: 0.4 }]) {
      const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', undefined, SEM_LIMITE, undefined, { giz });
      expect(ana.ultimoErro, JSON.stringify(giz)).toMatchObject({ codigo: 'regras-invalidas' });
      expect(ana.ultimoErro!.mensagem).toMatch(/desgaste mínimo do giz/);
    }
    expect(amb.registro.totalSalas).toBe(0);
    const ok = new ClienteDeTeste(amb, 'Ana').criar('1x1', undefined, SEM_LIMITE, undefined, { giz: { desgasteMin: 0.1, desgasteMax: 0.1 } });
    expect(ok.ultimoErro).toBeUndefined();
  });

  it('configurar-sala completa o parcial com o giz da sala, troca a força, e todos veem, até quem entra depois', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    ana.enviar({ tipo: 'configurar-sala', giz: { desgasteMax: 0.5 } });
    expect(ana.estado.giz).toEqual({ desgasteMin: 0.1, desgasteMax: 0.5, passada: 0.1, passadaS: 3 });
    ana.enviar({ tipo: 'configurar-sala', giz: { desgasteMin: 0.4, passada: 0.25 }, forca: 'empurrar' });
    const esperado = { desgasteMin: 0.4, desgasteMax: 0.5, passada: 0.25, passadaS: 3 };
    for (const c of [ana, beto]) expect(c.estado, c.nome).toMatchObject({ giz: esperado, forca: 'empurrar' });
    // campo ausente não muda nada
    ana.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 45 } });
    expect(ana.estado).toMatchObject({ giz: esperado, forca: 'empurrar' });
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    expect(esp.estado).toMatchObject({ giz: esperado, forca: 'empurrar' });
  });

  it('configurar-sala: o mínimo que passa do máximo da sala é recusado, e nada do que veio junto vale', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    ana.enviar({ tipo: 'configurar-sala', giz: { desgasteMin: 0.2, desgasteMax: 0.4 } });
    const antes = ana.estado;
    ana.enviar({ tipo: 'configurar-sala', giz: { desgasteMax: 0.15 }, forca: 'empurrar', relogio: { tempoS: 60 } });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'regras-invalidas', mensagem: 'O desgaste mínimo do giz (20%) passa do máximo (15%).' });
    expect(ana.estado).toEqual(antes);
    ana.enviar({ tipo: 'configurar-sala', giz: { desgasteMin: 0.45 } });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'regras-invalidas' });
    expect(ana.estado).toEqual(antes);
  });

  it('o giz e a força valem para a partida inteira e depois da volta à espera; durante a partida ninguém muda', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', SEM_LIMITE) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar({ tipo: 'configurar-sala', forca: 'empurrar' });
    expect(ana.ultimoErro?.codigo).toBe('fase-errada');
    ana.enviar({ tipo: 'configurar-sala', giz: { passadaS: 1 } });
    expect(ana.ultimoErro?.codigo).toBe('fase-errada');
    ana.jogar();
    for (const c of [ana, beto]) expect(c.estado, c.nome).toMatchObject({ giz: GIZ_DA_SALA_PADRAO, forca: 'linha' });
  });

  it('uma sala de mata-mata guarda o giz e a força ao trocar de modalidade (são da sala, não da modalidade)', () => {
    const { ana } = esperaMataMata('1x1x1', 1);
    ana.enviar({ tipo: 'configurar-sala', giz: { passada: 0.5 }, forca: 'empurrar' });
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'par-ou-impar' });
    expect(ana.estado).toMatchObject({ modalidade: 'par-ou-impar', forca: 'empurrar', giz: { ...GIZ_DA_SALA_PADRAO, passada: 0.5 } });
  });
});

describe('mata-mata — o log não leva o que não deve', () => {
  it('sala-criada e configurou dizem a modalidade e as regras novas, sem IP', () => {
    const { amb, ana } = esperaMataMata('1x1x1', 1);
    ana.enviar({ tipo: 'configurar-sala', forca: 'empurrar', giz: { passadaS: 2 } });
    const criada = amb.logs.find((l) => l.startsWith('sala-criada'))!;
    expect(criada).toContain('"modalidade":"mata-mata"');
    expect(criada).toContain('"modo":"1x1x1"');
    const configurou = amb.logs.find((l) => l.startsWith('configurou'))!;
    expect(configurou).toContain('"forca":"empurrar"');
    expect(configurou).toContain('"modalidade":"mata-mata"');
    expect(amb.logs.join('\n')).not.toContain('198.51.100.1');
  });
});
