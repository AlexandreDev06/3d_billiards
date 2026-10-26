import { describe, expect, it } from 'vitest';
import type { IdBola } from '@sinuca/fisica';
import type { FichaDaBola } from './bola-estilo';
import type { PlanoDaTransicao } from '../jogo/transicao-modelo';
import { TransicaoDaTacada, type AdaptadoresDaTransicao, type BolaDaCena, type ConfigDoMovimento } from './transicao';

const R = 0.027;
const CFG: ConfigDoMovimento = { levantarM: 0.12, subidaDoVoo: 0.3, arcoPx: 80, acenderMs: 1200, pulsosPorSegundo: 2.5, pulsoEscala: 0.12 };

function bola(x: number, z: number, visivel = true): BolaDaCena & { escalaAtual: number } {
  const b = {
    position: {
      x,
      y: R,
      z,
      set(nx: number, ny: number, nz: number) {
        this.x = nx;
        this.y = ny;
        this.z = nz;
      },
    },
    scale: {
      x: 1,
      setScalar(v: number) {
        this.x = v;
      },
    },
    visible: visivel,
    get escalaAtual() {
      return this.scale.x;
    },
  };
  return b;
}

interface Chamadas {
  aneis: { ids: readonly IdBola[]; intensidade: number; escala: number }[];
  aneisEscondidos: number;
  voos: { indice: number; ficha: FichaDaBola; x: number; y: number; escala: number }[];
  voosEscondidos: number[];
  acesas: { bola: IdBola; jogador: number }[];
}

function montar(opcoes: { chip?: { x: number; y: number; tamanho: number } | null; projetavel?: boolean } = {}) {
  const bolas: (ReturnType<typeof bola> | undefined)[] = [];
  const chamadas: Chamadas = { aneis: [], aneisEscondidos: 0, voos: [], voosEscondidos: [], acesas: [] };
  const ad: AdaptadoresDaTransicao = {
    bolas,
    aneis: {
      mostrar: (ids, _b, intensidade, escala) => void chamadas.aneis.push({ ids: [...ids], intensidade, escala }),
      esconder: () => void chamadas.aneisEscondidos++,
    },
    projetar: (x, _y, _z, _r, saida) => {
      if (opcoes.projetavel === false) return false;
      saida.x = 400 + x * 100;
      saida.y = 300;
      saida.tamanho = 40;
      return true;
    },
    placar: {
      posicaoDaFicha: () => (opcoes.chip === undefined ? { x: 100, y: 60, tamanho: 20 } : opcoes.chip),
      acenderFicha: (b, j) => void chamadas.acesas.push({ bola: b, jogador: j }),
    },
    voos: {
      mostrar: (indice, ficha, x, y, escala) => void chamadas.voos.push({ indice, ficha, x, y, escala }),
      esconder: (indice) => void chamadas.voosEscondidos.push(indice),
    },
    raioDaBola: () => R,
    cfg: CFG,
  };
  const t = new TransicaoDaTacada(ad);
  let fins = 0;
  const comecar = (plano: PlanoDaTransicao, extra: { destinos?: Record<number, { x: number; z: number }>; existiam?: IdBola[] } = {}) =>
    t.iniciar(
      {
        plano,
        fichas: new Map<IdBola, FichaDaBola>([[3, { id: 3, estilo: 'listrada' }], [7, { id: 7, estilo: 'listrada' }]]),
        destino: (b) => extra.destinos?.[b] ?? { x: 0, z: 0 },
        existiaAntes: (b) => extra.existiam?.includes(b) ?? true,
        aoFim: () => void fins++,
      },
      0,
    );
  return { t, bolas, chamadas, comecar, fins: () => fins };
}

