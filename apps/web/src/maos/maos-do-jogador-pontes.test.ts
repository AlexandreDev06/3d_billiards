import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, MESA_BAR, TACO, bolaParada, type EstadoMesa } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { poseDaCameraDeTacada } from '../controles/camera-tacada';
import { ElevacaoDoTaco, obstaculosDaMesa } from '../controles/elevacao-do-taco';
import { alturaDoApoioEm, apoioEm } from './apoio';
import { eixoDoTaco } from './eixo';
import { MaosDoJogador, type EntradaDasMaos, type EsferaMutavel } from './maos-do-jogador';
import { DEDOS_LONGOS, maoDoArtista, peleDaPonte, pontasNoMundo } from './para-testes';
import { PONTES, poseDaPonteNomeada, type NomeDaPonte } from './pontes';
import { projetorDeAgulha } from './projetor';

const R = CONFIG_FISICA_PADRAO.bolao.raio;
const r = CONFIG_FISICA_PADRAO.bola.raio;
const HX = MESA_BAR.comprimento / 2;
const HZ = MESA_BAR.largura / 2;
const REPOUSO = CONFIG_WEB.tacada.recuoInicial;
const RECUO_MAXIMO = CONFIG_WEB.tacada.recuoMaximo;
const obstaculos = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
const cfg = CONFIG_WEB.maos;
const BASE = await maoDoArtista();
const MODELO = BASE.modelo;

type Quadro = ReturnType<typeof quadro>;

/** Um quadro do laço do jogo: a branca em (`x`, `z`), mirando em `angulo`, com o taco puxado `recuo` e `outras` bolas na mesa. */
function quadro(x: number, z: number, angulo: number, recuo: number, outras: readonly (readonly [number, number])[] = [], vertical = 0) {
  const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x, z }), ...outras.map(([ox, oz], i) => bolaParada(i + 1, { x: ox, z: oz }))] };
  const elevacaoDoTaco = new ElevacaoDoTaco(obstaculos, TACO, R, r, CONFIG_WEB.elevacaoDoTaco);
  elevacaoDoTaco.definirBolas(mesa);
  const elevacao = elevacaoDoTaco.atualizar(1, angulo, 0, vertical, recuo, x, z);
  const p = poseDaCameraDeTacada({ x, y: R, z, angulo, elevacaoDoTaco: elevacao, recuo, zoom: 1 }, CONFIG_WEB.camera.tacada, { raioBolao: R, taco: TACO });
  const projetor = projetorDeAgulha([p.x, p.y, p.z], [p.olharX, p.olharY, p.olharZ], CONFIG_WEB.camera.campoDeVisaoGraus, 16 / 9);
  const entrada: EntradaDasMaos = { x, y: R, z, angulo, elevacao, recuo, lateral: 0, vertical, ativas: true, soAPonte: false };
  const protegidas: EsferaMutavel[] = [
    { x, y: R, z, r: R },
    { x: x + Math.cos(angulo) * 0.3, y: r, z: z + Math.sin(angulo) * 0.3, r },
  ];
  return { mesa, entrada, projetor, protegidas, elevacao };
}

function novasMaos(): MaosDoJogador {
  const m = new MaosDoJogador(cfg, obstaculos, R, REPOUSO, RECUO_MAXIMO, () => 0.1);
  m.calibrar(MODELO);
  return m;
}

/** As mãos já assentadas no quadro (a primeira conta põe a ponte de uma vez; a segunda, com `dt` grande, termina qualquer troca). */
function assentadas(q: Quadro): MaosDoJogador {
  const m = novasMaos();
  m.definirBolas(q.mesa, r);
  m.atualizar(1, q.entrada, q.projetor, q.protegidas);
  m.atualizar(1, q.entrada, q.projetor, q.protegidas);
  return m;
}

/** O que cada ponte do artista pede do lugar. O taco que corre de x−0,4 para +x tem a mão atrás, em −x. */
const CASOS: readonly { ponte: NomeDaPonte; nome: string; quadro: () => Quadro }[] = [
  { ponte: 'v', nome: 'bola longe de tudo, taco parado', quadro: () => quadro(-0.4, 0.1, 0, REPOUSO) },
  { ponte: 'laco', nome: 'bola longe de tudo, taco puxado a fundo', quadro: () => quadro(-0.4, 0.1, 0, RECUO_MAXIMO) },
  { ponte: 'elevada', nome: 'outra bola logo atrás da branca', quadro: () => quadro(-0.4, 0.1, 0, REPOUSO, [[-0.4 - 0.09, 0.1]]) },
  { ponte: 'tabela', nome: 'branca perto da tabela, taco quase de frente para ela', quadro: () => quadro(0.5, HZ - 0.05, -0.9, REPOUSO) },
  { ponte: 'colada', nome: 'branca na tabela, taco raspando nela', quadro: () => quadro(-0.3, HZ - R, -0.25, REPOUSO) },
  { ponte: 'canto', nome: 'branca no canto', quadro: () => quadro(-(HX - R - 0.03), HZ - R - 0.03, -Math.PI / 4, REPOUSO) },
];

