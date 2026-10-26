import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import type { EfeitoTacada, MedidasTaco } from '@sinuca/fisica';
import type { SkinTaco } from '@sinuca/protocolo';
import { aparenciaDoTaco, type AparenciaTaco, type PecaDeMadeira, type Superficie } from './aparencia-do-taco';
import { imagemDeCarbono, imagemDeMadeira, imagemDeNeon, imagemDoAntebraco, imagemDoPunho, imagemLisa, pintarChamas, pintarFaixas, type ImagemRGBA, type TamanhoDaImagem } from './imagens-do-taco';
import { NOMES_DAS_PARTES, amostrasDaParte, partesDoTaco, perfilDaSilhueta, type NomeDaParte, type ParteDoTaco } from './perfil-do-taco';
import { criarHalo, geometriaDoHalo, soltarHalo } from './halo-do-taco';
import { sumirPerto, type FaixaDoSumiço } from './sumir-perto';
import { geometriaTorneada } from './torneado';

const NOME_DA_MARCA = 'taco-alerta';
const ESPESSURA_DA_MARCA = 1.12;
const EIXO_TACO = new Vector3(1, 0, 0);
const direcao = new Vector3();
const lateral = new Vector3();

/** Lados em volta de cada peça, quando ninguém pede outro. */
const SEGMENTOS_PADRAO = 32;
/** Um ponto de perfil a cada tanto de comprimento, por peça (as retas precisam de poucos; as peças curtas, dos pontos mínimos). */
const PASSO_DO_PERFIL: Readonly<Record<NomeDaParte, number>> = { sola: 0.001, virola: 0.01, haste: 0.1, junta: 0.004, antebraco: 0.05, punho: 0.05, anel: 0.004, base: 0.04, borracha: 0.004 };
/** Lado das imagens (px, na escala 1): em volta × ao longo. */
const TAMANHO_DAS_IMAGENS = { haste: { largura: 128, altura: 512 }, antebraco: { largura: 128, altura: 256 }, punho: { largura: 128, altura: 256 }, base: { largura: 128, altura: 128 } } as const;
const MINIMO_DA_IMAGEM = 32;
/** Onde o cabo some perto da câmera (m): `ate` abaixo do que a câmera de tacada mantém de folga, para nunca mexer na vista normal. */
export const SUMICO_PERTO_DA_CAMERA: FaixaDoSumiço = { de: 0.03, ate: 0.085 };

export interface OpcoesDoTaco {
  /** O id da skin (o web desenha os do catálogo; outro cai na clássica). */
  readonly skin?: string;
  /** Lados em volta de cada peça (menos no nível baixo). */
  readonly segmentos?: number;
  /** Multiplica o lado das texturas (1 = cheio): o `escalaTextura` do nível de qualidade. */
  readonly escalaTextura?: number;
  readonly anisotropia?: number;
  /** Liga o brilho que vaza das partes acesas (o neon): só os níveis de qualidade com sobra de quadro o querem. Padrão: ligado. */
  readonly halo?: boolean;
}

interface EstadoDoTaco {
  readonly medidas: MedidasTaco;
  readonly partes: Map<NomeDaParte, Mesh>;
  readonly marca: Mesh;
  skin: AparenciaTaco;
  segmentos: number;
  escalaTextura: number;
  anisotropia: number;
  /** O giz na ponta, de 0 a 1, e a cor que a sola mostra com ele (aplicada a cada quadro ao material que estiver na malha). */
  giz: number;
  readonly corDaPonta: Color;
  /** O que a skin atual criou e a skin seguinte tem de soltar. */
  texturas: Texture[];
  materiais: Material[];
  /** O brilho em volta da haste (só nas skins que o pedem e nos níveis que o querem); `null` sem ele. */
  halo: Mesh | null;
  haloLigado: boolean;
}

const estados = new WeakMap<Object3D, EstadoDoTaco>();

function estadoDe(taco: Object3D): EstadoDoTaco | undefined {
  return estados.get(taco);
}

/** A cor da sola com `nivel` de giz (0 a 1): couro quando o giz acaba, azul cheio com ele, e uma mistura que sobe depressa entre os dois. */
export function corDaPontaDoTaco(couro: number, giz: number, nivel: number, saida = new Color()): Color {
  const t = Math.min(Math.max((nivel - 0.04) / (0.7 - 0.04), 0), 1);
  const suave = t * t * (3 - 2 * t);
  return saida.setHex(couro).lerp(new Color(giz), suave);
}

