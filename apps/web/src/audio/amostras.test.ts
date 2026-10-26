import { describe, expect, it } from 'vitest';
import manifestoJson from '../../public/sons/manifesto.json';
import { CONFIG_WEB } from '../config';
import {
  BancoDeAmostras,
  comReserva,
  escolherVariacao,
  formatoPreferido,
  geradorDeAmostras,
  lerManifesto,
  taxaDeReproducao,
  type DependenciasDoBanco,
  type VariacaoDoManifesto,
} from './amostras';
import type { PedidoDeSom } from './mapeamento';
import type { Gerador, SaidaDeSom } from './motor-audio';

/** Os arquivos que estão em public/sons/ (o Vite lista; sem Node). */
const ARQUIVOS_DE_SOM = new Set(Object.keys(import.meta.glob('../../public/sons/*.{ogg,mp3}')).map((c) => c.split('/').pop()!));
const MANIFESTO_REAL: unknown = manifestoJson;
const CFG = CONFIG_WEB.audio.amostras;

const variacao = (id: string, intensidade: readonly [number, number] | null): VariacaoDoManifesto => ({
  id,
  arquivos: { ogg: `${id}.ogg`, mp3: `${id}.mp3` },
  ganho: 0.5,
  duracaoMs: 100,
  intensidade,
});

describe('manifesto real dos sons (public/sons/manifesto.json)', () => {
  const manifesto = lerManifesto(MANIFESTO_REAL)!;

  it('é lido inteiro: nenhuma variação cai na conferência', () => {
    expect(manifesto).not.toBeNull();
    const contagem = Object.fromEntries(Object.entries(manifesto.eventos).map(([nome, lista]) => [nome, lista.length]));
    expect(contagem).toEqual({ 'bola-bola': 4, 'taco-bola': 2, 'bola-tabela': 2, cacapa: 2, 'vez-outro': 1, 'vez-sua': 1, 'tempo-esgotado': 1 });
  });

  it('todos os arquivos existem nos dois formatos, e não sobra arquivo fora do manifesto', () => {
    const citados = new Set<string>();
    for (const lista of Object.values(manifesto.eventos)) {
      for (const v of lista) {
        for (const formato of ['ogg', 'mp3'] as const) {
          expect(ARQUIVOS_DE_SOM.has(v.arquivos[formato]), v.arquivos[formato]).toBe(true);
          citados.add(v.arquivos[formato]);
        }
      }
    }
    expect([...ARQUIVOS_DE_SOM].filter((a) => !citados.has(a))).toEqual([]);
    expect(citados.size).toBe(26);
  });

  it('as faixas de cada evento cobrem de 0 a 1 sem buraco (todo impacto tem uma variação)', () => {
    for (const [nome, lista] of Object.entries(manifesto.eventos)) {
      const faixas = lista.flatMap((v) => (v.intensidade ? [v.intensidade] : [])).sort((a, b) => a[0] - b[0]);
      if (faixas.length === 0) continue;
      expect(faixas[0]![0], nome).toBe(0);
      expect(faixas.at(-1)![1], nome).toBe(1);
      for (let i = 1; i < faixas.length; i++) expect(faixas[i]![0], nome).toBeLessThanOrEqual(faixas[i - 1]![1]);
    }
  });

  it('as mais fortes têm ganho maior que as fracas (a ordem fraco → forte do manifesto)', () => {
    for (const nome of ['bola-bola', 'taco-bola', 'bola-tabela']) {
      const lista = manifesto.eventos[nome]!;
      for (let i = 1; i < lista.length; i++) expect(lista[i]!.ganho).toBeGreaterThanOrEqual(lista[i - 1]!.ganho);
    }
  });
});

