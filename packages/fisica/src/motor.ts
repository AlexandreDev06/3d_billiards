import { medidasDaBola } from './config';
import { cacapas, distanciaContatoTabela, pontasTabela, tabelas, type Ponto2 } from './medidas';
import type { Golpe } from './taco';
import type { ConfigFisica, EstadoBola, EstadoMesa, EventoTacada, IdBola, MovimentoBola } from './tipos';

// Tolerâncias numéricas do integrador (não são parâmetros físicos; os físicos estão em ConfigFisica).
/** Folga (m) que ainda conta como contato: a previsão linear erra ~½·a·passo² ≈ 4 µm. */
const TOL_CONTATO = 1e-5;
/**
 * Abaixo disto (m/s) duas bolas, ou bola e quina, não contam como se aproximando: acima
 * do ruído de arredondamento, para o previsor nunca marcar um choque que o choque recusa.
 */
const TOL_APROXIMACAO = 1e-9;
/** Abaixo disto (m/s) o ponto de contato com o pano não escorrega mais. */
const TOL_ESCORREGAMENTO = 1e-9;
/** Afastamento (m) imposto a duas bolas que terminaram um choque sobrepostas. */
const SEPARACAO = 1e-7;
/** Trava contra laço de choques simultâneos dentro de um passo; cada passo que bate nela conta em `passosEsgotados`. */
const MAX_EVENTOS_POR_PASSO = 4096;
/** Choque em grupo: o Gauss-Seidel para quando nenhuma velocidade relativa muda mais que isto (m/s)... */
const TOL_GRUPO = 1e-12;
/** ...ou depois destas voltas. */
const MAX_VOLTAS_GRUPO = 1000;

const PARADA = 0;
const GIRANDO = 1;
const DESLIZANDO = 2;
const ROLANDO = 3;
const MOVIMENTOS: readonly MovimentoBola[] = ['parada', 'girando', 'deslizando', 'rolando'];
const CODIGO: Record<MovimentoBola, number> = { parada: PARADA, girando: GIRANDO, deslizando: DESLIZANDO, rolando: ROLANDO };

const NENHUM = 0;
const BOLA_BOLA = 1;
const BOLA_TABELA = 2;
const BOLA_QUINA = 3;
const BOLA_CACAPA = 4;

export class BolaMotor {
  readonly id: IdBola;
  readonly raio: number;
  readonly massa: number;
  readonly inercia: number;
  /** Distância do centro ao nariz da tabela no contato. */
  readonly contatoTabela: number;
  readonly senTabela: number;
  readonly cosTabela: number;
  px: number;
  py: number;
  pz: number;
  vx: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  mov: number;
  naMesa: boolean;

  constructor(b: EstadoBola, config: ConfigFisica) {
    const { raio, massa } = medidasDaBola(b.id, config);
    this.id = b.id;
    this.raio = raio;
    this.massa = massa;
    this.inercia = 0.4 * massa * raio * raio;
    this.contatoTabela = distanciaContatoTabela(raio, config.mesa);
    this.senTabela = Math.min(1, Math.max(-1, config.mesa.alturaTabela / raio - 1));
    this.cosTabela = this.contatoTabela / raio;
    this.px = b.posicao.x;
    this.py = b.posicao.y;
    this.pz = b.posicao.z;
    this.vx = b.velocidade.x;
    this.vz = b.velocidade.z;
    this.wx = b.angular.x;
    this.wy = b.angular.y;
    this.wz = b.angular.z;
    this.qx = b.orientacao.x;
    this.qy = b.orientacao.y;
    this.qz = b.orientacao.z;
    this.qw = b.orientacao.w;
    this.mov = CODIGO[b.movimento];
    this.naMesa = b.naMesa;
  }

  movimento(): MovimentoBola {
    return MOVIMENTOS[this.mov]!;
  }

  andando(): boolean {
    return this.naMesa && (this.mov === DESLIZANDO || this.mov === ROLANDO);
  }

  estado(): EstadoBola {
    return {
      id: this.id,
      posicao: { x: this.px, y: this.py, z: this.pz },
      velocidade: { x: this.vx, y: 0, z: this.vz },
      angular: { x: this.wx, y: this.wy, z: this.wz },
      orientacao: { x: this.qx, y: this.qy, z: this.qz, w: this.qw },
      movimento: this.movimento(),
      naMesa: this.naMesa,
    };
  }
}

