/**
 * A trava exclusiva da pasta de dados (L25): `carteiras.lock`, criado com `wx` e com o pid de quem segura. Dois processos na
 * mesma `PASTA_DADOS` leriam o arquivo ao subir, guardariam cada um a sua memória e gravariam por cima um do outro, sem erro
 * nem log; com a trava o segundo não sobe e diz por quê.
 *
 * A trava guarda o pid e, na segunda linha, o `boot_id` da máquina (`/proc/sys/kernel/random/boot_id`, quando existe). Trava de
 * um pid que não existe mais é assumida (queda, kill -9), e a de outro boot também: depois de uma queda de energia ou de reiniciar
 * a máquina sem desligar a sala, o número do pid pode já ser de outro programa, mas o boot não mente. Trava ilegível só é
 * assumida depois de velha, porque a recém-criada pode estar sendo escrita agora por quem a criou. Trava do formato de antes
 * (só o pid) vale pelo pid. Limite conhecido: dentro do mesmo boot, um pid vivo que não é uma sala (o número foi reaproveitado
 * por outro programa) parece dono, e o erro diz o arquivo a apagar.
 */
import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import type { Logger } from './log';

export const NOME_DA_TRAVA = 'carteiras.lock';
/** Trava com conteúdo que não é um pid: depois disto sem mudar, é lixo e pode ser assumida. */
const IDADE_DE_TRAVA_ILEGIVEL_MS = 2000;
const PID_MAXIMO = 2 ** 31 - 1;
const TENTATIVAS = 4;
const ARQUIVO_DO_BOOT = '/proc/sys/kernel/random/boot_id';
/** O `boot_id` do Linux é um UUID; aceita-se qualquer hexadecimal com hífens, de 8 a 64 caracteres. */
const BOOT_ID_VALIDO = /^[0-9a-fA-F-]{8,64}$/;

/** As travas que ESTE processo segura agora (caminho resolvido da pasta → o dele). Distingue "outra instância minha" de "pid reaproveitado". */
const seguradas = new Set<string>();

/** A pasta está em uso por outro processo (ou por outro armazém deste). `pid` é `null` se a trava é ilegível e recente demais para assumir. */
export class ErroDeTrava extends Error {
  constructor(
    readonly caminho: string,
    readonly pid: number | null,
  ) {
    const dono = pid === null ? 'um processo que acabou de criar a trava' : `o processo ${pid}`;
    super(
      `carteiras: a pasta de dados está em uso por ${dono} (${caminho}). Só um servidor pode usar a mesma PASTA_DADOS: ` +
        `feche o outro ou suba este com outra pasta (por exemplo PASTA_DADOS=$(mktemp -d)). ` +
        `Se esse processo não é uma sala, apague ${caminho}.`,
    );
    this.name = 'ErroDeTrava';
  }
}

/** Opções de `pegarTrava`; só os testes mexem. */
export interface OpcoesDaTrava {
  /** O `boot_id` desta máquina; `null` = não há (sistema sem /proc). Padrão: lê de `/proc/sys/kernel/random/boot_id`. */
  readonly bootId?: string | null;
}

export interface Trava {
  /** Solta a trava, só se ainda é deste processo (uma trava que outro assumiu não é apagada). Pode ser chamado de novo sem efeito. */
  soltar(): void;
}

type Dono =
  | { readonly tipo: 'sumiu' }
  | { readonly tipo: 'vivo'; readonly pid: number }
  | { readonly tipo: 'ilegivel-recente' }
  /** `texto` é o que o arquivo tinha quando foi julgado: `removerVelha` confere que o que tirou do lugar é isto. */
  | { readonly tipo: 'velha'; readonly pid: number | null; readonly texto: string };

interface ConteudoDaTrava {
  readonly pid: number;
  /** `null` na trava do formato de antes (só o pid) e na de quem não sabia o boot. */
  readonly boot: string | null;
}

function pidDeTexto(texto: string): number | null {
  if (!/^\d{1,10}\s*$/.test(texto)) return null;
  const n = Number(texto);
  return n >= 1 && n <= PID_MAXIMO ? n : null;
}

/** `pid` na primeira linha e, se houver, o `boot_id` na segunda; qualquer outra coisa não é uma trava. */
function lerConteudo(texto: string): ConteudoDaTrava | null {
  const [primeira = '', segunda = '', ...resto] = texto.split('\n');
  const pid = pidDeTexto(primeira);
  if (pid === null || resto.some((linha) => linha.trim() !== '')) return null;
  const boot = segunda.trim();
  if (boot === '') return { pid, boot: null };
  return BOOT_ID_VALIDO.test(boot) ? { pid, boot } : null;
}

