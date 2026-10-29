import { describe, expect, it } from 'vitest';
import type { EstadoCarteira } from '@sinuca/protocolo';
import { APELIDO_VAZIO, RECURSOS_DO_MENU, arquivoDoLetreiro, atalhosDaTelaInicial, barraDoMenu, escalaDoMenu, quadroComecaAberto, transicaoDoMenu, type TelaDoMenu } from './menu-modelo';

const carteira = (parcial: Partial<EstadoCarteira> = {}): EstadoCarteira => ({ saldo: 100, skins: ['classico'], skin: 'classico', ...parcial });

describe('atalhosDaTelaInicial', () => {
  it('com o interruptor de fábrica os botões da fileira são: treino, loja, perfil (L43), configurações e créditos', () => {
    expect(RECURSOS_DO_MENU).toEqual({ treino: true, perfil: true });
    expect(atalhosDaTelaInicial(RECURSOS_DO_MENU).map((a) => a.id)).toEqual(['treino', 'loja', 'perfil', 'configuracoes', 'creditos']);
  });

  it('o treino (L42) e o perfil (L43) entram nos lugares reservados quando o interruptor liga', () => {
    expect(atalhosDaTelaInicial({ treino: true, perfil: true }).map((a) => a.id)).toEqual(['treino', 'loja', 'perfil', 'configuracoes', 'creditos']);
    expect(atalhosDaTelaInicial({ treino: true, perfil: false }).map((a) => a.id)).toEqual(['treino', 'loja', 'configuracoes', 'creditos']);
    expect(atalhosDaTelaInicial({ treino: false, perfil: true }).map((a) => a.id)).toEqual(['loja', 'perfil', 'configuracoes', 'creditos']);
  });

  it('o rótulo da loja é o de sempre (os testes de navegador clicam por ele)', () => {
    expect(atalhosDaTelaInicial(RECURSOS_DO_MENU).find((a) => a.id === 'loja')?.rotulo).toBe('Loja');
  });
});

describe('quadroComecaAberto', () => {
  it('abre onde cabe ao lado dos botões e recolhe em tela pequena', () => {
    expect(quadroComecaAberto(1280, 720)).toBe(true);
    expect(quadroComecaAberto(1920, 1080)).toBe(true);
    expect(quadroComecaAberto(900, 720)).toBe(false);
    expect(quadroComecaAberto(1280, 600)).toBe(false);
  });
});

describe('escalaDoMenu', () => {
  it('na tela de projeto e nas menores o menu fica como foi desenhado', () => {
    expect(escalaDoMenu(1280, 720)).toBe(1);
    expect(escalaDoMenu(1024, 600)).toBe(1);
    expect(escalaDoMenu(0, 0)).toBe(1);
    expect(escalaDoMenu(Number.NaN, 720)).toBe(1);
  });

  it('cresce na mesma proporção, limitado pelo lado que acaba primeiro', () => {
    expect(escalaDoMenu(1920, 1080)).toBe(1.5);
    expect(escalaDoMenu(1366, 768)).toBe(1.07);
    expect(escalaDoMenu(2560, 720)).toBe(1);
    expect(escalaDoMenu(1280, 1440)).toBe(1);
  });

  it('não passa de 1,6x em tela enorme', () => {
    expect(escalaDoMenu(3840, 2160)).toBe(1.6);
  });
});

