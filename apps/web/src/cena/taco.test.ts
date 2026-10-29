import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { TACO } from '@sinuca/fisica';
import { SKINS_DE_TACO, padraoDaSemente, type SkinTaco } from '@sinuca/protocolo';
import { aparenciaDoTaco } from './aparencia-do-taco';
import { variacaoDaSemente } from './variacao-da-semente';

const IDS_DE_SKIN_DO_TACO = SKINS_DE_TACO.map((s) => s.id);
import { descartar } from './descartar';
import { SRGBColorSpace } from 'three';
import { DETALHE_COMPLETO, type DetalheDoTaco } from './detalhe-do-taco';
import type { CarregadorDeImagem } from './imagem-pintada';
import { bolasDoTaco, corDaPontaDoTaco, criarTaco, definirDetalheDoTaco, definirGizDoTaco, definirHaloDoTaco, definirSegmentosDoTaco, definirSkinDoTaco, detalheDoTaco, gizDoTaco, haloDoTaco, marcarTacoErrado, segmentosDoTaco, sementeDoTaco, skinDoTaco } from './taco';

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

  it('tem as nove peças de ponta a cabo, mais a casca e o contador, dentro das medidas de TACO', () => {
    const taco = criarTaco(TACO);
    for (const nome of MALHAS) expect(malha(taco, nome), nome).toBeInstanceOf(THREE.Mesh);
    expect(taco.children).toHaveLength(MALHAS.length + 2);
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

  it('todas as skins do catálogo se montam, cada uma com os materiais físicos e as texturas que pede', () => {
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

describe('taco: semente, contador e detalhe por nível (L35)', () => {
  const malha = (taco: THREE.Group, nome: string): THREE.Mesh => taco.getObjectByName(`taco-${nome}`) as THREE.Mesh;
  const pixels = (t: THREE.Texture): Uint8Array => (t.image as { data: Uint8Array }).data;
  const mapaDa = (taco: THREE.Group, nome: string): THREE.DataTexture => (malha(taco, nome).material as THREE.MeshPhysicalMaterial).map as THREE.DataTexture;
  const SIMPLES: DetalheDoTaco = { trama: 'simples', iridescencia: false, animacao: false, imagens: 'cor' };

  it('o taco guarda a skin, a semente e o contador que lhe deram; sem eles, `null`', () => {
    const feito = criarTaco(TACO, { skin: 'tempera', semente: 44, bolas: 7, escalaTextura: 0.5 });
    expect([skinDoTaco(feito), sementeDoTaco(feito), bolasDoTaco(feito)]).toEqual(['tempera', 44, 7]);
    const nu = criarTaco(TACO, { escalaTextura: 0.5 });
    expect([sementeDoTaco(nu), bolasDoTaco(nu)]).toEqual([null, null]);
    expect(sementeDoTaco(new THREE.Group())).toBeNull();
    expect(bolasDoTaco(new THREE.Group())).toBeNull();
  });

  it('a mesma semente dá o mesmo taco; outra semente, outra trama', () => {
    const a = criarTaco(TACO, { skin: 'resina-marmorizada', semente: 10, escalaTextura: 0.5 });
    const b = criarTaco(TACO, { skin: 'resina-marmorizada', semente: 10, escalaTextura: 0.5 });
    const c = criarTaco(TACO, { skin: 'resina-marmorizada', semente: 11, escalaTextura: 0.5 });
    expect(Buffer.from(pixels(mapaDa(a, 'haste'))).equals(Buffer.from(pixels(mapaDa(b, 'haste'))))).toBe(true);
    expect(Buffer.from(pixels(mapaDa(a, 'haste'))).equals(Buffer.from(pixels(mapaDa(c, 'haste'))))).toBe(false);
  });

  it('trocar só a semente refaz os materiais (e devolve os que saíram); a mesma semente não faz nada', () => {
    const taco = criarTaco(TACO, { skin: 'resina-marmorizada', semente: 10, escalaTextura: 0.5 });
    const antes = malha(taco, 'haste').material;
    expect(definirSkinDoTaco(taco, 'resina-marmorizada', 10)).toEqual([]);
    expect(malha(taco, 'haste').material).toBe(antes);
    const saiu = definirSkinDoTaco(taco, 'resina-marmorizada', 11);
    expect(saiu).toContain(antes);
    expect(sementeDoTaco(taco)).toBe(11);
    expect(malha(taco, 'haste').material).not.toBe(antes);
  });

  it('o contador: escondido sem número, mostra a placa com número, e acompanha as bolas sem trocar os materiais do taco', () => {
    const taco = criarTaco(TACO, { skin: 'classico', escalaTextura: 0.5 });
    const placa = taco.getObjectByName('taco-contador') as THREE.Mesh;
    expect(placa).toBeInstanceOf(THREE.Mesh);
    expect(placa.visible).toBe(false);
    const haste = malha(taco, 'haste').material;
    expect(definirSkinDoTaco(taco, 'classico', null, 42)).toEqual([]);
    expect(placa.visible).toBe(true);
    expect(malha(taco, 'haste').material).toBe(haste);
    const material = placa.material as THREE.MeshStandardMaterial;
    const em42 = Uint8Array.from(pixels(material.emissiveMap!));
    definirSkinDoTaco(taco, 'classico', null, 4242);
    expect(Buffer.from(pixels(material.emissiveMap!)).equals(Buffer.from(em42))).toBe(false);
    expect(bolasDoTaco(taco)).toBe(4242);
    definirSkinDoTaco(taco, 'classico', null, null);
    expect(placa.visible).toBe(false);
  });

  it('o contador nasce de `bolas`, perto do anel (no cabo), do lado de cima, e some perto da câmera como o resto', () => {
    const taco = criarTaco(TACO, { bolas: 123, escalaTextura: 0.5 });
    const placa = taco.getObjectByName('taco-contador') as THREE.Mesh;
    expect(placa.visible).toBe(true);
    placa.geometry.computeBoundingBox();
    const caixa = placa.geometry.boundingBox!;
    expect(caixa.max.x).toBeLessThan(0);
    expect(caixa.min.x).toBeGreaterThan(-TACO.comprimento);
    expect(caixa.min.y).toBeGreaterThan(0); // só o lado de cima
    expect((placa.material as THREE.Material).customProgramCacheKey()).toContain('sumir-perto');
    const base = malha(taco, 'base');
    base.geometry.computeBoundingBox();
    expect(caixa.min.x).toBeGreaterThanOrEqual(base.geometry.boundingBox!.min.x - 1e-6);
  });

  it('o nível baixo: trama simples (sem relevo), sem película irisada e sem a luz que corre; a alta tem tudo', () => {
    const taco = criarTaco(TACO, { skin: 'esmeralda-do-pano', escalaTextura: 0.5 });
    const haste = (): THREE.MeshPhysicalMaterial => malha(taco, 'haste').material as THREE.MeshPhysicalMaterial;
    expect(detalheDoTaco(taco)).toEqual(DETALHE_COMPLETO);
    expect(haste().iridescence).toBeGreaterThan(0);
    expect(haste().customProgramCacheKey()).toContain('varredura');
    const antigos = definirDetalheDoTaco(taco, SIMPLES);
    expect(antigos).toHaveLength(MALHAS_COM_MATERIAL);
    expect(detalheDoTaco(taco)).toEqual(SIMPLES);
    expect(haste().iridescence).toBe(0);
    expect(haste().customProgramCacheKey()).not.toContain('varredura');
    expect(definirDetalheDoTaco(taco, { ...SIMPLES })).toEqual([]); // o mesmo: nada a fazer
    definirDetalheDoTaco(taco, DETALHE_COMPLETO);
    expect(haste().iridescence).toBeGreaterThan(0);
  });

  it('o brilho que corre só entra nas skins que o pedem (a Esmeralda); as outras ficam sem a conta a mais', () => {
    const a = criarTaco(TACO, { skin: 'esmeralda-do-pano', escalaTextura: 0.5 });
    expect((malha(a, 'haste').material as THREE.Material).customProgramCacheKey()).toContain('varredura');
    expect((malha(criarTaco(TACO, { skin: 'tempera', escalaTextura: 0.5 }), 'haste').material as THREE.Material).customProgramCacheKey()).not.toContain('varredura');
    const classico = criarTaco(TACO, { escalaTextura: 0.5 });
    expect((malha(classico, 'haste').material as THREE.Material).customProgramCacheKey()).not.toContain('varredura');
  });
});

const MALHAS_COM_MATERIAL = 9;

describe('taco: as imagens pintadas, sob demanda (L35)', () => {
  const malha = (taco: THREE.Group, nome: string): THREE.Mesh => taco.getObjectByName(`taco-${nome}`) as THREE.Mesh;
  const material = (taco: THREE.Group, nome: string): THREE.MeshPhysicalMaterial => malha(taco, nome).material as THREE.MeshPhysicalMaterial;

  /** Um carregador que só entrega quando mandam: guarda os pedidos e as promessas. */
  function carregadorManual() {
    const pedidos: string[] = [];
    const pendentes = new Map<string, (t: THREE.Texture | null) => void>();
    const carregar: CarregadorDeImagem = (url) => {
      pedidos.push(url);
      return new Promise((resolve) => pendentes.set(url, resolve));
    };
    const entregar = (url: string): THREE.Texture => {
      const t = new THREE.Texture();
      pendentes.get(url)!(t);
      return t;
    };
    return { carregar, pedidos, entregar, falhar: (url: string) => pendentes.get(url)!(null) };
  }
  const assentar = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  /** A primeira semente que o catálogo dá como rara numa skin, e a primeira que não dá (ou dá só uma fase). */
  const sementeRara = (skin: SkinTaco): number => Array.from({ length: 1000 }, (_, i) => i).find((i) => padraoDaSemente(skin, i)?.rara === true)!;
  const sementeNaoRara = (skin: SkinTaco): number => Array.from({ length: 1000 }, (_, i) => i).find((i) => padraoDaSemente(skin, i)?.rara !== true)!;

  it('uma skin comum não pede imagem nenhuma', () => {
    const c = carregadorManual();
    criarTaco(TACO, { skin: 'neon', escalaTextura: 0.5, carregarImagem: c.carregar });
    expect(c.pedidos).toEqual([]);
  });

  it('a skin pintada nasce com a trama de código e troca a peça quando a imagem chega: contrato do Pincel (repeat.x = −1, offset.x = 1 + rolo, sRGB, RepeatWrapping em S)', async () => {
    const c = carregadorManual();
    const trocas: number[] = [];
    const taco = criarTaco(TACO, { skin: 'coral', semente: 7, escalaTextura: 0.5, carregarImagem: c.carregar, pastaDasImagens: '/pasta/', aoTrocarMateriais: (a) => void trocas.push(a.length) });
    expect(c.pedidos).toEqual(['/pasta/coral-antebraco.png']);
    const antes = material(taco, 'antebraco');
    expect(antes.map).toBeNull(); // o antebraço da Coral é liso (só a cor) enquanto a arte não chega
    c.entregar('/pasta/coral-antebraco.png');
    await assentar();
    const depois = material(taco, 'antebraco');
    expect(depois).not.toBe(antes);
    expect(depois.map).toBeInstanceOf(THREE.Texture);
    expect(depois.map).not.toBeInstanceOf(THREE.DataTexture);
    expect(depois.map!.repeat.x).toBe(-1);
    expect(depois.map!.repeat.y).toBe(1);
    expect(depois.map!.offset.x).toBeCloseTo(1 + variacaoDaSemente(7).rolo, 6);
    expect(depois.map!.wrapS).toBe(THREE.RepeatWrapping);
    expect(depois.map!.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(depois.map!.colorSpace).toBe(SRGBColorSpace);
    expect(depois.color.getHex()).toBe(0xffffff); // a cor do material não tinge a arte
    expect(trocas).toEqual([1]); // quem guarda variantes dos materiais foi avisado do que saiu
  });

  it('cada taco usa um clone da textura (a imagem na placa de vídeo é uma só, a posição é de cada taco)', async () => {
    const c = carregadorManual();
    const a = criarTaco(TACO, { skin: 'coral', semente: 1, escalaTextura: 0.5, carregarImagem: c.carregar, pastaDasImagens: '/p/' });
    const original = c.entregar('/p/coral-antebraco.png');
    await assentar();
    const b = criarTaco(TACO, { skin: 'coral', semente: 500, escalaTextura: 0.5, carregarImagem: () => Promise.resolve(original), pastaDasImagens: '/p/' });
    await assentar();
    const ma = material(a, 'antebraco').map!;
    const mb = material(b, 'antebraco').map!;
    expect(ma).not.toBe(original);
    expect(mb).not.toBe(ma);
    expect(ma.offset.x).not.toBe(mb.offset.x); // a semente só gira a arte em volta (offset.x)
    expect(original.repeat.x).toBe(1); // o original do cache fica como veio
  });

  it('a semente rara do catálogo pede o `-raro.png`; a comum, o PNG de fábrica (a Howl: Lobo da Geada)', () => {
    const c = carregadorManual();
    criarTaco(TACO, { skin: 'corujao', semente: sementeRara('corujao'), escalaTextura: 0.5, carregarImagem: c.carregar, pastaDasImagens: '/p/' });
    expect(c.pedidos).toEqual(['/p/howl-haste-raro.png', '/p/howl-antebraco-raro.png', '/p/howl-antebraco-raro-emissivo.png', '/p/howl-punho-raro.png', '/p/howl-punho-raro-emissivo.png']);
    const d = carregadorManual();
    criarTaco(TACO, { skin: 'corujao', semente: sementeNaoRara('corujao'), escalaTextura: 0.5, carregarImagem: d.carregar, pastaDasImagens: '/p/' });
    expect(d.pedidos[0]).toBe('/p/howl-haste.png');
  });

  it('o brilho pintado (os olhos da Howl) vira o emissivo da peça, com a intensidade do Pincel', async () => {
    const c = carregadorManual();
    const taco = criarTaco(TACO, { skin: 'corujao', escalaTextura: 0.5, carregarImagem: c.carregar, pastaDasImagens: '/p/' });
    c.entregar('/p/howl-antebraco.png');
    c.entregar('/p/howl-antebraco-emissivo.png');
    await assentar();
    const antebraco = material(taco, 'antebraco');
    expect(antebraco.emissiveMap).toBeInstanceOf(THREE.Texture);
    expect(antebraco.emissiveMap!.repeat.x).toBe(-1);
    expect(antebraco.emissiveIntensity).toBeGreaterThanOrEqual(1);
    expect(antebraco.emissiveIntensity).toBeLessThanOrEqual(3);
  });

  it('o ouro da Dragon Lore vai por máscara de metal: `metalnessMap` linear, sem cor, só nas peças que a têm, e o olho acende menos que o sugerido', async () => {
    const c = carregadorManual();
    const taco = criarTaco(TACO, { skin: 'dragao-das-quinze', semente: sementeNaoRara('dragao-das-quinze'), escalaTextura: 0.5, carregarImagem: c.carregar, pastaDasImagens: '/p/' });
    expect(c.pedidos).toEqual([
      '/p/dragon-lore-haste.png',
      '/p/dragon-lore-haste-emissivo.png',
      '/p/dragon-lore-antebraco.png',
      '/p/dragon-lore-antebraco-emissivo.png',
      '/p/dragon-lore-antebraco-metal.png',
      '/p/dragon-lore-base.png',
      '/p/dragon-lore-base-metal.png',
    ]);
    const antes = material(taco, 'antebraco');
    expect(antes.metalnessMap).toBeNull();
    expect(antes.metalness).toBe(0); // enquanto a arte não chega, a peça não é metal
    for (const f of ['antebraco.png', 'antebraco-emissivo.png', 'antebraco-metal.png']) c.entregar(`/p/dragon-lore-${f}`);
    await assentar();
    const depois = material(taco, 'antebraco');
    expect(depois.metalnessMap).toBeInstanceOf(THREE.Texture);
    expect(depois.metalnessMap!.colorSpace).toBe(THREE.NoColorSpace);
    expect(depois.map!.colorSpace).toBe(SRGBColorSpace);
    expect(depois.metalnessMap!.repeat.x).toBe(-1); // o mesmo contrato de UV das outras imagens
    expect(depois.metalness).toBeGreaterThanOrEqual(0.9);
    expect(depois.emissiveIntensity).toBeLessThan(2); // o olho do dragão saía creme de perto
    expect(material(taco, 'haste').metalnessMap).toBeNull(); // a haste (a chama) não tem máscara
  });

  it('a Dragon Lore rara (Ouro Verde) pede as máscaras de metal rara; o nível baixo não pede nem brilho nem metal', () => {
    const c = carregadorManual();
    criarTaco(TACO, { skin: 'dragao-das-quinze', semente: sementeRara('dragao-das-quinze'), escalaTextura: 0.5, carregarImagem: c.carregar, pastaDasImagens: '/p/' });
    expect(c.pedidos).toContain('/p/dragon-lore-antebraco-raro-metal.png');
    expect(c.pedidos).toContain('/p/dragon-lore-base-raro-metal.png');
    const d = carregadorManual();
    criarTaco(TACO, { skin: 'dragao-das-quinze', escalaTextura: 0.5, carregarImagem: d.carregar, pastaDasImagens: '/p/', detalhe: { trama: 'simples', iridescencia: false, animacao: false, imagens: 'cor' } });
    expect(d.pedidos).toEqual(['/p/dragon-lore-haste.png', '/p/dragon-lore-antebraco.png', '/p/dragon-lore-base.png']);
  });

  it('uma fase com nome (Phase 2 do Doppler) não é rara: nem muda de arquivo nem pede a variante rara', () => {
    expect(padraoDaSemente('obsidiana', 300)).toMatchObject({ nome: 'Phase 2', rara: false });
    const c = carregadorManual();
    criarTaco(TACO, { skin: 'obsidiana', semente: 300, escalaTextura: 0.5, carregarImagem: c.carregar });
    expect(c.pedidos).toEqual([]);
  });

  it('o nível baixo pede só a cor das imagens (nada do brilho)', () => {
    const c = carregadorManual();
    criarTaco(TACO, { skin: 'corujao', escalaTextura: 0.5, carregarImagem: c.carregar, pastaDasImagens: '/p/', detalhe: { trama: 'simples', iridescencia: false, animacao: false, imagens: 'cor' } });
    expect(c.pedidos).toEqual(['/p/howl-haste.png', '/p/howl-antebraco.png', '/p/howl-punho.png']);
  });

  it('imagem que falha: o taco fica com a trama de código, sem lançar', async () => {
    const c = carregadorManual();
    const taco = criarTaco(TACO, { skin: 'coral', escalaTextura: 0.5, carregarImagem: c.carregar, pastaDasImagens: '/p/' });
    const antes = material(taco, 'antebraco');
    c.falhar('/p/coral-antebraco.png');
    await assentar();
    expect(material(taco, 'antebraco')).toBe(antes);
  });

  it('a arte que chega depois de outra troca de skin é jogada fora (a geração mudou)', async () => {
    const c = carregadorManual();
    const taco = criarTaco(TACO, { skin: 'coral', escalaTextura: 0.5, carregarImagem: c.carregar, pastaDasImagens: '/p/' });
    definirSkinDoTaco(taco, 'ouro');
    const doOuro = material(taco, 'antebraco');
    c.entregar('/p/coral-antebraco.png');
    await assentar();
    expect(material(taco, 'antebraco')).toBe(doOuro);
    expect(skinDoTaco(taco)).toBe('ouro');
  });

  it('trocar a semente (outro rolo) ou o nível também joga fora a arte que ainda não chegou', async () => {
    const c = carregadorManual();
    const taco = criarTaco(TACO, { skin: 'coral', semente: 1, escalaTextura: 0.5, carregarImagem: c.carregar, pastaDasImagens: '/p/' });
    definirSkinDoTaco(taco, 'coral', 2);
    const nova = material(taco, 'antebraco');
    c.entregar('/p/coral-antebraco.png'); // as duas gerações pediram a mesma URL: a promessa é a última guardada
    await assentar();
    // Só a geração atual troca o material (uma vez), com o rolo da semente 2.
    expect(material(taco, 'antebraco')).not.toBe(nova);
    expect(material(taco, 'antebraco').map!.offset.x).toBeCloseTo(1 + variacaoDaSemente(2).rolo, 6);
  });
});
