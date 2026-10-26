import { describe, expect, it } from 'vitest';
import { EmissorDeMira, INTERVALO_DA_MIRA_MS, MiraRemota } from './mira-remota';

const MIRA = { angulo: 1, lateral: 0.2, vertical: -0.1, recuo: 0.05 };

describe('MiraRemota', () => {
  it('a primeira mira salta direto; as seguintes deslizam até o alvo', () => {
    const m = new MiraRemota(18);
    m.definir(MIRA);
    expect(m.angulo).toBe(1);
    expect(m.recuo).toBe(0.05);
    m.definir({ ...MIRA, angulo: 1.5 });
    expect(m.angulo).toBe(1);
    m.atualizar(1 / 60);
    expect(m.angulo).toBeGreaterThan(1);
    expect(m.angulo).toBeLessThan(1.5);
    for (let i = 0; i < 120; i++) m.atualizar(1 / 60);
    expect(m.angulo).toBeCloseTo(1.5, 3);
  });

  it('gira pelo caminho curto através de ±π', () => {
    const m = new MiraRemota(18);
    m.definir({ ...MIRA, angulo: 3.1 });
    m.definir({ ...MIRA, angulo: -3.1 });
    m.atualizar(1 / 60);
    // Vai para a frente (3,1 → 3,14 → -3,14), não de volta pelo outro lado.
    expect(m.angulo).toBeGreaterThan(3.1);
  });

  it('esquecer faz a próxima mira (outro jogador) saltar direto', () => {
    const m = new MiraRemota(18);
    m.definir(MIRA);
    m.esquecer();
    m.definir({ angulo: -2, lateral: 0, vertical: 0, recuo: 0.03 });
    expect(m.angulo).toBe(-2);
    expect(m.lateral).toBe(0);
  });

  it('saltarPara muda o desenho já, sem deslizar', () => {
    const m = new MiraRemota(18);
    m.definir(MIRA);
    m.saltarPara({ angulo: 0.3, lateral: 0, vertical: 0, recuo: 0 });
    expect(m.angulo).toBe(0.3);
    expect(m.recuo).toBe(0);
  });

  it('o amortecimento não depende do tamanho do quadro', () => {
    const a = new MiraRemota(18);
    const b = new MiraRemota(18);
    for (const m of [a, b]) {
      m.definir(MIRA);
      m.definir({ ...MIRA, angulo: 2 });
    }
    for (let i = 0; i < 30; i++) a.atualizar(1 / 60);
    for (let i = 0; i < 15; i++) b.atualizar(1 / 30);
    expect(a.angulo).toBeCloseTo(b.angulo, 6);
  });
});

describe('MiraRemota: o giz do outro', () => {
  it('começa sem giz; a mira com `giz: true` liga e a seguinte, sem a chave, desliga', () => {
    const m = new MiraRemota(18);
    expect(m.giz).toBe(false);
    m.definir({ ...MIRA, giz: true });
    expect(m.giz).toBe(true);
    m.definir(MIRA);
    expect(m.giz).toBe(false);
  });

  it('o giz não desliza como o taco: vale na hora, e a vez nova (esquecer) o solta', () => {
    const m = new MiraRemota(18);
    m.definir({ ...MIRA, giz: true });
    m.atualizar(1 / 60);
    expect(m.giz).toBe(true);
    m.esquecer();
    expect(m.giz).toBe(false);
  });

  it('saltarPara (a tacada chegou) também solta o giz', () => {
    const m = new MiraRemota(18);
    m.definir({ ...MIRA, giz: true });
    m.saltarPara({ ...MIRA, recuo: 0 });
    expect(m.giz).toBe(false);
  });
});

