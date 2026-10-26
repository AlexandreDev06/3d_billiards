/** O que usamos de `Storage`; aceita um falso nos testes. */
export interface ArmazenamentoMinimo {
  getItem(chave: string): string | null;
  setItem(chave: string, valor: string): void;
  removeItem(chave: string): void;
}

/** `localStorage`, ou `null` se o navegador o bloqueia (o simples acesso já pode lançar). */
export function armazenamentoLocal(): ArmazenamentoMinimo | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Lê e decodifica; `null` se não há, está corrompido ou o armazenamento falha. */
export function lerJson(chave: string, armazenamento: ArmazenamentoMinimo | null = armazenamentoLocal()): unknown {
  try {
    const texto = armazenamento?.getItem(chave);
    return texto == null ? null : JSON.parse(texto);
  } catch {
    return null;
  }
}

/** `false` se não foi possível gravar (bloqueado, cheio, valor não serializável). */
export function gravarJson(chave: string, valor: unknown, armazenamento: ArmazenamentoMinimo | null = armazenamentoLocal()): boolean {
  if (!armazenamento) return false;
  try {
    armazenamento.setItem(chave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}

export function apagarJson(chave: string, armazenamento: ArmazenamentoMinimo | null = armazenamentoLocal()): boolean {
  if (!armazenamento) return false;
  try {
    armazenamento.removeItem(chave);
    return true;
  } catch {
    return false;
  }
}

/** `sessionStorage` (vale por aba e sobrevive a recarregar), ou `null` se o navegador o bloqueia. */
export function armazenamentoDaAba(): ArmazenamentoMinimo | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
