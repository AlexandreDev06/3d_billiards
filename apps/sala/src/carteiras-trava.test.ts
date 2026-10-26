/**
 * A trava exclusiva do armazém (A2 do L22): `carteiras.lock` com o pid de quem segura a pasta. Dois processos na mesma
 * `PASTA_DADOS` se sobrescreveriam sem erro nem log, então o segundo não abre, e `fechar()` descarrega e solta a trava.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArmazemDeCarteiras, type OpcoesDoArmazem } from './carteiras';
import { ErroDeTrava } from './trava';

const pastas: string[] = [];
const filhos: ChildProcess[] = [];
const abertos: ArmazemDeCarteiras[] = [];

const pastaNova = (): string => {
  const p = mkdtempSync(join(tmpdir(), 'sala-trava-'));
  pastas.push(p);
  return p;
};

afterEach(async () => {
  for (const f of filhos.splice(0)) f.kill('SIGKILL');
  await Promise.all(abertos.splice(0).map((a) => a.fechar()));
  for (const p of pastas.splice(0)) {
    chmodSync(p, 0o700);
    rmSync(p, { recursive: true, force: true });
  }
});

function opcoes(pasta: string | null, extra: Partial<OpcoesDoArmazem> = {}) {
  const logs: string[] = [];
  const o: OpcoesDoArmazem = {
    pasta,
    maxCarteiras: 100,
    atrasoMs: 5,
    relogio: () => 1_700_000_000_000,
    log: (evento, campos = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`),
    ...extra,
  };
  return { o, logs };
}

/** Abre e já guarda para o `afterEach` soltar a trava. */
function abrir(pasta: string | null, extra: Partial<OpcoesDoArmazem> = {}) {
  const { o, logs } = opcoes(pasta, extra);
  const armazem = new ArmazemDeCarteiras(o);
  abertos.push(armazem);
  return { armazem, logs };
}

const travaDe = (pasta: string): string => join(pasta, 'carteiras.lock');
const arquivoDe = (pasta: string): string => join(pasta, 'carteiras.json');
/** A primeira linha da trava: o pid. A segunda é o boot_id da máquina (trava.test.ts cuida dele). */
const pidDaTrava = (pasta: string): string => readFileSync(travaDe(pasta), 'utf8').split('\n')[0]!.trim();

/** Um processo de verdade, vivo, que não é este. */
async function processoVivo(): Promise<number> {
  const filho = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  filhos.push(filho);
  await new Promise<void>((resolve, reject) => {
    filho.once('spawn', resolve);
    filho.once('error', reject);
  });
  return filho.pid!;
}

/** O pid de um processo que já terminou. */
function pidMorto(): number {
  return spawnSync(process.execPath, ['-e', '']).pid!;
}

describe('a pasta tem um dono só', () => {
  it('um segundo armazém na mesma pasta não abre: lança ErroDeTrava com o pid de quem segura e o caminho da trava', () => {
    const pasta = pastaNova();
    abrir(pasta);
    const { o } = opcoes(pasta);
    expect(() => new ArmazemDeCarteiras(o)).toThrow(ErroDeTrava);
    try {
      new ArmazemDeCarteiras(o);
    } catch (e) {
      expect((e as ErroDeTrava).pid).toBe(process.pid);
      expect((e as Error).message).toContain(String(process.pid));
      expect((e as Error).message).toContain(travaDe(pasta));
      expect((e as Error).message).toContain('PASTA_DADOS');
    }
  });

  it('o segundo que falhou não mexe na trava do primeiro: ela segue com o pid dele e o primeiro continua gravando', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta);
    expect(() => new ArmazemDeCarteiras(opcoes(pasta).o)).toThrow(ErroDeTrava);
    expect(pidDaTrava(pasta)).toBe(String(process.pid));
    const { id } = armazem.criar()!;
    await armazem.descarregar();
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[id]).toBeDefined();
  });

  it('a trava guarda o pid deste processo e é restrita ao dono', () => {
    const pasta = pastaNova();
    abrir(pasta);
    expect(pidDaTrava(pasta)).toBe(String(process.pid));
    expect(statSync(travaDe(pasta)).mode & 0o077).toBe(0);
  });

  it('pastas diferentes não se atrapalham, e sem pasta (só memória) não há trava nenhuma', () => {
    const a = pastaNova();
    const b = pastaNova();
    abrir(a);
    abrir(b);
    abrir(null);
    abrir(null);
    expect(existsSync(travaDe(a)) && existsSync(travaDe(b))).toBe(true);
  });

  it('um arquivo de carteiras que não se lê solta a trava (quem falhou ao abrir não segura a pasta)', () => {
    const pasta = pastaNova();
    // uma pasta no lugar do arquivo: ler dá EISDIR, que o armazém não engole
    mkdirSync(arquivoDe(pasta));
    expect(() => new ArmazemDeCarteiras(opcoes(pasta).o)).toThrow(/não consegui ler/);
    expect(existsSync(travaDe(pasta))).toBe(false);
    rmSync(arquivoDe(pasta), { recursive: true });
    abrir(pasta);
  });
});

