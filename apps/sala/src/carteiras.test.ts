import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SALDO_INICIAL, SKINS_DE_TACO, SKIN_PADRAO, diaDaMissao, ehCodigoDeCarteira, ehSemente, missoesDoDia, padraoDaSemente, skinDoCatalogoPorId, vitrineDoDia } from '@sinuca/protocolo';
import { ArmazemDeCarteiras, type OpcoesDoArmazem } from './carteiras';

/**
 * `node:fs/promises` com um olho e uma mão: anota a ordem de `open` e `rename` da gravação e, se o teste pedir, faz o `rename`
 * falhar (uma queda entre o temporário escrito e a troca) ou a abertura da pasta falhar (sistema que não deixa).
 */
const disco = vi.hoisted(() => ({
  ordem: [] as string[],
  falharRename: null as Error | null,
  falharAberturaDaPasta: false,
  /** Segura o PRÓXIMO `rename` até o teste soltar: uma gravação parada no meio, para mudar algo enquanto ela dura. */
  portao: null as { chegou: () => void; esperar: Promise<void> } | null,
}));
vi.mock('node:fs/promises', async (importarOriginal) => {
  const real = await importarOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    open: (async (...args: Parameters<typeof real.open>) => {
      disco.ordem.push(`open ${String(args[0])} ${String(args[1])}`);
      if (disco.falharAberturaDaPasta && args[1] === 'r') throw Object.assign(new Error('EISDIR: não deixo abrir pasta'), { code: 'EISDIR' });
      return real.open(...args);
    }) as typeof real.open,
    rename: (async (...args: Parameters<typeof real.rename>) => {
      disco.ordem.push(`rename ${String(args[1])}`);
      const portao = disco.portao;
      if (portao) {
        disco.portao = null;
        portao.chegou();
        await portao.esperar;
      }
      if (disco.falharRename) throw disco.falharRename;
      return real.rename(...args);
    }) as typeof real.rename,
  };
});

