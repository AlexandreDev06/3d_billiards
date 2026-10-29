/**
 * O balão na carteira (L47): comprar um item (saldo, posse e gasto gravados tudo ou nada, como as skins), equipar a aparência (só o
 * que se tem, inteira ou nada), a migração do formato salvo (a carteira de antes abre com o padrão e nenhum item, sem perder nem
 * mudar nada), a cópia de segurança (`exportar`, o que `importar` aceita) e o armazenamento nos dois lugares: o arquivo da sala Node
 * e o SQLite do Durable Object.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { APARENCIA_PADRAO, ITENS_DO_BALAO, SALDO_INICIAL, precoDoItemDoBalao, type AparenciaDoBalao, type IdItemDoBalao } from '@sinuca/protocolo';
import { CarteirasEmMemoria } from './carteiras-base';
import { ArmazemDeCarteiras } from './carteiras';
import { CarteirasNoDO, type CursorMinimo, type SqlMinimo } from './carteiras-sqlite';

const RELOGIO = Date.parse('2026-11-02T15:00:00Z');
const GRATIS: IdItemDoBalao[] = ['olho_normal', 'castanho'];

const abrir = (extra: Partial<ConstructorParameters<typeof CarteirasEmMemoria>[0]> = {}) => {
  const logs: string[] = [];
  const carteiras = new CarteirasEmMemoria({
    maxCarteiras: 100,
    relogio: () => RELOGIO,
    log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
    ...extra,
  });
  return { carteiras, logs };
};

/** Uma carteira com `saldo` moedas (a de antes tem 100). */
const comSaldo = (saldo: number, extra: Partial<ConstructorParameters<typeof CarteirasEmMemoria>[0]> = {}) => {
  const a = abrir(extra);
  const c = a.carteiras.criar()!;
  if (saldo !== SALDO_INICIAL) a.carteiras.aplicar([{ id: c.id, delta: saldo - SALDO_INICIAL }]);
  return { ...a, c };
};

const balaoDe = (carteiras: CarteirasEmMemoria, id: string) => carteiras.ler(id)!.balao!;

describe('a carteira nova: o balão padrão e só os itens grátis', () => {
  it('ler() traz a aparência padrão e os dois itens grátis', () => {
    const { carteiras, c } = comSaldo(SALDO_INICIAL);
    expect(balaoDe(carteiras, c.id)).toEqual({ aparencia: APARENCIA_PADRAO, itens: GRATIS });
  });

  it('o balão devolvido é uma cópia: mexer nele não mexe na carteira', () => {
    const { carteiras, c } = comSaldo(SALDO_INICIAL);
    const lido = carteiras.ler(c.id)!;
    (lido.balao!.itens as IdItemDoBalao[]).push('coroa');
    (lido.balao!.aparencia as { chapeu: string | null }).chapeu = 'coroa';
    expect(balaoDe(carteiras, c.id)).toEqual({ aparencia: APARENCIA_PADRAO, itens: GRATIS });
  });
});

