import { describe, expect, it } from 'vitest';
import { PRESET_BOTECO } from '@sinuca/regras';
import { LIMITES_PROTOCOLO } from './limites';
import { EMOJIS_DA_SALA, EMOJIS_PADRAO, FAIXAS_DO_GIZ_DA_SALA, MODALIDADES_DE_SALA, MODOS_DE_SALA, modoServeAModalidade } from './tipos';
import { exemplosDeMensagens, suicidioNoMataMata, tacadaCompleta, type Solto } from './para-testes';
import { GRAVACAO_PENDENTE, esquemaCabecalhoDoCliente, validarMensagemDaSala, validarMensagemDoCliente } from './esquemas';

const { cliente, sala } = exemplosDeMensagens();
/** Cópia profunda que preserva os buffers da gravação. */
function clone<T>(x: T): T {
  if (x instanceof Float32Array || x instanceof Uint8Array) return x.slice() as T;
  if (Array.isArray(x)) return x.map(clone) as T;
  if (typeof x === 'object' && x !== null) return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, clone(v)])) as T;
  return x;
}
/** Cópia sem a chave `chave`. */
const sem = (objeto: Solto, chave: string): Solto => Object.fromEntries(Object.entries(clone(objeto)).filter(([k]) => k !== chave));
const doTipo = (tipo: string) => cliente.find((m) => m.tipo === tipo)!;

