import { TELA_SEM_WEBGL } from './sem-webgl-modelo';

export interface TelaSemWebgl {
  dispose(): void;
}

/**
 * A tela de "o 3D não abriu", sobre a página: só DOM, sem three. Sem a mesa não se joga (nem o menu online serve), então ela
 * ocupa o lugar do jogo; "Tentar de novo" recarrega a página.
 */
export function criarTelaSemWebgl(pai: HTMLElement, aoTentarDeNovo: () => void): TelaSemWebgl {
  const raiz = document.createElement('div');
  raiz.className = 'menu sem-webgl';
  raiz.setAttribute('role', 'alert');
  const caixa = document.createElement('div');
  caixa.className = 'menu-caixa sem-webgl-caixa';
  const titulo = document.createElement('h1');
  titulo.className = 'menu-titulo sem-webgl-titulo';
  titulo.textContent = TELA_SEM_WEBGL.titulo;
  const explicacao = document.createElement('p');
  explicacao.className = 'sem-webgl-explicacao';
  explicacao.textContent = TELA_SEM_WEBGL.explicacao;
  const dicas = document.createElement('ul');
  dicas.className = 'sem-webgl-dicas';
  for (const texto of TELA_SEM_WEBGL.dicas) {
    const item = document.createElement('li');
    item.textContent = texto;
    dicas.append(item);
  }
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'menu-botao principal';
  botao.textContent = TELA_SEM_WEBGL.botao;
  botao.addEventListener('click', aoTentarDeNovo);
  const acoes = document.createElement('div');
  acoes.className = 'menu-acoes sem-webgl-acoes';
  acoes.append(botao);
  caixa.append(titulo, explicacao, dicas, acoes);
  raiz.append(caixa);
  pai.append(raiz);
  botao.focus();
  return {
    dispose() {
      botao.removeEventListener('click', aoTentarDeNovo);
      raiz.remove();
    },
  };
}
