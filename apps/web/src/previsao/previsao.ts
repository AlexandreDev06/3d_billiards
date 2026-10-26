import type { ConfigFisica, Gravacao, ParametrosTacada, ResultadoTacada } from '@sinuca/fisica';
import type { ConfigPrevisao } from '../config';
import { CaminhoPrevisto, extrairPrevisao } from './caminho';
import { Espacador } from './espacador';

/** O que a tacada prevista lê da mira, do efeito e do giz de agora. Mutável: quem chama reaproveita o mesmo objeto a cada quadro. */
export interface EntradaDaPrevisao {
  angulo: number;
  lateral: number;
  vertical: number;
  giz: number;
}

/** Onde a previsão aparece (a linha na cena); os testes usam uma falsa. */
export interface SaidaDaPrevisao {
  mostrar(caminho: CaminhoPrevisto, comBolaAtingida: boolean): void;
  esconder(): void;
  /** O efeito passou do círculo seguro: a linha muda de cor para avisar do risco de miscue. */
  definirRisco(emRisco: boolean): void;
}

export interface DependenciasPrevisao {
  /** `Jogo.preverTacada`: a física de verdade a partir da mesa de agora. */
  prever(parametros: ParametrosTacada, ajuste: Partial<ConfigFisica>): ResultadoTacada;
  readonly saida: SaidaDaPrevisao;
  /** Efeito e giz de agora passam do círculo seguro? Sem isto a linha nunca avisa. */
  readonly emRisco?: (entrada: EntradaDaPrevisao) => boolean;
  /** Relógio em ms para medir o custo; padrão `performance.now`. */
  readonly agora?: () => number;
}

/**
 * Linha de previsão do painel dev, sem DOM nem three: recalcula a tacada só quando algo mudou (mira,
 * efeito, giz, força, config, mesa), no máximo de tempos em tempos, e entrega o caminho extraído à saída.
 * O cálculo é a `simularTacada` de verdade; aqui só se decide quando rodá-la.
 */
export class PrevisaoDeTacada {
  /** Reaproveitado a cada cálculo. */
  readonly caminho = new CaminhoPrevisto();
  /** Custo do último cálculo (simulação e extração), em ms. */
  ultimoCustoMs = 0;
  /** Quantas simulações já rodaram (os testes e o gancho conferem se a entrada parada não gasta nenhuma). */
  calculos = 0;
  /** Mensagem da simulação que falhou no último cálculo; `null` se deu certo. */
  erro: string | null = null;
  /** Gravação do último cálculo bem-sucedido, para conferir com a tacada real. */
  gravacao: Gravacao | null = null;

  private cfg: ConfigPrevisao | null = null;
  private espacador: Espacador | null = null;
  private sujo = true;
  /** O que a saída está mostrando; `null` até a primeira vez, para o primeiro `esconder` chegar. */
  private visivel: boolean | null = null;
  /** O que a saída está avisando; `null` até o primeiro aviso, para o primeiro `definirRisco` chegar. */
  private risco: boolean | null = null;
  private ultima: EntradaDaPrevisao = { angulo: NaN, lateral: NaN, vertical: NaN, giz: NaN };
  private readonly ajuste: { duracaoMaxima: number } = { duracaoMaxima: 0 };
  private readonly agora: () => number;

  constructor(private readonly deps: DependenciasPrevisao) {
    this.agora = deps.agora ?? (() => performance.now());
  }

  /** Nova config (liga/desliga, força, comprimentos): o próximo quadro recalcula. */
  configurar(cfg: ConfigPrevisao): void {
    this.cfg = cfg;
    this.espacador ??= new Espacador(cfg);
    this.sujo = true;
  }

  /** A mesa ou a config de física mudou: recalcula mesmo com a mesma mira. */
  invalidar(): void {
    this.sujo = true;
  }

  /**
   * Uma vez por quadro. `ativa` = é a vez de mirar (nada animando, partida em curso); fora disso a linha some.
   * Só simula se a entrada mudou, ou se `invalidar`/`configurar` foi chamado, e o espaço desde o último cálculo passou.
   */
  atualizar(agoraMs: number, ativa: boolean, entrada: EntradaDaPrevisao): void {
    const cfg = this.cfg;
    if (!cfg || !this.espacador) return;
    if (!cfg.ligada || !ativa) {
      this.esconder();
      this.sujo = true;
      return;
    }
    this.avisarRisco(entrada);
    const u = this.ultima;
    if (entrada.angulo !== u.angulo || entrada.lateral !== u.lateral || entrada.vertical !== u.vertical || entrada.giz !== u.giz) this.sujo = true;
    if (!this.sujo || !this.espacador.pode(agoraMs)) return;
    this.calcular(agoraMs, cfg, entrada);
  }

  private calcular(agoraMs: number, cfg: ConfigPrevisao, entrada: EntradaDaPrevisao): void {
    const inicio = this.agora();
    this.calculos++;
    this.sujo = false;
    this.ultima = { angulo: entrada.angulo, lateral: entrada.lateral, vertical: entrada.vertical, giz: entrada.giz };
    this.ajuste.duracaoMaxima = cfg.duracaoMaximaS;
    try {
      const resultado = this.deps.prever(
        { angulo: entrada.angulo, velocidadeTaco: cfg.velocidadeTaco, efeito: { lateral: entrada.lateral, vertical: entrada.vertical }, elevacao: 0, giz: entrada.giz },
        this.ajuste,
      );
      extrairPrevisao(resultado.gravacao, cfg, this.caminho);
      this.gravacao = resultado.gravacao;
      this.erro = null;
      this.deps.saida.mostrar(this.caminho, cfg.bolaAtingida);
      this.visivel = true;
    } catch (e) {
      this.erro = e instanceof Error ? e.message : String(e);
      this.gravacao = null;
      this.esconder();
    } finally {
      this.ultimoCustoMs = this.agora() - inicio;
      this.espacador!.registrar(agoraMs, this.ultimoCustoMs);
    }
  }

  /** A cor muda na hora, sem esperar o espaço entre cálculos: só depende do efeito e do giz. */
  private avisarRisco(entrada: EntradaDaPrevisao): void {
    const risco = this.deps.emRisco?.(entrada) ?? false;
    if (risco === this.risco) return;
    this.risco = risco;
    this.deps.saida.definirRisco(risco);
  }

  private esconder(): void {
    if (this.visivel === false) return;
    this.visivel = false;
    this.deps.saida.esconder();
  }
}
