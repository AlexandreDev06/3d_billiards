import { describe, expect, it } from 'vitest';
import boteco from '../presets/boteco.json';
import mataMata from '../presets/mata-mata.json';
import { formacaoDosJogadores, formacoesAceitas, ROTULO_MODALIDADE, rotuloDaFormacao } from './modalidades';
import { novaPartida } from './partida';
import { config, configMataMata, DUPLAS, DOIS_CONTRA_UM, JOGADORES, QUARTETO, rngDeTeste, TRIO, UM_CONTRA_DOIS } from './para-testes';
import { OPCOES_REGRAS, PRESET_BOTECO, PRESET_MATA_MATA, PRESETS_DE_FABRICA, validarPreset } from './presets';
import type { ConfigRegras, Formacao, Jogador, Modalidade } from './tipos';

const MODALIDADES = OPCOES_REGRAS.modalidade;

/** A roda mais simples de uma formação: as equipes alternam; no mata-mata cada jogador é uma equipe. */
function rodaDe(formacao: Formacao): Jogador[] {
  const restam = [...formacao];
  const roda: Jogador[] = [];
  while (restam.some((r) => r > 0)) {
    restam.forEach((r, equipe) => {
      if (r > 0) roda.push({ id: `j${roda.length}`, nome: `Jogador ${roda.length}`, equipe });
      restam[equipe] = Math.max(0, r - 1);
    });
  }
  return roda;
}

describe('formacoesAceitas', () => {
  it('par ou ímpar: 1×1, 2×1, 1×2 e 2×2', () => {
    expect(formacoesAceitas(config())).toEqual([[1, 1], [2, 1], [1, 2], [2, 2]]);
  });

  it('mata-mata: 1×1, 1×1×1 e 1×1×1×1', () => {
    expect(formacoesAceitas(configMataMata())).toEqual([[1, 1], [1, 1, 1], [1, 1, 1, 1]]);
  });

  it('só depende da modalidade da config', () => {
    expect(formacoesAceitas({ modalidade: 'mata-mata' })).toEqual(formacoesAceitas(configMataMata({ penaDireta: 2 })));
    expect(formacoesAceitas(config({ bolas: '1-15', bolaFinal: 1 }))).toEqual(formacoesAceitas(config()));
  });

  it('toda modalidade tem formações e um nome para a tela', () => {
    for (const m of MODALIDADES) {
      expect(formacoesAceitas({ modalidade: m }).length, m).toBeGreaterThan(0);
      expect(ROTULO_MODALIDADE[m], m).not.toBe('');
    }
    expect(ROTULO_MODALIDADE).toEqual<Record<Modalidade, string>>({ 'par-ou-impar': 'Par ou ímpar', 'mata-mata': 'Mata-mata' });
  });

  it('cada formação aceita é uma lista de tamanhos positivos, sem repetir', () => {
    for (const m of MODALIDADES) {
      const lista = formacoesAceitas({ modalidade: m }).map(rotuloDaFormacao);
      expect(new Set(lista).size).toBe(lista.length);
      for (const f of formacoesAceitas({ modalidade: m })) expect(f.every((t) => Number.isInteger(t) && t > 0)).toBe(true);
    }
  });
});

describe('o catálogo e a novaPartida concordam', () => {
  it('toda formação do catálogo vira partida', () => {
    for (const m of MODALIDADES) {
      const c: ConfigRegras = m === 'mata-mata' ? configMataMata() : config();
      for (const f of formacoesAceitas(c)) {
        const roda = rodaDe(f);
        expect(() => novaPartida(c, roda, rngDeTeste(1)), `${m} ${rotuloDaFormacao(f)}`).not.toThrow();
        expect(formacaoDosJogadores(roda)).toEqual(f);
      }
    }
  });

  it('o que está fora do catálogo é recusado', () => {
    const fora: Formacao[] = [[1], [3, 1], [1, 3], [1, 1, 1, 1, 1], [2, 2, 1], [2, 1, 1]];
    for (const m of MODALIDADES) {
      const c: ConfigRegras = m === 'mata-mata' ? configMataMata() : config();
      const aceitas = formacoesAceitas(c).map(rotuloDaFormacao);
      for (const f of fora.filter((x) => !aceitas.includes(rotuloDaFormacao(x)))) {
        expect(() => novaPartida(c, rodaDe(f), rngDeTeste(1)), `${m} ${rotuloDaFormacao(f)}`).toThrow();
      }
    }
  });

  it('o mata-mata recusa o que é só do par ou ímpar, e o par ou ímpar o que é só do mata-mata', () => {
    for (const roda of [DOIS_CONTRA_UM, UM_CONTRA_DOIS, DUPLAS]) {
      expect(() => novaPartida(configMataMata(), roda, rngDeTeste(1))).toThrow(/mata-mata/i);
    }
    for (const roda of [TRIO, QUARTETO]) {
      expect(() => novaPartida(config(), roda, rngDeTeste(1))).toThrow();
    }
    expect(() => novaPartida(config(), JOGADORES, rngDeTeste(1))).not.toThrow();
    expect(() => novaPartida(configMataMata(), JOGADORES, rngDeTeste(1))).not.toThrow();
  });
});