describe('lerManifesto', () => {
  const bom = { id: 'a-1', ogg: 'a-1.ogg', mp3: 'a-1.mp3', ganho: 0.5, duracaoMs: 120, intensidade: [0, 0.5] };

  it('lê o formato do manifesto', () => {
    const m = lerManifesto({ base: '/sons/', eventos: { a: [bom] } });
    expect(m).toEqual({ eventos: { a: [{ id: 'a-1', arquivos: { ogg: 'a-1.ogg', mp3: 'a-1.mp3' }, ganho: 0.5, duracaoMs: 120, intensidade: [0, 0.5] }] } });
  });

  it('sem faixa de intensidade (sons de interface) a variação serve para qualquer uma', () => {
    const semFaixa: Record<string, unknown> = { ...bom };
    delete semFaixa['intensidade'];
    expect(lerManifesto({ eventos: { a: [semFaixa] } })!.eventos['a']![0]!.intensidade).toBeNull();
  });

  it.each([
    ['caminho fora da pasta', { ...bom, ogg: '../a-1.ogg' }],
    ['barra no nome', { ...bom, mp3: 'x/a-1.mp3' }],
    ['extensão trocada', { ...bom, ogg: 'a-1.wav' }],
    ['ganho zero', { ...bom, ganho: 0 }],
    ['ganho absurdo', { ...bom, ganho: 40 }],
    ['duração negativa', { ...bom, duracaoMs: -5 }],
    ['duração zero', { ...bom, duracaoMs: 0 }],
    ['duração de mais de 10 s', { ...bom, duracaoMs: 10_001 }],
    ['faixa que começa abaixo de 0', { ...bom, intensidade: [-0.1, 0.5] }],
    ['faixa com três números', { ...bom, intensidade: [0, 0.5, 0.9] }],
    ['faixa fora de 0–1', { ...bom, intensidade: [0, 1.5] }],
    ['faixa invertida', { ...bom, intensidade: [0.6, 0.2] }],
    ['faixa que não é par', { ...bom, intensidade: [0.2] }],
    ['id vazio', { ...bom, id: '' }],
    ['lixo', 'texto'],
  ])('descarta a variação com %s, e as boas do mesmo evento ficam', (_nome, ruim) => {
    const m = lerManifesto({ eventos: { a: [ruim, bom] } })!;
    expect(m.eventos['a']!.map((v) => v.id)).toEqual(['a-1']);
  });

  it('a duração de 10 s ainda vale (o limite é a favor do arquivo)', () => {
    expect(lerManifesto({ eventos: { a: [{ ...bom, duracaoMs: 10_000 }] } })!.eventos['a']).toHaveLength(1);
  });

  it('um evento que não é lista é ignorado sem derrubar os outros', () => {
    const m = lerManifesto({ eventos: { ruim: 'texto', tambemRuim: { a: 1 }, a: [bom] } })!;
    expect(Object.keys(m.eventos)).toEqual(['a']);
  });

  it('evento sem nenhuma variação boa some', () => {
    expect(lerManifesto({ eventos: { a: [{ ...bom, ganho: 0 }] } })!.eventos).toEqual({});
  });

  it('forma geral errada devolve null', () => {
    for (const ruim of [null, 3, 'x', [], {}, { eventos: [] }, { eventos: 'a' }]) expect(lerManifesto(ruim)).toBeNull();
  });

});

describe('formatoPreferido', () => {
  it('ogg quando o navegador toca, mp3 quando não', () => {
    expect(formatoPreferido(true)).toBe('ogg');
    expect(formatoPreferido(false)).toBe('mp3');
  });
});

