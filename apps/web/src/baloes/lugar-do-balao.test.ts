import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, MESA_BAR, TACO, bolaParada, cacapas, type EstadoMesa } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { poseDaCameraDeTacada } from '../controles/camera-tacada';
import { ElevacaoDoTaco, obstaculosDaMesa } from '../controles/elevacao-do-taco';
import type { Esfera } from '../maos/esferas';
import { MaosDoJogador, type EntradaDasMaos, type EsferaMutavel } from '../maos/maos-do-jogador';
import { poseVaziaDeMao, tapaAlgumaBola } from '../maos/pose-das-maos';
import { projetorDeAgulha, type PontoProjetado } from '../maos/projetor';
import { PosicionadorDoBalao, bocasDaMesa, esferasDoBalao, lugarVazioDoBalao } from './lugar-do-balao';

const R = CONFIG_FISICA_PADRAO.bolao.raio;
const r = CONFIG_FISICA_PADRAO.bola.raio;
const HX = MESA_BAR.comprimento / 2;
const HZ = MESA_BAR.largura / 2;
const grausParaRad = Math.PI / 180;
const ZOOMS = [CONFIG_WEB.camera.zoomMin, 1, CONFIG_WEB.camera.zoomMax] as const;
const REPOUSO = CONFIG_WEB.tacada.recuoInicial;
const obstaculos = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
const cfg = CONFIG_WEB.baloes;
const bocas = bocasDaMesa(MESA_BAR);

const POSICOES: readonly (readonly [string, number, number])[] = [
  ['meio da mesa', -0.4, 0.1],
  ['colada na tabela de lado (+Z)', 0.1, HZ - R],
  ['colada na tabela de lado (−Z)', 0.3, -(HZ - R)],
  ['colada na cabeceira (−X)', -(HX - R), 0.05],
  ['colada na tabela do fundo (+X)', HX - R, -0.1],
  ['no canto (−X, +Z)', -(HX - R - 0.02), HZ - R - 0.02],
  ['no canto (+X, −Z)', HX - R - 0.02, -(HZ - R - 0.02)],
  ['quase no canto', -(HX - 0.12), HZ - 0.12],
];

/** O quadro do outro jogador visto daqui: o taco dele, a câmera atrás dele, as mãos dele e o balão que o posicionador escolhe. */
function cena(x: number, z: number, angulo: number, zoom: number) {
  const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x, z })] };
  const elevacaoDoTaco = new ElevacaoDoTaco(obstaculos, TACO, R, r, CONFIG_WEB.elevacaoDoTaco);
  elevacaoDoTaco.definirBolas(mesa);
  const elevacao = elevacaoDoTaco.atualizar(1, angulo, 0, 0, REPOUSO, x, z);
  const p = poseDaCameraDeTacada({ x, y: R, z, angulo, elevacaoDoTaco: elevacao, recuo: REPOUSO, zoom }, CONFIG_WEB.camera.tacada, { raioBolao: R, taco: TACO });
  const projetor = projetorDeAgulha([p.x, p.y, p.z], [p.olharX, p.olharY, p.olharZ], CONFIG_WEB.camera.campoDeVisaoGraus, 16 / 9);
  const entrada: EntradaDasMaos = { x, y: R, z, angulo, elevacao, recuo: REPOUSO, lateral: 0, vertical: 0, ativas: true, soAPonte: false };
  const protegidas: EsferaMutavel[] = [
    { x, y: R, z, r: R },
    { x: x + Math.cos(angulo) * 0.3, y: r, z: z + Math.sin(angulo) * 0.3, r },
  ];
  const maos = new MaosDoJogador(CONFIG_WEB.maos, obstaculos, R, REPOUSO, CONFIG_WEB.tacada.recuoMaximo, () => 0.1);
  maos.definirBolas(mesa, r);
  maos.atualizar(1, entrada, projetor, protegidas);
  maos.atualizar(1, entrada, projetor, protegidas);
  return { projetor, protegidas, maos, camera: p };
}

