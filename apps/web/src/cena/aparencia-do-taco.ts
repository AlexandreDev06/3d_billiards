import { SKIN_PADRAO, ehSkinDeTaco, padraoDaSemente, type PadraoDaSemente, type SkinTaco } from '@sinuca/protocolo';
import { PALETA_DA_TEMPERA } from './acabamentos-do-taco';
import { PADROES_DO_TACO } from './raros-do-taco';
import { SEM_VARIACAO, aplicarTom, variacaoDaSemente, type VariacaoDaSemente } from './variacao-da-semente';

/**
 * Como cada peça do taco se desenha: cores, madeira, metal, brilho, o que acende e o desenho do antebraço. É só dado (nada de
 * three): `cena/taco.ts` o transforma em malhas e materiais, e a loja só escolhe uma `SkinTaco` do catálogo do protocolo.
 * A semente do taco (L35) e o padrão que o catálogo dá a ela (fase ou rara, `padraoDaSemente`, L36) entram em `aparenciaDoTaco(skin, semente)`.
 */

/** Uma luz que passa pela peça no tempo: uma faixa clara que corre da ponta ao cabo (o brilho animado das gemas). */
export interface Varredura {
  readonly cor: number;
  /** Quanto a faixa acende (somada ao emissivo). */
  readonly intensidade: number;
  /** Quantas faixas há ao mesmo tempo ao longo da peça. */
  readonly faixas: number;
  /** Voltas do desenho por segundo (a velocidade da luz). */
  readonly velocidade: number;
  /** Largura da faixa, de 0 a 1 de cada período. */
  readonly largura: number;
}

/** Como a superfície de uma peça reage à luz. As cores são sRGB (0xRRGGBB). */
export interface Superficie {
  readonly cor: number;
  /** 0 = espelho, 1 = fosco. */
  readonly rugosidade: number;
  /** 0 = madeira, plástico, borracha; 1 = metal. */
  readonly metal: number;
  /** Verniz por cima (clearcoat, 0 a 1); só os níveis de qualidade que têm brilho o desenham. */
  readonly verniz: number;
  /** A peça acende por si (linhas neon, anéis): cor e intensidade. */
  readonly emissivo?: { readonly cor: number; readonly intensidade: number };
  /**
   * O reflexo do dielétrico (`specularIntensity`, 0 a 1, e a cor dele). O preto de verdade pede reflexo pequeno e neutro: a luz
   * quente da luminária, refletida numa peça de rugosidade média, lê marrom.
   */
  readonly especular?: { readonly intensidade: number; readonly cor?: number };
  /**
   * O reflexo que muda de cor com o ângulo (película fina, `iridescence` do material físico): `espessura` em nm, de `[min, max]`.
   * Só o nível de qualidade que tem material físico (a alta) o desenha.
   */
  readonly iridescencia?: { readonly intensidade: number; readonly espessura: readonly [number, number] };
  /** O brilho animado: uma varredura de luz no tempo (só os níveis com sobra de quadro a desenham). */
  readonly varredura?: Varredura;
}

/**
 * O que a textura da peça desenha: `veio` (madeira, com `contraste`), `carbono` (trama de fibra), `lisa` (cor só), `neon` (duas
 * linhas finas que acendem, nas cores de `linhas`, ao longo da peça), `chamas`, e as tramas geradas com semente do L35, descritas
 * por `PecaDeMadeira.gerada` (o `tipo` dela é a própria trama): `marmore`, `degrade`, `tempera`, `facetas`, `xadrez`, `rede`, `paineis`; e as
 * do L36, os acabamentos fiéis ao CS (`acabamentos-do-taco.ts`): `veus`, `fade`, `fadeMarmore`, `teia`, `scifi` (e a `tempera` refeita).
 */
export type Trama = 'veio' | 'carbono' | 'lisa' | 'neon' | 'chamas' | 'marmore' | 'degrade' | 'tempera' | 'facetas' | 'xadrez' | 'rede' | 'paineis' | 'veus' | 'fade' | 'fadeMarmore' | 'teia' | 'scifi';

/** Uma parada do degradê: a cor a `de` do comprimento do taco inteiro (0 = ponta, 1 = cabo), contínua de uma peça à outra. */
export interface ParadaDeCor {
  readonly de: number;
  readonly cor: number;
}

/** Um véu da pintura candy: a `cor`, a `cobertura` (0 a 1) e o quanto a cor se aviva onde o véu é mais denso (`brilho`, padrão 0,3). */
export interface CamadaDeVeu {
  readonly cor: number;
  readonly cobertura: number;
  readonly brilho?: number;
}

