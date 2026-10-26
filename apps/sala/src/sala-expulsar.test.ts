import { describe, expect, it } from 'vitest';
import { PROTOCOLO_VERSAO } from '@sinuca/protocolo';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { ClienteDeTeste, TACADA_MEDIA, criarAmbiente, salaIniciada, type Ambiente } from './para-testes';
import { FECHAMENTO } from './sala';

const nomesDosLugares = (c: ClienteDeTeste): (string | null)[] => c.estado.lugares.map((l) => l.nome);

/** Sala 2x2 na espera com os quatro lugares cheios e um espectador. */
function espera(modo: '1x1' | '2x1' | '2x2' = '2x2') {
  const amb = criarAmbiente();
  const ana = new ClienteDeTeste(amb, 'Ana').criar(modo);
  const outros = ['Beto', 'Cida', 'Davi'].map((n) => new ClienteDeTeste(amb, n).entrar(ana.codigo));
  const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
  const [beto, cida, davi] = outros as [ClienteDeTeste, ClienteDeTeste, ClienteDeTeste];
  return { amb, ana, beto, cida, davi, esp };
}

describe('expulsar — quem pode pedir, quando e quem', () => {
  it('só o anfitrião: convidado e espectador levam nao-anfitriao e ninguém sai', () => {
    const { ana, beto, cida, esp } = espera();
    beto.enviar({ tipo: 'expulsar', lugar: 2 });
    expect(beto.ultimoErro?.codigo).toBe('nao-anfitriao');
    esp.enviar({ tipo: 'expulsar', lugar: 1 });
    expect(esp.ultimoErro?.codigo).toBe('nao-anfitriao');
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', 'Cida', 'Davi']);
    expect(cida.conn.todas('expulso')).toHaveLength(0);
    expect(cida.conn.fechada).toBeNull();
  });

  it('só na espera: com a partida em andamento é fase-errada, e com ela terminada (antes de voltar ao lobby) também', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    expect(ana.ultimoErro?.codigo).toBe('fase-errada');
    expect(beto.conn.todas('expulso')).toHaveLength(0);
    expect(beto.conn.fechada).toBeNull();
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', null, null]);

    const fim = (p: EstadoPartida): ResultadoRegras => ({
      partida: { ...p, fase: 'fim', vencedor: 0 },
      consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1, vencedor: 0, texto: 'fim' },
    });
    const amb2 = criarAmbiente({}, { regras: { novaPartida, aplicarTacada: (p) => fim(p) } });
    const [ana2, beto2] = salaIniciada(amb2) as [ClienteDeTeste, ClienteDeTeste];
    const v = ana2.visao!;
    ana2.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim(v.partida).partida, mesa: v.mesa });
    expect(ana2.estado.vez).toBeNull();
    ana2.enviar({ tipo: 'expulsar', lugar: 1 });
    expect(ana2.ultimoErro?.codigo).toBe('fase-errada');
    expect(beto2.conn.fechada).toBeNull();
    ana2.enviar({ tipo: 'voltar-ao-lobby' });
    ana2.enviar({ tipo: 'expulsar', lugar: 1 });
    expect(beto2.conn.todas('expulso')).toHaveLength(1);
  });

  it('não a si mesmo: o lugar 0 é lugar-invalido, e o anfitrião segue na sala', () => {
    const { ana } = espera();
    ana.enviar({ tipo: 'expulsar', lugar: 0 });
    expect(ana.ultimoErro?.codigo).toBe('lugar-invalido');
    expect(ana.conn.fechada).toBeNull();
    expect(ana.conn.todas('expulso')).toHaveLength(0);
    expect(nomesDosLugares(ana)[0]).toBe('Ana');
  });

  it('lugar vago ou fora do modo é lugar-invalido, sem estado novo', () => {
    const { ana } = espera('1x1');
    ana.conn.limpar();
    ana.enviar({ tipo: 'expulsar', lugar: 2 });
    expect(ana.ultimoErro?.codigo).toBe('lugar-invalido');
    ana.enviar({ tipo: 'expulsar', lugar: 3 });
    expect(ana.erros).toHaveLength(2);
    expect(ana.conn.todas('estado-sala')).toHaveLength(0);

    const sala = espera('2x2');
    sala.beto.enviar({ tipo: 'escolher-lugar', lugar: null });
    sala.ana.enviar({ tipo: 'expulsar', lugar: 1 });
    expect(sala.ana.ultimoErro?.codigo).toBe('lugar-invalido');
    expect(sala.esp.conn.todas('expulso')).toHaveLength(0);
  });

  it('a recusa gasta a tolerância da conexão como as outras (nao-anfitriao e lugar-invalido pesam 1)', () => {
    const { ana, beto } = espera();
    beto.enviar({ tipo: 'expulsar', lugar: 2 });
    ana.enviar({ tipo: 'expulsar', lugar: 0 });
    expect(beto.conn.punicoes).toEqual([1]);
    expect(ana.conn.punicoes).toEqual([1]);
  });
});

