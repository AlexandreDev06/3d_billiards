import { cacapas, type MedidasMesa } from '@sinuca/fisica';
import type { ConfigBaloes } from '../config';
import type { Esfera } from '../maos/esferas';
import { poseVaziaDeMao, tapaAlgumaBola, type PoseDeMao } from '../maos/pose-das-maos';
import type { PontoProjetado, Projetor } from '../maos/projetor';

/** Onde o balão de quem joga pousa e de que lado da tela ficou. */
export interface LugarDoBalao {
  x: number;
  y: number;
  z: number;
  /** Achou um lugar que não tapa nada e fica à vista: se não, o balão não aparece. */
  ok: boolean;
  /** `1` à direita de quem taca (olhando para a bola), `-1` à esquerda. */
  lado: 1 | -1;
}

export function lugarVazioDoBalao(): LugarDoBalao {
  return { x: 0, y: 0, z: 0, ok: false, lado: 1 };
}

/** O corpo do balão como esferas (centro e raio no quadro do balão, sem giro): o oval vira três bolas empilhadas. */
export function esferasDoBalao(altura: number, raio: number): readonly Esfera[] {
  const meio = altura * 0.5;
  return [
    { x: 0, y: 0, z: 0, r: raio },
    { x: 0, y: meio, z: 0, r: raio * 0.85 },
    { x: 0, y: -meio, z: 0, r: raio * 0.75 },
  ];
}

/**
 * As seis bocas das caçapas como esferas para a conta de "tapa": o círculo de queda de cada uma (o buraco que o desenho abre), no
 * nível do pano. O balão que paira sobre uma delas esconde o lugar onde as bolas caem.
 */
export function bocasDaMesa(mesa: MedidasMesa): readonly Esfera[] {
  return cacapas(mesa).map((c) => ({ x: c.queda.centro.x, y: 0, z: c.queda.centro.z, r: c.queda.raio }));
}

const pontoDaTela: PontoProjetado = { x: 0, y: 0, profundidade: 0 };

/** O lugar escolhido por quanto: adiante, altura, lado e distância do lado, em degraus de `posicao`. */
interface Degraus {
  adiante: number;
  altura: number;
  lado: 1 | -1;
  distancia: number;
}

/**
 * Onde pôr o balão de quem joga, junto da mão que segura o taco: para o lado e para cima dela, e se preciso adiante, pelo taco, em
 * direção à ponta. Procura do mais perto da mão para o mais longe o primeiro lugar em que (a) o balão inteiro cabe na tela, (b) a
 * câmera fica a mais de `distanciaMinimaDaCamera` dele e (c) ele não tapa nenhuma das `protegidas` (a branca e a bola mirada) nem
 * as `bocas` das seis caçapas, vistas por esta câmera. O lugar achado vale enquanto continuar servindo, para o balão não trocar de lado a cada quadro e a conta
 * não rodar toda vez. Sem lugar nenhum, `ok` é falso.
 *
 * Só conta: sem three, sem DOM, sem alocar por chamada.
 */
export class PosicionadorDoBalao {
  private readonly pose: PoseDeMao = poseVaziaDeMao();
  private readonly esferas: readonly Esfera[];
  private readonly achado: Degraus = { adiante: 0, altura: 0, lado: 1, distancia: 0 };
  private temAchado = false;

  constructor(
    private readonly cfg: ConfigBaloes,
    private readonly bocas: readonly Esfera[] = [],
  ) {
    this.esferas = esferasDoBalao(cfg.corpo.altura, cfg.corpo.raio);
  }

  /** Esquece o lugar de antes (vez nova): a próxima procura começa do mais perto da mão. */
  reiniciar(): void {
    this.temAchado = false;
  }