/** As tramas geradas por código: cada uma recebe a semente do taco (rolo, deslocamento, giro, escala e tom). */
export type TramaGerada =
  /** Redemoinho de resina: as `cores` em faixas que giram, com `turbulencia` (0 a 1) no quanto o ruído as dobra. */
  | { readonly tipo: 'marmore'; readonly cores: readonly number[]; readonly turbulencia: number }
  /** Cor que muda ao longo do taco (o taco inteiro é a escala), de uma peça à outra. */
  | { readonly tipo: 'degrade'; readonly paradas: readonly ParadaDeCor[] }
  /**
   * Aço temperado (Case Hardened): a `paleta` na ordem da têmpera (aço, ouro, bronze, roxo, azul, azul claro) percorrida por um ruído
   * torcido (manchas orgânicas em anéis); `dominante` (0 a 1) puxa tudo para o ponto `foco` da paleta; `torcao` (padrão 0,9) é o quanto
   * o ruído se dobra sobre si mesmo.
   */
  | { readonly tipo: 'tempera'; readonly paleta: readonly number[]; readonly foco: number; readonly dominante: number; readonly torcao?: number }
  /**
   * Pintura candy sobre metal escuro (Doppler, Gamma Doppler e raras): a `base` escura com `camadas` de véus translúcidos em padrão de
   * mármore, cada uma com a `cobertura` (0 a 1, a fração aproximada da peça que cobre) e `turbulencia` no quanto o mármore se dobra.
   */
  | { readonly tipo: 'veus'; readonly base: number; readonly camadas: readonly CamadaDeVeu[]; readonly turbulencia: number }
  /**
   * Anodizado em degradê (Fade): as `paradas` ao longo do taco inteiro (da ponta ao cabo), curvadas pela semente, que é a porcentagem do
   * fade: `empurrao` (0 a 1) é o quanto ela pode antecipar ou atrasar o rosa e o roxo, e a borda ondula em `onda`.
   */
  | { readonly tipo: 'fade'; readonly paradas: readonly ParadaDeCor[]; readonly empurrao: number; readonly onda: number }
  /** Degradê candy em mármore (Marble Fade): as `paradas` ao longo do taco, dobradas pelo ruído (`turbulencia`) em fitas que giram. */
  | { readonly tipo: 'fadeMarmore'; readonly paradas: readonly ParadaDeCor[]; readonly turbulencia: number }
  /**
   * Teia de aranha (Crimson Web, um motivo genérico): uma teia em cada célula (`celulas` em volta), com `raios` raios, `aneis` voltas
   * da espiral e o `fio` de `espessura` (meia largura, em células) sobre o `fundo`. A semente muda o lugar e o giro de cada teia.
   */
  | { readonly tipo: 'teia'; readonly fundo: number; readonly fio: number; readonly celulas: number; readonly raios: number; readonly aneis: number; readonly espessura: number }
  /** Painéis de ficção científica (Asiimov): `colunas` em volta, `painel` claro com `junta` fina, cintas de `faixa` escura e detalhes de `detalhe`. */
  | { readonly tipo: 'scifi'; readonly painel: number; readonly junta: number; readonly faixa: number; readonly detalhe: number; readonly colunas: number }
  /** Gema lapidada: `facetas` em volta, cada uma com o seu tom e o seu relevo (a luz bate em cada face de um jeito). */
  | { readonly tipo: 'facetas'; readonly cor: number; readonly facetas: number }
  /** Xadrez: `casas` em volta; com mais de duas cores vira mosaico (a cor de cada casa sai do hash). */
  | { readonly tipo: 'xadrez'; readonly cores: readonly number[]; readonly casas: number }
  /** Rede de losangos: `malhas` em volta, o `fio` sobre o `fundo`, `espessura` do fio (0 a 0,5 da malha). */
  | { readonly tipo: 'rede'; readonly fundo: number; readonly fio: number; readonly malhas: number; readonly espessura: number }
  /** Painéis de placar: `colunas` em volta, com junta escura e, em alguns, dígitos de LED (verde e âmbar) que acendem. */
  | { readonly tipo: 'paineis'; readonly painel: number; readonly junta: number; readonly led: readonly [number, number]; readonly colunas: number };

/**
 * A arte pintada de uma peça (L35): PNGs de `public/skins/` (copiados de `arte/skins/exportados/` pelo `dev` e pelo `build`),
 * carregados sob demanda por cima da cor da peça. O contrato do Pincel: x dá a volta (`RepeatWrapping`, `repeat.x = −1`), a linha de
 * baixo é a ponta do taco, emissivo preto = apagado. `rara` é a variante de paleta das sementes raras do catálogo.
 */
export interface ImagemPintada {
  readonly cor: string;
  /** O que acende na arte (olhos, estrelas); preto = apagado. */
  readonly emissiva?: string;
  /** Quanto o emissivo acende (1 a 3 no contrato do Pincel). */
  readonly intensidadeDoEmissivo?: number;
  /** A máscara de metal (L36, `-metal.png`: cinza, branco = ouro batido); vai no `metalnessMap`, sem cor (linear). */
  readonly metal?: string;
  /** Quanto de metal o branco da máscara dá (0 a 1; padrão 0,9: o suficiente para o nível sem reflexo de sala tratá-lo como metal). */
  readonly intensidadeDoMetal?: number;
  readonly rara?: { readonly cor: string; readonly emissiva?: string; readonly metal?: string };
}

/** Um anel pintado em volta da peça, de `de` a `ate` (fração do comprimento dela, da ponta para o cabo). `brilho`: o anel acende. */
export interface Faixa {
  readonly de: number;
  readonly ate: number;
  readonly cor: number;
  readonly brilho?: boolean;
}

export interface PecaDeMadeira extends Superficie {
  readonly trama: Trama;
  /** O quanto o veio (ou a trama) varia a cor, de 0 a 1. */
  readonly contraste: number;
  /** As cores das linhas da trama `neon` (quatro linhas ao longo, alternando as duas). */
  readonly linhas?: readonly [number, number];
  /** Na trama `chamas`: da raiz (clara) à ponta (escura), como no antebraço. */
  readonly chamas?: readonly [number, number];
  /** Os parâmetros da trama gerada (L35); `trama` é igual a `gerada.tipo`. */
  readonly gerada?: TramaGerada;
  /** Anéis pintados por cima da trama. */
  readonly faixas?: readonly Faixa[];
  /** A arte pintada que cobre a peça quando o arquivo chega (a trama e as faixas ficam por baixo, para a espera e para o nível baixo sem imagem). */
  readonly imagem?: ImagemPintada;
}

/** O que enfeita o antebraço (a peça entre a junta e o punho). */
export type DesenhoDoAntebraco =
  /** Pontas de outra madeira subindo do punho (`quantidade` em volta, 4 no taco de verdade). */
  | { readonly tipo: 'bicos'; readonly cor: number; readonly quantidade: number }
  /** Chamas que sobem do punho: `cores` = da raiz (clara) à ponta (escura). */
  | { readonly tipo: 'chamas'; readonly cores: readonly [number, number] }
  /** Linhas que acendem, nas duas cores, em faixas e anéis. */
  | { readonly tipo: 'linhas'; readonly cores: readonly [number, number] }
  | { readonly tipo: 'liso' };

export interface Punho {
  /** `linho` (fio enrolado, com relevo), `couro` (enrolado, mais liso) ou `borracha` (estriada). */
  readonly material: 'linho' | 'couro' | 'borracha';
  readonly cor: number;
  /** Uma faixa em volta do meio do punho. */
  readonly faixa?: number;
  /** A arte pintada do punho (o lobo da Howl); o relevo do fio fica por baixo. */
  readonly imagem?: ImagemPintada;
  /** Rugosidade e verniz do punho (padrão: 0,9 no couro e no linho, 0,8 na borracha, e sem verniz). */
  readonly rugosidade?: number;
  readonly verniz?: number;
  /** Anéis pintados por cima do fio (L36: os de ouro do punho da Dragon Lore), de `de` a `ate` do comprimento do punho. */
  readonly aneis?: readonly Faixa[];
}

