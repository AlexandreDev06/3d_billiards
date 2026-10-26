import { quadroVazio, type Quadro } from '@sinuca/personagens';
import type { BaseDoRosto, NivelDeDetalhe, PersonagemDeRosto } from '@sinuca/personagens/three';
import { Group, type Material } from 'three';
import { NOME_DA_ACAO, NOME_DA_CARA, pedidoDoBalao, type AcaoDoBalao, type PedidoDoBalao } from '../baloes/acao-do-balao';
import type { ConfigBaloes } from '../config';
import type { BaloesEmCena, EstadoDoBalao } from './balao';

/** O relógio da página pode dar um salto (aba parada, quadro lento): o balão nunca anda mais que isto de uma vez (s). */
const PASSO_MAXIMO_S = 0.1;

interface Peca {
  readonly personagem: PersonagemDeRosto;
  ultimoTempoS: number | null;
  /** O que foi pedido por último: o corpo e a cara só mudam quando o pedido muda. */
  acao: AcaoDoBalao;
  cara: string;
  readonly pedido: PedidoDoBalao;
}

/**
 * Os balões do artista (L30, `balao.glb`): um por equipe (até quatro), com o corpo e o rosto do arquivo, o látex na cor da equipe e
 * as ações que o jogo pede (`pedidoDoBalao`: a parada, inclinar na mira, pulinho, susto, estufar e murchar), a cara por formas, os
 * olhos que miram um ponto do mundo e o piscar sozinho. Cada um tem os seus ossos e o seu látex e divide a geometria. O dono pede um
 * por vez (`mostrar`, uma vez por quadro) e esconde o que não usa.
 */
export class BaloesDoArtista implements BaloesEmCena {
  readonly grupo = new Group();
  private readonly pecas: Peca[] = [];

  constructor(
    private readonly cfg: ConfigBaloes,
    base: BaseDoRosto,
    nivel: NivelDeDetalhe,
    sorteio: () => number,
    quantos = 4,
  ) {
    this.grupo.name = 'baloes-do-artista';
    for (let i = 0; i < quantos; i++) {
      const personagem = base.instanciar({ cor: 0xffffff, sorteio, taxaDoOlhar: cfg.arquivo.olhar.taxaDoOlho });
      personagem.raiz.name = `balao-${i}`;
      personagem.raiz.visible = false;
      personagem.definirNivel(nivel);
      this.grupo.add(personagem.raiz);
      this.pecas.push({ personagem, ultimoTempoS: null, acao: 'parado', cara: NOME_DA_CARA.neutro, pedido: { acao: 'parado', repetir: false, cara: 'neutro' } });
    }
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
    const dt = p.ultimoTempoS === null ? 0 : Math.min(Math.max(e.tempoS - p.ultimoTempoS, 0), PASSO_MAXIMO_S);
    p.ultimoTempoS = e.tempoS;

    // O que o balão faz muda só quando o pedido muda: o sorriso que dura mais que o pulinho não pula de novo.
    const pedido = pedidoDoBalao(e.cara, e.mirando, e.fim, p.pedido);
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
    if (e.olhar !== null) personagem.olharPara(e.olhar);
    else personagem.pararDeOlhar();

    personagem.raiz.position.set(e.x, e.y, e.z);
    personagem.raiz.rotation.set(0, e.yaw, e.caida);
    personagem.raiz.scale.set(e.largura * e.escala, e.altura * e.escala, e.largura * e.escala);
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
      p.acao = 'parado';
      p.cara = NOME_DA_CARA.neutro;
      p.ultimoTempoS = null;
    }
  }

  /** O que o balão `i` faz agora (para o gancho de teste e os testes). */
  diagnostico(i: number): { readonly acao: string | null; readonly tempoDaAcao: number; readonly cara: string; readonly olhando: boolean } {
    const { personagem } = this.pecas[i]!;
    const acao = personagem.acaoEmCurso;
    return { acao, tempoDaAcao: acao === null ? 0 : personagem.tempoDaAcao(acao), cara: personagem.caraAtual, olhando: personagem.olhandoUmPonto };
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
    for (const p of this.pecas) p.personagem.dispose();
  }
}
