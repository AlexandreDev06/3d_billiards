import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, criarRng, mesaInicial, simularTacada, type ConfigFisica, type ParametrosTacada, type ResultadoTacada } from '@sinuca/fisica';
import { CONFIG_WEB, type ConfigPrevisao } from '../config';
import { CaminhoPrevisto } from './caminho';
import { PrevisaoDeTacada, type EntradaDaPrevisao, type SaidaDaPrevisao } from './previsao';

const CFG: ConfigPrevisao = { ...CONFIG_WEB.previsao, ligada: true, bolaAtingida: true, velocidadeTaco: 3 };
const ENTRADA: EntradaDaPrevisao = { angulo: 0.2, lateral: 0, vertical: 0, giz: 1 };

/** Mesa só com o bolão na saída: a física de verdade, rápida. */
const MESA = mesaInicial([], CONFIG_FISICA_PADRAO, criarRng(1));

interface Chamada {
  readonly parametros: ParametrosTacada;
  readonly ajuste: Partial<ConfigFisica>;
}

function montar(opcoes: { custoMs?: () => number; cfg?: ConfigPrevisao; falhar?: () => boolean; emRisco?: (entrada: EntradaDaPrevisao) => boolean } = {}) {
  const chamadas: Chamada[] = [];
  const desenhos: { caminho: CaminhoPrevisto; comBolaAtingida: boolean }[] = [];
  const avisos: boolean[] = [];
  let escondidas = 0;
  let relogio = 0;
  const saida: SaidaDaPrevisao = {
    mostrar: (caminho, comBolaAtingida) => desenhos.push({ caminho, comBolaAtingida }),
    esconder: () => escondidas++,
    definirRisco: (emRisco) => avisos.push(emRisco),
  };
  const previsao = new PrevisaoDeTacada({
    prever(parametros, ajuste): ResultadoTacada {
      chamadas.push({ parametros, ajuste });
      if (opcoes.falhar?.()) throw new Error('sem bolão');
      relogio += opcoes.custoMs?.() ?? 1;
      return simularTacada(MESA, parametros, { proximo: () => 1 }, { ...CONFIG_FISICA_PADRAO, ...ajuste });
    },
    saida,
    emRisco: opcoes.emRisco,
    agora: () => relogio,
  });
  previsao.configurar(opcoes.cfg ?? CFG);
  return {
    previsao,
    chamadas,
    desenhos,
    escondidas: () => escondidas,
    avisos,
    passar: (ms: number) => void (relogio += ms),
    agora: () => relogio,
  };
}

