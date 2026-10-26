import { describe, expect, it } from 'vitest';
import { RastroDaConexao } from './rastro';

function rastro() {
  let agora = 5_000;
  const r = new RastroDaConexao(() => agora);
  return { r, avancar: (ms: number) => (agora += ms) };
}

describe('RastroDaConexao — o que a sala registra de uma conexão que caiu', () => {
  it('sem causa anotada, quem encerrou foi o cliente ou a rede', () => {
    const { r, avancar } = rastro();
    avancar(12_345);
    expect(r.saida(1006, '', 0)).toEqual({ codigo: 1006, motivo: '', duracaoMs: 12_345, origem: 'cliente-ou-rede', presosNoEnvio: 0, silencioMs: 12_345 });
  });

  it('o silêncio conta desde o último sinal do cliente (mensagem ou pong), não desde o início', () => {
    const { r, avancar } = rastro();
    avancar(10_000);
    r.sinal();
    avancar(26_000);
    expect(r.saida(1006, '', 0)).toMatchObject({ duracaoMs: 36_000, silencioMs: 26_000 });
  });

  it('a primeira causa anotada vale; as seguintes são consequência dela', () => {
    const { r } = rastro();
    r.encerrando('heartbeat', 0);
    r.encerrando('tolerancia', 0);
    expect(r.saida(1006, '', 0).origem).toBe('heartbeat');
  });

  it('cada causa do servidor aparece como é', () => {
    for (const origem of ['heartbeat', 'envio-lento', 'tolerancia'] as const) {
      const { r } = rastro();
      r.encerrando(origem, 0);
      expect(r.saida(1006, '', 0).origem).toBe(origem);
    }
  });

  it('presos no envio: o maior acúmulo visto (a leitura depois do fechamento costuma vir zerada)', () => {
    const { r } = rastro();
    r.amostrar(1_200);
    r.amostrar(300_000);
    r.encerrando('heartbeat', 5_000);
    expect(r.saida(1006, '', 0).presosNoEnvio).toBe(300_000);
    const { r: r2 } = rastro();
    expect(r2.saida(1001, '', 777).presosNoEnvio).toBe(777);
  });

  it('o motivo vira texto curto e seguro: UTF-8, sem controle, até 60 caracteres', () => {
    const { r } = rastro();
    expect(r.saida(1000, Buffer.from('tchau, até já'), 0).motivo).toBe('tchau, até já');
    expect(r.saida(1000, 'linha\nfalsa\u0000x', 0).motivo).toBe('linha falsa x');
    expect(r.saida(1000, 'm'.repeat(200), 0).motivo).toBe('m'.repeat(60));
    expect(r.saida(1000, Buffer.from([0xff, 0xfe, 0x41]), 0).motivo).toMatch(/A$/);
  });
});
