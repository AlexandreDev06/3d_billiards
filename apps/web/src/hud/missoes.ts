import type { CartaoDeMissao, MissoesNaTela } from '../online/missoes-modelo';

export interface PainelDeMissoes {
  readonly raiz: HTMLElement;
  /** Redesenha o painel com o que o modelo diz agora (o dia vira, o progresso anda). */
  atualizar(modelo: MissoesNaTela): void;
  /** O texto do painel, para o gancho de teste. */
  texto(): string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function cartaoDaMissao(c: CartaoDeMissao): HTMLLIElement {
  const li = el('li', `missao-cartao nivel-${c.nivel}${c.cumprida ? ' cumprida' : ''}`);
  li.dataset.missao = c.id;

  const linha = el('div', 'missao-linha');
  const nivel = el('span', 'missao-nivel', c.rotuloDoNivel);
  const nome = el('span', 'missao-nome', c.nome);
  const premio = el('span', 'missao-premio', c.textoDoPremio);
  premio.title = 'Moedas que a missão paga, uma vez por dia';
  linha.append(nivel, nome, premio);

  const descricao = el('div', 'missao-descricao', c.descricao);

  const progresso = el('div', 'missao-progresso');
  const barra = el('div', 'missao-barra');
  barra.setAttribute('role', 'progressbar');
  barra.setAttribute('aria-label', `${c.nome}: ${c.textoDoProgresso}`);
  barra.setAttribute('aria-valuemin', '0');
  barra.setAttribute('aria-valuemax', String(c.meta));
  barra.setAttribute('aria-valuenow', String(c.progresso));
  const enchimento = el('i', 'missao-enchimento');
  enchimento.style.width = `${Math.round(c.fracao * 100)}%`;
  barra.append(enchimento);
  const numero = el('span', 'missao-numero', c.textoDoProgresso);
  const visto = el('span', 'missao-visto', '✓');
  visto.setAttribute('role', 'img');
  visto.setAttribute('aria-label', 'Missão cumprida');
  visto.hidden = !c.cumprida;
  progresso.append(barra, numero, visto);

  li.append(linha, descricao, progresso);
  return li;
}

export interface OpcoesDoPainelDeMissoes {
  /** A versão do H durante a partida (L37): os mesmos elementos, com a classe `missoes-compactas` para o CSS apertar as folgas. */
  readonly compacto?: boolean;
}

/**
 * O painel "Missões do dia" (L32): três cartões (nível com cor própria, nome, descrição, prêmio, barra de progresso e o visto das
 * cumpridas), quanto falta para virar o dia e quantas moedas as missões já deram hoje. Só DOM: o que escreve vem do modelo.
 */
export function criarPainelDeMissoes(opcoes: OpcoesDoPainelDeMissoes = {}): PainelDeMissoes {
  const raiz = el('section', opcoes.compacto === true ? 'missoes missoes-compactas' : 'missoes');
  raiz.setAttribute('aria-label', 'Missões do dia');
  return {
    raiz,
    atualizar(m) {
      const topo = el('div', 'missoes-topo');
      topo.append(el('h3', 'missoes-titulo', 'Missões do dia'), el('span', 'missoes-ganho', m.textoDoGanho));
      const restante = el('div', 'missoes-restante', m.restante);
      const lista = el('ul', 'missoes-lista');
      lista.append(...m.cartoes.map(cartaoDaMissao));
      const filhos: HTMLElement[] = [topo, restante, lista];
      if (m.aviso !== null) {
        const aviso = el('div', 'missoes-aviso', m.aviso);
        aviso.setAttribute('role', 'note');
        filhos.push(aviso);
      }
      raiz.dataset.origem = m.origem;
      raiz.replaceChildren(...filhos);
    },
    texto: () => raiz.innerText ?? raiz.textContent ?? '',
  };
}