const aviso = null;
const planoDoAnel = (): PlanoDaTransicao => ({ aviso, fases: [{ tipo: 'anel', inicioS: 0, duracaoS: 1.5, bolas: [3] }], duracaoS: 1.5 });
const planoDoVoo = (origem: 'mesa' | 'cacapa' = 'mesa'): PlanoDaTransicao => ({
  aviso,
  fases: [{ tipo: 'voo', inicioS: 0, duracaoS: 1, itens: [{ bola: 3, paraJogador: 1, origem }] }],
  duracaoS: 1,
});
const planoDoDeslize = (): PlanoDaTransicao => ({
  aviso,
  fases: [{ tipo: 'deslize', inicioS: 0, duracaoS: 1, itens: [{ bola: 0, lugar: 'marca-saida' }] }],
  duracaoS: 1,
});

describe('TransicaoDaTacada: o ciclo', () => {
  it('fica ativa até o fim do plano e então avisa uma vez só', () => {
    const { t, comecar, fins } = montar();
    expect(t.ativa).toBe(false);
    comecar(planoDoAnel());
    expect(t.ativa).toBe(true);
    t.atualizar(700);
    expect(t.ativa).toBe(true);
    expect(fins()).toBe(0);
    t.atualizar(1500);
    expect(t.ativa).toBe(false);
    expect(fins()).toBe(1);
    t.atualizar(3000);
    expect(fins()).toBe(1);
  });

  it('plano sem duração (encurtado a zero) termina no primeiro quadro', () => {
    const { t, comecar, fins } = montar();
    comecar({ aviso, fases: [], duracaoS: 0 });
    t.atualizar(0);
    expect(t.ativa).toBe(false);
    expect(fins()).toBe(1);
  });

  it('pular termina na hora, uma vez, e esconde tudo; pular de novo não faz nada', () => {
    const { t, comecar, fins, chamadas } = montar();
    comecar(planoDoVoo());
    t.atualizar(500);
    t.pular();
    expect(t.ativa).toBe(false);
    expect(fins()).toBe(1);
    expect(chamadas.aneisEscondidos).toBeGreaterThan(0);
    expect(chamadas.voosEscondidos).toContain(0);
    t.pular();
    expect(fins()).toBe(1);
  });

  it('cancelar (retrato da sala, partida nova) apaga tudo sem avisar o fim', () => {
    const { t, comecar, fins, chamadas } = montar();
    comecar(planoDoAnel());
    t.atualizar(300);
    t.cancelar();
    expect(t.ativa).toBe(false);
    expect(fins()).toBe(0);
    expect(chamadas.aneisEscondidos).toBeGreaterThan(0);
    t.atualizar(5000);
    expect(fins()).toBe(0);
  });

  it('começar outra transição cancela a anterior sem avisar o fim dela e apaga o que ela deixou na tela', () => {
    const { t, bolas, comecar, fins, chamadas } = montar();
    bolas[3] = bola(0.4, 0.1);
    comecar(planoDoVoo());
    const escondidosAntes = chamadas.aneisEscondidos;
    comecar(planoDoDeslize());
    expect(chamadas.aneisEscondidos).toBeGreaterThan(escondidosAntes);
    expect(chamadas.voosEscondidos).toContain(0);
    t.atualizar(1000);
    expect(fins()).toBe(1);
  });

  it('a velocidade de reprodução estica ou encolhe o tempo (para capturas em câmera lenta)', () => {
    const { t, comecar, fins } = montar();
    t.velocidade = 0.5;
    comecar(planoDoAnel());
    t.atualizar(1500);
    expect(t.ativa).toBe(true);
    t.atualizar(3000);
    expect(fins()).toBe(1);
    expect(() => (t.velocidade = 0)).toThrow(RangeError);
  });

  it('atualizar sem transição não faz nada', () => {
    const { t, chamadas } = montar();
    t.atualizar(100);
    expect(chamadas.aneis).toEqual([]);
  });
});

