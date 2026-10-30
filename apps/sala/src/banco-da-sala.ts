/**
 * O Banco da Beco Games como a sala o enxerga (L57, L59): o subconjunto de `ApiDoBanco` que ela usa. No Worker é o service binding `CONTA`
 * (RPC para o entrypoint `Banco`); na sala Node, o `BancoLocal` (banco-local.ts), o mesmo núcleo `Moedas` sobre `node:sqlite`. Só
 * tipos de `@sinuca/conta/contrato`: a sala nunca importa o código do Banco (exceto o `BancoLocal`, só Node).
 */
import type { ApiDoBanco } from '@sinuca/conta/contrato';

/** O que a caixa de saída usa (as escritas que ela repete e o `saldo`, a sonda de quando uma operação lança); a compra e a leitura do espelho usam o resto de `BancoDaSala`. */
export type BancoDaCaixa = Pick<ApiDoBanco, 'garantirConta' | 'creditar' | 'reservar' | 'liquidar' | 'devolver' | 'saldo'>;

export type BancoDaSala = Pick<ApiDoBanco, 'garantirConta' | 'creditar' | 'reservar' | 'liquidar' | 'devolver' | 'debitar' | 'saldo' | 'operacao' | 'anularSeNaoFeita'>;

/** O que a migração do saldo (L60) usa do Banco: ler os saldos e criar as contas que faltam. Existe mesmo com `SALDO_NO_BANCO` desligada. */
export type BancoDaMigracao = Pick<ApiDoBanco, 'saldos' | 'importarSaldos'>;
