import { MODALIDADES_DE_SALA, SKINS_DE_TACO, type ContagemDeEstatisticas, type EstadoCarteira, type ResumoDeEstatisticas } from '@sinuca/protocolo';
import { ROTULO_MODALIDADE, type Modalidade } from '@sinuca/regras';
import { barraDoMenu, type TacoDaBarra } from '../hud/menu-modelo';

/**
 * O perfil (L43), puro: o que a tela do perfil escreve a partir da carteira do aparelho (`EstadoCarteira`, lida de `GET /carteira`) e
 * a linha de resumo de cada lugar na sala de espera (`LugarSala.estatisticas`). Sem DOM, sem rede e sem o código da carteira.
 */

/** A linha discreta do perfil: o que a sala conta e o que ela não conta. */
export const NOTA_DO_PERFIL = 'Só contam as partidas online com a física padrão.';

/** O que o perfil diz quando a carteira ainda não tem partida contada. */
export const SEM_PARTIDAS_NO_PERFIL = 'Nenhuma partida contada ainda. Jogue online, com a física padrão, e os números aparecem aqui.';

/** O que a sala de espera escreve de quem tem carteira mas ainda não tem partida contada. */
export const SEM_PARTIDAS_NA_ESPERA = 'sem partidas contadas';

/** O que o perfil diz quando a sala não responde: a carteira (e com ela as estatísticas) mora lá. */
export const AVISO_PERFIL_FORA_DO_AR = 'A sala está fora do ar agora, e é nela que ficam a sua carteira e os seus números. O perfil volta quando ela voltar.';

const TRACO = '—';

/** A porcentagem de vitórias (0 a 100, inteira); `null` sem partidas. */
export function porcentagemDeVitorias(vitorias: number, partidas: number): number | null {
  if (!Number.isFinite(vitorias) || !Number.isFinite(partidas) || partidas <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((vitorias / partidas) * 100)));
}

/** "58%", ou "—" sem partidas. */
export function textoDaPorcentagem(vitorias: number, partidas: number): string {
  const p = porcentagemDeVitorias(vitorias, partidas);
  return p === null ? TRACO : `${p}%`;
}

const plural = (n: number, singular: string, varios: string): string => `${n} ${n === 1 ? singular : varios}`;

const inteiroNaoNegativo = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/**
 * A linha curta de baixo do nome na sala de espera: "12 vitórias em 30 · 85 bolas". Quem tem carteira mas nunca teve partida contada
 * leva "sem partidas contadas"; quem não tem resumo (sem carteira, vago, sala que não o manda, número estragado) fica sem a linha (`null`).
 */
export function resumoDoLugar(resumo: ResumoDeEstatisticas | null | undefined): string | null {
  if (resumo === null || resumo === undefined) return null;
  const { partidas, vitorias, bolas } = resumo;
  if (!inteiroNaoNegativo(partidas) || !inteiroNaoNegativo(vitorias) || !inteiroNaoNegativo(bolas)) return null;
  if (partidas === 0) return SEM_PARTIDAS_NA_ESPERA;
  return `${plural(vitorias, 'vitória', 'vitórias')} em ${partidas} · ${plural(bolas, 'bola', 'bolas')}`;
}

// ---------------------------------------------------------------- as estatísticas na tela

export type ChaveDaLinha = 'partidas' | 'vitorias' | 'aproveitamento' | 'bolas' | 'sequencia' | 'tabeladas' | 'missoes' | 'moedas';

/** As linhas da tabela, na ordem em que a tela as lista. */
const LINHAS: readonly { readonly chave: ChaveDaLinha; readonly rotulo: string; readonly dica: string }[] = [
  { chave: 'partidas', rotulo: 'Partidas', dica: 'Partidas online que acabaram de verdade' },
  { chave: 'vitorias', rotulo: 'Vitórias', dica: 'Das partidas, as que a sua equipe venceu' },
  { chave: 'aproveitamento', rotulo: 'Aproveitamento', dica: 'Vitórias em cada cem partidas' },
  { chave: 'bolas', rotulo: 'Bolas matadas', dica: 'Bolas que caíram em tacada sem falta' },
  { chave: 'sequencia', rotulo: 'Maior sequência', dica: 'A maior sequência de bolas numa vez' },
  { chave: 'tabeladas', rotulo: 'Tabeladas', dica: 'Bolas que caíram depois de bater na tabela' },
  { chave: 'missoes', rotulo: 'Missões cumpridas', dica: 'Missões do dia cumpridas nessas partidas' },
  { chave: 'moedas', rotulo: 'Moedas ganhas', dica: 'O que a aposta pagou a mais e os prêmios das missões' },
];

