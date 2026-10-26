import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { LIMITES_PROTOCOLO, LUGARES_POR_MODO, validarMensagemDaSala, type ModoSala, type PlacarSala } from '@sinuca/protocolo';
import { novaPartida, type EstadoPartida, type Jogador, type ResultadoRegras } from '@sinuca/regras';
import { ClienteDeTeste, ConexaoFalsa, TACADA_MEDIA, criarAmbiente, type Ambiente } from './para-testes';
import type { MotorDeRegras } from './regras';

interface Controle {
  /** Equipe que vence a partida que a próxima tacada encerra. */
  vencedor: 0 | 1;
  /** As equipes que as regras devolvem ficam trocadas (a pessoa do lugar 0 vai para a equipe 1): prova que a sala lê a equipe da partida. */
  inverter: boolean;
}

const fim = (p: EstadoPartida, vencedor: 0 | 1): ResultadoRegras => ({
  partida: { ...p, fase: 'fim', vez: 1, vencedor, naMesa: p.naMesa.filter((b) => b !== 1) },
  consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1, vencedor, texto: 'fim' },
});

/** Regras reais para começar (`novaPartida`) e uma tacada que acaba a partida para a equipe de `controle.vencedor`. */
function motorDe(controle: Controle): MotorDeRegras {
  return {
    novaPartida(config, jogadores, rng) {
      const base = novaPartida(config, jogadores, rng);
      if (!controle.inverter) return base;
      return { ...base, partida: { ...base.partida, jogadores: base.partida.jogadores.map((j) => ({ ...j, equipe: 1 - j.equipe })) } };
    },
    aplicarTacada: (p) => fim(p, controle.vencedor),
  };
}

interface Sala {
  readonly amb: Ambiente;
  readonly controle: Controle;
  readonly clientes: ClienteDeTeste[];
  readonly ana: ClienteDeTeste;
}

/** Sala já iniciada (modo e nomes à escolha), com a anfitriã Ana no lugar 0. */
function salaIniciada(modo: ModoSala = '1x1', nomes: string[] = ['Ana', 'Beto', 'Cida', 'Davi'], regras?: MotorDeRegras): Sala {
  const controle: Controle = { vencedor: 0, inverter: false };
  const amb = criarAmbiente({}, { regras: regras ?? motorDe(controle) });
  const quantos = LUGARES_POR_MODO[modo];
  const clientes = nomes.slice(0, quantos).map((n) => new ClienteDeTeste(amb, n));
  clientes[0]!.criar(modo);
  for (const c of clientes.slice(1)) c.entrar(clientes[0]!.codigo);
  clientes[0]!.enviar({ tipo: 'iniciar' });
  return { amb, controle, clientes, ana: clientes[0]! };
}

/** Onde o `estado-sala` diz que a pessoa está sentada agora (o `lugar` das boas-vindas só vale até ela trocar de lugar). */
const lugarDe = (c: ClienteDeTeste): number | null => c.estado.lugares.find((l) => l.nome === c.nome)?.lugar ?? null;

/** Quem tem a vez taca e a partida acaba, para a equipe `vencedor`. */
function acabar(s: Sala, vencedor: 0 | 1): void {
  s.controle.vencedor = vencedor;
  const vez = s.ana.estado.vez;
  const quem = s.clientes.find((c) => lugarDe(c) === vez)!;
  const v = quem.visao!;
  const erros = quem.erros.length;
  quem.enviar({ tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim(v.partida, vencedor).partida, mesa: v.mesa });
  expect(quem.erros.length, 'a tacada final foi aceita').toBe(erros);
  expect(s.ana.estado.vez).toBeNull();
}

/** Fim da partida → espera → outra partida, com os mesmos lugares. */
function outraPartida(s: Sala): void {
  s.ana.enviar({ tipo: 'voltar-ao-lobby' });
  s.ana.enviar({ tipo: 'iniciar' });
  expect(s.ana.estado.fase).toBe('jogando');
}

