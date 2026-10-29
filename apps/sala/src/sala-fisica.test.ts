/**
 * A física pelo anfitrião (L38, `PROTOCOLO_VERSAO` 9): quem pode mexer, a faixa cortada, a aposta que trava, a tacada em voo que
 * recusa, o aviso a todos e o que a física mexida tira das missões. O motor das regras é o de verdade; só as partidas que precisam
 * ACABAR (para provar o que acontece depois do fim) usam o motor falso das regras, como em `sala-aposta.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { gravacaoDeTeste } from '@sinuca/fisica';
import {
  FISICA_DA_SALA_PADRAO,
  diaDaMissao,
  missoesDoDia,
  type FisicaParcial,
  type IdMissao,
  type MensagemDaSala,
  type MsgFisicaAlterada,
  type MsgMissoes,
  type MsgTacada,
} from '@sinuca/protocolo';
import { PRESET_BOTECO, aplicarTacada, novaPartida, type EstadoPartida, type ResultadoRegras } from '@sinuca/regras';
import { CONFIG_SALA_PADRAO } from './config';
import { conferirTacada } from './missoes';
import { ClienteDeTeste, SEM_LIMITE, TACADA_MEDIA, acharTacada, criarAmbiente, type Ambiente } from './para-testes';
import type { MotorDeRegras } from './regras';

const DIA_MS = 86_400_000;
const ANIMACAO = CONFIG_SALA_PADRAO.relogioTacada.animacaoMaximaMs + CONFIG_SALA_PADRAO.relogioTacada.margemAnimacaoMs;

const tipos = (c: ClienteDeTeste, desde: number): MensagemDaSala['tipo'][] => c.conn.recebidas.slice(desde).map((m) => m.tipo);
const avisosDe = (c: ClienteDeTeste): MsgFisicaAlterada[] => c.conn.todas('fisica-alterada');
const missoesDe = (c: ClienteDeTeste): MsgMissoes[] => c.conn.todas('missoes');
const fisicaDe = (c: ClienteDeTeste) => c.estado.fisica!;
const mexer = (c: ClienteDeTeste, fisica: FisicaParcial | null) => c.enviar({ tipo: 'configurar-sala', fisica });
const saldoDe = (amb: Ambiente, id: string): number => amb.registro.carteiras.ler(id)!.saldo;

/** O primeiro dia, a partir de 26/10/2026, cujas 3 missões servem ao teste. */
function diaCom(serve: (ids: readonly IdMissao[]) => boolean): string {
  for (let d = 0; d < 1500; d++) {
    const dia = diaDaMissao(Date.parse('2026-10-26T15:00:00Z') + d * DIA_MS);
    if (serve(missoesDoDia(dia).map((m) => m.id))) return dia;
  }
  throw new Error('nenhum dia tem essas missões');
}
const irParaODia = (amb: Ambiente, dia: string): void => amb.semTick(Date.parse(`${dia}T15:00:00Z`) - amb.agora());

interface Carteira {
  readonly codigo: string;
  readonly id: string;
}
const carteira = (amb: Ambiente): Carteira => amb.registro.carteiras.criar()!;

/** Sala 1x1 do par ou ímpar com as carteiras (null = sem) nos lugares; só inicia se `iniciar`. Anfitrião (Ana) no 0. */
function sentar(amb: Ambiente, carteiras: readonly (Carteira | null)[], iniciar = true): ClienteDeTeste[] {
  const nomes = ['Ana', 'Beto'];
  const jogadores = carteiras.map((_, i) => new ClienteDeTeste(amb, nomes[i]!));
  jogadores[0]!.criar('1x1', PRESET_BOTECO.regras, SEM_LIMITE, undefined, carteiras[0] ? { carteira: carteiras[0].codigo } : {});
  jogadores.slice(1).forEach((c, i) => c.entrar(jogadores[0]!.codigo, undefined, carteiras[i + 1]?.codigo));
  if (iniciar) jogadores[0]!.enviar({ tipo: 'iniciar' });
  return jogadores;
}

/** Uma tacada de quem tem a vez que mata ao menos uma bola da sua conta (`conferirTacada` diz), sem falta. */
function tacadaQueMata(c: ClienteDeTeste): MsgTacada {
  const v = c.visao!;
  return acharTacada(v, (m) => {
    const r = aplicarTacada(v.partida, m.gravacao.eventos);
    return conferirTacada({ parametros: m.parametros, gravacao: m.gravacao, consequencias: r.consequencias, antes: v.partida, depois: r.partida, seguidasAntes: 0 }).mortas.length > 0;
  });
}

const fim = (p: EstadoPartida, vencedor: number): ResultadoRegras => ({
  partida: { ...p, fase: 'fim', vencedor },
  consequencias: { faltas: [], retirar: [], recolocar: [], proximo: p.vez, vencedor, texto: 'fim' },
});

