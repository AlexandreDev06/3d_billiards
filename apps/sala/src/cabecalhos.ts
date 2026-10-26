/** Cabeçalhos de segurança de toda resposta HTTP do servidor (página, arquivos e carteira). */
export const SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
} as const;
