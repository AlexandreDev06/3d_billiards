import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { PROTOCOLO_VERSAO } from '@sinuca/protocolo';
import { PRESET_BOTECO, novaPartida, type EstadoPartida } from '@sinuca/regras';
import { ClienteDeTeste, ConexaoFalsa, SEM_LIMITE, TACADA_MEDIA, criarAmbiente, salaIniciada } from './para-testes';

const codigos = (c: { conn: ConexaoFalsa }, desde = 0) => c.conn.recebidas.slice(desde).map((m) => (m.tipo === 'erro' ? m.codigo : m.tipo));

describe('conferirTacada — a sala diz se a tacada pode ser aceita ANTES de a gravação ser decodificada', () => {
  it('sem sala, sem partida, fora da vez, seq errado e partida acabada têm código; vez e seq certos não', () => {
    const amb = criarAmbiente();
    const solto = new ConexaoFalsa('solto');
    expect(amb.registro.conferirTacada(solto, 0)).toBe('fora-da-sala');

    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    expect(amb.registro.conferirTacada(ana.conn, 0)).toBe('fase-errada');

    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    expect(amb.registro.conferirTacada(ana.conn, 0)).toBeNull();
    expect(amb.registro.conferirTacada(beto.conn, 0)).toBe('nao-e-sua-vez');
    expect(amb.registro.conferirTacada(ana.conn, 1)).toBe('seq-errado');
    expect(amb.registro.conferirTacada(ana.conn, 99)).toBe('seq-errado');

    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    expect(amb.registro.conferirTacada(esp.conn, 0)).toBe('nao-e-sua-vez');
  });

  it('depois do fim da partida, partida-acabou; conferir não mexe em nada, não manda mensagem nem pune', () => {
    const fim = (p: EstadoPartida) => ({
      partida: { ...p, fase: 'fim' as const, vencedor: 0, naMesa: p.naMesa.filter((b) => b !== 1) },
      consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 0, vencedor: 0, texto: 'fim' },
    });
    const amb = criarAmbiente({}, { regras: { novaPartida, aplicarTacada: (p) => fim(p) } });
    const [ana] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const v = ana.visao!;
    ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim(v.partida).partida, mesa: v.mesa });
    const antes = ana.conn.recebidas.length;
    expect(amb.registro.conferirTacada(ana.conn, 1)).toBe('partida-acabou');
    expect(ana.conn.recebidas.length).toBe(antes);
    expect(ana.conn.totalPunido).toBe(0);
  });

  it('recusarTacada manda o erro e o retrato de ressincronia só a quem pediu, e conta como infração', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const antesBeto = beto.conn.recebidas.length;
    const antesAna = ana.conn.recebidas.length;
    amb.registro.recusarTacada(beto.conn, 'nao-e-sua-vez');
    expect(codigos(beto, antesBeto)).toEqual(['nao-e-sua-vez', 'retrato']);
    expect(beto.conn.recebidas.at(-1)).toMatchObject({ motivo: 'ressincronia' });
    expect(beto.conn.totalPunido).toBeGreaterThan(0);
    expect(ana.conn.recebidas.length).toBe(antesAna);

    const solto = new ConexaoFalsa('solto');
    amb.registro.recusarTacada(solto, 'fora-da-sala');
    expect(codigos({ conn: solto })).toEqual(['fora-da-sala']);
    expect(solto.totalPunido).toBeGreaterThan(0);
  });
});

