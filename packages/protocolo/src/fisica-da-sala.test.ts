/** A física da sala (L38): o dado, o padrão que bate com a física, `sanear` (corta à faixa, descarta o resto) e os esquemas das mensagens. */
import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO } from '@sinuca/fisica';
import { exemplosDeMensagens, type Solto } from './para-testes';
import { validarMensagemDaSala, validarMensagemDoCliente } from './esquemas';
import { decodificarMensagemDoCliente } from './fio';
import {
  CHAVES_DA_FISICA_DA_SALA,
  FAIXAS_DA_FISICA_DA_SALA,
  FISICA_DA_SALA_PADRAO,
  completarFisicaDaSala,
  fisicaDiferenteDoPadrao,
  sanearFisicaDaSala,
} from './fisica-da-sala';

const { sala } = exemplosDeMensagens();
const doTipo = (tipo: string): Solto => sala.find((m) => m.tipo === tipo)!;

describe('os 8 valores da física da sala, como dado', () => {
  it('são as 8 chaves do painel, na ordem dele, e cada faixa tem min < padrão < max e um passo positivo', () => {
    expect(CHAVES_DA_FISICA_DA_SALA).toEqual([
      'atritoDeslizamento',
      'atritoRolamento',
      'desaceleracaoGiro',
      'fatorEfeitoLateral',
      'restituicaoBolaBola',
      'restituicaoBolaTabela',
      'atritoBolaTabela',
      'velocidadeMaxTaco',
    ]);
    for (const chave of CHAVES_DA_FISICA_DA_SALA) {
      const { min, max, passo, padrao } = FAIXAS_DA_FISICA_DA_SALA[chave];
      expect(min, chave).toBeLessThan(padrao);
      expect(padrao, chave).toBeLessThan(max);
      expect(passo, chave).toBeGreaterThan(0);
      expect(passo, chave).toBeLessThan(max - min);
    }
  });

  it('o padrão de cada chave é o número da CONFIG_FISICA_PADRAO da física', () => {
    for (const chave of CHAVES_DA_FISICA_DA_SALA) {
      expect(FAIXAS_DA_FISICA_DA_SALA[chave].padrao, chave).toBe(CONFIG_FISICA_PADRAO[chave]);
      expect(FISICA_DA_SALA_PADRAO[chave], chave).toBe(CONFIG_FISICA_PADRAO[chave]);
    }
    expect(Object.keys(FISICA_DA_SALA_PADRAO)).toHaveLength(8);
    expect(fisicaDiferenteDoPadrao(FISICA_DA_SALA_PADRAO)).toBe(false);
  });

  it('as faixas e os passos são os do painel F1 do cliente (a tabela de lá, copiada para travar a conta)', () => {
    const painel: Record<string, [number, number, number]> = {
      atritoDeslizamento: [0.1, 0.5, 0.005],
      atritoRolamento: [0.002, 0.05, 0.0005],
      desaceleracaoGiro: [2, 25, 0.5],
      fatorEfeitoLateral: [0.2, 1, 0.05],
      restituicaoBolaBola: [0.85, 0.99, 0.005],
      restituicaoBolaTabela: [0.5, 0.95, 0.01],
      atritoBolaTabela: [0.05, 0.5, 0.01],
      velocidadeMaxTaco: [3, 12, 0.1],
    };
    for (const chave of CHAVES_DA_FISICA_DA_SALA) {
      const { min, max, passo } = FAIXAS_DA_FISICA_DA_SALA[chave];
      expect([min, max, passo], chave).toEqual(painel[chave]);
    }
  });

  it('cada faixa é uma grade: o max cai num degrau inteiro a partir do min, e o padrão também (senão o encaixe no passo não o alcançaria)', () => {
    for (const chave of CHAVES_DA_FISICA_DA_SALA) {
      const { min, max, passo, padrao } = FAIXAS_DA_FISICA_DA_SALA[chave];
      expect(Number.isInteger(Number(((max - min) / passo).toFixed(6))), `${chave} max`).toBe(true);
      expect(Number.isInteger(Number(((padrao - min) / passo).toFixed(6))), `${chave} padrão`).toBe(true);
    }
  });

  it('o padrão da sala é imutável (um cliente que o mexe não muda o padrão de todos)', () => {
    expect(Object.isFrozen(FISICA_DA_SALA_PADRAO)).toBe(true);
  });
});

