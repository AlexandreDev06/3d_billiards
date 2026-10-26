import {
  APOSTAS_DA_SALA,
  APOSTA_PADRAO,
  FAIXAS_DO_GIZ_DA_SALA,
  FORCAS_DA_SALA,
  FORCA_DA_SALA_PADRAO,
  GIZ_DA_SALA_PADRAO,
  MODALIDADE_PADRAO,
  type ApostaSala,
  type ForcaSala,
  type GizSala,
  type ModoSala,
  type MsgEstadoSala,
} from '@sinuca/protocolo';
import type { Modalidade } from '@sinuca/regras';
import { apagarJson, gravarJson, lerJson, type ArmazenamentoMinimo } from '../armazenamento';
import { LINHA_DESLIGADA, linhaDaSala, linhaDe, type LinhaDaPartida } from '../previsao/regra-da-linha';
import { TEMPOS_DO_SELETOR, rotuloDoTempo, type TempoDaTacadaS } from '../relogio/modelo';
import { textoDeMoedas } from '../online/moedas';
import { CATALOGO, modoAoTrocarDeModalidade, type Catalogo } from './catalogo';

/**
 * Tudo o que se escolhe no lobby antes da partida (e que a sala guarda e manda a todos): a modalidade e o formato, o tempo
 * por tacada, a linha de previsão, o giz, o controle de força e a aposta. É o mesmo conjunto em criar sala, na espera
 * (`configurar-sala`) e em "Jogar no mesmo PC" (onde a aposta existe no dado mas não aparece nem vale: não há carteira).
 */
export interface RegrasDaSala {
  readonly modalidade: Modalidade;
  readonly modo: ModoSala;
  readonly tempoS: TempoDaTacadaS;
  readonly linha: LinhaDaPartida;
  readonly giz: GizSala;
  readonly forca: ForcaSala;
  /** Quanto cada jogador com carteira põe na partida (L24); só online. */
  readonly aposta: ApostaSala;
}

/** O que muda numa escolha só (cada controle do lobby). */
export type MudancaDeRegras = Partial<RegrasDaSala>;

/** O tempo por tacada que a sala dá quando o anfitrião não escolhe (o mesmo da sala). */
export const TEMPO_PADRAO_DA_SALA: TempoDaTacadaS = 30;

/** O lobby de quem nunca escolheu nada: par ou ímpar 1×1, o tempo e a linha dados, giz, força e aposta de fábrica. */
export function regrasPadrao(tempoS: TempoDaTacadaS, linha: LinhaDaPartida = LINHA_DESLIGADA): RegrasDaSala {
  return { modalidade: MODALIDADE_PADRAO, modo: '1x1', tempoS, linha, giz: GIZ_DA_SALA_PADRAO, forca: FORCA_DA_SALA_PADRAO, aposta: APOSTA_PADRAO };
}

/** As faixas e os passos dos controles do giz (as faixas são as que a sala aceita). */
export const CONTROLES_DO_GIZ = {
  desgaste: { ...FAIXAS_DO_GIZ_DA_SALA.desgaste, passo: 0.05 },
  passada: { ...FAIXAS_DO_GIZ_DA_SALA.passada, passo: 0.05 },
  passadaS: { ...FAIXAS_DO_GIZ_DA_SALA.passadaS, passo: 0.5 },
} as const;

/** Tira a poeira de ponto flutuante de 0,1 + 0,05 e afins: múltiplos de 0,005 bastam para todos os passos. */
const arredondar = (valor: number): number => Math.round(valor * 1000) / 1000;

const dentro = (valor: number, min: number, max: number): number => Math.min(Math.max(valor, min), max);

/** Completa o giz com o que faltar, põe cada número na sua faixa e garante `desgasteMin` ≤ `desgasteMax` (trocando os dois, se preciso). */
export function sanearGiz(bruto: Partial<Record<keyof GizSala, unknown>> | null | undefined): GizSala {
  const f = FAIXAS_DO_GIZ_DA_SALA;
  const numero = (valor: unknown, padrao: number, min: number, max: number): number =>
    typeof valor === 'number' && Number.isFinite(valor) ? arredondar(dentro(valor, min, max)) : padrao;
  const a = numero(bruto?.desgasteMin, GIZ_DA_SALA_PADRAO.desgasteMin, f.desgaste.min, f.desgaste.max);
  const b = numero(bruto?.desgasteMax, GIZ_DA_SALA_PADRAO.desgasteMax, f.desgaste.min, f.desgaste.max);
  return {
    desgasteMin: Math.min(a, b),
    desgasteMax: Math.max(a, b),
    passada: numero(bruto?.passada, GIZ_DA_SALA_PADRAO.passada, f.passada.min, f.passada.max),
    passadaS: numero(bruto?.passadaS, GIZ_DA_SALA_PADRAO.passadaS, f.passadaS.min, f.passadaS.max),
  };
}