function lado(base: number, escala: number): number {
  return Math.max(Math.round((base * escala) / 16) * 16, MINIMO_DA_IMAGEM);
}

function tamanho(base: { readonly largura: number; readonly altura: number }, escala: number): TamanhoDaImagem {
  return { largura: lado(base.largura, escala), altura: lado(base.altura, escala) };
}

function textura(imagem: ImagemRGBA, ehCor: boolean, anisotropia: number): DataTexture {
  const t = new DataTexture(new Uint8Array(imagem.dados.buffer, imagem.dados.byteOffset, imagem.dados.length), imagem.largura, imagem.altura, RGBAFormat, UnsignedByteType);
  if (ehCor) t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropia;
  t.needsUpdate = true;
  return t;
}

interface MapasDaPeca {
  readonly cor?: Texture;
  readonly emissiva?: Texture;
  readonly relevo?: Texture;
}

function materialDe(sup: Superficie, mapas: MapasDaPeca = {}): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: mapas.cor ? 0xffffff : sup.cor,
    map: mapas.cor ?? null,
    roughness: sup.rugosidade,
    metalness: sup.metal,
    clearcoat: sup.verniz,
    clearcoatRoughness: 0.12,
  });
  if (sup.especular) {
    material.specularIntensity = sup.especular.intensidade;
    if (sup.especular.cor !== undefined) material.specularColor.setHex(sup.especular.cor);
  }
  if (sup.emissivo || mapas.emissiva) {
    material.emissive.setHex(sup.emissivo?.cor ?? 0xffffff);
    material.emissiveIntensity = sup.emissivo?.intensidade ?? (mapas.emissiva ? 2.4 : 1.5);
    if (mapas.emissiva) material.emissiveMap = mapas.emissiva;
  }
  if (mapas.relevo) {
    material.normalMap = mapas.relevo;
    material.normalScale = new Vector2(1, 1);
  }
  sumirPerto(material, SUMICO_PERTO_DA_CAMERA);
  return material;
}

/**
 * A textura (e o brilho que acende) de uma peça de madeira, trama de carbono, chamas ou neon, no tamanho dado, com as faixas por
 * cima. `proporcao` = comprimento ÷ perímetro da peça (a trama de carbono tem células quadradas na peça de verdade).
 */
function mapasDaMadeira(peca: PecaDeMadeira, t: TamanhoDaImagem, semente: number, proporcao: number, anisotropia: number, guardar: (t: Texture) => Texture): MapasDaPeca {
  const faixas = peca.faixas ?? [];
  if (peca.trama === 'neon') {
    const { cor, emissiva } = imagemDeNeon(t, peca.cor, peca.linhas ?? [0x19f0ff, 0xff2bd6], faixas);
    return { cor: guardar(textura(cor, true, anisotropia)), emissiva: emissiva ? guardar(textura(emissiva, true, anisotropia)) : undefined };
  }
  if (peca.trama === 'lisa' && faixas.length === 0) return {};
  const base =
    peca.trama === 'carbono'
      ? imagemDeCarbono(t, peca.cor, peca.contraste, 6, proporcao)
      : peca.trama === 'lisa'
        ? imagemLisa(t, peca.cor)
        : imagemDeMadeira(t, peca.cor, peca.contraste, semente);
  const chamas = peca.chamas ?? [0xffc23a, 0xd8200f];
  if (peca.trama === 'chamas') pintarChamas(base, chamas, OPCOES_DAS_CHAMAS_DA_HASTE(semente));
  pintarFaixas(base, faixas);
  const mapas: { cor: Texture; emissiva?: Texture } = { cor: guardar(textura(base, true, anisotropia)) };
  if (peca.trama === 'chamas') {
    // As chamas acendem por si (o fogo não depende da luz da luminária): a mesma imagem, sobre o preto.
    mapas.emissiva = guardar(textura(pintarChamas(imagemLisa(t, 0x000000), chamas, OPCOES_DAS_CHAMAS_DA_HASTE(semente)), true, anisotropia));
  } else if (faixas.some((f) => f.brilho === true)) {
    const acesa = pintarFaixas(imagemLisa(t, 0x000000), faixas, true);
    mapas.emissiva = guardar(textura(acesa, true, anisotropia));
  }
  return mapas;
}

