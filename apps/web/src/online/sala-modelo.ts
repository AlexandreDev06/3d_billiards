import { FORMATO_DO_MODO, LUGARES_POR_MODO, SKIN_PADRAO, equipeDoLugar, type ForcaSala, type GizSala, type ModoSala, type MsgEstadoSala, type MsgTempoEsgotado, type SkinTaco } from '@sinuca/protocolo';
import type { Modalidade } from '@sinuca/regras';
import { placarParaMostrar, type Formacao, type PlacarParaMostrar } from '../hud/confronto-modelo';
import { tituloDoFormato } from '../lobby/catalogo';
import { TEMPO_PADRAO_DA_SALA, regrasDoEstado, type RegrasDaSala } from '../lobby/regras-da-sala';
import type { LinhaDaPartida } from '../previsao/regra-da-linha';
import { fisicaMexidaDoEstado, linhaDaFisicaNaEspera } from './fisica-da-sala-modelo';
import { resumoDoLugar } from './perfil-modelo';
import type { TempoDaTacadaS } from '../relogio/modelo';

export interface AssentoModelo {
  readonly lugar: number;
  /**
   * De 0 a 3 (`equipeDoLugar(modo, lugar)`): no par ou ímpar, lugares 0 e 2 são da equipe 0, 1 e 3 da equipe 1 (no 2x1 a
   * equipe 1 é só o lugar 1); no mata-mata cada lugar é a própria equipe.
   */
  readonly equipe: number;
  /** `null` = vago. */
  readonly nome: string | null;
  readonly conectado: boolean;
  readonly anfitriao: boolean;
  readonly meu: boolean;
  /** Vago e posso mudar para ele (só na espera, sem ser o anfitrião). */
  readonly podeSentar: boolean;
  /** Sou o anfitrião, é a espera e o lugar tem outra pessoa (conectada ou só segurando o lugar; o meu é o do anfitrião): dá para expulsá-la. */
  readonly podeExpulsar: boolean;
  /** O saldo da carteira de quem está no lugar, público na sala (pode ser negativo); `null` = sem carteira (ou vago). */
  readonly saldo: number | null;
  /** A skin do taco de quem está no lugar (o clássico se vago, sem carteira ou se a sala não disse). */
  readonly skin: SkinTaco;
  /**
   * L43: o resumo público das estatísticas de quem está no lugar, a linha curta de baixo do nome ("12 vitórias em 30 · 85 bolas");
   * `null` = vago, sem carteira ou sala que não o manda: o cartão fica sem a linha.
   */
  readonly resumo: string | null;
}

/** Uma equipe da sala de espera: os lugares dela, na ordem. */
export interface EquipeModelo {
  readonly equipe: number;
  /** "Equipe A" / "Equipe B". */
  readonly rotulo: string;
  readonly assentos: readonly AssentoModelo[];
}

export interface SalaModelo {
  readonly codigo: string;
  readonly modo: ModoSala;
  /** O jeito de jogar da sala (`par-ou-impar` se a sala não disse). */
  readonly modalidade: Modalidade;
  /** O nome da sala na tela, do catálogo: "Sala 2×2 · Par ou ímpar", "Sala 4 jogadores · Mata-mata". */
  readonly titulo: string;
  readonly assentos: readonly AssentoModelo[];
  /**
   * Os mesmos assentos por equipe, para os modos com equipe de mais de uma pessoa (2x1 e 2x2); vazio onde cada jogador é
   * uma equipe (1x1 e o mata-mata), onde o rótulo não diz nada.
   */
  readonly equipes: readonly EquipeModelo[];
  readonly espectadores: number;
  readonly souEspectador: boolean;
  readonly podeIniciar: boolean;
  /** Por que o anfitrião ainda não pode iniciar (ou o que os outros esperam). */
  readonly aviso: string;
  /** Tempo por tacada da sala (`null` = sem limite); `undefined` se a sala não disse. */
  readonly tempoS: TempoDaTacadaS | undefined;
  /** A linha de previsão da sala (desligada se ela não disse). */
  readonly linha: LinhaDaPartida;
  /** O giz da sala (o padrão se ela não disse). */
  readonly giz: GizSala;
  /** O controle de força da sala (o padrão se ela não disse). */
  readonly forca: ForcaSala;
  /** Tudo o que se escolhe no lobby, como a sala o tem agora (o tempo `TEMPO_PADRAO_DA_SALA` se ela não disse). */
  readonly regras: RegrasDaSala;
  /** O anfitrião pode mudar modalidade, formato, tempo, linha, giz e força: só na espera. Os outros veem as regras, sem mexer. */
  readonly podeConfigurar: boolean;
  /**
   * A linha da física nas regras da espera (L42): "Física: padrão", ou "Física mexida: missões e estatísticas não contam" em
   * destaque. `souAnfitriao` diz se o F1 abre para mexer (o painel dele) ou só para ler.
   */
  readonly fisica: { readonly texto: string; readonly destaque: boolean; readonly mexida: boolean; readonly souAnfitriao: boolean };
  /**
   * O placar da sala: o confronto de quem está sentado (se a formação mudou, já o 0 × 0 novo, e o anterior no histórico) e os
   * anteriores. Com lugar vago a formação não se conhece e vale o confronto como a sala o mandou.
   */
  readonly placar: PlacarParaMostrar;
}

