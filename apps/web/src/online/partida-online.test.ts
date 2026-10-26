import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, ID_BOLAO, criarRng, gravacaoDeTeste, mesaInicial, simularTacada, type ParametrosTacada } from '@sinuca/fisica';
import type { LugarSala, MensagemDaSala, MensagemDoCliente, ModoSala, MsgEstadoSala, MsgTempoEsgotado, PlacarSala } from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESET_MATA_MATA, novaPartida, type Consequencias } from '@sinuca/regras';
import { REGRAS_DO_PACOTE } from '../jogo/regras';
import { ArmazemDeSessao } from './armazem';
import { ArmazenamentoFalso, RelogioFalso, SalaFalsa } from './para-testes';
import { SessaoOnline, type OuvintesSessao } from './sessao';
import type { PedidoDeEntrada } from './cliente-sala';
import { PartidaOnline, type TacadaParaAnimar } from './partida-online';
import { modeloDaSala } from './sala-modelo';

const QUEBRA: ParametrosTacada = { angulo: 0, velocidadeTaco: 6, efeito: { lateral: 0, vertical: 0.1 }, elevacao: 0, giz: 1 };
const SUAVE: ParametrosTacada = { angulo: 0.4, velocidadeTaco: 1.2, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 };

interface Cliente {
  readonly sessao: SessaoOnline;
  readonly animar: TacadaParaAnimar[];
  readonly concluidas: { c: Consequencias; lugar: number }[];
  readonly retratos: string[];
  readonly erros: string[];
  readonly estados: MsgEstadoSala[];
  readonly miras: number[];
  readonly chats: string[];
  readonly conexoes: string[];
  /** Tudo o que a sala mandou de estado, na ordem em que chegou. */
  readonly ordem: string[];
  readonly esgotados: MsgTempoEsgotado[];
  /** Os estados da conexão que não são "conectando/conectada", com o motivo (para ver o encerramento). */
  readonly encerramentos: { motivo: string; expulso: boolean }[];
}

function montar(modo: ModoSala = '1x1', tempo?: { tempoS: 15 | 30 | 45 | 60 | null }) {
  const sala = new SalaFalsa();
  const relogio = new RelogioFalso();
  let proximaSemente = 1;
  const cliente = (nome: string, entrar: boolean): Cliente => {
    const armazem = new ArmazemDeSessao(new ArmazenamentoFalso(), `aba-${nome}`, relogio.agora);
    const c: Cliente = { sessao: null as unknown as SessaoOnline, animar: [], concluidas: [], retratos: [], erros: [], estados: [], miras: [], chats: [], conexoes: [], ordem: [], esgotados: [], encerramentos: [] };
    const ouvintes: OuvintesSessao = {
      aoAnimar: (t) => c.animar.push(t),
      aoConcluir: (cons, lugar) => c.concluidas.push({ c: cons, lugar }),
      aoRetrato: (motivo) => (c.retratos.push(motivo), c.ordem.push(`retrato:${motivo}`)),
      aoTempoEsgotado: (m) => (c.esgotados.push(m), c.ordem.push('tempo-esgotado')),
      aoErro: (e) => c.erros.push(e.codigo),
      aoEstadoSala: (e) => (c.estados.push(e), c.ordem.push('estado-sala')),
      aoMira: (m) => c.miras.push(m.angulo),
      aoChat: (m) => c.chats.push(`${m.nome}: ${m.texto}`),
      aoConexao: (e) => {
        c.conexoes.push(e.fase);
        if (e.fase === 'encerrada') c.encerramentos.push({ motivo: e.motivo, expulso: e.expulso === true });
      },
    };
    const sessao = new SessaoOnline({
      url: 'ws://teste/sala',
      criarSocket: sala.criarSocket,
      armazem,
      agendar: relogio.agendar,
      agora: relogio.agora,
      sortear: () => 1,
      jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada },
      fisica: () => CONFIG_FISICA_PADRAO,
      rng: criarRng(proximaSemente++),
      ouvintes,
    });
    (c as { sessao: SessaoOnline }).sessao = sessao;
    sessao.abrir(entrar ? { tipo: 'entrar', nome, codigo: sala.codigo } : { tipo: 'criar', nome, modo, preset: 'Boteco', regras: PRESET_BOTECO.regras, ...(tempo ? { relogio: tempo } : {}) });
    sala.abrirPendentes();
    return c;
  };
  return { sala, relogio, cliente };
}

/** Anfitrião Ana (lugar 0) e Beto (lugar 1) na sala, partida iniciada. */
function partidaIniciada() {
  const t = montar();
  const ana = t.cliente('Ana', false);
  const beto = t.cliente('Beto', true);
  ana.sessao.partida.iniciar();
  return { ...t, ana, beto };
}

/** Anima e termina a tacada de quem tacou e dos outros: o que o laço de render faz. */
function terminarAnimacoes(...clientes: Cliente[]): void {
  for (const c of clientes) c.sessao.partida.animacaoTerminou();
}

describe('PartidaOnline: sala de espera', () => {
  it('o anfitrião cria e o outro entra pelo código: cada um sabe o seu lugar', () => {
    const t = montar();
    const ana = t.cliente('Ana', false);
    expect(ana.sessao.partida.meuLugar).toBe(0);
    expect(ana.sessao.partida.souAnfitriao).toBe(true);
    const beto = t.cliente('Beto', true);
    expect(beto.sessao.partida.meuLugar).toBe(1);
    expect(beto.sessao.partida.souAnfitriao).toBe(false);
    expect(ana.estados.at(-1)!.lugares.slice(0, 2).map((l) => l.nome)).toEqual(['Ana', 'Beto']);
    expect(beto.sessao.partida.jogo).toBeNull();
  });

  it('iniciar manda o retrato a todos e monta o mesmo jogo, com a mesa do triângulo', () => {
    const { ana, beto } = partidaIniciada();
    expect(ana.retratos).toEqual(['inicio']);
    expect(beto.retratos).toEqual(['inicio']);
    const a = ana.sessao.partida.jogo!;
    const b = beto.sessao.partida.jogo!;
    expect(a.partida).toEqual(b.partida);
    expect(a.mesa).toEqual(b.mesa);
    expect(a.mesa.bolas.some((x) => x.id === ID_BOLAO)).toBe(true);
    // O castigo (1) fica fora da mesa até a saída; as outras bolas da partida estão no triângulo.
    const numeradas = a.mesa.bolas.filter((x) => x.id !== ID_BOLAO).map((x) => x.id).sort((x, y) => x - y);
    expect(numeradas).toEqual(a.partida.naMesa.filter((id) => id !== 1).sort((x, y) => x - y));
  });

  it('escolher lugar vago muda o meu lugar quando o estado mostra o meu nome lá', () => {
    const t = montar('2x2');
    const ana = t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    expect(beto.sessao.partida.meuLugar).toBe(1);
    beto.sessao.partida.escolherLugar(3);
    expect(beto.sessao.partida.meuLugar).toBe(3);
    expect(ana.estados.at(-1)!.lugares.map((l) => l.nome)).toEqual(['Ana', null, null, 'Beto']);
  });

  it('lugar ocupado: fico onde estava e o erro chega ao ouvinte', () => {
    const t = montar('2x2');
    t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    t.cliente('Caio', true);
    beto.sessao.partida.escolherLugar(2);
    expect(beto.sessao.partida.meuLugar).toBe(1);
    expect(beto.erros).toContain('lugar-ocupado');
  });
});

