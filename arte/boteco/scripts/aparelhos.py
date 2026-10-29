"""Aparelhos e adereços grandes do boteco (P6): geladeira, cervejeira, freezer, TV de tubo, estufa de salgados, filtro de barro, porta de aço e engradados.
Modelados com raio nas arestas (caixas arredondadas, lajes filetadas, tubos afunilados, superfícies paramétricas) no lugar das caixas do P5. Roda dentro e fora do
Blender, como `cena.py`: cada função recebe a `Cena` (`c`); `c.lod` (0 baixo, 1 médio, 2 alto) decide o que entra.
"""
import math
import random
import zlib

import numpy as np

import geom
from const import PISO, TOPO_BALCAO, X0, X1, Z0, Z1, sg
from garrafas import garrafa_de_engradado
from geom import I4, caixa, caixa_chanfrada, caixa_redonda, cilindro, laje, lathe, mat, orientada, perfil_suave, quad, tubo


def _bola(m, r, p, seg=8):
    lathe(m, mat(p), [(0, -r), (r * 0.72, -r * 0.7), (r, 0), (r * 0.72, r * 0.7), (0, r)], seg)


def _alca_x(c, m, x, y0, y1, z, saida=0.034, r=0.0135):
    """Puxador vertical de uma porta que olha para +x: barra de tubo com dois suportes de espelho circular."""
    seg = sg(c, 4, 6, 8)
    for yy in (y0 + 0.035, y1 - 0.035):
        tubo(m, I4, [(x, yy, z), (x + saida, yy, z)], r * 0.7, seg)
        cilindro(m, mat((x, yy, z), rz=-90), r * 1.55, 0.006, seg)
    tubo(m, I4, [(x + saida, y0, z), (x + saida, y1, z)], r, seg)


# ------------------------------------------------------------------ geladeira de casa
def geladeira(c):
    """A geladeira branca de casa (parede -x): corpo de arestas arredondadas, rodapé escuro, porta levemente abaulada com os adesivos, puxadores e dobradiças."""
    L = c.lod
    cx, cz = X0 + 0.38, 1.55
    W, P = 0.76, 0.84
    with c.objeto("geladeira"):
        g = c.m("geladeira")
        porta = c.m("sinal:geladeira-porta")
        if L == 0:
            caixa(g, mat((cx, PISO + 0.975, cz)), (W, 1.95, P), esc=1.0)
            px = cx + W / 2 + 0.004
            quad(porta, I4, (px, PISO + 0.04, cz + 0.42), (px, PISO + 0.04, cz - 0.42), (px, PISO + 1.93, cz - 0.42), (px, PISO + 1.93, cz + 0.42), (0, 0), (1, 0), (1, 1), (0, 1))
            return
        r = 0.032
        yb, yt = PISO + 0.045, PISO + 1.95
        caixa_redonda(g, mat((cx, (yb + yt) / 2, cz)), (W, yt - yb, P), r, k=sg(c, 2, 2, 3), esc=1.0)
        caixa(c.m("ferro"), mat((cx + 0.02, PISO + 0.0225, cz)), (W - 0.06, 0.045, P - 0.08), esc=1.0)
        px = cx + W / 2
        za, zb = cz + P / 2 - r - 0.004, cz - P / 2 + r + 0.004
        ya, yc = yb + r + 0.004, yt - r - 0.004

        def fn(u, v):
            bomba = 0.005 * (1 - (2 * u - 1) ** 2) * (1 - (2 * v - 1) ** 2)
            return (px + 0.0015 + bomba, ya + (yc - ya) * v, za + (zb - za) * u)

        orientada(porta, I4, fn, sg(c, 2, 3, 6), sg(c, 3, 6, 12), (cx, (yb + yt) / 2, cz), True, decalque=True)
        cr = c.m("cromado")
        _alca_x(c, cr, px + 0.006, PISO + 1.46, PISO + 1.78, cz + 0.265)
        if L == 2:
            _alca_x(c, cr, px + 0.006, PISO + 0.76, PISO + 1.08, cz + 0.265)
            for yy in (0.4, 1.1, 1.78):   # dobradiças do lado oposto ao puxador
                cilindro(cr, mat((px - 0.004, PISO + yy - 0.04, cz - 0.395)), 0.011, 0.08, 8)
            caixa_redonda(c.m("inox"), mat((px + 0.003, PISO + 1.9, cz - 0.1)), (0.007, 0.034, 0.13), 0.003, k=2)   # plaqueta da marca


