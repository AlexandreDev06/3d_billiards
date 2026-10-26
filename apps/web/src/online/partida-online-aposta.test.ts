import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, criarRng, simularTacada } from '@sinuca/fisica';
import type { MensagemDoCliente, MotivoRetrato, MsgApostaPaga, MsgRetrato } from '@sinuca/protocolo';
import { PRESET_BOTECO, novaPartida } from '@sinuca/regras';
import { REGRAS_DO_PACOTE } from '../jogo/regras';
import { ArmazemDeSessao } from './armazem';
import type { PedidoDeEntrada } from './cliente-sala';
import { ArmazenamentoFalso, RelogioFalso, SalaFalsa } from './para-testes';
import { PartidaOnline } from './partida-online';
import { SessaoOnline } from './sessao';

const APOSTA_PAGA: MsgApostaPaga = {
  tipo: 'aposta-paga',
  valor: 20,
  variacoes: [
    { lugar: 0, nome: 'Ana', delta: 20, saldo: 120 },
    { lugar: 1, nome: 'Beto', delta: -20, saldo: 80 },
  ],
};

function montar() {
  const enviadas: MensagemDoCliente[] = [];
  const pagas: MsgApostaPaga[] = [];
  const partida = new PartidaOnline({
    conexao: { enviar: (m) => (enviadas.push(m), true) },
    jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada },
    fisica: () => CONFIG_FISICA_PADRAO,
    rng: criarRng(1),
    agora: () => 0,
    ouvintes: { aoApostaPaga: (m) => pagas.push(m) },
  });
  partida.definirConectado(true);
  const { partida: estado, arrumacao } = novaPartida(
    PRESET_BOTECO.regras,
    [
      { id: 'lugar-0', nome: 'Ana', equipe: 0 },
      { id: 'lugar-1', nome: 'Beto', equipe: 1 },
    ],
    criarRng(1),
  );
  const retrato = (motivo: MotivoRetrato): MsgRetrato => ({ tipo: 'retrato', motivo, seq: 0, partida: estado, arrumacao, semente: 5, mesa: null, ultima: null });
  return { partida, enviadas, pagas, retrato };
}

describe('PartidaOnline: a aposta que acabou de ser paga', () => {
  it('guarda a `aposta-paga` da sala e avisa o ouvinte; antes dela não há nada', () => {
    const t = montar();
    expect(t.partida.apostaPaga).toBeNull();
    t.partida.receber(APOSTA_PAGA);
    expect(t.partida.apostaPaga).toEqual(APOSTA_PAGA);
    expect(t.pagas).toEqual([APOSTA_PAGA]);
  });

  it('a partida seguinte (retrato de início ou de nova partida) esquece a aposta de antes', () => {
    for (const motivo of ['inicio', 'nova-partida'] as const) {
      const t = montar();
      t.partida.receber(APOSTA_PAGA);
      t.partida.receber(t.retrato(motivo));
      expect(t.partida.apostaPaga).toBeNull();
    }
  });

  it('voltar da queda, ressincronizar ou a vez que passou não esquecem: é a mesma partida', () => {
    for (const motivo of ['entrada', 'ressincronia', 'vez-passou'] as const) {
      const t = montar();
      t.partida.receber(APOSTA_PAGA);
      t.partida.receber(t.retrato(motivo));
      expect(t.partida.apostaPaga).toEqual(APOSTA_PAGA);
    }
  });

  it('uma aposta anulada também é guardada, como a sala a mandou', () => {
    const t = montar();
    const anulada: MsgApostaPaga = { tipo: 'aposta-paga', valor: 10, variacoes: [], anulada: 'carteira-repetida' };
    t.partida.receber(anulada);
    expect(t.partida.apostaPaga).toEqual(anulada);
  });
});

describe('PartidaOnline: configurar a aposta', () => {
  it('manda só a aposta na espera, como os outros campos', () => {
    const t = montar();
    t.partida.configurarSala({ aposta: 50 });
    expect(t.enviadas).toEqual([{ tipo: 'configurar-sala', aposta: 50 }]);
  });
});

// ---------------------------------------------------------------- pela sala falsa (a sessão inteira)

/** Códigos com a forma que a sala cria: 43 caracteres base64url. */
const CODIGO_ANA = `${'Ana'.repeat(14)}A`;
const CODIGO_BETO = `${'Beto'.repeat(10)}Bet`;

function sala() {
  const falsa = new SalaFalsa();
  const relogio = new RelogioFalso();
  let semente = 1;
  const cliente = (nome: string, entrar: boolean, carteira: string | undefined, extra: Partial<Extract<PedidoDeEntrada, { tipo: 'criar' }>> = {}) => {
    const ordem: string[] = [];
    const pagas: MsgApostaPaga[] = [];
    const sessao = new SessaoOnline({
      url: 'ws://teste/sala',
      criarSocket: falsa.criarSocket,
      armazem: new ArmazemDeSessao(new ArmazenamentoFalso(), `aba-${nome}`, relogio.agora),
      agendar: relogio.agendar,
      agora: relogio.agora,
      sortear: () => 1,
      jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada },
      fisica: () => CONFIG_FISICA_PADRAO,
      rng: criarRng(semente++),
      carteira: () => carteira,
      ouvintes: {
        aoEstadoSala: () => ordem.push('estado-sala'),
        aoApostaPaga: (m) => (pagas.push(m), ordem.push('aposta-paga')),
      },
    });
    sessao.abrir(entrar ? { tipo: 'entrar', nome, codigo: falsa.codigo } : { tipo: 'criar', nome, modo: '1x1', preset: 'Boteco', regras: PRESET_BOTECO.regras, ...extra });
    falsa.abrirPendentes();
    return { sessao, ordem, pagas };
  };
  return { falsa, cliente };
}

