"""Dragon Lore: os ornamentos celtas bem apagados do pergaminho (só na cor): nós em anel, triskeles e espirais, em tinta fraca.

Tudo no papel (x mm da linha do meio, s mm da ponta). Usa a cor `fundo_ornato` da paleta e transparência, para ficarem no limite do
visível: o desenho principal é o dragão, o ornamento só dá clima de manuscrito.
"""
import math

import desenho as D
import dl_nos as N
import gravura as G

ALFA = 0.62


def anel(cx, c, R, voltas=4, ww=1.7, a=1.2, larg=0.30):
    """Um anel celta: duas fitas que se trançam em volta de um círculo de raio R (voltas inteiras, para fechar)."""
    if cx.canal != "cor":
        return
    n = 90
    centro = [(c[0] + R * math.cos(2 * math.pi * i / n), c[1] + R * math.sin(2 * math.pi * i / n)) for i in range(n + 1)]
    perim = 2 * math.pi * R
    N.no_em_linhas(cx, centro, a, ww, perim / voltas, cx.pal["fundo_ornato"], larg=larg, alfa=ALFA)
    G.traco(cx.pa, [(c[0] + (R + ww * 0.5 + a + 1.1) * math.cos(2 * math.pi * i / 60), c[1] + (R + ww * 0.5 + a + 1.1) * math.sin(2 * math.pi * i / 60)) for i in range(61)],
            larg * 0.9, cx.pal["fundo_ornato"], suavizar=False, ponta0=0.0, ponta1=0.0, alfa=ALFA * 0.8, passo=0.8)


def triskele(cx, c, r, giro=0.0, larg=0.34):
    """Três braços em espiral que saem do centro e giram, como o triskele celta."""
    if cx.canal != "cor":
        return
    for k in range(3):
        a0 = giro + k * 2 * math.pi / 3
        pts = []
        for i in range(0, 41):
            u = i / 40.0
            ang = a0 + u * 1.9 * math.pi * 0.62
            rr = r * (0.10 + 0.90 * u ** 0.8)
            pts.append((c[0] + rr * math.cos(ang), c[1] + rr * math.sin(ang)))
        # a ponta de cada braço se enrola
        fim = pts[-1]
        ang_f = a0 + 1.9 * math.pi * 0.62
        cen = (fim[0] + r * 0.22 * math.cos(ang_f + math.pi / 2), fim[1] + r * 0.22 * math.sin(ang_f + math.pi / 2))
        for i in range(1, 17):
            u = i / 16.0
            aa = ang_f - math.pi / 2 + u * 1.7 * math.pi
            rr = r * 0.22 * (1.0 - 0.75 * u)
            pts.append((cen[0] + rr * math.cos(aa), cen[1] + rr * math.sin(aa)))
        G.traco(cx.pa, pts, larg * 1.5, cx.pal["fundo_ornato"], suavizar=True, ponta0=0.05, ponta1=0.35, alfa=ALFA)


def espiral(cx, c, r, giros=2.0, sentido=1, giro=0.0, larg=0.32):
    if cx.canal != "cor":
        return
    n = int(60 * giros)
    pts = []
    for i in range(n + 1):
        u = i / n
        ang = giro + sentido * u * giros * 2 * math.pi
        rr = r * (1.0 - 0.92 * u)
        pts.append((c[0] + rr * math.cos(ang), c[1] + rr * math.sin(ang)))
    G.traco(cx.pa, pts, larg * 1.4, cx.pal["fundo_ornato"], suavizar=False, ponta0=0.04, ponta1=0.5, alfa=ALFA, passo=0.7)


def filete(cx, a, b, larg=0.3, dupla=True):
    """Um filete reto de tinta fraca (duplo, como a régua de um manuscrito)."""
    if cx.canal != "cor":
        return
    G.linha(cx.pa, a, b, larg, cx.pal["fundo_ornato"], alfa=ALFA)
    if dupla:
        G.linha(cx.pa, (a[0] + 1.2, a[1]), (b[0] + 1.2, b[1]), larg * 0.7, cx.pal["fundo_ornato"], alfa=ALFA * 0.8)
