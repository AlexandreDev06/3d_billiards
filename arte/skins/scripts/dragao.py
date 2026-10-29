"""Dragão das Quinze: um dragão enroscado no taco, com escamas nas 15 cores das bolas, soprando fumaça de giz azul.

O corpo é um caminho só, em função de q (m da ponta): sai da cabeça, na haste, desce em hélice com ondulação de serpente, passa
pelo antebraço, some sob o punho (que o Pincel não pinta) e volta no cabo, onde a cauda afina. Cada peça pintada é um recorte
desse mesmo caminho, então o dragão é contínuo de uma peça à outra. A cabeça olha para a ponta do taco (o alto do desenho:
`Tela(girar=True)`) e a fumaça de giz sobe dela.

Convenção do desenho (o "espaço do papel"): x dá a volta, o alto aponta para a ponta do taco. O corpo é medido em mm reais
(a hélice anda `INCLINACAO` mm em volta para cada mm ao longo do taco) e a compressão do cone (`Tela.fh`) entra só na hora de
levar o ponto ao canvas.

`blender -b --factory-startup --python dragao.py -- <haste|antebraco|base|tudo> <normal|raro> <cor|emissivo> [saida.png]`
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cor as C  # noqa: E402
import desenho as D  # noqa: E402
import medidas as M  # noqa: E402
import noite as N  # noqa: E402
import pintura as P  # noqa: E402
from tela import Tela, argumentos  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SAIDA = os.path.join(RAIZ, "exportados")

Q_CAB = 0.400   # onde o pescoço sai da cabeça (m da ponta)
Q_RABO = 1.385  # ponta da cauda (a barbatana ainda passa 3 cm; a borracha começa em 1,428)
PASSO_MM = 0.5  # amostragem do caminho
INCLINACAO = 1.12  # mm em volta por mm ao longo do taco (ângulo da hélice, tan φ)
ONDA_MM = 3.4   # amplitude da ondulação (mm em volta)
ONDA_COMPRIMENTO = 0.070  # m

ESCURO = C.rgb("#0a0614")
MARFIM = C.rgb("#f2ead6")
VENTRE = C.rgb("#efe4c6")
VENTRE_SOMBRA = C.rgb("#cdbd96")

_BOLAS = {
    1: "#f7c81a", 2: "#2358e8", 3: "#e9301f", 4: "#6a2fb0", 5: "#f47b12", 6: "#12a050", 7: "#9a2640", 8: "#1d1d2c",
}
BOLA = {n: C.rgb(_BOLAS[(n - 1) % 8 + 1]) for n in range(1, 16)}
BRANCO_LISTRA = C.rgb("#f6f2e8")

PALETAS = {
    "normal": dict(
        ceu=[(0.00, "#0c0620"), (0.45, "#170a30"), (0.90, "#1e1040"), (1.20, "#26144c"), (1.45, "#2d1858")],
        nevoa="#6b4fc0",
        giz=("#f4faff", "#9cc6ff", "#4f8cf2", "#2a55c8"),
        olho=("#f6fcff", "#86dcff", "#1b8dff"),
        cabeca=("#ff6a4a", "#d7281e", "#6a0c1c"),
        ordem=tuple(range(1, 16)),
        semente=7,
        fase=0.55,
    ),
    "raro": dict(
        ceu=[(0.00, "#14050f"), (0.45, "#220a1a"), (0.90, "#2b0f22"), (1.20, "#34142c"), (1.45, "#3e1936")],
        nevoa="#b0457f",
        giz=("#fff4fb", "#ffc2e6", "#ff7cc4", "#c4308f"),
        olho=("#fffbe6", "#ffd24a", "#ff8a00"),
        cabeca=("#6f9bff", "#2c55e0", "#101f7a"),
        ordem=tuple(range(15, 0, -1)),
        semente=19,
        fase=0.18,
    ),
}


def circ_cone_mm(q):
    return 2 * math.pi * M.cone(q) * 1000.0


def largura_em(q):
    ancoras = [(0.40, 14.5), (0.47, 18.5), (0.60, 20.0), (1.00, 19.0), (1.20, 17.0), (1.28, 13.8), (1.34, 9.8), (1.375, 4.6), (1.385, 2.0)]
    if q <= ancoras[0][0]:
        return ancoras[0][1]
    for (q0, w0), (q1, w1) in zip(ancoras, ancoras[1:]):
        if q <= q1:
            f = (q - q0) / (q1 - q0)
            f = f * f * (3 - 2 * f)
            return w0 + (w1 - w0) * f
    return ancoras[-1][1]


def sombra_cor(c, k):
    """k < 1 escurece em direção ao quase-preto roxo; k > 1 clareia em direção ao branco."""
    if k >= 1.0:
        return C.claro(c, min(k - 1.0, 1.0))
    return C.misturar(c, ESCURO, min(1.0 - k, 1.0))


# ---- o caminho do corpo ----------------------------------------------------------------------------------------------

class Corpo:
    """A linha-mestra do dragão sobre o canvas `t`: posição (x, y), tangente T (no sentido cabeça → cauda), normal N do lado do dorso."""

    def __init__(self, t, fase):
        assert t.girar, "o dragão é desenhado de pé (alto = ponta do taco): use Tela(girar=True)"
        self.t = t
        n = int((Q_RABO - Q_CAB) * 1000.0 / PASSO_MM) + 1
        self.n = n
        self.q, self.th, self.w = [], [], []
        th_eixo = fase
        for i in range(n):
            q = Q_CAB + i * PASSO_MM / 1000.0
            c = circ_cone_mm(q)
            rampa = min(max((q - Q_CAB) / 0.085, 0.0), 1.0)
            rampa = rampa * rampa * (3 - 2 * rampa)
            onda = ONDA_MM * rampa * math.sin(2 * math.pi * (q - Q_CAB) / ONDA_COMPRIMENTO) / c
            onda *= 1.0 - 0.75 * min(max((q - 1.26) / 0.12, 0.0), 1.0)
            self.q.append(q)
            self.th.append(th_eixo + onda)
            self.w.append(largura_em(q))
            th_eixo += rampa * INCLINACAO * PASSO_MM / c
        # tangente em mm reais (x em volta, "cima" = rumo à ponta) e comprimento de arco
        self.tx, self.tc, self.s = [], [], []
        arco = 0.0
        for i in range(n):
            a, b = max(i - 1, 0), min(i + 1, n - 1)
            c = circ_cone_mm(self.q[i])
            dx = (self.th[b] - self.th[a]) * c
            dc = -(self.q[b] - self.q[a]) * 1000.0
            d = math.hypot(dx, dc) or 1.0
            self.tx.append(dx / d)
            self.tc.append(dc / d)
            if i:
                arco += math.hypot((self.th[i] - self.th[i - 1]) * c, PASSO_MM)
            self.s.append(arco)
        self.cx = [self.th[i] * t.circ_ref for i in range(n)]
        self.cy = [t.y_de_q(self.q[i]) for i in range(n)]
        self.f = [t.fh(self.cy[i]) for i in range(n)]
        self.total = self.s[-1]

    def indice(self, s):
        lo, hi = 0, self.n - 1
        while lo < hi:
            m = (lo + hi) // 2
            if self.s[m] < s:
                lo = m + 1
            else:
                hi = m
        return lo

    def normal(self, i):
        """Normal do lado do dorso (a esquerda de quem anda da cabeça para a cauda)."""
        return -self.tc[i], self.tx[i]

    def ponto(self, i, a=0.0, v=0.0):
        """Ponto do canvas a `a` mm do eixo (para o dorso, se positivo) e `v` mm à frente (rumo à cauda), a partir da amostra i."""
        nx, nc = self.normal(i)
        px = a * nx + v * self.tx[i]
        pc = a * nc + v * self.tc[i]
        return self.cx[i] + px * self.f[i], self.cy[i] + pc

    def visivel(self, i, folga=40.0):
        return -folga <= self.cy[i] <= self.t.H + folga

    def fita(self, i0, i1, a_lo, a_hi, passo=4):
        """Polígono do trecho [i0, i1] entre os deslocamentos a_lo(i) e a_hi(i)."""
        idx = list(range(i0, i1 + 1, passo))
        if idx[-1] != i1:
            idx.append(i1)
        alto = [self.ponto(i, a_hi(i)) for i in idx]
        baixo = [self.ponto(i, a_lo(i)) for i in idx]
        return alto + baixo[::-1]

    def trechos(self, comprimento=26.0, passo=PASSO_MM):
        """Pedaços do corpo (índices) de ~`comprimento` mm de arco, só os que aparecem neste canvas (com 2 amostras de sobra)."""
        saida = []
        i = 0
        while i < self.n - 1:
            j = self.indice(self.s[i] + comprimento)
            j = min(max(j, i + 2), self.n - 1)
            if any(self.visivel(k, 12.0) for k in (i, (i + j) // 2, j)):
                saida.append((max(i - 2, 0), min(j + 2, self.n - 1)))
            i = j
        return saida


# ---- escamas -----------------------------------------------------------------------------------------------------

def _hw_escudo(tt):
    if tt < 0.18:
        x = (0.18 - tt) / 0.22
        return 0.5 * math.sqrt(max(1.0 - x ** 2.2, 0.0))
    x = (tt - 0.18) / 0.82
    return 0.5 * max(1.0 - x ** 1.7, 0.0) ** 0.92


def escudo(L, Wd, t0=-0.04, t1=1.0, n=18, fechar=True):
    """Escama em escudo, no sistema local (u através, v ao longo, a ponta em v = L). Se não `fechar`, a faixa t0..t1."""
    ts = [t0 + (t1 - t0) * k / n for k in range(n + 1)]
    dir_ = [(_hw_escudo(tt) * Wd, tt * L) for tt in ts]
    esq = [(-_hw_escudo(tt) * Wd, tt * L) for tt in reversed(ts)]
    if fechar:
        return dir_ + esq[1:-1]
    return dir_ + esq


class Escama:
    __slots__ = ("s", "i", "a", "L", "Wd", "bola", "lado", "linha")

    def __init__(self, s, i, a, L, Wd, bola, lado, linha):
        self.s, self.i, self.a, self.L, self.Wd, self.bola, self.lado, self.linha = s, i, a, L, Wd, bola, lado, linha


def gerar_escamas(corpo, ordem, mistura):
    """Escamas ao longo do corpo: colunas de passo fixo, linhas escalonadas; a bola vem da coluna (e da linha, se `mistura`)."""
    regs = []
    s = 4.0
    k = 0
    while s < corpo.total - 1.5:
        i = corpo.indice(s)
        w = corpo.w[i]
        linhas = max(1, round(w / 6.2))
        L = 0.40 * w + 1.8
        passo = 0.60 * L
        Wd = (w / linhas) * 1.22
        for r in range(linhas):
            a = (r - (linhas - 1) / 2) * (w / linhas)
            sr = s + (0.5 * passo if r % 2 else 0.0)
            ir = corpo.indice(min(sr, corpo.total))
            bola = ordem[(k + mistura * r) % 15]
            regs.append(Escama(sr, ir, a, L, Wd, bola, a / (w / 2) if w > 0 else 0.0, r))
        s += passo
        k += 1
    return regs


def desenhar_escama(t, corpo, e, brilho_modo):
    i = e.i
    if not corpo.visivel(i, 20.0):
        return
    base = BOLA[e.bola]
    lado = e.lado
    luz = 1.06 - 0.50 * (abs(lado - 0.22) ** 1.7)
    luz = max(luz, 0.50)
    L, Wd = e.L, e.Wd

    def pt(u, v):
        return corpo.ponto(i, e.a + u, v - 0.45 * L)

    forma = [pt(u, v) for (u, v) in escudo(L, Wd)]
    t.poligono(D.expandir(forma, 0.36), ESCURO)
    c_borda = sombra_cor(base, luz * 0.66)
    c_meio = sombra_cor(base, luz * 1.04)
    t.poligono(forma, c_borda, centro=pt(-0.03 * Wd, 0.55 * L), cor_centro=c_meio)
    # sombra que a escama da frente joga na de trás
    zona = [pt(u, v) for (u, v) in escudo(L, Wd, t0=0.30, t1=0.78, n=8, fechar=False)]
    t.poligono(zona, (0.0, 0.0, 0.0), alfa=0.0, centro=pt(0.0, 0.40 * L), cor_centro=(0.02, 0.0, 0.06), alfa_centro=0.52)
    # nervura central da escama
    nerv = [pt(0.0, (0.34 + 0.60 * k / 6) * L) for k in range(7)]
    t.poligono(D.fita(nerv, [0.35, 0.8, 0.9, 0.8, 0.6, 0.4, 0.15]), C.claro(base, 0.55), alfa=0.30)
    if e.bola >= 9:
        faixa = [pt(u, v) for (u, v) in escudo(L, Wd, t0=0.55, t1=0.71, n=4, fechar=False)]
        t.poligono(faixa, sombra_cor(BRANCO_LISTRA, luz * 0.92), centro=pt(0.0, 0.63 * L), cor_centro=BRANCO_LISTRA)
    # fio de verniz no lado do dorso (nada de bolinha: um traço curto que acompanha a borda)
    fio = [pt((0.30 + 0.015 * k) * Wd, (0.50 + 0.30 * k / 4) * L) for k in range(5)]
    t.poligono(D.fita(fio, [0.2, 0.6, 0.7, 0.5, 0.15]), (1.0, 1.0, 1.0), alfa=0.35)


# ---- partes do corpo ------------------------------------------------------------------------------------------------

def espinhos(t, corpo, pal):
    s = 6.0
    while s < corpo.total - 2:
        i = corpo.indice(s)
        if corpo.visivel(i, 30.0):
            w = corpo.w[i]
            h = (3.4 + 0.24 * w) * (1.0 + 1.0 * math.exp(-s / 70.0))
            h *= 1.0 - 0.55 * min(max((corpo.q[i] - 1.26) / 0.12, 0.0), 1.0)
            bw = 0.62 * h + 1.2
            nx, nc = corpo.normal(i)
            tx, tc = corpo.tx[i], corpo.tc[i]
            f = corpo.f[i]
            ox, oc = nx * (w / 2 - 1.3), nc * (w / 2 - 1.3)

            def cv(e, o):
                return corpo.cx[i] + (ox + tx * e + nx * o) * f, corpo.cy[i] + oc + tc * e + nc * o

            # espinho de pontinha varrida para trás (rumo à cauda), lado da frente côncavo e o de trás convexo
            borda = [cv(-bw / 2, 0.0), cv(-bw * 0.10, 0.48 * h), cv(0.50 * h, 0.90 * h), cv(0.86 * h, 1.04 * h),
                     cv(0.52 * h, 0.52 * h), cv(bw * 0.62, 0.20 * h), cv(bw / 2, 0.0)]
            suave = D.suave(borda, False, 4)
            t.poligono(D.expandir(suave, 0.35), ESCURO)
            c_base = C.rgb("#4a2a80")
            t.poligono(suave, c_base, centro=cv(0.7 * h, 1.0 * h), cor_centro=C.claro(MARFIM, 0.2))
        s += 6.6


def pele_e_barriga(t, corpo):
    for (i0, i1) in corpo.trechos():
        t.poligono(D.expandir(corpo.fita(i0, i1, lambda i: -corpo.w[i] / 2 - 0.2, lambda i: corpo.w[i] / 2 + 0.2), 0.45), ESCURO)
        t.poligono(corpo.fita(i0, i1, lambda i: -corpo.w[i] / 2 - 0.2, lambda i: corpo.w[i] / 2 + 0.2), C.rgb("#1b0f30"))


def barriga(t, corpo):
    """Placas de barriga em creme, na borda de baixo (o lado oposto ao dorso), mais escuras e fundas que as escamas."""
    s = 3.0
    while s < corpo.total - 1:
        i = corpo.indice(s)
        j = corpo.indice(s + 2.6)
        if corpo.visivel(i, 12.0):
            lo = lambda k: -corpo.w[k] / 2 - 0.1
            hi = lambda k: -corpo.w[k] / 2 + min(0.12 * corpo.w[k] + 0.6, corpo.w[k] * 0.4)
            quad = corpo.fita(i, j, lo, hi, passo=max(j - i, 1))
            meio = corpo.ponto((i + j) // 2, -corpo.w[(i + j) // 2] / 2 + 0.3 * min(0.12 * corpo.w[i] + 0.6, corpo.w[i] * 0.4))
            t.poligono(D.expandir(quad, 0.22), C.rgb("#2a1a2a"))
            tom = C.rgb("#b9a883") if int(s / 2.6) % 2 == 0 else C.rgb("#a8976f")
            t.poligono(quad, C.escuro(tom, 0.35), centro=meio, cor_centro=C.claro(tom, 0.18))
        s += 2.6


def brilho_longo(t, corpo):
    """Um fio de luz por cima de tudo, no dorso: dá a sensação de tubo brilhante."""
    for (i0, i1) in corpo.trechos():
        def fade(i):
            return min(max(corpo.s[i] / 30.0, 0.0), 1.0) * min(max((corpo.total - corpo.s[i]) / 30.0, 0.0), 1.0)
        poly = corpo.fita(i0, i1, lambda i: 0.18 * corpo.w[i] - 0.9 * fade(i), lambda i: 0.18 * corpo.w[i] + 0.9 * fade(i))
        t.poligono(poly, (1.0, 1.0, 1.0), alfa=0.09)


def ponta_da_cauda(t, corpo, pal):
    """Uma barbatana de giz (cinco pétalas, como chama) na ponta da cauda."""
    i = corpo.n - 1
    if not corpo.visivel(i, 60.0):
        return
    base = corpo.ponto(i, 0.0, 0.0)
    giz = [C.rgb(h) for h in pal["giz"]]
    # (comprimento, meia-largura, ângulo): as de fora primeiro, a do meio por cima
    petalas = [(15.0, 3.4, 0.98), (15.0, 3.4, -0.98), (25.0, 4.6, 0.52), (25.0, 4.6, -0.52), (34.0, 5.8, 0.0)]
    for (L, W, ang) in petalas:
        c, sn = math.cos(ang), math.sin(ang)
        folha = D.suave([(0.0, 0.0), (0.28 * L, 0.95 * W), (0.66 * L, 0.78 * W), (L, 0.0), (0.66 * L, -0.78 * W), (0.28 * L, -0.95 * W)], True, 6)
        pts = [corpo.ponto(i, y * c + x * sn, x * c - y * sn) for (x, y) in folha]
        meio = corpo.ponto(i, 0.45 * L * sn, 0.45 * L * c)
        t.poligono(D.expandir(pts, 0.5), ESCURO)
        t.poligono(pts, C.misturar(giz[3], ESCURO, 0.1), centro=meio, cor_centro=giz[1])
        nervo = [corpo.ponto(i, 0.12 * L * k * sn / 6 * 6 / 6, (0.1 + 0.80 * k / 6) * L * c) for k in range(7)]
        t.poligono(D.fita(nervo, [0.2, 0.55, 0.6, 0.5, 0.4, 0.3, 0.1]), giz[0], alfa=0.7)


def corpo_completo(t, corpo, pal):
    regs = gerar_escamas(corpo, pal["ordem"], 5 if pal.get("mistura", True) else 0)
    espinhos(t, corpo, pal)
    pele_e_barriga(t, corpo)
    for e in sorted(regs, key=lambda e: (-e.s, -abs(e.lado))):
        desenhar_escama(t, corpo, e, None)
    barriga(t, corpo)
    brilho_longo(t, corpo)
    ponta_da_cauda(t, corpo, pal)


# ---- a cabeça --------------------------------------------------------------------------------------------------

def grad3(p0, p1, ca, cb, cc):
    """Degradê em três paradas ao longo de p0 → p1 (ca em p0, cb no meio, cc em p1)."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    l2 = dx * dx + dy * dy or 1.0

    def f(x, y):
        u = min(max(((x - p0[0]) * dx + (y - p0[1]) * dy) / l2, 0.0), 1.0)
        return C.misturar(ca, cb, u * 2) if u < 0.5 else C.misturar(cb, cc, (u - 0.5) * 2)
    return f


