import { describe, expect, it } from 'vitest';
import { ID_BOLAO, bolaParada, type EstadoMesa, type IdBola } from '@sinuca/fisica';
import { bolasAlvo } from '@sinuca/regras';
import { CASA_1, CASA_MATA_MATA, CASA_SEM_FINAL, DUPLAS_DE_TESTE, TRIO_DE_TESTE, TRIO_POR_SI, partidaDeTeste } from '../jogo/para-testes';
import { SEM_SINAL, VigiaDaMira, sinalDaBola } from './sinal-da-mira';

/** Ana é dos pares e Beto dos ímpares; sobram pares 2, 4, ímpares 3, 7, 9 e a 8. */
const comGrupos = partidaDeTeste({ fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3, 4, 7, 8, 9] });

describe('sinalDaBola: a primeira bola da linha vale para quem tem a vez?', () => {
  it('sem bola na linha, nada', () => {
    expect(sinalDaBola(comGrupos, null)).toBe(SEM_SINAL);
  });

  it('bola do próprio grupo: certa, sem texto', () => {
    expect(sinalDaBola(comGrupos, 4)).toEqual({ tipo: 'certa', bola: 4, texto: '' });
  });

  it('bola do grupo do adversário: errada, e o texto diz qual bola e de quem', () => {
    expect(sinalDaBola(comGrupos, 7)).toEqual({ tipo: 'errada', bola: 7, texto: 'Bola errada: a 7 é do adversário' });
  });

  it('a bola final antes da hora: "Ainda não é a 8" (o nome vem das regras)', () => {
    expect(sinalDaBola(comGrupos, 8)).toEqual({ tipo: 'errada', bola: 8, texto: 'Ainda não é a 8' });
  });

  it('na casa antiga a bola final é a 1 e o texto a chama de "o castigo"', () => {
    const casa1 = partidaDeTeste({ config: CASA_1, fase: 'grupos', grupos: ['par', 'impar'], naMesa: [1, 2, 3, 4, 5] });
    expect(sinalDaBola(casa1, 1).texto).toBe('Ainda não é o castigo');
    expect(sinalDaBola(casa1, 3).texto).toBe('Bola errada: a 3 é do adversário');
  });

  it('na hora da bola final só ela vale: qualquer outra é do adversário', () => {
    const noCastigo = partidaDeTeste({ fase: 'castigo', grupos: ['par', 'impar'], naMesa: [3, 5, 8] });
    expect(sinalDaBola(noCastigo, 8).tipo).toBe('certa');
    expect(sinalDaBola(noCastigo, 5)).toEqual({ tipo: 'errada', bola: 5, texto: 'Bola errada: a 5 é do adversário' });
  });

  it('mesa aberta: qualquer numerada vale, menos a bola final (que ainda não é a hora)', () => {
    const aberta = partidaDeTeste({ fase: 'aberta' });
    expect(sinalDaBola(aberta, 5).tipo).toBe('certa');
    expect(sinalDaBola(aberta, 14).tipo).toBe('certa');
    expect(sinalDaBola(aberta, 8).texto).toBe('Ainda não é a 8');
  });

  it('na saída qualquer bola do triângulo vale', () => {
    expect(sinalDaBola(partidaDeTeste(), 2).tipo).toBe('certa');
  });

  it('sem bola final na casa, a bola do outro grupo é só "do adversário"', () => {
    const semFinal = partidaDeTeste({ config: CASA_SEM_FINAL, fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3, 4, 5] });
    expect(sinalDaBola(semFinal, 5).texto).toBe('Bola errada: a 5 é do adversário');
    expect(sinalDaBola(semFinal, 4).tipo).toBe('certa');
  });

  it('quem vale é o jogador da vez: com a vez do Beto o que era errado fica certo', () => {
    const naVezDoBeto = { ...comGrupos, vez: 1 };
    expect(sinalDaBola(naVezDoBeto, 7).tipo).toBe('certa');
    expect(sinalDaBola(naVezDoBeto, 4).texto).toBe('Bola errada: a 4 é do adversário');
  });

  it('nas duplas vale o grupo da equipe de quem joga, não só do jogador', () => {
    const duplas = partidaDeTeste({ jogadores: DUPLAS_DE_TESTE, fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3, 4, 7, 8, 9], vez: 2 });
    expect(sinalDaBola(duplas, 4).tipo).toBe('certa');
    expect(sinalDaBola(duplas, 7).tipo).toBe('errada');
  });

  it('no 2x1 vale o grupo da equipe de quem joga: o parceiro (Caio) e o sozinho (Beto) leem bolas diferentes', () => {
    const trio = (vez: number) => partidaDeTeste({ jogadores: TRIO_DE_TESTE, fase: 'grupos', grupos: ['par', 'impar'], naMesa: [2, 3, 4, 7, 8, 9], vez });
    expect(sinalDaBola(trio(2), 4).tipo).toBe('certa');
    expect(sinalDaBola(trio(2), 7).texto).toBe('Bola errada: a 7 é do adversário');
    expect(sinalDaBola(trio(1), 7).tipo).toBe('certa');
    expect(sinalDaBola(trio(1), 4).tipo).toBe('errada');
    for (const vez of [0, 1, 2]) {
      for (const bola of trio(vez).naMesa) expect(sinalDaBola(trio(vez), bola).tipo === 'certa').toBe(bolasAlvo(trio(vez)).includes(bola));
    }
  });

  it('um jogador explícito sobrepõe a vez', () => {
    expect(sinalDaBola(comGrupos, 7, 1).tipo).toBe('certa');
  });

  it('concorda com bolasAlvo das regras em todas as bolas da mesa, em todas as fases', () => {
    const estados = [
      partidaDeTeste(),
      partidaDeTeste({ fase: 'aberta' }),
      comGrupos,
      { ...comGrupos, vez: 1 },
      partidaDeTeste({ fase: 'castigo', grupos: ['par', 'impar'], naMesa: [3, 5, 8] }),
      partidaDeTeste({ config: CASA_1, fase: 'aberta' }),
      partidaDeTeste({ config: CASA_SEM_FINAL, fase: 'grupos', grupos: ['impar', 'par'], naMesa: [2, 3, 4, 5, 15] }),
    ];
    for (const partida of estados) {
      const alvos = bolasAlvo(partida);
      for (const bola of partida.naMesa) {
        expect(sinalDaBola(partida, bola).tipo, `bola ${bola}`).toBe(alvos.includes(bola) ? 'certa' : 'errada');
      }
    }
  });

  it('partida encerrada: nada a avisar', () => {
    expect(sinalDaBola({ ...comGrupos, fase: 'fim', vencedor: 0 }, 7)).toBe(SEM_SINAL);
  });
});

