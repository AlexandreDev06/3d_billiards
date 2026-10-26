export interface ControleDeAudio {
  readonly volume: number;
  readonly mudo: boolean;
  definirVolume(valor: number): void;
  definirMudo(mudo: boolean): void;
  alternarMudo(): void;
  aoMudar(ouvinte: (volume: number, mudo: boolean) => void): () => void;
}

export interface HudAudio {
  dispose(): void;
}

const ICONE =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
  '<path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/>' +
  '<path class="onda" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
  '<path class="corte" d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
  '</svg>';

/** Botão de mudo (tecla M) e volume geral. */
export function criarHudAudio(pai: HTMLElement, audio: ControleDeAudio): HudAudio {
  const raiz = document.createElement('div');
  raiz.className = 'hud-audio';
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'hud-botao hud-audio-botao';
  botao.innerHTML = ICONE;
  const volume = document.createElement('input');
  volume.type = 'range';
  volume.className = 'hud-audio-volume';
  volume.name = 'volume';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.05';
  volume.setAttribute('aria-label', 'Volume geral');
  const tecla = document.createElement('kbd');
  tecla.className = 'hud-tecla';
  tecla.textContent = 'M';
  raiz.append(botao, volume, tecla);
  pai.append(raiz);

  const sincronizar = (nivel: number, mudo: boolean): void => {
    volume.value = String(nivel);
    volume.style.setProperty('--nivel', `${Math.round((mudo ? 0 : nivel) * 100)}%`);
    raiz.classList.toggle('mudo', mudo || nivel === 0);
    botao.setAttribute('aria-pressed', String(mudo));
    botao.setAttribute('aria-label', mudo ? 'Ligar o som' : 'Silenciar');
    botao.title = mudo ? 'Ligar o som (M)' : 'Silenciar (M)';
  };

  const aoClicar = (): void => {
    audio.alternarMudo();
    botao.blur();
  };
  const aoArrastar = (): void => {
    const nivel = Number(volume.value);
    if (audio.mudo && nivel > 0) audio.definirMudo(false);
    audio.definirVolume(nivel);
  };
  const aoSoltar = (): void => volume.blur();
  botao.addEventListener('click', aoClicar);
  volume.addEventListener('input', aoArrastar);
  volume.addEventListener('change', aoSoltar);
  const parar = audio.aoMudar(sincronizar);
  sincronizar(audio.volume, audio.mudo);

  return {
    dispose() {
      parar();
      botao.removeEventListener('click', aoClicar);
      volume.removeEventListener('input', aoArrastar);
      volume.removeEventListener('change', aoSoltar);
      raiz.remove();
    },
  };
}
