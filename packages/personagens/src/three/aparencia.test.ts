import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mesh, Texture, Vector3, type MeshPhysicalMaterial, type Object3D, type SkinnedMesh } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { TEMPO_DO_PERFILADOR_MS, provarSemAlocar } from '../alocacao-para-testes';
import { escalaDoAcessorio } from '../escala-do-acessorio';
import { sorteioDeTeste } from '../para-testes';
import { carregarAcessoriosDeBytes, type BaseDeAcessorios } from './acessorios';
import { carregarPersonagemDeRostoDeBytes, type BaseDoRosto } from './carregar-rosto';
import { gerenciadorDeTestes } from './para-testes-three';
import type { PersonagemDeRosto } from './rosto-em-cena';

const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../arte/personagens/exportados');
const bytesDe = (nome: string): ArrayBuffer => {
  const b = readFileSync(resolve(PASTA, nome));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const jsonDe = (nome: string): Record<string, unknown> => JSON.parse(readFileSync(resolve(PASTA, nome), 'utf8')) as Record<string, unknown>;
const OPCOES = { nomesDasMalhas: { alta: 'balao_alta', baixa: 'balao_baixa' }, acaoBase: 'balao_parado', gerenciador: gerenciadorDeTestes() } as const;

let base: BaseDoRosto;
let chapeus: BaseDeAcessorios;
beforeAll(async () => {
  base = await carregarPersonagemDeRostoDeBytes(bytesDe('balao.glb'), { ...OPCOES, meta: jsonDe('balao-meta.json') });
  // No Node o GLTFLoader não decodifica as imagens embutidas: cada material de olho ganha uma textura de mentira com o nome dele, para
  // o teste ver qual textura a esclera e a íris estão usando
  (base as unknown as { gltf: GLTF }).gltf.scene.traverse((o) => {
    const m = (o as Mesh).material as MeshPhysicalMaterial | undefined;
    if (m === undefined || !/^(olho|iris)(_|$)/.test(m.name) || m.map !== null) return;
    m.map = new Texture();
    m.map.name = `${m.name}:cor`;
    m.emissiveMap = new Texture();
    m.emissiveMap.name = `${m.name}:brilho`;
  });
  chapeus = await carregarAcessoriosDeBytes(bytesDe('chapeus.glb'), { meta: jsonDe('chapeus-meta.json'), gerenciador: gerenciadorDeTestes() });
});

const sem = () => 0.5;
const nova = (cor = 0x3aa0ff): PersonagemDeRosto => base.instanciar({ cor, sorteio: sem });
const noDe = (p: PersonagemDeRosto, nome: string): Object3D => p.raiz.getObjectByName(nome)!;
const corpo = (p: PersonagemDeRosto, nivel: 'alta' | 'baixa' = 'alta'): SkinnedMesh => {
  let achada: SkinnedMesh | undefined;
  p.raiz.traverse((o) => {
    if (achada === undefined && (o as SkinnedMesh).isSkinnedMesh && o.name.startsWith(`balao_${nivel}`) && (o as SkinnedMesh).morphTargetDictionary !== undefined) achada = o as SkinnedMesh;
  });
  return achada!;
};
const peso = (m: Mesh, forma: string): number => m.morphTargetInfluences![m.morphTargetDictionary![forma]!]!;
/** O material de olho ou de íris que a malha visível do corpo usa agora. */
const materialDoCorpo = (p: PersonagemDeRosto, nome: 'olho' | 'iris', nivel: 'alta' | 'baixa' = 'alta'): MeshPhysicalMaterial => {
  let achado: MeshPhysicalMaterial | undefined;
  p.raiz.traverse((o) => {
    const m = o as SkinnedMesh;
    if (achado === undefined && m.isSkinnedMesh && o.name.startsWith(`balao_${nivel}`) && (m.material as MeshPhysicalMaterial).name === nome) achado = m.material as MeshPhysicalMaterial;
  });
  return achado!;
};
const malhaDoCorpo = (p: PersonagemDeRosto, nome: 'olho' | 'iris', nivel: 'alta' | 'baixa' = 'alta'): SkinnedMesh => {
  let achada: SkinnedMesh | undefined;
  p.raiz.traverse((o) => {
    const m = o as SkinnedMesh;
    if (achada === undefined && m.isSkinnedMesh && o.name.startsWith(`balao_${nivel}`) && (m.material as MeshPhysicalMaterial).name === nome) achada = m;
  });
  return achada!;
};
/** Anda `quadros` quadros de 1/60 s. */
const andar = (p: PersonagemDeRosto, quadros: number): void => {
  for (let i = 0; i < quadros; i++) p.atualizar(1 / 60);
};

describe('o arquivo dos chapéus (BaseDeAcessorios)', () => {
  it('traz os 8 chapéus do contrato, com malha alta e baixa dentro do orçamento do artista', () => {
    expect(chapeus.ids).toEqual(['chapeu_panama', 'bone_aba_reta', 'cartola', 'gorro_pompom', 'chapeu_palha', 'boina', 'chapeu_festa', 'coroa']);
    for (const id of chapeus.ids) {
      expect(chapeus.triangulos(id, 'alta'), id).toBeLessThanOrEqual(3000);
      expect(chapeus.triangulos(id, 'baixa'), id).toBeLessThanOrEqual(600);
      expect(chapeus.triangulos(id, 'alta'), id).toBeGreaterThan(chapeus.triangulos(id, 'baixa'));
    }
  });

  it('id que o arquivo não tem: `tem` diz que não e `clonar` devolve undefined', () => {
    expect(chapeus.tem('cartola')).toBe(true);
    expect(chapeus.tem('cartolinha')).toBe(false);
    expect(chapeus.tem('toString')).toBe(false);
    expect(chapeus.clonar('cartolinha', 'alta')).toBeUndefined();
  });

  it('a meta que aponta para um nó que o arquivo não tem lança dizendo qual', async () => {
    const m = jsonDe('chapeus-meta.json');
    ((m.chapeus as Record<string, { alta: { no: string } }>).cartola!).alta.no = 'cartola_altaa';
    await expect(carregarAcessoriosDeBytes(bytesDe('chapeus.glb'), { meta: m, gerenciador: gerenciadorDeTestes() })).rejects.toThrow('cartola_altaa');
  });

  it('o clone divide a geometria e os materiais com o arquivo (cada balão não duplica o chapéu na memória)', () => {
    const a = chapeus.clonar('coroa', 'alta')!;
    const b = chapeus.clonar('coroa', 'alta')!;
    expect(a).not.toBe(b);
    const malhas = (o: Object3D): Mesh[] => {
      const r: Mesh[] = [];
      o.traverse((x) => {
        if ((x as Mesh).isMesh) r.push(x as Mesh);
      });
      return r;
    };
    expect(malhas(a).length).toBeGreaterThan(0);
    malhas(a).forEach((m, i) => {
      expect(m.geometry).toBe(malhas(b)[i]!.geometry);
      expect(m.material).toBe(malhas(b)[i]!.material);
    });
  });
});

describe('o balão v3 vestido', () => {
  it('o arquivo permite os quatro recursos da aparência', () => {
    expect(nova().recursos).toMatchObject({ acessorio: true, bigodes: true, estilosDeOlho: true, coresDeOlho: true });
  });

  it('com um arquivo v2 (sem as chaves do v3) a aparência fica desligada e os pedidos devolvem false, sem lançar', async () => {
    const m = jsonDe('balao-meta.json');
    for (const k of ['ancora_chapeu', 'bigodes', 'estilos_de_olho', 'cores_de_olho']) delete m[k];
    m.versao = 2;
    m.formas = { nomes: (m.formas as { nomes: string[] }).nomes.filter((n) => !n.startsWith('estilo_')) };
    const b2 = await carregarPersonagemDeRostoDeBytes(bytesDe('balao.glb'), { ...OPCOES, meta: m });
    const p = b2.instanciar({ cor: 0xffffff, sorteio: sem });
    expect(p.recursos).toMatchObject({ acessorio: false, bigodes: false, estilosDeOlho: false, coresDeOlho: false });
    expect(p.definirAcessorio(chapeus, 'cartola')).toBe(false);
    expect(p.definirBigode('bigodao')).toBe(false);
    expect(p.definirEstiloDeOlho('olho_kawaii')).toBe(false);
    expect(p.definirCorDosOlhos('azul')).toBe(false);
    andar(p, 5);
  });

  it('nasce com a aparência padrão: sem chapéu, sem bigode, olho normal e castanho (a íris do arquivo)', () => {
    const p = nova();
    expect(p.aparencia).toEqual({ acessorio: null, bigode: null, estiloDeOlho: 'olho_normal', corDosOlhos: 'castanho' });
    expect(materialDoCorpo(p, 'iris').color.getHex()).toBe(0xb0702f);
    for (const id of base.meta.bigodes.keys()) {
      for (const no of [`${id}_alta`, `${id}_baixa`]) {
        expect(noDe(p, no).visible, no).toBe(false);
        expect(noDe(p, no).scale.x, no).toBe(0);
      }
    }
    expect(noDe(p, 'estilos_de_olho')).toBeUndefined();
  });

  describe('chapéu', () => {
    it('fica filho da âncora, só o do nível em uso aparece, e o nível baixo troca a malha', () => {
      const p = nova();
      expect(p.definirAcessorio(chapeus, 'cartola')).toBe(true);
      const ancora = noDe(p, 'ancora_chapeu');
      const filhos = ancora.children.filter((c) => c.name.startsWith('cartola'));
      expect(filhos.map((c) => c.name).sort()).toEqual(['cartola_alta', 'cartola_baixa']);
      const visiveis = (): string[] => ancora.children.filter((c) => c.visible).map((c) => c.name);
      expect(visiveis()).toEqual(['cartola_alta']);
      p.definirNivel('baixo');
      expect(visiveis()).toEqual(['cartola_baixa']);
      p.definirNivel('medio');
      expect(visiveis()).toEqual(['cartola_alta']);
      expect(p.aparencia.acessorio).toBe('cartola');
    });

    it('trocar de chapéu esconde o anterior; null tira; id que o arquivo não tem devolve false e deixa o que estava', () => {
      const p = nova();
      p.definirAcessorio(chapeus, 'cartola');
      p.definirAcessorio(chapeus, 'coroa');
      const ancora = noDe(p, 'ancora_chapeu');
      expect(ancora.children.filter((c) => c.visible).map((c) => c.name)).toEqual(['coroa_alta']);
      expect(p.definirAcessorio(chapeus, 'cartolinha')).toBe(false);
      expect(p.aparencia.acessorio).toBe('coroa');
      expect(p.definirAcessorio(chapeus, null)).toBe(true);
      expect(ancora.children.filter((c) => c.visible)).toEqual([]);
      expect(p.aparencia.acessorio).toBeNull();
    });

    it('cada balão tem o seu chapéu (instâncias independentes) e o mesmo chapéu de novo não cria outra malha', () => {
      const a = nova();
      const b = nova();
      a.definirAcessorio(chapeus, 'boina');
      expect(noDe(b, 'ancora_chapeu').children.filter((c) => c.visible)).toEqual([]);
      const antes = noDe(a, 'ancora_chapeu').children.length;
      a.definirAcessorio(chapeus, 'coroa');
      a.definirAcessorio(chapeus, 'boina');
      a.definirAcessorio(chapeus, 'coroa');
      expect(noDe(a, 'ancora_chapeu').children.length).toBe(antes + 2);
    });

    /** A escala do nó da âncora vista no mundo do personagem (a `raiz` em escala 1). */
    const escalaDoNo = (p: PersonagemDeRosto): Vector3 => {
      const ancora = noDe(p, 'ancora_chapeu');
      p.raiz.updateMatrixWorld(true);
      const e = ancora.matrixWorld.elements;
      return new Vector3(Math.hypot(e[0]!, e[1]!, e[2]!), Math.hypot(e[4]!, e[5]!, e[6]!), Math.hypot(e[8]!, e[9]!, e[10]!));
    };
    const escalaDoChapeu = (p: PersonagemDeRosto, nome: string): Vector3 => {
      const c = noDe(p, nome);
      p.raiz.updateMatrixWorld(true);
      const e = c.matrixWorld.elements;
      return new Vector3(Math.hypot(e[0]!, e[1]!, e[2]!), Math.hypot(e[4]!, e[5]!, e[6]!), Math.hypot(e[8]!, e[9]!, e[10]!));
    };

    it('acompanha o estica e amassa pela regra do meta, nos 13 clipes: a escala final é a da regra e nunca passa do piso e do teto', () => {
      const regra = base.meta.ancoraDeAcessorio!;
      const alvo: [number, number, number] = [1, 1, 1];
      let nosVistos = { max: 0, min: 9 };
      for (const acao of base.meta.acoes.keys()) {
        const p = nova();
        p.definirAcessorio(chapeus, 'coroa');
        p.fazerAcao(acao, { entradaS: 0.05, saidaS: 0.1 });
        for (let q = 0; q < 90; q++) {
          p.atualizar(1 / 60);
          const no = escalaDoNo(p);
          nosVistos = { max: Math.max(nosVistos.max, no.y), min: Math.min(nosVistos.min, no.y) };
          escalaDoAcessorio([no.x, no.y, no.z], regra, alvo);
          const c = escalaDoChapeu(p, 'coroa_alta');
          // a escala do chapéu no mundo = escala do nó × a local = a final da regra
          expect(c.x, `${acao} x`).toBeCloseTo(no.x * alvo[0], 3);
          expect(c.y, `${acao} y`).toBeCloseTo(no.y * alvo[1], 3);
          expect(c.z, `${acao} z`).toBeCloseTo(no.z * alvo[2], 3);
          expect(c.x, `${acao} larg`).toBeGreaterThanOrEqual(regra.largura.piso - 1e-3);
          expect(c.x, `${acao} larg`).toBeLessThanOrEqual(regra.largura.teto + 1e-3);
          expect(c.y, `${acao} alt`).toBeGreaterThanOrEqual(regra.altura.piso - 1e-3);
          expect(c.y, `${acao} alt`).toBeLessThanOrEqual(regra.altura.teto + 1e-3);
        }
      }
      // o teste só prova algo se o nó estica e amassa de verdade nesses clipes
      expect(nosVistos.max).toBeGreaterThan(1.25);
      expect(nosVistos.min).toBeLessThan(0.85);
    });

    it('a escala com que o jogo põe o balão em cena não entra na conta (o chapéu e o corpo crescem juntos)', () => {
      const a = base.instanciar({ cor: 0x3aa0ff, sorteio: sem, movimento: false });
      const b = base.instanciar({ cor: 0x3aa0ff, sorteio: sem, movimento: false });
      a.definirAcessorio(chapeus, 'cartola');
      b.definirAcessorio(chapeus, 'cartola');
      b.raiz.scale.set(2.5, 1.7, 2.5);
      b.raiz.rotation.set(0, 0.6, 0.3);
      for (const p of [a, b]) {
        p.fazerAcao('balao_estufar', { entradaS: 0.05, saidaS: 0.1 });
        andar(p, 25);
      }
      const ca = noDe(a, 'cartola_alta').scale;
      const cb = noDe(b, 'cartola_alta').scale;
      expect(cb.x).toBeCloseTo(ca.x, 4);
      expect(cb.y).toBeCloseTo(ca.y, 4);
      expect(cb.z).toBeCloseTo(ca.z, 4);
    });
  });

  describe('bigode', () => {
    const visiveis = (p: PersonagemDeRosto): string[] =>
      [...base.meta.bigodes.values()].flatMap((v) => [v.noAlta, v.noBaixa]).filter((n) => noDe(p, n).visible);

    it('mostra só o bigode escolhido, só no nível em uso, com escala 1; os outros ficam ocultos com escala 0', () => {
      const p = nova();
      expect(p.definirBigode('bigode_dali')).toBe(true);
      expect(visiveis(p)).toEqual(['bigode_dali_alta']);
      expect(noDe(p, 'bigode_dali_alta').scale.toArray()).toEqual([1, 1, 1]);
      expect(noDe(p, 'bigode_dali_baixa').scale.x).toBe(0);
      p.definirNivel('baixo');
      expect(visiveis(p)).toEqual(['bigode_dali_baixa']);
      expect(noDe(p, 'bigode_dali_baixa').scale.toArray()).toEqual([1, 1, 1]);
      expect(noDe(p, 'bigode_dali_alta').scale.x).toBe(0);
      p.definirBigode('bigodao');
      expect(visiveis(p)).toEqual(['bigodao_baixa']);
      expect(noDe(p, 'bigode_dali_baixa').scale.x).toBe(0);
      p.definirBigode(null);
      expect(visiveis(p)).toEqual([]);
      expect(p.aparencia.bigode).toBeNull();
    });

    it('id que o arquivo não tem devolve false e deixa o que estava', () => {
      const p = nova();
      p.definirBigode('bigodao');
      expect(p.definirBigode('barba')).toBe(false);
      expect(p.aparencia.bigode).toBe('bigodao');
    });

    it('as formas do bigode andam com as do rosto: o mesmo peso em cada forma, a cada quadro (sorriso, susto, piscar)', () => {
      const p = nova();
      p.definirBigode('bigode_guidao');
      const m = noDe(p, 'bigode_guidao_alta') as Mesh;
      const c = corpo(p);
      for (const cara of ['cara_sorriso', 'cara_susto', 'cara_rindo']) {
        p.fazerCara(cara);
        andar(p, 40);
        expect(peso(c, cara), cara).toBeGreaterThan(0.5);
        for (const forma of base.meta.formas) {
          expect(peso(m, forma), `${cara}: ${forma}`).toBeCloseTo(peso(c, forma), 6);
        }
      }
      p.forcarPiscar(1);
      andar(p, 2);
      expect(peso(m, 'piscar')).toBeCloseTo(1, 6);
    });

    it('no nível baixo o bigode baixo também anda com o rosto', () => {
      const p = nova();
      p.definirNivel('baixo');
      p.definirBigode('bigodao');
      p.fazerCara('cara_sorriso');
      andar(p, 40);
      expect(peso(noDe(p, 'bigodao_baixa') as Mesh, 'cara_sorriso')).toBeCloseTo(peso(corpo(p, 'baixa'), 'cara_sorriso'), 6);
      expect(peso(noDe(p, 'bigodao_baixa') as Mesh, 'cara_sorriso')).toBeGreaterThan(0.5);
    });

    it('bigode escolhido depois da cara já nasce com a cara do rosto, sem esperar o próximo quadro', () => {
      const p = nova();
      p.fazerCara('cara_rindo');
      andar(p, 40);
      p.definirBigode('bigodao');
      expect(peso(noDe(p, 'bigodao_alta') as Mesh, 'cara_rindo')).toBeCloseTo(peso(corpo(p), 'cara_rindo'), 6);
    });
  });

  describe('estilo de olho', () => {
    it('liga a forma do estilo (peso 1, as outras 0) e troca esclera e íris pelos do estilo; o normal volta ao do arquivo', () => {
      const p = nova();
      const normal = { esclera: materialDoCorpo(p, 'olho').map, iris: materialDoCorpo(p, 'iris').map };
      expect(p.definirEstiloDeOlho('olho_kawaii')).toBe(true);
      andar(p, 3);
      expect(peso(corpo(p), 'estilo_kawaii')).toBe(1);
      expect(peso(corpo(p), 'estilo_bravo')).toBe(0);
      expect(peso(corpo(p), 'estilo_cansado')).toBe(0);
      expect(materialDoCorpo(p, 'olho').map).not.toBe(normal.esclera);
      expect(materialDoCorpo(p, 'iris').map).not.toBe(normal.iris);
      expect(materialDoCorpo(p, 'olho').map!.name).toBe('olho_kawaii:cor');
      expect(materialDoCorpo(p, 'iris').map!.name).toBe('iris_kawaii:cor');
      expect(materialDoCorpo(p, 'iris').emissiveMap!.name).toBe('iris_kawaii:brilho');
      p.definirEstiloDeOlho('olho_cansado');
      andar(p, 3);
      expect(peso(corpo(p), 'estilo_kawaii')).toBe(0);
      expect(peso(corpo(p), 'estilo_cansado')).toBe(1);
      p.definirEstiloDeOlho('olho_normal');
      andar(p, 3);
      for (const f of ['estilo_kawaii', 'estilo_bravo', 'estilo_cansado']) expect(peso(corpo(p), f)).toBe(0);
      expect(materialDoCorpo(p, 'olho').map).toBe(normal.esclera);
      expect(materialDoCorpo(p, 'iris').map).toBe(normal.iris);
    });

    it('os três estilos diferentes têm texturas diferentes entre si (a esclera e a íris de cada um)', () => {
      const p = nova();
      const mapas = new Set<unknown>();
      for (const id of base.meta.estilosDeOlho!.itens.keys()) {
        p.definirEstiloDeOlho(id);
        andar(p, 1);
        mapas.add(materialDoCorpo(p, 'olho').map);
        mapas.add(materialDoCorpo(p, 'iris').map);
      }
      expect(mapas.size).toBe(8);
    });

    it('compõe com a cara, o piscar e as pálpebras do olhar: a forma do estilo segue em 1 e o resto funciona', () => {
      const p = nova();
      p.definirEstiloDeOlho('olho_bravo');
      p.fazerCara('cara_sorriso');
      p.definirInteresse(0, { x: 0.1, y: 0.5, z: 0.5 }, 5);
      andar(p, 60);
      expect(peso(corpo(p), 'estilo_bravo')).toBe(1);
      expect(peso(corpo(p), 'cara_sorriso')).toBeGreaterThan(0.5);
      p.forcarPiscar(1);
      andar(p, 2);
      expect(peso(corpo(p), 'estilo_bravo')).toBe(1);
      expect(peso(corpo(p), 'piscar')).toBeCloseTo(1, 6);
      // o fechamento das caras sem estalo: o olho fechado (cara_comemorando) com o estilo na pele
      p.forcarPiscar(null);
      p.fazerCara('cara_comemorando');
      andar(p, 60);
      expect(peso(corpo(p), 'estilo_bravo')).toBe(1);
      expect(peso(corpo(p), 'cara_comemorando')).toBeGreaterThan(0.5);
    });

    it('o estilo do nível baixo também muda (a forma e os materiais das duas malhas)', () => {
      const p = nova();
      p.definirNivel('baixo');
      p.definirEstiloDeOlho('olho_kawaii');
      andar(p, 2);
      expect(peso(corpo(p, 'baixa'), 'estilo_kawaii')).toBe(1);
      expect(materialDoCorpo(p, 'iris', 'baixa').map).toBe(materialDoCorpo(p, 'iris', 'alta').map);
    });

    it('cada balão tem o seu estilo (instâncias independentes) e id desconhecido devolve false', () => {
      const a = nova();
      const b = nova();
      a.definirEstiloDeOlho('olho_kawaii');
      andar(a, 2);
      andar(b, 2);
      expect(peso(corpo(b), 'estilo_kawaii')).toBe(0);
      expect(materialDoCorpo(b, 'iris').map).not.toBe(materialDoCorpo(a, 'iris').map);
      expect(a.definirEstiloDeOlho('olho_roxo')).toBe(false);
      expect(a.aparencia.estiloDeOlho).toBe('olho_kawaii');
    });
  });

  describe('cor dos olhos', () => {
    const hexDaCor = (id: string): number => base.meta.coresDeOlho!.cores.get(id)!;

    it('tinge a íris: color = cor e emissive = cor × 0,30, nas 8 cores; a esclera não muda', () => {
      const p = nova();
      const esclera = materialDoCorpo(p, 'olho').color.getHex();
      for (const id of base.meta.coresDeOlho!.cores.keys()) {
        expect(p.definirCorDosOlhos(id), id).toBe(true);
        andar(p, 1);
        const iris = materialDoCorpo(p, 'iris');
        expect(iris.color.getHex(), id).toBe(hexDaCor(id));
        const esperado = iris.color.clone().multiplyScalar(0.3);
        expect(iris.emissive.r).toBeCloseTo(esperado.r, 5);
        expect(iris.emissive.g).toBeCloseTo(esperado.g, 5);
        expect(iris.emissive.b).toBeCloseTo(esperado.b, 5);
        expect(materialDoCorpo(p, 'olho').color.getHex()).toBe(esclera);
      }
    });

    it('vale em qualquer estilo e acompanha a troca de estilo', () => {
      const p = nova();
      p.definirCorDosOlhos('verde');
      for (const id of base.meta.estilosDeOlho!.itens.keys()) {
        p.definirEstiloDeOlho(id);
        andar(p, 1);
        expect(materialDoCorpo(p, 'iris').color.getHex(), id).toBe(hexDaCor('verde'));
      }
    });

    it('cada balão tem a sua cor (a íris é uma cópia por instância) e id desconhecido devolve false', () => {
      const a = nova();
      const b = nova();
      a.definirCorDosOlhos('violeta');
      andar(a, 1);
      andar(b, 1);
      expect(materialDoCorpo(b, 'iris').color.getHex()).toBe(hexDaCor('castanho'));
      expect(materialDoCorpo(a, 'iris')).not.toBe(materialDoCorpo(b, 'iris'));
      expect(a.definirCorDosOlhos('roxo')).toBe(false);
      expect(a.aparencia.corDosOlhos).toBe('violeta');
    });

    it('chega ao material que a malha tem agora, mesmo trocado por uma cópia (as variantes de qualidade do jogo), com o estilo e tudo', () => {
      const p = nova();
      const malhaIris = malhaDoCorpo(p, 'iris');
      const malhaOlho = malhaDoCorpo(p, 'olho');
      const copiaIris = (malhaIris.material as MeshPhysicalMaterial).clone();
      const copiaOlho = (malhaOlho.material as MeshPhysicalMaterial).clone();
      malhaIris.material = copiaIris;
      malhaOlho.material = copiaOlho;
      p.definirCorDosOlhos('azul');
      p.definirEstiloDeOlho('olho_kawaii');
      andar(p, 2);
      expect(copiaIris.color.getHex()).toBe(hexDaCor('azul'));
      // a íris da cópia usa a textura do estilo: a que o original da instância (o da malha baixa, que ninguém trocou) tem agora
      expect(copiaIris.map).toBe(materialDoCorpo(p, 'iris', 'baixa').map);
      expect(copiaIris.map).not.toBeNull();
      expect(copiaOlho.map).toBe(materialDoCorpo(p, 'olho', 'baixa').map);
      expect(copiaOlho.map).not.toBeNull();
    });
  });

  it('com chapéu, bigode, estilo e cor ligados, nada aloca por quadro', async () => {
    const p = base.instanciar({ cor: 0xffffff, sorteio: sorteioDeTeste(5) });
    p.definirAcessorio(chapeus, 'cartola');
    p.definirBigode('bigode_dali');
    p.definirEstiloDeOlho('olho_kawaii');
    p.definirCorDosOlhos('azul');
    p.definirInteresse(0, { x: 0.3, y: 0.0144, z: 0.4 }, 4);
    const passo = (i: number): void => {
      p.raiz.position.set(0.05 * Math.sin(i * 0.05), 0, 0);
      if (i % 400 === 0) p.fazerAcao(i % 800 === 0 ? 'balao_pulinho' : 'balao_estufar', { entradaS: 0.05, saidaS: 0.2 });
      if (i % 300 === 0) p.fazerCara(i % 600 === 0 ? 'cara_sorriso' : 'cara_susto');
      p.atualizar(1 / 60);
    };
    await provarSemAlocar(passo, { aquecer: 15_000, quadros: 10_000 });
  }, TEMPO_DO_PERFILADOR_MS);

  it('dispose solta as cópias da íris e da esclera da instância, e o balão da base segue inteiro para os outros', () => {
    const p = nova();
    const q = nova();
    p.dispose();
    expect(materialDoCorpo(q, 'iris').color.getHex()).toBe(0xb0702f);
    andar(q, 2);
  });
});
