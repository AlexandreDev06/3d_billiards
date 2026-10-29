"""Dragon Lore: o nó celta. Duas fitas (uma marrom, uma de ouro) que se trançam ao longo de um caminho, passando uma por cima da outra
em cada cruzamento: o corpo e a cauda do dragão. O ouro vai para o mapa de metal.

Tudo no papel (x mm da linha do meio, s mm da ponta). `Entrelacado` guarda as funções do caminho (x do centro, amplitude da trança,
largura de cada fita) e sabe desenhar a trança inteira, com a sombra que a fita de cima joga na de baixo.
"""
import math

import cor as C
import gravura as G

PASSO = 0.45


def suave01(f):
    f = min(max(f, 0.0), 1.0)
    return f * f * (3 - 2 * f)


class Perfis:
    """Perfis de cor da fita, da borda esquerda (-1) à direita (1): sombra nas bordas, luz no meio, um pouco mais clara à esquerda."""

    def __init__(self, pal):
        m = pal["fita_marrom"]
        o = pal["ouro"]
        self.pal = pal
        self.marrom = self._perfil(m["borda"], m["medio"], m["luz"])
        self.ouro = self._perfil(o["sombra"], o["medio"], o["luz"])

    @staticmethod
    def _perfil(borda, medio, luz):
        def f(l):
            a = abs(l)
            v = 1.0 - a
            esq = 0.12 * (-l) * (1.0 - a * 0.5)
            if a > 0.55:
                c = G.mistura(medio, borda, (a - 0.55) / 0.45)
            else:
                c = G.mistura(luz, medio, a / 0.55)
            return G.mistura(c, (1.0, 1.0, 0.92), max(esq, 0.0)) if esq > 0 else G.mistura(c, (0, 0, 0), -esq * 0.8)
        return f


class Fita:
    """Uma fita com sua cor: o contorno escuro, o miolo com volume e um fio central."""

    def __init__(self, cx, tipo):
        self.cx = cx
        self.tipo = tipo
        pal = cx.pal
        self.tinta = pal["tinta"]
        self.perfil = cx.perfis.ouro if tipo == "ouro" else cx.perfis.marrom
        self.fio = pal["fio_marrom"] if tipo == "ouro" else pal["ouro"]["luz"]

    def desenhar(self, pts, larg):
        pa = self.cx.pa
        n = len(pts)
        if n < 2:
            return
        if isinstance(larg, (list, tuple)):
            ws = list(larg)
        else:
            ws = [larg(i / (n - 1)) if callable(larg) else larg for i in range(n)]
        contorno = [w + 0.95 for w in ws]
        pa.fita_perfil(pts, contorno, lambda l: self.tinta)
        if self.tipo == "ouro":
            pa.fita_perfil(pts, ws, self.perfil, me=lambda l: 1.0 - 0.45 * abs(l) ** 3, laterais=7)
        else:
            pa.fita_perfil(pts, ws, self.perfil, laterais=7)
        # fio central (o "cordão" do nó celta)
        fw = [w * 0.16 for w in ws]
        pa.fita_perfil(pts, fw, lambda l: self.fio, me=(lambda l: 0.8) if self.tipo != "ouro" else None, alfa=0.9)


