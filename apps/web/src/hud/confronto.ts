import type { ConfrontoNaTela } from './confronto-modelo';

/** `pequeno`: a pílula do HUD; `grande`: a tela de fim e a sala de espera; `linha`: uma linha do histórico. */
export type VarianteDoConfronto = 'pequeno' | 'grande' | 'linha';

function span(classe: string, texto: string): HTMLSpanElement {
  const e = document.createElement('span');
  e.className = classe;
  e.textContent = texto;
  return e;
}

/**
 * O confronto na tela, com o nome de cada lado na cor da equipe (azul o lado 0, laranja o 1, depois verde e violeta; as
 * mesmas das linhas do placar das bolas), o número de vitórias e, quem está na frente, mais forte; e a modalidade em que foi
 * jogado, em letra pequena (o mesmo 1×1 de par ou ímpar e de mata-mata são confrontos diferentes). O texto corrido na
 * ordem de leitura é o próprio `texto` do confronto, que também vai na dica.
 *
 * Dois lados: "Ana e Caio 2 × 0 Beto". Três ou quatro (mata-mata): "Ana 2 · Beto 1 · Caio 0", um bloco por pessoa.
 */
export function criarConfronto(confronto: ConfrontoNaTela, variante: VarianteDoConfronto): HTMLElement {
  const raiz = document.createElement('div');
  const emDois = confronto.lados.length === 2;
  raiz.className = `confronto ${variante}${emDois ? '' : ' varios'}`;
  raiz.title = confronto.texto;
  raiz.dataset.modalidade = confronto.modalidade;
  const pontos = (lado: number, vitorias: number): HTMLElement => {
    const e = span(`confronto-pontos lado-${lado}`, String(vitorias));
    e.classList.toggle('na-frente', confronto.lider === lado);
    return e;
  };
  const nome = (lado: number, texto: string): HTMLElement => {
    const e = span(`confronto-nome lado-${lado}`, texto);
    e.classList.toggle('na-frente', confronto.lider === lado);
    return e;
  };
  if (emDois) {
    const [a, b] = confronto.lados as readonly [ConfrontoNaTela['lados'][number], ConfrontoNaTela['lados'][number]];
    const conta = document.createElement('span');
    conta.className = 'confronto-conta';
    conta.append(pontos(0, a.vitorias), span('confronto-x', '×'), pontos(1, b.vitorias));
    raiz.append(nome(0, a.nome), conta, nome(1, b.nome));
  } else {
    confronto.lados.forEach((lado, i) => {
      const bloco = document.createElement('span');
      bloco.className = 'confronto-lado';
      bloco.append(nome(i, lado.nome), pontos(i, lado.vitorias));
      raiz.append(bloco);
    });
  }
  const modalidade = span('confronto-modalidade', confronto.rotuloDaModalidade);
  raiz.append(modalidade);
  return raiz;
}