# ------------------------------------------------------------------ cervejeira de porta de vidro
def cervejeira(c):
    """Cervejeira vertical de porta de vidro, junto à parede da janela (z+): corpo arredondado, moldura de ferro, luminoso vermelho, puxador e grade do rodapé."""
    L = c.lod
    x, zp = 2.5, Z1 - 0.37
    fz = zp - 0.36 - 0.004
    with c.objeto("cervejeira"):
        g = c.m("geladeira")
        vit = c.m("vitrine")
        if L == 0:
            caixa(g, mat((x, PISO + 1.0, zp)), (0.78, 2.0, 0.72), esc=1.0)
            quad(vit, I4, (x - 0.31, PISO + 0.14, fz), (x + 0.31, PISO + 0.14, fz), (x + 0.31, PISO + 1.78, fz), (x - 0.31, PISO + 1.78, fz), (1, 0), (0, 0), (0, 1), (1, 1))
            return
        caixa_redonda(g, mat((x, PISO + 1.02, zp)), (0.78, 1.96, 0.72), 0.03, k=sg(c, 2, 2, 3), esc=1.0)
        quad(vit, I4, (x - 0.31, PISO + 0.14, fz), (x + 0.31, PISO + 0.14, fz), (x + 0.31, PISO + 1.78, fz), (x - 0.31, PISO + 1.78, fz), (1, 0), (0, 0), (0, 1), (1, 1))
        fe = c.m("ferro")
        fzm = fz - 0.012
        for sx in (-1, 1):
            caixa_redonda(fe, mat((x + sx * 0.335, PISO + 0.96, fzm)), (0.05, 1.74, 0.026), 0.009, k=2)
        caixa_redonda(fe, mat((x, PISO + 1.81, fzm)), (0.72, 0.05, 0.026), 0.009, k=2)
        caixa_redonda(fe, mat((x, PISO + 0.11, fzm)), (0.72, 0.09, 0.026), 0.009, k=2)
        caixa_redonda(c.m("plastico-vermelho"), mat((x, PISO + 1.91, fz - 0.004)), (0.72, 0.17, 0.03), 0.012, k=sg(c, 2, 2, 3), esc=1.0)
        cr = c.m("cromado")
        for yy in (0.4, 1.4):
            tubo(cr, I4, [(x - 0.31, PISO + yy, fzm - 0.013), (x - 0.31, PISO + yy, fzm - 0.04)], 0.008, 6)
        tubo(cr, I4, [(x - 0.31, PISO + 0.4, fzm - 0.04), (x - 0.31, PISO + 1.4, fzm - 0.04)], 0.012, sg(c, 4, 6, 8))
        if L == 2:
            ix = c.m("inox")
            for k in range(5):   # grade do rodapé
                caixa(ix, mat((x, PISO + 0.05 + 0.015 * k, fzm - 0.014)), (0.5, 0.006, 0.006))
            for sx in (-1, 1):
                cilindro(c.m("borracha"), mat((x + sx * 0.33, PISO, zp + 0.28)), 0.022, 0.04, 8)
                cilindro(c.m("borracha"), mat((x + sx * 0.33, PISO, zp - 0.28)), 0.022, 0.04, 8)


