import { Vector3, type MeshPhysicalMaterial, type SkinnedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import { quadroVazio } from '@sinuca/personagens';
import { CONFIG_WEB } from '../config';
import { balaoDoArtista } from '../maos/para-testes';
import { estadoVazioDoBalao, type EstadoDoBalao } from './balao';
import { BaloesDoArtista } from './balao-do-artista';

const BASE = await balaoDoArtista();
const novo = (quantos = 4): BaloesDoArtista => new BaloesDoArtista(CONFIG_WEB.baloes, BASE, 'alto', () => 0.5, quantos);
const estado = (mudancas: Partial<EstadoDoBalao> = {}): EstadoDoBalao => ({ ...estadoVazioDoBalao(), escala: 1, cor: 0x3aa0ff, ...mudancas });
const peso = (m: SkinnedMesh, forma: string): number => m.morphTargetInfluences![m.morphTargetDictionary![forma]!]!;
const malhas = (b: BaloesDoArtista, i: number): SkinnedMesh[] => {
  const achadas: SkinnedMesh[] = [];
  b.grupo.children[i]!.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh && o.visible) achadas.push(o as SkinnedMesh);
  });
  return achadas;
};

/** Passa `s` segundos de relógio da página, quadro a quadro. */
function passar(b: BaloesDoArtista, i: number, e: EstadoDoBalao, s: number, passo = 1 / 30): void {
  const fim = e.tempoS + s;
  while (e.tempoS < fim - 1e-9) {
    e.tempoS += passo;
    b.mostrar(i, e);
  }
}

