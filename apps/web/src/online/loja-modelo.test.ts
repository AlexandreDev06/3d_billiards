import { FAIXAS, SKINS_DE_TACO, type EstadoCarteira, type ItemTaco, type SkinTaco, type VitrineDoDia } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { ESPERA_APOS_VIRAR_MS, lojaNaTela, msAteAViradaDaVitrine } from './loja-modelo';

const carteira = (saldo: number, skins: EstadoCarteira['skins'] = ['classico'], skin: EstadoCarteira['skin'] = 'classico', extra: Partial<EstadoCarteira> = {}): EstadoCarteira => ({ saldo, skins, skin, ...extra });

const AGORA = Date.parse('2026-10-26T12:00:00Z');
const VITRINE: VitrineDoDia = {
  dia: '2026-10-26',
  fimMs: AGORA + (3 * 60 + 20) * 60_000,
  desconto: 20,
  itens: [
    { skin: 'xadrez-de-toalha', precoCheio: 70, preco: 56 },
    { skin: 'rede-de-cacapa', precoCheio: 400, preco: 320 },
    { skin: 'ouro', precoCheio: 500, preco: 400 },
  ],
};
const item = (skin: SkinTaco, semente: number, bolas = 0): ItemTaco => ({ skin, semente, bolas });

describe('lojaNaTela: o catálogo', () => {
  it('as 21 skins na ordem do catálogo, com nome, faixa e preço', () => {
    const loja = lojaNaTela(carteira(100));
    expect(loja.cartoes).toHaveLength(SKINS_DE_TACO.length);
    expect(loja.cartoes).toHaveLength(21);
    expect(loja.cartoes.map((c) => [c.skin, c.nome, c.faixa, c.textoDoPreco])).toEqual(
      SKINS_DE_TACO.map((s) => [s.id, s.nome, s.faixa, s.preco === 0 ? 'Grátis' : `${s.preco} moedas`]),
    );
    expect(loja.cartoes.slice(0, 3).map((c) => c.textoDoPreco)).toEqual(['Grátis', '50 moedas', '70 moedas']);
  });

  it('cada cartão leva o nome e a cor da faixa; os grupos seguem a ordem das faixas, da mais comum à mais rara', () => {
    const loja = lojaNaTela(carteira(0));
    for (const c of loja.cartoes) {
      const f = FAIXAS.find((x) => x.id === c.faixa)!;
      expect([c.nomeDaFaixa, c.corDaFaixa]).toEqual([f.nome, f.cor]);
    }
    expect(loja.grupos.map((g) => g.faixa)).toEqual(['balcao', 'mesa', 'salao', 'camarote', 'lenda', 'reliquia']);
    expect(loja.grupos.map((g) => g.cartoes.length)).toEqual([1, 5, 6, 4, 3, 2]);
    expect(loja.grupos.flatMap((g) => g.cartoes.map((c) => c.skin))).toEqual(loja.cartoes.map((c) => c.skin));
    expect(loja.grupos.find((g) => g.faixa === 'reliquia')).toMatchObject({ nome: 'Relíquia', cor: '#e4ae39' });
  });

  it('o saldo no topo; só o negativo fica no vermelho', () => {
    expect(lojaNaTela(carteira(100))).toMatchObject({ saldo: 100, textoSaldo: '100 moedas', saldoNegativo: false });
    expect(lojaNaTela(carteira(0))).toMatchObject({ textoSaldo: '0 moedas', saldoNegativo: false });
    expect(lojaNaTela(carteira(-30))).toMatchObject({ saldo: -30, textoSaldo: '−30 moedas', saldoNegativo: true });
  });

  it('a skin em uso leva o selo "Em uso" e nenhuma ação; as outras que tenho, "Já tem" e a ação de usar', () => {
    const loja = lojaNaTela(carteira(20, ['classico', 'ebano'], 'ebano'));
    const c = (skin: string) => loja.cartoes.find((x) => x.skin === skin)!;
    expect(c('ebano')).toMatchObject({ situacao: 'em-uso', selo: 'Em uso', acao: null, podeAgir: false });
    expect(c('classico')).toMatchObject({ situacao: 'sua', selo: 'Já tem', acao: 'usar', podeAgir: true });
  });

  it('a que não tenho se compra se o saldo cobre o preço, e o saldo exato basta', () => {
    const loja = lojaNaTela(carteira(50));
    expect(loja.cartoes.find((c) => c.skin === 'ebano')).toMatchObject({ situacao: 'a-venda', selo: null, acao: 'comprar', podeAgir: true, faltam: 0, textoFaltam: null });
  });

  it('sem saldo o botão fica desligado e diz quanto falta', () => {
    const loja = lojaNaTela(carteira(70));
    expect(loja.cartoes.find((c) => c.skin === 'marfim')).toMatchObject({ acao: 'comprar', podeAgir: false, faltam: 30, textoFaltam: 'Faltam 30 moedas' });
    expect(loja.cartoes.find((c) => c.skin === 'boteco')).toMatchObject({ podeAgir: false, faltam: 10, textoFaltam: 'Faltam 10 moedas' });
    expect(lojaNaTela(carteira(2999)).cartoes.find((c) => c.skin === 'dragao-das-quinze')!.textoFaltam).toBe('Faltam 1 moeda');
  });

  it('com o saldo negativo faltam o preço mais a dívida', () => {
    const loja = lojaNaTela(carteira(-30));
    expect(loja.cartoes.find((c) => c.skin === 'ebano')).toMatchObject({ faltam: 80, textoFaltam: 'Faltam 80 moedas', podeAgir: false });
  });

  it('sem carteira lida (loja fora do ar) mostra o catálogo sem nenhuma ação, sem vitrine e sem semente', () => {
    const loja = lojaNaTela(null);
    expect(loja).toMatchObject({ disponivel: false, saldo: null, textoSaldo: '—', saldoNegativo: false, vitrine: null });
    expect(loja.cartoes).toHaveLength(21);
    expect(loja.cartoes.every((c) => c.acao === null && !c.podeAgir && c.selo === null && c.semente === null && c.textoDasBolas === null)).toBe(true);
    expect(loja.grupos).toHaveLength(6);
    expect(lojaNaTela(carteira(5)).disponivel).toBe(true);
  });
});

