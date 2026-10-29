import { SALDO_INICIAL, ehCodigoDeCarteira, type EstadoCarteira } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import type { ConferenciaDaCarteira, ResultadoDaCarteira } from './carteira';
import {
  AVISO_LINK_DESCONHECIDO,
  AVISO_LINK_FORA_DO_AR,
  AVISO_LINK_INVALIDO,
  TITULO_DA_PERGUNTA,
  baseDoLink,
  linkDaCarteira,
  lerFragmentoDaCarteira,
  perguntaDaTroca,
  receberCarteiraDoLink,
  resumoDaCarteira,
  type CarteiraDoLink,
  type PerguntaDeCarteira,
} from './levar-carteira';

const letra = (n: number): string => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[n % 64]!;
const codigoNumero = (n: number): string => Array.from({ length: 43 }, (_, i) => letra(n * 7 + i * 3)).join('');
const CODIGO = codigoNumero(5);
const estado = (parcial: Partial<EstadoCarteira> = {}): EstadoCarteira => ({ saldo: SALDO_INICIAL, skins: ['classico'], skin: 'classico', ...parcial });

describe('o link da carteira', () => {
  it('o código vai no FRAGMENTO, nunca na busca', () => {
    const link = linkDaCarteira('https://sinuca.exemplo/', CODIGO);
    expect(link).toBe(`https://sinuca.exemplo/#carteira=${CODIGO}`);
    expect(new URL(link).search).toBe('');
    expect(new URL(link).hash).toBe(`#carteira=${CODIGO}`);
    expect(ehCodigoDeCarteira(CODIGO)).toBe(true);
  });

  it('a base é o endereço da página sem busca nem fragmento', () => {
    expect(baseDoLink({ origin: 'http://127.0.0.1:8001', pathname: '/' })).toBe('http://127.0.0.1:8001/');
    expect(baseDoLink({ origin: 'https://abc.ngrok.app/', pathname: '/jogo/' })).toBe('https://abc.ngrok.app/jogo/');
    expect(linkDaCarteira('https://x.app/?sala=K7M2P&dev=1#velho', CODIGO)).toBe(`https://x.app/#carteira=${CODIGO}`);
  });

  it('o que o link gera, a leitura devolve', () => {
    const lido = lerFragmentoDaCarteira(new URL(linkDaCarteira('https://x.app/', CODIGO)).hash);
    expect(lido).toEqual({ tipo: 'codigo', codigo: CODIGO, resto: '' });
  });
});

describe('lerFragmentoDaCarteira', () => {
  it('sem fragmento, ou com um que não é da carteira: nenhum', () => {
    expect(lerFragmentoDaCarteira('')).toEqual({ tipo: 'nenhum' });
    expect(lerFragmentoDaCarteira('#')).toEqual({ tipo: 'nenhum' });
    expect(lerFragmentoDaCarteira('#secao')).toEqual({ tipo: 'nenhum' });
    expect(lerFragmentoDaCarteira('#outra=coisa')).toEqual({ tipo: 'nenhum' });
    expect(lerFragmentoDaCarteira('#carteiras=xyz')).toEqual({ tipo: 'nenhum' });
  });

  it('o código sai do fragmento e o resto dele fica', () => {
    expect(lerFragmentoDaCarteira(`#carteira=${CODIGO}`)).toEqual({ tipo: 'codigo', codigo: CODIGO, resto: '' });
    expect(lerFragmentoDaCarteira(`#a=1&carteira=${CODIGO}&b=2`)).toEqual({ tipo: 'codigo', codigo: CODIGO, resto: '#a=1&b=2' });
    expect(lerFragmentoDaCarteira(`carteira=${CODIGO}`)).toEqual({ tipo: 'codigo', codigo: CODIGO, resto: '' });
  });

  it('código com a forma errada é inválido: vazio, curto, longo, com caractere de fora', () => {
    const invalidos = ['#carteira=', '#carteira', '#carteira=abc', `#carteira=${CODIGO}x`, `#carteira=${CODIGO.slice(1)}`, `#carteira=${CODIGO.slice(0, 42)}!`, `#carteira=${CODIGO.slice(0, 42)}%20`];
    for (const hash of invalidos) expect(lerFragmentoDaCarteira(hash), hash).toMatchObject({ tipo: 'invalido', resto: '' });
  });

  it('o inválido também devolve o resto do fragmento, sem o pedaço da carteira', () => {
    expect(lerFragmentoDaCarteira('#x=1&carteira=lixo')).toEqual({ tipo: 'invalido', resto: '#x=1' });
  });

  it('só o primeiro carteira= vale, e todos saem do endereço', () => {
    const outro = codigoNumero(9);
    expect(lerFragmentoDaCarteira(`#carteira=${CODIGO}&carteira=${outro}`)).toEqual({ tipo: 'codigo', codigo: CODIGO, resto: '' });
  });
});