describe('TransicaoDaTacada: as fases uma depois da outra', () => {
  const doisTempos = (): PlanoDaTransicao => ({
    aviso,
    fases: [
      { tipo: 'anel', inicioS: 0, duracaoS: 1, bolas: [3] },
      { tipo: 'voo', inicioS: 1, duracaoS: 1, itens: [{ bola: 7, paraJogador: 1, origem: 'cacapa' }] },
    ],
    duracaoS: 2,
  });

  it('o anel só aparece na sua fase: acabou, é escondido e não volta a ser pedido', () => {
    const { t, bolas, comecar, chamadas } = montar();
    bolas[3] = bola(0.4, 0.1);
    bolas[7] = bola(0.1, 0.1, false);
    comecar(doisTempos());
    t.atualizar(900);
    const pedidos = chamadas.aneis.length;
    const escondidos = chamadas.aneisEscondidos;
    t.atualizar(1500);
    expect(chamadas.aneis).toHaveLength(pedidos);
    expect(chamadas.aneisEscondidos).toBeGreaterThan(escondidos);
  });

  it('o voo só começa na sua fase: antes dela nenhuma ficha de tela', () => {
    const { t, bolas, comecar, chamadas } = montar();
    bolas[3] = bola(0.4, 0.1);
    bolas[7] = bola(0.1, 0.1, false);
    comecar(doisTempos());
    t.atualizar(500);
    expect(chamadas.voos).toEqual([]);
    t.atualizar(1500);
    expect(chamadas.voos.length).toBeGreaterThan(0);
  });

  it('ao chegar, a ficha de tela some na hora (antes de a transição acabar) e a do placar acende', () => {
    const { t, bolas, comecar, chamadas } = montar();
    bolas[3] = bola(0.4, 0.1);
    bolas[7] = bola(0.1, 0.1, false);
    comecar({
      aviso,
      fases: [
        { tipo: 'voo', inicioS: 0, duracaoS: 1, itens: [{ bola: 7, paraJogador: 1, origem: 'cacapa' }] },
        { tipo: 'deslize', inicioS: 1, duracaoS: 1, itens: [{ bola: 3, lugar: 'marca-saida' }] },
      ],
      duracaoS: 2,
    });
    t.atualizar(900);
    expect(chamadas.voosEscondidos).toEqual([]);
    t.atualizar(1200);
    expect(t.ativa).toBe(true);
    expect(chamadas.voosEscondidos).toContain(0);
    expect(chamadas.acesas).toEqual([{ bola: 7, jogador: 1 }]);
  });
});

describe('TransicaoDaTacada: o anel vermelho na bola paga', () => {
  it('durante a fase o anel está na bola, pulsando e já aceso; fora dela é escondido', () => {
    const { t, bolas, comecar, chamadas } = montar();
    bolas[3] = bola(0.4, 0.1);
    comecar(planoDoAnel());
    t.atualizar(750);
    const ultimo = chamadas.aneis.at(-1)!;
    expect(ultimo.ids).toEqual([3]);
    expect(ultimo.intensidade).toBeGreaterThan(0.5);
    expect(ultimo.escala).toBeGreaterThan(1 - CFG.pulsoEscala - 1e-9);
    expect(ultimo.escala).toBeLessThan(1 + CFG.pulsoEscala + 1e-9);
  });

  it('o pulso varia: a escala não é a mesma o tempo todo', () => {
    const { t, bolas, comecar, chamadas } = montar();
    bolas[3] = bola(0.4, 0.1);
    comecar(planoDoAnel());
    for (let ms = 100; ms < 1400; ms += 50) t.atualizar(ms);
    const escalas = chamadas.aneis.map((a) => a.escala);
    expect(Math.min(...escalas)).toBeLessThan(0.95);
    expect(Math.max(...escalas)).toBeGreaterThan(1.05);
  });

  it('o anel nasce suave (intensidade sobe do 0) e some no fim da fase', () => {
    const { t, bolas, comecar, chamadas } = montar();
    bolas[3] = bola(0.4, 0.1);
    comecar(planoDoAnel());
    t.atualizar(10);
    expect(chamadas.aneis.at(-1)!.intensidade).toBeLessThan(0.3);
    t.atualizar(1500);
    expect(chamadas.aneisEscondidos).toBeGreaterThan(0);
  });
});