describe('lojaNaTela: a vitrine do dia', () => {
  it('as três skins com o preço de hoje, o cheio riscado e o desconto', () => {
    const loja = lojaNaTela(carteira(1000, ['classico'], 'classico', { vitrine: VITRINE }), AGORA);
    expect(loja.vitrine).toMatchObject({ desconto: 20, textoDoDesconto: '20% de desconto hoje', restante: 'Troca em 3 h 20 min', fimMs: VITRINE.fimMs });
    expect(loja.vitrine!.cartoes.map((c) => c.skin)).toEqual(['xadrez-de-toalha', 'rede-de-cacapa', 'ouro']);
    const ouro = loja.cartoes.find((c) => c.skin === 'ouro')!;
    expect(ouro).toMatchObject({ naVitrine: true, preco: 400, precoCheio: 500, textoDoPreco: '400 moedas', textoDoPrecoRiscado: '500 moedas', textoDoDesconto: '−20%' });
    expect(loja.vitrine!.cartoes[2]).toBe(ouro);
    const fora = loja.cartoes.find((c) => c.skin === 'neon')!;
    expect(fora).toMatchObject({ naVitrine: false, preco: 300, textoDoPrecoRiscado: null, textoDoDesconto: null });
  });

  it('o que se paga e o que falta valem o preço de hoje, e é ele que a compra manda', () => {
    const loja = lojaNaTela(carteira(350, ['classico'], 'classico', { vitrine: VITRINE }), AGORA);
    expect(loja.cartoes.find((c) => c.skin === 'rede-de-cacapa')).toMatchObject({ preco: 320, acao: 'comprar', podeAgir: true, faltam: 0 });
    expect(loja.cartoes.find((c) => c.skin === 'ouro')).toMatchObject({ preco: 400, podeAgir: false, faltam: 50, textoFaltam: 'Faltam 50 moedas' });
  });

  it('quem já tem o taco da vitrine não vê desconto nele', () => {
    const loja = lojaNaTela(carteira(0, ['classico', 'ouro'], 'ouro', { itens: [item('classico', 1), item('ouro', 7)], vitrine: VITRINE }), AGORA);
    expect(loja.cartoes.find((c) => c.skin === 'ouro')).toMatchObject({ situacao: 'em-uso', naVitrine: false, preco: 500, textoDoPrecoRiscado: null, textoDoDesconto: null });
    expect(loja.vitrine!.cartoes.map((c) => c.skin)).toEqual(['xadrez-de-toalha', 'rede-de-cacapa', 'ouro']);
  });

  it('sem vitrine (sala sem ela, ou vazia) o preço é o do catálogo', () => {
    expect(lojaNaTela(carteira(100), AGORA).vitrine).toBeNull();
    expect(lojaNaTela(carteira(100, ['classico'], 'classico', { vitrine: { ...VITRINE, itens: [] } }), AGORA).vitrine).toBeNull();
  });

  it('o prazo para reler: do agora até o fim da vitrine mais a folga, nunca negativo; sem vitrine, nada', () => {
    const c = carteira(0, ['classico'], 'classico', { vitrine: VITRINE });
    expect(msAteAViradaDaVitrine(c, AGORA)).toBe(VITRINE.fimMs - AGORA + ESPERA_APOS_VIRAR_MS);
    expect(msAteAViradaDaVitrine(c, VITRINE.fimMs + 5000)).toBe(ESPERA_APOS_VIRAR_MS);
    expect(msAteAViradaDaVitrine(carteira(0), AGORA)).toBeNull();
    expect(msAteAViradaDaVitrine(null, AGORA)).toBeNull();
  });
});

