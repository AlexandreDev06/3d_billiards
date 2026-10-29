import { describe, expect, it } from 'vitest';
import type { EventoTacada } from '@sinuca/fisica';
import type { ArmazenamentoMinimo } from '../armazenamento';
import { CONFIG_WEB } from '../config';
import { GERADORES_DO_MENU } from './geradores';
import { pedidoDoMenu, SONS_DO_MENU, type PedidoDeSom } from './mapeamento';
import { MotorDeAudio, type Gerador, type Geradores, type Sessao } from './motor-audio';

const CFG = { ...CONFIG_WEB.audio, maxVozes: 3 };

interface Toque {
  readonly som: string;
  readonly pedido: PedidoDeSom;
  readonly quandoS: number;
  parada: boolean;
}

function geradoresDeEspia(toques: Toque[]): Geradores {
  const gerador = (som: string, duracaoS: number): Gerador => ({
    preparar(pedido: PedidoDeSom) {
      return {
        id: `espia:${som}`,
        duracaoS,
        tocar(_saida: unknown, quandoS: number) {
          const toque: Toque = { som, pedido, quandoS, parada: false };
          toques.push(toque);
          return () => {
            toque.parada = true;
          };
        },
      };
    },
  });
  return {
    'taco-bola': gerador('taco-bola', 0.1),
    'bola-bola': gerador('bola-bola', 0.1),
    'bola-tabela': gerador('bola-tabela', 0.1),
    cacapa: gerador('cacapa', 0.5),
    'vez-outro': gerador('vez-outro', 0.1),
    'vez-sua': gerador('vez-sua', 0.7),
    'tempo-esgotado': gerador('tempo-esgotado', 0.5),
    moedas: gerador('moedas', 0.6),
  };
}

function sessaoFalsa(): Sessao & { agora: number; roda: boolean; ganhos: number[]; retomadas: number; fechada: boolean } {
  const s = {
    agora: 10,
    roda: true,
    ganhos: [] as number[],
    retomadas: 0,
    fechada: false,
    saida: {} as Sessao['saida'],
    agoraS: () => s.agora,
    rodando: () => s.roda,
    retomar() {
      s.retomadas++;
    },
    definirGanho(valor: number) {
      s.ganhos.push(valor);
    },
    fechar() {
      s.fechada = true;
    },
  };
  return s;
}

function memoria(inicial: Record<string, string> = {}): ArmazenamentoMinimo & { dados: Map<string, string> } {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    getItem: (c) => dados.get(c) ?? null,
    setItem: (c, v) => void dados.set(c, v),
    removeItem: (c) => void dados.delete(c),
  };
}

function montar(opcoes: { armazenamento?: ArmazenamentoMinimo | null; cfg?: typeof CFG } = {}) {
  const toques: Toque[] = [];
  const sessao = sessaoFalsa();
  let aberturas = 0;
  const motor = new MotorDeAudio({
    cfg: opcoes.cfg ?? CFG,
    geradores: geradoresDeEspia(toques),
    abrir: () => {
      aberturas++;
      return sessao;
    },
    armazenamento: opcoes.armazenamento === undefined ? memoria() : opcoes.armazenamento,
  });
  return { motor, toques, sessao, aberturas: () => aberturas };
}

const bolaBola = (velocidade: number, t = 0): EventoTacada => ({ tipo: 'bola-bola', t, a: 0, b: 2, velocidade });
const tabela = (velocidade: number): EventoTacada => ({ tipo: 'bola-tabela', t: 0, bola: 2, tabela: 0, parte: 'nariz', velocidade });

describe('MotorDeAudio — gesto do usuário', () => {
  it('antes de destravar não abre o contexto nem toca, mas conta o evento', () => {
    const { motor, toques, aberturas } = montar();
    motor.aoEvento(bolaBola(3));
    expect(aberturas()).toBe(0);
    expect(toques).toHaveLength(0);
    expect(motor.estatisticas()).toMatchObject({ eventos: 1, pedidos: 1, tocados: 0, semContexto: 1 });
  });

  it('destravar abre o contexto uma vez só e o retoma a cada gesto', () => {
    const { motor, sessao, aberturas } = montar();
    motor.destravar();
    motor.destravar();
    expect(aberturas()).toBe(1);
    expect(sessao.retomadas).toBe(2);
  });

  it('pronto só fica verdadeiro com o contexto aberto e rodando (para parar de escutar gestos)', () => {
    const { motor, sessao } = montar();
    expect(motor.pronto).toBe(false);
    motor.destravar();
    expect(motor.pronto).toBe(true);
    sessao.roda = false;
    expect(motor.pronto).toBe(false);
  });

  it('contexto que não abre (navegador sem Web Audio) deixa tudo mudo sem lançar', () => {
    const motor = new MotorDeAudio({ cfg: CFG, geradores: geradoresDeEspia([]), abrir: () => null, armazenamento: null });
    motor.destravar();
    motor.aoEvento(bolaBola(3));
    expect(motor.estatisticas().semContexto).toBe(1);
  });

  it('contexto suspenso (sem gesto ainda) não toca; depois de rodar, toca', () => {
    const { motor, sessao, toques } = montar();
    motor.destravar();
    sessao.roda = false;
    motor.aoEvento(bolaBola(3));
    expect(toques).toHaveLength(0);
    sessao.roda = true;
    motor.aoEvento(bolaBola(3));
    expect(toques).toHaveLength(1);
  });
});

