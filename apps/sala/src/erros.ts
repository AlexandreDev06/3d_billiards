import type { CodigoErro } from '@sinuca/protocolo';

/** Texto de cada erro para o jogador (o cliente decide o que mostrar; o código é o que importa). */
export const TEXTO_DO_ERRO: Readonly<Record<CodigoErro, string>> = {
  versao: 'Versão do jogo diferente da do servidor: recarregue a página.',
  'mensagem-invalida': 'Mensagem inválida.',
  'mensagem-grande': 'Mensagem grande demais.',
  'limite-mensagens': 'Calma: mensagens demais em pouco tempo.',
  'sala-inexistente': 'Essa sala não existe (mais).',
  'servidor-cheio': 'O servidor está cheio. Tente de novo daqui a pouco.',
  'sala-cheia': 'A sala está cheia.',
  'nome-invalido': 'Apelido inválido (1 a 24 caracteres).',
  'token-invalido': 'Você foi removido desta sala pelo anfitrião. Abra o link de novo para entrar.',
  'ja-na-sala': 'Você já está numa sala.',
  'fora-da-sala': 'Entre numa sala primeiro.',
  'fase-errada': 'Isso não pode ser feito agora.',
  'lugar-invalido': 'Lugar inválido.',
  'lugar-ocupado': 'Esse lugar já está ocupado.',
  'nao-anfitriao': 'Só o anfitrião pode fazer isso.',
  'lugares-incompletos': 'Faltam jogadores nos lugares (todos precisam estar conectados).',
  'regras-invalidas': 'Regras da casa inválidas.',
  'nao-e-sua-vez': 'Não é a sua vez.',
  'seq-errado': 'Tacada fora de sequência: sincronizando.',
  'gravacao-invalida': 'Gravação da tacada inválida.',
  'partida-diverge': 'A partida que você mandou não bate com as regras: sincronizando.',
  'mesa-incoerente': 'A mesa que você mandou não bate com a partida: sincronizando.',
  'partida-acabou': 'A partida já acabou.',
  'partida-em-andamento': 'A partida ainda está em andamento.',
};

/**
 * Quanto cada recusa gasta da tolerância da conexão (o transporte derruba quem a esgota). Quem insiste no
 * que não pode fazer acaba fora; erro de gravação ou de partida custa mais, porque vem de uma mensagem cara.
 * Fora da tabela = 0: disputas legítimas (lugar ocupado, lugares incompletos, sala cheia, fase).
 */
export const PESO_DA_RECUSA: Readonly<Partial<Record<CodigoErro, number>>> = {
  'mensagem-invalida': 1,
  'mensagem-grande': 5,
  versao: 1,
  'sala-inexistente': 10,
  'nome-invalido': 1,
  'token-invalido': 1,
  'ja-na-sala': 1,
  'fora-da-sala': 1,
  'lugar-invalido': 1,
  'nao-anfitriao': 1,
  'regras-invalidas': 2,
  'nao-e-sua-vez': 1,
  'seq-errado': 1,
  'gravacao-invalida': 5,
  'partida-diverge': 5,
  'mesa-incoerente': 5,
  'partida-acabou': 1,
};
