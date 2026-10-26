import { describe, expect, it } from 'vitest';
import { FORMATO_DO_MODO, MODALIDADES_DE_SALA, MODOS_POR_MODALIDADE, type ModoSala } from '@sinuca/protocolo';
import { PRESETS_DE_FABRICA, PRESET_BOTECO, PRESET_MATA_MATA, ROTULO_MODALIDADE, formacoesAceitas, type Jogador, type Modalidade } from '@sinuca/regras';
import { jogadoresDoHotSeat } from '../config';
import {
  CATALOGO,
  DESCRICAO_DA_MODALIDADE,
  descricaoGerada,
  fraseDeQuemJoga,
  modoAoTrocarDeModalidade,
  montarCatalogo,
  presetDaModalidade,
  tituloDoFormato,
  type Catalogo,
} from './catalogo';

describe('o catálogo do lobby vem dos dados do protocolo e das regras', () => {
  it('as modalidades e os formatos são os do protocolo, na ordem dele', () => {
    expect(CATALOGO.modalidades).toEqual(MODALIDADES_DE_SALA);
    for (const m of MODALIDADES_DE_SALA) expect(CATALOGO.modosDa(m)).toEqual(MODOS_POR_MODALIDADE[m]);
    expect(CATALOGO.formacaoDo('2x1')).toEqual(FORMATO_DO_MODO['2x1'].formacao);
    expect(CATALOGO.nomeDa('mata-mata')).toBe(ROTULO_MODALIDADE['mata-mata']);
  });

  it('cada modalidade do catálogo tem preset de fábrica nas regras, e os formatos batem com formacoesAceitas', () => {
    for (const modalidade of MODALIDADES_DE_SALA) {
      const preset = presetDaModalidade(modalidade);
      expect(preset, modalidade).not.toBeNull();
      expect(preset!.regras.modalidade).toBe(modalidade);
      const aceitas = formacoesAceitas(preset!.regras).map((f) => f.join('x'));
      for (const modo of CATALOGO.modosDa(modalidade)) expect(aceitas, `${modalidade} ${modo}`).toContain(CATALOGO.formacaoDo(modo).join('x'));
    }
    expect(presetDaModalidade('par-ou-impar')).toBe(PRESET_BOTECO);
    expect(presetDaModalidade('mata-mata')).toBe(PRESET_MATA_MATA);
    expect(PRESETS_DE_FABRICA).toContain(presetDaModalidade('mata-mata'));
  });

  it('sem preset, a modalidade volta null', () => {
    expect(presetDaModalidade('mata-mata', [PRESET_BOTECO])).toBeNull();
  });
});

describe('montarCatalogo: os cartões e os formatos', () => {
  const cartoes = montarCatalogo();

  it('um cartão por modalidade, com o nome das regras e uma linha de explicação', () => {
    expect(cartoes.map((c) => c.modalidade)).toEqual(['par-ou-impar', 'mata-mata']);
    expect(cartoes.map((c) => c.nome)).toEqual(['Par ou ímpar', 'Mata-mata']);
    expect(cartoes[0]!.descricao).toBe('Pares contra ímpares, a 8 por último.');
    expect(cartoes[1]!.descricao).toMatch(/cada um por si/i);
    expect(cartoes[1]!.descricao).toMatch(/15 bolas/);
    expect(cartoes[1]!.descricao).toMatch(/matar mais/);
  });

  it('a linha do mata-mata cita as duas faltas que punem (cegar e suicídio) em duas linhas do cartão de 275 px', () => {
    expect(cartoes[1]!.descricao).toMatch(/cegar/i);
    expect(cartoes[1]!.descricao).toMatch(/suicídio/i);
    expect(cartoes[1]!.descricao).toMatch(/perde a vez/i);
    // Medido a 1280×720: 80 caracteres ocupam 87% de duas linhas do cartão (o limite é a folga para outra fonte).
    expect(cartoes[1]!.descricao.length).toBeLessThanOrEqual(85);
    expect(cartoes[0]!.descricao).not.toMatch(/perde a vez|cegar|suicídio/i);
  });

  it('par ou ímpar: 1×1, 2×1 e 2×2; mata-mata: 2, 3 e 4 jogadores', () => {
    expect(cartoes[0]!.formatos.map((f) => [f.modo, f.rotulo, f.jogadores])).toEqual([
      ['1x1', '1×1', 2],
      ['2x1', '2×1', 3],
      ['2x2', '2×2', 4],
    ]);
    expect(cartoes[1]!.formatos.map((f) => [f.modo, f.rotulo, f.jogadores])).toEqual([
      ['1x1', '2 jogadores', 2],
      ['1x1x1', '3 jogadores', 3],
      ['1x1x1x1', '4 jogadores', 4],
    ]);
  });

  it('a linha de cada formato diz quem joga contra quem', () => {
    expect(cartoes[0]!.formatos.map((f) => f.detalhe)).toEqual(['Frente a frente', 'Dois contra um', 'Dois contra dois']);
    expect(cartoes[1]!.formatos.map((f) => f.detalhe)).toEqual(['Frente a frente', 'Cada um por si', 'Cada um por si']);
  });

  it('tudo disponível por padrão; `disponivel` desabilita só o que as regras não jogam', () => {
    expect(cartoes.every((c) => c.disponivel && c.formatos.every((f) => f.disponivel))).toBe(true);
    const so2x2: (m: Modalidade, modo: ModoSala) => boolean = (m, modo) => m === 'par-ou-impar' && modo === '2x2';
    const parcial = montarCatalogo(CATALOGO, so2x2);
    expect(parcial[0]!.formatos.map((f) => f.disponivel)).toEqual([false, false, true]);
    expect(parcial[0]!.disponivel).toBe(true);
    expect(parcial[1]!.disponivel).toBe(false);
  });
});