/** Ambiente em que `terminar(ana, 0)` acaba a partida para a equipe 0; fora disso as regras são as de verdade. */
function ambienteQueAcaba() {
  const controle: { acaba?: number } = {};
  const regras: MotorDeRegras = { novaPartida, aplicarTacada: (p, eventos) => (controle.acaba === undefined ? aplicarTacada(p, eventos) : fim(p, controle.acaba)) };
  const amb = criarAmbiente({}, { regras });
  const terminar = (quem: ClienteDeTeste, equipe: number): void => {
    controle.acaba = equipe;
    const v = quem.visao!;
    quem.enviar({ tipo: 'tacada', seq: v.seq, parametros: TACADA_MEDIA, gravacao: gravacaoDeTeste(), partida: fim(v.partida, equipe).partida, mesa: v.mesa });
    delete controle.acaba;
  };
  return { amb, terminar };
}

describe('a física da sala: o que o estado mostra', () => {
  it('uma sala nova tem a física padrão, não mexida e não travada, e todos a veem', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null], false) as [ClienteDeTeste, ClienteDeTeste];
    for (const c of [ana, beto]) {
      expect(fisicaDe(c), c.nome).toEqual(FISICA_DA_SALA_PADRAO);
      expect(c.estado, c.nome).toMatchObject({ fisicaMexida: false, fisicaTravada: false });
    }
  });
});

