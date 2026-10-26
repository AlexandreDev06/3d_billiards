import { BOLA, BOLAO, MESA_BAR, type MedidasBola } from './medidas';
import { ID_BOLAO, type ConfigFisica, type IdBola } from './tipos';

export const CONFIG_FISICA_PADRAO: ConfigFisica = {
  mesa: MESA_BAR,
  bola: BOLA,
  bolao: BOLAO,
  gravidade: 9.81,
  atritoDeslizamento: 0.2,
  atritoRolamento: 0.02,
  desaceleracaoGiro: 20,
  restituicaoBolaBola: 0.95,
  atritoBolaBolaLento: 0.00995 + 0.108,
  atritoBolaBolaRapido: 0.00995,
  atritoBolaBolaQueda: 1.088,
  janelaChoqueSimultaneo: 1e-4,
  restituicaoBolaTabela: 0.85,
  atritoBolaTabela: 0.2,
  massaTaco: 0.5,
  restituicaoTacoBola: 0.75,
  velocidadeParada: 0.001,
  velocidadeMinimaChoque: 0.001,
  angularParada: 0.1,
  passo: 1 / 512,
  frequenciaGravacao: 60,
  duracaoMaxima: 60,
  velocidadeMaxTaco: 8,
  limiteEfeitoComGiz: 0.5,
  limiteEfeitoSemGiz: 0.3,
  efeitoMaximo: 0.95,
  fatorEfeitoLateral: 0.6,
  fatorSquirt: 0.08,
  faixaMiscue: 0.2,
  fatorMiscue: 0.3,
  desvioMiscue: 0.05,
  efeitoMiscue: 0.2,
};

/** Raio e massa da bola `id`: o bolão é maior e mais pesado que as numeradas. */
export function medidasDaBola(id: IdBola, config: ConfigFisica = CONFIG_FISICA_PADRAO): MedidasBola {
  return id === ID_BOLAO ? config.bolao : config.bola;
}
