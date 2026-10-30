/**
 * A caixa de saída do saldo (L57) na sala Node: o `carteiras.json` na versão 3 com o campo `saida`, que a 1 e a 2 continuam abrindo;
 * a caixa que sobrevive a recarregar o arquivo; o temporizador que tenta de novo; o fechamento que não deixa nada para trás; o servidor
 * com `SALDO_NO_BANCO=1` sobre o `BancoLocal` (banco.sqlite).
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { SALDO_INICIAL } from '@sinuca/protocolo';
import { ArmazemDeCarteiras, type OpcoesDoArmazem } from './carteiras';
import { VERSAO_DO_ARQUIVO, VERSAO_DO_ARQUIVO_COM_SAIDA } from './carteiras-base';
import { NOME_DO_BANCO_LOCAL } from './banco-local';
import { bancoDeTeste, type BancoDeTeste } from './para-testes-banco';
import { AmbienteDeRede } from './para-testes-ws';

const pastas: string[] = [];
const abertos: ArmazemDeCarteiras[] = [];
const pastaNova = (): string => {
  const p = mkdtempSync(join(tmpdir(), 'sala-banco-'));
  pastas.push(p);
  return p;
};
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(abertos.splice(0).map((a) => a.fechar()));
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

function abrir(pasta: string | null, bt: BancoDeTeste | null, agora: { valor: number }, extra: Partial<OpcoesDoArmazem> = {}) {
  const logs: string[] = [];
  const armazem = new ArmazemDeCarteiras({
    pasta,
    maxCarteiras: 100,
    atrasoMs: 5,
    relogio: () => agora.valor,
    log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
    banco: bt ? bt.banco : null,
    ...extra,
  });
  abertos.push(armazem);
  return { armazem, logs };
}

const arquivo = (pasta: string) => JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { versao: number; carteiras: Record<string, unknown>; saida?: { ordem: number; op: { tipo: string }; tentativas: number }[] };

describe('o carteiras.json com a caixa de saída', () => {
  it('com operações na caixa o arquivo é a versão 3 e leva o campo saida; esvaziada, volta a ser a versão 2 sem ele', async () => {
    const pasta = pastaNova();
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    bt.fora = true;
    const { armazem } = abrir(pasta, bt, agora);
    armazem.criar();
    armazem.criar();
    await armazem.drenarCaixa();
    await armazem.descarregar();
    const f = arquivo(pasta);
    expect(f.versao).toBe(VERSAO_DO_ARQUIVO_COM_SAIDA);
    expect(f.saida?.map((e) => [e.ordem, e.op.tipo, e.tentativas])).toEqual([[1, 'garantir', 1], [2, 'garantir', 0]]);

    bt.fora = false;
    agora.valor += 5000;
    await armazem.drenarCaixa();
    await armazem.descarregar();
    expect(arquivo(pasta)).toMatchObject({ versao: VERSAO_DO_ARQUIVO });
    expect(arquivo(pasta).saida).toBeUndefined();
  });

  it('a caixa sobrevive a recarregar o arquivo: o armazém novo lê as operações e as drena uma vez só', async () => {
    const pasta = pastaNova();
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    bt.fora = true;
    const antes = abrir(pasta, bt, agora);
    const a = antes.armazem.criar()!;
    const b = antes.armazem.criar()!;
    await antes.armazem.drenarCaixa();
    await antes.armazem.fechar();

    bt.fora = false;
    const depois = abrir(pasta, bt, agora);
    expect(depois.armazem.pendentesNaCaixa).toBe(2);
    await depois.armazem.drenarCaixa();
    expect(depois.armazem.pendentesNaCaixa).toBe(0);
    expect([bt.saldo(a.id), bt.saldo(b.id)]).toEqual([SALDO_INICIAL, SALDO_INICIAL]);
    expect(bt.chamadas.filter((n) => n === 'garantirConta')).toHaveLength(3); // a que caiu e as duas que passaram: cada conta entra uma vez no Banco
    await depois.armazem.fechar();
    const f = arquivo(pasta);
    expect(f.versao).toBe(VERSAO_DO_ARQUIVO);
    expect(Object.keys(f.carteiras)).toHaveLength(2);

    const terceiro = abrir(pasta, bt, agora);
    expect(terceiro.armazem.pendentesNaCaixa).toBe(0);
  });

  it('a 1 e a 2 continuam abrindo com a caixa ligada, sem operação nenhuma', () => {
    const pasta = pastaNova();
    const id = 'c'.repeat(64);
    const carteira = { saldo: 100, itens: [{ skin: 'classico', semente: 3, bolas: 0 }], skin: 'classico', criadaEm: 1, jogou: false };
    writeFileSync(join(pasta, 'carteiras.json'), JSON.stringify({ versao: 2, carteiras: { [id]: carteira } }));
    const v2 = abrir(pasta, bancoDeTeste(), { valor: 1 });
    expect(v2.armazem.total).toBe(1);
    expect(v2.armazem.pendentesNaCaixa).toBe(0);
    expect(v2.logs).toEqual([]);
  });

  it('desligado, o arquivo da versão 3 abre (as carteiras não se perdem), a saida fica sem ser enviada e o log diz quantas; a próxima gravação volta à versão 2', async () => {
    const pasta = pastaNova();
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    bt.fora = true;
    const ligado = abrir(pasta, bt, agora);
    ligado.armazem.criar();
    await ligado.armazem.fechar();
    expect(arquivo(pasta).versao).toBe(3);

    const desligado = abrir(pasta, null, agora);
    expect(desligado.armazem.total).toBe(1);
    expect(desligado.armazem.saldoNoBanco).toBe(false);
    expect(desligado.logs.filter((l) => l.startsWith('saida-ignorada'))).toEqual(['saida-ignorada {"operacoes":1}']);
    expect(desligado.logs.some((l) => l.startsWith('carteiras-corrompidas'))).toBe(false);
    desligado.armazem.criar();
    await desligado.armazem.descarregar();
    expect(arquivo(pasta)).toMatchObject({ versao: 2 });
  });

  it('entrada da saida que não presta é contada e ignorada; as boas ficam', () => {
    const pasta = pastaNova();
    const id = 'c'.repeat(64);
    const carteira = { saldo: 100, itens: [{ skin: 'classico', semente: 3, bolas: 0 }], skin: 'classico', criadaEm: 1, jogou: false };
    const boa = { ordem: 3, op: { tipo: 'garantir', id, saldo: 100 }, tentativas: 0, criadaEm: 1 };
    writeFileSync(join(pasta, 'carteiras.json'), JSON.stringify({ versao: 3, carteiras: { [id]: carteira }, saida: [boa, { ordem: 4, op: { tipo: 'sacar' } }] }));
    const { armazem, logs } = abrir(pasta, bancoDeTeste(), { valor: 1 });
    expect(armazem.pendentesNaCaixa).toBe(1);
    expect(logs).toContain('saida-invalida {"entradas":1}');
  });
});

describe('o temporizador da caixa e o fechamento', () => {
  it('Banco fora: tenta de novo sozinho na hora da próxima tentativa (5 s, depois 10 s)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const bt = bancoDeTeste(() => Date.now());
    bt.fora = true;
    const { armazem } = abrir(null, bt, { valor: 0 }, { relogio: () => Date.now() });
    const c = armazem.criar()!;
    await vi.advanceTimersByTimeAsync(1); // a primeira tentativa falha
    expect(bt.chamadas).toEqual(['garantirConta']);
    await vi.advanceTimersByTimeAsync(4_900);
    expect(bt.chamadas).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200); // 5 s: a segunda
    expect(bt.chamadas).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(bt.chamadas).toHaveLength(2);
    bt.fora = false;
    await vi.advanceTimersByTimeAsync(1_500); // 10 s depois da segunda: passa
    expect(bt.chamadas).toHaveLength(3);
    expect(bt.saldo(c.id)).toBe(SALDO_INICIAL);
    expect(armazem.pendentesNaCaixa).toBe(0);
    expect(armazem.proximaTentativaDaCaixa).toBeNull();
  });

  it('fechar espera a passada em voo, não começa outra e deixa o resto no arquivo', async () => {
    const pasta = pastaNova();
    const agora = { valor: 1_800_000_000_000 };
    const bt = bancoDeTeste(() => agora.valor);
    const { armazem } = abrir(pasta, bt, agora);
    armazem.criar();
    armazem.criar();
    // fecha na mesma hora, antes de a primeira passada rodar: nada é enviado e as duas operações ficam no arquivo
    await armazem.fechar();
    expect(bt.chamadas).toEqual([]);
    const f = arquivo(pasta);
    expect(f.versao).toBe(3);
    expect(f.saida).toHaveLength(2);
  });
});

describe('o servidor com SALDO_NO_BANCO=1 (BancoLocal em PASTA_DADOS/banco.sqlite)', () => {
  const rede = new AmbienteDeRede();
  afterAll(() => rede.encerrar());

  it('a carteira criada pelo HTTP chega ao Banco local, e o servidor desligado não abre o banco.sqlite', async () => {
    const dados = pastaNova();
    const ligado = await rede.subir({ saldoNoBanco: true, pastaDados: dados });
    const r = await fetch(`http://127.0.0.1:${ligado.porta}/carteira`, { method: 'POST', headers: { Origin: `http://localhost:${ligado.porta}` } });
    expect(r.status).toBe(201);
    const { codigo } = (await r.json()) as { codigo: string };
    expect(ligado.carteiras.saldoNoBanco).toBe(true);
    const id = ligado.carteiras.resolver(codigo)!;
    await vi.waitFor(() => expect(ligado.carteiras.pendentesNaCaixa).toBe(0));
    expect(ligado.carteiras.ler(id)!.saldo).toBe(SALDO_INICIAL);
    expect(existsSync(join(dados, NOME_DO_BANCO_LOCAL))).toBe(true);
    await ligado.fechar();

    const dadosDesligado = pastaNova();
    const desligado = await rede.subir({ pastaDados: dadosDesligado });
    expect(desligado.carteiras.saldoNoBanco).toBe(false);
    expect(existsSync(join(dadosDesligado, NOME_DO_BANCO_LOCAL))).toBe(false);
    await desligado.fechar();
  });
});
