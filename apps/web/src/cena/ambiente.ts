import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PMREMGenerator,
  RectAreaLight,
  SpotLight,
  type Camera,
  type Object3D,
  type Scene,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import type { MedidasMesa } from '@sinuca/fisica';
import type { ConfigLuz, PerfilDeQualidade } from '../config';
import { descartar as descartarSala } from './descartar';
import { corDaTemperatura } from './temperatura';
import { semiMesa } from './mesa';

export interface Ambiente {
  /** A cada quadro: a luminária some quando a câmera sobe acima dela (vista de cima). */
  atualizar(camera: Camera): void;
  /**
   * Liga ou desliga sombra, luz retangular e reflexo de sala conforme o nível; vale na hora (os shaders
   * recompilam uma vez). O reflexo de sala só é gerado na primeira vez que um nível o pede.
   */
  aplicarQualidade(perfil: PerfilDeQualidade): void;
  /**
   * Os metais da cena mudaram (a skin do taco trocou): confere de novo quem é metal e dá a eles o reflexo do nível de agora. Sem
   * isso o ouro do taco ficaria sem o ambiente claro que o alumínio da mesa tem, e sairia marrom.
   */
  atualizarMetais(): void;
  dispose(): void;
}

/** Luminária de bar: painel aceso, calha escura e dois cabos para o teto. */
function criarLuminaria(cfg: ConfigLuz['luminaria'], cor: Color): Group {
  const grupo = new Group();
  grupo.name = 'luminaria';
  const painel = new Mesh(
    new BoxGeometry(cfg.largura, 0.02, cfg.profundidade),
    new MeshBasicMaterial({ color: cor.clone().multiplyScalar(1.4), toneMapped: false }),
  );
  grupo.add(painel);
  const calha = new Mesh(
    new BoxGeometry(cfg.largura + 0.08, 0.07, cfg.profundidade + 0.08),
    new MeshStandardMaterial({ color: 0x1b1c1f, roughness: 0.4, metalness: 0.6 }),
  );
  calha.position.y = 0.045;
  grupo.add(calha);
  const cabo = new CylinderGeometry(0.004, 0.004, 3, 8);
  const materialDoCabo = new MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.6 });
  for (const lado of [-1, 1]) {
    const fio = new Mesh(cabo, materialDoCabo);
    fio.position.set(lado * cfg.largura * 0.4, 1.58, 0);
    grupo.add(fio);
  }
  return grupo;
}

/**
 * Luz e ambiente da cena: tonemapping ACES, reflexo de uma sala (RoomEnvironment pelo PMREM, sem
 * arquivo), luminária retangular sobre a mesa (a luz retangular dá o reflexo nas bolas e o foco
 * dá as sombras suaves no pano; o mapa de sombra cobre só a mesa).
 *
 * @param projetores o que faz sombra no pano (as bolas e o taco)
 * @param perfil o nível de qualidade de abertura; `aplicarQualidade` troca depois
 */
