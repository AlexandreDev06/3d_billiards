import { afterAll, describe, expect, it } from 'vitest';
import { equipeDoLugar } from '@sinuca/protocolo';
import { TACADA_FORTE, TACADA_MEDIA, tacadaDaVisao } from './para-testes';
import { AmbienteDeRede } from './para-testes-ws';

const rede = new AmbienteDeRede();
afterAll(() => rede.encerrar());

describe('2x1 pelo WebSocket real: física e regras de verdade, decodificador estrito dos dois lados', () => {
  it('três clientes jogam até seis tacadas; a partida (com o que as regras acrescentam) passa pelo esquema e os três acabam iguais', async () => {
    const s = await rede.subir();
    const ana = await rede.conectar(s, 'Ana');
    ana.criar('2x1');
    const { codigo } = await ana.esperarTipo('boas-vindas');
    const beto = await rede.conectar(s, 'Beto');
    beto.entrar(codigo);
    expect((await beto.esperarTipo('boas-vindas')).lugar).toBe(1);
    const cida = await rede.conectar(s, 'Cida');
    cida.entrar(codigo);
    expect((await cida.esperarTipo('boas-vindas')).lugar).toBe(2);
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[2]!.nome === 'Cida');

    ana.enviar({ tipo: 'iniciar' });
    const jogadores = [ana, beto, cida];
    await Promise.all(jogadores.map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    const inicio = ana.recebidas.find((m) => m.tipo === 'retrato')!;
    expect(inicio.partida.jogadores.map((j) => `${j.id}:${j.equipe}`)).toEqual(['lugar-0:0', 'lugar-1:1', 'lugar-2:0']);

    const vezes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const estado = ana.ultimoEstado!;
      expect(estado.seq).toBe(i);
      vezes.push(estado.vez!);
      const quem = jogadores[estado.vez!]!;
      quem.enviar(tacadaDaVisao(quem.visao!, i === 0 ? TACADA_FORTE : TACADA_MEDIA, 50 + i));
      await Promise.all(jogadores.map((c) => c.esperar((m) => m.tipo === 'estado-sala' && m.seq === i + 1)));
      if (ana.ultimoEstado!.vez === null) break;
    }

    expect(vezes[0]).toBe(0);
    expect(new Set(vezes).size, `vezes ${vezes}`).toBeGreaterThan(1);
    vezes.slice(1).forEach((v, i) => {
      if (v !== vezes[i]) expect(equipeDoLugar(v)).not.toBe(equipeDoLugar(vezes[i]!));
    });
    expect(ana.visao).toEqual(beto.visao);
    expect(ana.visao).toEqual(cida.visao);
    expect(ana.visao!.seq).toBe(vezes.length);
    for (const c of jogadores) {
      expect(c.invalidas).toEqual([]);
      expect(c.recebidas.filter((m) => m.tipo === 'erro')).toEqual([]);
    }
  });
});
