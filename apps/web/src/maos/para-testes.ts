import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cinematica, lerMeta, multiplicarQuaternios, pelarMalha, quaternioDoEixo, type MetaDoPersonagem, type PoseDaFicha } from '@sinuca/personagens';
import { carregarAcessoriosDeBytes, carregarPersonagemDeBytes, carregarPersonagemDeRostoDeBytes, type BaseDeAcessorios, type BaseDoPersonagem, type BaseDoRosto } from '@sinuca/personagens/three';
import { gerenciadorDeTestes } from '@sinuca/personagens/testes';
import { MaoCalibrada } from './mao-calibrada';
import type { PoseDeMao } from './pose-das-maos';

const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../arte/personagens/exportados');

let carregada: Promise<BaseDoPersonagem> | null = null;

/** A mão do artista (`arte/personagens/exportados/mao.glb`), carregada uma vez só por arquivo de teste. */
export function maoDoArtista(): Promise<BaseDoPersonagem> {
  carregada ??= (() => {
    const glb = readFileSync(resolve(PASTA, 'mao.glb'));
    const bytes = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
    const contatos = JSON.parse(readFileSync(resolve(PASTA, 'mao-taco.json'), 'utf8')) as unknown;
    const meta = JSON.parse(readFileSync(resolve(PASTA, 'mao-meta.json'), 'utf8')) as unknown;
    return carregarPersonagemDeBytes(bytes, contatos, { cor: 0x2f78c8, meta });
  })();
  return carregada;
}

/** As notas do artista sobre os gestos (`mao-meta.json`). */
export function metaDoArtista(): MetaDoPersonagem {
  return lerMeta(JSON.parse(readFileSync(resolve(PASTA, 'mao-meta.json'), 'utf8')) as unknown);
}

export const DEDOS_LONGOS = ['indicador', 'medio', 'anelar', 'minimo'] as const;

export interface PontaNoMundo {
  readonly x: number;
  /** O ponto mais baixo da ponta (o centro menos o raio). */
  readonly y: number;
  readonly z: number;
}

/** A pose `pose` (padrão `ponte_v`) do arquivo com `dobras` (rad, uma por dedo longo) a mais em partes iguais nas três juntas de cada dedo. */
export function poseComDobras(mao: MaoCalibrada, dobras: readonly number[], pose = 'ponte_v'): PoseDaFicha {
  const base = mao.modelo.ficha.poses.get(pose)!;
  const dobrada: PoseDaFicha = { rotacoes: base.rotacoes.slice(), posicoes: base.posicoes.slice() };
  const q = new Float64Array(4);
  const r = new Float64Array(4);
  DEDOS_LONGOS.forEach((nome, k) => {
    const corrente = mao.modelo.correntes.get(nome)!;
    for (const osso of corrente.ossos) {
      const [ex, ey, ez] = corrente.eixoDeDobra;
      quaternioDoEixo(ex, ey, ez, dobras[k]! / corrente.ossos.length, q, 0);
      multiplicarQuaternios(dobrada.rotacoes, 4 * osso, q, 0, r, 0);
      dobrada.rotacoes.set(r, 4 * osso);
    }
  });
  return dobrada;
}

/** A pele da mão da ponte na pose `pose` (padrão `ponte_v`) com `dobras` a mais, no referencial do arquivo (3 números por vértice). */
export function peleDaPonte(mao: MaoCalibrada, base: BaseDoPersonagem, dobras: readonly number[], pose = 'ponte_v'): Float64Array {
  const malha = base.malha('alta');
  return pelarMalha(mao.modelo.ficha, malha, poseComDobras(mao, dobras, pose), new Float64Array(malha.posicoes.length));
}

/**
 * Onde está o ponto mais baixo da ponta de cada dedo longo, no mundo, na pose `ponte_v` do arquivo com `dobras` (rad, uma por dedo)
 * a mais em partes iguais nas três juntas: refaz o esqueleto com a dobra nos ossos, sem passar pela conta curta do plantador.
 */
