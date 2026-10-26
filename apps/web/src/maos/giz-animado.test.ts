import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { eixoDoTaco } from './eixo';
import { AnimacaoDoGiz, cuboNaMao, entrePoses, poseDaPonta, poseDoCubo, rolarMao, type EntradaDoGiz } from './giz-animado';
import { poseVaziaDeMao, type PoseDeMao } from './pose-das-maos';

const CFG = CONFIG_WEB.maos.giz;
const ATIVO: EntradaDoGiz = { passando: false, encadeando: false, ativo: true, passadaS: 3 };
const PASSANDO: EntradaDoGiz = { ...ATIVO, passando: true };

function andar(a: AnimacaoDoGiz, s: number, e: EntradaDoGiz, dt = 1 / 60): void {
  for (let t = 0; t < s; t += dt) a.atualizar(dt, e);
}
const perto = (a: number, b: number, d = 1e-6): boolean => Math.abs(a - b) <= d;
const unitaria = (p: PoseDeMao): boolean => perto(Math.hypot(p.dx, p.dy, p.dz), 1) && perto(Math.hypot(p.ux, p.uy, p.uz), 1) && perto(p.dx * p.ux + p.dy * p.uy + p.dz * p.uz, 0);

describe('poses da mão', () => {
  it('o quadro do cubo tem a origem no centro dele e a covinha para cima (a direção aponta para baixo)', () => {
    const p = poseDoCubo(0.5, 0.05, -0.3, 0.7);
    expect([p.dx, p.dy, p.dz]).toEqual([0, -1, 0]);
    expect(unitaria(p)).toBe(true);
    expect([p.x, p.y, p.z]).toEqual([0.5, 0.05, -0.3]);
  });

  it('o cubo na mão, parado na borda, fica de covinha para cima, no mesmo lugar', () => {
    const c = cuboNaMao(poseDoCubo(0.5, 0.05, -0.3, 0.7), 0);
    expect([c.x, c.y, c.z].map((v) => +v.toFixed(9))).toEqual([0.5, 0.05, -0.3]);
    expect([c.dx, c.dy, c.dz].map((v) => +v.toFixed(9) + 0)).toEqual([0, 1, 0]);
  });

  it('na ponta a mão aponta como o taco e o cubo encosta a face na ponta', () => {
    const eixo = eixoDoTaco(0, 0.0286, 0, 0.028, 0.4, 0.08, 0.17, 0, 0);
    const lado = CFG.cubo.lado;
    const p = poseDaPonta(eixo, lado);
    expect(unitaria(p)).toBe(true);
    expect(perto(p.dx, eixo.dx) && perto(p.dy, eixo.dy) && perto(p.dz, eixo.dz)).toBe(true);
    const c = cuboNaMao(p, 0);
    // A face de trás do cubo (meio lado atrás do centro, na direção do taco) está na ponta.
    const facex = c.x + p.dx * (-lado / 2) * -1;
    const atras = { x: c.x - p.dx * (lado / 2), y: c.y - p.dy * (lado / 2), z: c.z - p.dz * (lado / 2) };
    expect(Math.hypot(atras.x - eixo.px, atras.y - eixo.py, atras.z - eixo.pz)).toBeLessThan(1e-9);
    expect(facex).toBeDefined();
  });

  it('rolar a mão mantém as direções perpendiculares e unitárias, e uma volta inteira volta ao começo', () => {
    const base = poseDoCubo(0, 0, 0, 1.1);
    const meia = rolarMao(base, 1.3, poseVaziaDeMao());
    expect(unitaria(meia)).toBe(true);
    const inteira = rolarMao(base, 2 * Math.PI, poseVaziaDeMao());
    expect(perto(inteira.ux, base.ux) && perto(inteira.uy, base.uy) && perto(inteira.uz, base.uz)).toBe(true);
  });

  it('entre duas poses: nas pontas dá as poses, no meio tem o arco e segue unitária', () => {
    const a = poseDoCubo(0, 0, 0, 0);
    const b = poseDaPonta(eixoDoTaco(0.5, 0.03, 0.2, 0.028, 1, 0.1, 0.1, 0, 0), 0.024);
    const zero = entrePoses(a, b, 0, 0.05, poseVaziaDeMao());
    const um = entrePoses(a, b, 1, 0.05, poseVaziaDeMao());
    expect(perto(zero.x, a.x) && perto(zero.y, a.y) && perto(zero.z, a.z)).toBe(true);
    expect(perto(um.x, b.x) && perto(um.y, b.y) && perto(um.z, b.z)).toBe(true);
    const meio = entrePoses(a, b, 0.5, 0.05, poseVaziaDeMao());
    expect(meio.y).toBeGreaterThan((a.y + b.y) / 2 + 0.049);
    expect(unitaria(meio)).toBe(true);
  });
});

