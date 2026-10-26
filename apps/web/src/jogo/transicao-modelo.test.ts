import { describe, expect, it } from 'vitest';
import type { EventoTacada } from '@sinuca/fisica';
import type { Consequencias, EstadoPartida } from '@sinuca/regras';
import { CASA_1, CASA_MATA_MATA, DUPLAS_DE_TESTE, TRIO_DE_TESTE, TRIO_POR_SI, partidaDeTeste } from './para-testes';
import { REGRAS_DO_PACOTE } from './regras';
import { encurtarPlano, planoDaTransicao, progressoDaFase, type ConfigDaTransicao, type EntradaDoPlano } from './transicao-modelo';

const CFG: ConfigDaTransicao = { anelS: 1.5, vooS: 0.9, deslizeS: 0.7, avisoS: 4.5, margemOnlineS: 1 };

const nada: Consequencias = { faltas: [], retirar: [], recolocar: [], proximo: 0, vencedor: null, texto: '' };
const consequencias = (c: Partial<Consequencias>): Consequencias => ({ ...nada, ...c });

/** Ana (pares) taca e Beto (ímpares) fica com a vez; sobram pares 2, 4, 6, ímpares 3, 7, 9 e a 8. */
const depois = partidaDeTeste({ fase: 'grupos', grupos: ['par', 'impar'], vez: 1, naMesa: [2, 3, 4, 6, 7, 8, 9] });
const antes: EstadoPartida = { ...depois, vez: 0 };
const entrada = (c: Partial<Consequencias>, extra: Partial<EntradaDoPlano> = {}): EntradaDoPlano => ({
  consequencias: consequencias({ proximo: 1, ...c }),
  antes,
  depois,
  quemTacou: 0,
  ...extra,
});

describe('planoDaTransicao: sem nada a mostrar', () => {
  it('uma tacada comum (nem falta, nem bola paga, nem recolocação) não tem transição', () => {
    const plano = planoDaTransicao(entrada({}), CFG);
    expect(plano.aviso).toBeNull();
    expect(plano.fases).toEqual([]);
    expect(plano.duracaoS).toBe(0);
  });

  it('encaçapar bola do próprio grupo não é motivo de transição', () => {
    const encaçapou = { ...depois, encacapadas: [{ bola: 4, jogador: 0 }] };
    expect(planoDaTransicao(entrada({}, { depois: encaçapou }), CFG).fases).toEqual([]);
  });

  it('a bola final encaçapada (sem grupo) não conta para o adversário', () => {
    const encaçapou = { ...depois, encacapadas: [{ bola: 8, jogador: 0 }] };
    expect(planoDaTransicao(entrada({}, { depois: encaçapou }), CFG).fases).toEqual([]);
  });

  it('a que já estava encaçapada antes da tacada não entra de novo', () => {
    const jaCaiu = { ...depois, encacapadas: [{ bola: 7, jogador: 0 }] };
    expect(planoDaTransicao(entrada({}, { antes: jaCaiu, depois: jaCaiu }), CFG).fases).toEqual([]);
  });
});

