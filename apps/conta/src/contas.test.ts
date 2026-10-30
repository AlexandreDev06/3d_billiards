import { beforeEach, describe, expect, it } from 'vitest';
import type { ComSessao, Lancamento } from './contrato';
import { Contas, MAX_SESSOES_POR_CONTA } from './contas';
import { hashDaSenha, resumoHex } from './cripto';
import { Moedas } from './moedas';
import { aleatorioFixo, bancoDeTeste, relogioFalso, type BancoDeTeste } from './para-testes';

const DIA = 24 * 3600_000;
const HORA = 3600_000;
const CODIGO = 'C'.repeat(43);
const L: Lancamento = { jogo: 'sinuca', motivo: 'teste' };
const PEPPER = 'pepper-de-teste';

let b: BancoDeTeste;
let relogio: ReturnType<typeof relogioFalso>;
let moedas: Moedas;
let contas: Contas;
let hashChamado: number;
/** Se preenchido, o PRÓXIMO hash só termina depois dele: segura um pedido no meio do `await` para outro passar. */
let portao: Promise<void> | null = null;

const contarHash: typeof hashDaSenha = async (senha, sal, pepper, iteracoes) => {
  hashChamado++;
  const espera = portao;
  portao = null;
  const r = await hashDaSenha(senha, sal, pepper, iteracoes);
  if (espera !== null) await espera;
  return r;
};

function montar(pepper: string | null = PEPPER, maxContas = 50_000): Contas {
  return new Contas({ sql: b.sql, transacao: b.transacao, relogio: relogio.agora, aleatorio: aleatorioFixo(7), moedas, pepper, saldoInicial: 100, maxContas, hash: contarHash });
}

const ok = (r: ComSessao): Extract<ComSessao, { ok: true }> => {
  if (!r.ok) throw new Error(`esperava ok, veio ${r.erro}`);
  return r;
};
const linha = (tabela: string, id: string) => b.sql.exec(`SELECT * FROM ${tabela} WHERE id = ?`, id).toArray()[0];
const contarLinhas = (tabela: string): number => Number(b.sql.exec(`SELECT COUNT(*) AS n FROM ${tabela}`).toArray()[0]!.n);
const soma = (id: string): number => Number(b.sql.exec('SELECT COALESCE(SUM(delta), 0) AS s FROM livro WHERE conta = ?', id).toArray()[0]!.s);

beforeEach(() => {
  b = bancoDeTeste();
  relogio = relogioFalso();
  moedas = new Moedas(b.sql, b.transacao, relogio.agora);
  hashChamado = 0;
  portao = null;
  contas = montar();
});