describe('escolherVariacao', () => {
  const quatro = [variacao('v1', [0, 0.3]), variacao('v2', [0.3, 0.55]), variacao('v3', [0.55, 0.8]), variacao('v4', [0.8, 1])];
  const FOLGA = 0.15;
  const escolher = (intensidade: number, ultima: string | null, sorteio: number, variacoes = quatro) =>
    escolherVariacao(variacoes, intensidade, ultima, () => sorteio, FOLGA).id;

  it('com a intensidade bem dentro de uma faixa e as vizinhas longe, é a daquela faixa, qualquer que seja o sorteio', () => {
    for (const sorteio of [0, 0.2, 0.5, 0.9999]) {
      expect(escolher(0.05, null, sorteio)).toBe('v1');
      expect(escolher(0.97, null, sorteio)).toBe('v4');
    }
  });

  it('a que tem a intensidade na faixa pesa mais que a vizinha (1 contra no máximo 0,5)', () => {
    // 0,40: v2 contém (peso 1); v1 a 0,10 (peso 0,5·(1−0,10/0,15)=0,167); v3 a 0,15 (fora da folga: 0).
    // Total 1,167; v1 ocupa o começo [0, 0,167), v2 o resto.
    expect(escolher(0.4, null, 0)).toBe('v1');
    expect(escolher(0.4, null, 0.14)).toBe('v1');
    expect(escolher(0.4, null, 0.15)).toBe('v2');
    expect(escolher(0.4, null, 0.99)).toBe('v2');
  });

  it('não repete a última quando há outra possível: dois choques seguidos de mesma força não soam iguais', () => {
    expect(escolher(0.4, 'v2', 0.99)).toBe('v1');
    expect(escolher(0.4, 'v1', 0)).toBe('v2');
  });

  it('só uma possível: toca ela mesmo repetida', () => {
    expect(escolher(0.05, 'v1', 0.5)).toBe('v1');
    expect(escolherVariacao([variacao('unica', null)], 0.7, 'unica', () => 0.3, FOLGA).id).toBe('unica');
  });

  it('na borda entre duas faixas as duas valem (peso 1 cada): o sorteio decide e a última sai', () => {
    expect(escolher(0.3, null, 0.1)).toBe('v1');
    expect(escolher(0.3, null, 0.9)).toBe('v2');
    expect(escolher(0.3, 'v1', 0.1)).toBe('v2');
    expect(escolher(0.3, 'v2', 0.9)).toBe('v1');
  });

  it('sem faixa (som de interface) vale para qualquer intensidade, com peso cheio, e ganha de uma variação com faixa longe', () => {
    const mistas = [variacao('com-faixa', [0, 0.1]), variacao('sem-faixa', null)];
    expect(escolherVariacao(mistas, 0.9, null, () => 0, FOLGA).id).toBe('sem-faixa');
    expect(escolherVariacao(mistas, 0.9, null, () => 0.99, FOLGA).id).toBe('sem-faixa');
  });

  it('a variação a exatamente `folga` de distância não entra: a única candidata, mesmo repetida, é a que toca', () => {
    const duas = [variacao('perto', [0, 0.5]), variacao('no-limite', [0.75, 1])];
    // intensidade 0,5: "perto" contém; "no-limite" está a 0,25 = folga (números exatos em binário: peso 0, fora)
    expect(escolherVariacao(duas, 0.5, 'perto', () => 0.5, 0.25).id).toBe('perto');
    expect(escolherVariacao(duas, 0.5, null, () => 0.99, 0.25).id).toBe('perto');
  });

  it('o sorteio exatamente no meio de duas de mesmo peso cai na segunda (o intervalo é [0, 0,5) e [0,5, 1))', () => {
    expect(escolher(0.3, null, 0.5)).toBe('v2');
    expect(escolher(0.3, null, 0.4999)).toBe('v1');
  });

  it('com a folga em zero só vale a faixa exata', () => {
    expect(escolherVariacao(quatro, 0.4, null, () => 0, 0).id).toBe('v2');
  });

  it('sem nenhuma na folga (faixas com buraco), a mais próxima', () => {
    const buraco = [variacao('baixa', [0, 0.1]), variacao('alta', [0.9, 1])];
    expect(escolherVariacao(buraco, 0.4, null, () => 0.5, 0.05).id).toBe('baixa');
    expect(escolherVariacao(buraco, 0.7, null, () => 0.5, 0.05).id).toBe('alta');
  });

  it('intensidade inválida cai no meio e fora de 0–1 é cortada', () => {
    expect(escolherVariacao(quatro, Number.NaN, null, () => 0.9, 0.001).id).toBe('v2');
    expect(escolherVariacao(quatro, 9, null, () => 0.5, FOLGA).id).toBe('v4');
    expect(escolherVariacao(quatro, -3, null, () => 0.5, FOLGA).id).toBe('v1');
  });

  it('sorteio fora de [0, 1) não estoura o índice', () => {
    expect(escolher(0.3, null, 1)).toBe('v2');
    expect(escolher(0.3, null, 7)).toBe('v2');
    expect(escolher(0.3, null, -2)).toBe('v1');
  });

  it('lista vazia é erro de quem chama', () => {
    expect(() => escolherVariacao([], 0.5, null, () => 0, FOLGA)).toThrow(RangeError);
  });

  it('com sorteio de verdade, uma sequência de choques de mesma força usa mais de uma variação e nunca repete em fila', () => {
    let semente = 12345;
    const sortear = (): number => {
      semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0;
      return semente / 2 ** 32;
    };
    let ultima: string | null = null;
    const usadas = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const v: VariacaoDoManifesto = escolherVariacao(quatro, 0.3, ultima, sortear, FOLGA);
      expect(v.id).not.toBe(ultima);
      usadas.add(v.id);
      ultima = v.id;
    }
    expect(usadas.size).toBeGreaterThanOrEqual(2);
  });
});

