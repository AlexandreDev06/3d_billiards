/** O painel de física e os atalhos de dev existem no Vite dev ou, em produção, com `?dev=1` na URL. */
export function devAtivo(emDesenvolvimento: boolean, busca: string): boolean {
  return emDesenvolvimento || new URLSearchParams(busca).get('dev') === '1';
}
