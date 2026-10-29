/** Apoio dos testes: tacadas reais da física e comparações de gravação. Não é exportado pelo pacote. */
import {
  CONFIG_FISICA_PADRAO,
  criarRng,
  mesaInicial,
  simularTacada,
  type EstadoMesa,
  type Gravacao,
  type ParametrosTacada,
  type ResultadoTacada,
} from '@sinuca/fisica';
import { PRESET_BOTECO, PRESET_MATA_MATA, aplicarTacada, novaPartida, type ConfigRegras, type EstadoPartida, type Jogador } from '@sinuca/regras';
import { FORCA_DA_SALA_PADRAO, GIZ_DA_SALA_PADRAO, equipeDoLugar, type MensagemDaSala, type MensagemDoCliente, type LugarSala, type ModoSala } from './tipos';
import { FISICA_DA_SALA_PADRAO } from './fisica-da-sala';
import { fimDoDia, missoesDoDia, type MissoesDoDia } from './missoes';
import { VERSAO_DA_GRAVACAO } from './gravacao-codec';
import { codificarUtf8 } from './utf8';
import { PROTOCOLO_VERSAO } from './tipos';

/** O quadro de missões de um dia com o progresso dado (por posição: fácil, média, difícil); o resto fica em zero. */
export function quadroDeMissoes(dia: string, progresso: readonly number[] = []): MissoesDoDia {
  return {
    dia,
    fimMs: fimDoDia(dia),
    itens: missoesDoDia(dia).map((m, i) => {
      const andou = Math.min(progresso[i] ?? 0, m.meta);
      return { id: m.id, progresso: andou, meta: m.meta, cumprida: andou >= m.meta };
    }),
  };
}

export const JOGADORES_1X1: readonly Jogador[] = [
  { id: 'lugar-0', nome: 'Ana', equipe: 0 },
  { id: 'lugar-1', nome: 'Beto', equipe: 1 },
];

export const TACADA_DE_QUEBRA: ParametrosTacada = {
  angulo: 0,
  velocidadeTaco: 8,
  efeito: { lateral: 0, vertical: 0.2 },
  elevacao: 0,
  giz: 1,
};

export const TACADA_SUAVE: ParametrosTacada = {
  angulo: 0.05,
  velocidadeTaco: 1.5,
  efeito: { lateral: 0.1, vertical: 0 },
  elevacao: 0,
  giz: 1,
};

export interface PartidaReal {
  readonly partida: EstadoPartida;
  readonly arrumacao: readonly number[];
  readonly mesa: EstadoMesa;
}

export function partidaReal(semente = 1, jogadores: readonly Jogador[] = JOGADORES_1X1, regras: ConfigRegras = PRESET_BOTECO.regras): PartidaReal {
  const { partida, arrumacao } = novaPartida(regras, jogadores, criarRng(semente));
  return { partida, arrumacao, mesa: mesaInicial(arrumacao, CONFIG_FISICA_PADRAO, criarRng(semente)) };
}

export function tacadaReal(mesa: EstadoMesa, parametros: ParametrosTacada = TACADA_DE_QUEBRA, semente = 7): ResultadoTacada {
  return simularTacada(mesa, parametros, criarRng(semente), CONFIG_FISICA_PADRAO);
}

/** Maior distância (m) entre a posição de uma bola em `a` e em `b`, em qualquer quadro. */
export function maiorErroDePosicao(a: Gravacao, b: Gravacao): number {
  let pior = 0;
  for (let k = 0; k < a.quadros * a.ids.length; k++) {
    const d = Math.hypot(
      a.posicoes[k * 3]! - b.posicoes[k * 3]!,
      a.posicoes[k * 3 + 1]! - b.posicoes[k * 3 + 1]!,
      a.posicoes[k * 3 + 2]! - b.posicoes[k * 3 + 2]!,
    );
    if (d > pior) pior = d;
  }
  return pior;
}

