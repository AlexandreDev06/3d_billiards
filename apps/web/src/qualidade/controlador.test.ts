import { describe, expect, it } from 'vitest';
import type { QualidadeSalva } from './preferencia';
import { ControladorDeQualidade, type MotivoDaMudanca, type OpcoesDoControlador } from './controlador';
import type { NivelDeQualidade, PreferenciaDeQualidade } from './perfis';

interface Banco {
  readonly c: ControladorDeQualidade;
  readonly mudancas: { nivel: NivelDeQualidade; motivo: MotivoDaMudanca; fps?: number }[];
  readonly salvos: QualidadeSalva[];
}

function criar(o: Partial<Pick<OpcoesDoControlador, 'preferencia' | 'software' | 'rebaixada'>> = {}): Banco {
  const mudancas: Banco['mudancas'] = [];
  const salvos: QualidadeSalva[] = [];
  const c = new ControladorDeQualidade({
    preferencia: 'auto',
    software: false,
    rebaixada: null,
    fpsMinimo: 40,
    janelaMs: 5000,
    aquecimentoMs: 3000,
    ...o,
    aoMudar: (nivel, motivo, fps) => mudancas.push({ nivel, motivo, fps }),
    salvar: (s) => salvos.push(s),
  });
  return { c, mudancas, salvos };
}

/** Roda quadros a `fps` do instante `de` até `ate` (ms); devolve o instante do último. */
function rodar(c: ControladorDeQualidade, de: number, ate: number, fps: number): number {
  const passo = 1000 / fps;
  let t = de;
  for (; t <= ate; t += passo) c.aoQuadro(t);
  return t - passo;
}

describe('abertura', () => {
  it('automático com GPU abre na alta; em software, na baixa', () => {
    expect(criar().c.nivel).toBe('alta');
    expect(criar({ software: true }).c.nivel).toBe('baixa');
  });

  it('abre onde o jogo já teve de descer neste computador', () => {
    expect(criar({ rebaixada: 'media' }).c.nivel).toBe('media');
  });

  it('um nível escolhido vale como está', () => {
    expect(criar({ preferencia: 'alta', software: true }).c.nivel).toBe('alta');
  });

  it('iniciar() avisa o nível de abertura', () => {
    const { c, mudancas } = criar({ software: true });
    c.iniciar();
    expect(mudancas).toEqual([{ nivel: 'baixa', motivo: 'inicio', fps: undefined }]);
  });
});

