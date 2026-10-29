import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Quaternion, Vector3, type SkinnedMesh } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { lerMetaDoRosto } from '../meta-do-rosto';
import { carregarPersonagemDeRostoDeBytes, type BaseDoRosto } from './carregar-rosto';
import { gerenciadorDeTestes } from './para-testes-three';
import type { PersonagemDeRosto } from './rosto-em-cena';

/**
 * L46c: o olho aberto continua aberto quando o balão olha para cima ou para baixo. Com o `.glb` real: cada cara de olho aberto, cada olhar
 * vertical de -34 a +34 graus, o rosto composto pelo `PersonagemDeRosto` (formas do arquivo, olho girado, pálpebras que seguem o olhar), e a
 * pupila medida por raios: de vistas em volta do rosto, quantos pontos da pupila a pele (pálpebra) esconde.
 *
 * Por que existe: o balão de `concentrado` e de `tedio` parecia dormir olhando para a branca. A causa não era a pálpebra (aqui está o que
 * ela faz: no pior caso 4% da pupila coberta olhando para baixo), era um piscar que o relógio lento da captura congelava no meio
 * (`balao-do-artista.test.ts`). Este teste segura o outro lado: nenhuma soma de formas fecha o olho fora do piscar.
 */
const PASTA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../arte/personagens/exportados');
const glb = readFileSync(resolve(PASTA, 'balao.glb'));
const bytes = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer;
const meta = JSON.parse(readFileSync(resolve(PASTA, 'balao-meta.json'), 'utf8')) as {
  olho_fechado?: { caras?: string[] };
  olhos: Record<string, { centro_m: [number, number, number]; eixo_do_olhar_no_repouso: [number, number, number] }>;
};
const metaLida = lerMetaDoRosto(meta);
const OPCOES = { meta, nomesDasMalhas: { alta: 'balao_alta', baixa: 'balao_baixa' }, acaoBase: 'balao_parado', gerenciador: gerenciadorDeTestes() } as const;

/** As caras cujo desenho já é de olho fechado ("^ ^"): o arquivo as lista em `olho_fechado.caras`. As outras mantêm o olho aberto. */
const CARAS_DE_OLHO_FECHADO = new Set(meta.olho_fechado?.caras ?? []);
const CARAS_ABERTAS = metaLida.caras.filter((c) => !CARAS_DE_OLHO_FECHADO.has(c));
/** As formas que fecham o olho (a fita sobe e o globo afunda na pele): o piscar, a piscadinha e as duas caras de olho fechado. */
const FORMAS_QUE_FECHAM = ['piscar', 'piscar_esq', 'piscar_dir', ...CARAS_DE_OLHO_FECHADO];
/** O olhar vertical, em graus em relação à cabeça (o limite do arquivo é 34). */
const OLHARES = [-34, -17, 0, 17, 34];
/** As vistas, em graus de elevação em relação ao rosto: de frente, de cima (a câmera do jogo olha a mesa de cima) e de baixo. */
const VISTAS = [0, 30, 60, -30];
/** Quanto do peso de formas que fecham pode sobrar fora do piscar (0 a 1). */
const PESO_QUE_FECHA_MAXIMO = 0.02;
/** A fração da pupila que a pele pode esconder (0 a 1): o pior caso do arquivo é 19% (olhando 34 graus para cima de tédio ou de bravo), a pupila segue à vista. */
const PUPILA_COBERTA_MAXIMA = 0.3;

let base: BaseDoRosto;
beforeAll(async () => {
  base = await carregarPersonagemDeRostoDeBytes(bytes.slice(0), OPCOES);
});

const nova = (): PersonagemDeRosto =>
  base.instanciar({
    cor: 0xffffff,
    sorteio: () => 0.5,
    // sem piscar sozinho nem corpo que absorve o olhar (o olho leva o ângulo inteiro): é o pior caso das pálpebras
    piscar: { minS: 1e5, maxS: 2e5, chanceDeDuplo: 0 },
    movimento: { flutuar: false, gelatina: false, cordinha: false, corpoSegue: false },
  });

function malhasDe(p: PersonagemDeRosto): { latex: SkinnedMesh; globo: SkinnedMesh } {
  const por = new Map<string, SkinnedMesh>();
  p.raiz.traverse((o) => {
    const m = o as SkinnedMesh;
    if (m.isSkinnedMesh && o.visible) por.set((m.material as { name: string }).name, m);
  });
  return { latex: por.get('latex_glb')!, globo: por.get('olho')! };
}

/** Os vértices do globo a menos de 20 graus do eixo do olhar em repouso (a pupila e o miolo da íris), por olho. */
function pupilas(p: PersonagemDeRosto): number[] {
  p.raiz.updateMatrixWorld(true);
  const { globo } = malhasDe(p);
  globo.skeleton.update();
  const achados: number[] = [];
  const centros = Object.values(meta.olhos);
  const v = new Vector3();
  for (let i = 0; i < globo.geometry.attributes.position!.count; i++) {
    globo.getVertexPosition(i, v);
    v.applyMatrix4(globo.matrixWorld);
    for (const c of centros) {
      const rel = v.clone().sub(new Vector3(...c.centro_m));
      if (rel.length() < 0.02 && (Math.acos(rel.dot(new Vector3(...c.eixo_do_olhar_no_repouso)) / rel.length()) * 180) / Math.PI < 20) achados.push(i);
    }
  }
  return achados;
}