/** O `boot_id` desta máquina, ou `null` se o sistema não o tem. */
function bootIdDestaMaquina(): string | null {
  try {
    const id = readFileSync(ARQUIVO_DO_BOOT, 'utf8').trim();
    return BOOT_ID_VALIDO.test(id) ? id : null;
  } catch {
    return null;
  }
}

function textoDaTrava(bootId: string | null): string {
  return bootId === null ? `${process.pid}\n` : `${process.pid}\n${bootId}\n`;
}

function processoExiste(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function donoDaTrava(caminho: string, bootAtual: string | null): Dono {
  let texto: string;
  try {
    texto = readFileSync(caminho, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { tipo: 'sumiu' };
    throw e;
  }
  const conteudo = lerConteudo(texto);
  if (conteudo === null) {
    try {
      return Date.now() - statSync(caminho).mtimeMs >= IDADE_DE_TRAVA_ILEGIVEL_MS ? { tipo: 'velha', pid: null, texto } : { tipo: 'ilegivel-recente' };
    } catch {
      return { tipo: 'sumiu' };
    }
  }
  const { pid, boot } = conteudo;
  // outro boot: o pid pode até estar vivo, mas já é de outro programa
  if (boot !== null && bootAtual !== null && boot !== bootAtual) return { tipo: 'velha', pid, texto };
  if (pid === process.pid) return seguradas.has(caminho) ? { tipo: 'vivo', pid } : { tipo: 'velha', pid, texto };
  return processoExiste(pid) ? { tipo: 'vivo', pid } : { tipo: 'velha', pid, texto };
}

function criar(caminho: string, texto: string): boolean {
  let fd: number;
  try {
    fd = openSync(caminho, 'wx', 0o600);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw e;
  }
  try {
    writeSync(fd, texto);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return true;
}

/**
 * Tira de cena a trava velha que `textoJulgado` descrevia. O `rename` é atômico: se o arquivo que saiu não é o que foi julgado
 * (outro processo assumiu a trava entre a leitura e agora) e é uma trava de verdade, devolve-o ao lugar e conta como trava viva
 * em vez de roubá-la. A devolução é um `link` seguido de `unlink`, não um `rename`: se um terceiro criou outra trava no meio
 * tempo, o `link` falha com EEXIST em vez de sobrescrevê-la.
 */
function removerVelha(caminho: string, textoJulgado: string): 'removida' | { readonly pid: number } {
  const lado = `${caminho}.${process.pid}.velha`;
  try {
    renameSync(caminho, lado);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'removida';
    throw e;
  }
  let texto = '';
  try {
    texto = readFileSync(lado, 'utf8');
  } catch {
    // ilegível: segue como se fosse o lixo julgado
  }
  const removida = lerConteudo(texto);
  if (removida !== null && texto !== textoJulgado) {
    try {
      linkSync(lado, caminho);
    } catch {
      // alguém já criou outra no lugar: a que tiramos não volta, e quem criou a nova responde por ela
    }
    unlinkSync(lado);
    return { pid: removida.pid };
  }
  unlinkSync(lado);
  return 'removida';
}

/**
 * Pega a trava da pasta (criando-a se preciso). Lança `ErroDeTrava` se outro processo a segura. Síncrono: o armazém precisa
 * dela antes de ler o arquivo de dados.
 */
export function pegarTrava(pasta: string, log: Logger, opcoes: OpcoesDaTrava = {}): Trava {
  try {
    mkdirSync(pasta, { recursive: true, mode: 0o700 });
  } catch (e) {
    throw new Error(`carteiras: não consegui preparar a pasta de dados ${pasta}: ${e instanceof Error ? e.message : 'erro desconhecido'}`, { cause: e });
  }
  const caminho = join(pasta, NOME_DA_TRAVA);
  const bootAtual = opcoes.bootId === undefined ? bootIdDestaMaquina() : opcoes.bootId;
  const meuTexto = textoDaTrava(bootAtual);
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    if (criar(caminho, meuTexto)) {
      seguradas.add(caminho);
      return {
        soltar() {
          if (!seguradas.delete(caminho)) return;
          try {
            if (readFileSync(caminho, 'utf8') === meuTexto) unlinkSync(caminho);
          } catch {
            // já não existe: nada a soltar
          }
        },
      };
    }
    const dono = donoDaTrava(caminho, bootAtual);
    switch (dono.tipo) {
      case 'sumiu':
        continue;
      case 'vivo':
        throw new ErroDeTrava(caminho, dono.pid);
      case 'ilegivel-recente':
        throw new ErroDeTrava(caminho, null);
      case 'velha': {
        const r = removerVelha(caminho, dono.texto);
        if (r !== 'removida') throw new ErroDeTrava(caminho, r.pid);
        log('carteiras-trava-assumida', { pidAnterior: dono.pid ?? 'ilegivel' });
      }
    }
  }
  throw new ErroDeTrava(caminho, null);
}
