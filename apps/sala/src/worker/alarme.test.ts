/** O alarm que segura o objeto na memória enquanto há sala (L41b), com relógio e `storage` falsos. */
import { describe, expect, it } from 'vitest';
import { AlarmeDaSala } from './alarme';

function montar(intervaloMs = 45_000) {
  let agora = 1_000_000;
  let salas = 0;
  const armados: number[] = [];
  let desarmados = 0;
  let falhar: Error | null = null;
  const logs: string[] = [];
  const alarme = new AlarmeDaSala({
    intervaloMs,
    relogio: () => agora,
    salasAbertas: () => salas,
    armar: async (quando) => {
      if (falhar) throw falhar;
      armados.push(quando);
    },
    desarmar: async () => void desarmados++,
    log: (evento, campos = {}) => void logs.push(`${evento} ${JSON.stringify(campos)}`),
  });
  return {
    alarme,
    armados,
    logs,
    desarmados: () => desarmados,
    salas: (n: number) => void (salas = n),
    avancar: (ms: number) => void (agora += ms),
    agora: () => agora,
    falhar: (e: Error | null) => void (falhar = e),
  };
}

describe('AlarmeDaSala: só há alarm com sala aberta', () => {
  it('sem sala nada é armado, por mais mensagens que cheguem', async () => {
    const m = montar();
    for (let i = 0; i < 5; i++) await m.alarme.aoHaverSala();
    expect(m.armados).toEqual([]);
    expect(m.alarme.proximoEm).toBeNull();
  });

  it('a primeira sala arma o alarm para daqui a `intervaloMs`; as mensagens seguintes não regravam (cada setAlarm é uma linha escrita)', async () => {
    const m = montar();
    m.salas(1);
    await m.alarme.aoHaverSala();
    await m.alarme.aoHaverSala();
    m.avancar(10_000);
    await m.alarme.aoHaverSala();
    expect(m.armados).toEqual([1_045_000]);
    expect(m.alarme.proximoEm).toBe(1_045_000);
  });

  it('ao disparar com sala aberta, rearma para daqui a `intervaloMs`, e assim por diante', async () => {
    const m = montar();
    m.salas(1);
    await m.alarme.aoHaverSala();
    for (let i = 0; i < 3; i++) {
      m.avancar(45_000);
      await m.alarme.aoDisparar();
    }
    expect(m.armados).toEqual([1_045_000, 1_090_000, 1_135_000, 1_180_000]);
    expect(m.alarme.disparos).toBe(3);
  });

  it('ao disparar sem sala (a última fechou, ou o objeto acordou despejado), deixa morrer: nada de rearmar', async () => {
    const m = montar();
    m.salas(1);
    await m.alarme.aoHaverSala();
    m.salas(0);
    m.avancar(45_000);
    await m.alarme.aoDisparar();
    expect(m.armados).toEqual([1_045_000]);
    expect(m.alarme.proximoEm).toBeNull();
    expect(m.alarme.disparos).toBe(1);
    // e uma sala nova depois arma de novo
    m.salas(1);
    await m.alarme.aoHaverSala();
    expect(m.armados).toHaveLength(2);
  });

  it('quando a última sala fecha, o alarm de sobra sai (acordaria à toa um objeto que dorme); sem alarm armado não faz nada', async () => {
    const m = montar();
    await m.alarme.aoFicarSemSala();
    expect(m.desarmados()).toBe(0);

    m.salas(1);
    await m.alarme.aoHaverSala();
    await m.alarme.aoFicarSemSala();
    expect(m.desarmados()).toBe(0); // ainda há sala

    m.salas(0);
    await m.alarme.aoFicarSemSala();
    await m.alarme.aoFicarSemSala();
    expect(m.desarmados()).toBe(1);
    expect(m.alarme.proximoEm).toBeNull();
  });

  it('o intervalo vem da config', async () => {
    const m = montar(30_000);
    m.salas(1);
    await m.alarme.aoHaverSala();
    expect(m.alarme.proximoEm).toBe(m.agora() + 30_000);
  });
});

describe('AlarmeDaSala: quando gravar o alarm falha', () => {
  it('ao armar pela mensagem, loga e deixa a próxima mensagem tentar de novo', async () => {
    const m = montar();
    m.salas(1);
    m.falhar(new Error('storage fora'));
    await m.alarme.aoHaverSala();
    expect(m.alarme.proximoEm).toBeNull();
    expect(m.logs).toEqual(['erro-interno {"tipo":"alarme-armar","erro":"storage fora"}']);
    m.falhar(null);
    await m.alarme.aoHaverSala();
    expect(m.armados).toHaveLength(1);
  });

  it('ao rearmar no disparo, a exceção sobe para o runtime repetir o `alarm()` com espera crescente', async () => {
    const m = montar();
    m.salas(1);
    await m.alarme.aoHaverSala();
    m.falhar(new Error('storage fora'));
    await expect(m.alarme.aoDisparar()).rejects.toThrow('storage fora');
    expect(m.alarme.proximoEm).toBeNull();
    // o runtime tenta de novo e agora grava
    m.falhar(null);
    await m.alarme.aoDisparar();
    expect(m.alarme.proximoEm).not.toBeNull();
  });
});
