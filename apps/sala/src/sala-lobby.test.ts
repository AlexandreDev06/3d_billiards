import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { aplicarTacada, jogadoresDaProxima, novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import type { ModoSala } from '@sinuca/protocolo';
import { ClienteDeTeste, TACADA_MEDIA, criarAmbiente, salaIniciada } from './para-testes';

const fimDeJogo = (p: EstadoPartida): ResultadoRegras => ({
  partida: { ...p, fase: 'fim', vez: 1, vencedor: 0, naMesa: p.naMesa.filter((b) => b !== 1) },
  consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1, vencedor: 0, texto: 'fim' },
});

/** Sala iniciada cujas regras acabam a partida na primeira tacada; devolve com ela já terminada. */
function terminada(modo: ModoSala = '1x1', relogio: { tempoS: 15 | 30 | 45 | 60 | null } = { tempoS: 30 }) {
  const amb = criarAmbiente({}, { regras: { novaPartida, aplicarTacada: (p) => fimDeJogo(p) } });
  const clientes = salaIniciada(amb, modo, relogio);
  const ana = clientes[0]!;
  const v = ana.visao!;
  const fim = fimDeJogo(v.partida).partida;
  ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim, mesa: v.mesa });
  expect(ana.erros).toHaveLength(0);
  expect(ana.estado.vez).toBeNull();
  return { amb, clientes, ana, beto: clientes[1]!, fim };
}

const ids = (p: EstadoPartida): string[] => p.jogadores.map((j) => j.id);
const nomesDosLugares = (c: ClienteDeTeste): (string | null)[] => c.estado.lugares.map((l) => l.nome);

describe('linha de previsão — configuração da sala, igual para todos', () => {
  it('sem `linha` no criar-sala a sala manda a linha desligada, completa', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    for (const c of [ana, beto]) expect(c.estado.linha).toEqual({ previsao: false, bolaAtingida: false });
  });

  it('com `linha`, todos veem a mesma: anfitrião, quem entra, espectador, e ela segue na partida e depois de cada tacada', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: null }, { previsao: true, bolaAtingida: true }) as [ClienteDeTeste, ClienteDeTeste];
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    const ligada = { previsao: true, bolaAtingida: true };
    for (const c of [ana, beto, esp]) expect(c.estado.linha).toEqual(ligada);
    ana.jogar();
    expect(ana.erros).toHaveLength(0);
    for (const c of [ana, beto, esp]) expect(c.estado.linha).toEqual(ligada);
    for (const c of [ana, beto, esp]) for (const e of c.conn.todas('estado-sala')) expect(e.linha, 'todo estado-sala leva a linha').toEqual(ligada);
  });

  it('só a previsão: bolaAtingida fica desligada; bolaAtingida sem previsão não vale', () => {
    const amb = criarAmbiente();
    const a = new ClienteDeTeste(amb, 'A').criar('1x1', undefined, undefined, { previsao: true });
    expect(a.estado.linha).toEqual({ previsao: true, bolaAtingida: false });
    const b = new ClienteDeTeste(amb, 'B').criar('1x1', undefined, undefined, { previsao: false, bolaAtingida: true });
    expect(b.estado.linha).toEqual({ previsao: false, bolaAtingida: false });
  });

  it('fixa durante a partida: configurar-sala depois de iniciar é fase-errada e nada muda', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: null }, { previsao: true }) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar({ tipo: 'configurar-sala', linha: { previsao: false } });
    expect(ana.ultimoErro?.codigo).toBe('fase-errada');
    for (const c of [ana, beto]) expect(c.estado.linha).toEqual({ previsao: true, bolaAtingida: false });
  });
});