/** As chamas da haste: fileiras curtas (uma a cada ~8 cm) de línguas gordas; vistas de trás, línguas compridas e finas virariam listras. */
const OPCOES_DAS_CHAMAS_DA_HASTE = (semente: number) => ({ linguas: 4, alturaMin: 0.55, alturaMax: 0.95, semente, fileiras: 9 });

/** A razão comprimento ÷ perímetro de uma peça do taco (do raio médio dela). */
function proporcaoDaParte(taco: MedidasTaco, nome: NomeDaParte): number {
  const parte = partesDoTaco(taco).find((p) => p.nome === nome)!;
  const raioMedio = (parte.raio(parte.de) + parte.raio(parte.ate)) / 2;
  return (parte.ate - parte.de) / (2 * Math.PI * raioMedio);
}

/** Os materiais de cada peça da skin, com as texturas que ela pede; o que for criado entra em `texturas` e `materiais`. */
function materiaisDaSkin(taco: MedidasTaco, skin: AparenciaTaco, escala: number, anisotropia: number, nivelDeGiz: Color): { materiais: Record<NomeDaParte, Material>; texturas: Texture[]; todos: Material[] } {
  const texturas: Texture[] = [];
  const guardar = (t: Texture): Texture => {
    texturas.push(t);
    return t;
  };
  const hasteT = tamanho(TAMANHO_DAS_IMAGENS.haste, escala);
  const antebracoT = tamanho(TAMANHO_DAS_IMAGENS.antebraco, escala);
  const punhoT = tamanho(TAMANHO_DAS_IMAGENS.punho, escala);
  const baseT = tamanho(TAMANHO_DAS_IMAGENS.base, escala);

  const desenho = imagemDoAntebraco(antebracoT, skin.antebraco.base, skin.antebraco.desenho, 31, proporcaoDaParte(taco, 'antebraco'));
  const antebraco = materialDe(skin.antebraco.base, {
    cor: guardar(textura(desenho.cor, true, anisotropia)),
    emissiva: desenho.emissiva ? guardar(textura(desenho.emissiva, true, anisotropia)) : undefined,
  });

  const imagensDoPunho = imagemDoPunho(punhoT, skin.punho, 47);
  const punho = materialDe(
    { cor: skin.punho.cor, rugosidade: skin.punho.material === 'borracha' ? 0.8 : 0.9, metal: 0, verniz: 0 },
    { cor: guardar(textura(imagensDoPunho.cor, true, anisotropia)), relevo: guardar(textura(imagensDoPunho.relevo, false, anisotropia)) },
  );
  const sola = new MeshStandardMaterial({ color: nivelDeGiz, roughness: 0.92, metalness: 0 });
  sumirPerto(sola, SUMICO_PERTO_DA_CAMERA);
  const materiais: Record<NomeDaParte, Material> = {
    sola,
    virola: materialDe(skin.virola),
    haste: materialDe(skin.haste, mapasDaMadeira(skin.haste, hasteT, 11, proporcaoDaParte(taco, 'haste'), anisotropia, guardar)),
    junta: materialDe(skin.junta),
    antebraco,
    punho,
    anel: materialDe(skin.anel),
    base: materialDe(skin.base, mapasDaMadeira(skin.base, baseT, 53, proporcaoDaParte(taco, 'base'), anisotropia, guardar)),
    borracha: materialDe(skin.borracha),
  };
  return { materiais, texturas, todos: Object.values(materiais) };
}

function geometriaDaParte(parte: ParteDoTaco, segmentos: number): BufferGeometry {
  return geometriaTorneada(amostrasDaParte(parte, PASSO_DO_PERFIL[parte.nome]), segmentos);
}

/**
 * Taco com a ponta na origem do grupo e o corpo ao longo de -X: sola de couro, virola, haste, anel da junta, antebraço (com o
 * desenho da skin), punho enrolado, anel, base e tampa de borracha, todas torneadas dentro das medidas de `taco`. Mais a casca
 * vermelha da bola errada (`marcarTacoErrado`). O que cria é descartável com `descartar` (e `definirSkinDoTaco` solta o da skin que sai).
 */
