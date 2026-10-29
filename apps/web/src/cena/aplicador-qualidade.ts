import type { NivelDeDetalhe } from '@sinuca/personagens/three';
import { Material, Mesh, Texture, type Object3D, type WebGLRenderer } from 'three';
import type { PerfilDeQualidade } from '../config';
import { detalheDoTacoNoNivel, haloDoTacoNoNivel, ladosDosPersonagens, razaoDePixels, segmentosDoTaco, detalheDasMaos } from '../qualidade/perfis';
import { mesmoDetalhe, type DetalheDoTaco } from './detalhe-do-taco';
import type { Ambiente } from './ambiente';
import type { Bolas } from './bola';
import type { VariantesDeMateriais } from './variantes-materiais';

export interface DependenciasDoAplicador {
  readonly renderer: WebGLRenderer;
  readonly ambiente: Ambiente;
  readonly bolas: Bolas;
  readonly variantes: VariantesDeMateriais;
  /** O que tem texturas a ajustar (mesa, bolas, taco). */
  readonly raizes: readonly Object3D[];
  /** O taco: com menos lados em cada peça nos níveis baixos (opcional: sem ele, nada a refazer). */
  readonly taco?: {
    definirSegmentos(segmentos: number): void;
    definirHalo?(ligado: boolean): void;
    /** O que o taco desenha no nível (L35): quem o refaz também renova as variantes dos materiais que saíram. */
    definirDetalhe?(detalhe: DetalheDoTaco): void;
  };
  /** Os balões e o giz com menos lados e as mãos com a malha baixa no nível baixo (opcional). */
  readonly personagens?: { definirLados(lados: number): void; definirDetalheDasMaos?(nivel: NivelDeDetalhe): void };
  /** O tamanho da janela e o pixelRatio do navegador, lidos na hora (podem mudar). */
  readonly janela: () => { readonly largura: number; readonly altura: number; readonly pixelRatio: number };
}

/**
 * Leva um `PerfilDeQualidade` à cena: escala de desenho, sombra, luz retangular e reflexo de sala (pelo
 * `Ambiente`), materiais (físicos ou standard), anisotropia das texturas e segmentos das esferas. Cada
 * peça só se mexe quando o valor muda de um perfil para o outro. O antialias e o tamanho das texturas
 * são decididos na abertura (`PerfilDeQualidade`).
 */
export class AplicadorDeQualidade {
  private perfilAtual: PerfilDeQualidade | null = null;
  private razaoAtual = 1;
  private readonly anisotropiaMaxima: number;

  constructor(private readonly d: DependenciasDoAplicador) {
    this.anisotropiaMaxima = d.renderer.capabilities.getMaxAnisotropy();
  }

  get perfil(): PerfilDeQualidade | null {
    return this.perfilAtual;
  }

  /** A escala de desenho de agora (pixels do buffer por pixel de CSS). */
  get razaoDePixels(): number {
    return this.razaoAtual;
  }

  aplicar(perfil: PerfilDeQualidade): void {
    const anterior = this.perfilAtual;
    this.perfilAtual = perfil;
    this.redimensionar();
    this.d.ambiente.aplicarQualidade(perfil);
    // O detalhe do taco troca os materiais originais: vem antes das variantes, que se fazem sobre os novos.
    const detalhe = detalheDoTacoNoNivel(perfil);
    if (anterior === null || !mesmoDetalhe(detalheDoTacoNoNivel(anterior), detalhe)) this.d.taco?.definirDetalhe?.(detalhe);
    this.d.variantes.aplicar({ materiais: perfil.materiais, ambiente: perfil.ambiente });
    if (anterior === null || anterior.anisotropiaMax !== perfil.anisotropiaMax) this.aplicarAnisotropia(perfil.anisotropiaMax);
    if (anterior !== null && (anterior.segmentosEsfera[0] !== perfil.segmentosEsfera[0] || anterior.segmentosEsfera[1] !== perfil.segmentosEsfera[1])) {
      this.d.bolas.definirSegmentos(perfil.segmentosEsfera);
    }
    if (anterior !== null && segmentosDoTaco(anterior) !== segmentosDoTaco(perfil)) this.d.taco?.definirSegmentos(segmentosDoTaco(perfil));
    if (anterior !== null && ladosDosPersonagens(anterior) !== ladosDosPersonagens(perfil)) this.d.personagens?.definirLados(ladosDosPersonagens(perfil));
    if (anterior !== null && detalheDasMaos(anterior) !== detalheDasMaos(perfil)) this.d.personagens?.definirDetalheDasMaos?.(detalheDasMaos(perfil));
    // O brilho do neon (uma casca aditiva em volta da haste) só nos níveis com sobra de quadro.
    this.d.taco?.definirHalo?.(haloDoTacoNoNivel(perfil));
  }

  /** Os materiais de alguma raiz foram trocados (skin do taco): refaz as variantes do nível de agora. */
  reaplicar(): void {
    if (this.perfilAtual !== null) this.d.variantes.aplicar({ materiais: this.perfilAtual.materiais, ambiente: this.perfilAtual.ambiente });
  }

  /** A janela mudou de tamanho (ou o nível mudou): refaz o buffer na escala do nível. */
  redimensionar(): void {
    if (this.perfilAtual === null) return;
    const { largura, altura, pixelRatio } = this.d.janela();
    this.razaoAtual = razaoDePixels(this.perfilAtual, pixelRatio, largura, altura);
    this.d.renderer.setPixelRatio(this.razaoAtual);
    this.d.renderer.setSize(largura, altura);
  }

  private aplicarAnisotropia(maximo: number): void {
    const valor = Math.min(maximo, this.anisotropiaMaxima);
    const vistas = new Set<Texture>();
    for (const raiz of this.d.raizes) {
      raiz.traverse((objeto) => {
        if (!(objeto instanceof Mesh)) return;
        for (const material of Array.isArray(objeto.material) ? objeto.material : [objeto.material]) {
          if (!(material instanceof Material)) continue;
          for (const textura of Object.values(material)) {
            if (textura instanceof Texture && !vistas.has(textura)) {
              vistas.add(textura);
              if (textura.anisotropy !== valor) {
                textura.anisotropy = valor;
                textura.needsUpdate = true;
              }
            }
          }
        }
      });
    }
  }
}
