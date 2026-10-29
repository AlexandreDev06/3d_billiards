/**
 * A aparência do balão dentro da sala (L47): cada lugar do `estado-sala` leva o balão que a carteira de quem está nele tem em uso,
 * a troca no meio da partida chega a todos, e nenhum cliente consegue mandar a aparência de ninguém (ela só vem da carteira).
 */
import { describe, expect, it } from 'vitest';
import {
  APARENCIA_PADRAO,
  PROTOCOLO_VERSAO,
  PROTOCOLO_VERSAO_MINIMA,
  decodificarMensagemDoCliente,
  type AparenciaDoBalao,
  type MsgEstadoSala,
} from '@sinuca/protocolo';
import { ClienteDeTeste, ConexaoFalsa, SEM_LIMITE, criarAmbiente, mensagemDeCriar, type Ambiente } from './para-testes';

const COM_TUDO = ['coroa', 'bigodao', 'olho_kawaii', 'dourado', 'cartola'] as const;
const CHEIA: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigodao', olhos: 'olho_kawaii', corDosOlhos: 'dourado' };

/** Uma carteira com os itens comprados e, se pedido, a aparência já equipada. */
function carteiraComBalao(amb: Ambiente, equipada?: AparenciaDoBalao) {
  const nova = amb.registro.carteiras.criar()!;
  amb.registro.carteiras.aplicar([{ id: nova.id, delta: 5000 }]);
  for (const item of COM_TUDO) amb.registro.carteiras.comprarItemDoBalao(nova.id, item);
  if (equipada) expect(amb.registro.carteiras.equiparAparencia(nova.id, equipada).ok).toBe(true);
  return nova;
}

const lugarDe = (e: MsgEstadoSala, n: number) => e.lugares[n]!;

