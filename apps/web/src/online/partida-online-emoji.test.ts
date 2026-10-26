import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO, criarRng, simularTacada } from '@sinuca/fisica';
import { EMOJIS_DA_SALA, LIMITES_PROTOCOLO, type MensagemDoCliente, type MsgEmojiRetransmitido } from '@sinuca/protocolo';
import { PRESET_BOTECO } from '@sinuca/regras';
import { REGRAS_DO_PACOTE } from '../jogo/regras';
import { ArmazemDeSessao } from './armazem';
import { ArmazenamentoFalso, RelogioFalso, SalaFalsa } from './para-testes';
import { PartidaOnline } from './partida-online';
import { SessaoOnline } from './sessao';

/** O adaptador sozinho, com uma conexão que anota o que sai e um relógio à mão. */
function direto(conectado = true) {
  const enviadas: MensagemDoCliente[] = [];
  const recebidos: MsgEmojiRetransmitido[] = [];
  const relogio = { agoraMs: 0 };
  const partida = new PartidaOnline({
    conexao: { enviar: (m) => (enviadas.push(m), true) },
    jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada },
    fisica: () => CONFIG_FISICA_PADRAO,
    rng: criarRng(1),
    agora: () => relogio.agoraMs,
    ouvintes: { aoEmoji: (m) => recebidos.push(m) },
  });
  partida.definirConectado(conectado);
  return { partida, enviadas, recebidos, relogio };
}

describe('PartidaOnline: mandar emoji', () => {
  it('manda `emoji` com o da lista e devolve true', () => {
    const t = direto();
    expect(t.partida.enviarEmoji('🔥')).toBe(true);
    expect(t.enviadas).toEqual([{ tipo: 'emoji', emoji: '🔥' }]);
  });

  it('cada um do catálogo da sala sai como está na lista', () => {
    const t = direto();
    for (const emoji of EMOJIS_DA_SALA) {
      t.relogio.agoraMs += 1000;
      expect(t.partida.enviarEmoji(emoji)).toBe(true);
    }
    expect(t.enviadas.map((m) => (m.tipo === 'emoji' ? m.emoji : null))).toEqual([...EMOJIS_DA_SALA]);
  });

  it('o balde da sala vale aqui: rajada de 3, a quarta nem sai (a sala descartaria calada)', () => {
    const t = direto();
    const resultados = Array.from({ length: 5 }, () => t.partida.enviarEmoji('😂'));
    expect(LIMITES_PROTOCOLO.emojiRajada).toBe(3);
    expect(resultados).toEqual([true, true, true, false, false]);
    expect(t.enviadas).toHaveLength(3);
  });

  it('recarrega com o tempo: 1 por segundo', () => {
    const t = direto();
    for (let i = 0; i < 3; i++) t.partida.enviarEmoji('😂');
    t.relogio.agoraMs = 999;
    expect(t.partida.enviarEmoji('😂')).toBe(false);
    t.relogio.agoraMs = 1000;
    expect(t.partida.enviarEmoji('😂')).toBe(true);
    expect(t.partida.enviarEmoji('😂')).toBe(false);
    expect(t.enviadas).toHaveLength(4);
  });

  it('sem conexão não manda nada e não gasta o balde', () => {
    const t = direto(false);
    expect(t.partida.enviarEmoji('🍺')).toBe(false);
    expect(t.enviadas).toEqual([]);
    t.partida.definirConectado(true);
    expect([t.partida.enviarEmoji('🍺'), t.partida.enviarEmoji('🍺'), t.partida.enviarEmoji('🍺'), t.partida.enviarEmoji('🍺')]).toEqual([true, true, true, false]);
  });

  it('o meu emoji não aparece antes de a sala devolver: mandar não chama o ouvinte', () => {
    const t = direto();
    t.partida.enviarEmoji('🎱');
    expect(t.recebidos).toEqual([]);
    t.partida.receber({ tipo: 'emoji-retransmitido', lugar: 0, nome: 'Ana', emoji: '🎱' });
    expect(t.recebidos).toEqual([{ tipo: 'emoji-retransmitido', lugar: 0, nome: 'Ana', emoji: '🎱' }]);
  });

  it('o emoji retransmitido chega ao ouvinte com lugar, nome e emoji; espectador vem com lugar null', () => {
    const t = direto();
    t.partida.receber({ tipo: 'emoji-retransmitido', lugar: null, nome: 'Zé', emoji: '🤡' });
    expect(t.recebidos).toEqual([{ tipo: 'emoji-retransmitido', lugar: null, nome: 'Zé', emoji: '🤡' }]);
  });
});

