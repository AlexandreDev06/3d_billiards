"""Letras do boteco: uma fonte de traço único (monoline) desenhada à mão para este projeto, sem nenhuma fonte de terceiros.

Cada letra é uma lista de traços; cada traço é uma lista de pontos (x, y) com y para cima, altura de caixa-alta 10.
`compor(texto, gap)` devolve os traços do texto em unidades da fonte, com a linha de base em y = 0, e a largura.
Serve ao letreiro (arte/marca), ao néon e ao quadro de giz do boteco.
"""
import math

ALTURA = 10.0


def arco(cx, cy, rx, ry, a0, a1, n=None):
    """Pontos de uma elipse de a0 a a1 (graus, anti-horário)."""
    if n is None:
        n = max(6, int(abs(a1 - a0) / 7))
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / n)),
             cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]


def curva(pts, n=8):
    """Catmull-Rom pelos pontos (traço suave)."""
    p = [pts[0]] + list(pts) + [pts[-1]]
    saida = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            saida.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                                      + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    saida.append(tuple(pts[-1]))
    return saida


def _girar180(tracos, w):
    return [[(w - x, ALTURA - y) for x, y in t] for t in tracos]


def _escalar(tracos, s, dy=0.0):
    return [[(x * s, y * s + dy) for x, y in t] for t in tracos]


def _construir():
    G = {}
    G["A"] = (6, [[(0, 0), (3, 10), (6, 0)], [(1.1, 3.5), (4.9, 3.5)]])
    G["B"] = (5.8, [[(0, 0), (0, 10)] + arco(3.2, 7.6, 2.4, 2.4, 90, -90) + [(0, 5.2)],
                    [(0, 5.2)] + arco(3.2, 2.6, 2.6, 2.6, 90, -90) + [(0, 0)]])
    G["C"] = (6, [arco(3, 5, 3, 5, 38, 322)])
    G["D"] = (6, [[(0, 0), (0, 10), (2.4, 10)] + arco(2.4, 5, 3.6, 5, 90, -90) + [(0, 0)]])
    G["E"] = (5.6, [[(5.6, 10), (0, 10), (0, 0), (5.6, 0)], [(0, 5), (4.4, 5)]])
    G["F"] = (5.4, [[(5.4, 10), (0, 10), (0, 0)], [(0, 5), (4.2, 5)]])
    G["G"] = (6, [arco(3, 5, 3, 5, 40, 360) + [(3.2, 5)]])
    G["H"] = (6, [[(0, 0), (0, 10)], [(6, 0), (6, 10)], [(0, 5), (6, 5)]])
    G["I"] = (1.4, [[(0.7, 0), (0.7, 10)]])
    G["J"] = (5, [[(5, 10), (5, 3)] + arco(2.5, 3, 2.5, 3, 0, -180)[1:]])
    G["K"] = (6, [[(0, 0), (0, 10)], [(6, 10), (0, 3.6)], [(1.9, 5.5), (6, 0)]])
    G["L"] = (5.4, [[(0, 10), (0, 0), (5.4, 0)]])
    G["M"] = (7, [[(0, 0), (0, 10), (3.5, 3.2), (7, 10), (7, 0)]])
    G["N"] = (6, [[(0, 0), (0, 10), (6, 0), (6, 10)]])
    G["O"] = (6, [arco(3, 5, 3, 5, 0, 360, 32)])
    G["P"] = (5.8, [[(0, 0), (0, 10), (3.2, 10)] + arco(3.2, 7.4, 2.6, 2.6, 90, -90) + [(0, 4.8)]])
    G["Q"] = (6.4, [arco(3, 5, 3, 5, 0, 360, 32), [(3.6, 3.2), (6.4, -1)]])
    G["R"] = (6, [[(0, 0), (0, 10), (3.2, 10)] + arco(3.2, 7.4, 2.6, 2.6, 90, -90) + [(0, 4.8)], [(2.9, 4.8), (6, 0)]])
    G["S"] = (5.8, [arco(2.9, 7.6, 2.9, 2.4, 28, 270) + arco(2.9, 2.6, 2.9, 2.6, 90, -152)[1:]])
    G["T"] = (6, [[(0, 10), (6, 10)], [(3, 10), (3, 0)]])
    G["U"] = (6, [[(0, 10), (0, 3)] + arco(3, 3, 3, 3, 180, 360)[1:] + [(6, 10)]])
    G["V"] = (6, [[(0, 10), (3, 0), (6, 10)]])
    G["W"] = (8, [[(0, 10), (2, 0), (4, 7), (6, 0), (8, 10)]])
    G["X"] = (6, [[(0, 10), (6, 0)], [(0, 0), (6, 10)]])
    G["Y"] = (6, [[(0, 10), (3, 5.2), (6, 10)], [(3, 5.2), (3, 0)]])
    G["Z"] = (6, [[(0, 10), (6, 10), (0, 0), (6, 0)]])
    G["0"] = (5.6, [arco(2.8, 5, 2.8, 5, 0, 360, 28)])
    G["1"] = (2.4, [[(0.2, 8), (2.4, 10), (2.4, 0)]])
    G["2"] = (5.6, [arco(2.8, 7.4, 2.8, 2.6, 160, -35) + [(0, 0), (5.6, 0)]])
    G["3"] = (5.6, [arco(2.8, 7.6, 2.6, 2.4, 150, -90) + arco(2.8, 2.6, 2.8, 2.6, 90, -150)[1:]])
    G["4"] = (5.8, [[(4.3, 0), (4.3, 10), (0, 3.2), (5.8, 3.2)]])
    G["5"] = (5.6, [[(5.4, 10), (0.4, 10), (0.1, 5.7)] + arco(2.8, 3.3, 2.8, 3.3, 118, -140)])
    seis = [arco(2.8, 3.2, 2.8, 3.2, 0, 360, 28), curva([(0, 3.2), (0.1, 6.2), (1.2, 8.8), (3.2, 10), (5.0, 9.4)])]
    G["6"] = (5.6, seis)
    G["7"] = (5.6, [[(0, 10), (5.6, 10), (1.8, 0)]])
    G["8"] = (5.6, [arco(2.8, 7.7, 2.4, 2.3, 0, 360, 24), arco(2.8, 2.7, 2.8, 2.7, 0, 360, 28)])
    G["9"] = (5.6, _girar180(seis, 5.6))
    G["."] = (0.6, [[(0, 0.1), (0, 0.12)]])
    G[","] = (0.6, [[(0.3, 0.8), (-0.4, -1.6)]])
    G["-"] = (4, [[(0, 5), (4, 5)]])
    G["/"] = (4.5, [[(0, 0), (4.5, 10)]])
    s_ = G["S"][1]
    G["$"] = (5.8, _escalar(s_, 0.8, 1.0) + [[(2.9, -0.6), (2.9, 10.6)]])
    G[" "] = (3.6, [])
    return G


