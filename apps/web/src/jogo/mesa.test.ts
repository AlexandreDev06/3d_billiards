import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, bolaParada, mesaInicial, pontoDeSaida, type EstadoMesa } from '@sinuca/fisica';
import { aplicarConsequencias, colocarBola, garantirBolao, pontoDoLugar } from './mesa';

const { mesa: medidas } = CONFIG_FISICA_PADRAO;
const ARRUMACAO = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

const bola = (mesa: EstadoMesa, id: number) => mesa.bolas.find((b) => b.id === id)!;
const sobrepoe = (mesa: EstadoMesa) => {
  const naMesa = mesa.bolas.filter((b) => b.naMesa);
  for (const a of naMesa) {
    for (const b of naMesa) {
      if (a.id >= b.id) continue;
      const d = Math.hypot(a.posicao.x - b.posicao.x, a.posicao.z - b.posicao.z);
      if (d < 0.054 - 1e-6) return true;
    }
  }
  return false;
};

describe('aplicarConsequencias', () => {
  it('retirar tira a bola da mesa e deixa as outras como estavam', () => {
    const inicio = mesaInicial(ARRUMACAO);
    const fim = aplicarConsequencias(inicio, { retirar: [5], recolocar: [] });
    expect(bola(fim, 5).naMesa).toBe(false);
    expect(fim.bolas.filter((b) => b.naMesa)).toHaveLength(inicio.bolas.length - 1);
    expect(bola(fim, 6)).toBe(bola(inicio, 6));
  });

  it('não muta a mesa de entrada', () => {
    const inicio = mesaInicial(ARRUMACAO);
    const copia = structuredClone(inicio);
    aplicarConsequencias(inicio, { retirar: [5], recolocar: [{ bola: 7, lugar: 'marca-saida' }] });
    expect(inicio).toEqual(copia);
  });

  it('recolocar põe o bolão que caiu de volta na marca da saída, parado e na mesa', () => {
    const caiu: EstadoMesa = { bolas: mesaInicial(ARRUMACAO).bolas.map((b) => (b.id === ID_BOLAO ? { ...b, naMesa: false } : b)) };
    const fim = aplicarConsequencias(caiu, { retirar: [], recolocar: [{ bola: ID_BOLAO, lugar: 'marca-saida' }] });
    const saida = pontoDeSaida(medidas);
    expect(bola(fim, ID_BOLAO).naMesa).toBe(true);
    expect(bola(fim, ID_BOLAO).posicao.x).toBeCloseTo(saida.x, 9);
    expect(bola(fim, ID_BOLAO).posicao.z).toBeCloseTo(saida.z, 9);
    expect(bola(fim, ID_BOLAO).movimento).toBe('parada');
  });

  it('com a marca da saída ocupada, a bola fica encostada no que estiver lá, sem sobrepor', () => {
    const saida = pontoDeSaida(medidas);
    const ocupada: EstadoMesa = {
      bolas: [bolaParada(ID_BOLAO, { x: 0.5, z: 0.3 }), bolaParada(8, saida), { ...bolaParada(1, { x: 0, z: 0 }), naMesa: false }],
    };
    const fim = aplicarConsequencias(ocupada, { retirar: [], recolocar: [{ bola: 1, lugar: 'marca-saida' }] });
    expect(bola(fim, 1).naMesa).toBe(true);
    expect(sobrepoe(fim)).toBe(false);
    expect(Math.hypot(bola(fim, 1).posicao.x - saida.x, bola(fim, 1).posicao.z - saida.z)).toBeLessThan(0.06);
  });

  it('duas bolas recolocadas no mesmo lugar não se sobrepõem', () => {
    const base: EstadoMesa = {
      bolas: [bolaParada(ID_BOLAO, { x: 0.5, z: 0.3 }), { ...bolaParada(1, { x: 0, z: 0 }), naMesa: false }, { ...bolaParada(2, { x: 0, z: 0 }), naMesa: false }],
    };
    const fim = aplicarConsequencias(base, {
      retirar: [],
      recolocar: [
        { bola: 1, lugar: 'tabela-lado-saida' },
        { bola: 2, lugar: 'tabela-lado-saida' },
      ],
    });
    expect(bola(fim, 1).naMesa && bola(fim, 2).naMesa).toBe(true);
    expect(sobrepoe(fim)).toBe(false);
  });

  it('a bola retirada libera o lugar antes de recolocar: a recolocada fica exatamente nele', () => {
    const saida = pontoDeSaida(medidas);
    const ocupada: EstadoMesa = {
      bolas: [{ ...bolaParada(ID_BOLAO, { x: 0.5, z: 0.3 }), naMesa: false }, bolaParada(8, saida)],
    };
    const fim = aplicarConsequencias(ocupada, { retirar: [8], recolocar: [{ bola: ID_BOLAO, lugar: 'marca-saida' }] });
    expect(bola(fim, 8).naMesa).toBe(false);
    expect(bola(fim, ID_BOLAO).posicao.x).toBeCloseTo(saida.x, 9);
    expect(bola(fim, ID_BOLAO).posicao.z).toBeCloseTo(saida.z, 9);
  });

  it('recolocar uma bola que a mesa ainda não tem cria a bola', () => {
    const fim = aplicarConsequencias({ bolas: [bolaParada(ID_BOLAO, { x: 0.5, z: 0 })] }, { retirar: [], recolocar: [{ bola: 1, lugar: 'tabela-lado-saida' }] });
    expect(fim.bolas.map((b) => b.id)).toEqual([ID_BOLAO, 1]);
    expect(bola(fim, 1).posicao.x).toBeCloseTo(pontoDoLugar('tabela-lado-saida', 0.027).x, 9);
  });
});

