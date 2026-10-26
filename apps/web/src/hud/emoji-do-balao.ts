import { quadroDaSubida, type SubidasDeEmojis } from '../baloes/subida-de-emojis';

/** Onde o balão está na tela (px): o meio do topo dele e a altura que ele ocupa. */
export interface AncoraDoEmoji {
  readonly x: number;
  readonly y: number;
  readonly altura: number;
}

export interface CamadaDeEmojisDoBalao {
  /** Põe na tela os emojis no ar acima da `ancora` (null: o balão não está à vista, nada aparece). Barato com a camada vazia. */
  atualizar(subidas: SubidasDeEmojis, agoraMs: number, ancora: AncoraDoEmoji | null): void;
  /** O que está desenhado agora (para o gancho de teste). */
  estado(): readonly { readonly emoji: string; readonly x: number; readonly y: number; readonly opacidade: number }[];
  dispose(): void;
}

/** O tamanho do emoji em relação à altura do balão na tela, e os limites (px). */
const FRACAO_DA_ALTURA = 0.5;
const MINIMO_PX = 22;
const MAXIMO_PX = 64;
/** O emoji nunca sobe para mais perto que isto do alto da tela (px): lá em cima moram o relógio e as pílulas. */
const MARGEM_DO_TOPO = 56;

/**
 * Os emojis que o dono do balão manda sobem do topo do balão, com um estouro ao nascer e um fade ao sumir, além da bolha do alto
 * da tela. Uma camada fixa por cima do jogo, sem pegar o mouse; os elementos são reaproveitados (nada cria nó por quadro).
 */
export function criarCamadaDeEmojisDoBalao(pai: HTMLElement, quantos = 4): CamadaDeEmojisDoBalao {
  const camada = document.createElement('div');
  camada.className = 'emojis-do-balao';
  camada.setAttribute('aria-hidden', 'true');
  const elementos = Array.from({ length: quantos }, () => {
    const e = document.createElement('span');
    e.className = 'emoji-do-balao';
    e.hidden = true;
    camada.append(e);
    return e;
  });
  pai.append(camada);
  const desenhados: { emoji: string; x: number; y: number; opacidade: number }[] = [];
  let algumVisivel = false;

  const esconder = (): void => {
    for (const e of elementos) e.hidden = true;
    algumVisivel = false;
    desenhados.length = 0;
  };

  return {
    atualizar(subidas, agoraMs, ancora) {
      const vivos = subidas.vivos(agoraMs);
      if (ancora === null || vivos.length === 0) {
        if (algumVisivel) esconder();
        return;
      }
      algumVisivel = true;
      desenhados.length = 0;
      const tamanho = Math.min(Math.max(ancora.altura * FRACAO_DA_ALTURA, MINIMO_PX), MAXIMO_PX);
      // Balão colado no alto da tela: o emoji nasce mais embaixo (dentro do balão) e sobe só até onde há lugar.
      const teto = MARGEM_DO_TOPO + tamanho;
      const yInicio = Math.max(ancora.y, teto + 0.45 * ancora.altura);
      const subida = Math.max(Math.min(subidas.opcoes.subida * ancora.altura, yInicio - teto), 0);
      elementos.forEach((e, i) => {
        const item = vivos[i];
        if (!item) {
          e.hidden = true;
          return;
        }
        const q = quadroDaSubida(subidas.progressoDe(item, agoraMs), subidas.opcoes);
        const x = ancora.x + (i - (vivos.length - 1) / 2) * tamanho * 0.35;
        const y = yInicio - (q.altura / subidas.opcoes.subida) * subida;
        if (e.textContent !== item.emoji) e.textContent = item.emoji;
        e.hidden = false;
        e.style.fontSize = `${tamanho.toFixed(0)}px`;
        e.style.opacity = q.opacidade.toFixed(3);
        e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${q.escala.toFixed(3)})`;
        desenhados.push({ emoji: item.emoji, x, y, opacidade: q.opacidade });
      });
    },
    estado: () => desenhados.map((d) => ({ ...d })),
    dispose() {
      camada.remove();
    },
  };
}