describe('MaosDoJogador: qual ponte, em cada lugar', () => {
  it.each(CASOS)('$nome: $ponte', ({ ponte, quadro: montar }) => {
    const m = assentadas(montar());
    expect(m.ponteVisivel).toBe(true);
    expect(m.ponteAtual).toBe(ponte);
  });

  it('o laço entra puxando e só volta ao V quando a força cai abaixo de `laco.sai`', () => {
    const m = novasMaos();
    const solto = quadro(-0.4, 0.1, 0, REPOUSO);
    m.definirBolas(solto.mesa, r);
    m.atualizar(1, solto.entrada, solto.projetor, solto.protegidas);
    expect(m.ponteAtual).toBe('v');
    const fracao = (f: number): Quadro => quadro(-0.4, 0.1, 0, REPOUSO + f * (RECUO_MAXIMO - REPOUSO));
    const passo = (f: number, segundos = 1): void => {
      const q = fracao(f);
      m.atualizar(segundos, q.entrada, q.projetor, q.protegidas);
    };
    passo(cfg.escolha.laco.entra + 0.05);
    expect(m.ponteAtual).toBe('laco');
    // Entre `sai` e `entra`: fica no laço.
    passo((cfg.escolha.laco.sai + cfg.escolha.laco.entra) / 2);
    expect(m.ponteAtual).toBe('laco');
    passo(cfg.escolha.laco.sai - 0.1);
    expect(m.ponteAtual).toBe('v');
  });

  it('uma ponte nova só vale depois de `troca.permanenciaS` com a anterior (a mão não treme onde dois lugares se encontram)', () => {
    const m = novasMaos();
    const solto = quadro(-0.4, 0.1, 0, REPOUSO);
    const puxado = quadro(-0.4, 0.1, 0, RECUO_MAXIMO);
    m.definirBolas(solto.mesa, r);
    m.atualizar(1 / 60, solto.entrada, solto.projetor, solto.protegidas);
    m.atualizar(1 / 60, puxado.entrada, puxado.projetor, puxado.protegidas);
    expect(m.ponteAtual, 'logo depois de pousar, a ponte ainda não troca').toBe('v');
    for (let t = 0; t < cfg.escolha.troca.permanenciaS + 0.1; t += 1 / 60) m.atualizar(1 / 60, puxado.entrada, puxado.projetor, puxado.protegidas);
    expect(m.ponteAtual).toBe('laco');
  });

  it('trocar de ponte é uma troca com arco: a de onde saiu, a duração, e a mão pousa no fim', () => {
    const solto = quadro(-0.4, 0.1, 0, REPOUSO);
    const puxado = quadro(-0.4, 0.1, 0, RECUO_MAXIMO);
    const n = novasMaos();
    n.definirBolas(solto.mesa, r);
    n.atualizar(1, solto.entrada, solto.projetor, solto.protegidas);
    n.atualizar(cfg.escolha.troca.permanenciaS + 0.01, puxado.entrada, puxado.projetor, puxado.protegidas);
    expect(n.ponteAtual).toBe('laco');
    expect(n.troca.ativa).toBe(true);
    expect(n.troca.de).toBe('v');
    n.atualizar(cfg.escolha.troca.duracaoS / 2, puxado.entrada, puxado.projetor, puxado.protegidas);
    expect(n.troca.progresso).toBeGreaterThan(0.4);
    expect(n.troca.progresso).toBeLessThan(0.6);
    n.atualizar(cfg.escolha.troca.duracaoS, puxado.entrada, puxado.projetor, puxado.protegidas);
    expect(n.troca.ativa).toBe(false);
  });

  it('o giz pede o V: com a mão em outra ponte, ela troca para o V e só então `podeGiz`', () => {
    const q = quadro(-0.4, 0.1, 0, RECUO_MAXIMO);
    const m = assentadas(q);
    expect(m.ponteAtual).toBe('laco');
    expect(m.podeGiz).toBe(false);
    m.pedirGiz(true);
    m.atualizar(1 / 60, q.entrada, q.projetor, q.protegidas);
    expect(m.ponteAtual).toBe('v');
    expect(m.podeGiz).toBe(false);
    m.atualizar(1, q.entrada, q.projetor, q.protegidas);
    expect(m.podeGiz).toBe(true);
    m.pedirGiz(false);
  });
});