export interface AparenciaTaco {
  readonly id: SkinTaco;
  /** A sola de couro e o azul do giz que a cobre. */
  readonly ponta: { readonly couro: number; readonly giz: number };
  /** O anel branco logo atrás da sola. */
  readonly virola: Superficie;
  readonly haste: PecaDeMadeira;
  /** O anel da junta, no meio do taco. */
  readonly junta: Superficie;
  readonly antebraco: { readonly base: PecaDeMadeira; readonly desenho: DesenhoDoAntebraco };
  readonly punho: Punho;
  /** O anel entre o punho e a base. */
  readonly anel: Superficie;
  readonly base: PecaDeMadeira;
  /** A tampa de borracha na ponta do cabo. */
  readonly borracha: Superficie;
  /**
   * O brilho que vaza das partes acesas (o neon): uma casca aditiva em volta da haste, só nos níveis de qualidade que têm
   * sobra de quadro. `cores` são as das linhas (a casca as repete em volta).
   */
  readonly halo?: { readonly cores: readonly [number, number]; readonly intensidade: number };
  /** O que a semente do taco mexe no padrão (de fábrica: nada). */
  readonly variacao: VariacaoDaSemente;
  /** O padrão que o catálogo dá a esta semente (uma fase, "Phase 2", ou uma rara, "Blue Gem"), ou `null` (sem padrão com nome). As skins pintadas usam a imagem `rara` só nas raras. */
  readonly padrao: PadraoDaSemente | null;
}

/** A skin como o catálogo a guarda, antes da semente: sem variação e sem padrão. */
type AparenciaBase = Omit<AparenciaTaco, 'variacao' | 'padrao'>;

const COURO = 0x76502c;
const GIZ = 0x3d8bff;
const NIQUEL = 0xc9ccd1;
const PRATA = 0xd9dce0;
const OURO = 0xf2c230;
/**
 * Preto de verdade: albedo quase zero e azulado. A luz da luminária (3000 K) multiplica o vermelho por ~2,4 em relação ao azul, então
 * um albedo "neutro" saía marrom; o azul de compensação o devolve a cinza-preto na tela.
 */
const PRETO = 0x090c13;
/**
 * O reflexo da luz de 3000 K sai laranja; um dielétrico com reflexo azulado o devolve neutro (o preto brilhante fica preto com
 * brilho branco, em vez de marrom com brilho laranja).
 */
const ESPECULAR_NEUTRO = { intensidade: 0.4, cor: 0xb4c8ff } as const;
const MARFIM = 0xf3ecd8;
const CIANO = 0x19f0ff;
const MAGENTA = 0xff2bd6;

const madeira = (cor: number, contraste: number, rugosidade = 0.5, verniz = 0.7, faixas?: readonly Faixa[]): PecaDeMadeira => ({ cor, contraste, rugosidade, metal: 0, verniz, trama: 'veio', ...(faixas ? { faixas } : {}) });
const plastico = (cor: number, rugosidade = 0.35, verniz = 0.5): Superficie => ({ cor, rugosidade, metal: 0, verniz });
const metal = (cor: number, rugosidade = 0.3): Superficie => ({ cor, rugosidade, metal: 0.95, verniz: 0 });
const borrachaPreta: Superficie = { cor: 0x101011, rugosidade: 0.85, metal: 0, verniz: 0 };
/** Peça preta e brilhante: reflexo estreito e neutro, sem a mancha larga de marrom. */
const pretoBrilhante = (faixas?: readonly Faixa[]): PecaDeMadeira => ({
  cor: PRETO,
  rugosidade: 0.28,
  metal: 0,
  verniz: 0.15,
  trama: 'veio',
  contraste: 0.05,
  especular: ESPECULAR_NEUTRO,
  ...(faixas ? { faixas } : {}),
});
const ouroMetal = (faixas?: readonly Faixa[]): PecaDeMadeira => ({ cor: OURO, rugosidade: 0.2, metal: 1, verniz: 0, trama: 'lisa', contraste: 0, ...(faixas ? { faixas } : {}) });

