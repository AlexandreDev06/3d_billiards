"""Mesinhas e cadeiras de plástico, banquetas de vinil (P6): modelagem com chanfro e espessura de verdade (lajes de borda filetada, tubos afunilados, encosto curvo
com o logo inventado), no lugar das caixas do P5. Roda dentro e fora do Blender, como `cena.py`.

Convenção da cadeira: origem no chão, frente = +x local, largura em z, cima em y.
"""
import math

import numpy as np

import geom
from const import PISO, sg
from geom import I4, cilindro, laje, lathe, mat, orientada, tubo

R_ENCOSTO = 1.0           # raio da curva do encosto (m): a borda avança ~2 cm
INCLINA_ENCOSTO = 104.0   # graus: o encosto inclina ~14 graus para trás
ENC_W, ENC_D, ENC_H = 0.30, 0.42, 0.022   # altura, largura e espessura do encosto


def _curva_encosto(P):
    """Entorta a laje do encosto (local: x = altura, y = espessura, +y = lado de trás, z = largura): a borda avança para a frente (-y)."""
    P = np.array(P)
    P[:, 1] -= P[:, 2] ** 2 / (2 * R_ENCOSTO)
    return P


def _cacarola(P, fundo=0.012, w=0.22, d=0.23):
    """Assento fundo: o miolo cede alguns milímetros."""
    P = np.array(P)
    P[:, 1] -= fundo * np.clip(1 - (P[:, 0] / w) ** 2, 0, 1) * np.clip(1 - (P[:, 2] / d) ** 2, 0, 1)
    return P


def _logo(c, Tb, mat_logo, lado):
    """Remendo do logo sobre o encosto, acompanhando a curva: `lado` -1 = frente (quem senta vê), +1 = costas."""
    esp = ENC_H / 2 + 0.0016   # acima da corda entre os anéis da laje (a curva do encosto tem flecha de ~1 mm entre os vértices)
    larg, alt, dx = 0.27, 0.12, 0.012

    def fn(u, v):
        z = (u - 0.5) * larg * (-lado)    # u cresce para a direita de quem olha
        x = dx + (v - 0.5) * alt
        return (x, lado * esp - z * z / (2 * R_ENCOSTO), z)

    orientada(c.m(mat_logo), Tb, fn, sg(c, 4, 8, 14), sg(c, 2, 4, 6), (0.0, 0.0, 0.0), True, decalque=True)


def cadeira(c, x, z, yaw, i, cor="plastico-branco", logo="sinal:logo-cadeira-a"):
    """Cadeira de plástico com braços (monobloco de boteco): assento fundo de borda filetada, encosto curvo com o logo, braços e pernas de tubo afunilado, pés de borracha."""
    L = c.lod
    with c.objeto(f"cadeira#{i}"):
        m = c.m(cor)
        Tc = mat((x, PISO, z), yaw=yaw)
        if L == 0:
            geom.caixa(m, Tc @ mat((0, 0.43, 0)), (0.44, 0.04, 0.44))
            geom.caixa(m, Tc @ mat((-0.21, 0.68, 0)), (0.03, 0.5, 0.42))
            return
        n_c, n_b = sg(c, 2, 3, 5), sg(c, 1, 2, 3)
        laje(m, Tc @ mat((0, 0.43, 0)), 0.44, 0.46, 0.03, rc=0.075, rb=0.011, n_c=n_c, n_b=n_b, interior=sg(c, 0, 1, 2), ns=sg(c, 0, 2, 4), deformar=_cacarola)
        Tb = Tc @ mat((-0.235, 0.70, 0), rz=INCLINA_ENCOSTO)
        laje(m, Tb, ENC_W, ENC_D, ENC_H, rc=0.06, rb=0.009, n_c=n_c, n_b=n_b, interior=sg(c, 0, 1, 2), ns=sg(c, 0, 4, 8), deformar=_curva_encosto)
        seg = sg(c, 5, 6, 8)
        # pernas de trás sobem pelos lados do encosto (um tubo contínuo do chão ao topo)
        for s in (-1, 1):
            z_ = 0.215 * s
            tras = [(-0.236, 0.0, 0.205 * s), (-0.218, 0.2, 0.208 * s), (-0.19, 0.43, z_), (-0.178, 0.56, z_), (-0.214, 0.705, z_), (-0.25, 0.85, z_)]
            pts = geom.spline(tras, sg(c, 2, 2, 3))
            raios = list(np.interp(np.linspace(0, 1, len(pts)), [0, 0.45, 1], [0.0125, 0.016, 0.013]))
            tubo(m, Tc, pts, raios, seg, tampas=True)
            braco = [(-0.193, 0.62, z_), (-0.1, 0.655, 0.225 * s), (0.05, 0.665, 0.228 * s), (0.16, 0.645, 0.224 * s), (0.205, 0.6, 0.218 * s), (0.215, 0.5, 0.215 * s),
                     (0.222, 0.43, 0.212 * s), (0.228, 0.2, 0.208 * s), (0.234, 0.0, 0.205 * s)]
            pts = geom.spline(braco, sg(c, 2, 2, 3))
            raios = list(np.interp(np.linspace(0, 1, len(pts)), [0, 0.5, 1], [0.0165, 0.0165, 0.0125]))
            tubo(m, Tc, pts, raios, seg, tampas=True)
            cilindro(c.m("borracha"), Tc @ mat((0.234, 0.0, 0.205 * s)), 0.0155, 0.012, sg(c, 5, 6, 10), esc=1.0)
            cilindro(c.m("borracha"), Tc @ mat((-0.236, 0.0, 0.205 * s)), 0.0145, 0.012, sg(c, 5, 6, 10), esc=1.0)
        if L == 2:   # aro de reforço por baixo do assento e travessa entre as pernas de trás
            aro = [(px, 0.405, pz) for px, pz in geom.aneis_retangulo(0.36, 0.38, 0.06, 3)]
            tubo(m, Tc, aro, 0.0085, 6, fechado=True)
            tubo(m, Tc, [(-0.232, 0.2, -0.207), (-0.232, 0.2, 0.207)], 0.0085, 6)
        # logo nos dois lados do encosto
        _logo(c, Tb, logo, -1)
        _logo(c, Tb, logo, +1)


