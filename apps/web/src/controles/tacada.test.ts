import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { curvaDeForca } from './forca';
import { velocidadeDaLinha } from './forca-linha';
import { Tacada } from './tacada';

const cfg = CONFIG_WEB.tacada;

function armada(): Tacada {
  const tacada = new Tacada(cfg);
  expect(tacada.pressionar()).toBe(true);
  tacada.travou();
  return tacada;
}

/** Puxa `pixels` para trás em passos de `passo` px a cada `intervaloMs`; devolve o relógio. */
function puxar(tacada: Tacada, pixels: number, passo: number, intervaloMs: number, t0 = 0): number {
  let t = t0;
  for (let feito = 0; feito < pixels; feito += passo) {
    t += intervaloMs;
    tacada.mover(passo, t);
  }
  return t;
}

/** Empurra até a ponta chegar na bola; devolve a velocidade da tacada ou null se não bateu. */
function empurrar(tacada: Tacada, passo: number, intervaloMs: number, t0: number): number | null {
  let t = t0;
  for (let i = 0; i < 1000; i++) {
    t += intervaloMs;
    const v = tacada.mover(-passo, t);
    if (v !== null) return v;
  }
  return null;
}

describe('Tacada', () => {
  it('segue pressionar → travou → armada com a ponta na folga inicial', () => {
    const tacada = new Tacada(cfg);
    expect(tacada.fase).toBe('ociosa');
    tacada.pressionar();
    expect(tacada.fase).toBe('travando');
    tacada.travou();
    expect(tacada.fase).toBe('armada');
    expect(tacada.recuo).toBe(cfg.recuoInicial);
  });

  it('puxar o mouse recua o taco, até o limite', () => {
    const tacada = armada();
    tacada.mover(100, 10);
    expect(tacada.recuo).toBeCloseTo(cfg.recuoInicial + 100 * cfg.metrosPorPixel, 9);
    tacada.mover(10_000, 20);
    expect(tacada.recuo).toBe(cfg.recuoMaximo);
  });

  it('com a ponta a 5 mm da bola ainda não bateu; só bate ao encostar', () => {
    const tacada = armada();
    expect(tacada.mover(-(cfg.recuoInicial - 0.005) / cfg.metrosPorPixel, 10)).toBeNull();
    expect(tacada.fase).toBe('armada');
    expect(tacada.recuo).toBeCloseTo(0.005, 9);
    expect(tacada.mover(-6, 20)).not.toBeNull();
    expect(tacada.fase).toBe('animando');
  });

  it('cancelar (soltar o botão, perder o lock) não interrompe a animação', () => {
    const tacada = armada();
    const t = puxar(tacada, 100, 20, 20);
    empurrar(tacada, 20, 5, t + 100);
    tacada.cancelar();
    expect(tacada.fase).toBe('animando');
    expect(tacada.recuo).toBe(0);
  });

  it('empurrar rápido até a bola dá a tacada com a velocidade da curva', () => {
    const tacada = armada();
    const t = puxar(tacada, 300, 20, 20);
    // 20 px a cada 5 ms = 4 m/s no taco: a entrada que dá a força máxima.
    const velocidade = empurrar(tacada, 20, 5, t + 100);
    expect(velocidade).toBeCloseTo(curvaDeForca(4, cfg), 5);
    expect(tacada.fase).toBe('animando');
    expect(tacada.recuo).toBe(0);
  });

  it('empurrar devagar dá tacada mais fraca que empurrar rápido', () => {
    const lenta = armada();
    const tl = puxar(lenta, 300, 20, 20);
    const vLenta = empurrar(lenta, 2, 5, tl + 100);
    const rapida = armada();
    const tr = puxar(rapida, 300, 20, 20);
    const vRapida = empurrar(rapida, 20, 5, tr + 100);
    expect(vLenta).not.toBeNull();
    expect(vRapida).not.toBeNull();
    expect(vLenta!).toBeLessThan(vRapida!);
  });

  it('soltar antes do impacto cancela sem tacar', () => {
    const tacada = armada();
    puxar(tacada, 100, 20, 20);
    tacada.cancelar();
    expect(tacada.fase).toBe('ociosa');
    expect(tacada.recuo).toBe(cfg.recuoInicial);
    expect(tacada.mover(-500, 1000)).toBeNull();
  });

  it('cancelar enquanto espera o Pointer Lock também volta a ociosa', () => {
    const tacada = new Tacada(cfg);
    tacada.pressionar();
    tacada.cancelar();
    tacada.travou();
    expect(tacada.fase).toBe('ociosa');
  });

  it('mover sem estar armada não faz nada', () => {
    const tacada = new Tacada(cfg);
    expect(tacada.mover(-500, 10)).toBeNull();
    expect(tacada.recuo).toBe(cfg.recuoInicial);
  });

  it('durante a animação bloqueia pressionar e mover até concluir', () => {
    const tacada = armada();
    const t = puxar(tacada, 100, 20, 20);
    empurrar(tacada, 20, 5, t + 100);
    expect(tacada.pressionar()).toBe(false);
    expect(tacada.mover(50, 9999)).toBeNull();
    tacada.concluir();
    expect(tacada.fase).toBe('ociosa');
    expect(tacada.pressionar()).toBe(true);
  });

  it('iniciarAnimacao (gancho de teste) bloqueia como uma tacada de verdade', () => {
    const tacada = new Tacada(cfg);
    expect(tacada.iniciarAnimacao()).toBe(true);
    expect(tacada.fase).toBe('animando');
    expect(tacada.iniciarAnimacao()).toBe(false);
    expect(tacada.pressionar()).toBe(false);
  });
});

