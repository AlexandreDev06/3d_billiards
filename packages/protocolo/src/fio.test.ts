import { afterEach, describe, expect, it, vi } from 'vitest';
import { codificarGravacao, decodificarGravacao } from './gravacao-codec';
import { codificarMensagem, decodificarMensagemDaSala, decodificarMensagemDoCliente, type DadoDoFio } from './fio';
import { LIMITES_PROTOCOLO } from './limites';
import { decodificarUtf8 } from './utf8';
import { codificarUtf8 } from './utf8';
import { bytesDeGravacaoBomba, exemplosDeMensagens, maiorErroAngular, maiorErroDePosicao, quadroBinario, quebraComBolaCaida, type Solto } from './para-testes';
import { EMOJIS_DA_SALA, type MensagemDaSala, type MensagemDoCliente } from './tipos';

vi.mock('./gravacao-codec', async (original) => {
  const m = await original<typeof import('./gravacao-codec')>();
  return { ...m, decodificarGravacao: vi.fn(m.decodificarGravacao) };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(decodificarGravacao).mockClear();
});

const { cliente, sala } = exemplosDeMensagens();

const semGravacao = (m: unknown): unknown => JSON.parse(JSON.stringify(m, (k, v) => (k === 'gravacao' ? undefined : v)));
const gravacaoDe = (m: Solto) => m.gravacao ?? m.ultima?.gravacao;

function confere(original: MensagemDoCliente | MensagemDaSala, volta: MensagemDoCliente | MensagemDaSala): void {
  expect(semGravacao(volta)).toEqual(semGravacao(original));
  const a = gravacaoDe(original);
  const b = gravacaoDe(volta);
  if (a) {
    expect(maiorErroDePosicao(a, b)).toBeLessThan(5e-4);
    expect(maiorErroAngular(a, b)).toBeLessThan(0.5 * (Math.PI / 180));
    expect(b.eventos).toEqual(a.eventos);
    expect([...b.naMesa]).toEqual([...a.naMesa]);
  } else expect(b).toBeUndefined();
}

const temGravacao = (m: MensagemDoCliente | MensagemDaSala): boolean => gravacaoDe(m) !== undefined;

