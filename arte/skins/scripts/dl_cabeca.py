"""Dragon Lore: a cabeça, de perfil, no alto do antebraço, com o focinho voltado para a ponta do taco e a chama saindo da boca.

Vermelho-alaranjada, chifres e dentes claros, bigodes de ouro, o olho que acende. Desenhada no sistema da cabeça: u anda do occipício ao
focinho (rumo à ponta do taco, `-s`), v vai do queixo ao topo do crânio (`+x`). `Cabeca.p(u, v)` leva ao papel.
"""
import math

import cor as C
import desenho as D
import gravura as G


def rot(pts, ang, c=(0.0, 0.0)):
    return D.girar(pts, ang, c[0], c[1])


class Cabeca:
    def __init__(self, cx, x0=-2.0, s0=838.0, k=0.95):
        self.cx, self.x0, self.s0, self.k = cx, x0, s0, k
        self.pa, self.pal = cx.pa, cx.pal
        self.ang = -0.30            # abertura da maxila inferior
        self.dobra = (20.0, -3.3)   # a dobradiça dela

    def p(self, u, v):
        return (self.x0 + v * self.k, self.s0 - u * self.k)

    def ps(self, lista):
        return [self.p(u, v) for (u, v) in lista]

    def boca(self):
        """Onde a chama nasce (papel)."""
        u, v = rot([(88.0, -5.2)], self.ang * 0.55, self.dobra)[0]
        return self.p(u, v)

    def vol(self, pts, escuro, medio, claro, contorno=0.45, borda=2.4, suave=True, n=5, **kw):
        loc = D.suave(pts, True, n) if suave else pts
        return G.forma(self.pa, self.ps(loc), escuro, medio, claro, self.pal["tinta"], contorno=contorno * self.k, borda=borda * self.k, **kw)

    # ---- peças -----------------------------------------------------------------------------------------------------------------------
    def chifre(self, base, c1, c2, ponta, larg):
        pa, pal = self.pa, self.pal
        eixo = D.bezier(base, c1, c2, ponta, 26)
        ws = [larg * (1.0 - (i / 26.0) ** 1.05) + 0.2 for i in range(27)]
        poly = self.ps(D.fita(eixo, ws))
        pa.contorno(poly, pal["tinta"], 0.38)
        cor_ = G.degrade_lin(self.p(*base), self.p(*ponta), [(0.0, pal["marfim_sombra"]), (0.5, pal["marfim"]), (1.0, C.claro(pal["marfim"], 0.5))])
        pa.poli(poly, cor_, malha=1.0)
        for k in range(1, 9):
            j = int(26 * (0.06 + 0.095 * k))
            if j >= 25:
                continue
            a, b = eixo[j], eixo[j + 1]
            dx, dy = b[0] - a[0], b[1] - a[1]
            d = math.hypot(dx, dy) or 1.0
            nx, ny = -dy / d, dx / d
            w = ws[j] * 0.5
            seg = [(a[0] - nx * w, a[1] - ny * w), (a[0] + dx * 0.9, a[1] + dy * 0.9), (a[0] + nx * w, a[1] + ny * w)]
            G.traco(pa, self.ps(seg), 0.28, pal["marfim_sombra"], suavizar=False, ponta0=0.1, ponta1=0.1)

    def dente(self, a, b, ponta):
        pa, pal = self.pa, self.pal
        pp = self.ps([a, ponta, b])
        pa.contorno(pp, pal["tinta"], 0.24)
        pa.poli(pp, G.degrade_lin(self.p(*a), self.p(*ponta), [(0.0, pal["marfim_sombra"]), (1.0, C.claro(pal["marfim"], 0.35))]))

    def escamas(self, pontos):
        pa, pal = self.pa, self.pal
        for (u, v, t) in pontos:
            pp = self.ps([(u - 0.1 * t, v + t)] + [(u + t * math.cos(a), v + t * math.sin(a)) for a in [math.pi * (0.5 + i / 8.0) for i in range(9)]])
            G.traco(pa, pp, 0.22, pal["verm_escuro"], suavizar=False, ponta0=0.1, ponta1=0.1, alfa=0.9)

    # ---- a cabeça inteira ------------------------------------------------------------------------------------------------------------
    def pintar(self):
        pa, pal, o = self.pa, self.pal, self.cx.ouro
        verm = (pal["verm_escuro"], pal["verm"], pal["verm_claro"])
        ang, dobra = self.ang, self.dobra

        # crina: leque de espinhos de ouro atrás do crânio, ligados por uma membrana vermelha
        pontas = [(-34, 24), (-42, 14), (-44, 3), (-40, -7), (-30, -15)]
        base = [(2, 12), (-2, 8), (-4, 3), (-4, -3), (-1, -8)]
        membrana = self.ps(base + [p for p in reversed(pontas)])
        pa.contorno(membrana, pal["tinta"], 0.4)
        pa.poli(membrana, G.degrade_lin(self.p(0, 0), self.p(-44, 0), [(0.0, pal["verm_escuro"]), (1.0, pal["verm"])]))
        for (b, p) in zip(base, pontas):
            esp = D.suave([b, ((b[0] + p[0]) / 2, (b[1] + p[1]) / 2 + (1.5 if p[1] > 0 else -1.5)), p], False, 8)
            ws = [2.2 * (1.0 - i / (len(esp) - 1)) ** 0.9 + 0.12 for i in range(len(esp))]
            poly = self.ps(D.fita(esp, ws))
            pa.contorno(poly, pal["tinta"], 0.3)
            pa.poli(poly, G.degrade_lin(self.p(*b), self.p(*p), [(0.0, o["sombra"]), (0.5, o["medio"]), (1.0, o["luz"])]), me=1.0)

        # bigodes de ouro, soprados para trás
        for pts, w in (([(80, 3.0), (66, 12), (48, 10), (30, 19), (10, 17), (-10, 26), (-30, 27)], 1.1), ([(82, -2.0), (68, -8.0), (52, -4.0), (34, -13), (14, -10), (-8, -19), (-26, -20)], 0.9)):
            G.traco(pa, self.ps(pts), w, o["medio"], ponta0=0.03, ponta1=0.55, me=1.0)

        # interior da boca e a maxila inferior (gira na dobradiça)
        sup_labio = [(20, -3.3), (34, -3.1), (50, -2.5), (66, -1.7), (78, -0.9), (86, 0.2)]
        inf_cima = [(20, -3.3), (34, -3.6), (52, -3.4), (70, -2.8), (82, -2.2), (87, -2.6)]
        inf_cima_r = rot(inf_cima, ang, dobra)
        boca = self.ps(sup_labio + inf_cima_r[::-1][:-1])
        pa.contorno(boca, pal["tinta"], 0.3)
        pa.poli(boca, G.degrade_lin(self.p(86, -3), self.p(20, -3), [(0.0, (0.95, 0.62, 0.15)), (0.4, (0.80, 0.28, 0.10)), (1.0, (0.30, 0.06, 0.05))]),
                em=(0.55, 0.22, 0.05))
        for (u, alt) in ((38, 3.0), (50, 3.8), (62, 4.2), (74, 3.6)):
            a = rot([(u - 1.5, -3.2)], ang, dobra)[0]
            b = rot([(u + 1.5, -3.2)], ang, dobra)[0]
            pt = rot([(u + 0.6, -3.2 + alt)], ang, dobra)[0]
            self.dente(a, b, pt)
        inf = [(20, -3.3), (34, -3.6), (52, -3.4), (70, -2.8), (82, -2.2), (88, -3.8), (86, -6.6), (74, -8.8), (56, -10.2), (38, -10.4), (24, -9.2), (14, -7.0), (11, -4.6)]
        self.vol(rot(inf, ang, dobra), *verm, contorno=0.55, borda=2.6, n=4, hach=dict(ang=0.9, espaco=0.9, larg=0.26, cor=pal["verm_escuro"], forca=1.0))
        for (u, v, c, w) in ((70, -9.5, (66, -16), 1.4), (56, -10.5, (50, -18), 1.6), (42, -10.8, (34, -19), 1.5)):
            pt = rot([(u, v), c], ang, dobra)
            esp = D.suave([pt[0], ((pt[0][0] + pt[1][0]) / 2, (pt[0][1] + pt[1][1]) / 2 + 1.0), pt[1]], False, 5)
            G.traco(pa, self.ps(esp), w, pal["tinta"], suavizar=False, ponta0=0.0, ponta1=0.5)

        # crânio e maxila superior
        sup = [(-12, 4.0), (-4, 10.5), (6, 13.5), (16, 14.6), (27, 12.6), (38, 10.6), (50, 9.8), (62, 9.2), (70, 10.2), (78, 8.4), (85, 5.6), (89, 2.6), (87, 0.2),
               (78, -0.8), (66, -1.7), (50, -2.5), (34, -3.1), (20, -3.4), (10, -5.4), (2, -9.0), (-6, -8.4), (-13, -3.0)]
        self.vol(sup, *verm, contorno=0.6, borda=3.0, n=5, hach=dict(ang=0.55, espaco=1.0, larg=0.3, cor=pal["verm_escuro"], forca=1.0))
        for (u, alt) in ((76, 5.4), (62, 4.4), (48, 3.6), (34, 3.0)):
            self.dente((u - 1.6, -1.3), (u + 1.6, -1.7), (u + 0.2, -1.3 - alt))
        pts = [(2, 8, 1.7), (8, 10.5, 1.8), (14, 11.5, 1.7), (20, 9.5, 1.5), (6, 3.5, 1.9), (13, 5.5, 1.7), (20, 3.5, 1.6), (27, 3.2, 1.5), (3, -3.5, 1.9), (10, -2, 1.7), (-3, 4, 1.8),
               (34, 5.5, 1.4), (42, 6, 1.3), (50, 5, 1.2), (58, 5.2, 1.1), (66, 4.8, 1.0), (38, 0.8, 1.2), (48, 0.5, 1.1), (58, 0.7, 1.0)]
        self.escamas(pts)
        # chifres claros
        self.chifre((10, 13.0), (2, 20), (-12, 24), (-32, 20.5), 5.2)
        self.chifre((24, 12.8), (20, 19), (8, 25), (-10, 27.5), 3.4)
        # arcada, olho (que acende), narina
        arc = D.suave([(18, 9.6), (27, 11.4), (37, 9.4)], False, 6)
        G.traco(pa, self.ps(arc), 2.0, pal["tinta"], ponta0=0.08, ponta1=0.45)
        olho = self.ps(D.suave([(23, 7.6), (28.5, 9.4), (35, 7.6), (29, 5.4)], True, 6))
        pa.contorno(olho, pal["tinta"], 0.45)
        pa.poli(olho, pal["olho"], centro=self.p(29.0, 7.4), cor_centro=pal["olho_luz"], em=pal["olho_em"], em_centro=(1.0, 0.86, 0.46))
        pa.poli(self.ps(D.elipse(29.4, 7.4, 0.6, 1.7, rot=0.28, n=10)), pal["tinta"])
        pa.poli(self.ps(D.elipse(27.6, 8.2, 0.5, 0.4, n=6)), (1, 1, 1), alfa=0.9, em=(1.0, 0.9, 0.6))
        pa.poli(self.ps(D.elipse(77.0, 5.0, 1.8, 1.1, rot=0.3, n=10)), pal["tinta"])
