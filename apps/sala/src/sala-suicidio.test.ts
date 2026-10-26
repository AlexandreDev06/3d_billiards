/**
 * L19 e L21: o suicídio e o cegar no mata-mata perdem a próxima vez, e a sala só passa a pena adiante: quem decide é
 * `aplicarTacada` / `passarVez` das regras, o campo `perdemAProximaVez` viaja na `partida` do `retrato` e da
 * `tacada-retransmitida`, e a tacada que diverge do que as regras dão (esquecer a pena ou inventar uma) é recusada.
 * Física real: as tacadas que derrubam a branca ou cegam vêm de `acharTacada`.
 */
import { describe, expect, it } from 'vitest';
import type { MsgTacada } from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESET_MATA_MATA, novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { ClienteDeTeste, SEM_LIMITE, acharTacada, brancaSaiu, cegou, criarAmbiente, mensagemDeCriar, salaIniciada } from './para-testes';

const MM = PRESET_MATA_MATA.regras;
/** As duas penas desligadas: nem o suicídio nem o cegar põem ninguém na lista. */
const SEM_PENA = { ...MM, suicidioNoMataMata: 'sem-pena', cegarNoMataMata: 'sem-pena' } as const;

const caiuNaCacapa = (t: Pick<MsgTacada, 'gravacao'>): boolean => t.gravacao.eventos.some((e) => e.tipo === 'cacapa' && e.bola === 0);

/** Uma tacada que derruba a branca na caçapa, para o jogador da vez. */
const suicida = (c: ClienteDeTeste): MsgTacada => acharTacada(c.visao!, caiuNaCacapa, [4, 2, 1, 8, 6]);
/** Uma tacada sem pena nenhuma: a branca fica na mesa (não é suicídio) e toca uma bola (não cega). */
const tranquila = (c: ClienteDeTeste): MsgTacada => acharTacada(c.visao!, (t) => !brancaSaiu(t) && !cegou(t));
/** Uma tacada que cega: a branca anda, não toca bola nenhuma e fica na mesa (só a falta `cegar`). */
const cega = (c: ClienteDeTeste): MsgTacada => acharTacada(c.visao!, (t) => cegou(t) && !brancaSaiu(t), [2, 1, 0.5]);

/** `c` taca, a sala aceita, e devolve a `tacada-retransmitida` que `observador` recebeu. */
function tacar(c: ClienteDeTeste, m: MsgTacada, observador: ClienteDeTeste = c) {
  const erros = c.erros.length;
  c.enviar(m);
  expect(c.erros.slice(erros), `${c.nome} tacou e a sala recusou`).toEqual([]);
  return observador.conn.todas('tacada-retransmitida').at(-1)!;
}

