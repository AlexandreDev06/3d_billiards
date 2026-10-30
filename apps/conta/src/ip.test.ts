import { describe, expect, it } from 'vitest';
import { chaveDoIp } from './ip';

describe('chaveDoIp', () => {
  it('IPv4 vale por inteiro e o IPv4 mapeado em IPv6 é o mesmo IPv4', () => {
    expect(chaveDoIp('1.2.3.4')).toBe('1.2.3.4');
    expect(chaveDoIp('::ffff:1.2.3.4')).toBe('1.2.3.4');
    expect(chaveDoIp('::ffff:102:304')).toBe('1.2.3.4');
  });
  it('IPv6 conta pelo prefixo /64: dois endereços da mesma rede dividem o balde', () => {
    expect(chaveDoIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe(chaveDoIp('2001:db8:1:2::1'));
    expect(chaveDoIp('2001:db8:1:3::1')).not.toBe(chaveDoIp('2001:db8:1:2::1'));
  });
  it('lixo vira desconhecido', () => {
    for (const x of ['', 'abc', '999.1.1.1', '1:2:3', '::1::2']) expect(chaveDoIp(x)).toBe('desconhecido');
  });
});
