import { peleNaPose, raioNoPonto, type ModeloDoPersonagem } from '@sinuca/personagens';
import { TACO } from '@sinuca/fisica';
import type { MaoCalibrada } from './mao-calibrada';
import { medidaDaCalibracao } from './memoria-da-calibracao';
import { poseDobrada } from './pose-dobrada';

/** Os dedos da mão de trás que fecham no taco (o polegar também: ele abraça o taco); os mesmos que `cena/maos.ts` dobra. */
export const NOMES_DOS_DEDOS_DO_PUNHO: readonly string[] = ['indicador', 'medio', 'anelar', 'minimo', 'polegar'];

/**
 * A folga entre a pele da mão de trás e o taco do arquivo (m, a menor; negativa = entra) para cada dobra dos dedos (`passo` rad, a
 * partir de `de`) e para cada giro do pulso (`pulsos`, rad): `folgas[k]` é a curva das dobras com o pulso em `pulsos[k]`.
 */
export interface CurvaDoPunho {
  readonly de: number;
  readonly passo: number;
  readonly pulsos: readonly number[];
  readonly folgas: readonly Float32Array[];
  /** Para cada giro de `pulsos`, a maior folga que alguma dobra dá (os dedos o mais abertos que servem). */
  readonly melhores: readonly number[];
  /** Onde `folgasNoPulso` escreve a curva do pulso de agora. */
  readonly agora: Float32Array;
}

const PASSO_DO_PULSO = 0.05;

/** O raio (m) do taco do jogo a `q` m da ponta. */
export function raioDoTacoA(q: number): number {
  return TACO.raioPonta + ((TACO.raioBase - TACO.raioPonta) * Math.min(Math.max(q, 0), TACO.comprimento)) / TACO.comprimento;
}

/**
 * Mede a folga entre a pele da mão de trás, na `pose` do arquivo (o taco do artista no ponto em que ela segura), e o taco, com todos
 * os `dedos` dobrados juntos de `de` a `ate` rad e o osso do pulso girado de `-pulsoMaximo` a `pulsoMaximo` rad em torno de `eixo`.
 * Roda ao calibrar, uma vez.
 */
export function curvaDoPunho(
  modelo: ModeloDoPersonagem,
  mao: MaoCalibrada,
  pose: string,
  dedos: readonly string[],
  pulso: { readonly osso: string; readonly eixo: readonly [number, number, number]; readonly maximo: number },
  de = -0.3,
  ate = 0.7,
  passo = 0.05,
): CurvaDoPunho {
  return medidaDaCalibracao(modelo, `punho ${pose} ${dedos.join()} ${mao.escala} ${mao.giro} ${pulso.osso} ${pulso.eixo.join()} ${pulso.maximo} ${de} ${ate} ${passo}`, () => {
    const n = Math.round((ate - de) / passo) + 1;
    const pele = new Float64Array(modelo.malha.posicoes.length);
    const dobras = new Float64Array(dedos.length);
    const metade = Math.ceil(pulso.maximo / PASSO_DO_PULSO);
    const pulsos = Array.from({ length: 2 * metade + 1 }, (_, i) => (i - metade) * (pulso.maximo / metade));
    const folgas = pulsos.map((rad) => {
      const curva = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        dobras.fill(de + k * passo);
        curva[k] = mao.penetracaoNoTaco(peleNaPose(modelo, poseDobrada(modelo, pose, dedos, dobras, { osso: pulso.osso, eixo: pulso.eixo, rad }), pele)).folga;
      }
      return curva;
    });
    return { de, passo, pulsos, folgas, melhores: folgas.map((curva) => Math.max(...curva)), agora: new Float32Array(n) };
  });
}

/** A curva das dobras com o pulso girado `rad` (interpola entre os dois giros medidos mais perto); escreve em `curva.agora`. */
function folgasNoPulso(curva: CurvaDoPunho, rad: number): Float32Array {
  const { pulsos, folgas, agora } = curva;
  const x = Math.min(Math.max(rad, pulsos[0]!), pulsos[pulsos.length - 1]!);
  let k = 0;
  while (k < pulsos.length - 2 && x > pulsos[k + 1]!) k++;
  const t = (x - pulsos[k]!) / (pulsos[k + 1]! - pulsos[k]!);
  const a = folgas[k]!;
  const b = folgas[k + 1]!;
  for (let i = 0; i < agora.length; i++) agora[i] = a[i]! + (b[i]! - a[i]!) * t;
  return agora;
}

