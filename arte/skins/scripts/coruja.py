"""Corujão: uma coruja da madrugada num fundo escuro, com olhos âmbar que acendem. Sem lobo e sem fogo.

Convenção: tudo é desenhado de pé, com o alto da figura para a ponta do taco (`Tela(girar=True)`): na câmera do jogo a ponta
fica no alto da tela. No PNG a figura sai de cabeça para baixo, de propósito.

  - antebraço: a coruja grande, de frente, num galho, com a lua atrás da cabeça;
  - haste: a noite, com a lua cheia, estrelas e três corujinhas num galho, de olhos acesos (uma a cada ~1/3 de volta);
  - punho: plumagem em barras (a coruja continua), com vagalumes âmbar.

`blender -b --factory-startup --python coruja.py -- [antebraco|haste|punho|tudo] [cor|emissivo|ambos]`
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cor as C  # noqa: E402
import desenho as D  # noqa: E402
import noite as N  # noqa: E402
import pintura as P  # noqa: E402
from tela import Tela, argumentos  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SAIDA = os.path.join(RAIZ, "exportados")

CONTORNO = C.rgb("#120b08")
ESCURO = C.rgb("#2f221c")
PENA_ESCURA = C.rgb("#4a382d")
PENA_MEDIA = C.rgb("#7a6551")
PENA_CLARA = C.rgb("#b9a381")
CREME = C.rgb("#e9dcbc")
DISCO = C.rgb("#d9ccb0")
AMBAR = C.rgb("#ffb21a")
AMBAR_FORTE = C.rgb("#ff7f00")
AMBAR_LUZ = C.rgb("#ffcf5a")
LUA = C.rgb("#eeeedd")
IRIS_A = C.rgb("#ff8f00")
IRIS_B = C.rgb("#ffd54a")
IRIS_C = C.rgb("#ff9d00")
IRIS_RISCO = C.rgb("#c85a00")
FUNDO_PUNHO = C.rgb("#0b0907")
PALETA_PUNHO = [C.rgb("#3b2c23"), C.rgb("#58412f"), C.rgb("#2a1f1a"), C.rgb("#6d5640")]
VAGALUME = C.rgb("#ffe08a")
VAGALUME_B = C.rgb("#ffcf5a")
BARRA_A = C.rgb("#c9b48a")
BARRA_B = C.rgb("#d8c397")
CEU_ATUAL = None  # None = a rampa de noite de noite.py
NEVOA = "#5d79c9"

# O Corujão raro é a coruja da alvorada: branca, de olhos azul-gelo, sob um céu que vira rosa.
RARO = dict(
    CONTORNO=C.rgb("#0d0f26"), ESCURO=C.rgb("#3b4160"), PENA_ESCURA=C.rgb("#8c93ad"), PENA_MEDIA=C.rgb("#c7ccdd"),
    PENA_CLARA=C.rgb("#eef0f8"), CREME=C.rgb("#fbfbff"), DISCO=C.rgb("#f3f2f8"), AMBAR=C.rgb("#7ee6ff"),
    AMBAR_FORTE=C.rgb("#1ab0ff"), AMBAR_LUZ=C.rgb("#c9f6ff"), LUA=C.rgb("#fff4e6"), IRIS_A=C.rgb("#1aa6ff"),
    IRIS_B=C.rgb("#b8f4ff"), IRIS_C=C.rgb("#35b8ff"), IRIS_RISCO=C.rgb("#0f6aa8"), FUNDO_PUNHO=C.rgb("#15122e"),
    PALETA_PUNHO=[C.rgb("#8c93ad"), C.rgb("#a7adc4"), C.rgb("#6d7391"), C.rgb("#c3c8dc")], VAGALUME=C.rgb("#d9f8ff"),
    VAGALUME_B=C.rgb("#9fe9ff"), BARRA_A=C.rgb("#e8ecff"), BARRA_B=C.rgb("#ffffff"),
    CEU_ATUAL=[(0.00, "#140e38"), (0.45, "#2a2060"), (0.90, "#613a86"), (1.20, "#b0668e"), (1.45, "#e69880")], NEVOA="#ffc0d8",
)


def aplicar_variante(nome):
    """Troca a paleta do módulo (as funções leem os nomes na hora de pintar)."""
    if nome == "raro":
        globals().update(RARO)


def espelhar(pts):
    """Metade direita (x ≥ 0, de cima para baixo) → contorno inteiro (desce pela direita, sobe pela esquerda)."""
    return pts + [(-x, y) for x, y in reversed(pts) if x != 0.0]


class Coruja:
    """A figura em coordenadas locais (mm, pé no (0,0), cabeça para +y) levada ao canvas por `pose`."""

    def __init__(self, t, x, y, escala=1.0, brilho_on=False, rng=None, expressao="atenta"):
        self.t = t
        self.pose = D.Pose(x, y, escala, fh=t.fh)
        self.brilho_on = brilho_on
        self.rng = rng or D.sorteio(7)
        self.escala = escala
        self.expressao = expressao

    # ---- atalhos ------------------------------------------------------------------------------------------------
    def P(self, pts):
        return self.pose(pts)

    def forma(self, pts, c, contorno=True, esp=0.30, **kw):
        pts = self.P(pts)
        if contorno:
            self.t.poligono(D.expandir(pts, esp * self.escala), CONTORNO)
        self.t.poligono(pts, c, **kw)
        return pts

    def sombra(self, pts, d=(0.0, -1.2), a=0.35, cor=(0.0, 0.0, 0.0), exp=0.0):
        pts = self.P(pts)
        if exp:
            pts = D.expandir(pts, exp)
        self.t.poligono(D.mover(pts, d[0] * self.escala, d[1] * self.escala), cor, alfa=a)

    def pena(self, cx, cy, w, l, cor_base, giro=0.0, sombra_a=0.30, haste=True, ponta_clara=0.0, detalhe=1.0):
        """Uma pena apontada para -y (a raiz em (cx, cy)); sombra na de baixo, degradê da raiz à ponta e uma nervura."""
        rng = self.rng
        pts = D.girar(P.forma_de_folha(w, l), giro)
        pts = D.mover(pts, cx, cy)
        loc = self.P(pts)
        self.t.poligono(D.mover(D.expandir(loc, 0.18 * self.escala), 0.0, -0.5 * self.escala), (0, 0, 0), alfa=sombra_a)
        topo = (cx, cy)
        base = D.girar([(0.0, -l)], giro)[0]
        fim = (cx + base[0], cy + base[1])
        c_raiz = C.claro(cor_base, 0.10)
        c_ponta = C.escuro(cor_base, 0.18)
        p0, p1 = self.pose.ponto(topo), self.pose.ponto(fim)
        self.t.poligono(loc, P.lin(p0, p1, c_raiz, c_ponta), malha=1.6 * self.escala)
        if ponta_clara > 0:
            ponta = D.mover(D.girar([(0.5 * w * 0.9, -0.82 * l), (0.0, -l), (-0.5 * w * 0.9, -0.82 * l), (0, -0.88 * l)], giro), cx, cy)
            self.t.poligono(self.P(ponta), C.claro(cor_base, ponta_clara), alfa=0.9)
        if haste and detalhe > 0:
            nerv = D.fita([(cx + D.girar([(0, -0.08 * l)], giro)[0][0], cy + D.girar([(0, -0.08 * l)], giro)[0][1]), (cx + D.girar([(0, -0.9 * l)], giro)[0][0], cy + D.girar([(0, -0.9 * l)], giro)[0][1])], 0.28 * detalhe)
            self.t.poligono(self.P(nerv), C.escuro(cor_base, 0.55), alfa=0.55)

    def penas(self, regiao, w, l, passo_x, passo_y, cor_fn, giro_fn=None, janela=None, jitter=0.18, **kw):
        """Penas em fileiras alternadas dentro de `regiao` (polígono local); a fileira de baixo se pinta antes (a de cima cobre)."""
        x0, y0, x1, y1 = D.caixa(regiao)
        linhas = []
        y = y1 + l * 0.2
        i = 0
        while y > y0 - l * 0.4:
            linhas.append((y, i))
            y -= passo_y
            i += 1
        for (y, i) in reversed(linhas):
            x = x0 - passo_x + (passo_x / 2 if i % 2 else 0.0)
            while x < x1 + passo_x:
                cx = x + self.rng.uniform(-jitter, jitter) * passo_x
                cy = y + self.rng.uniform(-jitter, jitter) * passo_y
                if D.dentro((cx, cy - 0.3 * l), regiao) or D.dentro((cx, cy), regiao):
                    giro = giro_fn(cx, cy) if giro_fn else self.rng.uniform(-0.12, 0.12)
                    self.pena(cx, cy, w, l, cor_fn(cx, cy), giro=giro, **kw)
                x += passo_x

    # ---- as partes ------------------------------------------------------------------------------------------------
    def corpo(self):
        met = [(0.0, 86.0), (11.0, 84.0), (20.5, 76.0), (23.5, 60.0), (21.5, 40.0), (17.0, 22.0), (10.0, 10.0), (0.0, 6.0)]
        sil = D.suave(espelhar(met), True, 6)
        self.sil_corpo = sil
        self.forma(sil, P.lin(self.pose.ponto((0, 86)), self.pose.ponto((0, 6)), PENA_MEDIA, PENA_ESCURA), esp=0.42, malha=2.0)
        self.penas(sil, 8.0, 12.0, 6.8, 5.2, lambda x, y: C.misturar(PENA_ESCURA, PENA_MEDIA, 0.2 + 0.5 * self.rng.random()), giro_fn=lambda x, y: -x * 0.02, ponta_clara=0.10, detalhe=0.5)
        # peito: penas de baixo para cima, creme com a estria escura de cada uma
        peito = D.suave(espelhar([(0.0, 84.0), (9.5, 82.0), (14.5, 70.0), (15.0, 50.0), (12.0, 30.0), (7.0, 14.0), (0.0, 9.0)]), True, 6)

        def cor_peito(x, y):
            t = (y - 8.0) / 76.0
            v = self.rng.uniform(-0.05, 0.05)
            return C.misturar(C.misturar(PENA_CLARA, CREME, 0.25 + 0.6 * t), (1, 1, 1), max(v, 0))
        self.penas(peito, 7.2, 10.5, 6.2, 4.6, cor_peito, giro_fn=lambda x, y: -x * 0.015, ponta_clara=0.14, detalhe=0.6)
        # estrias escuras (V) no peito
        for k in range(9):
            y = 76.0 - k * 7.0
            for lado in (-1, 1):
                xs = lado * (2.4 + 0.15 * k)
                v = [(0.0, y), (xs * 1.25, y - 2.6 - 0.2 * k), (xs * 1.6, y - 3.6 - 0.2 * k), (xs * 0.4, y - 1.6)]
                self.t.poligono(self.P(D.fita(D.suave([(0.0, y + 0.4), (xs * 0.7, y - 1.1), (xs * 1.35, y - 3.4 - 0.2 * k)], False, 6), 0.7)), ESCURO, alfa=0.75)

    def asa(self, lado):
        """Asa dobrada ao lado do corpo: coberteiras curtas em cima e as longas penas de voo, com barras claras."""
        s = lado
        reg = D.suave([(s * 17.0, 80.0), (s * 24.5, 72.0), (s * 26.0, 50.0), (s * 23.0, 26.0), (s * 15.0, 8.0), (s * 11.5, 30.0), (s * 12.0, 58.0)], True, 6)
        self.forma(reg, PENA_ESCURA, esp=0.4, malha=2.0)
        # primárias: penas longas, de dentro para fora, ligeiramente abertas
        n = 6
        for i in range(n):
            f = i / (n - 1)
            cx = s * (13.5 + 10.5 * f)
            cy = 52.0 - 6.0 * f
            self.pena(cx, cy, 6.2, 44.0 - 12.0 * f, C.misturar(PENA_ESCURA, PENA_MEDIA, 0.35 + 0.4 * (1 - f)), giro=s * (-0.02 - 0.09 * f), haste=True, ponta_clara=0.12)
            # barras claras da pena, giradas junto com ela
            g = s * (-0.02 - 0.09 * f)
            comp = 44.0 - 12.0 * f
            for bi in range(4):
                d = (0.30 + 0.17 * bi) * comp
                frac = d / comp
                hw = 0.5 * 6.2 * (1 - 0.9 * max(0.0, (frac - 0.5) / 0.5) ** 2) * 0.8
                loc = [(-hw, d), (0.0, d + 0.9), (hw, d), (hw, d + 1.5), (0.0, d + 2.4), (-hw, d + 1.5)]
                pts = [(cx + x * math.cos(g) + y * math.sin(g), cy + x * math.sin(g) - y * math.cos(g)) for x, y in loc]
                self.t.poligono(self.P(pts), PENA_CLARA, alfa=0.55)
        # coberteiras: duas fileiras de penas curtas e redondas no ombro
        for fila, (y, w, l) in enumerate(((72.0, 8.0, 12.0), (63.0, 8.4, 12.5), (54.0, 8.4, 12.0))):
            for k in range(3):
                cx = s * (13.5 + k * 5.6 + (2.6 if fila % 2 else 0.0))
                self.pena(cx, y, w, l, C.misturar(PENA_MEDIA, PENA_ESCURA, 0.25 + 0.2 * k), giro=s * 0.04, ponta_clara=0.2)

    def disco_facial(self, lado):
        s = lado
        c = (s * 10.5, 99.0)
        contorno = D.elipse(c[0], c[1], 13.6, 15.2, rot=s * 0.18, n=48)
        self.forma(contorno, P.radial(self.pose.ponto(c), 15.0 * self.escala, DISCO, C.misturar(DISCO, PENA_ESCURA, 0.55), forma=1.7), esp=0.55, malha=1.6)
        # aro escuro do disco facial
        aro = D.elipse(c[0], c[1], 13.0, 14.6, rot=s * 0.18, n=48)
        self.t.poligono(self.P(D.fita(aro + [aro[0]], 0.9, False)), PENA_ESCURA, alfa=0.75)
        # penugem radial em volta do olho
        for k in range(26):
            a = 2 * math.pi * k / 26 + s * 0.1
            r0, r1 = 7.2, 12.2 + 0.7 * math.sin(k * 2.3)
            p0 = (c[0] + r0 * math.cos(a), c[1] + r0 * math.sin(a) * 1.08)
            p1 = (c[0] + r1 * math.cos(a), c[1] + r1 * math.sin(a) * 1.08)
            cor_ = C.misturar(PENA_CLARA, CREME, 0.5) if k % 2 else C.misturar(DISCO, PENA_MEDIA, 0.4)
            self.t.poligono(self.P(D.fita([p0, p1], [0.15, 1.15])), cor_, alfa=0.8)

    def olho(self, lado):
        s = lado
        c = (s * 10.0, 100.0)
        ir = 6.9
        # aro escuro e anel de luz âmbar (acende)
        luz_c = self.pose.ponto(c)
        P.luz(self.t, luz_c, 15.0 * self.escala, AMBAR, forca=0.45, brilho=AMBAR if self.brilho_on else None, gama=2.0, malha=2.0)
        self.t.poligono(self.P(D.elipse(c[0], c[1], ir + 0.9, ir + 0.9, n=40)), CONTORNO)
        iris = self.P(D.elipse(c[0], c[1], ir, ir, n=40))
        self.t.poligono(iris, P.radial(luz_c, ir * self.escala, IRIS_A, IRIS_B, forma=1.2),
                        brilho=P.radial(luz_c, ir * self.escala, AMBAR_FORTE, AMBAR, forma=1.2) if self.brilho_on else None, malha=0.8)
        # fibras da íris
        for k in range(22):
            a = 2 * math.pi * k / 22
            p0 = (c[0] + 3.0 * math.cos(a), c[1] + 3.0 * math.sin(a))
            p1 = (c[0] + (ir - 0.3) * math.cos(a), c[1] + (ir - 0.3) * math.sin(a))
            self.t.poligono(self.P(D.fita([p0, p1], [0.1, 0.34])), IRIS_RISCO, alfa=0.55)
        # pupila e brilho
        self.t.poligono(self.P(D.elipse(c[0], c[1] - 0.15, 3.0, 3.35, n=32)), (0.01, 0.005, 0.0))
        self.t.poligono(self.P(D.elipse(c[0] - 1.9, c[1] + 2.1, 1.1, 1.3, n=14)), (1.0, 0.97, 0.88), brilho=(1, 1, 0.9) if self.brilho_on else None)
        self.t.poligono(self.P(D.elipse(c[0] + 1.8, c[1] - 1.6, 0.55, 0.55, n=10)), (1.0, 0.95, 0.8), alfa=0.8)
        # pálpebra: crescente escura e inclinada para dentro, o olhar fechado de quem vigia
        ang = 0.38 if self.expressao == "atenta" else 0.16
        sup = D.suave([(c[0] - s * 8.2, c[1] + 2.4 + s * 0.0), (c[0] - s * 3.2, c[1] + 6.6 + 0.2), (c[0] + s * 4.2, c[1] + 8.4 - s * 0.0), (c[0] + s * 8.4, c[1] + 4.6)], False, 8)
        sup = [(x, y + (x - c[0]) * s * -ang * 0.35) for x, y in sup]
        topo = [(x, y + 3.1) for x, y in sup]
        palpebra = sup + topo[::-1]
        self.forma(palpebra, C.misturar(ESCURO, PENA_ESCURA, 0.3), esp=0.2)

    def bico(self):
        pts = D.suave([(-3.2, 97.5), (0.0, 99.0), (3.2, 97.5), (3.6, 92.5), (1.6, 88.0), (0.0, 85.6), (-1.6, 88.0), (-3.6, 92.5)], True, 6)
        self.forma(pts, P.lin(self.pose.ponto((0, 98)), self.pose.ponto((0, 86)), C.rgb("#d7cba8"), C.rgb("#4c4332")), esp=0.3, malha=1.0)
        self.t.poligono(self.P(D.elipse(-1.2, 93.2, 0.7, 0.55, n=8)), (0.05, 0.04, 0.03))
        self.t.poligono(self.P(D.elipse(1.2, 93.2, 0.7, 0.55, n=8)), (0.05, 0.04, 0.03))

    def cabeca(self):
        # silhueta da cabeça: larga e achatada em cima
        met = [(0.0, 121.0), (9.0, 121.5), (18.0, 118.0), (23.0, 109.0), (24.5, 98.0), (21.0, 86.0), (12.0, 80.0), (0.0, 78.5)]
        sil = D.suave(espelhar(met), True, 6)
        self.forma(sil, P.lin(self.pose.ponto((0, 122)), self.pose.ponto((0, 78)), PENA_MEDIA, PENA_ESCURA), esp=0.45, malha=2.0)
        # penugem da testa e das bochechas
        reg = D.suave(espelhar([(0.0, 121.0), (14.0, 119.0), (21.5, 108.0), (22.5, 96.0), (16.0, 84.0), (0.0, 80.5)]), True, 6)
        self.penas(reg, 5.2, 8.2, 4.4, 3.6, lambda x, y: C.misturar(PENA_MEDIA, PENA_CLARA, 0.22 + 0.5 * self.rng.random()), giro_fn=lambda x, y: -x * 0.03, ponta_clara=0.08, detalhe=0.4)
        # tufos de orelha
        for s in (-1, 1):
            tufo = D.suave([(s * 6.0, 114.0), (s * 7.6, 125.0), (s * 14.5, 135.5), (s * 18.0, 125.0), (s * 19.6, 114.0)], True, 6)
            self.forma(tufo, P.lin(self.pose.ponto((s * 12, 134)), self.pose.ponto((s * 12, 112)), PENA_ESCURA, PENA_MEDIA), esp=0.4, malha=1.2)
            for k in range(3):
                f = k / 2
                lista = [(s * (8.4 + 5.0 * f), 115.0), (s * (9.0 + 5.4 * f), 124.0 + 4.0 * f), (s * (10.6 + 4.0 * f), 129.0 + 4.0 * f)]
                self.t.poligono(self.P(D.fita(D.suave(lista, False, 6), [0.9, 0.7, 0.2])), PENA_CLARA if k % 2 else CREME, alfa=0.55)
        # discos faciais, ponte clara entre eles, olhos, bico
        for s in (-1, 1):
            self.disco_facial(s)
        ponte = D.suave([(0.0, 109.0), (2.8, 103.0), (2.0, 94.0), (0.0, 91.0), (-2.0, 94.0), (-2.8, 103.0)], True, 6)
        self.forma(ponte, C.misturar(CREME, (1, 1, 1), 0.2), esp=0.2, malha=1.2)
        for s in (-1, 1):
            self.olho(s)
        self.bico()

    def pes(self):
        for s in (-1, 1):
            # perna emplumada
            perna = D.suave([(s * 6.0, 24.0), (s * 11.8, 24.0), (s * 12.6, 12.0), (s * 5.4, 12.0)], True, 5)
            self.forma(perna, C.misturar(CREME, PENA_CLARA, 0.35), esp=0.3, malha=1.0)
            for k in range(3):
                self.pena(s * (7.0 + 2.2 * k), 22.0 - 3.0 * k, 4.2, 6.5, C.misturar(CREME, PENA_CLARA, 0.3), haste=False, ponta_clara=0.0, sombra_a=0.2)
            # dedos: cápsulas que descem pelo galho, com a unha preta curva na ponta
            for k, ang in enumerate((-0.42, 0.0, 0.42)):
                bx = s * 9.2 + s * (k - 1) * 2.6
                by = 12.5
                comp = 9.5 - 0.8 * abs(k - 1)
                eixo = [(bx, by), (bx + math.sin(ang * s) * comp * 0.4, by - comp * 0.55), (bx + math.sin(ang * s) * comp * 0.8, by - comp)]
                dedo = D.fita(D.suave(eixo, False, 6), [3.5, 3.2, 2.5])
                self.forma(dedo, P.lin(self.pose.ponto((bx, by)), self.pose.ponto((bx, by - comp)), C.rgb("#d4c08c"), C.rgb("#a8935f")), esp=0.22, malha=0.8)
                # escamas do dedo
                for j in range(1, 4):
                    yy = by - j * comp * 0.24
                    xx = bx + math.sin(ang * s) * (yy - by) * -0.5
                    self.t.poligono(self.P(D.fita([(xx - 1.4, yy), (xx, yy - 0.5), (xx + 1.4, yy)], 0.25)), C.rgb("#6f5f3a"), alfa=0.6)
                ponta = eixo[-1]
                garra = D.fita(D.suave([ponta, (ponta[0] + math.sin(ang * s) * 0.6, ponta[1] - 1.5), (ponta[0] + s * 0.4 + math.sin(ang * s) * 0.6, ponta[1] - 3.0)], False, 5), [2.0, 1.5, 0.1])
                self.forma(garra, C.rgb("#15100c"), esp=0.12)

    def silhueta(self, cor_corpo="#080b17", cor_borda="#33477a"):
        """A coruja inteira em silhueta (corpo, cabeça, tufos e pés), com um filete de luar na borda e os olhos acesos."""
        corpo = D.suave(espelhar([(0.0, 86.0), (11.0, 84.0), (20.5, 76.0), (23.5, 60.0), (21.5, 40.0), (17.0, 22.0), (10.0, 10.0), (0.0, 6.0)]), True, 5)
        cabeca = D.suave(espelhar([(0.0, 121.0), (9.0, 121.5), (18.0, 118.0), (23.0, 109.0), (24.5, 98.0), (21.0, 86.0), (12.0, 80.0), (0.0, 78.5)]), True, 5)
        tufos = [D.suave([(s * 6.0, 114.0), (s * 7.6, 125.0), (s * 14.5, 135.5), (s * 18.0, 125.0), (s * 19.6, 114.0)], True, 5) for s in (-1, 1)]
        escuro, borda = C.rgb(cor_corpo), C.rgb(cor_borda)
        for pts in [corpo, cabeca] + tufos:
            loc = self.P(pts)
            self.t.poligono(D.mover(D.expandir(loc, 0.5 * self.escala), -0.25 * self.escala, 0.35 * self.escala), borda)
            self.t.poligono(loc, escuro)
        for s in (-1, 1):
            loc = self.P(D.fita([(s * 9.0, 12.0), (s * 9.4, 4.0)], 6.5))
            self.t.poligono(loc, escuro)
        for s in (-1, 1):
            self.olho_simples(s)

    def olho_simples(self, lado):
        s = lado
        c = (s * 10.0, 100.0)
        luz_c = self.pose.ponto(c)
        P.luz(self.t, luz_c, 13.0 * self.escala, AMBAR, forca=0.55, brilho=AMBAR if self.brilho_on else None, gama=2.0, malha=0.8)
        iris = self.P(D.elipse(c[0], c[1], 7.4, 7.4, n=24))
        self.t.poligono(iris, P.radial(luz_c, 7.4 * self.escala, IRIS_C, IRIS_B, forma=1.2),
                        brilho=P.radial(luz_c, 7.4 * self.escala, AMBAR_FORTE, AMBAR, forma=1.2) if self.brilho_on else None, malha=0.6)
        self.t.poligono(self.P(D.elipse(c[0], c[1] - 0.2, 3.0, 3.6, n=16)), (0.01, 0.005, 0.0))

    def desenhar(self):
        self.asa(-1)
        self.asa(1)
        self.corpo()
        self.cabeca()
        self.pes()


def lua(t, cx, cy, r, brilho_on=False, rng=None):
    rng = rng or D.sorteio(3)
    f = t.fh(cy)
    P.luz(t, (cx, cy), r * 2.3, C.rgb("#9db4ff"), forca=0.55, gama=1.7, malha=3.0)
    disco = [(cx + (px - cx) * f, py) for px, py in D.elipse(cx, cy, r, r, n=64)]
    t.poligono(disco, P.radial((cx, cy), r, C.rgb("#fbfaee"), C.rgb("#cdd6ea"), forma=2.0), malha=1.5)
    for (dx, dy, rr, a) in ((-0.30, 0.28, 0.20, 0.10), (0.34, 0.1, 0.14, 0.09), (-0.05, -0.38, 0.22, 0.08), (0.22, -0.20, 0.09, 0.07), (-0.45, -0.1, 0.1, 0.07)):
        cr = [(cx + dx * r + (px - (cx + dx * r)) * f, py) for px, py in D.elipse(cx + dx * r, cy + dy * r, rr * r, rr * r, n=24)]
        t.poligono(cr, C.rgb("#8d9ab8"), alfa=a * 3.0)


def galho(t, y_centro, espessura, onda=1.2, periodos=2, semente=5, cor_base="#2a1c14"):
    """Faixa de casca em volta do taco, ondulada (fecha na emenda)."""
    rng = D.sorteio(semente)
    n = 120
    sup, inf = [], []
    for i in range(n + 1):
        x = -t.W * 0.1 + t.W * 1.2 * i / n
        ang = 2 * math.pi * periodos * (x / t.W)
        y = y_centro + onda * math.sin(ang)
        h = espessura / 2 * (1 + 0.10 * math.sin(ang * 2.3 + 1.0))
        sup.append((x, y + h))
        inf.append((x, y - h))
    banda = sup + inf[::-1]
    base = C.rgb(cor_base)
    t.poligono(D.expandir(banda, 0.4), CONTORNO, repetir=False)
    t.poligono(banda, P.lin((0, y_centro + espessura / 2), (0, y_centro - espessura / 2), C.claro(base, 0.22), C.escuro(base, 0.25)), malha=2.0, repetir=False)
    # fendas da casca
    for _ in range(int(t.W * 1.2 / 2.2)):
        x = rng.uniform(-t.W * 0.1, t.W * 1.1)
        y = y_centro + rng.uniform(-espessura * 0.4, espessura * 0.4)
        l = rng.uniform(2.0, 6.0)
        trilha = [(x, y), (x + l * 0.4, y + rng.uniform(-0.6, 0.6)), (x + l, y + rng.uniform(-0.6, 0.6))]
        t.poligono(D.fita(D.suave(trilha, False, 4), [0.1, 0.5, 0.1]), (0.0, 0.0, 0.0), alfa=0.55, repetir=True)
    for _ in range(int(t.W * 1.2 / 5.0)):
        x = rng.uniform(-t.W * 0.1, t.W * 1.1)
        y = y_centro + rng.uniform(-espessura * 0.35, espessura * 0.35)
        l = rng.uniform(1.8, 4.5)
        trilha = [(x, y), (x + l * 0.5, y + 0.3), (x + l, y)]
        t.poligono(D.fita(D.suave(trilha, False, 4), [0.1, 0.4, 0.1]), C.rgb("#6a523e"), alfa=0.5, repetir=True)


def pintar_antebraco(modo):
    t = Tela(f"coruja-antebraco-{modo}", "antebraco", modo=modo, girar=True)
    rng = D.sorteio(41)
    if modo == "cor":
        t.plano_shader(N.material_ceu(t, rampa_q=CEU_ATUAL, cor_nevoa_hex=NEVOA))
    else:
        t.fundo((0, 0, 0))
    cx = t.W / 2
    # estrelas (sem pisar na lua nem na coruja)
    N.estrelas(t, rng, 70, (0, t.H), brilho_on=(modo == "emissivo"), evitar=lambda x, y: abs(x - cx) < 22 and 58 < y < 198)
    lua(t, cx, 168.0, 31.0)
    galho(t, 56.0, 15.0, onda=1.4, periodos=2, semente=9)
    c = Coruja(t, cx, 62.0, escala=1.0, brilho_on=(modo == "emissivo"), rng=D.sorteio(13))
    c.desenhar()
    return t


def crescente(cx, cy, R, deslocamento, rB, fh):
    """Lua crescente: o que está dentro do círculo A (R) e fora do B (rB, deslocado para a direita)."""
    bx = cx + deslocamento
    arcoA = []
    for i in range(121):
        a = 2 * math.pi * i / 120
        p = (cx + R * math.cos(a), cy + R * math.sin(a))
        if math.hypot(p[0] - bx, p[1] - cy) >= rB:
            arcoA.append(p)
    arcoB = []
    for i in range(121):
        a = 2 * math.pi * i / 120
        p = (bx + rB * math.cos(a), cy + rB * math.sin(a))
        if math.hypot(p[0] - cx, p[1] - cy) <= R:
            arcoB.append(p)
    # os dois arcos são contíguos mas, por começarem em ângulos diferentes, o de A pode vir "quebrado" no 0: reordena
    def contiguo(pts, ref):
        if not pts:
            return pts
        ang = sorted(range(len(pts)), key=lambda k: math.atan2(pts[k][1] - ref[1], pts[k][0] - ref[0]))
        pts = [pts[k] for k in ang]
        # gira a lista até o maior salto de ângulo ficar no fim
        saltos = [(math.atan2(pts[(k + 1) % len(pts)][1] - ref[1], pts[(k + 1) % len(pts)][0] - ref[0]) - math.atan2(pts[k][1] - ref[1], pts[k][0] - ref[0])) % (2 * math.pi) for k in range(len(pts))]
        k = max(range(len(pts)), key=lambda i: saltos[i])
        return pts[k + 1:] + pts[:k + 1]
    A = contiguo(arcoA, (cx, cy))
    B = contiguo(arcoB, (bx, cy))
    poli = A + B[::-1] if math.hypot(A[-1][0] - B[-1][0], A[-1][1] - B[-1][1]) < math.hypot(A[-1][0] - B[0][0], A[-1][1] - B[0][1]) else A + B
    return [(cx + (x - cx) * fh, y) for x, y in poli]


def ramo_fino(t, x, y, comp, giro=0.0, esp=2.2, cor_="#05070f", rng=None):
    """Um galho fino (silhueta) que cruza o canvas num ângulo, com um brotinho."""
    rng = rng or D.sorteio(2)
    f = t.fh(y)
    eixo = [(x - comp / 2, y - comp * 0.04), (x - comp * 0.15, y + comp * 0.03), (x + comp * 0.2, y - comp * 0.02), (x + comp / 2, y + comp * 0.05)]
    eixo = [(x + (px - x) * f, py) for px, py in D.girar(eixo, giro, x, y)]
    corpo = D.fita(D.suave(eixo, False, 8), [esp * 1.3, esp, esp * 0.8, esp * 0.5])
    t.poligono(D.mover(D.expandir(corpo, 0.35), -0.2, 0.3), C.rgb("#2a3a66"))
    t.poligono(corpo, C.rgb(cor_))


def nuvem(t, cx, cy, rx, ry, forca=0.22, cor_="#7f95d6", brilho=None, semente=1):
    """Uma nuvem baixa: vários clarões achatados sobrepostos, de tamanhos e alturas diferentes."""
    rng = D.sorteio(semente)
    for i in range(6):
        px = cx + rng.uniform(-0.55, 0.55) * rx
        py = cy + rng.uniform(-0.5, 0.5) * ry
        P.luz(t, (px, py), rx * rng.uniform(0.28, 0.5), C.rgb(cor_), forca=forca * rng.uniform(0.6, 1.0), gama=1.3, malha=2.0, ry=ry * rng.uniform(0.6, 1.1))


def corujinha_no_galho(t, x, y_galho, esc, brilho_on, rng, giro=0.0):
    ramo_fino(t, x, y_galho - 1.0, 34.0, giro=giro, esp=2.6, rng=rng)
    c = Coruja(t, x, y_galho + 0.2, escala=esc, brilho_on=brilho_on, rng=rng)
    c.silhueta()


def pintar_haste(modo):
    t = Tela(f"coruja-haste-{modo}", "haste", modo=modo, girar=True)
    rng = D.sorteio(77)
    emissivo = modo == "emissivo"
    if not emissivo:
        t.plano_shader(N.material_ceu(t, intensidade_nuvem=0.13, escala_nuvem=14.0, rampa_q=CEU_ATUAL, cor_nevoa_hex=NEVOA))
    else:
        t.fundo((0, 0, 0))
    W = t.W
    # nuvens baixas
    for q, u, rx, ry, f in ((0.10, 0.30, 34.0, 4.5, 0.20), (0.36, 0.80, 40.0, 5.0, 0.16), (0.58, 0.15, 36.0, 4.0, 0.18), (0.69, 0.60, 30.0, 4.0, 0.15)):
        if not emissivo:
            nuvem(t, u * W, t.y_de_q(q), rx, ry, forca=f, semente=int(q * 100))
    # estrelas
    N.estrelas(t, rng, 230, None, brilho_on=False)
    # lua crescente
    if not emissivo:
        qy = t.y_de_q(0.205)
        mx = 0.52 * W
        P.luz(t, (mx, qy), 24.0, C.rgb("#9db4ff"), forca=0.50, gama=1.8, malha=2.5)
        t.poligono(crescente(mx, qy, 9.5, 4.6, 8.4, t.fh(qy)), P.lin((mx - 8, qy), (mx + 6, qy), C.rgb("#fffbe8"), C.rgb("#cfd8f0")), malha=1.0)
    else:
        t.fundo((0, 0, 0))
    # galhos finos com corujinhas de olhos acesos (uma a cada ~1/3 de volta, subindo o taco)
    for q, u, esc, giro in ((0.285, 0.14, 0.26, -0.06), (0.445, 0.52, 0.30, 0.04), (0.625, 0.87, 0.26, 0.05)):
        corujinha_no_galho(t, u * W, t.y_de_q(q), esc, emissivo, D.sorteio(int(q * 1000)), giro)
    # estrela cadente
    if not emissivo:
        y0 = t.y_de_q(0.375)
        x0 = 0.28 * W
        traco = D.fita([(x0, y0), (x0 + 5.0, y0 - 9.0), (x0 + 10.0, y0 - 18.0)], [0.2, 0.9, 0.05])
        t.poligono(traco, C.rgb("#e6eeff"), alfa=0.85)
        P.luz(t, (x0 + 0.5, y0 + 0.5), 3.5, C.rgb("#ffffff"), forca=0.9, gama=1.6, malha=1.0)
    return t


def pintar_punho(modo):
    t = Tela(f"coruja-punho-{modo}", "punho", modo=modo, girar=True)
    emissivo = modo == "emissivo"
    W, H = t.W, t.H
    t.fundo(FUNDO_PUNHO)
    cols = 5
    passo_x = W / cols
    comp, larg = 24.0, 17.0
    passo_y = 11.0
    linhas = int(H / passo_y) + 4
    rng = D.sorteio(5)
    ruido = {}
    for i in range(linhas):
        for k in range(cols):
            ruido[(i, k)] = (rng.uniform(-0.12, 0.12), rng.uniform(-0.15, 0.15), rng.uniform(0, 1), rng.uniform(-0.1, 0.1))
    aux = Coruja(t, 0.0, 0.0, escala=1.0, brilho_on=emissivo, rng=D.sorteio(9))
    aux.pose = D.Pose(0.0, 0.0, 1.0, fh=1.0)
    paleta = PALETA_PUNHO
    for i in range(linhas - 1, -1, -1):
        y = H + 6 - i * passo_y
        for k in range(cols):
            dx, dy, a, g = ruido[(i, k % cols)]
            x = (k + 0.5 + (0.5 if i % 2 else 0.0) + dx) * passo_x
            yy = y + dy * passo_y
            base = paleta[int(a * len(paleta)) % len(paleta)]
            _pena_com_barras(t, x, yy, larg, comp, base, g, aux.rng)
    # vagalumes âmbar
    pr = D.sorteio(321)
    for _ in range(26):
        x, y = pr.uniform(0, W), pr.uniform(4, H - 4)
        f = t.fh(y)
        r = pr.uniform(0.55, 1.0)
        P.luz(t, (x, y), r * 4.0, AMBAR, forca=0.55, brilho=AMBAR if emissivo else None, gama=2.0, malha=0.8)
        t.poligono([(x + (px - x) * f, py) for px, py in D.elipse(x, y, r, r, n=12)], VAGALUME, brilho=VAGALUME_B if emissivo else None)
    return t


def _pena_com_barras(t, cx, cy, w, l, base, giro, rng):
    """Pena rombuda de coruja, apontada para -y, com barras em arco, ponta escura e fio de luz na borda (plumagem barrada)."""
    f = t.fh

    def mundo(pts):
        pts = [(cx + x * math.cos(giro) + y * math.sin(giro), cy + x * math.sin(giro) - y * math.cos(giro)) for x, y in pts]
        return [(cx + (x - cx) * f(y), y) for x, y in pts]

    # contorno em coordenadas da pena (x lateral, y ao longo do eixo, positivo para a ponta)
    forma = D.suave([(0.0, 0.0), (0.46 * w, 0.14 * l), (0.52 * w, 0.52 * l), (0.40 * w, 0.88 * l), (0.0, l), (-0.40 * w, 0.88 * l), (-0.52 * w, 0.52 * l), (-0.46 * w, 0.14 * l)], True, 4)
    loc = mundo(forma)
    t.poligono(D.mover(D.expandir(loc, 0.3), 0.0, -0.6), (0, 0, 0), alfa=0.5)
    t.poligono(D.expandir(loc, 0.3), C.misturar(base, BARRA_A, 0.45))
    p0 = (cx, cy)
    p1 = (cx + math.sin(giro) * l, cy - math.cos(giro) * l)
    t.poligono(loc, P.lin(p0, p1, C.claro(base, 0.10), C.escuro(base, 0.28)), malha=1.8)
    for bi in range(4):
        d = (0.22 + 0.17 * bi) * l
        frac = d / l
        hw = 0.5 * w * (1 - 0.7 * max(0.0, (frac - 0.45) / 0.55) ** 2) * 0.9
        arco = D.suave([(-hw, d), (0.0, d + 0.20 * l * 0.35 + 1.0), (hw, d)], False, 6)
        cor_barra = C.misturar(BARRA_B, base, 0.10 + 0.14 * bi) if bi % 2 == 0 else C.escuro(base, 0.35)
        t.poligono(mundo(D.fita(arco, 1.7 - 0.2 * bi)), cor_barra, alfa=0.9 if bi % 2 == 0 else 0.7)
    ponta = D.suave([(-0.36 * w, 0.86 * l), (0.0, l), (0.36 * w, 0.86 * l), (0.0, 0.90 * l)], True, 4)
    t.poligono(mundo(ponta), (0.03, 0.02, 0.015), alfa=0.85)
    nerv = D.fita([(0.0, 0.04 * l), (0.0, 0.86 * l)], 0.4)
    t.poligono(mundo(nerv), C.claro(base, 0.4), alfa=0.55)


if __name__ == "__main__":
    pecas_ok, modos_ok, variantes_ok = ("antebraco", "haste", "punho", "tudo"), ("cor", "emissivo", "ambos"), ("normal", "raro")
    a = argumentos()
    peca = next((x for x in a if x in pecas_ok), "antebraco")
    modo = next((x for x in a if x in modos_ok), "cor")
    variante = next((x for x in a if x in variantes_ok), "normal")
    saida = next((x for x in a if x not in pecas_ok + modos_ok + variantes_ok), None)
    aplicar_variante(variante)
    for nome, fn in (("antebraco", pintar_antebraco), ("haste", pintar_haste), ("punho", pintar_punho)):
        if peca in (nome, "tudo"):
            for m in (("cor", "emissivo") if modo == "ambos" else (modo,)):
                t = fn(m)
                t.renderizar(saida or os.path.join(SAIDA, f"corujao-{nome}" + ("" if variante == "normal" else "-raro") + ("" if m == "cor" else "-emissivo") + ".png"))
