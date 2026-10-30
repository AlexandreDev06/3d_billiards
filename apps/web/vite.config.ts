import { defineConfig } from 'vite';

/** A sala local (`pnpm --filter @sinuca/sala dev` ou `pnpm online`); o cliente fala com `/sala` no mesmo endereço da página. */
const SALA = process.env.SALA_URL ?? 'ws://127.0.0.1:8001';
/** A mesma sala pelo HTTP, para a carteira e a loja (`/carteira`) e a conta (`/conta`, L62: a sala repassa ao Banco): o mesmo endereço, com `http` no lugar de `ws`. */
const SALA_HTTP = SALA.replace(/^ws(s?):/, 'http$1:');

const proxy = { '/sala': { target: SALA, ws: true }, '/carteira': { target: SALA_HTTP }, '/conta': { target: SALA_HTTP } };

export default defineConfig({
  server: { proxy },
  preview: { proxy },
});
