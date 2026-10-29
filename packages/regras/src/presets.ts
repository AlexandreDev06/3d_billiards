import boteco from '../presets/boteco.json';
import mataMata from '../presets/mata-mata.json';
import treino from '../presets/treino.json';
import { bolaDeCastigo, bolasDaCasa, grupoDaBola } from './leitura';
import type { ConfigRegras, PresetRegras } from './tipos';

/** `treino` não é opção da casa: marca o preset local do treino e fica fora desta lista (e da tela "Regras da casa"). */
export type OpcoesRegras = { readonly [K in Exclude<keyof ConfigRegras, 'treino'>]: readonly ConfigRegras[K][] };

/** Valores aceitos em cada chave de `ConfigRegras` (menos `treino`), na ordem em que a tela "Regras da casa" mostra. */
export const OPCOES_REGRAS: OpcoesRegras = {
  modalidade: ['par-ou-impar', 'mata-mata'],
  bolas: ['2-14', '1-15', '2-15'],
  bolaFinal: [8, 1, 'ultima-do-grupo'],
  castigoInicio: ['centro-triangulo', 'depois-da-saida'],
  castigoLugar: ['marca-pe', 'tabela-lado-saida'],
  castigoNaSaida: ['volta', 'antes-da-hora', 'vence'],
  castigoQuando: ['tacada-separada'],
  castigoAntesDaHora: ['derrota'],
  castigoPrimeiroMesaAberta: ['falta', 'livre'],
  castigoEBrancaJuntos: ['castigo-volta', 'derrota'],
  castigoComFalta: ['castigo-volta'],
  definicaoGrupo: ['primeira-encacapada'],
  saidaComDoisGrupos: ['vale-primeira-perde-vez'],
  penaBola: ['menor-do-adversario'],
  penaDireta: [1, 2],
  penaDupla: [false, true],
  penaInvertida: [false, true],
  penaInvertidaBola: ['menor', 'maior', 'ultima'],
  penaSemGrupo: ['so-perde-vez'],
  brancaAposSuicidio: ['marca-saida'],
  suicidioNoMataMata: ['sem-pena', 'perde-proxima-vez'],
  cegarNoMataMata: ['sem-pena', 'perde-proxima-vez'],
  bolaVoltouDaCacapa: ['nao-encacapada'],
  bolaDevolvidaLugar: ['centro-mesa'],
  bolaForaDaMesa: ['sem-falta', 'falta'],
  ultimaPorPenaOuAdversario: ['vence', 'volta'],
  proximaSaida: ['perdedor', 'alternado', 'ranca-saia'],
  ordemDaVez: ['alternada'],
  quemContinua: ['mesmo-jogador', 'parceiro'],
};

const CHAVES = Object.keys(OPCOES_REGRAS) as Exclude<keyof ConfigRegras, 'treino'>[];

const ehObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const ehChave = (x: unknown): x is keyof ConfigRegras => x === 'treino' || (typeof x === 'string' && Object.hasOwn(OPCOES_REGRAS, x));

/** O que mais `validarPreset` pode aceitar. */
export interface OpcoesDeValidacao {
  /**
   * Aceita `regras.treino: true` (o preset local do treino). Sem isto, `treino` é recusado: a sala valida as regras que o
   * cliente manda com `validarPreset(dado)`, e o treino é só local.
   */
  readonly aceitaTreino?: boolean;
}

/** Confere um preset lido de JSON e devolve uma cópia congelada. Lança `Error` listando todos os problemas. */
export function validarPreset(dado: unknown, opcoes: OpcoesDeValidacao = {}): PresetRegras {
  if (!ehObjeto(dado)) throw new Error('preset inválido: não é um objeto');
  const { nome, provisorio, regras, ...resto } = dado;
  const erros = Object.keys(resto).map((chave) => `${chave}: chave desconhecida`);

  if (typeof nome !== 'string' || nome === '') erros.push('nome: precisa de um texto');

  if (!Array.isArray(provisorio)) erros.push('provisorio: precisa de uma lista de chaves das regras');
  else for (const p of provisorio) if (!ehChave(p)) erros.push(`provisorio: ${JSON.stringify(p)} não é chave das regras`);

  if (!ehObjeto(regras)) erros.push('regras: precisa de um objeto');
  else {
    for (const chave of CHAVES) {
      const opcoes: readonly unknown[] = OPCOES_REGRAS[chave];
      if (!Object.hasOwn(regras, chave)) erros.push(`regras.${chave}: falta`);
      else if (!opcoes.includes(regras[chave])) {
        erros.push(`regras.${chave}: ${JSON.stringify(regras[chave])} não é uma de ${JSON.stringify(opcoes)}`);
      }
    }
    for (const chave of Object.keys(regras)) if (!ehChave(chave)) erros.push(`regras.${chave}: chave desconhecida`);
    if (Object.hasOwn(regras, 'treino')) {
      if (regras.treino !== true) erros.push('regras.treino: precisa ser true (ou ficar de fora)');
      else if (opcoes.aceitaTreino !== true) erros.push('regras.treino: o treino é só local e não entra numa sala');
    }
    if (erros.length === 0) erros.push(...incoerenciasDaConfig(regras as unknown as ConfigRegras));
  }

  if (erros.length > 0) throw new Error(`preset inválido:\n- ${erros.join('\n- ')}`);
  return Object.freeze({
    nome: nome as string,
    provisorio: Object.freeze([...(provisorio as (keyof ConfigRegras)[])]),
    regras: Object.freeze({ ...(regras as ConfigRegras) }),
  });
}

