import {
  CONFIG_FISICA_PADRAO,
  ID_BOLAO,
  bolaParada,
  medidasDaBola,
  posicaoLivre,
  type ConfigFisica,
  type EstadoBola,
  type EstadoMesa,
  type IdBola,
  type Ponto2,
} from '@sinuca/fisica';

/**
 * O treino arruma a mesa à mão (bola na mão, arrastar, tirar e devolver bola, cenários): contas puras sobre o `EstadoMesa`,
 * sem DOM nem three. As regras só ficam sabendo do resultado por `sincronizarMesa` (feito por quem chama, ao sair do modo
 * de arrumar).
 */

/**
 * A bola solta aqui não encosta em nada: sobra pelo menos isto (m) entre ela e outra bola, a tabela e a boca de uma caçapa.
 * Sem a folga, "encostada" valeria como livre (a física aceita o encosto), e a tacada começaria com duas bolas coladas.
 */
export const FOLGA_DE_ENCOSTO = 0.001;

const semVelocidade = { x: 0, y: 0, z: 0 } as const;

const parada = (b: EstadoBola): EstadoBola => ({ ...b, velocidade: semVelocidade, angular: semVelocidade, movimento: 'parada' });

const comBola = (mesa: EstadoMesa, id: IdBola, nova: EstadoBola): EstadoMesa => ({
  bolas: mesa.bolas.some((b) => b.id === id) ? mesa.bolas.map((b) => (b.id === id ? nova : b)) : [...mesa.bolas, nova],
});

/** A mesa sem a bola `id` (como se ela estivesse fora): serve a perguntar "onde ela cabe?". */
function semABola(mesa: EstadoMesa, id: IdBola): EstadoMesa {
  return { bolas: mesa.bolas.map((b) => (b.id === id ? { ...b, naMesa: false } : b)) };
}

/**
 * A bola `id` cabe em `ponto` sem encostar em outra bola, na tabela ou na boca de uma caçapa? É a pergunta da física
 * (`posicaoLivre`): se o ponto livre mais perto dele é ele mesmo, cabe. As outras bolas contam onde estão; a própria `id`, não.
 */
export function cabeNoPonto(mesa: EstadoMesa, id: IdBola, ponto: Ponto2, config: ConfigFisica = CONFIG_FISICA_PADRAO): boolean {
  const raio = medidasDaBola(id, config).raio + FOLGA_DE_ENCOSTO;
  const livre = posicaoLivre(semABola(mesa, id), ponto, raio, config.mesa, config);
  return Math.hypot(livre.x - ponto.x, livre.z - ponto.z) < 1e-9;
}

/**
 * O ponto mais perto de `alvo` onde a bola `id` cabe: o que se mostra ao arrastar para o jogador ver onde ela ficaria se
 * soltasse (o ponto de agora, se cabe).
 */
export function pontoMaisPertoQueCabe(mesa: EstadoMesa, id: IdBola, alvo: Ponto2, config: ConfigFisica = CONFIG_FISICA_PADRAO): Ponto2 {
  const raio = medidasDaBola(id, config).raio + FOLGA_DE_ENCOSTO;
  return posicaoLivre(semABola(mesa, id), alvo, raio, config.mesa, config);
}

/** Põe a bola `id`, parada, em `ponto` (sem conferir se cabe: quem chama conferiu com `cabeNoPonto`). Cria a bola se a mesa não a tem. */
export function moverBola(mesa: EstadoMesa, id: IdBola, ponto: Ponto2, config: ConfigFisica = CONFIG_FISICA_PADRAO): EstadoMesa {
  return comBola(mesa, id, bolaParada(id, ponto, config));
}

/** Tira a bola `id` da mesa (ela fica na bandeja do canto até ser devolvida). Mesa sem a bola, ou com ela já fora, não muda. */
export function tirarBola(mesa: EstadoMesa, id: IdBola): EstadoMesa {
  if (!mesa.bolas.some((b) => b.id === id && b.naMesa)) return mesa;
  return { bolas: mesa.bolas.map((b) => (b.id === id ? { ...parada(b), naMesa: false } : b)) };
}

/**
 * Devolve à mesa a bola `id`, parada, no ponto livre mais perto de `alvo` (o meio da mesa, em geral). Bola que já está na
 * mesa não muda.
 */
export function devolverBola(mesa: EstadoMesa, id: IdBola, alvo: Ponto2, config: ConfigFisica = CONFIG_FISICA_PADRAO): EstadoMesa {
  if (mesa.bolas.some((b) => b.id === id && b.naMesa)) return mesa;
  return moverBola(mesa, id, pontoMaisPertoQueCabe(mesa, id, alvo, config), config);
}

/** A bola que está sob `ponto` (o centro da bola a até `raio + tolerancia` dele), a mais perto se mais de uma; `null` se nenhuma. */
export function bolaSobOPonto(mesa: EstadoMesa, ponto: Ponto2, tolerancia: number, config: ConfigFisica = CONFIG_FISICA_PADRAO): IdBola | null {
  let achada: IdBola | null = null;
  let melhor = Infinity;
  for (const b of mesa.bolas) {
    if (!b.naMesa) continue;
    const distancia = Math.hypot(b.posicao.x - ponto.x, b.posicao.z - ponto.z);
    if (distancia <= medidasDaBola(b.id, config).raio + tolerancia && distancia < melhor) {
      achada = b.id;
      melhor = distancia;
    }
  }
  return achada;
}

/** As numeradas que estão na mesa, em ordem (o que `sincronizarMesa` pede). */
export function numeradasNaMesa(mesa: EstadoMesa): IdBola[] {
  return mesa.bolas.filter((b) => b.naMesa && b.id !== ID_BOLAO).map((b) => b.id).sort((a, b) => a - b);
}

/** As numeradas da casa que não estão na mesa (a bandeja do canto), em ordem. */
export function numeradasFora(mesa: EstadoMesa, casa: readonly IdBola[]): IdBola[] {
  const dentro = new Set(numeradasNaMesa(mesa));
  return casa.filter((b) => b !== ID_BOLAO && !dentro.has(b)).sort((a, b) => a - b);
}

/** O bolão está na mesa? (Sem ele não há tacada.) */
export const brancaNaMesa = (mesa: EstadoMesa): boolean => mesa.bolas.some((b) => b.id === ID_BOLAO && b.naMesa);