const pastas: string[] = [];
const abertos: ArmazemDeCarteiras[] = [];
/** Pasta temporária própria de cada teste: nunca `apps/sala/dados/`. */
const pastaNova = (): string => {
  const p = mkdtempSync(join(tmpdir(), 'sala-carteiras-'));
  pastas.push(p);
  return p;
};
afterEach(async () => {
  disco.ordem.length = 0;
  disco.falharRename = null;
  disco.falharAberturaDaPasta = false;
  disco.portao = null;
  await Promise.all(abertos.splice(0).map((a) => a.fechar())); // a pasta tem um dono só: solta a trava de cada teste
  for (const p of pastas.splice(0)) {
    try {
      chmodSync(p, 0o700);
    } catch {
      // a pasta pode já ter sumido
    }
    rmSync(p, { recursive: true, force: true });
  }
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

/** O próximo `rename` fica parado: `chegou` resolve quando a gravação para nele, e `soltar()` a deixa seguir. */
function reterOProximoRename(): { readonly chegou: Promise<void>; soltar(): void } {
  let soltar!: () => void;
  let avisar!: () => void;
  const chegou = new Promise<void>((resolve) => (avisar = resolve));
  disco.portao = { chegou: avisar, esperar: new Promise<void>((resolve) => (soltar = resolve)) };
  return { chegou, soltar };
}

const novaCarteira = (armazem: ArmazemDeCarteiras) => armazem.criar()!;
const arquivoDe = (pasta: string): string => join(pasta, 'carteiras.json');
/** O que há na pasta, sem a trava (que tem testes próprios em carteiras-trava.test.ts). */
const vivos = (pasta: string): string[] => readdirSync(pasta).filter((n) => n !== 'carteiras.lock').sort();

describe('criar e achar carteiras', () => {
  it('cria com o saldo inicial, só o clássico e o clássico em uso; o código tem a forma de 32 bytes em base64url', () => {
    const { armazem } = abrir(null);
    const { codigo, id } = novaCarteira(armazem);
    expect(ehCodigoDeCarteira(codigo)).toBe(true);
    expect(armazem.ler(id)).toMatchObject({ saldo: SALDO_INICIAL, skins: ['classico'], skin: 'classico' });
    expect(armazem.total).toBe(1);
  });

  it('cada carteira ganha um código diferente (aleatório de verdade, não uma sequência)', () => {
    const { armazem } = abrir(null, { maxCarteiras: 2000 });
    const codigos = new Set(Array.from({ length: 1000 }, () => novaCarteira(armazem).codigo));
    expect(codigos.size).toBe(1000);
    // nenhum par compartilha o começo (um contador ou data o faria)
    expect(new Set([...codigos].map((c) => c.slice(0, 6))).size).toBeGreaterThan(990);
  });

  it('resolver devolve a mesma carteira para o mesmo código, e nada para código trocado, parecido, de outra forma ou que nunca existiu', () => {
    const { armazem } = abrir(null);
    const a = novaCarteira(armazem);
    const b = novaCarteira(armazem);
    expect(armazem.resolver(a.codigo)).toBe(a.id);
    expect(armazem.resolver(b.codigo)).toBe(b.id);
    expect(a.id).not.toBe(b.id);
    const trocado = a.codigo.slice(0, -1) + (a.codigo.endsWith('A') ? 'B' : 'A');
    for (const ruim of [trocado, a.codigo.slice(1), a.codigo + 'x', '', 'x'.repeat(43), a.id, a.codigo.toLowerCase() === a.codigo ? a.codigo.toUpperCase() : a.codigo.toLowerCase()]) {
      expect(armazem.resolver(ruim), ruim).toBeUndefined();
    }
  });

  it('o id interno não é o código nem o revela (resumo SHA-256 em hexadecimal)', () => {
    const { armazem } = abrir(null);
    const { codigo, id } = novaCarteira(armazem);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(id).not.toContain(codigo);
  });

  it('um código repetido pelo gerador é descartado e sorteado de novo (nunca sobrescreve a carteira de alguém)', () => {
    const fila = ['A'.repeat(43), 'A'.repeat(43), 'B'.repeat(43)];
    const { armazem } = abrir(null, { gerarCodigo: () => fila.shift()! });
    const a = novaCarteira(armazem);
    armazem.aplicar([{ id: a.id, delta: 7 }]);
    const b = novaCarteira(armazem);
    expect(b.codigo).toBe('B'.repeat(43));
    expect(armazem.ler(a.id)!.saldo).toBe(SALDO_INICIAL + 7);
  });

  it('o teto de carteiras recusa a criação (null) quando todas estão em uso, e as que já existem seguem valendo', () => {
    const { armazem, logs } = abrir(null, { maxCarteiras: 3 });
    const feitas = [novaCarteira(armazem), novaCarteira(armazem), novaCarteira(armazem)];
    armazem.registrarPartida(feitas.map((f) => f.id));
    expect(armazem.criar()).toBeNull();
    expect(armazem.total).toBe(3);
    expect(armazem.resolver(feitas[0]!.codigo)).toBe(feitas[0]!.id);
    expect(logs.some((l) => l.startsWith('carteiras-cheio'))).toBe(true);
  });

  it('ler devolve cópia: mexer no que veio não muda a carteira', () => {
    const { armazem } = abrir(null);
    const { id } = novaCarteira(armazem);
    const lido = armazem.ler(id)!;
    (lido.skins as string[]).push('ouro');
    expect(armazem.ler(id)!.skins).toEqual(['classico']);
  });

  it('o log não leva o código nem o id', () => {
    const { armazem, logs } = abrir(null);
    const { codigo, id } = novaCarteira(armazem);
    armazem.aplicar([{ id, delta: 500 }]);
    armazem.comprar(id, 'ouro');
    armazem.usar(id, 'ouro');
    const tudo = logs.join('\n');
    expect(tudo).not.toContain(codigo);
    expect(tudo).not.toContain(id);
    expect(tudo).not.toContain(id.slice(0, 12));
  });
});

describe('teto de carteiras: reaproveita as que nunca foram usadas (L25)', () => {
  /** Um armazém de teto 3 com relógio à mão: a idade de cada carteira é a de quando foi criada. */
  function cheio(extra: Partial<OpcoesDoArmazem> = {}, pasta: string | null = null) {
    let agora = 1_000;
    const r = abrir(pasta, { maxCarteiras: 3, relogio: () => agora, ...extra });
    const nova = (em: number) => {
      agora = em;
      return novaCarteira(r.armazem);
    };
    return { ...r, nova, relogio: (t: number) => (agora = t) };
  }

  it('no teto, a criação toma o lugar da carteira nunca usada mais velha: o total não passa do teto e o código antigo deixa de valer', () => {
    const { armazem, nova, logs } = cheio();
    const velha = nova(100);
    const meio = nova(200);
    const recente = nova(300);
    const chegou = nova(400);
    expect(armazem.total).toBe(3);
    expect(armazem.resolver(velha.codigo)).toBeUndefined();
    expect(armazem.ler(velha.id)).toBeUndefined();
    expect(armazem.resolver(meio.codigo)).toBe(meio.id);
    expect(armazem.resolver(recente.codigo)).toBe(recente.id);
    expect(armazem.resolver(chegou.codigo)).toBe(chegou.id);
    expect(logs.some((l) => l.startsWith('carteira-reaproveitada'))).toBe(true);
    expect(logs.join('\n')).not.toContain(velha.id);
    expect(logs.join('\n')).not.toContain(velha.codigo);
  });

  it('as mais velhas primeiro, uma por criação', () => {
    const { armazem, nova } = cheio();
    const a = nova(100);
    const b = nova(200);
    const c = nova(300);
    nova(400);
    nova(500);
    expect([a, b, c].map((x) => armazem.resolver(x.codigo) !== undefined)).toEqual([false, false, true]);
    expect(armazem.total).toBe(3);
  });

  it('a idade é a da criação, não a da ordem em que o armazém as guardou (arquivo lido de fora de ordem)', () => {
    const pasta = pastaNova();
    const ID = (n: string) => n.repeat(64);
    const guardado = (criadaEm: number) => ({ saldo: 100, skins: ['classico'], skin: 'classico', criadaEm, jogou: false });
    writeFileSync(arquivoDe(pasta), JSON.stringify({ versao: 1, carteiras: { [ID('a')]: guardado(300), [ID('b')]: guardado(100), [ID('c')]: guardado(200) } }));
    const { armazem } = abrir(pasta, { maxCarteiras: 3 });
    const { codigo } = novaCarteira(armazem);
    expect(armazem.ler(ID('b'))).toBeUndefined(); // a de criadaEm 100
    expect(armazem.ler(ID('a'))).toBeDefined();
    expect(armazem.ler(ID('c'))).toBeDefined();
    expect(armazem.resolver(codigo)).toBeDefined();
  });

  it('do arquivo, só vale como nunca usada a que tem o saldo inicial E só o clássico em uso: saldo diferente ou skin a mais, mesmo sem `jogou`, fica', () => {
    const pasta = pastaNova();
    const ID = (n: string) => n.repeat(64);
    const nova = { saldo: 100, skins: ['classico'], skin: 'classico', jogou: false };
    writeFileSync(
      arquivoDe(pasta),
      JSON.stringify({
        versao: 1,
        carteiras: {
          [ID('a')]: { ...nova, saldo: 50, criadaEm: 100 }, // gastou sem jogar? o saldo diz que alguém mexeu
          [ID('b')]: { ...nova, skins: ['classico', 'ebano'], skin: 'ebano', criadaEm: 200 }, // skin comprada, saldo de volta a 100
          [ID('c')]: { ...nova, criadaEm: 300 }, // a única nunca usada, apesar de ser a mais nova
        },
      }),
    );
    const { armazem } = abrir(pasta, { maxCarteiras: 3 });
    const { codigo } = novaCarteira(armazem);
    expect(armazem.ler(ID('a'))).toBeDefined();
    expect(armazem.ler(ID('b'))).toBeDefined();
    expect(armazem.ler(ID('c'))).toBeUndefined();
    expect(armazem.resolver(codigo)).toBeDefined();
    // a e b seguem de pé mesmo depois de outra criação: a que sai é sempre uma nunca usada (a recém-criada)
    expect(armazem.criar()).not.toBeNull();
    expect(armazem.ler(ID('a'))).toBeDefined();
    expect(armazem.ler(ID('b'))).toBeDefined();
  });

  it('quem mexeu no saldo, comprou skin ou trocou a skin está em uso e não é reaproveitada', () => {
    const { armazem, nova, logs } = cheio();
    const comSaldo = nova(100);
    const comSkin = nova(200);
    const outra = nova(300);
    armazem.aplicar([{ id: comSaldo.id, delta: -1 }]);
    armazem.aplicar([{ id: comSkin.id, delta: 100 }]);
    armazem.comprar(comSkin.id, 'ebano');
    armazem.aplicar([{ id: comSkin.id, delta: -50 }]); // volta ao saldo 100 com a skin comprada
    const chegou = nova(400);
    expect(armazem.resolver(comSaldo.codigo)).toBe(comSaldo.id);
    expect(armazem.resolver(comSkin.codigo)).toBe(comSkin.id);
    expect(armazem.resolver(outra.codigo)).toBeUndefined(); // a única nunca usada
    expect(armazem.resolver(chegou.codigo)).toBeDefined();
    expect(logs.some((l) => l.startsWith('carteiras-cheio'))).toBe(false);
  });

  it('saldo de volta a 100 depois de ganhar e perder não faz a carteira parecer nova: pagamento marca como usada', () => {
    const { armazem, nova } = cheio();
    const jogadora = nova(100);
    nova(200);
    nova(300);
    armazem.aplicar([{ id: jogadora.id, delta: 10 }]);
    armazem.aplicar([{ id: jogadora.id, delta: -10 }]);
    expect(armazem.ler(jogadora.id)).toMatchObject({ saldo: SALDO_INICIAL, skins: ['classico'] });
    nova(400);
    expect(armazem.resolver(jogadora.codigo)).toBe(jogadora.id);
  });

  it('sentada numa partida (registrarPartida) a carteira está em uso mesmo com o saldo intocado; id desconhecido é ignorado', () => {
    const { armazem, nova } = cheio();
    const sentou = nova(100);
    const livre = nova(200);
    nova(300);
    armazem.registrarPartida([sentou.id, '9'.repeat(64)]);
    nova(400);
    expect(armazem.resolver(sentou.codigo)).toBe(sentou.id);
    expect(armazem.resolver(livre.codigo)).toBeUndefined();
  });

  it('registrarPartida não é uma mudança visível: não avisa os ouvintes, e vai ao disco', async () => {
    const pasta = pastaNova();
    const { armazem, nova } = cheio({ atrasoMs: 60_000 }, pasta);
    const vistos: string[] = [];
    armazem.aoMudar((id) => vistos.push(id));
    const a = nova(100);
    armazem.registrarPartida([a.id]);
    expect(vistos).toEqual([]);
    await armazem.fechar();
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[a.id].jogou).toBe(true);
  });

  it('sem nenhuma reaproveitável, o teto recusa como antes (null) e loga', () => {
    const { armazem, nova, logs } = cheio();
    for (const em of [100, 200, 300]) armazem.aplicar([{ id: nova(em).id, delta: 5 }]);
    expect(armazem.criar()).toBeNull();
    expect(armazem.total).toBe(3);
    expect(logs.some((l) => l.startsWith('carteiras-cheio'))).toBe(true);
  });

  it('abaixo do teto nada é reaproveitado', () => {
    const { armazem, nova, logs } = cheio({ maxCarteiras: 10 });
    const a = nova(100);
    nova(200);
    expect(armazem.resolver(a.codigo)).toBe(a.id);
    expect(logs.some((l) => l.startsWith('carteira-reaproveitada'))).toBe(false);
  });

  it('a que tomou o lugar vai ao disco e a antiga some de lá; o arquivo guarda se a carteira já jogou', async () => {
    const pasta = pastaNova();
    const { armazem, nova } = cheio({}, pasta);
    const velha = nova(100);
    const usada = nova(200);
    nova(300);
    armazem.registrarPartida([usada.id]);
    const chegou = nova(400);
    await armazem.fechar();
    const gravado = JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras as Record<string, { jogou: boolean }>;
    expect(Object.keys(gravado)).toHaveLength(3);
    expect(gravado[velha.id]).toBeUndefined();
    expect(gravado[usada.id]!.jogou).toBe(true);
    expect(gravado[chegou.id]!.jogou).toBe(false);
  });

  it('arquivo antigo, sem o campo jogou (L22): a carteira vale como já usada, porque não há como saber o contrário', () => {
    const pasta = pastaNova();
    const legado = (criadaEm: number) => ({ saldo: 100, skins: ['classico'], skin: 'classico', criadaEm });
    writeFileSync(arquivoDe(pasta), JSON.stringify({ versao: 1, carteiras: { ['a'.repeat(64)]: legado(1), ['b'.repeat(64)]: legado(2), ['c'.repeat(64)]: legado(3) } }));
    const { armazem, logs } = abrir(pasta, { maxCarteiras: 3 });
    expect(armazem.total).toBe(3);
    expect(logs.some((l) => l.startsWith('carteiras-corrompidas'))).toBe(false); // formato antigo não é "estragado": migra (L34)
    expect(logs).toEqual(['carteiras-migradas {"carteiras":3,"copia":"carteiras.antes-da-migracao-1700000000000.json"}']);
    expect(armazem.criar()).toBeNull();
    expect(armazem.total).toBe(3);
  });

  it('o campo jogou que não é verdadeiro/falso estraga só aquela carteira', () => {
    const pasta = pastaNova();
    const valido = { saldo: 100, skins: ['classico'], skin: 'classico', criadaEm: 1, jogou: false };
    writeFileSync(arquivoDe(pasta), JSON.stringify({ versao: 1, carteiras: { ['a'.repeat(64)]: valido, ['b'.repeat(64)]: { ...valido, jogou: 'sim' } } }));
    const { armazem, logs } = abrir(pasta);
    expect(armazem.total).toBe(1);
    expect(logs.some((l) => l.startsWith('carteiras-corrompidas'))).toBe(true);
  });
});

describe('comprar skins', () => {
  it('desconta o preço, guarda a skin na ordem da loja e não troca a que está em uso', () => {
    const { armazem } = abrir(null);
    const { id } = novaCarteira(armazem);
    armazem.aplicar([{ id, delta: 400 }]); // 500
    expect(armazem.comprar(id, 'marfim')).toMatchObject({ ok: true, estado: { saldo: 400, skins: ['classico', 'marfim'], skin: 'classico' } });
    expect(armazem.comprar(id, 'ebano')).toMatchObject({ ok: true, estado: { saldo: 350, skins: ['classico', 'ebano', 'marfim'], skin: 'classico' } });
  });

  it('com saldo exatamente igual ao preço compra e fica em zero; um a menos não compra', () => {
    const { armazem } = abrir(null);
    const { id } = novaCarteira(armazem);
    armazem.aplicar([{ id, delta: -50 }]); // 50
    expect(armazem.comprar(id, 'boteco')).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    expect(armazem.ler(id)!.saldo).toBe(50);
    expect(armazem.comprar(id, 'ebano')).toMatchObject({ ok: true, estado: { saldo: 0 } });
    armazem.aplicar([{ id, delta: 49 }]);
    expect(armazem.comprar(id, 'ebano')).toEqual({ ok: false, erro: 'ja-tem' });
  });

  it('a compra nunca deixa o saldo negativo: saldo negativo ou zero não compra nada', () => {
    const { armazem } = abrir(null);
    const { id } = novaCarteira(armazem);
    armazem.aplicar([{ id, delta: -SALDO_INICIAL - 30 }]); // -30
    for (const { id: skin } of SKINS_DE_TACO.slice(1)) expect(armazem.comprar(id, skin), skin).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    expect(armazem.ler(id)).toMatchObject({ saldo: -30, skins: ['classico'], skin: 'classico' });
  });

  it('já ter a skin é erro claro (o clássico, todo mundo tem) e não cobra de novo', () => {
    const { armazem } = abrir(null);
    const { id } = novaCarteira(armazem);
    expect(armazem.comprar(id, 'classico')).toEqual({ ok: false, erro: 'ja-tem' });
    armazem.comprar(id, 'ebano');
    expect(armazem.comprar(id, 'ebano')).toEqual({ ok: false, erro: 'ja-tem' });
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL - 50);
  });

  it('skin fora do catálogo (inclusive nomes do protótipo) é skin-invalida', () => {
    const { armazem } = abrir(null);
    const { id } = novaCarteira(armazem);
    for (const ruim of ['diamante', 'Ouro', '', 'toString', '__proto__', 'constructor']) {
      expect(armazem.comprar(id, ruim), ruim).toEqual({ ok: false, erro: 'skin-invalida' });
      expect(armazem.usar(id, ruim), ruim).toEqual({ ok: false, erro: 'skin-invalida' });
    }
    expect(armazem.ler(id)).toMatchObject({ saldo: SALDO_INICIAL, skins: ['classico'], skin: 'classico' });
  });

  it('o preço é o do catálogo para cada skin, com 20% de desconto (arredondado) só nas 3 da vitrine do dia', () => {
    const vitrine = vitrineDoDia(diaDaMissao(1_700_000_000_000));
    for (const { id: skin, preco } of SKINS_DE_TACO.filter((s) => s.id !== SKIN_PADRAO)) {
      const { armazem } = abrir(null);
      const { id } = novaCarteira(armazem);
      armazem.aplicar([{ id, delta: 5000 }]);
      const antes = armazem.ler(id)!.saldo;
      expect(armazem.comprar(id, skin)).toMatchObject({ ok: true });
      const naVitrine = vitrine.itens.find((i) => i.skin === skin);
      expect(antes - armazem.ler(id)!.saldo, skin).toBe(naVitrine ? preco - Math.round((preco * 20) / 100) : preco);
    }
  });

  it('uma carteira que não existe não compra nem usa', () => {
    const { armazem } = abrir(null);
    expect(armazem.comprar('0'.repeat(64), 'ebano')).toEqual({ ok: false, erro: 'carteira-invalida' });
    expect(armazem.usar('0'.repeat(64), 'classico')).toEqual({ ok: false, erro: 'carteira-invalida' });
  });
});

