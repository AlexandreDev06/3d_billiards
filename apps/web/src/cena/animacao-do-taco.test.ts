import { MeshLambertMaterial, MeshPhysicalMaterial, ShaderLib, type WebGLProgramParametersWithUniforms } from 'three';
import { describe, expect, it } from 'vitest';
import type { Varredura } from './aparencia-do-taco';
import { TEMPO_DO_TACO, definirTempoDoTaco, injetarVarredura, prepararShaderDoTaco } from './animacao-do-taco';

const VARREDURA: Varredura = { cor: 0x66ccff, intensidade: 1.5, faixas: 2, velocidade: 0.25, largura: 0.2 };
const SUMICO = { de: 0.03, ate: 0.085 };
const dosShaders = (v: string, f: string): WebGLProgramParametersWithUniforms => ({ vertexShader: v, fragmentShader: f, uniforms: {} }) as unknown as WebGLProgramParametersWithUniforms;

describe('injetarVarredura', () => {
  it('põe o uv no vértice e a faixa de luz somada ao brilho próprio, com a cor, a intensidade e a velocidade pedidas', () => {
    const s = dosShaders('void main() {\n #include <project_vertex>\n}', 'void main() {\n #include <emissivemap_fragment>\n gl_FragColor = vec4(1.0);\n}');
    injetarVarredura(s, VARREDURA);
    expect(s.vertexShader).toContain('varying vec2 vVarreduraUv;');
    expect(s.vertexShader).toContain('vVarreduraUv = uv;');
    expect(s.fragmentShader).toContain('uniform float uTempoDoTaco;');
    expect(s.fragmentShader).toContain('uTempoDoTaco * 0.2500');
    expect(s.fragmentShader).toContain('vVarreduraUv.y * 2.0000');
    expect(s.fragmentShader).toContain('totalEmissiveRadiance += vec3( 0.4000, 0.8000, 1.0000 ) * 1.5000 * luzDaVarredura;');
    // A soma entra depois do emissivo da peça e antes do resto do pixel.
    expect(s.fragmentShader.indexOf('emissivemap_fragment')).toBeLessThan(s.fragmentShader.indexOf('totalEmissiveRadiance'));
    expect(s.fragmentShader.indexOf('totalEmissiveRadiance')).toBeLessThan(s.fragmentShader.indexOf('gl_FragColor'));
  });

  it('o relógio é um uniforme só, dividido por todos os materiais', () => {
    const a = dosShaders('void main() {\n}', 'void main() {\n #include <emissivemap_fragment>\n}');
    const b = dosShaders('void main() {\n}', 'void main() {\n #include <emissivemap_fragment>\n}');
    injetarVarredura(a, VARREDURA);
    injetarVarredura(b, VARREDURA);
    expect(a.uniforms.uTempoDoTaco).toBe(TEMPO_DO_TACO);
    expect(b.uniforms.uTempoDoTaco).toBe(a.uniforms.uTempoDoTaco);
    definirTempoDoTaco(12.5);
    expect(a.uniforms.uTempoDoTaco!.value).toBe(12.5);
  });

  it.each([
    ['standard', ShaderLib.standard],
    ['physical', ShaderLib.physical],
    ['lambert', ShaderLib.lambert],
  ])('os shaders do three (%s) têm o gancho do emissivo', (_nome, lib) => {
    const s = dosShaders(lib.vertexShader, lib.fragmentShader);
    injetarVarredura(s, VARREDURA);
    expect(s.fragmentShader).toContain('luzDaVarredura');
    expect(s.vertexShader).toContain('vVarreduraUv = uv;');
  });
});

describe('prepararShaderDoTaco', () => {
  it('sem varredura: só o sumiço de perto, e a chave do programa não fala de varredura', () => {
    const m = new MeshPhysicalMaterial();
    prepararShaderDoTaco(m, SUMICO);
    expect(m.customProgramCacheKey()).toContain('sumir-perto');
    expect(m.customProgramCacheKey()).not.toContain('varredura');
    const s = dosShaders(ShaderLib.physical.vertexShader, ShaderLib.physical.fragmentShader);
    m.onBeforeCompile(s as never, undefined as never);
    expect(s.fragmentShader).toContain('discard');
    expect(s.fragmentShader).not.toContain('luzDaVarredura');
  });

  it('com varredura: o sumiço e a luz que corre, e cada varredura tem a sua chave de programa', () => {
    const m = new MeshPhysicalMaterial();
    prepararShaderDoTaco(m, SUMICO, VARREDURA);
    const s = dosShaders(ShaderLib.physical.vertexShader, ShaderLib.physical.fragmentShader);
    m.onBeforeCompile(s as never, undefined as never);
    expect(s.fragmentShader).toContain('discard');
    expect(s.fragmentShader).toContain('luzDaVarredura');
    const outro = new MeshLambertMaterial();
    prepararShaderDoTaco(outro, SUMICO, { ...VARREDURA, cor: 0xff00ff });
    expect(m.customProgramCacheKey()).toContain('varredura');
    expect(outro.customProgramCacheKey()).not.toBe(m.customProgramCacheKey());
  });
});
