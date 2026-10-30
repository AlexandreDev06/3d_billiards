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

describe('AlarmeDaSala: a caixa de saída do saldo (L57)', () => {
  function comCaixa(intervaloMs = 45_000) {
    let agora = 1_000_000;
    let salas = 0;
    let caixa: number | null = null;
    const armados: number[] = [];
    let desarmados = 0;
    let drenadas = 0;
    let drenar: () => Promise<void> = async () => void drenadas++;
    const alarme = new AlarmeDaSala({
      intervaloMs,
      relogio: () => agora,
      salasAbertas: () => salas,
      armar: async (quando) => void armados.push(quando),
      desarmar: async () => void desarmados++,
      log: () => {},
      proximaDaCaixa: () => caixa,
      drenarCaixa: () => drenar(),
    });
    return {
      alarme,
      armados,
      desarmados: () => desarmados,
      drenadas: () => drenadas,
      salas: (n: number) => void (salas = n),
      caixa: (quando: number | null) => void (caixa = quando),
      aoDrenar: (f: () => Promise<void>) => void (drenar = f),
      avancar: (ms: number) => void (agora += ms),
      agora: () => agora,
    };
  }

  it('sem sala, a caixa cheia arma o alarm para a próxima tentativa dela', async () => {
    const m = comCaixa();
    m.caixa(m.agora() + 5000);
    await m.alarme.aoHaverSala();
    expect(m.armados).toEqual([m.agora() + 5000]);
  });

  it('o próximo alarm é o menor entre o tique da sala e a tentativa da caixa, e nunca adia um alarm já armado', async () => {
    const m = comCaixa();
    m.salas(1);
    await m.alarme.aoHaverSala();
    expect(m.armados).toEqual([m.agora() + 45_000]);
    m.caixa(m.agora() + 5000); // antes do tique: adianta
    await m.alarme.aoHaverSala();
    expect(m.armados.at(-1)).toBe(m.agora() + 5000);
    m.caixa(m.agora() + 300_000); // depois do que já está armado: não mexe
    await m.alarme.aoHaverSala();
    expect(m.armados).toHaveLength(2);
  });

  it('cada disparo começa mandando a caixa ao Banco e rearma pelo menor dos dois', async () => {
    const m = comCaixa();
    m.salas(1);
    m.caixa(m.agora() + 100);
    await m.alarme.aoHaverSala();
    m.avancar(100);
    m.aoDrenar(async () => void m.caixa(m.agora() + 10_000)); // a passada falhou: tenta de novo daqui a 10 s
    await m.alarme.aoDisparar();
    expect(m.armados.at(-1)).toBe(m.agora() + 10_000);
    // a caixa esvaziou: volta ao tique da sala
    m.aoDrenar(async () => void m.caixa(null));
    await m.alarme.aoDisparar();
    expect(m.armados.at(-1)).toBe(m.agora() + 45_000);
  });

  it('sem sala, a caixa vazia deixa o alarm morrer no disparo, e a caixa com o que enviar o mantém', async () => {
    const m = comCaixa();
    m.caixa(m.agora() + 5000);
    await m.alarme.aoHaverSala();
    m.avancar(5000);
    m.aoDrenar(async () => void m.caixa(m.agora() + 20_000));
    await m.alarme.aoDisparar();
    expect(m.alarme.proximoEm).toBe(m.agora() + 20_000);
    m.aoDrenar(async () => void m.caixa(null));
    m.avancar(20_000);
    await m.alarme.aoDisparar();
    expect(m.alarme.proximoEm).toBeNull();
  });

  it('a última sala fechar não desarma o alarm que a caixa ainda pede', async () => {
    const m = comCaixa();
    m.salas(1);
    await m.alarme.aoHaverSala();
    m.salas(0);
    m.caixa(m.agora() + 5000);
    await m.alarme.aoFicarSemSala();
    expect(m.desarmados()).toBe(0);
    m.caixa(null);
    await m.alarme.aoFicarSemSala();
    expect(m.desarmados()).toBe(1);
  });

  it('uma passada da caixa que lança não derruba o alarm', async () => {
    const m = comCaixa();
    m.salas(1);
    m.aoDrenar(async () => {
      throw new Error('boom');
    });
    await m.alarme.aoDisparar();
    expect(m.alarme.proximoEm).toBe(m.agora() + 45_000);
  });
});

describe('AlarmeDaSala: a varredura das contas excluídas (L61)', () => {
  function comVarredura() {
    let agora = 1_000_000;
    let varridas = 0;
    let falhar = false;
    const logs: string[] = [];
    const armados: number[] = [];
    const alarme = new AlarmeDaSala({
      intervaloMs: 45_000,
      relogio: () => agora,
      salasAbertas: () => 1,
      armar: async (quando) => void armados.push(quando),
      desarmar: async () => {},
      log: (evento, campos = {}) => void logs.push(`${evento} ${JSON.stringify(campos)}`),
      varrer: async () => {
        varridas++;
        if (falhar) throw new Error('varredura caiu');
      },
    });
    return { alarme, armados, logs, varridas: () => varridas, falhar: () => void (falhar = true), avancar: (ms: number) => void (agora += ms) };
  }

  it('cada disparo chama a varredura (ela mesma decide se já passou uma hora) e depois rearma', async () => {
    const m = comVarredura();
    await m.alarme.aoHaverSala();
    m.avancar(45_000);
    await m.alarme.aoDisparar();
    m.avancar(45_000);
    await m.alarme.aoDisparar();
    expect(m.varridas()).toBe(2);
    expect(m.armados).toHaveLength(3);
  });

  it('varredura que lança não impede o rearme e vai ao log sem dado pessoal', async () => {
    const m = comVarredura();
    m.falhar();
    await m.alarme.aoHaverSala();
    m.avancar(45_000);
    await expect(m.alarme.aoDisparar()).resolves.toBeUndefined();
    expect(m.armados).toHaveLength(2);
    expect(m.logs.some((l) => l.startsWith('erro-interno') && l.includes('alarme-varredura'))).toBe(true);
  });
});
