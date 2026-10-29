#!/usr/bin/env node
/**
 * Importa carteiras para a sala da Cloudflare (L41), pela rota `POST /admin/importar-carteiras`.
 *
 *   SEGREDO_ADMIN=... node scripts/importar-carteiras.mjs --url https://sinuca-sala.SEU-SUBDOMINIO.workers.dev --arquivo <cópia.json> [opções]
 *
 *   --url <endereço>            o endereço do Worker (obrigatório)
 *   --arquivo <caminho>         o arquivo a enviar (OBRIGATÓRIO, só é lido, nunca alterado). Não há padrão de propósito: o arquivo errado
 *                               (o `carteiras.json` velho da sala Node, uma cópia antiga) com `--sobrescrever` reverte ou apaga as carteiras
 *                               reais. Para a primeira importação é o `apps/sala/dados/carteiras.json` da sala Node (o script junta o
 *                               `carteiras-balao.json` que estiver ao lado dele); para desfazer uma publicação é a cópia de
 *                               `GET /admin/exportar-carteiras` que você guardou ANTES
 *   --sobrescrever              troca as carteiras que o Worker já tem (sem isto, recusa se já houver alguma); o Worker recusa
 *                               enquanto houver sala aberta (409 salas-abertas)
 *   --aceitar-descartadas       importa o que presta mesmo que o arquivo tenha carteira estragada (sem isto, recusa)
 *   --restaurar <id>            (L47b, pode repetir) traz de volta carteiras DESCARTADAS que o arquivo lista em `carteiras_descartadas`
 *                               (a exportação, ou o que `GET /admin/carteiras-descartadas` devolveu); nunca troca uma carteira que já
 *                               existe, e não se combina com `--sobrescrever` nem com `--aceitar-descartadas`
 *
 * O segredo vem SÓ da variável de ambiente `SEGREDO_ADMIN` (o mesmo que `npx wrangler secret put SEGREDO_ADMIN` guardou), nunca de um
 * argumento (apareceria na lista de processos) nem de arquivo. Para digitar sem aparecer no terminal:
 *   read -rs SEGREDO_ADMIN && export SEGREDO_ADMIN
 * O arquivo guarda só o resumo SHA-256 dos códigos, nunca os códigos; mesmo assim, o script só imprime contagens.
 */
import console from 'node:console';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

/* global fetch */

function falhar(mensagem, codigo = 1) {
  console.error(mensagem);
  process.exit(codigo);
}

const USO = 'Uso: SEGREDO_ADMIN=... node scripts/importar-carteiras.mjs --url <endereço> --arquivo <carteiras.json ou cópia> [--sobrescrever] [--aceitar-descartadas] [--restaurar <id>]...';
const args = process.argv.slice(2);
const opcoes = { url: undefined, arquivo: undefined, sobrescrever: false, aceitarDescartadas: false, restaurar: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--url') opcoes.url = args[++i];
  else if (a === '--arquivo') opcoes.arquivo = args[++i] === undefined ? '' : resolve(args[i]);
  else if (a === '--sobrescrever') opcoes.sobrescrever = true;
  else if (a === '--aceitar-descartadas') opcoes.aceitarDescartadas = true;
  else if (a === '--restaurar') opcoes.restaurar.push(args[++i] ?? '');
  else falhar(`Opção desconhecida: ${a}\n${USO}`, 2);
}

if (!opcoes.url) falhar('Falta --url (o endereço do Worker, por exemplo https://sinuca-sala.SEU-SUBDOMINIO.workers.dev).', 2);
if (!opcoes.arquivo) {
  falhar(
    `Falta --arquivo: diga QUAL arquivo enviar. Não há padrão, porque o arquivo errado (o carteiras.json velho da sala Node, uma cópia antiga) com --sobrescrever reverte ou apaga as carteiras reais da Cloudflare.\n` +
      `Primeira importação: --arquivo apps/sala/dados/carteiras.json. Desfazer uma publicação: --arquivo <a cópia de GET /admin/exportar-carteiras que você guardou antes>.\n${USO}`,
    2,
  );
}
if (opcoes.restaurar.some((id) => !/^[0-9a-f]{64}$/.test(id))) falhar('--restaurar quer o id da carteira descartada (64 caracteres hexadecimais, como aparece em GET /admin/carteiras-descartadas).', 2);
if (opcoes.restaurar.length > 0 && (opcoes.sobrescrever || opcoes.aceitarDescartadas)) falhar('--restaurar só acrescenta: não se combina com --sobrescrever nem com --aceitar-descartadas.', 2);
const segredo = process.env.SEGREDO_ADMIN;
if (!segredo) falhar('Falta a variável SEGREDO_ADMIN (o segredo do Worker). Para digitar sem aparecer: read -rs SEGREDO_ADMIN && export SEGREDO_ADMIN', 2);

let base;
try {
  base = new URL(opcoes.url);
} catch {
  falhar(`--url não é um endereço: ${opcoes.url}`, 2);
}
const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
if (base.protocol !== 'https:' && !local) falhar('O segredo só vai por https (ou para localhost, nos testes).', 2);

