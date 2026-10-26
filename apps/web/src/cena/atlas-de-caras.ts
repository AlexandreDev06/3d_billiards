import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture } from 'three';
import { CARAS_DO_BALAO } from '../baloes/rosto';
import { LADO_DO_QUADRO, desenharCaras } from './rosto-textura';

/**
 * A imagem com as caras do balão, uma ao lado da outra (`CARAS_DO_BALAO`), desenhada num canvas na hora: nada de arquivo. Sem
 * contexto 2D (ambiente sem canvas), uma imagem vazia: os balões ficam sem rosto, mas a cena roda.
 */
export function criarAtlasDeCaras(anisotropia = 4): Texture {
  const largura = LADO_DO_QUADRO * CARAS_DO_BALAO.length;
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = LADO_DO_QUADRO;
  const g = canvas.getContext('2d');
  if (!g) {
    const vazia = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat, UnsignedByteType);
    vazia.needsUpdate = true;
    return vazia;
  }
  desenharCaras(g);
  const textura = new CanvasTexture(canvas);
  textura.colorSpace = SRGBColorSpace;
  textura.anisotropy = anisotropia;
  textura.minFilter = LinearMipmapLinearFilter;
  textura.magFilter = LinearFilter;
  textura.name = 'atlas-de-caras';
  return textura;
}
