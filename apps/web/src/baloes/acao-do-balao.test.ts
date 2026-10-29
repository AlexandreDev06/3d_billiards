import { describe, expect, it } from 'vitest';
import { NOME_DA_ACAO, NOME_DA_CARA, pedidoDoBalao, resolverPedido, type PedidoDoBalao } from './acao-do-balao';
import { REACOES, momentoDoBalao, type MomentoDoBalao, type SituacaoDoBalao } from './reacoes';
import { CARAS_DO_BALAO, CARA_NO_ATLAS, type CaraDoBalao } from './rosto';

const calmo: SituacaoDoBalao = { mirando: false, impaciente: false, fim: null };
const pedido = (): PedidoDoBalao => ({ acao: 'parado', repetir: false, cara: 'neutro', momento: 'parado' });

describe('pedidoDoBalao (o que o corpo e a cara do arquivo do artista fazem em cada momento)', () => {
  it('parado e sem nada acontecendo: a parada, de cara neutra', () => {
    expect(pedidoDoBalao('neutro', calmo)).toEqual({ acao: 'parado', repetir: false, cara: 'neutro', momento: 'parado' });
  });

  it('o outro mirando: concentra, repetindo o trecho do meta, de cara concentrada', () => {
    expect(pedidoDoBalao('neutro', { ...calmo, mirando: true })).toEqual({ acao: 'concentrar', repetir: true, cara: 'concentrado', momento: 'mirando' });
  });

  it('a vez demorando: impaciente, de cara de tédio (e cede a tudo o que a mesa provoca)', () => {
    expect(pedidoDoBalao('neutro', { ...calmo, mirando: true, impaciente: true })).toEqual({ acao: 'impaciente', repetir: true, cara: 'tedio', momento: 'impaciente' });
    expect(pedidoDoBalao('sorriso', { ...calmo, mirando: true, impaciente: true }).acao).toBe('pulinho');
  });

  it('encaçapou: pulinho com sorriso, uma vez (mesmo mirando de novo)', () => {
    expect(pedidoDoBalao('sorriso', calmo)).toEqual({ acao: 'pulinho', repetir: false, cara: 'sorriso', momento: 'encacapou' });
    expect(pedidoDoBalao('sorriso', { ...calmo, mirando: true }).acao).toBe('pulinho');
  });

  it('duas ou mais bolas numa tacada: comemorar, de cara comemorando', () => {
    expect(pedidoDoBalao('comemorando', calmo)).toEqual({ acao: 'comemorar', repetir: false, cara: 'comemorando', momento: 'comemorou' });
  });

  it('a bola dele raspou a caçapa: susto com cara de susto; passou o susto e ela não caiu: desanimar com a cara triste', () => {
    expect(pedidoDoBalao('susto', calmo)).toEqual({ acao: 'susto', repetir: false, cara: 'susto', momento: 'raspou' });
    expect(pedidoDoBalao('desanimado', calmo)).toEqual({ acao: 'desanimar', repetir: false, cara: 'triste', momento: 'desanimou' });
  });

  it('a bola de quem joga contra ele corre para a caçapa: desconfia (inclinado, de cara desconfiada); raspou e não caiu: ufa, de cara de alívio', () => {
    expect(pedidoDoBalao('desconfiado', calmo)).toEqual({ acao: 'inclinar', repetir: true, cara: 'desconfiado', momento: 'desconfiou' });
    expect(pedidoDoBalao('ufa', calmo)).toEqual({ acao: 'ufa', repetir: false, cara: 'ufa', momento: 'aliviou' });
  });

  it('falta própria: bravo com cara de bravo', () => {
    expect(pedidoDoBalao('bravo', calmo)).toEqual({ acao: 'bravo', repetir: false, cara: 'bravo', momento: 'faltou' });
  });

  it('o outro errou e o balão está à vista: ri (gargalhando, e depois de cara convencida, sem trocar de ação)', () => {
    expect(pedidoDoBalao('rindo', calmo)).toEqual({ acao: 'rir', repetir: true, cara: 'rindo', momento: 'gargalhou' });
    expect(pedidoDoBalao('convencido', calmo)).toEqual({ acao: 'rir', repetir: true, cara: 'convencido', momento: 'provocou' });
  });

  it('no fim, quem ganhou estufa (de cara comemorando) e quem perdeu murcha (de cara triste), repetindo o trecho do meta', () => {
    expect(pedidoDoBalao('sorriso', { ...calmo, fim: 'ganhou' })).toEqual({ acao: 'estufar', repetir: true, cara: 'comemorando', momento: 'ganhou' });
    expect(pedidoDoBalao('triste', { ...calmo, fim: 'perdeu' })).toEqual({ acao: 'murchar', repetir: true, cara: 'triste', momento: 'perdeu' });
    // antes da virada a cara do roteiro é neutra, e o corpo já faz a ação
    expect(pedidoDoBalao('neutro', { ...calmo, fim: 'ganhou' })).toEqual({ acao: 'estufar', repetir: true, cara: 'neutro', momento: 'ganhou' });
  });

  it('a mira e a impaciência não atrapalham o fim', () => {
    expect(pedidoDoBalao('neutro', { mirando: true, impaciente: true, fim: 'perdeu' }).acao).toBe('murchar');
  });

  it('uma cara forçada que a tabela não conhece segue como veio (o gancho de teste)', () => {
    expect(pedidoDoBalao('triste', calmo)).toMatchObject({ acao: 'parado', cara: 'triste' });
  });

  it('escreve na saída passada, sem alocar', () => {
    const saida = pedido();
    expect(pedidoDoBalao('susto', calmo, saida)).toBe(saida);
    expect(saida.acao).toBe('susto');
  });
});

