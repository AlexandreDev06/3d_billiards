import { SALDO_INICIAL, SKINS_DE_TACO, ehCodigoDeCarteira, precoDaSkin, type CodigoErroCarteira, type EstadoCarteira, type MissoesDoDia, type SkinTaco } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { AVISO_PRECO_MUDOU, CarteiraDoAparelho, CHAVE_DA_CARTEIRA, textoDoErroDaCarteira, type PedidoHttp, type RespostaHttp } from './carteira';
import { ArmazenamentoFalso, RelogioFalso } from './para-testes';

const letra = (n: number): string => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[n % 64]!;
/** Um código com a forma que a sala cria (43 caracteres base64url), diferente a cada `n`. */
const codigoNumero = (n: number): string => Array.from({ length: 43 }, (_, i) => letra(n * 7 + i * 3)).join('');

interface Chamada {
  readonly url: string;
  readonly init: PedidoHttp;
}

/** Um servidor de carteiras de brincadeira: o que o `apps/sala` responde, no formato do protocolo. */
class ServidorFalso {
  readonly chamadas: Chamada[] = [];
  readonly carteiras = new Map<string, { saldo: number; skins: SkinTaco[]; skin: SkinTaco }>();
  proximo = 1;
  /** Faz o próximo pedido cair (rede fora). */
  cair = false;
  /** Substitui a resposta do próximo pedido. */
  proximaResposta: { status: number; corpo: unknown } | null = null;
  /** Nunca responde (a loja fica pendurada). */
  pendurar = false;

  criar(saldo = SALDO_INICIAL): string {
    const codigo = codigoNumero(this.proximo++);
    this.carteiras.set(codigo, { saldo, skins: ['classico'], skin: 'classico' });
    return codigo;
  }

  readonly pedir = async (url: string, init: PedidoHttp): Promise<RespostaHttp> => {
    this.chamadas.push({ url, init });
    if (this.pendurar) return new Promise<RespostaHttp>(() => {});
    if (this.cair) throw new TypeError('Failed to fetch');
    const resposta = (status: number, corpo: unknown): RespostaHttp => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
    if (this.proximaResposta) {
      const { status, corpo } = this.proximaResposta;
      this.proximaResposta = null;
      return resposta(status, corpo);
    }
    const erro = (codigo: CodigoErroCarteira, status: number): RespostaHttp => resposta(status, { erro: codigo, mensagem: 'texto do servidor' });
    if (url === '/carteira' && init.method === 'POST') {
      const codigo = this.criar();
      return resposta(201, { codigo, ...this.carteiras.get(codigo)! });
    }
    const codigo = /^Bearer (.+)$/.exec(init.headers.Authorization ?? '')?.[1];
    const carteira = codigo === undefined ? undefined : this.carteiras.get(codigo);
    if (!carteira) return erro('carteira-invalida', 401);
    if (url === '/carteira' && init.method === 'GET') return resposta(200, { ...carteira });
    const skin = (JSON.parse(init.body ?? '{}') as { skin: SkinTaco }).skin;
    const preco = precoDaSkin(skin);
    if (url === '/carteira/comprar') {
      if (carteira.skins.includes(skin)) return erro('ja-tem', 409);
      if (carteira.saldo < preco) return erro('saldo-insuficiente', 402);
      carteira.saldo -= preco;
      carteira.skins = SKINS_DE_TACO.map((s) => s.id).filter((id) => id === skin || carteira.skins.includes(id));
      return resposta(200, { ...carteira });
    }
    if (url === '/carteira/usar') {
      if (!carteira.skins.includes(skin)) return erro('nao-tem', 409);
      carteira.skin = skin;
      return resposta(200, { ...carteira });
    }
    return erro('requisicao-invalida', 404);
  };
}

function montar(opcoes: { armazenamento?: ArmazenamentoFalso | null } = {}) {
  const servidor = new ServidorFalso();
  const relogio = new RelogioFalso();
  const armazenamento = opcoes.armazenamento === undefined ? new ArmazenamentoFalso() : opcoes.armazenamento;
  const carteira = new CarteiraDoAparelho({ armazenamento, pedir: servidor.pedir, agendar: relogio.agendar, esperaMaximaMs: 5000 });
  return { servidor, relogio, armazenamento, carteira };
}