describe('queda automática por FPS', () => {
  it('FPS médio abaixo de 40 por 5 s depois do aquecimento: desce um nível, avisa com o FPS e lembra', () => {
    const { c, mudancas, salvos } = criar();
    rodar(c, 0, 12000, 20);
    expect(c.nivel).toBe('media');
    expect(mudancas).toHaveLength(1);
    expect(mudancas[0]).toMatchObject({ nivel: 'media', motivo: 'queda' });
    expect(mudancas[0]!.fps).toBeCloseTo(20, 0);
    expect(salvos.at(-1)).toEqual({ preferencia: 'auto', rebaixada: 'media' });
  });

  it('não desce antes do aquecimento e da janela completos (3 s + 5 s)', () => {
    const { c } = criar();
    rodar(c, 0, 7500, 20);
    expect(c.nivel).toBe('alta');
    rodar(c, 7500, 8200, 20);
    expect(c.nivel).toBe('media');
  });

  it('FPS bom não desce nunca', () => {
    const { c, mudancas } = criar();
    rodar(c, 0, 60000, 60);
    expect(mudancas).toHaveLength(0);
    expect(c.nivel).toBe('alta');
  });

  it('exatamente no mínimo (40 fps) ainda é aceitável', () => {
    const { c } = criar();
    rodar(c, 0, 30000, 40);
    expect(c.nivel).toBe('alta');
  });

  it('segue descendo até a baixa, com um novo aquecimento a cada nível, e para nela', () => {
    const { c, mudancas } = criar();
    const t1 = rodar(c, 0, 9000, 15);
    expect(c.nivel).toBe('media');
    // Logo depois da queda o novo nível aquece 3 s: nada muda.
    rodar(c, t1 + 70, t1 + 2900, 15);
    expect(c.nivel).toBe('media');
    rodar(c, t1 + 2900, t1 + 12000, 15);
    expect(c.nivel).toBe('baixa');
    rodar(c, t1 + 12000, t1 + 60000, 15);
    expect(mudancas.map((m) => m.nivel)).toEqual(['media', 'baixa']);
  });

  it('depois de descer, o novo nível aquece 3 s e mede 5 s antes de poder descer de novo (8 s)', () => {
    const { c } = criar();
    const t1 = rodar(c, 0, 9000, 15);
    expect(c.nivel).toBe('media');
    // A queda foi aos ~8 s (3 s de aquecimento + 5 s de janela); a próxima só aos ~16 s.
    rodar(c, t1 + 70, 15800, 15);
    expect(c.nivel).toBe('media');
    rodar(c, 15800, 16400, 15);
    expect(c.nivel).toBe('baixa');
  });

  it('só um lembrete de queda: o mais baixo já alcançado', () => {
    const { c, salvos } = criar();
    rodar(c, 0, 30000, 10);
    expect(salvos.at(-1)).toEqual({ preferencia: 'auto', rebaixada: 'baixa' });
    expect(c.rebaixada).toBe('baixa');
  });

  it('a melhora depois de descer não sobe sozinha', () => {
    const { c } = criar();
    const t = rodar(c, 0, 9000, 15);
    rodar(c, t + 60, t + 60000, 60);
    expect(c.nivel).toBe('media');
  });

  it('com um nível escolhido nunca mede nem desce', () => {
    const { c, mudancas } = criar({ preferencia: 'alta' });
    rodar(c, 0, 60000, 5);
    expect(mudancas).toHaveLength(0);
  });

  it('a pausa da aba (quadros muito espaçados) reinicia a medida em vez de contar como FPS baixo', () => {
    const { c } = criar();
    rodar(c, 0, 4000, 60);
    c.aoQuadro(64000);
    rodar(c, 64000, 66000, 60);
    expect(c.nivel).toBe('alta');
    rodar(c, 66000, 90000, 60);
    expect(c.nivel).toBe('alta');
  });

  it('reiniciarMedida() (aba escondida) joga fora a janela em andamento e pede um novo aquecimento', () => {
    const { c } = criar();
    rodar(c, 0, 7900, 30);
    expect(c.nivel).toBe('alta');
    c.reiniciarMedida();
    // Sem o reinício a janela fecharia aos 8000 ms e desceria; com ele, só depois de 3 s + 5 s novos.
    rodar(c, 7950, 15000, 30);
    expect(c.nivel).toBe('alta');
    rodar(c, 15000, 17000, 30);
    expect(c.nivel).toBe('media');
  });
});

describe('escolha pelo jogador', () => {
  it('trocar a escolha joga fora a janela em andamento: o automático recomeça com aquecimento', () => {
    const { c } = criar();
    rodar(c, 0, 7500, 20);
    expect(c.nivel).toBe('alta');
    c.definirPreferencia('alta');
    c.definirPreferencia('auto');
    // A janela velha fecharia aos 8000 ms com 20 fps e desceria; recomeçada, só depois de 3 s + 5 s.
    rodar(c, 7550, 8500, 20);
    expect(c.nivel).toBe('alta');
    rodar(c, 8500, 16000, 20);
    expect(c.nivel).toBe('media');
  });

  it('escolher um nível troca na hora, avisa, lembra e para de vigiar', () => {
    const { c, mudancas, salvos } = criar();
    c.definirPreferencia('baixa');
    expect(c.nivel).toBe('baixa');
    expect(mudancas).toEqual([{ nivel: 'baixa', motivo: 'escolha', fps: undefined }]);
    expect(salvos.at(-1)).toEqual({ preferencia: 'baixa', rebaixada: null });
    expect(c.vigiando).toBe(false);
  });

  it('escolher o mesmo nível não avisa de novo, mas lembra a escolha', () => {
    const { c, mudancas, salvos } = criar();
    c.definirPreferencia('alta');
    expect(mudancas).toHaveLength(0);
    expect(salvos.at(-1)).toEqual({ preferencia: 'alta', rebaixada: null });
  });

  it('voltar ao automático esquece a queda lembrada e decide de novo', () => {
    const { c, mudancas } = criar({ rebaixada: 'baixa' });
    expect(c.nivel).toBe('baixa');
    c.definirPreferencia('auto');
    expect(c.rebaixada).toBeNull();
    expect(c.nivel).toBe('alta');
    expect(mudancas.at(-1)).toMatchObject({ nivel: 'alta', motivo: 'escolha' });
    expect(c.vigiando).toBe(true);
  });

  it('automático em software volta à baixa', () => {
    const { c } = criar({ software: true, preferencia: 'alta' });
    c.definirPreferencia('auto' as PreferenciaDeQualidade);
    expect(c.nivel).toBe('baixa');
  });

  it('a baixa no automático não vigia (não há para onde descer)', () => {
    expect(criar({ software: true }).c.vigiando).toBe(false);
    expect(criar().c.vigiando).toBe(true);
  });
});
