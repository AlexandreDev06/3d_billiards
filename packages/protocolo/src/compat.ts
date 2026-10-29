/**
 * A janela de versões (L47): até aqui toda versão nova do protocolo recarregava a aba antiga (`versao`), porque o esquema é
 * estrito. Com a aparência do balão a sala aceita DUAS versões ao mesmo tempo, `PROTOCOLO_VERSAO_MINIMA` (9) e `PROTOCOLO_VERSAO`
 * (10): o cliente da 9, ainda aberto num navegador, segue jogando e vê todo balão no padrão, e o da 10 vê as aparências.
 *
 * Como a sala fala com cada um:
 * - WebSocket: a versão que o cliente declarou em `criar-sala`/`entrar` fica na conexão, e cada mensagem que sai passa por
 *   `paraVersaoDoCliente`, que tira o que a versão dele não conhece (`LugarSala.aparencia`).
 * - HTTP da carteira: o pedido não tem sessão, então o cliente da 10 declara a versão no cabeçalho `CABECALHO_DO_PROTOCOLO`
 *   (`X-Sinuca-Protocolo: 10`); sem o cabeçalho a sala responde como à 9, sem `EstadoCarteira.balao`. As rotas do balão são
 *   novas e respondem sempre completas (só a 10 as conhece).
 *
 * Fechar a janela é subir `PROTOCOLO_VERSAO_MINIMA`: a versão antiga volta a ser recusada com `versao`.
 */
import type { EstadoCarteira } from './carteira';
import { PROTOCOLO_VERSAO, type MensagemDaSala } from './tipos';

/** A versão mais antiga que a sala ainda atende. */
export const PROTOCOLO_VERSAO_MINIMA = 9;

/** A primeira versão que conhece a aparência do balão (`LugarSala.aparencia`, `EstadoCarteira.balao`). */
export const VERSAO_DO_BALAO = 10;

/** O cabeçalho do HTTP da carteira com que o cliente diz que versão do protocolo ele fala (nome em minúsculas, como os cabeçalhos chegam à sala). */
export const CABECALHO_DO_PROTOCOLO = 'x-sinuca-protocolo';

/** A sala atende um cliente que fala esta versão? Inteiro de `PROTOCOLO_VERSAO_MINIMA` a `PROTOCOLO_VERSAO`. */
export const versaoAceita = (versao: unknown): boolean => Number.isInteger(versao) && (versao as number) >= PROTOCOLO_VERSAO_MINIMA && (versao as number) <= PROTOCOLO_VERSAO;

/** Esta versão conhece a aparência do balão? */
export const falaDoBalao = (versao: number): boolean => versao >= VERSAO_DO_BALAO;

/**
 * A versão que um pedido HTTP declara. Sem o cabeçalho, ou com um valor que não é um número inteiro curto, vale a mínima (o cliente
 * de antes não manda nada); acima da atual vale a atual (um cliente adiante da sala não ganha poder por isso).
 */
export function versaoDoCabecalho(valor: string | undefined): number {
  if (valor === undefined || !/^\d{1,4}$/.test(valor)) return PROTOCOLO_VERSAO_MINIMA;
  return Math.min(Math.max(Number(valor), PROTOCOLO_VERSAO_MINIMA), PROTOCOLO_VERSAO);
}

/**
 * A mensagem como o cliente que fala `versao` a entende. Para a versão atual é a mesma mensagem (sem copiar: a mesma vai a vários
 * clientes e é codificada uma vez); para uma mais antiga, uma cópia sem o que ele não conhece. Nunca muda a original.
 */
export function paraVersaoDoCliente(mensagem: MensagemDaSala, versao: number): MensagemDaSala {
  if (versao >= PROTOCOLO_VERSAO) return mensagem;
  if (mensagem.tipo === 'estado-sala') {
    return { ...mensagem, lugares: mensagem.lugares.map((lugar) => Object.fromEntries(Object.entries(lugar).filter(([chave]) => chave !== 'aparencia')) as unknown as (typeof lugar)) };
  }
  if (mensagem.tipo === 'boas-vindas') return { ...mensagem, versao };
  return mensagem;
}

/**
 * O estado da carteira como o cliente que fala `versao` o entende: o da versão 9 não conhece `balao` (o esquema dele é estrito e
 * recusaria a resposta inteira), então ele sai. Serve também a `CarteiraCriada` (que estende `EstadoCarteira`). Para a versão atual
 * devolve o mesmo objeto; nunca muda o original.
 */
export function estadoDaCarteiraParaVersao<T extends EstadoCarteira>(estado: T, versao: number): T {
  if (falaDoBalao(versao)) return estado;
  return Object.fromEntries(Object.entries(estado).filter(([chave]) => chave !== 'balao')) as unknown as T;
}
