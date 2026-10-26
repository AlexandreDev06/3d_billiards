import { misturarQuadros, quadroVazio, type Colocacao, type Quadro } from '@sinuca/personagens';
import { carregarPersonagem, tingirMaterial, type BaseDoPersonagem, type NivelDeDetalhe, type PersonagemEmCena } from '@sinuca/personagens/three';
import { Group, MeshStandardMaterial, SkinnedMesh, type Material } from 'three';
import type { ConfigMaos } from '../config';
import { quadroDoTapinha, type LugarDoTapinha } from '../maos/gestos-com-contato';
import type { MaoCalibrada } from '../maos/mao-calibrada';
import { poseDaPonteNomeada, type NomeDaPonte } from '../maos/pontes';
import { poseVaziaDeMao, type PoseDeMao } from '../maos/pose-das-maos';
import type { Reacao, ReacaoEmCurso } from '../maos/reacoes';
import type { TrocaDePonte } from '../maos/troca-de-ponte';

/** O que a conta (`MaosDoJogador`) entrega ao desenho. */
export interface ModeloDasMaos {
  /** A pose da ponte de agora, no quadro do contato dela (`calibradaAtual`). */
  readonly ponte: PoseDeMao;
  readonly punho: PoseDeMao;
  /** Quanto cada dedo longo da ponte dobra a mais que a pose do arquivo (rad): indicador, médio, anelar, mínimo. */
  readonly dobrasDaPonte: Float32Array;
  /** 0 = a pose da ponte do arquivo, 1 = a `pinca`. */
  readonly pinca: number;
  readonly escala: number;
  readonly ponteVisivel: boolean;
  readonly punhoVisivel: boolean;
  /** A mão do V (a do giz) e a de trás. */
  readonly ponteCalibrada: MaoCalibrada | null;
  readonly punhoCalibrado: MaoCalibrada | null;
  /** Qual das pontes do artista a mão mostra, a mão dela e a troca em curso (de onde saiu, e a pose em que estava). */
  readonly ponteAtual: NomeDaPonte;
  readonly calibradaAtual: MaoCalibrada;
  calibradaDa(ponte: NomeDaPonte): MaoCalibrada;
  readonly troca: TrocaDePonte;
  /** A vida da mão de trás: o pulso que balança (rad), o aperto dos dedos (0 a 1) e o tamborilar. */
  readonly pulso: number;
  readonly aperto: number;
  readonly tamborilando: boolean;
  /** A reação em curso e, no tapinha, onde ele cai. */
  readonly reacao: Readonly<ReacaoEmCurso> | null;
  readonly tapinha: Readonly<LugarDoTapinha>;
}

/** Como uma mão está em cena. */
export interface DesenhoDaMao {
  readonly visivel: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly escala: number;
  /** Quantas malhas dela estão ligadas (uma por material do nível de detalhe em uso). */
  readonly malhas: number;
}

/** Fora de vista a menos que a escala passe disto. */
const ESCALA_MINIMA = 0.01;

const DEDOS_DA_PONTE = ['indicador', 'medio', 'anelar', 'minimo'] as const;
/** Os dedos da mão de trás que o aperto fecha (o polegar também: ele abraça o taco). */
const DEDOS_DO_PUNHO = [...DEDOS_DA_PONTE, 'polegar'] as const;

/** Quanto leva a mão a largar um gesto cancelado (a próxima mira começou). */
const SAIDA_DO_CANCELADO_S = 0.12;

/** Como o jogo desloca a mão da ponte em cada gesto de reação: quanto sobe, vai para a esquerda e gira com o peso do gesto. */
interface Deslocamento {
  readonly subida: number;
  readonly lado: number;
  readonly giro: number;
}

function contarMalhas(mao: PersonagemEmCena): number {
  let n = 0;
  mao.raiz.traverse((o) => {
    if (o instanceof SkinnedMesh && o.visible) n++;
  });
  return n;
}

/**
 * As duas mãos em cena, as do artista (`@sinuca/personagens`): a da ponte (a esquerda, o espelho do arquivo) e a de trás (a direita).
 * Dividem a geometria e o látex; cada uma tem os seus ossos. O `grupo` nasce vazio: `carregar` busca o arquivo sem segurar o jogo e,
 * se falhar, o jogo segue sem mãos (a falha fica no `console`, não na tela). As poses, a mistura com a pinça, os gestos e os
 * dedos plantados são do pacote; o que é da sinuca (onde a mão fica, qual ponte, o que ela faz depois da jogada) é da conta
 * (`MaosDoJogador`): aqui só se desenha, uma vez por quadro, o que a conta diz.
 */
