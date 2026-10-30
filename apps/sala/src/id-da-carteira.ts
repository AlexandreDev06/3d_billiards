/** O `id` de uma carteira: o SHA-256, em hexadecimal, do código secreto dela. É o mesmo `id` do convidado no Banco da Beco Games. */
import { createHash } from 'node:crypto';

export const idDoCodigo = (codigo: string): string => createHash('sha256').update(codigo).digest('hex');
