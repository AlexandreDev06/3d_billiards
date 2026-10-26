/**
 * O que cada ação de um personagem pesa agora e em que instante dela está, para o desenho misturar. Uma ação de base repete sempre
 * (o personagem parado, respirando) e as outras entram por cima: entram em `entradaS`, tocam, e saem sozinhas nos últimos `saidaS`,
 * ou, com `repetir`, repetem o trecho de ciclo que o artista marcou até o jogo soltá-las. Pedir uma ação nova larga as que estavam
 * em curso em crossfade (a velha sai enquanto a nova entra). Só conta: nada aloca depois de montada.
 */

const limitar = (v: number): number => Math.min(Math.max(v, 0), 1);
const suave = (t: number): number => t * t * (3 - 2 * t);

/** O que a mistura precisa saber de cada ação do arquivo. */
export interface DefinicaoDaAcao {
  readonly nome: string;
  readonly duracaoS: number;
  /** O trecho que repete enquanto o jogo pedir (de, até: s da ação), ou `null` se a ação não tem. */
  readonly cicloS: readonly [number, number] | null;
}

export interface OpcoesDaAcao {
  /** Quanto leva a ação a chegar ao peso cheio (s). */
  readonly entradaS: number;
  /** Quanto leva a sair, ao ser solta ou nos últimos segundos da ação (s). */
  readonly saidaS: number;
  /** Repete o trecho de ciclo até `soltar`. Lança se a ação não tem ciclo. */
  readonly repetir?: boolean;
}

interface Camada {
  ativa: boolean;
  t: number;
  peso: number;
  entradaS: number;
  saidaS: number;
  repetir: boolean;
  soltando: boolean;
}

export class MisturaDeAcoes {
  /** O peso de cada ação, na ordem das definições; somam 1. */
  readonly pesos: Float64Array;
  /** O instante da ação que se mostra (s): para a base, o relógio dela; para as outras, o tempo corrido ou o trecho que repete. */
  readonly tempos: Float64Array;
  private readonly camadas: Camada[];
  /** Os índices das ações em curso, da mais antiga à mais nova. */
  private readonly pilha: Int32Array;
  private tamanho = 0;
  private readonly base: number;
  private tempoBase = 0;

  constructor(
    private readonly definicoes: readonly DefinicaoDaAcao[],
    base: string,
  ) {
    this.base = this.indice(base);
    this.pesos = new Float64Array(definicoes.length);
    this.tempos = new Float64Array(definicoes.length);
    this.pilha = new Int32Array(definicoes.length);
    this.camadas = definicoes.map(() => ({ ativa: false, t: 0, peso: 0, entradaS: 0, saidaS: 0, repetir: false, soltando: false }));
    this.compor();
  }

  /** O índice da ação; lança se o nome não existe. */
  indice(nome: string): number {
    const i = this.definicoes.findIndex((d) => d.nome === nome);
    if (i < 0) throw new Error(`ação "${nome}" não existe`);
    return i;
  }

  /** A ação em curso mais nova que ainda não foi solta, ou `null`. */
  get emCurso(): string | null {
    for (let k = this.tamanho - 1; k >= 0; k--) {
      const i = this.pilha[k]!;
      if (!this.camadas[i]!.soltando) return this.definicoes[i]!.nome;
    }
    return null;
  }

  /**
   * Põe a ação `nome` por cima. As outras em curso passam a sair no tempo da entrada dela. Devolve `false`, sem mexer em nada, se
   * ela já está em curso e não foi solta; se estava saindo, volta a entrar (a que não repete recomeça).
   */
  fazer(nome: string, opcoes: OpcoesDaAcao): boolean {
    const i = this.indice(nome);
    const def = this.definicoes[i]!;
    const repetir = opcoes.repetir === true;
    if (repetir && def.cicloS === null) throw new Error(`ação "${nome}" não tem ciclo`);
    const c = this.camadas[i]!;
    if (c.ativa && !c.soltando) return false;
    for (let k = 0; k < this.tamanho; k++) {
      const outra = this.camadas[this.pilha[k]!]!;
      if (outra === c || outra.soltando) continue;
      outra.soltando = true;
      outra.saidaS = Math.max(opcoes.entradaS, 0);
    }
    if (c.ativa) {
      this.tirarDaPilha(i);
      if (!repetir) c.t = 0;
    } else {
      c.t = 0;
      c.peso = 0;
    }
    c.ativa = true;
    c.soltando = false;
    c.repetir = repetir;
    c.entradaS = Math.max(opcoes.entradaS, 0);
    c.saidaS = Math.max(opcoes.saidaS, 0);
    if (c.entradaS <= 0) c.peso = 1;
    this.pilha[this.tamanho++] = i;
    this.compor();
    return true;
  }