let texto;
try {
  texto = readFileSync(opcoes.arquivo, 'utf8');
} catch (e) {
  falhar(`Não consegui ler ${opcoes.arquivo}: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
}
let quantas;
try {
  const lido = JSON.parse(texto);
  quantas = Object.keys(lido.carteiras ?? {}).length;
  console.log(`Arquivo ${opcoes.arquivo}: formato ${lido.versao}, ${quantas} carteiras.`);
  // O `carteiras.json` da sala Node não leva o balão: ele mora ao lado, em `carteiras-balao.json` (L47b). Sem juntar, o balão comprado ficaria para trás.
  const irmao = join(dirname(opcoes.arquivo), 'carteiras-balao.json');
  if (opcoes.restaurar.length === 0 && lido.baloes === undefined && basename(opcoes.arquivo) === 'carteiras.json' && existsSync(irmao)) {
    const balao = JSON.parse(readFileSync(irmao, 'utf8'));
    if (typeof balao.baloes !== 'object' || balao.baloes === null || Array.isArray(balao.baloes)) falhar(`${irmao} não é um carteiras-balao.json que a sala entende. Nada foi enviado.`);
    texto = JSON.stringify({ ...lido, baloes: balao.baloes });
    console.log(`Juntei o balão de ${Object.keys(balao.baloes).length} carteiras, de ${irmao}.`);
  }
} catch {
  falhar(`${opcoes.arquivo} (ou o carteiras-balao.json ao lado dele) não é um JSON válido. Nada foi enviado.`);
}

const alvo = new URL('/admin/importar-carteiras', base);
if (opcoes.sobrescrever) alvo.searchParams.set('sobrescrever', '1');
if (opcoes.aceitarDescartadas) alvo.searchParams.set('aceitar-descartadas', '1');
for (const id of opcoes.restaurar) alvo.searchParams.append('restaurar', id);

let resposta;
try {
  resposta = await fetch(alvo, { method: 'POST', headers: { Authorization: `Bearer ${segredo}`, 'Content-Type': 'application/json' }, body: texto });
} catch (e) {
  falhar(`Não consegui falar com ${base.origin}: ${e instanceof Error ? e.message : 'erro desconhecido'}`);
}

const corpo = await resposta.json().catch(() => ({}));
if (resposta.ok && opcoes.restaurar.length > 0) {
  console.log(`Restauradas: ${corpo.restauradas} carteiras descartadas.`);
  process.exit(0);
}
if (resposta.ok) {
  console.log(`Importado: ${corpo.importadas} carteiras (${corpo.migradas} migradas do formato 1, ${corpo.descartadas} descartadas, ${corpo.substituidas} substituídas).`);
  process.exit(0);
}

const DICAS = {
  desligado: 'O Worker não tem o segredo SEGREDO_ADMIN (ou ele é curto demais): rode `npx wrangler secret put SEGREDO_ADMIN`.',
  'nao-autorizado': 'O segredo não confere com o do Worker.',
  limite: 'Muitas tentativas deste IP: espere alguns segundos.',
  'ja-tem-carteiras': `O Worker já tem ${corpo.existentes ?? 'algumas'} carteiras. Para trocar pelas do arquivo, rode de novo com --sobrescrever (isto APAGA as que o Worker já tem: se alguém abriu o endereço antes da importação, a carteira nova dessa pessoa se perde).`,
  'salas-abertas': `Há ${corpo.salas ?? 'alguma'} sala(s) aberta(s) no Worker: trocar as carteiras com gente sentada tiraria o saldo de quem joga. Espere as salas fecharem e rode outra vez.`,
  'carteiras-invalidas': `${corpo.descartadas ?? 'Algumas'} carteiras do arquivo não prestam. Para importar só as que prestam, use --aceitar-descartadas.`,
  'arquivo-invalido': 'O arquivo não é um carteiras.json que a sala entende (versão ou forma errada).',
  cheio: `O arquivo tem mais carteiras do que o Worker aceita (${corpo.maximo ?? '?'}); suba MAX_CARTEIRAS nos vars.`,
  'corpo-grande': 'O arquivo passa de 16 MiB.',
  'descartada-nao-encontrada': 'O arquivo não lista essa carteira em carteiras_descartadas (use a exportação ou GET /admin/carteiras-descartadas, e confira o id).',
  'descartada-invalida': 'A carteira descartada ainda não presta para esta versão da sala (JSON quebrado ou forma errada); nada voltou.',
  'ja-existe': 'Essa carteira já existe no Worker: restaurar nunca troca uma carteira.',
  'parametros-incompativeis': '--restaurar não se combina com --sobrescrever nem com --aceitar-descartadas.',
};
falhar(`Recusado (HTTP ${resposta.status}, ${corpo.erro ?? 'sem código'}): ${DICAS[corpo.erro] ?? 'veja o log do Worker.'}`);
