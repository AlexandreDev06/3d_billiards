import { MeshBasicMaterial, MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial, ShaderLib, type WebGLProgramParametersWithUniforms } from 'three';
import { describe, expect, it } from 'vitest';
import { injetarSumicoPerto, sumirPerto } from './sumir-perto';

const faixa = { de: 0.08, ate: 0.25 };
const dosShaders = (v: string, f: string): WebGLProgramParametersWithUniforms => ({ vertexShader: v, fragmentShader: f }) as WebGLProgramParametersWithUniforms;

describe('injetarSumicoPerto', () => {
  it('põe a distância à câmera no vértice e o descarte pelo ruído no pixel', () => {
    const s = dosShaders('void main() {\n #include <project_vertex>\n}', 'void main() {\n gl_FragColor = vec4(1.0);\n}');
    injetarSumicoPerto(s, faixa);
    expect(s.vertexShader).toContain('varying float vDistanciaDaCamera;');
    expect(s.vertexShader).toContain('vDistanciaDaCamera = length( mvPosition.xyz );');
    expect(s.fragmentShader).toContain('smoothstep( 0.08000, 0.25000, vDistanciaDaCamera )');
    expect(s.fragmentShader).toContain('if ( sobraPerto <= ruidoDaTela ) discard;');
    // O descarte vem antes de tudo o resto do pixel.
    expect(s.fragmentShader.indexOf('discard')).toBeLessThan(s.fragmentShader.indexOf('gl_FragColor'));
  });

  it.each([
    ['basic', ShaderLib.basic],
    ['lambert', ShaderLib.lambert],
    ['standard', ShaderLib.standard],
    ['physical', ShaderLib.physical],
  ])('os shaders do three (%s) têm onde editar: um main e o project_vertex', (_nome, lib) => {
    const s = dosShaders(lib.vertexShader, lib.fragmentShader);
    injetarSumicoPerto(s, faixa);
    expect(s.vertexShader).toContain('vDistanciaDaCamera = length( mvPosition.xyz );');
    expect(s.fragmentShader).toContain('discard');
    expect(s.vertexShader.match(/vDistanciaDaCamera/g)!.length).toBe(2);
  });
});

describe('sumirPerto', () => {
  it.each([new MeshBasicMaterial(), new MeshLambertMaterial(), new MeshStandardMaterial(), new MeshPhysicalMaterial()])(
    'o material %# ganha o gancho de compilação e uma chave própria de programa',
    (material) => {
      sumirPerto(material, faixa);
      expect(material.onBeforeCompile).toBeTypeOf('function');
      expect(material.customProgramCacheKey()).toContain('sumir-perto');
      const s = dosShaders('void main() {\n #include <project_vertex>\n}', 'void main() {\n}');
      material.onBeforeCompile(s, undefined as never);
      expect(s.fragmentShader).toContain('discard');
    },
  );

  it('faixas diferentes não dividem o programa compilado', () => {
    const a = new MeshBasicMaterial();
    const b = new MeshBasicMaterial();
    sumirPerto(a, faixa);
    sumirPerto(b, { de: 0.1, ate: 0.3 });
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
  });
});
