import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshPhysicalMaterial, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { Cinematica } from '../cinematica';
import { raioNoPonto } from '../contatos';
import { pelarMalha } from '../malha';
import { fichaDoGltf, malhaDoNivel, malhasDoNivel, NOMES_DAS_MALHAS_PADRAO } from './ficha-do-gltf';
import { carregarPersonagemDeBytes, type BaseDoPersonagem } from './carregar';
import { TEMPO_DO_PERFILADOR_MS, provarSemAlocar } from '../alocacao-para-testes';

const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../arte/personagens/exportados');
const glb = readFileSync(resolve(PASTA, 'mao.glb'));
const bytes = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
const contatos = JSON.parse(readFileSync(resolve(PASTA, 'mao-taco.json'), 'utf8')) as unknown;
const meta = JSON.parse(readFileSync(resolve(PASTA, 'mao-meta.json'), 'utf8')) as unknown;

let base: BaseDoPersonagem;
beforeAll(async () => {
  base = await carregarPersonagemDeBytes(bytes.slice(0), contatos, { cor: 0xd03030, meta });
});


describe('mão do artista', () => {
  it('traz as poses e o gesto combinados, com as duas malhas', () => {
    const nomes = [...base.modelo.ficha.poses.keys()].sort();
    // O artista acrescenta poses (as outras pontes); o jogo usa estas.
    expect(nomes).toEqual(expect.arrayContaining(['abert' + 'a', 'apontar', 'pinca', 'ponte_v', 'punho', 'repouso']));
    expect(base.triangulos('alta')).toBeGreaterThan(base.triangulos('baixa') * 3);
    expect(base.triangulos('alta')).toBeLessThan(8000);
    expect([...base.modelo.contatos.cilindros.keys()]).toEqual(expect.arrayContaining(['ponte_v', 'punho']));
    expect([...base.modelo.contatos.pincas.keys()]).toEqual(['pinca']);
  });

  it('as correntes dos dedos saem dos ossos e medem a ponta na malha', () => {
    expect(base.modelo.correntes.size).toBe(5);
    for (const c of base.modelo.correntes.values()) {
      expect(c.raioDaPonta).toBeGreaterThan(0.005);
      expect(c.raioDaPonta).toBeLessThan(0.02);
    }
  });

  it('as instâncias compartilham geometria e materiais com a base', () => {
    const a = base.instanciar(false);
    const b = base.instanciar(true);
    const geometrias = (p: typeof a): unknown[] => {
      const g: unknown[] = [];
      p.raiz.traverse((o) => {
        if (o instanceof SkinnedMesh) g.push(o.geometry, o.material);
      });
      return g;
    };
    expect(geometrias(a)).toEqual(geometrias(b));
    expect(geometrias(a).length).toBeGreaterThan(0);
    for (const m of base.latex) {
      expect(m).toBeInstanceOf(MeshPhysicalMaterial);
      expect(m.clearcoat).toBeGreaterThan(0.5);
    }
  });

  it('tingir muda a cor de todo o látex sem trocar o material', () => {
    const antes = [...base.latex];
    base.tingir(0x2050d0);
    expect(base.cor).toBe(0x2050d0);
    expect(base.latex).toEqual(antes);
    for (const m of base.latex) expect(m.emissive.getHex()).not.toBe(0);
    base.tingir(0xd03030);
  });

  it('cada nível mostra uma malha só', () => {
    const p = base.instanciar(false);
    const visiveis = (): string[] => {
      const nomes: string[] = [];
      p.raiz.traverse((o) => {
        if (o instanceof SkinnedMesh && o.visible) nomes.push(o.parent?.name ?? '');
      });
      return nomes;
    };
    p.definirNivel('alto');
    const alto = visiveis();
    p.definirNivel('baixo');
    const baixo = visiveis();
    expect(alto.length).toBeGreaterThan(0);
    expect(baixo.length).toBeGreaterThan(0);
    expect(alto.filter((n) => baixo.includes(n)).length).toBe(0);
    p.definirNivel('medio');
    expect(visiveis()).toEqual(alto);
  });

  it('em cada pose os ossos do Three ficam onde a ficha diz (mão direita e esquerda)', () => {
    for (const espelho of [false, true]) {
      const p = base.instanciar(espelho);
      const v = new Vector3();
      for (const [nome, dados] of base.modelo.ficha.poses) {
        p.ir(nome, 0);
        p.atualizar(0);
        p.raiz.updateMatrixWorld(true);
        const c = new Cinematica(base.modelo.ficha).calcular(dados);
        base.modelo.ficha.ossos.forEach((o, i) => {
          p.osso(o.nome).getWorldPosition(v);
          expect(v.x).toBeCloseTo((espelho ? -1 : 1) * c.posicao[3 * i]!, 4);
          expect(v.y).toBeCloseTo(c.posicao[3 * i + 1]!, 4);
          expect(v.z).toBeCloseTo(c.posicao[3 * i + 2]!, 4);
        });
      }
    }
  });

  it('a dobra a mais fecha o dedo (a ponta vai para o lado da palma) e zero devolve a pose', () => {
    const p = base.instanciar(false);
    p.ir('aberta', 0);
    p.atualizar(0);
    const v = new Vector3();
    const ultimo = base.modelo.ficha.ossos[base.modelo.correntes.get('indicador')!.ossos.at(-1)!]!.nome;
    p.raiz.updateMatrixWorld(true);
    const reto = p.osso(ultimo).getWorldPosition(v).clone();
    p.dobrar('indicador', 0.6);
    p.atualizar(0);
    p.raiz.updateMatrixWorld(true);
    const dobrado = p.osso(ultimo).getWorldPosition(v).clone();
    expect(dobrado.z).toBeLessThan(reto.z - 0.01);
    p.dobrar('indicador', 0);
    p.atualizar(0);
    p.raiz.updateMatrixWorld(true);
    expect(p.osso(ultimo).getWorldPosition(v).distanceTo(reto)).toBeLessThan(1e-5);
  });

  it('a dobra com a pose parada não se soma a cada quadro', () => {
    const p = base.instanciar(false);
    p.ir('aberta', 0);
    p.dobrar('medio', 0.5);
    p.atualizar(0);
    const ultimo = base.modelo.ficha.ossos[base.modelo.correntes.get('medio')!.ossos.at(-1)!]!.nome;
    const v = new Vector3();
    p.raiz.updateMatrixWorld(true);
    const primeiro = p.osso(ultimo).getWorldPosition(v).clone();
    for (let i = 0; i < 10; i++) p.atualizar(0.016);
    p.raiz.updateMatrixWorld(true);
    expect(p.osso(ultimo).getWorldPosition(v).distanceTo(primeiro)).toBeLessThan(1e-6);
  });

  it('o gesto entra por cima das poses, termina sozinho e uma pose desconhecida lança', () => {
    const p = base.instanciar(false);
    p.ir('repouso', 0);
    p.fazerGesto('joinha', 0.2, 0.2);
    expect(p.gestoEmCurso).toBe('joinha');
    for (let i = 0; i < 20; i++) p.atualizar(0.1);
    expect(p.gestoEmCurso).toBeNull();
    expect(() => p.fazerGesto('nada', 0, 0)).toThrow(/nada/);
    expect(() => p.ir('nada', 0)).toThrow(/nada/);
  });

  it('as pontes novas e os gestos novos vêm como poses e gestos (e o respirar, que é aditivo, fica à parte)', () => {
    const p = base.instanciar(false);
    for (const pose of ['ponte_laco', 'ponte_elevada', 'ponte_tabela', 'ponte_colada', 'ponte_canto']) expect(() => p.ir(pose, 0)).not.toThrow();
    for (const gesto of ['soco_ar', 'tapinha', 'quase', 'palmas', 'tamborilar', 'mole']) expect(() => p.fazerGesto(gesto, 0, 0)).not.toThrow();
    expect(() => p.fazerGesto('respirar', 0, 0)).toThrow(/respirar/);
    expect(p.aditivos).toEqual(['respirar']);
  });

  it('sobrepor põe a pose por cima da base (a pinça sobre a ponte) e zero a tira', () => {
    const p = base.instanciar(false);
    const v = new Vector3();
    const ponta = base.modelo.ficha.ossos[base.modelo.correntes.get('polegar')!.ossos.at(-1)!]!.nome;
    const ondeEsta = (): Vector3 => {
      p.atualizar(0);
      p.raiz.updateMatrixWorld(true);
      return p.osso(ponta).getWorldPosition(v).clone();
    };
    p.ir('ponte_v', 0);
    const ponte = ondeEsta();
    p.ir('pinca', 0);
    const pinca = ondeEsta();
    expect(ponte.distanceTo(pinca)).toBeGreaterThan(0.01);
    p.ir('ponte_v', 0);
    p.sobrepor('pinca', 1);
    expect(ondeEsta().distanceTo(pinca)).toBeLessThan(1e-4);
    p.sobrepor('pinca', 0);
    expect(ondeEsta().distanceTo(ponte)).toBeLessThan(1e-4);
  });

  it('o respirar aditivo mexe nos ossos sem tirar a pose, só enquanto o peso é maior que zero', () => {
    const p = base.instanciar(false);
    const v = new Vector3();
    p.ir('punho', 0);
    const onde = (): Vector3 => {
      p.raiz.updateMatrixWorld(true);
      return p.osso('indicador_3').getWorldPosition(v).clone();
    };
    p.atualizar(0);
    const parado = onde();
    for (let i = 0; i < 20; i++) p.atualizar(0.05);
    expect(onde().distanceTo(parado)).toBeLessThan(1e-6);
    p.ligarAditivo('respirar', 1);
    let maior = 0;
    for (let i = 0; i < 60; i++) {
      p.atualizar(0.05);
      maior = Math.max(maior, onde().distanceTo(parado));
    }
    expect(maior).toBeGreaterThan(0.0003);
    expect(maior).toBeLessThan(0.02);
    p.ligarAditivo('respirar', 0);
    p.atualizar(0.05);
    expect(onde().distanceTo(parado)).toBeLessThan(1e-6);
    expect(() => p.ligarAditivo('joinha', 1)).toThrow(/joinha/);
  });

  it('um gesto em ciclo repete o trecho do artista enquanto o jogo pedir e sai ao soltar (o tamborilar)', () => {
    const p = base.instanciar(false);
    p.ir('punho', 0);
    p.fazerGesto('tamborilar', 0.2, 0.2, { repetir: true });
    for (let i = 0; i < 60; i++) p.atualizar(0.1);
    expect(p.gestoEmCurso).toBe('tamborilar');
    expect(p.pesoDoGesto).toBe(1);
    p.soltarGesto();
    for (let i = 0; i < 10; i++) p.atualizar(0.1);
    expect(p.gestoEmCurso).toBeNull();
    expect(() => p.fazerGesto('joinha', 0, 0, { repetir: true })).toThrow(/ciclo/);
  });

  it('o gesto que termina pendurado (o mole) fica até soltar, e o de impacto respeita o teto de duração', () => {
    const p = base.instanciar(false);
    p.fazerGesto('mole', 0.1, 0.3);
    for (let i = 0; i < 100; i++) p.atualizar(0.1);
    expect(p.gestoEmCurso).toBe('mole');
    expect(p.pesoDoGesto).toBe(1);
    p.soltarGesto();
    for (let i = 0; i < 10; i++) p.atualizar(0.1);
    expect(p.gestoEmCurso).toBeNull();
    p.fazerGesto('soco_ar', 0.1, 0.2, { duracaoMaximaS: 1 });
    for (let i = 0; i < 9; i++) p.atualizar(0.1);
    expect(p.gestoEmCurso).toBe('soco_ar');
    for (let i = 0; i < 3; i++) p.atualizar(0.1);
    expect(p.gestoEmCurso).toBeNull();
  });

  it('trocar de gesto no meio de outro larga o primeiro de verdade: ao acabar o segundo a mão volta à pose, sem resto do primeiro', () => {
    const p = base.instanciar(false);
    p.ir('punho', 0);
    p.atualizar(0);
    p.raiz.updateMatrixWorld(true);
    const v = new Vector3();
    const parado = p.osso('indicador_3').getWorldPosition(v).clone();
    p.fazerGesto('tamborilar', 0.1, 0.1, { repetir: true });
    for (let i = 0; i < 8; i++) p.atualizar(0.05);
    p.fazerGesto('soco_ar', 0.1, 0.2);
    for (let i = 0; i < 30; i++) p.atualizar(0.1);
    expect(p.gestoEmCurso).toBeNull();
    p.raiz.updateMatrixWorld(true);
    expect(p.osso('indicador_3').getWorldPosition(v).distanceTo(parado)).toBeLessThan(1e-6);
  });

  it('o gesto toca o clipe na hora do tempo dele (o pico do soco no ar está em 13/30 s)', () => {
    const p = base.instanciar(false);
    p.ir('repouso', 0);
    p.fazerGesto('soco_ar', 0, 0);
    p.atualizar(13 / 30);
    expect(p.tempoDoGesto).toBeCloseTo(13 / 30, 6);
    expect(p.picoDoGesto('soco_ar')).toBeCloseTo(13 / 30, 6);
    expect(p.picoDoGesto('joinha')).toBeUndefined();
  });

  it('girar um osso gira só ele, sem somar a cada quadro, e zero devolve a pose', () => {
    const p = base.instanciar(false);
    p.ir('punho', 0);
    p.atualizar(0);
    const v = new Vector3();
    const q0 = p.osso('pulso').quaternion.clone();
    const mao0 = (): Vector3 => {
      p.raiz.updateMatrixWorld(true);
      return p.osso('indicador_3').getWorldPosition(v).clone();
    };
    const antes = mao0();
    p.girarOsso('pulso', 1, 0, 0, 0.5);
    p.atualizar(0.016);
    const gira = p.osso('pulso').quaternion.angleTo(q0);
    expect(gira).toBeCloseTo(0.5, 5);
    for (let i = 0; i < 10; i++) p.atualizar(0.016);
    expect(p.osso('pulso').quaternion.angleTo(q0)).toBeCloseTo(0.5, 5);
    expect(mao0().distanceTo(antes)).toBeGreaterThan(0.01);
    p.girarOsso('pulso', 1, 0, 0, 0);
    p.atualizar(0.016);
    // angleTo perde precisão perto de 0 (acos de ~1): 1e-3 rad é o chão da medida
    expect(p.osso('pulso').quaternion.angleTo(q0)).toBeLessThan(1e-3);
    expect(() => p.girarOsso('nada', 1, 0, 0, 1)).toThrow(/nada/);
  });

  it('nada aloca por quadro: pose, mistura, gesto e dobra (perfilador de alocação)', async () => {
    const p = base.instanciar(false);
    const quadro = { px: 0.1, py: 0.2, pz: 0.3, xx: 1, xy: 0, xz: 0, yx: 0, yy: 1, yz: 0, zx: 0, zy: 0, zz: 1 };
    const passo = (i: number): void => {
      if (i % 200 === 0) p.ir(i % 400 === 0 ? 'ponte_v' : 'pinca', 0.2);
      if (i % 500 === 0) p.fazerGesto('joinha', 0.1, 0.1);
      p.sobrepor('pinca', (i % 10) / 10);
      p.ligarAditivo('respirar', 1);
      p.girarOsso('pulso', 1, 0, 0, (i % 10) * 0.01);
      p.dobrar('indicador', (i % 10) * 0.05);
      p.colocar(quadro, 0.8);
      p.atualizar(0.016);
    };
    await provarSemAlocar(passo);
  }, TEMPO_DO_PERFILADOR_MS);
});