export interface ColunaDoPerfil {
  readonly id: 'total' | Modalidade;
  /** "Total", "Par ou ímpar", "Mata-mata". */
  readonly rotulo: string;
  /** Há ao menos uma partida contada nesta coluna; sem isso a coluna só tem traços. */
  readonly temDados: boolean;
}

export interface LinhaDoPerfil {
  readonly chave: ChaveDaLinha;
  readonly rotulo: string;
  readonly dica: string;
  /** Um texto por coluna, na ordem de `colunas`. */
  readonly valores: readonly string[];
}

export interface EstatisticasNaTela {
  /** O total e depois uma coluna por modalidade do catálogo da sala. */
  readonly colunas: readonly ColunaDoPerfil[];
  readonly linhas: readonly LinhaDoPerfil[];
  /** Nenhuma partida contada em lugar nenhum: a tela escreve `SEM_PARTIDAS_NO_PERFIL` no lugar da tabela. */
  readonly vazio: boolean;
  /** A sala não mandou as estatísticas (sala de antes do L38): o perfil trata como vazio, mas o aviso é outro. */
  readonly semDadosDaSala: boolean;
}

function valoresDaContagem(c: ContagemDeEstatisticas | undefined): readonly string[] {
  if (c === undefined || c.partidas <= 0) return LINHAS.map(() => TRACO);
  const texto: Readonly<Record<ChaveDaLinha, string>> = {
    partidas: String(c.partidas),
    vitorias: String(c.vitorias),
    aproveitamento: textoDaPorcentagem(c.vitorias, c.partidas),
    bolas: String(c.bolas),
    sequencia: String(c.sequencia),
    tabeladas: String(c.tabeladas),
    missoes: String(c.missoes),
    moedas: String(c.moedas),
  };
  return LINHAS.map((l) => texto[l.chave]);
}

/** As estatísticas da carteira em colunas: total e uma por modalidade, com o aproveitamento calculado aqui. */
export function estatisticasNaTela(carteira: EstadoCarteira | null): EstatisticasNaTela {
  const e = carteira?.estatisticas;
  const contagens: readonly { readonly id: ColunaDoPerfil['id']; readonly rotulo: string; readonly contagem: ContagemDeEstatisticas | undefined }[] = [
    { id: 'total', rotulo: 'Total', contagem: e?.total },
    ...MODALIDADES_DE_SALA.map((m) => ({ id: m, rotulo: ROTULO_MODALIDADE[m], contagem: e?.modalidades[m] })),
  ];
  const colunas = contagens.map((c): ColunaDoPerfil => ({ id: c.id, rotulo: c.rotulo, temDados: c.contagem !== undefined && c.contagem.partidas > 0 }));
  const porColuna = contagens.map((c) => valoresDaContagem(c.contagem));
  const linhas = LINHAS.map((l, i): LinhaDoPerfil => ({ chave: l.chave, rotulo: l.rotulo, dica: l.dica, valores: porColuna.map((v) => v[i]!) }));
  return { colunas, linhas, vazio: !colunas[0]!.temDados, semDadosDaSala: carteira !== null && e === undefined };
}

// ---------------------------------------------------------------- o perfil inteiro

export interface PerfilNaTela {
  /** O apelido que o jogador digitou, ou "Sem apelido". */
  readonly apelido: string;
  readonly temApelido: boolean;
  /** O taco em uso, para a miniatura e o nome. */
  readonly taco: TacoDaBarra;
  /** Quantas skins tem; `null` sem carteira lida. */
  readonly skinsQueTem: number | null;
  readonly skinsNoCatalogo: number;
  /** "5 de 21 skins", ou "—" sem carteira lida. */
  readonly textoDasSkins: string;
  /** A carteira foi lida: sem ela só o apelido e o taco de fábrica aparecem e a tela mostra o aviso da carteira. */
  readonly temCarteira: boolean;
  readonly estatisticas: EstatisticasNaTela;
  readonly nota: string;
}

/** O perfil a partir da carteira do aparelho (`null` = ainda não lida ou sala fora do ar) e do apelido que o jogador digitou. */
export function perfilNaTela(carteira: EstadoCarteira | null, apelido: string): PerfilNaTela {
  const barra = barraDoMenu(carteira, apelido);
  const skinsQueTem = carteira === null ? null : (carteira.itens?.length ?? carteira.skins.length);
  const skinsNoCatalogo = SKINS_DE_TACO.length;
  return {
    apelido: barra.apelido,
    temApelido: barra.temApelido,
    taco: barra.taco,
    skinsQueTem,
    skinsNoCatalogo,
    textoDasSkins: skinsQueTem === null ? TRACO : `${skinsQueTem} de ${skinsNoCatalogo} skins`,
    temCarteira: carteira !== null,
    estatisticas: estatisticasNaTela(carteira),
    nota: NOTA_DO_PERFIL,
  };
}
