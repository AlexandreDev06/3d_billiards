import { ID_BOLAO, type Gravacao } from '@sinuca/fisica';

/**
 * Por que o caminho do bolão acaba:
 * - `parou`: o bolão parou sem tocar em outra bola;
 * - `contato`: tocou a primeira bola (a "segunda colisão", depois do taco);
 * - `cacapa`: caiu numa caçapa ou saiu da mesa;
 * - `limite`: passou do teto de comprimento (ou o buffer encheu).
 */
export type FimDoCaminho = 'parou' | 'contato' | 'cacapa' | 'limite';

export interface ConfigExtracao {
  /** Teto do comprimento do caminho do bolão (m), somando os trechos depois das tabelas. */
  readonly comprimentoMaximo: number;
  /** Comprimento da linha da bola atingida (m). */
  readonly comprimentoBolaAtingida: number;
  /** Distância mínima entre pontos do caminho (m); descarta os quadros de uma bola quase parada. */
  readonly passoMinimo: number;
}

/** A primeira bola que o bolão tocou: de onde sai e para onde vai. `id` = −1 se o bolão não tocou em nenhuma. */
export interface BolaAtingida {
  id: number;
  /** Onde estava no choque (m). */
  x: number;
  z: number;
  /** Direção em que sai (vetor unitário no plano XZ); (0, 0) se quase não se mexeu. */
  dx: number;
  dz: number;
  /** Até onde a linha vai (m): `comprimentoBolaAtingida`, ou menos se a bola para antes; 0 se não se mexeu. */
  comprimento: number;
}

/** Saída reaproveitável de `extrairPrevisao`: pares (x, z) em `pontos[0 .. 2 * quantidade)`. */
export class CaminhoPrevisto {
  readonly pontos: Float32Array;
  quantidade = 0;
  fim: FimDoCaminho = 'parou';
  /** Comprimento do caminho (m). */
  comprimento = 0;
  readonly atingida: BolaAtingida = { id: -1, x: 0, z: 0, dx: 0, dz: 0, comprimento: 0 };

  constructor(readonly capacidade = 1024) {
    this.pontos = new Float32Array(2 * capacidade);
  }

  limpar(): void {
    this.quantidade = 0;
    this.fim = 'parou';
    this.comprimento = 0;
    const a = this.atingida;
    a.id = -1;
    a.x = a.z = a.dx = a.dz = a.comprimento = 0;
  }
}

/** Deslocamento da bola atingida (m) a partir do qual a corda vale como direção. */
const DESLOCAMENTO_MINIMO = 0.005;
const FOLGA_DE_TEMPO = 1e-9;

/**
 * Tira de uma `Gravacao` o que a linha de previsão desenha: o caminho do bolão
 * (do repouso até parar, cair, passar do teto ou tocar a primeira bola, com as
 * tabelas no meio) e a direção em que essa primeira bola sai.
 *
 * Entre dois eventos a bola anda em linha reta; a gravação a 60 Hz cortaria o
 * canto de cada tabela, então a batida entra como ponto próprio, achado
 * prolongando o trecho de chegada (quadros `q − 1` e `q`) até o instante do evento.
 */
