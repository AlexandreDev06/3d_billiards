import { MathUtils, Vector3, type PerspectiveCamera } from 'three';
import { BOLAO, TACO } from '@sinuca/fisica';
import type { ConfigCamera } from '../config';
import type { PoseDaCameraDoFim } from './camera-do-fim';
import { poseDoMenuVazia, type PoseDaCameraDoMenu } from './camera-do-menu';
import { poseDaCameraDeTacada, poseVazia, type GeometriaDaCameraDeTacada, type PoseDaCameraDeTacada } from './camera-tacada';
import { fracaoDentroDaSala, raioMaximoNaDirecao, type LimitesDaSala } from './limite-da-sala';
import { diferencaAngular, fatorDeSuavizacao } from './suavizar';
import { ajusteDaVistaDeCima } from './vista-cima';

export type VistaCamera = 'tacada' | 'cima' | 'fim' | 'menu';

const CENTRO_DA_MESA = new Vector3(0, 0, 0);
const PARA_CIMA = new Vector3(0, 1, 0);
// Vista de cima com +X para a direita da tela: o comprimento da mesa fica na horizontal.
const PARA_CIMA_NA_VISTA_DE_CIMA = new Vector3(0, 0, -1);
const RAIO_ORBITAL_MIN = 0.35;
const RAIO_ORBITAL_MAX = 5;
/** O taco de repouso: sem informação dele (vista de cima, órbita, testes), a câmera de tacada é a de sempre. */
const TACO_DE_REPOUSO: TacoParaACamera = { elevacao: 0, recuo: 0 };

/** O que a câmera de tacada precisa saber do taco desenhado: a elevação dele (rad) e a distância da ponta ao bolão (m). */
export interface TacoParaACamera {
  readonly elevacao: number;
  readonly recuo: number;
}

/**
 * Câmera da mesa: de tacada (atrás do taco, segue a mira), de cima (Tab), do fim da partida
 * (os balões em volta da mesa, posta de fora: `entrarNoFim`), do menu (passeando pelo boteco: `entrarNoMenu`) ou orbital livre (botão
 * direito). Toda transição é amortecida pelo tempo real do quadro; nada aqui aloca por quadro.
 *
 * Com o boteco em cena (`definirLimites`), a câmera do jogo (tacada, órbita e fim) nunca sai da zona livre da sala: passando do limite
 * ela encurta a distância ao que olha, na mesma direção, em vez de atravessar parede ou móvel. A vista de cima só sobe (sem parede por
 * perto) e a do menu é a do artista.
 */
export class CameraRig {
  vista: VistaCamera = 'tacada';

  private orbitandoAgora = false;
  private zoomTacada = 1;
  private zoomCima = 1;
  private azimute = 0;
  private elevacao = 0;
  private raio = 1;
  private anguloSuave = 0;
  private vistaAntesDoMenu: VistaCamera = 'tacada';
  private primeiroQuadro = true;
  /** Deslocamento lateral do desenho (fração da largura) e o que a vista atual pede; só a vista de cima desloca. */
  private deslocamento = 0;
  private deslocamentoAlvo = 0;
  private larguraDaTela = 1280;
  private readonly posicaoAlvo = new Vector3();
  private readonly olharAlvo = new Vector3();
  private readonly paraCimaAlvo = new Vector3();
  private readonly olhar = new Vector3();
  private readonly poseDaTacada: PoseDaCameraDeTacada = poseVazia();
  private readonly poseDoFim: PoseDaCameraDoFim = { x: 0, y: 0, z: 0, olharX: 0, olharY: 0, olharZ: 0 };
  private readonly poseDoMenu: PoseDaCameraDoMenu = poseDoMenuVazia();
  private limites: LimitesDaSala | null = null;
  private readonly pivo = new Vector3();
  private readonly entradaDaTacada = { x: 0, y: 0, z: 0, angulo: 0, elevacaoDoTaco: 0, recuo: 0, zoom: 1 };

  constructor(
    private readonly camera: PerspectiveCamera,
    private cfg: ConfigCamera,
    /** Meia extensão da mesa com a moldura, ao longo de X e de Z (m). */
    private readonly semiX: number,
    private readonly semiZ: number,
    /** O raio do bolão e as medidas do taco: a câmera sobe quando o taco sobe (`poseDaCameraDeTacada`). */
    private readonly geometria: GeometriaDaCameraDeTacada = { raioBolao: BOLAO.raio, taco: TACO },
  ) {
    camera.fov = cfg.campoDeVisaoGraus;
    camera.updateProjectionMatrix();
  }

  /** Troca a sensibilidade da órbita, o passo do zoom e a pressa do giro (configurações do jogador). */
  configurar(cfg: ConfigCamera): void {
    this.cfg = cfg;
  }

  /** Onde a câmera do jogo pode estar dentro da sala (o boteco carregou); `null` = sem limite (sem boteco não há parede). */
  definirLimites(limites: LimitesDaSala | null): void {
    this.limites = limites;
  }

