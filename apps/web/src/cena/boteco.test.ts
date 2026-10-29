import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, Texture } from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG_WEB, type NivelDeQualidade } from '../config';
import { BotecoEmCena } from './boteco';

function marcador(nome: string, posicao: [number, number, number], userData: Record<string, unknown>): Object3D {
  const o = new Object3D();
  o.name = nome;
  o.position.set(...posicao);
  o.userData = userData;
  return o;
}

/** Uma malha de caixa com o material dado, no nome dado. */
function malha(nome: string, material: MeshBasicMaterial | MeshStandardMaterial): Mesh {
  const m = new Mesh(new BoxGeometry(), material);
  m.name = nome;
  return m;
}

/** O que o `GLTFLoader` faz de `KHR_materials_unlit`: um `MeshBasicMaterial` com o atlas assado como mapa. */
function semLuz(nome: string): MeshBasicMaterial {
  return new MeshBasicMaterial({ name: nome, map: new Texture() });
}

/**
 * Um `.glb` de mentira com tudo que o boteco procura (P5: casco e objetos sem luz, metal, vidro e néon em PBR): marcadores, câmeras,
 * luminária, ventilador, piso, paredes, forro e assado.
 */
function gltfFalso(): GLTF {
  const cena = new Group();
  const luminaria = new Group();
  luminaria.name = 'luminaria';
  const neon = malha('neon', new MeshStandardMaterial({ name: 'neon-rosa' }));
  const halo = malha('halo', new MeshStandardMaterial({ name: 'letreiro-halo' }));
  const ventilador = new Group();
  ventilador.name = 'ventilador-helice';
  ventilador.add(malha('pas', new MeshStandardMaterial({ name: 'madeira-pa' })));
  cena.add(
    luminaria,
    malha('piso', semLuz('piso')),
    malha('forro', semLuz('forro')),
    malha('paredes', semLuz('paredes')),
    malha('assado', semLuz('assado')),
    malha('decoracao', semLuz('decoracao')),
    malha('cromado', new MeshStandardMaterial({ name: 'cromado', metalness: 0.75 })),
    malha('vidro', new MeshStandardMaterial({ name: 'vidro-ambar' })),
    neon,
    halo,
    ventilador,
    marcador('luz-neon', [1, 2, 0], { tipo: 'ponto', cor: '#ff4fa0', intensidade: 0.5, alcance: 3 }),
    marcador('luz-balcao', [-1, 1, 0], { tipo: 'ponto', cor: '#ffc880', intensidade: 1, alcance: 4 }),
    marcador('luz-salao', [0, 2, 1], { tipo: 'ponto', cor: '#ffd9a0', intensidade: 1, alcance: 6 }),
    marcador('luz-janela', [2, 1.5, 3], { tipo: 'ponto', cor: '#7fb2ff', intensidade: 0.4, alcance: 3 }),
    marcador('luz-luminaria', [0, 1.4, 0], { tipo: 'retangular', cor: '#ffffff', intensidade: 1, alcance: 5 }),
    marcador('camera-menu-3', [3, 1.5, 1], { alvo: [0, 0.8, 0] }),
    marcador('camera-menu-1', [4.5, 1.55, 2.6], { alvo: [0.4, 0.8, 0] }),
    marcador('camera-menu-2', [-4, 1.5, 2], { alvo: [0, 0.8, 0] }),
    marcador('camera-menu-4', [0, 0, 0], { alvo: 'quebrado' }),
  );
  return { scene: cena } as unknown as GLTF;
}

function montar(carregar: (url: string) => Promise<GLTF> = async () => gltfFalso()) {
  const urls: string[] = [];
  const boteco = new BotecoEmCena({
    cfg: CONFIG_WEB.boteco,
    anisotropia: () => 4,
    carregar: async (url) => {
      urls.push(url);
      return carregar(url);
    },
  });
  return { boteco, urls };
}

const camera = (y: number): PerspectiveCamera => {
  const c = new PerspectiveCamera();
  c.position.set(0, y, 0);
  return c;
};

afterEach(() => vi.restoreAllMocks());