describe('MotorDeAudio — eventos viram sons', () => {
  it('o gerador do tipo do evento toca agora, com o volume e o tom da velocidade', () => {
    const { motor, toques, sessao } = montar();
    motor.destravar();
    sessao.agora = 12.5;
    motor.aoEvento(tabela(2));
    expect(toques).toHaveLength(1);
    expect(toques[0]!.som).toBe('bola-tabela');
    expect(toques[0]!.quandoS).toBe(12.5);
    expect(toques[0]!.pedido.volume).toBeGreaterThan(0);
    expect(toques[0]!.pedido.volume).toBeLessThan(1);
  });

  it('parou e fora-da-mesa contam como evento, mas não como pedido', () => {
    const { motor, toques } = montar();
    motor.destravar();
    motor.aoEvento({ tipo: 'parou', t: 3 });
    motor.aoEvento({ tipo: 'fora-da-mesa', t: 1, bola: 4 });
    expect(toques).toHaveLength(0);
    expect(motor.estatisticas()).toMatchObject({ eventos: 2, pedidos: 0 });
  });

  it('impacto fraco demais é inaudível: não toca e não gasta voz', () => {
    const { motor, toques } = montar();
    motor.destravar();
    motor.aoEvento(bolaBola(0.001));
    expect(toques).toHaveLength(0);
    expect(motor.estatisticas()).toMatchObject({ pedidos: 1, inaudiveis: 1, tocados: 0 });
  });

  it('a caçapa toca o gerador da caçapa', () => {
    const { motor, toques } = montar();
    motor.destravar();
    motor.aoEvento({ tipo: 'cacapa', t: 1, bola: 3, cacapa: 'canto-1' });
    expect(toques.map((t) => t.som)).toEqual(['cacapa']);
  });
});

describe('MotorDeAudio — limite de vozes', () => {
  it('uma rajada no mesmo instante nunca passa do máximo de vozes', () => {
    const { motor, toques } = montar();
    motor.destravar();
    for (let i = 0; i < 40; i++) motor.aoEvento(bolaBola(2));
    expect(toques).toHaveLength(CFG.maxVozes);
    const e = motor.estatisticas();
    expect(e.picoDeVozes).toBe(CFG.maxVozes);
    expect(e.recusadas).toBe(40 - CFG.maxVozes);
  });

  it('numa rajada, o impacto mais forte toma o lugar do mais fraco, que é cortado', () => {
    const { motor, toques } = montar();
    motor.destravar();
    motor.aoEvento(bolaBola(0.5));
    motor.aoEvento(bolaBola(1));
    motor.aoEvento(bolaBola(1.5));
    motor.aoEvento(bolaBola(5));
    expect(toques).toHaveLength(4);
    expect(toques[0]!.parada).toBe(true);
    expect(toques.slice(1).every((t) => !t.parada)).toBe(true);
    expect(motor.estatisticas()).toMatchObject({ roubadas: 1, picoDeVozes: 3 });
  });

  it('vozes que acabaram liberam vaga para os impactos seguintes', () => {
    const { motor, toques, sessao } = montar();
    motor.destravar();
    for (let i = 0; i < 3; i++) motor.aoEvento(bolaBola(2));
    sessao.agora += 0.2;
    for (let i = 0; i < 3; i++) motor.aoEvento(bolaBola(2));
    expect(toques).toHaveLength(6);
  });

  it('todo evento com som acaba em exatamente uma conta: tocado, recusado, inaudível, silenciado ou sem contexto', () => {
    const { motor } = montar();
    motor.aoEvento(bolaBola(2));
    motor.destravar();
    for (let i = 0; i < 12; i++) motor.aoEvento(bolaBola(i % 4 === 0 ? 0.001 : 2));
    motor.definirMudo(true);
    motor.aoEvento(bolaBola(2));
    motor.aoEvento({ tipo: 'parou', t: 4 });
    const e = motor.estatisticas();
    expect(e.eventos).toBe(15);
    expect(e.pedidos).toBe(14);
    expect(e.tocados + e.recusadas + e.inaudiveis + e.silenciados + e.semContexto).toBe(e.pedidos);
    expect(e).toMatchObject({ semContexto: 1, silenciados: 1, inaudiveis: 3 });
  });

  it('zerar as estatísticas limpa os contadores e libera as vozes', () => {
    const { motor, toques } = montar();
    motor.destravar();
    for (let i = 0; i < 5; i++) motor.aoEvento(bolaBola(2));
    motor.zerarEstatisticas();
    expect(motor.estatisticas()).toMatchObject({ eventos: 0, pedidos: 0, tocados: 0, recusadas: 0, picoDeVozes: 0 });
    motor.aoEvento(bolaBola(2));
    expect(toques).toHaveLength(4);
  });
});