describe('lojaNaTela: o taco de cada um', () => {
  it('a semente e o contador de quatro dígitos do meu taco; quem não tem a skin, nada disso', () => {
    const loja = lojaNaTela(carteira(0, ['classico', 'ebano'], 'ebano', { itens: [item('classico', 5, 12), item('ebano', 347, 42)] }));
    const c = (skin: string) => loja.cartoes.find((x) => x.skin === skin)!;
    expect(c('ebano')).toMatchObject({ semente: 347, textoDaSemente: '#347', bolas: 42, textoDasBolas: '0042', rara: null });
    expect(c('classico')).toMatchObject({ semente: 5, textoDaSemente: '#5', bolas: 12, textoDasBolas: '0012' });
    expect(c('ouro')).toMatchObject({ semente: null, textoDaSemente: null, bolas: null, textoDasBolas: null, rara: null });
  });

  it('o contador passa de 9999 sem quebrar o mostrador', () => {
    const loja = lojaNaTela(carteira(0, ['classico'], 'classico', { itens: [item('classico', 0, 123_456)] }));
    expect(loja.cartoes[0]!.textoDasBolas).toBe('9999');
  });

  it('a semente rara do catálogo traz o nome e o selo do padrão', () => {
    const loja = lojaNaTela(carteira(0, ['classico', 'tempera'], 'tempera', { itens: [item('classico', 1), item('tempera', 44, 3)] }));
    expect(loja.cartoes.find((c) => c.skin === 'tempera')).toMatchObject({ textoDaSemente: '#44', rara: { nome: 'Blue Gem', selo: 'BLUE GEM' }, fase: null });
  });

  it('a fase do Doppler (Phase 2) vem discreta: sem selo de rara, só o nome na carta', () => {
    const loja = lojaNaTela(carteira(0, ['classico', 'obsidiana'], 'obsidiana', { itens: [item('classico', 1), item('obsidiana', 300, 3)] }));
    expect(loja.cartoes.find((c) => c.skin === 'obsidiana')).toMatchObject({ textoDaSemente: '#300', rara: null, fase: 'Phase 2' });
  });

  it('o Doppler Ruby é rara de verdade (selo RUBY); a skin sem padrão nem tem fase', () => {
    const loja = lojaNaTela(carteira(0, ['classico', 'obsidiana'], 'obsidiana', { itens: [item('classico', 1), item('obsidiana', 77, 3)] }));
    expect(loja.cartoes.find((c) => c.skin === 'obsidiana')).toMatchObject({ rara: { nome: 'Ruby', selo: 'RUBY' }, fase: null });
    expect(loja.cartoes.find((c) => c.skin === 'classico')).toMatchObject({ rara: null, fase: null });
  });

  it('sem `itens` (sala de antes) as skins ainda aparecem como minhas, só sem semente', () => {
    const loja = lojaNaTela(carteira(0, ['classico', 'ebano'], 'classico'));
    expect(loja.cartoes.find((c) => c.skin === 'ebano')).toMatchObject({ situacao: 'sua', selo: 'Já tem', semente: null, textoDasBolas: null });
  });
});
