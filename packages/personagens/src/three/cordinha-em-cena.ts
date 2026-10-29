import { Quaternion, Vector3, type Object3D } from 'three';
import { CordinhaSimulada, type OpcoesDaCordinha } from '../cordinha';
import type { CordinhaDaMeta } from '../meta-do-rosto';

const NOME_DO_OSSO = /^cordinha_(\d+)$/;

/** Os ossos da cordinha, do nó para a ponta: os do meta v2, ou, sem meta, os `cordinha_N` do esqueleto em ordem. */
function nomesDosOssos(cena: Object3D, meta: CordinhaDaMeta | null): string[] {
  if (meta !== null) return [...meta.ossos];
  const achados: { n: number; nome: string }[] = [];
  cena.traverse((o) => {
    const m = NOME_DO_OSSO.exec(o.name);
    if (m !== null) achados.push({ n: Number(m[1]), nome: o.name });
  });
  return achados.sort((a, b) => a.n - b.n).map((a) => a.nome);
}

/** O quanto o comprimento do meta pode diferir do medido no esqueleto (fração do medido). */
const TOLERANCIA_DO_COMPRIMENTO = 0.2;

function conferirComprimentos(nomes: readonly string[], ossos: readonly Object3D[], doMeta: readonly number[]): void {
  for (let i = 0; i < ossos.length - 1; i++) {
    const medido = ossos[i + 1]!.position.length();
    if (medido <= 1e-9) continue;
    if (Math.abs(doMeta[i]! - medido) > TOLERANCIA_DO_COMPRIMENTO * medido) {
      throw new Error(
        `meta: cordinha.comprimento_de_cada_junta_m[${i}] é ${doMeta[i]} m, mas o osso "${nomes[i]}" mede ${medido.toFixed(5)} m até "${nomes[i + 1]}" no esqueleto`,
      );
    }
  }
}

const qPai = new Quaternion();
const qDoNo = new Quaternion();
const ancora = new Vector3();
const saida = new Vector3();
const escalaDoMundo = new Vector3();
const direcao = new Vector3();
const repousoNoPai = new Vector3();
const giro = new Quaternion();

/**
 * A cordinha do personagem em cena: a corrente de ossos (`cordinha_1..N`, do nó para baixo) guiada por uma `CordinhaSimulada`
 * depois do mixer. A âncora é o primeiro osso (onde o nó o prende); os outros pontos da simulação são os ossos seguintes. A cada
 * quadro lê onde o nó está no mundo (com tudo o que a ação, a deriva e o jogo fizeram), anda a simulação em passo fixo e gira cada
 * osso do repouso para a direção do elo, **de modo que o elo do osso continue com o comprimento do esqueleto** (por isso o
 * comprimento é o medido nos ossos, e o do meta só vale se o osso filho faltar). A ponta fica com a rotação de repouso do pai.
 * Sem meta, um osso que falta ou fora de ordem na hierarquia desliga o recurso; com meta simulado, lança. Nada aloca por quadro.
 */
export class CordinhaEmCena {
  private readonly ossos: Object3D[];
  private readonly repouso: Quaternion[];
  /** Onde, no referencial do osso, fica o osso filho (unitário). */
  private readonly eixos: Vector3[];
  private readonly simulacao: CordinhaSimulada;
  /** A direção em que o primeiro elo sai do nó, no referencial do pai do primeiro osso. */
  private readonly saidaNoPai = new Vector3();
  private readonly pai: Object3D;

  /**
   * Devolve `null` se não há meta e a cena não tem os ossos `cordinha_N`, ou se o meta diz que a cordinha não é simulada. Com meta
   * simulado, o que não confere com o esqueleto **lança** dizendo o campo: osso que falta, osso fora da ordem da hierarquia, ou
   * comprimento do meta (`cordinha.comprimento_de_cada_junta_m`) que difere do medido no esqueleto em mais de 20%.
   */
  static criar(cena: Object3D, meta: CordinhaDaMeta | null, opcoes: Partial<OpcoesDaCordinha> = {}): CordinhaEmCena | null {
    if (meta !== null && !meta.simulada) return null;
    const nomes = nomesDosOssos(cena, meta);
    if (nomes.length < 2) return null;
    const ossos: Object3D[] = [];
    for (const nome of nomes) {
      const osso = cena.getObjectByName(nome);
      if (osso === undefined) {
        if (meta !== null) throw new Error(`meta: cordinha.ossos "${nome}" não existe no esqueleto`);
        return null;
      }
      ossos.push(osso);
    }
    for (let i = 1; i < ossos.length; i++) {
      if (ossos[i]!.parent !== ossos[i - 1]) {
        if (meta !== null) throw new Error(`meta: cordinha.ossos "${nomes[i]}" não é filho de "${nomes[i - 1]}" no esqueleto`);
        return null;
      }
    }
    if (ossos[0]!.parent === null) return null;
    if (meta?.comprimentosM != null) conferirComprimentos(nomes, ossos, meta.comprimentosM);
    return new CordinhaEmCena(ossos, meta, opcoes);
  }

