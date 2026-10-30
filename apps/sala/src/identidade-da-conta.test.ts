/**
 * A identidade da conta presa à conexão e ao lugar (L61b): `esquecerConta` (sair e excluir), o registro dos excluídos, a volta pelo token
 * do lugar sem a conta, e a releitura da sessão (no máximo a cada 10 minutos por conexão) antes de criar, entrar ou começar partida com aposta.
 */
import { describe, expect, it, vi } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { SALDO_INICIAL } from '@sinuca/protocolo';
import { PRESET_BOTECO, aplicarTacada, novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { CarteirasEmMemoria } from './carteiras-base';
import { INTERVALO_DA_RELEITURA_MS } from './registro';
import { ClienteDeTeste, ConexaoFalsa, SEM_LIMITE, TACADA_MEDIA, criarAmbiente, type Ambiente } from './para-testes';
import { bancoDeTeste } from './para-testes-banco';
import type { MotorDeRegras } from './regras';

const TOKEN_A = 'A'.repeat(43);
const TOKEN_B = 'B'.repeat(43);
const ID_FORA = 'f'.repeat(64);

const fim = (p: EstadoPartida, vencedor: number | null): ResultadoRegras => ({
  partida: { ...p, fase: 'fim', vencedor },
  consequencias: { faltas: [], retirar: [], recolocar: [], proximo: p.vez, vencedor, texto: 'fim' },
});

const esperar = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

interface Mundo {
  readonly amb: Ambiente;
  readonly carteiras: CarteirasEmMemoria;
  readonly controle: { acabaCom?: number };
  /** Quantas vezes o Banco foi perguntado e por qual token. */
  readonly perguntas: string[];
  /** O que o Banco responde a cada token: o `id`, `null` (sessão morta) ou `'fora'` (não responde). */
  readonly sessoes: Map<string, string | null | 'fora'>;
}

function mundo(comBanco = false): Mundo {
  const bt = comBanco ? bancoDeTeste() : null;
  const carteiras = new CarteirasEmMemoria({ maxCarteiras: 100, relogio: () => 1_000_000, log: () => {}, ...(bt ? { banco: bt.banco } : {}) });
  const perguntas: string[] = [];
  const sessoes = new Map<string, string | null | 'fora'>();
  const controle: Mundo['controle'] = {};
  const regras: MotorDeRegras = {
    novaPartida,
    aplicarTacada: (p, eventos) => (controle.acabaCom === undefined ? aplicarTacada(p, eventos) : fim(p, controle.acabaCom)),
  };
  const amb = criarAmbiente(
    { missoesDiarias: false },
    {
      carteiras,
      regras,
      contaDaSessao: async (token) => {
        perguntas.push(token);
        const r = sessoes.get(token);
        if (r === 'fora') throw new Error('o Banco está fora do ar');
        return r === undefined || r === null ? null : { id: r };
      },
    },
  );
  return { amb, carteiras, controle, perguntas, sessoes };
}

/** Uma carteira de conta (a do convidado que virou conta: marcada `daConta`). */
function contaNova(m: Mundo): { codigo: string; id: string } {
  const c = m.carteiras.criar()!;
  m.carteiras.marcarDaConta(c.id);
  return c;
}

/** Um cliente cuja conexão traz a conta `id` (e o token que a provou). */
function cliente(m: Mundo, nome: string, id: string | null, token?: string): ClienteDeTeste {
  const c = new ClienteDeTeste(m.amb, nome);
  if (id !== null) {
    c.conn.idDaConta = id;
    if (token !== undefined) {
      c.conn.sessao = token;
      c.conn.sessaoConferidaEm = m.amb.agora();
      m.sessoes.set(token, id);
    }
  }
  return c;
}

const saldoNoLugar = (c: ClienteDeTeste, lugar: number): number | null | undefined => c.estado.lugares[lugar]?.saldo;

/** Sala 1x1 com as duas contas sentadas e a partida em andamento. */
function duasContas(m: Mundo, tokens = true) {
  const a = contaNova(m);
  const b = contaNova(m);
  const ana = cliente(m, 'Ana', a.id, tokens ? TOKEN_A : undefined);
  const beto = cliente(m, 'Beto', b.id, tokens ? TOKEN_B : undefined);
  ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
  beto.entrar(ana.codigo);
  return { a, b, ana, beto };
}

function terminar(m: Mundo, quem: ClienteDeTeste, equipe: number): void {
  m.controle.acabaCom = equipe;
  const v = quem.visao!;
  quem.enviar({ tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim(v.partida, equipe).partida, mesa: v.mesa });
  delete m.controle.acabaCom;
}

describe('esquecerConta: quem saiu da conta ou a excluiu perde a carteira dela (a)', () => {
  it('a conexão ainda fora de sala perde o id; o criar-sala seguinte joga sem carteira (saldo null)', () => {
    const m = mundo(true);
    const a = contaNova(m);
    const ana = cliente(m, 'Ana', a.id, TOKEN_A);
    expect(m.amb.registro.esquecerConta(a.id)).toBe(0); // nada recebido ainda: o registro só conhece a conexão quando ela fala
    m.amb.registro.conexaoAberta(ana.conn);
    expect(m.amb.registro.esquecerConta(a.id)).toBe(1);
    expect(ana.conn.idDaConta).toBeUndefined();
    expect(ana.conn.sessao).toBeUndefined();
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    expect(ana.ultimoErro).toBeUndefined();
    expect(saldoNoLugar(ana, 0) ?? null).toBeNull();
    expect(m.carteiras.ler(a.id)!.saldo).toBe(SALDO_INICIAL); // a carteira em si não foi tocada: sair da conta não a apaga
  });

  it('quem está sentado fica no lugar, sem carteira: o estado-sala mostra saldo null para todos; a outra conta segue', () => {
    const m = mundo();
    const { a, ana, beto } = duasContas(m);
    expect(saldoNoLugar(beto, 0)).toBe(SALDO_INICIAL);
    expect(m.amb.registro.esquecerConta(a.id)).toBe(1);
    for (const c of [ana, beto]) {
      expect(saldoNoLugar(c, 0) ?? null, c.nome).toBeNull();
      expect(saldoNoLugar(c, 1), c.nome).toBe(SALDO_INICIAL);
      expect(c.estado.lugares[0]!.nome).toBe('Ana');
    }
    expect(ana.conn.idDaConta).toBeUndefined();
    expect(beto.conn.idDaConta).toBeDefined();
  });

  it('uma aposta em curso com essa carteira continua até o fim (como a de quem sai no meio da partida)', () => {
    const m = mundo();
    const { a, b, ana, beto } = duasContas(m);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.estado.fase).toBe('jogando');
    m.amb.registro.esquecerConta(a.id);
    expect(saldoNoLugar(beto, 0) ?? null).toBeNull();
    terminar(m, ana.visao!.partida.vez === 0 ? ana : beto, 0);
    // o pote (10 de cada, o padrão) foi pago pelo rol de quando a partida começou: Ana ganhou e Beto pagou
    expect(m.carteiras.ler(a.id)!.saldo).toBe(SALDO_INICIAL + 10);
    expect(m.carteiras.ler(b.id)!.saldo).toBe(SALDO_INICIAL - 10);
    expect(ana.conn.ultima('aposta-paga')).toBeDefined();
  });

  it('o sair de um aparelho (com a sessão) tira só as conexões daquele token; o outro aparelho da mesma conta segue com a carteira (L61c)', () => {
    const m = mundo();
    const a = contaNova(m);
    const TOKEN_C = 'C'.repeat(43);
    const celular = cliente(m, 'Cel', a.id, TOKEN_A);
    const pc = cliente(m, 'PC', a.id, TOKEN_C);
    m.amb.registro.conexaoAberta(celular.conn);
    m.amb.registro.conexaoAberta(pc.conn);
    pc.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    expect(saldoNoLugar(pc, 0)).toBe(SALDO_INICIAL);
    expect(m.amb.registro.esquecerConta(a.id, TOKEN_A)).toBe(1);
    expect(celular.conn.idDaConta).toBeUndefined();
    expect(pc.conn.idDaConta).toBe(a.id);
    expect(pc.conn.sessao).toBe(TOKEN_C);
    expect(saldoNoLugar(pc, 0)).toBe(SALDO_INICIAL); // o lugar do PC segue com a carteira
  });

  it('o sair tira a carteira do lugar do aparelho que saiu, se a outra conexão da conta não está nele (L61c)', () => {
    const m = mundo();
    const a = contaNova(m);
    const TOKEN_C = 'C'.repeat(43);
    const celular = cliente(m, 'Cel', a.id, TOKEN_A);
    const pc = cliente(m, 'PC', a.id, TOKEN_C);
    m.amb.registro.conexaoAberta(pc.conn);
    celular.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    expect(m.amb.registro.esquecerConta(a.id, TOKEN_A)).toBe(1);
    expect(saldoNoLugar(celular, 0) ?? null).toBeNull();
    expect(pc.conn.idDaConta).toBe(a.id);
  });

  it('o excluir (sem sessão) segue levando todas as conexões e todos os lugares da conta (L61c)', () => {
    const m = mundo();
    const a = contaNova(m);
    const celular = cliente(m, 'Cel', a.id, TOKEN_A);
    const pc = cliente(m, 'PC', a.id, 'C'.repeat(43));
    m.amb.registro.conexaoAberta(celular.conn);
    pc.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    expect(m.amb.registro.esquecerConta(a.id)).toBe(2);
    expect(pc.conn.idDaConta).toBeUndefined();
    expect(saldoNoLugar(pc, 0) ?? null).toBeNull();
  });

  it('a conta de outro id não é tocada', () => {
    const m = mundo();
    const { b, ana, beto } = duasContas(m);
    expect(m.amb.registro.esquecerConta(ID_FORA)).toBe(0);
    expect(saldoNoLugar(ana, 1)).toBe(SALDO_INICIAL);
    expect(beto.conn.idDaConta).toBe(b.id);
  });
});

