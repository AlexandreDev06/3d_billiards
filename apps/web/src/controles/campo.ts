/** A tecla foi digitada num campo (slider, texto, botão): os atalhos do jogo ficam quietos. */
export function teclaEmCampo(alvo: EventTarget | null): boolean {
  const elemento = alvo as { closest?: (seletores: string) => unknown } | null;
  return typeof elemento?.closest === 'function' && elemento.closest('input, textarea, select, button') !== null;
}

/** Tipos de `<input>` que não recebem texto: dígito digitado neles não vai a lugar nenhum. */
const INPUT_SEM_TEXTO: ReadonlySet<string> = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'image', 'file', 'color']);

/**
 * A tecla foi digitada onde se escreve (texto, número, busca, lista, `contenteditable`). Mais estreita que `teclaEmCampo`: um
 * botão ou um controle sem texto (caixa de marcar, slider) não pega o dígito, então o atalho de um dígito segue valendo com o
 * foco num botão que acabou de ser clicado.
 */
export function teclaEmCampoDeTexto(alvo: EventTarget | null): boolean {
  const elemento = alvo as { tagName?: unknown; type?: unknown; isContentEditable?: unknown } | null;
  if (typeof elemento?.tagName !== 'string') return false;
  const tag = elemento.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') return !INPUT_SEM_TEXTO.has(typeof elemento.type === 'string' ? elemento.type.toLowerCase() : 'text');
  return elemento.isContentEditable === true;
}