export class MaosEmCena {
  readonly grupo = new Group();
  /** O arquivo chegou e as duas mãos estão no `grupo`. */
  base: BaseDoPersonagem | null = null;
  private ponte: PersonagemEmCena | null = null;
  private punho: PersonagemEmCena | null = null;
  private cor: number;
  private nivel: NivelDeDetalhe;
  private nomeDaPose: NomeDaPonte | null = null;
  private temRespirar = false;
  private reacaoVista: Reacao | null = null;
  private inicioDaReacaoVista = NaN;
  private readonly quadro: Quadro = quadroVazio();
  private readonly quadroDaSaida: Quadro = quadroVazio();
  private readonly quadroDoTapinha: Quadro = quadroVazio();
  private readonly colocacaoDoTapinha: { -readonly [K in keyof Colocacao]: Colocacao[K] } = { escala: 1, espelho: true };
  private readonly poseDaReacao: PoseDeMao = poseVaziaDeMao();
  private readonly tingidos = new Set<Material>();

  constructor(cor: number, nivel: NivelDeDetalhe, private readonly cfg: ConfigMaos) {
    this.grupo.name = 'maos';
    this.cor = cor;
    this.nivel = nivel;
  }

  /**
   * Busca o arquivo da mão e a põe em cena. Devolve a base (para a conta se calibrar) ou `null` se o arquivo não veio ou não presta:
   * o jogo segue sem mãos.
   */
  async carregar(arquivos: ConfigMaos['arquivos']): Promise<BaseDoPersonagem | null> {
    try {
      this.usar(await carregarPersonagem(arquivos.glb, arquivos.contatos, { cor: this.cor, urlDaMeta: arquivos.meta }));
    } catch (erro) {
      console.warn(`Mãos: o arquivo não carregou, o jogo segue sem elas (${erro instanceof Error ? erro.message : String(erro)})`);
      return null;
    }
    return this.base;
  }

  /** Põe em cena as duas mãos de uma base já carregada. */
  usar(base: BaseDoPersonagem): void {
    this.base = base;
    base.tingir(this.cor);
    this.ponte = base.instanciar(true);
    this.punho = base.instanciar(false);
    this.ponte.raiz.name = 'mao-ponte';
    this.punho.raiz.name = 'mao-punho';
    for (const mao of [this.ponte, this.punho]) {
      mao.raiz.visible = false;
      mao.definirNivel(this.nivel);
      this.grupo.add(mao.raiz);
    }
    this.temRespirar = this.ponte.aditivos.includes('respirar');
    this.punho.ir('punho', 0);
    this.ponte.ir(poseDaPonteNomeada('v'), 0);
    this.nomeDaPose = 'v';
    this.tingidos.clear();
  }

  get pronta(): boolean {
    return this.ponte !== null;
  }

  corDasMaos(): number {
    return this.cor;
  }

  /** Muda a cor das duas mãos: a do látex de fábrica e a das variantes de qualidade que estão nas malhas. */
  definirCor(cor: number): void {
    if (cor === this.cor) return;
    this.cor = cor;
    this.base?.tingir(cor);
    this.tingidos.clear();
  }

  /** O nível de detalhe: a malha alta para o alto e o médio, a baixa para o baixo. */
  definirNivel(nivel: NivelDeDetalhe): void {
    this.nivel = nivel;
    this.ponte?.definirNivel(nivel);
    this.punho?.definirNivel(nivel);
  }

  /** Quantos triângulos tem a malha do nível (para o diagnóstico e os testes). */
  triangulos(nivel: 'alta' | 'baixa'): number {
    return this.base?.triangulos(nivel) ?? 0;
  }

  /**
   * Leva cada mão à pose da conta, na escala dela e na pose do arquivo que lhe cabe; some a que não aparece ou está pequena demais.
   * Uma vez por quadro, com `dt` s desde o anterior.
   */
  posicionar(modelo: ModeloDasMaos, dt: number): void {
    const { ponte, punho } = this;
    if (ponte === null || punho === null || modelo.ponteCalibrada === null || modelo.punhoCalibrado === null) return;
    const aparece = modelo.escala > ESCALA_MINIMA;
    ponte.raiz.visible = modelo.ponteVisivel && aparece;
    punho.raiz.visible = modelo.punhoVisivel && aparece;
    this.seguirAReacao(modelo, ponte, punho);
    if (ponte.raiz.visible) this.posicionarAPonte(modelo, ponte, dt);
    if (punho.raiz.visible) this.posicionarOPunho(modelo, punho, dt);
  }

