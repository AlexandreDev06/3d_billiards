import { describe, expect, it } from 'vitest';
import boteco from '../presets/boteco.json';
import { OPCOES_REGRAS, PRESET_BOTECO, validarPreset } from './presets';
import type { ConfigRegras } from './tipos';

const comRegras = (mudanca: Record<string, unknown>) => ({ ...boteco, regras: { ...boteco.regras, ...mudanca } });

describe('preset Boteco', () => {
  it('carrega e valida', () => {
    expect(PRESET_BOTECO.nome).toBe('Boteco');
    expect(() => validarPreset(boteco)).not.toThrow();
  });

  it('traz a resposta do usuário (2026-10-09): a 8 é a final, sem a 1 e a 15, começando no centro do triângulo', () => {
    expect(PRESET_BOTECO.regras).toMatchObject<Partial<ConfigRegras>>({
      bolas: '2-14',
      bolaFinal: 8,
      castigoInicio: 'centro-triangulo',
      castigoLugar: 'marca-pe',
      castigoNaSaida: 'volta',
      castigoQuando: 'tacada-separada',
      castigoAntesDaHora: 'derrota',
    });
  });

  it('traz os valores fechados do estudo §1', () => {
    expect(PRESET_BOTECO.regras).toMatchObject<Partial<ConfigRegras>>({
      castigoQuando: 'tacada-separada',
      definicaoGrupo: 'primeira-encacapada',
      saidaComDoisGrupos: 'vale-primeira-perde-vez',
      penaBola: 'menor-do-adversario',
      penaDireta: 1,
      penaDupla: false,
      brancaAposSuicidio: 'marca-saida',
    });
  });

  it('traz o que o motor já fazia antes de virar chave (L3b)', () => {
    expect(PRESET_BOTECO.regras).toMatchObject<Partial<ConfigRegras>>({
      bolaForaDaMesa: 'sem-falta',
      ultimaPorPenaOuAdversario: 'vence',
      penaInvertidaBola: 'menor',
    });
  });

  it('o suicídio do mata-mata está desligado: no par ou ímpar a falta já tem a pena das bolas (L19)', () => {
    expect(PRESET_BOTECO.regras.suicidioNoMataMata).toBe('sem-pena');
    expect(OPCOES_REGRAS.suicidioNoMataMata).toEqual(['sem-pena', 'perde-proxima-vez']);
    expect(PRESET_BOTECO.provisorio).not.toContain('suicidioNoMataMata');
  });

  it('cegar no mata-mata também está desligado: no par ou ímpar cegar já paga bola (L21)', () => {
    expect(PRESET_BOTECO.regras.cegarNoMataMata).toBe('sem-pena');
    expect(OPCOES_REGRAS.cegarNoMataMata).toEqual(['sem-pena', 'perde-proxima-vez']);
    expect(PRESET_BOTECO.provisorio).not.toContain('cegarNoMataMata');
  });

  it('duplas: A1 → B1 → A2 → B2 e quem encaçapa continua (proposta do estudo §1)', () => {
    expect(PRESET_BOTECO.regras).toMatchObject<Partial<ConfigRegras>>({ ordemDaVez: 'alternada', quemContinua: 'mesmo-jogador' });
  });

  it('marca como provisório o que o estudo não fecha', () => {
    expect(PRESET_BOTECO.provisorio).toEqual(
      expect.arrayContaining([
        'castigoLugar',
        'castigoNaSaida',
        'penaDireta',
        'penaSemGrupo',
        'castigoPrimeiroMesaAberta',
        'castigoEBrancaJuntos',
        'castigoComFalta',
        'bolaDevolvidaLugar',
        'bolaForaDaMesa',
        'ultimaPorPenaOuAdversario',
        'penaInvertidaBola',
        'ordemDaVez',
        'quemContinua',
      ]),
    );
  });

  it('as bolas já foram respondidas pelo usuário: não são mais provisórias', () => {
    expect(PRESET_BOTECO.provisorio).not.toContain('bolas');
    expect(PRESET_BOTECO.provisorio).not.toContain('bolaFinal');
  });

  it('não pode ser mudado por quem o importa', () => {
    expect(Object.isFrozen(PRESET_BOTECO)).toBe(true);
    expect(Object.isFrozen(PRESET_BOTECO.regras)).toBe(true);
    expect(Object.isFrozen(PRESET_BOTECO.provisorio)).toBe(true);
  });
});

describe('OPCOES_REGRAS', () => {
  it('cobre exatamente as chaves do preset, e o valor do Boteco é uma das opções', () => {
    expect(Object.keys(OPCOES_REGRAS).sort()).toEqual(Object.keys(PRESET_BOTECO.regras).sort());
    for (const [chave, opcoes] of Object.entries(OPCOES_REGRAS)) {
      expect(opcoes).toContain(PRESET_BOTECO.regras[chave as keyof ConfigRegras]);
    }
  });
});

