import { APARENCIA_PADRAO, type AparenciaDoBalao } from '@sinuca/protocolo';
import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { balaoDoArtista, chapeusDoArtista } from '../maos/para-testes';
import { estadoVazioDoBalao, type EstadoDoBalao } from './balao';
import { BaloesDoArtista } from './balao-do-artista';
import { CarregadorDeChapeus } from './chapeus';

const BASE = await balaoDoArtista();
const CHAPEUS = await chapeusDoArtista();

const ana: AparenciaDoBalao = { chapeu: 'coroa', bigode: 'bigode_dali', olhos: 'olho_kawaii', corDosOlhos: 'verde' };
const beto: AparenciaDoBalao = { chapeu: null, bigode: 'bigodao', olhos: 'olho_bravo', corDosOlhos: 'azul' };

const estado = (mudancas: Partial<EstadoDoBalao> = {}): EstadoDoBalao => ({ ...estadoVazioDoBalao(), escala: 1, cor: 0x3aa0ff, ...mudancas });

/** Os balões com um carregador de chapéus de mentira: o arquivo só chega quando o teste manda (`chegar`). */
function montar() {
  let liberar: () => void = () => undefined;
  let pedidos = 0;
  const carregador = new CarregadorDeChapeus(
    () => {
      pedidos++;
      return new Promise((resolver) => {
        liberar = () => resolver(CHAPEUS);
      });
    },
    15_000,
  );
  let ganhos = 0;
  const b = new BaloesDoArtista(CONFIG_WEB.baloes, BASE, 'alto', () => 0.5, 4, carregador, () => ganhos++);
  return {
    b,
    carregador,
    pedidos: () => pedidos,
    ganhos: () => ganhos,
    chegar: async () => {
      liberar();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('BaloesDoArtista: a aparência que a sala manda', () => {
  it('nasce com o balão padrão e nunca baixa o arquivo dos chapéus se ninguém usa chapéu', () => {
    const m = montar();
    for (let i = 0; i < 4; i++) m.b.definirAparencia(i, APARENCIA_PADRAO);
    m.b.definirAparencia(1, beto);
    expect(m.pedidos()).toBe(0);
    expect(m.carregador.estado).toBe('parado');
    expect(m.b.diagnostico(0).aparencia).toEqual({ acessorio: null, bigode: null, estiloDeOlho: 'olho_normal', corDosOlhos: 'castanho' });
    m.b.descartar();
  });

  it('cada equipe veste a aparência dela: a Ana de coroa e bigode, o Beto de bigode e olho bravo', async () => {
    const m = montar();
    m.b.definirAparencia(0, ana);
    m.b.definirAparencia(1, beto);
    m.b.definirAparencia(2, APARENCIA_PADRAO);
    // o chapéu da Ana espera o arquivo; o resto já vale
    expect(m.b.diagnostico(0).aparencia).toEqual({ acessorio: null, bigode: 'bigode_dali', estiloDeOlho: 'olho_kawaii', corDosOlhos: 'verde' });
    await m.chegar();
    expect(m.b.diagnostico(0).aparencia).toEqual({ acessorio: 'coroa', bigode: 'bigode_dali', estiloDeOlho: 'olho_kawaii', corDosOlhos: 'verde' });
    expect(m.b.diagnostico(1).aparencia).toEqual({ acessorio: null, bigode: 'bigodao', estiloDeOlho: 'olho_bravo', corDosOlhos: 'azul' });
    expect(m.b.diagnostico(2).aparencia).toEqual({ acessorio: null, bigode: null, estiloDeOlho: 'olho_normal', corDosOlhos: 'castanho' });
    m.b.descartar();
  });

  it('o arquivo dos chapéus baixa uma vez só, por mais balões e quadros que peçam, e o jogo é avisado de que ganhou malha para refazer as variantes', async () => {
    const m = montar();
    for (let q = 0; q < 5; q++) {
      m.b.definirAparencia(0, ana);
      m.b.definirAparencia(3, { ...ana, bigode: null });
    }
    expect(m.pedidos()).toBe(1);
    expect(m.ganhos()).toBe(0);
    await m.chegar();
    expect(m.pedidos()).toBe(1);
    expect(m.ganhos()).toBe(1);
    expect(m.b.diagnostico(3).aparencia.acessorio).toBe('coroa');
    m.b.descartar();
  });

  it('a troca no meio da partida aplica sem recarregar: tira o chapéu, muda o bigode, o estilo e a cor, e a mesma aparência de novo não faz nada', async () => {
    const m = montar();
    m.b.definirAparencia(0, ana);
    await m.chegar();
    const ganhos = m.ganhos();
    m.b.definirAparencia(0, beto);
    expect(m.b.diagnostico(0).aparencia).toEqual({ acessorio: null, bigode: 'bigodao', estiloDeOlho: 'olho_bravo', corDosOlhos: 'azul' });
    m.b.definirAparencia(0, beto);
    m.b.definirAparencia(0, { ...beto });
    expect(m.pedidos()).toBe(1);
    // volta ao chapéu: o arquivo já está aqui, entra na hora
    m.b.definirAparencia(0, ana);
    expect(m.b.diagnostico(0).aparencia.acessorio).toBe('coroa');
    expect(m.ganhos()).toBe(ganhos + 1);
    m.b.descartar();
  });

  it('um chapéu pedido e trocado antes de o arquivo chegar vale o último', async () => {
    const m = montar();
    m.b.definirAparencia(0, ana);
    m.b.definirAparencia(0, { ...ana, chapeu: 'cartola' });
    await m.chegar();
    expect(m.b.diagnostico(0).aparencia.acessorio).toBe('cartola');
    m.b.descartar();
  });

  it('um chapéu pedido e tirado antes de o arquivo chegar não aparece depois', async () => {
    const m = montar();
    m.b.definirAparencia(0, ana);
    m.b.definirAparencia(0, APARENCIA_PADRAO);
    await m.chegar();
    expect(m.b.diagnostico(0).aparencia.acessorio).toBeNull();
    m.b.descartar();
  });

  it('o nível de qualidade vale também para o chapéu e o bigode (malha alta e baixa)', async () => {
    const m = montar();
    m.b.definirAparencia(0, ana);
    await m.chegar();
    const g = m.b.grupo.children[0]!;
    const visivel = (nome: string): boolean => g.getObjectByName(nome)!.visible;
    expect([visivel('coroa_alta'), visivel('coroa_baixa'), visivel('bigode_dali_alta'), visivel('bigode_dali_baixa')]).toEqual([true, false, true, false]);
    m.b.definirNivel('baixo');
    expect([visivel('coroa_alta'), visivel('coroa_baixa'), visivel('bigode_dali_alta'), visivel('bigode_dali_baixa')]).toEqual([false, true, false, true]);
    m.b.definirNivel('medio');
    expect([visivel('coroa_alta'), visivel('coroa_baixa'), visivel('bigode_dali_alta'), visivel('bigode_dali_baixa')]).toEqual([true, false, true, false]);
    m.b.descartar();
  });

  it('o balão vestido segue funcionando em cena: mostrar a cada quadro com chapéu, bigode e estilo não lança e o bigode anda com o rosto', async () => {
    const m = montar();
    m.b.definirAparencia(0, ana);
    await m.chegar();
    const e = estado({ cara: 'sorriso', x: 0.2, y: 0.4, z: 0.1 });
    for (let q = 0; q < 60; q++) {
      e.tempoS += 1 / 30;
      m.b.mostrar(0, e);
    }
    const g = m.b.grupo.children[0]!;
    const bigode = g.getObjectByName('bigode_dali_alta') as unknown as { morphTargetInfluences: number[]; morphTargetDictionary: Record<string, number> };
    expect(bigode.morphTargetInfluences[bigode.morphTargetDictionary['cara_sorriso']!]).toBeGreaterThan(0.5);
    m.b.descartar();
  });
});
