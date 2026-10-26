import { describe, expect, it } from 'vitest';
import { PassadaEncadeada } from './passada-encadeada';
import { Giz } from './giz';
import { REGRAS_GIZ_PADRAO } from './regras-giz';

/** Giz com 55% de nível (cinco passadas de 10% e meia), regras de fábrica. */
function gizGasto(nivel = 0.55): Giz {
  const giz = new Giz({ ...REGRAS_GIZ_PADRAO, desgasteMin: 1 - nivel, desgasteMax: 1 - nivel }, () => 0);
  giz.consumir();
  giz.definirRegras(REGRAS_GIZ_PADRAO);
  return giz;
}

/** Joga `segundos` de jogo em quadros de 1/60 s com a tecla segura (ou não), como o laço de `entrada`. */
function jogar(giz: Giz, cadeia: PassadaEncadeada, segundos: number, podePassar = true): void {
  for (let t = 0; t < segundos - 1e-9; t += 1 / 60) {
    giz.atualizar(1 / 60);
    cadeia.quadro(giz, podePassar);
  }
}

describe('PassadaEncadeada', () => {
  it('um toque em G faz uma passada só: 3 s, +10%', () => {
    const giz = gizGasto();
    const cadeia = new PassadaEncadeada();
    cadeia.apertou(giz.passar());
    cadeia.soltou();
    jogar(giz, cadeia, 10);
    expect(giz.nivel).toBeCloseTo(0.65, 6);
    expect(giz.passando).toBe(false);
  });

  it('segurar G encadeia as passadas, uma a cada 3 s, até 100%', () => {
    const giz = gizGasto();
    const cadeia = new PassadaEncadeada();
    cadeia.apertou(giz.passar());
    jogar(giz, cadeia, 3.2);
    expect(giz.nivel).toBeGreaterThan(0.65);
    expect(giz.passando).toBe(true);
    jogar(giz, cadeia, 40);
    expect(giz.nivel).toBe(1);
    expect(giz.passando).toBe(false);
    expect(cadeia.encadeando).toBe(false);
  });

  it('soltar G no meio de uma passada deixa essa terminar, mas não começa outra', () => {
    const giz = gizGasto();
    const cadeia = new PassadaEncadeada();
    cadeia.apertou(giz.passar());
    jogar(giz, cadeia, 1);
    cadeia.soltou();
    jogar(giz, cadeia, 20);
    expect(giz.nivel).toBeCloseTo(0.65, 6);
  });

  it('G apertada sem poder passar (giz cheio) não encadeia nada', () => {
    const giz = new Giz(REGRAS_GIZ_PADRAO, () => 0);
    const cadeia = new PassadaEncadeada();
    cadeia.apertou(giz.passar());
    expect(cadeia.encadeando).toBe(false);
    giz.consumir();
    jogar(giz, cadeia, 5);
    expect(giz.nivel).toBeCloseTo(0.9, 9);
  });

  it('se a tacada foi armada (ou a vez passou) a cadeia acaba e a próxima passada não vem', () => {
    const giz = gizGasto();
    const cadeia = new PassadaEncadeada();
    cadeia.apertou(giz.passar());
    jogar(giz, cadeia, 3.5, false);
    expect(cadeia.encadeando).toBe(false);
    jogar(giz, cadeia, 10, true);
    expect(giz.nivel).toBeCloseTo(0.65, 6);
  });
});
