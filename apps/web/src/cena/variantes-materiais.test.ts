import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { sumirPerto } from './sumir-perto';
import { VariantesDeMateriais } from './variantes-materiais';

function cena() {
  const textura = new Texture();
  const fisico = new MeshPhysicalMaterial({ color: 0x0a8a50, map: textura, roughness: 0.93, sheen: 0.8, clearcoat: 1 });
  const metal = new MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.26 });
  const basico = new MeshBasicMaterial({ color: 0 });
  const g = new BoxGeometry();
  const pano = new Mesh(g, fisico);
  const boca = new Mesh(g, metal);
  const preto = new Mesh(g, basico);
  const bola = new Mesh(g, fisico);
  const grupo = new Group();
  grupo.add(pano, boca, preto, bola);
  return { grupo, textura, fisico, metal, basico, pano, boca, preto, bola };
}

describe('VariantesDeMateriais', () => {
  it('físicos desligados: o MeshPhysicalMaterial vira standard com a mesma cor, mapa e rugosidade', () => {
    const c = cena();
    const v = new VariantesDeMateriais([c.grupo]);
    v.aplicar({ materiais: 'standard', ambiente: true });
    const m = c.pano.material as MeshStandardMaterial;
    expect(m).not.toBe(c.fisico);
    expect(m instanceof MeshPhysicalMaterial).toBe(false);
    expect(m.isMeshStandardMaterial).toBe(true);
    expect(m.color.getHex()).toBe(0x0a8a50);
    expect(m.map).toBe(c.textura);
    expect(m.roughness).toBeCloseTo(0.93);
  });

  it('o preto de reflexo baixo e tingido (specularIntensity < 1) ganha metal no standard, para não voltar marrom; o resto não muda', () => {
    const preto = new MeshPhysicalMaterial({ color: 0x090c13, roughness: 0.28, specularIntensity: 0.4, clearcoat: 0.15 });
    const comum = new MeshPhysicalMaterial({ color: 0x336699, roughness: 0.4 });
    const grupo = new Group();
    const a = new Mesh(new BoxGeometry(), preto);
    const b = new Mesh(new BoxGeometry(), comum);
    grupo.add(a, b);
    new VariantesDeMateriais([grupo]).aplicar({ materiais: 'standard', ambiente: true });
    expect((a.material as MeshStandardMaterial).metalness).toBeGreaterThan(0.5);
    expect((a.material as MeshStandardMaterial).metalness).toBeLessThan(0.9); // não é o metal que o ambiente reflete
    expect((b.material as MeshStandardMaterial).metalness).toBe(0);
    expect(preto.metalness).toBe(0); // o original não muda
  });

  it('o látex (userData.latex) com reflexo baixo de propósito não ganha o metal do preto: continua dielétrico no standard', () => {
    const latex = new MeshPhysicalMaterial({ color: 0xff3030, roughness: 0.2, specularIntensity: 0.5, clearcoat: 1, sheen: 0.25 });
    latex.userData.latex = true;
    const preto = new MeshPhysicalMaterial({ color: 0x090c13, roughness: 0.28, specularIntensity: 0.5 });
    const grupo = new Group();
    const a = new Mesh(new BoxGeometry(), latex);
    const b = new Mesh(new BoxGeometry(), preto);
    grupo.add(a, b);
    new VariantesDeMateriais([grupo], [grupo]).aplicar({ materiais: 'standard', ambiente: true });
    const standard = a.material as MeshStandardMaterial;
    expect(standard).not.toBe(latex);
    expect(standard.metalness).toBe(0);
    expect(standard.roughness).toBeCloseTo(0.2);
    expect((b.material as MeshStandardMaterial).metalness).toBeGreaterThan(0.5);
  });

  it('o mesmo original dá a mesma variante (uma só por material, compartilhada entre malhas)', () => {
    const c = cena();
    const v = new VariantesDeMateriais([c.grupo]);
    v.aplicar({ materiais: 'standard', ambiente: true });
    expect(c.bola.material).toBe(c.pano.material);
    expect(v.quantidadeDeVariantes).toBe(1);
  });

  it('voltar aos físicos devolve os originais exatos, sem recriar nada', () => {
    const c = cena();
    const v = new VariantesDeMateriais([c.grupo]);
    v.aplicar({ materiais: 'standard', ambiente: true });
    const variante = c.pano.material;
    v.aplicar({ materiais: 'fisicos', ambiente: true });
    expect(c.pano.material).toBe(c.fisico);
    expect(c.bola.material).toBe(c.fisico);
    v.aplicar({ materiais: 'standard', ambiente: true });
    expect(c.pano.material).toBe(variante);
  });

  it('o metal só muda quando não há ambiente: vira um cinza fosco sem mapa de reflexo; com ambiente fica o original', () => {
    const c = cena();
    const v = new VariantesDeMateriais([c.grupo]);
    v.aplicar({ materiais: 'fisicos', ambiente: true });
    expect(c.boca.material).toBe(c.metal);
    v.aplicar({ materiais: 'fisicos', ambiente: false });
    const fosco = c.boca.material as MeshStandardMaterial;
    expect(fosco).not.toBe(c.metal);
    expect(fosco.metalness).toBeLessThan(0.9);
    expect(fosco.envMap).toBeNull();
    expect(fosco.color.getHex()).toBe(0xdfe3e8);
    expect(c.metal.metalness).toBe(1);
  });

  it('o que não é físico nem metal (basic) nunca é trocado', () => {
    const c = cena();
    const v = new VariantesDeMateriais([c.grupo]);
    v.aplicar({ materiais: 'standard', ambiente: false });
    expect(c.preto.material).toBe(c.basico);
  });

  it('malhas com lista de materiais trocam item a item', () => {
    const c = cena();
    const lista = new Mesh(new BoxGeometry(), [c.fisico, c.basico]);
    c.grupo.add(lista);
    const v = new VariantesDeMateriais([c.grupo]);
    v.aplicar({ materiais: 'standard', ambiente: true });
    const trocados = lista.material as unknown as unknown[];
    expect(trocados[0] instanceof MeshPhysicalMaterial).toBe(false);
    expect(trocados[0]).not.toBe(c.fisico);
    expect(trocados[1]).toBe(c.basico);
    v.aplicar({ materiais: 'fisicos', ambiente: true });
    expect(lista.material).toEqual([c.fisico, c.basico]);
  });

  it('malha que entra na cena depois é vista na próxima troca', () => {
    const c = cena();
    const v = new VariantesDeMateriais([c.grupo]);
    v.aplicar({ materiais: 'standard', ambiente: true });
    const nova = new Mesh(new BoxGeometry(), c.fisico);
    c.grupo.add(nova);
    v.aplicar({ materiais: 'standard', ambiente: true });
    expect(nova.material).toBe(c.pano.material);
  });

  it('dispose solta as variantes mas não as texturas', () => {
    const c = cena();
    const v = new VariantesDeMateriais([c.grupo]);
    v.aplicar({ materiais: 'standard', ambiente: false });
    let variantesSoltas = 0;
    (c.pano.material as MeshStandardMaterial).addEventListener('dispose', () => variantesSoltas++);
    let texturaSolta = false;
    c.textura.addEventListener('dispose', () => (texturaSolta = true));
    v.dispose();
    expect(variantesSoltas).toBe(1);
    expect(texturaSolta).toBe(false);
    expect(v.quantidadeDeVariantes).toBe(0);
  });

  describe('materiais leves', () => {
    function mesaEBolas() {
      const c = cena();
      const piso = new Mesh(c.pano.geometry, new MeshStandardMaterial({ color: 0x3b2b1f, roughness: 0.85, map: c.textura }));
      c.grupo.add(piso);
      const detalhes = new Group();
      const bolaFisica = new Mesh(c.pano.geometry, new MeshPhysicalMaterial({ color: 0xffffff, clearcoat: 1 }));
      detalhes.add(bolaFisica);
      c.grupo.add(detalhes);
      return { ...c, piso, bolaFisica, detalhes };
    }

    it('superfícies grandes viram Lambert (cor, textura e lado), as de detalhe ficam standard', () => {
      const c = mesaEBolas();
      const v = new VariantesDeMateriais([c.grupo], [c.detalhes]);
      v.aplicar({ materiais: 'leves', ambiente: false });
      const pano = c.pano.material as unknown as MeshLambertMaterial;
      expect(pano instanceof MeshLambertMaterial).toBe(true);
      expect(pano.color.getHex()).toBe(0x0a8a50);
      expect(pano.map).toBe(c.textura);
      expect(c.piso.material instanceof MeshLambertMaterial).toBe(true);
      const bola = c.bolaFisica.material as MeshStandardMaterial;
      expect(bola instanceof MeshLambertMaterial).toBe(false);
      expect(bola.isMeshStandardMaterial).toBe(true);
      expect(bola instanceof MeshPhysicalMaterial).toBe(false);
    });

    it('o pano (panoLeve) vira cor lisa escurecida pelo fator, com a luz própria; os outros guardam a textura', () => {
      const c = mesaEBolas();
      c.fisico.userData.panoLeve = { fator: 0.5, emissiva: [0.1, 0.2, 0.3] };
      const v = new VariantesDeMateriais([c.grupo], [c.detalhes]);
      v.aplicar({ materiais: 'leves', ambiente: false });
      const pano = c.pano.material as unknown as MeshLambertMaterial;
      expect(pano.map).toBeNull();
      expect(pano.emissive.toArray()).toEqual([expect.closeTo(0.1, 6), expect.closeTo(0.2, 6), expect.closeTo(0.3, 6)]);
      expect(pano.color.r).toBeCloseTo(new MeshStandardMaterial({ color: 0x0a8a50 }).color.r * 0.5, 6);
      expect(pano.color.g).toBeCloseTo(new MeshStandardMaterial({ color: 0x0a8a50 }).color.g * 0.5, 6);
      expect(c.fisico.color.getHex()).toBe(0x0a8a50);
      expect((c.piso.material as unknown as MeshLambertMaterial).map).toBe(c.textura);
    });

    it('o metal sem ambiente é o fosco standard; com ambiente e leves continua o original', () => {
      const c = mesaEBolas();
      const v = new VariantesDeMateriais([c.grupo], [c.detalhes]);
      v.aplicar({ materiais: 'leves', ambiente: false });
      const fosco = c.boca.material as MeshStandardMaterial;
      expect(fosco).not.toBe(c.metal);
      expect(fosco instanceof MeshLambertMaterial).toBe(false);
      v.aplicar({ materiais: 'leves', ambiente: true });
      expect(c.boca.material).toBe(c.metal);
    });

    it('subir de leves para físicos devolve os originais exatos (nada de Lambert sobra)', () => {
      const c = mesaEBolas();
      const pisoOriginal = c.piso.material;
      const v = new VariantesDeMateriais([c.grupo], [c.detalhes]);
      v.aplicar({ materiais: 'leves', ambiente: false });
      v.aplicar({ materiais: 'fisicos', ambiente: true });
      expect(c.pano.material).toBe(c.fisico);
      expect(c.piso.material).toBe(pisoOriginal);
      expect(c.boca.material).toBe(c.metal);
    });

    it('standard (média) não toca nos standard de origem nem faz Lambert', () => {
      const c = mesaEBolas();
      const pisoOriginal = c.piso.material;
      const v = new VariantesDeMateriais([c.grupo], [c.detalhes]);
      v.aplicar({ materiais: 'standard', ambiente: true });
      expect(c.piso.material).toBe(pisoOriginal);
      expect(c.pano.material instanceof MeshPhysicalMaterial).toBe(false);
    });
  });
});