# ------------------------------------------------------------------ freezer horizontal
def freezer(c):
    """Freezer horizontal de sorvete (parede +x): corpo arredondado sobre rodízios, tampa de borda filetada com a vedação, puxador de tubo e o painel aceso."""
    L = c.lod
    cx, cz = X1 - 0.38, 0.95
    with c.objeto("freezer"):
        g = c.m("geladeira")
        if L == 0:
            caixa(g, mat((cx, PISO + 0.42, cz)), (0.7, 0.84, 1.5), esc=1.0)
            return
        caixa_redonda(g, mat((cx, PISO + 0.4175, cz)), (0.7, 0.745, 1.5), 0.03, k=sg(c, 2, 2, 3), esc=1.0)
        laje(g, mat((cx, PISO + 0.825, cz)), 0.71, 1.52, 0.05, rc=0.04, rb=0.012, n_c=sg(c, 2, 2, 3), n_b=sg(c, 1, 2, 2))
        fe = c.m("ferro")
        caixa(fe, mat((cx, PISO + 0.793, cz)), (0.69, 0.012, 1.49), esc=1.0)
        xf = cx - 0.352
        caixa_redonda(fe, mat((xf, PISO + 0.42, cz)), (0.012, 0.19, 0.98), 0.004, k=2)
        caixa(c.m("luz-estufa"), mat((xf - 0.004, PISO + 0.42, cz)), (0.004, 0.15, 0.9), esc=1.0)
        cr = c.m("cromado")
        xh = cx - 0.385
        for dz in (-0.34, 0.34):
            tubo(cr, I4, [(cx - 0.355, PISO + 0.84, cz + dz), (xh, PISO + 0.84, cz + dz)], 0.009, sg(c, 4, 6, 8))
        tubo(cr, I4, [(xh, PISO + 0.84, cz - 0.34), (xh, PISO + 0.84, cz + 0.34)], 0.0125, sg(c, 4, 6, 8))
        if L == 2:
            for sx in (-1, 1):
                for sz in (-1, 1):
                    cilindro(fe, mat((cx + sx * 0.27, PISO, cz + sz * 0.62)), 0.032, 0.045, 10)
            cilindro(cr, mat((cx - 0.352, PISO + 0.76, cz - 0.55), rz=90), 0.014, 0.012, 10)   # fechadura
            for dz in (-0.55, 0.55):   # dobradiças atrás
                caixa(fe, mat((cx + 0.352, PISO + 0.8, cz + dz)), (0.012, 0.045, 0.08))