/** Maior ângulo (rad) entre a orientação de uma bola em `a` e em `b`, em qualquer quadro. */
export function maiorErroAngular(a: Gravacao, b: Gravacao): number {
  let pior = 0;
  for (let k = 0; k < a.quadros * a.ids.length; k++) {
    let ponto = 0;
    let na = 0;
    let nb = 0;
    for (let c = 0; c < 4; c++) {
      const x = a.orientacoes[k * 4 + c]!;
      const y = b.orientacoes[k * 4 + c]!;
      ponto += x * y;
      na += x * x;
      nb += y * y;
    }
    const cos = Math.min(1, Math.abs(ponto) / Math.sqrt(na * nb));
    const angulo = 2 * Math.acos(cos);
    if (angulo > pior) pior = angulo;
  }
  return pior;
}

/** Primeira quebra (semente e ângulo varridos) em que alguma bola cai numa caçapa: gravação com `naMesa` mudando de 1 para 0. */
export function quebraComBolaCaida(): { readonly real: PartidaReal; readonly resultado: ResultadoTacada } {
  for (let semente = 1; semente <= 80; semente++) {
    const real = partidaReal(semente);
    const resultado = tacadaReal(real.mesa, { ...TACADA_DE_QUEBRA, angulo: 0.02 * semente }, semente + 100);
    if (resultado.eventos.some((e) => e.tipo === 'cacapa')) return { real, resultado };
  }
  throw new Error('nenhuma quebra encaçapou bola nas 80 sementes');
}

/** Uma tacada de quebra completa: partida/mesa de antes, resultado da física e das regras. */
export function tacadaCompleta(semente = 1) {
  const real = partidaReal(semente);
  const resultado = tacadaReal(real.mesa, TACADA_DE_QUEBRA, semente + 100);
  const regras = aplicarTacada(real.partida, resultado.eventos);
  return { ...real, resultado, regras, parametros: TACADA_DE_QUEBRA };
}

export const JOGADORES_MATA_MATA_3: readonly Jogador[] = [
  { id: 'lugar-0', nome: 'Ana', equipe: 0 },
  { id: 'lugar-1', nome: 'Beto', equipe: 1 },
  { id: 'lugar-2', nome: 'Cida', equipe: 2 },
];

/**
 * Uma tacada real de mata-mata (3 jogadores, a pena do suicídio ligada) em que a branca cai: quem tacou (Ana) entra em
 * `perdemAProximaVez` e a vez passa a Beto. Só serve a falta `suicidio` (L21: cegar também põe na lista, e a tacada que
 * cega sem derrubar a branca não é este exemplo). A física varre os ângulos até achar; é a mesma em qualquer rodada.
 */
export function suicidioNoMataMata() {
  for (let semente = 1; semente <= 20; semente++) {
    const real = partidaReal(semente, JOGADORES_MATA_MATA_3, PRESET_MATA_MATA.regras);
    for (let a = -Math.PI; a < Math.PI; a += 0.05) {
      const parametros: ParametrosTacada = { ...TACADA_DE_QUEBRA, angulo: a };
      const resultado = tacadaReal(real.mesa, parametros, semente + 100);
      const regras = aplicarTacada(real.partida, resultado.eventos);
      if (regras.consequencias.faltas.some((f) => f.nome === 'suicidio') && regras.partida.perdemAProximaVez !== undefined) return { ...real, resultado, regras, parametros };
    }
  }
  throw new Error('nenhuma tacada de mata-mata varrida derrubou a branca');
}

const lugaresDe = (nomes: readonly (string | null)[], modo: ModoSala = '2x2'): LugarSala[] =>
  nomes.map((nome, lugar) => ({ lugar, equipe: equipeDoLugar(modo, lugar), nome, conectado: nome !== null, anfitriao: lugar === 0 }));

