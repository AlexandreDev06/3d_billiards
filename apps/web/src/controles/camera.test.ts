import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO } from '@sinuca/fisica';
import { semiMesa } from '../cena/mesa';
import { CONFIG_WEB } from '../config';
import { CameraRig } from './camera';

const LARGURA = 1280;
const ALTURA = 720;
const { x: SEMI_X, z: SEMI_Z } = semiMesa(CONFIG_FISICA_PADRAO.mesa);
const { reservaEsquerdaPx, reservaDireitaPx } = CONFIG_WEB.camera.cima;

function novaCamera(cfg = CONFIG_WEB.camera): { camera: PerspectiveCamera; rig: CameraRig } {
  const camera = new PerspectiveCamera(CONFIG_WEB.camera.campoDeVisaoGraus, LARGURA / ALTURA, 0.01, 50);
  const rig = new CameraRig(camera, cfg, SEMI_X, SEMI_Z);
  rig.definirLarguraDaTela(LARGURA);
  return { camera, rig };
}

function rodar(rig: CameraRig, quadros: number): void {
  const ancora = new Vector3(-0.5, 0.027, 0);
  for (let i = 0; i < quadros; i++) rig.atualizar(1 / 60, ancora, 0);
}

/** Posição na tela (−1 a 1, +x para a direita) de um ponto do pano. */
function naTela(camera: PerspectiveCamera, x: number, z: number): Vector3 {
  camera.updateMatrixWorld();
  return new Vector3(x, 0, z).project(camera);
}