describe('planoDaTransicao: falta com bola paga', () => {
  const cegou = entrada({ faltas: [{ nome: 'cegar' }], retirar: [3], recolocar: [{ bola: 0, lugar: 'marca-saida' }] });

  it('o aviso diz o nome da falta, quem recebe e qual bola, com a ficha dela', () => {
    const { aviso } = planoDaTransicao(cegou, CFG);
    expect(aviso).toEqual({
      titulo: 'Cegou!',
      detalhes: ['Beto recebe a 3'],
      bola: { id: 3, estilo: 'listrada' },
      falta: true,
      duracaoS: 4.5,
    });
  });

  it('a ficha segue a regra da casa (ímpar listrada, par lisa)', () => {
    const par = planoDaTransicao(entrada({ faltas: [{ nome: 'cegar' }], retirar: [4] }, { depois: { ...depois, vez: 0 } }), CFG);
    expect(par.aviso?.bola).toEqual({ id: 4, estilo: 'lisa' });
  });

  it('as fases vêm em ordem: anel na bola paga, voo até a ficha de quem recebeu, bolão deslizando para o lugar', () => {
    const { fases, duracaoS } = planoDaTransicao(cegou, CFG);
    expect(fases).toEqual([
      { tipo: 'anel', inicioS: 0, duracaoS: 1.5, bolas: [3] },
      { tipo: 'voo', inicioS: 1.5, duracaoS: 0.9, itens: [{ bola: 3, paraJogador: 1, origem: 'mesa' }] },
      { tipo: 'deslize', inicioS: 2.4, duracaoS: 0.7, itens: [{ bola: 0, lugar: 'marca-saida' }] },
    ]);
    expect(duracaoS).toBeCloseTo(3.1, 6);
  });

  it('duas bolas pagas (a direta paga 2): as duas no anel e no voo, e a frase junta', () => {
    const plano = planoDaTransicao(entrada({ faltas: [{ nome: 'direta' }], retirar: [3, 7] }), CFG);
    expect(plano.aviso?.detalhes).toEqual(['Beto recebe a 3 e a 7']);
    expect(plano.fases[0]).toMatchObject({ tipo: 'anel', bolas: [3, 7] });
    expect(plano.fases[1]).toMatchObject({ tipo: 'voo', itens: [{ bola: 3 }, { bola: 7 }] });
  });

  it('três bolas: vírgula e "e" no fim', () => {
    const plano = planoDaTransicao(entrada({ faltas: [{ nome: 'suicidio' }], retirar: [3, 7, 9] }), CFG);
    expect(plano.aviso?.detalhes).toEqual(['Beto recebe a 3, a 7 e a 9']);
  });

  it('nas duplas recebe a equipe: os dois nomes, no plural, e o voo vai para o primeiro da roda', () => {
    const duplas = partidaDeTeste({ jogadores: DUPLAS_DE_TESTE, fase: 'grupos', grupos: ['par', 'impar'], vez: 1, naMesa: [2, 3, 4, 7, 8, 9] });
    const plano = planoDaTransicao({ ...entrada({ faltas: [{ nome: 'cegar' }], retirar: [3] }), antes: { ...duplas, vez: 0 }, depois: duplas }, CFG);
    expect(plano.aviso?.detalhes).toEqual(['Beto e Dani recebem a 3']);
    expect(plano.fases[1]).toMatchObject({ itens: [{ bola: 3, paraJogador: 1 }] });
  });

  it('quem recebe vem dos grupos de depois da tacada: trocados os grupos, a mesma bola vai para o outro', () => {
    const base = planoDaTransicao(entrada({ faltas: [{ nome: 'cegar' }], retirar: [4] }), CFG);
    expect(base.aviso?.detalhes).toEqual(['Ana recebe a 4']);
    expect(base.fases[1]).toMatchObject({ itens: [{ bola: 4, paraJogador: 0 }] });
    const trocados = planoDaTransicao(entrada({ faltas: [{ nome: 'cegar' }], retirar: [4] }, { depois: { ...depois, grupos: ['impar', 'par'] } }), CFG);
    expect(trocados.aviso?.detalhes).toEqual(['Beto recebe a 4']);
    expect(trocados.fases[1]).toMatchObject({ itens: [{ bola: 4, paraJogador: 1 }] });
  });

  it('duas faltas na mesma tacada: os dois nomes no título', () => {
    const plano = planoDaTransicao(entrada({ faltas: [{ nome: 'suicidio' }, { nome: 'cegar' }], retirar: [3] }), CFG);
    expect(plano.aviso?.titulo).toBe('Suicídio + Cegou!');
  });

  it('o nome da falta de tocar a bola final vem das regras ("A 8 fora de hora")', () => {
    const plano = planoDaTransicao(entrada({ faltas: [{ nome: 'castigo-fora-de-hora' }], retirar: [3] }), CFG);
    expect(plano.aviso?.titulo).toBe('A 8 fora de hora!');
    const antiga = partidaDeTeste({ config: CASA_1, fase: 'grupos', grupos: ['par', 'impar'], vez: 1, naMesa: [1, 2, 3, 4] });
    expect(planoDaTransicao(entrada({ faltas: [{ nome: 'castigo-fora-de-hora' }], retirar: [3] }, { depois: antiga, antes: { ...antiga, vez: 0 } }), CFG).aviso?.titulo).toBe(
      'Castigo fora de hora!',
    );
  });
});

