import { CONFIG_FISICA_PADRAO, ID_BOLAO, bolaParada, criarRng, mesaInicial, medidasDaBola, type EstadoMesa } from '@sinuca/fisica';
import { PRESET_TREINO, novaPartida } from '@sinuca/regras';
import { describe, expect, it } from 'vitest';
import { FOLGA_DE_ENCOSTO, bolaSobOPonto, brancaNaMesa, cabeNoPonto, devolverBola, moverBola, numeradasFora, numeradasNaMesa, pontoMaisPertoQueCabe, tirarBola } from './mesa-de-treino';

const cfg = CONFIG_FISICA_PADRAO;
const raio = cfg.bola.raio;

function mesaDoTriangulo(): { mesa: EstadoMesa; casa: number[] } {
  const { partida, arrumacao } = novaPartida(PRESET_TREINO.regras, [{ id: 'j1', nome: 'Treino', equipe: 0 }], criarRng(3));
  return { mesa: mesaInicial(arrumacao, cfg, criarRng(3)), casa: [...partida.naMesa] };
}

const soDuas = (): EstadoMesa => ({ bolas: [bolaParada(ID_BOLAO, { x: -0.5, z: 0 }, cfg), bolaParada(1, { x: 0.2, z: 0.1 }, cfg)] });

describe('cabeNoPonto', () => {
  it('cabe no pano livre e não cabe em cima de outra bola', () => {
    const mesa = soDuas();
    expect(cabeNoPonto(mesa, ID_BOLAO, { x: -0.2, z: -0.3 })).toBe(true);
    expect(cabeNoPonto(mesa, ID_BOLAO, { x: 0.2, z: 0.1 })).toBe(false);
  });

  it('encostada em outra bola não vale: sobra a folga', () => {
    const mesa = soDuas();
    const colada = { x: 0.2 + raio + cfg.bolao.raio, z: 0.1 };
    expect(cabeNoPonto(mesa, ID_BOLAO, colada)).toBe(false);
    expect(cabeNoPonto(mesa, ID_BOLAO, { x: colada.x + 2 * FOLGA_DE_ENCOSTO, z: 0.1 })).toBe(true);
  });

  it('fora da mesa, na tabela e na boca de uma caçapa não cabe', () => {
    const mesa = soDuas();
    expect(cabeNoPonto(mesa, ID_BOLAO, { x: 2, z: 0 })).toBe(false);
    expect(cabeNoPonto(mesa, ID_BOLAO, { x: cfg.mesa.comprimento / 2, z: 0.1 })).toBe(false);
    expect(cabeNoPonto(mesa, ID_BOLAO, { x: cfg.mesa.comprimento / 2 - 0.01, z: cfg.mesa.largura / 2 - 0.01 })).toBe(false);
  });

  it('a própria bola não conta contra si: o ponto onde ela já está cabe', () => {
    const mesa = soDuas();
    expect(cabeNoPonto(mesa, ID_BOLAO, { x: -0.5, z: 0 })).toBe(true);
  });

  it('bola que saiu da mesa não atrapalha', () => {
    const mesa = tirarBola(soDuas(), 1);
    expect(cabeNoPonto(mesa, ID_BOLAO, { x: 0.2, z: 0.1 })).toBe(true);
  });
});

describe('pontoMaisPertoQueCabe', () => {
  it('o próprio alvo se cabe; o ponto livre mais perto se não', () => {
    const mesa = soDuas();
    expect(pontoMaisPertoQueCabe(mesa, ID_BOLAO, { x: 0, z: 0 })).toEqual({ x: 0, z: 0 });
    const p = pontoMaisPertoQueCabe(mesa, ID_BOLAO, { x: 0.2, z: 0.1 });
    expect(cabeNoPonto(mesa, ID_BOLAO, p)).toBe(true);
    expect(Math.hypot(p.x - 0.2, p.z - 0.1)).toBeLessThan(raio + cfg.bolao.raio + 0.01);
  });
});

describe('mover, tirar e devolver', () => {
  it('mover põe a bola parada onde se pediu', () => {
    const mesa = moverBola(soDuas(), 1, { x: 0.6, z: -0.2 });
    const b = mesa.bolas.find((x) => x.id === 1)!;
    expect(b.posicao).toEqual({ x: 0.6, y: raio, z: -0.2 });
    expect(b.movimento).toBe('parada');
  });

  it('mover cria a bola que a mesa ainda não tem', () => {
    const mesa = moverBola({ bolas: [bolaParada(ID_BOLAO, { x: 0, z: 0 }, cfg)] }, 4, { x: 0.3, z: 0.3 });
    expect(mesa.bolas.map((b) => b.id)).toEqual([ID_BOLAO, 4]);
  });

  it('tirar leva a bola para fora da mesa; tirar de novo, ou o que não existe, não muda nada', () => {
    const mesa = tirarBola(soDuas(), 1);
    expect(mesa.bolas.find((b) => b.id === 1)!.naMesa).toBe(false);
    expect(tirarBola(mesa, 1)).toBe(mesa);
    expect(tirarBola(mesa, 9)).toBe(mesa);
  });

  it('devolver põe a bola no ponto livre mais perto do alvo e não mexe em bola que já está na mesa', () => {
    const sem = tirarBola(soDuas(), 1);
    const de = devolverBola(sem, 1, { x: -0.5, z: 0 });
    const b = de.bolas.find((x) => x.id === 1)!;
    expect(b.naMesa).toBe(true);
    expect(cabeNoPonto(sem, ID_BOLAO, { x: -0.5, z: 0 })).toBe(true);
    expect(Math.hypot(b.posicao.x - -0.5, b.posicao.z)).toBeGreaterThan(raio + cfg.bolao.raio - 1e-6);
    expect(devolverBola(de, 1, { x: 0, z: 0 })).toBe(de);
  });
});

describe('bolaSobOPonto', () => {
  it('acha a bola cujo corpo (mais a tolerância) cobre o ponto', () => {
    const mesa = soDuas();
    expect(bolaSobOPonto(mesa, { x: 0.2 + raio - 0.002, z: 0.1 }, 0)).toBe(1);
    expect(bolaSobOPonto(mesa, { x: 0.2 + raio + 0.005, z: 0.1 }, 0)).toBeNull();
    expect(bolaSobOPonto(mesa, { x: 0.2 + raio + 0.005, z: 0.1 }, 0.01)).toBe(1);
    expect(bolaSobOPonto(mesa, { x: -0.5, z: 0 }, 0)).toBe(ID_BOLAO);
  });

  it('ignora bola fora da mesa', () => {
    expect(bolaSobOPonto(tirarBola(soDuas(), 1), { x: 0.2, z: 0.1 }, 0.01)).toBeNull();
  });
});

describe('listas', () => {
  it('numeradas na mesa e fora dela, em ordem, sem o bolão', () => {
    const { mesa, casa } = mesaDoTriangulo();
    expect(numeradasNaMesa(mesa)).toEqual(casa.slice().sort((a, b) => a - b));
    expect(numeradasFora(mesa, casa)).toEqual([]);
    const menos = tirarBola(tirarBola(mesa, 9), 3);
    expect(numeradasFora(menos, casa)).toEqual([3, 9]);
    expect(numeradasNaMesa(menos)).not.toContain(9);
    expect(brancaNaMesa(menos)).toBe(true);
    expect(medidasDaBola(ID_BOLAO, cfg).raio).toBeGreaterThan(0);
  });
});