describe('validação das mensagens do cliente', () => {
  it('aceita um exemplo real de cada tipo e devolve o mesmo conteúdo', () => {
    for (const m of cliente) {
      const r = validarMensagemDoCliente(m);
      expect(r.ok, `${m.tipo}: ${r.ok ? '' : r.erro}`).toBe(true);
      if (r.ok) expect(r.valor).toEqual(m);
    }
  });

  it('cobre todos os tipos da união', () => {
    const tipos = new Set(cliente.map((m) => m.tipo));
    expect([...tipos].sort()).toEqual([
      'chat',
      'configurar-sala',
      'criar-sala',
      'diagnostico',
      'emoji',
      'entrar',
      'escolher-lugar',
      'expulsar',
      'iniciar',
      'mira',
      'nova-partida',
      'ping',
      'tacada',
      'voltar-ao-lobby',
    ]);
  });

  it('recusa o que não é objeto, tipo desconhecido, chave extra e chave faltando', () => {
    for (const ruim of [null, undefined, 5, 'ping', [], { tipo: 'ping' }, { tipo: 'hackear' }, { t: 1 }, { tipo: 5, t: 1 }]) {
      expect(validarMensagemDoCliente(ruim).ok, JSON.stringify(ruim)).toBe(false);
    }
    expect(validarMensagemDoCliente({ tipo: 'ping', t: 1, extra: true }).ok).toBe(false);
    expect(validarMensagemDoCliente(JSON.parse('{"tipo":"ping","t":1,"__proto__":{"x":1}}')).ok).toBe(false);
  });

  it('criar-sala: nome, modo, preset e as regras', () => {
    const base = doTipo('criar-sala') as Extract<(typeof cliente)[number], { tipo: 'criar-sala' }>;
    const ruim = (mudanca: object) => validarMensagemDoCliente({ ...base, ...mudanca }).ok;
    expect(ruim({ nome: '' })).toBe(false);
    expect(ruim({ nome: 'x'.repeat(LIMITES_PROTOCOLO.nome + 1) })).toBe(false);
    expect(ruim({ nome: 'a\nb' })).toBe(false);
    expect(ruim({ modo: '3x3' })).toBe(false);
    for (const modo of ['1x1', '2x1', '2x2']) expect(ruim({ modo }), modo).toBe(true);
    for (const modo of ['1x2', '2X1', '3x1', '', null, 2]) expect(ruim({ modo }), String(modo)).toBe(false);
    expect(ruim({ preset: '' })).toBe(false);
    expect(ruim({ versao: 1.5 })).toBe(false);
    expect(ruim({ regras: 'boteco' })).toBe(false);
    expect(ruim({ regras: { ...PRESET_BOTECO.regras, extra: { a: 1 } } })).toBe(false);
    expect(ruim({ regras: { ...PRESET_BOTECO.regras, bolas: null } })).toBe(false);
    const muitas = Object.fromEntries(Array.from({ length: LIMITES_PROTOCOLO.chaveRegras + 1 }, (_, i) => [`k${i}`, true]));
    expect(ruim({ regras: muitas })).toBe(false);
  });

  it('criar-sala: a linha é opcional; previsao é obrigatória dentro dela, bolaAtingida opcional, tudo booleano e nada a mais', () => {
    const base = cliente.find((m) => m.tipo === 'criar-sala' && m.linha === undefined) as Solto;
    const com = (linha: unknown) => validarMensagemDoCliente({ ...base, linha }).ok;
    expect(validarMensagemDoCliente(base).ok).toBe(true);
    expect(com({ previsao: true })).toBe(true);
    expect(com({ previsao: false })).toBe(true);
    expect(com({ previsao: true, bolaAtingida: true })).toBe(true);
    for (const ruim of [{}, { bolaAtingida: true }, { previsao: 1 }, { previsao: 'sim' }, { previsao: true, bolaAtingida: 'x' }, { previsao: true, extra: 1 }, null, true]) {
      expect(com(ruim), JSON.stringify(ruim)).toBe(false);
    }
  });

  it('voltar-ao-lobby não leva nada; configurar-sala leva só o que muda (modo, relógio e linha parciais)', () => {
    expect(validarMensagemDoCliente({ tipo: 'voltar-ao-lobby' }).ok).toBe(true);
    expect(validarMensagemDoCliente({ tipo: 'voltar-ao-lobby', extra: 1 }).ok).toBe(false);
    const com = (campos: object) => validarMensagemDoCliente({ tipo: 'configurar-sala', ...campos }).ok;
    for (const ok of [{}, { modo: '1x1' }, { modo: '2x1' }, { modo: '2x2' }, { relogio: {} }, { relogio: { tempoS: 15 } }, { relogio: { tempoS: null } }, { relogio: { aoEsgotar: 'falta' } }, { linha: {} }, { linha: { previsao: true } }, { linha: { bolaAtingida: true } }]) {
      expect(com(ok), JSON.stringify(ok)).toBe(true);
    }
    for (const ruim of [{ modo: '3x3' }, { modo: '1x2' }, { modo: null }, { relogio: { tempoS: 20 } }, { relogio: null }, { relogio: { extra: 1 } }, { linha: { previsao: 'sim' } }, { linha: { extra: 1 } }, { linha: null }, { extra: 1 }]) {
      expect(com(ruim), JSON.stringify(ruim)).toBe(false);
    }
  });

  it('criar-sala: a modalidade é opcional (padrão par ou ímpar) e o modo precisa estar no catálogo dela', () => {
    const base = cliente.find((m) => m.tipo === 'criar-sala' && m.modalidade === undefined && m.modo === '1x1') as Solto;
    const com = (mudanca: object) => validarMensagemDoCliente({ ...base, ...mudanca }).ok;
    expect(validarMensagemDoCliente(base).ok).toBe(true);
    for (const modalidade of ['festa', '', null, 1, 'Mata-mata', 'mata_mata']) expect(com({ modalidade }), String(modalidade)).toBe(false);
    // sem modalidade vale a padrão: os modos do mata-mata que o par ou ímpar não tem são recusados
    for (const modo of MODOS_DE_SALA) expect(com({ modo }), `sem modalidade, ${modo}`).toBe(modoServeAModalidade('par-ou-impar', modo));
    // com modalidade, toda combinação do catálogo passa e só ela
    for (const modalidade of MODALIDADES_DE_SALA) {
      for (const modo of MODOS_DE_SALA) expect(com({ modalidade, modo }), `${modalidade} em ${modo}`).toBe(modoServeAModalidade(modalidade, modo));
    }
    expect(com({ modalidade: 'mata-mata', modo: '2x2' })).toBe(false);
    expect(com({ modalidade: 'mata-mata', modo: '2x1' })).toBe(false);
    expect(com({ modalidade: 'par-ou-impar', modo: '1x1x1' })).toBe(false);
    expect(com({ modalidade: 'mata-mata', modo: '1x1x1x1' })).toBe(true);
    // o motivo diz qual é a combinação
    const r = validarMensagemDoCliente({ ...base, modalidade: 'mata-mata', modo: '2x2' });
    expect(!r.ok && r.erro).toMatch(/mata-mata não joga em 2x2 \(aceita 1x1, 1x1x1, 1x1x1x1\)/);
  });

  it('criar-sala: o giz é opcional e parcial; cada número na faixa, o mínimo do desgaste não passa do máximo, nada a mais', () => {
    const base = cliente.find((m) => m.tipo === 'criar-sala' && m.giz === undefined) as Solto;
    const com = (giz: unknown) => validarMensagemDoCliente({ ...base, giz }).ok;
    const f = FAIXAS_DO_GIZ_DA_SALA;
    expect(validarMensagemDoCliente(base).ok).toBe(true);
    for (const ok of [{}, { desgasteMin: 0.1 }, { desgasteMax: 0.3 }, { passada: 0.1 }, { passadaS: 3 }, { desgasteMin: 0.1, desgasteMax: 0.3, passada: 0.1, passadaS: 3 }]) expect(com(ok), JSON.stringify(ok)).toBe(true);
    // as pontas das faixas valem
    expect(com({ desgasteMin: f.desgaste.min, desgasteMax: f.desgaste.max, passada: f.passada.min, passadaS: f.passadaS.min })).toBe(true);
    expect(com({ passada: f.passada.max, passadaS: f.passadaS.max })).toBe(true);
    expect(com({ desgasteMin: 0.2, desgasteMax: 0.2 })).toBe(true);
    // fora da faixa
    for (const ruim of [
      { desgasteMin: -0.01 }, { desgasteMin: 0.51 }, { desgasteMax: -0.01 }, { desgasteMax: 0.51 }, { desgasteMax: 1 },
      { passada: 0.04 }, { passada: 0.51 }, { passada: 0 }, { passadaS: 0.49 }, { passadaS: 6.01 }, { passadaS: 0 },
      { desgasteMin: '0.1' }, { desgasteMin: Number.NaN }, { passada: Number.POSITIVE_INFINITY }, { passadaS: null },
    ]) {
      expect(com(ruim), JSON.stringify(ruim)).toBe(false);
    }
    // o mínimo passa do máximo (só dá para ver quando o pedido traz os dois; a sala confere o resto)
    expect(com({ desgasteMin: 0.31, desgasteMax: 0.3 })).toBe(false);
    expect(com({ desgasteMin: 0.5, desgasteMax: 0 })).toBe(false);
    // forma
    for (const ruim of [null, 3, 'giz', [], { extra: 1 }, { desgasteMin: 0.1, extra: 1 }]) expect(com(ruim), JSON.stringify(ruim)).toBe(false);
  });

  it('criar-sala: a força é opcional e só empurrar ou linha', () => {
    const base = cliente.find((m) => m.tipo === 'criar-sala' && m.forca === undefined) as Solto;
    const com = (forca: unknown) => validarMensagemDoCliente({ ...base, forca }).ok;
    expect(validarMensagemDoCliente(base).ok).toBe(true);
    expect(com('empurrar')).toBe(true);
    expect(com('linha')).toBe(true);
    for (const ruim of ['', 'Linha', 'barra', null, 1, true, {}]) expect(com(ruim), JSON.stringify(ruim)).toBe(false);
  });

  it('configurar-sala: modalidade, giz parcial e força; modalidade e modo juntos precisam combinar', () => {
    const com = (campos: object) => validarMensagemDoCliente({ tipo: 'configurar-sala', ...campos }).ok;
    for (const ok of [
      { modalidade: 'mata-mata' }, { modalidade: 'par-ou-impar' }, { forca: 'linha' }, { forca: 'empurrar' }, { giz: {} }, { giz: { passadaS: 6 } },
      { modalidade: 'mata-mata', modo: '1x1' }, { modalidade: 'mata-mata', modo: '1x1x1' }, { modalidade: 'mata-mata', modo: '1x1x1x1' },
      { modalidade: 'par-ou-impar', modo: '2x1' }, { modalidade: 'par-ou-impar', modo: '2x2' }, { modo: '1x1x1' }, { modo: '1x1x1x1' },
    ]) {
      expect(com(ok), JSON.stringify(ok)).toBe(true);
    }
    for (const ruim of [
      { modalidade: 'mata-mata', modo: '2x1' }, { modalidade: 'mata-mata', modo: '2x2' }, { modalidade: 'par-ou-impar', modo: '1x1x1' }, { modalidade: 'par-ou-impar', modo: '1x1x1x1' },
      { modalidade: 'festa' }, { modalidade: null }, { forca: 'barra' }, { forca: null }, { giz: null }, { giz: { extra: 1 } },
      { giz: { desgasteMin: 0.5, desgasteMax: 0.1 } }, { giz: { desgasteMax: 0.51 } }, { giz: { passada: 0.04 } }, { giz: { passadaS: 7 } },
    ]) {
      expect(com(ruim), JSON.stringify(ruim)).toBe(false);
    }
    // sozinho, o modo só precisa ser um modo conhecido: a sala o confere contra a modalidade que tem
    expect(com({ modo: '2x1' })).toBe(true);
    expect(com({ modo: '3x3' })).toBe(false);
  });

  it('criar-sala: o relógio é opcional; tempo de 15, 30, 45, 60 s ou null (sem limite), e a consequência só os dois valores do contrato', () => {
    const base = cliente.find((m) => m.tipo === 'criar-sala' && m.relogio === undefined) as Solto;
    const com = (relogio: unknown) => validarMensagemDoCliente({ ...base, relogio }).ok;
    expect(validarMensagemDoCliente(base).ok).toBe(true);
    for (const tempoS of [15, 30, 45, 60, null]) expect(com({ tempoS }), String(tempoS)).toBe(true);
    expect(com({})).toBe(true);
    expect(com({ aoEsgotar: 'falta' })).toBe(true);
    expect(com({ tempoS: 30, aoEsgotar: 'perde-a-vez' })).toBe(true);
    for (const tempoS of [0, 10, 20, 61, 90, 30.5, '30', -30, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(com({ tempoS }), String(tempoS)).toBe(false);
    }
    expect(com({ tempoS: 30, aoEsgotar: 'expulsa' })).toBe(false);
    expect(com({ tempoS: 30, aoEsgotar: null })).toBe(false);
    expect(com({ tempoS: 30, extra: 1 })).toBe(false);
    expect(com(30)).toBe(false);
    expect(com(null)).toBe(false);
    expect(com([])).toBe(false);
  });

  it('diagnostico: números nas faixas, textos curtos e sem controle, memória opcional', () => {
    const base = cliente.find((m) => m.tipo === 'diagnostico') as Solto;
    const com = (mudanca: object) => validarMensagemDoCliente({ ...clone(base), ...mudanca }).ok;
    expect(com({})).toBe(true);
    expect(com({ fpsMedio: 0, piorQuadroMs: 0, memoriaMb: 0 })).toBe(true);
    expect(com({ fpsMedio: 1000, piorQuadroMs: 600_000 })).toBe(true);
    for (const mudanca of [{ fpsMedio: -1 }, { fpsMedio: 1001 }, { fpsMedio: Number.NaN }, { fpsMedio: '60' }, { piorQuadroMs: -0.1 }, { piorQuadroMs: 600_001 }, { piorQuadroMs: Number.POSITIVE_INFINITY }]) {
      expect(com(mudanca), JSON.stringify(mudanca)).toBe(false);
    }
    expect(com({ qualidade: '' })).toBe(false);
    expect(com({ qualidade: 'x'.repeat(25) })).toBe(false);
    expect(com({ qualidade: 'x'.repeat(24) })).toBe(true);
    expect(com({ gpu: 'g'.repeat(121) })).toBe(false);
    expect(com({ gpu: 'g'.repeat(120) })).toBe(true);
    expect(com({ gpu: 'linha\nfalsa evento=x' })).toBe(false);
    expect(com({ gpu: 'com\u0000nulo' })).toBe(false);
    expect(com({ gpu: 5 })).toBe(false);
    expect(com({ memoriaMb: -1 })).toBe(false);
    expect(com({ memoriaMb: 2_000_000 })).toBe(false);
    expect(com({ memoriaMb: Number.NaN })).toBe(false);
    expect(com({ memoriaMb: null })).toBe(false);
    expect(com({ extra: 1 })).toBe(false);
    expect(validarMensagemDoCliente(sem(base, 'fpsMedio')).ok).toBe(false);
    expect(validarMensagemDoCliente(sem(base, 'memoriaMb')).ok).toBe(true);
  });

  it('entrar: código só com o alfabeto sem ambíguos, tamanho exato; token opaco opcional', () => {
    const base = { tipo: 'entrar', versao: 1, codigo: 'K7M2P', nome: 'Ana' };
    expect(validarMensagemDoCliente(base).ok).toBe(true);
    for (const codigo of ['k7m2p', 'K7M2', 'K7M2PP', 'K70M2', 'KIM2P', 'KLM2P', 'KOM2P', 'K7M-P', '']) {
      expect(validarMensagemDoCliente({ ...base, codigo }).ok, codigo).toBe(false);
    }
    expect(validarMensagemDoCliente({ ...base, token: 'curto' }).ok).toBe(false);
    expect(validarMensagemDoCliente({ ...base, token: 'a'.repeat(LIMITES_PROTOCOLO.token + 1) }).ok).toBe(false);
    expect(validarMensagemDoCliente({ ...base, token: 'ab cd'.repeat(5) }).ok).toBe(false);
  });

  it('escolher-lugar: 0 a 3 ou null', () => {
    for (const lugar of [0, 1, 2, 3, null]) expect(validarMensagemDoCliente({ tipo: 'escolher-lugar', lugar }).ok).toBe(true);
    for (const lugar of [-1, 4, 1.5, '1', undefined, Number.NaN]) expect(validarMensagemDoCliente({ tipo: 'escolher-lugar', lugar }).ok, String(lugar)).toBe(false);
  });

  it('expulsar: só o lugar, inteiro de 0 a 3, e nada a mais', () => {
    for (const lugar of [0, 1, 2, 3]) expect(validarMensagemDoCliente({ tipo: 'expulsar', lugar }).ok, String(lugar)).toBe(true);
    for (const lugar of [-1, 4, 1.5, '1', null, undefined, Number.NaN, [1]]) expect(validarMensagemDoCliente({ tipo: 'expulsar', lugar }).ok, String(lugar)).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'expulsar' }).ok).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'expulsar', lugar: 1, nome: 'Beto' }).ok).toBe(false);
  });

  it('mira: números finitos nas faixas', () => {
    const base = { tipo: 'mira', angulo: 1, lateral: 0, vertical: 0, recuo: 0.1 };
    expect(validarMensagemDoCliente(base).ok).toBe(true);
    for (const mudanca of [{ angulo: Number.POSITIVE_INFINITY }, { angulo: 1000 }, { lateral: 1.5 }, { vertical: -1.1 }, { recuo: -0.1 }, { recuo: 5 }]) {
      expect(validarMensagemDoCliente({ ...base, ...mudanca }).ok, JSON.stringify(mudanca)).toBe(false);
    }
  });

  it('mira: giz é opcional e só vale true', () => {
    const base = { tipo: 'mira', angulo: 1, lateral: 0, vertical: 0, recuo: 0.1 };
    const comGiz = validarMensagemDoCliente({ ...base, giz: true });
    expect(comGiz.ok).toBe(true);
    if (comGiz.ok) expect(comGiz.valor).toEqual({ ...base, giz: true });
    const semGiz = validarMensagemDoCliente(base);
    expect(semGiz.ok).toBe(true);
    if (semGiz.ok) expect(Object.hasOwn(semGiz.valor, 'giz')).toBe(false);
    for (const giz of [false, 0, 1, 'true', null, undefined, {}, [true]]) {
      expect(validarMensagemDoCliente({ ...base, giz }).ok, JSON.stringify(giz)).toBe(false);
    }
  });

  it('mira-retransmitida: giz é opcional e só vale true', () => {
    const base = { tipo: 'mira-retransmitida', lugar: 1, angulo: 0.5, lateral: 0, vertical: 0, recuo: 0.1 };
    const comGiz = validarMensagemDaSala({ ...base, giz: true });
    expect(comGiz.ok).toBe(true);
    if (comGiz.ok) expect(comGiz.valor).toEqual({ ...base, giz: true });
    const semGiz = validarMensagemDaSala(base);
    expect(semGiz.ok).toBe(true);
    if (semGiz.ok) expect(Object.hasOwn(semGiz.valor, 'giz')).toBe(false);
    for (const giz of [false, 0, 1, 'true', null, undefined, {}, [true]]) {
      expect(validarMensagemDaSala({ ...base, giz }).ok, JSON.stringify(giz)).toBe(false);
    }
  });

  it('chat: de 1 a 140 caracteres, sem controle', () => {
    expect(validarMensagemDoCliente({ tipo: 'chat', texto: 'oi' }).ok).toBe(true);
    expect(validarMensagemDoCliente({ tipo: 'chat', texto: '😀'.repeat(LIMITES_PROTOCOLO.chat) }).ok).toBe(true);
    expect(validarMensagemDoCliente({ tipo: 'chat', texto: 'x'.repeat(LIMITES_PROTOCOLO.chat + 1) }).ok).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'chat', texto: '' }).ok).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'chat', texto: 'a\u0007b' }).ok).toBe(false);
  });

  it('o catálogo tem 40 emojis, na ordem combinada, sem repetição e cada um com um ponto de código só', () => {
    expect(EMOJIS_DA_SALA).toEqual([
      '😂', '👏', '🔥', '😱', '😤', '🤡', '🍺', '🎱',
      '🤣', '😅', '😎', '🤔', '😏', '😬', '🙄', '😴', '😭', '😡', '🤯', '🥶', '🤠', '😈',
      '👍', '👎', '🙏', '💪', '👀', '💯', '🍻', '🎯', '🏆', '💀', '👑', '🐐', '🍀', '🦆', '🧂', '🐢', '🎉', '💩',
    ]);
    expect(EMOJIS_DA_SALA).toHaveLength(40);
    expect(new Set(EMOJIS_DA_SALA).size).toBe(40);
    for (const emoji of EMOJIS_DA_SALA) {
      const pontos = [...emoji].map((c) => c.codePointAt(0)!);
      expect(pontos, emoji).toHaveLength(1);
      expect(pontos[0], emoji).not.toBe(0xfe0f); // seletor de apresentação
      expect(pontos[0], emoji).not.toBe(0x200d); // junção de largura zero
      expect(pontos[0]! >= 0x1f3fb && pontos[0]! <= 0x1f3ff, `${emoji} é modificador de pele`).toBe(false);
      expect(emoji, emoji).toMatch(/^\p{Extended_Pictographic}$/u);
    }
  });

  it('os padrões das teclas 1 a 8 são os 8 primeiros do catálogo, na mesma ordem', () => {
    expect(EMOJIS_PADRAO).toEqual(['😂', '👏', '🔥', '😱', '😤', '🤡', '🍺', '🎱']);
    expect(EMOJIS_PADRAO).toHaveLength(8);
    expect(EMOJIS_PADRAO).toEqual(EMOJIS_DA_SALA.slice(0, 8));
  });

  it('emoji: aceita cada um dos 40 do catálogo, o do fim também; qualquer outro texto é recusado', () => {
    for (const emoji of EMOJIS_DA_SALA) expect(validarMensagemDoCliente({ tipo: 'emoji', emoji }), emoji).toEqual({ ok: true, valor: { tipo: 'emoji', emoji } });
    expect(validarMensagemDoCliente({ tipo: 'emoji', emoji: '💩' })).toEqual({ ok: true, valor: { tipo: 'emoji', emoji: '💩' } });
    const ruins: unknown[] = [
      '😀', // outro emoji
      '🍷', // quase do catálogo, mas fora
      '❤',
      '❤\uFE0F',
      'oi',
      '',
      ' ',
      '😂😂',
      '😂 ',
      ' 😂',
      '😂\uFE0F', // com seletor de apresentação
      '👏🏽', // com modificador de pele
      '👏\u{1F3FB}',
      '👍🏽', // modificador de pele em emoji novo do catálogo
      '💪\u{1F3FF}',
      '🙏\uFE0F',
      '👀\uFE0F',
      '💩💩',
      '🐐 ',
      '🔥\u200D', // com junção de largura zero
      '\u{1F602}\u0007',
      '1',
      null,
      undefined,
      0,
      1,
      true,
      ['😂'],
      { emoji: '😂' },
    ];
    for (const emoji of ruins) expect(validarMensagemDoCliente({ tipo: 'emoji', emoji }).ok, JSON.stringify(emoji)).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'emoji' }).ok).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'emoji', emoji: '😂', extra: 1 }).ok).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'emoji', emoji: '😂', texto: 'oi' }).ok).toBe(false);
    expect(validarMensagemDaSala({ tipo: 'emoji', emoji: '😂' }).ok).toBe(false);
  });

  it('emoji-retransmitido: lugar de 0 a 3 ou nulo, nome e emoji da lista', () => {
    const base = { tipo: 'emoji-retransmitido', lugar: 1, nome: 'Ana', emoji: '🔥' };
    expect(validarMensagemDaSala(base).ok).toBe(true);
    expect(validarMensagemDaSala({ ...base, lugar: null }).ok).toBe(true);
    expect(validarMensagemDaSala({ ...base, emoji: '💩' }).ok).toBe(true);
    for (const ruim of [{ lugar: 4 }, { lugar: -1 }, { lugar: 1.5 }, { lugar: undefined }, { nome: '' }, { nome: 'x'.repeat(LIMITES_PROTOCOLO.nome + 1) }, { emoji: '😀' }, { emoji: '🍷' }, { emoji: 'oi' }, { emoji: '' }, { emoji: '👏🏽' }, { extra: 1 }]) {
      expect(validarMensagemDaSala({ ...base, ...ruim }).ok, JSON.stringify(ruim)).toBe(false);
    }
    expect(validarMensagemDaSala(sem(base, 'emoji')).ok).toBe(false);
    expect(validarMensagemDaSala(sem(base, 'nome')).ok).toBe(false);
    expect(validarMensagemDoCliente(base).ok).toBe(false);
  });

  it('limites do emoji: rajada de 3 e 1 por segundo', () => {
    expect(LIMITES_PROTOCOLO.emojiRajada).toBe(3);
    expect(LIMITES_PROTOCOLO.emojiPorSegundo).toBe(1);
  });

  it('ping.t é relativo ao início da conexão: relógio de parede (Date.now) é recusado, o teto é 1e12', () => {
    expect(validarMensagemDoCliente({ tipo: 'ping', t: Date.now() }).ok).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'ping', t: 1.8e12 }).ok).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'ping', t: 1e12 + 1 }).ok).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'ping', t: -1e12 - 1 }).ok).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'ping', t: 1e12 }).ok).toBe(true);
    expect(validarMensagemDoCliente({ tipo: 'ping', t: 0 }).ok).toBe(true);
    expect(validarMensagemDoCliente({ tipo: 'ping', t: 5432.1 }).ok).toBe(true);
    expect(validarMensagemDaSala({ tipo: 'pong', t: Date.now() }).ok).toBe(false);
    expect(validarMensagemDaSala({ tipo: 'pong', t: 5432.1 }).ok).toBe(true);
  });

  it('ping: t finito', () => {
    expect(validarMensagemDoCliente({ tipo: 'ping', t: Number.NaN }).ok).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'ping', t: '1' }).ok).toBe(false);
  });

  describe('tacada', () => {
    const base = doTipo('tacada') as Extract<(typeof cliente)[number], { tipo: 'tacada' }>;
    const com = (mexe: (m: Solto) => void) => {
      const m = clone(base) as Solto;
      mexe(m);
      return validarMensagemDoCliente(m).ok;
    };

    it('recusa seq inválido e parâmetros fora da faixa', () => {
      expect(com((m) => (m.seq = -1))).toBe(false);
      expect(com((m) => (m.seq = 1.5))).toBe(false);
      expect(com((m) => (m.parametros.velocidadeTaco = -1))).toBe(false);
      expect(com((m) => (m.parametros.velocidadeTaco = LIMITES_PROTOCOLO.velocidadeTaco + 1))).toBe(false);
      expect(com((m) => (m.parametros.efeito.lateral = 2))).toBe(false);
      expect(com((m) => (m.parametros.giz = 1.5))).toBe(false);
      expect(com((m) => (m.parametros.elevacao = 4))).toBe(false);
      expect(com((m) => (m.parametros.angulo = Number.NaN))).toBe(false);
    });

    it('recusa gravação que não é uma Gravacao (JSON no lugar dos buffers, tamanhos errados)', () => {
      expect(com((m) => (m.gravacao = { ...m.gravacao, posicoes: [1, 2, 3] }))).toBe(false);
      expect(com((m) => (m.gravacao = { ...m.gravacao, naMesa: new Uint8Array(3) }))).toBe(false);
      expect(com((m) => (m.gravacao = null))).toBe(false);
    });

    it('aceita vezDaRoda (duplas) como inteiro de 0 a 3 e recusa o resto', () => {
      expect(com((m) => (m.partida.vezDaRoda = 2))).toBe(true);
      expect(com((m) => (m.partida.vezDaRoda = 4))).toBe(false);
      expect(com((m) => (m.partida.vezDaRoda = -1))).toBe(false);
      expect(com((m) => (m.partida.vezDaRoda = 0.5))).toBe(false);
      expect(com((m) => (m.partida.vezDaRoda = null))).toBe(false);
    });

    it('aceita proximoDaRoda (2×1) como inteiro de 0 a 3, sozinho ou com vezDaRoda, e recusa o resto', () => {
      expect(com((m) => (m.partida.proximoDaRoda = 2))).toBe(true);
      expect(com((m) => (m.partida.proximoDaRoda = 0))).toBe(true);
      expect(com((m) => ((m.partida.proximoDaRoda = 1), (m.partida.vezDaRoda = 2)))).toBe(true);
      expect(com((m) => (m.partida.proximoDaRoda = 4))).toBe(false);
      expect(com((m) => (m.partida.proximoDaRoda = -1))).toBe(false);
      expect(com((m) => (m.partida.proximoDaRoda = 0.5))).toBe(false);
      expect(com((m) => (m.partida.proximoDaRoda = null))).toBe(false);
      expect(com((m) => (m.partida.proximoDaRoda = '1'))).toBe(false);
    });

    describe('perdemAProximaVez (mata-mata, L19)', () => {
      const jogadoresDe = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `lugar-${i}`, nome: `J${i}`, equipe: i }));
      /** Partida de `n` jogadores (uma equipe cada) com `perdem` na lista; sem `perdem` o campo nem existe. */
      const comLista = (n: number, perdem?: unknown) =>
        com((m) => {
          m.partida.jogadores = jogadoresDe(n);
          m.partida.grupos = Array.from({ length: n }, () => null);
          if (perdem !== undefined) m.partida.perdemAProximaVez = perdem;
        });

      it('aceita a lista crescente de índices de jogadores, de 1 a jogadores - 1 entradas', () => {
        const aceitas: [number, number[]][] = [
          [2, [0]],
          [2, [1]],
          [3, [0]],
          [3, [2]],
          [3, [0, 1]],
          [3, [0, 2]],
          [3, [1, 2]],
          [4, [3]],
          [4, [0, 3]],
          [4, [0, 1, 2]],
          [4, [1, 2, 3]],
        ];
        for (const [n, perdem] of aceitas) expect(comLista(n, perdem), `${n} jogadores, ${JSON.stringify(perdem)}`).toBe(true);
      });

      it('o campo é opcional: ausente passa, e a partida de antes (sem o campo) continua válida', () => {
        expect(comLista(3)).toBe(true);
        expect(doTipo('tacada')).not.toHaveProperty('partida.perdemAProximaVez');
        expect(com(() => undefined)).toBe(true);
      });

      it('recusa índice repetido', () => {
        expect(comLista(3, [1, 1])).toBe(false);
        expect(comLista(4, [0, 2, 2])).toBe(false);
        expect(comLista(4, [0, 0, 1])).toBe(false);
      });

      it('recusa fora de ordem', () => {
        expect(comLista(3, [2, 1])).toBe(false);
        expect(comLista(3, [1, 0])).toBe(false);
        expect(comLista(4, [0, 3, 1])).toBe(false);
        expect(comLista(4, [3, 2, 1])).toBe(false);
      });

      it('recusa índice fora da faixa: negativo, não inteiro, acima de 3 ou que não existe nesta partida', () => {
        expect(comLista(4, [-1])).toBe(false);
        expect(comLista(4, [0.5])).toBe(false);
        expect(comLista(4, [4])).toBe(false);
        expect(comLista(4, [0, 4])).toBe(false);
        expect(comLista(2, [2]), 'a partida só tem os jogadores 0 e 1').toBe(false);
        expect(comLista(3, [3]), 'a partida só tem os jogadores 0 a 2').toBe(false);
        expect(comLista(3, [1, 3])).toBe(false);
        expect(comLista(2, [0, 2])).toBe(false);
      });

      it('recusa lista vazia (ninguém perde = o campo ausente) e lista com todos (a roda sempre para em alguém)', () => {
        expect(comLista(3, [])).toBe(false);
        expect(comLista(2, [0, 1])).toBe(false);
        expect(comLista(3, [0, 1, 2])).toBe(false);
        expect(comLista(4, [0, 1, 2, 3])).toBe(false);
        expect(comLista(4, [0, 1, 2, 3, 4])).toBe(false);
      });

      it('recusa o que não é lista de números: null, texto, número solto, objeto, itens de outro tipo', () => {
        for (const ruim of [null, '1', 1, { 0: 1 }, ['1'], [null], [true], [Number.NaN], [Number.POSITIVE_INFINITY]]) {
          expect(comLista(3, ruim), JSON.stringify(ruim)).toBe(false);
        }
      });

      it('o erro diz qual é o problema e onde', () => {
        const erro = (perdem: unknown, n = 3): string => {
          const m = clone(doTipo('tacada')) as Solto;
          m.partida.jogadores = jogadoresDe(n);
          m.partida.grupos = Array.from({ length: n }, () => null);
          m.partida.perdemAProximaVez = perdem;
          const r = validarMensagemDoCliente(m);
          return r.ok ? '' : r.erro;
        };
        expect(erro([1, 1])).toBe('$.partida.perdemAProximaVez[1]: precisa vir em ordem crescente, sem repetição');
        expect(erro([2, 1])).toBe('$.partida.perdemAProximaVez[1]: precisa vir em ordem crescente, sem repetição');
        expect(erro([3])).toBe('$.partida.perdemAProximaVez[0]: não é um jogador (a partida tem 3)');
        expect(erro([0, 4], 4), 'o índice 4 nem chega a ser comparado com os jogadores').toBe('$.partida.perdemAProximaVez[1]: maior que 3');
        expect(erro([-1], 4)).toBe('$.partida.perdemAProximaVez[0]: menor que 0');
        expect(erro([0.5], 4)).toBe('$.partida.perdemAProximaVez[0]: precisa ser inteiro');
        expect(erro([0, 1, 2])).toBe('$.partida.perdemAProximaVez: mais de 2 itens');
        expect(erro([])).toBe('$.partida.perdemAProximaVez: menos de 1 itens');
      });

      it('a tacada real que derruba a branca no mata-mata passa, e o campo volta idêntico', () => {
        const real = cliente.filter((m) => m.tipo === 'tacada').find((m) => m.partida.perdemAProximaVez !== undefined)!;
        expect(real.partida.perdemAProximaVez).toEqual([0]);
        const r = validarMensagemDoCliente(real);
        expect(r.ok).toBe(true);
        if (r.ok && r.valor.tipo === 'tacada') expect(r.valor.partida.perdemAProximaVez).toEqual([0]);
      });
    });

    it('aceita uma partida de 3 jogadores (2×1: equipes 0, 1, 0) e recusa 5 ou 1', () => {
      const tres = (m: Solto) => (m.partida.jogadores = [...m.partida.jogadores, { id: 'lugar-2', nome: 'Cida', equipe: 0 }]);
      expect(com(tres)).toBe(true);
      expect(com((m) => ((m.partida.vez = 2), tres(m)))).toBe(true);
      expect(com((m) => m.partida.jogadores.push({ id: 'x1', nome: 'x', equipe: 0 }, { id: 'x2', nome: 'x', equipe: 1 }, { id: 'x3', nome: 'x', equipe: 0 }))).toBe(false);
      expect(com((m) => (m.partida.jogadores = m.partida.jogadores.slice(0, 1)))).toBe(false);
    });

    it('aceita uma partida de mata-mata: 3 e 4 jogadores, uma equipe cada, grupos nulos e o vencedor de 0 a 3', () => {
      const jogadores = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `lugar-${i}`, nome: `J${i}`, equipe: i }));
      const matamata = (n: number) => (m: Solto) => {
        m.partida.jogadores = jogadores(n);
        m.partida.grupos = Array.from({ length: n }, () => null);
      };
      for (const n of [2, 3, 4]) expect(com(matamata(n)), `${n} jogadores`).toBe(true);
      expect(com((m) => (matamata(4)(m), (m.partida.vencedor = 3)))).toBe(true);
      expect(com((m) => (matamata(4)(m), (m.partida.vez = 3)))).toBe(true);
      expect(com((m) => (matamata(4)(m), (m.partida.vencedor = 4)))).toBe(false);
      expect(com((m) => (matamata(4)(m), (m.partida.jogadores[3].equipe = 4)))).toBe(false);
      expect(com((m) => (matamata(4)(m), (m.partida.grupos = [null, null, null, null, null])))).toBe(false);
      expect(com((m) => (matamata(4)(m), (m.partida.grupos = [null])))).toBe(false);
    });

    it('recusa partida malformada', () => {
      expect(com((m) => m.partida.jogadores.push(...m.partida.jogadores, ...m.partida.jogadores))).toBe(false);
      expect(com((m) => (m.partida.vez = 4))).toBe(false);
      expect(com((m) => (m.partida.naMesa = [0, 1, 99]))).toBe(false);
      expect(com((m) => (m.partida.vencedor = 4))).toBe(false);
      expect(com((m) => (m.partida.vencedor = 1.5))).toBe(false);
      expect(com((m) => (m.partida.grupos = ['par']))).toBe(false);
      expect(com((m) => (m.partida.grupos = [null, null, null, null, null]))).toBe(false);
      expect(com((m) => delete m.partida.fase)).toBe(false);
      expect(com((m) => (m.partida.config = null))).toBe(false);
    });

    it('recusa mesa malformada: bola repetida, id fora da faixa, número não finito, bolas demais', () => {
      expect(com((m) => (m.mesa.bolas[1].id = m.mesa.bolas[0].id))).toBe(false);
      expect(com((m) => (m.mesa.bolas[1].id = 16))).toBe(false);
      expect(com((m) => (m.mesa.bolas[1].posicao.x = Number.POSITIVE_INFINITY))).toBe(false);
      expect(com((m) => (m.mesa.bolas[1].posicao.x = 1000))).toBe(false);
      expect(com((m) => (m.mesa.bolas[1].movimento = 'voando'))).toBe(false);
      expect(com((m) => (m.mesa.bolas = [...m.mesa.bolas, ...m.mesa.bolas]))).toBe(false);
      expect(com((m) => (m.mesa.bolas = []))).toBe(false);
    });
  });
});

