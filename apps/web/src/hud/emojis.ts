import { equipeDoLugar, type EmojiSala, type ModoSala } from '@sinuca/protocolo';
import type { EmojisEscolhidos } from '../configuracoes/emojis-escolhidos';
import { teclaEmCampoDeTexto } from '../controles/campo';
import { emojiDaTecla, emojiDoNumero, type BolhaDeEmoji, type OpcoesDaPilha, type PilhaDeEmojis } from '../online/emojis-modelo';
import { criarEscolhaDeEmojis, type EscolhaDeEmojisNaTela } from './escolha-emojis';

export interface OpcoesHudEmojis {
  /** O `.hud-topo`: as bolhas ficam logo abaixo do que mora ali (relógio, "Bola errada", "Espirrou!"). */
  readonly topo: HTMLElement;
  /** Os oito emojis deste jogador (teclas 1 a 8 e fileira); o ✎ da fileira abre a escolha deles. */
  readonly escolha: EmojisEscolhidos;
  /** Manda o emoji à sala; falso se não foi (sem conexão, ou o balde cheio). */
  readonly aoSoltar: (emoji: EmojiSala) => boolean;
}

/** Uma bolha como está na tela (para o gancho de teste). `equipe` `null` = espectador. */
export interface BolhaNaTela {
  readonly id: number;
  readonly nome: string;
  readonly emoji: EmojiSala;
  readonly lugar: number | null;
  readonly equipe: number | null;
}

