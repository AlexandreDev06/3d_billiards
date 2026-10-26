import { describe, expect, it } from 'vitest';
import type { ArmazenamentoMinimo } from '../armazenamento';
import { GerenteDeConfiguracoes } from './gerente';
import { CONFIGURACOES_PADRAO } from './modelo';
import { perfilAtivo } from './perfil-ativo';

function memoria(inicial: Record<string, string> = {}): ArmazenamentoMinimo & { dados: Map<string, string> } {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    getItem: (c) => dados.get(c) ?? null,
    setItem: (c, v) => void dados.set(c, v),
    removeItem: (c) => void dados.delete(c),
  };
}

const J1 = { chave: 'hotseat.j1', rotulo: 'Jogador 1' };
const J2 = { chave: 'hotseat.j2', rotulo: 'Jogador 2' };

describe('GerenteDeConfiguracoes', () => {
  it('sem perfil nada se grava nem muda', () => {
    const arm = memoria();
    const g = new GerenteDeConfiguracoes(arm);
    g.definir('sensibilidadeMira', 2);
    expect(g.valores).toEqual(CONFIGURACOES_PADRAO);
    expect(arm.dados.size).toBe(0);
    expect(g.perfil).toBeNull();
  });

  it('cada jogador tem os seus valores: trocar de perfil carrega os do outro e volta com os do primeiro', () => {
    const g = new GerenteDeConfiguracoes(memoria());
    g.usar(J1);
    g.definir('sensibilidadeMira', 2);
    g.definir('sensibilidadeForca', 1.5);
    g.usar(J2);
    expect(g.valores).toEqual(CONFIGURACOES_PADRAO);
    g.definir('sensibilidadeOrbita', 0.5);
    g.usar(J1);
    expect(g.valores).toMatchObject({ sensibilidadeMira: 2, sensibilidadeForca: 1.5, sensibilidadeOrbita: 1 });
    g.usar(J2);
    expect(g.valores).toMatchObject({ sensibilidadeMira: 1, sensibilidadeOrbita: 0.5 });
  });

  it('fica guardado por perfil e volta na próxima visita', () => {
    const arm = memoria();
    const a = new GerenteDeConfiguracoes(arm);
    a.usar(J1);
    a.definir('curvaForca', 1.3);
    expect(arm.dados.has('sinuca.config.hotseat.j1')).toBe(true);
    expect(arm.dados.has('sinuca.config.hotseat.j2')).toBe(false);
    const b = new GerenteDeConfiguracoes(arm);
    b.usar(J1);
    expect(b.valores.curvaForca).toBe(1.3);
    b.usar(J2);
    expect(b.valores.curvaForca).toBe(1);
  });

  it('avisa quem escuta a cada mudança de valor, de perfil ou de rótulo, e só quando algo mudou', () => {
    const g = new GerenteDeConfiguracoes(memoria());
    let avisos = 0;
    g.aoMudar(() => avisos++);
    g.usar(J1);
    expect(avisos).toBe(1);
    g.usar(J1);
    expect(avisos).toBe(1);
    g.usar({ ...J1, rotulo: 'Ana' });
    expect(avisos).toBe(2);
    g.definir('sensibilidadeMira', 2);
    g.definir('sensibilidadeMira', 2);
    expect(avisos).toBe(3);
    g.usar(J2);
    expect(avisos).toBe(4);
  });

  it('quem para de escutar não é mais avisado', () => {
    const g = new GerenteDeConfiguracoes(memoria());
    let avisos = 0;
    const parar = g.aoMudar(() => avisos++);
    g.usar(J1);
    parar();
    g.definir('sensibilidadeMira', 2);
    expect(avisos).toBe(1);
  });

  it('prende o valor na faixa do controle', () => {
    const g = new GerenteDeConfiguracoes(memoria());
    g.usar(J1);
    g.definir('sensibilidadeMira', 100);
    expect(g.valores.sensibilidadeMira).toBe(4);
    g.definir('sensibilidadeMira', Number.NaN);
    expect(g.valores.sensibilidadeMira).toBe(1);
  });

  it('restaurar volta só o perfil em edição ao padrão e apaga o que estava guardado', () => {
    const arm = memoria();
    const g = new GerenteDeConfiguracoes(arm);
    g.usar(J1);
    g.definir('sensibilidadeMira', 2);
    g.usar(J2);
    g.definir('sensibilidadeMira', 3);
    g.restaurar();
    expect(g.valores).toEqual(CONFIGURACOES_PADRAO);
    expect(g.padrao).toBe(true);
    expect(arm.dados.has('sinuca.config.hotseat.j2')).toBe(false);
    g.usar(J1);
    expect(g.valores.sensibilidadeMira).toBe(2);
  });

  it('restaurar quando já está no padrão não avisa nem mexe no armazenamento', () => {
    const arm = memoria();
    const g = new GerenteDeConfiguracoes(arm);
    g.usar(J1);
    let avisos = 0;
    g.aoMudar(() => avisos++);
    g.restaurar();
    expect(avisos).toBe(0);
    expect(arm.dados.size).toBe(0);
  });

  it('voltar valor a valor ao padrão também apaga o registro', () => {
    const arm = memoria();
    const g = new GerenteDeConfiguracoes(arm);
    g.usar(J1);
    g.definir('sensibilidadeMira', 2);
    g.definir('sensibilidadeMira', 1);
    expect(arm.dados.size).toBe(0);
  });

  it('dado guardado estragado ou fora da faixa é saneado', () => {
    const g = new GerenteDeConfiguracoes(memoria({ 'sinuca.config.hotseat.j1': '{"versao":1,"valores":{"sensibilidadeMira":999,"curvaForca":"x"}}', 'sinuca.config.hotseat.j2': '{quebrado' }));
    g.usar(J1);
    expect(g.valores).toMatchObject({ sensibilidadeMira: 4, curvaForca: 1 });
    g.usar(J2);
    expect(g.valores).toEqual(CONFIGURACOES_PADRAO);
  });

  it('armazenamento bloqueado: os valores seguem valendo na sessão, por perfil', () => {
    const bloqueado: ArmazenamentoMinimo = {
      getItem() {
        throw new Error('x');
      },
      setItem() {
        throw new Error('x');
      },
      removeItem() {
        throw new Error('x');
      },
    };
    const g = new GerenteDeConfiguracoes(bloqueado);
    g.usar(J1);
    g.definir('sensibilidadeMira', 2);
    g.usar(J2);
    g.usar(J1);
    expect(g.valores.sensibilidadeMira).toBe(2);
    const sem = new GerenteDeConfiguracoes(null);
    sem.usar(J1);
    sem.definir('sensibilidadeMira', 2);
    expect(sem.valores.sensibilidadeMira).toBe(2);
  });
});