describe('AnimacaoDoGiz — a pinça', () => {
  /** O fator da pinça a cada quadro, com a fase de cada um. */
  function fatores(entrada: (t: number) => EntradaDoGiz, segundos: number): { fase: string; pinca: number }[] {
    const a = new AnimacaoDoGiz(CFG);
    const v: { fase: string; pinca: number }[] = [];
    for (let t = 0; t < segundos; t += 1 / 60) {
      a.atualizar(1 / 60, entrada(t));
      v.push({ fase: a.fase, pinca: a.pinca });
    }
    return v;
  }

  it('parada a mão está aberta (a ponte); na ponta, e até devolver o cubo, está fechada na pinça', () => {
    const v = fatores((t) => (t < 3 ? PASSANDO : ATIVO), 6);
    expect(v[0]!.pinca).toBe(0);
    expect(v.filter((q) => q.fase === 'girar').every((q) => q.pinca > 0.98)).toBe(true);
    expect(v.filter((q) => q.fase === 'levar').every((q) => q.pinca > 0.9)).toBe(true);
    expect(v[v.length - 1]!.pinca).toBeLessThan(0.01);
  });

  it('fecha enquanto a mão chega ao cubo e abre logo depois de o largar: sem salto de um quadro ao outro', () => {
    const v = fatores((t) => (t < 3 ? PASSANDO : ATIVO), 6);
    let maior = 0;
    for (let i = 1; i < v.length; i++) maior = Math.max(maior, Math.abs(v[i]!.pinca - v[i - 1]!.pinca));
    expect(maior).toBeLessThan(0.3);
    const pegar = v.filter((q) => q.fase === 'pegar');
    expect(pegar[0]!.pinca).toBeLessThan(0.05);
    expect(pegar[pegar.length - 1]!.pinca).toBeGreaterThan(0.7);
    const voltar = v.filter((q) => q.fase === 'voltar');
    expect(voltar[voltar.length - 1]!.pinca).toBeLessThan(0.05);
  });

  it('se o gesto é desfeito no meio, a mão abre sem passar por cima do que já fechou', () => {
    const a = new AnimacaoDoGiz(CFG);
    for (let t = 0; t < 0.3; t += 1 / 60) a.atualizar(1 / 60, PASSANDO);
    const aoDesfazer = a.pinca;
    a.atualizar(1 / 60, { ...ATIVO, ativo: false });
    expect(a.fase).toBe('voltar');
    expect(a.pinca).toBeLessThanOrEqual(aoDesfazer + 1e-9);
  });

  it('reiniciar abre a mão', () => {
    const a = new AnimacaoDoGiz(CFG);
    for (let t = 0; t < 1.2; t += 1 / 60) a.atualizar(1 / 60, PASSANDO);
    expect(a.pinca).toBeGreaterThan(0.9);
    a.reiniciar();
    expect(a.pinca).toBe(0);
  });
});

