import { Session } from 'node:inspector/promises';

/** Um nó do perfil de alocação do V8 (`HeapProfiler.stopSampling`). */
interface NoDoPerfil {
  readonly id: number;
  readonly callFrame: { readonly functionName: string; readonly url: string; readonly lineNumber: number };
  readonly children: readonly NoDoPerfil[];
}

interface AmostraDoPerfil {
  readonly size: number;
  readonly nodeId: number;
}

/** Onde a alocação aconteceu (a função no alto da pilha): o lugar, quantas vezes e o tamanho de cada objeto (B). */
export interface LocalDeAlocacao {
  readonly local: string;
  readonly vezes: number;
  readonly tamanhoB: number;
}

/** O que `medirAlocacao` achou. */
export interface AlocacaoMedida {
  /** Objetos (acima de `TAMANHO_DE_UM_NUMERO_B`) alocados durante o corpo, coletados ou não pelo GC (`vezes` somadas). */
  readonly objetos: number;
  /** Os lugares, do que mais alocou para o que menos alocou. */
  readonly onde: readonly LocalDeAlocacao[];
}

/**
 * O maior objeto que não conta. O V8 cria sozinho uma caixa (`HeapNumber`) para um decimal que passa por uma chamada, um retorno ou
 * um campo que não é inteiro (o perfilador a reporta com 48 B), e nenhum código de JS escapa disso: não é "alocação do código".
 * Contam os objetos maiores: `Vector3`, `Quaternion`, `Euler`, `Matrix4`, arrays, `Float64Array`, `Map`, closures. O que fica de
 * fora, e é o limite desta prova: literais de objeto minúsculos (até 48 B).
 */
export const TAMANHO_DE_UM_NUMERO_B = 48;

/** O tempo (ms) que um teste com o perfilador pede ao Vitest: o aquecimento e as dezenas de milhares de quadros passam dos 5 s do padrão quando a máquina está ocupada. */
export const TEMPO_DO_PERFILADOR_MS = 60_000;

function nomeCurto(f: NoDoPerfil['callFrame']): string {
  return `${f.functionName === '' ? '(anônima)' : f.functionName} (${f.url.split('/src/').pop()?.split('/').pop() ?? f.url}:${f.lineNumber + 1})`;
}

/**
 * Roda `corpo` com o perfilador de alocação do V8 ligado (uma amostra a cada ~32 bytes, **inclusive dos objetos que o GC menor já
 * recolheu**) e devolve os objetos que ele alocou. É o que o `heapUsed` não vê: o lixo de vida curta de um `new Vector3()` por
 * quadro some no primeiro GC menor, mas a amostragem o conta. Conta tudo o que se aloca durante `corpo`, inclusive no próprio
 * código do teste: o quadro de teste não deve criar nada (e um método minúsculo que o V8 embute no quadro de teste ainda é visto).
 * Não conta as caixas de número do V8 (`TAMANHO_DE_UM_NUMERO_B`). Aqueça o código antes de medir.
 */
export async function medirAlocacao(corpo: () => void): Promise<AlocacaoMedida> {
  const sessao = new Session();
  sessao.connect();
  try {
    await sessao.post('HeapProfiler.enable');
    await sessao.post('HeapProfiler.startSampling', { samplingInterval: 32, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true } as never);
    corpo();
    const { profile } = (await sessao.post('HeapProfiler.stopSampling')) as unknown as { profile: { head: NoDoPerfil; samples: readonly AmostraDoPerfil[] } };
    const nomeDoNo = new Map<number, string>();
    const visitar = (no: NoDoPerfil): void => {
      nomeDoNo.set(no.id, nomeCurto(no.callFrame));
      for (const filho of no.children) visitar(filho);
    };
    visitar(profile.head);
    const lugares = new Map<string, { vezes: number; tamanhoB: number }>();
    let objetos = 0;
    for (const a of profile.samples) {
      if (a.size <= TAMANHO_DE_UM_NUMERO_B) continue;
      objetos++;
      const chave = `${nomeDoNo.get(a.nodeId) ?? '?'} · ${a.size} B`;
      const antes = lugares.get(chave);
      if (antes === undefined) lugares.set(chave, { vezes: 1, tamanhoB: a.size });
      else antes.vezes++;
    }
    return { objetos, onde: [...lugares].map(([local, v]) => ({ local, ...v })).sort((a, b) => b.vezes - a.vezes) };
  } finally {
    sessao.disconnect();
  }
}

/**
 * Quantos objetos por quadro a prova tolera: as sobras do V8 (feedback, compilação, troca de código) que não se repetem a cada quadro.
 * Medido: de 10 a 135 objetos em 20 mil quadros (até 0,7%) em código que não aloca; uma alocação por quadro dá 20 mil.
 */
const SOBRA_TOLERADA_POR_QUADRO = 0.02;

/**
 * Prova que `passo` (um quadro do laço) não aloca objeto nenhum: roda `aquecer` quadros fora da medida, depois
 * `quadros` quadros sob `medirAlocacao`. Lança, dizendo onde, se passar de uma sobra do V8 (2% dos quadros): uma alocação por
 * quadro dá 100%, e uma condicional que roda a cada 30 quadros ainda passa dos 2%; mais rara que 1 em 50 quadros não se vê.
 */
export async function provarSemAlocar(passo: (quadro: number) => void, { aquecer = 6000, quadros = 20_000 }: { aquecer?: number; quadros?: number } = {}): Promise<void> {
  for (let i = 0; i < aquecer; i++) passo(i);
  const r = await medirAlocacao(() => {
    for (let i = 0; i < quadros; i++) passo(aquecer + i);
  });
  if (r.objetos > quadros * SOBRA_TOLERADA_POR_QUADRO) {
    const onde = r.onde
      .slice(0, 4)
      .map((o) => `${o.local} x${o.vezes}`)
      .join('; ');
    throw new Error(`o código alocou ${r.objetos} objetos em ${quadros} quadros (mais de 2% dos quadros): ${onde}`);
  }
}
