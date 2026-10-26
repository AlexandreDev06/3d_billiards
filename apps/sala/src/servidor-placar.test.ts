import { afterAll, describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import type { PlacarSala } from '@sinuca/protocolo';
import { TACADA_MEDIA } from './para-testes';
import { AmbienteDeRede, type ClienteWs } from './para-testes-ws';
import type { MotorDeRegras } from './regras';

const rede = new AmbienteDeRede();
afterAll(() => rede.encerrar());

const fim = (p: EstadoPartida, vencedor: 0 | 1): ResultadoRegras => ({
  partida: { ...p, fase: 'fim', vez: 1, vencedor, naMesa: p.naMesa.filter((b) => b !== 1) },
  consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1, vencedor, texto: 'fim' },
});

/** Regras reais para começar e uma tacada que acaba a partida para a equipe que o teste escolheu. */
function regrasQueAcabam() {
  const controle = { vencedor: 0 as 0 | 1 };
  const regras: MotorDeRegras = { novaPartida, aplicarTacada: (p) => fim(p, controle.vencedor) };
  return { controle, regras };
}

const resumo = (placar: PlacarSala | undefined): { atual: string | null; historico: string[] } => {
  const texto = (c: NonNullable<PlacarSala['atual']>): string => `${c.lados[0].nomes.join(' e ')} ${c.lados[0].vitorias} x ${c.lados[1].vitorias} ${c.lados[1].nomes.join(' e ')}`;
  return { atual: placar?.atual ? texto(placar.atual) : null, historico: (placar?.historico ?? []).map(texto) };
};

describe('placar pelo WebSocket real (decodificador estrito dos dois lados)', () => {
  it('duas partidas em 1x1, quem cai e volta recebe o placar, e mudar o modo abre o confronto novo; o log não leva IP', async () => {
    const logs: string[] = [];
    const { controle, regras } = regrasQueAcabam();
    const s = await rede.subir({}, { log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`), registro: { regras } });
    const ana = await rede.conectar(s, 'Ana');
    ana.criar('1x1');
    const { codigo } = await ana.esperarTipo('boas-vindas');
    const beto = await rede.conectar(s, 'Beto');
    beto.entrar(codigo);
    const bvBeto = await beto.esperarTipo('boas-vindas');
    const esp = await rede.conectar(s, 'Esp');
    esp.entrar(codigo);
    await esp.esperarTipo('boas-vindas');
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.espectadores === 1);
    for (const c of [ana, beto, esp]) expect((await c.esperarTipo('estado-sala')).placar).toEqual({ atual: null, historico: [] });

    const jogadores: Record<number, ClienteWs> = { 0: ana, 1: beto };
    /** Quem tem a vez taca e a partida acaba para a `equipe`; espera o estado com `n` partidas contadas chegar aos `quem`. */
    const acabar = async (equipe: 0 | 1, quem: ClienteWs[]) => {
      controle.vencedor = equipe;
      const vez = ana.ultimoEstado!.vez!;
      const jogador = jogadores[vez]!;
      const v = jogador.visao!;
      const antes = quem.map((c) => c.recebidas.filter((m) => m.tipo === 'estado-sala').length);
      jogador.enviar({ tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim(v.partida, equipe).partida, mesa: v.mesa });
      await Promise.all(quem.map((c, i) => c.esperar(() => c.recebidas.filter((m) => m.tipo === 'estado-sala').length > antes[i]! && c.ultimoEstado!.vez === null)));
    };

    ana.enviar({ tipo: 'iniciar' });
    await Promise.all([ana, beto, esp].map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    await acabar(0, [ana, beto, esp]);
    for (const c of [ana, beto, esp]) expect(resumo(c.ultimoEstado!.placar), c.nome).toEqual({ atual: 'Ana 1 x 0 Beto', historico: [] });
    // a tacada final e o estado com o placar chegam nessa ordem
    const tipos = esp.recebidas.map((m) => m.tipo);
    expect(tipos.lastIndexOf('tacada-retransmitida')).toBeLessThan(tipos.lastIndexOf('estado-sala'));

    ana.enviar({ tipo: 'voltar-ao-lobby' });
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.fase === 'espera');
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all([ana, beto].map((c) => c.esperar((m) => m.tipo === 'retrato' && c.recebidas.filter((x) => x.tipo === 'retrato').length >= 2)));
    await acabar(1, [ana, beto, esp]);
    for (const c of [ana, beto, esp]) expect(resumo(c.ultimoEstado!.placar), c.nome).toEqual({ atual: 'Ana 1 x 1 Beto', historico: [] });

    // o Beto perde a conexão e volta com o token: recebe o placar no estado da volta
    beto.derrubar();
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.conectado === false);
    const volta = await rede.conectar(s, 'Beto');
    volta.entrar(codigo, bvBeto.token);
    expect((await volta.esperarTipo('boas-vindas')).lugar).toBe(1);
    expect(resumo((await volta.esperarTipo('estado-sala')).placar)).toEqual({ atual: 'Ana 1 x 1 Beto', historico: [] });
    jogadores[1] = volta;

    // 2x1: a Cida entra, a formação muda e o confronto de antes vai para o histórico
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.fase === 'espera' && m.lugares[1]!.conectado);
    ana.enviar({ tipo: 'configurar-sala', modo: '2x1' });
    esp.enviar({ tipo: 'escolher-lugar', lugar: 2 });
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.modo === '2x1' && m.lugares[2]!.nome === 'Esp');
    jogadores[2] = esp;
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all([ana, volta, esp].map((c) => c.esperar((m) => m.tipo === 'retrato' && m.partida.jogadores.length === 3)));
    await acabar(0, [ana, volta, esp]);
    for (const c of [ana, volta, esp]) {
      expect(resumo(c.ultimoEstado!.placar), c.nome).toEqual({ atual: 'Ana e Esp 1 x 0 Beto', historico: ['Ana 1 x 1 Beto'] });
    }

    for (const c of [ana, beto, esp, volta]) {
      expect(c.invalidas, c.nome).toEqual([]);
      expect(c.recebidas.filter((m) => m.tipo === 'erro'), c.nome).toEqual([]);
    }
    const placares = logs.filter((l) => l.startsWith('placar '));
    expect(placares).toHaveLength(3);
    expect(JSON.parse(placares[2]!.slice('placar '.length))).toMatchObject({ venceu: 'Ana e Esp', ladoA: 'Ana e Esp', ladoB: 'Beto', novoConfronto: true, confrontos: 2 });
    expect(logs.join('\n')).not.toContain('127.0.0.1');
    expect(logs.join('\n')).not.toContain(bvBeto.token);
  });
});
