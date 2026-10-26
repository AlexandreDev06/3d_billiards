import { teclaEmCampo } from '../controles/campo';
import { enderecoCurto, type CreditoDeAsset } from './creditos-modelo';

export interface PainelDeCreditos {
  readonly aberto: boolean;
  alternar(): void;
  fechar(): void;
  dispose(): void;
}

export interface OpcoesDoPainelDeCreditos {
  readonly creditos: readonly CreditoDeAsset[];
  /** O painel abriu: solte o mouse (Pointer Lock) para os links poderem ser clicados. */
  readonly aoAbrir: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** A tela de créditos dos sons (e do que mais entrar em `docs/creditos.md`), aberta pelo botão da ajuda. */
export function criarPainelDeCreditos(pai: HTMLElement, opcoes: OpcoesDoPainelDeCreditos): PainelDeCreditos {
  const raiz = el('aside', 'creditos-jogo');
  raiz.hidden = true;
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-label', 'Créditos');

  const cabecalho = el('header', 'creditos-cabecalho');
  const fechar = el('button', 'hud-botao creditos-fechar', '×');
  fechar.type = 'button';
  fechar.setAttribute('aria-label', 'Fechar os créditos');
  cabecalho.append(el('strong', 'creditos-titulo', 'Créditos'), fechar);
  raiz.append(cabecalho, el('p', 'creditos-nota', 'Os sons são gravações de terceiros em domínio público (CC0), do Freesound. Obrigado a quem as compartilhou.'));

  const lista = el('ul', 'creditos-lista');
  for (const c of opcoes.creditos) {
    const item = el('li', 'creditos-item');
    const topo = el('div', 'creditos-topo');
    topo.append(el('strong', 'creditos-autor', c.autor), el('span', 'creditos-licenca', c.licenca));
    item.append(topo);
    if (c.fonte !== null) {
      const link = el('a', 'creditos-link', enderecoCurto(c.fonte));
      link.href = c.fonte;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      item.append(link);
    }
    item.append(el('div', 'creditos-arquivos', c.arquivos.join(', ')));
    lista.append(item);
  }
  raiz.append(lista);
  pai.append(raiz);

  let abertoAgora = false;
  const definirAberto = (aberto: boolean): void => {
    if (aberto === abertoAgora) return;
    abertoAgora = aberto;
    raiz.hidden = !aberto;
    if (aberto) opcoes.aoAbrir();
    else (document.activeElement as HTMLElement | null)?.blur?.();
  };
  const aoFechar = (): void => definirAberto(false);
  fechar.addEventListener('click', aoFechar);
  const aoApertar = (e: KeyboardEvent): void => {
    if (e.code === 'Escape' && abertoAgora && !teclaEmCampo(e.target)) definirAberto(false);
  };
  window.addEventListener('keydown', aoApertar);
  // Clicar fora (na mesa, no menu) é seguir o jogo: o painel se fecha. O botão da ajuda alterna sozinho.
  const aoPressionarFora = (e: PointerEvent): void => {
    if (abertoAgora && !(e.target as Element | null)?.closest?.('.creditos-jogo, .hud-ajuda-creditos')) definirAberto(false);
  };
  window.addEventListener('pointerdown', aoPressionarFora, true);

  return {
    get aberto() {
      return abertoAgora;
    },
    alternar: () => definirAberto(!abertoAgora),
    fechar: () => definirAberto(false),
    dispose() {
      window.removeEventListener('keydown', aoApertar);
      window.removeEventListener('pointerdown', aoPressionarFora, true);
      fechar.removeEventListener('click', aoFechar);
      raiz.remove();
    },
  };
}
