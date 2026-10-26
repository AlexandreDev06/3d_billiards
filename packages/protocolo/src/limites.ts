/** Limites de forma e tamanho que cliente e sala aplicam às mensagens. */
export const LIMITES_PROTOCOLO = {
  /** Maior quadro WebSocket aceito (uma quebra típica tem ~30 KB; folga para o JSON da partida). */
  bytesPorMensagem: 512 * 1024,
  /**
   * Tetos por tipo de quadro, conferidos ANTES de interpretar (JSON.parse, UTF-8, gravação):
   * mensagem de texto, e cabeçalho JSON do quadro binário (partida + mesa cabem com folga).
   * Do cliente para a sala são bem menores: é a entrada de quem não é de confiança.
   */
  bytesTextoDoCliente: 16 * 1024,
  /** Teto de uma mensagem `diagnostico`, conferido assim que o tipo é lido. */
  bytesDiagnostico: 1024,
  /** Intervalo mínimo entre dois `diagnostico` da mesma conexão. */
  intervaloDiagnosticoMs: 30_000,
  bytesCabecalhoDoCliente: 32 * 1024,
  bytesTextoDaSala: 64 * 1024,
  bytesCabecalhoDaSala: 64 * 1024,
  nome: 24,
  preset: 32,
  chat: 140,
  /** Emojis por participante: rajada e ritmo sustentado (o cliente usa os mesmos números para segurar o envio). */
  emojiRajada: 3,
  emojiPorSegundo: 1,
  token: 64,
  /** Maior número de bolas numa partida (0 a 15). */
  bolas: 16,
  jogadores: 4,
  /** |coordenada| máxima em metros para posição e velocidade de uma bola. */
  coordenada: 100,
  velocidadeTaco: 30,
  /** Bolas dentro da mesa no fim da gravação ficam neste retângulo (m); a mesa oficial cabe com folga. */
  mesaX: 2,
  mesaZ: 1.2,
  mesaAltura: 0.5,
  textoConsequencia: 240,
  chaveRegras: 40,
  qualidade: 24,
  gpu: 120,
  /** Placar da sala: confrontos guardados ao todo (o atual e os anteriores). */
  confrontosNoPlacar: 10,
  /** Placar da sala: teto de vitórias contadas por lado em um confronto (o contador satura aqui). */
  vitoriasNoPlacar: 9999,
  /** Corpo de uma requisição do HTTP da carteira (`/carteira/comprar`, `/carteira/usar`); maior que isto é `requisicao-invalida` (413). */
  bytesCorpoDaCarteira: 1024,
} as const;

/** Sem 0, 1, I, L e O (ambíguos ao ditar o código por WhatsApp ou voz). */
export const ALFABETO_CODIGO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const TAMANHO_CODIGO = 5;

/** Maiúsculas, sem espaços nem hífens ("k7m-2p" → "K7M2P"); não corrige letras fora do alfabeto. */
export function normalizarCodigo(texto: string): string {
  return texto.toUpperCase().replace(/[\s-]/g, '');
}