describe('AnimacaoDoGiz — as fases', () => {
  it('parado até o giz começar a passar; aí a mão vai pegar o cubo', () => {
    const a = new AnimacaoDoGiz(CFG);
    andar(a, 0.5, ATIVO);
    expect(a.fase).toBe('parado');
    a.atualizar(1 / 60, PASSANDO);
    expect(a.fase).toBe('pegar');
    expect(a.cuboNaMao).toBe(false);
  });

  it('pega, leva, gira e, passada a passada, traz de volta e volta à ponte, nessa ordem', () => {
    const a = new AnimacaoDoGiz(CFG);
    const vistas: string[] = [];
    let e: EntradaDoGiz = PASSANDO;
    for (let t = 0; t < 6; t += 1 / 60) {
      if (t > 3) e = ATIVO;
      a.atualizar(1 / 60, e);
      if (vistas[vistas.length - 1] !== a.fase) vistas.push(a.fase);
    }
    expect(vistas).toEqual(['pegar', 'levar', 'girar', 'trazer', 'voltar', 'parado']);
    expect(a.cuboNaMao).toBe(false);
    expect(a.afasta).toBe(0);
  });

  it('o cubo só está na mão da hora em que ela o pega até devolvê-lo', () => {
    const a = new AnimacaoDoGiz(CFG);
    const quando: Record<string, boolean[]> = {};
    for (let t = 0; t < 6; t += 1 / 60) {
      a.atualizar(1 / 60, t < 3 ? PASSANDO : ATIVO);
      (quando[a.fase] ??= []).push(a.cuboNaMao);
    }
    expect(quando.pegar!.slice(0, -1).every((v) => !v)).toBe(true);
    expect(quando.levar!.every(Boolean)).toBe(true);
    expect(quando.girar!.every(Boolean)).toBe(true);
    expect(quando.trazer!.slice(0, -1).every(Boolean)).toBe(true);
    expect(quando.voltar!.every((v) => !v)).toBe(true);
  });

  it('o gesto cabe na passada: a mão chega à ponta e já está de volta em passadaS + a volta', () => {
    const a = new AnimacaoDoGiz(CFG);
    let girouEm = -1;
    for (let t = 0; t < 4; t += 1 / 60) {
      a.atualizar(1 / 60, t < 3 ? PASSANDO : ATIVO);
      if (girouEm < 0 && a.fase === 'girar') girouEm = t;
    }
    expect(girouEm).toBeGreaterThan(CFG.pegarS + CFG.levarS - 0.05);
    expect(girouEm).toBeLessThan(1);
    expect(a.fase).toBe('parado');
  });

  it('numa passada curta o gesto encolhe junto, mas não passa da escala mínima', () => {
    const curta = new AnimacaoDoGiz(CFG);
    const comprida = new AnimacaoDoGiz(CFG);
    const entra = (a: AnimacaoDoGiz, passadaS: number): number => {
      let t = 0;
      for (; t < 5 && a.fase !== 'girar'; t += 1 / 120) a.atualizar(1 / 120, { ...PASSANDO, passadaS });
      return t;
    };
    const tCurta = entra(curta, 0.6);
    const tLonga = entra(comprida, 3);
    expect(tCurta).toBeLessThan(tLonga * 0.5);
    const minima = entra(new AnimacaoDoGiz(CFG), 0.2);
    expect(minima).toBeGreaterThan((CFG.pegarS + CFG.levarS) * CFG.escalaMinima - 0.03);
  });

  it('segurar G encadeia: a mão fica girando enquanto houver passada ou G apertada, e só depois traz o cubo', () => {
    const a = new AnimacaoDoGiz(CFG);
    andar(a, 1.5, PASSANDO);
    expect(a.fase).toBe('girar');
    // A passada acabou, mas G segue apertada: continua girando.
    andar(a, 2, { ...ATIVO, encadeando: true });
    expect(a.fase).toBe('girar');
    andar(a, 0.1, ATIVO);
    expect(a.fase).toBe('trazer');
  });

  it('gira ao menos o giro mínimo na ponta, mesmo se a passada acabou antes de a mão chegar', () => {
    const a = new AnimacaoDoGiz(CFG);
    andar(a, 0.5, PASSANDO);
    expect(a.fase).toBe('levar');
    let girando = 0;
    for (let t = 0; t < 3 && a.fase !== 'trazer'; t += 1 / 120) {
      a.atualizar(1 / 120, ATIVO);
      if (a.fase === 'girar') girando += 1 / 120;
    }
    expect(a.fase).toBe('trazer');
    expect(girando).toBeGreaterThanOrEqual(CFG.giroMinimoS - 0.02);
    expect(girando).toBeLessThan(CFG.giroMinimoS + 0.05);
  });

  it('o cubo volta alinhado: o giro termina num múltiplo de um quarto de volta antes de soltar', () => {
    const a = new AnimacaoDoGiz(CFG);
    andar(a, 1.3, PASSANDO);
    let giro = NaN;
    for (let t = 0; t < 2 && a.fase !== 'voltar'; t += 1 / 120) {
      a.atualizar(1 / 120, ATIVO);
      if (a.fase === 'trazer') giro = a.giro;
    }
    const quartos = giro / (Math.PI / 2);
    expect(Math.abs(quartos - Math.round(quartos))).toBeLessThan(0.05);
  });

  it('G apertada de novo no começo da volta: a mão retoma o giz em vez de ir embora', () => {
    const a = new AnimacaoDoGiz(CFG);
    andar(a, 1.3, PASSANDO);
    let e: EntradaDoGiz = ATIVO;
    for (let t = 0; t < 1 && a.fase !== 'trazer'; t += 1 / 60) a.atualizar(1 / 60, e);
    expect(a.fase).toBe('trazer');
    e = PASSANDO;
    a.atualizar(1 / 60, e);
    expect(a.fase).toBe('levar');
    expect(a.cuboNaMao).toBe(true);
  });

  it('o taco recua enquanto a mão está com o giz e volta depois', () => {
    const a = new AnimacaoDoGiz(CFG);
    expect(a.afasta).toBe(0);
    andar(a, 1.2, PASSANDO);
    expect(a.afasta).toBeGreaterThan(0.95);
    andar(a, 3, ATIVO);
    expect(a.afasta).toBe(0);
  });
});