describe('Contas: criar e entrar', () => {
  it('cria do zero com 100 e entra com o e-mail escrito de outro jeito', async () => {
    const r = await contas.criar({ email: 'ana@gmail.com', senha: 'segredo-bom', nome: 'Ana' });
    expect(r).toMatchObject({ ok: true, conta: { nome: 'Ana', email: 'ana@gmail.com', saldo: 100 } });
    expect(await contas.entrar('  ANA@gmail.com ', 'segredo-bom')).toMatchObject({ ok: true, conta: { email: 'ana@gmail.com' } });
  });
  it('a conta nova é conta (não convidado), com o id derivado de um token e a abertura no livro', async () => {
    const { conta } = ok(await contas.criar({ email: 'ana@gmail.com', senha: 'segredo-bom', nome: 'Ana' }));
    expect(conta.id).toMatch(/^[0-9a-f]{64}$/);
    expect(linha('contas', conta.id)).toMatchObject({ convidado: 0, saldo: 100, iteracoes: 100_000 });
    expect(soma(conta.id)).toBe(100);
  });
  it('o banco guarda só o resumo do token da sessão, e hash e sal em hexadecimal', async () => {
    const s = ok(await contas.criar({ email: 'ana@gmail.com', senha: 'segredo-bom', nome: 'Ana' }));
    const todas = b.sql.exec('SELECT hash FROM sessoes').toArray();
    expect(todas).toEqual([{ hash: await resumoHex(s.token) }]);
    expect(String(linha('contas', s.conta.id)!.hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(linha('contas', s.conta.id)!.sal)).toMatch(/^[0-9a-f]{32}$/);
  });
  it('o e-mail já usado avisa, mesmo escrito de outro jeito', async () => {
    await contas.criar({ email: 'ana@gmail.com', senha: 'segredo-bom', nome: 'Ana' });
    expect(await contas.criar({ email: 'Ana@Gmail.com', senha: 'outra-senha', nome: 'Outra' })).toEqual({ ok: false, erro: 'email-em-uso' });
    expect(contarLinhas('contas')).toBe(1);
  });
  it('campos ruins são recusados antes do hash', async () => {
    expect(await contas.criar({ email: 'ruim', senha: 'segredo-bom', nome: 'A' })).toEqual({ ok: false, erro: 'email-invalido' });
    expect(await contas.criar({ email: 'a@b.com', senha: 'curta', nome: 'A' })).toEqual({ ok: false, erro: 'senha-curta' });
    expect(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: '   ' })).toEqual({ ok: false, erro: 'nome-invalido' });
    expect(hashChamado).toBe(0);
    expect(contarLinhas('contas')).toBe(0);
  });
  it('senha enorme é recusada sem hash', async () => {
    expect(await contas.criar({ email: 'a@b.com', senha: 'x'.repeat(10_000), nome: 'A' })).toEqual({ ok: false, erro: 'senha-longa' });
    expect(await contas.entrar('a@b.com', 'x'.repeat(10_000))).toEqual({ ok: false, erro: 'senha-longa' });
    expect(hashChamado).toBe(0);
  });
  it('e-mail em uso também não gasta hash', async () => {
    await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' });
    hashChamado = 0;
    expect(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'B' })).toEqual({ ok: false, erro: 'email-em-uso' });
    expect(hashChamado).toBe(0);
  });
  it('só a violação do UNIQUE do e-mail vira email-em-uso; qualquer outra sobe como erro', async () => {
    const quebrada = (mensagem: string) =>
      new Contas({ sql: b.sql, transacao: () => { throw new Error(mensagem); }, relogio: relogio.agora, aleatorio: aleatorioFixo(7), moedas, pepper: PEPPER, saldoInicial: 100, maxContas: 50_000, hash: contarHash });
    const dados = { email: 'a@b.com', senha: 'segredo-bom', nome: 'A' };
    expect(await quebrada('UNIQUE constraint failed: contas.email: SQLITE_CONSTRAINT').criar(dados)).toEqual({ ok: false, erro: 'email-em-uso' });
    expect(await quebrada('UNIQUE constraint failed: contas.email').criar(dados)).toEqual({ ok: false, erro: 'email-em-uso' });
    for (const outra of ['UNIQUE constraint failed: contas.id', 'UNIQUE constraint failed: sessoes.hash', 'UNIQUE constraint failed: livro.chave, livro.conta', 'disco cheio']) {
      await expect(quebrada(outra).criar(dados), outra).rejects.toThrow(outra);
    }
  });
  it('e-mail sem conta e senha errada respondem igual, e o sem conta roda um hash de mentira', async () => {
    await contas.criar({ email: 'ana@gmail.com', senha: 'segredo-bom', nome: 'Ana' });
    hashChamado = 0;
    expect(await contas.entrar('ninguem@gmail.com', 'segredo-bom')).toEqual({ ok: false, erro: 'email-ou-senha' });
    expect(hashChamado).toBe(1);
    expect(await contas.entrar('ana@gmail.com', 'errada-123')).toEqual({ ok: false, erro: 'email-ou-senha' });
    expect(hashChamado).toBe(2);
    expect(await contas.entrar('lixo', 'segredo-bom')).toEqual({ ok: false, erro: 'email-ou-senha' });
  });
  it('sem pepper nada de senha, e o hash nem é chamado', async () => {
    const semPepper = montar(null);
    expect(await semPepper.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' })).toEqual({ ok: false, erro: 'nao-configurado' });
    expect(await semPepper.entrar('a@b.com', 'segredo-bom')).toEqual({ ok: false, erro: 'nao-configurado' });
    expect(await semPepper.novaSenha('T'.repeat(43), 'segredo-bom')).toEqual({ ok: false, erro: 'nao-configurado' });
    expect(hashChamado).toBe(0);
    expect(contarLinhas('contas')).toBe(0);
  });
  it('o teto de contas dá cheio, e a excluída não conta', async () => {
    const pequena = montar(PEPPER, 1);
    const a = ok(await pequena.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    expect(await pequena.criar({ email: 'c@d.com', senha: 'segredo-bom', nome: 'C' })).toEqual({ ok: false, erro: 'cheio' });
    await pequena.excluir(a.token, 'segredo-bom');
    expect(await pequena.criar({ email: 'c@d.com', senha: 'segredo-bom', nome: 'C' })).toMatchObject({ ok: true });
  });
});

