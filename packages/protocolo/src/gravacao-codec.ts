/**
 * Codificação compacta da `Gravacao` para a rede.
 *
 * Cada bola vira um fluxo próprio (colunar), com o quadro 0 absoluto e os
 * seguintes em resíduo:
 * - posição em passos de `PASSO_POSICAO` (erro ≤ metade do passo, sem acumular:
 *   a previsão usa os valores já quantizados), prevista por velocidade constante
 *   (`2·p₁ − p₂`), resíduo em zigzag/varint;
 * - orientação em "três menores" (índice da maior componente + 3 × 10 bits);
 * - `naMesa` como troca de valor;
 * - quadros que seguem exatamente a previsão e não mudam o resto (bola parada,
 *   ou em linha reta sem giro) viram uma corrida: `0x80, extra`.
 *
 * Os eventos vão uma vez só, exatos (Float64): as regras comparam instantes
 * (toque simultâneo) e a sala roda `aplicarTacada` neles.
 */
import type { Gravacao, EventoTacada } from '@sinuca/fisica';
import { Escritor, Leitor, LeituraInvalida } from './bytes';
import { codificarUtf8, decodificarUtf8 } from './utf8';

export const LIMITES_GRAVACAO = {
  /**
   * `ConfigFisica.duracaoMaxima` × `frequenciaGravacao` + o quadro 0 (60 s × 60 Hz + 1). O custo de
   * decodificar e de animar cresce com isto; um teste amarra o número à física.
   */
  quadros: 3601,
  /** `ConfigFisica.duracaoMaxima` (s). */
  duracao: 60,
  bolas: 16,
  eventos: 2000,
  frequenciaMin: 1,
  frequenciaMax: 240,
  /** |coordenada| máxima em metros (bola que cai muito ainda cabe). */
  coordenada: 1000,
  idMaximo: 255,
  textoCacapa: 32,
} as const;

/** Passo de quantização da posição (m): erro ≤ 0,05 mm. */
export const PASSO_POSICAO = 1e-4;

const MAGIA = 0x47;
/** Versão do formato dos bytes. 2 (L34): o `bola-tabela` leva o `parte` (nariz ou boca) depois da tabela. */
export const VERSAO_DA_GRAVACAO = 2;
const VERSAO = VERSAO_DA_GRAVACAO;
const LIMITE_UNIDADES = Math.round(LIMITES_GRAVACAO.coordenada / PASSO_POSICAO);

const BIT_X = 0x01;
const BIT_Y = 0x02;
const BIT_Z = 0x04;
const BIT_ORIENTACAO = 0x08;
const BIT_NA_MESA = 0x10;
const BIT_CORRIDA = 0x80;
const BITS_VALIDOS = BIT_X | BIT_Y | BIT_Z | BIT_ORIENTACAO | BIT_NA_MESA;

const MAIOR_COMPONENTE = Math.SQRT1_2;
const NIVEIS = 1023;

const TIPOS = ['taco-bola', 'bola-bola', 'bola-tabela', 'cacapa', 'fora-da-mesa', 'parou'] as const;
/** `parte` do `bola-tabela` no fio: o índice aqui (0 nariz, 1 boca). */
const PARTES_DA_TABELA = ['nariz', 'boca'] as const;

function invalido(motivo: string): never {
  throw new LeituraInvalida(motivo);
}

/** Quaternion → 32 bits: índice da maior componente (2 bits) e as outras três em 10 bits cada. */
function empacotarQuaternion(x: number, y: number, z: number, w: number): number {
  const q = [x, y, z, w];
  const norma = Math.hypot(x, y, z, w);
  if (!Number.isFinite(norma) || norma < 1e-6) throw new RangeError('orientação inválida (quaternion nulo ou não finito)');
  let maior = 0;
  for (let k = 1; k < 4; k++) if (Math.abs(q[k]!) > Math.abs(q[maior]!)) maior = k;
  const sinal = q[maior]! < 0 ? -1 : 1;
  let empacotado = maior;
  for (let k = 0; k < 4; k++) {
    if (k === maior) continue;
    const c = Math.max(-MAIOR_COMPONENTE, Math.min(MAIOR_COMPONENTE, (sinal * q[k]!) / norma));
    const nivel = Math.round(((c + MAIOR_COMPONENTE) / (2 * MAIOR_COMPONENTE)) * NIVEIS);
    empacotado = empacotado * 1024 + nivel;
  }
  return empacotado;
}

