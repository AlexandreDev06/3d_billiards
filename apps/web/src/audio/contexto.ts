import type { Sessao } from './motor-audio';

/** Um segundo de ruído branco, reaproveitado por todos os geradores. */
export function criarRuido(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const dados = buffer.getChannelData(0);
  // Ruído determinístico (LCG): o som da mesma tacada é sempre o mesmo.
  let x = 0x2545f491;
  for (let i = 0; i < dados.length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    dados[i] = x / 0x80000000 - 1;
  }
  return buffer;
}

/** O limitador aceita até ±LIMITE na entrada; acima disso o `tanh` achata sem estalar. */
const LIMITE = 4;

/** Os geradores saem baixos de propósito (a quebra soma muitos); o ganho de saída traz um impacto isolado ao nível de escuta. */
const GANHO_DE_SAIDA = 2.4;

function curvaSuave(): Float32Array<ArrayBuffer> {
  const pontos = 2048;
  const curva = new Float32Array(pontos);
  for (let i = 0; i < pontos; i++) curva[i] = Math.tanh((i / (pontos - 1)) * 2 * LIMITE - LIMITE);
  return curva;
}

/**
 * Cadeia de saída: ganho geral → nível → compressor → limitador suave → destino. A quebra soma
 * dezenas de impactos no mesmo milissegundo; o compressor sozinho reage tarde demais,
 * o `tanh` garante que nada passe de ±1. Devolve a entrada da cadeia (o ganho geral).
 */
export function criarCadeiaDeSaida(ctx: BaseAudioContext): GainNode {
  const geral = ctx.createGain();
  const nivel = ctx.createGain();
  nivel.gain.value = GANHO_DE_SAIDA;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 12;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.12;
  const reduz = ctx.createGain();
  reduz.gain.value = 1 / LIMITE;
  const suave = ctx.createWaveShaper();
  suave.curve = curvaSuave();
  suave.oversample = '2x';
  geral.connect(nivel).connect(compressor).connect(reduz).connect(suave).connect(ctx.destination);
  return geral;
}

/** Abre o `AudioContext` com a cadeia de saída. `null` sem Web Audio. */
export function abrirSessaoReal(): Sessao | null {
  const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Contexto) return null;
  let ctx: AudioContext;
  try {
    ctx = new Contexto({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  const geral = criarCadeiaDeSaida(ctx);
  const ruido = criarRuido(ctx);
  return {
    saida: { ctx, destino: geral, ruido },
    agoraS: () => ctx.currentTime,
    rodando: () => ctx.state === 'running',
    retomar() {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    },
    definirGanho(valor) {
      geral.gain.setTargetAtTime(valor, ctx.currentTime, 0.015);
    },
    fechar() {
      void ctx.close().catch(() => {});
    },
  };
}