/** Os dois lados do confronto atual: "Ana e Cida 2 x 1 Beto" (e o histórico do mais recente para o mais antigo). */
function resumo(placar: PlacarSala | undefined): { atual: string | null; historico: string[] } {
  const texto = (c: NonNullable<PlacarSala['atual']>): string => `${c.lados[0].nomes.join(' e ')} ${c.lados[0].vitorias} x ${c.lados[1].vitorias} ${c.lados[1].nomes.join(' e ')}`;
  return { atual: placar?.atual ? texto(placar.atual) : null, historico: (placar?.historico ?? []).map(texto) };
}
const placarVisto = (c: ClienteDeTeste) => resumo(c.estado.placar);

describe('placar — a sala conta as partidas terminadas', () => {
  it('antes de qualquer partida o placar vem vazio, completo, para todos desde a criação da sala', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    expect(ana.estado.placar).toEqual({ atual: null, historico: [] });
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    for (const c of [ana, beto, esp]) for (const e of c.conn.todas('estado-sala')) expect(e.placar, 'todo estado-sala leva o placar').toEqual({ atual: null, historico: [] });
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.estado.placar).toEqual({ atual: null, historico: [] });
  });

  it('a primeira partida abre o confronto em 1 x 0 para quem venceu, igual para jogadores e espectador', () => {
    const s = salaIniciada();
    const esp = new ClienteDeTeste(s.amb, 'Esp').entrar(s.ana.codigo);
    acabar(s, 0);
    for (const c of [...s.clientes, esp]) expect(placarVisto(c), c.nome).toEqual({ atual: 'Ana 1 x 0 Beto', historico: [] });
  });

  it('a equipe 1 vencendo conta para o lado dela', () => {
    const s = salaIniciada();
    acabar(s, 1);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 0 x 1 Beto', historico: [] });
  });

  it('o placar novo chega no estado-sala que vem logo depois da tacada final; os de antes não o tinham', () => {
    const s = salaIniciada();
    const beto = s.clientes[1]!;
    const antes = beto.conn.recebidas.length;
    acabar(s, 0);
    const depois = beto.conn.recebidas.slice(antes);
    expect(depois.map((m) => m.tipo)).toEqual(['tacada-retransmitida', 'estado-sala']);
    expect(resumo((depois[1] as { placar?: PlacarSala }).placar)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: [] });
    for (const e of beto.conn.todas('estado-sala').slice(0, -1)) expect(e.placar).toEqual({ atual: null, historico: [] });
  });

  it('mesma dupla soma, de partida em partida: 3 x 1 depois de quatro', () => {
    const s = salaIniciada();
    acabar(s, 0);
    for (const vencedor of [1, 0, 0] as const) {
      outraPartida(s);
      acabar(s, vencedor);
    }
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 3 x 1 Beto', historico: [] });
    expect(placarVisto(s.clientes[1]!)).toEqual(placarVisto(s.ana));
  });

  it('uma tacada recusada (e a partida que segue em andamento) não mexe no placar', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    outraPartida(s);
    const antes = s.ana.estado.placar;
    const quem = s.clientes.find((c) => c.lugar === s.ana.estado.vez)!;
    const v = quem.visao!;
    quem.enviar({ tipo: 'tacada', seq: v.seq + 5, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim(v.partida, 0).partida, mesa: v.mesa });
    expect(quem.ultimoErro?.codigo).toBe('seq-errado');
    expect(s.ana.estado.placar).toEqual(antes);
    expect(s.ana.estado.fase).toBe('jogando');
  });

  it('voltar ao lobby, configurar a sala, a volta de quem caiu e a nova-partida não zeram o placar', () => {
    const s = salaIniciada();
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: [] });
    s.ana.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 15 }, linha: { previsao: true } });
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: [] });
    s.clientes[1]!.reconectar();
    expect(placarVisto(s.clientes[1]!)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: [] });
    s.ana.enviar({ tipo: 'iniciar' });
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: [] });
    acabar(s, 1);
    s.ana.enviar({ tipo: 'nova-partida' });
    expect(s.ana.estado.fase).toBe('jogando');
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 1 Beto', historico: [] });
  });
});