describe('suicídio no mata-mata de 3: a vez passa e, quando a roda volta, quem cometeu é pulado', () => {
  it('Ana derruba a branca: a vez vai a Beto, a lista tem Ana e todos recebem o mesmo, inclusive o espectador', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    const r = tacar(ana, suicida(ana), beto);

    expect(r.consequencias.faltas.map((f) => f.nome)).toContain('suicidio');
    expect(r.consequencias.proximo).toBe(1);
    expect(r.consequencias.texto).toContain('Ana perde a próxima vez');
    expect(r.partida).toMatchObject({ vez: 1, perdemAProximaVez: [0] });
    for (const c of [ana, beto, cida, esp]) {
      expect(c.conn.todas('tacada-retransmitida').at(-1)!.partida, c.nome).toEqual(r.partida);
      expect(c.estado, c.nome).toMatchObject({ vez: 1, seq: 1 });
    }
  });

  it('o estado-sala não carrega a partida: o campo viaja só no retrato e na tacada-retransmitida', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, suicida(ana), beto);
    for (const estado of beto.conn.todas('estado-sala')) {
      expect(estado).not.toHaveProperty('perdemAProximaVez');
      expect(estado).not.toHaveProperty('partida');
    }
  });

  it('a roda volta: Beto e Cida jogam, a vez de Ana é pulada (a lista se esvazia e o campo some) e ela não consegue tacar', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, suicida(ana), beto);

    const deBeto = tacar(beto, tranquila(beto), cida);
    expect(deBeto.partida, 'a roda ainda não chegou em Ana').toMatchObject({ vez: 2, perdemAProximaVez: [0] });
    expect(deBeto.consequencias.proximo).toBe(2);

    const deCida = tacar(cida, tranquila(cida), ana);
    expect(deCida.partida.vez, 'Ana é pulada').toBe(1);
    expect(deCida.partida, 'a pena foi cumprida').not.toHaveProperty('perdemAProximaVez');
    expect(deCida.consequencias.proximo).toBe(1);
    expect(deCida.consequencias.texto).toContain('Ana perdeu a vez: joga Beto');
    for (const c of [ana, beto, cida]) expect(c.estado, c.nome).toMatchObject({ vez: 1, seq: 3 });

    // Ana tenta tacar na vez que perdeu
    const seq = ana.estado.seq;
    ana.enviar(tranquila(ana));
    expect(ana.ultimoErro).toMatchObject({ codigo: 'nao-e-sua-vez' });
    expect(ana.estado.seq).toBe(seq);

    // a pena é de uma vez só: Beto, Cida, e a vez volta a Ana
    tacar(beto, tranquila(beto), ana);
    const deCida2 = tacar(cida, tranquila(cida), ana);
    expect(deCida2.partida).toMatchObject({ vez: 0 });
    expect(deCida2.partida).not.toHaveProperty('perdemAProximaVez');
    expect(ana.estado.vez).toBe(0);
    tacar(ana, tranquila(ana), beto);
    expect(ana.erros.filter((e) => e.codigo === 'nao-e-sua-vez'), 'o único erro foi o da vez pulada').toHaveLength(1);
  }, 30_000);

  it('Beto, no meio da roda, comete suicídio: Cida joga e, quando a roda chega em Beto, ele é pulado', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, tranquila(ana), beto);
    const r = tacar(beto, suicida(beto), cida);
    expect(r.partida).toMatchObject({ vez: 2, perdemAProximaVez: [1] });
    tacar(cida, tranquila(cida), ana);
    const deAna = tacar(ana, tranquila(ana), beto);
    expect(deAna.partida.vez, 'Beto é pulado').toBe(2);
    expect(deAna.partida).not.toHaveProperty('perdemAProximaVez');
    expect(deAna.consequencias.texto).toContain('Beto perdeu a vez: joga Cida');
  }, 30_000);

  it('suicídios de pessoas diferentes seguidos: a lista guarda os dois, em ordem crescente, e a vez de cada um é pulada', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, suicida(ana), beto);
    const r = tacar(beto, suicida(beto), cida);
    expect(r.partida).toMatchObject({ vez: 2, perdemAProximaVez: [0, 1] });
    const deCida = tacar(cida, tranquila(cida), ana);
    expect(deCida.partida.vez, 'Ana e Beto são pulados e Cida joga de novo').toBe(2);
    expect(deCida.partida).not.toHaveProperty('perdemAProximaVez');
    expect(deCida.consequencias.texto).toContain('Ana e Beto perderam a vez: joga Cida');
    expect(cida.estado.vez).toBe(2);
  }, 30_000);

  it('os três em fila: a roda gasta todas as penas e para em Ana, sem travar', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, suicida(ana), beto);
    tacar(beto, suicida(beto), cida);
    const r = tacar(cida, suicida(cida), ana);
    expect(r.partida.vez).toBe(0);
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    expect(ana.estado.vez).toBe(0);
    tacar(ana, tranquila(ana), beto);
    expect(beto.estado.vez).toBe(1);
  }, 30_000);
});

describe('suicídio no mata-mata de 1x1: o outro joga duas seguidas', () => {
  it('Ana derruba a branca, Beto joga e joga de novo, e só então a vez volta a Ana', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste];
    const r = tacar(ana, suicida(ana), beto);
    expect(r.partida).toMatchObject({ vez: 1, perdemAProximaVez: [0] });
    const primeira = tacar(beto, tranquila(beto), ana);
    expect(primeira.partida).toMatchObject({ vez: 1 });
    expect(primeira.partida).not.toHaveProperty('perdemAProximaVez');
    expect(beto.estado).toMatchObject({ vez: 1, seq: 2 });
    const segunda = tacar(beto, tranquila(beto), ana);
    expect(segunda.partida.vez).toBe(0);
    expect(ana.estado).toMatchObject({ vez: 0, seq: 3 });
  }, 30_000);
});

