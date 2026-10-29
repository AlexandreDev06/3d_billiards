import { SRGBColorSpace, Texture } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PASTA_DAS_SKINS, carregarImagemDoNavegador } from './imagem-pintada';

/** Uma `Image` de brincadeira: `decode()` resolve ou falha conforme a URL. */
function instalarImagem(falhas: Set<string>, pedidos: string[]): void {
  class ImagemFalsa {
    decoding = '';
    src = '';
    async decode(): Promise<void> {
      pedidos.push(this.src);
      if (falhas.has(this.src)) throw new Error('404');
    }
  }
  vi.stubGlobal('Image', ImagemFalsa);
}

afterEach(() => vi.unstubAllGlobals());

describe('carregarImagemDoNavegador', () => {
  it('a pasta das imagens é a que o `dev` e o `build` copiam de arte/skins/exportados', () => {
    expect(PASTA_DAS_SKINS).toBe('/skins/');
  });

  it('sem `Image` (sem navegador) não há textura, e o taco segue com a trama dele', async () => {
    expect(await carregarImagemDoNavegador('/skins/nao-existe-sem-navegador.png')).toBeNull();
  });

  it('carrega o PNG como textura sRGB, uma vez só por URL (o mesmo objeto nas duas chamadas)', async () => {
    const pedidos: string[] = [];
    instalarImagem(new Set(), pedidos);
    const [a, b] = await Promise.all([carregarImagemDoNavegador('/skins/teste-a.png'), carregarImagemDoNavegador('/skins/teste-a.png')]);
    expect(a).toBeInstanceOf(Texture);
    expect(a!.colorSpace).toBe(SRGBColorSpace);
    expect(b).toBe(a);
    expect(await carregarImagemDoNavegador('/skins/teste-a.png')).toBe(a);
    expect(pedidos).toEqual(['/skins/teste-a.png']);
  });

  it('uma falha dá `null` e não fica guardada: a próxima troca de skin tenta de novo', async () => {
    const pedidos: string[] = [];
    const falhas = new Set(['/skins/teste-b.png']);
    instalarImagem(falhas, pedidos);
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await carregarImagemDoNavegador('/skins/teste-b.png')).toBeNull();
    expect(aviso).toHaveBeenCalledOnce();
    falhas.clear();
    const depois = await carregarImagemDoNavegador('/skins/teste-b.png');
    expect(depois).toBeInstanceOf(Texture);
    expect(pedidos).toEqual(['/skins/teste-b.png', '/skins/teste-b.png']);
    aviso.mockRestore();
  });
});
