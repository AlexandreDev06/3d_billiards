import type { Gerador, Geradores, SaidaDeSom } from './motor-audio';
import type { NomeDoSom, PedidoDeSom } from './mapeamento';

/** Ataque curtíssimo para não estalar; o resto do envelope cai exponencialmente. */
const ATAQUE_S = 0.001;
const PISO = 0.0001;
const CORTE_S = 0.008;

interface Camada {
  /** Ruído filtrado: frequência do filtro em Hz (já multiplicada pelo tom do pedido). */
  readonly ruido?: { readonly tipo: BiquadFilterType; readonly freq: number; readonly q: number; readonly ganho: number; readonly duracaoS: number };
  /** Senoide que desliza de `de` para `ate` Hz. */
  readonly tons?: readonly { readonly de: number; readonly ate: number; readonly ganho: number; readonly duracaoS: number; readonly tipo?: OscillatorType; readonly atrasoS?: number }[];
}

function envelope(ctx: BaseAudioContext, destino: AudioNode, quandoS: number, pico: number, duracaoS: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, quandoS);
  g.gain.linearRampToValueAtTime(pico, quandoS + ATAQUE_S);
  g.gain.exponentialRampToValueAtTime(PISO, quandoS + Math.max(duracaoS, ATAQUE_S * 2));
  g.connect(destino);
  return g;
}

/** Monta um som de camadas (ruído e tons) com o volume do pedido; devolve o corte antecipado. */
function tocarCamadas(saida: SaidaDeSom, pedido: PedidoDeSom, quandoS: number, camadas: Camada): () => void {
  const { ctx, destino, ruido } = saida;
  const fontes: AudioScheduledSourceNode[] = [];
  const ganhos: GainNode[] = [];
  const limpar = (fonte: AudioScheduledSourceNode, ...nos: AudioNode[]): void => {
    fonte.onended = () => {
      fonte.disconnect();
      for (const no of nos) no.disconnect();
    };
  };

  const r = camadas.ruido;
  if (r) {
    const fonte = ctx.createBufferSource();
    fonte.buffer = ruido;
    fonte.loop = true;
    const filtro = ctx.createBiquadFilter();
    filtro.type = r.tipo;
    filtro.frequency.value = r.freq * pedido.tom;
    filtro.Q.value = r.q;
    const g = envelope(ctx, destino, quandoS, r.ganho * pedido.volume, r.duracaoS);
    fonte.connect(filtro).connect(g);
    fonte.start(quandoS);
    fonte.stop(quandoS + r.duracaoS + 0.02);
    limpar(fonte, filtro, g);
    fontes.push(fonte);
    ganhos.push(g);
  }
  for (const t of camadas.tons ?? []) {
    const inicio = quandoS + (t.atrasoS ?? 0);
    const osc = ctx.createOscillator();
    osc.type = t.tipo ?? 'sine';
    osc.frequency.setValueAtTime(t.de * pedido.tom, inicio);
    osc.frequency.exponentialRampToValueAtTime(Math.max(t.ate * pedido.tom, 1), inicio + t.duracaoS);
    const g = envelope(ctx, destino, inicio, t.ganho * pedido.volume, t.duracaoS);
    osc.connect(g);
    osc.start(inicio);
    osc.stop(inicio + t.duracaoS + 0.02);
    limpar(osc, g);
    fontes.push(osc);
    ganhos.push(g);
  }

  return () => {
    const agora = ctx.currentTime;
    for (const g of ganhos) {
      g.gain.cancelScheduledValues(agora);
      g.gain.setValueAtTime(g.gain.value, agora);
      g.gain.linearRampToValueAtTime(0, agora + CORTE_S);
    }
    for (const f of fontes) {
      try {
        f.stop(agora + CORTE_S);
      } catch {
        // já parou sozinha
      }
    }
  };
}

function gerador(som: NomeDoSom, duracaoS: number, camadas: Camada): Gerador {
  const id = `sintetizado:${som}`;
  return { preparar: (pedido) => ({ id, duracaoS, tocar: (saida, quandoS) => tocarCamadas(saida, pedido, quandoS, camadas) }) };
}

/**
 * Sons sintetizados, sem arquivo: um mapa evento → gerador. Depois do L12 são a reserva das amostras CC0
 * (`amostras.ts`): tocam quando o arquivo não carregou.
 */
