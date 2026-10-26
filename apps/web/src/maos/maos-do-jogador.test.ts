import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, MESA_BAR, TACO, bolaParada, type EstadoMesa } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { poseDaCameraDeTacada } from '../controles/camera-tacada';
import { ElevacaoDoTaco, obstaculosDaMesa } from '../controles/elevacao-do-taco';
import { alturaDoApoioEm, apoioEm } from './apoio';
import { eixoDoTaco } from './eixo';
import { MaoCalibrada } from './mao-calibrada';
import { DEDOS_LONGOS, maoDoArtista, peleDaPonte, pontasNoMundo } from './para-testes';
import { MaosDoJogador, type EntradaDasMaos, type EsferaMutavel } from './maos-do-jogador';
import { noMundo, tapaAlgumaBola } from './pose-das-maos';
import { caixaDasEsferas, caixaVazia, caixasSeSobrepoem, folgaVertical, fracaoVisivel, type CaixaNaTela } from './lugar-da-mao-de-tras';
import { poseDaPonteNomeada } from './pontes';
import { projetorDeAgulha, type PontoProjetado } from './projetor';

const R = CONFIG_FISICA_PADRAO.bolao.raio;
const r = CONFIG_FISICA_PADRAO.bola.raio;
const HX = MESA_BAR.comprimento / 2;
const HZ = MESA_BAR.largura / 2;
const grausParaRad = Math.PI / 180;
const ZOOMS = [CONFIG_WEB.camera.zoomMin, 1, CONFIG_WEB.camera.zoomMax] as const;
const REPOUSO_DO_RECUO = CONFIG_WEB.tacada.recuoInicial;
const obstaculos = obstaculosDaMesa(MESA_BAR, CONFIG_WEB.mesa);
const cfg = CONFIG_WEB.maos;
const BASE = await maoDoArtista();
const MODELO = BASE.modelo;
const MAO_DE_TRAS = new MaoCalibrada(MODELO, 'punho', cfg.escala, false);
const ESFERAS_DO_PUNHO = MAO_DE_TRAS.esferas('punho');

/** O que o laço do jogo monta num quadro: a elevação do taco, a câmera e a entrada das mãos. */
function quadro(x: number, z: number, angulo: number, zoom: number, recuo: number, outras: readonly (readonly [number, number])[] = []) {
  const mesa: EstadoMesa = { bolas: [bolaParada(ID_BOLAO, { x, z }), ...outras.map(([ox, oz], i) => bolaParada(i + 1, { x: ox, z: oz }))] };
  const elevacaoDoTaco = new ElevacaoDoTaco(obstaculos, TACO, R, r, CONFIG_WEB.elevacaoDoTaco);
  elevacaoDoTaco.definirBolas(mesa);
  const elevacao = elevacaoDoTaco.atualizar(1, angulo, 0, 0, recuo, x, z);
  const p = poseDaCameraDeTacada({ x, y: R, z, angulo, elevacaoDoTaco: elevacao, recuo, zoom }, CONFIG_WEB.camera.tacada, { raioBolao: R, taco: TACO });
  const projetor = projetorDeAgulha([p.x, p.y, p.z], [p.olharX, p.olharY, p.olharZ], CONFIG_WEB.camera.campoDeVisaoGraus, 16 / 9);
  const entrada: EntradaDasMaos = { x, y: R, z, angulo, elevacao, recuo, lateral: 0, vertical: 0, ativas: true, soAPonte: false };
  const protegidas: EsferaMutavel[] = [
    { x, y: R, z, r: R },
    { x: x + Math.cos(angulo) * 0.3, y: r, z: z + Math.sin(angulo) * 0.3, r },
  ];
  return { mesa, entrada, projetor, protegidas, elevacao };
}

/** As mãos do jogo, já medidas (o arquivo da mão do artista chegou). */
function novasMaos(): MaosDoJogador {
  const m = new MaosDoJogador(cfg, obstaculos, R, REPOUSO_DO_RECUO, CONFIG_WEB.tacada.recuoMaximo, () => 0.1);
  m.calibrar(MODELO);
  return m;
}

