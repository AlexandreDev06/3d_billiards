import { Quaternion, Vector3, type Object3D } from 'three';
import { Atencao, type OpcoesDaAtencao } from '../atencao';
import type { MetaDoRosto } from '../meta-do-rosto';
import { SeguidorDoCorpo, type OpcoesDoCorpo } from '../movimento-secundario';
import { girarOlho } from '../olhar';
import { OlharVivo, type OpcoesParciaisDoOlhar } from '../olhar-vivo';
import type { CorpoEmCena } from './corpo-em-cena';

export interface OpcoesDoOlharEmCena {
  readonly sorteio: () => number;
  /** O corpo que segue os olhos; `null` deixa só os olhos se mexerem. */
  readonly corpo: CorpoEmCena | null;
  readonly olhar?: OpcoesParciaisDoOlhar;
  readonly atencao?: Partial<OpcoesDaAtencao>;
  readonly seguidor?: Partial<OpcoesDoCorpo>;
  /** Para onde olha quando não há nenhum interesse: à frente, a esta distância (m). */
  readonly distanciaDeRepousoM?: number;
}

interface OlhoEmCena {
  readonly osso: Object3D;
  readonly pai: Object3D;
  readonly repouso: Quaternion;
  /** O eixo do olhar no repouso, no referencial do pai. */
  readonly eixo: Float64Array;
}

const qPai = new Quaternion();
const qInverso = new Quaternion();
const centro = new Vector3();
const mundo = new Vector3();
const alvo = new Vector3();
const direcao = new Vector3();
const paiParaCabeca = new Vector3();
const buffer = new Float64Array(4);

/** A vaga da atenção reservada para `olharPara`; as de `0` a `VAGA_DIRETA - 1` são do jogo. */
const CAPACIDADE = 8;
const VAGA_DIRETA = CAPACIDADE - 1;
const PRIORIDADE_DIRETA = 1e9;

/**
 * Os olhos do personagem em cena. Junta o que o jogo quer olhar (`Atencao`: pontos de interesse com prioridade, de que o
 * personagem escolhe um com tempo natural) ao olho que sabe olhar (`OlharVivo`: sacada, fixação com microssacadas, perseguição,
 * vergência) e ao corpo que segue (`SeguidorDoCorpo`), e leva o resultado aos ossos:
 *
 * 1. o alvo vai do mundo para a cabeça (x esquerda, y cima, z frente, origem no meio dos dois olhos);
 * 2. o olhar vivo anda um quadro e dá o *ponto do olhar* (a vergência vem de ele estar a uma distância);
 * 3. o corpo gira uma fração (`CorpoEmCena.aplicarSeguimento`), por mola, **atrás** dos olhos;
 * 4. cada olho mira o ponto, com o giro cortado no limite do meta, em relação ao pai **já com o corpo girado**.
 *
 * Roda depois do mixer (o mixer reescreve a rotação dos olhos). Nada aloca.
 */
export class OlharEmCena {
  readonly atencao: Atencao;
  readonly olhar: OlharVivo;
  readonly seguidor: SeguidorDoCorpo;
  /** A elevação do olho em relação à cabeça (rad), para as pálpebras. */
  pitchDoOlho = 0;

  private readonly olhos: OlhoEmCena[] = [];
  private readonly esquerda = new Vector3(1, 0, 0);
  private readonly cima = new Vector3(0, 1, 0);
  private readonly frente = new Vector3(0, 0, 1);
  private readonly limiteRad: number;
  private readonly distanciaDeRepousoM: number;
  private readonly corpo: CorpoEmCena | null;

  constructor(cena: Object3D, meta: MetaDoRosto, opcoes: OpcoesDoOlharEmCena) {
    for (const [nome, o] of meta.olhos) {
      const osso = cena.getObjectByName(nome);
      if (osso === undefined) throw new Error(`"${nome}" não existe no personagem`);
      const pai = osso.parent;
      if (pai === null) throw new Error(`"${nome}" não tem pai`);
      const inverso = pai.getWorldQuaternion(new Quaternion()).invert();
      const eixo = new Vector3(...o.eixoDeRepouso).applyQuaternion(inverso);
      this.olhos.push({ osso, pai, repouso: osso.quaternion.clone(), eixo: Float64Array.of(eixo.x, eixo.y, eixo.z) });
    }
    this.limiteRad = meta.limiteDoOlharRad;
    this.distanciaDeRepousoM = opcoes.distanciaDeRepousoM ?? 3;
    this.corpo = opcoes.corpo;
    this.atencao = new Atencao(opcoes.sorteio, CAPACIDADE, opcoes.atencao, VAGA_DIRETA);
    this.olhar = new OlharVivo(opcoes.sorteio, opcoes.olhar);
    this.seguidor = new SeguidorDoCorpo({ limiteDoOlharRad: this.limiteRad, ...opcoes.seguidor });
    this.montarCabeca();
  }