describe('recusas de quem não pode contam como infração (a conexão acaba derrubada se insistir)', () => {
  const peso = (acao: (c: ClienteDeTeste, outro: ClienteDeTeste) => void): number => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('1x1');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const antes = beto.conn.totalPunido;
    acao(beto, ana);
    return beto.conn.totalPunido - antes;
  };

  it('fora da sala, sala inexistente, não-anfitrião, lugar inválido, versão e nome inválidos gastam', () => {
    const amb = criarAmbiente();
    const solto = new ConexaoFalsa('solto');
    amb.registro.receber(solto, { tipo: 'chat', texto: 'oi' });
    expect(solto.totalPunido).toBe(1);
    amb.registro.receber(solto, { tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'ZZZZZ', nome: 'x' });
    expect(solto.punicoes.at(-1)).toBe(10);
    amb.registro.receber(solto, { tipo: 'criar-sala', versao: 0, nome: 'x', modo: '1x1', preset: 'p', regras: PRESET_BOTECO.regras });
    expect(solto.punicoes.at(-1)).toBeGreaterThan(0);

    expect(peso((beto) => beto.enviar({ tipo: 'iniciar' }))).toBeGreaterThan(0);
    expect(peso((beto) => beto.enviar({ tipo: 'escolher-lugar', lugar: 3 }))).toBeGreaterThan(0);
    expect(peso((beto) => beto.enviar({ tipo: 'nova-partida' }))).toBeGreaterThan(0);
  });

  it('tacadas recusadas pela sala gastam mais que uma recusa simples', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const m = ana.montarTacada();
    beto.enviar(m);
    expect(beto.conn.totalPunido).toBeGreaterThan(0);
    ana.enviar({ ...m, partida: { ...m.partida, vez: 1 - m.partida.vez } });
    expect(ana.conn.totalPunido).toBeGreaterThanOrEqual(5);
  });

  it('gravação inválida e mesa incoerente também custam ao menos 5, como partida que diverge', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const m = ana.montarTacada();
    ana.enviar({ ...m, gravacao: { ...m.gravacao, eventos: m.gravacao.eventos.slice(0, 1) } });
    expect(ana.ultimoErro?.codigo).toBe('gravacao-invalida');
    expect(ana.conn.punicoes.at(-1)).toBeGreaterThanOrEqual(5);
    ana.enviar({ ...m, mesa: { bolas: m.mesa.bolas.filter((b) => b.id !== m.partida.naMesa[0]) } });
    expect(ana.ultimoErro?.codigo).toBe('mesa-incoerente');
    expect(ana.conn.punicoes.at(-1)).toBeGreaterThanOrEqual(5);
  });

  it('disputas legítimas não gastam: lugar ocupado, lugares incompletos, sala cheia, fase', () => {
    expect(peso((beto, ana) => ana.enviar({ tipo: 'iniciar' }))).toBe(0);
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar('2x2');
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    beto.enviar({ tipo: 'escolher-lugar', lugar: 2 });
    expect(beto.ultimoErro?.codigo).toBe('lugar-ocupado');
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.ultimoErro?.codigo).toBe('lugares-incompletos');
    expect(beto.conn.totalPunido + ana.conn.totalPunido + cida.conn.totalPunido).toBe(0);
  });
});

describe('falhas de entrada por IP (código de sala que não existe)', () => {
  const tentar = (c: ClienteDeTeste) => c.entrar('ZZZZZ');

  it('somando as conexões do mesmo IP, passado o orçamento a conexão é fechada (1008) com limite-mensagens', () => {
    const amb = criarAmbiente({ falhasPorIp: { capacidade: 3, porSegundo: 0.001 } });
    const a = new ClienteDeTeste(amb, 'a', '203.0.113.1');
    const b = new ClienteDeTeste(amb, 'b', '203.0.113.1');
    tentar(a);
    tentar(b);
    tentar(a);
    expect(codigos(a)).toEqual(['sala-inexistente', 'sala-inexistente']);
    expect(a.conn.fechada).toBeNull();
    tentar(b);
    expect(codigos(b)).toEqual(['sala-inexistente', 'limite-mensagens']);
    expect(b.conn.fechada?.codigo).toBe(1008);
  });

  it('outro IP tem orçamento próprio, e o orçamento volta com o tempo', () => {
    const amb = criarAmbiente({ falhasPorIp: { capacidade: 2, porSegundo: 1 } });
    const a = new ClienteDeTeste(amb, 'a', '203.0.113.1');
    const outro = new ClienteDeTeste(amb, 'o', '203.0.113.2');
    tentar(a);
    tentar(a);
    tentar(a);
    expect(a.conn.fechada?.codigo).toBe(1008);
    tentar(outro);
    expect(outro.conn.fechada).toBeNull();
    amb.avancar(3000);
    const volta = new ClienteDeTeste(amb, 'a2', '203.0.113.1');
    tentar(volta);
    expect(volta.conn.fechada).toBeNull();
    expect(codigos(volta)).toEqual(['sala-inexistente']);
  });

  it('entrar numa sala que existe não gasta o orçamento', () => {
    const amb = criarAmbiente({ falhasPorIp: { capacidade: 1, porSegundo: 0.001 } });
    const dono = new ClienteDeTeste(amb, 'Dono', '203.0.113.9').criar();
    for (let i = 0; i < 5; i++) {
      const c = new ClienteDeTeste(amb, `c${i}`, '203.0.113.1').entrar(dono.codigo);
      expect(c.conn.ultima('boas-vindas')).toBeDefined();
      c.sair();
    }
  });
});