describe('na espera o anfitrião muda a física sempre', () => {
  it('só as chaves do pedido mudam, todos recebem o estado novo e a sala marca que difere do padrão (sem aviso: na espera o estado basta)', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null], false) as [ClienteDeTeste, ClienteDeTeste];
    const marcas = [ana, beto].map((c) => c.conn.recebidas.length);
    mexer(ana, { atritoRolamento: 0.03, velocidadeMaxTaco: 10 });
    const esperado = { ...FISICA_DA_SALA_PADRAO, atritoRolamento: 0.03, velocidadeMaxTaco: 10 };
    [ana, beto].forEach((c, i) => {
      expect(fisicaDe(c), c.nome).toEqual(esperado);
      expect(c.estado, c.nome).toMatchObject({ fisicaMexida: true, fisicaTravada: false });
      expect(tipos(c, marcas[i]!), c.nome).toEqual(['estado-sala']);
      expect(avisosDe(c), c.nome).toHaveLength(0);
    });
    // um segundo pedido soma ao que a sala já tem
    mexer(ana, { desaceleracaoGiro: 5 });
    expect(fisicaDe(beto)).toEqual({ ...esperado, desaceleracaoGiro: 5 });
  });

  it('só o anfitrião muda: o convidado recebe nao-anfitriao e nada muda', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null], false) as [ClienteDeTeste, ClienteDeTeste];
    const marca = ana.conn.recebidas.length;
    mexer(beto, { atritoRolamento: 0.03 });
    expect(beto.ultimoErro).toMatchObject({ codigo: 'nao-anfitriao' });
    expect(fisicaDe(ana)).toEqual(FISICA_DA_SALA_PADRAO);
    expect(ana.conn.recebidas.length).toBe(marca); // ninguém foi incomodado
    mexer(beto, null);
    expect(beto.erros).toHaveLength(2);
  });

  it('o espectador e quem ainda não entrou também não mexem', () => {
    const amb = criarAmbiente();
    const [ana] = sentar(amb, [null, null], false) as [ClienteDeTeste, ClienteDeTeste];
    const espectador = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    espectador.enviar({ tipo: 'escolher-lugar', lugar: null });
    mexer(espectador, { atritoRolamento: 0.03 });
    expect(espectador.ultimoErro).toMatchObject({ codigo: 'nao-anfitriao' });
    expect(fisicaDe(ana)).toEqual(FISICA_DA_SALA_PADRAO);
    const fora = new ClienteDeTeste(amb, 'Davi');
    mexer(fora, { atritoRolamento: 0.03 });
    expect(fora.ultimoErro).toMatchObject({ codigo: 'fora-da-sala' });
  });

  it('a faixa é cortada: valor acima vira o máximo, abaixo vira o mínimo, e o que não é uma das 8 chaves é descartado', () => {
    const amb = criarAmbiente();
    const [ana] = sentar(amb, [null, null], false) as [ClienteDeTeste, ClienteDeTeste];
    mexer(ana, { atritoDeslizamento: 99, desaceleracaoGiro: -4, velocidadeMaxTaco: 12.0001, restituicaoBolaBola: 0.9 });
    expect(fisicaDe(ana)).toEqual({ ...FISICA_DA_SALA_PADRAO, atritoDeslizamento: 0.5, desaceleracaoGiro: 2, velocidadeMaxTaco: 12, restituicaoBolaBola: 0.9 });
    // a sala não confia no esquema: chave de fora da física, texto e NaN, mesmo chegando direto, não entram
    mexer(ana, { gravidade: 0, massaTaco: 9, atritoRolamento: '0,03', fatorEfeitoLateral: Number.NaN } as unknown as FisicaParcial);
    expect(fisicaDe(ana)).toEqual({ ...FISICA_DA_SALA_PADRAO, atritoDeslizamento: 0.5, desaceleracaoGiro: 2, velocidadeMaxTaco: 12, restituicaoBolaBola: 0.9 });
  });

  it('um __proto__ próprio vindo de JSON.parse que chegasse à sala (sem o esquema) não entra: só as chaves da física valem e o protótipo de ninguém muda', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null], false) as [ClienteDeTeste, ClienteDeTeste];
    const doFio = JSON.parse('{"__proto__":{"atritoRolamento":0.03,"polluido":true},"velocidadeMaxTaco":10}') as FisicaParcial;
    mexer(ana, doFio);
    expect(fisicaDe(beto)).toEqual({ ...FISICA_DA_SALA_PADRAO, velocidadeMaxTaco: 10 });
    expect(Object.keys(fisicaDe(beto))).toHaveLength(8);
    expect(({} as Record<string, unknown>).polluido).toBeUndefined();
    expect(({} as Record<string, unknown>).atritoRolamento).toBeUndefined();
  });

  it('a conta de um slider para o padrão (0,020000000000000004, 0,8500000000000001, 0,6000000000000001) não deixa a sala "mexida": a física fica igual ao padrão', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null], false) as [ClienteDeTeste, ClienteDeTeste];
    mexer(ana, { atritoRolamento: 0.002 + 36 * 0.0005, restituicaoBolaTabela: 0.5 + 35 * 0.01, fatorEfeitoLateral: 0.2 + 8 * 0.05 });
    for (const c of [ana, beto]) {
      expect(fisicaDe(c), c.nome).toEqual(FISICA_DA_SALA_PADRAO);
      expect(c.estado, c.nome).toMatchObject({ fisicaMexida: false, fisicaTravada: false });
    }
    // mexer de verdade e voltar pelo slider ao padrão também desmarca; e na partida o mesmo pedido já é o que a sala tem: sem aviso
    mexer(ana, { atritoRolamento: 0.03 });
    expect(beto.estado.fisicaMexida).toBe(true);
    mexer(ana, { atritoRolamento: 0.002 + 36 * 0.0005 });
    expect(fisicaDe(beto)).toEqual(FISICA_DA_SALA_PADRAO);
    expect(beto.estado.fisicaMexida).toBe(false);
    ana.enviar({ tipo: 'iniciar' });
    const marca = beto.conn.recebidas.length;
    mexer(ana, { fatorEfeitoLateral: 0.2 + 8 * 0.05 });
    expect(tipos(beto, marca)).toEqual(['estado-sala']);
    expect(avisosDe(beto)).toHaveLength(0);
  });

  it('null restaura o padrão, {} e a ausência do campo não mudam nada, e a sala confirma com o estado', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null], false) as [ClienteDeTeste, ClienteDeTeste];
    mexer(ana, { atritoRolamento: 0.03 });
    const mexida = fisicaDe(ana);
    const marca = beto.conn.recebidas.length;
    mexer(ana, {});
    ana.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 45 } });
    expect(fisicaDe(beto)).toEqual(mexida);
    expect(tipos(beto, marca)).toEqual(['estado-sala', 'estado-sala']);
    mexer(ana, null);
    expect(fisicaDe(beto)).toEqual(FISICA_DA_SALA_PADRAO);
    expect(beto.estado.fisicaMexida).toBe(false);
  });

  it('junto de outras mudanças vale tudo ou nada: uma recusa deixa a física como estava', () => {
    const amb = criarAmbiente();
    const [ana] = sentar(amb, [null, null], false) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar({ tipo: 'configurar-sala', fisica: { atritoRolamento: 0.03 }, giz: { desgasteMin: 0.4, desgasteMax: 0.1 } });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'regras-invalidas' });
    expect(fisicaDe(ana)).toEqual(FISICA_DA_SALA_PADRAO);
    ana.enviar({ tipo: 'configurar-sala', fisica: { atritoRolamento: 0.03 }, relogio: { tempoS: 45 } });
    expect(ana.estado).toMatchObject({ relogio: { tempoS: 45 } });
    expect(fisicaDe(ana).atritoRolamento).toBe(0.03);
  });

  it('a física fica na sala: a partida começa com ela e ela sobrevive a voltar ao lobby', () => {
    const { amb, terminar } = ambienteQueAcaba();
    const [ana, beto] = sentar(amb, [null, null], false) as [ClienteDeTeste, ClienteDeTeste];
    mexer(ana, { atritoRolamento: 0.03 });
    ana.enviar({ tipo: 'iniciar' });
    expect(fisicaDe(beto).atritoRolamento).toBe(0.03);
    terminar(ana.estado.vez === 0 ? ana : beto, 0);
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    expect(ana.estado).toMatchObject({ fase: 'espera', fisicaMexida: true });
    expect(fisicaDe(beto).atritoRolamento).toBe(0.03);
  });
});