describe('suicídio no mata-mata: o retrato leva a lista a quem entra ou volta', () => {
  it('espectador que chega e Ana que cai e volta com o token recebem o retrato com a lista; depois do pulo, sem ela', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, suicida(ana), beto);

    const tardio = new ClienteDeTeste(amb, 'Davi').entrar(ana.codigo);
    expect(tardio.conn.ultima('retrato')).toMatchObject({ motivo: 'entrada', seq: 1, partida: { vez: 1, perdemAProximaVez: [0] } });

    ana.sair();
    ana.reconectar();
    expect(ana.conn.ultima('retrato')).toMatchObject({ motivo: 'entrada', partida: { vez: 1, perdemAProximaVez: [0] } });

    tacar(beto, tranquila(beto), cida);
    tacar(cida, tranquila(cida), beto);
    const outro = new ClienteDeTeste(amb, 'Eva').entrar(ana.codigo);
    const retrato = outro.conn.ultima('retrato')!;
    expect(retrato.partida.vez).toBe(1);
    expect(retrato.partida).not.toHaveProperty('perdemAProximaVez');
    expect(tardio.visao!.partida).toEqual(retrato.partida);
  }, 30_000);

  it('uma tacada recusada devolve o retrato de ressincronia com a lista que a sala tem, não a do cliente', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, suicida(ana), beto);
    const real = tranquila(beto);
    beto.enviar({ ...real, partida: { ...real.partida, perdemAProximaVez: [0, 1] } });
    expect(beto.ultimoErro).toMatchObject({ codigo: 'partida-diverge' });
    expect(beto.conn.ultima('retrato')).toMatchObject({ motivo: 'ressincronia', partida: { vez: 1, perdemAProximaVez: [0] } });
    expect(cida.estado).toMatchObject({ vez: 1, seq: 1 });
  }, 30_000);
});

describe('suicídio no mata-mata: a sala não aceita partida que diverge das regras', () => {
  it('Ana derruba a branca mas manda a partida sem a pena: partida-diverge, a vez continua com ela e nada muda', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const m = suicida(ana);
    expect(m.partida.perdemAProximaVez).toEqual([0]);
    const semPena: Record<string, unknown> = { ...m.partida };
    delete semPena.perdemAProximaVez;
    ana.enviar({ ...m, partida: semPena as unknown as EstadoPartida });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'partida-diverge' });
    expect(beto.conn.todas('tacada-retransmitida')).toHaveLength(0);
    expect(ana.estado).toMatchObject({ vez: 0, seq: 0 });
    // com a partida certa a mesma tacada passa
    ana.enviar(m);
    expect(beto.conn.todas('tacada-retransmitida').at(-1)!.partida).toMatchObject({ vez: 1, perdemAProximaVez: [0] });
  });

  it('a tacada sem suicídio com uma pena inventada, ou com a vez que a pena pularia, também diverge', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const m = tranquila(ana);
    ana.enviar({ ...m, partida: { ...m.partida, perdemAProximaVez: [0] } });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'partida-diverge' });
    ana.enviar({ ...m, partida: { ...m.partida, perdemAProximaVez: [1], vez: 2 } });
    expect(ana.erros.map((e) => e.codigo)).toEqual(['partida-diverge', 'partida-diverge']);
    expect(beto.conn.todas('tacada-retransmitida')).toHaveLength(0);
    expect(ana.estado.seq).toBe(0);
  });
});

