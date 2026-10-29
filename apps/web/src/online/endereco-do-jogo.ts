import { ehCodigoDeCarteira } from '@sinuca/protocolo';
import { lerJson, type ArmazenamentoMinimo } from '../armazenamento';
import { CHAVE_DA_CARTEIRA } from './carteira';
import { codigoDaUrl } from './convite';
import { PARAMETRO_DA_CARTEIRA, lerFragmentoDaCarteira } from './levar-carteira';

/**
 * A mudança de endereço do jogo (L49): do `*.workers.dev` para o domínio próprio. A carteira mora no `localStorage` da origem antiga e não
 * passa sozinha; o cliente aberto lá leva o código ao endereço novo no FRAGMENTO (como o link do L43), que nunca vai à rede.
 */

/** O endereço do jogo (o único lugar que o escreve). */
export const ENDERECO_DO_JOGO = 'https://sinuca.becogames.app/';

/** A política de privacidade, fora do jogo (link do menu principal). */
export const LINK_DE_PRIVACIDADE = 'https://becogames.app/privacidade';

const SUFIXO_ANTIGO = '.workers.dev';

/** O host é um `*.workers.dev`? Só estes são redirecionados (nunca `localhost`, `127.0.0.1`, ngrok, nem o endereço novo). */
export function ehEnderecoAntigo(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h.length > SUFIXO_ANTIGO.length && h.endsWith(SUFIXO_ANTIGO);
}

/**
 * Para onde ir: o endereço novo, com o convite (`?sala=`, só ele) quando há, e a carteira no fragmento quando há; sem nada disso, o
 * endereço novo puro. O código da carteira só entra pelo fragmento.
 */
export function destinoDaMudanca(codigo: string | undefined, sala?: string | null): string {
  const base = sala === undefined || sala === null ? ENDERECO_DO_JOGO : `${ENDERECO_DO_JOGO}?sala=${encodeURIComponent(sala)}`;
  return codigo === undefined ? base : `${base}#${PARAMETRO_DA_CARTEIRA}=${codigo}`;
}

/** O código guardado neste navegador, lido direto do `localStorage` (sem criar nada); `undefined` se não há um válido. */
function codigoGuardado(armazenamento: ArmazenamentoMinimo | null): string | undefined {
  const lido = lerJson(CHAVE_DA_CARTEIRA, armazenamento);
  if (typeof lido !== 'object' || lido === null) return undefined;
  const v = lido as Record<string, unknown>;
  return typeof v.codigo === 'string' && ehCodigoDeCarteira(v.codigo) ? v.codigo : undefined;
}

/** O que a mudança precisa do `window.location`. */
export interface LocalDaMudanca {
  readonly hostname: string;
  readonly hash: string;
  readonly search: string;
  replace(url: string): void;
}

/**
 * Chamada antes de o jogo criar qualquer coisa (inclusive a carteira): no `*.workers.dev`, troca a página pelo endereço novo
 * (`replace`: o antigo não fica no histórico). A carteira guardada aqui vence um `#carteira=` do endereço antigo (não perde o saldo de
 * quem já jogou); sem guardada, vai o do link. Do convite (`?sala=`) vai só a sala, e só com a forma de um código. Devolve `true` se mandou ir embora.
 */
export function mudarParaOEnderecoNovo(local: LocalDaMudanca, armazenamento: ArmazenamentoMinimo | null): boolean {
  if (!ehEnderecoAntigo(local.hostname)) return false;
  const doLink = lerFragmentoDaCarteira(local.hash);
  const codigo = codigoGuardado(armazenamento) ?? (doLink.tipo === 'codigo' ? doLink.codigo : undefined);
  local.replace(destinoDaMudanca(codigo, codigoDaUrl(local.search)));
  return true;
}
