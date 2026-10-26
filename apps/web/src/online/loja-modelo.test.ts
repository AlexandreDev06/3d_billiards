import type { EstadoCarteira } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { lojaNaTela } from './loja-modelo';

const carteira = (saldo: number, skins: EstadoCarteira['skins'] = ['classico'], skin: EstadoCarteira['skin'] = 'classico'): EstadoCarteira => ({ saldo, skins, skin });

describe('lojaNaTela', () => {
  it('as oito skins na ordem do catálogo, com nome e preço', () => {
    const loja = lojaNaTela(carteira(100));
    expect(loja.cartoes.map((c) => [c.skin, c.nome, c.textoDoPreco])).toEqual([
      ['classico', 'Clássico', 'Grátis'],
      ['ebano', 'Ébano', '50 moedas'],
      ['boteco', 'Boteco', '80 moedas'],
      ['marfim', 'Marfim', '100 moedas'],
      ['carbono', 'Carbono', '150 moedas'],
      ['chamas', 'Chamas', '200 moedas'],
      ['neon', 'Neon', '300 moedas'],
      ['ouro', 'Ouro', '500 moedas'],
    ]);
  });

  it('o saldo no topo; só o negativo fica no vermelho', () => {
    expect(lojaNaTela(carteira(100))).toMatchObject({ saldo: 100, textoSaldo: '100 moedas', saldoNegativo: false });
    expect(lojaNaTela(carteira(0))).toMatchObject({ textoSaldo: '0 moedas', saldoNegativo: false });
    expect(lojaNaTela(carteira(-30))).toMatchObject({ saldo: -30, textoSaldo: '−30 moedas', saldoNegativo: true });
  });

  it('a skin em uso leva o selo "Em uso" e nenhuma ação; as outras que tenho, "Sua" e a ação de usar', () => {
    const loja = lojaNaTela(carteira(20, ['classico', 'ebano'], 'ebano'));
    const c = (skin: string) => loja.cartoes.find((x) => x.skin === skin)!;
    expect(c('ebano')).toMatchObject({ situacao: 'em-uso', selo: 'Em uso', acao: null, podeAgir: false });
    expect(c('classico')).toMatchObject({ situacao: 'sua', selo: 'Sua', acao: 'usar', podeAgir: true });
  });

  it('a que não tenho se compra se o saldo cobre o preço, e o saldo exato basta', () => {
    const loja = lojaNaTela(carteira(50));
    expect(loja.cartoes.find((c) => c.skin === 'ebano')).toMatchObject({ situacao: 'a-venda', selo: null, acao: 'comprar', podeAgir: true, faltam: 0, textoFaltam: null });
  });

  it('sem saldo o botão fica desligado e diz quanto falta', () => {
    const loja = lojaNaTela(carteira(70));
    expect(loja.cartoes.find((c) => c.skin === 'marfim')).toMatchObject({ acao: 'comprar', podeAgir: false, faltam: 30, textoFaltam: 'Faltam 30 moedas' });
    expect(loja.cartoes.find((c) => c.skin === 'boteco')).toMatchObject({ podeAgir: false, faltam: 10, textoFaltam: 'Faltam 10 moedas' });
    expect(lojaNaTela(carteira(499)).cartoes.find((c) => c.skin === 'ouro')!.textoFaltam).toBe('Faltam 1 moeda');
  });

  it('com o saldo negativo faltam o preço mais a dívida', () => {
    const loja = lojaNaTela(carteira(-30));
    expect(loja.cartoes.find((c) => c.skin === 'ebano')).toMatchObject({ faltam: 80, textoFaltam: 'Faltam 80 moedas', podeAgir: false });
  });

  it('sem carteira lida (loja fora do ar) mostra o catálogo sem nenhuma ação', () => {
    const loja = lojaNaTela(null);
    expect(loja).toMatchObject({ disponivel: false, saldo: null, textoSaldo: '—', saldoNegativo: false });
    expect(loja.cartoes).toHaveLength(8);
    expect(loja.cartoes.every((c) => c.acao === null && !c.podeAgir && c.selo === null)).toBe(true);
    expect(lojaNaTela(carteira(5)).disponivel).toBe(true);
  });
});
