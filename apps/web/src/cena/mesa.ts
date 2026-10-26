import {
  CircleGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
} from 'three';
import { posicoesTriangulo, pontoDeSaida, type MedidasMesa, type Ponto2 } from '@sinuca/fisica';
import { CONFIG_WEB, type ConfigMesa } from '../config';
import { criarCacapa } from './cacapa';
import { extrudar, formaDe } from './extrusao';
import { comMolduraVisual, contornoMoldura, contornoPano, entalhesDaMoldura, larguraDaMoldura } from './geometria-mesa';
import { criarMateriaisMesa, type MateriaisMesa } from './materiais-mesa';
import { criarCorpoDaMesa } from './mesa-corpo';
import { criarGeometriaTabela } from './tabela-malha';
import { atribuirUv, uvLadrilho, type Vertice } from './uv';

/**
 * Quanto a mesa visível (tabela e moldura) passa do pano em cada lado (m). A moldura é a das medidas ou, se o buraco mais fundo
 * (o do meio) não cabe nela com a parede de madeira de `paredeDaCacapa`, a mais larga que o desenho precisa (`larguraDaMoldura`).
 */
export const bordaDaMesa = (mesa: MedidasMesa, cfg: Pick<ConfigMesa, 'paredeDaCacapa'> = CONFIG_WEB.mesa): number => mesa.larguraTabela + larguraDaMoldura(mesa, cfg);

/** Meio-comprimento (x) e meia-largura (z) da mesa visível, moldura incluída. */
export function semiMesa(mesa: MedidasMesa, cfg: Pick<ConfigMesa, 'paredeDaCacapa'> = CONFIG_WEB.mesa): { readonly x: number; readonly z: number } {
  const borda = bordaDaMesa(mesa, cfg);
  return { x: mesa.comprimento / 2 + borda, z: mesa.largura / 2 + borda };
}

export interface OpcoesDaMesa {
  readonly config?: ConfigMesa;
  /** Raio da bola numerada: a marca do pé fica no vértice do triângulo. */
  readonly raioBola: number;
  readonly anisotropia?: number;
  /** Multiplica o lado das texturas de canvas (nível de qualidade); 1 = cheio. */
  readonly escalaTextura?: number;
}

/**
 * UV da moldura: de cima, o plano XZ sobre a textura de tábuas; nas paredes, a textura da tábua
 * mais próxima, com a altura andando no sentido transversal ao veio (assim o veio aparece nos lados).
 */
function uvDaMoldura(semi: { readonly x: number; readonly z: number }, borda: number): (v: Vertice) => [number, number] {
  const u = (x: number): number => (x + semi.x) / (2 * semi.x);
  const v = (z: number): number => 1 - (z + semi.z) / (2 * semi.z);
  return (p) => {
    if (Math.abs(p.ny) > 0.6) return [u(p.x), v(p.z)];
    if (Math.abs(p.nz) >= Math.abs(p.nx)) return [u(p.x), v(Math.sign(p.z || 1) * (semi.z - borda / 2) + p.y)];
    return [u(Math.sign(p.x || 1) * (semi.x - borda / 2) + p.y), v(p.z)];
  };
}

/** Diamantes: três entre cada par de caçapas, nos dois lados compridos e nas duas cabeceiras. */
function posicoesDosDiamantes(mesa: MedidasMesa): Ponto2[] {
  const hx = mesa.comprimento / 2;
  const hz = mesa.largura / 2;
  const centro = mesa.larguraTabela + mesa.larguraMoldura / 2;
  const posicoes: Ponto2[] = [];
  for (const lado of [-1, 1]) {
    for (const k of [1, 2, 3]) {
      const x = (hx * k) / 4;
      posicoes.push({ x, z: lado * (hz + centro) }, { x: -x, z: lado * (hz + centro) });
      posicoes.push({ x: lado * (hx + centro), z: -hz + (2 * hz * k) / 4 });
    }
  }
  return posicoes;
}