describe('perguntaDaTroca', () => {
  it('mostra o saldo do link e o da atual, e avisa que a atual fica esquecida', () => {
    const p = perguntaDaTroca(estado({ saldo: 250, skins: ['classico', 'ebano'] }), estado({ saldo: 100 }), true);
    expect(p.titulo).toBe('Usar esta carteira neste aparelho?');
    expect(p.doLink).toBe('250 moedas · 2 tacos');
    expect(p.atual).toBe('100 moedas · 1 taco');
    expect(p.aviso).toMatch(/atual fica esquecida neste aparelho/);
    expect(p.confirmar).toBe('Usar esta carteira');
    expect(p.recusar).toBe('Manter a atual');
  });

  it('aparelho sem carteira: não fala em "atual" nem a mostra', () => {
    const p = perguntaDaTroca(estado({ saldo: 80 }), null, false);
    expect(p.atual).toBeNull();
    expect(p.aviso).not.toMatch(/esquecida/);
  });

  it('saldo negativo sai com o sinal de menos', () => {
    expect(resumoDaCarteira(estado({ saldo: -30 }))).toBe('−30 moedas · 1 taco');
  });
});

// ---------------------------------------------------------------- o fluxo

class CarteiraDeBrincadeira implements CarteiraDoLink {
  estadoAtual: EstadoCarteira | null;
  temCodigo: boolean;
  chamadas: string[] = [];
  /** O que a sala responde ao código do link. */
  conferencia: ConferenciaDaCarteira;
  usou = 0;

  constructor(opcoes: { atual?: EstadoCarteira | null; tem?: boolean; conferencia?: Partial<Extract<ConferenciaDaCarteira, { ok: true }>> | { erro: 'carteira-invalida' | 'fora-do-ar' | 'limite' } }) {
    this.estadoAtual = opcoes.atual === undefined ? estado() : opcoes.atual;
    this.temCodigo = opcoes.tem ?? this.estadoAtual !== null;
    const c = opcoes.conferencia;
    if (c !== undefined && 'erro' in c && c.erro !== undefined) this.conferencia = { ok: false, erro: c.erro, mensagem: `texto de ${c.erro}` };
    else {
      this.conferencia = { ok: true, estado: estado({ saldo: 300 }), mesma: false, usar: () => this.usou++, ...(c as object) };
      // `usar` real: adota o estado e o código
      const original = this.conferencia;
      if (original.ok) this.conferencia = { ...original, usar: () => { this.usou++; this.estadoAtual = original.estado; this.temCodigo = true; } };
    }
  }

  conferir(codigo: string): Promise<ConferenciaDaCarteira> {
    this.chamadas.push(`conferir:${codigo === CODIGO ? 'o-do-link' : 'outro'}`);
    return Promise.resolve(this.conferencia);
  }
  tem(): boolean {
    return this.temCodigo;
  }
  estado(): EstadoCarteira | null {
    return this.estadoAtual;
  }
  garantir(): Promise<ResultadoDaCarteira> {
    this.chamadas.push('garantir');
    if (!this.temCodigo) {
      this.temCodigo = true;
      this.estadoAtual = estado();
    }
    return Promise.resolve({ ok: true, estado: this.estadoAtual! });
  }
}

class TelaDeBrincadeira {
  perguntas: PerguntaDeCarteira[] = [];
  avisos: string[] = [];
  constructor(private readonly resposta: boolean) {}
  perguntar(p: PerguntaDeCarteira): Promise<boolean> {
    this.perguntas.push(p);
    return Promise.resolve(this.resposta);
  }
  avisar(texto: string): Promise<void> {
    this.avisos.push(texto);
    return Promise.resolve();
  }
}

function pedido(hash: string, carteira: CarteiraDeBrincadeira, tela: TelaDeBrincadeira) {
  const limpezas: string[] = [];
  return { limpezas, p: { hash, limparEndereco: (resto: string) => void limpezas.push(resto), carteira, tela } };
}

