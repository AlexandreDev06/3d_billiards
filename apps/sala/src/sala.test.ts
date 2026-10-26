import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { PROTOCOLO_VERSAO, type MsgTacada } from '@sinuca/protocolo';
import { PRESET_BOTECO, aplicarTacada, bolasDaCasa, novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { ClienteDeTeste, TACADA_FORTE, TACADA_MEDIA, criarAmbiente, lugarDoJogador, mesaDepoisDasConsequencias, salaIniciada } from './para-testes';

const nomes = (c: ClienteDeTeste) => c.estado.lugares.map((l) => l.nome);

describe('sala — entrada e lugares', () => {
  it('criar-sala dá boas-vindas ao anfitrião no lugar 0, com token, e o estado da sala', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    const bv = ana.conn.ultima('boas-vindas')!;
    expect(bv).toMatchObject({ versao: PROTOCOLO_VERSAO, lugar: 0, anfitriao: true });
    expect(bv.codigo).toMatch(/^[2-9A-HJ-KM-NP-Z]{5}$/);
    expect(bv.token.length).toBeGreaterThanOrEqual(16);
    expect(ana.conn.recebidas.map((m) => m.tipo)).toEqual(['boas-vindas', 'estado-sala']);
    expect(ana.estado).toMatchObject({ codigo: bv.codigo, modo: '1x1', preset: 'Boteco', fase: 'espera', seq: 0, vez: null, espectadores: 0 });
    expect(ana.estado.lugares).toHaveLength(4);
    expect(ana.estado.lugares[0]).toEqual({ lugar: 0, equipe: 0, nome: 'Ana', conectado: true, anfitriao: true, saldo: null, skin: 'classico' });
  });

  it('o segundo jogador pega o lugar 1 e os dois recebem o estado novo', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    expect(beto.conn.ultima('boas-vindas')).toMatchObject({ lugar: 1, anfitriao: false });
    expect(nomes(ana)).toEqual(['Ana', 'Beto', null, null]);
    expect(nomes(beto)).toEqual(['Ana', 'Beto', null, null]);
    expect(beto.estado.lugares[1]).toMatchObject({ equipe: 1, conectado: true, anfitriao: false });
  });

  it('no 1x1 o terceiro vira espectador; no 2x2 os quatro têm lugar, em equipes 0,1,0,1', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    expect(cida.lugar).toBeNull();
    expect(ana.estado.espectadores).toBe(1);

    const dupla = new ClienteDeTeste(amb, 'Zé').criar('2x2');
    const outros = ['Ju', 'Li', 'Mo'].map((n) => new ClienteDeTeste(amb, n).entrar(dupla.codigo));
    expect(outros.map((o) => o.lugar)).toEqual([1, 2, 3]);
    expect(dupla.estado.lugares.map((l) => l.equipe)).toEqual([0, 1, 0, 1]);
    expect(new ClienteDeTeste(amb, 'Extra').entrar(dupla.codigo).lugar).toBeNull();
  });

  it('limita os espectadores', () => {
    const amb = criarAmbiente({ maxEspectadores: 2 });
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    new ClienteDeTeste(amb, 'E1').entrar(ana.codigo);
    new ClienteDeTeste(amb, 'E2').entrar(ana.codigo);
    const e3 = new ClienteDeTeste(amb, 'E3').entrar(ana.codigo);
    expect(e3.ultimoErro?.codigo).toBe('sala-cheia');
    expect(e3.conn.ultima('boas-vindas')).toBeUndefined();
    expect(ana.estado.espectadores).toBe(2);
  });

  it('o nome é aparado e recusado se vazio ou longo demais', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, '  Ana  ').criar();
    expect(ana.estado.lugares[0]!.nome).toBe('Ana');
    for (const nome of ['   ', 'x'.repeat(25)]) {
      const c = new ClienteDeTeste(amb, nome).entrar(ana.codigo);
      expect(c.ultimoErro?.codigo, JSON.stringify(nome)).toBe('nome-invalido');
    }
  });

  it('escolher-lugar: livre ok; ocupado, fora do modo e sair do 0 como anfitrião não; null vira espectador', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x2');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);

    beto.enviar({ tipo: 'escolher-lugar', lugar: 3 });
    expect(nomes(ana)).toEqual(['Ana', null, 'Cida', 'Beto']);

    cida.enviar({ tipo: 'escolher-lugar', lugar: 3 });
    expect(cida.ultimoErro?.codigo).toBe('lugar-ocupado');
    cida.enviar({ tipo: 'escolher-lugar', lugar: 0 });
    expect(cida.ultimoErro?.codigo).toBe('lugar-ocupado');
    ana.enviar({ tipo: 'escolher-lugar', lugar: 1 });
    expect(ana.ultimoErro?.codigo).toBe('lugar-invalido');
    ana.enviar({ tipo: 'escolher-lugar', lugar: null });
    expect(ana.ultimoErro?.codigo).toBe('lugar-invalido');

    cida.enviar({ tipo: 'escolher-lugar', lugar: null });
    expect(nomes(ana)).toEqual(['Ana', null, null, 'Beto']);
    expect(ana.estado.espectadores).toBe(1);

    const am1 = new ClienteDeTeste(amb, 'Um').criar('1x1');
    const outro = new ClienteDeTeste(amb, 'Dois').entrar(am1.codigo);
    outro.enviar({ tipo: 'escolher-lugar', lugar: 2 });
    expect(outro.ultimoErro?.codigo).toBe('lugar-invalido');
  });

  it('virar espectador respeita o limite de espectadores', () => {
    const amb = criarAmbiente({ maxEspectadores: 1 });
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x2');
    const [beto] = ['Beto', 'Cida', 'Davi'].map((n) => new ClienteDeTeste(amb, n).entrar(ana.codigo));
    new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    expect(ana.estado.espectadores).toBe(1);
    beto!.enviar({ tipo: 'escolher-lugar', lugar: null });
    expect(beto!.ultimoErro?.codigo).toBe('sala-cheia');
    expect(ana.estado.lugares[1]!.nome).toBe('Beto');
    expect(ana.estado.espectadores).toBe(1);
  });

  it('escolher-lugar só vale na espera', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb);
    beto!.enviar({ tipo: 'escolher-lugar', lugar: null });
    expect(beto!.ultimoErro?.codigo).toBe('fase-errada');
    expect(ana!.estado.lugares[1]!.nome).toBe('Beto');
  });
});