describe('a tabela de reações', () => {
  const momentos = Object.keys(REACOES) as MomentoDoBalao[];

  it('todo momento tem ação, cara e o recuo para o que o arquivo v1 faz', () => {
    expect(momentos.sort()).toEqual(['aliviou', 'comemorou', 'desanimou', 'desconfiou', 'encacapou', 'faltou', 'ganhou', 'gargalhou', 'impaciente', 'mirando', 'parado', 'perdeu', 'provocou', 'raspou'].sort());
    const v1 = new Set(['parado', 'inclinar', 'pulinho', 'susto', 'estufar', 'murchar']);
    const caras1 = new Set(['neutro', 'sorriso', 'susto', 'bravo', 'triste']);
    for (const m of momentos) {
      expect(v1.has(REACOES[m].recuo.acao), `${m}: o recuo da ação`).toBe(true);
      expect(caras1.has(REACOES[m].recuo.cara), `${m}: o recuo da cara`).toBe(true);
    }
  });

  it('o recuo repete só quando a ação do v1 tem ciclo (inclinar, estufar e murchar)', () => {
    const comCiclo = new Set(['inclinar', 'estufar', 'murchar']);
    for (const m of momentos) if (REACOES[m].recuo.repetir) expect(comCiclo.has(REACOES[m].recuo.acao), m).toBe(true);
  });

  it('momentoDoBalao: o fim manda, depois a cara da mesa, depois a impaciência, depois a mira', () => {
    expect(momentoDoBalao('sorriso', { mirando: true, impaciente: true, fim: 'ganhou' })).toBe('ganhou');
    expect(momentoDoBalao('susto', { mirando: true, impaciente: true, fim: null })).toBe('raspou');
    expect(momentoDoBalao('desanimado', { mirando: true, impaciente: true, fim: null })).toBe('desanimou');
    expect(momentoDoBalao('desconfiado', { mirando: true, impaciente: true, fim: null })).toBe('desconfiou');
    expect(momentoDoBalao('neutro', { mirando: true, impaciente: true, fim: null })).toBe('impaciente');
    expect(momentoDoBalao('neutro', { mirando: true, impaciente: false, fim: null })).toBe('mirando');
    expect(momentoDoBalao('neutro', calmo)).toBe('parado');
  });
});

