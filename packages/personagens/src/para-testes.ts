import type { Ficha, PoseDaFicha } from './ficha';
import { poseDeRepouso } from './ficha';
import type { MalhaComPele } from './malha';
import { quaternioDoEixo } from './quaternios';

/**
 * Um esqueleto de brinquedo para os testes: `raiz` (na origem) → `palma` (5 cm adiante em `y`) → `dedo_1`, `dedo_2`, `dedo_3` (3 cm
 * cada, ao longo de `y`). O dedo dobra em torno de `x`: a dobra positiva leva a ponta para `-z`.
 */
export function fichaDeBrinquedo(): Ficha {
  const ossos = [
    { nome: 'raiz', pai: -1, posicao: [0, 0, 0] as const, rotacao: [0, 0, 0, 1] as const },
    { nome: 'palma', pai: 0, posicao: [0, 0.05, 0] as const, rotacao: [0, 0, 0, 1] as const },
    { nome: 'dedo_1', pai: 1, posicao: [0, 0.04, 0] as const, rotacao: [0, 0, 0, 1] as const },
    { nome: 'dedo_2', pai: 2, posicao: [0, 0.03, 0] as const, rotacao: [0, 0, 0, 1] as const },
    { nome: 'dedo_3', pai: 3, posicao: [0, 0.03, 0] as const, rotacao: [0, 0, 0, 1] as const },
  ];
  const poses = new Map<string, PoseDaFicha>();
  const ficha: Ficha = { ossos, poses };
  const dobrado = poseDeRepouso(ficha);
  // pose "garra": os três ossos do dedo dobram 30° (a dobra positiva em torno de x leva y para -z? ver o teste)
  for (let i = 2; i <= 4; i++) quaternioDoEixo(1, 0, 0, -Math.PI / 6, dobrado.rotacoes, 4 * i);
  poses.set('repouso', poseDeRepouso(ficha));
  poses.set('garra', dobrado);
  return ficha;
}

/** Uma malha de brinquedo para a ficha acima: uma fileira de vértices ao longo de cada osso, em volta dele, com pele rígida. */
export function malhaDeBrinquedo(): MalhaComPele {
  const posicoes: number[] = [];
  const ossos: number[] = [];
  const pesos: number[] = [];
  // posição de cada osso em repouso, no mundo (y acumulado)
  const origens = [0, 0.05, 0.09, 0.12, 0.15];
  const comprimentos = [0.05, 0.04, 0.03, 0.03, 0.02];
  const raios = [0.03, 0.03, 0.01, 0.01, 0.01];
  for (let osso = 0; osso < 5; osso++) {
    for (let k = 0; k <= 4; k++) {
      for (let a = 0; a < 6; a++) {
        const ang = (a / 6) * 2 * Math.PI;
        posicoes.push(Math.cos(ang) * raios[osso]!, origens[osso]! + (comprimentos[osso]! * k) / 4, Math.sin(ang) * raios[osso]!);
        ossos.push(osso, 0, 0, 0);
        pesos.push(1, 0, 0, 0);
      }
    }
  }
  return { posicoes: new Float64Array(posicoes), ossos: new Uint16Array(ossos), pesos: new Float64Array(pesos) };
}

/** Um sorteio de 0 a 1 que repete a mesma sequência para a mesma semente (mulberry32): o RNG injetado dos testes. */
export function sorteioDeTeste(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
