import { describe, expect, it } from 'vitest';
import type { EventoTacada, Gravacao } from '@sinuca/fisica';
import { PlayerGravacao, type AlvoBola } from './player';

function criarAlvo() {
  const alvo = {
    pos: [0, 0, 0],
    rot: [0, 0, 0, 1],
    escala: 1,
    visible: true,
    scale: {
      setScalar(valor: number) {
        alvo.escala = valor;
      },
    },
    position: {
      set(x: number, y: number, z: number) {
        alvo.pos = [x, y, z];
      },
    },
    quaternion: {
      set(x: number, y: number, z: number, w: number) {
        alvo.rot = [x, y, z, w];
      },
    },
  };
  return alvo;
}

const EVENTOS: EventoTacada[] = [
  { tipo: 'taco-bola', t: 0, bola: 0, velocidade: 3, miscue: false },
  { tipo: 'bola-bola', t: 0.2, a: 0, b: 3, velocidade: 1 },
  { tipo: 'parou', t: 0.5 },
];

/**
 * 10 quadros/s, 6 quadros (0,5 s). A bola 0 anda 0,1 m em +X por quadro e gira
 * 90° em torno de Z por quadro; a bola 3 fica parada e cai (naMesa = 0) no quadro 3.
 */
function gravacaoDeExemplo(): Gravacao {
  const frequencia = 10;
  const quadros = 6;
  const ids = [0, 3];
  const posicoes = new Float32Array(quadros * 2 * 3);
  const orientacoes = new Float32Array(quadros * 2 * 4);
  const naMesa = new Uint8Array(quadros * 2).fill(1);
  for (let q = 0; q < quadros; q++) {
    posicoes.set([0.1 * q, 0.027, 0], (q * 2 + 0) * 3);
    const meio = (q * (Math.PI / 2)) / 2;
    orientacoes.set([0, 0, Math.sin(meio), Math.cos(meio)], (q * 2 + 0) * 4);
    posicoes.set([1, 0.027, 0.5], (q * 2 + 1) * 3);
    orientacoes.set([0, 0, 0, 1], (q * 2 + 1) * 4);
    if (q >= 3) naMesa[q * 2 + 1] = 0;
  }
  return { frequencia, ids, quadros, duracao: 0.5, posicoes, orientacoes, naMesa, eventos: EVENTOS };
}

function montar(ouvintes: ConstructorParameters<typeof PlayerGravacao>[1] = {}, opcoes: ConstructorParameters<typeof PlayerGravacao>[2] = {}) {
  const bolao = criarAlvo();
  const bola3 = criarAlvo();
  const alvos = new Map<number, AlvoBola>([
    [0, bolao],
    [3, bola3],
  ]);
  const player = new PlayerGravacao(alvos, ouvintes, opcoes);
  return { player, bolao, bola3 };
}