describe('MotorDeAudio — volume e mudo', () => {
  it('começa no volume geral da config, sem mudo', () => {
    const { motor } = montar();
    expect(motor.volume).toBe(CFG.volumeGeral);
    expect(motor.mudo).toBe(false);
  });

  it('o ganho do contexto segue volume e mudo', () => {
    const { motor, sessao } = montar();
    motor.destravar();
    expect(sessao.ganhos.at(-1)).toBe(CFG.volumeGeral);
    motor.definirVolume(0.3);
    expect(sessao.ganhos.at(-1)).toBe(0.3);
    motor.alternarMudo();
    expect(sessao.ganhos.at(-1)).toBe(0);
    expect(motor.mudo).toBe(true);
    motor.alternarMudo();
    expect(sessao.ganhos.at(-1)).toBe(0.3);
  });

  it('mudo não gera voz nenhuma', () => {
    const { motor, toques } = montar();
    motor.destravar();
    motor.alternarMudo();
    motor.aoEvento(bolaBola(5));
    expect(toques).toHaveLength(0);
  });

  it('volume fica entre 0 e 1 e ignora valor inválido', () => {
    const { motor } = montar();
    motor.definirVolume(7);
    expect(motor.volume).toBe(1);
    motor.definirVolume(-2);
    expect(motor.volume).toBe(0);
    motor.definirVolume(0.4);
    motor.definirVolume(Number.NaN);
    expect(motor.volume).toBe(0.4);
  });

  it('avisa quem escuta (o HUD) a cada mudança de volume ou mudo', () => {
    const { motor } = montar();
    const vistos: [number, boolean][] = [];
    motor.aoMudar((volume, mudo) => vistos.push([volume, mudo]));
    motor.definirVolume(0.5);
    motor.alternarMudo();
    expect(vistos).toEqual([
      [0.5, false],
      [0.5, true],
    ]);
  });
});

describe('MotorDeAudio — lembrar a escolha', () => {
  it('grava volume e mudo e os recupera na próxima visita', () => {
    const arm = memoria();
    const a = montar({ armazenamento: arm }).motor;
    a.definirVolume(0.25);
    a.definirMudo(true);
    const b = montar({ armazenamento: arm }).motor;
    expect(b.volume).toBe(0.25);
    expect(b.mudo).toBe(true);
  });

  it('dado salvo corrompido ou fora da faixa cai nos padrões', () => {
    expect(montar({ armazenamento: memoria({ 'sinuca.audio': '{quebrado' }) }).motor.volume).toBe(CFG.volumeGeral);
    const fora = montar({ armazenamento: memoria({ 'sinuca.audio': '{"volume":9,"mudo":"sim"}' }) }).motor;
    expect(fora.volume).toBe(CFG.volumeGeral);
    expect(fora.mudo).toBe(false);
  });

  it('um volume "ambiente" salvo por versão antiga é ignorado sem erro e some na próxima gravação', () => {
    const arm = memoria({ 'sinuca.audio': '{"volume":0.4,"mudo":true,"ambiente":0.35}' });
    const { motor } = montar({ armazenamento: arm });
    expect(motor.volume).toBe(0.4);
    expect(motor.mudo).toBe(true);
    motor.definirVolume(0.5);
    expect(JSON.parse(arm.dados.get('sinuca.audio')!)).toEqual({ volume: 0.5, mudo: true });
  });

  it('armazenamento bloqueado não impede de mexer no volume', () => {
    const bloqueado: ArmazenamentoMinimo = {
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {
        throw new Error('bloqueado');
      },
      removeItem() {
        throw new Error('bloqueado');
      },
    };
    const { motor } = montar({ armazenamento: bloqueado });
    motor.definirVolume(0.1);
    expect(motor.volume).toBe(0.1);
  });
});