describe('na partida, sem aposta valendo', () => {
  it('muda e TODOS recebem o aviso antes do estado novo: jogadores, espectador e o próprio anfitrião', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null]) as [ClienteDeTeste, ClienteDeTeste];
    const cida = new ClienteDeTeste(amb, 'Cida').entrar(ana.codigo);
    expect(cida.lugar).toBeNull(); // a partida já começou: entra como espectadora
    const todos = [ana, beto, cida];
    const marcas = todos.map((c) => c.conn.recebidas.length);
    mexer(ana, { atritoRolamento: 0.03 });
    const nova = { ...FISICA_DA_SALA_PADRAO, atritoRolamento: 0.03 };
    todos.forEach((c, i) => {
      expect(tipos(c, marcas[i]!), c.nome).toEqual(['fisica-alterada', 'estado-sala']);
      expect(avisosDe(c).at(-1), c.nome).toEqual({ tipo: 'fisica-alterada', por: 'Ana', fisica: nova, mexida: true });
      expect(c.estado, c.nome).toMatchObject({ fisica: nova, fisicaMexida: true, fisicaTravada: false });
    });
  });

  it('contrato: o aviso não leva seq e vale na hora; o estado-sala que vem logo depois leva a mesma física, também depois do fim da partida e de uma nova partida (o seq volta a 0 e a física não)', () => {
    const { amb, terminar } = ambienteQueAcaba();
    const [ana, beto] = sentar(amb, [null, null]) as [ClienteDeTeste, ClienteDeTeste];
    const daVez = (): ClienteDeTeste => (ana.estado.vez === 0 ? ana : beto);
    daVez().jogar();
    amb.avancar(ANIMACAO + 1);
    expect(ana.estado.seq).toBe(1);
    mexer(ana, { velocidadeMaxTaco: 10 });
    // a partida acaba, o anfitrião mexe de novo na tela de fim (sem aposta é permitido) e começa outra: o seq zera
    terminar(daVez(), 0);
    mexer(ana, { atritoRolamento: 0.03 });
    ana.enviar({ tipo: 'nova-partida' });
    expect(ana.erros).toHaveLength(0);
    expect(ana.estado).toMatchObject({ fase: 'jogando', seq: 0 });
    const esperada = { ...FISICA_DA_SALA_PADRAO, velocidadeMaxTaco: 10, atritoRolamento: 0.03 };
    for (const c of [ana, beto]) {
      const avisos = avisosDe(c);
      expect(avisos.map((a) => a.fisica), c.nome).toEqual([{ ...FISICA_DA_SALA_PADRAO, velocidadeMaxTaco: 10 }, esperada]);
      for (const aviso of avisos) expect(Object.keys(aviso).sort(), c.nome).toEqual(['fisica', 'mexida', 'por', 'tipo']); // nenhum seq
      expect(fisicaDe(c), c.nome).toEqual(avisos.at(-1)!.fisica); // vale o estado-sala na hora
    }
  });

  it('o estado-sala que sai logo depois de cada aviso leva exatamente a física do aviso', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null]) as [ClienteDeTeste, ClienteDeTeste];
    for (const pedido of [{ atritoRolamento: 0.03 }, { velocidadeMaxTaco: 10 }, null] as const) {
      const marca = beto.conn.recebidas.length;
      mexer(ana, pedido);
      const novas = beto.conn.recebidas.slice(marca);
      expect(novas.map((m) => m.tipo)).toEqual(['fisica-alterada', 'estado-sala']);
      const [aviso, estado] = novas as [MsgFisicaAlterada, (typeof beto)['estado']];
      expect(estado.fisica).toEqual(aviso.fisica);
      expect(estado.fisicaMexida).toBe(aviso.mexida);
    }
  });

  it('restaurar avisa com mexida falso; pedir o que a sala já tem só confirma com o estado, sem aviso', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null]) as [ClienteDeTeste, ClienteDeTeste];
    mexer(ana, { atritoRolamento: 0.03 });
    expect(avisosDe(beto)).toHaveLength(1);
    mexer(ana, { atritoRolamento: 0.03 }); // o mesmo valor
    expect(avisosDe(beto)).toHaveLength(1);
    mexer(ana, null);
    expect(avisosDe(beto)).toHaveLength(2);
    expect(avisosDe(beto).at(-1)).toMatchObject({ fisica: FISICA_DA_SALA_PADRAO, mexida: false });
    const marca = beto.conn.recebidas.length;
    mexer(ana, null); // já é o padrão
    expect(tipos(beto, marca)).toEqual(['estado-sala']);
  });

  it('o convidado não muda nem na partida, e o aviso nunca sai para uma recusa', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null]) as [ClienteDeTeste, ClienteDeTeste];
    mexer(beto, { atritoRolamento: 0.03 });
    expect(beto.ultimoErro).toMatchObject({ codigo: 'nao-anfitriao' });
    expect(avisosDe(ana)).toHaveLength(0);
    expect(fisicaDe(ana)).toEqual(FISICA_DA_SALA_PADRAO);
  });

  it('na partida só a física passa: qualquer outro campo, ou o pedido sem a física, é fase-errada e nada muda', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null]) as [ClienteDeTeste, ClienteDeTeste];
    const marca = beto.conn.recebidas.length;
    const pedidos = [
      { tipo: 'configurar-sala' },
      { tipo: 'configurar-sala', relogio: { tempoS: 45 } },
      { tipo: 'configurar-sala', aposta: 50 },
      { tipo: 'configurar-sala', modo: '1x1' },
      { tipo: 'configurar-sala', fisica: { atritoRolamento: 0.03 }, relogio: { tempoS: 45 } },
      { tipo: 'configurar-sala', fisica: null, forca: 'empurrar' },
    ] as const;
    for (const pedido of pedidos) {
      ana.enviar(pedido);
      expect(ana.ultimoErro, JSON.stringify(pedido)).toMatchObject({ codigo: 'fase-errada' });
    }
    expect(fisicaDe(ana)).toEqual(FISICA_DA_SALA_PADRAO);
    expect(ana.estado.relogio).toMatchObject({ tempoS: null });
    expect(tipos(beto, marca)).toEqual([]); // nada foi transmitido
  });

  it('recusar a física na partida não gasta a tolerância da conexão (o painel pode insistir)', () => {
    const amb = criarAmbiente();
    const [ana] = sentar(amb, [null, null]) as [ClienteDeTeste, ClienteDeTeste];
    ana.enviar({ tipo: 'configurar-sala', relogio: { tempoS: 45 } });
    expect(ana.conn.totalPunido).toBe(0);
  });

  it('a partida terminada sem aposta valendo (à espera do voltar-ao-lobby) deixa mudar como na espera, com o aviso a todos, e a nova partida joga com ela', () => {
    const { amb, terminar } = ambienteQueAcaba();
    const [ana, beto] = sentar(amb, [null, null]) as [ClienteDeTeste, ClienteDeTeste];
    terminar(ana.estado.vez === 0 ? ana : beto, 0);
    expect(ana.estado.fase).toBe('jogando');
    expect(ana.estado.fisicaTravada).toBe(false);
    mexer(ana, { atritoRolamento: 0.03 });
    expect(ana.ultimoErro).toBeUndefined();
    expect(avisosDe(beto)).toHaveLength(1);
    expect(fisicaDe(beto).atritoRolamento).toBe(0.03);
    ana.enviar({ tipo: 'nova-partida' });
    expect(beto.estado).toMatchObject({ fase: 'jogando', seq: 0, fisicaMexida: true });
    expect(fisicaDe(beto).atritoRolamento).toBe(0.03);
  });
});

