/**
 * Mensagem ↔ quadro WebSocket.
 *
 * - Sem gravação: texto JSON.
 * - Com gravação (`tacada`, `tacada-retransmitida`, `retrato` com `ultima`): quadro
 *   binário `[MAGIA][u32 LE tamanho do JSON][JSON UTF-8 sem a gravação][gravação do codec]`.
 *
 * `decodificar*` nunca lança: toda entrada ruim vira `{ ok: false }` com o
 * código de erro a devolver ao remetente.
 *
 * Quem lê é quem não pode confiar: por isso há tetos por tipo de quadro conferidos antes de
 * qualquer interpretação, e a gravação (a parte cara) só é decodificada depois do cabeçalho
 * validado e da autorização do chamador (`autorizarGravacao`).
 */
import { Escritor, Leitor, LeituraInvalida } from './bytes';
import { decodificarGravacao, codificarGravacao } from './gravacao-codec';
import {
  GRAVACAO_PENDENTE,
  esquemaCabecalhoDaSala,
  esquemaCabecalhoDoCliente,
  esquemaGravacao,
} from './esquemas';
import { LIMITES_PROTOCOLO } from './limites';
import type { CodigoErro, Mensagem, MensagemDaSala, MensagemDoCliente } from './tipos';
import { codificarUtf8, decodificarUtf8 } from './utf8';
import { ErroDeForma, type Esquema } from './validacao';

const MAGIA_QUADRO = 0x53;

/** O que o WebSocket entrega: texto, `ArrayBuffer` (browser com `binaryType = 'arraybuffer'`) ou `Buffer`/`Uint8Array` (Node). */
export type DadoDoFio = string | ArrayBuffer | ArrayBufferView;

export type ResultadoFio<T> =
  | { readonly ok: true; readonly valor: T }
  | {
      readonly ok: false;
      readonly codigo: CodigoErro;
      readonly erro: string;
      /** `true` quando foi `autorizarGravacao` quem recusou (a mensagem era válida; o remetente é que não podia). */
      readonly recusadaPelaSala?: true;
    };

/** Tetos em bytes, conferidos antes de interpretar o que chegou. */
export interface LimitesDeQuadro {
  /** Quadro inteiro (texto ou binário). */
  readonly quadro: number;
  /** Mensagem de texto. */
  readonly texto: number;
  /** JSON do cabeçalho de um quadro binário. */
  readonly cabecalho: number;
}

export interface OpcoesDeDecodificacao {
  /** Substitui, campo a campo, os tetos do lado (cliente→sala ou sala→cliente). */
  readonly limites?: Partial<LimitesDeQuadro>;
  /** Os bytes são um quadro de texto (UTF-8), não o envelope binário. Os dados que já são `string` não precisam disto. */
  readonly texto?: boolean;
  /**
   * Só para mensagens do cliente. Chamada depois de o cabeçalho de uma `tacada` ser lido e validado e
   * ANTES de a gravação ser decodificada. Devolva um código para recusar (sala, vez e `seq` não conferem):
   * a gravação nunca chega a ser decodificada.
   */
  readonly autorizarGravacao?: (tacada: { readonly seq: number }) => CodigoErro | null;
}

const LIMITES_DO_CLIENTE: LimitesDeQuadro = {
  quadro: LIMITES_PROTOCOLO.bytesPorMensagem,
  texto: LIMITES_PROTOCOLO.bytesTextoDoCliente,
  cabecalho: LIMITES_PROTOCOLO.bytesCabecalhoDoCliente,
};

const LIMITES_DA_SALA: LimitesDeQuadro = {
  quadro: LIMITES_PROTOCOLO.bytesPorMensagem,
  texto: LIMITES_PROTOCOLO.bytesTextoDaSala,
  cabecalho: LIMITES_PROTOCOLO.bytesCabecalhoDaSala,
};

const invalida = (erro: string): ResultadoFio<never> => ({ ok: false, codigo: 'mensagem-invalida', erro });
const grande = (erro: string): ResultadoFio<never> => ({ ok: false, codigo: 'mensagem-grande', erro });

type ComGravacao = { gravacao?: unknown; ultima?: { gravacao?: unknown } | null };

/** Mensagem → o que passar a `socket.send`. */
export function codificarMensagem(mensagem: Mensagem): string | Uint8Array {
  const m = mensagem as Mensagem & ComGravacao;
  let gravacao: unknown;
  let cabecalho: unknown = mensagem;
  if (m.tipo === 'tacada' || m.tipo === 'tacada-retransmitida') {
    gravacao = m.gravacao;
    cabecalho = { ...m, gravacao: undefined };
  } else if (m.tipo === 'retrato' && m.ultima) {
    gravacao = m.ultima.gravacao;
    cabecalho = { ...m, ultima: { ...m.ultima, gravacao: undefined } };
  }
  const json = JSON.stringify(cabecalho);
  if (gravacao === undefined) return json;

  const jsonBytes = codificarUtf8(json);
  const e = new Escritor(jsonBytes.length + 4096);
  e.u8(MAGIA_QUADRO);
  e.u32(jsonBytes.length);
  e.bytes(jsonBytes);
  e.bytes(codificarGravacao(gravacao as Parameters<typeof codificarGravacao>[0]));
  return e.pronto();
}

