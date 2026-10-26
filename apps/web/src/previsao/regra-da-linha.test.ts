import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import {
  LINHA_COMPLETA,
  LINHA_DESLIGADA,
  LINHA_DO_CAMINHO,
  configDaPrevisao,
  linhaDaSala,
  linhaDaUrl,
  linhaDe,
  linhaEditavel,
  linhaEfetiva,
  linhaParaSala,
} from './regra-da-linha';

const sala = (previsao: boolean, bolaAtingida: boolean) => ({ previsao, bolaAtingida });

describe('linhaDe', () => {
  it('só existem três linhas e são sempre as mesmas (nada de alocar por quadro)', () => {
    expect(linhaDe(false, false)).toBe(LINHA_DESLIGADA);
    expect(linhaDe(true, false)).toBe(LINHA_DO_CAMINHO);
    expect(linhaDe(true, true)).toBe(LINHA_COMPLETA);
  });

  it('a bola atingida sem a previsão não vale: continua desligada', () => {
    expect(linhaDe(false, true)).toBe(LINHA_DESLIGADA);
  });
});

describe('linhaDaSala e linhaParaSala', () => {
  it('lê o que a sala manda; ausente (sala sem o campo, antes do estado) é desligada', () => {
    expect(linhaDaSala(sala(true, true))).toBe(LINHA_COMPLETA);
    expect(linhaDaSala(sala(true, false))).toBe(LINHA_DO_CAMINHO);
    expect(linhaDaSala({ previsao: true })).toBe(LINHA_DO_CAMINHO);
    expect(linhaDaSala(sala(false, true))).toBe(LINHA_DESLIGADA);
    expect(linhaDaSala(undefined)).toBe(LINHA_DESLIGADA);
    expect(linhaDaSala(null)).toBe(LINHA_DESLIGADA);
  });

  it('o que vai para a sala é sempre completo, e a bola atingida só sai ligada com a previsão', () => {
    expect(linhaParaSala(LINHA_DESLIGADA)).toEqual({ previsao: false, bolaAtingida: false });
    expect(linhaParaSala(LINHA_DO_CAMINHO)).toEqual({ previsao: true, bolaAtingida: false });
    expect(linhaParaSala(LINHA_COMPLETA)).toEqual({ previsao: true, bolaAtingida: true });
    expect(linhaParaSala({ previsao: false, bolaAtingida: true })).toEqual({ previsao: false, bolaAtingida: false });
  });
});

describe('linhaEfetiva: quem manda na linha', () => {
  it('online manda só a sala: ligada, ligada com a bola atingida ou desligada', () => {
    expect(linhaEfetiva(true, sala(true, false), LINHA_DESLIGADA)).toBe(LINHA_DO_CAMINHO);
    expect(linhaEfetiva(true, sala(true, true), LINHA_DESLIGADA)).toBe(LINHA_COMPLETA);
    expect(linhaEfetiva(true, sala(false, false), LINHA_DESLIGADA)).toBe(LINHA_DESLIGADA);
  });

  it('online com a sala dizendo desligada, a escolha local (L, ?dev=1, painel) não a liga', () => {
    expect(linhaEfetiva(true, sala(false, false), LINHA_COMPLETA)).toBe(LINHA_DESLIGADA);
    expect(linhaEfetiva(true, sala(false, true), LINHA_COMPLETA)).toBe(LINHA_DESLIGADA);
  });

  it('online com a sala dizendo ligada, a escolha local desligada não a desliga', () => {
    expect(linhaEfetiva(true, sala(true, true), LINHA_DESLIGADA)).toBe(LINHA_COMPLETA);
  });

  it('online antes do primeiro estado-sala (ou sala sem o campo): desligada, mesmo com a escolha local ligada', () => {
    expect(linhaEfetiva(true, undefined, LINHA_COMPLETA)).toBe(LINHA_DESLIGADA);
    expect(linhaEfetiva(true, null, LINHA_DO_CAMINHO)).toBe(LINHA_DESLIGADA);
  });

  it('no hot-seat vale a escolha local e a sala (de uma visita anterior) é ignorada', () => {
    expect(linhaEfetiva(false, undefined, LINHA_COMPLETA)).toBe(LINHA_COMPLETA);
    expect(linhaEfetiva(false, sala(true, true), LINHA_DESLIGADA)).toBe(LINHA_DESLIGADA);
    expect(linhaEfetiva(false, null, LINHA_DO_CAMINHO)).toBe(LINHA_DO_CAMINHO);
  });

  it('a escolha local com a bola atingida mas sem a previsão não liga nada', () => {
    expect(linhaEfetiva(false, null, { previsao: false, bolaAtingida: true })).toBe(LINHA_DESLIGADA);
  });
});

