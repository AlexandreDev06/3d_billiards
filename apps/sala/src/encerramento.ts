import type { Logger } from './log';

/** SIGHUP é o terminal fechado com o `pnpm online` à mão: sem tratá-lo, até uma janela de gravação das carteiras se perderia. */
export const SINAIS_DE_ENCERRAMENTO = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;

/**
 * Liga os sinais de encerramento: o primeiro que chegar fecha o servidor (carteiras no disco, trava solta) e sai; os seguintes
 * não fazem nada. Sai com 0 se fechou e com 1 se o `fechar()` falhou (as carteiras podem não ter chegado ao disco).
 */
export function ligarEncerramento(
  processo: { on(sinal: NodeJS.Signals, ouvinte: () => void): unknown },
  fechar: () => Promise<void>,
  sair: (codigo: number) => void,
  log: Logger,
): void {
  let encerrando = false;
  for (const sinal of SINAIS_DE_ENCERRAMENTO) {
    processo.on(sinal, () => {
      if (encerrando) return;
      encerrando = true;
      log('servidor-encerrando', { sinal });
      fechar()
        .then(
          () => 0,
          (e: unknown) => {
            log('servidor-erro-ao-fechar', { erro: e instanceof Error ? e.message : 'desconhecido' });
            return 1;
          },
        )
        .then(sair);
    });
  }
}