describe('salas por IP e sala vazia na espera', () => {
  it('um IP só mantém maxSalasPorIp salas abertas; outro IP não é afetado; ao expirar a vaga volta', () => {
    const amb = criarAmbiente({ maxSalasPorIp: 2 });
    const a1 = new ClienteDeTeste(amb, 'a1', '203.0.113.1').criar();
    new ClienteDeTeste(amb, 'a2', '203.0.113.1').criar();
    const a3 = new ClienteDeTeste(amb, 'a3', '203.0.113.1').criar();
    expect(a3.ultimoErro?.codigo).toBe('servidor-cheio');
    expect(a3.ultimoErro?.mensagem).toMatch(/salas/i);
    expect(amb.registro.totalSalas).toBe(2);
    expect(new ClienteDeTeste(amb, 'b1', '203.0.113.2').criar().conn.ultima('boas-vindas')).toBeDefined();

    a1.sair();
    amb.avancar(amb.config.salaVaziaEsperaMs + 1000);
    expect(new ClienteDeTeste(amb, 'a4', '203.0.113.1').criar().conn.ultima('boas-vindas')).toBeDefined();
  });

  it('a sala conta para o IP de quem a criou mesmo que ele troque de conexão', () => {
    const amb = criarAmbiente({ maxSalasPorIp: 1 });
    const a1 = new ClienteDeTeste(amb, 'a1', '203.0.113.1').criar();
    a1.sair();
    const a2 = new ClienteDeTeste(amb, 'a2', '203.0.113.1').criar();
    expect(a2.ultimoErro?.codigo).toBe('servidor-cheio');
  });

  it('sala que nunca saiu da espera e ficou vazia expira em ~60 s, não em 10 min', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    ana.sair();
    amb.avancar(amb.config.salaVaziaEsperaMs - 1000);
    expect(amb.registro.totalSalas).toBe(1);
    amb.avancar(2000);
    expect(amb.registro.totalSalas).toBe(0);
    expect(amb.config.salaVaziaEsperaMs).toBe(60_000);
  });

  it('quem volta antes dos 60 s segura a sala; a espera vazia reinicia a contagem a cada saída', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    ana.sair();
    amb.avancar(50_000);
    ana.reconectar();
    ana.sair();
    amb.avancar(50_000);
    expect(amb.registro.totalSalas).toBe(1);
    amb.avancar(11_000);
    expect(amb.registro.totalSalas).toBe(0);
  });

  it('sala com partida segue valendo salaVaziaMs (10 min), para dar tempo de todos voltarem', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.sair();
    beto.sair();
    amb.avancar(amb.config.salaVaziaEsperaMs + 5000);
    expect(amb.registro.totalSalas).toBe(1);
    amb.avancar(amb.config.salaVaziaMs);
    expect(amb.registro.totalSalas).toBe(0);
  });
});

