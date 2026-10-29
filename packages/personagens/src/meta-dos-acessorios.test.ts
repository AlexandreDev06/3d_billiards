import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lerMetaDosAcessorios } from './meta-dos-acessorios';

const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../arte/personagens/exportados');
const arquivo = JSON.parse(readFileSync(resolve(PASTA, 'chapeus-meta.json'), 'utf8')) as unknown;

describe('lerMetaDosAcessorios (chapeus-meta.json do artista)', () => {
  it('lê os 8 chapéus na ordem do arquivo, cada um com o nó de cada nível', () => {
    const m = lerMetaDosAcessorios(arquivo);
    expect(m.versao).toBe(1);
    expect([...m.acessorios.keys()]).toEqual(['chapeu_panama', 'bone_aba_reta', 'cartola', 'gorro_pompom', 'chapeu_palha', 'boina', 'chapeu_festa', 'coroa']);
    expect(m.acessorios.get('cartola')).toEqual({ noAlta: 'cartola_alta', noBaixa: 'cartola_baixa' });
  });

  const valido = (): Record<string, unknown> => ({ versao: 1, chapeus: { cartola: { alta: { no: 'cartola_alta' }, baixa: { no: 'cartola_baixa' } } } });

  it('lê o mínimo escrito como o Pincel escreve', () => {
    expect(lerMetaDosAcessorios(valido()).acessorios.get('cartola')).toEqual({ noAlta: 'cartola_alta', noBaixa: 'cartola_baixa' });
  });

  type Folha = Record<string, unknown>;
  const no = (m: Folha, ...caminho: string[]): Folha => caminho.reduce<Folha>((acima, chave) => acima[chave] as Folha, m);
  it.each<[string, (m: Folha) => void, string]>([
    ['sem a versão', (m) => { delete m.versao; }, 'versao'],
    ['versão que o pacote não conhece', (m) => { m.versao = 2; }, 'versao'],
    ['sem a lista de chapéus', (m) => { delete m.chapeus; }, 'chapeus'],
    ['chapéus vazio', (m) => { m.chapeus = {}; }, 'chapeus'],
    ['chapéu que não é um objeto', (m) => { no(m, 'chapeus').cartola = 'x'; }, 'chapeus.cartola'],
    ['chapéu sem o nível alto', (m) => { delete no(m, 'chapeus', 'cartola').alta; }, 'chapeus.cartola.alta'],
    ['nível alto sem o nó', (m) => { delete no(m, 'chapeus', 'cartola', 'alta').no; }, 'chapeus.cartola.alta.no'],
    ['nó do nível baixo em número', (m) => { no(m, 'chapeus', 'cartola', 'baixa').no = 3; }, 'chapeus.cartola.baixa.no'],
    ['grafia antiga (no_baixa no lugar de baixa.no)', (m) => { no(m, 'chapeus', 'cartola').no_baixa = 'x'; delete no(m, 'chapeus', 'cartola').baixa; }, 'chapeus.cartola.baixa'],
  ])('chapéus com defeito: %s', (_n, estragar, campo) => {
    const m = valido();
    estragar(m);
    expect(() => lerMetaDosAcessorios(m)).toThrow(campo);
  });

  it('o arquivo que não é um objeto diz qual é o problema', () => {
    expect(() => lerMetaDosAcessorios(null)).toThrow('meta');
    expect(() => lerMetaDosAcessorios([])).toThrow('meta');
  });
});
