import { describe, expect, it } from 'vitest';
import { ehChave, ehCodigoDeConvidado, ehIdDeConta, normalizarEmail, validarNome, validarSenha } from './campos';

describe('campos', () => {
  it('normaliza o e-mail', () => {
    expect(normalizarEmail('  Ana@Gmail.COM ')).toBe('ana@gmail.com');
    for (const ruim of ['', 'ana', 'ana@', '@x.com', 'a b@x.com', 'a@x', 'a'.repeat(250) + '@x.com', 42, null]) expect(normalizarEmail(ruim)).toBeNull();
  });
  it('e-mail com domínio torto ou dois arrobas é recusado', () => {
    for (const ruim of ['a@@x.com', 'a@x@y.com', 'a@.com', 'a@x..com', 'a@x.', 'a\u0000@x.com', undefined, {}]) expect(normalizarEmail(ruim), String(ruim)).toBeNull();
  });
  it('o e-mail de 254 caracteres passa e o de 255 não', () => {
    const resto = '@x.com';
    expect(normalizarEmail('a'.repeat(254 - resto.length) + resto)).not.toBeNull();
    expect(normalizarEmail('a'.repeat(255 - resto.length) + resto)).toBeNull();
  });
  it('um texto enorme é recusado sem varrer', () => {
    expect(normalizarEmail('a'.repeat(1_000_000) + '@x.com')).toBeNull();
    expect(validarNome('a'.repeat(1_000_000))).toBeNull();
    expect(validarSenha('a'.repeat(1_000_000))).toBe('senha-longa');
  });

  it('nome de 1 a 20 caracteres por ponto de código', () => {
    expect(validarNome('  Zé  ')).toBe('Zé');
    expect(validarNome('🎱'.repeat(20))).toBe('🎱'.repeat(20));
    for (const ruim of ['', '   ', 'a'.repeat(21), 'a\u0000b', 'a\nb', 7]) expect(validarNome(ruim)).toBeNull();
    expect(validarNome('🎱'.repeat(21))).toBeNull();
  });
  it('o nome sai em NFC', () => {
    expect(validarNome('José')).toBe('José');
  });

  it('senha de 8 a 128', () => {
    expect(validarSenha('1234567')).toBe('senha-curta');
    expect(validarSenha('12345678')).toBe('ok');
    expect(validarSenha('x'.repeat(128))).toBe('ok');
    expect(validarSenha('x'.repeat(129))).toBe('senha-longa');
    expect(validarSenha('x'.repeat(10_000))).toBe('senha-longa');
    expect(validarSenha(12345678)).toBe('senha-curta');
  });

  it('id de conta, chave e código de convidado', () => {
    expect(ehIdDeConta('a'.repeat(64))).toBe(true);
    for (const ruim of ['a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64), 3, null]) expect(ehIdDeConta(ruim)).toBe(false);
    for (const boa of ['k', 'aposta:p1', 'missao:2026-10-29:x', 'a'.repeat(120)]) expect(ehChave(boa), boa).toBe(true);
    for (const ruim of ['', ':a', 'A', 'a b', 'a'.repeat(121), 5]) expect(ehChave(ruim), String(ruim)).toBe(false);
    expect(ehCodigoDeConvidado('A'.repeat(43))).toBe(true);
    for (const ruim of ['A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + '=', 'A'.repeat(42) + '+', 9]) expect(ehCodigoDeConvidado(ruim)).toBe(false);
  });
});