describe('o estado-sala leva o balão de cada lugar', () => {
  it('cada lugar mostra o balão em uso da carteira de quem está nele; sem carteira é o padrão; lugar vago é null', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana');
    const beto = new ClienteDeTeste(amb, 'Beto');
    const cida = carteiraComBalao(amb, { chapeu: 'cartola', bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' });
    ana.criar('2x2', undefined, SEM_LIMITE, undefined, { carteira: carteiraComBalao(amb, CHEIA).codigo });
    beto.entrar(ana.codigo); // sem carteira
    const c = new ClienteDeTeste(amb, 'Cida');
    c.entrar(ana.codigo, undefined, cida.codigo);

    const e = ana.estado;
    expect(lugarDe(e, 0).aparencia).toEqual(CHEIA);
    expect(lugarDe(e, 1).aparencia).toEqual(APARENCIA_PADRAO);
    expect(lugarDe(e, 2).aparencia).toEqual({ chapeu: 'cartola', bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' });
    expect(lugarDe(e, 3).aparencia).toBeNull(); // o quarto lugar está vago
    // e todos veem o mesmo
    expect(beto.estado.lugares.map((l) => l.aparencia)).toEqual(e.lugares.map((l) => l.aparencia));
    expect(c.estado.lugares.map((l) => l.aparencia)).toEqual(e.lugares.map((l) => l.aparencia));
  });

  it('a carteira nova, sem nada comprado, aparece com o padrão (não null)', () => {
    const amb = criarAmbiente();
    const nova = amb.registro.carteiras.criar()!;
    const ana = new ClienteDeTeste(amb, 'Ana');
    ana.criar('1x1', undefined, SEM_LIMITE, undefined, { carteira: nova.codigo });
    expect(lugarDe(ana.estado, 0).aparencia).toEqual(APARENCIA_PADRAO);
    expect(lugarDe(ana.estado, 1).aparencia).toBeNull();
  });

  it('o espectador, que entra depois, vê a aparência de quem joga', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana');
    ana.criar('1x1', undefined, SEM_LIMITE, undefined, { carteira: carteiraComBalao(amb, CHEIA).codigo });
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    const espectador = new ClienteDeTeste(amb, 'Davi');
    espectador.entrar(ana.codigo);
    expect(espectador.lugar).toBeNull();
    expect(lugarDe(espectador.estado, 0).aparencia).toEqual(CHEIA);
  });

  it('quem cai e volta com o token conserva a carteira, e o balão que ela tem em uso agora', () => {
    const amb = criarAmbiente();
    const carteira = carteiraComBalao(amb, CHEIA);
    const ana = new ClienteDeTeste(amb, 'Ana');
    const beto = new ClienteDeTeste(amb, 'Beto');
    ana.criar('1x1', undefined, SEM_LIMITE, undefined, { carteira: carteira.codigo });
    beto.entrar(ana.codigo);
    ana.sair();
    amb.registro.carteiras.equiparAparencia(carteira.id, APARENCIA_PADRAO); // trocou pelo HTTP enquanto estava fora
    ana.reconectar();
    expect(lugarDe(ana.estado, 0).aparencia).toEqual(APARENCIA_PADRAO);
    expect(lugarDe(beto.estado, 0).aparencia).toEqual(APARENCIA_PADRAO);
  });
});

describe('a troca no meio da partida chega aos outros', () => {
  it('equipar outro balão (pelo HTTP, que é a carteira) manda um estado-sala novo a todos, com a aparência nova só no lugar certo', () => {
    const amb = criarAmbiente();
    const carteira = carteiraComBalao(amb, CHEIA);
    const ana = new ClienteDeTeste(amb, 'Ana');
    const beto = new ClienteDeTeste(amb, 'Beto');
    ana.criar('1x1', undefined, SEM_LIMITE, undefined, { carteira: carteira.codigo });
    beto.entrar(ana.codigo);
    ana.enviar({ tipo: 'iniciar' });
    expect(ana.estado.fase).toBe('jogando');

    const marcas = [ana, beto].map((c) => c.conn.recebidas.length);
    const nova: AparenciaDoBalao = { chapeu: 'cartola', bigode: null, olhos: 'olho_normal', corDosOlhos: 'dourado' };
    expect(amb.registro.carteiras.equiparAparencia(carteira.id, nova).ok).toBe(true);

    [ana, beto].forEach((c, i) => {
      const novos = c.conn.recebidas.slice(marcas[i]).filter((m) => m.tipo === 'estado-sala');
      expect(novos, c.nome).toHaveLength(1);
      const e = novos[0] as MsgEstadoSala;
      expect(lugarDe(e, 0).aparencia, c.nome).toEqual(nova);
      expect(lugarDe(e, 1).aparencia, c.nome).toEqual(APARENCIA_PADRAO);
      expect(e.fase, c.nome).toBe('jogando');
    });
  });

  it('a mesma aparência pedida de novo não manda nada a ninguém', () => {
    const amb = criarAmbiente();
    const carteira = carteiraComBalao(amb, CHEIA);
    const ana = new ClienteDeTeste(amb, 'Ana');
    ana.criar('1x1', undefined, SEM_LIMITE, undefined, { carteira: carteira.codigo });
    const marca = ana.conn.recebidas.length;
    amb.registro.carteiras.equiparAparencia(carteira.id, CHEIA);
    expect(ana.conn.recebidas.length).toBe(marca);
  });

  it('a troca de uma carteira que não está na sala não incomoda a sala', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana');
    ana.criar('1x1', undefined, SEM_LIMITE, undefined, { carteira: carteiraComBalao(amb, CHEIA).codigo });
    const marca = ana.conn.recebidas.length;
    const outra = carteiraComBalao(amb);
    amb.registro.carteiras.equiparAparencia(outra.id, { ...APARENCIA_PADRAO, chapeu: 'coroa' });
    expect(ana.conn.recebidas.length).toBe(marca);
  });

  it('a carteira em duas salas: a troca chega às duas', () => {
    const amb = criarAmbiente();
    const carteira = carteiraComBalao(amb, CHEIA);
    const a1 = new ClienteDeTeste(amb, 'Ana');
    const a2 = new ClienteDeTeste(amb, 'Ana2', '198.51.100.9');
    a1.criar('1x1', undefined, SEM_LIMITE, undefined, { carteira: carteira.codigo });
    a2.criar('1x1', undefined, SEM_LIMITE, undefined, { carteira: carteira.codigo });
    amb.registro.carteiras.equiparAparencia(carteira.id, APARENCIA_PADRAO);
    expect(lugarDe(a1.estado, 0).aparencia).toEqual(APARENCIA_PADRAO);
    expect(lugarDe(a2.estado, 0).aparencia).toEqual(APARENCIA_PADRAO);
  });
});

describe('um cliente não manda aparência: nem a dele, nem a de outro, nem uma que não tem', () => {
  const CODIGO = 'K7M2P';

  it('nenhuma mensagem do cliente tem campo de aparência: o esquema estrito recusa como mensagem-invalida, em qualquer uma', () => {
    const mensagens: object[] = [
      { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Ana', modo: '1x1', preset: 'Boteco', regras: {}, aparencia: CHEIA },
      { tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: CODIGO, nome: 'Beto', aparencia: CHEIA },
      { tipo: 'configurar-sala', aparencia: CHEIA },
      { tipo: 'ping', t: 5, aparencia: CHEIA },
      { tipo: 'aparencia', aparencia: CHEIA },
      { tipo: 'equipar-aparencia', aparencia: CHEIA },
      { tipo: 'emoji', emoji: '🔥', aparencia: CHEIA },
    ];
    for (const m of mensagens) {
      const r = decodificarMensagemDoCliente(JSON.stringify(m));
      expect(r.ok, JSON.stringify(m)).toBe(false);
      if (!r.ok) expect(r.codigo).toBe('mensagem-invalida');
    }
  });

  it('quem entra sem carteira fica com o padrão, mesmo que a sala já tenha um balão enfeitado: o lugar só mostra o que a carteira de quem senta tem', () => {
    const amb = criarAmbiente();
    const ana = new ClienteDeTeste(amb, 'Ana');
    ana.criar('1x1', undefined, SEM_LIMITE, undefined, { carteira: carteiraComBalao(amb, CHEIA).codigo });
    new ClienteDeTeste(amb, 'Beto').entrar(ana.codigo);
    expect(lugarDe(ana.estado, 1).aparencia).toEqual(APARENCIA_PADRAO);
    expect(lugarDe(ana.estado, 0).aparencia).toEqual(CHEIA);
  });

  it('a carteira de outro não vira sua só por estar na mesma sala: cada lugar lê a carteira do próprio participante', () => {
    const amb = criarAmbiente();
    const rica = carteiraComBalao(amb, CHEIA);
    const pobre = amb.registro.carteiras.criar()!;
    const ana = new ClienteDeTeste(amb, 'Ana');
    const beto = new ClienteDeTeste(amb, 'Beto');
    ana.criar('1x1', undefined, SEM_LIMITE, undefined, { carteira: rica.codigo });
    beto.entrar(ana.codigo, undefined, pobre.codigo);
    // a pobre tenta equipar o que a rica tem: a carteira recusa, e a sala segue mostrando o padrão
    expect(amb.registro.carteiras.equiparAparencia(pobre.id, CHEIA)).toEqual({ ok: false, erro: 'nao-tem' });
    expect(lugarDe(ana.estado, 1).aparencia).toEqual(APARENCIA_PADRAO);
  });
});

describe('a janela de versões no Registro', () => {
  it('a sala atende a versão atual e a mínima, e guarda na conexão a versão que cada cliente declarou', () => {
    const amb = criarAmbiente();
    const novo = new ClienteDeTeste(amb, 'Novo');
    novo.criar('1x1', undefined, SEM_LIMITE);
    expect(novo.conn.versao).toBe(PROTOCOLO_VERSAO);

    const velho = new ConexaoFalsa('velho');
    amb.registro.receber(velho, { tipo: 'entrar', versao: PROTOCOLO_VERSAO_MINIMA, codigo: novo.codigo, nome: 'Velho' });
    expect(velho.todas('erro')).toHaveLength(0);
    expect(velho.versao).toBe(PROTOCOLO_VERSAO_MINIMA);
  });

  it('o cliente da versão mínima também pode criar a sala', () => {
    const amb = criarAmbiente();
    const velho = new ConexaoFalsa('velho');
    amb.registro.receber(velho, mensagemDeCriar('Velho', '1x1', undefined, SEM_LIMITE, undefined, { versao: PROTOCOLO_VERSAO_MINIMA }));
    expect(velho.todas('erro')).toHaveLength(0);
    expect(velho.versao).toBe(PROTOCOLO_VERSAO_MINIMA);
  });

  it('versão fora da janela é recusada com `versao`, e a conexão não guarda nenhuma', () => {
    const amb = criarAmbiente();
    const dono = new ClienteDeTeste(amb, 'Dono').criar('1x1', undefined, SEM_LIMITE);
    for (const versao of [0, PROTOCOLO_VERSAO_MINIMA - 1, PROTOCOLO_VERSAO + 1]) {
      const c = new ConexaoFalsa(`v${versao}`);
      amb.registro.receber(c, { tipo: 'entrar', versao, codigo: dono.codigo, nome: 'Fora' });
      amb.registro.receber(c, mensagemDeCriar('Fora', '1x1', undefined, SEM_LIMITE, undefined, { versao }));
      expect(c.todas('erro').map((e) => e.codigo), `versão ${versao}`).toEqual(['versao', 'versao']);
      expect(c.versao, `versão ${versao}`).toBeUndefined();
    }
  });
});