# ------------------------------------------------------------------ TV de tubo
def tv(c):
    """TV de tubo (20") num suporte de ferro no canto -x/-z: moldura com o aro da tela, carcaça traseira afunilada, botões, alto-falante e antena de orelhas."""
    L = c.lod
    x, z, y = -4.2, Z0 + 0.3, 1.78
    with c.objeto("tv"):
        pt = c.m("plastico-preto")
        fr = z + 0.26 + 0.002
        if L == 0:
            caixa(pt, mat((x, y, z)), (0.5, 0.42, 0.52))
            quad(c.m("tv-tela"), I4, (x - 0.19, y - 0.14, fr), (x + 0.19, y - 0.14, fr), (x + 0.19, y + 0.16, fr), (x - 0.19, y + 0.16, fr), (0, 0), (1, 0), (1, 1), (0, 1))
            return
        caixa_redonda(pt, mat((x, y, z + 0.2)), (0.5, 0.42, 0.12), 0.03, k=sg(c, 2, 2, 3))
        a0, b0, a1, b1 = 0.215, 0.175, 0.12, 0.085

        def casco(u, v):
            t = 2 * math.pi * u
            ct, st = math.cos(t), math.sin(t)
            sx_, sy_ = math.copysign(abs(ct) ** 0.5, ct), math.copysign(abs(st) ** 0.5, st)   # supercírculo (expoente 4)
            a, b = a0 + (a1 - a0) * v ** 0.8, b0 + (b1 - b0) * v ** 0.8
            return (x + a * sx_, y - 0.015 * v + b * sy_, z + 0.15 - 0.4 * v)

        orientada(pt, I4, casco, sg(c, 12, 16, 28), sg(c, 2, 3, 6), (x, y, z), True)
        # tela abaulada
        nx, ny = sg(c, 6, 8, 14), sg(c, 4, 6, 10)
        P, N, UV, F = [], [], [], []
        for j in range(ny + 1):
            for i in range(nx + 1):
                u, v = i / nx, j / ny
                P.append((x + (u - 0.5) * 0.38, y + (v - 0.5) * 0.30 + 0.01, fr + 0.012 * (1 - ((u - 0.5) * 2) ** 2) * (1 - ((v - 0.5) * 2) ** 2)))
                N.append((0.0, 0.0, 1.0))
                UV.append((u, v))
        for j in range(ny):
            for i in range(nx):
                a_ = j * (nx + 1) + i
                F += [(a_, a_ + 1, a_ + 1 + nx + 1), (a_, a_ + 1 + nx + 1, a_ + nx + 1)]
        c.m("tv-tela").add(I4, P, N, UV, F)
        # aro da tela (lábio em volta do vidro)
        for sx in (-1, 1):
            caixa_redonda(pt, mat((x + sx * 0.2, y + 0.01, fr - 0.002)), (0.03, 0.32, 0.016), 0.006, k=2)
        for sy in (-1, 1):
            caixa_redonda(pt, mat((x, y + 0.01 + sy * 0.163, fr - 0.002)), (0.43, 0.026, 0.016), 0.006, k=2)
        # botões, plaqueta e alto-falante
        cr = c.m("cromado")
        for k, yy in enumerate((0.07, 0.01, -0.05)):
            lathe(cr, mat((x + 0.232, y + yy, fr - 0.004), rx=90), [(0, 0), (0.011, 0, "duro"), (0.011, 0.01), (0.008, 0.013), (0, 0.013)], sg(c, 6, 8, 12))
        caixa(c.m("plastico-branco"), mat((x + 0.2, y - 0.178, fr - 0.002)), (0.04, 0.03, 0.004))
        if L == 2:
            for k in range(7):
                caixa(c.m("ferro"), mat((x - 0.232, y + 0.09 - 0.026 * k, fr - 0.002)), (0.024, 0.008, 0.003))
        fe = c.m("ferro")
        caixa(fe, mat((x, y - 0.22, z - 0.05)), (0.36, 0.025, 0.46))
        caixa(fe, mat((x, y - 0.3, Z0 + 0.02)), (0.05, 0.22, 0.03))
        if L == 2:
            for sx in (-1, 1):
                tubo(fe, I4, [(x + sx * 0.15, y - 0.235, z + 0.12), (x + sx * 0.04, y - 0.36, Z0 + 0.03)], 0.007, 6)
            caixa(fe, mat((x, y - 0.205, z + 0.27)), (0.36, 0.03, 0.012))
            tubo(cr, I4, [(x - 0.03, y + 0.215, z - 0.05), (x - 0.2, y + 0.5, z - 0.1)], [0.0065, 0.004], 6)
            tubo(cr, I4, [(x + 0.03, y + 0.215, z - 0.05), (x + 0.2, y + 0.5, z - 0.12)], [0.0065, 0.004], 6)
            lathe(pt, mat((x, y + 0.2, z - 0.05)), [(0, 0), (0.045, 0.0, "duro"), (0.035, 0.018), (0.012, 0.028), (0, 0.03)], 12)
            _bola(cr, 0.007, (x - 0.2, y + 0.502, z - 0.1))
            _bola(cr, 0.007, (x + 0.2, y + 0.502, z - 0.12))
            # fio de força da TV: sai de baixo da carcaça, cai colado à parede, faz uma barriga e entra na caixa do suporte (P6b: antes eram dois trechos retos de 4 lados)
            fio = [(x - 0.2, y - 0.2, Z0 + 0.05), (x - 0.2, y - 0.23, Z0 + 0.042), (x - 0.199, y - 0.27, Z0 + 0.034), (x - 0.194, y - 0.305, Z0 + 0.031), (x - 0.17, y - 0.322, Z0 + 0.03),
                   (x - 0.12, y - 0.318, Z0 + 0.03), (x - 0.06, y - 0.3, Z0 + 0.03), (x - 0.02, y - 0.3, Z0 + 0.025)]
            tubo(fe, I4, geom.spline(fio, 3), 0.004, 6, tampas=False)