describe('usar skins', () => {
  it('troca a skin em uso por uma que a carteira tem, e volta ao clássico', () => {
    const { armazem } = abrir(null);
    const { id } = novaCarteira(armazem);
    armazem.comprar(id, 'ebano');
    expect(armazem.usar(id, 'ebano')).toMatchObject({ ok: true, estado: { saldo: 50, skins: ['classico', 'ebano'], skin: 'ebano' } });
    expect(armazem.usar(id, 'classico')).toMatchObject({ ok: true, estado: { skin: 'classico' } });
  });

  it('skin que a carteira não tem é nao-tem e nada muda', () => {
    const { armazem } = abrir(null);
    const { id } = novaCarteira(armazem);
    expect(armazem.usar(id, 'ouro')).toEqual({ ok: false, erro: 'nao-tem' });
    expect(armazem.ler(id)!.skin).toBe('classico');
  });
});

describe('aplicar variações (o pote das apostas)', () => {
  it('soma e subtrai nas carteiras e deixa o saldo ir abaixo de zero, sem limite', () => {
    const { armazem } = abrir(null);
    const a = novaCarteira(armazem);
    const b = novaCarteira(armazem);
    armazem.aplicar([{ id: a.id, delta: 20 }, { id: b.id, delta: -20 }]);
    expect(armazem.ler(a.id)!.saldo).toBe(120);
    expect(armazem.ler(b.id)!.saldo).toBe(80);
    armazem.aplicar([{ id: b.id, delta: -100_000 }]);
    expect(armazem.ler(b.id)!.saldo).toBe(-99_920);
  });

  it('tudo ou nada: um id que não existe recusa o lote inteiro, com a soma das outras variações intacta', () => {
    const { armazem, logs } = abrir(null);
    const a = novaCarteira(armazem);
    const b = novaCarteira(armazem);
    expect(armazem.aplicar([{ id: a.id, delta: 5 }, { id: '1'.repeat(64), delta: -5 }, { id: b.id, delta: 0 }])).toBe(false);
    expect(armazem.ler(a.id)!.saldo).toBe(SALDO_INICIAL);
    expect(armazem.ler(b.id)!.saldo).toBe(SALDO_INICIAL);
    expect(logs.some((l) => l.startsWith('carteiras-variacao-recusada') && l.includes('carteira-inexistente'))).toBe(true);
  });

  it('tudo ou nada: o mesmo id duas vezes recusa o lote inteiro (a checagem de cada entrada contra o saldo original não vale)', () => {
    const { armazem, logs } = abrir(null);
    const a = novaCarteira(armazem);
    const b = novaCarteira(armazem);
    expect(armazem.aplicar([{ id: b.id, delta: 7 }, { id: a.id, delta: -5 }, { id: a.id, delta: -5 }])).toBe(false);
    expect(armazem.ler(a.id)!.saldo).toBe(SALDO_INICIAL);
    expect(armazem.ler(b.id)!.saldo).toBe(SALDO_INICIAL);
    expect(logs.some((l) => l.startsWith('carteiras-variacao-recusada') && l.includes('carteira-repetida'))).toBe(true);
  });

  it('um lote recusado não avisa ninguém', () => {
    const { armazem } = abrir(null);
    const a = novaCarteira(armazem);
    const vistos: string[] = [];
    armazem.aoMudar((id) => vistos.push(id));
    armazem.aplicar([{ id: a.id, delta: 5 }, { id: '1'.repeat(64), delta: 5 }]);
    expect(vistos).toEqual([]);
  });

  it('variação que não é inteira ou estoura o limite seguro é recusada inteira e nada muda', () => {
    const { armazem } = abrir(null);
    const a = novaCarteira(armazem);
    const b = novaCarteira(armazem);
    for (const delta of [1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER]) {
      armazem.aplicar([{ id: b.id, delta: -5 }, { id: a.id, delta }]);
      expect(armazem.ler(a.id)!.saldo, String(delta)).toBe(SALDO_INICIAL);
      expect(armazem.ler(b.id)!.saldo, String(delta)).toBe(SALDO_INICIAL);
    }
  });
});

describe('aplicar diz se as variações valeram', () => {
  it('true quando aplicou tudo, false quando recusou o lote (id que não existe, repetido ou delta ruim)', () => {
    const { armazem } = abrir(null);
    const a = novaCarteira(armazem);
    expect(armazem.aplicar([{ id: a.id, delta: 5 }])).toBe(true);
    expect(armazem.aplicar([{ id: '1'.repeat(64), delta: 5 }])).toBe(false);
    expect(armazem.aplicar([])).toBe(true);
    expect(armazem.aplicar([{ id: a.id, delta: Number.MAX_SAFE_INTEGER }])).toBe(false);
    expect(armazem.aplicar([{ id: a.id, delta: 0.5 }])).toBe(false);
    expect(armazem.ler(a.id)!.saldo).toBe(SALDO_INICIAL + 5);
  });
});

describe('avisar quem está olhando', () => {
  it('comprar, usar e aplicar avisam o ouvinte com o id e a origem; criar e pedido recusado não', () => {
    const { armazem } = abrir(null);
    const vistos: [string, unknown][] = [];
    armazem.aoMudar((id, origem) => vistos.push([id, origem]));
    const { id } = novaCarteira(armazem);
    expect(vistos).toEqual([]);
    armazem.comprar(id, 'ouro'); // sem saldo
    armazem.usar(id, 'ouro'); // não tem
    expect(vistos).toEqual([]);
    const sala = Symbol('sala');
    armazem.aplicar([{ id, delta: 600 }], sala);
    armazem.comprar(id, 'ouro');
    armazem.usar(id, 'ouro');
    expect(vistos).toEqual([[id, sala], [id, undefined], [id, undefined]]);
  });

  it('um ouvinte que lança não impede os outros nem desfaz a mudança; cancelar a inscrição funciona', () => {
    const { armazem, logs } = abrir(null);
    const { id } = novaCarteira(armazem);
    const visto = vi.fn();
    armazem.aoMudar(() => {
      throw new Error('estourou');
    });
    const cancelar = armazem.aoMudar(visto);
    armazem.aplicar([{ id, delta: 1 }]);
    expect(visto).toHaveBeenCalledTimes(1);
    expect(armazem.ler(id)!.saldo).toBe(SALDO_INICIAL + 1);
    expect(logs.some((l) => l.startsWith('carteiras-ouvinte-falhou'))).toBe(true);
    cancelar();
    armazem.aplicar([{ id, delta: 1 }]);
    expect(visto).toHaveBeenCalledTimes(1);
  });
});