describe('taxaDeReproducao', () => {
  it('sem sorteio (0,5) e tom 1, a amostra toca na velocidade dela', () => {
    expect(taxaDeReproducao(1, 0.5, CFG)).toBe(1);
  });

  it('o tom do pedido só entra em parte (fatorTom): impacto forte sobe um pouco, fraco desce um pouco', () => {
    expect(taxaDeReproducao(1.15, 0.5, CFG)).toBeCloseTo(1 + 0.15 * CFG.fatorTom, 9);
    expect(taxaDeReproducao(0.9, 0.5, CFG)).toBeCloseTo(1 - 0.1 * CFG.fatorTom, 9);
  });

  it('o sorteio varia ± variacaoDeTaxa', () => {
    expect(taxaDeReproducao(1, 0, CFG)).toBeCloseTo(1 - CFG.variacaoDeTaxa, 9);
    expect(taxaDeReproducao(1, 1, CFG)).toBeCloseTo(1 + CFG.variacaoDeTaxa, 9);
  });

  it('é "leve": nas pontas fica a menos de 10% da velocidade original', () => {
    expect(taxaDeReproducao(CONFIG_WEB.audio.tomMax, 1, CFG)).toBeLessThan(1.1);
    expect(taxaDeReproducao(CONFIG_WEB.audio.tomMin, 0, CFG)).toBeGreaterThan(0.9);
  });

  it('nunca sai de 0,5 a 2 (tom absurdo não vira um som irreconhecível)', () => {
    expect(taxaDeReproducao(100, 1, { fatorTom: 1, variacaoDeTaxa: 0.5 })).toBe(2);
    expect(taxaDeReproducao(-100, 0, { fatorTom: 1, variacaoDeTaxa: 0.5 })).toBe(0.5);
  });
});

// ------------------------------------------------------------------ banco

function bufferFalso(duration: number): AudioBuffer {
  return { duration } as unknown as AudioBuffer;
}

const MANIFESTO_PEQUENO = {
  eventos: {
    'bola-bola': [
      { id: 'bb-1', ogg: 'bb-1.ogg', mp3: 'bb-1.mp3', ganho: 0.5, duracaoMs: 100, intensidade: [0, 0.5] },
      { id: 'bb-2', ogg: 'bb-2.ogg', mp3: 'bb-2.mp3', ganho: 1, duracaoMs: 200, intensidade: [0.5, 1] },
    ],
    'vez-sua': [{ id: 'vs', ogg: 'vs.ogg', mp3: 'vs.mp3', ganho: 0.5, duracaoMs: 800 }],
  },
};

function banco(opcoes: { formato?: 'ogg' | 'mp3'; falhar?: (url: string) => boolean; manifesto?: () => Promise<unknown> } = {}) {
  const pedidos: string[] = [];
  const avisos: string[] = [];
  const deps: DependenciasDoBanco = {
    urlDoManifesto: '/sons/manifesto.json',
    formato: opcoes.formato ?? 'ogg',
    buscarJson: opcoes.manifesto ?? (async () => MANIFESTO_PEQUENO),
    buscarBytes: async (url) => {
      pedidos.push(url);
      if (opcoes.falhar?.(url)) throw new Error('404');
      return new ArrayBuffer(8);
    },
    decodificar: async () => bufferFalso(0.2),
    aviso: (texto) => avisos.push(texto),
  };
  return { banco: new BancoDeAmostras(deps), pedidos, avisos };
}

