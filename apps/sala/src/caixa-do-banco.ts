/**
 * A caixa de saída do saldo (L57): com `SALDO_NO_BANCO=1` o Banco é o dono do saldo e a sinuca guarda só um espelho (`Guardada.saldo`),
 * com a mesma conta síncrona de sempre. Cada escrita de saldo põe aqui uma operação, que viaja com a gravação das carteiras (a tabela
 * `saida_do_banco` no Durable Object, o campo `saida` do `carteiras.json` na sala Node). O `DespachanteDoBanco` manda as operações ao
 * Banco, uma de cada vez e em ordem, e a chave de cada uma faz o reenvio ser inofensivo (`repetida`).
 *
 * Este arquivo é puro (sem disco, sem rede, sem Node): quem guarda é a subclasse de `CarteirasBase`, quem fala com o Banco é o
 * `BancoDaSala` injetado. Nunca loga código, `id` inteiro nem chave: só o tipo, o erro e 8 caracteres do `id`.
 */
import type { ResultadoDeMoeda } from '@sinuca/conta/contrato';
import type { BancoDaCaixa } from './banco-da-sala';
import type { Logger } from './log';

/** O jogo que a sala declara no livro do Banco. */
export const JOGO_NO_BANCO = 'sinuca';

export type MotivoDeCredito = 'presente' | 'missao';

export type OperacaoDoBanco =
  | { readonly tipo: 'garantir'; readonly id: string; readonly saldo: number }
  | { readonly tipo: 'creditar'; readonly id: string; readonly valor: number; readonly chave: string; readonly motivo: MotivoDeCredito }
  | { readonly tipo: 'reservar'; readonly chave: string; readonly lote: readonly { readonly id: string; readonly valor: number }[] }
  | { readonly tipo: 'liquidar'; readonly chave: string; readonly variacoes: readonly { readonly id: string; readonly delta: number }[] }
  | { readonly tipo: 'devolver'; readonly chave: string };

export interface EntradaDaCaixa {
  /** A posição na fila: cresce, e a menor sai primeiro. */
  readonly ordem: number;
  readonly op: OperacaoDoBanco;
  /** Quantas vezes o envio falhou (Banco fora do ar). */
  tentativas: number;
  readonly criadaEm: number;
}

/** Uma entrada que o Banco recusou com exceção cinco vezes seguidas estando vivo (`saida_morta`): fica guardada, fora da fila, até alguém reenviá-la. */
export interface EntradaMorta extends EntradaDaCaixa {
  readonly morreuEm: number;
  /** A mensagem do último erro, cortada em 100 caracteres. */
  readonly erro: string;
}

/** O `ehChave` do Banco: minúsculas, dígitos e `: . _ -`, até 120 caracteres. */
const FORMA_DA_CHAVE = /^[a-z0-9:._-]{1,120}$/;
const FORMA_DO_ID = /^[0-9a-f]{64}$/;
const MOTIVOS: readonly string[] = ['presente', 'missao'];

/** O Banco é de todos os jogos: toda chave que a sinuca manda começa com o nome dela, para nunca bater com a de outro jogo. */
export const PREFIXO_DAS_CHAVES = 'sinuca:';
/** O rótulo mais largo que cabe: `sinuca:presente:` (16) + rótulo + `:` + `id` (64) tem de ficar em 120. */
export const MAX_DO_ROTULO_DO_PRESENTE = 39;
export const chaveDoPresente = (rotulo: string, id: string): string => `${PREFIXO_DAS_CHAVES}presente:${rotulo}:${id}`;
export const chaveDaMissao = (dia: string, missao: string, id: string): string => `${PREFIXO_DAS_CHAVES}missao:${dia}:${missao}:${id}`;
/** Única no mundo: o código da sala se repete com o tempo, então leva o instante e um sorteio (uma chave repetida com outro conteúdo é `chave-reusada` e o pote some). Cabe nos 110 da reserva. */
export const chaveDaAposta = (codigoDaSala: string, agoraMs: number, sorteio: number): string => `${PREFIXO_DAS_CHAVES}aposta:${codigoDaSala.toLowerCase()}:${agoraMs}:${sorteio}`;

