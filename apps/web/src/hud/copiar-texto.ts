/**
 * Copia `texto` para a área de transferência. Sem permissão ou sem contexto seguro (http fora do localhost), seleciona o texto do
 * `campo` para o Ctrl+C e tenta o `execCommand`. Devolve se copiou.
 */
export async function copiarTexto(texto: string, campo?: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    if (campo) {
      campo.select();
      return document.execCommand('copy');
    }
    return false;
  }
}