/** As mãos já em cena (a escala em 1), no quadro dado. */
function maosEm(q: ReturnType<typeof quadro>): MaosDoJogador {
  const m = novasMaos();
  m.definirBolas(q.mesa, r);
  m.atualizar(1, q.entrada, q.projetor, q.protegidas);
  m.atualizar(1, q.entrada, q.projetor, q.protegidas);
  return m;
}

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

describe('MaosDoJogador: a mão da ponte', () => {
  it('no meio da mesa, com o taco de repouso: a ponte pousa no pano, à distância pedida, sobre o eixo do taco', () => {
    const q = quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO);
    const m = maosEm(q);
    expect(m.ponteVisivel).toBe(true);
    expect(m.apoioDaPonte).toBe('pano');
    expect(m.distanciaDaPonte).toBeCloseTo(cfg.ponte.distancia, 6);
    // Sobre o eixo: a mão está a `distancia` do contato, para trás.
    const eixo = eixoDoTaco(-0.4, R, 0.1, R, 0, q.elevacao, REPOUSO_DO_RECUO, 0, 0);
    const contato = { x: eixo.px + eixo.dx * REPOUSO_DO_RECUO, y: eixo.py + eixo.dy * REPOUSO_DO_RECUO, z: eixo.pz + eixo.dz * REPOUSO_DO_RECUO };
    expect(m.ponte.x).toBeCloseTo(contato.x - eixo.dx * cfg.ponte.distancia, 6);
    expect(m.ponte.z).toBeCloseTo(contato.z - eixo.dz * cfg.ponte.distancia, 6);
  });

  it('não sai do lugar quando o taco é puxado ou vai à bola: a mão da ponte está plantada, o taco é que passa por ela', () => {
    const base = maosEm(quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO));
    const x0 = base.ponte.x;
    const z0 = base.ponte.z;
    for (const recuo of [0, 0.1, -0.04]) {
      const q = quadro(-0.4, 0.1, 0, 1, recuo);
      const m = novasMaos();
      m.definirBolas(q.mesa, r);
      m.atualizar(1, q.entrada, q.projetor, q.protegidas);
      m.atualizar(1, q.entrada, q.projetor, q.protegidas);
      expect(m.ponte.x, `recuo ${recuo}`).toBeCloseTo(x0, 5);
      expect(m.ponte.z, `recuo ${recuo}`).toBeCloseTo(z0, 5);
    }
  });

  it('colada na tabela, com o taco por cima dela: a palma nunca enterra na borracha, na moldura nem no pano', () => {
    for (const [nome, x, z] of POSICOES) {
      for (let graus = 0; graus < 360; graus += 15) {
        const q = quadro(x, z, graus * grausParaRad, 1, REPOUSO_DO_RECUO);
        const m = maosEm(q);
        if (!m.ponteVisivel) continue;
        // A base da palma (fundo abaixo do eixo, no quadro da mão) fica acima de tudo o que há embaixo do centro.
        const base = m.ponte.y - m.fundoAtual;
        const apoio = apoioEm(obstaculos, m.ponte.x, m.ponte.z);
        expect(base, `${nome} ${graus}°: palma dentro de ${apoio.tipo}`).toBeGreaterThanOrEqual(apoio.altura - 1e-6);
      }
    }
  });

  it('a ponte sempre cabe em algum lugar, em todas as posições, mirando em volta, nos três zooms', () => {
    for (const [nome, x, z] of POSICOES) {
      for (const zoom of ZOOMS) {
        for (let graus = 0; graus < 360; graus += 15) {
          const m = maosEm(quadro(x, z, graus * grausParaRad, zoom, REPOUSO_DO_RECUO));
          expect(m.ponteVisivel, `${nome} zoom ${zoom} ${graus}°`).toBe(true);
        }
      }
    }
  });

  it('nunca tapa a branca nem a bola mirada: em cada posição, mirando em volta, nos três zooms, parado e puxado', () => {
    for (const [nome, x, z] of POSICOES) {
      for (const zoom of ZOOMS) {
        for (let graus = 0; graus < 360; graus += 15) {
          for (const recuo of [REPOUSO_DO_RECUO, 0.25]) {
            const q = quadro(x, z, graus * grausParaRad, zoom, recuo);
            const m = maosEm(q);
            const rotulo = `${nome} zoom ${zoom} ${graus}° recuo ${recuo}`;
            if (m.ponteVisivel) expect(tapaAlgumaBola(m.esferasAtuais, m.ponte, q.protegidas, q.projetor, 0), `${rotulo}: ponte sobre a bola`).toBe(false);
            if (m.punhoVisivel) expect(tapaAlgumaBola(ESFERAS_DO_PUNHO, m.punho, q.protegidas, q.projetor, 0), `${rotulo}: mão de trás sobre a bola`).toBe(false);
          }
        }
      }
    }
  });

  it('não entra em outra bola: com uma bola no lugar onde a ponte pousaria, ela muda de lugar pelo taco', () => {
    const livre = maosEm(quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO));
    const q = quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO, [[livre.ponte.x, livre.ponte.z + 0.01]]);
    const m = maosEm(q);
    expect(m.ponteVisivel).toBe(true);
    expect(Math.abs(m.distanciaDaPonte - cfg.ponte.distancia)).toBeGreaterThan(cfg.ponte.passo / 2);
    const dx = m.ponte.x - livre.ponte.x;
    const dz = m.ponte.z - livre.ponte.z;
    expect(Math.hypot(dx, dz)).toBeGreaterThan(0.05);
  });
});

