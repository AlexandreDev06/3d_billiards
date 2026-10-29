import type { BaseDoRosto, NivelDeDetalhe } from '@sinuca/personagens/three';
import type { AparenciaDoBalao } from '@sinuca/protocolo';
import { SRGBColorSpace, WebGLRenderer } from 'three';
import type { ConfigBaloes } from '../config';
import { CenaDaPrevia } from './cena-da-previa';
import type { CarregadorDeChapeus } from './chapeus';

export interface PreviaDoBalao {
  /** O elemento que vai na tela (o canvas). */
  readonly elemento: HTMLCanvasElement;
  definirAparencia(a: AparenciaDoBalao): void;
  definirCor(cor: number): void;
  definirReacao(id: string): boolean;
  /** Liga o laço de desenho (só enquanto a prévia está na tela). */
  iniciar(): void;
  parar(): void;
  diagnostico(): ReturnType<CenaDaPrevia['diagnostico']> & { readonly quadros: number };
  dispose(): void;
}

/**
 * A prévia 3D do "Meu balão" (L48): um segundo `WebGLRenderer`, só dela, sobre um canvas do tamanho da caixa. Desenha só enquanto
 * `iniciar` valer (o jogo por baixo pausa com o editor aberto). Arrastar gira o balão; o olhar segue o ponteiro. Os materiais são
 * da instância da prévia, então a qualidade do jogo não a afeta, e a geometria e as texturas são as da base (a mesma do jogo).
 */
export function criarPreviaDoBalao(opcoes: {
  readonly cfg: ConfigBaloes;
  readonly base: BaseDoRosto;
  readonly nivel: NivelDeDetalhe;
  readonly chapeus: CarregadorDeChapeus | null;
  readonly cor: number;
  readonly largura: number;
  readonly altura: number;
}): PreviaDoBalao {
  const canvas = document.createElement('canvas');
  canvas.className = 'meu-balao-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Prévia do seu balão. Arraste para girar.');
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  let larg = opcoes.largura;
  let alt = opcoes.altura;
  const ajustar = (): void => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(larg, alt, false);
  };
  ajustar();
  const cena = new CenaDaPrevia(opcoes.cfg, opcoes.base, opcoes.nivel, opcoes.chapeus, larg / alt, opcoes.cor);

  let laco: number | null = null;
  let anterior = 0;
  let desenhados = 0;
  const desenhar = (agora: number): void => {
    laco = window.requestAnimationFrame(desenhar);
    // O canvas muda de tamanho com a caixa (CSS): acompanha o tamanho de verdade.
    const l = canvas.clientWidth;
    const a = canvas.clientHeight;
    if (l > 0 && a > 0 && (l !== larg || a !== alt)) {
      larg = l;
      alt = a;
      ajustar();
      cena.enquadrar(larg / alt);
    }
    const dt = anterior === 0 ? 0 : (agora - anterior) / 1000;
    anterior = agora;
    cena.atualizar(dt);
    renderer.render(cena.cena, cena.camera);
    desenhados++;
  };

  let arrastando: { id: number; x: number } | null = null;
  const aoApertar = (e: PointerEvent): void => {
    arrastando = { id: e.pointerId, x: e.clientX };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('girando');
  };
  const aoMover = (e: PointerEvent): void => {
    if (arrastando !== null && arrastando.id === e.pointerId) {
      cena.girar(e.clientX - arrastando.x);
      arrastando.x = e.clientX;
    }
    const r = canvas.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) cena.olharPara(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
  };
  const aoSoltar = (e: PointerEvent): void => {
    if (arrastando?.id === e.pointerId) arrastando = null;
    canvas.classList.remove('girando');
  };
  const aoSair = (): void => cena.olharPara(null, null);
  canvas.addEventListener('pointerdown', aoApertar);
  canvas.addEventListener('pointermove', aoMover);
  canvas.addEventListener('pointerup', aoSoltar);
  canvas.addEventListener('pointercancel', aoSoltar);
  canvas.addEventListener('pointerleave', aoSair);

  return {
    elemento: canvas,
    definirAparencia: (a) => cena.definirAparencia(a),
    definirCor: (cor) => cena.definirCor(cor),
    definirReacao: (id) => cena.definirReacao(id),
    iniciar() {
      if (laco !== null) return;
      anterior = 0;
      laco = window.requestAnimationFrame(desenhar);
    },
    parar() {
      if (laco !== null) window.cancelAnimationFrame(laco);
      laco = null;
    },
    diagnostico: () => ({ ...cena.diagnostico(), quadros: desenhados }),
    dispose() {
      if (laco !== null) window.cancelAnimationFrame(laco);
      laco = null;
      canvas.removeEventListener('pointerdown', aoApertar);
      canvas.removeEventListener('pointermove', aoMover);
      canvas.removeEventListener('pointerup', aoSoltar);
      canvas.removeEventListener('pointercancel', aoSoltar);
      canvas.removeEventListener('pointerleave', aoSair);
      cena.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
