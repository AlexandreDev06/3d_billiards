import { isAbsolute, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONFIG_SALA_PADRAO, configDoAmbiente } from './config';

describe('configDoAmbiente', () => {
  it('sem variáveis usa o padrão: 8001, só em 127.0.0.1, tolerância da vez de 60 s', () => {
    const c = configDoAmbiente({});
    expect(c).toEqual(CONFIG_SALA_PADRAO);
    expect(c.porta).toBe(8001);
    expect(c.host).toBe('127.0.0.1');
    expect(c.toleranciaVezMs).toBe(60_000);
    expect(c.bytesPorMensagem).toBe(512 * 1024);
  });

  it('o relógio da tacada só começa 3,2 s depois da animação: a transição da falta do cliente (3,1 s) cabe inteira', () => {
    const { relogioTacada } = configDoAmbiente({});
    expect(relogioTacada.margemAnimacaoMs).toBe(3200);
    expect(relogioTacada.margemAnimacaoMs).toBeGreaterThanOrEqual(3100);
    expect(relogioTacada.tempoPadraoS).toBe(30);
  });

  it('lê PORT, HOST, PASTA_WEB e os limites numéricos', () => {
    const c = configDoAmbiente({ PORT: '9000', HOST: '0.0.0.0', PASTA_WEB: '/tmp/web', MAX_SALAS: '3', MAX_CONEXOES: '10', TOLERANCIA_VEZ_S: '5' });
    expect(c).toMatchObject({ porta: 9000, host: '0.0.0.0', pastaWeb: '/tmp/web', maxSalas: 3, maxConexoes: 10, toleranciaVezMs: 5000 });
  });

  it('origens: a lista padrão tem o ngrok do usuário, o localhost da sala e o Vite dev; ORIGENS troca tudo', () => {
    const c = configDoAmbiente({});
    expect(c.origensPermitidas).toEqual([
      'https://mayfly-one-mainly.ngrok-free.app',
      'http://localhost:8001',
      'http://127.0.0.1:8001',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
    ]);
    expect(configDoAmbiente({ ORIGENS: 'https://a.example, http://localhost:9000 ,' }).origensPermitidas).toEqual(['https://a.example', 'http://localhost:9000']);
    expect(() => configDoAmbiente({ ORIGENS: 'a.example' })).toThrow(/ORIGENS/);
    expect(() => configDoAmbiente({ ORIGENS: 'https://a.example/caminho' })).toThrow(/ORIGENS/);
  });

  it('defesas novas têm padrão: salas por IP, conexões novas por minuto, falhas por IP, sala vazia na espera', () => {
    const c = configDoAmbiente({});
    expect(c.maxSalasPorIp).toBe(3);
    expect(c.conexoesNovasPorIp).toEqual({ capacidade: 15, porSegundo: 15 / 60 });
    expect(c.falhasPorIp.capacidade).toBeGreaterThan(0);
    expect(c.salaVaziaEsperaMs).toBe(60_000);
    expect(c.bytesPorFicha).toBe(16 * 1024);
    expect(configDoAmbiente({ MAX_SALAS_POR_IP: '1' }).maxSalasPorIp).toBe(1);
  });

  it('recusa valor inválido dizendo qual variável', () => {
    for (const env of [
      { PORT: 'abc' }, { PORT: '0' }, { PORT: '70000' }, { MAX_SALAS: '-1' }, { MAX_SALAS: '1.5' }, { TOLERANCIA_VEZ_S: '' }, { MAX_SALAS_POR_IP: '0' },
      { MAX_CARTEIRAS: '0' }, { MAX_CARTEIRAS: 'muitas' }, { MAX_CARTEIRAS: '1000001' }, { PASTA_DADOS: '' }, { PASTA_DADOS: '   ' },
    ]) {
      expect(() => configDoAmbiente(env), JSON.stringify(env)).toThrow(/PORT|MAX_SALAS|TOLERANCIA_VEZ_S|MAX_SALAS_POR_IP|MAX_CARTEIRAS|PASTA_DADOS/);
    }
  });

  it('carteiras (L22): os dados ficam em apps/sala/dados, até 10 mil carteiras; PASTA_DADOS e MAX_CARTEIRAS trocam', () => {
    const c = configDoAmbiente({});
    expect(c.pastaDados.endsWith(join('apps', 'sala', 'dados'))).toBe(true);
    expect(isAbsolute(c.pastaDados)).toBe(true);
    expect(c.maxCarteiras).toBe(10_000);
    expect(configDoAmbiente({ PASTA_DADOS: '/var/sinuca', MAX_CARTEIRAS: '50' })).toMatchObject({ pastaDados: '/var/sinuca', maxCarteiras: 50 });
    expect(isAbsolute(configDoAmbiente({ PASTA_DADOS: 'dados-relativos' }).pastaDados)).toBe(true);
  });

  it('teto da vez apostada (L25): 2 minutos; TETO_DA_VEZ_APOSTADA_S troca; valor ruim diz qual variável', () => {
    expect(configDoAmbiente({}).tetoDaVezApostadaMs).toBe(120_000);
    expect(configDoAmbiente({ TETO_DA_VEZ_APOSTADA_S: '45' }).tetoDaVezApostadaMs).toBe(45_000);
    for (const bruto of ['', '0', '-3', '1.5', 'dois', '86401']) {
      expect(() => configDoAmbiente({ TETO_DA_VEZ_APOSTADA_S: bruto }), bruto).toThrow(/TETO_DA_VEZ_APOSTADA_S/);
    }
  });

  it('missões diárias (L31): ligadas por padrão; MISSOES_DIARIAS=0 desliga, 1 liga, outro valor diz qual variável', () => {
    expect(configDoAmbiente({}).missoesDiarias).toBe(true);
    expect(configDoAmbiente({ MISSOES_DIARIAS: '0' }).missoesDiarias).toBe(false);
    expect(configDoAmbiente({ MISSOES_DIARIAS: '1' }).missoesDiarias).toBe(true);
    for (const bruto of ['', 'sim', 'false', '2']) expect(() => configDoAmbiente({ MISSOES_DIARIAS: bruto }), bruto).toThrow(/MISSOES_DIARIAS/);
  });

  it('PASTA_DADOS relativa resolve a partir da pasta em que o processo roda (com o pnpm, apps/sala)', () => {
    expect(configDoAmbiente({ PASTA_DADOS: 'dados-relativos' }).pastaDados).toBe(join(process.cwd(), 'dados-relativos'));
  });

  it('a trava da pasta de dados espera até 10 s o servidor que está saindo (L25)', () => {
    expect(configDoAmbiente({}).carteira.esperaTravaMs).toBe(10_000);
  });

  it('limites do HTTP da carteira: poucas carteiras novas por hora por IP, e o resto por código, por IP e por falha', () => {
    const { carteira } = configDoAmbiente({});
    expect(carteira.criarPorIp).toEqual({ capacidade: 3, porSegundo: 3 / 3600 });
    expect(carteira).not.toHaveProperty('criarNoTotal'); // L26: o reaproveitamento cobre o teto; o balde global só servia para travar todo mundo
    expect(carteira.operacoesPorCarteira).toEqual({ capacidade: 20, porSegundo: 20 / 60 });
    expect(carteira.requisicoesPorIp).toEqual({ capacidade: 30, porSegundo: 30 / 60 });
    expect(carteira.falhasPorIp).toEqual({ capacidade: 10, porSegundo: 10 / 600 });
    expect(carteira.atrasoGravacaoMs).toBe(250);
    expect(carteira.tempoDoCorpoMs).toBe(5000);
  });
});