function criarDiamantes(mesa: MedidasMesa, cfg: ConfigMesa, materiais: MateriaisMesa, yTopo: number): InstancedMesh {
  const posicoes = posicoesDosDiamantes(mesa);
  const malha = new InstancedMesh(
    new CylinderGeometry(cfg.diamante.raio, cfg.diamante.raio, cfg.diamante.espessura, 24),
    materiais.perola,
    posicoes.length,
  );
  malha.name = 'diamantes';
  const matriz = new Matrix4();
  posicoes.forEach((p, i) => malha.setMatrixAt(i, matriz.makeTranslation(p.x, yTopo + cfg.diamante.espessura / 2 - 0.0003, p.z)));
  malha.instanceMatrix.needsUpdate = true;
  malha.receiveShadow = true;
  return malha;
}

function criarMarca(posicao: Ponto2, materiais: MateriaisMesa): Mesh {
  const geometria = new CircleGeometry(0.004, 20);
  geometria.rotateX(-Math.PI / 2);
  const marca = new Mesh(geometria, materiais.marca);
  marca.position.set(posicao.x, 0.0004, posicao.z);
  marca.renderOrder = 1;
  return marca;
}

/**
 * A mesa visível, montada das medidas da física: pano, seis tabelas de borracha, moldura de madeira com entalhes, seis
 * caçapas fundas (garganta com pano até o círculo de queda da física, e ali o buraco escuro, o forro de couro e o lábio de
 * alumínio), diamantes, marcas, saia, pés e piso. A moldura é a das medidas, alargada só se o buraco do meio não coubesse nela.
 */
export function criarMesa(medidas: MedidasMesa, opcoes: OpcoesDaMesa): Group {
  const cfg = opcoes.config ?? CONFIG_WEB.mesa;
  const mesa = comMolduraVisual(medidas, cfg);
  const grupo = new Group();
  grupo.name = 'mesa';

  const semi = semiMesa(medidas, cfg);
  const materiais = criarMateriaisMesa(cfg, semi.x, semi.z, mesa.larguraMoldura, opcoes.anisotropia ?? 1, opcoes.escalaTextura ?? 1);
  const yTopo = mesa.alturaTabela + cfg.sobraMoldura;

  const { externo: contornoDoPano, furos: furosDoPano } = contornoPano(mesa, cfg);
  const pano = new Mesh(
    atribuirUv(
      extrudar(formaDe(contornoDoPano, furosDoPano), { yBase: -cfg.espessuraPano, altura: cfg.espessuraPano }),
      uvLadrilho(cfg.ladoTexturaPano),
    ),
    materiais.pano,
  );
  pano.name = 'pano';
  pano.receiveShadow = true;
  pano.castShadow = true;
  grupo.add(pano);

  for (let i = 0; i < 6; i++) {
    const tabela = new Mesh(criarGeometriaTabela(mesa, cfg, i), materiais.tabela);
    tabela.name = `tabela-${i}`;
    // As faces quase verticais da borracha, vistas pela luz de cima, enchem de ruído de sombra: só projetam.
    tabela.castShadow = true;
    grupo.add(tabela);
  }

  const { externo, furo } = contornoMoldura(mesa, cfg);
  const moldura = new Mesh(
    atribuirUv(
      extrudar(formaDe(externo, [furo]), {
        yBase: -cfg.espessuraPano,
        altura: yTopo + cfg.espessuraPano,
        chanfro: cfg.chanfroMoldura,
      }),
      uvDaMoldura(semi, mesa.larguraMoldura),
    ),
    materiais.madeira,
  );
  moldura.name = 'moldura';
  moldura.receiveShadow = true;
  moldura.castShadow = true;
  grupo.add(moldura);

  for (const { furo: f, caminho } of entalhesDaMoldura(mesa, cfg)) grupo.add(criarCacapa(f, caminho, cfg, materiais, yTopo));

  grupo.add(criarDiamantes(mesa, cfg, materiais, yTopo));
  grupo.add(criarMarca(pontoDeSaida(mesa), materiais));
  const vertice = posicoesTriangulo(mesa, opcoes.raioBola)[0];
  if (vertice) grupo.add(criarMarca(vertice, materiais));

  grupo.add(criarCorpoDaMesa(cfg, materiais, semi.x, semi.z));
  return grupo;
}
