const TAMANHO = 128;
const MARGEM = 8;
const TOLERANCIA = 1e-4;

export interface MiniBolao {
  /** `limite`: raio do círculo seguro (fração do raio da bola). Só redesenha se algo mudou. */
  atualizar(lateral: number, vertical: number, limite: number): void;
  dispose(): void;
}

export function criarMiniBolao(pai: HTMLElement): MiniBolao {
  const canvas = document.createElement('canvas');
  canvas.className = 'hud-minibolao';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Ponto de contato do taco na bola');
  const escala = window.devicePixelRatio || 1;
  canvas.width = TAMANHO * escala;
  canvas.height = TAMANHO * escala;
  canvas.style.width = `${TAMANHO}px`;
  canvas.style.height = `${TAMANHO}px`;
  pai.append(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2D indisponível');
  const centro = TAMANHO / 2;
  const raioBola = centro - MARGEM;
  let ultimoLateral = NaN;
  let ultimoVertical = NaN;
  let ultimoLimite = NaN;

  return {
    atualizar(lateral, vertical, limite) {
      if (
        Math.abs(lateral - ultimoLateral) < TOLERANCIA &&
        Math.abs(vertical - ultimoVertical) < TOLERANCIA &&
        Math.abs(limite - ultimoLimite) < TOLERANCIA
      ) {
        return;
      }
      ultimoLateral = lateral;
      ultimoVertical = vertical;
      ultimoLimite = limite;

      ctx.setTransform(escala, 0, 0, escala, 0, 0);
      ctx.clearRect(0, 0, TAMANHO, TAMANHO);

      ctx.beginPath();
      ctx.arc(centro, centro, raioBola, 0, 2 * Math.PI);
      ctx.fillStyle = '#f4f1e8';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#222';
      ctx.stroke();

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.moveTo(centro - raioBola, centro);
      ctx.lineTo(centro + raioBola, centro);
      ctx.moveTo(centro, centro - raioBola);
      ctx.lineTo(centro, centro + raioBola);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centro, centro, limite * raioBola, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(58,160,255,0.18)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2b82d9';
      ctx.stroke();

      const seguro = Math.hypot(lateral, vertical) <= limite;
      ctx.beginPath();
      ctx.arc(centro + lateral * raioBola, centro - vertical * raioBola, 5, 0, 2 * Math.PI);
      ctx.fillStyle = seguro ? '#d4261c' : '#f26a1b';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    },
    dispose() {
      canvas.remove();
    },
  };
}
