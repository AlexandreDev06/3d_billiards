/**
 * O presente de teste (L34c) no armazém: cada carteira ganha o valor uma vez por rótulo, na primeira vez que aparece (nova, ou
 * antiga que abre o jogo), com a marca guardada no `carteiras.json` junto com o saldo. Sem opção, nada acontece.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SALDO_INICIAL } from '@sinuca/protocolo';
import { ArmazemDeCarteiras, type OpcoesDoArmazem } from './carteiras';
import type { PresenteDeTeste } from './config';

const PRESENTE: PresenteDeTeste = { valor: 10_000, rotulo: 'skins-cs' };
const ID_A = 'a'.repeat(64);

const pastas: string[] = [];
const abertos: ArmazemDeCarteiras[] = [];
const pastaNova = (): string => {
  const p = mkdtempSync(join(tmpdir(), 'sala-presente-'));
  pastas.push(p);
  return p;
};
afterEach(async () => {
  await Promise.all(abertos.splice(0).map((a) => a.fechar()));
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

function abrir(pasta: string | null, extra: Partial<OpcoesDoArmazem> = {}) {
  const logs: string[] = [];
  const armazem = new ArmazemDeCarteiras({
    pasta,
    maxCarteiras: 100,
    atrasoMs: 5,
    relogio: () => 1_700_000_000_000,
    log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
    ...extra,
  });
  abertos.push(armazem);
  return { armazem, logs };
}

const lerArquivo = (pasta: string) => JSON.parse(readFileSync(join(pasta, 'carteiras.json'), 'utf8')) as { versao: number; carteiras: Record<string, Record<string, unknown>> };
const logsDe = (logs: string[], evento: string) => logs.filter((l) => l.startsWith(`${evento} `)).map((l) => JSON.parse(l.slice(evento.length + 1)) as Record<string, unknown>);

/** Uma carteira antiga: criada, gravada e fechada sem o presente (como estava antes do L34c). */
async function antiga(pasta: string, saldo = SALDO_INICIAL) {
  const { armazem } = abrir(pasta);
  const c = armazem.criar()!;
  if (saldo !== SALDO_INICIAL) armazem.aplicar([{ id: c.id, delta: saldo - SALDO_INICIAL }]);
  await armazem.fechar();
  return c;
}

describe('presente de teste: desligado', () => {
  it('sem a opção, ou com null, a carteira nova e a que reaparece ficam como estão e nada é logado', () => {
    for (const extra of [{}, { presenteDeTeste: null }] as Partial<OpcoesDoArmazem>[]) {
      const { armazem, logs } = abrir(null, extra);
      const c = armazem.criar()!;
      expect(armazem.ler(c.id)!.saldo).toBe(SALDO_INICIAL);
      expect(armazem.resolver(c.codigo)).toBe(c.id);
      expect(armazem.ler(c.id)!.saldo).toBe(SALDO_INICIAL);
      expect(logsDe(logs, 'presente')).toEqual([]);
    }
  });

  it('desligado não paga nem marca, e quem já tinha a marca de um presente antigo a conserva no disco', async () => {
    const pasta = pastaNova();
    const velha = abrir(pasta, { presenteDeTeste: PRESENTE });
    const c = velha.armazem.criar()!;
    await velha.armazem.fechar();

    const { armazem } = abrir(pasta); // sobe sem o presente
    expect(armazem.resolver(c.codigo)).toBe(c.id);
    expect(armazem.ler(c.id)!.saldo).toBe(SALDO_INICIAL + PRESENTE.valor);
    armazem.aplicar([{ id: c.id, delta: 1 }]); // força uma gravação nova
    await armazem.fechar();
    expect(lerArquivo(pasta).carteiras[c.id]).toMatchObject({ saldo: SALDO_INICIAL + PRESENTE.valor + 1, presentes: { 'skins-cs': 10_000 } });
  });
});

