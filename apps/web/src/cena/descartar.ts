import { BufferGeometry, Material, Mesh, SkinnedMesh, Texture, type Object3D } from 'three';

/** Libera geometrias, materiais e texturas da árvore (o `dispose()` de cada um é idempotente). */
export function descartar(raiz: Object3D): void {
  raiz.traverse((objeto) => {
    if (!(objeto instanceof Mesh)) return;
    if (objeto.geometry instanceof BufferGeometry) objeto.geometry.dispose();
    if (objeto instanceof SkinnedMesh) objeto.skeleton.dispose();
    const materiais: unknown = objeto.material;
    for (const material of Array.isArray(materiais) ? materiais : [materiais]) {
      if (!(material instanceof Material)) continue;
      for (const valor of Object.values(material)) if (valor instanceof Texture) valor.dispose();
      material.dispose();
    }
  });
}
