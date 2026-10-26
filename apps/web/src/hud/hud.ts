import { armazenamentoLocal } from '../armazenamento';
import { CONFIG_WEB } from '../config';
import { teclaEmCampo } from '../controles/campo';
import { criarAjuda, LINHAS_DE_AJUDA, type LinhaDeAjuda } from './ajuda';
import { criarAnuncio, type HudAnuncio } from './anuncio';
import { criarAvisoDaFalta, type HudAvisoFalta } from './aviso-falta';
import { criarAvisoDaMira, type AvisoDaMira } from './aviso-mira';
import { criarAvisoDeEspirro, type AvisoDeEspirro } from './aviso-espirro';
import { criarVooDeFichas, type VooDeFichas } from './voo-fichas';
import { criarContador, type Contador } from './contador';
import { ICONE_ENGRENAGEM } from './icones';
import { criarAvisoDiscreto, type AvisoDiscreto } from './aviso-discreto';
import { ModeloDaAjuda } from './ajuda-modelo';
import { criarHudAudio, type ControleDeAudio } from './audio';
import { criarAvisosDeMissao, type AvisosDeMissao } from './avisos-de-missao';
import { criarHudEmojis, type HudEmojis, type OpcoesHudEmojis } from './emojis';
import { criarHudForca, type HudForca } from './forca';
import { criarHudGiz, type HudGiz } from './giz';
import { criarMiniBolao, type MiniBolao } from './minibolao';
import { criarPlacar, type Placar } from './placar';
import { criarPlacarDaSala, type PlacarDaSalaHud } from './placar-sala';
import { criarHudSala, type HudSala, type OpcoesHudSala } from './sala';
import { criarTelas, type Telas } from './telas';

export interface Hud {
  readonly miniBolao: MiniBolao;
  readonly giz: HudGiz;
  /** A barra da força pela linha, embaixo no meio, enquanto o botão está segurado. */
  readonly forca: HudForca;
  readonly placar: Placar;
  /** O placar da sala (ou do mesmo PC) em pequeno, em cima do placar das bolas: "Ana 3 × 1 Beto". */
  readonly placarDaSala: PlacarDaSalaHud;
  readonly telas: Telas;
  /** O aviso grande "Agora é só a N!" do começo da vez de quem está na bola final. */
  readonly anuncio: HudAnuncio;
  /** O aviso grande da falta (nome, quem recebe, a bola), depois da animação da tacada. */
  readonly avisoFalta: HudAvisoFalta;
  /** As fichas que voam da mesa até o placar na transição da falta. */
  readonly voos: VooDeFichas;
  /** "Bola errada: a 6 é do adversário" enquanto a mira aponta para uma bola que não vale, embaixo do relógio. */
  readonly avisoMira: AvisoDaMira;
  /** "Espirrou! Faltou giz" / "Espirrou! Efeito demais" quando o taco espirra (miscue), para quem tacou e para quem assiste. */
  readonly avisoEspirro: AvisoDeEspirro;
  /** Recado pequeno e passageiro (gráficos reduzidos, por exemplo). */
  readonly aviso: AvisoDiscreto;
  /** O relógio da tacada, no meio de cima: visível para todos quando a partida tem limite de tempo. */
  readonly contador: Contador;
  /** Online: código da sala, link, sair, chat e aviso de conexão; escondido no hot-seat. */
  readonly sala: HudSala;
  /** Online: as bolhas "Nome 😂" no alto da tela, o botão de emoji ao lado do chat e as teclas 1 a 8; escondido no hot-seat. */
  readonly emojis: HudEmojis;
  /** Missão do dia que andou ("Mão quente 3/5") ou fechou ("Missão cumprida! Tabelada +100"), no canto de cima à direita (L32). */
  readonly avisosDeMissao: AvisosDeMissao;
  /** O botão "Menu" (volta à tela inicial) só aparece no hot-seat. */
  mostrarBotaoMenu(visivel: boolean): void;
  /** O que o botão esquerdo faz na ajuda, conforme o controle de força que vale. */
  definirControleDeForca(controle: 'linha' | 'empurrar'): void;
  dispose(): void;
}

export interface OpcoesHud {
  /** O botão da tela de fim de partida (online volta à sala de espera; no hot-seat, à tela de escolha). */
  readonly aoVoltar: () => void;
  readonly audio: ControleDeAudio;
  readonly sala: OpcoesHudSala;
  /** O que o HUD pede à sessão para os emojis (o `topo` o HUD mesmo põe). */
  readonly emojis: Omit<OpcoesHudEmojis, 'topo'>;
  /** O botão "Menu" do hot-seat. */
  readonly aoMenu: () => void;
  /** A engrenagem: abre as configurações do jogador. */
  readonly aoConfiguracoes: () => void;
  /** Linhas extras na ajuda (atalhos que só existem em dev). */
  readonly ajudaExtra?: readonly LinhaDeAjuda[];
  /** O botão "Créditos dos sons" do cartão da ajuda. */
  readonly aoCreditos?: () => void;
}

/** Abaixo desta altura (px) o cartão de ajuda aberto cobriria o fundo da mesa. */
const ALTURA_PARA_AJUDA_ABERTA = 700;

function criar(classe: string, pai: HTMLElement): HTMLDivElement {
  const el = document.createElement('div');
  el.className = classe;
  pai.append(el);
  return el;
}

