import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, MESA_BAR, TACO, bolaParada, type EstadoMesa } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { poseDaCameraDeTacada } from '../controles/camera-tacada';
import { ElevacaoDoTaco, obstaculosDaMesa } from '../controles/elevacao-do-taco';
import { apoioEm } from './apoio';
import { MaosDoJogador, type EntradaDasMaos, type EsferaMutavel } from './maos-do-jogador';
import { maoDoArtista, metaDoArtista } from './para-testes';
import { projetorDeAgulha } from './projetor';

const R = CONFIG_FISICA_PADRAO.bolao.raio;
const r = CONFIG_FISICA_PADRAO.bola.raio;
const HZ = MESA_BAR.largura / 2;
const REPOUSO = CONFIG_WEB.tacada.recuoInicial;
const RECUO_MAXIMO = CONFIG_WEB.tacada.recuoMaximo;
const obstaculos = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
const cfg = CONFIG_WEB.maos;
const BASE = await maoDoArtista();
const META = metaDoArtista();
const PASSO = 1 / 60;

function quadro(x: number, z: number, angulo: number, recuo: number) {
  const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x, z })] };
  const elevacaoDoTaco = new ElevacaoDoTaco(obstaculos, TACO, R, r, CONFIG_WEB.elevacaoDoTaco);
  elevacaoDoTaco.definirBolas(mesa);
  const elevacao = elevacaoDoTaco.atualizar(1, angulo, 0, 0, recuo, x, z);
  const p = poseDaCameraDeTacada({ x, y: R, z, angulo, elevacaoDoTaco: elevacao, recuo, zoom: 1 }, CONFIG_WEB.camera.tacada, { raioBolao: R, taco: TACO });
  const projetor = projetorDeAgulha([p.x, p.y, p.z], [p.olharX, p.olharY, p.olharZ], CONFIG_WEB.camera.campoDeVisaoGraus, 16 / 9);
  const entrada: EntradaDasMaos = { x, y: R, z, angulo, elevacao, recuo, lateral: 0, vertical: 0, ativas: true, soAPonte: false };
  const protegidas: EsferaMutavel[] = [{ x, y: R, z, r: R }];
  return { mesa, entrada, projetor, protegidas };
}

function novas(sorteio: () => number = () => 0.1): MaosDoJogador {
  const m = new MaosDoJogador(cfg, obstaculos, R, REPOUSO, RECUO_MAXIMO, sorteio);
  m.calibrar(BASE.modelo, META);
  return m;
}

/** Roda `s` segundos de quadros com o taco em `recuo`, a mesma mira. */
function rodar(m: MaosDoJogador, q: ReturnType<typeof quadro>, s: number): void {
  m.definirBolas(q.mesa, r);
  for (let t = 0; t < s - 1e-9; t += PASSO) m.atualizar(PASSO, q.entrada, q.projetor, q.protegidas);
}

describe('MaosDoJogador: a mão de trás vive', () => {
  it('puxando o taco o pulso fica para trás; parado, assenta em zero', () => {
    const m = novas();
    const parado = quadro(-0.4, 0.1, 0, REPOUSO);
    rodar(m, parado, 0.5);
    expect(m.pulso).toBe(0);
    m.definirBolas(parado.mesa, r);
    let recuo = REPOUSO;
    for (let i = 0; i < 12; i++) {
      recuo += 0.004;
      const q = quadro(-0.4, 0.1, 0, recuo);
      m.atualizar(PASSO, q.entrada, q.projetor, q.protegidas);
    }
    expect(m.pulso).toBeGreaterThan(0.02);
    rodar(m, quadro(-0.4, 0.1, 0, recuo), 3);
    expect(Math.abs(m.pulso)).toBeLessThan(1e-3);
  });

  it('na batida a mão aperta, e depois relaxa', () => {
    const m = novas();
    let recuo = RECUO_MAXIMO;
    rodar(m, quadro(-0.4, 0.1, 0, recuo), 0.3);
    expect(m.aperto).toBe(0);
    for (let i = 0; i < 6; i++) {
      recuo -= 0.04;
      const q = quadro(-0.4, 0.1, 0, recuo);
      m.atualizar(PASSO, q.entrada, q.projetor, q.protegidas);
    }
    expect(m.aperto).toBeGreaterThan(0.9);
    rodar(m, quadro(-0.4, 0.1, 0, recuo), cfg.vida.aperto.seguirS + cfg.vida.aperto.soltaS + 0.2);
    expect(m.aperto).toBe(0);
  });

  it('depois de `ocio.aposS` com a mira parada, a mão de trás tamborila; mexer a mira para', () => {
    const m = novas();
    const q = quadro(-0.4, 0.1, 0, REPOUSO);
    rodar(m, q, cfg.vida.ocio.aposS - 1);
    expect(m.tamborilando).toBe(false);
    rodar(m, q, 1.5);
    expect(m.tamborilando).toBe(true);
    const mexida = quadro(-0.4, 0.1, 0.1, REPOUSO);
    m.atualizar(PASSO, mexida.entrada, mexida.projetor, mexida.protegidas);
    expect(m.tamborilando).toBe(false);
  });

  it('com as mãos fora de cena a contagem do tédio e o balanço do pulso começam de novo', () => {
    const m = novas();
    const q = quadro(-0.4, 0.1, 0, REPOUSO);
    rodar(m, q, cfg.vida.ocio.aposS + 1);
    expect(m.tamborilando).toBe(true);
    const fora = { ...q.entrada, ativas: false };
    for (let i = 0; i < 60; i++) m.atualizar(PASSO, fora, q.projetor, q.protegidas);
    expect(m.escala).toBe(0);
    expect(m.tamborilando).toBe(false);
    expect(m.pulso).toBe(0);
  });
});

