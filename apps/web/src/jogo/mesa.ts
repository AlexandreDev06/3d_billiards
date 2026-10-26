import {
  CONFIG_FISICA_PADRAO,
  ID_BOLAO,
  bolaParada,
  lugares,
  medidasDaBola,
  posicaoLivre,
  type ConfigFisica,
  type EstadoBola,
  type EstadoMesa,
  type IdBola,
  type Ponto2,
} from '@sinuca/fisica';
import type { Consequencias, LugarMesa } from '@sinuca/regras';

/** Coordenadas de um lugar nomeado pelas regras, para uma bola de `raio`. */
export function pontoDoLugar(lugar: LugarMesa, raio: number, config: ConfigFisica = CONFIG_FISICA_PADRAO): Ponto2 {
  const pontos = lugares(config.mesa, raio);
  switch (lugar) {
    case 'marca-saida':
      return pontos.marcaSaida;
    case 'tabela-lado-saida':
      return pontos.tabelaLadoSaida;
    case 'marca-pe':
      return pontos.marcaPe;
    case 'centro-mesa':
      return { x: 0, z: 0 };
  }
}

const tiradaDaMesa = (b: EstadoBola): EstadoBola => ({
  ...b,
  velocidade: { x: 0, y: 0, z: 0 },
  angular: { x: 0, y: 0, z: 0 },
  movimento: 'parada',
  naMesa: false,
});

/** Põe a bola `id`, parada, no ponto livre mais perto de `lugar`; cria a bola se a mesa ainda não a tem. */
export function colocarBola(mesa: EstadoMesa, id: IdBola, lugar: LugarMesa, config: ConfigFisica = CONFIG_FISICA_PADRAO): EstadoMesa {
  const sem: EstadoMesa = { bolas: mesa.bolas.map((b) => (b.id === id ? tiradaDaMesa(b) : b)) };
  const raio = medidasDaBola(id, config).raio;
  const ponto = posicaoLivre(sem, pontoDoLugar(lugar, raio, config), raio, config.mesa);
  const nova = bolaParada(id, ponto, config);
  const existe = sem.bolas.some((b) => b.id === id);
  return { bolas: existe ? sem.bolas.map((b) => (b.id === id ? nova : b)) : [...sem.bolas, nova] };
}

/**
 * O que a tacada causou, aplicado ao estado em que as bolas pararam: tira as
 * bolas de `retirar` e recoloca as de `recolocar`, na ordem, uma de cada vez
 * (a segunda a cair no mesmo lugar fica encostada na primeira). Pura.
 */
export function aplicarConsequencias(
  mesa: EstadoMesa,
  consequencias: Pick<Consequencias, 'retirar' | 'recolocar'>,
  config: ConfigFisica = CONFIG_FISICA_PADRAO,
): EstadoMesa {
  let atual: EstadoMesa = {
    bolas: mesa.bolas.map((b) => (consequencias.retirar.includes(b.id) ? tiradaDaMesa(b) : b)),
  };
  for (const { bola, lugar } of consequencias.recolocar) atual = colocarBola(atual, bola, lugar, config);
  return atual;
}

/**
 * Garante o bolão na mesa para a próxima tacada: se as regras não o devolveram
 * (bug delas), volta para a marca da saída e avisa no console.
 */
export function garantirBolao(mesa: EstadoMesa, config: ConfigFisica = CONFIG_FISICA_PADRAO): EstadoMesa {
  if (mesa.bolas.some((b) => b.id === ID_BOLAO && b.naMesa)) return mesa;
  console.warn('as regras não devolveram o bolão à mesa: voltando à marca da saída');
  return colocarBola(mesa, ID_BOLAO, 'marca-saida', config);
}
