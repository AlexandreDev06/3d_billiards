import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { configDoAmbiente } from './config';
import { ligarEncerramento } from './encerramento';
import { logNoConsole } from './log';
import { iniciarServidor } from './servidor';
import { ErroDeTrava } from './trava';

const config = configDoAmbiente(process.env);
const log = logNoConsole();
const servidor = await iniciarServidor(config, { log }).catch((e: unknown) => {
  // pasta de dados em uso por outro servidor: o motivo vai inteiro para o terminal, sem pilha, e o processo sai com erro
  if (e instanceof ErroDeTrava) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
});

console.log(`Sala no ar: http://${config.host}:${servidor.porta}  (WebSocket em /sala)`);
console.log(`Carteiras em ${config.pastaDados}`);
if (config.presenteDeTeste) console.log(`Presente de teste LIGADO: ${config.presenteDeTeste.valor} moedas por carteira, uma vez por rótulo "${config.presenteDeTeste.rotulo}".`);
if (existsSync(join(config.pastaWeb, 'index.html'))) console.log(`Servindo o cliente de ${config.pastaWeb}`);
else console.log(`Aviso: sem build do cliente em ${config.pastaWeb}. Rode "pnpm build" (ou use "pnpm online") ou o Vite com proxy para /sala.`);
console.log(`Para publicar: ngrok http --inspect=false ${servidor.porta}`);

ligarEncerramento(process, () => servidor.fechar(), process.exit, log);