const VERMELHO_TOALHA = 0xc8202a;
const BRANCO_TOALHA = 0xf3eee4;
/** O verde da garrafa: claro e translúcido na ponta, escuro no cabo (do taco inteiro). */
const GARRAFA: readonly ParadaDeCor[] = [
  { de: 0, cor: 0x2bb15a },
  { de: 0.5, cor: 0x0f5c2c },
  { de: 1, cor: 0x06301a },
];
/** O Asiimov: painéis brancos, cintas pretas e o laranja dos detalhes (um desenho nosso: nada de painel de ninguém). */
const BRANCO_ASIIMOV = 0xeceef0;
const LARANJA_ASIIMOV = 0xff6a14;
const GRAFITE = 0x15171c;
const OURO_DO_ROTULO = 0xc9962a;
const PAPEL_DO_ROTULO = 0xf1e6c4;
/** O anel do rótulo da garrafa, na haste e na base. */
const ROTULO: readonly Faixa[] = [
  { de: 0.4, ate: 0.412, cor: OURO_DO_ROTULO },
  { de: 0.412, ate: 0.48, cor: PAPEL_DO_ROTULO },
  { de: 0.48, ate: 0.54, cor: 0xb3202a },
  { de: 0.54, ate: 0.608, cor: PAPEL_DO_ROTULO },
  { de: 0.608, ate: 0.62, cor: OURO_DO_ROTULO },
];
const ROTULO_DA_BASE: readonly Faixa[] = [
  { de: 0.1, ate: 0.112, cor: OURO_DO_ROTULO },
  { de: 0.112, ate: 0.208, cor: PAPEL_DO_ROTULO },
  { de: 0.208, ate: 0.22, cor: OURO_DO_ROTULO },
];
/** As cobras-corais do Pincel: vermelho, amarelo (a faixa fina entre eles) e o preto do fundo (`arte/skins/skins-meta.json`). */
const CORAL_VERMELHO = 0xe0281c;
const CORAL_AMARELO = 0xf7de4c;
const ANEIS_DA_CORAL_NA_HASTE: readonly Faixa[] = [
  [0.0, 0.06, CORAL_VERMELHO],
  [0.06, 0.073, CORAL_AMARELO],
  [0.15, 0.163, CORAL_AMARELO],
  [0.163, 0.223, CORAL_VERMELHO],
  [0.223, 0.236, CORAL_AMARELO],
  [0.31, 0.323, CORAL_AMARELO],
  [0.323, 0.383, CORAL_VERMELHO],
  [0.383, 0.396, CORAL_AMARELO],
  [0.47, 0.483, CORAL_AMARELO],
  [0.483, 0.543, CORAL_VERMELHO],
  [0.543, 0.556, CORAL_AMARELO],
  [0.63, 0.643, CORAL_AMARELO],
  [0.643, 0.703, CORAL_VERMELHO],
  [0.703, 0.716, CORAL_AMARELO],
].map(([de, ate, cor]) => ({ de: de!, ate: ate!, cor: cor! }));
const ANEIS_DA_CORAL_NA_BASE: readonly Faixa[] = [
  { de: 0.1, ate: 0.16, cor: CORAL_VERMELHO },
  { de: 0.16, ate: 0.19, cor: CORAL_AMARELO },
  { de: 0.81, ate: 0.84, cor: CORAL_AMARELO },
  { de: 0.84, ate: 0.9, cor: CORAL_VERMELHO },
];
/** As cores berrantes do Bicho Solto (o mosaico de espera, até o desenho do Pincel chegar). */
const MOSAICO_POP: readonly number[] = [0xff2e93, 0x1e8bff, 0xffd400, 0x2de08a, 0x8b3dff, 0xff6a1a];
/** O brilho que a película fina dá ao candy do Doppler e do Gamma Doppler (só a alta desenha: é do material físico). */
const IRIDESCENCIA_DO_CANDY = { intensidade: 0.5, espessura: [200, 600] } as const;
const OBSIDIANA = 0x07080d;
const VIDRADO = { rugosidade: 0.06, verniz: 1, especular: { intensidade: 0.6, cor: 0xb4c8ff } } as const;
/** Aço temperado: metal pela metade (o reflexo e a cor da têmpera aparecem juntos) com verniz. */
const ACO_TEMPERADO = { rugosidade: 0.3, metal: 0.55, verniz: 0.6 } as const;
const ACO = 0x8a93a6;
/** O brilho que passeia pelo candy do Gamma Doppler: uma faixa clara que corre da ponta ao cabo (só os níveis com sobra de quadro a desenham). */
const BRILHO_DO_CANDY: Varredura = { cor: 0xc8ffe8, intensidade: 0.8, faixas: 1, velocidade: 0.18, largura: 0.08 };
/** O Doppler de fábrica (sem semente): véus de vermelho, azul e roxo sobre o metal escuro. */
const VEUS_DO_DOPPLER: TramaGerada = {
  tipo: 'veus',
  base: OBSIDIANA,
  camadas: [{ cor: 0x2152ff, cobertura: 0.45 }, { cor: 0x7a2ad0, cobertura: 0.32 }, { cor: 0xc8142c, cobertura: 0.34 }],
  turbulencia: 0.9,
};
/** O Gamma Doppler de fábrica: o mesmo candy em verde e ciano. */
const VEUS_DO_GAMMA: TramaGerada = {
  tipo: 'veus',
  base: 0x03140d,
  camadas: [{ cor: 0x0a7a62, cobertura: 0.3 }, { cor: 0x12c060, cobertura: 0.42 }, { cor: 0x16d4e0, cobertura: 0.36 }],
  turbulencia: 0.9,
};
/** O Fade: do amarelo-dourado da ponta, por laranja e rosa, ao roxo e ao azul do cabo; o taco inteiro é a escala. */
const FADE_COMUM: readonly ParadaDeCor[] = [
  { de: 0, cor: 0xffee42 },
  { de: 0.1, cor: 0xffcf30 },
  { de: 0.2, cor: 0xff9a38 },
  { de: 0.28, cor: 0xff6a78 },
  { de: 0.38, cor: 0xe050f8 },
  { de: 0.56, cor: 0xc040ff },
  { de: 0.78, cor: 0x7040ff },
  { de: 1, cor: 0x2846ff },
];
/** O Marble Fade: vermelho, laranja, amarelo, um palha claro e o azul (sem passar por verde). */
const MARBLE_FADE: readonly ParadaDeCor[] = [
  { de: 0, cor: 0xe02424 },
  { de: 0.22, cor: 0xff6a1a },
  { de: 0.42, cor: 0xffcf1a },
  { de: 0.52, cor: 0xfff0c0 },
  { de: 0.66, cor: 0x4fb4ff },
  { de: 0.84, cor: 0x1f4fe0 },
  { de: 1, cor: 0x1a2a9a },
];
/** O pergaminho do Dragon Lore: a cor da peça enquanto a pintura não chega. */
const PERGAMINHO = 0xcfc39a;
const OURO_DO_DRAGAO = 0xc8972a;
/** O fundo do Howl: o escuro avermelhado da pintura. */
const BREU = 0x120a0a;

/** Uma peça com trama gerada (a `trama` é o `tipo` dela); `extra` troca o que for preciso do padrão (rugosidade, verniz, faixas...). */
const gerado = (gerada: TramaGerada, cor: number, extra: Partial<PecaDeMadeira> = {}): PecaDeMadeira => ({ cor, rugosidade: 0.3, metal: 0, verniz: 0.8, trama: gerada.tipo, contraste: 0.5, gerada, ...extra });

