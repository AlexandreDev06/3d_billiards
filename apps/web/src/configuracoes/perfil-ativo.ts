import type { PerfilDeConfiguracao } from './gerente';

export const PERFIL_ONLINE = 'online';

export interface EntradaDoPerfil {
  readonly modo: 'menu' | 'local' | 'online';
  /** Hot-seat: quem tem a vez agora. */
  readonly jogadorDaVez: { readonly id: string; readonly nome: string } | null;
  /** Online: o nome de quem está neste aparelho (se já sentou). */
  readonly meuNome: string | null;
}

/**
 * De quem são as configurações em uso. Hot-seat: o perfil de quem joga agora (um por lugar, troca quando a vez
 * muda, como o giz). Online (e no menu, antes de escolher): o do jogador deste aparelho.
 */
export function perfilAtivo(e: EntradaDoPerfil): PerfilDeConfiguracao {
  if (e.modo === 'local' && e.jogadorDaVez) return { chave: `hotseat.${e.jogadorDaVez.id}`, rotulo: e.jogadorDaVez.nome };
  if (e.modo === 'online') return { chave: PERFIL_ONLINE, rotulo: e.meuNome ? `Você (${e.meuNome})` : 'Você' };
  return { chave: PERFIL_ONLINE, rotulo: 'Você (neste aparelho)' };
}
