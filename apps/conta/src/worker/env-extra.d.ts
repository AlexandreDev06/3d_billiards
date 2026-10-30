/** Os secrets não entram no `wrangler.jsonc`, então o `wrangler types` não os conhece: este é o que o Worker lê além dos `vars`. */
interface Env {
  /** `npx wrangler secret put PEPPER_DA_SENHA`; ausente, toda operação de senha dá `nao-configurado`. */
  PEPPER_DA_SENHA?: string;
  /** `npx wrangler secret put RESEND_API_KEY`; ausente, o esqueci não manda e-mail (só registra `email-nao-configurado`). */
  RESEND_API_KEY?: string;
}
