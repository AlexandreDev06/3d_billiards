import { describe, expect, it } from 'vitest';
import { aplicarTacada, novaPartida } from './partida';
import {
  ANA,
  BETO,
  CASTIGO_1,
  JOGADORES,
  SEM_FINAL,
  config,
  congelar,
  eventos,
  numeros,
  partidaCom,
  rngDeTeste,
  type Mesa,
  type Tacada,
} from './para-testes';
import { OPCOES_REGRAS, PRESET_BOTECO } from './presets';
import type { ConfigRegras, Consequencias, EstadoPartida } from './tipos';

describe('novaPartida', () => {
  it('Boteco: as 13 de 2 a 14, a 8 no centro do triângulo (índice 4), vez de quem sai (jogador 0)', () => {
    const { partida, arrumacao } = novaPartida(config(), JOGADORES, rngDeTeste(1));
    expect(partida).toEqual<EstadoPartida>({
      config: config(),
      jogadores: JOGADORES,
      vez: 0,
      grupos: [null, null],
      fase: 'saida',
      naMesa: numeros(2, 14),
      encacapadas: [],
      retiradas: [],
      vencedor: null,
    });
    expect(arrumacao).toHaveLength(13);
    expect(arrumacao[4]).toBe(8);
    expect([...arrumacao].sort((a, b) => a - b)).toEqual(numeros(2, 14));
  });

  it('1-15 (opção): as 15 na partida, o castigo fora do triângulo', () => {
    const { partida, arrumacao } = novaPartida(config(CASTIGO_1), JOGADORES, rngDeTeste(1));
    expect(partida.naMesa).toEqual(numeros(1, 15));
    expect([...arrumacao].sort((a, b) => a - b)).toEqual(numeros(2, 15));
  });

  it('1-15 com o castigo no centro do triângulo: as 15 no triângulo, a 1 no meio da 3ª fileira', () => {
    const { arrumacao } = novaPartida(config({ ...CASTIGO_1, castigoInicio: 'centro-triangulo' }), JOGADORES, rngDeTeste(1));
    expect(arrumacao[4]).toBe(1);
    expect([...arrumacao].sort((a, b) => a - b)).toEqual(numeros(1, 15));
  });

  it('2-15 sem bola final (opção): as 14 no triângulo, sem castigo', () => {
    const { partida, arrumacao } = novaPartida(config(SEM_FINAL), JOGADORES, rngDeTeste(1));
    expect(partida.naMesa).toEqual(numeros(2, 15));
    expect([...arrumacao].sort((a, b) => a - b)).toEqual(numeros(2, 15));
  });

  it('o rng embaralha o triângulo: mesma semente, mesma ordem; outra semente, outra ordem; a 8 sempre no centro', () => {
    const ordem = (s: number) => novaPartida(config(), JOGADORES, rngDeTeste(s)).arrumacao;
    expect(ordem(3)).toEqual(ordem(3));
    expect(ordem(3)).not.toEqual(ordem(4));
    for (let s = 1; s <= 20; s++) expect(ordem(s)[4]).toBe(8);
    expect(ordem(3).filter((b) => b !== 8)).not.toEqual(numeros(2, 14).filter((b) => b !== 8));
  });

  it('recusa jogadores que não formam duas equipes', () => {
    const [ana, beto] = JOGADORES as [(typeof JOGADORES)[0], (typeof JOGADORES)[0]];
    expect(() => novaPartida(config(), [ana], rngDeTeste(1))).toThrow(/jogadores/);
    expect(() => novaPartida(config(), [ana, { ...beto, equipe: 0 }], rngDeTeste(1))).toThrow(/equipes/);
    expect(() => novaPartida(config(), [ana, { ...beto, equipe: 2 }], rngDeTeste(1))).toThrow(/equipes/);
    expect(() => novaPartida(config(), [ana, { ...beto, id: 'a' }], rngDeTeste(1))).toThrow(/id/);
  });
});

interface Cenario {
  readonly nome: string;
  readonly antes: Mesa;
  readonly tacada: Tacada;
  readonly partida?: Partial<EstadoPartida>;
  readonly consequencias?: Partial<Consequencias>;
}

const MEIO: Mesa = { naMesa: [2, 3, 4, 5, 6, 7, 8] }; // Ana (par): 2 4 6. Beto (ímpar): 3 5 7. A 8 é a final.
const NA_FINAL: Mesa = { naMesa: [3, 5, 8] }; // Ana já tirou as pares.
const SAIDA: Mesa = { naMesa: numeros(2, 14), grupos: [null, null], fase: 'saida' };
const ABERTA: Mesa = { naMesa: numeros(2, 14), grupos: [null, null] };
const marca = { bola: 0, lugar: 'marca-saida' } as const;
const oitoNoPe = { bola: 8, lugar: 'marca-pe' } as const;
// A casa até o L8 (opção 1-15): Ana (par) 2 4 6, Beto (ímpar) 3 5 7, castigo 1.
const MEIO_1: Mesa = { naMesa: [1, 2, 3, 4, 5, 6, 7], regras: CASTIGO_1 };
const NO_CASTIGO_1: Mesa = { naMesa: [1, 3, 5], regras: CASTIGO_1 };
const SAIDA_1: Mesa = { naMesa: numeros(1, 15), grupos: [null, null], fase: 'saida', regras: CASTIGO_1 };
const castigoNaTabela = { bola: 1, lugar: 'tabela-lado-saida' } as const;
const falta = (...nomes: Consequencias['faltas'][number]['nome'][]) => nomes.map((nome) => ({ nome }));