# ------------------------------------------------------------------ estufa de salgados
def estufa(c, x, z):
    """Estufa de salgados no balcão: base de inox arredondada, colunas cromadas, tampo com a lâmpada quente, vidro dos quatro lados, bandejas com borda e a portinhola."""
    L = c.lod
    ty = TOPO_BALCAO
    larg, alt, prof = 0.62, 0.44, 0.44
    with c.objeto("estufa"):
        ix = c.m("inox")
        if L == 0:
            caixa(ix, mat((x, ty + 0.03, z)), (prof, 0.06, larg), esc=1.0)
            caixa(ix, mat((x, ty + 0.06 + alt / 2, z)), (prof, alt, larg), esc=1.0)
        else:
            caixa_redonda(ix, mat((x, ty + 0.03, z)), (prof, 0.06, larg), 0.014, k=sg(c, 2, 2, 3), esc=1.0)
            laje(ix, mat((x, ty + 0.06 + alt + 0.015, z)), prof, larg, 0.03, rc=0.035, rb=0.01, n_c=sg(c, 2, 2, 3), n_b=sg(c, 1, 2, 2))
            cr = c.m("cromado")
            for sx in (-1, 1):
                for sz in (-1, 1):
                    cilindro(cr, mat((x + sx * (prof / 2 - 0.012), ty + 0.06, z + sz * (larg / 2 - 0.012))), 0.0095, alt, sg(c, 5, 8, 10))
            caixa(c.m("luz-estufa"), mat((x, ty + 0.06 + alt - 0.01, z)), (prof - 0.06, 0.012, larg - 0.08), esc=1.0)
            vg = c.m("vidro-estufa")
            y0_, y1_ = ty + 0.06, ty + 0.06 + alt
            quad(vg, I4, (x + prof / 2, y0_, z + larg / 2), (x + prof / 2, y0_, z - larg / 2), (x + prof / 2, y1_, z - larg / 2), (x + prof / 2, y1_, z + larg / 2), (0, 0), (1, 0), (1, 1), (0, 1))
            quad(vg, I4, (x - prof / 2, y0_, z - larg / 2), (x - prof / 2, y0_, z + larg / 2), (x - prof / 2, y1_, z + larg / 2), (x - prof / 2, y1_, z - larg / 2), (0, 0), (1, 0), (1, 1), (0, 1))
            quad(vg, I4, (x - prof / 2, y0_, z + larg / 2), (x + prof / 2, y0_, z + larg / 2), (x + prof / 2, y1_, z + larg / 2), (x - prof / 2, y1_, z + larg / 2), (0, 0), (1, 0), (1, 1), (0, 1))
            quad(vg, I4, (x + prof / 2, y0_, z - larg / 2), (x - prof / 2, y0_, z - larg / 2), (x - prof / 2, y1_, z - larg / 2), (x + prof / 2, y1_, z - larg / 2), (0, 0), (1, 0), (1, 1), (0, 1))
            if L == 2:
                for y in (0.22, 0.4):
                    laje(ix, mat((x, ty + y, z)), prof - 0.04, larg - 0.04, 0.012, rc=0.02, rb=0.004, n_c=2, n_b=1)
                    for sx in (-1, 1):
                        caixa(ix, mat((x + sx * (prof / 2 - 0.03), ty + y + 0.011, z)), (0.006, 0.014, larg - 0.06))
                xp = x + prof / 2 + 0.012   # portinhola de correr: puxador de tubo
                for dz in (-0.1, 0.1):
                    tubo(cr, I4, [(x + prof / 2, ty + 0.3, z + dz), (xp, ty + 0.3, z + dz)], 0.0035, 5)
                tubo(cr, I4, [(xp, ty + 0.26, z - 0.1), (xp, ty + 0.34, z - 0.1), (xp, ty + 0.34, z + 0.1), (xp, ty + 0.26, z + 0.1)], 0.0045, 5)
                for sx in (-1, 1):
                    for sz in (-1, 1):
                        cilindro(c.m("borracha"), mat((x + sx * 0.17, ty, z + sz * 0.26)), 0.017, 0.004, 8)
    if L >= 1:
        with c.objeto("salgados"):
            sa = c.m("salgado")
            rr = c.rng
            for andar, y in enumerate((0.07, 0.23, 0.41) if L == 2 else (0.07, 0.24)):
                n = 6 if L == 2 else 4
                for i in range(n):
                    zz = z - larg / 2 + 0.07 + i * (larg - 0.14) / max(n - 1, 1)
                    for lado in (-1, 1) if L == 2 else (0,):
                        xx = x + lado * 0.1
                        if (i + andar) % 2 == 0:   # coxinha: gota
                            lathe(sa, mat((xx, ty + y, zz), rz=0), perfil_suave([(0, 0), (0.026, 0.008, "duro"), (0.032, 0.03), (0.022, 0.065), (0.008, 0.085), (0, 0.088)], 2), sg(c, 5, 6, 10))
                        else:                      # pastel: meia-lua achatada
                            caixa_redonda(sa, mat((xx, ty + y + 0.012, zz), yaw=rr.uniform(-20, 20)), (0.05, 0.024, 0.085), 0.011, k=2) if L == 2 else caixa(sa, mat((xx, ty + y + 0.012, zz)), (0.05, 0.024, 0.08))