describe('planoDaTransicao: falta sem bola paga e recolocações sem falta', () => {
  it('falta com a mesa aberta (ninguém recebe bola): só o aviso e o bolão voltando; a frase diz de quem é a vez', () => {
    const aberta = partidaDeTeste({ fase: 'aberta', vez: 1 });
    const plano = planoDaTransicao(entrada({ faltas: [{ nome: 'suicidio' }], recolocar: [{ bola: 0, lugar: 'marca-saida' }] }, { depois: aberta, antes: { ...aberta, vez: 0 } }), CFG);
    expect(plano.aviso).toEqual({ titulo: 'Suicídio!', detalhes: ['Vez de Beto'], bola: null, falta: true, duracaoS: 4.5 });
    expect(plano.fases).toEqual([{ tipo: 'deslize', inicioS: 0, duracaoS: 0.7, itens: [{ bola: 0, lugar: 'marca-saida' }] }]);
  });

  it('recolocar sem falta (a 8 que volta ao marca do pé): só desliza, sem aviso', () => {
    const plano = planoDaTransicao(entrada({ recolocar: [{ bola: 8, lugar: 'marca-pe' }] }), CFG);
    expect(plano.aviso).toBeNull();
    expect(plano.fases).toEqual([{ tipo: 'deslize', inicioS: 0, duracaoS: 0.7, itens: [{ bola: 8, lugar: 'marca-pe' }] }]);
  });

  it('várias recolocações deslizam juntas, na ordem em que as regras mandam', () => {
    const plano = planoDaTransicao(
      entrada({ recolocar: [{ bola: 8, lugar: 'marca-pe' }, { bola: 0, lugar: 'marca-saida' }] }),
      CFG,
    );
    expect(plano.fases[0]).toMatchObject({ tipo: 'deslize', itens: [{ bola: 8 }, { bola: 0 }] });
  });

  it('falta que acaba a partida: o aviso diz quem vence', () => {
    const fim = { ...depois, fase: 'fim' as const, vencedor: 1 };
    const plano = planoDaTransicao(entrada({ faltas: [{ nome: 'castigo-fora-de-hora' }], vencedor: 1 }, { depois: fim }), CFG);
    expect(plano.aviso?.titulo).toBe('A 8 fora de hora!');
    expect(plano.aviso?.detalhes).toEqual(['Beto vence']);
  });
});

describe('planoDaTransicao: falta que acaba a partida nas duplas', () => {
  it('a equipe vencedora tem dois nomes: "vencem" no plural', () => {
    const duplas = partidaDeTeste({ jogadores: DUPLAS_DE_TESTE, fase: 'fim', vencedor: 1, grupos: ['par', 'impar'], naMesa: [2, 3, 8] });
    const plano = planoDaTransicao(entrada({ faltas: [{ nome: 'castigo-fora-de-hora' }], vencedor: 1 }, { depois: duplas, antes: { ...duplas, fase: 'castigo', vencedor: null } }), CFG);
    expect(plano.aviso?.detalhes).toEqual(['Beto e Dani vencem']);
  });
});