describe('linhaEditavel', () => {
  it('L e o painel só mexem na linha no hot-seat', () => {
    expect(linhaEditavel(false)).toBe(true);
    expect(linhaEditavel(true)).toBe(false);
  });
});

describe('linhaDaUrl', () => {
  it('?linha=1 liga o caminho, ?linha=2 também a bola atingida; o resto não diz nada', () => {
    expect(linhaDaUrl('?local=1&linha=1')).toBe(LINHA_DO_CAMINHO);
    expect(linhaDaUrl('?linha=2')).toBe(LINHA_COMPLETA);
    expect(linhaDaUrl('?linha=0')).toBeNull();
    expect(linhaDaUrl('?linha=sim')).toBeNull();
    expect(linhaDaUrl('')).toBeNull();
  });
});

describe('configDaPrevisao', () => {
  const base = CONFIG_WEB.previsao;
  const { perfis } = CONFIG_WEB.qualidade;

  it('a linha da partida liga e desliga a previsão e a bola atingida', () => {
    expect(configDaPrevisao(base, { linha: LINHA_DESLIGADA, perfil: perfis.alta })).toMatchObject({ ligada: false, bolaAtingida: false });
    expect(configDaPrevisao(base, { linha: LINHA_DO_CAMINHO, perfil: perfis.alta })).toMatchObject({ ligada: true, bolaAtingida: false });
    expect(configDaPrevisao(base, { linha: LINHA_COMPLETA, perfil: perfis.alta })).toMatchObject({ ligada: true, bolaAtingida: true });
  });

  it('o custo vem do nível de qualidade: a baixa espaça mais os cálculos e simula menos', () => {
    const alta = configDaPrevisao(base, { linha: LINHA_COMPLETA, perfil: perfis.alta });
    const baixa = configDaPrevisao(base, { linha: LINHA_COMPLETA, perfil: perfis.baixa });
    expect(baixa.espacoMinimoMs).toBeGreaterThan(alta.espacoMinimoMs);
    expect(baixa.fatorCusto).toBeGreaterThan(alta.fatorCusto);
    expect(baixa.duracaoMaximaS).toBeLessThan(alta.duracaoMaximaS);
    expect(baixa).toMatchObject(perfis.baixa.previsao);
  });

  it('a bola atingida sem a previsão (linha montada à mão) não liga nada', () => {
    const c = configDaPrevisao(base, { linha: { previsao: false, bolaAtingida: true }, perfil: perfis.alta });
    expect(c).toMatchObject({ ligada: false, bolaAtingida: false });
  });

  it('a força da tacada prevista é a do painel quando há, senão a de fábrica', () => {
    expect(configDaPrevisao(base, { linha: LINHA_COMPLETA, perfil: perfis.alta }).velocidadeTaco).toBe(base.velocidadeTaco);
    expect(configDaPrevisao(base, { linha: LINHA_COMPLETA, perfil: perfis.alta, velocidadeTaco: 7 }).velocidadeTaco).toBe(7);
  });

  it('o resto da config (comprimentos, aparência) vem da base, intacto', () => {
    const c = configDaPrevisao(base, { linha: LINHA_COMPLETA, perfil: perfis.media });
    expect(c.comprimentoMaximo).toBe(base.comprimentoMaximo);
    expect(c.linha).toBe(base.linha);
  });

  it('de fábrica a linha começa desligada (é regra da partida, não padrão da visita)', () => {
    expect(base.ligada).toBe(false);
    expect(base.bolaAtingida).toBe(false);
  });

  it('a baixa é a mais barata e a alta a de sempre', () => {
    expect(perfis.alta.previsao).toEqual({ espacoMinimoMs: base.espacoMinimoMs, fatorCusto: base.fatorCusto, duracaoMaximaS: base.duracaoMaximaS });
  });
});