  /** Largura da janela em px; a vista de cima a usa para converter a largura que o HUD cobre em fração da tela. */
  definirLarguraDaTela(px: number): void {
    this.larguraDaTela = Math.max(px, 1);
  }

  get orbitando(): boolean {
    return this.orbitandoAgora;
  }

  /** A última pose pedida à câmera de tacada (alvo, antes do amortecimento): para o gancho de teste e as provas. */
  get ultimaPoseDaTacada(): Readonly<PoseDaCameraDeTacada> {
    return this.poseDaTacada;
  }

  /** O zoom da câmera de tacada (1 = a distância e a altura da configuração). */
  get zoomDaTacada(): number {
    return this.zoomTacada;
  }

  /** Tab: de tacada para de cima e de volta. No fim da partida a câmera é do fim e Tab não mexe nela. */
  alternarVista(): void {
    if (this.vista === 'fim' || this.vista === 'menu') return;
    this.vista = this.vista === 'tacada' ? 'cima' : 'tacada';
  }

  /** A câmera passa à do fim, no lugar `pose` (que quem chama refaz a cada quadro, a tela pode mudar de proporção). */
  entrarNoFim(pose: Readonly<PoseDaCameraDoFim>): void {
    this.vista = 'fim';
    Object.assign(this.poseDoFim, pose);
  }

  /** Volta à câmera de tacada (partida nova). */
  sairDoFim(): void {
    if (this.vista === 'fim') this.vista = 'tacada';
  }

  /** A câmera passa à do menu, na pose `pose` (que quem chama refaz a cada quadro): ela guarda a vista de antes para `sairDoMenu`. */
  entrarNoMenu(pose: Readonly<PoseDaCameraDoMenu>): void {
    if (this.vista !== 'menu') {
      this.vistaAntesDoMenu = this.vista;
      this.encerrarOrbita();
    }
    this.vista = 'menu';
    Object.assign(this.poseDoMenu, pose);
  }

  /** Volta à vista de antes do menu (tacada, de cima ou do fim). */
  sairDoMenu(): void {
    if (this.vista !== 'menu') return;
    this.vista = this.vistaAntesDoMenu;
  }

  iniciarOrbita(): void {
    if (this.orbitandoAgora || this.vista === 'menu') return;
    this.orbitandoAgora = true;
    const d = this.posicaoAlvo.copy(this.camera.position).sub(CENTRO_DA_MESA);
    this.raio = MathUtils.clamp(d.length(), this.cfg.orbital.raioInicialMin, RAIO_ORBITAL_MAX);
    this.elevacao = this.limitarElevacao(Math.asin(d.y / Math.max(d.length(), 1e-6)));
    this.azimute = Math.atan2(d.z, d.x);
  }

  encerrarOrbita(): void {
    this.orbitandoAgora = false;
  }

  orbitar(pixelsX: number, pixelsY: number): void {
    this.azimute += pixelsX * this.cfg.orbital.radiosPorPixel;
    this.elevacao = this.limitarElevacao(this.elevacao + pixelsY * this.cfg.orbital.radiosPorPixel);
  }

  /** `sinal` > 0 afasta (roda para o jogador), < 0 aproxima. */
  zoomar(sinal: number): void {
    const fator = 1 + Math.sign(sinal) * this.cfg.passoZoom;
    if (this.orbitandoAgora) {
      this.raio = MathUtils.clamp(this.raio * fator, RAIO_ORBITAL_MIN, Math.min(RAIO_ORBITAL_MAX, this.raioDaSala()));
    } else if (this.vista === 'fim' || this.vista === 'menu') {
      return;
    } else if (this.vista === 'cima') {
      this.zoomCima = MathUtils.clamp(this.zoomCima * fator, this.cfg.zoomMin, this.cfg.zoomMax);
    } else {
      this.zoomTacada = MathUtils.clamp(this.zoomTacada * fator, this.cfg.zoomMin, this.cfg.zoomMax);
    }
  }

  /**
   * `ancora`: onde está o bolão a tacar; `angulo`: a mira atual (rad); `taco`: a elevação e o recuo do taco desenhado (a câmera de
   * tacada sobe com ele, e sem ele fica na de repouso).
   */
  atualizar(dt: number, ancora: Vector3, angulo: number, taco: TacoParaACamera = TACO_DE_REPOUSO): void {
    const suavizacao = this.primeiroQuadro ? 1 : fatorDeSuavizacao(this.cfg.taxaSuavizacao, dt);
    this.anguloSuave += diferencaAngular(this.anguloSuave, angulo) * (this.primeiroQuadro ? 1 : fatorDeSuavizacao(this.cfg.taxaSuavizacao * 1.5, dt));

    if (this.vista === 'menu') this.alvoDoMenu();
    else if (this.orbitandoAgora) this.alvoOrbital();
    else if (this.vista === 'cima') this.alvoDeCima();
    else if (this.vista === 'fim') this.alvoDoFim();
    else this.alvoDeTacada(ancora, taco);

    this.camera.position.lerp(this.posicaoAlvo, suavizacao);
    this.olhar.lerp(this.olharAlvo, suavizacao);
    this.camera.up.lerp(this.paraCimaAlvo, suavizacao).normalize();
    this.camera.lookAt(this.olhar);
    this.aplicarDeslocamento(suavizacao);
    this.primeiroQuadro = false;
  }

