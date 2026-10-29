import {
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  Float32BufferAttribute,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import type { EfeitoTacada, MedidasTaco } from '@sinuca/fisica';
import type { SkinTaco } from '@sinuca/protocolo';
import { aparenciaDoTaco, type AparenciaTaco, type ImagemPintada, type Superficie } from './aparencia-do-taco';
import { prepararShaderDoTaco } from './animacao-do-taco';
import { DETALHE_COMPLETO, mesmoDetalhe, type DetalheDoTaco } from './detalhe-do-taco';
import { PARTES_COM_IMAGEM, TAMANHO_DAS_IMAGENS, contextoDaPeca, mapasDaMadeira, mapasDoAntebraco, mapasDoPunho, type ContextoDaPeca, type ParteDeImagem } from './imagem-da-peca';
import { PASTA_DAS_SKINS, carregarImagemDoNavegador, type CarregadorDeImagem } from './imagem-pintada';
import type { ImagemRGBA, TamanhoDaImagem } from './imagens-do-taco';
import { NOMES_DAS_PARTES, amostrasDaParte, partesDoTaco, perfilDaSilhueta, type NomeDaParte, type ParteDoTaco } from './perfil-do-taco';
import { criarHalo, geometriaDoHalo, soltarHalo } from './halo-do-taco';
import { sumirPerto, type FaixaDoSumiço } from './sumir-perto';
import { PLACA_DO_CONTADOR, imagemDoContador } from './tramas-do-taco';
import { geometriaTorneada } from './torneado';

const NOME_DA_MARCA = 'taco-alerta';
const NOME_DO_CONTADOR = 'taco-contador';
const ESPESSURA_DA_MARCA = 1.12;
const EIXO_TACO = new Vector3(1, 0, 0);
const direcao = new Vector3();
const lateral = new Vector3();

/** Lados em volta de cada peça, quando ninguém pede outro. */
const SEGMENTOS_PADRAO = 32;
/** Um ponto de perfil a cada tanto de comprimento, por peça (as retas precisam de poucos; as peças curtas, dos pontos mínimos). */
const PASSO_DO_PERFIL: Readonly<Record<NomeDaParte, number>> = { sola: 0.001, virola: 0.01, haste: 0.1, junta: 0.004, antebraco: 0.05, punho: 0.05, anel: 0.004, base: 0.04, borracha: 0.004 };
/** A placa do contador (px, na escala 1): ao longo do cabo × em volta dele. */
const TAMANHO_DO_CONTADOR = { largura: 192, altura: 64 } as const;
const MINIMO_DA_IMAGEM = 32;
/** O quanto a placa do contador fica por fora do cabo (m): o bastante para não brigar com ele no buffer de profundidade. */
const SOBRA_DA_PLACA = 0.0003;
/** Onde o cabo some perto da câmera (m): `ate` abaixo do que a câmera de tacada mantém de folga, para nunca mexer na vista normal. */
export const SUMICO_PERTO_DA_CAMERA: FaixaDoSumiço = { de: 0.03, ate: 0.085 };

export interface OpcoesDoTaco {
  /** O id da skin (o web desenha os do catálogo; outro cai na clássica). */
  readonly skin?: string;
  /** A semente do taco (0 a 999): mexe no padrão e, se for rara, dá o padrão raro. Sem ela, o desenho de fábrica. */
  readonly semente?: number | null;
  /** O contador de bolas do taco (a placa de LED perto do anel); `null` ou ausente = sem placa. */
  readonly bolas?: number | null;
  /** Lados em volta de cada peça (menos no nível baixo). */
  readonly segmentos?: number;
  /** Multiplica o lado das texturas (1 = cheio): o `escalaTextura` do nível de qualidade. */
  readonly escalaTextura?: number;
  readonly anisotropia?: number;
  /** Liga o brilho que vaza das partes acesas (o neon): só os níveis de qualidade com sobra de quadro o querem. Padrão: ligado. */
  readonly halo?: boolean;
  /** O que o nível de qualidade deixa o taco desenhar (trama cheia ou simples, iridescência, animação, imagens). Padrão: tudo. */
  readonly detalhe?: DetalheDoTaco;
  /** Quem carrega as imagens pintadas (o do navegador, a menos que os testes injetem outro). */
  readonly carregarImagem?: CarregadorDeImagem;
  /** Onde estão as imagens pintadas (`/skins/`). */
  readonly pastaDasImagens?: string;
  /**
   * Chamado quando uma imagem pintada chega e troca o material de uma peça (depois da skin já ter sido montada): quem guarda
   * variantes dos materiais (`VariantesDeMateriais`) as renova. Recebe os materiais que saíram.
   */
  readonly aoTrocarMateriais?: (antigos: readonly Material[]) => void;
}

/** O que uma peça criou e a skin seguinte tem de soltar. */
interface CriadoDaParte {
  readonly material: Material;
  readonly texturas: readonly Texture[];
}

interface EstadoDoTaco {
  readonly medidas: MedidasTaco;
  readonly partes: Map<NomeDaParte, Mesh>;
  readonly marca: Mesh;
  /** A placa do contador de bolas (um pedaço de casca em volta do cabo, transparente fora da placa). */
  readonly contador: Mesh;
  skin: AparenciaTaco;
  /** O id como pediram (a skin desconhecida cai na clássica, mas o pedido é lembrado: trocar por ele de novo não refaz nada). */
  pedida: string;
  semente: number | null;
  bolas: number | null;
  segmentos: number;
  readonly escalaTextura: number;
  readonly anisotropia: number;
  detalhe: DetalheDoTaco;
  /** O giz na ponta, de 0 a 1, e a cor que a sola mostra com ele (aplicada a cada quadro ao material que estiver na malha). */
  giz: number;
  readonly corDaPonta: Color;
  /** O que a skin atual criou, por peça: material e texturas. */
  criado: Map<NomeDaParte, CriadoDaParte>;
  /** O brilho em volta da haste (só nas skins que o pedem e nos níveis que o querem); `null` sem ele. */
  halo: Mesh | null;
  haloLigado: boolean;
  /** Sobe a cada troca de skin, semente ou detalhe: uma imagem pintada que chega com a geração velha é jogada fora. */
  geracao: number;
  readonly carregar: CarregadorDeImagem;
  readonly pasta: string;
  readonly aoTrocarMateriais?: (antigos: readonly Material[]) => void;
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

interface MapasDe3d {
  readonly cor?: Texture;
  readonly emissiva?: Texture;
  readonly relevo?: Texture;
  /** Quanto a emissiva pintada acende (1 a 3 no contrato do Pincel). */
  readonly intensidadeDoEmissivo?: number;
  /** A máscara de metal pintada (L36, linear): o branco dela é metal, `intensidadeDoMetal` é quanto. */
  readonly metal?: Texture;
  readonly intensidadeDoMetal?: number;
}

function materialDe(sup: Superficie, mapas: MapasDe3d, detalhe: DetalheDoTaco): MeshPhysicalMaterial {
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
    material.emissiveIntensity = sup.emissivo?.intensidade ?? (mapas.emissiva ? (mapas.intensidadeDoEmissivo ?? 2.4) : 1.5);
    if (mapas.emissiva) material.emissiveMap = mapas.emissiva;
  }
  if (mapas.metal) {
    // A máscara pinta onde há metal (o ouro): fora dela a peça é pintura. Sem a máscara, o metal da peça é o dela.
    material.metalnessMap = mapas.metal;
    material.metalness = mapas.intensidadeDoMetal ?? 0.9;
  }
  if (mapas.relevo) {
    material.normalMap = mapas.relevo;
    material.normalScale = new Vector2(1, 1);
  }
  // A película irisada é do material físico (o nível alto): nos outros ela nem é pedida, e a variante Standard não a tem.
  if (sup.iridescencia && detalhe.iridescencia) {
    material.iridescence = sup.iridescencia.intensidade;
    material.iridescenceIOR = 1.8;
    material.iridescenceThicknessRange = [sup.iridescencia.espessura[0], sup.iridescencia.espessura[1]];
  }
  prepararShaderDoTaco(material, SUMICO_PERTO_DA_CAMERA, detalhe.animacao ? sup.varredura : undefined);
  return material;
}

/** O que a peça pede para desenhar as imagens dela, no tamanho que o nível de qualidade dá. */
function contextoDaParte(estado: EstadoDoTaco, nome: ParteDeImagem): ContextoDaPeca {
  return contextoDaPeca(estado.skin, estado.medidas, nome, tamanho(TAMANHO_DAS_IMAGENS[nome], estado.escalaTextura), estado.detalhe.trama === 'cheia' ? 'cheio' : 'simples');
}

/** A arte pintada que a skin dá a uma peça, se der. */
function imagemPintadaDa(skin: AparenciaTaco, nome: ParteDeImagem): ImagemPintada | undefined {
  switch (nome) {
    case 'haste':
      return skin.haste.imagem;
    case 'antebraco':
      return skin.antebraco.base.imagem;
    case 'punho':
      return skin.punho.imagem;
    case 'base':
      return skin.base.imagem;
  }
}

/** A superfície (cor, rugosidade, verniz...) que a peça pede ao material. */
function superficieDa(skin: AparenciaTaco, nome: Exclude<NomeDaParte, 'sola'>): Superficie {
  switch (nome) {
    case 'virola':
      return skin.virola;
    case 'haste':
      return skin.haste;
    case 'junta':
      return skin.junta;
    case 'antebraco':
      return skin.antebraco.base;
    case 'punho':
      return { cor: skin.punho.cor, rugosidade: skin.punho.rugosidade ?? (skin.punho.material === 'borracha' ? 0.8 : 0.9), metal: 0, verniz: skin.punho.verniz ?? 0 };
    case 'anel':
      return skin.anel;
    case 'base':
      return skin.base;
    case 'borracha':
      return skin.borracha;
  }
}

/** As texturas pintadas de uma peça (já clonadas para este taco) e quanto a emissiva acende. */
interface Pintadas {
  readonly cor: Texture;
  readonly emissiva: Texture | null;
  readonly intensidadeDoEmissivo: number;
  readonly metal: Texture | null;
  readonly intensidadeDoMetal: number;
}

/**
 * O material de uma peça e as texturas que ele pediu (a skin seguinte as solta). `pintadas` (a arte do Pincel, já chegada) troca a cor
 * e o brilho gerados pela imagem; o relevo do punho e a rugosidade, o metal e o verniz da peça ficam.
 */
function criarDaParte(estado: EstadoDoTaco, nome: NomeDaParte, pintadas?: Pintadas): CriadoDaParte {
  const texturas: Texture[] = [];
  const guardar = <T extends Texture>(t: T): T => {
    texturas.push(t);
    return t;
  };
  const { skin, detalhe, anisotropia } = estado;
  if (nome === 'sola') {
    const sola = new MeshStandardMaterial({ color: estado.corDaPonta, roughness: 0.92, metalness: 0 });
    sumirPerto(sola, SUMICO_PERTO_DA_CAMERA);
    return { material: sola, texturas };
  }
  const sup = superficieDa(skin, nome);
  if (!(PARTES_COM_IMAGEM as readonly NomeDaParte[]).includes(nome)) return { material: materialDe(sup, {}, detalhe), texturas };
  const parte = nome as ParteDeImagem;
  const ctx = contextoDaParte(estado, parte);
  const pintada: MapasDe3d = pintadas
    ? {
        cor: guardar(pintadas.cor),
        emissiva: pintadas.emissiva ? guardar(pintadas.emissiva) : undefined,
        intensidadeDoEmissivo: pintadas.intensidadeDoEmissivo,
        metal: pintadas.metal ? guardar(pintadas.metal) : undefined,
        intensidadeDoMetal: pintadas.intensidadeDoMetal,
      }
    : {};

  if (parte === 'punho') {
    const imagens = mapasDoPunho(ctx);
    return { material: materialDe(sup, { ...pintada, cor: pintada.cor ?? guardar(textura(imagens.cor, true, anisotropia)), relevo: guardar(textura(imagens.relevo, false, anisotropia)) }, detalhe), texturas };
  }
  // A arte pintada cobre a trama inteira (o relevo também): nem se gera a de código.
  if (pintadas) return { material: materialDe(sup, pintada, detalhe), texturas };
  const gerados = parte === 'haste' ? mapasDaMadeira(skin.haste, ctx, 11) : parte === 'antebraco' ? mapasDoAntebraco(ctx) : mapasDaMadeira(skin.base, ctx, 53);
  const mapas: MapasDe3d = {
    cor: gerados.cor ? guardar(textura(gerados.cor, true, anisotropia)) : undefined,
    emissiva: gerados.emissiva ? guardar(textura(gerados.emissiva, true, anisotropia)) : undefined,
    relevo: gerados.relevo ? guardar(textura(gerados.relevo, false, anisotropia)) : undefined,
  };
  return { material: materialDe(sup, mapas, detalhe), texturas };
}

/** O clone da textura do cache para este taco: o contrato do Pincel (volta fechada em x, espelhada; a ponta embaixo) e o rolo da semente. */
function clonarPintada(original: Texture, rolo: number, anisotropia: number, ehCor = true): Texture {
  const t = original.clone();
  // A cor e o brilho são sRGB; a máscara de metal é dado linear.
  t.colorSpace = ehCor ? SRGBColorSpace : NoColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = ClampToEdgeWrapping;
  t.repeat.set(-1, 1);
  t.offset.set(1 + rolo, 0);
  t.anisotropy = anisotropia;
  t.needsUpdate = true;
  return t;
}

function geometriaDaParte(parte: ParteDoTaco, segmentos: number): BufferGeometry {
  return geometriaTorneada(amostrasDaParte(parte, PASSO_DO_PERFIL[parte.nome]), segmentos);
}

/**
 * A placa do contador: um pedaço de casca em volta do cabo, depois do anel, no lado de cima do taco (u = 0), uns décimos de
 * milímetro por fora dele. As coordenadas de textura correm ao longo do cabo (x, do anel para o fim) e em volta (y).
 */
function geometriaDoContador(medidas: MedidasTaco): BufferGeometry {
  const base = partesDoTaco(medidas).find((p) => p.nome === 'base')!;
  const perimetro = 2 * Math.PI * ((base.raio(base.de) + base.raio(base.ate)) / 2);
  const q0 = base.de + PLACA_DO_CONTADOR.inicio * perimetro;
  const q1 = Math.min(q0 + PLACA_DO_CONTADOR.comprimento * perimetro, base.ate);
  const meiaVolta = Math.PI * PLACA_DO_CONTADOR.largura;
  const ao = 12;
  const em = 12;
  const posicoes = new Float32Array((ao + 1) * (em + 1) * 3);
  const normais = new Float32Array((ao + 1) * (em + 1) * 3);
  const uvs = new Float32Array((ao + 1) * (em + 1) * 2);
  const indices: number[] = [];
  for (let i = 0; i <= ao; i++) {
    const q = q0 + ((q1 - q0) * i) / ao;
    const r = base.raio(q) + SOBRA_DA_PLACA;
    const inclinacao = (base.raio(Math.min(q + 0.001, base.ate)) - base.raio(Math.max(q - 0.001, base.de))) / 0.002;
    const norma = Math.hypot(inclinacao, 1);
    for (let j = 0; j <= em; j++) {
      const angulo = -meiaVolta + (2 * meiaVolta * j) / em;
      const c = Math.cos(angulo);
      const s = Math.sin(angulo);
      const v = i * (em + 1) + j;
      posicoes[3 * v] = -q;
      posicoes[3 * v + 1] = r * c;
      posicoes[3 * v + 2] = r * s;
      normais[3 * v] = inclinacao / norma;
      normais[3 * v + 1] = c / norma;
      normais[3 * v + 2] = s / norma;
      uvs[2 * v] = 1 - i / ao;
      uvs[2 * v + 1] = j / em;
    }
  }
  for (let i = 0; i < ao; i++) {
    for (let j = 0; j < em; j++) {
      const a = i * (em + 1) + j;
      const b = a + 1;
      const c = a + (em + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(posicoes, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normais, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function criarContador(medidas: MedidasTaco, escala: number, anisotropia: number): Mesh {
  const t = tamanho(TAMANHO_DO_CONTADOR, escala);
  const vazia = (): ImagemRGBA => ({ largura: t.largura, altura: t.altura, dados: new Uint8ClampedArray(t.largura * t.altura * 4) });
  const mapa = textura(vazia(), true, anisotropia);
  const emissiva = textura(vazia(), true, anisotropia);
  const material = new MeshStandardMaterial({ map: mapa, emissiveMap: emissiva, emissive: 0xffffff, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  sumirPerto(material, SUMICO_PERTO_DA_CAMERA);
  const malha = new Mesh(geometriaDoContador(medidas), material);
  malha.name = NOME_DO_CONTADOR;
  malha.renderOrder = 1;
  malha.visible = false;
  return malha;
}

/** Desenha os dígitos do contador nas texturas da placa, no lugar (sem criar textura nova). */
function pintarContador(malha: Mesh, bolas: number): void {
  const material = malha.material as MeshStandardMaterial;
  const mapa = material.map as DataTexture;
  const emissiva = material.emissiveMap as DataTexture;
  const imagens = imagemDoContador(bolas, { largura: mapa.image.width, altura: mapa.image.height });
  (mapa.image.data as unknown as Uint8Array).set(imagens.cor.dados);
  (emissiva.image.data as unknown as Uint8Array).set(imagens.emissiva.dados);
  mapa.needsUpdate = true;
  emissiva.needsUpdate = true;
}

/** Põe o contador no estado: some sem número (`null`), ou desenha os quatro dígitos. */
function aplicarContador(estado: EstadoDoTaco): void {
  if (estado.bolas === null) {
    estado.contador.visible = false;
    return;
  }
  pintarContador(estado.contador, estado.bolas);
  estado.contador.visible = true;
}

/** Monta as peças para a skin, a semente e o detalhe do estado, soltando as texturas do que havia. Devolve os materiais que saíram. */
function montarSkin(estado: EstadoDoTaco): Material[] {
  const antigos = [...estado.criado.values()].map((c) => c.material);
  for (const c of estado.criado.values()) for (const t of c.texturas) t.dispose();
  const novo = new Map<NomeDaParte, CriadoDaParte>();
  for (const nome of NOMES_DAS_PARTES) {
    const feito = criarDaParte(estado, nome);
    novo.set(nome, feito);
    estado.partes.get(nome)!.material = feito.material;
  }
  estado.criado = novo;
  estado.geracao++;
  pedirPintadas(estado);
  return antigos;
}

/** Pede as imagens pintadas da skin (as peças que as têm) e, quando chegam, troca o material daquela peça. */
function pedirPintadas(estado: EstadoDoTaco): void {
  const geracao = estado.geracao;
  for (const nome of PARTES_COM_IMAGEM) {
    const imagem = imagemPintadaDa(estado.skin, nome);
    if (!imagem) continue;
    // Só a rara (não uma fase com nome) troca a pintura pela variante de paleta.
    const rara = estado.skin.padrao?.rara === true ? imagem.rara : undefined;
    const arquivoCor = rara?.cor ?? imagem.cor;
    const completas = estado.detalhe.imagens === 'completas';
    const arquivoBrilho = completas ? (rara ? rara.emissiva : imagem.emissiva) : undefined;
    const arquivoMetal = completas ? (rara ? rara.metal : imagem.metal) : undefined;
    const pedir = (arquivo: string | undefined): Promise<Texture | null> => (arquivo ? estado.carregar(estado.pasta + arquivo) : Promise.resolve(null));
    void Promise.all([pedir(arquivoCor), pedir(arquivoBrilho), pedir(arquivoMetal)]).then(([cor, brilho, metal]) => {
      if (estado.geracao !== geracao || cor === null) return;
      const rolo = estado.skin.variacao.rolo;
      const pintadas: Pintadas = {
        cor: clonarPintada(cor, rolo, estado.anisotropia),
        emissiva: brilho ? clonarPintada(brilho, rolo, estado.anisotropia) : null,
        intensidadeDoEmissivo: imagem.intensidadeDoEmissivo ?? 2,
        metal: metal ? clonarPintada(metal, rolo, estado.anisotropia, false) : null,
        intensidadeDoMetal: imagem.intensidadeDoMetal ?? 0.9,
      };
      const antigo = estado.criado.get(nome)!;
      const feito = criarDaParte(estado, nome, pintadas);
      estado.partes.get(nome)!.material = feito.material;
      estado.criado.set(nome, feito);
      for (const t of antigo.texturas) t.dispose();
      estado.aoTrocarMateriais?.([antigo.material]);
    });
  }
}

/**
 * Taco com a ponta na origem do grupo e o corpo ao longo de -X: sola de couro, virola, haste, anel da junta, antebraço (com o
 * desenho da skin), punho enrolado, anel, base e tampa de borracha, todas torneadas dentro das medidas de `taco`. Mais a casca
 * vermelha da bola errada (`marcarTacoErrado`) e a placa do contador de bolas. O que cria é descartável com `descartar` (e
 * `definirSkinDoTaco` solta o da skin que sai).
 */
export function criarTaco(taco: MedidasTaco, opcoes: OpcoesDoTaco = {}): Group {
  const segmentos = opcoes.segmentos ?? SEGMENTOS_PADRAO;
  const escalaTextura = opcoes.escalaTextura ?? 1;
  const anisotropia = opcoes.anisotropia ?? 1;
  const semente = opcoes.semente ?? null;
  const skin = aparenciaDoTaco(opcoes.skin ?? '', semente);
  const grupo = new Group();
  grupo.name = 'taco';

  const corDaPonta = corDaPontaDoTaco(skin.ponta.couro, skin.ponta.giz, 1);
  const partes = new Map<NomeDaParte, Mesh>();
  for (const parte of partesDoTaco(taco)) {
    const malha = new Mesh(geometriaDaParte(parte, segmentos), undefined);
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

  const contador = criarContador(taco, escalaTextura, anisotropia);
  grupo.add(contador);

  const haloLigado = opcoes.halo ?? true;
  const halo = haloLigado && skin.halo ? criarHalo(taco, skin.halo, segmentos) : null;
  if (halo) grupo.add(halo);

  const estado: EstadoDoTaco = {
    medidas: taco,
    partes,
    marca: alerta,
    contador,
    skin,
    pedida: opcoes.skin ?? '',
    semente,
    bolas: opcoes.bolas ?? null,
    segmentos,
    escalaTextura,
    anisotropia,
    detalhe: opcoes.detalhe ?? DETALHE_COMPLETO,
    giz: 1,
    corDaPonta,
    criado: new Map(),
    halo,
    haloLigado,
    geracao: 0,
    carregar: opcoes.carregarImagem ?? carregarImagemDoNavegador,
    pasta: opcoes.pastaDasImagens ?? PASTA_DAS_SKINS,
    aoTrocarMateriais: opcoes.aoTrocarMateriais,
  };
  estados.set(grupo, estado);
  montarSkin(estado);
  aplicarContador(estado);
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

/** A semente do taco desenhado (`null` = sem semente, o desenho de fábrica). */
export function sementeDoTaco(taco: Object3D): number | null {
  return estadoDe(taco)?.semente ?? null;
}

/** O contador de bolas que a placa mostra (`null` = sem placa). */
export function bolasDoTaco(taco: Object3D): number | null {
  return estadoDe(taco)?.bolas ?? null;
}

/** A aparência que o taco desenha agora (a skin com a semente e, se for o caso, o padrão raro). */
export function aparenciaDoTacoDesenhado(taco: Object3D): AparenciaTaco | null {
  return estadoDe(taco)?.skin ?? null;
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

/** O que o nível de qualidade deixa o taco desenhar agora. */
export function detalheDoTaco(taco: Object3D): DetalheDoTaco {
  return estadoDe(taco)?.detalhe ?? DETALHE_COMPLETO;
}

/**
 * Muda o que o taco desenha (o nível de qualidade mudou: trama cheia ou simples, iridescência, animação, imagens). Se o detalhe
 * mudou de verdade, refaz os materiais e devolve os que saíram (para `VariantesDeMateriais.renovar`); senão, uma lista vazia.
 */
export function definirDetalheDoTaco(taco: Object3D, detalhe: DetalheDoTaco): readonly Material[] {
  const estado = estadoDe(taco);
  if (!estado || mesmoDetalhe(estado.detalhe, detalhe)) return [];
  estado.detalhe = detalhe;
  return montarSkin(estado);
}

/**
 * Troca a skin, a semente e o contador do taco (as mesmas malhas ganham outros materiais e texturas; o que a skin de antes criou é
 * solto). Devolve os materiais originais que saíram, para quem guarda variantes deles (`VariantesDeMateriais.renovar`) as soltar:
 * lista vazia quando os materiais não mudaram (só o contador, ou nada). Id desconhecido: a clássica.
 */
export function definirSkinDoTaco(taco: Object3D, id: string, semente: number | null = null, bolas: number | null = null): readonly Material[] {
  const estado = estadoDe(taco);
  if (!estado) return [];
  let antigos: readonly Material[] = [];
  if (id !== estado.pedida || semente !== estado.semente) {
    const nova = aparenciaDoTaco(id, semente);
    estado.pedida = id;
    estado.skin = nova;
    estado.semente = semente;
    corDaPontaDoTaco(nova.ponta.couro, nova.ponta.giz, estado.giz, estado.corDaPonta);
    antigos = montarSkin(estado);
    trocarHalo(taco as Group, estado);
  }
  if (bolas !== estado.bolas) {
    estado.bolas = bolas;
    aplicarContador(estado);
  }
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
