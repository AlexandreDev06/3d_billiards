import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { SINAIS_DE_ENCERRAMENTO, ligarEncerramento } from './encerramento';

function montar(fechar: () => Promise<void> = async () => {}) {
  const processo = new EventEmitter();
  const saidas: number[] = [];
  const logs: string[] = [];
  let fechamentos = 0;
  ligarEncerramento(
    processo,
    async () => {
      fechamentos++;
      await fechar();
    },
    (codigo) => saidas.push(codigo),
    (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
  );
  return { processo, saidas, logs, fechamentos: () => fechamentos };
}

const naFila = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('encerramento do processo', () => {
  it('SIGINT, SIGTERM e SIGHUP (terminal fechado) descarregam como o servidor sabe fechar', async () => {
    expect([...SINAIS_DE_ENCERRAMENTO].sort()).toEqual(['SIGHUP', 'SIGINT', 'SIGTERM']);
    for (const sinal of SINAIS_DE_ENCERRAMENTO) {
      const t = montar();
      t.processo.emit(sinal);
      await naFila();
      expect(t.fechamentos(), sinal).toBe(1);
      expect(t.saidas, sinal).toEqual([0]);
      expect(t.logs.some((l) => l.startsWith('servidor-encerrando') && l.includes(sinal)), sinal).toBe(true);
    }
  });

  it('só fecha uma vez, mesmo com vários sinais seguidos, e só sai depois de fechar', async () => {
    let liberar!: () => void;
    const t = montar(() => new Promise<void>((resolve) => (liberar = resolve)));
    t.processo.emit('SIGHUP');
    t.processo.emit('SIGTERM');
    t.processo.emit('SIGINT');
    await naFila();
    expect(t.fechamentos()).toBe(1);
    expect(t.saidas).toEqual([]);
    liberar();
    await naFila();
    expect(t.saidas).toEqual([0]);
  });

  it('se o fechamento falha, sai assim mesmo (não fica pendurado), com o erro no log e o código 1: as carteiras podem não ter chegado ao disco (L26)', async () => {
    const t = montar(() => Promise.reject(new Error('disco cheio')));
    t.processo.emit('SIGTERM');
    await naFila();
    expect(t.saidas).toEqual([1]);
    expect(t.logs.some((l) => l.startsWith('servidor-erro-ao-fechar') && l.includes('disco cheio'))).toBe(true);
  });
});
