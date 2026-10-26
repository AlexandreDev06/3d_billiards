import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import type { MsgTacada } from '@sinuca/protocolo';
import { aplicarTacada, jogadoresDaProxima, novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { ClienteDeTeste, TACADA_FORTE, TACADA_MEDIA, criarAmbiente, mesaDepoisDasConsequencias, salaIniciada } from './para-testes';

const mira = { tipo: 'mira', angulo: 0.7, lateral: 0.1, vertical: -0.2, recuo: 0.12 } as const;

describe('sala — mira ao vivo e chat', () => {
  it('a mira do jogador da vez vai para os outros, nunca de volta para ele', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    [ana, beto, esp].forEach((c) => c.conn.limpar());
    ana.enviar(mira);
    expect(beto.conn.ultima('mira-retransmitida')).toEqual({ tipo: 'mira-retransmitida', lugar: 0, angulo: 0.7, lateral: 0.1, vertical: -0.2, recuo: 0.12 });
    expect(esp.conn.todas('mira-retransmitida')).toHaveLength(1);
    expect(ana.conn.todas('mira-retransmitida')).toHaveLength(0);
  });

  it('o giz da mira vai tal qual para os outros; sem giz a chave nem existe', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    [ana, beto, esp].forEach((c) => c.conn.limpar());
    ana.enviar({ ...mira, giz: true });
    for (const outro of [beto, esp]) {
      expect(outro.conn.ultima('mira-retransmitida')).toEqual({ tipo: 'mira-retransmitida', lugar: 0, angulo: 0.7, lateral: 0.1, vertical: -0.2, recuo: 0.12, giz: true });
    }
    beto.conn.limpar();
    ana.enviar(mira);
    const semGiz = beto.conn.ultima('mira-retransmitida');
    expect(semGiz).toEqual({ tipo: 'mira-retransmitida', lugar: 0, angulo: 0.7, lateral: 0.1, vertical: -0.2, recuo: 0.12 });
    expect(Object.hasOwn(semGiz as object, 'giz')).toBe(false);
    expect(ana.erros).toHaveLength(0);
  });

  it('mira de quem não tem a vez, de espectador ou na espera é ignorada, sem erro', () => {
    const amb = criarAmbiente();
    const ana0 = new ClienteDeTeste(amb, 'Ana').criar();
    const beto0 = new ClienteDeTeste(amb, 'Beto').entrar(ana0.codigo);
    ana0.enviar(mira);
    expect(beto0.conn.todas('mira-retransmitida')).toHaveLength(0);
    ana0.enviar({ tipo: 'iniciar' });

    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana0.codigo);
    [ana0, beto0, esp].forEach((c) => c.conn.limpar());
    beto0.enviar(mira);
    esp.enviar(mira);
    expect(ana0.conn.recebidas).toEqual([]);
    expect(beto0.erros).toHaveLength(0);
    expect(esp.erros).toHaveLength(0);
  });

  it('o chat vai a todos, inclusive a quem escreveu, com lugar e nome; espectador tem lugar nulo', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    beto.enviar({ tipo: 'chat', texto: '  bora  ' });
    esp.enviar({ tipo: 'chat', texto: 'oi' });
    for (const c of [ana, beto, esp]) {
      expect(c.conn.todas('chat-retransmitido')).toEqual([
        { tipo: 'chat-retransmitido', lugar: 1, nome: 'Beto', texto: 'bora' },
        { tipo: 'chat-retransmitido', lugar: null, nome: 'Esp', texto: 'oi' },
      ]);
    }
  });

  it('chat vazio depois de aparado é ignorado; chat em excesso leva limite-mensagens e volta com o tempo', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar({ tipo: 'chat', texto: '   ' });
    expect(beto.conn.todas('chat-retransmitido')).toHaveLength(0);
    for (let i = 0; i < 5; i++) ana.enviar({ tipo: 'chat', texto: `m${i}` });
    expect(ana.erros).toHaveLength(0);
    ana.enviar({ tipo: 'chat', texto: 'demais' });
    expect(ana.ultimoErro?.codigo).toBe('limite-mensagens');
    expect(beto.conn.todas('chat-retransmitido')).toHaveLength(5);
    amb.avancar(2000);
    ana.enviar({ tipo: 'chat', texto: 'de novo' });
    expect(beto.conn.todas('chat-retransmitido')).toHaveLength(6);
  });
});

