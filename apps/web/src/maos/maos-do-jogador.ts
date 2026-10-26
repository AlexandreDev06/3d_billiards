import type { EstadoMesa } from '@sinuca/fisica';
import { ID_BOLAO } from '@sinuca/fisica';
import type { MetaDoPersonagem, ModeloDoPersonagem } from '@sinuca/personagens';
import type { ConfigMaos } from '../config';
import type { ObstaculosDaMesa } from '../controles/elevacao-do-taco';
import { alturaDoApoioEm } from './apoio';
import { eixoDoTaco, eixoVazio, pontoDeContato, pontoDoTaco, type EixoDoTaco, type Vec3 } from './eixo';
import type { Esfera } from './esferas';
import { MaoCalibrada } from './mao-calibrada';
import { lerLugarDaPonte, lugarVazioDaPonte, escolherPoseDaPonte } from './ponte-por-lugar';
import { PONTES, poseDaPonteNomeada, type NomeDaPonte } from './pontes';
import { lugarDoTapinha, tapinhaVazio, type LugarDoTapinha } from './gestos-com-contato';
import { Ociosidade } from './ociosidade';
import { PunhoVivo } from './punho-vivo';
import { ReacoesDaJogada, type MomentoDaJogada, type ReacaoEmCurso } from './reacoes';
import { TrocaDePonte } from './troca-de-ponte';
import {
  bolasVazias,
  escolherPonte,
  orientarMao,
  poseDoPunho,
  poseVaziaDeMao,
  tapaAlgumaBola,
  type BolasDaMesa,
  type ConfigDaPonte,
  type PoseDeMao,
  type ProtecaoDaVista,
} from './pose-das-maos';
import { agarreDaMaoDeTras, caixaDasEsferas, caixaVazia, lugarVazio, type CaixaNaTela } from './lugar-da-mao-de-tras';
import { PlantadorDeDedos } from './plantar-dedos';
import type { Projetor } from './projetor';

/** O que as mãos precisam saber do taco desenhado neste quadro. */
export interface EntradaDasMaos {
  /** Centro do bolão (m). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly angulo: number;
  /** A elevação com que o taco é desenhado. */
  readonly elevacao: number;
  /** Distância da ponta à superfície do bolão (m): negativa no seguimento da tacada. */
  readonly recuo: number;
  readonly lateral: number;
  readonly vertical: number;
  /** As mãos estão em cena: é a minha vez e o taco aparece. Falso: elas somem. */
  readonly ativas: boolean;
  /** Só a mão da ponte aparece: o taco saiu de cena e a de trás não teria o que segurar. */
  readonly soAPonte: boolean;
}

