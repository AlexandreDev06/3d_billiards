/**
 * Os WebSockets do Worker sem o workerd (L41b): tamanho da mensagem, cota por endereço, silêncio que solta a ligação e o soquete que
 * volta da hibernação. O relógio é o do ambiente de teste (injetado), a sala é a de verdade e os soquetes são falsos; o que o
 * workerd faz de verdade com isto está em `worker-integracao.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { PROTOCOLO_VERSAO, decodificarMensagemDaSala, type MensagemDaSala, type MsgEstadoSala } from '@sinuca/protocolo';
import { PRESET_BOTECO } from '@sinuca/regras';
import { CONFIG_NUCLEO_PADRAO } from '../config-nucleo';
import { Registro } from '../registro';
import type { ConfigDoWorker } from './config-do-env';
import { SoquetesDaSala, type SoqueteDoObjeto } from './soquetes';

const FECHANDO = 2;

class SoqueteFalso implements SoqueteDoObjeto {
  readyState = 1;
  readonly enviadas: MensagemDaSala[] = [];
  fechado: { codigo: number | undefined; motivo: string | undefined } | null = null;
  fechamentos = 0;
  anexo: unknown;

  constructor(anexo: unknown = null) {
    this.anexo = anexo;
  }

  send(dado: string | ArrayBuffer | Uint8Array): void {
    const r = decodificarMensagemDaSala(dado);
    if (r.ok) this.enviadas.push(r.valor);
  }

  close(codigo?: number, motivo?: string): void {
    this.fechamentos++;
    this.fechado = { codigo, motivo };
    this.readyState = FECHANDO;
  }

  serializeAttachment(valor: unknown): void {
    this.anexo = structuredClone(valor);
  }

  deserializeAttachment(): unknown {
    return this.anexo;
  }

  ultima<T extends MensagemDaSala['tipo']>(tipo: T): Extract<MensagemDaSala, { tipo: T }> | undefined {
    return this.enviadas.findLast((m) => m.tipo === tipo) as Extract<MensagemDaSala, { tipo: T }> | undefined;
  }

  todas<T extends MensagemDaSala['tipo']>(tipo: T): Extract<MensagemDaSala, { tipo: T }>[] {
    return this.enviadas.filter((m) => m.tipo === tipo) as Extract<MensagemDaSala, { tipo: T }>[];
  }
}

const criarSala = (nome: string) => ({
  tipo: 'criar-sala',
  versao: PROTOCOLO_VERSAO,
  nome,
  modo: '1x1',
  preset: 'Boteco',
  regras: PRESET_BOTECO.regras,
  relogio: { tempoS: null },
});

/** Nada de `para-testes.ts` aqui: ele puxa a entrada Node, e este arquivo é compilado com os tipos do Worker. */
function montar(extra: Partial<ConfigDoWorker> = {}) {
  let agora = 1_000_000;
  const logs: string[] = [];
  const log = (evento: string, campos: Record<string, unknown> = {}) => void logs.push(`${evento} ${JSON.stringify(campos)}`);
  const config: ConfigDoWorker = { ...CONFIG_NUCLEO_PADRAO, bytesPorMensagem: 2000, mensagensPorIp: { capacidade: 1500, porSegundo: 12 }, alarmeMs: 45_000, ...extra };
  const registro = new Registro({ config, relogio: () => agora, log });
  const amb = {
    logs,
    agora: () => agora,
    /** Avança o relógio e roda o `tick` da sala. */
    avancar: (ms: number) => {
      agora += ms;
      registro.tick();
    },
    /** Avança o relógio sem `tick`. */
    semTick: (ms: number) => void (agora += ms),
  };
  const soquetes = new SoquetesDaSala({ config, registro, relogio: amb.agora, log });
  /** Um WebSocket aceito agora, como o `abrirWebSocket` do objeto o deixa. */
  const abrir = (ip = '198.51.100.1'): SoqueteFalso => {
    const ws = new SoqueteFalso({ ip, sinalEm: amb.agora() });
    soquetes.adotar(ws);
    return ws;
  };
  const enviar = (ws: SoqueteFalso, mensagem: object): void => soquetes.aoReceber(ws, JSON.stringify(mensagem));
  const ping = (ws: SoqueteFalso, t = 1): void => enviar(ws, { tipo: 'ping', t });
  const saidas = (): string[] => amb.logs.filter((l) => l.startsWith('saiu '));
  return { amb, soquetes, abrir, enviar, ping, saidas };
}