type CampoDoGiz = keyof GizSala;

/**
 * Um passo num dos quatro números do giz (`direcao` +1 ou −1), dentro das faixas. Os dois do gasto não se cruzam: subir
 * o mínimo além do máximo leva o máximo junto, e descer o máximo abaixo do mínimo leva o mínimo.
 */
export function passoDoGiz(giz: GizSala, campo: CampoDoGiz, direcao: 1 | -1): GizSala {
  const c = CONTROLES_DO_GIZ;
  const faixa = campo === 'passadaS' ? c.passadaS : campo === 'passada' ? c.passada : c.desgaste;
  const novo = arredondar(dentro(giz[campo] + direcao * faixa.passo, faixa.min, faixa.max));
  const seguinte = { ...giz, [campo]: novo };
  if (campo === 'desgasteMin' && novo > giz.desgasteMax) return { ...seguinte, desgasteMax: novo };
  if (campo === 'desgasteMax' && novo < giz.desgasteMin) return { ...seguinte, desgasteMin: novo };
  return seguinte;
}

/** "10%" / "7,5%": a fração do giz inteiro como porcentagem. */
export const porcento = (fracao: number): string => `${String(arredondar(fracao * 100)).replace('.', ',')}%`;

/** "3 s" / "1,5 s". */
export const segundos = (s: number): string => `${String(s).replace('.', ',')} s`;

export const ROTULO_FORCA: Readonly<Record<ForcaSala, string>> = {
  linha: 'Linha (puxar e soltar)',
  empurrar: 'Empurrar',
};

/** Os controles de força na ordem da tela: o padrão primeiro, os outros na ordem do protocolo. */
export const FORCAS_NA_TELA: readonly ForcaSala[] = [FORCA_DA_SALA_PADRAO, ...FORCAS_DA_SALA.filter((f) => f !== FORCA_DA_SALA_PADRAO)];

/** Uma frase do giz para o resumo de quem não é anfitrião: "giz gasta 10 a 30%, passada de 10% em 3 s". */
export function resumoDoGiz(giz: GizSala): string {
  const gasto = giz.desgasteMin === giz.desgasteMax ? porcento(giz.desgasteMin) : `${porcento(giz.desgasteMin).replace('%', '')} a ${porcento(giz.desgasteMax)}`;
  return `giz gasta ${gasto}, passada de ${porcento(giz.passada)} em ${segundos(giz.passadaS)}`;
}

/** "Valendo 20 moedas": a frase da aposta, na espera de quem não a escolhe. */
export const textoDaAposta = (aposta: ApostaSala): string => `Valendo ${textoDeMoedas(aposta)}`;

/** O que a sala mostra a quem não pode mudar as regras, em frases curtas. */
export function resumoDasRegras(regras: Pick<RegrasDaSala, 'tempoS' | 'linha' | 'giz' | 'forca' | 'aposta'>): readonly string[] {
  const linha = regras.linha.previsao ? (regras.linha.bolaAtingida ? 'linha de previsão com a bola atingida' : 'linha de previsão ligada') : 'sem linha de previsão';
  return [textoDaAposta(regras.aposta), `${rotuloDoTempo(regras.tempoS)} por tacada`, linha, resumoDoGiz(regras.giz), `força: ${ROTULO_FORCA[regras.forca].toLowerCase()}`];
}

/**
 * As regras que a sala mandou no `estado-sala` (`modalidade`, `giz` e `forca` ausentes só em montagens de teste: valem os
 * padrões). `tempoSeAusente` vale quando a sala não mandou o relógio.
 */
export function regrasDoEstado(estado: MsgEstadoSala, tempoSeAusente: TempoDaTacadaS): RegrasDaSala {
  return {
    modalidade: estado.modalidade ?? MODALIDADE_PADRAO,
    modo: estado.modo,
    tempoS: estado.relogio === undefined ? tempoSeAusente : estado.relogio.tempoS,
    linha: linhaDaSala(estado.linha),
    giz: sanearGiz(estado.giz),
    forca: estado.forca ?? FORCA_DA_SALA_PADRAO,
    aposta: estado.aposta ?? APOSTA_PADRAO,
  };
}

