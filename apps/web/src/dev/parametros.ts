import type { ConfigFisica } from '@sinuca/fisica';
import { apagarJson, gravarJson, lerJson, type ArmazenamentoMinimo } from '../armazenamento';
import type { ConfigPrevisao, ConfigTacada } from '../config';
import { CONTROLE_DE_FORCA_PADRAO, type ControleForca } from '../controles/forca-linha';

const CHAVES_FISICA = [
  'atritoDeslizamento',
  'atritoRolamento',
  'desaceleracaoGiro',
  'fatorEfeitoLateral',
  'restituicaoBolaBola',
  'restituicaoBolaTabela',
  'atritoBolaTabela',
  'velocidadeMaxTaco',
] as const satisfies readonly (keyof ConfigFisica)[];

const CHAVES_FORCA = ['expoenteForca', 'velocidadeEntradaMax', 'velocidadeMin', 'velocidadeMax'] as const satisfies readonly (keyof ConfigTacada)[];

type ChaveFisica = (typeof CHAVES_FISICA)[number];
type ChaveForca = (typeof CHAVES_FORCA)[number];
type ChavePrevisao = 'forcaPrevisao' | 'previsaoLigada' | 'previsaoBolaAtingida';
/** 1 = força pela linha, 0 = empurrar (o interruptor do painel; o `?forca=` da URL vale por cima). */
type ChaveControle = 'forcaPorLinha';
export type ChaveDoPainel = ChaveFisica | ChaveForca | ChaveControle | ChavePrevisao;
export type GrupoDoPainel = 'fisica' | 'forca' | 'previsao';

/** Valores atuais dos sliders, por nome do campo da config. */
export type ValoresDoPainel = Readonly<Record<ChaveDoPainel, number>>;

export interface Descritor {
  readonly chave: ChaveDoPainel;
  readonly grupo: GrupoDoPainel;
  /** `'chave'` = liga/desliga (valor 0 ou 1); sem `tipo` = slider. */
  readonly tipo?: 'chave';
  readonly rotulo: string;
  readonly dica: string;
  readonly unidade: string;
  readonly min: number;
  readonly max: number;
  readonly passo: number;
}

/** Faixas: as da skill `sinuca-fisica`, com folga nas pontas para o ouvido do usuário decidir. */
export const DESCRITORES: readonly Descritor[] = [
  { chave: 'atritoDeslizamento', grupo: 'fisica', rotulo: 'Atrito de deslizamento', dica: 'μ bola-pano com a bola escorregando', unidade: '', min: 0.1, max: 0.5, passo: 0.005 },
  { chave: 'atritoRolamento', grupo: 'fisica', rotulo: 'Atrito de rolamento', dica: 'μ bola-pano rolando: quanto o pano é lento', unidade: '', min: 0.002, max: 0.05, passo: 0.0005 },
  { chave: 'desaceleracaoGiro', grupo: 'fisica', rotulo: 'Desaceleração do giro', dica: 'giro em torno de Y parando', unidade: 'rad/s²', min: 2, max: 25, passo: 0.5 },
  { chave: 'fatorEfeitoLateral', grupo: 'fisica', rotulo: 'Efeito lateral', dica: 'quanto do lado do mini-bolão chega ao contato (0,6 = 60%); o miscue segue o mini-bolão inteiro', unidade: '', min: 0.2, max: 1, passo: 0.05 },
  { chave: 'restituicaoBolaBola', grupo: 'fisica', rotulo: 'Restituição bola-bola', dica: 'quanto da velocidade volta no choque', unidade: '', min: 0.85, max: 0.99, passo: 0.005 },
  { chave: 'restituicaoBolaTabela', grupo: 'fisica', rotulo: 'Restituição bola-tabela', dica: 'quanto a tabela devolve', unidade: '', min: 0.5, max: 0.95, passo: 0.01 },
  { chave: 'atritoBolaTabela', grupo: 'fisica', rotulo: 'Atrito bola-tabela', dica: 'efeito se perdendo na tabela', unidade: '', min: 0.05, max: 0.5, passo: 0.01 },
  { chave: 'velocidadeMaxTaco', grupo: 'fisica', rotulo: 'Velocidade máx. do taco', dica: 'teto da física: a curva de força tem o seu, abaixo', unidade: 'm/s', min: 3, max: 12, passo: 0.1 },
  { chave: 'forcaPorLinha', grupo: 'forca', tipo: 'chave', rotulo: 'Força pela linha', dica: 'ligada: segura o botão, puxa o mouse para trás e solta para tacar; desligada: puxa e empurra para bater (também ?forca=linha|empurrar)', unidade: '', min: 0, max: 1, passo: 1 },
  { chave: 'expoenteForca', grupo: 'forca', rotulo: 'Expoente da força', dica: '> 1: tacada leve pede movimento mais lento', unidade: '', min: 1, max: 3, passo: 0.05 },
  { chave: 'velocidadeEntradaMax', grupo: 'forca', rotulo: 'Mouse para força máxima', dica: 'velocidade do mouse que dá a força cheia', unidade: 'm/s', min: 1, max: 10, passo: 0.1 },
  { chave: 'velocidadeMin', grupo: 'forca', rotulo: 'Força mínima', dica: 'velocidade do taco no toque mais leve', unidade: 'm/s', min: 0.02, max: 0.5, passo: 0.01 },
  { chave: 'velocidadeMax', grupo: 'forca', rotulo: 'Força máxima', dica: 'velocidade do taco na puxada mais forte (a física limita em "Velocidade máx. do taco")', unidade: 'm/s', min: 1, max: 12, passo: 0.1 },
  { chave: 'previsaoLigada', grupo: 'previsao', tipo: 'chave', rotulo: 'Linha de previsão', dica: 'caminho do bolão calculado pela física (atalho L)', unidade: '', min: 0, max: 1, passo: 1 },
  { chave: 'previsaoBolaAtingida', grupo: 'previsao', tipo: 'chave', rotulo: 'Linha da bola atingida', dica: 'trecho curto da primeira bola que o bolão toca', unidade: '', min: 0, max: 1, passo: 1 },
  { chave: 'forcaPrevisao', grupo: 'previsao', rotulo: 'Força da previsão', dica: 'velocidade do taco da tacada prevista', unidade: 'm/s', min: 0.2, max: 12, passo: 0.1 },
];