const CENARIOS: readonly Cenario[] = [
  // Vez
  {
    nome: 'encaçapa bola sua numa tacada válida: continua',
    antes: MEIO,
    tacada: { toca: 2, caem: [2] },
    partida: { vez: ANA, fase: 'grupos', naMesa: [3, 4, 5, 6, 7, 8] },
    consequencias: { faltas: [], retirar: [], recolocar: [], proximo: ANA, vencedor: null, texto: 'Ana encaçapou a 2 e continua.' },
  },
  {
    nome: 'tacada válida sem bola: passa a vez',
    antes: MEIO,
    tacada: { toca: 2 },
    partida: { vez: BETO, fase: 'grupos', naMesa: [2, 3, 4, 5, 6, 7, 8] },
    consequencias: { faltas: [], retirar: [], recolocar: [], proximo: BETO, texto: 'Nenhuma bola caiu. Vez de Beto.' },
  },
  {
    nome: 'bola do adversário encaçapada conta para ele e passa a vez',
    antes: MEIO,
    tacada: { toca: 2, caem: [3] },
    partida: { vez: BETO, naMesa: [2, 4, 5, 6, 7, 8] },
    consequencias: { faltas: [], retirar: [], texto: 'A 3 conta para Beto. Vez de Beto.' },
  },
  {
    nome: 'bola sua e do adversário: a sua vale, mas passa a vez',
    antes: MEIO,
    tacada: { toca: 2, caem: [2, 3] },
    partida: { vez: BETO, naMesa: [4, 5, 6, 7, 8] },
    consequencias: { faltas: [], texto: 'Ana encaçapou a 2. A 3 conta para Beto. Vez de Beto.' },
  },
  {
    nome: 'toque simultâneo em bola sua e do adversário vale',
    antes: MEIO,
    tacada: { toca: [3, 2], caem: [2] },
    partida: { vez: ANA },
    consequencias: { faltas: [] },
  },
  {
    nome: 'bola que volta da caçapa não conta (a física não manda "cacapa")',
    antes: MEIO,
    tacada: { toca: 2, batem: [2] },
    partida: { vez: BETO, naMesa: [2, 3, 4, 5, 6, 7, 8] },
  },
  {
    nome: 'bola numerada que pula da mesa volta ao centro, sem falta',
    antes: MEIO,
    tacada: { toca: 2, pulam: [5] },
    partida: { vez: BETO, naMesa: [2, 3, 4, 5, 6, 7, 8] },
    consequencias: {
      faltas: [],
      recolocar: [{ bola: 5, lugar: 'centro-mesa' }],
      texto: 'Nenhuma bola caiu. A 5 pulou da mesa. Vez de Beto.',
    },
  },
  {
    nome: 'bola fora da mesa é falta quando a casa combina: paga e a bola volta ao centro',
    antes: { ...MEIO, regras: { bolaForaDaMesa: 'falta' } },
    tacada: { toca: 2, pulam: [5] },
    partida: { vez: BETO, naMesa: [2, 4, 5, 6, 7, 8], retiradas: [3] },
    consequencias: {
      faltas: falta('bola-fora'),
      retirar: [3],
      recolocar: [{ bola: 5, lugar: 'centro-mesa' }],
      proximo: BETO,
      texto: 'Bola fora da mesa! Beto recebe a 3. A 5 pulou da mesa.',
    },
  },
  {
    nome: 'bola fora da mesa como falta: encaçapar bola sua não segura a vez',
    antes: { ...MEIO, regras: { bolaForaDaMesa: 'falta' } },
    tacada: { toca: 2, caem: [2], pulam: [7] },
    partida: { vez: BETO, naMesa: [4, 5, 6, 7, 8], retiradas: [3] },
    consequencias: { faltas: falta('bola-fora'), retirar: [3] },
  },
  {
    nome: 'bola que pulou e é a pena sai de vez: não volta para a mesa',
    antes: MEIO,
    tacada: { toca: 2, pulam: [3], branca: 'cai' },
    partida: { naMesa: [2, 4, 5, 6, 7, 8], retiradas: [3] },
    consequencias: { retirar: [3], recolocar: [marca] },
  },
  {
    nome: 'a 8 que pula da mesa volta para a marca do pé',
    antes: MEIO,
    tacada: { toca: 2, caem: [2], pulam: [8] },
    partida: { vez: ANA, naMesa: [3, 4, 5, 6, 7, 8] },
    consequencias: { faltas: [], recolocar: [oitoNoPe], texto: 'Ana encaçapou a 2 e continua. A 8 pulou da mesa.' },
  },

  // Faltas e pena
  {
    nome: 'suicídio: o adversário recebe a menor dele e a branca volta à marca',
    antes: MEIO,
    tacada: { toca: 2, branca: 'cai' },
    partida: { vez: BETO, naMesa: [2, 4, 5, 6, 7, 8], retiradas: [3] },
    consequencias: { faltas: falta('suicidio'), retirar: [3], recolocar: [marca], proximo: BETO, texto: 'Suicídio! Beto recebe a 3.' },
  },
  {
    nome: 'suicídio que encaçapa bola sua: a bola vale, paga e perde a vez',
    antes: MEIO,
    tacada: { toca: 2, caem: [2], branca: 'cai' },
    partida: { vez: BETO, naMesa: [4, 5, 6, 7, 8], retiradas: [3] },
    consequencias: { faltas: falta('suicidio'), retirar: [3], recolocar: [marca] },
  },
  {
    nome: 'cegar: paga e a branca fica onde parou',
    antes: MEIO,
    tacada: {},
    partida: { vez: BETO, naMesa: [2, 4, 5, 6, 7, 8] },
    consequencias: { faltas: falta('cegar'), retirar: [3], recolocar: [], texto: 'Cegou! Beto recebe a 3.' },
  },
  {
    nome: 'direta: tocar primeiro bola do adversário',
    antes: MEIO,
    tacada: { toca: 3 },
    consequencias: { faltas: falta('direta'), retirar: [3], texto: 'Direta! Beto recebe a 3.' },
  },
  {
    nome: 'direta paga 2 quando a casa combina',
    antes: { ...MEIO, regras: { penaDireta: 2 } },
    tacada: { toca: 5 },
    partida: { naMesa: [2, 4, 6, 7, 8], retiradas: [3, 5] },
    consequencias: { faltas: falta('direta'), retirar: [3, 5], texto: 'Direta! Beto recebe a 3 e a 5.' },
  },
  {
    nome: 'bolão fora da mesa: paga e volta à marca',
    antes: MEIO,
    tacada: { toca: 2, branca: 'fora' },
    consequencias: { faltas: falta('branca-fora'), retirar: [3], recolocar: [marca], texto: 'Bolão fora da mesa! Beto recebe a 3.' },
  },
  {
    nome: 'tocar a 8 primeiro antes da hora é falta',
    antes: MEIO,
    tacada: { toca: 8 },
    consequencias: { faltas: falta('castigo-fora-de-hora'), retirar: [3], texto: 'A 8 fora de hora! Beto recebe a 3.' },
  },
  {
    nome: 'toque simultâneo na 8 e numa do adversário: direta',
    antes: MEIO,
    tacada: { toca: [8, 3] },
    consequencias: { faltas: falta('direta'), retirar: [3], texto: 'Direta! Beto recebe a 3.' },
  },
  {
    nome: 'sem pena dupla: cegar e suicídio pagam uma',
    antes: MEIO,
    tacada: { branca: 'cai' },
    consequencias: { faltas: falta('cegar', 'suicidio'), retirar: [3], texto: 'Cegou e suicídio! Beto recebe a 3.' },
  },
  {
    nome: 'sem pena dupla: direta (2) e suicídio pagam a maior',
    antes: { ...MEIO, regras: { penaDireta: 2 } },
    tacada: { toca: 3, branca: 'cai' },
    consequencias: { faltas: falta('direta', 'suicidio'), retirar: [3, 5] },
  },
  {
    nome: 'pena acumulada: cegar e suicídio pagam duas',
    antes: { ...MEIO, regras: { penaDupla: true } },
    tacada: { branca: 'cai' },
    consequencias: { retirar: [3, 5] },
  },
  {
    nome: 'pena acumulada: direta (2) e suicídio pagam três',
    antes: { ...MEIO, regras: { penaDupla: true, penaDireta: 2 } },
    tacada: { toca: 3, branca: 'cai' },
    partida: { naMesa: [2, 4, 6, 8], retiradas: [3, 5, 7] },
    consequencias: { retirar: [3, 5, 7], texto: 'Direta e suicídio! Beto recebe a 3, a 5 e a 7.' },
  },
  {
    nome: 'o adversário com menos bolas do que a pena paga o que tem',
    antes: { naMesa: [2, 4, 7, 8], regras: { penaDireta: 2 } },
    tacada: { toca: 7 },
    consequencias: { retirar: [7] },
  },
  {
    nome: 'o adversário já na 8 não tem bola para receber',
    antes: { naMesa: [2, 4, 8] },
    tacada: {},
    partida: { vez: BETO, fase: 'castigo', naMesa: [2, 4, 8] },
    consequencias: { faltas: falta('cegar'), retirar: [], texto: 'Cegou! Beto não tem bola para receber.' },
  },
  {
    // Fora da mesa: 9 a 14, todas contadas como de Ana; as pares dela são 10, 12 e 14.
    nome: 'pena invertida: o faltoso devolve a menor das suas ao centro',
    antes: { ...MEIO, regras: { penaInvertida: true } },
    tacada: { toca: 2, branca: 'cai' },
    partida: { vez: BETO, naMesa: [2, 3, 4, 5, 6, 7, 8, 10], retiradas: [] },
    consequencias: {
      retirar: [],
      recolocar: [{ bola: 10, lugar: 'centro-mesa' }, marca],
      texto: 'Suicídio! Ana devolve a 10.',
    },
  },
  {
    nome: 'pena invertida devolvendo a maior',
    antes: { ...MEIO, regras: { penaInvertida: true, penaInvertidaBola: 'maior' } },
    tacada: { toca: 2, branca: 'cai' },
    partida: { naMesa: [2, 3, 4, 5, 6, 7, 8, 14] },
    consequencias: { recolocar: [{ bola: 14, lugar: 'centro-mesa' }, marca], texto: 'Suicídio! Ana devolve a 14.' },
  },
  {
    // Ana encaçapou 2, 6, 10, 12 e 14 antes, em ordem; a 4 cai agora: nem a menor nem a maior.
    nome: 'pena invertida devolvendo a última encaçapada',
    antes: { naMesa: [3, 4, 5, 7, 8], regras: { penaInvertida: true, penaInvertidaBola: 'ultima' } },
    tacada: { toca: 4, caem: [4], branca: 'cai' },
    partida: { naMesa: [3, 4, 5, 7, 8] },
    consequencias: { recolocar: [{ bola: 4, lugar: 'centro-mesa' }, marca], texto: 'Suicídio! Ana devolve a 4.' },
  },
  {
    nome: 'pena invertida sem bola encaçapada: nada a devolver',
    antes: { naMesa: numeros(2, 14), regras: { penaInvertida: true } },
    tacada: { toca: 2, branca: 'cai' },
    partida: { naMesa: numeros(2, 14) },
    consequencias: { retirar: [], recolocar: [marca], texto: 'Suicídio! Ana não tem bola para devolver.' },
  },

  // A 8, bola final
  {
    nome: 'última bola do grupo: continua e vai para a 8',
    antes: { naMesa: [2, 3, 8] },
    tacada: { toca: 2, caem: [2] },
    partida: { vez: ANA, fase: 'castigo', naMesa: [3, 8] },
    consequencias: { faltas: [], texto: 'Ana encaçapou a 2 e vai para a 8.' },
  },
  {
    nome: 'última bola e a 8 na mesma tacada: derrota (a 8 só em tacada separada)',
    antes: { naMesa: [2, 3, 8] },
    tacada: { toca: 2, caem: [2, 8] },
    partida: { fase: 'fim', vencedor: 1, naMesa: [3] },
    consequencias: { vencedor: 1, texto: 'A 8 antes da hora! Ana perde e Beto vence.' },
  },
  {
    nome: 'a 8 antes da hora: derrota',
    antes: MEIO,
    tacada: { toca: 2, caem: [8] },
    partida: { fase: 'fim', vencedor: 1 },
    consequencias: { vencedor: 1 },
  },
  {
    nome: 'a 8 na hora: vitória; quem perdeu sai na próxima',
    antes: NA_FINAL,
    tacada: { toca: 8, caem: [8] },
    partida: { fase: 'fim', vencedor: 0, vez: BETO, naMesa: [3, 5] },
    consequencias: { faltas: [], vencedor: 0, proximo: BETO, texto: 'Ana matou a 8 e venceu!' },
  },
  {
    nome: 'na hora da 8, tocar primeiro bola do adversário é direta',
    antes: NA_FINAL,
    tacada: { toca: 3 },
    partida: { vez: BETO, naMesa: [5, 8] },
    consequencias: { faltas: falta('direta'), retirar: [3] },
  },
  {
    nome: 'cegar na hora da 8: o adversário recebe',
    antes: NA_FINAL,
    tacada: {},
    consequencias: { faltas: falta('cegar'), retirar: [3] },
  },
  {
    nome: 'a 8 e a branca juntas: a 8 volta para a marca do pé e vale o suicídio (provisório)',
    antes: NA_FINAL,
    tacada: { toca: 8, caem: [8], branca: 'cai' },
    partida: { vencedor: null, vez: BETO, fase: 'grupos', naMesa: [5, 8] },
    consequencias: {
      faltas: falta('suicidio'),
      retirar: [3],
      recolocar: [oitoNoPe, marca],
      vencedor: null,
      texto: 'Suicídio! A 8 volta para a marca do pé. Beto recebe a 3.',
    },
  },
  {
    nome: 'a 8 e a branca juntas, na casa em que isso é derrota',
    antes: { ...NA_FINAL, regras: { castigoEBrancaJuntos: 'derrota' } },
    tacada: { toca: 8, caem: [8], branca: 'cai' },
    partida: { fase: 'fim', vencedor: 1, naMesa: [3, 5] },
    consequencias: { vencedor: 1, recolocar: [marca], texto: 'Suicídio com a 8! Ana perde e Beto vence.' },
  },
  {
    nome: 'a 8 com direta: volta e vale a direta (provisório)',
    antes: NA_FINAL,
    tacada: { toca: 3, caem: [8] },
    partida: { vencedor: null, naMesa: [5, 8] },
    consequencias: { faltas: falta('direta'), retirar: [3], recolocar: [oitoNoPe] },
  },
  {
    nome: 'a 8 com bola fora da mesa, na casa em que isso é falta: a 8 volta',
    antes: { ...NA_FINAL, regras: { bolaForaDaMesa: 'falta' } },
    tacada: { toca: 8, caem: [8], pulam: [5] },
    partida: { vencedor: null, vez: BETO, naMesa: [5, 8], retiradas: [3] },
    consequencias: { faltas: falta('bola-fora'), retirar: [3], recolocar: [oitoNoPe, { bola: 5, lugar: 'centro-mesa' }] },
  },
  {
    nome: 'a 8 com bolão fora da mesa: a 8 volta',
    antes: NA_FINAL,
    tacada: { toca: 8, caem: [8], branca: 'fora' },
    partida: { vencedor: null, naMesa: [5, 8] },
    consequencias: { faltas: falta('branca-fora'), recolocar: [oitoNoPe, marca] },
  },

  // Saída: a 8 começa no centro do triângulo
  {
    nome: 'saída sem bola: passa a vez, mesa aberta, e não há bola para pôr (a 8 já está no triângulo)',
    antes: SAIDA,
    tacada: { toca: 5 },
    partida: { vez: BETO, fase: 'aberta', grupos: [null, null], naMesa: numeros(2, 14) },
    consequencias: { faltas: [], recolocar: [], texto: 'Nenhuma bola caiu. Vez de Beto.' },
  },
  {
    nome: 'saída que encaçapa: define o grupo e continua',
    antes: SAIDA,
    tacada: { toca: 5, caem: [4] },
    partida: { vez: ANA, fase: 'grupos', grupos: ['par', 'impar'] },
    consequencias: { recolocar: [], texto: 'Ana fica com as pares e continua.' },
  },
  {
    nome: 'saída com os dois grupos: vale a primeira que caiu e perde a vez',
    antes: SAIDA,
    tacada: { toca: 5, caem: [7, 4] },
    partida: { vez: BETO, fase: 'grupos', grupos: ['impar', 'par'], naMesa: numeros(2, 14).filter((b) => b !== 4 && b !== 7) },
    consequencias: { faltas: [], texto: 'Ana fica com as ímpares. A 4 conta para Beto. Vez de Beto.' },
  },
  {
    nome: 'suicídio na saída: mesa aberta, ninguém paga (provisório)',
    antes: SAIDA,
    tacada: { toca: 5, branca: 'cai' },
    partida: { vez: BETO, fase: 'aberta', retiradas: [] },
    consequencias: { faltas: falta('suicidio'), retirar: [], recolocar: [marca], texto: 'Suicídio! Mesa aberta: ninguém paga.' },
  },
  {
    nome: 'a 8 na saída volta para a marca do pé, sem falta (provisório)',
    antes: SAIDA,
    tacada: { toca: 5, caem: [8] },
    partida: { vez: BETO, fase: 'aberta', vencedor: null, naMesa: numeros(2, 14), encacapadas: [] },
    consequencias: { faltas: [], vencedor: null, recolocar: [oitoNoPe], texto: 'A 8 volta para a marca do pé. Vez de Beto.' },
  },
  {
    nome: 'a 8 na saída com uma par: a 8 volta, a par define o grupo e Ana continua',
    antes: SAIDA,
    tacada: { toca: 5, caem: [8, 4] },
    partida: { vez: ANA, fase: 'grupos', grupos: ['par', 'impar'], naMesa: numeros(2, 14).filter((b) => b !== 4) },
    consequencias: { faltas: [], recolocar: [oitoNoPe], texto: 'A 8 volta para a marca do pé. Ana fica com as pares e continua.' },
  },
  {
    nome: 'a 8 e a branca na saída: a 8 volta e vale o suicídio, ninguém paga',
    antes: SAIDA,
    tacada: { toca: 5, caem: [8], branca: 'cai' },
    partida: { vez: BETO, fase: 'aberta', vencedor: null, naMesa: numeros(2, 14) },
    consequencias: {
      faltas: falta('suicidio'),
      recolocar: [oitoNoPe, marca],
      texto: 'Suicídio! A 8 volta para a marca do pé. Mesa aberta: ninguém paga.',
    },
  },
  {
    nome: 'a 8 na saída, na casa em que é antes da hora: derrota',
    antes: { ...SAIDA, regras: { castigoNaSaida: 'antes-da-hora' } },
    tacada: { toca: 5, caem: [8] },
    partida: { fase: 'fim', vencedor: 1 },
    consequencias: { vencedor: 1, recolocar: [], texto: 'A 8 antes da hora! Ana perde e Beto vence.' },
  },
  {
    nome: 'a 8 na saída, na casa em que ela vence: Ana vence e Beto sai na próxima',
    antes: { ...SAIDA, regras: { castigoNaSaida: 'vence' } },
    tacada: { toca: 5, caem: [8] },
    partida: { fase: 'fim', vencedor: 0, vez: BETO },
    consequencias: { faltas: [], vencedor: 0, proximo: BETO, texto: 'Ana matou a 8 e venceu!' },
  },
  {
    nome: 'a 8 e a branca na saída, na casa em que ela vence: é como na hora dela (a 8 volta, vale o suicídio)',
    antes: { ...SAIDA, regras: { castigoNaSaida: 'vence' } },
    tacada: { toca: 5, caem: [8], branca: 'cai' },
    partida: { vencedor: null, vez: BETO, fase: 'aberta' },
    consequencias: { faltas: falta('suicidio'), recolocar: [oitoNoPe, marca], texto: 'Suicídio! A 8 volta para a marca do pé. Mesa aberta: ninguém paga.' },
  },
  {
    nome: 'saída sem bola final (2-15): não há o que pôr',
    antes: { ...SAIDA, naMesa: numeros(2, 15), regras: SEM_FINAL },
    tacada: { toca: 5 },
    consequencias: { recolocar: [] },
  },

  // Mesa aberta
  {
    nome: 'mesa aberta: tocar a 8 primeiro é falta (provisório), ninguém paga',
    antes: ABERTA,
    tacada: { toca: 8 },
    partida: { vez: BETO },
    consequencias: { faltas: falta('castigo-fora-de-hora'), retirar: [], texto: 'A 8 fora de hora! Mesa aberta: ninguém paga.' },
  },
  {
    nome: 'mesa aberta com a 8 livre: não é falta',
    antes: { ...ABERTA, regras: { castigoPrimeiroMesaAberta: 'livre' } },
    tacada: { toca: 8 },
    consequencias: { faltas: [] },
  },
  {
    nome: 'mesa aberta: cegar só perde a vez',
    antes: ABERTA,
    tacada: {},
    partida: { vez: BETO, retiradas: [] },
    consequencias: { faltas: falta('cegar'), retirar: [], texto: 'Cegou! Mesa aberta: ninguém paga.' },
  },
  {
    nome: 'falta que encaçapa com a mesa aberta: define o grupo e ninguém paga',
    antes: ABERTA,
    tacada: { toca: 4, caem: [4], branca: 'cai' },
    partida: { vez: BETO, grupos: ['par', 'impar'], fase: 'grupos', retiradas: [] },
    consequencias: { retirar: [], recolocar: [marca], texto: 'Suicídio! Mesa aberta: ninguém paga. Ana fica com as pares.' },
  },
  {
    nome: 'a 8 com a mesa aberta: derrota',
    antes: ABERTA,
    tacada: { toca: 4, caem: [8] },
    partida: { fase: 'fim', vencedor: 1 },
  },
  {
    nome: 'o grupo é da equipe de quem tacou',
    antes: { ...ABERTA, vez: BETO },
    tacada: { toca: 3, caem: [3] },
    partida: { vez: BETO, grupos: ['par', 'impar'] },
    consequencias: { texto: 'Beto fica com as ímpares e continua.' },
  },

  // Opção 1-15: a 1 é o castigo e entra na tabela depois da saída (a casa até o L8)
  {
    nome: '1-15: saída sem bola: passa a vez, mesa aberta, e o castigo entra na tabela',
    antes: SAIDA_1,
    tacada: { toca: 5 },
    partida: { vez: BETO, fase: 'aberta', grupos: [null, null], naMesa: numeros(1, 15) },
    consequencias: { faltas: [], recolocar: [castigoNaTabela], texto: 'Nenhuma bola caiu. Vez de Beto.' },
  },
  {
    nome: '1-15: saída que encaçapa: define o grupo, continua e o castigo entra',
    antes: SAIDA_1,
    tacada: { toca: 5, caem: [4] },
    partida: { vez: ANA, fase: 'grupos', grupos: ['par', 'impar'] },
    consequencias: { recolocar: [castigoNaTabela], texto: 'Ana fica com as pares e continua.' },
  },
  {
    nome: '1-15: suicídio na saída: o castigo entra e a branca volta',
    antes: SAIDA_1,
    tacada: { toca: 5, branca: 'cai' },
    consequencias: { faltas: falta('suicidio'), retirar: [], recolocar: [castigoNaTabela, marca], texto: 'Suicídio! Mesa aberta: ninguém paga.' },
  },
  {
    nome: '1-15: castigo na saída não conta: ele só entra depois dela',
    antes: SAIDA_1,
    tacada: { toca: [1, 5], caem: [1] },
    partida: { vencedor: null, fase: 'aberta', naMesa: numeros(1, 15) },
    consequencias: { faltas: [], recolocar: [castigoNaTabela] },
  },
  {
    nome: '1-15: última bola do grupo: vai para o castigo',
    antes: { naMesa: [1, 2, 3], regras: CASTIGO_1 },
    tacada: { toca: 2, caem: [2] },
    partida: { vez: ANA, fase: 'castigo', naMesa: [1, 3] },
    consequencias: { texto: 'Ana encaçapou a 2 e vai para o castigo.' },
  },
  {
    nome: '1-15: castigo antes da hora: derrota',
    antes: MEIO_1,
    tacada: { toca: 2, caem: [1] },
    partida: { fase: 'fim', vencedor: 1 },
    consequencias: { vencedor: 1, texto: 'Castigo antes da hora! Ana perde e Beto vence.' },
  },
  {
    nome: '1-15: castigo na hora: vitória',
    antes: NO_CASTIGO_1,
    tacada: { toca: 1, caem: [1] },
    partida: { fase: 'fim', vencedor: 0, vez: BETO, naMesa: [3, 5] },
    consequencias: { vencedor: 0, proximo: BETO, texto: 'Ana matou o castigo e venceu!' },
  },
  {
    nome: '1-15: tocar o castigo primeiro antes da hora é falta',
    antes: MEIO_1,
    tacada: { toca: 1 },
    consequencias: { faltas: falta('castigo-fora-de-hora'), retirar: [3], texto: 'Castigo fora de hora! Beto recebe a 3.' },
  },
  {
    nome: '1-15: castigo e branca juntos: o castigo volta para a tabela e vale o suicídio',
    antes: NO_CASTIGO_1,
    tacada: { toca: 1, caem: [1], branca: 'cai' },
    partida: { vencedor: null, vez: BETO, fase: 'grupos', naMesa: [1, 5] },
    consequencias: {
      faltas: falta('suicidio'),
      retirar: [3],
      recolocar: [castigoNaTabela, marca],
      texto: 'Suicídio! O castigo volta para a tabela. Beto recebe a 3.',
    },
  },
  {
    nome: '1-15: castigo e branca juntos, na casa em que isso é derrota',
    antes: { ...NO_CASTIGO_1, regras: { ...CASTIGO_1, castigoEBrancaJuntos: 'derrota' } },
    tacada: { toca: 1, caem: [1], branca: 'cai' },
    partida: { fase: 'fim', vencedor: 1, naMesa: [3, 5] },
    consequencias: { vencedor: 1, recolocar: [marca], texto: 'Suicídio com o castigo! Ana perde e Beto vence.' },
  },
  {
    nome: '1-15: castigo que pula da mesa volta para a tabela',
    antes: MEIO_1,
    tacada: { toca: 2, caem: [2], pulam: [1] },
    partida: { vez: ANA, naMesa: [1, 3, 4, 5, 6, 7] },
    consequencias: { faltas: [], recolocar: [castigoNaTabela] },
  },
  {
    nome: '1-15: a pena leva a última do adversário mesmo com "volta": ele vai ao castigo',
    antes: { naMesa: [1, 2, 4, 7], regras: { ...CASTIGO_1, ultimaPorPenaOuAdversario: 'volta' } },
    tacada: {},
    partida: { vez: BETO, fase: 'castigo', naMesa: [1, 2, 4], retiradas: [7] },
    consequencias: { retirar: [7] },
  },

  // Opção 2-15, sem bola final
  {
    nome: '2-15: a última bola do grupo vence',
    antes: { naMesa: [2, 3], regras: SEM_FINAL },
    tacada: { toca: 2, caem: [2] },
    partida: { fase: 'fim', vencedor: 0 },
    consequencias: { vencedor: 0, texto: 'Ana encaçapou a última e venceu!' },
  },
  {
    nome: '2-15: a última com suicídio volta para a tabela e vale o suicídio',
    antes: { naMesa: [2, 3, 5], regras: SEM_FINAL },
    tacada: { toca: 2, caem: [2], branca: 'cai' },
    partida: { vencedor: null, vez: BETO, naMesa: [2, 5], retiradas: [3] },
    consequencias: {
      retirar: [3],
      recolocar: [{ bola: 2, lugar: 'tabela-lado-saida' }, marca],
      texto: 'Suicídio! A 2 volta para a tabela. Beto recebe a 3.',
    },
  },
  {
    nome: '2-15: a pena que leva a última do adversário dá a vitória a ele',
    antes: { naMesa: [2, 3, 4], regras: SEM_FINAL },
    tacada: {},
    partida: { fase: 'fim', vencedor: 1 },
    consequencias: { retirar: [3], vencedor: 1, texto: 'Cegou! Beto recebe a 3. Beto ficou sem bolas e venceu!' },
  },
  {
    nome: '2-15: encaçapar a última do adversário dá a vitória a ele',
    antes: { naMesa: [2, 3], regras: SEM_FINAL },
    tacada: { toca: 2, caem: [3] },
    partida: { fase: 'fim', vencedor: 1 },
    consequencias: { vencedor: 1, texto: 'A 3 conta para Beto. Beto ficou sem bolas e venceu!' },
  },
  {
    nome: '2-15, a última só sai pela mão do dono: a pena não a tira',
    antes: { naMesa: [2, 3, 4], regras: { ...SEM_FINAL, ultimaPorPenaOuAdversario: 'volta' } },
    tacada: {},
    partida: { vez: BETO, fase: 'grupos', vencedor: null, naMesa: [2, 3, 4], retiradas: [] },
    consequencias: { faltas: falta('cegar'), retirar: [], vencedor: null, texto: 'Cegou! A 3 é a última de Beto e fica na mesa.' },
  },
  {
    nome: '2-15, a última só pela mão do dono: a direta de 2 paga uma e a última fica',
    antes: { naMesa: [2, 3, 5], regras: { ...SEM_FINAL, ultimaPorPenaOuAdversario: 'volta', penaDireta: 2 } },
    tacada: { toca: 3 },
    partida: { vencedor: null, naMesa: [2, 5], retiradas: [3] },
    consequencias: { retirar: [3], texto: 'Direta! Beto recebe a 3. A 5 é a última de Beto e fica na mesa.' },
  },
  {
    nome: '2-15, a última só pela mão do dono: com duas, a pena tira a menor como sempre',
    antes: { naMesa: [2, 3, 5], regras: { ...SEM_FINAL, ultimaPorPenaOuAdversario: 'volta' } },
    tacada: {},
    partida: { naMesa: [2, 5], retiradas: [3] },
    consequencias: { retirar: [3], texto: 'Cegou! Beto recebe a 3.' },
  },
  {
    nome: '2-15, a última só pela mão do dono: encaçapada pelo adversário com suicídio, volta e ninguém paga',
    antes: { naMesa: [2, 3, 4], regras: { ...SEM_FINAL, ultimaPorPenaOuAdversario: 'volta' } },
    tacada: { toca: 2, caem: [3], branca: 'cai' },
    partida: { vez: BETO, vencedor: null, naMesa: [2, 3, 4], retiradas: [] },
    consequencias: {
      faltas: falta('suicidio'),
      retirar: [],
      recolocar: [{ bola: 3, lugar: 'tabela-lado-saida' }, marca],
      texto: 'Suicídio! A 3 é a última de Beto e volta para a tabela.',
    },
  },
  {
    nome: '2-15, a última só pela mão do dono: encaçapada pelo adversário, volta para a tabela',
    antes: { naMesa: [2, 3], regras: { ...SEM_FINAL, ultimaPorPenaOuAdversario: 'volta' } },
    tacada: { toca: 2, caem: [3] },
    partida: { vez: BETO, fase: 'grupos', vencedor: null, naMesa: [2, 3] },
    consequencias: {
      faltas: [],
      recolocar: [{ bola: 3, lugar: 'tabela-lado-saida' }],
      vencedor: null,
      proximo: BETO,
      texto: 'A 3 é a última de Beto e volta para a tabela. Vez de Beto.',
    },
  },
  {
    nome: '2-15, a última só pela mão do dono: quem a encaçapou com uma sua perde a vez',
    antes: { naMesa: [2, 3, 4], regras: { ...SEM_FINAL, ultimaPorPenaOuAdversario: 'volta' } },
    tacada: { toca: 2, caem: [2, 3] },
    partida: { vez: BETO, vencedor: null, naMesa: [3, 4] },
    consequencias: { texto: 'Ana encaçapou a 2. A 3 é a última de Beto e volta para a tabela. Vez de Beto.' },
  },
  {
    nome: 'com bola final, a pena leva a última do adversário mesmo com "volta": ele vai para a 8',
    antes: { naMesa: [2, 4, 7, 8], regras: { ultimaPorPenaOuAdversario: 'volta' } },
    tacada: {},
    partida: { vez: BETO, fase: 'castigo', naMesa: [2, 4, 8], retiradas: [7] },
    consequencias: { retirar: [7] },
  },

  // Quem sai na próxima
  {
    nome: 'quem perdeu sai na próxima (Ana perde)',
    antes: MEIO,
    tacada: { toca: 2, caem: [8] },
    partida: { vez: ANA },
    consequencias: { proximo: ANA },
  },
  {
    nome: 'alternado: sai quem não saiu nesta (o jogador 1)',
    antes: { ...NA_FINAL, regras: { proximaSaida: 'alternado' } },
    tacada: { toca: 8, caem: [8] },
    consequencias: { vencedor: 0, proximo: BETO },
  },
  {
    nome: 'parceiro no 1×1: sem parceiro, quem encaçapou continua',
    antes: { ...MEIO, regras: { quemContinua: 'parceiro' } },
    tacada: { toca: 2, caem: [2] },
    partida: { vez: ANA },
    consequencias: { proximo: ANA, texto: 'Ana encaçapou a 2 e continua.' },
  },
  {
    nome: 'ranca-saia: quem venceu sai na próxima',
    antes: { ...NA_FINAL, regras: { proximaSaida: 'ranca-saia' } },
    tacada: { toca: 8, caem: [8] },
    partida: { vez: ANA },
    consequencias: { vencedor: 0, proximo: ANA },
  },

  // Mata-mata (L15): o cenário que a tabela exige da modalidade nova; os outros estão em mata-mata.test.ts
  {
    nome: 'mata-mata: bola encaçapada vale ponto e a vez passa, mesmo matando',
    antes: { naMesa: numeros(1, 15), fase: 'aberta', regras: { modalidade: 'mata-mata', bolas: '1-15', bolaFinal: 'ultima-do-grupo' } },
    tacada: { toca: 5, caem: [5] },
    partida: { vez: BETO, fase: 'aberta', encacapadas: [{ bola: 5, jogador: ANA }] },
    consequencias: { faltas: [], retirar: [], recolocar: [], proximo: BETO, vencedor: null, texto: 'Ana matou a 5 (+1). Vez de Beto.' },
  },
  // L19: o suicídio no mata-mata (as dos 3 e 4 jogadores, do pulo e de passarVez estão em suicidio-mata-mata.test.ts)
  {
    nome: 'mata-mata, suicidioNoMataMata "perde-proxima-vez": a branca volta, a vez passa e quem cometeu entra na lista',
    antes: {
      naMesa: numeros(1, 15),
      fase: 'aberta',
      regras: { modalidade: 'mata-mata', bolas: '1-15', bolaFinal: 'ultima-do-grupo', suicidioNoMataMata: 'perde-proxima-vez' },
    },
    tacada: { toca: 5, branca: 'cai' },
    partida: { vez: BETO, fase: 'aberta', perdemAProximaVez: [ANA] },
    consequencias: {
      faltas: falta('suicidio'),
      retirar: [],
      recolocar: [marca],
      proximo: BETO,
      vencedor: null,
      texto: 'Suicídio! Ana perde a próxima vez. Branca na marca. Vez de Beto.',
    },
  },
  // L21: cegar no mata-mata (os outros casos estão em cegar-mata-mata.test.ts)
  {
    nome: 'mata-mata, cegarNoMataMata "perde-proxima-vez": nada se mexe, a vez passa e quem cegou entra na lista',
    antes: {
      naMesa: numeros(1, 15),
      fase: 'aberta',
      regras: { modalidade: 'mata-mata', bolas: '1-15', bolaFinal: 'ultima-do-grupo', cegarNoMataMata: 'perde-proxima-vez' },
    },
    tacada: {},
    partida: { vez: BETO, fase: 'aberta', perdemAProximaVez: [ANA] },
    consequencias: {
      faltas: falta('cegar'),
      retirar: [],
      recolocar: [],
      proximo: BETO,
      vencedor: null,
      texto: 'Cegou! Ana perde a próxima vez. Vez de Beto.',
    },
  },
];

