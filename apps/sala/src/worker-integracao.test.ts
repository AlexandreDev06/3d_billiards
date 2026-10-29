/**
 * A sala na Cloudflare de ponta a ponta (L41), pelo Worker de verdade: `wrangler dev --local` sobe o mesmo `wrangler.jsonc` que vai ao
 * ar (o workerd da máquina, o Durable Object com SQLite em disco, os static assets com o `_headers`), e dois clientes WebSocket reais
 * jogam por ele, com a física e as regras reais. Nada de conta nem de rede da Cloudflare.
 *
 * Em ordem (o estado do Worker é o mesmo de um teste ao outro, como o da sala no ar): a borda HTTP; a importação de um `carteiras.json`
 * da sala Node, com os códigos antigos abrindo as carteiras; a hibernação do WebSocket; e uma partida de mata-mata de 2 com aposta
 * paga, missão contada e estatística, com reconexão por token no meio, o objeto reiniciado no meio da partida (as carteiras voltam, a
 * sala não) e outra vez no fim. A medição do plano gratuito sai em `L41_MEDICAO=<arquivo>`.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ClientOptions } from 'ws';
import {
  APARENCIA_PADRAO,
  CABECALHO_DO_PROTOCOLO,
  CONTAGEM_ZERADA,
  PROTOCOLO_VERSAO,
  PROTOCOLO_VERSAO_MINIMA,
  SALDO_INICIAL,
  diaDaMissao,
  missoesDoDia,
  precoDaSkinNoDia,
  premioDaMissao,
  type AparenciaDoBalao,
  type EstadoCarteira,
  type IdMissao,
  type MsgMissoes,
} from '@sinuca/protocolo';
import { PRESET_MATA_MATA } from '@sinuca/regras';
import { ArmazemDeCarteiras } from './carteiras';
import { SEM_LIMITE } from './para-testes';
import { ClienteWs } from './para-testes-ws';
import { depoisDe, escolherTacada, http, subirWrangler, type WranglerLocal } from './para-testes-worker';

const SEGREDO = 'segredo-so-de-teste-do-l41-0123456789';
const PASTA_DA_SALA = fileURLToPath(new URL('..', import.meta.url));

type Carteira = EstadoCarteira & { codigo?: string };

/** O que `GET /admin/uso` devolve (sala-do.ts). */
interface Uso {
  carteiras: number;
  salas: number;
  conexoes: number;
  acordouEm: number;
  desdeQueAcordou: Record<string, number>;
  alarme: { proximoEm: number | null; disparos: number };
  soquetes: { ligacoes: number; enderecosComBalde: number; encerrados: { tamanho: number; cotaPorIp: number; silencio: number } };
}