export interface HudEmojis {
  /** Online com a sala aberta: liga o botão e as teclas 1 a 8. Desligado, some tudo (bolhas e fileira também). */
  mostrar(visivel: boolean): void;
  /**
   * Põe na tela o que a pilha tem em `agoraMs` (chega, some, sai a mais velha). `modo` é o da sala: dele vem a cor
   * (equipe) de cada nome. Barato quando nada mudou: pode ser chamado a cada poucos quadros.
   */
  atualizar(pilha: PilhaDeEmojis, agoraMs: number, modo: ModoSala): void;
  /** O mesmo que a tecla `numero` (1 a 8): manda o emoji. Falso se não mandou. */
  soltar(numero: number): boolean;
  /** Abre ou fecha a escolha dos oito (o ✎ da fileira); abrir abre a fileira também. Falso se o botão não está na tela. */
  alternarEscolha(aberta?: boolean): boolean;
  estado(): {
    readonly visivel: boolean;
    readonly fileiraAberta: boolean;
    readonly escolhaAberta: boolean;
    /** O que a escolha aberta pela fileira mostra (slot marcado, emojis dos slots, dica). */
    readonly escolha: ReturnType<EscolhaDeEmojisNaTela['estado']>;
    readonly bolhas: readonly BolhaNaTela[];
  };
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/** Distância (px) entre a última coisa do `.hud-topo` e a primeira bolha. */
const FOLGA_DO_TOPO = 8;
/** Onde a pilha começa quando não há HUD embaixo dela (a sala de espera). */
const TOPO_SEM_HUD = 16;

/**
 * Emojis da sala. As bolhas ("Nome 😂") moram em cima, no meio, abaixo do relógio e das pílulas; o botão com a fileira dos
 * oito fica embaixo à esquerda, ao lado do chat. As teclas 1 a 8 mandam o emoji de mesmo número. Tudo fica fora do `.hud`
 * de propósito: a sala de espera e a tela de fim cobrem o HUD, e os emojis têm de aparecer por cima delas.
 */
export function criarHudEmojis(pai: HTMLElement, opcoes: OpcoesHudEmojis): HudEmojis {
  const { escolha } = opcoes;
  const pilhaEl = el('div', 'emojis-pilha');
  pilhaEl.hidden = true;
  pilhaEl.setAttribute('aria-live', 'polite');
  pilhaEl.setAttribute('aria-label', 'Emojis da sala');

  const area = el('div', 'emojis-area');
  area.hidden = true;
  const botao = el('button', 'hud-botao emojis-botao', '🙂');
  botao.type = 'button';
  botao.title = 'Emojis (teclas 1 a 8)';
  botao.setAttribute('aria-label', 'Emojis');
  botao.setAttribute('aria-expanded', 'false');
  botao.setAttribute('aria-controls', 'emojis-fileira');
  const fileira = el('div', 'emojis-fileira');
  fileira.id = 'emojis-fileira';
  fileira.hidden = true;
  fileira.setAttribute('role', 'group');
  fileira.setAttribute('aria-label', 'Escolha um emoji');
  const opcoesEl = Array.from({ length: escolha.emojis.length }, (_, i) => {
    const b = el('button', 'emoji-opcao');
    b.type = 'button';
    b.dataset.numero = String(i + 1);
    const glifo = el('span', 'emoji-opcao-glifo');
    b.append(glifo, el('span', 'emoji-opcao-tecla', String(i + 1)));
    return { b, glifo };
  });
  const editar = el('button', 'emoji-editar', '✎');
  editar.type = 'button';
  editar.title = 'Escolher os meus 8 emojis';
  editar.setAttribute('aria-label', 'Escolher os meus 8 emojis');
  editar.setAttribute('aria-expanded', 'false');
  editar.setAttribute('aria-controls', 'emojis-escolha');
  fileira.append(...opcoesEl.map((o) => o.b), editar);

  // A escolha dos oito abre em cima da fileira: a mesma da engrenagem, para dar na sala de espera (onde o HUD está escondido).
  const escolhaEl = el('div', 'emojis-escolha-painel');
  escolhaEl.id = 'emojis-escolha';
  escolhaEl.hidden = true;
  escolhaEl.setAttribute('role', 'dialog');
  escolhaEl.setAttribute('aria-label', 'Os meus emojis');
  const escolhaTopo = el('header', 'emojis-escolha-topo');
  const escolhaFechar = el('button', 'hud-botao emojis-escolha-fechar', '×');
  escolhaFechar.type = 'button';
  escolhaFechar.setAttribute('aria-label', 'Fechar a escolha de emojis');
  escolhaTopo.append(el('strong', 'emojis-escolha-titulo', 'Emojis (teclas 1 a 8)'), escolhaFechar);
  const escolhaNaTela = criarEscolhaDeEmojis(escolha);
  escolhaEl.append(escolhaTopo, escolhaNaTela.raiz);
  area.append(escolhaEl, botao, fileira);
  pai.append(pilhaEl, area);

  /** A fileira mostra os emojis de agora; muda sozinha quando a escolha muda. */
  const desenharFileira = (): void => {
    opcoesEl.forEach(({ b, glifo }, i) => {
      const emoji = escolha.emojis[i] ?? '';
      glifo.textContent = emoji;
      b.title = `${emoji} (tecla ${i + 1})`;
      b.setAttribute('aria-label', `Mandar ${emoji}, tecla ${i + 1}`);
    });
  };
  desenharFileira();
  const pararDeOuvirEscolha = escolha.aoMudar(desenharFileira);

  let visivel = false;
  let aberta = false;
  let topoAplicado = -1;
  let tempoAplicado: OpcoesDaPilha | null = null;
  const naTela = new Map<number, { readonly el: HTMLElement; readonly nomeEl: HTMLElement; readonly bolha: BolhaDeEmoji; equipe: number | null }>();

  let escolhaAberta = false;
  const abrirFileira = (): void => {
    if (aberta || !visivel) return;
    aberta = true;
    fileira.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
  };
  const abrirEscolha = (): void => {
    if (escolhaAberta || !visivel) return;
    abrirFileira();
    escolhaAberta = true;
    escolhaEl.hidden = false;
    editar.setAttribute('aria-expanded', 'true');
    editar.classList.add('aberto');
  };
  const fecharEscolha = (): void => {
    if (!escolhaAberta) return;
    escolhaAberta = false;
    escolhaEl.hidden = true;
    editar.setAttribute('aria-expanded', 'false');
    editar.classList.remove('aberto');
    escolhaNaTela.limparSelecao();
  };
  const fecharFileira = (): void => {
    fecharEscolha();
    if (!aberta) return;
    aberta = false;
    fileira.hidden = true;
    botao.setAttribute('aria-expanded', 'false');
  };
  const soltarFoco = (): void => {
    if (document.activeElement && area.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  };
  /**
   * Manda. A fileira fecha (e a escolha com ela) e o foco sai do botão (um botão em foco segura Enter, M e H). Com a
   * escolha aberta e a tecla apertada, fica tudo aberto: quem está montando os seus oito quer testar uma tecla.
   */
  const enviar = (emoji: EmojiSala, manterAberto = false): boolean => {
    const foi = opcoes.aoSoltar(emoji);
    if (!(manterAberto && escolhaAberta)) {
      fecharFileira();
      soltarFoco();
    }
    return foi;
  };

  const aoTecla = (e: KeyboardEvent): void => {
    if (!visivel) return;
    if (e.key === 'Escape') {
      if (escolhaAberta) {
        fecharEscolha();
        soltarFoco();
      } else if (aberta) {
        fecharFileira();
        soltarFoco();
      }
      return;
    }
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || teclaEmCampoDeTexto(e.target)) return;
    const emoji = emojiDaTecla(e.code, escolha.emojis);
    if (emoji !== null) enviar(emoji, true);
  };
  const aoClicarNoBotao = (): void => (aberta ? fecharFileira() : abrirFileira());
  const aoClicarNoEditar = (): void => {
    if (escolhaAberta) fecharEscolha();
    else abrirEscolha();
    soltarFoco();
  };
  const aoFecharEscolha = (): void => {
    fecharEscolha();
    soltarFoco();
  };
  const aoClicarNaFileira = (e: MouseEvent): void => {
    const alvo = (e.target as Element | null)?.closest<HTMLElement>('.emoji-opcao');
    const emoji = alvo?.dataset.numero === undefined ? null : emojiDoNumero(Number(alvo.dataset.numero), escolha.emojis);
    if (emoji !== null) enviar(emoji);
  };
  const aoApertarFora = (e: PointerEvent): void => {
    if (aberta && !area.contains(e.target as Node | null)) fecharFileira();
  };
  window.addEventListener('keydown', aoTecla);
  window.addEventListener('pointerdown', aoApertarFora, true);
  botao.addEventListener('click', aoClicarNoBotao);
  editar.addEventListener('click', aoClicarNoEditar);
  escolhaFechar.addEventListener('click', aoFecharEscolha);
  fileira.addEventListener('click', aoClicarNaFileira);

  /** O topo da pilha: logo abaixo do `.hud-topo` (que cresce com as pílulas); sem HUD (sala de espera), no alto. */
  const ajustarTopo = (): void => {
    let topo = TOPO_SEM_HUD;
    if (!document.body.classList.contains('menu-aberto')) {
      const r = opcoes.topo.getBoundingClientRect();
      topo = r.height > 0 ? Math.round(r.bottom + FOLGA_DO_TOPO) : Math.round(r.bottom);
    }
    if (topo === topoAplicado) return;
    topoAplicado = topo;
    pilhaEl.style.top = `${topo}px`;
  };
  const observador =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          if (naTela.size > 0) ajustarTopo();
        });
  observador?.observe(opcoes.topo);

  const equipeDe = (b: BolhaDeEmoji, modo: ModoSala): number | null => (b.lugar === null ? null : equipeDoLugar(modo, b.lugar));
  const pintarEquipe = (nomeEl: HTMLElement, equipe: number | null): void => {
    if (equipe === null) {
      delete nomeEl.dataset.equipe;
      nomeEl.classList.add('espectador');
    } else {
      nomeEl.dataset.equipe = String(equipe);
      nomeEl.classList.remove('espectador');
    }
  };

  return {
    mostrar(v) {
      visivel = v;
      area.hidden = !v;
      if (!v) {
        fecharFileira();
        for (const { el: bolhaEl } of naTela.values()) bolhaEl.remove();
        naTela.clear();
        pilhaEl.hidden = true;
      }
    },
    atualizar(pilha, agoraMs, modo) {
      if (!visivel) return;
      const vivas = pilha.visiveis(agoraMs);
      if (vivas.length === 0 && naTela.size === 0) return;
      // A vida e o fade do desenho são os da pilha: o CSS não tem número próprio.
      if (tempoAplicado !== pilha.opcoes) {
        tempoAplicado = pilha.opcoes;
        pilhaEl.style.setProperty('--emoji-vida', `${pilha.opcoes.vidaMs}ms`);
        pilhaEl.style.setProperty('--emoji-fade', `${pilha.opcoes.fadeMs}ms`);
      }
      for (const [id, item] of naTela) {
        if (vivas.some((b) => b.id === id)) continue;
        item.el.remove();
        naTela.delete(id);
      }
      for (const b of vivas) {
        const equipe = equipeDe(b, modo);
        const existente = naTela.get(b.id);
        if (existente) {
          if (existente.equipe !== equipe) {
            existente.equipe = equipe;
            pintarEquipe(existente.nomeEl, equipe);
          }
          continue;
        }
        const bolhaEl = el('div', 'emoji-bolha');
        const nomeEl = el('span', 'emoji-nome', b.nome);
        pintarEquipe(nomeEl, equipe);
        bolhaEl.append(nomeEl, el('span', 'emoji-glifo', b.emoji));
        pilhaEl.append(bolhaEl);
        naTela.set(b.id, { el: bolhaEl, nomeEl, bolha: b, equipe });
      }
      pilhaEl.hidden = naTela.size === 0;
      if (naTela.size > 0) ajustarTopo();
    },
    soltar(numero) {
      const emoji = emojiDoNumero(numero, escolha.emojis);
      return visivel && emoji !== null ? enviar(emoji, true) : false;
    },
    alternarEscolha(abrir) {
      if (!visivel) return false;
      if (abrir ?? !escolhaAberta) abrirEscolha();
      else fecharEscolha();
      return true;
    },
    estado: () => ({
      visivel,
      fileiraAberta: aberta,
      escolhaAberta,
      escolha: escolhaNaTela.estado(),
      bolhas: [...naTela.values()].map(({ bolha, equipe }) => ({ id: bolha.id, nome: bolha.nome, emoji: bolha.emoji, lugar: bolha.lugar, equipe })),
    }),
    dispose() {
      window.removeEventListener('keydown', aoTecla);
      window.removeEventListener('pointerdown', aoApertarFora, true);
      botao.removeEventListener('click', aoClicarNoBotao);
      editar.removeEventListener('click', aoClicarNoEditar);
      escolhaFechar.removeEventListener('click', aoFecharEscolha);
      fileira.removeEventListener('click', aoClicarNaFileira);
      pararDeOuvirEscolha();
      escolhaNaTela.dispose();
      observador?.disconnect();
      pilhaEl.remove();
      area.remove();
    },
  };
}