describe('suicídio no mata-mata: tempo esgotado e queda também pulam', () => {
  it('o tempo de Beto e depois o de Cida esgotam: a roda anda e pula Ana (aviso e retrato de cada passada dizem a verdade)', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', { tempoS: 15 }, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const m = suicida(ana);
    tacar(ana, m, beto);
    const { margemAnimacaoMs, folgaMs } = amb.config.relogioTacada;
    const ate = Math.ceil(m.gravacao.duracao * 1000) + margemAnimacaoMs + 15_000 + folgaMs;
    amb.avancar(ate - 1);
    expect(cida.estado.vez, 'ainda no prazo').toBe(1);
    amb.avancar(1);

    expect(cida.estado.vez, 'o tempo de Beto acabou: a vez vai a Cida').toBe(2);
    expect(cida.conn.todas('tempo-esgotado').at(-1)).toMatchObject({ lugar: 1, proximo: 2, motivo: 'tempo' });
    expect(cida.conn.ultima('retrato')).toMatchObject({ motivo: 'vez-passou', partida: { vez: 2, perdemAProximaVez: [0] } });

    amb.avancar(16_499);
    expect(cida.estado.vez).toBe(2);
    amb.avancar(1);

    expect(ana.estado.vez, 'o tempo de Cida acabou: Ana é pulada e a vez volta a Beto').toBe(1);
    expect(ana.conn.todas('tempo-esgotado').at(-1)).toMatchObject({ lugar: 2, proximo: 1, motivo: 'tempo' });
    const retrato = ana.conn.ultima('retrato')!;
    expect(retrato).toMatchObject({ motivo: 'vez-passou', partida: { vez: 1 } });
    expect(retrato.partida).not.toHaveProperty('perdemAProximaVez');
    expect(ana.visao!.partida).toEqual(retrato.partida);
  });

  it('quem perde a vez pelo tempo não ganha pena: no 1x1 o tempo de Beto devolve a vez a ele mesmo, com Ana pulada, sem lista', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 15 }, undefined, MM) as [ClienteDeTeste, ClienteDeTeste];
    const m = suicida(ana);
    tacar(ana, m, beto);
    const { margemAnimacaoMs, folgaMs } = amb.config.relogioTacada;
    amb.avancar(Math.ceil(m.gravacao.duracao * 1000) + margemAnimacaoMs + 15_000 + folgaMs);
    expect(beto.conn.todas('tempo-esgotado').at(-1)).toMatchObject({ lugar: 1, proximo: 1, motivo: 'tempo' });
    expect(beto.estado.vez).toBe(1);
    const retrato = beto.conn.ultima('retrato')!;
    expect(retrato.partida.vez).toBe(1);
    expect(retrato.partida).not.toHaveProperty('perdemAProximaVez');
  });

  it('a vez de Cida, que caiu, passa depois da tolerância e pula Ana; nunca se espera por quem perdeu a vez, mesmo desconectada', () => {
    const amb = criarAmbiente({ toleranciaVezMs: 10_000 });
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, suicida(ana), beto);
    tacar(beto, tranquila(beto), cida);
    expect(cida.estado.vez).toBe(2);

    cida.sair();
    amb.avancar(9_999);
    expect(beto.estado.vez).toBe(2);
    amb.avancar(1);
    expect(beto.estado.vez, 'Cida ausente: a vez passa e Ana é pulada').toBe(1);
    expect(beto.conn.todas('tempo-esgotado').at(-1)).toMatchObject({ lugar: 2, proximo: 1, motivo: 'ausencia' });
    const retrato = beto.conn.ultima('retrato')!;
    expect(retrato.partida.vez).toBe(1);
    expect(retrato.partida).not.toHaveProperty('perdemAProximaVez');
  }, 30_000);

  it('Ana, que ainda deve a vez, cai: ninguém espera por ela, a roda a pula como se estivesse na mesa', () => {
    const amb = criarAmbiente({ toleranciaVezMs: 10_000 });
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, suicida(ana), beto);
    ana.sair();
    tacar(beto, tranquila(beto), cida);
    tacar(cida, tranquila(cida), beto);
    expect(beto.estado.vez, 'Ana ausente e pulada: a vez volta direto a Beto').toBe(1);
    amb.avancar(60_000);
    expect(beto.estado.vez).toBe(1);
    expect(beto.conn.todas('tempo-esgotado')).toHaveLength(0);
  }, 30_000);
});

