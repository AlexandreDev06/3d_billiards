/**
 * O script `importar:cf` (scripts/importar-carteiras.mjs): não tem arquivo padrão (L47b), junta o balão da sala Node, e traz descartadas de volta.
 * Roda o script de verdade contra um servidor HTTP de mentira em 127.0.0.1 (o único endereço que aceita sem https).
 */
import { execFile } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '../scripts/importar-carteiras.mjs');
const SEGREDO = 'um-segredo-de-teste-bem-longo';
const ID = 'a'.repeat(64);

interface Pedido {
  url: string;
  corpo: string;
  autorizacao: string | undefined;
}

const servidores: Server[] = [];
const pastas: string[] = [];
afterEach(() => {
  for (const s of servidores.splice(0)) s.close();
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

/** Um Worker de mentira: guarda o que recebeu e responde `resposta` com o `status`. */
async function worker(status = 200, resposta: object = { ok: true, importadas: 1, migradas: 0, descartadas: 0, substituidas: 0 }) {
  const pedidos: Pedido[] = [];
  const servidor = createServer((req, res) => {
    const pedaços: Buffer[] = [];
    req.on('data', (d: Buffer) => pedaços.push(d));
    req.on('end', () => {
      pedidos.push({ url: req.url ?? '', corpo: Buffer.concat(pedaços).toString('utf8'), autorizacao: req.headers.authorization });
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(resposta));
    });
  });
  servidores.push(servidor);
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`, pedidos };
}

const rodar = (args: string[], segredo: string | null = SEGREDO) =>
  new Promise<{ codigo: number; saida: string; erro: string }>((ok) => {
    const env = { ...process.env };
    delete env.SEGREDO_ADMIN;
    if (segredo !== null) env.SEGREDO_ADMIN = segredo;
    execFile(process.execPath, [SCRIPT, ...args], { env }, (e, saida, erro) => ok({ codigo: e ? ((e as { code?: number }).code ?? 1) : 0, saida, erro }));
  });

const pasta = () => {
  const p = mkdtempSync(join(tmpdir(), 'sala-script-'));
  pastas.push(p);
  return p;
};

const CARTEIRA = { saldo: 100, itens: [{ skin: 'classico', semente: 1, bolas: 0 }], skin: 'classico', criadaEm: 1, jogou: true };

describe('importar:cf exige --arquivo (sem arquivo padrão)', () => {
  it('sem --arquivo recusa antes de falar com o Worker e explica por quê', async () => {
    const w = await worker();
    const r = await rodar(['--url', w.base]);
    expect(r.codigo).toBe(2);
    expect(r.erro).toContain('Falta --arquivo');
    expect(r.erro).toContain('carteiras.json velho');
    expect(w.pedidos).toEqual([]);
  });

  it('sem --arquivo recusa mesmo com --sobrescrever, e --arquivo sem valor também', async () => {
    const w = await worker();
    expect((await rodar(['--url', w.base, '--sobrescrever'])).codigo).toBe(2);
    const vazio = await rodar(['--url', w.base, '--arquivo']);
    expect(vazio.codigo).toBe(2);
    expect(vazio.erro).toContain('Falta --arquivo');
    expect(w.pedidos).toEqual([]);
  });

  it('com --arquivo envia exatamente esse arquivo', async () => {
    const w = await worker();
    const p = pasta();
    const arquivo = join(p, 'copia-2026-11-02.json');
    const texto = JSON.stringify({ versao: 2, carteiras: { [ID]: CARTEIRA } });
    writeFileSync(arquivo, texto);
    const r = await rodar(['--url', w.base, '--arquivo', arquivo]);
    expect(r.codigo, r.erro).toBe(0);
    expect(w.pedidos).toHaveLength(1);
    expect(w.pedidos[0]!.corpo).toBe(texto);
    expect(w.pedidos[0]!.autorizacao).toBe(`Bearer ${SEGREDO}`);
    expect(r.saida).not.toContain(SEGREDO);
  });
});

describe('importar:cf junta o balão da sala Node', () => {
  it('o carteiras.json com um carteiras-balao.json ao lado vai com `baloes`', async () => {
    const w = await worker();
    const p = pasta();
    writeFileSync(join(p, 'carteiras.json'), JSON.stringify({ versao: 2, carteiras: { [ID]: CARTEIRA } }));
    const balao = { itens: ['coroa'], aparencia: { chapeu: 'coroa', bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' } };
    writeFileSync(join(p, 'carteiras-balao.json'), JSON.stringify({ versao: 1, baloes: { [ID]: balao } }));
    const r = await rodar(['--url', w.base, '--arquivo', join(p, 'carteiras.json')]);
    expect(r.codigo, r.erro).toBe(0);
    expect(JSON.parse(w.pedidos[0]!.corpo)).toEqual({ versao: 2, carteiras: { [ID]: CARTEIRA }, baloes: { [ID]: balao } });
    expect(r.saida).toContain('Juntei o balão de 1 carteiras');
  });

  it('sem o arquivo do balão, ou com uma cópia que já tem `baloes`, o corpo segue como está', async () => {
    const w = await worker();
    const p = pasta();
    const sozinho = JSON.stringify({ versao: 2, carteiras: { [ID]: CARTEIRA } });
    writeFileSync(join(p, 'carteiras.json'), sozinho);
    await rodar(['--url', w.base, '--arquivo', join(p, 'carteiras.json')]);
    const q = pasta();
    const copia = JSON.stringify({ versao: 2, carteiras: { [ID]: CARTEIRA }, baloes: {}, carteiras_descartadas: [] });
    writeFileSync(join(q, 'carteiras.json'), copia);
    writeFileSync(join(q, 'carteiras-balao.json'), JSON.stringify({ versao: 1, baloes: { [ID]: { itens: ['coroa'], aparencia: {} } } }));
    await rodar(['--url', w.base, '--arquivo', join(q, 'carteiras.json')]);
    expect(w.pedidos.map((x) => x.corpo)).toEqual([sozinho, copia]);
  });

  it('um carteiras-balao.json que não presta recusa sem enviar nada', async () => {
    const w = await worker();
    const p = pasta();
    writeFileSync(join(p, 'carteiras.json'), JSON.stringify({ versao: 2, carteiras: {} }));
    writeFileSync(join(p, 'carteiras-balao.json'), '{ quebrado');
    const r = await rodar(['--url', w.base, '--arquivo', join(p, 'carteiras.json')]);
    expect(r.codigo).toBe(1);
    expect(r.erro).toContain('Nada foi enviado');
    expect(w.pedidos).toEqual([]);
  });
});

describe('importar:cf --restaurar', () => {
  it('manda cada id em `?restaurar=` e não junta o balão do lado', async () => {
    const w = await worker(200, { ok: true, restauradas: 2 });
    const p = pasta();
    const copia = JSON.stringify({ versao: 2, carteiras: {}, carteiras_descartadas: [] });
    writeFileSync(join(p, 'carteiras.json'), copia);
    writeFileSync(join(p, 'carteiras-balao.json'), JSON.stringify({ versao: 1, baloes: {} }));
    const outro = 'b'.repeat(64);
    const r = await rodar(['--url', w.base, '--arquivo', join(p, 'carteiras.json'), '--restaurar', ID, '--restaurar', outro]);
    expect(r.codigo, r.erro).toBe(0);
    expect(w.pedidos[0]!.url).toBe(`/admin/importar-carteiras?restaurar=${ID}&restaurar=${outro}`);
    expect(w.pedidos[0]!.corpo).toBe(copia);
    expect(r.saida).toContain('Restauradas: 2');
  });

  it('não se combina com --sobrescrever nem com --aceitar-descartadas, e quer um id de verdade', async () => {
    const w = await worker();
    const p = pasta();
    writeFileSync(join(p, 'copia.json'), '{}');
    const base = ['--url', w.base, '--arquivo', join(p, 'copia.json')];
    expect((await rodar([...base, '--restaurar', ID, '--sobrescrever'])).codigo).toBe(2);
    expect((await rodar([...base, '--restaurar', ID, '--aceitar-descartadas'])).codigo).toBe(2);
    expect((await rodar([...base, '--restaurar', 'abc'])).codigo).toBe(2);
    expect((await rodar([...base, '--restaurar'])).codigo).toBe(2);
    expect(w.pedidos).toEqual([]);
  });

  it('a recusa do Worker vira uma explicação', async () => {
    const w = await worker(409, { erro: 'ja-existe' });
    const p = pasta();
    writeFileSync(join(p, 'copia.json'), JSON.stringify({ versao: 2, carteiras: {} }));
    const r = await rodar(['--url', w.base, '--arquivo', join(p, 'copia.json'), '--restaurar', ID]);
    expect(r.codigo).toBe(1);
    expect(r.erro).toContain('ja-existe');
    expect(r.erro).toContain('nunca troca');
  });
});