/** As skins do catálogo, como o catálogo as guarda (sem semente). */
const BASES: Readonly<Record<SkinTaco, AparenciaBase>> = {
  classico: {
    id: 'classico',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xf3efe6),
    haste: madeira(0xe4c68c, 0.35),
    junta: metal(NIQUEL),
    antebraco: { base: madeira(0x2a1a10, 0.2), desenho: { tipo: 'bicos', cor: 0xf4e6bf, quantidade: 4 } },
    punho: { material: 'linho', cor: 0x2a2420 },
    anel: metal(NIQUEL),
    base: madeira(0x2a1a10, 0.2),
    borracha: borrachaPreta,
  },
  ebano: {
    id: 'ebano',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(MARFIM, 0.3, 0.8),
    haste: pretoBrilhante([{ de: 0.6, ate: 0.625, cor: MARFIM }]),
    junta: metal(PRATA, 0.2),
    antebraco: { base: pretoBrilhante(), desenho: { tipo: 'bicos', cor: MARFIM, quantidade: 4 } },
    punho: { material: 'couro', cor: 0x0f1014 },
    anel: metal(PRATA, 0.2),
    base: pretoBrilhante(),
    borracha: borrachaPreta,
  },
  boteco: {
    id: 'boteco',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xf6f2ea),
    haste: madeira(0xf7c81c, 0.12, 0.35, 0.9, [
      { de: 0.5, ate: 0.58, cor: 0xd1261c },
      { de: 0.6, ate: 0.62, cor: 0xf8f4ec },
    ]),
    junta: metal(0xd9a31e, 0.3),
    antebraco: { base: madeira(0xc4201a, 0.12, 0.35, 0.9), desenho: { tipo: 'bicos', cor: 0xffd23a, quantidade: 4 } },
    punho: { material: 'linho', cor: 0xf1ede6, faixa: 0xc8261e },
    anel: metal(0xd9a31e, 0.3),
    base: madeira(0xc4201a, 0.12, 0.35, 0.9),
    borracha: borrachaPreta,
  },
  marfim: {
    id: 'marfim',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xfaf5e8, 0.3, 0.8),
    haste: madeira(0xf5eed9, 0.08, 0.3, 0.9, [
      { de: 0.45, ate: 0.475, cor: 0xc9962a },
      { de: 0.5, ate: 0.525, cor: 0xc9962a },
    ]),
    junta: metal(OURO, 0.22),
    antebraco: { base: madeira(0xf0e6cb, 0.08, 0.3, 0.9), desenho: { tipo: 'bicos', cor: 0x16110d, quantidade: 4 } },
    punho: { material: 'linho', cor: 0xefe6d0 },
    anel: metal(OURO, 0.22),
    base: madeira(0xf0e6cb, 0.08, 0.3, 0.9),
    borracha: { cor: 0x3a3630, rugosidade: 0.85, metal: 0, verniz: 0 },
  },
  carbono: {
    id: 'carbono',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xdfe3e8, 0.3, 0.6),
    haste: {
      cor: 0x1c2330,
      rugosidade: 0.26,
      metal: 0,
      verniz: 0.5,
      trama: 'carbono',
      contraste: 0.95,
      especular: ESPECULAR_NEUTRO,
      faixas: [
        { de: 0.36, ate: 0.4, cor: 0xe0261c },
        { de: 0.68, ate: 0.72, cor: 0xe0261c },
      ],
    },
    junta: plastico(0xd1241b, 0.35, 0.9),
    antebraco: { base: { cor: 0x181e2a, rugosidade: 0.26, metal: 0, verniz: 0.5, trama: 'carbono', contraste: 0.95, especular: ESPECULAR_NEUTRO }, desenho: { tipo: 'liso' } },
    punho: { material: 'borracha', cor: 0x111214 },
    anel: plastico(0xd1241b, 0.35, 0.9),
    base: { cor: 0x181e2a, rugosidade: 0.26, metal: 0, verniz: 0.5, trama: 'carbono', contraste: 0.95, especular: ESPECULAR_NEUTRO },
    borracha: borrachaPreta,
  },
  chamas: {
    id: 'chamas',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xf4f1ea),
    haste: { ...pretoBrilhante(), trama: 'chamas', chamas: [0xffc23a, 0xd8200f] },
    junta: metal(NIQUEL, 0.2),
    antebraco: { base: pretoBrilhante(), desenho: { tipo: 'chamas', cores: [0xffc23a, 0xd8200f] } },
    punho: { material: 'couro', cor: 0x120d0b },
    anel: metal(NIQUEL, 0.2),
    base: pretoBrilhante(),
    borracha: borrachaPreta,
  },
  neon: {
    id: 'neon',
    ponta: { couro: COURO, giz: GIZ },
    virola: { cor: 0x0a0a0c, rugosidade: 0.3, metal: 0, verniz: 0.8, emissivo: { cor: CIANO, intensidade: 1.8 } },
    haste: {
      cor: PRETO,
      rugosidade: 0.2,
      metal: 0,
      verniz: 0.5,
      trama: 'neon',
      contraste: 0,
      linhas: [CIANO, MAGENTA],
      especular: ESPECULAR_NEUTRO,
      faixas: [
        { de: 0.36, ate: 0.4, cor: MAGENTA, brilho: true },
        { de: 0.68, ate: 0.72, cor: CIANO, brilho: true },
      ],
    },
    junta: { cor: 0x0a0a0c, rugosidade: 0.3, metal: 0, verniz: 0.8, emissivo: { cor: CIANO, intensidade: 2 } },
    antebraco: { base: { ...pretoBrilhante(), trama: 'lisa' }, desenho: { tipo: 'linhas', cores: [CIANO, MAGENTA] } },
    punho: { material: 'borracha', cor: 0x0c0c10 },
    anel: { cor: 0x0a0a0c, rugosidade: 0.3, metal: 0, verniz: 0.8, emissivo: { cor: MAGENTA, intensidade: 2 } },
    base: { ...pretoBrilhante(), trama: 'lisa' },
    borracha: borrachaPreta,
    halo: { cores: [CIANO, MAGENTA], intensidade: 0.55 },
  },
  ouro: {
    id: 'ouro',
    ponta: { couro: COURO, giz: GIZ },
    virola: metal(0xf6e08a, 0.22),
    haste: ouroMetal([{ de: 0.55, ate: 0.565, cor: 0x7a5410 }]),
    junta: metal(0xb98a1e, 0.22),
    antebraco: { base: ouroMetal(), desenho: { tipo: 'bicos', cor: PRETO, quantidade: 4 } },
    punho: { material: 'couro', cor: 0x1a1612 },
    anel: metal(OURO, 0.2),
    base: ouroMetal(),
    borracha: borrachaPreta,
  },
  'xadrez-de-toalha': {
    id: 'xadrez-de-toalha',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xf6f1e6),
    haste: gerado({ tipo: 'xadrez', cores: [VERMELHO_TOALHA, BRANCO_TOALHA], casas: 6 }, VERMELHO_TOALHA, { rugosidade: 0.55, verniz: 0.3 }),
    junta: metal(NIQUEL),
    antebraco: { base: gerado({ tipo: 'xadrez', cores: [VERMELHO_TOALHA, BRANCO_TOALHA], casas: 8 }, VERMELHO_TOALHA, { rugosidade: 0.55, verniz: 0.3 }), desenho: { tipo: 'liso' } },
    punho: { material: 'linho', cor: 0xf2ece0, faixa: VERMELHO_TOALHA },
    anel: metal(NIQUEL),
    base: gerado({ tipo: 'xadrez', cores: [VERMELHO_TOALHA, BRANCO_TOALHA], casas: 8 }, VERMELHO_TOALHA, { rugosidade: 0.55, verniz: 0.3 }),
    borracha: borrachaPreta,
  },
  'long-neck': {
    id: 'long-neck',
    ponta: { couro: COURO, giz: GIZ },
    virola: { cor: 0x1f8a46, rugosidade: 0.08, metal: 0, verniz: 1, especular: { intensidade: 0.9 } },
    haste: gerado({ tipo: 'degrade', paradas: GARRAFA }, 0x0f5c2c, { rugosidade: 0.07, verniz: 1, especular: { intensidade: 0.9 }, faixas: ROTULO }),
    junta: metal(0xc9a24a, 0.25),
    antebraco: { base: gerado({ tipo: 'degrade', paradas: GARRAFA }, 0x0b4723, { rugosidade: 0.07, verniz: 1, especular: { intensidade: 0.9 } }), desenho: { tipo: 'liso' } },
    punho: { material: 'couro', cor: 0x0a2a16 },
    anel: metal(0xc9a24a, 0.25),
    base: gerado({ tipo: 'degrade', paradas: GARRAFA }, 0x07331a, { rugosidade: 0.07, verniz: 1, especular: { intensidade: 0.9 }, faixas: ROTULO_DA_BASE }),
    borracha: borrachaPreta,
  },
  placar: {
    id: 'placar',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(BRANCO_ASIIMOV, 0.3, 0.6),
    haste: gerado({ tipo: 'scifi', painel: BRANCO_ASIIMOV, junta: 0x23272e, faixa: 0x0c0d10, detalhe: LARANJA_ASIIMOV, colunas: 3 }, BRANCO_ASIIMOV, { rugosidade: 0.34, verniz: 0.7 }),
    junta: metal(GRAFITE, 0.3),
    antebraco: { base: gerado({ tipo: 'scifi', painel: BRANCO_ASIIMOV, junta: 0x23272e, faixa: 0x0c0d10, detalhe: LARANJA_ASIIMOV, colunas: 4 }, BRANCO_ASIIMOV, { rugosidade: 0.34, verniz: 0.7 }), desenho: { tipo: 'liso' } },
    punho: { material: 'borracha', cor: 0x14181d },
    anel: plastico(LARANJA_ASIIMOV, 0.3, 0.8),
    base: gerado({ tipo: 'scifi', painel: BRANCO_ASIIMOV, junta: 0x23272e, faixa: 0x0c0d10, detalhe: LARANJA_ASIIMOV, colunas: 4 }, BRANCO_ASIIMOV, { rugosidade: 0.34, verniz: 0.7 }),
    borracha: borrachaPreta,
  },
  'resina-marmorizada': {
    id: 'resina-marmorizada',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xf4efe2, 0.15, 1),
    haste: gerado({ tipo: 'fadeMarmore', paradas: MARBLE_FADE, turbulencia: 1 }, 0xff6a1a, { rugosidade: 0.08, metal: 0.2, verniz: 1 }),
    junta: plastico(0xf1e8d0, 0.12, 1),
    antebraco: { base: gerado({ tipo: 'fadeMarmore', paradas: MARBLE_FADE, turbulencia: 1 }, 0x4fb4ff, { rugosidade: 0.08, metal: 0.2, verniz: 1 }), desenho: { tipo: 'liso' } },
    punho: { material: 'couro', cor: 0x10143a },
    anel: plastico(0xf1e8d0, 0.12, 1),
    base: gerado({ tipo: 'fadeMarmore', paradas: MARBLE_FADE, turbulencia: 1 }, 0x1f4fe0, { rugosidade: 0.08, metal: 0.2, verniz: 1 }),
    borracha: borrachaPreta,
  },
  'fim-de-tarde': {
    id: 'fim-de-tarde',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xf8efe0, 0.3, 0.8),
    haste: gerado({ tipo: 'fade', paradas: FADE_COMUM, empurrao: 0.5, onda: 0.08 }, 0xff5fa2, { rugosidade: 0.28, metal: 0.45, verniz: 0.8 }),
    junta: metal(0xe6a0c8, 0.22),
    antebraco: { base: gerado({ tipo: 'fade', paradas: FADE_COMUM, empurrao: 0.5, onda: 0.08 }, 0xd23fc4, { rugosidade: 0.28, metal: 0.45, verniz: 0.8 }), desenho: { tipo: 'liso' } },
    punho: { material: 'couro', cor: 0x2a1640 },
    anel: metal(0xe6a0c8, 0.22),
    base: gerado({ tipo: 'fade', paradas: FADE_COMUM, empurrao: 0.5, onda: 0.08 }, 0x4a2a9a, { rugosidade: 0.28, metal: 0.45, verniz: 0.8 }),
    borracha: borrachaPreta,
  },
  coral: {
    id: 'coral',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xf3efe6, 0.35, 0.5),
    haste: { cor: 0x0e0c12, rugosidade: 0.26, metal: 0, verniz: 0.9, trama: 'lisa', contraste: 0, faixas: ANEIS_DA_CORAL_NA_HASTE },
    junta: metal(NIQUEL),
    antebraco: {
      base: { cor: 0xc8201a, rugosidade: 0.26, metal: 0, verniz: 0.85, trama: 'lisa', contraste: 0, imagem: { cor: 'coral-antebraco.png', rara: { cor: 'coral-antebraco-raro.png' } } },
      desenho: { tipo: 'liso' },
    },
    punho: { material: 'couro', cor: 0x15110f },
    anel: metal(NIQUEL),
    base: { cor: 0x0e0c12, rugosidade: 0.26, metal: 0, verniz: 0.9, trama: 'lisa', contraste: 0, faixas: ANEIS_DA_CORAL_NA_BASE },
    borracha: borrachaPreta,
  },
  'rede-de-cacapa': {
    id: 'rede-de-cacapa',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xe6e2dc, 0.35, 0.6),
    haste: gerado({ tipo: 'teia', fundo: PRETO, fio: 0xd2182a, celulas: 1, raios: 8, aneis: 5, espessura: 0.017 }, PRETO, { rugosidade: 0.34, metal: 0.4, verniz: 0.5, especular: ESPECULAR_NEUTRO }),
    junta: metal(0x8e8f94, 0.3),
    antebraco: { base: gerado({ tipo: 'teia', fundo: PRETO, fio: 0xd2182a, celulas: 1, raios: 8, aneis: 5, espessura: 0.017 }, PRETO, { rugosidade: 0.34, metal: 0.4, verniz: 0.5, especular: ESPECULAR_NEUTRO }), desenho: { tipo: 'liso' } },
    punho: { material: 'couro', cor: 0x1a0d0d },
    anel: metal(0x8e8f94, 0.3),
    base: gerado({ tipo: 'teia', fundo: PRETO, fio: 0xd2182a, celulas: 1, raios: 8, aneis: 5, espessura: 0.017 }, PRETO, { rugosidade: 0.34, metal: 0.4, verniz: 0.5, especular: ESPECULAR_NEUTRO }),
    borracha: borrachaPreta,
  },
  'bicho-solto': {
    id: 'bicho-solto',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xf3efe6, 0.35, 0.5),
    haste: gerado({ tipo: 'xadrez', cores: MOSAICO_POP, casas: 5 }, 0xff2e93, { rugosidade: 0.3, verniz: 0.9, imagem: { cor: 'bicho-solto-haste.png', rara: { cor: 'bicho-solto-haste-raro.png' } } }),
    junta: plastico(0xff2e93, 0.25, 0.9),
    antebraco: { base: gerado({ tipo: 'xadrez', cores: MOSAICO_POP, casas: 7 }, 0x1e8bff, { rugosidade: 0.3, verniz: 0.9, imagem: { cor: 'bicho-solto-antebraco.png', rara: { cor: 'bicho-solto-antebraco-raro.png' } } }), desenho: { tipo: 'liso' } },
    punho: { material: 'couro', cor: 0x1b1030 },
    anel: plastico(0xff2e93, 0.25, 0.9),
    base: { cor: 0x1e8bff, rugosidade: 0.25, metal: 0, verniz: 0.9, trama: 'lisa', contraste: 0 },
    borracha: borrachaPreta,
  },
  'esmeralda-do-pano': {
    id: 'esmeralda-do-pano',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xeaf6ee, 0.25, 0.9),
    haste: gerado(VEUS_DO_GAMMA, 0x12c060, { ...VIDRADO, iridescencia: IRIDESCENCIA_DO_CANDY, varredura: BRILHO_DO_CANDY }),
    junta: { cor: 0x0e5a44, rugosidade: 0.12, metal: 0.8, verniz: 0.5, iridescencia: IRIDESCENCIA_DO_CANDY, varredura: BRILHO_DO_CANDY },
    antebraco: { base: gerado(VEUS_DO_GAMMA, 0x12c060, { ...VIDRADO, iridescencia: IRIDESCENCIA_DO_CANDY, varredura: BRILHO_DO_CANDY }), desenho: { tipo: 'liso' } },
    punho: { material: 'couro', cor: 0x0c2a1b },
    anel: { cor: 0x0e5a44, rugosidade: 0.12, metal: 0.8, verniz: 0.5, iridescencia: IRIDESCENCIA_DO_CANDY },
    base: gerado(VEUS_DO_GAMMA, 0x12c060, { ...VIDRADO, iridescencia: IRIDESCENCIA_DO_CANDY }),
    borracha: borrachaPreta,
  },
  obsidiana: {
    id: 'obsidiana',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xdadce2, 0.25, 0.9),
    haste: gerado(VEUS_DO_DOPPLER, 0x2152ff, { ...VIDRADO, iridescencia: IRIDESCENCIA_DO_CANDY }),
    junta: { cor: 0x1a1830, rugosidade: 0.12, metal: 0.8, verniz: 0.5, iridescencia: IRIDESCENCIA_DO_CANDY },
    antebraco: { base: gerado(VEUS_DO_DOPPLER, 0x2152ff, { ...VIDRADO, iridescencia: IRIDESCENCIA_DO_CANDY }), desenho: { tipo: 'liso' } },
    punho: { material: 'couro', cor: 0x0c0b12 },
    anel: { cor: 0x1a1830, rugosidade: 0.12, metal: 0.8, verniz: 0.5, iridescencia: IRIDESCENCIA_DO_CANDY },
    base: gerado(VEUS_DO_DOPPLER, 0x2152ff, { ...VIDRADO, iridescencia: IRIDESCENCIA_DO_CANDY }),
    borracha: borrachaPreta,
  },
  tempera: {
    id: 'tempera',
    ponta: { couro: COURO, giz: GIZ },
    virola: metal(0xb7bcc6, 0.25),
    haste: gerado({ tipo: 'tempera', paleta: PALETA_DA_TEMPERA, foco: 0.45, dominante: 0.15 }, 0x3e4b66, ACO_TEMPERADO),
    junta: metal(ACO, 0.25),
    antebraco: { base: gerado({ tipo: 'tempera', paleta: PALETA_DA_TEMPERA, foco: 0.45, dominante: 0.15 }, 0x3e4b66, ACO_TEMPERADO), desenho: { tipo: 'liso' } },
    punho: { material: 'couro', cor: 0x10141f },
    anel: metal(ACO, 0.25),
    base: gerado({ tipo: 'tempera', paleta: PALETA_DA_TEMPERA, foco: 0.45, dominante: 0.15 }, 0x3e4b66, ACO_TEMPERADO),
    borracha: borrachaPreta,
  },
  corujao: {
    // O id `corujao` é a Howl (L34c): o lobo uivando do Pincel (L36, P3), em `howl-*.png`.
    id: 'corujao',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xf3efe6, 0.35, 0.5),
    haste: {
      cor: BREU,
      rugosidade: 0.34,
      metal: 0,
      verniz: 0.8,
      trama: 'lisa',
      contraste: 0,
      imagem: { cor: 'howl-haste.png', rara: { cor: 'howl-haste-raro.png' } },
    },
    junta: { cor: 0xc4281c, rugosidade: 0.28, metal: 0.2, verniz: 0.8 },
    antebraco: {
      base: {
        cor: BREU,
        rugosidade: 0.34,
        metal: 0,
        verniz: 0.8,
        trama: 'lisa',
        contraste: 0,
        imagem: { cor: 'howl-antebraco.png', emissiva: 'howl-antebraco-emissivo.png', intensidadeDoEmissivo: 2, rara: { cor: 'howl-antebraco-raro.png', emissiva: 'howl-antebraco-raro-emissivo.png' } },
      },
      desenho: { tipo: 'liso' },
    },
    punho: {
      material: 'couro',
      cor: BREU,
      rugosidade: 0.55,
      verniz: 0.2,
      imagem: { cor: 'howl-punho.png', emissiva: 'howl-punho-emissivo.png', intensidadeDoEmissivo: 2, rara: { cor: 'howl-punho-raro.png', emissiva: 'howl-punho-raro-emissivo.png' } },
    },
    anel: { cor: 0xc4281c, rugosidade: 0.28, metal: 0.2, verniz: 0.8 },
    base: {
      cor: BREU,
      rugosidade: 0.3,
      metal: 0,
      verniz: 0.9,
      trama: 'lisa',
      contraste: 0,
      faixas: [{ de: 0.08, ate: 0.12, cor: 0xd4301d }, { de: 0.12, ate: 0.14, cor: 0xff8a1f }, { de: 0.86, ate: 0.88, cor: 0xff8a1f }, { de: 0.88, ate: 0.92, cor: 0xd4301d }],
    },
    borracha: borrachaPreta,
  },
  'dragao-das-quinze': {
    // O id `dragao-das-quinze` é a Dragon Lore (L34c): o dragão nosso do Pincel (L36, P3), em `dragon-lore-*.png`. O ouro vai por máscara de metal.
    id: 'dragao-das-quinze',
    ponta: { couro: COURO, giz: GIZ },
    virola: plastico(0xe9dcb4, 0.35, 0.5),
    haste: {
      cor: PERGAMINHO,
      rugosidade: 0.4,
      metal: 0,
      verniz: 0.55,
      trama: 'lisa',
      contraste: 0,
      // O olho do dragão saía creme de perto: o brilho da haste (a chama) e o do antebraço (olho e boca) ficam abaixo do 1,8 e do 2,0 sugeridos.
      imagem: { cor: 'dragon-lore-haste.png', emissiva: 'dragon-lore-haste-emissivo.png', intensidadeDoEmissivo: 1.5, rara: { cor: 'dragon-lore-haste-raro.png', emissiva: 'dragon-lore-haste-raro-emissivo.png' } },
    },
    junta: metal(OURO_DO_DRAGAO, 0.26),
    antebraco: {
      base: {
        cor: PERGAMINHO,
        rugosidade: 0.38,
        metal: 0,
        verniz: 0.6,
        trama: 'lisa',
        contraste: 0,
        imagem: {
          cor: 'dragon-lore-antebraco.png',
          emissiva: 'dragon-lore-antebraco-emissivo.png',
          intensidadeDoEmissivo: 1.1,
          metal: 'dragon-lore-antebraco-metal.png',
          rara: { cor: 'dragon-lore-antebraco-raro.png', emissiva: 'dragon-lore-antebraco-raro-emissivo.png', metal: 'dragon-lore-antebraco-raro-metal.png' },
        },
      },
      desenho: { tipo: 'liso' },
    },
    punho: {
      material: 'couro',
      cor: 0x4b2f16,
      rugosidade: 0.62,
      verniz: 0,
      aneis: [{ de: 0.04, ate: 0.075, cor: OURO_DO_DRAGAO }, { de: 0.075, ate: 0.085, cor: 0x2a1608 }, { de: 0.915, ate: 0.925, cor: 0x2a1608 }, { de: 0.925, ate: 0.96, cor: OURO_DO_DRAGAO }],
    },
    anel: metal(OURO_DO_DRAGAO, 0.26),
    base: {
      cor: PERGAMINHO,
      rugosidade: 0.38,
      metal: 0,
      verniz: 0.6,
      trama: 'lisa',
      contraste: 0,
      imagem: { cor: 'dragon-lore-base.png', metal: 'dragon-lore-base-metal.png', rara: { cor: 'dragon-lore-base-raro.png', metal: 'dragon-lore-base-raro-metal.png' } },
    },
    borracha: borrachaPreta,
  },
};

