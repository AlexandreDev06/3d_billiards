import type { ConfigMaos } from '../config';
import { pontoDoTaco, type EixoDoTaco, type Vec3 } from './eixo';
import type { Esfera } from './esferas';
import { noMundo, poseDoPunho, poseVaziaDeMao, type PoseDeMao } from './pose-das-maos';
import type { PontoProjetado, Projetor } from './projetor';

/** O retângulo que uma mão ocupa na tela (NDC: x e y de -1 a 1) e o mais perto que ela chega da câmera (m, pelo centro das esferas). */
export interface CaixaNaTela {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  maisPerto: number;
}

export function caixaVazia(): CaixaNaTela {
  return { minX: 0, maxX: 0, minY: 0, maxY: 0, maisPerto: Infinity };
}

const projetada: PontoProjetado = { x: 0, y: 0, profundidade: 0 };
const centro: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * O retângulo na tela dos discos das esferas de uma mão na `pose`. Falso, sem escrever em `saida`, se alguma esfera está atrás da
 * câmera (a mão já passou dela).
 */
export function caixaDasEsferas(esferas: readonly Esfera[], pose: PoseDeMao, projetor: Projetor, saida: CaixaNaTela): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let maisPerto = Infinity;
  for (const e of esferas) {
    noMundo(pose, e.x, e.y, e.z, centro);
    if (!projetor.projetar(centro.x, centro.y, centro.z, projetada)) return false;
    const raio = (e.r * projetor.escala) / projetada.profundidade;
    const raioX = raio / projetor.aspecto;
    if (projetada.x - raioX < minX) minX = projetada.x - raioX;
    if (projetada.x + raioX > maxX) maxX = projetada.x + raioX;
    if (projetada.y - raio < minY) minY = projetada.y - raio;
    if (projetada.y + raio > maxY) maxY = projetada.y + raio;
    if (projetada.profundidade < maisPerto) maisPerto = projetada.profundidade;
  }
  saida.minX = minX;
  saida.maxX = maxX;
  saida.minY = minY;
  saida.maxY = maxY;
  saida.maisPerto = maisPerto;
  return true;
}

/** Que parte da altura da caixa está acima da borda de baixo da tela (1 = inteira, 0 = fora). */
export function fracaoVisivel(c: CaixaNaTela): number {
  const altura = c.maxY - c.minY;
  if (altura <= 0) return 0;
  return Math.min(Math.max((c.maxY + 1) / altura, 0), 1);
}

/** A distância vertical na tela (NDC) da base de `cima` ao topo de `baixo`: negativa quando uma entra na outra. */
export function folgaVertical(cima: CaixaNaTela, baixo: CaixaNaTela): number {
  return cima.minY - baixo.maxY;
}

export function caixasSeSobrepoem(a: CaixaNaTela, b: CaixaNaTela): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

const CRITERIO_VISIVEL = 0;
const CRITERIO_FOLGA = 1;

const pose = poseVaziaDeMao();
const ponto: Vec3 = { x: 0, y: 0, z: 0 };
const caixa = caixaVazia();
const conta: {
  eixo: EixoDoTaco | null;
  projetor: Projetor | null;
  cfg: ConfigMaos['punho'] | null;
  esferas: readonly Esfera[];
  ponte: CaixaNaTela | null;
} = { eixo: null, projetor: null, cfg: null, esferas: [], ponte: null };

/** Põe a caixa da mão a `q` m da ponta; falso se ela está atrás da câmera. */
function colocar(q: number): boolean {
  pontoDoTaco(conta.eixo!, q, ponto);
  poseDoPunho(conta.eixo!, ponto, conta.cfg!, pose);
  return caixaDasEsferas(conta.esferas, pose, conta.projetor!, caixa);
}

/** A fração da mão à mostra a `q` m da ponta (0 se está atrás da câmera ou mais perto dela que o permitido). */
function fracaoEm(q: number): number {
  if (!colocar(q) || caixa.maisPerto < conta.cfg!.distanciaMinimaDaCamera) return 0;
  return fracaoVisivel(caixa);
}

/**
 * O critério vale com a mão a `q` m da ponta do taco? `CRITERIO_VISIVEL`: aparece pelo menos `limite` (fração dela); `CRITERIO_FOLGA`:
 * sobra `limite` (fração da altura da tela) de pano até a ponte. Cada um é verdadeiro de um lado de algum `q` e falso do outro.
 */
function vale(criterio: number, q: number, limite: number): boolean {
  if (criterio === CRITERIO_FOLGA) return !colocar(q) || folgaVertical(conta.ponte!, caixa) >= 2 * limite;
  return fracaoEm(q) >= limite;
}