describe('Contas: o convidado vira conta', () => {
  it('com o mesmo id e o mesmo saldo, e só uma vez', async () => {
    const id = await resumoHex(CODIGO);
    moedas.garantirConta(id, 100);
    moedas.creditar(id, 900, 'k', L);
    const r = await contas.criar({ email: 'c@d.com', senha: 'segredo-bom', nome: 'C', convidadoId: id });
    expect(r).toMatchObject({ ok: true, conta: { id, saldo: 1000 } });
    expect(linha('contas', id)).toMatchObject({ convidado: 0, email: 'c@d.com' });
    expect(soma(id)).toBe(1000);
    expect(await contas.criar({ email: 'e@f.com', senha: 'segredo-bom', nome: 'E', convidadoId: id })).toEqual({ ok: false, erro: 'convidado-ja-e-conta' });
    expect(await contas.contaDoCodigo(CODIGO)).toEqual({ id, convidado: false });
  });
  it('sem linha ainda, o convidado é criado com o id e o saldo inicial', async () => {
    const id = await resumoHex(CODIGO);
    expect(await contas.criar({ email: 'c@d.com', senha: 'segredo-bom', nome: 'C', convidadoId: id })).toMatchObject({ ok: true, conta: { id, saldo: 100 } });
  });
  it('convidado excluído ou id ruim dá convidado-ja-e-conta', async () => {
    const id = await resumoHex(CODIGO);
    const s = ok(await contas.criar({ email: 'c@d.com', senha: 'segredo-bom', nome: 'C', convidadoId: id }));
    await contas.excluir(s.token, 'segredo-bom');
    expect(await contas.criar({ email: 'e@f.com', senha: 'segredo-bom', nome: 'E', convidadoId: id })).toEqual({ ok: false, erro: 'convidado-ja-e-conta' });
    expect(await contas.criar({ email: 'e@f.com', senha: 'segredo-bom', nome: 'E', convidadoId: 'nao-e-id' })).toEqual({ ok: false, erro: 'convidado-ja-e-conta' });
  });
  it('contaDoCodigo: convidado, conta, sem linha e código malformado', async () => {
    const id = await resumoHex(CODIGO);
    expect(await contas.contaDoCodigo(CODIGO)).toBeNull();
    moedas.garantirConta(id, 100);
    expect(await contas.contaDoCodigo(CODIGO)).toEqual({ id, convidado: true });
    expect(await contas.contaDoCodigo('curto')).toBeNull();
  });
  it('a conversão que falha (e-mail em uso) não muda o convidado', async () => {
    await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' });
    const id = await resumoHex(CODIGO);
    moedas.garantirConta(id, 100);
    expect(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'C', convidadoId: id })).toEqual({ ok: false, erro: 'email-em-uso' });
    expect(linha('contas', id)).toMatchObject({ convidado: 1, email: null });
  });
});

