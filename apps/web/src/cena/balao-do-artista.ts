import { quadroVazio, type Quadro } from '@sinuca/personagens';
import type { BaseDoRosto, NivelDeDetalhe, PersonagemDeRosto } from '@sinuca/personagens/three';
import { APARENCIA_PADRAO, aparenciaIgual, type AparenciaDoBalao } from '@sinuca/protocolo';
import { Group, type Material } from 'three';
import { NOME_DA_ACAO, NOME_DA_CARA, pedidoDoBalao, resolverPedido, type AcaoDoBalao, type PedidoDoBalao } from '../baloes/acao-do-balao';
import type { ConfigBaloes } from '../config';
import type { BaloesEmCena, EstadoDoBalao } from './balao';
import type { CarregadorDeChapeus } from './chapeus';

/** O relógio da página pode dar um salto (aba parada, quadro lento): o balão nunca anda mais que isto de uma vez (s). */
const PASSO_MAXIMO_S = 0.1;
/** Sem ser mostrado por este tempo (s), o balão conta como recém-chegado: a gelatina e a cordinha não medem o salto de lugar. */
const SUMIDO_HA_S = 0.5;

interface Peca {
  readonly personagem: PersonagemDeRosto;
  ultimoTempoS: number | null;
  /** O que foi pedido por último: o corpo e a cara só mudam quando o pedido muda. */
  acao: AcaoDoBalao;
  cara: string;
  readonly pedido: PedidoDoBalao;
  /** A aparência pedida por último (o balão que a sala mandou para quem está nesta equipe). */
  aparencia: AparenciaDoBalao;
  /** O chapéu pedido ainda não chegou (o arquivo dos chapéus está baixando): entra quando chegar. */
  chapeuPendente: boolean;
}

/**
 * Os balões do artista (`balao.glb`): um por equipe (até quatro), com o corpo e o rosto do arquivo, o látex na cor da equipe e as
 * ações e caras que o jogo pede pela tabela de reações (`pedidoDoBalao`; L46: concentrar na mira, comemorar, bravo, ufa, rir,
 * impaciente, além da parada, pulinho, susto, estufar e murchar), com o recuo para o que o arquivo v1 faz quando a ação ou a cara
 * nova não existe (`resolverPedido`). Por cima disso o personagem se mexe sozinho: o olhar vivo (pontos de interesse com prioridade,
 * sacadas, perseguição, vergência), o corpo que segue os olhos, a cordinha simulada, a gelatina e o flutuar, o piscar natural.
 * Cada um tem os seus ossos e o seu látex e divide a geometria. O dono pede um por vez (`mostrar`, uma vez por quadro) e esconde o
 * que não usa.
 */
export class BaloesDoArtista implements BaloesEmCena {
  readonly grupo = new Group();
  private readonly pecas: Peca[] = [];
  private readonly desligarChapeus: (() => void) | undefined;

  constructor(
    private readonly cfg: ConfigBaloes,
    base: BaseDoRosto,
    nivel: NivelDeDetalhe,
    sorteio: () => number,
    quantos = 4,
    private readonly chapeus: CarregadorDeChapeus | null = null,
    /** Chamado quando a aparência de um balão ganhou malha nova (um chapéu): o jogo refaz as variantes de qualidade. */
    private readonly aoGanharMalha: () => void = () => undefined,
  ) {
    this.grupo.name = 'baloes-do-artista';
    for (let i = 0; i < quantos; i++) {
      const personagem = base.instanciar({ cor: 0xffffff, sorteio });
      personagem.raiz.name = `balao-${i}`;
      personagem.raiz.visible = false;
      personagem.definirNivel(nivel);
      this.grupo.add(personagem.raiz);
      this.pecas.push({
        personagem,
        ultimoTempoS: null,
        acao: 'parado',
        cara: NOME_DA_CARA.neutro,
        pedido: { acao: 'parado', repetir: false, cara: 'neutro', momento: 'parado' },
        aparencia: APARENCIA_PADRAO,
        chapeuPendente: false,
      });
    }
    // O arquivo dos chapéus chegou: quem pediu chapéu o veste agora, sem esperar a aparência mudar de novo.
    this.desligarChapeus = chapeus?.aoChegar((base) => {
      let ganhou = false;
      for (const p of this.pecas) {
        if (!p.chapeuPendente) continue;
        p.chapeuPendente = false;
        ganhou = p.personagem.definirAcessorio(base, p.aparencia.chapeu) || ganhou;
      }
      if (ganhou) this.aoGanharMalha();
    });
  }