export const quantosLugares = (modo: ModoSala): number => LUGARES_POR_MODO[modo];

/** O nome da sala na tela: "Sala 1 x 1", "Sala 2 x 1", "Sala 2 x 2", "Sala 1 x 1 x 1". */
export const tituloDaSala = (modo: ModoSala): string => `Sala ${modo.replaceAll('x', ' x ')}`;

/** Quem está sentado em cada equipe, pelos apelidos (uma lista por equipe, a 0 primeiro); `null` se algum lugar está vago (quem voltar continua o confronto). */
export function formacaoSentada(assentos: readonly AssentoModelo[]): Formacao | null {
  if (assentos.some((a) => a.nome === null)) return null;
  const equipes = Math.max(...assentos.map((a) => a.equipe)) + 1;
  return Array.from({ length: equipes }, (_, equipe) => assentos.filter((a) => a.equipe === equipe).map((a) => a.nome!));
}

const rotuloDaEquipe = (equipe: number): string => `Equipe ${String.fromCharCode(65 + equipe)}`;

/** Agrupa os assentos por equipe (a 0 primeiro). Só onde há equipe de mais de uma pessoa (2x1, 2x2): nos demais cada jogador é uma equipe. */
function porEquipe(modo: ModoSala, assentos: readonly AssentoModelo[]): readonly EquipeModelo[] {
  const { formacao } = FORMATO_DO_MODO[modo];
  if (formacao.every((tamanho) => tamanho === 1)) return [];
  return formacao.map((_, equipe) => ({ equipe, rotulo: rotuloDaEquipe(equipe), assentos: assentos.filter((a) => a.equipe === equipe) }));
}

/** A sala de espera tirada do `estado-sala` (puro, sem DOM). */
export function modeloDaSala(estado: MsgEstadoSala, meuLugar: number | null, souAnfitriao: boolean): SalaModelo {
  const lugares = estado.lugares.slice(0, quantosLugares(estado.modo));
  const assentos = lugares.map(
    (l): AssentoModelo => ({
      lugar: l.lugar,
      equipe: equipeDoLugar(estado.modo, l.lugar),
      nome: l.nome,
      conectado: l.conectado,
      anfitriao: l.anfitriao,
      meu: l.lugar === meuLugar,
      podeSentar: estado.fase === 'espera' && !souAnfitriao && l.nome === null && l.lugar !== meuLugar,
      podeExpulsar: estado.fase === 'espera' && souAnfitriao && l.nome !== null && !l.anfitriao,
      saldo: l.nome === null ? null : (l.saldo ?? null),
      skin: l.skin ?? SKIN_PADRAO,
      resumo: l.nome === null ? null : resumoDoLugar(l.estatisticas),
    }),
  );
  const vagos = assentos.filter((a) => a.nome === null).length;
  const ausentes = assentos.filter((a) => a.nome !== null && !a.conectado).length;
  const podeIniciar = souAnfitriao && estado.fase === 'espera' && vagos === 0 && ausentes === 0;
  let aviso: string;
  if (vagos > 0) aviso = vagos === 1 ? 'Falta 1 jogador' : `Faltam ${vagos} jogadores`;
  else if (ausentes > 0) aviso = 'Alguém saiu da sala: espere voltar ou liberar o lugar';
  else aviso = souAnfitriao ? 'Todos aqui: pode começar' : 'Esperando o anfitrião começar';
  const regras = regrasDoEstado(estado, TEMPO_PADRAO_DA_SALA);
  return {
    codigo: estado.codigo,
    modo: estado.modo,
    modalidade: regras.modalidade,
    titulo: tituloDoFormato(regras.modalidade, estado.modo),
    assentos,
    equipes: porEquipe(estado.modo, assentos),
    espectadores: estado.espectadores,
    souEspectador: meuLugar === null,
    podeIniciar,
    aviso,
    tempoS: estado.relogio?.tempoS,
    linha: regras.linha,
    giz: regras.giz,
    forca: regras.forca,
    regras,
    podeConfigurar: souAnfitriao && estado.fase === 'espera',
    fisica: { ...linhaDaFisicaNaEspera(fisicaMexidaDoEstado(estado)), mexida: fisicaMexidaDoEstado(estado), souAnfitriao },
    placar: placarParaMostrar(estado.placar, formacaoSentada(assentos), regras.modalidade),
  };
}

