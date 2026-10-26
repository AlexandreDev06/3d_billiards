import { describe, expect, it, vi } from 'vitest';
import { TELA_SEM_WEBGL, abrirRendererOuAvisar } from './sem-webgl-modelo';

describe('tela sem WebGL: o texto', () => {
  it('diz o que o usuário pediu: título, as três dicas na ordem e o botão', () => {
    expect(TELA_SEM_WEBGL.titulo).toBe('Seu navegador não conseguiu abrir o 3D');
    expect(TELA_SEM_WEBGL.dicas).toEqual([
      'Ligar "Usar aceleração de hardware" nas configurações do navegador e reiniciá-lo.',
      'Atualizar ou reinstalar o driver de vídeo e reiniciar o PC.',
      'Tentar outro navegador.',
    ]);
    expect(TELA_SEM_WEBGL.botao).toBe('Tentar de novo');
  });
});

describe('abrirRendererOuAvisar', () => {
  it('devolve o renderizador e não avisa quando abre', () => {
    const renderer = { nome: 'ok' };
    const avisar = vi.fn();
    expect(abrirRendererOuAvisar(() => renderer, avisar)).toBe(renderer);
    expect(avisar).not.toHaveBeenCalled();
  });

  it('com o renderizador falhando de propósito ("Error creating WebGL context") devolve null e entrega o erro', () => {
    const erro = new Error('Error creating WebGL context.');
    const avisar = vi.fn();
    expect(
      abrirRendererOuAvisar(() => {
        throw erro;
      }, avisar),
    ).toBeNull();
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar).toHaveBeenCalledWith(erro);
  });

  it('qualquer erro da criação conta (não só os que falam de WebGL)', () => {
    const avisar = vi.fn();
    expect(abrirRendererOuAvisar(() => { throw 'sem contexto'; }, avisar)).toBeNull();
    expect(avisar).toHaveBeenCalledWith('sem contexto');
  });
});