describe('Tacada — curva de força editável', () => {
  it('configurar troca a curva da próxima tacada (mesmo movimento, força diferente)', () => {
    const padrao = armada();
    const movimento = (tacada: Tacada): number => {
      const t = puxar(tacada, 200, 10, 10);
      return empurrar(tacada, 10, 10, t)!;
    };
    const vPadrao = movimento(padrao);

    const editada = armada();
    editada.configurar({ ...cfg, expoenteForca: cfg.expoenteForca + 1.4 });
    const vEditada = movimento(editada);

    expect(vEditada).toBeLessThan(vPadrao);
    expect(vEditada).toBeGreaterThanOrEqual(cfg.velocidadeMin);
  });

  it('configurar no meio da mira não derruba a tacada em curso', () => {
    const tacada = armada();
    tacada.configurar({ ...cfg, velocidadeMax: 3 });
    expect(tacada.fase).toBe('armada');
    const t = puxar(tacada, 200, 10, 10);
    expect(empurrar(tacada, 40, 10, t)).toBeLessThanOrEqual(3);
  });
});


describe('Tacada — força pela linha', () => {
  const cheia = cfg.recuoMaximo - cfg.recuoInicial;
  const pxCheia = cheia / cfg.metrosPorPixel;

  function naLinha(config = cfg): Tacada {
    const tacada = new Tacada(config, 'linha');
    expect(tacada.pressionar()).toBe(true);
    tacada.travou();
    return tacada;
  }

  it('o padrão da classe é o controle de antes, e o da linha pode ser pedido ou trocado', () => {
    expect(new Tacada(cfg).controle).toBe('empurrar');
    expect(new Tacada(cfg, 'linha').controle).toBe('linha');
    const t = new Tacada(cfg);
    t.definirControle('linha');
    expect(t.controle).toBe('linha');
  });

  it('puxar o mouse para trás cresce a barra e recua o taco na mesma proporção; nunca dá a tacada sozinho', () => {
    const tacada = naLinha();
    expect(tacada.fracaoDaForca).toBe(0);
    expect(tacada.mover(pxCheia / 4, 10)).toBeNull();
    expect(tacada.fracaoDaForca).toBeCloseTo(0.25, 9);
    expect(tacada.recuo).toBeCloseTo(cfg.recuoInicial + cheia / 4, 9);
    expect(tacada.mover(pxCheia / 4, 20)).toBeNull();
    expect(tacada.fracaoDaForca).toBeCloseTo(0.5, 9);
    expect(tacada.recuo).toBeCloseTo(cfg.recuoInicial + cheia / 2, 9);
    expect(tacada.fase).toBe('armada');
  });

  it('empurrar para a frente diminui a força, sem passar do zero e sem tacar', () => {
    const tacada = naLinha();
    tacada.mover(pxCheia / 2, 10);
    tacada.mover(-pxCheia / 4, 20);
    expect(tacada.fracaoDaForca).toBeCloseTo(0.25, 9);
    expect(tacada.mover(-10 * pxCheia, 30)).toBeNull();
    expect(tacada.fracaoDaForca).toBe(0);
    expect(tacada.recuo).toBe(cfg.recuoInicial);
    expect(tacada.fase).toBe('armada');
  });

  it('a barra cheia é o teto: puxar mais não passa de 100% nem do recuo máximo', () => {
    const tacada = naLinha();
    tacada.mover(10 * pxCheia, 10);
    expect(tacada.fracaoDaForca).toBe(1);
    expect(tacada.recuo).toBeCloseTo(cfg.recuoMaximo, 9);
    // e um recuo grande não precisa ser desfeito pixel a pixel: o teto não guarda o excesso
    tacada.mover(-pxCheia / 10, 20);
    expect(tacada.fracaoDaForca).toBeCloseTo(0.9, 9);
  });

  it('soltar dá a tacada com a velocidade da linha para aquela fração, e a ponta vai à bola', () => {
    const tacada = naLinha();
    tacada.mover(pxCheia / 2, 10);
    const recuoAoSoltar = tacada.recuo;
    const velocidade = tacada.soltar();
    expect(velocidade).toBeCloseTo(velocidadeDaLinha(0.5, cfg), 9);
    expect(tacada.fase).toBe('animando');
    expect(tacada.recuo).toBe(0);
    expect(tacada.recuoDaBatida).toBeCloseTo(recuoAoSoltar, 9);
    expect(tacada.fracaoDaForca).toBe(0);
  });

  it('a barra cheia solta a "Força máxima"', () => {
    const tacada = naLinha();
    tacada.mover(10 * pxCheia, 10);
    expect(tacada.soltar()).toBeCloseTo(cfg.velocidadeMax, 9);
  });

  it('soltar perto de zero cancela sem tacar (o limite é fracaoMinima)', () => {
    const quase = naLinha();
    quase.mover((cfg.linha.fracaoMinima * pxCheia) * 0.9, 10);
    expect(quase.soltar()).toBeNull();
    expect(quase.fase).toBe('ociosa');
    expect(quase.recuo).toBe(cfg.recuoInicial);
    const vazia = naLinha();
    expect(vazia.soltar()).toBeNull();
    expect(vazia.fase).toBe('ociosa');
    const justo = naLinha();
    justo.mover(cfg.linha.fracaoMinima * pxCheia * 1.01, 10);
    expect(justo.soltar()).not.toBeNull();
  });

  it('cancelar (Esc, perder o Pointer Lock) zera a puxada: a próxima mira começa do zero', () => {
    const tacada = naLinha();
    tacada.mover(pxCheia / 2, 10);
    tacada.cancelar();
    expect(tacada.fase).toBe('ociosa');
    expect(tacada.fracaoDaForca).toBe(0);
    expect(tacada.soltar()).toBeNull();
    tacada.pressionar();
    tacada.travou();
    expect(tacada.fracaoDaForca).toBe(0);
    expect(tacada.recuo).toBe(cfg.recuoInicial);
  });

  it('a sensibilidade de força do jogador muda quanto mouse a barra cheia pede', () => {
    const sensivel = { ...cfg, metrosPorPixel: cfg.metrosPorPixel * 2 };
    const t = naLinha(sensivel);
    t.mover(pxCheia / 2, 10);
    expect(t.fracaoDaForca).toBeCloseTo(1, 9);
    const dura = { ...cfg, metrosPorPixel: cfg.metrosPorPixel / 2 };
    const d = naLinha(dura);
    d.mover(pxCheia / 2, 10);
    expect(d.fracaoDaForca).toBeCloseTo(0.25, 9);
  });

  it('configurar no meio da puxada troca a escala sem cancelar', () => {
    const tacada = naLinha();
    tacada.mover(pxCheia / 2, 10);
    tacada.configurar({ ...cfg, velocidadeMax: 3 });
    expect(tacada.fase).toBe('armada');
    expect(tacada.soltar()).toBeCloseTo(velocidadeDaLinha(0.5, { ...cfg, velocidadeMax: 3 }), 9);
  });

  it('soltar ou mover fora da mira não faz nada; durante a animação bloqueia até concluir', () => {
    const tacada = new Tacada(cfg, 'linha');
    expect(tacada.soltar()).toBeNull();
    expect(tacada.mover(100, 10)).toBeNull();
    expect(tacada.recuo).toBe(cfg.recuoInicial);
    const armada = naLinha();
    armada.mover(pxCheia / 2, 10);
    armada.soltar();
    expect(armada.soltar()).toBeNull();
    expect(armada.mover(100, 20)).toBeNull();
    expect(armada.pressionar()).toBe(false);
    armada.concluir();
    expect(armada.fase).toBe('ociosa');
    expect(armada.recuo).toBe(cfg.recuoInicial);
  });

  it('trocar o controle no meio da mira cancela essa tacada, mas não a animação', () => {
    const t = naLinha();
    t.mover(pxCheia / 2, 10);
    t.definirControle('empurrar');
    expect(t.fase).toBe('ociosa');
    expect(t.recuo).toBe(cfg.recuoInicial);
    const a = naLinha();
    a.mover(pxCheia / 2, 10);
    a.soltar();
    a.definirControle('empurrar');
    expect(a.fase).toBe('animando');
  });

  it('o controle empurrar segue idêntico: soltar antes do impacto cancela e mover ainda dá a tacada na ponta', () => {
    const tacada = armada();
    tacada.mover(100, 10);
    expect(tacada.soltar()).toBeNull();
    expect(tacada.fase).toBe('ociosa');
    expect(tacada.fracaoDaForca).toBe(0);
    const outra = armada();
    const t = puxar(outra, 300, 20, 20);
    expect(empurrar(outra, 20, 5, t + 100)).toBeCloseTo(curvaDeForca(4, cfg), 5);
    expect(outra.recuoDaBatida).toBe(0);
  });
});