describe('o registro dos excluídos: a conexão com o id de uma conta apagada não a faz renascer (b)', () => {
  it('o criar-sala de uma conexão que ainda traz o id excluído (pelo portal) joga sem carteira e não recria nada', () => {
    const m = mundo(true);
    const a = contaNova(m);
    m.carteiras.apagarDasContas([a.id]); // o que a varredura faz quando o portal exclui
    expect(m.carteiras.total).toBe(0);
    const ana = cliente(m, 'Ana', a.id, TOKEN_A);
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    expect(ana.ultimoErro).toBeUndefined();
    expect(saldoNoLugar(ana, 0) ?? null).toBeNull();
    expect(m.carteiras.total).toBe(0);
    expect(m.carteiras.ler(a.id)).toBeUndefined();
    expect(ana.conn.idDaConta).toBeUndefined(); // a conexão deixou de trazer a conta
  });

  it('o entrar também', () => {
    const m = mundo(true);
    const a = contaNova(m);
    const anfitriao = cliente(m, 'Dono', null);
    anfitriao.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    m.carteiras.apagarDasContas([a.id]);
    const ana = cliente(m, 'Ana', a.id, TOKEN_A);
    ana.entrar(anfitriao.codigo);
    expect(saldoNoLugar(anfitriao, 1) ?? null).toBeNull();
    expect(m.carteiras.total).toBe(0);
  });
});