describe('persistência em disco', () => {
  it('grava, reabre e acha o mesmo saldo, as mesmas skins e o mesmo código', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta);
    const a = novaCarteira(armazem);
    const b = novaCarteira(armazem);
    armazem.aplicar([{ id: a.id, delta: 400 }, { id: b.id, delta: -37 }]);
    armazem.comprar(a.id, 'ouro');
    armazem.usar(a.id, 'ouro');
    await armazem.fechar();

    const { armazem: reaberto } = abrir(pasta);
    expect(reaberto.total).toBe(2);
    expect(reaberto.resolver(a.codigo)).toBe(a.id);
    expect(reaberto.resolver(b.codigo)).toBe(b.id);
    expect(reaberto.ler(a.id)).toMatchObject({ saldo: 0 + 100 + 400 - 500, skins: ['classico', 'ouro'], skin: 'ouro' });
    expect(reaberto.ler(b.id)).toMatchObject({ saldo: 63, skins: ['classico'], skin: 'classico' });
  });

  it('o arquivo guarda só o resumo do código (quem lê o disco não ganha a carteira de ninguém) e é restrito ao dono', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta);
    const { codigo, id } = novaCarteira(armazem);
    await armazem.descarregar();
    const texto = readFileSync(arquivoDe(pasta), 'utf8');
    expect(texto).not.toContain(codigo);
    expect(JSON.parse(texto)).toEqual({
      versao: 2,
      carteiras: { [id]: { saldo: 100, itens: [{ skin: 'classico', semente: expect.any(Number), bolas: 0 }], skin: 'classico', criadaEm: 1_700_000_000_000, jogou: false } },
    });
    expect(statSync(arquivoDe(pasta)).mode & 0o077).toBe(0);
  });

  it('a escrita é atômica: cada gravação troca o arquivo por um novo (o inode muda), sem sobra de temporário', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta);
    const { id } = novaCarteira(armazem);
    await armazem.descarregar();
    const antes = readFileSync(arquivoDe(pasta), 'utf8');
    const inodeAntes = statSync(arquivoDe(pasta)).ino;
    armazem.aplicar([{ id, delta: 10 }]);
    await armazem.descarregar();
    expect(vivos(pasta)).toEqual(['carteiras.json']);
    expect(readFileSync(arquivoDe(pasta), 'utf8')).not.toBe(antes);
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[id].saldo).toBe(110);
    // um writeFile direto por cima manteria o inode; só o temporário + rename entrega um arquivo novo
    expect(statSync(arquivoDe(pasta)).ino).not.toBe(inodeAntes);
    armazem.aplicar([{ id, delta: 10 }]);
    const inodeMeio = statSync(arquivoDe(pasta)).ino;
    await armazem.descarregar();
    expect(statSync(arquivoDe(pasta)).ino).not.toBe(inodeMeio);
  });

  it('uma falha entre o temporário escrito e o rename deixa o arquivo antigo inteiro; o temporário não sobra e a próxima gravação recupera', async () => {
    const pasta = pastaNova();
    const { armazem, logs } = abrir(pasta);
    const { id } = novaCarteira(armazem);
    await armazem.descarregar();
    const antes = readFileSync(arquivoDe(pasta), 'utf8');

    disco.falharRename = new Error('a luz acabou');
    armazem.aplicar([{ id, delta: 10 }]);
    await armazem.descarregar();
    expect(logs.some((l) => l.startsWith('carteiras-gravacao-falhou'))).toBe(true);
    expect(readFileSync(arquivoDe(pasta), 'utf8')).toBe(antes);
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[id].saldo).toBe(100);
    expect(vivos(pasta)).toEqual(['carteiras.json']);
    expect(armazem.ler(id)!.saldo).toBe(110);

    disco.falharRename = null;
    await armazem.descarregar();
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[id].saldo).toBe(110);
  });

  it('depois do rename a pasta é aberta e sincronizada, para a troca sobreviver a uma queda de energia', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta);
    novaCarteira(armazem);
    await armazem.descarregar();
    const aposORename = disco.ordem.slice(disco.ordem.findIndex((o) => o.startsWith('rename ')) + 1);
    expect(aposORename).toEqual([`open ${pasta} r`]);
  });

  it('sistema que não deixa abrir a pasta não impede a gravação, e o aviso no log vem uma vez só', async () => {
    const pasta = pastaNova();
    const { armazem, logs } = abrir(pasta);
    const { id } = novaCarteira(armazem);
    disco.falharAberturaDaPasta = true;
    await armazem.descarregar();
    armazem.aplicar([{ id, delta: 1 }]);
    await armazem.descarregar();
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[id].saldo).toBe(101);
    expect(logs.filter((l) => l.startsWith('carteiras-pasta-sem-fsync'))).toHaveLength(1);
    expect(logs.some((l) => l.startsWith('carteiras-gravacao-falhou'))).toBe(false);
  });

  it('ao subir, tira os temporários de gravações que morreram no meio e só eles', () => {
    const pasta = pastaNova();
    writeFileSync(join(pasta, 'carteiras.json.4242.tmp'), '{ pela metade');
    writeFileSync(join(pasta, 'carteiras.json.7.tmp'), '');
    writeFileSync(join(pasta, 'carteiras.json.tmp'), 'não é o formato: fica');
    writeFileSync(join(pasta, 'carteiras.json.4242.tmp.bak'), 'fica');
    writeFileSync(join(pasta, 'carteiras.corrompido-1.json'), 'fica');
    const { logs } = abrir(pasta);
    expect(vivos(pasta)).toEqual(['carteiras.corrompido-1.json', 'carteiras.json.4242.tmp.bak', 'carteiras.json.tmp']);
    expect(logs.some((l) => l.startsWith('carteiras-temporarios-removidos') && l.includes('"quantos":2'))).toBe(true);
  });

  it('sem temporário velho, nada é logado nem apagado', () => {
    const pasta = pastaNova();
    const { logs } = abrir(pasta);
    expect(logs).toEqual([]);
  });

  it('grava com atraso curto e junta várias mudanças numa escrita só; sem mudança, não escreve nada', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta, { atrasoMs: 40 });
    await armazem.descarregar();
    expect(existsSync(pasta) && vivos(pasta)).toEqual([]);
    const { id } = novaCarteira(armazem);
    for (let i = 0; i < 10; i++) armazem.aplicar([{ id, delta: 1 }]);
    expect(existsSync(arquivoDe(pasta)), 'ainda no atraso').toBe(false);
    await vi.waitFor(() => expect(existsSync(arquivoDe(pasta))).toBe(true), { timeout: 2000 });
    await armazem.descarregar();
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[id].saldo).toBe(110);
  });

  it('descarregar espera a escrita em curso e a mudança que veio durante ela: o disco acaba igual à memória', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta, { atrasoMs: 0 });
    const { id } = novaCarteira(armazem);
    await new Promise((r) => setTimeout(r, 2)); // a escrita 1 está em curso ou pronta
    armazem.aplicar([{ id, delta: 25 }]);
    await armazem.descarregar();
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[id].saldo).toBe(125);
  });

  it('mudança no meio de uma gravação: depois do fechar() não sobra temporizador nem escrita, o arquivo não é gravado de novo com a trava solta (L26)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pasta = pastaNova();
      const { armazem } = abrir(pasta, { atrasoMs: 50 });
      const { id } = novaCarteira(armazem);
      const parada = reterOProximoRename();
      vi.advanceTimersByTime(50); // o temporizador dispara a gravação 1
      await parada.chegou; // ... e ela fica parada no rename
      armazem.aplicar([{ id, delta: 7 }]); // a mudança chega no meio dela
      const fechando = armazem.fechar();
      parada.soltar();
      await fechando;

      expect(existsSync(join(pasta, 'carteiras.lock')), 'a trava já saiu').toBe(false);
      expect(vi.getTimerCount(), 'nenhum temporizador esperando para gravar').toBe(0);
      expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[id].saldo).toBe(107);
      const renames = disco.ordem.filter((o) => o.startsWith('rename ')).length;
      const inode = statSync(arquivoDe(pasta)).ino;
      vi.advanceTimersByTime(60_000);
      await new Promise((resolve) => setImmediate(resolve));
      expect(disco.ordem.filter((o) => o.startsWith('rename ')).length, 'nenhuma gravação depois do fechar').toBe(renames);
      expect(statSync(arquivoDe(pasta)).ino).toBe(inode);
    } finally {
      vi.useRealTimers();
    }
  });

  it('depois do fechar() a gravação recusa: descarregar() de um armazém que falhou ao fechar não escreve com a trava solta, e a repetição da falha foi cancelada (L26)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pasta = pastaNova();
      const { armazem, logs } = abrir(pasta, { atrasoMs: 60_000 });
      novaCarteira(armazem);
      disco.falharRename = new Error('disco cheio');
      await armazem.fechar(); // as tentativas do fechar() falham todas
      expect(logs.filter((l) => l.startsWith('carteiras-gravacao-falhou'))).not.toHaveLength(0);
      expect(existsSync(join(pasta, 'carteiras.lock'))).toBe(false);
      expect(vi.getTimerCount(), 'a trava saiu: nenhuma repetição fica agendada').toBe(0);

      disco.falharRename = null;
      await armazem.descarregar();
      expect(vivos(pasta), 'nada escrito: nem arquivo nem temporário').toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('descarregar() solto que falha deixa a repetição agendada: só o que já está no disco, ou o fechar(), cancela o temporizador (L26)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const pasta = pastaNova();
      const { armazem } = abrir(pasta, { atrasoMs: 60_000 });
      novaCarteira(armazem);
      disco.falharRename = new Error('disco cheio');
      await armazem.descarregar();
      expect(existsSync(arquivoDe(pasta))).toBe(false);
      expect(vi.getTimerCount(), 'a repetição depois da falha').toBe(1);

      disco.falharRename = null;
      vi.advanceTimersByTime(5000);
      await armazem.descarregar();
      expect(existsSync(arquivoDe(pasta))).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sem pasta (só memória) nada vai a disco, e descarregar volta na hora', async () => {
    const { armazem } = abrir(null);
    const { id } = novaCarteira(armazem);
    armazem.aplicar([{ id, delta: 1 }]);
    await expect(armazem.descarregar()).resolves.toBeUndefined();
  });

  it('falha ao gravar não derruba nada: loga, segue na memória e tenta de novo quando dá', async () => {
    const base = pastaNova();
    const pasta = join(base, 'dados');
    const { armazem, logs } = abrir(pasta);
    rmSync(pasta, { recursive: true });
    writeFileSync(pasta, 'agora sou um arquivo, não uma pasta'); // o disco muda por baixo do servidor
    const { id } = novaCarteira(armazem);
    armazem.aplicar([{ id, delta: 3 }]);
    await expect(armazem.descarregar()).resolves.toBeUndefined();
    expect(armazem.ler(id)!.saldo).toBe(103);
    expect(logs.some((l) => l.startsWith('carteiras-gravacao-falhou'))).toBe(true);
    expect(logs.join('\n')).not.toContain(id);
  });

  it('pasta de dados que não dá nem para ler ao subir é erro alto, em vez de seguir sem poder guardar nada', () => {
    const base = pastaNova();
    writeFileSync(join(base, 'arquivo'), 'x');
    expect(() => abrir(join(base, 'arquivo', 'dados'))).toThrow(/carteiras: não consegui preparar a pasta de dados/);
  });

  it('cria a pasta de dados ao abrir (a trava mora nela), restrita ao dono, e o arquivo só na primeira gravação', async () => {
    const base = pastaNova();
    const pasta = join(base, 'ainda', 'nao', 'existe');
    const { armazem } = abrir(pasta);
    expect(statSync(pasta).mode & 0o077).toBe(0);
    expect(vivos(pasta)).toEqual([]);
    novaCarteira(armazem);
    await armazem.descarregar();
    expect(existsSync(arquivoDe(pasta))).toBe(true);
  });
});

