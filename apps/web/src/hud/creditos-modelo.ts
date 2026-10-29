/** Um autor/fonte da tabela de `docs/creditos.md`, com os arquivos que vieram dele. */
export interface CreditoDeAsset {
  readonly autor: string;
  /** Endereço da página de origem; `null` se não for um link https (nunca vira `href`). */
  readonly fonte: string | null;
  readonly licenca: string;
  /** Nomes dos arquivos sem extensão (`bola-bola-1`), na ordem em que aparecem. */
  readonly arquivos: readonly string[];
  /** A célula "Asset" sem as crases, para ler como frase (`Texturas do boteco: azulejo, barrado`). */
  readonly descricao: string;
  /** Feito pelo time (licença "Autoral"): não é de terceiros e não pede crédito a ninguém. */
  readonly autoral: boolean;
}

const NOME_DE_ARQUIVO = /`([^`]+)`/g;

function nomesDosArquivos(celula: string): string[] {
  const nomes: string[] = [];
  for (const [, nome] of celula.matchAll(NOME_DE_ARQUIVO)) {
    const semExtensao = nome!.replace(/\.[A-Za-z0-9]{2,4}$/, '');
    if (!nomes.includes(semExtensao)) nomes.push(semExtensao);
  }
  return nomes;
}

const celulas = (linha: string): string[] =>
  linha
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

/**
 * Lê a tabela de `docs/creditos.md` (colunas Asset, Autor, Fonte, Licença, Onde é usado) e junta as linhas do mesmo
 * autor e fonte: os dois formatos de um arquivo, ou duas amostras da mesma gravação, viram um crédito só. A tela de
 * créditos do jogo sai daqui, então o crédito escrito num lugar só vale nos dois.
 */
export function lerCreditos(markdown: string): readonly CreditoDeAsset[] {
  const grupos = new Map<string, { autor: string; fonte: string | null; licenca: string; arquivos: string[]; descricao: string }>();
  for (const linha of markdown.split('\n')) {
    if (!linha.trimStart().startsWith('|')) continue;
    const [asset, autor, fonte, licenca] = celulas(linha);
    if (!asset || !autor || !fonte || !licenca) continue;
    const arquivos = nomesDosArquivos(asset);
    if (arquivos.length === 0) continue; // cabeçalho e separador não têm nome de arquivo entre crases
    const https = /^https:\/\/\S+$/.test(fonte) ? fonte : null;
    const chave = `${autor}\n${https ?? fonte}`;
    const grupo = grupos.get(chave) ?? { autor, fonte: https, licenca, arquivos: [], descricao: asset.replace(/`/g, '') };
    for (const nome of arquivos) if (!grupo.arquivos.includes(nome)) grupo.arquivos.push(nome);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()].map((g) => ({ ...g, autoral: /^autoral/i.test(g.licenca) }));
}

/** Os créditos de terceiros (os sons, com autor e link) e a arte autoral do time, que a tela mostra em seções separadas. */
export function separarCreditos(creditos: readonly CreditoDeAsset[]): { readonly terceiros: readonly CreditoDeAsset[]; readonly autorais: readonly CreditoDeAsset[] } {
  return { terceiros: creditos.filter((c) => !c.autoral), autorais: creditos.filter((c) => c.autoral) };
}

/** O texto curto de um endereço para mostrar ao lado do link (`freesound.org/people/JNi2/sounds/404519`). */
export function enderecoCurto(fonte: string): string {
  return fonte.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '');
}
