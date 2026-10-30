/** O e-mail que sai da conta (recuperação de senha). Só `fetch`: nada de `node:*`. */

export const LINK_DE_NOVA_SENHA = 'https://becogames.app/nova-senha#token=';

const REMETENTE = 'Beco Games <nao-responda@becogames.app>';
const URL_DO_ENVIO = 'https://api.resend.com/emails';
/** A rede lenta não segura o objeto para sempre. */
const PRAZO_DO_ENVIO_MS = 10_000;

export interface MensagemDeEmail {
  para: string;
  assunto: string;
  texto: string;
  html: string;
}

export interface Carteiro {
  enviar(m: MensagemDeEmail): Promise<{ ok: boolean; status: number }>;
}

/** O envio pelo Resend. Nunca lança: rede caída, prazo ou resposta ruim dão `{ ok: false, status }` (0 se nem houve resposta). */
export function carteiroDoResend(chave: string, pedir: typeof fetch): Carteiro {
  return {
    async enviar(m) {
      try {
        const pedido = new Request(URL_DO_ENVIO, {
          method: 'POST',
          headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
          body: JSON.stringify({ from: REMETENTE, to: [m.para], subject: m.assunto, text: m.texto, html: m.html }),
          signal: AbortSignal.timeout(PRAZO_DO_ENVIO_MS),
        });
        const resposta = await pedir(pedido);
        void resposta.body?.cancel().catch(() => undefined);
        return { ok: resposta.ok, status: resposta.status };
      } catch {
        return { ok: false, status: 0 };
      }
    },
  };
}

const escapar = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** O e-mail de senha nova: texto e HTML do mesmo conteúdo, sem imagem nem rastreio. */
export function emailDeNovaSenha(link: string): { assunto: string; texto: string; html: string } {
  const abertura = 'Alguém pediu uma senha nova para a sua conta na Beco Games. Para criar a senha nova, abra o link abaixo. Ele vale por 1 hora e só uma vez.';
  const fecho = 'Se não foi você, ignore este e-mail: a sua senha continua a mesma.';
  return {
    assunto: 'Sua nova senha na Beco Games',
    texto: `${abertura}\n\n${link}\n\n${fecho}\n`,
    html: `<p>${abertura}</p>\n<p><a href="${escapar(link)}">${escapar(link)}</a></p>\n<p>${fecho}</p>\n`,
  };
}
