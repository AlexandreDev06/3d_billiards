import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { PROTOCOLO_VERSAO, equipeDoLugar } from '@sinuca/protocolo';
import { PRESET_BOTECO, aplicarTacada, jogadoresDaProxima, novaPartida, type EstadoPartida, type Jogador, type ResultadoRegras } from '@sinuca/regras';
import { ClienteDeTeste, TACADA_MEDIA, criarAmbiente, salaIniciada } from './para-testes';
import { REGRAS_DO_PACOTE, type MotorDeRegras } from './regras';

const ids = (p: EstadoPartida): string[] => p.jogadores.map((j) => j.id);
const nomesDosLugares = (c: ClienteDeTeste): (string | null)[] => c.estado.lugares.map((l) => l.nome);

/**
 * Regras de apoio: a `novaPartida` do pacote aceita (ou não) 3 jogadores conforme a versão das regras; aqui a sala é
 * testada sozinha, com um motor que monta a partida do pacote (2 jogadores) e troca a lista pelos jogadores que a sala
 * mandou. O que a sala entrega a `novaPartida` fica em `recebidos`.
 */
function motorQueAceitaTres(): { motor: MotorDeRegras; recebidos: (readonly Jogador[])[] } {
  const recebidos: (readonly Jogador[])[] = [];
  const dois: Jogador[] = [
    { id: 'a', nome: 'a', equipe: 0 },
    { id: 'b', nome: 'b', equipe: 1 },
  ];
  const motor: MotorDeRegras = {
    novaPartida(config, jogadores, rng) {
      recebidos.push(jogadores);
      const base = novaPartida(config, dois, rng);
      return { ...base, partida: { ...base.partida, jogadores } };
    },
    aplicarTacada(partida): ResultadoRegras {
      // qualquer tacada acaba a partida: serve para provar o ciclo fim → espera → iniciar
      return {
        partida: { ...partida, fase: 'fim', vencedor: 0, naMesa: partida.naMesa.filter((b) => b !== 1) },
        consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1, vencedor: 0, texto: 'fim' },
      };
    },
  };
  return { motor, recebidos };
}

function sala2x1() {
  const { motor, recebidos } = motorQueAceitaTres();
  const amb = criarAmbiente({}, { regras: motor });
  const ana = new ClienteDeTeste(amb, 'Ana').criar('2x1');
  return { amb, ana, recebidos };
}

describe('modo 2x1 — os lugares e a espera', () => {
  it('criar-sala 2x1: o estado traz o modo e 4 lugares, com as equipes 0, 1, 0 (e 1 no lugar que não conta)', () => {
    const { ana } = sala2x1();
    expect(ana.estado.modo).toBe('2x1');
    expect(ana.estado.lugares.map((l) => l.equipe)).toEqual([0, 1, 0, 1]);
    expect(ana.lugar).toBe(0);
  });

  it('quem entra ocupa o 1 e depois o 2; o seguinte, sem lugar, assiste', () => {
    const { amb, ana } = sala2x1();
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    const davi = new ClienteDeTeste(amb, 'Davi').entrar(ana.codigo);
    expect([beto.lugar, cida.lugar, davi.lugar]).toEqual([1, 2, null]);
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', 'Cida', null]);
    expect(ana.estado.espectadores).toBe(1);
  });

  it('o lugar 3 não existe no 2x1: escolher-lugar dá lugar-invalido, ocupado dá lugar-ocupado, e dá para trocar para o vago', () => {
    const { amb, ana } = sala2x1();
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    beto.enviar({ tipo: 'escolher-lugar', lugar: 3 });
    expect(beto.ultimoErro?.codigo).toBe('lugar-invalido');
    beto.enviar({ tipo: 'escolher-lugar', lugar: 2 });
    expect(beto.ultimoErro?.codigo).toBe('lugar-ocupado');
    cida.enviar({ tipo: 'escolher-lugar', lugar: null });
    beto.enviar({ tipo: 'escolher-lugar', lugar: 2 });
    expect(nomesDosLugares(ana)).toEqual(['Ana', null, 'Beto', null]);
    expect(ana.estado.espectadores).toBe(1);
    cida.enviar({ tipo: 'escolher-lugar', lugar: 1 });
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Cida', 'Beto', null]);
  });

  it('iniciar exige os 3 lugares cheios e conectados', () => {
    const { amb, ana } = sala2x1();
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.ultimoErro?.codigo).toBe('lugares-incompletos');
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    cida.sair();
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.erros).toHaveLength(2);
    expect(ana.estado.fase).toBe('espera');
    cida.reconectar();
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.erros).toHaveLength(2);
    expect(beto.estado).toMatchObject({ fase: 'jogando', vez: 0 });
  });
});