describe('BancoDeAmostras', () => {
  it('começa ocioso e vazio; carregar busca todos os arquivos do formato escolhido e fica pronto', async () => {
    const { banco: b, pedidos } = banco();
    expect(b.estado).toBe('ocioso');
    expect(b.doEvento('bola-bola')).toEqual([]);
    await b.carregar();
    expect(b.estado).toBe('pronto');
    expect(pedidos.sort()).toEqual(['/sons/bb-1.ogg', '/sons/bb-2.ogg', '/sons/vs.ogg']);
    expect(b.doEvento('bola-bola').map((p) => p.variacao.id)).toEqual(['bb-1', 'bb-2']);
    expect(b.quantasProntas).toBe(3);
    expect(b.arquivosComFalha).toBe(0);
  });

  it('no navegador sem Vorbis busca o mp3', async () => {
    const { banco: b, pedidos } = banco({ formato: 'mp3' });
    await b.carregar();
    expect(pedidos.sort()).toEqual(['/sons/bb-1.mp3', '/sons/bb-2.mp3', '/sons/vs.mp3']);
  });

  it('é idempotente: carregar de novo não busca nada de novo', async () => {
    const { banco: b, pedidos } = banco();
    const a = b.carregar();
    expect(b.estado).toBe('carregando');
    await Promise.all([a, b.carregar()]);
    await b.carregar();
    expect(pedidos).toHaveLength(3);
  });

  it('o arquivo que falha fica de fora e o resto vale; o aviso diz qual', async () => {
    const { banco: b, avisos } = banco({ falhar: (url) => url.endsWith('bb-1.ogg') });
    await b.carregar();
    expect(b.estado).toBe('pronto');
    expect(b.doEvento('bola-bola').map((p) => p.variacao.id)).toEqual(['bb-2']);
    expect(b.arquivosComFalha).toBe(1);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('bb-1');
  });

  it('decodificação que falha (arquivo corrompido) é tratada como arquivo que falhou', async () => {
    const b = new BancoDeAmostras({
      urlDoManifesto: '/sons/manifesto.json',
      formato: 'ogg',
      buscarJson: async () => MANIFESTO_PEQUENO,
      buscarBytes: async () => new ArrayBuffer(8),
      decodificar: async () => {
        throw new Error('EncodingError');
      },
    });
    await b.carregar();
    expect(b.estado).toBe('falhou');
    expect(b.arquivosComFalha).toBe(3);
    expect(b.doEvento('bola-bola')).toEqual([]);
  });

  it('todos os arquivos falhando deixa o estado "falhou", sem lançar', async () => {
    const { banco: b } = banco({ falhar: () => true });
    await expect(b.carregar()).resolves.toBeUndefined();
    expect(b.estado).toBe('falhou');
    expect(b.quantasProntas).toBe(0);
  });

  it('manifesto que não vem (rede) ou vem malformado deixa o estado "falhou", sem lançar, com aviso', async () => {
    const semRede = banco({
      manifesto: async () => {
        throw new Error('offline');
      },
    });
    await expect(semRede.banco.carregar()).resolves.toBeUndefined();
    expect(semRede.banco.estado).toBe('falhou');
    expect(semRede.avisos[0]).toContain('manifesto');
    expect(semRede.pedidos).toEqual([]);

    const lixo = banco({ manifesto: async () => 'não sou um manifesto' });
    await lixo.banco.carregar();
    expect(lixo.banco.estado).toBe('falhou');
  });

  it('os arquivos ficam na pasta do manifesto, seja qual for a raiz do site', async () => {
    const pedidos: string[] = [];
    const b = new BancoDeAmostras({
      urlDoManifesto: '/jogo/sons/manifesto.json',
      formato: 'ogg',
      buscarJson: async () => MANIFESTO_PEQUENO,
      buscarBytes: async (url) => {
        pedidos.push(url);
        return new ArrayBuffer(8);
      },
      decodificar: async () => bufferFalso(0.2),
    });
    await b.carregar();
    expect(pedidos.sort()).toEqual(['/jogo/sons/bb-1.ogg', '/jogo/sons/bb-2.ogg', '/jogo/sons/vs.ogg']);
  });
});

// ------------------------------------------------------------------ gerador de amostras

interface NoFalso {
  readonly tipo: string;
  readonly props: Record<string, unknown>;
  readonly ligadoA: NoFalso[];
  desligado: boolean;
}