describe('planoDaTransicao: 2x1', () => {
  /** Ana e Caio nas pares, Beto sozinho nas ímpares. */
  const trio = (vez: number, mudancas: Parameters<typeof partidaDeTeste>[0] = {}) =>
    partidaDeTeste({ jogadores: TRIO_DE_TESTE, fase: 'grupos', grupos: ['par', 'impar'], vez, naMesa: [2, 3, 4, 7, 8, 9], ...mudancas });

  it('a falta de quem está sozinho paga para a equipe de 2: os dois nomes, no plural, e o voo vai ao primeiro da roda', () => {
    const plano = planoDaTransicao({ ...entrada({ faltas: [{ nome: 'cegar' }], retirar: [4] }), quemTacou: 1, antes: trio(1), depois: trio(0) }, CFG);
    expect(plano.aviso?.detalhes).toEqual(['Ana e Caio recebem a 4']);
    expect(plano.fases[1]).toMatchObject({ itens: [{ bola: 4, paraJogador: 0 }] });
  });

  it('a falta de qualquer um da equipe de 2 paga para quem está sozinho: no singular, na linha dele', () => {
    for (const quemTacou of [0, 2]) {
      const plano = planoDaTransicao({ ...entrada({ faltas: [{ nome: 'cegar' }], retirar: [3] }), quemTacou, antes: trio(quemTacou), depois: trio(1) }, CFG);
      expect(plano.aviso?.detalhes).toEqual(['Beto recebe a 3']);
      expect(plano.fases[1]).toMatchObject({ itens: [{ bola: 3, paraJogador: 1 }] });
    }
  });

  it('bola da equipe de 2 que cai na tacada do Beto vale para os dois nomes; a ficha voa para a linha da equipe', () => {
    const caiu = trio(1, { naMesa: [2, 3, 7, 8, 9], encacapadas: [{ bola: 4, jogador: 1 }] });
    const plano = planoDaTransicao({ ...entrada({}), quemTacou: 1, antes: trio(1), depois: caiu }, CFG);
    expect(plano.aviso?.detalhes).toEqual(['A 4 vale para Ana e Caio']);
    expect(plano.fases[0]).toMatchObject({ tipo: 'voo', itens: [{ bola: 4, paraJogador: 0, origem: 'cacapa' }] });
  });

  it('falta que acaba a partida: "Beto vence" ou "Ana e Caio vencem", e a vez nomeia o jogador da roda', () => {
    const fimBeto = trio(0, { fase: 'fim', vencedor: 1, naMesa: [8] });
    expect(planoDaTransicao({ ...entrada({ faltas: [{ nome: 'castigo-fora-de-hora' }], vencedor: 1 }), antes: trio(0), depois: fimBeto }, CFG).aviso?.detalhes).toEqual(['Beto vence']);
    const fimDupla = trio(1, { fase: 'fim', vencedor: 0, naMesa: [8] });
    expect(planoDaTransicao({ ...entrada({ faltas: [{ nome: 'castigo-fora-de-hora' }], vencedor: 0 }), quemTacou: 1, antes: trio(1), depois: fimDupla }, CFG).aviso?.detalhes).toEqual(['Ana e Caio vencem']);
    const semBola = planoDaTransicao({ ...entrada({ faltas: [{ nome: 'cegar' }], proximo: 2 }), quemTacou: 1, antes: trio(1), depois: trio(2, { grupos: [null, null], fase: 'aberta' }) }, CFG);
    expect(semBola.aviso?.detalhes).toEqual(['Vez de Caio']);
  });
});