describe('resolverPedido: nenhuma ação ou cara nova some o balão com o arquivo v1', () => {
  const tudoDoV1 = {
    temAcao: (nome: string) => ['parado', 'inclinar', 'pulinho', 'susto', 'estufar', 'murchar'].includes(nome.replace('balao_', '')),
    temCiclo: (nome: string) => ['balao_inclinar', 'balao_estufar', 'balao_murchar'].includes(nome),
    temCara: (nome: string) => ['neutro', 'sorriso', 'susto', 'bravo', 'triste'].includes(nome.replace('cara_', '')),
  };
  const tudo = { temAcao: () => true, temCiclo: () => true, temCara: () => true };

  it('com o arquivo v2 completo o pedido fica como a tabela diz', () => {
    const p = pedidoDoBalao('bravo', calmo);
    expect(resolverPedido(p, tudo)).toEqual({ acao: 'bravo', repetir: false, cara: 'bravo', momento: 'faltou' });
  });

  it('com o v1, cada momento recua para o que o arquivo faz (a falta vira o susto de hoje)', () => {
    const casos: [CaraDoBalao, Partial<SituacaoDoBalao>, string, string, boolean][] = [
      ['bravo', {}, 'susto', 'susto', false],
      ['rindo', {}, 'pulinho', 'sorriso', false],
      ['convencido', {}, 'pulinho', 'sorriso', false],
      ['comemorando', {}, 'pulinho', 'sorriso', false],
      ['ufa', {}, 'parado', 'neutro', false],
      ['desanimado', {}, 'parado', 'triste', false],
      ['desconfiado', {}, 'inclinar', 'neutro', true],
      ['neutro', { mirando: true }, 'inclinar', 'neutro', true],
      ['neutro', { mirando: true, impaciente: true }, 'inclinar', 'neutro', true],
      ['sorriso', { fim: 'ganhou' }, 'estufar', 'sorriso', true],
      ['triste', { fim: 'perdeu' }, 'murchar', 'triste', true],
    ];
    for (const [cara, extra, acao, caraFinal, repetir] of casos) {
      const p = resolverPedido(pedidoDoBalao(cara, { ...calmo, ...extra }), tudoDoV1);
      expect([p.acao, p.cara, p.repetir], `${cara} ${JSON.stringify(extra)}`).toEqual([acao, caraFinal, repetir]);
    }
  });

  it('um arquivo com a ação nova mas sem trecho de ciclo faz a ação uma vez, em vez de lançar', () => {
    const semCiclo = { temAcao: () => true, temCiclo: () => false, temCara: () => true };
    expect(resolverPedido(pedidoDoBalao('neutro', { ...calmo, mirando: true }), semCiclo)).toMatchObject({ acao: 'concentrar', repetir: false });
  });

  it('um arquivo com a ação nova mas sem a cara nova recua só a cara', () => {
    const semCaras = { temAcao: () => true, temCiclo: () => true, temCara: (n: string) => n === 'cara_sorriso' || n === 'cara_neutro' };
    expect(resolverPedido(pedidoDoBalao('rindo', calmo), semCaras)).toMatchObject({ acao: 'rir', cara: 'sorriso' });
  });
});

describe('os nomes do arquivo do artista', () => {
  it('toda ação e toda cara do jogo têm o nome que o arquivo usa', () => {
    expect(NOME_DA_ACAO).toEqual({
      parado: 'balao_parado',
      inclinar: 'balao_inclinar',
      pulinho: 'balao_pulinho',
      susto: 'balao_susto',
      estufar: 'balao_estufar',
      murchar: 'balao_murchar',
      comemorar: 'balao_comemorar',
      rir: 'balao_rir',
      bravo: 'balao_bravo',
      concentrar: 'balao_concentrar',
      impaciente: 'balao_impaciente',
      ufa: 'balao_ufa',
      desanimar: 'balao_desanimar',
    });
    // o desânimo não tem forma própria: é a cara triste, curta
    for (const cara of Object.keys(NOME_DA_CARA) as CaraDoBalao[]) expect(NOME_DA_CARA[cara]).toBe(cara === 'desanimado' ? 'cara_triste' : `cara_${cara}`);
    expect(Object.keys(NOME_DA_CARA).sort()).toEqual(Object.keys(CARA_NO_ATLAS).sort());
    for (const cara of CARAS_DO_BALAO) expect(NOME_DA_CARA[cara]).toBe(`cara_${cara}`);
  });
});