  /** Desloca o desenho na tela (sem mexer na câmera) para a mesa ficar na faixa que o HUD deixa livre. */
  private aplicarDeslocamento(suavizacao: number): void {
    this.deslocamento += (this.deslocamentoAlvo - this.deslocamento) * suavizacao;
    const aspecto = this.camera.aspect;
    if (Math.abs(this.deslocamento) > 1e-4 || this.deslocamentoAlvo !== 0) {
      this.camera.setViewOffset(aspecto, 1, -this.deslocamento * aspecto, 0, aspecto, 1);
    } else if (this.camera.view?.enabled) {
      this.camera.clearViewOffset();
    }
  }

  private alvoDeTacada(ancora: Vector3, taco: TacoParaACamera): void {
    const entrada = this.entradaDaTacada;
    entrada.x = ancora.x;
    entrada.y = ancora.y;
    entrada.z = ancora.z;
    entrada.angulo = this.anguloSuave;
    entrada.elevacaoDoTaco = taco.elevacao;
    entrada.recuo = taco.recuo;
    entrada.zoom = this.zoomTacada;
    const pose = poseDaCameraDeTacada(entrada, this.cfg.tacada, this.geometria, this.poseDaTacada);
    this.posicaoAlvo.set(pose.x, pose.y, pose.z);
    this.olharAlvo.set(pose.olharX, pose.olharY, pose.olharZ);
    this.paraCimaAlvo.copy(PARA_CIMA);
    this.deslocamentoAlvo = 0;
    this.manterNaSala(ancora.x, ancora.y, ancora.z);
  }

  private alvoDoFim(): void {
    const p = this.poseDoFim;
    this.posicaoAlvo.set(p.x, p.y, p.z);
    this.olharAlvo.set(p.olharX, p.olharY, p.olharZ);
    this.paraCimaAlvo.copy(PARA_CIMA);
    this.deslocamentoAlvo = 0;
    this.manterNaSala(0, 0, 0);
  }

  private alvoDoMenu(): void {
    const p = this.poseDoMenu;
    this.posicaoAlvo.set(p.x, p.y, p.z);
    this.olharAlvo.set(p.olharX, p.olharY, p.olharZ);
    this.paraCimaAlvo.copy(PARA_CIMA);
    this.deslocamentoAlvo = 0;
  }

  /** Puxa a posição alvo para o pivô, na mesma direção, até caber na sala (sem alocar). */
  private manterNaSala(pivoX: number, pivoY: number, pivoZ: number): void {
    if (this.limites === null) return;
    const pivo = this.pivo.set(pivoX, pivoY, pivoZ);
    const fracao = fracaoDentroDaSala(pivo, this.posicaoAlvo, this.limites);
    if (fracao < 1) this.posicaoAlvo.sub(pivo).multiplyScalar(fracao).add(pivo);
  }

  /** O raio da órbita que cabe na sala, na direção de agora (sem boteco, sem limite). */
  private raioDaSala(): number {
    return this.limites === null ? Number.POSITIVE_INFINITY : raioMaximoNaDirecao(this.azimute, this.elevacao, this.limites);
  }

  private alvoDeCima(): void {
    const { margem, reservaEsquerdaPx, reservaDireitaPx } = this.cfg.cima;
    const { altura, deslocamento } = ajusteDaVistaDeCima({
      semiX: this.semiX,
      semiZ: this.semiZ,
      campoDeVisaoGraus: this.cfg.campoDeVisaoGraus,
      aspecto: this.camera.aspect,
      margem,
      reservaEsquerda: reservaEsquerdaPx / this.larguraDaTela,
      reservaDireita: reservaDireitaPx / this.larguraDaTela,
      zoom: this.zoomCima,
    });
    this.deslocamentoAlvo = deslocamento;
    this.posicaoAlvo.set(0, altura, 0);
    this.olharAlvo.copy(CENTRO_DA_MESA);
    this.paraCimaAlvo.copy(PARA_CIMA_NA_VISTA_DE_CIMA);
  }

  private alvoOrbital(): void {
    const raio = Math.min(this.raio, this.raioDaSala());
    const plano = Math.cos(this.elevacao) * raio;
    this.posicaoAlvo.set(
      CENTRO_DA_MESA.x + plano * Math.cos(this.azimute),
      CENTRO_DA_MESA.y + Math.sin(this.elevacao) * raio,
      CENTRO_DA_MESA.z + plano * Math.sin(this.azimute),
    );
    this.olharAlvo.copy(CENTRO_DA_MESA);
    this.paraCimaAlvo.copy(PARA_CIMA);
    this.deslocamentoAlvo = 0;
  }

  private limitarElevacao(rad: number): number {
    return MathUtils.clamp(
      rad,
      MathUtils.degToRad(this.cfg.orbital.elevacaoMinGraus),
      MathUtils.degToRad(this.cfg.orbital.elevacaoMaxGraus),
    );
  }
}
