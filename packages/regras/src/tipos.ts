/**
 * Contrato das regras do par ou ímpar: configuração da casa, estado da
 * partida e o que cada tacada causa. Opções e preset de fábrica: `presets.ts`.
 */
import type { IdBola } from '@sinuca/fisica';

export type Grupo = 'par' | 'impar';

/**
 * O jeito de jogar. `par-ou-impar`: o jogo de boteco, em duas equipes, com grupos
 * (pares e ímpares), bola final e pena. `mata-mata`: de 2 a 4 pessoas, cada uma por
 * si, as 15 bolas sem grupo nem bola final; vale a bola encaçapada, e a vez passa
 * sempre ao próximo da roda. Uma modalidade nova é um preset e uma entrada aqui
 * (e em `formacoesAceitas`).
 */
export type Modalidade = 'par-ou-impar' | 'mata-mata';

/**
 * Quantos jogadores tem cada equipe, na ordem das equipes (0, 1, 2...): `[2, 1]` é
 * o 2×1 (a equipe 0 com dois, a 1 sozinha), `[1, 1, 1]` são três cada um por si.
 */
export type Formacao = readonly number[];

/**
 * Lugar da mesa pelo nome; quem anima resolve as coordenadas (`lugares()` da
 * física: `marcaSaida`, `tabelaLadoSaida`, `marcaPe`; `centro-mesa` é a origem,
 * o centro do pano).
 */
export type LugarMesa = 'marca-saida' | 'tabela-lado-saida' | 'centro-mesa' | 'marca-pe';

/**
 * Regras da casa, escolhidas antes da partida. Cada chave é uma opção da tela
 * "Regras da casa". O "castigo" das chaves `castigo*` é a bola final
 * (`bolaFinal`): a 1 em `1-15`, a 8 em `2-14`.
 */