describe('modalidade nova não exige mudança na tela', () => {
  /** Um catálogo com uma terceira modalidade ("Rodada"), de 2 a 4 pessoas por equipes de 2 e de 1, que nenhum texto da tela conhece. */
  const FORMACOES: Record<string, readonly number[]> = { '1x1': [1, 1], '2x1': [2, 1], '2x2': [2, 2], '1x1x1': [1, 1, 1], '1x1x1x1': [1, 1, 1, 1] };
  const comTerceira = {
    modalidades: [...CATALOGO.modalidades, 'rodada' as unknown as Modalidade],
    modosDa: (m: Modalidade) => ((m as string) === 'rodada' ? (['1x1x1', '1x1x1x1'] as const) : CATALOGO.modosDa(m)),
    formacaoDo: (modo: ModoSala) => FORMACOES[modo]!,
    nomeDa: (m: Modalidade) => ((m as string) === 'rodada' ? 'Rodada' : CATALOGO.nomeDa(m)),
  } satisfies Catalogo;

  it('ganha cartão e formatos sozinha, com a linha gerada dos dados', () => {
    const cartoes = montarCatalogo(comTerceira);
    expect(cartoes).toHaveLength(3);
    const nova = cartoes[2]!;
    expect(nova.nome).toBe('Rodada');
    expect(nova.descricao).toBe('Cada um por si, de 3 a 4 jogadores.');
    expect(nova.formatos.map((f) => f.rotulo)).toEqual(['3 jogadores', '4 jogadores']);
    // as outras duas seguem como estavam
    expect(cartoes[0]!.descricao).toBe(DESCRICAO_DA_MODALIDADE['par-ou-impar']);
  });

  it('a frase gerada diz "em equipes" quando algum formato tem equipe de mais de um', () => {
    const emEquipes = { ...comTerceira, modosDa: (m: Modalidade) => ((m as string) === 'rodada' ? (['2x1', '2x2'] as const) : CATALOGO.modosDa(m)) };
    expect(descricaoGerada(emEquipes, 'rodada' as unknown as Modalidade)).toBe('Em equipes, de 3 a 4 jogadores.');
    expect(descricaoGerada({ ...comTerceira, modosDa: () => ['2x2'] }, 'rodada' as unknown as Modalidade)).toBe('Em equipes, 4 jogadores.');
  });

  it('a troca de modalidade acha o formato dela com o mesmo número de lugares', () => {
    const para = (m: string, atual: ModoSala): ModoSala => modoAoTrocarDeModalidade(comTerceira, m as Modalidade, atual);
    expect(para('rodada', '2x1')).toBe('1x1x1');
    expect(para('rodada', '2x2')).toBe('1x1x1x1');
  });
});