/** Ana cria uma sala 1x1 e Beto entra, cada um no seu soquete. */
function salaDeDois(m: ReturnType<typeof montar>, ips: [string, string] = ['198.51.100.1', '198.51.100.2']) {
  const ana = m.abrir(ips[0]);
  const beto = m.abrir(ips[1]);
  m.enviar(ana, criarSala('Ana'));
  const codigo = ana.ultima('boas-vindas')!.codigo;
  m.enviar(beto, { tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo, nome: 'Beto' });
  expect(beto.ultima('boas-vindas')).toBeDefined();
  return { ana, beto };
}

const conectadoDe = (ws: SoqueteFalso, lugar: number): boolean | undefined => (ws.ultima('estado-sala') as MsgEstadoSala | undefined)?.lugares[lugar]?.conectado;

describe('tamanho da mensagem: o Worker corta no que o `ws` do Node corta (bytesPorMensagem)', () => {
  it('texto acima do teto fecha com 1009, solta a ligação e a sala vê o jogador sair', () => {
    const m = montar();
    const { ana, beto } = salaDeDois(m);
    expect(conectadoDe(beto, 0)).toBe(true);

    m.soquetes.aoReceber(ana, 'x'.repeat(2001));

    expect(ana.fechado).toEqual({ codigo: 1009, motivo: 'Mensagem grande demais.' });
    expect(conectadoDe(beto, 0)).toBe(false);
    expect(m.soquetes.encerradosPorCausa.tamanho).toBe(1);
    // o log `saiu` diz por quê, como o do heartbeat e o da tolerância
    expect(m.saidas().filter((l) => l.includes('"origem":"tamanho"') && l.includes('"codigo":1009'))).toHaveLength(1);
  });

  it('binário acima do teto também; no teto exato passa (a mensagem é lida e recusada pelo protocolo, a conexão fica)', () => {
    const m = montar();
    const c = m.abrir();
    m.soquetes.aoReceber(c, new Uint8Array(2000).buffer);
    expect(c.fechado).toBeNull();
    expect(c.ultima('erro')).toMatchObject({ codigo: 'mensagem-invalida' });
    m.soquetes.aoReceber(c, 'y'.repeat(2000));
    expect(c.fechado).toBeNull();

    m.soquetes.aoReceber(c, new Uint8Array(2001).buffer);
    expect(c.fechado).toMatchObject({ codigo: 1009 });
  });

  it('o teto é em bytes, não em caracteres: 1 001 letras de 2 bytes passam do teto de 2 000 depois de codificadas', () => {
    const m = montar();
    const c = m.abrir();
    m.soquetes.aoReceber(c, 'é'.repeat(1000));
    expect(c.fechado).toBeNull();
    m.soquetes.aoReceber(c, 'é'.repeat(1001));
    expect(c.fechado).toMatchObject({ codigo: 1009 });
  });

  it('o que ainda chega do soquete depois de encerrado é ignorado: não recria a ligação nem gasta cota', () => {
    const m = montar({ mensagensPorIp: { capacidade: 4, porSegundo: 0.001 } });
    const c = m.abrir();
    m.soquetes.aoReceber(c, 'x'.repeat(2001));
    expect(c.fechamentos).toBe(1);
    expect(m.soquetes.total).toBe(0);
    for (let i = 0; i < 10; i++) m.ping(c, i);
    expect(m.soquetes.total).toBe(0);
    expect(c.fechamentos).toBe(1);
    expect(c.enviadas).toHaveLength(0);
    // as 3 fichas que sobraram são de quem ainda joga
    const outro = m.abrir();
    for (let i = 0; i < 3; i++) m.ping(outro, i);
    expect(outro.fechado).toBeNull();
    expect(outro.todas('pong')).toHaveLength(3);
  });
});

