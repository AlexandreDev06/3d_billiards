import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkinnedMesh } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { sorteioDeTeste } from '../para-testes';
import { carregarPersonagemDeRostoDeBytes, type BaseDoRosto } from './carregar-rosto';
import { gerenciadorDeTestes } from './para-testes-three';
import type { OpcoesDoPiscador } from '../rosto';

/**
 * L46c: o ritmo do piscar com o balão do arquivo de verdade, olhando a bola e a câmera como no jogo (duas vagas de interesse, a bola
 * vale 3,2 e a câmera 0,7: cada ida e volta do olhar é uma sacada grande, e cada sacada grande pede um piscar). Sem um intervalo mínimo
 * ele piscava ~30 vezes por minuto, o dobro do natural, e parecia nervoso.
 */
const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../arte/personagens/exportados');
const glb = readFileSync(resolve(PASTA, 'balao.glb'));
const bytes = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
const meta = JSON.parse(readFileSync(resolve(PASTA, 'balao-meta.json'), 'utf8')) as unknown;
const OPCOES = { meta, nomesDasMalhas: { alta: 'balao_alta', baixa: 'balao_baixa' }, acaoBase: 'balao_parado', gerenciador: gerenciadorDeTestes() } as const;

let base: BaseDoRosto;
beforeAll(async () => {
  base = await carregarPersonagemDeRostoDeBytes(bytes.slice(0), OPCOES);
});

const JANELA_S = 120;
const QUADROS_POR_S = 60;
/** Duas piscadas separadas por menos que isto são um par (a piscada dupla do piscador) e contam como uma só. */
const PAR_ATE_S = 0.6;
const FECHADO = 0.1;

interface Ritmo {
  readonly porMinuto: number;
  /** O menor tempo (s) entre o fim de uma piscada (ou par) e o começo da seguinte. */
  readonly menorIntervaloS: number;
  readonly pares: number;
}

function ritmoDoBalao(semente: number, piscar?: Partial<OpcoesDoPiscador>): Ritmo {
  const p = base.instanciar({ cor: 0xffffff, sorteio: sorteioDeTeste(semente), piscar });
  p.fazerCara('cara_concentrado');
  p.fazerAcao('balao_concentrar', { entradaS: 0.3, saidaS: 0.3, repetir: true });
  p.definirInteresse(0, { x: 0.2, y: -0.45, z: 0.5 }, 3.2);
  p.definirInteresse(4, { x: 0, y: 0.1, z: 1.5 }, 0.7);
  let malha: SkinnedMesh | null = null;
  p.raiz.traverse((o) => {
    if (malha === null && (o as SkinnedMesh).isSkinnedMesh && o.visible) malha = o as SkinnedMesh;
  });
  const m = malha as unknown as SkinnedMesh;
  const k = m.morphTargetDictionary!.piscar!;
  const dt = 1 / QUADROS_POR_S;
  // começa depois de 5 s, para o olhar já ter assentado; cada piscada vira (início, fim) em segundos
  for (let i = 0; i < 5 * QUADROS_POR_S; i++) p.atualizar(dt);
  const piscadas: Array<[number, number]> = [];
  let inicio = -1;
  for (let i = 0; i < JANELA_S * QUADROS_POR_S; i++) {
    p.atualizar(dt);
    const fechado = m.morphTargetInfluences![k]! > FECHADO;
    const t = i * dt;
    if (fechado && inicio < 0) inicio = t;
    else if (!fechado && inicio >= 0) {
      piscadas.push([inicio, t]);
      inicio = -1;
    }
  }
  // o par de uma piscada dupla é um evento só
  const eventos: Array<[number, number]> = [];
  for (const [a, b] of piscadas) {
    const ultimo = eventos[eventos.length - 1];
    if (ultimo !== undefined && a - ultimo[1] < PAR_ATE_S) ultimo[1] = b;
    else eventos.push([a, b]);
  }
  const intervalos = eventos.slice(1).map(([a], i) => a - eventos[i]![1]);
  return { porMinuto: (eventos.length / JANELA_S) * 60, menorIntervaloS: Math.min(...intervalos), pares: piscadas.length - eventos.length };
}

/** O intervalo mínimo padrão do piscador (`intervaloMinimoS`) e a folga de um quadro e meio da conta (o pedido vale no quadro em que chega). */
const INTERVALO_MINIMO_S = 2.5;
const FOLGA_S = 2 / QUADROS_POR_S;
const SEMENTES = [1, 2, 3, 4];

describe('o ritmo do piscar olhando a bola e a câmera (L46c)', () => {
  let ritmos: Ritmo[] = [];
  beforeAll(() => {
    ritmos = SEMENTES.map((s) => ritmoDoBalao(s));
  }, 60000);

  it.each(SEMENTES)('semente %i: de 12 a 20 piscadas por minuto numa janela de 120 s (a piscada dupla conta como uma)', (semente) => {
    const r = ritmos[semente - 1]!;
    expect(r.porMinuto).toBeGreaterThanOrEqual(12);
    expect(r.porMinuto).toBeLessThanOrEqual(20);
  });

  it('nunca pisca de novo antes de 2,5 s desde a última, nem quando a sacada grande pede', () => {
    for (const r of ritmos) expect(r.menorIntervaloS).toBeGreaterThanOrEqual(INTERVALO_MINIMO_S - FOLGA_S);
  });

  it('a piscada dupla segue existindo, como evento raro (menos de 1 em cada 3 eventos)', () => {
    const pares = ritmos.reduce((soma, r) => soma + r.pares, 0);
    const eventos = ritmos.reduce((soma, r) => soma + (r.porMinuto * JANELA_S) / 60, 0);
    expect(pares).toBeGreaterThan(0);
    expect(pares).toBeLessThan(eventos / 3);
  });

  it('o intervalo é opção do piscador: com 6 s o balão pisca bem menos e respeita os 6 s', () => {
    const lento = ritmoDoBalao(1, { intervaloMinimoS: 6, minS: 6, maxS: 8 });
    expect(lento.porMinuto).toBeLessThan(12);
    expect(lento.menorIntervaloS).toBeGreaterThanOrEqual(6 - FOLGA_S);
  });
});