describe('suicídio no mata-mata: a casa vale, e só no mata-mata', () => {
  it('com `sem-pena` (casa mandada pelo anfitrião) o suicídio só passa a vez: nada de lista, ninguém é pulado', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, SEM_PENA) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const r = tacar(ana, suicida(ana), beto);
    expect(r.partida.vez).toBe(1);
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    tacar(beto, tranquila(beto), cida);
    const deCida = tacar(cida, tranquila(cida), ana);
    expect(deCida.partida.vez, 'Ana joga na volta').toBe(0);
  }, 30_000);

  it('sala de par ou ímpar que muda para mata-mata na espera joga com o preset de fábrica: a pena está ligada', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x1', PRESET_BOTECO.regras, SEM_LIMITE);
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    ana.enviar({ tipo: 'configurar-sala', modalidade: 'mata-mata' });
    expect(ana.estado).toMatchObject({ modalidade: 'mata-mata', modo: '1x1x1' });
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.estado.fase).toBe('jogando');
    const r = tacar(ana, suicida(ana), beto);
    expect(r.partida.config).toMatchObject({ modalidade: 'mata-mata', suicidioNoMataMata: 'perde-proxima-vez', cegarNoMataMata: 'perde-proxima-vez' });
    expect(r.partida).toMatchObject({ vez: 1, perdemAProximaVez: [0] });
    expect(cida.estado.vez).toBe(1);
  }, 30_000);

  it('no par ou ímpar o suicídio segue sendo falta com a pena de sempre: nunca aparece lista', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', SEM_LIMITE) as [ClienteDeTeste, ClienteDeTeste];
    const r = tacar(ana, suicida(ana), beto);
    expect(r.consequencias.faltas.map((f) => f.nome)).toContain('suicidio');
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    expect(r.partida.vez).toBe(1);
  }, 30_000);

  it('criar uma sala de par ou ímpar com a pena do mata-mata ligada é regras-invalidas, e nada é criado', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana');
    ana.enviar(mensagemDeCriar('Ana', '1x1', { ...PRESET_BOTECO.regras, suicidioNoMataMata: 'perde-proxima-vez' }));
    expect(ana.ultimoErro).toMatchObject({ codigo: 'regras-invalidas' });
    expect(amb.registro.totalSalas).toBe(0);
  });
});

