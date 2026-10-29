import { criarRng, mesaInicial, CONFIG_FISICA_PADRAO } from '@sinuca/fisica';
import { PRESET_TREINO, novaPartida } from '@sinuca/regras';
import { describe, expect, it } from 'vitest';
import { FOTOS_GUARDADAS, SessaoDeTreino } from './sessao-de-treino';

function umaMesa(semente: number) {
  const { partida, arrumacao } = novaPartida(PRESET_TREINO.regras, [{ id: 'j1', nome: 'Treino', equipe: 0 }], criarRng(semente));
  return { partida, mesa: mesaInicial(arrumacao, CONFIG_FISICA_PADRAO, criarRng(semente)) };
}

describe('SessaoDeTreino', () => {
  it('começa sem tacadas, mirando e sem o que refazer', () => {
    const s = new SessaoDeTreino();
    expect(s).toMatchObject({ tacadas: 0, modo: 'mirar', cenario: null, podeRefazer: false });
    expect(s.refazer()).toBeNull();
  });

  it('cada tacada conta uma e guarda a mesa de antes dela', () => {
    const s = new SessaoDeTreino();
    const a = umaMesa(1);
    const b = umaMesa(2);
    s.aoTacar(a.partida, a.mesa);
    s.aoTacar(b.partida, b.mesa);
    expect(s.tacadas).toBe(2);
    expect(s.podeRefazer).toBe(true);
  });

  it('refazer devolve a mesa de antes da última tacada e volta a conta, uma por vez', () => {
    const s = new SessaoDeTreino();
    const a = umaMesa(1);
    const b = umaMesa(2);
    s.aoTacar(a.partida, a.mesa);
    s.aoTacar(b.partida, b.mesa);
    const f2 = s.refazer()!;
    expect(f2.mesa).toBe(b.mesa);
    expect(f2.partida).toBe(b.partida);
    expect(s.tacadas).toBe(1);
    const f1 = s.refazer()!;
    expect(f1.mesa).toBe(a.mesa);
    expect(s.tacadas).toBe(0);
    expect(s.podeRefazer).toBe(false);
  });

  it('guarda só as últimas fotos', () => {
    const s = new SessaoDeTreino();
    const a = umaMesa(1);
    for (let i = 0; i < FOTOS_GUARDADAS + 5; i++) s.aoTacar(a.partida, a.mesa);
    let desfeitas = 0;
    while (s.refazer()) desfeitas++;
    expect(desfeitas).toBe(FOTOS_GUARDADAS);
    expect(s.tacadas).toBe(5);
  });

  it('recomeçar zera a conta, as fotos e o modo, e anota o cenário', () => {
    const s = new SessaoDeTreino();
    const a = umaMesa(1);
    s.aoTacar(a.partida, a.mesa);
    s.definirModo('arrumar');
    s.recomecar('tabelada');
    expect(s).toMatchObject({ tacadas: 0, modo: 'mirar', cenario: 'tabelada', podeRefazer: false });
    s.arrumouAMao();
    expect(s.cenario).toBeNull();
  });
});