describe('arquivo estragado', () => {
  const guardado = (extra: object = {}) => ({ saldo: 100, skins: ['classico'], skin: 'classico', criadaEm: 1, ...extra });
  const ID_A = 'a'.repeat(64);
  const ID_B = 'b'.repeat(64);

  it('sem arquivo, começa vazio e não guarda cópia de nada', () => {
    const pasta = pastaNova();
    const { armazem, logs } = abrir(pasta);
    expect(armazem.total).toBe(0);
    expect(vivos(pasta)).toEqual([]);
    expect(logs).toEqual([]);
  });

  it.each([
    ['texto que não é JSON', '{ isto não é json'],
    ['JSON que não é um objeto', '[1,2,3]'],
    ['versão desconhecida', JSON.stringify({ versao: 4, carteiras: {} })],
    ['sem o mapa de carteiras', JSON.stringify({ versao: 1 })],
    ['arquivo vazio', ''],
  ])('%s: guarda a cópia do estragado, loga, começa vazio e segue funcionando', async (_nome, conteudo) => {
    const pasta = pastaNova();
    writeFileSync(arquivoDe(pasta), conteudo);
    const { armazem, logs } = abrir(pasta);
    expect(armazem.total).toBe(0);
    const copias = vivos(pasta).filter((f) => f.startsWith('carteiras.corrompido-'));
    expect(copias).toHaveLength(1);
    expect(readFileSync(join(pasta, copias[0]!), 'utf8')).toBe(conteudo);
    expect(logs.some((l) => l.startsWith('carteiras-corrompidas'))).toBe(true);
    // o servidor segue: cria, grava, e a cópia continua intocada
    novaCarteira(armazem);
    await armazem.descarregar();
    expect(readFileSync(join(pasta, copias[0]!), 'utf8')).toBe(conteudo);
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).versao).toBe(2);
  });

  it('abrir de novo o mesmo estrago não empilha cópias: a primeira abertura já tirou o arquivo ruim do caminho', async () => {
    const pasta = pastaNova();
    writeFileSync(arquivoDe(pasta), 'lixo');
    await abrir(pasta).armazem.fechar();
    abrir(pasta);
    expect(vivos(pasta).filter((f) => f.startsWith('carteiras.corrompido-'))).toHaveLength(1);
  });

  it('duas cópias no mesmo instante não se sobrescrevem', () => {
    const pasta = pastaNova();
    writeFileSync(join(pasta, 'carteiras.corrompido-1700000000000.json'), 'a primeira cópia');
    writeFileSync(arquivoDe(pasta), 'lixo novo');
    abrir(pasta);
    expect(readFileSync(join(pasta, 'carteiras.corrompido-1700000000000.json'), 'utf8')).toBe('a primeira cópia');
    expect(vivos(pasta).filter((f) => f.startsWith('carteiras.corrompido-'))).toHaveLength(2);
  });

  it('uma carteira estragada no meio de um arquivo bom: guarda a cópia, perde só ela e mantém as outras', () => {
    const pasta = pastaNova();
    const texto = JSON.stringify({
      versao: 1,
      carteiras: {
        [ID_A]: guardado({ saldo: -12, skins: ['classico', 'neon'], skin: 'neon' }),
        [ID_B]: guardado({ saldo: 1.5 }),
        ['curto']: guardado(),
        ['c'.repeat(64)]: guardado({ skins: ['neon'], skin: 'neon' }), // sem o clássico
        ['d'.repeat(64)]: guardado({ skin: 'ouro' }), // skin em uso que não tem
        ['e'.repeat(64)]: guardado({ skins: ['classico', 'diamante'] }),
        ['f'.repeat(64)]: guardado({ criadaEm: 'ontem' }),
      },
    });
    writeFileSync(arquivoDe(pasta), texto);
    const { armazem, logs } = abrir(pasta);
    expect(armazem.total).toBe(1);
    expect(armazem.ler(ID_A)).toMatchObject({ saldo: -12, skins: ['classico', 'neon'], skin: 'neon' });
    const copias = vivos(pasta).filter((f) => f.startsWith('carteiras.corrompido-'));
    expect(copias).toHaveLength(1);
    expect(readFileSync(join(pasta, copias[0]!), 'utf8')).toBe(texto);
    expect(logs.some((l) => l.includes('carteiras-corrompidas') && l.includes('"descartadas":6'))).toBe(true);
  });

  it('as carteiras salvas de um arquivo parcialmente estragado voltam a ser gravadas', async () => {
    const pasta = pastaNova();
    writeFileSync(arquivoDe(pasta), JSON.stringify({ versao: 1, carteiras: { [ID_A]: guardado(), [ID_B]: guardado({ saldo: 'x' }) } }));
    const { armazem } = abrir(pasta);
    await armazem.descarregar();
    expect(Object.keys(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras)).toEqual([ID_A]);
  });

  it('chave perigosa no arquivo (como __proto__) é só uma entrada inválida, nunca mexe no protótipo', () => {
    const pasta = pastaNova();
    writeFileSync(arquivoDe(pasta), '{"versao":1,"carteiras":{"__proto__":{"saldo":999999,"skins":["classico"],"skin":"classico","criadaEm":1}}}');
    const { armazem } = abrir(pasta);
    expect(armazem.total).toBe(0);
    expect(({} as Record<string, unknown>).saldo).toBeUndefined();
  });

  it.skipIf(process.getuid?.() === 0)('se nem a cópia do estragado dá para guardar, não segue em cima dele: falha alto', () => {
    const pasta = pastaNova();
    writeFileSync(arquivoDe(pasta), 'lixo');
    chmodSync(pasta, 0o500);
    expect(() => abrir(pasta)).toThrow(/carteiras/);
    chmodSync(pasta, 0o700);
    expect(readFileSync(arquivoDe(pasta), 'utf8')).toBe('lixo');
  });
});