export interface ConfigRegras {
  /**
   * O jeito de jogar. No `mata-mata` valem só `bolas` (`1-15`), `bolaFinal`
   * (`ultima-do-grupo`: nenhuma), `bolaForaDaMesa`, `bolaDevolvidaLugar`,
   * `brancaAposSuicidio`, `suicidioNoMataMata` e `cegarNoMataMata`; o resto da config é do
   * `par-ou-impar` (`validarPreset` confere as duas primeiras).
   */
  readonly modalidade: Modalidade;
  /**
   * Bolas numeradas da partida: `1-15`, `2-15` (sem a 1) ou `2-14` (sem a 1 e a
   * 15, 13 bolas). Os grupos são pela paridade, sem a `bolaFinal`.
   */
  readonly bolas: '1-15' | '2-15' | '2-14';
  /**
   * A bola final (o castigo): só vale em tacada separada, depois do grupo, e
   * encaçapada antes da hora decide a partida (`castigoAntesDaHora`).
   * `ultima-do-grupo`: não há bola final, vence quem encaçapa a última do grupo.
   * Precisa estar em `bolas` e deixar os dois grupos do mesmo tamanho: a 1 em
   * `1-15`, nenhuma em `2-15`, a 8 em `2-14` (`validarPreset` confere). No
   * `mata-mata` não há grupos nem bola final: é `ultima-do-grupo`.
   */
  readonly bolaFinal: 1 | 8 | 'ultima-do-grupo';
  /**
   * Onde a bola final começa. `depois-da-saida`: fora do triângulo e da mesa na
   * saída, entrando depois dela em `castigoLugar` ("colado na tabela do lado da
   * saída após a quebra", estudo §1). `centro-triangulo`: no meio da 3ª fileira.
   */
  readonly castigoInicio: 'depois-da-saida' | 'centro-triangulo';
  /** Onde a bola final entra (se começa fora do triângulo) e para onde volta. */
  readonly castigoLugar: 'tabela-lado-saida' | 'marca-pe';
  /**
   * A bola final caindo na tacada de saída, quando começa no triângulo.
   * `volta`: volta para `castigoLugar`, sem falta, e o resto da tacada vale.
   * `antes-da-hora`: como em qualquer tacada antes da hora (`castigoAntesDaHora`).
   * `vence`: como se fosse a hora dela (vitória; com falta, `castigoEBrancaJuntos`
   * ou `castigoComFalta`).
   */
  readonly castigoNaSaida: 'volta' | 'antes-da-hora' | 'vence';
  /** O castigo só vale numa tacada separada, depois da última bola do grupo. */
  readonly castigoQuando: 'tacada-separada';
  /** Encaçapar o castigo antes da hora. */
  readonly castigoAntesDaHora: 'derrota';
  /** Branca tocar primeiro o castigo com a mesa aberta. */
  readonly castigoPrimeiroMesaAberta: 'falta' | 'livre';
  /**
   * Branca e castigo caindo na mesma tacada, na hora do castigo. `castigo-volta`:
   * o castigo volta ao lugar e vale o suicídio. Sem bola final vale para a
   * última bola do grupo, que volta para `castigoLugar`.
   */
  readonly castigoEBrancaJuntos: 'castigo-volta' | 'derrota';
  /**
   * O castigo cai na hora certa numa tacada com outra falta (direta, bolão fora
   * da mesa). Sem bola final vale para a última bola do grupo.
   */
  readonly castigoComFalta: 'castigo-volta';
  /** Como o grupo de cada um é definido. */
  readonly definicaoGrupo: 'primeira-encacapada';
  /** Bolas dos dois grupos caindo na saída: vale a primeira que caiu e o jogador perde a vez. */
  readonly saidaComDoisGrupos: 'vale-primeira-perde-vez';
  /** Qual bola a falta paga. */
  readonly penaBola: 'menor-do-adversario';
  /** Quantas bolas a direta paga. */
  readonly penaDireta: 1 | 2;
  /** `false`: duas faltas na mesma tacada pagam só a maior pena. */
  readonly penaDupla: boolean;
  /** `true`: em vez de tirar bola do adversário, devolve à mesa uma bola já encaçapada do faltoso. */
  readonly penaInvertida: boolean;
  /**
   * Qual bola a pena invertida devolve, entre as já encaçapadas do grupo do
   * faltoso (inclusive as desta tacada): a menor, a maior ou a última que caiu.
   */
  readonly penaInvertidaBola: 'menor' | 'maior' | 'ultima';
  /** Falta com a mesa aberta, quando ainda não há "bola do adversário". */
  readonly penaSemGrupo: 'so-perde-vez';
  /** Para onde vai a branca depois do suicídio (encostada na bola que estiver lá). */
  readonly brancaAposSuicidio: 'marca-saida';
  /**
   * Só no `mata-mata`: o que custa a branca sair do jogo (caçapa ou fora da mesa, os dois
   * casos em que ela volta à marca). `sem-pena`: nada, só a vez que passa como sempre.
   * `perde-proxima-vez`: quem cometeu perde a próxima vez dele, isto é, quando a roda
   * chegar nele ele é pulado uma vez (`EstadoPartida.perdemAProximaVez`); no 1×1 o outro
   * joga duas seguidas. No `par-ou-impar` a opção não existe (a falta já tem a pena das
   * bolas): `validarPreset` recusa `perde-proxima-vez` ali, em vez de aceitar uma escolha
   * que não faria nada.
   */
  readonly suicidioNoMataMata: 'sem-pena' | 'perde-proxima-vez';
  /**
   * Só no `mata-mata`: o que custa cegar (a branca não tocar bola nenhuma). Os mesmos
   * valores e a mesma pena do `suicidioNoMataMata`: quem cegou entra em
   * `EstadoPartida.perdemAProximaVez` e é pulado uma vez quando a roda chegar nele. Cegar e
   * tirar a branca do jogo na mesma tacada dão uma entrada só. Cada opção liga a sua falta
   * sozinha. No `par-ou-impar` a opção não existe (cegar já paga bola): `validarPreset`
   * recusa `perde-proxima-vez` ali.
   */
  readonly cegarNoMataMata: 'sem-pena' | 'perde-proxima-vez';
  /** Bola que entrou na caçapa e voltou para a mesa. */
  readonly bolaVoltouDaCacapa: 'nao-encacapada';
  /**
   * Onde volta a bola numerada que pulou para fora da mesa ou que a pena
   * invertida devolve. O estudo §1 também cita "perto de onde saiu".
   */
  readonly bolaDevolvidaLugar: 'centro-mesa';
  /** Bola numerada que pula para fora da mesa: `falta` paga como as outras (falta `bola-fora`). Ela volta em `bolaDevolvidaLugar` nos dois casos. */
  readonly bolaForaDaMesa: 'sem-falta' | 'falta';
  /**
   * Só sem bola final: o grupo que fica sem bolas pela pena ou pela mão do
   * adversário. `vence`: quem ficou sem bolas vence. `volta`: a última só sai
   * pela mão do dono; a pena não a tira e, encaçapada pelo adversário, ela volta
   * para `castigoLugar` e ele perde a vez.
   */
  readonly ultimaPorPenaOuAdversario: 'vence' | 'volta';
  /**
   * Quem sai na partida seguinte: a equipe perdedora, a que não saiu nesta ou a
   * vencedora. Na equipe de 2, sai o próximo dela na roda depois de quem saiu
   * nesta, e assim cada equipe alterna quem sai; na de 1, sai sempre o mesmo.
   * No `mata-mata` sai sempre o próximo da roda depois de quem saiu nesta.
   */
  readonly proximaSaida: 'perdedor' | 'alternado' | 'ranca-saia';
  /**
   * Ordem da vez com equipes. `alternada`: a vez alterna entre as equipes e cada
   * equipe reveza os seus jogadores na ordem em que aparecem em
   * `EstadoPartida.jogadores`: A1 → B1 → A2 → B2 nas duplas (proposta do estudo
   * §1; nenhuma fonte define), A1 → B1 → A2 → B1 no 2×1 (quem está sozinho joga
   * todas as vezes da equipe dele). A vez passa quando a equipe perde a mesa. No
   * 1×1 não muda nada. No `mata-mata` a vez anda um na roda a cada tacada.
   */
  readonly ordemDaVez: 'alternada';
  /**
   * Na equipe de 2, quem taca depois de encaçapar bola sua: o mesmo jogador ou o
   * parceiro. Com `parceiro`, o taco passa entre os dois enquanto encaçaparem e,
   * quando a equipe perde a mesa, a roda anda a partir de quem começou a vez
   * (`EstadoPartida.vezDaRoda`). Na equipe de 1 (e no 1×1) não muda nada.
   */
  readonly quemContinua: 'mesmo-jogador' | 'parceiro';
  /**
   * Só o treino (L39): uma pessoa sozinha na mesa, com as 15 bolas do `mata-mata` (por isso
   * `modalidade: 'mata-mata'`; `Modalidade` não ganhou valor para o catálogo da sala seguir igual). A vez nunca
   * passa; a falta é informada em `Consequencias.faltas` mas não custa nada; a branca que cai ou sai volta
   * à mão (`Consequencias.brancaNaMao`); a partida acaba quando a tacada encaçapa a última bola. Ausente = jogo normal.
   * É local: não está em `OPCOES_REGRAS` nem em `PRESETS_DE_FABRICA`, e `validarPreset` só o aceita com
   * `aceitaTreino` (a sala não o aceita). O treino exige as penas do mata-mata em `sem-pena`
   * (`incoerenciasDaConfig`).
   */
  readonly treino?: true;
}