describe('voltar-ao-lobby', () => {
  it('só o anfitrião, só depois do fim', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    expect(ana.ultimoErro?.codigo).toBe('partida-em-andamento');
    beto.enviar({ tipo: 'voltar-ao-lobby' });
    expect(beto.ultimoErro?.codigo).toBe('nao-anfitriao');
    expect(ana.estado.fase).toBe('jogando');

    const t = terminada();
    t.beto.enviar({ tipo: 'voltar-ao-lobby' });
    expect(t.beto.ultimoErro?.codigo).toBe('nao-anfitriao');
    expect(t.ana.estado.fase).toBe('jogando');
  });

  it('na espera, antes de qualquer partida, é fase errada', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    expect(ana.ultimoErro?.codigo).toBe('fase-errada');
  });

  it('volta para a espera com os mesmos lugares; sem vez, sem prazo, seq zero e nenhum retrato novo', () => {
    const { ana, beto } = terminada();
    const esp = new ClienteDeTeste(ana.amb, 'Esp').entrar(ana.codigo);
    [ana, beto, esp].forEach((c) => c.conn.limpar());
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    for (const c of [ana, beto, esp]) {
      expect(c.estado).toMatchObject({ fase: 'espera', vez: null, seq: 0, prazoMs: null, espectadores: 1 });
      expect(nomesDosLugares(c)).toEqual(['Ana', 'Beto', null, null]);
      expect(c.estado.lugares.map((l) => l.conectado)).toEqual([true, true, false, false]);
      expect(c.conn.todas('retrato')).toHaveLength(0);
      expect(c.erros).toHaveLength(0);
    }
  });

  it('na espera a tacada velha é recusada sem retrato, e o lugar pode ser trocado', () => {
    const { ana, beto } = terminada();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    beto.conn.limpar();
    beto.enviar({ tipo: 'tacada', seq: 1, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: ana.visao!.partida, mesa: ana.visao!.mesa });
    expect(beto.ultimoErro?.codigo).toBe('fase-errada');
    expect(beto.conn.todas('retrato')).toHaveLength(0);
    beto.enviar({ tipo: 'escolher-lugar', lugar: null });
    expect(beto.estado.lugares[1]!.nome).toBeNull();
    expect(beto.estado.espectadores).toBe(1);
  });

  it('quem saiu da sala durante a partida perde o lugar na hora; quem ficou, não; espectador segue espectador', () => {
    const { amb, clientes, ana } = terminada('2x2');
    const [, beto, cida, davi] = clientes as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    cida.sair();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', null, 'Davi']);
    expect(ana.estado.espectadores).toBe(1);
    expect(esp.estado.fase).toBe('espera');
    expect([beto, davi].every((c) => c.estado.fase === 'espera')).toBe(true);
    // quem chega agora ocupa o lugar que sobrou, e a Cida, de volta com o token velho, entra como nova
    const novo = new ClienteDeTeste(amb, 'Novo').entrar(ana.codigo);
    expect(novo.lugar).toBe(2);
    cida.reconectar();
    expect(cida.lugar).toBeNull();
    expect(cida.estado.fase).toBe('espera');
  });

  it('o anfitrião caído continua com o lugar 0 e o título, e pode voltar e configurar', () => {
    const { amb, ana, beto } = terminada();
    ana.sair();
    amb.avancar(amb.config.lugarEsperaMs * 3);
    ana.reconectar();
    expect(ana.lugar).toBe(0);
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    expect(ana.ultimoErro).toBeUndefined();
    expect(beto.estado.fase).toBe('espera');
    expect(beto.estado.lugares[0]).toMatchObject({ nome: 'Ana', conectado: true, anfitriao: true });
  });

  it('nova-partida segue valendo: recomeça direto, sem passar pela espera', () => {
    const { ana, beto } = terminada();
    ana.enviar({ tipo: 'nova-partida' });
    expect(ana.erros).toHaveLength(0);
    for (const c of [ana, beto]) expect(c.estado.fase).toBe('jogando');
  });
});

