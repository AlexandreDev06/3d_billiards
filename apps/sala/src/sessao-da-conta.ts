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
 * O cabeçalho INTERNO com o RESUMO da sessão (SHA-256 em hexadecimal do token do cookie, o mesmo que o Banco guarda), só no upgrade do WebSocket
 * (L61b, resumo no L66): o objeto o guarda na conexão para reler a sessão no Banco (`contaDaSessaoPorResumo`) antes de mexer em moeda (a borda
 * não está mais no caminho depois do upgrade). Mesma regra do `CABECALHO_DA_CONTA`: a borda apaga o que vier de fora e só põe o resumo da
 * sessão que o Banco acabou de provar. O token em claro nunca passa da borda: o objeto, o anexo, o `Registro` e os logs só veem o resumo (que
 * ainda assim não vai a log, a erro nem a resposta).
 */
export const CABECALHO_DO_RESUMO_DA_SESSAO = 'x-sinuca-resumo-da-sessao';

/** O nome que o L61b usava, quando o cabeçalho levava o token em claro: não é mais lido, e a borda ainda o apaga de qualquer pedido que o traga. */
export const CABECALHO_ANTIGO_DA_SESSAO = 'x-sinuca-sessao';

const FORMA_DO_TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const FORMA_DO_ID_DE_CONTA = /^[0-9a-f]{64}$/;
const FORMA_DO_RESUMO = /^[0-9a-f]{64}$/;

/**
 * O resumo de uma sessão: o SHA-256 em hexadecimal minúsculo do token, o que o Banco guarda e entende em `contaDaSessaoPorResumo`. É calculado
 * uma vez, no ponto de entrada (o Worker da borda, o servidor Node, a migração de um anexo antigo); o token não segue adiante.
 */
export async function resumoDaSessao(token: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

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

/** O resumo do cabeçalho interno ou do anexo, se tem a forma de um resumo (SHA-256 em hexadecimal minúsculo); senão `undefined`. */
export function resumoDeSessaoValido(valor: unknown): string | undefined {
  return typeof valor === 'string' && FORMA_DO_RESUMO.test(valor) ? valor : undefined;
}

/** O valor tem a forma de um token de sessão (43 caracteres base64url)? Só para reconhecer o anexo antigo do L61b, que guardava o token. */
export function ehTokenDeSessao(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMA_DO_TOKEN.test(valor);
}
