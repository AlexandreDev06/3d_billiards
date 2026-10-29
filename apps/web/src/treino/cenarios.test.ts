import { CONFIG_FISICA_PADRAO, ID_BOLAO, criarRng, simularTacada, type ParametrosTacada } from '@sinuca/fisica';
import { missaoDoCatalogo } from '@sinuca/protocolo';
import { PRESET_TREINO, bolasDaCasa, novaPartida, sincronizarMesa } from '@sinuca/regras';
import { describe, expect, it } from 'vitest';
import { REGRAS_DO_PACOTE } from '../jogo/regras';
import { Jogo } from '../jogo/jogo';
import { CENARIOS_DE_TREINO, cenarioDeTreino, mesaDoCenario, type IdDoCenario } from './cenarios';
import { cabeNoPonto } from './mesa-de-treino';
import { cumpreAMissao } from './missoes-de-prova';

const cfg = CONFIG_FISICA_PADRAO;
const jogador = [{ id: 'j1', nome: 'Treino', equipe: 0 }] as const;

/** Uma tacada que cumpre a missão de cada cenário, achada na varredura da física real (`.outros/lote-42/refina3.mts`), no meio da janela. */
const TACADA_DE_PROVA: Readonly<Record<IdDoCenario, { graus: number; velocidade: number }>> = {
  tabelada: { graus: 222.03, velocidade: 3 },
  'de-longe': { graus: 29.89, velocidade: 3 },
  'volta-ao-mundo': { graus: 34.34, velocidade: 3 },
};

const parametros = (graus: number, velocidade: number): ParametrosTacada => ({
  angulo: (graus * Math.PI) / 180,
  velocidadeTaco: velocidade,
  efeito: { lateral: 0, vertical: 0 },
  elevacao: 0,
  giz: 1,
});

function armado(id: IdDoCenario) {
  const cenario = cenarioDeTreino(id);
  const { partida } = novaPartida(PRESET_TREINO.regras, jogador, criarRng(1));
  return { cenario, mesa: mesaDoCenario(cenario), partida: sincronizarMesa(partida, cenario.bolas.map((b) => b.id)) };
}

const cumpre = (id: IdDoCenario, graus: number, velocidade: number): boolean => {
  const { mesa, partida } = armado(id);
  return cumpreAMissao(id, partida, simularTacada(mesa, parametros(graus, velocidade), criarRng(1), cfg));
};

describe('cenários do treino', () => {
  it('são as três missões difíceis, com o nome e a descrição do catálogo', () => {
    expect(CENARIOS_DE_TREINO.map((c) => c.id)).toEqual(['tabelada', 'de-longe', 'volta-ao-mundo']);
    for (const c of CENARIOS_DE_TREINO) {
      expect(c.nome).toBe(missaoDoCatalogo(c.id).nome);
      expect(c.descricao).toBe(missaoDoCatalogo(c.id).descricao);
    }
    expect(CENARIOS_DE_TREINO.map((c) => c.nome)).toEqual(['Tabelada', 'De longe', 'Volta ao mundo']);
  });

  it('cada mesa tem a branca e bolas da casa, cada uma onde cabe (sem encostar em nada)', () => {
    for (const c of CENARIOS_DE_TREINO) {
      const mesa = mesaDoCenario(c);
      expect(mesa.bolas.filter((b) => b.id === ID_BOLAO)).toHaveLength(1);
      const casa = bolasDaCasa(PRESET_TREINO.regras);
      for (const b of mesa.bolas) {
        expect(mesa.bolas.filter((o) => o.id === b.id)).toHaveLength(1);
        if (b.id !== ID_BOLAO) expect(casa).toContain(b.id);
        expect(cabeNoPonto(mesa, b.id, { x: b.posicao.x, z: b.posicao.z }, cfg), `${c.id}: bola ${b.id}`).toBe(true);
      }
    }
  });

  it('as regras do treino aceitam a mesa do cenário (sincronizarMesa)', () => {
    for (const c of CENARIOS_DE_TREINO) {
      const { partida } = armado(c.id);
      expect(partida.naMesa).toEqual(c.bolas.map((b) => b.id).sort((a, b) => a - b));
    }
  });

  for (const id of ['tabelada', 'de-longe', 'volta-ao-mundo'] as const) {
    describe(id, () => {
      const prova = TACADA_DE_PROVA[id];

      it('tem uma tacada que cumpre a missão, pela física real', () => {
        expect(cumpre(id, prova.graus, prova.velocidade)).toBe(true);
      });

      it('uma tacada qualquer não a cumpre (a conferência discrimina)', () => {
        expect(cumpre(id, prova.graus + 5, prova.velocidade)).toBe(false);
        expect(cumpre(id, prova.graus - 5, prova.velocidade)).toBe(false);
      });

      it('a jogada é difícil na medida: a janela de pontaria é estreita, mas existe', () => {
        let acertos = 0;
        const passo = 0.05;
        for (let g = prova.graus - 4; g <= prova.graus + 4 + 1e-9; g += passo) if (cumpre(id, g, prova.velocidade)) acertos++;
        const janela = acertos * passo;
        expect(janela).toBeGreaterThanOrEqual(0.3);
        expect(janela).toBeLessThanOrEqual(3);
      });

      it('no jogo de verdade (Jogo + regras do treino) a tacada não é falta', () => {
        const { cenario, partida, mesa } = armado(id);
        const jogo = Jogo.restaurar({ regras: REGRAS_DO_PACOTE, simular: simularTacada, fisica: cfg }, partida, mesa, criarRng(1));
        jogo.tacar(parametros(prova.graus, prova.velocidade));
        const consequencias = jogo.concluir();
        expect(consequencias.faltas).toEqual([]);
        if (id !== 'volta-ao-mundo') expect(jogo.partida.encacapadas.map((e) => e.bola)).toContain(cenario.bolas[0]!.id);
      });
    });
  }

  it('de longe: a bola está a mais de 1,5 m da branca', () => {
    const c = cenarioDeTreino('de-longe');
    expect(Math.hypot(c.branca.x - c.bolas[0]!.x, c.branca.z - c.bolas[0]!.z)).toBeGreaterThan(missaoDoCatalogo('de-longe').limiar!);
  });

  it('só uma fração pequena dos ângulos cumpre cada missão (varredura de 2° em 2°)', () => {
    for (const id of ['tabelada', 'de-longe', 'volta-ao-mundo'] as const) {
      let acertos = 0;
      for (let g = 0; g < 360; g += 2) if (cumpre(id, g, 3)) acertos++;
      expect(acertos, id).toBeLessThanOrEqual(6);
    }
  });
});
