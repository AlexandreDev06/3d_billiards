"""Dragon Lore: as patas traseiras (fitas de nó com garras vermelho-alaranjadas) e a ponta de ouro da cauda.

Tudo no papel (x mm da linha do meio, s mm da ponta). O dragão olha para a ponta do taco, então as patas apontam para o mesmo lado (`-s`).
"""
import math

import cor as C
import desenho as D
import dl_nos as N
import gravura as G


def garra(cx, base, direcao, comp, larg):
    """Uma garra clara e curva, com contorno de tinta; `direcao` em rad no papel (0 = +x, π/2 = +s)."""
    pa, pal = cx.pa, cx.pal
    c, s = math.cos(direcao), math.sin(direcao)
    nx, ny = -s, c
    eixo = [(base[0] + c * comp * u + nx * comp * 0.16 * u * u, base[1] + s * comp * u + ny * comp * 0.16 * u * u) for u in [i / 10.0 for i in range(11)]]
    ws = [larg * (1.0 - u) ** 0.85 + 0.12 for u in [i / 10.0 for i in range(11)]]
    poly = D.fita(eixo, ws)
    pa.contorno(poly, pal["tinta"], 0.26)
    pa.poli(poly, G.degrade_lin(base, eixo[-1], [(0.0, pal["marfim_sombra"]), (1.0, C.claro(pal["marfim"], 0.4))]))


def pe(cx, tornozelo, rumo, lado):
    """O pé: uma almofada vermelho-alaranjada com três garras abertas em leque na direção `rumo` (rad)."""
    pa, pal = cx.pa, cx.pal
    c, s = math.cos(rumo), math.sin(rumo)
    nx, ny = -s, c
    base = tornozelo
    # palma: um coração achatado
    pts = []
    for i in range(0, 13):
        a = math.pi * i / 12.0
        pts.append((base[0] + c * 5.8 * math.sin(a) * 0.9 + nx * 5.4 * math.cos(a), base[1] + s * 5.8 * math.sin(a) * 0.9 + ny * 5.4 * math.cos(a)))
    pts.append((base[0] - c * 1.4, base[1] - s * 1.4))
    palma = D.suave(pts, True, 4)
    verm = (pal["verm_escuro"], pal["verm"], pal["verm_claro"])
    G.forma(pa, palma, *verm, pal["tinta"], contorno=0.38, borda=1.8, malha=0.8)
    for k, dang in enumerate((-0.62, 0.0, 0.62)):
        ang = rumo + dang * lado
        b = (base[0] + math.cos(ang) * 5.2, base[1] + math.sin(ang) * 5.2)
        garra(cx, b, ang, 7.6 if k == 1 else 6.4, 2.0)


def perna(cx, lado, s_anca):
    """Uma pata traseira: coxa para fora e para trás, canela para a frente, pé com garras para a ponta do taco."""
    pa, pal = cx.pa, cx.pal
    ctrl = [(4.5 * lado, s_anca), (11.0 * lado, s_anca + 5.0), (17.0 * lado, s_anca + 4.0), (19.5 * lado, s_anca - 6.0), (18.5 * lado, s_anca - 17.0)]
    pts = G.reamostrar(G.curva(ctrl, 10), 0.5)
    n = len(pts)
    ws = [5.8 - 2.2 * (i / (n - 1)) ** 0.9 for i in range(n)]
    f = N.Fita(cx, "marrom")
    f.desenhar(pts, ws)
    # joelho: um botão de ouro
    joelho = ctrl[2]
    boss = D.elipse(joelho[0], joelho[1], 1.7, 1.7, n=20)
    pa.contorno(boss, pal["tinta"], 0.3)
    pa.poli(boss, cx.ouro["medio"], me=1.0, centro=(joelho[0] - 0.4, joelho[1] + 0.4), cor_centro=cx.ouro["luz"], me_centro=1.0)
    pe(cx, ctrl[-1], math.pi * 1.5 + (0.12 * lado), lado)


def pernas(cx, s_anca):
    for lado in (-1, 1):
        perna(cx, lado, s_anca)


def ponta_de_cauda(cx, ponto, tang, tam=7.5):
    """A ponta da cauda: uma folha de ouro em seta, apontando para `tang` (vetor unitário no papel)."""
    pa, pal, o = cx.pa, cx.pal, cx.ouro
    tx, ty = tang
    nx, ny = -ty, tx
    P = lambda a, b: (ponto[0] + tx * a + nx * b, ponto[1] + ty * a + ny * b)
    forma = D.suave([P(0.0, 0.0), P(tam * 0.28, tam * 0.30), P(tam * 0.62, tam * 0.26), P(tam, 0.0), P(tam * 0.62, -tam * 0.26), P(tam * 0.28, -tam * 0.30)], True, 5)
    pa.contorno(forma, pal["tinta"], 0.4)
    pa.poli(forma, G.ouro_faixa(P(0, -tam * 0.3), P(0, tam * 0.3), o), me=1.0, malha=0.8)
    G.traco(pa, [P(tam * 0.1, 0.0), P(tam * 0.9, 0.0)], 0.3, pal["tinta"], suavizar=False, ponta0=0.1, ponta1=0.3)
