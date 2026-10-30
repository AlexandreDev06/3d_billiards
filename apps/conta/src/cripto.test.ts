import { createHash } from 'node:crypto';
import { ehCodigoDeCarteira } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { ehCodigoDeConvidado } from './campos';
import { bytesParaHex, hashDaSenha, hexParaBytes, ITERACOES, iguaisEmTempoConstante, resumoHex, senhaConfere, tokenAleatorio } from './cripto';
import { aleatorioFixo } from './para-testes';

describe('cripto', () => {
  it('o resumo é o mesmo da carteira da sinuca', async () => {
    const codigo = 'A'.repeat(43);
    expect(await resumoHex(codigo)).toBe(createHash('sha256').update(codigo).digest('hex'));
  });
  it('a senha confere só com o mesmo pepper', async () => {
    const sal = new Uint8Array(16).fill(7);
    const hash = await hashDaSenha('segredo-bom', sal, 'pepper-1');
    expect(await senhaConfere('segredo-bom', { hash, sal, iteracoes: ITERACOES }, 'pepper-1')).toBe(true);
    expect(await senhaConfere('segredo-bom', { hash, sal, iteracoes: ITERACOES }, 'pepper-2')).toBe(false);
    expect(await senhaConfere('segredo-boM', { hash, sal, iteracoes: ITERACOES }, 'pepper-1')).toBe(false);
  });
  it('o sal muda o hash e o hash tem 32 bytes', async () => {
    const a = await hashDaSenha('segredo-bom', new Uint8Array(16).fill(1), 'p');
    const b = await hashDaSenha('segredo-bom', new Uint8Array(16).fill(2), 'p');
    expect(a.length).toBe(32);
    expect(iguaisEmTempoConstante(a, b)).toBe(false);
  });
  it('o hash é HMAC do pepper, depois PBKDF2 (conferido com node:crypto)', async () => {
    const { createHmac, pbkdf2Sync } = await import('node:crypto');
    const sal = new Uint8Array(16).fill(9);
    const esperado = pbkdf2Sync(createHmac('sha256', 'pp').update('minha-senha').digest(), sal, 1000, 32, 'sha256');
    expect(Buffer.from(await hashDaSenha('minha-senha', sal, 'pp', 1000)).equals(esperado)).toBe(true);
  });
  it('a comparação em tempo constante exige o mesmo tamanho e os mesmos bytes', () => {
    expect(iguaisEmTempoConstante(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3))).toBe(true);
    expect(iguaisEmTempoConstante(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 4))).toBe(false);
    expect(iguaisEmTempoConstante(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2))).toBe(false);
    expect(iguaisEmTempoConstante(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 0))).toBe(false);
    expect(iguaisEmTempoConstante(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
  it('o código de convidado tem o formato da sinuca', () => {
    const codigo = tokenAleatorio(aleatorioFixo(1));
    expect(codigo).toHaveLength(43);
    expect(ehCodigoDeConvidado(codigo)).toBe(true);
    expect(ehCodigoDeCarteira(codigo)).toBe(true);
  });
  it('o aleatório fixo repete com a mesma semente e muda com outra', () => {
    expect(tokenAleatorio(aleatorioFixo(5))).toBe(tokenAleatorio(aleatorioFixo(5)));
    expect(tokenAleatorio(aleatorioFixo(5))).not.toBe(tokenAleatorio(aleatorioFixo(6)));
  });
  it('o hexadecimal vai e volta; texto ruim vira bytes vazios', () => {
    const bytes = Uint8Array.from([0, 1, 15, 16, 255]);
    expect(bytesParaHex(bytes)).toBe('00010f10ff');
    expect(hexParaBytes('00010f10ff')).toEqual(bytes);
    for (const ruim of ['abc', 'zz', 'AB']) expect(hexParaBytes(ruim).length).toBe(0);
  });
});
