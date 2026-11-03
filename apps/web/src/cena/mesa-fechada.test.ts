import { describe, expect, it } from 'vitest';
import { DoubleSide, FrontSide, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { MESA_BAR } from '@sinuca/fisica';
import { CONFIG_WEB } from '../config';
import { criarCacapa } from './cacapa';
import { comMolduraVisual, entalhesDaMoldura } from './geometria-mesa';
import type { MateriaisMesa } from './materiais-mesa';
import { geometriaDaMoldura, geometriaDoPano, semiMesa } from './mesa';

const cfg = CONFIG_WEB.mesa;
const mesa = comMolduraVisual(MESA_BAR, cfg);
const yTopo = mesa.alturaTabela + cfg.sobraMoldura;
const material = (lado: typeof FrontSide | typeof DoubleSide): MeshBasicMaterial => new MeshBasicMaterial({ side: lado });
// Os lados que `criarMateriaisMesa` dá: o pano e a madeira só de frente (FrontSide), o forro, o tubo e o alumínio dos dois lados.
const materiais = { aluminio: material(DoubleSide), couro: material(DoubleSide), tubo: material(DoubleSide), fundo: material(FrontSide) } as unknown as MateriaisMesa;

const cena = new Group();
cena.add(new Mesh(geometriaDoPano(mesa, cfg), material(FrontSide)), new Mesh(geometriaDaMoldura(mesa, cfg, semiMesa(MESA_BAR, cfg)), material(FrontSide)));
const entalhes = entalhesDaMoldura(mesa, cfg);
for (const { furo, caminho } of entalhes) cena.add(criarCacapa(furo, caminho, cfg, materiais, yTopo));
cena.updateMatrixWorld(true);

/**
 * O primeiro ponto onde a vista da câmera, rente ao buraco, bate em algo que se desenha (o `Raycaster` corta as costas das faces de
 * `FrontSide`, como a GPU). `null` é a vista passando pela mesa e saindo por baixo: o jogador vê o chão da sala pelo buraco.
 */
function primeiroQueSeVe(de: Vector3, para: Vector3): Vector3 | null {
  const raio = new Raycaster(de, para.clone().sub(de).normalize());
  return raio.intersectObject(cena, true)[0]?.point ?? null;
}

describe.each(entalhes.map((e) => ({ id: e.furo.fisica.id, furo: e.furo })))('caçapa $id: não se vê através dela', ({ furo }) => {
  const { centro, raio } = furo;
  // Alvos na parede do buraco (a espessura do pano e o tubo abaixo), em volta do círculo todo, e câmeras do lado oposto, de cima e rasantes.
  const alturas = [-0.002, -0.01, -0.018, -0.04, -0.1, -0.14];
  const elevacoes = [20, 35, 50, 70].map((g) => (g * Math.PI) / 180);
  for (let k = 0; k < 24; k++) {
    const angulo = (k / 24) * 2 * Math.PI;
    const fora = new Vector3(Math.cos(angulo), 0, Math.sin(angulo));
    it(`a parede a ${Math.round((angulo * 180) / Math.PI)}° é vista de cima e de rente por quem olha do lado oposto`, () => {
      for (const y of alturas) {
        const alvo = new Vector3(centro.x + fora.x * raio * 0.995, y, centro.z + fora.z * raio * 0.995);
        for (const e of elevacoes) {
          const camera = alvo.clone().addScaledVector(fora, -0.4 * Math.cos(e)).setY(alvo.y + 0.4 * Math.sin(e));
          const ponto = primeiroQueSeVe(camera, alvo);
          expect(ponto, `alvo y=${y} a ${(e * 180) / Math.PI}°`).not.toBeNull();
          expect(ponto!.y).toBeGreaterThan(-cfg.profundidadeTubo - 1e-6);
        }
      }
    });
  }
});