describe('a volta pelo token do lugar só leva a carteira da conta com a conta (c)', () => {
  function sentadoComAConta() {
    const m = mundo();
    const { a, ana, beto } = duasContas(m);
    return { m, a, ana, beto };
  }

  it('a volta sem a sessão (quem saiu da conta) segue no lugar, sem carteira', () => {
    const { m, a, ana, beto } = sentadoComAConta();
    const token = ana.token;
    ana.sair(); // a conexão caiu; o lugar guarda o token
    ana.conn = new ConexaoFalsa('Ana*'); // volta sem idDaConta
    ana.entrar(beto.codigo, token);
    expect(ana.ultimoErro).toBeUndefined();
    expect(ana.lugar).toBe(0);
    expect(saldoNoLugar(beto, 0) ?? null).toBeNull();
    expect(saldoNoLugar(ana, 0) ?? null).toBeNull();
    expect(m.carteiras.ler(a.id)!.saldo).toBe(SALDO_INICIAL);
  });

  it('a volta com outra conta também perde a carteira; com a mesma conta a mantém', () => {
    const { m, a, ana, beto } = sentadoComAConta();
    const token = ana.token;
    ana.sair();
    ana.conn = new ConexaoFalsa('Ana*');
    ana.conn.idDaConta = ID_FORA;
    ana.entrar(beto.codigo, token);
    expect(saldoNoLugar(beto, 0) ?? null).toBeNull();

    const m2 = sentadoComAConta();
    const token2 = m2.ana.token;
    m2.ana.sair();
    m2.ana.conn = new ConexaoFalsa('Ana*');
    m2.ana.conn.idDaConta = m2.a.id;
    m2.ana.entrar(m2.beto.codigo, token2);
    expect(saldoNoLugar(m2.beto, 0)).toBe(SALDO_INICIAL);
    void m;
    void a;
  });

  it('a carteira de um convidado (sem conta) continua voltando só com o token', () => {
    const m = mundo();
    const c = m.carteiras.criar()!;
    const ana = new ClienteDeTeste(m.amb, 'Ana');
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, { carteira: c.codigo });
    const beto = new ClienteDeTeste(m.amb, 'Beto');
    beto.entrar(ana.codigo);
    const token = ana.token;
    ana.sair();
    ana.conn = new ConexaoFalsa('Ana*');
    ana.entrar(beto.codigo, token);
    expect(saldoNoLugar(beto, 0)).toBe(SALDO_INICIAL);
  });
});

