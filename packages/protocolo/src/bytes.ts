/** Leitura de bytes que não cabem no formato: entrada truncada, longa demais ou inválida. */
export class LeituraInvalida extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'LeituraInvalida';
  }
}

const MAX_BYTES_VARINT = 8;

/** Escreve inteiros de tamanho variável (7 bits por byte), floats e blocos num buffer que cresce. */
export class Escritor {
  private buf: Uint8Array;
  private visao: DataView;
  private n = 0;

  constructor(capacidade = 1024) {
    this.buf = new Uint8Array(Math.max(8, capacidade));
    this.visao = new DataView(this.buf.buffer);
  }

  get tamanho(): number {
    return this.n;
  }

  u8(v: number): void {
    this.garantir(1);
    this.buf[this.n++] = v;
  }

  u32(v: number): void {
    this.garantir(4);
    this.visao.setUint32(this.n, v, true);
    this.n += 4;
  }

  f64(v: number): void {
    this.garantir(8);
    this.visao.setFloat64(this.n, v, true);
    this.n += 8;
  }

  /** Inteiro seguro ≥ 0, de 1 a 8 bytes. */
  varint(v: number): void {
    if (!Number.isSafeInteger(v) || v < 0) throw new RangeError(`varint: ${v} não é inteiro seguro ≥ 0`);
    let resto = v;
    while (resto >= 0x80) {
      this.u8((resto % 0x80) | 0x80);
      resto = Math.floor(resto / 0x80);
    }
    this.u8(resto);
  }

  /** Inteiro seguro com sinal; magnitudes pequenas ocupam poucos bytes (-1 → 1, 1 → 2, ...). */
  zigzag(v: number): void {
    if (!Number.isSafeInteger(v)) throw new RangeError(`zigzag: ${v} não é inteiro seguro`);
    this.varint(v >= 0 ? v * 2 : -v * 2 - 1);
  }

  bytes(b: Uint8Array): void {
    this.garantir(b.length);
    this.buf.set(b, this.n);
    this.n += b.length;
  }

  pronto(): Uint8Array {
    return this.buf.slice(0, this.n);
  }

  private garantir(extra: number): void {
    if (this.n + extra <= this.buf.length) return;
    let capacidade = this.buf.length * 2;
    while (capacidade < this.n + extra) capacidade *= 2;
    const novo = new Uint8Array(capacidade);
    novo.set(this.buf.subarray(0, this.n));
    this.buf = novo;
    this.visao = new DataView(novo.buffer);
  }
}

/** Lê o que o `Escritor` escreveu; qualquer excesso lança `LeituraInvalida`. */
export class Leitor {
  private readonly visao: DataView;
  private pos = 0;

  constructor(private readonly buf: Uint8Array) {
    this.visao = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  get restante(): number {
    return this.buf.length - this.pos;
  }

  u8(): number {
    this.exigir(1);
    return this.buf[this.pos++]!;
  }

  u32(): number {
    this.exigir(4);
    const v = this.visao.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f64(): number {
    this.exigir(8);
    const v = this.visao.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  varint(): number {
    let v = 0;
    let fator = 1;
    for (let i = 0; i < MAX_BYTES_VARINT; i++) {
      const b = this.u8();
      v += (b & 0x7f) * fator;
      if (!Number.isSafeInteger(v)) throw new LeituraInvalida('varint acima do inteiro seguro');
      if ((b & 0x80) === 0) return v;
      fator *= 0x80;
    }
    throw new LeituraInvalida('varint longo demais');
  }

  zigzag(): number {
    const z = this.varint();
    return z % 2 === 1 ? -(z + 1) / 2 : z / 2;
  }

  bytes(n: number): Uint8Array {
    this.exigir(n);
    const fatia = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return fatia;
  }

  private exigir(n: number): void {
    if (n < 0 || this.pos + n > this.buf.length) throw new LeituraInvalida('fim inesperado dos dados');
  }
}