  /** `mao`: onde a mão de trás segura o taco; `angulo`: a direção da tacada no plano (rad). O resultado vai para `saida`. */
  escolher(mao: { readonly x: number; readonly y: number; readonly z: number }, angulo: number, projetor: Projetor, protegidas: readonly Esfera[], saida: LugarDoBalao): LugarDoBalao {
    if (this.temAchado && this.tentar(this.achado, mao, angulo, projetor, protegidas, saida)) return saida;
    this.temAchado = false;
    const { posicao } = this.cfg;
    const passosDeAdiante = Math.floor(posicao.adianteMaximo / posicao.passoAdiante + 1e-9);
    const passosDeAltura = Math.floor((posicao.alturaMaxima - posicao.altura) / posicao.passoDaAltura + 1e-9);
    const passosDeLado = Math.floor((posicao.ladoMaximo - posicao.lado) / posicao.passoDoLado + 1e-9);
    const candidato: Degraus = { adiante: 0, altura: 0, lado: 1, distancia: 0 };
    // Do mais perto da mão: primeiro o que não sai do lugar (adiante), depois mais alto, e só então mais afastado do lado.
    for (let a = 0; a <= passosDeAdiante; a++) {
      for (let h = 0; h <= passosDeAltura; h++) {
        for (let d = 0; d <= passosDeLado; d++) {
          for (const lado of [1, -1] as const) {
            candidato.adiante = a;
            candidato.altura = h;
            candidato.lado = lado;
            candidato.distancia = d;
            if (!this.tentar(candidato, mao, angulo, projetor, protegidas, saida)) continue;
            this.achado.adiante = a;
            this.achado.altura = h;
            this.achado.lado = lado;
            this.achado.distancia = d;
            this.temAchado = true;
            return saida;
          }
        }
      }
    }
    saida.ok = false;
    return saida;
  }

  /** O lugar dos `degraus` serve? Se sim, vai para `saida`. */
  private tentar(degraus: Degraus, mao: { readonly x: number; readonly y: number; readonly z: number }, angulo: number, projetor: Projetor, protegidas: readonly Esfera[], saida: LugarDoBalao): boolean {
    const { posicao, corpo } = this.cfg;
    const dx = Math.cos(angulo);
    const dz = Math.sin(angulo);
    // Perpendicular horizontal à direção da tacada: `+1` é a direita de quem olha para a bola.
    const px = -dz;
    const pz = dx;
    const adiante = degraus.adiante * posicao.passoAdiante;
    const lado = (posicao.lado + degraus.distancia * posicao.passoDoLado) * degraus.lado;
    const x = mao.x + dx * adiante + px * lado;
    const y = mao.y + posicao.altura + degraus.altura * posicao.passoDaAltura;
    const z = mao.z + dz * adiante + pz * lado;
    if (!this.serve(x, y, z, projetor, protegidas, corpo.altura, corpo.raio, corpo.altura + 2.5 * corpo.no + corpo.cordinha)) return false;
    saida.x = x;
    saida.y = y;
    saida.z = z;
    saida.ok = true;
    saida.lado = degraus.lado;
    return true;
  }

  /** `abaixo`: do centro do balão à ponta da cordinha. */
  private serve(x: number, y: number, z: number, projetor: Projetor, protegidas: readonly Esfera[], altura: number, raio: number, abaixo: number): boolean {
    const margem = this.cfg.posicao.margemDaTela;
    if (y - abaixo < this.cfg.posicao.folgaDoPano) return false;
    if (!projetor.projetar(x, y, z, pontoDaTela)) return false;
    if (pontoDaTela.profundidade < this.cfg.posicao.distanciaMinimaDaCamera + raio) return false;
    // O balão inteiro na tela: o centro mais o meio-tamanho dele (em NDC) dentro da margem.
    const meioX = (raio * projetor.escala) / (pontoDaTela.profundidade * projetor.aspecto);
    const meioY = ((altura + raio * 0.2) * projetor.escala) / pontoDaTela.profundidade;
    if (Math.abs(pontoDaTela.x) + meioX > margem || Math.abs(pontoDaTela.y) + meioY > margem) return false;
    const pose = this.pose;
    pose.x = x;
    pose.y = y;
    pose.z = z;
    return !tapaAlgumaBola(this.esferas, pose, protegidas, projetor, 0.15) && !tapaAlgumaBola(this.esferas, pose, this.bocas, projetor, 0.15);
  }
}
