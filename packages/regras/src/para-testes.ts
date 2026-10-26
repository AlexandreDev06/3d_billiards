import type { EventoTacada, IdBola, Rng } from '@sinuca/fisica';
import { bolasDaCasa } from './leitura';
import { PRESET_BOTECO, PRESET_MATA_MATA } from './presets';
import type { ConfigRegras, Encacapada, EstadoPartida, FasePartida, Grupo, Jogador } from './tipos';

export const ANA = 0;
export const BETO = 1;

export const JOGADORES: readonly Jogador[] = [
  { id: 'a', nome: 'Ana', equipe: 0 },
  { id: 'b', nome: 'Beto', equipe: 1 },
];

export const CAIO = 2;
export const DANI = 3;

/** 2×2 na ordem da roda: Ana e Caio (equipe 0) contra Beto e Dani (equipe 1). */
export const DUPLAS: readonly Jogador[] = [...JOGADORES, { id: 'c', nome: 'Caio', equipe: 0 }, { id: 'd', nome: 'Dani', equipe: 1 }];

/** 2×1 na ordem da roda: Ana e Caio (equipe 0, índices 0 e 2) contra Beto sozinho (equipe 1, índice 1). */
export const DOIS_CONTRA_UM: readonly Jogador[] = [...JOGADORES, { id: 'c', nome: 'Caio', equipe: 0 }];

/** 1×2 na ordem da roda: Ana sozinha (equipe 0, índice 0) contra Beto e Dani (equipe 1, índices 1 e 2). */
export const UM_CONTRA_DOIS: readonly Jogador[] = [...JOGADORES, { id: 'd', nome: 'Dani', equipe: 1 }];

/** Mata-mata na ordem da roda: Ana, Beto e Caio, cada um na sua equipe (0, 1 e 2). */
export const TRIO: readonly Jogador[] = [...JOGADORES, { id: 'c', nome: 'Caio', equipe: 2 }];

/** Mata-mata na ordem da roda: Ana, Beto, Caio e Dani, cada um na sua equipe (0 a 3). */
export const QUARTETO: readonly Jogador[] = [...TRIO, { id: 'd', nome: 'Dani', equipe: 3 }];

export const config = (mudanca: Partial<ConfigRegras> = {}): ConfigRegras => ({ ...PRESET_BOTECO.regras, ...mudanca });

/** A casa do Boteco até o L8, que segue como opção: 1 a 15, a 1 é o castigo e entra na tabela depois da saída. */
export const CASTIGO_1: Partial<ConfigRegras> = { bolas: '1-15', bolaFinal: 1, castigoInicio: 'depois-da-saida', castigoLugar: 'tabela-lado-saida' };

/** 2 a 15 sem bola final: vence quem encaçapa a última do grupo (a última volta para a tabela, como antes do L8). */
export const SEM_FINAL: Partial<ConfigRegras> = { bolas: '2-15', bolaFinal: 'ultima-do-grupo', castigoLugar: 'tabela-lado-saida' };

/** A config do mata-mata (preset de fábrica), com `mudanca` por cima. */
export const configMataMata = (mudanca: Partial<ConfigRegras> = {}): ConfigRegras => ({ ...PRESET_MATA_MATA.regras, ...mudanca });

/** Só o suicídio sem pena (cegar segue como o preset manda: perde a próxima vez). */
export const SEM_PENA_NO_SUICIDIO: Partial<ConfigRegras> = { suicidioNoMataMata: 'sem-pena' };

/** Só cegar sem pena (o suicídio segue como o preset manda: perde a próxima vez). */
export const SEM_PENA_NO_CEGAR: Partial<ConfigRegras> = { cegarNoMataMata: 'sem-pena' };

/** O mata-mata de antes do L19: nenhuma falta custa a vez de ninguém. */
export const SEM_PENA_NAS_FALTAS: Partial<ConfigRegras> = { ...SEM_PENA_NO_SUICIDIO, ...SEM_PENA_NO_CEGAR };

/** Quem encaçapou cada bola, em ordem de queda: `matou(0, [5, 9], 1, [2])` = Ana a 5 e a 9, depois Beto a 2. */
export function matou(...quem: (number | readonly number[])[]): Encacapada[] {
  const lista: Encacapada[] = [];
  let jogador = 0;
  for (const item of quem) {
    if (typeof item === 'number') jogador = item;
    else for (const bola of item) lista.push({ bola, jogador });
  }
  return lista;
}

/** LCG de teste: as regras só importam tipos da física, nem o RNG dela. */
export function rngDeTeste(semente: number): Rng {
  let s = semente >>> 0;
  return {
    proximo() {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    },
  };
}