describe('CameraRig — vista de cima', () => {
  it('a mesa inteira cabe entre o placar e o painel de efeito', () => {
    const { camera, rig } = novaCamera();
    rig.alternarVista();
    rodar(rig, 600);
    const esquerda = -1 + (2 * reservaEsquerdaPx) / LARGURA;
    const direita = 1 - (2 * reservaDireitaPx) / LARGURA;
    for (const x of [-SEMI_X, SEMI_X]) {
      for (const z of [-SEMI_Z, SEMI_Z]) {
        const p = naTela(camera, x, z);
        expect(p.x).toBeGreaterThanOrEqual(esquerda - 1e-3);
        expect(p.x).toBeLessThanOrEqual(direita + 1e-3);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('o centro da mesa fica no centro da faixa livre, à direita do centro da tela', () => {
    const { camera, rig } = novaCamera();
    rig.alternarVista();
    rodar(rig, 600);
    expect(naTela(camera, 0, 0).x).toBeCloseTo((reservaEsquerdaPx - reservaDireitaPx) / LARGURA, 3);
  });

  it('ao voltar para a vista de tacada o desenho volta ao centro e o deslocamento é desligado', () => {
    const { camera, rig } = novaCamera();
    rig.alternarVista();
    rodar(rig, 600);
    expect(camera.view?.enabled).toBe(true);
    rig.alternarVista();
    rodar(rig, 600);
    expect(camera.view?.enabled).toBe(false);
    expect(camera.aspect).toBeCloseTo(LARGURA / ALTURA, 9);
  });

  it('na órbita livre o desenho não é deslocado', () => {
    const { camera, rig } = novaCamera();
    rig.alternarVista();
    rodar(rig, 600);
    rig.alternarVista();
    rig.iniciarOrbita();
    rodar(rig, 600);
    expect(camera.view?.enabled ?? false).toBe(false);
  });

  it('uma janela mais larga deixa a mesa maior (a reserva do HUD pesa menos)', () => {
    const larga = novaCamera();
    larga.camera.aspect = 2560 / ALTURA;
    larga.camera.updateProjectionMatrix();
    larga.rig.definirLarguraDaTela(2560);
    larga.rig.alternarVista();
    rodar(larga.rig, 600);
    const estreita = novaCamera();
    estreita.rig.alternarVista();
    rodar(estreita.rig, 600);
    // Mesma altura de janela: com o HUD ocupando fração menor, a mesa ocupa mais da altura.
    expect(Math.abs(naTela(larga.camera, 0, SEMI_Z).y)).toBeGreaterThanOrEqual(Math.abs(naTela(estreita.camera, 0, SEMI_Z).y) - 1e-6);
  });
});

describe('CameraRig — configurações do jogador', () => {
  const dobro = { ...CONFIG_WEB.camera, orbital: { ...CONFIG_WEB.camera.orbital, radiosPorPixel: CONFIG_WEB.camera.orbital.radiosPorPixel * 2 } };

  const azimute = (camera: PerspectiveCamera): number => Math.atan2(camera.position.z, camera.position.x);
  /** Diferença de ângulos dentro de (−π, π]. */
  const dif = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  /** Quanto a câmera girou em volta da mesa (rad) depois de orbitar 60 px. */
  function giroDaOrbita(cfg: typeof CONFIG_WEB.camera): number {
    const { camera, rig } = novaCamera(cfg);
    rodar(rig, 600);
    rig.iniciarOrbita();
    const antes = azimute(camera);
    rig.orbitar(60, 0);
    rodar(rig, 600);
    return dif(azimute(camera), antes);
  }

  it('a sensibilidade da órbita escala o giro por pixel', () => {
    expect(giroDaOrbita(dobro)).toBeCloseTo(2 * giroDaOrbita(CONFIG_WEB.camera), 3);
  });

  it('configurar troca na hora, sem recriar a câmera', () => {
    const { camera, rig } = novaCamera();
    rodar(rig, 600);
    rig.iniciarOrbita();
    const antes = azimute(camera);
    rig.configurar(dobro);
    rig.orbitar(60, 0);
    rodar(rig, 600);
    expect(dif(azimute(camera), antes)).toBeCloseTo(2 * 60 * CONFIG_WEB.camera.orbital.radiosPorPixel, 3);
  });

  it('o passo do zoom escala quanto cada clique da roda aproxima a câmera de tacada', () => {
    const altura = (cfg: typeof CONFIG_WEB.camera): number => {
      const { camera, rig } = novaCamera(cfg);
      rig.zoomar(-1);
      rodar(rig, 600);
      return camera.position.y;
    };
    const base = CONFIG_WEB.camera.tacada.altura;
    const comum = altura(CONFIG_WEB.camera);
    const maior = altura({ ...CONFIG_WEB.camera, passoZoom: CONFIG_WEB.camera.passoZoom * 2 });
    expect(comum).toBeCloseTo(base * (1 - CONFIG_WEB.camera.passoZoom), 3);
    expect(maior).toBeCloseTo(base * (1 - CONFIG_WEB.camera.passoZoom * 2), 3);
  });

  it('o giro da câmera de tacada: com taxa maior ela acompanha a mira mais depressa', () => {
    const faltaAcompanhar = (taxa: number): number => {
      const { camera, rig } = novaCamera({ ...CONFIG_WEB.camera, taxaSuavizacao: taxa });
      const ancora = new Vector3(-0.5, 0.027, 0);
      rig.atualizar(1 / 60, ancora, 0);
      for (let i = 0; i < 12; i++) rig.atualizar(1 / 60, ancora, 1);
      const para = new Vector3().copy(camera.position).sub(ancora);
      // A câmera fica atrás do taco: a direção dela em relação à âncora, invertida, é o ângulo que ela já alcançou.
      return Math.abs(1 - Math.atan2(-para.z, -para.x));
    };
    expect(faltaAcompanhar(CONFIG_WEB.camera.taxaSuavizacao * 2)).toBeLessThan(faltaAcompanhar(CONFIG_WEB.camera.taxaSuavizacao));
    expect(faltaAcompanhar(CONFIG_WEB.camera.taxaSuavizacao * 0.5)).toBeGreaterThan(faltaAcompanhar(CONFIG_WEB.camera.taxaSuavizacao));
  });
});

describe('CameraRig — câmera de tacada com o taco que sobe', () => {
  const ancora = new Vector3(-0.5, 0.028, 0);
  const alto = { elevacao: (25 * Math.PI) / 180, recuo: 0 };

  function assentar(rig: CameraRig, taco?: { elevacao: number; recuo: number }): void {
    for (let i = 0; i < 600; i++) rig.atualizar(1 / 60, ancora, 0, taco);
  }

  it('sem informação do taco, ou com o taco de repouso, é a câmera de sempre', () => {
    const { camera, rig } = novaCamera();
    assentar(rig);
    expect(camera.position.y).toBeCloseTo(CONFIG_WEB.camera.tacada.altura, 6);
    expect(rig.ultimaPoseDaTacada.subiu).toBe(false);
    const outra = novaCamera();
    assentar(outra.rig, { elevacao: CONFIG_WEB.elevacaoDoTaco.minima, recuo: 0.1 });
    expect(outra.camera.position.toArray()).toEqual(camera.position.toArray());
  });

  it('com o taco alto a câmera sobe e chega mais perto da bola na horizontal, no mesmo amortecimento da câmera', () => {
    const { camera, rig } = novaCamera();
    assentar(rig);
    const antes = camera.position.clone();
    // Um quadro depois de o taco subir: já se mexeu um pouco, mas ainda não chegou (amortecida, sem pulo).
    rig.atualizar(1 / 60, ancora, 0, alto);
    const umQuadro = camera.position.clone();
    expect(umQuadro.y).toBeGreaterThan(antes.y);
    expect(umQuadro.y).toBeLessThan(rig.ultimaPoseDaTacada.y);
    assentar(rig, alto);
    expect(rig.ultimaPoseDaTacada.subiu).toBe(true);
    expect(camera.position.y).toBeCloseTo(rig.ultimaPoseDaTacada.y, 3);
    expect(camera.position.y).toBeGreaterThan(antes.y + 0.1);
    expect(camera.position.x).toBeGreaterThan(antes.x);
    // O taco volta ao repouso e a câmera também.
    assentar(rig, { elevacao: CONFIG_WEB.elevacaoDoTaco.minima, recuo: 0 });
    expect(camera.position.y).toBeCloseTo(antes.y, 3);
  });

  it('a câmera segue a elevação em qualquer zoom (o zoom mínimo e o máximo também sobem)', () => {
    for (const sinal of [-1, 1]) {
      const { camera, rig } = novaCamera();
      for (let i = 0; i < 12; i++) rig.zoomar(sinal);
      assentar(rig);
      const antes = camera.position.y;
      assentar(rig, alto);
      expect(camera.position.y, `zoom ${rig.zoomDaTacada}`).toBeGreaterThan(antes);
    }
  });

  it('a vista de cima e a órbita não dependem do taco', () => {
    const { camera, rig } = novaCamera();
    rig.alternarVista();
    assentar(rig);
    const semTaco = camera.position.clone();
    assentar(rig, alto);
    expect(camera.position.toArray()).toEqual(semTaco.toArray());
  });
});

describe('CameraRig — câmera do fim', () => {
  const POSE = { x: 0, y: 1.9, z: 3.2, olharX: 0, olharY: 0.4, olharZ: -0.15 };

  it('vai para a pose do fim e a segue, sem pular', () => {
    const { camera, rig } = novaCamera();
    rodar(rig, 5);
    const antes = camera.position.clone();
    rig.entrarNoFim(POSE);
    rodar(rig, 1);
    expect(camera.position.distanceTo(antes)).toBeLessThan(antes.distanceTo(new Vector3(POSE.x, POSE.y, POSE.z)));
    rodar(rig, 600);
    expect(camera.position.distanceTo(new Vector3(POSE.x, POSE.y, POSE.z))).toBeLessThan(0.001);
    expect(rig.vista).toBe('fim');
  });

  it('Tab e a roda do mouse não mexem nela, e sairDoFim volta à câmera de tacada', () => {
    const { camera, rig } = novaCamera();
    rig.entrarNoFim(POSE);
    rodar(rig, 600);
    const parada = camera.position.clone();
    rig.alternarVista();
    rig.zoomar(1);
    rodar(rig, 60);
    expect(rig.vista).toBe('fim');
    expect(camera.position.distanceTo(parada)).toBeLessThan(1e-6);
    expect(rig.zoomDaTacada).toBe(1);
    rig.sairDoFim();
    expect(rig.vista).toBe('tacada');
    rodar(rig, 600);
    expect(camera.position.distanceTo(parada)).toBeGreaterThan(0.5);
  });

  it('sairDoFim fora do fim não troca a vista de cima', () => {
    const { rig } = novaCamera();
    rig.alternarVista();
    rig.sairDoFim();
    expect(rig.vista).toBe('cima');
  });
});

describe('CameraRig — câmera do menu (L44)', () => {
  const POSE = { x: 4.5, y: 1.55, z: 2.6, olharX: 0.4, olharY: 0.8, olharZ: 0 };

  it('vai para a pose do menu e a segue; Tab, órbita e roda não mexem nela', () => {
    const { camera, rig } = novaCamera();
    rodar(rig, 5);
    rig.entrarNoMenu(POSE);
    rodar(rig, 600);
    expect(rig.vista).toBe('menu');
    const alvo = new Vector3(POSE.x, POSE.y, POSE.z);
    expect(camera.position.distanceTo(alvo)).toBeLessThan(0.001);
    rig.alternarVista();
    rig.iniciarOrbita();
    rig.zoomar(1);
    rodar(rig, 60);
    expect(rig.vista).toBe('menu');
    expect(rig.orbitando).toBe(false);
    expect(camera.position.distanceTo(alvo)).toBeLessThan(1e-6);
  });

  it('sairDoMenu volta à vista de antes (a de cima também), e fora do menu não faz nada', () => {
    const { rig } = novaCamera();
    rig.sairDoMenu();
    expect(rig.vista).toBe('tacada');
    rig.alternarVista();
    rig.entrarNoMenu(POSE);
    rig.entrarNoMenu({ ...POSE, x: 4.4 });
    rig.sairDoMenu();
    expect(rig.vista).toBe('cima');
  });

  it('o menu encerra a órbita que estava rolando', () => {
    const { rig } = novaCamera();
    rig.iniciarOrbita();
    expect(rig.orbitando).toBe(true);
    rig.entrarNoMenu(POSE);
    expect(rig.orbitando).toBe(false);
  });
});

describe('CameraRig — limites da sala (L44)', () => {
  const SALA = CONFIG_WEB.boteco.sala;
  const FOLGA = 1e-6;
  const dentro = (p: Vector3): boolean => Math.abs(p.x) <= SALA.xMax + FOLGA && Math.abs(p.z) <= SALA.zMax + FOLGA && p.y <= SALA.yMax + FOLGA;

  it('sem limites (sem boteco) a órbita afastada vai tão longe quanto sempre', () => {
    const { camera, rig } = novaCamera();
    rodar(rig, 5);
    rig.iniciarOrbita();
    rig.orbitar(0, 40);
    for (let i = 0; i < 80; i++) rig.zoomar(1);
    rodar(rig, 600);
    expect(camera.position.length()).toBeGreaterThan(Math.hypot(SALA.xMax, SALA.zMax));
  });

  it('com limites, a órbita afastada ao máximo, em qualquer direção, fica dentro da sala', () => {
    const { camera, rig } = novaCamera();
    rig.definirLimites(SALA);
    rodar(rig, 5);
    rig.iniciarOrbita();
    for (let i = 0; i < 80; i++) rig.zoomar(1);
    for (const [px, py] of [[0, 40], [314, 0], [314, 0], [314, 0], [0, 400], [0, -400], [157, 90]] as const) {
      rig.orbitar(px, py);
      rodar(rig, 600);
      expect(dentro(camera.position)).toBe(true);
    }
  });

  it('a câmera de tacada com a âncora no canto da mesa também fica dentro (puxa para a bola, na mesma linha)', () => {
    const { camera, rig } = novaCamera();
    rig.definirLimites(SALA);
    const ancora = new Vector3(-SEMI_X, 0.027, -SEMI_Z);
    for (const angulo of [0, 1, 2, 3, 4, 5, 6]) {
      for (let i = 0; i < 600; i++) rig.atualizar(1 / 60, ancora, angulo);
      expect(dentro(camera.position)).toBe(true);
    }
  });

  it('a vista de cima fica sobre a mesa, acima do forro (o forro some por altura), e dentro nas paredes', () => {
    const { camera, rig } = novaCamera();
    rig.definirLimites(SALA);
    rig.alternarVista();
    rodar(rig, 600);
    expect(rig.vista).toBe('cima');
    expect(camera.position.y).toBeGreaterThan(CONFIG_WEB.boteco.tetoSomeAcimaDe);
    expect(Math.abs(camera.position.x)).toBeLessThanOrEqual(SALA.xMax);
    expect(Math.abs(camera.position.z)).toBeLessThanOrEqual(SALA.zMax);
    for (const x of [-1.45, 1.45]) for (const z of [-0.85, 0.85]) {
      const p = naTela(camera, x, z);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
    }
  });
});
