import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Quaternion, Vector3, type MeshPhysicalMaterial, type SkinnedMesh } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { quadroVazio } from '../alinhar';
import { carregarPersonagemDeRostoDeBytes, type BaseDoRosto } from './carregar-rosto';
import type { PersonagemDeRosto } from './rosto-em-cena';

const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../arte/personagens/exportados');
const glb = readFileSync(resolve(PASTA, 'balao.glb'));
const bytes = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
const meta = JSON.parse(readFileSync(resolve(PASTA, 'balao-meta.json'), 'utf8')) as unknown;
const OPCOES = { meta, nomesDasMalhas: { alta: 'balao_alta', baixa: 'balao_baixa' }, acaoBase: 'balao_parado' } as const;

let base: BaseDoRosto;
beforeAll(async () => {
  base = await carregarPersonagemDeRostoDeBytes(bytes.slice(0), OPCOES);
});

const sem = () => 0.5;
const nova = (cor = 0x3aa0ff): PersonagemDeRosto => base.instanciar({ cor, sorteio: sem });
const malhasVisiveis = (p: PersonagemDeRosto): SkinnedMesh[] => {
  const achadas: SkinnedMesh[] = [];
  p.raiz.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh && o.visible) achadas.push(o as SkinnedMesh);
  });
  return achadas;
};
const peso = (m: SkinnedMesh, forma: string): number => m.morphTargetInfluences![m.morphTargetDictionary![forma]!]!;

describe('o arquivo do balão', () => {
  it('as ações do arquivo duram o que a meta diz (quadros / fps)', () => {
    for (const [nome, a] of base.meta.acoes) {
      expect(base.duracaoDoClipe(nome), nome).toBeCloseTo(a.duracaoS, 3);
    }
  });

  it('os clipes não escrevem nos olhos (o jogo mira)', () => {
    for (const nome of base.meta.acoes.keys()) {
      expect(base.trilhasDoClipe(nome).filter((t) => t.startsWith('olho_')), nome).toEqual([]);
    }
  });

  it('a alta tem bem mais triângulos que a baixa', () => {
    expect(base.triangulos('alta')).toBeGreaterThan(base.triangulos('baixa') * 2);
  });
});

describe('PersonagemDeRosto: instância', () => {
  it('mostra só uma versão (a alta por padrão) e troca pelo nível; cada versão tem 5 malhas (uma por material)', () => {
    const p = nova();
    expect(malhasVisiveis(p)).toHaveLength(5);
    expect(malhasVisiveis(p).every((m) => m.name.startsWith('balao_alta'))).toBe(true);
    p.definirNivel('baixo');
    expect(malhasVisiveis(p).every((m) => m.name.startsWith('balao_baixa'))).toBe(true);
    p.definirNivel('medio');
    expect(malhasVisiveis(p).every((m) => m.name.startsWith('balao_alta'))).toBe(true);
  });

  it('só o látex é tingido, e cada instância tem o seu (uma equipe não tinge a outra)', () => {
    const a = nova(0xff0000);
    const b = nova(0x0000ff);
    const material = (p: PersonagemDeRosto, nome: string): MeshPhysicalMaterial =>
      malhasVisiveis(p)
        .map((m) => m.material as MeshPhysicalMaterial)
        .find((m) => m.name === nome)!;
    expect(material(a, 'latex_glb').color.getHex()).toBe(0xff0000);
    expect(material(b, 'latex_glb').color.getHex()).toBe(0x0000ff);
    expect(material(a, 'latex_glb')).not.toBe(material(b, 'latex_glb'));
    a.tingir(0x00ff00);
    expect(material(a, 'latex_glb').color.getHex()).toBe(0x00ff00);
    expect(material(b, 'latex_glb').color.getHex()).toBe(0x0000ff);
    expect(material(a, 'olho_branco')).toBe(material(b, 'olho_branco'));
  });

  it('tinge o material que a malha tem agora, mesmo trocado por uma cópia (as variantes de qualidade do jogo fazem isso)', () => {
    const p = nova(0xffffff);
    const malha = malhasVisiveis(p).find((m) => (m.material as MeshPhysicalMaterial).name === 'latex_glb')!;
    const copia = (malha.material as MeshPhysicalMaterial).clone();
    malha.material = copia;
    expect(p.corDoLatex).toBe(0xffffff);
    p.tingir(0x3aa0ff);
    expect(copia.color.getHex()).toBe(0x3aa0ff);
    expect(p.corDoLatex).toBe(0x3aa0ff);
  });
});

