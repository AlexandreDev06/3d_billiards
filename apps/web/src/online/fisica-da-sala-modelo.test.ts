import { CONFIG_FISICA_PADRAO, type ConfigFisica } from '@sinuca/fisica';
import { CHAVES_DA_FISICA_DA_SALA, FAIXAS_DA_FISICA_DA_SALA, FISICA_DA_SALA_PADRAO, type FisicaSala, type MsgEstadoSala } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { DESCRITORES, DESCRITORES_DA_FISICA } from '../dev/parametros';
import {
  NOTA_DA_FISICA_TRAVADA,
  avisoDeFisicaAlterada,
  configDeFisica,
  fisicaDoEstado,
  fisicaMexidaDoEstado,
  juntarPedidos,
  linhaDaFisicaNaEspera,
  modoDoPainelDeFisica,
  pedidoDeUmaChave,
  valoresDaFisicaNoPainel,
} from './fisica-da-sala-modelo';

const MEXIDA: FisicaSala = { ...FISICA_DA_SALA_PADRAO, atritoRolamento: 0.035, restituicaoBolaTabela: 0.6 };

/** Só o que o modelo lê do `estado-sala`. */
const estado = (extra: Partial<MsgEstadoSala> = {}): MsgEstadoSala => ({ tipo: 'estado-sala', ...extra }) as MsgEstadoSala;

describe('configDeFisica', () => {
  it('sem sala vale a física local, a mesma de antes', () => {
    expect(configDeFisica(CONFIG_FISICA_PADRAO, null)).toBe(CONFIG_FISICA_PADRAO);
    expect(configDeFisica(CONFIG_FISICA_PADRAO, undefined)).toBe(CONFIG_FISICA_PADRAO);
  });

  it('com sala, as 8 chaves vêm dela e o resto continua o da local', () => {
    const cfg = configDeFisica(CONFIG_FISICA_PADRAO, MEXIDA);
    for (const chave of CHAVES_DA_FISICA_DA_SALA) expect(cfg[chave]).toBe(MEXIDA[chave]);
    expect(cfg.mesa).toBe(CONFIG_FISICA_PADRAO.mesa);
    expect(cfg.bola).toBe(CONFIG_FISICA_PADRAO.bola);
    expect(cfg.atritoRolamento).toBe(0.035);
  });

  it('a da sala vale por cima da física local do painel (online manda a sala), e ao sair da sala volta a local', () => {
    const localDoPainel: ConfigFisica = { ...CONFIG_FISICA_PADRAO, atritoDeslizamento: 0.4, fatorEfeitoLateral: 0.3 };
    const naSala = configDeFisica(localDoPainel, MEXIDA);
    expect(naSala.atritoDeslizamento).toBe(MEXIDA.atritoDeslizamento);
    expect(naSala.fatorEfeitoLateral).toBe(MEXIDA.fatorEfeitoLateral);
    const depois = configDeFisica(localDoPainel, null);
    expect(depois).toBe(localDoPainel);
    expect(depois.atritoDeslizamento).toBe(0.4);
  });

  it('o anfitrião restaurou: a sala manda a padrão e a config volta a ser igual à padrão', () => {
    const cfg = configDeFisica(CONFIG_FISICA_PADRAO, FISICA_DA_SALA_PADRAO);
    for (const chave of CHAVES_DA_FISICA_DA_SALA) expect(cfg[chave]).toBe(CONFIG_FISICA_PADRAO[chave]);
  });

  it('não muda a física que recebeu', () => {
    const antes = { ...CONFIG_FISICA_PADRAO };
    configDeFisica(CONFIG_FISICA_PADRAO, MEXIDA);
    expect(CONFIG_FISICA_PADRAO).toEqual(antes);
  });
});

describe('o estado-sala e a física', () => {
  it('sala que não diz a física tem a padrão e não está mexida', () => {
    expect(fisicaDoEstado(estado())).toBe(FISICA_DA_SALA_PADRAO);
    expect(fisicaDoEstado(null)).toBe(FISICA_DA_SALA_PADRAO);
    expect(fisicaMexidaDoEstado(estado())).toBe(false);
    expect(fisicaMexidaDoEstado(null)).toBe(false);
  });

  it('vale o fisicaMexida da sala; sem ele, a conta dos valores', () => {
    expect(fisicaMexidaDoEstado(estado({ fisica: MEXIDA, fisicaMexida: true }))).toBe(true);
    expect(fisicaMexidaDoEstado(estado({ fisica: FISICA_DA_SALA_PADRAO, fisicaMexida: false }))).toBe(false);
    expect(fisicaMexidaDoEstado(estado({ fisica: MEXIDA }))).toBe(true);
    expect(fisicaMexidaDoEstado(estado({ fisica: { ...FISICA_DA_SALA_PADRAO, atritoRolamento: 0.020000000000000004 } }))).toBe(false);
  });
});