describe('Contas: concorrência no await do hash', () => {
  it('dois criar ao mesmo tempo com o mesmo e-mail: um ganha, o outro avisa', async () => {
    const [x, y] = await Promise.all([1, 2].map(() => contas.criar({ email: 'x@y.com', senha: 'segredo-bom', nome: 'X' })));
    expect([x!.ok, y!.ok].sort()).toEqual([false, true]);
    expect([x, y].find((r) => !r!.ok)).toEqual({ ok: false, erro: 'email-em-uso' });
    expect(contarLinhas('contas')).toBe(1);
    expect(contarLinhas('sessoes')).toBe(1);
    expect(hashChamado).toBe(2); // os dois passaram da conferência cedo: a corrida foi de verdade
  });
  it('duas conversões do mesmo convidado ao mesmo tempo: uma ganha', async () => {
    const id = await resumoHex(CODIGO);
    moedas.garantirConta(id, 100);
    const [x, y] = await Promise.all([
      contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A', convidadoId: id }),
      contas.criar({ email: 'c@d.com', senha: 'segredo-bom', nome: 'C', convidadoId: id }),
    ]);
    expect([x.ok, y.ok].sort()).toEqual([false, true]);
    expect([x, y].find((r) => !r.ok)).toEqual({ ok: false, erro: 'convidado-ja-e-conta' });
    expect(contarLinhas('contas')).toBe(1);
    expect(linha('contas', id)!.email).toMatch(/^(a@b\.com|c@d\.com)$/);
    expect(soma(id)).toBe(100);
  });
  it('a senha mudada durante o hash do entrar não deixa a antiga passar', async () => {
    const s = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    let soltar!: () => void;
    portao = new Promise<void>((r) => (soltar = r));
    const entrando = contas.entrar('a@b.com', 'segredo-bom'); // confere a senha antiga e fica parado no portão
    const { link } = (await contas.pedirRecuperacao('a@b.com'))!;
    await contas.novaSenha(link.split('#token=')[1]!, 'senha-nova-1');
    soltar();
    expect(await entrando).toEqual({ ok: false, erro: 'email-ou-senha' });
    expect(await contas.sessao(s.token)).toBeNull();
  });
});

describe('Contas: sessões', () => {
  it('a sessão renova depois de um dia e vence em 90', async () => {
    const { token } = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    expect((await contas.sessao(token))!.renovada).toBe(false);
    relogio.avancar(DIA + 1);
    expect((await contas.sessao(token))!.renovada).toBe(true);
    expect((await contas.sessao(token))!.renovada).toBe(false);
    relogio.avancar(90 * DIA + 1);
    expect(await contas.sessao(token)).toBeNull();
    expect(contarLinhas('sessoes')).toBe(0);
  });
  it('sem renovar, vence 90 dias depois da criação', async () => {
    const { token } = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    relogio.avancar(90 * DIA - 1);
    expect(await contas.sessao(token)).toMatchObject({ conta: { email: 'a@b.com' } });
  });
  it('no máximo 20 por conta, e a mais velha sai', async () => {
    const primeira = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    const outras: string[] = [];
    for (let i = 1; i < MAX_SESSOES_POR_CONTA; i++) outras.push(ok(await contas.entrar('a@b.com', 'segredo-bom')).token);
    expect(contarLinhas('sessoes')).toBe(20);
    const vinte_e_um = ok(await contas.entrar('a@b.com', 'segredo-bom')).token;
    expect(contarLinhas('sessoes')).toBe(20);
    expect(await contas.sessao(primeira.token)).toBeNull();
    expect(await contas.sessao(outras[0]!)).not.toBeNull();
    expect(await contas.sessao(vinte_e_um)).not.toBeNull();
  });
  it('o limite é por conta', async () => {
    const a = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    for (let i = 0; i < 25; i++) ok(await contas.criar({ email: `u${i}@b.com`, senha: 'segredo-bom', nome: 'U' }));
    expect(await contas.sessao(a.token)).not.toBeNull();
  });
  it('token malformado ou desconhecido dá null', async () => {
    expect(await contas.sessao('')).toBeNull();
    expect(await contas.sessao('x'.repeat(10_000))).toBeNull();
    expect(await contas.sessao('A'.repeat(43))).toBeNull();
  });
  it('sair apaga só aquela sessão', async () => {
    const s1 = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    const s2 = ok(await contas.entrar('a@b.com', 'segredo-bom'));
    await contas.sair(s1.token);
    expect(await contas.sessao(s1.token)).toBeNull();
    expect(await contas.sessao(s2.token)).not.toBeNull();
  });
  it('mudar o nome exige sessão e nome válido', async () => {
    const { token } = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'Ana' }));
    expect(await contas.mudarNome(token, '  Beto ')).toMatchObject({ ok: true, conta: { nome: 'Beto' } });
    expect((await contas.sessao(token))!.conta.nome).toBe('Beto');
    expect(await contas.mudarNome(token, '')).toEqual({ ok: false, erro: 'nome-invalido' });
    expect(await contas.mudarNome('A'.repeat(43), 'Zé')).toEqual({ ok: false, erro: 'sem-sessao' });
    expect((await contas.sessao(token))!.conta.nome).toBe('Beto');
  });
});