/** A mão de trás e a ponte, como a tela as vê (retângulos em NDC). `null` onde a mão de trás está fora do quadro. */
function caixasNaTela(m: MaosDoJogador, projetor: ReturnType<typeof quadro>['projetor']): { ponte: CaixaNaTela; punho: CaixaNaTela } | null {
  if (!m.ponteVisivel || !m.punhoVisivel) return null;
  const ponte = caixaVazia();
  const punho = caixaVazia();
  if (!caixaDasEsferas(m.esferasAtuais, m.ponte, projetor, ponte) || !caixaDasEsferas(ESFERAS_DO_PUNHO, m.punho, projetor, punho)) return null;
  return { ponte, punho };
}

describe('MaosDoJogador: a mão de trás', () => {
  it('as duas mãos nunca se sobrepõem na tela: em cada posição, mirando em volta, nos três zooms, com o taco parado e puxado', () => {
    let vistas = 0;
    for (const [nome, x, z] of POSICOES) {
      for (const zoom of ZOOMS) {
        for (let graus = 0; graus < 360; graus += 15) {
          for (const recuo of [REPOUSO_DO_RECUO, 0.15, 0.25]) {
            const q = quadro(x, z, graus * grausParaRad, zoom, recuo);
            const caixas = caixasNaTela(maosEm(q), q.projetor);
            if (caixas === null) continue;
            vistas++;
            const rotulo = `${nome} zoom ${zoom} ${graus}° recuo ${recuo}`;
            // Uma ponte toda abaixo da borda da tela (a câmera colada nela) não disputa lugar com a mão de trás.
            if (caixas.ponte.maxY <= -1) continue;
            expect(caixasSeSobrepoem(caixas.ponte, caixas.punho), `${rotulo}: as mãos se amontoam`).toBe(false);
            expect(folgaVertical(caixas.ponte, caixas.punho), `${rotulo}: pano livre entre as mãos`).toBeGreaterThanOrEqual(2 * cfg.punho.folgaMinima - 1e-3);
          }
        }
      }
    }
    // Fora do zoom mínimo a mão de trás aparece quase sempre: a regra não vale por esconder a mão.
    expect(vistas).toBeGreaterThan(0.55 * POSICOES.length * ZOOMS.length * 24 * 3);
  });

  it('com o zoom padrão ou mais longe, o pano livre entre as mãos é de 12% da altura da tela, salvo onde a mão já está no mínimo à mostra', () => {
    for (const [nome, x, z] of POSICOES) {
      for (const zoom of [1.6, 2, CONFIG_WEB.camera.zoomMax]) {
        for (let graus = 0; graus < 360; graus += 15) {
          for (const recuo of [REPOUSO_DO_RECUO, 0.25]) {
            const q = quadro(x, z, graus * grausParaRad, zoom, recuo);
            const caixas = caixasNaTela(maosEm(q), q.projetor);
            expect(caixas, `${nome} zoom ${zoom} ${graus}° recuo ${recuo}: a mão de trás sumiu`).not.toBeNull();
            if (caixas === null || caixas.ponte.maxY <= -1 || fracaoVisivel(caixas.punho) <= cfg.punho.visivelMinima + 1e-3) continue;
            expect(folgaVertical(caixas.ponte, caixas.punho), `${nome} zoom ${zoom} ${graus}° recuo ${recuo}`).toBeGreaterThanOrEqual(2 * cfg.punho.folgaDaPonte - 1e-3);
          }
        }
      }
    }
  });

  it('no zoom padrão, parada, ela fica no fundo da tela, cortada pela borda de baixo, com uma fração da mão à mostra', () => {
    for (const [nome, x, z] of POSICOES) {
      for (let graus = 0; graus < 360; graus += 30) {
        const q = quadro(x, z, graus * grausParaRad, 1, REPOUSO_DO_RECUO);
        const caixas = caixasNaTela(maosEm(q), q.projetor);
        if (caixas === null) continue;
        const rotulo = `${nome} ${graus}°`;
        expect(fracaoVisivel(caixas.punho), rotulo).toBeGreaterThanOrEqual(cfg.punho.visivelMinima - 1e-3);
        expect(fracaoVisivel(caixas.punho), rotulo).toBeLessThanOrEqual(cfg.punho.visivelAlvo + 1e-3);
        expect(caixas.punho.minY, rotulo).toBeLessThan(-1);
      }
    }
  });

  it('no meio da mesa, no zoom padrão, ela fica cortada pela borda de baixo, com ao menos a fração mínima à mostra, e centrada na linha do taco', () => {
    const q = quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO);
    const caixas = caixasNaTela(maosEm(q), q.projetor)!;
    expect(caixas).not.toBeNull();
    expect(fracaoVisivel(caixas.punho)).toBeGreaterThanOrEqual(cfg.punho.visivelMinima - 1e-3);
    expect(fracaoVisivel(caixas.punho)).toBeLessThan(0.5);
    const meio = (caixas.punho.minX + caixas.punho.maxX) / 2;
    const meioDaPonte = (caixas.ponte.minX + caixas.ponte.maxX) / 2;
    expect(Math.abs(meio - meioDaPonte)).toBeLessThan(0.2);
  });

  it('puxado o taco, ela recua com ele até a fração mínima e daí desliza para a ponta: nunca some (se aparecia parado) e nunca invade a ponte', () => {
    for (const [nome, x, z] of POSICOES) {
      for (const zoom of [1, 1.3, 2]) {
        for (let graus = 0; graus < 360; graus += 30) {
          const parado = quadro(x, z, graus * grausParaRad, zoom, REPOUSO_DO_RECUO);
          const mParado = maosEm(parado);
          for (const recuo of [0.1, 0.18, 0.25]) {
            const puxado = quadro(x, z, graus * grausParaRad, zoom, recuo);
            const m = maosEm(puxado);
            const rotulo = `${nome} zoom ${zoom} ${graus}° recuo ${recuo}`;
            if (!mParado.punhoVisivel) continue;
            const caixas = caixasNaTela(m, puxado.projetor);
            if (caixas === null) {
              // Sem pano entre as mãos ela sai do quadro, e só onde a ponte já chega perto da borda de baixo.
              const ponte = caixaVazia();
              expect(caixaDasEsferas(m.esferasAtuais, m.ponte, puxado.projetor, ponte), `${rotulo}: sumiu`).toBe(true);
              expect(ponte.minY, `${rotulo}: sumiu com a ponte alta`).toBeLessThan(-0.8);
              continue;
            }
            expect(fracaoVisivel(caixas.punho), rotulo).toBeGreaterThanOrEqual(cfg.punho.visivelMinima - 1e-3);
          }
        }
      }
    }
  });

  it('no meio da mesa, no zoom padrão, puxada a força toda a mão ainda mostra visivelPuxada dela e continua longe da ponte', () => {
    const q = quadro(-0.4, 0.1, 0, 1, CONFIG_WEB.tacada.recuoMaximo);
    const caixas = caixasNaTela(maosEm(q), q.projetor)!;
    expect(caixas).not.toBeNull();
    expect(fracaoVisivel(caixas.punho)).toBeGreaterThanOrEqual(cfg.punho.visivelPuxada - 1e-3);
    expect(caixasSeSobrepoem(caixas.ponte, caixas.punho)).toBe(false);
  });

  it('com a câmera colada na ponte (zoom mínimo) não há lugar para ela: fica fora do quadro e a ponte aparece', () => {
    const q = quadro(-0.4, 0.1, 0, CONFIG_WEB.camera.zoomMin, REPOUSO_DO_RECUO);
    const m = maosEm(q);
    expect(m.punhoVisivel).toBe(false);
    expect(m.ponteVisivel).toBe(true);
  });

  it('segura o taco à frente da câmera e dentro da largura da tela', () => {
    for (const [nome, x, z] of POSICOES) {
      for (const zoom of ZOOMS) {
        for (let graus = 0; graus < 360; graus += 30) {
          const q = quadro(x, z, graus * grausParaRad, zoom, REPOUSO_DO_RECUO);
          const m = maosEm(q);
          const tela: PontoProjetado = { x: 0, y: 0, profundidade: 0 };
          expect(q.projetor.projetar(m.punho.x, m.punho.y, m.punho.z, tela), `${nome} zoom ${zoom} ${graus}°: atrás da câmera`).toBe(true);
          expect(Math.abs(tela.x), `${nome} zoom ${zoom} ${graus}°: fora da tela`).toBeLessThan(1);
          expect(m.agarre).toBeLessThanOrEqual(cfg.punho.agarre + 1e-9);
          expect(m.agarre).toBeGreaterThanOrEqual(cfg.punho.agarreMinimo - 1e-9);
        }
      }
    }
  });

  it('câmera mais longe (zoom maior): a mão segura mais para trás do taco', () => {
    const perto = maosEm(quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO));
    const longe = maosEm(quadro(-0.4, 0.1, 0, 2, REPOUSO_DO_RECUO));
    expect(longe.agarre).toBeGreaterThan(perto.agarre);
  });

  it('acompanha o taco: puxar o taco 10 cm leva a mão 10 cm para trás, o agarre é o mesmo (com a mão toda à mostra, sem o piso segurar)', () => {
    const parado = maosEm(quadro(-0.4, 0.1, 0, CONFIG_WEB.camera.zoomMax, REPOUSO_DO_RECUO));
    const puxado = maosEm(quadro(-0.4, 0.1, 0, CONFIG_WEB.camera.zoomMax, REPOUSO_DO_RECUO + 0.1));
    expect(puxado.agarre).toBeCloseTo(parado.agarre, 6);
    const passou = Math.hypot(puxado.punho.x - parado.punho.x, puxado.punho.y - parado.punho.y, puxado.punho.z - parado.punho.z);
    expect(passou).toBeCloseTo(0.1, 6);
    expect(puxado.punho.x).toBeLessThan(parado.punho.x);
  });

  it('na batida e no seguimento (recuo negativo) a mão passa pela ponte e vai além dela, sem sair do taco', () => {
    const batida = maosEm(quadro(-0.4, 0.1, 0, 1, -0.04));
    const parado = maosEm(quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO));
    expect(batida.punho.x).toBeGreaterThan(parado.punho.x);
  });

  it('sem câmera, segura o punho de verdade e não confere nada', () => {
    const q = quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO);
    const m = novasMaos();
    m.definirBolas(q.mesa, r);
    m.atualizar(1, q.entrada, null, []);
    m.atualizar(1, q.entrada, null, []);
    expect(m.agarre).toBeCloseTo(cfg.punho.agarre, 9);
    expect(m.punhoVisivel).toBe(true);
    expect(m.ponteVisivel).toBe(true);
  });
});

