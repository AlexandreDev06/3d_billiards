import { criarEmpurradorUnico, criarRegistroDeEspacos, deveCarregarScript, deveMostrarEspaco, EDITOR_ADSENSE, SLOT_FIM, SLOT_MENU, SLOT_PARTIDA, URL_DO_SCRIPT } from './modelo';

type FilaAdsbygoogle = { push(item: object): number };
type JanelaComAnuncios = Window & { adsbygoogle?: FilaAdsbygoogle };

/** Onde o espaço fica; cada lugar tem o seu elemento (e o seu id de bloco em `SLOTS`). */
export type LugarDoAnuncio = 'menu' | 'fim' | 'partida';
const SLOTS: Readonly<Record<LugarDoAnuncio, string>> = { menu: SLOT_MENU, fim: SLOT_FIM, partida: SLOT_PARTIDA };

export interface Anuncios {
  /**
   * O espaço do bloco `slot` (criado na primeira chamada e o mesmo nas seguintes; o `push` acontece uma vez só), ou `null` se
   * não deve existir (id vazio, host de teste). Quem chama o põe onde quiser e pode movê-lo; nunca o recria.
   */
  espaco(lugar: LugarDoAnuncio): HTMLElement | null;
  /** Gancho de teste: mostra um retângulo cinza "Publicidade" no lugar do bloco, sem pedir nada ao Google. */
  definirProvaVisual(ligada: boolean): void;
  /** Quantos `push` foram feitos (para o gancho de teste). */
  pushes(): number;
}

export interface OpcoesAnuncios {
  readonly hostname: string;
  readonly busca: string;
  readonly documento?: Document;
  readonly janela?: JanelaComAnuncios;
}

/**
 * Os anúncios do AdSense: três espaços (`SLOT_MENU`, `SLOT_FIM` e a faixa `SLOT_PARTIDA`), nunca sobre o jogo.
 * O script entra assíncrono e uma vez; se for bloqueado, o espaço continua sem altura e nada quebra.
 */
export function criarAnuncios({ hostname, busca, documento = document, janela = window as JanelaComAnuncios }: OpcoesAnuncios): Anuncios {
  let provaVisual = false;
  let scriptPedido = false;
  let pushes = 0;

  const carregarScript = (): void => {
    if (scriptPedido || !deveCarregarScript(hostname, busca, [SLOT_MENU, SLOT_FIM, SLOT_PARTIDA])) return;
    scriptPedido = true;
    const s = documento.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = URL_DO_SCRIPT;
    s.addEventListener('error', () => s.remove());
    documento.head.append(s);
  };

  const empurrar = (): void => {
    try {
      janela.adsbygoogle = janela.adsbygoogle ?? [];
      janela.adsbygoogle.push({});
      pushes += 1;
    } catch {
      // bloqueador ou falha do script: o espaço fica vazio
    }
  };

  const criar = (slot: string, variante: string): HTMLElement => {
    const prova = variante === 'prova';
    const raiz = documento.createElement('aside');
    raiz.className = 'anuncio-espaco';
    raiz.setAttribute('aria-label', 'Publicidade');
    const rotulo = documento.createElement('span');
    rotulo.className = 'anuncio-rotulo';
    rotulo.textContent = 'Publicidade';
    raiz.append(rotulo);
    if (prova) {
      const retangulo = documento.createElement('div');
      retangulo.className = 'anuncio-prova';
      raiz.append(retangulo);
      raiz.classList.add('cheio');
      return raiz;
    }
    const ins = documento.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.dataset.adClient = EDITOR_ADSENSE;
    ins.dataset.adSlot = slot;
    ins.dataset.adFormat = 'auto';
    ins.dataset.fullWidthResponsive = 'true';
    raiz.append(ins);
    new MutationObserver(() => raiz.classList.toggle('cheio', ins.dataset.adStatus === 'filled')).observe(ins, {
      attributes: true,
      attributeFilter: ['data-ad-status'],
    });
    return raiz;
  };

  const registro = criarRegistroDeEspacos<HTMLElement>(
    (lugar, variante) => criar(SLOTS[lugar as LugarDoAnuncio], variante),
    (raiz) => {
      // O push espera o espaço ter largura (no DOM, visível, depois do layout): a faixa e o fim nascem escondidos.
      const ins = raiz.querySelector<HTMLElement>('ins.adsbygoogle');
      if (ins === null) return;
      const unico = criarEmpurradorUnico(empurrar);
      const observador = new ResizeObserver(() => {
        if (unico.tentar(ins.isConnected ? ins.offsetWidth : 0)) observador.disconnect();
      });
      observador.observe(ins);
    },
    (raiz) => raiz.remove(),
  );

  return {
    espaco(lugar) {
      const slot = SLOTS[lugar];
      if (!deveMostrarEspaco(slot, hostname, busca, provaVisual)) return null;
      if (!provaVisual) carregarScript();
      return registro.obter(lugar, provaVisual ? 'prova' : 'real');
    },
    definirProvaVisual(ligada) {
      provaVisual = ligada;
    },
    pushes: () => pushes,
  };
}
