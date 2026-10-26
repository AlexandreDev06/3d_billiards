import { describe, expect, it } from 'vitest';
import { LogDeChat } from './chat-modelo';

describe('LogDeChat', () => {
  it('fechado, mostra só o que chegou há pouco; aberto, o histórico', () => {
    const log = new LogDeChat({ guardar: 10, visivelMs: 1000 });
    log.adicionar('Ana', 'oi', 0, 0);
    log.adicionar('Beto', 'e aí', 1, 900);
    expect(log.visiveis(1000, false, 10).map((l) => l.texto)).toEqual(['e aí']);
    expect(log.visiveis(1000, true, 10).map((l) => l.texto)).toEqual(['oi', 'e aí']);
    expect(log.visiveis(5000, false, 10)).toEqual([]);
  });

  it('mostra no máximo as últimas N e guarda no máximo `guardar`', () => {
    const log = new LogDeChat({ guardar: 3, visivelMs: 1000 });
    for (let i = 0; i < 5; i++) log.adicionar('Ana', String(i), 0, i);
    expect(log.quantidade).toBe(3);
    expect(log.visiveis(10, true, 2).map((l) => l.texto)).toEqual(['3', '4']);
  });

  it('avisos de presença entram marcados como aviso, com id crescente', () => {
    const log = new LogDeChat();
    const a = log.adicionar('', 'Beto caiu', null, 0, true);
    const b = log.adicionar('Ana', 'vamos', 0, 1);
    expect(a.aviso).toBe(true);
    expect(b.aviso).toBe(false);
    expect(b.id).toBeGreaterThan(a.id);
    log.limpar();
    expect(log.quantidade).toBe(0);
  });
});