describe('presente de teste: ligado', () => {
  it('a carteira nova já nasce com o saldo inicial mais o presente, e o log diz o valor e o rótulo (nunca o código nem o id)', () => {
    const { armazem, logs } = abrir(null, { presenteDeTeste: PRESENTE });
    const c = armazem.criar()!;
    expect(armazem.ler(c.id)).toMatchObject({ saldo: SALDO_INICIAL + 10_000, skins: ['classico'] });
    expect(logsDe(logs, 'presente')).toEqual([{ apelido: null, valor: 10_000, rotulo: 'skins-cs' }]);
    const tudo = logs.join('\n');
    expect(tudo).not.toContain(c.codigo);
    expect(tudo).not.toContain(c.id);
  });

  it('o log leva o apelido de quem está sentado numa sala, se a carteira já está (o HTTP não conhece nome: null)', async () => {
    const pasta = pastaNova();
    const c = await antiga(pasta);
    const { armazem, logs } = abrir(pasta, { presenteDeTeste: PRESENTE });
    armazem.usarApelidos((id) => (id === c.id ? 'Ana' : null));
    armazem.resolver(c.codigo);
    expect(logsDe(logs, 'presente')).toEqual([{ apelido: 'Ana', valor: 10_000, rotulo: 'skins-cs' }]);
  });

  it('a carteira antiga recebe na primeira vez que aparece (resolver), com o saldo que tinha somado', async () => {
    const pasta = pastaNova();
    const velha = await antiga(pasta, 340);
    const { armazem, logs } = abrir(pasta, { presenteDeTeste: PRESENTE });
    // reabrir não paga ninguém: só quem aparece
    expect(armazem.ler(velha.id)!.saldo).toBe(340);
    expect(logsDe(logs, 'presente')).toEqual([]);
    expect(armazem.resolver(velha.codigo)).toBe(velha.id);
    expect(armazem.ler(velha.id)!.saldo).toBe(340 + 10_000);
    expect(logsDe(logs, 'presente')).toHaveLength(1);
  });

  it('uma vez por rótulo, nunca duas: resolver de novo, duas abas e a criação por cima não pagam outra vez', async () => {
    const pasta = pastaNova();
    const velha = await antiga(pasta);
    const { armazem, logs } = abrir(pasta, { presenteDeTeste: PRESENTE });
    for (let aba = 0; aba < 25; aba++) expect(armazem.resolver(velha.codigo)).toBe(velha.id);
    expect(armazem.ler(velha.id)!.saldo).toBe(SALDO_INICIAL + 10_000);
    expect(logsDe(logs, 'presente')).toHaveLength(1);
    // outra carteira não é afetada, e a primeira segue sem pagar
    const nova = armazem.criar()!;
    expect(armazem.ler(nova.id)!.saldo).toBe(SALDO_INICIAL + 10_000);
    armazem.resolver(velha.codigo);
    expect(armazem.ler(velha.id)!.saldo).toBe(SALDO_INICIAL + 10_000);
    expect(logsDe(logs, 'presente')).toHaveLength(2);
  });

  it('reiniciar a sala com o mesmo rótulo não paga de novo: a marca está no disco, junto com o saldo', async () => {
    const pasta = pastaNova();
    const primeira = abrir(pasta, { presenteDeTeste: PRESENTE });
    const c = primeira.armazem.criar()!;
    primeira.armazem.resolver(c.codigo);
    await primeira.armazem.fechar();
    expect(lerArquivo(pasta).carteiras[c.id]).toMatchObject({ saldo: SALDO_INICIAL + 10_000, presentes: { 'skins-cs': 10_000 } });

    const segunda = abrir(pasta, { presenteDeTeste: PRESENTE });
    expect(segunda.armazem.resolver(c.codigo)).toBe(c.id);
    expect(segunda.armazem.ler(c.id)!.saldo).toBe(SALDO_INICIAL + 10_000);
    expect(logsDe(segunda.logs, 'presente')).toEqual([]);
  });

  it('rótulo novo paga de novo, e o valor pode ser outro; as marcas se acumulam e o rótulo velho não volta a pagar', async () => {
    const pasta = pastaNova();
    const a = abrir(pasta, { presenteDeTeste: PRESENTE });
    const c = a.armazem.criar()!;
    await a.armazem.fechar();

    const b = abrir(pasta, { presenteDeTeste: { valor: 2500, rotulo: 'rodada-2' } });
    b.armazem.resolver(c.codigo);
    b.armazem.resolver(c.codigo);
    expect(b.armazem.ler(c.id)!.saldo).toBe(SALDO_INICIAL + 10_000 + 2500);
    expect(logsDe(b.logs, 'presente')).toEqual([{ apelido: null, valor: 2500, rotulo: 'rodada-2' }]);
    await b.armazem.fechar();
    expect(lerArquivo(pasta).carteiras[c.id]!.presentes).toEqual({ 'skins-cs': 10_000, 'rodada-2': 2500 });

    const volta = abrir(pasta, { presenteDeTeste: PRESENTE });
    volta.armazem.resolver(c.codigo);
    expect(volta.armazem.ler(c.id)!.saldo).toBe(SALDO_INICIAL + 10_000 + 2500);
  });

  it('o rótulo se compara como chave própria: "constructor" e afins pagam na primeira vez e só nela', () => {
    for (const rotulo of ['constructor', 'tostring', 'hasownproperty']) {
      const { armazem } = abrir(null, { presenteDeTeste: { valor: 7, rotulo } });
      const c = armazem.criar()!;
      armazem.resolver(c.codigo);
      armazem.resolver(c.codigo);
      expect(armazem.ler(c.id)!.saldo, rotulo).toBe(SALDO_INICIAL + 7);
    }
  });

  it('tudo ou nada com o saldo: se o saldo não comporta o presente, nem paga nem marca', async () => {
    const pasta = pastaNova();
    const velha = await antiga(pasta);
    const { armazem, logs } = abrir(pasta, { presenteDeTeste: PRESENTE });
    const id = armazem.resolver(velha.codigo)!; // paga o primeiro rótulo
    const quase = Number.MAX_SAFE_INTEGER - armazem.ler(id)!.saldo - 5;
    expect(armazem.aplicar([{ id, delta: quase }])).toBe(true);
    await armazem.fechar();

    const { armazem: cheio, logs: logsCheio } = abrir(pasta, { presenteDeTeste: { valor: 10, rotulo: 'estoura' } });
    const antes = cheio.ler(id)!.saldo;
    expect(cheio.resolver(velha.codigo)).toBe(id);
    expect(cheio.ler(id)!.saldo).toBe(antes);
    expect(logsDe(logsCheio, 'presente')).toEqual([]);
    await cheio.fechar();
    expect(lerArquivo(pasta).carteiras[id]!.presentes).toEqual({ 'skins-cs': 10_000 });
    expect(logsDe(logs, 'presente')).toHaveLength(1);
  });

  it('a mudança avisa quem olha a carteira (o Registro reenvia o estado-sala), uma vez por pagamento', async () => {
    const pasta = pastaNova();
    const velha = await antiga(pasta);
    const { armazem } = abrir(pasta, { presenteDeTeste: PRESENTE });
    const avisos: string[] = [];
    armazem.aoMudar((id) => avisos.push(id));
    armazem.resolver(velha.codigo);
    armazem.resolver(velha.codigo);
    expect(avisos).toEqual([velha.id]);
  });

  it('depois de fechar o armazém não paga mais nada (o retrato que foi ao disco é o último)', async () => {
    const pasta = pastaNova();
    const velha = await antiga(pasta);
    const { armazem } = abrir(pasta, { presenteDeTeste: PRESENTE });
    await armazem.fechar();
    expect(armazem.resolver(velha.codigo)).toBe(velha.id);
    expect(armazem.ler(velha.id)!.saldo).toBe(SALDO_INICIAL);
  });

  it('o presente não é uso: no teto de carteiras a nunca usada, mesmo presenteada, ainda dá lugar à nova; a que jogou, não', () => {
    const { armazem } = abrir(null, { presenteDeTeste: PRESENTE, maxCarteiras: 2 });
    const velha = armazem.criar()!;
    const jogou = armazem.criar()!;
    armazem.registrarPartida([jogou.id]);
    const nova = armazem.criar()!;
    expect(nova).not.toBeNull();
    expect(armazem.total).toBe(2);
    expect(armazem.resolver(velha.codigo)).toBeUndefined(); // a velha, nunca usada, deu lugar
    expect(armazem.resolver(jogou.codigo)).toBe(jogou.id);
    expect(armazem.ler(nova.id)!.saldo).toBe(SALDO_INICIAL + 10_000);
    // sem outra nunca usada, o teto volta a recusar
    armazem.registrarPartida([nova.id]);
    expect(armazem.criar()).toBeNull();
  });

  it('o código que não existe, ou que não tem a forma, não paga nem cria nada', () => {
    const { armazem, logs } = abrir(null, { presenteDeTeste: PRESENTE });
    expect(armazem.resolver('x'.repeat(43))).toBeUndefined();
    expect(armazem.resolver('curto')).toBeUndefined();
    expect(armazem.resolver(undefined)).toBeUndefined();
    expect(armazem.total).toBe(0);
    expect(logsDe(logs, 'presente')).toEqual([]);
  });
});

