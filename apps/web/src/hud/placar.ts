import { fundoCssDaFicha, type FichaDaBola } from '../cena/bola-estilo';
import type { IdBola } from '@sinuca/fisica';
import type { PontoNaTela } from '../cena/projecao';
import type { LinhaPlacar, MembroDoPlacar, ModeloPlacar } from './placar-modelo';

export interface Placar {
  /** Redesenha só se o modelo mudou. */
  mostrar(modelo: ModeloPlacar): void;
  /** Mostra a frase da última tacada até `duracaoMs` depois de `agoraMs`; `falta` a pinta de alerta. */
  mostrarTexto(texto: string, agoraMs: number, duracaoMs: number, falta?: boolean): void;
  /** O centro, em px da janela, da ficha da bola na linha da equipe do jogador (índice do primeiro da equipe em `jogadores`); sem a ficha, o centro da linha; `null` sem linha. */
  posicaoDaFicha(bola: IdBola, jogador: number): PontoNaTela | null;
  /** Acende a ficha da bola na linha do jogador por `ms` (a bola paga que acabou de chegar). */
  acenderFicha(bola: IdBola, jogador: number, agoraMs: number, ms: number): void;
  /** Peças ainda provisórias (física ou regras de teste); lista vazia esconde o aviso. */
  mostrarProvisorio(pecas: readonly string[]): void;
  /** Uma vez por quadro: esconde o texto quando o tempo acaba. */
  atualizar(agoraMs: number): void;
  dispose(): void;
}

/** A bolinha da bola: o número, a cor dele e lisa ou listrada como a casa manda (a mesma do placar e do aviso da bola final). */
export function criarFicha({ id, estilo }: FichaDaBola): HTMLElement {
  const ficha = document.createElement('span');
  ficha.className = 'placar-ficha';
  ficha.dataset.estilo = estilo;
  ficha.dataset.bola = String(id);
  ficha.style.background = fundoCssDaFicha(id, estilo);
  const numero = document.createElement('span');
  numero.textContent = String(id);
  ficha.append(numero);
  return ficha;
}

/** O nome de um jogador na linha, com a bolinha de presença (online) e o "você". Em dupla, o de quem taca ganha destaque. */
function criarMembro(membro: MembroDoPlacar, emDupla: boolean): HTMLElement {
  const el = document.createElement('span');
  el.className = 'placar-membro';
  el.classList.toggle('na-vez', emDupla && membro.naVez);
  if (membro.presenca) {
    const presenca = document.createElement('span');
    presenca.className = 'placar-presenca';
    presenca.dataset.estado = membro.presenca.conectado ? 'online' : 'caiu';
    presenca.title = membro.presenca.conectado ? 'Na sala' : 'Caiu da sala';
    el.append(presenca);
  }
  el.append(membro.nome);
  if (membro.presenca?.voce) {
    const voce = document.createElement('span');
    voce.className = 'placar-voce';
    voce.textContent = 'você';
    el.append(voce);
  }
  return el;
}

/** A marca de quem perde a próxima vez: discreta, ao lado do nome (e desce para a linha de baixo se o nome não deixa lugar). */
function criarMarcaDaPena(): HTMLElement {
  const perde = document.createElement('span');
  perde.className = 'placar-perde';
  perde.textContent = 'perde a próxima';
  perde.title = 'Perde a próxima vez';
  return perde;
}