describe('MaosDoJogador: reações à jogada', () => {
  it('bola que cai: uma reação da ponte (o sorteio decide qual) e as mãos pedem para ficar em cena', () => {
    const m = novas(() => 0.1);
    rodar(m, quadro(-0.4, 0.1, 0, REPOUSO), 0.5);
    expect(m.reacao).toBeNull();
    expect(m.reagir('caiu')).toBe(true);
    expect(m.reacao?.gesto).toBe('joinha');
    expect(m.reacaoNoAr).toBe(true);
  });

  it('a reação acaba sozinha depois da duração e `cancelarReacao` a larga já', () => {
    const m = novas();
    const q = quadro(-0.4, 0.1, 0, REPOUSO);
    rodar(m, q, 0.5);
    m.reagir('quase');
    expect(m.reacao?.gesto).toBe('quase');
    rodar(m, q, cfg.reacoes.duracaoMaximaS + 0.1);
    expect(m.reacao).toBeNull();
    expect(m.reacaoNoAr).toBe(false);
    m.reagir('caiu');
    m.cancelarReacao();
    expect(m.reacao).toBeNull();
  });

  it('o tapinha cai na moldura mais perto da mão da ponte', () => {
    const m = novas();
    const q = quadro(0.8, HZ - 0.2, -Math.PI / 2, REPOUSO);
    rodar(m, q, 0.5);
    expect(m.reagir('falta')).toBe(true);
    expect(m.reacao?.gesto).toBe('tapinha');
    expect(m.tapinha.naMoldura).toBe(true);
    expect(apoioEm(obstaculos, m.tapinha.x, m.tapinha.z).tipo).toBe('moldura');
    expect(Math.abs(m.tapinha.z)).toBeGreaterThan(HZ);
  });

  it('a falta que a regra acusa depois da gravação não bate de novo na mesma jogada', () => {
    const m = novas();
    rodar(m, quadro(-0.4, 0.1, 0, REPOUSO), 0.3);
    m.comecarJogada();
    expect(m.reagir('falta')).toBe(true);
    rodar(m, quadro(-0.4, 0.1, 0, REPOUSO), 3);
    expect(m.reagir('falta')).toBe(false);
  });

  it('antes de o arquivo chegar não há o que reagir', () => {
    const m = new MaosDoJogador(cfg, obstaculos, R, REPOUSO, RECUO_MAXIMO, () => 0.1);
    expect(m.reagir('caiu')).toBe(false);
    expect(m.reacao).toBeNull();
  });

  it('as reações não alocam: os mesmos objetos a cada quadro', () => {
    const m = novas();
    const q = quadro(-0.4, 0.1, 0, REPOUSO);
    rodar(m, q, 0.3);
    const tapinha = m.tapinha;
    m.reagir('falta');
    const reacao = m.reacao;
    rodar(m, q, 0.3);
    expect(m.reacao).toBe(reacao);
    expect(m.tapinha).toBe(tapinha);
  });
});
