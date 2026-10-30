/**
 * A varredura das contas excluídas por outro caminho (L61): quem exclui a conta pelo portal não passa pela sinuca, então a carteira de
 * itens dela (tacos, balão, missões, estatísticas) ficaria órfã. A sinuca pergunta ao Banco `excluidasDesde(ms, limite)` ao acordar e,
 * no máximo uma vez por hora, no alarm, guarda o `ate` que ele devolve (onde parou) e apaga a carteira de cada `id`. Apagar de novo uma
 * carteira que já não existe não faz nada, então o `>=` do Banco (que repete a última) e uma varredura repetida são inofensivos.
 * Só `id`s e contagens vão ao log.
 */
import { comPrazo, type BancoDaConta } from './conta-na-sinuca';
import type { Logger } from './log';

export const INTERVALO_DA_VARREDURA_MS = 3_600_000;
export const LIMITE_POR_CHAMADA = 500;
/** Quanto cada pergunta ao Banco espera: uma chamada pendurada seguraria o Durable Object acordado (sem hibernar) para sempre. */
export const PRAZO_DA_PERGUNTA_MS = 5000;
/** Páginas por varredura: o teto contra um laço sem fim se o Banco devolver sempre a mesma página cheia. */
const MAX_PAGINAS = 20;

export interface DependenciasDaVarredura {
  readonly banco: Pick<BancoDaConta, 'excluidasDesde'>;
  /**
   * Apaga as carteiras desses `id`s, põe os `id`s no registro dos excluídos e guarda `ate` (onde a varredura parou), tudo numa gravação só
   * (L61b: o ponto nunca avança sem as exclusões que ele cobre, nem as exclusões ficam sem o ponto). Devolve quantas carteiras existiam.
   * Lança se a gravação falhar: a varredura de agora acaba aqui e a próxima repete do mesmo ponto.
   */
  readonly apagar: (ids: readonly string[], ate: number) => number;
  readonly relogio: () => number;
  readonly log: Logger;
  /** Onde a varredura parou (ms), guardado por quem a usa; 0 se nunca rodou. */
  readonly lerAte: () => number;
  readonly prazoMs?: number;
}

export class VarreduraDeExcluidas {
  private ultimaEm = Number.NEGATIVE_INFINITY;
  private emCurso: Promise<number> | null = null;

  constructor(private readonly d: DependenciasDaVarredura) {}

  /**
   * Varre agora (`forcar`, ao acordar) ou só se passou uma hora desde a última (o alarm). Nunca lança: Banco fora do ar vai ao log e a
   * próxima tentativa repete do mesmo ponto. Devolve quantas carteiras foram apagadas. Duas chamadas juntas dividem a mesma varredura.
   */
  varrer(forcar = false): Promise<number> {
    if (this.emCurso) return this.emCurso;
    if (!forcar && this.d.relogio() - this.ultimaEm < INTERVALO_DA_VARREDURA_MS) return Promise.resolve(0);
    this.emCurso = this.executar().finally(() => {
      this.emCurso = null;
    });
    return this.emCurso;
  }

  private async executar(): Promise<number> {
    const { banco, apagar, log } = this.d;
    this.ultimaEm = this.d.relogio();
    let apagadas = 0;
    try {
      let ate = this.d.lerAte();
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        const r = await comPrazo(Promise.resolve(banco.excluidasDesde(ate, LIMITE_POR_CHAMADA)), this.d.prazoMs ?? PRAZO_DA_PERGUNTA_MS);
        const andou = r.ate !== ate;
        if (r.ids.length > 0 || andou) apagadas += apagar(r.ids, r.ate);
        ate = r.ate;
        if (r.ids.length < LIMITE_POR_CHAMADA || !andou) break;
      }
      if (apagadas > 0) log('varredura-de-excluidas', { apagadas });
    } catch (e) {
      log('varredura-de-excluidas-falhou', { erro: e instanceof Error ? e.message.slice(0, 100) : 'desconhecido' });
    }
    return apagadas;
  }
}
