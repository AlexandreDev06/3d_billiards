/**
 * Contrato da física: o que entra numa tacada e o que sai dela.
 *
 * Unidades SI (m, s, kg, rad). Coordenadas como em `medidas.ts`: origem no
 * centro do pano, Y para cima, X ao longo do comprimento, Z ao longo da largura.
 */
import type { MedidasBola, MedidasMesa } from './medidas';

export interface Vetor3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Rotação do referencial da bola para o da mesa (como `Object3D.quaternion` do three.js). */
export interface Quaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** 0 é o bolão; 1 a 15, as bolas numeradas. */
export type IdBola = number;

export const ID_BOLAO: IdBola = 0;

/**
 * - `parada`: sem velocidade nem giro.
 * - `girando`: no lugar, só com giro em torno de Y.
 * - `deslizando`: o ponto de contato com o pano escorrega.
 * - `rolando`: rola sem escorregar.
 */
export type MovimentoBola = 'parada' | 'girando' | 'deslizando' | 'rolando';

export interface EstadoBola {
  readonly id: IdBola;
  /** Centro da bola; apoiada no pano, `y` = raio. */
  readonly posicao: Vetor3;
  /** Velocidade do centro (m/s). */
  readonly velocidade: Vetor3;
  /** Velocidade angular (rad/s) no referencial da mesa. */
  readonly angular: Vetor3;
  /** Guardada entre tacadas para o número da bola não pular de uma gravação para a outra. */
  readonly orientacao: Quaternion;
  readonly movimento: MovimentoBola;
  /** `false` depois que a bola cai numa caçapa ou sai da mesa. */
  readonly naMesa: boolean;
}

export interface EstadoMesa {
  readonly bolas: readonly EstadoBola[];
}

/** Onde o taco bate no bolão, em fração do raio; cada eixo em [-1, 1]. */
export interface EfeitoTacada {
  /** + = direita, visto de trás do taco: direção `(−sen angulo, 0, cos angulo)`. */
  readonly lateral: number;
  /** + = acima do centro (siga); − = abaixo (puxe). */
  readonly vertical: number;
}

export interface ParametrosTacada {
  /** Direção da tacada no plano XZ (rad): `(cos angulo, 0, sen angulo)`; 0 = +X, π/2 = +Z. */
  readonly angulo: number;
  /** Velocidade do taco no impacto (m/s), até `ConfigFisica.velocidadeMaxTaco`. */
  readonly velocidadeTaco: number;
  readonly efeito: EfeitoTacada;
  /** Inclinação do taco acima da horizontal (rad); 0 = paralelo ao pano. */
  readonly elevacao: number;
  /** Giz na ponta do taco: 1 = recém-passado, 0 = sem giz. */
  readonly giz: number;
}

/** O taco bateu no bolão. `velocidade` = do taco no impacto (m/s). */
export interface EventoTacoBola {
  readonly tipo: 'taco-bola';
  readonly t: number;
  readonly bola: IdBola;
  readonly velocidade: number;
  readonly miscue: boolean;
}

/** Duas bolas se tocaram. `velocidade` = componente normal da velocidade relativa no impacto (m/s). */
export interface EventoBolaBola {
  readonly tipo: 'bola-bola';
  readonly t: number;
  readonly a: IdBola;
  readonly b: IdBola;
  readonly velocidade: number;
}

/** Onde a bola bateu na tabela: `nariz` é o trecho reto de `tabelas(mesa)`; `boca` é a face que entra na caçapa ou o arredondado da ponta. */
export type ParteDaTabela = 'nariz' | 'boca';

/** Bola bateu numa tabela. `tabela` = índice em `tabelas(mesa)`; `parte` = nariz ou boca da caçapa; `velocidade` = componente normal (m/s). */
export interface EventoBolaTabela {
  readonly tipo: 'bola-tabela';
  readonly t: number;
  readonly bola: IdBola;
  readonly tabela: number;
  readonly parte: ParteDaTabela;
  readonly velocidade: number;
}

/** Bola caiu na caçapa `cacapa` (= `Cacapa.id`). */
export interface EventoCacapa {
  readonly tipo: 'cacapa';
  readonly t: number;
  readonly bola: IdBola;
  readonly cacapa: string;
}

export interface EventoForaDaMesa {
  readonly tipo: 'fora-da-mesa';
  readonly t: number;
  readonly bola: IdBola;
}

/** Todas as bolas pararam: sempre o último evento, e só um. */
export interface EventoParou {
  readonly tipo: 'parou';
  readonly t: number;
}

/** Acontecimento de uma tacada; `t` em segundos desde o impacto do taco. Listas vêm em ordem de `t`. */
export type EventoTacada =
  | EventoTacoBola
  | EventoBolaBola
  | EventoBolaTabela
  | EventoCacapa
  | EventoForaDaMesa
  | EventoParou;