/**
 * O que as chaves, cada uma válida, não podem dizer juntas. No par ou ímpar: a bola final fora das bolas, grupos
 * desiguais, ou uma pena do mata-mata (suicídio ou cegar) ligada (que ali não faria nada). No mata-mata: qualquer coisa que não
 * sejam as 15 bolas e nenhuma bola final. Lista vazia = coerente.
 */
export function incoerenciasDaConfig(c: ConfigRegras): string[] {
  if (c.treino === true) return incoerenciasDoTreino(c);
  if (c.modalidade === 'mata-mata') {
    const erros: string[] = [];
    if (c.bolas !== '1-15') erros.push(`regras.bolas: o mata-mata joga com as 15 bolas (1-15), não com ${c.bolas}`);
    if (c.bolaFinal !== 'ultima-do-grupo') erros.push(`regras.bolaFinal: o mata-mata não tem bola final (ultima-do-grupo), não ${JSON.stringify(c.bolaFinal)}`);
    return erros;
  }
  const erros: string[] = [];
  const final = bolaDeCastigo(c);
  const impares = bolasDaCasa(c).filter((b) => grupoDaBola(b, c) === 'impar').length;
  const pares = bolasDaCasa(c).filter((b) => grupoDaBola(b, c) === 'par').length;
  if (final !== null && !bolasDaCasa(c).includes(final)) erros.push(`regras.bolaFinal: a ${final} não está entre as bolas ${c.bolas}`);
  else if (impares !== pares) erros.push(`regras.bolas: ${impares} ímpares contra ${pares} pares com bolaFinal ${JSON.stringify(c.bolaFinal)}`);
  for (const chave of ['suicidioNoMataMata', 'cegarNoMataMata'] as const) {
    if (c[chave] !== 'sem-pena') erros.push(`regras.${chave}: ${JSON.stringify(c[chave])} só vale no mata-mata; o par ou ímpar usa "sem-pena"`);
  }
  return erros;
}

/**
 * O treino (L39) é o mata-mata de uma pessoa: as 15 bolas, sem bola final, e nenhuma pena (as duas do mata-mata em `sem-pena`,
 * senão a config prometeria uma pena que o treino não cobra).
 */
function incoerenciasDoTreino(c: ConfigRegras): string[] {
  const erros: string[] = [];
  if (c.modalidade !== 'mata-mata') erros.push(`regras.treino: o treino é o mata-mata de uma pessoa (modalidade "mata-mata"), não ${JSON.stringify(c.modalidade)}`);
  if (c.bolas !== '1-15') erros.push(`regras.bolas: o treino joga com as 15 bolas (1-15), não com ${c.bolas}`);
  if (c.bolaFinal !== 'ultima-do-grupo') erros.push(`regras.bolaFinal: o treino não tem bola final (ultima-do-grupo), não ${JSON.stringify(c.bolaFinal)}`);
  for (const chave of ['suicidioNoMataMata', 'cegarNoMataMata'] as const) {
    if (c[chave] !== 'sem-pena') erros.push(`regras.${chave}: o treino não tem pena ("sem-pena"), não ${JSON.stringify(c[chave])}`);
  }
  return erros;
}

/** Preset de fábrica: estudo §1, último parágrafo, com as respostas do usuário (2026-10-09: a 8 é a final, sem a 1 e a 15). */
export const PRESET_BOTECO: PresetRegras = validarPreset(boteco);

/** Preset do mata-mata (L15): de 2 a 4 pessoas, cada uma por si, as 15 bolas; ganha quem matar mais bolas, falta sem pena (respostas do usuário, 2026-10-14). */
export const PRESET_MATA_MATA: PresetRegras = validarPreset(mataMata);

/**
 * Preset do treino (L39): uma pessoa sozinha com as 15 bolas, sem pena nenhuma. Fica fora de `PRESETS_DE_FABRICA` de propósito:
 * o treino é só local e não entra no catálogo de modos da sala (`validarPreset` o recusa sem `aceitaTreino`).
 */
export const PRESET_TREINO: PresetRegras = validarPreset(treino, { aceitaTreino: true });

/** Os presets de fábrica, um por modalidade, na ordem em que a escolha de modo os mostra. Sem o treino (`PRESET_TREINO`). */
export const PRESETS_DE_FABRICA: readonly PresetRegras[] = Object.freeze([PRESET_BOTECO, PRESET_MATA_MATA]);
