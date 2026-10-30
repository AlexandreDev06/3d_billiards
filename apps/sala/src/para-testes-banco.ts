/**
 * Só para testes (L57): o Banco de verdade (o `Moedas` do apps/conta sobre `node:sqlite` em memória, via `BancoLocal`) atrás de uma
 * casca que falha quando o teste manda, no formato do RPC: exceção = falha passageira; `{ ok: false }` = recusa definitiva.
 */
import type { ErroDeMoeda, ResultadoDeMoeda } from '@sinuca/conta/contrato';
import type { BancoDaSala } from './banco-da-sala';
import { abrirBancoLocal, type BancoLocal } from './banco-local';

type Nome = keyof BancoDaSala;

export interface BancoDeTeste {
  readonly banco: BancoDaSala;
  readonly local: BancoLocal;
  /** Cada chamada que ESCREVE e chegou, na ordem (`creditar`, `reservar`, `debitar`...), inclusive as que falharam. */
  readonly chamadas: Nome[];
  /** Cada leitura (`saldo`, `operacao`, `anularSeNaoFeita`) que chegou, na ordem, inclusive as que falharam: ficam fora de `chamadas` e de `cair`. */
  readonly leituras: Nome[];
  /** Verdadeiro: só as leituras lançam (o Banco responde às escritas). */
  foraLeitura: boolean;
  /** Se definido, roda antes de cada `debitar` de verdade (depois de contado): o teste derruba a resposta, adianta o relógio ou espia o espelho. */
  antesDoDebito: (() => void) | null;
  /** Verdadeiro: toda chamada lança (o Banco fora do ar). */
  fora: boolean;
  /** A `n`-ésima chamada a partir de agora (1 = a próxima) lança; com `depois`, ela antes APLICA no Banco e a resposta se perde. */
  cair(n: number, opcoes?: { depois?: boolean }): void;
  /** A próxima chamada de `nome` é recusada com `erro`, sem tocar no Banco. */
  recusar(nome: Nome, erro: ErroDeMoeda): void;
  saldo(id: string): number | null;
  reservado(id: string): number;
}

export function bancoDeTeste(relogio: () => number = () => 1_800_000_000_000): BancoDeTeste {
  const local = abrirBancoLocal(null, relogio);
  const quedas = new Map<number, { depois: boolean }>();
  const recusas = new Map<Nome, ErroDeMoeda>();
  let contador = 0;
  const b: BancoDeTeste = {
    banco: undefined as unknown as BancoDaSala,
    local,
    chamadas: [],
    leituras: [],
    foraLeitura: false,
    antesDoDebito: null,
    fora: false,
    cair: (n, opcoes = {}) => void quedas.set(contador + n, { depois: opcoes.depois === true }),
    recusar: (nome, erro) => void recusas.set(nome, erro),
    saldo: (id) => local.moedas.saldo(id)?.saldo ?? null,
    reservado: (id) => local.moedas.saldo(id)?.reservado ?? 0,
  };
  const envolver = <A extends unknown[], R>(nome: Nome, real: (...a: A) => Promise<R>) => async (...args: A): Promise<R | ResultadoDeMoeda> => {
    const n = ++contador;
    b.chamadas.push(nome);
    if (b.fora) throw new Error('banco fora do ar');
    const queda = quedas.get(n);
    if (queda) quedas.delete(n);
    if (queda && !queda.depois) throw new Error('banco caiu');
    const erro = recusas.get(nome);
    if (erro !== undefined) {
      recusas.delete(nome);
      return { ok: false, erro };
    }
    const r = await real(...args);
    if (queda) throw new Error('resposta perdida');
    return r;
  };
  const lerDoBanco = <A extends unknown[], R>(nome: Nome, real: (...a: A) => Promise<R>) => async (...args: A): Promise<R> => {
    b.leituras.push(nome);
    if (b.fora || b.foraLeitura) throw new Error('banco fora do ar');
    return real(...args);
  };
  const real = local.banco;
  (b as { banco: BancoDaSala }).banco = {
    garantirConta: envolver('garantirConta', real.garantirConta) as BancoDaSala['garantirConta'],
    creditar: envolver('creditar', real.creditar) as BancoDaSala['creditar'],
    reservar: envolver('reservar', real.reservar) as BancoDaSala['reservar'],
    liquidar: envolver('liquidar', real.liquidar) as BancoDaSala['liquidar'],
    devolver: envolver('devolver', real.devolver) as BancoDaSala['devolver'],
    debitar: envolver('debitar', async (...a: Parameters<BancoDaSala['debitar']>) => {
      b.antesDoDebito?.();
      return real.debitar(...a);
    }) as BancoDaSala['debitar'],
    saldo: lerDoBanco('saldo', real.saldo) as BancoDaSala['saldo'],
    operacao: lerDoBanco('operacao', real.operacao) as BancoDaSala['operacao'],
    // escreve a lápide, mas não move moeda: conta como leitura (`foraLeitura` a derruba, `cair(n)` não a conta)
    anularSeNaoFeita: lerDoBanco('anularSeNaoFeita', real.anularSeNaoFeita) as BancoDaSala['anularSeNaoFeita'],
  };
  return b;
}
