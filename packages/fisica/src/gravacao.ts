import { CONFIG_FISICA_PADRAO, medidasDaBola } from './config';
import { pontoDeSaida } from './medidas';
import { posicoesTriangulo } from './triangulo';
import { ID_BOLAO, type EventoTacada, type Gravacao, type IdBola } from './tipos';

const DURACAO_TESTE = 2;
const PERCURSO_TESTE = 0.8;

/**
 * Gravação sintética para o player antes da física existir: o bolão sai da
 * marca da saída para +X rolando sem escorregar, com desaceleração constante
 * (exagerada, não é a do motor), e para a 0,8 m dali em 2 s, antes do
 * triângulo. As 15 numeradas ficam paradas no triângulo, a bola `n` na posição `n − 1`.
 */
export function gravacaoDeTeste(): Gravacao {
  const { mesa, frequenciaGravacao: frequencia } = CONFIG_FISICA_PADRAO;
  const ids: IdBola[] = Array.from({ length: 16 }, (_, i) => i);
  const quadros = Math.ceil(DURACAO_TESTE * frequencia) + 1;
  const posicoes = new Float32Array(quadros * ids.length * 3);
  const orientacoes = new Float32Array(quadros * ids.length * 4);
  const naMesa = new Uint8Array(quadros * ids.length).fill(1);

  const saida = pontoDeSaida(mesa);
  const triangulo = posicoesTriangulo(mesa, CONFIG_FISICA_PADRAO.bola.raio);
  const desaceleracao = (2 * PERCURSO_TESTE) / DURACAO_TESTE ** 2;
  const velocidadeInicial = desaceleracao * DURACAO_TESTE;
  const raioBolao = medidasDaBola(ID_BOLAO).raio;

  for (let q = 0; q < quadros; q++) {
    const t = Math.min(q / frequencia, DURACAO_TESTE);
    const percorrido = velocidadeInicial * t - (desaceleracao * t * t) / 2;
    const giro = percorrido / raioBolao;
    ids.forEach((id, i) => {
      const k = q * ids.length + i;
      const raio = medidasDaBola(id).raio;
      if (id === ID_BOLAO) {
        posicoes.set([saida.x + percorrido, raio, saida.z], k * 3);
        // Rolar para +X é girar em torno de ŷ × x̂ = −ẑ.
        orientacoes.set([0, 0, -Math.sin(giro / 2), Math.cos(giro / 2)], k * 4);
      } else {
        const p = triangulo[id - 1]!;
        posicoes.set([p.x, raio, p.z], k * 3);
        orientacoes.set([0, 0, 0, 1], k * 4);
      }
    });
  }

  const eventos: EventoTacada[] = [
    { tipo: 'taco-bola', t: 0, bola: ID_BOLAO, velocidade: velocidadeInicial, miscue: false },
    { tipo: 'parou', t: DURACAO_TESTE },
  ];
  return { frequencia, ids, quadros, duracao: DURACAO_TESTE, posicoes, orientacoes, naMesa, eventos };
}