describe('VariantesDeMateriais: o taco (peças que acendem e somem perto da câmera)', () => {
  function tacoDeTeste() {
    const neon = new MeshPhysicalMaterial({ color: 0x0d0d10, clearcoat: 1, roughness: 0.22, emissive: 0x19f0ff, emissiveIntensity: 1.5, emissiveMap: new Texture() });
    sumirPerto(neon, { de: 0.03, ate: 0.085 });
    const metal = new MeshPhysicalMaterial({ color: 0xf0c640, metalness: 0.95, roughness: 0.3 });
    sumirPerto(metal, { de: 0.03, ate: 0.085 });
    const g = new BoxGeometry();
    const haste = new Mesh(g, neon);
    const anel = new Mesh(g, metal);
    const taco = new Group();
    taco.add(haste, anel);
    return { taco, neon, metal, haste, anel };
  }

  it('no nível leve o taco vira Lambert (não é mais "detalhe") e leva o brilho próprio e o sumiço perto da câmera', () => {
    const c = tacoDeTeste();
    const v = new VariantesDeMateriais([c.taco], []);
    v.aplicar({ materiais: 'leves', ambiente: true });
    const leve = c.haste.material as unknown as MeshLambertMaterial;
    expect(leve).toBeInstanceOf(MeshLambertMaterial);
    expect(leve.emissive.getHex()).toBe(0x19f0ff);
    expect(leve.emissiveIntensity).toBe(1.5);
    expect(leve.emissiveMap).toBe(c.neon.emissiveMap);
    expect(Object.prototype.hasOwnProperty.call(leve, 'onBeforeCompile')).toBe(true);
    expect(leve.customProgramCacheKey()).toContain('sumir-perto');
    // O metal com reflexo de sala continua metal (sem verniz), e o gancho vai junto.
    const metal = c.anel.material as MeshStandardMaterial;
    expect(metal).toBeInstanceOf(MeshStandardMaterial);
    expect(metal).not.toBeInstanceOf(MeshLambertMaterial);
    expect(metal.metalness).toBeGreaterThan(0.9);
    expect(metal.customProgramCacheKey()).toContain('sumir-perto');
  });

  it('as variantes standard e o metal fosco herdam o gancho de compilação do original', () => {
    const c = tacoDeTeste();
    const v = new VariantesDeMateriais([c.taco], [c.taco]);
    v.aplicar({ materiais: 'standard', ambiente: false });
    expect(c.haste.material).not.toBeInstanceOf(MeshPhysicalMaterial);
    expect((c.anel.material as MeshStandardMaterial).metalness).toBeCloseTo(0.3); // o metal sem reflexo de sala vira fosco
    for (const [nome, malha] of [['standard', c.haste], ['metal fosco', c.anel]] as const) {
      const m = malha.material;
      expect(Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile'), nome).toBe(true);
      expect(m.customProgramCacheKey(), nome).toContain('sumir-perto');
    }
  });

  it('o original sem gancho de compilação não passa nada à variante', () => {
    const c = cena();
    const v = new VariantesDeMateriais([c.grupo]);
    v.aplicar({ materiais: 'standard', ambiente: true });
    expect(Object.prototype.hasOwnProperty.call(c.pano.material, 'onBeforeCompile')).toBe(false);
  });

  it('renovar: com outros materiais nas malhas (skin nova), solta as variantes dos que saíram e faz as dos novos', () => {
    const c = tacoDeTeste();
    const v = new VariantesDeMateriais([c.taco], []);
    v.aplicar({ materiais: 'leves', ambiente: false });
    const lambertAntigo = c.haste.material;
    const soltas: string[] = [];
    lambertAntigo.addEventListener('dispose', () => soltas.push('lambert antigo'));
    const novo = new MeshPhysicalMaterial({ color: 0x336699, roughness: 0.4 });
    c.haste.material = novo; // a troca de skin põe o material novo na mesma malha
    v.renovar(c.taco);
    expect(soltas).toEqual(['lambert antigo']);
    v.aplicar({ materiais: 'leves', ambiente: false });
    expect(c.haste.material).not.toBe(novo);
    expect(c.haste.material).toBeInstanceOf(MeshLambertMaterial);
    expect((c.haste.material as unknown as MeshLambertMaterial).color.getHex()).toBe(0x336699);
    v.aplicar({ materiais: 'fisicos', ambiente: true });
    expect(c.haste.material).toBe(novo);
    // Sem trocar nada, renovar é inofensivo.
    expect(() => v.renovar(c.taco)).not.toThrow();
  });

  it('esquecer solta as variantes e as malhas de uma raiz que saiu (outro nível do boteco), sem tocar nas dos outros', () => {
    const a = cena();
    const b = cena();
    const cenaToda = new Group(); // como o `boteco.grupo`: a raiz registrada fica, o arquivo de dentro vem e vai
    cenaToda.add(a.grupo, b.grupo);
    const v = new VariantesDeMateriais([cenaToda]);
    v.aplicar({ materiais: 'standard', ambiente: true });
    const deB = b.pano.material;
    const discartado: string[] = [];
    (a.pano.material as MeshStandardMaterial).addEventListener('dispose', () => discartado.push('a'));
    v.esquecer(a.grupo);
    cenaToda.remove(a.grupo);
    expect(discartado).toEqual(['a']);
    v.aplicar({ materiais: 'leves', ambiente: false });
    expect(b.pano.material).not.toBe(deB);
    expect((b.pano.material as unknown as MeshLambertMaterial).isMeshLambertMaterial).toBe(true);
    // A malha esquecida não volta ao aplicador (nem vaza memória nele).
    const antes = a.pano.material;
    v.aplicar({ materiais: 'standard', ambiente: true });
    expect(a.pano.material).toBe(antes);
  });
});
