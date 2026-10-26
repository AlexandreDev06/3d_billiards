import { EMOJIS_DA_SALA, EMOJIS_PADRAO, type EmojiSala } from '@sinuca/protocolo';
import { ehEmojiDaSala, ehSlotDeEmoji, QUANTOS_EMOJIS, type EmojisEscolhidos } from '../configuracoes/emojis-escolhidos';

/** O que a tela de escolha mostra agora (para o gancho de teste). */
export interface EstadoDaEscolhaNaTela {
  /** O slot (1 a 8) marcado para receber o próximo emoji; `null` = nenhum. */
  readonly selecionado: number | null;
  /** Os oito de agora, como estão desenhados nos slots. */
  readonly slots: readonly string[];
  readonly dica: string;
}

export interface EscolhaDeEmojisNaTela {
  readonly raiz: HTMLElement;
  estado(): EstadoDaEscolhaNaTela;
  /** Tira a marca do slot: o próximo clique num emoji não muda nada. */
  limparSelecao(): void;
  dispose(): void;
}

const DICA_SEM_SLOT = 'Clique num número e depois no emoji. Ou arraste o emoji até o número.';
const DICA_SEM_SLOT_PEDIDA = 'Escolha primeiro o número da tecla que vai mudar.';
const TIPO_ARRASTE = 'text/plain';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

/**
 * A escolha dos oito emojis (teclas 1 a 8): os oito slots numerados em cima e, embaixo, a grade do catálogo inteiro da sala.
 * Clica no slot e depois no emoji (ou arrasta o emoji, ou outro slot, até o slot); quem já estava noutro slot troca de
 * lugar. Tudo vale na hora, pelo `EmojisEscolhidos`: vários desta escolha podem estar na tela ao mesmo tempo (a engrenagem
 * e a que abre pela fileira do botão de emoji) e todos se atualizam juntos. `compacta` põe os slots ao lado da grade (a
 * engrenagem, que não tem altura de sobra); sem ela os slots ficam em cima da grade.
 */
