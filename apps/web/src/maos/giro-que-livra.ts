import { peleNaPose, type ModeloDoPersonagem } from '@sinuca/personagens';
import { MaoCalibrada } from './mao-calibrada';
import { medidaDaCalibracao } from './memoria-da-calibracao';

const GRAU = Math.PI / 180;

/**
 * O maior giro (rad, de 0 a `giroDesejado`) com que a mão da ponte, na `pose` do arquivo (a que o `contato` descreve), deixa o taco
 * passar sem a pele entrar nele mais que `tolerancia` (m). O artista pôs o taco no V (ou no anel) com a mão reta; girar a mão no pano
 * com o V fixo no taco vira os dedos e o polegar para dentro do taco. Procura de grau em grau, do giro pedido para baixo, e devolve o
 * primeiro que cabe (zero, a pose do artista, se nenhum). Roda ao calibrar, uma vez por pose.
 */
export function giroQueLivra(modelo: ModeloDoPersonagem, contato: string, pose: string, escala: number, giroDesejado: number, tolerancia: number): number {
  return medidaDaCalibracao(modelo, `giro ${contato} ${pose} ${escala} ${giroDesejado} ${tolerancia}`, () => {
    const pele = peleNaPose(modelo, pose);
    for (let g = Math.max(giroDesejado, 0); g > 0; g -= GRAU) {
      const giro = Math.max(g, 0);
      const mao = new MaoCalibrada(modelo, contato, escala, true, giro);
      if (mao.penetracaoNoTaco(pele).pior <= tolerancia) return giro;
    }
    return 0;
  });
}