  /**
   * O balão `i` passa a ter a aparência pedida (a que a sala mandou para quem está nesta equipe): chapéu, bigode, estilo e cor de olho.
   * Chame a cada quadro com a aparência de agora; só muda o que mudou (uma conta de quatro campos quando nada mudou). O chapéu pede o
   * arquivo dos chapéus ao carregador (só baixa se alguém usa chapéu) e entra quando ele chega; item que o arquivo do balão não tem
   * fica de fora, sem quebrar o resto.
   */
  definirAparencia(i: number, a: AparenciaDoBalao): void {
    const p = this.pecas[i];
    if (!p || (!p.chapeuPendente && aparenciaIgual(a, p.aparencia))) return;
    const antes = p.aparencia;
    const { personagem } = p;
    const chapeuMudou = a.chapeu !== antes.chapeu || p.chapeuPendente;
    p.aparencia = a;
    if (a.bigode !== antes.bigode) personagem.definirBigode(a.bigode);
    if (a.olhos !== antes.olhos) personagem.definirEstiloDeOlho(a.olhos);
    if (a.corDosOlhos !== antes.corDosOlhos) personagem.definirCorDosOlhos(a.corDosOlhos);
    if (!chapeuMudou) return;
    if (a.chapeu === null) {
      p.chapeuPendente = false;
      personagem.definirAcessorio(null, null);
      return;
    }
    this.chapeus?.pedir();
    const base = this.chapeus?.base ?? null;
    if (base === null) {
      p.chapeuPendente = true;
      return;
    }
    p.chapeuPendente = false;
    if (personagem.definirAcessorio(base, a.chapeu)) this.aoGanharMalha();
  }

  get quantos(): number {
    return this.pecas.length;
  }

  /** A malha alta para o alto e o médio, a baixa para o baixo. */
  definirNivel(nivel: NivelDeDetalhe): void {
    for (const p of this.pecas) p.personagem.definirNivel(nivel);
  }

  /** O balão `i` neste quadro. Com `escala` quase zero ele some em vez de desenhar um ponto. */
  mostrar(i: number, e: EstadoDoBalao): void {
    const p = this.pecas[i];
    if (!p) return;
    const { personagem } = p;
    personagem.raiz.visible = e.escala > 0.01;
    if (!personagem.raiz.visible) return;
    // A malha usa o material de agora: nos níveis médio e baixo é uma cópia (feita com a cor de quando nasceu), então confere a dela.
    if (personagem.corDoLatex !== e.cor) personagem.tingir(e.cor);
    // O jogo esconde todos e mostra um a cada quadro, então "acabou de aparecer" é não ter sido mostrado há um bom tempo (ou nunca).
    const aparecendo = p.ultimoTempoS === null || e.tempoS - p.ultimoTempoS > SUMIDO_HA_S;
    // "Recém-chegado" só tira a gelatina e a cordinha do salto de lugar (`reposicionar`). O relógio do balão nunca fica em zero por isso:
    // num quadro lento (software, 1 a 3 quadros por segundo) o intervalo passa de `SUMIDO_HA_S` em todo quadro, e o rosto congelava
    // no meio de um piscar (L46c).
    const dt = p.ultimoTempoS === null ? 0 : Math.min(Math.max(e.tempoS - p.ultimoTempoS, 0), PASSO_MAXIMO_S);
    p.ultimoTempoS = e.tempoS;

    // O que o balão faz muda só quando o pedido muda: o sorriso que dura mais que o pulinho não pula de novo.
    const pedido = resolverPedido(pedidoDoBalao(e.cara, e, p.pedido), personagem);
    if (pedido.acao !== p.acao) {
      p.acao = pedido.acao;
      const tempos = this.cfg.arquivo.acoes[pedido.acao];
      if (pedido.acao === 'parado') personagem.soltarAcoes(tempos.saidaS);
      else personagem.fazerAcao(NOME_DA_ACAO[pedido.acao], { ...tempos, repetir: pedido.repetir });
    }
    const cara = NOME_DA_CARA[pedido.cara];
    if (cara !== p.cara) {
      p.cara = cara;
      personagem.fazerCara(cara);
    }
    // A atenção: cada vaga com o ponto do mundo e a prioridade (zero a tira); o personagem escolhe quando olhar o quê.
    for (let k = 0; k < e.interesses.length; k++) {
      const interesse = e.interesses[k]!;
      if (interesse.prioridade > 0) personagem.definirInteresse(k, interesse, interesse.prioridade);
      else personagem.removerInteresse(k);
    }

    personagem.raiz.position.set(e.x, e.y, e.z);
    personagem.raiz.rotation.set(0, e.yaw, e.caida);
    personagem.raiz.scale.set(e.largura * e.escala, e.altura * e.escala, e.largura * e.escala);
    // Ele acabou de aparecer (em outro lugar): a gelatina e a cordinha não contam a viagem como movimento.
    if (aparecendo) personagem.reposicionar();
    personagem.atualizar(dt);
  }

