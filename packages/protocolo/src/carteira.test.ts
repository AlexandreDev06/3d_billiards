import { describe, expect, it } from 'vitest';
import { PRESET_BOTECO } from '@sinuca/regras';
import {
  APOSTAS_DA_SALA,
  APOSTA_PADRAO,
  FAIXAS,
  PROTOCOLO_VERSAO,
  SALDO_INICIAL,
  SEMENTES_POR_ITEM,
  SKINS_DE_TACO,
  SKIN_PADRAO,
  TAMANHO_CODIGO_CARTEIRA,
  ehCodigoDeCarteira,
  ehSemente,
  ehSkinDeTaco,
  faixaDaSkin,
  faixaDoCatalogo,
  ordemDaSkin,
  padraoDaSemente,
  padraoRaroDaSemente,
  skinDoCatalogoPorId,
  type SkinDoCatalogo,
  type SkinTaco,
  precoDaSkin,
  vitrineDoDia,
  validarCarteiraCriada,
  validarErroDaCarteira,
  validarEstadoDaCarteira,
  validarMensagemDaSala,
  validarMensagemDoCliente,
  validarPedidoDeSkin,
} from './index';

/** 32 bytes em base64url: 43 caracteres, sem preenchimento. */
const CODIGO = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCde';

describe('catálogo de skins, apostas e saldo (L22, L34)', () => {
  it('são 21 skins, na ordem da loja (faixa e preço), com id sem acento: os ids e os preços de sempre, nove com o nome do CS (L34c)', () => {
    expect(SKINS_DE_TACO.map(({ id, nome, preco, faixa }) => ({ id, nome, preco, faixa }))).toEqual([
      { id: 'classico', nome: 'Clássico', preco: 0, faixa: 'balcao' },
      { id: 'ebano', nome: 'Ébano', preco: 50, faixa: 'mesa' },
      { id: 'xadrez-de-toalha', nome: 'Xadrez de Toalha', preco: 70, faixa: 'mesa' },
      { id: 'boteco', nome: 'Boteco', preco: 80, faixa: 'mesa' },
      { id: 'marfim', nome: 'Marfim', preco: 100, faixa: 'mesa' },
      { id: 'long-neck', nome: 'Long Neck', preco: 120, faixa: 'mesa' },
      { id: 'carbono', nome: 'Carbono', preco: 150, faixa: 'salao' },
      { id: 'placar', nome: 'Asiimov', preco: 180, faixa: 'salao' },
      { id: 'chamas', nome: 'Chamas', preco: 200, faixa: 'salao' },
      { id: 'fim-de-tarde', nome: 'Fade', preco: 250, faixa: 'salao' },
      { id: 'resina-marmorizada', nome: 'Marble Fade', preco: 280, faixa: 'salao' },
      { id: 'neon', nome: 'Neon', preco: 300, faixa: 'salao' },
      { id: 'coral', nome: 'Coral', preco: 350, faixa: 'camarote' },
      { id: 'rede-de-cacapa', nome: 'Crimson Web', preco: 400, faixa: 'camarote' },
      { id: 'bicho-solto', nome: 'Bicho Solto', preco: 450, faixa: 'camarote' },
      { id: 'ouro', nome: 'Ouro', preco: 500, faixa: 'camarote' },
      { id: 'esmeralda-do-pano', nome: 'Gamma Doppler', preco: 800, faixa: 'lenda' },
      { id: 'obsidiana', nome: 'Doppler', preco: 1000, faixa: 'lenda' },
      { id: 'tempera', nome: 'Case Hardened', preco: 1200, faixa: 'lenda' },
      { id: 'corujao', nome: 'Howl', preco: 2000, faixa: 'reliquia' },
      { id: 'dragao-das-quinze', nome: 'Dragon Lore', preco: 3000, faixa: 'reliquia' },
    ]);
    expect(SKIN_PADRAO).toBe('classico');
    expect(precoDaSkin('classico')).toBe(0);
    expect(precoDaSkin('ouro')).toBe(500);
    expect(precoDaSkin('dragao-das-quinze')).toBe(3000);
    // o catálogo todo do doc: 11.480 moedas
    expect(SKINS_DE_TACO.reduce((soma, s) => soma + s.preco, 0)).toBe(11_480);
    // a ordem da loja é a de faixa e, dentro dela, de preço: nunca uma skin mais barata depois de uma mais cara
    expect(SKINS_DE_TACO.map((s) => s.preco)).toEqual([...SKINS_DE_TACO.map((s) => s.preco)].sort((a, b) => a - b));
    expect(SKINS_DE_TACO.map((s) => ordemDaSkin(s.id))).toEqual(SKINS_DE_TACO.map((_, i) => i));
  });

  it('os ids são únicos e sem acento, espaço nem maiúscula', () => {
    const ids = SKINS_DE_TACO.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('as 6 faixas têm nome e cor, e toda skin está numa delas (só a clássica no Balcão; as Relíquias são as duas mais caras)', () => {
    expect(FAIXAS.map((f) => f.id)).toEqual(['balcao', 'mesa', 'salao', 'camarote', 'lenda', 'reliquia']);
    expect(FAIXAS.map((f) => f.nome)).toEqual(['Balcão', 'Mesa', 'Salão', 'Camarote', 'Lenda', 'Relíquia']);
    for (const f of FAIXAS) expect(f.cor, f.id).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(FAIXAS.map((f) => f.cor)).size).toBe(FAIXAS.length);
    expect(faixaDoCatalogo('lenda').nome).toBe('Lenda');
    for (const s of SKINS_DE_TACO) expect(FAIXAS.map((f) => f.id), s.id).toContain(s.faixa);
    expect(SKINS_DE_TACO.filter((s) => s.faixa === 'balcao').map((s) => s.id)).toEqual(['classico']);
    expect(SKINS_DE_TACO.filter((s) => s.faixa === 'reliquia').map((s) => s.id)).toEqual(['corujao', 'dragao-das-quinze']);
    expect(faixaDaSkin('tempera')).toBe('lenda');
  });

  it('as sementes raras são dado: cerca de 1% por skin paga (10 em 1000), sem repetir, dentro do intervalo, com nome e selo; o clássico não tem', () => {
    expect(SEMENTES_POR_ITEM).toBe(1000);
    expect(SKINS_DE_TACO.find((s) => s.id === 'classico')!.raras).toEqual([]);
    for (const s of SKINS_DE_TACO.filter((x) => x.preco > 0)) {
      const sementes = s.raras.map((r) => r.semente);
      expect(sementes.length, s.id).toBe(10);
      expect(new Set(sementes).size, `${s.id} sem repetir`).toBe(sementes.length);
      for (const r of s.raras) {
        expect(ehSemente(r.semente), `${s.id} ${r.semente}`).toBe(true);
        expect(r.nome.trim().length, `${s.id} nome`).toBeGreaterThan(0);
        expect(r.selo, `${s.id} selo`).toMatch(/^[^a-zà-ú]{1,12}$/); // até 12 caracteres, sem minúscula
      }
    }
    // a "Gema azul" da Têmpera
    const gema = SKINS_DE_TACO.find((s) => s.id === 'tempera')!.raras.filter((r) => r.nome === 'Gema azul');
    expect(gema.length).toBeGreaterThan(0);
    expect(padraoRaroDaSemente('tempera', gema[0]!.semente)).toMatchObject({ nome: 'Gema azul', selo: 'GEMA AZUL' });
    expect(padraoRaroDaSemente('tempera', 0)).toBeUndefined();
    expect(padraoRaroDaSemente('classico', gema[0]!.semente)).toBeUndefined();
  });

  it('os padrões por semente (L34c) são dado: as raras somam de 1% a 1,5% por skin, não se repetem, e as fases cobrem o resto', () => {
    const comPadroes = (SKINS_DE_TACO as readonly SkinDoCatalogo[]).filter((s) => s.padroes !== undefined);
    expect(comPadroes.map((s) => s.id)).toEqual(['fim-de-tarde', 'resina-marmorizada', 'esmeralda-do-pano', 'obsidiana', 'tempera', 'corujao', 'dragao-das-quinze']);
    for (const s of comPadroes) {
      const padroes = s.padroes!;
      const raras = padroes.filter((p) => p.rara);
      const sementesRaras = raras.flatMap((p) => p.faixas.flatMap((f) => Array.from({ length: f.ate - f.de + 1 }, (_, n) => f.de + n)));
      expect(sementesRaras.length, `${s.id} raras`).toBeGreaterThanOrEqual(10); // 1%
      expect(sementesRaras.length, `${s.id} raras`).toBeLessThanOrEqual(15); // 1,5%
      expect(new Set(sementesRaras).size, `${s.id} raras sem se repetir`).toBe(sementesRaras.length);
      for (const p of padroes) {
        expect(p.nome.trim().length, `${s.id} nome`).toBeGreaterThan(0);
        expect(p.selo, `${s.id} ${p.nome} selo`).toMatch(/^[^a-zà-ú]{1,12}$/);
        for (const f of p.faixas) {
          expect(ehSemente(f.de) && ehSemente(f.ate) && f.de <= f.ate, `${s.id} ${p.nome} faixa`).toBe(true);
        }
      }
      expect(new Set(padroes.map((p) => p.nome)).size, `${s.id} nomes únicos`).toBe(padroes.length);
      // as raras vêm antes das fases (a primeira que cobre a semente vale)
      expect(padroes.map((p) => p.rara), s.id).toEqual([...padroes.map((p) => p.rara)].sort((a, b) => Number(b) - Number(a)));
    }
    // a Doppler e a Gamma Doppler têm as 4 fases comuns, sem buraco: toda semente dá um padrão
    for (const id of ['obsidiana', 'esmeralda-do-pano'] as const) {
      expect(skinDoCatalogoPorId(id).padroes!.filter((p) => !p.rara).map((p) => p.nome), id).toEqual(['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4']);
      for (let s = 0; s < SEMENTES_POR_ITEM; s++) expect(padraoDaSemente(id, s), `${id} #${s}`).toBeDefined();
    }
  });

  it('Howl e Dragon Lore (L34d) têm uma rara só, com as 10 sementes de antes numa lista, e `raras` e `padroes` dizem a mesma coisa', () => {
    const esperado = {
      corujao: { nome: 'Lobo da Geada', selo: 'GEADA', sementes: [43, 91, 165, 184, 202, 318, 382, 746, 864, 927] },
      'dragao-das-quinze': { nome: 'Ouro Verde', selo: 'OURO VERDE', sementes: [13, 39, 318, 350, 485, 519, 775, 820, 855, 921] },
    } as const;
    for (const id of ['corujao', 'dragao-das-quinze'] as const) {
      const skin = skinDoCatalogoPorId(id);
      const { nome, selo, sementes } = esperado[id];
      expect(skin.raras.map((r) => [r.nome, r.selo]), `${id} raras`).toEqual(sementes.map(() => [nome, selo]));
      expect(skin.raras.map((r) => r.semente), `${id} raras`).toEqual([...sementes]);
      expect(skin.padroes, `${id} padroes`).toEqual([{ nome, selo, rara: true, faixas: sementes.map((s) => ({ de: s, ate: s })) }]);
      // as duas fontes dão o mesmo padrão em todas as 1000 sementes
      for (let s = 0; s < SEMENTES_POR_ITEM; s++) {
        const rara = (sementes as readonly number[]).includes(s);
        expect(padraoDaSemente(id, s), `${id} #${s}`).toEqual(rara ? { nome, selo, rara: true } : undefined);
        expect(padraoRaroDaSemente(id, s)?.selo, `${id} #${s} raras`).toBe(rara ? selo : undefined);
      }
    }
    expect(padraoDaSemente('corujao', 184)).toEqual({ nome: 'Lobo da Geada', selo: 'GEADA', rara: true });
    expect(padraoDaSemente('corujao', 185)).toBeUndefined();
  });

  it('padraoDaSemente: Doppler, Gamma Doppler, Case Hardened, Fade e Marble Fade dão as fases e as raras do CS', () => {
    const nomesRaros = (id: SkinTaco): string[] => [...new Set(skinDoCatalogoPorId(id).padroes!.filter((p) => p.rara).map((p) => p.nome))];
    expect(nomesRaros('obsidiana')).toEqual(['Ruby', 'Sapphire', 'Black Pearl']);
    expect(nomesRaros('esmeralda-do-pano')).toEqual(['Emerald']);
    expect(nomesRaros('tempera')).toEqual(['Blue Gem']);
    expect(nomesRaros('fim-de-tarde')).toEqual(['Full Fade']);
    expect(nomesRaros('resina-marmorizada')).toEqual(['Fire & Ice']);
    // as fases por faixa de semente
    expect(padraoDaSemente('obsidiana', 0)).toEqual({ nome: 'Phase 1', selo: 'PHASE 1', rara: false });
    expect(padraoDaSemente('obsidiana', 300)).toMatchObject({ nome: 'Phase 2', rara: false });
    expect(padraoDaSemente('obsidiana', 700)).toMatchObject({ nome: 'Phase 3', rara: false });
    expect(padraoDaSemente('obsidiana', 999)).toMatchObject({ nome: 'Phase 4', rara: false });
    expect(padraoDaSemente('esmeralda-do-pano', 250)).toMatchObject({ nome: 'Phase 2', rara: false });
    // a rara fura a fase (a 77 estaria na Phase 1)
    expect(padraoDaSemente('obsidiana', 77)).toEqual({ nome: 'Ruby', selo: 'RUBY', rara: true });
    expect(padraoDaSemente('obsidiana', 142)).toMatchObject({ nome: 'Sapphire', rara: true });
    expect(padraoDaSemente('obsidiana', 836)).toMatchObject({ nome: 'Black Pearl', selo: 'BLACK PEARL', rara: true });
    expect(padraoDaSemente('esmeralda-do-pano', 58)).toMatchObject({ nome: 'Emerald', rara: true });
    // Blue Gem é a antiga Gema azul: as quatro sementes de antes seguem raras; a Case Hardened comum não tem fase nem nome
    for (const antiga of [44, 281, 458, 882]) expect(padraoDaSemente('tempera', antiga), `#${antiga}`).toEqual({ nome: 'Blue Gem', selo: 'BLUE GEM', rara: true });
    expect(padraoDaSemente('tempera', 0)).toBeUndefined();
    expect(padraoDaSemente('fim-de-tarde', 36)).toMatchObject({ nome: 'Full Fade', rara: true });
    expect(padraoDaSemente('fim-de-tarde', 37)).toBeUndefined();
    expect(padraoDaSemente('resina-marmorizada', 21)).toMatchObject({ nome: 'Fire & Ice', rara: true });
  });

  it('padraoDaSemente nas outras skins segue as raras de antes (todas raras); semente torta ou comum não dá nada', () => {
    const antiga = SKINS_DE_TACO.find((s) => s.id === 'ebano')!.raras[0]!;
    expect(padraoDaSemente('ebano', antiga.semente)).toEqual({ nome: antiga.nome, selo: antiga.selo, rara: true });
    expect(padraoDaSemente('classico', antiga.semente)).toBeUndefined();
    for (const torta of [-1, 1000, 1.5, NaN, Infinity]) expect(padraoDaSemente('obsidiana', torta), String(torta)).toBeUndefined();
    // o que o web do L35 lê não mudou: a antiga Gema azul e as raras de antes seguem em padraoRaroDaSemente
    expect(padraoRaroDaSemente('tempera', 44)).toMatchObject({ nome: 'Gema azul', selo: 'GEMA AZUL' });
    expect(padraoRaroDaSemente('obsidiana', 332)).toMatchObject({ selo: 'ARCO-ÍRIS' });
  });

  it('ehSemente: inteiro de 0 a 999', () => {
    for (const ok of [0, 1, 500, 999]) expect(ehSemente(ok), String(ok)).toBe(true);
    for (const ruim of [-1, 1000, 1.5, NaN, Infinity, '5', null, undefined]) expect(ehSemente(ruim), String(ruim)).toBe(false);
  });

  it('ehSkinDeTaco só aceita ids do catálogo (nada herdado do protótipo)', () => {
    expect(ehSkinDeTaco('neon')).toBe(true);
    expect(ehSkinDeTaco('dragao-das-quinze')).toBe(true);
    for (const ruim of ['Neon', 'ouro ', '', 'toString', '__proto__', 'constructor', 'dragão-das-quinze', 7, null, undefined, {}]) expect(ehSkinDeTaco(ruim), String(ruim)).toBe(false);
  });

  it('apostas 10, 20, 50 e 100 (padrão 10) e saldo inicial 100', () => {
    expect(APOSTAS_DA_SALA).toEqual([10, 20, 50, 100]);
    expect(APOSTA_PADRAO).toBe(10);
    expect(SALDO_INICIAL).toBe(100);
  });

  it('a versão do protocolo subiu para 10 (aparência do balão, L47; a 9 trouxe a física pelo anfitrião e as estatísticas, L38; a 8, as skins no estilo do CS, L34)', () => {
    expect(PROTOCOLO_VERSAO).toBe(10);
  });
});

describe('código da carteira', () => {
  it('tem 43 caracteres base64url (32 bytes), e só isso', () => {
    expect(TAMANHO_CODIGO_CARTEIRA).toBe(43);
    expect(ehCodigoDeCarteira(CODIGO)).toBe(true);
    for (const ruim of [CODIGO.slice(1), CODIGO + 'A', CODIGO.replace('A', '+'), CODIGO.replace('A', '='), CODIGO.replace('A', ' '), '', 5, null]) {
      expect(ehCodigoDeCarteira(ruim), String(ruim)).toBe(false);
    }
  });
});

describe('corpos e respostas do HTTP da carteira', () => {
  it('estado da carteira: saldo inteiro (pode ser negativo), skins do catálogo sem repetir e a skin em uso entre elas', () => {
    expect(validarEstadoDaCarteira({ saldo: 100, skins: ['classico'], skin: 'classico' }).ok).toBe(true);
    expect(validarEstadoDaCarteira({ saldo: -35, skins: ['classico', 'ouro'], skin: 'ouro' }).ok).toBe(true);
    const ruins: unknown[] = [
      { saldo: 1.5, skins: ['classico'], skin: 'classico' },
      { saldo: '100', skins: ['classico'], skin: 'classico' },
      { saldo: 100, skins: [], skin: 'classico' },
      { saldo: 100, skins: ['classico', 'classico'], skin: 'classico' },
      { saldo: 100, skins: ['classico', 'diamante'], skin: 'classico' },
      { saldo: 100, skins: ['classico'], skin: 'ouro' },
      { saldo: 100, skins: ['classico'], skin: 'classico', codigo: CODIGO },
      { saldo: 100, skins: ['classico'] },
    ];
    for (const r of ruins) expect(validarEstadoDaCarteira(r).ok, JSON.stringify(r)).toBe(false);
  });

  const item = (skin: string, semente: unknown = 7, bolas: unknown = 0) => ({ skin, semente, bolas });
  const DIA = '2026-10-26';

  it('estado com itens (L34): um por skin, na ordem da loja, com semente de 0 a 999 e contador; as `skins` são as mesmas deles', () => {
    const base = { saldo: 100, skins: ['classico', 'ouro'], skin: 'ouro' };
    expect(validarEstadoDaCarteira({ ...base, itens: [item('classico'), item('ouro', 999, 12)] }).ok).toBe(true);
    expect(validarEstadoDaCarteira({ saldo: 100, skins: ['classico'], skin: 'classico', itens: [item('classico', 0)] }).ok).toBe(true);
    const ruins: unknown[] = [
      { ...base, itens: [] },
      { ...base, itens: [item('classico'), item('ouro', 1000)] },
      { ...base, itens: [item('classico'), item('ouro', -1)] },
      { ...base, itens: [item('classico'), item('ouro', 1.5)] },
      { ...base, itens: [item('classico'), item('ouro', 5, -1)] },
      { ...base, itens: [item('classico'), item('ouro', 5, 2.5)] },
      { ...base, itens: [item('classico'), item('ouro', 5, '3')] },
      { ...base, itens: [item('ouro'), item('classico')] }, // fora da ordem da loja
      { ...base, itens: [item('classico'), item('classico'), item('ouro')] },
      { ...base, itens: [item('classico')] }, // falta o ouro que as skins dizem ter
      { ...base, itens: [item('classico'), item('ouro'), item('neon')] }, // sobra uma
      { ...base, itens: [item('ouro'), item('neon')] }, // sem o clássico
      { ...base, itens: [item('classico'), item('diamante')] },
      { ...base, itens: [{ skin: 'ouro', semente: 5 }] },
      { ...base, itens: [item('classico'), { ...item('ouro'), extra: 1 }] },
    ];
    for (const r of ruins) expect(validarEstadoDaCarteira(r).ok, JSON.stringify(r)).toBe(false);
  });

  it('estado com a vitrine do dia (L34): só a que o sorteio dá para aquele dia, com o desconto e os preços certos', () => {
    const base = { saldo: 100, skins: ['classico'], skin: 'classico' };
    const v = vitrineDoDia(DIA);
    expect(validarEstadoDaCarteira({ ...base, vitrine: v }).ok).toBe(true);
    const quebradas: unknown[] = [
      { ...v, dia: '2026-10-27' },
      { ...v, fimMs: v.fimMs + 1 },
      { ...v, desconto: 30 },
      { ...v, itens: v.itens.slice(1) },
      { ...v, itens: [{ ...v.itens[0]!, preco: v.itens[0]!.preco + 1 }, ...v.itens.slice(1)] },
      { ...v, itens: [{ ...v.itens[0]!, precoCheio: v.itens[0]!.precoCheio + 1 }, ...v.itens.slice(1)] },
      { ...v, itens: [...v.itens].reverse() },
      { ...v, itens: [{ skin: 'classico', precoCheio: 0, preco: 0 }, ...v.itens.slice(1)] },
      { ...v, extra: 1 },
      { dia: 'ontem', fimMs: 1, desconto: 20, itens: [] },
    ];
    for (const q of quebradas) expect(validarEstadoDaCarteira({ ...base, vitrine: q }).ok, JSON.stringify(q)).toBe(false);
  });

  it('carteira criada leva o código e o estado (com itens e vitrine), nada mais', () => {
    const novo = { codigo: CODIGO, saldo: 100, skins: ['classico'], skin: 'classico', itens: [item('classico', 321)], vitrine: vitrineDoDia(DIA) };
    expect(validarCarteiraCriada(novo).ok).toBe(true);
    expect(validarCarteiraCriada({ ...novo, itens: [item('classico', 1000)] }).ok).toBe(false);
    expect(validarCarteiraCriada({ codigo: CODIGO, saldo: 100, skins: ['classico'], skin: 'classico' }).ok).toBe(true);
    expect(validarCarteiraCriada({ saldo: 100, skins: ['classico'], skin: 'classico' }).ok).toBe(false);
    expect(validarCarteiraCriada({ codigo: 'curto', saldo: 100, skins: ['classico'], skin: 'classico' }).ok).toBe(false);
  });

  it('pedido de skin: { skin } e, opcional, o preco que a tela mostrou; texto curto (o catálogo é conferido pela sala, que responde skin-invalida)', () => {
    expect(validarPedidoDeSkin({ skin: 'neon' })).toEqual({ ok: true, valor: { skin: 'neon' } });
    expect(validarPedidoDeSkin({ skin: 'nao-existe' }).ok).toBe(true);
    for (const r of [{}, { skin: 3 }, { skin: '' }, { skin: 'a'.repeat(25) }, { skin: 'neon', extra: 1 }, [], null, 'neon', { skin: 'neon', __proto__: { x: 1 } }]) {
      expect(validarPedidoDeSkin(r).ok, JSON.stringify(r)).toBe(false);
    }
    expect(validarPedidoDeSkin(JSON.parse('{"skin":"neon","__proto__":{"x":1}}')).ok).toBe(false);
  });

  it('pedido de skin (L34b): preco é inteiro de 1 a 1 000 000; negativo, zero, fracionário, absurdo ou de outro tipo é recusado', () => {
    for (const preco of [1, 400, 3000, 1_000_000]) {
      expect(validarPedidoDeSkin({ skin: 'ouro', preco }), String(preco)).toEqual({ ok: true, valor: { skin: 'ouro', preco } });
    }
    for (const preco of [0, -1, -400, 399.5, 0.1, 1_000_001, Number.MAX_SAFE_INTEGER, Number.NaN, Infinity, -Infinity, '400', null, true, [400], { valor: 400 }]) {
      expect(validarPedidoDeSkin({ skin: 'ouro', preco }).ok, String(preco)).toBe(false);
    }
    expect(validarPedidoDeSkin({ preco: 400 }).ok).toBe(false); // sem skin não há pedido
    expect(validarPedidoDeSkin({ skin: 'ouro', preco: 400, semente: 1 }).ok).toBe(false); // continua estrito
  });

  it('erro da carteira: um dos oito códigos e uma mensagem (preco-mudou desde o L34b)', () => {
    for (const erro of ['carteira-invalida', 'saldo-insuficiente', 'skin-invalida', 'ja-tem', 'nao-tem', 'preco-mudou', 'limite', 'requisicao-invalida']) {
      expect(validarErroDaCarteira({ erro, mensagem: 'x' }).ok, erro).toBe(true);
    }
    expect(validarErroDaCarteira({ erro: 'outro', mensagem: 'x' }).ok).toBe(false);
    expect(validarErroDaCarteira({ erro: 'limite' }).ok).toBe(false);
  });
});

describe('mensagens do WebSocket com carteira e aposta (L22)', () => {
  const criar = { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Boteco', modo: '1x1', regras: PRESET_BOTECO.regras } as const;

  it('criar-sala e entrar levam a carteira (43 caracteres base64url); configurar-sala e criar-sala levam a aposta do catálogo', () => {
    expect(validarMensagemDoCliente({ ...criar, carteira: CODIGO, aposta: 50 }).ok).toBe(true);
    expect(validarMensagemDoCliente({ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Ana', carteira: CODIGO }).ok).toBe(true);
    expect(validarMensagemDoCliente({ tipo: 'configurar-sala', aposta: 100 }).ok).toBe(true);
    for (const aposta of [0, 5, 30, 101, -10, 10.5, '10', null]) {
      expect(validarMensagemDoCliente({ ...criar, aposta }).ok, `criar aposta=${String(aposta)}`).toBe(false);
      expect(validarMensagemDoCliente({ tipo: 'configurar-sala', aposta }).ok, `configurar aposta=${String(aposta)}`).toBe(false);
    }
    for (const carteira of ['curto', CODIGO + 'A', 'a b'.padEnd(43, 'x'), '', 7, null]) {
      expect(validarMensagemDoCliente({ ...criar, carteira }).ok, `criar carteira=${String(carteira)}`).toBe(false);
      expect(validarMensagemDoCliente({ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Ana', carteira }).ok, `entrar carteira=${String(carteira)}`).toBe(false);
    }
  });

  const lugar = (n: number, extra: object = {}) => ({ lugar: n, equipe: n % 2, nome: n < 2 ? `J${n}` : null, conectado: n < 2, anfitriao: n === 0, ...extra });
  const estado = (lugares: object[], extra: object = {}) => ({
    tipo: 'estado-sala', codigo: 'K7M2P', modo: '1x1', preset: 'Boteco', fase: 'espera', seq: 0, vez: null, lugares, espectadores: 0, ...extra,
  });

  it('estado-sala leva a aposta e, em cada lugar, o saldo (null sem carteira) e a skin', () => {
    const lugares = [lugar(0, { saldo: 90, skin: 'ouro' }), lugar(1, { saldo: null, skin: 'classico' }), lugar(2), lugar(3)];
    expect(validarMensagemDaSala(estado(lugares, { aposta: 20 })).ok).toBe(true);
    // saldo negativo é legítimo (a conta pode ficar no vermelho)
    expect(validarMensagemDaSala(estado([lugar(0, { saldo: -1230, skin: 'classico' }), lugar(1), lugar(2), lugar(3)], { aposta: 10 })).ok).toBe(true);
  });

  it('estado-sala recusa aposta fora do catálogo, saldo quebrado e skin desconhecida', () => {
    const base = [lugar(0), lugar(1), lugar(2), lugar(3)];
    expect(validarMensagemDaSala(estado(base, { aposta: 15 })).ok).toBe(false);
    expect(validarMensagemDaSala(estado([lugar(0, { saldo: 1.5 }), lugar(1), lugar(2), lugar(3)])).ok).toBe(false);
    expect(validarMensagemDaSala(estado([lugar(0, { saldo: 'x' }), lugar(1), lugar(2), lugar(3)])).ok).toBe(false);
    expect(validarMensagemDaSala(estado([lugar(0, { skin: 'diamante' }), lugar(1), lugar(2), lugar(3)])).ok).toBe(false);
    expect(validarMensagemDaSala(estado([lugar(0, { carteira: CODIGO }), lugar(1), lugar(2), lugar(3)])).ok, 'o código nunca viaja').toBe(false);
  });

  it('estado-sala leva, em cada lugar, a semente (0 a 999) e o contador de bolas do taco em uso, ou null sem carteira (L34)', () => {
    const lugares = [lugar(0, { saldo: 90, skin: 'tempera', semente: 44, bolas: 130 }), lugar(1, { saldo: null, skin: 'classico', semente: null, bolas: null }), lugar(2), lugar(3)];
    expect(validarMensagemDaSala(estado(lugares)).ok).toBe(true);
    expect(validarMensagemDaSala(estado([lugar(0, { semente: 0, bolas: 0 }), lugar(1), lugar(2), lugar(3)])).ok).toBe(true);
    for (const ruim of [{ semente: 1000 }, { semente: -1 }, { semente: 1.5 }, { semente: '5' }, { bolas: -1 }, { bolas: 2.5 }, { bolas: '3' }]) {
      expect(validarMensagemDaSala(estado([lugar(0, ruim), lugar(1), lugar(2), lugar(3)])).ok, JSON.stringify(ruim)).toBe(false);
    }
  });

  const paga = { tipo: 'aposta-paga', valor: 20, variacoes: [{ lugar: 0, nome: 'Ana', delta: 20, saldo: 120 }, { lugar: 1, nome: 'Beto', delta: -20, saldo: 80 }] };

  it('aposta-paga: o valor, as variações por lugar (com delta e saldo novo) ou a anulação', () => {
    expect(validarMensagemDaSala(paga).ok).toBe(true);
    expect(validarMensagemDaSala({ tipo: 'aposta-paga', valor: 10, variacoes: [], anulada: 'carteira-repetida' }).ok).toBe(true);
    expect(validarMensagemDaSala({ ...paga, variacoes: [{ lugar: 0, nome: 'Ana', delta: -10, saldo: -5 }] }).ok, 'saldo negativo').toBe(true);
  });

  it('aposta-paga recusa valor fora do catálogo, delta ou saldo quebrado, lugar repetido, anulação com variações e motivo desconhecido', () => {
    const ruins: unknown[] = [
      { ...paga, valor: 15 },
      { ...paga, variacoes: [{ lugar: 0, nome: 'Ana', delta: 1.5, saldo: 120 }] },
      { ...paga, variacoes: [{ lugar: 0, nome: 'Ana', delta: 20, saldo: '120' }] },
      { ...paga, variacoes: [{ lugar: 0, nome: 'Ana', delta: 20, saldo: 120 }, { lugar: 0, nome: 'Beto', delta: -20, saldo: 80 }] },
      { ...paga, variacoes: [{ lugar: 4, nome: 'Ana', delta: 20, saldo: 120 }] },
      { ...paga, variacoes: Array.from({ length: 5 }, (_, i) => ({ lugar: i % 4, nome: 'x', delta: 0, saldo: 0 })) },
      { ...paga, variacoes: [{ lugar: 0, nome: 'Ana', delta: 20, saldo: 120, carteira: CODIGO }] },
      { ...paga, anulada: 'carteira-repetida' },
      { tipo: 'aposta-paga', valor: 10, variacoes: [], anulada: 'outra' },
      { tipo: 'aposta-paga', valor: 10 },
    ];
    for (const r of ruins) expect(validarMensagemDaSala(r).ok, JSON.stringify(r)).toBe(false);
  });

  it('o cliente não manda aposta-paga: é só da sala', () => {
    expect(validarMensagemDoCliente(paga).ok).toBe(false);
  });
});
