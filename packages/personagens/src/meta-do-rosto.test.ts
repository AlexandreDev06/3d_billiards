import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lerMetaDoRosto } from './meta-do-rosto';

const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../arte/personagens/exportados');
const arquivo = JSON.parse(readFileSync(resolve(PASTA, 'balao-meta.json'), 'utf8')) as unknown;

describe('lerMetaDoRosto (balao-meta.json do artista)', () => {
  const meta = lerMetaDoRosto(arquivo);

  it('lê as formas na ordem do arquivo, e as caras são as que começam por cara_', () => {
    // o v2 do artista só acrescenta formas e caras: as seis de antes seguem lá, na frente
    expect(meta.formas.slice(0, 6)).toEqual(['cara_neutro', 'cara_sorriso', 'cara_susto', 'cara_bravo', 'cara_triste', 'piscar']);
    expect(meta.caras.slice(0, 5)).toEqual(['cara_neutro', 'cara_sorriso', 'cara_susto', 'cara_bravo', 'cara_triste']);
    expect(meta.caras.every((c) => c.startsWith('cara_'))).toBe(true);
  });

  it('lê as ações com o tempo em segundos (quadros / fps)', () => {
    expect([...meta.acoes.keys()]).toEqual(expect.arrayContaining(['balao_estufar', 'balao_inclinar', 'balao_murchar', 'balao_parado', 'balao_pulinho', 'balao_susto']));
    const inclinar = meta.acoes.get('balao_inclinar')!;
    // a duração e o ciclo de cada ação são do artista (o v2 refez as seis de antes): confere a conta, não o número
    expect(inclinar.duracaoS).toBeGreaterThan(0.5);
    expect(inclinar.cicloS![0]).toBeLessThan(inclinar.cicloS![1]);
    expect(inclinar.cicloS![1]).toBeLessThanOrEqual(inclinar.duracaoS + 1e-9);
    expect(inclinar.entradaS![1]).toBeLessThanOrEqual(inclinar.cicloS![0] + 1e-6);
    expect(meta.acoes.get('balao_pulinho')!.cicloS).toBeUndefined();
    expect(meta.acoes.get('balao_murchar')!.caraPar).toBe('cara_triste');
  });

  it('a ação que repete sozinha (a parada) é marcada', () => {
    expect(meta.acoes.get('balao_parado')!.repete).toBe(true);
    expect(meta.acoes.get('balao_estufar')!.repete).toBe(false);
  });

  it('lê os olhos (pai, eixo no repouso) e o limite do olhar em radianos', () => {
    expect([...meta.olhos.keys()].sort()).toEqual(['olho_dir', 'olho_esq']);
    expect(meta.olhos.get('olho_esq')!.pai).toBe('espinha_2');
    expect(meta.olhos.get('olho_esq')!.eixoDeRepouso).toEqual([0, 0, 1]);
    expect(meta.limiteDoOlharRad).toBeGreaterThanOrEqual(Math.PI / 6 - 1e-9);
  });

  it('lê os pontos das mãos', () => {
    expect([...meta.ancoras.keys()].sort()).toEqual(['mao_dir', 'mao_esq']);
    expect(meta.ancoras.get('mao_esq')!.pai).toBe('espinha_2');
    expect(meta.ancoras.get('mao_esq')!.posicaoM[0]).toBeCloseTo(0.095, 6);
  });

  it('sem as chaves do v2, tudo delas se desliga (versão 1, sem pálpebras nem cordinha de meta)', () => {
    const v1 = lerMetaDoRosto({ acoes: {}, formas: { nomes: ['cara_neutro', 'piscar'] } });
    expect(v1.versao).toBe(1);
    expect(v1.palpebras).toBeNull();
    expect(v1.cordinha).toBeNull();
    expect(v1.tamanhoDeRepouso).toBeNull();
    expect(v1.latexProposto).toBeNull();
  });

  const FORMAS = ['cara_neutro', 'cara_comemorando', 'piscar', 'piscar_esq', 'piscar_dir', 'palpebra_cima', 'palpebra_baixo'];
  /** Um v2 escrito como o Pincel o escreve, com só o que o jogo lê. */
  const v2Valido = (): Record<string, unknown> => ({
    versao: 2,
    acoes: {},
    formas: { nomes: [...FORMAS] },
    tamanho_repouso_cm: { metade_altura: 6.6, raio: 4.5, no_z: -8.5, cordinha: 7.2 },
    palpebras: {
      cima: { forma: 'palpebra_cima', olhar_graus_para_peso_1: 34.0, gira_graus_no_peso_1: 12.0, quando: 'o olhar sobe' },
      baixo: { forma: 'palpebra_baixo', olhar_graus_para_peso_1: 30.0, gira_graus_no_peso_1: 12.0 },
      regra: 'texto',
    },
    cordinha: { simulada: true, ossos: ['cordinha_1', 'cordinha_2'], pai_da_primeira: 'no', comprimento_de_cada_junta_m: [0.018, 0.019], massa_sugerida_g_por_junta: 0.12, amortecimento_sugerido: 0.9, limite_de_dobra_graus: 55 },
    latex_proposta: { aviso: 'texto', roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.25, sheenRoughness: 0.45, specularIntensity: 0.5, ior: 1.45, vertexColors: true },
    abertura_da_cara: { cara_neutro: 1.0, cara_comemorando: 0.0 },
    piscar: { formas: { os_dois: 'piscar' }, peso_da_cara_na_piscadinha: { cara_neutro: 1.0, cara_comemorando: 0.0 } },
  });

  it('lê o v2 como o Pincel o escreveu (olhar_graus_para_peso_1, comprimento_de_cada_junta_m, abertura_da_cara, peso_da_cara_na_piscadinha, latex_proposta)', () => {
    const v2 = lerMetaDoRosto(v2Valido());
    expect(v2.versao).toBe(2);
    expect(v2.tamanhoDeRepouso!.metadeAlturaM).toBeCloseTo(0.066, 9);
    expect(v2.tamanhoDeRepouso!.noZM).toBeCloseTo(-0.085, 9);
    expect(v2.tamanhoDeRepouso!.cordinhaM).toBeCloseTo(0.072, 9);
    expect(v2.palpebras).toEqual({ cima: { forma: 'palpebra_cima', grausPara1: 34 }, baixo: { forma: 'palpebra_baixo', grausPara1: 30 } });
    expect(v2.cordinha).toEqual({ ossos: ['cordinha_1', 'cordinha_2'], comprimentosM: [0.018, 0.019], massaSugeridaGPorJunta: 0.12, simulada: true });
    expect(v2.aberturaDaCara.get('cara_comemorando')).toBe(0);
    expect(v2.aberturaDaCara.get('cara_neutro')).toBe(1);
    expect(v2.pesoDaCaraNaPiscadinha.get('cara_comemorando')).toBe(0);
    expect(v2.latexProposto).toEqual({
      roughness: 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.25, sheenRoughness: 0.45, specularIntensity: 0.5, ior: 1.45, vertexColors: true,
    });
  });

  it('o arquivo do Pincel inteiro passa na leitura estrita e traz o látex proposto (hoje v3: o v2 acima segue carregando)', () => {
    expect(meta.versao).toBe(3);
    expect(meta.latexProposto).not.toBeNull();
    expect(meta.latexProposto!.clearcoat).toBeGreaterThan(0);
    expect(meta.latexProposto!.vertexColors).toBe(true);
    expect(meta.cordinha!.comprimentosM).toHaveLength(meta.cordinha!.ossos.length);
    expect(meta.aberturaDaCara.size).toBeGreaterThan(5);
  });

  it('o látex proposto só leva os números que o arquivo dá', () => {
    const m = lerMetaDoRosto({ acoes: {}, formas: { nomes: [] }, latex_proposta: { aviso: 'x', roughness: 0.3, sheenColor_dica: 'texto' } });
    expect(m.latexProposto).toEqual({ roughness: 0.3 });
  });

  it('sem abertura_da_cara nem peso na piscadinha, cada cara vale 1 (v1 e arquivos sem a nota)', () => {
    const m = lerMetaDoRosto({ acoes: {}, formas: { nomes: ['cara_neutro'] } });
    expect(m.aberturaDaCara.size).toBe(0);
    expect(m.pesoDaCaraNaPiscadinha.size).toBe(0);
    expect(m.latexProposto).toBeNull();
  });

  // Uma grafia por chave, a do Pincel: a chave que está no arquivo e vem errada falha dizendo o campo, nunca desliga o recurso em silêncio.
  type Folha = Record<string, unknown>;
  /** O objeto aninhado de `m` no caminho dado. */
  const no = (m: Folha, ...caminho: string[]): Folha => caminho.reduce<Folha>((acima, chave) => acima[chave] as Folha, m);
  type Estrago = (v2: Folha) => void;
  it.each<[string, Estrago, string]>([
    ['pálpebras com a grafia antiga (graus_para_1)', (m) => { no(m, 'palpebras').cima = { forma: 'palpebra_cima', graus_para_1: 22 }; }, 'palpebras.cima.olhar_graus_para_peso_1'],
    ['pálpebra com ângulo em texto', (m) => { no(m, 'palpebras', 'baixo').olhar_graus_para_peso_1 = '30'; }, 'palpebras.baixo.olhar_graus_para_peso_1'],
    ['pálpebra com ângulo zero', (m) => { no(m, 'palpebras', 'baixo').olhar_graus_para_peso_1 = 0; }, 'palpebras.baixo.olhar_graus_para_peso_1'],
    ['pálpebra com forma que não existe', (m) => { no(m, 'palpebras', 'cima').forma = 'palpebra_cimaa'; }, 'palpebras.cima.forma'],
    ['pálpebras sem o lado baixo', (m) => { delete no(m, 'palpebras').baixo; }, 'palpebras.baixo'],
    ['pálpebras que não são um objeto', (m) => { m.palpebras = 'sim'; }, 'palpebras'],
    ['cordinha sem a lista de ossos', (m) => { delete no(m, 'cordinha').ossos; }, 'cordinha.ossos'],
    ['cordinha com a grafia antiga dos comprimentos (comprimentos_m)', (m) => { no(m, 'cordinha').comprimentos_m = no(m, 'cordinha').comprimento_de_cada_junta_m; delete no(m, 'cordinha').comprimento_de_cada_junta_m; }, 'cordinha.comprimento_de_cada_junta_m'],
    ['cordinha com um comprimento a menos que os ossos', (m) => { no(m, 'cordinha').comprimento_de_cada_junta_m = [0.018]; }, 'cordinha.comprimento_de_cada_junta_m'],
    ['cordinha com um comprimento negativo', (m) => { no(m, 'cordinha').comprimento_de_cada_junta_m = [0.018, -0.019]; }, 'cordinha.comprimento_de_cada_junta_m[1]'],
    ['cordinha com um comprimento em texto', (m) => { no(m, 'cordinha').comprimento_de_cada_junta_m = [0.018, '0.019']; }, 'cordinha.comprimento_de_cada_junta_m[1]'],
    ['cordinha com simulada em texto', (m) => { no(m, 'cordinha').simulada = 'sim'; }, 'cordinha.simulada'],
    ['cordinha com massa em texto', (m) => { no(m, 'cordinha').massa_sugerida_g_por_junta = 'leve'; }, 'cordinha.massa_sugerida_g_por_junta'],
    ['abertura_da_cara com uma cara que não existe', (m) => { no(m, 'abertura_da_cara').cara_x = 0.5; }, 'abertura_da_cara.cara_x'],
    ['abertura_da_cara com valor em texto', (m) => { no(m, 'abertura_da_cara').cara_neutro = 'aberta'; }, 'abertura_da_cara.cara_neutro'],
    ['abertura_da_cara com valor acima de 1', (m) => { no(m, 'abertura_da_cara').cara_neutro = 1.5; }, 'abertura_da_cara.cara_neutro'],
    ['peso na piscadinha com uma cara que não existe', (m) => { no(m, 'piscar', 'peso_da_cara_na_piscadinha').cara_x = 1; }, 'piscar.peso_da_cara_na_piscadinha.cara_x'],
    ['peso na piscadinha negativo', (m) => { no(m, 'piscar', 'peso_da_cara_na_piscadinha').cara_neutro = -0.1; }, 'piscar.peso_da_cara_na_piscadinha.cara_neutro'],
    ['tamanho de repouso sem o raio', (m) => { delete no(m, 'tamanho_repouso_cm').raio; }, 'tamanho_repouso_cm.raio'],
    ['tamanho de repouso com metade_altura em texto', (m) => { no(m, 'tamanho_repouso_cm').metade_altura = '6.6'; }, 'tamanho_repouso_cm.metade_altura'],
    ['tamanho de repouso com no_z em texto', (m) => { no(m, 'tamanho_repouso_cm').no_z = 'fundo'; }, 'tamanho_repouso_cm.no_z'],
    ['látex com rugosidade em texto', (m) => { no(m, 'latex_proposta').roughness = 'baixa'; }, 'latex_proposta.roughness'],
    ['látex com clearcoat acima de 1', (m) => { no(m, 'latex_proposta').clearcoat = 3; }, 'latex_proposta.clearcoat'],
    ['látex com ior fora da faixa', (m) => { no(m, 'latex_proposta').ior = 0.5; }, 'latex_proposta.ior'],
    ['látex com vertexColors em texto', (m) => { no(m, 'latex_proposta').vertexColors = 'sim'; }, 'latex_proposta.vertexColors'],
  ])('meta v2 com defeito: %s', (_nome, estragar, campo) => {
    const m = v2Valido();
    estragar(m);
    expect(() => lerMetaDoRosto(m)).toThrow(campo);
  });

  it('cordinha com simulada falso não precisa dos comprimentos: o artista deixou-a animada nas ações', () => {
    const m = v2Valido();
    m.cordinha = { ossos: ['cordinha_1'], simulada: false };
    expect(lerMetaDoRosto(m).cordinha).toEqual({ ossos: ['cordinha_1'], comprimentosM: null, massaSugeridaGPorJunta: null, simulada: false });
  });

  it('par_de_cara no topo da meta vale quando a ação não traz cara_par', () => {
    const m = lerMetaDoRosto({ acoes: { balao_rir: { fps: 30, quadros: 60 }, balao_ufa: { fps: 30, quadros: 30, cara_par: 'cara_ufa' } }, formas: { nomes: [] }, par_de_cara: { balao_rir: 'cara_rindo', balao_ufa: 'cara_tedio' } });
    expect(m.acoes.get('balao_rir')!.caraPar).toBe('cara_rindo');
    expect(m.acoes.get('balao_ufa')!.caraPar).toBe('cara_ufa');
  });

  it('diz qual campo está errado', () => {
    expect(() => lerMetaDoRosto(null)).toThrow('meta');
    expect(() => lerMetaDoRosto({ acoes: { balao_x: { fps: 'a', quadros: 3 } }, formas: { nomes: [] } })).toThrow('balao_x.fps');
  });

  // ---- v3 (P8): chapéu, bigode, estilo e cor de olho ----
  it('o arquivo do Pincel inteiro traz o v3: âncora do chapéu com a regra de escala, 5 bigodes, 4 estilos de olho e 8 cores', () => {
    expect(meta.ancoraDeAcessorio).toEqual({
      no: 'ancora_chapeu',
      pai: 'espinha_3',
      largura: { segue: 0.65, piso: 0.88, teto: 1.32 },
      altura: { segue: 0.3, piso: 0.88, teto: 1.14 },
    });
    expect([...meta.bigodes.keys()]).toEqual(['bigode_fino', 'bigodao', 'bigode_guidao', 'bigode_dali', 'bigode_chevron']);
    expect(meta.bigodes.get('bigodao')).toEqual({ noAlta: 'bigodao_alta', noBaixa: 'bigodao_baixa' });
    expect([...meta.estilosDeOlho!.itens.keys()]).toEqual(['olho_normal', 'olho_kawaii', 'olho_bravo', 'olho_cansado']);
    expect(meta.estilosDeOlho!.vitrine).toBe('estilos_de_olho');
    expect(meta.estilosDeOlho!.itens.get('olho_normal')).toEqual({ forma: null, esclera: 'olho', iris: 'iris' });
    expect(meta.estilosDeOlho!.itens.get('olho_kawaii')).toEqual({ forma: 'estilo_kawaii', esclera: 'olho_kawaii', iris: 'iris_kawaii' });
    expect(meta.coresDeOlho!.padrao).toBe('castanho');
    expect([...meta.coresDeOlho!.cores.keys()]).toEqual(['castanho', 'mel', 'verde', 'azul', 'cinza', 'violeta', 'vermelho', 'dourado']);
    expect(meta.coresDeOlho!.cores.get('castanho')).toBe(0xb0702f);
    expect(meta.coresDeOlho!.cores.get('azul')).toBe(0x3f9cff);
  });

  it('o v2 não tem nada do v3: sem âncora, sem bigodes, sem estilos e sem cores (os recursos se desligam)', () => {
    const v2 = lerMetaDoRosto(v2Valido());
    expect(v2.ancoraDeAcessorio).toBeNull();
    expect(v2.bigodes.size).toBe(0);
    expect(v2.estilosDeOlho).toBeNull();
    expect(v2.coresDeOlho).toBeNull();
  });

  /** Um v3 mínimo escrito como o Pincel o escreve. */
  const v3Valido = (): Record<string, unknown> => ({
    ...v2Valido(),
    versao: 3,
    formas: { nomes: [...FORMAS, 'estilo_kawaii'] },
    ancora_chapeu: { no: 'ancora_chapeu', pai: 'espinha_3', escala_do_chapeu: { largura: { segue: 0.65, piso: 0.88, teto: 1.32 }, altura: { segue: 0.3, piso: 0.88, teto: 1.14 } } },
    bigodes: { ids: ['bigodao'], itens: { bigodao: { no_alta: 'bigodao_alta', no_baixa: 'bigodao_baixa', pai: 'espinha_2' } } },
    estilos_de_olho: {
      ids: ['olho_normal', 'olho_kawaii'],
      itens: { olho_normal: { forma: null, esclera: { material: 'olho' }, iris: { material: 'iris' } }, olho_kawaii: { forma: 'estilo_kawaii', esclera: { material: 'olho_kawaii' }, iris: { material: 'iris_kawaii' } } },
      vitrine: { no: 'estilos_de_olho' },
    },
    cores_de_olho: { ids: ['castanho', 'azul'], padrao: 'castanho', cores: { castanho: { cor: '#B0702F', centro: '#D69A52', borda: '#5A3414' }, azul: { cor: '#3F9CFF' } } },
  });

  it('lê um v3 mínimo', () => {
    const m = lerMetaDoRosto(v3Valido());
    expect(m.versao).toBe(3);
    expect(m.bigodes.get('bigodao')).toEqual({ noAlta: 'bigodao_alta', noBaixa: 'bigodao_baixa' });
    expect(m.coresDeOlho!.cores.get('azul')).toBe(0x3f9cff);
  });

  it.each<[string, Estrago, string]>([
    ['âncora sem o nó', (m) => { delete no(m, 'ancora_chapeu').no; }, 'ancora_chapeu.no'],
    ['âncora com o pai em número', (m) => { no(m, 'ancora_chapeu').pai = 3; }, 'ancora_chapeu.pai'],
    ['âncora sem a regra de escala', (m) => { delete no(m, 'ancora_chapeu').escala_do_chapeu; }, 'ancora_chapeu.escala_do_chapeu'],
    ['regra sem o lado da altura', (m) => { delete no(m, 'ancora_chapeu', 'escala_do_chapeu').altura; }, 'ancora_chapeu.escala_do_chapeu.altura'],
    ['regra com a grafia antiga (acompanha)', (m) => { no(m, 'ancora_chapeu', 'escala_do_chapeu', 'largura').acompanha = 0.6; delete no(m, 'ancora_chapeu', 'escala_do_chapeu', 'largura').segue; }, 'ancora_chapeu.escala_do_chapeu.largura.segue'],
    ['regra com segue em texto', (m) => { no(m, 'ancora_chapeu', 'escala_do_chapeu', 'largura').segue = '0.65'; }, 'ancora_chapeu.escala_do_chapeu.largura.segue'],
    ['regra com segue acima de 1', (m) => { no(m, 'ancora_chapeu', 'escala_do_chapeu', 'altura').segue = 1.5; }, 'ancora_chapeu.escala_do_chapeu.altura.segue'],
    ['regra com piso zero', (m) => { no(m, 'ancora_chapeu', 'escala_do_chapeu', 'altura').piso = 0; }, 'ancora_chapeu.escala_do_chapeu.altura.piso'],
    ['regra com teto abaixo do piso', (m) => { no(m, 'ancora_chapeu', 'escala_do_chapeu', 'largura').teto = 0.5; }, 'ancora_chapeu.escala_do_chapeu.largura.teto'],
    ['bigodes sem a lista de ids', (m) => { delete no(m, 'bigodes').ids; }, 'bigodes.ids'],
    ['bigodes com id repetido', (m) => { no(m, 'bigodes').ids = ['bigodao', 'bigodao']; }, 'bigodes.ids'],
    ['bigode sem o item', (m) => { no(m, 'bigodes').ids = ['bigodao', 'bigode_x']; }, 'bigodes.itens.bigode_x'],
    ['bigode sem no_alta', (m) => { delete no(m, 'bigodes', 'itens', 'bigodao').no_alta; }, 'bigodes.itens.bigodao.no_alta'],
    ['bigode com a grafia antiga (no_baixo)', (m) => { const i = no(m, 'bigodes', 'itens', 'bigodao'); i.no_baixo = i.no_baixa; delete i.no_baixa; }, 'bigodes.itens.bigodao.no_baixa'],
    ['item de bigode fora da lista de ids', (m) => { no(m, 'bigodes', 'itens').fantasma = { no_alta: 'a', no_baixa: 'b' }; }, 'bigodes.itens.fantasma'],
    ['estilo sem a vitrine', (m) => { delete no(m, 'estilos_de_olho').vitrine; }, 'estilos_de_olho.vitrine'],
    ['vitrine sem o nó', (m) => { no(m, 'estilos_de_olho', 'vitrine').no = 7; }, 'estilos_de_olho.vitrine.no'],
    ['estilo com a forma que não existe', (m) => { no(m, 'estilos_de_olho', 'itens', 'olho_kawaii').forma = 'estilo_kawai'; }, 'estilos_de_olho.itens.olho_kawaii.forma'],
    ['estilo sem a chave forma (nem null)', (m) => { delete no(m, 'estilos_de_olho', 'itens', 'olho_normal').forma; }, 'estilos_de_olho.itens.olho_normal.forma'],
    ['estilo sem o material da esclera', (m) => { no(m, 'estilos_de_olho', 'itens', 'olho_kawaii').esclera = {}; }, 'estilos_de_olho.itens.olho_kawaii.esclera.material'],
    ['estilo sem o material da íris', (m) => { delete no(m, 'estilos_de_olho', 'itens', 'olho_kawaii').iris; }, 'estilos_de_olho.itens.olho_kawaii.iris'],
    ['estilo na lista de ids sem item', (m) => { no(m, 'estilos_de_olho').ids = ['olho_normal', 'olho_kawaii', 'olho_x']; }, 'estilos_de_olho.itens.olho_x'],
    ['cor sem o padrão', (m) => { delete no(m, 'cores_de_olho').padrao; }, 'cores_de_olho.padrao'],
    ['cor padrão que não existe', (m) => { no(m, 'cores_de_olho').padrao = 'roxo'; }, 'cores_de_olho.padrao'],
    ['cor sem o tom', (m) => { delete no(m, 'cores_de_olho', 'cores', 'azul').cor; }, 'cores_de_olho.cores.azul.cor'],
    ['cor com o tom em número', (m) => { no(m, 'cores_de_olho', 'cores', 'azul').cor = 0x3f9cff; }, 'cores_de_olho.cores.azul.cor'],
    ['cor com o tom fora do formato #RRGGBB', (m) => { no(m, 'cores_de_olho', 'cores', 'azul').cor = '#3F9'; }, 'cores_de_olho.cores.azul.cor'],
    ['cor com o centro inválido', (m) => { no(m, 'cores_de_olho', 'cores', 'castanho').centro = 'claro'; }, 'cores_de_olho.cores.castanho.centro'],
  ])('meta v3 com defeito: %s', (_nome, estragar, campo) => {
    const m = v3Valido();
    estragar(m);
    expect(() => lerMetaDoRosto(m)).toThrow(campo);
  });
});