const inteiroSeguro = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);
const chaveValida = (x: unknown): x is string => typeof x === 'string' && FORMA_DA_CHAVE.test(x);
const idValido = (x: unknown): x is string => typeof x === 'string' && FORMA_DO_ID.test(x);
const objeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** A operação como foi guardada, ou `null` se a forma não presta (nunca é enviada). */
export function operacaoValida(x: unknown): OperacaoDoBanco | null {
  if (!objeto(x)) return null;
  switch (x.tipo) {
    case 'garantir':
      return idValido(x.id) && inteiroSeguro(x.saldo) && x.saldo >= 0 ? { tipo: 'garantir', id: x.id, saldo: x.saldo } : null;
    case 'creditar':
      return idValido(x.id) && inteiroSeguro(x.valor) && x.valor > 0 && chaveValida(x.chave) && typeof x.motivo === 'string' && MOTIVOS.includes(x.motivo)
        ? { tipo: 'creditar', id: x.id, valor: x.valor, chave: x.chave, motivo: x.motivo as MotivoDeCredito }
        : null;
    case 'reservar': {
      const lote = x.lote;
      if (!chaveValida(x.chave) || !Array.isArray(lote) || lote.length === 0) return null;
      const itens: { id: string; valor: number }[] = [];
      for (const item of lote) {
        if (!objeto(item) || !idValido(item.id) || !inteiroSeguro(item.valor) || item.valor <= 0) return null;
        itens.push({ id: item.id, valor: item.valor });
      }
      return { tipo: 'reservar', chave: x.chave, lote: itens };
    }
    case 'liquidar': {
      const variacoes = x.variacoes;
      if (!chaveValida(x.chave) || !Array.isArray(variacoes) || variacoes.length === 0) return null;
      const itens: { id: string; delta: number }[] = [];
      for (const item of variacoes) {
        if (!objeto(item) || !idValido(item.id) || !inteiroSeguro(item.delta) || item.delta === 0) return null;
        itens.push({ id: item.id, delta: item.delta });
      }
      return { tipo: 'liquidar', chave: x.chave, variacoes: itens };
    }
    case 'devolver':
      return chaveValida(x.chave) ? { tipo: 'devolver', chave: x.chave } : null;
    default:
      return null;
  }
}

/** A entrada como foi guardada (arquivo ou tabela), ou `null` se a forma não presta. */
export function entradaValida(x: unknown): EntradaDaCaixa | null {
  if (!objeto(x) || !inteiroSeguro(x.ordem) || x.ordem < 1 || !inteiroSeguro(x.tentativas) || x.tentativas < 0 || typeof x.criadaEm !== 'number' || !Number.isFinite(x.criadaEm)) return null;
  const op = operacaoValida(x.op);
  return op === null ? null : { ordem: x.ordem, op, tentativas: x.tentativas, criadaEm: x.criadaEm };
}

/** A entrada morta como foi guardada, ou `null` se a forma não presta. */
export function entradaMortaValida(x: unknown): EntradaMorta | null {
  const e = entradaValida(x);
  if (e === null || !objeto(x) || typeof x.morreuEm !== 'number' || !Number.isFinite(x.morreuEm) || typeof x.erro !== 'string') return null;
  return { ...e, morreuEm: x.morreuEm, erro: x.erro.slice(0, 100) };
}

/** A lista em memória, por ordem. Quem a guarda em disco lê `sujas`: as ordens cujo estado no armazenamento pode estar diferente (gravar se ainda existe, apagar se não). */
export class CaixaDeSaida {
  private readonly lista: EntradaDaCaixa[] = [];
  private proxima = 1;
  /** Ligado pelo armazenamento que grava por linha (SQLite); o arquivo grava tudo e dispensa. */
  rastreiaSujas = false;
  readonly sujas = new Set<number>();
  private readonly listaMorta: EntradaMorta[] = [];
  /** As ordens cuja linha em `saida_morta` pode estar diferente do que há em `mortas` (gravar se ainda existe, apagar se não). */
  readonly mortasSujas = new Set<number>();

  constructor(private readonly relogio: () => number) {}

  /** As entradas que o Banco recusou de vez com exceção (`saida_morta`); não estão na fila. */
  get mortas(): readonly EntradaMorta[] {
    return this.listaMorta;
  }