/** O maior `q` em [`a`, `b`] em que o critério vale (ele vale até um ponto e deixa de valer): `a` se nem em `a` vale. */
function maiorEmQueVale(criterio: number, limite: number, a: number, b: number): number {
  if (vale(criterio, b, limite)) return b;
  if (!vale(criterio, a, limite)) return a;
  let sim = a;
  let nao = b;
  for (let i = 0; i < 14; i++) {
    const meio = (sim + nao) / 2;
    if (vale(criterio, meio, limite)) sim = meio;
    else nao = meio;
  }
  return sim;
}

/** O menor `q` em [`a`, `b`] em que o critério vale (ele não vale até um ponto e passa a valer): `b` se nem em `b` vale. */
function menorEmQueVale(criterio: number, limite: number, a: number, b: number): number {
  if (vale(criterio, a, limite)) return a;
  if (!vale(criterio, b, limite)) return b;
  let nao = a;
  let sim = b;
  for (let i = 0; i < 14; i++) {
    const meio = (nao + sim) / 2;
    if (vale(criterio, meio, limite)) sim = meio;
    else nao = meio;
  }
  return sim;
}

/** Onde a mão de trás segura o taco e se ela cabe na tela. */
export interface LugarDaMaoDeTras {
  /** Distância da ponta do taco à mão (m). */
  agarre: number;
  /** Com o taco em repouso a mão aparece pelo menos `visivelMinima` e ainda deixa `folgaMinima` até a ponte; falso: ela fica fora do quadro. */
  cabe: boolean;
}

export function lugarVazio(): LugarDaMaoDeTras {
  return { agarre: 0, cabe: true };
}

/**
 * Onde a mão de trás segura o taco (m da ponta), pela regra da tela: ela fica no fundo, centrada na linha do taco e cortada pela
 * borda de baixo, só com os nós dos dedos e o dorso à mostra (`visivelAlvo`, fração dela), e a pelo menos `folgaDaPonte` (fração da altura da tela) de pano livre
 * abaixo da mão da ponte (`ponte`, o retângulo dela na tela; `null` se ela não aparece). O lugar sai do taco em repouso
 * (`eixoDeRepouso`) e a câmera: com o taco ali, onde a mão tem a fração pedida ou, se a ponte estiver perto, mais para trás, até a
 * folga sobrar. Nunca passa do punho de verdade (`agarre`).
 *
 * A mão nunca desce a ponto de ter menos de `visivelMinima` à mostra. Se com isso a folga cai abaixo de `folgaMinima` (a câmera colada
 * na ponte, ou o taco curto demais para a distância), `cabe` fica falso: a mão está fora do quadro e não se desenha, em vez de se
 * amontoar com a ponte.
 *
 * Com o taco puxado (`eixoAtual`) a mão recua com ele, descendo na tela; para de descer em `visivelPuxada` (fração dela, ou a que já
 * tinha, se menor), e daí em diante desliza pelo taco para a ponta, para nunca sumir de vez. A distância a que a câmera deixa a mão chegar também vale
 * (`distanciaMinimaDaCamera`). Sem alocar.
 */
export function agarreDaMaoDeTras(
  eixoDeRepouso: EixoDoTaco,
  eixoAtual: EixoDoTaco,
  projetor: Projetor,
  cfg: ConfigMaos['punho'],
  esferasDaMao: readonly Esfera[],
  ponte: CaixaNaTela | null,
  saida: LugarDaMaoDeTras,
): LugarDaMaoDeTras {
  conta.projetor = projetor;
  conta.cfg = cfg;
  conta.esferas = esferasDaMao;
  conta.ponte = ponte;
  conta.eixo = eixoDeRepouso;
  let q = maiorEmQueVale(CRITERIO_VISIVEL, cfg.visivelAlvo, cfg.agarreMinimo, cfg.agarre);
  if (ponte !== null) q = Math.max(q, menorEmQueVale(CRITERIO_FOLGA, cfg.folgaDaPonte, q, cfg.agarre));
  // Descer mais que a fração mínima à mostra é sumir: se a folga pedida não cabe, a mão fica onde ainda aparece.
  q = Math.min(q, maiorEmQueVale(CRITERIO_VISIVEL, cfg.visivelMinima, cfg.agarreMinimo, cfg.agarre));
  const noRepouso = fracaoEm(q);
  saida.cabe = noRepouso >= cfg.visivelMinima && (ponte === null || vale(CRITERIO_FOLGA, q, cfg.folgaMinima));
  // Puxado, a mão para de descer na fração que `visivelPuxada` pede (ou na que já tinha, se tinha menos) e daí desliza para a ponta.
  if (eixoAtual !== eixoDeRepouso) conta.eixo = eixoAtual;
  const piso = maiorEmQueVale(CRITERIO_VISIVEL, Math.min(cfg.visivelPuxada, noRepouso), cfg.agarreMinimo, cfg.agarre);
  conta.eixo = null;
  conta.projetor = null;
  conta.ponte = null;
  saida.agarre = Math.max(Math.min(q, piso), cfg.agarreMinimo);
  return saida;
}
