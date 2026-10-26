import type { ConfigAudio } from '../config';
import { BancoDeAmostras, comReserva, formatoPreferido, geradorDeAmostras, navegadorTocaOgg, type FormatoDeSom } from './amostras';
import { GERADORES_SINTETIZADOS } from './geradores';
import type { NomeDoSom } from './mapeamento';
import type { Geradores, Sessao } from './motor-audio';

export interface DependenciasDoPacote {
  /** O `fetch` do navegador; os testes passam um falso. */
  readonly buscar: (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json' | 'arrayBuffer'>>;
  /** Raiz do site (`import.meta.env.BASE_URL`): o manifesto e os sons ficam a partir dela. */
  readonly raiz: string;
  readonly formato: FormatoDeSom;
  readonly sortear: () => number;
  readonly aviso?: (texto: string) => void;
}

export interface SonsDoJogo {
  /** Para o `MotorDeAudio`: amostra quando carregou, sintetizado enquanto não. */
  readonly geradores: Geradores;
  readonly banco: BancoDeAmostras;
  /** Para o `MotorDeAudio.aoAbrir`: o contexto abriu, começa a carregar as amostras em segundo plano. */
  aoAbrir(sessao: Sessao): void;
}

const NOMES: readonly NomeDoSom[] = ['taco-bola', 'bola-bola', 'bola-tabela', 'cacapa', 'vez-outro', 'vez-sua', 'tempo-esgotado', 'moedas'];

/**
 * Os sons do jogo: cada evento é uma amostra CC0 (`public/sons/`) com o sintetizado de reserva. O contexto de áudio só
 * existe depois do primeiro gesto; `aoAbrir` então dispara o carregamento (manifesto e arquivos, todos de uma vez) sem
 * segurar nada, e cada evento troca do sintetizado para a amostra assim que ela está pronta.
 */
export function criarSonsDoJogo(cfg: ConfigAudio, deps: DependenciasDoPacote): SonsDoJogo {
  let contexto: BaseAudioContext | null = null;
  const lerResposta = async (url: string) => {
    const resposta = await deps.buscar(url);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return resposta;
  };
  const banco = new BancoDeAmostras({
    urlDoManifesto: `${deps.raiz.replace(/\/$/, '')}/${cfg.amostras.manifesto}`,
    formato: deps.formato,
    buscarJson: async (url) => (await lerResposta(url)).json(),
    buscarBytes: async (url) => (await lerResposta(url)).arrayBuffer(),
    decodificar: (bytes) => {
      if (!contexto) return Promise.reject(new Error('sem contexto de áudio'));
      return contexto.decodeAudioData(bytes);
    },
    ...(deps.aviso ? { aviso: deps.aviso } : {}),
  });
  const geradores = Object.fromEntries(
    NOMES.map((nome) => [nome, comReserva(geradorDeAmostras(banco, nome, cfg.amostras, deps.sortear), GERADORES_SINTETIZADOS[nome])]),
  ) as Geradores;
  return {
    geradores,
    banco,
    aoAbrir(sessao) {
      contexto = sessao.saida.ctx;
      void banco.carregar();
    },
  };
}

/** As dependências de verdade, no navegador. */
export function dependenciasDoNavegador(): DependenciasDoPacote {
  return {
    buscar: (url) => fetch(url),
    raiz: import.meta.env.BASE_URL,
    formato: formatoPreferido(navegadorTocaOgg()),
    sortear: () => Math.random(),
    aviso: (texto) => console.warn(texto),
  };
}
