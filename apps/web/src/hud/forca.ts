import { modeloDaForca } from './forca-modelo';

export interface HudForca {
  /**
   * Mostra a barra com a fração puxada (0 a 1) ou a esconde. Só mexe no DOM quando o percentual, a visibilidade ou o
   * estado "cancela" mudam.
   */
  atualizar(fracao: number, visivel: boolean): void;
  /** O que está na tela agora (para o gancho de teste). */
  estado(): { readonly visivel: boolean; readonly percentual: number; readonly cancela: boolean; readonly dica: string };
  dispose(): void;
}

/**
 * A barra da força pela linha: embaixo no meio, com marcas nas frações de `marcas` (25%, 50%, 75%, 100%) e um traço no
 * mínimo (`minima`, abaixo dele soltar cancela). Aparece só enquanto o botão está segurado.
 */
export function criarHudForca(pai: HTMLElement, marcas: readonly number[], minima: number): HudForca {
  const raiz = document.createElement('div');
  raiz.className = 'hud-forca';
  raiz.hidden = true;
  raiz.setAttribute('role', 'progressbar');
  raiz.setAttribute('aria-label', 'Força da tacada');
  raiz.setAttribute('aria-valuemin', '0');
  raiz.setAttribute('aria-valuemax', '100');
  raiz.innerHTML =
    '<div class="hud-forca-topo"><span class="hud-forca-rotulo">Força</span><span class="hud-forca-dica"></span><span class="hud-forca-valor">0%</span></div>' +
    '<div class="hud-forca-barra"><div class="hud-forca-vazio"></div><div class="hud-forca-minimo"></div></div>' +
    '<div class="hud-forca-marcas"></div>';
  pai.append(raiz);

  const barra = raiz.querySelector<HTMLElement>('.hud-forca-barra')!;
  const vazio = raiz.querySelector<HTMLElement>('.hud-forca-vazio')!;
  const traco = raiz.querySelector<HTMLElement>('.hud-forca-minimo')!;
  const dicaEl = raiz.querySelector<HTMLElement>('.hud-forca-dica')!;
  const valorEl = raiz.querySelector<HTMLElement>('.hud-forca-valor')!;
  const marcasEl = raiz.querySelector<HTMLElement>('.hud-forca-marcas')!;
  traco.style.left = `${minima * 100}%`;
  for (const marca of marcas) {
    const risco = document.createElement('span');
    risco.className = 'hud-forca-risco';
    risco.style.left = `${marca * 100}%`;
    barra.append(risco);
    const rotulo = document.createElement('span');
    rotulo.className = 'hud-forca-numero';
    rotulo.style.left = `${marca * 100}%`;
    rotulo.textContent = String(Math.round(marca * 100));
    marcasEl.append(rotulo);
  }

  let ultimoPercentual = -1;
  let ultimoCancela: boolean | null = null;
  let ultimaDica = '';
  let visivelAgora = false;

  return {
    atualizar(fracao, visivel) {
      if (visivel !== visivelAgora) {
        visivelAgora = visivel;
        raiz.hidden = !visivel;
      }
      if (!visivel) return;
      const m = modeloDaForca(fracao, minima);
      if (m.percentual !== ultimoPercentual) {
        ultimoPercentual = m.percentual;
        vazio.style.width = `${100 - m.percentual}%`;
        valorEl.textContent = `${m.percentual}%`;
        raiz.setAttribute('aria-valuenow', String(m.percentual));
      }
      if (m.cancela !== ultimoCancela) {
        ultimoCancela = m.cancela;
        raiz.classList.toggle('cancela', m.cancela);
      }
      if (m.dica !== ultimaDica) {
        ultimaDica = m.dica;
        dicaEl.textContent = m.dica;
      }
    },
    estado: () => ({ visivel: visivelAgora, percentual: Math.max(ultimoPercentual, 0), cancela: ultimoCancela === true, dica: ultimaDica }),
    dispose() {
      raiz.remove();
    },
  };
}