const POR_CHAVE: ReadonlyMap<ChaveDoPainel, Descritor> = new Map(DESCRITORES.map((d) => [d.chave, d]));

const limitar = (d: Descritor, valor: number): number => {
  const dentro = Math.min(Math.max(valor, d.min), d.max);
  return d.tipo === 'chave' ? Math.round(dentro) : dentro;
};

export function valoresPadrao(fisica: ConfigFisica, tacada: ConfigTacada, previsao: ConfigPrevisao, controle: ControleForca = CONTROLE_DE_FORCA_PADRAO): ValoresDoPainel {
  const v = {} as Record<ChaveDoPainel, number>;
  v.forcaPorLinha = controle === 'linha' ? 1 : 0;
  for (const chave of CHAVES_FISICA) v[chave] = fisica[chave];
  for (const chave of CHAVES_FORCA) v[chave] = tacada[chave];
  v.forcaPrevisao = previsao.velocidadeTaco;
  v.previsaoLigada = previsao.ligada ? 1 : 0;
  v.previsaoBolaAtingida = previsao.bolaAtingida ? 1 : 0;
  return v;
}

/** A config de física da próxima tacada: a base com os valores do painel por cima. */
export function fisicaDoPainel(base: ConfigFisica, valores: ValoresDoPainel): ConfigFisica {
  const cfg = { ...base } as { -readonly [K in keyof ConfigFisica]: ConfigFisica[K] };
  for (const chave of CHAVES_FISICA) cfg[chave] = valores[chave];
  return cfg;
}

/** O controle de força do painel: a linha (1) ou o empurrar (0). */
export const controleDoPainel = (valores: ValoresDoPainel): ControleForca => (valores.forcaPorLinha === 1 ? 'linha' : 'empurrar');

/** A curva de força: a base com o painel por cima. O teto dela (`velocidadeMax`) é um slider próprio; o da física só limita a tacada. */
export function tacadaDoPainel(base: ConfigTacada, valores: ValoresDoPainel): ConfigTacada {
  const cfg = { ...base } as { -readonly [K in keyof ConfigTacada]: ConfigTacada[K] };
  for (const chave of CHAVES_FORCA) cfg[chave] = valores[chave];
  return cfg;
}

type Agrupado = Readonly<Record<GrupoDoPainel, Record<string, number>>>;

function agrupar(valores: ValoresDoPainel): Agrupado {
  const grupos: Agrupado = { fisica: {}, forca: {}, previsao: {} };
  for (const d of DESCRITORES) grupos[d.grupo][d.chave] = valores[d.chave];
  return grupos;
}

/** O que o botão "Copiar JSON" entrega: os valores atuais, agrupados. */
export function jsonDoPainel(valores: ValoresDoPainel): string {
  return JSON.stringify(agrupar(valores), null, 2);
}

/** O valor da chave `d` no formato de `jsonDoPainel` (agrupado), se for um número. */
function lerChave(agrupado: unknown, d: Descritor): number | undefined {
  const grupo = typeof agrupado === 'object' && agrupado !== null ? (agrupado as Record<string, unknown>)[d.grupo] : undefined;
  const valor = typeof grupo === 'object' && grupo !== null ? (grupo as Record<string, unknown>)[d.chave] : undefined;
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : undefined;
}

const CHAVE_ARMAZENAMENTO = 'sinuca.painel-dev';

/**
 * Versão do que o botão "Lembrar" grava: `{ versao, padrao, valores }`, com o padrão de quando se lembrou. Quem
 * grava formato novo sobe este número; o que vier com outra versão (ou sem, como antes) é descartado.
 */
export const VERSAO_DOS_SALVOS = 2;

