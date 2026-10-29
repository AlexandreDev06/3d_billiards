import { APARENCIA_PADRAO, ITENS_DO_BALAO, precoDoItemDoBalao, type AparenciaDoBalao, type EstadoCarteira, type IdItemDoBalao } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { CATEGORIAS_DO_BALAO, balaoNaLoja, editorDoBalao, escolherNoRascunho, iconeDoItem, textoDoCampoDoBalao } from './balao-modelo';

const carteira = (saldo: number, itens: readonly IdItemDoBalao[] = ['olho_normal', 'castanho'], aparencia: AparenciaDoBalao = APARENCIA_PADRAO): EstadoCarteira => ({
  saldo,
  skins: ['classico'],
  skin: 'classico',
  balao: { aparencia, itens },
});

describe('as categorias', () => {
  it('são as quatro do contrato, na ordem da loja, com os ids do protocolo', () => {
    expect(CATEGORIAS_DO_BALAO.map((c) => c.id)).toEqual(['chapeu', 'bigode', 'olhos', 'cor_dos_olhos']);
    expect(CATEGORIAS_DO_BALAO.map((c) => c.campo)).toEqual(['chapeu', 'bigode', 'olhos', 'corDosOlhos']);
    expect(CATEGORIAS_DO_BALAO.map((c) => c.titulo)).toEqual(['Chapéus', 'Bigodes', 'Estilo dos olhos', 'Cor dos olhos']);
  });

  it('o ícone de cada item do catálogo é o arquivo do artista com o id do contrato', () => {
    expect(iconeDoItem('cartola')).toBe('/personagens/icones/cartola.png');
    for (const i of ITENS_DO_BALAO) expect(iconeDoItem(i.id)).toBe(`/personagens/icones/${i.id}.png`);
  });
});

describe('balaoNaLoja', () => {
  it('lista os 25 itens do catálogo nas 4 categorias, com nome e preço do protocolo', () => {
    const loja = balaoNaLoja(carteira(1000));
    expect(loja.disponivel).toBe(true);
    expect(loja.categorias.map((c) => c.cartoes.length)).toEqual([8, 5, 4, 8]);
    const todos = loja.categorias.flatMap((c) => c.cartoes);
    expect(todos).toHaveLength(ITENS_DO_BALAO.length);
    const coroa = todos.find((c) => c.id === 'coroa')!;
    expect(coroa).toMatchObject({ nome: 'Coroa do Rei da Mesa', preco: 500, textoDoPreco: '500 moedas', icone: '/personagens/icones/coroa.png' });
  });

  it('o que não tenho está à venda com botão "comprar"; com saldo que não cobre, o botão fica desligado e diz quanto falta', () => {
    const rico = balaoNaLoja(carteira(1000)).categorias.flatMap((c) => c.cartoes).find((c) => c.id === 'cartola')!;
    expect(rico).toMatchObject({ situacao: 'a-venda', selo: null, acao: 'comprar', podeAgir: true, faltam: 0, textoFaltam: null });
    const pobre = balaoNaLoja(carteira(100)).categorias.flatMap((c) => c.cartoes).find((c) => c.id === 'cartola')!;
    expect(pobre).toMatchObject({ situacao: 'a-venda', acao: 'comprar', podeAgir: false, faltam: 160, textoFaltam: 'Faltam 160 moedas' });
    const justo = balaoNaLoja(carteira(260)).categorias.flatMap((c) => c.cartoes).find((c) => c.id === 'cartola')!;
    expect(justo.podeAgir).toBe(true);
  });

  it('o que tenho e não uso é "seu"; o que está no balão é "equipado"; os dois sem botão de compra', () => {
    const c = carteira(10, ['olho_normal', 'olho_kawaii', 'castanho', 'azul'], { ...APARENCIA_PADRAO, olhos: 'olho_kawaii' });
    const todos = balaoNaLoja(c).categorias.flatMap((x) => x.cartoes);
    expect(todos.find((x) => x.id === 'olho_kawaii')).toMatchObject({ situacao: 'equipado', selo: 'Equipado', acao: null, podeAgir: false });
    expect(todos.find((x) => x.id === 'azul')).toMatchObject({ situacao: 'seu', selo: 'Seu', acao: null });
    // os grátis todo mundo tem: o castanho está equipado, e o olho normal agora é só "seu"
    expect(todos.find((x) => x.id === 'castanho')).toMatchObject({ situacao: 'equipado' });
    expect(todos.find((x) => x.id === 'olho_normal')).toMatchObject({ situacao: 'seu', textoDoPreco: 'Grátis' });
  });

  it('sem chapéu e sem bigode nada de chapéu ou bigode está equipado', () => {
    const todos = balaoNaLoja(carteira(0)).categorias.flatMap((x) => x.cartoes);
    expect(todos.filter((x) => x.situacao === 'equipado').map((x) => x.id).sort()).toEqual(['castanho', 'olho_normal']);
  });

  it('sem carteira lida (ou sala sem o balão) a seção aparece mas sem compra', () => {
    const sem = balaoNaLoja(null);
    expect(sem.disponivel).toBe(false);
    expect(sem.categorias.flatMap((c) => c.cartoes).every((c) => c.acao === null && !c.podeAgir)).toBe(true);
    const velha = balaoNaLoja({ saldo: 100, skins: ['classico'], skin: 'classico' });
    expect(velha.disponivel).toBe(false);
  });
});