/** Trecho reto de tabela: o nariz entre as pontas ou a face de uma quina. */
interface Segmento {
  readonly ax: number;
  readonly az: number;
  readonly ex: number;
  readonly ez: number;
  readonly comprimento2: number;
  readonly nx: number;
  readonly nz: number;
  /** Índice em `tabelas()`, para o evento. */
  readonly tabela: number;
}

/** A ponta arredondada de uma tabela na boca: a bola encosta a `contatoTabela + raio` do centro. */
interface Quina {
  readonly x: number;
  readonly z: number;
  readonly raio: number;
  readonly tabela: number;
}

function segmento(inicio: Ponto2, fim: Ponto2, normal: Ponto2, tabela: number): Segmento {
  const ex = fim.x - inicio.x;
  const ez = fim.z - inicio.z;
  return { ax: inicio.x, az: inicio.z, ex, ez, comprimento2: ex * ex + ez * ez, nx: normal.x, nz: normal.z, tabela };
}

interface Boca {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly raio: number;
}

/**
 * Estado da mesa durante a simulação. Entre choques cada bola segue as equações
 * fechadas do seu estado (Han 2005 corrigido, como no pooltool); os choques são
 * achados pelo instante de contato dentro do intervalo, com o movimento linear.
 */
export class Motor {
  readonly bolas: BolaMotor[];
  readonly eventos: EventoTacada[] = [];
  t = 0;
  /** Instante em que a última bola parou ou caiu. */
  tUltimaParada = 0;
  /** Passos em que os choques esgotaram o limite e o resto do passo andou sem detectar choque. */
  passosEsgotados = 0;

  private readonly config: ConfigFisica;
  private readonly segmentos: Segmento[];
  private readonly quinas: Quina[];
  private readonly bocas: Boca[];
  private readonly limiteX: number;
  private readonly limiteZ: number;
  private evTipo = NENHUM;
  private evT = 0;
  private evI = 0;
  private evJ = 0;
  // Choque em grupo, reusados entre choques: pares (índices em `bolas`, em ordem de contato),
  // instante previsto de cada um, bolas envolvidas, normal, aproximação inicial e impulso acumulado.
  private readonly gPares: number[] = [];
  private readonly gTempos: number[] = [];
  private readonly gBolas: number[] = [];
  private readonly gNormais: number[] = [];
  private readonly gAproximacao: number[] = [];
  private readonly gImpulsos: number[] = [];

  constructor(
    estado: EstadoMesa,
    config: ConfigFisica,
    private readonly maxEventosPorPasso = MAX_EVENTOS_POR_PASSO,
  ) {
    this.config = config;
    this.bolas = estado.bolas.map((b) => new BolaMotor(b, config));
    // Cada tabela: o nariz reto entre as pontas, e em cada ponta o arredondado e a face que entra na caçapa.
    const pontas = pontasTabela(config.mesa);
    const narizes = tabelas(config.mesa).map((t, k) => segmento(pontas[2 * k]!.noNariz, pontas[2 * k + 1]!.noNariz, t.normal, k));
    const faces = pontas.map((p) => segmento(p.naFace, p.fimDaFace, p.normalFace, p.tabela));
    this.segmentos = [...narizes, ...faces];
    this.quinas = pontas.map((p) => ({ x: p.centro.x, z: p.centro.z, raio: p.raio, tabela: p.tabela }));
    this.bocas = cacapas(config.mesa).map((c) => ({ id: c.id, x: c.queda.centro.x, z: c.queda.centro.z, raio: c.queda.raio }));
    this.limiteX = config.mesa.comprimento / 2;
    this.limiteZ = config.mesa.largura / 2;
  }

  aplicarGolpe(i: number, golpe: Golpe): void {
    const b = this.bolas[i]!;
    b.vx = golpe.vx;
    b.vz = golpe.vz;
    b.wx = golpe.wx;
    b.wy = golpe.wy;
    b.wz = golpe.wz;
    this.classificar(b);
  }

  todasParadas(): boolean {
    for (const b of this.bolas) if (b.naMesa && b.mov !== PARADA) return false;
    return true;
  }