function desempacotarQuaternion(v: number, saida: Float32Array, destino: number): void {
  const maior = Math.floor(v / 2 ** 30);
  let resto = v % 2 ** 30;
  const outras = [0, 0, 0];
  for (let k = 2; k >= 0; k--) {
    outras[k] = (resto % 1024) / NIVEIS * 2 * MAIOR_COMPONENTE - MAIOR_COMPONENTE;
    resto = Math.floor(resto / 1024);
  }
  const soma = outras[0]! ** 2 + outras[1]! ** 2 + outras[2]! ** 2;
  const grande = Math.sqrt(Math.max(0, 1 - soma));
  let j = 0;
  for (let k = 0; k < 4; k++) saida[destino + k] = k === maior ? grande : outras[j++]!;
}

function conferirGravacao(g: Gravacao): void {
  const n = g.ids.length;
  if (!(g.frequencia >= LIMITES_GRAVACAO.frequenciaMin && g.frequencia <= LIMITES_GRAVACAO.frequenciaMax)) throw new RangeError('frequência fora da faixa');
  if (!Number.isFinite(g.duracao) || g.duracao < 0 || g.duracao > LIMITES_GRAVACAO.duracao) throw new RangeError('duração inválida');
  if (!Number.isInteger(g.quadros) || g.quadros < 1 || g.quadros > LIMITES_GRAVACAO.quadros) throw new RangeError('quadros fora da faixa');
  if (g.quadros > quadrosPossiveis(g.duracao, g.frequencia)) throw new RangeError('quadros demais para a duração');
  if (n < 1 || n > LIMITES_GRAVACAO.bolas) throw new RangeError('quantidade de bolas fora da faixa');
  if (new Set(g.ids).size !== n || g.ids.some((id) => !Number.isInteger(id) || id < 0 || id > LIMITES_GRAVACAO.idMaximo)) throw new RangeError('ids de bola inválidos');
  if (g.posicoes.length !== g.quadros * n * 3 || g.orientacoes.length !== g.quadros * n * 4 || g.naMesa.length !== g.quadros * n) {
    throw new RangeError('buffers da gravação não batem com quadros × bolas');
  }
  if (g.eventos.length > LIMITES_GRAVACAO.eventos) throw new RangeError('eventos demais');
}

/** `Math.ceil(duracao · frequencia) + 1` (contrato da física) mais 1 de folga para arredondamento. */
const quadrosPossiveis = (duracao: number, frequencia: number): number => Math.ceil(duracao * frequencia) + 2;

const unidades = (metros: number): number => {
  const u = Math.round(metros / PASSO_POSICAO);
  if (!Number.isFinite(u) || Math.abs(u) > LIMITE_UNIDADES) throw new RangeError('posição fora da faixa');
  return u;
};

function codificarBola(e: Escritor, g: Gravacao, bola: number): void {
  const n = g.ids.length;
  const Q = g.quadros;
  const quadro = (q: number): number => q * n + bola;
  const x = new Array<number>(Q);
  const y = new Array<number>(Q);
  const z = new Array<number>(Q);
  const o = new Array<number>(Q);
  const na = new Array<number>(Q);
  for (let q = 0; q < Q; q++) {
    const k = quadro(q);
    x[q] = unidades(g.posicoes[k * 3]!);
    y[q] = unidades(g.posicoes[k * 3 + 1]!);
    z[q] = unidades(g.posicoes[k * 3 + 2]!);
    o[q] = empacotarQuaternion(g.orientacoes[k * 4]!, g.orientacoes[k * 4 + 1]!, g.orientacoes[k * 4 + 2]!, g.orientacoes[k * 4 + 3]!);
    const v = g.naMesa[k]!;
    if (v !== 0 && v !== 1) throw new RangeError('naMesa precisa ser 0 ou 1');
    na[q] = v;
  }

  e.zigzag(x[0]!);
  e.zigzag(y[0]!);
  e.zigzag(z[0]!);
  e.u32(o[0]!);
  e.u8(na[0]!);

  // Valores reconstruídos dos dois quadros anteriores (a previsão usa o que o decodificador vê).
  let x1 = x[0]!, x2 = x1;
  let y1 = y[0]!, y2 = y1;
  let z1 = z[0]!, z2 = z1;
  let corrida = 0;
  const fecharCorrida = (): void => {
    if (corrida === 1) e.u8(0);
    else if (corrida > 1) {
      e.u8(BIT_CORRIDA);
      e.varint(corrida - 2);
    }
    corrida = 0;
  };
  for (let q = 1; q < Q; q++) {
    const px = 2 * x1 - x2;
    const py = 2 * y1 - y2;
    const pz = 2 * z1 - z2;
    const rx = x[q]! - px;
    const ry = y[q]! - py;
    const rz = z[q]! - pz;
    let flags = 0;
    if (rx !== 0) flags |= BIT_X;
    if (ry !== 0) flags |= BIT_Y;
    if (rz !== 0) flags |= BIT_Z;
    if (o[q] !== o[q - 1]) flags |= BIT_ORIENTACAO;
    if (na[q] !== na[q - 1]) flags |= BIT_NA_MESA;
    if (flags === 0) corrida++;
    else {
      fecharCorrida();
      e.u8(flags);
      if (flags & BIT_X) e.zigzag(rx);
      if (flags & BIT_Y) e.zigzag(ry);
      if (flags & BIT_Z) e.zigzag(rz);
      if (flags & BIT_ORIENTACAO) e.u32(o[q]!);
    }
    x2 = x1; x1 = x[q]!;
    y2 = y1; y1 = y[q]!;
    z2 = z1; z1 = z[q]!;
  }
  fecharCorrida();
}