describe('pontoDoLugar', () => {
  it('centro-mesa é o centro do pano', () => {
    expect(pontoDoLugar('centro-mesa', 0.027)).toEqual({ x: 0, z: 0 });
  });

  it('marca-pe é o vértice do triângulo: um quarto do comprimento para o lado do pé, no eixo da mesa', () => {
    expect(pontoDoLugar('marca-pe', 0.027)).toEqual({ x: medidas.comprimento / 4, z: 0 });
  });

  it('a bola recolocada na marca do pé fica nela quando está livre, e encostada quando o triângulo a ocupa', () => {
    const livre = aplicarConsequencias({ bolas: [bolaParada(ID_BOLAO, { x: -0.5, z: 0.3 })] }, { retirar: [], recolocar: [{ bola: 8, lugar: 'marca-pe' }] });
    expect(bola(livre, 8).posicao).toMatchObject({ x: medidas.comprimento / 4, z: 0 });
    const ocupado = aplicarConsequencias(mesaInicial(ARRUMACAO), { retirar: [8], recolocar: [{ bola: 8, lugar: 'marca-pe' }] });
    expect(sobrepoe(ocupado)).toBe(false);
    expect(Math.hypot(bola(ocupado, 8).posicao.x - medidas.comprimento / 4, bola(ocupado, 8).posicao.z)).toBeLessThan(0.07);
  });

  it('a bola recolocada no centro fica nele quando está livre, e encostada quando não está', () => {
    const livre = aplicarConsequencias({ bolas: [bolaParada(ID_BOLAO, { x: 0.5, z: 0.3 })] }, { retirar: [], recolocar: [{ bola: 4, lugar: 'centro-mesa' }] });
    expect(bola(livre, 4).posicao).toMatchObject({ x: 0, z: 0 });
    const ocupado = aplicarConsequencias(
      { bolas: [bolaParada(ID_BOLAO, { x: 0.5, z: 0.3 }), bolaParada(9, { x: 0, z: 0 })] },
      { retirar: [], recolocar: [{ bola: 4, lugar: 'centro-mesa' }] },
    );
    expect(sobrepoe(ocupado)).toBe(false);
    expect(Math.hypot(bola(ocupado, 4).posicao.x, bola(ocupado, 4).posicao.z)).toBeLessThan(0.06);
  });
});

describe('colocarBola', () => {
  it('a orientação volta à de fábrica na bola recolocada', () => {
    const mesa: EstadoMesa = { bolas: [{ ...bolaParada(ID_BOLAO, { x: 0, z: 0 }), naMesa: false, orientacao: { x: 0.5, y: 0.5, z: 0.5, w: 0.5 } }] };
    expect(bola(colocarBola(mesa, ID_BOLAO, 'marca-saida'), ID_BOLAO).orientacao).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });
});

describe('garantirBolao', () => {
  it('devolve a mesma mesa quando o bolão está nela', () => {
    const mesa = mesaInicial(ARRUMACAO);
    expect(garantirBolao(mesa)).toBe(mesa);
  });

  it('põe o bolão na marca da saída (e avisa) se as regras não o devolveram', () => {
    const aviso = console.warn;
    const avisos: unknown[] = [];
    console.warn = (...args: unknown[]) => avisos.push(args);
    try {
      const sem: EstadoMesa = { bolas: mesaInicial(ARRUMACAO).bolas.map((b) => (b.id === ID_BOLAO ? { ...b, naMesa: false } : b)) };
      const fim = garantirBolao(sem);
      expect(bola(fim, ID_BOLAO).naMesa).toBe(true);
      expect(avisos).toHaveLength(1);
    } finally {
      console.warn = aviso;
    }
  });
});