  energiaCinetica(): number {
    let e = 0;
    for (const b of this.bolas) {
      if (!b.naMesa) continue;
      e += 0.5 * b.massa * (b.vx * b.vx + b.vz * b.vz) + 0.5 * b.inercia * (b.wx * b.wx + b.wy * b.wy + b.wz * b.wz);
    }
    return e;
  }

  /** Para tudo onde está (corte por duracaoMaxima). */
  pararTudo(): void {
    for (const b of this.bolas) {
      b.vx = b.vz = b.wx = b.wy = b.wz = 0;
      b.mov = PARADA;
    }
  }

  estado(): EstadoMesa {
    return { bolas: this.bolas.map((b) => b.estado()) };
  }

  /** Avança `h` segundos (h ≤ passo), resolvendo os choques em ordem de instante. */
  avancar(h: number): void {
    let resto = h;
    let n = 0;
    for (; resto > 0 && n < this.maxEventosPorPasso; n++) {
      this.proximoEvento(resto);
      const dt = this.evT;
      if (dt > 0) {
        for (const b of this.bolas) if (b.naMesa) this.evoluir(b, dt);
        this.t += dt;
        resto -= dt;
      }
      if (this.evTipo === NENHUM) break;
      this.resolverEvento();
    }
    if (resto > 0) {
      if (n === this.maxEventosPorPasso && this.passosEsgotados++ === 0) {
        avisar(`Motor: um passo esgotou o limite de choques (${this.maxEventosPorPasso}) em t = ${this.t.toFixed(4)} s; o resto andou sem detectar choque`);
      }
      for (const b of this.bolas) if (b.naMesa) this.evoluir(b, resto);
      this.t += resto;
    }
    this.conferirForaDaMesa();
  }

  private proximoEvento(h: number): void {
    this.evTipo = NENHUM;
    this.evT = h;
    const bolas = this.bolas;
    for (let i = 0; i < bolas.length; i++) {
      const a = bolas[i]!;
      if (!a.andando()) continue;
      this.preverTabelas(a, i);
      this.preverQuinas(a, i);
      this.preverBocas(a, i);
    }
    for (let i = 0; i < bolas.length; i++) {
      const a = bolas[i]!;
      if (!a.naMesa) continue;
      for (let j = i + 1; j < bolas.length; j++) {
        const b = bolas[j]!;
        if (!b.naMesa || (!a.andando() && !b.andando())) continue;
        const t = instanteDeContato(b.px - a.px, b.pz - a.pz, b.vx - a.vx, b.vz - a.vz, a.raio + b.raio);
        if (t < this.evT) this.marcar(BOLA_BOLA, t, i, j);
      }
    }
  }

  private preverTabelas(a: BolaMotor, i: number): void {
    for (let k = 0; k < this.segmentos.length; k++) {
      const s = this.segmentos[k]!;
      const vn = a.vx * s.nx + a.vz * s.nz;
      if (vn >= 0) continue;
      const d = (a.px - s.ax) * s.nx + (a.pz - s.az) * s.nz - a.contatoTabela;
      if (d < -a.contatoTabela) continue;
      const t = d <= TOL_CONTATO ? 0 : d / -vn;
      if (t >= this.evT) continue;
      const u = ((a.px + a.vx * t - s.ax) * s.ex + (a.pz + a.vz * t - s.az) * s.ez) / s.comprimento2;
      if (u < 0 || u > 1) continue;
      this.marcar(BOLA_TABELA, t, i, k);
    }
  }

  private preverQuinas(a: BolaMotor, i: number): void {
    for (let k = 0; k < this.quinas.length; k++) {
      const q = this.quinas[k]!;
      const t = instanteDeContato(q.x - a.px, q.z - a.pz, -a.vx, -a.vz, a.contatoTabela + q.raio);
      if (t < this.evT) this.marcar(BOLA_QUINA, t, i, k);
    }
  }

  private preverBocas(a: BolaMotor, i: number): void {
    for (let k = 0; k < this.bocas.length; k++) {
      const c = this.bocas[k]!;
      const dx = c.x - a.px;
      const dz = c.z - a.pz;
      const aproxima = dx * a.vx + dz * a.vz;
      if (aproxima <= 0) continue;
      const fora = dx * dx + dz * dz - c.raio * c.raio;
      let t = 0;
      if (fora > 0) {
        const v2 = a.vx * a.vx + a.vz * a.vz;
        const disc = aproxima * aproxima - v2 * fora;
        if (disc < 0) continue;
        t = fora / (aproxima + Math.sqrt(disc));
      }
      if (t < this.evT) this.marcar(BOLA_CACAPA, t, i, k);
    }
  }