describe('BaloesDoArtista', () => {
  it('nasce escondido, aparece com escala e some com escala zero', () => {
    const b = novo();
    expect(b.quantos).toBe(4);
    for (let i = 0; i < 4; i++) expect(b.visivel(i)).toBe(false);
    b.mostrar(1, estado({ x: 1, y: 0.5, z: -0.3 }));
    expect(b.visivel(1)).toBe(true);
    const g = b.grupo.children[1]!;
    expect([g.position.x, g.position.y, g.position.z]).toEqual([1, 0.5, -0.3]);
    b.mostrar(1, estado({ escala: 0 }));
    expect(b.visivel(1)).toBe(false);
    b.descartar();
  });

  it('o tamanho segue a escala, a largura e a altura; o giro, o yaw', () => {
    const b = novo();
    b.mostrar(0, estado({ largura: 2, altura: 3, escala: 0.5, yaw: 0.7 }));
    const g = b.grupo.children[0]!;
    expect(g.scale.toArray()).toEqual([1, 1.5, 1]);
    expect(g.rotation.y).toBeCloseTo(0.7, 9);
    b.descartar();
  });

  it('cada balão tem a sua cor de equipe, só no látex', () => {
    const b = novo();
    b.mostrar(0, estado({ cor: 0xff0000 }));
    b.mostrar(1, estado({ cor: 0x00ff00 }));
    const latex = (i: number) => malhas(b, i).map((m) => m.material as MeshPhysicalMaterial).find((m) => m.name === 'latex_glb')!;
    expect(latex(0).color.getHex()).toBe(0xff0000);
    expect(latex(1).color.getHex()).toBe(0x00ff00);
    b.mostrar(0, estado({ cor: 0x0000ff }));
    expect(latex(0).color.getHex()).toBe(0x0000ff);
    b.descartar();
  });

  it('a cara do estado vai para as formas, com mistura suave', () => {
    const b = novo();
    const e = estado({ cara: 'sorriso' });
    passar(b, 0, e, 0.04);
    const meio = peso(malhas(b, 0)[0]!, 'cara_sorriso');
    expect(meio).toBeGreaterThan(0);
    expect(meio).toBeLessThan(1);
    passar(b, 0, e, 0.5);
    for (const m of malhas(b, 0)) expect(peso(m, 'cara_sorriso')).toBeCloseTo(1, 6);
    e.cara = 'bravo';
    // o bravo de hoje (a falta) é o susto do arquivo
    passar(b, 0, e, 0.5);
    for (const m of malhas(b, 0)) {
      expect(peso(m, 'cara_susto')).toBeCloseTo(1, 6);
      expect(peso(m, 'cara_bravo')).toBe(0);
    }
    b.descartar();
  });

  it('mirando, o corpo inclina e repete; parado volta à parada', () => {
    const b = novo();
    const e = estado({ mirando: true });
    passar(b, 0, e, 1.5);
    expect(b.diagnostico(0).acao).toBe('balao_inclinar');
    // o trecho repetido nunca passa de 2,8 s nem volta antes de 0,8 s
    passar(b, 0, e, 6);
    expect(b.diagnostico(0).acao).toBe('balao_inclinar');
    expect(b.diagnostico(0).tempoDaAcao).toBeGreaterThanOrEqual(0.8 - 1e-6);
    expect(b.diagnostico(0).tempoDaAcao).toBeLessThanOrEqual(2.8 + 1e-6);
    e.mirando = false;
    passar(b, 0, e, 1);
    expect(b.diagnostico(0).acao).toBeNull();
    b.descartar();
  });

  it('encaçapar: pulinho uma vez, com o sorriso; no fim do rosto volta à parada', () => {
    const b = novo();
    const e = estado({ cara: 'sorriso' });
    passar(b, 0, e, 0.3);
    expect(b.diagnostico(0).acao).toBe('balao_pulinho');
    passar(b, 0, e, 1.5); // o pulinho dura 1,2 s; o sorriso segue pedido e NÃO dispara outro pulinho
    expect(b.diagnostico(0).acao).toBeNull();
    b.descartar();
  });

  it('o susto da falta ou da raspada: balao_susto, uma vez', () => {
    const b = novo();
    const e = estado({ cara: 'susto' });
    passar(b, 0, e, 0.2);
    expect(b.diagnostico(0).acao).toBe('balao_susto');
    passar(b, 0, e, 1.5);
    expect(b.diagnostico(0).acao).toBeNull();
    b.descartar();
  });

  it('no fim: quem ganhou estufa e quem perdeu murcha, e ficam assim', () => {
    const b = novo();
    const g = estado({ fim: 'ganhou', cara: 'sorriso' });
    const p = estado({ fim: 'perdeu', cara: 'triste' });
    passar(b, 0, g, 2.4);
    passar(b, 1, p, 2.4);
    expect(b.diagnostico(0).acao).toBe('balao_estufar');
    expect(b.diagnostico(1).acao).toBe('balao_murchar');
    const larguraDe = (i: number): number => b.grupo.children[i]!.getObjectByName('espinha_2')!.getWorldScale(new Vector3()).x;
    expect(larguraDe(0)).toBeGreaterThan(1.2);
    expect(larguraDe(1)).toBeLessThan(0.95);
    b.descartar();
  });

  it('os olhos miram o ponto pedido e voltam à frente sem ele', () => {
    const b = novo();
    const e = estado({ olhar: { x: 0.3, y: 0.0144, z: 0.5 } });
    passar(b, 0, e, 0.5);
    expect(b.diagnostico(0).olhando).toBe(true);
    e.olhar = null;
    passar(b, 0, e, 0.5);
    expect(b.diagnostico(0).olhando).toBe(false);
    b.descartar();
  });

  it('um salto grande de relógio (aba parada) não dispara a ação inteira de uma vez', () => {
    const b = novo();
    const e = estado({ mirando: true });
    passar(b, 0, e, 0.1);
    e.tempoS += 30;
    b.mostrar(0, e);
    expect(b.diagnostico(0).tempoDaAcao).toBeLessThan(1);
    b.descartar();
  });

  it('reiniciar volta a balão novo: sem ação, cara neutra', () => {
    const b = novo();
    const e = estado({ mirando: true, cara: 'sorriso' });
    passar(b, 0, e, 0.5);
    b.reiniciar();
    expect(b.diagnostico(0).acao).toBeNull();
    expect(b.diagnostico(0).cara).toBe('cara_neutro');
    b.descartar();
  });

  it('o nível baixo mostra a malha baixa; o alto, a alta', () => {
    const b = novo();
    b.mostrar(0, estado());
    expect(malhas(b, 0).every((m) => m.name.startsWith('balao_alta'))).toBe(true);
    b.definirNivel('baixo');
    expect(malhas(b, 0).every((m) => m.name.startsWith('balao_baixa'))).toBe(true);
    b.descartar();
  });

  it('a âncora da mão fica no mundo, ao lado do balão, e não cresce com o corpo', () => {
    const b = novo();
    const e = estado({ x: 1, y: 0.5, z: 0, fim: 'ganhou', cara: 'sorriso' });
    passar(b, 0, e, 0.1);
    const q = quadroVazio();
    b.ancora(0, 'mao_esq', q);
    expect(Math.hypot(q.xx, q.xy, q.xz)).toBeCloseTo(1, 6);
    expect(q.px).toBeGreaterThan(1.05);
    b.descartar();
  });
});