  get entradas(): readonly EntradaDaCaixa[] {
    return this.lista;
  }

  get vazia(): boolean {
    return this.lista.length === 0;
  }

  /** Põe o que o armazenamento tinha (já validado). Chamado uma vez, ao abrir. */
  carregar(entradas: readonly EntradaDaCaixa[], maiorOrdemNoArmazenamento = 0): void {
    this.lista.length = 0;
    this.lista.push(...[...entradas].sort((a, b) => a.ordem - b.ordem));
    this.proxima = Math.max(this.proxima - 1, maiorOrdemNoArmazenamento, ...this.lista.map((e) => e.ordem), 0) + 1;
  }

  /** Põe as mortas que o armazenamento tinha (já validadas). Chamado uma vez, ao abrir. */
  carregarMortas(mortas: readonly EntradaMorta[], maiorOrdemNoArmazenamento = 0): void {
    this.listaMorta.length = 0;
    this.listaMorta.push(...[...mortas].sort((a, b) => a.ordem - b.ordem));
    this.proxima = Math.max(this.proxima - 1, maiorOrdemNoArmazenamento, ...this.listaMorta.map((e) => e.ordem), 0) + 1;
  }

  /** A entrada sai da fila e vai para as mortas; a fila segue. */
  matar(ordem: number, erro: string): void {
    const i = this.lista.findIndex((e) => e.ordem === ordem);
    if (i < 0) return;
    const [e] = this.lista.splice(i, 1);
    this.listaMorta.push({ ...e!, morreuEm: this.relogio(), erro: erro.slice(0, 100) });
    this.marcar(ordem);
    if (this.rastreiaSujas) this.mortasSujas.add(ordem);
  }

  /** Põe todas as mortas de volta no fim da fila, com ordem nova e zero tentativas. Devolve quantas eram. */
  reenviarMortas(): number {
    const mortas = this.listaMorta.splice(0);
    for (const m of mortas) {
      if (this.rastreiaSujas) this.mortasSujas.add(m.ordem);
      this.empilhar(m.op);
    }
    return mortas.length;
  }

  buscarMorta(ordem: number): EntradaMorta | undefined {
    return this.listaMorta.find((e) => e.ordem === ordem);
  }

  /** O que vai ao `carteiras.json`. */
  paraOArquivoDasMortas(): { ordem: number; op: OperacaoDoBanco; tentativas: number; criadaEm: number; morreuEm: number; erro: string }[] {
    return this.listaMorta.map((e) => ({ ordem: e.ordem, op: e.op, tentativas: e.tentativas, criadaEm: e.criadaEm, morreuEm: e.morreuEm, erro: e.erro }));
  }

  empilhar(op: OperacaoDoBanco): EntradaDaCaixa {
    const entrada: EntradaDaCaixa = { ordem: this.proxima++, op, tentativas: 0, criadaEm: this.relogio() };
    this.lista.push(entrada);
    this.marcar(entrada.ordem);
    return entrada;
  }

  primeira(): EntradaDaCaixa | undefined {
    return this.lista[0];
  }

  buscar(ordem: number): EntradaDaCaixa | undefined {
    return this.lista.find((e) => e.ordem === ordem);
  }

  apagar(ordem: number): void {
    const i = this.lista.findIndex((e) => e.ordem === ordem);
    if (i >= 0) this.lista.splice(i, 1);
    this.marcar(ordem);
  }

  contarFalha(ordem: number): void {
    const e = this.buscar(ordem);
    if (!e) return;
    e.tentativas++;
    this.marcar(ordem);
  }

  /** O que vai ao `carteiras.json`. */
  paraOArquivo(): { ordem: number; op: OperacaoDoBanco; tentativas: number; criadaEm: number }[] {
    return this.lista.map((e) => ({ ordem: e.ordem, op: e.op, tentativas: e.tentativas, criadaEm: e.criadaEm }));
  }

  private marcar(ordem: number): void {
    if (this.rastreiaSujas) this.sujas.add(ordem);
  }
}