/**
 * A tacada amostrada para animar (e, na Fase 2, transmitir).
 *
 * O quadro `q` mostra o instante `q / frequencia`; o último já mostra tudo
 * parado. A bola `ids[i]` no quadro `q` ocupa:
 * - `posicoes[(q * ids.length + i) * 3 + 0..2]`: centro (x, y, z);
 * - `orientacoes[(q * ids.length + i) * 4 + 0..3]`: quaternion (x, y, z, w);
 * - `naMesa[q * ids.length + i]`: 1 na mesa; 0 a partir do quadro em que caiu ou saiu.
 */
export interface Gravacao {
  /** Quadros por segundo. */
  readonly frequencia: number;
  readonly ids: readonly IdBola[];
  /** `Math.ceil(duracao * frequencia) + 1`. */
  readonly quadros: number;
  /** Instante do evento `parou` (s). */
  readonly duracao: number;
  readonly posicoes: Float32Array;
  readonly orientacoes: Float32Array;
  readonly naMesa: Uint8Array;
  readonly eventos: readonly EventoTacada[];
}

export interface ResultadoTacada {
  readonly eventos: readonly EventoTacada[];
  readonly gravacao: Gravacao;
  readonly estadoFinal: EstadoMesa;
}

/** Gerador semeado: a única fonte de aleatoriedade dos pacotes (miscue, arrumação do triângulo). */
export interface Rng {
  /** Próximo número em [0, 1). */
  proximo(): number;
}

/** Parâmetros do motor. Valores iniciais e faixas: skill `sinuca-fisica`; o painel dev do L3 lê daqui. */
export interface ConfigFisica {
  readonly mesa: MedidasMesa;
  readonly bola: MedidasBola;
  readonly bolao: MedidasBola;
  /** m/s². */
  readonly gravidade: number;
  /** μ de deslizamento bola-pano. */
  readonly atritoDeslizamento: number;
  /** μ de rolamento bola-pano. */
  readonly atritoRolamento: number;
  /** Desaceleração do giro em torno de Y (rad/s²). */
  readonly desaceleracaoGiro: number;
  readonly restituicaoBolaBola: number;
  /**
   * μ bola-bola (throw) cai com a velocidade de escorregamento `v` no contato (Alciatore):
   * `μ(v) = rapido + (lento − rapido) · e^(−queda · v)`.
   */
  readonly atritoBolaBolaLento: number;
  readonly atritoBolaBolaRapido: number;
  /** s/m. */
  readonly atritoBolaBolaQueda: number;
  /**
   * Choques bola-bola que começam até esta janela (s) depois de um choque, com
   * uma bola em comum, são resolvidos juntos (Poisson): a bola que toca duas ao
   * mesmo tempo divide o impulso entre elas. Da ordem da duração do choque; 0 =
   * tudo em série.
   */
  readonly janelaChoqueSimultaneo: number;
  /** Restituição do modelo de tabela de Han 2005 (na direção do contato acima do centro). */
  readonly restituicaoBolaTabela: number;
  /** μ bola-tabela. */
  readonly atritoBolaTabela: number;
  /** kg. */
  readonly massaTaco: number;
  readonly restituicaoTacoBola: number;
  /** Abaixo disto (m/s) a translação para. */
  readonly velocidadeParada: number;
  /**
   * Choque bola-bola ou bola-tabela com velocidade normal abaixo disto (m/s) é
   * contato de repouso: o impulso é resolvido, mas não vira evento (nem som,
   * nem toque para as regras).
   */
  readonly velocidadeMinimaChoque: number;
  /** Abaixo disto (rad/s) o giro para. */
  readonly angularParada: number;
  /** Passo fixo de integração (s), sem relação com o quadro de tela. */
  readonly passo: number;
  /** Quadros por segundo da `Gravacao`. */
  readonly frequenciaGravacao: number;
  /** Corte de segurança: a simulação para aqui mesmo com bola andando (s). */
  readonly duracaoMaxima: number;
  /** m/s. */
  readonly velocidadeMaxTaco: number;
  /** Maior |efeito| (fração do raio) sem miscue, com giz fresco. */
  readonly limiteEfeitoComGiz: number;
  /** Maior |efeito| (fração do raio) sem miscue, sem giz. */
  readonly limiteEfeitoSemGiz: number;
  /** Maior |efeito| (fração do raio) que o taco alcança: além disso o ponto de contato é puxado para dentro. */
  readonly efeitoMaximo: number;
  /**
   * Fração do `efeito.lateral` do mini-bolão que chega ao ponto de contato (giro em Y e squirt).
   * O vertical chega inteiro, e o miscue segue o mini-bolão (o limite seguro que o jogador vê).
   */
  readonly fatorEfeitoLateral: number;
  /** Desvio do bolão (rad) por unidade de deslocamento lateral no contato (`efeito.lateral × fatorEfeitoLateral`), para o lado oposto ao efeito. */
  readonly fatorSquirt: number;
  /** Quanto além do limite seguro (fração do raio) a chance de miscue vai de 0 a 1. */
  readonly faixaMiscue: number;
  /** No miscue, fração da velocidade que a bola recebe. */
  readonly fatorMiscue: number;
  /** No miscue, maior desvio aleatório da direção (rad). */
  readonly desvioMiscue: number;
  /** No miscue, fração do efeito que sobra. */
  readonly efeitoMiscue: number;
}
