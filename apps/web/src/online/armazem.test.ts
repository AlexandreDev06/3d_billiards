import { describe, expect, it } from 'vitest';
import { ArmazemDeSessao, JANELA_DA_ABA_MS, idDaAba } from './armazem';
import { ArmazenamentoFalso } from './para-testes';

function montar() {
  const local = new ArmazenamentoFalso();
  let agora = 1_000;
  const aba = (id: string) => new ArmazemDeSessao(local, id, () => agora);
  return { local, aba, passar: (ms: number) => void (agora += ms) };
}

describe('ArmazemDeSessao', () => {
  it('a mesma aba reencontra o token depois de recarregar', () => {
    const t = montar();
    t.aba('a').gravar('K7M2P', { token: 'tok', nome: 'Ana' });
    expect(t.aba('a').ler('K7M2P')).toEqual({ token: 'tok', nome: 'Ana' });
  });

  it('outra aba não usa o token enquanto a dona dá batidas', () => {
    const t = montar();
    const a = t.aba('a');
    a.gravar('K7M2P', { token: 'tok', nome: 'Ana' });
    t.passar(JANELA_DA_ABA_MS - 1);
    expect(t.aba('b').ler('K7M2P')).toBeNull();
    a.batida('K7M2P');
    t.passar(JANELA_DA_ABA_MS - 1);
    expect(t.aba('b').ler('K7M2P')).toBeNull();
  });

  it('passada a janela sem batida, a aba dona é dada como fechada e outra pode voltar com o token', () => {
    const t = montar();
    t.aba('a').gravar('K7M2P', { token: 'tok', nome: 'Ana' });
    t.passar(JANELA_DA_ABA_MS);
    expect(t.aba('b').ler('K7M2P')).toEqual({ token: 'tok', nome: 'Ana' });
  });

  it('a batida de quem não é dono não renova o token alheio', () => {
    const t = montar();
    t.aba('a').gravar('K7M2P', { token: 'tok', nome: 'Ana' });
    t.passar(JANELA_DA_ABA_MS - 10);
    t.aba('b').batida('K7M2P');
    expect(JSON.parse(t.local.getItem('sinuca.sala.K7M2P')!).aba).toBe('a');
    t.passar(20);
    expect(t.aba('b').ler('K7M2P')).toEqual({ token: 'tok', nome: 'Ana' });
  });

  it('cada sala tem o seu token', () => {
    const t = montar();
    const a = t.aba('a');
    a.gravar('AAAAA', { token: '1', nome: 'Ana' });
    a.gravar('BBBBB', { token: '2', nome: 'Ana' });
    expect(a.ler('AAAAA')?.token).toBe('1');
    expect(a.ler('BBBBB')?.token).toBe('2');
  });

  it('sair apaga o token, mas não o de uma aba viva', () => {
    const t = montar();
    const a = t.aba('a');
    a.gravar('K7M2P', { token: 'tok', nome: 'Ana' });
    t.aba('b').apagar('K7M2P');
    expect(a.ler('K7M2P')).not.toBeNull();
    a.apagar('K7M2P');
    expect(a.ler('K7M2P')).toBeNull();
  });

  it('lixo no armazenamento vira "sem token"; sem armazenamento nada quebra', () => {
    const t = montar();
    t.local.setItem('sinuca.sala.K7M2P', '{lixo');
    expect(t.aba('a').ler('K7M2P')).toBeNull();
    t.local.setItem('sinuca.sala.K7M2P', JSON.stringify({ token: 1 }));
    expect(t.aba('a').ler('K7M2P')).toBeNull();
    const sem = new ArmazemDeSessao(null, 'a');
    expect(() => sem.gravar('K7M2P', { token: 'x', nome: 'Ana' })).not.toThrow();
    expect(sem.ler('K7M2P')).toBeNull();
    expect(sem.apelido()).toBe('');
  });

  it('com a conta ativa não sobrescreve o apelido do convidado (L62)', () => {
    const t = montar();
    t.aba('a').lembrarApelido('Ana');
    const conta = t.aba('a');
    conta.definirContaAtiva(true);
    conta.lembrarApelido('NomeDaConta');
    expect(t.aba('b').apelido()).toBe('Ana');
    conta.definirContaAtiva(false);
    conta.lembrarApelido('Bia');
    expect(t.aba('b').apelido()).toBe('Bia');
  });

  it('lembra o apelido', () => {
    const t = montar();
    t.aba('a').lembrarApelido('Ana');
    expect(t.aba('b').apelido()).toBe('Ana');
  });

  it('idDaAba mantém o id ao recarregar (sessionStorage) e dá um novo sem ele', () => {
    const sessao = new ArmazenamentoFalso();
    const primeiro = idDaAba(sessao);
    expect(primeiro).toMatch(/^[0-9a-f]{16}$/);
    expect(idDaAba(sessao)).toBe(primeiro);
    expect(idDaAba(null)).not.toBe(idDaAba(null));
  });
});