/** As entradas de um campo `saida` lido do arquivo; devolve o que presta e quantas não. */
export function entradasDoArquivo(saida: unknown): { entradas: EntradaDaCaixa[]; invalidas: number } {
  if (!Array.isArray(saida)) return { entradas: [], invalidas: saida === undefined ? 0 : 1 };
  const entradas: EntradaDaCaixa[] = [];
  const vistas = new Set<number>();
  let invalidas = 0;
  for (const bruto of saida) {
    const e = entradaValida(bruto);
    if (e === null || vistas.has(e.ordem)) invalidas++;
    else {
      vistas.add(e.ordem);
      entradas.push(e);
    }
  }
  return { entradas, invalidas };
}

/** As mortas de um campo `mortas` lido do arquivo; devolve o que presta e quantas não. */
export function mortasDoArquivo(mortas: unknown): { mortas: EntradaMorta[]; invalidas: number } {
  if (!Array.isArray(mortas)) return { mortas: [], invalidas: mortas === undefined ? 0 : 1 };
  const lidas: EntradaMorta[] = [];
  const vistas = new Set<number>();
  let invalidas = 0;
  for (const bruta of mortas) {
    const e = entradaMortaValida(bruta);
    if (e === null || vistas.has(e.ordem)) invalidas++;
    else {
      vistas.add(e.ordem);
      lidas.push(e);
    }
  }
  return { mortas: lidas, invalidas };
}

export const ESPERA_MINIMA_MS = 5000;
/** Quantos golpes (exceção da operação com o Banco vivo) uma entrada aguenta antes de ir para `saida_morta`. */
export const GOLPES_ATE_MORRER = 5;
/** A conta que a sonda pergunta ao Banco: válida e sem dono; só importa se ele responde (`null` também é resposta). */
const CONTA_DA_SONDA = '0'.repeat(64);
export const ESPERA_MAXIMA_MS = 5 * 60_000;

/** A espera depois da `falhas`-ésima falha seguida: 5 s, 10 s, 20 s... até 5 min. */
export const esperaDepoisDeFalhar = (falhas: number): number => Math.min(ESPERA_MINIMA_MS * 2 ** Math.max(0, falhas - 1), ESPERA_MAXIMA_MS);

type Saldos = Readonly<Record<string, number>>;

/** Manda uma operação ao Banco. Exceção do RPC sobe; recusa definitiva é `{ ok: false }`. */
async function executar(banco: BancoDaCaixa, op: OperacaoDoBanco): Promise<ResultadoDeMoeda> {
  switch (op.tipo) {
    case 'garantir': {
      const r = await banco.garantirConta(op.id, op.saldo);
      return { ok: true, saldos: { [op.id]: r.saldo }, repetida: !r.criada };
    }
    case 'creditar':
      return banco.creditar(op.id, op.valor, op.chave, { jogo: JOGO_NO_BANCO, motivo: op.motivo });
    case 'reservar':
      return banco.reservar(op.lote, op.chave, { jogo: JOGO_NO_BANCO, motivo: 'aposta' });
    case 'liquidar':
      return banco.liquidar(op.chave, op.variacoes, { jogo: JOGO_NO_BANCO, motivo: 'aposta' });
    case 'devolver':
      return banco.devolver(op.chave);
  }
}

export interface DependenciasDoDespachante {
  readonly caixa: CaixaDeSaida;
  readonly banco: BancoDaCaixa;
  readonly relogio: () => number;
  readonly log: Logger;
  /** A operação saiu da fila (Banco aceitou, ou recusou de vez, `saldos` = `null`): quem guarda apaga a entrada e leva `saldos` ao espelho numa gravação só. */
  readonly aoSair: (entrada: EntradaDaCaixa, saldos: Saldos | null) => void;
  /** O envio falhou por falha passageira: quem guarda grava a nova contagem de tentativas. */
  readonly aoFalhar: (entrada: EntradaDaCaixa) => void;
  /** A entrada levou `GOLPES_ATE_MORRER` golpes com o Banco vivo: quem guarda a tira da fila e a põe em `saida_morta` (numa gravação só). */
  readonly aoMorrer: (entrada: EntradaDaCaixa, erro: string) => void;
  /** As contas com uma compra em voo: as operações delas esperam a compra acabar (as das outras contas seguem). */
  readonly seguradas?: () => ReadonlySet<string>;
  /** O momento da próxima tentativa pode ter mudado (quem acorda a caixa lê `proximaTentativaEm`). */
  readonly aoAgendar: () => void;
  /** O armazém está fechando: nada mais é enviado. */
  readonly encerrado: () => boolean;
}