  private marcar(tipo: number, t: number, i: number, j: number): void {
    this.evTipo = tipo;
    this.evT = t;
    this.evI = i;
    this.evJ = j;
  }

  private resolverEvento(): void {
    const a = this.bolas[this.evI]!;
    switch (this.evTipo) {
      case BOLA_BOLA:
        if (this.montarGrupo(this.evI, this.evJ) === 1) this.choqueBolas(a, this.bolas[this.evJ]!);
        else this.choqueEmGrupo();
        return;
      case BOLA_TABELA: {
        const s = this.segmentos[this.evJ]!;
        this.choqueTabela(a, s.nx, s.nz, s.tabela);
        return;
      }
      case BOLA_QUINA: {
        const q = this.quinas[this.evJ]!;
        const dx = a.px - q.x;
        const dz = a.pz - q.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        this.choqueTabela(a, dx / d, dz / d, q.tabela);
        return;
      }
      case BOLA_CACAPA: {
        const c = this.bocas[this.evJ]!;
        this.retirar(a);
        this.eventos.push({ tipo: 'cacapa', t: this.t, bola: a.id, cacapa: c.id });
        return;
      }
    }
  }

  private retirar(b: BolaMotor): void {
    b.naMesa = false;
    b.vx = b.vz = b.wx = b.wy = b.wz = 0;
    b.mov = PARADA;
    this.tUltimaParada = Math.max(this.tUltimaParada, this.t);
  }

  /**
   * Choque bola-bola: impulso normal com restituição e impulso tangencial no
   * ponto de contato, limitado por μ(v)·Jn (throw) e pelo que zera o escorregamento.
   */
  private choqueBolas(a: BolaMotor, b: BolaMotor): void {
    let nx = b.px - a.px;
    let nz = b.pz - a.pz;
    const d = Math.sqrt(nx * nx + nz * nz);
    nx /= d;
    nz /= d;
    const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
    if (vn <= 0) return;
    const jn = ((1 + this.config.restituicaoBolaBola) * vn) / (1 / a.massa + 1 / b.massa);
    this.impulsoBolas(a, b, nx, nz, jn, jn);
    this.separar(a, b);
    this.classificar(a, false);
    this.classificar(b, false);
    if (vn >= this.config.velocidadeMinimaChoque) this.eventos.push({ tipo: 'bola-bola', t: this.t, a: a.id, b: b.id, velocidade: vn });
  }

  /**
   * Junta ao par (i, j) os pares que se aproximam e se tocariam até
   * `janelaChoqueSimultaneo` daqui, ligados a ele por bolas em comum. Devolve
   * quantos pares o grupo tem (1 = choque sozinho).
   */
  private montarGrupo(i: number, j: number): number {
    const janela = this.config.janelaChoqueSimultaneo;
    if (janela <= 0) return 1;
    const { bolas, gPares: pares, gTempos: tempos, gBolas: membros } = this;
    pares.length = tempos.length = membros.length = 0;
    pares.push(i, j);
    tempos.push(0);
    membros.push(i, j);
    for (let m = 0; m < membros.length; m++) {
      const k = membros[m]!;
      const a = bolas[k]!;
      for (let l = 0; l < bolas.length; l++) {
        const b = bolas[l]!;
        if (l === k || !b.naMesa || this.temPar(k, l)) continue;
        const t = instanteDeContato(b.px - a.px, b.pz - a.pz, b.vx - a.vx, b.vz - a.vz, a.raio + b.raio);
        if (t > janela) continue;
        // Inserção em ordem de contato: os eventos saem nessa ordem (as regras olham a primeira bola tocada).
        let p = tempos.length;
        tempos.push(t);
        pares.push(0, 0);
        for (; p > 0 && tempos[p - 1]! > t; p--) {
          tempos[p] = tempos[p - 1]!;
          pares[2 * p] = pares[2 * p - 2]!;
          pares[2 * p + 1] = pares[2 * p - 1]!;
        }
        tempos[p] = t;
        pares[2 * p] = Math.min(k, l);
        pares[2 * p + 1] = Math.max(k, l);
        if (!membros.includes(l)) membros.push(l);
      }
    }
    return tempos.length;
  }

