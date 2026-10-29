"""Dragon Lore: as asas. Vistas de cima, recolhidas para trás (rumo ao cabo do taco), com braço, quatro dedos e a membrana entre eles.

Coordenadas do papel: x mm a partir da linha do meio, s mm da ponta. A asa direita é desenhada com x > 0; a esquerda é o espelho.
Membrana em vermelho-terra com hachura de pena, ossos de tinta com fio de ouro, borda recortada de ouro.
"""
import math

import cor as C
import desenho as D
import gravura as G

# a asa direita (x, s): ombro, cotovelo, pulso, pontas dos dedos do mais externo (borda de ataque) ao mais interno, e a raiz na barriga
OMBRO = (4.0, 917.0)
COTOVELO = (11.0, 924.0)
PULSO = (18.0, 940.0)
PONTAS = [(25.5, 983.0), (20.5, 992.0), (14.0, 996.0), (8.5, 991.0)]
RAIZ = (5.0, 972.0)


def esp(p, lado):
    return (p[0] * lado, p[1])


def arco(a, b, barriga, hacia, n=14):
    """Curva de `a` até `b` que se afunda `barriga` mm na direção do ponto `hacia` (a borda recortada da membrana)."""
    mx, ms = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    dx, ds = b[0] - a[0], b[1] - a[1]
    d = math.hypot(dx, ds) or 1.0
    nx, ns = ds / d, -dx / d
    if nx * (hacia[0] - mx) + ns * (hacia[1] - ms) < 0:
        nx, ns = -nx, -ns
    c = (mx + nx * barriga, ms + ns * barriga)
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]))
    return pts


def osso(a, b, arqueio, n=18):
    """Osso levemente curvo de a até b (arqueio em mm, para o lado +x)."""
    mx, ms = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    dx, ds = b[0] - a[0], b[1] - a[1]
    d = math.hypot(dx, ds) or 1.0
    nx, ns = ds / d, -dx / d
    c = (mx + nx * arqueio * 2, ms + ns * arqueio * 2)
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]))
    return pts


def geometria(lado):
    L = lambda p: esp(p, lado)
    sh, co, pu, ra = L(OMBRO), L(COTOVELO), L(PULSO), L(RAIZ)
    pontas = [L(p) for p in PONTAS]
    dedos = [osso(pu, p, -0.8 * lado + (0.4 if i > 1 else 0.0) * lado) for i, p in enumerate(pontas)]
    braco = osso(sh, co, 0.3 * lado) + osso(co, pu, 0.5 * lado)[1:]
    # bordas recortadas da membrana entre as pontas
    barriga = [5.4, 5.0, 4.6]
    arcos = [arco(pontas[i], pontas[i + 1], barriga[i], pu) for i in range(3)]
    arco_raiz = arco(pontas[3], ra, 3.4, pu)
    return dict(sh=sh, co=co, pu=pu, ra=ra, pontas=pontas, dedos=dedos, braco=braco, arcos=arcos, arco_raiz=arco_raiz)


def paineis(g):
    """Os polígonos da membrana: três entre os dedos e a parte de dentro (entre o braço, o quarto dedo e o corpo)."""
    pu = g["pu"]
    d = g["dedos"]
    saida = []
    for i in range(3):
        saida.append(d[i] + g["arcos"][i][1:] + d[i + 1][::-1][:-1])
    interno = [g["sh"]] + g["braco"][1:] + d[3][1:] + g["arco_raiz"][1:] + [g["sh"]]
    saida.append(interno)
    return saida


def pintar_asa(cx, lado):
    pa, pal, o = cx.pa, cx.pal, cx.ouro
    g = geometria(lado)
    if not pa.visivel(min(p[1] for p in g["pontas"]) - 4, g["sh"][1] + 4, 6.0):
        return
    pans = paineis(g)
    # contorno de tinta de toda a asa
    for poly in pans:
        pa.contorno(poly, pal["tinta"], 0.45)
    # membrana: do osso (escuro) à borda recortada (clara)
    for i, poly in enumerate(pans):
        pu = g["pu"]
        alvo = g["pontas"][min(i, 3)]
        cor_ = G.degrade_lin((pu[0], pu[1]), (alvo[0], alvo[1] + 8.0), [(0.0, pal["membrana"][0]), (0.45, pal["membrana"][1]), (1.0, pal["membrana"][2])])
        if i == 3:
            cor_ = G.degrade_lin((g["sh"][0], g["sh"][1]), (g["ra"][0], g["ra"][1] + 30.0), [(0.0, pal["membrana"][0]), (0.5, pal["membrana"][1]), (1.0, pal["membrana"][2])])
        pa.poli(poly, cor_, malha=1.6)
    # veias: hachura ao longo dos dedos, mais grossa junto do osso
    for i, poly in enumerate(pans[:3]):
        a, b = g["pu"], g["pontas"][i]
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        G.hachurar(pa, poly, ang, 0.85, 0.32, C.escuro(pal["membrana"][1], 0.55), sombra=G.sombra_de_borda(poly, 3.5, 1.0, 0.25, 1.0), passo=1.5, alfa=0.85)
    # ossos: braço e dedos como traços afilados, com um fio de luz por cima
    traco(pa, g["braco"], 1.5, pal["tinta"], ponta0=0.02, ponta1=0.05)
    traco(pa, g["braco"], 0.5, pal["ouro"]["medio"], ponta0=0.1, ponta1=0.1, me=1.0)
    for i, d in enumerate(g["dedos"]):
        traco(pa, d, 1.05 - 0.1 * i, pal["tinta"], ponta0=0.04, ponta1=0.4)
        traco(pa, d, 0.4, pal["ouro"]["medio"], ponta0=0.1, ponta1=0.5, me=1.0)
    # bordas de ouro nas pontas recortadas
    for arc in g["arcos"] + [g["arco_raiz"]]:
        traco(pa, arc, 0.55, pal["ouro"]["medio"], suavizar=False, ponta0=0.05, ponta1=0.05, me=1.0)
    # garra do pulso
    pu = g["pu"]
    sg = 1 if lado > 0 else -1
    garra = [(pu[0] + 0.7 * sg, pu[1] + 1.2), (pu[0] + 2.2 * sg, pu[1] - 3.4), (pu[0] - 0.6 * sg, pu[1] - 1.0)]
    pa.contorno(garra, pal["tinta"], 0.25)
    pa.poli(garra, pal["ouro"]["luz"], me=1.0)


def traco(pa, pts, larg, cor, **kw):
    G.traco(pa, pts, larg, cor, **kw)


def pintar_asas(cx):
    for lado in (-1, 1):
        pintar_asa(cx, lado)
