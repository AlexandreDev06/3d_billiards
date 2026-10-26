/**
 * `pegarTrava` por dentro (L26): a devolução da trava que se tirou por engano não pisa na de um terceiro (B3), e a trava leva o
 * `boot_id` da máquina, então a de um boot anterior é velha mesmo que o número do pid tenha sido reaproveitado (B4).
 * `carteiras-trava.test.ts` prova o resto pelo armazém.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErroDeTrava, pegarTrava, type Trava } from './trava';

/** `renameSync` com ganchos: o teste mexe na pasta exatamente entre a leitura da trava e o `rename`, ou logo depois dele. */
const gancho = vi.hoisted(() => ({
  antesDoRename: null as (() => void) | null,
  aposORename: null as (() => void) | null,
}));
vi.mock('node:fs', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('node:fs')>();
  return {
    ...real,
    renameSync: (...args: Parameters<typeof real.renameSync>) => {
      const antes = gancho.antesDoRename;
      gancho.antesDoRename = null;
      antes?.();
      real.renameSync(...args);
      const depois = gancho.aposORename;
      gancho.aposORename = null;
      depois?.();
    },
  };
});

const BOOT_A = '11111111-aaaa-4bbb-8ccc-111111111111';
const BOOT_B = '22222222-bbbb-4ccc-8ddd-222222222222';
const BOOT_DESTA_MAQUINA = '/proc/sys/kernel/random/boot_id';

const pastas: string[] = [];
const filhos: ChildProcess[] = [];
const travas: Trava[] = [];

const pastaNova = (): string => {
  const p = mkdtempSync(join(tmpdir(), 'sala-trava-unidade-'));
  pastas.push(p);
  return p;
};
const travaDe = (pasta: string): string => join(pasta, 'carteiras.lock');
const conteudoDe = (pasta: string): string => readFileSync(travaDe(pasta), 'utf8');

