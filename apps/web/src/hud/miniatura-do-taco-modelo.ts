import type { MedidasTaco } from '@sinuca/fisica';
import type { AparenciaTaco, Superficie, Trama } from '../cena/aparencia-do-taco';
import { partesDoTaco, type NomeDaParte } from '../cena/perfil-do-taco';

/** 0xRRGGBB → `#rrggbb`. */
export const corCss = (cor: number): string => `#${cor.toString(16).padStart(6, '0')}`;

/** Mistura duas cores `#rrggbb`: `t` 0 = a primeira, 1 = a segunda (fora disso é limitado). */
export function misturarCores(a: string, b: string, t: number): string {
  const peso = Math.min(Math.max(t, 0), 1);
  const canal = (cor: string, i: number): number => parseInt(cor.slice(1 + 2 * i, 3 + 2 * i), 16);
  const misto = [0, 1, 2].map((i) => Math.round(canal(a, i) + (canal(b, i) - canal(a, i)) * peso));
  return `#${misto.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Uma das nove peças do taco no desenho plano: de `de` a `ate` do comprimento (0 = ponta, 1 = cabo), com o raio em fração do maior. */
export interface PecaDaMiniatura {
  readonly nome: NomeDaParte;
  readonly de: number;
  readonly ate: number;
  readonly raioDe: number;
  readonly raioAte: number;
  readonly cor: string;
  readonly metal: boolean;
  readonly trama: Trama;
  /** A cor com que a peça acende (neon); `null` = não acende. */
  readonly brilho: string | null;
}

/** O que se pinta por cima das peças, sempre em frações do comprimento do taco. */
export type DetalheDaMiniatura =
  | { readonly tipo: 'faixa'; readonly de: number; readonly ate: number; readonly cor: string; readonly brilho: boolean }
  | { readonly tipo: 'bicos'; readonly de: number; readonly ate: number; readonly cor: string; readonly quantidade: number }
  | { readonly tipo: 'chamas'; readonly de: number; readonly ate: number; readonly cores: readonly [string, string] }
  | { readonly tipo: 'linhas'; readonly de: number; readonly ate: number; readonly cores: readonly [string, string] };

export interface MiniaturaDoTaco {
  readonly pecas: readonly PecaDaMiniatura[];
  readonly detalhes: readonly DetalheDaMiniatura[];
  /** O brilho que vaza do taco aceso (neon); `null` nas outras. */
  readonly halo: { readonly cores: readonly [string, string]; readonly intensidade: number } | null;
}

/**
 * O plano do desenho 2D de uma skin (a miniatura da loja): as peças com o perfil do taco de verdade e os detalhes da
 * aparência, em frações do comprimento. Sem canvas nem three: quem pinta é `miniatura-do-taco.ts`.
 */
export function miniaturaDoTaco(aparencia: AparenciaTaco, medidas: MedidasTaco): MiniaturaDoTaco {
  const L = medidas.comprimento;
  const partes = partesDoTaco(medidas);
  const raioMaximo = Math.max(...partes.flatMap((p) => [p.raio(p.de), p.raio(p.ate)]));
  const superficieDe = (nome: NomeDaParte): { cor: number; metal: boolean; trama: Trama; brilho: number | null } => {
    const lisa = (s: Superficie) => ({ cor: s.cor, metal: s.metal > 0.5, trama: 'lisa' as Trama, brilho: s.emissivo?.cor ?? null });
    const madeira = (s: Superficie & { trama: Trama }) => ({ ...lisa(s), trama: s.trama });
    switch (nome) {
      case 'sola':
        return { cor: aparencia.ponta.giz, metal: false, trama: 'lisa', brilho: null };
      case 'virola':
        return lisa(aparencia.virola);
      case 'haste':
        return madeira(aparencia.haste);
      case 'junta':
        return lisa(aparencia.junta);
      case 'antebraco':
        return madeira(aparencia.antebraco.base);
      case 'punho':
        return { cor: aparencia.punho.cor, metal: false, trama: 'lisa', brilho: null };
      case 'anel':
        return lisa(aparencia.anel);
      case 'base':
        return madeira(aparencia.base);
      case 'borracha':
        return lisa(aparencia.borracha);
    }
  };

  const pecas = partes.map((p): PecaDaMiniatura => {
    const s = superficieDe(p.nome);
    return {
      nome: p.nome,
      de: p.de / L,
      ate: p.ate / L,
      raioDe: p.raio(p.de) / raioMaximo,
      raioAte: p.raio(p.ate) / raioMaximo,
      cor: corCss(s.cor),
      metal: s.metal,
      trama: s.trama,
      brilho: s.brilho === null ? null : corCss(s.brilho),
    };
  });
  const da = (nome: NomeDaParte): PecaDaMiniatura => pecas.find((p) => p.nome === nome)!;
  /** Posição `u` (0 a 1) dentro da peça, em fração do comprimento do taco. */
  const naPeca = (nome: NomeDaParte, u: number): number => da(nome).de + u * (da(nome).ate - da(nome).de);

  const detalhes: DetalheDaMiniatura[] = [];
  const faixasDe = (nome: 'haste' | 'base', faixas: AparenciaTaco['haste']['faixas']): void => {
    for (const f of faixas ?? []) detalhes.push({ tipo: 'faixa', de: naPeca(nome, f.de), ate: naPeca(nome, f.ate), cor: corCss(f.cor), brilho: f.brilho === true });
  };
  faixasDe('haste', aparencia.haste.faixas);
  const haste = da('haste');
  if (aparencia.haste.trama === 'neon' && aparencia.haste.linhas) {
    detalhes.push({ tipo: 'linhas', de: haste.de, ate: haste.ate, cores: [corCss(aparencia.haste.linhas[0]), corCss(aparencia.haste.linhas[1])] });
  }
  if (aparencia.haste.trama === 'chamas' && aparencia.haste.chamas) {
    detalhes.push({ tipo: 'chamas', de: haste.de, ate: haste.ate, cores: [corCss(aparencia.haste.chamas[0]), corCss(aparencia.haste.chamas[1])] });
  }
  const antebraco = da('antebraco');
  const desenho = aparencia.antebraco.desenho;
  if (desenho.tipo === 'bicos') detalhes.push({ tipo: 'bicos', de: antebraco.de, ate: antebraco.ate, cor: corCss(desenho.cor), quantidade: desenho.quantidade });
  else if (desenho.tipo === 'chamas') detalhes.push({ tipo: 'chamas', de: antebraco.de, ate: antebraco.ate, cores: [corCss(desenho.cores[0]), corCss(desenho.cores[1])] });
  else if (desenho.tipo === 'linhas') detalhes.push({ tipo: 'linhas', de: antebraco.de, ate: antebraco.ate, cores: [corCss(desenho.cores[0]), corCss(desenho.cores[1])] });
  if (aparencia.punho.faixa !== undefined) detalhes.push({ tipo: 'faixa', de: naPeca('punho', 0.4), ate: naPeca('punho', 0.6), cor: corCss(aparencia.punho.faixa), brilho: false });
  faixasDe('base', aparencia.base.faixas);

  const halo = aparencia.halo ? { cores: [corCss(aparencia.halo.cores[0]), corCss(aparencia.halo.cores[1])] as const, intensidade: aparencia.halo.intensidade } : null;
  return { pecas, detalhes, halo };
}