describe('silêncio de 3 x heartbeatMs: fecha com 4003 E solta a ligação na hora', () => {
  it('o outro lado nunca devolve o fechamento (o webSocketClose não vem): a sala vê o jogador sair e a vez passa pela tolerância', () => {
    const m = montar();
    const { ana, beto } = salaDeDois(m);
    m.enviar(ana, { tipo: 'iniciar' });
    expect(beto.ultima('retrato')).toBeDefined();

    // 75 s de silêncio da Ana não derrubam (o limite é "passou de 75 s"); Beto pinga de 15 em 15 s
    for (let i = 0; i < 5; i++) {
      m.amb.avancar(15_000);
      m.ping(beto, i);
      m.soquetes.vigiarSilencio();
    }
    expect(ana.fechado).toBeNull();
    expect(conectadoDe(beto, 0)).toBe(true);

    m.amb.avancar(1_000);
    m.soquetes.vigiarSilencio();
    expect(ana.fechado).toEqual({ codigo: 4003, motivo: 'Sem sinal do cliente.' });
    expect(m.soquetes.total).toBe(1);
    expect(conectadoDe(beto, 0)).toBe(false);
    expect(m.saidas().filter((l) => l.includes('"origem":"heartbeat"') && l.includes('"codigo":4003'))).toHaveLength(1);

    // a tolerância da vez de quem está ausente começa agora: passados 60 s, a vez passa, sem ninguém ter fechado nada
    m.amb.avancar(61_000);
    m.ping(beto, 99);
    expect(beto.todas('tempo-esgotado').map((t) => ({ lugar: t.lugar, motivo: t.motivo }))).toEqual([{ lugar: 0, motivo: 'ausencia' }]);
  });

  it('o `webSocketClose` que chega depois (a ligação já foi solta) não repete a saída', () => {
    const m = montar();
    const { ana, beto } = salaDeDois(m);
    m.amb.avancar(76_000);
    m.ping(beto);
    m.soquetes.vigiarSilencio();
    expect(m.saidas()).toHaveLength(1);
    m.soquetes.aoFechar(ana, 1006, 'depois');
    m.soquetes.aoFechar(ana, 1006, 'de novo');
    expect(m.saidas()).toHaveLength(1);
  });

  it('quem dá sinal não cai, e o sinal é qualquer mensagem', () => {
    const m = montar();
    const c = m.abrir();
    for (let i = 0; i < 20; i++) {
      m.amb.semTick(15_000);
      m.ping(c, i);
      m.soquetes.vigiarSilencio();
    }
    expect(c.fechado).toBeNull();
    expect(m.soquetes.encerradosPorCausa.silencio).toBe(0);
  });
});

describe('o soquete que volta da hibernação entra no controle de silêncio', () => {
  it('adotado com o último sinal guardado no anexo: quem já estava mudo há mais de 75 s cai no primeiro varrer, e quem falou há pouco não', () => {
    const m = montar();
    const agora = m.amb.agora();
    // o que o construtor do objeto faz com `ctx.getWebSockets()` ao acordar
    const mudo = new SoqueteFalso({ ip: '198.51.100.7', sinalEm: agora - 80_000 });
    const vivo = new SoqueteFalso({ ip: '198.51.100.8', sinalEm: agora - 10_000 });
    for (const ws of [mudo, vivo]) m.soquetes.adotar(ws);
    expect(m.soquetes.total).toBe(2);

    m.soquetes.vigiarSilencio();

    expect(mudo.fechado).toMatchObject({ codigo: 4003 });
    expect(vivo.fechado).toBeNull();
    expect(m.soquetes.total).toBe(1);
  });

  it('anexo de antes do L41b, sem o último sinal: conta do instante em que foi adotado (não cai de cara, e cai se continuar mudo)', () => {
    const m = montar();
    const ws = new SoqueteFalso({ ip: '198.51.100.9' });
    m.soquetes.adotar(ws);
    m.soquetes.vigiarSilencio();
    expect(ws.fechado).toBeNull();
    m.amb.semTick(76_000);
    m.soquetes.vigiarSilencio();
    expect(ws.fechado).toMatchObject({ codigo: 4003 });
  });

  it('cada mensagem renova o último sinal no anexo, para o silêncio não zerar a cada despertar do objeto', () => {
    const m = montar();
    const c = m.abrir('198.51.100.3');
    m.amb.semTick(30_000);
    m.ping(c);
    expect(c.anexo).toEqual({ ip: '198.51.100.3', sinalEm: m.amb.agora() });
  });

  it('adotar duas vezes o mesmo soquete devolve a mesma ligação', () => {
    const m = montar();
    const c = m.abrir();
    expect(m.soquetes.adotar(c)).toBe(m.soquetes.adotar(c));
    expect(m.soquetes.total).toBe(1);
  });
});

