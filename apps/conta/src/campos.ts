import type { ResultadoDeSenha } from './contrato';

const EMAIL_MAX = 254;
const NOME_MAX = 20;
const SENHA_MIN = 8;
const SENHA_MAX = 128;

const FORMA_DO_EMAIL = /^[^\s@\p{Cc}]+@[^\s@\p{Cc}]+$/u;
const ID_DE_CONTA = /^[0-9a-f]{64}$/;
const CHAVE = /^[a-z0-9][a-z0-9:._-]{0,119}$/;
const CODIGO_DE_CONVIDADO = /^[A-Za-z0-9_-]{43}$/;
const CONTROLE = /\p{Cc}/u;

/** `trim` e minúsculas; devolve `null` se não parece um e-mail ou passa de 254 caracteres. Não faz `normalize`. */
export function normalizarEmail(bruto: unknown): string | null {
  if (typeof bruto !== 'string' || bruto.length > EMAIL_MAX + 64) return null;
  const email = bruto.trim().toLowerCase();
  if (email.length === 0 || email.length > EMAIL_MAX || !FORMA_DO_EMAIL.test(email)) return null;
  const dominio = email.slice(email.indexOf('@') + 1);
  if (dominio.includes('@')) return null;
  const partes = dominio.split('.');
  if (partes.length < 2 || partes.some((p) => p.length === 0)) return null;
  return email;
}

/** Nome da mesa: NFC, `trim`, de 1 a 20 pontos de código, sem caractere de controle. */
export function validarNome(bruto: unknown): string | null {
  if (typeof bruto !== 'string' || bruto.length > NOME_MAX * 2 + 64) return null;
  const nome = bruto.normalize('NFC').trim();
  if (nome.length === 0 || CONTROLE.test(nome)) return null;
  const tamanho = Array.from(nome).length;
  return tamanho >= 1 && tamanho <= NOME_MAX ? nome : null;
}

/** De 8 a 128 pontos de código. Texto enorme é recusado pelo tamanho, sem contar nada (e antes de qualquer hash). */
export function validarSenha(bruto: unknown): ResultadoDeSenha {
  if (typeof bruto !== 'string') return 'senha-curta';
  if (bruto.length > SENHA_MAX * 2) return 'senha-longa';
  const tamanho = Array.from(bruto).length;
  if (tamanho < SENHA_MIN) return 'senha-curta';
  return tamanho > SENHA_MAX ? 'senha-longa' : 'ok';
}

export function ehIdDeConta(x: unknown): x is string {
  return typeof x === 'string' && ID_DE_CONTA.test(x);
}

export function ehChave(x: unknown): x is string {
  return typeof x === 'string' && CHAVE.test(x);
}

/** O mesmo formato do código de carteira da sinuca (43 caracteres base64url). */
export function ehCodigoDeConvidado(x: unknown): x is string {
  return typeof x === 'string' && CODIGO_DE_CONVIDADO.test(x);
}
