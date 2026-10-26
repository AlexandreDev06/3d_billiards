import { apagarJson, gravarJson, lerJson, type ArmazenamentoMinimo } from '../armazenamento';

export interface RegistroDaSala {
  readonly token: string;
  readonly nome: string;
}

/** Sem batida por tanto tempo (ms), a aba dona do token é dada como fechada. */
export const JANELA_DA_ABA_MS = 12_000;

const CHAVE_APELIDO = 'sinuca.apelido';
const chaveDaSala = (codigo: string): string => `sinuca.sala.${codigo}`;
const CHAVE_DA_ABA = 'sinuca.aba';

interface Guardado extends RegistroDaSala {
  readonly aba: string;
  readonly vivoEm: number;
}

function formaCerta(valor: unknown): valor is Guardado {
  if (typeof valor !== 'object' || valor === null) return false;
  const v = valor as Record<string, unknown>;
  return typeof v.token === 'string' && typeof v.nome === 'string' && typeof v.aba === 'string' && typeof v.vivoEm === 'number';
}

/** Identificador desta aba: o `sessionStorage` o mantém ao recarregar; sem ele, vale só até fechar a página. */
export function idDaAba(sessao: ArmazenamentoMinimo | null): string {
  try {
    const existente = sessao?.getItem(CHAVE_DA_ABA);
    if (existente) return existente;
  } catch {
    // sem sessionStorage: segue com um id novo
  }
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    sessao?.setItem(CHAVE_DA_ABA, id);
  } catch {
    // idem
  }
  return id;
}

/**
 * O token que a sala deu a este jogador, guardado por código de sala no `localStorage`: recarregar a
 * página ou voltar de uma queda devolve o mesmo lugar. Duas abas do mesmo navegador não dividem o
 * token: quem o guardou dá batidas enquanto vive, e outra aba só o usa depois que as batidas param
 * (senão a segunda aba tomaria o lugar da primeira).
 */
export class ArmazemDeSessao {
  constructor(
    private readonly local: ArmazenamentoMinimo | null,
    private readonly aba: string,
    private readonly agora: () => number = Date.now,
  ) {}

  /** O que esta aba pode usar para voltar à sala: o que ela mesma guardou, ou o de aba que já fechou. */
  ler(codigo: string): RegistroDaSala | null {
    const guardado = lerJson(chaveDaSala(codigo), this.local);
    if (!formaCerta(guardado)) return null;
    if (guardado.aba !== this.aba && this.agora() - guardado.vivoEm < JANELA_DA_ABA_MS) return null;
    return { token: guardado.token, nome: guardado.nome };
  }

  gravar(codigo: string, registro: RegistroDaSala): void {
    const guardado: Guardado = { ...registro, aba: this.aba, vivoEm: this.agora() };
    gravarJson(chaveDaSala(codigo), guardado, this.local);
  }

  /** Mostra que esta aba segue viva com o token (só se o token é dela). */
  batida(codigo: string): void {
    const guardado = lerJson(chaveDaSala(codigo), this.local);
    if (formaCerta(guardado) && guardado.aba === this.aba) this.gravar(codigo, guardado);
  }

  apagar(codigo: string): void {
    const guardado = lerJson(chaveDaSala(codigo), this.local);
    if (formaCerta(guardado) && guardado.aba !== this.aba && this.agora() - guardado.vivoEm < JANELA_DA_ABA_MS) return;
    apagarJson(chaveDaSala(codigo), this.local);
  }

  /** O último apelido usado, para já vir no campo. */
  apelido(): string {
    const valor = lerJson(CHAVE_APELIDO, this.local);
    return typeof valor === 'string' ? valor : '';
  }

  lembrarApelido(nome: string): void {
    gravarJson(CHAVE_APELIDO, nome, this.local);
  }
}