function mesaCom(...bolas: { id: IdBola; x: number; z: number }[]): EstadoMesa {
  return { bolas: [bolaParada(ID_BOLAO, { x: -0.5, z: 0 }), ...bolas.map((b) => bolaParada(b.id, { x: b.x, z: b.z }))] };
}

describe('VigiaDaMira: só recalcula quando a mira, a mesa ou a partida mudam', () => {
  function vigia() {
    let varreduras = 0;
    const v = new VigiaDaMira((mesa, angulo) => {
      varreduras++;
      return mesa.bolas.find((b) => b.id !== ID_BOLAO && Math.abs(Math.atan2(b.posicao.z - mesa.bolas[0]!.posicao.z, b.posicao.x - mesa.bolas[0]!.posicao.x) - angulo) < 0.01)?.id ?? null;
    });
    return { v, varreduras: () => varreduras };
  }
  const mesa = mesaCom({ id: 4, x: 0.4, z: 0 }, { id: 7, x: 0.4, z: 0.4 });

  it('devolve o sinal da bola que a reta pega', () => {
    const { v } = vigia();
    expect(v.atualizar(comGrupos, mesa, 0, true).tipo).toBe('certa');
    expect(v.atualizar(comGrupos, mesa, Math.atan2(0.4, 0.9), true)).toMatchObject({ tipo: 'errada', bola: 7 });
    expect(v.atualizar(comGrupos, mesa, 1.5, true)).toBe(SEM_SINAL);
  });

  it('com a mesma entrada devolve o mesmo objeto sem varrer de novo', () => {
    const { v, varreduras } = vigia();
    const primeiro = v.atualizar(comGrupos, mesa, 0, true);
    expect(varreduras()).toBe(1);
    expect(v.atualizar(comGrupos, mesa, 0, true)).toBe(primeiro);
    expect(v.atualizar(comGrupos, mesa, 0, true)).toBe(primeiro);
    expect(varreduras()).toBe(1);
  });

  it('muda o ângulo, a mesa ou a partida: varre de novo', () => {
    const { v, varreduras } = vigia();
    v.atualizar(comGrupos, mesa, 0, true);
    v.atualizar(comGrupos, mesa, 0.001, true);
    expect(varreduras()).toBe(2);
    v.atualizar(comGrupos, mesaCom({ id: 4, x: 0.4, z: 0 }), 0.001, true);
    expect(varreduras()).toBe(3);
    v.atualizar({ ...comGrupos, vez: 1 }, mesaCom({ id: 4, x: 0.4, z: 0 }), 0.001, true);
    expect(varreduras()).toBe(4);
  });

  it('o sinal acompanha a partida: a mesma bola muda de certa para errada quando a vez troca', () => {
    const { v } = vigia();
    expect(v.atualizar(comGrupos, mesa, 0, true).tipo).toBe('certa');
    expect(v.atualizar({ ...comGrupos, vez: 1 }, mesa, 0, true).tipo).toBe('errada');
  });

  it('desativado (não é a minha vez, tacada tocando): nenhum sinal e nenhuma varredura', () => {
    const { v, varreduras } = vigia();
    expect(v.atualizar(comGrupos, mesa, 0, false)).toBe(SEM_SINAL);
    expect(varreduras()).toBe(0);
  });

  it('voltar a ativar depois de desativado devolve o sinal certo', () => {
    const { v } = vigia();
    v.atualizar(comGrupos, mesa, 0, true);
    v.atualizar(comGrupos, mesa, 0, false);
    expect(v.atualizar(comGrupos, mesa, 0, true).tipo).toBe('certa');
  });

  it('usa a varredura de verdade por padrão', () => {
    const real = new VigiaDaMira();
    const m = mesaCom({ id: 7, x: 0.3, z: 0 });
    expect(real.atualizar(comGrupos, m, 0, true)).toMatchObject({ tipo: 'errada', bola: 7 });
  });
});

describe('sinalDaBola no mata-mata: nenhuma bola é errada', () => {
  const mata = partidaDeTeste({ config: CASA_MATA_MATA, jogadores: TRIO_POR_SI, grupos: [null, null, null], fase: 'aberta', naMesa: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] });

  it('qualquer primeira bola na reta é certa, a 8 também (não há bola final) e de qualquer vez', () => {
    for (let n = 1; n <= 15; n++) expect(sinalDaBola(mata, n).tipo, `bola ${n}`).toBe('certa');
    for (const vez of [0, 1, 2]) expect(sinalDaBola({ ...mata, vez }, 8).tipo).toBe('certa');
  });

  it('bolasAlvo é a mesa inteira, que é o que o aviso lê', () => {
    expect(bolasAlvo(mata)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(bolasAlvo({ ...mata, naMesa: [4, 9] })).toEqual([4, 9]);
  });
});