# ------------------------------------------------------------------ filtro de barro
def filtro_de_barro(c, x, z):
    """O filtro de barro: duas câmaras de cerâmica de perfil suave sobre um suporte de madeira, tampa com botão, torneira com alavanca e a bacia de pingos."""
    L = c.lod
    ty = TOPO_BALCAO
    seg = sg(c, 6, 10, 18)
    with c.objeto("filtro-de-barro"):
        ce = c.m("ceramica")
        mc = c.m("madeira-clara")
        if L == 0:
            caixa(mc, mat((x, ty + 0.02, z)), (0.2, 0.04, 0.2), esc=1.0)
        else:
            laje(mc, mat((x, ty + 0.02, z)), 0.22, 0.22, 0.04, rc=0.02, rb=0.007, n_c=sg(c, 1, 2, 3), n_b=1)
            if L == 2:
                for sx in (-1, 1):
                    for sz in (-1, 1):
                        cilindro(c.m("borracha"), mat((x + sx * 0.085, ty, z + sz * 0.085)), 0.012, 0.004, 8)
        perfil = [(0, 0), (0.07, 0, "duro"), (0.095, 0.03), (0.105, 0.1), (0.095, 0.17), (0.075, 0.195, "duro"), (0.1, 0.205, "duro"), (0.115, 0.23), (0.125, 0.3), (0.115, 0.37),
                  (0.075, 0.405, "duro"), (0.062, 0.415), (0.072, 0.425), (0.03, 0.435), (0.0, 0.44)]
        lathe(ce, mat((x, ty + 0.04, z)), perfil_suave(perfil, sg(c, 1, 2, 4)) if L >= 1 else perfil, seg)
        if L >= 1:
            cr = c.m("cromado")
            tubo(cr, I4, [(x + 0.092, ty + 0.1, z), (x + 0.15, ty + 0.1, z), (x + 0.16, ty + 0.09, z), (x + 0.162, ty + 0.062, z)], [0.0085, 0.0085, 0.0075, 0.0065], 8)
            lathe(cr, mat((x + 0.092, ty + 0.1, z), rz=-90), [(0, 0), (0.017, 0.0, "duro"), (0.017, 0.016), (0.0, 0.018)], 10)
            tubo(cr, I4, [(x + 0.135, ty + 0.108, z), (x + 0.135, ty + 0.14, z + 0.0)], 0.0045, 5)
            _bola(cr, 0.009, (x + 0.135, ty + 0.145, z), 8)
        if L == 2:
            lathe(c.m("plastico-vermelho"), mat((x + 0.17, ty + 0.04, z)), perfil_suave([(0, 0), (0.033, 0, "duro"), (0.036, 0.09), (0.0, 0.09)], 3), 14)
            lathe(c.m("inox"), mat((x + 0.17, ty + 0.128, z)), [(0.034, 0.0), (0.034, 0.004), (0.0, 0.006)], 10)