  private temPar(k: number, l: number): boolean {
    const pares = this.gPares;
    const i = Math.min(k, l);
    const j = Math.max(k, l);
    for (let p = 0; p < pares.length; p += 2) if (pares[p] === i && pares[p + 1] === j) return true;
    return false;
  }

  /**
   * Choques simultâneos do grupo montado (Poisson): primeiro os impulsos normais
   * acumulados (≥ 0) que deixam nenhum par se aproximando, achados por
   * Gauss-Seidel projetado; depois cada par recebe mais `e` vezes o seu, com o
   * atrito (throw) limitado pelo impulso normal total. Com um par só, dá o
   * mesmo que `choqueBolas`.
   */
  private choqueEmGrupo(): void {
    const { bolas, gPares: pares, gNormais: normais, gAproximacao: aproximacao, gImpulsos: impulsos } = this;
    const n = this.gTempos.length;
    normais.length = aproximacao.length = impulsos.length = 0;
    for (let p = 0; p < n; p++) {
      const a = bolas[pares[2 * p]!]!;
      const b = bolas[pares[2 * p + 1]!]!;
      const dx = b.px - a.px;
      const dz = b.pz - a.pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      normais.push(dx / d, dz / d);
      aproximacao.push(((a.vx - b.vx) * dx + (a.vz - b.vz) * dz) / d);
      impulsos.push(0);
    }
    for (let volta = 0; volta < MAX_VOLTAS_GRUPO; volta++) {
      let maior = 0;
      for (let p = 0; p < n; p++) {
        const a = bolas[pares[2 * p]!]!;
        const b = bolas[pares[2 * p + 1]!]!;
        const nx = normais[2 * p]!;
        const nz = normais[2 * p + 1]!;
        const w = 1 / a.massa + 1 / b.massa;
        const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        const novo = Math.max(0, impulsos[p]! + vn / w);
        const dj = novo - impulsos[p]!;
        if (dj === 0) continue;
        impulsos[p] = novo;
        a.vx -= (dj * nx) / a.massa;
        a.vz -= (dj * nz) / a.massa;
        b.vx += (dj * nx) / b.massa;
        b.vz += (dj * nz) / b.massa;
        maior = Math.max(maior, Math.abs(dj) * w);
      }
      if (maior < TOL_GRUPO) break;
    }
    const e = this.config.restituicaoBolaBola;
    for (let p = 0; p < n; p++) {
      const j = impulsos[p]!;
      if (j === 0) continue;
      this.impulsoBolas(bolas[pares[2 * p]!]!, bolas[pares[2 * p + 1]!]!, normais[2 * p]!, normais[2 * p + 1]!, e * j, (1 + e) * j);
    }
    for (let p = 0; p < n; p++) {
      if (impulsos[p] === 0) continue;
      const a = bolas[pares[2 * p]!]!;
      const b = bolas[pares[2 * p + 1]!]!;
      this.separar(a, b);
      this.classificar(a, false);
      this.classificar(b, false);
      const velocidade = aproximacao[p]!;
      if (velocidade >= this.config.velocidadeMinimaChoque) this.eventos.push({ tipo: 'bola-bola', t: this.t, a: a.id, b: b.id, velocidade });
    }
  }