describe('L34: itens, semente e vitrine na compra', () => {
  const RELOGIO = 1_700_000_000_000;
  const vitrine = vitrineDoDia(diaDaMissao(RELOGIO));
  const naVitrine = vitrine.itens[0]!;
  const foraDaVitrine = SKINS_DE_TACO.find((s) => s.preco > 0 && !vitrine.itens.some((i) => i.skin === s.id))!;
  const comSaldo = (armazem: ArmazemDeCarteiras, saldo: number) => {
    const c = novaCarteira(armazem);
    armazem.aplicar([{ id: c.id, delta: saldo - SALDO_INICIAL }]);
    return c;
  };

  it('a carteira nova nasce com o item do clássico, contador 0 e uma semente de 0 a 999', () => {
    const { armazem } = abrir(null);
    const c = armazem.ler(novaCarteira(armazem).id)!;
    expect(c.itens).toEqual([{ skin: 'classico', semente: expect.any(Number), bolas: 0 }]);
    expect(ehSemente(c.itens![0]!.semente)).toBe(true);
    expect(c.vitrine).toEqual(vitrine);
  });

  it('sem vitrine: cobra o preço do catálogo, guarda o item com a semente sorteada e contador 0', () => {
    const { armazem, logs } = abrir(null, { sortearSemente: () => 417 });
    const c = comSaldo(armazem, 5000);
    const r = armazem.comprar(c.id, foraDaVitrine.id);
    expect(r).toMatchObject({ ok: true, estado: { saldo: 5000 - foraDaVitrine.preco, skin: 'classico' } });
    expect(armazem.ler(c.id)!.itens).toContainEqual({ skin: foraDaVitrine.id, semente: 417, bolas: 0 });
    expect(logs.find((l) => l.startsWith('compra '))).toBe(`compra ${JSON.stringify({ apelido: null, skin: foraDaVitrine.id, preco: foraDaVitrine.preco, vitrine: false, semente: 417, rara: false })}`);
  });

  it('com vitrine: cobra o preço do dia (20% a menos, arredondado) e o log diz que foi da vitrine', () => {
    const { armazem, logs } = abrir(null, { sortearSemente: () => 5 });
    const c = comSaldo(armazem, 5000);
    expect(naVitrine.preco).toBe(naVitrine.precoCheio - Math.round(naVitrine.precoCheio * 0.2));
    expect(armazem.comprar(c.id, naVitrine.skin)).toMatchObject({ ok: true, estado: { saldo: 5000 - naVitrine.preco } });
    expect(JSON.parse(logs.find((l) => l.startsWith('compra '))!.slice('compra '.length))).toMatchObject({ skin: naVitrine.skin, preco: naVitrine.preco, vitrine: true, semente: 5 });
  });

  it('o preço de hoje decide o saldo que basta: o do desconto compra, um a menos não', () => {
    const { armazem } = abrir(null);
    const pobre = comSaldo(armazem, naVitrine.preco - 1);
    const justo = comSaldo(armazem, naVitrine.preco);
    expect(armazem.comprar(pobre.id, naVitrine.skin)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    expect(armazem.ler(pobre.id)).toMatchObject({ saldo: naVitrine.preco - 1, skins: ['classico'] });
    expect(armazem.comprar(justo.id, naVitrine.skin)).toMatchObject({ ok: true, estado: { saldo: 0 } });
  });

  it('virou o dia: a vitrine e o preço trocam sem reiniciar (o relógio é o do servidor)', () => {
    let agora = RELOGIO;
    const { armazem } = abrir(null, { relogio: () => agora });
    const c = comSaldo(armazem, 5000);
    const outroDia = diaDaMissao(RELOGIO + 24 * 3_600_000);
    const amanha = vitrineDoDia(outroDia);
    expect(amanha.itens.map((i) => i.skin)).not.toEqual(vitrine.itens.map((i) => i.skin));
    agora = RELOGIO + 24 * 3_600_000;
    expect(armazem.ler(c.id)!.vitrine).toEqual(amanha);
    const hojeCheia = amanha.itens.find((i) => !vitrine.itens.some((v) => v.skin === i.skin))!;
    expect(armazem.comprar(c.id, hojeCheia.skin)).toMatchObject({ ok: true, estado: { saldo: 5000 - hojeCheia.preco } });
  });

  describe('L34b: o preço que a tela mostrou vale só como teto', () => {
    const DIA_MS = 24 * 3_600_000;
    /** O primeiro dia depois de RELOGIO em que `skin` não está na vitrine. */
    const diaSemVitrine = (skin: string): number => {
      for (let n = 1; n <= 30; n++) if (!vitrineDoDia(diaDaMissao(RELOGIO + n * DIA_MS)).itens.some((i) => i.skin === skin)) return RELOGIO + n * DIA_MS;
      throw new Error(`a ${skin} ficou na vitrine por 30 dias seguidos`);
    };

    it('a virada do dia com a skin saindo da vitrine: preco-mudou, nenhum centavo cobrado, nenhuma semente sorteada, nenhum aviso', () => {
      let agora = RELOGIO;
      let sorteios = 0;
      const { armazem, logs } = abrir(null, { relogio: () => agora, sortearSemente: () => sorteios++ });
      const c = comSaldo(armazem, 5000);
      const mudou = vi.fn();
      armazem.aoMudar(mudou);
      const tela = naVitrine.preco; // a aba aberta ontem mostra o preço da vitrine
      agora = diaSemVitrine(naVitrine.skin); // meia-noite: a skin saiu da vitrine
      const antes = armazem.ler(c.id)!;

      expect(armazem.comprar(c.id, naVitrine.skin, undefined, tela)).toEqual({ ok: false, erro: 'preco-mudou' });
      expect(armazem.ler(c.id)).toEqual(antes);
      expect(armazem.ler(c.id)).toMatchObject({ saldo: 5000, skins: ['classico'] });
      expect(sorteios).toBe(1); // o do clássico, ao criar a carteira
      expect(logs.some((l) => l.startsWith('compra '))).toBe(false);
      expect(mudou).not.toHaveBeenCalled();

      // quem relê a tela e confirma o preço novo (o cheio) compra
      expect(armazem.comprar(c.id, naVitrine.skin, undefined, naVitrine.precoCheio)).toMatchObject({ ok: true, estado: { saldo: 5000 - naVitrine.precoCheio } });
    });

    it('a skin entrando na vitrine: o cliente viu o preço cheio e a sala cobra o menor, o dela', () => {
      const { armazem, logs } = abrir(null);
      const c = comSaldo(armazem, 5000);
      expect(naVitrine.preco).toBeLessThan(naVitrine.precoCheio);
      expect(armazem.comprar(c.id, naVitrine.skin, undefined, naVitrine.precoCheio)).toMatchObject({ ok: true, estado: { saldo: 5000 - naVitrine.preco } });
      expect(JSON.parse(logs.find((l) => l.startsWith('compra '))!.slice('compra '.length))).toMatchObject({ preco: naVitrine.preco, vitrine: true });
    });

    it('o teto nunca vira o preço: um preço visto alto demais não faz a sala cobrar mais nem menos que o dela', () => {
      for (const visto of [naVitrine.preco, naVitrine.preco + 1, 1_000_000, Number.MAX_SAFE_INTEGER, Infinity]) {
        const { armazem } = abrir(null);
        const c = comSaldo(armazem, 5000);
        expect(armazem.comprar(c.id, naVitrine.skin, undefined, visto), String(visto)).toMatchObject({ ok: true, estado: { saldo: 5000 - naVitrine.preco } });
      }
    });

    it('um preço visto menor que o do servidor, nem que seja por 1, é preco-mudou e não cobra', () => {
      const { armazem } = abrir(null);
      const c = comSaldo(armazem, 5000);
      expect(armazem.comprar(c.id, naVitrine.skin, undefined, naVitrine.preco - 1)).toEqual({ ok: false, erro: 'preco-mudou' });
      expect(armazem.ler(c.id)).toMatchObject({ saldo: 5000, skins: ['classico'] });
      expect(armazem.comprar(c.id, naVitrine.skin, undefined, naVitrine.preco)).toMatchObject({ ok: true });
    });

    it('sem preço visto, segue como sempre: cobra o do servidor sem conferir nada', () => {
      const { armazem } = abrir(null);
      const c = comSaldo(armazem, 5000);
      expect(armazem.comprar(c.id, naVitrine.skin)).toMatchObject({ ok: true, estado: { saldo: 5000 - naVitrine.preco } });
    });

    it('preço visto torto (NaN, negativo, fracionário abaixo do preço) nunca cobra', () => {
      for (const torto of [Number.NaN, -1, 0, 0.5, naVitrine.preco - 0.5, -Infinity]) {
        const { armazem } = abrir(null);
        const c = comSaldo(armazem, 5000);
        expect(armazem.comprar(c.id, naVitrine.skin, undefined, torto), String(torto)).toEqual({ ok: false, erro: 'preco-mudou' });
        expect(armazem.ler(c.id)).toMatchObject({ saldo: 5000, skins: ['classico'] });
      }
    });

    it('a ordem das recusas: skin-invalida e ja-tem vêm antes; preco-mudou vem antes de saldo-insuficiente', () => {
      const { armazem } = abrir(null);
      const c = comSaldo(armazem, naVitrine.preco - 1);
      expect(armazem.comprar(c.id, 'nao-existe', undefined, 1)).toEqual({ ok: false, erro: 'skin-invalida' });
      expect(armazem.comprar(c.id, 'classico', undefined, 1)).toEqual({ ok: false, erro: 'ja-tem' });
      expect(armazem.comprar(c.id, naVitrine.skin, undefined, naVitrine.preco - 1)).toEqual({ ok: false, erro: 'preco-mudou' });
      expect(armazem.comprar(c.id, naVitrine.skin, undefined, naVitrine.preco)).toEqual({ ok: false, erro: 'saldo-insuficiente' });
    });
  });

  it('semente: sempre inteira de 0 a 999 com a aleatoriedade de verdade, e variada', () => {
    const { armazem } = abrir(null, { maxCarteiras: 400 });
    const sementes = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const s = armazem.ler(novaCarteira(armazem).id)!.itens![0]!.semente;
      expect(ehSemente(s)).toBe(true);
      sementes.add(s);
    }
    expect(sementes.size).toBeGreaterThan(150); // 300 sorteios de 1000: ~260 distintas; abaixo de 150 é sorteio travado
  });

  it('semente: as pontas 0 e 999 valem; fora do intervalo ou torta é recusada sem cobrar nada', () => {
    for (const ponta of [0, 999]) {
      const { armazem } = abrir(null, { sortearSemente: () => ponta });
      const c = comSaldo(armazem, 5000);
      expect(armazem.comprar(c.id, foraDaVitrine.id)).toMatchObject({ ok: true });
      expect(armazem.ler(c.id)!.itens).toContainEqual({ skin: foraDaVitrine.id, semente: ponta, bolas: 0 });
    }
    for (const torta of [1000, -1, 1.5, Number.NaN]) {
      let proxima = 10;
      const { armazem } = abrir(null, { sortearSemente: () => proxima });
      const c = comSaldo(armazem, 5000);
      proxima = torta;
      expect(() => armazem.comprar(c.id, foraDaVitrine.id), String(torta)).toThrow(RangeError);
      expect(armazem.ler(c.id)).toMatchObject({ saldo: 5000, skins: ['classico'] });
    }
  });

  it('semente rara (RNG injetado): o log diz que é rara e o nome do padrão (L34c: a Blue Gem da Case Hardened); nunca o código', () => {
    const blueGem = skinDoCatalogoPorId('tempera').padroes!.find((p) => p.nome === 'Blue Gem')!;
    const semente = blueGem.faixas[0]!.de;
    const { armazem, logs } = abrir(null, { sortearSemente: () => semente });
    const c = comSaldo(armazem, 5000);
    expect(armazem.comprar(c.id, 'tempera')).toMatchObject({ ok: true });
    const compra = logs.find((l) => l.startsWith('compra '))!;
    expect(JSON.parse(compra.slice('compra '.length))).toMatchObject({ skin: 'tempera', semente, rara: true, padrao: 'Blue Gem' });
    expect(compra).not.toContain(c.codigo);
    expect(logs.join('\n')).not.toContain(c.codigo);
  });

  it('semente comum (fora das raras): o log diz que não é rara', () => {
    const skin = skinDoCatalogoPorId('tempera');
    const comum = Array.from({ length: 1000 }, (_, n) => n).find((n) => padraoDaSemente('tempera', n) === undefined && !skin.raras.some((r) => r.semente === n))!;
    const { armazem, logs } = abrir(null, { sortearSemente: () => comum });
    const c = comSaldo(armazem, 5000);
    armazem.comprar(c.id, 'tempera');
    const compra = JSON.parse(logs.find((l) => l.startsWith('compra '))!.slice('compra '.length)) as Record<string, unknown>;
    expect(compra).toMatchObject({ rara: false });
    expect(compra).not.toHaveProperty('padrao');
  });

  it('L34c: a fase da Doppler e as raras dela (Ruby, Sapphire, Black Pearl) saem no log; a fase comum não é rara mas diz qual é', () => {
    const casos: { semente: number; rara: boolean; padrao: string }[] = [
      { semente: 5, rara: false, padrao: 'Phase 1' },
      { semente: 600, rara: false, padrao: 'Phase 3' },
      { semente: 77, rara: true, padrao: 'Ruby' },
      { semente: 654, rara: true, padrao: 'Sapphire' },
      { semente: 836, rara: true, padrao: 'Black Pearl' },
    ];
    for (const caso of casos) {
      const { armazem, logs } = abrir(null, { sortearSemente: () => caso.semente });
      const c = comSaldo(armazem, 5000);
      expect(armazem.comprar(c.id, 'obsidiana'), caso.padrao).toMatchObject({ ok: true });
      expect(JSON.parse(logs.find((l) => l.startsWith('compra '))!.slice('compra '.length)), caso.padrao).toMatchObject({ skin: 'obsidiana', semente: caso.semente, rara: caso.rara, padrao: caso.padrao });
    }
  });

  it('L34c: uma skin sem padrões novos (a Ébano) segue pelas raras de antes no log', () => {
    const antiga = skinDoCatalogoPorId('ebano').raras[0]!;
    const { armazem, logs } = abrir(null, { sortearSemente: () => antiga.semente });
    const c = comSaldo(armazem, 5000);
    armazem.comprar(c.id, 'ebano');
    expect(JSON.parse(logs.find((l) => l.startsWith('compra '))!.slice('compra '.length))).toMatchObject({ skin: 'ebano', rara: true, padrao: antiga.nome });
  });

  it('o apelido no log vem do Registro (usarApelidos); sem sala é null', () => {
    const { armazem, logs } = abrir(null);
    const c = comSaldo(armazem, 5000);
    armazem.usarApelidos((id) => (id === c.id ? 'Ana' : null));
    armazem.comprar(c.id, foraDaVitrine.id);
    expect(JSON.parse(logs.find((l) => l.startsWith('compra '))!.slice('compra '.length))).toMatchObject({ apelido: 'Ana' });
  });

  it('ja-tem: comprar de novo não cobra, não sorteia outra semente e não mexe no contador', () => {
    let sorteios = 0;
    const { armazem, logs } = abrir(null, { sortearSemente: () => 100 + sorteios++ });
    const c = comSaldo(armazem, 5000);
    armazem.comprar(c.id, foraDaVitrine.id);
    const depois = armazem.ler(c.id)!;
    const gastos = sorteios;
    expect(armazem.comprar(c.id, foraDaVitrine.id)).toEqual({ ok: false, erro: 'ja-tem' });
    expect(armazem.comprar(c.id, 'classico')).toEqual({ ok: false, erro: 'ja-tem' });
    expect(armazem.ler(c.id)).toEqual(depois);
    expect(sorteios).toBe(gastos);
    expect(logs.filter((l) => l.startsWith('compra '))).toHaveLength(1);
  });

  it('o item de quem comprou fica na ordem da loja e `skins` (o formato de antes) acompanha os itens', () => {
    const { armazem } = abrir(null);
    const c = comSaldo(armazem, 9000);
    for (const skin of ['ouro', 'ebano', 'neon']) armazem.comprar(c.id, skin);
    const e = armazem.ler(c.id)!;
    expect(e.itens!.map((i) => i.skin)).toEqual(['classico', 'ebano', 'neon', 'ouro']);
    expect(e.skins).toEqual(e.itens!.map((i) => i.skin));
  });

  it('ler devolve cópias: mexer no que veio não mexe no armazém', () => {
    const { armazem } = abrir(null);
    const c = novaCarteira(armazem);
    const lido = armazem.ler(c.id)!;
    (lido.itens as unknown as { bolas: number }[])[0]!.bolas = 99;
    expect(armazem.ler(c.id)!.itens![0]!.bolas).toBe(0);
  });
});

