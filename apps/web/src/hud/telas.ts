import type { ApostaNaTela } from '../online/aposta-modelo';
import type { FaixaDeVez } from '../online/sala-modelo';
import { textoDaClassificacao, type LinhaDaClassificacao } from './classificacao-modelo';
import { criarConfronto } from './confronto';
import type { ConfrontoNaTela } from './confronto-modelo';

/** O que a tela de fim de partida mostra. */
export interface DadosDoFim {
  /** Os nomes da equipe vencedora; vazio = "Partida encerrada". */
  readonly vencedores: readonly string[];
  /** A frase da jogada que decidiu. */
  readonly detalhe?: string;
  /** Quem dá a saída na próxima. */
  readonly sai?: string;
  /** Online, sem ser o anfitrião: o aviso no lugar do botão. */
  readonly esperaPor?: string;
  /** "Voltar à sala" online, "Voltar" no hot-seat. */
  readonly rotuloDoBotao?: string;
  /** O placar já com esta partida contada. */
  readonly placar?: ConfrontoNaTela | null;
  /** Do primeiro ao último, com os pontos, quando a partida se joga por pontos (mata-mata); ausente ou `null` não mostra. */
  readonly classificacao?: readonly LinhaDaClassificacao[] | null;
  /** O dinheiro da partida (online, quando a sala pagou ou anulou a aposta); ausente ou `null` não mostra. */
  readonly aposta?: ApostaNaTela | null;
}

export interface Telas {
  /** "Clique para jogar" enquanto o mouse não está travado (e a partida não acabou). */
  definirTravado(travado: boolean): void;
  /**
   * Online: de quem é a vez. Na minha, o aviso é o "Clique para jogar" de sempre; na dos outros (ou enquanto a sala
   * confirma a minha tacada) ele diz de quem é a vez. `null` volta ao hot-seat.
   */
  definirVez(faixa: FaixaDeVez | null): void;
  /**
   * Fim de partida: quem venceu, a frase da jogada que decidiu, o placar de agora, quem dá a saída na próxima (se houver) e
   * o botão (`rotuloDoBotao`). Com `esperaPor`, quem não pode voltar (online, sem ser o anfitrião) vê o aviso no lugar do botão.
   */
  mostrarFim(dados: DadosDoFim): void;
  /** Troca o placar da tela de fim (o `estado-sala` com ele pode chegar depois de a tela abrir); `null` o esconde. */
  definirPlacar(placar: ConfrontoNaTela | null): void;
  /** Troca o dinheiro da tela de fim (a `aposta-paga` pode chegar depois de a tela abrir); `null` o esconde. */
  definirAposta(aposta: ApostaNaTela | null): void;
  /** O dinheiro como a tela o mostra ("Ana +20 (120 moedas) · Beto −20 (80 moedas)"); "" se escondido (para o gancho de teste). */
  textoDaAposta(): string;
  /** A frase do placar na tela de fim ("Ana 3 × 1 Beto"); "" se escondido (para o gancho de teste). */
  textoDoPlacar(): string;
  /** A classificação na tela de fim ("1º Ana 8 · 2º Beto 5"); "" se não há (para o gancho de teste). */
  textoDaClassificacao(): string;
  esconderFim(): void;
  dispose(): void;
}