describe('MaosDoJogador: aparecer e sumir', () => {
  it('nascem sumidas, crescem até a escala 1 e voltam a sumir quando o taco some, sem pular', () => {
    const q = quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO);
    const m = novasMaos();
    m.definirBolas(q.mesa, r);
    expect(m.escala).toBe(0);
    const escalas: number[] = [];
    for (let i = 0; i < 40; i++) {
      m.atualizar(1 / 60, q.entrada, q.projetor, q.protegidas);
      escalas.push(m.escala);
    }
    expect(escalas[0]).toBeGreaterThan(0);
    expect(escalas[escalas.length - 1]).toBe(1);
    for (let i = 1; i < escalas.length; i++) expect(escalas[i]!).toBeGreaterThanOrEqual(escalas[i - 1]!);
    // Passo a passo: nenhum quadro cresce mais que um terço do total.
    for (let i = 1; i < escalas.length; i++) expect(escalas[i]! - escalas[i - 1]!).toBeLessThan(0.34);
    const sai = { ...q.entrada, ativas: false };
    const descendo: number[] = [];
    for (let i = 0; i < 40; i++) {
      m.atualizar(1 / 60, sai, q.projetor, q.protegidas);
      descendo.push(m.escala);
    }
    expect(descendo[descendo.length - 1]).toBe(0);
    for (let i = 1; i < descendo.length; i++) expect(descendo[i]!).toBeLessThanOrEqual(descendo[i - 1]!);
    expect(m.ponteVisivel).toBe(false);
    expect(m.punhoVisivel).toBe(false);
  });

  it('ao voltar (próxima mira) a ponte nasce no lugar certo, sem deslizar de onde estava', () => {
    const a = quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO);
    const b = quadro(0.5, -0.2, 2, 1, REPOUSO_DO_RECUO);
    const m = novasMaos();
    m.definirBolas(a.mesa, r);
    for (let i = 0; i < 20; i++) m.atualizar(1 / 60, a.entrada, a.projetor, a.protegidas);
    for (let i = 0; i < 60; i++) m.atualizar(1 / 60, { ...a.entrada, ativas: false }, a.projetor, a.protegidas);
    m.definirBolas(b.mesa, r);
    m.atualizar(1 / 60, b.entrada, b.projetor, b.protegidas);
    const direto = maosEm(b);
    expect(m.distanciaDaPonte).toBeCloseTo(direto.distanciaDaPonte, 9);
    expect(m.agarre).toBeCloseTo(direto.agarre, 9);
  });

  it('mudar de lugar de ponte é deslizar: a distância suavizada anda uma fração por quadro', () => {
    // Bola de lado numa posição onde a ponte precisa se afastar: de livre para colada na tabela.
    const q1 = quadro(0.1, HZ - 0.3, -Math.PI / 2, 1, REPOUSO_DO_RECUO);
    const q2 = quadro(0.1, HZ - R, -Math.PI / 2, 1, REPOUSO_DO_RECUO);
    const m = novasMaos();
    m.definirBolas(q1.mesa, r);
    for (let i = 0; i < 30; i++) m.atualizar(1 / 60, q1.entrada, q1.projetor, q1.protegidas);
    const antes = m.distanciaDaPonte;
    m.definirBolas(q2.mesa, r);
    m.atualizar(1 / 60, q2.entrada, q2.projetor, q2.protegidas);
    const alvo = maosEm(q2).distanciaDaPonte;
    if (Math.abs(alvo - antes) > 0.05) {
      expect(Math.abs(m.distanciaDaPonte - antes)).toBeGreaterThan(0);
      expect(Math.abs(m.distanciaDaPonte - alvo)).toBeGreaterThan(0.001);
    }
  });
});

