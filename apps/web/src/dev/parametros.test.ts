import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO } from '@sinuca/fisica';
import type { ArmazenamentoMinimo } from '../armazenamento';
import { CONFIG_WEB } from '../config';
import {
  DESCRITORES,
  EstadoDoPainel,
  esquecerValores,
  fisicaDoPainel,
  jsonDoPainel,
  lerValoresSalvos,
  salvarValores,
  tacadaDoPainel,
  avisoDosSalvos,
  controleDoPainel,
  valoresPadrao,
  VERSAO_DOS_SALVOS,
  type ValoresDoPainel,
} from './parametros';

const PADRAO = valoresPadrao(CONFIG_FISICA_PADRAO, CONFIG_WEB.tacada, CONFIG_WEB.previsao);
/** Um atrito de rolamento diferente do padrão (que o Taco já mudou uma vez), na grade do slider. */
const OUTRO_ATRITO = PADRAO.atritoRolamento + 0.005;

function memoria(inicial: Record<string, string> = {}): ArmazenamentoMinimo & { dados: Map<string, string> } {
  const dados = new Map(Object.entries(inicial));
  return {
    dados,
    getItem: (c) => dados.get(c) ?? null,
    setItem: (c, v) => void dados.set(c, v),
    removeItem: (c) => void dados.delete(c),
  };
}

/** O que o botão "Lembrar" grava: a versão, os padrões de então e os valores. */
function lembrado(valores: Record<string, Record<string, unknown>>, padrao: ValoresDoPainel = PADRAO, versao = 2): string {
  return JSON.stringify({ versao, padrao: JSON.parse(jsonDoPainel(padrao)), valores });
}

describe('descritores do painel', () => {
  it('cobrem os 8 parâmetros de física, os 4 da curva de força, o controle de força e os 3 da linha de previsão', () => {
    const chaves = DESCRITORES.map((d) => d.chave).sort();
    expect(chaves).toEqual(
      [
        'atritoBolaTabela',
        'atritoDeslizamento',
        'atritoRolamento',
        'desaceleracaoGiro',
        'expoenteForca',
        'fatorEfeitoLateral',
        'forcaPorLinha',
        'forcaPrevisao',
        'previsaoBolaAtingida',
        'previsaoLigada',
        'restituicaoBolaBola',
        'restituicaoBolaTabela',
        'velocidadeEntradaMax',
        'velocidadeMax',
        'velocidadeMaxTaco',
        'velocidadeMin',
      ].sort(),
    );
  });

  it('o padrão de cada um cai dentro da faixa do seu slider (e na grade do passo)', () => {
    for (const d of DESCRITORES) {
      const v = PADRAO[d.chave];
      expect(v, d.chave).toBeGreaterThanOrEqual(d.min);
      expect(v, d.chave).toBeLessThanOrEqual(d.max);
      const passos = (v - d.min) / d.passo;
      expect(Math.abs(passos - Math.round(passos)), d.chave).toBeLessThan(1e-6);
    }
  });

  it('valoresPadrao lê da config de física e da config de tacada, sem número solto', () => {
    expect(PADRAO.atritoDeslizamento).toBe(CONFIG_FISICA_PADRAO.atritoDeslizamento);
    expect(PADRAO.velocidadeMaxTaco).toBe(CONFIG_FISICA_PADRAO.velocidadeMaxTaco);
    expect(PADRAO.expoenteForca).toBe(CONFIG_WEB.tacada.expoenteForca);
    expect(PADRAO.velocidadeEntradaMax).toBe(CONFIG_WEB.tacada.velocidadeEntradaMax);
  });

  it('o slider da força máxima começa na da config (metade do teto da física), separado do teto da física', () => {
    expect(PADRAO.velocidadeMax).toBe(CONFIG_WEB.tacada.velocidadeMax);
    expect(PADRAO.velocidadeMax).toBe(CONFIG_FISICA_PADRAO.velocidadeMaxTaco / 2);
    expect(PADRAO.velocidadeMaxTaco).toBe(CONFIG_FISICA_PADRAO.velocidadeMaxTaco);
  });

  it('valoresPadrao lê a previsão da config: força, e as duas linhas como 1 (ligada) ou 0; de fábrica começam desligadas', () => {
    expect(PADRAO.forcaPrevisao).toBe(CONFIG_WEB.previsao.velocidadeTaco);
    expect(PADRAO.previsaoLigada).toBe(0);
    expect(PADRAO.previsaoBolaAtingida).toBe(0);
    const ligada = valoresPadrao(CONFIG_FISICA_PADRAO, CONFIG_WEB.tacada, { ...CONFIG_WEB.previsao, ligada: true, bolaAtingida: true });
    expect(ligada.previsaoLigada).toBe(1);
    expect(ligada.previsaoBolaAtingida).toBe(1);
  });

  it('as duas linhas são interruptores (0 ou 1), a força é slider', () => {
    const tipo = (c: string) => DESCRITORES.find((d) => d.chave === c)!.tipo;
    expect(tipo('previsaoLigada')).toBe('chave');
    expect(tipo('previsaoBolaAtingida')).toBe('chave');
    expect(tipo('forcaPrevisao')).toBeUndefined();
  });
});

