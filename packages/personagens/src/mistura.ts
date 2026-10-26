/**
 * O que cada pose pesa agora, para o desenho misturar: uma pose por vez, com a troca suave (crossfade) de uma para a outra, ou
 * duas misturadas à mão, e uma terceira sobreposta (`sobrepor`); e um gesto por cima, que entra, toca e sai, ou que se repete
 * (`cicloS`) ou se segura (`segurar`) até o jogo soltá-lo. Só conta: quem desenha lê `pesos`, `pesoDoGesto` e `tempoNaAcao`. Nada
 * aloca depois de montada.
 */

const limitar = (v: number): number => Math.min(Math.max(v, 0), 1);
const suave = (t: number): number => t * t * (3 - 2 * t);

/** Como um gesto toca além de uma vez do começo ao fim. */
export interface OpcoesDoGesto {
  /** O trecho que se repete (de, até: s da ação) enquanto o gesto não for solto: toca do começo até `até` e daí volta a `de`. */
  readonly cicloS?: readonly [number, number];
  /** Ao chegar ao fim fica no último quadro, com o peso cheio, até ser solto (o gesto que termina pendurado). */
  readonly segurar?: boolean;
}

export class MisturaDePoses {
  /** O peso de cada pose, na ordem de `nomes`; somam 1. É a base da troca com a pose sobreposta por cima. */
  readonly pesos: Float64Array;
  /** O gesto em curso, ou `null`. */
  gesto: string | null = null;
  /** De 0 a 1: o quanto o gesto manda sobre as poses. */
  pesoDoGesto = 0;
  /** Quanto tempo o gesto já tocou (s). */
  tempoDoGesto = 0;
  /** O instante da ação do gesto que se mostra agora (s): `tempoDoGesto`, ou, num ciclo, o trecho que repete. */
  tempoNaAcao = 0;

  private readonly base: Float64Array;
  private readonly de: Float64Array;
  private readonly alvo: Float64Array;
  private sobreposta = -1;
  private fracaoSobreposta = 0;
  private progresso = 1;
  private duracao = 0;
  private gestoDuracao = 0;
  private gestoEntrada = 0;
  private gestoSaida = 0;
  private gestoCiclo: readonly [number, number] | null = null;
  private gestoSegura = false;
  private soltoEm = -1;
  private saidaDoSolto = 0;

  constructor(
    readonly nomes: readonly string[],
    inicial: string,
  ) {
    this.pesos = new Float64Array(nomes.length);
    this.base = new Float64Array(nomes.length);
    this.de = new Float64Array(nomes.length);
    this.alvo = new Float64Array(nomes.length);
    this.base[this.indice(inicial)] = 1;
    this.alvo.set(this.base);
    this.de.set(this.base);
    this.compor();
  }

  /** Os pesos de saída: a base da troca, com a pose sobreposta por cima. */
  private compor(): void {
    const k = this.sobreposta < 0 ? 0 : this.fracaoSobreposta;
    for (let i = 0; i < this.pesos.length; i++) this.pesos[i] = this.base[i]! * (1 - k);
    if (this.sobreposta >= 0) this.pesos[this.sobreposta] = this.pesos[this.sobreposta]! + k;
  }

  /** O índice da pose; lança se o nome não existe. */
  indice(nome: string): number {
    const i = this.nomes.indexOf(nome);
    if (i < 0) throw new Error(`pose "${nome}" não existe`);
    return i;
  }

  /** A pose que pesa mais agora. */
  get atual(): string {
    let melhor = 0;
    for (let i = 1; i < this.pesos.length; i++) if (this.pesos[i]! > this.pesos[melhor]!) melhor = i;
    return this.nomes[melhor]!;
  }

  /** Vai para a pose em `duracaoS` (0 = já), saindo dos pesos de agora (sem a sobreposta). */
  ir(nome: string, duracaoS: number): void {
    const i = this.indice(nome);
    this.de.set(this.base);
    this.alvo.fill(0);
    this.alvo[i] = 1;
    this.duracao = duracaoS;
    this.progresso = duracaoS > 0 ? 0 : 1;
    if (duracaoS <= 0) {
      this.base.set(this.alvo);
      this.compor();
    }
  }

  /** Mistura duas poses à mão: `t` 0 = só `a`, 1 = só `b`. Cancela uma troca em curso. */
  misturar(a: string, b: string, t: number): void {
    const k = limitar(t);
    this.base.fill(0);
    const ia = this.indice(a);
    const ib = this.indice(b);
    this.base[ia] = 1 - k;
    this.base[ib] = this.base[ib]! + k;
    this.alvo.set(this.base);
    this.de.set(this.base);
    this.progresso = 1;
    this.compor();
  }