export function criarTaco(taco: MedidasTaco, opcoes: OpcoesDoTaco = {}): Group {
  const segmentos = opcoes.segmentos ?? SEGMENTOS_PADRAO;
  const escalaTextura = opcoes.escalaTextura ?? 1;
  const anisotropia = opcoes.anisotropia ?? 1;
  const skin = aparenciaDoTaco(opcoes.skin ?? '');
  const grupo = new Group();
  grupo.name = 'taco';

  const corDaPonta = corDaPontaDoTaco(skin.ponta.couro, skin.ponta.giz, 1);
  const feito = materiaisDaSkin(taco, skin, escalaTextura, anisotropia, corDaPonta);
  const partes = new Map<NomeDaParte, Mesh>();
  for (const parte of partesDoTaco(taco)) {
    const malha = new Mesh(geometriaDaParte(parte, segmentos), feito.materiais[parte.nome]);
    malha.name = `taco-${parte.nome}`;
    if (parte.nome === 'sola') {
      // A ponta mostra o giz: a cor vai para o material que estiver na malha (o original ou a variante do nível de qualidade).
      malha.onBeforeRender = (_r, _s, _c, _g, material) => {
        const alvo = material as MeshStandardMaterial;
        if (!alvo.color.equals(corDaPonta)) alvo.color.copy(corDaPonta);
      };
    }
    partes.set(parte.nome, malha);
    grupo.add(malha);
  }
  // A casca vermelha da "bola errada": a silhueta um pouco mais grossa, escondida até a mira apontar para uma bola que não vale.
  // MeshBasicMaterial não entra na troca de materiais por qualidade e não depende da luz.
  const alerta = new Mesh(geometriaTorneada(perfilDaSilhueta(taco), Math.max(Math.round(segmentos / 2), 12)), new MeshBasicMaterial({ color: 0xff1a10, transparent: true, opacity: 0.8, depthWrite: false }));
  sumirPerto(alerta.material as Material, SUMICO_PERTO_DA_CAMERA);
  alerta.name = NOME_DA_MARCA;
  alerta.scale.set(1, ESPESSURA_DA_MARCA, ESPESSURA_DA_MARCA);
  alerta.renderOrder = 1;
  alerta.visible = false;
  grupo.add(alerta);

  const haloLigado = opcoes.halo ?? true;
  const halo = haloLigado && skin.halo ? criarHalo(taco, skin.halo, segmentos) : null;
  if (halo) grupo.add(halo);

  estados.set(grupo, { medidas: taco, partes, marca: alerta, skin, segmentos, escalaTextura, anisotropia, giz: 1, corDaPonta, texturas: feito.texturas, materiais: feito.todos, halo, haloLigado });
  return grupo;
}

/** Liga ou desliga a casca vermelha do taco (a mira está apontada para uma bola que não vale). */
export function marcarTacoErrado(taco: Object3D, errado: boolean): void {
  const alerta = taco.getObjectByName(NOME_DA_MARCA);
  if (alerta) alerta.visible = errado;
}

/** A skin que o taco desenha agora. */
export function skinDoTaco(taco: Object3D): SkinTaco | null {
  return estadoDe(taco)?.skin.id ?? null;
}

/**
 * O giz que a ponta mostra, de 0 (acabou: o couro aparece) a 1 (azul cheio). Só guarda o número e a cor: a malha a lê no
 * desenho, então vale também depois de uma troca de nível de qualidade.
 */
export function definirGizDoTaco(taco: Object3D, nivel: number): void {
  const estado = estadoDe(taco);
  if (!estado) return;
  const n = Math.min(Math.max(Number.isFinite(nivel) ? nivel : 0, 0), 1);
  if (n === estado.giz) return;
  estado.giz = n;
  corDaPontaDoTaco(estado.skin.ponta.couro, estado.skin.ponta.giz, n, estado.corDaPonta);
}

/** O giz que a ponta mostra agora (0 a 1). */
export function gizDoTaco(taco: Object3D): number {
  return estadoDe(taco)?.giz ?? 1;
}

/** Refaz os lados de cada peça (nível de qualidade) e solta as geometrias antigas. */
export function definirSegmentosDoTaco(taco: Object3D, segmentos: number): void {
  const estado = estadoDe(taco);
  if (!estado || segmentos === estado.segmentos) return;
  estado.segmentos = segmentos;
  for (const parte of partesDoTaco(estado.medidas)) {
    const malha = estado.partes.get(parte.nome)!;
    const antiga = malha.geometry;
    malha.geometry = geometriaDaParte(parte, segmentos);
    antiga.dispose();
  }
  const antigaDaMarca = estado.marca.geometry;
  estado.marca.geometry = geometriaTorneada(perfilDaSilhueta(estado.medidas), Math.max(Math.round(segmentos / 2), 12));
  antigaDaMarca.dispose();
  if (estado.halo) {
    const antigaDoHalo = estado.halo.geometry;
    estado.halo.geometry = geometriaDoHalo(estado.medidas, segmentos);
    antigaDoHalo.dispose();
  }
}

