/**
 * A sessão da conta da Beco Games vista pela sinuca (L61): o cookie `becogames_sessao` que o Banco grava (HttpOnly, no domínio
 * `.becogames.app`) e o cabeçalho interno por onde o Worker entrega ao `SalaDO` o `id` que o Banco provou. Sem nada de Node, nem do
 * Worker: a sala Node e o Worker usam o mesmo.
 */

export const NOME_DO_COOKIE_DA_SESSAO = 'becogames_sessao';

/**
 * O cabeçalho INTERNO com o `id` da conta que a sessão provou. Só o Worker (borda) o põe, depois de perguntar ao Banco, e SEMPRE
 * apaga o que veio de fora antes (`paraOObjeto` em worker/corpo-do-pedido.ts): o pedido de um navegador com este cabeçalho nunca chega ao objeto
 * com ele. O objeto só chega por aqui (o Durable Object não tem endereço público), então o IP e este `id` têm a mesma confiança.
 */
export const CABECALHO_DA_CONTA = 'x-sinuca-conta';

/**
 * O cabeçalho INTERNO com o token da sessão, só no upgrade do WebSocket (L61b): o objeto o guarda na conexão para reler a sessão no Banco antes
 * de mexer em moeda (a borda não está mais no caminho depois do upgrade). Mesma regra do `CABECALHO_DA_CONTA`: a borda apaga o que vier de fora
 * e só põe o token do cookie que o Banco acabou de provar. É segredo: nunca vai a log, a erro nem a resposta.
 */
export const CABECALHO_DA_SESSAO = 'x-sinuca-sessao';

const FORMA_DO_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const FORMA_DO_ID_DE_CONTA = /^[0-9a-f]{64}$/;

/** O token do cookie `becogames_sessao` no cabeçalho `Cookie`, ou `null` se falta ou não tem a forma de um token (43 caracteres base64url). */
export function tokenDaSessao(cookie: string | null | undefined): string | null {
  if (cookie === null || cookie === undefined) return null;
  for (const par of cookie.split(';')) {
    const i = par.indexOf('=');
    if (i < 0 || par.slice(0, i).trim() !== NOME_DO_COOKIE_DA_SESSAO) continue;
    const valor = par.slice(i + 1).trim();
    if (FORMA_DO_TOKEN.test(valor)) return valor;
  }
  return null;
}

/** O `id` do cabeçalho interno, se tem a forma de um `id` (SHA-256 em hexadecimal); senão `undefined`. */
export function idDaContaDoCabecalho(valor: string | null | undefined): string | undefined {
  return typeof valor === 'string' && FORMA_DO_ID_DE_CONTA.test(valor) ? valor : undefined;
}

/** O token do cabeçalho interno, se tem a forma de um token (43 caracteres base64url); senão `undefined`. */
export function tokenDoCabecalho(valor: string | null | undefined): string | undefined {
  return typeof valor === 'string' && FORMA_DO_TOKEN.test(valor) ? valor : undefined;
}