/** Uma mensagem de cada tipo, com dados reais (partida, mesa e gravação de uma quebra). */
/** Um código de carteira com a forma certa (32 bytes em base64url); não pertence a ninguém. */
export const CARTEIRA_DE_TESTE = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCde';

export function exemplosDeMensagens(): { readonly cliente: MensagemDoCliente[]; readonly sala: MensagemDaSala[] } {
  const t = tacadaCompleta(3);
  const mesaDepois = t.resultado.estadoFinal;
  const suicidio = suicidioNoMataMata();
  const cliente: MensagemDoCliente[] = [
    { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Boteco', modo: '2x2', regras: PRESET_BOTECO.regras },
    { tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Ana' },
    { tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Ana', token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' },
    { tipo: 'escolher-lugar', lugar: 2 },
    { tipo: 'escolher-lugar', lugar: null },
    { tipo: 'iniciar' },
    { tipo: 'tacada', seq: 0, parametros: t.parametros, gravacao: t.resultado.gravacao, partida: t.regras.partida, mesa: mesaDepois },
    { tipo: 'tacada', seq: 0, parametros: suicidio.parametros, gravacao: suicidio.resultado.gravacao, partida: suicidio.regras.partida, mesa: suicidio.resultado.estadoFinal },
    { tipo: 'mira', angulo: 0.5, lateral: -0.2, vertical: 0.1, recuo: 0.15 },
    { tipo: 'chat', texto: 'bora, perdedor!' },
    { tipo: 'emoji', emoji: '🍺' },
    { tipo: 'nova-partida' },
    { tipo: 'ping', t: 1234.5 },
    { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Boteco', modo: '1x1', regras: PRESET_BOTECO.regras, relogio: { tempoS: 45, aoEsgotar: 'perde-a-vez' } },
    { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Boteco', modo: '1x1', regras: PRESET_BOTECO.regras, relogio: { tempoS: null } },
    { tipo: 'diagnostico', fpsMedio: 58.4, piorQuadroMs: 212, qualidade: 'alta', gpu: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0)', memoriaMb: 184.5 },
    { tipo: 'diagnostico', fpsMedio: 24, piorQuadroMs: 900, qualidade: 'baixa', gpu: 'desconhecida' },
    { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Boteco', modo: '1x1', regras: PRESET_BOTECO.regras, linha: { previsao: true, bolaAtingida: true } },
    { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Boteco', modo: '1x1', regras: PRESET_BOTECO.regras, linha: { previsao: false } },
    { tipo: 'voltar-ao-lobby' },
    { tipo: 'configurar-sala' },
    { tipo: 'configurar-sala', modo: '2x2', relogio: { tempoS: 60 }, linha: { previsao: true } },
    { tipo: 'configurar-sala', relogio: { tempoS: null, aoEsgotar: 'perde-a-vez' }, linha: { bolaAtingida: false } },
    { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Boteco', modo: '2x1', regras: PRESET_BOTECO.regras },
    { tipo: 'configurar-sala', modo: '2x1' },
    { tipo: 'expulsar', lugar: 1 },
    { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Mata-mata', modo: '1x1x1', modalidade: 'mata-mata', regras: PRESET_MATA_MATA.regras },
    { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Boteco', modo: '2x2', modalidade: 'par-ou-impar', regras: PRESET_BOTECO.regras, giz: { desgasteMin: 0.05, desgasteMax: 0.5, passada: 0.5, passadaS: 6 }, forca: 'empurrar' },
    { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Mata-mata', modo: '1x1x1x1', modalidade: 'mata-mata', regras: PRESET_MATA_MATA.regras, giz: { passadaS: 0.5 }, forca: 'linha' },
    { tipo: 'configurar-sala', modalidade: 'mata-mata' },
    { tipo: 'configurar-sala', modalidade: 'mata-mata', modo: '1x1x1x1', giz: { desgasteMax: 0.4 }, forca: 'empurrar' },
    { tipo: 'configurar-sala', modo: '1x1x1', giz: { desgasteMin: 0, desgasteMax: 0, passada: 0.05, passadaS: 0.5 } },
    { tipo: 'criar-sala', versao: PROTOCOLO_VERSAO, nome: 'Zé', preset: 'Boteco', modo: '1x1', regras: PRESET_BOTECO.regras, aposta: 50, carteira: CARTEIRA_DE_TESTE },
    { tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Ana', carteira: CARTEIRA_DE_TESTE },
    { tipo: 'entrar', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', nome: 'Ana', token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', carteira: CARTEIRA_DE_TESTE },
    { tipo: 'configurar-sala', aposta: 100 },
    { tipo: 'configurar-sala', fisica: null },
    { tipo: 'configurar-sala', fisica: {} },
    { tipo: 'configurar-sala', fisica: { atritoRolamento: 0.03, velocidadeMaxTaco: 9.5 } },
    // fora da faixa não é erro de forma: a sala corta
    { tipo: 'configurar-sala', fisica: { atritoDeslizamento: 99, desaceleracaoGiro: -4 } },
    { tipo: 'configurar-sala', fisica: { restituicaoBolaBola: 0.9 } },
  ];
  const estado = {
    tipo: 'estado-sala',
    codigo: 'K7M2P',
    modo: '2x2',
    preset: 'Boteco',
    fase: 'jogando',
    seq: 1,
    vez: 1,
    lugares: lugaresDe(['Zé', 'Ana', 'Beto', null]),
    espectadores: 2,
  } as const;
  const relogio = { tempoS: 30, aoEsgotar: 'perde-a-vez' } as const;
  const sala: MensagemDaSala[] = [
    { tipo: 'boas-vindas', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', lugar: 0, anfitriao: true },
    { tipo: 'boas-vindas', versao: PROTOCOLO_VERSAO, codigo: 'K7M2P', token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', lugar: null, anfitriao: false },
    estado,
    { ...estado, relogio, prazoMs: 31_250 },
    { ...estado, relogio: { tempoS: null, aoEsgotar: 'perde-a-vez' }, prazoMs: null },
    { ...estado, relogio, linha: { previsao: true, bolaAtingida: false }, prazoMs: 12_000 },
    { ...estado, fase: 'espera', vez: null, seq: 0, relogio, linha: { previsao: false, bolaAtingida: false }, prazoMs: null },
    { tipo: 'tempo-esgotado', lugar: 1, proximo: 2, motivo: 'tempo', consequencia: 'perde-a-vez' },
    { tipo: 'tempo-esgotado', lugar: 2, proximo: 3, motivo: 'ausencia', consequencia: 'perde-a-vez' },
    { ...estado, modo: '2x1', fase: 'espera', vez: null, seq: 0, lugares: lugaresDe(['Zé', 'Ana', 'Beto', null]), relogio, linha: { previsao: false, bolaAtingida: false }, prazoMs: null },
    { tipo: 'expulso' },
    { tipo: 'expulso', motivo: 'anfitriao' },
    { ...estado, fase: 'espera', vez: null, seq: 0, relogio, linha: { previsao: false, bolaAtingida: false }, prazoMs: null, placar: { atual: null, historico: [] } },
    {
      ...estado,
      fase: 'espera',
      vez: null,
      seq: 0,
      relogio,
      prazoMs: null,
      placar: {
        atual: { lados: [{ nomes: ['Zé', 'Beto'], vitorias: 3 }, { nomes: ['Ana'], vitorias: 1 }] },
        historico: [{ lados: [{ nomes: ['Zé'], vitorias: 2 }, { nomes: ['Ana'], vitorias: 0 }] }],
      },
    },
    { ...estado, modo: '1x1x1', modalidade: 'mata-mata', preset: 'Mata-mata', lugares: lugaresDe(['Zé', 'Ana', 'Beto', null], '1x1x1'), relogio, linha: { previsao: false, bolaAtingida: false }, giz: GIZ_DA_SALA_PADRAO, forca: FORCA_DA_SALA_PADRAO, prazoMs: 9_000 },
    { ...estado, modalidade: 'par-ou-impar', giz: { desgasteMin: 0, desgasteMax: 0.5, passada: 0.05, passadaS: 6 }, forca: 'empurrar' },
    {
      ...estado,
      modo: '1x1x1x1',
      modalidade: 'mata-mata',
      preset: 'Mata-mata',
      fase: 'espera',
      vez: null,
      seq: 0,
      lugares: lugaresDe(['Zé', 'Ana', 'Beto', 'Cida'], '1x1x1x1'),
      relogio,
      prazoMs: null,
      placar: {
        atual: { lados: [{ nomes: ['Zé'], vitorias: 2 }, { nomes: ['Ana'], vitorias: 1 }, { nomes: ['Beto'], vitorias: 0 }, { nomes: ['Cida'], vitorias: 3 }] },
        historico: [{ lados: [{ nomes: ['Zé'], vitorias: 1 }, { nomes: ['Ana'], vitorias: 1 }, { nomes: ['Beto'], vitorias: 0 }] }],
      },
    },
    { tipo: 'retrato', motivo: 'inicio', seq: 0, partida: t.partida, arrumacao: t.arrumacao, semente: 12345, mesa: null, ultima: null },
    {
      tipo: 'retrato',
      motivo: 'entrada',
      seq: 1,
      partida: t.regras.partida,
      arrumacao: t.arrumacao,
      semente: 12345,
      mesa: mesaDepois,
      ultima: { seq: 0, lugar: 0, parametros: t.parametros, gravacao: t.resultado.gravacao, consequencias: t.regras.consequencias },
    },
    {
      tipo: 'tacada-retransmitida',
      seq: 0,
      lugar: 0,
      parametros: t.parametros,
      gravacao: t.resultado.gravacao,
      partida: t.regras.partida,
      mesa: mesaDepois,
      consequencias: t.regras.consequencias,
    },
    {
      tipo: 'tacada-retransmitida',
      seq: 0,
      lugar: 0,
      parametros: suicidio.parametros,
      gravacao: suicidio.resultado.gravacao,
      partida: suicidio.regras.partida,
      mesa: suicidio.resultado.estadoFinal,
      consequencias: suicidio.regras.consequencias,
    },
    {
      tipo: 'retrato',
      motivo: 'entrada',
      seq: 1,
      partida: suicidio.regras.partida,
      arrumacao: suicidio.arrumacao,
      semente: 12345,
      mesa: suicidio.resultado.estadoFinal,
      ultima: { seq: 0, lugar: 0, parametros: suicidio.parametros, gravacao: suicidio.resultado.gravacao, consequencias: suicidio.regras.consequencias },
    },
    { tipo: 'mira-retransmitida', lugar: 1, angulo: 0.5, lateral: 0, vertical: 0, recuo: 0.1 },
    { tipo: 'chat-retransmitido', lugar: null, nome: 'Zé', texto: 'oi' },
    { tipo: 'emoji-retransmitido', lugar: null, nome: 'Zé', emoji: '😂' },
    { tipo: 'emoji-retransmitido', lugar: 2, nome: 'Ana', emoji: '🎱' },
    { ...estado, aposta: 20, lugares: estado.lugares.map((l, i) => (i === 0 ? { ...l, saldo: 120, skin: 'ouro' as const } : i === 1 ? { ...l, saldo: -45, skin: 'classico' as const } : l)) },
    { ...estado, aposta: 10, lugares: estado.lugares.map((l) => ({ ...l, saldo: null, skin: 'classico' as const })) },
    { ...estado, fisica: { ...FISICA_DA_SALA_PADRAO, atritoRolamento: 0.03 }, fisicaMexida: true, fisicaTravada: false },
    { ...estado, fisica: FISICA_DA_SALA_PADRAO, fisicaMexida: false, fisicaTravada: true },
    { ...estado, lugares: estado.lugares.map((l, i) => (i === 0 ? { ...l, saldo: 140, skin: 'ouro' as const, estatisticas: { partidas: 12, vitorias: 7, bolas: 63 } } : i === 1 ? { ...l, estatisticas: { partidas: 0, vitorias: 0, bolas: 0 } } : i === 2 ? { ...l, estatisticas: null } : l)) },
    { tipo: 'fisica-alterada', por: 'Zé', fisica: { ...FISICA_DA_SALA_PADRAO, atritoRolamento: 0.03, velocidadeMaxTaco: 12 }, mexida: true },
    { tipo: 'fisica-alterada', por: 'Zé', fisica: FISICA_DA_SALA_PADRAO, mexida: false },
    { tipo: 'aposta-paga', valor: 20, variacoes: [{ lugar: 0, nome: 'Zé', delta: 20, saldo: 140 }, { lugar: 1, nome: 'Ana', delta: -20, saldo: -65 }] },
    { tipo: 'aposta-paga', valor: 100, variacoes: [], anulada: 'carteira-repetida' },
    { tipo: 'missoes', missoes: quadroDeMissoes('2026-10-26', [1, 0, 0]), cumpridas: [] },
    { tipo: 'missoes', missoes: quadroDeMissoes('2026-10-26', [9, 9, 9]), cumpridas: quadroDeMissoes('2026-10-26').itens.map((i) => i.id).slice(0, 1) },
    { tipo: 'erro', codigo: 'nao-e-sua-vez', mensagem: 'Não é a sua vez.' },
    { tipo: 'pong', t: 1234.5 },
  ];
  return { cliente, sala };
}

/** Objeto de mensagem que o teste vai estragar à mão: sem tipo, para poder escrever em qualquer campo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Solto = any;

function varint(v: number, saida: number[]): void {
  let resto = v;
  while (resto >= 0x80) {
    saida.push((resto % 0x80) | 0x80);
    resto = Math.floor(resto / 0x80);
  }
  saida.push(resto);
}

/**
 * Gravação hostil e pequena no fio: `quadros` × `bolas` em corrida (cada bola parada, uma só corrida),
 * sem eventos. Decodificar custa alocação e CPU proporcionais a quadros × bolas.
 */
export function bytesDeGravacaoBomba(quadros: number, bolas = 16, duracao = (quadros - 1) / 60): Uint8Array {
  const g: number[] = [0x47, VERSAO_DA_GRAVACAO];
  const f64 = (x: number): void => {
    const b = new Uint8Array(8);
    new DataView(b.buffer).setFloat64(0, x, true);
    g.push(...b);
  };
  f64(60);
  f64(duracao);
  varint(quadros, g);
  varint(bolas, g);
  for (let i = 0; i < bolas; i++) varint(i, g);
  for (let i = 0; i < bolas; i++) {
    g.push(0, 0, 0, 0, 0, 0, 0, 1); // x, y, z em zero, orientação (w), naMesa
    if (quadros > 3) {
      g.push(0x80);
      varint(quadros - 1 - 2, g);
    } else for (let q = 1; q < quadros; q++) g.push(0);
  }
  varint(0, g);
  return Uint8Array.from(g);
}

/** Quadro binário do fio: magia, tamanho do JSON, JSON e os bytes da gravação. */
export function quadroBinario(cabecalho: object | string, gravacao: Uint8Array): Uint8Array {
  const texto = typeof cabecalho === 'string' ? cabecalho : JSON.stringify(cabecalho);
  const bytes = codificarUtf8(texto);
  const saida = new Uint8Array(5 + bytes.length + gravacao.length);
  saida[0] = 0x53;
  new DataView(saida.buffer).setUint32(1, bytes.length, true);
  saida.set(bytes, 5);
  saida.set(gravacao, 5 + bytes.length);
  return saida;
}