describe('formacaoDosJogadores e rotuloDaFormacao', () => {
  const j = (equipe: number, i = 0): Jogador => ({ id: `${i}`, nome: `J${i}`, equipe });

  it('conta os jogadores de cada equipe, na ordem das equipes', () => {
    expect(formacaoDosJogadores([j(0, 0), j(1, 1), j(0, 2)])).toEqual([2, 1]);
    expect(formacaoDosJogadores([j(1, 0), j(0, 1), j(2, 2)])).toEqual([1, 1, 1]);
    expect(formacaoDosJogadores([])).toEqual([]);
  });

  it('equipe fora de 0 a N−1 (ou quebrada) não tem formação', () => {
    expect(formacaoDosJogadores([j(0, 0), j(2, 1)])).toBeNull();
    expect(formacaoDosJogadores([j(-1, 0), j(0, 1)])).toBeNull();
    expect(formacaoDosJogadores([j(0.5, 0), j(1, 1)])).toBeNull();
  });

  it('equipe vazia no meio aparece como zero e não é nenhuma formação aceita', () => {
    expect(formacaoDosJogadores([j(0, 0), j(0, 1), j(2, 2)])).toEqual([2, 0, 1]);
  });

  it('rotula com ×', () => {
    expect(rotuloDaFormacao([2, 1])).toBe('2×1');
    expect(rotuloDaFormacao([1, 1, 1])).toBe('1×1×1');
  });
});

describe('preset do mata-mata', () => {
  it('carrega, valida e é congelado', () => {
    expect(PRESET_MATA_MATA.nome).toBe('Mata-mata');
    expect(() => validarPreset(mataMata)).not.toThrow();
    expect(Object.isFrozen(PRESET_MATA_MATA)).toBe(true);
    expect(Object.isFrozen(PRESET_MATA_MATA.regras)).toBe(true);
  });

  it('as 15 bolas, sem bola final, e as respostas do usuário: nenhuma pendência', () => {
    expect(PRESET_MATA_MATA.regras).toMatchObject<Partial<ConfigRegras>>({ modalidade: 'mata-mata', bolas: '1-15', bolaFinal: 'ultima-do-grupo' });
    expect(PRESET_MATA_MATA.provisorio).toEqual([]);
  });

  it('tem as mesmas chaves do Boteco, e a modalidade é o que os separa', () => {
    expect(Object.keys(PRESET_MATA_MATA.regras).sort()).toEqual(Object.keys(PRESET_BOTECO.regras).sort());
    expect(PRESET_BOTECO.regras.modalidade).toBe('par-ou-impar');
    expect(boteco.regras.modalidade).toBe('par-ou-impar');
  });

  it('cada valor do preset é uma das opções', () => {
    for (const [chave, opcoes] of Object.entries(OPCOES_REGRAS)) {
      expect(opcoes, chave).toContain(PRESET_MATA_MATA.regras[chave as keyof ConfigRegras]);
    }
    expect(OPCOES_REGRAS.modalidade).toEqual(['par-ou-impar', 'mata-mata']);
  });

  it('os presets de fábrica são um por modalidade, o Boteco primeiro', () => {
    expect(PRESETS_DE_FABRICA).toEqual([PRESET_BOTECO, PRESET_MATA_MATA]);
    expect(PRESETS_DE_FABRICA.map((p) => p.regras.modalidade)).toEqual(MODALIDADES);
    expect(Object.isFrozen(PRESETS_DE_FABRICA)).toBe(true);
  });
});