describe('placar — quem entra ou volta recebe o placar', () => {
  it('quem entra no meio da partida, quem entra na espera e quem volta de uma queda veem o mesmo placar', () => {
    const s = salaIniciada();
    acabar(s, 0);
    outraPartida(s);
    acabar(s, 0);
    const tardio = new ClienteDeTeste(s.amb, 'Tardio').entrar(s.ana.codigo);
    expect(tardio.lugar).toBeNull();
    expect(placarVisto(tardio)).toEqual({ atual: 'Ana 2 x 0 Beto', historico: [] });
    const beto = s.clientes[1]!;
    beto.sair();
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 2 x 0 Beto', historico: [] });
    beto.reconectar();
    expect(placarVisto(beto)).toEqual({ atual: 'Ana 2 x 0 Beto', historico: [] });
    expect(beto.conn.todas('estado-sala').every((e) => e.placar !== undefined)).toBe(true);
  });

  it('quem volta com a conexão trocada (a antiga ainda aberta) também recebe', () => {
    const s = salaIniciada();
    acabar(s, 1);
    const beto = s.clientes[1]!;
    beto.reconectar();
    expect(placarVisto(beto)).toEqual({ atual: 'Ana 0 x 1 Beto', historico: [] });
  });
});

describe('placar — a formação decide o confronto', () => {
  it('trocar o adversário abre confronto novo em 1 x 0 e o anterior vai para o histórico, com o apelido de quem saiu', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    outraPartida(s);
    acabar(s, 0);
    // Ana tira o Beto da sala e a Cida ocupa o lugar dele
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
    const cida = new ClienteDeTeste(s.amb, 'Cida').entrar(s.ana.codigo);
    expect(cida.lugar).toBe(1);
    expect(placarVisto(cida)).toEqual({ atual: 'Ana 2 x 0 Beto', historico: [] });
    s.ana.enviar({ tipo: 'iniciar' });
    s.clientes[1] = cida;
    acabar(s, 1);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 0 x 1 Cida', historico: ['Ana 2 x 0 Beto'] });
    expect(placarVisto(cida)).toEqual(placarVisto(s.ana));
  });

  it('quem saiu da sala e deixou o lugar continua no histórico pelo apelido', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    s.clientes[1]!.sair();
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    expect(s.ana.estado.lugares[1]!.nome).toBeNull();
    const cida = new ClienteDeTeste(s.amb, 'Cida').entrar(s.ana.codigo);
    s.ana.enviar({ tipo: 'iniciar' });
    s.clientes[1] = cida;
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 0 Cida', historico: ['Ana 1 x 0 Beto'] });
  });

  it('dois Betos diferentes (mesmo apelido, entradas diferentes) são pessoas diferentes', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
    const outroBeto = new ClienteDeTeste(s.amb, 'Beto').entrar(s.ana.codigo);
    s.ana.enviar({ tipo: 'iniciar' });
    s.clientes[1] = outroBeto;
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: ['Ana 1 x 0 Beto'] });
  });

  it('quem perdeu o lugar por ficar fora e volta com o token continua sendo a mesma pessoa: o confronto segue', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    const beto = s.clientes[1]!;
    beto.sair();
    s.amb.avancar(s.amb.config.lugarEsperaMs + 1_000);
    expect(s.ana.estado.lugares[1]!.nome).toBeNull();
    const tokenVelho = beto.token;
    beto.reconectar();
    expect(beto.lugar).toBe(1);
    expect(beto.token, 'entrada nova, com token novo').not.toBe(tokenVelho);
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 1);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 1 Beto', historico: [] });
  });

  it('quem some no fim da partida e volta depois de o anfitrião voltar à sala também segue o confronto', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    const beto = s.clientes[1]!;
    beto.sair();
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    beto.reconectar();
    expect(beto.lugar).toBe(1);
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 2 x 0 Beto', historico: [] });
  });

  it('quem virou espectador, caiu (espectador não segura lugar) e voltou com o token continua a mesma pessoa', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    const beto = s.clientes[1]!;
    beto.enviar({ tipo: 'escolher-lugar', lugar: null });
    beto.sair(); // espectador que cai some da sala na hora
    expect(s.ana.estado.espectadores).toBe(0);
    beto.reconectar();
    expect(beto.lugar).toBe(1); // na espera, entra no primeiro lugar livre
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 2 x 0 Beto', historico: [] });
  });

  it('quem entrou como espectador e depois sentou guarda a identidade ao sair e voltar', () => {
    const s = salaIniciada('1x1');
    const cida = new ClienteDeTeste(s.amb, 'Cida').entrar(s.ana.codigo);
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
    cida.enviar({ tipo: 'escolher-lugar', lugar: 1 });
    s.ana.enviar({ tipo: 'iniciar' });
    s.clientes[1] = cida;
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 0 Cida', historico: ['Ana 1 x 0 Beto'] });
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    cida.sair();
    s.amb.avancar(s.amb.config.lugarEsperaMs + 1_000);
    cida.reconectar();
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 2 x 0 Cida', historico: ['Ana 1 x 0 Beto'] });
  });

  it('a identidade devolvida é de uma entrada só: com o mesmo token velho uma segunda aba é outra pessoa', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    const beto = s.clientes[1]!;
    beto.sair();
    s.amb.avancar(s.amb.config.lugarEsperaMs + 1_000);
    const tokenVelho = beto.token;
    beto.reconectar(); // a primeira aba volta no lugar 1 e leva a identidade
    const segundaAba = new ClienteDeTeste(s.amb, 'Beto').entrar(s.ana.codigo, tokenVelho);
    expect(segundaAba.lugar).toBeNull();
    // a primeira aba sai da sala, e a segunda ocupa o lugar: é a mesma pessoa só para quem tem o token que a sala devolveu
    s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
    segundaAba.enviar({ tipo: 'escolher-lugar', lugar: 1 });
    s.ana.enviar({ tipo: 'iniciar' });
    s.clientes[1] = segundaAba;
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: ['Ana 1 x 0 Beto'] });
  });

  it.each([63, 64])('a sala lembra as últimas 64 saídas: com %i saídas depois da do Beto (63 ainda o lembra, 64 já não)', (outros) => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    const beto = s.clientes[1]!;
    beto.enviar({ tipo: 'escolher-lugar', lugar: null });
    beto.sair(); // espectador que cai some na hora e fica lembrado
    for (let i = 0; i < outros; i++) {
      const passante = new ClienteDeTeste(s.amb, `P${i}`).entrar(s.ana.codigo);
      if (passante.lugar !== null) passante.enviar({ tipo: 'escolher-lugar', lugar: null });
      passante.sair();
    }
    beto.reconectar();
    expect(beto.lugar).toBe(1);
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    const lembrou = outros === 63;
    expect(placarVisto(s.ana)).toEqual(lembrou ? { atual: 'Ana 2 x 0 Beto', historico: [] } : { atual: 'Ana 1 x 0 Beto', historico: ['Ana 1 x 0 Beto'] });
  });

  it('quem foi expulso não leva a identidade de volta: se o link o traz de novo, é outra pessoa para o placar', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    const beto = s.clientes[1]!;
    s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
    beto.reconectar(); // com o token velho: recusado
    expect(beto.ultimoErro?.codigo).toBe('token-invalido');
    beto.conn = new ConexaoFalsa('Beto-pelo-link'); // o cliente esquece o token e entra de novo pelo link
    beto.entrar(s.ana.codigo);
    expect(beto.lugar).toBe(1);
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: ['Ana 1 x 0 Beto'] });
  });

  it('o token de um expulso que a sala já esqueceu (passou das 64 expulsões lembradas) vale como entrada nova: sem a identidade de antes', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    const beto = s.clientes[1]!;
    s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
    for (let i = 0; i < 64; i++) {
      const passante = new ClienteDeTeste(s.amb, `P${i}`).entrar(s.ana.codigo);
      expect(passante.lugar).toBe(1);
      s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
    }
    beto.reconectar(); // o token dele já saiu da lista de revogados: a sala o trata como desconhecido
    expect(beto.lugar).toBe(1);
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: ['Ana 1 x 0 Beto'] });
  });

  it('mudar o modo na espera abre confronto novo: 1x1 → 2x1 → 2x2 → 1x1', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    const [, beto] = s.clientes as [ClienteDeTeste, ClienteDeTeste];
    const cida = new ClienteDeTeste(s.amb, 'Cida').entrar(s.ana.codigo);
    const davi = new ClienteDeTeste(s.amb, 'Davi').entrar(s.ana.codigo);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'configurar-sala', modo: '2x1' });
    cida.enviar({ tipo: 'escolher-lugar', lugar: 2 });
    s.clientes.push(cida);
    s.ana.enviar({ tipo: 'iniciar' });
    expect(s.ana.erros).toHaveLength(0);
    acabar(s, 1);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana e Cida 0 x 1 Beto', historico: ['Ana 1 x 0 Beto'] });
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'configurar-sala', modo: '2x2' });
    davi.enviar({ tipo: 'escolher-lugar', lugar: 3 });
    s.clientes.push(davi);
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana e Cida 1 x 0 Beto e Davi', historico: ['Ana e Cida 0 x 1 Beto', 'Ana 1 x 0 Beto'] });
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'configurar-sala', modo: '1x1' });
    expect(cida.lugar).toBeNull(); // virou espectadora
    expect(davi.lugar).toBeNull();
    s.clientes.length = 0;
    s.clientes.push(s.ana, beto);
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 1 x 0 Beto', historico: ['Ana e Cida 1 x 0 Beto e Davi', 'Ana e Cida 0 x 1 Beto', 'Ana 1 x 0 Beto'] });
  });
});