describe('planoDaTransicao: bola do adversário encaçapada', () => {
  const caiuDoBeto = { ...depois, naMesa: [2, 3, 4, 6, 8, 9], encacapadas: [{ bola: 7, jogador: 0 }] };

  it('a bola que cai e conta para o adversário mostra para quem foi: aviso sem falta e voo da caçapa até a ficha dele', () => {
    const plano = planoDaTransicao(entrada({}, { depois: caiuDoBeto }), CFG);
    expect(plano.aviso).toEqual({ titulo: 'Bola do adversário', detalhes: ['A 7 vale para Beto'], bola: { id: 7, estilo: 'listrada' }, falta: false, duracaoS: 4.5 });
    expect(plano.fases).toEqual([{ tipo: 'voo', inicioS: 0, duracaoS: 0.9, itens: [{ bola: 7, paraJogador: 1, origem: 'cacapa' }] }]);
  });

  it('duas bolas dele de uma vez: plural', () => {
    const duas = { ...caiuDoBeto, encacapadas: [{ bola: 7, jogador: 0 }, { bola: 9, jogador: 0 }] };
    expect(planoDaTransicao(entrada({}, { depois: duas }), CFG).aviso?.detalhes).toEqual(['A 7 e a 9 valem para Beto']);
  });

  it('junto com uma falta: o aviso da falta leva as duas linhas e o voo vem depois do anel', () => {
    const plano = planoDaTransicao(entrada({ faltas: [{ nome: 'suicidio' }], retirar: [3] }, { depois: { ...caiuDoBeto, naMesa: [2, 4, 6, 8, 9] } }), CFG);
    expect(plano.aviso?.titulo).toBe('Suicídio!');
    expect(plano.aviso?.detalhes).toEqual(['Beto recebe a 3', 'A 7 vale para Beto']);
    expect(plano.fases.map((f) => f.tipo)).toEqual(['anel', 'voo']);
    expect(plano.fases[1]).toMatchObject({
      itens: [
        { bola: 3, paraJogador: 1, origem: 'mesa' },
        { bola: 7, paraJogador: 1, origem: 'cacapa' },
      ],
    });
  });

  it('só conta quando os grupos já existem (mesa aberta: a bola define o grupo de quem encaçapou)', () => {
    const aberta = partidaDeTeste({ fase: 'grupos', grupos: ['impar', 'par'], vez: 0, encacapadas: [{ bola: 7, jogador: 0 }] });
    expect(planoDaTransicao(entrada({}, { depois: aberta, antes: { ...aberta, encacapadas: [] } }), CFG).fases).toEqual([]);
    const semGrupos = partidaDeTeste({ fase: 'aberta', encacapadas: [{ bola: 7, jogador: 0 }] });
    expect(planoDaTransicao(entrada({}, { depois: semGrupos, antes: { ...semGrupos, encacapadas: [] } }), CFG).fases).toEqual([]);
  });
});

describe('encurtarPlano: a transição cabe na margem do relógio da sala', () => {
  const cegou = entrada({ faltas: [{ nome: 'cegar' }], retirar: [3], recolocar: [{ bola: 0, lugar: 'marca-saida' }] });

  it('mais longa que o limite: todas as fases encolhem na mesma proporção, na mesma ordem, e emendadas', () => {
    const plano = encurtarPlano(planoDaTransicao(cegou, CFG), 1);
    expect(plano.duracaoS).toBeCloseTo(1, 6);
    expect(plano.fases.map((f) => f.tipo)).toEqual(['anel', 'voo', 'deslize']);
    const [a, v, d] = plano.fases;
    expect(a!.duracaoS / 1.5).toBeCloseTo(v!.duracaoS / 0.9, 6);
    expect(a!.inicioS).toBe(0);
    expect(v!.inicioS).toBeCloseTo(a!.duracaoS, 6);
    expect(d!.inicioS).toBeCloseTo(a!.duracaoS + v!.duracaoS, 6);
    expect(d!.inicioS + d!.duracaoS).toBeCloseTo(1, 6);
  });

  it('o aviso fica como está: ele não segura a mira', () => {
    const original = planoDaTransicao(cegou, CFG);
    expect(encurtarPlano(original, 1).aviso).toEqual(original.aviso);
  });

  it('já cabe: devolve o mesmo plano', () => {
    const original = planoDaTransicao(cegou, CFG);
    expect(encurtarPlano(original, 10)).toBe(original);
    expect(encurtarPlano(original, original.duracaoS)).toBe(original);
  });

  it('plano vazio continua vazio', () => {
    const vazio = planoDaTransicao(entrada({}), CFG);
    expect(encurtarPlano(vazio, 1)).toBe(vazio);
  });

  it('limite zero ou negativo vira um plano sem duração (pula tudo)', () => {
    expect(encurtarPlano(planoDaTransicao(cegou, CFG), 0).duracaoS).toBe(0);
    expect(encurtarPlano(planoDaTransicao(cegou, CFG), -3).duracaoS).toBe(0);
  });
});

