import { PALETA_DA_TEMPERA } from './acabamentos-do-taco';
import type { MudancaRara, PecaDeMadeira, TramaGerada } from './aparencia-do-taco';

/**
 * O que cada padrão do catálogo (`padroes` de cada skin, ou `raras` nas que não têm, em `packages/protocolo/src/carteira.ts`) muda no
 * desenho: as fases ("Phase 1" a "Phase 4") e as raras ("Blue Gem", "Ruby"...). É dado, como o catálogo: a chave é o `selo` do padrão
 * (único dentro da skin), o mesmo que `padraoDaSemente` devolve; quem edita o catálogo edita aqui (um teste lê os selos do catálogo e
 * confere que os dois se correspondem, sem lista própria). As skins pintadas (Coral, Bicho Solto, Howl e Dragon Lore) já usam a imagem
 * `rara` do Pincel e só mudam metais, anéis e o que é liso. Só o que muda: o resto fica como a skin comum.
 */

/** Uma peça com a trama gerada dada (o `tipo` dela é a trama). */
const com = (gerada: TramaGerada, cor: number, extra: Partial<PecaDeMadeira> = {}): Partial<PecaDeMadeira> => ({ cor, trama: gerada.tipo, gerada, ...extra });

/** As três madeiras do taco (haste, antebraço e base) com a mesma trama. */
const tudo = (haste: Partial<PecaDeMadeira>, antebraco: Partial<PecaDeMadeira> = haste, base: Partial<PecaDeMadeira> = haste): Pick<MudancaRara, 'haste' | 'antebraco' | 'base'> => ({ haste, antebraco, base });

const metalDe = (cor: number, rugosidade = 0.22) => ({ cor, rugosidade, metal: 0.95 });
const OURO_VIVO = 0xf2c230;
const PRATA = 0xe4e7ec;
const MAGENTA = 0xff2bd6;
const CIANO = 0x19f0ff;
const ROSA_NEON = 0xff6ec7;

const marmore = (cores: readonly number[], turbulencia = 0.8): TramaGerada => ({ tipo: 'marmore', cores, turbulencia });
const degrade = (paradas: readonly (readonly [number, number])[]): TramaGerada => ({ tipo: 'degrade', paradas: paradas.map(([de, cor]) => ({ de, cor })) });
/** Os véus do Doppler e do Gamma Doppler: um metal escuro com as camadas de cor (a cobertura é a fração da peça que cada uma cobre). */
const veus = (base: number, camadas: readonly (readonly [number, number] | readonly [number, number, number])[], turbulencia = 0.9): TramaGerada => ({
  tipo: 'veus',
  base,
  camadas: camadas.map(([cor, cobertura, brilho]) => ({ cor, cobertura, ...(brilho === undefined ? {} : { brilho }) })),
  turbulencia,
});
/** O taco inteiro com os véus dados: o candy vidrado de sempre, e a película irisada que a haste já tem fica. */
const candy = (gerada: TramaGerada, cor: number): Pick<MudancaRara, 'haste' | 'antebraco' | 'base'> => tudo(com(gerada, cor));