describe('sanearFisicaDaSala: corta à faixa, encaixa no passo e descarta o resto', () => {
  it('um valor dentro da faixa passa igual', () => {
    expect(sanearFisicaDaSala({ atritoRolamento: 0.03, velocidadeMaxTaco: 9.5 })).toEqual({ atritoRolamento: 0.03, velocidadeMaxTaco: 9.5 });
  });

  it('corta nas pontas: abaixo vira o mínimo, acima vira o máximo, e a ponta exata fica', () => {
    expect(sanearFisicaDaSala({ atritoDeslizamento: 99, desaceleracaoGiro: -4, fatorEfeitoLateral: 0.2, restituicaoBolaBola: 0.99 })).toEqual({
      atritoDeslizamento: 0.5,
      desaceleracaoGiro: 2,
      fatorEfeitoLateral: 0.2,
      restituicaoBolaBola: 0.99,
    });
    expect(sanearFisicaDaSala({ velocidadeMaxTaco: Number.MAX_VALUE, atritoBolaTabela: -Number.MAX_VALUE })).toEqual({ velocidadeMaxTaco: 12, atritoBolaTabela: 0.05 });
  });

  it('encaixa no passo e arredonda às casas dele: o que um controle deslizante calcula vira o número escrito à mão', () => {
    // a conta de um slider (mínimo + degrau × passo) deixa sobra de ponto flutuante; sem encaixar, nenhuma passaria por "padrão"
    const doSlider = { atritoRolamento: 0.002 + 36 * 0.0005, restituicaoBolaTabela: 0.5 + 35 * 0.01, fatorEfeitoLateral: 0.2 + 8 * 0.05 };
    expect(doSlider.atritoRolamento).not.toBe(0.02); // 0.020000000000000004
    expect(doSlider.restituicaoBolaTabela).not.toBe(0.85); // 0.8500000000000001
    expect(doSlider.fatorEfeitoLateral).not.toBe(0.6); // 0.6000000000000001
    expect(sanearFisicaDaSala(doSlider)).toEqual({ atritoRolamento: 0.02, restituicaoBolaTabela: 0.85, fatorEfeitoLateral: 0.6 });
    expect(sanearFisicaDaSala({ atritoRolamento: 0.002 + 36 * 0.0005 }).atritoRolamento).toBe(0.02);
    expect(sanearFisicaDaSala({ restituicaoBolaTabela: 0.5 + 35 * 0.01 }).restituicaoBolaTabela).toBe(0.85);
    expect(sanearFisicaDaSala({ fatorEfeitoLateral: 0.2 + 8 * 0.05 }).fatorEfeitoLateral).toBe(0.6);
  });

  it('um valor entre dois degraus vai ao mais próximo, e a ponta continua a ponta', () => {
    expect(sanearFisicaDaSala({ atritoRolamento: 0.0212 })).toEqual({ atritoRolamento: 0.021 });
    expect(sanearFisicaDaSala({ atritoRolamento: 0.0213 })).toEqual({ atritoRolamento: 0.0215 });
    expect(sanearFisicaDaSala({ velocidadeMaxTaco: 9.54 })).toEqual({ velocidadeMaxTaco: 9.5 });
    expect(sanearFisicaDaSala({ velocidadeMaxTaco: 9.56 })).toEqual({ velocidadeMaxTaco: 9.6 });
    expect(sanearFisicaDaSala({ desaceleracaoGiro: 7.2 })).toEqual({ desaceleracaoGiro: 7 });
    expect(sanearFisicaDaSala({ restituicaoBolaBola: 0.9249 })).toEqual({ restituicaoBolaBola: 0.925 });
    // as pontas: o corte e o encaixe dão o mesmo número
    expect(sanearFisicaDaSala({ atritoRolamento: 0.002 + 96 * 0.0005 })).toEqual({ atritoRolamento: 0.05 });
    expect(sanearFisicaDaSala({ atritoRolamento: 7 })).toEqual({ atritoRolamento: 0.05 });
    expect(sanearFisicaDaSala({ restituicaoBolaBola: 0.85 + 28 * 0.005 })).toEqual({ restituicaoBolaBola: 0.99 });
    expect(sanearFisicaDaSala({ velocidadeMaxTaco: 3 + 90 * 0.1 })).toEqual({ velocidadeMaxTaco: 12 });
  });

  it('todo degrau de toda chave, como o slider o calcula: fica na faixa, sem sobra de ponto flutuante, estável ao encaixar de novo e aceito pelo esquema', () => {
    const estado = doTipo('estado-sala');
    for (const chave of CHAVES_DA_FISICA_DA_SALA) {
      const { min, max, passo } = FAIXAS_DA_FISICA_DA_SALA[chave];
      const casas = (String(passo).split('.')[1] ?? '').length;
      const degraus = Math.round((max - min) / passo);
      for (let k = 0; k <= degraus; k++) {
        const bruto = min + k * passo;
        const v = sanearFisicaDaSala({ [chave]: bruto })[chave]!;
        const rotulo = `${chave} degrau ${k} (${bruto})`;
        expect(v, rotulo).toBeGreaterThanOrEqual(min);
        expect(v, rotulo).toBeLessThanOrEqual(max);
        expect((String(v).split('.')[1] ?? '').length, rotulo).toBeLessThanOrEqual(casas);
        expect(Math.abs(v - bruto), rotulo).toBeLessThan(passo / 1e6);
        expect(sanearFisicaDaSala({ [chave]: v })[chave], rotulo).toBe(v);
        expect(validarMensagemDaSala({ ...estado, fisica: { ...FISICA_DA_SALA_PADRAO, [chave]: v }, fisicaMexida: true, fisicaTravada: false }).ok, rotulo).toBe(true);
      }
    }
  });

  it('descarta chave desconhecida, texto, NaN, infinito, null, objeto e lista no lugar do número', () => {
    const sujo = {
      atritoDeslizamento: '0.3',
      atritoRolamento: Number.NaN,
      desaceleracaoGiro: Number.POSITIVE_INFINITY,
      fatorEfeitoLateral: null,
      restituicaoBolaBola: {},
      restituicaoBolaTabela: [0.9],
      atritoBolaTabela: undefined,
      velocidadeMaxTaco: true,
      gravidade: 0,
      massaTaco: 9,
      toString: 3,
      constructor: 3,
      __proto__: { atritoRolamento: 0.03 },
    };
    expect(sanearFisicaDaSala(sujo)).toEqual({});
    expect(sanearFisicaDaSala({ ...sujo, atritoRolamento: 0.04 })).toEqual({ atritoRolamento: 0.04 });
  });

  it('um __proto__ PRÓPRIO (o que JSON.parse cria) é descartado e não mexe no protótipo de ninguém', () => {
    const doFio = JSON.parse('{"__proto__":{"atritoRolamento":0.03,"polluido":true},"velocidadeMaxTaco":5}') as unknown;
    expect(Object.keys(doFio as object)).toContain('__proto__');
    const saneado = sanearFisicaDaSala(doFio);
    expect(saneado).toEqual({ velocidadeMaxTaco: 5 });
    expect(Object.keys(saneado)).toEqual(['velocidadeMaxTaco']);
    expect(Object.getPrototypeOf(saneado)).toBe(Object.prototype);
    expect((saneado as Record<string, unknown>).polluido).toBeUndefined();
    expect(({} as Record<string, unknown>).polluido).toBeUndefined();
    expect(({} as Record<string, unknown>).atritoRolamento).toBeUndefined();
    // e completar com ele também não vaza: a física sai com as 8 chaves e o __proto__ de verdade intacto
    const completa = completarFisicaDaSala(doFio as never);
    expect(completa).toEqual({ ...FISICA_DA_SALA_PADRAO, velocidadeMaxTaco: 5 });
    expect(Object.keys(completa)).toHaveLength(8);
    expect(Object.getPrototypeOf(completa)).toBe(Object.prototype);
  });

  it('só vale a propriedade do próprio objeto, não a herdada', () => {
    expect(sanearFisicaDaSala(Object.create({ atritoRolamento: 0.03 }))).toEqual({});
    const proprio = Object.create({ atritoRolamento: 0.03 }) as Record<string, number>;
    proprio.velocidadeMaxTaco = 5;
    expect(sanearFisicaDaSala(proprio)).toEqual({ velocidadeMaxTaco: 5 });
  });

  it('o que não é um objeto vira {}', () => {
    for (const ruim of [null, undefined, 5, 'atritoRolamento', true, [], [0.03], () => 0]) expect(sanearFisicaDaSala(ruim), String(ruim)).toEqual({});
  });

  it('não escreve no pedido que recebeu', () => {
    const pedido = { atritoDeslizamento: 99 };
    sanearFisicaDaSala(pedido);
    expect(pedido).toEqual({ atritoDeslizamento: 99 });
  });
});

