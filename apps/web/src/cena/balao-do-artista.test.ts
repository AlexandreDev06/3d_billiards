import { Quaternion, Vector3, type MeshPhysicalMaterial, type SkinnedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import { quadroVazio } from '@sinuca/personagens';
import { TEMPO_DO_PERFILADOR_MS, provarSemAlocar } from '@sinuca/personagens/testes';
import { CONFIG_WEB } from '../config';
import { INTERESSE } from '../baloes/atencao-do-balao';
import { balaoDoArtista, balaoDoArtistaComoV1 } from '../maos/para-testes';
import { estadoVazioDoBalao, type EstadoDoBalao } from './balao';
import { BaloesDoArtista } from './balao-do-artista';

const BASE = await balaoDoArtista();
/** O mesmo arquivo lido com as notas do v1: sem as ações e caras novas nem as chaves do v2. */
const BASE_V1 = await balaoDoArtistaComoV1();
const novo = (quantos = 4, base = BASE): BaloesDoArtista => new BaloesDoArtista(CONFIG_WEB.baloes, base, 'alto', () => 0.5, quantos);
const estado = (mudancas: Partial<EstadoDoBalao> = {}): EstadoDoBalao => ({ ...estadoVazioDoBalao(), escala: 1, cor: 0x3aa0ff, ...mudancas });
const peso = (m: SkinnedMesh, forma: string): number => m.morphTargetInfluences![m.morphTargetDictionary![forma]!]!;
const malhas = (b: BaloesDoArtista, i: number): SkinnedMesh[] => {
  const achadas: SkinnedMesh[] = [];
  b.grupo.children[i]!.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh && o.visible) achadas.push(o as SkinnedMesh);
  });
  return achadas;
};

/** Passa `s` segundos de relógio da página, quadro a quadro. */
function passar(b: BaloesDoArtista, i: number, e: EstadoDoBalao, s: number, passo = 1 / 30): void {
  const fim = e.tempoS + s;
  while (e.tempoS < fim - 1e-9) {
    e.tempoS += passo;
    b.mostrar(i, e);
  }
}

