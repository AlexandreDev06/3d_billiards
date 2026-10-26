import { gravarJson, lerJson, apagarJson, type ArmazenamentoMinimo } from '../armazenamento';
import { CONFIGURACOES_PADRAO, ehPadrao, limitar, sanear, type ChaveDeConfiguracao, type ConfiguracoesDoJogador } from './modelo';

const PREFIXO = 'sinuca.config.';
const VERSAO = 1;

export interface PerfilDeConfiguracao {
  /** Identifica de quem são os valores: `online` ou `hotseat.<id do jogador>`. Vira parte da chave do armazenamento. */
  readonly chave: string;
  /** Como a engrenagem chama o dono: "Jogador 2", "Você (Ana)". */
  readonly rotulo: string;
}

/**
 * As configurações de cada perfil, uma cópia por jogador. Quem mexe vê a mudança na hora (`aoMudar`) e ela fica
 * guardada neste aparelho; trocar de perfil (a vez muda no hot-seat) carrega os valores do outro. Sem
 * armazenamento (bloqueado), os valores valem enquanto a página estiver aberta.
 */
export class GerenteDeConfiguracoes {
  private readonly memoria = new Map<string, ConfiguracoesDoJogador>();
  private perfilAtual: PerfilDeConfiguracao | null = null;
  private valoresAtuais: ConfiguracoesDoJogador = CONFIGURACOES_PADRAO;
  private readonly ouvintes = new Set<() => void>();

  constructor(private readonly armazenamento: ArmazenamentoMinimo | null) {}

  /** O perfil em edição; `null` antes do primeiro `usar`. */
  get perfil(): PerfilDeConfiguracao | null {
    return this.perfilAtual;
  }

  get valores(): ConfiguracoesDoJogador {
    return this.valoresAtuais;
  }

  get padrao(): boolean {
    return ehPadrao(this.valoresAtuais);
  }

  /** Passa a editar e aplicar o perfil de outro dono (ou o mesmo, com outro rótulo). Avisa se algo mudou. */
  usar(perfil: PerfilDeConfiguracao): void {
    const mudouDeDono = this.perfilAtual?.chave !== perfil.chave;
    const mudouRotulo = this.perfilAtual?.rotulo !== perfil.rotulo;
    this.perfilAtual = perfil;
    if (mudouDeDono) this.valoresAtuais = this.carregar(perfil.chave);
    if (mudouDeDono || mudouRotulo) this.avisar();
  }

  definir(chave: ChaveDeConfiguracao, valor: number): void {
    if (this.perfilAtual === null) return;
    const limitado = limitar(chave, valor);
    if (this.valoresAtuais[chave] === limitado) return;
    this.valoresAtuais = { ...this.valoresAtuais, [chave]: limitado };
    this.guardar();
    this.avisar();
  }

  /** Volta o perfil em edição ao padrão do jogo. */
  restaurar(): void {
    if (this.perfilAtual === null || this.padrao) return;
    this.valoresAtuais = CONFIGURACOES_PADRAO;
    this.guardar();
    this.avisar();
  }

  /** Escuta qualquer mudança de valor ou de perfil; devolve quem para de escutar. */
  aoMudar(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte);
    return () => void this.ouvintes.delete(ouvinte);
  }

  private carregar(chave: string): ConfiguracoesDoJogador {
    const lembrado = this.memoria.get(chave);
    if (lembrado) return lembrado;
    const bruto = lerJson(PREFIXO + chave, this.armazenamento) as { valores?: unknown } | null;
    const valores = sanear(bruto?.valores);
    this.memoria.set(chave, valores);
    return valores;
  }

  private guardar(): void {
    const chave = this.perfilAtual!.chave;
    this.memoria.set(chave, this.valoresAtuais);
    if (this.padrao) apagarJson(PREFIXO + chave, this.armazenamento);
    else gravarJson(PREFIXO + chave, { versao: VERSAO, valores: this.valoresAtuais }, this.armazenamento);
  }

  private avisar(): void {
    for (const ouvinte of [...this.ouvintes]) ouvinte();
  }
}
