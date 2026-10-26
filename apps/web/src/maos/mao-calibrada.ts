import {
  alvoDeCilindroVazio,
  alvoDePincaVazio,
  baseDoCilindro,
  Cinematica,
  cilindroDoQuadro,
  cuboDoQuadro,
  esferasNaPose,
  pincarCubo,
  quadroVazio,
  segurarCilindro,
  type AlvoDeCilindro,
  type AlvoDePinca,
  type Colocacao,
  type ContatoDeCilindro,
  type ContatoDePinca,
  type ModeloDoPersonagem,
  type Quadro,
} from '@sinuca/personagens';
import type { Vec3 } from './eixo';
import type { Esfera } from './esferas';
import type { PoseDeMao } from './pose-das-maos';

/**
 * Uma das duas mãos do artista no tamanho e do lado em que o jogo a usa, com o que as contas puras precisam saber dela. O quadro
 * em que o jogo fala dela é o do contato com o taco: a origem de uma `PoseDeMao` é o ponto do contato (no eixo do taco), `d` é o
 * eixo do taco e `u` o "para cima" da mão (a mesma base de `segurarCilindro`). Os pontos do arquivo, no referencial da mão, viram
 * coordenadas desse quadro (`local`), já na escala e, na mão esquerda, espelhados.
 */
export class MaoCalibrada {
  readonly contato: ContatoDeCilindro;
  readonly colocacao: Colocacao;
  private readonly base = new Float64Array(9);
  private readonly cosGiro: number;
  private readonly senGiro: number;
  private readonly alvo: AlvoDeCilindro = alvoDeCilindroVazio();
  private readonly alvoDoCubo: AlvoDePinca = alvoDePincaVazio();
  private readonly quadroDoCubo: Quadro = quadroVazio();
  private readonly quadroDaMao: Quadro = quadroVazio();

  constructor(
    readonly modelo: ModeloDoPersonagem,
    /** O contato do taco que define o quadro desta mão (`ponte_v`, `punho`). */
    readonly nomeDoContato: string,
    readonly escala: number,
    readonly espelho: boolean,
    /**
     * Quanto a mão gira no plano do apoio, em torno do "para cima" do quadro e com o contato fixo no taco (rad; positivo leva os dedos
     * para o lado `z` do quadro, a direita de quem joga, e o pulso para o lado oposto e para trás).
     */
    readonly giro = 0,
  ) {
    const contato = modelo.contatos.cilindros.get(nomeDoContato);
    if (contato === undefined) throw new Error(`o arquivo de contatos não tem "${nomeDoContato}"`);
    this.contato = contato;
    this.colocacao = { escala, espelho };
    this.cosGiro = Math.cos(giro);
    this.senGiro = Math.sin(giro);
    baseDoCilindro(contato, espelho, this.base);
  }

  /** O ponto (`x`, `y`, `z`) do referencial da mão do arquivo, no quadro desta mão (m): `x` ao longo do taco, `y` para cima, `z` do lado. */
  local(x: number, y: number, z: number, saida: Vec3): Vec3 {
    const m = this.espelho ? -1 : 1;
    const dx = m * (x - this.contato.ponto[0]);
    const dy = y - this.contato.ponto[1];
    const dz = z - this.contato.ponto[2];
    const b = this.base;
    const lx = this.escala * (b[0]! * dx + b[1]! * dy + b[2]! * dz);
    const lz = this.escala * (b[6]! * dx + b[7]! * dy + b[8]! * dz);
    saida.x = this.cosGiro * lx - this.senGiro * lz;
    saida.y = this.escala * (b[3]! * dx + b[4]! * dy + b[5]! * dz);
    saida.z = this.senGiro * lx + this.cosGiro * lz;
    return saida;
  }

  /** As esferas que cobrem a mão numa pose do arquivo, no quadro desta mão. */
  esferas(pose: string): Esfera[] {
    const { centros, raios } = esferasNaPose(this.modelo, pose);
    const p: Vec3 = { x: 0, y: 0, z: 0 };
    return Array.from(raios, (r, i) => {
      this.local(centros[3 * i]!, centros[3 * i + 1]!, centros[3 * i + 2]!, p);
      return { x: p.x, y: p.y, z: p.z, r: r * this.escala };
    });
  }

  /** Do eixo do taco ao ponto mais baixo da pele numa pose (m): o quanto a mão afunda se o eixo está nessa altura. */
  fundo(pose: string): number {
    const pontos = this.modelo.apoios.get(pose);
    if (pontos === undefined) throw new Error(`pose "${pose}" não existe`);
    const p: Vec3 = { x: 0, y: 0, z: 0 };
    let menor = 0;
    for (let i = 0; i < pontos.length; i += 3) menor = Math.min(menor, this.local(pontos[i]!, pontos[i + 1]!, pontos[i + 2]!, p).y);
    return -menor;
  }

  /** O esqueleto numa pose do arquivo, para achar onde ficam as pontas dos dedos. */
  cinematica(pose: string): Cinematica {
    const dados = this.modelo.ficha.poses.get(pose);
    if (dados === undefined) throw new Error(`pose "${pose}" não existe`);
    return new Cinematica(this.modelo.ficha).calcular(dados);
  }

