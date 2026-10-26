import type { LinhaSala } from '@sinuca/protocolo';
import type { ConfigPrevisao, PerfilDeQualidade } from '../config';

/** A linha de previsão como regra da partida: ligada ou não e, ligada, se mostra também a primeira bola atingida. */
export interface LinhaDaPartida {
  readonly previsao: boolean;
  readonly bolaAtingida: boolean;
}

/** Só estas três existem (`linhaDe` devolve sempre uma delas): comparar por identidade basta e ninguém aloca por quadro. */
export const LINHA_DESLIGADA: LinhaDaPartida = Object.freeze({ previsao: false, bolaAtingida: false });
export const LINHA_DO_CAMINHO: LinhaDaPartida = Object.freeze({ previsao: true, bolaAtingida: false });
export const LINHA_COMPLETA: LinhaDaPartida = Object.freeze({ previsao: true, bolaAtingida: true });

/** `bolaAtingida` só vale com a previsão ligada. */
export function linhaDe(previsao: boolean, bolaAtingida: boolean): LinhaDaPartida {
  if (!previsao) return LINHA_DESLIGADA;
  return bolaAtingida ? LINHA_COMPLETA : LINHA_DO_CAMINHO;
}

/** O que a sala manda (`estado-sala.linha`, `criar-sala.linha`) como linha da partida; ausente = desligada. */
export function linhaDaSala(linha: LinhaSala | null | undefined): LinhaDaPartida {
  return linha ? linhaDe(linha.previsao, linha.bolaAtingida === true) : LINHA_DESLIGADA;
}

/** A mesma escolha no formato do protocolo, sempre completa. */
export function linhaParaSala(linha: LinhaDaPartida): LinhaSala {
  return { previsao: linha.previsao, bolaAtingida: linha.previsao && linha.bolaAtingida };
}

/**
 * A linha que vale agora. Online manda a sala, e só ela: ninguém liga sozinho (nem com L, nem com `?dev=1`, nem pelo
 * painel); sem `estado-sala` ainda, desligada. No hot-seat vale a escolha local (a da tela inicial, que o painel dev ainda
 * pode mudar).
 */
export function linhaEfetiva(online: boolean, sala: LinhaSala | null | undefined, local: LinhaDaPartida): LinhaDaPartida {
  return online ? linhaDaSala(sala) : linhaDe(local.previsao, local.bolaAtingida);
}

/** Só no hot-seat dá para mudar a linha depois de começar (L e painel F1); online ela é regra da sala. */
export const linhaEditavel = (online: boolean): boolean => !online;

/** `?linha=1` liga o caminho e `?linha=2` também a bola atingida, no hot-seat que pula a tela inicial (testes e capturas). */
export function linhaDaUrl(busca: string): LinhaDaPartida | null {
  const pedida = new URLSearchParams(busca).get('linha');
  if (pedida === '1') return LINHA_DO_CAMINHO;
  if (pedida === '2') return LINHA_COMPLETA;
  return null;
}

/**
 * A config da previsão que a cena usa: a base (`CONFIG_WEB.previsao`) com a linha da partida, a força da tacada prevista e
 * o custo do nível de qualidade por cima.
 */
export function configDaPrevisao(
  base: ConfigPrevisao,
  o: { readonly linha: LinhaDaPartida; readonly perfil: Pick<PerfilDeQualidade, 'previsao'>; readonly velocidadeTaco?: number },
): ConfigPrevisao {
  return {
    ...base,
    ligada: o.linha.previsao,
    bolaAtingida: o.linha.previsao && o.linha.bolaAtingida,
    velocidadeTaco: o.velocidadeTaco ?? base.velocidadeTaco,
    espacoMinimoMs: o.perfil.previsao.espacoMinimoMs,
    fatorCusto: o.perfil.previsao.fatorCusto,
    duracaoMaximaS: o.perfil.previsao.duracaoMaximaS,
  };
}