describe('PartidaOnline: tacadas alternadas', () => {
  it('só tem a vez quem a sala diz; o outro não pode tacar', () => {
    const { ana, beto } = partidaIniciada();
    expect(ana.sessao.partida.minhaVez).toBe(true);
    expect(beto.sessao.partida.minhaVez).toBe(false);
    expect(() => beto.sessao.partida.tacar(QUEBRA)).toThrow();
    expect(ana.sessao.partida.nomeDaVez).toBe('Ana');
    expect(beto.sessao.partida.nomeDaVez).toBe('Ana');
  });

  it('quem taca anima na hora; os outros recebem a gravação; as duas telas terminam iguais', () => {
    const { ana, beto, sala } = partidaIniciada();
    const gravacao = ana.sessao.partida.tacar(QUEBRA);
    expect(gravacao.quadros).toBeGreaterThan(10);
    expect(ana.sessao.partida.jogo!.fase).toBe('tocando');
    expect(ana.sessao.partida.minhaVez).toBe(false);
    // A sala aceitou e retransmitiu: Beto recebe a gravação para animar.
    expect(beto.animar).toHaveLength(1);
    expect(beto.animar[0]!.lugar).toBe(0);
    expect(beto.animar[0]!.gravacao.quadros).toBe(gravacao.quadros);
    expect(beto.animar[0]!.parametros).toEqual(QUEBRA);
    // Ana não recebe a própria tacada para animar de novo.
    expect(ana.animar).toHaveLength(0);

    terminarAnimacoes(ana, beto);
    const a = ana.sessao.partida.jogo!;
    const b = beto.sessao.partida.jogo!;
    expect(a.fase).toBe('jogando');
    expect(b.fase).toBe('jogando');
    expect(a.partida).toEqual(b.partida);
    expect(a.partida).toEqual(sala.partidaAtual);
    expect(a.mesa).toEqual(b.mesa);
    expect(ana.concluidas).toHaveLength(1);
    expect(beto.concluidas).toHaveLength(1);
    expect(beto.concluidas[0]!.lugar).toBe(0);
    expect(ana.concluidas[0]!.c).toEqual(beto.concluidas[0]!.c);
    expect(sala.seqAtual).toBe(1);
  });

  it('quatro tacadas alternadas: as duas partidas ficam idênticas depois de cada uma', () => {
    const { ana, beto, sala } = partidaIniciada();
    for (let i = 0; i < 4; i++) {
      const quem = [ana, beto].find((c) => c.sessao.partida.minhaVez);
      expect(quem, `tacada ${i}: alguém tem a vez`).toBeDefined();
      quem!.sessao.partida.tacar(i === 0 ? QUEBRA : { ...SUAVE, angulo: i });
      terminarAnimacoes(ana, beto);
      expect(ana.sessao.partida.jogo!.partida).toEqual(beto.sessao.partida.jogo!.partida);
      expect(ana.sessao.partida.jogo!.mesa).toEqual(beto.sessao.partida.jogo!.mesa);
      expect(ana.sessao.partida.jogo!.partida).toEqual(sala.partidaAtual);
      expect(sala.seqAtual).toBe(i + 1);
    }
    expect(ana.concluidas.length + beto.concluidas.length).toBe(8);
  });

  it('a vez só chega depois que a minha animação da tacada anterior acaba', () => {
    const { ana, beto } = partidaIniciada();
    // Dá uma tacada fraca que não encaçapa nada: a vez passa para Beto na sala.
    ana.sessao.partida.tacar({ ...SUAVE, angulo: 3 });
    expect(beto.sessao.partida.minhaVez).toBe(false); // ainda anima a tacada de Ana
    beto.sessao.partida.animacaoTerminou();
    ana.sessao.partida.animacaoTerminou();
    const quem = [ana, beto].find((c) => c.sessao.partida.minhaVez);
    expect(quem).toBeDefined();
  });

  it('se a confirmação da sala vem depois da animação, a tacada espera por ela', () => {
    const t = partidaIniciada();
    const { ana, sala } = t;
    // Segura a retransmissão para Ana: tira o socket de Ana da sala por um instante.
    const socketAna = sala.sockets[0]!;
    const entregarOriginal = socketAna.entregar.bind(socketAna);
    const seguradas: MensagemDaSala[] = [];
    socketAna.entregar = (m) => {
      if (m.tipo === 'tacada-retransmitida') seguradas.push(m);
      else entregarOriginal(m);
    };
    ana.sessao.partida.tacar(QUEBRA);
    ana.sessao.partida.animacaoTerminou();
    expect(ana.sessao.partida.aguardandoSala).toBe(true);
    expect(ana.sessao.partida.jogo!.fase).toBe('tocando');
    expect(ana.concluidas).toHaveLength(0);
    entregarOriginal(seguradas[0]!);
    expect(ana.sessao.partida.aguardandoSala).toBe(false);
    expect(ana.concluidas).toHaveLength(1);
    expect(ana.sessao.partida.jogo!.partida).toEqual(sala.partidaAtual);
  });

  it('o desfecho que a sala confirma vale mais que o que calculei (partida e consequências)', () => {
    const { ana, sala } = partidaIniciada();
    const socketAna = sala.sockets[0]!;
    const entregarOriginal = socketAna.entregar.bind(socketAna);
    const seguradas: MensagemDaSala[] = [];
    socketAna.entregar = (m) => void seguradas.push(m);
    ana.sessao.partida.tacar(QUEBRA);
    const confirmacao = seguradas.find((m) => m.tipo === 'tacada-retransmitida');
    if (confirmacao?.tipo !== 'tacada-retransmitida') throw new Error('sem confirmação');
    const daSala = { ...confirmacao, consequencias: { ...confirmacao.consequencias, texto: 'frase da sala' } };
    entregarOriginal(daSala);
    ana.sessao.partida.animacaoTerminou();
    expect(ana.concluidas[0]!.c.texto).toBe('frase da sala');
  });

  it('enquanto a minha tacada toca ainda não é a minha vez de novo, mesmo que a sala não tenha respondido', () => {
    const { ana, sala } = partidaIniciada();
    const socketAna = sala.sockets[0]!;
    socketAna.entregar = () => {};
    ana.sessao.partida.tacar(QUEBRA);
    expect(ana.sessao.partida.estadoSala!.seq).toBe(0);
    expect(ana.sessao.partida.estadoSala!.vez).toBe(0);
    expect(ana.sessao.partida.jogo!.fase).toBe('tocando');
    expect(ana.sessao.partida.minhaVez).toBe(false);
  });

  it('tacada que chega com a animação anterior ainda tocando entra na fila e toca depois', () => {
    const { ana, beto, sala } = partidaIniciada();
    ana.sessao.partida.tacar(QUEBRA);
    expect(beto.animar).toHaveLength(1);
    // Beto ainda anima a quebra quando chega outra tacada (a de quem tem a vez na sala).
    const copia = { ...sala.partidaAtual! };
    expect(copia).toBeDefined();
    beto.sessao.partida.receber({
      tipo: 'tacada-retransmitida',
      seq: 1,
      lugar: 1,
      parametros: SUAVE,
      gravacao: beto.animar[0]!.gravacao,
      partida: sala.partidaAtual!,
      mesa: sala.mesaAtual!,
      consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 0, vencedor: null, texto: '' },
    });
    expect(beto.animar).toHaveLength(1);
    beto.sessao.partida.animacaoTerminou();
    expect(beto.animar).toHaveLength(2);
    expect(beto.animar[1]!.lugar).toBe(1);
    beto.sessao.partida.animacaoTerminou();
    expect(beto.concluidas).toHaveLength(2);
  });

  it('tacada repetida (mesmo seq) é descartada', () => {
    const { ana, beto } = partidaIniciada();
    ana.sessao.partida.tacar(QUEBRA);
    const repetida: MensagemDaSala = {
      tipo: 'tacada-retransmitida',
      seq: 0,
      lugar: 0,
      parametros: QUEBRA,
      gravacao: beto.animar[0]!.gravacao,
      partida: beto.sessao.partida.jogo!.partida,
      mesa: beto.sessao.partida.jogo!.mesa,
      consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 0, vencedor: null, texto: '' },
    };
    beto.sessao.partida.receber(repetida);
    expect(beto.animar).toHaveLength(1);
    // Nem na fila: ao acabar a primeira animação, nada mais toca.
    beto.sessao.partida.animacaoTerminou();
    expect(beto.animar).toHaveLength(1);
    expect(beto.concluidas).toHaveLength(1);
  });
});