describe('envelope do fio', () => {
  it('ida e volta de todas as mensagens do cliente', () => {
    for (const m of cliente) {
      const r = decodificarMensagemDoCliente(codificarMensagem(m));
      expect(r.ok, `${m.tipo}: ${r.ok ? '' : r.erro}`).toBe(true);
      if (r.ok) confere(m, r.valor);
    }
  });

  it('ida e volta de todas as mensagens da sala', () => {
    for (const m of sala) {
      const r = decodificarMensagemDaSala(codificarMensagem(m));
      expect(r.ok, `${m.tipo}: ${r.ok ? '' : r.erro}`).toBe(true);
      if (r.ok) confere(m, r.valor);
    }
  });

  it('emoji: cada um dos 40 do catálogo faz a ida e volta das duas pontas, em texto e em bytes UTF-8', () => {
    for (const emoji of EMOJIS_DA_SALA) {
      const doCliente: MensagemDoCliente = { tipo: 'emoji', emoji };
      const daSala: MensagemDaSala = { tipo: 'emoji-retransmitido', lugar: null, nome: 'Zé', emoji };
      const textoCliente = codificarMensagem(doCliente);
      const textoSala = codificarMensagem(daSala);
      expect(typeof textoCliente, emoji).toBe('string');
      expect(decodificarMensagemDoCliente(textoCliente), emoji).toEqual({ ok: true, valor: doCliente });
      expect(decodificarMensagemDaSala(textoSala), emoji).toEqual({ ok: true, valor: daSala });
      const bytes = codificarUtf8(textoCliente as string);
      expect(decodificarMensagemDoCliente(bytes, { texto: true }), emoji).toEqual({ ok: true, valor: doCliente });
    }
  });

  it('emoji fora da lista chega como mensagem-invalida nas duas pontas, sem lançar', () => {
    for (const emoji of ['😀', '🍷', 'oi', '', '👏🏽', '👍🏽', '😂\uFE0F', '🙏\uFE0F', '😂😂', 7, null]) {
      const json = JSON.stringify({ tipo: 'emoji', emoji });
      expect(decodificarMensagemDoCliente(json), json).toMatchObject({ ok: false, codigo: 'mensagem-invalida' });
      const volta = JSON.stringify({ tipo: 'emoji-retransmitido', lugar: 0, nome: 'Zé', emoji });
      expect(decodificarMensagemDaSala(volta), volta).toMatchObject({ ok: false, codigo: 'mensagem-invalida' });
    }
  });

  describe('perdemAProximaVez (mata-mata, L19): a partida que carrega a lista vai e volta, e a lista ruim é recusada', () => {
    const comLista = <T extends MensagemDoCliente | MensagemDaSala>(tipo: T['tipo']): T =>
      [...cliente, ...sala].find((m) => m.tipo === tipo && (m as Solto).partida?.perdemAProximaVez !== undefined) as T;
    const suicida = {
      tacada: comLista<MensagemDoCliente>('tacada'),
      'tacada-retransmitida': comLista<MensagemDaSala>('tacada-retransmitida'),
      retrato: comLista<MensagemDaSala>('retrato'),
    };

    it('tacada, tacada-retransmitida e retrato: o campo chega idêntico, em quadro binário', () => {
      for (const [tipo, m] of Object.entries(suicida)) {
        expect(m, tipo).toBeDefined();
        expect((m as Solto).partida.perdemAProximaVez, tipo).toEqual([0]);
        const dado = codificarMensagem(m);
        expect(typeof dado, `${tipo} leva gravação: quadro binário`).not.toBe('string');
        const r = tipo === 'tacada' ? decodificarMensagemDoCliente(dado) : decodificarMensagemDaSala(dado);
        expect(r.ok, `${tipo}: ${r.ok ? '' : r.erro}`).toBe(true);
        if (r.ok) expect((r.valor as Solto).partida.perdemAProximaVez, tipo).toEqual([0]);
      }
    });

    it('a mesma partida sem o campo (ninguém perde) volta sem ele: nada de `undefined` nem lista vazia', () => {
      for (const [tipo, m] of Object.entries(suicida)) {
        const sem = { ...(m as Solto), partida: { ...(m as Solto).partida } };
        delete sem.partida.perdemAProximaVez;
        const dado = codificarMensagem(sem);
        const r = tipo === 'tacada' ? decodificarMensagemDoCliente(dado) : decodificarMensagemDaSala(dado);
        expect(r.ok, tipo).toBe(true);
        if (r.ok) expect((r.valor as Solto).partida, tipo).not.toHaveProperty('perdemAProximaVez');
      }
    });

    it.each([
      ['repetida', [0, 0]],
      ['fora de ordem', [2, 1]],
      ['com índice que a partida não tem', [3]],
      ['vazia', []],
      ['com todos os jogadores', [0, 1, 2]],
    ])('lista %s: mensagem-invalida nas duas pontas, sem lançar e sem decodificar a gravação', (_nome, lista) => {
      for (const [tipo, m] of Object.entries(suicida)) {
        const ruim = { ...(m as Solto), partida: { ...(m as Solto).partida, perdemAProximaVez: lista } };
        const dado = codificarMensagem(ruim);
        vi.mocked(decodificarGravacao).mockClear();
        const r = tipo === 'tacada' ? decodificarMensagemDoCliente(dado) : decodificarMensagemDaSala(dado);
        expect(r, `${tipo} ${JSON.stringify(lista)}`).toMatchObject({ ok: false, codigo: 'mensagem-invalida' });
        expect(decodificarGravacao, `${tipo}: o cabeçalho ruim para antes da gravação`).not.toHaveBeenCalled();
      }
    });

    it('em texto (sem gravação) a lista ruim do retrato sem `ultima` também é recusada', () => {
      const retrato = sala.find((m) => m.tipo === 'retrato' && m.ultima === null && m.partida.perdemAProximaVez === undefined) as Solto;
      const texto = (perdem: unknown) => JSON.stringify({ ...retrato, partida: { ...retrato.partida, jogadores: [...retrato.partida.jogadores, { id: 'lugar-2', nome: 'Cida', equipe: 2 }], grupos: [null, null, null], perdemAProximaVez: perdem } });
      expect(decodificarMensagemDaSala(texto([0])).ok).toBe(true);
      expect(decodificarMensagemDaSala(texto([1, 1]))).toMatchObject({ ok: false, codigo: 'mensagem-invalida' });
      expect(decodificarMensagemDaSala(texto([2, 0]))).toMatchObject({ ok: false, codigo: 'mensagem-invalida' });
      expect(decodificarMensagemDaSala(texto([3]))).toMatchObject({ ok: false, codigo: 'mensagem-invalida' });
      expect(decodificarMensagemDaSala(texto([]))).toMatchObject({ ok: false, codigo: 'mensagem-invalida' });
    });
  });

  it('só quem leva gravação vai em quadro binário; o resto é texto JSON', () => {
    for (const m of [...cliente, ...sala]) {
      expect(typeof codificarMensagem(m) === 'string', m.tipo).toBe(!temGravacao(m));
    }
  });

  it('aceita ArrayBuffer e Uint8Array com deslocamento (como o Buffer do Node entrega)', () => {
    const m = cliente.find((x) => x.tipo === 'tacada')!;
    const bytes = codificarMensagem(m) as Uint8Array;
    const grande = new Uint8Array(bytes.length + 10);
    grande.set(bytes, 7);
    const dados: DadoDoFio[] = [bytes, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, grande.subarray(7, 7 + bytes.length)];
    for (const d of dados) {
      const r = decodificarMensagemDoCliente(d);
      expect(r.ok).toBe(true);
    }
  });

  it('tacada completa de uma quebra fica abaixo de 50 KB no fio (JSON da partida e da mesa incluídos)', () => {
    const { real, resultado } = quebraComBolaCaida();
    const m: MensagemDoCliente = {
      tipo: 'tacada',
      seq: 0,
      parametros: { angulo: 0, velocidadeTaco: 8, efeito: { lateral: 0, vertical: 0.2 }, elevacao: 0, giz: 1 },
      gravacao: resultado.gravacao,
      partida: real.partida,
      mesa: resultado.estadoFinal,
    };
    const bytes = codificarMensagem(m) as Uint8Array;
    expect(bytes.length).toBeLessThan(50_000);
    expect(bytes.length).toBeLessThan(LIMITES_PROTOCOLO.bytesPorMensagem / 4);
  });

  it('recusa mensagem acima do limite, de texto ou binária, antes de interpretar', () => {
    const r1 = decodificarMensagemDoCliente('x'.repeat(100), 50);
    expect(r1).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
    const r2 = decodificarMensagemDoCliente(new Uint8Array(100), 50);
    expect(r2).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
    expect(decodificarMensagemDoCliente('{"tipo":"iniciar"}', 18).ok).toBe(true);
    expect(decodificarMensagemDoCliente('{"tipo":"iniciar"}', 17)).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
  });

  it('recusa JSON inválido, aninhamento absurdo e lixo, sem lançar', () => {
    for (const ruim of ['', 'não é json', '{', '[]', 'null', '42', '"ping"']) {
      expect(decodificarMensagemDoCliente(ruim), ruim).toMatchObject({ ok: false, codigo: 'mensagem-invalida' });
    }
    // aninhamento no máximo que o teto de texto deixa passar: recusado por forma
    const fundo = '['.repeat(8000) + ']'.repeat(8000);
    expect(decodificarMensagemDoCliente(fundo)).toMatchObject({ ok: false, codigo: 'mensagem-invalida' });
    // e o absurdo nem chega a ser interpretado
    const absurdo = '['.repeat(200_000) + ']'.repeat(200_000);
    expect(decodificarMensagemDoCliente(absurdo)).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
    expect(decodificarMensagemDaSala(absurdo)).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
  });

  it('recusa mensagem da sala vinda do lado do cliente e vice-versa', () => {
    expect(decodificarMensagemDoCliente(codificarMensagem(sala[0]!)).ok).toBe(false);
    expect(decodificarMensagemDaSala(codificarMensagem(cliente[3]!)).ok).toBe(false);
  });

  it('tacada em texto (sem gravação) é inválida', () => {
    const t = cliente.find((x) => x.tipo === 'tacada')!;
    expect(decodificarMensagemDoCliente(JSON.stringify({ ...t, gravacao: undefined })).ok).toBe(false);
    expect(decodificarMensagemDoCliente(JSON.stringify(t)).ok).toBe(false);
  });

  describe('quadro binário malformado', () => {
    const t = cliente.find((x) => x.tipo === 'tacada')!;
    const ok = codificarMensagem(t) as Uint8Array;

    it('magia errada, tamanho do JSON absurdo e corte em qualquer ponto', () => {
      const magia = ok.slice();
      magia[0] = 0;
      expect(decodificarMensagemDoCliente(magia).ok).toBe(false);
      const grande = ok.slice();
      grande.set([0xff, 0xff, 0xff, 0x7f], 1);
      expect(decodificarMensagemDoCliente(grande).ok).toBe(false);
      for (let corte = 0; corte < ok.length; corte += Math.max(1, Math.floor(ok.length / 150))) {
        expect(decodificarMensagemDoCliente(ok.slice(0, corte)).ok, `corte ${corte}`).toBe(false);
      }
    });

    it('cabeçalho de um tipo sem gravação seguido de bytes é recusado', () => {
      const json = codificarUtf8('{"tipo":"ping","t":1}');
      const grav = codificarGravacao(gravacaoDe(t));
      const quadro = new Uint8Array(5 + json.length + grav.length);
      quadro[0] = ok[0]!;
      new DataView(quadro.buffer).setUint32(1, json.length, true);
      quadro.set(json, 5);
      quadro.set(grav, 5 + json.length);
      expect(decodificarMensagemDoCliente(quadro).ok).toBe(false);
    });

    it('bytes aleatórios e textos aleatórios só dão resultado de erro', () => {
      let s = 99;
      const prox = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) & 0xff);
      for (let n = 0; n < 400; n++) {
        const b = Uint8Array.from({ length: 1 + (n % 80) }, prox);
        if (n % 2 === 0) b[0] = ok[0]!;
        expect(decodificarMensagemDoCliente(b).ok).toBe(false);
        expect(decodificarMensagemDaSala(String.fromCharCode(...b)).ok).toBe(false);
      }
    });
  });
});

