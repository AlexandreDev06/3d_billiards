import { describe, expect, it } from 'vitest';
import { ID_BOLAO, criarRng, simularTacada, type EventoTacada } from '@sinuca/fisica';
import { PRESET_BOTECO } from '@sinuca/regras';
import { CONFIG_WEB } from '../config';
import { Jogo } from '../jogo/jogo';
import { REGRAS_DO_PACOTE } from '../jogo/regras';
import { pedidoDoEvento, volumeDaVelocidade } from './mapeamento';

/** Tacada na bola do centro do triângulo, com a força que o jogo der, e os eventos que ela causa (física e regras reais). */
function quebra(velocidadeTaco: number, semente = 1): readonly EventoTacada[] {
  const jogo = new Jogo({ regras: REGRAS_DO_PACOTE, simular: simularTacada }, PRESET_BOTECO.regras, [{ id: 'a', nome: 'Ana', equipe: 0 }, { id: 'b', nome: 'Beto', equipe: 1 }], criarRng(semente));
  const bolao = jogo.mesa.bolas.find((b) => b.id === ID_BOLAO)!;
  const centro = jogo.mesa.bolas.find((b) => b.id === 8)!;
  const angulo = Math.atan2(centro.posicao.z - bolao.posicao.z, centro.posicao.x - bolao.posicao.x);
  return jogo.tacar({ angulo, velocidadeTaco, efeito: { lateral: 0, vertical: 0 }, elevacao: 0, giz: 1 }).eventos;
}

const picoDeImpacto = (eventos: readonly EventoTacada[]): number =>
  Math.max(...eventos.map((e) => (e.tipo === 'taco-bola' || e.tipo === 'bola-bola' || e.tipo === 'bola-tabela' ? e.velocidade : 0)));

describe('escala do som: a velocidade do impacto que dá o volume cheio', () => {
  it('é a que o jogo alcança com a força pela metade (~3 m/s), não a de antes (6 m/s, que nunca soava cheio)', () => {
    expect(CONFIG_WEB.audio.velocidadeCheia).toBe(3);
  });

  it('a quebra com a força máxima do jogo passa da velocidade cheia: o impacto mais forte soa no volume máximo', () => {
    const eventos = quebra(CONFIG_WEB.tacada.velocidadeMax);
    expect(picoDeImpacto(eventos)).toBeGreaterThanOrEqual(CONFIG_WEB.audio.velocidadeCheia);
    const volumes = eventos.map((e) => pedidoDoEvento(e, CONFIG_WEB.audio)?.volume ?? 0);
    expect(Math.max(...volumes)).toBe(1);
  });

  it('uma tacada suave não chega ao volume cheio: sobra escala para as fracas', () => {
    const eventos = quebra(0.8);
    expect(picoDeImpacto(eventos)).toBeLessThan(CONFIG_WEB.audio.velocidadeCheia);
    expect(Math.max(...eventos.map((e) => pedidoDoEvento(e, CONFIG_WEB.audio)?.volume ?? 0))).toBeLessThan(0.9);
  });

  it('o volume cresce com a velocidade em toda a faixa que o jogo alcança', () => {
    const v = [0.3, 0.8, 1.5, 2.2, 3].map((x) => volumeDaVelocidade(x, CONFIG_WEB.audio));
    for (let i = 1; i < v.length; i++) expect(v[i]!).toBeGreaterThan(v[i - 1]!);
  });
});