describe('etapa 1 do fio: o esquema de cabeçalho só aceita o marcador no lugar da gravação', () => {
  const tacada = () => ({ ...(clone(doTipo('tacada')) as Solto) });

  it('com o marcador passa; com qualquer outra coisa no lugar da gravação, não', () => {
    expect(() => esquemaCabecalhoDoCliente({ ...tacada(), gravacao: GRAVACAO_PENDENTE }, '$')).not.toThrow();
    for (const outra of [{ falsa: 1 }, null, 'x', {}, tacada().gravacao]) {
      expect(() => esquemaCabecalhoDoCliente({ ...tacada(), gravacao: outra }, '$'), JSON.stringify(outra)).toThrow();
    }
  });

  it('o esquema completo continua exigindo a gravação de verdade, não o marcador', () => {
    expect(validarMensagemDoCliente({ ...tacada(), gravacao: GRAVACAO_PENDENTE }).ok).toBe(false);
  });
});

describe('validação das mensagens da sala', () => {
  it('aceita um exemplo real de cada tipo e devolve o mesmo conteúdo', () => {
    for (const m of sala) {
      const r = validarMensagemDaSala(m);
      expect(r.ok, `${m.tipo}: ${r.ok ? '' : r.erro}`).toBe(true);
      if (r.ok) expect(r.valor).toEqual(m);
    }
  });

  it('cobre todos os tipos da união', () => {
    const tipos = new Set(sala.map((m) => m.tipo));
    expect([...tipos].sort()).toEqual(['aposta-paga', 'boas-vindas', 'chat-retransmitido', 'emoji-retransmitido', 'erro', 'estado-sala', 'expulso', 'mira-retransmitida', 'missoes', 'pong', 'retrato', 'tacada-retransmitida', 'tempo-esgotado']);
  });

  it('recusa tipos do cliente e vice-versa', () => {
    expect(validarMensagemDaSala({ tipo: 'ping', t: 1 }).ok).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'pong', t: 1 }).ok).toBe(false);
  });

  it('estado-sala: exatamente 4 lugares e fase conhecida', () => {
    const base = sala.find((m) => m.tipo === 'estado-sala') as Solto;
    const ruim = (mudanca: object) => validarMensagemDaSala({ ...clone(base), ...mudanca }).ok;
    expect(ruim({ lugares: base.lugares.slice(0, 3) })).toBe(false);
    expect(ruim({ fase: 'dormindo' })).toBe(false);
    expect(ruim({ vez: 7 })).toBe(false);
    expect(ruim({ espectadores: -1 })).toBe(false);
  });

  it('estado-sala: os cinco modos; qualquer outro é recusado', () => {
    const base = sala.find((m) => m.tipo === 'estado-sala') as Solto;
    const com = (modo: unknown) => validarMensagemDaSala({ ...clone(base), modo }).ok;
    for (const modo of ['1x1', '2x1', '2x2', '1x1x1', '1x1x1x1']) expect(com(modo), modo).toBe(true);
    for (const modo of ['1x2', '3x3', '1x1x1x1x1', '', null]) expect(com(modo), String(modo)).toBe(false);
  });

  it('estado-sala: modalidade, giz e força são opcionais; giz vem completo e dentro das faixas', () => {
    const base = sala.find((m) => m.tipo === 'estado-sala' && m.modalidade === undefined && m.giz === undefined && m.forca === undefined) as Solto;
    const com = (campos: object) => validarMensagemDaSala({ ...clone(base), ...campos }).ok;
    expect(validarMensagemDaSala(base).ok).toBe(true);
    expect(com({ modalidade: 'mata-mata' })).toBe(true);
    expect(com({ modalidade: 'par-ou-impar' })).toBe(true);
    for (const modalidade of ['festa', '', null, 3]) expect(com({ modalidade }), String(modalidade)).toBe(false);
    expect(com({ forca: 'linha' })).toBe(true);
    expect(com({ forca: 'empurrar' })).toBe(true);
    for (const forca of ['barra', '', null]) expect(com({ forca }), String(forca)).toBe(false);
    const giz = { desgasteMin: 0.1, desgasteMax: 0.3, passada: 0.1, passadaS: 3 };
    expect(com({ giz })).toBe(true);
    expect(com({ giz: { ...giz, desgasteMin: 0.3 } })).toBe(true);
    for (const chave of Object.keys(giz)) expect(com({ giz: Object.fromEntries(Object.entries(giz).filter(([k]) => k !== chave)) }), `sem ${chave}`).toBe(false);
    for (const ruim of [{ desgasteMin: 0.31 }, { desgasteMax: 0.09 }, { desgasteMin: -0.1 }, { desgasteMax: 0.6 }, { passada: 0.01 }, { passada: 0.6 }, { passadaS: 0.1 }, { passadaS: 7 }, { extra: 1 }]) {
      expect(com({ giz: { ...giz, ...ruim } }), JSON.stringify(ruim)).toBe(false);
    }
    expect(com({ giz: null })).toBe(false);
  });

  it('estado-sala: a equipe do lugar vai de 0 a 3 (mata-mata), não além', () => {
    const base = sala.find((m) => m.tipo === 'estado-sala' && m.modo === '1x1x1x1') as Solto;
    expect(base.lugares.map((l: { equipe: number }) => l.equipe)).toEqual([0, 1, 2, 3]);
    expect(validarMensagemDaSala(base).ok).toBe(true);
    const com = (equipe: unknown) => validarMensagemDaSala({ ...clone(base), lugares: base.lugares.map((l: Solto, i: number) => (i === 3 ? { ...l, equipe } : l)) }).ok;
    expect(com(3)).toBe(true);
    for (const ruim of [4, -1, 1.5, '3', null]) expect(com(ruim), String(ruim)).toBe(false);
  });

  it('expulso: o motivo é opcional e só "anfitriao"; nada a mais', () => {
    const com = (m: object) => validarMensagemDaSala({ tipo: 'expulso', ...m }).ok;
    expect(com({})).toBe(true);
    expect(com({ motivo: 'anfitriao' })).toBe(true);
    for (const ruim of [{ motivo: 'chato' }, { motivo: '' }, { motivo: null }, { motivo: 1 }, { extra: 1 }, { lugar: 1 }]) expect(com(ruim), JSON.stringify(ruim)).toBe(false);
    expect(validarMensagemDoCliente({ tipo: 'expulso' }).ok).toBe(false);
    expect(validarMensagemDaSala({ tipo: 'expulsar', lugar: 1 }).ok).toBe(false);
  });

  it('estado-sala: relógio e prazo são opcionais; prazo em ms inteiros ou null; relógio com os tempos do contrato', () => {
    const base = sala.find((m) => m.tipo === 'estado-sala' && m.relogio === undefined) as Solto;
    const com = (mudanca: object) => validarMensagemDaSala({ ...clone(base), ...mudanca }).ok;
    expect(validarMensagemDaSala(base).ok).toBe(true);
    expect(com({ relogio: { tempoS: 30, aoEsgotar: 'perde-a-vez' }, prazoMs: 0 })).toBe(true);
    expect(com({ relogio: { tempoS: null, aoEsgotar: 'falta' }, prazoMs: null })).toBe(true);
    expect(com({ prazoMs: 600_000 })).toBe(true);
    for (const prazoMs of [-1, 600_001, 1.5, Number.NaN, '30']) expect(com({ prazoMs }), String(prazoMs)).toBe(false);
    expect(com({ relogio: { tempoS: 20, aoEsgotar: 'perde-a-vez' } })).toBe(false);
    expect(com({ relogio: { tempoS: 30 } })).toBe(false);
    expect(com({ relogio: { aoEsgotar: 'perde-a-vez' } })).toBe(false);
    expect(com({ relogio: { tempoS: 30, aoEsgotar: 'perde-a-vez', extra: true } })).toBe(false);
  });

  it('estado-sala: a linha é opcional e, quando vem, tem previsao booleana (bolaAtingida opcional) e nada a mais', () => {
    const base = sala.find((m) => m.tipo === 'estado-sala' && m.linha === undefined) as Solto;
    const com = (linha: unknown) => validarMensagemDaSala({ ...clone(base), linha }).ok;
    expect(validarMensagemDaSala(base).ok).toBe(true);
    expect(com({ previsao: true, bolaAtingida: false })).toBe(true);
    expect(com({ previsao: false })).toBe(true);
    for (const ruim of [{}, { bolaAtingida: true }, { previsao: 0 }, { previsao: true, extra: 1 }, null]) expect(com(ruim), JSON.stringify(ruim)).toBe(false);
  });

  describe('estado-sala: placar', () => {
    const base = () => clone(sala.find((m) => m.tipo === 'estado-sala' && m.placar === undefined) as Solto);
    const lado = (nomes: unknown, vitorias: unknown) => ({ nomes, vitorias });
    const confronto = (a = lado(['Zé'], 1), b = lado(['Ana'], 0)) => ({ lados: [a, b] });
    const com = (placar: unknown) => validarMensagemDaSala({ ...base(), placar }).ok;

    it('é opcional; quando vem, traz atual (confronto ou null) e historico, e nada a mais', () => {
      expect(validarMensagemDaSala(base()).ok).toBe(true);
      expect(com({ atual: null, historico: [] })).toBe(true);
      expect(com({ atual: confronto(), historico: [confronto()] })).toBe(true);
      for (const ruim of [{}, { atual: null }, { historico: [] }, { atual: undefined, historico: [] }, { atual: null, historico: [], extra: 1 }, null, [], 'x']) {
        expect(com(ruim), JSON.stringify(ruim)).toBe(false);
      }
    });

    it('o confronto tem de 2 a 4 lados, cada um com 1 ou 2 apelidos e vitórias inteiras de 0 ao teto', () => {
      const ok = (c: unknown) => com({ atual: c, historico: [] });
      expect(ok(confronto(lado(['Zé', 'Ana'], 0), lado(['Beto', 'Cida'], 9999)))).toBe(true);
      expect(ok({ lados: [lado(['Zé'], 1)] })).toBe(false);
      expect(ok({ lados: [lado(['Zé'], 1), lado(['Ana'], 0), lado(['Beto'], 0)] })).toBe(true);
      expect(ok({ lados: [lado(['Zé'], 1), lado(['Ana'], 0), lado(['Beto'], 0), lado(['Cida'], 2)] })).toBe(true);
      expect(ok({ lados: [lado(['Zé'], 1), lado(['Ana'], 0), lado(['Beto'], 0), lado(['Cida'], 2), lado(['Davi'], 0)] })).toBe(false);
      expect(ok({ lados: [] })).toBe(false);
      expect(ok({ lados: [lado(['Zé'], 1), lado(['Ana'], 0)], extra: 1 })).toBe(false);
      expect(ok({})).toBe(false);
      expect(ok({ lados: 'Zé x Ana' })).toBe(false);
      for (const nomes of [[], ['a', 'b', 'c'], [''], ['x'.repeat(LIMITES_PROTOCOLO.nome + 1)], [1], 'Zé', null]) {
        expect(ok(confronto(lado(nomes, 1))), JSON.stringify(nomes)).toBe(false);
      }
      for (const vitorias of [-1, 10_000, 1.5, Number.NaN, '3', null, undefined]) expect(ok(confronto(lado(['Zé'], vitorias))), String(vitorias)).toBe(false);
      expect(ok(confronto({ nomes: ['Zé'] } as never))).toBe(false);
      expect(ok(confronto({ nomes: ['Zé'], vitorias: 1, id: 'p1' } as never))).toBe(false);
    });

    it('o histórico guarda no máximo confrontosNoPlacar - 1 (o atual completa os 10)', () => {
      const n = LIMITES_PROTOCOLO.confrontosNoPlacar - 1;
      expect(com({ atual: confronto(), historico: Array.from({ length: n }, () => confronto()) })).toBe(true);
      expect(com({ atual: confronto(), historico: Array.from({ length: n + 1 }, () => confronto()) })).toBe(false);
    });

    it('apelido com caractere de controle é recusado', () => {
      expect(com({ atual: confronto(lado(['Z\u0000é'], 1)), historico: [] })).toBe(false);
    });
  });

  it('tempo-esgotado: lugares de 0 a 3, motivo e consequência conhecidos, nada a mais', () => {
    const base = sala.find((m) => m.tipo === 'tempo-esgotado') as Solto;
    const com = (mudanca: object) => validarMensagemDaSala({ ...clone(base), ...mudanca }).ok;
    expect(com({})).toBe(true);
    expect(com({ motivo: 'ausencia' })).toBe(true);
    expect(com({ consequencia: 'falta' })).toBe(true);
    for (const mudanca of [{ lugar: 4 }, { lugar: -1 }, { lugar: null }, { proximo: 4 }, { proximo: null }, { motivo: 'preguica' }, { consequencia: 'expulsa' }, { extra: 1 }]) {
      expect(com(mudanca), JSON.stringify(mudanca)).toBe(false);
    }
    expect(validarMensagemDaSala(sem(base, 'proximo')).ok).toBe(false);
  });

  it('erro: código conhecido', () => {
    expect(validarMensagemDaSala({ tipo: 'erro', codigo: 'nao-e-sua-vez', mensagem: 'x' }).ok).toBe(true);
    expect(validarMensagemDaSala({ tipo: 'erro', codigo: 'inventado', mensagem: 'x' }).ok).toBe(false);
  });

  it('retrato: motivo conhecido, mesa ou null, ultima ou null', () => {
    const base = sala.filter((m) => m.tipo === 'retrato')[0] as Solto;
    expect(validarMensagemDaSala({ ...clone(base), motivo: 'sei lá' }).ok).toBe(false);
    expect(validarMensagemDaSala({ ...clone(base), mesa: undefined }).ok).toBe(false);
    expect(validarMensagemDaSala({ ...clone(base), semente: -1 }).ok).toBe(false);
  });

  describe('perdemAProximaVez (mata-mata, L19) nas mensagens da sala que carregam a partida', () => {
    const real = suicidioNoMataMata();
    const daSala = (tipo: 'retrato' | 'tacada-retransmitida'): Solto => sala.find((m) => m.tipo === tipo && (m as Solto).partida.perdemAProximaVez !== undefined);
    const com = (tipo: 'retrato' | 'tacada-retransmitida', perdem: unknown): boolean => {
      const m = clone(daSala(tipo));
      m.partida.perdemAProximaVez = perdem;
      return validarMensagemDaSala(m).ok;
    };

    it('o exemplo vem de uma tacada real: Ana derrubou a branca, perde a próxima vez e a vez é do Beto', () => {
      expect(real.regras.partida).toMatchObject({ vez: 1, perdemAProximaVez: [0] });
      expect(real.regras.consequencias.faltas.map((f) => f.nome)).toContain('suicidio');
    });

    it.each(['retrato', 'tacada-retransmitida'] as const)('%s: aceita a lista e devolve o campo igual', (tipo) => {
      const m = daSala(tipo);
      expect(m, `exemplo de ${tipo} com o campo`).toBeDefined();
      const r = validarMensagemDaSala(m);
      expect(r.ok, r.ok ? '' : r.erro).toBe(true);
      if (r.ok) expect((r.valor as Solto).partida.perdemAProximaVez).toEqual([0]);
    });

    it.each(['retrato', 'tacada-retransmitida'] as const)('%s: sem o campo (ninguém perde) passa; repetido, fora de ordem, fora da faixa, vazio e todos são recusados', (tipo) => {
      const semCampo = clone(daSala(tipo));
      delete semCampo.partida.perdemAProximaVez;
      expect(validarMensagemDaSala(semCampo).ok).toBe(true);
      expect(com(tipo, [1, 2])).toBe(true);
      expect(com(tipo, [1, 1])).toBe(false);
      expect(com(tipo, [2, 1])).toBe(false);
      expect(com(tipo, [3])).toBe(false);
      expect(com(tipo, [-1])).toBe(false);
      expect(com(tipo, [])).toBe(false);
      expect(com(tipo, [0, 1, 2])).toBe(false);
      expect(com(tipo, null)).toBe(false);
    });

    it('o estado-sala não carrega a partida: o campo ali é chave desconhecida', () => {
      const estado = clone(sala.find((m) => m.tipo === 'estado-sala')) as Solto;
      expect(validarMensagemDaSala({ ...estado, perdemAProximaVez: [0] }).ok).toBe(false);
    });
  });

  it('consequências com texto enorme são recusadas', () => {
    const t = tacadaCompleta(4);
    const m = { tipo: 'tacada-retransmitida', seq: 0, lugar: 0, parametros: t.parametros, gravacao: t.resultado.gravacao, partida: t.regras.partida, mesa: t.resultado.estadoFinal, consequencias: { ...t.regras.consequencias, texto: 'x'.repeat(LIMITES_PROTOCOLO.textoConsequencia + 1) } };
    expect(validarMensagemDaSala(m).ok).toBe(false);
  });
});