/** `paiDoClique`: onde fica o aviso "Clique para jogar" (por padrão, em `pai`). */
export function criarTelas(pai: HTMLElement, aoVoltar: () => void, paiDoClique: HTMLElement = pai, espacoDeAnuncio?: () => HTMLElement | null): Telas {
  const clique = document.createElement('div');
  clique.className = 'tela-clique';
  clique.textContent = 'Clique para jogar';

  const fim = document.createElement('div');
  fim.className = 'tela-fim';
  fim.hidden = true;
  const caixa = document.createElement('div');
  caixa.className = 'tela-fim-caixa';
  const selo = document.createElement('div');
  selo.className = 'tela-fim-selo';
  selo.textContent = 'Fim de partida';
  const titulo = document.createElement('div');
  titulo.className = 'tela-fim-titulo';
  const detalheEl = document.createElement('div');
  detalheEl.className = 'tela-fim-detalhe';
  const classificacaoEl = document.createElement('ol');
  classificacaoEl.className = 'tela-fim-classificacao';
  classificacaoEl.hidden = true;
  const apostaEl = document.createElement('div');
  apostaEl.className = 'tela-fim-aposta';
  apostaEl.hidden = true;
  const placarEl = document.createElement('div');
  placarEl.className = 'tela-fim-placar';
  placarEl.hidden = true;
  const saiEl = document.createElement('div');
  saiEl.className = 'tela-fim-sai';
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = 'tela-fim-botao';
  botao.textContent = 'Voltar';
  caixa.append(selo, titulo, detalheEl, classificacaoEl, placarEl, apostaEl, saiEl, botao);
  fim.append(caixa);
  paiDoClique.append(clique);
  pai.append(fim);

  const espera = document.createElement('div');
  espera.className = 'tela-fim-espera';
  caixa.insertBefore(espera, botao);

  let ultimoPlacar = '';
  const desenharPlacar = (placar: ConfrontoNaTela | null): void => {
    const chave = placar === null ? '' : JSON.stringify(placar);
    if (chave === ultimoPlacar) return;
    ultimoPlacar = chave;
    placarEl.hidden = placar === null;
    const rotulo = document.createElement('div');
    rotulo.className = 'tela-fim-placar-rotulo';
    rotulo.textContent = 'Placar';
    placarEl.replaceChildren(...(placar === null ? [] : [rotulo, criarConfronto(placar, 'grande')]));
  };

  let ultimaAposta = '';
  let apostaMostrada: ApostaNaTela | null = null;
  const desenharAposta = (aposta: ApostaNaTela | null): void => {
    const chave = aposta === null ? '' : JSON.stringify(aposta);
    if (chave === ultimaAposta) return;
    ultimaAposta = chave;
    apostaMostrada = aposta;
    apostaEl.hidden = aposta === null;
    apostaEl.classList.toggle('anulada', aposta?.anulada === true);
    if (aposta === null) return void apostaEl.replaceChildren();
    const rotulo = document.createElement('div');
    rotulo.className = 'tela-fim-aposta-rotulo';
    rotulo.textContent = aposta.titulo;
    const lista = document.createElement('ul');
    lista.className = 'tela-fim-aposta-linhas';
    for (const linha of aposta.linhas) {
      const item = document.createElement('li');
      item.className = `tela-fim-aposta-linha equipe-${linha.equipe} ${linha.sentido}`;
      item.classList.toggle('voce', linha.voce);
      item.dataset.lugar = String(linha.lugar);
      item.setAttribute('aria-label', linha.descricao);
      const nome = document.createElement('span');
      nome.className = 'tela-fim-aposta-nome';
      nome.textContent = linha.nome;
      const delta = document.createElement('span');
      delta.className = 'tela-fim-aposta-delta';
      delta.textContent = linha.textoDelta;
      const saldo = document.createElement('span');
      saldo.className = 'tela-fim-aposta-saldo';
      saldo.classList.toggle('negativo', linha.saldoNegativo);
      saldo.textContent = linha.textoSaldo;
      item.append(nome, delta, saldo);
      lista.append(item);
    }
    apostaEl.replaceChildren(rotulo, lista);
  };

  let ultimaClassificacao = '';
  let classificacaoMostrada: readonly LinhaDaClassificacao[] | null = null;
  const desenharClassificacao = (linhas: readonly LinhaDaClassificacao[] | null): void => {
    const chave = linhas === null ? '' : JSON.stringify(linhas);
    if (chave === ultimaClassificacao) return;
    ultimaClassificacao = chave;
    classificacaoMostrada = linhas;
    classificacaoEl.hidden = linhas === null;
    classificacaoEl.replaceChildren(
      ...(linhas ?? []).map((linha) => {
        const item = document.createElement('li');
        item.className = `tela-fim-posicao equipe-${linha.equipe}`;
        item.classList.toggle('vencedor', linha.vencedor);
        item.dataset.equipe = String(linha.equipe);
        const posicao = document.createElement('span');
        posicao.className = 'tela-fim-posicao-numero';
        posicao.textContent = `${linha.posicao}º`;
        const nome = document.createElement('span');
        nome.className = 'tela-fim-posicao-nome';
        nome.textContent = linha.nome;
        const pontos = document.createElement('span');
        pontos.className = 'tela-fim-posicao-pontos';
        pontos.textContent = `${linha.pontos} ${linha.pontos === 1 ? 'ponto' : 'pontos'}`;
        item.append(posicao, nome, pontos);
        return item;
      }),
    );
  };

  let travado = false;
  let acabou = false;
  let faixa: FaixaDeVez | null = null;
  const sincronizar = (): void => {
    clique.classList.remove('espera', 'alerta');
    if (acabou) {
      clique.hidden = true;
      return;
    }
    if (faixa === null || faixa.tipo === 'minha') {
      clique.textContent = 'Clique para jogar';
      clique.hidden = travado;
    } else if (faixa.tipo === 'nenhuma') {
      clique.hidden = true;
    } else {
      clique.textContent = faixa.texto;
      clique.hidden = false;
      clique.classList.add(faixa.tipo === 'ausente' ? 'alerta' : 'espera');
    }
  };
  sincronizar();

  const aoClicar = (): void => aoVoltar();
  botao.addEventListener('click', aoClicar);

  return {
    definirTravado(valor) {
      travado = valor;
      sincronizar();
    },
    definirVez(valor) {
      faixa = valor;
      sincronizar();
    },
    mostrarFim({ vencedores, detalhe = '', sai = '', esperaPor = '', rotuloDoBotao = 'Voltar', placar = null, classificacao = null, aposta = null }) {
      acabou = true;
      desenharClassificacao(classificacao);
      desenharPlacar(placar);
      desenharAposta(aposta);
      botao.textContent = rotuloDoBotao;
      espera.textContent = esperaPor;
      espera.hidden = esperaPor === '';
      botao.hidden = esperaPor !== '';
      titulo.textContent = vencedores.length === 0 ? 'Partida encerrada' : `${vencedores.join(' e ')} ${vencedores.length > 1 ? 'venceram' : 'venceu'}!`;
      detalheEl.textContent = detalhe;
      detalheEl.hidden = detalhe === '';
      saiEl.textContent = sai === '' ? '' : `Sai: ${sai}`;
      saiEl.hidden = sai === '';
      fim.hidden = false;
      // O anúncio entra depois do foco no botão e abaixo dele: não tira o foco nem atrasa o "Voltar".
      const anuncio = espacoDeAnuncio?.() ?? null;
      if (anuncio !== null && anuncio.parentElement !== caixa) caixa.append(anuncio);
      sincronizar();
      if (esperaPor === '') botao.focus();
    },
    definirPlacar: desenharPlacar,
    definirAposta: desenharAposta,
    textoDaAposta: () =>
      apostaMostrada === null || apostaEl.hidden
        ? ''
        : apostaMostrada.anulada
          ? apostaMostrada.titulo
          : apostaMostrada.linhas.map((l) => `${l.nome} ${l.textoDelta} (${l.textoSaldo})`).join(' · '),
    textoDaClassificacao: () => (classificacaoMostrada === null ? '' : textoDaClassificacao(classificacaoMostrada)),
    textoDoPlacar: () => (placarEl.hidden ? '' : (placarEl.querySelector('.confronto') as HTMLElement | null)?.title ?? ''),
    esconderFim() {
      acabou = false;
      fim.hidden = true;
      sincronizar();
    },
    dispose() {
      botao.removeEventListener('click', aoClicar);
      clique.remove();
      fim.remove();
    },
  };
}
