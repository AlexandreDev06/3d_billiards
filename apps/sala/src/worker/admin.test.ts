/** As rotas de administração do Worker (L41), sem o workerd: o segredo, o balde por IP, a importação e o que vai a log. */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CarteirasEmMemoria } from '../carteiras-base';
import { ArmazemDeCarteiras } from '../carteiras';
import { CarteirasNoDO } from '../carteiras-sqlite';
import { banco } from '../para-testes-sqlite';
import { CarteirasEmMemoria as CarteirasEmMemoriaAnterior } from '../versao-anterior/carteiras-base';
import { AdminDoWorker, MAX_BYTES_DA_IMPORTACAO, TAMANHO_MINIMO_DO_SEGREDO, segredoConfere } from './admin';

const SEGREDO = 'um-segredo-de-teste-bem-longo';
const URL_BASE = 'https://sala.exemplo';

function montar(segredo: string | null | undefined = SEGREDO) {
  const logs: string[] = [];
  let agora = 1_000_000;
  let salas = 0;
  const log = (evento: string, campos: Record<string, unknown> = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`);
  const carteiras = new CarteirasEmMemoria({ maxCarteiras: 50, relogio: () => agora, log });
  const admin = new AdminDoWorker({ segredo: segredo === null ? undefined : segredo, carteiras, relogio: () => agora, log, uso: () => ({ carteiras: carteiras.total }), salasAbertas: () => salas });
  const chamar = (metodo: string, caminho: string, opcoes: { segredo?: string | null; corpo?: string; ip?: string } = {}): Promise<Response> => {
    const cabecalhos: Record<string, string> = {};
    const s = opcoes.segredo === undefined ? SEGREDO : opcoes.segredo;
    if (s !== null) cabecalhos.Authorization = `Bearer ${s}`;
    const url = new URL(caminho, URL_BASE);
    return admin.tratar(new Request(url, { method: metodo, headers: cabecalhos, ...(opcoes.corpo !== undefined ? { body: opcoes.corpo } : {}) }), url, opcoes.ip ?? '1.2.3.4');
  };
  return { admin, carteiras, chamar, logs, passar: (ms: number) => (agora += ms), salasAbertas: (n: number) => void (salas = n) };
}

const pastas: string[] = [];
afterAll(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

/** Um `carteiras.json` de verdade: o `ArmazemDeCarteiras` da sala Node grava duas carteiras (uma com compra) e o teste lê o arquivo. */
async function arquivoDeDuas(): Promise<{ texto: string; codigos: string[] }> {
  const pasta = mkdtempSync(join(tmpdir(), 'sala-admin-'));
  pastas.push(pasta);
  const node = new ArmazemDeCarteiras({ pasta, maxCarteiras: 50, atrasoMs: 1, relogio: () => 1_000_000, log: () => {} });
  const a = node.criar()!;
  const b = node.criar()!;
  node.comprar(a.id, 'ebano');
  await node.fechar();
  return { texto: readFileSync(join(pasta, 'carteiras.json'), 'utf8'), codigos: [a.codigo, b.codigo] };
}

describe('segredoConfere', () => {
  it('só o mesmo texto confere, qualquer que seja o tamanho do outro', async () => {
    expect(await segredoConfere(SEGREDO, SEGREDO)).toBe(true);
    expect(await segredoConfere(SEGREDO + 'x', SEGREDO)).toBe(false);
    expect(await segredoConfere(SEGREDO.slice(0, -1), SEGREDO)).toBe(false);
    expect(await segredoConfere('', SEGREDO)).toBe(false);
    expect(await segredoConfere('x'.repeat(10_000), SEGREDO)).toBe(false);
  });
});

describe('rotas de administração do Worker', () => {
  it('sem segredo configurado, ou curto demais, as rotas não existem', async () => {
    for (const segredo of [null, '', 'x'.repeat(TAMANHO_MINIMO_DO_SEGREDO - 1)]) {
      const { chamar } = montar(segredo);
      for (const [metodo, caminho] of [['GET', '/admin/uso'], ['POST', '/admin/importar-carteiras'], ['GET', '/admin/exportar-carteiras']] as const) {
        const r = await chamar(metodo, caminho, { segredo: segredo ?? 'qualquer-um-qualquer-um' });
        expect(r.status, `${String(segredo)} ${caminho}`).toBe(404);
      }
    }
  });

  it('exige o Bearer certo: sem cabeçalho, errado, mais curto ou mais longo é 401, e o log não leva o que foi tentado', async () => {
    const { chamar, logs } = montar();
    expect((await chamar('GET', '/admin/uso', { segredo: null })).status).toBe(401);
    expect((await chamar('GET', '/admin/uso', { segredo: 'segredo-errado-segredo-errado' })).status).toBe(401);
    expect((await chamar('GET', '/admin/uso', { segredo: SEGREDO.slice(0, -1) })).status).toBe(401);
    expect((await chamar('GET', '/admin/uso', { segredo: SEGREDO + 'x' })).status).toBe(401);
    expect((await chamar('GET', '/admin/uso')).status).toBe(200);
    expect(logs.filter((l) => l.startsWith('admin-recusado '))).toHaveLength(4);
    expect(logs.join('\n')).not.toContain('segredo-errado');
    expect(logs.join('\n')).not.toContain(SEGREDO);
  });

  it('rota desconhecida é 404 e método errado é 405 com Allow', async () => {
    const { chamar } = montar();
    expect((await chamar('GET', '/admin/outra')).status).toBe(404);
    const metodo = await chamar('POST', '/admin/uso');
    expect(metodo.status).toBe(405);
    expect(metodo.headers.get('allow')).toBe('GET');
    expect((await chamar('GET', '/admin/importar-carteiras')).headers.get('allow')).toBe('POST');
    const exportar = await chamar('POST', '/admin/exportar-carteiras');
    expect(exportar.status).toBe(405);
    expect(exportar.headers.get('allow')).toBe('GET');
  });

  it('cada IP tem o seu balde, e o balde volta a encher com o tempo', async () => {
    const { chamar, passar } = montar();
    for (let i = 0; i < 30; i++) expect((await chamar('GET', '/admin/uso', { segredo: 'x'.repeat(20) })).status, `${i}`).toBe(401);
    const cheio = await chamar('GET', '/admin/uso', { segredo: SEGREDO });
    expect(cheio.status).toBe(429);
    expect(cheio.headers.get('retry-after')).toBe('10');
    // outro IP não é afetado
    expect((await chamar('GET', '/admin/uso', { ip: '5.6.7.8' })).status).toBe(200);
    passar(10_000);
    expect((await chamar('GET', '/admin/uso')).status).toBe(200);
  });

  it('importa uma vez, recusa se já há carteiras, e `?sobrescrever=1` troca; só contagens na resposta e no log', async () => {
    const { chamar, carteiras, logs } = montar();
    const { texto, codigos } = await arquivoDeDuas();
    const primeira = await chamar('POST', '/admin/importar-carteiras', { corpo: texto });
    expect(primeira.status).toBe(200);
    expect(await primeira.json()).toEqual({ ok: true, importadas: 2, descartadas: 0, migradas: 0, substituidas: 0 });
    expect(carteiras.total).toBe(2);
    expect(codigos.every((c) => carteiras.resolver(c) !== undefined)).toBe(true);

    const segunda = await chamar('POST', '/admin/importar-carteiras', { corpo: texto });
    expect(segunda.status).toBe(409);
    expect(await segunda.json()).toMatchObject({ erro: 'ja-tem-carteiras', existentes: 2 });
    expect(carteiras.total).toBe(2);

    const troca = await chamar('POST', '/admin/importar-carteiras?sobrescrever=1', { corpo: texto });
    expect(troca.status).toBe(200);
    expect(await troca.json()).toMatchObject({ ok: true, importadas: 2, substituidas: 2 });

    const tudo = logs.join('\n');
    for (const c of codigos) expect(tudo).not.toContain(c);
    expect(logs.filter((l) => l.startsWith('admin-importacao '))).toEqual([
      'admin-importacao {"ok":true,"importadas":2}',
      'admin-importacao {"ok":false,"motivo":"ja-tem-carteiras"}',
      'admin-importacao {"ok":true,"importadas":2}',
    ]);
  });

  it('`?sobrescrever=1` é recusado enquanto houver sala aberta (a gente sentada perderia o saldo); sem sala, passa', async () => {
    const { chamar, carteiras, logs, salasAbertas } = montar();
    const { texto, codigos } = await arquivoDeDuas();
    // a primeira importação, sem sobrescrever, não depende de sala nenhuma
    salasAbertas(2);
    expect((await chamar('POST', '/admin/importar-carteiras', { corpo: texto })).status).toBe(200);
    const antes = carteiras.ler(carteiras.resolver(codigos[0]!)!);

    const recusada = await chamar('POST', '/admin/importar-carteiras?sobrescrever=1', { corpo: texto });
    expect(recusada.status).toBe(409);
    expect(await recusada.json()).toEqual({ erro: 'salas-abertas', salas: 2 });
    expect(carteiras.total).toBe(2);
    expect(carteiras.ler(carteiras.resolver(codigos[0]!)!)).toEqual(antes);
    expect(logs.filter((l) => l.startsWith('admin-importacao '))).toContain('admin-importacao {"ok":false,"motivo":"salas-abertas","salas":2}');

    salasAbertas(0);
    const liberada = await chamar('POST', '/admin/importar-carteiras?sobrescrever=1', { corpo: texto });
    expect(liberada.status).toBe(200);
    expect(await liberada.json()).toMatchObject({ ok: true, importadas: 2, substituidas: 2 });
  });

  it('arquivo que não é um carteiras.json, corpo grande, corpo que não é UTF-8: recusa sem mexer em nada', async () => {
    const { chamar, carteiras } = montar();
    const ruim = await chamar('POST', '/admin/importar-carteiras', { corpo: 'isto não é json' });
    expect(ruim.status).toBe(422);
    expect(await ruim.json()).toMatchObject({ erro: 'arquivo-invalido' });
    const versao = await chamar('POST', '/admin/importar-carteiras', { corpo: JSON.stringify({ versao: 99, carteiras: {} }) });
    expect(versao.status).toBe(422);

    const grande = await chamar('POST', '/admin/importar-carteiras', { corpo: 'x'.repeat(MAX_BYTES_DA_IMPORTACAO + 1) });
    expect(grande.status).toBe(413);

    const url = new URL('/admin/importar-carteiras', URL_BASE);
    const invalido = await montar().admin.tratar(
      new Request(url, { method: 'POST', headers: { Authorization: `Bearer ${SEGREDO}` }, body: new Uint8Array([0xff, 0xfe, 0xfd]) }),
      url,
      '9.9.9.9',
    );
    expect(invalido.status).toBe(400);
    expect(carteiras.total).toBe(0);
  });

  it('carteira estragada no arquivo: recusa a menos que se aceite descartar', async () => {
    const { chamar, carteiras } = montar();
    const { texto } = await arquivoDeDuas();
    const lido = JSON.parse(texto) as { carteiras: Record<string, Record<string, unknown>> };
    const [primeiroId] = Object.keys(lido.carteiras);
    lido.carteiras[primeiroId!]!.saldo = 'muito';
    const estragado = JSON.stringify(lido);
    const recusada = await chamar('POST', '/admin/importar-carteiras', { corpo: estragado });
    expect(recusada.status).toBe(422);
    expect(await recusada.json()).toMatchObject({ erro: 'carteiras-invalidas', descartadas: 1 });
    expect(carteiras.total).toBe(0);
    const aceita = await chamar('POST', '/admin/importar-carteiras?aceitar-descartadas=1', { corpo: estragado });
    expect(aceita.status).toBe(200);
    expect(await aceita.json()).toMatchObject({ ok: true, importadas: 1, descartadas: 1 });
  });

  it('GET /admin/uso devolve o que o objeto entrega, sem cache', async () => {
    const { chamar } = montar();
    const r = await chamar('GET', '/admin/uso');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(await r.json()).toEqual({ carteiras: 0 });
  });
});

describe('GET /admin/exportar-carteiras (L47): a cópia de segurança que a importação aceita', () => {
  /** Duas carteiras com saldo, itens do balão e uma aparência equipada, feitas pelo núcleo comum (o mesmo que roda no objeto). */
  function comBalao(carteiras: CarteirasEmMemoria) {
    const ana = carteiras.criar()!;
    const beto = carteiras.criar()!;
    carteiras.aplicar([{ id: ana.id, delta: 5000 }]);
    for (const item of ['coroa', 'bigodao', 'dourado']) expect(carteiras.comprarItemDoBalao(ana.id, item).ok, item).toBe(true);
    expect(carteiras.equiparAparencia(ana.id, { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_normal', corDosOlhos: 'dourado' }).ok).toBe(true);
    return { ana, beto };
  }

  it('sem o segredo certo não entrega nada: 401 sem cabeçalho e com o segredo errado, e o corpo não leva carteira', async () => {
    const { chamar, carteiras } = montar();
    comBalao(carteiras);
    for (const segredo of [null, 'segredo-errado-segredo-errado', SEGREDO.slice(0, -1), SEGREDO + 'x']) {
      const r = await chamar('GET', '/admin/exportar-carteiras', { segredo });
      expect(r.status, String(segredo)).toBe(401);
      const texto = await r.text();
      expect(texto).not.toContain('carteiras');
      expect(texto).not.toContain('saldo');
    }
  });

  it('com o segredo entrega o arquivo no formato do carteiras.json, sem cache, e a importação o aceita de volta idêntico', async () => {
    const origem = montar();
    const { ana, beto } = comBalao(origem.carteiras);
    const r = await origem.chamar('GET', '/admin/exportar-carteiras');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/json');
    expect(r.headers.get('cache-control')).toBe('no-store');
    const texto = await r.text();
    expect(JSON.parse(texto)).toMatchObject({ versao: 2, carteiras: { [ana.id]: { saldo: expect.any(Number) }, [beto.id]: expect.anything() } });

    // outra instância (outro objeto, vazio) importa o arquivo exportado e fica com o mesmo: saldo, itens e aparência
    const destino = montar();
    const volta = await destino.chamar('POST', '/admin/importar-carteiras', { corpo: texto });
    expect(volta.status).toBe(200);
    expect(await volta.json()).toEqual({ ok: true, importadas: 2, descartadas: 0, migradas: 0, substituidas: 0 });
    for (const { id } of [ana, beto]) expect(destino.carteiras.ler(id)).toEqual(origem.carteiras.ler(id));
    expect(destino.carteiras.ler(ana.id)?.balao).toEqual({
      aparencia: { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_normal', corDosOlhos: 'dourado' },
      itens: ['coroa', 'bigodao', 'olho_normal', 'castanho', 'dourado'],
    });

    // o desastre: as carteiras de um objeto são trocadas pela cópia (`sobrescrever`) e voltam ao que eram
    origem.carteiras.aplicar([{ id: ana.id, delta: -300 }]);
    expect(origem.carteiras.ler(ana.id)!.saldo).not.toBe(destino.carteiras.ler(ana.id)!.saldo);
    const restaurada = await origem.chamar('POST', '/admin/importar-carteiras?sobrescrever=1', { corpo: texto });
    expect(restaurada.status).toBe(200);
    expect(origem.carteiras.ler(ana.id)).toEqual(destino.carteiras.ler(ana.id));
  });

  it('as linhas das carteiras saem sem a chave `balao` (o balão vai em `baloes`): a versão antiga da sala importa a cópia inteira sem descartar nada', async () => {
    const { chamar, carteiras } = montar();
    const { ana, beto } = comBalao(carteiras);
    const copia = JSON.parse(await (await chamar('GET', '/admin/exportar-carteiras')).text()) as { carteiras: Record<string, object>; baloes: Record<string, unknown> };
    for (const linha of Object.values(copia.carteiras)) expect(Object.keys(linha)).not.toContain('balao');
    expect(Object.keys(copia.baloes)).toEqual([ana.id]);
    // a versão anterior ao L47 (a cópia congelada) lê a cópia que a nova exporta
    const velha = new CarteirasEmMemoriaAnterior({ maxCarteiras: 50, relogio: () => 1_000_000, log: () => {} });
    expect(velha.importar(JSON.stringify(copia))).toEqual({ ok: true, importadas: 2, descartadas: 0, migradas: 0, substituidas: 0 });
    expect(velha.ler(ana.id)!.saldo).toBe(carteiras.ler(ana.id)!.saldo);
    expect(velha.ler(beto.id)).toBeDefined();
  });

  it('o log diz só quantas carteiras saíram: nunca o conteúdo, um código nem um id', async () => {
    const { chamar, carteiras, logs } = montar();
    const { ana, beto } = comBalao(carteiras);
    const texto = await (await chamar('GET', '/admin/exportar-carteiras')).text();
    expect(logs.filter((l) => l.startsWith('admin-exportacao '))).toEqual(['admin-exportacao {"exportadas":2}']);
    const tudo = logs.join('\n');
    for (const c of [ana, beto]) {
      expect(tudo).not.toContain(c.id);
      expect(tudo).not.toContain(c.codigo);
      expect(texto).not.toContain(c.codigo);
    }
    expect(logs.filter((l) => l.startsWith('admin-exportacao ')).join('\n')).not.toMatch(/coroa|saldo|balao/);
  });

  it('sem nenhuma carteira ainda é um arquivo válido; gasta o mesmo balde por IP das outras rotas', async () => {
    const { chamar } = montar();
    const vazio = await chamar('GET', '/admin/exportar-carteiras');
    expect(vazio.status).toBe(200);
    expect(JSON.parse(await vazio.text())).toEqual({ versao: 2, carteiras: {}, baloes: {}, carteiras_descartadas: [] });
    for (let i = 0; i < 29; i++) expect((await chamar('GET', '/admin/exportar-carteiras')).status, `${i}`).toBe(200);
    expect((await chamar('GET', '/admin/exportar-carteiras')).status).toBe(429);
    expect((await chamar('GET', '/admin/uso')).status).toBe(429);
  });
});

describe('as carteiras descartadas (L47b): ler pela administração e trazer de volta pela importação', () => {
  const ID_ANTIGO = '1'.repeat(64);
  const ID_QUEBRADO = '2'.repeat(64);
  const ANTIGA = { saldo: 321, skins: ['classico', 'ebano'], skin: 'ebano', criadaEm: 1_700_000_000_000, jogou: true };

  /** O objeto de verdade (SQLite) com uma linha de cada tipo que a leitura descarta, e uma carteira boa. */
  function comDescartadas() {
    const b = banco();
    const abrir = () => new CarteirasNoDO({ sql: b.sql, transacao: b.transacao, maxCarteiras: 50, relogio: () => 1_000_000, log: () => {}, sortearSemente: () => 7 });
    abrir();
    b.db.prepare('INSERT INTO carteiras (id, dados) VALUES (?, ?)').run(ID_ANTIGO, JSON.stringify(ANTIGA));
    b.db.prepare('INSERT INTO carteiras (id, dados) VALUES (?, ?)').run(ID_QUEBRADO, '{ quebrada');
    const carteiras = abrir();
    const logs: string[] = [];
    const log = (evento: string, campos: Record<string, unknown> = {}) => logs.push(`${evento} ${JSON.stringify(campos)}`);
    let salas = 0;
    const admin = new AdminDoWorker({ segredo: SEGREDO, carteiras, relogio: () => 1_000_000, log, uso: () => ({}), salasAbertas: () => salas });
    const chamar = (metodo: string, caminho: string, opcoes: { segredo?: string | null; corpo?: string } = {}): Promise<Response> => {
      const url = new URL(caminho, URL_BASE);
      const s = opcoes.segredo === undefined ? SEGREDO : opcoes.segredo;
      return admin.tratar(new Request(url, { method: metodo, headers: s === null ? {} : { Authorization: `Bearer ${s}` }, ...(opcoes.corpo !== undefined ? { body: opcoes.corpo } : {}) }), url, '9.9.9.9');
    };
    return { carteiras, chamar, logs, abrirSalas: () => void (salas = 2) };
  }

  it('GET /admin/exportar-carteiras leva `carteiras_descartadas`', async () => {
    const { chamar } = comDescartadas();
    const copia = JSON.parse(await (await chamar('GET', '/admin/exportar-carteiras')).text()) as { carteiras_descartadas: { id: string; motivo: string }[] };
    expect(copia.carteiras_descartadas.map((d) => [d.id, d.motivo]).sort()).toEqual([[ID_ANTIGO, 'forma-invalida'], [ID_QUEBRADO, 'json-quebrado']]);
  });

  it('GET /admin/carteiras-descartadas só com o segredo: sem cache, só a lista, e o log leva só a contagem', async () => {
    const { chamar, logs } = comDescartadas();
    for (const segredo of [null, 'segredo-errado-segredo-errado']) {
      const r = await chamar('GET', '/admin/carteiras-descartadas', { segredo });
      expect(r.status, String(segredo)).toBe(401);
      expect(await r.text()).not.toContain(ID_ANTIGO);
    }
    expect((await chamar('POST', '/admin/carteiras-descartadas')).status).toBe(405);
    const r = await chamar('GET', '/admin/carteiras-descartadas');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const corpo = (await r.json()) as { carteiras_descartadas: { id: string; dados: string; motivo: string; em: number }[] };
    expect(corpo.carteiras_descartadas).toEqual([
      { id: ID_ANTIGO, dados: JSON.stringify(ANTIGA), motivo: 'forma-invalida', em: 1_000_000 },
      { id: ID_QUEBRADO, dados: '{ quebrada', motivo: 'json-quebrado', em: 1_000_000 },
    ]);
    expect(logs.filter((l) => l.startsWith('admin-descartadas'))).toEqual(['admin-descartadas {"lidas":2}']);
    expect(logs.join('\n')).not.toContain(ID_ANTIGO);
  });

  it('POST /admin/importar-carteiras?restaurar=<id> traz de volta só a pedida, mesmo com salas abertas', async () => {
    const { chamar, carteiras, logs, abrirSalas } = comDescartadas();
    const copia = await (await chamar('GET', '/admin/exportar-carteiras')).text();
    // o que a rota de leitura devolve também serve de corpo (só precisa de `carteiras_descartadas`)
    const lista = await (await chamar('GET', '/admin/carteiras-descartadas')).text();
    abrirSalas();
    const r = await chamar('POST', `/admin/importar-carteiras?restaurar=${ID_ANTIGO}`, { corpo: lista });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, restauradas: 1 });
    expect(carteiras.ler(ID_ANTIGO)).toMatchObject({ saldo: 321, skin: 'ebano' });
    expect(carteiras.ler(ID_QUEBRADO)).toBeUndefined();
    expect(carteiras.descartadas().map((d) => d.id)).toEqual([ID_QUEBRADO]);
    expect(logs.filter((l) => l.startsWith('admin-restauracao'))).toEqual(['admin-restauracao {"ok":true,"restauradas":1}']);
    // a cópia de antes ainda a tem na lista, mas agora ela existe: não se troca
    expect((await chamar('POST', `/admin/importar-carteiras?restaurar=${ID_ANTIGO}`, { corpo: copia })).status).toBe(409);
  });

  it('as recusas têm o seu código: id que a cópia não tem 404, que não presta 422, que já existe 409, e restaurar não se mistura com sobrescrever', async () => {
    const { chamar, carteiras } = comDescartadas();
    const copia = await (await chamar('GET', '/admin/exportar-carteiras')).text();
    const pedir = async (consulta: string, corpo = copia) => {
      const r = await chamar('POST', `/admin/importar-carteiras?${consulta}`, { corpo });
      return [r.status, ((await r.json()) as { erro?: string }).erro] as const;
    };
    expect(await pedir(`restaurar=${'f'.repeat(64)}`)).toEqual([404, 'descartada-nao-encontrada']);
    expect(await pedir(`restaurar=${ID_QUEBRADO}`)).toEqual([422, 'descartada-invalida']);
    expect(await pedir(`restaurar=${ID_ANTIGO}`, 'não é json')).toEqual([422, 'arquivo-invalido']);
    expect(await pedir(`restaurar=${ID_ANTIGO}&sobrescrever=1`)).toEqual([400, 'parametros-incompativeis']);
    expect(await pedir(`restaurar=${ID_ANTIGO}&aceitar-descartadas=1`)).toEqual([400, 'parametros-incompativeis']);
    expect(carteiras.total).toBe(0);
  });
});