describe('configurar-sala', () => {
  it('só o anfitrião, só na espera', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    beto.enviar({ tipo: 'configurar-sala', linha: { previsao: true } });
    expect(beto.ultimoErro?.codigo).toBe('nao-anfitriao');
    expect(ana.estado.linha?.previsao).toBe(false);
    ana.enviar({ tipo: 'iniciar' });
    ana.enviar({ tipo: 'configurar-sala', modo: '2x2' });
    expect(ana.ultimoErro?.codigo).toBe('fase-errada');
    expect(ana.estado.modo).toBe('1x1');
  });

  it('antes da primeira partida: muda relógio, linha e modo, e todos recebem o estado novo', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    [ana, beto, esp].forEach((c) => c.conn.limpar());
    ana.enviar({ tipo: 'configurar-sala', modo: '2x2', relogio: { tempoS: 45 }, linha: { previsao: true, bolaAtingida: true } });
    for (const c of [ana, beto, esp]) {
      expect(c.conn.todas('estado-sala')).toHaveLength(1);
      expect(c.estado).toMatchObject({ modo: '2x2', relogio: { tempoS: 45, aoEsgotar: 'perde-a-vez' }, linha: { previsao: true, bolaAtingida: true } });
    }
  });

  it('parcial: só o que vem muda; o resto fica como estava', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', undefined, { tempoS: 60 }, { previsao: true, bolaAtingida: true });
    ana.enviar({ tipo: 'configurar-sala', linha: { bolaAtingida: false } });
    expect(ana.estado).toMatchObject({ modo: '1x1', relogio: { tempoS: 60 }, linha: { previsao: true, bolaAtingida: false } });
    ana.enviar({ tipo: 'configurar-sala', relogio: { tempoS: null } });
    expect(ana.estado).toMatchObject({ relogio: { tempoS: null }, linha: { previsao: true, bolaAtingida: false } });
    ana.enviar({ tipo: 'configurar-sala', linha: { previsao: false } });
    expect(ana.estado.linha).toEqual({ previsao: false, bolaAtingida: false });
    ana.conn.limpar();
    ana.enviar({ tipo: 'configurar-sala' });
    expect(ana.conn.todas('estado-sala')).toHaveLength(1); // confirmação, sem mudança
    expect(ana.erros).toHaveLength(0);
  });

  it('aoEsgotar que não existe é recusado com regras-invalidas e nada muda', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', undefined, { tempoS: 30 });
    ana.conn.limpar();
    ana.enviar({ tipo: 'configurar-sala', modo: '2x2', relogio: { aoEsgotar: 'falta' }, linha: { previsao: true } });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'regras-invalidas' });
    expect(ana.ultimoErro?.mensagem).toContain('falta');
    expect(ana.conn.todas('estado-sala')).toHaveLength(0);
    ana.enviar({ tipo: 'configurar-sala' });
    expect(ana.estado).toMatchObject({ modo: '1x1', relogio: { tempoS: 30 }, linha: { previsao: false } });
  });

  it('do 1x1 para o 2x2: o 2x2 só inicia com os quatro lugares cheios', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    ana.enviar({ tipo: 'configurar-sala', modo: '2x2' });
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.ultimoErro?.codigo).toBe('lugares-incompletos');
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    const davi = new ClienteDeTeste(amb, 'Davi').entrar(ana.codigo);
    expect([cida.lugar, davi.lugar]).toEqual([2, 3]);
    ana.enviar({ tipo: 'iniciar' });
    expect(beto.conn.ultima('retrato')!.partida.jogadores).toHaveLength(4);
  });

  it('do 2x2 para o 1x1: quem estava nos lugares 2 e 3 vira espectador e o jogo inicia com dois', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x2');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    const davi = new ClienteDeTeste(amb, 'Davi').entrar(ana.codigo);
    const codigo = ana.codigo;
    const tokenDaCida = cida.token;
    [ana, beto, cida, davi].forEach((c) => c.conn.limpar());
    ana.enviar({ tipo: 'configurar-sala', modo: '1x1' });
    // quem foi deslocado fica sabendo do lugar novo pelas boas-vindas (mesmo token), antes do estado; os outros não recebem nada além do estado
    for (const c of [cida, davi]) {
      expect(c.conn.todas('boas-vindas')).toEqual([expect.objectContaining({ lugar: null, anfitriao: false, codigo })]);
      expect(c.conn.recebidas.map((m) => m.tipo)).toEqual(['boas-vindas', 'estado-sala']);
    }
    expect(cida.conn.todas('boas-vindas')[0]!.token).toBe(tokenDaCida);
    for (const c of [ana, beto]) expect(c.conn.recebidas.map((m) => m.tipo)).toEqual(['estado-sala']);
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', null, null]);
    expect(ana.estado.espectadores).toBe(2);
    cida.enviar({ tipo: 'escolher-lugar', lugar: 2 });
    expect(cida.ultimoErro?.codigo).toBe('lugar-invalido');
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.erros).toHaveLength(0);
    expect(beto.conn.ultima('retrato')!.partida.jogadores).toHaveLength(2);
    expect(davi.estado.espectadores).toBe(2);
  });

  it('o prazo da vez usa o relógio novo na partida seguinte', () => {
    const { ana, beto } = terminada('1x1', { tempoS: 30 });
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 45 } });
    expect(ana.estado.prazoMs).toBeNull();
    ana.enviar({ tipo: 'iniciar' });
    for (const c of [ana, beto]) expect(c.estado).toMatchObject({ relogio: { tempoS: 45 }, prazoMs: 45_000 });
    ana.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 15 } });
    expect(ana.ultimoErro?.codigo).toBe('fase-errada');
  });
});