describe('comprar um item do balão', () => {
  it('desconta o preço do catálogo, guarda o item (na ordem da loja) e devolve o estado; não o põe em uso', () => {
    const { carteiras, c } = comSaldo(1000);
    const r = carteiras.comprarItemDoBalao(c.id, 'cartola');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.saldo).toBe(1000 - precoDoItemDoBalao('cartola'));
    expect(r.estado.balao).toEqual({ aparencia: APARENCIA_PADRAO, itens: ['cartola', ...GRATIS] });
    // a ordem é a da loja, não a da compra
    carteiras.comprarItemDoBalao(c.id, 'dourado');
    carteiras.comprarItemDoBalao(c.id, 'bigodao');
    expect(balaoDe(carteiras, c.id).itens).toEqual(['cartola', 'bigodao', 'olho_normal', 'castanho', 'dourado']);
    expect(carteiras.ler(c.id)!.saldo).toBe(1000 - 260 - 80 - 120);
  });

  it('cada um dos 23 itens pagos pode ser comprado, pelo preço do catálogo', () => {
    for (const item of ITENS_DO_BALAO.filter((i) => i.preco > 0)) {
      const { carteiras, c } = comSaldo(10_000);
      const r = carteiras.comprarItemDoBalao(c.id, item.id);
      expect(r.ok, item.id).toBe(true);
      expect(carteiras.ler(c.id)!.saldo, item.id).toBe(10_000 - item.preco);
      expect(balaoDe(carteiras, c.id).itens, item.id).toContain(item.id);
    }
  });

  it('já ter o item é ja-tem e não cobra de novo', () => {
    const { carteiras, c } = comSaldo(1000);
    carteiras.comprarItemDoBalao(c.id, 'coroa');
    const saldo = carteiras.ler(c.id)!.saldo;
    expect(carteiras.comprarItemDoBalao(c.id, 'coroa')).toEqual({ ok: false, erro: 'ja-tem' });
    expect(carteiras.ler(c.id)!.saldo).toBe(saldo);
  });

  it('os itens grátis todo mundo tem: comprar o estilo normal ou a cor castanho é ja-tem', () => {
    const { carteiras, c } = comSaldo(1000);
    expect(carteiras.comprarItemDoBalao(c.id, 'olho_normal')).toEqual({ ok: false, erro: 'ja-tem' });
    expect(carteiras.comprarItemDoBalao(c.id, 'castanho')).toEqual({ ok: false, erro: 'ja-tem' });
    expect(carteiras.ler(c.id)!.saldo).toBe(1000);
  });

  it('saldo curto é saldo-insuficiente e nada muda; igual ao preço compra e fica em zero; saldo negativo não compra nada', () => {
    const curta = comSaldo(precoDoItemDoBalao('coroa') - 1);
    expect(curta.carteiras.comprarItemDoBalao(curta.c.id, 'coroa')).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    expect(curta.carteiras.ler(curta.c.id)!.saldo).toBe(499);
    expect(balaoDe(curta.carteiras, curta.c.id).itens).toEqual(GRATIS);

    const justa = comSaldo(precoDoItemDoBalao('coroa'));
    expect(justa.carteiras.comprarItemDoBalao(justa.c.id, 'coroa').ok).toBe(true);
    expect(justa.carteiras.ler(justa.c.id)!.saldo).toBe(0);

    const devendo = comSaldo(-50);
    expect(devendo.carteiras.comprarItemDoBalao(devendo.c.id, 'mel')).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    expect(devendo.carteiras.ler(devendo.c.id)!.saldo).toBe(-50);
  });

  it('item que não existe, de skin, de propriedade do Object ou que não é texto é item-invalido', () => {
    const { carteiras, c } = comSaldo(5000);
    for (const ruim of ['barba_longa', 'ebano', 'toString', '__proto__', 'constructor', 'Coroa', ' coroa', '', 7, null, undefined, {}]) {
      expect(carteiras.comprarItemDoBalao(c.id, ruim as string), String(ruim)).toEqual({ ok: false, erro: 'item-invalido' });
    }
    expect(carteiras.ler(c.id)!.saldo).toBe(5000);
  });

  it('carteira que não existe é carteira-invalida', () => {
    const { carteiras } = abrir();
    expect(carteiras.comprarItemDoBalao('f'.repeat(64), 'coroa')).toEqual({ ok: false, erro: 'carteira-invalida' });
  });

  it('o preço visto é só um teto: o preço da sala maior recusa com preco-mudou sem cobrar; igual ou maior cobra o do catálogo; valor que não é número recusa', () => {
    const { carteiras, c } = comSaldo(1000);
    expect(carteiras.comprarItemDoBalao(c.id, 'cartola', undefined, 100)).toEqual({ ok: false, erro: 'preco-mudou' });
    expect(carteiras.comprarItemDoBalao(c.id, 'cartola', undefined, 259)).toEqual({ ok: false, erro: 'preco-mudou' });
    expect(carteiras.comprarItemDoBalao(c.id, 'cartola', undefined, 'x' as unknown as number)).toEqual({ ok: false, erro: 'preco-mudou' });
    expect(carteiras.ler(c.id)!.saldo).toBe(1000);
    expect(carteiras.comprarItemDoBalao(c.id, 'cartola', undefined, 260).ok).toBe(true);
    expect(carteiras.ler(c.id)!.saldo).toBe(740);
    // o teto nunca vira o preço: pedir com folga cobra o do catálogo
    expect(carteiras.comprarItemDoBalao(c.id, 'mel', undefined, 9_999).ok).toBe(true);
    expect(carteiras.ler(c.id)!.saldo).toBe(700);
  });

  it('a ordem das recusas: carteira, item, ja-tem, preco-mudou, saldo', () => {
    const { carteiras, c } = comSaldo(0);
    expect(carteiras.comprarItemDoBalao(c.id, 'coroa', undefined, 1)).toEqual({ ok: false, erro: 'preco-mudou' });
    expect(carteiras.comprarItemDoBalao(c.id, 'coroa', undefined, 500)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    expect(carteiras.comprarItemDoBalao(c.id, 'olho_normal', undefined, 1)).toEqual({ ok: false, erro: 'ja-tem' });
  });

  it('duas compras do mesmo item uma depois da outra: o dinheiro sai uma vez só', () => {
    const { carteiras, c } = comSaldo(1000);
    const rs = Array.from({ length: 10 }, () => carteiras.comprarItemDoBalao(c.id, 'boina'));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(rs.filter((r) => !r.ok && r.erro === 'ja-tem')).toHaveLength(9);
    expect(carteiras.ler(c.id)!.saldo).toBe(1000 - 180);
  });

  it('compras diferentes que juntas passam do saldo: só entra o que cabe, e o saldo nunca fica negativo', () => {
    const { carteiras, c } = comSaldo(300);
    const compras = (['cartola', 'chapeu_panama', 'boina', 'coroa'] as const).map((i) => carteiras.comprarItemDoBalao(c.id, i));
    expect(compras.map((r) => r.ok)).toEqual([true, false, false, false]);
    expect(carteiras.ler(c.id)!.saldo).toBe(40);
  });

  it('avisa quem olha a carteira (as salas onde ela está sentada), menos a origem', () => {
    const { carteiras, c } = comSaldo(1000);
    const vistos: unknown[] = [];
    carteiras.aoMudar((id, origem) => vistos.push([id === c.id, origem]));
    const sala = {};
    carteiras.comprarItemDoBalao(c.id, 'coroa', sala);
    expect(vistos).toEqual([[true, sala]]);
    carteiras.comprarItemDoBalao(c.id, 'coroa', sala); // recusada: ninguém é avisado
    expect(vistos).toHaveLength(1);
  });

  it('o log da compra diz o item e o preço, e nunca o código nem o id da carteira', () => {
    const { carteiras, c, logs } = comSaldo(1000);
    carteiras.comprarItemDoBalao(c.id, 'bigode_dali');
    const linha = logs.find((l) => l.startsWith('compra-balao '));
    expect(linha).toContain('"item":"bigode_dali"');
    expect(linha).toContain('"preco":160');
    expect(logs.join('\n')).not.toContain(c.codigo);
    expect(logs.join('\n')).not.toContain(c.id);
  });

  it('encerrado, não compra', () => {
    const { carteiras, c } = comSaldo(1000);
    Object.defineProperty(carteiras, 'encerrado', { get: () => true });
    expect(carteiras.comprarItemDoBalao(c.id, 'coroa')).toEqual({ ok: false, erro: 'encerrado' });
  });

  it('a carteira com item de balão não é "nunca usada": o teto não a toma', () => {
    const { carteiras, c } = comSaldo(SALDO_INICIAL, { maxCarteiras: 2 });
    const outra = carteiras.criar()!;
    carteiras.aplicar([{ id: c.id, delta: 100 }]); // sobe o saldo para poder comprar sem voltar a 100 depois
    carteiras.comprarItemDoBalao(c.id, 'mel');
    carteiras.aplicar([{ id: c.id, delta: -60 }]); // 100 de novo
    expect(carteiras.ler(c.id)!.saldo).toBe(SALDO_INICIAL);
    const nova = carteiras.criar();
    expect(nova).not.toBeNull();
    expect(carteiras.ler(outra.id)).toBeUndefined(); // a nunca usada saiu
    expect(carteiras.ler(c.id)).toBeDefined(); // a com item ficou
  });
});