describe('SessaoOnline: carteira e aposta pela sala', () => {
  it('o código vai ao criar e ao entrar, a aposta escolhida vale na sala e cada lugar mostra saldo e skin', () => {
    const t = sala();
    t.falsa.carteiras.set(CODIGO_ANA, { saldo: 100, skin: 'ebano' });
    t.falsa.carteiras.set(CODIGO_BETO, { saldo: -30, skin: 'classico' });
    const ana = t.cliente('Ana', false, CODIGO_ANA, { aposta: 20 });
    t.cliente('Beto', true, CODIGO_BETO);

    expect(t.falsa.recebidas.map((m) => (m.tipo === 'criar-sala' || m.tipo === 'entrar' ? m.carteira : undefined)).filter(Boolean)).toEqual([CODIGO_ANA, CODIGO_BETO]);
    const estado = ana.sessao.partida.estadoSala!;
    expect(estado.aposta).toBe(20);
    expect(estado.lugares.slice(0, 2).map((l) => [l.saldo, l.skin])).toEqual([
      [100, 'ebano'],
      [-30, 'classico'],
    ]);
  });

  it('o fim apostado: a `aposta-paga` chega antes do `estado-sala` com os saldos novos', () => {
    const t = sala();
    t.falsa.carteiras.set(CODIGO_ANA, { saldo: 100, skin: 'classico' });
    t.falsa.carteiras.set(CODIGO_BETO, { saldo: 100, skin: 'classico' });
    const ana = t.cliente('Ana', false, CODIGO_ANA, { aposta: 20 });
    const beto = t.cliente('Beto', true, CODIGO_BETO);
    ana.sessao.partida.iniciar();
    ana.ordem.length = 0;
    beto.ordem.length = 0;

    t.falsa.encerrarPartida();

    for (const c of [ana, beto]) {
      expect(c.ordem).toEqual(['aposta-paga', 'estado-sala']);
      expect(c.pagas[0]).toEqual({
        tipo: 'aposta-paga',
        valor: 20,
        variacoes: [
          { lugar: 0, nome: 'Ana', delta: 20, saldo: 120 },
          { lugar: 1, nome: 'Beto', delta: -20, saldo: 80 },
        ],
      });
      expect(c.sessao.partida.apostaPaga).toEqual(c.pagas[0]);
    }
    expect(ana.sessao.partida.estadoSala!.lugares.slice(0, 2).map((l) => l.saldo)).toEqual([120, 80]);
  });

  it('sem carteira de um lado ninguém paga: nem mensagem, e o lugar mostra "sem carteira" (saldo null)', () => {
    const t = sala();
    t.falsa.carteiras.set(CODIGO_ANA, { saldo: 100, skin: 'classico' });
    const ana = t.cliente('Ana', false, CODIGO_ANA);
    t.cliente('Beto', true, undefined);
    ana.sessao.partida.iniciar();
    t.falsa.encerrarPartida();

    expect(ana.pagas).toEqual([]);
    expect(ana.sessao.partida.apostaPaga).toBeNull();
    expect(ana.sessao.partida.estadoSala!.lugares.slice(0, 2).map((l) => l.saldo)).toEqual([100, null]);
  });

  it('o anfitrião muda a aposta na espera e todos veem', () => {
    const t = sala();
    const ana = t.cliente('Ana', false, undefined);
    const beto = t.cliente('Beto', true, undefined);
    ana.sessao.partida.configurarSala({ aposta: 100 });
    expect(ana.sessao.partida.estadoSala!.aposta).toBe(100);
    expect(beto.sessao.partida.estadoSala!.aposta).toBe(100);
  });
});

describe('SessaoOnline: o giz do outro pela sala', () => {
  it('o giz da minha mira chega à `miraRemota` do outro, e a mira seguinte sem giz o desliga', () => {
    const t = sala();
    const ana = t.cliente('Ana', false, undefined);
    const beto = t.cliente('Beto', true, undefined);
    ana.sessao.partida.iniciar();
    expect(ana.sessao.partida.lugarDaVez).toBe(0);
    ana.sessao.partida.enviarMira({ angulo: 1, lateral: 0, vertical: 0, recuo: 0.04, giz: true });
    expect(beto.sessao.miraRemota.giz).toBe(true);
    ana.sessao.partida.enviarMira({ angulo: 1, lateral: 0, vertical: 0, recuo: 0.04 });
    expect(beto.sessao.miraRemota.giz).toBe(false);
  });

  it('a sala não inventa giz: sem a chave na mira, o outro não vê giz', () => {
    const t = sala();
    const ana = t.cliente('Ana', false, undefined);
    const beto = t.cliente('Beto', true, undefined);
    ana.sessao.partida.iniciar();
    ana.sessao.partida.enviarMira({ angulo: 2, lateral: 0.1, vertical: 0, recuo: 0.05 });
    expect(beto.sessao.miraRemota.giz).toBe(false);
    expect(beto.sessao.miraRemota.angulo).toBe(2);
  });
});
