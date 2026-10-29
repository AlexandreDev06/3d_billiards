import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG_WEB, type PerfilDeQualidade } from '../config';
import type { NivelDeDetalhe } from '@sinuca/personagens/three';
import type { Ambiente } from './ambiente';
import { segmentosDoTaco, detalheDasMaos, detalheDoTacoNoNivel } from '../qualidade/perfis';
import type { DetalheDoTaco } from './detalhe-do-taco';
import { AplicadorDeQualidade } from './aplicador-qualidade';
import type { Bolas } from './bola';
import type { VariantesDeMateriais } from './variantes-materiais';

const { alta, media, baixa } = CONFIG_WEB.qualidade.perfis;

function montar(janela = { largura: 1280, altura: 720, pixelRatio: 1 }, anisotropiaDoRenderer = 8, comTaco = false, comPersonagens = false) {
  const chamadas: string[] = [];
  const pixelRatios: number[] = [];
  const tamanhos: [number, number][] = [];
  const renderer = {
    capabilities: { getMaxAnisotropy: () => anisotropiaDoRenderer },
    setPixelRatio: (r: number) => void pixelRatios.push(r),
    setSize: (l: number, a: number) => void tamanhos.push([l, a]),
  } as unknown as WebGLRenderer;
  const ambiente = { aplicarQualidade: (p: PerfilDeQualidade) => void chamadas.push(`ambiente:${p.nivel}`), atualizar() {}, atualizarMetais() {}, dispose() {} } as Ambiente;
  const segmentos: (readonly [number, number])[] = [];
  const bolas = { definirSegmentos: (s: readonly [number, number]) => void segmentos.push(s) } as unknown as Bolas;
  const variantes = { aplicar: (e: { materiais: string; ambiente: boolean }) => void chamadas.push(`materiais:${e.materiais}/${e.ambiente}`) } as unknown as VariantesDeMateriais;
  const ladosDoTaco: number[] = [];
  const detalhesDoTaco: DetalheDoTaco[] = [];
  const detalhesDasMaosPedidos: NivelDeDetalhe[] = [];
  const textura = new Texture();
  textura.anisotropy = 16;
  const raiz = new Group();
  raiz.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: textura })));
  const estado = { janela };
  const aplicador = new AplicadorDeQualidade({
    renderer,
    ambiente,
    bolas,
    variantes,
    raizes: [raiz],
    janela: () => estado.janela,
    ...(comTaco ? { taco: { definirSegmentos: (n: number) => void ladosDoTaco.push(n), definirDetalhe: (d: DetalheDoTaco) => void detalhesDoTaco.push(d) } } : {}),
    ...(comPersonagens ? { personagens: { definirLados() {}, definirDetalheDasMaos: (n: NivelDeDetalhe) => void detalhesDasMaosPedidos.push(n) } } : {}),
  });
  return { aplicador, chamadas, pixelRatios, tamanhos, segmentos, textura, estado, ladosDoTaco, detalhesDoTaco, detalhesDasMaosPedidos };
}

