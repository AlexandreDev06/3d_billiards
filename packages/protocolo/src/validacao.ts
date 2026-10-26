/**
 * Validação de mensagens vindas da rede: pequenos combinadores que devolvem uma
 * cópia só com o que o contrato prevê (chave desconhecida é erro) e lançam
 * `ErroDeForma` com o caminho do problema. `validar` converte em `Resultado`.
 */

export class ErroDeForma extends Error {
  constructor(caminho: string, motivo: string) {
    super(`${caminho}: ${motivo}`);
    this.name = 'ErroDeForma';
  }
}

export type Esquema<T> = (valor: unknown, caminho: string) => T;

export type Resultado<T> = { readonly ok: true; readonly valor: T } | { readonly ok: false; readonly erro: string };

export function validar<T>(esquema: Esquema<T>, valor: unknown): Resultado<T> {
  try {
    return { ok: true, valor: esquema(valor, '$') };
  } catch (e) {
    if (e instanceof ErroDeForma) return { ok: false, erro: e.message };
    throw e;
  }
}

export const recusar = (caminho: string, motivo: string): never => {
  throw new ErroDeForma(caminho, motivo);
};

export function numero(opcoes: { min?: number; max?: number; inteiro?: boolean }): Esquema<number> {
  return (v, c) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return recusar(c, 'precisa ser um número finito');
    if (opcoes.inteiro && !Number.isInteger(v)) return recusar(c, 'precisa ser inteiro');
    if (opcoes.min !== undefined && v < opcoes.min) return recusar(c, `menor que ${opcoes.min}`);
    if (opcoes.max !== undefined && v > opcoes.max) return recusar(c, `maior que ${opcoes.max}`);
    return v;
  };
}

const temControle = (s: string): boolean => {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
};

/** Texto sem caracteres de controle; `min`/`max` contam pontos de código. */
export function texto(opcoes: { min?: number; max: number; padrao?: RegExp }): Esquema<string> {
  return (v, c) => {
    if (typeof v !== 'string') return recusar(c, 'precisa ser texto');
    if (v.length > opcoes.max * 2) return recusar(c, `mais de ${opcoes.max} caracteres`);
    const tamanho = [...v].length;
    if (tamanho > opcoes.max) return recusar(c, `mais de ${opcoes.max} caracteres`);
    if (tamanho < (opcoes.min ?? 0)) return recusar(c, `menos de ${opcoes.min} caracteres`);
    if (temControle(v)) return recusar(c, 'caractere de controle');
    if (opcoes.padrao && !opcoes.padrao.test(v)) return recusar(c, 'formato inválido');
    return v;
  };
}

export const booleano: Esquema<boolean> = (v, c) => (typeof v === 'boolean' ? v : recusar(c, 'precisa ser verdadeiro ou falso'));

export function literal<T extends string | number | boolean>(...aceitos: readonly T[]): Esquema<T> {
  return (v, c) => (aceitos.includes(v as T) ? (v as T) : recusar(c, `precisa ser um de ${JSON.stringify(aceitos)}`));
}

export function nulavel<T>(esquema: Esquema<T>): Esquema<T | null> {
  return (v, c) => (v === null ? null : esquema(v, c));
}

export function lista<T>(item: Esquema<T>, opcoes: { min?: number; max: number }): Esquema<T[]> {
  return (v, c) => {
    if (!Array.isArray(v)) return recusar(c, 'precisa ser uma lista');
    if (v.length > opcoes.max) return recusar(c, `mais de ${opcoes.max} itens`);
    if (v.length < (opcoes.min ?? 0)) return recusar(c, `menos de ${opcoes.min} itens`);
    return v.map((x, i) => item(x, `${c}[${i}]`));
  };
}

/** Depois da forma, confere o que só se vê com o valor inteiro (o mínimo do desgaste não passa do máximo). */
export function aposValidar<T>(esquema: Esquema<T>, conferir: (valor: T, caminho: string) => void): Esquema<T> {
  return (v, c) => {
    const r = esquema(v, c);
    conferir(r, c);
    return r;
  };
}

/** A lista não pode repetir `chave(item)`. */
export function unicos<T>(esquema: Esquema<T[]>, chave: (item: T) => unknown): Esquema<T[]> {
  return (v, c) => {
    const r = esquema(v, c);
    if (new Set(r.map(chave)).size !== r.length) return recusar(c, 'itens repetidos');
    return r;
  };
}

type Esquemas = Readonly<Record<string, Esquema<unknown>>>;
type Saida<E extends Esquemas> = { [K in keyof E]: ReturnType<E[K]> };

/** Objeto simples com exatamente as chaves de `obrigatorios` mais, se vierem, as de `opcionais`. */
export function objeto<O extends Esquemas, P extends Esquemas = Record<never, never>>(
  obrigatorios: O,
  opcionais?: P,
): Esquema<Saida<O> & Partial<Saida<P>>> {
  const talhe = (opcionais ?? {}) as Esquemas;
  return (v, c) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return recusar(c, 'precisa ser um objeto');
    const proto: unknown = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return recusar(c, 'precisa ser um objeto simples');
    const dado = v as Record<string, unknown>;
    for (const chave of Object.keys(dado)) {
      if (!Object.hasOwn(obrigatorios, chave) && !Object.hasOwn(talhe, chave)) return recusar(`${c}.${chave}`, 'chave desconhecida');
    }
    const saida: Record<string, unknown> = {};
    for (const chave of Object.keys(obrigatorios)) {
      if (!Object.hasOwn(dado, chave)) return recusar(`${c}.${chave}`, 'falta');
      saida[chave] = obrigatorios[chave]!(dado[chave], `${c}.${chave}`);
    }
    for (const chave of Object.keys(talhe)) {
      if (Object.hasOwn(dado, chave)) saida[chave] = talhe[chave]!(dado[chave], `${c}.${chave}`);
    }
    return saida as Saida<O> & Partial<Saida<P>>;
  };
}