function codigoDaParte(parte: (typeof PARTES_DA_TABELA)[number]): number {
  const codigo = PARTES_DA_TABELA.indexOf(parte);
  if (codigo < 0) throw new RangeError('parte da tabela inválida');
  return codigo;
}

function codificarEvento(e: Escritor, ev: EventoTacada): void {
  e.u8(TIPOS.indexOf(ev.tipo));
  if (!Number.isFinite(ev.t) || ev.t < 0) throw new RangeError('instante de evento inválido');
  e.f64(ev.t);
  switch (ev.tipo) {
    case 'taco-bola':
      e.varint(ev.bola);
      e.f64(ev.velocidade);
      e.u8(ev.miscue ? 1 : 0);
      break;
    case 'bola-bola':
      e.varint(ev.a);
      e.varint(ev.b);
      e.f64(ev.velocidade);
      break;
    case 'bola-tabela':
      e.varint(ev.bola);
      e.varint(ev.tabela);
      e.u8(codigoDaParte(ev.parte));
      e.f64(ev.velocidade);
      break;
    case 'cacapa': {
      const texto = codificarUtf8(ev.cacapa);
      if (texto.length > LIMITES_GRAVACAO.textoCacapa) throw new RangeError('id de caçapa longo demais');
      e.varint(ev.bola);
      e.varint(texto.length);
      e.bytes(texto);
      break;
    }
    case 'fora-da-mesa':
      e.varint(ev.bola);
      break;
    case 'parou':
      break;
  }
}

/** Gravação → bytes. Lança `RangeError` se ela não couber nos limites (o contrato da física garante que cabe). */
export function codificarGravacao(g: Gravacao): Uint8Array {
  conferirGravacao(g);
  const e = new Escritor(4096);
  e.u8(MAGIA);
  e.u8(VERSAO);
  e.f64(g.frequencia);
  e.f64(g.duracao);
  e.varint(g.quadros);
  e.varint(g.ids.length);
  for (const id of g.ids) e.varint(id);
  for (let i = 0; i < g.ids.length; i++) codificarBola(e, g, i);
  e.varint(g.eventos.length);
  for (const ev of g.eventos) codificarEvento(e, ev);
  return e.pronto();
}

function lerBola(l: Leitor, Q: number, n: number, i: number, posicoes: Float32Array, orientacoes: Float32Array, naMesa: Uint8Array): void {
  const escrever = (q: number, x: number, y: number, z: number, o: number, na: number): void => {
    const k = q * n + i;
    posicoes[k * 3] = x * PASSO_POSICAO;
    posicoes[k * 3 + 1] = y * PASSO_POSICAO;
    posicoes[k * 3 + 2] = z * PASSO_POSICAO;
    desempacotarQuaternion(o, orientacoes, k * 4);
    naMesa[k] = na;
  };
  const limitar = (v: number): number => (Math.abs(v) > LIMITE_UNIDADES ? invalido('posição fora da faixa') : v);

  let x1 = limitar(l.zigzag());
  let y1 = limitar(l.zigzag());
  let z1 = limitar(l.zigzag());
  let o = l.u32();
  let na = l.u8();
  if (na > 1) invalido('naMesa inválido');
  escrever(0, x1, y1, z1, o, na);
  let x2 = x1, y2 = y1, z2 = z1;

  let q = 1;
  while (q < Q) {
    const flags = l.u8();
    let repete = 1;
    let rx = 0, ry = 0, rz = 0;
    if (flags === BIT_CORRIDA) repete = l.varint() + 2;
    else {
      if ((flags & ~BITS_VALIDOS) !== 0) invalido('flags desconhecidas');
      if (flags & BIT_X) rx = l.zigzag();
      if (flags & BIT_Y) ry = l.zigzag();
      if (flags & BIT_Z) rz = l.zigzag();
      if (flags & BIT_ORIENTACAO) o = l.u32();
      if (flags & BIT_NA_MESA) na = 1 - na;
    }
    if (q + repete > Q) invalido('corrida além do último quadro');
    for (let r = 0; r < repete; r++) {
      const x = limitar(2 * x1 - x2 + rx);
      const y = limitar(2 * y1 - y2 + ry);
      const z = limitar(2 * z1 - z2 + rz);
      escrever(q, x, y, z, o, na);
      x2 = x1; x1 = x;
      y2 = y1; y1 = y;
      z2 = z1; z1 = z;
      q++;
      rx = ry = rz = 0;
    }
  }
}