describe('cota de mensagens por endereço, somando as conexões', () => {
  const pequeno = { mensagensPorIp: { capacidade: 10, porSegundo: 1 } };

  it('duas conexões do mesmo IP dividem o balde (cada uma sozinha cabe no dela); a que estoura cai com 1008 e é solta', () => {
    const m = montar(pequeno);
    const { ana, beto } = salaDeDois(m, ['203.0.113.5', '203.0.113.5']);
    // criar e entrar já gastaram 2 das 10 fichas do endereço
    for (let i = 0; i < 4; i++) m.ping(ana, i);
    for (let i = 0; i < 4; i++) m.ping(beto, i);
    expect(ana.fechado).toBeNull();
    expect(beto.fechado).toBeNull();

    m.ping(ana, 99);
    expect(ana.fechado).toEqual({ codigo: 1008, motivo: 'Mensagens demais deste endereço.' });
    expect(ana.todas('pong').map((p) => p.t)).toEqual([0, 1, 2, 3]);
    expect(m.soquetes.encerradosPorCausa.cotaPorIp).toBe(1);
    expect(conectadoDe(beto, 0)).toBe(false);
    expect(m.saidas().filter((l) => l.includes('"origem":"cota-por-ip"') && l.includes('"codigo":1008'))).toHaveLength(1);

    // o balde é do endereço: a outra conexão dele fica sem fichas também
    m.ping(beto, 100);
    expect(beto.fechado).toMatchObject({ codigo: 1008 });
  });

  it('outro endereço tem o balde dele', () => {
    const m = montar(pequeno);
    const a = m.abrir('203.0.113.5');
    for (let i = 0; i < 11; i++) m.ping(a, i);
    expect(a.fechado).toMatchObject({ codigo: 1008 });
    const b = m.abrir('203.0.113.6');
    for (let i = 0; i < 10; i++) m.ping(b, i);
    expect(b.fechado).toBeNull();
  });

  it('recarrega com o tempo: depois de 5 s há 5 fichas de novo', () => {
    const m = montar(pequeno);
    const a = m.abrir('203.0.113.5');
    const b = m.abrir('203.0.113.5');
    for (let i = 0; i < 10; i++) m.ping(a, i);
    m.amb.semTick(5_000);
    for (let i = 0; i < 5; i++) m.ping(b, i);
    expect(b.fechado).toBeNull();
    m.ping(b, 5);
    expect(b.fechado).toMatchObject({ codigo: 1008 });
  });

  it('a mensagem que a sala recusa também custa: lixo e mensagem inválida gastam ficha antes de ser lidos', () => {
    const m = montar(pequeno);
    const c = m.abrir();
    for (let i = 0; i < 10; i++) m.soquetes.aoReceber(c, 'lixo');
    expect(c.todas('erro')).toHaveLength(10);
    m.soquetes.aoReceber(c, 'lixo');
    expect(c.fechado).toMatchObject({ codigo: 1008 });
  });

  it('o padrão do Worker (1 500 de rajada, 12 por segundo) deixa dois jogadores mirando sem parar (2 x 10 por segundo) por mais de 3 minutos, e não por 4', () => {
    const m = montar();
    const a = m.abrir('203.0.113.5');
    const b = m.abrir('203.0.113.5');
    // a `mira` custa o mesmo que qualquer mensagem; o ping é só uma que a sala responde sem exigir sala
    const segundo = (s: number) => {
      for (let k = 0; k < 10; k++) {
        m.ping(a, s * 10 + k);
        m.ping(b, s * 10 + k);
      }
      m.amb.semTick(1_000);
    };
    // 20 por segundo entram e 12 voltam: o balde perde 8 por segundo líquido, 1 500 / 8 = 187 s
    for (let s = 0; s < 180; s++) segundo(s);
    expect(a.fechado).toBeNull();
    expect(b.fechado).toBeNull();
    for (let s = 180; s < 240; s++) segundo(s);
    expect(a.fechado ?? b.fechado).toMatchObject({ codigo: 1008 });
  });

  it('um endereço que gasta tudo e só então para recebe o balde de volta cheio e vazio de dívida só depois de recarregar (o objeto fica acordado até lá)', () => {
    const m = montar(pequeno);
    expect(m.soquetes.comDivida).toBe(false);
    const c = m.abrir('203.0.113.5');
    m.ping(c);
    expect(m.soquetes.comDivida).toBe(true);
    // 1 ficha gasta volta em 1 s: o tick seguinte já esquece o balde
    m.amb.semTick(1_000);
    m.soquetes.limpar();
    expect(m.soquetes.comDivida).toBe(false);

    for (let i = 0; i < 10; i++) m.ping(c, i);
    expect(c.fechado).toBeNull();
    m.amb.semTick(5_000);
    m.soquetes.limpar();
    expect(m.soquetes.comDivida).toBe(true);
    expect(m.soquetes.enderecosComBalde).toBe(1);
    m.amb.semTick(10_000);
    m.soquetes.limpar();
    expect(m.soquetes.comDivida).toBe(false);
  });
});
