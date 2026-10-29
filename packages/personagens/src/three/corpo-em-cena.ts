import { Quaternion, Vector3, type Group, type Object3D } from 'three';
import { GelatinaDoCorpo, Flutuar, type OpcoesDaGelatina, type OpcoesDoFlutuar } from '../movimento-secundario';
import { OssoAditivo } from './aditivo-de-osso';

/** Quais ossos são o do balanço geral (`raiz`) e o do corpo que gira, estufa e balança (`espinha_1`). */
export interface OssosDoCorpo {
  readonly raiz: string;
  readonly corpo: string;
}

export interface OpcoesDoCorpoEmCena {
  readonly ossos: OssosDoCorpo;
  readonly gelatina: boolean;
  readonly flutuar: boolean;
  readonly sorteio: () => number;
  readonly ajustesDaGelatina?: Partial<OpcoesDaGelatina>;
  readonly ajustesDoFlutuar?: Partial<OpcoesDoFlutuar>;
  /** O tamanho do personagem em repouso (m): a deriva do flutuar é proporcional a ele. Sem isto, o tamanho do balão (13 cm). */
  readonly metadeDaAlturaM?: number;
}

const posicaoDoMundo = new Vector3();
const giroDoGrupo = new Quaternion();
const giroDoPai = new Quaternion();
const giroNaCena = new Quaternion();
const giroDoCorpo = new Quaternion();
const giroDaInclinacao = new Quaternion();
const delta = new Quaternion();
const eixoX = new Vector3(1, 0, 0);
const eixoY = new Vector3(0, 1, 0);
const levePara = new Vector3();
const eixoDoPendulo = new Vector3();

/**
 * O corpo do personagem em cena, por cima da animação. Três coisas, todas **somadas** ao que a ação deixou no osso (com
 * `OssoAditivo`: guardam e devolvem o osso antes do mixer, senão se somariam a cada quadro):
 *
 * - **flutuar**: uma deriva lenta, por ruído semeado, no osso `raiz`, junto de um `ritmo` que acelera e freia o relógio da
 *   parada: a parada nunca repete igual;
 * - **gelatina**: a aceleração do corpo no mundo achata e estica o osso do corpo (squash and stretch, conservando o volume) e o
 *   faz pender para trás;
 * - **seguimento**: o corpo gira e inclina uma fração do olhar (`aplicarSeguimento`), por mola, depois dos olhos.
 *
 * Um osso que o esqueleto não tem desliga o que dependia dele. Nada aloca.
 */
export class CorpoEmCena {
  private readonly raiz: OssoAditivo | null;
  private readonly corpo: OssoAditivo | null;
  private readonly gelatina: GelatinaDoCorpo | null;
  private readonly flutuar: Flutuar | null;
  /** Qual eixo do osso do corpo aponta para cima na cena (0 a 2). */
  private readonly eixoVertical: number;

