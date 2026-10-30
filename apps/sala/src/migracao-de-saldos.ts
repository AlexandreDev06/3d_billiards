/**
 * A migração do saldo da sinuca para o Banco (L60, Parte 3 do plano da conta Beco Games) e o caminho de volta. Duas operações de
 * administração, ambas só com ZERO salas abertas, chamadas por `POST /admin/levar-saldos-ao-banco` e `POST /admin/espelhar-saldos`
 * (worker/admin.ts):
 *
 * - `levar`: manda os espelhos de todas as carteiras ao Banco em lotes de 500 (`importarSaldos`), relê com `saldos` e confere carteira
 *   por carteira. Só é `ok` sem conflito, com as somas iguais e sem espelho que tenha mudado no meio. Funciona com `SALDO_NO_BANCO`
 *   desligada (é o passo antes de ligá-la) e é repetível: o que já está igual conta em `iguais`.
 * - `espelhar`: o caminho de volta. Drena a caixa de saída, lê os saldos do Banco e grava cada espelho com o saldo dele, numa
 *   persistência só. Carteira que o Banco não conhece fica como está (`semConta`).
 *
 * Fala com o Banco pelo service binding (RPC), nunca por rota pública. Nunca loga `id`, código nem saldo de alguém: só contagens e
 * somas (e, na resposta, os 8 primeiros caracteres dos `id` em conflito). Puro: sem disco, sem rede própria, sem Node.
 */
import type { BancoDaMigracao } from './banco-da-sala';
import type { CarteirasBase } from './carteiras-base';
import type { Logger } from './log';

/** O teto de contas por chamada do Banco (`saldos` e `importarSaldos`). */
export const LOTE_DA_MIGRACAO = 500;

export interface RespostaDaMigracao {
  readonly status: number;
  readonly corpo: Readonly<Record<string, unknown>>;
}

export interface DependenciasDaMigracao {
  /** O service binding `CONTA` (existe mesmo com a chave `SALDO_NO_BANCO` desligada); ausente = 503 `banco-indisponivel`. */
  readonly banco: BancoDaMigracao | undefined;
  readonly carteiras: CarteirasBase;
  readonly salasAbertas: () => number;
  readonly log: Logger;
}

const inteiroSeguro = (x: unknown): x is number => typeof x === 'number' && Number.isSafeInteger(x);
const oito = (id: string): string => id.slice(0, 8);

function emLotes<T>(lista: readonly T[]): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += LOTE_DA_MIGRACAO) lotes.push(lista.slice(i, i + LOTE_DA_MIGRACAO));
  return lotes;
}

export class MigracaoDeSaldos {
  private ocupada = false;

  constructor(private readonly deps: DependenciasDaMigracao) {}

  /** `POST /admin/levar-saldos-ao-banco`. */
  levar(): Promise<RespostaDaMigracao> {
    return this.exclusiva('admin-levar-saldos', (banco) => this.levarMesmo(banco));
  }

  /** `POST /admin/espelhar-saldos`. */
  espelhar(): Promise<RespostaDaMigracao> {
    return this.exclusiva('admin-espelhar-saldos', (banco) => this.espelharMesmo(banco));
  }

  /** Uma de cada vez, só sem sala e só com o Banco ligado ao Worker; o resto é de cada operação. */
  private async exclusiva(evento: string, fazer: (banco: BancoDaMigracao) => Promise<RespostaDaMigracao>): Promise<RespostaDaMigracao> {
    const { banco, salasAbertas, log } = this.deps;
    const salas = salasAbertas();
    if (salas > 0) {
      log(evento, { ok: false, motivo: 'salas-abertas', salas });
      return { status: 409, corpo: { ok: false, erro: 'salas-abertas', salas } };
    }
    if (banco === undefined) {
      log(evento, { ok: false, motivo: 'banco-indisponivel' });
      return { status: 503, corpo: { ok: false, erro: 'banco-indisponivel' } };
    }
    if (this.ocupada) {
      log(evento, { ok: false, motivo: 'em-andamento' });
      return { status: 409, corpo: { ok: false, erro: 'em-andamento' } };
    }
    this.ocupada = true;
    try {
      return await fazer(banco);
    } catch (e) {
      // Banco fora do ar (exceção do RPC) ou lote recusado (`RangeError`): nada ficou pela metade que repetir não resolva
      const recusa = e instanceof RangeError;
      log(evento, { ok: false, motivo: recusa ? 'banco-recusou' : 'banco-fora', erro: e instanceof Error ? e.message.slice(0, 100) : 'desconhecido' });
      return { status: 502, corpo: { ok: false, erro: recusa ? 'banco-recusou' : 'banco-fora' } };
    } finally {
      this.ocupada = false;
    }
  }

  private caixaCheia(): boolean {
    const { carteiras } = this.deps;
    // a linha que o armazenamento guarda e não aceitou (nem enviada, nem apagada) também conta: o Banco pode estar sem uma operação dela
    // e a operação morta (`saida_morta`): o Banco não a tem, e a volta escreveria o saldo dele por cima do espelho que a tem
    return carteiras.pendentesNaCaixa > 0 || carteiras.comprasPendentes > 0 || carteiras.linhasInvalidas > 0 || carteiras.mortasNaCaixa > 0;
  }