describe('BotecoEmCena', () => {
  it('antes de carregar não há boteco, e atualizar não faz nada', () => {
    const { boteco } = montar();
    expect(boteco.carregado).toBe(false);
    expect(boteco.nivelCarregado).toBeNull();
    expect(boteco.falhouAoCarregar).toBe(false);
    boteco.atualizar(camera(3), 1000);
    expect(boteco.tetoVisivelAgora).toBe(true);
  });

  it('carrega o .glb do nível que casa com a qualidade, em public/boteco/', async () => {
    for (const [qualidade, arquivo] of [['alta', 'boteco-alto'], ['media', 'boteco-medio'], ['baixa', 'boteco-baixo']] as const) {
      const { boteco, urls } = montar();
      await boteco.definirNivel(qualidade);
      expect(urls).toEqual([`/boteco/${arquivo}.glb`]);
      expect(boteco.carregado).toBe(true);
      expect(boteco.nivelCarregado).toBe(qualidade);
    }
  });

  it('luzes de ponto dos marcadores: as do nível acesas, a retangular (luminária) fica com o ambiente.ts, e nenhuma faz sombra', async () => {
    const esperadas: Record<NivelDeQualidade, string[]> = { alta: ['luz-neon', 'luz-balcao', 'luz-janela'], media: ['luz-neon', 'luz-balcao'], baixa: [] };
    for (const qualidade of ['alta', 'media', 'baixa'] as const) {
      const { boteco } = montar();
      await boteco.definirNivel(qualidade);
      expect([...boteco.luzesLigadas].sort()).toEqual([...esperadas[qualidade]].sort());
      expect(boteco.luzesLigadas).not.toContain('luz-luminaria');
      const luzes = boteco.grupo.children.filter((o) => (o as { isPointLight?: boolean }).isPointLight);
      // A `luz-salao` está no arquivo mas nenhum nível a acende: nem é criada.
      expect(luzes.map((o) => o.name).sort()).toEqual(['luz-balcao', 'luz-janela', 'luz-neon']);
      for (const luz of luzes) expect((luz as { castShadow: boolean }).castShadow).toBe(false);
    }
  });

  it('a intensidade da luz é a relativa do artista vezes o fator do visor (8 cd) vezes o fator da própria luz', async () => {
    const { boteco } = montar();
    await boteco.definirNivel('alta');
    const luz = (nome: string) => boteco.grupo.children.find((o) => o.name === nome && (o as { isPointLight?: boolean }).isPointLight) as unknown as { intensity: number; distance: number; decay: number };
    const { fatorDaLuzDePonto: visor, fatorPorLuz } = CONFIG_WEB.boteco;
    expect(luz('luz-neon').intensity).toBeCloseTo(0.5 * visor * fatorPorLuz['luz-neon']!, 9);
    expect(luz('luz-balcao').intensity).toBeCloseTo(1 * visor * fatorPorLuz['luz-balcao']!, 9);
    expect(luz('luz-neon').distance).toBe(3);
    expect(luz('luz-neon').decay).toBe(2);
    // Cada fator só abaixa: as luzes do arquivo estouravam o PBR do salão.
    for (const fator of Object.values(fatorPorLuz)) expect(fator).toBeLessThanOrEqual(1);
  });

  it('esconde a luminária do arquivo (a do jogo é a luz principal)', async () => {
    const { boteco } = montar();
    await boteco.definirNivel('alta');
    expect(boteco.grupo.getObjectByName('luminaria')!.visible).toBe(false);
  });

  it('câmeras do menu em ordem de número, sem a que veio com alvo quebrado', async () => {
    const { boteco } = montar();
    await boteco.definirNivel('alta');
    expect(boteco.camerasDoMenu).toEqual([
      { x: 4.5, y: 1.55, z: 2.6, alvoX: 0.4, alvoY: 0.8, alvoZ: 0 },
      { x: -4, y: 1.5, z: 2, alvoX: 0, alvoY: 0.8, alvoZ: 0 },
      { x: 3, y: 1.5, z: 1, alvoX: 0, alvoY: 0.8, alvoZ: 0 },
    ]);
  });

  it('o forro (as vigas vêm nele) some com a câmera acima do limite e volta abaixo dele; o resto fica', async () => {
    const { boteco } = montar();
    await boteco.definirNivel('alta');
    const forro = boteco.grupo.getObjectByName('forro')!;
    boteco.atualizar(camera(1.4), 0);
    expect(boteco.tetoVisivelAgora).toBe(true);
    boteco.atualizar(camera(CONFIG_WEB.boteco.tetoSomeAcimaDe + 0.2), 0);
    expect(boteco.tetoVisivelAgora).toBe(false);
    expect(forro.visible).toBe(false);
    for (const nome of ['piso', 'paredes', 'assado', 'decoracao']) expect(boteco.grupo.getObjectByName(nome)!.visible).toBe(true);
    boteco.atualizar(camera(1.4), 0);
    expect(boteco.tetoVisivelAgora).toBe(true);
    expect(forro.visible).toBe(true);
  });

  it('o ventilador gira com o relógio', async () => {
    const { boteco } = montar();
    await boteco.definirNivel('alta');
    const helice = boteco.grupo.getObjectByName('ventilador-helice')!;
    boteco.atualizar(camera(1.4), 1000);
    expect(helice.rotation.y).toBeCloseTo(2 * Math.PI * CONFIG_WEB.boteco.ventiladorVoltasPorSegundo, 9);
  });

  it('nenhuma malha lança nem recebe sombra em tempo real (a da mesa está assada); néon e halo ganham o acabamento do visor', async () => {
    for (const qualidade of ['alta', 'media', 'baixa'] as const) {
      const { boteco } = montar();
      await boteco.definirNivel(qualidade);
      boteco.grupo.traverse((objeto) => {
        if (!(objeto instanceof Mesh)) return;
        expect([objeto.name, objeto.castShadow]).toEqual([objeto.name, false]);
        expect([objeto.name, objeto.receiveShadow]).toEqual([objeto.name, false]);
      });
    }
    const { boteco } = montar();
    await boteco.definirNivel('alta');
    const neon = (boteco.grupo.getObjectByName('neon') as Mesh).material as MeshStandardMaterial;
    expect(neon.toneMapped).toBe(false);
    expect(neon.emissiveIntensity).toBe(CONFIG_WEB.boteco.brilhoDoNeon);
    const halo = (boteco.grupo.getObjectByName('halo') as Mesh).material as MeshStandardMaterial;
    expect(halo.depthWrite).toBe(false);
    expect(halo.transparent).toBe(true);
  });

  it('os materiais sem luz chegam como vieram, em todos os níveis (inclusive o baixo): mesmo material, com tonemapping do jogo, sem envMap', async () => {
    const sem = ['piso', 'forro', 'paredes', 'assado', 'decoracao'];
    for (const qualidade of ['alta', 'media', 'baixa'] as const) {
      const gltf = gltfFalso();
      const dosArquivo = sem.map((nome) => (gltf.scene.getObjectByName(nome) as Mesh).material);
      const { boteco } = montar(async () => gltf);
      await boteco.definirNivel(qualidade);
      for (const [i, nome] of sem.entries()) {
        const material = (boteco.grupo.getObjectByName(nome) as Mesh).material as MeshBasicMaterial;
        expect(material).toBe(dosArquivo[i]);
        expect(material).toBeInstanceOf(MeshBasicMaterial);
        expect(material.toneMapped).toBe(true);
        expect(material.envMap).toBeNull();
        expect(material.map).toBeInstanceOf(Texture);
      }
      // O PBR (metal, vidro) também fica o do arquivo: quem o troca é o nível de qualidade, não o boteco.
      expect(((boteco.grupo.getObjectByName('cromado') as Mesh).material as MeshStandardMaterial).metalness).toBe(0.75);
    }
  });

  it('mesmo nível de novo não carrega outra vez', async () => {
    const { boteco, urls } = montar();
    await boteco.definirNivel('media');
    await boteco.definirNivel('media');
    expect(urls).toHaveLength(1);
  });

  it('troca de nível: o novo entra e só então o de antes sai, avisando quem guardava malhas dele', async () => {
    const { boteco } = montar();
    const soltos: string[] = [];
    boteco.aoSoltar((raiz) => soltos.push(raiz.name));
    const carregados: string[] = [];
    boteco.aoCarregar(({ qualidade }) => carregados.push(qualidade));
    await boteco.definirNivel('baixa');
    const primeira = boteco.grupo.getObjectByName('boteco-arquivo');
    await boteco.definirNivel('alta');
    expect(carregados).toEqual(['baixa', 'alta']);
    expect(soltos).toEqual(['boteco-arquivo']);
    expect(boteco.nivelCarregado).toBe('alta');
    expect(boteco.grupo.getObjectByName('boteco-arquivo')).not.toBe(primeira);
    expect(boteco.grupo.children.filter((o) => o.name === 'boteco-arquivo')).toHaveLength(1);
    expect([...boteco.luzesLigadas].sort()).toEqual(['luz-balcao', 'luz-janela', 'luz-neon']);
  });

  it('voltar ao nível que está na cena enquanto outro vem a caminho descarta o que vinha', async () => {
    let soltar: (g: GLTF) => void = () => undefined;
    const { boteco } = montar(async (url) => (url.includes('alto') ? new Promise<GLTF>((r) => (soltar = r)) : gltfFalso()));
    await boteco.definirNivel('baixa');
    const pendente = boteco.definirNivel('alta');
    await boteco.definirNivel('baixa');
    soltar(gltfFalso());
    await pendente;
    expect(boteco.nivelCarregado).toBe('baixa');
  });

  it('arquivo que falha: avisa no console, a cena fica sem boteco e o jogo pode seguir', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { boteco } = montar(async () => {
      throw new Error('404');
    });
    await boteco.definirNivel('alta');
    expect(boteco.carregado).toBe(false);
    expect(boteco.falhouAoCarregar).toBe(true);
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it('falha ao trocar de nível mantém o que já estava na cena', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { boteco } = montar(async (url) => {
      if (url.includes('alto')) throw new Error('404');
      return gltfFalso();
    });
    await boteco.definirNivel('baixa');
    await boteco.definirNivel('alta');
    expect(boteco.nivelCarregado).toBe('baixa');
    expect(boteco.carregado).toBe(true);
    expect(boteco.falhouAoCarregar).toBe(false);
  });

  it('dispose esvazia a cena', async () => {
    const { boteco } = montar();
    await boteco.definirNivel('alta');
    boteco.dispose();
    expect(boteco.carregado).toBe(false);
    expect(boteco.grupo.children).toHaveLength(0);
  });
});