describe('PartidaOnline: mira, chat e retrato', () => {
  it('a mira do jogador da vez chega ao outro, e só a dele', () => {
    const { ana, beto } = partidaIniciada();
    ana.sessao.partida.enviarMira({ angulo: 0.7, lateral: 0.1, vertical: 0, recuo: 0.03 });
    expect(beto.miras).toEqual([0.7]);
    expect(ana.miras).toEqual([]);
    expect(beto.sessao.miraRemota.angulo).toBeCloseTo(0.7);
    // Beto não tem a vez: a sala descarta a mira dele.
    beto.sessao.partida.enviarMira({ angulo: 1.5, lateral: 0, vertical: 0, recuo: 0.03 });
    expect(ana.miras).toEqual([]);
  });

  it('chat vai a todos, inclusive a quem escreveu', () => {
    const { ana, beto } = partidaIniciada();
    expect(ana.sessao.partida.enviarChat('  bora!  ')).toBe(true);
    expect(ana.sessao.partida.enviarChat('   ')).toBe(false);
    expect(beto.chats).toEqual(['Ana: bora!']);
    expect(ana.chats).toEqual(['Ana: bora!']);
    expect(beto.sessao.chat.visiveis(0, true, 10).map((l) => l.texto)).toEqual(['bora!']);
  });

  it('cair no meio da partida e voltar: o retrato da volta refaz o estado e a vez segue', () => {
    const { ana, beto, sala, relogio } = partidaIniciada();
    ana.sessao.partida.tacar({ ...SUAVE, angulo: 3 });
    terminarAnimacoes(ana, beto);
    // Quem tem a vez agora cai.
    const quem = [ana, beto].find((c) => c.sessao.partida.minhaVez)!;
    const outro = quem === ana ? beto : ana;
    const indice = quem === ana ? 0 : 1;
    sala.derrubar(sala.sockets[indice]!);
    expect(quem.sessao.partida.minhaVez).toBe(false);
    expect(quem.conexoes.at(-1)).toBe('reconectando');
    expect(outro.estados.at(-1)!.lugares[indice]!.conectado).toBe(false);
    relogio.avancar(500);
    sala.abrirPendentes();
    expect(quem.conexoes.at(-1)).toBe('conectada');
    expect(quem.retratos.at(-1)).toBe('entrada');
    expect(quem.sessao.partida.meuLugar).toBe(indice);
    expect(quem.sessao.partida.jogo!.partida).toEqual(sala.partidaAtual);
    expect(quem.sessao.partida.jogo!.mesa).toEqual(sala.mesaAtual);
    expect(quem.sessao.partida.minhaVez).toBe(true);
    expect(outro.estados.at(-1)!.lugares[indice]!.conectado).toBe(true);
  });

  it('cair durante a minha tacada: a sala aceitou, e a volta mostra a mesa de depois', () => {
    const { ana, sala, relogio } = partidaIniciada();
    ana.sessao.partida.tacar(QUEBRA);
    sala.derrubar(sala.sockets[0]!);
    relogio.avancar(500);
    sala.abrirPendentes();
    expect(ana.retratos.at(-1)).toBe('entrada');
    expect(ana.sessao.partida.jogo!.fase).toBe('jogando');
    expect(ana.sessao.partida.jogo!.mesa).toEqual(sala.mesaAtual);
    expect(ana.sessao.partida.aguardandoSala).toBe(false);
  });

  it('tacada recusada (ressincronia): descarta o que simulou e adota o retrato', () => {
    const { ana, beto, sala } = partidaIniciada();
    const mesaAntes = ana.sessao.partida.jogo!.mesa;
    // A sala acha que a vez é de outro lugar: recusa e manda o retrato de ressincronia.
    const partidaReal = sala.partidaAtual!;
    (sala as unknown as { partida: unknown }).partida = { ...partidaReal, vez: 1 };
    ana.sessao.partida.tacar(QUEBRA);
    expect(ana.erros).toContain('nao-e-sua-vez');
    expect(ana.retratos.at(-1)).toBe('ressincronia');
    expect(ana.sessao.partida.jogo!.fase).toBe('jogando');
    expect(ana.sessao.partida.jogo!.mesa).toEqual(mesaAntes);
    expect(beto.concluidas).toHaveLength(0);
  });

  it('desconectado, não é a minha vez nem se envia nada', () => {
    const { ana } = partidaIniciada();
    ana.sessao.partida.definirConectado(false);
    expect(ana.sessao.partida.minhaVez).toBe(false);
  });
});

describe('PartidaOnline: fim da partida volta para a sala de espera', () => {
  it('o anfitrião volta ao lobby: todos veem a espera com os mesmos lugares e nenhuma vez, e o contador some', () => {
    const { ana, beto, sala } = partidaIniciada();
    sala.encerrarPartida();
    expect(ana.estados.at(-1)).toMatchObject({ fase: 'jogando', vez: null });
    ana.sessao.partida.voltarAoLobby();
    for (const c of [ana, beto]) {
      expect(c.estados.at(-1)).toMatchObject({ fase: 'espera', vez: null, modo: '1x1' });
      expect(c.estados.at(-1)!.lugares.slice(0, 2).map((l) => l.nome)).toEqual(['Ana', 'Beto']);
      expect(c.sessao.partida.minhaVez).toBe(false);
      expect(c.sessao.partida.restanteDaVezMs(0)).toBeNull();
    }
    expect(ana.sessao.partida.meuLugar).toBe(0);
    expect(beto.sessao.partida.meuLugar).toBe(1);
    expect(ana.sessao.partida.souAnfitriao).toBe(true);
    expect(beto.sessao.partida.souAnfitriao).toBe(false);
    expect(sala.recebidas.at(-1)).toEqual({ tipo: 'voltar-ao-lobby' });
  });

  it('o cliente não usa mais nova-partida: sai só o voltar-ao-lobby', () => {
    const { ana, sala } = partidaIniciada();
    sala.encerrarPartida();
    ana.sessao.partida.voltarAoLobby();
    expect(sala.recebidas.some((m) => m.tipo === 'nova-partida')).toBe(false);
  });

  it('só o anfitrião volta: o outro recebe o erro e a sala continua onde estava', () => {
    const { ana, beto, sala } = partidaIniciada();
    sala.encerrarPartida();
    beto.sessao.partida.voltarAoLobby();
    expect(beto.erros).toEqual(['nao-anfitriao']);
    expect(ana.estados.at(-1)!.fase).toBe('jogando');
  });

  it('no meio da partida o anfitrião não volta: a sala recusa (partida em andamento)', () => {
    const { ana } = partidaIniciada();
    ana.sessao.partida.voltarAoLobby();
    expect(ana.erros).toEqual(['partida-em-andamento']);
    expect(ana.estados.at(-1)!.fase).toBe('jogando');
  });

  it('quem saiu da sala durante a partida perde o lugar ao voltar à espera; os que estão ficam', () => {
    const t = montar('2x2');
    const ana = t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    const caio = t.cliente('Caio', true);
    t.cliente('Dani', true);
    ana.sessao.partida.iniciar();
    t.sala.encerrarPartida();
    t.sala.derrubar(t.sala.sockets[2]!); // Caio some
    ana.sessao.partida.voltarAoLobby();
    expect(ana.estados.at(-1)!.lugares.map((l) => l.nome)).toEqual(['Ana', 'Beto', null, 'Dani']);
    expect(beto.sessao.partida.meuLugar).toBe(1);
    expect(caio.sessao.partida.meuLugar).toBe(2);
  });

  it('ciclo inteiro: fim → sala → configurar → iniciar de novo; o segundo jogo é outro e a primeira tacada vale', () => {
    const { ana, beto, sala } = partidaIniciada();
    ana.sessao.partida.tacar(QUEBRA);
    terminarAnimacoes(ana, beto);
    const antes = ana.sessao.partida.jogo!.partida;
    sala.encerrarPartida();
    ana.sessao.partida.voltarAoLobby();
    ana.sessao.partida.configurarSala({ relogio: { tempoS: 15 }, linha: { previsao: true, bolaAtingida: true } });
    expect(beto.estados.at(-1)).toMatchObject({ fase: 'espera', relogio: { tempoS: 15 }, linha: { previsao: true, bolaAtingida: true } });
    ana.sessao.partida.iniciar();
    expect(ana.retratos.at(-1)).toBe('inicio');
    expect(beto.retratos.at(-1)).toBe('inicio');
    expect(beto.estados.at(-1)).toMatchObject({ fase: 'jogando', seq: 0 });
    expect(beto.sessao.partida.jogo!.partida.jogadores.map((j) => j.id)).toEqual(antes.jogadores.map((j) => j.id));
    expect(ana.sessao.partida.jogo!.partida).not.toEqual(antes);
    expect(beto.sessao.partida.jogo!.partida).toEqual(ana.sessao.partida.jogo!.partida);
    // Quem tem a vez no jogo novo taca e a sala aceita (seq recomeçou em 0).
    const quem = ana.sessao.partida.minhaVez ? ana : beto;
    quem.sessao.partida.tacar(QUEBRA);
    expect(quem.erros).toEqual([]);
    expect(sala.seqAtual).toBe(1);
  });

  it('o ciclo se repete: voltar à sala outra vez depois do segundo jogo', () => {
    const { ana, beto, sala } = partidaIniciada();
    for (let i = 0; i < 2; i++) {
      sala.encerrarPartida();
      ana.sessao.partida.voltarAoLobby();
      expect(beto.estados.at(-1)!.fase).toBe('espera');
      ana.sessao.partida.iniciar();
      expect(beto.estados.at(-1)!.fase).toBe('jogando');
    }
    expect(ana.retratos).toEqual(['inicio', 'inicio', 'inicio']);
  });
});