export interface JogadorOnline {
  readonly lugar: number;
  readonly nome: string;
  readonly conectado: boolean;
  readonly voce: boolean;
}

/** Quem está online e quem caiu, só dos lugares ocupados do modo. */
export function jogadoresOnline(estado: MsgEstadoSala, meuLugar: number | null): readonly JogadorOnline[] {
  return estado.lugares
    .slice(0, quantosLugares(estado.modo))
    .filter((l) => l.nome !== null)
    .map((l) => ({ lugar: l.lugar, nome: l.nome!, conectado: l.conectado, voce: l.lugar === meuLugar }));
}

export interface FaixaDeVez {
  readonly texto: string;
  /**
   * `minha`: a vez é minha; `aguardando`: dei a tacada e a sala ainda vai confirmar; `outro`: de outro jogador
   * conectado; `ausente`: do jogador que caiu; `nenhuma`: fora da partida.
   */
  readonly tipo: 'minha' | 'aguardando' | 'outro' | 'ausente' | 'nenhuma';
}

/** O aviso de quem joga agora, com o nome, para o topo da tela. */
export function faixaDeVez(estado: MsgEstadoSala | null, meuLugar: number | null, aguardandoSala: boolean): FaixaDeVez {
  if (!estado || estado.fase !== 'jogando' || estado.vez === null) return { texto: '', tipo: 'nenhuma' };
  if (aguardandoSala) return { texto: 'Confirmando a tacada com a sala…', tipo: 'aguardando' };
  const dono = estado.lugares[estado.vez];
  if (estado.vez === meuLugar) return { texto: 'Sua vez', tipo: 'minha' };
  const nome = dono?.nome ?? `Jogador ${estado.vez + 1}`;
  if (dono && dono.nome !== null && !dono.conectado) return { texto: `${nome} caiu: se não voltar, perde a vez`, tipo: 'ausente' };
  return { texto: `Vez de ${nome}`, tipo: 'outro' };
}

/** O que mudou entre dois `estado-sala` em termos de gente: entrou, saiu, voltou, caiu (para o chat avisar). */
export function avisosDePresenca(anterior: MsgEstadoSala | null, novo: MsgEstadoSala): readonly string[] {
  if (!anterior) return [];
  const avisos: string[] = [];
  for (const atual of novo.lugares.slice(0, quantosLugares(novo.modo))) {
    const antes = anterior.lugares[atual.lugar];
    if (!antes) continue;
    if (atual.nome !== null && antes.nome === null) avisos.push(`${atual.nome} entrou na sala`);
    else if (atual.nome === null && antes.nome !== null) avisos.push(`${antes.nome} saiu da sala`);
    else if (atual.nome !== null && antes.nome === atual.nome && antes.conectado !== atual.conectado) {
      avisos.push(atual.conectado ? `${atual.nome} voltou` : `${atual.nome} caiu`);
    }
  }
  return avisos;
}

/** O recado de que a vez passou porque o tempo acabou (ou o dono da vez sumiu), com o nome de quem a perdeu. */
export function avisoDeTempoEsgotado(aviso: MsgTempoEsgotado, estado: MsgEstadoSala | null, meuLugar: number | null): string {
  const caiu = aviso.motivo === 'ausencia';
  if (aviso.lugar === meuLugar) return caiu ? 'Você caiu e perdeu a vez' : 'Seu tempo acabou: você perdeu a vez';
  const nome = estado?.lugares[aviso.lugar]?.nome ?? `Jogador ${aviso.lugar + 1}`;
  return caiu ? `${nome} caiu e perdeu a vez` : `${nome} perdeu a vez`;
}
