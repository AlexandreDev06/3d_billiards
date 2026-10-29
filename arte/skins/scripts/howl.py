"""Howl: um lobo que uiva para a ponta do taco, gráfico e chapado, em vermelho, laranja e preto sobre um fundo escuro com detalhes vermelhos.

Desenho nosso, pensado para o taco: a cabeça (de perfil, boca aberta, olho que acende) está no antebraço com o focinho voltado para a ponta;
o pelo do pescoço e do peito sai em pontas e desce para o punho, que é o pelame inteiro com três pares de olhos acesos na sombra; o uivo
corre pela haste até a ponta como uma fieira de chevrons que esfriam do laranja ao vinho, com estrelas de quatro pontas. A variante rara
é o Lobo da Geada: o mesmo lobo em azul-gelo e branco, olhos ciano.

`blender -b --factory-startup --python howl.py -- <haste|antebraco|punho|tudo> <normal|raro> <cor|emissivo> [saida.png]`
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cor as C  # noqa: E402
import desenho as D  # noqa: E402
import gravura as G  # noqa: E402
from tela import Tela, argumentos  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SAIDA = os.path.join(RAIZ, "exportados")

PALETAS = {
    "normal": dict(
        preto=C.rgb("#0e0808"), fundo=C.rgb("#150a0a"), vinho=C.rgb("#3b0b0c"), verm_esc=C.rgb("#8a1510"), verm=C.rgb("#d02a1a"),
        laranja=C.rgb("#ff7a1a"), laranja_claro=C.rgb("#ffb048"), creme=C.rgb("#ffe6b8"),
        olho=C.rgb("#ffd43a"), olho_luz=C.rgb("#ffe680"), olho_em=(1.0, 0.52, 0.06), boca_em=(0.55, 0.12, 0.05),
    ),
    "raro": dict(   # Lobo da Geada
        preto=C.rgb("#070b14"), fundo=C.rgb("#0a111e"), vinho=C.rgb("#10233f"), verm_esc=C.rgb("#1d4f8c"), verm=C.rgb("#2f86d6"),
        laranja=C.rgb("#9fe0ff"), laranja_claro=C.rgb("#e2f6ff"), creme=C.rgb("#ffffff"),
        olho=C.rgb("#7ff3ff"), olho_luz=C.rgb("#ffffff"), olho_em=(0.22, 0.72, 1.0), boca_em=(0.08, 0.25, 0.5),
    ),
}


class Ctx:
    def __init__(self, t, pal, canal, semente):
        self.t, self.pal, self.canal = t, pal, canal
        self.pa = G.Papel(t, canal)
        self.rng = D.sorteio(semente)


# ---- formas ------------------------------------------------------------------------------------------------------------------------

def espinho(a, b, ponta, curva=0.16, n=7):
    """Um tufo de pelo: triângulo de `a`-`b` até `ponta`, com as duas arestas levemente côncavas (a ponta fica fina e afiada)."""
    def aresta(p, q, lado):
        mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
        dx, dy = q[0] - p[0], q[1] - p[1]
        nx, ny = -dy, dx
        # a concavidade aponta para o eixo do tufo (para o ponto médio da base)
        bx, by = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        if nx * (bx - mx) + ny * (by - my) < 0:
            nx, ny = -nx, -ny
        c = (mx + nx * curva * lado, my + ny * curva * lado)
        return [((1 - t) ** 2 * p[0] + 2 * (1 - t) * t * c[0] + t * t * q[0], (1 - t) ** 2 * p[1] + 2 * (1 - t) * t * c[1] + t * t * q[1]) for t in [i / n for i in range(n + 1)]]
    return aresta(a, ponta, 1.0) + aresta(ponta, b, 1.0)[1:]


def losango(c, r, alto=1.0, fino=0.26):
    """Estrela de quatro pontas de lados côncavos (brilho)."""
    pts = []
    for k in range(4):
        ang = k * math.pi / 2
        rr = r * (alto if k % 2 == 0 else 1.0)
        a1 = ang - math.pi / 4
        pts.append((c[0] + rr * math.cos(ang), c[1] + rr * math.sin(ang)))
        pts.append((c[0] + r * fino * math.cos(a1 + math.pi / 4 + math.pi / 4), c[1] + r * fino * math.sin(a1 + math.pi / 4 + math.pi / 4)))
    return pts


def olho_amendoa(c, comp, alt, ang):
    """Olho em amêndoa, inclinado: pontas afiadas, a de fora mais alta (olhar de lobo)."""
    pts = []
    for i in range(0, 25):
        u = i / 24.0
        x = (u - 0.5) * comp
        y = alt * math.sin(math.pi * u) ** 0.8 * (0.55 + 0.45 * u)
        pts.append((x, y))
    for i in range(24, -1, -1):
        u = i / 24.0
        x = (u - 0.5) * comp
        y = -alt * 0.55 * math.sin(math.pi * u) ** 0.9
        pts.append((x, y))
    return D.mover(D.girar(pts, ang), c[0], c[1])


def pintar_olho(cx, c, comp, alt, ang, forte=1.0):
    pa, pal = cx.pa, cx.pal
    poly = olho_amendoa(c, comp, alt, ang)
    pa.contorno(poly, pal["preto"], 0.5 * min(comp / 8.0, 1.0) + 0.2)
    pa.poli(poly, pal["olho"], centro=c, cor_centro=pal["olho_luz"], em=pal["olho_em"] if forte >= 1 else C.escuro(pal["olho_em"], 0.2),
            em_centro=C.claro(pal["olho_em"], 0.55) if forte >= 1 else C.claro(pal["olho_em"], 0.4))
    pa.poli(D.mover(D.girar(D.elipse(0, 0, comp * 0.06, alt * 0.8, n=10), ang + 0.1), c[0] + comp * 0.04, c[1]), pal["preto"])


# ---- a cabeça ----------------------------------------------------------------------------------------------------------------------

class Cabeca:
    """Perfil de lobo uivando. u anda da nuca ao focinho (rumo à ponta do taco, `-s`), v vai da mandíbula ao topo do crânio (`+x`)."""

    CRANIO = [(-4, 4), (0, 14), (6, 16.5), (16, 18), (28, 17.5), (38, 15.5), (50, 12.5), (62, 9.5), (74, 7), (85, 5), (91, 3), (94.5, 0.5), (93, -2.5), (88, -3),
              (80, -3.4), (68, -4.2), (56, -5.2), (44, -6.2), (36, -8), (30, -12), (22, -14.5), (12, -13), (2, -10)]
    MAND = [(40, -6.4), (60, -5.6), (80, -4.2), (88, -4.6), (89, -7.5), (84, -11.5), (66, -13.8), (48, -15.2), (36, -14)]
    DOBRA = (38.0, -8.0)
    ABERTURA = -0.36

    def __init__(self, cx, x0=-4.0, s0=858.0, k=0.74):
        self.cx, self.x0, self.s0, self.k = cx, x0, s0, k
        self.pa, self.pal = cx.pa, cx.pal

    def p(self, u, v):
        return (self.x0 + v * self.k, self.s0 - u * self.k)

    def ps(self, lista):
        return [self.p(u, v) for (u, v) in lista]

    def rot(self, pts):
        return D.girar(pts, self.ABERTURA, self.DOBRA[0], self.DOBRA[1])

    def boca(self):
        return self.p(92.0, 0.0)

    def plano(self, pts, cor, contorno=0.0, **kw):
        poly = self.ps(pts)
        if contorno:
            self.pa.contorno(poly, self.pal["preto"], contorno)
        self.pa.poli(poly, cor, **kw)

    def tufos(self, lista, cor, contorno=0.0):
        for (a, b, ponta) in lista:
            self.plano(espinho(a, b, ponta), cor, contorno)

    def pintar(self):
        pa, pal = self.pa, self.pal
        K = 0.35 * self.k

        # crina de trás: tufos longos em vinho e vermelho-escuro, saindo da nuca e do pescoço
        self.plano([(-6, 13), (8, 16), (0, 28), (-10, 31), (-12, 22)], pal["verm_esc"], K)       # orelha de trás
        self.tufos([((0, 14), (8, 15), (-38, 30)), ((-4, 9), (4, 14), (-56, 20)), ((-6, 3), (-2, 10), (-62, 6)), ((-6, -3), (-6, 4), (-60, -8)),
                    ((-2, -9), (-5, -2), (-52, -22)), ((6, -12), (-2, -8), (-40, -32)), ((16, -13), (6, -11), (-18, -38))], pal["verm_esc"], K)
        self.tufos([((2, 12), (8, 15), (-24, 24)), ((-3, 6), (3, 12), (-42, 12)), ((-5, 0), (-3, 6), (-46, -2)), ((-4, -6), (-5, 0), (-44, -14)),
                    ((2, -10), (-4, -6), (-34, -26)), ((12, -13), (4, -10), (-8, -32))], pal["verm"], K)

        # mandíbula aberta (gira na dobradiça), boca preta, língua
        mand = self.rot(self.MAND)
        borda_sup = [(44, -6.2), (56, -5.2), (68, -4.2), (80, -3.4), (88, -3.0)]
        topo_mand = self.rot([(40, -6.4), (60, -5.6), (80, -4.2), (88, -4.6)])
        boca = [(36, -8.0)] + borda_sup + topo_mand[::-1]
        self.plano(boca, pal["preto"], K)
        lingua = self.rot([(44, -6.4), (58, -4.6), (72, -4.4), (84, -5.4), (76, -8.0), (60, -8.4), (48, -8.0)])
        self.plano(lingua, pal["verm"], 0.0, em=pal["boca_em"])
        self.plano(mand, pal["verm_esc"], K)
        self.plano(self.rot([(40, -6.4), (60, -5.6), (80, -4.2), (88, -4.6), (89, -7.5), (66, -9.2), (46, -9.8)]), pal["verm"])
        # dentes de baixo (caninos e incisivos)
        for (u, alt) in ((84.0, 8.0), (74.0, 3.6), (64.0, 3.2), (54.0, 2.8)):
            d = self.rot([(u - 2.3, -4.6), (u + 2.3, -4.6), (u + 0.4, -4.6 + alt)])
            self.plano(d, pal["creme"], 0.0)
        # focinho, testa e bochecha
        self.plano(self.CRANIO, pal["laranja"], 1.0 * self.k)
        # faceta de sombra (vermelha) sob o olho e na bochecha; faceta de luz (clara) no dorso do focinho
        self.plano([(2, -10), (12, -13), (22, -14.5), (30, -12), (36, -8), (44, -6.2), (56, -5.2), (50, 0.5), (36, -1), (22, -2), (8, -2), (-2, 0)], pal["verm"])
        self.plano([(6, 15.5), (16, 17.6), (28, 17.2), (38, 15.2), (50, 12.2), (62, 9.2), (74, 6.8), (86, 4.6), (80, 3.6), (62, 5.6), (46, 8.2), (34, 10.4), (20, 12.6), (8, 13)],
                   pal["laranja_claro"])
        # dentes de cima: o canino comprido e os incisivos
        for (u, alt) in ((84.0, 8.6), (75.0, 4.0), (66.0, 3.4), (57.0, 3.0)):
            d = [(u - 2.4, -3.2), (u + 2.4, -3.0), (u + 0.3, -3.2 - alt)]
            self.plano(d, pal["creme"], 0.0)
        # nariz preto
        self.plano([(86, 4.6), (92, 3.4), (94.8, 0.5), (93, -2.6), (88, -3.1), (85.5, 0.8)], pal["preto"])
        self.plano([(88.4, 3.0), (91.6, 2.4), (90.4, 1.2)], pal["laranja_claro"])
        # marcas pretas: a lágrima sob o olho e as listras do focinho
        for pts, w in (([(28, 8.2), (38, 5.0), (52, 3.4), (66, 2.4)], 1.6), ([(34, 12.0), (46, 9.6), (58, 7.4)], 1.0), ([(20, 3.0), (30, 0.4), (42, -1.8)], 1.2)):
            G.traco(pa, self.ps(pts), w * self.k * 1.4, pal["preto"], ponta0=0.05, ponta1=0.6)
        # orelha da frente, com o miolo vermelho
        self.plano([(5, 15.8), (22, 18.2), (17, 26), (8, 33), (1.5, 25)], pal["laranja"], K)
        self.plano([(8, 17.2), (18, 18.6), (13.5, 25), (8.5, 29), (5, 24)], pal["verm_esc"])
        # sobrancelha e olho
        G.traco(pa, self.ps([(18, 12.4), (30, 16.2), (44, 16.0)]), 2.6 * self.k * 1.4, pal["preto"], ponta0=0.0, ponta1=0.5)
        c = self.p(31.0, 10.6)
        pintar_olho(self.cx, c, 16.0 * self.k, 4.6 * self.k, -0.30)
        # tufos da frente: bochecha e garganta, em laranja e laranja-claro
        self.tufos([((30, -12), (22, -14.5), (6, -30)), ((22, -14.5), (12, -13), (-4, -30)), ((12, -13), (2, -10), (-14, -26))], pal["laranja"], K)
        self.tufos([((52, -15.5), (36, -14), (22, -34)), ((40, -14.6), (30, -12), (14, -32))], pal["laranja"], K)
        self.tufos([((6, 14), (14, 17), (-8, 28))], pal["laranja_claro"], K)


# ---- o pelame: do pescoço ao punho --------------------------------------------------------------------------------------------------

def lasca(base, ang, comp, larg, curva):
    """Uma lasca de pelo: lâmina curva e pontuda que sai de `base` na direção `ang` (rad no papel): raiz fina, barriga a um terço, ponta afiada."""
    n = 12
    x, s = base
    eixo = []
    for i in range(n + 1):
        u = i / n
        eixo.append((x, s))
        a = ang + curva * (u - 0.35)
        x += math.cos(a) * comp / n
        s += math.sin(a) * comp / n
    ws = [larg * (0.30 * (1.0 - i / n) + 0.70 * math.sin(math.pi * (i / n) ** 0.6)) + 0.02 for i in range(n + 1)]
    return D.fita(eixo, ws)


def campo_de_pelo(cx, s_ini, s_fim, ds, dx, comp, larg, tom, semente=1, jitter=0.45):
    """Pelo em lascas pontudas que descem rumo ao cabo (+s): uma grade com sorteio, desenhada do cabo para a cabeça (as de cima cobrem as de baixo).

    `tom(t, rng)` devolve a cor da lasca, t de 0 (começo) a 1 (fim) do campo."""
    pa = cx.pa
    rng = D.sorteio(semente)
    lascas = []
    s = s_ini
    k = 0
    while s < s_fim:
        V = pa.meia_volta(s)
        n = max(int(2 * V / dx), 4)
        for i in range(n):
            x = -V + (i + (0.5 if k % 2 else 0.0) + rng.uniform(-jitter, jitter)) * (2 * V / n)
            ss = s + rng.uniform(-jitter, jitter) * ds
            if not pa.visivel(ss - 4, ss + comp * 1.4, 4.0):
                continue
            ang = math.pi / 2 - 0.55 * x / V + rng.uniform(-0.38, 0.38)
            h = comp * (0.75 + 0.5 * rng.random())
            lascas.append((ss, x, ang, h, larg * (0.8 + 0.4 * rng.random()), rng.uniform(-0.9, 0.9), tom((ss - s_ini) / (s_fim - s_ini), rng)))
        s += ds
        k += 1
    for (ss, x, ang, h, w, curva, cor_) in sorted(lascas, key=lambda l: -l[0]):
        pa.poli(lasca((x, ss), ang, h, w, curva), cor_)


def pelame_antebraco(cx):
    pal = cx.pal

    def tom(t, rng):
        tons = (pal["verm"], pal["verm_esc"], pal["verm_esc"], pal["vinho"], pal["vinho"], pal["vinho"], pal["vinho"], pal["fundo"])
        i = int(min(max(t * 7.2 + rng.uniform(-1.4, 1.4), 0.0), 7.0))
        if rng.random() < 0.07 and t < 0.6:
            return pal["laranja"]
        return tons[i]
    campo_de_pelo(cx, 870.0, 1012.0, 9.5, 6.8, 30.0, 7.2, tom, semente=3)


def pelame_punho(cx):
    pal = cx.pal

    def tom(t, rng):
        r = rng.random()
        if r < 0.05:
            return pal["laranja"]
        if r < 0.16:
            return pal["verm"]
        if r < 0.50:
            return pal["verm_esc"]
        return pal["vinho"]
    campo_de_pelo(cx, 990.0, 1262.0, 11.0, 8.2, 30.0, 8.0, tom, semente=7)
    # três pares de olhos acesos na sombra
    for (x, s, ang) in ((-8.0, 1082.0, 0.10), (11.0, 1148.0, -0.08), (-12.0, 1216.0, 0.06)):
        for d in (-1, 1):
            c = (x + d * 6.2, s)
            pa = cx.pa
            pa.poli(D.elipse(c[0], c[1], 6.2, 4.2, n=24), pal["preto"])
            pintar_olho(cx, c, 7.0, 2.1, ang * d + (0.28 if d < 0 else -0.28), forte=0.8)


# ---- o uivo na haste ----------------------------------------------------------------------------------------------------------------

def chevrons(cx):
    """O uivo: chevrons que saem do focinho e viajam até a ponta, afinando e esfriando (laranja-claro, laranja, vermelho, vinho)."""
    pa, pal = cx.pa, cx.pal
    s = 750.0
    n = 0
    while s > 36.0:
        u = n / 26.0
        V = pa.meia_volta(s) / 2.0
        Xe = V * 1.12 + 2.0
        espessura = 11.0 * (1.0 - 0.40 * u) + 2.0
        altura = Xe * 0.62
        cor_ = (pal["laranja_claro"], pal["laranja"], pal["laranja"], pal["laranja"], pal["verm"], pal["verm"], pal["verm"])[min(int(n * 0.28), 6)]
        k = 5
        ext, inn = [], []
        for i in range(-k, k + 1):
            f = i / k
            x = f * Xe
            fora = s - altura * (1.0 - abs(f))             # o vértice aponta para a ponta (s menor)
            esp = espessura * (1.0 - abs(f) ** 1.6) ** 0.9 + 0.0
            ext.append((x, fora))
            inn.append((x, fora + esp))
        pa.poli(ext + inn[::-1], cor_)
        # o eco: um chevron fino, adiante do principal (rumo à ponta)
        eco = []
        eco_in = []
        for i in range(-k, k + 1):
            f = i / k
            y0 = s - altura * (1.0 - abs(f)) - 6.5 - 0.12 * n
            eco.append((f * Xe * 0.96, y0))
            eco_in.append((f * Xe * 0.96, y0 + max(espessura * 0.30, 1.0) * (1.0 - abs(f) ** 1.4)))
        pa.poli(eco + eco_in[::-1], pal["verm_esc"] if n < 14 else pal["vinho"])
        # um fio claro no vértice, só nos primeiros chevrons
        if n < 7:
            pa.poli([(0.0, s - altura + 0.0), (2.2, s - altura + 2.4), (0.0, s - altura + espessura * 0.8), (-2.2, s - altura + 2.4)], pal["creme"] if n < 3 else pal["laranja_claro"])
        s -= 21.0 + 5.0 * u + 3.0 * math.sin(n * 1.7)
        n += 1


def estrelas(cx, s_ini, s_fim, cores, n, semente=5, raio=(2.0, 4.0)):
    pa = cx.pa
    rng = D.sorteio(semente)
    for _ in range(n):
        s = rng.uniform(s_ini, s_fim)
        if not pa.visivel(s - 6, s + 6, 2.0):
            continue
        V = pa.meia_volta(s) / 2.0
        x = rng.uniform(-V * 1.15, V * 1.15)
        r = rng.uniform(*raio)
        pa.poli(losango((x, s), r, alto=1.5), cores[rng.randrange(len(cores))])


def lua(cx, c, R):
    """A lua atrás do lobo: disco vinho com um aro vermelho-escuro e uma crateras de espinhos."""
    pa, pal = cx.pa, cx.pal
    pa.poli(D.elipse(c[0], c[1], R * 1.04, R * 1.04, n=64), pal["verm_esc"])
    pa.poli(D.elipse(c[0], c[1], R * 0.97, R * 0.97, n=64), pal["vinho"])
    # raios: tufos de luz saindo do aro
    for k in range(28):
        ang = 2 * math.pi * k / 28 + 0.08
        r0, r1 = R * 1.0, R * (1.22 if k % 2 == 0 else 1.10)
        a = (c[0] + r0 * math.cos(ang - 0.05), c[1] + r0 * math.sin(ang - 0.05))
        b = (c[0] + r0 * math.cos(ang + 0.05), c[1] + r0 * math.sin(ang + 0.05))
        p = (c[0] + r1 * math.cos(ang), c[1] + r1 * math.sin(ang))
        pa.poli([a, p, b], pal["verm_esc"])


# ---- as peças -------------------------------------------------------------------------------------------------------------------------

def pintar(peca, variante="normal", modo="cor", amostras=None, ppm=None):
    amostras = amostras or int(os.environ.get("HOWL_AMOSTRAS", "64"))
    pal = PALETAS[variante]
    t = Tela(f"howl-{peca}", peca, modo="cor" if modo == "cor" else "emissivo", amostras=amostras, ppm=ppm, girar=True)
    cx = Ctx(t, pal, modo, semente=17 + len(peca))
    t.fundo(pal["fundo"] if modo == "cor" else (0, 0, 0))
    if peca == "haste":
        estrelas(cx, 60.0, 740.0, [pal["verm"], pal["verm_esc"], pal["laranja"]], 46, semente=9)
        chevrons(cx)
    elif peca == "antebraco":
        estrelas(cx, 741.0, 790.0, [pal["verm"], pal["verm_esc"]], 6, semente=4, raio=(1.6, 3.2))
        lua(cx, (3.0, 830.0), 26.0)
        pelame_antebraco(cx)
        Cabeca(cx).pintar()
    elif peca == "punho":
        pelame_punho(cx)
    return t


if __name__ == "__main__":
    a = argumentos()
    peca = a[0] if a else "antebraco"
    variante = a[1] if len(a) > 1 else "normal"
    modo = a[2] if len(a) > 2 else "cor"
    saida = a[3] if len(a) > 3 else None
    pecas = ("haste", "antebraco", "punho") if peca == "tudo" else (peca,)
    for pc in pecas:
        t = pintar(pc, variante, modo)
        nome = f"howl-{pc}" + ("" if variante == "normal" else "-raro") + ("" if modo == "cor" else f"-{modo}") + ".png"
        t.renderizar(saida or os.path.join(SAIDA, nome))
