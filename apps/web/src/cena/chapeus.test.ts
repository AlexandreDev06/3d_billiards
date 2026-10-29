import { describe, expect, it } from 'vitest';
import { CarregadorDeChapeus } from './chapeus';

const base = { ids: ['cartola'] } as never;

/** Um relógio na mão: só anda quando o teste manda. */
const relogio = () => {
  let agora = 0;
  return { agora: () => agora, avancar: (ms: number) => (agora += ms) };
};

describe('CarregadorDeChapeus (o chapeus.glb só carrega quando alguém precisa)', () => {
  it('nada baixa sozinho: sem pedir, o carregador nem foi chamado', () => {
    let chamadas = 0;
    const c = new CarregadorDeChapeus(async () => { chamadas++; return base; }, 15_000, relogio().agora);
    expect(chamadas).toBe(0);
    expect(c.base).toBeNull();
    expect(c.estado).toBe('parado');
  });

  it('pedir baixa uma vez só, mesmo com pedidos repetidos a cada quadro, e avisa quando chega', async () => {
    let chamadas = 0;
    const c = new CarregadorDeChapeus(async () => { chamadas++; return base; }, 15_000, relogio().agora);
    const avisos: unknown[] = [];
    c.aoChegar((b) => avisos.push(b));
    c.pedir();
    c.pedir();
    c.pedir();
    expect(chamadas).toBe(1);
    expect(c.estado).toBe('carregando');
    await Promise.resolve();
    await Promise.resolve();
    expect(c.base).toBe(base);
    expect(c.estado).toBe('pronto');
    expect(avisos).toEqual([base]);
    c.pedir();
    expect(chamadas).toBe(1);
  });

  it('quem se registra depois de o arquivo chegar também é avisado', async () => {
    const c = new CarregadorDeChapeus(async () => base, 15_000, relogio().agora);
    c.pedir();
    await Promise.resolve();
    await Promise.resolve();
    const avisos: unknown[] = [];
    c.aoChegar((b) => avisos.push(b));
    expect(avisos).toEqual([base]);
  });

  it('falhar não derruba nada: avisa uma vez no console, não martela o servidor e tenta de novo depois do prazo', async () => {
    const r = relogio();
    let chamadas = 0;
    const falhas: string[] = [];
    const c = new CarregadorDeChapeus(
      async () => {
        chamadas++;
        if (chamadas === 1) throw new Error('rede fora');
        return base;
      },
      15_000,
      r.agora,
      (m) => falhas.push(m),
    );
    c.pedir();
    await Promise.resolve();
    await Promise.resolve();
    expect(c.estado).toBe('falhou');
    expect(c.base).toBeNull();
    expect(falhas).toHaveLength(1);
    expect(falhas[0]).toContain('rede fora');
    // antes do prazo, pedir de novo não vai à rede
    r.avancar(14_000);
    c.pedir();
    expect(chamadas).toBe(1);
    r.avancar(2_000);
    c.pedir();
    expect(chamadas).toBe(2);
    await Promise.resolve();
    await Promise.resolve();
    expect(c.estado).toBe('pronto');
    expect(c.base).toBe(base);
  });

  it('quem se registrou pode sair (a prévia do editor abre e fecha): não recebe o arquivo depois', async () => {
    const c = new CarregadorDeChapeus(async () => base, 15_000, relogio().agora);
    const recebidos: string[] = [];
    const sair = c.aoChegar(() => recebidos.push('a'));
    c.aoChegar(() => recebidos.push('b'));
    sair();
    c.pedir();
    await Promise.resolve();
    await Promise.resolve();
    expect(recebidos).toEqual(['b']);
  });
});
