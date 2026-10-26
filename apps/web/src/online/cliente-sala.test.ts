import { describe, expect, it, vi } from 'vitest';
import { PROTOCOLO_VERSAO, type MensagemDaSala } from '@sinuca/protocolo';
import { PRESET_BOTECO } from '@sinuca/regras';
import { ArmazemDeSessao } from './armazem';
import { ClienteSala, TEMPOS_PADRAO, type EstadoDaConexao, type PedidoDeEntrada } from './cliente-sala';
import { ArmazenamentoFalso, RelogioFalso, SocketFalso } from './para-testes';

const CRIAR: PedidoDeEntrada = { tipo: 'criar', nome: 'Ana', modo: '1x1', preset: 'Boteco', regras: PRESET_BOTECO.regras };
const ENTRAR: PedidoDeEntrada = { tipo: 'entrar', nome: 'Beto', codigo: 'K7M2P' };

const boasVindas = (token = 'token-de-teste-0001', lugar: number | null = 0): MensagemDaSala => ({
  tipo: 'boas-vindas',
  versao: PROTOCOLO_VERSAO,
  codigo: 'K7M2P',
  token,
  lugar,
  anfitriao: lugar === 0,
});

function montar(opcoes: { sortear?: () => number; local?: ArmazenamentoFalso; inicioMs?: number; carteira?: () => string | undefined } = {}) {
  const relogio = new RelogioFalso();
  relogio.agoraMs = opcoes.inicioMs ?? 0;
  const local = opcoes.local ?? new ArmazenamentoFalso();
  const armazem = new ArmazemDeSessao(local, 'aba-1', relogio.agora);
  const sockets: SocketFalso[] = [];
  const estados: EstadoDaConexao[] = [];
  const mensagens: MensagemDaSala[] = [];
  const urls: string[] = [];
  const cliente = new ClienteSala({
    url: 'ws://teste/sala',
    criarSocket: (url) => {
      urls.push(url);
      const s = new SocketFalso();
      sockets.push(s);
      return s;
    },
    armazem,
    agendar: relogio.agendar,
    agora: relogio.agora,
    sortear: opcoes.sortear ?? (() => 1),
    ...(opcoes.carteira === undefined ? {} : { carteira: opcoes.carteira }),
    aoMensagem: (m) => mensagens.push(m),
    aoEstado: (e) => estados.push(e),
  });
  const ultimo = (): SocketFalso => sockets[sockets.length - 1]!;
  return { cliente, relogio, local, armazem, sockets, estados, mensagens, urls, ultimo };
}