describe('sala — reconexão', () => {
  it('quem cai aparece como desconectado e, voltando com o token, retoma o lugar com retrato e última gravação', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const m = ana.jogar(TACADA_FORTE);
    const tokenAntes = ana.token;

    ana.sair();
    expect(beto.estado.lugares[0]).toMatchObject({ nome: 'Ana', conectado: false });
    amb.avancar(5000);

    ana.reconectar();
    expect(ana.token).toBe(tokenAntes);
    expect(ana.conn.ultima('boas-vindas')).toMatchObject({ lugar: 0, anfitriao: true });
    expect(ana.conn.recebidas.map((x) => x.tipo)).toEqual(['boas-vindas', 'estado-sala', 'retrato']);
    expect(beto.estado.lugares[0]).toMatchObject({ nome: 'Ana', conectado: true });
    const r = ana.conn.ultima('retrato')!;
    expect(r).toMatchObject({ motivo: 'entrada', seq: 1, mesa: m.mesa });
    expect(r.partida).toEqual(beto.visao!.partida);
    expect(r.ultima).toMatchObject({ seq: 0, lugar: 0, parametros: TACADA_FORTE });
    expect(r.ultima!.gravacao.eventos).toEqual(m.gravacao.eventos);
    expect(r.ultima!.consequencias).toEqual(beto.conn.ultima('tacada-retransmitida')!.consequencias);
    expect(ana.visao).toMatchObject({ seq: 1 });
  });

  it('antes da primeira tacada o retrato da volta tem mesa nula e ultima nula', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb) as [ClienteDeTeste];
    ana.sair();
    ana.reconectar();
    expect(ana.conn.ultima('retrato')).toMatchObject({ motivo: 'entrada', mesa: null, ultima: null, seq: 0 });
  });

  it('na espera, voltar não manda retrato (não há partida)', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    ana.sair();
    ana.reconectar();
    expect(ana.conn.recebidas.map((x) => x.tipo)).toEqual(['boas-vindas', 'estado-sala']);
  });

  it('reconectar com a conexão antiga ainda de pé derruba a antiga (código 4000) e a nova assume', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const antiga = ana.conn;
    ana.reconectar();
    expect(antiga.fechada?.codigo).toBe(4000);
    expect(ana.conn.ultima('boas-vindas')).toMatchObject({ lugar: 0 });
    // a queda tardia da conexão antiga não derruba a nova
    amb.registro.desconectar(antiga);
    expect(beto.estado.lugares[0]).toMatchObject({ conectado: true });
    ana.enviar(mira);
    expect(beto.conn.todas('mira-retransmitida')).toHaveLength(1);
  });

  it('token desconhecido entra como jogador novo, no primeiro lugar livre', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    const intruso = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo, 'um-token-que-ninguem-tem-xxxxxxxx');
    expect(intruso.lugar).toBe(1);
    expect(intruso.token).not.toBe('um-token-que-ninguem-tem-xxxxxxxx');
  });

  it('o token de uma sala não abre lugar em outra', () => {
    const amb = criarAmbiente();
    const a = new ClienteDeTeste(amb, 'Ana').criar();
    const b = new ClienteDeTeste(amb, 'Bia').criar();
    const x = new ClienteDeTeste(amb, 'Xis').entrar(b.codigo, a.token);
    expect(x.lugar).toBe(1);
    expect(x.token).not.toBe(a.token);
    expect(b.estado.lugares[0]!.nome).toBe('Bia');
  });
});