  private posicionarAPonte(modelo: ModeloDasMaos, ponte: PersonagemEmCena, dt: number): void {
    if (modelo.ponteAtual !== this.nomeDaPose) {
      // Os dedos de uma ponte para a outra se misturam no tempo da troca; sem troca (a primeira vez), de uma vez.
      ponte.ir(poseDaPonteNomeada(modelo.ponteAtual), modelo.troca.ativa ? modelo.troca.duracaoS : 0);
      this.nomeDaPose = modelo.ponteAtual;
    }
    ponte.sobrepor('pinca', modelo.pinca);
    for (let i = 0; i < DEDOS_DA_PONTE.length; i++) ponte.dobrar(DEDOS_DA_PONTE[i]!, modelo.dobrasDaPonte[i]!);
    if (this.temRespirar) ponte.ligarAditivo('respirar', this.cfg.vida.respirar.ponte);

    const calibrada = modelo.calibradaAtual;
    const r = modelo.reacao;
    const deslocamento = r === null ? null : this.deslocamentoDe(r.gesto);
    const pose = deslocamento === null ? modelo.ponte : this.deslocada(modelo.ponte, deslocamento, ponte.pesoDoGesto);
    calibrada.quadro(pose, modelo.escala, this.quadro);
    if (modelo.troca.ativa) {
      // A mão levanta, faz o arco e pousa: sai do quadro em que estava, na ponte de onde veio, e chega ao de agora.
      modelo.calibradaDa(modelo.troca.de).quadro(modelo.troca.pose, modelo.escala, this.quadroDaSaida);
      misturarQuadros(this.quadroDaSaida, this.quadro, modelo.troca.mistura, this.quadro);
      this.quadro.py += modelo.troca.levanta(this.cfg.escolha.troca.arco);
    }
    if (r !== null && r.gesto === 'tapinha') this.irAoTapinha(modelo, calibrada, ponte);
    ponte.colocar(this.quadro, calibrada.escala * modelo.escala);
    ponte.atualizar(dt);
    this.tingir(ponte);
  }

  /** O punho cai na moldura: o quadro da mão vai, com o peso do gesto, ao que põe o ponto de contato dele no lugar do tapinha. */
  private irAoTapinha(modelo: ModeloDasMaos, calibrada: MaoCalibrada, ponte: PersonagemEmCena): void {
    const contato = this.base?.modelo.contatos.gestos.get('tapinha');
    if (contato === undefined) return;
    const e = ponte.pesoDoGesto;
    const c = this.colocacaoDoTapinha;
    c.escala = calibrada.escala * modelo.escala;
    c.espelho = calibrada.espelho;
    const horizontal = Math.hypot(modelo.ponte.dx, modelo.ponte.dz) || 1;
    quadroDoTapinha(contato, c, modelo.tapinha, modelo.ponte.dx / horizontal, modelo.ponte.dz / horizontal, this.quadroDoTapinha);
    misturarQuadros(this.quadro, this.quadroDoTapinha, e, this.quadro);
    this.quadro.py += 4 * e * (1 - e) * this.cfg.reacoes.tapinha.subida;
  }

  private posicionarOPunho(modelo: ModeloDasMaos, punho: PersonagemEmCena, dt: number): void {
    const { vida } = this.cfg;
    const [ex, ey, ez] = vida.pulso.eixo;
    punho.girarOsso('pulso', ex, ey, ez, modelo.pulso);
    for (const dedo of DEDOS_DO_PUNHO) punho.dobrar(dedo, modelo.aperto * vida.aperto.rad);
    if (this.temRespirar) punho.ligarAditivo('respirar', vida.respirar.punho);
    // O tédio: a mão de trás tamborila no taco, a menos que esteja ocupada com uma reação.
    const ocupada = modelo.reacao?.ambas === true;
    if (modelo.tamborilando && !ocupada && punho.gestoEmCurso === null) punho.fazerGesto('tamborilar', vida.ocio.entraS, vida.ocio.saiS, { repetir: true });
    else if ((!modelo.tamborilando || ocupada) && punho.gestoEmCurso === 'tamborilar') punho.soltarGesto(vida.ocio.saiS);
    punho.colocar(modelo.punhoCalibrado!.quadro(modelo.punho, modelo.escala, this.quadro), modelo.punhoCalibrado!.escala * modelo.escala);
    punho.atualizar(dt);
    this.tingir(punho);
  }

  /** Começa o gesto da reação que a conta mandou (uma vez por reação) e larga o que ela cancelou. */
  private seguirAReacao(modelo: ModeloDasMaos, ponte: PersonagemEmCena, punho: PersonagemEmCena): void {
    const r = modelo.reacao;
    if (r === null) {
      if (this.reacaoVista !== null) {
        ponte.soltarGesto(SAIDA_DO_CANCELADO_S);
        punho.soltarGesto(SAIDA_DO_CANCELADO_S);
        this.reacaoVista = null;
        this.inicioDaReacaoVista = NaN;
      }
      return;
    }
    if (r.gesto === this.reacaoVista && r.inicioS === this.inicioDaReacaoVista) return;
    this.reacaoVista = r.gesto;
    this.inicioDaReacaoVista = r.inicioS;
    const { entradaS, saiS } = this.temposDe(r.gesto);
    ponte.fazerGesto(r.gesto, entradaS, saiS, { duracaoMaximaS: r.duracaoS });
    if (r.ambas) punho.fazerGesto(r.gesto, entradaS, saiS, { duracaoMaximaS: r.duracaoS });
  }