/** Uma esfera que a conta pode ajustar no lugar (o centro de uma bola protegida). */
export interface EsferaMutavel {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** A taxa de uma aproximação exponencial para um passo `dt`. */
const fator = (taxa: number, dt: number): number => 1 - Math.exp(-taxa * Math.max(dt, 0));

const limitar = (v: number): number => Math.min(Math.max(v, 0), 1);

/** Tudo de uma das pontes do artista que a conta usa: a mão medida, as esferas dela, os dedos e o último lugar achado. */
interface ConjuntoDaPonte {
  readonly nome: NomeDaPonte;
  readonly calibrada: MaoCalibrada;
  /** A configuração da ponte com a distância pedida desta ponte (muda a cada quadro) e o fundo da pele dela. */
  readonly cfg: { -readonly [K in keyof ConfigDaPonte]: ConfigDaPonte[K] };
  readonly esferas: readonly Esfera[];
  readonly plantador: PlantadorDeDedos;
  /** A altura do eixo do taco sobre o plano de apoio no ponto da mão, na escala do jogo (m); `null` se o arquivo não diz. */
  readonly alturaDoEixo: number | null;
  /** O lugar que `escolherPonte` achou para esta ponte neste quadro (a pose antes de a mão deslizar até ele). */
  readonly lugar: PoseDeMao;
  readonly subidaDosDedos: (pose: PoseDeMao) => number;
}

/**
 * As duas mãos de quem taca: a da ponte, no pano atrás do contato, e a de trás, que segura o taco. Só conta (sem three nem DOM):
 * escolhe os lugares pelo taco desenhado, a câmera e as bolas, e deixa as poses e a `escala` (0 = sumida, 1 = inteira) para o
 * desenho. Nada aloca por quadro.
 *
 * - A ponte é uma das seis do artista (`PONTES`), escolhida pelo lugar (`escolherPoseDaPonte`): o V no pano aberto, o laço com a
 *   força puxada, a elevada com bola atrás da branca, a da tabela, a colada e a do canto. Cada uma é alinhada ao taco pela própria
 *   altura de eixo (`alturaDoEixoAoPlano` do arquivo) e pousa onde cabe (`escolherPonte`), com os dedos no apoio. Trocar de ponte
 *   leva `escolha.troca.duracaoS` (`TrocaDePonte`): quem desenha levanta a mão, faz um arco e a pousa no lugar novo;
 * - a mão de trás segura o taco no fundo da tela, cortada pela borda de baixo e longe da ponte (`agarreDaMaoDeTras`, escolhido com o
 *   taco em repouso) e acompanha o recuo, a batida e o seguimento, porque está presa ao taco; puxado o taco, ela desce com ele até
 *   a fração mínima à mostra e daí desliza para a ponta, para nunca sumir;
 * - nenhuma tapa a branca nem a bola mirada (`protegidas`): a ponte muda de lugar e, se a de trás tapasse, ela some;
 * - a escala sobe ao entrar e desce ao sair, para a mão aparecer e sumir suave.
 */
export class MaosDoJogador {
  /** A pose da ponte de agora, no quadro do contato dela (`calibradaAtual`). */
  readonly ponte: PoseDeMao = poseVaziaDeMao();
  readonly punho: PoseDeMao = poseVaziaDeMao();
  /**
   * Quanto cada dedo longo da ponte dobra a mais que a pose do arquivo (rad; indicador, médio, anelar, mínimo), para os dedos
   * pousarem no que há embaixo. Vai a zero quando a mão fecha na pinça do giz. O polegar e o resto da mão são a pose do arquivo.
   */
  readonly dobrasDaPonte = new Float32Array(4);
  /** A troca de ponte em curso (a mão levanta, faz um arco e pousa). */
  readonly troca = new TrocaDePonte();
  /** 0 a 1: o quanto as mãos estão em cena (a escala do desenho). */
  escala = 0;
  /** A ponte coube em algum lugar e a de trás não taparia nada: o desenho pode mostrar cada uma. */
  ponteVisivel = false;
  punhoVisivel = false;
  /** Distância pelo taco da ponte ao contato e da mão de trás à ponta (para o gancho de teste). */
  distanciaDaPonte = 0;
  agarre = 0;
  apoioDaPonte: string = 'pano';
  /** Só a ponte aparece (a mão de trás fica de fora): o joinha depois que o taco saiu de cena. */
  soAPonte = false;
  /** Qual das pontes do artista a mão mostra agora. */
  ponteAtual: NomeDaPonte = 'v';
  /** O quanto o pulso da mão de trás gira (rad) e o aperto dos dedos dela no taco (0 a 1): a vida dela (`PunhoVivo`). */
  pulso = 0;
  aperto = 0;
  /** A mão de trás tamborila: a mira ficou parada tempo demais (`Ociosidade`). */
  tamborilando = false;
  /** Onde a mão da ponte bate quando há falta: a moldura mais perto dela, escolhida quando o tapinha começa. */
  readonly tapinha: LugarDoTapinha = tapinhaVazio();

  /** A mão do V, no tamanho e do lado do jogo: é nela que o giz fala (a pinça é da mão do V). Sem o arquivo, `null`. */
  ponteCalibrada: MaoCalibrada | null = null;
  punhoCalibrado: MaoCalibrada | null = null;
  private conjuntos: Record<NomeDaPonte, ConjuntoDaPonte> | null = null;
  private atual: ConjuntoDaPonte | null = null;
  private esferasDoPunho: readonly Esfera[] = [];
  private readonly apoio = (x: number, z: number): number => alturaDoApoioEm(this.obstaculos, x, z);
  private fatorDaPinca = 0;
  private gizPedido = false;
  private readonly eixo: EixoDoTaco = eixoVazio();
  private readonly eixoDeRepouso: EixoDoTaco = eixoVazio();
  private readonly lugarDaPonte = lugarVazioDaPonte();
  private readonly caixaDaPonte: CaixaNaTela = caixaVazia();
  private readonly lugarDoPunho = lugarVazio();
  private readonly bolas: BolasDaMesa = bolasVazias();
  private readonly ponto: Vec3 = { x: 0, y: 0, z: 0 };
  private mesaVista: EstadoMesa | null = null;
  private sincronizada = false;
  private distanciaSuave = 0;
  private agarreSuave = 0;
  private tempoNaPonte = 0;
  private relogioS = 0;
  private reacoes: ReacoesDaJogada | null = null;
  private readonly punhoVivo: PunhoVivo;
  private readonly ociosidade: Ociosidade;

