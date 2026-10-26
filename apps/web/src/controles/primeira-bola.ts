import { CONFIG_FISICA_PADRAO, ID_BOLAO, medidasDaBola, type ConfigFisica, type EstadoMesa, type IdBola } from '@sinuca/fisica';

/** Encostar de raspão sem entrar (folga de ~1 µm ou menos) não é pegar a bola: a conta não pode depender do último bit do ponto flutuante. */
const FOLGA_MINIMA = 1e-12;

/**
 * A primeira numerada que o bolão encontra andando em linha reta na direção da mira: varredura de uma esfera do
 * tamanho do bolão (por isso a bola de raspão conta), sem tabela, sem efeito e sem física. Não é a linha de previsão:
 * só diz qual bola está na frente, não o caminho. Não aloca (roda a cada mudança da mira); `null` se a reta não
 * encosta em nenhuma ou se o bolão não está na mesa. Empate de distância fica com o menor número.
 */
export function primeiraBolaNaLinha(mesa: EstadoMesa, angulo: number, config: ConfigFisica = CONFIG_FISICA_PADRAO): IdBola | null {
  let bolao = null;
  for (const bola of mesa.bolas) {
    if (bola.id === ID_BOLAO && bola.naMesa) {
      bolao = bola;
      break;
    }
  }
  if (bolao === null) return null;
  const raioBolao = medidasDaBola(ID_BOLAO, config).raio;
  const dx = Math.cos(angulo);
  const dz = Math.sin(angulo);
  let melhor: IdBola | null = null;
  let menorDistancia = Infinity;
  for (const bola of mesa.bolas) {
    if (bola.id === ID_BOLAO || !bola.naMesa) continue;
    const cx = bola.posicao.x - bolao.posicao.x;
    const cz = bola.posicao.z - bolao.posicao.z;
    const adiante = cx * dx + cz * dz;
    if (adiante <= 0) continue;
    const soma = raioBolao + medidasDaBola(bola.id, config).raio;
    const folga = soma * soma - (cx * cx + cz * cz - adiante * adiante);
    if (folga <= FOLGA_MINIMA) continue;
    // Quanto o bolão anda até encostar; já encostado (ou sobreposto) e indo para a bola, é 0.
    const distancia = Math.max(0, adiante - Math.sqrt(folga));
    if (distancia < menorDistancia || (distancia === menorDistancia && melhor !== null && bola.id < melhor)) {
      menorDistancia = distancia;
      melhor = bola.id;
    }
  }
  return melhor;
}