describe('completarFisicaDaSala', () => {
  it('sem pedido a física fica; null restaura o padrão; o parcial muda só o que traz', () => {
    const mexida = { ...FISICA_DA_SALA_PADRAO, atritoRolamento: 0.04, velocidadeMaxTaco: 10 };
    expect(completarFisicaDaSala(undefined, mexida)).toBe(mexida);
    expect(completarFisicaDaSala(null, mexida)).toEqual(FISICA_DA_SALA_PADRAO);
    expect(completarFisicaDaSala({ desaceleracaoGiro: 5 }, mexida)).toEqual({ ...mexida, desaceleracaoGiro: 5 });
    expect(completarFisicaDaSala({}, mexida)).toEqual(mexida);
  });

  it('a base padrão é o padrão da física, e o pedido é cortado à faixa mesmo vindo "limpo" de quem chamou', () => {
    expect(completarFisicaDaSala({ atritoDeslizamento: 7 })).toEqual({ ...FISICA_DA_SALA_PADRAO, atritoDeslizamento: 0.5 });
    expect(completarFisicaDaSala({ atritoDeslizamento: 7, gravidade: 0 } as never)).toEqual({ ...FISICA_DA_SALA_PADRAO, atritoDeslizamento: 0.5 });
  });

  it('o que o slider calcula para o padrão não deixa a sala "mexida": nem pelo sanear, nem comparando a física crua', () => {
    const doSlider = { atritoRolamento: 0.002 + 36 * 0.0005, restituicaoBolaTabela: 0.5 + 35 * 0.01, fatorEfeitoLateral: 0.2 + 8 * 0.05 };
    const completa = completarFisicaDaSala(doSlider);
    expect(completa).toEqual(FISICA_DA_SALA_PADRAO);
    expect(fisicaDiferenteDoPadrao(completa)).toBe(false);
    // mesmo uma física que chegou crua (sem passar pelo sanear) é comparada pela grade
    expect(fisicaDiferenteDoPadrao({ ...FISICA_DA_SALA_PADRAO, ...doSlider })).toBe(false);
    // e um degrau de verdade longe do padrão continua diferindo
    expect(fisicaDiferenteDoPadrao(completarFisicaDaSala({ atritoRolamento: 0.002 + 37 * 0.0005 }))).toBe(true);
    expect(fisicaDiferenteDoPadrao({ ...FISICA_DA_SALA_PADRAO, atritoRolamento: 0.0205 })).toBe(true);
  });

  it('difere do padrão em qualquer uma das 8 chaves, e voltar ao valor padrão não difere', () => {
    for (const chave of CHAVES_DA_FISICA_DA_SALA) {
      const { min, max, padrao } = FAIXAS_DA_FISICA_DA_SALA[chave];
      const outro = padrao === min ? max : min;
      expect(fisicaDiferenteDoPadrao({ ...FISICA_DA_SALA_PADRAO, [chave]: outro }), chave).toBe(true);
      expect(fisicaDiferenteDoPadrao({ ...FISICA_DA_SALA_PADRAO, [chave]: padrao }), chave).toBe(false);
    }
  });
});

