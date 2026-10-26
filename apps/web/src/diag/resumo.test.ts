import { describe, expect, it } from 'vitest';
import { EstatisticasDeQuadros } from './quadros';
import { esquemaMensagemDoCliente, LIMITES_PROTOCOLO } from '@sinuca/protocolo';
import { EmissorDeDiagnostico, fecharResumo, memoriaDoJsMb, mensagemDeDiagnostico, type FonteDoResumo, type ResumoDeDesempenho } from './resumo';

function fonte(memoria: number | null = 50): { f: FonteDoResumo; q: EstatisticasDeQuadros } {
  const q = new EstatisticasDeQuadros();
  return { q, f: { quadros: q, qualidade: () => 'media', renderizador: 'GPU x', memoriaMb: () => memoria } };
}

function rodar(q: EstatisticasDeQuadros, e: EmissorDeDiagnostico | null, de: number, ate: number, passo: number): void {
  for (let t = de; t <= ate; t += passo) {
    q.registrar(t);
    e?.atualizar(t);
  }
}

describe('fecharResumo', () => {
  it('traz FPS médio, pior quadro, nível, renderizador e memória, e zera o período', () => {
    const { f, q } = fonte(123.456);
    rodar(q, null, 0, 1000, 20);
    q.registrar(1100);
    const r = fecharResumo(f)!;
    expect(r.fpsMedio).toBeCloseTo(46.4, 1);
    expect(r.piorQuadroMs).toBe(100);
    expect(r).toMatchObject({ qualidade: 'media', renderizador: 'GPU x', memoriaMb: 123.5 });
    expect(fecharResumo(f)).toBeNull();
  });

  it('sem memória exposta o campo é null', () => {
    const { f, q } = fonte(null);
    rodar(q, null, 0, 500, 20);
    expect(fecharResumo(f)!.memoriaMb).toBeNull();
  });
});

describe('EmissorDeDiagnostico', () => {
  it('envia um resumo a cada 60 s e só os quadros daquele período contam', () => {
    const { f, q } = fonte();
    const enviados: ResumoDeDesempenho[] = [];
    const e = new EmissorDeDiagnostico(f, 60000, () => true, (r) => enviados.push(r));
    rodar(q, e, 0, 59000, 20);
    expect(enviados).toHaveLength(0);
    rodar(q, e, 59020, 125000, 10);
    expect(enviados).toHaveLength(2);
    expect(enviados[0]!.fpsMedio).toBeCloseTo(50, -1);
    expect(enviados[1]!.fpsMedio).toBeCloseTo(100, -1);
  });

  it('inativo (offline ou desconectado) não envia e recomeça o período ao voltar', () => {
    const { f, q } = fonte();
    let ativo = false;
    const enviados: ResumoDeDesempenho[] = [];
    const e = new EmissorDeDiagnostico(f, 60000, () => ativo, (r) => enviados.push(r));
    rodar(q, e, 0, 100000, 20);
    expect(enviados).toHaveLength(0);
    ativo = true;
    rodar(q, e, 100020, 150000, 20);
    expect(enviados).toHaveLength(0);
    rodar(q, e, 150020, 161000, 20);
    expect(enviados).toHaveLength(1);
  });

  it('quem ficou inativo no meio do período recomeça a contagem ao voltar (não carrega o tempo de antes)', () => {
    const { f, q } = fonte();
    let ativo = true;
    const enviados: ResumoDeDesempenho[] = [];
    const e = new EmissorDeDiagnostico(f, 60000, () => ativo, (r) => enviados.push(r));
    rodar(q, e, 0, 30000, 20);
    ativo = false;
    rodar(q, e, 30020, 40000, 20);
    ativo = true;
    rodar(q, e, 40020, 95000, 20);
    expect(enviados).toHaveLength(0);
    rodar(q, e, 95020, 101000, 20);
    expect(enviados).toHaveLength(1);
  });

  it('período sem quadros (aba escondida) não gera resumo vazio', () => {
    const { f, q } = fonte();
    const enviados: ResumoDeDesempenho[] = [];
    const e = new EmissorDeDiagnostico(f, 1000, () => true, (r) => enviados.push(r));
    e.atualizar(0);
    e.atualizar(1500);
    expect(enviados).toHaveLength(0);
    expect(q.periodo().quadros).toBe(0);
  });
});

describe('memoriaDoJsMb', () => {
  it('lê o heap em MB onde o navegador expõe', () => {
    expect(memoriaDoJsMb({ memory: { usedJSHeapSize: 52_428_800 } } as unknown as Performance)).toBe(50);
  });

  it('null onde não expõe ou se o valor é estranho', () => {
    expect(memoriaDoJsMb({} as Performance)).toBeNull();
    expect(memoriaDoJsMb({ memory: { usedJSHeapSize: Number.NaN } } as unknown as Performance)).toBeNull();
  });
});

describe('mensagemDeDiagnostico', () => {
  const resumo: ResumoDeDesempenho = { fpsMedio: 24.3, piorQuadroMs: 212.5, qualidade: 'baixa', renderizador: 'ANGLE (Intel, UHD 620)', memoriaMb: 130.2 };

  it('traduz o resumo para a mensagem do protocolo', () => {
    expect(mensagemDeDiagnostico(resumo)).toEqual({ tipo: 'diagnostico', fpsMedio: 24.3, piorQuadroMs: 212.5, qualidade: 'baixa', gpu: 'ANGLE (Intel, UHD 620)', memoriaMb: 130.2 });
  });

  it('sem memória exposta o campo some; sem renderizador vai "desconhecida"', () => {
    const m = mensagemDeDiagnostico({ ...resumo, memoriaMb: null, renderizador: null });
    expect('memoriaMb' in m).toBe(false);
    expect(m.gpu).toBe('desconhecida');
    expect(mensagemDeDiagnostico({ ...resumo, renderizador: '  ' }).gpu).toBe('desconhecida');
  });

  it('renderizador comprido é cortado no teto do protocolo e caracteres de controle viram espaço', () => {
    const m = mensagemDeDiagnostico({ ...resumo, renderizador: `${'x'.repeat(300)}` });
    expect(m.gpu).toHaveLength(LIMITES_PROTOCOLO.gpu);
    expect(mensagemDeDiagnostico({ ...resumo, renderizador: 'a\nb\u0000c' }).gpu).toBe('a b c');
  });

  it('números fora das faixas da sala são presos nelas', () => {
    const m = mensagemDeDiagnostico({ ...resumo, fpsMedio: 5000, piorQuadroMs: 9e9, memoriaMb: -4 });
    expect(m).toMatchObject({ fpsMedio: 1000, piorQuadroMs: 600_000, memoriaMb: 0 });
  });

  it('a mensagem passa pelo esquema que a sala usa para validar', () => {
    const texto = mensagemDeDiagnostico(resumo);
    expect(() => esquemaMensagemDoCliente(texto, 'm')).not.toThrow();
  });
});