describe('SessaoOnline: emojis pela sala', () => {
  function montar() {
    const sala = new SalaFalsa();
    const relogio = new RelogioFalso();
    const avisos: Record<string, string[]> = {};
    const cliente = (nome: string, entrar: boolean) => {
      avisos[nome] = [];
      const sessao = new SessaoOnline({
        url: 'ws://teste/sala',
        criarSocket: sala.criarSocket,
        armazem: new ArmazemDeSessao(new ArmazenamentoFalso(), `aba-${nome}`, relogio.agora),
        agendar: relogio.agendar,
        agora: relogio.agora,
        sortear: () => 1,
        jogo: { regras: REGRAS_DO_PACOTE, simular: simularTacada },
        fisica: () => CONFIG_FISICA_PADRAO,
        rng: criarRng(1),
        ouvintes: { aoEmoji: (m) => avisos[nome]!.push(`${m.nome} ${m.emoji}`) },
      });
      sessao.abrir(entrar ? { tipo: 'entrar', nome, codigo: sala.codigo } : { tipo: 'criar', nome, modo: '1x1', preset: 'Boteco', regras: PRESET_BOTECO.regras });
      sala.abrirPendentes();
      return sessao;
    };
    return { sala, relogio, avisos, cliente };
  }

  it('o emoji de Ana chega a Ana e a Beto, e entra na pilha dos dois', () => {
    const { avisos, cliente, relogio } = montar();
    const ana = cliente('Ana', false);
    const beto = cliente('Beto', true);
    expect(ana.partida.enviarEmoji('🔥')).toBe(true);
    expect(avisos.Ana).toEqual(['Ana 🔥']);
    expect(avisos.Beto).toEqual(['Ana 🔥']);
    for (const sessao of [ana, beto]) {
      expect(sessao.emojis.visiveis(relogio.agoraMs)).toMatchObject([{ nome: 'Ana', emoji: '🔥', lugar: 0 }]);
    }
  });

  it('na espera, no jogo e no fim; espectador também manda e todos veem com lugar null', () => {
    const { avisos, cliente, sala } = montar();
    const ana = cliente('Ana', false);
    const beto = cliente('Beto', true);
    const zeca = cliente('Zeca', true);
    zeca.partida.escolherLugar(null);
    expect(zeca.partida.meuLugar).toBeNull();
    zeca.partida.enviarEmoji('🍺');
    expect(ana.emojis.visiveis(0)).toMatchObject([{ nome: 'Zeca', emoji: '🍺', lugar: null }]);
    ana.partida.iniciar();
    beto.partida.enviarEmoji('😱');
    sala.encerrarPartida();
    ana.partida.enviarEmoji('👏');
    expect(avisos.Zeca).toEqual(['Zeca 🍺', 'Beto 😱', 'Ana 👏']);
    expect(beto.emojis.visiveis(0).map((b) => b.emoji)).toEqual(['🍺', '😱', '👏']);
  });

  it('cinco seguidas: três saem (o balde) e a sala só retransmite essas', () => {
    const { avisos, cliente, sala } = montar();
    const ana = cliente('Ana', false);
    cliente('Beto', true);
    const mandados = [1, 2, 3, 4, 5].map(() => ana.partida.enviarEmoji('🔥'));
    expect(mandados).toEqual([true, true, true, false, false]);
    expect(sala.recebidas.filter((m) => m.tipo === 'emoji')).toHaveLength(3);
    expect(avisos.Beto).toHaveLength(3);
  });
});