describe('MotorDeAudio — avisos de interface', () => {
  it('o aviso toca o gerador dele, no volume cheio e sem mudar o tom', () => {
    const { motor, toques, sessao } = montar();
    motor.destravar();
    sessao.agora = 20;
    motor.avisar('vez-sua');
    expect(toques.map((t) => t.som)).toEqual(['vez-sua']);
    expect(toques[0]!.quandoS).toBe(20);
    expect(toques[0]!.pedido).toMatchObject({ volume: 1, tom: 1 });
    expect(motor.estatisticas()).toMatchObject({ avisos: 1, pedidos: 1, tocados: 1, eventos: 0 });
  });

  it('cada aviso toca o gerador do próprio nome', () => {
    const { motor, toques, sessao } = montar();
    motor.destravar();
    for (const som of ['vez-outro', 'vez-sua', 'tempo-esgotado'] as const) {
      sessao.agora += 5;
      motor.avisar(som);
    }
    expect(toques.map((t) => t.som)).toEqual(['vez-outro', 'vez-sua', 'tempo-esgotado']);
  });

  it('respeita o mudo e o contexto que ainda não abriu, como os impactos', () => {
    const { motor, toques } = montar();
    motor.avisar('vez-outro');
    expect(motor.estatisticas()).toMatchObject({ semContexto: 1, tocados: 0 });
    motor.destravar();
    motor.definirMudo(true);
    motor.avisar('tempo-esgotado');
    expect(toques).toHaveLength(0);
    expect(motor.estatisticas()).toMatchObject({ silenciados: 1, avisos: 2, pedidos: 2 });
  });

  it('o volume geral vale para o aviso: vai para o ganho do contexto, que também escala o aviso', () => {
    const { motor, sessao, toques } = montar();
    motor.destravar();
    motor.definirVolume(0.2);
    motor.avisar('vez-sua');
    expect(sessao.ganhos.at(-1)).toBe(0.2);
    expect(toques).toHaveLength(1);
  });

  it('entra na mesma conta dos impactos: tocado, recusado, inaudível, silenciado, sem contexto ou sem gerador', () => {
    const { motor } = montar();
    motor.destravar();
    for (let i = 0; i < 12; i++) motor.avisar('vez-sua');
    const e = motor.estatisticas();
    expect(e.avisos).toBe(12);
    expect(e.tocados + e.recusadas + e.inaudiveis + e.silenciados + e.semContexto + e.semGerador).toBe(e.pedidos);
    expect(e.tocados).toBe(CFG.maxVozes);
  });
});