/** As skins do catálogo, de fábrica (sem semente e sem padrão). */
export const APARENCIAS_DO_TACO: Readonly<Record<SkinTaco, AparenciaTaco>> = Object.fromEntries(
  Object.entries(BASES).map(([id, base]) => [id, { ...base, variacao: SEM_VARIACAO, padrao: null }]),
) as Record<SkinTaco, AparenciaTaco>;

/** O que um padrão (fase ou rara) troca na aparência da skin: só o que muda, peça a peça (o resto fica como a skin comum). */
export interface MudancaRara {
  readonly haste?: Partial<PecaDeMadeira>;
  /** O fundo do antebraço (a madeira de base). */
  readonly antebraco?: Partial<PecaDeMadeira>;
  readonly desenho?: DesenhoDoAntebraco;
  readonly base?: Partial<PecaDeMadeira>;
  readonly virola?: Partial<Superficie>;
  readonly junta?: Partial<Superficie>;
  readonly anel?: Partial<Superficie>;
  readonly punho?: Partial<Punho>;
  readonly halo?: AparenciaTaco['halo'];
}

function aplicarMudanca(ap: AparenciaTaco, m: MudancaRara | undefined): AparenciaTaco {
  if (m === undefined) return ap;
  return {
    ...ap,
    virola: { ...ap.virola, ...m.virola },
    haste: { ...ap.haste, ...m.haste },
    junta: { ...ap.junta, ...m.junta },
    antebraco: { base: { ...ap.antebraco.base, ...m.antebraco }, desenho: m.desenho ?? ap.antebraco.desenho },
    punho: { ...ap.punho, ...m.punho },
    anel: { ...ap.anel, ...m.anel },
    base: { ...ap.base, ...m.base },
    ...(m.halo ? { halo: m.halo } : {}),
  };
}