GLIFOS = _construir()
ACENTOS = {"Í": ("I", "agudo"), "Ó": ("O", "agudo"), "Á": ("A", "agudo"), "É": ("E", "agudo"), "Ã": ("A", "til"),
           "Ç": ("C", "cedilha"), "Ú": ("U", "agudo")}


def _acento(tipo, cx):
    if tipo == "agudo":
        return [[(cx - 0.9, 11.4), (cx + 1.3, 13.4)]]
    if tipo == "til":
        return [curva([(cx - 2.4, 11.6), (cx - 1.2, 12.9), (cx, 12.1), (cx + 1.2, 11.3), (cx + 2.4, 12.6)], 6)]
    if tipo == "cedilha":
        return [curva([(cx, 0), (cx + 0.3, -1.1), (cx - 0.9, -2.0)], 5)]
    return []


def glifo(ch):
    """(largura, traços) de um caractere; Í, Ã, Ç etc. são a letra base mais o acento."""
    if ch in GLIFOS:
        return GLIFOS[ch]
    if ch in ACENTOS:
        base, ac = ACENTOS[ch]
        w, tr = GLIFOS[base]
        return w, [list(t) for t in tr] + _acento(ac, w / 2)
    return GLIFOS[" "]


def compor(texto, gap=1.7, folga_extra=0.0):
    """Traços do texto (deslocados em x) e a largura total. `folga_extra` soma ao espaço entre letras (justificar)."""
    x = 0.0
    tracos = []
    for i, ch in enumerate(texto.upper()):
        w, tr = glifo(ch)
        for t in tr:
            tracos.append([(px + x, py) for px, py in t])
        x += w + (gap + folga_extra if ch != " " else 0.0)
        if ch == " ":
            x += gap * 0.4 + folga_extra
    return tracos, max(0.0, x - gap - folga_extra)


def largura(texto, gap=1.7):
    return compor(texto, gap)[1]


def justificar(texto, largura_alvo, gap=1.7):
    """Texto com o espaçamento ajustado para ocupar `largura_alvo` unidades da fonte."""
    base = compor(texto, gap)[1]
    n = max(1, len(texto) - 1)
    return compor(texto, gap, (largura_alvo - base) / n)


def transformar(tracos, s=1.0, dx=0.0, dy=0.0, inverter_y=False):
    """Escala e desloca; `inverter_y` leva y para baixo (coordenadas de imagem)."""
    f = -1.0 if inverter_y else 1.0
    return [[(x * s + dx, y * s * f + dy) for x, y in t] for t in tracos]


def fechado(traco):
    return len(traco) > 3 and math.hypot(traco[0][0] - traco[-1][0], traco[0][1] - traco[-1][1]) < 1e-6 or \
        (len(traco) > 12 and math.hypot(traco[0][0] - traco[-1][0], traco[0][1] - traco[-1][1]) < 0.05)
