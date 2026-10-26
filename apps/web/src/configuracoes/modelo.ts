import type { ConfigCamera, ConfigMira, ConfigTacada } from '../config';

/** As sensibilidades de um jogador. Todas são multiplicadores do valor de fábrica: 1 = como o jogo vem. */
export type ChaveDeConfiguracao =
  | 'sensibilidadeMira'
  | 'sensibilidadeMiraFina'
  | 'sensibilidadeForca'
  | 'curvaForca'
  | 'sensibilidadeOrbita'
  | 'sensibilidadeZoom'
  | 'giroDaCamera';

export type ConfiguracoesDoJogador = Readonly<Record<ChaveDeConfiguracao, number>>;

export interface DescritorDeConfiguracao {
  readonly chave: ChaveDeConfiguracao;
  readonly grupo: 'mira' | 'forca' | 'camera';
  readonly rotulo: string;
  /** O que o controle faz, em uma frase (vira o `title` e o texto de ajuda). */
  readonly dica: string;
  /** Os dois lados do controle, para o jogador saber para onde vai. */
  readonly pontaMenor: string;
  readonly pontaMaior: string;
  readonly minimo: number;
  readonly maximo: number;
}

export const DESCRITORES: readonly DescritorDeConfiguracao[] = [
  {
    chave: 'sensibilidadeMira',
    grupo: 'mira',
    rotulo: 'Mira',
    dica: 'Quanto o taco gira por movimento do mouse na horizontal.',
    pontaMenor: 'Mais lenta',
    pontaMaior: 'Mais rápida',
    minimo: 0.2,
    maximo: 4,
  },
  {
    chave: 'sensibilidadeMiraFina',
    grupo: 'mira',
    rotulo: 'Mira fina (Shift)',
    dica: 'Com Shift apertado a mira gira só uma fração do normal. Aqui você escolhe essa fração.',
    pontaMenor: 'Mais fina',
    pontaMaior: 'Menos fina',
    minimo: 0.25,
    maximo: 3,
  },
  {
    chave: 'sensibilidadeForca',
    grupo: 'forca',
    rotulo: 'Força da tacada',
    dica: 'Quanto o taco anda por movimento do mouse na hora de puxar e empurrar: mais alta pede menos mouse para a mesma força. Na linha de força, é quanto mouse a barra cheia pede.',
    pontaMenor: 'Pede mais mouse',
    pontaMaior: 'Pede menos mouse',
    minimo: 0.4,
    maximo: 2.5,
  },
  {
    chave: 'curvaForca',
    grupo: 'forca',
    rotulo: 'Curva da força',
    dica: 'Como a velocidade do mouse vira força. Mais progressiva deixa as tacadas leves mais fáceis e pede um empurrão firme para a forte. Só vale quando a força é por empurrar (na linha de força a barra manda).',
    pontaMenor: 'Mais linear',
    pontaMaior: 'Mais progressiva',
    minimo: 0.6,
    maximo: 1.6,
  },
  {
    chave: 'sensibilidadeOrbita',
    grupo: 'camera',
    rotulo: 'Câmera: órbita (botão direito)',
    dica: 'Quanto a câmera gira em volta da mesa por movimento do mouse com o botão direito apertado.',
    pontaMenor: 'Mais lenta',
    pontaMaior: 'Mais rápida',
    minimo: 0.25,
    maximo: 4,
  },
  {
    chave: 'sensibilidadeZoom',
    grupo: 'camera',
    rotulo: 'Câmera: zoom (roda)',
    dica: 'Quanto cada clique da roda aproxima ou afasta a câmera.',
    pontaMenor: 'Passos curtos',
    pontaMaior: 'Passos longos',
    minimo: 0.25,
    maximo: 4,
  },
  {
    chave: 'giroDaCamera',
    grupo: 'camera',
    rotulo: 'Câmera: giro da tacada',
    dica: 'Com que pressa a câmera de tacada acompanha a mira: baixa é suave e demorada, alta cola no taco.',
    pontaMenor: 'Mais suave',
    pontaMaior: 'Mais colada',
    minimo: 0.3,
    maximo: 3,
  },
];

export const CONFIGURACOES_PADRAO: ConfiguracoesDoJogador = {
  sensibilidadeMira: 1,
  sensibilidadeMiraFina: 1,
  sensibilidadeForca: 1,
  curvaForca: 1,
  sensibilidadeOrbita: 1,
  sensibilidadeZoom: 1,
  giroDaCamera: 1,
};

export const descritorDe = (chave: ChaveDeConfiguracao): DescritorDeConfiguracao => DESCRITORES.find((d) => d.chave === chave)!;

/** Põe o valor dentro da faixa do controle; o que não é número finito vira o padrão. */
export function limitar(chave: ChaveDeConfiguracao, valor: unknown): number {
  const d = descritorDe(chave);
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return CONFIGURACOES_PADRAO[chave];
  return Math.min(Math.max(valor, d.minimo), d.maximo);
}

/** Do que veio do armazenamento (qualquer coisa) a um conjunto completo e dentro das faixas. */
export function sanear(bruto: unknown): ConfiguracoesDoJogador {
  const lido = (typeof bruto === 'object' && bruto !== null ? bruto : {}) as Record<string, unknown>;
  const saida = { ...CONFIGURACOES_PADRAO } as Record<ChaveDeConfiguracao, number>;
  for (const d of DESCRITORES) saida[d.chave] = limitar(d.chave, lido[d.chave]);
  return saida;
}

export function ehPadrao(c: ConfiguracoesDoJogador): boolean {
  return DESCRITORES.every((d) => c[d.chave] === CONFIGURACOES_PADRAO[d.chave]);
}

/** Passo máximo do zoom por clique da roda: acima disso um clique pularia a faixa do zoom. */
const PASSO_ZOOM_MAXIMO = 0.5;
const EXPOENTE_MINIMO = 0.5;

export function miraDoJogador(base: ConfigMira, c: ConfiguracoesDoJogador): ConfigMira {
  return {
    radianosPorPixel: base.radianosPorPixel * c.sensibilidadeMira,
    fatorFino: Math.min(base.fatorFino * c.sensibilidadeMiraFina, 1),
  };
}

export function tacadaDoJogador(base: ConfigTacada, c: ConfiguracoesDoJogador): ConfigTacada {
  return {
    ...base,
    metrosPorPixel: base.metrosPorPixel * c.sensibilidadeForca,
    expoenteForca: Math.max(base.expoenteForca * c.curvaForca, EXPOENTE_MINIMO),
  };
}

export function cameraDoJogador(base: ConfigCamera, c: ConfiguracoesDoJogador): ConfigCamera {
  return {
    ...base,
    orbital: { ...base.orbital, radiosPorPixel: base.orbital.radiosPorPixel * c.sensibilidadeOrbita },
    passoZoom: Math.min(base.passoZoom * c.sensibilidadeZoom, PASSO_ZOOM_MAXIMO),
    taxaSuavizacao: base.taxaSuavizacao * c.giroDaCamera,
  };
}