describe('MaosDoJogador: sem alocar', () => {
  it('as poses e o estado são os mesmos objetos a cada quadro', () => {
    const q = quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO);
    const m = maosEm(q);
    const ponte = m.ponte;
    const punho = m.punho;
    m.atualizar(1 / 60, q.entrada, q.projetor, q.protegidas);
    expect(m.ponte).toBe(ponte);
    expect(m.punho).toBe(punho);
  });
});

describe('noMundo: o quadro da mão', () => {
  it('a origem é a posição e o eixo x local é a direção do taco', () => {
    const q = quadro(-0.4, 0.1, 0.6, 1, REPOUSO_DO_RECUO);
    const m = maosEm(q);
    const o = { x: 0, y: 0, z: 0 };
    const p = { x: 0, y: 0, z: 0 };
    noMundo(m.ponte, 0, 0, 0, o);
    noMundo(m.ponte, 1, 0, 0, p);
    expect(o.x).toBeCloseTo(m.ponte.x, 12);
    expect(p.x - o.x).toBeCloseTo(m.ponte.dx, 12);
    expect(p.y - o.y).toBeCloseTo(m.ponte.dy, 12);
    // Os três eixos são unitários e perpendiculares.
    const u = { x: 0, y: 0, z: 0 };
    const w = { x: 0, y: 0, z: 0 };
    noMundo(m.ponte, 0, 1, 0, u);
    noMundo(m.ponte, 0, 0, 1, w);
    const vu = [u.x - o.x, u.y - o.y, u.z - o.z];
    const vw = [w.x - o.x, w.y - o.y, w.z - o.z];
    expect(Math.hypot(...(vu as [number, number, number]))).toBeCloseTo(1, 9);
    expect(Math.hypot(...(vw as [number, number, number]))).toBeCloseTo(1, 9);
    expect(vu[0]! * vw[0]! + vu[1]! * vw[1]! + vu[2]! * vw[2]!).toBeCloseTo(0, 9);
    expect(vu[0]! * m.ponte.dx + vu[1]! * m.ponte.dy + vu[2]! * m.ponte.dz).toBeCloseTo(0, 9);
  });
});