class Entrelacado:
    def __init__(self, cx, xc, a, ww, lam, s0, s_ini, s_fim):
        self.cx, self.xc, self.a, self.ww, self.lam, self.s0 = cx, xc, a, ww, lam, s0
        self.s_ini, self.s_fim = s_ini, s_fim
        self.marrom = Fita(cx, "marrom")
        self.ouro = Fita(cx, "ouro")

    def x(self, s, fita):
        """x da fita `fita` (+1: a primeira, -1: a segunda) em s."""
        return self.xc(s) + fita * self.a(s) * math.sin(2 * math.pi * (s - self.s0) / self.lam)

    def pontos(self, fita, s_a, s_b):
        n = max(int((s_b - s_a) / PASSO), 2)
        return [(self.x(s_a + (s_b - s_a) * i / n, fita), s_a + (s_b - s_a) * i / n) for i in range(n + 1)]

    def larg(self, s_a, s_b):
        return lambda u: self.ww(s_a + (s_b - s_a) * u)

    def trecho(self, fita, s_a, s_b):
        pts = self.pontos(fita, s_a, s_b)
        pf = self.marrom if fita > 0 else self.ouro
        pf.desenhar(pts, self.larg(s_a, s_b))
        return pts

    def cruzamentos(self):
        """(s, quem fica por cima) em cada nó da trança: alterna a cada cruzamento."""
        saida = []
        k0 = math.ceil((self.s_ini - self.s0) / (self.lam / 2.0))
        k = k0
        while self.s0 + k * self.lam / 2.0 <= self.s_fim:
            s = self.s0 + k * self.lam / 2.0
            if self.a(s) > self.ww(s) * 0.45:
                saida.append((s, 1 if k % 2 == 0 else -1))
            k += 1
        return saida

    def desenhar(self):
        pa = self.cx.pa
        a, b = max(self.s_ini, pa.s0 - 12.0), min(self.s_fim, pa.s1 + 12.0)
        if b - a < 2.0:
            return
        # as duas fitas inteiras (a de ouro por cima)...
        self.trecho(1, a, b)
        self.trecho(-1, a, b)
        # ...e, em cada nó em que a marrom deve ficar por cima, ela é redesenhada no trecho do cruzamento, com a sombra dela sobre a outra
        for (s, por_cima) in self.cruzamentos():
            if s < a - 10.0 or s > b + 10.0:
                continue
            amp = max(self.a(s), 0.5)
            d = self.ww(s) * self.lam / (4 * math.pi * amp) + self.ww(s) * 0.95 + 0.8
            lo, hi = max(s - d, a), min(s + d, b)
            if hi - lo < 1.0:
                continue
            baixo = -por_cima
            # sombra da de cima sobre a de baixo (só na cor)
            pts_b = self.pontos(baixo, max(s - d * 0.8, a), min(s + d * 0.8, b))
            if self.cx.pa.canal == "cor":
                self.cx.pa.fita_perfil(pts_b, [self.ww(p[1]) for p in pts_b], lambda l: (0.0, 0.0, 0.0), alfa=lambda u: 0.42 * math.sin(math.pi * u) ** 1.4)
            self.trecho(por_cima, lo, hi)


# ---- a trança sobre um caminho qualquer ------------------------------------------------------------------------------------------

class Tranca:
    """Duas fitas (marrom e ouro) que se trançam em volta de uma linha-mestra qualquer (`centro`, polilinha do papel).

    `a(L)` é quanto cada fita se afasta da linha, `ww(L)` a largura da fita e `lam` o comprimento de uma volta inteira (todos em mm de
    arco `L` andados desde o começo da linha). O caminho pode serpentear ou se enrolar, desde que não cruze a si mesmo.
    """

    def __init__(self, cx, centro, a, ww, lam, fase=0.0, passo=PASSO):
        self.cx, self.a, self.ww, self.lam, self.fase = cx, a, ww, lam, fase
        self.c = G.reamostrar(centro, passo)
        n = len(self.c)
        self.L = [0.0]
        for i in range(1, n):
            self.L.append(self.L[-1] + math.hypot(self.c[i][0] - self.c[i - 1][0], self.c[i][1] - self.c[i - 1][1]))
        tg = G.tangentes(self.c)
        self.N = [(-t[1], t[0]) for t in tg]
        self.marrom = Fita(cx, "marrom")
        self.ouro = Fita(cx, "ouro")

    def x_s(self, i, fita):
        L = self.L[i]
        d = fita * self.a(L) * math.sin(2 * math.pi * L / self.lam + self.fase)
        return (self.c[i][0] + self.N[i][0] * d, self.c[i][1] + self.N[i][1] * d)

    def _trecho(self, fita, i0, i1):
        pts = [self.x_s(i, fita) for i in range(i0, i1 + 1)]
        ws = [self.ww(self.L[i]) for i in range(i0, i1 + 1)]
        (self.marrom if fita > 0 else self.ouro).desenhar(pts, ws)
        return pts

    def _indice(self, L):
        lo, hi = 0, len(self.L) - 1
        while lo < hi:
            m = (lo + hi) // 2
            if self.L[m] < L:
                lo = m + 1
            else:
                hi = m
        return lo

    def _trechos_visiveis(self, folga=12.0):
        pa = self.cx.pa
        runs, ini = [], None
        for i, (x, s) in enumerate(self.c):
            ok = pa.s0 - folga <= s <= pa.s1 + folga
            if ok and ini is None:
                ini = i
            if not ok and ini is not None:
                runs.append((ini, i - 1))
                ini = None
        if ini is not None:
            runs.append((ini, len(self.c) - 1))
        return [r for r in runs if r[1] - r[0] >= 3]

    def desenhar(self):
        pa = self.cx.pa
        for (i0, i1) in self._trechos_visiveis():
            self._trecho(1, i0, i1)
            self._trecho(-1, i0, i1)
            k = math.ceil((self.L[i0] * 2 * math.pi / self.lam - self.fase) / math.pi)
            while True:
                Lk = (k * math.pi - self.fase) * self.lam / (2 * math.pi)
                if Lk > self.L[i1]:
                    break
                por_cima = 1 if k % 2 == 0 else -1
                k += 1
                amp = self.a(Lk)
                w = self.ww(Lk)
                if amp <= w * 0.45:
                    continue
                d = w * self.lam / (4 * math.pi * max(amp, 0.5)) + w * 0.95 + 0.8
                lo, hi = max(self._indice(Lk - d), i0), min(self._indice(Lk + d), i1)
                if hi - lo < 3:
                    continue
                baixo = -por_cima
                if pa.canal == "cor":
                    a0, a1 = max(self._indice(Lk - d * 0.8), i0), min(self._indice(Lk + d * 0.8), i1)
                    if a1 - a0 >= 3:
                        pts_b = [self.x_s(i, baixo) for i in range(a0, a1 + 1)]
                        ws_b = [self.ww(self.L[i]) for i in range(a0, a1 + 1)]
                        pa.fita_perfil(pts_b, ws_b, lambda l: (0.0, 0.0, 0.0), alfa=lambda u: 0.42 * math.sin(math.pi * u) ** 1.4)
                self._trecho(por_cima, lo, hi)