describe('TransicaoDaTacada: a bola paga sobe e voa até a ficha de quem recebeu', () => {
  it('sobe antes de voar e depois some da mesa, passando o voo para a ficha de tela', () => {
    const { t, bolas, comecar, chamadas } = montar();
    bolas[3] = bola(0.4, 0.1);
    comecar(planoDoVoo());
    t.atualizar(150); // 15%: ainda na subida
    expect(bolas[3]!.position.y).toBeGreaterThan(R);
    expect(bolas[3]!.visible).toBe(true);
    expect(chamadas.voos).toEqual([]);
    t.atualizar(600);
    expect(bolas[3]!.visible).toBe(false);
    expect(chamadas.voos.length).toBeGreaterThan(0);
    expect(chamadas.voos.at(-1)!.ficha).toEqual({ id: 3, estilo: 'listrada' });
  });

  it('a ficha de tela vai do ponto onde a bola estava até o centro da ficha do placar, e encolhe até o tamanho dela', () => {
    const { t, bolas, comecar, chamadas } = montar({ chip: { x: 100, y: 60, tamanho: 20 } });
    bolas[3] = bola(0.4, 0.1);
    comecar(planoDoVoo());
    t.atualizar(310);
    const inicio = chamadas.voos[0]!;
    expect(inicio.x).toBeCloseTo(440, -1); // projetar: 400 + x·100
    t.atualizar(990);
    const perto = chamadas.voos.at(-1)!;
    expect(Math.abs(perto.x - 100)).toBeLessThan(Math.abs(inicio.x - 100));
    expect(perto.escala).toBeLessThan(inicio.escala);
    expect(perto.escala).toBeGreaterThanOrEqual(1);
  });

  it('faz um arco: no meio do voo a ficha passa acima da reta entre a saída e a chegada', () => {
    const { t, bolas, comecar, chamadas } = montar({ chip: { x: 440, y: 300, tamanho: 20 } });
    bolas[3] = bola(0.4, 0.1);
    comecar(planoDoVoo());
    t.atualizar(650);
    expect(chamadas.voos.at(-1)!.y).toBeLessThan(300);
  });

  it('ao chegar esconde a ficha de tela e acende a do placar, uma vez só', () => {
    const { t, bolas, comecar, chamadas } = montar();
    bolas[3] = bola(0.4, 0.1);
    comecar(planoDoVoo());
    t.atualizar(900);
    expect(chamadas.acesas).toEqual([]);
    t.atualizar(1000);
    expect(chamadas.acesas).toEqual([{ bola: 3, jogador: 1 }]);
    expect(chamadas.voosEscondidos).toContain(0);
    t.atualizar(1500);
    expect(chamadas.acesas).toHaveLength(1);
  });

  it('bola que já caiu na caçapa (do adversário) voa do buraco, sem subir, desde o começo', () => {
    const { t, bolas, comecar, chamadas } = montar();
    bolas[3] = bola(0.4, 0.1, false);
    comecar(planoDoVoo('cacapa'));
    t.atualizar(100);
    expect(chamadas.voos.length).toBeGreaterThan(0);
    expect(bolas[3]!.visible).toBe(false);
    expect(bolas[3]!.position.y).toBe(R);
  });

  it('sem ficha no placar (ou fora da tela) a bola some sem voo de tela e a transição segue', () => {
    const { t, bolas, comecar, chamadas, fins } = montar({ chip: null });
    bolas[3] = bola(0.4, 0.1);
    comecar(planoDoVoo());
    t.atualizar(600);
    expect(bolas[3]!.visible).toBe(false);
    expect(chamadas.voos).toEqual([]);
    t.atualizar(1000);
    expect(fins()).toBe(1);
  });

  it('bola atrás da câmera (sem projeção) também não trava', () => {
    const { t, bolas, comecar, chamadas, fins } = montar({ projetavel: false });
    bolas[3] = bola(0.4, 0.1);
    comecar(planoDoVoo());
    t.atualizar(1000);
    expect(chamadas.voos).toEqual([]);
    expect(fins()).toBe(1);
  });
});