export function extrairPrevisao(g: Gravacao, cfg: ConfigExtracao, saida: CaminhoPrevisto = new CaminhoPrevisto()): CaminhoPrevisto {
  saida.limpar();
  const n = g.ids.length;
  const iBolao = g.ids.indexOf(ID_BOLAO);
  if (iBolao < 0 || g.quadros < 1) return saida;
  const f = g.frequencia;
  const ultimo = g.quadros - 1;
  const px = (q: number, i: number): number => g.posicoes[(q * n + i) * 3]!;
  const pz = (q: number, i: number): number => g.posicoes[(q * n + i) * 3 + 2]!;
  const naMesa = (q: number, i: number): boolean => g.naMesa[q * n + i] === 1;

  let tFim = Infinity;
  let motivo: FimDoCaminho = 'parou';
  let outra = -1;
  for (const e of g.eventos) {
    if (e.tipo === 'bola-bola' && (e.a === ID_BOLAO || e.b === ID_BOLAO)) {
      tFim = e.t;
      motivo = 'contato';
      outra = e.a === ID_BOLAO ? e.b : e.a;
      break;
    }
    if ((e.tipo === 'cacapa' || e.tipo === 'fora-da-mesa') && e.bola === ID_BOLAO) {
      tFim = e.t;
      motivo = 'cacapa';
      break;
    }
  }

  let parado = false;
  const adicionar = (x: number, z: number, forcar: boolean): void => {
    if (parado) return;
    const k = saida.quantidade;
    if (k === 0) {
      saida.pontos[0] = x;
      saida.pontos[1] = z;
      saida.quantidade = 1;
      return;
    }
    const ux = saida.pontos[2 * k - 2]!;
    const uz = saida.pontos[2 * k - 1]!;
    const d = Math.hypot(x - ux, z - uz);
    if (d === 0 || (!forcar && d < cfg.passoMinimo)) return;
    if (k >= saida.capacidade) {
      saida.fim = 'limite';
      parado = true;
      return;
    }
    const corta = saida.comprimento + d > cfg.comprimentoMaximo;
    const s = corta ? (cfg.comprimentoMaximo - saida.comprimento) / d : 1;
    saida.pontos[2 * k] = ux + (x - ux) * s;
    saida.pontos[2 * k + 1] = uz + (z - uz) * s;
    saida.quantidade = k + 1;
    saida.comprimento = corta ? cfg.comprimentoMaximo : saida.comprimento + d;
    if (corta) {
      saida.fim = 'limite';
      parado = true;
    }
  };

  // Onde o bolão está no instante `t` de um evento, vindo do trecho reto anterior.
  const antes = { x: 0, z: 0 };
  const posicaoAntes = (t: number, tAnterior: number): void => {
    const q0 = Math.min(Math.floor(t * f + FOLGA_DE_TEMPO), ultimo);
    if (q0 >= 1 && tAnterior <= (q0 - 1) / f + FOLGA_DE_TEMPO) {
      const dt = t - q0 / f;
      antes.x = px(q0, iBolao) + (px(q0, iBolao) - px(q0 - 1, iBolao)) * f * dt;
      antes.z = pz(q0, iBolao) + (pz(q0, iBolao) - pz(q0 - 1, iBolao)) * f * dt;
    } else if (q0 < ultimo) {
      const s = t * f - q0;
      antes.x = px(q0, iBolao) + (px(q0 + 1, iBolao) - px(q0, iBolao)) * s;
      antes.z = pz(q0, iBolao) + (pz(q0 + 1, iBolao) - pz(q0, iBolao)) * s;
    } else {
      antes.x = px(q0, iBolao);
      antes.z = pz(q0, iBolao);
    }
  };

  adicionar(px(0, iBolao), pz(0, iBolao), true);
  let tAnterior = 0;
  let ie = 0;
  const batidasAte = (limite: number): void => {
    for (; ie < g.eventos.length; ie++) {
      const e = g.eventos[ie]!;
      if (e.t > limite) return;
      if (e.tipo !== 'bola-tabela' || e.bola !== ID_BOLAO || e.t >= tFim) continue;
      posicaoAntes(e.t, tAnterior);
      adicionar(antes.x, antes.z, true);
      tAnterior = e.t;
    }
  };

  for (let q = 1; q <= ultimo && !parado; q++) {
    const t = q / f;
    if (t >= tFim || !naMesa(q, iBolao)) break;
    batidasAte(t);
    adicionar(px(q, iBolao), pz(q, iBolao), false);
  }
  if (!parado) {
    batidasAte(Math.min(tFim, g.duracao));
    if (motivo === 'parou') {
      if (naMesa(ultimo, iBolao)) adicionar(px(ultimo, iBolao), pz(ultimo, iBolao), true);
    } else {
      posicaoAntes(tFim, tAnterior);
      adicionar(antes.x, antes.z, true);
    }
  }
  if (!parado) saida.fim = motivo;

  if (motivo === 'contato' && saida.fim === 'contato') medirAtingida(g, outra, tFim, cfg, saida);
  return saida;
}

function medirAtingida(g: Gravacao, id: number, tContato: number, cfg: ConfigExtracao, saida: CaminhoPrevisto): void {
  const i = g.ids.indexOf(id);
  if (i < 0) return;
  const n = g.ids.length;
  const f = g.frequencia;
  const a = saida.atingida;
  const q0 = Math.min(Math.floor(tContato * f + FOLGA_DE_TEMPO), g.quadros - 1);
  a.id = id;
  a.x = g.posicoes[(q0 * n + i) * 3]!;
  a.z = g.posicoes[(q0 * n + i) * 3 + 2]!;
  let alcance = 0;
  let achouDirecao = false;
  for (let q = q0 + 1; q < g.quadros; q++) {
    if (g.naMesa[q * n + i] !== 1) break;
    const dx = g.posicoes[(q * n + i) * 3]! - a.x;
    const dz = g.posicoes[(q * n + i) * 3 + 2]! - a.z;
    const d = Math.hypot(dx, dz);
    if (!achouDirecao && d >= DESLOCAMENTO_MINIMO) {
      a.dx = dx / d;
      a.dz = dz / d;
      achouDirecao = true;
    }
    alcance = Math.max(alcance, d);
    if (d >= cfg.comprimentoBolaAtingida) break;
  }
  a.comprimento = achouDirecao ? Math.min(alcance, cfg.comprimentoBolaAtingida) : 0;
}
