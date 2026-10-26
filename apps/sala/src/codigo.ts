import { randomInt } from 'node:crypto';
import { ALFABETO_CODIGO, TAMANHO_CODIGO } from '@sinuca/protocolo';

/** Código de sala curto, sem caracteres ambíguos. `sortear(max)` devolve um inteiro em [0, max). */
export function gerarCodigo(sortear: (max: number) => number = (max) => randomInt(max)): string {
  let codigo = '';
  for (let i = 0; i < TAMANHO_CODIGO; i++) codigo += ALFABETO_CODIGO[sortear(ALFABETO_CODIGO.length)]!;
  return codigo;
}
