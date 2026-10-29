import { APARENCIA_PADRAO, type AparenciaDoBalao } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { aparenciaDaEquipe, aparenciaDoLugar, lugarDoJogador, precisaDeChapeus } from './balao-na-mesa';

const ana: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigode_dali', olhos: 'olho_kawaii', corDosOlhos: 'verde' };
const beto: AparenciaDoBalao = { chapeu: null, bigode: null, olhos: 'olho_bravo', corDosOlhos: 'azul' };

const sala = {
  lugares: [
    { lugar: 0, equipe: 0, nome: 'Ana', aparencia: ana },
    { lugar: 1, equipe: 1, nome: 'Beto', aparencia: beto },
    { lugar: 2, equipe: 0, nome: null, aparencia: null },
    { lugar: 3, equipe: 1, nome: 'Duda' },
  ],
};

describe('lugarDoJogador', () => {
  it('o id do jogador online é `lugar-N`; qualquer outro id (o do mesmo PC) não é de lugar nenhum', () => {
    expect(lugarDoJogador('lugar-0')).toBe(0);
    expect(lugarDoJogador('lugar-3')).toBe(3);
    expect(lugarDoJogador('j1')).toBeNull();
    expect(lugarDoJogador('lugar-')).toBeNull();
    expect(lugarDoJogador('lugar-1x')).toBeNull();
  });
});

describe('aparenciaDoLugar', () => {
  it('é a que a sala mandou para o lugar', () => {
    expect(aparenciaDoLugar(sala, 0)).toEqual(ana);
    expect(aparenciaDoLugar(sala, 1)).toEqual(beto);
  });

  it('sem sala, sem lugar, lugar vago ou sala que não manda (o cliente da 9 na sala nova, montagens de teste): o balão padrão', () => {
    expect(aparenciaDoLugar(null, 0)).toBe(APARENCIA_PADRAO);
    expect(aparenciaDoLugar(sala, null)).toBe(APARENCIA_PADRAO);
    expect(aparenciaDoLugar(sala, 2)).toBe(APARENCIA_PADRAO);
    expect(aparenciaDoLugar(sala, 3)).toBe(APARENCIA_PADRAO);
    expect(aparenciaDoLugar(sala, 9)).toBe(APARENCIA_PADRAO);
  });

  it('aparência estragada (id que o catálogo não tem, campo faltando) cai no padrão, sem lançar', () => {
    const ruim = { lugares: [{ lugar: 0, equipe: 0, nome: 'X', aparencia: { chapeu: 'barba', bigode: null, olhos: 'olho_normal', corDosOlhos: 'castanho' } }] };
    expect(aparenciaDoLugar(ruim as never, 0)).toBe(APARENCIA_PADRAO);
    const incompleta = { lugares: [{ lugar: 0, equipe: 0, nome: 'X', aparencia: { chapeu: null } }] };
    expect(aparenciaDoLugar(incompleta as never, 0)).toBe(APARENCIA_PADRAO);
    const proto = { lugares: [{ lugar: 0, equipe: 0, nome: 'X', aparencia: { chapeu: '__proto__', bigode: null, olhos: 'toString', corDosOlhos: 'castanho' } }] };
    expect(aparenciaDoLugar(proto as never, 0)).toBe(APARENCIA_PADRAO);
  });
});

describe('aparenciaDaEquipe (o fim da partida: um balão por equipe)', () => {
  it('é a do primeiro lugar ocupado da equipe', () => {
    expect(aparenciaDaEquipe(sala, 0)).toEqual(ana);
    expect(aparenciaDaEquipe(sala, 1)).toEqual(beto);
  });

  it('equipe sem ninguém, ou sem sala: o padrão', () => {
    expect(aparenciaDaEquipe(sala, 2)).toBe(APARENCIA_PADRAO);
    expect(aparenciaDaEquipe(null, 0)).toBe(APARENCIA_PADRAO);
  });
});

describe('precisaDeChapeus', () => {
  it('só quando alguém na sala usa chapéu: quem não usa nunca baixa o arquivo', () => {
    expect(precisaDeChapeus(sala)).toBe(true);
    expect(precisaDeChapeus({ lugares: [sala.lugares[1]!, sala.lugares[2]!, sala.lugares[3]!] })).toBe(false);
    expect(precisaDeChapeus(null)).toBe(false);
  });
});
