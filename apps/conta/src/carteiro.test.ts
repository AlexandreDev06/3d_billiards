import { describe, expect, it } from 'vitest';
import { carteiroDoResend, emailDeNovaSenha, LINK_DE_NOVA_SENHA } from './carteiro';

describe('carteiro', () => {
  it('o Resend recebe o remetente e a chave, e a rede caída não lança', async () => {
    const pedidos: Request[] = [];
    const c = carteiroDoResend('re_teste', async (r) => {
      pedidos.push(new Request(r));
      return new Response('{}', { status: 200 });
    });
    expect(await c.enviar({ para: 'a@b.com', ...emailDeNovaSenha('https://becogames.app/nova-senha#token=x') })).toEqual({ ok: true, status: 200 });
    expect(pedidos[0]!.method).toBe('POST');
    expect(pedidos[0]!.url).toBe('https://api.resend.com/emails');
    expect(pedidos[0]!.headers.get('authorization')).toBe('Bearer re_teste');
    expect(JSON.parse(await pedidos[0]!.text())).toMatchObject({ from: 'Beco Games <nao-responda@becogames.app>', to: ['a@b.com'], subject: 'Sua nova senha na Beco Games' });
    const caido = carteiroDoResend('re_teste', async () => {
      throw new Error('rede');
    });
    expect(await caido.enviar({ para: 'a@b.com', ...emailDeNovaSenha('x') })).toEqual({ ok: false, status: 0 });
  });
  it('resposta de erro volta com o status e sem lançar', async () => {
    const c = carteiroDoResend('re_teste', async () => new Response('{"message":"x"}', { status: 422 }));
    expect(await c.enviar({ para: 'a@b.com', ...emailDeNovaSenha('x') })).toEqual({ ok: false, status: 422 });
  });
  it('o texto do e-mail é o fixo, com o link no meio', () => {
    const link = `${LINK_DE_NOVA_SENHA}abc`;
    const e = emailDeNovaSenha(link);
    expect(LINK_DE_NOVA_SENHA).toBe('https://becogames.app/nova-senha#token=');
    expect(e.assunto).toBe('Sua nova senha na Beco Games');
    expect(e.texto).toBe(
      'Alguém pediu uma senha nova para a sua conta na Beco Games. Para criar a senha nova, abra o link abaixo. Ele vale por 1 hora e só uma vez.\n\n' +
        `${link}\n\n` +
        'Se não foi você, ignore este e-mail: a sua senha continua a mesma.\n',
    );
    expect(e.html).toContain(`<a href="${link}">${link}</a>`);
    expect(e.html).not.toMatch(/<img|<script|utm_/);
  });
  it('o HTML escapa o que vem no link', () => {
    expect(emailDeNovaSenha('https://x/?a=1&b="2"<').html).toContain('a=1&amp;b=&quot;2&quot;&lt;');
  });
});