def mesinha(c, x, z, i):
    """Mesa quadrada de plástico (boteco): tampo de borda filetada com friso, o logo no meio, saia e quatro pernas afuniladas com ponteira de borracha."""
    L = c.lod
    with c.objeto(f"mesinha#{i}"):
        m = c.m("plastico-branco")
        if L == 0:
            geom.caixa(m, mat((x, PISO + 0.36, z)), (0.75, 0.72, 0.75))
            return
        topo = PISO + 0.7
        laje(m, mat((x, topo, z)), 0.75, 0.75, 0.036, rc=0.06, rb=0.013, n_c=sg(c, 2, 3, 5), n_b=sg(c, 1, 2, 3))
        yl = topo + 0.018 + 0.0008
        geom.quad(c.m("sinal:logo-mesa"), I4, (x - 0.22, yl, z + 0.22), (x + 0.22, yl, z + 0.22), (x + 0.22, yl, z - 0.22), (x - 0.22, yl, z - 0.22), (0, 0), (1, 0), (1, 1), (0, 1))
        seg = sg(c, 5, 8, 10)
        saia = [(x + px, topo - 0.05, z + pz) for px, pz in geom.aneis_retangulo(0.56, 0.56, 0.05, sg(c, 2, 2, 4))]
        tubo(m, I4, saia, sg(c, 0.016, 0.017, 0.019), sg(c, 4, 6, 8), fechado=True)
        for sx in (-1, 1):
            for sz in (-1, 1):
                perna = [(x + sx * 0.285, topo - 0.03, z + sz * 0.285), (x + sx * 0.3, topo - 0.35, z + sz * 0.3), (x + sx * 0.318, PISO + 0.012, z + sz * 0.318)]
                pts = geom.spline(perna, 3) if L == 2 else perna
                raios = list(np.interp(np.linspace(0, 1, len(pts)), [0, 1], [0.026, 0.0165]))
                tubo(m, I4, pts, raios, seg, tampas=True)
                cilindro(c.m("borracha"), mat((x + sx * 0.318, PISO, z + sz * 0.318)), 0.0185, 0.012, sg(c, 5, 6, 10), esc=1.0)


def banqueta(c, x, z, i):
    """Banqueta de bar: almofada de vinil (borda arredondada, pesponto), disco cromado, quatro pernas abertas e o aro de apoio dos pés."""
    L = c.lod
    h = 0.74
    y0 = PISO
    with c.objeto(f"banqueta#{i}"):
        vm = c.m("vinil")
        cr = c.m("cromado")
        if L == 0:
            cilindro(vm, mat((x, y0, z)), 0.17, h, 6, r_topo=0.19)
            return
        laje(vm, mat((x, y0 + h - 0.04, z)), 0.38, 0.38, 0.075, rc=0.19, rb=0.03, n_c=sg(c, 3, 4, 6), n_b=sg(c, 2, 2, 3))
        lathe(cr, mat((x, y0 + h - 0.083, z)), [(0, 0.0), (0.165, 0.0, "duro"), (0.17, 0.006), (0.16, 0.012), (0, 0.012)], sg(c, 8, 12, 20))
        seg = sg(c, 4, 6, 8)
        for k in range(4):
            a = math.radians(45 + 90 * k)
            top = (x + 0.115 * math.cos(a), y0 + h - 0.083, z + 0.115 * math.sin(a))
            bot = (x + 0.215 * math.cos(a), y0 + 0.01, z + 0.215 * math.sin(a))
            tubo(cr, I4, [top, bot], 0.0145, seg, tampas=(L == 2))
            cilindro(c.m("borracha"), mat((bot[0], y0, bot[2])), 0.018, 0.012, sg(c, 4, 6, 8), esc=1.0)
        tubo(cr, I4, geom.anel(x, y0 + 0.28, z, 0.175, sg(c, 10, 14, 24)), 0.0115, sg(c, 4, 5, 6), fechado=True)