describe('cegar no mata-mata (L21): também perde a próxima vez, com a mesma lista e o mesmo pulo', () => {
  it('Ana cega: a vez vai a Beto, a lista tem Ana, nada sai da mesa, a frase diz a falta e todos recebem o mesmo, inclusive o espectador', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    const antes = ana.visao!.partida;
    const r = tacar(ana, cega(ana), beto);

    expect(r.consequencias.faltas).toEqual([{ nome: 'cegar' }]);
    expect(r.consequencias.retirar).toEqual([]);
    expect(r.consequencias.proximo).toBe(1);
    expect(r.consequencias.texto).toContain('Cegou! Ana perde a próxima vez');
    expect(r.partida).toMatchObject({ vez: 1, perdemAProximaVez: [0] });
    expect(r.partida.naMesa).toEqual(antes.naMesa);
    expect(r.partida.encacapadas).toEqual([]);
    for (const c of [ana, beto, cida, esp]) {
      expect(c.conn.todas('tacada-retransmitida').at(-1)!.partida, c.nome).toEqual(r.partida);
      expect(c.estado, c.nome).toMatchObject({ vez: 1, seq: 1 });
    }
  }, 30_000);

  it('a roda volta: Beto e Cida jogam, a vez de Ana é pulada e ela não consegue tacar; depois a vez volta a ela', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, cega(ana), beto);
    const deBeto = tacar(beto, tranquila(beto), cida);
    expect(deBeto.partida, 'a roda ainda não chegou em Ana').toMatchObject({ vez: 2, perdemAProximaVez: [0] });

    const deCida = tacar(cida, tranquila(cida), ana);
    expect(deCida.partida.vez, 'Ana é pulada').toBe(1);
    expect(deCida.partida, 'a pena foi cumprida').not.toHaveProperty('perdemAProximaVez');
    expect(deCida.consequencias.texto).toContain('Ana perdeu a vez: joga Beto');

    const seq = ana.estado.seq;
    ana.enviar(tranquila(ana));
    expect(ana.ultimoErro).toMatchObject({ codigo: 'nao-e-sua-vez' });
    expect(ana.estado.seq).toBe(seq);

    tacar(beto, tranquila(beto), ana);
    const deCida2 = tacar(cida, tranquila(cida), ana);
    expect(deCida2.partida.vez).toBe(0);
    expect(deCida2.partida).not.toHaveProperty('perdemAProximaVez');
    tacar(ana, tranquila(ana), beto);
  }, 30_000);

  it('cegar e derrubar a branca na mesma tacada é uma pena só: Ana é pulada uma vez e joga na volta seguinte', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const duas = acharTacada(ana.visao!, (t) => cegou(t) && brancaSaiu(t), [4, 2, 1, 8, 6]);
    const r = tacar(ana, duas, beto);
    expect(r.consequencias.faltas.map((f) => f.nome)).toEqual(expect.arrayContaining(['cegar', 'suicidio']));
    expect(r.partida, 'uma entrada, não duas').toMatchObject({ vez: 1, perdemAProximaVez: [0] });

    tacar(beto, tranquila(beto), cida);
    const pulo = tacar(cida, tranquila(cida), ana);
    expect(pulo.partida.vez, 'Ana é pulada').toBe(1);
    expect(pulo.partida).not.toHaveProperty('perdemAProximaVez');
    tacar(beto, tranquila(beto), cida);
    const volta = tacar(cida, tranquila(cida), ana);
    expect(volta.partida.vez, 'e na volta seguinte Ana joga: não sobrou segunda pena').toBe(0);
    expect(volta.partida).not.toHaveProperty('perdemAProximaVez');
  }, 30_000);

  it('cegar em fila: a lista guarda quem cegou, em ordem crescente, e a roda pula todos eles', () => {
    const amb = criarAmbiente();
    const [ana, beto, cida] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, cega(ana), beto);
    const r = tacar(beto, cega(beto), cida);
    expect(r.partida).toMatchObject({ vez: 2, perdemAProximaVez: [0, 1] });
    const deCida = tacar(cida, tranquila(cida), ana);
    expect(deCida.partida.vez, 'Ana e Beto são pulados e Cida joga de novo').toBe(2);
    expect(deCida.partida).not.toHaveProperty('perdemAProximaVez');
    expect(deCida.consequencias.texto).toContain('Ana e Beto perderam a vez: joga Cida');
  }, 30_000);

  it('no 1x1 o outro joga duas seguidas depois de Ana cegar', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste];
    expect(tacar(ana, cega(ana), beto).partida).toMatchObject({ vez: 1, perdemAProximaVez: [0] });
    const primeira = tacar(beto, tranquila(beto), ana);
    expect(primeira.partida.vez).toBe(1);
    expect(primeira.partida).not.toHaveProperty('perdemAProximaVez');
    expect(tacar(beto, tranquila(beto), ana).partida.vez).toBe(0);
  }, 30_000);

  it('quem entra ou volta depois de a pena do cegar recebe o retrato com a lista', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    tacar(ana, cega(ana), beto);
    const tardio = new ClienteDeTeste(amb, 'Davi').entrar(ana.codigo);
    expect(tardio.conn.ultima('retrato')).toMatchObject({ motivo: 'entrada', seq: 1, partida: { vez: 1, perdemAProximaVez: [0] } });
    ana.sair();
    ana.reconectar();
    expect(ana.conn.ultima('retrato')).toMatchObject({ motivo: 'entrada', partida: { vez: 1, perdemAProximaVez: [0] } });
  }, 30_000);

  it('a sala recusa a tacada que cegou mas esqueceu a pena (partida-diverge), e a mesma tacada com a partida certa passa', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const m = cega(ana);
    expect(m.partida.perdemAProximaVez).toEqual([0]);
    const semPena: Record<string, unknown> = { ...m.partida };
    delete semPena.perdemAProximaVez;
    ana.enviar({ ...m, partida: semPena as unknown as EstadoPartida });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'partida-diverge' });
    expect(beto.conn.todas('tacada-retransmitida')).toHaveLength(0);
    expect(ana.estado).toMatchObject({ vez: 0, seq: 0 });
    ana.enviar(m);
    expect(beto.conn.todas('tacada-retransmitida').at(-1)!.partida).toMatchObject({ vez: 1, perdemAProximaVez: [0] });
  });

  it('o preset de fábrica do mata-mata pune as duas faltas, e criar a sala com a opção do cegar é aceito só no mata-mata', () => {
    expect(MM).toMatchObject({ suicidioNoMataMata: 'perde-proxima-vez', cegarNoMataMata: 'perde-proxima-vez' });
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana');
    ana.enviar(mensagemDeCriar('Ana', '1x1', { ...PRESET_BOTECO.regras, cegarNoMataMata: 'perde-proxima-vez' }));
    expect(ana.ultimoErro).toMatchObject({ codigo: 'regras-invalidas' });
    expect(amb.registro.totalSalas).toBe(0);
  });

  it('no par ou ímpar cegar segue sendo falta com a pena de sempre: nunca aparece lista', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', SEM_LIMITE) as [ClienteDeTeste, ClienteDeTeste];
    const r = tacar(ana, cega(ana), beto);
    expect(r.consequencias.faltas.map((f) => f.nome)).toContain('cegar');
    expect(r.partida).not.toHaveProperty('perdemAProximaVez');
    expect(r.partida.config.modalidade).toBe('par-ou-impar');
  }, 30_000);
});