describe('presente de teste: o arquivo', () => {
  const carteiraDeUmArquivo = (extra: Record<string, unknown> = {}) => ({
    saldo: 250,
    itens: [{ skin: 'classico', semente: 12, bolas: 0 }],
    skin: 'classico',
    criadaEm: 1_600_000_000_000,
    jogou: true,
    ...extra,
  });

  it('o arquivo de antes (formato 2 sem `presentes`) abre, e o presente entra na primeira aparição', () => {
    const pasta = pastaNova();
    writeFileSync(join(pasta, 'carteiras.json'), JSON.stringify({ versao: 2, carteiras: { [ID_A]: carteiraDeUmArquivo() } }));
    const { armazem, logs } = abrir(pasta, { presenteDeTeste: PRESENTE });
    expect(armazem.total).toBe(1);
    expect(armazem.ler(ID_A)).toMatchObject({ saldo: 250, skin: 'classico' });
    expect(readdirSync(pasta).filter((n) => n.startsWith('carteiras.corrompido'))).toEqual([]);
    expect(logsDe(logs, 'carteiras-corrompidas')).toEqual([]);
  });

  it('o formato 1 (com `skins`) também abre: migra para itens e a marca do presente entra no arquivo novo', async () => {
    const pasta = pastaNova();
    const codigo = 'Z'.repeat(43);
    const { createHash } = await import('node:crypto');
    const id = createHash('sha256').update(codigo).digest('hex');
    writeFileSync(join(pasta, 'carteiras.json'), JSON.stringify({ versao: 1, carteiras: { [id]: { saldo: 90, skins: ['classico', 'ouro'], skin: 'ouro', criadaEm: 1_600_000_000_000, jogou: true } } }));
    const { armazem } = abrir(pasta, { presenteDeTeste: PRESENTE, sortearSemente: () => 5 });
    expect(armazem.resolver(codigo)).toBe(id);
    expect(armazem.ler(id)).toMatchObject({ saldo: 90 + 10_000, skins: ['classico', 'ouro'], skin: 'ouro' });
    await armazem.fechar();
    expect(lerArquivo(pasta).carteiras[id]).toMatchObject({ saldo: 10_090, presentes: { 'skins-cs': 10_000 } });
    expect(existsSync(join(pasta, 'carteiras.json'))).toBe(true);
  });

  it('um `presentes` estragado não derruba a carteira: a entrada torta é descartada, a boa vale, e quem ficou sem marca recebe', async () => {
    const pasta = pastaNova();
    const { createHash } = await import('node:crypto');
    const codigoA = 'A'.repeat(43);
    const codigoB = 'B'.repeat(43);
    const idDe = (codigo: string) => createHash('sha256').update(codigo).digest('hex');
    const [idA, idB] = [idDe(codigoA), idDe(codigoB)];
    const boa = JSON.stringify(carteiraDeUmArquivo({ presentes: 'MARCA' })).replace(
      '"MARCA"',
      '{"skins-cs":10000,"Rótulo Ruim":5,"negativo":-3,"torto":1.5,"texto":"9","__proto__":1}',
    );
    writeFileSync(join(pasta, 'carteiras.json'), `{"versao":2,"carteiras":{"${idA}":${JSON.stringify(carteiraDeUmArquivo({ presentes: 'muito' }))},"${idB}":${boa}}}`);
    const { armazem, logs } = abrir(pasta, { presenteDeTeste: PRESENTE });
    expect(armazem.total).toBe(2);
    expect(logsDe(logs, 'carteiras-corrompidas')).toEqual([]);
    armazem.resolver(codigoA); // a marca não prestava: paga
    armazem.resolver(codigoB); // a marca do rótulo estava boa: não paga
    expect(armazem.ler(idA)!.saldo).toBe(250 + 10_000);
    expect(armazem.ler(idB)!.saldo).toBe(250);
    await armazem.fechar();
    const gravado = lerArquivo(pasta).carteiras;
    expect(gravado[idA]!.presentes).toEqual({ 'skins-cs': 10_000 });
    expect(gravado[idB]!.presentes).toEqual({ 'skins-cs': 10_000 }); // as entradas tortas não voltam ao disco
  });

  it('a marca guardada vale para o rótulo, mesmo que a carteira venha do arquivo com ela escrita à mão', async () => {
    const pasta = pastaNova();
    const codigo = 'Y'.repeat(43);
    const { createHash } = await import('node:crypto');
    const id = createHash('sha256').update(codigo).digest('hex');
    writeFileSync(join(pasta, 'carteiras.json'), JSON.stringify({ versao: 2, carteiras: { [id]: carteiraDeUmArquivo({ saldo: 10_250, presentes: { 'skins-cs': 10_000 } }) } }));
    const { armazem } = abrir(pasta, { presenteDeTeste: PRESENTE });
    expect(armazem.resolver(codigo)).toBe(id);
    expect(armazem.ler(id)!.saldo).toBe(10_250);
  });

  it('um servidor sem o presente grava o arquivo sem `presentes` para quem nunca ganhou (o formato de antes, byte a byte nas chaves)', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta);
    const c = armazem.criar()!;
    await armazem.fechar();
    expect(Object.keys(lerArquivo(pasta).carteiras[c.id]!).sort()).toEqual(['criadaEm', 'itens', 'jogou', 'saldo', 'skin']);
  });
});
