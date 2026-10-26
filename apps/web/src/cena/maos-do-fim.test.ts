import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG_WEB } from '../config';
import { maoDoArtista } from '../maos/para-testes';
import { quadroVazio } from '@sinuca/personagens';
import { MaosDoFim, type AncorasDasMaos, type LugarDasMaosDoFim } from './maos-do-fim';

const cfg = CONFIG_WEB.maos;
const BASE = await maoDoArtista();
const PALMAS = BASE.modelo.contatos.gestos.get('palmas')!;

function lugar(mudancas: Partial<LugarDasMaosDoFim> = {}): LugarDasMaosDoFim {
  return { x: 1, y: 0.8, z: -1.5, yaw: 0.4, escala: 1, ganhou: true, cor: 0x2f78c8, ...mudancas };
}

function pronto(): MaosDoFim {
  const m = new MaosDoFim(cfg, 'baixo');
  m.usar(BASE);
  return m;
}

/** O que a mão `lado` da equipe `i` pergunta ao mundo: o ponto do arquivo (espelhado na esquerda) na cena. */
function noMundo(m: MaosDoFim, nome: string, ponto: readonly [number, number, number], espelho: boolean): Vector3 {
  const raiz = m.grupo.getObjectByName(nome)!;
  raiz.updateWorldMatrix(true, false);
  return raiz.localToWorld(new Vector3(espelho ? -ponto[0] : ponto[0], ponto[1], ponto[2]));
}

function ancoras(escalaDoCorpo = 4.34): AncorasDasMaos {
  const esquerda = quadroVazio();
  const direita = quadroVazio();
  esquerda.px = 1.2;
  esquerda.py = 0.5;
  esquerda.pz = -1.4;
  direita.px = 0.8;
  direita.py = 0.5;
  direita.pz = -1.6;
  return { esquerda, direita, escalaDoCorpo };
}