/**
 * Liga ou desliga o brilho do neon (os níveis de qualidade sem sobra de quadro o desligam). Com a skin atual sem brilho, só
 * guarda o pedido: a skin seguinte já nasce como ele manda.
 */
export function definirHaloDoTaco(taco: Object3D, ligado: boolean): void {
  const estado = estadoDe(taco);
  if (!estado || ligado === estado.haloLigado) return;
  estado.haloLigado = ligado;
  trocarHalo(taco as Group, estado);
}

/** O brilho que o taco desenha agora (para os testes e o gancho). */
export function haloDoTaco(taco: Object3D): Object3D | null {
  return estadoDe(taco)?.halo ?? null;
}

/** Põe no taco o brilho que a skin e o nível pedem, soltando o que havia. */
function trocarHalo(grupo: Group, estado: EstadoDoTaco): void {
  if (estado.halo) {
    grupo.remove(estado.halo);
    soltarHalo(estado.halo);
    estado.halo = null;
  }
  if (estado.haloLigado && estado.skin.halo) {
    estado.halo = criarHalo(estado.medidas, estado.skin.halo, estado.segmentos);
    grupo.add(estado.halo);
  }
}

/** Quantos lados cada peça tem agora. */
export function segmentosDoTaco(taco: Object3D): number {
  return estadoDe(taco)?.segmentos ?? 0;
}

/**
 * Troca a skin (as mesmas malhas ganham outros materiais e texturas; o que a skin de antes criou é solto). Devolve os materiais
 * originais que saíram, para quem guarda variantes deles (`VariantesDeMateriais.renovar`) as soltar. Id desconhecido: a clássica.
 */
export function definirSkinDoTaco(taco: Object3D, id: string): readonly Material[] {
  const estado = estadoDe(taco);
  if (!estado) return [];
  const nova = aparenciaDoTaco(id);
  if (nova.id === estado.skin.id) return [];
  const antigos = estado.materiais;
  const feito = materiaisDaSkin(estado.medidas, nova, estado.escalaTextura, estado.anisotropia, estado.corDaPonta);
  for (const nome of NOMES_DAS_PARTES) estado.partes.get(nome)!.material = feito.materiais[nome];
  for (const t of estado.texturas) t.dispose();
  estado.skin = nova;
  estado.texturas = feito.texturas;
  estado.materiais = feito.todos;
  corDaPontaDoTaco(nova.ponta.couro, nova.ponta.giz, estado.giz, estado.corDaPonta);
  trocarHalo(taco as Group, estado);
  return antigos;
}

/**
 * Coloca o taco mirando o centro da bola.
 *
 * @param angulo direção da tacada no plano XZ, em radianos (0 = +X)
 * @param elevacao inclinação do taco, em radianos (0 = paralelo ao pano)
 * @param recuo distância entre a ponta e a superfície da bola
 * @param efeito onde a ponta toca a bola (fração do raio); sem ele, no centro
 */
export function posicionarTaco(
  taco: Object3D,
  centroBola: Vector3,
  raioBola: number,
  angulo: number,
  elevacao: number,
  recuo: number,
  efeito?: EfeitoTacada,
): void {
  direcao.set(
    Math.cos(angulo) * Math.cos(elevacao),
    -Math.sin(elevacao),
    Math.sin(angulo) * Math.cos(elevacao),
  );
  let profundidade = raioBola;
  taco.position.copy(centroBola);
  if (efeito) {
    // Ponto de contato na esfera: deslocado de (lateral, vertical)·raio a partir do eixo da tacada.
    lateral.set(-Math.sin(angulo), 0, Math.cos(angulo));
    taco.position.addScaledVector(lateral, efeito.lateral * raioBola);
    taco.position.y += efeito.vertical * raioBola;
    profundidade = raioBola * Math.sqrt(Math.max(1 - efeito.lateral ** 2 - efeito.vertical ** 2, 0));
  }
  taco.position.addScaledVector(direcao, -(profundidade + recuo));
  taco.quaternion.setFromUnitVectors(EIXO_TACO, direcao);
}
