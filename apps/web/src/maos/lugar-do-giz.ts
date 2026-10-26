import type { ConfigMaos } from '../config';
import type { ObstaculosDaMesa } from '../controles/elevacao-do-taco';
import { apoioEm } from './apoio';
import type { PontoProjetado, Projetor } from './projetor';

type ConfigDaBorda = ConfigMaos['giz']['borda'];

/** Onde o cubo de giz fica na moldura: o centro dele (m) e se coube em algum lugar. */
export interface LugarDoCubo {
  ok: boolean;
  x: number;
  y: number;
  z: number;
}

export function lugarVazioDoCubo(): LugarDoCubo {
  return { ok: false, x: 0, y: 0, z: 0 };
}

const ponto: PontoProjetado = { x: 0, y: 0, profundidade: 0 };

/** O cubo, em (`x`, `y`, `z`), aparece na tela dentro da faixa `margemDaTela` e a mais de `distanciaMinimaDaCamera` da câmera? */
export function cuboAparece(x: number, y: number, z: number, projetor: Projetor, cfg: ConfigDaBorda): boolean {
  if (!projetor.projetar(x, y, z, ponto)) return false;
  return Math.abs(ponto.x) <= cfg.margemDaTela && Math.abs(ponto.y) <= cfg.margemDaTela && ponto.profundidade >= cfg.distanciaMinimaDaCamera;
}

/** Onde a semirreta de (`x0`, `z0`) na direção (`dx`, `dz`) cruza o meio da moldura; `null` se não cruza. `eixo` é o da borda cruzada. */
function cruzamentoComAMoldura(x0: number, z0: number, dx: number, dz: number, obst: ObstaculosDaMesa): { x: number; z: number; eixo: 'x' | 'z' } | null {
  const meio = obst.larguraBorracha + obst.larguraMoldura / 2;
  let melhor = Infinity;
  let eixo: 'x' | 'z' = 'z';
  if (Math.abs(dx) > 1e-9) {
    const t = ((dx > 0 ? 1 : -1) * (obst.semiX + meio) - x0) / dx;
    if (t > 0 && t < melhor) {
      melhor = t;
      eixo = 'x';
    }
  }
  if (Math.abs(dz) > 1e-9) {
    const t = ((dz > 0 ? 1 : -1) * (obst.semiZ + meio) - z0) / dz;
    if (t > 0 && t < melhor) {
      melhor = t;
      eixo = 'z';
    }
  }
  return melhor === Infinity ? null : { x: x0 + dx * melhor, z: z0 + dz * melhor, eixo };
}

/**
 * Onde o cubo de giz fica na moldura: do lado esquerdo de quem taca (perpendicular à mira, no meio da moldura da borda que a
 * semirreta cruza), e, se ali não cabe, do direito. Em cada lado, procura ao longo da borda, a partir daquele ponto e alternando
 * para os dois lados, o primeiro lugar com madeira embaixo (não a boca de uma caçapa) e, com `projetor`, que apareça na tela.
 * `lado` é a aresta do cubo (ele assenta com a base na moldura).
 */
export function lugarDoCuboNaBorda(
  bolaX: number,
  bolaZ: number,
  angulo: number,
  lado: number,
  obst: ObstaculosDaMesa,
  cfg: ConfigDaBorda,
  projetor: Projetor | null,
  saida: LugarDoCubo = lugarVazioDoCubo(),
): LugarDoCubo {
  const sen = Math.sin(angulo);
  const cos = Math.cos(angulo);
  const passos = Math.ceil(cfg.alcance / cfg.passo);
  const y = obst.alturaMoldura + lado / 2;
  for (const lateral of [1, -1]) {
    const dx = sen * lateral;
    const dz = -cos * lateral;
    const alvo = cruzamentoComAMoldura(bolaX, bolaZ, dx, dz, obst);
    if (!alvo) continue;
    // A borda corre ao longo de X quando o cruzamento é na borda de Z, e ao longo de Z no outro.
    const tx = alvo.eixo === 'z' ? 1 : 0;
    const tz = alvo.eixo === 'z' ? 0 : 1;
    for (let k = 0; k <= 2 * passos; k++) {
      const deslocamento = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * cfg.passo;
      const x = alvo.x + tx * deslocamento;
      const z = alvo.z + tz * deslocamento;
      if (apoioEm(obst, x, z).tipo !== 'moldura') continue;
      // O cubo inteiro, não só o centro, tem de estar na madeira.
      if (apoioEm(obst, x + lado, z).tipo !== 'moldura' || apoioEm(obst, x - lado, z).tipo !== 'moldura' || apoioEm(obst, x, z + lado).tipo !== 'moldura' || apoioEm(obst, x, z - lado).tipo !== 'moldura') continue;
      if (projetor !== null && !cuboAparece(x, y, z, projetor, cfg)) continue;
      saida.ok = true;
      saida.x = x;
      saida.y = y;
      saida.z = z;
      return saida;
    }
  }
  saida.ok = false;
  return saida;
}

/** O que o cubo precisa saber de cada quadro. */
export interface EntradaDoLugarDoCubo {
  readonly bolaX: number;
  readonly bolaZ: number;
  readonly angulo: number;
  /** As mãos estão em cena: o cubo aparece. */
  readonly ativo: boolean;
  /** Ninguém mexe nele agora (o gesto do giz não está em curso): pode mudar de lugar. */
  readonly livre: boolean;
}

const fator = (taxa: number, dt: number): number => 1 - Math.exp(-taxa * Math.max(dt, 0));

/**
 * O cubo de giz parado na moldura. Fica onde está enquanto aparece na tela; se a mira gira e ele sai de vista, some, reaparece
 * no lugar novo e só muda de lugar com o gesto parado. `escala` (0 a 1) é o aparecer e sumir; nada aloca por quadro.
 */
export class CuboNaBorda {
  x = 0;
  y = 0;
  z = 0;
  escala = 0;
  /** Tem um lugar escolhido. */
  tem = false;
  private readonly lugar = lugarVazioDoCubo();

  constructor(
    private readonly cfg: ConfigDaBorda,
    private readonly obst: ObstaculosDaMesa,
    private readonly lado: number,
  ) {}

  /** Esquece o lugar (partida nova): o próximo quadro escolhe de novo. */
  reiniciar(): void {
    this.tem = false;
    this.escala = 0;
  }

  atualizar(dt: number, e: EntradaDoLugarDoCubo, projetor: Projetor | null): void {
    let alvo = e.ativo ? 1 : 0;
    if (this.tem && e.livre && e.ativo && projetor !== null && !cuboAparece(this.x, this.y, this.z, projetor, this.cfg)) alvo = 0;
    if (alvo === 1 && !this.tem) {
      lugarDoCuboNaBorda(e.bolaX, e.bolaZ, e.angulo, this.lado, this.obst, this.cfg, projetor, this.lugar);
      if (this.lugar.ok) {
        this.x = this.lugar.x;
        this.y = this.lugar.y;
        this.z = this.lugar.z;
        this.tem = true;
        this.escala = 0;
      } else {
        alvo = 0;
      }
    }
    if (!e.livre) alvo = this.tem ? 1 : 0;
    this.escala += (alvo - this.escala) * fator(3 / this.cfg.aparecerS, dt);
    if (Math.abs(alvo - this.escala) < 0.002) this.escala = alvo;
    // Sumiu por não aparecer: o lugar é refeito no próximo quadro em que ele quiser voltar.
    if (this.escala === 0 && this.tem && (!e.ativo || alvo === 0) && e.livre) this.tem = false;
  }
}