describe('modo 2x1 — a partida', () => {
  it('novaPartida recebe os 3 jogadores na ordem dos lugares, com as equipes 0, 1, 0 e o id do lugar', () => {
    const { amb, ana, recebidos } = sala2x1();
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    expect(recebidos).toEqual([
      [
        { id: 'lugar-0', nome: 'Ana', equipe: 0 },
        { id: 'lugar-1', nome: 'Beto', equipe: 1 },
        { id: 'lugar-2', nome: 'Cida', equipe: 0 },
      ],
    ]);
  });

  it('todos recebem o retrato com os 3 jogadores; o estado mostra a vez e o lugar 3 segue vago', () => {
    const { amb, ana } = sala2x1();
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    for (const c of [ana, beto, cida, esp]) {
      expect(ids(c.conn.ultima('retrato')!.partida)).toEqual(['lugar-0', 'lugar-1', 'lugar-2']);
      expect(c.estado).toMatchObject({ modo: '2x1', fase: 'jogando', vez: 0, seq: 0 });
      expect(c.estado.lugares[3]).toMatchObject({ nome: null, conectado: false });
    }
    expect(esp.estado.espectadores).toBe(1);
  });

  it('a vez é o lugar do jogador que as regras apontam (o índice vira lugar pelo id)', () => {
    const { motor } = motorQueAceitaTres();
    // regras que passam a vez para o jogador de índice 2: o lugar 2, e não o índice
    const amb = criarAmbiente({}, { regras: { ...motor, aplicarTacada: (p) => ({ partida: { ...p, vez: 2 }, consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 2, vencedor: null, texto: '' } }) } });
    const [ana, beto, cida] = salaIniciada(amb, '2x1') as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: { ...v.partida, vez: 2 }, mesa: v.mesa });
    expect(ana.erros).toHaveLength(0);
    for (const c of [ana, beto, cida]) expect(c.estado).toMatchObject({ vez: 2, seq: 1 });
    ana.enviar({ tipo: 'mira', angulo: 0, lateral: 0, vertical: 0, recuo: 0 });
    cida.conn.limpar();
    cida.enviar({ tipo: 'mira', angulo: 1, lateral: 0, vertical: 0, recuo: 0.1 });
    expect(beto.conn.ultima('mira-retransmitida')).toMatchObject({ lugar: 2, angulo: 1 });
    expect(ana.conn.ultima('mira-retransmitida')).toMatchObject({ lugar: 2, angulo: 1 });
  });

  it('só o dono da vez taca: o lugar 1 (a equipe de 1) não pode tacar na vez do lugar 0', () => {
    const { motor } = motorQueAceitaTres();
    const amb = criarAmbiente({}, { regras: motor });
    const [ana, beto] = salaIniciada(amb, '2x1') as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    beto.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: v.partida, mesa: v.mesa });
    expect(beto.ultimoErro?.codigo).toBe('nao-e-sua-vez');
  });

  it('fim da partida → voltar-ao-lobby → iniciar: mesmos 3 lugares, e a sala entrega os mesmos jogadores à novaPartida', () => {
    const { motor, recebidos } = motorQueAceitaTres();
    const amb = criarAmbiente({}, { regras: motor });
    const [ana, beto, cida] = salaIniciada(amb, '2x1') as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    const fim = motor.aplicarTacada(v.partida, []).partida;
    ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim, mesa: v.mesa });
    expect(ana.erros).toHaveLength(0);
    expect(ana.estado.vez).toBeNull();
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    for (const c of [ana, beto, cida]) expect(c.estado).toMatchObject({ modo: '2x1', fase: 'espera', vez: null });
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', 'Cida', null]);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.erros).toHaveLength(0);
    expect(recebidos).toHaveLength(2);
    expect(new Set(recebidos[1]!.map((j) => `${j.id}:${j.nome}:${j.equipe}`))).toEqual(new Set(['lugar-0:Ana:0', 'lugar-1:Beto:1', 'lugar-2:Cida:0']));
    expect(recebidos[1]).toHaveLength(3);
    expect(ids(ana.conn.ultima('retrato')!.partida).sort()).toEqual(['lugar-0', 'lugar-1', 'lugar-2']);
  });
});

