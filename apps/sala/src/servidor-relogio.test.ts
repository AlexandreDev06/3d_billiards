import { afterAll, describe, expect, it } from 'vitest';
import { AmbienteDeRede } from './para-testes-ws';

const rede = new AmbienteDeRede();
afterAll(() => rede.encerrar());

/** Servidor com relógio manual; o tick automático fica fora do caminho (1 h), o teste chama `registro.tick()`. */
async function subir() {
  let agora = 3_000_000;
  const logs: string[] = [];
  const s = await rede.subir(
    { tickMs: 3_600_000 },
    { relogio: () => agora, registro: { relogio: () => agora }, log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`) },
  );
  return { s, logs, avancar: (ms: number) => (agora += ms) };
}

describe('relógio e diagnóstico no fio real', () => {
  it('o tempo escolhido, o prazo e o aviso de tempo esgotado passam pelo decodificador estrito dos dois lados', async () => {
    const { s, avancar } = await subir();
    const ana = await rede.conectar(s, 'Ana');
    ana.criar('1x1', { tempoS: 15 });
    const { codigo } = await ana.esperarTipo('boas-vindas');
    const beto = await rede.conectar(s, 'Beto');
    beto.entrar(codigo);
    await beto.esperarTipo('boas-vindas');
    ana.enviar({ tipo: 'iniciar' });
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.fase === 'jogando');
    await beto.esperar((m) => m.tipo === 'retrato');

    expect(ana.ultimoEstado).toMatchObject({ relogio: { tempoS: 15, aoEsgotar: 'perde-a-vez' }, prazoMs: 15_000, vez: 0 });

    avancar(16_500);
    s.registro.tick();
    for (const c of [ana, beto]) {
      const aviso = await c.esperarTipo('tempo-esgotado');
      expect(aviso).toEqual({ tipo: 'tempo-esgotado', lugar: 0, proximo: 1, motivo: 'tempo', consequencia: 'perde-a-vez' });
      await c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'vez-passou');
      expect(c.ultimoEstado).toMatchObject({ vez: 1, prazoMs: 15_000 });
      expect(c.invalidas).toEqual([]);
    }
  });

  it("criar a sala com aoEsgotar 'falta' leva erro claro pelo fio, e a conexão continua", async () => {
    const { s } = await subir();
    const ana = await rede.conectar(s, 'Ana');
    ana.criar('1x1', { aoEsgotar: 'falta' });
    const erro = await ana.esperarTipo('erro');
    expect(erro.codigo).toBe('regras-invalidas');
    expect(erro.mensagem).toMatch(/falta/i);
    expect(ana.fechou).toBeNull();
  });

  it('diagnostico válido vai para o log; acima de 1 KB é recusado como mensagem grande sem derrubar a conexão', async () => {
    const { s, logs } = await subir();
    const ana = await rede.conectar(s, 'Ana');
    ana.criar();
    await ana.esperarTipo('boas-vindas');
    const diag = { tipo: 'diagnostico', fpsMedio: 55, piorQuadroMs: 90, qualidade: 'media', gpu: 'Mesa Intel(R) UHD Graphics 620' } as const;
    ana.enviar(diag);
    ana.enviar(diag); // dentro da janela de 30 s: descartado
    ana.enviarBruto(JSON.stringify({ ...diag, fpsMedio: 1 }) + ' '.repeat(1100));
    const erro = await ana.esperarTipo('erro');
    expect(erro.codigo).toBe('mensagem-grande');
    expect(ana.fechou).toBeNull();
    const linhas = logs.filter((l) => l.startsWith('diagnostico '));
    expect(linhas).toHaveLength(1);
    expect(JSON.parse(linhas[0]!.slice('diagnostico '.length))).toMatchObject({ nome: 'Ana', lugar: 0, fps: 55, piorQuadroMs: 90, qualidade: 'media' });
  });
});