describe('config efetiva', () => {
  it('fisicaDoPainel troca só os parâmetros do painel e não mexe na base', () => {
    const base = CONFIG_FISICA_PADRAO;
    const cfg = fisicaDoPainel(base, { ...PADRAO, atritoDeslizamento: 0.33, restituicaoBolaTabela: 0.7 });
    expect(cfg.atritoDeslizamento).toBe(0.33);
    expect(cfg.restituicaoBolaTabela).toBe(0.7);
    expect(cfg.atritoRolamento).toBe(base.atritoRolamento);
    expect(cfg.mesa).toBe(base.mesa);
    expect(cfg.passo).toBe(base.passo);
    expect(base.atritoDeslizamento).toBe(0.2);
  });

  it('tacadaDoPainel troca a curva de força; o teto dela é o slider da força máxima, não o da física', () => {
    const base = CONFIG_WEB.tacada;
    const cfg = tacadaDoPainel(base, { ...PADRAO, expoenteForca: 2.2, velocidadeEntradaMax: 6, velocidadeMax: 5.5, velocidadeMaxTaco: 9 });
    expect(cfg.expoenteForca).toBe(2.2);
    expect(cfg.velocidadeEntradaMax).toBe(6);
    expect(cfg.velocidadeMax).toBe(5.5);
    expect(cfg.metrosPorPixel).toBe(base.metrosPorPixel);
    expect(base.expoenteForca).toBe(1.6);
  });

  it('com o painel nos valores de fábrica a curva é a da config, e o teto da física só vai para a física', () => {
    expect(tacadaDoPainel(CONFIG_WEB.tacada, PADRAO)).toEqual(CONFIG_WEB.tacada);
    expect(fisicaDoPainel(CONFIG_FISICA_PADRAO, { ...PADRAO, velocidadeMaxTaco: 10 }).velocidadeMaxTaco).toBe(10);
    expect(tacadaDoPainel(CONFIG_WEB.tacada, { ...PADRAO, velocidadeMaxTaco: 10 }).velocidadeMax).toBe(CONFIG_WEB.tacada.velocidadeMax);
  });

  it('valores lembrados sem a chave nova (a força máxima) voltam com a da config', () => {
    const lido = lerValoresSalvos(PADRAO, memoria({ 'sinuca.painel-dev': lembrado({ fisica: { velocidadeMaxTaco: 8 }, forca: { expoenteForca: 1.6 } }) }));
    expect(lido?.valores.velocidadeMax).toBe(CONFIG_WEB.tacada.velocidadeMax);
  });
});