  /** Larga tudo já e recomeça a base do zero (personagem novo em cena). */
  reiniciar(): void {
    for (const c of this.camadas) {
      c.ativa = false;
      c.soltando = false;
      c.peso = 0;
      c.t = 0;
    }
    this.tamanho = 0;
    this.tempoBase = 0;
    this.compor();
  }

  /** Solta a ação `nome`: ela sai em `saidaS` (padrão: a com que entrou). Sem ela em curso não faz nada. */
  soltar(nome: string, saidaS?: number): void {
    const c = this.camadas[this.indice(nome)]!;
    if (!c.ativa || c.soltando) return;
    c.soltando = true;
    if (saidaS !== undefined) c.saidaS = Math.max(saidaS, 0);
  }

  /** Solta tudo o que repete. */
  soltarTudo(saidaS?: number): void {
    for (let k = 0; k < this.tamanho; k++) {
      const i = this.pilha[k]!;
      if (this.camadas[i]!.repetir) this.soltar(this.definicoes[i]!.nome, saidaS);
    }
  }

  atualizar(dt: number): void {
    const passo = Math.max(dt, 0);
    const duracaoBase = this.definicoes[this.base]!.duracaoS;
    this.tempoBase = duracaoBase > 0 ? (this.tempoBase + passo) % duracaoBase : 0;
    let n = 0;
    for (let k = 0; k < this.tamanho; k++) {
      const i = this.pilha[k]!;
      const c = this.camadas[i]!;
      c.t += passo;
      if (c.soltando) c.peso = c.saidaS > 0 ? Math.max(c.peso - passo / c.saidaS, 0) : 0;
      else c.peso = c.entradaS > 0 ? Math.min(c.peso + passo / c.entradaS, 1) : 1;
      const acabou = (c.soltando && c.peso <= 0) || (!c.repetir && c.t >= this.definicoes[i]!.duracaoS);
      if (acabou) {
        c.ativa = false;
        c.soltando = false;
        c.peso = 0;
      } else this.pilha[n++] = i;
    }
    this.tamanho = n;
    this.compor();
  }

  private tirarDaPilha(i: number): void {
    let n = 0;
    for (let k = 0; k < this.tamanho; k++) if (this.pilha[k] !== i) this.pilha[n++] = this.pilha[k]!;
    this.tamanho = n;
  }

  /** O peso final de cada ação: a mais nova manda o que tem, a de baixo fica com o resto (a base com o que sobra). */
  private compor(): void {
    this.pesos.fill(0);
    let resto = 1;
    for (let k = this.tamanho - 1; k >= 0; k--) {
      const i = this.pilha[k]!;
      const c = this.camadas[i]!;
      const def = this.definicoes[i]!;
      // a que não repete sai sozinha nos últimos `saidaS` da ação
      const fim = c.repetir || c.saidaS <= 0 ? 1 : limitar((def.duracaoS - c.t) / c.saidaS);
      const w = suave(Math.min(c.peso, fim));
      this.pesos[i] = w * resto;
      resto *= 1 - w;
      this.tempos[i] = this.tempoDaAcao(def, c);
    }
    this.pesos[this.base] = resto;
    this.tempos[this.base] = this.tempoBase;
  }

  private tempoDaAcao(def: DefinicaoDaAcao, c: Camada): number {
    if (c.repetir && def.cicloS !== null) {
      const [de, ate] = def.cicloS;
      return c.t < ate ? c.t : de + ((c.t - de) % Math.max(ate - de, 1e-6));
    }
    return Math.min(c.t, def.duracaoS);
  }
}
