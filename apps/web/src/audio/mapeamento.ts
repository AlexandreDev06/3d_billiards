import type { EventoTacada } from '@sinuca/fisica';
import type { ConfigAudio } from '../config';

/** Os sons dos eventos da tacada (pela física). */
export type SomDeEvento = 'taco-bola' | 'bola-bola' | 'bola-tabela' | 'cacapa';
/** Os avisos de interface: troca de vez, fim do tempo e missão cumprida (L32). Não têm velocidade nem faixa de intensidade. */
export type SomDeAviso = 'vez-outro' | 'vez-sua' | 'tempo-esgotado' | 'moedas';
export type NomeDoSom = SomDeEvento | SomDeAviso;

export const SONS_DE_AVISO: readonly SomDeAviso[] = ['vez-outro', 'vez-sua', 'tempo-esgotado', 'moedas'];

export interface PedidoDeSom {
  readonly som: NomeDoSom;
  /** 0 = inaudível; 1 = impacto cheio. */
  readonly volume: number;
  /** Multiplicador de frequência para o gerador. */
  readonly tom: number;
  /** 0 a 1: o quanto o impacto foi forte (velocidade / `velocidadeCheia`). Escolhe a variação da amostra; o sintetizado ignora. */
  readonly intensidade: number;
}

const fracaoDaVelocidade = (velocidade: number, cfg: ConfigAudio): number =>
  Number.isFinite(velocidade) ? Math.min(Math.max(velocidade / cfg.velocidadeCheia, 0), 1) : 0;

/** Volume (0–1) de um impacto a `velocidade` m/s; 0 abaixo de `velocidadeMudo`. */
export function volumeDaVelocidade(velocidade: number, cfg: ConfigAudio): number {
  if (!(velocidade >= cfg.velocidadeMudo)) return 0;
  return cfg.volumeMin + (1 - cfg.volumeMin) * fracaoDaVelocidade(velocidade, cfg) ** cfg.expoenteVolume;
}

/** Multiplicador de frequência: impacto forte soa mais agudo. */
export function tomDaVelocidade(velocidade: number, cfg: ConfigAudio): number {
  return cfg.tomMin + (cfg.tomMax - cfg.tomMin) * fracaoDaVelocidade(velocidade, cfg);
}

/** O pedido de um aviso de interface: volume cheio (o ganho do arquivo e o volume geral decidem o resto), sem mudança de tom. */
export function pedidoDeAviso(som: SomDeAviso): PedidoDeSom {
  return { som, volume: 1, tom: 1, intensidade: 0.5 };
}

/** Qual som um evento da tacada pede; `null` para os que não têm (parou, fora-da-mesa). */
export function pedidoDoEvento(evento: EventoTacada, cfg: ConfigAudio): PedidoDeSom | null {
  switch (evento.tipo) {
    case 'taco-bola':
    case 'bola-bola':
    case 'bola-tabela':
      return {
        som: evento.tipo,
        volume: volumeDaVelocidade(evento.velocidade, cfg),
        tom: tomDaVelocidade(evento.velocidade, cfg),
        intensidade: fracaoDaVelocidade(evento.velocidade, cfg),
      };
    case 'cacapa':
      return { som: 'cacapa', volume: cfg.volumeCacapa, tom: (cfg.tomMin + cfg.tomMax) / 2, intensidade: 0.5 };
    case 'fora-da-mesa':
    case 'parou':
      return null;
  }
}