describe('TransicaoDaTacada: recolocação deslizando', () => {
  it('a bola que caiu reaparece e desliza da caçapa até o lugar, chegando exata e apoiada no pano', () => {
    const { t, bolas, comecar } = montar();
    bolas[0] = bola(1.0, 0.5, false);
    bolas[0]!.position.y = 0;
    comecar(planoDoDeslize(), { destinos: { 0: { x: -0.5, z: 0 } }, existiam: [0] });
    t.atualizar(500);
    expect(bolas[0]!.visible).toBe(true);
    expect(bolas[0]!.position.x).toBeLessThan(1.0);
    expect(bolas[0]!.position.x).toBeGreaterThan(-0.5);
    expect(bolas[0]!.position.y).toBeCloseTo(R, 6);
    t.atualizar(1000);
    expect(bolas[0]!.position.x).toBeCloseTo(-0.5, 6);
    expect(bolas[0]!.position.z).toBeCloseTo(0, 6);
    expect(bolas[0]!.escalaAtual).toBe(1);
  });

  it('o deslize tem partida e chegada suaves (devagar nas pontas, rápido no meio)', () => {
    const { t, bolas, comecar } = montar();
    bolas[0] = bola(1.0, 0, false);
    comecar(planoDoDeslize(), { destinos: { 0: { x: 0, z: 0 } }, existiam: [0] });
    t.atualizar(100);
    const andou10 = 1.0 - bolas[0]!.position.x;
    t.atualizar(500);
    const andou50 = 1.0 - bolas[0]!.position.x;
    t.atualizar(900);
    const faltam10 = bolas[0]!.position.x;
    expect(andou10).toBeLessThan(0.05);
    expect(andou50).toBeCloseTo(0.5, 2);
    expect(faltam10).toBeLessThan(0.05);
  });

  it('a bola que não estava na mesa antes (a bola final que entra depois da saída) nasce no lugar, crescendo', () => {
    const { t, bolas, comecar } = montar();
    bolas[8] = bola(0, 0, false);
    comecar(
      { aviso, fases: [{ tipo: 'deslize', inicioS: 0, duracaoS: 1, itens: [{ bola: 8, lugar: 'marca-pe' }] }], duracaoS: 1 },
      { destinos: { 8: { x: 0.9, z: 0.2 } }, existiam: [] },
    );
    t.atualizar(100);
    expect(bolas[8]!.visible).toBe(true);
    expect(bolas[8]!.position.x).toBeCloseTo(0.9, 6);
    expect(bolas[8]!.escalaAtual).toBeLessThan(1);
    t.atualizar(1000);
    expect(bolas[8]!.escalaAtual).toBe(1);
  });

  it('o deslize só começa na vez dele: antes disso a bola fica quieta onde estava', () => {
    const { t, bolas, comecar } = montar();
    bolas[3] = bola(0.4, 0.1);
    bolas[0] = bola(1.0, 0.5, false);
    comecar(
      {
        aviso,
        fases: [
          { tipo: 'anel', inicioS: 0, duracaoS: 1, bolas: [3] },
          { tipo: 'deslize', inicioS: 1, duracaoS: 1, itens: [{ bola: 0, lugar: 'marca-saida' }] },
        ],
        duracaoS: 2,
      },
      { destinos: { 0: { x: -0.5, z: 0 } }, existiam: [0] },
    );
    t.atualizar(500);
    expect(bolas[0]!.visible).toBe(false);
    expect(bolas[0]!.position.x).toBe(1.0);
    t.atualizar(1500);
    expect(bolas[0]!.visible).toBe(true);
  });
});