describe('PartidaOnline: regras da sala (configurar-sala e linha)', () => {
  it('criar com a linha ligada: a sala a recebe no pedido e todos a veem no estado, completa', () => {
    const t = montar();
    const relogio = new RelogioFalso();
    const estados: MsgEstadoSala[] = [];
    const sessao = new SessaoOnline({
      url: 'ws://teste/sala',
      criarSocket: t.sala.criarSocket,
      armazem: new ArmazemDeSessao(new ArmazenamentoFalso(), 'aba-linha', relogio.agora),
      agendar: relogio.agendar,
      agora: relogio.agora,
      sortear: () => 1,
      jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada },
      fisica: () => CONFIG_FISICA_PADRAO,
      rng: criarRng(1),
      ouvintes: { aoEstadoSala: (e) => estados.push(e) },
    });
    sessao.abrir({ tipo: 'criar', nome: 'Ana', modo: '1x1', preset: 'Boteco', regras: PRESET_BOTECO.regras, linha: { previsao: true, bolaAtingida: false } });
    t.sala.abrirPendentes();
    expect(t.sala.recebidas[0]).toMatchObject({ tipo: 'criar-sala', linha: { previsao: true, bolaAtingida: false } });
    expect(estados.at(-1)!.linha).toEqual({ previsao: true, bolaAtingida: false });
  });

  it('criar sem linha: a sala a tem desligada', () => {
    const t = montar();
    const ana = t.cliente('Ana', false);
    expect(ana.estados.at(-1)!.linha).toEqual({ previsao: false, bolaAtingida: false });
    expect(t.sala.recebidas[0]).not.toHaveProperty('linha');
  });

  it('o anfitrião muda modo, tempo e linha na espera e todos veem o estado novo', () => {
    const t = montar();
    const ana = t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    ana.sessao.partida.configurarSala({ modo: '2x2', relogio: { tempoS: 45 }, linha: { previsao: true, bolaAtingida: false } });
    for (const c of [ana, beto]) expect(c.estados.at(-1)).toMatchObject({ modo: '2x2', relogio: { tempoS: 45 }, linha: { previsao: true, bolaAtingida: false } });
    expect(t.sala.recebidas.at(-1)).toEqual({ tipo: 'configurar-sala', modo: '2x2', relogio: { tempoS: 45 }, linha: { previsao: true, bolaAtingida: false } });
  });

  it('só manda o que mudou: campo ausente não vai na mensagem', () => {
    const t = montar();
    const ana = t.cliente('Ana', false);
    ana.sessao.partida.configurarSala({ linha: { previsao: true } });
    expect(t.sala.recebidas.at(-1)).toEqual({ tipo: 'configurar-sala', linha: { previsao: true } });
  });

  it('o sem-limite do tempo também vai (tempoS null)', () => {
    const t = montar();
    const ana = t.cliente('Ana', false);
    ana.sessao.partida.configurarSala({ relogio: { tempoS: null } });
    expect(ana.estados.at(-1)!.relogio!.tempoS).toBeNull();
  });

  it('quem não é o anfitrião não configura: a sala recusa e nada muda', () => {
    const t = montar();
    const ana = t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    beto.sessao.partida.configurarSala({ linha: { previsao: true } });
    expect(beto.erros).toEqual(['nao-anfitriao']);
    expect(ana.estados.at(-1)!.linha).toEqual({ previsao: false, bolaAtingida: false });
  });

  it('com a partida em curso a sala recusa a configuração (fase errada)', () => {
    const { ana } = partidaIniciada();
    ana.sessao.partida.configurarSala({ linha: { previsao: true } });
    expect(ana.erros).toEqual(['fase-errada']);
  });

  it('2x2 → 1x1: quem estava nos lugares 2 e 3 recebe novas boas-vindas com lugar null e passa a espectador', () => {
    const t = montar('2x2');
    const ana = t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    const caio = t.cliente('Caio', true);
    const dani = t.cliente('Dani', true);
    expect([caio.sessao.partida.meuLugar, dani.sessao.partida.meuLugar]).toEqual([2, 3]);
    ana.sessao.partida.configurarSala({ modo: '1x1' });
    expect(caio.sessao.partida.meuLugar).toBeNull();
    expect(dani.sessao.partida.meuLugar).toBeNull();
    expect(ana.sessao.partida.meuLugar).toBe(0);
    expect(beto.sessao.partida.meuLugar).toBe(1);
    // O estado que vem depois das boas-vindas já mostra os dois como espectadores.
    expect(caio.estados.at(-1)).toMatchObject({ modo: '1x1', espectadores: 2 });
    const m = modeloDaSala(caio.estados.at(-1)!, caio.sessao.partida.meuLugar, caio.sessao.partida.souAnfitriao);
    expect(m.souEspectador).toBe(true);
    expect(m.assentos).toHaveLength(2);
  });

  it('o deslocado pode sentar de novo num lugar vago do modo novo', () => {
    const t = montar('2x2');
    const ana = t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    const caio = t.cliente('Caio', true);
    ana.sessao.partida.configurarSala({ modo: '1x1' });
    expect(caio.sessao.partida.meuLugar).toBeNull();
    caio.sessao.partida.escolherLugar(1);
    expect(caio.erros).toEqual(['lugar-ocupado']);
    beto.sessao.partida.escolherLugar(null);
    caio.sessao.partida.escolherLugar(1);
    expect(caio.sessao.partida.meuLugar).toBe(1);
    expect(beto.sessao.partida.meuLugar).toBeNull();
  });

  it('boas-vindas com lugar null chegando no meio da espera não derruba o anfitrião nem os outros', () => {
    const { partida, estado } = direto(1);
    partida.receber({ tipo: 'boas-vindas', versao: 2, codigo: 'K7M2P', token: 'token-direto-000001', lugar: null, anfitriao: false });
    expect(partida.meuLugar).toBeNull();
    expect(partida.souAnfitriao).toBe(false);
    partida.receber(estado({ fase: 'espera', vez: null }));
    expect(partida.minhaVez).toBe(false);
  });
});

