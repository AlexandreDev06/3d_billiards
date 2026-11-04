// Guarda do `wrangler dev` dos testes de integração (L69): o teste sobe `node guarda-do-wrangler.mjs <pid-do-teste> <comando> [args...]`
// num grupo de processos próprio. Se o processo do teste sumir (abortado, derrubado à força, vitest encerrado) ou o grupo receber SIGTERM,
// o guarda derruba o wrangler e o workerd, sem deixar processo órfão. Só dos testes; nada de produção usa isto.
import { spawn } from 'node:child_process';
import process from 'node:process';
import { setInterval, setTimeout } from 'node:timers';

const [paiTexto, comando, ...args] = process.argv.slice(2);
const pai = Number(paiTexto);
const filho = spawn(comando, args, { stdio: 'inherit' });
let encerrando = false;

const derrubarOGrupo = (sinal) => {
  try {
    process.kill(-process.pid, sinal);
  } catch {
    // o grupo já acabou
  }
};

const encerrar = () => {
  if (encerrando) return;
  encerrando = true;
  filho.kill('SIGTERM');
  setTimeout(() => derrubarOGrupo('SIGKILL'), 8_000).unref();
};

process.on('SIGTERM', encerrar);
process.on('SIGINT', encerrar);
process.on('SIGHUP', encerrar);

setInterval(() => {
  try {
    process.kill(pai, 0);
  } catch {
    encerrar();
  }
}, 1_000);

filho.once('exit', (codigo, sinal) => {
  // o workerd e outros filhos que ficaram: SIGTERM no grupo (o guarda já ignora, encerrando = true) e sai com o código do wrangler
  encerrando = true;
  derrubarOGrupo('SIGTERM');
  process.exit(codigo ?? (sinal ? 1 : 0));
});