describe('AnimacaoDoGiz — desfazer', () => {
  it('fora de `ativo` o cubo volta à borda na hora e a mão volta depressa, a partir de onde estava', () => {
    const a = new AnimacaoDoGiz(CFG);
    andar(a, 1.2, PASSANDO);
    expect(a.fase).toBe('girar');
    expect(a.cuboNaMao).toBe(true);
    a.atualizar(1 / 60, { ...ATIVO, ativo: false });
    expect(a.fase).toBe('voltar');
    expect(a.cuboNaMao).toBe(false);
    let t = 0;
    for (; t < 2 && a.fase !== 'parado'; t += 1 / 60) a.atualizar(1 / 60, { ...ATIVO, ativo: false });
    expect(a.fase).toBe('parado');
    expect(t).toBeLessThan(CFG.voltarS * 0.5);
  });

  it('desfazer sem ter começado não faz nada', () => {
    const a = new AnimacaoDoGiz(CFG);
    a.atualizar(1 / 60, { ...PASSANDO, ativo: false });
    expect(a.fase).toBe('parado');
  });

  it('reiniciar volta tudo ao começo', () => {
    const a = new AnimacaoDoGiz(CFG);
    andar(a, 1.2, PASSANDO);
    a.reiniciar();
    expect(a.fase).toBe('parado');
    expect(a.cuboNaMao).toBe(false);
    expect(a.afasta).toBe(0);
    expect(a.giro).toBe(0);
  });
});

