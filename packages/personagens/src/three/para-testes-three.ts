import { LoadingManager, Texture } from 'three';

/**
 * Para os testes que leem o `.glb` real no Node: o GLTFLoader decodifica as texturas embutidas por `ImageBitmapLoader`/`<img>`, que o
 * Node não tem, e quebra em `self is not defined`. Este gerenciador entrega uma textura vazia no lugar de cada imagem embutida (o
 * teste confere ossos, formas e ações, não pixels). Passe-o em `OpcoesDeCargaDoRosto.gerenciador`.
 */
export function gerenciadorDeTestes(): LoadingManager {
  const g = globalThis as { self?: unknown };
  g.self ??= globalThis;
  const manager = new LoadingManager();
  manager.addHandler(/^blob:/, {
    load: (_url: string, onLoad: (t: Texture) => void) => {
      onLoad(new Texture());
    },
    setPath: () => undefined,
    setCrossOrigin: () => undefined,
    setWithCredentials: () => undefined,
    setRequestHeader: () => undefined,
    setResourcePath: () => undefined,
  } as never);
  return manager;
}