describe('L34: migração do carteiras.json (formato 1 → 2)', () => {
  const antigo = (extra: object = {}) => ({ saldo: 250, skins: ['classico', 'ebano', 'ouro'], skin: 'ouro', criadaEm: 1, jogou: true, ...extra });
  const ID_A = 'a'.repeat(64);
  const ID_B = 'b'.repeat(64);

  it('cada skin já comprada vira um item com semente sorteada e contador 0; o resto da carteira não muda', () => {
    const pasta = pastaNova();
    const texto = JSON.stringify({ versao: 1, carteiras: { [ID_A]: antigo(), [ID_B]: antigo({ saldo: 7, skins: ['classico'], skin: 'classico' }) } });
    writeFileSync(arquivoDe(pasta), texto);
    let n = 0;
    const { armazem, logs } = abrir(pasta, { sortearSemente: () => 700 + n++ });
    const a = armazem.ler(ID_A)!;
    expect(a).toMatchObject({ saldo: 250, skin: 'ouro', skins: ['classico', 'ebano', 'ouro'] });
    expect(a.itens).toHaveLength(3);
    expect(a.itens!.every((i) => i.bolas === 0 && ehSemente(i.semente))).toBe(true);
    expect(new Set(a.itens!.map((i) => i.semente)).size).toBe(3);
    expect(armazem.ler(ID_B)!.itens).toHaveLength(1);
    expect(logs).toEqual(['carteiras-migradas {"carteiras":2,"copia":"carteiras.antes-da-migracao-1700000000000.json"}']);
  });

  it('guarda o arquivo de antes ao lado, intacto, e já grava o novo (a semente é sorteada uma vez só)', async () => {
    const pasta = pastaNova();
    const texto = JSON.stringify({ versao: 1, carteiras: { [ID_A]: antigo() } });
    writeFileSync(arquivoDe(pasta), texto);
    const { armazem } = abrir(pasta);
    await armazem.descarregar();
    expect(readFileSync(join(pasta, 'carteiras.antes-da-migracao-1700000000000.json'), 'utf8')).toBe(texto);
    const gravado = JSON.parse(readFileSync(arquivoDe(pasta), 'utf8'));
    expect(gravado.versao).toBe(2);
    expect(gravado.carteiras[ID_A].skins).toBeUndefined();
    expect(gravado.carteiras[ID_A].itens).toHaveLength(3);
  });

  it('as sementes são estáveis: reabrir o arquivo migrado dá as mesmas, sem migrar de novo nem nova cópia', async () => {
    const pasta = pastaNova();
    writeFileSync(arquivoDe(pasta), JSON.stringify({ versao: 1, carteiras: { [ID_A]: antigo() } }));
    const primeira = abrir(pasta);
    const itens = primeira.armazem.ler(ID_A)!.itens;
    await primeira.armazem.fechar();
    const segunda = abrir(pasta);
    expect(segunda.armazem.ler(ID_A)!.itens).toEqual(itens);
    expect(segunda.logs).toEqual([]);
    expect(vivos(pasta).filter((f) => f.startsWith('carteiras.antes-da-migracao-'))).toHaveLength(1);
  });

  it('arquivo novo regravado abre: itens, contador, skin em uso e missões voltam como foram', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta, { sortearSemente: () => 321 });
    const c = novaCarteira(armazem);
    armazem.aplicar([{ id: c.id, delta: 900 }]);
    armazem.comprar(c.id, 'ouro');
    armazem.usar(c.id, 'ouro');
    armazem.registrarMissoes(c.id, {}, undefined, 4);
    await armazem.fechar();
    const { armazem: reaberto, logs } = abrir(pasta);
    expect(logs).toEqual([]);
    expect(reaberto.resolver(c.codigo)).toBe(c.id);
    expect(reaberto.ler(c.id)).toMatchObject({
      skin: 'ouro',
      itens: [
        { skin: 'classico', semente: 321, bolas: 0 },
        { skin: 'ouro', semente: 321, bolas: 4 },
      ],
    });
  });

  it('formato 1 com uma carteira estragada no meio: migra as boas, guarda o original como corrompido, e não há carteiras-migradas nem cópia antes-da-migracao (L34b)', async () => {
    const pasta = pastaNova();
    const ID_RUIM = 'c'.repeat(64);
    const texto = JSON.stringify({
      versao: 1,
      carteiras: { [ID_A]: antigo(), [ID_RUIM]: antigo({ skins: ['classico', 'diamante'] }), [ID_B]: antigo({ saldo: 7, skins: ['classico'], skin: 'classico' }) },
    });
    writeFileSync(arquivoDe(pasta), texto);
    const { armazem, logs } = abrir(pasta, { sortearSemente: () => 4 });
    expect(armazem.total).toBe(2);
    expect(armazem.ler(ID_RUIM)).toBeUndefined();
    expect(armazem.ler(ID_A)).toMatchObject({ saldo: 250, skin: 'ouro', skins: ['classico', 'ebano', 'ouro'] });
    expect(armazem.ler(ID_A)!.itens).toEqual([
      { skin: 'classico', semente: 4, bolas: 0 },
      { skin: 'ebano', semente: 4, bolas: 0 },
      { skin: 'ouro', semente: 4, bolas: 0 },
    ]);
    expect(armazem.ler(ID_B)).toMatchObject({ saldo: 7, itens: [{ skin: 'classico', semente: 4, bolas: 0 }] });
    // o caminho do estrago (não o da migração): o original vai inteiro para `corrompido-*`, e é ele que guarda o formato 1
    expect(logs).toEqual(['carteiras-corrompidas {"copia":"carteiras.corrompido-1700000000000.json","mantidas":2,"descartadas":1}']);
    await armazem.descarregar();
    expect(vivos(pasta)).toEqual(['carteiras.corrompido-1700000000000.json', 'carteiras.json']);
    expect(readFileSync(join(pasta, 'carteiras.corrompido-1700000000000.json'), 'utf8')).toBe(texto);
    const gravado = JSON.parse(readFileSync(arquivoDe(pasta), 'utf8'));
    expect(gravado.versao).toBe(2);
    expect(Object.keys(gravado.carteiras).sort()).toEqual([ID_A, ID_B]);
    expect(gravado.carteiras[ID_A].skins).toBeUndefined();
    expect(gravado.carteiras[ID_A].itens).toHaveLength(3);
    await armazem.fechar();
    // reabrir não sorteia de novo, não estraga de novo e não cria arquivo nenhum
    const segunda = abrir(pasta, { sortearSemente: () => 900 });
    expect(segunda.armazem.ler(ID_A)!.itens).toEqual(armazem.ler(ID_A)!.itens);
    expect(segunda.logs).toEqual([]);
    expect(vivos(pasta)).toEqual(['carteiras.corrompido-1700000000000.json', 'carteiras.json']);
  });

  it('o formato é de cada carteira, não do arquivo: `itens` num arquivo de versão 1 e `skins` num de versão 2 abrem, e só a que está em `skins` migra (L34b)', () => {
    const itens = [{ skin: 'classico', semente: 11, bolas: 5 }];
    const nova = { saldo: 9, itens, skin: 'classico', criadaEm: 1, jogou: true };
    const velha = antigo({ saldo: 8, skins: ['classico'], skin: 'classico' });

    const v1 = pastaNova();
    writeFileSync(arquivoDe(v1), JSON.stringify({ versao: 1, carteiras: { [ID_A]: nova } }));
    const primeiro = abrir(v1, { sortearSemente: () => 900 });
    expect(primeiro.armazem.ler(ID_A)!.itens).toEqual(itens); // nada sorteado, o contador fica
    expect(primeiro.logs).toEqual([]); // nenhuma migrou: sem log, sem cópia
    expect(vivos(v1)).toEqual(['carteiras.json']);

    const v2 = pastaNova();
    writeFileSync(arquivoDe(v2), JSON.stringify({ versao: 2, carteiras: { [ID_A]: nova, [ID_B]: velha } }));
    const segundo = abrir(v2, { sortearSemente: () => 900 });
    expect(segundo.armazem.ler(ID_A)!.itens).toEqual(itens);
    expect(segundo.armazem.ler(ID_B)!.itens).toEqual([{ skin: 'classico', semente: 900, bolas: 0 }]);
    expect(segundo.logs).toEqual(['carteiras-migradas {"carteiras":1,"copia":"carteiras.antes-da-migracao-1700000000000.json"}']);
  });

  it('item que não presta estraga só aquela carteira: semente fora do intervalo, skin repetida, contador torto, skin em uso sem item, sem o clássico, chave a mais', () => {
    const pasta = pastaNova();
    const item = (skin: string, extra: object = {}) => ({ skin, semente: 10, bolas: 0, ...extra });
    const nova = (itens: unknown[], extra: object = {}) => ({ saldo: 100, itens, skin: 'classico', criadaEm: 1, jogou: false, ...extra });
    const ruins = [
      nova([item('classico', { semente: 1000 })]),
      nova([item('classico', { semente: -1 })]),
      nova([item('classico', { semente: 1.5 })]),
      nova([item('classico'), item('classico')]),
      nova([item('classico', { bolas: -1 })]),
      nova([item('classico', { bolas: 1.5 })]),
      nova([item('classico')], { skin: 'ouro' }),
      nova([item('ouro')], { skin: 'ouro' }),
      nova([item('diamante'), item('classico')]),
      nova([item('classico', { extra: 1 })]),
      nova([{ skin: 'classico', semente: 3 }]),
      nova([]),
      { ...nova([item('classico')]), skins: ['classico'] }, // os dois formatos juntos
    ];
    const bom = nova([item('classico', { semente: 999, bolas: 12 })]);
    const carteiras: Record<string, unknown> = { ['f'.repeat(64)]: bom };
    ruins.forEach((r, i) => (carteiras[String(i).padStart(2, '0').repeat(32)] = r));
    writeFileSync(arquivoDe(pasta), JSON.stringify({ versao: 2, carteiras }));
    const { armazem, logs } = abrir(pasta);
    expect(armazem.total).toBe(1);
    expect(armazem.ler('f'.repeat(64))!.itens).toEqual([{ skin: 'classico', semente: 999, bolas: 12 }]);
    expect(logs.find((l) => l.startsWith('carteiras-corrompidas'))).toContain(`"descartadas":${ruins.length}`);
  });
});

