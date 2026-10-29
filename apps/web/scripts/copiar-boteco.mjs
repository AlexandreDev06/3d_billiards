// Copia o boteco do artista (`arte/boteco/exportados/`) para `apps/web/public/boteco/` e o letreiro do jogo (`arte/marca/`) para
// `apps/web/public/marca/`, de onde o jogo os carrega (L44). Roda antes do `dev` e do `build`. As cópias não vão para o git (cada pasta
// tem um `.gitignore` que ignora tudo): a fonte é `arte/`. Recopia tudo que mudou, pelo conteúdo (tamanho e bytes, nunca pela data:
// um arquivo refeito pelo artista pode vir com data mais velha e o mesmo tamanho); se o arquivo do artista faltar, só avisa e segue
// (o jogo roda sem boteco e o menu volta ao letreiro de texto).
import console from 'node:console';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GRUPOS = [
  {
    nome: 'boteco',
    origem: join(raiz, 'arte', 'boteco', 'exportados'),
    destino: join(raiz, 'apps', 'web', 'public', 'boteco'),
    arquivos: ['boteco-alto.glb', 'boteco-medio.glb', 'boteco-baixo.glb', 'boteco-meta.json'],
  },
  {
    nome: 'marca',
    origem: join(raiz, 'arte', 'marca'),
    destino: join(raiz, 'apps', 'web', 'public', 'marca'),
    arquivos: ['letreiro-acesa.png', 'letreiro-apagada.png', 'sinuca-acesa.png', 'sinuca-apagada.png'],
  },
];
const IGNORAR_TUDO = '# A cópia de arte/ feita pelo `dev` e pelo `build` (scripts/copiar-boteco.mjs): não vai para o git.\n*\n!.gitignore\n';

for (const { nome, origem, destino, arquivos } of GRUPOS) {
  mkdirSync(destino, { recursive: true });
  const ignorar = join(destino, '.gitignore');
  if (!existsSync(ignorar)) writeFileSync(ignorar, IGNORAR_TUDO);
  for (const arquivo of arquivos) {
    const de = join(origem, arquivo);
    const para = join(destino, arquivo);
    if (!existsSync(de)) {
      console.warn(`${nome}: ${de} não existe; o jogo seguirá sem esse arquivo`);
      continue;
    }
    if (existsSync(para) && statSync(para).size === statSync(de).size && readFileSync(para).equals(readFileSync(de))) continue;
    copyFileSync(de, para);
    console.log(`${nome}: ${arquivo} → public/${nome}/`);
  }
}
