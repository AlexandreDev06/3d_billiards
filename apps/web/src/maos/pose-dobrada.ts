import { indiceDoOsso, multiplicarQuaternios, quaternioDoEixo, type ModeloDoPersonagem, type PoseDaFicha } from '@sinuca/personagens';

/** Um giro a mais num osso (`PersonagemEmCena.girarOsso`): o eixo, no referencial do osso, e o ângulo (rad). */
export interface GiroDeOsso {
  readonly osso: string;
  readonly eixo: readonly [number, number, number];
  readonly rad: number;
}

const q = new Float64Array(4);
const r = new Float64Array(4);

/**
 * A pose `pose` do arquivo com `dobras` (rad, uma por dedo de `dedos`) a mais, repartidas pelos ossos de cada dedo como o desenho as
 * reparte (`partes` da corrente; positiva fecha). É a mesma conta de `PersonagemEmCena.dobrar`, em dados, para medir a pele que o
 * desenho mostra sem passar por three.
 */
export function poseDobrada(modelo: ModeloDoPersonagem, pose: string, dedos: readonly string[], dobras: ArrayLike<number>, giro: GiroDeOsso | null = null): PoseDaFicha {
  const base = modelo.ficha.poses.get(pose);
  if (base === undefined) throw new Error(`pose "${pose}" não existe`);
  const dobrada: PoseDaFicha = { rotacoes: base.rotacoes.slice(), posicoes: base.posicoes.slice() };
  if (giro !== null) {
    // `PersonagemEmCena.girarOsso`: o giro entra no osso antes das dobras dos dedos.
    const osso = indiceDoOsso(modelo.ficha, giro.osso);
    quaternioDoEixo(giro.eixo[0], giro.eixo[1], giro.eixo[2], giro.rad, q, 0);
    multiplicarQuaternios(dobrada.rotacoes, 4 * osso, q, 0, r, 0);
    dobrada.rotacoes.set(r, 4 * osso);
  }
  dedos.forEach((nome, k) => {
    const corrente = modelo.correntes.get(nome);
    if (corrente === undefined) throw new Error(`a mão não tem o dedo "${nome}"`);
    corrente.ossos.forEach((osso, j) => {
      const [ex, ey, ez] = corrente.eixoDeDobra;
      quaternioDoEixo(ex, ey, ez, dobras[k]! * corrente.partes[j]!, q, 0);
      multiplicarQuaternios(dobrada.rotacoes, 4 * osso, q, 0, r, 0);
      dobrada.rotacoes.set(r, 4 * osso);
    });
  });
  return dobrada;
}