describe('aplicarTacada: cenários', () => {
  it.each(CENARIOS.map((c) => [c.nome, c] as const))('%s', (_, c) => {
    const antes = congelar(partidaCom(c.antes));
    const { partida, consequencias } = aplicarTacada(antes, eventos(c.tacada));
    if (c.partida) expect(partida).toMatchObject(c.partida);
    if (c.consequencias) expect(consequencias).toMatchObject(c.consequencias);
    expect(partida.vez).toBe(consequencias.proximo);
    expect(partida.vencedor).toBe(consequencias.vencedor);
  });

  it('cada falta tem cenário', () => {
    const nomes = new Set(CENARIOS.flatMap((c) => (c.consequencias?.faltas ?? []).map((f) => f.nome)));
    expect([...nomes].sort()).toEqual(['bola-fora', 'branca-fora', 'castigo-fora-de-hora', 'cegar', 'direta', 'suicidio']);
  });

  it('cada valor de opção da casa, além do Boteco, tem cenário', () => {
    for (const [chave, valores] of Object.entries(OPCOES_REGRAS) as [keyof ConfigRegras, readonly unknown[]][]) {
      for (const valor of valores) {
        if (valor === PRESET_BOTECO.regras[chave]) continue;
        expect(CENARIOS.some((c) => c.antes.regras?.[chave] === valor), `${chave} = ${String(valor)}`).toBe(true);
      }
    }
  });
});

describe('aplicarTacada: entrada inválida', () => {
  it('não aceita tacada depois do fim', () => {
    const { partida } = aplicarTacada(partidaCom(NA_FINAL), eventos({ toca: 8, caem: [8] }));
    expect(() => aplicarTacada(partida, eventos({ toca: 3 }))).toThrow(/terminou/);
  });

  it('recusa evento de bola que não está na mesa (nem a 15, que o Boteco não usa)', () => {
    expect(() => aplicarTacada(partidaCom(MEIO), eventos({ toca: 2, caem: [9] }))).toThrow(/9/);
    expect(() => aplicarTacada(partidaCom(SAIDA), eventos({ toca: 2, caem: [15] }))).toThrow(/15/);
  });
});