describe('efeito lateral no painel (fatorEfeitoLateral)', () => {
  const descritor = DESCRITORES.find((d) => d.chave === 'fatorEfeitoLateral')!;

  it('é um slider de 0,2 a 1 na seção de física, e o padrão é o da física (0,6)', () => {
    expect(descritor).toMatchObject({ grupo: 'fisica', min: 0.2, max: 1 });
    expect(descritor.tipo).toBeUndefined();
    expect(PADRAO.fatorEfeitoLateral).toBe(CONFIG_FISICA_PADRAO.fatorEfeitoLateral);
    expect(PADRAO.fatorEfeitoLateral).toBeGreaterThan(descritor.min);
    expect(PADRAO.fatorEfeitoLateral).toBeLessThan(descritor.max);
  });

  it('vai para a config de física da próxima tacada', () => {
    const cfg = fisicaDoPainel(CONFIG_FISICA_PADRAO, { ...PADRAO, fatorEfeitoLateral: 0.9 });
    expect(cfg.fatorEfeitoLateral).toBe(0.9);
    expect(cfg.atritoRolamento).toBe(CONFIG_FISICA_PADRAO.atritoRolamento);
    expect(fisicaDoPainel(CONFIG_FISICA_PADRAO, PADRAO)).toEqual(CONFIG_FISICA_PADRAO);
  });

  it('o estado corta o valor nas pontas da faixa', () => {
    const estado = new EstadoDoPainel(PADRAO);
    estado.definir('fatorEfeitoLateral', 0);
    expect(estado.valores.fatorEfeitoLateral).toBe(0.2);
    estado.definir('fatorEfeitoLateral', 3);
    expect(estado.valores.fatorEfeitoLateral).toBe(1);
  });

  it('aparece no JSON copiado, na física, e volta de um valor lembrado', () => {
    expect(JSON.parse(jsonDoPainel({ ...PADRAO, fatorEfeitoLateral: 0.85 })).fisica.fatorEfeitoLateral).toBe(0.85);
    const lido = lerValoresSalvos(PADRAO, memoria({ 'sinuca.painel-dev': lembrado({ fisica: { fatorEfeitoLateral: 0.85 } }) }));
    expect(lido?.valores.fatorEfeitoLateral).toBe(0.85);
  });

  it('valor lembrado antes de o slider existir (sem a chave) não atrapalha: vale o padrão', () => {
    const semAChave = JSON.parse(jsonDoPainel(PADRAO)).fisica as Record<string, number>;
    delete semAChave['fatorEfeitoLateral'];
    const lido = lerValoresSalvos(PADRAO, memoria({ 'sinuca.painel-dev': lembrado({ fisica: semAChave }) }));
    expect(lido?.valores.fatorEfeitoLateral).toBe(PADRAO.fatorEfeitoLateral);
    expect(lido?.antigo).toBe(false);
  });
});