const dormir = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('a sala no Worker da Cloudflare (wrangler dev --local, workerd de verdade)', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'sala-worker-'));
  const persistir = join(raiz, 'estado');
  const assets = join(raiz, 'assets-cf');
  const clientes: ClienteWs[] = [];
  const saidas: string[] = [];
  let w: WranglerLocal;

  const subir = (): Promise<WranglerLocal> => subirWrangler({ persistir, assets, vars: { SEGREDO_ADMIN: SEGREDO } });
  async function reiniciar(): Promise<void> {
    await w.parar();
    saidas.push(...w.saida);
    w = await subir();
  }
  const conectar = async (nome: string, opcoes: ClientOptions = {}): Promise<ClienteWs> => {
    const c = await ClienteWs.conectar(w.porta, nome, opcoes);
    clientes.push(c);
    return c;
  };
  const carteira = async (codigo: string): Promise<Carteira> => {
    const r = await http<Carteira>(w.base, 'GET', '/carteira', { codigo });
    expect(r.status).toBe(200);
    return r.corpo;
  };
  const criarCarteira = async (): Promise<string> => {
    const r = await http<Carteira>(w.base, 'POST', '/carteira');
    expect(r.status).toBe(201);
    expect(r.corpo.saldo).toBe(SALDO_INICIAL);
    return r.corpo.codigo!;
  };
  const uso = async (): Promise<Uso> => {
    const r = await http<Uso>(w.base, 'GET', '/admin/uso', { codigo: SEGREDO });
    expect(r.status).toBe(200);
    return r.corpo;
  };

  beforeAll(async () => {
    // o workerd é outro processo e a máquina pode estar ocupada: esperar 5 s por uma mensagem é pouco
    ClienteWs.esperaPadraoMs = 20_000;
    // o "build" do cliente, de mentira, no formato do de verdade, e a cópia que o Worker serve (o mesmo script do deploy)
    const dist = join(raiz, 'dist');
    mkdirSync(join(dist, 'assets'), { recursive: true });
    mkdirSync(join(dist, 'boteco'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Sinuca</title><script type="module" src="/assets/app-1.js"></script>');
    writeFileSync(join(dist, 'assets', 'app-1.js'), 'console.log(1)');
    writeFileSync(join(dist, 'boteco', 'mesa.glb'), Buffer.alloc(2048, 7));
    execFileSync(process.execPath, [join(PASTA_DA_SALA, 'scripts/preparar-assets-cf.mjs'), dist, assets], { stdio: 'pipe' });
    w = await subir();
  }, 180_000);

  afterAll(async () => {
    for (const c of clientes) c.derrubar();
    await w?.parar();
    rmSync(raiz, { recursive: true, force: true });
  }, 30_000);

  it('a borda: a página leva a política de conteúdo com o host, os assets saem com o _headers, e o que não é do jogo é recusado', async () => {
    const saude = await http(w.base, 'GET', '/saude');
    expect(saude).toMatchObject({ status: 200, bruto: 'ok' });

    const pagina = await http(w.base, 'GET', '/');
    expect(pagina.status).toBe(200);
    expect(pagina.cabecalhos.get('content-type')).toContain('text/html');
    expect(pagina.cabecalhos.get('content-security-policy')).toContain(`ws://127.0.0.1:${w.porta} wss://127.0.0.1:${w.porta}`);
    expect(pagina.cabecalhos.get('x-content-type-options')).toBe('nosniff');
    expect(pagina.bruto).toContain('/assets/app-1.js');

    const js = await http(w.base, 'GET', '/assets/app-1.js');
    expect(js.status).toBe(200);
    expect(js.cabecalhos.get('cache-control')).toContain('immutable');
    expect(js.cabecalhos.get('x-content-type-options')).toBe('nosniff');
    expect((await http(w.base, 'GET', '/boteco/mesa.glb')).cabecalhos.get('cache-control')).toBe('public, max-age=300');
    expect((await http(w.base, 'GET', '/boteco/nao-existe.glb')).status).toBe(404);
    expect((await http(w.base, 'POST', '/')).status).toBe(405);

    // /sala sem WebSocket e com Origin de outro site
    expect((await http(w.base, 'GET', '/sala')).status).toBe(426);
    await expect(conectar('Intruso', { headers: { Origin: 'https://outro-site.exemplo' } })).rejects.toThrow('HTTP 403');
    // o Origin do próprio endereço entra (é o do navegador que carregou a página daqui)
    const dono = await conectar('Dono', { headers: { Origin: w.base } });
    dono.derrubar();

    // a carteira: sem Origin no POST, sem código, e a administração fechada para quem não tem o segredo
    expect((await http(w.base, 'POST', '/carteira', { cabecalhos: { Origin: 'https://outro-site.exemplo' }, semOrigin: true })).status).toBe(403);
    expect((await http(w.base, 'GET', '/carteira')).status).toBe(401);
    expect((await http(w.base, 'GET', '/carteira', { codigo: 'x'.repeat(20) })).status).toBe(401);
    expect((await http(w.base, 'GET', '/admin/uso')).status).toBe(401);
    expect((await http(w.base, 'GET', '/admin/uso', { codigo: 'errado-errado-errado-errado' })).status).toBe(401);
    expect((await http(w.base, 'POST', '/admin/uso', { codigo: SEGREDO })).status).toBe(405);
    expect((await http(w.base, 'GET', '/admin/outra-coisa', { codigo: SEGREDO })).status).toBe(404);
    expect((await uso()).carteiras).toBe(0);
  }, 60_000);

  describe('a importação do carteiras.json da sala Node', () => {
    /** Um arquivo de verdade: o `ArmazemDeCarteiras` grava três carteiras, com compra, estatística e missão. */
    async function arquivoDaSalaNode(): Promise<{ arquivo: string; codigos: string[]; estados: EstadoCarteira[] }> {
      const pasta = join(raiz, 'sala-node');
      const node = new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 1, relogio: Date.now, log: () => {}, presenteDeTeste: undefined });
      const [a, b, c] = [node.criar()!, node.criar()!, node.criar()!];
      node.comprar(a.id, 'ebano');
      node.usar(a.id, 'ebano');
      node.aplicar([{ id: a.id, delta: 30 }, { id: b.id, delta: -30 }], undefined, [{ id: a.id, modalidade: 'par-ou-impar', contagem: { ...CONTAGEM_ZERADA, partidas: 1, vitorias: 1, bolas: 7, sequencia: 4 } }]);
      node.registrarMissoes(a.id, {}, undefined, 5);
      const estados = [a, b, c].map((x) => node.ler(x.id)!);
      await node.fechar();
      return { arquivo: join(pasta, 'carteiras.json'), codigos: [a.codigo, b.codigo, c.codigo], estados };
    }

    const importar = (arquivo: string, extra: string[] = [], segredo: string | null = SEGREDO) => {
      const env = { ...process.env };
      if (segredo === null) delete env.SEGREDO_ADMIN;
      else env.SEGREDO_ADMIN = segredo;
      try {
        const saida = execFileSync(process.execPath, [join(PASTA_DA_SALA, 'scripts/importar-carteiras.mjs'), '--url', w.base, '--arquivo', arquivo, ...extra], { env, stdio: 'pipe' }).toString();
        return { codigo: 0, saida };
      } catch (e) {
        const erro = e as { status: number; stdout: Buffer; stderr: Buffer };
        return { codigo: erro.status, saida: erro.stdout.toString() + erro.stderr.toString() };
      }
    };

    it('importa uma vez, recusa a segunda, só sobrescreve se pedir, e os códigos antigos abrem as mesmas carteiras', async () => {
      const { arquivo, codigos, estados } = await arquivoDaSalaNode();
      const texto = readFileSync(arquivo, 'utf8');
      for (const codigo of codigos) expect(texto, 'o arquivo da sala Node não guarda código').not.toContain(codigo);

      // sem o segredo o script nem tenta; com o segredo errado o Worker recusa e nada entra
      expect(importar(arquivo, [], null)).toMatchObject({ codigo: 2 });
      const errado = importar(arquivo, [], 'segredo-errado-errado-errado');
      expect(errado.codigo).toBe(1);
      expect(errado.saida).toContain('nao-autorizado');
      expect((await uso()).carteiras).toBe(0);

      const primeira = importar(arquivo);
      expect(primeira, primeira.saida).toMatchObject({ codigo: 0 });
      expect(primeira.saida).toContain('Importado: 3 carteiras');
      expect((await uso()).carteiras).toBe(3);
      for (const [i, codigo] of codigos.entries()) {
        const c = await carteira(codigo);
        expect({ saldo: c.saldo, skins: c.skins, skin: c.skin, itens: c.itens, estatisticas: c.estatisticas }).toEqual({
          saldo: estados[i]!.saldo,
          skins: estados[i]!.skins,
          skin: estados[i]!.skin,
          itens: estados[i]!.itens,
          estatisticas: estados[i]!.estatisticas,
        });
      }
      expect((await carteira(codigos[0]!)).estatisticas!.total).toMatchObject({ partidas: 1, vitorias: 1, bolas: 7 });

      // a segunda importação recusa: o objeto já tem carteiras
      const segunda = importar(arquivo);
      expect(segunda.codigo).toBe(1);
      expect(segunda.saida).toContain('ja-tem-carteiras');
      expect(segunda.saida).toContain('--sobrescrever');
      expect((await uso()).carteiras).toBe(3);

      // só com --sobrescrever troca (as mesmas três: substituídas, nenhuma nova)
      const troca = importar(arquivo, ['--sobrescrever']);
      expect(troca, troca.saida).toMatchObject({ codigo: 0 });
      expect(troca.saida).toContain('3 substituídas');
      expect((await uso()).carteiras).toBe(3);

      // um arquivo que não é o carteiras.json é recusado antes de mexer em qualquer coisa
      const lixo = join(raiz, 'lixo.json');
      writeFileSync(lixo, JSON.stringify({ versao: 99, carteiras: {} }));
      const ruim = importar(lixo, ['--sobrescrever']);
      expect(ruim.codigo).toBe(1);
      expect(ruim.saida).toContain('arquivo-invalido');
      expect((await uso()).carteiras).toBe(3);

      // a importação sobrevive a reiniciar o objeto
      await reiniciar();
      for (const [i, codigo] of codigos.entries()) expect((await carteira(codigo)).saldo).toBe(estados[i]!.saldo);
      expect((await uso()).carteiras).toBe(3);
    }, 180_000);
  });

  it('hibernação: sem sala aberta o objeto dorme com o WebSocket ligado, e ao acordar a conexão segue funcionando', async () => {
    const antes = await uso();
    const c = await conectar('Dorminhoco');
    c.enviar({ tipo: 'ping', t: 1 });
    await c.esperarTipo('pong');
    // sem tick (nenhuma sala) e sem requisição: o workerd hiberna o objeto depois de uns 10 s e descarta a memória dele
    await new Promise((r) => setTimeout(r, 14_000));
    expect(c.fechou, 'o WebSocket ficou ligado durante o sono').toBeNull();
    // quem acorda o objeto é uma requisição HTTP, e o soquete que dormiu, sem falar, já volta ao controle de silêncio (L41b)
    const acordado = await uso();
    expect(acordado.acordouEm, 'o objeto acordou com esta requisição').toBeGreaterThan(antes.acordouEm);
    expect(acordado.conexoes).toBeGreaterThanOrEqual(1);
    expect(acordado.soquetes.ligacoes, 'todo WebSocket aberto tem ligação, mesmo sem ter falado depois de acordar').toBe(acordado.conexoes);
    c.enviar({ tipo: 'ping', t: 2 });
    const pong = await c.esperar((m) => m.tipo === 'pong' && m.t === 2);
    expect(pong).toMatchObject({ tipo: 'pong', t: 2 });
    // e a sala funciona na conexão que dormiu (a ligação foi refeita do anexo do WebSocket)
    c.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras);
    await c.esperarTipo('boas-vindas');
    const depois = await uso();
    expect(depois.acordouEm, 'o objeto acordou de novo (outra instância na memória)').toBeGreaterThan(antes.acordouEm);
    expect(depois.salas).toBe(1);
    expect(depois.carteiras).toBe(3);
    c.derrubar();
  }, 60_000);

  it('uma partida inteira de mata-mata de 2: aposta paga, missão contada, reconexão, o objeto reiniciado no meio e a medição do plano', async () => {
    const codigoAna = await criarCarteira();
    const codigoBeto = await criarCarteira();
    const codigos = [codigoAna, codigoBeto];
    expect(await carteira(codigoAna)).toMatchObject({ saldo: 100, skins: ['classico'], skin: 'classico' });
    const dia = diaDaMissao(Date.now());

    // ---- 1. uma sala com aposta, três tacadas e a Ana caindo e voltando com o token
    let ana = await conectar('Ana');
    let beto = await conectar('Beto');
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras, { aposta: 20, carteira: codigoAna });
    const bv = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv.codigo, undefined, codigoBeto);
    await beto.esperarTipo('boas-vindas');
    await Promise.all([ana, beto].map((c) => c.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto')));
    for (const c of [ana, beto]) expect(c.ultimoEstado!.lugares.slice(0, 2).map((l) => l.saldo), c.nome).toEqual([100, 100]);
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all([ana, beto].map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));

    const jogar = async (cs: ClienteWs[], turno: number): Promise<void> => {
      const estado = cs[0]!.ultimoEstado!;
      expect(estado.seq).toBe(turno);
      const quem = cs[estado.vez!]!;
      const marcas = cs.map((c) => c.recebidas.length);
      quem.enviar(escolherTacada(quem.visao!, turno));
      await Promise.all(cs.map((c, i) => depoisDe(c, marcas[i]!, (x) => x.tipo === 'estado-sala' && x.seq === turno + 1)));
    };
    for (let turno = 0; turno < 3; turno++) await jogar([ana, beto], turno);

    const token = bv.token;
    ana.derrubar();
    await beto.esperar((m) => m.tipo === 'estado-sala' && !m.lugares[0]!.conectado);
    ana = await conectar('Ana');
    ana.entrar(bv.codigo, token);
    expect(await ana.esperarTipo('boas-vindas')).toMatchObject({ lugar: 0, anfitriao: true, token });
    await ana.esperar((m) => m.tipo === 'retrato' && m.motivo === 'entrada');
    await beto.esperar((m) => m.tipo === 'estado-sala' && m.lugares[0]!.conectado);
    expect(ana.visao).toEqual(beto.visao);
    await jogar([ana, beto], 3);

    // ---- 2. o objeto reiniciado no meio da partida: as carteiras voltam, a sala e a partida não (como num reinício da sala Node)
    // (as missões fechadas nas 4 tacadas já foram pagas à carteira, na hora, e têm de voltar; a aposta ainda não foi paga)
    const codigoDaSalaVelha = bv.codigo;
    const antesDoReinicio = await Promise.all(codigos.map(carteira));
    for (const c of antesDoReinicio) expect(c.saldo).toBeGreaterThanOrEqual(100);
    for (const c of [ana, beto]) expect(c.recebidas.some((m) => m.tipo === 'aposta-paga'), `${c.nome}: a partida ainda não acabou`).toBe(false);
    await reiniciar();
    await Promise.all([ana, beto].map((c) => c.esperarFechar(10_000)));
    const depoisDoReinicio = await Promise.all(codigos.map(carteira));
    expect(depoisDoReinicio.map((c) => ({ saldo: c.saldo, missoes: c.missoes }))).toEqual(antesDoReinicio.map((c) => ({ saldo: c.saldo, missoes: c.missoes })));
    expect((await uso()).carteiras).toBe(5);
    const perdida = await conectar('Ana');
    perdida.entrar(codigoDaSalaVelha, token);
    expect(await perdida.esperarTipo('erro')).toMatchObject({ codigo: 'sala-inexistente' });
    perdida.derrubar();

    // ---- 3. a partida de novo, inteira, na sala nova: a medição vale daqui (o objeto acabou de acordar, os contadores partem de zero)
    const saldosDeSaida = depoisDoReinicio.map((c) => c.saldo);
    ana = await conectar('Ana');
    beto = await conectar('Beto');
    const cs = [ana, beto];
    ana.criar('1x1', SEM_LIMITE, undefined, PRESET_MATA_MATA.regras, { aposta: 20, carteira: codigoAna });
    const bv2 = await ana.esperarTipo('boas-vindas');
    beto.entrar(bv2.codigo, undefined, codigoBeto);
    await beto.esperarTipo('boas-vindas');
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto')));
    ana.enviar({ tipo: 'iniciar' });
    await Promise.all(cs.map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
    let tacadas = 0;
    for (let turno = 0; turno < 200 && ana.ultimoEstado!.vez !== null; turno++) {
      await jogar(cs, turno);
      tacadas++;
    }
    expect(ana.ultimoEstado!.vez, 'a partida não acabou em 200 tacadas').toBeNull();

    // o pote: o vencedor leva os 20 do outro, e todos veem o pagamento antes do estado com os saldos novos
    const fim = ana.recebidas.filter((m) => m.tipo === 'tacada-retransmitida').at(-1)!;
    if (fim.tipo !== 'tacada-retransmitida') throw new Error('impossível');
    const vencedor = fim.partida.vencedor!;
    const perdedor = 1 - vencedor;
    for (const c of cs) {
      const paga = await c.esperar((m) => m.tipo === 'aposta-paga');
      if (paga.tipo !== 'aposta-paga') throw new Error('impossível');
      expect(paga.valor, c.nome).toBe(20);
      expect(paga.variacoes.map((v) => v.delta), c.nome).toEqual(vencedor === 0 ? [20, -20] : [-20, 20]);
      const tipos = c.recebidas.map((m) => m.tipo);
      expect(tipos.lastIndexOf('tacada-retransmitida'), c.nome).toBeLessThan(tipos.indexOf('aposta-paga'));
      expect(tipos.indexOf('aposta-paga'), c.nome).toBeLessThan(tipos.lastIndexOf('estado-sala'));
      expect(c.recebidas.filter((m) => m.tipo === 'aposta-paga')).toHaveLength(1);
    }

    // as missões do dia contadas: o que o jogo mostra na mensagem `missoes` é o que o GET /carteira mostra, e o dinheiro bate
    const missoesDe = (c: ClienteWs): MsgMissoes[] => c.recebidas.filter((m): m is MsgMissoes => m.tipo === 'missoes');
    const cumpridasDe = (c: ClienteWs): IdMissao[] => missoesDe(c).flatMap((m) => [...m.cumpridas]);
    for (const c of cs) expect(new Set(cumpridasDe(c)).size, `${c.nome}: nenhuma missão paga duas vezes`).toBe(cumpridasDe(c).length);
    const ganhoDeMissoes = (c: ClienteWs): number => cumpridasDe(c).reduce((soma, id) => soma + premioDaMissao(id), 0);
    const finais = await Promise.all(codigos.map(carteira));
    for (const [i, c] of cs.entries()) {
      expect(finais[i]!.saldo, `${c.nome}: saldo = o de saída ± 20 do pote + prêmios das missões fechadas nesta partida`).toBe(saldosDeSaida[i]! + (i === vencedor ? 20 : -20) + ganhoDeMissoes(c));
      const ultima = missoesDe(c).at(-1);
      if (ultima) expect(finais[i]!.missoes, c.nome).toEqual(ultima.missoes);
    }
    // com o Worker no relógio de verdade, as missões são as de hoje; as que uma partida inteira de mata-mata sempre mexe são conferidas
    const doDia = missoesDoDia(dia).map((m) => m.id);
    const progressoDe = (i: number, id: IdMissao) => finais[i]!.missoes!.itens.find((x) => x.id === id);
    if (doDia.includes('mao-quente')) expect([0, 1].some((i) => progressoDe(i, 'mao-quente')!.cumprida), 'alguém matou 5 bolas numa partida de 15').toBe(true);
    if (doDia.includes('fregues-da-casa')) for (const i of [0, 1]) expect(progressoDe(i, 'fregues-da-casa')!.progresso, 'terminou 1 partida').toBe(1);
    if (doDia.includes('fecha-a-conta')) expect(progressoDe(vencedor, 'fecha-a-conta')!.cumprida).toBe(true);
    // e a estatística da partida, que sempre conta: a contagem de bolas do jogo é a do GET
    const totais = finais.map((f) => f.estatisticas!.total);
    // moedas ganhas = o que o pote deu a mais do que a pessoa pôs, mais o prêmio das missões que ela fechou
    expect(totais[vencedor]).toMatchObject({ partidas: 1, vitorias: 1, moedas: 20 + ganhoDeMissoes(cs[vencedor]!) });
    expect(totais[perdedor]).toMatchObject({ partidas: 1, vitorias: 0, moedas: ganhoDeMissoes(cs[perdedor]!) });
    expect(totais[vencedor]!.bolas + totais[perdedor]!.bolas, 'alguma bola foi encaçapada').toBeGreaterThan(0);
    for (const c of cs) for (const l of c.ultimoEstado!.lugares.slice(0, 2)) expect(l.estatisticas?.partidas, c.nome).toBe(1);

    // a loja pelo HTTP (preço do dia, que pode estar na vitrine): o vencedor compra e a sala inteira vê o saldo novo sem ele mexer em nada
    const preco = precoDaSkinNoDia('ebano', dia);
    const saldoAntes = finais[vencedor]!.saldo;
    const marcasLoja = cs.map((c) => c.recebidas.length);
    const compra = await http<Carteira>(w.base, 'POST', '/carteira/comprar', { codigo: codigos[vencedor], corpo: { skin: 'ebano' } });
    expect(compra).toMatchObject({ status: 200, corpo: { saldo: saldoAntes - preco, skins: ['classico', 'ebano'], skin: 'classico' } });
    await Promise.all(cs.map((c, i) => depoisDe(c, marcasLoja[i]!, (m) => m.tipo === 'estado-sala' && m.lugares[vencedor]!.saldo === saldoAntes - preco)));
    const usa = await http<Carteira>(w.base, 'POST', '/carteira/usar', { codigo: codigos[vencedor], corpo: { skin: 'ebano' } });
    expect(usa.corpo.skin).toBe('ebano');
    await Promise.all(cs.map((c, i) => depoisDe(c, marcasLoja[i]!, (m) => m.tipo === 'estado-sala' && m.lugares[vencedor]!.skin === 'ebano')));
    for (const c of cs) expect(c.invalidas, c.nome).toEqual([]);

    // ---- 4. a medição desta partida (cada quadro mandado pelos dois clientes é uma mensagem de WebSocket que o objeto recebeu)
    const medida = await uso();
    const enviadas = ana.enviadas + beto.enviadas;
    // (mais a do `entrar` na sala que não existia mais, mandada logo depois de o objeto acordar)
    expect(medida.desdeQueAcordou.mensagensRecebidas, 'o objeto contou as mesmas mensagens que os clientes mandaram').toBe(enviadas + perdida.enviadas);
    expect(medida.desdeQueAcordou.gravacoesFalhas).toBe(0);
    if (process.env.L41_MEDICAO) {
      writeFileSync(
        process.env.L41_MEDICAO,
        JSON.stringify(
          {
            partida: { modo: '1x1 mata-mata com aposta de 20', tacadas, vencedor, jogadores: 2, mensagensDosClientesAoObjeto: enviadas, bytesDosClientesAoObjeto: ana.bytesEnviados + beto.bytesEnviados, porCliente: { ana: ana.enviadas, beto: beto.enviadas } },
            recebidasPorCliente: { ana: { quadros: ana.quadros.length, bytes: ana.quadros.reduce((s, q) => s + q.bytes, 0) }, beto: { quadros: beto.quadros.length, bytes: beto.quadros.reduce((s, q) => s + q.bytes, 0) } },
            requisicoesDoTeste: '11 ao objeto desde que acordou: 3 upgrades de WebSocket (2 da partida e 1 de um entrar em sala que sumiu), 4 GET /carteira, 1 comprar, 1 usar e 2 GET /admin/uso',
            objeto: medida,
          },
          null,
          2,
        ),
      );
    }

    // ---- 5. o fim: reiniciar o objeto de novo e conferir que tudo o que a partida deixou nas carteiras volta igual
    for (const c of cs) c.derrubar();
    const antesDeReiniciar = await Promise.all(codigos.map(carteira));
    await reiniciar();
    const depoisDeReiniciar = await Promise.all(codigos.map(carteira));
    expect(depoisDeReiniciar.map((c) => ({ saldo: c.saldo, skins: c.skins, skin: c.skin, estatisticas: c.estatisticas, missoes: c.missoes }))).toEqual(
      antesDeReiniciar.map((c) => ({ saldo: c.saldo, skins: c.skins, skin: c.skin, estatisticas: c.estatisticas, missoes: c.missoes })),
    );
    expect(depoisDeReiniciar[vencedor]).toMatchObject({ skin: 'ebano', skins: ['classico', 'ebano'] });
    expect((await uso()).carteiras).toBe(5);
    // e a carteira que voltou do SQLite senta numa sala nova com o saldo de antes
    const volta = await conectar('Ana');
    volta.criar('1x1', SEM_LIMITE, undefined, undefined, { carteira: codigos[vencedor]! });
    await volta.esperarTipo('boas-vindas');
    expect((await volta.esperarTipo('estado-sala')).lugares[0]).toMatchObject({ saldo: depoisDeReiniciar[vencedor]!.saldo, skin: 'ebano' });
    volta.derrubar();
  }, 300_000);

  describe('as defesas do WebSocket no workerd (L41b): alarm, importação, tamanho, conexões e cota por endereço', () => {
    // Outra instância, com limites pequenos para caber num teste: 3 conexões por IP, 80 mensagens por IP (recarga 1 por segundo) e o
    // alarm de 1 s. Todos os clientes são do mesmo endereço (127.0.0.1), como dois jogadores atrás do mesmo roteador.
    let d: WranglerLocal;
    const abertos: ClienteWs[] = [];
    const conectarD = async (nome: string): Promise<ClienteWs> => {
      const c = await ClienteWs.conectar(d.porta, nome);
      abertos.push(c);
      return c;
    };
    // O `/admin/uso` tem balde próprio por IP (30 de rajada, 1 a cada 10 s) e todos os testes daqui são do mesmo IP: poucas consultas,
    // espaçadas, para o balde da administração nunca ser o que falha (e nunca esconder o motivo de um teste que falha)
    const usoD = async (): Promise<Uso> => {
      const r = await http<Uso>(d.base, 'GET', '/admin/uso', { codigo: SEGREDO });
      expect(r.status, 'GET /admin/uso').toBe(200);
      return r.corpo;
    };
    const esperarUsoD = async (serve: (u: Uso) => boolean, tentativas = 10, esperaMs = 2_000): Promise<Uso> => {
      let u = await usoD();
      for (let i = 0; i < tentativas && !serve(u); i++) {
        await dormir(esperaMs);
        u = await usoD();
      }
      return u;
    };
    const fecharTodos = async (): Promise<void> => {
      for (const c of abertos.splice(0)) c.derrubar();
      const u = await esperarUsoD((x) => x.conexoes === 0, 6, 1_000);
      expect(u.conexoes, 'o objeto viu os soquetes fecharem').toBe(0);
    };

    beforeAll(async () => {
      d = await subirWrangler({
        persistir: join(raiz, 'estado-defesas'),
        assets,
        vars: { SEGREDO_ADMIN: SEGREDO, MAX_CONEXOES_POR_IP: '3', MENSAGENS_POR_IP: '80', MENSAGENS_POR_IP_S: '1', ALARME_S: '1' },
      });
    }, 180_000);

    afterAll(async () => {
      for (const c of abertos) c.derrubar();
      await d?.parar();
      saidas.push(...(d?.saida ?? []));
    }, 30_000);

    let ana: ClienteWs;
    let codigoDaSala: string;

    it('o alarm: sem sala não há alarm; com sala aberta ele dispara e se rearma sozinho (cada disparo é um evento que o objeto não despeja)', async () => {
      const antes = await usoD();
      expect(antes).toMatchObject({ salas: 0, alarme: { proximoEm: null, disparos: 0 } });

      // conexão e mensagens sem sala: nada de alarm
      ana = await conectarD('Ana');
      ana.enviar({ tipo: 'ping', t: 1 });
      await ana.esperarTipo('pong');
      await dormir(2_500);
      expect((await usoD()).alarme).toEqual({ proximoEm: null, disparos: 0 });

      // com sala: arma, dispara e rearma (o intervalo do teste é de 1 s)
      ana.criar('1x1', SEM_LIMITE);
      codigoDaSala = (await ana.esperarTipo('boas-vindas')).codigo;
      // o workerd local dispara o alarm com atraso quando a máquina está ocupada: espera até ele ter disparado duas vezes
      const depois = await esperarUsoD((u) => u.alarme.disparos >= 2, 10, 2_000);
      expect(depois.salas).toBe(1);
      expect(depois.alarme.disparos, 'o alarm disparou e se rearmou sozinho').toBeGreaterThanOrEqual(2);
      expect(depois.alarme.proximoEm, 'e continua armado').toBeGreaterThan(Date.now() - 5_000);
    }, 90_000);

    it('`?sobrescrever=1` é recusado com sala aberta (409 salas-abertas); a sala e as carteiras ficam como estão', async () => {
      const r = await http<{ erro: string; salas: number }>(d.base, 'POST', '/admin/importar-carteiras?sobrescrever=1', { codigo: SEGREDO, corpo: '{}' });
      expect(r).toMatchObject({ status: 409, corpo: { erro: 'salas-abertas', salas: 1 } });
      expect((await usoD()).salas).toBe(1);

      // e o script `importar:cf --sobrescrever` explica o porquê em vez de só dizer "recusado"
      const arquivo = join(raiz, 'qualquer.json');
      writeFileSync(arquivo, JSON.stringify({ versao: 2, carteiras: {} }));
      let saida = '';
      try {
        execFileSync(process.execPath, [join(PASTA_DA_SALA, 'scripts/importar-carteiras.mjs'), '--url', d.base, '--arquivo', arquivo, '--sobrescrever'], { env: { ...process.env, SEGREDO_ADMIN: SEGREDO }, stdio: 'pipe' });
      } catch (e) {
        const erro = e as { status: number; stdout: Buffer; stderr: Buffer };
        expect(erro.status).toBe(1);
        saida = erro.stdout.toString() + erro.stderr.toString();
      }
      expect(saida).toContain('salas-abertas');
      expect(saida).toContain('1 sala(s) aberta(s)');
    }, 60_000);

    it('mensagem acima de 512 KiB derruba a conexão com 1009 e solta a ligação: a sala vê o jogador sair', async () => {
      const beto = await conectarD('Beto');
      beto.entrar(codigoDaSala);
      await beto.esperarTipo('boas-vindas');
      await depoisDe(beto, 0, (m) => m.tipo === 'estado-sala' && m.lugares[0]!.conectado && m.lugares[1]!.conectado);
      const marca = beto.recebidas.length;
      const antes = await usoD();

      // 512 KiB + 1 byte, num quadro só (o workerd aceitaria até 32 MiB: o corte é da sala)
      ana.enviarBruto('x'.repeat(512 * 1024 + 1));
      expect(await ana.esperarFechar(15_000)).toMatchObject({ codigo: 1009 });
      await depoisDe(beto, marca, (m) => m.tipo === 'estado-sala' && !m.lugares[0]!.conectado);

      const depois = await usoD();
      expect(depois.soquetes.encerrados.tamanho).toBe(antes.soquetes.encerrados.tamanho + 1);
      expect(depois.soquetes.ligacoes).toBeLessThan(antes.soquetes.ligacoes);
      // quem está no teto exato (512 KiB) fica: é lido, recusado como mensagem inválida, e a conexão segue
      beto.enviarBruto('y'.repeat(512 * 1024));
      await depoisDe(beto, marca, (m) => m.tipo === 'erro');
      expect(beto.fechou).toBeNull();
    }, 60_000);

    it('o Worker aceita só `MAX_CONEXOES_POR_IP` conexões por endereço (aqui 3): a quarta leva 429, e a vaga volta ao fechar', async () => {
      await fecharTodos();
      const tres = [await conectarD('a'), await conectarD('b'), await conectarD('c')];
      const quarta = await ClienteWs.conectar(d.porta, 'd').then(
        (c) => {
          abertos.push(c); // aberta é erro do teste, mas não deixa soquete para trás
          return 'abriu';
        },
        (e: Error) => e.message,
      );
      expect(quarta, 'a quarta conexão do mesmo endereço').toBe('HTTP 429');
      // (o fechamento com handshake do cliente `ws` só termina em ~10 s no workerd local; o objeto já viu a saída)
      tres[0]!.derrubar();
      expect((await esperarUsoD((u) => u.conexoes <= 2, 6, 1_000)).conexoes).toBe(2);
      abertos.push(await ClienteWs.conectar(d.porta, 'e'));
    }, 60_000);

    it('a cota de mensagens é do endereço, somando as conexões: três conexões que cabem no balde de cada uma estouram o do IP, e a que estoura cai com 1008', async () => {
      await fecharTodos();
      const antes = await usoD();
      const tres = [await conectarD('x'), await conectarD('y'), await conectarD('z')];
      // 30 mensagens de cada (o balde da conexão é de 40): 90 no total, para 80 fichas do endereço
      for (const c of tres) for (let t = 0; t < 30; t++) c.enviar({ tipo: 'ping', t });
      for (let i = 0; i < 40 && !tres.some((c) => c.fechou); i++) await dormir(250);
      const caidos = tres.filter((c) => c.fechou);
      expect(caidos.length, 'alguma conexão caiu pela cota do endereço').toBeGreaterThanOrEqual(1);
      for (const c of caidos) expect(c.fechou, c.nome).toEqual({ codigo: 1008, motivo: 'Mensagens demais deste endereço.' });
      for (const c of tres) expect(c.recebidas.filter((m) => m.tipo === 'erro'), `${c.nome}: nenhuma recusa do balde da conexão (cada uma ficou dentro do seu)`).toEqual([]);

      const depois = await usoD();
      expect(depois.soquetes.encerrados.cotaPorIp).toBeGreaterThan(antes.soquetes.encerrados.cotaPorIp);
      expect(depois.soquetes.enderecosComBalde, 'o balde do endereço segue na memória enquanto deve (o objeto não hiberna com ele devendo)').toBe(1);
    }, 60_000);
  });

  describe('o balde por endereço sobrevive ao sono (L41b)', () => {
    // A hibernação zera a memória do objeto: quem esvaziasse o balde e parasse por 10 s o receberia cheio. Por isso o objeto não
    // dorme enquanto algum endereço deve ao balde. Uma instância à parte, sem sala (sala também o manteria acordado).
    let d: WranglerLocal;
    let c: ClienteWs | undefined;

    beforeAll(async () => {
      d = await subirWrangler({ persistir: join(raiz, 'estado-devendo'), assets, vars: { SEGREDO_ADMIN: SEGREDO, MENSAGENS_POR_IP: '30', MENSAGENS_POR_IP_S: '1' } });
    }, 180_000);

    afterAll(async () => {
      c?.derrubar();
      await d?.parar();
      saidas.push(...(d?.saida ?? []));
    }, 30_000);

    it('com o balde devendo o objeto não hiberna (a memória do balde ficaria zerada); sem dívida, como no teste de hibernação acima, ele dorme', async () => {
      const usoDeste = async (): Promise<Uso> => (await http<Uso>(d.base, 'GET', '/admin/uso', { codigo: SEGREDO })).corpo;
      const antes = await usoDeste();
      c = await ClienteWs.conectar(d.porta, 'Devedor');
      // 25 das 30 fichas (a conexão tem as 40 dela): o balde do endereço leva 25 s para encher de novo
      for (let t = 0; t < 25; t++) c.enviar({ tipo: 'ping', t });
      await c.esperar((m) => m.tipo === 'pong' && m.t === 24);
      // quinze segundos sem requisição nem sala: sem a dívida o workerd teria hibernado o objeto (14 s bastam no teste acima)
      await dormir(15_000);
      const depois = await usoDeste();
      expect(depois.soquetes.enderecosComBalde, 'o balde do endereço ainda está na memória, devendo').toBe(1);
      expect(depois.acordouEm, 'e é a mesma instância do objeto: ele não dormiu').toBe(antes.acordouEm);
    }, 90_000);
  });

  describe('o balão no workerd (L47): compra, aparência no fio, exportação e importação', () => {
    // Outra instância, sem nada das outras: o arquivo que ela importa é o formato ATUAL da sala Node (sem balão), então a migração
    // roda no SQLite do Durable Object de verdade (carteira antiga = padrão + nenhum item, saldo intacto).
    let d: WranglerLocal;
    const abertos: ClienteWs[] = [];
    const persistirD = join(raiz, 'estado-balao');
    const subirD = (): Promise<WranglerLocal> => subirWrangler({ persistir: persistirD, assets, vars: { SEGREDO_ADMIN: SEGREDO } });
    const COM_VERSAO = { [CABECALHO_DO_PROTOCOLO]: String(PROTOCOLO_VERSAO) };
    const loja = <T = Carteira>(metodo: 'GET' | 'POST', caminho: string, codigo: string, corpo?: object, versao: boolean = true) =>
      http<T>(d.base, metodo, caminho, { codigo, ...(corpo ? { corpo } : {}), ...(versao ? { cabecalhos: COM_VERSAO } : {}) });
    const admin = (metodo: 'GET' | 'POST', caminho: string, corpo?: string) => http(d.base, metodo, caminho, { codigo: SEGREDO, ...(corpo !== undefined ? { corpo } : {}) });
    const conectarD = async (nome: string): Promise<ClienteWs> => {
      const c = await ClienteWs.conectar(d.porta, nome);
      abertos.push(c);
      return c;
    };

    beforeAll(async () => {
      d = await subirD();
    }, 180_000);

    afterAll(async () => {
      for (const c of abertos) c.derrubar();
      await d?.parar();
      saidas.push(...(d?.saida ?? []));
    }, 30_000);

    it('carteira antiga migra para o padrão; compra e equipar pelo HTTP; a aparência chega ao outro cliente (e não ao da 9); exportar e importar de volta desfaz um desastre; o balão sobrevive a reiniciar', async () => {
      // ---- 1. o arquivo da sala Node (formato de agora, sem `balao`) entra no objeto
      const pasta = join(raiz, 'sala-node-balao');
      const node = new ArmazemDeCarteiras({ pasta, maxCarteiras: 100, atrasoMs: 1, relogio: Date.now, log: () => {}, presenteDeTeste: undefined });
      const [a, b] = [node.criar()!, node.criar()!];
      node.aplicar([{ id: a.id, delta: 4900 }]);
      const antesDeTudo = node.ler(a.id)!;
      await node.fechar();
      const texto = readFileSync(join(pasta, 'carteiras.json'), 'utf8');
      expect(texto, 'o arquivo de antes não tem balão').not.toContain('balao');
      const importada = await admin('POST', '/admin/importar-carteiras', texto);
      expect(importada.status, importada.bruto).toBe(200);

      // ---- 2. a migração: padrão, nenhum item pago e o saldo de antes; o cliente da 9 (sem o cabeçalho) não vê `balao`
      const migrada = await loja('GET', '/carteira', a.codigo);
      expect(migrada.status).toBe(200);
      expect(migrada.corpo.saldo).toBe(antesDeTudo.saldo);
      expect(migrada.corpo.balao).toEqual({ aparencia: APARENCIA_PADRAO, itens: ['olho_normal', 'castanho'] });
      const comoA9 = await loja('GET', '/carteira', a.codigo, undefined, false);
      expect(Object.keys(comoA9.corpo)).not.toContain('balao');
      expect(comoA9.corpo.saldo).toBe(antesDeTudo.saldo);

      // ---- 3. compra (tudo ou nada) e equipar (só o que tem) pelo HTTP do Worker
      let saldo = antesDeTudo.saldo;
      for (const item of ['coroa', 'bigodao', 'dourado']) {
        const r = await loja('POST', '/carteira/balao/comprar', a.codigo, { item });
        expect(r.status, `${item}: ${r.bruto}`).toBe(200);
        saldo = r.corpo.saldo;
      }
      expect(saldo).toBe(antesDeTudo.saldo - 500 - 120 - 80);
      const repetida = await loja<{ erro: string }>('POST', '/carteira/balao/comprar', a.codigo, { item: 'coroa' });
      expect(repetida).toMatchObject({ status: 409, corpo: { erro: 'ja-tem' } });
      const pobre = await loja<{ erro: string }>('POST', '/carteira/balao/comprar', b.codigo, { item: 'coroa' });
      expect(pobre).toMatchObject({ status: 402, corpo: { erro: 'saldo-insuficiente' } });
      expect((await loja('GET', '/carteira', b.codigo)).corpo.saldo, 'a recusa não cobrou nada').toBe(SALDO_INICIAL);
      const semPosse = await loja<{ erro: string }>('POST', '/carteira/balao/equipar', b.codigo, { aparencia: { ...APARENCIA_PADRAO, chapeu: 'coroa' } });
      expect(semPosse).toMatchObject({ status: 409, corpo: { erro: 'nao-tem' } });
      const ENFEITADA: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_normal', corDosOlhos: 'dourado' };
      const equipou = await loja('POST', '/carteira/balao/equipar', a.codigo, { aparencia: ENFEITADA });
      expect(equipou.status, equipou.bruto).toBe(200);
      expect(equipou.corpo.balao?.aparencia).toEqual(ENFEITADA);

      // ---- 4. a cópia de segurança: exportar, e "o desastre" desfeito importando a cópia por cima (sem salas abertas)
      const exportada = await admin('GET', '/admin/exportar-carteiras');
      expect(exportada.status).toBe(200);
      expect(exportada.cabecalhos.get('cache-control')).toBe('no-store');
      for (const codigo of [a.codigo, b.codigo]) expect(exportada.bruto, 'a cópia não leva o código de ninguém').not.toContain(codigo);
      const copia = JSON.parse(exportada.bruto) as {
        versao: number;
        carteiras: Record<string, Record<string, unknown>>;
        baloes: Record<string, { itens: string[]; aparencia: AparenciaDoBalao }>;
        carteiras_descartadas: unknown[];
      };
      expect(copia.versao).toBe(2);
      expect(Object.keys(copia.carteiras)).toHaveLength(2);
      for (const linha of Object.values(copia.carteiras)) expect(Object.keys(linha), 'a linha da carteira nunca leva o balão (a versão anterior a descartaria)').not.toContain('balao');
      expect(Object.keys(copia.baloes), 'o balão vai à parte, só de quem o tem').toEqual([a.id]);
      expect(copia.baloes[a.id]).toMatchObject({ aparencia: ENFEITADA });
      expect(copia.carteiras_descartadas).toEqual([]);
      expect((await http(d.base, 'GET', '/admin/exportar-carteiras')).status, 'sem o segredo não entrega').toBe(401);
      expect((await http(d.base, 'POST', '/admin/exportar-carteiras', { codigo: SEGREDO })).status).toBe(405);

      // um "desastre": mais uma compra depois da cópia; importar a cópia com `sobrescrever` volta ao que era
      const depoisDaCopia = await loja('POST', '/carteira/balao/comprar', a.codigo, { item: 'cartola' });
      expect(depoisDaCopia.status).toBe(200);
      expect(depoisDaCopia.corpo.saldo).toBe(saldo - 260);
      const restaurada = await admin('POST', '/admin/importar-carteiras?sobrescrever=1', exportada.bruto);
      expect(restaurada.status, restaurada.bruto).toBe(200);
      expect(restaurada.corpo).toMatchObject({ ok: true, importadas: 2, substituidas: 2 });
      const voltou = await loja('GET', '/carteira', a.codigo);
      expect(voltou.corpo.saldo).toBe(saldo);
      expect(voltou.corpo.balao).toEqual({ aparencia: ENFEITADA, itens: ['coroa', 'bigodao', 'olho_normal', 'castanho', 'dourado'] });

      // ---- 5. na sala: o cliente da 10 vê o balão de cada um e a troca no meio da partida; o da 9 não recebe nada do balão
      const ana = await conectarD('Ana'); // versão 10
      const beto = await conectarD('Beto'); // versão 9
      ana.criar('1x1', SEM_LIMITE, undefined, undefined, { carteira: a.codigo });
      const bv = await ana.esperarTipo('boas-vindas');
      beto.enviar({ tipo: 'entrar', versao: PROTOCOLO_VERSAO_MINIMA, codigo: bv.codigo, nome: 'Beto', carteira: b.codigo });
      expect((await beto.esperarTipo('boas-vindas')).versao).toBe(PROTOCOLO_VERSAO_MINIMA);
      const ve = await ana.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');
      if (ve.tipo !== 'estado-sala') throw new Error('impossível');
      expect(ve.lugares.map((l) => l.aparencia)).toEqual([ENFEITADA, APARENCIA_PADRAO, null, null]);
      await beto.esperar((m) => m.tipo === 'estado-sala' && m.lugares[1]!.nome === 'Beto');

      ana.enviar({ tipo: 'iniciar' });
      await Promise.all([ana, beto].map((c) => c.esperar((m) => m.tipo === 'retrato' && m.motivo === 'inicio')));
      const marcas = [ana.recebidas.length, beto.recebidas.length];
      const OUTRA: AparenciaDoBalao = { chapeu: 'coroa', bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' };
      expect((await loja('POST', '/carteira/balao/equipar', a.codigo, { aparencia: OUTRA })).status).toBe(200);
      await depoisDe(ana, marcas[0]!, (m) => m.tipo === 'estado-sala' && m.fase === 'jogando' && m.lugares[0]!.aparencia?.bigode === null);
      await depoisDe(beto, marcas[1]!, (m) => m.tipo === 'estado-sala' && m.fase === 'jogando');
      expect(beto.brutos.length).toBeGreaterThan(0);
      expect(beto.brutos.join('\n'), 'o cliente da 9 não recebe nada do balão').not.toContain('aparencia');
      for (const c of [ana, beto]) expect(c.invalidas, c.nome).toEqual([]);

      // ---- 6. reiniciar o objeto: o balão equipado está no SQLite e volta, com os itens
      for (const c of abertos.splice(0)) c.derrubar();
      await d.parar();
      saidas.push(...d.saida);
      d = await subirD();
      const reiniciada = await loja('GET', '/carteira', a.codigo);
      expect(reiniciada.corpo.saldo).toBe(saldo);
      expect(reiniciada.corpo.balao).toEqual({ aparencia: OUTRA, itens: ['coroa', 'bigodao', 'olho_normal', 'castanho', 'dourado'] });
      expect((await loja('GET', '/carteira', b.codigo)).corpo.balao).toEqual({ aparencia: APARENCIA_PADRAO, itens: ['olho_normal', 'castanho'] });

      // ---- 7. as descartadas (L47b): a rota existe só com o segredo e, sem nada descartado, a lista é vazia; a exportação de depois leva o mesmo balão
      expect((await http(d.base, 'GET', '/admin/carteiras-descartadas')).status).toBe(401);
      const descartadas = await admin('GET', '/admin/carteiras-descartadas');
      expect(descartadas.status).toBe(200);
      expect(JSON.parse(descartadas.bruto)).toEqual({ carteiras_descartadas: [] });
      const depois = JSON.parse((await admin('GET', '/admin/exportar-carteiras')).bruto) as { baloes: Record<string, { aparencia: AparenciaDoBalao }> };
      expect(depois.baloes[a.id]!.aparencia).toEqual(OUTRA);
    }, 300_000);
  });

  it('nem os logs do Worker nem o do wrangler levam código de carteira nem o segredo da administração', async () => {
    const tudo = [...saidas, ...w.saida].join('');
    expect(tudo.length).toBeGreaterThan(0);
    expect(tudo, 'o registro do Worker saiu no stdout').toContain('"evento":"sala-acordou"');
    expect(tudo).not.toContain(SEGREDO);
    // os códigos são hexadecimais longos: nenhum texto de 32+ caracteres hexadecimais seguidos pode ter ido a log
    expect(tudo).not.toMatch(/\b[0-9a-f]{32,}\b/i);
  });
});