  private constructor(ossos: Object3D[], meta: CordinhaDaMeta | null, opcoes: Partial<OpcoesDaCordinha>) {
    this.ossos = ossos;
    this.pai = ossos[0]!.parent!;
    this.repouso = ossos.map((o) => o.quaternion.clone());
    this.eixos = ossos.map((_, i) => {
      // a ponta não tem filho e só herda a rotação de repouso: o eixo dela não é usado
      const v = ossos[i + 1]?.position.clone() ?? new Vector3(0, 1, 0);
      return v.lengthSq() > 1e-18 ? v.normalize() : new Vector3(0, 1, 0);
    });
    const comprimentos: number[] = [];
    for (let i = 0; i < ossos.length - 1; i++) {
      const medido = ossos[i + 1]!.position.length();
      const doMeta = meta?.comprimentosM?.[i];
      comprimentos.push(medido > 1e-9 ? medido : (doMeta ?? 0.02));
    }
    this.simulacao = new CordinhaSimulada(comprimentos, opcoes);
    this.pai.updateWorldMatrix(true, false);
    ossos[0]!.updateWorldMatrix(true, false);
    ossos[1]!.updateWorldMatrix(true, false);
    this.pai.getWorldQuaternion(qDoNo).invert();
    this.saidaNoPai
      .setFromMatrixPosition(ossos[1]!.matrixWorld)
      .sub(ancora.setFromMatrixPosition(ossos[0]!.matrixWorld))
      .applyQuaternion(qDoNo)
      .normalize();
    if (this.saidaNoPai.lengthSq() < 0.5) this.saidaNoPai.set(0, -1, 0);
  }

  /** Quantos ossos a corrente tem. */
  get quantidadeDeOssos(): number {
    return this.ossos.length;
  }

  /** A simulação (para os testes e o diagnóstico). */
  get cordinha(): CordinhaSimulada {
    return this.simulacao;
  }

  /** O balão apareceu em outro lugar: a corrente recomeça pendurada, em vez de ser arrastada. */
  reiniciar(): void {
    this.sincronizar();
    this.simulacao.reiniciar(ancora.x, ancora.y, ancora.z, saida.x, saida.y, saida.z);
    this.girarOssos();
  }

  /** Depois do mixer e de tudo o que mexe no corpo: anda a simulação e leva os ossos aos pontos dela. */
  atualizar(dt: number): void {
    this.sincronizar();
    this.simulacao.atualizar(dt, ancora.x, ancora.y, ancora.z, saida.x, saida.y, saida.z);
    this.girarOssos();
  }

  /** Lê, no mundo, a âncora (o primeiro osso), a direção de saída e a escala que a corrente tem agora. */
  private sincronizar(): void {
    const primeiro = this.ossos[0]!;
    primeiro.updateWorldMatrix(true, false);
    ancora.setFromMatrixPosition(primeiro.matrixWorld);
    this.pai.getWorldQuaternion(qPai);
    saida.copy(this.saidaNoPai).applyQuaternion(qPai);
    escalaDoMundo.setFromMatrixScale(this.pai.matrixWorld);
    this.simulacao.escala = (escalaDoMundo.x + escalaDoMundo.y + escalaDoMundo.z) / 3;
  }

  private girarOssos(): void {
    const { pontos } = this.simulacao;
    const n = this.ossos.length;
    for (let i = 0; i < n - 1; i++) {
      const osso = this.ossos[i]!;
      const pai = osso.parent!;
      pai.updateWorldMatrix(true, false);
      pai.getWorldQuaternion(qPai).invert();
      const b = i * 3;
      direcao.set(pontos[b + 3]! - pontos[b]!, pontos[b + 4]! - pontos[b + 1]!, pontos[b + 5]! - pontos[b + 2]!).applyQuaternion(qPai);
      if (direcao.lengthSq() < 1e-18) continue;
      direcao.normalize();
      // para onde o osso apontava no repouso, no referencial do pai
      repousoNoPai.copy(this.eixos[i]!).applyQuaternion(this.repouso[i]!);
      giro.setFromUnitVectors(repousoNoPai, direcao);
      osso.quaternion.copy(giro).multiply(this.repouso[i]!);
    }
    // a ponta herda a curva de repouso em relação ao pai, que já girou
    this.ossos[n - 1]!.quaternion.copy(this.repouso[n - 1]!);
  }
}