describe('modo 2x1 — trocar de modo na espera', () => {
  it('2x2 → 2x1: quem estava no lugar 3 vira espectador (boas-vindas com lugar null, mesmo token); os outros ficam', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x2');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    const davi = new ClienteDeTeste(amb, 'Davi').entrar(ana.codigo);
    const tokenDoDavi = davi.token;
    [ana, beto, cida, davi].forEach((c) => c.conn.limpar());
    ana.enviar({ tipo: 'configurar-sala', modo: '2x1' });
    expect(davi.conn.recebidas.map((m) => m.tipo)).toEqual(['boas-vindas', 'estado-sala']);
    expect(davi.conn.todas('boas-vindas')[0]).toMatchObject({ lugar: null, anfitriao: false, token: tokenDoDavi });
    for (const c of [ana, beto, cida]) expect(c.conn.recebidas.map((m) => m.tipo)).toEqual(['estado-sala']);
    expect(ana.estado.modo).toBe('2x1');
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', 'Cida', null]);
    expect(ana.estado.espectadores).toBe(1);
    davi.enviar({ tipo: 'escolher-lugar', lugar: 3 });
    expect(davi.ultimoErro?.codigo).toBe('lugar-invalido');
  });

  it('2x1 → 2x2: ninguém sai do lugar e o lugar 3 passa a existir; iniciar exige os 4', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x1');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    const davi = new ClienteDeTeste(amb, 'Davi').entrar(ana.codigo);
    expect(davi.lugar).toBeNull();
    [ana, beto, cida, davi].forEach((c) => c.conn.limpar());
    ana.enviar({ tipo: 'configurar-sala', modo: '2x2' });
    for (const c of [ana, beto, cida, davi]) expect(c.conn.recebidas.map((m) => m.tipo)).toEqual(['estado-sala']);
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', 'Cida', null]);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.ultimoErro?.codigo).toBe('lugares-incompletos');
    davi.enviar({ tipo: 'escolher-lugar', lugar: 3 });
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', 'Cida', 'Davi']);
  });

  it('2x1 → 1x1: quem estava no lugar 2 vira espectador; 1x1 → 2x1: ninguém se mexe e o lugar 2 volta a existir', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x1');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    [ana, beto, cida].forEach((c) => c.conn.limpar());
    ana.enviar({ tipo: 'configurar-sala', modo: '1x1' });
    expect(cida.conn.todas('boas-vindas')).toEqual([expect.objectContaining({ lugar: null })]);
    expect(beto.conn.todas('boas-vindas')).toHaveLength(0);
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', null, null]);
    cida.enviar({ tipo: 'escolher-lugar', lugar: 2 });
    expect(cida.ultimoErro?.codigo).toBe('lugar-invalido');
    ana.enviar({ tipo: 'configurar-sala', modo: '2x1' });
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', null, null]);
    cida.enviar({ tipo: 'escolher-lugar', lugar: 2 });
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', 'Cida', null]);
  });

  it('2x1 → 2x1 não desloca ninguém e ainda confirma com um estado-sala', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x1');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    [ana, beto, cida].forEach((c) => c.conn.limpar());
    ana.enviar({ tipo: 'configurar-sala', modo: '2x1' });
    for (const c of [ana, beto, cida]) expect(c.conn.recebidas.map((m) => m.tipo)).toEqual(['estado-sala']);
  });

  it('configurar-sala para 2x1 só pelo anfitrião e só na espera', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    beto.enviar({ tipo: 'configurar-sala', modo: '2x1' });
    expect(beto.ultimoErro?.codigo).toBe('nao-anfitriao');
    expect(ana.estado.modo).toBe('1x1');
    ana.enviar({ tipo: 'iniciar' });
    ana.enviar({ tipo: 'configurar-sala', modo: '2x1' });
    expect(ana.ultimoErro?.codigo).toBe('fase-errada');
    expect(ana.estado.modo).toBe('1x1');
  });
});