export interface Mesa {
  readonly naMesa: readonly IdBola[];
  /** `JOGADORES` (1×1) se omitido. */
  readonly jogadores?: readonly Jogador[];
  readonly grupos?: readonly (Grupo | null)[];
  readonly vez?: number;
  readonly vezDaRoda?: number;
  readonly proximoDaRoda?: number;
  readonly fase?: FasePartida;
  readonly retiradas?: readonly IdBola[];
  readonly regras?: Partial<ConfigRegras>;
}

/** Partida no meio do jogo: o que não está em `naMesa` nem em `retiradas` conta como encaçapado por Ana. */
export function partidaCom(m: Mesa): EstadoPartida {
  const c = config(m.regras);
  const todas = bolasDaCasa(c);
  const retiradas = m.retiradas ?? [];
  const grupos = m.grupos ?? ['par', 'impar'];
  return {
    config: c,
    jogadores: m.jogadores ?? JOGADORES,
    vez: m.vez ?? ANA,
    ...(m.vezDaRoda === undefined ? {} : { vezDaRoda: m.vezDaRoda }),
    ...(m.proximoDaRoda === undefined ? {} : { proximoDaRoda: m.proximoDaRoda }),
    grupos,
    fase: m.fase ?? (grupos[0] === null ? 'aberta' : 'grupos'),
    naMesa: [...m.naMesa],
    encacapadas: todas.filter((b) => !m.naMesa.includes(b) && !retiradas.includes(b)).map((bola) => ({ bola, jogador: ANA })),
    retiradas: [...retiradas],
    vencedor: null,
  };
}

export const numeros = (de: number, ate: number): IdBola[] => Array.from({ length: ate - de + 1 }, (_, i) => de + i);

export interface Tacada {
  /** Primeira(s) bola(s) que a branca toca; várias = toque simultâneo. */
  readonly toca?: IdBola | readonly IdBola[];
  /** Bolas que caem, em ordem. */
  readonly caem?: readonly IdBola[];
  /** Bolas numeradas que pulam para fora da mesa. */
  readonly pulam?: readonly IdBola[];
  readonly branca?: 'cai' | 'fora';
  /** Bolas que batem na tabela e não caem (ex.: voltou da caçapa). */
  readonly batem?: readonly IdBola[];
}

/** Eventos da física escritos à mão, em ordem de `t`, terminando em `parou`. */
export function eventos(t: Tacada = {}): EventoTacada[] {
  const lista: EventoTacada[] = [{ tipo: 'taco-bola', t: 0, bola: 0, velocidade: 3, miscue: false }];
  const toca = t.toca === undefined ? [] : typeof t.toca === 'number' ? [t.toca] : t.toca;
  for (const b of toca) lista.push({ tipo: 'bola-bola', t: 0.1, a: 0, b, velocidade: 2 });
  (t.batem ?? []).forEach((bola, k) => lista.push({ tipo: 'bola-tabela', t: 0.15 + k * 0.01, bola, tabela: 0, velocidade: 1 }));
  (t.caem ?? []).forEach((bola, k) => lista.push({ tipo: 'cacapa', t: 0.2 + k * 0.01, bola, cacapa: 'canto' }));
  (t.pulam ?? []).forEach((bola, k) => lista.push({ tipo: 'fora-da-mesa', t: 0.3 + k * 0.01, bola }));
  if (t.branca === 'cai') lista.push({ tipo: 'cacapa', t: 0.4, bola: 0, cacapa: 'meio' });
  if (t.branca === 'fora') lista.push({ tipo: 'fora-da-mesa', t: 0.4, bola: 0 });
  lista.push({ tipo: 'parou', t: 1 });
  return lista;
}

/** Congela fundo, para provar que as regras não mudam a entrada. */
export function congelar<T>(x: T): T {
  if (typeof x === 'object' && x !== null && !Object.isFrozen(x)) {
    Object.freeze(x);
    for (const v of Object.values(x)) congelar(v);
  }
  return x;
}

export interface MesaMataMata {
  readonly naMesa: readonly IdBola[];
  /** `JOGADORES` (2) se omitido. */
  readonly jogadores?: readonly Jogador[];
  readonly vez?: number;
  readonly fase?: FasePartida;
  /** Quem matou cada bola (`matou`); o que não está em `naMesa` nem aqui nunca existiu na partida. */
  readonly encacapadas?: readonly Encacapada[];
  readonly regras?: Partial<ConfigRegras>;
}

/** Partida de mata-mata no meio do jogo: sem grupos, uma equipe por jogador, `aberta` se não disser outra fase. */
export function mataMataCom(m: MesaMataMata): EstadoPartida {
  const jogadores = m.jogadores ?? JOGADORES;
  return {
    config: configMataMata(m.regras),
    jogadores,
    vez: m.vez ?? ANA,
    grupos: jogadores.map(() => null),
    fase: m.fase ?? 'aberta',
    naMesa: [...m.naMesa],
    encacapadas: [...(m.encacapadas ?? [])],
    retiradas: [],
    vencedor: null,
  };
}