describe('trava que ficou para trás', () => {
  it('de um processo que já morreu é assumida: o armazém abre, passa a guardar o pid atual e o log avisa', () => {
    const pasta = pastaNova();
    const morto = pidMorto();
    writeFileSync(travaDe(pasta), `${morto}\n`);
    const { logs } = abrir(pasta);
    expect(pidDaTrava(pasta)).toBe(String(process.pid));
    expect(logs.some((l) => l.startsWith('carteiras-trava-assumida ') && l.includes(String(morto)))).toBe(true);
  });

  it('assumir uma trava velha não leva as carteiras: o arquivo de dados continua sendo lido', async () => {
    const pasta = pastaNova();
    const primeiro = abrir(pasta);
    const { codigo, id } = primeiro.armazem.criar()!;
    await primeiro.armazem.fechar();
    writeFileSync(travaDe(pasta), `${pidMorto()}\n`); // o dono "morreu" sem soltar a trava
    const { armazem } = abrir(pasta);
    expect(armazem.resolver(codigo)).toBe(id);
  });

  it('com o pid deste processo mas sem que este processo a segure (pid reaproveitado, como num contêiner) também é assumida', () => {
    const pasta = pastaNova();
    writeFileSync(travaDe(pasta), `${process.pid}\n`);
    abrir(pasta);
    expect(pidDaTrava(pasta)).toBe(String(process.pid));
  });

  it.each([['vazia', ''], ['lixo', 'isto não é um pid'], ['pid zero', '0\n'], ['pid negativo', '-5\n'], ['pid enorme', '99999999999999\n']])(
    'ilegível (%s) e velha é assumida; recém-criada não (pode estar sendo escrita agora por quem a criou)',
    (_nome, conteudo) => {
      const velha = pastaNova();
      writeFileSync(travaDe(velha), conteudo);
      const dezSegundosAtras = new Date(Date.now() - 10_000);
      utimesSync(travaDe(velha), dezSegundosAtras, dezSegundosAtras);
      abrir(velha);
      expect(pidDaTrava(velha)).toBe(String(process.pid));

      const recente = pastaNova();
      writeFileSync(travaDe(recente), conteudo);
      expect(() => new ArmazemDeCarteiras(opcoes(recente).o)).toThrow(ErroDeTrava);
      expect(readFileSync(travaDe(recente), 'utf8')).toBe(conteudo);
    },
  );

  it('de um processo vivo que não é este nunca é assumida', async () => {
    const pasta = pastaNova();
    const vivo = await processoVivo();
    writeFileSync(travaDe(pasta), `${vivo}\n`);
    let erro: unknown;
    try {
      new ArmazemDeCarteiras(opcoes(pasta).o);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroDeTrava);
    expect((erro as ErroDeTrava).pid).toBe(vivo);
    expect(pidDaTrava(pasta)).toBe(String(vivo));
    expect(existsSync(arquivoDe(pasta))).toBe(false);
  });
});

describe('abrir() espera a trava de quem está saindo', () => {
  it('abre assim que o dono solta a trava durante a espera (o reiniciar-sala.sh sobe o novo assim que a porta solta)', async () => {
    const pasta = pastaNova();
    const vivo = await processoVivo();
    writeFileSync(travaDe(pasta), `${vivo}\n`);
    setTimeout(() => rmSync(travaDe(pasta)), 150);
    const { o, logs } = opcoes(pasta);
    const armazem = await ArmazemDeCarteiras.abrir(o, { esperaMs: 3000, passoMs: 20 });
    abertos.push(armazem);
    expect(pidDaTrava(pasta)).toBe(String(process.pid));
    expect(logs.some((l) => l.startsWith('carteiras-trava-esperando '))).toBe(true);
  });

  it('abre assim que o dono morre durante a espera', async () => {
    const pasta = pastaNova();
    const vivo = await processoVivo();
    writeFileSync(travaDe(pasta), `${vivo}\n`);
    setTimeout(() => filhos.forEach((f) => f.kill('SIGKILL')), 100);
    const armazem = await ArmazemDeCarteiras.abrir(opcoes(pasta).o, { esperaMs: 3000, passoMs: 20 });
    abertos.push(armazem);
    expect(pidDaTrava(pasta)).toBe(String(process.pid));
  });

  it('se não solta dentro do prazo, rejeita dizendo quem segura e o que fazer, sem escrever nada', async () => {
    const pasta = pastaNova();
    const vivo = await processoVivo();
    writeFileSync(travaDe(pasta), `${vivo}\n`);
    const antes = Date.now();
    const erro = await ArmazemDeCarteiras.abrir(opcoes(pasta).o, { esperaMs: 300, passoMs: 20 }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDeTrava);
    expect(Date.now() - antes).toBeGreaterThanOrEqual(280);
    expect((erro as Error).message).toContain(String(vivo));
    expect((erro as Error).message).toContain('PASTA_DADOS');
    expect(pidDaTrava(pasta)).toBe(String(vivo));
  });

  it('sem espera (padrão), falha na hora', async () => {
    const pasta = pastaNova();
    abrir(pasta);
    const antes = Date.now();
    await expect(ArmazemDeCarteiras.abrir(opcoes(pasta).o)).rejects.toBeInstanceOf(ErroDeTrava);
    expect(Date.now() - antes).toBeLessThan(150);
  });

  it('erro que não é de trava não é esperado: sobe na hora', async () => {
    const pasta = pastaNova();
    mkdirSync(arquivoDe(pasta));
    const antes = Date.now();
    await expect(ArmazemDeCarteiras.abrir(opcoes(pasta).o, { esperaMs: 3000, passoMs: 20 })).rejects.toThrow(/não consegui ler/);
    expect(Date.now() - antes).toBeLessThan(500);
  });
});