describe('os esquemas da física (versão 9)', () => {
  it('configurar-sala aceita null, vazio, parcial e valor fora da faixa (a sala corta); recusa chave desconhecida, texto e NaN', () => {
    for (const fisica of [null, {}, { atritoRolamento: 0.03 }, { atritoDeslizamento: 99, desaceleracaoGiro: -4 }]) {
      expect(validarMensagemDoCliente({ tipo: 'configurar-sala', fisica }).ok, JSON.stringify(fisica)).toBe(true);
    }
    for (const fisica of [{ gravidade: 3 }, { atritoRolamento: '0.03' }, { atritoRolamento: null }, [0.03], 'padrao', 3, true]) {
      expect(validarMensagemDoCliente({ tipo: 'configurar-sala', fisica }).ok, JSON.stringify(fisica)).toBe(false);
    }
    expect(validarMensagemDoCliente({ tipo: 'configurar-sala', fisica: { atritoRolamento: Number.NaN } }).ok).toBe(false);
  });

  it('o estado-sala leva a física completa e dentro das faixas: faltando uma chave, sobrando outra ou fora da faixa é recusado', () => {
    const base = doTipo('estado-sala');
    const completo = { ...base, fisica: FISICA_DA_SALA_PADRAO, fisicaMexida: false, fisicaTravada: false };
    expect(validarMensagemDaSala(completo).ok).toBe(true);
    const { atritoRolamento: _tirada, ...faltando } = FISICA_DA_SALA_PADRAO;
    void _tirada;
    expect(validarMensagemDaSala({ ...completo, fisica: faltando }).ok).toBe(false);
    expect(validarMensagemDaSala({ ...completo, fisica: { ...FISICA_DA_SALA_PADRAO, gravidade: 9.81 } }).ok).toBe(false);
    expect(validarMensagemDaSala({ ...completo, fisica: { ...FISICA_DA_SALA_PADRAO, atritoDeslizamento: 0.51 } }).ok).toBe(false);
    expect(validarMensagemDaSala({ ...completo, fisica: { ...FISICA_DA_SALA_PADRAO, velocidadeMaxTaco: 2.9 } }).ok).toBe(false);
    expect(validarMensagemDaSala({ ...completo, fisicaMexida: 'sim' }).ok).toBe(false);
    expect(validarMensagemDaSala({ ...completo, fisicaTravada: 1 }).ok).toBe(false);
  });

  it('fisica-alterada: por, física completa e mexida; chave a mais ou fora da faixa é recusado', () => {
    const aviso = doTipo('fisica-alterada');
    expect(validarMensagemDaSala(aviso).ok).toBe(true);
    for (const chave of ['por', 'fisica', 'mexida']) {
      const { [chave]: _x, ...sem } = aviso;
      void _x;
      expect(validarMensagemDaSala(sem).ok, chave).toBe(false);
    }
    expect(validarMensagemDaSala({ ...aviso, extra: 1 }).ok).toBe(false);
    expect(validarMensagemDaSala({ ...aviso, fisica: { ...FISICA_DA_SALA_PADRAO, restituicaoBolaBola: 1 } }).ok).toBe(false);
  });

  it('contrato do fisica-alterada (L38b): vale o estado-sala.fisica na hora, então a mensagem NÃO leva seq, nem o exemplo, nem o esquema', () => {
    for (const aviso of sala.filter((m) => m.tipo === 'fisica-alterada')) {
      expect(Object.keys(aviso).sort(), JSON.stringify(aviso)).toEqual(['fisica', 'mexida', 'por', 'tipo']);
      expect(validarMensagemDaSala(aviso).ok).toBe(true);
      // um seq (do jeito antigo, "vale do seq N em diante") é chave desconhecida: recusado, qualquer que seja o valor
      for (const seq of [0, 4, -1]) expect(validarMensagemDaSala({ ...aviso, seq }).ok, `seq ${seq}`).toBe(false);
    }
    expect(sala.filter((m) => m.tipo === 'fisica-alterada').length).toBeGreaterThanOrEqual(2);
  });

  it('um __proto__ PRÓPRIO vindo de JSON.parse é chave desconhecida: o esquema recusa, no pedido do cliente e no estado da sala', () => {
    const pedidos = [
      '{"tipo":"configurar-sala","fisica":{"__proto__":{"atritoRolamento":0.03}}}',
      '{"tipo":"configurar-sala","fisica":{"atritoRolamento":0.03,"__proto__":{"velocidadeMaxTaco":5}}}',
      '{"tipo":"configurar-sala","fisica":{"__proto__":null}}',
      '{"tipo":"configurar-sala","__proto__":{"fisica":{"atritoRolamento":0.03}}}',
    ];
    for (const texto of pedidos) {
      const doFio = JSON.parse(texto) as unknown;
      expect(Object.keys(doFio as object).length, texto).toBeGreaterThan(0);
      expect(validarMensagemDoCliente(doFio).ok, texto).toBe(false);
      const decodificada = decodificarMensagemDoCliente(texto);
      expect(decodificada.ok, texto).toBe(false);
      if (!decodificada.ok) expect(decodificada.codigo, texto).toBe('mensagem-invalida');
    }
    // na ponta da sala também (a física completa que viaja): __proto__ próprio dentro dela é recusado
    const estado = doTipo('estado-sala');
    const fisicaComProto = JSON.parse(JSON.stringify({ ...FISICA_DA_SALA_PADRAO }).replace('{', '{"__proto__":{"atritoRolamento":0.03},')) as unknown;
    expect(validarMensagemDaSala({ ...estado, fisica: fisicaComProto, fisicaMexida: false, fisicaTravada: false }).ok).toBe(false);
    const aviso = doTipo('fisica-alterada');
    expect(validarMensagemDaSala({ ...aviso, fisica: fisicaComProto }).ok).toBe(false);
    // o objeto de verdade que ninguém mexeu
    expect(({} as Record<string, unknown>).atritoRolamento).toBeUndefined();
    expect(FISICA_DA_SALA_PADRAO.atritoRolamento).toBe(0.02);
  });
});