  constructor(
    private readonly grupo: Group,
    cena: Object3D,
    opcoes: OpcoesDoCorpoEmCena,
  ) {
    const raiz = cena.getObjectByName(opcoes.ossos.raiz);
    const corpo = cena.getObjectByName(opcoes.ossos.corpo);
    this.raiz = raiz ? new OssoAditivo(raiz) : null;
    this.corpo = corpo ? new OssoAditivo(corpo) : null;
    this.gelatina = opcoes.gelatina && corpo ? new GelatinaDoCorpo(opcoes.ajustesDaGelatina) : null;
    this.flutuar = opcoes.flutuar && raiz ? new Flutuar(opcoes.sorteio, { amplitudeM: 0.004 * ((opcoes.metadeDaAlturaM ?? 0.066) / 0.066), ...opcoes.ajustesDoFlutuar }) : null;
    this.eixoVertical = 1;
    if (corpo) {
      grupo.updateMatrixWorld(true);
      grupo.getWorldQuaternion(giroDoGrupo);
      corpo.getWorldQuaternion(giroNaCena);
      giroNaCena.premultiply(giroDoGrupo.invert());
      let melhor = -1;
      let eixo = 1;
      for (let i = 0; i < 3; i++) {
        levePara.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0).applyQuaternion(giroNaCena);
        if (Math.abs(levePara.y) > melhor) {
          melhor = Math.abs(levePara.y);
          eixo = i;
        }
      }
      this.eixoVertical = eixo;
    }
  }

  get temGelatina(): boolean {
    return this.gelatina !== null;
  }

  get temFlutuar(): boolean {
    return this.flutuar !== null;
  }

  get temCorpo(): boolean {
    return this.corpo !== null;
  }

  /** O ritmo do relógio da parada (em volta de 1): o flutuar varia, sem ele é 1. */
  get ritmo(): number {
    return this.flutuar?.ritmo ?? 1;
  }

  /** Antes do `mixer.update`: devolve os ossos ao que a ação tinha deixado. */
  restaurar(): void {
    this.raiz?.restaurar();
    this.corpo?.restaurar();
  }

  /** O corpo foi posto em outro lugar de repente: a gelatina deixa de medir a aceleração dessa viagem. */
  reposicionar(): void {
    this.gelatina?.reiniciar();
  }

  reiniciar(): void {
    this.gelatina?.reiniciar();
  }

  /**
   * Depois do `mixer.update`: guarda o que a ação deixou, põe a deriva no osso `raiz` e a gelatina no osso do corpo. `pesoDaBase` é
   * o peso da ação parada (0 a 1): com outra ação por cima, a deriva some junto.
   */
  depoisDoMixer(dt: number, pesoDaBase: number): void {
    this.raiz?.salvar();
    this.corpo?.salvar();
    if (this.flutuar && this.raiz) {
      this.flutuar.atualizar(dt, pesoDaBase);
      const f = this.flutuar;
      this.raiz.osso.position.x += f.x;
      this.raiz.osso.position.y += f.y;
      this.raiz.osso.position.z += f.z;
      giroDaInclinacao.set(Math.sin(f.giroX / 2), 0, 0, Math.cos(f.giroX / 2));
      delta.set(0, 0, Math.sin(f.giroZ / 2), Math.cos(f.giroZ / 2));
      this.raiz.osso.quaternion.premultiply(giroDaInclinacao).premultiply(delta);
    }
    if (this.gelatina && this.corpo) {
      // onde o corpo está no mundo agora (com a ação, a deriva e o jogo): daí sai a aceleração
      const medida = this.raiz?.osso ?? this.corpo.osso;
      medida.updateWorldMatrix(true, false);
      posicaoDoMundo.setFromMatrixPosition(medida.matrixWorld);
      this.gelatina.atualizar(dt, posicaoDoMundo.x, posicaoDoMundo.y, posicaoDoMundo.z);
      const g = this.gelatina;
      const escala = this.corpo.osso.scale;
      const v = this.eixoVertical;
      escala.setComponent(v, escala.getComponent(v) * g.escalaY);
      escala.setComponent((v + 1) % 3, escala.getComponent((v + 1) % 3) * g.escalaXZ);
      escala.setComponent((v + 2) % 3, escala.getComponent((v + 2) % 3) * g.escalaXZ);
      this.somarGiroNaCena(0, 0, g.inclinacaoX, g.inclinacaoZ, true);
    }
  }

  /**
   * Gira o corpo, por cima do que há, `giro` em torno do vertical (positivo para a esquerda) e `inclinacao` (positiva olhando para
   * cima). Chamado depois dos olhos, uma vez por quadro; precisa vir depois de `depoisDoMixer`.
   */
  aplicarSeguimento(giro: number, inclinacao: number): void {
    if (!this.corpo || (Math.abs(giro) < 1e-6 && Math.abs(inclinacao) < 1e-6)) return;
    this.somarGiroNaCena(giro, inclinacao, 0, 0, false);
  }

  /**
   * Soma ao osso do corpo uma volta dada no referencial da cena (y para cima, +z para a frente do personagem): `giro` em torno de y,
   * `inclinacao` em torno de x (positiva leva a frente para cima), e uma inclinação do alto para o lado `(lx, lz)` (do mundo, não da cena).
   */
  private somarGiroNaCena(giro: number, inclinacao: number, lx: number, lz: number, ladoDoMundo: boolean): void {
    const corpo = this.corpo!.osso;
    const pai = corpo.parent;
    if (pai === null) return;
    this.grupo.updateWorldMatrix(true, false);
    this.grupo.getWorldQuaternion(giroDoGrupo);
    giroDoCorpo.identity();
    if (Math.abs(giro) > 1e-9) giroDoCorpo.setFromAxisAngle(eixoY, giro);
    if (Math.abs(inclinacao) > 1e-9) {
      giroDaInclinacao.setFromAxisAngle(eixoX, -inclinacao);
      giroDoCorpo.multiply(giroDaInclinacao);
    }
    const tamanho = Math.hypot(lx, lz);
    if (tamanho > 1e-9) {
      // o vetor da inclinação, do mundo para a cena; o alto do corpo vai para ele
      levePara.set(lx, 0, lz);
      if (ladoDoMundo) levePara.applyQuaternion(giroNaCena.copy(giroDoGrupo).invert());
      eixoDoPendulo.set(0, 1, 0).cross(levePara);
      if (eixoDoPendulo.lengthSq() > 1e-18) {
        giroDaInclinacao.setFromAxisAngle(eixoDoPendulo.normalize(), tamanho);
        giroDoCorpo.premultiply(giroDaInclinacao);
      }
    }
    // a mesma volta, vista do referencial do pai do osso
    pai.updateWorldMatrix(true, false);
    pai.getWorldQuaternion(giroDoPai);
    giroDoPai.premultiply(giroNaCena.copy(giroDoGrupo).invert());
    delta.copy(giroDoPai).invert().multiply(giroDoCorpo).multiply(giroDoPai);
    corpo.quaternion.premultiply(delta);
  }
}