function lerEvento(l: Leitor): EventoTacada {
  const codigo = l.u8();
  const tipo = TIPOS[codigo];
  if (tipo === undefined) invalido('tipo de evento desconhecido');
  const t = l.f64();
  if (!Number.isFinite(t) || t < 0) invalido('instante de evento inválido');
  const id = (): number => {
    const v = l.varint();
    return v > LIMITES_GRAVACAO.idMaximo ? invalido('id fora da faixa') : v;
  };
  const real = (): number => {
    const v = l.f64();
    return Number.isFinite(v) ? v : invalido('número não finito');
  };
  switch (tipo) {
    case 'taco-bola': {
      const bola = id();
      const velocidade = real();
      const m = l.u8();
      if (m > 1) invalido('miscue inválido');
      return { tipo, t, bola, velocidade, miscue: m === 1 };
    }
    case 'bola-bola':
      return { tipo, t, a: id(), b: id(), velocidade: real() };
    case 'bola-tabela': {
      const bola = id();
      const tabela = id();
      const parte = PARTES_DA_TABELA[l.u8()];
      if (parte === undefined) invalido('parte da tabela inválida');
      return { tipo, t, bola, tabela, parte, velocidade: real() };
    }
    case 'cacapa': {
      const bola = id();
      const tamanho = l.varint();
      if (tamanho > LIMITES_GRAVACAO.textoCacapa) invalido('id de caçapa longo demais');
      return { tipo, t, bola, cacapa: decodificarUtf8(l.bytes(tamanho)) };
    }
    case 'fora-da-mesa':
      return { tipo, t, bola: id() };
    case 'parou':
      return { tipo, t };
  }
}

/** Bytes → gravação. Entrada inválida (de qualquer forma) lança `LeituraInvalida`; nunca outro erro. */
export function decodificarGravacao(bytes: Uint8Array): Gravacao {
  const l = new Leitor(bytes);
  if (l.u8() !== MAGIA) invalido('não é uma gravação');
  if (l.u8() !== VERSAO) invalido('versão de gravação desconhecida');
  const frequencia = l.f64();
  const duracao = l.f64();
  if (!(frequencia >= LIMITES_GRAVACAO.frequenciaMin && frequencia <= LIMITES_GRAVACAO.frequenciaMax)) invalido('frequência fora da faixa');
  if (!Number.isFinite(duracao) || duracao < 0 || duracao > LIMITES_GRAVACAO.duracao) invalido('duração inválida');
  const quadros = l.varint();
  if (quadros < 1 || quadros > LIMITES_GRAVACAO.quadros) invalido('quadros fora da faixa');
  if (quadros > quadrosPossiveis(duracao, frequencia)) invalido('quadros demais para a duração');
  const n = l.varint();
  if (n < 1 || n > LIMITES_GRAVACAO.bolas) invalido('quantidade de bolas fora da faixa');
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const id = l.varint();
    if (id > LIMITES_GRAVACAO.idMaximo || ids.includes(id)) invalido('ids de bola inválidos');
    ids.push(id);
  }
  const posicoes = new Float32Array(quadros * n * 3);
  const orientacoes = new Float32Array(quadros * n * 4);
  const naMesa = new Uint8Array(quadros * n);
  for (let i = 0; i < n; i++) lerBola(l, quadros, n, i, posicoes, orientacoes, naMesa);
  const total = l.varint();
  if (total > LIMITES_GRAVACAO.eventos) invalido('eventos demais');
  const eventos: EventoTacada[] = [];
  for (let k = 0; k < total; k++) eventos.push(lerEvento(l));
  if (l.restante !== 0) invalido('sobraram bytes depois da gravação');
  return { frequencia, ids, quadros, duracao, posicoes, orientacoes, naMesa, eventos };
}