describe('PersonagemDeRosto: rosto', () => {
  it('a cara vai para as formas de TODAS as malhas da versão, com mistura suave', () => {
    const p = nova();
    p.fazerCara('cara_sorriso');
    p.atualizar(0.03);
    const meio = malhasVisiveis(p).map((m) => peso(m, 'cara_sorriso'));
    expect(meio.every((v) => v > 0 && v < 1)).toBe(true);
    p.atualizar(0.5);
    for (const m of malhasVisiveis(p)) {
      expect(peso(m, 'cara_sorriso')).toBeCloseTo(1, 6);
      expect(peso(m, 'cara_susto')).toBe(0);
    }
  });

  it('piscar multiplica a cara por 1 - piscar e liga a forma piscar', () => {
    const p = nova();
    p.fazerCara('cara_sorriso');
    p.atualizar(0.5);
    p.forcarPiscar(0.5);
    p.atualizar(0);
    for (const m of malhasVisiveis(p)) {
      expect(peso(m, 'piscar')).toBeCloseTo(0.5, 6);
      expect(peso(m, 'cara_sorriso')).toBeCloseTo(0.5, 6);
    }
    p.forcarPiscar(null);
  });

  it('pisca sozinho, no intervalo do RNG injetado', () => {
    const p = base.instanciar({ cor: 0xffffff, sorteio: () => 0, piscar: { minS: 1, maxS: 1, duracaoS: 0.2 } });
    p.atualizar(0.9);
    expect(peso(malhasVisiveis(p)[0]!, 'piscar')).toBe(0);
    p.atualizar(0.2); // 1,1 s: 0,1 s dentro da piscada (o ponto mais fechado)
    expect(peso(malhasVisiveis(p)[0]!, 'piscar')).toBeCloseTo(1, 3);
    p.atualizar(0.2);
    expect(peso(malhasVisiveis(p)[0]!, 'piscar')).toBe(0);
  });

  it('a cara sugerida de cada ação vem da meta', () => {
    const p = nova();
    expect(p.caraDaAcao('balao_susto')).toBe('cara_susto');
    expect(p.caraDaAcao('balao_murchar')).toBe('cara_triste');
  });
});

describe('PersonagemDeRosto: olhos', () => {
  // Para onde o olho aponta no mundo: o eixo do olhar no repouso (+Z do mundo), levado pelo giro que o osso fez desde o repouso.
  const repousos = new WeakMap<PersonagemDeRosto, Map<string, Quaternion>>();
  const direcaoDoOlho = (p: PersonagemDeRosto, nome: string): Vector3 => {
    p.raiz.updateMatrixWorld(true);
    let mapa = repousos.get(p);
    if (mapa === undefined) repousos.set(p, (mapa = new Map()));
    const agora = p.osso(nome).getWorldQuaternion(new Quaternion());
    if (!mapa.has(nome)) mapa.set(nome, agora.clone());
    return new Vector3(0, 0, 1).applyQuaternion(mapa.get(nome)!.clone().invert()).applyQuaternion(agora);
  };
  // O repouso precisa ser medido antes do primeiro `atualizar`.
  const nova2 = (): PersonagemDeRosto => {
    const p = nova();
    direcaoDoOlho(p, 'olho_esq');
    direcaoDoOlho(p, 'olho_dir');
    return p;
  };

  it('sem alvo os olhos ficam no repouso, olhando para +Z', () => {
    const p = nova2();
    p.atualizar(0.1);
    expect(direcaoDoOlho(p, 'olho_esq').z).toBeGreaterThan(0.999);
  });

  it('mirar um ponto à esquerda do balão gira os dois olhos para lá, até o limite do meta (30°)', () => {
    const p = nova2();
    p.olharPara({ x: 0.5, y: 0.0144, z: 0.5 }); // 45° para +X (a esquerda do balão)
    p.atualizar(1);
    for (const nome of ['olho_esq', 'olho_dir']) {
      const d = direcaoDoOlho(p, nome);
      const angulo = (Math.acos(Math.min(1, d.z)) * 180) / Math.PI;
      // a parada também mexe o pai do olho um pouco: o corte é de 30° em relação a ele
      expect(Math.abs(angulo - 30), nome).toBeLessThan(3);
      expect(d.x, nome).toBeGreaterThan(0.4);
    }
  });

  it('um alvo dentro do limite é olhado de frente: o olho aponta para ele', () => {
    const p = nova2();
    p.olharPara({ x: 0.2, y: 0.0144, z: 0.5 });
    p.atualizar(1);
    const osso = p.osso('olho_esq');
    p.raiz.updateMatrixWorld(true);
    const centro = new Vector3().setFromMatrixPosition(osso.matrixWorld);
    const paraOAlvo = new Vector3(0.2, 0.0144, 0.5).sub(centro).normalize();
    expect(direcaoDoOlho(p, 'olho_esq').dot(paraOAlvo)).toBeGreaterThan(0.999);
  });

  it('o olhar vale depois do mixer: com uma ação rodando o olho continua mirando o alvo', () => {
    const p = nova2();
    p.olharPara({ x: 0.2, y: 0.0144, z: 0.5 });
    p.fazerAcao('balao_inclinar', { entradaS: 0.1, saidaS: 0.2, repetir: true });
    p.atualizar(1.5);
    const osso = p.osso('olho_esq');
    p.raiz.updateMatrixWorld(true);
    const centro = new Vector3().setFromMatrixPosition(osso.matrixWorld);
    const paraOAlvo = new Vector3(0.2, 0.0144, 0.5).sub(centro).normalize();
    expect(direcaoDoOlho(p, 'olho_esq').dot(paraOAlvo)).toBeGreaterThan(0.99);
  });

  it('pararDeOlhar devolve os olhos ao repouso', () => {
    const p = nova2();
    p.olharPara({ x: 0.5, y: 0, z: 0.5 });
    p.atualizar(1);
    p.pararDeOlhar();
    p.atualizar(2);
    expect(direcaoDoOlho(p, 'olho_esq').z).toBeGreaterThan(0.999);
  });
});