function paraBytes(dado: ArrayBuffer | ArrayBufferView): Uint8Array {
  return dado instanceof ArrayBuffer ? new Uint8Array(dado) : new Uint8Array(dado.buffer, dado.byteOffset, dado.byteLength);
}

function decodificar<T extends Mensagem>(
  dado: DadoDoFio,
  esquema: Esquema<T>,
  base: LimitesDeQuadro,
  opcoes: OpcoesDeDecodificacao | number,
): ResultadoFio<T> {
  const op: OpcoesDeDecodificacao = typeof opcoes === 'number' ? { limites: { quadro: opcoes } } : opcoes;
  const quadro = op.limites?.quadro ?? base.quadro;
  // O teto do quadro vale primeiro, então um teto de texto ou de cabeçalho maior que ele nunca é alcançado.
  const lim: LimitesDeQuadro = { quadro, texto: op.limites?.texto ?? base.texto, cabecalho: op.limites?.cabecalho ?? base.cabecalho };
  try {
    const ehTexto = typeof dado === 'string' || op.texto === true;
    const tamanho = typeof dado === 'string' ? dado.length : dado.byteLength;
    if (tamanho > lim.quadro) return grande(`mensagem de ${tamanho} bytes (limite ${lim.quadro})`);

    let cabecalho: unknown;
    let gravacaoBytes: Uint8Array | null = null;
    if (ehTexto) {
      if (tamanho > lim.texto) return grande(`texto de ${tamanho} bytes (limite ${lim.texto})`);
      cabecalho = JSON.parse(typeof dado === 'string' ? dado : decodificarUtf8(paraBytes(dado)));
      if (ehDiagnostico(cabecalho) && tamanho > LIMITES_PROTOCOLO.bytesDiagnostico) {
        return grande(`diagnostico de ${tamanho} bytes (limite ${LIMITES_PROTOCOLO.bytesDiagnostico})`);
      }
    } else {
      const l = new Leitor(paraBytes(dado as ArrayBuffer | ArrayBufferView));
      if (l.u8() !== MAGIA_QUADRO) return invalida('quadro binário desconhecido');
      const tamanhoJson = l.u32();
      if (tamanhoJson > lim.cabecalho) return grande(`cabeçalho de ${tamanhoJson} bytes (limite ${lim.cabecalho})`);
      cabecalho = JSON.parse(decodificarUtf8(l.bytes(tamanhoJson)));
      gravacaoBytes = l.bytes(l.restante);
    }

    const alvo = lugarDaGravacao(cabecalho);
    if (alvo !== null && gravacaoBytes === null) return invalida('mensagem com gravação precisa vir em quadro binário');
    if (alvo === null && gravacaoBytes !== null) return invalida('quadro binário em mensagem que não leva gravação');

    // Etapa 1: tudo menos a gravação.
    if (alvo !== null) alvo.gravacao = GRAVACAO_PENDENTE;
    const valor = esquema(cabecalho, '$');

    // Etapa 2: só agora a parte cara, e só se o chamador deixar.
    if (alvo !== null && gravacaoBytes !== null) {
      const tacada = valor as Mensagem & { tipo: string; seq?: number };
      if (op.autorizarGravacao && tacada.tipo === 'tacada') {
        const recusa = op.autorizarGravacao({ seq: tacada.seq! });
        if (recusa !== null) return { ok: false, codigo: recusa, erro: `recusada pela sala: ${recusa}`, recusadaPelaSala: true };
      }
      const g = decodificarGravacao(gravacaoBytes);
      esquemaGravacao(g, '$.gravacao');
      const destino = lugarDaGravacao(valor);
      if (destino !== null) destino.gravacao = g;
    }
    return { ok: true, valor };
  } catch (e) {
    if (e instanceof ErroDeForma || e instanceof LeituraInvalida || e instanceof SyntaxError || e instanceof RangeError) return invalida(e.message);
    throw e;
  }
}

/** O único tipo com teto próprio (menor que o do texto): só se sabe o tipo depois de ler o JSON, que já é limitado a 16 KB. */
const ehDiagnostico = (cabecalho: unknown): boolean => typeof cabecalho === 'object' && cabecalho !== null && (cabecalho as { tipo?: unknown }).tipo === 'diagnostico';

/** Onde, no cabeçalho já lido, a gravação deve ser posta; `null` se a mensagem não leva gravação. */
function lugarDaGravacao(cabecalho: unknown): { gravacao?: unknown } | null {
  if (typeof cabecalho !== 'object' || cabecalho === null || Array.isArray(cabecalho)) return null;
  const m = cabecalho as ComGravacao & { tipo?: unknown };
  if (m.tipo === 'tacada' || m.tipo === 'tacada-retransmitida') return m;
  if (m.tipo === 'retrato' && typeof m.ultima === 'object' && m.ultima !== null && !Array.isArray(m.ultima)) return m.ultima;
  return null;
}

export const decodificarMensagemDoCliente = (dado: DadoDoFio, opcoes: OpcoesDeDecodificacao | number = {}): ResultadoFio<MensagemDoCliente> =>
  decodificar(dado, esquemaCabecalhoDoCliente, LIMITES_DO_CLIENTE, opcoes);

export const decodificarMensagemDaSala = (dado: DadoDoFio, opcoes: OpcoesDeDecodificacao | number = {}): ResultadoFio<MensagemDaSala> =>
  decodificar(dado, esquemaCabecalhoDaSala, LIMITES_DA_SALA, opcoes);