describe('modo 2x1 — com as regras de verdade (novaPartida e jogadoresDaProxima de 3 jogadores)', () => {
  it('inicia com os 3 e a equipe de 1 joga todas as vezes dela: 0, 1, 2, 1', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '2x1') as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    expect(ana.erros).toHaveLength(0);
    const porLugar = [ana, beto, cida];
    const vezes: number[] = [];
    for (let i = 0; i < 4; i++) {
      const vez = ana.estado.vez!;
      vezes.push(vez);
      const quem = porLugar[vez]!;
      quem.jogar(TACADA_MEDIA, 40 + i);
      expect(quem.erros, `tacada ${i}`).toHaveLength(0);
      if (ana.estado.vez === null) break;
    }
    expect(vezes.slice(0, 2)).toEqual([0, 1]);
    // a vez só muda entre equipes: depois de um jogador da equipe 0 vem o 1, e depois do 1 um dos dois da equipe 0
    vezes.slice(1).forEach((v, i) => {
      if (v !== vezes[i]) expect(equipeDoLugar(v), `${vezes[i]} → ${v}`).not.toBe(equipeDoLugar(vezes[i]!));
    });
    expect(ana.estado.seq).toBe(vezes.length);
    for (const c of porLugar) expect(c.estado.seq).toBe(vezes.length);
  });

  it('o jogo acaba, volta ao lobby e a próxima partida sai na ordem de jogadoresDaProxima', () => {
    const amb = criarAmbiente({}, { regras: { novaPartida: REGRAS_DO_PACOTE.novaPartida, aplicarTacada: (p, e) => (p.fase === 'saida' ? fimComVencedor(p) : aplicarTacada(p, e)) } });
    const [ana, beto, cida] = salaIniciada(amb, '2x1') as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    const fim = fimComVencedor(v.partida).partida;
    ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim, mesa: v.mesa });
    expect(ana.erros).toHaveLength(0);
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'iniciar' });
    expect(ids(cida.conn.ultima('retrato')!.partida)).toEqual(jogadoresDaProxima(fim).map((j) => j.id));
    expect(beto.erros).toHaveLength(0);
  });

  it('ir ao 2x2 e voltar ao 2x1 na espera descarta a ordem guardada: valem os lugares', () => {
    const amb = criarAmbiente({}, { regras: { novaPartida: REGRAS_DO_PACOTE.novaPartida, aplicarTacada: (p) => fimComVencedor({ ...p, vez: 1 }) } });
    const [ana, , cida] = salaIniciada(amb, '2x1') as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fimComVencedor({ ...v.partida, vez: 1 }).partida, mesa: v.mesa });
    expect(ana.erros).toHaveLength(0);
    expect(jogadoresDaProxima(ana.visao!.partida)[0]!.id, 'sem isso o teste não distingue a ordem guardada da dos lugares').not.toBe('lugar-0');
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    ana.enviar({ tipo: 'configurar-sala', modo: '2x2' });
    ana.enviar({ tipo: 'configurar-sala', modo: '2x1' });
    ana.enviar({ tipo: 'iniciar' });
    expect(ids(cida.conn.ultima('retrato')!.partida)).toEqual(['lugar-0', 'lugar-1', 'lugar-2']);
  });
});

/** Fim de jogo com vencedor, para as regras de verdade (vale para 2 ou 3 jogadores). */
function fimComVencedor(p: EstadoPartida): ResultadoRegras {
  return {
    partida: { ...p, fase: 'fim', vencedor: 0, naMesa: p.naMesa.filter((b) => b !== 1) },
    consequencias: { faltas: [], retirar: [], recolocar: [], proximo: p.vez, vencedor: 0, texto: 'fim' },
  };
}

describe('contrato do modo 2x1', () => {
  it('o criar-sala 2x1 passa a versão do protocolo e a sala o aceita (sem erro)', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').enviar({ tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Ana', modo: '2x1', preset: 'Boteco', regras: PRESET_BOTECO.regras });
    expect(ana.erros).toHaveLength(0);
    expect(ana.estado.modo).toBe('2x1');
  });
});