describe('código de carteira que o servidor não conhece gasta o orçamento de falhas do IP (L25)', () => {
  const CODIGO_DESCONHECIDO = 'z'.repeat(43);

  it('criar sala e entrar com código desconhecido seguem sem erro (joga sem carteira), mas cada um gasta uma ficha', () => {
    const amb = criarAmbiente({ falhasPorIp: { capacidade: 3, porSegundo: 0.001 } });
    const ana = new ClienteDeTeste(amb, 'Ana', '203.0.113.1');
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { carteira: CODIGO_DESCONHECIDO });
    expect(ana.erros).toEqual([]);
    new ClienteDeTeste(amb, 'Beto', '203.0.113.1').entrar(ana.codigo, undefined, CODIGO_DESCONHECIDO);
    expect(ana.estado.lugares[1]).toMatchObject({ nome: 'Beto', saldo: null });
    // sobrou 1 ficha: uma busca por sala que não existe passa, a seguinte já não
    const c = new ClienteDeTeste(amb, 'c', '203.0.113.1');
    c.entrar('ZZZZZ');
    expect(codigos(c)).toEqual(['sala-inexistente']);
    c.entrar('ZZZZZ');
    expect(codigos(c)).toEqual(['sala-inexistente', 'limite-mensagens']);
  });

  it('esgotado o orçamento, o código desconhecido é recusado (limite-mensagens), a conexão cai (1008) e nada é criado', () => {
    const amb = criarAmbiente({ falhasPorIp: { capacidade: 2, porSegundo: 0.001 } });
    const dono = new ClienteDeTeste(amb, 'Dono', '203.0.113.9').criar();
    for (let i = 0; i < 2; i++) {
      new ClienteDeTeste(amb, `p${i}`, '203.0.113.1').entrar(dono.codigo, undefined, CODIGO_DESCONHECIDO);
    }
    const barrado = new ClienteDeTeste(amb, 'barrado', '203.0.113.1');
    barrado.entrar(dono.codigo, undefined, CODIGO_DESCONHECIDO);
    expect(codigos(barrado)).toEqual(['limite-mensagens']);
    expect(barrado.conn.fechada?.codigo).toBe(1008);
    expect(barrado.conn.ultima('boas-vindas')).toBeUndefined();

    const salasAntes = amb.registro.totalSalas;
    const criador = new ClienteDeTeste(amb, 'criador', '203.0.113.1');
    criador.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { carteira: CODIGO_DESCONHECIDO });
    expect(codigos(criador)).toEqual(['limite-mensagens']);
    expect(amb.registro.totalSalas).toBe(salasAntes);
  });

  it('o orçamento é um só com o do código de sala que não existe, por IP: um IP diferente não é afetado, e ele recarrega com o tempo', () => {
    const amb = criarAmbiente({ falhasPorIp: { capacidade: 2, porSegundo: 1 } });
    const a = new ClienteDeTeste(amb, 'a', '203.0.113.1');
    a.entrar('ZZZZZ');
    a.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { carteira: CODIGO_DESCONHECIDO });
    expect(a.ultimoErro?.codigo).not.toBe('limite-mensagens'); // 2ª ficha
    const b = new ClienteDeTeste(amb, 'b', '203.0.113.1');
    b.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { carteira: CODIGO_DESCONHECIDO });
    expect(codigos(b)).toEqual(['limite-mensagens']);
    const outro = new ClienteDeTeste(amb, 'o', '203.0.113.2');
    outro.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { carteira: CODIGO_DESCONHECIDO });
    expect(outro.erros).toEqual([]);
    amb.avancar(3000);
    const volta = new ClienteDeTeste(amb, 'volta', '203.0.113.1');
    volta.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { carteira: CODIGO_DESCONHECIDO });
    expect(volta.erros).toEqual([]);
  });

  it('quem volta com o token da própria sala não gasta ficha, mesmo com o código desconhecido: a carteira é ignorada na volta (L26)', () => {
    const amb = criarAmbiente({ falhasPorIp: { capacidade: 2, porSegundo: 0.001 } });
    const dono = new ClienteDeTeste(amb, 'Dono', '203.0.113.9').criar();
    const beto = new ClienteDeTeste(amb, 'Beto', '203.0.113.1').entrar(dono.codigo);
    const { codigo, token } = beto;
    for (let i = 0; i < 6; i++) {
      beto.sair();
      beto.conn = new ConexaoFalsa(`Beto${i}`, '203.0.113.1');
      beto.entrar(codigo, token, CODIGO_DESCONHECIDO);
      expect(beto.conn.ultima('boas-vindas'), `volta ${i}`).toMatchObject({ token, lugar: 1 });
      expect(beto.erros, `volta ${i}`).toEqual([]);
    }
    // as duas fichas do IP seguem inteiras: duas entradas novas com o código desconhecido passam, a terceira não
    for (let i = 0; i < 2; i++) {
      const novo = new ClienteDeTeste(amb, `novo${i}`, '203.0.113.1').entrar(dono.codigo, undefined, CODIGO_DESCONHECIDO);
      expect(novo.conn.ultima('boas-vindas'), `novo${i}`).toBeDefined();
    }
    const barrado = new ClienteDeTeste(amb, 'barrado', '203.0.113.1').entrar(dono.codigo, undefined, CODIGO_DESCONHECIDO);
    expect(codigos(barrado)).toEqual(['limite-mensagens']);
  });

  it('token que a sala não conhece (de outra sala, por exemplo) vale como entrada nova e gasta a ficha', () => {
    const amb = criarAmbiente({ falhasPorIp: { capacidade: 1, porSegundo: 0.001 } });
    const dono = new ClienteDeTeste(amb, 'Dono', '203.0.113.9').criar();
    const outro = new ClienteDeTeste(amb, 'Outro', '203.0.113.8').criar();
    const a = new ClienteDeTeste(amb, 'a', '203.0.113.1').entrar(dono.codigo, outro.token, CODIGO_DESCONHECIDO);
    expect(a.conn.ultima('boas-vindas')).toBeDefined();
    const b = new ClienteDeTeste(amb, 'b', '203.0.113.1').entrar(dono.codigo, outro.token, CODIGO_DESCONHECIDO);
    expect(codigos(b)).toEqual(['limite-mensagens']);
  });

  it('código que existe, ou nenhum código, não gasta nada', () => {
    const amb = criarAmbiente({ falhasPorIp: { capacidade: 1, porSegundo: 0.001 } });
    const { codigo } = amb.registro.carteiras.criar()!;
    const dono = new ClienteDeTeste(amb, 'Dono', '203.0.113.9').criar();
    for (let i = 0; i < 6; i++) {
      const c = new ClienteDeTeste(amb, `c${i}`, '203.0.113.1');
      if (i % 2 === 0) c.entrar(dono.codigo, undefined, codigo);
      else c.entrar(dono.codigo);
      expect(c.conn.ultima('boas-vindas'), `c${i}`).toBeDefined();
      c.sair();
    }
  });
});