/** Möller–Trumbore: o segmento de `o` a `o + d * tmax` atravessa o triângulo `a b c`? */
function atravessa(o: Vector3, d: Vector3, tmax: number, a: Vector3, b: Vector3, c: Vector3): boolean {
  const e1 = new Vector3().subVectors(b, a);
  const e2 = new Vector3().subVectors(c, a);
  const h = new Vector3().crossVectors(d, e2);
  const det = e1.dot(h);
  if (Math.abs(det) < 1e-12) return false;
  const f = 1 / det;
  const s = new Vector3().subVectors(o, a);
  const u = f * s.dot(h);
  if (u < 0 || u > 1) return false;
  const q = new Vector3().crossVectors(s, e1);
  const v = f * d.dot(q);
  if (v < 0 || u + v > 1) return false;
  const t = f * e2.dot(q);
  return t > 1e-6 && t < tmax - 1e-4;
}

/** A fração da pupila que a pele do látex esconde, vista de `elevacao` graus acima (ou abaixo) do rosto. */
function pupilaCoberta(p: PersonagemDeRosto, repouso: Quaternion, indices: number[], elevacao: number): number {
  p.raiz.updateMatrixWorld(true);
  const { latex, globo } = malhasDe(p);
  latex.skeleton.update();
  globo.skeleton.update();
  const pontos: Vector3[] = [];
  for (let i = 0; i < latex.geometry.attributes.position!.count; i++) pontos.push(latex.getVertexPosition(i, new Vector3()).applyMatrix4(latex.matrixWorld));
  const centro = new Vector3();
  const olho = new Vector3();
  p.osso('olho_esq').getWorldPosition(centro);
  p.osso('olho_dir').getWorldPosition(olho);
  centro.add(olho).multiplyScalar(0.5);
  const triangulos: Vector3[][] = [];
  const indice = latex.geometry.index!.array;
  for (let t = 0; t < indice.length; t += 3) {
    const a = pontos[indice[t]!]!;
    if (a.distanceTo(centro) < 0.05) triangulos.push([a, pontos[indice[t + 1]!]!, pontos[indice[t + 2]!]!]);
  }
  const giro = p.osso('espinha_2').getWorldQuaternion(new Quaternion()).multiply(repouso.clone().invert());
  const rad = (elevacao * Math.PI) / 180;
  const camera = centro.clone().addScaledVector(new Vector3(0, Math.sin(rad), Math.cos(rad)).applyQuaternion(giro), 0.4);
  let escondidos = 0;
  for (const i of indices) {
    const alvo = globo.getVertexPosition(i, new Vector3()).applyMatrix4(globo.matrixWorld);
    const d = alvo.clone().sub(camera);
    const tmax = d.length();
    d.normalize();
    if (triangulos.some(([a, b, c]) => atravessa(camera, d, tmax, a!, b!, c!))) escondidos++;
  }
  return escondidos / indices.length;
}

const pesoQueFecha = (p: PersonagemDeRosto): number => {
  const { formas } = p.diagnosticoDoRosto();
  return FORMAS_QUE_FECHAM.reduce((soma, f) => soma + Math.abs(formas[f] ?? 0), 0);
};

function olhandoPara(cara: string, graus: number): PersonagemDeRosto {
  const p = nova();
  p.fazerCara(cara);
  const rad = (graus * Math.PI) / 180;
  p.olharPara({ x: 0, y: 0.6 * Math.sin(rad), z: 0.6 * Math.cos(rad) });
  for (let i = 0; i < 240; i++) p.atualizar(1 / 60);
  return p;
}

describe('o olho aberto segue aberto olhando para cima e para baixo (L46c)', () => {
  it('as caras de olho aberto são todas menos as de olho fechado do arquivo', () => {
    expect([...CARAS_DE_OLHO_FECHADO].sort()).toEqual(['cara_comemorando', 'cara_rindo']);
    expect(CARAS_ABERTAS).toHaveLength(metaLida.caras.length - 2);
    expect(CARAS_ABERTAS).toContain('cara_concentrado');
    expect(CARAS_ABERTAS).toContain('cara_tedio');
  });

  it('o detector enxerga o olho fechado: piscar e as caras de olho fechado escondem a pupila inteira', () => {
    const repouso = nova().osso('espinha_2').getWorldQuaternion(new Quaternion());
    const indices = pupilas(nova());
    expect(indices.length).toBeGreaterThan(30);
    const piscando = nova();
    piscando.forcarPiscar(1);
    piscando.atualizar(1 / 60);
    for (const v of VISTAS) expect(pupilaCoberta(piscando, repouso, indices, v), `piscar, vista ${v}`).toBeGreaterThan(0.95);
    for (const cara of CARAS_DE_OLHO_FECHADO) {
      const p = olhandoPara(cara, 0);
      expect(pesoQueFecha(p), cara).toBeGreaterThan(0.9);
      expect(pupilaCoberta(p, repouso, indices, 0), cara).toBeGreaterThan(0.95);
    }
  });

  it.each(CARAS_ABERTAS)('%s: de -34 a +34 graus nenhuma forma fecha o olho e a pupila fica à vista', (cara) => {
    const repouso = nova().osso('espinha_2').getWorldQuaternion(new Quaternion());
    const indices = pupilas(nova());
    for (const graus of OLHARES) {
      const p = olhandoPara(cara, graus);
      const { pitchDoOlhoGraus } = p.diagnosticoDoRosto();
      // o teste olha mesmo para onde diz (o limite do arquivo é 34): sem isso um olho parado passaria por aberto
      expect(Math.abs(pitchDoOlhoGraus - graus), `${cara} olhar ${graus}`).toBeLessThan(5);
      expect(pesoQueFecha(p), `${cara} olhar ${graus}: peso que fecha`).toBeLessThan(PESO_QUE_FECHA_MAXIMO);
      for (const vista of VISTAS) {
        const coberta = pupilaCoberta(p, repouso, indices, vista);
        expect(coberta, `${cara} olhar ${graus} vista ${vista}: pupila coberta`).toBeLessThan(PUPILA_COBERTA_MAXIMA);
      }
    }
  });
});
