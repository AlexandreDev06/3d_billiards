import type { NivelDeDetalhe } from '@sinuca/personagens/three';
import type { BaseDoRosto } from '@sinuca/personagens/three';
import type { AparenciaDoBalao } from '@sinuca/protocolo';
import { AmbientLight, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene } from 'three';
import type { ConfigBaloes } from '../config';
import { REACAO_PADRAO_DA_PREVIA, reacaoDaPrevia, type ReacaoDaPrevia } from '../online/previa-modelo';
import { estadoVazioDoBalao } from './balao';
import { BaloesDoArtista } from './balao-do-artista';
import type { CarregadorDeChapeus } from './chapeus';

/** Quanto o balão gira por pixel arrastado (rad). */
const RAD_POR_PIXEL = 0.012;
/** O olhar da prévia segue o ponteiro: até onde o ponto de interesse vai para os lados e para cima (m, na escala da prévia). */
const ALCANCE_DO_OLHAR = 0.6;
/** O balão do `.glb` tem cerca de 0,13 m de altura (a escala do corpo); a prévia o enche até esta altura (m). */
const ALTURA_NA_PREVIA = 1;
/** O que a prévia enquadra, na escala em que o corpo mede `ALTURA_NA_PREVIA` (o centro do corpo é zero): o chapéu mais alto em cima, a ponta da cordinha embaixo, e a largura com o bigode e o giro. */
const ALTO_DA_PREVIA = 0.82;
const BAIXO_DA_PREVIA = -1.14;
const LARGURA_DA_PREVIA = 1.2;

/**
 * A cena da prévia do "Meu balão" (L48), sem o renderizador: um balão do artista (os mesmos do jogo, com o chapéu sob demanda), as luzes
 * e a câmera. Testável em Node; `PreviaDoBalao` põe um `WebGLRenderer` por cima. O balão fica no meio, gira por `girar`, faz as caras e
 * as ações da tabela de reações (`definirReacao`) e olha para onde o ponteiro aponta (`olharPara`).
 */
export class CenaDaPrevia {
  readonly cena = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly baloes: BaloesDoArtista;
  private readonly estado = estadoVazioDoBalao();
  private reacao: ReacaoDaPrevia = reacaoDaPrevia(REACAO_PADRAO_DA_PREVIA)!;
  private tempoS = 0;
  private yaw = 0.35;
  private escalaDoBalao = 1;

  constructor(cfg: ConfigBaloes, base: BaseDoRosto, nivel: NivelDeDetalhe, chapeus: CarregadorDeChapeus | null, aspecto: number, cor: number) {
    this.cena.background = null;
    this.baloes = new BaloesDoArtista(cfg, base, nivel, Math.random, 1, chapeus);
    this.cena.add(this.baloes.grupo);
    this.cena.add(new HemisphereLight(new Color(0xdfe9ff), new Color(0x3a3340), 1.6));
    this.cena.add(new AmbientLight(0xffffff, 0.5));
    const chave = new DirectionalLight(0xfff1dd, 2.6);
    chave.position.set(1.5, 2.4, 3);
    this.cena.add(chave);
    const recorte = new DirectionalLight(0x9ec3ff, 1.1);
    recorte.position.set(-2.5, 1, -1.5);
    this.cena.add(recorte);
    this.camera = new PerspectiveCamera(28, aspecto, 0.05, 30);
    this.estado.cor = cor;
    this.estado.escala = 1;
    // O corpo do arquivo mede `cfg.corpo.altura` de ponta a ponta: a prévia o amplia para encher o quadro.
    this.escalaDoBalao = ALTURA_NA_PREVIA / Math.max(cfg.corpo.altura * 2, 0.01);
    this.enquadrar(aspecto);
  }

  /** Câmera de frente, no meio do que o balão ocupa (da ponta da cordinha ao chapéu mais alto), a uma distância que cabe tudo e o giro. */
  enquadrar(aspecto: number): void {
    this.camera.aspect = aspecto;
    const rad = (this.camera.fov * Math.PI) / 180;
    const meiaAltura = (ALTO_DA_PREVIA - BAIXO_DA_PREVIA) / 2;
    const centro = (ALTO_DA_PREVIA + BAIXO_DA_PREVIA) / 2;
    const paraAltura = meiaAltura / Math.tan(rad / 2);
    const paraLargura = LARGURA_DA_PREVIA / 2 / (Math.tan(rad / 2) * Math.max(aspecto, 0.3));
    const dist = Math.max(paraAltura, paraLargura) * 1.04;
    this.camera.position.set(0, centro, dist);
    this.camera.lookAt(0, centro, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
  }

  definirAparencia(a: AparenciaDoBalao): void {
    this.baloes.definirAparencia(0, a);
  }

  definirCor(cor: number): void {
    this.estado.cor = cor;
  }

  definirNivel(nivel: NivelDeDetalhe): void {
    this.baloes.definirNivel(nivel);
  }

  /** Gira o balão `pixels` para a direita (negativo, para a esquerda). */
  girar(pixels: number): void {
    this.yaw += pixels * RAD_POR_PIXEL;
  }

  /** O balão faz o que a reação pede (cara e ação); `false` se a reação não existe. */
  definirReacao(id: string): boolean {
    const r = reacaoDaPrevia(id);
    if (r === null) return false;
    this.reacao = r;
    return true;
  }

  get reacaoAtual(): string {
    return this.reacao.id;
  }

  /** O olhar segue o ponteiro: `nx` e `ny` de -1 a 1 sobre o quadro (nulos: o olhar volta a andar sozinho). */
  olharPara(nx: number | null, ny: number | null): void {
    const vaga = this.estado.interesses[0]!;
    if (nx === null || ny === null) {
      vaga.prioridade = 0;
      return;
    }
    vaga.x = nx * ALCANCE_DO_OLHAR;
    vaga.y = ny * ALCANCE_DO_OLHAR + 0.1;
    vaga.z = this.camera.position.z;
    vaga.prioridade = 5;
  }

  /** Avança `dt` segundos e pronto para desenhar. */
  atualizar(dt: number): void {
    this.tempoS += Math.min(Math.max(dt, 0), 0.1);
    const e = this.estado;
    const r = this.reacao;
    e.tempoS = this.tempoS;
    e.cara = r.cara;
    e.mirando = r.mirando;
    e.impaciente = r.impaciente;
    e.fim = r.fim;
    e.yaw = this.yaw;
    e.largura = this.escalaDoBalao;
    e.altura = this.escalaDoBalao;
    e.escala = 1;
    e.x = 0;
    e.y = 0;
    e.z = 0;
    this.baloes.mostrar(0, e);
  }

  diagnostico(): ReturnType<BaloesDoArtista['diagnostico']> & { readonly yaw: number; readonly reacao: string } {
    return { ...this.baloes.diagnostico(0), yaw: this.yaw, reacao: this.reacao.id };
  }

  /** Solta o balão da prévia (a geometria e as texturas são da base). */
  dispose(): void {
    this.baloes.descartar();
  }
}
