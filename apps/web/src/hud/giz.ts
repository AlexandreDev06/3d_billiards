export interface HudGiz {
  /** De quem é o giz mostrado (o jogador da vez). */
  definirDono(nome: string): void;
  /** Só mexe no DOM quando o percentual ou o estado de "passando" muda. */
  atualizar(nivel: number, passando: boolean): void;
  dispose(): void;
}

/** `limiteBaixo`: abaixo desse nível (0–1) a barra fica em alerta e aparece a dica da tecla G. */
export function criarHudGiz(pai: HTMLElement, limiteBaixo: number): HudGiz {
  const raiz = document.createElement('div');
  raiz.className = 'hud-giz';
  raiz.innerHTML =
    '<span class="hud-giz-rotulo">Giz</span>' +
    '<div class="hud-giz-barra"><div class="hud-giz-nivel"></div></div>' +
    '<span class="hud-giz-valor"></span>' +
    '<span class="hud-giz-dica"><kbd class="hud-tecla">G</kbd> passa o giz (segure para encadear)</span>';
  pai.append(raiz);

  const nivelEl = raiz.querySelector<HTMLElement>('.hud-giz-nivel')!;
  const valorEl = raiz.querySelector<HTMLElement>('.hud-giz-valor')!;
  const rotuloEl = raiz.querySelector<HTMLElement>('.hud-giz-rotulo')!;
  let ultimoPercentual = -1;
  let ultimoPassando: boolean | null = null;
  let ultimoBaixo: boolean | null = null;

  return {
    definirDono(nome) {
      rotuloEl.textContent = nome === '' ? 'Giz' : `Giz de ${nome}`;
    },
    atualizar(nivel, passando) {
      const percentual = Math.round(nivel * 100);
      if (percentual !== ultimoPercentual) {
        ultimoPercentual = percentual;
        nivelEl.style.width = `${percentual}%`;
        valorEl.textContent = `${percentual}%`;
      }
      const baixo = nivel < limiteBaixo;
      if (baixo !== ultimoBaixo) {
        ultimoBaixo = baixo;
        raiz.classList.toggle('baixo', baixo);
      }
      if (passando !== ultimoPassando) {
        ultimoPassando = passando;
        raiz.classList.toggle('passando', passando);
      }
    },
    dispose() {
      raiz.remove();
    },
  };
}