  constructor(
    private readonly cfg: ConfigMaos,
    private readonly obstaculos: ObstaculosDaMesa,
    private readonly raioBolao: number,
    /** O recuo do taco parado (m): com ele se escolhe onde a mão de trás o segura. */
    private readonly recuoDeRepouso: number,
    /** O recuo da força toda (m): com os dois se mede a fração da puxada que decide o laço. */
    private readonly recuoMaximo: number,
    /** O sorteio (0 a 1) que escolhe entre o joinha e o soco no ar: o RNG do jogo, não o `Math.random` solto. */
    private readonly sorteio: () => number,
  ) {
    this.punhoVivo = new PunhoVivo(cfg.vida);
    this.ociosidade = new Ociosidade(cfg.vida.ocio);
  }

  /** As mãos estão prontas: o arquivo chegou e foi medido. */
  get pronta(): boolean {
    return this.ponteCalibrada !== null;
  }

  /** A mão da ponte de agora, a da pose `ponteAtual`: é no quadro dela que `ponte` está. */
  get calibradaAtual(): MaoCalibrada {
    return this.atual!.calibrada;
  }

  /** As esferas que cobrem a mão da ponte de agora, no quadro dela. */
  get esferasAtuais(): readonly Esfera[] {
    return this.atual!.esferas;
  }

  /** Do eixo do taco ao ponto mais baixo da pele na ponte de agora (m). */
  get fundoAtual(): number {
    return this.atual!.cfg.fundo;
  }

  /** A mão de uma ponte qualquer (para quem desenha a troca: a de onde a mão saiu). */
  calibradaDa(ponte: NomeDaPonte): MaoCalibrada {
    return this.conjuntos![ponte].calibrada;
  }

  /**
   * O arquivo da mão chegou: mede as duas mãos (a da ponte é a esquerda, o espelho da do artista; a de trás, a direita) e cobre cada
   * uma com esferas, uma mão por ponte do artista. Antes disso `atualizar` não faz nada e as mãos não aparecem.
   */
  calibrar(modelo: ModeloDoPersonagem, meta: MetaDoPersonagem | null = null): void {
    const conjuntos = {} as Record<NomeDaPonte, ConjuntoDaPonte>;
    for (const nome of PONTES) {
      const pose = poseDaPonteNomeada(nome);
      const giro = this.cfg.ponte.giro + (this.cfg.escolha.giro[nome] ?? 0);
      const calibrada = new MaoCalibrada(modelo, pose, this.cfg.escala, true, (giro * Math.PI) / 180);
      const plantador = new PlantadorDeDedos(calibrada, pose, (this.cfg.plantio.alcance * Math.PI) / 180, this.cfg.plantio.subidaMaxima);
      const altura = calibrada.contato.alturaDoEixoAoPlano;
      conjuntos[nome] = {
        nome,
        calibrada,
        cfg: { ...this.cfg.ponte, giro, fundo: calibrada.fundo(pose) },
        esferas: calibrada.esferas(pose),
        plantador,
        alturaDoEixo: altura === undefined ? null : altura.noPonto * this.cfg.escala,
        lugar: poseVaziaDeMao(),
        subidaDosDedos: (p) => plantador.subidaNecessaria(p, this.apoio),
      };
    }
    const punho = new MaoCalibrada(modelo, 'punho', this.cfg.escala, false);
    this.esferasDoPunho = punho.esferas('punho');
    this.conjuntos = conjuntos;
    this.atual = conjuntos[this.ponteAtual];
    this.ponteCalibrada = conjuntos.v.calibrada;
    this.punhoCalibrado = punho;
    this.reacoes = new ReacoesDaJogada(this.cfg.reacoes, meta, this.sorteio);
    this.sincronizada = false;
  }