/** Preset carregado de `presets/*.json`. */
export interface PresetRegras {
  readonly nome: string;
  /** Chaves com valor provisório, à espera de resposta em `sinuca-perguntas`. */
  readonly provisorio: readonly (keyof ConfigRegras)[];
  readonly regras: ConfigRegras;
}

export interface Jogador {
  readonly id: string;
  readonly nome: string;
  /**
   * Lado que joga junto (mesmo grupo, mesma vitória). No `par-ou-impar`: 0 ou 1, com 1
   * ou 2 jogadores cada. No `mata-mata`: de 0 a N−1, uma para cada jogador (na
   * primeira partida, na ordem de entrada; `jogadoresDaProxima` gira a roda sem
   * renumerar, para cada pessoa manter a sua).
   */
  readonly equipe: number;
}

/**
 * Do ponto de vista de quem tem a vez:
 * - `saida`: falta a tacada de saída;
 * - `aberta`: grupos ainda não definidos;
 * - `grupos`: cada equipe tem o seu;
 * - `castigo`: quem joga já tirou todo o grupo e está no castigo;
 * - `fim`: há vencedor.
 *
 * No `mata-mata` só há `saida`, `aberta` (depois da saída, até a mesa esvaziar) e `fim`.
 */
export type FasePartida = 'saida' | 'aberta' | 'grupos' | 'castigo' | 'fim';