  /** O quadro do personagem em cena que põe a mão na `pose` do jogo, `presenca` vezes o tamanho (a origem da pose fica parada). */
  quadro(pose: PoseDeMao, presenca: number, saida: Quadro): Quadro {
    const a = this.alvo;
    a.px = pose.x;
    a.py = pose.y;
    a.pz = pose.z;
    this.girarEixo(pose, a);
    a.cx = pose.ux;
    a.cy = pose.uy;
    a.cz = pose.uz;
    const colocacao = presenca === 1 ? this.colocacao : { escala: this.escala * presenca, espelho: this.espelho };
    return segurarCilindro(this.contato, a, colocacao, saida);
  }

  /**
   * A pose desta mão quando ela pinça o cubo de giz que está no quadro `cubo` (a origem no centro dele; `d`, a direção em que a
   * face da covinha não está: a covinha fica em `-d`; `u`, uma direção de lado). A pinça do artista aperta duas faces e deixa a
   * palma de um lado do cubo; o eixo que sai da palma para o cubo (o `d` do quadro dele) é o do dorso, então a face de `-d` é a
   * que a mão não cobre, e a covinha fica livre para a ponta do taco. `rolo` (rad) gira a mão em torno de `d` em relação ao cubo
   * (0: a pinça de lado; ao menos um quarto de volta põe os dedos para baixo): a mesma mão, com a pose `pinca`, tem o contato do
   * cubo exatamente ali.
   */
  poseQuePinca(pinca: ContatoDePinca, cubo: PoseDeMao, saida: PoseDeMao, rolo = 0): PoseDeMao {
    const a = this.alvoDoCubo;
    a.px = cubo.x;
    a.py = cubo.y;
    a.pz = cubo.z;
    // O eixo do dorso da mão (o terceiro do contato) vai para `d` e o `lado` do contato, para uma direção de lado `u` girada por `rolo`.
    const wx = cubo.dy * cubo.uz - cubo.dz * cubo.uy;
    const wy = cubo.dz * cubo.ux - cubo.dx * cubo.uz;
    const wz = cubo.dx * cubo.uy - cubo.dy * cubo.ux;
    const c = Math.cos(rolo);
    const s = Math.sin(rolo);
    a.lx = cubo.ux * c + wx * s;
    a.ly = cubo.uy * c + wy * s;
    a.lz = cubo.uz * c + wz * s;
    a.tx = cubo.dx;
    a.ty = cubo.dy;
    a.tz = cubo.dz;
    pincarCubo(pinca, a, this.colocacao, this.quadroDoCubo);
    return this.poseDoQuadro(this.quadroDoCubo, saida);
  }

  /** O contrário de `poseQuePinca`: onde está o cubo (o quadro dele) quando a mão está na `pose` com a pinça do arquivo, com o mesmo `rolo`. */
  cuboNaPose(pinca: ContatoDePinca, pose: PoseDeMao, saida: PoseDeMao, rolo = 0): PoseDeMao {
    this.quadro(pose, 1, this.quadroDaMao);
    cuboDoQuadro(pinca, this.quadroDaMao, this.colocacao, this.alvoDoCubo);
    const a = this.alvoDoCubo;
    saida.x = a.px;
    saida.y = a.py;
    saida.z = a.pz;
    saida.dx = a.tx;
    saida.dy = a.ty;
    saida.dz = a.tz;
    // `l` = u cos(rolo) + w sin(rolo), com w = d × u; então u = l cos(rolo) − (d × l) sin(rolo).
    const kx = a.ty * a.lz - a.tz * a.ly;
    const ky = a.tz * a.lx - a.tx * a.lz;
    const kz = a.tx * a.ly - a.ty * a.lx;
    const c = Math.cos(rolo);
    const s = Math.sin(rolo);
    saida.ux = a.lx * c - kx * s;
    saida.uy = a.ly * c - ky * s;
    saida.uz = a.lz * c - kz * s;
    return saida;
  }

  /** `a.d` = o eixo de `pose` girado `giro` em torno do "para cima" dela, para o lado `w = d × u`. */
  private girarEixo(pose: PoseDeMao, a: AlvoDeCilindro): void {
    const c = this.cosGiro;
    const sen = this.senGiro;
    const wx = pose.dy * pose.uz - pose.dz * pose.uy;
    const wy = pose.dz * pose.ux - pose.dx * pose.uz;
    const wz = pose.dx * pose.uy - pose.dy * pose.ux;
    a.dx = c * pose.dx + sen * wx;
    a.dy = c * pose.dy + sen * wy;
    a.dz = c * pose.dz + sen * wz;
  }

  private poseDoQuadro(quadro: Quadro, saida: PoseDeMao): PoseDeMao {
    const a = cilindroDoQuadro(this.contato, quadro, this.colocacao, this.alvo);
    if (this.giro !== 0) {
      // O desenho gira a mão `giro` em torno de `u`; a pose guardada é a de antes do giro.
      const wx = a.dy * a.cz - a.dz * a.cy;
      const wy = a.dz * a.cx - a.dx * a.cz;
      const wz = a.dx * a.cy - a.dy * a.cx;
      const dx = this.cosGiro * a.dx - this.senGiro * wx;
      const dy = this.cosGiro * a.dy - this.senGiro * wy;
      const dz = this.cosGiro * a.dz - this.senGiro * wz;
      a.dx = dx;
      a.dy = dy;
      a.dz = dz;
    }
    saida.x = a.px;
    saida.y = a.py;
    saida.z = a.pz;
    saida.dx = a.dx;
    saida.dy = a.dy;
    saida.dz = a.dz;
    saida.ux = a.cx;
    saida.uy = a.cy;
    saida.uz = a.cz;
    return saida;
  }
}
