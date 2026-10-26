import type { Material, WebGLProgramParametersWithUniforms } from 'three';

/** Entre `de` e `ate` metros da câmera o trecho do taco vai de sumido a inteiro. */
export interface FaixaDoSumiço {
  readonly de: number;
  readonly ate: number;
}

type Shader = Pick<WebGLProgramParametersWithUniforms, 'vertexShader' | 'fragmentShader'>;

const VARYING = 'vDistanciaDaCamera';

/**
 * Edita o código dos shaders de um material do three (Basic, Lambert, Standard ou Physical) para o que está perto da câmera sumir
 * aos poucos: a distância em cada pixel entra num ruído em grade da tela (`discard` onde a fração que sobra é menor que o ruído),
 * então não precisa de transparência, de ordenação nem de passada extra. Puro (texto in, texto out), para testar sem WebGL.
 */
export function injetarSumicoPerto(shader: Shader, faixa: FaixaDoSumiço): void {
  const f = (n: number): string => n.toFixed(5);
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', `varying float ${VARYING};\nvoid main() {`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n  ${VARYING} = length( mvPosition.xyz );`);
  shader.fragmentShader = shader.fragmentShader.replace(
    'void main() {',
    [
      `varying float ${VARYING};`,
      'void main() {',
      `  float sobraPerto = smoothstep( ${f(faixa.de)}, ${f(faixa.ate)}, ${VARYING} );`,
      // Ruído de gradiente entrelaçado (Jimenez): 0 a 1, bem espalhado pelos pixels vizinhos.
      '  float ruidoDaTela = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );',
      '  if ( sobraPerto <= ruidoDaTela ) discard;',
    ].join('\n'),
  );
}

/**
 * Faz o material fazer o trecho perto da câmera sumir (`injetarSumicoPerto`). As variantes de qualidade (`VariantesDeMateriais`)
 * levam o mesmo gancho para as cópias.
 */
export function sumirPerto(material: Material, faixa: FaixaDoSumiço): void {
  material.onBeforeCompile = (shader) => injetarSumicoPerto(shader, faixa);
  material.customProgramCacheKey = () => `sumir-perto-${faixa.de}-${faixa.ate}`;
}