export interface Encacapada {
  readonly bola: IdBola;
  /** Índice em `EstadoPartida.jogadores` de quem tacou. */
  readonly jogador: number;
}

/** Invariante: `naMesa` + `encacapadas` + `retiradas` = as bolas de `config.bolas`. */
export interface EstadoPartida {
  readonly config: ConfigRegras;
  /**
   * Na ordem da roda (`ConfigRegras.ordemDaVez`), alternando as equipes: 2 no
   * 1×1, 3 no 2×1 (A1, B1, A2; com a equipe de 1 saindo, B1, A1, A2), 4 nas
   * duplas (A1, B1, A2, B2). `jogadores[0]` deu a saída.
   */
  readonly jogadores: readonly Jogador[];
  /** Índice em `jogadores` de quem tem a vez. */
  readonly vez: number;
  /**
   * Índice em `jogadores` de quem a roda escolheu, quando quem taca é o parceiro
   * dele (`quemContinua: 'parceiro'`). Ausente: é `vez`.
   */
  readonly vezDaRoda?: number;
  /**
   * Índice em `jogadores` de quem começa a próxima vez da outra equipe, quando a
   * equipe da vez perder a mesa, se não for o primeiro dela depois de
   * `vezDaRoda ?? vez` na ordem de `jogadores`. Só aparece com equipes de
   * tamanhos diferentes (2×1), na vez de quem está sozinho, para a dupla
   * revezar; no 1×1 e nas duplas, nunca.
   */
  readonly proximoDaRoda?: number;
  /**
   * Só no `mata-mata` com `suicidioNoMataMata` ou `cegarNoMataMata` em
   * `'perde-proxima-vez'`: índices em `jogadores`, em ordem crescente e sem
   * repetição, de quem perde a próxima vez (cegou ou tirou a branca do jogo na
   * tacada anterior dele). Quando a roda for dar a vez a um
   * deles, ele sai da lista e é pulado. Ausente = ninguém: as regras só escrevem o
   * campo quando há alguém, então o par ou ímpar e toda partida sem suicídio têm a
   * forma de sempre. Partida encerrada nunca o leva; `novaPartida` começa sem ele.
   */
  readonly perdemAProximaVez?: readonly number[];
  /**
   * Grupo de cada equipe (índice = `Jogador.equipe`); `null` enquanto a mesa está
   * aberta. No `mata-mata` há uma entrada por equipe e todas são sempre `null`.
   */
  readonly grupos: readonly (Grupo | null)[];
  readonly fase: FasePartida;
  /** Bolas numeradas na mesa (o bolão nunca entra aqui). */
  readonly naMesa: readonly IdBola[];
  /** Em ordem de queda. */
  readonly encacapadas: readonly Encacapada[];
  /** Tiradas da mesa como pena, sem terem sido encaçapadas (no treino, também as que o jogador tirou com a mão: `sincronizarMesa`). */
  readonly retiradas: readonly IdBola[];
  /** Equipe vencedora. */
  readonly vencedor: number | null;
}