/** O que o painel achou lembrado neste navegador, já conferido com os padrões de agora. */
export interface LeituraDosSalvos {
  /** Os valores que valem: os lembrados que ainda fazem sentido por cima do padrão de agora. */
  readonly valores: ValoresDoPainel;
  /** Chaves que o jogador tinha mexido e cujo padrão mudou desde então: o valor antigo foi descartado (vale o padrão novo). */
  readonly descartados: readonly ChaveDoPainel[];
  /** Vinha de uma versão antiga (ou desconhecida) do painel: nada dele vale. */
  readonly antigo: boolean;
}

/**
 * O que o usuário mandou "lembrar"; `null` se não há nada (ou não dá para ler). Um valor lembrado só vale se o padrão
 * daquela chave é o mesmo de quando se lembrou: mudou o padrão, o salvo antigo é descartado em vez de valer por cima.
 * O que faltar ou não for número vem do padrão; o que passar da faixa é cortado.
 */
export function lerValoresSalvos(padrao: ValoresDoPainel, armazenamento?: ArmazenamentoMinimo | null): LeituraDosSalvos | null {
  const salvo = lerJson(CHAVE_ARMAZENAMENTO, armazenamento);
  if (typeof salvo !== 'object' || salvo === null) return null;
  const { versao, padrao: padraoDeEntao, valores: lembrados } = salvo as Record<string, unknown>;
  if (versao !== VERSAO_DOS_SALVOS) return { valores: padrao, descartados: [], antigo: true };
  const valores = { ...padrao } as Record<ChaveDoPainel, number>;
  const descartados: ChaveDoPainel[] = [];
  for (const d of DESCRITORES) {
    const valor = lerChave(lembrados, d);
    if (valor === undefined) continue;
    const eraPadrao = lerChave(padraoDeEntao, d);
    if (eraPadrao === padrao[d.chave]) valores[d.chave] = limitar(d, valor);
    else if (valor !== eraPadrao) descartados.push(d.chave);
  }
  return { valores, descartados, antigo: false };
}

/** O que o painel diz depois de ler os valores lembrados, se algo foi descartado; vazio se nada foi. */
export function avisoDosSalvos(leitura: LeituraDosSalvos | null): string {
  if (leitura === null) return '';
  if (leitura.antigo) return 'Os valores lembrados eram de uma versão antiga do painel: foram descartados e vale o padrão.';
  if (leitura.descartados.length === 0) return '';
  const nomes = leitura.descartados.map((chave) => POR_CHAVE.get(chave)?.rotulo ?? chave).join(', ');
  return `O padrão mudou desde que você lembrou (${nomes}): esses valores foram descartados e vale o padrão novo.`;
}

/** Grava os valores, com os padrões de agora, para o próximo carregamento saber se o padrão mudou. */
export function salvarValores(valores: ValoresDoPainel, padrao: ValoresDoPainel, armazenamento?: ArmazenamentoMinimo | null): boolean {
  return gravarJson(CHAVE_ARMAZENAMENTO, { versao: VERSAO_DOS_SALVOS, padrao: agrupar(padrao), valores: agrupar(valores) }, armazenamento);
}

export function esquecerValores(armazenamento?: ArmazenamentoMinimo | null): boolean {
  return apagarJson(CHAVE_ARMAZENAMENTO, armazenamento);
}

/** Os valores dos sliders, com a faixa de cada um e aviso a quem escuta. */
export class EstadoDoPainel {
  private atuais: ValoresDoPainel;
  private readonly ouvintes: ((valores: ValoresDoPainel) => void)[] = [];

  constructor(
    readonly padrao: ValoresDoPainel,
    inicial: ValoresDoPainel = padrao,
  ) {
    this.atuais = inicial;
  }

  get valores(): ValoresDoPainel {
    return this.atuais;
  }

  /** Algum valor difere do padrão. */
  get alterado(): boolean {
    return DESCRITORES.some((d) => this.atuais[d.chave] !== this.padrao[d.chave]);
  }

  definir(chave: ChaveDoPainel, valor: number): void {
    if (!Number.isFinite(valor)) return;
    const novo = limitar(POR_CHAVE.get(chave)!, valor);
    if (novo === this.atuais[chave]) return;
    this.atuais = { ...this.atuais, [chave]: novo };
    this.avisar();
  }

  /** Vira um interruptor (0 ↔ 1); em slider não faz nada. */
  alternar(chave: ChaveDoPainel): void {
    if (POR_CHAVE.get(chave)?.tipo !== 'chave') return;
    this.definir(chave, 1 - this.atuais[chave]);
  }

  restaurar(): void {
    if (!this.alterado) return;
    this.atuais = this.padrao;
    this.avisar();
  }

  aoMudar(ouvinte: (valores: ValoresDoPainel) => void): () => void {
    this.ouvintes.push(ouvinte);
    return () => {
      const i = this.ouvintes.indexOf(ouvinte);
      if (i >= 0) this.ouvintes.splice(i, 1);
    };
  }

  private avisar(): void {
    for (const ouvinte of [...this.ouvintes]) ouvinte(this.atuais);
  }
}
