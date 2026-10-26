import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Group, Mesh, MeshBasicMaterial } from 'three';
import type { ConfigPrevisao } from '../config';
import type { CaminhoPrevisto } from '../previsao/caminho';
import { escreverFita, indicesDaFita } from '../previsao/fita';
import type { SaidaDaPrevisao } from '../previsao/previsao';

/** Trechos que o caminho do bolão comporta: os pontos de `CaminhoPrevisto` (1024) dão até 1023. */
const TRECHOS_DO_CAMINHO = 1024;
/** Depois das marcas do pano (1), antes de qualquer outra coisa translúcida. */
const ORDEM_DE_DESENHO = 2;

export interface LinhaDePrevisao extends SaidaDaPrevisao {
  readonly grupo: Group;
  dispose(): void;
}

interface Faixa {
  readonly malha: Mesh;
  readonly posicoes: BufferAttribute;
  readonly geometria: BufferGeometry;
}

function criarFaixa(trechos: number, cor: number, opacidade: number): Faixa {
  const geometria = new BufferGeometry();
  const posicoes = new BufferAttribute(new Float32Array(trechos * 12), 3);
  posicoes.setUsage(DynamicDrawUsage);
  geometria.setAttribute('position', posicoes);
  geometria.setIndex(new BufferAttribute(indicesDaFita(trechos), 1));
  geometria.setDrawRange(0, 0);
  // Sem iluminação nem tonemapping: a cor configurada é a que aparece; translúcida para ser discreta e
  // sem escrever profundidade, para os trechos que se sobrepõem nas quinas não se recortarem.
  const material = new MeshBasicMaterial({ color: cor, transparent: true, opacity: opacidade, depthWrite: false, toneMapped: false, side: DoubleSide });
  const malha = new Mesh(geometria, material);
  malha.frustumCulled = false;
  malha.renderOrder = ORDEM_DE_DESENHO;
  return { malha, posicoes, geometria };
}

/**
 * A linha de previsão na mesa: duas faixas finas e translúcidas logo acima do pano, uma com o caminho
 * do bolão e outra, curta, com a saída da primeira bola atingida. Os vértices são reescritos num
 * buffer fixo a cada cálculo; o desenho por quadro não aloca.
 */
export function criarLinhaDePrevisao(cfg: ConfigPrevisao['linha']): LinhaDePrevisao {
  const bolao = criarFaixa(TRECHOS_DO_CAMINHO, cfg.corBolao, cfg.opacidade);
  const atingida = criarFaixa(1, cfg.corBolaAtingida, cfg.opacidade);
  const corDe = (faixa: Faixa): Color => (faixa.malha.material as MeshBasicMaterial).color;
  const grupo = new Group();
  grupo.name = 'linha-previsao';
  grupo.visible = false;
  grupo.add(bolao.malha, atingida.malha);
  const extremos = new Float32Array(4);

  return {
    grupo,
    mostrar(caminho: CaminhoPrevisto, comBolaAtingida: boolean): void {
      const trechos = escreverFita(caminho.pontos, caminho.quantidade, cfg.largura, cfg.altura, bolao.posicoes.array as Float32Array);
      bolao.posicoes.needsUpdate = true;
      bolao.geometria.setDrawRange(0, trechos * 6);

      const a = caminho.atingida;
      let trechosAtingida = 0;
      if (comBolaAtingida && a.comprimento > 0) {
        extremos[0] = a.x;
        extremos[1] = a.z;
        extremos[2] = a.x + a.dx * a.comprimento;
        extremos[3] = a.z + a.dz * a.comprimento;
        trechosAtingida = escreverFita(extremos, 2, cfg.largura, cfg.altura, atingida.posicoes.array as Float32Array);
        atingida.posicoes.needsUpdate = true;
      }
      atingida.geometria.setDrawRange(0, trechosAtingida * 6);
      atingida.malha.visible = trechosAtingida > 0;
      grupo.visible = true;
    },
    esconder(): void {
      grupo.visible = false;
    },
    definirRisco(emRisco: boolean): void {
      corDe(bolao).setHex(emRisco ? cfg.corRisco : cfg.corBolao);
      corDe(atingida).setHex(emRisco ? cfg.corRisco : cfg.corBolaAtingida);
    },
    dispose(): void {
      for (const faixa of [bolao, atingida]) {
        faixa.geometria.dispose();
        (faixa.malha.material as MeshBasicMaterial).dispose();
      }
    },
  };
}
