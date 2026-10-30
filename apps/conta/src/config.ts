/** As variáveis do `wrangler.jsonc` (texto) lidas e conferidas. Puro, sem tipos do Worker: o teste roda no Node. Valor ruim lança com o nome da variável. */

const LOCAIS_DO_OBJETO = ['', 'wnam', 'enam', 'sam', 'weur', 'eeur', 'apac', 'oc', 'afr', 'me'] as const;
export type LocalDoObjeto = (typeof LOCAIS_DO_OBJETO)[number];

export interface ConfigDoBanco {
  readonly saldoInicial: number;
  readonly maxContas: number;
  /** O `Domain` do cookie; `null` em desenvolvimento (cookie do host). */
  readonly dominioDoCookie: string | null;
  readonly cookieSeguro: boolean;
  /** Origin extras (minúsculas), só desenvolvimento. */
  readonly origensDeDev: readonly string[];
  /** A dica de região do Durable Object; vazio = sem dica. */
  readonly localDo: LocalDoObjeto;
}

function inteiro(env: Readonly<Record<string, unknown>>, nome: string, padrao: number, min: number, max: number): number {
  const bruto = env[nome];
  if (bruto === undefined || bruto === '') return padrao;
  const n = typeof bruto === 'string' && /^\d{1,15}$/.test(bruto.trim()) ? Number(bruto.trim()) : NaN;
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new RangeError(`${nome} precisa ser um inteiro de ${min} a ${max}`);
  return n;
}

export function configDoBanco(env: Readonly<Record<string, unknown>>): ConfigDoBanco {
  const dominioBruto = typeof env.DOMINIO_DO_COOKIE === 'string' ? env.DOMINIO_DO_COOKIE.trim().toLowerCase() : '';
  if (dominioBruto !== '' && !/^\.?[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(dominioBruto)) throw new RangeError('DOMINIO_DO_COOKIE não é um domínio');
  // Seguro por padrão: só "0" ou "false" desligam o Secure (desenvolvimento em http).
  const seguro = typeof env.COOKIE_SEGURO === 'string' ? env.COOKIE_SEGURO.trim().toLowerCase() : '';
  if (!['', '0', '1', 'false', 'true'].includes(seguro)) throw new RangeError('COOKIE_SEGURO precisa ser 0 ou 1');
  const origens = (typeof env.ORIGENS_DE_DEV === 'string' ? env.ORIGENS_DE_DEV : '')
    .split(',')
    .map((o) => o.trim().toLowerCase())
    .filter((o) => o !== '');
  if (!origens.every((o) => /^https?:\/\/[^/\s?#]+$/.test(o))) throw new RangeError('ORIGENS_DE_DEV precisa ser uma lista de origens (http://host:porta) separadas por vírgula');
  const local = typeof env.LOCAL_DO === 'string' ? env.LOCAL_DO.trim() : '';
  if (!(LOCAIS_DO_OBJETO as readonly string[]).includes(local)) throw new RangeError(`LOCAL_DO precisa ser vazio ou um de ${LOCAIS_DO_OBJETO.join(', ')}`);
  const seguroLigado = seguro !== '0' && seguro !== 'false';
  // Origens de desenvolvimento aceitas com o cookie seguro do domínio da produção: uma variável esquecida abriria o POST para qualquer página local.
  if (origens.length > 0 && seguroLigado && /(^|\.)becogames\.app$/.test(dominioBruto)) {
    throw new RangeError('ORIGENS_DE_DEV não pode ser usada com COOKIE_SEGURO=1 e DOMINIO_DO_COOKIE de produção');
  }
  return {
    saldoInicial: inteiro(env, 'SALDO_INICIAL', 100, 0, 1_000_000_000),
    maxContas: inteiro(env, 'MAX_CONTAS', 50_000, 1, 10_000_000),
    dominioDoCookie: dominioBruto === '' ? null : dominioBruto,
    cookieSeguro: seguroLigado,
    origensDeDev: origens,
    localDo: local as LocalDoObjeto,
  };
}

/** O mínimo de caracteres do pepper; abaixo disto ele não protege o hash e conta como ausente. */
export const PEPPER_MINIMO = 32;

/** `PEPPER_DA_SENHA` lido: `pepper` é `null` se falta, é vazio ou tem menos de `PEPPER_MINIMO` caracteres (`curto` diz que foi por ser curto). */
export function lerPepper(bruto: unknown): { pepper: string | null; curto: boolean } {
  if (typeof bruto !== 'string' || bruto === '') return { pepper: null, curto: false };
  return bruto.length >= PEPPER_MINIMO ? { pepper: bruto, curto: false } : { pepper: null, curto: true };
}