# ------------------------------------------------------------------ porta de aço de enrolar
def porta_de_aco(c):
    """Porta de aço de enrolar fechada na parede +x: lâminas de seção abaulada (um remendo só, com o vale entre elas), guias, caixa do rolo, barra de baixo com puxadores e o cadeado."""
    L = c.lod
    zc, w, h = -1.2, 1.9, 2.25
    x = X1 - 0.03
    y0 = PISO
    with c.objeto("porta-de-aco"):
        ac = c.m("aco")
        fe = c.m("ferro")
        if L == 0:
            quad(ac, I4, (x, y0, zc - w / 2), (x, y0, zc + w / 2), (x, y0 + h, zc + w / 2), (x, y0 + h, zc - w / 2), (0, 0), (w, 0), (w, h), (0, h))
            return
        n = 36
        k = sg(c, 0, 3, 7)
        amp = 0.011

        def lamina(u, v):
            s = min(v * n, n - 1e-9)
            f = s - math.floor(s)
            return (x - amp * math.sin(math.pi * f) ** 0.55, y0 + 0.08 + (h - 0.08) * v, zc - w / 2 + 0.03 + (w - 0.06) * u)

        orientada(ac, I4, lamina, 1, n * k, (x + 1.0, y0 + h / 2, zc), True, uv_esc=(w - 0.06, h - 0.08))
        for s in (-1, 1):
            caixa_chanfrada(fe, mat((x - 0.025, y0 + h / 2, zc + s * (w / 2 + 0.03))), (0.08, h, 0.06), 0.008, esc=1.0)
        caixa_redonda(fe, mat((x - 0.1, y0 + h + 0.12, zc)), (0.24, 0.26, w + 0.14), 0.02, k=sg(c, 2, 2, 3), esc=1.0)
        caixa_chanfrada(fe, mat((x - 0.022, y0 + 0.035, zc)), (0.05, 0.07, w - 0.02), 0.006, esc=1.0)
        if L == 2:
            ix = c.m("inox")
            for s in (-1, 1):   # puxadores de embutir da barra de baixo
                laje(ix, mat((x - 0.049, y0 + 0.035, zc + s * 0.62), rz=90), 0.07, 0.14, 0.012, rc=0.02, rb=0.004, n_c=2, n_b=1)
            cr = c.m("cromado")
            cilindro(cr, mat((x - 0.05, y0 + 0.035, zc + 0.0), rz=90), 0.018, 0.008, 12)   # fechadura central
            caixa(c.m("ferro"), mat((x - 0.058, y0 + 0.035, zc)), (0.004, 0.014, 0.004))
            # cadeado pendurado numa argola
            tubo(cr, I4, [(x - 0.05, y0 + 0.07, zc - 0.28), (x - 0.075, y0 + 0.07, zc - 0.28), (x - 0.075, y0 + 0.045, zc - 0.28), (x - 0.05, y0 + 0.045, zc - 0.28)], 0.0035, 6, fechado=False)
            caixa_redonda(c.m("tampa"), mat((x - 0.08, y0 + 0.012, zc - 0.28), yaw=90), (0.028, 0.034, 0.05), 0.007, k=2)
            tubo(cr, I4, [(x - 0.07, y0 + 0.029, zc - 0.28), (x - 0.07, y0 + 0.042, zc - 0.28)], 0.0028, 4)
            for yy in (0.62, 1.24, 1.86):   # parafusos nas guias
                for s in (-1, 1):
                    cilindro(cr, mat((x - 0.06, y0 + yy, zc + s * (w / 2 + 0.03)), rz=90), 0.008, 0.004, 6)


# ------------------------------------------------------------------ engradados de cerveja
ENG_PAREDE = 0.23   # altura das paredes do engradado (m); a garrafa de 600 ml passa do aro
ENG_PASSO = 0.287   # passo da pilha: os quatro pilares sobem até a base do engradado de cima, por cima do gargalo e da tampinha da garrafa de baixo
ENG_FUNDO = 0.019   # o topo do fundo; com as réguas do fundo (só no alto), 0,031