const guardado = (a: ArmazenamentoFalso): unknown => JSON.parse(a.getItem(CHAVE_DA_CARTEIRA) ?? 'null');

describe('CarteiraDoAparelho: o primeiro acesso', () => {
  it('sem código guardado, cria a carteira (POST sem corpo nem Bearer) e guarda o código com versão', async () => {
    const { servidor, carteira, armazenamento } = montar({});
    const r = await carteira.garantir();

    expect(r).toEqual({ ok: true, estado: { saldo: SALDO_INICIAL, skins: ['classico'], skin: 'classico' } });
    expect(servidor.chamadas).toHaveLength(1);
    expect(servidor.chamadas[0]!.url).toBe('/carteira');
    expect(servidor.chamadas[0]!.init.method).toBe('POST');
    expect(servidor.chamadas[0]!.init.body).toBeUndefined();
    expect(servidor.chamadas[0]!.init.headers.Authorization).toBeUndefined();
    const lido = guardado(armazenamento!) as { versao: number; codigo: string };
    expect(lido.versao).toBe(1);
    expect(ehCodigoDeCarteira(lido.codigo)).toBe(true);
    expect(carteira.codigo()).toBe(lido.codigo);
    expect(carteira.estado()).toEqual(r.ok ? r.estado : null);
    expect(carteira.aviso()).toBeNull();
  });

  it('com código guardado, só lê (GET com Bearer) e não cria outra', async () => {
    const t = montar({});
    const codigo = t.servidor.criar(70);
    t.armazenamento!.setItem(CHAVE_DA_CARTEIRA, JSON.stringify({ versao: 1, codigo }));

    const r = await t.carteira.garantir();

    expect(t.servidor.chamadas).toHaveLength(1);
    expect(t.servidor.chamadas[0]!.init.method).toBe('GET');
    expect(t.servidor.chamadas[0]!.init.headers.Authorization).toBe(`Bearer ${codigo}`);
    expect(r.ok && r.estado.saldo).toBe(70);
    expect(t.carteira.codigo()).toBe(codigo);
  });

  it('código guardado com formato errado ou versão antiga não serve: cria uma carteira nova e a guarda por cima', async () => {
    for (const lixo of ['não é json', JSON.stringify({ versao: 1, codigo: 'curto' }), JSON.stringify({ versao: 0, codigo: codigoNumero(40) }), JSON.stringify(null)]) {
      const t = montar({});
      t.armazenamento!.setItem(CHAVE_DA_CARTEIRA, lixo);
      const r = await t.carteira.garantir();
      expect(r.ok).toBe(true);
      expect(t.servidor.chamadas.map((c) => c.init.method)).toEqual(['POST']);
      expect(ehCodigoDeCarteira((guardado(t.armazenamento!) as { codigo: string }).codigo)).toBe(true);
      expect(t.carteira.aviso()).toBeNull();
    }
  });

  it('chamadas ao mesmo tempo fazem uma ida só ao servidor', async () => {
    const { servidor, carteira } = montar({});
    const [a, b, c] = await Promise.all([carteira.garantir(), carteira.garantir(), carteira.garantir()]);
    expect(servidor.chamadas).toHaveLength(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});

describe('CarteiraDoAparelho: o servidor perdeu a carteira', () => {
  it('carteira-invalida cria uma nova, troca o código guardado e deixa o aviso até ser dispensado', async () => {
    const t = montar({});
    const velho = codigoNumero(33);
    t.armazenamento!.setItem(CHAVE_DA_CARTEIRA, JSON.stringify({ versao: 1, codigo: velho }));

    const r = await t.carteira.garantir();

    expect(t.servidor.chamadas.map((c) => c.init.method)).toEqual(['GET', 'POST']);
    expect(r.ok && r.estado.saldo).toBe(SALDO_INICIAL);
    expect(t.carteira.codigo()).not.toBe(velho);
    expect((guardado(t.armazenamento!) as { codigo: string }).codigo).toBe(t.carteira.codigo());
    expect(t.carteira.aviso()).toBe('Sua carteira não existe mais neste servidor: começou uma nova com 100 moedas');
    t.carteira.dispensarAviso();
    expect(t.carteira.aviso()).toBeNull();
  });

  it('se não deu para criar a nova, não há aviso de carteira nova', async () => {
    const t = montar({});
    t.armazenamento!.setItem(CHAVE_DA_CARTEIRA, JSON.stringify({ versao: 1, codigo: codigoNumero(34) }));
    // o GET volta 401 de verdade; o POST seguinte cai
    const pedirReal = t.servidor.pedir;
    let n = 0;
    const carteira = new CarteiraDoAparelho({
      armazenamento: t.armazenamento,
      agendar: t.relogio.agendar,
      pedir: async (url, init) => {
        if (++n === 2) throw new TypeError('Failed to fetch');
        return pedirReal(url, init);
      },
    });
    const r = await carteira.garantir();
    expect(r).toMatchObject({ ok: false, erro: 'fora-do-ar' });
    expect(carteira.aviso()).toBeNull();
  });
});

describe('CarteiraDoAparelho: falhas de rede', () => {
  it('rede fora: fora-do-ar, o código guardado e o último estado seguem como estavam', async () => {
    const t = montar({});
    await t.carteira.garantir();
    const antes = t.carteira.estado();
    const codigo = t.carteira.codigo();
    t.servidor.cair = true;

    const r = await t.carteira.garantir();

    expect(r).toEqual({ ok: false, erro: 'fora-do-ar', mensagem: textoDoErroDaCarteira('fora-do-ar') });
    expect(t.carteira.estado()).toEqual(antes);
    expect(t.carteira.codigo()).toBe(codigo);
    expect((guardado(t.armazenamento!) as { codigo: string }).codigo).toBe(codigo);
  });

  it('corpo que não tem a forma do protocolo também é fora-do-ar (o servidor não é o nosso)', async () => {
    const t = montar({});
    t.servidor.proximaResposta = { status: 200, corpo: { saldo: 'muito', skins: [] } };
    const r = await t.carteira.garantir();
    expect(r).toMatchObject({ ok: false, erro: 'fora-do-ar' });
    expect(t.armazenamento!.getItem(CHAVE_DA_CARTEIRA)).toBeNull();
  });

  it('resposta que não é JSON é fora-do-ar', async () => {
    const t = montar({});
    const carteira = new CarteiraDoAparelho({
      armazenamento: t.armazenamento,
      agendar: t.relogio.agendar,
      pedir: async () => ({ ok: false, status: 502, json: async () => Promise.reject(new SyntaxError('Unexpected token <')) }),
    });
    expect(await carteira.garantir()).toMatchObject({ ok: false, erro: 'fora-do-ar' });
  });

  it('servidor que não responde: passado o prazo, fora-do-ar (e o pedido é abortado)', async () => {
    const t = montar({});
    t.servidor.pendurar = true;
    const resultado = t.carteira.garantir();
    t.relogio.avancar(4999);
    let acabou = false;
    void resultado.then(() => (acabou = true));
    await Promise.resolve();
    expect(acabou).toBe(false);
    t.relogio.avancar(1);
    expect(await resultado).toMatchObject({ ok: false, erro: 'fora-do-ar' });
    expect(t.servidor.chamadas[0]!.init.sinal?.aborted).toBe(true);
  });

  describe('o prazo vale por fase: cabeçalhos e depois corpo', () => {
    /** Um pedido à mão: quem testa decide quando chegam os cabeçalhos e quando chega o corpo. */
    function pedidoAMao() {
      const relogio = new RelogioFalso();
      let entregarCabecalhos!: (r: RespostaHttp) => void;
      let entregarCorpo!: (v: unknown) => void;
      const corpo = new Promise<unknown>((r) => (entregarCorpo = r));
      const carteira = new CarteiraDoAparelho({
        armazenamento: new ArmazenamentoFalso(),
        agendar: relogio.agendar,
        esperaMaximaMs: 5000,
        pedir: (_url, init) => {
          void init;
          return new Promise<RespostaHttp>((r) => (entregarCabecalhos = r));
        },
      });
      const cabecalhos = (): void => entregarCabecalhos({ ok: true, status: 201, json: () => corpo });
      const nova = { codigo: codigoNumero(1), saldo: SALDO_INICIAL, skins: ['classico'], skin: 'classico' };
      return { relogio, carteira, cabecalhos, entregarCorpo, nova };
    }
    const passarUmaVez = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

    it('os cabeçalhos chegaram a tempo e o corpo, depois do prazo do pedido, ainda vale (a página travou no meio)', async () => {
      const t = pedidoAMao();
      const resultado = t.carteira.garantir();
      t.relogio.avancar(3000);
      t.cabecalhos();
      await passarUmaVez();
      t.relogio.avancar(4000);
      t.entregarCorpo(t.nova);
      expect(await resultado).toMatchObject({ ok: true });
      expect(t.carteira.estado()).toMatchObject({ saldo: SALDO_INICIAL });
    });

    it('corpo que nunca vem: o prazo é contado dos cabeçalhos, e o pedido é abortado', async () => {
      const t = pedidoAMao();
      const resultado = t.carteira.garantir();
      t.cabecalhos();
      await passarUmaVez();
      t.relogio.avancar(4999);
      let acabou = false;
      void resultado.then(() => (acabou = true));
      await passarUmaVez();
      expect(acabou).toBe(false);
      t.relogio.avancar(1);
      expect(await resultado).toMatchObject({ ok: false, erro: 'fora-do-ar' });
    });

    it('terminado o pedido não sobra relógio agendado', async () => {
      const t = pedidoAMao();
      const resultado = t.carteira.garantir();
      t.cabecalhos();
      await passarUmaVez();
      t.entregarCorpo(t.nova);
      await resultado;
      expect(t.relogio.pendentes).toBe(0);
    });
  });

  it('depois de falhar, a próxima tentativa vai ao servidor de novo', async () => {
    const t = montar({});
    t.servidor.cair = true;
    await t.carteira.garantir();
    t.servidor.cair = false;
    expect((await t.carteira.garantir()).ok).toBe(true);
  });

  it('limite ao criar: o texto fala em esperar', async () => {
    const t = montar({});
    t.servidor.proximaResposta = { status: 429, corpo: { erro: 'limite', mensagem: 'Calma' } };
    const r = await t.carteira.garantir();
    expect(r).toEqual({ ok: false, erro: 'limite', mensagem: textoDoErroDaCarteira('limite') });
    expect(textoDoErroDaCarteira('limite')).toMatch(/daqui a pouco|mais tarde/i);
  });
});

describe('CarteiraDoAparelho: armazenamento bloqueado', () => {
  it('sem localStorage a carteira vale nesta página (em memória) e diz que não fica guardada', async () => {
    const t = montar({ armazenamento: null });
    const r = await t.carteira.garantir();
    expect(r.ok).toBe(true);
    expect(t.carteira.codigo()).toBeDefined();
    expect(t.carteira.guardada()).toBe(false);
    // a segunda vez lê, não cria outra
    await t.carteira.garantir();
    expect(t.servidor.chamadas.map((c) => c.init.method)).toEqual(['POST', 'GET']);
  });

  it('com localStorage, guardada() é verdadeiro', async () => {
    const t = montar({});
    await t.carteira.garantir();
    expect(t.carteira.guardada()).toBe(true);
  });
});

describe('CarteiraDoAparelho: a loja', () => {
  it('comprar manda a skin em JSON com o Bearer e adota o estado que volta', async () => {
    const t = montar({});
    await t.carteira.garantir();
    const r = await t.carteira.comprar('ebano');

    const chamada = t.servidor.chamadas.at(-1)!;
    expect(chamada.url).toBe('/carteira/comprar');
    expect(chamada.init.method).toBe('POST');
    expect(chamada.init.headers['Content-Type']).toBe('application/json');
    expect(chamada.init.headers.Authorization).toBe(`Bearer ${t.carteira.codigo()}`);
    expect(JSON.parse(chamada.init.body!)).toEqual({ skin: 'ebano' });
    expect(r.ok && r.estado).toEqual({ saldo: 50, skins: ['classico', 'ebano'], skin: 'classico' });
    expect(t.carteira.estado()?.saldo).toBe(50);
  });

  it('saldo curto: "faltam N moedas" calculado do estado que o aparelho tem', async () => {
    const t = montar({});
    await t.carteira.garantir();
    const r = await t.carteira.comprar('neon');
    expect(r).toEqual({ ok: false, erro: 'saldo-insuficiente', mensagem: 'Saldo insuficiente: faltam 200 moedas.' });
    expect(t.carteira.estado()?.saldo).toBe(SALDO_INICIAL);
  });

  it('comprar sem ter lido a carteira lê antes (a loja aberta direto)', async () => {
    const t = montar({});
    const r = await t.carteira.comprar('ebano');
    expect(t.servidor.chamadas.map((c) => `${c.init.method} ${c.url}`)).toEqual(['POST /carteira', 'POST /carteira/comprar']);
    expect(r.ok).toBe(true);
  });

  it('ja-tem e nao-tem viram frases em português', async () => {
    const t = montar({});
    await t.carteira.garantir();
    expect(await t.carteira.comprar('classico')).toMatchObject({ ok: false, erro: 'ja-tem', mensagem: 'Você já tem essa skin.' });
    expect(await t.carteira.usar('ouro')).toMatchObject({ ok: false, erro: 'nao-tem', mensagem: 'Você ainda não tem essa skin.' });
  });

  it('usar troca a skin em uso', async () => {
    const t = montar({});
    await t.carteira.garantir();
    await t.carteira.comprar('ebano');
    const r = await t.carteira.usar('ebano');
    expect(r.ok && r.estado.skin).toBe('ebano');
    expect(t.carteira.estado()?.skin).toBe('ebano');
  });

  it('skin que não é do catálogo nem chega à rede', async () => {
    const t = montar({});
    await t.carteira.garantir();
    const antes = t.servidor.chamadas.length;
    const r = await t.carteira.comprar('arco-iris' as SkinTaco);
    expect(r).toMatchObject({ ok: false, erro: 'skin-invalida' });
    expect(t.servidor.chamadas).toHaveLength(antes);
  });

  it('L34b: comprar com o preço mostrado manda `preco` no pedido; usar nunca manda; preço que não é inteiro positivo nem vai', async () => {
    const t = montar({});
    await t.carteira.garantir();
    await t.carteira.comprar('ebano', 40);
    expect(JSON.parse(t.servidor.chamadas.at(-1)!.init.body!)).toEqual({ skin: 'ebano', preco: 40 });
    for (const ruim of [0, -5, 3.5, Number.NaN]) {
      await t.carteira.comprar('boteco', ruim);
      expect(JSON.parse(t.servidor.chamadas.at(-1)!.init.body!), String(ruim)).toEqual({ skin: 'boteco' });
    }
    await t.carteira.usar('ebano');
    expect(JSON.parse(t.servidor.chamadas.at(-1)!.init.body!)).toEqual({ skin: 'ebano' });
  });

  it('L34b: `preco-mudou` não cobra, relê a carteira (o estado novo já está em `estado()`) e avisa "O preço mudou, confira de novo."', async () => {
    const t = montar({});
    await t.carteira.garantir();
    t.servidor.carteiras.get(t.carteira.codigo()!)!.saldo = 77;
    t.servidor.proximaResposta = { status: 409, corpo: { erro: 'preco-mudou', mensagem: 'texto do servidor' } };
    const antes = t.servidor.chamadas.length;
    const r = await t.carteira.comprar('ouro', 400);
    expect(r).toMatchObject({ ok: false, erro: 'preco-mudou', mensagem: AVISO_PRECO_MUDOU });
    expect(AVISO_PRECO_MUDOU).toContain('O preço mudou, confira de novo');
    expect(t.servidor.chamadas.slice(antes).map((c) => `${c.init.method} ${c.url}`)).toEqual(['POST /carteira/comprar', 'GET /carteira']);
    expect(t.carteira.estado()?.saldo).toBe(77);
    expect(t.carteira.estado()?.skins).toEqual(['classico']);
  });

  it('rede fora na compra: fora-do-ar e o saldo não muda', async () => {
    const t = montar({});
    await t.carteira.garantir();
    t.servidor.cair = true;
    expect(await t.carteira.comprar('ebano')).toMatchObject({ ok: false, erro: 'fora-do-ar' });
    expect(t.carteira.estado()?.saldo).toBe(SALDO_INICIAL);
  });

  it('avisa os ouvintes quando o estado muda e deixa de avisar depois de cancelado', async () => {
    const t = montar({});
    const vistos: (EstadoCarteira | null)[] = [];
    const cancelar = t.carteira.aoMudar((e) => vistos.push(e));
    await t.carteira.garantir();
    await t.carteira.comprar('ebano');
    expect(vistos.map((e) => e?.saldo)).toEqual([100, 50]);
    cancelar();
    await t.carteira.usar('ebano');
    expect(vistos).toHaveLength(2);
  });
});

describe('CarteiraDoAparelho: as missões do dia (L32)', () => {
  const quadro: MissoesDoDia = {
    dia: '2026-10-26',
    fimMs: Date.parse('2026-10-27T03:00:00Z'),
    itens: [
      { id: 'pelo-meio', progresso: 1, meta: 2, cumprida: false },
      { id: 'fecha-a-conta', progresso: 0, meta: 1, cumprida: false },
      { id: 'volta-ao-mundo', progresso: 0, meta: 1, cumprida: false },
    ],
  };

  it('o quadro que a sala mandou entra no estado e avisa os ouvintes, sem mexer em saldo nem skins', async () => {
    const t = montar({});
    await t.carteira.garantir();
    const vistos: (EstadoCarteira | null)[] = [];
    t.carteira.aoMudar((e) => vistos.push(e));
    t.carteira.adotarMissoes(quadro);
    expect(t.carteira.estado()).toEqual({ saldo: SALDO_INICIAL, skins: ['classico'], skin: 'classico', missoes: quadro });
    expect(vistos).toHaveLength(1);
    expect(t.servidor.chamadas).toHaveLength(1);
  });

  it('sem a carteira lida não há onde guardar, e nada avisa', () => {
    const t = montar({});
    let avisos = 0;
    t.carteira.aoMudar(() => avisos++);
    t.carteira.adotarMissoes(quadro);
    expect(t.carteira.estado()).toBeNull();
    expect(avisos).toBe(0);
  });
});

describe('CarteiraDoAparelho: o código é segredo', () => {
  it('não aparece ao serializar o objeto nem em nenhuma mensagem de erro ou aviso', async () => {
    const t = montar({});
    t.armazenamento!.setItem(CHAVE_DA_CARTEIRA, JSON.stringify({ versao: 1, codigo: codigoNumero(35) }));
    await t.carteira.garantir();
    const codigo = t.carteira.codigo()!;
    t.servidor.cair = true;
    const resultados = [await t.carteira.garantir(), await t.carteira.comprar('ebano'), await t.carteira.usar('ebano')];
    const tudo = JSON.stringify([t.carteira, resultados, t.carteira.aviso(), t.carteira.estado()]);
    expect(tudo).not.toContain(codigo);
  });
});

describe('CarteiraDoAparelho: levar a carteira para outro aparelho (L43)', () => {
  const BASE = 'https://sinuca.exemplo/';

  it('tem() diz se há código guardado, sem mostrá-lo', async () => {
    const t = montar({});
    expect(t.carteira.tem()).toBe(false);
    await t.carteira.garantir();
    expect(t.carteira.tem()).toBe(true);
  });

  it('linkParaLevar monta `base#carteira=CODIGO` (fragmento, nunca busca) e é null sem carteira', async () => {
    const t = montar({});
    expect(t.carteira.linkParaLevar(BASE)).toBeNull();
    await t.carteira.garantir();
    const codigo = t.carteira.codigo()!;
    const link = t.carteira.linkParaLevar(BASE)!;
    expect(link).toBe(`${BASE}#carteira=${codigo}`);
    expect(new URL(link).search).toBe('');
  });

  it('conferir pergunta à sala com o Bearer DO LINK e não mexe em nada do aparelho', async () => {
    const t = montar({});
    await t.carteira.garantir();
    const minha = t.carteira.codigo()!;
    const estadoAntes = t.carteira.estado();
    const outra = t.servidor.criar(250);
    let avisos = 0;
    t.carteira.aoMudar(() => void avisos++);
    t.servidor.chamadas.length = 0;

    const c = await t.carteira.conferir(outra);

    expect(c.ok && c.estado.saldo).toBe(250);
    expect(c.ok && c.mesma).toBe(false);
    expect(t.servidor.chamadas).toHaveLength(1);
    expect(t.servidor.chamadas[0]!.url).toBe('/carteira');
    expect(t.servidor.chamadas[0]!.init.method).toBe('GET');
    expect(t.servidor.chamadas[0]!.init.headers.Authorization).toBe(`Bearer ${outra}`);
    expect(t.carteira.codigo()).toBe(minha);
    expect(t.carteira.estado()).toEqual(estadoAntes);
    expect((guardado(t.armazenamento!) as { codigo: string }).codigo).toBe(minha);
    expect(avisos).toBe(0);
  });

  it('conferir o código que o aparelho já usa diz `mesma`', async () => {
    const t = montar({});
    await t.carteira.garantir();
    const c = await t.carteira.conferir(t.carteira.codigo()!);
    expect(c.ok && c.mesma).toBe(true);
  });

  it('código que a sala não conhece: carteira-invalida, e o aparelho NÃO cria carteira nova nem troca o código', async () => {
    const t = montar({});
    await t.carteira.garantir();
    const minha = t.carteira.codigo()!;
    t.servidor.chamadas.length = 0;

    const c = await t.carteira.conferir(codigoNumero(60));

    expect(c).toMatchObject({ ok: false, erro: 'carteira-invalida' });
    expect(t.servidor.chamadas.map((x) => x.init.method)).toEqual(['GET']);
    expect(t.carteira.codigo()).toBe(minha);
    expect(t.carteira.aviso()).toBeNull();
  });

  it('código com a forma errada nem vai à rede', async () => {
    const t = montar({});
    const c = await t.carteira.conferir('curto');
    expect(c).toMatchObject({ ok: false, erro: 'carteira-invalida' });
    expect(t.servidor.chamadas).toHaveLength(0);
  });

  it('rede fora ao conferir: fora-do-ar, e nada muda', async () => {
    const t = montar({});
    await t.carteira.garantir();
    const minha = t.carteira.codigo()!;
    const outra = t.servidor.criar(250);
    t.servidor.cair = true;
    const c = await t.carteira.conferir(outra);
    expect(c).toMatchObject({ ok: false, erro: 'fora-do-ar' });
    expect(t.carteira.codigo()).toBe(minha);
  });

  it('usar() adota o código e o estado da sala, guarda no aparelho, avisa os ouvintes e esquece o recado de carteira nova', async () => {
    const t = montar({});
    await t.carteira.garantir();
    const velha = t.carteira.codigo()!;
    const outra = t.servidor.criar(250);
    const vistos: (number | null)[] = [];
    t.carteira.aoMudar((e) => void vistos.push(e?.saldo ?? null));

    const c = await t.carteira.conferir(outra);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(t.carteira.codigo()).toBe(velha); // conferir não trocou; só o usar() troca
    c.usar();

    expect(t.carteira.codigo()).toBe(outra);
    expect(t.carteira.estado()?.saldo).toBe(250);
    expect(t.carteira.guardada()).toBe(true);
    expect((guardado(t.armazenamento!) as { versao: number; codigo: string })).toEqual({ versao: 1, codigo: outra });
    expect(vistos).toEqual([250]);
    expect(t.carteira.aviso()).toBeNull();

    // e o que vier depois usa a carteira nova
    t.servidor.chamadas.length = 0;
    await t.carteira.garantir();
    expect(t.servidor.chamadas[0]!.init.headers.Authorization).toBe(`Bearer ${outra}`);
  });

  it('o resultado da conferência não carrega o código (nem serializado)', async () => {
    const t = montar({});
    const outra = t.servidor.criar(250);
    const c = await t.carteira.conferir(outra);
    expect(JSON.stringify(c)).not.toContain(outra);
  });

  it('aparelho sem carteira: conferir não cria uma; usar() faz o código do link ser o dele', async () => {
    const t = montar({});
    const outra = t.servidor.criar(250);
    const c = await t.carteira.conferir(outra);
    expect(t.servidor.chamadas.map((x) => x.init.method)).toEqual(['GET']);
    expect(t.carteira.tem()).toBe(false);
    if (c.ok) c.usar();
    expect(t.carteira.tem()).toBe(true);
    expect(t.carteira.codigo()).toBe(outra);
  });

  it('uma leitura da carteira antiga que ainda estava a caminho NÃO sobrescreve a carteira nova', async () => {
    const t = montar({});
    await t.carteira.garantir();
    const velha = t.carteira.codigo()!;
    const outra = t.servidor.criar(250);
    // a próxima leitura (com o código velho) fica presa até eu soltar
    let soltar: () => void = () => {};
    const resposta = { ok: true, status: 200, json: async () => ({ saldo: 999, skins: ['classico'], skin: 'classico' }) };
    const original = t.servidor.pedir;
    let presa = true;
    const carteira = new CarteiraDoAparelho({
      armazenamento: t.armazenamento,
      agendar: t.relogio.agendar,
      pedir: (url, init) => {
        if (presa && init.headers.Authorization === `Bearer ${velha}`) {
          presa = false;
          return new Promise<RespostaHttp>((resolver) => (soltar = () => resolver(resposta)));
        }
        return original(url, init);
      },
    });
    const voando = carteira.garantir();
    const c = await carteira.conferir(outra);
    expect(c.ok).toBe(true);
    if (c.ok) c.usar();
    expect(carteira.estado()?.saldo).toBe(250);

    soltar();
    const r = await voando;

    expect(r.ok).toBe(false); // a resposta da carteira de antes não vale
    expect(carteira.estado()?.saldo).toBe(250);
    expect(carteira.codigo()).toBe(outra);
  });

  it('usar() de uma conferência velha demais (a carteira já foi trocada por outra) não faz nada', async () => {
    const t = montar({});
    const a = t.servidor.criar(111);
    const b = t.servidor.criar(222);
    const ca = await t.carteira.conferir(a);
    const cb = await t.carteira.conferir(b);
    if (cb.ok) cb.usar();
    if (ca.ok) ca.usar();
    expect(t.carteira.codigo()).toBe(b);
    expect(t.carteira.estado()?.saldo).toBe(222);
  });
});

describe('textoDoErroDaCarteira', () => {
  it('todo código tem uma frase em português, sem o texto cru do servidor', () => {
    const codigos: (CodigoErroCarteira | 'fora-do-ar')[] = ['carteira-invalida', 'saldo-insuficiente', 'skin-invalida', 'ja-tem', 'nao-tem', 'preco-mudou', 'item-invalido', 'aparencia-invalida', 'limite', 'requisicao-invalida', 'fora-do-ar'];
    for (const c of codigos) expect(textoDoErroDaCarteira(c).length).toBeGreaterThan(10);
    expect(textoDoErroDaCarteira('fora-do-ar')).toBe('A loja está fora do ar agora. O jogo segue sem ela.');
  });
});