  /**
   * Impulso `normal` ao longo de n̂ (de a para b) mais o tangencial no ponto de
   * contato, contra o escorregamento, limitado por μ(v)·`jn` e pelo que zera o
   * escorregamento.
   */
  private impulsoBolas(a: BolaMotor, b: BolaMotor, nx: number, nz: number, normal: number, jn: number): void {
    const c = this.config;
    const ra = a.raio;
    const rb = b.raio;
    // Velocidade de cada ponto de contato: v + ω × r, com r = ±R·n̂.
    const rx = a.vx + a.wy * ra * nz - (b.vx - b.wy * rb * nz);
    const ry = ra * (a.wz * nx - a.wx * nz) + rb * (b.wz * nx - b.wx * nz);
    const rz = a.vz - a.wy * ra * nx - (b.vz + b.wy * rb * nx);
    const rn = rx * nx + rz * nz;
    const sx = rx - rn * nx;
    const sy = ry;
    const sz = rz - rn * nz;
    const s = Math.sqrt(sx * sx + sy * sy + sz * sz);
    let px = -normal * nx;
    let py = 0;
    let pz = -normal * nz;
    if (s > 0) {
      const mu = c.atritoBolaBolaRapido + (c.atritoBolaBolaLento - c.atritoBolaBolaRapido) * Math.exp(-c.atritoBolaBolaQueda * s);
      const jt = Math.min(mu * jn, s / (3.5 / a.massa + 3.5 / b.massa));
      px -= (jt * sx) / s;
      py -= (jt * sy) / s;
      pz -= (jt * sz) / s;
    }

    a.vx += px / a.massa;
    a.vz += pz / a.massa;
    b.vx -= px / b.massa;
    b.vz -= pz / b.massa;
    // ω += r × P / I; para a, r = Ra·n̂ e impulso P; para b, r = −Rb·n̂ e impulso −P: os dois dão R·(n̂ × P).
    const tx = -nz * py;
    const ty = nz * px - nx * pz;
    const tz = nx * py;
    a.wx += (ra * tx) / a.inercia;
    a.wy += (ra * ty) / a.inercia;
    a.wz += (ra * tz) / a.inercia;
    b.wx += (rb * tx) / b.inercia;
    b.wy += (rb * ty) / b.inercia;
    b.wz += (rb * tz) / b.inercia;
  }

  /** Afasta duas bolas que terminaram um choque sobrepostas. */
  private separar(a: BolaMotor, b: BolaMotor): void {
    const dx = b.px - a.px;
    const dz = b.pz - a.pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    const falta = a.raio + b.raio + SEPARACAO - d;
    if (falta <= 0) return;
    a.px -= (dx / d) * (falta / 2);
    a.pz -= (dz / d) * (falta / 2);
    b.px += (dx / d) * (falta / 2);
    b.pz += (dz / d) * (falta / 2);
  }

  /**
   * Choque com a tabela (Han 2005, como no pooltool): o nariz toca a bola acima
   * do centro, em `k̂ = cos θ·(−n̂) + sen θ·ŷ`; impulso normal `(1+e)·m·c` e
   * tangencial contra o escorregamento no contato, limitado por μ e pela aderência.
   * A parte vertical do impulso vai para o pano.
   */
  private choqueTabela(b: BolaMotor, nx: number, nz: number, tabela: number): void {
    const vNormal = -(b.vx * nx + b.vz * nz);
    if (vNormal <= 0) return;
    const c = this.config;
    const R = b.raio;
    const kx = -b.cosTabela * nx;
    const ky = b.senTabela;
    const kz = -b.cosTabela * nz;
    const aproximacao = b.cosTabela * vNormal;
    const rx = R * kx;
    const ry = R * ky;
    const rz = R * kz;
    const vix = b.vx + b.wy * rz - b.wz * ry;
    const viy = b.wz * rx - b.wx * rz;
    const viz = b.vz + b.wx * ry - b.wy * rx;
    const vik = vix * kx + viy * ky + viz * kz;
    const sx = vix - vik * kx;
    const sy = viy - vik * ky;
    const sz = viz - vik * kz;
    const s = Math.sqrt(sx * sx + sy * sy + sz * sz);
    const pn = (1 + c.restituicaoBolaTabela) * b.massa * aproximacao;
    let px = -pn * kx;
    let py = -pn * ky;
    let pz = -pn * kz;
    if (s > 0) {
      const pt = Math.min((2 * b.massa * s) / 7, c.atritoBolaTabela * pn);
      px -= (pt * sx) / s;
      py -= (pt * sy) / s;
      pz -= (pt * sz) / s;
    }
    b.vx += px / b.massa;
    b.vz += pz / b.massa;
    b.wx += (ry * pz - rz * py) / b.inercia;
    b.wy += (rz * px - rx * pz) / b.inercia;
    b.wz += (rx * py - ry * px) / b.inercia;
    this.classificar(b, false);
    if (vNormal >= c.velocidadeMinimaChoque) this.eventos.push({ tipo: 'bola-tabela', t: this.t, bola: b.id, tabela, velocidade: vNormal });
  }

