"""Geometria 2D para desenhar (Python puro, sem Blender): elipses, curvas suaves, contornos, fitas e transformações.

Os pontos são (x, y) em mm no canvas. Os desenhos de bichos e de coruja são feitos numa caixa unitária e levados ao canvas
por `Pose` (posição, tamanho, giro, espelho e a compressão horizontal que compensa o cone do taco).
"""
import math
import random


def elipse(cx, cy, rx, ry=None, rot=0.0, n=None, a0=0.0, a1=2 * math.pi):
    """Elipse (ou arco, se a1 - a0 < 2π) como lista de pontos."""
    ry = rx if ry is None else ry
    if n is None:
        n = max(16, int(6 * math.sqrt(max(rx, ry) * 4)) * 2)
    c, s = math.cos(rot), math.sin(rot)
    pts = []
    passos = n if abs((a1 - a0) - 2 * math.pi) < 1e-9 else n + 1
    for i in range(passos):
        a = a0 + (a1 - a0) * i / n
        x, y = rx * math.cos(a), ry * math.sin(a)
        pts.append((cx + x * c - y * s, cy + x * s + y * c))
    return pts


def bezier(p0, p1, p2, p3, n=16):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((
            u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
            u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
        ))
    return pts


def suave(pts, fechado=True, n=8, tensao=0.5):
    """Curva de Catmull-Rom passando por todos os `pts`. Fechada, devolve um polígono sem o ponto repetido."""
    m = len(pts)
    saida = []
    segmentos = m if fechado else m - 1
    for i in range(segmentos):
        if fechado:
            p0, p1, p2, p3 = pts[(i - 1) % m], pts[i], pts[(i + 1) % m], pts[(i + 2) % m]
        else:
            p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, m - 1)]
        t1 = ((p2[0] - p0[0]) * tensao, (p2[1] - p0[1]) * tensao)
        t2 = ((p3[0] - p1[0]) * tensao, (p3[1] - p1[1]) * tensao)
        for k in range(n):
            t = k / n
            h00, h10, h01, h11 = 2 * t ** 3 - 3 * t ** 2 + 1, t ** 3 - 2 * t ** 2 + t, -2 * t ** 3 + 3 * t ** 2, t ** 3 - t ** 2
            saida.append((h00 * p1[0] + h10 * t1[0] + h01 * p2[0] + h11 * t2[0], h00 * p1[1] + h10 * t1[1] + h01 * p2[1] + h11 * t2[1]))
    if not fechado:
        saida.append(pts[-1])
    return saida


def normais(pts, fechado=True):
    """Normal unitária (para a esquerda do sentido do traço) em cada ponto."""
    m = len(pts)
    saida = []
    for i in range(m):
        a = pts[(i - 1) % m] if fechado or i > 0 else pts[0]
        b = pts[(i + 1) % m] if fechado or i < m - 1 else pts[-1]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1.0
        saida.append((-dy / d, dx / d))
    return saida


def area(pts):
    return 0.5 * sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))


def expandir(pts, d):
    """Contorno `d` mm para fora (polígono suave; os cantos vivos não passam de 2·d)."""
    sentido = 1 if area(pts) > 0 else -1  # anti-horário: a normal da esquerda aponta para dentro
    ns = normais(pts)
    return [(p[0] - sentido * n[0] * d, p[1] - sentido * n[1] * d) for p, n in zip(pts, ns)]


def fita(centro, larguras, fechado=False):
    """Fita em volta de uma linha-mestra: `larguras` (um número ou uma lista, a largura total em cada ponto). Devolve o polígono."""
    m = len(centro)
    if not isinstance(larguras, (list, tuple)):
        larguras = [larguras] * m
    elif len(larguras) != m:
        # as larguras são "chaves" ao longo da linha-mestra: reamostra por interpolação linear
        k = len(larguras)
        nova = []
        for i in range(m):
            f = (i / (m - 1)) * (k - 1) if m > 1 else 0.0
            j = min(int(f), k - 2) if k > 1 else 0
            tt = f - j
            nova.append(larguras[j] + (larguras[min(j + 1, k - 1)] - larguras[j]) * tt)
        larguras = nova
    ns = normais(centro, fechado)
    esq = [(p[0] + n[0] * w / 2, p[1] + n[1] * w / 2) for p, n, w in zip(centro, ns, larguras)]
    dir_ = [(p[0] - n[0] * w / 2, p[1] - n[1] * w / 2) for p, n, w in zip(centro, ns, larguras)]
    return esq + dir_[::-1]


def girar(pts, ang, cx=0.0, cy=0.0):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in pts]


def mover(pts, dx, dy):
    return [(x + dx, y + dy) for x, y in pts]


def escalar(pts, sx, sy=None, cx=0.0, cy=0.0):
    sy = sx if sy is None else sy
    return [(cx + (x - cx) * sx, cy + (y - cy) * sy) for x, y in pts]


def espelhar_x(pts, cx=0.0):
    return [(2 * cx - x, y) for x, y in pts][::-1]


def centro(pts):
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def caixa(pts):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def dentro(pt, poligono):
    """Ponto dentro do polígono (regra par-ímpar)."""
    x, y = pt
    r = False
    j = len(poligono) - 1
    for i in range(len(poligono)):
        xi, yi = poligono[i]
        xj, yj = poligono[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            r = not r
        j = i
    return r


class Pose:
    """Leva coordenadas locais (mm) ao canvas: gira, escala, espelha, translada e comprime na horizontal (`fh`).

    `fh` é a compensação do cone: no taco, u dá a volta numa circunferência que cresce do bico ao cabo, então o desenho
    em mm reais pede x·(C_ref / C(q)) no canvas. Pode ser um número (formas pequenas) ou uma função da altura y do canvas
    (figuras grandes): a figura então acompanha o cone ponto a ponto. A compressão é em volta do centro (`x`) da pose.
    """

    def __init__(self, x=0.0, y=0.0, escala=1.0, giro=0.0, espelho=False, fh=1.0):
        self.x, self.y, self.escala, self.giro, self.espelho, self.fh = x, y, escala, giro, espelho, fh

    def _um(self, px, py):
        c, s = math.cos(self.giro), math.sin(self.giro)
        px *= -self.escala if self.espelho else self.escala
        py *= self.escala
        dx, dy = px * c - py * s, px * s + py * c
        yy = self.y + dy
        f = self.fh(yy) if callable(self.fh) else self.fh
        return (self.x + dx * f, yy)

    def __call__(self, pts):
        saida = [self._um(px, py) for px, py in pts]
        if self.espelho:
            saida.reverse()
        return saida

    def ponto(self, p):
        return self._um(p[0], p[1])


def sorteio(semente):
    return random.Random(semente)