/** O adaptador sozinho, com uma conexão muda: o teste entrega as mensagens da sala à mão. */
function direto(lugar = 0) {
  const enviadas: MensagemDoCliente[] = [];
  const animar: TacadaParaAnimar[] = [];
  const miras: number[] = [];
  const esgotados: MsgTempoEsgotado[] = [];
  const relogio = { agoraMs: 0 };
  const partida = new PartidaOnline({
    conexao: { enviar: (m) => (enviadas.push(m), true) },
    jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada },
    fisica: () => CONFIG_FISICA_PADRAO,
    rng: criarRng(1),
    agora: () => relogio.agoraMs,
    ouvintes: { aoAnimar: (t) => animar.push(t), aoMira: (m) => miras.push(m.angulo), aoTempoEsgotado: (m) => esgotados.push(m) },
  });
  partida.definirNome('Beto');
  partida.definirConectado(true);
  partida.receber({ tipo: 'boas-vindas', versao: 1, codigo: 'K7M2P', token: 'token-direto-000001', lugar, anfitriao: lugar === 0 });
  const roda = [
    { id: 'lugar-0', nome: 'Ana', equipe: 0 },
    { id: 'lugar-1', nome: 'Beto', equipe: 1 },
  ];
  const { partida: p0, arrumacao } = novaPartida(PRESET_BOTECO.regras, roda, criarRng(3));
  const estado = (extra: Partial<MsgEstadoSala> = {}, lugares: LugarSala[] = LUGARES_1X1): MsgEstadoSala => ({
    tipo: 'estado-sala',
    codigo: 'K7M2P',
    modo: '2x2',
    preset: 'Boteco',
    fase: 'jogando',
    seq: 0,
    vez: 0,
    lugares,
    espectadores: 0,
    ...extra,
  });
  const retrato = (seq = 0): MensagemDaSala => ({ tipo: 'retrato', motivo: 'entrada', seq, partida: p0, arrumacao, semente: 5, mesa: null, ultima: null });
  const retransmitida = (seq: number, lugarDoAtirador = 1): MensagemDaSala => ({
    tipo: 'tacada-retransmitida',
    seq,
    lugar: lugarDoAtirador,
    parametros: SUAVE,
    gravacao: gravacaoDeTeste(),
    partida: p0,
    mesa: mesaInicial(arrumacao, CONFIG_FISICA_PADRAO, criarRng(5)),
    consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 0, vencedor: null, texto: `tacada ${seq}` },
  });
  return { partida, enviadas, animar, miras, esgotados, relogio, estado, retrato, retransmitida };
}

const LUGARES_1X1: LugarSala[] = [
  { lugar: 0, equipe: 0, nome: 'Ana', conectado: true, anfitriao: true },
  { lugar: 1, equipe: 1, nome: 'Beto', conectado: true, anfitriao: false },
  { lugar: 2, equipe: 0, nome: null, conectado: false, anfitriao: false },
  { lugar: 3, equipe: 1, nome: null, conectado: false, anfitriao: false },
];

describe('PartidaOnline: guardas do estado', () => {
  it('o estado-sala que já conta uma tacada que ainda não apliquei não me dá a vez (mesa velha)', () => {
    const t = direto(0);
    t.partida.receber(t.estado());
    t.partida.receber(t.retrato(0));
    expect(t.partida.minhaVez).toBe(true);
    t.partida.receber(t.estado({ seq: 1, vez: 0 }));
    expect(t.partida.minhaVez).toBe(false);
  });

  it('o retrato joga fora a fila e recomeça a contagem: tacada velha não toca, a nova toca primeiro', () => {
    const t = direto(0);
    t.partida.receber(t.estado());
    t.partida.receber(t.retrato(0));
    t.partida.receber(t.retransmitida(0));
    t.partida.receber(t.retransmitida(1));
    expect(t.animar).toHaveLength(1);
    t.partida.receber(t.retrato(5));
    t.partida.receber(t.retransmitida(3)); // repetida de antes do retrato
    expect(t.animar).toHaveLength(1);
    t.partida.receber(t.retransmitida(5));
    expect(t.animar).toHaveLength(2);
    expect(t.partida.jogo!.desfechoPendente!.consequencias.texto).toBe('tacada 5');
    t.partida.animacaoTerminou();
    expect(t.animar).toHaveLength(2); // a tacada 1, que estava na fila, não volta
  });

  it('a mira que a sala devolve com o meu lugar não vai para a tela (o taco que se vê é o meu)', () => {
    const t = direto(0);
    t.partida.receber({ tipo: 'mira-retransmitida', lugar: 0, angulo: 1, lateral: 0, vertical: 0, recuo: 0.03 });
    t.partida.receber({ tipo: 'mira-retransmitida', lugar: 1, angulo: 2, lateral: 0, vertical: 0, recuo: 0.03 });
    expect(t.miras).toEqual([2]);
  });
});

describe('PartidaOnline: pedir outro lugar', () => {
  const comBetoNo = (lugar: number | null): LugarSala[] => LUGARES_1X1.map((l) => (l.lugar === 1 ? { ...l, nome: null, conectado: false } : l)).map((l) => (l.lugar === lugar ? { ...l, nome: 'Beto', conectado: true } : l));

  it('o lugar só muda quando o estado-sala mostra o meu nome no lugar pedido, não por outro estado qualquer', () => {
    const t = direto(1);
    t.partida.receber(t.estado({ fase: 'espera', vez: null }));
    t.partida.escolherLugar(3);
    expect(t.enviadas.at(-1)).toEqual({ tipo: 'escolher-lugar', lugar: 3 });
    // Chega um estado de outra mudança (alguém entrou) antes de a sala atender o pedido.
    t.partida.receber(t.estado({ fase: 'espera', vez: null, espectadores: 1 }, LUGARES_1X1));
    expect(t.partida.meuLugar).toBe(1);
    t.partida.receber(t.estado({ fase: 'espera', vez: null }, comBetoNo(3)));
    expect(t.partida.meuLugar).toBe(3);
  });

  it('lugar recusado: esqueço o pedido (outro jogador de mesmo apelido no lugar não me muda)', () => {
    const t = direto(1);
    t.partida.receber(t.estado({ fase: 'espera', vez: null }));
    t.partida.escolherLugar(3);
    t.partida.receber({ tipo: 'erro', codigo: 'lugar-ocupado', mensagem: 'Lugar ocupado.' });
    t.partida.receber(t.estado({ fase: 'espera', vez: null }, comBetoNo(3)));
    expect(t.partida.meuLugar).toBe(1);
  });

  it('virar espectador: só deixo de ter lugar quando o estado não me mostra mais sentado', () => {
    const t = direto(1);
    t.partida.receber(t.estado({ fase: 'espera', vez: null }));
    t.partida.escolherLugar(null);
    t.partida.receber(t.estado({ fase: 'espera', vez: null }));
    expect(t.partida.meuLugar).toBe(1);
    t.partida.receber(t.estado({ fase: 'espera', vez: null }, comBetoNo(null)));
    expect(t.partida.meuLugar).toBeNull();
  });
});

