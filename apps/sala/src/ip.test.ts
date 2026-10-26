import { describe, expect, it } from 'vitest';
import { ipDoCliente } from './ip';

describe('ipDoCliente — atrás de proxy vale o ÚLTIMO item do X-Forwarded-For', () => {
  it('sem o cabeçalho usa o endereço da conexão', () => {
    expect(ipDoCliente(undefined, '127.0.0.1')).toBe('127.0.0.1');
    expect(ipDoCliente('', '10.0.0.9')).toBe('10.0.0.9');
  });

  it('um item só: é o que o proxy viu', () => {
    expect(ipDoCliente('203.0.113.7', '127.0.0.1')).toBe('203.0.113.7');
  });

  it('forjado pelo cliente, real acrescentado pelo proxy: conta o real', () => {
    expect(ipDoCliente('1.2.3.4, 203.0.113.7', '127.0.0.1')).toBe('203.0.113.7');
    expect(ipDoCliente('9.9.9.9,8.8.8.8,203.0.113.7', '127.0.0.1')).toBe('203.0.113.7');
  });

  it('forjado trocando só o primeiro item não muda o IP contado', () => {
    const contados = new Set(Array.from({ length: 30 }, (_, i) => ipDoCliente(`10.0.0.${i}, 203.0.113.7`, '127.0.0.1')));
    expect([...contados]).toEqual(['203.0.113.7']);
  });

  it('vários cabeçalhos X-Forwarded-For: vale o último de todos', () => {
    expect(ipDoCliente(['1.1.1.1, 2.2.2.2', '203.0.113.7'], '127.0.0.1')).toBe('203.0.113.7');
  });

  it('ignora vírgulas e espaços sobrando no fim (o cliente não consegue mascarar o último item)', () => {
    expect(ipDoCliente('1.2.3.4,, 203.0.113.7 ,  ', '127.0.0.1')).toBe('203.0.113.7');
  });

  it('IPv4 mapeado em IPv6 é o mesmo IPv4: ::ffff:a.b.c.d, em qualquer grafia, vira a.b.c.d', () => {
    expect(ipDoCliente('::ffff:203.0.113.7', '127.0.0.1')).toBe('203.0.113.7');
    expect(ipDoCliente('::FFFF:203.0.113.7', '127.0.0.1')).toBe('203.0.113.7');
    expect(ipDoCliente('0:0:0:0:0:ffff:203.0.113.7', '127.0.0.1')).toBe('203.0.113.7');
    expect(ipDoCliente('::ffff:cb00:7107', '127.0.0.1')).toBe('203.0.113.7'); // a forma hexadecimal do mesmo endereço
    expect(ipDoCliente('203.0.113.7', '127.0.0.1')).toBe(ipDoCliente('::ffff:203.0.113.7', '127.0.0.1'));
  });

  it('o endereço da conexão (sem cabeçalho) também é normalizado: o socket do Node entrega ::ffff:127.0.0.1', () => {
    expect(ipDoCliente(undefined, '::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(ipDoCliente('', '::ffff:10.0.0.9')).toBe('10.0.0.9');
    expect(ipDoCliente('x'.repeat(100), '::ffff:10.0.0.9')).toBe('10.0.0.9');
  });

  it('IPv6 conta por /64: quem tem o prefixo inteiro (a casa de alguém tem 2^64 endereços) é um balde só', () => {
    const a = ipDoCliente('2001:db8:abcd:12::1', '127.0.0.1');
    expect(ipDoCliente('2001:db8:abcd:12:ffff:ffff:ffff:ffff', '127.0.0.1')).toBe(a);
    expect(ipDoCliente('2001:0DB8:ABCD:0012:1:2:3:4', '127.0.0.1')).toBe(a);
    expect(ipDoCliente('2001:db8:abcd:12:8000::', '127.0.0.1')).toBe(a);
    expect(ipDoCliente('2001:db8:abcd:13::1', '127.0.0.1')).not.toBe(a); // outro /64
    expect(ipDoCliente('2001:db8:abce:12::1', '127.0.0.1')).not.toBe(a);
    expect(ipDoCliente('2001:db8:abcd:12::1', '127.0.0.1')).not.toMatch(/::1$/); // o final do endereço não entra na chave
  });

  it('o /64 vale com a grafia abreviada (::) em qualquer lugar do endereço', () => {
    expect(ipDoCliente('2001:db8::1', '127.0.0.1')).toBe(ipDoCliente('2001:db8:0:0:9:9:9:9', '127.0.0.1'));
    expect(ipDoCliente('::1', '127.0.0.1')).toBe(ipDoCliente('0:0:0:0:0:0:0:2', '127.0.0.1'));
    expect(ipDoCliente('1::', '127.0.0.1')).toBe(ipDoCliente('1:0:0:0:5::', '127.0.0.1'));
  });

  it('IPv4 não muda, e IPv4 e IPv6 nunca colidem', () => {
    expect(ipDoCliente('198.51.100.9', '127.0.0.1')).toBe('198.51.100.9');
    const v6 = ipDoCliente('2001:db8::1', '127.0.0.1');
    expect(v6).not.toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it('o que parece IP mas não é um endereço (sobra de grupos, dois ::) cai no endereço da conexão, não vira chave', () => {
    for (const lixo of ['1:2:3:4:5:6:7:8:9', '1::2::3', ':::', '12345::1', 'g::1', '1.2.3', '256.1.1.1', '1.2.3.4.5', '::ffff:1.2.3.999']) {
      expect(ipDoCliente(`9.9.9.9, ${lixo}`, '127.0.0.1'), lixo).toBe('127.0.0.1');
    }
  });

  it('item que não parece IP cai no endereço da conexão (não vira chave de mapa à vontade do cliente)', () => {
    for (const lixo of ['x'.repeat(100), 'a b c', 'drop table', '1.2.3.4; evil', '<script>', '../../etc']) {
      expect(ipDoCliente(`1.2.3.4, ${lixo}`, '127.0.0.1'), lixo).toBe('127.0.0.1');
    }
  });

  it('sem cabeçalho e sem endereço: valor fixo', () => {
    expect(ipDoCliente(undefined, undefined)).toBe('desconhecido');
  });
});
