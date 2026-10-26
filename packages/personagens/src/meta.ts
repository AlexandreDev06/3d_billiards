/** O que o artista diz de um gesto: quanto dura, onde fica o ápice, o trecho que repete e como se mistura. Tempos em segundos. */
export interface GestoDaMeta {
  readonly duracaoS: number;
  /** O instante do ápice (o som, o contato), se o gesto tem um só. */
  readonly picoS?: number;
  /** Os instantes de cada ápice, quando há mais de um (vazio se não há). */
  readonly picosS: readonly number[];
  /** O trecho que se repete enquanto o jogo pedir: de, até (s). */
  readonly cicloS?: readonly [number, number];
  /** O gesto é uma diferença sobre a pose, somada por cima de qualquer outra coisa (a respiração). */
  readonly aditivo: boolean;
  /** A pose de onde o gesto sai (`pose_repouso`, `pose_punho`), como o artista a escreveu. */
  readonly comecaEm?: string;
  /** O gesto assenta numa pose pendurada em vez de voltar à de onde saiu: o jogo o segura até pedir outra. */
  readonly terminaPendurado: boolean;
}

/** As notas do artista sobre as ações do `.glb` (`mao-meta.json`), por nome de gesto sem o prefixo `gesto_`. */
export interface MetaDoPersonagem {
  readonly gestos: ReadonlyMap<string, GestoDaMeta>;
}

function numero(valor: unknown, onde: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new Error(`meta: ${onde} tem de ser um número`);
  return valor;
}

function quadros(valor: unknown, onde: string): number[] {
  if (!Array.isArray(valor)) throw new Error(`meta: ${onde} tem de ser uma lista de números`);
  return valor.map((v, i) => numero(v, `${onde}[${i}]`));
}

/**
 * Lê o arquivo de notas que o artista exporta junto do `.glb` (`mao-meta.json`): cada ação em `acoes`, e só as de nome `gesto_*`
 * interessam aqui. Os quadros viram segundos pelo `fps` da ação. Lança, dizendo qual campo, se o arquivo estiver errado.
 */
export function lerMeta(json: unknown): MetaDoPersonagem {
  if (typeof json !== 'object' || json === null || !('acoes' in json) || typeof json.acoes !== 'object' || json.acoes === null) {
    throw new Error('meta: o arquivo tem de ser um objeto com `acoes`');
  }
  const gestos = new Map<string, GestoDaMeta>();
  for (const [chave, bruto] of Object.entries(json.acoes)) {
    if (!chave.startsWith('gesto_')) continue;
    if (typeof bruto !== 'object' || bruto === null) throw new Error(`meta: ${chave} tem de ser um objeto`);
    const a = bruto as Record<string, unknown>;
    const fps = numero(a.fps, `${chave}.fps`);
    const n = numero(a.quadros, `${chave}.quadros`);
    const segundos = (q: number): number => q / fps;
    const ciclo = a.ciclo === undefined ? undefined : quadros(a.ciclo, `${chave}.ciclo`);
    if (ciclo !== undefined && ciclo.length !== 2) throw new Error(`meta: ${chave}.ciclo tem de ser [de, até]`);
    const picos = a.picos === undefined ? [] : quadros(a.picos, `${chave}.picos`);
    const termina = typeof a.termina_em === 'string' ? a.termina_em : '';
    gestos.set(chave.slice('gesto_'.length), {
      // 38 quadros a 30/s são 37 intervalos: o clipe vai do quadro 0 ao 37
      duracaoS: segundos(n - 1),
      ...(a.pico === undefined ? {} : { picoS: segundos(numero(a.pico, `${chave}.pico`)) }),
      picosS: picos.map(segundos),
      ...(ciclo === undefined ? {} : { cicloS: [segundos(ciclo[0]!), segundos(ciclo[1]!)] as const }),
      aditivo: a.aditivo === true,
      ...(typeof a.comeca_em === 'string' ? { comecaEm: a.comeca_em } : {}),
      terminaPendurado: termina.startsWith('pendurada'),
    });
  }
  return { gestos };
}