describe('EstadoDoPainel', () => {
  it('começa no padrão, sem alteração', () => {
    const estado = new EstadoDoPainel(PADRAO);
    expect(estado.valores).toEqual(PADRAO);
    expect(estado.alterado).toBe(false);
  });

  it('definir muda o valor, marca alterado e avisa uma vez', () => {
    const estado = new EstadoDoPainel(PADRAO);
    const avisos: number[] = [];
    estado.aoMudar((v) => avisos.push(v.atritoRolamento));
    estado.definir('atritoRolamento', OUTRO_ATRITO);
    estado.definir('atritoRolamento', OUTRO_ATRITO);
    expect(estado.valores.atritoRolamento).toBe(OUTRO_ATRITO);
    expect(estado.alterado).toBe(true);
    expect(avisos).toEqual([OUTRO_ATRITO]);
  });

  it('definir respeita a faixa do slider e ignora valor inválido', () => {
    const estado = new EstadoDoPainel(PADRAO);
    const d = DESCRITORES.find((x) => x.chave === 'restituicaoBolaBola')!;
    estado.definir('restituicaoBolaBola', 5);
    expect(estado.valores.restituicaoBolaBola).toBe(d.max);
    estado.definir('restituicaoBolaBola', -5);
    expect(estado.valores.restituicaoBolaBola).toBe(d.min);
    estado.definir('restituicaoBolaBola', Number.NaN);
    expect(estado.valores.restituicaoBolaBola).toBe(d.min);
  });

  it('interruptor só tem dois valores: o que vier é arredondado para 0 ou 1', () => {
    const estado = new EstadoDoPainel(PADRAO);
    estado.definir('previsaoLigada', 0.2);
    expect(estado.valores.previsaoLigada).toBe(0);
    estado.definir('previsaoLigada', 0.7);
    expect(estado.valores.previsaoLigada).toBe(1);
    estado.definir('previsaoLigada', 5);
    expect(estado.valores.previsaoLigada).toBe(1);
    estado.definir('previsaoLigada', -3);
    expect(estado.valores.previsaoLigada).toBe(0);
  });

  it('alternar vira o interruptor, avisa, e ignora quem é slider', () => {
    const estado = new EstadoDoPainel(PADRAO);
    const avisos: number[] = [];
    estado.aoMudar((v) => avisos.push(v.previsaoLigada));
    estado.alternar('previsaoLigada');
    expect(estado.valores.previsaoLigada).toBe(1);
    estado.alternar('previsaoLigada');
    expect(estado.valores.previsaoLigada).toBe(0);
    expect(avisos).toEqual([1, 0]);
    estado.alternar('atritoRolamento');
    estado.alternar('forcaPrevisao');
    expect(estado.valores.atritoRolamento).toBe(PADRAO.atritoRolamento);
    expect(estado.valores.forcaPrevisao).toBe(PADRAO.forcaPrevisao);
    expect(avisos).toHaveLength(2);
  });

  it('restaurar volta ao padrão e avisa só se havia o que desfazer', () => {
    const estado = new EstadoDoPainel(PADRAO);
    let avisos = 0;
    estado.aoMudar(() => avisos++);
    estado.restaurar();
    expect(avisos).toBe(0);
    estado.definir('desaceleracaoGiro', 12);
    estado.restaurar();
    expect(estado.valores).toEqual(PADRAO);
    expect(estado.alterado).toBe(false);
    expect(avisos).toBe(2);
  });

  it('pode começar de valores já salvos', () => {
    const estado = new EstadoDoPainel(PADRAO, { ...PADRAO, atritoBolaTabela: 0.3 });
    expect(estado.valores.atritoBolaTabela).toBe(0.3);
    expect(estado.alterado).toBe(true);
    estado.restaurar();
    expect(estado.valores.atritoBolaTabela).toBe(PADRAO.atritoBolaTabela);
  });

  it('quem desinscreveu não é mais avisado', () => {
    const estado = new EstadoDoPainel(PADRAO);
    let avisos = 0;
    const parar = estado.aoMudar(() => avisos++);
    parar();
    estado.definir('atritoRolamento', OUTRO_ATRITO);
    expect(avisos).toBe(0);
  });
});

