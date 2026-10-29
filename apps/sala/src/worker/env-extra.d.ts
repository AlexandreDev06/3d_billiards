/** Os secrets não entram no `wrangler.jsonc`, então o `wrangler types` não os conhece: este é o que o Worker lê além dos `vars`. */
interface Env {
  /** A senha das rotas `/admin/*` (`npx wrangler secret put SEGREDO_ADMIN`); ausente ou curta, as rotas ficam desligadas. */
  SEGREDO_ADMIN?: string;
}