describe('EmissorDeMira', () => {
  function montar() {
    const enviadas: unknown[] = [];
    let aceita = true;
    const emissor = new EmissorDeMira((m) => {
      if (aceita) enviadas.push(m);
      return aceita;
    });
    return { emissor, enviadas, conexao: (v: boolean) => void (aceita = v) };
  }

  it('manda a mira, e só se mudou', () => {
    const t = montar();
    t.emissor.atualizar(0, true, 1, 0, 0, 0.03);
    t.emissor.atualizar(INTERVALO_DA_MIRA_MS, true, 1, 0, 0, 0.03);
    t.emissor.atualizar(2 * INTERVALO_DA_MIRA_MS, true, 1.1, 0, 0, 0.03);
    expect(t.enviadas).toEqual([
      { angulo: 1, lateral: 0, vertical: 0, recuo: 0.03 },
      { angulo: 1.1, lateral: 0, vertical: 0, recuo: 0.03 },
    ]);
  });

  it('no máximo a cada intervalo; o que mudou no meio sai no primeiro quadro depois dele', () => {
    const t = montar();
    t.emissor.atualizar(0, true, 1, 0, 0, 0);
    t.emissor.atualizar(40, true, 2, 0, 0, 0);
    t.emissor.atualizar(90, true, 3, 0, 0, 0);
    expect(t.enviadas).toHaveLength(1);
    t.emissor.atualizar(101, true, 3, 0, 0, 0);
    expect(t.enviadas).toHaveLength(2);
    expect(t.enviadas[1]).toMatchObject({ angulo: 3 });
  });

  it('cada componente conta: só o efeito vertical, só o lateral ou só o recuo mudando já mandam', () => {
    const t = montar();
    t.emissor.atualizar(0, true, 1, 0, 0, 0.03);
    t.emissor.atualizar(200, true, 1, 0, 0.2, 0.03);
    t.emissor.atualizar(400, true, 1, 0.2, 0.2, 0.03);
    t.emissor.atualizar(600, true, 1, 0.2, 0.2, 0.1);
    expect(t.enviadas).toHaveLength(4);
  });

  it('fora da vez não manda nada', () => {
    const t = montar();
    t.emissor.atualizar(0, false, 1, 0, 0, 0);
    expect(t.enviadas).toEqual([]);
  });

  it('mira que a conexão não aceitou é tentada de novo no quadro seguinte', () => {
    const t = montar();
    t.conexao(false);
    t.emissor.atualizar(0, true, 1, 0, 0, 0);
    t.conexao(true);
    t.emissor.atualizar(1, true, 1, 0, 0, 0);
    expect(t.enviadas).toHaveLength(1);
  });

  it('esquecer manda a mesma mira de novo (vez nova, volta da queda)', () => {
    const t = montar();
    t.emissor.atualizar(0, true, 1, 0, 0, 0);
    t.emissor.esquecer();
    t.emissor.atualizar(150, true, 1, 0, 0, 0);
    expect(t.enviadas).toHaveLength(2);
  });

  it('o giz vai na mira como `giz: true`, e sem giz a chave nem existe', () => {
    const t = montar();
    t.emissor.atualizar(0, true, 1, 0, 0, 0.03, true);
    t.emissor.atualizar(200, true, 1, 0, 0, 0.03, false);
    expect(t.enviadas).toEqual([
      { angulo: 1, lateral: 0, vertical: 0, recuo: 0.03, giz: true },
      { angulo: 1, lateral: 0, vertical: 0, recuo: 0.03 },
    ]);
    expect(Object.hasOwn(t.enviadas[1] as object, 'giz')).toBe(false);
  });

  it('só o giz mudando já manda (ligar e desligar com o taco parado), e igual não repete', () => {
    const t = montar();
    t.emissor.atualizar(0, true, 1, 0, 0, 0);
    t.emissor.atualizar(200, true, 1, 0, 0, 0, true);
    t.emissor.atualizar(400, true, 1, 0, 0, 0, true);
    t.emissor.atualizar(600, true, 1, 0, 0, 0);
    expect(t.enviadas).toHaveLength(3);
  });

  it('o giz respeita o intervalo como o resto: ligar e desligar dentro dele não gera mensagem', () => {
    const t = montar();
    t.emissor.atualizar(0, true, 1, 0, 0, 0);
    t.emissor.atualizar(30, true, 1, 0, 0, 0, true);
    t.emissor.atualizar(60, true, 1, 0, 0, 0);
    t.emissor.atualizar(101, true, 1, 0, 0, 0);
    expect(t.enviadas).toHaveLength(1);
  });
});