describe('tetos por tipo de quadro, antes de qualquer parse', () => {
  it('texto do cliente acima do teto é recusado sem JSON.parse', () => {
    const parse = vi.spyOn(JSON, 'parse');
    const r = decodificarMensagemDoCliente('['.repeat(16 * 1024 + 1));
    expect(r).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
    expect(parse).not.toHaveBeenCalled();
  });

  it('o teto de texto do cliente é de 16 KB: no limite interpreta, um byte a mais não', () => {
    const parse = vi.spyOn(JSON, 'parse');
    const base = '{"tipo":"iniciar"}';
    const noLimite = base + ' '.repeat(16 * 1024 - base.length);
    expect(LIMITES_PROTOCOLO.bytesTextoDoCliente).toBe(16 * 1024);
    expect(decodificarMensagemDoCliente(noLimite).ok).toBe(true);
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockClear();
    expect(decodificarMensagemDoCliente(noLimite + ' ')).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
    expect(parse).not.toHaveBeenCalled();
  });

  it('diagnostico tem teto próprio de 1 KB: no limite interpreta, um byte a mais é recusado sem validar o esquema', () => {
    const base = codificarMensagem(cliente.find((m) => m.tipo === 'diagnostico')!) as string;
    expect(LIMITES_PROTOCOLO.bytesDiagnostico).toBe(1024);
    const noLimite = base + ' '.repeat(1024 - base.length);
    expect(decodificarMensagemDoCliente(noLimite).ok).toBe(true);
    expect(decodificarMensagemDoCliente(noLimite + ' ')).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
    const bytes = codificarUtf8(noLimite + ' ');
    expect(decodificarMensagemDoCliente(bytes, { texto: true })).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
  });

  it('o teto de 1 KB é só do diagnostico: outro tipo do mesmo tamanho continua valendo até 16 KB', () => {
    const maior = JSON.stringify({ tipo: 'mira', angulo: 1, lateral: 0, vertical: 0, recuo: 0.1 }) + ' '.repeat(2000);
    expect(decodificarMensagemDoCliente(maior).ok).toBe(true);
  });

  it('texto em Buffer/Uint8Array também respeita o teto (o servidor confere os bytes antes de virar string)', () => {
    const parse = vi.spyOn(JSON, 'parse');
    const bytes = new Uint8Array(16 * 1024 + 1).fill(0x20);
    expect(decodificarMensagemDoCliente(bytes, { texto: true })).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
    expect(parse).not.toHaveBeenCalled();
  });

  it('cabeçalho JSON do quadro binário acima do teto é recusado sem JSON.parse e sem decodificar a gravação', () => {
    const parse = vi.spyOn(JSON, 'parse');
    expect(LIMITES_PROTOCOLO.bytesCabecalhoDoCliente).toBe(32 * 1024);
    const enorme = quadroBinario('{"tipo":"tacada"}' + ' '.repeat(32 * 1024), new Uint8Array(0));
    expect(decodificarMensagemDoCliente(enorme)).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
    expect(parse).not.toHaveBeenCalled();
    expect(decodificarGravacao).not.toHaveBeenCalled();
  });

  it('o cabeçalho de uma tacada real cabe com folga no teto (partida e mesa)', () => {
    const t = cliente.find((m) => m.tipo === 'tacada')!;
    const bytes = codificarMensagem(t) as Uint8Array;
    const tamanhoJson = new DataView(bytes.buffer, bytes.byteOffset).getUint32(1, true);
    expect(tamanhoJson).toBeLessThan(LIMITES_PROTOCOLO.bytesCabecalhoDoCliente / 2);
  });

  it('o cabeçalho no limite exato interpreta; um byte a mais não', () => {
    const t = cliente.find((m) => m.tipo === 'tacada')!;
    const bytes = codificarMensagem(t) as Uint8Array;
    const tamanhoJson = new DataView(bytes.buffer, bytes.byteOffset).getUint32(1, true);
    const json = bytes.slice(5, 5 + tamanhoJson);
    const gravacao = bytes.slice(5 + tamanhoJson);
    const texto = decodificarUtf8(json);
    const preenchido = (n: number) => texto + ' '.repeat(n - json.length);
    const parse = vi.spyOn(JSON, 'parse');
    expect(decodificarMensagemDoCliente(quadroBinario(preenchido(32 * 1024), gravacao)).ok).toBe(true);
    parse.mockClear();
    expect(decodificarMensagemDoCliente(quadroBinario(preenchido(32 * 1024 + 1), gravacao))).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
    expect(parse).not.toHaveBeenCalled();
  });

  it('o lado da sala tem tetos próprios, maiores: um retrato de texto com mesa cabe', () => {
    const retrato = sala.find((m) => m.tipo === 'retrato' && m.mesa === null)!;
    const texto = codificarMensagem(retrato) as string;
    expect(texto.length).toBeLessThan(LIMITES_PROTOCOLO.bytesTextoDaSala);
    expect(LIMITES_PROTOCOLO.bytesTextoDaSala).toBeGreaterThan(LIMITES_PROTOCOLO.bytesTextoDoCliente);
    expect(decodificarMensagemDaSala(' '.repeat(LIMITES_PROTOCOLO.bytesTextoDaSala + 1))).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
  });

  it('texto aninhado de 16 KB (o máximo permitido) custa pouco e é recusado por forma', () => {
    const t0 = Date.now();
    const r = decodificarMensagemDoCliente('['.repeat(8 * 1024) + ']'.repeat(8 * 1024));
    expect(r).toMatchObject({ ok: false, codigo: 'mensagem-invalida' });
    expect(Date.now() - t0).toBeLessThan(50);
  });
});

