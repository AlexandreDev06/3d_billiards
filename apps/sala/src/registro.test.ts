import { describe, expect, it } from 'vitest';
import { PROTOCOLO_VERSAO, PROTOCOLO_VERSAO_MINIMA, type MensagemDoCliente } from '@sinuca/protocolo';
import { PRESET_BOTECO, PRESET_MATA_MATA } from '@sinuca/regras';
import { ClienteDeTeste, ConexaoFalsa, criarAmbiente } from './para-testes';

const criar = (nome = 'Ana', mudanca: object = {}): MensagemDoCliente => ({
  tipo: 'criar-sala',
  versao: PROTOCOLO_VERSAO,
  nome,
  modo: '1x1',
  preset: 'Boteco',
  regras: PRESET_BOTECO.regras,
  ...mudanca,
});

describe('registro — criar e entrar', () => {
  it('recusa versão do protocolo diferente ao criar e ao entrar', () => {
    const amb = criarAmbiente();
    const c = new ConexaoFalsa('c');
    amb.registro.receber(c, criar('Ana', { versao: PROTOCOLO_VERSAO + 1 }));
    expect(c.ultima('erro')?.codigo).toBe('versao');
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    const d = new ConexaoFalsa('d');
    amb.registro.receber(d, { tipo: 'entrar', versao: 0, codigo: ana.codigo, nome: 'Beto' });
    expect(d.ultima('erro')?.codigo).toBe('versao');
    expect(amb.registro.totalSalas).toBe(1);
  });

  it('aba antiga (protocolo 1 a 8) é recusada com o código versao e o pedido de recarregar a página, ao criar e ao entrar', () => {
    const amb = criarAmbiente();
    for (const versao of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const velha = new ConexaoFalsa(`velha-${versao}`);
      amb.registro.receber(velha, criar('Ana', { versao }));
      expect(velha.recebidas).toHaveLength(1);
      expect(velha.ultima('erro')).toMatchObject({ codigo: 'versao', mensagem: expect.stringMatching(/recarregue a página/i) });
    }
    expect(amb.registro.totalSalas).toBe(0);

    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    for (const versao of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const outra = new ConexaoFalsa(`outra-${versao}`);
      amb.registro.receber(outra, { tipo: 'entrar', versao, codigo: ana.codigo, nome: 'Beto', token: ana.token });
      expect(outra.ultima('erro')).toMatchObject({ codigo: 'versao', mensagem: expect.stringMatching(/recarregue a página/i) });
      expect(outra.todas('boas-vindas')).toHaveLength(0);
    }
    expect(ana.estado.lugares[1]!.nome).toBeNull();
  });

  it('o protocolo atual é o 10 e quem fala 10 cria e entra normalmente', () => {
    expect(PROTOCOLO_VERSAO).toBe(10);
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    const nova = new ConexaoFalsa('nova');
    amb.registro.receber(nova, { tipo: 'entrar', versao: 10, codigo: ana.codigo, nome: 'Beto' });
    expect(nova.ultima('boas-vindas')).toMatchObject({ lugar: 1, versao: 10 });
    expect(nova.todas('erro')).toHaveLength(0);
  });

  it('a 9, que não conhece o balão (L47), ainda é atendida: cria e entra, e a 8 (e a 11) são recusadas', () => {
    expect(PROTOCOLO_VERSAO_MINIMA).toBe(9);
    const amb = criarAmbiente();
    const velha = new ConexaoFalsa('velha');
    amb.registro.receber(velha, criar('Ana', { versao: 9 }));
    expect(velha.todas('erro')).toHaveLength(0);
    expect(velha.ultima('boas-vindas')).toMatchObject({ lugar: 0 });
    const ana = new ClienteDeTeste(amb, 'Ana2', '198.51.100.7').criar();
    const nova = new ConexaoFalsa('nova');
    amb.registro.receber(nova, { tipo: 'entrar', versao: 9, codigo: ana.codigo, nome: 'Beto' });
    expect(nova.ultima('boas-vindas')).toMatchObject({ lugar: 1 });
    expect(nova.todas('erro')).toHaveLength(0);
    for (const versao of [8, 11]) {
      const c = new ConexaoFalsa(`v${versao}`);
      amb.registro.receber(c, criar('Cris', { versao }));
      amb.registro.receber(c, { tipo: 'entrar', versao, codigo: ana.codigo, nome: 'Cris' });
      expect(c.todas('erro').map((e) => e.codigo)).toEqual(['versao', 'versao']);
    }
  });

  describe('cliente de antes da pena do suicídio (L19): as regras dele não têm `suicidioNoMataMata`', () => {
    const semAChave = (regras: object): object => {
      const velhas: Record<string, unknown> = { ...regras };
      delete velhas.suicidioNoMataMata;
      return velhas;
    };
    const velhas = {
      boteco: semAChave(PRESET_BOTECO.regras),
      mataMata: semAChave(PRESET_MATA_MATA.regras),
    };

    it('com a versão antiga a sala recusa pela versão (recarregue a página), antes de ler as regras: nunca "regras.suicidioNoMataMata: falta"', () => {
      expect(velhas.mataMata).not.toHaveProperty('suicidioNoMataMata');
      const amb = criarAmbiente();
      for (const [nome, regras] of Object.entries(velhas)) {
        const c = new ConexaoFalsa(`velho-${nome}`);
        amb.registro.receber(c, criar('Ana', { versao: PROTOCOLO_VERSAO_MINIMA - 1, regras, ...(nome === 'mataMata' ? { preset: 'Mata-mata', modalidade: 'mata-mata' } : {}) }));
        expect(c.recebidas, nome).toHaveLength(1);
        expect(c.ultima('erro'), nome).toMatchObject({ codigo: 'versao', mensagem: expect.stringMatching(/recarregue a página/i) });
        expect(c.ultima('erro')!.mensagem, nome).not.toMatch(/suicidioNoMataMata/);
      }
      expect(amb.registro.totalSalas).toBe(0);
    });

    it('a versão atual com regras sem a chave segue sendo regras-invalidas: toda chave é obrigatória, e nada é criado', () => {
      const amb = criarAmbiente();
      const c = new ConexaoFalsa('v5-sem-chave');
      amb.registro.receber(c, criar('Ana', { regras: velhas.boteco }));
      expect(c.ultima('erro')).toMatchObject({ codigo: 'regras-invalidas' });
      amb.registro.receber(c, criar('Ana', { preset: 'Mata-mata', modalidade: 'mata-mata', regras: velhas.mataMata }));
      expect(c.todas('erro').map((e) => e.codigo)).toEqual(['regras-invalidas', 'regras-invalidas']);
      expect(amb.registro.totalSalas).toBe(0);
    });
  });

  describe('cliente de antes da pena do cegar (L21): as regras dele têm `suicidioNoMataMata` mas não `cegarNoMataMata`', () => {
    const semOCegar = (regras: object): object => {
      const velhas: Record<string, unknown> = { ...regras };
      delete velhas.cegarNoMataMata;
      return velhas;
    };
    const mataMata = { preset: 'Mata-mata', modalidade: 'mata-mata', regras: semOCegar(PRESET_MATA_MATA.regras) };

    it('com a versão antiga a sala recusa pela versão (recarregue a página), nunca "regras.cegarNoMataMata: falta"', () => {
      expect(mataMata.regras).not.toHaveProperty('cegarNoMataMata');
      const amb = criarAmbiente();
      const c = new ConexaoFalsa('velho-cegar');
      amb.registro.receber(c, criar('Ana', { versao: PROTOCOLO_VERSAO_MINIMA - 1, ...mataMata }));
      expect(c.recebidas).toHaveLength(1);
      expect(c.ultima('erro')).toMatchObject({ codigo: 'versao', mensagem: expect.stringMatching(/recarregue a página/i) });
      expect(c.ultima('erro')!.mensagem).not.toMatch(/cegarNoMataMata/);
      expect(amb.registro.totalSalas).toBe(0);
    });

    it('a versão atual com regras sem a chave é regras-invalidas e nada é criado; com a chave, a sala nasce com a pena', () => {
      const amb = criarAmbiente();
      const c = new ConexaoFalsa('v5-sem-cegar');
      amb.registro.receber(c, criar('Ana', mataMata));
      expect(c.ultima('erro')).toMatchObject({ codigo: 'regras-invalidas' });
      expect(amb.registro.totalSalas).toBe(0);
      amb.registro.receber(c, criar('Ana', { preset: 'Mata-mata', modalidade: 'mata-mata', regras: PRESET_MATA_MATA.regras }));
      expect(amb.registro.totalSalas).toBe(1);
    });
  });

  it('entrar em código que não existe', () => {
    const amb = criarAmbiente();
    const c = new ConexaoFalsa('c');
    amb.registro.receber(c, { tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'ABCDE', nome: 'Beto' });
    expect(c.ultima('erro')?.codigo).toBe('sala-inexistente');
  });

  it('quem já está numa sala não cria nem entra em outra', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    const outra = new ClienteDeTeste(amb, 'Bia').criar();
    const depois = (acao: () => void) => {
      const antes = ana.conn.recebidas.length;
      acao();
      return ana.conn.recebidas.slice(antes).map((m) => (m.tipo === 'erro' ? m.codigo : m.tipo));
    };
    expect(depois(() => ana.criar())).toEqual(['ja-na-sala']);
    expect(depois(() => ana.entrar(outra.codigo))).toEqual(['ja-na-sala']);
    expect(amb.registro.totalSalas).toBe(2);
    expect(outra.estado.lugares[1]!.nome).toBeNull();
  });

  it('mensagens de jogo antes de entrar numa sala dão fora-da-sala; ping responde sempre', () => {
    const amb = criarAmbiente();
    const c = new ConexaoFalsa('c');
    const mensagens: MensagemDoCliente[] = [
      { tipo: 'escolher-lugar', lugar: 1 },
      { tipo: 'iniciar' },
      { tipo: 'mira', angulo: 0, lateral: 0, vertical: 0, recuo: 0 },
      { tipo: 'chat', texto: 'oi' },
      { tipo: 'nova-partida' },
    ];
    for (const m of mensagens) amb.registro.receber(c, m);
    expect(c.todas('erro').map((e) => e.codigo)).toEqual(mensagens.map(() => 'fora-da-sala'));
    amb.registro.receber(c, { tipo: 'ping', t: 42.5 });
    expect(c.ultima('pong')).toEqual({ tipo: 'pong', t: 42.5 });
  });

  it('recusa regras fora das opções do preset (valor desconhecido, chave a mais, chave a menos)', () => {
    const amb = criarAmbiente();
    const ruins = [
      { ...PRESET_BOTECO.regras, bolas: '3-15' },
      { ...PRESET_BOTECO.regras, chaveNova: true },
      Object.fromEntries(Object.entries(PRESET_BOTECO.regras).filter(([k]) => k !== 'penaDireta')),
    ];
    for (const regras of ruins) {
      const c = new ConexaoFalsa('c');
      amb.registro.receber(c, criar('Ana', { regras }));
      expect(c.ultima('erro')?.codigo, JSON.stringify(regras)).toBe('regras-invalidas');
    }
    expect(amb.registro.totalSalas).toBe(0);
  });

  it('nome inválido ao criar não cria sala', () => {
    const amb = criarAmbiente();
    const c = new ConexaoFalsa('c');
    amb.registro.receber(c, criar('   '));
    expect(c.ultima('erro')?.codigo).toBe('nome-invalido');
    expect(amb.registro.totalSalas).toBe(0);
  });
});