describe('MaosDoFim: o fim da partida nas mãos', () => {
  it('nasce vazio e só cria as mãos de uma equipe quando ela aparece', () => {
    const m = pronto();
    expect(m.grupo.children).toHaveLength(0);
    m.mostrar(0, lugar(), 0.016);
    expect(m.grupo.children).toHaveLength(2);
    m.mostrar(2, lugar(), 0.016);
    expect(m.grupo.children).toHaveLength(4);
  });

  it('quem ganhou bate palmas com as duas mãos; quem perdeu fica com a mão mole', () => {
    const m = pronto();
    m.mostrar(0, lugar({ ganhou: true }), 0.016);
    m.mostrar(1, lugar({ ganhou: false }), 0.016);
    const d = m.diagnostico();
    expect(d[0]).toMatchObject({ direita: 'palmas', esquerda: 'palmas' });
    expect(d[1]).toMatchObject({ direita: 'mole', esquerda: 'mole' });
  });

  it('as palmas se encontram: no instante do contato as duas mãos tocam o mesmo ponto', () => {
    const m = pronto();
    const l = lugar();
    let t = 0;
    const pico = PALMAS.quadros[0]! / 30;
    while (t < pico + cfg.reacoes.fim.palmasEntradaS + 0.005) {
      m.mostrar(0, l, 0.005);
      t += 0.005;
    }
    const direita = noMundo(m, 'fim-0-direita', PALMAS.ponto, false);
    const esquerda = noMundo(m, 'fim-0-esquerda', PALMAS.ponto, true);
    expect(direita.distanceTo(esquerda)).toBeLessThan(0.02);
  });

  it('a mão mole fica com os dedos para longe da câmera e o dorso para cima', () => {
    const m = pronto();
    m.mostrar(0, lugar({ ganhou: false, yaw: 0 }), 0.016);
    const raiz = m.grupo.getObjectByName('fim-0-direita')!;
    const dorso = new Vector3(0, 0, 1).applyQuaternion(raiz.quaternion);
    const dedos = new Vector3(0, 1, 0).applyQuaternion(raiz.quaternion);
    expect(dorso.y).toBeCloseTo(1, 6);
    // yaw 0: a câmera está em +Z, os dedos vão para −Z.
    expect(dedos.z).toBeCloseTo(-1, 6);
  });

  it('cada equipe tem a cor dela, nas duas mãos, sem tingir as de mais ninguém', () => {
    const m = pronto();
    m.mostrar(0, lugar({ cor: 0x2f78c8 }), 0.016);
    m.mostrar(1, lugar({ cor: 0xe07a1f, ganhou: false }), 0.016);
    const cores = m.diagnostico().map((e) => e.cor);
    expect(cores).toEqual([0x2f78c8, 0xe07a1f]);
    expect(m.materiaisDe(0)[0]).not.toBe(m.materiaisDe(1)[0]);
    expect(m.materiaisDe(0)[0]).toBe(m.materiaisDe(0)[0]);
  });

  it('a mão escala com o balão e some com ele; `esconderTodas` apaga tudo', () => {
    const m = pronto();
    m.mostrar(0, lugar({ escala: 0.5 }), 0.016);
    const raiz = m.grupo.getObjectByName('fim-0-direita')!;
    expect(raiz.visible).toBe(true);
    expect(raiz.scale.x).toBeCloseTo(cfg.escala * cfg.reacoes.fim.escala * 0.5, 9);
    m.mostrar(0, lugar({ escala: 0 }), 0.016);
    expect(raiz.visible).toBe(false);
    m.mostrar(0, lugar(), 0.016);
    m.esconderTodas();
    for (const filho of m.grupo.children) expect(filho.visible).toBe(false);
  });

  it('não aloca: os mesmos ossos e materiais a cada quadro', () => {
    const m = pronto();
    m.mostrar(0, lugar(), 0.016);
    const materiais = m.materiaisDe(0).slice();
    for (let i = 0; i < 30; i++) m.mostrar(0, lugar({ yaw: i * 0.1 }), 0.016);
    expect(m.materiaisDe(0)).toEqual(materiais);
    expect(m.grupo.children).toHaveLength(2);
  });
  describe('presas ao balão do artista', () => {
    it('a mão fica na âncora dela (a esquerda, espelhada, na mao_esq) e fecha com o tamanho do corpo', () => {
      const m = pronto();
      const a = ancoras(4.34);
      m.mostrar(0, lugar({ ganhou: false }), 0.016, a);
      const direita = m.grupo.getObjectByName('fim-0-direita')!;
      const esquerda = m.grupo.getObjectByName('fim-0-esquerda')!;
      expect(direita.position.x).toBeCloseTo(0.8, 9);
      expect(direita.position.z).toBeCloseTo(-1.6, 9);
      expect(esquerda.position.x).toBeCloseTo(1.2, 9);
      expect(direita.scale.x).toBeCloseTo(4.34 * cfg.reacoes.fim.escalaNoBalao, 9);
    });

    it('a mão acompanha o balão: se a âncora sobe, ela sobe junto', () => {
      const m = pronto();
      const a = ancoras();
      m.mostrar(0, lugar(), 0.016, a);
      const antes = m.grupo.getObjectByName('fim-0-direita')!.position.y;
      a.direita.py += 0.2;
      m.mostrar(0, lugar(), 0.016, a);
      expect(m.grupo.getObjectByName('fim-0-direita')!.position.y).toBeCloseTo(antes + 0.2, 9);
    });

    it('quem ganhou dá socos no ar (e dá de novo quando o gesto acaba); quem perdeu fica com a mão mole', () => {
      const m = pronto();
      const a = ancoras();
      m.mostrar(0, lugar({ ganhou: true }), 0.016, a);
      m.mostrar(1, lugar({ ganhou: false }), 0.016, a);
      expect(m.diagnostico()[0]).toMatchObject({ direita: 'soco_ar', esquerda: 'soco_ar' });
      expect(m.diagnostico()[1]).toMatchObject({ direita: 'mole', esquerda: 'mole' });
      const vistos = new Set<string | null>();
      for (let i = 0; i < 400; i++) {
        m.mostrar(0, lugar({ ganhou: true }), 0.016, a);
        vistos.add(m.diagnostico()[0]!.direita);
      }
      expect(vistos.has('soco_ar')).toBe(true);
      expect(m.diagnostico()[0]!.direita).not.toBeNull();
    });

    it('sem âncoras as palmas de antes continuam valendo (o balão de reserva)', () => {
      const m = pronto();
      m.mostrar(0, lugar({ ganhou: true }), 0.016, null);
      expect(m.diagnostico()[0]).toMatchObject({ direita: 'palmas', esquerda: 'palmas' });
    });
  });
});
