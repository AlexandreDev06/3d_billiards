import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TACO } from '@sinuca/fisica';
import { SKINS_DE_TACO } from '@sinuca/protocolo';
import { aparenciaDoTaco } from './aparencia-do-taco';

const IDS_DE_SKIN_DO_TACO = SKINS_DE_TACO.map((s) => s.id);
import { descartar } from './descartar';
import { corDaPontaDoTaco, criarTaco, definirGizDoTaco, definirHaloDoTaco, definirSegmentosDoTaco, definirSkinDoTaco, gizDoTaco, haloDoTaco, marcarTacoErrado, segmentosDoTaco, skinDoTaco } from './taco';

describe('taco: marca de bola errada', () => {
  it('nasce sem a marca vermelha', () => {
    const taco = criarTaco(TACO);
    expect(taco.getObjectByName('taco-alerta')?.visible).toBe(false);
  });

  it('a marca cobre o taco todo, um pouco mais grossa, e liga e desliga', () => {
    const taco = criarTaco(TACO);
    marcarTacoErrado(taco, true);
    const alerta = taco.getObjectByName('taco-alerta') as THREE.Mesh;
    expect(alerta.visible).toBe(true);
    expect(alerta.scale.x).toBe(1);
    expect(alerta.scale.y).toBeGreaterThan(1);
    expect(alerta.scale.z).toBeGreaterThan(1);
    marcarTacoErrado(taco, false);
    expect(alerta.visible).toBe(false);
  });

  it('o material da marca é vermelho e não entra na troca de materiais por qualidade (não é Standard/Physical)', () => {
    const alerta = criarTaco(TACO).getObjectByName('taco-alerta') as THREE.Mesh;
    const material = alerta.material as THREE.MeshBasicMaterial;
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(material.color.r).toBeGreaterThan(0.8);
    expect(material.color.g).toBeLessThan(0.3);
  });

  it('marcar um objeto sem a marca não faz nada', () => {
    expect(() => marcarTacoErrado(new THREE.Group(), true)).not.toThrow();
  });
});