describe('PartidaOnline: relógio da tacada', () => {
  const RELOGIO_30 = { tempoS: 30, aoEsgotar: 'perde-a-vez' } as const;

  it('o prazo da sala é relativo ao envio: o restante desce com o tempo desde que o estado chegou', () => {
    const t = direto();
    t.relogio.agoraMs = 5_000;
    t.partida.receber(t.estado({ relogio: RELOGIO_30, prazoMs: 20_000 }));
    expect(t.partida.restanteDaVezMs(5_000)).toBe(20_000);
    expect(t.partida.restanteDaVezMs(12_500)).toBe(12_500);
    expect(t.partida.restanteDaVezMs(60_000)).toBe(0);
  });

  it('um estado novo refaz a base da conta (a vez passou, houve tacada)', () => {
    const t = direto();
    t.partida.receber(t.estado({ relogio: RELOGIO_30, prazoMs: 20_000 }));
    t.relogio.agoraMs = 15_000;
    t.partida.receber(t.estado({ relogio: RELOGIO_30, prazoMs: 31_000, vez: 1 }));
    expect(t.partida.restanteDaVezMs(15_000)).toBe(30_000);
    expect(t.partida.restanteDaVezMs(25_000)).toBe(21_000);
  });

  it('enquanto a animação anterior toca, o contador espera no tempo cheio em vez de começar de um número maior', () => {
    const t = direto();
    t.partida.receber(t.estado({ relogio: RELOGIO_30, prazoMs: 41_000 }));
    expect(t.partida.restanteDaVezMs(0)).toBe(30_000);
    expect(t.partida.restanteDaVezMs(11_000)).toBe(30_000);
    expect(t.partida.restanteDaVezMs(16_000)).toBe(25_000);
  });

  it('sem limite (prazoMs null), sem prazo ou sem relógio não há contador', () => {
    const t = direto();
    t.partida.receber(t.estado({ relogio: { tempoS: null, aoEsgotar: 'perde-a-vez' }, prazoMs: null }));
    expect(t.partida.restanteDaVezMs(0)).toBeNull();
    t.partida.receber(t.estado({ relogio: RELOGIO_30 }));
    expect(t.partida.restanteDaVezMs(0)).toBeNull();
    t.partida.receber(t.estado({ prazoMs: 9_000 }));
    expect(t.partida.restanteDaVezMs(0)).toBe(9_000);
  });

  it('fora da partida (espera, partida terminada) ou sem conexão, o contador some', () => {
    const t = direto();
    t.partida.receber(t.estado({ relogio: RELOGIO_30, prazoMs: 20_000, fase: 'espera', vez: null }));
    expect(t.partida.restanteDaVezMs(0)).toBeNull();
    t.partida.receber(t.estado({ relogio: RELOGIO_30, prazoMs: 20_000, vez: null }));
    expect(t.partida.restanteDaVezMs(0)).toBeNull();
    t.partida.receber(t.estado({ relogio: RELOGIO_30, prazoMs: 20_000 }));
    expect(t.partida.restanteDaVezMs(0)).toBe(20_000);
    t.partida.definirConectado(false);
    expect(t.partida.restanteDaVezMs(0)).toBeNull();
  });

  it('antes de qualquer estado não há contador', () => {
    expect(direto().partida.restanteDaVezMs(0)).toBeNull();
  });

  it('tempo-esgotado chega ao ouvinte com a mensagem da sala', () => {
    const t = direto();
    t.partida.receber(t.estado({ relogio: RELOGIO_30, prazoMs: 0 }));
    const aviso: MsgTempoEsgotado = { tipo: 'tempo-esgotado', lugar: 0, proximo: 1, motivo: 'tempo', consequencia: 'perde-a-vez' };
    t.partida.receber(aviso);
    expect(t.esgotados).toEqual([aviso]);
  });
});

describe('SessaoOnline: relógio da tacada pela sala', () => {
  it('o anfitrião escolhe o tempo ao criar e todos o veem no estado da sala', () => {
    const t = montar('1x1', { tempoS: 45 });
    const ana = t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    expect(t.sala.recebidas[0]).toMatchObject({ tipo: 'criar-sala', relogio: { tempoS: 45 } });
    expect(ana.estados.at(-1)!.relogio).toEqual({ tempoS: 45, aoEsgotar: 'perde-a-vez' });
    expect(beto.estados.at(-1)!.relogio).toEqual({ tempoS: 45, aoEsgotar: 'perde-a-vez' });
  });

  it('o contador sai do prazo do estado e desce com o relógio do cliente', () => {
    const t = montar('1x1', { tempoS: 30 });
    const ana = t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    t.relogio.avancar(5_000);
    t.sala.prazoMs = 28_000;
    ana.sessao.partida.iniciar();
    expect(beto.sessao.partida.restanteDaVezMs(t.relogio.agora())).toBe(28_000);
    t.relogio.avancar(8_000);
    expect(beto.sessao.partida.restanteDaVezMs(t.relogio.agora())).toBe(20_000);
    expect(ana.sessao.partida.restanteDaVezMs(t.relogio.agora())).toBe(20_000);
  });

  it('tempo esgotado: o aviso chega antes do estado novo e do retrato, e o retrato refaz a partida na vez nova', () => {
    const { sala, ana, beto } = partidaIniciada();
    const antes = ana.ordem.length;
    sala.passarAVez('tempo');
    expect(ana.ordem.slice(antes)).toEqual(['tempo-esgotado', 'estado-sala', 'retrato:vez-passou']);
    expect(beto.ordem.slice(-3)).toEqual(['tempo-esgotado', 'estado-sala', 'retrato:vez-passou']);
    expect(ana.esgotados).toEqual([{ tipo: 'tempo-esgotado', lugar: 0, proximo: 1, motivo: 'tempo', consequencia: 'perde-a-vez' }]);
    expect(ana.sessao.partida.lugarDaVez).toBe(1);
    expect(ana.sessao.partida.minhaVez).toBe(false);
    expect(beto.sessao.partida.minhaVez).toBe(true);
  });

  it('o jogador da vez que esgota o tempo no meio da própria tacada perde a animação e volta à mesa da sala', () => {
    const { sala, ana } = partidaIniciada();
    ana.sessao.partida.tacar(QUEBRA);
    expect(ana.sessao.partida.euTaco).toBe(true);
    sala.passarAVez('tempo');
    expect(ana.sessao.partida.euTaco).toBe(false);
    expect(ana.retratos.at(-1)).toBe('vez-passou');
  });
});

