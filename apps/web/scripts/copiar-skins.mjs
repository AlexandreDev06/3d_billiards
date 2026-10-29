// Copia as pinturas das skins do Pincel (`arte/skins/exportados/*.png`) para `apps/web/public/skins/`, de onde o jogo as carrega sob
// demanda (L35). Roda antes do `dev` e do `build`. A cópia não vai para o git (`public/skins/.gitignore`): a fonte é a pasta `arte/`.
// L36: só copia o que `arte/skins/skins-meta.json` dá às skins que estão no catálogo (`fora_do_catalogo: false`): as pinturas antigas
// do Corujão e do Dragão seguem em `arte/` mas não vão para o jogo, e uma cópia velha delas em `public/skins/` é apagada.
import console from 'node:console';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const origem = join(raiz, 'arte', 'skins', 'exportados');
const destino = join(raiz, 'apps', 'web', 'public', 'skins');
const meta = join(raiz, 'arte', 'skins', 'skins-meta.json');

/** Os PNGs das skins do catálogo (todo campo `arquivo*` de cada peça pintada, a variante rara, o brilho e o metal); `null` sem o meta. */
function arquivosDoCatalogo() {
  if (!existsSync(meta)) return null;
  const nomes = new Set();
  for (const skin of JSON.parse(readFileSync(meta, 'utf8')).skins ?? []) {
    if (skin.fora_do_catalogo === true) continue;
    for (const peca of skin.pecas_pintadas ?? []) {
      for (const [campo, valor] of Object.entries(peca)) if (campo.startsWith('arquivo') && typeof valor === 'string') nomes.add(basename(valor));
    }
  }
  return nomes;
}

mkdirSync(destino, { recursive: true });
if (!existsSync(origem)) {
  // Sem a pasta do artista as skins pintadas seguem com a trama de código (e o jogo roda do mesmo jeito).
  console.warn(`skins: ${origem} não existe; as skins pintadas seguirão sem a pintura`);
} else {
  const queremos = arquivosDoCatalogo();
  for (const nome of readdirSync(origem)) {
    if (!nome.endsWith('.png') || (queremos && !queremos.has(nome))) continue;
    const de = join(origem, nome);
    const para = join(destino, nome);
    if (existsSync(para) && statSync(para).mtimeMs >= statSync(de).mtimeMs && statSync(para).size === statSync(de).size) continue;
    copyFileSync(de, para);
    console.log(`skins: ${nome} → public/skins/`);
  }
  if (queremos) {
    for (const nome of readdirSync(destino)) {
      if (!nome.endsWith('.png') || queremos.has(nome)) continue;
      unlinkSync(join(destino, nome));
      console.log(`skins: ${nome} saiu do catálogo, apagado de public/skins/`);
    }
  }
}