describe('L34: contador de bolas', () => {
  const comOuro = (armazem: ArmazemDeCarteiras) => {
    const c = novaCarteira(armazem);
    armazem.aplicar([{ id: c.id, delta: 1000 }]);
    armazem.comprar(c.id, 'ouro');
    armazem.comprar(c.id, 'neon');
    return c;
  };
  const bolasDe = (armazem: ArmazemDeCarteiras, id: string) => Object.fromEntries(armazem.ler(id)!.itens!.map((i) => [i.skin, i.bolas]));

  it('soma no item em uso e em mais nenhum', () => {
    const { armazem } = abrir(null);
    const c = comOuro(armazem);
    armazem.usar(c.id, 'ouro');
    armazem.registrarMissoes(c.id, {}, undefined, 2);
    expect(bolasDe(armazem, c.id)).toEqual({ classico: 0, neon: 0, ouro: 2 });
    armazem.registrarMissoes(c.id, {}, undefined, 1);
    expect(bolasDe(armazem, c.id)).toEqual({ classico: 0, neon: 0, ouro: 3 });
  });

  it('trocar de skin no meio vale para as tacadas seguintes, e o contador de cada taco fica com ele', () => {
    const { armazem } = abrir(null);
    const c = comOuro(armazem);
    armazem.usar(c.id, 'ouro');
    armazem.registrarMissoes(c.id, {}, undefined, 2);
    armazem.usar(c.id, 'neon');
    armazem.registrarMissoes(c.id, {}, undefined, 5);
    armazem.usar(c.id, 'ouro');
    armazem.registrarMissoes(c.id, {}, undefined, 1);
    expect(bolasDe(armazem, c.id)).toEqual({ classico: 0, neon: 5, ouro: 3 });
  });

  it('zero bolas e nada de missão não é registro: devolve null e não suja a carteira', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta);
    const c = comOuro(armazem);
    await armazem.descarregar();
    const antes = readFileSync(arquivoDe(pasta), 'utf8');
    expect(armazem.registrarMissoes(c.id, {}, undefined, 0)).toBeNull();
    await armazem.descarregar();
    expect(readFileSync(arquivoDe(pasta), 'utf8')).toBe(antes);
  });

  it('as bolas e as missões entram na mesma gravação e na mesma mudança (um aviso só, uma escrita só)', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta);
    const c = novaCarteira(armazem);
    const hoje = missoesDoDia(diaDaMissao(1_700_000_000_000))[0].id;
    await armazem.descarregar();
    const avisos = vi.fn();
    armazem.aoMudar(avisos);
    const r = armazem.registrarMissoes(c.id, { [hoje]: 1 }, undefined, 3);
    expect(r).not.toBeNull();
    expect(avisos).toHaveBeenCalledTimes(1);
    await armazem.descarregar();
    const gravado = JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[c.id];
    expect(gravado.itens[0].bolas).toBe(3);
    expect(gravado.missoes).toBeDefined();
  });

  it('só bolas, sem missão que andou, ainda grava e avisa a carteira', async () => {
    const pasta = pastaNova();
    const { armazem } = abrir(pasta);
    const c = novaCarteira(armazem);
    await armazem.descarregar();
    const avisos = vi.fn();
    armazem.aoMudar(avisos);
    armazem.registrarMissoes(c.id, {}, undefined, 2);
    expect(avisos).toHaveBeenCalledWith(c.id, undefined);
    await armazem.descarregar();
    expect(JSON.parse(readFileSync(arquivoDe(pasta), 'utf8')).carteiras[c.id].itens[0].bolas).toBe(2);
  });

  it('tudo ou nada: bolas tortas recusam também o progresso das missões; valor de missão torto recusa também as bolas', () => {
    const { armazem, logs } = abrir(null);
    const c = novaCarteira(armazem);
    const hoje = missoesDoDia(diaDaMissao(1_700_000_000_000))[0].id;
    const antes = armazem.ler(c.id);
    for (const torta of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(armazem.registrarMissoes(c.id, { [hoje]: 1 }, undefined, torta), String(torta)).toBeNull();
    }
    expect(armazem.registrarMissoes(c.id, { [hoje]: -2 }, undefined, 3)).toBeNull();
    expect(armazem.ler(c.id)).toEqual(antes);
    expect(logs.filter((l) => l.startsWith('carteiras-missao-recusada')).length).toBe(5);
  });

  it('no limite de um número exato: recusa e não soma pela metade', () => {
    const pasta = pastaNova();
    const id = 'a'.repeat(64);
    writeFileSync(
      arquivoDe(pasta),
      JSON.stringify({ versao: 2, carteiras: { [id]: { saldo: 100, itens: [{ skin: 'classico', semente: 1, bolas: Number.MAX_SAFE_INTEGER }], skin: 'classico', criadaEm: 1, jogou: true } } }),
    );
    const { armazem, logs } = abrir(pasta);
    expect(armazem.registrarMissoes(id, {}, undefined, 1)).toBeNull();
    expect(armazem.ler(id)!.itens![0]!.bolas).toBe(Number.MAX_SAFE_INTEGER);
    expect(logs.some((l) => l.startsWith('carteiras-missao-recusada'))).toBe(true);
  });

  it('carteira que não existe: nada acontece', () => {
    const { armazem } = abrir(null);
    expect(armazem.registrarMissoes('0'.repeat(64), {}, undefined, 2)).toBeNull();
  });
});
