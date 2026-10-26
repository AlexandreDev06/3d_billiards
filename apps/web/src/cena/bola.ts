import { CanvasTexture, Group, Mesh, MeshPhysicalMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import {
  CONFIG_FISICA_PADRAO,
  ID_BOLAO,
  medidasDaBola,
  pontoDeSaida,
  posicoesTriangulo,
  type ConfigFisica,
  type IdBola,
} from '@sinuca/fisica';
import { estiloDaBola, type CasaDasBolas, type EstiloDaBola } from './bola-estilo';
import { criarTexturaDaBola, criarTexturaDoBolao, redesenharTexturaDaBola } from './bola-textura';

export interface Bolas {
  readonly grupo: Group;
  /** Indexado por `IdBola` (0 = bolão). */
  readonly porId: readonly Mesh[];
  /** Refaz as esferas com outros segmentos (nível de qualidade) e solta as antigas. */
  definirSegmentos(segmentos: readonly [number, number]): void;
  /** As regras da casa mudaram: redesenha só as bolas cujo estilo (lisa/listrada) muda. */
  definirCasa(casa: CasaDasBolas): void;
  /** O estilo desenhado em cada bola agora, por `IdBola` (`null` no bolão). */
  readonly estilos: readonly (EstiloDaBola | null)[];
}

export interface QualidadeDasBolas {
  /** Multiplica o lado das texturas (1 = cheio). */
  readonly escalaTextura?: number;
  /** Segmentos (em volta, de polo a polo) da esfera. */
  readonly segmentos?: readonly [number, number];
}

/**
 * Gira a geometria para que, com orientação identidade, um número fique para
 * cima e legível para quem olha pelo lado de -X (a câmera de tacada em ângulo 0).
 * (180° em torno de (1,1,0): leva +X do equador do UV a +Y e o "para cima" da imagem a +X.)
 */
function orientarGeometria(geometria: SphereGeometry): void {
  geometria.applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(1, 1, 0).normalize(), Math.PI));
}

function criarMaterial(map: MeshPhysicalMaterial['map']): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ map, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 });
}

/**
 * As 16 bolas: o bolão na saída e a 1–15 nas posições do triângulo (bola n na
 * posição n − 1). É só o ponto de partida: quem joga põe cada uma onde o estado da mesa manda.
 * O desenho de cada numerada (lisa ou listrada) vem da `casa`; `definirCasa` o refaz se ela mudar.
 */
export function criarBolas(casa: CasaDasBolas, config: ConfigFisica = CONFIG_FISICA_PADRAO, anisotropia = 1, qualidade: QualidadeDasBolas = {}): Bolas {
  const grupo = new Group();
  grupo.name = 'bolas';
  const porId: Mesh[] = [];
  const texturas: (CanvasTexture | null)[] = [];
  const estilos: (EstiloDaBola | null)[] = [];

  const saida = pontoDeSaida(config.mesa);
  const triangulo = posicoesTriangulo(config.mesa, config.bola.raio);
  const escala = qualidade.escalaTextura ?? 1;
  const criarGeometrias = (segmentos: readonly [number, number]): { numerada: SphereGeometry; bolao: SphereGeometry } => {
    const numerada = new SphereGeometry(config.bola.raio, segmentos[0], segmentos[1]);
    orientarGeometria(numerada);
    return { numerada, bolao: new SphereGeometry(config.bolao.raio, segmentos[0], segmentos[1]) };
  };
  let geometrias = criarGeometrias(qualidade.segmentos ?? [48, 32]);

  for (let id: IdBola = 0; id <= 15; id++) {
    const bolao = id === ID_BOLAO;
    const estilo = bolao ? null : estiloDaBola(id, casa);
    const textura = bolao ? criarTexturaDoBolao(anisotropia, escala) : criarTexturaDaBola(id, estilo!, anisotropia, escala);
    texturas.push(textura);
    estilos.push(estilo);
    const mesh = new Mesh(bolao ? geometrias.bolao : geometrias.numerada, criarMaterial(textura));
    mesh.name = bolao ? 'bolao' : `bola-${id}`;
    const raio = medidasDaBola(id, config).raio;
    const posicao = bolao ? saida : triangulo[id - 1]!;
    mesh.position.set(posicao.x, raio, posicao.z);
    porId.push(mesh);
    grupo.add(mesh);
  }
  return {
    grupo,
    porId,
    estilos,
    definirSegmentos(segmentos) {
      const antigas = geometrias;
      geometrias = criarGeometrias(segmentos);
      porId.forEach((mesh, id) => (mesh.geometry = id === ID_BOLAO ? geometrias.bolao : geometrias.numerada));
      antigas.numerada.dispose();
      antigas.bolao.dispose();
    },
    definirCasa(nova) {
      for (let id = 1; id <= 15; id++) {
        const estilo = estiloDaBola(id, nova);
        if (estilo === estilos[id]) continue;
        redesenharTexturaDaBola(texturas[id]!, id, estilo);
        estilos[id] = estilo;
      }
    },
  };
}
