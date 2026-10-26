import type { Gravacao } from '@sinuca/fisica';
import { LIMITES_PROTOCOLO } from './limites';

/**
 * Sanidade de uma gravação recebida (sem re-simular): devolve o motivo da
 * incoerência, ou `null` se estiver tudo certo. Confere o contrato da física:
 * `taco-bola` em t = 0 abre os eventos, `parou` (um só, em t = `duracao`) fecha;
 * eventos em ordem de tempo e só de bolas da gravação; bola com evento de
 * caçapa ou de saída termina fora da mesa, e quem sai da mesa teve o evento;
 * bola ainda na mesa termina dentro dela.
 */
export function coerenciaDaGravacao(g: Gravacao): string | null {
  const n = g.ids.length;
  const eventos = g.eventos;
  const primeiro = eventos[0];
  if (primeiro?.tipo !== 'taco-bola' || primeiro.t !== 0) return 'o primeiro evento precisa ser taco-bola em t = 0';

  const ultimo = eventos[eventos.length - 1];
  if (ultimo?.tipo !== 'parou' || ultimo.t !== g.duracao) return 'o último evento precisa ser parou, em t = duração';
  if (eventos.filter((e) => e.tipo === 'parou').length !== 1) return 'parou aparece mais de uma vez';

  const saiu = new Set<number>();
  let anterior = 0;
  for (const e of eventos) {
    if (e.t < anterior) return 'eventos fora de ordem de tempo';
    anterior = e.t;
    const bolas = e.tipo === 'bola-bola' ? [e.a, e.b] : e.tipo === 'parou' ? [] : [e.bola];
    for (const b of bolas) if (!g.ids.includes(b)) return `evento de bola ${b}, que não está na gravação`;
    if (e.tipo === 'cacapa' || e.tipo === 'fora-da-mesa') saiu.add(e.bola);
  }

  const ultimoQuadro = (g.quadros - 1) * n;
  for (let i = 0; i < n; i++) {
    const id = g.ids[i]!;
    const naMesa = g.naMesa[ultimoQuadro + i] === 1;
    if (saiu.has(id) && naMesa) return `a bola ${id} caiu na caçapa ou saiu da mesa mas termina na mesa`;
    if (!saiu.has(id) && !naMesa && g.naMesa[i] === 1) return `a bola ${id} saiu da mesa sem evento de caçapa ou de saída`;
    if (naMesa) {
      const k = (ultimoQuadro + i) * 3;
      const x = g.posicoes[k]!;
      const y = g.posicoes[k + 1]!;
      const z = g.posicoes[k + 2]!;
      if (Math.abs(x) > LIMITES_PROTOCOLO.mesaX || Math.abs(z) > LIMITES_PROTOCOLO.mesaZ || y < -0.05 || y > LIMITES_PROTOCOLO.mesaAltura) {
        return `a bola ${id} termina fora dos limites da mesa`;
      }
    }
  }
  return null;
}