describe('placar — 2x1 e 2x2', () => {
  it('2x1: a dupla Ana e Cida contra o Beto soma; a dupla vem na ordem dos lugares', () => {
    const s = salaIniciada('2x1');
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana e Cida 1 x 0 Beto', historico: [] });
    outraPartida(s);
    acabar(s, 1);
    outraPartida(s);
    acabar(s, 0);
    expect(placarVisto(s.clientes[2]!)).toEqual({ atual: 'Ana e Cida 2 x 1 Beto', historico: [] });
  });

  it('2x2: soma com a mesma formação; trocar um jogador abre confronto novo e a formação nova também soma', () => {
    const s = salaIniciada('2x2');
    acabar(s, 1);
    outraPartida(s);
    acabar(s, 1);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana e Cida 0 x 2 Beto e Davi', historico: [] });
    // o Davi deixa o lugar 3 para a Eva
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'expulsar', lugar: 3 });
    const eva = new ClienteDeTeste(s.amb, 'Eva').entrar(s.ana.codigo);
    expect(eva.lugar).toBe(3);
    s.clientes[3] = eva;
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana e Cida 1 x 0 Beto e Eva', historico: ['Ana e Cida 0 x 2 Beto e Davi'] });
    outraPartida(s);
    acabar(s, 1);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana e Cida 1 x 1 Beto e Eva', historico: ['Ana e Cida 0 x 2 Beto e Davi'] });
  });

  it('2x2: quem troca de lugar dentro da mesma equipe continua no mesmo confronto (a ordem dentro do lado não importa)', () => {
    const s = salaIniciada('2x2');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    const [, beto, cida, davi] = s.clientes as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    // Beto (1) e Davi (3) são da equipe 1: cada um sai do lugar e entra no do outro
    davi.enviar({ tipo: 'escolher-lugar', lugar: null });
    beto.enviar({ tipo: 'escolher-lugar', lugar: 3 });
    davi.enviar({ tipo: 'escolher-lugar', lugar: 1 });
    expect([beto, davi, cida].map(lugarDe)).toEqual([3, 1, 2]);
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 1);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana e Cida 1 x 1 Beto e Davi', historico: [] });
  });

  it('2x2: trocar de equipe (Cida e Beto trocam de lugar) muda a formação: confronto novo', () => {
    const s = salaIniciada('2x2');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    const [, beto, cida] = s.clientes as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    cida.enviar({ tipo: 'escolher-lugar', lugar: null });
    beto.enviar({ tipo: 'escolher-lugar', lugar: 2 });
    cida.enviar({ tipo: 'escolher-lugar', lugar: 1 });
    s.ana.enviar({ tipo: 'iniciar' });
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana e Beto 1 x 0 Cida e Davi', historico: ['Ana e Cida 1 x 0 Beto e Davi'] });
  });
});

