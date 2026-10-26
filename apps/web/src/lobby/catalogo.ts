import { FORMATO_DO_MODO, MODALIDADES_DE_SALA, MODOS_POR_MODALIDADE, type ModoSala } from '@sinuca/protocolo';
import { PRESETS_DE_FABRICA, ROTULO_MODALIDADE, rotuloDaFormacao, type Jogador, type Modalidade, type PresetRegras } from '@sinuca/regras';

/**
 * O catálogo de modos que a escolha do lobby mostra: que modalidades existem, que formatos cada uma aceita e como se
 * formam as equipes. Tudo vem dos dados do protocolo (`MODOS_POR_MODALIDADE`, `FORMATO_DO_MODO`) e das regras
 * (`ROTULO_MODALIDADE`, `rotuloDaFormacao`): modalidade nova é um preset e uma entrada no catálogo do protocolo, e a tela
 * a mostra sozinha. Puro, sem DOM.
 */
export interface Catalogo {
  /** Na ordem em que os cartões aparecem. */
  readonly modalidades: readonly Modalidade[];
  /** Os formatos da modalidade, na ordem em que os botões aparecem. */
  modosDa(modalidade: Modalidade): readonly ModoSala[];
  /** Tamanho de cada equipe do formato: `[2, 1]` é dois contra um, `[1, 1, 1]` é cada um por si. */
  formacaoDo(modo: ModoSala): readonly number[];
  /** O nome da modalidade na tela. */
  nomeDa(modalidade: Modalidade): string;
}

/** O catálogo de verdade, lido do protocolo e das regras. */
export const CATALOGO: Catalogo = {
  modalidades: MODALIDADES_DE_SALA,
  modosDa: (modalidade) => MODOS_POR_MODALIDADE[modalidade],
  formacaoDo: (modo) => FORMATO_DO_MODO[modo].formacao,
  nomeDa: (modalidade) => ROTULO_MODALIDADE[modalidade],
};

/**
 * Uma linha que explica a modalidade, por cima do que os dados dizem. Quem não está aqui ganha uma linha gerada dos
 * dados (`descricaoGerada`), então a tela não quebra com modalidade nova: escreva a frase aqui quando quiser uma melhor.
 */
export const DESCRICAO_DA_MODALIDADE: Readonly<Partial<Record<Modalidade, string>>> = {
  'par-ou-impar': 'Pares contra ímpares, a 8 por último.',
  'mata-mata': 'Cada um por si, 15 bolas, ganha quem matar mais. Cegar ou suicídio: perde a vez.',
};

/** Quantos jogam num formato. */
const jogadoresDe = (formacao: readonly number[]): number => formacao.reduce((total, tamanho) => total + tamanho, 0);

/** Cada equipe é uma pessoa só (cada um por si). */
const cadaUmPorSi = (formacao: readonly number[]): boolean => formacao.every((tamanho) => tamanho === 1);

const NUMEROS = ['', 'um', 'dois', 'três', 'quatro'] as const;
const porExtenso = (n: number): string => NUMEROS[n] || String(n);

/** A linha gerada dos dados quando a modalidade não tem frase escrita: "Cada um por si, de 2 a 4 jogadores.". */
export function descricaoGerada(catalogo: Catalogo, modalidade: Modalidade): string {
  const contagens = catalogo.modosDa(modalidade).map((modo) => jogadoresDe(catalogo.formacaoDo(modo)));
  const menor = Math.min(...contagens);
  const maior = Math.max(...contagens);
  const todosPorSi = catalogo.modosDa(modalidade).every((modo) => cadaUmPorSi(catalogo.formacaoDo(modo)));
  const quantos = menor === maior ? `${menor} jogadores` : `de ${menor} a ${maior} jogadores`;
  return todosPorSi ? `Cada um por si, ${quantos}.` : `Em equipes, ${quantos}.`;
}

/** Um formato (botão) da modalidade. */
export interface FormatoDoCatalogo {
  readonly modo: ModoSala;
  /** "1×1", "2×1", "2×2" ou, quando cada um joga por si, "2 jogadores". */
  readonly rotulo: string;
  /** Quem joga contra quem: "Dois contra um", "Cada um por si". */
  readonly detalhe: string;
  readonly jogadores: number;
  /** As regras sabem jogar este formato. */
  readonly disponivel: boolean;
}

/** Um cartão de modalidade. */
export interface ModalidadeDoCatalogo {
  readonly modalidade: Modalidade;
  readonly nome: string;
  readonly descricao: string;
  readonly formatos: readonly FormatoDoCatalogo[];
  /** Algum formato dela dá para jogar. */
  readonly disponivel: boolean;
}

/** "Dois contra um", "Dois contra dois", "Frente a frente" ou "Cada um por si". */
function detalheDoFormato(formacao: readonly number[]): string {
  const jogadores = jogadoresDe(formacao);
  if (cadaUmPorSi(formacao)) return jogadores === 2 ? 'Frente a frente' : 'Cada um por si';
  const [primeira = '', ...resto] = formacao.map(porExtenso);
  return [primeira.charAt(0).toUpperCase() + primeira.slice(1), ...resto].join(' contra ');
}

