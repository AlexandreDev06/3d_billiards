// Copia os personagens do artista (`arte/personagens/exportados/`) para `apps/web/public/personagens/`, de onde o jogo os carrega.
// Roda antes do `dev` e do `build`. A cópia não vai para o git (`.gitignore`): a fonte é a pasta `arte/`, e nada além do `.glb`, do
// arquivo de contatos e os de notas (da mão e do balão) é copiado.
import console from 'node:console';
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const origem = join(raiz, 'arte', 'personagens', 'exportados');
const destino = join(raiz, 'apps', 'web', 'public', 'personagens');
const ARQUIVOS = ['mao.glb', 'mao-taco.json', 'mao-meta.json', 'balao.glb', 'balao-meta.json'];

mkdirSync(destino, { recursive: true });
for (const nome of ARQUIVOS) {
  const de = join(origem, nome);
  const para = join(destino, nome);
  if (!existsSync(de)) {
    // Sem o arquivo do artista o jogo roda sem esse personagem (e avisa no console); não derruba o `dev` nem o `build`.
    console.warn(`personagens: ${de} não existe; o jogo seguirá sem esse personagem`);
    continue;
  }
  if (existsSync(para) && statSync(para).mtimeMs >= statSync(de).mtimeMs && statSync(para).size === statSync(de).size) continue;
  copyFileSync(de, para);
  console.log(`personagens: ${nome} → public/personagens/`);
}
