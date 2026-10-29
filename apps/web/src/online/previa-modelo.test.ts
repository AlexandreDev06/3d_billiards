import { describe, expect, it } from 'vitest';
import { CARA_NO_ATLAS } from '../baloes/rosto';
import { REACAO_PADRAO_DA_PREVIA, REACOES_DA_PREVIA, reacaoDaPrevia } from './previa-modelo';

describe('reações da prévia do Meu balão', () => {
  it('ids únicos, a padrão existe e cada cara é uma cara que o jogo conhece', () => {
    const ids = REACOES_DA_PREVIA.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(reacaoDaPrevia(REACAO_PADRAO_DA_PREVIA)).not.toBeNull();
    for (const r of REACOES_DA_PREVIA) expect(Object.keys(CARA_NO_ATLAS)).toContain(r.cara);
  });

  it('impaciente só vale com mirando, e o fim não mistura com mirando', () => {
    for (const r of REACOES_DA_PREVIA) {
      if (r.impaciente) expect(r.mirando).toBe(true);
      if (r.fim !== null) expect(r.mirando).toBe(false);
    }
  });

  it('id desconhecido devolve null', () => {
    expect(reacaoDaPrevia('nao-existe')).toBeNull();
  });
});
