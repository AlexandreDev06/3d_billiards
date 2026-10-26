import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import { EMOJIS_DA_SALA, EMOJIS_PADRAO, LIMITES_PROTOCOLO, type MsgEmoji } from '@sinuca/protocolo';
import { aplicarTacada, novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { CONFIG_SALA_PADRAO } from './config';
import { ClienteDeTeste, TACADA_MEDIA, criarAmbiente, salaIniciada } from './para-testes';

const emoji = (e: MsgEmoji['emoji']): MsgEmoji => ({ tipo: 'emoji', emoji: e });
const chegados = (c: ClienteDeTeste) => c.conn.todas('emoji-retransmitido');

describe('sala — emojis', () => {
  it('o padrão do balde vem do protocolo: rajada de 3 e 1 por segundo', () => {
    expect(CONFIG_SALA_PADRAO.emoji).toEqual({ capacidade: LIMITES_PROTOCOLO.emojiRajada, porSegundo: LIMITES_PROTOCOLO.emojiPorSegundo });
    expect(CONFIG_SALA_PADRAO.emoji).toEqual({ capacidade: 3, porSegundo: 1 });
  });

  it('vai a todos, inclusive a quem soltou, com lugar e nome; espectador tem lugar nulo', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    [ana, beto, esp].forEach((c) => c.conn.limpar());
    beto.enviar(emoji('🔥'));
    esp.enviar(emoji('🍺'));
    for (const c of [ana, beto, esp]) {
      expect(chegados(c)).toEqual([
        { tipo: 'emoji-retransmitido', lugar: 1, nome: 'Beto', emoji: '🔥' },
        { tipo: 'emoji-retransmitido', lugar: null, nome: 'Esp', emoji: '🍺' },
      ]);
    }
  });

  it('cada um dos 40 do catálogo passa como veio', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    beto.conn.limpar();
    for (const e of EMOJIS_DA_SALA) {
      ana.enviar(emoji(e));
      amb.avancar(1000);
    }
    expect(chegados(beto).map((m) => m.emoji)).toEqual([...EMOJIS_DA_SALA]);
  });

  it('um do fim do catálogo (fora dos 8 padrões) é retransmitido a todos, inclusive a quem soltou, e o espectador também solta', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const codigo = ana.codigo;
    const fim = EMOJIS_DA_SALA[EMOJIS_DA_SALA.length - 1]!;
    expect(fim).toBe('💩');
    expect(EMOJIS_PADRAO).not.toContain(fim);
    ana.conn.limpar();
    beto.conn.limpar();
    ana.enviar(emoji(fim));
    for (const c of [ana, beto]) expect(chegados(c), c.nome).toEqual([{ tipo: 'emoji-retransmitido', lugar: 0, nome: 'Ana', emoji: fim }]);
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(codigo);
    expect(esp.conn.ultima('boas-vindas')).toMatchObject({ lugar: null });
    esp.conn.limpar();
    ana.conn.limpar();
    esp.enviar(emoji('🐐'));
    for (const c of [esp, ana]) expect(chegados(c), c.nome).toEqual([{ tipo: 'emoji-retransmitido', lugar: null, nome: 'Esp', emoji: '🐐' }]);
  });

  it('vale na espera, na partida e no fim, sem mexer no estado nem na vez', () => {
    const fimDeJogo = (p: EstadoPartida): ResultadoRegras => ({
      partida: { ...p, fase: 'fim', vez: 1, vencedor: 0, naMesa: p.naMesa.filter((b) => b !== 1) },
      consequencias: { faltas: [], retirar: [], recolocar: [], proximo: 1, vencedor: 0, texto: 'fim' },
    });
    const amb = criarAmbiente({}, { regras: { novaPartida, aplicarTacada: (p) => (p.fase === 'saida' ? fimDeJogo(p) : aplicarTacada(p, [])) } });
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);

    const soltar = (fase: 'espera' | 'jogando' | 'fim') => {
      // a sala segue em `jogando` com a partida terminada, à espera de `voltar-ao-lobby`
      expect(ana.estado.fase, fase).toBe(fase === 'espera' ? 'espera' : 'jogando');
      if (fase !== 'espera') expect(ana.visao!.partida.fase === 'fim', fase).toBe(fase === 'fim');
      beto.conn.limpar();
      ana.conn.limpar();
      beto.enviar(emoji('😂'));
      amb.avancar(3000);
      for (const c of [ana, beto]) expect(chegados(c), `${fase} ${c.nome}`).toEqual([{ tipo: 'emoji-retransmitido', lugar: 1, nome: 'Beto', emoji: '😂' }]);
      expect(ana.conn.recebidas.map((m) => m.tipo)).toEqual(['emoji-retransmitido']);
      expect(beto.erros).toHaveLength(0);
    };

    soltar('espera');
    ana.enviar({ tipo: 'iniciar' });
    const v = ana.visao!;
    soltar('jogando');
    ana.enviar({ tipo: 'tacada', seq: 0, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fimDeJogo(v.partida).partida, mesa: v.mesa });
    soltar('fim');
  });

  it('rajada de 3 passa e a 4ª some, sem erro para ninguém; o balde enche de novo com o relógio', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    beto.conn.limpar();
    for (let i = 0; i < 3; i++) ana.enviar(emoji('👏'));
    expect(chegados(beto)).toHaveLength(3);
    ana.enviar(emoji('👏'));
    ana.enviar(emoji('👏'));
    expect(chegados(beto)).toHaveLength(3);
    expect(chegados(ana)).toHaveLength(3);
    expect(ana.erros).toHaveLength(0);
    expect(beto.erros).toHaveLength(0);
    expect(ana.conn.totalPunido).toBe(0);
    expect(ana.conn.fechada).toBeNull();

    amb.avancar(999);
    ana.enviar(emoji('😱'));
    expect(chegados(beto)).toHaveLength(3);
    amb.avancar(1);
    ana.enviar(emoji('😱'));
    expect(chegados(beto)).toHaveLength(4);
    ana.enviar(emoji('😱'));
    expect(chegados(beto)).toHaveLength(4);
    expect(ana.erros).toHaveLength(0);

    // parado por muito tempo, o balde enche até a capacidade e não passa dela
    amb.avancar(60_000);
    for (let i = 0; i < 5; i++) ana.enviar(emoji('🎱'));
    expect(chegados(beto)).toHaveLength(7);
    expect(ana.erros).toHaveLength(0);
  });

  it('o balde é de cada participante: um esgotar não tira do outro, nem do espectador', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const esp = new ClienteDeTeste(amb, 'Esp').entrar(ana.codigo);
    beto.conn.limpar();
    for (let i = 0; i < 6; i++) ana.enviar(emoji('🤡'));
    for (let i = 0; i < 3; i++) beto.enviar(emoji('😤'));
    for (let i = 0; i < 4; i++) esp.enviar(emoji('🍺'));
    const por = (lugar: number | null) => chegados(beto).filter((m) => m.lugar === lugar).length;
    expect([por(0), por(1), por(null)]).toEqual([3, 3, 3]);
  });

  it('não gasta o balde do chat, e o chat não gasta o do emoji', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    beto.conn.limpar();
    for (let i = 0; i < 3; i++) ana.enviar(emoji('😂'));
    for (let i = 0; i < 5; i++) ana.enviar({ tipo: 'chat', texto: `m${i}` });
    expect(beto.conn.todas('chat-retransmitido')).toHaveLength(5);
    expect(chegados(beto)).toHaveLength(3);
    expect(ana.erros).toHaveLength(0);

    // chat esgotado: o emoji (de outro balde) continua a poder passar quando recarrega, e o chat segue recusado
    ana.enviar({ tipo: 'chat', texto: 'demais' });
    expect(ana.ultimoErro?.codigo).toBe('limite-mensagens');
    amb.avancar(1000);
    ana.enviar(emoji('🔥'));
    expect(chegados(beto)).toHaveLength(4);
    expect(ana.erros).toHaveLength(1);
  });

  it('o balde segue a config da sala (capacidade e ritmo)', () => {
    const amb = criarAmbiente({ emoji: { capacidade: 1, porSegundo: 0.5 } });
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    beto.conn.limpar();
    ana.enviar(emoji('😂'));
    ana.enviar(emoji('😂'));
    expect(chegados(beto)).toHaveLength(1);
    amb.avancar(1999);
    ana.enviar(emoji('😂'));
    expect(chegados(beto)).toHaveLength(1);
    amb.avancar(1);
    ana.enviar(emoji('😂'));
    expect(chegados(beto)).toHaveLength(2);
  });

  it('quem volta com o token recebe emojis de novo e o balde dele é o mesmo da sala', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    for (let i = 0; i < 3; i++) ana.enviar(emoji('😂'));
    ana.sair();
    ana.reconectar();
    beto.conn.limpar();
    ana.conn.limpar();
    beto.enviar(emoji('🍺'));
    expect(chegados(ana)).toHaveLength(1);
    expect(chegados(beto)).toHaveLength(1);
  });

  it('emoji fora da lista é recusado como mensagem-invalida, não é retransmitido e a conexão segue de pé', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    beto.conn.limpar();
    for (const ruim of ['😀', '🍷', 'oi', '', '👏🏽', '👍🏽', '😂️', '💩\uFE0F', '😂😂']) {
      ana.enviar({ tipo: 'emoji', emoji: ruim } as never);
      expect(ana.ultimoErro?.codigo, JSON.stringify(ruim)).toBe('mensagem-invalida');
    }
    expect(chegados(beto)).toHaveLength(0);
    expect(chegados(ana)).toHaveLength(0);
    expect(ana.conn.fechada).toBeNull();
    // o emoji recusado não gastou ficha: a rajada inteira ainda passa
    for (let i = 0; i < 3; i++) ana.enviar(emoji('🎱'));
    expect(chegados(beto)).toHaveLength(3);
  });

  it('conta como atividade: segura a sala aberta como o chat', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(amb.config.salaOciosaMs - 1000);
    ana.enviar(emoji('🍺'));
    amb.avancar(amb.config.salaOciosaMs - 1000);
    expect(amb.registro.totalSalas).toBe(1);
    expect(beto.conn.fechada).toBeNull();
    amb.avancar(2000);
    expect(amb.registro.totalSalas).toBe(0);
    expect(ana.conn.fechada?.codigo).toBe(4001);
  });

  it('não adia o relógio da tacada', () => {
    const amb = criarAmbiente();
    const [ana, beto] = salaIniciada(amb, '1x1', { tempoS: 30 }) as [ClienteDeTeste, ClienteDeTeste];
    amb.avancar(29_000);
    ana.enviar(emoji('😤'));
    beto.enviar(emoji('😂'));
    amb.avancar(2_499);
    expect(beto.estado.vez).toBe(0);
    amb.avancar(1);
    expect(beto.estado.vez).toBe(1);
  });

  it('nada do emoji vai ao log, nem o recusado', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    const antes = amb.logs.length;
    ana.enviar(emoji('🍺'));
    ana.enviar(emoji('🔥'));
    ana.enviar({ tipo: 'emoji', emoji: '😀' } as never);
    expect(amb.logs.slice(antes).filter((l) => !l.startsWith('recusou'))).toEqual([]);
    const tudo = amb.logs.join('\n');
    for (const e of [...EMOJIS_DA_SALA, '😀']) expect(tudo).not.toContain(e);
    expect(tudo).not.toContain('emoji');
  });

  it('fora de uma sala o emoji é recusado com fora-da-sala e não chega a ninguém', () => {
    const amb = criarAmbiente();
    const [ana] = salaIniciada(amb) as [ClienteDeTeste, ClienteDeTeste];
    ana.conn.limpar();
    const solto = new ClienteDeTeste(amb, 'Solto');
    solto.enviar(emoji('🍺'));
    expect(solto.ultimoErro?.codigo).toBe('fora-da-sala');
    expect(chegados(ana)).toHaveLength(0);
  });
});