def _engradado(c, m, T, lod, topo, rng):
    """Um engradado de plástico (0,40 x 0,50; a base em y = 0): quatro pilares de empilhar (ENG_PASSO), aro de cima a 0,23 m, três réguas nas laterais, as pontas com o vão da
    pegada, o fundo vazado, a grade interna que separa as 12 garrafas (3 x 4) e as garrafas inteiras de 600 ml. `topo` = o de cima da pilha (no alto, as garrafas dele
    têm o pescoço de vidro e o rótulo)."""
    def b(p, tam, ch=True):
        if lod == 2 and ch:
            caixa_chanfrada(m, T @ mat(p), tam, 0.005, esc=1.0)
        else:
            caixa(m, T @ mat(p), tam, esc=1.0)

    for sx in (-1, 1):
        for sz in (-1, 1):
            b((sx * 0.1775, ENG_PASSO / 2, sz * 0.2275), (0.045, ENG_PASSO, 0.045))
    b((0, 0.01, 0), (0.37, 0.018, 0.47))                        # fundo
    if lod == 2:
        for i in range(-2, 3):
            b((i * 0.075, 0.025, 0), (0.014, 0.012, 0.44))
    for sx in (-1, 1):                                          # laterais compridas: base, régua do meio, régua de cima e o aro
        b((sx * 0.19, 0.043, 0), (0.02, 0.05, 0.42), False)
        b((sx * 0.19, 0.108, 0), (0.02, 0.02, 0.42), False)
        b((sx * 0.19, 0.171, 0), (0.02, 0.042, 0.42), False)
        b((sx * 0.19, 0.218, 0), (0.03, 0.024, 0.5))
    for sz in (-1, 1):                                          # pontas com a pegada
        b((0, 0.048, sz * 0.24), (0.34, 0.06, 0.02), False)
        b((0, 0.178, sz * 0.24), (0.34, 0.056, 0.02), False)
        b((0, 0.218, sz * 0.25), (0.4, 0.024, 0.03))
    altura = 0.115                                              # a grade interna: duas placas no comprimento e três na largura, do fundo até 2/3 da garrafa
    for sx in (-1, 1):
        caixa(m, T @ mat((sx * 0.06, ENG_FUNDO + altura / 2, 0)), (0.004, altura, 0.456), esc=1.0)
    for z in (-0.12, 0.0, 0.12):
        caixa(m, T @ mat((0, ENG_FUNDO + altura / 2, z)), (0.356, altura, 0.004), esc=1.0)
    base = ENG_FUNDO + (0.012 if lod == 2 else 0.0)             # a garrafa pousa nas réguas do fundo (alto) ou no próprio fundo
    for i in (-1, 0, 1):
        for j in range(4):
            x, z = i * 0.12, -0.18 + j * 0.12
            yaw = 180 + rng.uniform(-30, 30) if (topo and lod == 2) else rng.uniform(0, 360)
            garrafa_de_engradado(c, T, x, base, z, yaw, perto=topo and lod == 2, seg=5 if lod == 1 else (7 if topo else 6))


def engradados(c):
    L = c.lod
    if L == 0:
        with c.objeto("engradados"):
            for k, (x, z, y) in enumerate(((4.62, 2.3, 0), (4.62, 2.82, 0), (4.62, 2.56, 0.3))):
                caixa(c.m("plastico-vermelho"), mat((x, PISO + y + 0.15, z)), (0.4, 0.3, 0.5), esc=1.0)
        return
    rng = random.Random(zlib.crc32(b"engradados"))
    with c.objeto("engradados"):
        vm = c.m("plastico-vermelho")
        pilhas = [(4.58, 2.4, 3, 0), (4.58, 2.92, 4, 8), (4.15, 2.92, 2, -6), (4.15, 2.4, 1, 4)] if L == 2 else [(4.58, 2.4, 3, 0), (4.58, 2.92, 3, 6)]
        for px, pz, n, jog in pilhas:
            for k in range(n):
                T = mat((px + 0.004 * ((k * 7) % 3 - 1), PISO + k * ENG_PASSO, pz), yaw=jog + (k % 2) * 2)
                _engradado(c, vm, T, L, k == n - 1, rng)
