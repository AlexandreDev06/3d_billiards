import { SRGBColorSpace, Texture } from 'three';

/** Carrega uma imagem pintada (PNG) como textura, ou `null` se não veio (a peça segue com a trama e a cor dela). */
export type CarregadorDeImagem = (url: string) => Promise<Texture | null>;

/** Onde o `dev` e o `build` põem os PNGs do Pincel (cópia de `arte/skins/exportados/`, ver `scripts/copiar-skins.mjs`). */
export const PASTA_DAS_SKINS = '/skins/';

const carregadas = new Map<string, Promise<Texture | null>>();

async function carregar(url: string): Promise<Texture | null> {
  if (typeof Image === 'undefined') return null;
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    // `decode()` termina a decodificação fora da fila principal: o quadro que sobe a textura não paga o PNG de 2048 px.
    await img.decode();
    const t = new Texture(img);
    t.colorSpace = SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  } catch {
    console.warn(`skins: não carreguei ${url}; o taco segue sem a pintura`);
    return null;
  }
}

/**
 * O carregador do navegador: cada URL é baixada e decodificada uma vez (a textura fica guardada; cada taco usa um clone dela, que
 * divide a mesma imagem na placa de vídeo). Uma falha não fica guardada: a próxima troca de skin tenta de novo.
 */
export const carregarImagemDoNavegador: CarregadorDeImagem = (url) => {
  let p = carregadas.get(url);
  if (!p) {
    p = carregar(url).then((t) => {
      if (t === null) carregadas.delete(url);
      return t;
    });
    carregadas.set(url, p);
  }
  return p;
};