describe('fechar(): descarrega, solta a trava e não aceita mais nada', () => {
  it('grava o que faltava, remove a trava e deixa outro armazém abrir com tudo', async () => {
    const pasta = pastaNova();
    const primeiro = abrir(pasta, { atrasoMs: 60_000 }); // o atraso é longo: só o fechar() leva ao disco
    const { codigo, id } = primeiro.armazem.criar()!;
    expect(existsSync(arquivoDe(pasta))).toBe(false);
    await primeiro.armazem.fechar();
    expect(existsSync(travaDe(pasta))).toBe(false);
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[id]).toBeDefined();
    const { armazem } = abrir(pasta);
    expect(armazem.resolver(codigo)).toBe(id);
  });

  it('chamar duas vezes (ou ao mesmo tempo) é inofensivo e só solta a trava uma vez', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta);
    armazem.criar();
    await Promise.all([armazem.fechar(), armazem.fechar()]);
    await armazem.fechar();
    expect(existsSync(travaDe(pasta))).toBe(false);
    const { armazem: outro } = abrir(pasta);
    await armazem.fechar(); // o primeiro já fechou: não pode apagar a trava que o outro passou a ter
    expect(pidDaTrava(pasta)).toBe(String(process.pid));
    expect(outro.total).toBe(1);
  });

  it('se outro processo ficou com a trava no meio do caminho, fechar() grava os dados mas não apaga a trava dele', async () => {
    const pasta = pastaNova();
    const vivo = await processoVivo();
    const { armazem } = abrir(pasta);
    const { id } = armazem.criar()!;
    writeFileSync(travaDe(pasta), `${vivo}\n`); // a trava foi tomada de nós (apagada à mão e recriada por outro)
    await armazem.fechar();
    expect(pidDaTrava(pasta)).toBe(String(vivo));
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[id]).toBeDefined();
  });

  it('depois de fechar, criar, comprar, usar e aplicar são recusados e o arquivo não muda', async () => {
    const pasta = pastaNova();
    const { armazem, logs } = abrir(pasta);
    const { id } = armazem.criar()!;
    armazem.aplicar([{ id, delta: 500 }]);
    await armazem.fechar();
    const gravado = readFileSync(arquivoDe(pasta), 'utf8');

    expect(armazem.criar()).toBeNull();
    expect(armazem.comprar(id, 'ebano')).toEqual({ ok: false, erro: 'encerrado' });
    expect(armazem.usar(id, 'classico')).toEqual({ ok: false, erro: 'encerrado' });
    expect(armazem.aplicar([{ id, delta: -500 }])).toBe(false);
    expect(armazem.encerrado).toBe(true);
    expect(armazem.ler(id)).toMatchObject({ saldo: 600, skins: ['classico'], skin: 'classico' });
    await new Promise((r) => setTimeout(r, 50));
    expect(readFileSync(arquivoDe(pasta), 'utf8')).toBe(gravado);
    expect(logs.some((l) => l.startsWith('carteiras-encerrado '))).toBe(true);
  });

  it('já a partir do início do fechar(), sem esperar a gravação terminar: nada de mudança entra depois do retrato que vai ao disco', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta, { atrasoMs: 60_000 });
    const { id } = armazem.criar()!;
    const fechando = armazem.fechar();
    expect(armazem.aplicar([{ id, delta: 999 }])).toBe(false);
    expect(armazem.criar()).toBeNull();
    await fechando;
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[id].saldo).toBe(100);
    expect(Object.keys(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras)).toHaveLength(1);
  });

  it('sem pasta, fechar() também recusa mudanças e não tem trava para soltar', async () => {
    const { armazem } = abrir(null);
    const { id } = armazem.criar()!;
    await armazem.fechar();
    expect(armazem.criar()).toBeNull();
    expect(armazem.aplicar([{ id, delta: 1 }])).toBe(false);
  });
});