/**
 * - `suicidio`: a branca caiu;
 * - `cegar`: a branca não tocou bola nenhuma;
 * - `direta`: a branca tocou primeiro uma bola do adversário;
 * - `branca-fora`: a branca saiu da mesa;
 * - `castigo-fora-de-hora`: a branca tocou primeiro o castigo antes da hora;
 * - `bola-fora`: uma numerada saiu da mesa (só com `bolaForaDaMesa: 'falta'`).
 */
export type NomeFalta = 'suicidio' | 'cegar' | 'direta' | 'branca-fora' | 'castigo-fora-de-hora' | 'bola-fora';

export interface Falta {
  readonly nome: NomeFalta;
}

export interface Recolocacao {
  readonly bola: IdBola;
  readonly lugar: LugarMesa;
}

/** O que a tacada causou, para o cliente mostrar e animar. */
export interface Consequencias {
  /**
   * No `mata-mata` as faltas não tiram bola: só a branca volta à marca e, com
   * `suicidioNoMataMata` ou `cegarNoMataMata` em `'perde-proxima-vez'`, quem cegou ou tirou
   * a branca do jogo perde a próxima vez.
   */
  readonly faltas: readonly Falta[];
  /** Bolas tiradas da mesa como pena (sempre vazio no `mata-mata`). */
  readonly retirar: readonly IdBola[];
  /**
   * Bolas que voltam à mesa (castigo, a última do adversário sem bola final, bola
   * que pulou, pena invertida e, por último, a branca) e onde, na ordem em que
   * devem ser postas.
   */
  readonly recolocar: readonly Recolocacao[];
  /**
   * Índice em `jogadores` de quem joga a seguir (= `partida.vez` depois da
   * tacada), já com o pulo de quem perdia a vez (`EstadoPartida.perdemAProximaVez`).
   * Com a partida encerrada, quem dá a saída na próxima, conforme
   * `config.proximaSaida` (no `mata-mata`, o próximo da roda depois de quem
   * saiu nesta); `jogadoresDaProxima` põe essa pessoa em primeiro.
   */
  readonly proximo: number;
  /** Equipe vencedora, se a partida acabou nesta tacada. */
  readonly vencedor: number | null;
  /**
   * Só no treino, quando a branca caiu ou saiu da mesa: ela volta à mão, isto é, o jogador a põe onde quiser.
   * `recolocar` traz a branca no lugar de partida (`brancaAposSuicidio`), para quem não souber da mão. Ausente = não.
   */
  readonly brancaNaMao?: true;
  /** Frase curta para o HUD. */
  readonly texto: string;
}

export interface NovaPartida {
  readonly partida: EstadoPartida;
  /**
   * Bolas do triângulo na ordem das vagas de `mesaInicial` da física (fileira a
   * fileira; com 14 bolas o centro fica vazio, com 13 as pontas da base),
   * embaralhadas pelo rng. Quem joga monta a mesa com `mesaInicial`. Com
   * `castigoInicio: 'centro-triangulo'` a bola final fica no centro (índice 4).
   * Com `depois-da-saida` ela não está aqui: conta em `partida.naMesa` desde o
   * início, mas só entra na mesa depois da saída, pelo `recolocar` dela
   * (`ConfigRegras.castigoLugar`).
   */
  readonly arrumacao: readonly IdBola[];
}

export interface ResultadoRegras {
  readonly partida: EstadoPartida;
  readonly consequencias: Consequencias;
}