const oito = (id: string): string => id.slice(0, 8);

/** Quem aparece no log de uma operação: só os 8 primeiros caracteres do `id` quando é de uma conta só. */
/** As contas que uma operação toca; `devolver` não toca nenhuma (anda com a `chave` da reserva dela). */
function contasDa(op: OperacaoDoBanco): readonly string[] {
  if (op.tipo === 'garantir' || op.tipo === 'creditar') return [op.id];
  if (op.tipo === 'reservar') return op.lote.map((x) => x.id);
  if (op.tipo === 'liquidar') return op.variacoes.map((x) => x.id);
  return [];
}

const mensagemDoErro = (e: unknown): string => (e instanceof Error ? e.message.slice(0, 100) : 'desconhecido');

function contaDoLog(op: OperacaoDoBanco): { conta?: string; contas?: number } {
  if (op.tipo === 'garantir' || op.tipo === 'creditar') return { conta: oito(op.id) };
  if (op.tipo === 'reservar') return { contas: op.lote.length };
  if (op.tipo === 'liquidar') return { contas: op.variacoes.length };
  return {};
}

/**
 * Manda a caixa ao Banco, uma operação de cada vez e em ordem (uma só em voo).
 * - Sucesso (inclusive `repetida`): a operação sai e os `saldos` devolvidos vão ao espelho.
 * - Recusa definitiva (`ok: false`, ou `RangeError`: argumento mal formado): loga `banco-recusou` e a operação sai. Nunca trava a caixa.
 * - Qualquer outra exceção: uma sonda barata no Banco (`saldo` de uma conta sem dono) diz quem falhou.
 *   - Sonda sem resposta: é o Banco fora do ar. Para, conta a tentativa e espera 5 s, 10 s, 20 s... até 5 min, sem golpe.
 *   - Sonda respondeu: a operação é que está envenenada. Conta um golpe nela e espera o mesmo escalonamento; no quinto golpe ela vai para
 *     `saida_morta` (log `banco-envenenada`, com o tipo e o erro) e a fila segue. `POST /admin/reenviar-mortas` a põe de volta no fim.
 * - As operações de uma conta com compra em voo esperam (a compra mexe no saldo dela no Banco); as das outras contas seguem.
 */
export class DespachanteDoBanco {
  private emVoo: Promise<void> | null = null;
  private falhasSeguidas = 0;
  private esperaAte = 0;
  /** Golpes por `ordem`, só em memória: um reinício recomeça a contagem. */
  private readonly golpes = new Map<number, number>();

  constructor(private readonly deps: DependenciasDoDespachante) {}

  /** Quando a caixa quer ser acordada: `null` se está vazia; a volta da espera se falhou; senão daqui a `ESPERA_MINIMA_MS` (o prazo para uma passada normal ter esvaziado a caixa). */
  get proximaTentativaEm(): number | null {
    if (this.deps.caixa.vazia) return null;
    const agora = this.deps.relogio();
    return this.esperaAte > agora ? this.esperaAte : agora + ESPERA_MINIMA_MS;
  }

  get falhasConsecutivas(): number {
    return this.falhasSeguidas;
  }

  /** Espera a passada em voo (o fechamento). */
  esperar(): Promise<void> {
    return this.emVoo ?? Promise.resolve();
  }

  /** Agenda uma passada para logo depois do código de agora (nunca dentro dele). */
  cutucar(): void {
    queueMicrotask(() => void this.drenar());
    this.deps.aoAgendar();
  }

  /** Uma passada pela caixa, até esvaziar ou falhar. Uma só em voo: quem chama durante ela espera a mesma. Dentro da espera depois de uma falha, não faz nada. */
  drenar(): Promise<void> {
    if (this.emVoo) return this.emVoo;
    if (this.deps.caixa.vazia || this.deps.encerrado()) return Promise.resolve();
    if (this.deps.relogio() < this.esperaAte) {
      this.deps.aoAgendar(); // acordaram cedo: quem acorda rearma para o que falta
      return Promise.resolve();
    }
    this.emVoo = this.passar()
      .catch((e: unknown) => this.deps.log('erro-interno', { tipo: 'caixa-do-banco', erro: e instanceof Error ? e.message.slice(0, 100) : 'desconhecido' }))
      .finally(() => {
        this.emVoo = null;
        this.deps.aoAgendar();
      });
    return this.emVoo;
  }