describe('placar — lados invertidos espelham (a equipe vem da partida, não do lugar)', () => {
  it('as mesmas pessoas com as equipes trocadas são o mesmo confronto: a vitória segue a pessoa', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0); // Ana, equipe 0
    s.controle.inverter = true;
    outraPartida(s);
    acabar(s, 1); // agora a equipe 1 é a Ana: Ana vence de novo
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 2 x 0 Beto', historico: [] });
    outraPartida(s);
    acabar(s, 0); // equipe 0 é o Beto
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 2 x 1 Beto', historico: [] });
    s.controle.inverter = false;
    outraPartida(s);
    acabar(s, 1);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 2 x 2 Beto', historico: [] });
  });

  it('em duplas invertidas também: Ana e Cida contra Beto e Davi, com as equipes trocadas, seguem o mesmo confronto', () => {
    const s = salaIniciada('2x2');
    acabar(s, 0); // equipe 0 = Ana e Cida
    s.controle.inverter = true;
    outraPartida(s);
    acabar(s, 0); // equipe 0 = Beto e Davi
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana e Cida 1 x 1 Beto e Davi', historico: [] });
    s.controle.inverter = false;
    outraPartida(s);
    acabar(s, 0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana e Cida 2 x 1 Beto e Davi', historico: [] });
  });
});