/**
 * Cantos: placar e avisos da jogada em cima à esquerda, som e ajuda em cima à direita,
 * efeito e giz embaixo à direita, "clique para jogar" no meio de cima. O resto, onde
 * está a mesa, fica livre.
 */
export function criarHud(pai: HTMLElement, opcoes: OpcoesHud): Hud {
  const raiz = document.createElement('div');
  raiz.className = 'hud';
  pai.append(raiz);
  const esquerda = criar('hud-esquerda', raiz);
  const topo = criar('hud-topo', raiz);
  const topoDireita = criar('hud-topo-direita', raiz);
  const painel = criar('hud-painel', raiz);
  const rotulo = criar('hud-rotulo', painel);
  rotulo.textContent = 'Efeito';
  const teclasDoEfeito = document.createElement('kbd');
  teclasDoEfeito.className = 'hud-tecla';
  teclasDoEfeito.textContent = 'W A S D';
  rotulo.append(teclasDoEfeito);

  const miniBolao = criarMiniBolao(painel);
  const giz = criarHudGiz(painel, CONFIG_WEB.hud.gizBaixo);
  const forca = criarHudForca(raiz, CONFIG_WEB.tacada.linha.marcas, CONFIG_WEB.tacada.linha.fracaoMinima);
  const placarDaSala = criarPlacarDaSala(esquerda);
  const placar = criarPlacar(esquerda);
  const telas = criarTelas(pai, opcoes.aoVoltar, topo);
  const anuncio = criarAnuncio(raiz);
  const aviso = criarAvisoDiscreto(raiz);
  const avisoMira = criarAvisoDaMira(topo);
  const avisoEspirro = criarAvisoDeEspirro(topo);
  const avisoFalta = criarAvisoDaFalta(raiz);
  const voos = criarVooDeFichas(raiz);
  const contador = criarContador(topo, CONFIG_WEB.hud.relogioAlertaS);
  const barra = criar('hud-barra', topoDireita);
  const botaoMenu = document.createElement('button');
  botaoMenu.type = 'button';
  botaoMenu.className = 'hud-botao hud-menu-botao';
  botaoMenu.textContent = 'Menu';
  botaoMenu.hidden = true;
  const aoClicarMenu = (): void => {
    botaoMenu.blur();
    opcoes.aoMenu();
  };
  botaoMenu.addEventListener('click', aoClicarMenu);
  const engrenagem = document.createElement('button');
  engrenagem.type = 'button';
  engrenagem.className = 'hud-botao hud-engrenagem';
  engrenagem.title = 'Configurações (C)';
  engrenagem.setAttribute('aria-label', 'Configurações');
  engrenagem.innerHTML = ICONE_ENGRENAGEM;
  const aoClicarEngrenagem = (): void => {
    engrenagem.blur();
    opcoes.aoConfiguracoes();
  };
  engrenagem.addEventListener('click', aoClicarEngrenagem);
  barra.append(botaoMenu, engrenagem);
  const sala = criarHudSala(raiz, opcoes.sala);
  const emojis = criarHudEmojis(pai, { ...opcoes.emojis, topo });
  const avisosDeMissao = criarAvisosDeMissao(pai, {
    progressoMs: CONFIG_WEB.hud.missoes.progressoSegundos * 1000,
    cumpridaMs: CONFIG_WEB.hud.missoes.cumpridaSegundos * 1000,
    maximo: CONFIG_WEB.hud.missoes.maximo,
  });
  const audio = criarHudAudio(barra, opcoes.audio);
  const ajudaModelo = new ModeloDaAjuda(armazenamentoLocal(), window.innerHeight >= ALTURA_PARA_AJUDA_ABERTA);
  const ajuda = criarAjuda(barra, topoDireita, ajudaModelo, [...LINHAS_DE_AJUDA, ...(opcoes.ajudaExtra ?? [])], opcoes.aoCreditos);

  const aoApertar = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || teclaEmCampo(e.target)) return;
    if (e.code === 'KeyH') ajudaModelo.alternar();
    else if (e.code === 'KeyM') opcoes.audio.alternarMudo();
  };
  window.addEventListener('keydown', aoApertar);

  return {
    miniBolao,
    giz,
    forca,
    placar,
    placarDaSala,
    telas,
    anuncio,
    avisoMira,
    avisoEspirro,
    avisoFalta,
    voos,
    aviso,
    contador,
    sala,
    emojis,
    avisosDeMissao,
    mostrarBotaoMenu(visivel) {
      botaoMenu.hidden = !visivel;
    },
    definirControleDeForca(controle) {
      ajuda.definirTacada(controle);
    },
    dispose() {
      window.removeEventListener('keydown', aoApertar);
      botaoMenu.removeEventListener('click', aoClicarMenu);
      engrenagem.removeEventListener('click', aoClicarEngrenagem);
      sala.dispose();
      emojis.dispose();
      avisosDeMissao.dispose();
      ajuda.dispose();
      audio.dispose();
      miniBolao.dispose();
      giz.dispose();
      forca.dispose();
      placar.dispose();
      placarDaSala.dispose();
      telas.dispose();
      anuncio.dispose();
      avisoMira.dispose();
      avisoEspirro.dispose();
      avisoFalta.dispose();
      voos.dispose();
      aviso.dispose();
      contador.dispose();
      raiz.remove();
    },
  };
}