describe('PrevisaoDeTacada', () => {
  it('no primeiro quadro ativo calcula, desenha o caminho e liga a linha da bola atingida', () => {
    const t = montar();
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    expect(t.chamadas).toHaveLength(1);
    expect(t.desenhos).toHaveLength(1);
    expect(t.desenhos[0]!.comBolaAtingida).toBe(true);
    expect(t.desenhos[0]!.caminho.quantidade).toBeGreaterThan(2);
  });

  it('pede à física a tacada da mira, do efeito e do giz atuais, com a força da previsão e o corte de duração da config', () => {
    const t = montar();
    t.previsao.atualizar(t.agora(), true, { angulo: 1.1, lateral: 0.3, vertical: -0.2, giz: 0.6 });
    expect(t.chamadas[0]!.parametros).toEqual({ angulo: 1.1, velocidadeTaco: 3, efeito: { lateral: 0.3, vertical: -0.2 }, elevacao: 0, giz: 0.6 });
    expect(t.chamadas[0]!.ajuste).toEqual({ duracaoMaxima: CFG.duracaoMaximaS });
  });

  it('entrada igual nos quadros seguintes não recalcula', () => {
    const t = montar();
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    t.passar(500);
    t.previsao.atualizar(t.agora(), true, { ...ENTRADA });
    t.passar(500);
    t.previsao.atualizar(t.agora(), true, { ...ENTRADA });
    expect(t.chamadas).toHaveLength(1);
    expect(t.previsao.calculos).toBe(1);
  });

  it('cada campo da entrada que muda dispara um cálculo novo', () => {
    for (const campo of ['angulo', 'lateral', 'vertical', 'giz'] as const) {
      const t = montar();
      t.previsao.atualizar(t.agora(), true, ENTRADA);
      t.passar(1000);
      t.previsao.atualizar(t.agora(), true, { ...ENTRADA, [campo]: ENTRADA[campo] + 0.05 });
      expect(t.chamadas, campo).toHaveLength(2);
    }
  });

  it('mudança dentro do espaço mínimo espera, e o cálculo seguinte usa a entrada mais recente', () => {
    const t = montar();
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    t.passar(10);
    t.previsao.atualizar(t.agora(), true, { ...ENTRADA, angulo: 0.5 });
    expect(t.chamadas).toHaveLength(1);
    t.passar(CFG.espacoMinimoMs);
    t.previsao.atualizar(t.agora(), true, { ...ENTRADA, angulo: 0.6 });
    expect(t.chamadas).toHaveLength(2);
    expect(t.chamadas[1]!.parametros.angulo).toBe(0.6);
  });

  it('a mira parada depois de esperar ainda acaba mostrando a última mudança', () => {
    const t = montar();
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    t.passar(10);
    t.previsao.atualizar(t.agora(), true, { ...ENTRADA, angulo: 0.5 });
    t.passar(CFG.espacoMinimoMs);
    t.previsao.atualizar(t.agora(), true, { ...ENTRADA, angulo: 0.5 });
    expect(t.chamadas.at(-1)!.parametros.angulo).toBe(0.5);
  });

  it('cálculo caro espaça mais: o próximo só depois de fatorCusto vezes o custo', () => {
    const t = montar({ custoMs: () => 20 });
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    // Começou em 0 e custou 20 ms: libera em 6 × 20 = 120 ms, não em 40.
    t.passar(50);
    t.previsao.atualizar(t.agora(), true, { ...ENTRADA, angulo: 0.9 });
    expect(t.chamadas).toHaveLength(1);
    t.passar(50);
    t.previsao.atualizar(t.agora(), true, { ...ENTRADA, angulo: 0.9 });
    expect(t.chamadas).toHaveLength(2);
  });

  it('guarda o custo do último cálculo', () => {
    const t = montar({ custoMs: () => 7 });
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    expect(t.previsao.ultimoCustoMs).toBeGreaterThanOrEqual(7);
  });

  it('desligada: esconde a linha e não calcula', () => {
    const t = montar({ cfg: { ...CFG, ligada: false } });
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    expect(t.chamadas).toHaveLength(0);
    expect(t.escondidas()).toBeGreaterThan(0);
  });

  it('esconder só chega à saída uma vez enquanto a linha segue escondida', () => {
    const t = montar();
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    const antes = t.escondidas();
    for (let i = 0; i < 5; i++) t.previsao.atualizar(t.agora(), false, ENTRADA);
    expect(t.escondidas()).toBe(antes + 1);
  });

  it('ligar de novo depois de desligada calcula na hora', () => {
    const t = montar({ cfg: { ...CFG, ligada: false } });
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    t.previsao.configurar(CFG);
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    expect(t.chamadas).toHaveLength(1);
    expect(t.desenhos).toHaveLength(1);
  });

  it('inativa (tacada animando): esconde e não calcula; ao voltar recalcula mesmo com a mesma mira, porque a mesa mudou', () => {
    const t = montar();
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    t.passar(1000);
    t.previsao.atualizar(t.agora(), false, ENTRADA);
    expect(t.chamadas).toHaveLength(1);
    expect(t.escondidas()).toBeGreaterThan(0);
    t.passar(1000);
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    expect(t.chamadas).toHaveLength(2);
  });

  it('invalidar (config de física ou mesa nova) recalcula com a mesma mira', () => {
    const t = montar();
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    t.previsao.invalidar();
    t.passar(1000);
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    expect(t.chamadas).toHaveLength(2);
  });

  it('mudar a config da previsão (força, linha da bola atingida) recalcula', () => {
    const t = montar();
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    t.passar(1000);
    t.previsao.configurar({ ...CFG, velocidadeTaco: 5, bolaAtingida: false });
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    expect(t.chamadas).toHaveLength(2);
    expect(t.chamadas[1]!.parametros.velocidadeTaco).toBe(5);
    expect(t.desenhos[1]!.comBolaAtingida).toBe(false);
  });

  it('reaproveita o mesmo buffer de caminho em todo cálculo', () => {
    const t = montar();
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    t.passar(1000);
    t.previsao.atualizar(t.agora(), true, { ...ENTRADA, angulo: 2 });
    expect(t.desenhos[1]!.caminho).toBe(t.desenhos[0]!.caminho);
    expect(t.previsao.caminho).toBe(t.desenhos[0]!.caminho);
  });

  it('simulação que lança: esconde a linha, guarda o erro, não relança nem tenta de novo a cada quadro', () => {
    let falhar = true;
    const t = montar({ falhar: () => falhar });
    expect(() => t.previsao.atualizar(t.agora(), true, ENTRADA)).not.toThrow();
    expect(t.previsao.erro).toBe('sem bolão');
    expect(t.escondidas()).toBeGreaterThan(0);
    t.passar(1000);
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    expect(t.chamadas).toHaveLength(1);
    falhar = false;
    t.previsao.atualizar(t.agora(), true, { ...ENTRADA, angulo: 0.3 });
    expect(t.previsao.erro).toBeNull();
    expect(t.desenhos).toHaveLength(1);
  });

  it('guarda a gravação prevista para quem quiser conferir com a tacada real', () => {
    const t = montar();
    t.previsao.atualizar(t.agora(), true, ENTRADA);
    expect(t.previsao.gravacao?.eventos[0]).toMatchObject({ tipo: 'taco-bola', bola: ID_BOLAO });
  });
  describe('aviso de risco de miscue', () => {
    const passaDoCirculo = (e: EntradaDaPrevisao): boolean => Math.hypot(e.lateral, e.vertical) > 0.5;

    it('avisa a saída só quando o risco muda, sem esperar o espaço entre cálculos', () => {
      const t = montar({ emRisco: passaDoCirculo });
      t.previsao.atualizar(t.agora(), true, ENTRADA);
      expect(t.avisos).toEqual([false]);
      t.previsao.atualizar(t.agora(), true, ENTRADA);
      expect(t.avisos).toEqual([false]);
      // Mesmo tempo: o cálculo da nova mira ainda não pode rodar, mas a cor já muda.
      t.previsao.atualizar(t.agora(), true, { ...ENTRADA, lateral: 0.7 });
      expect(t.avisos).toEqual([false, true]);
      t.previsao.atualizar(t.agora(), true, { ...ENTRADA, lateral: 0.1 });
      expect(t.avisos).toEqual([false, true, false]);
    });

    it('com o giz gasto o mesmo efeito passa a ser risco (o limite vem de quem chama)', () => {
      const t = montar({ emRisco: (e) => Math.hypot(e.lateral, e.vertical) > (e.giz > 0.5 ? 0.6 : 0.3) });
      t.previsao.atualizar(t.agora(), true, { ...ENTRADA, lateral: 0.4, giz: 1 });
      t.previsao.atualizar(t.agora(), true, { ...ENTRADA, lateral: 0.4, giz: 0.1 });
      expect(t.avisos).toEqual([false, true]);
    });

    it('sem emRisco nunca avisa; com a linha desligada ou fora da vez não mexe na cor', () => {
      const sem = montar();
      sem.previsao.atualizar(sem.agora(), true, { ...ENTRADA, lateral: 0.9 });
      expect(sem.avisos).toEqual([false]);
      const t = montar({ emRisco: passaDoCirculo });
      t.previsao.atualizar(t.agora(), false, { ...ENTRADA, lateral: 0.9 });
      expect(t.avisos).toEqual([]);
    });
  });
});