describe('o ciclo: jogando → fim → espera → configurar → iniciar', () => {
  it('a nova partida sai na ordem de jogadoresDaProxima e com a configuração nova', () => {
    const { ana, beto, fim } = terminada();
    const ordem = jogadoresDaProxima(fim);
    expect(ids(fim)).toEqual(['lugar-0', 'lugar-1']);
    expect(ordem.map((j) => j.id)).toEqual(['lugar-1', 'lugar-0']); // quem saiu (o Beto) é o primeiro

    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 60 }, linha: { previsao: true, bolaAtingida: true } });
    [ana, beto].forEach((c) => c.conn.limpar());
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.erros).toHaveLength(0);
    for (const c of [ana, beto]) {
      const r = c.conn.ultima('retrato')!;
      expect(r).toMatchObject({ motivo: 'inicio', seq: 0, mesa: null, ultima: null });
      expect(ids(r.partida)).toEqual(ordem.map((j) => j.id));
      expect(r.partida.jogadores.map((j) => j.nome)).toEqual(['Beto', 'Ana']);
      expect(r.partida.fase).toBe('saida');
      expect(c.estado).toMatchObject({ fase: 'jogando', seq: 0, vez: 1, prazoMs: 60_000, linha: { previsao: true, bolaAtingida: true } });
    }
  });

  it('no 2x2 a ordem das regras também vale (A1, B1, A2, B2 a partir de quem saiu)', () => {
    const { ana, clientes, fim } = terminada('2x2');
    const ordem = jogadoresDaProxima(fim).map((j) => j.id);
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'iniciar' });
    expect(ids(clientes[2]!.conn.ultima('retrato')!.partida)).toEqual(ordem);
    expect(ordem[0]).toBe('lugar-1');
  });

  it('quem trocou de lugar na espera joga no lugar novo, com o nome de quem está lá', () => {
    const { ana, beto } = terminada();
    const cida = new ClienteDeTeste(ana.amb, 'Cida').entrar(ana.codigo);
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    beto.enviar({ tipo: 'escolher-lugar', lugar: null });
    cida.enviar({ tipo: 'escolher-lugar', lugar: 1 });
    ana.enviar({ tipo: 'iniciar' });
    expect(cida.conn.ultima('retrato')!.partida.jogadores.map((j) => `${j.id}:${j.nome}`)).toEqual(['lugar-1:Cida', 'lugar-0:Ana']);
  });

  it('mudar o modo na espera descarta a ordem guardada: valem os lugares', () => {
    const { ana, clientes } = terminada();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'configurar-sala', modo: '2x2' });
    const cida = new ClienteDeTeste(ana.amb, 'Cida').entrar(ana.codigo);
    new ClienteDeTeste(ana.amb, 'Davi').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    expect(ids(cida.conn.ultima('retrato')!.partida)).toEqual(['lugar-0', 'lugar-1', 'lugar-2', 'lugar-3']);
    expect(clientes).toHaveLength(2);
  });

  it('ir ao 2x2 e voltar ao 1x1 na espera também descarta a ordem guardada', () => {
    const { ana, beto } = terminada();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'configurar-sala', modo: '2x2' });
    ana.enviar({ tipo: 'configurar-sala', modo: '1x1' });
    ana.enviar({ tipo: 'iniciar' });
    expect(ids(beto.conn.ultima('retrato')!.partida)).toEqual(['lugar-0', 'lugar-1']);
  });

  it('a ordem guardada vale uma vez só: depois do próximo fim ela é a da partida nova', () => {
    const { ana, beto } = terminada();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'iniciar' });
    const v = beto.visao!;
    const quem = [ana, beto][ana.estado.vez!]!;
    const dois = fimDeJogo(v.partida).partida;
    quem.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: dois, mesa: v.mesa });
    expect(quem.erros).toHaveLength(0);
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'iniciar' });
    expect(ids(ana.conn.ultima('retrato')!.partida)).toEqual(jogadoresDaProxima(dois).map((j) => j.id));
  });

  it('a partida nova joga de verdade: tacada com seq 0 é aceita e a velha é recusada', () => {
    const amb = criarAmbiente({}, { regras: { novaPartida, aplicarTacada: (p, e) => (p.fase === 'saida' && p.jogadores[0]!.id === 'lugar-0' ? fimDeJogo(p) : aplicarTacada(p, e)) } });
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fimDeJogo(v.partida).partida, mesa: v.mesa });
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'iniciar' });
    const quem = [ana, beto][ana.estado.vez!]!;
    quem.enviar({ ...quem.montarTacada(), seq: 3 });
    expect(quem.ultimoErro?.codigo).toBe('seq-errado');
    quem.enviar(quem.montarTacada());
    expect(quem.erros.filter((e) => e.codigo !== 'seq-errado')).toHaveLength(0);
    expect(ana.estado.seq).toBe(1);
  });
});