describe('placar — limite do histórico', () => {
  it('guarda 10 confrontos ao todo (o atual e 9 anteriores); o mais antigo sai primeiro', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0); // confronto 1: Ana e Beto
    for (let i = 1; i <= 11; i++) {
      s.ana.enviar({ tipo: 'voltar-ao-lobby' });
      s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
      const novo = new ClienteDeTeste(s.amb, `C${i}`).entrar(s.ana.codigo);
      s.ana.enviar({ tipo: 'iniciar' });
      s.clientes[1] = novo;
      acabar(s, 0);
    }
    expect(s.ana.erros).toHaveLength(0);
    const p = s.ana.estado.placar!;
    expect(p.atual?.lados[1].nomes).toEqual(['C11']);
    expect(p.historico).toHaveLength(LIMITES_PROTOCOLO.confrontosNoPlacar - 1);
    expect(p.historico.map((c) => c.lados[1].nomes[0])).toEqual(['C10', 'C9', 'C8', 'C7', 'C6', 'C5', 'C4', 'C3', 'C2']);
    expect(s.clientes[1]!.estado.placar).toEqual(p);
    expect(validarMensagemDaSala(s.ana.estado).ok).toBe(true);
  });

  it('com 10 confrontos exatos nada se perde', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    for (let i = 1; i <= 9; i++) {
      s.ana.enviar({ tipo: 'voltar-ao-lobby' });
      s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
      const novo = new ClienteDeTeste(s.amb, `C${i}`).entrar(s.ana.codigo);
      s.ana.enviar({ tipo: 'iniciar' });
      s.clientes[1] = novo;
      acabar(s, 0);
    }
    const p = s.ana.estado.placar!;
    expect(p.historico).toHaveLength(9);
    expect(p.historico.at(-1)!.lados[1].nomes).toEqual(['Beto']);
  });
});