describe('registro — limites', () => {
  it('limita o número de salas e libera vaga quando uma some', () => {
    const amb = criarAmbiente({ maxSalas: 2 });
    new ClienteDeTeste(amb, 'A').criar();
    const b = new ClienteDeTeste(amb, 'B').criar();
    const c = new ClienteDeTeste(amb, 'C').criar();
    expect(c.ultimoErro?.codigo).toBe('servidor-cheio');
    expect(amb.registro.totalSalas).toBe(2);
    b.sair();
    amb.avancar(amb.config.salaVaziaMs + 1000);
    const d = new ClienteDeTeste(amb, 'D').criar();
    expect(d.conn.ultima('boas-vindas')).toBeDefined();
  });

  it('códigos de sala são únicos mesmo se o sorteio repetir; sorteio que só repete acaba em servidor-cheio', () => {
    let n = 0;
    const amb = criarAmbiente({}, { sortear: () => (n++ < 5 ? 0 : n % 31) });
    const a = new ClienteDeTeste(amb, 'A').criar();
    const b = new ClienteDeTeste(amb, 'B').criar();
    expect(b.codigo).not.toBe(a.codigo);

    const preso = criarAmbiente({}, { sortear: () => 3 });
    new ClienteDeTeste(preso, 'A').criar();
    const segundo = new ClienteDeTeste(preso, 'B').criar();
    expect(segundo.ultimoErro?.codigo).toBe('servidor-cheio');
  });

  it('conta conexões e remove a conexão de quem saiu', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana').criar();
    const beto = new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    expect(amb.registro.totalConexoes).toBe(2);
    beto.sair();
    expect(amb.registro.totalConexoes).toBe(1);
    amb.registro.desconectar(new ConexaoFalsa('nunca-entrou'));
    expect(amb.registro.totalConexoes).toBe(1);
  });
});
