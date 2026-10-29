/** A configuração do núcleo lida do `env` do Worker (os `vars` e os `secrets` do Wrangler). */
import { describe, expect, it } from 'vitest';
import { CONFIG_NUCLEO_PADRAO } from '../config-nucleo';
import { PADRAO_DO_WORKER, configDoWorker } from './config-do-env';

describe('configDoWorker', () => {
  it('sem variáveis é o padrão do núcleo, mas sem a lista de origens da sala Node (só o endereço do próprio Worker vale) e com os limites do Worker', () => {
    const c = configDoWorker({});
    expect(c).toEqual({
      ...CONFIG_NUCLEO_PADRAO,
      origensPermitidas: [],
      maxConexoesPorIp: 6,
      mensagensPorIp: { capacidade: 1500, porSegundo: 12 },
      alarmeMs: 45_000,
    });
    expect(CONFIG_NUCLEO_PADRAO.origensPermitidas.length).toBeGreaterThan(0);
  });

  it('o Worker aceita menos conexões por IP do que a sala Node (que segue com 12)', () => {
    expect(CONFIG_NUCLEO_PADRAO.maxConexoesPorIp).toBe(12);
    expect(configDoWorker({}).maxConexoesPorIp).toBe(PADRAO_DO_WORKER.maxConexoesPorIp);
    expect(PADRAO_DO_WORKER.maxConexoesPorIp).toBeLessThan(CONFIG_NUCLEO_PADRAO.maxConexoesPorIp);
  });

  it('as variáveis do Worker: conexões por IP, a cota de mensagens por IP (rajada e ritmo) e o intervalo do alarm', () => {
    const c = configDoWorker({ MAX_CONEXOES_POR_IP: '3', MENSAGENS_POR_IP: '60', MENSAGENS_POR_IP_S: '2', ALARME_S: '30' });
    expect(c.maxConexoesPorIp).toBe(3);
    expect(c.mensagensPorIp).toEqual({ capacidade: 60, porSegundo: 2 });
    expect(c.alarmeMs).toBe(30_000);
    for (const [chave, valor] of [['MAX_CONEXOES_POR_IP', '0'], ['MENSAGENS_POR_IP', 'x'], ['MENSAGENS_POR_IP_S', '0'], ['ALARME_S', '61'], ['ALARME_S', '0']] as const)
      expect(() => configDoWorker({ [chave]: valor }), `${chave}=${valor}`).toThrow(new RegExp(chave));
  });

  it('o alarm padrão fica abaixo dos 70 s do despejo mais cedo, com folga', () => {
    expect(PADRAO_DO_WORKER.alarmeMs).toBeLessThanOrEqual(60_000);
    expect(70_000 - PADRAO_DO_WORKER.alarmeMs).toBeGreaterThanOrEqual(20_000);
  });

  it('as mesmas variáveis da sala Node, em texto, valem', () => {
    const c = configDoWorker({
      MAX_SALAS: '7',
      MAX_CONEXOES: '33',
      MAX_CARTEIRAS: '123',
      MISSOES_DIARIAS: '0',
      ORIGENS: 'https://a.exemplo, https://b.exemplo',
      PRESENTE_DE_TESTE: '10000',
      PRESENTE_DE_TESTE_ROTULO: 'skins-cs',
    });
    expect(c.maxSalas).toBe(7);
    expect(c.maxConexoes).toBe(33);
    expect(c.maxCarteiras).toBe(123);
    expect(c.missoesDiarias).toBe(false);
    expect(c.origensPermitidas).toEqual(['https://a.exemplo', 'https://b.exemplo']);
    expect(c.presenteDeTeste).toEqual({ valor: 10_000, rotulo: 'skins-cs' });
  });

  it('o que não é texto (a ligação do Durable Object, os assets) não é variável e é ignorado', () => {
    const c = configDoWorker({ SALA: { idFromName: () => 1 }, ASSETS: { fetch: () => 1 }, MAX_SALAS: 99 });
    expect(c.maxSalas).toBe(CONFIG_NUCLEO_PADRAO.maxSalas);
  });

  it('valor ruim lança com o nome da variável, e presente sem rótulo não sobe', () => {
    expect(() => configDoWorker({ MAX_SALAS: 'muitas' })).toThrow(/MAX_SALAS/);
    expect(() => configDoWorker({ MAX_CONEXOES: '0' })).toThrow(/MAX_CONEXOES/);
    expect(() => configDoWorker({ PRESENTE_DE_TESTE: '500' })).toThrow(/PRESENTE_DE_TESTE/);
    expect(() => configDoWorker({ PRESENTE_DE_TESTE: '500', PRESENTE_DE_TESTE_ROTULO: 'Rótulo Ruim!' })).toThrow(/PRESENTE_DE_TESTE_ROTULO/);
  });

  it('o segredo da administração não vira configuração do jogo', () => {
    const c = configDoWorker({ SEGREDO_ADMIN: 'um-segredo-bem-longo-mesmo' });
    expect(JSON.stringify(c)).not.toContain('um-segredo-bem-longo-mesmo');
  });
});
