import type { PoseDaFicha, Ficha } from './ficha';
import { girarVetor, multiplicarQuaternios, quaternioDoEixo } from './quaternios';
import type { Ponto, Trio } from './tipos';

/** Uma sequência de ossos que dobram juntos (um dedo): da raiz à ponta, com o eixo em que dobram e onde a pele termina. */
export interface Corrente {
  readonly nome: string;
  /** Os ossos, do mais perto da raiz ao mais longe. */
  readonly ossos: readonly number[];
  /** O eixo em que cada osso dobra, no quadro dele (a dobra positiva fecha o dedo). */
  readonly eixoDeDobra: Trio;
  /** O centro da ponta, no quadro do último osso, e o raio dela. */
  readonly ponta: Trio;
  readonly raioDaPonta: number;
  /** Quanto da dobra pedida cada osso leva (somam 1). */
  readonly partes: readonly number[];
}

const q = new Float64Array(4);
const qDobra = new Float64Array(4);
const p = { x: 0, y: 0, z: 0 };

/**
 * A cinemática direta de uma ficha: dado o que cada osso faz numa pose, onde cada um está no referencial do personagem. Os
 * buffers são alocados uma vez; `calcular` e as consultas escrevem neles e nunca alocam.
 */
export class Cinematica {
  /** Posição (3 por osso) e rotação (4 por osso) de cada osso no referencial do personagem. */
  readonly posicao: Float64Array;
  readonly rotacao: Float64Array;
  private rotacoesLocais: Float64Array;
  private posicoesLocais: Float64Array;

  constructor(readonly ficha: Ficha) {
    const n = ficha.ossos.length;
    this.posicao = new Float64Array(3 * n);
    this.rotacao = new Float64Array(4 * n);
    this.rotacoesLocais = new Float64Array(4 * n);
    this.posicoesLocais = new Float64Array(3 * n);
  }

  /** Os ossos na pose: cada um filho do pai, na ordem da ficha. */
  calcular(pose: PoseDaFicha): this {
    this.rotacoesLocais = pose.rotacoes;
    this.posicoesLocais = pose.posicoes;
    for (let i = 0; i < this.ficha.ossos.length; i++) {
      const pai = this.ficha.ossos[i]!.pai;
      const lx = pose.posicoes[3 * i]!;
      const ly = pose.posicoes[3 * i + 1]!;
      const lz = pose.posicoes[3 * i + 2]!;
      if (pai < 0) {
        this.posicao[3 * i] = lx;
        this.posicao[3 * i + 1] = ly;
        this.posicao[3 * i + 2] = lz;
        for (let k = 0; k < 4; k++) this.rotacao[4 * i + k] = pose.rotacoes[4 * i + k]!;
        continue;
      }
      girarVetor(this.rotacao, 4 * pai, lx, ly, lz, p);
      this.posicao[3 * i] = this.posicao[3 * pai]! + p.x;
      this.posicao[3 * i + 1] = this.posicao[3 * pai + 1]! + p.y;
      this.posicao[3 * i + 2] = this.posicao[3 * pai + 2]! + p.z;
      multiplicarQuaternios(this.rotacao, 4 * pai, pose.rotacoes, 4 * i, this.rotacao, 4 * i);
    }
    return this;
  }

  /** O ponto (`lx`, `ly`, `lz`) do quadro do osso `osso`, no referencial do personagem, na última pose calculada. */
  ponto(osso: number, lx: number, ly: number, lz: number, saida: Ponto): Ponto {
    girarVetor(this.rotacao, 4 * osso, lx, ly, lz, saida);
    saida.x += this.posicao[3 * osso]!;
    saida.y += this.posicao[3 * osso + 1]!;
    saida.z += this.posicao[3 * osso + 2]!;
    return saida;
  }

  /** Onde fica o centro da ponta de uma corrente na última pose calculada, com a dobra a mais de `dobra` (rad). */
  pontaDaCorrente(corrente: Corrente, dobra: number, saida: Ponto): Ponto {
    const { ossos, eixoDeDobra, partes } = corrente;
    const primeiro = ossos[0]!;
    const pai = this.ficha.ossos[primeiro]!.pai;
    let px = 0;
    let py = 0;
    let pz = 0;
    const rot = this.cadeia;
    if (pai < 0) {
      rot[0] = 0;
      rot[1] = 0;
      rot[2] = 0;
      rot[3] = 1;
    } else {
      px = this.posicao[3 * pai]!;
      py = this.posicao[3 * pai + 1]!;
      pz = this.posicao[3 * pai + 2]!;
      for (let k = 0; k < 4; k++) rot[k] = this.rotacao[4 * pai + k]!;
    }
    for (let j = 0; j < ossos.length; j++) {
      const osso = ossos[j]!;
      girarVetor(rot, 0, this.posicoesLocais[3 * osso]!, this.posicoesLocais[3 * osso + 1]!, this.posicoesLocais[3 * osso + 2]!, p);
      px += p.x;
      py += p.y;
      pz += p.z;
      quaternioDoEixo(eixoDeDobra[0], eixoDeDobra[1], eixoDeDobra[2], dobra * partes[j]!, qDobra, 0);
      multiplicarQuaternios(this.rotacoesLocais, 4 * osso, qDobra, 0, q, 0);
      multiplicarQuaternios(rot, 0, q, 0, rot, 0);
    }
    girarVetor(rot, 0, corrente.ponta[0], corrente.ponta[1], corrente.ponta[2], saida);
    saida.x += px;
    saida.y += py;
    saida.z += pz;
    return saida;
  }

  private readonly cadeia = new Float64Array(4);
}
