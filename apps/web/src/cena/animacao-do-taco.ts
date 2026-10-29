import type { Material, WebGLProgramParametersWithUniforms } from 'three';
import type { Varredura } from './aparencia-do-taco';
import { injetarSumicoPerto, type FaixaDoSumiço } from './sumir-perto';

/**
 * O brilho animado das skins (L35): uma faixa de luz que corre pela peça no tempo. O relógio é um uniforme só, dividido por todos os
 * materiais de todos os tacos (a página o atualiza uma vez por quadro com `definirTempoDoTaco`), então animar não custa quadro
 * a mais que a conta do pixel; o nível baixo não injeta a varredura e fica sem nenhuma conta a mais.
 */
export const TEMPO_DO_TACO: { value: number } = { value: 0 };

/** Atualiza o relógio das varreduras de luz (segundos, de qualquer origem; só a diferença importa). */
export function definirTempoDoTaco(segundos: number): void {
  TEMPO_DO_TACO.value = segundos;
}

type Shader = Pick<WebGLProgramParametersWithUniforms, 'vertexShader' | 'fragmentShader'> & { readonly uniforms?: WebGLProgramParametersWithUniforms['uniforms'] };

const f = (n: number): string => n.toFixed(4);

/**
 * Edita o código dos shaders (Lambert, Standard ou Physical) para somar ao brilho próprio da peça uma faixa de luz que corre ao longo
 * dela: `faixas` faixas por peça, em hélice (uma volta por período, sem emenda em volta), na velocidade da `Varredura`. Puro (texto in,
 * texto out), para testar sem WebGL. O uniforme `uTempoDoTaco` é o de `TEMPO_DO_TACO`.
 */
export function injetarVarredura(shader: Shader, v: Varredura): void {
  if (shader.uniforms) shader.uniforms.uTempoDoTaco = TEMPO_DO_TACO;
  shader.vertexShader = shader.vertexShader.replace('void main() {', 'varying vec2 vVarreduraUv;\nvoid main() {\n  vVarreduraUv = uv;');
  const r = ((v.cor >> 16) & 255) / 255;
  const g = ((v.cor >> 8) & 255) / 255;
  const b = (v.cor & 255) / 255;
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'varying vec2 vVarreduraUv;\nuniform float uTempoDoTaco;\nvoid main() {')
    .replace(
      '#include <emissivemap_fragment>',
      [
        '#include <emissivemap_fragment>',
        `  float faseDaVarredura = fract( vVarreduraUv.y * ${f(v.faixas)} - uTempoDoTaco * ${f(v.velocidade)} + vVarreduraUv.x );`,
        `  float luzDaVarredura = smoothstep( 0.0, ${f(v.largura * 0.5)}, faseDaVarredura ) * ( 1.0 - smoothstep( ${f(v.largura * 0.5)}, ${f(v.largura)}, faseDaVarredura ) );`,
        `  totalEmissiveRadiance += vec3( ${f(r)}, ${f(g)}, ${f(b)} ) * ${f(v.intensidade)} * luzDaVarredura;`,
      ].join('\n'),
    );
}

/**
 * Liga ao material o sumiço perto da câmera (sempre) e, se a skin pede e o nível deixa, a varredura de luz. As variantes de qualidade
 * (`VariantesDeMateriais`) herdam o gancho do original.
 */
export function prepararShaderDoTaco(material: Material, sumico: FaixaDoSumiço, varredura?: Varredura): void {
  material.onBeforeCompile = (shader) => {
    injetarSumicoPerto(shader, sumico);
    if (varredura) injetarVarredura(shader, varredura);
  };
  const chave = `sumir-perto-${sumico.de}-${sumico.ate}`;
  material.customProgramCacheKey = varredura ? () => `${chave}-varredura-${varredura.cor}-${varredura.intensidade}-${varredura.faixas}-${varredura.velocidade}-${varredura.largura}` : () => chave;
}
