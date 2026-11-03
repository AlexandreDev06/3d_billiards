const memoria = new WeakMap<object, Map<string, unknown>>();

/**
 * Guarda o resultado de uma medida cara da calibração (a pele do modelo em muitas poses) por modelo e `chave`: calibrar de novo o
 * mesmo modelo com os mesmos números (os testes, a mão que recarrega) devolve o que já foi medido. O resultado não pode mudar depois.
 */
export function medidaDaCalibracao<T>(modelo: object, chave: string, medir: () => T): T {
  let porChave = memoria.get(modelo);
  if (porChave === undefined) {
    porChave = new Map();
    memoria.set(modelo, porChave);
  }
  if (!porChave.has(chave)) porChave.set(chave, medir());
  return porChave.get(chave) as T;
}
