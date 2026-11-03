import { raioNoPonto, type ContatoDeCilindro } from './contatos';

/** O quanto uma nuvem de pontos entra num cilindro. */
export interface Penetracao {
  /** O maior quanto um ponto entra (m, ao longo do raio); 0 se nenhum entra. */
  readonly pior: number;
  /** Quantos pontos entram mais que `limite`. */
  readonly quantos: number;
  /**
   * A menor folga entre a pele e o cilindro (m): a distância do ponto mais perto ao raio, com o sinal contrário de `pior` (negativa =
   * entra). `Infinity` se nenhum ponto cai entre as duas pontas.
   */
  readonly folga: number;
  /** Onde, no eixo (m, a partir do ponto onde a mão segura, para o fim fino), está o ponto que mais entra. */
  readonly onde: number;
}

/**
 * Quanto a pele (3 números por ponto) entra no cilindro que `c` descreve. Os pontos vêm no quadro do contato: a origem no ponto onde a
 * mão segura, `x` ao longo do eixo para o fim fino, `y` e `z` perpendiculares, em metros do tamanho do jogo. O cilindro é o cone do
 * arquivo: o raio vai de `raioNoPonto` na origem a `raioFino` e `raioLargo` nas duas pontas, e só valem os pontos entre elas.
 *
 * É a pergunta "o taco atravessa a mão?": zero ou perto de zero = o taco passa pelo vão (o V, o anel dos dedos) sem tocar a pele.
 */
export function penetracaoNoCilindro(pontos: ArrayLike<number>, c: ContatoDeCilindro, limite = 0): Penetracao {
  const r0 = raioNoPonto(c);
  const afina = (c.raioLargo - c.raioFino) / c.comprimento;
  const noFino = c.distanciaDoFim;
  const noLargo = c.distanciaDoFim - c.comprimento;
  let pior = 0;
  let quantos = 0;
  let onde = 0;
  let folga = Infinity;
  for (let i = 0; i < pontos.length; i += 3) {
    const x = pontos[i]!;
    if (x > noFino || x < noLargo) continue;
    const entra = r0 - afina * x - Math.hypot(pontos[i + 1]!, pontos[i + 2]!);
    if (-entra < folga) folga = -entra;
    if (entra > limite) quantos++;
    if (entra > pior) {
      pior = entra;
      onde = x;
    }
  }
  return { pior, quantos, folga, onde };
}