describe('PlayerGravacao', () => {
  it('interpola a posição entre duas amostras pelo relógio real', () => {
    const { player, bolao } = montar();
    player.tocar(gravacaoDeExemplo());
    player.atualizar(1000);
    expect(bolao.pos[0]).toBeCloseTo(0, 6);
    player.atualizar(1050);
    expect(bolao.pos[0]).toBeCloseTo(0.05, 6);
    expect(bolao.pos[1]).toBeCloseTo(0.027, 6);
    player.atualizar(1130);
    expect(bolao.pos[0]).toBeCloseTo(0.13, 6);
  });

  it('interpola a orientação por slerp (45° no meio de 0° a 90°)', () => {
    const { player, bolao } = montar();
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    player.atualizar(50);
    const meio = Math.PI / 8;
    expect(bolao.rot[0]).toBeCloseTo(0, 6);
    expect(bolao.rot[2]).toBeCloseTo(Math.sin(meio), 5);
    expect(bolao.rot[3]).toBeCloseTo(Math.cos(meio), 5);
  });

  it('o slerp é esférico (22,5° a 25% de 0° a 90°), não uma média linear', () => {
    const { player, bolao } = montar();
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    player.atualizar(25);
    const quarto = Math.PI / 16;
    expect(bolao.rot[2]).toBeCloseTo(Math.sin(quarto), 5);
    expect(bolao.rot[3]).toBeCloseTo(Math.cos(quarto), 5);
  });

  it('interpola pelo caminho curto quando o quaternion vem com o sinal trocado', () => {
    const gravacao = gravacaoDeExemplo();
    const orientacoes = new Float32Array(gravacao.orientacoes);
    const meio = Math.PI / 4;
    orientacoes.set([0, 0, -Math.sin(meio), -Math.cos(meio)], (1 * 2 + 0) * 4);
    const { player, bolao } = montar();
    player.tocar({ ...gravacao, orientacoes });
    player.atualizar(0);
    player.atualizar(50);
    const esperado = Math.PI / 8;
    const [x, y, z, w] = bolao.rot as [number, number, number, number];
    const alinhamento = Math.abs(z * Math.sin(esperado) + w * Math.cos(esperado));
    expect(alinhamento).toBeCloseTo(1, 5);
    expect(Math.hypot(x, y, z, w)).toBeCloseTo(1, 5);
  });

  it('esconde a bola a partir do quadro em que naMesa vira 0', () => {
    const { player, bola3 } = montar();
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    player.atualizar(290);
    expect(bola3.visible).toBe(true);
    player.atualizar(310);
    expect(bola3.visible).toBe(false);
  });

  it('com duracaoQuedaS, a bola encaçapada afunda e encolhe antes de sumir', () => {
    const { player, bola3 } = montar({}, { duracaoQuedaS: 0.2 });
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    player.atualizar(290);
    expect(bola3.visible).toBe(true);
    expect(bola3.escala).toBe(1);
    expect(bola3.pos[1]).toBeCloseTo(0.027, 6);
    // Caiu no quadro 3 (0,3 s): 0,1 s depois, metade da queda.
    player.atualizar(400);
    expect(bola3.visible).toBe(true);
    expect(bola3.escala).toBeCloseTo(0.5, 5);
    expect(bola3.pos[1]).toBeCloseTo(0.0135, 6);
    expect(bola3.pos[0]).toBeCloseTo(1, 6);
    player.atualizar(510);
    expect(bola3.visible).toBe(false);
  });

  it('a bola que cai no último quadro ainda afunda por duracaoQuedaS antes de o fim ser avisado', () => {
    const fins: string[] = [];
    const { player, bola3 } = montar({ aoFim: () => fins.push('fim') }, { duracaoQuedaS: 0.2 });
    const gravacao = gravacaoDeExemplo();
    gravacao.naMesa.fill(1);
    gravacao.naMesa[5 * 2 + 1] = 0;
    // Como na física: a gravação acaba no último evento, um pouco antes do quadro em que a bola já está fora.
    const gravacaoCurta = { ...gravacao, duracao: 0.46 };
    player.tocar(gravacaoCurta);
    player.atualizar(0);
    // O último quadro (0,5 s) é o da queda: 0,1 s depois, metade da queda, e a gravação ainda não acabou.
    player.atualizar(600);
    expect(fins).toEqual([]);
    expect(player.tocando).toBe(true);
    expect(bola3.visible).toBe(true);
    expect(bola3.escala).toBeCloseTo(0.5, 5);
    player.atualizar(710);
    expect(fins).toEqual(['fim']);
    expect(bola3.visible).toBe(false);
  });

  it('sem duracaoQuedaS a bola some no quadro da queda, sem encolher', () => {
    const { player, bola3 } = montar();
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    player.atualizar(310);
    expect(bola3.visible).toBe(false);
    expect(bola3.escala).toBe(0);
  });

  it('a queda só mexe na bola que caiu', () => {
    const { player, bolao } = montar({}, { duracaoQuedaS: 0.2 });
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    player.atualizar(400);
    expect(bolao.escala).toBe(1);
    expect(bolao.visible).toBe(true);
  });

  it('dispara cada evento uma vez, em ordem, no instante t', () => {
    const vistos: string[] = [];
    const { player } = montar({ aoEvento: (e) => vistos.push(e.tipo) });
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    expect(vistos).toEqual(['taco-bola']);
    player.atualizar(190);
    expect(vistos).toEqual(['taco-bola']);
    player.atualizar(210);
    expect(vistos).toEqual(['taco-bola', 'bola-bola']);
    player.atualizar(220);
    expect(vistos).toEqual(['taco-bola', 'bola-bola']);
  });

  it('avisa o fim uma vez, depois do último evento, e deixa o último quadro', () => {
    const ordem: string[] = [];
    const { player, bolao } = montar({
      aoEvento: (e) => ordem.push(e.tipo),
      aoFim: () => ordem.push('fim'),
    });
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    expect(player.tocando).toBe(true);
    player.atualizar(10_000);
    expect(ordem).toEqual(['taco-bola', 'bola-bola', 'parou', 'fim']);
    expect(player.tocando).toBe(false);
    expect(bolao.pos[0]).toBeCloseTo(0.5, 6);
    player.atualizar(11_000);
    expect(ordem.filter((o) => o === 'fim')).toHaveLength(1);
  });

  it('respeita a velocidade de reprodução', () => {
    const { player, bolao } = montar();
    player.velocidade = 2;
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    player.atualizar(100);
    expect(bolao.pos[0]).toBeCloseTo(0.2, 6);
    player.velocidade = 0.5;
    player.atualizar(200);
    expect(bolao.pos[0]).toBeCloseTo(0.25, 6);
  });

  it('recusa velocidade não positiva', () => {
    const { player } = montar();
    expect(() => {
      player.velocidade = 0;
    }).toThrow(RangeError);
  });

  it('tocar de novo recomeça no primeiro quadro', () => {
    const { player, bolao } = montar();
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    player.atualizar(300);
    expect(bolao.pos[0]).toBeCloseTo(0.3, 6);
    player.tocar(gravacaoDeExemplo());
    player.atualizar(5000);
    expect(bolao.pos[0]).toBeCloseTo(0, 6);
  });

  it('ignora ids da gravação sem alvo na cena', () => {
    const bolao = criarAlvo();
    const player = new PlayerGravacao(new Map<number, AlvoBola>([[0, bolao]]));
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    player.atualizar(100);
    expect(bolao.pos[0]).toBeCloseTo(0.1, 6);
  });
  it('parar larga a gravação sem avisar o fim nem tocar o que faltava (a partida foi trocada pela da sala)', () => {
    let fins = 0;
    const eventos: EventoTacada[] = [];
    const { player, bolao } = montar({ aoFim: () => fins++, aoEvento: (e) => eventos.push(e) });
    player.tocar(gravacaoDeExemplo());
    player.atualizar(0);
    player.atualizar(100);
    const posicao = [...bolao.pos];
    player.parar();
    expect(player.tocando).toBe(false);
    player.atualizar(5000);
    expect(fins).toBe(0);
    expect(bolao.pos).toEqual(posicao);
    expect(eventos.map((e) => e.tipo)).toEqual(['taco-bola']);
    // Dá para tocar outra depois.
    player.tocar(gravacaoDeExemplo());
    expect(player.tocando).toBe(true);
  });
});