export function criarEscolhaDeEmojis(escolha: EmojisEscolhidos, opcoes: { readonly compacta?: boolean } = {}): EscolhaDeEmojisNaTela {
  const raiz = el('div', opcoes.compacta ? 'emojis-escolha compacta' : 'emojis-escolha');
  const dica = el('p', 'emojis-escolha-dica', DICA_SEM_SLOT);
  dica.setAttribute('aria-live', 'polite');

  const slotsEl = el('div', 'emojis-escolha-slots');
  slotsEl.setAttribute('role', 'group');
  slotsEl.setAttribute('aria-label', 'Os seus emojis, um para cada tecla de 1 a 8');
  const slots = Array.from({ length: QUANTOS_EMOJIS }, (_, i) => {
    const b = el('button', 'emoji-slot');
    b.type = 'button';
    b.draggable = true;
    b.dataset.slot = String(i + 1);
    b.setAttribute('aria-pressed', 'false');
    const tecla = el('span', 'emoji-slot-tecla', String(i + 1));
    const glifo = el('span', 'emoji-slot-glifo');
    b.append(tecla, glifo);
    return { b, glifo };
  });
  slotsEl.append(...slots.map((s) => s.b));

  const grade = el('div', 'emojis-escolha-grade');
  grade.setAttribute('role', 'group');
  grade.setAttribute('aria-label', 'Todos os emojis da sala');
  const catalogo = new Map<EmojiSala, { readonly b: HTMLButtonElement; readonly marca: HTMLElement }>();
  for (const emoji of EMOJIS_DA_SALA) {
    const b = el('button', 'emoji-catalogo');
    b.type = 'button';
    b.draggable = true;
    b.dataset.emoji = emoji;
    b.title = emoji;
    const glifo = el('span', 'emoji-catalogo-glifo', emoji);
    const marca = el('span', 'emoji-catalogo-marca');
    marca.hidden = true;
    b.append(glifo, marca);
    grade.append(b);
    catalogo.set(emoji, { b, marca });
  }

  const acoes = el('div', 'emojis-escolha-acoes');
  const restaurar = el('button', 'hud-botao emojis-escolha-restaurar', 'Restaurar padrão');
  restaurar.type = 'button';
  restaurar.title = `Volta aos oito emojis de sempre (${EMOJIS_PADRAO.join(' ')})`;
  acoes.append(restaurar);

  raiz.append(dica, slotsEl, grade, acoes);

  let selecionado: number | null = null;

  const desenhar = (): void => {
    const doSlot = escolha.emojis;
    slots.forEach(({ b, glifo }, i) => {
      const emoji = doSlot[i] ?? '';
      glifo.textContent = emoji;
      b.title = `Tecla ${i + 1}: ${emoji}`;
      b.setAttribute('aria-label', `Tecla ${i + 1}: ${emoji}`);
      const marcado = selecionado === i + 1;
      b.classList.toggle('marcado', marcado);
      b.setAttribute('aria-pressed', String(marcado));
    });
    for (const [emoji, { b, marca }] of catalogo) {
      const slot = escolha.slotDe(emoji);
      b.classList.toggle('escolhido', slot !== null);
      marca.hidden = slot === null;
      marca.textContent = slot === null ? '' : String(slot);
      b.setAttribute('aria-label', slot === null ? emoji : `${emoji}, na tecla ${slot}`);
    }
    restaurar.disabled = escolha.padrao;
    dica.textContent = selecionado === null ? DICA_SEM_SLOT : `Agora clique no emoji que vai na tecla ${selecionado}.`;
    dica.classList.remove('pedindo');
  };

  /** Clique do mouse tira o foco do botão (um botão em foco segura M e H); Enter e Espaço (`detail` 0) o mantêm. */
  const soltarFoco = (alvo: HTMLElement | null | undefined, e: MouseEvent): void => {
    if (e.detail > 0) alvo?.blur();
  };

  const aoClicarNosSlots = (e: MouseEvent): void => {
    const alvo = (e.target as Element | null)?.closest<HTMLElement>('.emoji-slot');
    const n = alvo === null || alvo === undefined ? NaN : Number(alvo.dataset.slot);
    if (!ehSlotDeEmoji(n)) return;
    soltarFoco(alvo, e);
    selecionado = selecionado === n ? null : n;
    desenhar();
  };
  const aoClicarNaGrade = (e: MouseEvent): void => {
    const alvo = (e.target as Element | null)?.closest<HTMLElement>('.emoji-catalogo');
    const emoji = alvo?.dataset.emoji;
    if (!ehEmojiDaSala(emoji)) return;
    soltarFoco(alvo, e);
    if (selecionado === null) {
      dica.textContent = DICA_SEM_SLOT_PEDIDA;
      dica.classList.add('pedindo');
      return;
    }
    const slot = selecionado;
    selecionado = null;
    // Se nada mudou (o emoji já era o do slot), `desenhar` não vem do aviso: faz aqui.
    if (!escolha.escolher(slot, emoji)) desenhar();
  };
  const aoRestaurar = (e: MouseEvent): void => {
    soltarFoco(restaurar, e);
    selecionado = null;
    escolha.restaurar();
    desenhar();
  };
  slotsEl.addEventListener('click', aoClicarNosSlots);
  grade.addEventListener('click', aoClicarNaGrade);
  restaurar.addEventListener('click', aoRestaurar);

  // Arrastar: um emoji da grade, ou o de outro slot, até o slot. O destino recebe o emoji; se ele estava noutro slot, trocam.
  const emojiDoArraste = (e: DragEvent): EmojiSala | null => {
    const bruto = e.dataTransfer?.getData(TIPO_ARRASTE);
    return ehEmojiDaSala(bruto) ? bruto : null;
  };
  const aoComecarArraste = (e: DragEvent): void => {
    const alvo = e.target as Element | null;
    const doCatalogo = alvo?.closest<HTMLElement>('.emoji-catalogo')?.dataset.emoji;
    const doSlot = alvo?.closest<HTMLElement>('.emoji-slot')?.dataset.slot;
    const emoji = ehEmojiDaSala(doCatalogo) ? doCatalogo : doSlot === undefined ? null : escolha.doSlot(Number(doSlot));
    if (emoji === null || !e.dataTransfer) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(TIPO_ARRASTE, emoji);
    e.dataTransfer.effectAllowed = 'copyMove';
  };
  const slotDoAlvo = (e: Event): HTMLElement | null => (e.target as Element | null)?.closest<HTMLElement>('.emoji-slot') ?? null;
  const aoPassarComArraste = (e: DragEvent): void => {
    const slot = slotDoAlvo(e);
    if (!slot) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    slot.classList.add('alvo');
  };
  const aoSairComArraste = (e: DragEvent): void => {
    const slot = slotDoAlvo(e);
    if (slot && !slot.contains(e.relatedTarget as Node | null)) slot.classList.remove('alvo');
  };
  const aoSoltarArraste = (e: DragEvent): void => {
    const slot = slotDoAlvo(e);
    if (!slot) return;
    e.preventDefault();
    slot.classList.remove('alvo');
    const emoji = emojiDoArraste(e);
    const n = Number(slot.dataset.slot);
    if (emoji !== null && ehSlotDeEmoji(n)) {
      selecionado = null;
      if (!escolha.escolher(n, emoji)) desenhar();
    }
  };
  const aoTerminarArraste = (): void => {
    for (const { b } of slots) b.classList.remove('alvo');
  };
  raiz.addEventListener('dragstart', aoComecarArraste);
  raiz.addEventListener('dragend', aoTerminarArraste);
  slotsEl.addEventListener('dragover', aoPassarComArraste);
  slotsEl.addEventListener('dragleave', aoSairComArraste);
  slotsEl.addEventListener('drop', aoSoltarArraste);

  const pararDeOuvir = escolha.aoMudar(desenhar);
  desenhar();

  return {
    raiz,
    estado: () => ({ selecionado, slots: slots.map((s) => s.glifo.textContent ?? ''), dica: dica.textContent ?? '' }),
    limparSelecao() {
      if (selecionado === null) return;
      selecionado = null;
      desenhar();
    },
    dispose() {
      pararDeOuvir();
      slotsEl.removeEventListener('click', aoClicarNosSlots);
      grade.removeEventListener('click', aoClicarNaGrade);
      restaurar.removeEventListener('click', aoRestaurar);
      raiz.removeEventListener('dragstart', aoComecarArraste);
      raiz.removeEventListener('dragend', aoTerminarArraste);
      slotsEl.removeEventListener('dragover', aoPassarComArraste);
      slotsEl.removeEventListener('dragleave', aoSairComArraste);
      slotsEl.removeEventListener('drop', aoSoltarArraste);
      raiz.remove();
    },
  };
}
