"""Bicho Solto: mosaico de bichos de desenho animado em cores berrantes (haste e antebraço).

Cada bicho é uma cara de adesivo (contorno preto grosso, borda branca de recorte) feita de formas simples, e o mosaico os põe em fileiras
alternadas, girados e de tamanhos variados, sobre um fundo escuro de confete. O alto de cada cara aponta para a ponta do taco
(`Tela(girar=True)`). Duas caras por volta, e o tamanho de cada uma acompanha a circunferência do cone (o passo das fileiras também).

`blender -b --factory-startup --python bichos.py -- [haste|antebraco|tudo] [normal|raro] [saida.png]`
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cor as C  # noqa: E402
import desenho as D  # noqa: E402
import pintura as P  # noqa: E402
from tela import Tela, argumentos  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SAIDA = os.path.join(RAIZ, "exportados")

PRETO = C.rgb("#14091f")
BRANCO = C.rgb("#ffffff")
ROSA = C.rgb("#ff2e93")
AZUL = C.rgb("#1e8bff")
LIMA = C.rgb("#9dff1a")
AMARELO = C.rgb("#ffe600")
LARANJA = C.rgb("#ff7a00")
ROXO = C.rgb("#9b30ff")
CIANO = C.rgb("#00e5ff")
VERMELHO = C.rgb("#ff2a3a")
VERDE_AGUA = C.rgb("#00e0a6")

FUNDOS = {
    "normal": [C.rgb("#2a0b5e"), C.rgb("#12083a")],
    "raro": [C.rgb("#fff3d6"), C.rgb("#ffd9a8")],
}
CORES_CONFETE = [ROSA, AZUL, LIMA, AMARELO, LARANJA, CIANO, VERMELHO, VERDE_AGUA, ROXO]


class Pincel:
    """Desenha em coordenadas locais (unidades ≈ mm da cara de 20 de largura) pela pose dada."""

    def __init__(self, t, pose, escala_linha=1.0, modo_raro=False):
        self.t = t
        self.pose = pose
        self.k = pose.escala
        self.linha = escala_linha
        self.raro = modo_raro

    def pts(self, p):
        return self.pose(p)

    def forma(self, pontos, cor, contorno=True, esp=0.6, grad=0.16, alfa=None, sombra_baixo=True):
        loc = self.pts(pontos)
        if contorno:
            self.t.poligono(D.expandir(loc, esp * self.k * self.linha), PRETO)
        if grad:
            cx, cy = D.centro(loc)
            x0, y0, x1, y1 = D.caixa(loc)
            self.t.poligono(loc, P.lin((cx - (x1 - x0) * 0.2, y1), (cx + (x1 - x0) * 0.2, y0), C.claro(cor, grad), C.escuro(cor, grad * 0.9)), malha=1.0 * max(self.k, 0.4))
        else:
            self.t.poligono(loc, cor)
        return loc

    def elipse(self, cx, cy, rx, ry, cor, rot=0.0, **kw):
        return self.forma(D.elipse(cx, cy, rx, ry, rot=rot, n=32), cor, **kw)

    def traco(self, pontos, larg, cor=None, suave=True, fim_fino=False):
        cor = PRETO if cor is None else cor
        eixo = D.suave(pontos, False, 6) if suave and len(pontos) > 2 else pontos
        larguras = [larg, larg, larg * (0.5 if fim_fino else 1.0)] if len(eixo) > 2 else larg
        self.t.poligono(self.pts(D.fita(eixo, larguras)), cor)

    def olho(self, cx, cy, r, olhar=(0.25, -0.1), pupila=0.52, iris=None, cilios=False):
        self.elipse(cx, cy, r, r * 1.08, BRANCO, esp=0.5, grad=0.0)
        px, py = cx + olhar[0] * r, cy + olhar[1] * r
        if iris:
            self.t.poligono(self.pts(D.elipse(px, py, r * 0.74, r * 0.78, n=20)), iris)
        self.t.poligono(self.pts(D.elipse(px, py, r * pupila, r * pupila * 1.08, n=20)), PRETO)
        self.t.poligono(self.pts(D.elipse(px - r * 0.2, py + r * 0.24, r * 0.2, r * 0.2, n=10)), BRANCO)

    def bochecha(self, cx, cy, r, cor=None):
        c = C.rgb("#ff5a8a") if cor is None else cor
        self.t.poligono(self.pts(D.elipse(cx, cy, r, r * 0.7, n=16)), c, alfa=0.55)

    def sorriso(self, cx, cy, largura, fundo=1.6, esp=0.55):
        pontos = [(cx - largura, cy), (cx, cy - fundo), (cx + largura, cy)]
        self.traco(pontos, esp)


# ---- os bichos: cada um é uma função (p: Pincel) que desenha uma cara em ~[-10, 10] --------------------------------------

def gato(p, cor=C.rgb("#ff8a1f"), listras=C.rgb("#a63f06")):
    for s in (-1, 1):
        p.forma(D.suave([(s * 9.4, 3.0), (s * 8.6, 11.4), (s * 2.2, 7.4)], True, 4), cor)
        p.forma(D.suave([(s * 7.9, 5.0), (s * 7.5, 9.4), (s * 4.3, 7.0)], True, 4), C.rgb("#ff9fbf"), contorno=False, grad=0)
    p.forma(D.elipse(0, 0, 10.2, 8.6, n=48), cor)
    for dx in (-2.4, 0.0, 2.4):
        p.traco([(dx, 7.8), (dx * 0.8, 3.6)], 0.9 if dx == 0 else 0.75, listras)
    for s in (-1, 1):
        p.traco([(s * 9.8, 0.8), (s * 7.4, 0.2)], 0.8, listras)
        p.traco([(s * 9.6, -2.0), (s * 7.2, -1.8)], 0.8, listras)
    p.elipse(0, -3.4, 4.6, 3.3, C.rgb("#fff2dc"), esp=0.0, grad=0.04)
    for s in (-1, 1):
        p.elipse(s * 4.1, 1.5, 2.6, 3.0, C.rgb("#9aff37"))
        p.t.poligono(p.pts(D.elipse(s * 4.1 + 0.2, 1.5, 0.75, 2.6, n=16)), PRETO)
        p.t.poligono(p.pts(D.elipse(s * 4.1 - 0.6, 2.8, 0.55, 0.65, n=8)), BRANCO)
    p.forma([(0, -1.2), (-1.3, -2.4), (1.3, -2.4)], C.rgb("#ff7aa6"), esp=0.4, grad=0)
    p.traco([(0, -2.4), (0, -3.4)], 0.5)
    p.traco([(0, -3.4), (-1.6, -4.4), (-3.0, -3.7)], 0.5)
    p.traco([(0, -3.4), (1.6, -4.4), (3.0, -3.7)], 0.5)
    for s in (-1, 1):
        for dy, ang in ((-2.0, 0.12), (-3.4, 0.0), (-4.8, -0.12)):
            p.traco([(s * 5.4, dy), (s * 11.4, dy - ang * 8)], 0.28, PRETO, suave=False)
    p.bochecha(-7.2, -2.6, 1.7)
    p.bochecha(7.2, -2.6, 1.7)


def cachorro(p):
    for s in (-1, 1):
        p.forma(D.elipse(s * 9.4, -0.8, 3.5, 7.6, rot=s * 0.28, n=32), C.rgb("#7b3f12"))
    p.forma(D.elipse(0, 0, 8.8, 8.8, n=48), C.rgb("#eab36c"))
    p.forma(D.elipse(-4.0, 2.6, 3.3, 3.6, rot=0.3, n=24), C.rgb("#7b3f12"), contorno=False)
    p.elipse(0, -3.4, 5.2, 3.9, C.rgb("#ffe9c4"), esp=0.0, grad=0.05)
    p.forma(D.elipse(0, -6.8, 2.1, 2.6, n=20), C.rgb("#ff5f8a"))
    p.traco([(0, -6.6), (0, -8.4)], 0.35, C.rgb("#c4204f"), suave=False)
    p.forma(D.elipse(0, -1.5, 2.5, 1.6, n=24), C.rgb("#1a0f12"), esp=0.3, grad=0.0)
    p.t.poligono(p.pts(D.elipse(-0.8, -1.0, 0.8, 0.4, n=8)), BRANCO, alfa=0.8)
    p.traco([(0, -3.0), (0, -4.6)], 0.5)
    p.traco([(-3.6, -4.9), (-1.6, -5.6), (0, -4.6), (1.6, -5.6), (3.6, -4.9)], 0.55)
    for s, olhar in ((-1, (0.3, -0.1)), (1, (0.3, -0.1))):
        p.olho(s * 3.6, 2.7, 2.1, olhar)
    p.traco([(-6.2, 5.8), (-3.4, 6.6), (-2.0, 6.0)], 0.6)
    p.traco([(6.2, 5.8), (3.4, 6.6), (2.0, 6.0)], 0.6)


def sapo(p):
    p.forma(D.elipse(0, -1.2, 10.8, 7.6, n=48), C.rgb("#5fe01c"))
    p.elipse(0, -4.8, 7.2, 3.2, C.rgb("#b9ff6e"), esp=0.0, grad=0.04)
    for s in (-1, 1):
        p.forma(D.elipse(s * 5.2, 5.4, 4.0, 3.9, n=32), C.rgb("#5fe01c"))
        p.olho(s * 5.2, 5.6, 3.1, (s * -0.2, -0.05), pupila=0.5)
    for s in (-1, 1):
        p.t.poligono(p.pts(D.elipse(s * 1.4, -0.8, 0.45, 0.35, n=8)), PRETO)
        p.bochecha(s * 7.8, -2.6, 1.9)
    for (x, y, r) in ((-5.5, 0.8, 0.9), (4.8, 1.4, 0.7), (6.4, -0.8, 0.8), (-2.0, 2.6, 0.7)):
        p.t.poligono(p.pts(D.elipse(x, y, r, r * 0.8, n=10)), C.rgb("#3fae0f"), alfa=0.75)
    p.traco([(-8.6, -3.4), (-4.0, -6.6), (0, -7.0), (4.0, -6.6), (8.6, -3.4)], 0.7)
    p.forma(D.elipse(0, -7.4, 2.4, 1.1, n=16), C.rgb("#ff4f7a"), esp=0.3, grad=0)


def porco(p):
    for s in (-1, 1):
        p.forma(D.suave([(s * 8.4, 5.4), (s * 10.2, 11.0), (s * 3.2, 8.2)], True, 4), C.rgb("#ff7aa2"))
    p.forma(D.elipse(0, 0, 10.2, 8.6, n=48), C.rgb("#ff8fb3"))
    p.forma(D.elipse(0, -2.4, 4.9, 3.6, n=32), C.rgb("#ff6a9a"))
    for s in (-1, 1):
        p.t.poligono(p.pts(D.elipse(s * 1.7, -2.4, 0.85, 1.35, n=12)), C.rgb("#9c1d48"))
        p.forma(D.elipse(s * 4.7, 2.4, 1.25, 1.55, n=16), PRETO, esp=0.1, grad=0)
        p.t.poligono(p.pts(D.elipse(s * 4.7 - 0.3, 3.0, 0.36, 0.36, n=8)), BRANCO)
        p.bochecha(s * 7.4, -1.0, 2.1)
    p.traco([(-1.6, -5.9), (0, -6.5), (1.6, -5.9)], 0.5)
    p.traco([(-3.0, 4.6), (-5.0, 4.9)], 0.45)
    p.traco([(3.0, 4.6), (5.0, 4.9)], 0.45)


def macaco(p):
    for s in (-1, 1):
        p.forma(D.elipse(s * 10.2, 0.6, 3.3, 3.3, n=24), C.rgb("#8c4a1c"))
        p.t.poligono(p.pts(D.elipse(s * 10.2, 0.6, 1.9, 1.9, n=16)), C.rgb("#ffb5a0"))
    p.forma(D.elipse(0, 1.2, 9.2, 8.6, n=48), C.rgb("#8c4a1c"))
    mascara = D.suave([(0, 4.2), (2.7, 6.2), (6.2, 4.0), (6.4, -1.2), (3.4, -5.8), (0, -7.4), (-3.4, -5.8), (-6.4, -1.2), (-6.2, 4.0), (-2.7, 6.2)], True, 5)
    p.forma(mascara, C.rgb("#f6d19c"), esp=0.3)
    p.elipse(0, -3.6, 4.3, 3.2, C.rgb("#ffe2b8"), esp=0.0, grad=0.03)
    for s in (-1, 1):
        p.olho(s * 2.7, 1.9, 1.9, (0.0, -0.1))
        p.t.poligono(p.pts(D.elipse(s * 0.85, -2.0, 0.4, 0.55, n=8)), PRETO)
    p.sorriso(0, -3.8, 2.8, 1.8)
    p.bochecha(-5.0, -2.8, 1.4)
    p.bochecha(5.0, -2.8, 1.4)


def coelho(p):
    for s in (-1, 1):
        p.forma(D.elipse(s * 3.6, 12.4, 2.7, 8.0, rot=-s * 0.13, n=32), C.rgb("#d9b3ff"))
        p.t.poligono(p.pts(D.elipse(s * 3.6, 12.2, 1.35, 6.2, rot=-s * 0.13, n=24)), C.rgb("#ff9fcb"))
    p.forma(D.elipse(0, -0.6, 8.8, 7.8, n=48), C.rgb("#f6ecff"))
    for s in (-1, 1):
        p.forma(D.elipse(s * 3.6, 0.8, 1.5, 2.1, n=16), PRETO, esp=0.1, grad=0)
        p.t.poligono(p.pts(D.elipse(s * 3.6 - 0.4, 1.6, 0.5, 0.6, n=8)), BRANCO)
        p.bochecha(s * 6.2, -2.6, 1.8)
        for dy, ang in ((-2.4, 0.15), (-3.6, 0.0)):
            p.traco([(s * 4.4, dy), (s * 9.8, dy - ang * 7)], 0.26, PRETO, suave=False)
    p.forma([(0, -1.8), (-1.2, -2.8), (1.2, -2.8)], C.rgb("#ff6fa0"), esp=0.35, grad=0)
    p.traco([(0, -2.8), (0, -4.0)], 0.4, suave=False)
    p.traco([(0, -4.0), (-1.8, -5.0)], 0.45, suave=False)
    p.traco([(0, -4.0), (1.8, -5.0)], 0.45, suave=False)
    p.forma([(-1.6, -4.3), (1.6, -4.3), (1.6, -7.2), (0, -7.5), (-1.6, -7.2)], BRANCO, esp=0.4, grad=0.04)
    p.traco([(0, -4.4), (0, -7.4)], 0.3, suave=False)


def leao(p):
    for i in range(14):
        a = 2 * math.pi * i / 14 + 0.12
        x, y = 8.4 * math.cos(a), 8.4 * math.sin(a)
        p.forma(D.elipse(x, y, 3.8, 3.1, rot=a, n=20), C.rgb("#e5620a") if i % 2 else C.rgb("#ff8a14"), esp=0.5)
    p.forma(D.elipse(0, 0, 8.5, 8.5, n=48), C.rgb("#ff9a14"))
    for s in (-1, 1):
        p.forma(D.elipse(s * 6.2, 6.4, 2.4, 2.4, n=20), C.rgb("#ffc552"), esp=0.5)
        p.t.poligono(p.pts(D.elipse(s * 6.2, 6.4, 1.2, 1.2, n=14)), C.rgb("#ff9fbf"))
    p.forma(D.elipse(0, 0, 7.4, 7.4, n=48), C.rgb("#ffc552"), esp=0.4)
    p.elipse(0, -3.0, 4.2, 3.1, C.rgb("#fff0cf"), esp=0.0, grad=0.03)
    for s in (-1, 1):
        p.olho(s * 3.2, 2.0, 1.8, (0.1, -0.1), iris=C.rgb("#7a3f00"), pupila=0.55)
        p.traco([(s * 1.2, 4.6), (s * 5.0, 5.3)], 0.55)
        p.bochecha(s * 5.6, -2.2, 1.4)
    p.forma([(0, -0.8), (-1.5, -2.0), (1.5, -2.0)], C.rgb("#5d2a0b"), esp=0.3, grad=0)
    p.traco([(0, -2.0), (0, -3.2)], 0.45, suave=False)
    p.traco([(0, -3.2), (-1.8, -4.4), (-3.4, -3.8)], 0.5)
    p.traco([(0, -3.2), (1.8, -4.4), (3.4, -3.8)], 0.5)


def panda(p):
    for s in (-1, 1):
        p.forma(D.elipse(s * 7.0, 7.4, 3.4, 3.4, n=24), C.rgb("#1d1226"))
    p.forma(D.elipse(0, 0, 9.8, 8.6, n=48), C.rgb("#ffffff"), grad=0.0)
    for s in (-1, 1):
        p.forma(D.elipse(s * 3.8, 1.0, 2.8, 3.6, rot=s * 0.5, n=24), C.rgb("#1d1226"), contorno=False, grad=0)
        p.t.poligono(p.pts(D.elipse(s * 3.7, 1.6, 1.35, 1.5, n=16)), BRANCO)
        p.t.poligono(p.pts(D.elipse(s * 3.6, 1.5, 0.75, 0.82, n=12)), PRETO)
        p.t.poligono(p.pts(D.elipse(s * 3.3, 2.0, 0.28, 0.28, n=8)), BRANCO)
        p.bochecha(s * 6.9, -2.9, 1.9)
    p.forma(D.elipse(0, -2.2, 1.9, 1.3, n=20), C.rgb("#1d1226"), esp=0.2, grad=0)
    p.traco([(0, -3.4), (0, -4.4)], 0.4, suave=False)
    p.traco([(0, -4.4), (-2.0, -5.5), (-3.4, -4.8)], 0.5)
    p.traco([(0, -4.4), (2.0, -5.5), (3.4, -4.8)], 0.5)


def pintinho(p):
    for k, (dx, ang) in enumerate(((-1.8, 0.35), (0.0, 0.0), (1.8, -0.35))):
        p.forma(D.girar(D.suave([(0, 7.6), (-1.0, 11.2), (0.2, 12.0), (1.0, 11.2)], True, 4), ang, 0, 7.6), C.rgb("#ffd700"), esp=0.45)
    p.forma(D.elipse(0, 0, 9.8, 9.0, n=48), C.rgb("#ffe733"))
    for s in (-1, 1):
        p.forma(D.elipse(s * 9.4, -1.4, 2.0, 3.6, rot=s * 0.4, n=20), C.rgb("#ffd21a"), esp=0.5)
        p.forma(D.elipse(s * 4.0, 2.4, 1.4, 1.8, n=16), PRETO, esp=0.1, grad=0)
        p.t.poligono(p.pts(D.elipse(s * 4.0 - 0.4, 3.1, 0.5, 0.5, n=8)), BRANCO)
        p.bochecha(s * 6.8, -2.0, 1.9, C.rgb("#ff7a3a"))
    p.forma([(-2.4, -1.6), (2.4, -1.6), (0, -4.8)], C.rgb("#ff7a00"), esp=0.45, grad=0.12)
    p.forma([(-2.0, -1.6), (2.0, -1.6), (0, 0.4)], C.rgb("#ff9a2a"), esp=0.45, grad=0.12)
    p.traco([(-1.9, -1.6), (1.9, -1.6)], 0.3, suave=False)


def vaca(p):
    for s in (-1, 1):
        p.forma(D.suave([(s * 5.0, 8.0), (s * 5.6, 11.4), (s * 3.2, 11.0), (s * 3.0, 8.2)], True, 4), C.rgb("#fff1c9"), esp=0.5)
        p.forma(D.elipse(s * 10.0, 3.8, 3.7, 1.9, rot=s * -0.3, n=24), C.rgb("#ffffff"))
        p.t.poligono(p.pts(D.elipse(s * 10.0, 3.8, 2.3, 0.9, rot=s * -0.3, n=16)), C.rgb("#ffb3c7"))
    p.forma(D.elipse(0, 0, 8.4, 9.2, n=48), C.rgb("#ffffff"), grad=0.0)
    p.forma(D.suave([(-8.2, 6.0), (-3.0, 8.6), (-2.2, 3.0), (-6.4, 1.2), (-8.4, 2.4)], True, 5), C.rgb("#2a1b32"), contorno=False, grad=0)
    p.forma(D.suave([(8.0, -1.0), (5.6, 2.4), (6.6, 5.6), (8.2, 3.4)], True, 5), C.rgb("#2a1b32"), contorno=False, grad=0)
    p.forma(D.elipse(0, -5.2, 6.2, 3.9, n=36), C.rgb("#ffb3c7"))
    for s in (-1, 1):
        p.t.poligono(p.pts(D.elipse(s * 2.3, -5.0, 0.95, 1.5, n=12)), C.rgb("#a82d57"))
        p.olho(s * 3.7, 2.6, 2.0, (s * 0.1, -0.1), pupila=0.55)
        p.bochecha(s * 6.0, -1.6, 1.4)
    p.traco([(-2.4, -7.2), (0, -7.7), (2.4, -7.2)], 0.4)


def elefante(p):
    for s in (-1, 1):
        p.forma(D.elipse(s * 9.2, 1.0, 6.4, 7.0, n=40), C.rgb("#8fb7ff"))
        p.t.poligono(p.pts(D.elipse(s * 9.2, 1.0, 4.4, 5.0, n=30)), C.rgb("#ffb3d1"))
    p.forma(D.elipse(0, 0.6, 7.8, 8.2, n=48), C.rgb("#a9c6ff"))
    tronco = D.fita(D.suave([(0, -0.6), (0.4, -4.8), (-1.2, -9.0), (1.0, -11.6)], False, 8), [4.4, 3.6, 3.0, 2.4])
    p.forma(tronco, C.rgb("#a9c6ff"), esp=0.5)
    for k in range(4):
        y = -3.0 - k * 2.0
        p.traco([(-1.8 + 0.4 * k * 0.1, y), (1.8, y - 0.3)], 0.28, C.rgb("#5e82c9"), suave=False)
    for s in (-1, 1):
        p.olho(s * 3.6, 3.2, 1.7, (0.0, -0.1))
        p.forma(D.suave([(s * 3.0, -4.0), (s * 5.8, -6.0), (s * 5.0, -8.4), (s * 3.2, -6.6)], True, 4), C.rgb("#fff4d2"), esp=0.4)
        p.bochecha(s * 5.2, -1.4, 1.5)


def polvo(p):
    for k in range(5):
        x = -6.8 + k * 3.4
        lado = 1 if k % 2 else -1
        pts = [(x, -2.5), (x + 0.5 * lado, -6.0), (x + 1.3 * lado, -9.2), (x + 0.4 * lado, -11.4)]
        p.forma(D.fita(D.suave(pts, False, 8), [3.6, 3.2, 2.5, 1.0]), C.rgb("#a43ef0"), esp=0.5)
        p.t.poligono(p.pts(D.elipse(pts[1][0], pts[1][1], 0.5, 0.5, n=8)), C.rgb("#e2b0ff"))
    p.forma(D.suave([(-8.4, -1.0), (-8.0, 5.6), (-3.8, 10.0), (0, 10.8), (3.8, 10.0), (8.0, 5.6), (8.4, -1.0)], True, 6), C.rgb("#b44cff"))
    for s in (-1, 1):
        p.olho(s * 3.3, 3.2, 2.4, (s * -0.2, -0.1), pupila=0.5)
        p.bochecha(s * 6.0, -0.4, 1.6)
    p.traco([(-2.0, -0.8), (0, -2.0), (2.0, -0.8)], 0.55)
    for (x, y, r) in ((-4.8, 8.0, 0.9), (4.6, 8.0, 0.7), (0, 9.4, 0.8)):
        p.t.poligono(p.pts(D.elipse(x, y, r, r, n=10)), C.rgb("#dc9bff"), alfa=0.8)


BICHOS = [gato, cachorro, sapo, porco, macaco, coelho, leao, panda, pintinho, vaca, elefante, polvo]
NOMES = ["gato", "cachorro", "sapo", "porco", "macaco", "coelho", "leao", "panda", "pintinho", "vaca", "elefante", "polvo"]


def adesivo(t, bicho, x, y, escala, giro, fh, rng, raro=False):
    """Um bicho com a borda branca de adesivo recortado, uma sombra e um respingo de cor atrás."""
    pose = D.Pose(x, y, escala, giro, fh=fh)
    # forma de recorte: união aproximada = elipse que cobre a cara (a borda segue a cabeça por baixo)
    recorte = pose(D.elipse(0, 0.4, 12.0, 11.4, n=48))
    t.poligono(D.mover(D.expandir(recorte, 0.9 * escala), 0.5 * escala, -0.7 * escala), (0, 0, 0), alfa=0.30)
    t.poligono(D.expandir(recorte, 1.7 * escala), PRETO)
    cor_fundo = rng.choice([ROSA, AZUL, LIMA, AMARELO, LARANJA, CIANO, VERMELHO, VERDE_AGUA, ROXO])
    if raro:
        cor_fundo = C.misturar(cor_fundo, BRANCO, 0.25)
    t.poligono(D.expandir(recorte, 1.1 * escala), BRANCO)
    t.poligono(recorte, P.lin(pose.ponto((-6, 8)), pose.ponto((6, -8)), C.claro(cor_fundo, 0.2), C.escuro(cor_fundo, 0.15)), malha=1.5)
    p = Pincel(t, pose, escala_linha=1.0, modo_raro=raro)
    bicho(p)


def confete(t, rng, W, H, densidade=0.0045, raro=False):
    """Formas pequenas (estrelas, bolinhas, cruzes, zigue-zagues) espalhadas pelo fundo."""
    n = int(W * H * densidade)
    for _ in range(n):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        f = t.fh(y)
        c = rng.choice(CORES_CONFETE)
        r = rng.uniform(0.7, 1.7)
        tipo = rng.choice(("bola", "estrela", "cruz", "zigue"))
        giro = rng.uniform(0, math.pi)
        if tipo == "bola":
            pts = D.elipse(x, y, r * 0.8, r * 0.8, n=12)
        elif tipo == "estrela":
            pts = [(x + (r * (1.6 if i % 2 == 0 else 0.7)) * math.cos(giro + i * math.pi / 5), y + (r * (1.6 if i % 2 == 0 else 0.7)) * math.sin(giro + i * math.pi / 5)) for i in range(10)]
        elif tipo == "cruz":
            pts = D.girar([(-r * 1.4, -0.35 * r), (-0.35 * r, -0.35 * r), (-0.35 * r, -r * 1.4), (0.35 * r, -r * 1.4), (0.35 * r, -0.35 * r), (r * 1.4, -0.35 * r), (r * 1.4, 0.35 * r), (0.35 * r, 0.35 * r), (0.35 * r, r * 1.4), (-0.35 * r, r * 1.4), (-0.35 * r, 0.35 * r), (-r * 1.4, 0.35 * r)], giro)
            pts = [(x + px, y + py) for px, py in pts]
        else:
            pts = D.fita([(x - r * 1.6, y - r * 0.5), (x - r * 0.5, y + r * 0.5), (x + r * 0.5, y - r * 0.5), (x + r * 1.6, y + r * 0.5)], 0.55 * r)
            pts = [(x + (px - x) * 1.0, py) for px, py in D.girar(pts, giro, x, y)]
        pts = [(x + (px - x) * f, py) for px, py in pts]
        t.poligono(pts, C.misturar(c, FUNDOS["raro" if raro else "normal"][0], 0.35), alfa=0.9)


def pintar(peca, variante="normal"):
    raro = variante == "raro"
    t = Tela(f"bichos-{peca}-{variante}", peca, modo="cor", girar=True, amostras=64)
    rng = D.sorteio(101 if not raro else 202)
    W, H = t.W, t.H
    fundo = FUNDOS[variante]
    t.fundo(fundo[0])
    t.poligono([(-W, 0), (2 * W, 0), (2 * W, H), (-W, H)], P.lin((0, 0), (0, H), fundo[0], fundo[1]), malha=40.0, repetir=False)
    confete(t, rng, W, H, raro=raro)
    # fileiras de adesivos: duas caras por volta, fileiras alternadas, passo proporcional à circunferência da altura
    y = -0.2 * t.circ_em(0) / 2
    fila = 0
    colocados = []
    saco = []
    anterior_fila = [None, None]
    while y < H + 10:
        circ = t.circ_em(min(max(y, 0), H))
        cel = circ / 2.0
        escala = cel / 24.0 * 1.0
        atual = []
        for k in range(2):
            x = (k + (0.5 if fila % 2 else 0.0) + 0.25) * t.W / 2 + rng.uniform(-0.04, 0.04) * cel
            yy = y + rng.uniform(-0.06, 0.06) * cel
            # sorteia do "saco" (os 12 bichos embaralhados) sem repetir o vizinho de cima nem o da fila anterior
            for _ in range(30):
                if not saco:
                    saco = list(range(len(BICHOS)))
                    rng.shuffle(saco)
                cand = saco.pop()
                if cand not in anterior_fila and cand not in atual:
                    break
                saco.insert(0, cand)
            atual.append(cand)
            colocados.append((x, yy, escala * rng.uniform(0.95, 1.06), rng.uniform(-0.30, 0.30), BICHOS[cand]))
        anterior_fila = atual
        y += cel * 0.90
        fila += 1
    for (x, yy, esc, giro, b) in sorted(colocados, key=lambda c: c[1]):
        adesivo(t, b, x, yy, esc, giro, t.fh, rng, raro)
    return t


def catalogo(saida):
    """Prova dos 12 bichos, um ao lado do outro, sem adesivo nem mosaico (para olhar cada cara)."""
    t = Tela("catalogo-bichos", "antebraco", modo="cor", amostras=48)
    t.fundo(C.rgb("#3b2a6e"))
    for i, b in enumerate(BICHOS):
        col, lin = i % 3, i // 3
        x = (col + 0.5) * t.W / 3
        y = t.H - (lin + 0.5) * t.H / 4.2
        pose = D.Pose(x, y, 0.95, 0.0)
        b(Pincel(t, pose))
    t.renderizar(saida)


if __name__ == "__main__":
    a = argumentos()
    if a and a[0] == "catalogo":
        catalogo(a[1])
        sys.exit(0)
    peca = a[0] if a else "antebraco"
    variante = a[1] if len(a) > 1 else "normal"
    saida = a[2] if len(a) > 2 else None
    pecas = ("haste", "antebraco") if peca == "tudo" else (peca,)
    for pc in pecas:
        t = pintar(pc, variante)
        t.renderizar(saida or os.path.join(SAIDA, f"bicho-solto-{pc}" + ("" if variante == "normal" else "-raro") + ".png"))