describe('validarPreset', () => {
  it('recusa o que não é objeto', () => {
    expect(() => validarPreset(null)).toThrow('preset inválido');
    expect(() => validarPreset('boteco')).toThrow('preset inválido');
  });

  it('recusa valor fora das opções, dizendo a chave', () => {
    expect(() => validarPreset(comRegras({ penaDireta: 3 }))).toThrow(/regras\.penaDireta/);
    expect(() => validarPreset(comRegras({ bolas: '0-15' }))).toThrow(/regras\.bolas/);
  });

  it('recusa chave faltando ou desconhecida', () => {
    const semBolas: Record<string, unknown> = { ...boteco.regras };
    delete semBolas.bolas;
    expect(() => validarPreset({ ...boteco, regras: semBolas })).toThrow(/regras\.bolas: falta/);
    expect(() => validarPreset(comRegras({ penaTripla: true }))).toThrow(/regras\.penaTripla: chave desconhecida/);
  });

  it('aceita as três casas de bolas: 2-14 com a 8, 1-15 com a 1 e 2-15 sem bola final', () => {
    expect(() => validarPreset(comRegras({ bolas: '1-15', bolaFinal: 1 }))).not.toThrow();
    expect(() => validarPreset(comRegras({ bolas: '2-15', bolaFinal: 'ultima-do-grupo' }))).not.toThrow();
  });

  it('recusa bola final fora das bolas da casa', () => {
    expect(() => validarPreset(comRegras({ bolas: '2-15', bolaFinal: 1 }))).toThrow(/regras\.bolaFinal: a 1 não está entre as bolas 2-15/);
    expect(() => validarPreset(comRegras({ bolas: '2-14', bolaFinal: 1 }))).toThrow(/regras\.bolaFinal/);
  });

  it('recusa grupos de tamanhos diferentes', () => {
    expect(() => validarPreset(comRegras({ bolas: '2-15', bolaFinal: 8 }))).toThrow(/regras\.bolas: 7 ímpares contra 6 pares/);
    expect(() => validarPreset(comRegras({ bolas: '2-14', bolaFinal: 'ultima-do-grupo' }))).toThrow(/6 ímpares contra 7 pares/);
    expect(() => validarPreset(comRegras({ bolas: '1-15', bolaFinal: 8 }))).toThrow(/8 ímpares contra 6 pares/);
    expect(() => validarPreset(comRegras({ bolas: '1-15', bolaFinal: 'ultima-do-grupo' }))).toThrow(/8 ímpares contra 7 pares/);
  });

  it('recusa a pena do suicídio do mata-mata no par ou ímpar: ligada ali não faria nada', () => {
    expect(() => validarPreset(comRegras({ suicidioNoMataMata: 'perde-proxima-vez' }))).toThrow(
      /regras\.suicidioNoMataMata: "perde-proxima-vez" só vale no mata-mata/,
    );
    expect(() => validarPreset(comRegras({ suicidioNoMataMata: 'sem-pena' }))).not.toThrow();
    expect(() => validarPreset(comRegras({ suicidioNoMataMata: 'perde-a-rodada' }))).toThrow(/regras\.suicidioNoMataMata: "perde-a-rodada" não é uma de/);
  });

  it('recusa cegar com pena no par ou ímpar: ligada ali não faria nada', () => {
    expect(() => validarPreset(comRegras({ cegarNoMataMata: 'perde-proxima-vez' }))).toThrow(
      /regras\.cegarNoMataMata: "perde-proxima-vez" só vale no mata-mata/,
    );
    expect(() => validarPreset(comRegras({ cegarNoMataMata: 'sem-pena' }))).not.toThrow();
    expect(() => validarPreset(comRegras({ cegarNoMataMata: 'perde-a-rodada' }))).toThrow(/regras\.cegarNoMataMata: "perde-a-rodada" não é uma de/);
  });

  it('cada pena do mata-mata é recusada por si, e as duas juntas aparecem as duas no erro', () => {
    expect(() => validarPreset(comRegras({ cegarNoMataMata: 'perde-proxima-vez' }))).not.toThrow(/suicidioNoMataMata/);
    expect(() => validarPreset(comRegras({ suicidioNoMataMata: 'perde-proxima-vez' }))).not.toThrow(/cegarNoMataMata/);
    expect(() => validarPreset(comRegras({ suicidioNoMataMata: 'perde-proxima-vez', cegarNoMataMata: 'perde-proxima-vez' }))).toThrow(
      /regras\.suicidioNoMataMata: "perde-proxima-vez" só vale no mata-mata[\s\S]*regras\.cegarNoMataMata: "perde-proxima-vez" só vale no mata-mata/,
    );
  });

  it('recusa chave faltando: o preset diz o que fazer com o suicídio, mesmo no Boteco', () => {
    const sem: Record<string, unknown> = { ...boteco.regras };
    delete sem.suicidioNoMataMata;
    expect(() => validarPreset({ ...boteco, regras: sem })).toThrow(/regras\.suicidioNoMataMata: falta/);
    const semCegar: Record<string, unknown> = { ...boteco.regras };
    delete semCegar.cegarNoMataMata;
    expect(() => validarPreset({ ...boteco, regras: semCegar })).toThrow(/regras\.cegarNoMataMata: falta/);
  });

  it('junta a pena ligada fora do mata-mata com as outras incoerências', () => {
    expect(() => validarPreset(comRegras({ bolas: '2-15', bolaFinal: 1, suicidioNoMataMata: 'perde-proxima-vez' }))).toThrow(
      /regras\.bolaFinal: a 1 não está entre as bolas 2-15[\s\S]*regras\.suicidioNoMataMata/,
    );
    expect(() => validarPreset(comRegras({ bolas: '1-15', bolaFinal: 8, suicidioNoMataMata: 'perde-proxima-vez' }))).toThrow(
      /regras\.bolas: 8 ímpares contra 6 pares[\s\S]*regras\.suicidioNoMataMata/,
    );
  });

  it('recusa provisório que não é chave das regras', () => {
    expect(() => validarPreset({ ...boteco, provisorio: ['inventada'] })).toThrow(/provisorio/);
  });

  it('recusa sem nome', () => {
    expect(() => validarPreset({ ...boteco, nome: '' })).toThrow(/nome/);
  });

  it('junta todos os erros numa mensagem só', () => {
    expect(() => validarPreset({ ...comRegras({ penaDireta: 3, bolas: 'x' }), nome: 1 })).toThrow(
      /nome[\s\S]*regras\.bolas[\s\S]*regras\.penaDireta/,
    );
  });
});