describe('contatos do artista contra a pele', () => {
  const gltf = (async () => new GLTFLoader().parseAsync(bytes.slice(0), ''))();

  async function pele(pose: string): Promise<Float64Array> {
    const g = await gltf;
    const ficha = fichaDoGltf(g);
    const malha = malhaDoNivel(g, malhasDoNivel(g.scene, NOMES_DAS_MALHAS_PADRAO.alta));
    return pelarMalha(ficha, malha, ficha.poses.get(pose)!, new Float64Array(malha.posicoes.length));
  }

  it.each(['ponte_v', 'punho'])('o taco na pose %s não atravessa a pele mais que 3 mm', async (pose) => {
    const c = base.modelo.contatos.cilindros.get(pose)!;
    const superficie = await pele(pose);
    let pior = -Infinity;
    for (let i = 0; i < superficie.length; i += 3) {
      const dx = superficie[i]! - c.ponto[0];
      const dy = superficie[i + 1]! - c.ponto[1];
      const dz = superficie[i + 2]! - c.ponto[2];
      const t = dx * c.eixo[0] + dy * c.eixo[1] + dz * c.eixo[2];
      const fim = c.distanciaDoFim - t;
      if (fim < 0 || fim > c.comprimento) continue;
      const d = Math.hypot(dx - t * c.eixo[0], dy - t * c.eixo[1], dz - t * c.eixo[2]);
      const raio = c.raioFino + ((c.raioLargo - c.raioFino) * fim) / c.comprimento;
      pior = Math.max(pior, raio - d);
    }
    expect(raioNoPonto(c)).toBeGreaterThan(c.raioFino);
    expect(pior).toBeLessThan(0.003);
  });

  it('o cubo de giz na pinça não atravessa a pele mais que 3 mm', async () => {
    const c = base.modelo.contatos.pincas.get('pinca')!;
    const superficie = await pele('pinca');
    const n = c.pinca;
    const e1 = c.lado;
    const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
    const meio = c.aresta / 2;
    let pior = -Infinity;
    for (let i = 0; i < superficie.length; i += 3) {
      const d = [superficie[i]! - c.centro[0], superficie[i + 1]! - c.centro[1], superficie[i + 2]! - c.centro[2]];
      const proj = [n, e1, e2].map((e) => Math.abs(d[0]! * e[0]! + d[1]! * e[1]! + d[2]! * e[2]!) - meio);
      const fora = Math.hypot(...proj.map((p) => Math.max(p, 0)));
      const sdf = fora > 0 ? fora : Math.max(...proj);
      pior = Math.max(pior, -sdf);
    }
    expect(pior).toBeLessThan(0.003);
  });
});