describe('sala — início da partida', () => {
  it('só o anfitrião inicia, com os lugares do modo cheios e conectados', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.ultimoErro?.codigo).toBe('lugares-incompletos');

    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    beto.enviar({ tipo: 'iniciar' });
    expect(beto.ultimoErro?.codigo).toBe('nao-anfitriao');

    beto.sair();
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.ultimoErro?.codigo).toBe('lugares-incompletos');
    expect(ana.estado.fase).toBe('espera');
  });

  it('2x2 só inicia com os 4 lugares', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x2');
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.ultimoErro?.codigo).toBe('lugares-incompletos');
    new ClienteDeTeste(amb, 'Davi').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.estado.fase).toBe('jogando');
  });

  it('iniciar manda o retrato a todos (inclusive espectadores), com mesa nula, e a vez é do lugar 0', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    for (const c of [ana, beto, esp]) {
      const r = c.conn.ultima('retrato')!;
      expect(r).toMatchObject({ motivo: 'inicio', seq: 0, mesa: null, ultima: null });
      expect(r.partida.jogadores).toEqual([
        { id: 'lugar-0', nome: 'Ana', equipe: 0 },
        { id: 'lugar-1', nome: 'Beto', equipe: 1 },
      ]);
      expect(r.partida.fase).toBe('saida');
      expect(r.arrumacao).toHaveLength(bolasDaCasa(PRESET_BOTECO.regras).length);
      expect(Number.isInteger(r.semente)).toBe(true);
      expect(c.estado).toMatchObject({ fase: 'jogando', seq: 0, vez: 0 });
    }
    expect(ana.conn.ultima('retrato')!.semente).toBe(beto.conn.ultima('retrato')!.semente);
  });

  it('a semente da mesa vem do sorteio da sala (e a da arrumação também)', () => {
    const amb = criarAmbiente({}, { sortear: (max) => (max > 1000 ? 123_456 : 5) });
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.conn.ultima('retrato')!.semente).toBe(123_456);
  });

  it('salas diferentes sorteiam sementes diferentes', () => {
    const amb = criarAmbiente();
    const sementes = [1, 2, 3].map(() => {
      const [ana] = salaIniciada(amb) as [ClienteDeTeste];
      return ana.conn.ultima('retrato')!.semente;
    });
    expect(new Set(sementes).size).toBe(3);
  });

  it('a casa da partida é a que o anfitrião mandou', () => {
    const amb = criarAmbiente();
    const regras = { ...PRESET_BOTECO.regras, bolas: '2-15' as const, bolaFinal: 'ultima-do-grupo' as const };
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1', regras);
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.conn.ultima('retrato')!.partida.config).toMatchObject({ bolas: '2-15', bolaFinal: 'ultima-do-grupo' });
    expect(ana.conn.ultima('retrato')!.arrumacao).toHaveLength(bolasDaCasa(regras).length);
    expect(bolasDaCasa(regras)).not.toHaveLength(bolasDaCasa(PRESET_BOTECO.regras).length);
  });

  it('2x2: quatro jogadores nas equipes 0,1,0,1 e a vez começa no 0', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb, '2x2');
    const r = ana!.conn.ultima('retrato')!;
    expect(r.partida.jogadores.map((j) => j.equipe)).toEqual([0, 1, 0, 1]);
    expect(r.partida.jogadores.map((j) => j.id)).toEqual(['lugar-0', 'lugar-1', 'lugar-2', 'lugar-3']);
    expect(ana!.estado.vez).toBe(0);
  });

  it('iniciar de novo é fase errada, e não entra ninguém num lugar depois do início', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb);
    ana!.enviar({ tipo: 'iniciar' });
    expect(ana!.ultimoErro?.codigo).toBe('fase-errada');
    const tardio = new ClienteDeTeste(amb, 'Tardio').entrar(ana!.codigo);
    expect(tardio.lugar).toBeNull();
    expect(tardio.conn.ultima('retrato')).toMatchObject({ motivo: 'entrada' });
  });
});

