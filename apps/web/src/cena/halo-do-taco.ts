import { AdditiveBlending, Color, DataTexture, LinearFilter, Mesh, RGBAFormat, RepeatWrapping, ShaderMaterial, UnsignedByteType, type BufferGeometry } from 'three';
import type { MedidasTaco } from '@sinuca/fisica';
import { amostrasDaParte, partesDoTaco } from './perfil-do-taco';
import { geometriaTorneada } from './torneado';

/** Quantas vezes mais grossa que a haste é a casca do brilho. */
export const ESCALA_DO_HALO = 3.4;
/** Largura (px) da imagem das cores em volta da casca. */
const LADO_DA_IMAGEM = 64;

/** Onde a casca some perto da câmera (m): o cabo de perto não pode virar uma mancha de luz na tela. */
const SUMICO_DO_HALO = { de: 0.06, ate: 0.18 };

const VERTICE = /* glsl */ `
varying vec3 vNormal;
varying vec3 vVista;
varying vec2 vUv;
varying float vDistancia;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vVista = normalize(-mv.xyz);
  vDistancia = length(mv.xyz);
  vUv = uv;
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENTO = /* glsl */ `
uniform sampler2D cores;
uniform float intensidade;
uniform vec2 sumico;
varying vec3 vNormal;
varying vec3 vVista;
varying vec2 vUv;
varying float vDistancia;
void main() {
  float ndv = abs(dot(normalize(vNormal), normalize(vVista)));
  float miolo = pow(ndv, 2.4);
  vec3 cor = texture2D(cores, vec2(vUv.x, 0.5)).rgb;
  float perto = smoothstep(sumico.x, sumico.y, vDistancia);
  // A casca acaba nas pontas da haste sem corte: some devagar nos dois extremos.
  float pontas = smoothstep(0.0, 0.12, vUv.y) * (1.0 - smoothstep(0.88, 1.0, vUv.y));
  gl_FragColor = vec4(cor * intensidade, miolo * perto * pontas);
}`;

/** A imagem das cores em volta da casca: o brilho de cada linha do neon (quatro, alternando as duas cores) e um fundo fraco. */
function imagemDasCores(cores: readonly [number, number]): DataTexture {
  const dados = new Uint8Array(LADO_DA_IMAGEM * 4);
  const a = new Color(cores[0]);
  const b = new Color(cores[1]);
  for (let x = 0; x < LADO_DA_IMAGEM; x++) {
    const u = x / LADO_DA_IMAGEM;
    let forca = 0.1;
    let tom = a;
    for (let k = 0; k < 4; k++) {
      let d = Math.abs(u - (k / 4 + 0.125)) % 1;
      d = Math.min(d, 1 - d);
      const f = 0.1 + 0.9 * Math.exp(-((d / 0.07) ** 2));
      if (f > forca) {
        forca = f;
        tom = k % 2 === 0 ? a : b;
      }
    }
    dados[x * 4] = Math.round(tom.r * 255 * forca);
    dados[x * 4 + 1] = Math.round(tom.g * 255 * forca);
    dados[x * 4 + 2] = Math.round(tom.b * 255 * forca);
    dados[x * 4 + 3] = 255;
  }
  const t = new DataTexture(dados, LADO_DA_IMAGEM, 1, RGBAFormat, UnsignedByteType);
  t.wrapS = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** A casca do brilho: o perfil da haste engrossado, para o brilho passar do contorno do taco. */
export function geometriaDoHalo(taco: MedidasTaco, segmentos: number): BufferGeometry {
  const haste = partesDoTaco(taco).find((p) => p.nome === 'haste')!;
  const pontos = amostrasDaParte(haste, 0.1).map((p) => ({ q: p.q, r: p.r * ESCALA_DO_HALO }));
  return geometriaTorneada(pontos, Math.max(Math.round(segmentos / 2), 12));
}

/**
 * O brilho do neon: uma casca aditiva em volta da haste, clara no meio e transparente na borda (a luz que escapa das linhas), nas
 * cores delas. Não faz sombra nem escreve profundidade, e some perto da câmera.
 */
export function criarHalo(taco: MedidasTaco, halo: { readonly cores: readonly [number, number]; readonly intensidade: number }, segmentos: number): Mesh {
  const material = new ShaderMaterial({
    uniforms: { cores: { value: imagemDasCores(halo.cores) }, intensidade: { value: halo.intensidade * 2 }, sumico: { value: [SUMICO_DO_HALO.de, SUMICO_DO_HALO.ate] } },
    vertexShader: VERTICE,
    fragmentShader: FRAGMENTO,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const malha = new Mesh(geometriaDoHalo(taco, segmentos), material);
  malha.name = 'taco-halo';
  malha.renderOrder = 2;
  // A luz do neon não projeta sombra: o ambiente pula quem tem esta marca ao ligar as sombras.
  malha.userData.semSombra = true;
  return malha;
}

/** Solta a geometria, a imagem das cores e o material da casca. */
export function soltarHalo(halo: Mesh): void {
  halo.geometry.dispose();
  const material = halo.material as ShaderMaterial;
  (material.uniforms.cores!.value as DataTexture).dispose();
  material.dispose();
}