describe('sala — ausência, tolerância da vez e expiração', () => {
  it('jogador da vez ausente por mais de 60 s perde a vez, com retrato para todos', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const antes = beto.visao!.partida;
    ana.sair();
    amb.avancar(59_000);
    expect(beto.estado.vez).toBe(0);
    expect(beto.conn.todas('retrato').filter((r) => r.motivo === 'vez-passou')).toHaveLength(0);

    amb.avancar(2000);
    expect(beto.estado.vez).toBe(1);
    const r = beto.conn.ultima('retrato')!;
    expect(r).toMatchObject({ motivo: 'vez-passou', seq: 0, ultima: null });
    expect(r.partida).toEqual({ ...antes, vez: 1 });
    expect(beto.visao!.partida.vez).toBe(1);

    // quem ficou joga normalmente depois que a vez passou
    beto.jogar(TACADA_MEDIA, 5);
    expect(beto.erros).toHaveLength(0);
    expect(beto.estado.seq).toBe(1);
  });

  it('a tolerância conta da queda ou do início da vez, o que vier por último; voltar a zera', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(50_000); // Ana presente, vez dela, ninguém cai
    ana.sair();
    amb.avancar(59_000); // 59 s de queda: ainda não, mesmo com 109 s de vez
    expect(beto.estado.vez).toBe(0);
    ana.reconectar();
    amb.avancar(120_000);
    expect(beto.estado.vez).toBe(0);
    ana.sair();
    amb.avancar(61_000);
    expect(beto.estado.vez).toBe(1);
  });

  it('a tolerância começa quando a vez chega ao ausente, não quando ele caiu', () => {
    const passaAVez = (p: EstadoPartida, e: Parameters<typeof aplicarTacada>[1]): ResultadoRegras => {
      const r = aplicarTacada(p, e);
      const vez = (p.vez + 1) % p.jogadores.length;
      return { partida: { ...r.partida, vez }, consequencias: { ...r.consequencias, proximo: vez } };
    };
    const amb = criarAmbiente({}, { regras: { novaPartida, aplicarTacada: passaAVez } });
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    beto.sair();
    amb.avancar(100_000);
    const v = ana.visao!;
    const g = gravacaoDeTeste();
    const r = passaAVez(v.partida, g.eventos);
    ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: g, partida: r.partida, mesa: mesaDepoisDasConsequencias(v.mesa, r.consequencias) });
    expect(ana.erros).toHaveLength(0);
    expect(ana.estado.vez).toBe(1);
    amb.avancar(30_000);
    expect(ana.estado.vez).toBe(1);
    amb.avancar(31_000);
    expect(ana.estado.vez).toBe(0);
  });

  it('2x2: ao perder a vez por ausência, ela anda um na roda (A1, B1, A2, B2)', () => {
    const amb = criarAmbiente();
    const clientes = salaIniciada(amb, '2x2');
    expect(clientes[0]!.estado.vez).toBe(0);
    clientes[0]!.sair();
    amb.avancar(61_000);
    expect(clientes[1]!.estado.vez).toBe(1);
    clientes[1]!.sair();
    amb.avancar(61_000);
    expect(clientes[2]!.estado.vez).toBe(2);
    expect(clientes[2]!.conn.ultima('retrato')).toMatchObject({ motivo: 'vez-passou' });
  });

  it('só importa a ausência de quem tem a vez', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    beto.sair();
    amb.avancar(300_000);
    expect(ana.estado.vez).toBe(0);
    expect(ana.conn.todas('retrato').filter((r) => r.motivo === 'vez-passou')).toHaveLength(0);
  });

  it('o tempo de tolerância e a função que passa a vez são configuráveis e injetáveis', () => {
    const chamadas: EstadoPartida[] = [];
    const amb = criarAmbiente(
      { toleranciaVezMs: 5000 },
      {
        passarVez: (p) => {
          chamadas.push(p);
          return { ...p, vez: 1 };
        },
      },
    );
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.sair();
    amb.avancar(4000);
    expect(chamadas).toHaveLength(0);
    amb.avancar(2000);
    expect(chamadas).toHaveLength(1);
    expect(beto.estado.vez).toBe(1);
  });

  it('na espera quem cai libera o lugar depois de lugarEsperaMs; o anfitrião não', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const tokenDoBeto = beto.token;
    beto.sair();
    amb.avancar(amb.config.lugarEsperaMs - 1000);
    expect(ana.estado.lugares[1]).toMatchObject({ nome: 'Beto', conectado: false });
    amb.avancar(2000);
    expect(ana.estado.lugares[1]).toMatchObject({ nome: null, conectado: false });

    const volta = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo, tokenDoBeto);
    expect(volta.token).not.toBe(tokenDoBeto);

    ana.sair();
    amb.avancar(amb.config.lugarEsperaMs * 5);
    expect(volta.estado.lugares[0]).toMatchObject({ nome: 'Ana', conectado: false, anfitriao: true });
  });

  it('espectador que cai some na hora', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb) as [ClienteDeTeste];
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    expect(ana.estado.espectadores).toBe(1);
    esp.sair();
    expect(ana.estado.espectadores).toBe(0);
  });

  it('sala sem ninguém conectado por salaVaziaMs some; antes disso dá para voltar', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const codigo = ana.codigo;
    ana.sair();
    beto.sair();
    amb.avancar(amb.config.salaVaziaMs - 1000);
    expect(amb.registro.totalSalas).toBe(1);
    ana.reconectar();
    expect(ana.conn.ultima('boas-vindas')).toBeDefined();
    ana.sair();
    amb.avancar(amb.config.salaVaziaMs + 1000);
    expect(amb.registro.totalSalas).toBe(0);
    const tarde = new ClienteDeTeste(amb, 'Tarde').entrar(codigo);
    expect(tarde.ultimoErro?.codigo).toBe('sala-inexistente');
  });

  it('sala parada por salaOciosaMs fecha as conexões (4001) mesmo com gente conectada; chat mantém viva', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(amb.config.salaOciosaMs - 1000);
    ana.enviar({ tipo: 'chat', texto: 'ainda aqui' });
    amb.avancar(amb.config.salaOciosaMs - 1000);
    expect(amb.registro.totalSalas).toBe(1);
    expect(beto.conn.fechada).toBeNull();
    amb.avancar(2000);
    expect(amb.registro.totalSalas).toBe(0);
    expect(amb.registro.totalConexoes).toBe(0);
    expect(ana.conn.fechada?.codigo).toBe(4001);
    expect(beto.conn.fechada?.codigo).toBe(4001);
  });
});