describe('controle de força no painel', () => {
  it('o padrão do painel é a força pela linha, e dá para começar pelo empurrar', () => {
    expect(PADRAO.forcaPorLinha).toBe(1);
    expect(controleDoPainel(PADRAO)).toBe('linha');
    const empurrar = valoresPadrao(CONFIG_FISICA_PADRAO, CONFIG_WEB.tacada, CONFIG_WEB.previsao, 'empurrar');
    expect(empurrar.forcaPorLinha).toBe(0);
    expect(controleDoPainel(empurrar)).toBe('empurrar');
  });

  it('é um interruptor: alternar vira entre linha e empurrar, sem sair de 0 ou 1', () => {
    const estado = new EstadoDoPainel(PADRAO);
    estado.alternar('forcaPorLinha');
    expect(controleDoPainel(estado.valores)).toBe('empurrar');
    estado.alternar('forcaPorLinha');
    expect(controleDoPainel(estado.valores)).toBe('linha');
    estado.definir('forcaPorLinha', 0.4);
    expect(estado.valores.forcaPorLinha).toBe(0);
    estado.definir('forcaPorLinha', 7);
    expect(estado.valores.forcaPorLinha).toBe(1);
  });

  it('o que o painel lembrou de antes, sem o controle, continua valendo e o controle vem do padrão', () => {
    const lido = lerValoresSalvos(PADRAO, memoria({ 'sinuca.painel-dev': lembrado({ fisica: { atritoRolamento: PADRAO.atritoRolamento } }) }))!;
    expect(lido.antigo).toBe(false);
    expect(lido.valores.forcaPorLinha).toBe(1);
  });

  it('lembrar o empurrar e abrir de novo mantém o empurrar', () => {
    const arm = memoria();
    salvarValores({ ...PADRAO, forcaPorLinha: 0 }, PADRAO, arm);
    expect(controleDoPainel(lerValoresSalvos(PADRAO, arm)!.valores)).toBe('empurrar');
  });
});

describe('JSON do painel', () => {
  it('agrupa em fisica, forca e previsao e traz os 16 valores', () => {
    const json = JSON.parse(jsonDoPainel({ ...PADRAO, atritoDeslizamento: 0.25 })) as {
      fisica: Record<string, number>;
      forca: Record<string, number>;
      previsao: Record<string, number>;
    };
    expect(Object.keys(json.fisica)).toHaveLength(8);
    expect(Object.keys(json.forca).sort()).toEqual(['expoenteForca', 'forcaPorLinha', 'velocidadeEntradaMax', 'velocidadeMax', 'velocidadeMin']);
    expect(Object.keys(json.previsao).sort()).toEqual(['forcaPrevisao', 'previsaoBolaAtingida', 'previsaoLigada']);
    expect(json.fisica.atritoDeslizamento).toBe(0.25);
    expect(json.forca.expoenteForca).toBe(PADRAO.expoenteForca);
  });
});