describe('PersonagemDeRosto: ações', () => {
  const corpo = (p: PersonagemDeRosto): number => {
    p.raiz.updateMatrixWorld(true);
    return p.osso('espinha_2').getWorldScale(new Vector3()).x;
  };

  it('estufar entra, repete o trecho do meta e fica estufado até soltar; murchar fica murcho', () => {
    const a = nova();
    a.fazerAcao('balao_estufar', { entradaS: 0.2, saidaS: 0.3, repetir: true });
    a.atualizar(4);
    a.atualizar(0);
    const estufado = corpo(a);
    expect(estufado).toBeGreaterThan(1.1);
    const b = nova();
    b.fazerAcao('balao_murchar', { entradaS: 0.2, saidaS: 0.3, repetir: true });
    b.atualizar(2.2);
    expect(corpo(b)).toBeLessThan(0.9);
    a.soltarAcao('balao_estufar');
    a.atualizar(1);
    expect(corpo(a)).toBeLessThan(1.1);
  });

  it('uma ação que não repete acaba sozinha e o personagem volta à parada', () => {
    const p = nova();
    p.fazerAcao('balao_pulinho', { entradaS: 0.05, saidaS: 0.1 });
    expect(p.acaoEmCurso).toBe('balao_pulinho');
    p.atualizar(0.5);
    expect(p.acaoEmCurso).toBe('balao_pulinho');
    p.atualizar(1);
    expect(p.acaoEmCurso).toBeNull();
  });

  it('a parada nunca para: o corpo se mexe com o tempo', () => {
    const p = nova();
    p.atualizar(0.3);
    const a = p.osso('raiz').position.clone();
    const qa = p.osso('cordinha_2').quaternion.clone();
    p.atualizar(0.7);
    const b = p.osso('raiz').position.clone();
    const qb = p.osso('cordinha_2').quaternion.clone();
    expect(a.distanceTo(b) + qa.angleTo(qb)).toBeGreaterThan(1e-3);
  });

  it('reiniciar volta à parada, à cara neutra e aos olhos de frente', () => {
    const p = nova();
    p.fazerAcao('balao_estufar', { entradaS: 0.1, saidaS: 0.3, repetir: true });
    p.fazerCara('cara_sorriso');
    p.olharPara({ x: 0.5, y: 0, z: 0.5 });
    p.atualizar(2);
    p.reiniciar();
    p.atualizar(0);
    expect(p.acaoEmCurso).toBeNull();
    expect(p.caraAtual).toBe('cara_neutro');
    for (const m of malhasVisiveis(p)) expect(peso(m, 'cara_sorriso')).toBe(0);
    expect(p.osso('olho_esq').quaternion.angleTo(p.osso('olho_dir').quaternion)).toBeLessThan(1e-6);
  });

  it('lança com ação que não existe', () => {
    expect(() => nova().fazerAcao('balao_voar', { entradaS: 0, saidaS: 0 })).toThrow('balao_voar');
  });
});

describe('PersonagemDeRosto: âncoras', () => {
  it('a âncora da mão sai com posição e orientação, sem a escala do corpo', () => {
    const p = nova();
    p.atualizar(0);
    const q = quadroVazio();
    p.ancora('mao_esq', q);
    // repouso: 9,5 cm para a esquerda do balão (+X)
    expect(q.px).toBeCloseTo(0.095, 2);
    for (const [x, y, z] of [
      [q.xx, q.xy, q.xz],
      [q.yx, q.yy, q.yz],
      [q.zx, q.zy, q.zz],
    ] as const) {
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6);
    }
  });

  it('estufado, o ponto da mão se afasta do centro, mas a base continua de comprimento 1', () => {
    const p = nova();
    p.atualizar(0);
    const repouso = quadroVazio();
    p.ancora('mao_esq', repouso);
    p.fazerAcao('balao_estufar', { entradaS: 0.1, saidaS: 0.3, repetir: true });
    p.atualizar(4);
    const q = quadroVazio();
    p.ancora('mao_esq', q);
    expect(Math.abs(q.px)).toBeGreaterThan(Math.abs(repouso.px) * 1.1);
    expect(Math.hypot(q.xx, q.xy, q.xz)).toBeCloseTo(1, 6);
  });

  it('a âncora acompanha a raiz posta no mundo', () => {
    const p = nova();
    p.raiz.position.set(1, 2, 3);
    p.atualizar(0);
    const q = quadroVazio();
    p.ancora('mao_dir', q);
    expect(q.px).toBeCloseTo(1 - 0.095, 2);
    expect(q.pz).toBeGreaterThan(2.9);
    expect(() => p.ancora('mao_nada', q)).toThrow('mao_nada');
  });
});
