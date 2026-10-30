import { describe, expect, it } from 'vitest';
import { HOST_COM_ANUNCIO, politicaDeConteudo, temAnuncio } from './cabecalhos';

const diretiva = (politica: string, nome: string): string => politica.split('; ').find((d) => d.startsWith(`${nome} `)) ?? '';

describe('política de conteúdo: o AdSense (L52)', () => {
  it('só o host exato sinuca.becogames.app tem anúncio', () => {
    expect(temAnuncio(HOST_COM_ANUNCIO)).toBe(true);
    expect(temAnuncio('SINUCA.becogames.app')).toBe(true);
    for (const host of [
      undefined,
      'sinuca-sala.conta.workers.dev',
      '127.0.0.1:8001',
      'localhost',
      'becogames.app',
      'sinuca.becogames.app:8001',
      'outro.sinuca.becogames.app',
      'sinuca.becogames.app.evil.com',
    ])
      expect(temAnuncio(host), String(host)).toBe(false);
  });

  it('sem nonce a política é a fechada de sempre, sem nenhuma origem do Google', () => {
    const politica = politicaDeConteudo('sinuca-sala.conta.workers.dev');
    expect(diretiva(politica, 'script-src')).toBe("script-src 'self'");
    expect(diretiva(politica, 'frame-src')).toBe('');
    expect(diretiva(politica, 'img-src')).toBe("img-src 'self' data: blob:");
    expect(diretiva(politica, 'connect-src')).toBe("connect-src 'self' blob: ws://sinuca-sala.conta.workers.dev wss://sinuca-sala.conta.workers.dev");
    expect(politica).not.toMatch(/google|doubleclick|googlesyndication|adtrafficquality|nonce|strict-dynamic/);
  });

  it('com nonce: script-src estrito (nonce + strict-dynamic), quadros e conexão só das origens medidas', () => {
    const politica = politicaDeConteudo(HOST_COM_ANUNCIO, 'Abc123+/=');
    expect(diretiva(politica, 'script-src')).toBe("script-src 'nonce-Abc123+/=' 'strict-dynamic' 'self'");
    expect(politica).not.toContain('unsafe-eval');
    expect(diretiva(politica, 'script-src')).not.toContain('unsafe-inline');
    expect(diretiva(politica, 'script-src')).not.toMatch(/https?:/);
    expect(diretiva(politica, 'frame-src')).toBe(
      'frame-src https://googleads.g.doubleclick.net https://*.googlesyndication.com https://*.adtrafficquality.google https://www.google.com https://fundingchoicesmessages.google.com',
    );
    expect(diretiva(politica, 'connect-src')).toBe(
      `connect-src 'self' blob: ws://${HOST_COM_ANUNCIO} wss://${HOST_COM_ANUNCIO} https://*.googlesyndication.com https://*.adtrafficquality.google https://fundingchoicesmessages.google.com`,
    );
    expect(diretiva(politica, 'img-src')).toBe(
      "img-src 'self' data: blob: https://*.googlesyndication.com https://*.adtrafficquality.google https://*.g.doubleclick.net https://www.google.com",
    );
    for (const nome of ['img-src', 'frame-src', 'connect-src', 'script-src']) expect(diretiva(politica, nome), nome).not.toMatch(/ https:( |$)|\*( |$)/);
  });

  it('o resto da política fica igual com e sem anúncio', () => {
    const sem = politicaDeConteudo(HOST_COM_ANUNCIO).split('; ');
    const com = politicaDeConteudo(HOST_COM_ANUNCIO, 'n').split('; ');
    for (const nome of ['default-src', 'style-src', 'font-src', 'media-src', 'worker-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors'])
      expect(com.find((d) => d.startsWith(`${nome} `)), nome).toBe(sem.find((d) => d.startsWith(`${nome} `)));
    expect(com).toContain("object-src 'none'");
    expect(com).toContain("base-uri 'none'");
    expect(com).toContain("frame-ancestors 'none'");
  });
});