describe('MaosDoJogador: os dedos da ponte pousam no que há embaixo', () => {
  const ponteVisivelEm = (q: ReturnType<typeof quadro>): MaosDoJogador => maosEm(q);

  it('no meio da mesa, cada ponta de dedo toca o pano a menos de 1 mm', () => {
    const q = quadro(-0.4, 0.1, 0, 1, REPOUSO_DO_RECUO);
    const m = ponteVisivelEm(q);
    const pontas = pontasNoMundo(m.calibradaAtual, Array.from(m.dobrasDaPonte), m.ponte, poseDaPonteNomeada(m.ponteAtual));
    for (const d of DEDOS_LONGOS) expect(Math.abs(pontas[d].y), d).toBeLessThan(0.001);
  });

  it.each(POSICOES)('%s: nenhuma ponta afunda mais de 1 mm no que há embaixo dela', (_nome, x, z) => {
    for (const angulo of [0, 40, 90, 140, 180, 230, 270, 320]) {
      const q = quadro(x, z, angulo * grausParaRad, 1, REPOUSO_DO_RECUO);
      const m = ponteVisivelEm(q);
      if (!m.ponteVisivel) continue;
      const pontas = pontasNoMundo(m.calibradaAtual, Array.from(m.dobrasDaPonte), m.ponte, poseDaPonteNomeada(m.ponteAtual));
      for (const d of DEDOS_LONGOS) {
        const chao = apoioEm(obstaculos, pontas[d].x, pontas[d].z).altura;
        if (chao === -Infinity) continue;
        expect(pontas[d].y - chao, `${d} a ${angulo}°`).toBeGreaterThan(-0.001);
      }
    }
  });
});