describe('perfilAtivo', () => {
  it('hot-seat: o perfil de quem tem a vez, um por jogador', () => {
    expect(perfilAtivo({ modo: 'local', jogadorDaVez: { id: 'j1', nome: 'Jogador 1' }, meuNome: null })).toEqual({ chave: 'hotseat.j1', rotulo: 'Jogador 1' });
    expect(perfilAtivo({ modo: 'local', jogadorDaVez: { id: 'j2', nome: 'Jogador 2' }, meuNome: null })).toEqual({ chave: 'hotseat.j2', rotulo: 'Jogador 2' });
  });

  it('online: o perfil do jogador deste aparelho, com o nome', () => {
    expect(perfilAtivo({ modo: 'online', jogadorDaVez: { id: 'lugar-1', nome: 'Beto' }, meuNome: 'Ana' })).toEqual({ chave: 'online', rotulo: 'Você (Ana)' });
    expect(perfilAtivo({ modo: 'online', jogadorDaVez: null, meuNome: null })).toEqual({ chave: 'online', rotulo: 'Você' });
  });

  it('no menu: o perfil online, que é o deste aparelho', () => {
    expect(perfilAtivo({ modo: 'menu', jogadorDaVez: { id: 'j1', nome: 'Jogador 1' }, meuNome: null })).toEqual({ chave: 'online', rotulo: 'Você (neste aparelho)' });
  });

  it('o hot-seat e o online nunca dividem a chave', () => {
    const a = perfilAtivo({ modo: 'local', jogadorDaVez: { id: 'online', nome: 'x' }, meuNome: null }).chave;
    expect(a).not.toBe(perfilAtivo({ modo: 'online', jogadorDaVez: null, meuNome: null }).chave);
  });
});