describe('AnimacaoDoGiz — a pose da mão', () => {
  const ponte = poseDoCubo(0.1, 0.03, 0.4, 0.3);
  const cubo = poseDoCubo(0.35, 0.05, -0.62, 0.3);
  const ponta = poseDaPonta(eixoDoTaco(0, 0.03, 0, 0.028, 0.3, 0.05, 0.25, 0, 0), CFG.cubo.lado);

  it('parado a mão fica na ponte', () => {
    const a = new AnimacaoDoGiz(CFG);
    const p = a.poseDaMao(ponte, cubo, ponta, poseVaziaDeMao());
    expect(perto(p.x, ponte.x) && perto(p.y, ponte.y) && perto(p.z, ponte.z)).toBe(true);
  });

  it('parte da ponte, chega ao cubo ao fim de pegar e à ponta ao fim de levar, sem pular de uma fase a outra', () => {
    const a = new AnimacaoDoGiz(CFG);
    const saida = poseVaziaDeMao();
    let anterior: PoseDeMao | null = null;
    let maiorSalto = 0;
    let chegouAoCubo = Infinity;
    let chegouAPonta = Infinity;
    for (let t = 0; t < 1.5; t += 1 / 120) {
      a.atualizar(1 / 120, PASSANDO);
      a.poseDaMao(ponte, cubo, ponta, saida);
      if (anterior) maiorSalto = Math.max(maiorSalto, Math.hypot(saida.x - anterior.x, saida.y - anterior.y, saida.z - anterior.z));
      anterior = { ...saida };
      if (a.fase === 'pegar') chegouAoCubo = Math.min(chegouAoCubo, Math.hypot(saida.x - cubo.x, saida.y - cubo.y, saida.z - cubo.z));
      if (a.fase === 'levar') chegouAPonta = Math.min(chegouAPonta, Math.hypot(saida.x - ponta.x, saida.y - ponta.y, saida.z - ponta.z));
    }
    expect(chegouAoCubo).toBeLessThan(0.01);
    expect(chegouAPonta).toBeLessThan(0.03);
    // O trajeto é de ~1 m em ~0,75 s: a 120 quadros por segundo nenhum quadro anda mais que isto (sem pulos entre as fases).
    expect(maiorSalto).toBeLessThan(0.035);
  });

  it('girando, a mão fica onde a pinça do cubo a põe (`poseDaMao` não mexe nela; o giro é do cubo)', () => {
    const a = new AnimacaoDoGiz(CFG);
    andar(a, 1.3, PASSANDO);
    const saida = poseVaziaDeMao();
    a.atualizar(1 / 60, PASSANDO);
    expect(a.fase).toBe('girar');
    a.poseDaMao(ponte, cubo, ponta, saida);
    expect(perto(saida.x, ponta.x) && perto(saida.y, ponta.y) && perto(saida.z, ponta.z)).toBe(true);
  });

  it('o cubo girando rola em torno do eixo do taco e o centro faz um círculo pequeno sobre a face, sem sair do plano dela', () => {
    const a = new AnimacaoDoGiz(CFG);
    andar(a, 1.3, PASSANDO);
    const saida = poseVaziaDeMao();
    let maior = 0;
    let maiorRolo = 0;
    for (let t = 0; t < 1; t += 1 / 60) {
      a.atualizar(1 / 60, PASSANDO);
      a.cuboGirando(ponta, saida);
      expect(unitaria(saida)).toBe(true);
      // a direção não muda: é o eixo do taco
      expect(perto(saida.dx, ponta.dx) && perto(saida.dy, ponta.dy) && perto(saida.dz, ponta.dz)).toBe(true);
      const desvio = (saida.x - ponta.x) * ponta.dx + (saida.y - ponta.y) * ponta.dy + (saida.z - ponta.z) * ponta.dz;
      expect(Math.abs(desvio)).toBeLessThan(1e-9);
      maior = Math.max(maior, Math.hypot(saida.x - ponta.x, saida.y - ponta.y, saida.z - ponta.z));
      maiorRolo = Math.max(maiorRolo, Math.acos(Math.min(saida.ux * ponta.ux + saida.uy * ponta.uy + saida.uz * ponta.uz, 1)));
    }
    expect(maior).toBeGreaterThan(CFG.giro.raioM * 0.8);
    expect(maior).toBeLessThan(CFG.giro.raioM * 1.05);
    expect(maiorRolo).toBeGreaterThan(CFG.giro.balancoRad * 0.8);
  });

  it('entra no giro sem salto: no primeiro quadro o cubo ainda está na pose parada', () => {
    const a = new AnimacaoDoGiz(CFG);
    const saida = poseVaziaDeMao();
    while (a.fase !== 'girar') a.atualizar(1 / 60, PASSANDO);
    a.cuboGirando(ponta, saida);
    expect(Math.hypot(saida.x - ponta.x, saida.y - ponta.y, saida.z - ponta.z)).toBeLessThan(CFG.giro.raioM * 0.1);
    expect(Math.acos(Math.min(saida.ux * ponta.ux + saida.uy * ponta.uy + saida.uz * ponta.uz, 1))).toBeLessThan(0.05);
  });
});
