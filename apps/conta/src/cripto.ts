/** Web Crypto puro (Workers e Node): nada de `node:*` aqui. O aleatório vem de fora para o teste fixar. */

/** O teto de iterações do PBKDF2 no Workers. */
export const ITERACOES = 100_000;

const codificador = new TextEncoder();

export type Aleatorio = (n: number) => Uint8Array;

/** O aleatório de produção. */
export const aleatorioDoSistema: Aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));

const paraHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Bytes em hexadecimal minúsculo. É como o hash e o sal ficam guardados (texto): `SqlMinimo` só liga texto e número. */
export const bytesParaHex = paraHex;

/** O caminho de volta de `bytesParaHex`; texto que não é hexadecimal par dá bytes vazios, que nunca conferem com um hash. */
export function hexParaBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function paraBase64Url(bytes: Uint8Array): string {
  let texto = '';
  for (const b of bytes) texto += String.fromCharCode(b);
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SHA-256 em hexadecimal minúsculo (64 caracteres). É o `id` do convidado: o mesmo da carteira da sinuca. */
export async function resumoHex(texto: string): Promise<string> {
  return paraHex(new Uint8Array(await crypto.subtle.digest('SHA-256', codificador.encode(texto))));
}

/** 32 bytes aleatórios em base64url (43 caracteres). */
export function tokenAleatorio(aleatorio: Aleatorio): string {
  return paraBase64Url(aleatorio(32));
}

/** `PBKDF2(HMAC-SHA256(pepper, senha), sal, iteracoes, SHA-256, 256 bits)`. */
export async function hashDaSenha(senha: string, sal: Uint8Array, pepper: string, iteracoes: number = ITERACOES): Promise<Uint8Array> {
  const chaveDoPepper = await crypto.subtle.importKey('raw', codificador.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const material = new Uint8Array(await crypto.subtle.sign('HMAC', chaveDoPepper, codificador.encode(senha)));
  const base = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, base, 256));
}

export async function senhaConfere(senha: string, guardado: { hash: Uint8Array; sal: Uint8Array; iteracoes: number }, pepper: string): Promise<boolean> {
  const calculado = await hashDaSenha(senha, guardado.sal, pepper, guardado.iteracoes);
  return iguaisEmTempoConstante(calculado, guardado.hash);
}

export function iguaisEmTempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  let diferenca = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferenca === 0;
}
