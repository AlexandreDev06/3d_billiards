import { SKIN_PADRAO, ehSkinDeTaco, type SkinTaco } from '@sinuca/protocolo';

/**
 * Como cada peça do taco se desenha: cores, madeira, metal, brilho, o que acende e o desenho do antebraço. É só dado (nada de
 * three): `cena/taco.ts` o transforma em malhas e materiais, e a loja só escolhe uma `SkinTaco` do catálogo do protocolo.
 */

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
}

/**
 * O que a textura da peça desenha: `veio` (madeira, com `contraste`), `carbono` (trama de fibra), `lisa` (cor só) e `neon`
 * (duas linhas finas que acendem, nas cores de `linhas`, ao longo da peça).
 */
export type Trama = 'veio' | 'carbono' | 'lisa' | 'neon' | 'chamas';

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
  /** Anéis pintados por cima da trama. */
  readonly faixas?: readonly Faixa[];
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
}

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

/** As oito skins do catálogo. */
export const APARENCIAS_DO_TACO: Readonly<Record<SkinTaco, AparenciaTaco>> = {
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
};

/** A aparência de uma skin; um id que o web não conhece (skin nova de um servidor mais novo) cai na clássica. */
export function aparenciaDoTaco(skin: string): AparenciaTaco {
  return APARENCIAS_DO_TACO[ehSkinDeTaco(skin) ? skin : SKIN_PADRAO];
}