function contextoFalso() {
  const nos: NoFalso[] = [];
  const iniciadas: { buffer: unknown; taxa: number; quando: number }[] = [];
  const paradas: number[] = [];
  const rampas: { quando: number; valor: number }[] = [];
  const ctx = {
    currentTime: 3,
    createBufferSource() {
      const no: NoFalso & Record<string, unknown> = {
        tipo: 'fonte',
        props: {},
        ligadoA: [],
        desligado: false,
        buffer: null,
        playbackRate: { value: 1 },
        onended: null,
        connect(alvo: NoFalso) {
          no.ligadoA.push(alvo);
        },
        disconnect() {
          no.desligado = true;
        },
        start(quando: number) {
          iniciadas.push({ buffer: no['buffer'], taxa: (no['playbackRate'] as { value: number }).value, quando });
        },
        stop(quando: number) {
          paradas.push(quando);
        },
      };
      nos.push(no);
      return no;
    },
    createGain() {
      const no: NoFalso & Record<string, unknown> = {
        tipo: 'ganho',
        props: {},
        ligadoA: [],
        desligado: false,
        gain: {
          value: 1,
          cancelScheduledValues() {},
          setValueAtTime() {},
          linearRampToValueAtTime(valor: number, quando: number) {
            rampas.push({ quando, valor });
          },
        },
        connect(alvo: NoFalso) {
          no.ligadoA.push(alvo);
        },
        disconnect() {
          no.desligado = true;
        },
      };
      nos.push(no);
      return no;
    },
  };
  const destino = { tipo: 'destino', props: {}, ligadoA: [], desligado: false } as NoFalso;
  const saida = { ctx, destino, ruido: null } as unknown as SaidaDeSom;
  return { saida, nos, iniciadas, paradas, rampas, destino };
}

const pedido = (intensidade: number, volume = 0.8, tom = 1): PedidoDeSom => ({ som: 'bola-bola', volume, tom, intensidade });

async function gerador(sorteios: number[] = [0.5, 0.5, 0], cfg = CFG) {
  const { banco: b } = banco();
  await b.carregar();
  let i = 0;
  const sortear = (): number => sorteios[i++ % sorteios.length]!;
  return geradorDeAmostras(b, 'bola-bola', cfg, sortear);
}