// ---------------------------------------------------------------- o que o navegador lembra

/** Mudou o formato guardado: a versão sobe e o que estava lá é descartado. */
const VERSAO_DO_LOBBY = 1;

/** De onde vem a escolha lembrada: criar sala e mesmo PC lembram cada um a sua. */
export type OndeSeLembra = 'sala' | 'local';

const chaveDoLobby = (onde: OndeSeLembra): string => `sinuca.lobby.${onde}`;

const ehTempo = (valor: unknown): valor is TempoDaTacadaS => TEMPOS_DO_SELETOR.some((t) => t === valor);

/**
 * Lê o que se escolheu da última vez (ou `padrao`) e confere cada campo: o que não bate com o catálogo atual, o que está
 * fora das faixas e o que o formato antigo não tinha volta ao padrão, sem derrubar o resto. O formato precisa servir à
 * modalidade; se não serve, vale o da regra de troca.
 */
export function lerRegrasLembradas(
  onde: OndeSeLembra,
  padrao: RegrasDaSala,
  armazenamento: ArmazenamentoMinimo | null,
  catalogo: Catalogo = CATALOGO,
  disponivel: (modalidade: Modalidade, modo: ModoSala) => boolean = () => true,
): RegrasDaSala {
  const lido = lerJson(chaveDoLobby(onde), armazenamento);
  if (typeof lido !== 'object' || lido === null) return padrao;
  const v = lido as Record<string, unknown>;
  if (v.versao !== VERSAO_DO_LOBBY) return padrao;
  const modalidade = catalogo.modalidades.find((m) => m === v.modalidade) ?? padrao.modalidade;
  const modoLembrado = catalogo.modosDa(modalidade).find((m) => m === v.modo) ?? padrao.modo;
  const linha = typeof v.linha === 'object' && v.linha !== null ? (v.linha as Record<string, unknown>) : {};
  return {
    modalidade,
    modo: modoAoTrocarDeModalidade(catalogo, modalidade, modoLembrado, disponivel),
    tempoS: ehTempo(v.tempoS) ? v.tempoS : padrao.tempoS,
    linha: typeof linha.previsao === 'boolean' ? linhaDe(linha.previsao, linha.bolaAtingida === true) : padrao.linha,
    giz: sanearGiz(typeof v.giz === 'object' ? (v.giz as Record<string, unknown> | null) : null),
    forca: FORCAS_DA_SALA.find((f) => f === v.forca) ?? padrao.forca,
    aposta: APOSTAS_DA_SALA.find((a) => a === v.aposta) ?? padrao.aposta,
  };
}

/** Guarda a escolha para a próxima vez. Falha em silêncio (armazenamento bloqueado). */
export function lembrarRegras(onde: OndeSeLembra, regras: RegrasDaSala, armazenamento: ArmazenamentoMinimo | null): void {
  gravarJson(
    chaveDoLobby(onde),
    {
      versao: VERSAO_DO_LOBBY,
      modalidade: regras.modalidade,
      modo: regras.modo,
      tempoS: regras.tempoS,
      linha: { previsao: regras.linha.previsao, bolaAtingida: regras.linha.bolaAtingida },
      giz: regras.giz,
      forca: regras.forca,
      aposta: regras.aposta,
    },
    armazenamento,
  );
}

/** Esquece o que foi lembrado. */
export function esquecerRegras(onde: OndeSeLembra, armazenamento: ArmazenamentoMinimo | null): void {
  apagarJson(chaveDoLobby(onde), armazenamento);
}

/** O que a mudança faz às regras de agora, com a regra de troca de modalidade (o formato acompanha o número de lugares). */
export function aplicarMudanca(
  regras: RegrasDaSala,
  mudanca: MudancaDeRegras,
  catalogo: Catalogo = CATALOGO,
  disponivel: (modalidade: Modalidade, modo: ModoSala) => boolean = () => true,
): RegrasDaSala {
  const juntas: RegrasDaSala = { ...regras, ...mudanca };
  const modo = mudanca.modo !== undefined ? mudanca.modo : modoAoTrocarDeModalidade(catalogo, juntas.modalidade, regras.modo, disponivel);
  return { ...juntas, modo, giz: sanearGiz(juntas.giz) };
}