  private async levarMesmo(banco: BancoDaMigracao): Promise<RespostaDaMigracao> {
    const { carteiras, log } = this.deps;
    if (this.caixaCheia()) {
      log('admin-levar-saldos', { ok: false, motivo: 'caixa-cheia', pendentes: carteiras.pendentesNaCaixa, compras: carteiras.comprasPendentes, invalidas: carteiras.linhasInvalidas });
      return { status: 409, corpo: { ok: false, erro: 'caixa-cheia' } };
    }
    const lista = carteiras.espelhos().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // o saldo pode ser negativo (perder aposta não tem piso, é regra do jogo); só o que não é inteiro seguro não migra
    const invalidas = lista.filter((x) => !inteiroSeguro(x.saldo)).length;
    if (invalidas > 0) {
      log('admin-levar-saldos', { ok: false, motivo: 'saldos-invalidos', invalidas });
      return { status: 422, corpo: { ok: false, erro: 'saldos-invalidos', invalidas } };
    }
    const somaSinuca = lista.reduce((t, x) => t + x.saldo, 0);
    const antes = new Map(lista.map((x) => [x.id, x.saldo] as const));

    let criadas = 0;
    let iguais = 0;
    const emConflito: string[] = [];
    for (const lote of emLotes(lista)) {
      const r = await banco.importarSaldos(lote.map((x) => ({ id: x.id, saldo: x.saldo })));
      criadas += r.criadas;
      iguais += r.iguais;
      emConflito.push(...r.conflitos);
    }

    // a conferência: relê tudo do Banco e compara carteira por carteira
    let somaBanco = 0;
    let diferentes = 0;
    for (const lote of emLotes(lista)) {
      const lidos = await banco.saldos(lote.map((x) => x.id));
      for (const { id, saldo } of lote) {
        const no = lidos[id]?.saldo;
        if (no === undefined) {
          diferentes++;
          continue;
        }
        somaBanco += no;
        if (no !== saldo) diferentes++;
      }
    }
    // um espelho que mudou enquanto a migração corria (uma compra, um presente) deixa o Banco para trás: repetir quando estiver quieto
    const mudaram = carteiras.espelhos().filter((x) => antes.get(x.id) !== x.saldo).length;

    const numeros = { carteiras: lista.length, criadas, iguais, conflitos: emConflito.length, somaSinuca, somaBanco };
    const erro = emConflito.length > 0 ? 'conflitos' : diferentes > 0 || somaBanco !== somaSinuca ? 'somas-diferentes' : mudaram > 0 ? 'mudou-durante' : null;
    const ok = erro === null;
    log('admin-levar-saldos', { ok, ...numeros, diferentes, mudaram, ...(erro !== null ? { motivo: erro } : {}) });
    const corpo = { ok, ...(erro !== null ? { erro } : {}), ...numeros, ...(emConflito.length > 0 ? { idsEmConflito: emConflito.slice(0, 20).map(oito) } : {}) };
    return { status: ok ? 200 : 409, corpo };
  }

  private async espelharMesmo(banco: BancoDaMigracao): Promise<RespostaDaMigracao> {
    const { carteiras, salasAbertas, log } = this.deps;
    await carteiras.drenarCaixa();
    if (this.caixaCheia()) {
      log('admin-espelhar-saldos', { ok: false, motivo: 'caixa-cheia', pendentes: carteiras.pendentesNaCaixa, compras: carteiras.comprasPendentes, invalidas: carteiras.linhasInvalidas });
      return { status: 409, corpo: { ok: false, erro: 'caixa-cheia' } };
    }
    const lista = carteiras.espelhos().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const antes = new Map(lista.map((x) => [x.id, x.saldo] as const));

    const novos = new Map<string, number>();
    let semConta = 0;
    for (const lote of emLotes(lista)) {
      const lidos = await banco.saldos(lote.map((x) => x.id));
      for (const { id } of lote) {
        const no = lidos[id]?.saldo;
        if (no !== undefined && inteiroSeguro(no)) novos.set(id, no);
        else semConta++;
      }
    }

    // daqui até gravar é tudo síncrono: confere que ninguém mexeu na carteira, na caixa nem na porta enquanto o Banco respondia
    const salas = salasAbertas();
    if (salas > 0) {
      log('admin-espelhar-saldos', { ok: false, motivo: 'salas-abertas', salas });
      return { status: 409, corpo: { ok: false, erro: 'salas-abertas', salas } };
    }
    if (this.caixaCheia()) {
      log('admin-espelhar-saldos', { ok: false, motivo: 'caixa-cheia', pendentes: carteiras.pendentesNaCaixa, compras: carteiras.comprasPendentes, invalidas: carteiras.linhasInvalidas });
      return { status: 409, corpo: { ok: false, erro: 'caixa-cheia' } };
    }
    const mudaram = carteiras.espelhos().filter((x) => antes.has(x.id) && antes.get(x.id) !== x.saldo).length;
    if (mudaram > 0) {
      log('admin-espelhar-saldos', { ok: false, motivo: 'mudou-durante', mudaram });
      return { status: 409, corpo: { ok: false, erro: 'mudou-durante' } };
    }

    // as somas contam só as carteiras que o Banco conhece (o saldo pode ser negativo); as `semConta` ficam como estavam e entram à parte
    const somaBanco = [...novos.values()].reduce((t, x) => t + x, 0);
    const somaAntes = lista.filter((x) => novos.has(x.id)).reduce((t, x) => t + x.saldo, 0);
    const somaSemConta = lista.filter((x) => !novos.has(x.id)).reduce((t, x) => t + x.saldo, 0);
    const mudadas = carteiras.trocarEspelhos(novos);
    const somaDepois = carteiras.espelhos().filter((x) => novos.has(x.id)).reduce((t, x) => t + x.saldo, 0);
    const ok = somaDepois === somaBanco;
    const numeros = { carteiras: lista.length, mudadas, semConta, somaAntes, somaDepois, somaBanco, somaSemConta };
    log('admin-espelhar-saldos', { ok, ...numeros, ...(ok ? {} : { motivo: 'somas-diferentes' }) });
    return { status: ok ? 200 : 409, corpo: { ok, ...(ok ? {} : { erro: 'somas-diferentes' }), ...numeros } };
  }
}