describe('placar — entrada das regras fora do normal', () => {
  it('uma partida que acaba sem vencedor (fase fim, vencedor null) não conta', () => {
    const regras: MotorDeRegras = { novaPartida, aplicarTacada: (p) => ({ ...fim(p, 0), partida: { ...fim(p, 0).partida, vencedor: null } }) };
    const s = salaIniciada('1x1', undefined, regras);
    const v = s.ana.visao!;
    const final = fim(v.partida, 0).partida;
    s.ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: { ...final, vencedor: null }, mesa: v.mesa });
    expect(s.ana.erros).toHaveLength(0);
    expect(s.ana.estado.vez).toBeNull();
    expect(s.ana.estado.placar).toEqual({ atual: null, historico: [] });
  });

  it('equipes impossíveis (as regras nunca as dão) não travam a tacada: o placar fica como estava e o fato vai para o log', () => {
    const duasNoMesmoLado: MotorDeRegras = {
      novaPartida(config, jogadores, rng) {
        const base = novaPartida(config, jogadores, rng);
        return { ...base, partida: { ...base.partida, jogadores: base.partida.jogadores.map((j) => ({ ...j, equipe: 0 })) } };
      },
      aplicarTacada: (p) => fim(p, 0),
    };
    const s = salaIniciada('1x1', undefined, duasNoMesmoLado);
    const v = s.ana.visao!;
    s.ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim(v.partida, 0).partida, mesa: v.mesa });
    expect(s.ana.erros).toHaveLength(0);
    expect(s.ana.estado.vez).toBeNull();
    expect(s.ana.estado.placar).toEqual({ atual: null, historico: [] });
    expect(s.amb.logs.some((l) => l.startsWith('placar-falhou '))).toBe(true);
  });

  it('um jogador da partida sem dono na sala entra pelo apelido que a partida lhe deu', () => {
    const comFantasma: MotorDeRegras = {
      novaPartida(config, jogadores, rng) {
        const base = novaPartida(config, jogadores, rng);
        const fantasma: Jogador = { id: 'lugar-3', nome: 'Fantasma', equipe: 1 };
        return { ...base, partida: { ...base.partida, jogadores: [base.partida.jogadores[0]!, fantasma] } };
      },
      aplicarTacada: (p) => fim(p, 1),
    };
    const s = salaIniciada('1x1', undefined, comFantasma);
    const v = s.ana.visao!;
    s.ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim(v.partida, 1).partida, mesa: v.mesa });
    expect(s.ana.erros).toHaveLength(0);
    expect(placarVisto(s.ana)).toEqual({ atual: 'Ana 0 x 1 Fantasma', historico: [] });
  });
});

describe('placar — log', () => {
  it('cada partida contada vai para o log `placar`, só com código da sala e apelidos: nada de IP nem token', () => {
    const s = salaIniciada('2x1');
    acabar(s, 0);
    outraPartida(s);
    acabar(s, 1);
    const linhas = s.amb.logs.filter((l) => l.startsWith('placar '));
    expect(linhas).toHaveLength(2);
    expect(JSON.parse(linhas[0]!.slice('placar '.length))).toEqual({
      sala: s.ana.codigo,
      modalidade: 'par-ou-impar',
      venceu: 'Ana e Cida',
      ladoA: 'Ana e Cida',
      ladoB: 'Beto',
      vitoriasA: 1,
      vitoriasB: 0,
      novoConfronto: true,
      confrontos: 1,
    });
    expect(JSON.parse(linhas[1]!.slice('placar '.length))).toMatchObject({ venceu: 'Beto', vitoriasA: 1, vitoriasB: 1, novoConfronto: false, confrontos: 1 });
    const tudo = s.amb.logs.join('\n');
    expect(tudo).not.toContain('198.51.100.1');
    for (const c of s.clientes) expect(tudo).not.toContain(c.token);
    expect(tudo).not.toContain('entrada-');
  });

  it('o log marca o confronto novo e quantos confrontos a sala guarda', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    s.ana.enviar({ tipo: 'voltar-ao-lobby' });
    s.ana.enviar({ tipo: 'expulsar', lugar: 1 });
    const cida = new ClienteDeTeste(s.amb, 'Cida').entrar(s.ana.codigo);
    s.ana.enviar({ tipo: 'iniciar' });
    s.clientes[1] = cida;
    acabar(s, 1);
    const ultima = s.amb.logs.filter((l) => l.startsWith('placar ')).at(-1)!;
    expect(JSON.parse(ultima.slice('placar '.length))).toMatchObject({ ladoB: 'Cida', vitoriasA: 0, vitoriasB: 1, novoConfronto: true, confrontos: 2 });
  });
});

describe('placar — fica na sala, em memória', () => {
  it('a identidade das entradas não vai para o fio: o estado-sala só tem apelidos e vitórias', () => {
    const s = salaIniciada('1x1');
    acabar(s, 0);
    const json = JSON.stringify(s.ana.estado.placar);
    expect(json).not.toContain('entrada');
    expect(Object.keys(s.ana.estado.placar!.atual!.lados[0]).sort()).toEqual(['nomes', 'vitorias']);
  });

  it('salas diferentes têm placares diferentes', () => {
    const a = salaIniciada('1x1');
    const b = new ClienteDeTeste(a.amb, 'Ana').criar('1x1');
    acabar(a, 0);
    expect(b.estado.placar).toEqual({ atual: null, historico: [] });
  });
});