describe('modoDoPainelDeFisica', () => {
  it('sem sala, o painel mexe na física local', () => {
    expect(modoDoPainelDeFisica(null)).toEqual({ tipo: 'local' });
  });

  it('anfitrião na sala: os sliders vão à sala', () => {
    expect(modoDoPainelDeFisica({ estado: estado({ fisica: MEXIDA, fisicaMexida: true }), souAnfitriao: true })).toEqual({ tipo: 'anfitriao', fisica: MEXIDA, mexida: true });
  });

  it('anfitrião com a física travada (aposta): só leitura', () => {
    expect(modoDoPainelDeFisica({ estado: estado({ fisicaTravada: true }), souAnfitriao: true })).toMatchObject({ tipo: 'travada', mexida: false });
    expect(NOTA_DA_FISICA_TRAVADA).toMatch(/aposta/);
  });

  it('quem não é anfitrião só lê, travada ou não', () => {
    expect(modoDoPainelDeFisica({ estado: estado({ fisica: MEXIDA, fisicaMexida: true }), souAnfitriao: false })).toEqual({ tipo: 'leitura', fisica: MEXIDA, mexida: true });
    expect(modoDoPainelDeFisica({ estado: estado({ fisicaTravada: true }), souAnfitriao: false }).tipo).toBe('leitura');
  });

  it('na sala mas antes do primeiro estado-sala: leitura da padrão, e o anfitrião já pode mexer', () => {
    expect(modoDoPainelDeFisica({ estado: null, souAnfitriao: false })).toEqual({ tipo: 'leitura', fisica: FISICA_DA_SALA_PADRAO, mexida: false });
    expect(modoDoPainelDeFisica({ estado: null, souAnfitriao: true }).tipo).toBe('anfitriao');
  });
});

describe('valoresDaFisicaNoPainel', () => {
  const locais = { ...FISICA_DA_SALA_PADRAO, atritoRolamento: 0.01, expoenteForca: 1.6, forcaPrevisao: 3 };

  it('local: os do painel', () => {
    expect(valoresDaFisicaNoPainel({ tipo: 'local' }, locais)).toBe(locais);
  });

  it('na sala: as 8 da sala por cima, o resto do painel intacto', () => {
    const v = valoresDaFisicaNoPainel({ tipo: 'leitura', fisica: MEXIDA, mexida: true }, locais);
    expect(v.atritoRolamento).toBe(0.035);
    expect(v.restituicaoBolaTabela).toBe(0.6);
    expect(v.expoenteForca).toBe(1.6);
    expect(v.forcaPrevisao).toBe(3);
  });
});

describe('pedidos à sala', () => {
  it('um pedido leva só a chave mexida', () => {
    expect(pedidoDeUmaChave('atritoRolamento', 0.03)).toEqual({ atritoRolamento: 0.03 });
  });

  it('os pedidos juntos valem o último de cada chave', () => {
    expect(juntarPedidos([{ atritoRolamento: 0.03 }, { restituicaoBolaTabela: 0.7 }, { atritoRolamento: 0.035 }])).toEqual({ atritoRolamento: 0.035, restituicaoBolaTabela: 0.7 });
    expect(juntarPedidos([])).toEqual({});
  });
});

describe('textos', () => {
  it('a espera diz a física: padrão, ou mexida em destaque', () => {
    expect(linhaDaFisicaNaEspera(false)).toEqual({ texto: 'Física: padrão', destaque: false });
    expect(linhaDaFisicaNaEspera(true)).toEqual({ texto: 'Física mexida: missões e estatísticas não contam', destaque: true });
  });

  it('o aviso da partida é discreto e diz quem foi: o anfitrião', () => {
    expect(avisoDeFisicaAlterada({ mexida: true })).toBe('O anfitrião mudou a física');
    expect(avisoDeFisicaAlterada({ mexida: false })).toBe('O anfitrião voltou a física ao padrão');
  });
});

describe('painel: faixas e passos do protocolo, nunca uma cópia no web', () => {
  it('os 8 descritores de física têm a faixa e o passo de FAIXAS_DA_FISICA_DA_SALA, na ordem dele', () => {
    expect(DESCRITORES_DA_FISICA.map((d) => d.chave)).toEqual([...CHAVES_DA_FISICA_DA_SALA]);
    for (const d of DESCRITORES_DA_FISICA) {
      const f = FAIXAS_DA_FISICA_DA_SALA[d.chave as keyof FisicaSala];
      expect({ min: d.min, max: d.max, passo: d.passo }).toEqual({ min: f.min, max: f.max, passo: f.passo });
      expect(d.grupo).toBe('fisica');
    }
    expect(DESCRITORES.filter((d) => d.grupo === 'fisica')).toHaveLength(8);
  });
});
