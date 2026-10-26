import { quadroVazio, type Colocacao, type Quadro } from '@sinuca/personagens';
import { tingirMaterial, type BaseDoPersonagem, type NivelDeDetalhe, type PersonagemEmCena } from '@sinuca/personagens/three';
import { Group, MeshPhysicalMaterial, SkinnedMesh, type Material } from 'three';
import type { ConfigMaos } from '../config';
import { quadroDasPalmas } from '../maos/gestos-com-contato';

/** Onde estão as mãos de uma equipe no fim da partida, e o que elas fazem. */
export interface LugarDasMaosDoFim {
  /** A base do balão da equipe (m, mundo): as mãos ficam logo abaixo dela. */
  x: number;
  y: number;
  z: number;
  /** Para onde o balão olha (rad, em torno de Y; 0 = para +Z): a câmera está nessa direção. */
  yaw: number;
  /** 0 a 1: o quanto o balão já apareceu; as mãos crescem junto. */
  escala: number;
  ganhou: boolean;
  cor: number;
}

/**
 * Onde o balão do artista prende as mãos (`mao_esq`/`mao_dir`, no mundo, sem a escala do corpo) e quanto o corpo está escalado:
 * a mão fecha com o corpo em vez de ter o tamanho fixo do jogo.
 */
export interface AncorasDasMaos {
  readonly esquerda: Quadro;
  readonly direita: Quadro;
  /** A escala do balão no mundo (a do corpo, vezes o quanto ele já apareceu). */
  readonly escalaDoCorpo: number;
}

interface ParDeMaos {
  readonly direita: PersonagemEmCena;
  readonly esquerda: PersonagemEmCena;
  readonly materiais: Map<Material, Material>;
  cor: number;
  /** O que as mãos fazem: `true` palmas, `false` mão mole; `null` ainda não começaram. */
  ganhou: boolean | null;
}

/**
 * As mãos do fim da partida (L29): ao lado do balão de cada equipe, as de quem ganhou batem palmas e as de quem perdeu ficam moles,
 * penduradas, até a tela de fim. Cada equipe tem as suas duas mãos (uma direita e uma esquerda, a espelhada), feitas na hora em que
 * a equipe aparece, com o látex da cor dela: os materiais são cópias, para uma equipe não tingir a outra. Só desenha o que
 * `mostrar` diz, uma vez por quadro e por equipe.
 */
export class MaosDoFim {
  readonly grupo = new Group();
  private base: BaseDoPersonagem | null = null;
  private nivel: NivelDeDetalhe;
  /** O quadro de agora usa as âncoras do balão do artista (muda o gesto de quem ganhou). */
  private ancorado = false;
  private readonly pares: (ParDeMaos | undefined)[] = [];
  private readonly quadro: Quadro = quadroVazio();
  private readonly colocacao: { -readonly [K in keyof Colocacao]: Colocacao[K] } = { escala: 1, espelho: false };

  constructor(
    private readonly cfg: ConfigMaos,
    nivel: NivelDeDetalhe,
  ) {
    this.grupo.name = 'maos-do-fim';
    this.nivel = nivel;
  }

  /** O arquivo da mão chegou (a mesma base das mãos da mira). */
  usar(base: BaseDoPersonagem): void {
    this.base = base;
  }

  definirNivel(nivel: NivelDeDetalhe): void {
    this.nivel = nivel;
    for (const par of this.pares) {
      par?.direita.definirNivel(nivel);
      par?.esquerda.definirNivel(nivel);
    }
  }

  /** Os materiais de látex de uma equipe (sem repetir), para o diagnóstico e os testes. */
  materiaisDe(equipe: number): Material[] {
    const par = this.pares[equipe];
    return par === undefined ? [] : [...par.materiais.values()];
  }

  /** O que cada equipe faz agora, na ordem das equipes (as que ainda não apareceram, `null`). */
  diagnostico(): { readonly direita: string | null; readonly esquerda: string | null; readonly cor: number }[] {
    return this.pares.map((par) => ({ direita: par?.direita.gestoEmCurso ?? null, esquerda: par?.esquerda.gestoEmCurso ?? null, cor: par?.cor ?? 0 }));
  }

  esconderTodas(): void {
    for (const par of this.pares) {
      if (par === undefined) continue;
      par.direita.raiz.visible = false;
      par.esquerda.raiz.visible = false;
    }
  }

