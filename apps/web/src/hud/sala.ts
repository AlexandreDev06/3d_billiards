import { LIMITES_PROTOCOLO, equipeDoLugar, type ModoSala } from '@sinuca/protocolo';
import { teclaEmCampo } from '../controles/campo';
import type { LogDeChat } from '../online/chat-modelo';
import type { EstadoDaConexao } from '../online/cliente-sala';

export interface OpcoesHudSala {
  readonly aoEnviarChat: (texto: string) => void;
  readonly aoCopiarLink: () => Promise<boolean>;
  readonly aoSair: () => void;
  /** O campo do chat vai abrir: quem chama solta o mouse para o cursor aparecer. */
  readonly aoAbrirChat: () => void;
  /** "Tentar agora" no aviso de conexão perdida. */
  readonly aoReconectar: () => void;
}

export interface HudSala {
  /** Mostra o painel da sala com o código; `null` o esconde. */
  mostrar(codigo: string | null): void;
  definirConexao(estado: EstadoDaConexao): void;
  /** Uma vez por quadro: redesenha só se as linhas visíveis mudaram. `modo` é o da sala: dele vem a cor (equipe) de cada nome. */
  atualizarChat(log: LogDeChat, agoraMs: number, modo: ModoSala): void;
  readonly chatAberto: boolean;
  dispose(): void;
}

const LINHAS_FECHADO = 5;
const LINHAS_ABERTO = 12;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/**
 * Embaixo à esquerda: o código da sala, copiar o link, sair e o chat curto (Enter abre o campo, Enter
 * manda, Esc fecha). Em cima, no meio, o aviso de conexão perdida.
 */
export function criarHudSala(pai: HTMLElement, opcoes: OpcoesHudSala): HudSala {
  const raiz = el('div', 'hud-sala');
  raiz.hidden = true;
  const topo = el('div', 'hud-sala-topo');
  const codigoEl = el('span', 'hud-sala-codigo');
  const rotulo = el('span', 'hud-sala-rotulo', 'Sala');
  const copiar = el('button', 'hud-botao hud-sala-botao', 'Link');
  copiar.type = 'button';
  copiar.title = 'Copiar o link de convite';
  const sair = el('button', 'hud-botao hud-sala-botao', 'Sair');
  sair.type = 'button';
  sair.title = 'Sair da sala';
  topo.append(rotulo, codigoEl, copiar, sair);

  const linhasEl = el('div', 'hud-sala-chat');
  linhasEl.setAttribute('aria-live', 'polite');
  const dica = el('div', 'hud-sala-dica');
  dica.append(el('kbd', 'hud-tecla', 'Enter'), ' conversar');
  const entrada = el('input', 'hud-sala-entrada');
  entrada.type = 'text';
  entrada.maxLength = LIMITES_PROTOCOLO.chat;
  entrada.placeholder = 'Mensagem (Enter envia, Esc fecha)';
  entrada.autocomplete = 'off';
  entrada.name = 'mensagem';
  entrada.hidden = true;
  raiz.append(topo, linhasEl, dica, entrada);

  const conexao = el('div', 'hud-conexao');
  conexao.hidden = true;
  conexao.setAttribute('role', 'status');
  const conexaoTexto = el('span', 'hud-conexao-texto');
  const reconectar = el('button', 'hud-botao hud-conexao-botao', 'Tentar agora');
  reconectar.type = 'button';
  conexao.append(conexaoTexto, reconectar);
  pai.append(raiz, conexao);

  let aberto = false;
  let ultimaAssinatura = '';
  let visivel = false;

  const abrir = (): void => {
    if (aberto || !visivel) return;
    aberto = true;
    opcoes.aoAbrirChat();
    entrada.hidden = false;
    dica.hidden = true;
    raiz.classList.add('aberto');
    entrada.focus();
    ultimaAssinatura = '';
  };
  const fechar = (): void => {
    if (!aberto) return;
    aberto = false;
    entrada.value = '';
    entrada.hidden = true;
    dica.hidden = false;
    raiz.classList.remove('aberto');
    entrada.blur();
    ultimaAssinatura = '';
  };

  const aoTecla = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || teclaEmCampo(e.target)) return;
    e.preventDefault();
    abrir();
  };
  const aoTeclaNoCampo = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const texto = entrada.value.trim();
      if (texto !== '') opcoes.aoEnviarChat(texto);
      fechar();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      fechar();
    }
  };
  const aoCopiar = (): void => {
    void opcoes.aoCopiarLink().then((ok) => {
      copiar.textContent = ok ? 'Copiado!' : 'Copie à mão';
      setTimeout(() => (copiar.textContent = 'Link'), 2000);
    });
  };
  window.addEventListener('keydown', aoTecla);
  entrada.addEventListener('keydown', aoTeclaNoCampo);
  copiar.addEventListener('click', aoCopiar);
  sair.addEventListener('click', opcoes.aoSair);
  reconectar.addEventListener('click', opcoes.aoReconectar);

  return {
    get chatAberto() {
      return aberto;
    },
    mostrar(codigo) {
      visivel = codigo !== null;
      raiz.hidden = !visivel;
      if (codigo !== null) codigoEl.textContent = codigo;
      else {
        fechar();
        conexao.hidden = true;
        linhasEl.replaceChildren();
        ultimaAssinatura = '';
      }
    },
    definirConexao(estado) {
      let texto = '';
      let botao = false;
      if (estado.fase === 'conectando') texto = estado.tentativa > 0 ? 'Reconectando à sala…' : 'Conectando à sala…';
      else if (estado.fase === 'reconectando') {
        texto = `Sem conexão com a sala. Tentando voltar (tentativa ${estado.tentativa})…`;
        botao = true;
      }
      conexao.hidden = texto === '' || !visivel;
      conexao.classList.toggle('conectando', estado.fase === 'conectando');
      conexaoTexto.textContent = texto;
      reconectar.hidden = !botao;
    },
    atualizarChat(log, agoraMs, modo) {
      const linhas = log.visiveis(agoraMs, aberto, aberto ? LINHAS_ABERTO : LINHAS_FECHADO);
      const assinatura = `${aberto}:${modo}:${linhas.map((l) => l.id).join(',')}`;
      if (assinatura === ultimaAssinatura) return;
      ultimaAssinatura = assinatura;
      linhasEl.replaceChildren(
        ...linhas.map((l) => {
          const linha = el('div', l.aviso ? 'chat-linha aviso' : 'chat-linha');
          if (l.aviso) {
            linha.textContent = l.texto;
          } else {
            const nome = el('span', 'chat-nome', l.nome);
            if (l.lugar !== null) nome.dataset.equipe = String(equipeDoLugar(modo, l.lugar));
            linha.append(nome, ' ', l.texto);
          }
          return linha;
        }),
      );
      linhasEl.scrollTop = linhasEl.scrollHeight;
    },
    dispose() {
      window.removeEventListener('keydown', aoTecla);
      entrada.removeEventListener('keydown', aoTeclaNoCampo);
      copiar.removeEventListener('click', aoCopiar);
      sair.removeEventListener('click', opcoes.aoSair);
      reconectar.removeEventListener('click', opcoes.aoReconectar);
      raiz.remove();
      conexao.remove();
    },
  };
}