describe('na tela de fim, com aposta valendo na próxima, a física só muda na espera (L38b)', () => {
  /** Partida 1x1 que acaba para a equipe 0, com as carteiras que `quais` der; Ana (anfitriã) e Beto na tela de fim. */
  function noFim(quais: (amb: Ambiente) => readonly (Carteira | null)[]) {
    const { amb, terminar } = ambienteQueAcaba();
    const [ana, beto] = sentar(amb, quais(amb)) as [ClienteDeTeste, ClienteDeTeste];
    terminar(ana.estado.vez === 0 ? ana : beto, 0);
    expect(ana.estado).toMatchObject({ fase: 'jogando', vez: null });
    return { amb, ana, beto };
  }
  const duas = (amb: Ambiente) => [carteira(amb), carteira(amb)];

  it('com carteiras nos dois lados o estado diz que está travada, a recusa explica, ninguém é avisado e nada é punido', () => {
    const { ana, beto } = noFim(duas);
    for (const c of [ana, beto]) expect(c.estado, c.nome).toMatchObject({ fisicaTravada: true, fisicaMexida: false });
    const marca = beto.conn.recebidas.length;
    mexer(ana, { atritoRolamento: 0.03 });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'fase-errada', mensagem: expect.stringContaining('espera') });
    mexer(ana, null);
    expect(ana.erros).toHaveLength(2);
    expect(fisicaDe(beto)).toEqual(FISICA_DA_SALA_PADRAO);
    expect(tipos(beto, marca)).toEqual([]);
    expect(avisosDe(beto)).toHaveLength(0);
    expect(ana.conn.totalPunido).toBe(0);
  });

  it('o caminho do problema: mexer na tela de fim e mandar nova-partida não abre uma aposta com a física que ninguém viu', () => {
    const { amb, ana, beto } = noFim(duas);
    mexer(ana, { velocidadeMaxTaco: 12, atritoDeslizamento: 0.5 });
    ana.enviar({ tipo: 'nova-partida' });
    expect(ana.estado).toMatchObject({ fase: 'jogando', seq: 0, fisicaMexida: false, fisicaTravada: true });
    expect(fisicaDe(beto)).toEqual(FISICA_DA_SALA_PADRAO);
    expect(amb.logs.some((l) => l.startsWith('fisica '))).toBe(false);
  });

  it('voltar ao lobby libera: na espera muda, todos veem, e a aposta que começa depois vale com essa física', () => {
    const { ana, beto } = noFim(duas);
    mexer(ana, { atritoRolamento: 0.03 });
    expect(fisicaDe(ana)).toEqual(FISICA_DA_SALA_PADRAO);
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    expect(ana.estado).toMatchObject({ fase: 'espera', fisicaTravada: false });
    mexer(ana, { atritoRolamento: 0.03 });
    expect(fisicaDe(beto).atritoRolamento).toBe(0.03);
    ana.enviar({ tipo: 'iniciar' });
    expect(beto.estado).toMatchObject({ fase: 'jogando', fisicaTravada: true, fisicaMexida: true });
    expect(fisicaDe(beto).atritoRolamento).toBe(0.03);
  });

  it('sem aposta valendo na próxima continua como era: sem carteira, com uma só ou com a mesma nos dois lugares, muda na tela de fim', () => {
    const repetida = (amb: Ambiente) => {
      const c = carteira(amb);
      return [c, c];
    };
    const casos: [string, (amb: Ambiente) => readonly (Carteira | null)[]][] = [
      ['sem carteira', () => [null, null]],
      ['uma carteira só', (amb) => [carteira(amb), null]],
      ['a mesma nos dois lugares', repetida],
    ];
    for (const [rotulo, quais] of casos) {
      const { ana, beto } = noFim(quais);
      expect(ana.estado.fisicaTravada, rotulo).toBe(false);
      mexer(ana, { atritoRolamento: 0.03 });
      expect(ana.ultimoErro, rotulo).toBeUndefined();
      expect(avisosDe(beto), rotulo).toHaveLength(1);
      expect(fisicaDe(beto).atritoRolamento, rotulo).toBe(0.03);
    }
  });

  it('quem saiu depois do fim não destrava: ele pode voltar para a nova-partida, então a física só muda no lobby', () => {
    const { ana, beto } = noFim(duas);
    beto.sair();
    expect(ana.estado).toMatchObject({ fisicaTravada: true });
    mexer(ana, { atritoRolamento: 0.03 });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'fase-errada' });
    expect(fisicaDe(ana)).toEqual(FISICA_DA_SALA_PADRAO);
    // ele volta com o token (conserva a carteira) e a nova-partida abre com a física que todos viram
    beto.reconectar();
    expect(beto.ultimoErro).toBeUndefined();
    ana.enviar({ tipo: 'nova-partida' });
    expect(ana.estado).toMatchObject({ fase: 'jogando', fisicaMexida: false });
    expect(fisicaDe(beto)).toEqual(FISICA_DA_SALA_PADRAO);
    // e se ele não volta, o lobby solta o lugar dele e libera a física
    const { ana: ana2, beto: beto2 } = noFim(duas);
    beto2.sair();
    ana2.enviar({ tipo: 'voltar-ao-lobby' });
    mexer(ana2, { atritoRolamento: 0.03 });
    expect(fisicaDe(ana2).atritoRolamento).toBe(0.03);
  });

  it('o convidado continua sem poder: nao-anfitriao vem antes da trava', () => {
    const { beto } = noFim(duas);
    mexer(beto, { atritoRolamento: 0.03 });
    expect(beto.ultimoErro).toMatchObject({ codigo: 'nao-anfitriao' });
  });
});

