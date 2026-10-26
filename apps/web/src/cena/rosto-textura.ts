import { CARAS_DO_BALAO, type CaraDoBalao } from '../baloes/rosto';

/** O lado de cada quadro da imagem das caras (px). */
export const LADO_DO_QUADRO = 160;

const TINTA = '#1c1a26';
const BRANCO = '#fbfbf6';

/** Em que quadro da imagem fica a cara. */
export function quadroDaCara(cara: CaraDoBalao): number {
  return CARAS_DO_BALAO.indexOf(cara);
}

function olhoRedondo(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  g.fillStyle = TINTA;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  // O brilho no olho dá vida ao desenho.
  g.fillStyle = BRANCO;
  g.beginPath();
  g.arc(x + rx * 0.3, y - ry * 0.35, Math.max(rx * 0.32, 2), 0, Math.PI * 2);
  g.fill();
}

function traco(g: CanvasRenderingContext2D, largura: number): void {
  g.strokeStyle = TINTA;
  g.lineWidth = largura;
  g.lineCap = 'round';
  g.lineJoin = 'round';
}

function gota(g: CanvasRenderingContext2D, x: number, y: number, tamanho: number, cor: string): void {
  g.fillStyle = cor;
  g.beginPath();
  g.moveTo(x, y - tamanho * 1.1);
  g.quadraticCurveTo(x + tamanho * 0.9, y, x, y + tamanho * 0.7);
  g.quadraticCurveTo(x - tamanho * 0.9, y, x, y - tamanho * 1.1);
  g.fill();
}

/** Desenha uma cara no quadro cujo canto de cima à esquerda é (`x0`, 0). Só traço e preenchimento, sem sombra: lê bem de longe. */
function desenharCara(g: CanvasRenderingContext2D, cara: CaraDoBalao, x0: number): void {
  const cx = x0 + LADO_DO_QUADRO / 2;
  const cy = LADO_DO_QUADRO / 2;
  g.save();
  switch (cara) {
    case 'neutro': {
      olhoRedondo(g, cx - 30, cy - 10, 9, 12);
      olhoRedondo(g, cx + 30, cy - 10, 9, 12);
      traco(g, 6);
      g.beginPath();
      g.moveTo(cx - 17, cy + 26);
      g.quadraticCurveTo(cx, cy + 38, cx + 17, cy + 26);
      g.stroke();
      break;
    }
    case 'sorriso': {
      traco(g, 7);
      for (const dx of [-30, 30]) {
        g.beginPath();
        g.arc(cx + dx, cy - 6, 11, Math.PI, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = TINTA;
      g.beginPath();
      g.moveTo(cx - 28, cy + 14);
      g.quadraticCurveTo(cx, cy + 62, cx + 28, cy + 14);
      g.closePath();
      g.fill();
      g.fillStyle = '#e8566b';
      g.beginPath();
      g.ellipse(cx, cy + 38, 12, 6, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255, 120, 150, 0.4)';
      for (const dx of [-50, 50]) {
        g.beginPath();
        g.arc(cx + dx, cy + 20, 11, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'susto': {
      for (const dx of [-30, 30]) {
        g.fillStyle = BRANCO;
        g.beginPath();
        g.arc(cx + dx, cy - 8, 17, 0, Math.PI * 2);
        g.fill();
        traco(g, 4);
        g.stroke();
        g.fillStyle = TINTA;
        g.beginPath();
        g.arc(cx + dx, cy - 6, 5, 0, Math.PI * 2);
        g.fill();
      }
      // Sobrancelhas lá em cima.
      traco(g, 5);
      for (const [a, b] of [[-46, -14], [14, 46]] as const) {
        g.beginPath();
        g.moveTo(cx + a, cy - 38 + (a < 0 ? 4 : -4));
        g.quadraticCurveTo(cx + (a + b) / 2, cy - 48, cx + b, cy - 38 + (a < 0 ? -4 : 4));
        g.stroke();
      }
      g.fillStyle = TINTA;
      g.beginPath();
      g.ellipse(cx, cy + 36, 9, 14, 0, 0, Math.PI * 2);
      g.fill();
      gota(g, cx + 58, cy - 30, 9, '#8ccfff');
      break;
    }
    case 'bravo': {
      olhoRedondo(g, cx - 28, cy - 4, 8, 9);
      olhoRedondo(g, cx + 28, cy - 4, 8, 9);
      traco(g, 8);
      g.beginPath();
      g.moveTo(cx - 48, cy - 32);
      g.lineTo(cx - 12, cy - 17);
      g.moveTo(cx + 48, cy - 32);
      g.lineTo(cx + 12, cy - 17);
      g.stroke();
      traco(g, 7);
      g.beginPath();
      g.moveTo(cx - 20, cy + 38);
      g.quadraticCurveTo(cx, cy + 22, cx + 20, cy + 38);
      g.stroke();
      // A veia da raiva, na testa.
      g.strokeStyle = '#d92b2b';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(cx + 40, cy - 52);
      g.lineTo(cx + 52, cy - 52);
      g.moveTo(cx + 46, cy - 60);
      g.lineTo(cx + 46, cy - 46);
      g.stroke();
      break;
    }
    case 'triste': {
      olhoRedondo(g, cx - 30, cy - 4, 9, 12);
      olhoRedondo(g, cx + 30, cy - 4, 9, 12);
      traco(g, 6);
      g.beginPath();
      g.moveTo(cx - 46, cy - 22);
      g.lineTo(cx - 14, cy - 34);
      g.moveTo(cx + 46, cy - 22);
      g.lineTo(cx + 14, cy - 34);
      g.stroke();
      g.beginPath();
      g.moveTo(cx - 17, cy + 36);
      g.quadraticCurveTo(cx, cy + 22, cx + 17, cy + 36);
      g.stroke();
      gota(g, cx - 38, cy + 18, 8, '#8ccfff');
      break;
    }
  }
  g.restore();
}

/** Desenha as caras, uma ao lado da outra na ordem de `CARAS_DO_BALAO`, num contexto 2D de `LADO_DO_QUADRO × n` px. */
export function desenharCaras(g: CanvasRenderingContext2D): void {
  g.clearRect(0, 0, LADO_DO_QUADRO * CARAS_DO_BALAO.length, LADO_DO_QUADRO);
  CARAS_DO_BALAO.forEach((cara, i) => desenharCara(g, cara, i * LADO_DO_QUADRO));
}