describe('autorização antes de decodificar a gravação', () => {
  const tacadaMinima = (m: Solto = {}) => {
    const t = cliente.find((x) => x.tipo === 'tacada')!;
    return codificarMensagem({ ...t, ...m }) as Uint8Array;
  };

  it('só decodifica a gravação depois que a autorização aceita, e entrega o seq', () => {
    const autorizar = vi.fn(() => null);
    const bytes = tacadaMinima({ seq: 7 });
    const r = decodificarMensagemDoCliente(bytes, { autorizarGravacao: autorizar });
    expect(r.ok).toBe(true);
    expect(autorizar).toHaveBeenCalledTimes(1);
    expect(autorizar).toHaveBeenCalledWith({ seq: 7 });
    expect(decodificarGravacao).toHaveBeenCalledTimes(1);
    expect(autorizar.mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(decodificarGravacao).mock.invocationCallOrder[0]!);
  });

  it('autorização recusada: devolve o código dela e a gravação nunca é decodificada (nem a bomba)', () => {
    const cabecalho = { ...(cliente.find((x) => x.tipo === 'tacada') as Solto), gravacao: undefined };
    const bomba = quadroBinario(cabecalho, bytesDeGravacaoBomba(3601));
    const r = decodificarMensagemDoCliente(bomba, { autorizarGravacao: () => 'nao-e-sua-vez' });
    expect(r).toMatchObject({ ok: false, codigo: 'nao-e-sua-vez', recusadaPelaSala: true });
    expect(decodificarGravacao).not.toHaveBeenCalled();
  });

  it('sem autorização o mesmo quadro é decodificado (comportamento de antes)', () => {
    const cabecalho = { ...(cliente.find((x) => x.tipo === 'tacada') as Solto), gravacao: undefined };
    const r = decodificarMensagemDoCliente(quadroBinario(cabecalho, bytesDeGravacaoBomba(300)));
    expect(r.ok).toBe(true);
    expect(decodificarGravacao).toHaveBeenCalledTimes(1);
  });

  it('cabeçalho inválido é recusado antes de chamar a autorização', () => {
    const autorizar = vi.fn(() => null);
    const cabecalho = { ...(cliente.find((x) => x.tipo === 'tacada') as Solto), gravacao: undefined, seq: -1 };
    const r = decodificarMensagemDoCliente(quadroBinario(cabecalho, bytesDeGravacaoBomba(300)), { autorizarGravacao: autorizar });
    expect(r).toMatchObject({ ok: false, codigo: 'mensagem-invalida' });
    expect(autorizar).not.toHaveBeenCalled();
    expect(decodificarGravacao).not.toHaveBeenCalled();
  });

  it('mensagens sem gravação não chamam a autorização', () => {
    const autorizar = vi.fn(() => 'nao-e-sua-vez' as const);
    expect(decodificarMensagemDoCliente('{"tipo":"iniciar"}', { autorizarGravacao: autorizar }).ok).toBe(true);
    expect(autorizar).not.toHaveBeenCalled();
  });

  it('o segundo parâmetro numérico de antes continua sendo o teto total', () => {
    expect(decodificarMensagemDoCliente('x'.repeat(100), 50)).toMatchObject({ ok: false, codigo: 'mensagem-grande' });
  });
});