describe('taco: peças, skins, giz e qualidade', () => {
  const MALHAS = ['sola', 'virola', 'haste', 'junta', 'antebraco', 'punho', 'anel', 'base', 'borracha'];
  const malha = (taco: THREE.Group, nome: string): THREE.Mesh => taco.getObjectByName(`taco-${nome}`) as THREE.Mesh;

  it('tem as nove peças de ponta a cabo, mais a casca, dentro das medidas de TACO', () => {
    const taco = criarTaco(TACO);
    for (const nome of MALHAS) expect(malha(taco, nome), nome).toBeInstanceOf(THREE.Mesh);
    expect(taco.children).toHaveLength(MALHAS.length + 1);
    const caixa = new THREE.Box3();
    for (const nome of MALHAS) caixa.union(new THREE.Box3().setFromObject(malha(taco, nome)));
    // A ponta na origem e o cabo a TACO.comprimento, ao longo de -X; a grossura nunca passa do cone de TACO por mais que a sobra.
    expect(caixa.max.x).toBeCloseTo(0, 6);
    expect(caixa.min.x).toBeCloseTo(-TACO.comprimento, 4);
    expect(caixa.max.y).toBeLessThanOrEqual(TACO.raioBase * 1.045 + 1e-6);
    expect(caixa.max.y).toBeGreaterThan(TACO.raioBase * 0.95);
  });

  it('a casca vermelha acompanha a forma nova: um perfil só, de ponta a cabo, um pouco mais grosso', () => {
    const taco = criarTaco(TACO);
    const alerta = taco.getObjectByName('taco-alerta') as THREE.Mesh;
    alerta.geometry.computeBoundingBox();
    expect(alerta.geometry.boundingBox!.min.x).toBeCloseTo(-TACO.comprimento, 4);
    expect(alerta.geometry.boundingBox!.max.x).toBeCloseTo(0, 6);
    expect(alerta.geometry.boundingBox!.max.y).toBeCloseTo(TACO.raioBase, 3);
    expect(alerta.scale.y).toBeGreaterThan(1.04);
  });

  it('as oito skins se montam, cada uma com os materiais físicos e as texturas que pede', () => {
    for (const id of IDS_DE_SKIN_DO_TACO) {
      const taco = criarTaco(TACO, { skin: id, escalaTextura: 0.5 });
      expect(skinDoTaco(taco)).toBe(id);
      for (const nome of MALHAS) expect(malha(taco, nome).material, `${id} ${nome}`).toBeInstanceOf(THREE.MeshStandardMaterial);
      descartar(taco);
    }
  });

  it('o id desconhecido cai na clássica; sem id, também', () => {
    expect(skinDoTaco(criarTaco(TACO, { skin: 'platina' }))).toBe('classico');
    expect(skinDoTaco(criarTaco(TACO))).toBe('classico');
  });

  it('o verniz: o material da haste tem clearcoat (o nível que não o tem troca por standard depois)', () => {
    const haste = malha(criarTaco(TACO), 'haste').material as THREE.MeshPhysicalMaterial;
    expect(haste).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    expect(haste.clearcoat).toBeGreaterThan(0);
    expect(haste.map).toBeInstanceOf(THREE.DataTexture);
  });

  it('o neon acende: emissiva na haste e no antebraço', () => {
    const taco = criarTaco(TACO, { skin: 'neon', escalaTextura: 0.5 });
    const antebraco = malha(taco, 'antebraco').material as THREE.MeshPhysicalMaterial;
    expect(antebraco.emissiveMap).toBeInstanceOf(THREE.DataTexture);
    expect((malha(taco, 'haste').material as THREE.MeshPhysicalMaterial).emissiveMap).toBeInstanceOf(THREE.DataTexture);
    expect((malha(taco, 'junta').material as THREE.MeshPhysicalMaterial).emissiveIntensity).toBeGreaterThan(1);
  });

  it('a troca de skin muda as mesmas malhas, devolve os materiais que saíram e solta as texturas antigas', () => {
    const taco = criarTaco(TACO, { escalaTextura: 0.5 });
    const haste = malha(taco, 'haste');
    const antes = haste.material as THREE.MeshPhysicalMaterial;
    const texturaAntiga = antes.map!;
    let soltas = 0;
    texturaAntiga.addEventListener('dispose', () => soltas++);
    const saiu = definirSkinDoTaco(taco, 'ouro');
    expect(skinDoTaco(taco)).toBe('ouro');
    expect(malha(taco, 'haste')).toBe(haste);
    expect(haste.material).not.toBe(antes);
    expect((haste.material as THREE.MeshPhysicalMaterial).metalness).toBeGreaterThan(0.9);
    expect(saiu).toContain(antes);
    expect(saiu).toHaveLength(MALHAS.length);
    expect(soltas).toBe(1);
    expect(definirSkinDoTaco(taco, 'ouro')).toEqual([]); // a mesma: nada a fazer
    expect(definirSkinDoTaco(taco, 'platina')).toHaveLength(MALHAS.length); // desconhecida: volta à clássica
    expect(skinDoTaco(taco)).toBe('classico');
  });

  it('o giz na ponta: azul cheio com giz, couro aparecendo quando gasta; a cor vai para o material que estiver na malha', () => {
    const taco = criarTaco(TACO);
    const sola = malha(taco, 'sola');
    const aparencia = aparenciaDoTaco('classico');
    const cheio = corDaPontaDoTaco(aparencia.ponta.couro, aparencia.ponta.giz, 1);
    const vazio = corDaPontaDoTaco(aparencia.ponta.couro, aparencia.ponta.giz, 0);
    expect(cheio.getHex()).toBe(aparencia.ponta.giz);
    expect(vazio.getHex()).toBe(aparencia.ponta.couro);
    expect(cheio.b).toBeGreaterThan(cheio.r * 1.5);
    expect(vazio.r).toBeGreaterThan(vazio.b);
    const meio = corDaPontaDoTaco(aparencia.ponta.couro, aparencia.ponta.giz, 0.3);
    expect(meio.b).toBeGreaterThan(vazio.b);
    expect(meio.b).toBeLessThan(cheio.b);

    const desenhar = (material: THREE.Material): number => {
      sola.onBeforeRender({} as THREE.WebGLRenderer, {} as THREE.Scene, {} as THREE.Camera, sola.geometry, material, {} as THREE.Group);
      return (material as THREE.MeshStandardMaterial).color.getHex();
    };
    expect(desenhar(sola.material as THREE.Material)).toBe(aparencia.ponta.giz); // nasce com giz cheio
    definirGizDoTaco(taco, 0);
    expect(gizDoTaco(taco)).toBe(0);
    expect(desenhar(sola.material as THREE.Material)).toBe(aparencia.ponta.couro);
    // Uma variante do nível de qualidade (outro material na malha) também recebe a cor.
    const variante = new THREE.MeshLambertMaterial();
    expect(desenhar(variante)).toBe(aparencia.ponta.couro);
    definirGizDoTaco(taco, 1);
    expect(desenhar(variante)).toBe(aparencia.ponta.giz);
  });

  it('o giz fora de 0 a 1 ou inválido se limita; a troca de skin leva a ponta para as cores da skin com o mesmo nível', () => {
    const taco = criarTaco(TACO);
    definirGizDoTaco(taco, 7);
    expect(gizDoTaco(taco)).toBe(1);
    definirGizDoTaco(taco, -3);
    expect(gizDoTaco(taco)).toBe(0);
    definirGizDoTaco(taco, Number.NaN);
    expect(gizDoTaco(taco)).toBe(0);
    definirSkinDoTaco(taco, 'neon');
    expect(gizDoTaco(taco)).toBe(0);
  });

  it('menos lados nos níveis baixos: refaz a geometria de todas as peças e solta a antiga', () => {
    const taco = criarTaco(TACO, { segmentos: 32 });
    const haste = malha(taco, 'haste');
    const contagem = (): number => haste.geometry.getAttribute('position').count;
    const antes = contagem();
    const antiga = haste.geometry;
    let soltas = 0;
    antiga.addEventListener('dispose', () => soltas++);
    definirSegmentosDoTaco(taco, 14);
    expect(segmentosDoTaco(taco)).toBe(14);
    expect(contagem()).toBeLessThan(antes / 2);
    expect(soltas).toBe(1);
    definirSegmentosDoTaco(taco, 14); // o mesmo: nada
    expect(soltas).toBe(1);
  });

  it('o brilho do neon: uma casca aditiva que não faz sombra, só na skin neon e só se o nível deixa', () => {
    const neon = criarTaco(TACO, { skin: 'neon', escalaTextura: 0.5 });
    const halo = haloDoTaco(neon) as THREE.Mesh;
    expect(halo).toBeInstanceOf(THREE.Mesh);
    expect(halo.name).toBe('taco-halo');
    const material = halo.material as THREE.ShaderMaterial;
    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.depthWrite).toBe(false);
    expect(halo.userData.semSombra).toBe(true);
    expect(halo.castShadow).toBe(false);
    // Mais grossa que a haste, para o brilho passar do contorno.
    halo.geometry.computeBoundingBox();
    expect(halo.geometry.boundingBox!.max.y).toBeGreaterThan(TACO.raioPonta * 2);
    for (const id of IDS_DE_SKIN_DO_TACO.filter((i) => i !== 'neon')) expect(haloDoTaco(criarTaco(TACO, { skin: id, escalaTextura: 0.5 })), id).toBeNull();
    expect(haloDoTaco(criarTaco(TACO, { skin: 'neon', halo: false, escalaTextura: 0.5 }))).toBeNull();
  });

  it('ligar e desligar o brilho solta a casca; a troca de skin leva ou tira o brilho; o pedido do nível vale para a skin seguinte', () => {
    const taco = criarTaco(TACO, { skin: 'neon', escalaTextura: 0.5 });
    const casca = haloDoTaco(taco) as THREE.Mesh;
    let soltas = 0;
    casca.geometry.addEventListener('dispose', () => soltas++);
    definirHaloDoTaco(taco, false);
    expect(haloDoTaco(taco)).toBeNull();
    expect(taco.getObjectByName('taco-halo')).toBeUndefined();
    expect(soltas).toBe(1);
    definirHaloDoTaco(taco, true);
    expect(haloDoTaco(taco)).not.toBeNull();
    // Nível sem brilho: a skin neon que entrar depois também nasce sem.
    definirHaloDoTaco(taco, false);
    definirSkinDoTaco(taco, 'ouro');
    definirSkinDoTaco(taco, 'neon');
    expect(haloDoTaco(taco)).toBeNull();
    definirHaloDoTaco(taco, true);
    expect(haloDoTaco(taco)).not.toBeNull();
    definirSkinDoTaco(taco, 'classico');
    expect(haloDoTaco(taco)).toBeNull();
  });

  it('o brilho acompanha os lados do nível', () => {
    const taco = criarTaco(TACO, { skin: 'neon', segmentos: 32, escalaTextura: 0.5 });
    const halo = haloDoTaco(taco) as THREE.Mesh;
    const antes = halo.geometry.getAttribute('position').count;
    definirSegmentosDoTaco(taco, 14);
    expect(halo.geometry.getAttribute('position').count).toBeLessThan(antes);
  });

  it('descartar solta tudo: geometrias, materiais e texturas', () => {
    const taco = criarTaco(TACO, { escalaTextura: 0.5 });
    const haste = malha(taco, 'haste');
    let soltos = 0;
    haste.geometry.addEventListener('dispose', () => soltos++);
    (haste.material as THREE.Material).addEventListener('dispose', () => soltos++);
    (haste.material as THREE.MeshPhysicalMaterial).map!.addEventListener('dispose', () => soltos++);
    descartar(taco);
    expect(soltos).toBe(3);
  });

  it('todo material do taco some perto da câmera (gancho de compilação), até a casca vermelha', () => {
    const taco = criarTaco(TACO, { escalaTextura: 0.5 });
    taco.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      expect(Object.prototype.hasOwnProperty.call(o.material, 'onBeforeCompile'), o.name).toBe(true);
      expect((o.material as THREE.Material).customProgramCacheKey()).toContain('sumir-perto');
    });
  });
});