describe('receberCarteiraDoLink: abrir o jogo com #carteira=', () => {
  it('sem fragmento da carteira não faz nada: nem mexe no endereço, nem confere, nem pergunta', async () => {
    const c = new CarteiraDeBrincadeira({});
    const t = new TelaDeBrincadeira(true);
    const { p, limpezas } = pedido('#secao', c, t);
    expect(await receberCarteiraDoLink(p)).toBe('nenhum');
    expect(limpezas).toEqual([]);
    expect(c.chamadas).toEqual([]);
    expect(t.perguntas).toHaveLength(0);
  });

  it('tira o fragmento do endereço ANTES de falar com a sala', async () => {
    const ordem: string[] = [];
    const c = new CarteiraDeBrincadeira({});
    const conferirOriginal = c.conferir.bind(c);
    c.conferir = (codigo) => (ordem.push('conferir'), conferirOriginal(codigo));
    const t = new TelaDeBrincadeira(false);
    await receberCarteiraDoLink({ hash: `#carteira=${CODIGO}`, limparEndereco: (r) => void ordem.push(`limpar:${r}`), carteira: c, tela: t });
    expect(ordem).toEqual(['limpar:', 'conferir']);
  });

  it('confere o código na sala, pergunta com o saldo dela e o da atual, e SÓ troca se a pessoa confirmar', async () => {
    const c = new CarteiraDeBrincadeira({ atual: estado({ saldo: 100 }), conferencia: { estado: estado({ saldo: 300, skins: ['classico', 'ebano'] }) } });
    const t = new TelaDeBrincadeira(true);
    const { p, limpezas } = pedido(`#carteira=${CODIGO}`, c, t);
    expect(await receberCarteiraDoLink(p)).toBe('trocada');
    expect(limpezas).toEqual(['']);
    expect(c.chamadas[0]).toBe('conferir:o-do-link');
    expect(t.perguntas).toHaveLength(1);
    expect(t.perguntas[0]).toMatchObject({ titulo: TITULO_DA_PERGUNTA, doLink: '300 moedas · 2 tacos', atual: '100 moedas · 1 taco' });
    expect(t.perguntas[0]!.aviso).toMatch(/atual fica esquecida/);
    expect(c.usou).toBe(1);
  });

  it('recusou: nada muda (a carteira de agora segue, `usar` nunca é chamado)', async () => {
    const c = new CarteiraDeBrincadeira({ atual: estado({ saldo: 100 }) });
    const t = new TelaDeBrincadeira(false);
    const { p } = pedido(`#carteira=${CODIGO}`, c, t);
    expect(await receberCarteiraDoLink(p)).toBe('mantida');
    expect(c.usou).toBe(0);
    expect(c.estado()?.saldo).toBe(100);
    expect(t.avisos).toEqual([]);
  });

  it('perguntar vem antes de trocar: com a pergunta aberta, a troca ainda não aconteceu', async () => {
    const c = new CarteiraDeBrincadeira({ atual: estado({ saldo: 100 }) });
    let usouNaPergunta = -1;
    const t = {
      perguntar: (): Promise<boolean> => {
        usouNaPergunta = c.usou;
        return Promise.resolve(true);
      },
      avisar: (): Promise<void> => Promise.resolve(),
    };
    await receberCarteiraDoLink({ hash: `#carteira=${CODIGO}`, limparEndereco: () => {}, carteira: c, tela: t });
    expect(usouNaPergunta).toBe(0);
    expect(c.usou).toBe(1);
  });

  it('código inválido: um aviso, e nada muda (nem pergunta, nem conferência)', async () => {
    const c = new CarteiraDeBrincadeira({});
    const t = new TelaDeBrincadeira(true);
    const { p, limpezas } = pedido('#carteira=lixo', c, t);
    expect(await receberCarteiraDoLink(p)).toBe('invalido');
    expect(t.avisos).toEqual([AVISO_LINK_INVALIDO]);
    expect(t.perguntas).toHaveLength(0);
    expect(c.chamadas).not.toContain('conferir:o-do-link');
    expect(c.usou).toBe(0);
    expect(limpezas).toEqual(['']);
  });

  it('código que a sala não conhece: um aviso, e nada muda', async () => {
    const c = new CarteiraDeBrincadeira({ conferencia: { erro: 'carteira-invalida' } });
    const t = new TelaDeBrincadeira(true);
    expect(await receberCarteiraDoLink(pedido(`#carteira=${CODIGO}`, c, t).p)).toBe('desconhecido');
    expect(t.avisos).toEqual([AVISO_LINK_DESCONHECIDO]);
    expect(t.perguntas).toHaveLength(0);
    expect(c.usou).toBe(0);
  });

  it('sala fora do ar: um aviso, e nada muda', async () => {
    const c = new CarteiraDeBrincadeira({ conferencia: { erro: 'fora-do-ar' } });
    const t = new TelaDeBrincadeira(true);
    expect(await receberCarteiraDoLink(pedido(`#carteira=${CODIGO}`, c, t).p)).toBe('fora-do-ar');
    expect(t.avisos).toEqual([AVISO_LINK_FORA_DO_AR]);
    expect(c.usou).toBe(0);
  });

  it('outra falha (limite de pedidos) mostra a frase do protocolo e diz que nada mudou', async () => {
    const c = new CarteiraDeBrincadeira({ conferencia: { erro: 'limite' } });
    const t = new TelaDeBrincadeira(true);
    await receberCarteiraDoLink(pedido(`#carteira=${CODIGO}`, c, t).p);
    expect(t.avisos).toEqual(['texto de limite Nada mudou.']);
  });

  it('o link é a carteira que o aparelho já usa: não mostra nada, não pergunta e não troca', async () => {
    const c = new CarteiraDeBrincadeira({ conferencia: { mesma: true } });
    const t = new TelaDeBrincadeira(true);
    expect(await receberCarteiraDoLink(pedido(`#carteira=${CODIGO}`, c, t).p)).toBe('mesma');
    expect(t.avisos).toEqual([]);
    expect(t.perguntas).toHaveLength(0);
    expect(c.usou).toBe(0);
  });

  it('aparelho sem carteira (chegou do endereço antigo): adota a do link sem perguntar nem avisar, e não cria outra antes', async () => {
    const c = new CarteiraDeBrincadeira({ atual: null, tem: false });
    const t = new TelaDeBrincadeira(false);
    expect(await receberCarteiraDoLink(pedido(`#carteira=${CODIGO}`, c, t).p)).toBe('trocada');
    expect(t.perguntas).toHaveLength(0);
    expect(t.avisos).toEqual([]);
    expect(c.usou).toBe(1);
    expect(c.chamadas).toEqual(['conferir:o-do-link', 'garantir']); // só a releitura depois da adoção
  });

  it('aparelho sem carteira e a sala recusa o código: segue o caminho de hoje (aviso, e a carteira própria nasce depois)', async () => {
    const falhou = new CarteiraDeBrincadeira({ atual: null, tem: false, conferencia: { erro: 'fora-do-ar' } });
    const t = new TelaDeBrincadeira(true);
    await receberCarteiraDoLink(pedido(`#carteira=${CODIGO}`, falhou, t).p);
    expect(falhou.chamadas).toEqual(['conferir:o-do-link', 'garantir']);
    expect(t.avisos).toEqual([AVISO_LINK_FORA_DO_AR]);
    expect(falhou.usou).toBe(0);

    const desconhecido = new CarteiraDeBrincadeira({ atual: null, tem: false, conferencia: { erro: 'carteira-invalida' } });
    const t2 = new TelaDeBrincadeira(true);
    expect(await receberCarteiraDoLink(pedido(`#carteira=${CODIGO}`, desconhecido, t2).p)).toBe('desconhecido');
    expect(t2.avisos).toEqual([AVISO_LINK_DESCONHECIDO]);
    expect(desconhecido.chamadas).toEqual(['conferir:o-do-link', 'garantir']);

    const invalido = new CarteiraDeBrincadeira({ atual: null, tem: false });
    await receberCarteiraDoLink(pedido('#carteira=lixo', invalido, new TelaDeBrincadeira(true)).p);
    expect(invalido.chamadas).toEqual(['garantir']);
  });

  it('aparelho com OUTRA carteira: continua perguntando (fluxo do L43) e só troca se confirmar', async () => {
    const c = new CarteiraDeBrincadeira({ atual: estado({ saldo: 100 }) });
    const t = new TelaDeBrincadeira(false);
    expect(await receberCarteiraDoLink(pedido(`#carteira=${CODIGO}`, c, t).p)).toBe('mantida');
    expect(t.perguntas).toHaveLength(1);
    expect(c.usou).toBe(0);
  });

  it('o código nunca chega à tela: a pergunta e os avisos não o contêm', async () => {
    const c = new CarteiraDeBrincadeira({});
    const t = new TelaDeBrincadeira(true);
    await receberCarteiraDoLink(pedido(`#carteira=${CODIGO}`, c, t).p);
    await receberCarteiraDoLink(pedido(`#carteira=${CODIGO}x`, c, t).p);
    expect(JSON.stringify([t.perguntas, t.avisos])).not.toContain(CODIGO);
  });
});