  /**
   * Sobrepõe a pose `nome` com a fração `t` (0 = nada, 1 = só ela) por cima do que a base está fazendo, troca em curso inclusive:
   * a pinça sobre a ponte que a mão escolheu. Vale a cada quadro até mudar.
   */
  sobrepor(nome: string, t: number): void {
    this.sobreposta = this.indice(nome);
    this.fracaoSobreposta = limitar(t);
    this.compor();
  }

  /**
   * Faz um gesto por cima das poses: entra em `entradaS`, toca até `duracaoS` e sai nos últimos `saidaS`. Com `cicloS` o trecho
   * repete e com `segurar` o último quadro fica, nos dois casos até `soltarGesto`. Um gesto novo no meio de outro recomeça do zero.
   */
  fazerGesto(nome: string, duracaoS: number, entradaS: number, saidaS: number, opcoes: OpcoesDoGesto = {}): void {
    this.gesto = nome;
    this.tempoDoGesto = 0;
    this.tempoNaAcao = 0;
    this.gestoDuracao = Math.max(duracaoS, 1e-3);
    this.gestoEntrada = Math.max(entradaS, 0);
    this.gestoSaida = Math.max(saidaS, 0);
    this.gestoCiclo = opcoes.cicloS ?? null;
    this.gestoSegura = opcoes.segurar === true;
    this.soltoEm = -1;
    this.pesoDoGesto = this.gestoEntrada > 0 ? 0 : 1;
  }

  /** Larga o gesto já, sem a saída suave. */
  cancelarGesto(): void {
    this.gesto = null;
    this.pesoDoGesto = 0;
    this.tempoDoGesto = 0;
    this.tempoNaAcao = 0;
    this.gestoCiclo = null;
    this.gestoSegura = false;
    this.soltoEm = -1;
  }

  /** Solta o gesto que repete ou se segura: sai em `saidaS` (padrão: a do gesto). Sem gesto não faz nada; saída 0 larga já. */
  soltarGesto(saidaS: number = this.gestoSaida): void {
    if (this.gesto === null || this.soltoEm >= 0) return;
    if (saidaS <= 0) {
      this.cancelarGesto();
      return;
    }
    this.soltoEm = this.tempoDoGesto;
    this.saidaDoSolto = saidaS;
  }

  atualizar(dt: number): void {
    const passo = Math.max(dt, 0);
    if (this.progresso < 1) {
      this.progresso = this.duracao > 0 ? Math.min(this.progresso + passo / this.duracao, 1) : 1;
      const k = suave(this.progresso);
      for (let i = 0; i < this.base.length; i++) this.base[i] = this.de[i]! + (this.alvo[i]! - this.de[i]!) * k;
      this.compor();
    }
    if (this.gesto === null) return;
    this.tempoDoGesto += passo;
    const repete = this.gestoCiclo !== null;
    if (!repete && !this.gestoSegura && this.tempoDoGesto >= this.gestoDuracao) {
      this.cancelarGesto();
      return;
    }
    this.tempoNaAcao = this.tempoDaAcao();
    const entrada = this.gestoEntrada > 0 ? suave(limitar(this.tempoDoGesto / this.gestoEntrada)) : 1;
    let saida = 1;
    if (this.soltoEm >= 0) {
      const decorrido = this.tempoDoGesto - this.soltoEm;
      if (decorrido >= this.saidaDoSolto) {
        this.cancelarGesto();
        return;
      }
      saida = suave(limitar(1 - decorrido / this.saidaDoSolto));
    } else if (!repete && !this.gestoSegura) {
      saida = this.gestoSaida > 0 ? suave(limitar((this.gestoDuracao - this.tempoDoGesto) / this.gestoSaida)) : 1;
    }
    this.pesoDoGesto = Math.min(entrada, saida);
  }

  /** O instante da ação para `tempoDoGesto`: corrido até o fim da ação, ou, com ciclo, repetindo de `de` a `até`. */
  private tempoDaAcao(): number {
    const t = this.tempoDoGesto;
    if (this.gestoCiclo !== null) {
      const [de, ate] = this.gestoCiclo;
      return t < ate ? t : de + ((t - de) % Math.max(ate - de, 1e-6));
    }
    return Math.min(t, this.gestoDuracao);
  }
}