/** Uma linha por equipe. `data-jogador` é o índice do primeiro da equipe: para lá voam as fichas da transição. */
function criarLinha(linha: LinhaPlacar): HTMLElement {
  const el = document.createElement('div');
  el.className = 'placar-linha';
  el.dataset.jogador = String(linha.jogador);
  el.classList.toggle('na-vez', linha.naVez);
  el.classList.toggle('perde-a-proxima', linha.perdeAProxima);
  el.dataset.equipe = String(linha.equipe);
  const emDupla = linha.membros.length > 1;
  el.classList.toggle('dupla', emDupla);
  const nome = document.createElement('span');
  nome.className = 'placar-nome';
  linha.membros.forEach((membro, k) => {
    if (k > 0) {
      const e = document.createElement('span');
      e.className = 'placar-e';
      e.textContent = 'e';
      nome.append(e);
    }
    nome.append(criarMembro(membro, emDupla));
    if (membro.perdeAProxima) nome.append(criarMarcaDaPena());
  });
  const grupo = document.createElement('span');
  grupo.className = 'placar-grupo';
  grupo.classList.toggle('indefinido', linha.grupo === null);
  grupo.textContent = linha.resumo;
  const fichas = document.createElement('span');
  fichas.className = 'placar-fichas';
  fichas.append(...linha.restantes.map(criarFicha), ...linha.encacapadas.map(criarFicha));
  if (linha.pontos !== null) {
    el.classList.add('por-pontos');
    grupo.dataset.pontos = String(linha.pontos);
  }
  if (linha.noCastigo) {
    el.classList.add('no-castigo');
    if (linha.bolaFinal !== null) fichas.append(criarFicha(linha.bolaFinal));
    const castigo = document.createElement('span');
    castigo.className = 'placar-castigo';
    castigo.textContent = linha.nomeDaBolaFinal === null ? 'última' : `só ${linha.nomeDaBolaFinal}`;
    fichas.append(castigo);
  }
  if (linha.naVez) {
    const vez = document.createElement('span');
    vez.className = 'placar-vez';
    vez.textContent = 'Vez';
    el.append(nome, vez, grupo, fichas);
  } else {
    el.append(nome, grupo, fichas);
  }
  return el;
}

/** `paiDoAviso`: onde ficam objetivo, frase da jogada e aviso de provisório (por padrão, junto do placar). */
export function criarPlacar(pai: HTMLElement, paiDoAviso: HTMLElement = pai): Placar {
  const raiz = document.createElement('div');
  raiz.className = 'placar';
  const linhas = document.createElement('div');
  linhas.className = 'placar-linhas';
  const aviso = document.createElement('div');
  aviso.className = 'aviso';
  const objetivo = document.createElement('div');
  objetivo.className = 'aviso-objetivo';
  const texto = document.createElement('div');
  texto.className = 'aviso-texto';
  texto.setAttribute('aria-live', 'polite');
  const provisorio = document.createElement('div');
  provisorio.className = 'aviso-provisorio';
  provisorio.hidden = true;
  aviso.append(objetivo, texto, provisorio);
  raiz.append(linhas);
  pai.append(raiz);
  paiDoAviso.append(aviso);

  let ultimaChave = '';
  let fimDoTextoMs = 0;
  const acesas: { readonly el: Element; readonly fimMs: number }[] = [];

  const fichaDe = (bola: IdBola, jogador: number): Element | null => linhas.querySelector(`[data-jogador="${jogador}"] [data-bola="${bola}"]`);
  const alvoDe = (bola: IdBola, jogador: number): Element | null => fichaDe(bola, jogador) ?? linhas.querySelector(`[data-jogador="${jogador}"]`);

  return {
    mostrar(modelo) {
      const chave = JSON.stringify(modelo);
      if (chave === ultimaChave) return;
      ultimaChave = chave;
      linhas.replaceChildren(...modelo.linhas.map(criarLinha));
      objetivo.textContent = modelo.objetivo;
    },
    mostrarTexto(frase, agoraMs, duracaoMs, falta = false) {
      texto.textContent = frase;
      texto.classList.toggle('visivel', frase !== '');
      texto.classList.toggle('falta', falta && frase !== '');
      fimDoTextoMs = frase === '' ? 0 : agoraMs + duracaoMs;
    },
    posicaoDaFicha(bola, jogador) {
      const el = alvoDe(bola, jogador);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, tamanho: Math.min(r.width, r.height) };
    },
    acenderFicha(bola, jogador, agoraMs, ms) {
      const el = fichaDe(bola, jogador);
      if (!el) return;
      el.classList.add('acesa');
      acesas.push({ el, fimMs: agoraMs + ms });
    },
    mostrarProvisorio(pecas) {
      provisorio.hidden = pecas.length === 0;
      provisorio.textContent = pecas.length === 0 ? '' : `Provisório: ${pecas.join(', ')}`;
    },
    atualizar(agoraMs) {
      if (fimDoTextoMs !== 0 && agoraMs >= fimDoTextoMs) {
        fimDoTextoMs = 0;
        texto.classList.remove('visivel');
      }
      for (let i = acesas.length - 1; i >= 0; i--) {
        if (agoraMs < acesas[i]!.fimMs) continue;
        acesas[i]!.el.classList.remove('acesa');
        acesas.splice(i, 1);
      }
    },
    dispose() {
      raiz.remove();
      aviso.remove();
    },
  };
}