describe('a tacada em voo recusa', () => {
  it('enquanto a tacada aceita ainda anima a física não muda; passada a animação, muda', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [null, null]) as [ClienteDeTeste, ClienteDeTeste];
    const quem = ana.estado.vez === 0 ? ana : beto;
    quem.jogar();
    expect(ana.conn.todas('tacada-retransmitida')).toHaveLength(1);
    // a animação dura o que a gravação dura (com teto) mais a margem: é a conta do prazo da vez
    const { animacaoMaximaMs, margemAnimacaoMs } = CONFIG_SALA_PADRAO.relogioTacada;
    const animacao = Math.min(ana.conn.ultima('tacada-retransmitida')!.gravacao.duracao * 1000, animacaoMaximaMs) + margemAnimacaoMs;
    const marca = beto.conn.recebidas.length;
    mexer(ana, { atritoRolamento: 0.03 });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'fase-errada', mensagem: expect.stringContaining('tacada') });
    expect(fisicaDe(ana)).toEqual(FISICA_DA_SALA_PADRAO);
    expect(tipos(beto, marca)).toEqual([]);
    amb.avancar(animacao - 1);
    mexer(ana, { atritoRolamento: 0.03 });
    expect(fisicaDe(ana)).toEqual(FISICA_DA_SALA_PADRAO); // ainda faltava 1 ms
    amb.avancar(1);
    mexer(ana, { atritoRolamento: 0.03 });
    expect(fisicaDe(ana).atritoRolamento).toBe(0.03);
    expect(avisosDe(beto)).toHaveLength(1);
  });

  it('a espera não tem tacada em voo: muda na hora, mesmo logo depois de voltar ao lobby', () => {
    const { amb, terminar } = ambienteQueAcaba();
    const [ana, beto] = sentar(amb, [null, null]) as [ClienteDeTeste, ClienteDeTeste];
    terminar(ana.estado.vez === 0 ? ana : beto, 0);
    ana.enviar({ tipo: 'voltar-ao-lobby' });
    mexer(ana, { atritoRolamento: 0.03 });
    expect(ana.ultimoErro).toBeUndefined();
    expect(fisicaDe(ana).atritoRolamento).toBe(0.03);
  });
});