export const PADROES_DO_TACO: Readonly<Record<string, Readonly<Record<string, MudancaRara>>>> = {
  ebano: {
    // Preto vidrado com veios de ouro; juntas de ouro.
    OURO: { ...tudo(com(marmore([0x05060a, 0x0a0b10, 0xd9a336, 0x0a0b10], 0.9), 0x0a0b10, { rugosidade: 0.2, verniz: 0.9 })), junta: metalDe(OURO_VIVO), anel: metalDe(OURO_VIVO) },
    // A raiz torcida: marrons que se enroscam.
    RAIZ: tudo(com(marmore([0x2a1408, 0x6b3a1e, 0xc98a4a, 0x3a1d0c], 1), 0x6b3a1e, { rugosidade: 0.45, verniz: 0.7 })),
  },
  'xadrez-de-toalha': {
    DOMINGO: tudo(com({ tipo: 'xadrez', cores: [0x2a5db0, 0xf3eee4], casas: 6 }, 0x2a5db0), com({ tipo: 'xadrez', cores: [0x2a5db0, 0xf3eee4], casas: 8 }, 0x2a5db0), com({ tipo: 'xadrez', cores: [0x2a5db0, 0xf3eee4], casas: 8 }, 0x2a5db0)),
    MOLHO: tudo(com({ tipo: 'xadrez', cores: [0xc8202a, 0xf3eee4, 0x8a1418], casas: 6 }, 0xc8202a), com({ tipo: 'xadrez', cores: [0xc8202a, 0xf3eee4, 0x8a1418], casas: 8 }, 0xc8202a), com({ tipo: 'xadrez', cores: [0xc8202a, 0xf3eee4, 0x8a1418], casas: 8 }, 0xc8202a)),
  },
  boteco: {
    // O rótulo vira ouro maciço.
    OURO: { haste: { cor: OURO_VIVO, metal: 0.9, rugosidade: 0.22, verniz: 0.3 }, antebraco: { cor: 0x8a1a14 }, base: { cor: 0x8a1a14 }, junta: metalDe(OURO_VIVO), anel: metalDe(OURO_VIVO) },
    // Chopp de âmbar com a espuma branca na ponta.
    ESPUMA: {
      haste: { cor: 0xe09a18, faixas: [{ de: 0, ate: 0.16, cor: 0xfdf8ec }, { de: 0.16, ate: 0.2, cor: 0xf3e3b0 }, { de: 0.5, ate: 0.58, cor: 0xfdf8ec }] },
      antebraco: { cor: 0xf2e9d4 },
      base: { cor: 0xe09a18 },
      desenho: { tipo: 'bicos', cor: 0xe09a18, quantidade: 4 },
    },
  },
  marfim: {
    ANTIGO: { haste: { cor: 0xe2cf9a, contraste: 0.3, faixas: [{ de: 0.45, ate: 0.475, cor: 0x6b4a1c }, { de: 0.5, ate: 0.525, cor: 0x6b4a1c }] }, antebraco: { cor: 0xd8c488, contraste: 0.3 }, base: { cor: 0xd8c488, contraste: 0.3 } },
    JADE: { haste: { cor: 0x8fc7a4, contraste: 0.55 }, antebraco: { cor: 0x74b08c, contraste: 0.55 }, base: { cor: 0x74b08c, contraste: 0.55 }, desenho: { tipo: 'bicos', cor: 0xdff2e4, quantidade: 4 } },
  },
  'long-neck': {
    ÂMBAR: {
      ...tudo(
        com(degrade([[0, 0xffb347], [0.5, 0xb45f06], [1, 0x4a2503]]), 0xb45f06, { rugosidade: 0.07, verniz: 1, especular: { intensidade: 0.9 } }),
      ),
      virola: { cor: 0xc9741a },
    },
    RÓTULO: {
      haste: { faixas: [{ de: 0.36, ate: 0.66, cor: 0xe6c254 }, { de: 0.36, ate: 0.372, cor: 0xfff3c0 }, { de: 0.648, ate: 0.66, cor: 0xfff3c0 }, { de: 0.45, ate: 0.57, cor: 0x1f5a34 }] },
      base: { faixas: [{ de: 0.1, ate: 0.26, cor: 0xe6c254 }, { de: 0.1, ate: 0.112, cor: 0xfff3c0 }, { de: 0.248, ate: 0.26, cor: 0xfff3c0 }] },
    },
  },
  carbono: {
    // A trama em sarja diagonal: losangos de fibra.
    DIAGONAL: tudo(com({ tipo: 'rede', fundo: 0x151b26, fio: 0x4a5878, malhas: 8, espessura: 0.22 }, 0x151b26, { rugosidade: 0.26, verniz: 0.5 }), com({ tipo: 'rede', fundo: 0x151b26, fio: 0x4a5878, malhas: 9, espessura: 0.22 }, 0x151b26, { rugosidade: 0.26, verniz: 0.5 })),
    'FIBRA AZUL': {
      haste: { cor: 0x1e4aa8, faixas: [{ de: 0.36, ate: 0.4, cor: 0x7fb0ff }, { de: 0.68, ate: 0.72, cor: 0x7fb0ff }] },
      antebraco: { cor: 0x1a3f94 },
      base: { cor: 0x1a3f94 },
      junta: { cor: 0x3a7bff },
      anel: { cor: 0x3a7bff },
    },
  },
  placar: {
    // Tudo apagado: as chapas pretas, as cintas brancas e o laranja só nos detalhes.
    ZERADO: {
      ...tudo(com({ tipo: 'scifi', painel: 0x16181d, junta: 0x07080a, faixa: 0xeceef0, detalhe: 0xff6a14, colunas: 3 }, 0x16181d), com({ tipo: 'scifi', painel: 0x16181d, junta: 0x07080a, faixa: 0xeceef0, detalhe: 0xff6a14, colunas: 4 }, 0x16181d)),
      anel: { cor: 0xeceef0 },
    },
    // O painel champanhe da decisão: faixas marrons e os detalhes em ouro.
    DECISÃO: {
      ...tudo(com({ tipo: 'scifi', painel: 0xf0e3b4, junta: 0x4a3a1a, faixa: 0x3a2a12, detalhe: 0xd6a52e, colunas: 3 }, 0xf0e3b4), com({ tipo: 'scifi', painel: 0xf0e3b4, junta: 0x4a3a1a, faixa: 0x3a2a12, detalhe: 0xd6a52e, colunas: 4 }, 0xf0e3b4)),
      junta: metalDe(OURO_VIVO),
      anel: metalDe(OURO_VIVO),
    },
  },
  chamas: {
    'CHAMA AZUL': {
      haste: { chamas: [0x9fe3ff, 0x1d4fd8] },
      desenho: { tipo: 'chamas', cores: [0x9fe3ff, 0x1d4fd8] },
    },
    BRASA: {
      haste: { chamas: [0xff6a1a, 0x4a0a05] },
      desenho: { tipo: 'chamas', cores: [0xff6a1a, 0x4a0a05] },
    },
  },
  neon: {
    ROSA: {
      haste: { linhas: [MAGENTA, ROSA_NEON] },
      desenho: { tipo: 'linhas', cores: [MAGENTA, ROSA_NEON] },
      virola: { emissivo: { cor: MAGENTA, intensidade: 1.8 } },
      junta: { emissivo: { cor: ROSA_NEON, intensidade: 2 } },
      anel: { emissivo: { cor: MAGENTA, intensidade: 2 } },
      halo: { cores: [MAGENTA, ROSA_NEON], intensidade: 0.6 },
    },
    // As linhas trocam de cor e uma luz branca corre por elas.
    PISCA: {
      haste: { linhas: [MAGENTA, CIANO], varredura: { cor: 0xffffff, intensidade: 1.8, faixas: 3, velocidade: 0.8, largura: 0.25 } },
      desenho: { tipo: 'linhas', cores: [MAGENTA, CIANO] },
    },
  },
  coral: {
    // A coral de verdade, com a junta e o anel de ouro.
    VERDADEIRA: { junta: metalDe(OURO_VIVO), anel: metalDe(OURO_VIVO) },
    // A coral albina: anéis claros e prata.
    ALBINA: {
      haste: { cor: 0x2a1f22, faixas: [[0, 0.06, 0xf1d9d4], [0.06, 0.073, 0xfff3c0], [0.15, 0.163, 0xfff3c0], [0.163, 0.223, 0xf1d9d4], [0.223, 0.236, 0xfff3c0], [0.31, 0.323, 0xfff3c0], [0.323, 0.383, 0xf1d9d4], [0.383, 0.396, 0xfff3c0], [0.47, 0.483, 0xfff3c0], [0.483, 0.543, 0xf1d9d4], [0.543, 0.556, 0xfff3c0], [0.63, 0.643, 0xfff3c0], [0.643, 0.703, 0xf1d9d4], [0.703, 0.716, 0xfff3c0]].map(([de, ate, cor]) => ({ de: de!, ate: ate!, cor: cor! })) },
      junta: metalDe(PRATA),
      anel: metalDe(PRATA),
    },
  },
  'rede-de-cacapa': {
    // A teia de seda: o fio branco sobre o preto.
    SEDA: tudo(com({ tipo: 'teia', fundo: 0x08090c, fio: 0xe6e9f2, celulas: 1, raios: 8, aneis: 5, espessura: 0.015 }, 0x08090c), com({ tipo: 'teia', fundo: 0x08090c, fio: 0xe6e9f2, celulas: 1, raios: 8, aneis: 5, espessura: 0.015 }, 0x08090c)),
    // A teia rubi: o fio mais grosso, com a junta e o anel dourados.
    RUBI: {
      ...tudo(com({ tipo: 'teia', fundo: 0x08090c, fio: 0xff3355, celulas: 1, raios: 10, aneis: 6, espessura: 0.022 }, 0x08090c), com({ tipo: 'teia', fundo: 0x08090c, fio: 0xff3355, celulas: 1, raios: 10, aneis: 6, espessura: 0.022 }, 0x08090c)),
      junta: metalDe(0xc9a24a),
      anel: metalDe(0xc9a24a),
    },
  },
  'bicho-solto': {
    // Cores de sorvete e ouro.
    RARO: { junta: metalDe(OURO_VIVO), anel: metalDe(OURO_VIVO), base: { cor: 0xffd9a8 } },
    ZOO: { junta: { cor: 0x2de08a }, anel: { cor: 0x2de08a }, base: { cor: 0xff2e93 } },
  },
  ouro: {
    ROSA: {
      haste: { cor: 0xe0a08a },
      antebraco: { cor: 0xe0a08a },
      base: { cor: 0xe0a08a },
      virola: metalDe(0xf2c4b4),
      junta: metalDe(0xc98068),
      anel: metalDe(0xe0a08a),
    },
    BRANCO: {
      haste: { cor: 0xe8eaee },
      antebraco: { cor: 0xe8eaee },
      base: { cor: 0xe8eaee },
      virola: metalDe(0xf6f8fb),
      junta: metalDe(0xb7bcc6),
      anel: metalDe(PRATA),
    },
  },
  'fim-de-tarde': {
    // O Full Fade: o extremo, sem amarelo nem laranja: rosa na ponta e roxo e azul no cabo, e a semente quase não mexe no degradê.
    'FULL FADE': tudo(
      com({ tipo: 'fade', paradas: [{ de: 0, cor: 0xe45cf2 }, { de: 0.3, cor: 0xbe46ff }, { de: 0.5, cor: 0xa03cff }, { de: 0.72, cor: 0x783cff }, { de: 1, cor: 0x4850ff }], empurrao: 0.12, onda: 0.08 }, 0xff4fa0),
    ),
  },
  'resina-marmorizada': {
    // O Fire & Ice: só vermelho e azul, com o gelo branco onde eles se encontram.
    'FIRE & ICE': tudo(com(marmore([0xc4101a, 0xff3a2a, 0xe8f4ff, 0x2a6bff, 0x0a2a9a], 0.9), 0xc4101a, { rugosidade: 0.08, verniz: 1 })),
  },
  'esmeralda-do-pano': {
    // A Emerald: o verde-esmeralda vivo, quase inteiro.
    EMERALD: candy(veus(0x02281a, [[0x0fc86a, 0.93, 0.5], [0x5affaa, 0.22, 0.6], [0x03361f, 0.1]]), 0x0fc86a),
    // Fase 1: verde e ciano; 2: verde sobre o petróleo; 3: ciano e azul; 4: verde-lima.
    'PHASE 1': candy(veus(0x03140d, [[0x12c060, 0.55], [0x16d4e0, 0.35], [0x0a7a62, 0.2]]), 0x12c060),
    'PHASE 2': candy(veus(0x021a17, [[0x14b868, 0.5], [0x0a7a72, 0.45], [0x1a3a9a, 0.12]]), 0x14b868),
    'PHASE 3': candy(veus(0x03141a, [[0x16d4e0, 0.55], [0x1f7ae0, 0.4], [0x12c060, 0.12]]), 0x16d4e0),
    'PHASE 4': candy(veus(0x04180c, [[0x7ad82a, 0.4], [0x12c060, 0.5], [0x16d4e0, 0.12]]), 0x7ad82a),
  },
  obsidiana: {
    // Ruby, Sapphire e Black Pearl: o candy quase inteiro de uma cor só, e o preto e roxo profundo.
    RUBY: candy(veus(0x4a0610, [[0xd4162c, 0.93, 0.5], [0xff4a5a, 0.22, 0.6], [0x2a0208, 0.1]], 0.8), 0xd4162c),
    // O azul safira (L36b): saturado, na matiz entre o azul e o azul-ciano (~215°), sem roxo e sem verde-água. A luz quente do salão soma vermelho e
    // tira azul: o azul puro (240°) sai roxo e o mais ciano (210° com verde alto) sai verde-água, então o vermelho fica no chão, o fundo é azul (não preto)
    // e a película irisada cai a 0,15 (a de 0,5 joga verde-água sobre o azul). Na cena a mediana sai a 205 a 226°, com 59 a 65% de pixels azuis.
    SAPPHIRE: tudo(com(veus(0x082c80, [[0x0054ff, 0.99, 0.2], [0x1a6cff, 0.22, 0.1], [0x041a5a, 0.1]], 0.8), 0x0054ff, { iridescencia: { intensidade: 0.15, espessura: [200, 600] } })),
    'BLACK PEARL': candy(veus(0x0a0618, [[0x3420b4, 0.5, 0.3], [0x6a3ae8, 0.18, 0.4], [0x0a0520, 0.22]], 0.9), 0x3420b4),
    // Fase 1: preto e rosa; 2: azul e roxo; 3: verde-azulado; 4: azul.
    'PHASE 1': candy(veus(0x050409, [[0xff3d8f, 0.45, 0.4], [0x7a2ad0, 0.15]]), 0xff3d8f),
    'PHASE 2': candy(veus(0x060818, [[0x2152ff, 0.62], [0x6034f0, 0.3]]), 0x2152ff),
    'PHASE 3': candy(veus(0x04100f, [[0x0fb59a, 0.5], [0x12c060, 0.25], [0x2152ff, 0.15]]), 0x0fb59a),
    'PHASE 4': candy(veus(0x040a1c, [[0x2a6bff, 0.55], [0x4fb0ff, 0.18], [0x7a2ad0, 0.1]]), 0x2a6bff),
  },
  tempera: {
    // A Blue Gem: o aço temperado dominado pelo azul profundo.
    'BLUE GEM': tudo(com({ tipo: 'tempera', paleta: PALETA_DA_TEMPERA, foco: 0.9, dominante: 0.8, torcao: 1 }, 0x2f5fe0, { rugosidade: 0.22, metal: 0.55, verniz: 0.7 })),
  },
  // A Howl (o id `corujao`): o Lobo da Geada, a pintura em azul-gelo e branco com a junta, o anel e as faixas da base também azuis.
  corujao: {
    GEADA: {
      junta: { cor: 0x2f86d6 },
      anel: { cor: 0x2f86d6 },
      base: { cor: 0x0a111e, faixas: [{ de: 0.08, ate: 0.12, cor: 0x2f86d6 }, { de: 0.12, ate: 0.14, cor: 0xe2f6ff }, { de: 0.86, ate: 0.88, cor: 0xe2f6ff }, { de: 0.88, ate: 0.92, cor: 0x2f86d6 }] },
    },
  },
  // A Dragon Lore (o id `dragao-das-quinze`): o Ouro Verde, a pintura em verde e ouro com o punho verde de anéis de ouro.
  'dragao-das-quinze': {
    'OURO VERDE': {
      punho: { cor: 0x16452a, aneis: [{ de: 0.04, ate: 0.075, cor: 0xd6a52e }, { de: 0.075, ate: 0.085, cor: 0x0f2010 }, { de: 0.915, ate: 0.925, cor: 0x0f2010 }, { de: 0.925, ate: 0.96, cor: 0xd6a52e }] },
    },
  },
};