  esconder(i: number): void {
    const p = this.pecas[i];
    if (p) p.personagem.raiz.visible = false;
  }

  esconderTodos(): void {
    for (const p of this.pecas) p.personagem.raiz.visible = false;
  }

  visivel(i: number): boolean {
    return this.pecas[i]?.personagem.raiz.visible ?? false;
  }

  /** Vez nova ou partida nova: cada balão volta a ser um balão novo (a parada, cara neutra, olhos de frente). */
  reiniciar(): void {
    for (const p of this.pecas) {
      p.personagem.reiniciar();
      p.pedido.momento = 'parado';
      p.acao = 'parado';
      p.cara = NOME_DA_CARA.neutro;
      p.ultimoTempoS = null;
    }
  }

  /** O que o balão `i` faz agora (para o gancho de teste e os testes). */
  diagnostico(i: number): {
    readonly acao: string | null;
    readonly tempoDaAcao: number;
    readonly cara: string;
    readonly olhando: boolean;
    /** Por que o balão está fazendo isso (o momento da tabela de reações). */
    readonly momento: string;
    /** O que do movimento por cima das ações está ligado neste arquivo (olhar, corpoSegue, gelatina, flutuar, cordinha, pálpebras, piscadinha). */
    readonly recursos: PersonagemDeRosto['recursos'];
    /** O peso de cada forma do rosto que não é zero e a elevação do olho (graus): o que o rosto está fazendo de verdade. */
    readonly rosto: ReturnType<PersonagemDeRosto['diagnosticoDoRosto']>;
    /** O que o balão está vestindo de fato (ids do chapéu, bigode, estilo e cor de olho). */
    readonly aparencia: PersonagemDeRosto['aparencia'];
  } {
    const { personagem, pedido } = this.pecas[i]!;
    const acao = personagem.acaoEmCurso;
    return { acao, tempoDaAcao: acao === null ? 0 : personagem.tempoDaAcao(acao), cara: personagem.caraAtual, olhando: personagem.olhandoUmPonto, momento: pedido.momento, recursos: personagem.recursos, rosto: personagem.diagnosticoDoRosto(), aparencia: personagem.aparencia };
  }

  /** O ponto de ancoragem `nome` do balão `i` no mundo, com a posição e a orientação e sem a escala do corpo (a mão se prende nele). */
  ancora(i: number, nome: string, saida: Quadro = quadroVazio()): Quadro {
    this.pecas[i]!.personagem.ancora(nome, saida);
    return saida;
  }

  /** Os materiais do que está na cena, para quem precisa listar (o teste de variantes). */
  materiais(): Material[] {
    const todos = new Set<Material>();
    for (const p of this.pecas) {
      p.personagem.raiz.traverse((o) => {
        const m = (o as { material?: Material | Material[] }).material;
        if (m === undefined) return;
        for (const x of Array.isArray(m) ? m : [m]) todos.add(x);
      });
    }
    return [...todos];
  }

  /** Solta os látex de cada balão (a geometria é da base). */
  descartar(): void {
    this.desligarChapeus?.();
    for (const p of this.pecas) p.personagem.dispose();
  }
}
