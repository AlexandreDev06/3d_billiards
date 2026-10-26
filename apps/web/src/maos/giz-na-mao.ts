import type { ContatoDePinca } from '@sinuca/personagens';
import type { EixoDoTaco } from './eixo';
import { AnimacaoDoGiz, cuboNaMao, poseDaPonta } from './giz-animado';
import type { MaoCalibrada } from './mao-calibrada';
import { poseVaziaDeMao, type PoseDeMao } from './pose-das-maos';

/**
 * O gesto do giz posto na mão do arquivo: a conta que `main.ts` faz a cada quadro, sem three nem DOM, para os testes a verem como o
 * jogo a vê. O cubo e a ponta têm as poses deles (`giz-animado.ts`); a mão do artista as pinça por onde ela mediu
 * (`MaoCalibrada.poseQuePinca`), e é essa pose da mão que anda pelo caminho do gesto.
 */
export class GizNaMao {
  /** O cubo como se desenha: a origem no centro dele e `d` apontando da face da covinha para fora (para a ponta do taco). */
  readonly cubo: PoseDeMao = poseVaziaDeMao();
  private readonly naPonta = poseVaziaDeMao();
  private readonly naPontaGirada = poseVaziaDeMao();
  private readonly maoNoCubo = poseVaziaDeMao();
  private readonly maoNaPonta = poseVaziaDeMao();
  private readonly cuboNaPose = poseVaziaDeMao();

  /** `rolo`: o quanto a mão gira em torno do eixo do taco em relação ao cubo (`ConfigMaos.giz.pegada.rolo`). */
  constructor(private readonly rolo = 0) {}

  /**
   * A pose da mão da ponte neste quadro, em `ponte` (`ponteSemGiz` é onde ela estaria sem o giz, `noCubo` o cubo na borda).
   * `lado` é a aresta do cubo (m).
   */
  moverMao(
    animacao: AnimacaoDoGiz,
    calibrada: MaoCalibrada,
    pinca: ContatoDePinca,
    eixo: EixoDoTaco,
    noCubo: PoseDeMao,
    ponteSemGiz: PoseDeMao,
    lado: number,
    ponte: PoseDeMao,
  ): void {
    poseDaPonta(eixo, lado, this.naPonta);
    calibrada.poseQuePinca(pinca, noCubo, this.maoNoCubo, this.rolo);
    // Girando, o cubo rola e faz o círculo na ponta; a mão só o acompanha.
    calibrada.poseQuePinca(pinca, animacao.girando ? animacao.cuboGirando(this.naPonta, this.naPontaGirada) : this.naPonta, this.maoNaPonta, this.rolo);
    animacao.poseDaMao(ponteSemGiz, this.maoNoCubo, this.maoNaPonta, ponte);
  }

  /** O cubo na mão: anda com ela (preso nos dedos). `ponte` é a pose que `moverMao` deu. */
  cuboNaMao(calibrada: MaoCalibrada, pinca: ContatoDePinca, ponte: PoseDeMao): PoseDeMao {
    return cuboNaMao(calibrada.cuboNaPose(pinca, ponte, this.cuboNaPose, this.rolo), 0, this.cubo);
  }

  /** O cubo fora da mão: fica como ela o deixou, de covinha para cima, no quadro `noCubo`. */
  cuboNaBorda(noCubo: PoseDeMao): PoseDeMao {
    return cuboNaMao(noCubo, 0, this.cubo);
  }
}
