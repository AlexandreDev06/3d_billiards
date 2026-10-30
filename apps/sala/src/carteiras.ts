/**
 * As carteiras da sala Node (L22): o núcleo (`CarteirasBase`, carteiras-base.ts) mais um arquivo JSON em disco, `carteiras.json` em
 * `PASTA_DADOS`, com a trava exclusiva da pasta. O balão de quem comprou (L47b) vai a um arquivo à parte, `carteiras-balao.json`: o
 * `carteiras.json` fica exatamente como a versão anterior o lê (ela descarta a carteira que traz uma chave que não conhece), e a anterior
 * nem sabe do outro arquivo. A gravação é o do balão primeiro e o das carteiras depois: uma queda no meio deixa o item sem o desconto,
 * nunca o desconto sem o item. O disco acompanha a memória com atraso curto (várias mudanças viram uma escrita) e
 * `descarregar()` espera tudo chegar ao arquivo, para o encerramento. As regras de saldo, loja, missões e estatísticas moram no núcleo.
 */
import { constants, copyFileSync, existsSync, readFileSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { CarteirasBase, VERSAO_DO_ARQUIVO_DO_BALAO, aplicarBaloes, objetoSimples, type Guardada, type OpcoesDasCarteiras } from './carteiras-base';
import { entradasDoArquivo, mortasDoArquivo } from './caixa-do-banco';
import { comprasDoArquivo } from './compras-pendentes';
import { pegarTrava, ErroDeTrava, type Trava } from './trava';

export type {
  EstatisticaDaPartida,
  ErroDeLoja,
  OuvinteDeCarteira,
  ResultadoDaImportacao,
  ResultadoDeLoja,
  ResultadoDeMissoes,
  Variacao,
} from './carteiras-base';

const NOME_DO_ARQUIVO = 'carteiras.json';
/** O balão de quem comprou (L47b), fora do arquivo que a versão anterior lê. */
const NOME_DO_BALAO = 'carteiras-balao.json';
const TEMPORARIO = /^carteiras(-balao)?\.json\.\d+\.tmp$/;

/** Depois de uma gravação que falhou, tenta de novo daqui a tanto (além de tentar a cada mudança e ao descarregar). */
const REPETIR_APOS_FALHA_MS = 5000;
const TENTATIVAS_AO_DESCARREGAR = 3;


export interface OpcoesDoArmazem extends OpcoesDasCarteiras {
  /** Pasta do arquivo; `null` = só memória (testes e quem não quer persistir). Criada na primeira gravação. */
  readonly pasta: string | null;
  /** Espera entre a primeira mudança e a gravação; as que vierem nesse intervalo entram na mesma escrita. */
  readonly atrasoMs: number;
}

export class ArmazemDeCarteiras extends CarteirasBase {
  private readonly arquivo: string | null;
  /** Conta as mudanças; o disco sabe até qual já recebeu. */
  private versao = 0;
  private gravadaAte = 0;
  private temporizador: NodeJS.Timeout | null = null;
  private emCurso: Promise<boolean> | null = null;
  private readonly trava: Trava | null;
  private fechando: Promise<void> | null = null;
  /** A trava da pasta já saiu: outro servidor pode estar gravando ali, então este não escreve mais nada. */
  private travaSolta = false;
  private avisouPastaSemFsync = false;
  /** O arquivo do balão existe na pasta: mesmo sem balão nenhum na memória ele é regravado (a importação, por exemplo, pode ter esvaziado). */
  private baloesNoDisco = false;
  /** A pendência `chave` está no disco: espera a gravação (a compra só chama o Banco depois). */
  protected override async garantirGravada(): Promise<boolean> {
    if (this.arquivo === null) return true;
    await this.descarregar();
    return this.gravadaAte >= this.versao;
  }

  /** O temporizador que acorda a caixa de saída do saldo (L57) na hora da próxima tentativa. */
  private temporizadorDaCaixa: NodeJS.Timeout | null = null;
  private temporizadorDaCaixaPara = 0;

  /**
   * Abre as carteiras da pasta e pega a trava exclusiva dela: se outro processo (ou outro armazém deste) a segura, lança
   * `ErroDeTrava`. Quem precisa esperar o dono sair usa `ArmazemDeCarteiras.abrir`.
   */
  constructor(private readonly disco: OpcoesDoArmazem) {
    super(disco);
    this.arquivo = disco.pasta === null ? null : join(disco.pasta, NOME_DO_ARQUIVO);
    this.trava = disco.pasta === null ? null : pegarTrava(disco.pasta, disco.log);
    try {
      this.limparTemporariosOrfaos();
      this.carregar();
    } catch (e) {
      this.trava?.soltar();
      throw e;
    }
    this.cutucarACaixa();
  }

  /**
   * Como o construtor, mas espera até `esperaMs` o dono da trava sair (o `reiniciar-sala.sh` sobe o servidor novo assim que a
   * porta do antigo solta). Só a trava é esperada: qualquer outro erro sobe na hora. Passado o prazo, lança o `ErroDeTrava`.
   */
  static async abrir(opcoes: OpcoesDoArmazem, espera: { readonly esperaMs: number; readonly passoMs?: number } = { esperaMs: 0 }): Promise<ArmazemDeCarteiras> {
    const limite = Date.now() + espera.esperaMs;
    let avisou = false;
    for (;;) {
      try {
        return new ArmazemDeCarteiras(opcoes);
      } catch (e) {
        if (!(e instanceof ErroDeTrava) || Date.now() >= limite) throw e;
        if (!avisou) {
          avisou = true;
          opcoes.log('carteiras-trava-esperando', { pid: e.pid ?? 'desconhecido', esperaS: Math.round(espera.esperaMs / 1000) });
        }
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.min(espera.passoMs ?? 200, limite - Date.now()))));
      }
    }
  }

  /** `true` desde o começo do `fechar()`: nenhuma mudança entra mais. */
  override get encerrado(): boolean {
    return this.fechando !== null;
  }
  // ---------------------------------------------------------------- disco

  /** Espera o que está na memória chegar ao arquivo (o encerramento chama isto). Falha de disco é logada, não lançada. */
  async descarregar(): Promise<void> {
    this.cancelarTemporizador();
    if (this.arquivo === null) return;
    for (let tentativa = 0; tentativa < TENTATIVAS_AO_DESCARREGAR && (this.emCurso || this.gravadaAte < this.versao); tentativa++) {
      await (this.emCurso ?? this.gravar());
    }
    // uma gravação que acabou durante o laço pode ter agendado outra (mudança no meio dela, ou falha). Se tudo já está no disco,
    // ou se o armazém está fechando, ela não tem mais o que fazer; só a repetição depois de falha de um descarregar() solto fica.
    if (this.gravadaAte >= this.versao || this.fechando !== null) this.cancelarTemporizador();
  }

  /**
   * Encerra: desde esta chamada nenhuma mudança entra (o retrato que vai ao disco é o último), espera tudo chegar ao arquivo
   * e solta a trava da pasta. O servidor chama isto antes de soltar a porta, então quem sobe em seguida acha a trava livre.
   * Pode ser chamado mais de uma vez.
   */
  fechar(): Promise<void> {
    // `fechando` já vale `encerrado` aqui: a passada da caixa em voo termina o que está esperando o Banco e não começa outra; o arquivo leva o resto
    this.fechando ??= this.esperarACaixa()
      .then(() => this.descarregar())
      .finally(() => {
        this.cancelarTemporizadorDaCaixa();
        this.travaSolta = true;
        this.trava?.soltar();
      });
    return this.fechando;
  }

  private cancelarTemporizadorDaCaixa(): void {
    if (!this.temporizadorDaCaixa) return;
    clearTimeout(this.temporizadorDaCaixa);
    this.temporizadorDaCaixa = null;
  }

  /** Arma (ou adianta) o temporizador da próxima tentativa da caixa; sem nada na caixa, desarma. */
  protected override aoAgendarCaixa(): void {
    super.aoAgendarCaixa();
    const quando = this.proximaTentativaDaCaixa;
    if (quando === null || this.encerrado) return this.cancelarTemporizadorDaCaixa();
    if (this.temporizadorDaCaixa && this.temporizadorDaCaixaPara <= quando) return;
    this.cancelarTemporizadorDaCaixa();
    this.temporizadorDaCaixaPara = quando;
    this.temporizadorDaCaixa = setTimeout(() => {
      this.temporizadorDaCaixa = null;
      void this.drenarCaixa();
    }, Math.max(0, quando - this.opcoes.relogio()));
    this.temporizadorDaCaixa.unref();
  }

  private cancelarTemporizador(): void {
    if (!this.temporizador) return;
    clearTimeout(this.temporizador);
    this.temporizador = null;
  }

  /** O núcleo mudou algo: o disco acompanha com atraso curto (várias mudanças viram uma escrita). */
  protected persistir(): void {
    this.versao++;
    this.agendar(this.disco.atrasoMs);
  }

  private agendar(ms: number): void {
    if (this.arquivo === null || this.temporizador) return;
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.gravar();
    }, ms);
    this.temporizador.unref();
  }

  /** Uma gravação por vez; o retrato do que vai ao disco é tirado de uma vez, antes de qualquer espera. Depois de a trava sair, recusa (`false`). */
  private gravar(): Promise<boolean> {
    if (this.travaSolta) return Promise.resolve(false);
    if (this.emCurso) return this.emCurso;
    const alvo = this.versao;
    const principal = JSON.stringify(this.paraOArquivo(true));
    const baloes = this.baloesParaGuardar();
    const balao = Object.keys(baloes).length === 0 && !this.baloesNoDisco ? null : JSON.stringify({ versao: VERSAO_DO_ARQUIVO_DO_BALAO, baloes });
    this.emCurso = this.escrever(principal, balao)
      .then(
        () => {
          this.gravadaAte = alvo;
          return true;
        },
        (e: unknown) => {
          this.opcoes.log('carteiras-gravacao-falhou', { erro: e instanceof Error ? e.message : 'desconhecido' });
          return false;
        },
      )
      .then((deuCerto) => {
        this.emCurso = null;
        if (this.gravadaAte < this.versao) this.agendar(deuCerto ? this.disco.atrasoMs : REPETIR_APOS_FALHA_MS);
        return deuCerto;
      });
    return this.emCurso;
  }

  /**
   * O balão (se há o que gravar) e depois as carteiras, cada um por temporário e `rename`. Se o do balão falha, o das carteiras não é
   * tocado: o desconto de uma compra nunca chega ao disco sem o item.
   */
  private async escrever(principal: string, balao: string | null): Promise<void> {
    const pasta = this.disco.pasta!;
    await mkdir(pasta, { recursive: true, mode: 0o700 });
    if (balao !== null) {
      await this.escreverArquivo(NOME_DO_BALAO, balao);
      this.baloesNoDisco = true;
    }
    await this.escreverArquivo(NOME_DO_ARQUIVO, principal);
  }

  /** Arquivo temporário na mesma pasta, escrito até o disco, e `rename` por cima: quem lê vê o antigo inteiro ou o novo inteiro. */
  private async escreverArquivo(nome: string, texto: string): Promise<void> {
    const pasta = this.disco.pasta!;
    const temporario = join(pasta, `${nome}.${process.pid}.tmp`);
    const f = await open(temporario, 'w', 0o600);
    try {
      await f.writeFile(texto);
      await f.sync();
    } finally {
      await f.close();
    }
    try {
      await rename(temporario, join(pasta, nome));
    } catch (e) {
      await rm(temporario, { force: true }).catch(() => undefined);
      throw e;
    }
    await this.sincronizarPasta(pasta);
  }

  /** O `rename` só fica de pé numa queda de energia depois do fsync da pasta. Sistemas que não abrem pasta seguem sem isso (avisa uma vez). */
  private async sincronizarPasta(pasta: string): Promise<void> {
    try {
      const dir = await open(pasta, 'r');
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    } catch (e) {
      if (this.avisouPastaSemFsync) return;
      this.avisouPastaSemFsync = true;
      this.opcoes.log('carteiras-pasta-sem-fsync', { erro: e instanceof Error ? e.message : 'desconhecido' });
    }
  }

  /** Sobra de temporário de quem morreu no meio de uma gravação. Só quem tem a trava chega aqui, então nenhum é de gravação viva. */
  private limparTemporariosOrfaos(): void {
    let nomes: string[];
    try {
      nomes = readdirSync(this.disco.pasta!);
    } catch {
      return;
    }
    const orfaos = nomes.filter((n) => TEMPORARIO.test(n));
    for (const nome of orfaos) {
      try {
        unlinkSync(join(this.disco.pasta!, nome));
      } catch {
        // sumiu enquanto isso
      }
    }
    if (orfaos.length > 0) this.opcoes.log('carteiras-temporarios-removidos', { quantos: orfaos.length });
  }

  /**
   * Lê o arquivo ao subir. Sem arquivo, começa vazio. Arquivo que não se entende (JSON quebrado, versão ou forma errada), ou
   * com carteiras que não valem: o original é GUARDADO (renomeado para `carteiras.corrompido-<instante>.json`, nunca
   * sobrescrito) antes de qualquer outra coisa, o problema é logado e o servidor segue só com o que se salvou. Se nem
   * guardar o original dá, lança: seguir em cima dele destruiria o único exemplar.
   */
  private carregar(): void {
    if (this.arquivo === null) return;
    this.carregarCarteiras();
    this.carregarBaloes();
  }

  private carregarCarteiras(): void {
    let bruto: string;
    try {
      bruto = readFileSync(this.arquivo!, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new Error(`carteiras: não consegui ler ${this.arquivo}: ${e instanceof Error ? e.message : 'erro desconhecido'}`, { cause: e });
    }
    const lidas = this.interpretar(bruto) ?? { carteiras: new Map<string, Guardada>(), descartadas: 1, migradas: 0, saida: undefined, compras: undefined, mortas: undefined, apostas: undefined, excluidas: undefined, marcasPendentes: undefined };
    for (const [id, c] of lidas.carteiras) this.carteiras.set(id, c);
    this.carregarContas(lidas.excluidas, lidas.marcasPendentes);
    this.carregarASaida(lidas.saida);
    this.carregarAsMortas(lidas.mortas);
    this.carregarAsCompras(lidas.compras);
    this.carregarAsApostas(lidas.apostas);
    if (lidas.descartadas === 0) {
      if (lidas.migradas > 0) this.migrou(lidas.migradas);
      return;
    }
    const copia = this.guardarOEstragado();
    this.opcoes.log('carteiras-corrompidas', { copia, mantidas: lidas.carteiras.size, descartadas: lidas.descartadas });
    if (lidas.carteiras.size > 0) {
      this.versao++;
      this.agendar(0);
    }
  }

  /**
   * A caixa de saída do saldo (L57) que o arquivo trazia. Com `SALDO_NO_BANCO` desligado ela não se envia: o log diz quantas operações
   * ficaram para trás (o caminho de volta é o `espelhar-saldos`, não este). Entrada que não presta é contada e ignorada.
   */
  private carregarASaida(saida: unknown): void {
    const { entradas, invalidas } = entradasDoArquivo(saida);
    this.linhasInvalidasNoArmazenamento += invalidas;
    if (invalidas > 0) this.opcoes.log('saida-invalida', { entradas: invalidas });
    if (this.caixa) this.caixa.carregar(entradas);
    else if (entradas.length > 0) this.opcoes.log('saida-ignorada', { operacoes: entradas.length });
  }

  /** As operações mortas (L60b) que o arquivo trazia: ficam fora da fila até `reenviarMortas`. */
  private carregarAsMortas(mortas: unknown): void {
    const { mortas: lidas, invalidas } = mortasDoArquivo(mortas);
    if (invalidas > 0) this.opcoes.log('saida-morta-invalida', { entradas: invalidas });
    if (this.caixa) this.caixa.carregarMortas(lidas, Math.max(0, ...lidas.map((m) => m.ordem)));
    else if (lidas.length > 0) this.opcoes.log('saida-morta-ignorada', { operacoes: lidas.length });
  }

  /** As apostas abertas (L60b) que o arquivo trazia: ao acordar, cada uma ganha um `devolver` na caixa (`cutucarACaixa`). */
  private carregarAsApostas(apostas: unknown): void {
    if (!this.caixa || !Array.isArray(apostas)) return;
    this.carregarApostasAbertas(apostas.filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length <= 120));
  }

  /** As compras pendentes (L59) que o arquivo trazia. Com a chave desligada elas não se conferem: o log diz quantas ficaram para trás (o débito pode ter acontecido no Banco). */
  private carregarAsCompras(compras: unknown): void {
    const { compras: lidas, invalidas } = comprasDoArquivo(compras);
    this.linhasInvalidasNoArmazenamento += invalidas;
    if (invalidas > 0) this.opcoes.log('compras-pendentes-invalidas', { entradas: invalidas });
    if (this.compras) this.compras.carregar(lidas);
    else if (lidas.length > 0) this.opcoes.log('compras-pendentes-ignoradas', { compras: lidas.length });
  }

  /**
   * Lê o balão guardado à parte e o põe nas carteiras que existem (o de quem não está mais no arquivo é ignorado). Arquivo que não se
   * entende é GUARDADO de lado (`carteiras-balao.corrompido-<instante>.json`, nunca sobrescrito) e a sala sobe sem balões, como com o
   * `carteiras.json` estragado; se nem guardar o original dá, lança. Sem arquivo, não há balão.
   */
  private carregarBaloes(): void {
    const arquivo = join(this.disco.pasta!, NOME_DO_BALAO);
    let bruto: string;
    try {
      bruto = readFileSync(arquivo, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error(`carteiras: não consegui ler ${arquivo}: ${e instanceof Error ? e.message : 'erro desconhecido'}`, { cause: e });
      this.migrarBalaoDaLinha();
      return;
    }
    this.baloesNoDisco = true;
    let dado: unknown;
    try {
      dado = JSON.parse(bruto);
    } catch {
      dado = null;
    }
    if (!objetoSimples(dado) || dado.versao !== VERSAO_DO_ARQUIVO_DO_BALAO || !objetoSimples(dado.baloes)) {
      const copia = this.guardarOEstragado(arquivo, 'carteiras-balao.corrompido');
      this.baloesNoDisco = false;
      this.opcoes.log('carteiras-balao-corrompido', { copia });
      return;
    }
    aplicarBaloes(Object.entries(dado.baloes), this.carteiras);
  }

  /** O balão que uma linha ainda trazia (só o L47, que nunca foi publicado) vai ao arquivo dele já: carteira com balão na memória e arquivo que não existe. */
  private migrarBalaoDaLinha(): void {
    if (![...this.carteiras.values()].some((c) => c.balao)) return;
    this.versao++;
    this.agendar(0);
  }

  /**
   * Carteiras do formato de antes ganharam itens com semente sorteada. A semente é sorteada uma vez só, então vai ao disco já (e
   * não "na próxima mudança": uma queda antes disso sortearia outra no boot seguinte). O arquivo de antes fica guardado ao lado
   * (`carteiras.antes-da-migracao-<instante>.json`, só uma vez), porque é o único exemplar do formato antigo; se nem copiar dá,
   * avisa no log e segue (o arquivo novo é válido).
   */
  private migrou(quantas: number): void {
    let copia: string | null = null;
    try {
      const nome = `carteiras.antes-da-migracao-${this.opcoes.relogio()}.json`;
      copyFileSync(this.arquivo!, join(this.disco.pasta!, nome), constants.COPYFILE_EXCL);
      copia = nome;
    } catch (e) {
      this.opcoes.log('carteiras-migracao-sem-copia', { erro: e instanceof Error ? e.message : 'desconhecido' });
    }
    this.opcoes.log('carteiras-migradas', { carteiras: quantas, copia });
    this.versao++;
    this.agendar(0);
  }

  private guardarOEstragado(origem: string = this.arquivo!, prefixo = 'carteiras.corrompido'): string {
    const pasta = this.disco.pasta!;
    const base = `${prefixo}-${this.opcoes.relogio()}`;
    for (let n = 0; n < 1000; n++) {
      const nome = n === 0 ? `${base}.json` : `${base}-${n}.json`;
      const destino = join(pasta, nome);
      if (existsSync(destino)) continue; // só este processo escreve ali, então conferir antes basta para nunca sobrescrever uma cópia
      try {
        renameSync(origem, destino);
        return nome;
      } catch (e) {
        throw new Error(`carteiras: não consegui guardar o arquivo estragado em ${destino}: ${e instanceof Error ? e.message : 'erro desconhecido'}`, { cause: e });
      }
    }
    throw new Error('carteiras: cópias demais do arquivo estragado; confira a pasta de dados');
  }
}