describe('AplicadorDeQualidade', () => {
  it('aplica o perfil: escala de desenho, ambiente e materiais', () => {
    const { aplicador, chamadas, pixelRatios, tamanhos } = montar();
    aplicador.aplicar(baixa);
    expect(pixelRatios).toHaveLength(1);
    expect(pixelRatios[0]).toBeCloseTo(0.75, 1);
    expect(tamanhos).toEqual([[1280, 720]]);
    expect(chamadas).toEqual(['ambiente:baixa', 'materiais:leves/false']);
    expect(aplicador.perfil).toBe(baixa);
    expect(aplicador.razaoDePixels).toBeCloseTo(0.75, 1);
  });

  it('a alta usa o pixelRatio do navegador (até 2); a janela é lida na hora', () => {
    const { aplicador, pixelRatios, estado } = montar({ largura: 1920, altura: 1080, pixelRatio: 1.5 });
    aplicador.aplicar(alta);
    expect(pixelRatios.at(-1)).toBe(1.5);
    estado.janela = { largura: 1920, altura: 1080, pixelRatio: 3 };
    aplicador.redimensionar();
    expect(pixelRatios.at(-1)).toBe(2);
  });

  it('redimensionar antes de haver perfil não faz nada', () => {
    const { aplicador, pixelRatios, tamanhos } = montar();
    aplicador.redimensionar();
    expect(pixelRatios).toEqual([]);
    expect(tamanhos).toEqual([]);
  });

  it('a anisotropia das texturas desce para o teto do nível, nunca passa do que a placa aceita, e só reenvia a textura se mudou', () => {
    const { aplicador, textura } = montar(undefined, 8);
    const versao = textura.version;
    aplicador.aplicar(alta);
    expect(textura.anisotropy).toBe(8);
    aplicador.aplicar(media);
    expect(textura.anisotropy).toBe(4);
    const depois = textura.version;
    expect(depois).toBeGreaterThan(versao);
    aplicador.aplicar({ ...media, nivel: 'media' });
    expect(textura.version).toBe(depois);
    aplicador.aplicar(baixa);
    expect(textura.anisotropy).toBe(1);
  });

  it('os segmentos das esferas só são refeitos quando mudam, e não na primeira aplicação (a abertura já nasceu com eles)', () => {
    const { aplicador, segmentos } = montar();
    aplicador.aplicar(alta);
    expect(segmentos).toEqual([]);
    aplicador.aplicar(alta);
    expect(segmentos).toEqual([]);
    aplicador.aplicar(baixa);
    expect(segmentos).toEqual([baixa.segmentosEsfera]);
    aplicador.aplicar(baixa);
    expect(segmentos).toHaveLength(1);
    aplicador.aplicar(alta);
    expect(segmentos).toEqual([baixa.segmentosEsfera, alta.segmentosEsfera]);
  });

  it('os lados do taco só são refeitos quando mudam, e não na primeira aplicação', () => {
    const { aplicador, ladosDoTaco } = montar(undefined, 8, true);
    aplicador.aplicar(alta);
    expect(ladosDoTaco).toEqual([]);
    aplicador.aplicar(baixa);
    expect(ladosDoTaco).toEqual([segmentosDoTaco(baixa)]);
    aplicador.aplicar(baixa);
    expect(ladosDoTaco).toHaveLength(1);
    aplicador.aplicar(media);
    expect(ladosDoTaco).toEqual([segmentosDoTaco(baixa), segmentosDoTaco(media)]);
  });

  it('L35: o detalhe do taco (trama, película, animação) vai na primeira aplicação (o jogo pode começar na baixa) e depois só quando o nível o muda', () => {
    const { aplicador, detalhesDoTaco } = montar(undefined, 8, true);
    aplicador.aplicar(alta);
    expect(detalhesDoTaco).toEqual([detalheDoTacoNoNivel(alta)]);
    aplicador.aplicar(baixa);
    expect(detalhesDoTaco).toEqual([detalheDoTacoNoNivel(alta), detalheDoTacoNoNivel(baixa)]);
    aplicador.aplicar(baixa);
    expect(detalhesDoTaco).toHaveLength(2);
    aplicador.aplicar(media); // a média muda a trama e a película em relação à baixa
    expect(detalhesDoTaco[2]).toEqual(detalheDoTacoNoNivel(media));
    aplicador.aplicar(alta); // a alta liga a película de novo
    expect(detalhesDoTaco).toHaveLength(4);
  });

  it('L35: o taco que começa na baixa já recebe o detalhe simples na primeira aplicação', () => {
    const { aplicador, detalhesDoTaco } = montar(undefined, 8, true);
    aplicador.aplicar(baixa);
    expect(detalhesDoTaco).toEqual([detalheDoTacoNoNivel(baixa)]);
  });

  it('o detalhe das mãos só é refeito quando mudam, e não na primeira aplicação', () => {
    const { aplicador, detalhesDasMaosPedidos } = montar(undefined, 8, false, true);
    aplicador.aplicar(alta);
    expect(detalhesDasMaosPedidos).toEqual([]);
    aplicador.aplicar(baixa);
    expect(detalhesDasMaosPedidos).toEqual([detalheDasMaos(baixa)]);
    aplicador.aplicar(baixa);
    expect(detalhesDasMaosPedidos).toHaveLength(1);
    aplicador.aplicar(alta);
    expect(detalhesDasMaosPedidos).toEqual([detalheDasMaos(baixa), detalheDasMaos(alta)]);
  });

  it('sem taco ligado não há o que refazer', () => {
    const { aplicador } = montar();
    aplicador.aplicar(alta);
    expect(() => aplicador.aplicar(baixa)).not.toThrow();
  });

  it('reaplicar refaz as variantes do nível de agora (a skin do taco trocou os materiais), e antes de qualquer nível não faz nada', () => {
    const { aplicador, chamadas } = montar();
    aplicador.reaplicar();
    expect(chamadas).toEqual([]);
    aplicador.aplicar(baixa);
    chamadas.length = 0;
    aplicador.reaplicar();
    expect(chamadas).toEqual(['materiais:leves/false']);
  });
});