  /** A reação que as mãos fazem agora (a da ponte, ou as duas), ou `null`. */
  get reacao(): Readonly<ReacaoEmCurso> | null {
    return this.reacoes?.atual ?? null;
  }

  /** Há reação em curso: as mãos têm de ficar em cena até ela acabar, mesmo sem o taco. */
  get reacaoNoAr(): boolean {
    return this.reacao !== null;
  }

  /** Uma jogada nova começou (uma gravação vai tocar): a falta que a regra acusa depois pode bater de novo. */
  comecarJogada(): void {
    this.reacoes?.comecarJogada();
  }

  /**
   * A jogada fez algo que as mãos sentem. Devolve se uma reação começou (antes de o arquivo chegar, não há mão para reagir). No
   * tapinha a moldura onde ele cai é escolhida agora, a partir da mão da ponte.
   */
  reagir(momento: MomentoDaJogada): boolean {
    if (this.reacoes === null) return false;
    const comecou = this.reacoes.ouvir(momento, this.relogioS);
    if (comecou && this.reacoes.atual?.gesto === 'tapinha') lugarDoTapinha(this.ponte.x, this.ponte.z, this.obstaculos, this.cfg.reacoes.tapinha.alcance, this.tapinha);
    return comecou;
  }

  /** A próxima mira começou: a reação some já. */
  cancelarReacao(): void {
    this.reacoes?.cancelar();
  }

  /** Quanto a mão da ponte já fechou na pinça do cubo de giz: 0 = a ponte aberta, 1 = a pinça. */
  definirPinca(fator: number): void {
    this.fatorDaPinca = Math.min(Math.max(fator, 0), 1);
    this.misturarComAPinca();
  }

  /** O quanto a mão da ponte está na pinça (0 = a pose `ponte_v`, 1 = `pinca`). */
  get pinca(): number {
    return this.fatorDaPinca;
  }

  /** O giz vai passar (ou está passando): a mão volta ao V, que é a ponte que tem a pinça. */
  pedirGiz(pedido: boolean): void {
    this.gizPedido = pedido;
  }

  /** A mão está no V e parada: o gesto do giz pode começar (ele é todo medido na mão do V). */
  get podeGiz(): boolean {
    return this.ponteAtual === 'v' && !this.troca.ativa;
  }

  private misturarComAPinca(): void {
    const p = this.atual?.plantador;
    for (let i = 0; i < this.dobrasDaPonte.length; i++) this.dobrasDaPonte[i] = p === undefined ? 0 : p.dobra(i) * (1 - this.fatorDaPinca);
  }

  /** O taco desenhado neste quadro (a ponta e a direção): o gesto do giz leva a mão até a ponta. */
  get eixoDoTaco(): Readonly<EixoDoTaco> {
    return this.eixo;
  }

  /** As outras bolas da mesa (o bolão não conta). Com o mesmo objeto de antes não faz nada. */
  definirBolas(mesa: EstadoMesa, raio: number): void {
    if (mesa === this.mesaVista) return;
    this.mesaVista = mesa;
    let n = 0;
    for (const b of mesa.bolas) {
      if (b.id === ID_BOLAO || !b.naMesa || n === this.bolas.x.length) continue;
      this.bolas.x[n] = b.posicao.x;
      this.bolas.z[n] = b.posicao.z;
      n++;
    }
    this.bolas.quantas = n;
    this.bolas.raio = raio;
  }

  /** O próximo quadro põe as mãos nos lugares de uma vez, sem deslizar de onde estavam (vez nova, partida nova). */
  reiniciar(): void {
    this.sincronizada = false;
    this.troca.cancelar();
    this.reiniciarAVida();
  }

  private reiniciarAVida(): void {
    this.punhoVivo.reiniciar();
    this.pulso = 0;
    this.aperto = 0;
    this.tamborilando = false;
    this.ociosidade.atualizar(0, false, 0, 0, 0, 0);
  }

