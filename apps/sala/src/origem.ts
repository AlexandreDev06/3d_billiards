/**
 * Origin do upgrade do WebSocket. Navegador sempre manda o Origin da página que abriu a conexão; quem
 * não manda (cliente de linha de comando, testes) não é um site usando o navegador de outra pessoa, e
 * pode mentir qualquer Origin de qualquer jeito, então a falta dele passa.
 */
export function origemPermitida(origem: string | undefined, permitidas: readonly string[]): boolean {
  if (origem === undefined) return true;
  const alvo = origem.toLowerCase();
  return permitidas.some((o) => o.toLowerCase() === alvo);
}