describe('MotorDeAudio — sons do menu (L40)', () => {
  function comMenu() {
    const toques: Toque[] = [];
    const sessao = sessaoFalsa();
    const gerador = (som: string): Gerador => ({
      preparar: (pedido: PedidoDeSom) => ({ id: `menu:${som}`, duracaoS: 0.1, tocar: (_s: unknown, quandoS: number) => (toques.push({ som, pedido, quandoS, parada: false }), () => undefined) }),
    });
    const motor = new MotorDeAudio({
      cfg: CFG,
      geradores: geradoresDeEspia([]),
      geradoresDoMenu: { 'menu-passa': gerador('menu-passa'), 'menu-clique': gerador('menu-clique') },
      abrir: () => sessao,
      armazenamento: null,
    });
    return { motor, toques, sessao };
  }

  it('toca o gerador do menu pelo nome, no volume cheio, e conta como aviso de interface', () => {
    const { motor, toques, sessao } = comMenu();
    motor.destravar();
    sessao.agora = 30;
    motor.tocarDoMenu('menu-passa');
    motor.tocarDoMenu('menu-clique');
    expect(toques.map((t) => t.som)).toEqual(['menu-passa', 'menu-clique']);
    expect(toques[0]).toMatchObject({ quandoS: 30, pedido: { volume: 1, tom: 1 } });
    expect(motor.estatisticas()).toMatchObject({ avisos: 2, pedidos: 2, tocados: 2, eventos: 0 });
  });

  it('respeita o mudo e o contexto que ainda não abriu', () => {
    const { motor, toques } = comMenu();
    motor.tocarDoMenu('menu-passa');
    expect(motor.estatisticas()).toMatchObject({ semContexto: 1, tocados: 0 });
    motor.destravar();
    motor.definirMudo(true);
    motor.tocarDoMenu('menu-clique');
    expect(toques).toHaveLength(0);
    expect(motor.estatisticas()).toMatchObject({ silenciados: 1 });
  });

  it('sem geradores passados, usa os sintetizados: cada som do menu existe, dura menos de 0,15 s e monta nós no contexto', () => {
    const criados: string[] = [];
    const param = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
    const no = (tipo: string) => {
      criados.push(tipo);
      const n: Record<string, unknown> = { gain: param, frequency: param, Q: param, connect: (alvo: unknown) => alvo, disconnect() {}, start() {}, stop() {} };
      return n;
    };
    const ctx = { currentTime: 0, createGain: () => no('ganho'), createBufferSource: () => no('ruido'), createBiquadFilter: () => no('filtro'), createOscillator: () => no('tom') };
    const sessao = sessaoFalsa();
    (sessao as { saida: unknown }).saida = { ctx, destino: {}, ruido: {} };
    const motor = new MotorDeAudio({ cfg: CFG, geradores: geradoresDeEspia([]), abrir: () => sessao, armazenamento: null });
    motor.destravar();
    for (const som of SONS_DO_MENU) {
      const preparado = GERADORES_DO_MENU[som].preparar(pedidoDoMenu(som));
      expect(preparado?.id).toBe(`sintetizado:${som}`);
      expect(preparado?.duracaoS).toBeLessThan(0.15);
      motor.tocarDoMenu(som);
    }
    expect(motor.estatisticas()).toMatchObject({ tocados: 2, semGerador: 0, porId: { 'sintetizado:menu-passa': 1, 'sintetizado:menu-clique': 1 } });
    expect(criados).toContain('tom');
    expect(criados).toContain('ruido');
  });
});

describe('MotorDeAudio — de onde veio o som', () => {
  it('conta quantas vezes cada variação tocou, pelo id que o gerador deu', () => {
    const { motor } = montar();
    motor.destravar();
    motor.aoEvento(bolaBola(2));
    motor.aoEvento(bolaBola(2));
    motor.avisar('vez-sua');
    expect(motor.estatisticas().porId).toEqual({ 'espia:bola-bola': 2, 'espia:vez-sua': 1 });
    motor.zerarEstatisticas();
    expect(motor.estatisticas().porId).toEqual({});
  });

  it('gerador sem o som (amostra não carregou e sem reserva) não gasta voz e é contado', () => {
    const vazio: Gerador = { preparar: () => null };
    const motor = new MotorDeAudio({
      cfg: CFG,
      geradores: { ...geradoresDeEspia([]), 'bola-bola': vazio },
      abrir: () => sessaoFalsa(),
      armazenamento: null,
    });
    motor.destravar();
    motor.aoEvento(bolaBola(2));
    expect(motor.estatisticas()).toMatchObject({ semGerador: 1, tocados: 0, picoDeVozes: 0 });
  });

  it('o pedido leva a intensidade do impacto (velocidade / velocidade cheia) para escolher a variação', () => {
    const { motor, toques } = montar();
    motor.destravar();
    motor.aoEvento(bolaBola(CFG.velocidadeCheia / 2));
    motor.aoEvento(bolaBola(CFG.velocidadeCheia * 3));
    expect(toques.map((t) => t.pedido.intensidade)).toEqual([0.5, 1]);
  });
});

describe('MotorDeAudio — abertura do contexto', () => {
  it('avisa quem carrega as amostras quando o contexto abre, uma vez só', () => {
    const sessao = sessaoFalsa();
    const abertas: unknown[] = [];
    const motor = new MotorDeAudio({ cfg: CFG, geradores: geradoresDeEspia([]), abrir: () => sessao, aoAbrir: (s) => abertas.push(s), armazenamento: null });
    expect(abertas).toHaveLength(0);
    motor.destravar();
    motor.destravar();
    expect(abertas).toEqual([sessao]);
  });

  it('sem Web Audio (abrir devolve null) não há o que carregar', () => {
    const abertas: unknown[] = [];
    const motor = new MotorDeAudio({ cfg: CFG, geradores: geradoresDeEspia([]), abrir: () => null, aoAbrir: (s) => abertas.push(s), armazenamento: null });
    motor.destravar();
    expect(abertas).toHaveLength(0);
  });
});

describe('MotorDeAudio — dispose', () => {
  it('fecha o contexto', () => {
    const { motor, sessao } = montar();
    motor.destravar();
    motor.dispose();
    expect(sessao.fechada).toBe(true);
  });
});