  /** A primeira entrada que pode ir: pula (sem reordenar nada para quem não é tocado) as de conta com compra em voo, e as que dependem delas. */
  private proxima(): EntradaDaCaixa | undefined {
    const { caixa } = this.deps;
    const seguradas = this.deps.seguradas?.();
    if (seguradas === undefined || seguradas.size === 0) return caixa.primeira();
    const contasSeguras = new Set(seguradas);
    const chavesSeguras = new Set<string>();
    for (const entrada of caixa.entradas) {
      const { op } = entrada;
      const contas = contasDa(op);
      const chave = op.tipo === 'reservar' || op.tipo === 'liquidar' || op.tipo === 'devolver' ? op.chave : null;
      if (contas.some((c) => contasSeguras.has(c)) || (chave !== null && chavesSeguras.has(chave))) {
        // o que vem depois e toca estas contas, ou usa esta reserva, também espera: a ordem de cada conta nunca se inverte
        for (const c of contas) contasSeguras.add(c);
        if (chave !== null) chavesSeguras.add(chave);
        continue;
      }
      return entrada;
    }
    return undefined;
  }

  /** O Banco responde? Qualquer resposta (`null` também) diz que sim. */
  private async bancoRespondeu(): Promise<boolean> {
    try {
      await this.deps.banco.saldo(CONTA_DA_SONDA);
      return true;
    } catch {
      return false;
    }
  }

  private async passar(): Promise<void> {
    const { caixa, banco, log } = this.deps;
    while (!this.deps.encerrado()) {
      const entrada = this.proxima();
      if (entrada === undefined) return;
      let resultado: ResultadoDeMoeda;
      try {
        resultado = await executar(banco, entrada.op);
      } catch (e) {
        if (e instanceof RangeError) {
          log('banco-recusou', { tipo: entrada.op.tipo, erro: 'argumento-invalido', ...contaDoLog(entrada.op) });
          this.golpes.delete(entrada.ordem);
          this.deps.aoSair(entrada, null);
          continue;
        }
        if (this.deps.encerrado()) return;
        if (await this.bancoRespondeu()) {
          // o Banco está vivo e esta operação lança: envenenada. Cada golpe espera mais; no quinto ela sai da fila
          this.falhasSeguidas = 0;
          const golpes = (this.golpes.get(entrada.ordem) ?? 0) + 1;
          if (golpes >= GOLPES_ATE_MORRER) {
            this.golpes.delete(entrada.ordem);
            log('banco-envenenada', { tipo: entrada.op.tipo, golpes, erro: mensagemDoErro(e), ...contaDoLog(entrada.op) });
            this.deps.aoMorrer(entrada, mensagemDoErro(e));
            continue;
          }
          this.golpes.set(entrada.ordem, golpes);
          const espera = esperaDepoisDeFalhar(golpes);
          this.esperaAte = this.deps.relogio() + espera;
          this.deps.aoFalhar(entrada);
          log('banco-golpe', { tipo: entrada.op.tipo, golpes, esperaS: Math.round(espera / 1000), erro: mensagemDoErro(e) });
          return;
        }
        this.falhasSeguidas++;
        const espera = esperaDepoisDeFalhar(this.falhasSeguidas);
        this.esperaAte = this.deps.relogio() + espera;
        this.deps.aoFalhar(entrada);
        log('banco-fora', { tipo: entrada.op.tipo, tentativas: entrada.tentativas, esperaS: Math.round(espera / 1000), pendentes: caixa.entradas.length, erro: mensagemDoErro(e) });
        return;
      }
      this.falhasSeguidas = 0;
      this.esperaAte = 0;
      this.golpes.delete(entrada.ordem);
      if (resultado.ok) this.deps.aoSair(entrada, resultado.saldos);
      else {
        log('banco-recusou', { tipo: entrada.op.tipo, erro: resultado.erro, ...contaDoLog(entrada.op) });
        this.deps.aoSair(entrada, null);
      }
    }
  }
}
