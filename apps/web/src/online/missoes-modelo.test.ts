import { diaDaMissao, fimDoDia, missoesDoDia, type MissoesDoDia } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { AVISO_SEM_CARTEIRA, TOTAL_DO_DIA, avisosDeMissao, missoesNaTela, tempoParaVirar, textoDaMissaoCumprida, textoDoProgresso } from './missoes-modelo';

const AGORA = Date.parse('2026-10-26T15:00:00Z'); // 12:00 em Brasília
const DIA = diaDaMissao(AGORA);
const FIM = fimDoDia(DIA);
const [FACIL, MEDIA, DIFICIL] = missoesDoDia(DIA); // 2026-10-26: Pelo meio (2), Fecha a conta (1), Volta ao mundo (1)

const quadro = (progressos: readonly [number, number, number], dia = DIA, fimMs = FIM): MissoesDoDia => ({
  dia,
  fimMs,
  itens: [FACIL, MEDIA, DIFICIL].map((m, i) => ({ id: m.id, progresso: progressos[i]!, meta: m.meta, cumprida: progressos[i]! >= m.meta })),
});

describe('tempoParaVirar', () => {
  it('horas e minutos, só minutos, e menos de um minuto', () => {
    expect(tempoParaVirar(AGORA + (3 * 60 + 20) * 60_000, AGORA)).toBe('3 h 20 min');
    expect(tempoParaVirar(AGORA + 2 * 3_600_000, AGORA)).toBe('2 h');
    expect(tempoParaVirar(AGORA + 42 * 60_000, AGORA)).toBe('42 min');
    expect(tempoParaVirar(AGORA + 20_000, AGORA)).toBe('1 min');
    expect(tempoParaVirar(AGORA, AGORA)).toBe('menos de 1 min');
    expect(tempoParaVirar(AGORA - 5000, AGORA)).toBe('menos de 1 min');
  });
});

describe('missoesNaTela', () => {
  it('com a carteira: três cartões na ordem fácil, média, difícil, com prêmio do nível, progresso e barra', () => {
    const t = missoesNaTela(quadro([1, 0, 0]), AGORA);
    expect(t.origem).toBe('carteira');
    expect(t.aviso).toBeNull();
    expect(t.cartoes.map((c) => [c.nivel, c.rotuloDoNivel, c.textoDoPremio])).toEqual([
      ['facil', 'Fácil', '+50'],
      ['media', 'Média', '+70'],
      ['dificil', 'Difícil', '+100'],
    ]);
    expect(t.cartoes[0]).toMatchObject({ id: FACIL.id, nome: FACIL.nome, descricao: FACIL.descricao, progresso: 1, meta: FACIL.meta, cumprida: false });
    expect(t.cartoes[0]!.textoDoProgresso).toBe(`1 de ${FACIL.meta}`);
    expect(t.cartoes[0]!.fracao).toBeCloseTo(1 / FACIL.meta);
    expect(t.restante).toBe('Faltam 12 h para virar o dia');
  });

  it('as cumpridas somam o ganho do dia, em "x de 220 moedas hoje"', () => {
    const t = missoesNaTela(quadro([FACIL.meta, MEDIA.meta, 0]), AGORA);
    expect(t.cartoes.map((c) => c.cumprida)).toEqual([true, true, false]);
    expect(t.ganhoHoje).toBe(120);
    expect(t.textoDoGanho).toBe('120 de 220 moedas hoje');
    expect(TOTAL_DO_DIA).toBe(220);
    expect(missoesNaTela(quadro([FACIL.meta, MEDIA.meta, DIFICIL.meta]), AGORA).textoDoGanho).toBe('220 de 220 moedas hoje');
  });

  it('o progresso não passa da meta nem fica negativo', () => {
    const t = missoesNaTela(quadro([99, -3, 0]), AGORA);
    expect(t.cartoes[0]!.progresso).toBe(FACIL.meta);
    expect(t.cartoes[0]!.fracao).toBe(1);
    expect(t.cartoes[1]!.progresso).toBe(0);
  });

  it('sem carteira: as missões do dia de agora, zeradas, com o aviso de que só valem online e apostadas', () => {
    const t = missoesNaTela(null, AGORA);
    expect(t.origem).toBe('catalogo');
    expect(t.aviso).toBe(AVISO_SEM_CARTEIRA);
    expect(t.cartoes.map((c) => c.id)).toEqual([FACIL.id, MEDIA.id, DIFICIL.id]);
    expect(t.cartoes.every((c) => c.progresso === 0 && !c.cumprida)).toBe(true);
    expect(t.ganhoHoje).toBe(0);
    expect(t.fimMs).toBe(FIM);
  });

  it('o lobby aberto na virada: o quadro velho dá lugar às missões do dia novo, zeradas, e o aviso de carteira não volta', () => {
    const velho = quadro([FACIL.meta, 0, 0]);
    const amanha = FIM + 60_000;
    const t = missoesNaTela(velho, amanha);
    expect(t.origem).toBe('carteira');
    expect(t.aviso).toBeNull();
    expect(t.cartoes.map((c) => c.id)).toEqual(missoesDoDia(diaDaMissao(amanha)).map((m) => m.id));
    expect(t.ganhoHoje).toBe(0);
    expect(t.fimMs).toBe(fimDoDia(diaDaMissao(amanha)));
  });
});

describe('avisosDeMissao', () => {
  it('a que andou sem fechar dá o aviso discreto "Nome x/meta"', () => {
    const a = avisosDeMissao(quadro([0, 0, 0]), quadro([1, 0, 0]), []);
    expect(a).toEqual([{ tipo: 'progresso', id: FACIL.id, texto: textoDoProgresso(FACIL.id, 1) }]);
  });

  it('a que fechou dá o aviso de festa com o prêmio do nível, antes das que só andaram', () => {
    const antes = quadro([0, 0, 0]);
    const depois = quadro([1, MEDIA.meta, 0]);
    const a = avisosDeMissao(antes, depois, [MEDIA.id]);
    expect(a).toHaveLength(2);
    expect(a[0]).toEqual({ tipo: 'cumprida', id: MEDIA.id, texto: `Missão cumprida! ${MEDIA.nome} +70` });
    expect(a.slice(1).every((x) => x.tipo === 'progresso')).toBe(true);
    expect(a.some((x) => x.id === MEDIA.id && x.tipo === 'progresso')).toBe(false);
  });

  it('o texto de exemplo do pedido: "Mão quente 3/5" e "Tabelada +100"', () => {
    expect(textoDoProgresso('mao-quente', 3)).toBe('Mão quente 3/5');
    expect(textoDaMissaoCumprida('tabelada')).toBe('Missão cumprida! Tabelada +100');
  });

  it('o que não andou não avisa, e a já cumprida de antes não festeja de novo', () => {
    const q = quadro([FACIL.meta, 0, 0]);
    expect(avisosDeMissao(q, q, [])).toEqual([]);
  });

  it('sem o quadro de antes, toda missão com progresso aparece; quadro de outro dia conta como zerado', () => {
    const depois = quadro([1, 0, 0]);
    const semAntes = avisosDeMissao(null, depois, []);
    const ontem = avisosDeMissao(quadro([1, 0, 0], '2026-10-25', FIM - 86_400_000), depois, []);
    expect(ontem).toEqual(semAntes);
    expect(semAntes.map((x) => x.id)).toEqual([FACIL.id]);
  });
});