describe('sala — nova partida', () => {
  const fimDeJogo = (p: EstadoPartida): ResultadoRegras => ({
    partida: { ...p, fase: 'fim', vez: 1, vencedor: 0, naMesa: p.naMesa.filter((b) => b !== 1) },
    consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1, vencedor: 0, texto: 'fim' },
  });

  function terminada() {
    const amb = criarAmbiente({}, { regras: { novaPartida, aplicarTacada: (p) => fimDeJogo(p) } });
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fimDeJogo(v.partida).partida, mesa: v.mesa });
    return { amb, ana, beto, v };
  }

  it('só o anfitrião, só depois do fim', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar({ tipo: 'nova-partida' });
    expect(ana.ultimoErro?.codigo).toBe('partida-em-andamento');
    beto.enviar({ tipo: 'nova-partida' });
    expect(beto.ultimoErro?.codigo).toBe('nao-anfitriao');

    const t = terminada();
    t.beto.enviar({ tipo: 'nova-partida' });
    expect(t.beto.ultimoErro?.codigo).toBe('nao-anfitriao');
  });

  it('antes de iniciar é fase errada', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    ana.enviar({ tipo: 'nova-partida' });
    expect(ana.ultimoErro?.codigo).toBe('fase-errada');
  });

  it('recomeça com os jogadores na ordem das regras, seq zero e mesa nula', () => {
    const { ana, beto, v } = terminada();
    expect(ana.estado.vez).toBeNull();
    ana.conn.limpar();
    beto.conn.limpar();
    const fim = fimDeJogo(v.partida).partida;
    ana.enviar({ tipo: 'nova-partida' });
    for (const c of [ana, beto]) {
      const r = c.conn.ultima('retrato')!;
      expect(r).toMatchObject({ motivo: 'nova-partida', seq: 0, mesa: null, ultima: null });
      expect(r.partida.jogadores).toEqual(jogadoresDaProxima(fim));
      expect(r.partida.fase).toBe('saida');
      expect(r.partida.vencedor).toBeNull();
      expect(c.estado).toMatchObject({ fase: 'jogando', seq: 0, vez: Number(r.partida.jogadores[0]!.id.slice(-1)) });
    }
  });

  it('quem volta depois da nova partida não recebe mesa nem última tacada da partida anterior', () => {
    const { ana } = terminada();
    ana.enviar({ tipo: 'nova-partida' });
    ana.sair();
    ana.reconectar();
    expect(ana.conn.ultima('retrato')).toMatchObject({ motivo: 'entrada', seq: 0, mesa: null, ultima: null });
  });

  it('uma tacada com o seq antigo depois da nova partida é recusada', () => {
    const { ana, beto } = terminada();
    ana.enviar({ tipo: 'nova-partida' });
    const quem = [ana, beto][ana.estado.vez!]!;
    const velha = { ...tacadaDaVisao(quem), seq: 3 };
    quem.enviar(velha);
    expect(quem.ultimoErro?.codigo).toBe('seq-errado');
  });
});

function tacadaDaVisao(c: ClienteDeTeste): MsgTacada {
  const v = c.visao!;
  const g = gravacaoDeTeste();
  const r = aplicarTacada(v.partida, g.eventos);
  return { tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao: g, partida: r.partida, mesa: mesaDepoisDasConsequencias(v.mesa, r.consequencias) };
}

describe('sala — log sem dado pessoal', () => {
  it('registra o que aconteceu com código e apelido, mas nunca token nem texto de chat', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar({ tipo: 'chat', texto: 'frase-secreta-do-chat' });
    ana.jogar(TACADA_FORTE);
    ana.sair();
    ana.reconectar();
    const tudo = amb.logs.join('\n');
    expect(tudo).toContain('Ana');
    expect(tudo).toContain(ana.codigo);
    expect(tudo).not.toContain(ana.token);
    expect(tudo).not.toContain(beto.token);
    expect(tudo).not.toContain('frase-secreta-do-chat');
    expect(tudo).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
  });
});