describe('PosicionadorDoBalao com a câmera de verdade', () => {
  it('em todo lugar da mesa, mirando em volta, nos três zooms: acha lugar e o balão cabe na tela, longe da câmera, sem tapar a branca, a mirada nem uma das seis bocas', () => {
    const pos = new PosicionadorDoBalao(cfg, bocas);
    const lugar = lugarVazioDoBalao();
    const pose = poseVaziaDeMao();
    const esferas = esferasDoBalao(cfg.corpo.altura, cfg.corpo.raio);
    const ponto: PontoProjetado = { x: 0, y: 0, profundidade: 0 };
    const porZoom = new Map<number, { achou: number; total: number }>();
    const semLugar: string[] = [];
    for (const [nome, x, z] of POSICOES) {
      for (const zoom of ZOOMS) {
        for (let graus = 0; graus < 360; graus += 15) {
          const c = cena(x, z, graus * grausParaRad, zoom);
          pos.reiniciar();
          pos.escolher(c.maos.punho, graus * grausParaRad, c.projetor, c.protegidas, lugar);
          const conta = porZoom.get(zoom) ?? { achou: 0, total: 0 };
          porZoom.set(zoom, conta);
          conta.total++;
          const rotulo = `${nome} zoom ${zoom} ${graus}°`;
          if (!lugar.ok) {
            semLugar.push(rotulo);
            continue;
          }
          conta.achou++;
          expect(c.projetor.projetar(lugar.x, lugar.y, lugar.z, ponto), rotulo).toBe(true);
          expect(ponto.profundidade, `${rotulo}: perto demais da câmera`).toBeGreaterThanOrEqual(cfg.posicao.distanciaMinimaDaCamera);
          expect(Math.abs(ponto.x), `${rotulo}: fora da tela (x)`).toBeLessThanOrEqual(cfg.posicao.margemDaTela);
          expect(Math.abs(ponto.y), `${rotulo}: fora da tela (y)`).toBeLessThanOrEqual(cfg.posicao.margemDaTela);
          pose.x = lugar.x;
          pose.y = lugar.y;
          pose.z = lugar.z;
          expect(tapaAlgumaBola(esferas as readonly Esfera[], pose, c.protegidas, c.projetor, 0), `${rotulo}: balão sobre a bola`).toBe(false);
          expect(tapaAlgumaBola(esferas as readonly Esfera[], pose, bocas, c.projetor, 0), `${rotulo}: balão sobre uma boca de caçapa`).toBe(false);
        }
      }
    }
    console.log([...porZoom].map(([z, c]) => `zoom ${z}: ${c.achou}/${c.total}`).join(' | '), semLugar.filter((x) => !x.includes('zoom 0.4')).slice(0, 12).join('; '));
    // Do zoom padrão para longe quase sempre há lugar; com a câmera colada no taco (zoom mínimo) o balão fica de fora e as mãos seguem.
    for (const [zoom, c] of porZoom) if (zoom >= 1) expect(c.achou / c.total, `zoom ${zoom}: ${semLugar.slice(0, 8).join('; ')}`).toBeGreaterThan(0.9);
  });

  it('o balão fica ao lado e acima da mão de trás, não em cima do taco', () => {
    const c = cena(-0.4, 0.1, 0, 1);
    const lugar = lugarVazioDoBalao();
    new PosicionadorDoBalao(cfg).escolher(c.maos.punho, 0, c.projetor, c.protegidas, lugar);
    expect(lugar.ok).toBe(true);
    expect(lugar.y - c.maos.punho.y).toBeGreaterThanOrEqual(cfg.posicao.altura - 1e-9);
    expect(Math.abs(lugar.z - c.maos.punho.z)).toBeGreaterThanOrEqual(cfg.posicao.lado - 1e-9);
  });

  it('não troca de lado quadro a quadro: o lado em que ficou continua o preferido', () => {
    const c = cena(-0.4, 0.1, 0, 1);
    const pos = new PosicionadorDoBalao(cfg);
    const a = lugarVazioDoBalao();
    pos.escolher(c.maos.punho, 0, c.projetor, c.protegidas, a);
    const ladoDaPrimeira = a.lado;
    for (let i = 0; i < 5; i++) {
      pos.escolher(c.maos.punho, 0, c.projetor, c.protegidas, a);
      expect(a.lado).toBe(ladoDaPrimeira);
    }
  });
});

describe('bocasDaMesa', () => {
  it('são as seis caçapas: o círculo de queda de cada uma, no nível do pano', () => {
    expect(bocas).toHaveLength(6);
    const quedas = cacapas(MESA_BAR).map((c) => c.queda);
    bocas.forEach((b, i) => {
      expect(b.x).toBeCloseTo(quedas[i]!.centro.x, 9);
      expect(b.z).toBeCloseTo(quedas[i]!.centro.z, 9);
      expect(b.r).toBeCloseTo(quedas[i]!.raio, 9);
      expect(b.y).toBe(0);
    });
  });
});

describe('o balão de quem joga, menor (ajuste do L23)', () => {
  it('o corpo e a cordinha têm no máximo 60% do que tinham, e o balão do fim segue do mesmo tamanho (o fator cresceu junto)', () => {
    expect(cfg.corpo.altura).toBeLessThanOrEqual(0.11 * 0.6 + 1e-9);
    expect(cfg.corpo.raio).toBeLessThanOrEqual(0.075 * 0.6 + 1e-9);
    expect(cfg.corpo.cordinha).toBeLessThanOrEqual(0.12 * 0.6 + 1e-9);
    // o balão do fim: altura do corpo × fator = 0,11 × 2,6 de antes
    expect(cfg.corpo.altura * cfg.fim.tamanho).toBeCloseTo(0.11 * 2.6, 3);
  });

  it('no zoom padrão ele ocupa no máximo ~125 × 190 px a 1280×720, em qualquer lugar da mesa e mirando para qualquer lado', () => {
    const pos = new PosicionadorDoBalao(cfg, bocas);
    const lugar = lugarVazioDoBalao();
    const ponto: PontoProjetado = { x: 0, y: 0, profundidade: 0 };
    let maiorLargura = 0;
    let maiorAltura = 0;
    let achou = 0;
    for (const [nome, x, z] of POSICOES) {
      for (let graus = 0; graus < 360; graus += 15) {
        const c = cena(x, z, graus * grausParaRad, 1);
        pos.reiniciar();
        pos.escolher(c.maos.punho, graus * grausParaRad, c.projetor, c.protegidas, lugar);
        if (!lugar.ok) continue;
        achou++;
        c.projetor.projetar(lugar.x, lugar.y, lugar.z, ponto);
        const largura = ((2 * cfg.corpo.raio * c.projetor.escala) / (ponto.profundidade * c.projetor.aspecto)) * 640;
        const altura = ((2 * cfg.corpo.altura * c.projetor.escala) / ponto.profundidade) * 360;
        maiorLargura = Math.max(maiorLargura, largura);
        maiorAltura = Math.max(maiorAltura, altura);
        expect(largura, `${nome} ${graus}°: largura do corpo`).toBeLessThanOrEqual(125);
        expect(altura, `${nome} ${graus}°: altura do corpo`).toBeLessThanOrEqual(190);
      }
    }
    expect(achou).toBeGreaterThan(100);
    console.log(`balão do outro, zoom padrão: corpo até ${maiorLargura.toFixed(0)} × ${maiorAltura.toFixed(0)} px`);
  });
});