describe('modoAoTrocarDeModalidade: a regra da sala (L16b)', () => {
  const para = (m: Modalidade, atual: ModoSala, disponivel?: (m: Modalidade, modo: ModoSala) => boolean): ModoSala => modoAoTrocarDeModalidade(CATALOGO, m, atual, disponivel);

  it('o atual fica se a modalidade nova o aceita (o 1×1 serve às duas)', () => {
    expect(para('mata-mata', '1x1')).toBe('1x1');
    expect(para('par-ou-impar', '1x1')).toBe('1x1');
    expect(para('par-ou-impar', '2x2')).toBe('2x2');
  });

  it('senão, o formato da nova com o mesmo número de lugares: 2×2 ↔ 4 jogadores e 2×1 ↔ 3 jogadores', () => {
    expect(para('mata-mata', '2x2')).toBe('1x1x1x1');
    expect(para('mata-mata', '2x1')).toBe('1x1x1');
    expect(para('par-ou-impar', '1x1x1x1')).toBe('2x2');
    expect(para('par-ou-impar', '1x1x1')).toBe('2x1');
  });

  it('o atual fica mesmo que outro formato da nova tenha o mesmo número de lugares (2×1 e 3 jogadores têm 3 lugares)', () => {
    const doisComTres: Catalogo = { ...CATALOGO, modosDa: (m) => (m === 'mata-mata' ? (['1x1x1', '2x1'] as const) : CATALOGO.modosDa(m)) };
    expect(modoAoTrocarDeModalidade(doisComTres, 'mata-mata', '2x1')).toBe('2x1');
    expect(modoAoTrocarDeModalidade(doisComTres, 'mata-mata', '1x1x1')).toBe('1x1x1');
    // fora da lista, o primeiro com os mesmos lugares
    expect(modoAoTrocarDeModalidade({ ...doisComTres, modosDa: () => ['1x1x1', '2x1'] }, 'mata-mata', '2x2')).toBe('1x1x1');
  });

  it('só o que está disponível entra; se nenhum tem os mesmos lugares, o primeiro disponível, e sem nenhum o primeiro do catálogo', () => {
    const sem2x1 = (_m: Modalidade, modo: ModoSala): boolean => modo !== '2x1';
    expect(para('par-ou-impar', '1x1x1', sem2x1)).toBe('1x1');
    const nenhum = (): boolean => false;
    expect(para('mata-mata', '2x2', nenhum)).toBe('1x1');
  });
});

describe('tituloDoFormato e fraseDeQuemJoga', () => {
  it('o nome da sala usa o rótulo do formato e a modalidade', () => {
    expect(tituloDoFormato('par-ou-impar', '2x2')).toBe('Sala 2×2 · Par ou ímpar');
    expect(tituloDoFormato('mata-mata', '1x1x1x1')).toBe('Sala 4 jogadores · Mata-mata');
    expect(tituloDoFormato('mata-mata', '1x1x1')).toBe('Sala 3 jogadores · Mata-mata');
  });

  it('modo que a modalidade não tem cai no modo como veio', () => {
    expect(tituloDoFormato('par-ou-impar', '1x1x1')).toBe('Sala 1x1x1');
  });

  it('quem joga contra quem no mesmo PC, de cada formato', () => {
    expect(fraseDeQuemJoga(jogadoresDoHotSeat('1x1'))).toBe('Jogador 1 contra Jogador 2.');
    expect(fraseDeQuemJoga(jogadoresDoHotSeat('2x1'))).toBe('Jogador 1 e Jogador 3 contra o Jogador 2.');
    expect(fraseDeQuemJoga(jogadoresDoHotSeat('2x2'))).toBe('Jogador 1 e Jogador 3 contra Jogador 2 e Jogador 4.');
    expect(fraseDeQuemJoga(jogadoresDoHotSeat('1x1x1'))).toBe('Jogador 1, Jogador 2 e Jogador 3: cada um por si.');
    expect(fraseDeQuemJoga(jogadoresDoHotSeat('1x1x1x1'))).toBe('Jogador 1, Jogador 2, Jogador 3 e Jogador 4: cada um por si.');
  });

  it('a roda do mesmo PC vem do formato do protocolo: um jogador por lugar, a equipe do lugar', () => {
    for (const modo of MODOS_POR_MODALIDADE['par-ou-impar'].concat(MODOS_POR_MODALIDADE['mata-mata'])) {
      const roda: readonly Jogador[] = jogadoresDoHotSeat(modo);
      expect(roda.map((j) => j.equipe)).toEqual(FORMATO_DO_MODO[modo].equipes);
      expect(roda.map((j) => j.id)).toEqual(roda.map((_, i) => `j${i + 1}`));
    }
  });
});