/**
 * Os cartões e os botões de formato, tirados do catálogo. Numa modalidade em que todos os formatos são de cada um por si
 * (o mata-mata), o botão diz quantos jogam ("2 jogadores"); nas de equipes, a formação ("2×1").
 * `disponivel(modalidade, modo)` diz o que as regras sabem jogar (padrão: tudo).
 */
export function montarCatalogo(
  catalogo: Catalogo = CATALOGO,
  disponivel: (modalidade: Modalidade, modo: ModoSala) => boolean = () => true,
  descricoes: Readonly<Partial<Record<Modalidade, string>>> = DESCRICAO_DA_MODALIDADE,
): readonly ModalidadeDoCatalogo[] {
  return catalogo.modalidades.map((modalidade): ModalidadeDoCatalogo => {
    const modos = catalogo.modosDa(modalidade);
    const porSi = modos.every((modo) => cadaUmPorSi(catalogo.formacaoDo(modo)));
    const formatos = modos.map((modo): FormatoDoCatalogo => {
      const formacao = catalogo.formacaoDo(modo);
      const jogadores = jogadoresDe(formacao);
      return {
        modo,
        rotulo: porSi ? `${jogadores} jogadores` : rotuloDaFormacao(formacao),
        detalhe: detalheDoFormato(formacao),
        jogadores,
        disponivel: disponivel(modalidade, modo),
      };
    });
    return {
      modalidade,
      nome: catalogo.nomeDa(modalidade),
      descricao: descricoes[modalidade] ?? descricaoGerada(catalogo, modalidade),
      formatos,
      disponivel: formatos.some((f) => f.disponivel),
    };
  });
}

/**
 * O modo que vale depois de trocar de modalidade, na mesma regra da sala (L16b): o atual se a nova o aceita; senão, o
 * da nova com o MESMO número de lugares (2×2 vira 4 jogadores, 2×1 vira 3); senão o primeiro disponível dela. Considera só
 * os formatos disponíveis, se `disponivel` for dado.
 */
export function modoAoTrocarDeModalidade(
  catalogo: Catalogo,
  modalidade: Modalidade,
  modoAtual: ModoSala,
  disponivel: (modalidade: Modalidade, modo: ModoSala) => boolean = () => true,
): ModoSala {
  const aceitos = catalogo.modosDa(modalidade).filter((modo) => disponivel(modalidade, modo));
  if (aceitos.includes(modoAtual)) return modoAtual;
  const lugares = jogadoresDe(catalogo.formacaoDo(modoAtual));
  return aceitos.find((modo) => jogadoresDe(catalogo.formacaoDo(modo)) === lugares) ?? aceitos[0] ?? catalogo.modosDa(modalidade)[0]!;
}

/** O preset de fábrica da modalidade (a casa que o cliente manda ao criar a sala e joga no mesmo PC). */
export function presetDaModalidade(modalidade: Modalidade, presets: readonly PresetRegras[] = PRESETS_DE_FABRICA): PresetRegras | null {
  return presets.find((p) => p.regras.modalidade === modalidade) ?? null;
}

/**
 * Quem joga contra quem no mesmo PC, em uma frase: "Jogador 1 contra Jogador 2.", "Jogador 1 e Jogador 3 contra o
 * Jogador 2." ou, cada um por si, "Jogador 1, Jogador 2 e Jogador 3: cada um por si.". Sai da roda dos jogadores, que
 * por sua vez vem do formato do protocolo.
 */
export function fraseDeQuemJoga(jogadores: readonly Jogador[]): string {
  const equipes = [...new Set(jogadores.map((j) => j.equipe))].sort((a, b) => a - b);
  const lados = equipes.map((equipe) => jogadores.filter((j) => j.equipe === equipe).map((j) => j.nome));
  const lista = (nomes: readonly string[]): string => (nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`);
  if (lados.every((nomes) => nomes.length === 1) && lados.length > 2) return `${lista(lados.map((nomes) => nomes[0]!))}: cada um por si.`;
  const comArtigo = lados.some((nomes) => nomes.length > 1);
  return `${lados.map((nomes, i) => (i > 0 && comArtigo && nomes.length === 1 ? `o ${nomes[0]}` : lista(nomes))).join(' contra ')}.`;
}

/**
 * O nome da sala na tela, do catálogo: "Sala 2×2 · Par ou ímpar", "Sala 4 jogadores · Mata-mata". Sem a modalidade no catálogo
 * (ou o formato fora dela), cai no modo como veio.
 */
export function tituloDoFormato(modalidade: Modalidade, modo: ModoSala, catalogo: Catalogo = CATALOGO): string {
  const cartao = montarCatalogo(catalogo).find((c) => c.modalidade === modalidade);
  const formato = cartao?.formatos.find((f) => f.modo === modo);
  return formato === undefined ? `Sala ${modo}` : `Sala ${formato.rotulo} · ${cartao!.nome}`;
}
