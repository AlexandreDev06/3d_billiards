/**
 * A identidade da conta (L61) dentro da sala: o cookie `becogames_sessao`, o cabeçalho interno e o `carteiraDe` do registro, que com
 * `idDaConta` ignora o código da mensagem e usa a carteira da conta (que nasce na primeira vez, só com o Banco ligado).
 */
import { describe, expect, it } from 'vitest';
import { PROTOCOLO_VERSAO } from '@sinuca/protocolo';
import { PRESET_BOTECO } from '@sinuca/regras';
import { CarteirasEmMemoria } from './carteiras-base';
import { CABECALHO_DA_CONTA, idDaContaDoCabecalho, tokenDaSessao } from './sessao-da-conta';
import { ConexaoFalsa, criarAmbiente } from './para-testes';
import { bancoDeTeste } from './para-testes-banco';

const TOKEN = 'A'.repeat(43);
const ID = 'e'.repeat(64);

describe('tokenDaSessao', () => {
  it('acha o token entre outros cookies e recusa o que não tem a forma de um token', () => {
    expect(tokenDaSessao(`a=1; becogames_sessao=${TOKEN}; b=2`)).toBe(TOKEN);
    expect(tokenDaSessao(`becogames_sessao=${TOKEN}`)).toBe(TOKEN);
    for (const ruim of [undefined, null, '', 'a=1', 'becogames_sessao=curto', `becogames_sessao=${'A'.repeat(44)}`, `xbecogames_sessao=${TOKEN}`, `becogames_sessao=${'+'.repeat(43)}`]) {
      expect(tokenDaSessao(ruim), String(ruim)).toBeNull();
    }
  });

  it('o primeiro cookie com a forma certa vale, mesmo se um anterior com o mesmo nome for torto', () => {
    expect(tokenDaSessao(`becogames_sessao=torto; becogames_sessao=${TOKEN}`)).toBe(TOKEN);
  });
});

describe('idDaContaDoCabecalho', () => {
  it('só aceita 64 hexadecimais minúsculos', () => {
    expect(CABECALHO_DA_CONTA).toBe('x-sinuca-conta');
    expect(idDaContaDoCabecalho(ID)).toBe(ID);
    for (const ruim of [undefined, null, '', 'abc', ID.toUpperCase(), `${ID}0`, ID.slice(1)]) expect(idDaContaDoCabecalho(ruim as string | undefined)).toBeUndefined();
  });
});

describe('registro: a sessão da conta manda na carteira de quem cria ou entra', () => {
  const criar = (extra: object = {}) => ({ tipo: 'criar-sala' as const, versao: PROTOCOLO_VERSAO, nome: 'Ana', modo: '1x1' as const, preset: 'Boteco', regras: PRESET_BOTECO.regras, ...extra });

  function mundo(comBanco: boolean) {
    const bt = comBanco ? bancoDeTeste() : null;
    const carteiras = new CarteirasEmMemoria({ maxCarteiras: 100, relogio: () => 1_000_000, log: () => {}, ...(bt ? { banco: bt.banco } : {}) });
    return { amb: criarAmbiente({}, { carteiras }), carteiras };
  }

  it('com a sessão, joga com a carteira da conta (nasce vazia na primeira vez) e ignora o código da mensagem', () => {
    const { amb, carteiras } = mundo(true);
    const outro = carteiras.criar()!;
    const c = new ConexaoFalsa('c');
    c.idDaConta = ID;
    amb.registro.receber(c, criar({ carteira: outro.codigo }));
    expect(c.ultima('erro')).toBeUndefined();
    expect(carteiras.ehDaConta(ID)).toBe(true);
    const lugar = c.ultima('estado-sala')!.lugares[0]!;
    expect(lugar.skin).toBe('classico');
    expect(lugar.saldo).toBe(carteiras.ler(ID)!.saldo);
    // a carteira do código ficou intocada, fora da mesa
    expect(carteiras.ehDaConta(outro.id)).toBe(false);
  });

  it('o código errado de quem tem sessão não gasta o orçamento de falhas do IP', () => {
    const { amb } = mundo(true);
    for (let i = 0; i < 30; i++) {
      const c = new ConexaoFalsa(`c${i}`);
      c.idDaConta = ID;
      amb.registro.receber(c, criar({ carteira: 'x'.repeat(43) }));
      expect(c.fechada, `tentativa ${i}`).toBeNull();
    }
  });

  it('sem o Banco ligado, a conta nova joga sem carteira (não há saldo com dono)', () => {
    const { amb, carteiras } = mundo(false);
    const c = new ConexaoFalsa('c');
    c.idDaConta = ID;
    amb.registro.receber(c, criar());
    expect(c.ultima('erro')).toBeUndefined();
    expect(carteiras.total).toBe(0);
    expect(c.ultima('estado-sala')!.lugares[0]!.saldo ?? null).toBeNull();
  });

  it('sem sessão, o código de uma carteira da conta não vale (joga sem carteira)', () => {
    const { amb, carteiras } = mundo(true);
    const dona = carteiras.criar()!;
    carteiras.marcarDaConta(dona.id);
    const c = new ConexaoFalsa('c');
    amb.registro.receber(c, criar({ carteira: dona.codigo }));
    expect(c.ultima('estado-sala')!.lugares[0]!.saldo ?? null).toBeNull();
  });
});