  /** Põe as duas mãos da equipe `i` no lugar dela neste quadro (e as cria na primeira vez). */
  mostrar(i: number, lugar: LugarDasMaosDoFim, dt: number, ancoras: AncorasDasMaos | null = null): void {
    if (this.base === null) return;
    const par = this.pares[i] ?? this.criar(i, lugar.cor);
    if (par.cor !== lugar.cor) this.tingir(par, lugar.cor);
    const aparece = lugar.escala > 0.01;
    par.direita.raiz.visible = aparece;
    par.esquerda.raiz.visible = aparece;
    if (!aparece) return;
    this.ancorado = ancoras !== null;
    if (par.ganhou !== lugar.ganhou) this.comecar(par, lugar.ganhou);
    const { fim } = this.cfg.reacoes;
    if (ancoras !== null) {
      this.prender(par, lugar, ancoras, dt);
      return;
    }
    const escala = this.cfg.escala * fim.escala * Math.min(lugar.escala, 1);
    // Para a câmera (de onde o balão olha) e para a direita da tela.
    const frenteX = Math.sin(lugar.yaw);
    const frenteZ = Math.cos(lugar.yaw);
    const direitaX = Math.cos(lugar.yaw);
    const direitaZ = -Math.sin(lugar.yaw);
    const x = lugar.x + frenteX * fim.afastamento;
    const y = lugar.y - fim.descida;
    const z = lugar.z + frenteZ * fim.afastamento;
    if (lugar.ganhou) {
      const contato = this.base.modelo.contatos.gestos.get('palmas');
      for (const mao of [par.direita, par.esquerda]) {
        if (contato === undefined) break;
        this.colocacao.escala = escala;
        this.colocacao.espelho = mao.espelho;
        quadroDasPalmas(contato, this.colocacao, { x, y, z }, direitaX, direitaZ, this.quadro);
        mao.colocar(this.quadro, escala);
      }
    } else {
      // Dedos para longe da câmera, o dorso para cima: o gesto deixa a mão cair dali.
      const q = this.quadro;
      q.xx = direitaX;
      q.xy = 0;
      q.xz = direitaZ;
      q.yx = -frenteX;
      q.yy = 0;
      q.yz = -frenteZ;
      q.zx = 0;
      q.zy = 1;
      q.zz = 0;
      for (const mao of [par.direita, par.esquerda]) {
        // A mão esquerda é a espelhada: só desloca o ponto de apoio dela para o lado, o par fica junto do balão.
        const lado = mao.espelho ? -1 : 1;
        q.px = x + direitaX * lado * 0.06 * escala;
        q.py = y;
        q.pz = z + direitaZ * lado * 0.06 * escala;
        mao.colocar(q, escala);
      }
    }
    par.direita.atualizar(dt);
    par.esquerda.atualizar(dt);
  }

  /**
   * As mãos nos pontos do balão do artista: a posição vem da âncora (o balão pula, estufa e murcha com elas) e o tamanho do corpo; o
   * giro é o do balão (dedos para longe da câmera, dorso para cima), o mesmo de quando não há âncora, que o gesto sabe ler.
   * Quem ganhou dá socos no ar (de novo, enquanto o fim durar); quem perdeu fica com a mão mole.
   */
  private prender(par: ParDeMaos, lugar: LugarDasMaosDoFim, ancoras: AncorasDasMaos, dt: number): void {
    const { fim } = this.cfg.reacoes;
    const escala = ancoras.escalaDoCorpo * fim.escalaNoBalao;
    const frenteX = Math.sin(lugar.yaw);
    const frenteZ = Math.cos(lugar.yaw);
    const direitaX = Math.cos(lugar.yaw);
    const direitaZ = -Math.sin(lugar.yaw);
    const q = this.quadro;
    q.xx = direitaX;
    q.xy = 0;
    q.xz = direitaZ;
    q.yx = -frenteX;
    q.yy = 0;
    q.yz = -frenteZ;
    q.zx = 0;
    q.zy = 1;
    q.zz = 0;
    for (const mao of [par.direita, par.esquerda]) {
      const ponto = mao.espelho ? ancoras.esquerda : ancoras.direita;
      q.px = ponto.px;
      q.py = ponto.py;
      q.pz = ponto.pz;
      mao.colocar(q, escala);
      if (lugar.ganhou && mao.gestoEmCurso === null) mao.fazerGesto('soco_ar', fim.palmasEntradaS, fim.palmasEntradaS);
    }
    par.direita.atualizar(dt);
    par.esquerda.atualizar(dt);
  }

  private criar(i: number, cor: number): ParDeMaos {
    const base = this.base!;
    const direita = base.instanciar(false);
    const esquerda = base.instanciar(true);
    direita.raiz.name = `fim-${i}-direita`;
    esquerda.raiz.name = `fim-${i}-esquerda`;
    const par: ParDeMaos = { direita, esquerda, materiais: new Map(), cor, ganhou: null };
    for (const mao of [direita, esquerda]) {
      mao.definirNivel(this.nivel);
      mao.raiz.visible = false;
      mao.raiz.traverse((o) => {
        if (!(o instanceof SkinnedMesh)) return;
        const original = o.material as Material;
        let copia = par.materiais.get(original);
        if (copia === undefined) {
          copia = original.clone();
          par.materiais.set(original, copia);
        }
        o.material = copia;
      });
      this.grupo.add(mao.raiz);
    }
    this.pares[i] = par;
    this.tingir(par, cor);
    return par;
  }

  private tingir(par: ParDeMaos, cor: number): void {
    par.cor = cor;
    for (const m of par.materiais.values()) if (m instanceof MeshPhysicalMaterial) tingirMaterial(m, cor);
  }

  /** Começa o gesto do fim: palmas em ciclo para quem ganhou, a mão mole (que fica pendurada) para quem perdeu. */
  private comecar(par: ParDeMaos, ganhou: boolean): void {
    par.ganhou = ganhou;
    const { fim } = this.cfg.reacoes;
    for (const mao of [par.direita, par.esquerda]) {
      mao.ir('repouso', 0);
      if (ganhou) mao.fazerGesto(this.ancorado ? 'soco_ar' : 'palmas', fim.palmasEntradaS, fim.palmasEntradaS, this.ancorado ? {} : { repetir: true });
      else mao.fazerGesto('mole', fim.moleEntradaS, fim.moleEntradaS);
      if (mao.aditivos.includes('respirar')) mao.ligarAditivo('respirar', 1);
    }
  }

  dispose(): void {
    for (const par of this.pares) {
      if (par === undefined) continue;
      par.direita.dispose();
      par.esquerda.dispose();
      for (const m of par.materiais.values()) m.dispose();
    }
    this.grupo.removeFromParent();
  }
}