describe('reconexão no meio do ciclo', () => {
  it('voltou antes do lobby: recebe o retrato da partida terminada e depois a espera', () => {
    const { ana, beto } = terminada();
    beto.sair();
    beto.reconectar();
    expect(beto.conn.ultima('retrato')).toMatchObject({ motivo: 'entrada' });
    expect(beto.estado.fase).toBe('jogando');
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    expect(beto.estado).toMatchObject({ fase: 'espera', vez: null });
    expect(beto.lugar).toBe(1);
  });

  it('caiu na espera e voltou a tempo: mesmo lugar, estado de espera e nenhum retrato', () => {
    const { amb, ana, beto } = terminada();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    beto.sair();
    expect(ana.estado.lugares[1]).toMatchObject({ nome: 'Beto', conectado: false });
    amb.avancar(amb.config.lugarEsperaMs - 1_000);
    beto.reconectar();
    expect(beto.lugar).toBe(1);
    expect(beto.estado).toMatchObject({ fase: 'espera', vez: null, seq: 0 });
    expect(beto.conn.todas('retrato')).toHaveLength(0);
    expect(ana.estado.lugares[1]).toMatchObject({ nome: 'Beto', conectado: true });
  });

  it('caiu na espera e voltou depois de configurarem: vê a configuração nova e continua no lugar', () => {
    const { ana, beto } = terminada();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    beto.sair();
    ana.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 15 }, linha: { previsao: true } });
    beto.reconectar();
    expect(beto.lugar).toBe(1);
    expect(beto.estado).toMatchObject({ fase: 'espera', relogio: { tempoS: 15 }, linha: { previsao: true, bolaAtingida: false } });
  });

  it('caiu entre configurar e iniciar: iniciar espera ele; com ele de volta, o jogo começa na ordem das regras', () => {
    const { ana, beto, fim } = terminada();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'configurar-sala', linha: { previsao: true } });
    beto.sair();
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.ultimoErro?.codigo).toBe('lugares-incompletos');
    expect(ana.estado.fase).toBe('espera');
    beto.reconectar();
    ana.enviar({ tipo: 'iniciar' });
    expect(ids(beto.conn.ultima('retrato')!.partida)).toEqual(jogadoresDaProxima(fim).map((j) => j.id));
  });

  it('esperou demais na espera: o lugar é liberado e o token velho não o devolve', () => {
    const { amb, ana, beto } = terminada();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    beto.sair();
    amb.avancar(amb.config.lugarEsperaMs + 1_000);
    expect(nomesDosLugares(ana)).toEqual(['Ana', null, null, null]);
    beto.reconectar();
    expect(beto.lugar).toBe(1); // entra de novo no primeiro lugar livre
    expect(beto.estado.lugares[1]).toMatchObject({ nome: 'Beto', conectado: true });
  });

  it('o anfitrião cai e volta no meio da espera: continua anfitrião e consegue configurar e iniciar', () => {
    const { amb, ana, beto } = terminada();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.sair();
    amb.avancar(amb.config.lugarEsperaMs * 2);
    ana.reconectar();
    expect(ana.conn.ultima('boas-vindas')).toMatchObject({ lugar: 0, anfitriao: true });
    ana.enviar({ tipo: 'configurar-sala', linha: { previsao: true, bolaAtingida: true } });
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.erros).toHaveLength(0);
    expect(beto.estado).toMatchObject({ fase: 'jogando', linha: { previsao: true, bolaAtingida: true } });
  });
});
