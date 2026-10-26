import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, criarRng, simularTacada } from '@sinuca/fisica';
import type { MensagemDoCliente, MsgApostaPaga, MsgEstadoSala, MsgMissoes } from '@sinuca/protocolo';
import { REGRAS_DO_PACOTE } from '../jogo/regras';
import { PartidaOnline } from './partida-online';

const APOSTA_PAGA: MsgApostaPaga = { tipo: 'aposta-paga', valor: 20, variacoes: [{ lugar: 0, nome: 'Ana', delta: 20, saldo: 190 }] };
const MISSOES: MsgMissoes = {
  tipo: 'missoes',
  missoes: {
    dia: '2026-10-26',
    fimMs: Date.parse('2026-10-27T03:00:00Z'),
    itens: [
      { id: 'pelo-meio', progresso: 1, meta: 2, cumprida: false },
      { id: 'fecha-a-conta', progresso: 1, meta: 1, cumprida: true },
      { id: 'volta-ao-mundo', progresso: 0, meta: 1, cumprida: false },
    ],
  },
  cumpridas: ['fecha-a-conta'],
};

function montar() {
  const ordem: string[] = [];
  const partida = new PartidaOnline({
    conexao: { enviar: (_m: MensagemDoCliente) => true },
    jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada },
    fisica: () => CONFIG_FISICA_PADRAO,
    rng: criarRng(1),
    agora: () => 0,
    ouvintes: {
      aoApostaPaga: () => ordem.push('aposta-paga'),
      aoMissoes: (m) => ordem.push(`missoes:${m.cumpridas.join(',')}`),
      aoEstadoSala: (_e: MsgEstadoSala) => ordem.push('estado-sala'),
    },
  });
  partida.definirConectado(true);
  return { partida, ordem };
}

describe('PartidaOnline: as missões do dia (L32)', () => {
  it('a mensagem `missoes` chega ao ouvinte, sem mexer na aposta paga', () => {
    const t = montar();
    t.partida.receber(APOSTA_PAGA);
    t.partida.receber(MISSOES);
    expect(t.ordem).toEqual(['aposta-paga', 'missoes:fecha-a-conta']);
    expect(t.partida.apostaPaga).toEqual(APOSTA_PAGA);
  });

  it('sem ouvinte a mensagem é ignorada sem lançar', () => {
    const partida = new PartidaOnline({
      conexao: { enviar: () => true },
      jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada },
      fisica: () => CONFIG_FISICA_PADRAO,
      rng: criarRng(1),
      agora: () => 0,
      ouvintes: {},
    });
    expect(() => partida.receber(MISSOES)).not.toThrow();
  });
});