  /** A base da cabeça no referencial do pai: a frente é o eixo do olhar, o alto é o `y` do pai mais perto de perpendicular. */
  private montarCabeca(): void {
    const primeiro = this.olhos[0];
    if (primeiro === undefined) return;
    this.frente.set(primeiro.eixo[0]!, primeiro.eixo[1]!, primeiro.eixo[2]!).normalize();
    this.cima.set(0, 1, 0).addScaledVector(this.frente, -this.frente.y);
    if (this.cima.lengthSq() < 1e-6) this.cima.set(0, 0, 1).addScaledVector(this.frente, -this.frente.z);
    this.cima.normalize();
    this.esquerda.crossVectors(this.cima, this.frente).normalize();
  }

  get temOlhos(): boolean {
    return this.olhos.length > 0;
  }

  /** Há para onde olhar (um interesse, ou o ponto de `olharPara`), e não à frente. */
  get olhandoUmPonto(): boolean {
    return this.atencao.temPontos;
  }

  /** Põe (ou muda) o interesse `id` (de 0 a 6); prioridade zero o tira. */
  definirInteresse(id: number, x: number, y: number, z: number, prioridade: number): void {
    if (id >= VAGA_DIRETA) throw new Error(`atenção: o interesse ${id} não existe (0 a ${VAGA_DIRETA - 1})`);
    this.atencao.definir(id, x, y, z, prioridade);
  }

  removerInteresse(id: number): void {
    if (id >= VAGA_DIRETA) throw new Error(`atenção: o interesse ${id} não existe (0 a ${VAGA_DIRETA - 1})`);
    this.atencao.remover(id);
  }

  limparInteresses(): void {
    this.atencao.limpar();
  }

  /** Prende o olhar num ponto: a atenção fica nele (sem espiar os interesses) até `pararDeOlhar`; só as microssacadas e as piscadas continuam. */
  olharPara(x: number, y: number, z: number): void {
    this.atencao.definir(VAGA_DIRETA, x, y, z, PRIORIDADE_DIRETA);
  }

  pararDeOlhar(): void {
    this.atencao.remover(VAGA_DIRETA);
  }

  /** O olhar pediu um piscar (uma sacada grande)? Perguntar zera. */
  consumirPedidoDePiscar(): boolean {
    return this.olhar.consumirPedidoDePiscar();
  }

  /** Olhos de frente, corpo no centro, sem interesses: personagem novo em cena. */
  reiniciar(): void {
    this.atencao.limpar();
    this.olhar.reiniciar();
    this.seguidor.reiniciar();
    this.pitchDoOlho = 0;
    for (const o of this.olhos) o.osso.quaternion.copy(o.repouso);
  }

  atualizar(dt: number): void {
    const primeiro = this.olhos[0];
    if (primeiro === undefined) return;
    const pai = primeiro.pai;
    pai.updateWorldMatrix(true, false);
    pai.getWorldQuaternion(qPai);
    qInverso.copy(qPai).invert();
    centro.set(0, 0, 0);
    for (const o of this.olhos) centro.add(mundo.copy(o.osso.position).applyMatrix4(o.pai.matrixWorld));
    centro.multiplyScalar(1 / this.olhos.length);

    this.atencao.atualizar(dt);
    if (this.atencao.temAlvo) alvo.set(this.atencao.x, this.atencao.y, this.atencao.z);
    else alvo.copy(this.frente).applyQuaternion(qPai).multiplyScalar(this.distanciaDeRepousoM).add(centro);
    paiParaCabeca.copy(alvo).sub(centro).applyQuaternion(qInverso);
    this.olhar.atualizar(dt, paiParaCabeca.dot(this.esquerda), paiParaCabeca.dot(this.cima), paiParaCabeca.dot(this.frente));

    // o ponto do olhar no mundo (pela cabeça de antes do corpo girar)
    alvo
      .set(0, 0, 0)
      .addScaledVector(this.esquerda, this.olhar.pontoX)
      .addScaledVector(this.cima, this.olhar.pontoY)
      .addScaledVector(this.frente, this.olhar.pontoZ)
      .applyQuaternion(qPai)
      .add(centro);

    // o corpo vem atrás dos olhos
    if (this.corpo !== null) {
      this.seguidor.atualizar(dt, this.olhar.yaw, this.olhar.pitch);
      this.corpo.aplicarSeguimento(this.seguidor.giro, this.seguidor.inclinacao);
    }
    this.pitchDoOlho = Math.min(Math.max(this.olhar.pitch - this.seguidor.inclinacao, -this.limiteRad), this.limiteRad);

    // cada olho mira o ponto, em relação ao pai de agora (com o corpo já girado)
    for (const o of this.olhos) {
      o.pai.updateWorldMatrix(true, false);
      o.pai.getWorldQuaternion(qPai);
      qInverso.copy(qPai).invert();
      direcao.copy(alvo).sub(mundo.copy(o.osso.position).applyMatrix4(o.pai.matrixWorld)).applyQuaternion(qInverso);
      girarOlho(o.eixo[0]!, o.eixo[1]!, o.eixo[2]!, direcao.x, direcao.y, direcao.z, this.limiteRad, buffer, 0);
      o.osso.quaternion.set(buffer[0]!, buffer[1]!, buffer[2]!, buffer[3]!).multiply(o.repouso);
    }
  }
}