describe('editorDoBalao', () => {
  it('cada categoria tem as opções do catálogo; chapéu e bigode começam com "Nenhum"', () => {
    const e = editorDoBalao(carteira(0), APARENCIA_PADRAO);
    expect(e.categorias.map((c) => c.opcoes.length)).toEqual([9, 6, 4, 8]);
    expect(e.categorias[0]!.opcoes[0]).toMatchObject({ id: null, nome: 'Nenhum', icone: null, situacao: 'livre', selecionada: true });
    expect(e.categorias[1]!.opcoes[0]).toMatchObject({ id: null, nome: 'Nenhum', selecionada: true });
    expect(e.categorias[2]!.opcoes.find((o) => o.id === 'olho_normal')).toMatchObject({ selecionada: true, situacao: 'livre' });
  });

  it('só o que a carteira tem pode ser escolhido: o que falta é "bloqueado" e mostra o preço', () => {
    const e = editorDoBalao(carteira(0, ['olho_normal', 'castanho', 'boina']), APARENCIA_PADRAO);
    const chapeus = e.categorias[0]!.opcoes;
    expect(chapeus.find((o) => o.id === 'boina')).toMatchObject({ situacao: 'seu', textoDoPreco: '180 moedas' });
    expect(chapeus.find((o) => o.id === 'coroa')).toMatchObject({ situacao: 'bloqueado', textoDoPreco: '500 moedas' });
    expect(e.categorias[2]!.opcoes.find((o) => o.id === 'olho_kawaii')).toMatchObject({ situacao: 'bloqueado', textoDoPreco: '150 moedas' });
  });

  it('o rascunho marca a opção escolhida; mudou/podeEquipar comparam com o balão da carteira', () => {
    const c = carteira(0, ['olho_normal', 'castanho', 'boina', 'azul']);
    const igual = editorDoBalao(c, APARENCIA_PADRAO);
    expect(igual).toMatchObject({ mudou: false, podeEquipar: false });
    const rascunho: AparenciaDoBalao = { ...APARENCIA_PADRAO, chapeu: 'boina', corDosOlhos: 'azul' };
    const e = editorDoBalao(c, rascunho);
    expect(e.mudou).toBe(true);
    expect(e.podeEquipar).toBe(true);
    expect(e.categorias[0]!.opcoes.find((o) => o.selecionada)!.id).toBe('boina');
    expect(e.categorias[3]!.opcoes.find((o) => o.selecionada)!.id).toBe('azul');
  });

  it('um rascunho com item que a carteira não tem não pode ser equipado (a conta não confia na tela)', () => {
    const e = editorDoBalao(carteira(0), { ...APARENCIA_PADRAO, chapeu: 'coroa' });
    expect(e.mudou).toBe(true);
    expect(e.podeEquipar).toBe(false);
    expect(e.bloqueados).toEqual(['coroa']);
  });

  it('sem carteira lida o editor existe com o padrão, sem nada para equipar', () => {
    const e = editorDoBalao(null, APARENCIA_PADRAO);
    expect(e.disponivel).toBe(false);
    expect(e.podeEquipar).toBe(false);
    expect(e.categorias[0]!.opcoes.filter((o) => o.id !== null).every((o) => o.situacao === 'bloqueado')).toBe(true);
  });
});