describe('Contas: excluir', () => {
  it('zera, apaga os dados pessoais e derruba todas as sessões', async () => {
    const s1 = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    const s2 = ok(await contas.entrar('a@b.com', 'segredo-bom'));
    moedas.reservar([{ id: s1.conta.id, valor: 10 }], 'aposta:1', L);
    expect(await contas.excluir(s1.token, 'errada-123')).toEqual({ ok: false, erro: 'senha-errada' });
    expect(await contas.sessao(s1.token)).not.toBeNull();
    expect(await contas.excluir(s1.token, 'segredo-bom')).toEqual({ ok: true });
    expect(await contas.sessao(s2.token)).toBeNull();
    expect(await contas.sessao(s1.token)).toBeNull();
    expect(linha('contas', s1.conta.id)).toMatchObject({ email: null, nome: null, hash: null, sal: null, iteracoes: null, saldo: 0 });
    expect(linha('contas', s1.conta.id)!.excluida_em).toBe(relogio.agora());
    expect(soma(s1.conta.id)).toBe(0);
    expect(contarLinhas('sessoes')).toBe(0);
    expect(contarLinhas('reservas')).toBe(0);
    expect(moedas.saldo(s1.conta.id)).toBeNull();
    expect(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' })).toMatchObject({ ok: true }); // o e-mail fica livre
    expect((await contas.entrar('a@b.com', 'segredo-bom')) as ComSessao).toMatchObject({ ok: true });
  });
  it('sem sessão, com senha curta ou enorme', async () => {
    const { token } = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    hashChamado = 0;
    expect(await contas.excluir('A'.repeat(43), 'segredo-bom')).toEqual({ ok: false, erro: 'sem-sessao' });
    expect(await contas.excluir(token, 'x')).toEqual({ ok: false, erro: 'senha-errada' });
    expect(await contas.excluir(token, 'x'.repeat(10_000))).toEqual({ ok: false, erro: 'senha-longa' });
    expect(hashChamado).toBe(0);
    expect(await contas.sessao(token)).not.toBeNull();
  });
  it('os pedidos de recuperação da conta somem', async () => {
    const { token } = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    await contas.pedirRecuperacao('a@b.com');
    expect(contarLinhas('recuperacoes')).toBe(1);
    await contas.excluir(token, 'segredo-bom');
    expect(contarLinhas('recuperacoes')).toBe(0);
  });
  it('uma exceção depois de um Moedas.creditar dentro da transação desfaz o crédito também', async () => {
    const { token, conta } = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    const falho = {
      zerar: (id: string, chave: string) => {
        moedas.creditar(id, 50, 'bonus:dentro', L);
        void chave;
        throw new Error('depois do crédito');
      },
    } as unknown as Moedas;
    const c = new Contas({ sql: b.sql, transacao: b.transacao, relogio: relogio.agora, aleatorio: aleatorioFixo(9), moedas: falho, pepper: PEPPER, saldoInicial: 100, maxContas: 10 });
    await expect(c.excluir(token, 'segredo-bom')).rejects.toThrow('depois do crédito');
    expect(moedas.saldo(conta.id)!.saldo).toBe(100);
    expect(moedas.operacao('bonus:dentro')).toBeNull();
    expect(soma(conta.id)).toBe(100);
    expect(linha('contas', conta.id)).toMatchObject({ email: 'a@b.com' });
    expect(await contas.sessao(token)).not.toBeNull();
  });
  it('uma exceção no meio de criar desfaz a abertura da conta (Moedas dentro de Contas)', async () => {
    const real = moedas.garantirConta.bind(moedas);
    const falho = Object.create(moedas) as Moedas;
    falho.garantirConta = (...a: Parameters<Moedas['garantirConta']>) => {
      real(...a);
      throw new Error('depois da abertura');
    };
    const c = new Contas({ sql: b.sql, transacao: b.transacao, relogio: relogio.agora, aleatorio: aleatorioFixo(9), moedas: falho, pepper: PEPPER, saldoInicial: 100, maxContas: 10 });
    await expect(c.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' })).rejects.toThrow('depois da abertura');
    expect(contarLinhas('contas')).toBe(0);
    expect(contarLinhas('livro')).toBe(0);
  });
});

const tokenDoLink = (link: string): string => link.split('#token=')[1]!;

describe('Contas: esqueci a senha', () => {
  it('o link leva o token só no fragmento e funciona uma vez', async () => {
    await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' });
    const { para, link } = (await contas.pedirRecuperacao('A@B.com'))!;
    expect(para).toBe('a@b.com');
    expect(link.startsWith('https://becogames.app/nova-senha#token=')).toBe(true);
    expect(link).not.toContain('?');
    const token = tokenDoLink(link);
    expect(await contas.novaSenha(token, 'senha-nova-1')).toMatchObject({ ok: true, conta: { email: 'a@b.com' } });
    expect(await contas.novaSenha(token, 'senha-nova-2')).toEqual({ ok: false, erro: 'link-vencido' });
    expect(await contas.entrar('a@b.com', 'senha-nova-1')).toMatchObject({ ok: true });
    expect(await contas.entrar('a@b.com', 'segredo-bom')).toEqual({ ok: false, erro: 'email-ou-senha' });
  });
  it('o banco guarda só o resumo do token', async () => {
    await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' });
    const token = tokenDoLink((await contas.pedirRecuperacao('a@b.com'))!.link);
    expect(b.sql.exec('SELECT hash, usada FROM recuperacoes').toArray()).toEqual([{ hash: await resumoHex(token), usada: 0 }]);
  });
  it('a senha nova derruba as sessões antigas e abre uma nova', async () => {
    const antiga = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    const outra = ok(await contas.entrar('a@b.com', 'segredo-bom'));
    const token = tokenDoLink((await contas.pedirRecuperacao('a@b.com'))!.link);
    const nova = ok(await contas.novaSenha(token, 'senha-nova-1'));
    expect(await contas.sessao(antiga.token)).toBeNull();
    expect(await contas.sessao(outra.token)).toBeNull();
    expect(await contas.sessao(nova.token)).not.toBeNull();
    expect(contarLinhas('sessoes')).toBe(1);
  });
  it('vence em 1 hora e o pedido novo invalida o velho', async () => {
    await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' });
    const velho = tokenDoLink((await contas.pedirRecuperacao('a@b.com'))!.link);
    const novo = tokenDoLink((await contas.pedirRecuperacao('a@b.com'))!.link);
    expect(await contas.novaSenha(velho, 'senha-nova-1')).toEqual({ ok: false, erro: 'link-vencido' });
    relogio.avancar(HORA + 1);
    expect(await contas.novaSenha(novo, 'senha-nova-1')).toEqual({ ok: false, erro: 'link-vencido' });
    expect(await contas.entrar('a@b.com', 'segredo-bom')).toMatchObject({ ok: true });
  });
  it('o pedido novo vale quando o velho já venceu', async () => {
    await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' });
    await contas.pedirRecuperacao('a@b.com');
    relogio.avancar(HORA + 1);
    const novo = tokenDoLink((await contas.pedirRecuperacao('a@b.com'))!.link);
    expect(contarLinhas('recuperacoes')).toBe(1);
    expect(await contas.novaSenha(novo, 'senha-nova-1')).toMatchObject({ ok: true });
  });
  it('sem pepper não há link nem linha gravada, mesmo com conta', async () => {
    await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' });
    expect(await montar(null).pedirRecuperacao('a@b.com')).toBeNull();
    expect(contarLinhas('recuperacoes')).toBe(0);
    expect(await contas.pedirRecuperacao('a@b.com')).not.toBeNull();
  });
  it('sem conta ou com e-mail ruim não há e-mail', async () => {
    expect(await contas.pedirRecuperacao('ninguem@b.com')).toBeNull();
    expect(await contas.pedirRecuperacao('lixo')).toBeNull();
    expect(await contas.pedirRecuperacao(42)).toBeNull();
    expect(contarLinhas('recuperacoes')).toBe(0);
  });
  it('conta excluída não recebe link', async () => {
    const { token } = ok(await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' }));
    const link = (await contas.pedirRecuperacao('a@b.com'))!.link;
    await contas.excluir(token, 'segredo-bom');
    expect(await contas.pedirRecuperacao('a@b.com')).toBeNull();
    expect(await contas.novaSenha(tokenDoLink(link), 'senha-nova-1')).toEqual({ ok: false, erro: 'link-vencido' });
  });
  it('token ruim e senha ruim são recusados antes do hash', async () => {
    await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' });
    const token = tokenDoLink((await contas.pedirRecuperacao('a@b.com'))!.link);
    hashChamado = 0;
    expect(await contas.novaSenha('lixo', 'senha-nova-1')).toEqual({ ok: false, erro: 'link-vencido' });
    expect(await contas.novaSenha('A'.repeat(43), 'senha-nova-1')).toEqual({ ok: false, erro: 'link-vencido' });
    expect(await contas.novaSenha(token, 'curta')).toEqual({ ok: false, erro: 'senha-curta' });
    expect(await contas.novaSenha(token, 'x'.repeat(10_000))).toEqual({ ok: false, erro: 'senha-longa' });
    expect(hashChamado).toBe(0);
    expect(await contas.novaSenha(token, 'senha-nova-1')).toMatchObject({ ok: true }); // a senha ruim não gastou o link
  });
  it('dois usos do mesmo link ao mesmo tempo: um ganha', async () => {
    await contas.criar({ email: 'a@b.com', senha: 'segredo-bom', nome: 'A' });
    const token = tokenDoLink((await contas.pedirRecuperacao('a@b.com'))!.link);
    const [x, y] = await Promise.all([contas.novaSenha(token, 'senha-nova-1'), contas.novaSenha(token, 'senha-nova-2')]);
    expect([x.ok, y.ok].sort()).toEqual([false, true]);
    expect([x, y].find((r) => !r.ok)).toEqual({ ok: false, erro: 'link-vencido' });
    expect(contarLinhas('sessoes')).toBe(1);
  });
});

describe('Contas: excluidasDesde (a varredura dos jogos)', () => {
  const criarEExcluir = async (n: number): Promise<string> => {
    const { conta, token } = ok(await contas.criar({ email: `c${n}@gmail.com`, senha: 'segredo-bom', nome: `C${n}` }));
    expect(await contas.excluir(token, 'segredo-bom')).toEqual({ ok: true });
    return conta.id;
  };

  it('devolve só as excluídas, da mais antiga para a mais nova, e o ate é o instante da última', async () => {
    const a = await criarEExcluir(1);
    relogio.avancar(1000);
    ok(await contas.criar({ email: 'viva@gmail.com', senha: 'segredo-bom', nome: 'Viva' }));
    relogio.avancar(1000);
    const c = await criarEExcluir(3);
    const r = contas.excluidasDesde(0, 500);
    expect(r.ids).toEqual([a, c]);
    expect(r.ate).toBe(relogio.agora());
  });

  it('sem nenhuma, devolve vazio e o ate é o próprio ms', async () => {
    ok(await contas.criar({ email: 'viva@gmail.com', senha: 'segredo-bom', nome: 'Viva' }));
    expect(contas.excluidasDesde(123, 500)).toEqual({ ids: [], ate: 123 });
  });

  it('o ms é inclusivo: a última volta no pedido seguinte, e uma exclusão do mesmo milissegundo nunca fica para trás', async () => {
    const a = await criarEExcluir(1);
    const primeira = contas.excluidasDesde(0, 500);
    const b2 = await criarEExcluir(2); // mesmo instante (o relógio falso não andou)
    const segunda = contas.excluidasDesde(primeira.ate, 500);
    expect(segunda.ids).toContain(a);
    expect(segunda.ids).toContain(b2);
  });

  it('só do ms em diante', async () => {
    await criarEExcluir(1);
    relogio.avancar(5000);
    const nova = await criarEExcluir(2);
    expect(contas.excluidasDesde(relogio.agora(), 500).ids).toEqual([nova]);
  });

  it('o limite corta a página e o ate avança até a última devolvida', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(await criarEExcluir(i));
      relogio.avancar(10);
    }
    const pagina = contas.excluidasDesde(0, 2);
    expect(pagina.ids).toEqual(ids.slice(0, 2));
    const proxima = contas.excluidasDesde(pagina.ate, 2);
    expect(proxima.ids[0]).toBe(ids[1]);
    expect(proxima.ids).toContain(ids[2]);
  });

  it('o teto é 500 por chamada e argumento ruim lança RangeError', () => {
    expect(() => contas.excluidasDesde(0, 501)).toThrow(RangeError);
    expect(() => contas.excluidasDesde(0, 0)).toThrow(RangeError);
    expect(() => contas.excluidasDesde(-1, 10)).toThrow(RangeError);
    expect(() => contas.excluidasDesde(1.5, 10)).toThrow(RangeError);
    expect(() => contas.excluidasDesde(Number.NaN, 10)).toThrow(RangeError);
    expect(() => contas.excluidasDesde(0, 500)).not.toThrow();
  });

  it('500 excluídas cabem numa chamada só', async () => {
    for (let i = 0; i < 500; i++) {
      b.sql.exec('INSERT INTO contas (id, email, convidado, saldo, criada_em, excluida_em) VALUES (?, NULL, 0, 0, 1, ?)', `id${i.toString().padStart(4, '0')}`, 1000 + i);
    }
    const r = contas.excluidasDesde(0, 500);
    expect(r.ids).toHaveLength(500);
    expect(r.ate).toBe(1499);
  });

  it('usa o índice parcial das excluídas', () => {
    const plano = b.sql.exec('EXPLAIN QUERY PLAN SELECT id, excluida_em FROM contas WHERE excluida_em IS NOT NULL AND excluida_em >= ? ORDER BY excluida_em, id LIMIT ?', 0, 10).toArray();
    expect(JSON.stringify(plano)).toContain('contas_excluida_em');
  });
});
