/**
 * A CHAVE dos baldes por IP, não o endereço (nunca vai a log): `::ffff:a.b.c.d` é o IPv4 `a.b.c.d`, e um IPv6 conta pelo prefixo /64,
 * porque quem recebe uma rede /64 tem 2^64 endereços e, por IP exato, cada um teria o seu balde. Baseado em apps/sala/src/ip.ts;
 * aqui o IP já vem do portal (`CF-Connecting-IP`), então não há `X-Forwarded-For` para ler.
 */
type Octetos = readonly [number, number, number, number];

function lerIPv4(texto: string): Octetos | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(texto);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) ? (o as unknown as Octetos) : null;
}

/** Os 8 grupos de 16 bits de um IPv6 (com `::` e IPv4 no fim, se houver), ou `null` se não é um endereço. */
function lerIPv6(texto: string): number[] | null {
  const partes = texto.toLowerCase().split('::');
  if (partes.length > 2) return null;
  const lado = (s: string, ultimo: boolean): number[] | null => {
    if (s === '') return [];
    const saida: number[] = [];
    const pedacos = s.split(':');
    for (const [i, p] of pedacos.entries()) {
      if (ultimo && i === pedacos.length - 1 && p.includes('.')) {
        const v4 = lerIPv4(p);
        if (!v4) return null;
        saida.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(p)) {
        saida.push(parseInt(p, 16));
      } else {
        return null;
      }
    }
    return saida;
  };
  const completo = partes.length === 1;
  const esquerda = lado(partes[0]!, completo);
  const direita = completo ? [] : lado(partes[1]!, true);
  if (!esquerda || !direita) return null;
  if (completo) return esquerda.length === 8 ? esquerda : null;
  const faltam = 8 - esquerda.length - direita.length;
  return faltam >= 1 ? [...esquerda, ...new Array<number>(faltam).fill(0), ...direita] : null;
}

/** A chave de balde do IP; texto que não é IP vira `desconhecido` (todos eles dividem um balde, o que só aperta o limite). */
export function chaveDoIp(texto: string): string {
  const v4 = lerIPv4(texto);
  if (v4) return v4.join('.');
  const g = lerIPv6(texto);
  if (!g) return 'desconhecido';
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return [g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255].join('.');
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}
