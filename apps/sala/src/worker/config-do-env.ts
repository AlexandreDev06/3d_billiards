import { configNucleoDoAmbiente, inteiro, type ConfigDoNucleo } from '../config-nucleo';

/**
 * O que só o Worker tem (L41b): a sala Node não paga por requisição, o Worker paga (100 000 por dia no plano gratuito, e cada
 * mensagem de WebSocket que o objeto recebe é 1/20 de requisição, seja qual for o conteúdo).
 */
export interface ConfigDoWorker extends ConfigDoNucleo {
  /**
   * Mensagens por endereço, somando todas as conexões dele (a de cada conexão, em `mensagens`, continua valendo). Esgotado, a
   * conexão que mandou a mensagem cai com 1008: ignorar não adianta, a mensagem já foi cobrada ao chegar. A rajada cobre dois
   * jogadores mirando ao mesmo tempo sem parar (2 x 10 por segundo) por minutos; o ritmo é a média de duas partidas
   * simultâneas do mesmo endereço, com folga.
   */
  readonly mensagensPorIp: { readonly capacidade: number; readonly porSegundo: number };
  /** De quanto em quanto tempo o alarm se rearma enquanto há sala aberta (alarme.ts). */
  readonly alarmeMs: number;
}

/**
 * Os padrões do Worker onde diferem dos da sala Node. `maxConexoesPorIp` cai de 12 para 6: os 4 lugares de uma sala na mesma casa
 * mais 2 de folga (a reconexão abre a nova antes de a velha cair, e uma aba duplicada); atrás de um CGNAT de operadora o endereço
 * é de muita gente, mas só cabe o que o jogo pede.
 */
export const PADRAO_DO_WORKER = {
  maxConexoesPorIp: 6,
  mensagensPorIp: { capacidade: 1500, porSegundo: 12 },
  alarmeMs: 45_000,
} as const;

/**
 * A configuração do núcleo a partir do `env` do Worker: os `vars` e os `secrets` do Wrangler, que são as mesmas variáveis de ambiente da
 * sala Node (MAX_SALAS, MAX_SALAS_POR_IP, MAX_CONEXOES, MAX_CARTEIRAS, TOLERANCIA_VEZ_S, TETO_DA_VEZ_APOSTADA_S, MISSOES_DIARIAS,
 * ORIGENS, PRESENTE_DE_TESTE e PRESENTE_DE_TESTE_ROTULO) mais as do Worker: MAX_CONEXOES_POR_IP (1 a 1 000), MENSAGENS_POR_IP
 * (a rajada) e MENSAGENS_POR_IP_S (o ritmo por segundo) e ALARME_S (1 a 60; abaixo dos 70 s do despejo mais cedo). Só valem os de
 * texto (as ligações do `env`, como a do Durable Object, não são variáveis). Valor ruim lança com o nome da variável, como na sala Node.
 *
 * Diferença para a sala Node: sem `ORIGENS` a lista fica vazia, e o único Origin aceito é o do próprio endereço do Worker (o cliente é
 * servido por ele); a lista padrão da sala Node tem o ngrok e o localhost do usuário e não faz sentido aqui.
 */
export function configDoWorker(env: object): ConfigDoWorker {
  const texto: Record<string, string | undefined> = {};
  for (const [chave, valor] of Object.entries(env)) if (typeof valor === 'string') texto[chave] = valor;
  const base = configNucleoDoAmbiente(texto);
  const p = PADRAO_DO_WORKER;
  return {
    ...base,
    origensPermitidas: texto.ORIGENS === undefined ? [] : base.origensPermitidas,
    maxConexoesPorIp: inteiro(texto, 'MAX_CONEXOES_POR_IP', p.maxConexoesPorIp, 1, 1000),
    mensagensPorIp: {
      capacidade: inteiro(texto, 'MENSAGENS_POR_IP', p.mensagensPorIp.capacidade, 1, 1_000_000),
      porSegundo: inteiro(texto, 'MENSAGENS_POR_IP_S', p.mensagensPorIp.porSegundo, 1, 100_000),
    },
    alarmeMs: inteiro(texto, 'ALARME_S', p.alarmeMs / 1000, 1, 60) * 1000,
  };
}