# ---- o nó celta só em linhas (ornamento apagado do pergaminho) -----------------------------------------------------------------------

def no_em_linhas(cx, centro, a, ww, lam, cor, larg=0.34, alfa=0.55, fase=0.0, passo=0.7):
    """O mesmo entrelaçado de duas fitas, mas só com o traço das bordas (a "arte-final" do nó), com vãos onde uma fita passa por baixo.

    `centro` é a linha-mestra (polilinha do papel); `a` e `ww` são constantes (mm). Serve para os ornamentos celtas bem apagados."""
    pa = cx.pa
    c = G.reamostrar(centro, passo)
    n = len(c)
    if n < 4:
        return
    L = [0.0]
    for i in range(1, n):
        L.append(L[-1] + math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]))
    tg = G.tangentes(c)
    N = [(-t[1], t[0]) for t in tg]
    d = ww * lam / (4 * math.pi * max(a, 0.5)) + ww * 0.55
    for fita in (1, -1):
        pts = []
        for i in range(n):
            dd = fita * a * math.sin(2 * math.pi * L[i] / lam + fase)
            pts.append((c[i][0] + N[i][0] * dd, c[i][1] + N[i][1] * dd))
        # onde esta fita passa por baixo: nos cruzamentos ímpares (para a de +1) ou pares (para a de -1)
        escondido = [False] * n
        k = math.ceil(fase * -1 / math.pi)
        while True:
            Lk = (k * math.pi - fase) * lam / (2 * math.pi)
            if Lk > L[-1] + d:
                break
            embaixo = (k % 2 == 0) == (fita < 0)
            if embaixo:
                for i in range(n):
                    if abs(L[i] - Lk) < d:
                        escondido[i] = True
            k += 1
        for borda in (-1, 1):
            run = []
            for i in range(n):
                x = pts[i][0] + N[i][0] * borda * ww / 2
                s = pts[i][1] + N[i][1] * borda * ww / 2
                if escondido[i]:
                    if len(run) >= 3:
                        G.traco(pa, run, larg, cor, suavizar=False, ponta0=0.05, ponta1=0.05, alfa=alfa, passo=0.7)
                    run = []
                else:
                    run.append((x, s))
            if len(run) >= 3:
                G.traco(pa, run, larg, cor, suavizar=False, ponta0=0.05, ponta1=0.05, alfa=alfa, passo=0.7)