describe('MaosDoJogador: a pele da ponte e o taco', () => {
  const local = { x: 0, y: 0, z: 0 };

  /** O raio do taco a `q` m da ponta. */
  const raioDoTaco = (q: number): number => TACO.raioPonta + ((TACO.raioBase - TACO.raioPonta) * Math.max(q, 0)) / TACO.comprimento;

  /** A pior penetração (m) da pele da ponte no taco: o que falta para a pele sair do cilindro dele, o maior valor de todos os vértices. */
  function penetracao(m: MaosDoJogador, angulo: number, x: number, z: number, recuo: number, elevacao: number): number {
    const pele = peleDaPonte(m.calibradaAtual, BASE, Array.from(m.dobrasDaPonte), poseDaPonteNomeada(m.ponteAtual));
    const eixo = eixoDoTaco(x, R, z, R, angulo, elevacao, recuo, 0, 0);
    const p = m.ponte;
    const wx = p.dy * p.uz - p.dz * p.uy;
    const wy = p.dz * p.ux - p.dx * p.uz;
    const wz = p.dx * p.uy - p.dy * p.ux;
    let pior = 0;
    for (let v = 0; v < pele.length; v += 3) {
      m.calibradaAtual.local(pele[v]!, pele[v + 1]!, pele[v + 2]!, local);
      const { x: lx, y: ly, z: lz } = local;
      const mx = p.x + lx * p.dx + ly * p.ux + lz * wx - eixo.px;
      const my = p.y + lx * p.dy + ly * p.uy + lz * wy - eixo.py;
      const mz = p.z + lx * p.dz + ly * p.uz + lz * wz - eixo.pz;
      const ao = -(mx * eixo.dx + my * eixo.dy + mz * eixo.dz);
      const d = Math.hypot(mx + eixo.dx * ao, my + eixo.dy * ao, mz + eixo.dz * ao);
      pior = Math.max(pior, raioDoTaco(ao) - d);
    }
    return pior;
  }

  /** O menor vão (m) entre um vértice da pele da ponte e o apoio embaixo dele: negativo é pele dentro do pano, da borracha ou da moldura. */
  function menorVao(m: MaosDoJogador): number {
    const pele = peleDaPonte(m.calibradaAtual, BASE, Array.from(m.dobrasDaPonte), poseDaPonteNomeada(m.ponteAtual));
    const p = m.ponte;
    const wx = p.dy * p.uz - p.dz * p.uy;
    const wy = p.dz * p.ux - p.dx * p.uz;
    const wz = p.dx * p.uy - p.dy * p.ux;
    let menor = Infinity;
    for (let v = 0; v < pele.length; v += 3) {
      m.calibradaAtual.local(pele[v]!, pele[v + 1]!, pele[v + 2]!, local);
      const { x: lx, y: ly, z: lz } = local;
      const y = p.y + lx * p.dy + ly * p.uy + lz * wy;
      const chao = alturaDoApoioEm(obstaculos, p.x + lx * p.dx + ly * p.ux + lz * wx, p.z + lx * p.dz + ly * p.uz + lz * wz);
      if (chao !== -Infinity) menor = Math.min(menor, y - chao);
    }
    return menor;
  }

  it('no meio da mesa a mão pousa: a pele toca o pano (entre -1 mm e +3 mm) e nada afunda', () => {
    for (const angulo of [0, 70, 140, 215, 290]) {
      const q = quadro(-0.4, 0.1, angulo * grausParaRad, 1, REPOUSO_DO_RECUO);
      const vao = menorVao(maosEm(q));
      expect(vao, `${angulo}°`).toBeGreaterThan(-0.001);
      expect(vao, `${angulo}°`).toBeLessThan(0.003);
    }
  });

  // A palma do arquivo é uma só: junto da borracha e da moldura ela pode entrar até `tolerancia` (3 mm); a pele, até 8 mm (as esferas da mão giradas veem o pulso).
  it.each(POSICOES)('%s: nenhum ponto da pele da ponte afunda mais de 8 mm no que há embaixo', (_nome, x, z) => {
    for (const angulo of [0, 40, 90, 140, 180, 230, 270, 320]) {
      const q = quadro(x, z, angulo * grausParaRad, 1, REPOUSO_DO_RECUO);
      const m = maosEm(q);
      if (!m.ponteVisivel) continue;
      expect(menorVao(m), `${angulo}°`).toBeGreaterThan(-0.008);
    }
  });

  // O V do arquivo é para o taco da pose (raio fixo); a mão sobe até `tolerancia`, o taco engrossa ao recuar e o giro da mão (`ponte.giro`) tira o V do eixo do taco: a pele cede alguns milímetros (cerca de 1 mm a mais a cada 10° de giro).
  it('no meio da mesa, parado e puxado, o taco passa pelo V sem atravessar a pele (a menos de 7 mm)', () => {
    for (const recuo of [REPOUSO_DO_RECUO, 0.1, 0.25]) {
      for (const angulo of [0, 70, 140, 215, 290]) {
        const q = quadro(-0.4, 0.1, angulo * grausParaRad, 1, recuo);
        const m = maosEm(q);
        expect(m.ponteVisivel).toBe(true);
        expect(penetracao(m, angulo * grausParaRad, -0.4, 0.1, recuo, q.elevacao), `ângulo ${angulo}, recuo ${recuo}`).toBeLessThan(0.007);
      }
    }
  });

  // Junto da tabela a mão sobe sobre a borracha (e os dedos, sobre a moldura) e o taco passa mais baixo no V: dez milímetros e meio de tolerância (a pose da tabela, L29, passa 0,1 mm de 10).
  it.each(POSICOES)('%s: o taco passa pela mão sem atravessar a pele (a menos de 10 mm)', (_nome, x, z) => {
    for (const angulo of [0, 40, 90, 140, 180, 230, 270, 320]) {
      const q = quadro(x, z, angulo * grausParaRad, 1, REPOUSO_DO_RECUO);
      const m = maosEm(q);
      if (!m.ponteVisivel) continue;
      expect(penetracao(m, angulo * grausParaRad, x, z, REPOUSO_DO_RECUO, q.elevacao), `${angulo}°`).toBeLessThan(0.0105);
    }
  });
});