export const GERADORES_SINTETIZADOS: Geradores = {
  // Ponta de couro no bolão: estalo médio sobre um "toc" grave.
  'taco-bola': gerador('taco-bola', 0.12, {
    ruido: { tipo: 'bandpass', freq: 1900, q: 1.2, ganho: 0.9, duracaoS: 0.035 },
    tons: [{ de: 260, ate: 150, ganho: 0.55, duracaoS: 0.09 }],
  }),
  // O "clac" do marfim: transiente agudo e parciais inarmônicas bem curtas.
  'bola-bola': gerador('bola-bola', 0.16, {
    ruido: { tipo: 'highpass', freq: 3200, q: 0.7, ganho: 0.42, duracaoS: 0.018 },
    tons: [
      { de: 2600, ate: 2300, ganho: 0.35, duracaoS: 0.06 },
      { de: 5400, ate: 5000, ganho: 0.13, duracaoS: 0.03 },
      { de: 900, ate: 700, ganho: 0.18, duracaoS: 0.08 },
    ],
  }),
  // Não há som de tabela livre (§7): batida curta e abafada, passa-baixa.
  'bola-tabela': gerador('bola-tabela', 0.14, {
    ruido: { tipo: 'lowpass', freq: 750, q: 0.8, ganho: 0.8, duracaoS: 0.07 },
    tons: [{ de: 170, ate: 95, ganho: 0.6, duracaoS: 0.1 }],
  }),
  // A bola rolando na boca e caindo no couro: ruído grave que some e um "plof" descendo.
  cacapa: gerador('cacapa', 0.55, {
    ruido: { tipo: 'lowpass', freq: 520, q: 0.6, ganho: 0.5, duracaoS: 0.38 },
    tons: [{ de: 330, ate: 90, ganho: 0.45, duracaoS: 0.28 }],
  }),
  // A vez passou para outro: um tique de madeira macio, bem baixo (não pode competir com a tacada).
  'vez-outro': gerador('vez-outro', 0.12, {
    ruido: { tipo: 'bandpass', freq: 1700, q: 2, ganho: 0.35, duracaoS: 0.025 },
    tons: [{ de: 1650, ate: 1500, ganho: 0.4, duracaoS: 0.09 }],
  }),
  // Chegou a sua vez: um sininho limpo, parciais 1 : 2,4 : 5,4 que se apagam em ~0,6 s.
  'vez-sua': gerador('vez-sua', 0.7, {
    tons: [
      { de: 1320, ate: 1318, ganho: 0.5, duracaoS: 0.65 },
      { de: 3170, ate: 3165, ganho: 0.2, duracaoS: 0.35 },
      { de: 7100, ate: 7090, ganho: 0.07, duracaoS: 0.15 },
    ],
  }),
  // O tempo acabou: duas batidas graves e secas, bem diferentes do sino.
  'tempo-esgotado': gerador('tempo-esgotado', 0.45, {
    ruido: { tipo: 'lowpass', freq: 900, q: 0.8, ganho: 0.35, duracaoS: 0.06 },
    tons: [
      { de: 520, ate: 330, ganho: 0.55, duracaoS: 0.18 },
      { de: 520, ate: 330, ganho: 0.4, duracaoS: 0.18, atrasoS: 0.22 },
    ],
  }),
  // Missão cumprida: moedas caindo, três tinidos agudos e curtos, cada um um pouco mais alto, com o brilho do metal.
  moedas: gerador('moedas', 0.62, {
    tons: [
      { de: 1980, ate: 1975, ganho: 0.32, duracaoS: 0.16 },
      { de: 4650, ate: 4640, ganho: 0.11, duracaoS: 0.08 },
      { de: 2350, ate: 2345, ganho: 0.32, duracaoS: 0.16, atrasoS: 0.09 },
      { de: 5520, ate: 5510, ganho: 0.11, duracaoS: 0.08, atrasoS: 0.09 },
      { de: 2960, ate: 2950, ganho: 0.34, duracaoS: 0.36, atrasoS: 0.18 },
      { de: 6950, ate: 6930, ganho: 0.12, duracaoS: 0.2, atrasoS: 0.18 },
    ],
  }),
};