  /**
   * Uma vez por quadro. `projetor` é a câmera de agora (sem ela, o agarre fica no punho de verdade e nada é conferido) e
   * `protegidas` as bolas que nenhuma mão pode tapar: a branca e a mirada.
   */
  atualizar(dt: number, e: EntradaDasMaos, projetor: Projetor | null, protegidas: readonly Esfera[]): void {
    if (!this.pronta) {
      this.ponteVisivel = false;
      this.punhoVisivel = false;
      return;
    }
    this.relogioS += Math.max(dt, 0);
    this.reacoes?.atualizar(this.relogioS);
    const alvo = e.ativas ? 1 : 0;
    const tempo = e.ativas ? this.cfg.presenca.entraS : this.cfg.presenca.saiS;
    this.escala += (alvo - this.escala) * fator(3 / tempo, dt);
    if (Math.abs(alvo - this.escala) < 0.002) this.escala = alvo;
    // Sumidas, nada de conta: o próximo quadro em que voltam começa do lugar certo.
    if (this.escala === 0 && !e.ativas) {
      this.sincronizada = false;
      this.troca.cancelar();
      this.reiniciarAVida();
      this.ponteVisivel = false;
      this.punhoVisivel = false;
      return;
    }

    eixoDoTaco(e.x, e.y, e.z, this.raioBolao, e.angulo, e.elevacao, e.recuo, e.lateral, e.vertical, this.eixo);
    const protecao: ProtecaoDaVista | null = projetor === null ? null : { projetor, bolas: protegidas, folga: this.cfg.protecao.folga };
    const primeira = !this.sincronizada;
    this.troca.atualizar(dt);
    this.tempoNaPonte += dt;

    // O V diz onde a mão pousa no pano; o que há em volta dele diz qual ponte o lugar pede.
    const conjuntos = this.conjuntos!;
    const v = conjuntos.v;
    const escolhidaV = escolherPonte(this.eixo, e.recuo, this.obstaculos, this.bolas, v.cfg, protecao, v.esferas, v.lugar, v.subidaDosDedos, true);
    this.ponteVisivel = escolhidaV.ok;
    let escolhida = escolhidaV;
    let conjunto = this.atual!;
    if (escolhidaV.ok) {
      const forca = limitar((e.recuo - this.recuoDeRepouso) / (this.recuoMaximo - this.recuoDeRepouso));
      lerLugarDaPonte(v.lugar.x, v.lugar.z, escolhidaV.apoio, this.eixo, e.recuo, this.obstaculos, this.bolas, this.cfg.escolha, e.elevacao, forca, this.lugarDaPonte);
      const pedeV = this.gizPedido || this.fatorDaPinca > 0.002;
      const desejada = pedeV ? 'v' : escolherPoseDaPonte(this.lugarDaPonte, this.cfg.escolha, this.ponteAtual);
      const trocaria = desejada !== this.ponteAtual && !this.troca.ativa && (this.tempoNaPonte >= this.cfg.escolha.troca.permanenciaS || pedeV);
      let quer = primeira || trocaria ? desejada : this.ponteAtual;
      if (quer === 'v') {
        escolhida = escolhidaV;
        conjunto = v;
      } else {
        conjunto = conjuntos[quer];
        conjunto.cfg.distancia = this.distanciaIdeal(conjunto, e, escolhidaV.distancia);
        escolhida = escolherPonte(this.eixo, e.recuo, this.obstaculos, this.bolas, conjunto.cfg, protecao, conjunto.esferas, conjunto.lugar, conjunto.subidaDosDedos, false);
        if (!escolhida.ok) {
          // Esta ponte não cabe aqui: fica no V, que coube.
          quer = 'v';
          escolhida = escolhidaV;
          conjunto = v;
        }
      }
      if (primeira) {
        this.ponteAtual = quer;
        this.atual = conjunto;
        this.tempoNaPonte = 0;
        conjunto.plantador.reiniciar();
        this.distanciaSuave = escolhida.distancia;
      } else if (quer !== this.ponteAtual) {
        this.troca.iniciar(this.ponteAtual, this.ponte, this.cfg.escolha.troca.duracaoS);
        this.ponteAtual = quer;
        this.atual = conjunto;
        this.tempoNaPonte = 0;
        conjunto.plantador.reiniciar();
        this.distanciaSuave = escolhida.distancia;
      } else this.distanciaSuave += (escolhida.distancia - this.distanciaSuave) * fator(this.cfg.ponte.taxa, dt);
    }
    this.apoioDaPonte = escolhida.apoio;
    this.distanciaDaPonte = this.distanciaSuave;
    if (escolhida.ok) {
      this.poseDaPonteNaDistancia(e, this.distanciaSuave, escolhida.distancia, conjunto.lugar);
      conjunto.plantador.plantar(dt, this.cfg.plantio.taxa, this.ponte, this.apoio);
      this.misturarComAPinca();
    }

    // A mão de trás: no fundo da tela, longe da ponte, escolhido com o taco parado e presa a ele dali em diante.
    let agarre = this.cfg.punho.agarre;
    let cabe = true;
    if (projetor !== null) {
      eixoDoTaco(e.x, e.y, e.z, this.raioBolao, e.angulo, e.elevacao, this.recuoDeRepouso, e.lateral, e.vertical, this.eixoDeRepouso);
      // Uma ponte toda abaixo da borda da tela (a câmera colada nela) não disputa lugar com a mão de trás.
      const ponteNaTela =
        this.ponteVisivel && caixaDasEsferas(conjunto.esferas, this.ponte, projetor, this.caixaDaPonte) && this.caixaDaPonte.maxY > -1 ? this.caixaDaPonte : null;
      const lugar = agarreDaMaoDeTras(this.eixoDeRepouso, this.eixo, projetor, this.cfg.punho, this.esferasDoPunho, ponteNaTela, this.lugarDoPunho);
      agarre = lugar.agarre;
      cabe = lugar.cabe;
    }
    this.agarreSuave = primeira ? agarre : this.agarreSuave + (agarre - this.agarreSuave) * fator(this.cfg.punho.taxa, dt);
    this.agarre = this.agarreSuave;
    pontoDoTaco(this.eixo, this.agarreSuave, this.ponto);
    poseDoPunho(this.eixo, this.ponto, this.cfg.punho, this.punho);
    this.punhoVisivel = !e.soAPonte && cabe && (protecao === null || !tapaAlgumaBola(this.esferasDoPunho, this.punho, protecao.bolas, protecao.projetor, protecao.folga));
    this.sincronizada = true;

    // A vida da mão de trás: o pulso e o aperto seguem o recuo do taco; o tédio, a mira parada.
    if (primeira) this.punhoVivo.reiniciar();
    this.punhoVivo.atualizar(dt, e.recuo);
    this.pulso = this.punhoVivo.pulso;
    this.aperto = this.punhoVivo.aperto;
    this.ociosidade.atualizar(dt, e.ativas && !e.soAPonte && !this.reacaoNoAr, e.angulo, e.recuo, e.lateral, e.vertical);
    this.tamborilando = this.ociosidade.tamborilando;
  }