  private temposDe(gesto: Reacao): { entradaS: number; saiS: number } {
    const { joinha, reacoes } = this.cfg;
    switch (gesto) {
      case 'joinha':
        return joinha;
      case 'soco_ar':
        return reacoes.socoAr;
      case 'tapinha':
        return reacoes.tapinha;
      case 'quase':
        return reacoes.quase;
    }
  }

  /** Como a mão da ponte se desloca no gesto: o joinha e o soco sobem e vão para o lado; o tapinha e a raspada ficam onde estão. */
  private deslocamentoDe(gesto: Reacao): Deslocamento | null {
    if (gesto === 'joinha') return this.cfg.joinha;
    if (gesto === 'soco_ar') return this.cfg.reacoes.socoAr;
    return null;
  }

  /**
   * A pose da ponte durante o gesto: a mão sobe, vai para a esquerda e gira em torno da normal do pano, na medida do peso `e` do
   * gesto. A origem do quadro continua no eixo do taco quando o peso é 0.
   */
  private deslocada(pose: PoseDeMao, c: Deslocamento, e: number): PoseDeMao {
    const p = this.poseDaReacao;
    const wx = pose.dy * pose.uz - pose.dz * pose.uy;
    const wy = pose.dz * pose.ux - pose.dx * pose.uz;
    const wz = pose.dx * pose.uy - pose.dy * pose.ux;
    const giro = (c.giro * Math.PI * e) / 180;
    const cos = Math.cos(giro);
    const sen = Math.sin(giro);
    p.x = pose.x - wx * c.lado * e;
    p.y = pose.y + c.subida * e - wy * c.lado * e;
    p.z = pose.z - wz * c.lado * e;
    p.dx = cos * pose.dx + sen * wx;
    p.dy = cos * pose.dy + sen * wy;
    p.dz = cos * pose.dz + sen * wz;
    p.ux = pose.ux;
    p.uy = pose.uy;
    p.uz = pose.uz;
    return p;
  }

  /** As malhas trocam de material com o nível de qualidade (`VariantesDeMateriais`): cada material em uso leva a cor atual uma vez. */
  private tingir(mao: PersonagemEmCena): void {
    mao.raiz.traverse((o) => {
      if (!(o instanceof SkinnedMesh)) return;
      const m = o.material as Material;
      if (this.tingidos.has(m)) return;
      this.tingidos.add(m);
      if (m instanceof MeshStandardMaterial) tingirMaterial(m, this.cor);
    });
  }

  /** O que está em cena agora, para o gancho de teste: se cada mão aparece, onde a origem do arquivo dela está, o tamanho e o que toca. */
  diagnostico(): {
    readonly pronta: boolean;
    readonly ponte: DesenhoDaMao | null;
    readonly punho: DesenhoDaMao | null;
    readonly gesto: string | null;
    readonly gestoDoPunho: string | null;
    readonly pesoDoGesto: number;
    readonly tempoDoGesto: number;
    readonly poseDaPonte: string | null;
    readonly pesoDaPoseDaPonte: number;
  } {
    const de = (mao: PersonagemEmCena | null): DesenhoDaMao | null =>
      mao === null
        ? null
        : { visivel: mao.raiz.visible, x: mao.raiz.position.x, y: mao.raiz.position.y, z: mao.raiz.position.z, escala: mao.raiz.scale.x, malhas: contarMalhas(mao) };
    const nome = this.nomeDaPose === null ? null : poseDaPonteNomeada(this.nomeDaPose);
    return {
      pronta: this.pronta,
      ponte: de(this.ponte),
      punho: de(this.punho),
      gesto: this.ponte?.gestoEmCurso ?? null,
      gestoDoPunho: this.punho?.gestoEmCurso ?? null,
      pesoDoGesto: this.ponte?.pesoDoGesto ?? 0,
      tempoDoGesto: this.ponte?.tempoDoGesto ?? 0,
      poseDaPonte: nome,
      pesoDaPoseDaPonte: this.ponte === null || nome === null ? 0 : this.ponte.mistura.pesos[this.ponte.mistura.indice(nome)]!,
    };
  }

  dispose(): void {
    this.ponte?.dispose();
    this.punho?.dispose();
    this.base?.dispose();
    this.grupo.removeFromParent();
  }
}
