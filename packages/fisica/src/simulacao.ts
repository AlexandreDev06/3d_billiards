import { CONFIG_FISICA_PADRAO, medidasDaBola } from './config';
import { Motor } from './motor';
import { golpeDoTaco } from './taco';
import { ID_BOLAO, type ConfigFisica, type EstadoMesa, type Gravacao, type ParametrosTacada, type ResultadoTacada, type Rng } from './tipos';

/** Junta as amostras a 60 Hz; cresce dobrando para não reservar `duracaoMaxima` inteira. */
class Gravador {
  quadros = 0;
  private capacidade = 256;
  private posicoes: Float32Array;
  private orientacoes: Float32Array;
  private naMesa: Uint8Array;

  constructor(private readonly motor: Motor) {
    const n = motor.bolas.length;
    this.posicoes = new Float32Array(this.capacidade * n * 3);
    this.orientacoes = new Float32Array(this.capacidade * n * 4);
    this.naMesa = new Uint8Array(this.capacidade * n);
  }

  amostrar(): void {
    const bolas = this.motor.bolas;
    const n = bolas.length;
    if (this.quadros === this.capacidade) this.crescer();
    for (let i = 0; i < n; i++) {
      const b = bolas[i]!;
      const k = this.quadros * n + i;
      this.posicoes[k * 3] = b.px;
      this.posicoes[k * 3 + 1] = b.py;
      this.posicoes[k * 3 + 2] = b.pz;
      this.orientacoes[k * 4] = b.qx;
      this.orientacoes[k * 4 + 1] = b.qy;
      this.orientacoes[k * 4 + 2] = b.qz;
      this.orientacoes[k * 4 + 3] = b.qw;
      this.naMesa[k] = b.naMesa ? 1 : 0;
    }
    this.quadros++;
  }

  fechar(quadros: number, frequencia: number, duracao: number): Gravacao {
    while (this.quadros < quadros) this.amostrar();
    const n = this.motor.bolas.length;
    return {
      frequencia,
      ids: this.motor.bolas.map((b) => b.id),
      quadros,
      duracao,
      posicoes: this.posicoes.slice(0, quadros * n * 3),
      orientacoes: this.orientacoes.slice(0, quadros * n * 4),
      naMesa: this.naMesa.slice(0, quadros * n),
      eventos: this.motor.eventos,
    };
  }

  private crescer(): void {
    this.capacidade *= 2;
    const n = this.motor.bolas.length;
    const posicoes = new Float32Array(this.capacidade * n * 3);
    const orientacoes = new Float32Array(this.capacidade * n * 4);
    const naMesa = new Uint8Array(this.capacidade * n);
    posicoes.set(this.posicoes);
    orientacoes.set(this.orientacoes);
    naMesa.set(this.naMesa);
    this.posicoes = posicoes;
    this.orientacoes = orientacoes;
    this.naMesa = naMesa;
  }
}

/**
 * Simula a tacada inteira, do impacto do taco até todas as bolas pararem (ou
 * até `config.duracaoMaxima`, quando tudo é parado onde está).
 * Pura: não muta `estado`; toda aleatoriedade vem de `rng`.
 */
export function simularTacada(
  estado: EstadoMesa,
  parametros: ParametrosTacada,
  rng: Rng,
  config: ConfigFisica = CONFIG_FISICA_PADRAO,
): ResultadoTacada {
  const motor = new Motor(estado, config);
  const iBolao = motor.bolas.findIndex((b) => b.id === ID_BOLAO);
  if (iBolao < 0 || !motor.bolas[iBolao]!.naMesa) throw new Error('simularTacada: o bolão não está na mesa');

  const golpe = golpeDoTaco(parametros, medidasDaBola(ID_BOLAO, config), config, rng);
  motor.aplicarGolpe(iBolao, golpe);
  motor.eventos.push({ tipo: 'taco-bola', t: 0, bola: ID_BOLAO, velocidade: golpe.velocidadeTaco, miscue: golpe.miscue });

  const { passo, frequenciaGravacao: frequencia, duracaoMaxima } = config;
  const gravador = new Gravador(motor);
  gravador.amostrar();
  let proximaAmostra = 1 / frequencia;
  let cortou = false;
  for (let k = 1; !motor.todasParadas(); k++) {
    const fimDoPasso = k * passo;
    while (motor.t < fimDoPasso) {
      const alvo = Math.min(fimDoPasso, proximaAmostra);
      motor.avancar(alvo - motor.t);
      motor.t = alvo;
      if (alvo === proximaAmostra) {
        gravador.amostrar();
        proximaAmostra = (gravador.quadros) / frequencia;
      }
    }
    if (motor.t >= duracaoMaxima && !motor.todasParadas()) {
      motor.pararTudo();
      cortou = true;
    }
  }

  const duracao = cortou ? duracaoMaxima : motor.tUltimaParada;
  motor.eventos.push({ tipo: 'parou', t: duracao });
  // Resultado e gravação dividem a mesma lista: congelada, ninguém muda a do outro.
  const eventos = Object.freeze(motor.eventos);
  const quadros = Math.ceil(duracao * frequencia) + 1;
  return { eventos, gravacao: gravador.fechar(quadros, frequencia, duracao), estadoFinal: motor.estado() };
}
