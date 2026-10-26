import { describe, expect, it } from 'vitest';
import type { IdBola } from '@sinuca/fisica';
import type { ConfigRegras, EstadoPartida, Grupo } from '@sinuca/regras';
import { AnunciadorDoCastigo, anuncioDoMomento } from './anuncio-modelo';

interface Pedido {
  readonly final?: ConfigRegras['bolaFinal'];
  readonly vez?: number;
  readonly fase?: EstadoPartida['fase'];
  readonly grupos?: readonly (Grupo | null)[];
  readonly naMesa?: readonly IdBola[];
}

/** Um estado mínimo: o 1×1 com Ana (pares) e Beto (ímpares); só o que a leitura das regras consulta. */
function partida(p: Pedido = {}): EstadoPartida {
  return {
    config: { bolas: '2-14', bolaFinal: p.final ?? 8 } as ConfigRegras,
    jogadores: [
      { id: 'a', nome: 'Ana', equipe: 0 },
      { id: 'b', nome: 'Beto', equipe: 1 },
    ],
    vez: p.vez ?? 0,
    grupos: p.grupos ?? ['par', 'impar'],
    fase: p.fase ?? 'grupos',
    naMesa: p.naMesa ?? [8, 3, 5, 7],
    encacapadas: [],
    retiradas: [],
    vencedor: null,
  } as unknown as EstadoPartida;
}

describe('anuncioDoMomento', () => {
  it('quem tirou todo o grupo e está na vez recebe o aviso com o número da bola final das regras', () => {
    const a = anuncioDoMomento(partida({ naMesa: [8, 3, 5, 7] }))!;
    expect(a.titulo).toBe('Agora é só a 8!');
    expect(a.bola).toEqual({ id: 8, estilo: 'lisa' });
    expect(a.detalhe).toBe('Ana: só falta a 8. Encaçape-a para vencer.');
  });

  it('o nome vem do pacote de regras (`nomeDaBolaFinal`), nunca fixo: com a bola final 1 o aviso é "Agora é só o castigo!"', () => {
    const a = anuncioDoMomento(partida({ final: 1, naMesa: [1, 3, 5] }))!;
    expect(a.titulo).toBe('Agora é só o castigo!');
    expect(a.detalhe).toBe('Ana: só falta o castigo. Encaçape-o para vencer.');
    expect(a.bola).toEqual({ id: 1, estilo: 'lisa' });
  });

  it('enquanto há bola do grupo na mesa, nada', () => {
    expect(anuncioDoMomento(partida({ naMesa: [8, 4, 3] }))).toBeNull();
  });

  it('com a mesa aberta (grupo a definir), nada', () => {
    expect(anuncioDoMomento(partida({ grupos: [null, null], fase: 'aberta' }))).toBeNull();
  });

  it('só vale para quem tem a vez: o adversário no castigo não avisa quando é a vez de quem ainda tem bolas', () => {
    expect(anuncioDoMomento(partida({ vez: 1, naMesa: [8, 3, 5] }))).toBeNull();
    const b = anuncioDoMomento(partida({ vez: 1, grupos: ['par', 'impar'], naMesa: [8, 2, 4] }))!;
    expect(b.detalhe).toContain('Beto');
  });

  it('na saída e no fim da partida, nada', () => {
    expect(anuncioDoMomento(partida({ fase: 'saida' }))).toBeNull();
    expect(anuncioDoMomento(partida({ fase: 'fim' }))).toBeNull();
  });

  it('casa sem bola final fixa (a última do grupo), nada', () => {
    expect(anuncioDoMomento(partida({ final: 'ultima-do-grupo', naMesa: [8, 3] }))).toBeNull();
  });
});

describe('AnunciadorDoCastigo', () => {
  it('avisa uma vez no começo da vez e não repete enquanto o estado fica igual', () => {
    const a = new AnunciadorDoCastigo();
    expect(a.atualizar(partida({ naMesa: [8, 3, 5] }))?.titulo).toBe('Agora é só a 8!');
    expect(a.atualizar(partida({ naMesa: [8, 3, 5] }))).toBeNull();
    expect(a.atualizar(partida({ naMesa: [8, 3] }))).toBeNull();
  });

  it('avisa quando o jogador entra no castigo no meio da própria vez (encaçapou a última do grupo)', () => {
    const a = new AnunciadorDoCastigo();
    expect(a.atualizar(partida({ naMesa: [8, 4, 3] }))).toBeNull();
    expect(a.atualizar(partida({ naMesa: [8, 3] }))?.bola).toEqual({ id: 8, estilo: 'lisa' });
  });

  it('a vez passa e volta: avisa de novo no começo da vez seguinte dele', () => {
    const a = new AnunciadorDoCastigo();
    expect(a.atualizar(partida({ vez: 0, naMesa: [8, 3, 5] }))).not.toBeNull();
    expect(a.atualizar(partida({ vez: 1, naMesa: [8, 3, 5] }))).toBeNull();
    expect(a.atualizar(partida({ vez: 0, naMesa: [8, 3, 5] }))).not.toBeNull();
  });

  it('se a vez passa para outro que também está no castigo, o outro é avisado', () => {
    const a = new AnunciadorDoCastigo();
    expect(a.atualizar(partida({ vez: 0, naMesa: [8] }))?.detalhe).toContain('Ana');
    expect(a.atualizar(partida({ vez: 1, naMesa: [8] }))?.detalhe).toContain('Beto');
  });

  it('no 2x1 a dupla toda vai à bola final: cada um da roda é avisado no começo da vez dele, e o Beto sozinho no dele', () => {
    const trio = (vez: number): EstadoPartida => ({
      ...partida({ vez, naMesa: [8, 3] }),
      jogadores: [
        { id: 'a', nome: 'Ana', equipe: 0 },
        { id: 'b', nome: 'Beto', equipe: 1 },
        { id: 'c', nome: 'Caio', equipe: 0 },
      ],
      grupos: ['par', 'impar'],
    });
    const a = new AnunciadorDoCastigo();
    expect(a.atualizar(trio(0))?.detalhe).toContain('Ana');
    expect(a.atualizar(trio(0))).toBeNull();
    // Beto ainda tem a 3: sem aviso (e a vez dele zera o aviso da dupla).
    expect(a.atualizar(trio(1))).toBeNull();
    expect(a.atualizar(trio(2))?.detalhe).toContain('Caio');
    expect(a.atualizar(trio(1))).toBeNull();
    expect(a.atualizar(trio(0))?.detalhe).toContain('Ana');
  });

  it('reiniciar (partida nova, retrato da sala) faz o mesmo estado avisar de novo', () => {
    const a = new AnunciadorDoCastigo();
    a.atualizar(partida({ naMesa: [8] }));
    a.reiniciar();
    expect(a.atualizar(partida({ naMesa: [8] }))).not.toBeNull();
  });

  it('o fim da partida zera: a próxima partida avisa de novo na mesma posição', () => {
    const a = new AnunciadorDoCastigo();
    a.atualizar(partida({ naMesa: [8] }));
    expect(a.atualizar(partida({ fase: 'fim' }))).toBeNull();
    expect(a.atualizar(partida({ naMesa: [8] }))).not.toBeNull();
  });
});