describe('geradorDeAmostras', () => {
  it('sem nenhuma amostra pronta do evento não prepara nada (a reserva assume)', async () => {
    const { banco: b } = banco();
    expect(geradorDeAmostras(b, 'bola-bola', CFG, () => 0.5).preparar(pedido(0.5))).toBeNull();
    await b.carregar();
    expect(geradorDeAmostras(b, 'evento-que-nao-existe', CFG, () => 0.5).preparar(pedido(0.5))).toBeNull();
  });

  it('escolhe a variação pela intensidade do pedido e o id vai no som preparado', async () => {
    const g = await gerador([0.5, 0.5, 0]);
    expect(g.preparar(pedido(0.05))!.id).toBe('bb-1');
    const forte = await gerador([0.5, 0.5, 0]);
    expect(forte.preparar(pedido(0.95))!.id).toBe('bb-2');
  });

  it('não repete a mesma variação em dois pedidos seguidos quando há outra perto', async () => {
    const g = await gerador([0.0, 0.5, 0]);
    const a = g.preparar(pedido(0.5))!.id;
    const b = g.preparar(pedido(0.5))!.id;
    expect(a).not.toBe(b);
  });

  it('a duração (para o limite de vozes) é a do arquivo na velocidade de reprodução, mais o atraso', async () => {
    const g = await gerador([0.5, 0.5, 1]);
    const som = g.preparar(pedido(0.05, 0.8, 1.15))!;
    const taxa = taxaDeReproducao(1.15, 0.5, CFG);
    expect(som.duracaoS).toBeCloseTo(0.2 / taxa + CFG.atrasoMaxMs / 1000, 9);
  });

  it('toca com ganho do arquivo × ganho geral × volume do pedido, na velocidade e no instante pedidos (mais o atraso sorteado)', async () => {
    const g = await gerador([0.5, 0.5, 1]);
    const { saida, nos, iniciadas, destino } = contextoFalso();
    g.preparar(pedido(0.05, 0.8, 1.15))!.tocar(saida, 10);
    const ganho = nos.find((n) => n.tipo === 'ganho') as unknown as { gain: { value: number }; ligadoA: unknown[] };
    expect(ganho.gain.value).toBeCloseTo(0.5 * CFG.ganho * 0.8, 9);
    expect(ganho.ligadoA).toEqual([destino]);
    expect(iniciadas).toHaveLength(1);
    expect(iniciadas[0]!.taxa).toBeCloseTo(taxaDeReproducao(1.15, 0.5, CFG), 9);
    expect(iniciadas[0]!.quando).toBeCloseTo(10 + CFG.atrasoMaxMs / 1000, 9);
    expect((iniciadas[0]!.buffer as { duration: number }).duration).toBe(0.2);
  });

  it('o ganho geral das amostras (config) multiplica o do arquivo e o volume do pedido', async () => {
    const g = await gerador([0.5, 0.5, 0], { ...CFG, ganho: 0.5 });
    const { saida, nos } = contextoFalso();
    g.preparar(pedido(0.05, 0.8))!.tocar(saida, 0);
    const ganho = nos.find((n) => n.tipo === 'ganho') as unknown as { gain: { value: number } };
    expect(ganho.gain.value).toBeCloseTo(0.5 * 0.5 * 0.8, 9);
  });

  it('a fonte liga no ganho e o ganho no destino; ao terminar tudo é desligado (sem vazar nós)', async () => {
    const g = await gerador();
    const { saida, nos } = contextoFalso();
    g.preparar(pedido(0.05))!.tocar(saida, 0);
    const fonte = nos.find((n) => n.tipo === 'fonte') as unknown as NoFalso & { onended: () => void };
    const ganho = nos.find((n) => n.tipo === 'ganho')!;
    expect(fonte.ligadoA).toEqual([ganho]);
    fonte.onended();
    expect(fonte.desligado).toBe(true);
    expect(ganho.desligado).toBe(true);
  });

  it('o corte antecipado faz o ganho cair a zero em poucos ms e para a fonte', async () => {
    const g = await gerador();
    const { saida, paradas, rampas } = contextoFalso();
    const parar = g.preparar(pedido(0.05))!.tocar(saida, 0);
    parar();
    expect(rampas).toHaveLength(1);
    expect(rampas[0]!.valor).toBe(0);
    expect(rampas[0]!.quando).toBeGreaterThan(3);
    expect(rampas[0]!.quando).toBeLessThan(3.02);
    expect(paradas).toEqual([rampas[0]!.quando]);
  });

  it('o corte de uma fonte que já parou sozinha não estoura', async () => {
    const g = await gerador();
    const { saida } = contextoFalso();
    const contexto = saida.ctx as unknown as { createBufferSource: () => { stop: () => void } };
    const original = contexto.createBufferSource.bind(contexto);
    contexto.createBufferSource = () => {
      const f = original();
      f.stop = () => {
        throw new Error('InvalidStateError');
      };
      return f;
    };
    const parar = g.preparar(pedido(0.05))!.tocar(saida, 0);
    expect(() => parar()).not.toThrow();
  });
});

describe('comReserva', () => {
  const som = (id: string) => ({ id, duracaoS: 1, tocar: () => () => {} });
  const com = (id: string): Gerador => ({ preparar: () => som(id) });
  const sem: Gerador = { preparar: () => null };

  it('toca a amostra quando ela tem o som', () => {
    expect(comReserva(com('amostra'), com('reserva')).preparar(pedido(0.5))!.id).toBe('amostra');
  });

  it('cai na reserva quando a amostra não carregou', () => {
    expect(comReserva(sem, com('reserva')).preparar(pedido(0.5))!.id).toBe('reserva');
  });

  it('sem os dois, nada', () => {
    expect(comReserva(sem, sem).preparar(pedido(0.5))).toBeNull();
  });

  it('a reserva só é consultada se preciso', () => {
    let consultas = 0;
    const reserva: Gerador = {
      preparar: () => {
        consultas++;
        return som('reserva');
      },
    };
    comReserva(com('amostra'), reserva).preparar(pedido(0.5));
    expect(consultas).toBe(0);
  });
});
