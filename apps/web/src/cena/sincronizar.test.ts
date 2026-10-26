import { describe, expect, it } from 'vitest';
import { bolaParada, type EstadoMesa } from '@sinuca/fisica';
import { sincronizarBolas } from './sincronizar';

function criarAlvo() {
  const alvo = {
    pos: [9, 9, 9],
    rot: [9, 9, 9, 9],
    escala: 0.3,
    visible: true,
    scale: {
      setScalar(valor: number) {
        alvo.escala = valor;
      },
    },
    position: {
      set(x: number, y: number, z: number) {
        alvo.pos = [x, y, z];
      },
    },
    quaternion: {
      set(x: number, y: number, z: number, w: number) {
        alvo.rot = [x, y, z, w];
      },
    },
  };
  return alvo;
}

describe('sincronizarBolas', () => {
  it('copia posição e orientação e mostra as bolas que estão na mesa', () => {
    const alvos = [criarAlvo(), criarAlvo()];
    alvos[1]!.visible = false;
    const mesa: EstadoMesa = {
      bolas: [
        bolaParada(0, { x: 0.5, z: -0.2 }),
        { ...bolaParada(1, { x: -0.1, z: 0.3 }), orientacao: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 } },
      ],
    };
    sincronizarBolas(alvos, mesa);
    expect(alvos[0]!.pos).toEqual([0.5, 0.028, -0.2]);
    expect(alvos[1]!.pos).toEqual([-0.1, 0.027, 0.3]);
    expect(alvos[1]!.rot).toEqual([0.1, 0.2, 0.3, 0.9]);
    expect(alvos[1]!.visible).toBe(true);
  });

  it('devolve o tamanho normal (a bola recolocada depois de cair não fica encolhida)', () => {
    const alvos = [criarAlvo()];
    sincronizarBolas(alvos, { bolas: [bolaParada(0, { x: 0, z: 0 })] });
    expect(alvos[0]!.escala).toBe(1);
  });

  it('esconde a bola fora da mesa e a que o estado nem tem', () => {
    const alvos = [criarAlvo(), criarAlvo(), criarAlvo()];
    const mesa: EstadoMesa = { bolas: [bolaParada(0, { x: 0, z: 0 }), { ...bolaParada(1, { x: 0, z: 0 }), naMesa: false }] };
    sincronizarBolas(alvos, mesa);
    expect(alvos.map((a) => a.visible)).toEqual([true, false, false]);
  });

  it('ignora bola do estado que a cena não tem', () => {
    const mesa: EstadoMesa = { bolas: [bolaParada(0, { x: 0, z: 0 }), bolaParada(5, { x: 0, z: 0 })] };
    expect(() => sincronizarBolas([criarAlvo()], mesa)).not.toThrow();
  });
});
