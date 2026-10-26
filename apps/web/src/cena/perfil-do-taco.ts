import type { MedidasTaco } from '@sinuca/fisica';

/** As peças do taco, da ponta ao cabo. */
export const NOMES_DAS_PARTES = ['sola', 'virola', 'haste', 'junta', 'antebraco', 'punho', 'anel', 'base', 'borracha'] as const;

export type NomeDaParte = (typeof NOMES_DAS_PARTES)[number];

/** Uma peça torneada: de `de` a `ate` metros da ponta, com o raio dado por `raio(q)` (q em m da ponta). */
export interface ParteDoTaco {
  readonly nome: NomeDaParte;
  readonly de: number;
  readonly ate: number;
  readonly raio: (q: number) => number;
}

/** Quanto o desenho passa do cone de `TACO` (anéis e punho): é o que a folga de `ElevacaoDoTaco` precisa cobrir. */
export const SOBRA_MAXIMA_DO_PERFIL = 1.045;

/** O raio do cone liso de ponta a ponta (`raioPonta` na ponta, `raioBase` no cabo): o que a elevação e a física supõem. */
export function raioDoCone(taco: MedidasTaco, q: number): number {
  return taco.raioPonta + ((taco.raioBase - taco.raioPonta) * q) / taco.comprimento;
}

const hump = (u: number): number => Math.sin(Math.PI * Math.min(Math.max(u, 0), 1));

/**
 * As nove peças, com proporções de taco de sinuca dentro de `TACO`: sola de couro (calota), virola de ~27 mm, a haste até o meio
 * (cone de tacada), o anel da junta, o antebraço, o punho enrolado, o anel, a base e a tampa de borracha arredondada. Cada raio
 * é o do cone vezes uma pequena folga de desenho (o anel e o punho engrossam até 4,5%).
 */
export function partesDoTaco(taco: MedidasTaco): readonly ParteDoTaco[] {
  const L = taco.comprimento;
  const cone = (q: number): number => raioDoCone(taco, q);
  // A sola é uma calota que acaba no raio da ponta: r² = 2·Rc·q − q², com Rc tal que r(h) = raio.
  const alturaDaSola = 0.75 * taco.raioPonta;
  const raioDaSola = 0.98 * taco.raioPonta;
  const curvatura = (raioDaSola ** 2 + alturaDaSola ** 2) / (2 * alturaDaSola);
  const fim: Readonly<Record<NomeDaParte, number>> = {
    sola: alturaDaSola,
    virola: alturaDaSola + 4.5 * taco.raioPonta,
    haste: 0.5 * L,
    junta: 0.511 * L,
    antebraco: 0.69 * L,
    punho: 0.862 * L,
    anel: 0.87 * L,
    base: 0.985 * L,
    borracha: L,
  };
  /** Onde a peça começa: onde a de antes termina (a sola, na ponta). */
  const de = (nome: NomeDaParte): number => {
    const anterior = NOMES_DAS_PARTES[NOMES_DAS_PARTES.indexOf(nome) - 1];
    return anterior === undefined ? 0 : fim[anterior];
  };
  const parte = (nome: NomeDaParte, raio: (q: number) => number): ParteDoTaco => ({ nome, de: de(nome), ate: fim[nome], raio });
  const u = (nome: NomeDaParte, q: number): number => (q - de(nome)) / (fim[nome] - de(nome));
  return [
    parte('sola', (q) => Math.sqrt(Math.max(2 * curvatura * q - q * q, 0))),
    parte('virola', (q) => cone(q)),
    parte('haste', (q) => cone(q) * 0.997),
    parte('junta', (q) => cone(q) * (1 + 0.035 * Math.min(1, 4 * hump(u('junta', q))))),
    parte('antebraco', (q) => cone(q)),
    parte('punho', (q) => cone(q) * (1 + 0.012 * hump(u('punho', q)))),
    parte('anel', (q) => cone(q) * (1 + 0.04 * Math.min(1, 4 * hump(u('anel', q))))),
    parte('base', (q) => cone(q)),
    // A tampa: o último quarto arredonda até fechar.
    parte('borracha', (q) => {
      const t = u('borracha', q);
      const arredondado = t > 0.7 ? Math.sqrt(Math.max(1 - ((t - 0.7) / 0.3) ** 2, 0)) : 1;
      return cone(q) * 0.975 * arredondado;
    }),
  ];
}

/** Um ponto do perfil: a `q` m da ponta, com raio `r`. */
export interface PontoDoPerfil {
  readonly q: number;
  readonly r: number;
}

/**
 * Os pontos do perfil de uma peça, de `de` a `ate`, com no mínimo `minimo` e no máximo um a cada `passo` m. A calota da sola
 * pede mais pontos perto da ponta (raio que cresce depressa): os pontos se concentram no começo, `q = h·(i/n)²`.
 */
export function amostrasDaParte(parte: ParteDoTaco, passo = 0.02, minimo = 2): PontoDoPerfil[] {
  const comprimento = parte.ate - parte.de;
  const arredondada = parte.nome === 'sola' || parte.nome === 'borracha';
  const n = Math.max(Math.ceil(comprimento / passo), arredondada ? Math.max(minimo, 10) : minimo);
  const pontos: PontoDoPerfil[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Calota (sola) e tampa (borracha): pontos mais juntos onde o raio muda depressa, na ponta e no fim do cabo.
    const f = parte.nome === 'sola' ? t * t : parte.nome === 'borracha' ? 1 - (1 - t) ** 2 : t;
    const q = parte.de + comprimento * f;
    pontos.push({ q, r: parte.raio(q) });
  }
  return pontos;
}

/** A silhueta inteira num perfil só (para a casca vermelha da bola errada): o cone com a ponta e o cabo arredondados. */
export function perfilDaSilhueta(taco: MedidasTaco, passo = 0.04): PontoDoPerfil[] {
  const partes = partesDoTaco(taco);
  const pontos: PontoDoPerfil[] = [];
  for (const parte of partes) {
    const n = Math.max(Math.ceil((parte.ate - parte.de) / passo), parte.nome === 'sola' || parte.nome === 'borracha' ? 8 : 1);
    for (let i = parte.nome === 'sola' ? 0 : 1; i <= n; i++) {
      const t = i / n;
      const f = parte.nome === 'sola' ? t * t : parte.nome === 'borracha' ? 1 - (1 - t) ** 2 : t;
      const q = parte.de + (parte.ate - parte.de) * f;
      pontos.push({ q, r: parte.raio(q) });
    }
  }
  return pontos;
}