/** Tacada barata e coerente: a gravação de teste da física (taco bate e tudo para), com regras e mesa feitas como o cliente faz. */
function tacadaFixa(c: ClienteDeTeste): MsgTacada {
  const v = c.visao!;
  const gravacao = gravacaoDeTeste();
  const r = aplicarTacada(v.partida, gravacao.eventos);
  return { tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao, partida: r.partida, mesa: mesaDepoisDasConsequencias(v.mesa, r.consequencias) };
}

const daVez = (clientes: ClienteDeTeste[]): ClienteDeTeste => clientes[clientes[0]!.estado.vez!]!;

describe('sala — tacada', () => {
  it('repetir uma tacada já aceita (seq atrasado) é recusado e nada se move', () => {
    const amb = criarAmbiente();
    const clientes = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const quem = daVez(clientes);
    const m = quem.jogar(TACADA_FORTE);
    const antes = clientes[1].conn.recebidas.length;
    quem.enviar(m);
    expect(['seq-errado', 'nao-e-sua-vez']).toContain(quem.ultimoErro?.codigo);
    clientes[0].enviar(m);
    expect(clientes[1].conn.recebidas.length).toBe(antes);
    expect(clientes[1].estado.seq).toBe(1);
  });

  it('o mesmo jogador, ainda com a vez, repetindo o seq antigo, leva seq-errado', () => {
    const amb = criarAmbiente({}, { regras: { novaPartida, aplicarTacada: (p, e) => ({ ...aplicarTacada(p, e), partida: { ...aplicarTacada(p, e).partida, vez: p.vez } }) } });
    const [ana] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const g = gravacaoDeTeste();
    const v = ana.visao!;
    const depois = aplicarTacada(v.partida, g.eventos);
    const m: MsgTacada = { tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: g, partida: { ...depois.partida, vez: v.partida.vez }, mesa: mesaDepoisDasConsequencias(v.mesa, depois.consequencias) };
    ana.enviar(m);
    expect(ana.erros).toHaveLength(0);
    expect(ana.estado).toMatchObject({ seq: 1, vez: 0 });
    ana.enviar(m);
    expect(ana.ultimoErro?.codigo).toBe('seq-errado');
    expect(ana.estado.seq).toBe(1);
  });

  it('aceita a tacada do jogador da vez e retransmite a todos, inclusive a quem tacou', () => {
    const amb = criarAmbiente();
    const clientes = salaIniciada(amb);
    const [ana, beto] = clientes as [ClienteDeTeste, ClienteDeTeste];
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    const antes = ana.visao!.partida;

    const m = ana.jogar(TACADA_FORTE);
    const esperado = aplicarTacada(antes, m.gravacao.eventos);

    for (const c of [ana, beto, esp]) {
      const r = c.conn.ultima('tacada-retransmitida')!;
      expect(r.seq).toBe(0);
      expect(r.lugar).toBe(0);
      expect(r.parametros).toEqual(TACADA_FORTE);
      expect(r.partida).toEqual(esperado.partida);
      expect(r.consequencias).toEqual(esperado.consequencias);
      expect(r.mesa).toEqual(m.mesa);
      expect(r.gravacao.quadros).toBe(m.gravacao.quadros);
      expect(r.gravacao.eventos).toEqual(m.gravacao.eventos);
      expect(c.estado.seq).toBe(1);
      expect(c.estado.vez).toBe(lugarDoJogador(esperado.partida, esperado.partida.vez));
    }
  });

  it('a sala usa as consequências das regras dela, não as do cliente (o cliente nem as manda)', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const m = ana.montarTacada(TACADA_FORTE);
    expect(Object.keys(m)).not.toContain('consequencias');
    ana.enviar(m);
    expect(beto.conn.ultima('tacada-retransmitida')!.consequencias.texto.length).toBeGreaterThan(0);
  });

  it('três tacadas seguidas, cada uma do jogador da vez, com seq 0, 1, 2', () => {
    const amb = criarAmbiente();
    const clientes = salaIniciada(amb);
    const dosQueTacaram: number[] = [];
    for (let i = 0; i < 3; i++) {
      const quem = daVez(clientes);
      dosQueTacaram.push(quem.lugar!);
      quem.jogar(i === 0 ? TACADA_FORTE : TACADA_MEDIA, 20 + i);
      expect(quem.erros).toHaveLength(0);
      expect(clientes[0]!.estado.seq).toBe(i + 1);
    }
    const retransmitidas = clientes[1]!.conn.todas('tacada-retransmitida');
    expect(retransmitidas.map((r) => r.seq)).toEqual([0, 1, 2]);
    expect(retransmitidas.map((r) => r.lugar)).toEqual(dosQueTacaram);
    expect(clientes[0]!.visao!.partida).toEqual(clientes[1]!.visao!.partida);
    expect(clientes[0]!.visao!.mesa).toEqual(clientes[1]!.visao!.mesa);
  });

  describe('rejeições (o estado da sala não muda e quem errou volta ao retrato)', () => {
    function rejeitada(codigo: string, estraga: (m: MsgTacada, c: { ana: ClienteDeTeste; beto: ClienteDeTeste }) => MsgTacada, quem: 'ana' | 'beto' = 'ana', preparo?: (c: { ana: ClienteDeTeste; beto: ClienteDeTeste }) => void) {
      const amb = criarAmbiente();
      const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
      const c = { ana, beto };
      preparo?.(c);
      const remetente = c[quem];
      const ruim = estraga(tacadaFixa(remetente), c);
      const estadoAntes = ana.estado;
      const antes = { ana: ana.conn.recebidas.length, beto: beto.conn.recebidas.length };
      remetente.enviar(ruim);
      const recebidas = (x: ClienteDeTeste) => x.conn.recebidas.slice(antes[x === ana ? 'ana' : 'beto']);
      const doRemetente = recebidas(remetente);
      expect(doRemetente.map((m) => m.tipo)).toEqual(['erro', 'retrato']);
      expect(doRemetente[0]).toMatchObject({ tipo: 'erro', codigo });
      expect(doRemetente[1]).toMatchObject({ tipo: 'retrato', motivo: 'ressincronia', seq: estadoAntes.seq });
      expect(recebidas(quem === 'ana' ? beto : ana)).toEqual([]);
      // nada mudou: uma tacada correta do jogador da vez ainda é aceita
      const dono = c[estadoAntes.vez === 0 ? 'ana' : 'beto'];
      dono.enviar(tacadaFixa(dono));
      expect(ana.conn.todas('tacada-retransmitida')).toHaveLength(1);
      expect(ana.estado.seq).toBe(estadoAntes.seq + 1);
    }

    it('fora da vez', () => rejeitada('nao-e-sua-vez', (m) => m, 'beto'));
    it('seq adiantado', () => rejeitada('seq-errado', (m) => ({ ...m, seq: m.seq + 1 })));
    it('partida que as regras não produzem (vez trocada)', () => rejeitada('partida-diverge', (m) => ({ ...m, partida: { ...m.partida, vez: 1 - m.partida.vez } })));
    it('partida que as regras não produzem (bola a menos na mesa)', () =>
      rejeitada('partida-diverge', (m) => ({ ...m, partida: { ...m.partida, naMesa: m.partida.naMesa.slice(1) } })));
    it('partida que as regras não produzem (config da casa trocada)', () =>
      rejeitada('partida-diverge', (m) => ({ ...m, partida: { ...m.partida, config: { ...m.partida.config, penaDireta: m.partida.config.penaDireta === 1 ? 2 : 1 } } })));
    it('eventos que mudam o resultado das regras sem a partida acompanhar', () =>
      rejeitada('partida-diverge', (m) => {
        // gravação coerente em si (a bola 3 cai e sai da mesa), mas que as regras leem diferente do que a partida enviada diz
        const n = m.gravacao.ids.length;
        const naMesa = m.gravacao.naMesa.slice();
        const i = m.gravacao.ids.indexOf(3);
        for (let q = 60; q < m.gravacao.quadros; q++) naMesa[q * n + i] = 0;
        const eventos = [m.gravacao.eventos[0]!, { tipo: 'bola-bola' as const, t: 0.5, a: 0, b: 3, velocidade: 1 }, { tipo: 'cacapa' as const, t: 1, bola: 3, cacapa: 'canto-x+z+' }, m.gravacao.eventos[1]!];
        return { ...m, gravacao: { ...m.gravacao, naMesa, eventos } };
      }));
    it('gravação sem o evento parou', () => rejeitada('gravacao-invalida', (m) => ({ ...m, gravacao: { ...m.gravacao, eventos: m.gravacao.eventos.slice(0, 1) } })));
    it('mesa sem uma bola que as regras dizem estar nela', () =>
      rejeitada('mesa-incoerente', (m) => ({ ...m, mesa: { bolas: m.mesa.bolas.filter((b) => b.id !== m.partida.naMesa[0]) } })));
    it('mesa com uma bola a mais (que a casa não usa)', () =>
      rejeitada('mesa-incoerente', (m) => {
        const usadas = new Set(bolasDaCasa(m.partida.config));
        const extra = Array.from({ length: 15 }, (_, i) => i + 1).find((id) => !usadas.has(id))!;
        return { ...m, mesa: { bolas: [...m.mesa.bolas, { ...m.mesa.bolas[0]!, id: extra, naMesa: true }] } };
      }));
    it('mesa sem o bolão', () =>
      rejeitada('mesa-incoerente', (m) => ({ ...m, mesa: { bolas: m.mesa.bolas.map((b) => (b.id === 0 ? { ...b, naMesa: false } : b)) } })));
    it('mesa com bola fora dos limites', () =>
      rejeitada('mesa-incoerente', (m) => ({ ...m, mesa: { bolas: m.mesa.bolas.map((b) => (b.id === 5 ? { ...b, posicao: { ...b.posicao, x: 9 } } : b)) } })));

    it('mesa com bola fora dos limites em z', () =>
      rejeitada('mesa-incoerente', (m) => ({ ...m, mesa: { bolas: m.mesa.bolas.map((b) => (b.id === 5 ? { ...b, posicao: { ...b.posicao, z: 9 } } : b)) } })));
    it('mesa com bola no ar', () =>
      rejeitada('mesa-incoerente', (m) => ({ ...m, mesa: { bolas: m.mesa.bolas.map((b) => (b.id === 5 ? { ...b, posicao: { ...b.posicao, y: 3 } } : b)) } })));

    it('espectador não taca', () => {
      const amb = criarAmbiente();
      const [ana] = salaIniciada(amb) as [ClienteDeTeste];
      const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
      esp.enviar(tacadaFixa(ana));
      expect(esp.ultimoErro?.codigo).toBe('nao-e-sua-vez');
      expect(ana.estado.seq).toBe(0);
    });

    it('antes de iniciar a fase é outra', () => {
      const amb = criarAmbiente();
      const ana = new ClienteDeTeste(amb, 'Ana').criar();
      ana.enviar({ ...tacadaFixaSemVisao() });
      expect(ana.ultimoErro?.codigo).toBe('fase-errada');
    });

    it('depois do fim da partida', () => {
      const real = { novaPartida, aplicarTacada };
      const fim = (p: EstadoPartida): ResultadoRegras => ({
        partida: { ...p, fase: 'fim', vencedor: 0, naMesa: p.naMesa.filter((b) => b !== 1) },
        consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 0, vencedor: 0, texto: 'fim' },
      });
      const amb = criarAmbiente({}, { regras: { ...real, aplicarTacada: (p) => fim(p) } });
      const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
      const v = ana.visao!;
      const gravacao = gravacaoDeTeste();
      ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao, partida: fim(v.partida).partida, mesa: v.mesa });
      expect(ana.erros).toHaveLength(0);
      expect(beto.estado).toMatchObject({ fase: 'jogando', vez: null, seq: 1 });
      ana.enviar({ tipo: 'tacada', seq: 1, parametros: TACADA_MEDIA, gravacao, partida: fim(v.partida).partida, mesa: v.mesa });
      expect(ana.ultimoErro?.codigo).toBe('partida-acabou');
    });
  });
});

function tacadaFixaSemVisao(): MsgTacada {
  const g = gravacaoDeTeste();
  return {
    tipo: 'tacada',
    seq: 0,
    parametros: TACADA_MEDIA,
    gravacao: g,
    partida: novaPartida(PRESET_BOTECO.regras, [{ id: 'lugar-0', nome: 'A', equipe: 0 }, { id: 'lugar-1', nome: 'B', equipe: 1 }], { proximo: () => 0.5 }).partida,
    mesa: { bolas: [] },
  };
}
