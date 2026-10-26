import { afterAll, describe, expect, it } from 'vitest';
import { AmbienteDeRede } from './para-testes-ws';

const rede = new AmbienteDeRede();
afterAll(() => rede.encerrar());

describe('2x1 e expulsar pelo WebSocket real (decodificador estrito dos dois lados)', () => {
  it('cria 2x1, o anfitrião expulsa o lugar 1: ele recebe expulso e a conexão fecha com 4002; o token velho é recusado e o link, sem token, entra como novo', async () => {
    const logs: string[] = [];
    const s = await rede.subir({}, { log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`) });
    const ana = await rede.conectar(s, 'Ana');
    ana.criar('2x1');
    const { codigo } = await ana.esperarTipo('boas-vindas');
    const beto = await rede.conectar(s, 'Beto');
    beto.entrar(codigo);
    const bvBeto = await beto.esperarTipo('boas-vindas');
    const cida = await rede.conectar(s, 'Cida');
    cida.entrar(codigo);
    expect((await cida.esperarTipo('boas-vindas')).lugar).toBe(2);
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[2]!.nome === 'Cida');
    expect(ana.ultimoEstado).toMatchObject({ modo: '2x1', fase: 'espera' });
    expect(ana.ultimoEstado!.lugares.map((l) => l.equipe)).toEqual([0, 1, 0, 1]);

    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    expect(await beto.esperarTipo('expulso')).toEqual({ tipo: 'expulso', motivo: 'anfitriao' });
    expect(await beto.esperarFechar()).toMatchObject({ codigo: 4002 });
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === null);
    await cida.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === null);

    // recarregar a página: conexão nova com o token velho
    const recarga = await rede.conectar(s, 'Beto');
    recarga.entrar(codigo, bvBeto.token);
    const erro = await recarga.esperarTipo('erro');
    expect(erro).toMatchObject({ codigo: 'token-invalido', mensagem: expect.stringContaining('removido') });
    expect(recarga.fechou).toBeNull();
    expect(recarga.boasVindas).toBeUndefined();

    // o cliente esquece o token e tenta de novo, pelo link: entrada nova
    recarga.entrar(codigo);
    const novo = await recarga.esperarTipo('boas-vindas');
    expect(novo).toMatchObject({ lugar: 1, anfitriao: false, codigo });
    expect(novo.token).not.toBe(bvBeto.token);
    await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto' && m.lugares[1]!.conectado);

    for (const c of [ana, beto, cida, recarga]) expect(c.invalidas).toEqual([]);
    const expulsos = logs.filter((l) => l.startsWith('expulso '));
    expect(expulsos).toHaveLength(1);
    expect(JSON.parse(expulsos[0]!.slice('expulso '.length))).toMatchObject({ nome: 'Beto', lugar: 1, por: 'Ana' });
    expect(logs.filter((l) => l.startsWith('saiu ') && l.includes('"Beto"') && l.includes('"lugar":1'))).toHaveLength(0);
    expect(logs.join('\n')).not.toContain(bvBeto.token);
    expect(logs.join('\n')).not.toContain('127.0.0.1');
  });

  it('convidado não expulsa: nao-anfitriao pelo fio, sem derrubar a conexão', async () => {
    const s = await rede.subir();
    const ana = await rede.conectar(s, 'Ana');
    ana.criar('1x1');
    const { codigo } = await ana.esperarTipo('boas-vindas');
    const beto = await rede.conectar(s, 'Beto');
    beto.entrar(codigo);
    await beto.esperarTipo('boas-vindas');
    beto.enviar({ tipo: 'expulsar', lugar: 0 });
    expect((await beto.esperarTipo('erro')).codigo).toBe('nao-anfitriao');
    expect(beto.fechou).toBeNull();
  });
});