describe('escolherNoRascunho', () => {
  const itens: IdItemDoBalao[] = ['olho_normal', 'castanho', 'boina', 'azul'];

  it('escolhe o que a carteira tem e devolve um rascunho novo (o de antes não muda)', () => {
    const antes = APARENCIA_PADRAO;
    const depois = escolherNoRascunho(antes, 'chapeu', 'boina', itens);
    expect(depois).toEqual({ ...APARENCIA_PADRAO, chapeu: 'boina' });
    expect(antes.chapeu).toBeNull();
    expect(escolherNoRascunho(depois, 'cor_dos_olhos', 'azul', itens).corDosOlhos).toBe('azul');
  });

  it('item que a carteira não tem: o rascunho fica exatamente como estava', () => {
    const antes = APARENCIA_PADRAO;
    expect(escolherNoRascunho(antes, 'chapeu', 'coroa', itens)).toBe(antes);
    expect(escolherNoRascunho(antes, 'olhos', 'olho_kawaii', itens)).toBe(antes);
    expect(escolherNoRascunho(antes, 'bigode', 'bigode_dali', itens)).toBe(antes);
  });

  it('"Nenhum" (null) tira o chapéu e o bigode; nos olhos e na cor null não vale', () => {
    const vestido = { ...APARENCIA_PADRAO, chapeu: 'boina', bigode: null } as AparenciaDoBalao;
    expect(escolherNoRascunho(vestido, 'chapeu', null, itens).chapeu).toBeNull();
    expect(escolherNoRascunho(vestido, 'olhos', null, itens)).toBe(vestido);
    expect(escolherNoRascunho(vestido, 'cor_dos_olhos', null, itens)).toBe(vestido);
  });

  it('id de outra categoria, ou que não é do catálogo, não entra', () => {
    expect(escolherNoRascunho(APARENCIA_PADRAO, 'chapeu', 'azul', itens)).toBe(APARENCIA_PADRAO);
    expect(escolherNoRascunho(APARENCIA_PADRAO, 'chapeu', 'barba', itens)).toBe(APARENCIA_PADRAO);
    expect(escolherNoRascunho(APARENCIA_PADRAO, 'chapeu', '__proto__', itens)).toBe(APARENCIA_PADRAO);
  });

  it('os preços do catálogo continuam o que a sala cobra (o editor lê do protocolo, não de uma cópia)', () => {
    expect(precoDoItemDoBalao('coroa')).toBe(500);
  });
});

describe('textoDoCampoDoBalao', () => {
  it('diz o nome do item equipado em cada campo, e "Nenhum" sem chapéu ou bigode', () => {
    expect(textoDoCampoDoBalao(APARENCIA_PADRAO, 'chapeu')).toBe('Nenhum');
    expect(textoDoCampoDoBalao({ ...APARENCIA_PADRAO, chapeu: 'coroa' }, 'chapeu')).toBe('Coroa do Rei da Mesa');
    expect(textoDoCampoDoBalao(APARENCIA_PADRAO, 'olhos')).toBe('Olho de Sempre');
    expect(textoDoCampoDoBalao(APARENCIA_PADRAO, 'cor_dos_olhos')).toBe('Castanho Café');
  });
});
