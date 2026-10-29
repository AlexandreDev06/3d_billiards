"""Dragon Lore: um dragão de nó celta, marrom e ouro, que cospe uma chama de vitral pela haste inteira.

Desenho nosso, pensado para o taco: a cabeça (vermelho-alaranjada, chifres claros, olho que acende) fica no alto do antebraço, olhando para a
ponta, e a chama corre pela haste até lá; o corpo é uma trança de duas fitas (marrom e ouro) que desce o pescoço, entre as asas, serpenteia
sob o punho e volta no cabo, onde as patas (garras vermelho-alaranjadas) e a cauda se enrolam num nó de ouro. O fundo é pergaminho
bege-oliva com ornamentos celtas bem apagados. A variante rara é o Dragão Esmeralda: pergaminho de sálvia, corpo verde e ouro, cabeça esmeralda,
chama que vai do verde ao amarelo-claro.

`blender -b --factory-startup --python dragon_lore.py -- <haste|antebraco|base|tudo> <normal|raro> <cor|emissivo|metal> [saida.png]`

  - cor: o que se vê. emissivo: o que acende (olho, boca e a chama, suave). metal: máscara de metal (branco = ouro batido).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cor as C  # noqa: E402
import desenho as D  # noqa: E402
import dl_cabeca as H  # noqa: E402
import dl_asas as A  # noqa: E402
import dl_chama as F  # noqa: E402
import dl_nos as N  # noqa: E402
import dl_ornatos as O  # noqa: E402
import dl_patas as P  # noqa: E402
import gravura as G  # noqa: E402
import medidas as M  # noqa: E402
from tela import Tela, argumentos  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SAIDA = os.path.join(RAIZ, "exportados")

PALETAS = {
    "normal": dict(
        pergaminho=dict(base=C.rgb("#d9d3a6"), claro=C.rgb("#e9e4c0"), escuro=C.rgb("#b8b07c"), mancha=C.rgb("#958d56"), semente=2.0),
        fundo_ornato=C.rgb("#9d9560"),
        tinta=C.rgb("#2a1608"),
        fita_marrom=dict(borda=C.rgb("#2e180a"), medio=C.rgb("#5f3a1b"), luz=C.rgb("#8f5d2c")),
        fio_marrom=C.rgb("#4a2a10"),
        ouro=dict(sombra=C.rgb("#6e4c0e"), medio=C.rgb("#c8972a"), luz=C.rgb("#f4da78"), brilho=C.rgb("#fff6bd")),
        verm_escuro=C.rgb("#8f2012"), verm=C.rgb("#d63f1b"), verm_claro=C.rgb("#f27a2a"),
        membrana=(C.rgb("#4c1a0c"), C.rgb("#7f2d14"), C.rgb("#b44b1d")),
        marfim=C.rgb("#efe6c8"), marfim_sombra=C.rgb("#b09c70"),
        vitral=[C.rgb("#c9291a"), C.rgb("#f06a1c"), C.rgb("#ffb62a"), C.rgb("#ffe35a")],   # do vermelho (ponta da chama) ao amarelo (miolo)
        vitral_fio=C.rgb("#f7f0d6"),
        olho=C.rgb("#ffd24a"), olho_luz=C.rgb("#ffe680"), olho_em=(1.0, 0.60, 0.10),
    ),
    "raro": dict(   # Esmeralda: verde e ouro
        pergaminho=dict(base=C.rgb("#cdd5a4"), claro=C.rgb("#e1e8bf"), escuro=C.rgb("#a6b178"), mancha=C.rgb("#82905a"), semente=5.0),
        fundo_ornato=C.rgb("#8a965c"),
        tinta=C.rgb("#0f2010"),
        fita_marrom=dict(borda=C.rgb("#0b2a18"), medio=C.rgb("#1f6a3a"), luz=C.rgb("#4aa35e")),
        fio_marrom=C.rgb("#144a28"),
        ouro=dict(sombra=C.rgb("#6e4c0e"), medio=C.rgb("#d6a52e"), luz=C.rgb("#ffe27e"), brilho=C.rgb("#fff6bd")),
        verm_escuro=C.rgb("#0c5a34"), verm=C.rgb("#1b9a58"), verm_claro=C.rgb("#58cf86"),
        membrana=(C.rgb("#0b2e1a"), C.rgb("#1a5a34"), C.rgb("#3a8a52")),
        marfim=C.rgb("#efe6c8"), marfim_sombra=C.rgb("#b09c70"),
        vitral=[C.rgb("#0f7a3a"), C.rgb("#46c24a"), C.rgb("#c8f04a"), C.rgb("#fff7b0")],
        vitral_fio=C.rgb("#f4f7dc"),
        olho=C.rgb("#ffc83a"), olho_luz=C.rgb("#ffe27a"), olho_em=(1.0, 0.55, 0.08),
    ),
}


class Ctx:
    """O que cada função de desenho precisa: o papel (com o canal), a paleta, os perfis de cor das fitas e o sorteio."""

    def __init__(self, t, pal, canal, semente):
        self.t, self.pal, self.canal = t, pal, canal
        self.pa = G.Papel(t, canal)
        self.perfis = N.Perfis(pal)
        self.rng = D.sorteio(semente)
        self.ouro = pal["ouro"]


def interpola(ancoras):
    """Função de L por interpolação linear entre as âncoras [(L, valor), ...]."""
    def f(L):
        if L <= ancoras[0][0]:
            return ancoras[0][1]
        for (l0, v0), (l1, v1) in zip(ancoras, ancoras[1:]):
            if L <= l1:
                return v0 + (v1 - v0) * (L - l0) / (l1 - l0)
        return ancoras[-1][1]
    return f


# ---- o corpo no antebraço (o pescoço) e no cabo (os quadris e a cauda em nó) --------------------------------------------------------------

def caminho_pescoco():
    ctrl = [(-2.0, 868.0), (0.0, 894.0), (2.6, 918.0), (-1.0, 944.0), (-3.6, 974.0), (0.0, 1004.0), (0.0, 1030.0)]
    return G.reamostrar(G.curva(ctrl, 12), 0.5)


def pescoco(cx):
    c = caminho_pescoco()
    tr = N.Tranca(cx, c, interpola([(0, 3.0), (60, 3.5), (150, 3.9), (260, 4.0)]), interpola([(0, 2.8), (60, 3.1), (150, 3.4), (260, 3.5)]), 46.0)
    tr.desenhar()


S_CABECA = 852.0
S_ANCA = 1296.0
CENTRO_ESPIRAL = (0.0, 1385.0)
R_ESPIRAL = (18.0, 5.6)
VOLTAS_ESPIRAL = 1.55


def caminho_cauda():
    ctrl = [(0.0, 1244.0), (1.0, 1275.0), (0.0, 1300.0), (2.5, 1322.0), (9.0, 1344.0), (15.5, 1362.0), (18.0, 1380.0)]
    pts = G.reamostrar(G.curva(ctrl, 12), 0.5)
    tmax = VOLTAS_ESPIRAL * 2 * math.pi
    n = int(tmax * 14)
    for i in range(1, n + 1):
        th = tmax * i / n
        r = R_ESPIRAL[0] - (R_ESPIRAL[0] - R_ESPIRAL[1]) * th / tmax
        pts.append((CENTRO_ESPIRAL[0] + r * math.cos(th), CENTRO_ESPIRAL[1] + r * math.sin(th)))
    return G.reamostrar(pts, 0.5)


def cauda(cx):
    c = caminho_cauda()
    tr = N.Tranca(cx, c, interpola([(0, 4.2), (40, 5.0), (75, 4.6), (125, 3.4), (170, 2.8), (235, 1.9), (262, 0.4)]),
                  interpola([(0, 3.4), (40, 3.9), (75, 3.6), (125, 3.0), (170, 2.6), (235, 1.9), (262, 1.1)]), 52.0)
    tr.desenhar()
    fim, ant = c[-1], c[-6]
    d = math.hypot(fim[0] - ant[0], fim[1] - ant[1]) or 1.0
    P.ponta_de_cauda(cx, fim, ((fim[0] - ant[0]) / d, (fim[1] - ant[1]) / d), 7.0)


# ---- ornamentos apagados de cada peça --------------------------------------------------------------------------------------------------------

def ornamentos(cx, peca):
    if cx.canal != "cor":
        return
    pa, rng = cx.pa, cx.rng
    if peca == "haste":
        s, k = 78.0, 0
        while s < 705.0:
            V = pa.meia_volta(s) / 2.0
            lado = 1 if k % 2 == 0 else -1
            x = lado * (0.52 * V + rng.uniform(-1.2, 1.2))
            tipo = k % 3
            R = min(6.0, 0.40 * V)
            if tipo == 0:
                O.anel(cx, (x, s), R, voltas=4, ww=1.5, a=1.0)
            elif tipo == 1:
                O.triskele(cx, (x, s), R * 1.05, giro=rng.uniform(0, 6.28))
            else:
                O.espiral(cx, (x, s), R * 1.0, 2.0, sentido=lado, giro=rng.uniform(0, 6.28))
            s += 36.0 + rng.uniform(0.0, 14.0)
            k += 1
    elif peca == "antebraco":
        O.anel(cx, (-23.5, 792.0), 7.0)
        O.triskele(cx, (26.0, 790.0), 7.5, giro=0.4)
        O.espiral(cx, (-25.0, 868.0), 7.0, 2.0, sentido=1)
        O.anel(cx, (27.0, 872.0), 6.0)
        O.triskele(cx, (-26.0, 948.0), 6.5, giro=1.2)
        O.espiral(cx, (30.0, 940.0), 5.0, 1.75, sentido=-1, giro=2.0)
        O.anel(cx, (-24.0, 990.0), 5.0, voltas=3)
    elif peca == "base":
        O.anel(cx, (-27.0, 1280.0), 6.5)
        O.triskele(cx, (27.0, 1290.0), 6.5, giro=0.9)
        O.espiral(cx, (-30.0, 1330.0), 6.0, 2.0, sentido=1)
        O.anel(cx, (31.0, 1335.0), 6.0, voltas=3)
        O.triskele(cx, (-32.0, 1385.0), 6.0, giro=2.2)
        O.espiral(cx, (32.0, 1412.0), 5.0, 1.75, sentido=-1)
        O.anel(cx, (-30.0, 1418.0), 4.5, voltas=3)


def pintar(peca, variante="normal", modo="cor", amostras=None, ppm=None):
    amostras = amostras or int(os.environ.get("DL_AMOSTRAS", "64"))
    pal = PALETAS[variante]
    t = Tela(f"dragon-lore-{peca}", peca, modo="cor" if modo == "cor" else "emissivo", amostras=amostras, ppm=ppm, girar=True)
    cx = Ctx(t, pal, modo, semente=11 + len(peca))
    if modo == "cor":
        t.plano_shader(G.material_pergaminho(t, pal["pergaminho"]), z=0.0005)
    else:
        t.fundo((0, 0, 0))
    ornamentos(cx, peca)
    cab = H.Cabeca(cx, s0=S_CABECA)
    bx, bs = cab.boca()
    if peca in ("haste", "antebraco"):
        F.Chama(cx, bs, 44.0, x_boca=bx).pintar()
    if peca == "antebraco":
        A.pintar_asas(cx)
        pescoco(cx)
        cab.pintar()
    if peca == "base":
        P.pernas(cx, S_ANCA)
        cauda(cx)
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
        nome = f"dragon-lore-{pc}" + ("" if variante == "normal" else "-raro") + ("" if modo == "cor" else f"-{modo}") + ".png"
        t.renderizar(saida or os.path.join(SAIDA, nome))
