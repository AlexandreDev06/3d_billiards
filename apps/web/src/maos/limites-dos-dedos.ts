import { peleNaPose, type ModeloDoPersonagem } from '@sinuca/personagens';
import type { MaoCalibrada } from './mao-calibrada';
import { medidaDaCalibracao } from './memoria-da-calibracao';
import { poseDobrada } from './pose-dobrada';

/** Os `t` (de -1 a 1) em que cada dedo pode ficar sem a pele entrar no taco: o menor e o maior, um por dedo, na ordem de `dedos`. */
export interface LimitesDosDedos {
  readonly min: Float32Array;
  readonly max: Float32Array;
}

const PASSO = 0.125;

/**
 * Até onde cada dedo da ponte pode esticar ou dobrar (`t` de -1 a 1, `alcance` rad no extremo) antes de a pele dele entrar no taco
 * mais que a mão já entra na pose do artista (ou `tolerancia` m, o que for maior). Cada dedo mexe sozinho e a pele toda é medida; o
 * intervalo é o que vai de 0 para cada lado enquanto o taco passa. Sem isso, plantar o dedo no pano fecha o indicador e o médio em
 * cima do taco. Roda ao calibrar, uma vez por ponte.
 */
export function limitesDosDedos(modelo: ModeloDoPersonagem, mao: MaoCalibrada, pose: string, dedos: readonly string[], alcance: number, tolerancia: number): LimitesDosDedos {
  return medidaDaCalibracao(modelo, `limites ${pose} ${dedos.join()} ${mao.escala} ${mao.espelho} ${mao.giro} ${alcance} ${tolerancia}`, () => {
    const min = new Float32Array(dedos.length).fill(-1);
    const max = new Float32Array(dedos.length).fill(1);
    const pele = new Float64Array(modelo.malha.posicoes.length);
    const dobras = new Float64Array(dedos.length);
    const medir = (i: number, t: number): number => {
      dobras.fill(0);
      dobras[i] = t * alcance;
      return mao.penetracaoNoTaco(peleNaPose(modelo, poseDobrada(modelo, pose, dedos, dobras), pele)).pior;
    };
    const neutro = medir(0, 0);
    const teto = Math.max(tolerancia, neutro + 0.0003);
    for (let i = 0; i < dedos.length; i++) {
      for (const sentido of [1, -1] as const) {
        let ultimo = 0;
        for (let t = PASSO; t <= 1 + 1e-9; t += PASSO) {
          if (medir(i, sentido * t) > teto) break;
          ultimo = t;
        }
        if (sentido === 1) max[i] = ultimo;
        else min[i] = -ultimo;
      }
    }
    return { min, max };
  });
}