describe('a releitura da sessão antes de mexer em moeda (d)', () => {
  const passarOTempo = (m: Mundo, ms: number): void => m.amb.semTick(ms);

  it('sessão conferida há menos de 10 minutos não pergunta ao Banco', () => {
    const m = mundo();
    const a = contaNova(m);
    const ana = cliente(m, 'Ana', a.id, TOKEN_A);
    passarOTempo(m, INTERVALO_DA_RELEITURA_MS - 1);
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    expect(m.perguntas).toEqual([]);
    expect(saldoNoLugar(ana, 0)).toBe(SALDO_INICIAL);
  });

  it('passados 10 minutos, o criar-sala pergunta uma vez; sessão viva segue com a carteira e a pergunta não se repete', async () => {
    const m = mundo();
    const a = contaNova(m);
    const ana = cliente(m, 'Ana', a.id, TOKEN_A);
    passarOTempo(m, INTERVALO_DA_RELEITURA_MS);
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    expect(ana.conn.ultima('boas-vindas')).toBeUndefined(); // espera o Banco responder
    await esperar();
    expect(m.perguntas).toEqual([TOKEN_A]);
    expect(saldoNoLugar(ana, 0)).toBe(SALDO_INICIAL);
    passarOTempo(m, 5 * 60_000);
    ana.enviar({ tipo: 'iniciar' });
    expect(m.perguntas).toHaveLength(1);
  });

  it('sessão morta (portal, senha nova): faz o que o esquecerConta faz naquela conexão', async () => {
    const m = mundo();
    const a = contaNova(m);
    const ana = cliente(m, 'Ana', a.id, TOKEN_A);
    m.sessoes.set(TOKEN_A, null);
    passarOTempo(m, INTERVALO_DA_RELEITURA_MS);
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    await esperar();
    expect(ana.ultimoErro).toBeUndefined();
    expect(ana.conn.idDaConta).toBeUndefined();
    expect(saldoNoLugar(ana, 0) ?? null).toBeNull();
    expect(m.amb.logs.some((l) => l.startsWith('sessao-morta'))).toBe(true);
  });

  it('um fn que lança depois da releitura não vira rejeição sem tratamento: deixa o log erro-interno com o tipo da mensagem (L61c)', async () => {
    const m = mundo();
    const a = contaNova(m);
    const ana = cliente(m, 'Ana', a.id, TOKEN_A);
    const solta: unknown[] = [];
    const ouvinte = (e: unknown): void => void solta.push(e);
    process.on('unhandledRejection', ouvinte);
    try {
      vi.spyOn(m.amb.registro as unknown as { criar(): void }, 'criar').mockImplementation(() => {
        throw new Error('estourou');
      });
      passarOTempo(m, INTERVALO_DA_RELEITURA_MS);
      ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
      await esperar();
      await esperar();
      expect(solta).toEqual([]);
      const linha = m.amb.logs.find((l) => l.startsWith('erro-interno'));
      expect(linha).toBeDefined();
      expect(linha).toContain('criar-sala');
      expect(linha).toContain('estourou');
      expect(linha).not.toContain(a.id);
    } finally {
      process.off('unhandledRejection', ouvinte);
    }
  });

  it('o entrar também relê; o token da sessão nunca vai a log', async () => {
    const m = mundo();
    const dono = cliente(m, 'Dono', null);
    dono.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    const a = contaNova(m);
    const ana = cliente(m, 'Ana', a.id, TOKEN_A);
    m.sessoes.set(TOKEN_A, null);
    passarOTempo(m, INTERVALO_DA_RELEITURA_MS);
    ana.entrar(dono.codigo);
    await esperar();
    expect(saldoNoLugar(dono, 1) ?? null).toBeNull();
    expect(m.amb.logs.join('\n')).not.toContain(TOKEN_A);
  });

  it('Banco fora do ar não derruba ninguém: mantém a conta, loga e só tenta de novo daqui a um minuto', async () => {
    const m = mundo();
    const a = contaNova(m);
    const ana = cliente(m, 'Ana', a.id, TOKEN_A);
    m.sessoes.set(TOKEN_A, 'fora');
    passarOTempo(m, INTERVALO_DA_RELEITURA_MS);
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    await esperar();
    expect(ana.ultimoErro).toBeUndefined();
    expect(ana.conn.idDaConta).toBe(a.id);
    expect(saldoNoLugar(ana, 0)).toBe(SALDO_INICIAL);
    expect(m.amb.logs.some((l) => l.startsWith('sessao-releitura-falhou'))).toBe(true);
    passarOTempo(m, 30_000);
    ana.enviar({ tipo: 'iniciar' });
    expect(m.perguntas).toHaveLength(1);
  });

  it('o começo de uma partida com aposta confere a sessão de quem está sentado com conta; a morta joga sem carteira e o pote deixa de valer', async () => {
    const m = mundo();
    const { b, ana, beto } = duasContas(m);
    m.sessoes.set(TOKEN_B, null); // a sessão do Beto morreu
    passarOTempo(m, INTERVALO_DA_RELEITURA_MS);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.estado.fase).toBe('espera'); // espera as respostas do Banco
    await esperar();
    expect(m.perguntas.sort()).toEqual([TOKEN_A, TOKEN_B]);
    expect(ana.estado.fase).toBe('jogando');
    expect(beto.conn.idDaConta).toBeUndefined();
    expect(saldoNoLugar(ana, 1) ?? null).toBeNull();
    terminar(m, ana.visao!.partida.vez === 0 ? ana : beto, 0);
    expect(m.carteiras.ler(b.id)!.saldo).toBe(SALDO_INICIAL); // o Beto não apostou
  });

  it('conexão que caiu enquanto o Banco respondia não abre sala', async () => {
    const m = mundo();
    const a = contaNova(m);
    const ana = cliente(m, 'Ana', a.id, TOKEN_A);
    passarOTempo(m, INTERVALO_DA_RELEITURA_MS);
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    ana.sair();
    await esperar();
    expect(m.amb.registro.totalSalas).toBe(0);
  });

  it('a conexão sem token de sessão (aberta antes do L61b) nunca é relida', () => {
    const m = mundo();
    const a = contaNova(m);
    const ana = cliente(m, 'Ana', a.id);
    passarOTempo(m, 10 * INTERVALO_DA_RELEITURA_MS);
    ana.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE);
    expect(m.perguntas).toEqual([]);
    expect(saldoNoLugar(ana, 0)).toBe(SALDO_INICIAL);
  });
});