describe('a aposta trava a física', () => {
  it('com aposta valendo (carteiras nos dois lados) a física não muda na partida: o estado diz que está travada, a recusa explica e ninguém é avisado', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [carteira(amb), carteira(amb)]) as [ClienteDeTeste, ClienteDeTeste];
    for (const c of [ana, beto]) expect(c.estado, c.nome).toMatchObject({ fase: 'jogando', fisicaTravada: true, fisicaMexida: false });
    const marca = beto.conn.recebidas.length;
    mexer(ana, { atritoRolamento: 0.03 });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'fase-errada', mensagem: expect.stringContaining('aposta') });
    mexer(ana, null);
    expect(ana.erros).toHaveLength(2);
    expect(fisicaDe(beto)).toEqual(FISICA_DA_SALA_PADRAO);
    expect(tipos(beto, marca)).toEqual([]);
    expect(ana.conn.totalPunido).toBe(0);
  });

  it('a aposta trava mesmo depois de passada a animação de uma tacada', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [carteira(amb), carteira(amb)]) as [ClienteDeTeste, ClienteDeTeste];
    (ana.estado.vez === 0 ? ana : beto).jogar();
    amb.avancar(ANIMACAO + 1000);
    mexer(ana, { atritoRolamento: 0.03 });
    expect(ana.ultimoErro).toMatchObject({ codigo: 'fase-errada', mensagem: expect.stringContaining('aposta') });
    expect(fisicaDe(ana)).toEqual(FISICA_DA_SALA_PADRAO);
  });

  it('na espera a aposta não trava: muda com as carteiras sentadas, e a aposta vale com a física que todos viram', () => {
    const amb = criarAmbiente();
    const [ana, beto] = sentar(amb, [carteira(amb), carteira(amb)], false) as [ClienteDeTeste, ClienteDeTeste];
    mexer(ana, { atritoRolamento: 0.03 });
    expect(fisicaDe(beto).atritoRolamento).toBe(0.03);
    expect(ana.estado.fisicaTravada).toBe(false);
    ana.enviar({ tipo: 'iniciar' });
    expect(beto.estado).toMatchObject({ fase: 'jogando', fisicaTravada: true, fisicaMexida: true });
    mexer(ana, null);
    expect(ana.ultimoErro).toMatchObject({ codigo: 'fase-errada' });
    expect(fisicaDe(beto).atritoRolamento).toBe(0.03);
  });

  it('só uma carteira (sem contraparte) ou a mesma carteira nos dois lugares não valem moeda: não trava', () => {
    const amb = criarAmbiente();
    const [ana1] = sentar(amb, [carteira(amb), null]) as [ClienteDeTeste, ClienteDeTeste];
    expect(ana1.estado.fisicaTravada).toBe(false);
    mexer(ana1, { atritoRolamento: 0.03 });
    expect(fisicaDe(ana1).atritoRolamento).toBe(0.03);

    const repetida = carteira(amb);
    const [ana2] = sentar(amb, [repetida, repetida]) as [ClienteDeTeste, ClienteDeTeste];
    expect(ana2.estado.fisicaTravada).toBe(false);
    mexer(ana2, { atritoRolamento: 0.04 });
    expect(fisicaDe(ana2).atritoRolamento).toBe(0.04);
  });
});

