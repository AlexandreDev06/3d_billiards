import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Quaternion, Vector3, type MeshPhysicalMaterial, type SkinnedMesh } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { quadroVazio } from '../alinhar';
import { lerMetaDoRosto } from '../meta-do-rosto';
import { sorteioDeTeste } from '../para-testes';
import { TEMPO_DO_PERFILADOR_MS, provarSemAlocar } from '../alocacao-para-testes';
import { carregarPersonagemDeRostoDeBytes, type BaseDoRosto } from './carregar-rosto';
import { gerenciadorDeTestes } from './para-testes-three';
import type { PersonagemDeRosto } from './rosto-em-cena';

const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../arte/personagens/exportados');
const glb = readFileSync(resolve(PASTA, 'balao.glb'));
const bytes = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
const meta = JSON.parse(readFileSync(resolve(PASTA, 'balao-meta.json'), 'utf8')) as unknown;
const OPCOES = { meta, nomesDasMalhas: { alta: 'balao_alta', baixa: 'balao_baixa' }, acaoBase: 'balao_parado', gerenciador: gerenciadorDeTestes() } as const;

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
  it('mostra só uma versão (a alta por padrão) e troca pelo nível; cada versão tem uma malha por material (o mesmo tanto nas duas)', () => {
    const p = nova();
    const naAlta = malhasVisiveis(p).length;
    expect(naAlta).toBeGreaterThanOrEqual(5);
    expect(malhasVisiveis(p).every((m) => m.name.startsWith('balao_alta'))).toBe(true);
    p.definirNivel('baixo');
    expect(malhasVisiveis(p)).toHaveLength(naAlta);
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

describe('PersonagemDeRosto: movimento = false desliga todo o movimento por cima das ações (interruptor do L46b)', () => {
  const DESLIGADO = { olhar: false, corpoSegue: false, gelatina: false, flutuar: false, cordinha: false, palpebras: false } as const;
  /** A maior diferença entre as componentes dos giros de um osso (`angleTo` erra ~5e-4 rad num quaternion que não é exatamente unitário). */
  const giroDiferente = (x: PersonagemDeRosto, y: PersonagemDeRosto, osso: string): number => {
    const qx = x.osso(osso).quaternion;
    const qy = y.osso(osso).quaternion;
    return Math.max(Math.abs(qx.x - qy.x), Math.abs(qx.y - qy.y), Math.abs(qx.z - qy.z), Math.abs(qx.w - qy.w));
  };

  it('recursos todos desligados, e só ficam as ações, as caras e o piscar', () => {
    const p = base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: false });
    expect(p.recursos).toMatchObject({ olhar: false, corpoSegue: false, gelatina: false, flutuar: false, cordinha: false, palpebras: false });
    expect(base.instanciar({ cor: 0xffffff, sorteio: sem }).recursos).toMatchObject({ olhar: true, gelatina: true, flutuar: true, cordinha: true, palpebras: true });
  });

  it('com o balão chacoalhando e olhando para um ponto, os ossos ficam como a ação deixou (igual ao pedido recurso a recurso)', () => {
    const a = base.instanciar({ cor: 0xffffff, sorteio: sorteioDeTeste(3), movimento: false });
    const b = base.instanciar({ cor: 0xffffff, sorteio: sorteioDeTeste(3), movimento: DESLIGADO });
    const vivo = base.instanciar({ cor: 0xffffff, sorteio: sorteioDeTeste(3) });
    const nomes = ['raiz', 'espinha_1', 'espinha_2', 'olho_esq', 'olho_dir', 'cordinha_2', 'cordinha_4'];
    let diferencaDoVivo = 0;
    for (let i = 0; i < 240; i++) {
      for (const p of [a, b, vivo]) {
        p.raiz.position.set(0.3 * Math.sin(i * 0.1), 0.1 * Math.sin(i * 0.17), 0);
        p.definirInteresse(0, { x: 0.4, y: 0.1, z: 0.5 }, 3);
        p.olharPara({ x: -0.3, y: 0.2, z: 0.6 });
        p.atualizar(1 / 60);
      }
      for (const n of nomes) {
        expect(giroDiferente(a, b, n)).toBeLessThan(1e-9);
        expect(a.osso(n).position.distanceTo(b.osso(n).position)).toBeLessThan(1e-9);
        expect(a.osso(n).scale.distanceTo(b.osso(n).scale)).toBeLessThan(1e-9);
        diferencaDoVivo = Math.max(diferencaDoVivo, giroDiferente(a, vivo, n), a.osso(n).scale.distanceTo(vivo.osso(n).scale));
      }
    }
    // a comparação não é vazia: com o movimento ligado os mesmos ossos se mexem de verdade
    expect(diferencaDoVivo).toBeGreaterThan(0.02);
  });

  it('palpebras: false desliga só as pálpebras que seguem o olhar', () => {
    expect(base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: { palpebras: false } }).recursos).toMatchObject({ palpebras: false, olhar: true });
  });
});