  /** Rede de segurança: bola que escapou da mesa sem cair numa caçapa. */
  private conferirForaDaMesa(): void {
    for (const b of this.bolas) {
      if (!b.naMesa) continue;
      if (Math.abs(b.px) > this.limiteX + 2 * b.raio || Math.abs(b.pz) > this.limiteZ + 2 * b.raio) {
        this.retirar(b);
        this.eventos.push({ tipo: 'fora-da-mesa', t: this.t, bola: b.id });
      }
    }
  }

  /**
   * Decide o estado pela velocidade do ponto de contato com o pano, `u = v + R·(ŷ × ω)`.
   * Depois de um choque (`podeParar` falso) a bola lenta não é zerada: o choque
   * acabou de lhe dar essa velocidade e zerá-la deixaria a outra bola batendo de
   * novo no mesmo instante, sem fim. Ela para sozinha pelo atrito.
   */
  private classificar(b: BolaMotor, podeParar = true): void {
    const c = this.config;
    const ux = b.vx + b.raio * b.wz;
    const uz = b.vz - b.raio * b.wx;
    const vp2 = c.velocidadeParada * c.velocidadeParada;
    const parada = podeParar && b.vx * b.vx + b.vz * b.vz < vp2 && b.raio * b.raio * (b.wx * b.wx + b.wz * b.wz) < vp2;
    if (parada) {
      b.vx = b.vz = b.wx = b.wz = 0;
      if (this.pararGiro(b) === PARADA) this.parou(b, 0);
    } else if (ux * ux + uz * uz > TOL_ESCORREGAMENTO * TOL_ESCORREGAMENTO) {
      b.mov = DESLIZANDO;
    } else {
      b.wx = b.vz / b.raio;
      b.wz = -b.vx / b.raio;
      b.mov = ROLANDO;
    }
  }

  /** Bola sem translação: girando no lugar ou parada. Devolve o novo estado. */
  private pararGiro(b: BolaMotor): number {
    if (Math.abs(b.wy) > this.config.angularParada) {
      b.mov = GIRANDO;
    } else {
      b.wy = 0;
      b.mov = PARADA;
    }
    return b.mov;
  }

  /** Equações fechadas de cada estado por `tau` segundos, trocando de estado no instante exato. */
  private evoluir(b: BolaMotor, tau: number): void {
    const c = this.config;
    const g = c.gravidade;
    let resto = tau;
    while (resto > 0) {
      if (b.mov === PARADA) return;
      if (b.mov === GIRANDO) {
        const h = Math.min(resto, Math.abs(b.wy) / c.desaceleracaoGiro);
        const wyMedio = this.decairGiro(b, h);
        girar(b, 0, wyMedio, 0, h);
        resto -= h;
        if (b.wy === 0) {
          b.mov = PARADA;
          this.parou(b, tau - resto);
        }
        continue;
      }
      if (b.mov === DESLIZANDO) {
        const ux = b.vx + b.raio * b.wz;
        const uz = b.vz - b.raio * b.wx;
        const u = Math.sqrt(ux * ux + uz * uz);
        if (u <= TOL_ESCORREGAMENTO) {
          this.classificar(b);
          if (b.mov === DESLIZANDO) b.mov = ROLANDO;
          continue;
        }
        const a = c.atritoDeslizamento * g;
        const tRolar = (2 * u) / (7 * a);
        const h = Math.min(resto, tRolar);
        const ex = ux / u;
        const ez = uz / u;
        // dω/dt = (5/2)·(μs·g/R)·(ŷ × û), com ŷ × û = (ûz, 0, −ûx).
        const alfa = (2.5 * a) / b.raio;
        const wxMedio = b.wx + 0.5 * alfa * ez * h;
        const wzMedio = b.wz - 0.5 * alfa * ex * h;
        const wyMedio = this.decairGiro(b, h);
        girar(b, wxMedio, wyMedio, wzMedio, h);
        b.px += b.vx * h - 0.5 * a * h * h * ex;
        b.pz += b.vz * h - 0.5 * a * h * h * ez;
        b.vx -= a * h * ex;
        b.vz -= a * h * ez;
        b.wx += alfa * ez * h;
        b.wz -= alfa * ex * h;
        resto -= h;
        if (h === tRolar) {
          b.wx = b.vz / b.raio;
          b.wz = -b.vx / b.raio;
          if (b.vx === 0 && b.vz === 0) {
            if (this.pararGiro(b) === PARADA) this.parou(b, tau - resto);
          } else {
            b.mov = ROLANDO;
          }
        }
        continue;
      }
      // ROLANDO
      const v = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
      if (v === 0) {
        b.wx = b.wz = 0;
        if (this.pararGiro(b) === PARADA) this.parou(b, tau - resto);
        continue;
      }
      const a = c.atritoRolamento * g;
      const tParar = v / a;
      const h = Math.min(resto, tParar);
      const ex = b.vx / v;
      const ez = b.vz / v;
      const vMedio = v - 0.5 * a * h;
      const wyMedio = this.decairGiro(b, h);
      girar(b, (vMedio * ez) / b.raio, wyMedio, (-vMedio * ex) / b.raio, h);
      b.px += b.vx * h - 0.5 * a * h * h * ex;
      b.pz += b.vz * h - 0.5 * a * h * h * ez;
      resto -= h;
      if (h === tParar) {
        b.vx = b.vz = b.wx = b.wz = 0;
        if (this.pararGiro(b) === PARADA) this.parou(b, tau - resto);
      } else {
        b.vx -= a * h * ex;
        b.vz -= a * h * ez;
        b.wx = b.vz / b.raio;
        b.wz = -b.vx / b.raio;
      }
    }
  }

