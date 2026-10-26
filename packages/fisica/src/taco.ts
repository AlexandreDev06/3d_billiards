import type { MedidasBola } from './medidas';
import type { ConfigFisica, ParametrosTacada, Rng } from './tipos';

/** Velocidade e giro do bolão logo depois do taco (referencial da mesa). */
export interface Golpe {
  readonly vx: number;
  readonly vz: number;
  readonly wx: number;
  readonly wy: number;
  readonly wz: number;
  /** Velocidade do taco no impacto, já limitada. */
  readonly velocidadeTaco: number;
  readonly miscue: boolean;
}

const limitar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/**
 * Impulso do taco ao longo do próprio eixo, sem atrito na ponta (formulação do
 * pooltool, com restituição taco-bola em vez do choque elástico):
 * `J = (1+e)·V / (1/m + 1/M + d²/I)`, `d` = distância do eixo do taco ao centro.
 * O efeito é medido no plano perpendicular ao taco, como no mini-bolão.
 */
export function golpeDoTaco(p: ParametrosTacada, bola: MedidasBola, config: ConfigFisica, rng: Rng): Golpe {
  const velocidadeTaco = limitar(p.velocidadeTaco, 0, config.velocidadeMaxTaco);
  let lateral = limitar(p.efeito.lateral, -1, 1);
  let vertical = limitar(p.efeito.vertical, -1, 1);
  const deslocamento = Math.hypot(lateral, vertical);
  if (deslocamento > config.efeitoMaximo) {
    lateral *= config.efeitoMaximo / deslocamento;
    vertical *= config.efeitoMaximo / deslocamento;
  }

  const giz = limitar(p.giz, 0, 1);
  const limite = config.limiteEfeitoSemGiz + (config.limiteEfeitoComGiz - config.limiteEfeitoSemGiz) * giz;
  let miscue = false;
  if (deslocamento > limite) {
    miscue = rng.proximo() < Math.min(1, (deslocamento - limite) / config.faixaMiscue);
  }

  let angulo = p.angulo;
  let fatorVelocidade = 1;
  if (miscue) {
    angulo += (2 * rng.proximo() - 1) * config.desvioMiscue;
    lateral *= config.efeitoMiscue;
    vertical *= config.efeitoMiscue;
    fatorVelocidade = config.fatorMiscue;
  }
  lateral *= config.fatorEfeitoLateral;

  const { massa: m, raio: R } = bola;
  const inercia = 0.4 * m * R * R;
  const d2 = (lateral * lateral + vertical * vertical) * R * R;
  const J =
    (fatorVelocidade * (1 + config.restituicaoTacoBola) * velocidadeTaco) /
    (1 / m + 1 / config.massaTaco + d2 / inercia);

  const elevacao = limitar(p.elevacao, 0, Math.PI / 2);
  const cosE = Math.cos(elevacao);
  const senE = Math.sin(elevacao);
  const dx = Math.cos(angulo);
  const dz = Math.sin(angulo);

  // Eixo do taco ĉ = cosE·d̂ − senE·ŷ; direita l̂ = d̂ × ŷ = (−dz, 0, dx); "cima" do taco û = l̂ × ĉ = cosE·ŷ + senE·d̂.
  // Ponto de contato r = R·(lateral·l̂ + vertical·û) − c·ĉ, então r × ĉ = R·(lateral·û − vertical·l̂).
  const k = (J * R) / inercia;
  const wx = k * (lateral * senE * dx + vertical * dz);
  const wy = k * lateral * cosE;
  const wz = k * (lateral * senE * dz - vertical * dx);

  // A componente vertical da velocidade vai contra o pano e some; o squirt gira a horizontal para o lado oposto ao efeito.
  const v = (J / m) * cosE;
  const direcao = angulo - config.fatorSquirt * lateral;
  return { vx: v * Math.cos(direcao), vz: v * Math.sin(direcao), wx, wy, wz, velocidadeTaco, miscue };
}