describe('lembrar no localStorage', () => {
  it('salvar e ler devolve os mesmos valores, sem nada descartado', () => {
    const arm = memoria();
    const valores = { ...PADRAO, atritoDeslizamento: 0.27, expoenteForca: 2 };
    expect(salvarValores(valores, PADRAO, arm)).toBe(true);
    const lido = lerValoresSalvos(PADRAO, arm)!;
    expect(lido.valores).toEqual(valores);
    expect(lido.descartados).toEqual([]);
    expect(lido.antigo).toBe(false);
  });

  it('a previsão desligada e a força escolhida também são lembradas', () => {
    const arm = memoria();
    salvarValores({ ...PADRAO, previsaoLigada: 0, previsaoBolaAtingida: 0, forcaPrevisao: 5.5 }, PADRAO, arm);
    const lido = lerValoresSalvos(PADRAO, arm)!.valores;
    expect(lido.previsaoLigada).toBe(0);
    expect(lido.previsaoBolaAtingida).toBe(0);
    expect(lido.forcaPrevisao).toBe(5.5);
  });

  it('interruptor salvo com valor estranho volta como 0 ou 1', () => {
    const arm = memoria({ 'sinuca.painel-dev': lembrado({ previsao: { previsaoLigada: 0.4, previsaoBolaAtingida: 7 } }) });
    const lido = lerValoresSalvos(PADRAO, arm)!.valores;
    expect(lido.previsaoLigada).toBe(0);
    expect(lido.previsaoBolaAtingida).toBe(1);
  });

  it('o que foi salvo leva a versão, os padrões de agora e os valores no mesmo formato do JSON copiado', () => {
    const arm = memoria();
    const valores = { ...PADRAO, velocidadeMin: 0.1 };
    salvarValores(valores, PADRAO, arm);
    const bruto = JSON.parse(arm.dados.get('sinuca.painel-dev')!);
    expect(bruto.versao).toBe(VERSAO_DOS_SALVOS);
    expect(bruto.padrao).toEqual(JSON.parse(jsonDoPainel(PADRAO)));
    expect(bruto.valores).toEqual(JSON.parse(jsonDoPainel(valores)));
  });

  it('sem nada salvo devolve null (e não "padrão", para o chamador saber)', () => {
    expect(lerValoresSalvos(PADRAO, memoria())).toBeNull();
  });

  it('JSON corrompido ou que não é objeto devolve null', () => {
    expect(lerValoresSalvos(PADRAO, memoria({ 'sinuca.painel-dev': '{quebrado' }))).toBeNull();
    expect(lerValoresSalvos(PADRAO, memoria({ 'sinuca.painel-dev': '42' }))).toBeNull();
    expect(lerValoresSalvos(PADRAO, memoria({ 'sinuca.painel-dev': 'null' }))).toBeNull();
  });

  it('chave faltando vem do padrão, chave desconhecida some, número fora da faixa é cortado', () => {
    const d = DESCRITORES.find((x) => x.chave === 'atritoDeslizamento')!;
    const arm = memoria({
      'sinuca.painel-dev': lembrado({ fisica: { atritoDeslizamento: 99, gravidade: 1 }, forca: { expoenteForca: 'x' }, extra: { a: 1 } }),
    });
    const lido = lerValoresSalvos(PADRAO, arm)!.valores;
    expect(lido.atritoDeslizamento).toBe(d.max);
    expect(lido.atritoRolamento).toBe(PADRAO.atritoRolamento);
    expect(lido.expoenteForca).toBe(PADRAO.expoenteForca);
    expect('gravidade' in lido).toBe(false);
    expect(Object.keys(lido).sort()).toEqual(DESCRITORES.map((x) => x.chave).sort());
  });

  it('armazenamento bloqueado: salvar devolve false, ler devolve null, nada lança', () => {
    const bloqueado: ArmazenamentoMinimo = {
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {
        throw new Error('bloqueado');
      },
      removeItem() {
        throw new Error('bloqueado');
      },
    };
    expect(salvarValores(PADRAO, PADRAO, bloqueado)).toBe(false);
    expect(lerValoresSalvos(PADRAO, bloqueado)).toBeNull();
    expect(esquecerValores(bloqueado)).toBe(false);
  });

  it('esquecer apaga o que foi lembrado', () => {
    const arm = memoria();
    salvarValores(PADRAO, PADRAO, arm);
    esquecerValores(arm);
    expect(lerValoresSalvos(PADRAO, arm)).toBeNull();
  });
});

