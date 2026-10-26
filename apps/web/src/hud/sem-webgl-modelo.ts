/** O texto da tela que aparece no lugar do jogo quando o navegador não consegue abrir o WebGL (puro, sem DOM). */
export const TELA_SEM_WEBGL = {
  titulo: 'Seu navegador não conseguiu abrir o 3D',
  explicacao: 'O jogo precisa do 3D do navegador (WebGL) para desenhar a mesa. Experimente, nesta ordem:',
  dicas: [
    'Ligar "Usar aceleração de hardware" nas configurações do navegador e reiniciá-lo.',
    'Atualizar ou reinstalar o driver de vídeo e reiniciar o PC.',
    'Tentar outro navegador.',
  ],
  botao: 'Tentar de novo',
} as const;

/**
 * Abre o renderizador 3D. Se `criar` lança (o `THREE.WebGLRenderer` lança "Error creating WebGL context" quando o navegador
 * não entrega um contexto), `avisar` recebe o erro e o resultado é `null`: quem chama mostra a tela em vez de deixar a página
 * em branco. Tudo o que `criar` lança conta: o contexto é a única coisa que a criação do renderizador faz.
 */
export function abrirRendererOuAvisar<T>(criar: () => T, avisar: (erro: unknown) => void): T | null {
  try {
    return criar();
  } catch (erro) {
    avisar(erro);
    return null;
  }
}
