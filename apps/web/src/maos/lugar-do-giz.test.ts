import { describe, expect, it } from 'vitest';
import { CONFIG_FISICA_PADRAO } from '@sinuca/fisica';
import { obstaculosDaMesa } from '../controles/elevacao-do-taco';
import { CONFIG_WEB } from '../config';
import { apoioEm } from './apoio';
import { CuboNaBorda, cuboAparece, lugarDoCuboNaBorda, lugarVazioDoCubo } from './lugar-do-giz';
import { projetorDeAgulha } from './projetor';

const OBST = obstaculosDaMesa(CONFIG_FISICA_PADRAO.mesa, CONFIG_WEB.mesa);
const CFG = CONFIG_WEB.maos.giz.borda;
const LADO = CONFIG_WEB.maos.giz.cubo.lado;

/** A câmera de tacada de sempre: 1 m atrás da bola e 0,32 m acima, olhando à frente. */
function camera(bolaX: number, bolaZ: number, angulo: number) {
  return projetorDeAgulha(
    [bolaX - Math.cos(angulo) * 1, 0.35, bolaZ - Math.sin(angulo) * 1],
    [bolaX + Math.cos(angulo) * 0.4, 0.03, bolaZ + Math.sin(angulo) * 0.4],
    50,
    16 / 9,
  );
}

describe('lugarDoCuboNaBorda', () => {
  it('põe o cubo na moldura, do lado esquerdo de quem taca, assentado nela', () => {
    // Mirando para +X (esquerda de quem olha é −Z): a borda de cima, na moldura da borda comprida.
    const l = lugarDoCuboNaBorda(-0.3, 0, 0, LADO, OBST, CFG, null);
    expect(l.ok).toBe(true);
    expect(l.z).toBeLessThan(-OBST.semiZ - OBST.larguraBorracha);
    expect(apoioEm(OBST, l.x, l.z).tipo).toBe('moldura');
    expect(l.y).toBeCloseTo(OBST.alturaMoldura + LADO / 2, 9);
  });

  it('o lado esquerdo muda com a mira', () => {
    const paraX = lugarDoCuboNaBorda(0.2, 0, 0, LADO, OBST, CFG, null);
    const paraMenosX = lugarDoCuboNaBorda(0.2, 0, Math.PI, LADO, OBST, CFG, null);
    expect(paraX.z).toBeLessThan(0);
    expect(paraMenosX.z).toBeGreaterThan(0);
  });

  it('nunca na boca de uma caçapa: se a semirreta cai nela, desliza pela borda até a madeira', () => {
    // A bola em x = 0 mirando +X cruza a moldura bem em frente da caçapa do meio.
    const l = lugarDoCuboNaBorda(0, 0, 0, LADO, OBST, CFG, null);
    expect(l.ok).toBe(true);
    expect(apoioEm(OBST, l.x, l.z).tipo).toBe('moldura');
    for (const [dx, dz] of [[LADO, 0], [-LADO, 0], [0, LADO], [0, -LADO]] as const) expect(apoioEm(OBST, l.x + dx, l.z + dz).tipo).toBe('moldura');
  });

  it('com câmera, escolhe um lugar que aparece na tela', () => {
    for (const [bx, bz, a] of [[-0.5, 0.1, 0], [0.4, -0.3, 1.2], [0, 0.3, Math.PI], [-0.6, -0.4, -2]] as const) {
      const p = camera(bx, bz, a);
      const l = lugarDoCuboNaBorda(bx, bz, a, LADO, OBST, CFG, p);
      if (l.ok) expect(cuboAparece(l.x, l.y, l.z, p, CFG)).toBe(true);
    }
  });

  it('coube em algum lugar na mira de sempre (bola no meio da mesa, câmera de tacada)', () => {
    const p = camera(-0.5, 0, 0);
    expect(lugarDoCuboNaBorda(-0.5, 0, 0, LADO, OBST, CFG, p).ok).toBe(true);
  });

  it('sem lugar que apareça, ok é falso', () => {
    // Uma câmera olhando para longe da mesa: nada na moldura aparece.
    const longe = projetorDeAgulha([0, 5, 0], [0, 10, 0.001], 50, 16 / 9);
    expect(lugarDoCuboNaBorda(0, 0, 0, LADO, OBST, CFG, longe).ok).toBe(false);
  });

  it('reaproveita o objeto de saída', () => {
    const saida = lugarVazioDoCubo();
    expect(lugarDoCuboNaBorda(-0.3, 0, 0, LADO, OBST, CFG, null, saida)).toBe(saida);
  });
});

describe('CuboNaBorda', () => {
  const entrada = { bolaX: -0.5, bolaZ: 0, angulo: 0, ativo: true, livre: true };

  function rodar(c: CuboNaBorda, quadros: number, e = entrada, p = camera(e.bolaX, e.bolaZ, e.angulo)): void {
    for (let i = 0; i < quadros; i++) c.atualizar(1 / 60, e, p);
  }

  it('aparece no lugar escolhido quando as mãos entram, e some quando saem', () => {
    const c = new CuboNaBorda(CFG, OBST, LADO);
    rodar(c, 1);
    expect(c.tem).toBe(true);
    expect(c.escala).toBeLessThan(1);
    rodar(c, 60);
    expect(c.escala).toBe(1);
    rodar(c, 60, { ...entrada, ativo: false });
    expect(c.escala).toBe(0);
  });

  it('fica parado enquanto aparece na tela, mesmo que a mira gire um pouco', () => {
    const c = new CuboNaBorda(CFG, OBST, LADO);
    rodar(c, 60);
    const antes = { x: c.x, z: c.z };
    rodar(c, 60, { ...entrada, angulo: 0.1 });
    expect(c.x).toBe(antes.x);
    expect(c.z).toBe(antes.z);
  });

  it('sai de vista com a mira girada: some, e reaparece em outro lugar, que aparece', () => {
    const c = new CuboNaBorda(CFG, OBST, LADO);
    rodar(c, 60);
    const antes = { x: c.x, z: c.z };
    const girada = { ...entrada, angulo: Math.PI / 2 };
    const p = camera(girada.bolaX, girada.bolaZ, girada.angulo);
    for (let i = 0; i < 240; i++) c.atualizar(1 / 60, girada, p);
    expect(c.tem).toBe(true);
    expect(c.escala).toBe(1);
    expect(Math.hypot(c.x - antes.x, c.z - antes.z)).toBeGreaterThan(0.1);
    expect(cuboAparece(c.x, c.y, c.z, p, CFG)).toBe(true);
  });

  it('com o gesto em curso (livre falso) o cubo não muda de lugar nem de escala', () => {
    const c = new CuboNaBorda(CFG, OBST, LADO);
    rodar(c, 60);
    const antes = { x: c.x, z: c.z, escala: c.escala };
    const girada = { ...entrada, angulo: Math.PI, livre: false };
    rodar(c, 120, girada);
    expect(c.x).toBe(antes.x);
    expect(c.z).toBe(antes.z);
    expect(c.escala).toBe(antes.escala);
  });

  it('reiniciar esquece o lugar', () => {
    const c = new CuboNaBorda(CFG, OBST, LADO);
    rodar(c, 60);
    c.reiniciar();
    expect(c.tem).toBe(false);
    expect(c.escala).toBe(0);
  });
});