/**
 * A dobra (rad) em que a folga da curva `folgas` vale `folga`, a partir da pose do arquivo (dobra 0): fechar se a folga pedida é menor
 * que a da pose, abrir se é maior. Entre dois passos interpola; se a curva acaba antes, o extremo (ao fechar) ou a dobra de maior folga (ao abrir, onde a folga não cresce sempre). A pele toda conta, e longe da dobra 0
 * a folga pode vir de outra parte da mão (a palma), por isso a busca não sai do zero em direção ao extremo.
 */
export function dobraComFolga(folgas: ArrayLike<number>, de: number, passo: number, folga: number): number {
  const k0 = Math.min(Math.max(Math.round(-de / passo), 0), folgas.length - 1);
  const sentido = folga <= folgas[k0]! ? 1 : -1;
  let melhor = k0;
  for (let k = k0 + sentido; k >= 0 && k < folgas.length; k += sentido) {
    const antes = folgas[k - sentido]!;
    const agora = folgas[k]!;
    if (sentido === -1 && agora > folgas[melhor]!) melhor = k;
    if ((sentido === 1 && agora <= folga) || (sentido === -1 && agora >= folga)) {
      const t = antes === agora ? 0 : (antes - folga) / (antes - agora);
      return de + (k - sentido + sentido * t) * passo;
    }
  }
  return sentido === 1 ? de + (folgas.length - 1) * passo : de + melhor * passo;
}

/**
 * O quanto a mão de trás cresce (1 ou mais) para fechar no taco do jogo a `agarre` m da ponta: além do ponto em que o artista pôs a
 * mão (`contato.distanciaDoFim`) o taco é mais grosso que o dele, e os dedos já abertos ao máximo não o cercam; a mão cresce na razão
 * dos raios, com o ponto do taco onde ela segura parado (`MaoCalibrada.quadro` cuida disso). Mais perto da ponta, a mão fecha
 * os dedos (`dobraDoAgarre`) em vez de crescer.
 */
export function escalaDoAgarre(mao: MaoCalibrada, agarre: number): number {
  return Math.max(1, raioDoTacoA(agarre) / raioNoPonto(mao.contato));
}

/**
 * O giro do pulso (rad) que a mão de trás aguenta sem a pele entrar no taco do jogo a `agarre` m da ponta mais que `tolerancia` m,
 * por mais que os dedos abram: o `pulso` pedido, ou o que cabe, de cada lado do zero. A palma entra no taco quando o pulso gira
 * demais, e nenhuma dobra dos dedos a tira de lá.
 */
export function pulsoQueCabe(curva: CurvaDoPunho, mao: MaoCalibrada, agarre: number, pulso: number, tolerancia: number): number {
  const minimo = -Math.max(raioNoPonto(mao.contato) - raioDoTacoA(agarre), 0) - tolerancia;
  const { pulsos, melhores } = curva;
  const k0 = pulsos.indexOf(0);
  if (k0 < 0 || melhores[k0]! < minimo) return 0;
  const sentido = pulso >= 0 ? 1 : -1;
  let limite = pulsos[k0]!;
  for (let k = k0 + sentido; k >= 0 && k < pulsos.length; k += sentido) {
    const a = melhores[k - sentido]!;
    const b = melhores[k]!;
    if (b >= minimo) {
      limite = pulsos[k]!;
      continue;
    }
    const t = a === b ? 0 : (a - minimo) / (a - b);
    limite = pulsos[k - sentido]! + (pulsos[k]! - pulsos[k - sentido]!) * t;
    break;
  }
  return sentido > 0 ? Math.min(pulso, limite) : Math.max(pulso, limite);
}

/**
 * O quanto os dedos da mão de trás dobram a mais (rad) para fechar no taco do jogo a `agarre` m da ponta, com o pulso girado `pulso`
 * rad, onde o taco é mais fino ou mais grosso que o do arquivo: a dobra em que a pele toca o taco. `aperto` (rad, a batida) fecha a
 * mais, mas só até a pele entrar `folgaDoAperto` m: um taco não se espreme.
 */
export function dobraDoAgarre(curva: CurvaDoPunho, mao: MaoCalibrada, agarre: number, pulso: number, aperto: number, folgaDoAperto: number): number {
  const diferenca = Math.max(raioNoPonto(mao.contato) - raioDoTacoA(agarre), 0);
  const folgas = folgasNoPulso(curva, pulso);
  const encosta = dobraComFolga(folgas, curva.de, curva.passo, -diferenca);
  const limite = dobraComFolga(folgas, curva.de, curva.passo, -diferenca - folgaDoAperto);
  return Math.min(encosta + Math.max(aperto, 0), limite);
}