class Cabeca:
    """Desenho da cabeça no sistema "clássico": olhando para +x, dorso para +y, o pescoço na origem. `p` leva ao canvas
    (+x clássico vira o alto, rumo à ponta; +y clássico vira o dorso do corpo)."""

    def __init__(self, t, corpo, pal, emissivo, escala=1.0):
        self.t, self.pal, self.em, self.k = t, pal, emissivo, escala
        self.cx0, self.cy0, self.f0 = corpo.cx[0], corpo.cy[0], corpo.f[0]
        self.cab = [C.rgb(h) for h in pal["cabeca"]]
        self.olho = [C.rgb(h) for h in pal["olho"]]
        self.giz = [C.rgb(h) for h in pal["giz"]]

    def p(self, x, y):
        return (self.cx0 + y * self.k * self.f0, self.cy0 + x * self.k)

    def ps(self, lista):
        return [self.p(x, y) for x, y in lista]

    def pele(self, y_alto, y_baixo):
        return grad3(self.p(0, y_alto), self.p(0, y_baixo), self.cab[0], self.cab[1], self.cab[2])

    def chifre(self, base, ctrl1, ctrl2, ponta, larg, cores, aneis=4):
        t = self.t
        eixo = D.bezier(base, ctrl1, ctrl2, ponta, 22)
        larguras = [larg * (1.0 - (k / 22.0) ** 1.15) + 0.35 for k in range(23)]
        poly = self.ps(D.fita(eixo, larguras))
        t.poligono(D.expandir(poly, 0.38), ESCURO)
        c0, c1 = cores
        t.poligono(poly, grad3(self.p(*eixo[0]), self.p(*eixo[-1]), c0, C.misturar(c0, c1, 0.55), c1), malha=1.0)
        for k in range(1, aneis + 1):
            j = int(22 * (0.14 + 0.17 * k))
            if j >= 22:
                continue
            a, b = eixo[j], eixo[min(j + 1, 22)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            d = math.hypot(dx, dy) or 1.0
            nx, ny = -dy / d, dx / d
            w = larguras[j] * 0.5
            seg = [(a[0] - nx * w, a[1] - ny * w), (a[0], a[1] + 0.25), (a[0] + nx * w, a[1] + ny * w)]
            t.poligono(D.fita(self.ps(seg), 0.55), C.escuro(c0, 0.6), alfa=0.55)
        # fio de luz no dorso do chifre
        luzf = [eixo[j] for j in range(2, 17)]
        t.poligono(D.fita(self.ps(luzf), [0.2 + 0.9 * math.sin(math.pi * (k + 1) / 16) for k in range(15)]), (1, 1, 1), alfa=0.35)

    def bigode(self, pontos, larg, cor_):
        eixo = D.suave(pontos, False, 8)
        n = len(eixo)
        larguras = [larg * (1.0 - k / (n - 1)) ** 0.8 + 0.12 for k in range(n)]
        poly = self.ps(D.fita(eixo, larguras))
        self.t.poligono(D.expandir(poly, 0.25), ESCURO, alfa=0.8)
        self.t.poligono(poly, cor_, alfa=0.94)

    def dentes(self, linha, posicoes, altura, sentido, cor_):
        """Presas na linha (lista de pontos clássicos): em cada posição (0 a 1) um triângulo para o lado `sentido` (+1 esquerda do traço)."""
        n = len(linha)
        for (u, alt) in zip(posicoes, altura):
            j = min(int(u * (n - 1)), n - 2)
            a, b = linha[j], linha[j + 1]
            dx, dy = b[0] - a[0], b[1] - a[1]
            d = math.hypot(dx, dy) or 1.0
            tx, ty = dx / d, dy / d
            nx, ny = -ty * sentido, tx * sentido
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            tri = [(m[0] - tx * 1.5, m[1] - ty * 1.5), (m[0] + nx * alt + tx * 0.3, m[1] + ny * alt + ty * 0.3), (m[0] + tx * 1.5, m[1] + ty * 1.5)]
            pts = self.ps(tri)
            self.t.poligono(D.expandir(pts, 0.25), ESCURO)
            self.t.poligono(pts, C.misturar(cor_, C.rgb("#b9a98a"), 0.4), centro=self.p(*tri[1]), cor_centro=C.claro(cor_, 0.3))

    def mini_escama(self, x, y, tam, cor_, alfa=0.55):
        pts = [(x - v * tam * 0.9, y + u * tam * 0.95) for (u, v) in escudo(1.0, 1.0, n=10)]
        pts = self.ps(pts)
        self.t.poligono(D.expandir(pts, 0.2), self.cab[2], alfa=alfa * 0.8)
        self.t.poligono(pts, cor_, alfa=alfa)

    def desenhar_atras(self):
        t = self.t
        # chifre de trás e leque da bochecha ficam por baixo do crânio
        self.chifre((9.0, 4.0), (3.0, 11.0), (-5.0, 13.0), (-14.0, 11.0), 4.0, (C.rgb("#6e5a48"), C.rgb("#cdbf9f")), aneis=3)
        base_ossos = C.misturar(self.giz[1], C.rgb("#3b2a78"), 0.35)
        for ponta in ((-15.0, -13.5), (-18.0, -7.0), (-12.0, -19.0)):
            leque = D.suave([(-1.0, -6.5), (ponta[0] * 0.55, ponta[1] * 0.45 - 1.0), ponta, (ponta[0] * 0.55 + 3.0, ponta[1] * 0.45 - 6.0), (4.0, -10.0)], True, 4)
            pts = self.ps(leque)
            t.poligono(D.expandir(pts, 0.35), ESCURO)
            t.poligono(pts, base_ossos, centro=self.p(1.0, -8.0), cor_centro=self.giz[0], alfa=0.92, alfa_centro=0.95)
        self.bigode([(37.0, 4.5), (31.0, 13.0), (22.0, 11.5), (14.0, 17.5), (5.0, 15.0), (-5.0, 22.0), (-16.0, 20.0)], 1.7, C.claro(self.giz[1], 0.45))
        self.bigode([(38.0, -19.0), (30.0, -25.0), (21.0, -22.5), (13.0, -29.0), (4.0, -27.0)], 1.5, C.claro(self.giz[1], 0.35))

    def desenhar_boca(self):
        t = self.t
        labio_sup = [(5.0, -4.2), (12.0, -3.0), (20.0, -2.2), (28.0, -1.6), (36.0, -0.8), (41.0, 0.5)]
        borda_inf = [(5.0, -4.2), (14.0, -5.4), (24.0, -8.4), (33.0, -12.5), (39.0, -17.5)]
        interior = self.ps(labio_sup + borda_inf[::-1][:-1] + [(41.0, -11.0)])
        escuro = C.rgb("#20061c")
        t.poligono(D.expandir(interior, 0.4), ESCURO)
        t.poligono(interior, escuro, centro=self.p(36.0, -7.5), cor_centro=C.misturar(self.giz[2], C.rgb("#ffffff"), 0.15),
                   brilho=self.giz[1] if self.em else None, brilho_centro=self.giz[0] if self.em else None)
        # língua
        lingua = D.fita([(8.0, -6.2), (17.0, -7.0), (25.0, -9.4), (32.0, -13.2)], [1.2, 3.2, 3.6, 1.6])
        t.poligono(self.ps(lingua), C.rgb("#c8405e"), alfa=0.85)

    def desenhar_mandibula(self):
        t = self.t
        contorno = D.suave([(5.0, -4.2), (14.0, -5.4), (24.0, -8.4), (33.0, -12.5), (39.0, -17.5), (40.5, -19.6), (36.5, -20.4), (30.0, -18.4),
                            (22.0, -15.0), (14.0, -12.4), (6.0, -11.6), (-2.0, -10.0), (-6.0, -6.5)], True, 5)
        pts = self.ps(contorno)
        t.poligono(D.expandir(pts, 0.5), ESCURO)
        t.poligono(pts, self.pele(-3.0, -20.0), malha=1.0)
        # a borda de cima da mandíbula (a linha da boca) clareia
        linha = D.suave([(5.0, -4.2), (14.0, -5.4), (24.0, -8.4), (33.0, -12.5), (39.0, -17.5)], False, 6)
        t.poligono(D.fita(self.ps(linha), 0.9), C.claro(self.cab[0], 0.15), alfa=0.8)
        for (x, y, tam) in ((4, -8.5, 3.2), (11, -9.0, 3.0), (18, -11.0, 2.8), (25, -14.0, 2.5), (31, -16.5, 2.2)):
            self.mini_escama(x, y, tam, C.claro(self.cab[1], 0.12))
        self.dentes(linha, [0.22, 0.38, 0.55, 0.72, 0.88], [2.0, 2.6, 3.4, 3.0, 2.2], 1, MARFIM)

    def desenhar_cranio(self):
        t = self.t
        contorno = D.suave([(-4.0, 7.5), (6.0, 9.2), (13.0, 8.8), (18.0, 8.4), (26.0, 6.6), (33.0, 5.2), (39.0, 4.8), (42.0, 2.8), (41.5, 0.6),
                            (36.0, -0.8), (28.0, -1.6), (20.0, -2.2), (12.0, -3.0), (5.0, -4.2), (-2.0, -6.0), (-6.0, -2.0)], True, 5)
        pts = self.ps(contorno)
        t.poligono(D.expandir(pts, 0.5), ESCURO)
        t.poligono(pts, self.pele(9.0, -4.0), malha=1.0)
        # fio de luz no focinho
        crista = D.suave([(6.0, 8.2), (14.0, 7.8), (24.0, 5.9), (34.0, 4.4), (40.0, 3.8)], False, 6)
        t.poligono(D.fita(self.ps(crista), [0.2, 0.9, 1.0, 0.8, 0.2]), C.claro(self.cab[0], 0.45), alfa=0.55)
        # dentes de cima
        labio = [(5.0, -4.2), (12.0, -3.0), (20.0, -2.2), (28.0, -1.6), (36.0, -0.8), (41.0, 0.5)]
        self.dentes(labio, [0.12, 0.30, 0.50, 0.70, 0.88], [2.2, 2.8, 3.4, 4.8, 2.6], -1, MARFIM)
        # escamas pequenas no crânio e na bochecha
        for (x, y, tam) in ((-1, 4.0, 3.4), (4, 5.6, 3.2), (0, -1.0, 3.2), (6, 1.6, 3.0), (9, -0.8, 2.8), (12, 4.8, 2.8), (16, 2.2, 2.6),
                            (20, 5.6, 2.4), (22, 0.4, 2.4), (27, 3.2, 2.2), (31, 1.2, 2.0), (-2, -3.2, 3.0), (5, -1.8, 2.6)):
            self.mini_escama(x, y, tam, C.claro(self.cab[1], 0.16))
        # arcada
        sobrancelha = D.suave([(8.0, 7.3), (14.0, 7.6), (19.0, 6.6), (22.0, 4.8)], False, 6)
        t.poligono(D.fita(self.ps(sobrancelha), [1.0, 2.4, 2.4, 1.2]), C.escuro(self.cab[2], 0.25))
        t.poligono(D.fita(self.ps(sobrancelha[:-4]), 0.6), C.claro(self.cab[0], 0.2), alfa=0.6)
        # ventas
        narina = D.elipse(0, 0, 1.3, 0.85, rot=0.5, n=10)
        t.poligono(self.ps([(39.5 + x, 2.5 + y) for x, y in narina]), ESCURO)
        # olho
        olho = D.suave([(10.8, 4.9), (14.0, 6.0), (18.4, 4.5), (14.6, 2.6)], True, 6)
        po = self.ps(olho)
        t.poligono(D.expandir(po, 0.5), ESCURO)
        halo_centro = self.p(14.5, 4.3)
        P.luz(t, halo_centro, 6.5, self.olho[2], forca=0.5, brilho=self.olho[2] if self.em else None, gama=2.0, malha=1.0)
        t.poligono(po, self.olho[2], centro=halo_centro, cor_centro=self.olho[0], brilho=self.olho[1] if self.em else None, brilho_centro=self.olho[0] if self.em else None)
        pupila = D.elipse(14.6, 4.3, 0.55, 1.7, rot=0.3, n=10)
        t.poligono(self.ps(pupila), ESCURO)
        t.poligono(self.ps(D.elipse(13.6, 5.1, 0.45, 0.4, n=6)), (1, 1, 1), alfa=0.9)

    def desenhar_frente(self):
        self.chifre((7.0, 7.4), (-2.0, 14.0), (-12.0, 18.0), (-25.0, 16.0), 5.8, (C.rgb("#8f7658"), C.rgb("#fbf3dd")), aneis=4)


# ---- a fumaça de giz ----------------------------------------------------------------------------------------------

COMPRIMENTO_FUMACA = 270.0


class Fumaca:
    """A baforada azul de giz: nuvens macias empilhadas (do escuro e largo ao claro e miúdo), fiapos em espiral e pedacinhos de giz."""

    def __init__(self, t, cab, pal, emissivo, semente):
        self.t, self.cab, self.em = t, cab, emissivo
        self.giz = [C.rgb(h) for h in pal["giz"]]
        self.x0, self.y0 = cab.p(41.0, -8.0)
        self.rng = D.sorteio(semente)
        self.fase = 0.6 + 0.8 * self.rng.random()

    def eixo(self, tau):
        a = 3.0 + 14.0 * tau
        y = self.y0 + tau * COMPRIMENTO_FUMACA
        return self.x0 + a * math.sin(2 * math.pi * 1.45 * tau + self.fase) * self.t.fh(y), y

    def raio_pluma(self, tau):
        return 5.0 + 16.0 * tau

    def nuvens(self, camadas):
        rng, t = self.rng, self.t
        tipos = [
            (46, (10.0, 22.0), 3, 0.28, 1.3, 2.8),
            (150, (5.0, 14.0), 2, 0.32, 1.4, 1.8),
            (120, (3.0, 8.5), 1, 0.38, 1.5, 1.1),
            (64, (1.8, 5.0), 0, 0.52, 1.7, 0.8),
        ]
        blobs = []
        for camada, (n, (r0, r1), ci, forca, gama, malha) in enumerate(tipos):
            if camada not in camadas:
                continue
            for _ in range(n):
                tau = rng.random() ** 1.3 * (0.97 if camada < 2 else 0.8)
                ex, ey = self.eixo(tau)
                lado = rng.gauss(0.0, 0.42) * self.raio_pluma(tau)
                ex += lado * t.fh(ey)
                ey += rng.gauss(0.0, 2.2)
                r = (r0 + (r1 - r0) * rng.random()) * (0.78 + 0.9 * tau)
                f = forca * max(1.0 - tau, 0.0) ** 0.9
                blobs.append((camada, -tau, ex, ey, r, f, gama, malha, ci))
        for (camada, _, ex, ey, r, f, gama, malha, ci) in sorted(blobs):
            c = self.giz[ci]
            b = C.escuro(c, 0.45) if self.em else None
            P.luz(t, (ex, ey), r, c, forca=f, brilho=b, gama=gama, malha=malha)

    def fiapos(self, quantos=6):
        rng, t = self.rng, self.t
        for k in range(quantos):
            tau0 = 0.04 + 0.5 * rng.random()
            comp = 0.16 + 0.18 * rng.random()
            amp = 6.0 + 9.0 * rng.random()
            ph = rng.uniform(0, 6.28)
            lado = rng.choice((-1.0, 1.0))
            n = 110
            for j in range(n):
                u = j / (n - 1)
                tau = tau0 + comp * u
                ex, ey = self.eixo(tau)
                off = lado * amp * math.sin(2 * math.pi * 1.1 * u + ph) * (0.35 + u)
                forma = math.sin(math.pi * u) ** 0.8
                c = self.giz[0] if k % 2 == 0 else self.giz[1]
                P.luz(t, (ex + off * t.fh(ey), ey), 0.9 + 1.7 * forma, c, forca=0.42 * forma + 0.04, brilho=C.escuro(c, 0.5) if self.em else None, gama=1.1, malha=0.7)

    def pedacinhos(self, quantos=5):
        rng, t = self.rng, self.t
        for k in range(quantos):
            tau = 0.20 + 0.55 * rng.random()
            ex, ey = self.eixo(tau)
            ex += rng.uniform(-9.0, 9.0) * t.fh(ey)
            lado = rng.uniform(2.0, 3.4)
            ang = rng.uniform(0, math.pi / 2)
            quad = D.girar([(-lado / 2, -lado / 2), (lado / 2, -lado / 2), (lado / 2, lado / 2), (-lado / 2, lado / 2)], ang, 0, 0)
            quad = [(ex + x * t.fh(ey), ey + y) for x, y in quad]
            t.poligono(D.expandir(quad, 0.28), C.rgb("#0b1d6a"), brilho=C.escuro(self.giz[3], 0.5) if self.em else None)
            t.poligono(quad, self.giz[3], centro=(ex, ey), cor_centro=self.giz[1], brilho=C.escuro(self.giz[3], 0.5) if self.em else None, brilho_centro=C.escuro(self.giz[1], 0.5) if self.em else None)
            t.poligono([(ex + 0.2 * lado * math.cos(a) * t.fh(ey), ey + 0.2 * lado * math.sin(a)) for a in [i * math.pi / 4 for i in range(8)]], C.escuro(self.giz[3], 0.25), alfa=0.8)

    def faiscas(self, quantos=26):
        W = self.t.W

        def perto_da_cabeca(x, y):
            dx = abs(((x - self.x0 + W / 2) % W) - W / 2)
            return dx < 20.0 and self.y0 - 62.0 < y < self.y0 + 8.0

        N.estrelas(self.t, self.rng, quantos, faixa_y=(self.y0 - 30, self.y0 + COMPRIMENTO_FUMACA + 90), brilho_on=True, brilho_todas=True, evitar=perto_da_cabeca,
                   cores=("#e6f1ff", "#b9d6ff", "#ffffff"))

    def sopro_da_boca(self):
        """Nuvens miúdas e claras na saída da boca: escondem a emenda entre o brilho de dentro e a fumaça de fora."""
        rng, t = self.rng, self.t
        for k in range(16):
            ey = self.y0 + rng.uniform(-6.0, 7.0)
            ex = self.x0 + rng.uniform(-5.0, 5.0) * t.fh(ey)
            r = rng.uniform(3.5, 8.0)
            c = self.giz[1] if k % 3 else self.giz[0]
            P.luz(t, (ex, ey), r, c, forca=0.55, brilho=C.escuro(c, 0.4) if self.em else None, gama=1.3, malha=0.8)


# ---- a tela de cada peça ------------------------------------------------------------------------------------------

def fundo_da_peca(t, pal):
    mat = N.material_ceu(t, intensidade_nuvem=0.16, escala_nuvem=11.0, rampa_q=pal["ceu"], cor_nevoa_hex=pal["nevoa"])
    t.plano_shader(mat, z=0.0005)


def pintar(peca, variante="normal", modo="cor", amostras=64, ppm=None):
    pal = PALETAS[variante]
    t = Tela(f"dragao-{peca}", peca, modo=modo, amostras=amostras, ppm=ppm, girar=True)
    em = modo == "emissivo"
    if em:
        t.fundo((0, 0, 0))
    else:
        fundo_da_peca(t, pal)
    rng = D.sorteio(pal["semente"] + len(peca))
    N.estrelas(t, rng, {"haste": 90, "antebraco": 46, "base": 30}[peca], brilho_on=False, cores=("#d9e6ff", "#b9a8ff", "#ffe9f4"))
    corpo = Corpo(t, pal["fase"])
    cab = Cabeca(t, corpo, pal, em)
    fumaca = Fumaca(t, cab, pal, em, pal["semente"]) if peca == "haste" else None
    if fumaca:
        fumaca.nuvens({0, 1})
    corpo_completo(t, corpo, pal)
    if peca == "haste":
        cab.desenhar_atras()
        cab.desenhar_boca()
        cab.desenhar_mandibula()
        cab.desenhar_cranio()
        cab.desenhar_frente()
        fumaca.nuvens({2, 3})
        fumaca.sopro_da_boca()
        fumaca.fiapos()
        fumaca.pedacinhos()
        fumaca.faiscas()
    return t


if __name__ == "__main__":
    a = argumentos()
    peca = a[0] if a else "haste"
    variante = a[1] if len(a) > 1 else "normal"
    modo = a[2] if len(a) > 2 else "cor"
    saida = a[3] if len(a) > 3 else None
    pecas = ("haste", "antebraco", "base") if peca == "tudo" else (peca,)
    for pc in pecas:
        t = pintar(pc, variante, modo)
        nome = f"dragao-{pc}" + ("" if variante == "normal" else "-raro") + ("" if modo == "cor" else "-emissivo") + ".png"
        t.renderizar(saida or os.path.join(SAIDA, nome))