describe.each(PONTES)('MaosDoJogador: ponte %s no lugar dela', (ponte) => {
  const caso = CASOS.find((c) => c.ponte === ponte)!;
  const nomeDaPose = poseDaPonteNomeada(ponte);

  it('as pontas dos dedos não afundam mais de 1 mm no que há embaixo delas', () => {
    const m = assentadas(caso.quadro());
    expect(m.ponteAtual).toBe(ponte);
    const pontas = pontasNoMundo(m.calibradaAtual, Array.from(m.dobrasDaPonte), m.ponte, nomeDaPose);
    for (const d of DEDOS_LONGOS) {
      const chao = apoioEm(obstaculos, pontas[d].x, pontas[d].z).altura;
      if (chao === -Infinity) continue;
      expect(pontas[d].y - chao, d).toBeGreaterThan(-0.001);
    }
  });

  it('o taco passa pela mão sem atravessar a pele (a menos de 10 mm) e a pele não afunda mais de 8 mm no apoio', () => {
    const q = caso.quadro();
    const m = assentadas(q);
    const pele = peleDaPonte(m.calibradaAtual, BASE, Array.from(m.dobrasDaPonte), nomeDaPose);
    const eixo = eixoDoTaco(q.entrada.x, R, q.entrada.z, R, q.entrada.angulo, q.elevacao, q.entrada.recuo, 0, 0);
    const p = m.ponte;
    const wx = p.dy * p.uz - p.dz * p.uy;
    const wy = p.dz * p.ux - p.dx * p.uz;
    const wz = p.dx * p.uy - p.dy * p.ux;
    const l = { x: 0, y: 0, z: 0 };
    let pior = 0;
    let menorVao = Infinity;
    for (let v = 0; v < pele.length; v += 3) {
      m.calibradaAtual.local(pele[v]!, pele[v + 1]!, pele[v + 2]!, l);
      const px = p.x + l.x * p.dx + l.y * p.ux + l.z * wx;
      const py = p.y + l.x * p.dy + l.y * p.uy + l.z * wy;
      const pz = p.z + l.x * p.dz + l.y * p.uz + l.z * wz;
      const mx = px - eixo.px;
      const my = py - eixo.py;
      const mz = pz - eixo.pz;
      const ao = -(mx * eixo.dx + my * eixo.dy + mz * eixo.dz);
      const d = Math.hypot(mx + eixo.dx * ao, my + eixo.dy * ao, mz + eixo.dz * ao);
      const raio = TACO.raioPonta + ((TACO.raioBase - TACO.raioPonta) * Math.max(ao, 0)) / TACO.comprimento;
      pior = Math.max(pior, raio - d);
      const chao = alturaDoApoioEm(obstaculos, px, pz);
      if (chao !== -Infinity) menorVao = Math.min(menorVao, py - chao);
    }
    expect(pior).toBeLessThan(0.01);
    expect(menorVao).toBeGreaterThan(-0.008);
  });

  it('a pele não entra na branca (a menos de 2 mm)', () => {
    const q = caso.quadro();
    const m = assentadas(q);
    const pele = peleDaPonte(m.calibradaAtual, BASE, Array.from(m.dobrasDaPonte), nomeDaPose);
    const p = m.ponte;
    const wx = p.dy * p.uz - p.dz * p.uy;
    const wy = p.dz * p.ux - p.dx * p.uz;
    const wz = p.dx * p.uy - p.dy * p.ux;
    const l = { x: 0, y: 0, z: 0 };
    let menor = Infinity;
    for (let v = 0; v < pele.length; v += 3) {
      m.calibradaAtual.local(pele[v]!, pele[v + 1]!, pele[v + 2]!, l);
      const px = p.x + l.x * p.dx + l.y * p.ux + l.z * wx;
      const py = p.y + l.x * p.dy + l.y * p.uy + l.z * wy;
      const pz = p.z + l.x * p.dz + l.y * p.uz + l.z * wz;
      menor = Math.min(menor, Math.hypot(px - q.entrada.x, py - R, pz - q.entrada.z) - R);
    }
    expect(menor).toBeGreaterThan(-0.002);
  });
});

describe('MaosDoJogador: a ponte acompanha o taco', () => {
  it('o V sobe e desce com o efeito vertical: a mão segue a altura do taco', () => {
    const baixo = assentadas(quadro(-0.4, 0.1, 0, REPOUSO, [], -0.8));
    const alto = assentadas(quadro(-0.4, 0.1, 0, REPOUSO, [], 0.8));
    expect(baixo.ponteAtual).toBe('v');
    expect(alto.ponteAtual).toBe('v');
    expect(alto.ponte.y).toBeGreaterThan(baixo.ponte.y + 0.003);
  });

  it('a elevada fica mais alta que o V: o taco sobe por cima da bola', () => {
    const v = assentadas(quadro(-0.4, 0.1, 0, REPOUSO));
    const e = assentadas(quadro(-0.4, 0.1, 0, REPOUSO, [[-0.4 - 0.09, 0.1]]));
    expect(e.ponteAtual).toBe('elevada');
    expect(e.ponte.y).toBeGreaterThan(v.ponte.y);
  });

  it('as poses e o estado são os mesmos objetos a cada quadro, em qualquer ponte', () => {
    for (const caso of CASOS) {
      const q = caso.quadro();
      const m = assentadas(q);
      const ponte = m.ponte;
      const troca = m.troca;
      const dobras = m.dobrasDaPonte;
      m.atualizar(1 / 60, q.entrada, q.projetor, q.protegidas);
      expect(m.ponte).toBe(ponte);
      expect(m.troca).toBe(troca);
      expect(m.dobrasDaPonte).toBe(dobras);
    }
  });
});