describe('lembrar com versão: o padrão mudou, o salvo antigo não vale por cima', () => {
  /** O padrão de quando o jogador lembrou: o atrito de rolamento era 0,01 e a força máxima 8. */
  const PADRAO_ANTIGO: ValoresDoPainel = { ...PADRAO, atritoRolamento: 0.01, velocidadeMax: 8 };

  it('valor que o jogador mexeu e cujo padrão mudou depois é descartado, com a chave no aviso, e vale o padrão novo', () => {
    const arm = memoria();
    salvarValores({ ...PADRAO_ANTIGO, atritoRolamento: 0.03, expoenteForca: 2 }, PADRAO_ANTIGO, arm);
    const lido = lerValoresSalvos(PADRAO, arm)!;
    expect(lido.descartados).toEqual(['atritoRolamento']);
    expect(lido.valores.atritoRolamento).toBe(PADRAO.atritoRolamento);
    expect(lido.valores.expoenteForca).toBe(2);
    expect(lido.antigo).toBe(false);
  });

  it('valor que era só o padrão de então (o jogador não mexeu) some sem aviso: vale o padrão novo', () => {
    const arm = memoria();
    salvarValores({ ...PADRAO_ANTIGO, expoenteForca: 2 }, PADRAO_ANTIGO, arm);
    const lido = lerValoresSalvos(PADRAO, arm)!;
    expect(lido.descartados).toEqual([]);
    expect(lido.valores.atritoRolamento).toBe(PADRAO.atritoRolamento);
    expect(lido.valores.velocidadeMax).toBe(PADRAO.velocidadeMax);
    expect(lido.valores.expoenteForca).toBe(2);
  });

  it('só as chaves cujo padrão mudou são descartadas; as outras ficam como o jogador deixou', () => {
    const arm = memoria();
    salvarValores({ ...PADRAO_ANTIGO, atritoRolamento: 0.03, velocidadeMax: 6, atritoDeslizamento: 0.27 }, PADRAO_ANTIGO, arm);
    const lido = lerValoresSalvos(PADRAO, arm)!;
    expect([...lido.descartados].sort()).toEqual(['atritoRolamento', 'velocidadeMax']);
    expect(lido.valores.atritoDeslizamento).toBe(0.27);
  });

  it('padrão igual ao de quando lembrou: tudo vale, nada é descartado', () => {
    const arm = memoria();
    const valores = { ...PADRAO, atritoRolamento: 0.045, forcaPrevisao: 5 };
    salvarValores(valores, PADRAO, arm);
    const lido = lerValoresSalvos(PADRAO, arm)!;
    expect(lido.valores).toEqual(valores);
    expect(lido.descartados).toEqual([]);
  });

  it('formato antigo (sem versão, como o painel gravava antes): tudo descartado, vale o padrão, e diz que era antigo', () => {
    const antigo = { fisica: { atritoRolamento: 0.03, velocidadeMaxTaco: 8 }, forca: { expoenteForca: 1.6 } };
    const lido = lerValoresSalvos(PADRAO, memoria({ 'sinuca.painel-dev': JSON.stringify(antigo) }))!;
    expect(lido.antigo).toBe(true);
    expect(lido.valores).toEqual(PADRAO);
  });

  it('versão que este código não conhece (de um painel mais novo): descartada como a antiga', () => {
    const arm = memoria({ 'sinuca.painel-dev': lembrado({ fisica: { atritoRolamento: 0.03 } }, PADRAO, 99) });
    const lido = lerValoresSalvos(PADRAO, arm)!;
    expect(lido.antigo).toBe(true);
    expect(lido.valores).toEqual(PADRAO);
  });

  it('o padrão que veio salvo sem a chave (um slider novo): o valor lembrado dela não existe, vale o padrão', () => {
    const arm = memoria({ 'sinuca.painel-dev': JSON.stringify({ versao: VERSAO_DOS_SALVOS, padrao: { fisica: { atritoRolamento: 0.02 } }, valores: { fisica: { atritoRolamento: 0.03, atritoDeslizamento: 0.27 } } }) });
    const lido = lerValoresSalvos(PADRAO, arm)!;
    // A chave cujo padrão não foi guardado não dá para conferir: o valor dela não vale.
    expect(lido.valores.atritoDeslizamento).toBe(PADRAO.atritoDeslizamento);
  });
});

describe('avisoDosSalvos: o que o painel diz do que descartou', () => {
  it('sem leitura (nada lembrado) ou sem descarte, nada a dizer', () => {
    expect(avisoDosSalvos(null)).toBe('');
    expect(avisoDosSalvos({ valores: PADRAO, descartados: [], antigo: false })).toBe('');
  });

  it('formato antigo: diz que os valores eram de uma versão antiga e que voltou o padrão', () => {
    expect(avisoDosSalvos({ valores: PADRAO, descartados: [], antigo: true })).toMatch(/versão antiga.*padrão/i);
  });

  it('chaves descartadas: cita o nome de cada uma e diz que vale o padrão novo', () => {
    const aviso = avisoDosSalvos({ valores: PADRAO, descartados: ['atritoRolamento', 'velocidadeMax'], antigo: false });
    expect(aviso).toContain('Atrito de rolamento');
    expect(aviso).toContain('Força máxima');
    expect(aviso).toMatch(/padrão/i);
  });
});