export function pontasNoMundo(mao: MaoCalibrada, dobras: readonly number[], pose: PoseDeMao, nomeDaPose = 'ponte_v'): Record<(typeof DEDOS_LONGOS)[number], PontaNoMundo> {
  const cinematica = new Cinematica(mao.modelo.ficha).calcular(poseComDobras(mao, dobras, nomeDaPose));
  const wx = pose.dy * pose.uz - pose.dz * pose.uy;
  const wy = pose.dz * pose.ux - pose.dx * pose.uz;
  const wz = pose.dx * pose.uy - pose.dy * pose.ux;
  const saida = {} as Record<(typeof DEDOS_LONGOS)[number], PontaNoMundo>;
  const p = { x: 0, y: 0, z: 0 };
  const l = { x: 0, y: 0, z: 0 };
  DEDOS_LONGOS.forEach((nome) => {
    const corrente = mao.modelo.correntes.get(nome)!;
    const ultimo = corrente.ossos[corrente.ossos.length - 1]!;
    cinematica.ponto(ultimo, corrente.ponta[0], corrente.ponta[1], corrente.ponta[2], p);
    mao.local(p.x, p.y, p.z, l);
    saida[nome] = {
      x: pose.x + l.x * pose.dx + l.y * pose.ux + l.z * wx,
      y: pose.y + l.x * pose.dy + l.y * pose.uy + l.z * wy - corrente.raioDaPonta * mao.escala,
      z: pose.z + l.x * pose.dz + l.y * pose.uz + l.z * wz,
    };
  });
  return saida;
}


let balaoCarregado: Promise<BaseDoRosto> | null = null;
let balaoComoV1: Promise<BaseDoRosto> | null = null;

const ACOES_DO_V1 = ['balao_parado', 'balao_inclinar', 'balao_pulinho', 'balao_susto', 'balao_estufar', 'balao_murchar'];
const FORMAS_DO_V1 = ['cara_neutro', 'cara_sorriso', 'cara_susto', 'cara_bravo', 'cara_triste', 'piscar'];

/**
 * O mesmo `balao.glb`, lido com as notas do v1: só as seis ações, as seis formas e nenhuma chave do v2 (pálpebras, cordinha de meta,
 * abertura das caras). É o que o jogo vê enquanto o arquivo do artista for o antigo, e prova que o que é do v2 se desliga sozinho.
 */
export function balaoDoArtistaComoV1(): Promise<BaseDoRosto> {
  balaoComoV1 ??= (() => {
    const glb = readFileSync(resolve(PASTA, 'balao.glb'));
    const bytes = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
    const meta = JSON.parse(readFileSync(resolve(PASTA, 'balao-meta.json'), 'utf8')) as Record<string, unknown> & { acoes: Record<string, unknown>; formas: { nomes: string[] } };
    meta.acoes = Object.fromEntries(Object.entries(meta.acoes).filter(([nome]) => ACOES_DO_V1.includes(nome)));
    meta.formas = { ...meta.formas, nomes: meta.formas.nomes.filter((n) => FORMAS_DO_V1.includes(n)) };
    for (const chave of ['versao', 'palpebras', 'cordinha', 'abertura_da_cara', 'piscar', 'caras', 'latex_proposta', 'ancora_chapeu', 'bigodes', 'estilos_de_olho', 'cores_de_olho']) delete meta[chave];
    return carregarPersonagemDeRostoDeBytes(bytes, { meta, nomesDasMalhas: { alta: 'balao_alta', baixa: 'balao_baixa' }, acaoBase: 'balao_parado', gerenciador: gerenciadorDeTestes() });
  })();
  return balaoComoV1;
}

/** O balão do artista (`arte/personagens/exportados/balao.glb`), carregado uma vez só por arquivo de teste. */
export function balaoDoArtista(): Promise<BaseDoRosto> {
  balaoCarregado ??= (() => {
    const glb = readFileSync(resolve(PASTA, 'balao.glb'));
    const bytes = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
    const meta = JSON.parse(readFileSync(resolve(PASTA, 'balao-meta.json'), 'utf8')) as unknown;
    return carregarPersonagemDeRostoDeBytes(bytes, { meta, nomesDasMalhas: { alta: 'balao_alta', baixa: 'balao_baixa' }, acaoBase: 'balao_parado', gerenciador: gerenciadorDeTestes() });
  })();
  return balaoCarregado;
}

let chapeusCarregados: Promise<BaseDeAcessorios> | null = null;

/** Os chapéus do artista (`arte/personagens/exportados/chapeus.glb`), carregados uma vez só por arquivo de teste. */
export function chapeusDoArtista(): Promise<BaseDeAcessorios> {
  chapeusCarregados ??= (() => {
    const glb = readFileSync(resolve(PASTA, 'chapeus.glb'));
    const bytes = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
    const meta = JSON.parse(readFileSync(resolve(PASTA, 'chapeus-meta.json'), 'utf8')) as unknown;
    return carregarAcessoriosDeBytes(bytes, { meta, gerenciador: gerenciadorDeTestes() });
  })();
  return chapeusCarregados;
}
