import { ALFABETO_CODIGO, TAMANHO_CODIGO, normalizarCodigo } from '@sinuca/protocolo';

/** O código digitado ou colado, em maiúsculas e sem espaços nem hífens. */
export const limparCodigo = normalizarCodigo;

/** Cinco caracteres do alfabeto da sala (sem 0, 1, I, L e O). */
export function codigoValido(texto: string): boolean {
  const codigo = normalizarCodigo(texto);
  return codigo.length === TAMANHO_CODIGO && [...codigo].every((letra) => ALFABETO_CODIGO.includes(letra));
}

/** O código de `?sala=` na URL; `null` se não há ou não tem a forma de um código. */
export function codigoDaUrl(search: string): string | null {
  const bruto = new URLSearchParams(search).get('sala');
  if (bruto === null) return null;
  const codigo = normalizarCodigo(bruto);
  return codigoValido(codigo) ? codigo : null;
}

/** O link do convite: a página do jogo com `?sala=CODIGO`. */
export function linkDoConvite(origem: string, codigo: string): string {
  return `${origem.replace(/\/+$/, '')}/?sala=${encodeURIComponent(codigo)}`;
}

/** A sala fala pelo mesmo endereço da página (`/sala`): `wss` quando a página é `https`, como no ngrok. */
export function urlDoSocket(local: { readonly protocol: string; readonly host: string }): string {
  return `${local.protocol === 'https:' ? 'wss:' : 'ws:'}//${local.host}/sala`;
}

/** A URL da página sem `?sala=` (ao sair da sala); mantém o resto da busca. */
export function semSalaNaUrl(search: string): string {
  const parametros = new URLSearchParams(search);
  parametros.delete('sala');
  const resto = parametros.toString();
  return resto === '' ? '' : `?${resto}`;
}

/** A URL da página com `?sala=CODIGO`; mantém o resto da busca. */
export function comSalaNaUrl(search: string, codigo: string): string {
  const parametros = new URLSearchParams(search);
  parametros.set('sala', codigo);
  return `?${parametros.toString()}`;
}