describe('PartidaOnline: 2x1, três pessoas', () => {
  /** Ana (anfitriã, lugar 0), Beto (lugar 1, sozinho na equipe B) e Caio (lugar 2, com Ana). */
  function trio() {
    const t = montar('2x1');
    const ana = t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    const caio = t.cliente('Caio', true);
    return { ...t, ana, beto, caio };
  }

  it('o 2º a entrar fica no lugar 1 (a equipe de 1) e o 3º no lugar 2 (com o anfitrião); o 4º só assiste', () => {
    const { ana, beto, caio, cliente } = trio();
    expect([ana, beto, caio].map((c) => c.sessao.partida.meuLugar)).toEqual([0, 1, 2]);
    const dani = cliente('Dani', true);
    expect(dani.sessao.partida.meuLugar).toBeNull();
    const m = modeloDaSala(ana.estados.at(-1)!, 0, true);
    expect(m.assentos.map((a) => [a.lugar, a.equipe, a.nome])).toEqual([
      [0, 0, 'Ana'],
      [1, 1, 'Beto'],
      [2, 0, 'Caio'],
    ]);
    expect(m.equipes.map((e) => [e.rotulo, e.assentos.map((a) => a.lugar)])).toEqual([
      ['Equipe A', [0, 2]],
      ['Equipe B', [1]],
    ]);
    expect(m).toMatchObject({ podeIniciar: true, espectadores: 1 });
  });

  it('com dois a sala recusa iniciar; com os três a roda sai na ordem dos lugares (A1, B1, A2), igual para todos', () => {
    const t = montar('2x1');
    const ana = t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    ana.sessao.partida.iniciar();
    expect(ana.erros).toEqual(['lugares-incompletos']);
    expect(ana.retratos).toEqual([]);
    const caio = t.cliente('Caio', true);
    ana.sessao.partida.iniciar();
    for (const c of [ana, beto, caio]) expect(c.retratos).toEqual(['inicio']);
    const partida = caio.sessao.partida.jogo!.partida;
    expect(partida.jogadores.map((j) => [j.id, j.nome, j.equipe])).toEqual([
      ['lugar-0', 'Ana', 0],
      ['lugar-1', 'Beto', 1],
      ['lugar-2', 'Caio', 0],
    ]);
    expect([ana, beto, caio].map((c) => c.sessao.partida.meuIndice)).toEqual([0, 1, 2]);
  });

  it('seis tacadas sem acertar nada: a vez roda A1, B1, A2, B1, A1, B1 e as três telas ficam iguais depois de cada uma', () => {
    const { ana, beto, caio, sala } = trio();
    ana.sessao.partida.iniciar();
    const donos = [ana, beto, caio];
    const lugares: number[] = [];
    for (let i = 0; i < 6; i++) {
      const quem = donos.filter((c) => c.sessao.partida.minhaVez);
      expect(quem, `tacada ${i}: uma só pessoa tem a vez`).toHaveLength(1);
      lugares.push(quem[0]!.sessao.partida.meuLugar!);
      // Uma tacada fraca para longe das bolas: falta de quem não tocou em nada, e a vez passa.
      quem[0]!.sessao.partida.tacar({ ...SUAVE, angulo: Math.PI, velocidadeTaco: 0.12 });
      terminarAnimacoes(ana, beto, caio);
      const [a, b, c] = donos.map((x) => x.sessao.partida.jogo!);
      expect(b!.partida).toEqual(a!.partida);
      expect(c!.partida).toEqual(a!.partida);
      expect(b!.mesa).toEqual(a!.mesa);
      expect(c!.mesa).toEqual(a!.mesa);
      expect(a!.partida).toEqual(sala.partidaAtual);
    }
    expect(lugares).toEqual([0, 1, 2, 1, 0, 1]);
    expect(sala.seqAtual).toBe(6);
    // A sétima vez volta ao Caio (A2), e todos sabem de quem é.
    expect(donos.map((c) => c.sessao.partida.nomeDaVez)).toEqual(['Caio', 'Caio', 'Caio']);
    expect(caio.sessao.partida.minhaVez).toBe(true);
  });

  it('quem não tem a vez não taca, nem o parceiro de quem a tem', () => {
    const { ana, beto, caio } = trio();
    ana.sessao.partida.iniciar();
    expect(() => caio.sessao.partida.tacar(QUEBRA)).toThrow();
    expect(() => beto.sessao.partida.tacar(QUEBRA)).toThrow();
    expect(ana.sessao.partida.minhaVez).toBe(true);
  });

  it('o anfitrião troca o modo na espera: 2x2 → 2x1 tira só o lugar 3; 2x1 → 1x1 tira o lugar 2 também', () => {
    const t = montar('2x2');
    const ana = t.cliente('Ana', false);
    t.cliente('Beto', true);
    const caio = t.cliente('Caio', true);
    const dani = t.cliente('Dani', true);
    ana.sessao.partida.configurarSala({ modo: '2x1' });
    expect(dani.sessao.partida.meuLugar).toBeNull();
    expect(caio.sessao.partida.meuLugar).toBe(2);
    expect(modeloDaSala(ana.estados.at(-1)!, 0, true).assentos).toHaveLength(3);
    ana.sessao.partida.configurarSala({ modo: '1x1' });
    expect(caio.sessao.partida.meuLugar).toBeNull();
    // De 1x1 para 2x1 ninguém se mexe; os deslocados sentam de novo no lugar 2.
    ana.sessao.partida.configurarSala({ modo: '2x1' });
    caio.sessao.partida.escolherLugar(2);
    expect(caio.sessao.partida.meuLugar).toBe(2);
  });

  it('no 2x1 o lugar 3 não existe: pedir sentar nele é recusado', () => {
    const { beto } = trio();
    beto.sessao.partida.escolherLugar(3);
    expect(beto.erros).toEqual(['lugar-invalido']);
    expect(beto.sessao.partida.meuLugar).toBe(1);
  });
});

describe('PartidaOnline: expulsar', () => {
  function trio() {
    const t = montar('2x1');
    const ana = t.cliente('Ana', false);
    const beto = t.cliente('Beto', true);
    const caio = t.cliente('Caio', true);
    return { ...t, ana, beto, caio };
  }

  it('o anfitrião expulsa pelo lugar: o expulso é encerrado como expulso e os outros veem o lugar vago', () => {
    const { ana, beto, caio, sala } = trio();
    ana.sessao.partida.expulsar(1);
    expect(sala.recebidas.at(-1)).toEqual({ tipo: 'expulsar', lugar: 1 });
    expect(beto.encerramentos).toEqual([{ motivo: 'Você foi removido da sala pelo anfitrião.', expulso: true }]);
    expect(beto.sessao.cliente.estado).toMatchObject({ fase: 'encerrada', expulso: true });
    expect(ana.estados.at(-1)!.lugares.map((l) => l.nome)).toEqual(['Ana', null, 'Caio', null]);
    expect(caio.estados.at(-1)!.lugares.map((l) => l.nome)).toEqual(['Ana', null, 'Caio', null]);
    expect(modeloDaSala(caio.estados.at(-1)!, 2, false)).toMatchObject({ podeIniciar: false, aviso: 'Falta 1 jogador' });
    expect(ana.encerramentos).toEqual([]);
    expect(caio.encerramentos).toEqual([]);
  });

  it('o expulso não reconecta sozinho e o token dele some: o mesmo link vale como entrada nova', () => {
    const { ana, beto, relogio, sala } = trio();
    ana.sessao.partida.expulsar(1);
    const sockets = sala.sockets.length;
    relogio.avancar(120_000);
    expect(sala.sockets).toHaveLength(sockets);
    // Entrar de novo (o menu abre uma sessão `entrar` com o mesmo código e o mesmo apelido): sem token.
    beto.sessao.abrir({ tipo: 'entrar', nome: 'Beto', codigo: sala.codigo });
    sala.abrirPendentes();
    expect(sala.recebidas.at(-1)).toMatchObject({ tipo: 'entrar', nome: 'Beto' });
    expect(sala.recebidas.at(-1)).not.toHaveProperty('token');
    expect(beto.sessao.partida.meuLugar).toBe(1);
    expect(beto.sessao.cliente.estado).toEqual({ fase: 'conectada' });
    expect(ana.estados.at(-1)!.lugares.map((l) => l.nome)).toEqual(['Ana', 'Beto', 'Caio', null]);
  });

  it('quem estava caído quando foi expulso descobre ao voltar: o token revogado também encerra como expulso', () => {
    const { ana, beto, relogio, sala } = trio();
    sala.derrubar(sala.sockets[1]!);
    expect(ana.estados.at(-1)!.lugares[1]).toMatchObject({ nome: 'Beto', conectado: false });
    expect(modeloDaSala(ana.estados.at(-1)!, 0, true).assentos[1]).toMatchObject({ podeExpulsar: true });
    ana.sessao.partida.expulsar(1);
    expect(ana.estados.at(-1)!.lugares[1]!.nome).toBeNull();
    relogio.avancar(500);
    sala.abrirPendentes();
    expect(beto.encerramentos).toEqual([{ motivo: 'Você foi removido da sala pelo anfitrião.', expulso: true }]);
    expect(beto.erros).toEqual([]);
  });

  it('só o anfitrião expulsa, nunca a si mesmo nem um lugar vago, e só na espera', () => {
    const { ana, beto, caio } = trio();
    beto.sessao.partida.expulsar(2);
    expect(beto.erros).toEqual(['nao-anfitriao']);
    expect(caio.encerramentos).toEqual([]);
    ana.sessao.partida.expulsar(0);
    ana.sessao.partida.expulsar(3);
    expect(ana.erros).toEqual(['lugar-invalido', 'lugar-invalido']);
    ana.sessao.partida.iniciar();
    ana.sessao.partida.expulsar(2);
    expect(ana.erros.at(-1)).toBe('fase-errada');
    expect(caio.encerramentos).toEqual([]);
    expect(caio.sessao.partida.meuLugar).toBe(2);
  });
});

// ---------------------------------------------------------------- L17: modalidade, giz e força no pedido e na espera; mata-mata de 3 e 4