describe('progressoDaFase', () => {
  const fase = { tipo: 'voo', inicioS: 1.5, duracaoS: 0.9, itens: [] } as const;

  it('0 antes de começar, de 0 a 1 durante e 1 depois', () => {
    expect(progressoDaFase(fase, 0)).toBe(0);
    expect(progressoDaFase(fase, 1.5)).toBe(0);
    expect(progressoDaFase(fase, 1.95)).toBeCloseTo(0.5, 6);
    expect(progressoDaFase(fase, 2.4)).toBe(1);
    expect(progressoDaFase(fase, 9)).toBe(1);
  });

  it('fase sem duração já está pronta', () => {
    expect(progressoDaFase({ ...fase, duracaoS: 0 }, 0)).toBe(1);
  });
});

describe('planoDaTransicao: mata-mata (falta sem pena, bola encaçapada é de quem tacou)', () => {
  const todas = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const mataDepois = partidaDeTeste({ config: CASA_MATA_MATA, jogadores: TRIO_POR_SI, grupos: [null, null, null], fase: 'aberta', vez: 1, naMesa: todas });
  const mataAntes: EstadoPartida = { ...mataDepois, vez: 0 };
  const mata = (c: Partial<Consequencias>, extra: Partial<EntradaDoPlano> = {}): EntradaDoPlano => ({
    consequencias: consequencias({ proximo: 1, ...c }),
    antes: mataAntes,
    depois: mataDepois,
    quemTacou: 0,
    ...extra,
  });

  it('uma tacada que mata bola não tem transição: a bola vale para quem tacou e não voa até ninguém', () => {
    const matou = { ...mataDepois, naMesa: todas.filter((b) => b !== 5), encacapadas: [{ bola: 5, jogador: 0 }] };
    const plano = planoDaTransicao(mata({}, { depois: matou }), CFG);
    expect(plano.fases).toEqual([]);
    expect(plano.aviso).toBeNull();
  });

  it('a falta não paga bola: sem anel, sem voo; só o aviso diz de quem é a vez, e a branca desliza para a marca', () => {
    const plano = planoDaTransicao(mata({ faltas: [{ nome: 'suicidio' }], recolocar: [{ bola: 0, lugar: 'marca-saida' }] }), CFG);
    expect(plano.aviso).toMatchObject({ falta: true, bola: null });
    expect(plano.aviso!.detalhes).toEqual(['Vez de Beto']);
    expect(plano.fases.map((f) => f.tipo)).toEqual(['deslize']);
  });

  it('a falta que acaba a partida diz quem venceu (uma pessoa, no singular)', () => {
    const plano = planoDaTransicao(mata({ faltas: [{ nome: 'cegar' }], vencedor: 2 }, { depois: { ...mataDepois, vencedor: 2, fase: 'fim' } }), CFG);
    expect(plano.aviso!.detalhes).toEqual(['Caio vence']);
  });

  it('bola encaçapada junto com a falta também não voa para outro placar', () => {
    const matou = { ...mataDepois, naMesa: todas.filter((b) => b !== 9), encacapadas: [{ bola: 9, jogador: 0 }] };
    const plano = planoDaTransicao(mata({ faltas: [{ nome: 'cegar' }] }, { depois: matou }), CFG);
    expect(plano.fases.some((f) => f.tipo === 'voo')).toBe(false);
    expect(plano.aviso!.titulo).toBe('Cegou!');
  });

  describe('a pena: quem tacou perde a próxima vez (perdemAProximaVez)', () => {
    const suicidio = { faltas: [{ nome: 'suicidio' as const }], recolocar: [{ bola: 0, lugar: 'marca-saida' as const }] };

    it('o suicídio com a pena diz de quem é a vez e que quem tacou perde a próxima', () => {
      const plano = planoDaTransicao(mata(suicidio, { depois: { ...mataDepois, perdemAProximaVez: [0] } }), CFG);
      expect(plano.aviso).toEqual({ titulo: 'Suicídio!', detalhes: ['Vez de Beto', 'Ana perde a próxima vez'], bola: null, falta: true, duracaoS: 4.5 });
      expect(plano.fases.map((f) => f.tipo)).toEqual(['deslize']);
    });

    it('o nome é o de quem tacou, seja quem for, e não o de quem fica na lista de antes', () => {
      const plano = planoDaTransicao(
        mata(
          { ...suicidio, proximo: 2 },
          { quemTacou: 1, antes: { ...mataAntes, vez: 1, perdemAProximaVez: [0] }, depois: { ...mataDepois, vez: 2, perdemAProximaVez: [0, 1] } },
        ),
        CFG,
      );
      expect(plano.aviso!.detalhes).toEqual(['Vez de Caio', 'Beto perde a próxima vez']);
    });

    it('a roda que pula alguém no meio: o aviso da falta segue dizendo só a vez e a pena de quem tacou', () => {
      const plano = planoDaTransicao(
        mata(
          { ...suicidio, proximo: 0 },
          { quemTacou: 2, antes: { ...mataAntes, vez: 2, perdemAProximaVez: [1] }, depois: { ...mataDepois, vez: 0, perdemAProximaVez: [2] } },
        ),
        CFG,
      );
      expect(plano.aviso!.detalhes).toEqual(['Vez de Ana', 'Caio perde a próxima vez']);
    });

    it('falta sem a pena (a lista não tem quem tacou) fica como era', () => {
      const plano = planoDaTransicao(mata(suicidio), CFG);
      expect(plano.aviso!.detalhes).toEqual(['Vez de Beto']);
    });

    it('cegar sem a pena (a lista não tem quem tacou) não fala de pena', () => {
      const plano = planoDaTransicao(mata({ faltas: [{ nome: 'cegar' }] }), CFG);
      expect(plano.aviso!.detalhes).toEqual(['Vez de Beto']);
    });

    it('cegar com a pena também diz de quem é a vez e que quem tacou perde a próxima, sem branca na marca', () => {
      const plano = planoDaTransicao(mata({ faltas: [{ nome: 'cegar' }] }, { depois: { ...mataDepois, perdemAProximaVez: [0] } }), CFG);
      expect(plano.aviso).toEqual({ titulo: 'Cegou!', detalhes: ['Vez de Beto', 'Ana perde a próxima vez'], bola: null, falta: true, duracaoS: 4.5 });
      expect(plano.fases).toEqual([]);
    });

    it('a pena sai da lista de antes e depois, não do nome da falta: o mesmo cegar, com a lista, em outra roda', () => {
      const plano = planoDaTransicao(
        mata(
          { faltas: [{ nome: 'cegar' }], proximo: 0 },
          { quemTacou: 2, antes: { ...mataAntes, vez: 2, perdemAProximaVez: [1] }, depois: { ...mataDepois, vez: 0, perdemAProximaVez: [2] } },
        ),
        CFG,
      );
      expect(plano.aviso!.detalhes).toEqual(['Vez de Ana', 'Caio perde a próxima vez']);
    });

    it('cegar e suicídio na mesma tacada: os dois nomes no título e uma só linha de pena', () => {
      const plano = planoDaTransicao(
        mata(
          { faltas: [{ nome: 'cegar' }, { nome: 'suicidio' }], recolocar: [{ bola: 0, lugar: 'marca-saida' }] },
          { depois: { ...mataDepois, perdemAProximaVez: [0] } },
        ),
        CFG,
      );
      expect(plano.aviso!.titulo).toBe('Cegou + Suicídio!');
      expect(plano.aviso!.detalhes).toEqual(['Vez de Beto', 'Ana perde a próxima vez']);
      expect(plano.fases.map((f) => f.tipo)).toEqual(['deslize']);
    });

    it('cegar que acaba a partida não leva a pena: o fim não tem lista', () => {
      const plano = planoDaTransicao(mata({ faltas: [{ nome: 'cegar' }], vencedor: 2 }, { depois: { ...mataDepois, vencedor: 2, fase: 'fim' } }), CFG);
      expect(plano.aviso!.detalhes).toEqual(['Caio vence']);
    });

    describe('com as regras de verdade (aplicarTacada)', () => {
      const TACO: EventoTacada = { tipo: 'taco-bola', t: 0, bola: 0, velocidade: 2, miscue: false };
      const PAROU: EventoTacada = { tipo: 'parou', t: 1 };
      const CEGAR: readonly EventoTacada[] = [TACO, PAROU];
      const CEGAR_E_SUICIDIO: readonly EventoTacada[] = [TACO, { tipo: 'cacapa', t: 0.5, bola: 0, cacapa: 'canto-1' }, PAROU];
      const SEM_PENA = { ...CASA_MATA_MATA, cegarNoMataMata: 'sem-pena' as const, suicidioNoMataMata: 'sem-pena' as const };

      const planoDe = (config: typeof CASA_MATA_MATA, eventos: readonly EventoTacada[]) => {
        const inicio = partidaDeTeste({ config, jogadores: TRIO_POR_SI, grupos: [null, null, null], fase: 'aberta', vez: 0, naMesa: todas });
        const { partida, consequencias: c } = REGRAS_DO_PACOTE.aplicarTacada(inicio, eventos);
        return planoDaTransicao({ consequencias: c, antes: inicio, depois: partida, quemTacou: 0 }, CFG);
      };

      it('cegou com a pena de fábrica: o aviso grande diz que Ana perde a próxima vez', () => {
        const plano = planoDe(CASA_MATA_MATA, CEGAR);
        expect(plano.aviso!.titulo).toBe('Cegou!');
        expect(plano.aviso!.detalhes).toEqual(['Vez de Beto', 'Ana perde a próxima vez']);
        expect(plano.fases).toEqual([]);
      });

      it('cegou e a branca caiu: uma só linha de pena e a branca desliza para a marca', () => {
        const plano = planoDe(CASA_MATA_MATA, CEGAR_E_SUICIDIO);
        expect(plano.aviso!.detalhes).toEqual(['Vez de Beto', 'Ana perde a próxima vez']);
        expect(plano.fases.map((f) => f.tipo)).toEqual(['deslize']);
      });

      it('sem a pena nas duas faltas, o aviso fica como era', () => {
        expect(planoDe(SEM_PENA, CEGAR).aviso!.detalhes).toEqual(['Vez de Beto']);
        expect(planoDe(SEM_PENA, CEGAR_E_SUICIDIO).aviso!.detalhes).toEqual(['Vez de Beto']);
      });

      it('só cegar punido: o suicídio sem pena não tira a linha, e só suicídio punido não pune o cegar', () => {
        const soCegar = { ...CASA_MATA_MATA, suicidioNoMataMata: 'sem-pena' as const };
        const soSuicidio = { ...CASA_MATA_MATA, cegarNoMataMata: 'sem-pena' as const };
        expect(planoDe(soCegar, CEGAR).aviso!.detalhes).toEqual(['Vez de Beto', 'Ana perde a próxima vez']);
        expect(planoDe(soSuicidio, CEGAR).aviso!.detalhes).toEqual(['Vez de Beto']);
        expect(planoDe(soSuicidio, CEGAR_E_SUICIDIO).aviso!.detalhes).toEqual(['Vez de Beto', 'Ana perde a próxima vez']);
      });
    });

    it('a pena não aparece no fim da partida, que não leva lista', () => {
      const plano = planoDaTransicao(mata({ ...suicidio, vencedor: 2 }, { depois: { ...mataDepois, vencedor: 2, fase: 'fim' } }), CFG);
      expect(plano.aviso!.detalhes).toEqual(['Caio vence']);
    });

    it('o plano das fases é o mesmo com ou sem a pena: só o aviso muda', () => {
      const com = planoDaTransicao(mata(suicidio, { depois: { ...mataDepois, perdemAProximaVez: [0] } }), CFG);
      const sem = planoDaTransicao(mata(suicidio), CFG);
      expect(com.fases).toEqual(sem.fases);
      expect(com.duracaoS).toBe(sem.duracaoS);
    });
  });
});
