import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, MESA_BAR, TACO, bolaParada, type EstadoMesa } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { poseDaCameraDeTacada } from '../controles/camera-tacada';
import { ElevacaoDoTaco, obstaculosDaMesa } from '../controles/elevacao-do-taco';
import { alturaDoApoioEm } from './apoio';
import { eixoDoTaco, type EixoDoTaco } from './eixo';
import { MaosDoJogador, type EntradaDasMaos, type EsferaMutavel } from './maos-do-jogador';
import { maoDoArtista, peleNoMundo } from './para-testes';
import { poseDaPonteNomeada } from './pontes';
import { projetorDeAgulha } from './projetor';
const R = CONFIG_FISICA_PADRAO.bolao.raio;
const r = CONFIG_FISICA_PADRAO.bola.raio;
const HZ = MESA_BAR.largura / 2;
const HX = MESA_BAR.comprimento / 2;
const REPOUSO = CONFIG_WEB.tacada.recuoInicial;
const RECUO_MAXIMO = CONFIG_WEB.tacada.recuoMaximo;
const obstaculos = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
const cfg = CONFIG_WEB.maos;
const BASE = await maoDoArtista();
const C = 0.03;
const CENAS_D2: [string, number, number, number][] = [
  ['canto -x+z', -(HX - R - C), HZ - R - C, -Math.PI / 4],
  ['canto +x+z', HX - R - C, HZ - R - C, -3 * Math.PI / 4],
  ['canto -x-z', -(HX - R - C), -(HZ - R - C), Math.PI / 4],
  ['canto +x-z', HX - R - C, -(HZ - R - C), 3 * Math.PI / 4],
  ['meio +z', 0, HZ - R - 0.004, -Math.PI / 2],
  ['meio -z', 0, -(HZ - R - 0.004), Math.PI / 2],
  ['tabela +z', 0.1, HZ - R, -Math.PI / 2],
  ['tabela -z', 0.1, -(HZ - R), Math.PI / 2],
  ['tabela +x', HX - R, 0.1, Math.PI],
  ['tabela -x', -(HX - R), 0.1, 0],
  ['tabela +z puxado', 0.1, HZ - R, -Math.PI / 2],
];
function peleTaco(pele: Float64Array, eixo: EixoDoTaco): number {
  let pior = 0;
  for (let v = 0; v < pele.length; v += 3) {
    const mx = pele[v]! - eixo.px, my = pele[v + 1]! - eixo.py, mz = pele[v + 2]! - eixo.pz;
    const ao = -(mx * eixo.dx + my * eixo.dy + mz * eixo.dz);
    if (ao < -0.01 || ao > TACO.comprimento) continue;
    const d = Math.hypot(mx + eixo.dx * ao, my + eixo.dy * ao, mz + eixo.dz * ao);
    pior = Math.max(pior, TACO.raioPonta + ((TACO.raioBase - TACO.raioPonta) * Math.max(ao, 0)) / TACO.comprimento - d);
  }
  return pior;
}
function avaliar(nome: string, x: number, z: number, angulo: number, recuo = REPOUSO) {
  const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x, z })] };
  const el = new ElevacaoDoTaco(obstaculos, TACO, R, r, CONFIG_WEB.elevacaoDoTaco);
  el.definirBolas(mesa);
  const elevacao = el.atualizar(1, angulo, 0, 0, recuo, x, z);
  const p = poseDaCameraDeTacada({ x, y: R, z, angulo, elevacaoDoTaco: elevacao, recuo, zoom: 1 }, CONFIG_WEB.camera.tacada, { raioBolao: R, taco: TACO });
  const projetor = projetorDeAgulha([p.x, p.y, p.z], [p.olharX, p.olharY, p.olharZ], CONFIG_WEB.camera.campoDeVisaoGraus, 16 / 9);
  const entrada: EntradaDasMaos = { x, y: R, z, angulo, elevacao, recuo, lateral: 0, vertical: 0, ativas: true, soAPonte: false };
  const protegidas: EsferaMutavel[] = [{ x, y: R, z, r: R }, { x: x + Math.cos(angulo) * 0.3, y: r, z: z + Math.sin(angulo) * 0.3, r }];
  const m = new MaosDoJogador(cfg, obstaculos, R, REPOUSO, RECUO_MAXIMO, () => 0.1);
  m.calibrar(BASE.modelo);
  m.definirBolas(mesa, r);
  m.atualizar(1, entrada, projetor, protegidas);
  m.atualizar(1, entrada, projetor, protegidas);
  const pele = peleNoMundo(m.calibradaAtual, BASE, m.ponte, poseDaPonteNomeada(m.ponteAtual), undefined, Array.from(m.dobrasDaPonte));
  let folga = Infinity, entra = 0;
  for (let v = 0; v < pele.length; v += 3) {
    const h = alturaDoApoioEm(obstaculos, pele[v]!, pele[v + 2]!);
    if (h === -Infinity) continue;
    const gap = pele[v + 1]! - h;
    folga = Math.min(folga, gap);
    entra = Math.max(entra, -gap);
  }
  const eixo = eixoDoTaco(x, R, z, R, angulo, elevacao, recuo, 0, 0);
  return { nome, ponte: m.ponteAtual, apoio: m.apoioDaPonte, vis: m.ponteVisivel, dist: m.distanciaDaPonte, elev: (elevacao * 180) / Math.PI, folga, entra, taco: peleTaco(pele, eixo), maos: m, camera: p };
}
const POUSAM = CENAS_D2.filter(([n]) => n === 'tabela +z' || n === 'tabela -z' || n === 'tabela +x' || n === 'tabela -x');
const RARAS = CENAS_D2.filter(([n]) => !POUSAM.some(([q]) => q === n));

describe('L65: a mão da ponte pousa no apoio', () => {
  for (const [n, x, z, a] of POUSAM) {
    it(`${n}: a bola colada na tabela, a mão pousa na moldura e o taco passa na ponte`, () => {
      const e = avaliar(n, x, z, a);
      expect(e.ponte).toBe('tabela');
      expect(e.apoio).not.toBe('ar');
      expect(e.maos.pousaNoApoio).toBe(true);
      expect(e.folga).toBeLessThanOrEqual(0.002);
      expect(e.entra).toBeLessThanOrEqual(0.002);
      expect(e.taco).toBeLessThanOrEqual(0.0025);
    });
  }
  for (const [n, x, z, a] of RARAS) {
    it(`${n}: pose rara, sem apoio possível: diz que não pousa e o taco ainda passa na ponte`, () => {
      const e = avaliar(n, x, z, a, n.includes('puxado') ? REPOUSO + 0.6 * (RECUO_MAXIMO - REPOUSO) : REPOUSO);
      expect(e.maos.pousaNoApoio).toBe(false);
      expect(e.taco).toBeLessThanOrEqual(0.0025);
    });
  }
});