describe('BaloesDoArtista', () => {
  it('nasce escondido, aparece com escala e some com escala zero', () => {
    const b = novo();
    expect(b.quantos).toBe(4);
    for (let i = 0; i < 4; i++) expect(b.visivel(i)).toBe(false);
    b.mostrar(1, estado({ x: 1, y: 0.5, z: -0.3 }));
    expect(b.visivel(1)).toBe(true);
    const g = b.grupo.children[1]!;
    expect([g.position.x, g.position.y, g.position.z]).toEqual([1, 0.5, -0.3]);
    b.mostrar(1, estado({ escala: 0 }));
    expect(b.visivel(1)).toBe(false);
    b.descartar();
  });

  it('o tamanho segue a escala, a largura e a altura; o giro, o yaw', () => {
    const b = novo();
    b.mostrar(0, estado({ largura: 2, altura: 3, escala: 0.5, yaw: 0.7 }));
    const g = b.grupo.children[0]!;
    expect(g.scale.toArray()).toEqual([1, 1.5, 1]);
    expect(g.rotation.y).toBeCloseTo(0.7, 9);
    b.descartar();
  });

  it('cada balão tem a sua cor de equipe, só no látex', () => {
    const b = novo();
    b.mostrar(0, estado({ cor: 0xff0000 }));
    b.mostrar(1, estado({ cor: 0x00ff00 }));
    const latex = (i: number) => malhas(b, i).map((m) => m.material as MeshPhysicalMaterial).find((m) => m.name === 'latex_glb')!;
    expect(latex(0).color.getHex()).toBe(0xff0000);
    expect(latex(1).color.getHex()).toBe(0x00ff00);
    b.mostrar(0, estado({ cor: 0x0000ff }));
    expect(latex(0).color.getHex()).toBe(0x0000ff);
    b.descartar();
  });

  it('a cara do estado vai para as formas, com mistura suave', () => {
    const b = novo();
    const e = estado({ cara: 'sorriso' });
    passar(b, 0, e, 0.04);
    const meio = peso(malhas(b, 0)[0]!, 'cara_sorriso');
    expect(meio).toBeGreaterThan(0);
    expect(meio).toBeLessThan(1);
    passar(b, 0, e, 0.8);
    for (const m of malhas(b, 0)) expect(peso(m, 'cara_sorriso')).toBeCloseTo(1, 3);
    b.descartar();
  });

  /** A mesma reação, no arquivo v2 completo e no arquivo lido como v1: o que cada um faz, e o recuo do v1. */
  describe.each([
    ['v2', BASE, { concentrar: 'balao_concentrar', comemorar: 'balao_comemorar', bravo: 'balao_bravo', ufa: 'balao_ufa', rir: 'balao_rir', impaciente: 'balao_impaciente' }],
    ['v1', BASE_V1, { concentrar: 'balao_inclinar', comemorar: 'balao_pulinho', bravo: 'balao_susto', ufa: null, rir: 'balao_pulinho', impaciente: 'balao_inclinar' }],
  ] as const)('as reações no arquivo %s', (_versao, base, acao) => {
    it('mirando, o balão se concentra e repete o trecho do meta; parado volta à parada', () => {
      const b = novo(4, base);
      const e = estado({ mirando: true });
      passar(b, 0, e, 1.5);
      expect(b.diagnostico(0).acao).toBe(acao.concentrar);
      expect(b.diagnostico(0).momento).toBe('mirando');
      // o trecho repetido nunca sai do ciclo da meta
      const ciclo = base.meta.acoes.get(acao.concentrar)!.cicloS!;
      for (let k = 0; k < 12; k++) {
        passar(b, 0, e, 0.5);
        expect(b.diagnostico(0).acao).toBe(acao.concentrar);
        expect(b.diagnostico(0).tempoDaAcao).toBeGreaterThanOrEqual(ciclo[0] - 1e-6);
        expect(b.diagnostico(0).tempoDaAcao).toBeLessThanOrEqual(ciclo[1] + 1e-6);
      }
      e.mirando = false;
      passar(b, 0, e, 1);
      expect(b.diagnostico(0).acao).toBeNull();
      b.descartar();
    });

    it('a cara de concentrado só existe no v2; no v1 a cara fica neutra', () => {
      const b = novo(4, base);
      passar(b, 0, estado({ mirando: true }), 1);
      expect(b.diagnostico(0).cara).toBe(_versao === 'v2' ? 'cara_concentrado' : 'cara_neutro');
      b.descartar();
    });

    it('encaçapar: pulinho uma vez, com o sorriso; no fim do rosto volta à parada (o sorriso pedido não dispara outro pulinho)', () => {
      const b = novo(4, base);
      const e = estado({ cara: 'sorriso' });
      passar(b, 0, e, 0.3);
      expect(b.diagnostico(0).acao).toBe('balao_pulinho');
      passar(b, 0, e, 2);
      expect(b.diagnostico(0).acao).toBeNull();
      b.descartar();
    });

    it('duas bolas numa tacada: comemorar com a cara comemorando (no v1, o pulinho de sorriso)', () => {
      const b = novo(4, base);
      const e = estado({ cara: 'comemorando' });
      passar(b, 0, e, 0.4);
      expect(b.diagnostico(0).acao).toBe(acao.comemorar);
      passar(b, 0, e, 0.8);
      expect(b.diagnostico(0).cara).toBe(_versao === 'v2' ? 'cara_comemorando' : 'cara_sorriso');
      b.descartar();
    });

    it('o susto da raspada: balao_susto, uma vez; passado o susto, o ufa (no v1 não há: fica a parada)', () => {
      const b = novo(4, base);
      const e = estado({ cara: 'susto' });
      passar(b, 0, e, 0.2);
      expect(b.diagnostico(0).acao).toBe('balao_susto');
      passar(b, 0, e, 2);
      expect(b.diagnostico(0).acao).toBeNull();
      e.cara = 'ufa';
      passar(b, 0, e, 0.4);
      expect(b.diagnostico(0).acao).toBe(acao.ufa);
      passar(b, 0, e, 0.8);
      expect(b.diagnostico(0).cara).toBe(_versao === 'v2' ? 'cara_ufa' : 'cara_neutro');
      b.descartar();
    });

    it('a falta: bravo (no v1, o susto de antes)', () => {
      const b = novo(4, base);
      const e = estado({ cara: 'bravo' });
      passar(b, 0, e, 0.3);
      expect(b.diagnostico(0).acao).toBe(acao.bravo);
      passar(b, 0, e, 0.8);
      for (const m of malhas(b, 0)) {
        if (_versao === 'v2') expect(peso(m, 'cara_bravo')).toBeCloseTo(1, 3);
        else {
          expect(peso(m, 'cara_susto')).toBeCloseTo(1, 3);
          expect(peso(m, 'cara_bravo')).toBe(0);
        }
      }
      b.descartar();
    });

    it('provocação: ri (gargalhando) e depois fica convencido, na mesma ação que repete', () => {
      const b = novo(4, base);
      const e = estado({ cara: 'rindo' });
      passar(b, 0, e, 0.5);
      expect(b.diagnostico(0).acao).toBe(acao.rir);
      expect(b.diagnostico(0).momento).toBe('gargalhou');
      passar(b, 0, e, 0.8);
      expect(b.diagnostico(0).cara).toBe(_versao === 'v2' ? 'cara_rindo' : 'cara_sorriso');
      e.cara = 'convencido';
      passar(b, 0, e, 0.8);
      expect(b.diagnostico(0).momento).toBe('provocou');
      expect(b.diagnostico(0).cara).toBe(_versao === 'v2' ? 'cara_convencido' : 'cara_sorriso');
      if (_versao === 'v2') expect(b.diagnostico(0).acao).toBe('balao_rir');
      b.descartar();
    });

    it('a vez demorando: impaciente, de cara de tédio (no v1 segue inclinado)', () => {
      const b = novo(4, base);
      const e = estado({ mirando: true, impaciente: true });
      passar(b, 0, e, 1.2);
      expect(b.diagnostico(0).acao).toBe(acao.impaciente);
      expect(b.diagnostico(0).cara).toBe(_versao === 'v2' ? 'cara_tedio' : 'cara_neutro');
      b.descartar();
    });

    it('no fim: quem ganhou estufa (de cara comemorando) e quem perdeu murcha (de cara triste), e ficam assim', () => {
      const b = novo(4, base);
      const g = estado({ fim: 'ganhou', cara: 'sorriso' });
      const p = estado({ fim: 'perdeu', cara: 'triste' });
      passar(b, 0, g, 2.4);
      passar(b, 1, p, 2.4);
      expect(b.diagnostico(0).acao).toBe('balao_estufar');
      expect(b.diagnostico(1).acao).toBe('balao_murchar');
      expect(b.diagnostico(0).cara).toBe(_versao === 'v2' ? 'cara_comemorando' : 'cara_sorriso');
      expect(b.diagnostico(1).cara).toBe('cara_triste');
      const larguraDe = (i: number): number => b.grupo.children[i]!.getObjectByName('espinha_2')!.getWorldScale(new Vector3()).x;
      const alturaDe = (i: number): number => b.grupo.children[i]!.getObjectByName('espinha_2')!.getWorldScale(new Vector3()).y;
      expect(larguraDe(0)).toBeGreaterThan(1.2);
      expect(alturaDe(1)).toBeLessThan(0.8);
      b.descartar();
    });

    it('o movimento por cima das ações liga o que o arquivo oferece (a cordinha, a gelatina, o flutuar, o olhar) e as pálpebras só no v2', () => {
      const b = novo(4, base);
      const r = b.diagnostico(0).recursos;
      expect([r.olhar, r.corpoSegue, r.gelatina, r.flutuar, r.cordinha]).toEqual([true, true, true, true, true]);
      expect([r.palpebras, r.piscadinha]).toEqual(_versao === 'v2' ? [true, true] : [false, false]);
      b.descartar();
    });
  });

  it('o balão olha o que importa: a branca, e a câmera só de vez em quando; sem interesse nenhum olha à frente', () => {
    const b = novo();
    const e = estado();
    e.interesses[INTERESSE.branca] = { x: 0.3, y: 0.0286, z: 0.5, prioridade: 3 };
    e.interesses[INTERESSE.camera] = { x: 0, y: 1, z: 2, prioridade: 0.7 };
    passar(b, 0, e, 0.5);
    expect(b.diagnostico(0).olhando).toBe(true);
    for (const k of [INTERESSE.branca, INTERESSE.camera]) e.interesses[k]!.prioridade = 0;
    passar(b, 0, e, 0.5);
    expect(b.diagnostico(0).olhando).toBe(false);
    b.descartar();
  });

  it('a bola que começa a rolar leva o olhar de uma vez (interrompe a branca)', () => {
    const b = novo();
    const e = estado();
    e.interesses[INTERESSE.branca] = { x: -0.4, y: 0.0286, z: 0.5, prioridade: 3.2 };
    passar(b, 0, e, 1);
    const olho = b.grupo.children[0]!.getObjectByName('olho_esq')!;
    const alvoNoMundo = (x: number, z: number): number => {
      b.grupo.updateMatrixWorld(true);
      const posicao = new Vector3().setFromMatrixPosition(olho.matrixWorld);
      return new Vector3(x, 0.0286, z).sub(posicao).normalize().x;
    };
    // a branca está do lado de −x: o olho (que mira +z do mundo no repouso) aponta para a direita do balão
    expect(alvoNoMundo(-0.4, 0.5)).toBeLessThan(0);
    e.interesses[INTERESSE.bolaQueAnda] = { x: 0.4, y: 0.0286, z: 0.5, prioridade: 4.5 };
    passar(b, 0, e, 0.6);
    const quaternion = olho.getWorldQuaternion(new Quaternion());
    const mira = new Vector3(0, 0, 1).applyQuaternion(quaternion);
    // o olho de repouso aponta +z do mundo só depois de desfazer o giro do osso: basta ver que o olhar saiu da branca
    expect(Number.isFinite(mira.x)).toBe(true);
    expect(b.diagnostico(0).olhando).toBe(true);
    b.descartar();
  });

  it('o jogo esconde todos e mostra um a cada quadro: o relógio do balão anda e nada reposiciona', () => {
    const b = novo();
    const e = estado({ cara: 'sorriso' });
    let ultimo = -1;
    let acumulado = 0;
    for (let q = 0; q < 24; q++) {
      e.tempoS += 1 / 60;
      b.esconderTodos();
      b.mostrar(0, e);
      const t = b.diagnostico(0).tempoDaAcao;
      if (q > 3) acumulado += t - ultimo > 0 ? 1 : 0;
      ultimo = t;
    }
    // a ação do sorriso (o pulinho) anda quadro a quadro, como se o balão nunca tivesse sumido
    expect(b.diagnostico(0).acao).toBe('balao_pulinho');
    expect(b.diagnostico(0).tempoDaAcao).toBeGreaterThan(0.2);
    expect(acumulado).toBeGreaterThanOrEqual(18);
    b.descartar();
  });

  // L46c: numa máquina lenta (o software de captura dá 1 a 3 quadros por segundo) o intervalo entre quadros passa de `SUMIDO_HA_S`: o balão
  // que está sempre à vista não é "recém-chegado", e o relógio dele não pode ficar em zero (o piscar congelava no meio e o olho parecia fechado).
  it('quadros lentos (0,6 s entre eles) não congelam o balão: a cara chega, a ação anda e um piscar começa e termina', () => {
    const b = novo();
    const e = estado({ cara: 'sorriso' });
    let acao = 0;
    let maiorPiscar = 0;
    for (let q = 0; q < 70; q++) {
      e.tempoS += 0.6;
      b.esconderTodos();
      b.mostrar(0, e);
      acao = Math.max(acao, b.diagnostico(0).tempoDaAcao);
      maiorPiscar = Math.max(maiorPiscar, peso(malhas(b, 0)[0]!, 'piscar'));
      if (q === 11) expect(peso(malhas(b, 0)[0]!, 'cara_sorriso')).toBeGreaterThan(0.95);
    }
    expect(acao).toBeGreaterThan(0.3);
    // cada quadro anda no máximo `PASSO_MAXIMO_S` (0,1 s): o primeiro piscar (sorteio 0,5 = 4 s) chega no quadro 40 e a piscada de 0,28 s leva uns 3
    expect(maiorPiscar).toBeGreaterThan(0.5);
    expect(peso(malhas(b, 0)[0]!, 'piscar')).toBeLessThan(0.05);
    b.descartar();
  });

  describe('aparecer em outro lugar (o salto real é de 0,1 a 0,3 m, abaixo do teleporte próprio da cordinha)', () => {
    /** A ponta da cordinha em relação ao nó dela, no mundo (m): o que ela tem pendurado. */
    const pontaDaCordinha = (b: BaloesDoArtista): Vector3 => {
      const g = b.grupo.children[0]!;
      g.updateMatrixWorld(true);
      const no = new Vector3().setFromMatrixPosition(g.getObjectByName('cordinha_1')!.matrixWorld);
      return new Vector3().setFromMatrixPosition(g.getObjectByName('cordinha_4')!.matrixWorld).sub(no);
    };
    const escalaDoCorpo = (b: BaloesDoArtista): Vector3 => b.grupo.children[0]!.getObjectByName('espinha_1')!.scale.clone();

    /** Aparece em outro lugar, `salto` m ao lado, e devolve o pior desvio de `medida` nos quadros seguintes. */
    const aparecerNoLado = <T>(salto: number, medida: (b: BaloesDoArtista) => T, desvio: (a: T, b: T) => number): number => {
      const b = novo();
      const e = estado({ x: 0, y: 0.5, z: 0 });
      passar(b, 0, e, 2);
      const antes = medida(b);
      b.esconder(0);
      e.x += salto;
      e.tempoS += 5;
      b.mostrar(0, e);
      let pior = desvio(medida(b), antes);
      for (let k = 0; k < 6; k++) {
        e.tempoS += 1 / 60;
        b.mostrar(0, e);
        pior = Math.max(pior, desvio(medida(b), antes));
      }
      b.descartar();
      return pior;
    };
    const entreVetores = (a: Vector3, b: Vector3): number => a.distanceTo(b);

    // sem o `reposicionar` o nó pula e a corrente chicoteia (0,1 e 0,2 m: 8 a 9 cm de desvio); acima de ~0,29 m a própria cordinha já teleporta
    it.each([0.1, 0.2, 0.3])('um salto de %s m: a ponta da cordinha continua pendurada (sem chicote)', (salto) => {
      expect(aparecerNoLado(salto, pontaDaCordinha, entreVetores)).toBeLessThan(0.01);
    });

    it.each([0.1, 0.2, 0.3])('um salto de %s m: a gelatina não conta a viagem como aceleração', (salto) => {
      expect(aparecerNoLado(salto, escalaDoCorpo, entreVetores)).toBeLessThan(0.05);
    });

    it('um salto muito maior também não arrasta nem estala', () => {
      const b = novo();
      const e = estado({ x: 0, y: 0.5, z: 0 });
      passar(b, 0, e, 1);
      b.esconder(0);
      e.x = 3;
      e.y = 0.9;
      e.z = -2;
      e.tempoS += 5;
      b.mostrar(0, e);
      passar(b, 0, e, 0.1);
      const g = b.grupo.children[0]!;
      g.updateMatrixWorld(true);
      const elos = ['cordinha_1', 'cordinha_2', 'cordinha_3', 'cordinha_4'].map((n) => new Vector3().setFromMatrixPosition(g.getObjectByName(n)!.matrixWorld));
      for (let k = 1; k < elos.length; k++) expect(elos[k]!.distanceTo(elos[k - 1]!)).toBeLessThan(0.04);
      expect(Math.abs(g.getObjectByName('espinha_1')!.scale.y - 1)).toBeLessThan(0.3);
      b.descartar();
    });
  });

  it('mostrar não aloca por quadro: balão a balão, com o olhar, as ações e as caras mudando (perfilador de alocação)', async () => {
    const b = novo();
    const e = estado({ mirando: true });
    const cara = ['neutro', 'sorriso', 'susto', 'comemorando'] as const;
    const passo = (i: number): void => {
      e.tempoS += 1 / 60;
      e.x = 0.1 * Math.sin(i * 0.02);
      e.y = 0.5 + 0.02 * Math.sin(i * 0.05);
      e.interesses[INTERESSE.branca]!.x = 0.3 * Math.sin(i * 0.01);
      e.interesses[INTERESSE.branca]!.prioridade = 3;
      e.interesses[INTERESSE.camera]!.prioridade = 0.7;
      // a cada ~5 s uma reação nova: o pedido muda raramente, e só aí o balão pede a ação e a cara
      e.cara = cara[Math.floor(i / 300) % cara.length]!;
      b.esconderTodos();
      b.mostrar(0, e);
    };
    await provarSemAlocar(passo, { aquecer: 25_000, quadros: 8000 });
    b.descartar();
  }, TEMPO_DO_PERFILADOR_MS);

  it('um salto grande de relógio (aba parada) não dispara a ação inteira de uma vez', () => {
    const b = novo();
    const e = estado({ mirando: true });
    passar(b, 0, e, 0.1);
    e.tempoS += 30;
    b.mostrar(0, e);
    expect(b.diagnostico(0).tempoDaAcao).toBeLessThan(1);
    b.descartar();
  });

  it('reiniciar volta a balão novo: sem ação, cara neutra', () => {
    const b = novo();
    const e = estado({ mirando: true, cara: 'sorriso' });
    passar(b, 0, e, 0.5);
    b.reiniciar();
    expect(b.diagnostico(0).acao).toBeNull();
    expect(b.diagnostico(0).cara).toBe('cara_neutro');
    b.descartar();
  });

  it('o nível baixo mostra a malha baixa; o alto, a alta', () => {
    const b = novo();
    b.mostrar(0, estado());
    expect(malhas(b, 0).every((m) => m.name.startsWith('balao_alta'))).toBe(true);
    b.definirNivel('baixo');
    expect(malhas(b, 0).every((m) => m.name.startsWith('balao_baixa'))).toBe(true);
    b.descartar();
  });

  it('a âncora da mão fica no mundo, ao lado do balão, e não cresce com o corpo', () => {
    const b = novo();
    const e = estado({ x: 1, y: 0.5, z: 0, fim: 'ganhou', cara: 'sorriso' });
    passar(b, 0, e, 0.1);
    const q = quadroVazio();
    b.ancora(0, 'mao_esq', q);
    expect(Math.hypot(q.xx, q.xy, q.xz)).toBeCloseTo(1, 6);
    expect(q.px).toBeGreaterThan(1.05);
    b.descartar();
  });
});