describe('a física mexida tira da missão e a aposta continua valendo', () => {
  const dia = diaCom((ids) => ids[0] === 'saida-premiada');

  function partidaApostada(fisica: FisicaParcial | null) {
    const amb = criarAmbiente();
    irParaODia(amb, dia);
    const a = carteira(amb);
    const b = carteira(amb);
    const [ana, beto] = sentar(amb, [a, b], false) as [ClienteDeTeste, ClienteDeTeste];
    if (fisica) mexer(ana, fisica);
    ana.enviar({ tipo: 'iniciar' });
    return { amb, a, b, ana, beto };
  }

  it('controle: com a física padrão a tacada que mata cumpre a Saída premiada, paga e anda o contador do taco', () => {
    const { amb, a, ana } = partidaApostada(null);
    ana.enviar(tacadaQueMata(ana));
    expect(missoesDe(ana).at(-1)!.cumpridas).toContain('saida-premiada');
    expect(saldoDe(amb, a.id)).toBeGreaterThanOrEqual(150);
    expect(amb.registro.carteiras.ler(a.id)!.itens!.find((i) => i.skin === 'classico')!.bolas).toBeGreaterThan(0);
  });

  it('a MESMA tacada com a física mexida é aceita e retransmitida, mas não anda missão, não paga e não conta bola no taco', () => {
    const { amb, a, b, ana, beto } = partidaApostada({ atritoRolamento: 0.03 });
    const marca = beto.conn.recebidas.length;
    ana.enviar(tacadaQueMata(ana));
    expect(tipos(beto, marca)).toEqual(['tacada-retransmitida', 'estado-sala']); // aceita; nenhuma `missoes`
    expect(ana.erros).toHaveLength(0);
    expect(missoesDe(ana)).toHaveLength(0);
    expect(saldoDe(amb, a.id)).toBe(100);
    expect(saldoDe(amb, b.id)).toBe(100);
    expect(amb.registro.carteiras.ler(a.id)!.missoes!.itens.every((i) => i.progresso === 0)).toBe(true);
    expect(amb.registro.carteiras.ler(a.id)!.itens!.every((i) => i.bolas === 0)).toBe(true);
    expect(amb.logs.some((l) => l.startsWith('missao '))).toBe(false);
  });

  it('o fim da partida com a física mexida: as missões de partida não pagam, mas o pote muda de mãos', () => {
    const { amb, terminar } = ambienteQueAcaba();
    irParaODia(amb, diaCom((ids) => ids[0] === 'fregues-da-casa' && ids[1] === 'fecha-a-conta' && ids[2] === 'limpinho'));
    const a = carteira(amb);
    const b = carteira(amb);
    const [ana, beto] = sentar(amb, [a, b], false) as [ClienteDeTeste, ClienteDeTeste];
    mexer(ana, { velocidadeMaxTaco: 10 });
    ana.enviar({ tipo: 'iniciar' });
    terminar(ana.estado.vez === 0 ? ana : beto, 0);
    expect(missoesDe(ana)).toHaveLength(0);
    expect(missoesDe(beto)).toHaveLength(0);
    expect(ana.conn.ultima('aposta-paga')!.variacoes.map((v) => v.delta)).toEqual([10, -10]);
    expect([saldoDe(amb, a.id), saldoDe(amb, b.id)]).toEqual([110, 90]);
    expect(amb.registro.carteiras.ler(a.id)!.missoes!.itens.map((i) => i.progresso)).toEqual([0, 0, 0]);
  });

  it('controle: a mesma partida com a física padrão paga Freguês da casa, Fecha a conta e Limpinho', () => {
    const { amb, terminar } = ambienteQueAcaba();
    irParaODia(amb, diaCom((ids) => ids[0] === 'fregues-da-casa' && ids[1] === 'fecha-a-conta' && ids[2] === 'limpinho'));
    const a = carteira(amb);
    const [ana, beto] = sentar(amb, [a, carteira(amb)]) as [ClienteDeTeste, ClienteDeTeste];
    terminar(ana.estado.vez === 0 ? ana : beto, 0);
    expect(missoesDe(ana).at(-1)!.cumpridas).toContain('fecha-a-conta');
    expect(saldoDe(amb, a.id)).toBeGreaterThan(110);
  });
});