  /** Giro em torno de Y cai a taxa constante; devolve o ωy médio no intervalo. */
  private decairGiro(b: BolaMotor, h: number): number {
    const w = b.wy;
    if (w === 0 || h === 0) return w;
    const queda = this.config.desaceleracaoGiro * h;
    if (Math.abs(w) <= queda) {
      b.wy = 0;
      return (w * Math.abs(w)) / (2 * queda);
    }
    b.wy = w - Math.sign(w) * queda;
    return w - (Math.sign(w) * queda) / 2;
  }

  private parou(b: BolaMotor, decorrido: number): void {
    this.tUltimaParada = Math.max(this.tUltimaParada, this.t + decorrido);
  }
}

/** O pacote não depende de DOM nem de Node: usa o console do ambiente, se houver. */
function avisar(mensagem: string): void {
  (globalThis as { console?: { warn(mensagem: string): void } }).console?.warn(mensagem);
}

/**
 * Primeiro instante em que dois círculos (centros a `(dx, dz)` um do outro,
 * velocidade relativa `(dvx, dvz)`) ficam a `distancia`; `Infinity` se não se aproximam.
 */
function instanteDeContato(dx: number, dz: number, dvx: number, dvz: number, distancia: number): number {
  const aproxima = dx * dvx + dz * dvz;
  if (aproxima >= -TOL_APROXIMACAO * distancia) return Infinity;
  const folga = dx * dx + dz * dz - distancia * distancia;
  if (folga <= 2 * distancia * TOL_CONTATO) return 0;
  const v2 = dvx * dvx + dvz * dvz;
  const disc = aproxima * aproxima - v2 * folga;
  if (disc < 0) return Infinity;
  return folga / (-aproxima + Math.sqrt(disc));
}

/** Gira a orientação por `ω·h` (ω no referencial da mesa, multiplica à esquerda). */
function girar(b: BolaMotor, wx: number, wy: number, wz: number, h: number): void {
  const w = Math.sqrt(wx * wx + wy * wy + wz * wz);
  const angulo = w * h;
  if (angulo === 0) return;
  const s = Math.sin(angulo / 2) / w;
  const ax = wx * s;
  const ay = wy * s;
  const az = wz * s;
  const aw = Math.cos(angulo / 2);
  const { qx, qy, qz, qw } = b;
  const x = aw * qx + ax * qw + ay * qz - az * qy;
  const y = aw * qy - ax * qz + ay * qw + az * qx;
  const z = aw * qz + ax * qy - ay * qx + az * qw;
  const ww = aw * qw - ax * qx - ay * qy - az * qz;
  const n = Math.sqrt(x * x + y * y + z * z + ww * ww);
  b.qx = x / n;
  b.qy = y / n;
  b.qz = z / n;
  b.qw = ww / n;
}