describe('equipar a aparência', () => {
  const cheia: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_kawaii', corDosOlhos: 'dourado' };
  const comTudo = () => {
    const a = comSaldo(10_000);
    for (const i of ['coroa', 'bigodao', 'olho_kawaii', 'dourado', 'cartola']) a.carteiras.comprarItemDoBalao(a.c.id, i);
    return a;
  };

  it('equipa o que a carteira tem: a aparência fica e vai a ler()', () => {
    const { carteiras, c } = comTudo();
    const r = carteiras.equiparAparencia(c.id, cheia);
    expect(r.ok).toBe(true);
    expect(balaoDe(carteiras, c.id).aparencia).toEqual(cheia);
    // outra, só com parte do que tem
    expect(carteiras.equiparAparencia(c.id, { chapeu: 'cartola', bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' }).ok).toBe(true);
    expect(balaoDe(carteiras, c.id).aparencia).toEqual({ chapeu: 'cartola', bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' });
    // equipar não cobra nada nem tira item
    expect(carteiras.ler(c.id)!.saldo).toBe(10_000 - 260 - 500 - 120 - 150 - 80);
    expect(balaoDe(carteiras, c.id).itens).toHaveLength(7);
  });

  it('os itens grátis todo mundo equipa, sem ter comprado nada', () => {
    const { carteiras, c } = comSaldo(SALDO_INICIAL);
    expect(carteiras.equiparAparencia(c.id, APARENCIA_PADRAO).ok).toBe(true);
    expect(balaoDe(carteiras, c.id).aparencia).toEqual(APARENCIA_PADRAO);
  });

  it('item pago que a carteira NÃO tem é nao-tem, e nada muda (nem os campos que ela tem)', () => {
    const { carteiras, c } = comTudo();
    carteiras.equiparAparencia(c.id, cheia);
    for (const outra of [
      { ...cheia, chapeu: 'chapeu_panama' },
      { ...cheia, bigode: 'bigode_dali' },
      { ...cheia, olhos: 'olho_bravo' },
      { ...cheia, corDosOlhos: 'vermelho' },
      // metade vale e metade não: recusada inteira
      { chapeu: 'cartola', bigode: null, olhos: 'olho_cansado', corDosOlhos: 'castanho' },
    ] as AparenciaDoBalao[]) {
      expect(carteiras.equiparAparencia(c.id, outra), JSON.stringify(outra)).toEqual({ ok: false, erro: 'nao-tem' });
      expect(balaoDe(carteiras, c.id).aparencia, JSON.stringify(outra)).toEqual(cheia);
    }
  });

  it('uma carteira não equipa o que é de outra', () => {
    const a = comTudo();
    const outra = a.carteiras.criar()!;
    expect(a.carteiras.equiparAparencia(outra.id, cheia)).toEqual({ ok: false, erro: 'nao-tem' });
    expect(balaoDe(a.carteiras, outra.id).aparencia).toEqual(APARENCIA_PADRAO);
  });

  it('aparência inválida é recusada inteira: id que não existe, de outro tipo, campo faltando ou a mais, ou que nem é objeto', () => {
    const { carteiras, c } = comTudo();
    carteiras.equiparAparencia(c.id, cheia);
    const ruins: unknown[] = [
      { ...cheia, chapeu: 'barba_longa' },
      { ...cheia, chapeu: 'bigodao' },
      { ...cheia, bigode: 'coroa' },
      { ...cheia, olhos: 'dourado' },
      { ...cheia, corDosOlhos: 'olho_kawaii' },
      { ...cheia, olhos: null },
      { chapeu: null, bigode: null, olhos: 'olho_normal' },
      { ...cheia, barba: 'longa' },
      { ...cheia, chapeu: undefined },
      { ...cheia, chapeu: 'toString' },
      null,
      undefined,
      'coroa',
      [cheia],
      7,
    ];
    for (const ruim of ruins) {
      expect(carteiras.equiparAparencia(c.id, ruim), JSON.stringify(ruim)).toEqual({ ok: false, erro: 'aparencia-invalida' });
      expect(balaoDe(carteiras, c.id).aparencia, JSON.stringify(ruim)).toEqual(cheia);
    }
  });

  it('carteira que não existe é carteira-invalida; encerrado não equipa', () => {
    const { carteiras, c } = comTudo();
    expect(carteiras.equiparAparencia('f'.repeat(64), cheia)).toEqual({ ok: false, erro: 'carteira-invalida' });
    Object.defineProperty(carteiras, 'encerrado', { get: () => true });
    expect(carteiras.equiparAparencia(c.id, cheia)).toEqual({ ok: false, erro: 'encerrado' });
  });

  it('avisa quem olha a carteira só quando a aparência muda de fato', () => {
    const { carteiras, c } = comTudo();
    const vistos: unknown[] = [];
    carteiras.aoMudar((id, origem) => vistos.push([id === c.id, origem]));
    const sala = {};
    carteiras.equiparAparencia(c.id, cheia, sala);
    expect(vistos).toEqual([[true, sala]]);
    carteiras.equiparAparencia(c.id, cheia, sala); // a mesma: nada mudou
    expect(vistos).toHaveLength(1);
    carteiras.equiparAparencia(c.id, { ...cheia, chapeu: 'barba' } as unknown as AparenciaDoBalao, sala); // recusada
    expect(vistos).toHaveLength(1);
  });

  it('equipar guarda uma cópia: mexer no objeto que se passou depois não muda a carteira', () => {
    const { carteiras, c } = comTudo();
    const pedida = { ...cheia } as { -readonly [K in keyof AparenciaDoBalao]: AparenciaDoBalao[K] };
    carteiras.equiparAparencia(c.id, pedida);
    pedida.chapeu = 'chapeu_panama';
    expect(balaoDe(carteiras, c.id).aparencia).toEqual(cheia);
  });
});

describe('exportar: a cópia de segurança é o que importar aceita', () => {
  it('exportar de um armazém e importar noutro dá carteiras idênticas, com o balão, e os mesmos códigos abrem', () => {
    const origem = comSaldo(5000);
    const outra = origem.carteiras.criar()!;
    for (const i of ['coroa', 'bigodao', 'olho_kawaii', 'dourado']) origem.carteiras.comprarItemDoBalao(origem.c.id, i);
    origem.carteiras.equiparAparencia(origem.c.id, { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_kawaii', corDosOlhos: 'dourado' });
    origem.carteiras.comprarItemDoBalao(origem.c.id, 'boina');
    const texto = origem.carteiras.exportar();

    const destino = abrir().carteiras;
    expect(destino.importar(texto)).toEqual({ ok: true, importadas: 2, descartadas: 0, migradas: 0, substituidas: 0 });
    const ids = [origem.c, outra].map((c) => destino.resolver(c.codigo)!);
    expect(ids.map((id) => destino.ler(id))).toEqual([origem.c, outra].map((c) => origem.carteiras.ler(c.id)));
    expect(destino.ler(ids[0]!)!.balao!.aparencia.chapeu).toBe('coroa');
  });

  it('a cópia leva o formato 2 de sempre (versao e carteiras) e nunca o código', () => {
    const { carteiras, c } = comSaldo(1000);
    carteiras.comprarItemDoBalao(c.id, 'mel');
    const dado = JSON.parse(carteiras.exportar()) as { versao: number; carteiras: Record<string, unknown> };
    expect(dado.versao).toBe(2);
    expect(Object.keys(dado.carteiras)).toEqual([c.id]);
    expect(carteiras.exportar()).not.toContain(c.codigo);
  });

  it('um armazém vazio exporta uma cópia vazia que importar aceita', () => {
    const vazio = abrir().carteiras;
    const destino = abrir().carteiras;
    expect(destino.importar(vazio.exportar())).toEqual({ ok: true, importadas: 0, descartadas: 0, migradas: 0, substituidas: 0 });
  });
});

describe('migração: a carteira do formato atual (itens, sem balão) abre com o padrão e nenhum item', () => {
  const ID = 'a'.repeat(64);
  /** Uma carteira exatamente como o L46 a grava: nenhuma chave de balão. */
  const doFormatoAtual = {
    saldo: 1234,
    itens: [
      { skin: 'classico', semente: 11, bolas: 7 },
      { skin: 'ebano', semente: 321, bolas: 40 },
    ],
    skin: 'ebano',
    criadaEm: 1_700_000_000_000,
    jogou: true,
    presentes: { 'skins-cs': 500 },
    missoes: { dia: '2026-11-02', progresso: { 'mao-quente': 2 } },
    estatisticas: { 'par-ou-impar': { partidas: 3, vitorias: 2, bolas: 12, sequencia: 4, tabeladas: 1, missoes: 1, moedas: 50 } },
  };
  const arquivoAtual = JSON.stringify({ versao: 2, carteiras: { [ID]: doFormatoAtual } });

  const confereIntacta = (carteiras: CarteirasEmMemoria | CarteirasNoDO | ArmazemDeCarteiras) => {
    const lida = carteiras.ler(ID)!;
    expect(lida).toBeDefined();
    expect(lida.saldo).toBe(1234);
    expect(lida.skin).toBe('ebano');
    expect(lida.itens).toEqual(doFormatoAtual.itens);
    expect(lida.skins).toEqual(['classico', 'ebano']);
    expect(lida.estatisticas!.total).toMatchObject({ partidas: 3, vitorias: 2, bolas: 12, sequencia: 4, moedas: 50 });
    expect(lida.balao).toEqual({ aparencia: APARENCIA_PADRAO, itens: GRATIS });
  };

  it('na memória (importar)', () => {
    const { carteiras } = abrir();
    expect(carteiras.importar(arquivoAtual)).toEqual({ ok: true, importadas: 1, descartadas: 0, migradas: 0, substituidas: 0 });
    confereIntacta(carteiras);
  });

  describe('no arquivo da sala Node (carteiras.json)', () => {
    const pastas: string[] = [];
    const abertos: ArmazemDeCarteiras[] = [];
    afterEach(async () => {
      await Promise.all(abertos.splice(0).map((a) => a.fechar()));
      for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
    });
    const abrirNode = (pasta: string) => {
      const a = new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 1, relogio: () => RELOGIO, log: () => {} });
      abertos.push(a);
      return a;
    };

    it('abre com o padrão, sem perder nem mudar nada, e não regrava o arquivo só por abrir', async () => {
      const pasta = mkdtempSync(join(tmpdir(), 'sala-balao-'));
      pastas.push(pasta);
      writeFileSync(join(pasta, 'carteiras.json'), arquivoAtual);
      const a = abrirNode(pasta);
      confereIntacta(a);
      await a.fechar();
      expect(readFileSync(join(pasta, 'carteiras.json'), 'utf8')).toBe(arquivoAtual);
    });

    it('depois de comprar e equipar, o arquivo leva o balão e um armazém novo o lê igual', async () => {
      const pasta = mkdtempSync(join(tmpdir(), 'sala-balao-'));
      pastas.push(pasta);
      writeFileSync(join(pasta, 'carteiras.json'), arquivoAtual);
      const a = abrirNode(pasta);
      expect(a.comprarItemDoBalao(ID, 'cartola').ok).toBe(true);
      expect(a.equiparAparencia(ID, { chapeu: 'cartola', bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' }).ok).toBe(true);
      const esperado = a.ler(ID);
      await a.fechar();
      const b = abrirNode(pasta);
      expect(b.ler(ID)).toEqual(esperado);
      expect(b.ler(ID)!.balao).toEqual({ aparencia: { chapeu: 'cartola', bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' }, itens: ['cartola', ...GRATIS] });
      expect(b.ler(ID)!.saldo).toBe(1234 - 260);
    });

    it('quem nunca mexeu no balão é gravada como sempre foi, sem chave nova (uma versão antiga da sala ainda a lê)', async () => {
      const pasta = mkdtempSync(join(tmpdir(), 'sala-balao-'));
      pastas.push(pasta);
      writeFileSync(join(pasta, 'carteiras.json'), arquivoAtual);
      const a = abrirNode(pasta);
      a.usar(ID, 'classico');
      a.usar(ID, 'ebano');
      a.equiparAparencia(ID, APARENCIA_PADRAO);
      await a.fechar();
      const gravado = JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { versao: number; carteiras: Record<string, Record<string, unknown>> };
      expect(gravado.versao).toBe(2);
      expect(Object.keys(gravado.carteiras[ID]!).sort()).toEqual(Object.keys(doFormatoAtual).sort());
    });

    it('a carteira recém-criada também é gravada sem a chave do balão (só quem compra ou equipa a ganha)', async () => {
      const pasta = mkdtempSync(join(tmpdir(), 'sala-balao-'));
      pastas.push(pasta);
      const a = abrirNode(pasta);
      const nova = a.criar()!;
      await a.fechar();
      const gravado = JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { carteiras: Record<string, Record<string, unknown>> };
      expect(Object.keys(gravado.carteiras[nova.id]!)).not.toContain('balao');
    });

    it('comprar um item grava o balão no arquivo à parte, mesmo com a aparência ainda no padrão: o item pago tem de ficar, e o carteiras.json não leva a chave', async () => {
      const pasta = mkdtempSync(join(tmpdir(), 'sala-balao-'));
      pastas.push(pasta);
      writeFileSync(join(pasta, 'carteiras.json'), arquivoAtual);
      const a = abrirNode(pasta);
      a.comprarItemDoBalao(ID, 'mel');
      await a.fechar();
      const gravado = JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { carteiras: Record<string, { balao?: unknown; saldo: number }> };
      expect(Object.keys(gravado.carteiras[ID]!)).not.toContain('balao');
      expect(gravado.carteiras[ID]!.saldo).toBe(1234 - 40);
      expect(JSON.parse(readFileSync(join(pasta, 'carteiras-balao.json'), 'utf8'))).toEqual({ versao: 1, baloes: { [ID]: { itens: ['mel'], aparencia: APARENCIA_PADRAO } } });
    });
  });

  describe('no SQLite do Durable Object', () => {
    function banco() {
      const db = new DatabaseSync(':memory:');
      const sql: SqlMinimo = {
        exec(consulta, ...ligacoes): CursorMinimo {
          const st = db.prepare(consulta);
          if (st.columns().length > 0) {
            const linhas = st.all(...ligacoes) as Record<string, unknown>[];
            return { toArray: () => linhas, rowsRead: linhas.length, rowsWritten: 0 };
          }
          const r = st.run(...ligacoes);
          return { toArray: () => [], rowsRead: 0, rowsWritten: Number(r.changes) };
        },
      };
      const transacao = <T>(fn: () => T): T => {
        db.exec('BEGIN');
        try {
          const r = fn();
          db.exec('COMMIT');
          return r;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      };
      return { db, sql, transacao };
    }
    const abrirDO = (b: ReturnType<typeof banco>) => new CarteirasNoDO({ sql: b.sql, transacao: b.transacao, maxCarteiras: 100, relogio: () => RELOGIO, log: () => {} });
    const linha = (b: ReturnType<typeof banco>) => (b.db.prepare('SELECT dados FROM carteiras WHERE id = ?').get(ID) as { dados: string }).dados;

    it('a linha de antes abre com o padrão, nada se perde, e abrir não regrava a linha', () => {
      const b = banco();
      abrirDO(b); // cria o esquema
      b.db.prepare('INSERT INTO carteiras (id, dados) VALUES (?, ?)').run(ID, JSON.stringify(doFormatoAtual));
      const a = abrirDO(b);
      confereIntacta(a);
      expect(a.pendentes).toBe(0);
      expect(linha(b)).toBe(JSON.stringify(doFormatoAtual));
      expect(b.db.prepare('SELECT COUNT(*) AS n FROM carteiras_descartadas').get()).toEqual({ n: 0 });
    });

    it('comprar e equipar vão ao banco na hora (a carteira e o balão na mesma transação), e um objeto novo sobre as mesmas tabelas vê o mesmo', () => {
      const b = banco();
      abrirDO(b);
      b.db.prepare('INSERT INTO carteiras (id, dados) VALUES (?, ?)').run(ID, JSON.stringify(doFormatoAtual));
      const a = abrirDO(b);
      a.comprarItemDoBalao(ID, 'bigode_guidao');
      a.comprarItemDoBalao(ID, 'verde');
      a.equiparAparencia(ID, { chapeu: null, bigode: 'bigode_guidao', olhos: 'olho_normal', corDosOlhos: 'verde' });
      const depois = abrirDO(b);
      expect(depois.ler(ID)).toEqual(a.ler(ID));
      expect(depois.ler(ID)!.saldo).toBe(1234 - 140 - 50);
      expect(Object.keys(JSON.parse(linha(b)) as object)).not.toContain('balao');
      const guardado = b.db.prepare('SELECT dados FROM carteiras_balao WHERE id = ?').get(ID) as { dados: string };
      expect(JSON.parse(guardado.dados)).toEqual({ itens: ['bigode_guidao', 'verde'], aparencia: { chapeu: null, bigode: 'bigode_guidao', olhos: 'olho_normal', corDosOlhos: 'verde' } });
    });

    it('a linha de antes que muda por outro motivo continua sem a chave do balão', () => {
      const b = banco();
      abrirDO(b);
      b.db.prepare('INSERT INTO carteiras (id, dados) VALUES (?, ?)').run(ID, JSON.stringify(doFormatoAtual));
      const a = abrirDO(b);
      a.usar(ID, 'classico');
      expect(Object.keys(JSON.parse(linha(b)) as object)).not.toContain('balao');
    });
  });
});

describe('balão guardado com defeito: não derruba a carteira', () => {
  const ID = 'b'.repeat(64);
  const base = { saldo: 300, itens: [{ skin: 'classico', semente: 5, bolas: 0 }], skin: 'classico', criadaEm: 1, jogou: true };
  const abrirCom = (balao: unknown) => {
    const { carteiras } = abrir();
    carteiras.importar(JSON.stringify({ versao: 2, carteiras: { [ID]: base }, baloes: { [ID]: balao } }));
    return carteiras;
  };

  it('item que saiu do catálogo, repetido ou grátis é ignorado; os bons ficam', () => {
    const c = abrirCom({ itens: ['barba_longa', 'coroa', 'coroa', 'olho_normal', 'ebano', 7], aparencia: APARENCIA_PADRAO });
    expect(c.ler(ID)!.balao).toEqual({ aparencia: APARENCIA_PADRAO, itens: ['coroa', ...GRATIS] });
  });

  it('campo da aparência que não vale, ou que usa item que a carteira não tem, volta ao padrão só ele', () => {
    const c = abrirCom({ itens: ['coroa'], aparencia: { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_bravo', corDosOlhos: 'castanho' } });
    expect(c.ler(ID)!.balao!.aparencia).toEqual({ chapeu: 'coroa', bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' });
  });

  it('o balão que a linha da carteira ainda trazia (o L47, que nunca foi publicado) vale; o de `baloes` manda sobre ele', () => {
    const { carteiras } = abrir();
    const comBalaoNaLinha = { ...base, balao: { itens: ['coroa'], aparencia: { ...APARENCIA_PADRAO, chapeu: 'coroa' } } };
    carteiras.importar(JSON.stringify({ versao: 2, carteiras: { [ID]: comBalaoNaLinha } }));
    expect(carteiras.ler(ID)!.balao).toEqual({ aparencia: { ...APARENCIA_PADRAO, chapeu: 'coroa' }, itens: ['coroa', ...GRATIS] });
    carteiras.importar(JSON.stringify({ versao: 2, carteiras: { [ID]: comBalaoNaLinha }, baloes: { [ID]: { itens: ['mel'], aparencia: APARENCIA_PADRAO } } }), { sobrescrever: true });
    expect(carteiras.ler(ID)!.balao!.itens).toEqual([...GRATIS, 'mel'].sort((a, b) => ITENS_DO_BALAO.findIndex((i) => i.id === a) - ITENS_DO_BALAO.findIndex((i) => i.id === b)));
  });

  it('`baloes` que não é um objeto recusa o arquivo todo: o balão custou dinheiro e não se descarta calado', () => {
    const { carteiras } = abrir();
    for (const lixo of [[], 'coroa', 7, null]) {
      expect(carteiras.importar(JSON.stringify({ versao: 2, carteiras: { [ID]: base }, baloes: lixo })), JSON.stringify(lixo)).toEqual({ ok: false, motivo: 'arquivo-invalido' });
    }
    expect(carteiras.total).toBe(0);
  });

  it('balão que nem é um objeto vira o padrão', () => {
    for (const lixo of ['coroa', 7, [], null, { itens: 'coroa', aparencia: 'x' }]) {
      const c = abrirCom(lixo);
      expect(c.ler(ID)!.saldo, JSON.stringify(lixo)).toBe(300);
      expect(c.ler(ID)!.balao, JSON.stringify(lixo)).toEqual({ aparencia: APARENCIA_PADRAO, itens: GRATIS });
    }
  });
});
