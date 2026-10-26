import { describe, expect, it } from 'vitest';
import type { MsgDiagnostico } from '@sinuca/protocolo';
import { CONFIG_SALA_PADRAO } from './config';
import { ClienteDeTeste, criarAmbiente, salaIniciada } from './para-testes';

const diag: MsgDiagnostico = {
  tipo: 'diagnostico',
  fpsMedio: 41.5,
  piorQuadroMs: 380,
  qualidade: 'alta',
  gpu: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620)',
  memoriaMb: 212.4,
};

const linhasDeDiagnostico = (logs: readonly string[]) => logs.filter((l) => l.startsWith('diagnostico '));
const campos = (linha: string): Record<string, unknown> => JSON.parse(linha.slice(linha.indexOf(' ') + 1)) as Record<string, unknown>;

describe('diagnóstico do cliente — vai para o log com apelido e lugar', () => {
  it('registra as medidas com o código da sala, o apelido e o lugar', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    beto.enviar(diag);
    const linhas = linhasDeDiagnostico(amb.logs);
    expect(linhas).toHaveLength(1);
    expect(campos(linhas[0]!)).toEqual({
      sala: ana.codigo,
      nome: 'Beto',
      lugar: 1,
      fps: 41.5,
      piorQuadroMs: 380,
      qualidade: 'alta',
      gpu: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620)',
      memoriaMb: 212.4,
    });
  });

  it('sem a memória (o navegador não informa) a linha não leva o campo', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const semMemoria = Object.fromEntries(Object.entries(diag).filter(([chave]) => chave !== 'memoriaMb')) as unknown as MsgDiagnostico;
    ana.enviar(semMemoria);
    expect(campos(linhasDeDiagnostico(amb.logs)[0]!)).not.toHaveProperty('memoriaMb');
  });

  it('espectador tem lugar nulo, e na espera também vale', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    expect(esp.lugar).toBeNull();
    esp.enviar(diag);
    expect(campos(linhasDeDiagnostico(amb.logs)[0]!)).toMatchObject({ nome: 'Esp', lugar: null });
  });

  it('nunca grava IP nem token, e não responde nada a quem mandou', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const token = ana.token;
    ana.conn.limpar();
    beto.conn.limpar();
    ana.enviar(diag);
    const tudo = amb.logs.join('\n');
    expect(tudo).not.toContain(ana.conn.ip);
    expect(tudo).not.toContain(token);
    expect(ana.conn.recebidas).toEqual([]);
    expect(beto.conn.recebidas).toEqual([]);
    expect(ana.conn.punicoes).toEqual([]);
  });

  it('fora de uma sala é o erro de sempre', () => {
    const amb = criarAmbiente();
    const solto = new ClienteDeTeste(amb, 'Solto');
    solto.enviar(diag);
    expect(solto.ultimoErro?.codigo).toBe('fora-da-sala');
    expect(linhasDeDiagnostico(amb.logs)).toHaveLength(0);
  });
});

describe('diagnóstico do cliente — no máximo um a cada 30 s por conexão', () => {
  const INTERVALO = 30_000;

  it('o segundo dentro da janela é descartado em silêncio: sem log, sem erro, sem punição', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(diag);
    amb.avancar(INTERVALO - 1);
    ana.conn.limpar();
    ana.enviar(diag);
    expect(linhasDeDiagnostico(amb.logs)).toHaveLength(1);
    expect(ana.erros).toHaveLength(0);
    expect(ana.conn.punicoes).toEqual([]);
  });

  it('passados 30 s volta a valer', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(diag);
    amb.avancar(INTERVALO);
    ana.enviar({ ...diag, fpsMedio: 12 });
    const linhas = linhasDeDiagnostico(amb.logs);
    expect(linhas).toHaveLength(2);
    expect(campos(linhas[1]!)).toMatchObject({ fps: 12 });
  });

  it('o descartado não adia a janela: conta a partir do último aceito', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(diag);
    amb.avancar(15_000);
    ana.enviar(diag); // descartado
    amb.avancar(15_000);
    ana.enviar(diag); // 30 s do primeiro
    expect(linhasDeDiagnostico(amb.logs)).toHaveLength(2);
  });

  it('a janela é de cada conexão: o outro jogador manda no mesmo instante e quem reconecta manda de novo', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar(diag);
    beto.enviar(diag);
    expect(linhasDeDiagnostico(amb.logs)).toHaveLength(2);
    ana.sair();
    ana.reconectar();
    ana.enviar(diag);
    expect(linhasDeDiagnostico(amb.logs)).toHaveLength(3);
  });

  it('a sala ociosa some mesmo que os clientes continuem mandando diagnóstico (não é atividade de gente)', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const { salaOciosaMs } = CONFIG_SALA_PADRAO;
    for (let t = 0; t < salaOciosaMs; t += INTERVALO) {
      ana.enviar(diag);
      amb.avancar(Math.min(INTERVALO, salaOciosaMs - t));
    }
    expect(amb.registro.totalSalas).toBe(0);
    expect(ana.conn.fechada?.codigo).toBe(4001);
  });
});