describe('validarPreset com o mata-mata', () => {
  const comRegras = (mudanca: Record<string, unknown>) => ({ ...mataMata, regras: { ...mataMata.regras, ...mudanca } });

  it('recusa modalidade desconhecida ou faltando', () => {
    expect(() => validarPreset(comRegras({ modalidade: 'canastra' }))).toThrow(/regras\.modalidade/);
    const sem: Record<string, unknown> = { ...mataMata.regras };
    delete sem.modalidade;
    expect(() => validarPreset({ ...mataMata, regras: sem })).toThrow(/regras\.modalidade: falta/);
  });

  it('recusa outras bolas ou bola final: o mata-mata é das 15 sem bola final', () => {
    expect(() => validarPreset(comRegras({ bolas: '2-14' }))).toThrow(/regras\.bolas: o mata-mata joga com as 15 bolas/);
    expect(() => validarPreset(comRegras({ bolas: '2-15' }))).toThrow(/regras\.bolas/);
    expect(() => validarPreset(comRegras({ bolaFinal: 8 }))).toThrow(/regras\.bolaFinal: o mata-mata não tem bola final/);
    expect(() => validarPreset(comRegras({ bolaFinal: 1 }))).toThrow(/regras\.bolaFinal/);
    expect(() => validarPreset(comRegras({ bolas: '2-14', bolaFinal: 8 }))).toThrow(/regras\.bolas[\s\S]*regras\.bolaFinal/);
  });

  it('liga a pena do suicídio (L19) e aceita as duas opções: "sem-pena" e "perde-proxima-vez"', () => {
    expect(PRESET_MATA_MATA.regras.suicidioNoMataMata).toBe('perde-proxima-vez');
    expect(() => validarPreset(comRegras({ suicidioNoMataMata: 'sem-pena' }))).not.toThrow();
    expect(() => validarPreset(comRegras({ suicidioNoMataMata: 'perde-proxima-vez' }))).not.toThrow();
    expect(() => validarPreset(comRegras({ suicidioNoMataMata: 'perde-a-rodada' }))).toThrow(/regras\.suicidioNoMataMata/);
    const sem: Record<string, unknown> = { ...mataMata.regras };
    delete sem.suicidioNoMataMata;
    expect(() => validarPreset({ ...mataMata, regras: sem })).toThrow(/regras\.suicidioNoMataMata: falta/);
  });

  it('liga a pena de cegar (L21) e aceita as duas opções, cada uma sem depender da outra', () => {
    expect(PRESET_MATA_MATA.regras.cegarNoMataMata).toBe('perde-proxima-vez');
    expect(() => validarPreset(comRegras({ cegarNoMataMata: 'sem-pena' }))).not.toThrow();
    expect(() => validarPreset(comRegras({ cegarNoMataMata: 'perde-proxima-vez' }))).not.toThrow();
    expect(() => validarPreset(comRegras({ cegarNoMataMata: 'sem-pena', suicidioNoMataMata: 'perde-proxima-vez' }))).not.toThrow();
    expect(() => validarPreset(comRegras({ cegarNoMataMata: 'perde-proxima-vez', suicidioNoMataMata: 'sem-pena' }))).not.toThrow();
    expect(() => validarPreset(comRegras({ cegarNoMataMata: 'perde-a-rodada' }))).toThrow(/regras\.cegarNoMataMata/);
    const sem: Record<string, unknown> = { ...mataMata.regras };
    delete sem.cegarNoMataMata;
    expect(() => validarPreset({ ...mataMata, regras: sem })).toThrow(/regras\.cegarNoMataMata: falta/);
  });

  it('não cobra grupos do mesmo tamanho: as 15 sem bola final têm 8 ímpares e 7 pares', () => {
    expect(() => validarPreset(comRegras({}))).not.toThrow();
  });

  it('o par ou ímpar continua cobrando grupos iguais mesmo com as 15 bolas', () => {
    const comoBoteco = (mudanca: Record<string, unknown>) => ({ ...boteco, regras: { ...boteco.regras, ...mudanca } });
    expect(() => validarPreset(comoBoteco({ bolas: '1-15', bolaFinal: 'ultima-do-grupo' }))).toThrow(/8 ímpares contra 7 pares/);
  });
});
