import { AdditiveBlending, Color, Group, Material, Mesh, MeshStandardMaterial, PointLight, Texture, Vector3, type Camera, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { ConfigBoteco, NivelDeQualidade } from '../config';
import type { PosicaoDoMenu } from '../controles/camera-do-menu';
import { arquivoDoBoteco, luzDePonto, tetoVisivel, type ExtrasDeLuz, type LuzDePonto } from './boteco-modelo';
import { descartar } from './descartar';

/** Os materiais do arquivo que acendem sozinhos (o visor do artista os desenha sem tonemapping): o néon, as lâmpadas e a luminária. */
const ACESOS = /^(neon-|lampada$|luminaria-luz$)/;
/** O material do forro e das vigas: a peça que a vista de cima esconde. */
const MATERIAL_DO_FORRO = 'forro';
/** A luminária do jogo (`ambiente.ts`) é a luz principal: a do arquivo fica escondida. */
const NO_DA_LUMINARIA = 'luminaria';
const NO_DO_VENTILADOR = 'ventilador-helice';
const NOME_DA_CAMERA = /^camera-menu-(\d+)$/;

export interface OpcoesDoBoteco {
  readonly cfg: ConfigBoteco;
  /** A anisotropia das texturas (o teto do nível de qualidade, limitado pela placa): vale já na primeira subida à placa. */
  readonly anisotropia: (qualidade: NivelDeQualidade) => number;
  /** Troca o carregador nos testes e na falha simulada; o padrão é o `GLTFLoader`. */
  readonly carregar?: (url: string) => Promise<GLTF>;
}

/** O que o jogo precisa saber quando um nível do boteco entra na cena. */
export interface BotecoCarregado {
  readonly qualidade: NivelDeQualidade;
  readonly raiz: Object3D;
}

function materiaisDe(malha: Mesh): Material[] {
  return Array.isArray(malha.material) ? malha.material : [malha.material];
}

/**
 * O boteco em volta da mesa (L44): o `.glb` do Pincel do nível de qualidade, as luzes de ponto dos marcadores `luz-*`, o ventilador, o
 * teto que some na vista de cima e as posições das câmeras do menu. Carrega em segundo plano e nunca segura a partida: até chegar (ou se
 * o arquivo falhar) a cena fica como era, e `carregado` diz se há boteco. Trocar de nível carrega o outro arquivo e só então solta o
 * de antes.
 */
export class BotecoEmCena {
  /** Tudo que o boteco põe na cena: o arquivo, as luzes. */
  readonly grupo = new Group();
  /** As câmeras do menu (`camera-menu-1` a `-3`) do arquivo carregado, em ordem. */
  readonly camerasDoMenu: PosicaoDoMenu[] = [];
  private raiz: Object3D | null = null;
  private qualidade: NivelDeQualidade | null = null;
  private pedido: NivelDeQualidade | null = null;
  private geracao = 0;
  private readonly luzes = new Map<string, PointLight>();
  private teto: Mesh[] = [];
  private ventilador: Object3D | null = null;
  private falhou = false;
  private readonly aoCarregarOuvintes: ((carregado: BotecoCarregado) => void)[] = [];
  private readonly aoSoltarOuvintes: ((raiz: Object3D) => void)[] = [];
  private readonly carregador: (url: string) => Promise<GLTF>;

  constructor(private readonly opcoes: OpcoesDoBoteco) {
    this.grupo.name = 'boteco-cena';
    this.carregador = opcoes.carregar ?? ((url) => new GLTFLoader().loadAsync(url));
  }

  /** Há um boteco na cena. */
  get carregado(): boolean {
    return this.raiz !== null;
  }

  /** O nível de qualidade do arquivo que está na cena. */
  get nivelCarregado(): NivelDeQualidade | null {
    return this.qualidade;
  }

  /** As luzes de ponto acesas agora (nomes dos marcadores), para o gancho de teste. */
  get luzesLigadas(): readonly string[] {
    return [...this.luzes].filter(([, luz]) => luz.visible).map(([nome]) => nome);
  }

  /** O arquivo do nível entrou na cena (também numa troca de nível). */
  aoCarregar(ouvinte: (carregado: BotecoCarregado) => void): void {
    this.aoCarregarOuvintes.push(ouvinte);
  }

  /** O arquivo de antes vai ser descartado (troca de nível): quem guardava malhas dele as esquece. */
  aoSoltar(ouvinte: (raiz: Object3D) => void): void {
    this.aoSoltarOuvintes.push(ouvinte);
  }

  /**
   * Põe na cena o boteco do nível de qualidade. Chamar de novo com o mesmo nível não faz nada; com outro, carrega o arquivo dele e troca
   * quando chega. Se o arquivo falhar, avisa no console e a cena segue sem boteco (ou com o nível que já tinha).
   */
  async definirNivel(qualidade: NivelDeQualidade): Promise<void> {
    if (qualidade === this.qualidade && this.raiz !== null) {
      // Voltou ao nível que já está na cena: o que estava a caminho (outro nível) não vale mais.
      this.geracao++;
      this.pedido = null;
      this.ligarAsLuzes(qualidade);
      return;
    }
    if (qualidade === this.pedido) return;
    this.pedido = qualidade;
    const geracao = ++this.geracao;
    let gltf: GLTF;
    try {
      gltf = await this.carregador(`${import.meta.env.BASE_URL}${arquivoDoBoteco(this.opcoes.cfg.pasta, qualidade)}`);
    } catch (erro) {
      if (geracao === this.geracao) this.pedido = null;
      this.falhou = true;
      console.warn(`Boteco: o arquivo não carregou, a cena fica como estava (${erro instanceof Error ? erro.message : String(erro)})`);
      return;
    }
    if (geracao !== this.geracao) {
      descartar(gltf.scene);
      return;
    }
    this.pedido = null;
    this.trocar(gltf, qualidade);
  }

  /** O forro e as vigas estão à vista agora (a câmera abaixo deles). */
  get tetoVisivelAgora(): boolean {
    return this.teto.length === 0 || this.teto.every((peca) => peca.visible);
  }

  /** O arquivo falhou e não há boteco: o jogo usa isto para manter o menu opaco. */
  get falhouAoCarregar(): boolean {
    return this.falhou && this.raiz === null;
  }

  /** A cada quadro: o teto some com a câmera acima dele e o ventilador gira. */
  atualizar(camera: Camera, agoraMs: number): void {
    if (this.raiz === null) return;
    const visivel = tetoVisivel(camera.position.y, this.opcoes.cfg.tetoSomeAcimaDe);
    for (const peca of this.teto) peca.visible = visivel;
    if (this.ventilador !== null) this.ventilador.rotation.y = (agoraMs / 1000) * 2 * Math.PI * this.opcoes.cfg.ventiladorVoltasPorSegundo;
  }

  dispose(): void {
    this.geracao++;
    this.soltarRaiz();
    for (const luz of this.luzes.values()) luz.dispose();
    this.luzes.clear();
    this.grupo.clear();
  }

  private trocar(gltf: GLTF, qualidade: NivelDeQualidade): void {
    const { cfg } = this.opcoes;
    const raiz = gltf.scene;
    raiz.name = 'boteco-arquivo';
    const marcadores: { nome: string; objeto: Object3D }[] = [];
    const cameras: { numero: number; objeto: Object3D }[] = [];
    let ventilador: Object3D | null = null;
    raiz.traverse((objeto) => {
      if (objeto.name === NO_DA_LUMINARIA) objeto.visible = false;
      else if (objeto.name === NO_DO_VENTILADOR) ventilador = objeto;
      else if (objeto.name.startsWith('luz-')) marcadores.push({ nome: objeto.name, objeto });
      else {
        const camera = NOME_DA_CAMERA.exec(objeto.name);
        if (camera) cameras.push({ numero: Number(camera[1]), objeto });
      }
    });
    raiz.updateMatrixWorld(true);
    this.prepararMalhas(raiz, qualidade);
    const teto = this.acharOTeto(raiz);

    // O arquivo de antes sai só agora, com o novo já pronto: a cena nunca fica sem boteco numa troca de nível.
    this.soltarRaiz();
    this.raiz = raiz;
    this.qualidade = qualidade;
    this.teto = teto;
    this.ventilador = ventilador;
    this.grupo.add(raiz);

    const posicao = new Vector3();
    const acesasEmAlgumNivel = new Set(Object.values(cfg.luzes).flat());
    for (const { nome, objeto } of marcadores) {
      if (!acesasEmAlgumNivel.has(nome) || this.luzes.has(nome)) continue;
      objeto.getWorldPosition(posicao);
      const luz = luzDePonto(nome, [posicao.x, posicao.y, posicao.z], objeto.userData as ExtrasDeLuz, cfg.fatorDaLuzDePonto * (cfg.fatorPorLuz[nome] ?? 1));
      if (luz !== null) this.luzes.set(nome, this.criarLuz(luz));
    }
    this.ligarAsLuzes(qualidade);

    this.camerasDoMenu.length = 0;
    for (const { objeto } of cameras.sort((a, b) => a.numero - b.numero)) {
      objeto.getWorldPosition(posicao);
      const alvo = (objeto.userData as { alvo?: unknown }).alvo;
      if (!Array.isArray(alvo) || alvo.length !== 3 || !alvo.every((v) => typeof v === 'number')) continue;
      this.camerasDoMenu.push({ x: posicao.x, y: posicao.y, z: posicao.z, alvoX: alvo[0] as number, alvoY: alvo[1] as number, alvoZ: alvo[2] as number });
    }
    for (const ouvinte of [...this.aoCarregarOuvintes]) ouvinte({ qualidade, raiz });
  }

  private criarLuz(dados: LuzDePonto): PointLight {
    const luz = new PointLight(new Color(dados.cor), dados.intensidade, dados.alcance, 2);
    luz.name = dados.nome;
    luz.position.set(...dados.posicao);
    luz.castShadow = false;
    this.grupo.add(luz);
    return luz;
  }

  /** Liga as luzes do nível e apaga as outras. Nenhuma faz sombra. */
  private ligarAsLuzes(qualidade: NivelDeQualidade): void {
    const ligadas = this.opcoes.cfg.luzes[qualidade];
    for (const [nome, luz] of this.luzes) luz.visible = ligadas.includes(nome);
  }

  /**
   * Nenhuma malha lança nem recebe sombra em tempo real (a da mesa e a dos móveis já estão assadas nos atlas dos materiais sem luz);
   * brilho do néon, halo aditivo e anisotropia das texturas.
   */
  private prepararMalhas(raiz: Object3D, qualidade: NivelDeQualidade): void {
    const { cfg } = this.opcoes;
    const anisotropia = this.opcoes.anisotropia(qualidade);
    const vistas = new Set<Texture>();
    raiz.traverse((objeto) => {
      if (!(objeto instanceof Mesh)) return;
      objeto.castShadow = false;
      objeto.receiveShadow = false;
      if (objeto.parent?.name !== NO_DO_VENTILADOR && objeto.name !== NO_DO_VENTILADOR) objeto.matrixAutoUpdate = false;
      for (const material of materiaisDe(objeto)) {
        if (material.name === 'letreiro-halo') {
          material.blending = AdditiveBlending;
          material.depthWrite = false;
          material.transparent = true;
        }
        if (ACESOS.test(material.name) && material instanceof MeshStandardMaterial) {
          material.toneMapped = false;
          material.emissiveIntensity = cfg.brilhoDoNeon;
        }
        for (const valor of Object.values(material)) {
          if (valor instanceof Texture && !vistas.has(valor)) {
            vistas.add(valor);
            valor.anisotropy = Math.max(valor.anisotropy, anisotropia);
          }
        }
      }
    });
  }

  /** O forro (com as vigas, na mesma malha) é o que some quando a câmera sobe acima dele, na vista de cima. */
  private acharOTeto(raiz: Object3D): Mesh[] {
    const teto: Mesh[] = [];
    raiz.traverse((objeto) => {
      if (objeto instanceof Mesh && materiaisDe(objeto).some((m) => m.name === MATERIAL_DO_FORRO)) teto.push(objeto);
    });
    return teto;
  }

  private soltarRaiz(): void {
    const raiz = this.raiz;
    if (raiz === null) return;
    for (const ouvinte of [...this.aoSoltarOuvintes]) ouvinte(raiz);
    this.grupo.remove(raiz);
    descartar(raiz);
    this.raiz = null;
    this.qualidade = null;
    this.teto = [];
    this.ventilador = null;
  }
}