describe('ClienteSala: abrir a sala', () => {
  it('cria a sala ao abrir o socket e fica conectado depois das boas-vindas, guardando o token', () => {
    const t = montar();
    t.cliente.abrir(CRIAR);
    expect(t.urls).toEqual(['ws://teste/sala']);
    expect(t.estados.at(-1)).toEqual({ fase: 'conectando', tentativa: 0 });
    expect(t.ultimo().binaryType).toBe('arraybuffer');
    t.ultimo().abrir();
    expect(t.ultimo().mensagensEnviadas()).toEqual([
      { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Ana', modo: '1x1', preset: 'Boteco', regras: PRESET_BOTECO.regras },
    ]);
    t.ultimo().entregar(boasVindas());
    expect(t.cliente.conectado).toBe(true);
    expect(t.cliente.codigo).toBe('K7M2P');
    expect(t.armazem.ler('K7M2P')).toEqual({ token: 'token-de-teste-0001', nome: 'Ana' });
    expect(t.armazem.apelido()).toBe('Ana');
    expect(t.mensagens).toEqual([boasVindas()]);
  });

  it('entra por código sem token na primeira vez e com ele quando já tem um', () => {
    const t = montar();
    t.cliente.abrir(ENTRAR);
    t.ultimo().abrir();
    expect(t.ultimo().mensagensEnviadas()).toEqual([{ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Beto' }]);

    const u = montar();
    u.armazem.gravar('K7M2P', { token: 'token-guardado-0001', nome: 'Beto' });
    u.cliente.abrir(ENTRAR);
    u.ultimo().abrir();
    expect(u.ultimo().mensagensEnviadas()).toEqual([{ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Beto', token: 'token-guardado-0001' }]);
  });

  it('só enviar depois das boas-vindas; antes, a mensagem se perde', () => {
    const t = montar();
    t.cliente.abrir(ENTRAR);
    expect(t.cliente.enviar({ tipo: 'chat', texto: 'oi' })).toBe(false);
    t.ultimo().abrir();
    expect(t.cliente.enviar({ tipo: 'chat', texto: 'oi' })).toBe(false);
    t.ultimo().entregar(boasVindas('token-de-teste-0009', 1));
    expect(t.cliente.enviar({ tipo: 'chat', texto: 'oi' })).toBe(true);
    expect(t.ultimo().mensagensEnviadas().at(-1)).toEqual({ tipo: 'chat', texto: 'oi' });
  });

  it('recusa na entrada (sala inexistente) encerra sem tentar de novo e esquece o token', () => {
    const t = montar();
    t.armazem.gravar('K7M2P', { token: 'token-velho-000001', nome: 'Beto' });
    t.cliente.abrir(ENTRAR);
    t.ultimo().abrir();
    t.ultimo().entregar({ tipo: 'erro', codigo: 'sala-inexistente', mensagem: 'Essa sala não existe.' });
    expect(t.estados.at(-1)).toEqual({ fase: 'encerrada', motivo: 'Essa sala não existe.' });
    expect(t.mensagens.at(-1)).toMatchObject({ tipo: 'erro', codigo: 'sala-inexistente' });
    expect(t.armazem.ler('K7M2P')).toBeNull();
    t.relogio.avancar(60_000);
    expect(t.sockets).toHaveLength(1);
  });

  it('leva o relógio da tacada na criação: 45 s, sem limite, ou nada (a sala usa o padrão)', () => {
    const com45 = montar();
    com45.cliente.abrir({ ...CRIAR, relogio: { tempoS: 45 } });
    com45.ultimo().abrir();
    expect(com45.ultimo().mensagensEnviadas()[0]).toMatchObject({ tipo: 'criar-sala', relogio: { tempoS: 45 } });

    const semLimite = montar();
    semLimite.cliente.abrir({ ...CRIAR, relogio: { tempoS: null } });
    semLimite.ultimo().abrir();
    expect(semLimite.ultimo().mensagensEnviadas()[0]).toMatchObject({ relogio: { tempoS: null } });

    const padrao = montar();
    padrao.cliente.abrir(CRIAR);
    padrao.ultimo().abrir();
    expect(padrao.ultimo().mensagensEnviadas()[0]).not.toHaveProperty('relogio');
  });

  it('leva a modalidade, o giz e o controle de força na criação; sem eles, nada (a sala usa par ou ímpar e os padrões)', () => {
    const mata = montar();
    mata.cliente.abrir({ ...CRIAR, modo: '1x1x1', modalidade: 'mata-mata', giz: { desgasteMin: 0.2, desgasteMax: 0.3, passada: 0.25, passadaS: 2 }, forca: 'empurrar' });
    mata.ultimo().abrir();
    expect(mata.ultimo().mensagensEnviadas()[0]).toMatchObject({
      tipo: 'criar-sala',
      modo: '1x1x1',
      modalidade: 'mata-mata',
      giz: { desgasteMin: 0.2, desgasteMax: 0.3, passada: 0.25, passadaS: 2 },
      forca: 'empurrar',
    });

    const padrao = montar();
    padrao.cliente.abrir(CRIAR);
    padrao.ultimo().abrir();
    for (const campo of ['modalidade', 'giz', 'forca']) expect(padrao.ultimo().mensagensEnviadas()[0]).not.toHaveProperty(campo);
  });

  it('leva a linha de previsão na criação, completa como a sala a quer; sem linha, nada (a sala a deixa desligada)', () => {
    const ligada = montar();
    ligada.cliente.abrir({ ...CRIAR, linha: { previsao: true, bolaAtingida: false } });
    ligada.ultimo().abrir();
    expect(ligada.ultimo().mensagensEnviadas()[0]).toMatchObject({ tipo: 'criar-sala', linha: { previsao: true, bolaAtingida: false } });

    const comBola = montar();
    comBola.cliente.abrir({ ...CRIAR, linha: { previsao: true, bolaAtingida: true } });
    comBola.ultimo().abrir();
    expect(comBola.ultimo().mensagensEnviadas()[0]).toMatchObject({ linha: { previsao: true, bolaAtingida: true } });

    const padrao = montar();
    padrao.cliente.abrir(CRIAR);
    padrao.ultimo().abrir();
    expect(padrao.ultimo().mensagensEnviadas()[0]).not.toHaveProperty('linha');
  });

  it('leva a aposta na criação; sem ela, nada (a sala usa o padrão)', () => {
    const com50 = montar();
    com50.cliente.abrir({ ...CRIAR, aposta: 50 });
    com50.ultimo().abrir();
    expect(com50.ultimo().mensagensEnviadas()[0]).toMatchObject({ tipo: 'criar-sala', aposta: 50 });

    const padrao = montar();
    padrao.cliente.abrir(CRIAR);
    padrao.ultimo().abrir();
    expect(padrao.ultimo().mensagensEnviadas()[0]).not.toHaveProperty('aposta');
  });

  it('leva o código da carteira ao criar e ao entrar (com ou sem token); sem carteira, nada', () => {
    const CODIGO = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
    const criando = montar({ carteira: () => CODIGO });
    criando.cliente.abrir(CRIAR);
    criando.ultimo().abrir();
    expect(criando.ultimo().mensagensEnviadas()[0]).toMatchObject({ tipo: 'criar-sala', carteira: CODIGO });

    const entrando = montar({ carteira: () => CODIGO });
    entrando.cliente.abrir(ENTRAR);
    entrando.ultimo().abrir();
    expect(entrando.ultimo().mensagensEnviadas()[0]).toMatchObject({ tipo: 'entrar', carteira: CODIGO });

    const comToken = montar({ carteira: () => CODIGO });
    comToken.armazem.gravar('K7M2P', { token: 'token-guardado-0001', nome: 'Beto' });
    comToken.cliente.abrir(ENTRAR);
    comToken.ultimo().abrir();
    expect(comToken.ultimo().mensagensEnviadas()[0]).toMatchObject({ tipo: 'entrar', token: 'token-guardado-0001', carteira: CODIGO });

    const sem = montar({ carteira: () => undefined });
    sem.cliente.abrir(ENTRAR);
    sem.ultimo().abrir();
    expect(sem.ultimo().mensagensEnviadas()[0]).not.toHaveProperty('carteira');
  });

  it('na volta de uma queda o `entrar` leva o código de agora, lido de novo (a carteira pode ter sido trocada)', () => {
    let codigo: string | undefined = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ';
    const t = montar({ carteira: () => codigo });
    t.cliente.abrir(CRIAR);
    t.ultimo().abrir();
    t.ultimo().entregar(boasVindas());
    t.ultimo().fecharDoOutroLado();
    codigo = 'ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkj';
    t.relogio.avancar(500);
    t.ultimo().abrir();
    expect(t.ultimo().mensagensEnviadas()[0]).toMatchObject({ tipo: 'entrar', token: 'token-de-teste-0001', carteira: 'ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkj' });
  });

  it('erro de versão é fatal: encerra pedindo para recarregar, sem tentar de novo e sem esquecer o token', () => {
    const t = montar();
    t.armazem.gravar('K7M2P', { token: 'token-meu-00000001', nome: 'Beto' });
    t.cliente.abrir(ENTRAR);
    t.ultimo().abrir();
    t.ultimo().entregar({ tipo: 'erro', codigo: 'versao', mensagem: 'Esta página é de uma versão antiga: recarregue a página.' });
    expect(t.estados.at(-1)).toEqual({ fase: 'encerrada', motivo: 'Esta página é de uma versão antiga: recarregue a página.', recarregar: true });
    expect(t.armazem.ler('K7M2P')).not.toBeNull();
    t.relogio.avancar(120_000);
    expect(t.sockets).toHaveLength(1);
  });

  it('erro de versão ao criar a sala também encerra de uma vez (sem criar três salas)', () => {
    const t = montar();
    t.cliente.abrir(CRIAR);
    t.ultimo().abrir();
    t.ultimo().entregar({ tipo: 'erro', codigo: 'versao', mensagem: 'recarregue a página' });
    expect(t.estados.at(-1)).toMatchObject({ fase: 'encerrada', recarregar: true });
    t.relogio.avancar(120_000);
    expect(t.sockets).toHaveLength(1);
  });

  it('outras recusas não pedem para recarregar', () => {
    const t = montar();
    t.cliente.abrir(ENTRAR);
    t.ultimo().abrir();
    t.ultimo().entregar({ tipo: 'erro', codigo: 'sala-cheia', mensagem: 'A sala está cheia.' });
    expect(t.estados.at(-1)).not.toHaveProperty('recarregar');
  });

  it('recusa por sala cheia também encerra; o token fica (a sala existe)', () => {
    const t = montar();
    t.armazem.gravar('K7M2P', { token: 'token-meu-00000001', nome: 'Beto' });
    t.cliente.abrir(ENTRAR);
    t.ultimo().abrir();
    t.ultimo().entregar({ tipo: 'erro', codigo: 'sala-cheia', mensagem: 'A sala está cheia.' });
    expect(t.estados.at(-1)).toEqual({ fase: 'encerrada', motivo: 'A sala está cheia.' });
    expect(t.armazem.ler('K7M2P')).not.toBeNull();
  });

  it('erro depois das boas-vindas é só repassado: a conexão segue de pé', () => {
    const t = montar();
    t.cliente.abrir(ENTRAR);
    t.ultimo().abrir();
    t.ultimo().entregar(boasVindas('token-de-teste-0009', 1));
    t.ultimo().entregar({ tipo: 'erro', codigo: 'nao-e-sua-vez', mensagem: 'Não é a sua vez.' });
    expect(t.cliente.conectado).toBe(true);
    expect(t.mensagens.at(-1)).toMatchObject({ codigo: 'nao-e-sua-vez' });
  });

  it('mensagem estragada é ignorada com aviso, sem derrubar', () => {
    const t = montar();
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    t.cliente.abrir(ENTRAR);
    t.ultimo().abrir();
    t.ultimo().entregar(boasVindas('token-de-teste-0009', 1));
    t.ultimo().onmessage?.({ data: '{"tipo":"nao-existe"}' });
    expect(t.cliente.conectado).toBe(true);
    expect(aviso).toHaveBeenCalledTimes(1);
    aviso.mockRestore();
  });
});

describe('ClienteSala: reconexão', () => {
  function conectado(opcoes: Parameters<typeof montar>[0] = {}) {
    const t = montar(opcoes);
    t.cliente.abrir(CRIAR);
    t.ultimo().abrir();
    t.ultimo().entregar(boasVindas());
    return t;
  }

  it('o servidor reiniciado com outra versão: na volta da queda o erro de versão encerra de vez', () => {
    const t = conectado();
    t.ultimo().fecharDoOutroLado();
    t.relogio.avancar(500);
    t.ultimo().abrir();
    t.ultimo().entregar({ tipo: 'erro', codigo: 'versao', mensagem: 'recarregue a página' });
    expect(t.estados.at(-1)).toMatchObject({ fase: 'encerrada', recarregar: true });
    expect(t.armazem.ler('K7M2P')).not.toBeNull();
    t.relogio.avancar(120_000);
    expect(t.sockets).toHaveLength(2);
  });

  it('quando a rede cai, espera e volta com `entrar` e o mesmo token (não cria outra sala)', () => {
    const t = conectado();
    t.ultimo().fecharDoOutroLado();
    expect(t.estados.at(-1)).toEqual({ fase: 'reconectando', tentativa: 1, emMs: 500 });
    expect(t.cliente.conectado).toBe(false);
    t.relogio.avancar(499);
    expect(t.sockets).toHaveLength(1);
    t.relogio.avancar(1);
    expect(t.sockets).toHaveLength(2);
    t.ultimo().abrir();
    expect(t.ultimo().mensagensEnviadas()).toEqual([{ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Ana', token: 'token-de-teste-0001' }]);
    t.ultimo().entregar(boasVindas('token-de-teste-0001'));
    expect(t.cliente.conectado).toBe(true);
  });

  it('a espera cresce a cada falha seguida até o teto, e volta ao começo depois de conectar', () => {
    const t = conectado();
    const esperas: number[] = [];
    t.ultimo().fecharDoOutroLado();
    for (let i = 0; i < 7; i++) {
      const e = t.estados.at(-1)!;
      if (e.fase !== 'reconectando') throw new Error('esperava reconectando');
      esperas.push(e.emMs);
      t.relogio.avancar(e.emMs);
      t.ultimo().fecharDoOutroLado();
    }
    expect(esperas).toEqual([500, 1000, 2000, 4000, 8000, 10_000, 10_000]);
    const e = t.estados.at(-1)!;
    if (e.fase !== 'reconectando') throw new Error('esperava reconectando');
    t.relogio.avancar(e.emMs);
    t.ultimo().abrir();
    t.ultimo().entregar(boasVindas('token-de-teste-0001'));
    t.ultimo().fecharDoOutroLado();
    expect(t.estados.at(-1)).toEqual({ fase: 'reconectando', tentativa: 1, emMs: 500 });
  });

  it('espalha as tentativas com um sorteio (75% a 100% da espera)', () => {
    const baixo = conectado({ sortear: () => 0 });
    baixo.ultimo().fecharDoOutroLado();
    expect(baixo.estados.at(-1)).toMatchObject({ emMs: 375 });
  });

  it('tentarAgora pula a espera; fora da espera não faz nada', () => {
    const t = conectado();
    t.cliente.tentarAgora();
    expect(t.sockets).toHaveLength(1);
    t.ultimo().fecharDoOutroLado();
    t.cliente.tentarAgora();
    expect(t.sockets).toHaveLength(2);
    t.relogio.avancar(10_000);
    expect(t.sockets).toHaveLength(2);
  });

  it('socket que não abre é descartado e a tentativa seguinte vem com espera', () => {
    const t = conectado();
    t.ultimo().fecharDoOutroLado();
    t.relogio.avancar(500);
    const preso = t.ultimo();
    expect(t.sockets).toHaveLength(2);
    t.relogio.avancar(TEMPOS_PADRAO.aberturaMs);
    expect(preso.fechado).toBe(true);
    expect(t.estados.at(-1)).toMatchObject({ fase: 'reconectando', tentativa: 2 });
  });

  it('sem nada da sala por muito tempo a conexão é dada como morta e refeita', () => {
    const t = conectado();
    const primeiro = t.ultimo();
    t.relogio.avancar(TEMPOS_PADRAO.pingMs);
    expect(primeiro.mensagensEnviadas().at(-1)).toMatchObject({ tipo: 'ping' });
    t.relogio.avancar(TEMPOS_PADRAO.pingMs);
    t.relogio.avancar(TEMPOS_PADRAO.pingMs);
    expect(primeiro.fechado).toBe(true);
    expect(t.estados.at(-1)).toMatchObject({ fase: 'reconectando' });
  });

  it('o ping leva tempo relativo: com o relógio em Date.now() a sala (que só aceita |t| ≤ 1e12) ainda o entende', () => {
    const t = montar({ inicioMs: 1_790_000_000_000 });
    t.cliente.abrir(CRIAR);
    t.ultimo().abrir();
    t.ultimo().entregar(boasVindas());
    t.relogio.avancar(TEMPOS_PADRAO.pingMs);
    const ping = t.ultimo().mensagensEnviadas().at(-1);
    expect(ping).toEqual({ tipo: 'ping', t: TEMPOS_PADRAO.pingMs });
  });

  it('o pong (qualquer mensagem) mantém a conexão viva', () => {
    const t = conectado();
    for (let i = 0; i < 6; i++) {
      t.relogio.avancar(TEMPOS_PADRAO.pingMs);
      t.ultimo().entregar({ tipo: 'pong', t: 0 });
    }
    expect(t.cliente.conectado).toBe(true);
    expect(t.sockets).toHaveLength(1);
  });

  it('fechamento 4000 (outra janela tomou o lugar) não volta a tentar', () => {
    const t = conectado();
    t.ultimo().fecharDoOutroLado(4000);
    expect(t.estados.at(-1)).toMatchObject({ fase: 'encerrada' });
    t.relogio.avancar(60_000);
    expect(t.sockets).toHaveLength(1);
  });

  it('fechamento 4001 (sala expirada) encerra e esquece o token', () => {
    const t = conectado();
    t.ultimo().fecharDoOutroLado(4001);
    expect(t.estados.at(-1)).toMatchObject({ fase: 'encerrada' });
    expect(t.armazem.ler('K7M2P')).toBeNull();
  });

  it('o servidor reiniciado (sala inexistente na volta) encerra com o aviso da sala', () => {
    const t = conectado();
    t.ultimo().fecharDoOutroLado();
    t.relogio.avancar(500);
    t.ultimo().abrir();
    t.ultimo().entregar({ tipo: 'erro', codigo: 'sala-inexistente', mensagem: 'Essa sala não existe.' });
    expect(t.estados.at(-1)).toEqual({ fase: 'encerrada', motivo: 'Essa sala não existe.' });
    expect(t.armazem.ler('K7M2P')).toBeNull();
  });

  it('criar a sala e cair antes das boas-vindas tenta de novo, mas desiste na terceira vez', () => {
    const t = montar();
    t.cliente.abrir(CRIAR);
    for (let i = 0; i < 2; i++) {
      t.ultimo().abrir();
      t.ultimo().fecharDoOutroLado();
      const e = t.estados.at(-1)!;
      expect(e.fase).toBe('reconectando');
      t.relogio.avancar(10_000);
    }
    t.ultimo().abrir();
    expect(t.ultimo().mensagensEnviadas()[0]).toMatchObject({ tipo: 'criar-sala' });
    t.ultimo().fecharDoOutroLado();
    expect(t.estados.at(-1)).toMatchObject({ fase: 'encerrada' });
  });

  it('derrubar simula a queda: reconecta sozinho', () => {
    const t = conectado();
    t.cliente.derrubar();
    expect(t.estados.at(-1)).toMatchObject({ fase: 'reconectando', tentativa: 1 });
    t.relogio.avancar(500);
    expect(t.sockets).toHaveLength(2);
  });
});

describe('ClienteSala: sair e batidas', () => {
  it('sair fecha, esquece o token e não reconecta', () => {
    const t = montar();
    t.cliente.abrir(CRIAR);
    t.ultimo().abrir();
    t.ultimo().entregar(boasVindas());
    t.cliente.sair();
    expect(t.ultimo().fechado).toBe(true);
    expect(t.armazem.ler('K7M2P')).toBeNull();
    expect(t.estados.at(-1)).toEqual({ fase: 'ociosa' });
    t.relogio.avancar(60_000);
    expect(t.sockets).toHaveLength(1);
    expect(t.relogio.pendentes).toBe(0);
  });

  it('enquanto conectado, a aba renova o token no armazém (outra aba não o toma)', () => {
    const t = montar();
    t.cliente.abrir(CRIAR);
    t.ultimo().abrir();
    t.ultimo().entregar(boasVindas());
    const outraAba = new ArmazemDeSessao(t.local, 'aba-2', t.relogio.agora);
    for (let i = 0; i < 10; i++) {
      t.relogio.avancar(TEMPOS_PADRAO.batidaMs);
      t.ultimo().entregar({ tipo: 'pong', t: 0 });
    }
    expect(outraAba.ler('K7M2P')).toBeNull();
  });

  it('abrir de novo fecha a conexão anterior', () => {
    const t = montar();
    t.cliente.abrir(ENTRAR);
    const primeiro = t.ultimo();
    t.cliente.abrir({ ...ENTRAR, codigo: 'ZZZZZ' });
    expect(primeiro.fechado).toBe(true);
    expect(t.sockets).toHaveLength(2);
  });
});

describe('ClienteSala: a aba voltou de um congelamento (retomar)', () => {
  function conectado() {
    const t = montar();
    t.cliente.abrir(ENTRAR);
    t.ultimo().abrir();
    t.ultimo().entregar(boasVindas('token-de-teste-0001', null));
    return t;
  }

  it('o relógio andou sem os timers rodarem (aba congelada): ao voltar, dá a sala como perdida na hora e reconecta', () => {
    const t = conectado();
    t.relogio.agoraMs += TEMPOS_PADRAO.silencioMs + 19_000;
    t.cliente.retomar();
    expect(t.estados.at(-1)).toMatchObject({ fase: 'reconectando', tentativa: 1 });
    t.relogio.avancar(TEMPOS_PADRAO.esperaInicialMs);
    expect(t.sockets).toHaveLength(2);
    t.ultimo().abrir();
    expect(t.ultimo().mensagensEnviadas()[0]).toMatchObject({ tipo: 'entrar', codigo: 'K7M2P', token: 'token-de-teste-0001' });
  });

  it('o navegador fecha o socket com 1001 ao descongelar logo depois: não reconecta duas vezes', () => {
    const t = conectado();
    const velho = t.ultimo();
    t.relogio.agoraMs += 60_000;
    t.cliente.retomar();
    velho.fecharDoOutroLado(1001);
    t.relogio.avancar(TEMPOS_PADRAO.esperaInicialMs);
    expect(t.sockets).toHaveLength(2);
  });

  it('o navegador fecha o socket (1001) antes de retomar: reconecta uma vez só', () => {
    const t = conectado();
    t.relogio.agoraMs += 60_000;
    t.ultimo().fecharDoOutroLado(1001);
    t.cliente.retomar();
    t.relogio.avancar(TEMPOS_PADRAO.esperaInicialMs);
    expect(t.sockets).toHaveLength(2);
  });

  it('conexão recente não é derrubada: só pergunta se a sala está viva (ping) e continua conectada', () => {
    const t = conectado();
    t.relogio.agoraMs += 5_000;
    t.cliente.retomar();
    expect(t.cliente.conectado).toBe(true);
    expect(t.sockets).toHaveLength(1);
    expect(t.ultimo().mensagensEnviadas().at(-1)).toMatchObject({ tipo: 'ping' });
  });

  it('esperando para tentar de novo, tenta já (como a rede que voltou)', () => {
    const t = conectado();
    t.ultimo().fecharDoOutroLado(1006);
    expect(t.estados.at(-1)).toMatchObject({ fase: 'reconectando' });
    t.cliente.retomar();
    expect(t.sockets).toHaveLength(2);
    expect(t.estados.at(-1)).toMatchObject({ fase: 'conectando' });
  });

  it('sem sala aberta (ociosa) ou encerrada: não faz nada', () => {
    const ociosa = montar();
    ociosa.cliente.retomar();
    expect(ociosa.sockets).toHaveLength(0);
    const t = conectado();
    t.cliente.sair();
    t.cliente.retomar();
    expect(t.sockets).toHaveLength(1);
  });

  it('abrindo a conexão (ainda sem boas-vindas): deixa a abertura seguir', () => {
    const t = montar();
    t.cliente.abrir(ENTRAR);
    t.relogio.agoraMs += 60_000;
    t.cliente.retomar();
    expect(t.estados.at(-1)).toMatchObject({ fase: 'conectando' });
    expect(t.sockets).toHaveLength(1);
  });
});

describe('ClienteSala: expulso pelo anfitrião', () => {
  function naSala() {
    const t = montar();
    t.cliente.abrir(ENTRAR);
    t.ultimo().abrir();
    t.ultimo().entregar(boasVindas('token-de-teste-0001', 1));
    t.mensagens.length = 0;
    return t;
  }

  it('`expulso` encerra de vez: apaga o token, não reconecta e não passa a mensagem adiante', () => {
    const t = naSala();
    expect(t.armazem.ler('K7M2P')).not.toBeNull();
    t.ultimo().entregar({ tipo: 'expulso', motivo: 'anfitriao' });
    expect(t.estados.at(-1)).toEqual({ fase: 'encerrada', motivo: 'Você foi removido da sala pelo anfitrião.', expulso: true });
    expect(t.armazem.ler('K7M2P')).toBeNull();
    expect(t.mensagens).toEqual([]);
    expect(t.cliente.codigo).toBe('K7M2P');
    t.relogio.avancar(120_000);
    expect(t.sockets).toHaveLength(1);
    expect(t.cliente.enviar({ tipo: 'chat', texto: 'oi' })).toBe(false);
  });

  it('o fechamento 4002 que vem logo depois do `expulso` não reabre nada nem muda o estado de novo', () => {
    const t = naSala();
    t.ultimo().entregar({ tipo: 'expulso' });
    const antes = t.estados.length;
    t.ultimo().fecharDoOutroLado(4002);
    expect(t.estados).toHaveLength(antes);
    t.relogio.avancar(120_000);
    expect(t.sockets).toHaveLength(1);
  });

  it('só o fechamento 4002 (a mensagem se perdeu) também encerra como expulso e apaga o token', () => {
    const t = naSala();
    t.ultimo().fecharDoOutroLado(4002);
    expect(t.estados.at(-1)).toMatchObject({ fase: 'encerrada', expulso: true });
    expect(t.armazem.ler('K7M2P')).toBeNull();
    t.relogio.avancar(120_000);
    expect(t.sockets).toHaveLength(1);
  });

  it('voltou de uma queda sem saber da expulsão: `token-invalido` na entrada vira o mesmo encerramento, sem erro avulso', () => {
    const t = naSala();
    t.ultimo().fecharDoOutroLado(1006);
    t.relogio.avancar(500);
    t.ultimo().abrir();
    t.ultimo().entregar({ tipo: 'erro', codigo: 'token-invalido', mensagem: 'Você foi removido desta sala pelo anfitrião. Abra o link de novo para entrar.' });
    expect(t.estados.at(-1)).toMatchObject({ fase: 'encerrada', expulso: true });
    expect(t.armazem.ler('K7M2P')).toBeNull();
    expect(t.mensagens).toEqual([]);
    t.relogio.avancar(120_000);
    expect(t.sockets).toHaveLength(2);
  });

  it('entrar de novo pelo mesmo código vai sem token: é uma entrada nova', () => {
    const t = naSala();
    t.ultimo().entregar({ tipo: 'expulso' });
    t.cliente.abrir(ENTRAR);
    t.ultimo().abrir();
    expect(t.ultimo().mensagensEnviadas()).toEqual([{ tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Beto' }]);
    t.ultimo().entregar(boasVindas('token-de-teste-0777', 1));
    expect(t.estados.at(-1)).toEqual({ fase: 'conectada' });
    expect(t.armazem.ler('K7M2P')).toEqual({ token: 'token-de-teste-0777', nome: 'Beto' });
  });

  it('um fechamento comum (1006) continua reconectando, e a sala expirada (4001) não é expulsão', () => {
    const queda = naSala();
    queda.ultimo().fecharDoOutroLado(1006);
    expect(queda.estados.at(-1)).toMatchObject({ fase: 'reconectando' });
    const expirada = naSala();
    expirada.ultimo().fecharDoOutroLado(4001);
    expect(expirada.estados.at(-1)).toEqual({ fase: 'encerrada', motivo: 'A sala foi encerrada por inatividade.' });
  });
});