describe('PersonagemDeRosto: látex proposto pelo artista (latex_proposta do meta v2)', () => {
  const latexDe = (p: PersonagemDeRosto, prefixo: string): MeshPhysicalMaterial[] => {
    const achados: MeshPhysicalMaterial[] = [];
    p.raiz.traverse((o) => {
      const m = o as SkinnedMesh;
      if (m.isSkinnedMesh && m.name.startsWith(prefixo) && (m.material as MeshPhysicalMaterial).name === 'latex_glb') achados.push(m.material as MeshPhysicalMaterial);
    });
    return achados;
  };
  it('as malhas altas (alto e médio) levam os números do artista, e a cor de vértice liga porque a malha tem COLOR_0', () => {
    const p = nova();
    const alta = latexDe(p, 'balao_alta');
    expect(alta.length).toBeGreaterThan(0);
    const n = base.meta.latexProposto!;
    for (const m of alta) {
      expect(m.roughness).toBe(n.roughness);
      expect(m.metalness).toBe(n.metalness);
      expect(m.clearcoat).toBe(n.clearcoat);
      expect(m.clearcoatRoughness).toBe(n.clearcoatRoughness);
      expect(m.sheen).toBe(n.sheen);
      expect(m.sheenRoughness).toBe(n.sheenRoughness);
      expect(m.specularIntensity).toBe(n.specularIntensity);
      expect(m.ior).toBe(n.ior);
      expect(m.vertexColors).toBe(true);
      expect(m.userData.latex).toBe(true);
    }
  });

  it('a malha baixa (nível baixo) fica como estava: o látex padrão do pacote, sem cor de vértice', () => {
    const baixa = latexDe(nova(), 'balao_baixa');
    expect(baixa.length).toBeGreaterThan(0);
    for (const m of baixa) {
      expect(m.roughness).toBe(0.34);
      expect(m.clearcoat).toBe(0.8);
      expect(m.sheen).toBe(0);
      expect(m.vertexColors).toBe(false);
    }
  });

  it('o brilho de veludo (sheen) leva a cor da equipe clareada em 40%, e segue a cor quando a equipe muda', () => {
    const p = nova(0xff0000);
    const m = latexDe(p, 'balao_alta')[0]!;
    expect(m.sheenColor.r).toBeCloseTo(1, 5);
    expect(m.sheenColor.g).toBeCloseTo(0.4, 5);
    expect(m.sheenColor.b).toBeCloseTo(0.4, 5);
    p.tingir(0x0000ff);
    expect(m.sheenColor.r).toBeCloseTo(0.4, 5);
    expect(m.sheenColor.b).toBeCloseTo(1, 5);
  });

  it('o interruptor desliga o látex proposto: as malhas altas ficam com o padrão do pacote', () => {
    const p = base.instanciar({ cor: 0xffffff, sorteio: sem, latexProposto: false });
    for (const m of latexDe(p, 'balao_alta')) {
      expect(m.roughness).toBe(0.34);
      expect(m.clearcoat).toBe(0.8);
      expect(m.vertexColors).toBe(false);
      expect(m.sheen).toBe(0);
    }
  });

  it('sem latex_proposta no meta (arquivo v1), o látex é o padrão do pacote', async () => {
    const meta1 = JSON.parse(JSON.stringify(meta)) as Record<string, unknown>;
    delete meta1.latex_proposta;
    const b = await carregarPersonagemDeRostoDeBytes(bytes.slice(0), { ...OPCOES, meta: meta1 });
    for (const m of latexDe(b.instanciar({ cor: 0xffffff, sorteio: sem }), 'balao_alta')) {
      expect(m.roughness).toBe(0.34);
      expect(m.vertexColors).toBe(false);
    }
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
    const p = base.instanciar({ cor: 0xffffff, sorteio: () => 0, piscar: { minS: 1, maxS: 1, duracaoS: 0.2, chanceDeDuplo: 0, fracaoDeFechar: 0.5 } });
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
  const repousoLocal = new Map<string, Quaternion>();
  const nova2 = (): PersonagemDeRosto => {
    const p = nova();
    direcaoDoOlho(p, 'olho_esq');
    direcaoDoOlho(p, 'olho_dir');
    repousoLocal.set('olho_esq', p.osso('olho_esq').quaternion.clone());
    repousoLocal.set('olho_dir', p.osso('olho_dir').quaternion.clone());
    return p;
  };

  it('sem alvo os olhos ficam no repouso, olhando para +Z', () => {
    const p = nova2();
    p.atualizar(0.1);
    expect(direcaoDoOlho(p, 'olho_esq').z).toBeGreaterThan(0.999);
  });

  it('mirar um ponto à esquerda do balão gira os dois olhos para lá (e o corpo ajuda); em relação à cabeça o olho nunca passa do limite do meta', () => {
    const p = nova2();
    p.olharPara({ x: 0.5, y: 0.0144, z: 0.5 }); // 45° para +X (a esquerda do balão)
    for (let i = 0; i < 120; i++) p.atualizar(1 / 60);
    const limite = (base.meta.limiteDoOlharRad * 180) / Math.PI;
    for (const nome of ['olho_esq', 'olho_dir']) {
      const d = direcaoDoOlho(p, nome);
      const noMundo = (Math.acos(Math.min(1, d.z)) * 180) / Math.PI;
      // no mundo o olhar chega ao alvo (o corpo gira o que os olhos não aguentam)...
      expect(noMundo, nome).toBeGreaterThan(38);
      expect(d.x, nome).toBeGreaterThan(0.6);
      // ...mas o osso do olho, em relação ao pai, nunca passou do limite
      const osso = p.osso(nome);
      const repouso = repousoLocal.get(osso.name)!;
      expect((osso.quaternion.angleTo(repouso) * 180) / Math.PI, nome).toBeLessThan(limite + 1.5);
    }
  });

  it('um alvo dentro do limite é olhado de frente: o olho aponta para ele', () => {
    const p = nova2();
    p.olharPara({ x: 0.2, y: 0.0144, z: 0.5 });
    for (let i = 0; i < 60; i++) p.atualizar(1 / 60);
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
    for (let i = 0; i < 60; i++) p.atualizar(1 / 60);
    p.pararDeOlhar();
    for (let i = 0; i < 180; i++) p.atualizar(1 / 60);
    expect(direcaoDoOlho(p, 'olho_esq').z).toBeGreaterThan(0.995);
  });
});

describe('PersonagemDeRosto: ações', () => {
  const corpo = (p: PersonagemDeRosto): number => {
    p.raiz.updateMatrixWorld(true);
    return p.osso('espinha_2').getWorldScale(new Vector3()).x;
  };
  const altura = (p: PersonagemDeRosto): number => {
    p.raiz.updateMatrixWorld(true);
    return p.osso('espinha_2').getWorldScale(new Vector3()).y;
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
    // murcha afundando (a altura cai; a largura quase não muda no v2)
    expect(altura(b)).toBeLessThan(0.8);
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
    // de frente, os dois olhos só convergem de leve para um ponto a 3 m
    expect(p.osso('olho_esq').quaternion.angleTo(p.osso('olho_dir').quaternion)).toBeLessThan(0.03);
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

// ---- L46: olhar vivo, corpo que segue, movimento secundário -------------------------------------------------------------------

describe('PersonagemDeRosto: olhar vivo (L46)', () => {
  const SEM_NADA_DO_MOVIMENTO = { olhar: false, corpoSegue: false, gelatina: false, flutuar: false, cordinha: false } as const;
  /** O giro do osso do olho no mundo, de um personagem parado e sem movimento nenhum: o que aponta para +Z. */
  const repousos = new Map<string, Quaternion>();
  const repousoDoMundo = (nome: string): Quaternion => {
    let q = repousos.get(nome);
    if (q === undefined) {
      const quieto = base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: SEM_NADA_DO_MOVIMENTO });
      quieto.raiz.updateMatrixWorld(true);
      q = quieto.osso(nome).getWorldQuaternion(new Quaternion());
      repousos.set(nome, q);
    }
    return q;
  };
  /** A direção em que o olho aponta no mundo. */
  const miraDoOlho = (p: PersonagemDeRosto, nome: string, saida = new Vector3()): Vector3 => {
    p.raiz.updateMatrixWorld(true);
    const agora = p.osso(nome).getWorldQuaternion(new Quaternion());
    return saida.set(0, 0, 1).applyQuaternion(repousoDoMundo(nome).clone().invert()).applyQuaternion(agora);
  };
  const posicaoDoOlho = (p: PersonagemDeRosto, nome: string): Vector3 => {
    p.raiz.updateMatrixWorld(true);
    return new Vector3().setFromMatrixPosition(p.osso(nome).matrixWorld);
  };
  const SEM_PISCAR = { minS: 500, maxS: 600 } as const;
  const novaSemPiscar = (extra = {}): PersonagemDeRosto => base.instanciar({ cor: 0xffffff, sorteio: sem, piscar: SEM_PISCAR, ...extra });
  const anda = (p: PersonagemDeRosto, segundos: number, dt = 1 / 60): void => {
    for (let t = 0; t < segundos - 1e-9; t += dt) p.atualizar(dt);
  };

  it('um alvo novo é olhado com um salto curto depois de uma reação: nada nos primeiros 30 ms, tudo em 0,25 s', () => {
    const p = novaSemPiscar();
    anda(p, 0.5);
    const antes = miraDoOlho(p, 'olho_esq').clone();
    const alvo = new Vector3(0.25, 0.0144, 0.35);
    p.olharPara(alvo);
    anda(p, 0.03);
    expect(miraDoOlho(p, 'olho_esq').angleTo(antes)).toBeLessThan(0.02);
    anda(p, 0.22);
    const paraOAlvo = alvo.clone().sub(posicaoDoOlho(p, 'olho_esq')).normalize();
    expect(miraDoOlho(p, 'olho_esq').angleTo(paraOAlvo)).toBeLessThan(0.05);
  });

  it('os olhos lideram e o corpo vem depois: logo após o salto o olho já mira, o corpo ainda mal girou, e depois gira', () => {
    const p = novaSemPiscar();
    anda(p, 0.5);
    const giroDoCorpo = (): number => p.osso('espinha_1').quaternion.angleTo(corpo0);
    const corpo0 = p.osso('espinha_1').quaternion.clone();
    p.olharPara(new Vector3(0.45, 0.0144, 0.35)); // uns 52° para a esquerda: passa do limite dos olhos
    anda(p, 0.25);
    const cedo = giroDoCorpo();
    anda(p, 2);
    const tarde = giroDoCorpo();
    expect(tarde).toBeGreaterThan(0.2);
    expect(cedo).toBeLessThan(tarde * 0.6);
  });

  it('o corpo para num valor mesmo com as ações paradas: o aditivo não se soma a cada quadro (o mixer só reescreve o osso quando a ação muda)', async () => {
    // um arquivo cujas ações não mexem em nada depois do primeiro quadro (cada trilha vale a primeira amostra): o mixer não reescreve
    // osso nenhum, e só o `restaurar` do aditivo impede que o seguimento se some de novo a cada quadro
    const parada = await carregarPersonagemDeRostoDeBytes(bytes.slice(0), OPCOES);
    for (const clipe of (parada as unknown as { gltf: { animations: { tracks: { values: ArrayLike<number> & { fill(v: number, a: number, b: number): void; set(v: ArrayLike<number>, o: number): void }; getValueSize(): number }[] }[] } }).gltf.animations) {
      for (const trilha of clipe.tracks) {
        const n = trilha.getValueSize();
        const primeira = Array.from(trilha.values).slice(0, n);
        for (let k = 0; k < trilha.values.length; k += n) trilha.values.set(primeira, k);
      }
    }
    const p = parada.instanciar({ cor: 0xffffff, sorteio: sem, piscar: SEM_PISCAR });
    const gemeo = parada.instanciar({ cor: 0xffffff, sorteio: sem, piscar: SEM_PISCAR, movimento: { corpoSegue: false } });
    p.olharPara(new Vector3(0.45, 0.0144, 0.35));
    gemeo.olharPara(new Vector3(0.45, 0.0144, 0.35));
    // o que o corpo soma ao que a ação faz (o gêmeo é igual, sem o seguimento)
    const somado = (): number => p.osso('espinha_1').quaternion.angleTo(gemeo.osso('espinha_1').quaternion);
    anda(p, 4);
    anda(gemeo, 4);
    const aos4 = somado();
    anda(p, 4);
    anda(gemeo, 4);
    const aos8 = somado();
    expect(aos4).toBeGreaterThan(0.2);
    expect(Math.abs(aos8 - aos4)).toBeLessThan(0.02);
    expect(aos8).toBeLessThan(1.2);
  });

  it('o corpo para num valor com a respiração da parada: o aditivo não se soma a cada quadro', () => {
    const p = novaSemPiscar();
    const gemeo = novaSemPiscar({ movimento: { corpoSegue: false } });
    p.olharPara(new Vector3(0.45, 0.0144, 0.35));
    gemeo.olharPara(new Vector3(0.45, 0.0144, 0.35));
    const somado = (): number => p.osso('espinha_1').quaternion.angleTo(gemeo.osso('espinha_1').quaternion);
    anda(p, 4);
    anda(gemeo, 4);
    const aos4 = somado();
    anda(p, 4);
    anda(gemeo, 4);
    const aos8 = somado();
    expect(aos4).toBeGreaterThan(0.2);
    // oscila um pouco com a respiração da parada (o olho é medido em relação à cabeça), mas não cresce quadro a quadro
    expect(Math.abs(aos8 - aos4)).toBeLessThan(0.12);
    expect(aos8).toBeLessThan(1.2);
  });

  it('solto o olhar, o corpo volta ao que a ação mandava', () => {
    const p = novaSemPiscar();
    const gemeo = novaSemPiscar({ movimento: { olhar: false, corpoSegue: false, gelatina: false, flutuar: false, cordinha: false } });
    p.olharPara(new Vector3(0.45, 0.0144, 0.35));
    anda(p, 2);
    p.pararDeOlhar();
    anda(p, 6);
    anda(gemeo, 8);
    expect(p.osso('espinha_1').quaternion.angleTo(gemeo.osso('espinha_1').quaternion)).toBeLessThan(0.04);
  });

  it('vergência: perto os dois olhos convergem, longe ficam quase paralelos', () => {
    const angulo = (z: number): number => {
      const p = novaSemPiscar();
      p.olharPara(new Vector3(0, 0.0144, z));
      anda(p, 1.5);
      return miraDoOlho(p, 'olho_esq').angleTo(miraDoOlho(p, 'olho_dir'));
    };
    expect(angulo(0.2)).toBeGreaterThan(0.1); // > 6°
    expect(angulo(8)).toBeLessThan(0.02);
  });

  it('com dois interesses, olha o principal a maior parte do tempo e espia o outro de vez em quando', () => {
    const p = novaSemPiscar();
    p.definirInteresse(0, { x: 0.3, y: 0.0144, z: 0.4 }, 4);
    p.definirInteresse(1, { x: -0.3, y: 0.0144, z: 0.4 }, 1);
    let aEsquerda = 0;
    let trocas = 0;
    let lado = 0;
    for (let i = 0; i < 60 * 60; i++) {
      p.atualizar(1 / 60);
      const x = miraDoOlho(p, 'olho_esq').x;
      if (Math.abs(x) > 0.15) {
        const novo = Math.sign(x);
        if (novo > 0) aEsquerda++;
        if (lado !== 0 && novo !== lado) trocas++;
        lado = novo;
      }
    }
    expect(aEsquerda / (60 * 60)).toBeGreaterThan(0.5);
    expect(trocas).toBeGreaterThanOrEqual(4);
  });

  it('olharPara prende o olhar num ponto e pararDeOlhar solta os interesses de volta', () => {
    const p = novaSemPiscar();
    p.definirInteresse(0, { x: -0.3, y: 0.0144, z: 0.4 }, 2);
    p.olharPara({ x: 0.3, y: 0.0144, z: 0.4 });
    expect(p.olhandoUmPonto).toBe(true);
    anda(p, 10);
    expect(miraDoOlho(p, 'olho_esq').x).toBeGreaterThan(0.3);
    p.pararDeOlhar();
    anda(p, 1);
    expect(miraDoOlho(p, 'olho_esq').x).toBeLessThan(-0.15);
    p.removerInteresse(0);
    expect(p.olhandoUmPonto).toBe(false);
  });

  it('olharPara prende o olhar de verdade: com um interesse ligado, o olho fica no ponto quase o tempo todo (janela de 40 s, quadro a quadro)', () => {
    const p = novaSemPiscar();
    p.definirInteresse(0, { x: -0.3, y: 0.0144, z: 0.4 }, 2);
    p.definirInteresse(1, { x: 0, y: 0.3, z: 0.6 }, 1);
    const alvo = new Vector3(0.3, 0.0144, 0.4);
    p.olharPara(alvo);
    anda(p, 0.6);
    let noAlvo = 0;
    let quadros = 0;
    let pior = 0;
    for (let i = 0; i < 40 * 60; i++) {
      p.atualizar(1 / 60);
      const paraOAlvo = alvo.clone().sub(posicaoDoOlho(p, 'olho_esq')).normalize();
      const erro = miraDoOlho(p, 'olho_esq').angleTo(paraOAlvo);
      pior = Math.max(pior, erro);
      if (erro < 0.07) noAlvo++; // 4°: cobre as microssacadas
      quadros++;
    }
    expect(noAlvo / quadros).toBeGreaterThan(0.97);
    expect(pior).toBeLessThan(0.2); // 11°: nunca vai espiar o outro interesse (que está a 40° de lado)
  });

  it.each([['NaN', NaN], ['infinito', Infinity], ['negativo', -0.5], ['menos infinito', -Infinity]])('atualizar com dt %s é ignorado: o personagem segue como se o quadro não tivesse existido', (_nome, ruim) => {
    const rodada = (comRuins: boolean): number[] => {
      const p = base.instanciar({ cor: 0xffffff, sorteio: sorteioDeTeste(9) });
      p.definirInteresse(0, { x: 0.3, y: 0.0144, z: 0.4 }, 3);
      p.fazerAcao('balao_pulinho', { entradaS: 0.05, saidaS: 0.2 });
      p.fazerCara('cara_sorriso');
      const v: number[] = [];
      for (let i = 0; i < 240; i++) {
        if (comRuins && i % 7 === 0) p.atualizar(ruim);
        p.raiz.position.x = 0.05 * Math.sin(i * 0.1);
        p.atualizar(1 / 60);
      }
      for (const nome of ['olho_esq', 'espinha_1', 'raiz', 'cordinha_4']) v.push(...p.osso(nome).quaternion.toArray(), ...p.osso(nome).position.toArray(), ...p.osso(nome).scale.toArray());
      for (const m of malhasVisiveis(p)) v.push(peso(m, 'cara_sorriso'), peso(m, 'piscar'));
      return v;
    };
    const limpo = rodada(false);
    const sujo = rodada(true);
    expect(sujo.every(Number.isFinite)).toBe(true);
    expect(sujo).toEqual(limpo);
  });

  it('um salto grande do olhar (mais de 25°) faz piscar', () => {
    const p = novaSemPiscar();
    anda(p, 1);
    p.olharPara(new Vector3(0.5, 0.0144, 0.35));
    let maior = 0;
    for (let i = 0; i < 40; i++) {
      p.atualizar(1 / 60);
      maior = Math.max(maior, peso(malhasVisiveis(p)[0]!, 'piscar'));
    }
    expect(maior).toBeGreaterThan(0.8);
  });

  it('um salto pequeno não faz piscar', () => {
    const p = novaSemPiscar();
    anda(p, 1);
    p.olharPara(new Vector3(0.05, 0.0144, 0.35));
    let maior = 0;
    for (let i = 0; i < 60; i++) {
      p.atualizar(1 / 60);
      maior = Math.max(maior, peso(malhasVisiveis(p)[0]!, 'piscar'));
    }
    expect(maior).toBe(0);
  });

  it('o mesmo sorteio e os mesmos pedidos dão os mesmos olhos', () => {
    const rodada = (): number[] => {
      const p = base.instanciar({ cor: 0xffffff, sorteio: sorteioDeTeste(17) });
      p.definirInteresse(0, { x: 0.3, y: 0.0144, z: 0.4 }, 4);
      p.definirInteresse(1, { x: -0.3, y: 0.0144, z: 0.4 }, 1);
      const v: number[] = [];
      for (let i = 0; i < 600; i++) {
        p.atualizar(1 / 60);
        v.push(...p.osso('olho_esq').quaternion.toArray(), ...p.osso('espinha_1').quaternion.toArray(), ...p.osso('cordinha_3').quaternion.toArray());
      }
      return v;
    };
    expect(rodada()).toEqual(rodada());
  });
});

describe('PersonagemDeRosto: pálpebras, piscadinha e recursos do v2 (L46)', () => {
  // lido do arquivo na hora de montar os testes (a base só carrega no beforeAll): v1 pula, v2 roda
  const metaDoDisco = lerMetaDoRosto(meta);
  const comPalpebras = metaDoDisco.palpebras !== null && metaDoDisco.formas.includes('palpebra_cima') && metaDoDisco.formas.includes('palpebra_baixo');
  const comPiscadinha = metaDoDisco.formas.includes('piscar_esq') && metaDoDisco.formas.includes('piscar_dir');
  const anda = (p: PersonagemDeRosto, segundos: number): void => {
    for (let t = 0; t < segundos - 1e-9; t += 1 / 60) p.atualizar(1 / 60);
  };

  it.skipIf(!comPalpebras)('olhando para cima a pálpebra de cima acompanha, e para baixo, a de baixo', () => {
    const p = base.instanciar({ cor: 0xffffff, sorteio: sem, piscar: { minS: 500, maxS: 600 } });
    p.olharPara({ x: 0, y: 0.4, z: 0.4 });
    anda(p, 1.5);
    expect(peso(malhasVisiveis(p)[0]!, 'palpebra_cima')).toBeGreaterThan(0.3);
    expect(peso(malhasVisiveis(p)[0]!, 'palpebra_baixo')).toBe(0);
    p.olharPara({ x: 0, y: -0.4, z: 0.4 });
    anda(p, 1.5);
    expect(peso(malhasVisiveis(p)[0]!, 'palpebra_baixo')).toBeGreaterThan(0.3);
    expect(peso(malhasVisiveis(p)[0]!, 'palpebra_cima')).toBe(0);
  });

  it.skipIf(!comPiscadinha)('a piscadinha fecha um olho só', () => {
    const p = base.instanciar({ cor: 0xffffff, sorteio: sem, piscar: { minS: 500, maxS: 600 } });
    expect(p.piscadinha('esq', 0.4)).toBe(true);
    let esq = 0;
    let dir = 0;
    for (let i = 0; i < 40; i++) {
      p.atualizar(1 / 60);
      esq = Math.max(esq, peso(malhasVisiveis(p)[0]!, 'piscar_esq'));
      dir = Math.max(dir, peso(malhasVisiveis(p)[0]!, 'piscar_dir'));
    }
    expect(esq).toBe(1);
    expect(dir).toBe(0);
  });

  it('sem as formas do v2, a piscadinha diz que não pode e as pálpebras ficam de fora, sem erro', () => {
    const meta1 = JSON.parse(JSON.stringify(meta)) as { formas: { nomes: string[] }; palpebras?: unknown };
    meta1.formas.nomes = meta1.formas.nomes.filter((n) => !['piscar_esq', 'piscar_dir', 'palpebra_cima', 'palpebra_baixo'].includes(n));
    delete meta1.palpebras;
    return carregarPersonagemDeRostoDeBytes(bytes.slice(0), { ...OPCOES, meta: meta1 }).then((b) => {
      const p = b.instanciar({ cor: 0xffffff, sorteio: sem });
      expect(p.piscadinha('esq')).toBe(false);
      expect(p.recursos.palpebras).toBe(false);
      expect(p.recursos.piscadinha).toBe(false);
      anda(p, 1);
    });
  });

  it('temAcao e temCara dizem o que o arquivo tem', () => {
    const p = nova();
    expect(p.temAcao('balao_pulinho')).toBe(true);
    expect(p.temAcao('balao_nunca_existiu')).toBe(false);
    // só as que o artista marcou com um trecho de ciclo podem repetir
    expect(p.temCiclo('balao_estufar')).toBe(true);
    expect(p.temCiclo('balao_pulinho')).toBe(false);
    expect(p.temCiclo('balao_nunca_existiu')).toBe(false);
    expect(p.temCara('cara_sorriso')).toBe(true);
    expect(p.temCara('cara_nunca_existiu')).toBe(false);
  });

  it('as caras e as ações novas do meta entram sem mudar código: cada cara do meta pode ser feita', () => {
    const p = base.instanciar({ cor: 0xffffff, sorteio: sem, piscar: { minS: 500, maxS: 600 } });
    for (const cara of base.meta.caras) {
      p.fazerCara(cara);
      anda(p, 0.6);
      expect(p.caraAtual).toBe(cara);
      expect(peso(malhasVisiveis(p)[0]!, cara)).toBeCloseTo(1, 3);
    }
  });

  it('cada ação do meta pode ser feita e acaba (ou fica, se repete) sem erro', () => {
    for (const nome of base.meta.acoes.keys()) {
      const p = nova();
      const acao = base.meta.acoes.get(nome)!;
      p.fazerAcao(nome, { entradaS: 0.1, saidaS: 0.2, repetir: acao.cicloS !== undefined && nome !== 'balao_parado' });
      anda(p, 1);
      if (acao.cicloS === undefined && nome !== 'balao_parado') {
        anda(p, acao.duracaoS + 0.5);
        expect(p.acaoEmCurso, nome).toBeNull();
      }
    }
  });
});

describe('PersonagemDeRosto: cordinha, gelatina e flutuar (L46)', () => {
  const OSSOS_DA_CORDINHA = ['cordinha_1', 'cordinha_2', 'cordinha_3', 'cordinha_4'];
  const mundoDo = (p: PersonagemDeRosto, nome: string): Vector3 => {
    p.raiz.updateMatrixWorld(true);
    return new Vector3().setFromMatrixPosition(p.osso(nome).matrixWorld);
  };
  const SO_CORDINHA = { olhar: false, corpoSegue: false, gelatina: false, flutuar: false } as const;
  const SEM_NADA = { olhar: false, corpoSegue: false, gelatina: false, flutuar: false, cordinha: false } as const;

  it('o recurso da cordinha liga sozinho com os ossos cordinha_* do esqueleto (ou do meta v2)', () => {
    const p = nova();
    expect(p.recursos.cordinha).toBe(true);
    expect(p.recursos.gelatina).toBe(true);
    expect(p.recursos.corpoSegue).toBe(true);
  });

  it('a cordinha pendura, e quando o balão anda ela fica para trás e depois alcança', () => {
    const p = base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: SO_CORDINHA });
    p.raiz.position.set(0, 1, 0);
    for (let i = 0; i < 180; i++) p.atualizar(1 / 60);
    const no = mundoDo(p, 'cordinha_1');
    const ponta = mundoDo(p, 'cordinha_4');
    expect(ponta.y).toBeLessThan(no.y - 0.03);
    // a ponta, em relação ao balão, parada: é o que a cordinha tem pendurada
    const parada = (): number => p.raiz.position.x - mundoDo(p, 'cordinha_4').x;
    const resto = parada();
    // anda 0,18 m em 0,2 s
    let atraso = 0;
    for (let i = 1; i <= 12; i++) {
      p.raiz.position.x = (0.18 * i) / 12;
      p.atualizar(1 / 60);
      atraso = Math.max(atraso, Math.abs(parada() - resto));
    }
    expect(atraso).toBeGreaterThan(0.01);
    for (let i = 0; i < 240; i++) p.atualizar(1 / 60);
    expect(Math.abs(parada() - resto)).toBeLessThan(0.01);
  });

  it('a cordinha não estica nem explode: os elos mantêm o comprimento com o balão chacoalhando e aparecendo em outro lugar', () => {
    const p = base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: SO_CORDINHA });
    const seco = base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: SEM_NADA });
    p.atualizar(0);
    const elos = (q: PersonagemDeRosto): number[] => OSSOS_DA_CORDINHA.slice(1).map((n, i) => mundoDo(q, n).distanceTo(mundoDo(q, OSSOS_DA_CORDINHA[i]!)));
    const repouso = elos(p);
    let pior = 0;
    let balancou = 0;
    for (let i = 0; i < 600; i++) {
      const t = i / 60;
      for (const q of [p, seco]) {
        q.raiz.position.set(0.3 * Math.sin(t * 9), 1 + 0.1 * Math.sin(t * 13), 0);
        q.raiz.rotation.set(0, Math.sin(t * 3), 0.3 * Math.sin(t * 7));
        if (i === 300) q.raiz.position.set(20, 5, -7);
        q.atualizar(1 / 60);
      }
      elos(p).forEach((e, k) => {
        expect(Number.isFinite(e)).toBe(true);
        pior = Math.max(pior, Math.abs(e - repouso[k]!) / repouso[k]!);
      });
      // a corrente simulada de fato balança em relação à da animação, que vai rígida com o balão
      balancou = Math.max(balancou, mundoDo(p, 'cordinha_4').distanceTo(mundoDo(seco, 'cordinha_4')));
    }
    expect(pior).toBeLessThan(0.05);
    expect(balancou).toBeGreaterThan(0.01);
  });

  it('reposicionar() recomeça a cordinha pendurada num salto de 0,1 a 0,3 m; sem ele a corrente chicoteia', () => {
    const pontaRelativa = (p: PersonagemDeRosto): Vector3 => mundoDo(p, 'cordinha_4').sub(mundoDo(p, 'cordinha_1'));
    const depoisDoSalto = (salto: number, reposicionar: boolean): number => {
      const p = base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: SO_CORDINHA });
      for (let i = 0; i < 180; i++) p.atualizar(1 / 60);
      const pendurada = pontaRelativa(p);
      p.raiz.position.x += salto;
      if (reposicionar) p.reposicionar();
      let pior = 0;
      for (let i = 0; i < 6; i++) {
        p.atualizar(1 / 60);
        pior = Math.max(pior, pontaRelativa(p).distanceTo(pendurada));
      }
      return pior;
    };
    for (const salto of [0.1, 0.2]) {
      expect(depoisDoSalto(salto, true), `com reposicionar, salto de ${salto} m`).toBeLessThan(0.01);
      expect(depoisDoSalto(salto, false), `sem reposicionar, salto de ${salto} m`).toBeGreaterThan(0.03);
    }
    expect(depoisDoSalto(0.3, true)).toBeLessThan(0.01);
  });

  it('a gelatina muda a escala do corpo com a aceleração e conserva o volume', () => {
    const gelatina = base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: { olhar: false, corpoSegue: false, cordinha: false, flutuar: false } });
    const seco = base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: SEM_NADA });
    let maiorDiferenca = 0;
    let pior = 0;
    for (let i = 0; i < 240; i++) {
      const y = 0.15 * Math.max(0, Math.sin((i / 60) * 6));
      gelatina.raiz.position.y = y;
      seco.raiz.position.y = y;
      gelatina.atualizar(1 / 60);
      seco.atualizar(1 / 60);
      const a = gelatina.osso('espinha_1').scale;
      const b = seco.osso('espinha_1').scale;
      maiorDiferenca = Math.max(maiorDiferenca, Math.abs(a.y / b.y - 1), Math.abs(a.x / b.x - 1));
      pior = Math.max(pior, Math.abs((a.x * a.y * a.z) / (b.x * b.y * b.z) - 1));
    }
    expect(maiorDiferenca).toBeGreaterThan(0.02);
    expect(maiorDiferenca).toBeLessThan(0.3);
    expect(pior).toBeLessThan(1e-6);
  });

  it('parada quieta a gelatina não mexe no corpo', () => {
    const gelatina = base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: { olhar: false, corpoSegue: false, cordinha: false, flutuar: false } });
    const seco = base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: SEM_NADA });
    for (let i = 0; i < 300; i++) {
      gelatina.atualizar(1 / 60);
      seco.atualizar(1 / 60);
    }
    expect(Math.abs(gelatina.osso('espinha_1').scale.y / seco.osso('espinha_1').scale.y - 1)).toBeLessThan(0.05);
  });

  it('flutuar: a parada ganha uma deriva pequena que não se repete, e some quando outra ação toma o corpo', () => {
    const flutua = base.instanciar({ cor: 0xffffff, sorteio: sorteioDeTeste(3), movimento: { olhar: false, corpoSegue: false, cordinha: false, gelatina: false } });
    const seco = base.instanciar({ cor: 0xffffff, sorteio: sorteioDeTeste(3), movimento: SEM_NADA });
    let maior = 0;
    const amostras: number[] = [];
    for (let i = 0; i < 60 * 40; i++) {
      flutua.atualizar(1 / 60);
      seco.atualizar(1 / 60);
      const d = flutua.osso('raiz').position.distanceTo(seco.osso('raiz').position);
      maior = Math.max(maior, d);
      if (i % 60 === 0) amostras.push(flutua.osso('raiz').position.y - seco.osso('raiz').position.y);
    }
    expect(maior).toBeGreaterThan(0.0005);
    expect(maior).toBeLessThan(0.02);
    expect(new Set(amostras.map((v) => v.toFixed(6))).size).toBeGreaterThan(20);
  });

  it('sem os ossos cordinha_* (ou sem o meta), o recurso se desliga sozinho e o resto segue', () => {
    const p = base.instanciar({ cor: 0xffffff, sorteio: sem, movimento: { cordinha: false } });
    expect(p.recursos.cordinha).toBe(false);
    for (let i = 0; i < 60; i++) p.atualizar(1 / 60);
  });

  it('a meta v2 pode dizer que a cordinha não é simulada: o recurso desliga', async () => {
    const meta2 = JSON.parse(JSON.stringify(meta)) as { cordinha?: unknown };
    meta2.cordinha = { ossos: OSSOS_DA_CORDINHA, simulada: false };
    const b = await carregarPersonagemDeRostoDeBytes(bytes.slice(0), { ...OPCOES, meta: meta2 });
    expect(b.instanciar({ cor: 0xffffff, sorteio: sem }).recursos.cordinha).toBe(false);
  });

  describe('a cordinha do meta v2 confere com o esqueleto (nada de desligar em silêncio)', () => {
    const comMeta = async (mexer: (cordinha: Record<string, unknown>) => void) => {
      const meta2 = JSON.parse(JSON.stringify(meta)) as { cordinha: Record<string, unknown> };
      mexer(meta2.cordinha);
      return carregarPersonagemDeRostoDeBytes(bytes.slice(0), { ...OPCOES, meta: meta2 });
    };

    it('o arquivo do Pincel confere com os ossos do .glb (os comprimentos batem com o esqueleto)', () => {
      expect(() => base.instanciar({ cor: 0xffffff, sorteio: sem })).not.toThrow();
    });

    it('um comprimento do meta que não bate com o osso do esqueleto lança, dizendo o campo e o osso', async () => {
      const b = await comMeta((c) => {
        const lista = [...(c.comprimento_de_cada_junta_m as number[])];
        lista[1] = lista[1]! * 2;
        c.comprimento_de_cada_junta_m = lista;
      });
      expect(() => b.instanciar({ cor: 0xffffff, sorteio: sem })).toThrow(/cordinha\.comprimento_de_cada_junta_m\[1\].*cordinha_2/);
    });

    it('um osso do meta que não existe no esqueleto lança, dizendo o osso', async () => {
      const b = await comMeta((c) => {
        c.ossos = [...(c.ossos as string[]).slice(0, 3), 'cordinha_9'];
      });
      expect(() => b.instanciar({ cor: 0xffffff, sorteio: sem })).toThrow(/cordinha\.ossos.*cordinha_9/);
    });

    it('um osso fora da ordem da hierarquia lança, dizendo qual', async () => {
      const b = await comMeta((c) => {
        const o = [...(c.ossos as string[])];
        [o[1], o[2]] = [o[2]!, o[1]!];
        c.ossos = o;
      });
      expect(() => b.instanciar({ cor: 0xffffff, sorteio: sem })).toThrow(/cordinha\.ossos.*cordinha_3/);
    });
  });

  it('com tudo ligado, nada aloca por quadro (perfilador de alocação: conta o lixo que o GC já recolheu)', async () => {
    const p = base.instanciar({ cor: 0xffffff, sorteio: sorteioDeTeste(5) });
    p.definirInteresse(0, { x: 0.3, y: 0.0144, z: 0.4 }, 4);
    p.definirInteresse(1, { x: -0.3, y: 0.0144, z: 0.4 }, 1);
    p.definirInteresse(2, { x: 0, y: 0.3, z: 0.6 }, 2);
    const passo = (i: number): void => {
      p.raiz.position.set(0.05 * Math.sin(i * 0.05), 0.02 * Math.sin(i * 0.11), 0);
      p.raiz.rotation.y = 0.2 * Math.sin(i * 0.03);
      if (i % 400 === 0) p.fazerAcao(i % 800 === 0 ? 'balao_pulinho' : 'balao_susto', { entradaS: 0.05, saidaS: 0.2 });
      if (i % 300 === 0) p.fazerCara(i % 600 === 0 ? 'cara_sorriso' : 'cara_susto');
      p.atualizar(1 / 60);
    };
    await provarSemAlocar(passo, { aquecer: 15_000, quadros: 10_000 });
  }, TEMPO_DO_PERFILADOR_MS);
});