describe('suicídio e cegar no mata-mata: cada falta tem a sua opção na casa que o anfitrião mandou', () => {
  // As três tacadas que a física acha para a mesa de saída: só cega, só derruba a branca (tocando uma bola) e as duas coisas.
  const TACADAS = {
    cega: (t: MsgTacada) => cegou(t) && !brancaSaiu(t),
    'derruba a branca': (t: MsgTacada) => !cegou(t) && brancaSaiu(t),
    'cega e derruba': (t: MsgTacada) => cegou(t) && brancaSaiu(t),
  };
  type Pena = 'sem-pena' | 'perde-proxima-vez';
  const CASAS: readonly (readonly [string, Pena, Pena])[] = [
    ['as duas ligadas', 'perde-proxima-vez', 'perde-proxima-vez'],
    ['só o suicídio ligado', 'perde-proxima-vez', 'sem-pena'],
    ['só o cegar ligado', 'sem-pena', 'perde-proxima-vez'],
    ['as duas desligadas', 'sem-pena', 'sem-pena'],
  ];
  const casos = CASAS.flatMap(([casa, suicidio, cegar]) =>
    (Object.keys(TACADAS) as (keyof typeof TACADAS)[]).map((tacada) => {
      const cegaNaTacada = tacada !== 'derruba a branca';
      const caiNaTacada = tacada !== 'cega';
      return { casa, suicidio, cegar, tacada, pune: (cegaNaTacada && cegar === 'perde-proxima-vez') || (caiNaTacada && suicidio === 'perde-proxima-vez') };
    }),
  );

  it.each(casos)('$casa, a tacada que $tacada: pune = $pune', ({ suicidio, cegar, tacada, pune }) => {
    const amb = criarAmbiente();
    const regras = { ...MM, suicidioNoMataMata: suicidio, cegarNoMataMata: cegar };
    const [ana, beto] = salaIniciada(amb, '1x1x1', SEM_LIMITE, undefined, regras) as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
    const r = tacar(ana, acharTacada(ana.visao!, TACADAS[tacada], [4, 2, 1, 8, 6, 0.5]), beto);
    expect(r.partida.vez).toBe(1);
    if (pune) expect(r.partida.perdemAProximaVez).toEqual([0]);
    else expect(r.partida).not.toHaveProperty('perdemAProximaVez');
  }, 30_000);
});

describe('suicídio no mata-mata: a pena não passa para a partida seguinte', () => {
  it('uma partida que termina com sobra da lista nasce limpa na nova partida (retrato nova-partida e entrada depois)', () => {
    const fimComSobra = (p: EstadoPartida): ResultadoRegras => ({
      partida: { ...p, fase: 'fim', vencedor: 0, naMesa: [], perdemAProximaVez: [1] },
      consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1, vencedor: 0, texto: 'fim' },
    });
    const amb = criarAmbiente({}, { regras: { novaPartida, aplicarTacada: (p) => fimComSobra(p) } });
    const [ana, beto] = salaIniciada(amb, '1x1', SEM_LIMITE, undefined, MM) as [ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    const mesaVazia = { bolas: v.mesa.bolas.map((b) => ({ ...b, naMesa: false })) };
    ana.enviar({ ...tranquila(ana), partida: fimComSobra(v.partida).partida, mesa: mesaVazia });
    expect(ana.erros).toEqual([]);
    expect(beto.conn.todas('tacada-retransmitida').at(-1)!.partida).toMatchObject({ fase: 'fim', perdemAProximaVez: [1] });

    ana.enviar({ tipo: 'nova-partida' });
    const retrato = beto.conn.ultima('retrato')!;
    expect(retrato).toMatchObject({ motivo: 'nova-partida', seq: 0 });
    expect(retrato.partida).not.toHaveProperty('perdemAProximaVez');
    beto.sair();
    beto.reconectar();
    expect(beto.conn.ultima('retrato')!.partida).not.toHaveProperty('perdemAProximaVez');
  }, 30_000);
});