  /**
   * A distância (m) do contato à mão em que o eixo do taco passa à altura que o artista mediu naquela ponte (`alturaDoEixoAoPlano`,
   * no tamanho do jogo): o laço, mais baixo que o V, e a elevada, mais alta, só alinham com o taco assim. As outras ficam onde o V
   * pousou, que já é sobre o apoio delas (a borracha e a moldura).
   */
  private distanciaIdeal(c: ConjuntoDaPonte, e: EntradaDasMaos, doV: number): number {
    if ((c.nome !== 'laco' && c.nome !== 'elevada') || c.alturaDoEixo === null) return doV;
    const sobe = -this.eixo.dy;
    if (sobe < 0.02) return doV;
    pontoDeContato(this.eixo, e.recuo, this.ponto);
    const s = (c.alturaDoEixo - this.ponto.y) / sobe;
    return Math.min(Math.max(s, this.cfg.ponte.distanciaMinima), this.cfg.ponte.distanciaMaxima);
  }

  /**
   * A pose da ponte a `s` m do contato (a distância suavizada, que pode não ser a escolhida enquanto a mão desliza). A subida que a
   * mão ganhou para não enterrar na madeira, no lugar escolhido (`lugar`), vale também no caminho.
   */
  private poseDaPonteNaDistancia(e: EntradaDasMaos, s: number, escolhida: number, lugar: PoseDeMao): void {
    const { dx, dy, dz } = this.eixo;
    const cx = this.eixo.px + dx * e.recuo;
    const cy = this.eixo.py + dy * e.recuo;
    const cz = this.eixo.pz + dz * e.recuo;
    const subida = lugar.y - (cy - dy * escolhida);
    orientarMao(this.ponte, this.eixo, cx - dx * s, cy - dy * s + subida, cz - dz * s);
  }
}