afterEach(() => {
  gancho.antesDoRename = null;
  gancho.aposORename = null;
  for (const t of travas.splice(0)) t.soltar();
  for (const f of filhos.splice(0)) f.kill('SIGKILL');
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

function pegar(pasta: string, bootId?: string | null) {
  const logs: string[] = [];
  const log = (evento: string, campos: Record<string, unknown> = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`);
  const trava = pegarTrava(pasta, log, bootId === undefined ? {} : { bootId });
  travas.push(trava);
  return { trava, logs };
}

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

const pidMorto = (): number => spawnSync(process.execPath, ['-e', '']).pid!;

function erroAoPegar(pasta: string, bootId?: string | null): ErroDeTrava {
  try {
    pegar(pasta, bootId);
  } catch (e) {
    expect(e).toBeInstanceOf(ErroDeTrava);
    return e as ErroDeTrava;
  }
  throw new Error('esperava ErroDeTrava, mas a trava foi pega');
}

describe('devolver a trava que se tirou por engano (B3)', () => {
  it('se outro processo tinha assumido a trava entre a leitura e o rename, ela volta ao lugar e quem tentou desiste dizendo o pid dele', async () => {
    const pasta = pastaNova();
    const quemAssumiu = await processoVivo();
    writeFileSync(travaDe(pasta), `${pidMorto()}\n`); // lixo de um processo morto: parece velha
    gancho.antesDoRename = () => writeFileSync(travaDe(pasta), `${quemAssumiu}\n`); // ... mas alguém a assume antes do rename
    const erro = erroAoPegar(pasta, null);
    expect(erro.pid).toBe(quemAssumiu);
    expect(conteudoDe(pasta)).toBe(`${quemAssumiu}\n`);
    expect(readdirSync(pasta)).toEqual(['carteiras.lock']); // nenhum arquivo de lado fica para trás
  });

  it('se um terceiro criou outra trava enquanto a nossa estava de lado, a dele fica: devolver não sobrescreve', async () => {
    const pasta = pastaNova();
    const quemAssumiu = await processoVivo();
    const terceiro = await processoVivo();
    writeFileSync(travaDe(pasta), `${pidMorto()}\n`);
    gancho.antesDoRename = () => writeFileSync(travaDe(pasta), `${quemAssumiu}\n`);
    gancho.aposORename = () => writeFileSync(travaDe(pasta), `${terceiro}\n`); // o caminho está livre por um instante, e o terceiro o pega
    const erro = erroAoPegar(pasta, null);
    expect(erro.pid).toBe(quemAssumiu);
    expect(conteudoDe(pasta), 'a trava do terceiro continua de pé').toBe(`${terceiro}\n`);
    expect(readdirSync(pasta)).toEqual(['carteiras.lock']);
  });

  it('trava velha de verdade (ninguém mexeu) é assumida e o arquivo de lado some', () => {
    const pasta = pastaNova();
    writeFileSync(travaDe(pasta), `${pidMorto()}\n`);
    const { logs } = pegar(pasta, null);
    expect(conteudoDe(pasta)).toBe(`${process.pid}\n`);
    expect(readdirSync(pasta)).toEqual(['carteiras.lock']);
    expect(logs.some((l) => l.startsWith('carteiras-trava-assumida '))).toBe(true);
  });

  it('a trava nova de outro processo que tem o MESMO pid de antes, mas outro boot, também não é roubada', async () => {
    const pasta = pastaNova();
    const vivo = await processoVivo();
    // julgada velha porque é de outro boot; no meio do caminho, o próprio dono (mesmo pid) a reescreve com o boot de agora
    writeFileSync(travaDe(pasta), `${vivo}\n${BOOT_A}\n`);
    gancho.antesDoRename = () => writeFileSync(travaDe(pasta), `${vivo}\n${BOOT_B}\n`);
    const erro = erroAoPegar(pasta, BOOT_B);
    expect(erro.pid).toBe(vivo);
    expect(conteudoDe(pasta)).toBe(`${vivo}\n${BOOT_B}\n`);
    expect(readdirSync(pasta)).toEqual(['carteiras.lock']);
  });
});

describe('o boot_id da máquina vai na trava (B4)', () => {
  it('a trava guarda o pid e o boot_id, um por linha, restrita ao dono', () => {
    const pasta = pastaNova();
    pegar(pasta, BOOT_A);
    expect(conteudoDe(pasta)).toBe(`${process.pid}\n${BOOT_A}\n`);
  });

  it.skipIf(!existsSync(BOOT_DESTA_MAQUINA))('sem o boot injetado, lê o boot_id de /proc desta máquina', () => {
    const pasta = pastaNova();
    pegar(pasta);
    expect(conteudoDe(pasta)).toBe(`${process.pid}\n${readFileSync(BOOT_DESTA_MAQUINA, 'utf8').trim()}\n`);
  });

  it('sem boot_id conhecido (sistema sem /proc), a trava guarda só o pid, como antes', () => {
    const pasta = pastaNova();
    pegar(pasta, null);
    expect(conteudoDe(pasta)).toBe(`${process.pid}\n`);
  });

  it('pid VIVO mas de outro boot: a trava é velha (o número foi reaproveitado depois de reiniciar a máquina) e é assumida', async () => {
    const pasta = pastaNova();
    const vivo = await processoVivo();
    writeFileSync(travaDe(pasta), `${vivo}\n${BOOT_A}\n`);
    const { logs } = pegar(pasta, BOOT_B);
    expect(conteudoDe(pasta)).toBe(`${process.pid}\n${BOOT_B}\n`);
    expect(logs.some((l) => l.startsWith('carteiras-trava-assumida ') && l.includes(String(vivo)))).toBe(true);
  });

  it('pid vivo do MESMO boot nunca é assumido, e a trava dele fica intacta', async () => {
    const pasta = pastaNova();
    const vivo = await processoVivo();
    writeFileSync(travaDe(pasta), `${vivo}\n${BOOT_B}\n`);
    expect(erroAoPegar(pasta, BOOT_B).pid).toBe(vivo);
    expect(conteudoDe(pasta)).toBe(`${vivo}\n${BOOT_B}\n`);
  });

  it('trava do formato de antes (só o pid) segue valendo pelo pid: vivo respeita, morto assume', async () => {
    const vivo = await processoVivo();
    const comVivo = pastaNova();
    writeFileSync(travaDe(comVivo), `${vivo}\n`);
    expect(erroAoPegar(comVivo, BOOT_B).pid).toBe(vivo);

    const comMorto = pastaNova();
    writeFileSync(travaDe(comMorto), `${pidMorto()}\n`);
    pegar(comMorto, BOOT_B);
    expect(conteudoDe(comMorto)).toBe(`${process.pid}\n${BOOT_B}\n`);
  });

  it('sem boot_id desta máquina para comparar, o pid decide: vivo respeita, morto assume', async () => {
    const vivo = await processoVivo();
    const comVivo = pastaNova();
    writeFileSync(travaDe(comVivo), `${vivo}\n${BOOT_A}\n`);
    expect(erroAoPegar(comVivo, null).pid).toBe(vivo);

    const comMorto = pastaNova();
    writeFileSync(travaDe(comMorto), `${pidMorto()}\n${BOOT_A}\n`);
    pegar(comMorto, null);
    expect(conteudoDe(comMorto)).toBe(`${process.pid}\n`);
  });

  it('pid morto do mesmo boot é assumido como sempre', () => {
    const pasta = pastaNova();
    writeFileSync(travaDe(pasta), `${pidMorto()}\n${BOOT_B}\n`);
    pegar(pasta, BOOT_B);
    expect(conteudoDe(pasta)).toBe(`${process.pid}\n${BOOT_B}\n`);
  });

  it('segunda linha que não é um boot_id deixa a trava ilegível: recente respeita, velha assume', () => {
    const recente = pastaNova();
    writeFileSync(travaDe(recente), `${process.pid + 1}\nisto não é um boot id\n`);
    expect(erroAoPegar(recente, BOOT_B).pid).toBeNull();

    const velha = pastaNova();
    writeFileSync(travaDe(velha), `${process.pid + 1}\nisto não é um boot id\n`);
    const dezSegundosAtras = new Date(Date.now() - 10_000);
    utimesSync(travaDe(velha), dezSegundosAtras, dezSegundosAtras);
    pegar(velha, BOOT_B);
    expect(conteudoDe(velha)).toBe(`${process.pid}\n${BOOT_B}\n`);
  });

  it('soltar apaga a trava com o boot_id e deixa em paz a de outro processo', async () => {
    const pasta = pastaNova();
    const { trava } = pegar(pasta, BOOT_B);
    trava.soltar();
    expect(existsSync(travaDe(pasta))).toBe(false);

    const outra = pastaNova();
    const { trava: minha } = pegar(outra, BOOT_B);
    const vivo = await processoVivo();
    writeFileSync(travaDe(outra), `${vivo}\n${BOOT_B}\n`); // a trava foi tomada de nós
    minha.soltar();
    expect(conteudoDe(outra)).toBe(`${vivo}\n${BOOT_B}\n`);
  });
});