export function criarAmbiente(
  renderer: WebGLRenderer,
  cena: Scene,
  mesa: MedidasMesa,
  cfg: ConfigLuz,
  projetores: readonly Object3D[],
  perfil: PerfilDeQualidade,
): Ambiente {
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = cfg.exposicao;
  renderer.shadowMap.type = PCFShadowMap;

  const { luminaria: lum, foco: f, preenchimento } = cfg;
  const corDaLuminaria = new Color(corDaTemperatura(lum.temperaturaK));

  // A sala do reflexo também é de luz quente: tinge paredes e lâmpadas dela antes do PMREM.
  let alvoDoAmbiente: WebGLRenderTarget | null = null;
  let alvoDoMetal: WebGLRenderTarget | null = null;
  const gerarAlvos = (): void => {
    const gerador = new PMREMGenerator(renderer);
    const gerarSala = (temperaturaK: number): WebGLRenderTarget => {
      const tinta = new Color(corDaTemperatura(temperaturaK));
      const sala = new RoomEnvironment();
      sala.traverse((objeto) => {
        if (!(objeto instanceof Mesh)) return;
        for (const material of Array.isArray(objeto.material) ? objeto.material : [objeto.material]) {
          if ('color' in material && material.color instanceof Color) material.color.multiply(tinta);
          if ('emissive' in material && material.emissive instanceof Color) material.emissive.multiply(tinta);
        }
      });
      const alvo = gerador.fromScene(sala, 0.04);
      descartarSala(sala);
      return alvo;
    };
    alvoDoAmbiente = gerarSala(lum.temperaturaK);
    alvoDoMetal = gerarSala(cfg.temperaturaMetalK);
    gerador.dispose();
  };

  const luzDoCeu = new HemisphereLight(corDaTemperatura(preenchimento.temperaturaK), preenchimento.chao, preenchimento.intensidade);
  cena.add(luzDoCeu);
  RectAreaLightUniformsLib.init();
  const retangular = new RectAreaLight(corDaLuminaria, lum.intensidade, lum.largura, lum.profundidade);
  retangular.position.set(0, lum.altura - 0.015, 0);
  retangular.up.set(0, 0, -1);
  retangular.lookAt(0, 0, 0);
  cena.add(retangular);

  const semi = semiMesa(mesa);
  const alcance = Math.hypot(semi.x, semi.z);
  const foco = new SpotLight(corDaLuminaria, f.intensidade, 0, Math.atan(alcance / lum.altura) * 1.02, f.penumbra, 2);
  foco.position.set(0, lum.altura, 0);
  foco.target.position.set(0, 0, 0);
  foco.shadow.camera.near = Math.max(lum.altura - 0.5, 0.1);
  foco.shadow.camera.far = lum.altura + 0.9;
  foco.shadow.bias = f.vies;
  foco.shadow.normalBias = f.viesNormal;
  foco.shadow.radius = 3;
  cena.add(foco, foco.target);
  // Nos níveis de foco barato a direcional faz o papel dele: sem cone nem queda, só um produto escalar por pixel.
  const direcional = new DirectionalLight(corDaLuminaria, cfg.intensidadeDirecional);
  direcional.position.set(0, lum.altura, 0);
  direcional.target.position.set(0, 0, 0);
  direcional.visible = false;
  cena.add(direcional, direcional.target);

  const luminaria = criarLuminaria(lum, corDaLuminaria);
  luminaria.position.set(0, lum.altura, 0);
  cena.add(luminaria);

  // O alumínio só tem reflexo: ele recebe o ambiente mais claro, e perde o reflexo quando o nível não o tem.
  const metais: MeshStandardMaterial[] = [];
  const coletarMetais = (): void => {
    metais.length = 0;
    cena.traverse((objeto) => {
      if (!(objeto instanceof Mesh)) return;
      for (const material of Array.isArray(objeto.material) ? objeto.material : [objeto.material]) {
        if (material instanceof MeshStandardMaterial && material.metalness >= 0.9 && !metais.includes(material)) metais.push(material);
      }
    });
  };
  coletarMetais();

  const todosOsMateriais = (): Material[] => {
    const lista = new Set<Material>();
    cena.traverse((objeto) => {
      if (!(objeto instanceof Mesh)) return;
      for (const material of Array.isArray(objeto.material) ? objeto.material : [objeto.material]) lista.add(material);
    });
    return [...lista];
  };

  let atual: PerfilDeQualidade | null = null;
  const darReflexoAosMetais = (perfilDeAgora: PerfilDeQualidade): void => {
    for (const metal of metais) {
      metal.envMap = perfilDeAgora.ambiente ? alvoDoMetal!.texture : null;
      metal.envMapIntensity = cfg.intensidadeMetal;
    }
  };
  const aplicarQualidade = (novo: PerfilDeQualidade): void => {
    const anterior = atual;
    atual = novo;
    renderer.shadowMap.enabled = novo.sombras;
    foco.castShadow = novo.sombras;
    if (novo.sombras && anterior?.tamanhoMapaSombra !== novo.tamanhoMapaSombra) {
      // Mapa novo no tamanho do nível: o antigo (se houve) é solto e o three cria outro no próximo quadro.
      foco.shadow.map?.dispose();
      foco.shadow.map = null;
      foco.shadow.mapSize.set(novo.tamanhoMapaSombra, novo.tamanhoMapaSombra);
    }
    for (const projetor of projetores) projetor.traverse((o) => void (o.castShadow = novo.sombras && o.userData.semSombra !== true));
    retangular.visible = novo.luzRetangular;
    foco.visible = !novo.focoBarato;
    direcional.visible = novo.focoBarato;
    if (novo.ambiente) {
      if (!alvoDoAmbiente || !alvoDoMetal) gerarAlvos();
      cena.environment = alvoDoAmbiente!.texture;
      cena.environmentIntensity = cfg.intensidadeAmbiente;
    } else {
      cena.environment = null;
    }
    darReflexoAosMetais(novo);
    // Sem o reflexo de sala a cena perde a luz de preenchimento que ele dava: o céu da luminária compensa.
    luzDoCeu.intensity = preenchimento.intensidade * (novo.ambiente ? 1 : cfg.compensacaoSemAmbiente);
    // O programa de cada material depende das luzes e das sombras: recompilam uma vez.
    if (anterior !== null) for (const material of todosOsMateriais()) material.needsUpdate = true;
  };
  aplicarQualidade(perfil);

  return {
    atualizar(camera) {
      luminaria.visible = camera.position.y < lum.altura - 0.1;
    },
    aplicarQualidade,
    atualizarMetais() {
      coletarMetais();
      if (atual !== null) {
        darReflexoAosMetais(atual);
        for (const metal of metais) metal.needsUpdate = true;
      }
    },
    dispose() {
      cena.environment = null;
      alvoDoAmbiente?.dispose();
      alvoDoMetal?.dispose();
      foco.shadow.dispose();
    },
  };
}
