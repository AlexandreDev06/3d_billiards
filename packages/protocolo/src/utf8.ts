import { LeituraInvalida } from './bytes';

const SUBSTITUTO = 0xfffd;

/** UTF-8 sem depender de `TextEncoder` (o pacote é puro e não declara DOM). Substituto solto vira U+FFFD. */
export function codificarUtf8(texto: string): Uint8Array {
  const saida: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    let c = texto.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const baixo = i + 1 < texto.length ? texto.charCodeAt(i + 1) : 0;
      if (baixo >= 0xdc00 && baixo <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (baixo - 0xdc00);
        i++;
      } else c = SUBSTITUTO;
    } else if (c >= 0xdc00 && c <= 0xdfff) c = SUBSTITUTO;

    if (c < 0x80) saida.push(c);
    else if (c < 0x800) saida.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) saida.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else saida.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return Uint8Array.from(saida);
}

/** Decodifica UTF-8 estrito: byte solto, sequência truncada ou supérflua, substituto e acima de U+10FFFF são inválidos. */
export function decodificarUtf8(bytes: Uint8Array): string {
  const partes: string[] = [];
  let bloco: number[] = [];
  const descarregar = (): void => {
    if (bloco.length > 0) partes.push(String.fromCodePoint(...bloco));
    bloco = [];
  };
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i]!;
    let extras: number;
    let minimo: number;
    let c: number;
    if (b < 0x80) {
      extras = 0;
      minimo = 0;
      c = b;
    } else if (b >= 0xc2 && b <= 0xdf) {
      extras = 1;
      minimo = 0x80;
      c = b & 0x1f;
    } else if (b >= 0xe0 && b <= 0xef) {
      extras = 2;
      minimo = 0x800;
      c = b & 0x0f;
    } else if (b >= 0xf0 && b <= 0xf4) {
      extras = 3;
      minimo = 0x10000;
      c = b & 0x07;
    } else throw new LeituraInvalida('UTF-8 inválido');
    if (extras > 0 && i + extras >= bytes.length) throw new LeituraInvalida('UTF-8 truncado');
    for (let k = 1; k <= extras; k++) {
      const continuacao = bytes[i + k]!;
      if ((continuacao & 0xc0) !== 0x80) throw new LeituraInvalida('UTF-8 inválido');
      c = (c << 6) | (continuacao & 0x3f);
    }
    if (c < minimo || c > 0x10ffff || (c >= 0xd800 && c <= 0xdfff)) throw new LeituraInvalida('UTF-8 inválido');
    bloco.push(c);
    if (bloco.length >= 4096) descarregar();
    i += extras + 1;
  }
  descarregar();
  return partes.join('');
}