describe('expulsar — o que acontece com o expulso e com a sala', () => {
  it('o expulso recebe expulso (motivo anfitriao) e a conexão fecha com o código 4002; nada depois', () => {
    const { ana, beto, cida } = espera();
    beto.conn.limpar();
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    expect(beto.conn.recebidas).toEqual([{ tipo: 'expulso', motivo: 'anfitriao' }]);
    expect(beto.conn.fechada).toEqual({ codigo: FECHAMENTO.expulso, motivo: expect.any(String) });
    expect(FECHAMENTO.expulso).toBe(4002);
    expect(cida.conn.fechada).toBeNull();
  });

  it('todos os que ficam (anfitrião, jogadores, espectador) recebem um estado-sala sem o expulso', () => {
    const { ana, beto, cida, davi, esp } = espera();
    for (const c of [ana, cida, davi, esp]) c.conn.limpar();
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    for (const c of [ana, cida, davi, esp]) {
      expect(c.conn.recebidas.map((m) => m.tipo)).toEqual(['estado-sala']);
      expect(nomesDosLugares(c)).toEqual(['Ana', null, 'Cida', 'Davi']);
      expect(c.estado.lugares[1]).toMatchObject({ nome: null, conectado: false, anfitriao: false });
      expect(c.estado).toMatchObject({ fase: 'espera', espectadores: 1 });
    }
    expect(beto.conn.todas('estado-sala').at(-1)!.lugares[1]!.nome).toBe('Beto'); // o estado de antes; nada novo foi para ele
  });

  it('o lugar vira vago na hora: o próximo que entrar fica com ele', () => {
    const { amb, ana, beto } = espera();
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    const novo = new ClienteDeTeste(amb, 'Novo').entrar(ana.codigo);
    expect(novo.lugar).toBe(1);
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Novo', 'Cida', 'Davi']);
    expect(beto.conn.fechada).not.toBeNull();
  });

  it('expulsa em qualquer lugar do modo, inclusive o 2 do 2x1', () => {
    const { ana, cida } = espera('2x1');
    expect(cida.lugar).toBe(2);
    ana.enviar({ tipo: 'expulsar', lugar: 2 });
    expect(cida.conn.todas('expulso')).toHaveLength(1);
    expect(nomesDosLugares(ana)).toEqual(['Ana', 'Beto', null, null]);
    expect(ana.estado.espectadores).toBe(2);
  });

  it('quem estava só segurando o lugar (caiu e ainda não voltou) também sai, e não há socket para fechar', () => {
    const { amb, ana, beto } = espera();
    beto.sair();
    expect(ana.estado.lugares[1]).toMatchObject({ nome: 'Beto', conectado: false });
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    expect(ana.erros).toHaveLength(0);
    expect(nomesDosLugares(ana)).toEqual(['Ana', null, 'Cida', 'Davi']);
    expect(beto.conn.todas('expulso')).toHaveLength(0);
    expect(beto.conn.fechada).toBeNull();
    beto.reconectar();
    expect(beto.ultimoErro?.codigo).toBe('token-invalido');
    amb.avancar(amb.config.lugarEsperaMs * 2);
    expect(nomesDosLugares(ana)).toEqual(['Ana', null, 'Cida', 'Davi']);
  });

  it('expulsar não mexe nas configurações da sala nem na dos outros: modo, relógio, linha e os outros lugares seguem', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x2', undefined, { tempoS: 45 }, { previsao: true, bolaAtingida: true });
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    expect(cida.estado).toMatchObject({ modo: '2x2', relogio: { tempoS: 45 }, linha: { previsao: true, bolaAtingida: true }, fase: 'espera' });
    expect(cida.lugar).toBe(2);
    expect(beto.conn.fechada).not.toBeNull();
  });

  it('o expulso não recebe mais nada da sala: mensagens dele são ignoradas e o chat dele não chega', () => {
    const { ana, beto, cida, davi } = espera();
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    for (const c of [ana, cida]) c.conn.limpar();
    const antes = beto.conn.recebidas.length;
    beto.enviar({ tipo: 'chat', texto: 'oi' });
    beto.enviar({ tipo: 'escolher-lugar', lugar: 1 });
    beto.enviar({ tipo: 'iniciar' });
    beto.enviar({ tipo: 'expulsar', lugar: 2 });
    expect(ana.conn.recebidas).toHaveLength(0);
    expect(cida.conn.recebidas).toHaveLength(0);
    expect(beto.conn.recebidas).toHaveLength(antes);
    expect(nomesDosLugares(davi)).toEqual(['Ana', null, 'Cida', 'Davi']);
  });

  it('a conexão fechada depois não gera "saiu" nem outro estado-sala; o registro solta a conexão', () => {
    const { amb, ana, beto } = espera();
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    const conexoes = amb.registro.totalConexoes;
    ana.conn.limpar();
    beto.sair(); // o socket fecha de verdade: o transporte avisa o registro
    expect(amb.registro.totalConexoes).toBe(conexoes - 1);
    expect(ana.conn.recebidas).toHaveLength(0);
    expect(amb.logs.filter((l) => l.startsWith('saiu ') && l.includes('"Beto"'))).toHaveLength(0);
  });
});

