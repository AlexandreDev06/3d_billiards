import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AneisDeBolas } from './aneis-de-bolas';

const RAIO = 0.027;

function alvos(...bolas: { id: number; x: number; z: number }[]): (THREE.Object3D | undefined)[] {
  const lista: (THREE.Object3D | undefined)[] = [];
  for (const b of bolas) {
    const o = new THREE.Object3D();
    o.position.set(b.x, RAIO, b.z);
    lista[b.id] = o;
  }
  return lista;
}

const visiveis = (aneis: AneisDeBolas): number => aneis.grupo.children.filter((c) => c.visible).length;

describe('AneisDeBolas: um anel no pano em volta de cada bola destacada', () => {
  it('começa escondido, com um anel de sobra para cada bola numerada', () => {
    const aneis = new AneisDeBolas({ raioBola: RAIO, cor: 0xffd25a });
    expect(aneis.grupo.children).toHaveLength(15);
    expect(visiveis(aneis)).toBe(0);
  });

  it('mostra um anel por bola, no x e z da bola e rente ao pano', () => {
    const aneis = new AneisDeBolas({ raioBola: RAIO, cor: 0xffd25a, alturaDoPano: 0.0012 });
    aneis.mostrar([3, 9], alvos({ id: 3, x: 0.2, z: -0.1 }, { id: 9, x: -0.4, z: 0.3 }), 0.8);
    expect(visiveis(aneis)).toBe(2);
    const [primeiro, segundo] = aneis.grupo.children.filter((c) => c.visible);
    expect([primeiro!.position.x, primeiro!.position.z]).toEqual([0.2, -0.1]);
    expect([segundo!.position.x, segundo!.position.z]).toEqual([-0.4, 0.3]);
    expect(primeiro!.position.y).toBeCloseTo(0.0012, 6);
  });

  it('segue a bola quando ela se mexe e esconde os anéis que sobram', () => {
    const aneis = new AneisDeBolas({ raioBola: RAIO, cor: 0xffd25a });
    const bolas = alvos({ id: 3, x: 0, z: 0 }, { id: 5, x: 0.5, z: 0 });
    aneis.mostrar([3, 5], bolas, 1);
    bolas[3]!.position.x = 0.1;
    aneis.mostrar([3], bolas, 1);
    expect(visiveis(aneis)).toBe(1);
    expect(aneis.grupo.children.find((c) => c.visible)!.position.x).toBe(0.1);
  });

  it('a intensidade vira a opacidade do material (todos os anéis juntos)', () => {
    const aneis = new AneisDeBolas({ raioBola: RAIO, cor: 0xffd25a, opacidadeMax: 0.8 });
    aneis.mostrar([3], alvos({ id: 3, x: 0, z: 0 }), 0.5);
    const material = (aneis.grupo.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
    expect(material.opacity).toBeCloseTo(0.4, 6);
  });

  it('bola que a cena não tem (ou invisível) fica sem anel', () => {
    const aneis = new AneisDeBolas({ raioBola: RAIO, cor: 0xffd25a });
    const bolas = alvos({ id: 3, x: 0, z: 0 });
    bolas[3]!.visible = false;
    aneis.mostrar([3, 7], bolas, 1);
    expect(visiveis(aneis)).toBe(0);
  });

  it('esconder apaga tudo e dispose solta geometria e material', () => {
    const aneis = new AneisDeBolas({ raioBola: RAIO, cor: 0xffd25a });
    aneis.mostrar([3], alvos({ id: 3, x: 0, z: 0 }), 1);
    aneis.esconder();
    expect(visiveis(aneis)).toBe(0);
    let soltos = 0;
    const mesh = aneis.grupo.children[0] as THREE.Mesh;
    mesh.geometry.addEventListener('dispose', () => soltos++);
    (mesh.material as THREE.Material).addEventListener('dispose', () => soltos++);
    aneis.dispose();
    expect(soltos).toBe(2);
  });
});
