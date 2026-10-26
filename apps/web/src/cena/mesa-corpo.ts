import { BoxGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, PlaneGeometry, type BufferGeometry } from 'three';
import type { ConfigMesa } from '../config';
import { retanguloArredondado } from './geometria-mesa';
import type { MateriaisMesa } from './materiais-mesa';
import { extrudar, formaDe } from './extrusao';

const LADO_DO_PISO = 16;
/** Comprimento (m) de madeira que a textura da saia cobre ao longo do veio. */
const VEIO_DA_SAIA = 1.2;

/** UV da saia: o veio corre na horizontal; de cima o plano XZ, dos lados (x ou z, y). */
function uvDaSaia(geometria: BufferGeometry): void {
  const posicao = geometria.getAttribute('position');
  const normal = geometria.getAttribute('normal');
  const uv: number[] = [];
  for (let i = 0; i < posicao.count; i++) {
    const noTopo = Math.abs(normal.getY(i)) > 0.7;
    const aoLongoDeZ = Math.abs(normal.getX(i)) > Math.abs(normal.getZ(i));
    const u = aoLongoDeZ ? posicao.getZ(i) : posicao.getX(i);
    const v = noTopo ? (aoLongoDeZ ? posicao.getX(i) : posicao.getZ(i)) : posicao.getY(i);
    uv.push(u / VEIO_DA_SAIA, v / 0.3);
  }
  geometria.setAttribute('uv', new Float32BufferAttribute(uv, 2));
}

/**
 * Saia de madeira sob a moldura, os quatro pés robustos com sapata e o piso escuro a
 * `alturaDoPiso` do pano, para a mesa não flutuar.
 *
 * @param metadeX meio-comprimento da moldura (mesa visível)
 * @param metadeZ meia-largura da moldura
 */
export function criarCorpoDaMesa(
  cfg: ConfigMesa,
  materiais: MateriaisMesa,
  metadeX: number,
  metadeZ: number,
): Group {
  const grupo = new Group();
  grupo.name = 'corpo';

  const { saia, pe } = cfg;
  const raio = Math.max(cfg.raioCantoMoldura - saia.recuo, 0.004);
  const externo = retanguloArredondado(metadeX - saia.recuo, metadeZ - saia.recuo, raio, cfg.segmentosPorVolta);
  const interno = retanguloArredondado(
    metadeX - saia.recuo - saia.espessura,
    metadeZ - saia.recuo - saia.espessura,
    Math.max(raio - saia.espessura / 2, 0.004),
    cfg.segmentosPorVolta,
  );
  const geometriaSaia = extrudar(formaDe(externo, [interno]), {
    yBase: -cfg.espessuraPano - saia.altura,
    altura: saia.altura,
    chanfro: 0.003,
  });
  uvDaSaia(geometriaSaia);
  const malhaSaia = new Mesh(geometriaSaia, materiais.madeiraCorpo);
  malhaSaia.name = 'saia';
  malhaSaia.receiveShadow = true;
  malhaSaia.castShadow = true;
  grupo.add(malhaSaia);

  const cantoX = metadeX - saia.recuo - pe.lado / 2;
  const cantoZ = metadeZ - saia.recuo - pe.lado / 2;
  // Os pés começam onde a saia termina: mais acima apareceriam pelo fundo da caçapa.
  const topoDoPe = -cfg.espessuraPano - saia.altura;
  const baseDoPe = -cfg.alturaDoPiso + pe.sapata;
  const geometriaPe = new BoxGeometry(pe.lado, topoDoPe - baseDoPe, pe.lado);
  const geometriaSapata = new CylinderGeometry(pe.lado * 0.55, pe.lado * 0.65, pe.sapata, 28);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const malhaPe = new Mesh(geometriaPe, materiais.madeiraPe);
      malhaPe.position.set(sx * cantoX, (topoDoPe + baseDoPe) / 2, sz * cantoZ);
      malhaPe.receiveShadow = true;
      malhaPe.castShadow = true;
      grupo.add(malhaPe);
      const sapata = new Mesh(geometriaSapata, materiais.sapata);
      sapata.position.set(sx * cantoX, baseDoPe - pe.sapata / 2, sz * cantoZ);
      grupo.add(sapata);
    }
  }

  const geometriaPiso = new PlaneGeometry(LADO_DO_PISO, LADO_DO_PISO);
  geometriaPiso.rotateX(-Math.PI / 2);
  const piso = new Mesh(geometriaPiso, materiais.piso);
  piso.name = 'piso';
  piso.position.y = -cfg.alturaDoPiso;
  piso.receiveShadow = true;
  grupo.add(piso);

  return grupo;
}