describe('expulsar — o token e a volta pelo link', () => {
  it('o token do expulso deixa de valer: entrar com ele é token-invalido, sem boas-vindas nem lugar, e a mensagem explica', () => {
    const { ana, beto, davi } = espera();
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    ana.conn.limpar();
    beto.reconectar();
    expect(beto.conn.todas('boas-vindas')).toHaveLength(0);
    expect(beto.conn.recebidas).toEqual([{ tipo: 'erro', codigo: 'token-invalido', mensagem: expect.stringContaining('removido') }]);
    expect(beto.conn.punicoes).toEqual([1]);
    expect(ana.conn.recebidas).toHaveLength(0);
    expect(nomesDosLugares(davi)).toEqual(['Ana', null, 'Cida', 'Davi']);
  });

  it('recarregar a página (conexão nova, token velho) não devolve o lugar nem com o lugar ainda vago', () => {
    const { amb, ana, beto } = espera();
    const token = beto.token;
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    for (let i = 0; i < 3; i++) {
      const recarga = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo, token);
      expect(recarga.conn.todas('boas-vindas')).toHaveLength(0);
      expect(recarga.ultimoErro?.codigo).toBe('token-invalido');
    }
    expect(nomesDosLugares(ana)[1]).toBeNull();
  });

  it('pelo link, sem token, ele entra como entrada nova: token novo, outro participante, primeiro lugar livre', () => {
    const { amb, ana, beto } = espera();
    const velho = beto.token;
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    const volta = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    expect(volta.erros).toHaveLength(0);
    expect(volta.token).not.toBe(velho);
    expect(volta.lugar).toBe(1);
    expect(volta.conn.ultima('boas-vindas')).toMatchObject({ anfitriao: false, codigo: ana.codigo });
    expect(ana.estado.lugares[1]).toMatchObject({ nome: 'Beto', conectado: true });
  });

  it('na mesma conexão: depois do token-invalido, entrar sem token funciona (o cliente esquece o token e tenta de novo)', () => {
    const { ana, beto } = espera();
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    beto.reconectar();
    expect(beto.ultimoErro?.codigo).toBe('token-invalido');
    beto.enviar({ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: ana.codigo, nome: 'Beto' });
    expect(beto.conn.ultima('boas-vindas')).toMatchObject({ lugar: 1 });
    expect(beto.estado.lugares[1]).toMatchObject({ nome: 'Beto', conectado: true });
  });

  it('o novo Beto não é o antigo: o token novo reconecta no lugar novo, e o velho continua recusado', () => {
    const { amb, ana, beto } = espera();
    const velho = beto.token;
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    const volta = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    volta.sair();
    volta.reconectar();
    expect(volta.lugar).toBe(1);
    const outro = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo, velho);
    expect(outro.ultimoErro?.codigo).toBe('token-invalido');
  });

  it('expulsar de novo quem voltou funciona, e cada token expulso fica recusado', () => {
    const { amb, ana, beto } = espera();
    const t1 = beto.token;
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    const volta = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const t2 = volta.token;
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    expect(volta.conn.todas('expulso')).toHaveLength(1);
    for (const t of [t1, t2]) {
      const c = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo, t);
      expect(c.ultimoErro?.codigo, t).toBe('token-invalido');
    }
  });

  it('o token expulso de uma sala não afeta outra sala nem outro jogador', () => {
    const { amb, ana, beto, cida } = espera();
    const outra = new ClienteDeTeste(amb, 'Zé').criar('1x1');
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    const entra = new ClienteDeTeste(amb, 'Beto').entrar(outra.codigo, beto.token);
    expect(entra.erros).toHaveLength(0); // outra sala: o token é só um desconhecido, entrada nova
    expect(entra.lugar).toBe(1);
    cida.sair();
    cida.reconectar();
    expect(cida.lugar).toBe(2);
  });

  it('a sala só lembra dos últimos 64 tokens expulsos: o mais antigo volta a ser um desconhecido (entrada nova), o recente segue recusado', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    const tokens: string[] = [];
    for (let i = 0; i < 65; i++) {
      const c = new ClienteDeTeste(amb, `P${i}`).entrar(ana.codigo);
      tokens.push(c.token);
      ana.enviar({ tipo: 'expulsar', lugar: 1 });
    }
    expect(ana.erros).toHaveLength(0);
    const recente = new ClienteDeTeste(amb, 'x').entrar(ana.codigo, tokens[64]!);
    expect(recente.ultimoErro?.codigo).toBe('token-invalido');
    const mais64 = new ClienteDeTeste(amb, 'y').entrar(ana.codigo, tokens[1]!);
    expect(mais64.ultimoErro?.codigo).toBe('token-invalido');
    const maisAntigo = new ClienteDeTeste(amb, 'z').entrar(ana.codigo, tokens[0]!);
    expect(maisAntigo.erros).toHaveLength(0);
    expect(maisAntigo.lugar).toBe(1);
  });
});

describe('expulsar — log', () => {
  const logsDe = (amb: Ambiente, evento: string): string[] => amb.logs.filter((l) => l.startsWith(`${evento} `));

  it('registra "expulso" com sala, apelidos e lugar, e nunca IP nem token', () => {
    const { amb, ana, beto } = espera();
    const ip = beto.ip;
    const token = beto.token;
    ana.enviar({ tipo: 'expulsar', lugar: 1 });
    const linhas = logsDe(amb, 'expulso');
    expect(linhas).toHaveLength(1);
    expect(JSON.parse(linhas[0]!.slice('expulso '.length))).toEqual({ sala: ana.codigo, nome: 'Beto', lugar: 1, por: 'Ana', conectado: true });
    expect(amb.logs.join('\n')).not.toContain(ip);
    expect(amb.logs.join('\n')).not.toContain(token);
  });

  it('recusas não registram "expulso"', () => {
    const { amb, ana, beto } = espera();
    beto.enviar({ tipo: 'expulsar', lugar: 2 });
    ana.enviar({ tipo: 'expulsar', lugar: 0 });
    expect(logsDe(amb, 'expulso')).toHaveLength(0);
  });
});