describe('PartidaOnline: modalidade, giz e força da sala (L17)', () => {
  /** Uma sala com o preset de cada modalidade: o anfitrião cria como o menu faz (modalidade, giz e força no pedido). */
  function sala(pedido: Partial<Extract<PedidoDeEntrada, { tipo: 'criar' }>> = {}) {
    const t = montar();
    const clientes: Cliente[] = [];
    const entrar = (nome: string, criar: boolean): Cliente => {
      const relogio = new RelogioFalso();
      const c: Cliente = { sessao: null as unknown as SessaoOnline, animar: [], concluidas: [], retratos: [], erros: [], estados: [], miras: [], chats: [], conexoes: [], ordem: [], esgotados: [], encerramentos: [] };
      const sessao = new SessaoOnline({
        url: 'ws://teste/sala',
        criarSocket: t.sala.criarSocket,
        armazem: new ArmazemDeSessao(new ArmazenamentoFalso(), `aba-${nome}`, relogio.agora),
        agendar: relogio.agendar,
        agora: relogio.agora,
        sortear: () => 1,
        jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada },
        fisica: () => CONFIG_FISICA_PADRAO,
        rng: criarRng(clientes.length + 1),
        ouvintes: {
          aoEstadoSala: (e) => c.estados.push(e),
          aoRetrato: (m) => c.retratos.push(m),
          aoConcluir: (cons, lugar) => c.concluidas.push({ c: cons, lugar }),
          aoAnimar: (a) => c.animar.push(a),
          aoErro: (e) => c.erros.push(e.codigo),
        },
      });
      (c as { sessao: SessaoOnline }).sessao = sessao;
      sessao.abrir(criar ? { tipo: 'criar', nome, modo: '1x1x1', modalidade: 'mata-mata', preset: PRESET_MATA_MATA.nome, regras: PRESET_MATA_MATA.regras, ...pedido } : { tipo: 'entrar', nome, codigo: t.sala.codigo });
      t.sala.abrirPendentes();
      clientes.push(c);
      return c;
    };
    return { ...t, entrar };
  }

  it('criar manda modalidade, giz e força, e a sala os devolve a todos no estado', () => {
    const t = sala({ giz: { desgasteMin: 0.2, desgasteMax: 0.3, passada: 0.25, passadaS: 2 }, forca: 'empurrar' });
    const ana = t.entrar('Ana', true);
    const beto = t.entrar('Beto', false);
    expect(t.sala.recebidas[0]).toMatchObject({ tipo: 'criar-sala', modo: '1x1x1', modalidade: 'mata-mata', giz: { desgasteMin: 0.2, desgasteMax: 0.3, passada: 0.25, passadaS: 2 }, forca: 'empurrar' });
    for (const c of [ana, beto]) expect(c.estados.at(-1)).toMatchObject({ modo: '1x1x1', modalidade: 'mata-mata', giz: { desgasteMin: 0.2, desgasteMax: 0.3, passada: 0.25, passadaS: 2 }, forca: 'empurrar' });
  });

  it('sem giz nem força no pedido, a sala usa os padrões (e o pedido não os leva)', () => {
    const t = sala();
    const ana = t.entrar('Ana', true);
    expect(t.sala.recebidas[0]).not.toHaveProperty('giz');
    expect(t.sala.recebidas[0]).not.toHaveProperty('forca');
    expect(ana.estados.at(-1)).toMatchObject({ giz: { desgasteMin: 0.1, desgasteMax: 0.3, passada: 0.1, passadaS: 3 }, forca: 'linha' });
  });

  it('o giz parcial do pedido é completado pela sala', () => {
    const t = sala({ giz: { desgasteMax: 0.4 } as never });
    const ana = t.entrar('Ana', true);
    expect(ana.estados.at(-1)!.giz).toEqual({ desgasteMin: 0.1, desgasteMax: 0.4, passada: 0.1, passadaS: 3 });
  });

  it('configurar-sala leva modalidade, formato, giz e força, só o que mudou, e todos veem o estado novo', () => {
    const t = sala();
    const ana = t.entrar('Ana', true);
    const beto = t.entrar('Beto', false);
    ana.sessao.partida.configurarSala({ giz: { passadaS: 5 }, forca: 'empurrar' });
    expect(t.sala.recebidas.at(-1)).toEqual({ tipo: 'configurar-sala', giz: { passadaS: 5 }, forca: 'empurrar' });
    for (const c of [ana, beto]) expect(c.estados.at(-1)).toMatchObject({ giz: { desgasteMin: 0.1, desgasteMax: 0.3, passada: 0.1, passadaS: 5 }, forca: 'empurrar', modalidade: 'mata-mata' });
    ana.sessao.partida.configurarSala({ modo: '1x1x1x1' });
    expect(t.sala.recebidas.at(-1)).toEqual({ tipo: 'configurar-sala', modo: '1x1x1x1' });
    expect(beto.estados.at(-1)).toMatchObject({ modo: '1x1x1x1' });
  });

  it('trocar a modalidade sem dizer o formato leva ao que tem o mesmo número de lugares (mata-mata de 4 → 2x2)', () => {
    const t = sala();
    const ana = t.entrar('Ana', true);
    ana.sessao.partida.configurarSala({ modo: '1x1x1x1' });
    ana.sessao.partida.configurarSala({ modalidade: 'par-ou-impar' });
    expect(t.sala.recebidas.at(-1)).toEqual({ tipo: 'configurar-sala', modalidade: 'par-ou-impar' });
    expect(ana.estados.at(-1)).toMatchObject({ modalidade: 'par-ou-impar', modo: '2x2' });
    ana.sessao.partida.configurarSala({ modalidade: 'mata-mata' });
    expect(ana.estados.at(-1)).toMatchObject({ modalidade: 'mata-mata', modo: '1x1x1x1' });
  });

  it('mata-mata de 3: cada lugar é a própria equipe, a partida usa a casa do mata-mata e todos montam o mesmo jogo', () => {
    const t = sala();
    const ana = t.entrar('Ana', true);
    const beto = t.entrar('Beto', false);
    const caio = t.entrar('Caio', false);
    ana.sessao.partida.iniciar();
    for (const c of [ana, beto, caio]) {
      const partida = c.sessao.partida.jogo!.partida;
      expect(partida.config.modalidade).toBe('mata-mata');
      expect(partida.jogadores.map((j) => [j.id, j.equipe])).toEqual([['lugar-0', 0], ['lugar-1', 1], ['lugar-2', 2]]);
      expect(partida.grupos).toEqual([null, null, null]);
    }
    expect(ana.sessao.partida.jogo!.partida).toEqual(caio.sessao.partida.jogo!.partida);
    expect([ana, beto, caio].map((c) => c.sessao.partida.meuIndice)).toEqual([0, 1, 2]);
  });

  it('a vez gira 0, 1, 2, 0 a cada tacada, mate ou não, e as três telas ficam iguais', () => {
    const t = sala();
    const ana = t.entrar('Ana', true);
    const beto = t.entrar('Beto', false);
    const caio = t.entrar('Caio', false);
    ana.sessao.partida.iniciar();
    const todos = [ana, beto, caio];
    const vezes: (number | null)[] = [];
    for (let i = 0; i < 4; i++) {
      const quem = todos.find((c) => c.sessao.partida.minhaVez);
      expect(quem, `tacada ${i}`).toBeDefined();
      vezes.push(quem!.sessao.partida.meuLugar);
      quem!.sessao.partida.tacar(i === 0 ? QUEBRA : { ...SUAVE, angulo: i + 2 });
      terminarAnimacoes(...todos);
      expect(ana.sessao.partida.jogo!.partida).toEqual(caio.sessao.partida.jogo!.partida);
      expect(ana.sessao.partida.jogo!.partida).toEqual(t.sala.partidaAtual);
    }
    expect(vezes).toEqual([0, 1, 2, 0]);
  });

  it('o placar de três lados chega no estado-sala e a espera mostra "Ana 1 · Beto 0 · Caio 0"', () => {
    const t = sala();
    const ana = t.entrar('Ana', true);
    t.entrar('Beto', false);
    const caio = t.entrar('Caio', false);
    const placar: PlacarSala = { atual: { modalidade: 'mata-mata', lados: [{ nomes: ['Ana'], vitorias: 1 }, { nomes: ['Beto'], vitorias: 0 }, { nomes: ['Caio'], vitorias: 0 }] }, historico: [] };
    caio.sessao.partida.receber({ ...ana.estados.at(-1)!, placar });
    const modelo = modeloDaSala(caio.sessao.partida.estadoSala!, caio.sessao.partida.meuLugar, false);
    expect(modelo.placar.atual?.texto).toBe('Ana 1 · Beto 0 · Caio 0');
    expect(modelo.placar.atual?.rotuloDaModalidade).toBe('Mata-mata');
  });
});