describe('barraDoMenu', () => {
  it('com carteira: o apelido, o saldo e o taco em uso com a semente dele', () => {
    const b = barraDoMenu(carteira({ saldo: 130, skin: 'ebano', skins: ['classico', 'ebano'], itens: [{ skin: 'classico', semente: 3, bolas: 0 }, { skin: 'ebano', semente: 186, bolas: 12 }] }), '  Ana ');
    expect(b).toMatchObject({ apelido: 'Ana', temApelido: true, textoSaldo: '130 moedas', saldoNegativo: false, semCarteira: false });
    expect(b.taco).toMatchObject({ skin: 'ebano', nome: 'Ébano', semente: 186 });
    expect(b.chaveDoTaco).toBe('ebano|186');
  });

  it('sem carteira: o saldo é um traço e o taco é o clássico de fábrica', () => {
    const b = barraDoMenu(null, 'Beto');
    expect(b).toMatchObject({ textoSaldo: '—', semCarteira: true, saldoNegativo: false });
    expect(b.taco).toMatchObject({ skin: 'classico', nome: 'Clássico', semente: null });
    expect(b.chaveDoTaco).toBe('classico|');
  });

  it('saldo negativo e o singular de uma moeda', () => {
    expect(barraDoMenu(carteira({ saldo: -30 }), 'A')).toMatchObject({ textoSaldo: '−30 moedas', saldoNegativo: true });
    expect(barraDoMenu(carteira({ saldo: 1 }), 'A').textoSaldo).toBe('1 moeda');
    expect(barraDoMenu(carteira({ saldo: 0 }), 'A')).toMatchObject({ textoSaldo: '0 moedas', saldoNegativo: false });
  });

  it('apelido vazio ou só de espaços mostra o texto de reserva, sem fingir que é um nome', () => {
    expect(barraDoMenu(null, '   ')).toMatchObject({ apelido: APELIDO_VAZIO, temApelido: false });
    expect(barraDoMenu(null, '')).toMatchObject({ apelido: APELIDO_VAZIO, temApelido: false });
  });

  it('a chave do taco muda com a skin e com a semente: é ela que manda refazer a miniatura', () => {
    const a = barraDoMenu(carteira({ skin: 'ebano', skins: ['classico', 'ebano'], itens: [{ skin: 'ebano', semente: 1, bolas: 0 }] }), 'x');
    const b = barraDoMenu(carteira({ skin: 'ebano', skins: ['classico', 'ebano'], itens: [{ skin: 'ebano', semente: 2, bolas: 0 }] }), 'x');
    const c = barraDoMenu(carteira({ saldo: 5, skin: 'ebano', skins: ['classico', 'ebano'], itens: [{ skin: 'ebano', semente: 1, bolas: 9 }] }), 'y');
    expect(a.chaveDoTaco).not.toBe(b.chaveDoTaco);
    expect(a.chaveDoTaco).toBe(c.chaveDoTaco);
  });

  it('a cor da faixa vem do catálogo', () => {
    expect(barraDoMenu(null, 'x').taco.corDaFaixa).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('transicaoDoMenu', () => {
  it('a mesma tela não anima de novo: a sala de espera se redesenha a cada estado-sala', () => {
    for (const tela of ['inicio', 'espera', 'criar', 'conectando'] as const) expect(transicaoDoMenu(tela, tela)).toBeNull();
  });

  it('do menu fechado, abre avançando', () => {
    expect(transicaoDoMenu(null, 'inicio')).toBe('avanca');
    expect(transicaoDoMenu(null, 'espera')).toBe('avanca');
  });

  it('as telas que saem da inicial avançam e o caminho de volta recua', () => {
    for (const tela of ['entrar', 'criar', 'local'] as const) {
      expect(transicaoDoMenu('inicio', tela)).toBe('avanca');
      expect(transicaoDoMenu(tela, 'inicio')).toBe('volta');
    }
    expect(transicaoDoMenu('criar', 'conectando')).toBe('avanca');
    expect(transicaoDoMenu('conectando', 'espera')).toBe('avanca');
    expect(transicaoDoMenu('espera', 'inicio')).toBe('volta');
  });

  it('entre telas do mesmo nível a nova avança (entrar → sala que recusou volta ao formulário)', () => {
    const lados: TelaDoMenu[] = ['entrar', 'criar', 'local'];
    for (const de of lados) for (const para of lados) if (de !== para) expect(transicaoDoMenu(de, para)).toBe('avanca');
    expect(transicaoDoMenu('conectando', 'entrar')).toBe('volta');
  });
});

describe('arquivoDoLetreiro (L44)', () => {
  it('a tela inicial leva as duas linhas, as outras só "SINUCA", aceso ou apagado, a partir da raiz do site', () => {
    expect(arquivoDoLetreiro('/', true, 'acesa')).toBe('/marca/letreiro-acesa.png');
    expect(arquivoDoLetreiro('/', true, 'apagada')).toBe('/marca/letreiro-apagada.png');
    expect(arquivoDoLetreiro('/', false, 'acesa')).toBe('/marca/sinuca-acesa.png');
    expect(arquivoDoLetreiro('/', false, 'apagada')).toBe('/marca/sinuca-apagada.png');
  });

  it('a raiz com ou sem barra no fim dá o mesmo caminho', () => {
    expect(arquivoDoLetreiro('/jogo', true, 'acesa')).toBe('/jogo/marca/letreiro-acesa.png');
    expect(arquivoDoLetreiro('/jogo/', true, 'acesa')).toBe('/jogo/marca/letreiro-acesa.png');
    expect(arquivoDoLetreiro('./', false, 'acesa')).toBe('./marca/sinuca-acesa.png');
  });
});