/** Os três fundos do taco levam o leve tom da semente (as paletas das tramas geradas o aplicam por si, na hora de pintar). */
function tingir(ap: AparenciaTaco, tom: VariacaoDaSemente['tom']): AparenciaTaco {
  return {
    ...ap,
    haste: { ...ap.haste, cor: aplicarTom(ap.haste.cor, tom) },
    antebraco: { ...ap.antebraco, base: { ...ap.antebraco.base, cor: aplicarTom(ap.antebraco.base.cor, tom) } },
    base: { ...ap.base, cor: aplicarTom(ap.base.cor, tom) },
  };
}

/**
 * A aparência de uma skin no taco de uma semente (0 a 999): a skin de fábrica com a variação da semente (rolo, deslocamento, giro,
 * escala e leve tom) e, se o catálogo dá um padrão a ela (`padraoDaSemente`: uma fase como "Phase 2" ou uma rara como "Ruby"), o que
 * esse padrão muda (`PADROES_DO_TACO`, pelo selo). Sem semente, ou com uma que não vale, é a de fábrica. Um id que o web não conhece
 * (skin nova de um servidor mais novo) cai na clássica.
 */
export function aparenciaDoTaco(skin: string, semente?: number | null): AparenciaTaco {
  const id: SkinTaco = ehSkinDeTaco(skin) ? skin : SKIN_PADRAO;
  const base = APARENCIAS_DO_TACO[id];
  const variacao = variacaoDaSemente(semente);
  if (variacao.semente === null) return base;
  const padrao = padraoDaSemente(id, variacao.semente) ?? null;
  const comTom = tingir({ ...base, variacao, padrao }, variacao.tom);
  return padrao === null ? comTom : aplicarMudanca(comTom, PADROES_DO_TACO[id]?.[padrao.selo]);
}
