import type { MissoesNaTela } from '../online/missoes-modelo';
import type { ModeloDaAjuda } from './ajuda-modelo';
import { SecaoDeMissoes } from './ajuda-missoes-modelo';
import { criarPainelDeMissoes } from './missoes';

export interface OpcoesAjudaMissoes {
  /** O mesmo modelo da ajuda de controles: o H (e o chip) abrem e fecham as duas juntas. */
  readonly modelo: ModeloDaAjuda;
  readonly missoes: (agoraMs: number) => MissoesNaTela;
  readonly aoPrecisarDeMissoes: () => void;
  readonly segurar?: () => boolean;
  /** O relógio de parede (ms desde 1970); padrão `Date.now`. */
  readonly agora?: () => number;
}

export interface HudAjudaMissoes {
  /** O quadro da carteira ou o lugar onde se joga mudou: redesenha se a seção está aberta (se uma tacada toca, quando ela acabar). */
  atualizar(): void;
  /** Uma vez por quadro: solta o que esperava a tacada e confere o relógio a cada 15 s. */
  tic(): void;
  /** Aberta, quantas vezes se desenhou e o texto na tela (vazio fechada), para o gancho de teste. */
  estado(): { readonly aberta: boolean; readonly desenhos: number; readonly texto: string };
  dispose(): void;
}

/**
 * A seção "Missões do dia" do H (L37): o painel do lobby em versão compacta, num cartão na coluna da esquerda, sob o placar (a ajuda
 * de controles já cobre o alto da direita e empilhar o painel nela bateria no efeito e no giz). Aparece e some com a ajuda.
 */
export function criarAjudaMissoes(pai: HTMLElement, opcoes: OpcoesAjudaMissoes): HudAjudaMissoes {
  const agora = opcoes.agora ?? ((): number => Date.now());
  const painel = criarPainelDeMissoes({ compacto: true });
  const cartao = document.createElement('div');
  cartao.id = 'hud-ajuda-missoes';
  cartao.className = 'hud-ajuda-missoes';
  cartao.append(painel.raiz);
  pai.append(cartao);

  const secao = new SecaoDeMissoes({
    missoes: opcoes.missoes,
    desenhar: (modelo) => painel.atualizar(modelo),
    aoPrecisarDeMissoes: opcoes.aoPrecisarDeMissoes,
    ...(opcoes.segurar ? { segurar: opcoes.segurar } : {}),
  });
  const mostrar = (aberta: boolean): void => {
    cartao.hidden = !aberta;
    secao.definirAberta(aberta, agora());
  };
  const parar = opcoes.modelo.aoMudar(mostrar);
  mostrar(opcoes.modelo.aberta);

  return {
    atualizar: () => secao.mudou(agora()),
    tic: () => secao.tic(agora()),
    estado: () => ({ aberta: secao.aberta, desenhos: secao.desenhos, texto: secao.aberta ? painel.texto() : '' }),
    dispose() {
      parar();
      cartao.remove();
    },
  };
}
