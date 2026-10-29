"""Etapa 3c: as treze ações do balão (30 quadros por segundo), cada uma numa faixa NLA com o mesmo nome.

Só os ossos `raiz`, `espinha_1..3` e `no` têm chave. A cordinha (`cordinha_*`) e os olhos (`olho_*`) não têm chave nenhuma: o jogo simula a primeira e mira os segundos.
O rosto (formas `cara_*`, `piscar*`, `palpebra_*`) também é do jogo; o par de cada ação está em `dados.PAR_DE_CARA`.

Como as ações são feitas (os princípios de animação, na ordem):
- Cada ação é escrita como poucos canais MESTRES (subida do corpo, inclinação para a frente e de lado, giro, achatamento, inflar), com chaves de extremo:
  antecipação (o recuo antes do gesto), exagero (o extremo passa do ponto), arcos (o corpo gira em volta do pescoço e sobe em arco) e curvas de tempo com ease
  (interpolação cúbica monótona: parada suave em cada extremo, sem estourar entre as chaves).
- Squash and stretch pela escala do osso, conservando o volume: altura h, largura e profundidade 1/sqrt(h).
- Sobreposição e follow-through vêm de molas de segunda ordem: cada osso de cima segue o mestre com mais atraso e mais balanço (espinha_1 rígida, espinha_2 macia,
  espinha_3 solta, o nó contrário), e a gelatina das costas é a diferença entre a mola macia e a rígida do achatamento. Nada de oscilação desenhada à mão.
- Os ciclos (`dados.TRECHOS`) saem do regime permanente das molas (simulados por três voltas e meia), então fecham sem emenda; só as pontas do trecho de entrada
  se misturam ao ciclo (12 quadros).
Os valores usam `T(frente, lado, giro)` (graus; inclina o osso para o rosto, para +X, e gira em volta do osso), `mover` (direita, cima, frente em cm) e `escala`.
"""
import importlib
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import dados as D

importlib.reload(D)
CM = D.CM
FPS = 30
PAR_DE_CARA, TRECHOS = D.PAR_DE_CARA, D.TRECHOS
OSSOS_COM_CHAVE = ["raiz", "espinha_1", "espinha_2", "espinha_3", "no"]


# --- curvas -----------------------------------------------------------------------------------------------------------------
_CACHE_PCHIP = {}


def E(chaves, f):
    """Valor da curva de chaves [(quadro, valor), ...] no quadro `f`: cúbica monótona (Fritsch-Carlson) com tangente zero nas pontas (ease). Fora do intervalo segura a ponta."""
    k = id(chaves)
    if k not in _CACHE_PCHIP:
        xs = np.array([c[0] for c in chaves], float)
        ys = np.array([c[1] for c in chaves], float)
        h, d = np.diff(xs), np.diff(ys) / np.diff(xs)
        m = np.zeros(len(xs))
        for i in range(1, len(xs) - 1):
            if d[i - 1] * d[i] > 0:
                w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
                m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
        _CACHE_PCHIP[k] = (xs, ys, h, m, chaves)
    xs, ys, h, m, _ = _CACHE_PCHIP[k]
    if f <= xs[0]:
        return float(ys[0])
    if f >= xs[-1]:
        return float(ys[-1])
    i = int(np.searchsorted(xs, f, side="right") - 1)
    t = (f - xs[i]) / h[i]
    t2, t3 = t * t, t * t * t
    return float((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])


def S(f, periodo, amp=1.0, fase=0.0, harm=1):
    return amp * math.sin(2 * math.pi * harm * f / periodo + fase)


def suave(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def mola(alvo, omega, zeta, sub=8):
    """Resposta de uma mola de segunda ordem (frequência `omega` rad/s, amortecimento `zeta`) ao alvo amostrado a 30 quadros/s; começa em repouso no valor do alvo."""
    x, v = float(alvo[0]), 0.0
    dt = 1.0 / FPS / sub
    saida = []
    for i in range(len(alvo)):
        saida.append(x)
        a0, a1 = alvo[i], alvo[min(i + 1, len(alvo) - 1)]
        for s in range(sub):
            tgt = a0 + (a1 - a0) * (s + 0.5) / sub
            v += (omega * omega * (tgt - x) - 2 * zeta * omega * v) * dt
            x += v * dt
    return np.array(saida)


# --- os mestres de cada ação: f -> dict de canais --------------------------------------------------------------------------------
# canais: x, y, z (cm: direita, cima, frente), inc_f (graus, para o rosto), inc_l (graus, para +X), giro (graus), sq (achatamento: altura; 1 = repouso),
# u (inflar: escala uniforme), treme_x (cm) e treme_l (graus), que entram depois das molas.
BASE = dict(x=0.0, y=0.0, z=0.0, inc_f=0.0, inc_l=0.0, giro=0.0, sq=1.0, u=1.0, treme_x=0.0, treme_l=0.0)


def canais(**kw):
    c = dict(BASE)
    c.update(kw)
    return c


# listas de chaves (module-level para o cache por id)
def _k(*pares):
    return list(pares)


def m_parado(f):
    P = 180.0
    return canais(
        y=S(f, P, 0.50, 0.0, 2) + S(f, P, 0.18, 1.3, 3) + S(f, P, 0.12, 0.4),
        x=S(f, P, 0.34, 2.0) + S(f, P, 0.12, 0.5, 3),
        z=S(f, P, 0.18, 1.0),
        inc_f=S(f, P, 0.9, 0.9) + S(f, P, 0.4, 2.1, 2),
        inc_l=S(f, P, 1.6, -0.3) + S(f, P, 0.5, 1.0, 3),
        giro=S(f, P, 2.0, 1.7) + S(f, P, 0.8, 0.0, 2),
        sq=1.0 + S(f, P, 0.016, -0.6, 2) + S(f, P, 0.006, 1.0, 3))


_I = dict(
    y=_k((0, 0), (7, -0.35), (16, 1.9), (20, 1.65), (24, 1.6)),
    f=_k((0, 0), (7, -5.5), (15, 17.5), (19, 14.8), (24, 14.0)),
    l=_k((0, 0), (7, -1.0), (15, 3.2), (24, 2.2)),
    sq=_k((0, 1.0), (7, 0.94), (13, 1.05), (19, 0.99), (24, 1.0)),
    g=_k((0, 0), (7, 1.5), (16, -3.0), (24, -1.5)))


def m_inclinar(f):
    a, P = 24.0, 72.0
    if f < a:
        return canais(y=E(_I["y"], f), inc_f=E(_I["f"], f), inc_l=E(_I["l"], f), sq=E(_I["sq"], f), giro=E(_I["g"], f))
    u = f - a
    return canais(y=1.6 + S(u, P, 0.2, 1.0) - S(0, P, 0.2, 1.0), inc_f=14.0 + S(u, P, 0.7, 0.5) - S(0, P, 0.7, 0.5), inc_l=2.2 + S(u, P, 0.9, 1.4) - S(0, P, 0.9, 1.4),
                  sq=1.0 + S(u, P, 0.012, 1.0) - S(0, P, 0.012, 1.0), giro=-1.5 + S(u, P, 1.2, 0.2) - S(0, P, 1.2, 0.2), x=S(u, P, 0.2, 0.8) - S(0, P, 0.2, 0.8))


_PU = dict(
    y=_k((0, 0), (6, -0.95), (9, 0.6), (14, 5.9), (19, 2.4), (23, -0.7), (27, 0.9), (31, -0.05), (36, 0.0), (40, 0.0)),
    sq=_k((0, 1.0), (6, 0.84), (9, 1.12), (14, 1.01), (19, 1.07), (23, 0.86), (27, 1.04), (31, 0.99), (36, 1.0), (40, 1.0)),
    f=_k((0, 0), (6, -3.0), (11, 5.0), (19, 3.0), (23, -1.5), (30, 0.5), (36, 0), (40, 0)),
    l=_k((0, 0), (6, 1.0), (14, -2.4), (23, 1.5), (31, -0.4), (36, 0), (40, 0)))


def m_pulinho(f):
    return canais(y=E(_PU["y"], f), sq=E(_PU["sq"], f), inc_f=E(_PU["f"], f), inc_l=E(_PU["l"], f))


_SU = dict(
    y=_k((0, 0), (2, 1.9), (5, 1.2), (9, 0.8), (16, 0.3), (24, 0.05), (36, 0.0)),
    sq=_k((0, 1.0), (2, 0.82), (4, 0.87), (9, 0.9), (16, 0.96), (26, 1.0), (36, 1.0)),
    f=_k((0, 0), (2, -11.0), (5, -8.5), (10, -4.0), (18, -1.0), (28, 0.0), (36, 0.0)),
    t=_k((0, 0), (2, 1.0), (14, 0.7), (26, 0.12), (36, 0.0)))


def m_susto(f):
    env = E(_SU["t"], f)
    return canais(y=E(_SU["y"], f), sq=E(_SU["sq"], f), inc_f=E(_SU["f"], f), treme_l=3.4 * env * math.sin(2 * math.pi * f / 2.3), treme_x=0.12 * env * math.sin(2 * math.pi * f / 2.3 + 1.0),
                  u=1.0 - 0.02 * env)


_ES = dict(
    u=_k((0, 1.0), (5, 0.97), (15, 1.43), (21, 1.31), (27, 1.35)),
    sq=_k((0, 1.0), (5, 0.93), (11, 1.04), (21, 0.97), (27, 1.0)),
    y=_k((0, 0), (5, -0.6), (15, 1.8), (21, 0.7), (27, 0.9)),
    f=_k((0, 0), (5, -3.5), (13, 4.0), (21, 1.0), (27, 0.5)))


def m_estufar(f):
    a, P = 27.0, 48.0
    if f < a:
        return canais(u=E(_ES["u"], f), sq=E(_ES["sq"], f), y=E(_ES["y"], f), inc_f=E(_ES["f"], f))
    u = f - a
    return canais(u=1.35 + S(u, P, 0.035, 0.0) , sq=1.0 + S(u, P, 0.014, 1.2) - S(0, P, 0.014, 1.2), y=0.9 + S(u, P, 0.35, 0.0), inc_f=0.5 + S(u, P, 0.6, 0.4) - S(0, P, 0.6, 0.4),
                  inc_l=0.7 * S(u, P, 1.4, 0.0, 2) + S(u, P, 1.3, 0.0), giro=S(u, P, 2.2, 0.3))


_MU = dict(
    u=_k((0, 1.0), (8, 1.05), (16, 0.99), (26, 0.95), (38, 0.92), (48, 0.90)),
    sq=_k((0, 1.0), (8, 1.04), (16, 0.90), (26, 0.82), (34, 0.83), (42, 0.78), (48, 0.79)),
    y=_k((0, 0), (8, 0.5), (16, -0.6), (26, -1.4), (36, -1.6), (48, -2.0)),
    f=_k((0, 0), (8, -1.5), (16, 2.0), (30, 5.5), (40, 7.5), (48, 8.0)),
    l=_k((0, 0), (8, -1.0), (16, 4.0), (30, 11.0), (40, 12.5), (48, 12.0)),
    g=_k((0, 0), (16, 3.0), (30, 8.0), (48, 9.0)))


def m_murchar(f):
    a, P = 48.0, 48.0
    if f < a:
        return canais(u=E(_MU["u"], f), sq=E(_MU["sq"], f), y=E(_MU["y"], f), inc_f=E(_MU["f"], f), inc_l=E(_MU["l"], f), giro=E(_MU["g"], f))
    u = f - a
    return canais(u=0.90 + S(u, P, 0.008, 0.0), sq=0.79 + S(u, P, 0.015, 0.8) - S(0, P, 0.015, 0.8), y=-2.0 + S(u, P, 0.12, 0.0), inc_f=8.0 + S(u, P, 0.7, 0.3) - S(0, P, 0.7, 0.3),
                  inc_l=12.0 + S(u, P, 1.0, 0.0), giro=9.0 + S(u, P, 1.0, 0.7) - S(0, P, 1.0, 0.7))


_CO = dict(
    y=_k((0, 0), (7, -1.0), (15, 7.2), (21, 5.6), (26, -0.8), (30, 1.4), (34, 0.0), (38, 2.0), (43, 3.4), (49, -0.5), (53, 0.6), (57, 0.0), (66, 0.0)),
    sq=_k((0, 1.0), (7, 0.82), (11, 1.14), (15, 1.04), (21, 1.08), (26, 0.84), (30, 1.05), (34, 0.96), (38, 1.06), (43, 1.02), (49, 0.9), (53, 1.02), (60, 1.0), (66, 1.0)),
    g=_k((0, 0), (7, -9.0), (14, 24.0), (24, -20.0), (34, 15.0), (43, -9.0), (52, 4.0), (60, 0.0), (66, 0.0)),
    f=_k((0, 0), (7, -4.0), (13, 6.0), (22, 0.0), (26, 4.0), (34, 0.0), (49, 3.0), (66, 0.0)),
    l=_k((0, 0), (13, 2.0), (20, -5.0), (30, 0.0), (36, 9.0), (42, -7.0), (49, 4.0), (55, -3.0), (60, 1.0), (66, 0.0)),
    x=_k((0, 0), (15, 0.9), (26, 0.0), (43, -0.7), (55, 0.0), (66, 0.0)))


def m_comemorar(f):
    return canais(y=E(_CO["y"], f), sq=E(_CO["sq"], f), giro=E(_CO["g"], f), inc_f=E(_CO["f"], f), inc_l=E(_CO["l"], f), x=E(_CO["x"], f))


_RI = dict(
    f=_k((0, 0), (6, -9.0), (15, -6.0)),
    y=_k((0, 0), (6, -0.7), (15, 0.5)),
    sq=_k((0, 1.0), (6, 0.92), (15, 1.0)))


def m_rir(f):
    a, P, Q = 15.0, 36.0, 9.0
    if f < a:
        return canais(inc_f=E(_RI["f"], f), y=E(_RI["y"], f), sq=E(_RI["sq"], f), treme_l=S(f, Q, 1.0) * suave(f / a))
    u = f - a
    ritmo = S(u, Q, 1.0, 0.0)
    return canais(inc_f=-6.0 + S(u, P, 3.5, 0.0) + S(u, Q * 2, 1.4, 0.0), y=0.5 + 0.8 * S(u, Q, 1.0, math.pi / 2) - 0.8 * S(0, Q, 1.0, math.pi / 2),
                  sq=1.0 - 0.07 * S(u, Q, 1.0, math.pi / 2) + 0.07 * S(0, Q, 1.0, math.pi / 2), inc_l=2.6 * S(u, P, 1.0, 0.0), treme_l=1.4 * ritmo, giro=2.2 * S(u, P, 1.0, 1.0))


_BR = dict(
    u=_k((0, 1.0), (7, 1.015), (13, 1.1), (30, 1.135), (38, 1.14), (41, 0.985), (45, 1.03), (52, 1.0), (60, 1.0)),
    sq=_k((0, 1.0), (7, 0.94), (13, 1.03), (36, 1.0), (40, 0.88), (44, 1.04), (50, 0.99), (60, 1.0)),
    f=_k((0, 0), (7, -7.0), (13, 3.5), (36, 2.5), (40, 7.5), (46, -0.5), (54, 0.0), (60, 0.0)),
    y=_k((0, 0), (7, -0.6), (13, 0.6), (38, 0.5), (41, -0.7), (46, 0.2), (54, 0.0), (60, 0.0)),
    t=_k((0, 0), (11, 0.0), (15, 1.0), (36, 1.0), (40, 0.3), (50, 0.05), (60, 0.0)))


def m_bravo(f):
    env = E(_BR["t"], f)
    return canais(u=E(_BR["u"], f), sq=E(_BR["sq"], f), inc_f=E(_BR["f"], f), y=E(_BR["y"], f), treme_x=0.22 * env * math.sin(2 * math.pi * f / 2.7),
                  treme_l=2.8 * env * math.sin(2 * math.pi * f / 2.7 + 1.4), z=0.0)


_CN = dict(
    f=_k((0, 0), (6, -2.5), (14, 13.5), (19, 12.4), (30, 12.0)),
    y=_k((0, 0), (6, 0.2), (14, -0.3), (30, -0.15)),
    sq=_k((0, 1.0), (6, 1.01), (14, 0.965), (30, 0.97)),
    l=_k((0, 0), (14, 3.2), (30, 2.4)),
    g=_k((0, 0), (14, -3.0), (30, -2.0)))


def m_concentrar(f):
    a, P = 30.0, 84.0
    if f < a:
        return canais(inc_f=E(_CN["f"], f), y=E(_CN["y"], f), sq=E(_CN["sq"], f), inc_l=E(_CN["l"], f), giro=E(_CN["g"], f))
    u = f - a
    return canais(inc_f=12.0 + S(u, P, 0.7, 0.4) - S(0, P, 0.7, 0.4) + S(u, P / 3, 0.35, 1.0) - S(0, P / 3, 0.35, 1.0), y=-0.15 + S(u, P, 0.14, 1.0) - S(0, P, 0.14, 1.0),
                  sq=0.97 + S(u, P, 0.013, 1.5) - S(0, P, 0.013, 1.5), inc_l=2.4 + S(u, P, 0.9, 0.2) - S(0, P, 0.9, 0.2) + S(u, P / 2, 0.4, 2.0) - S(0, P / 2, 0.4, 2.0),
                  giro=-2.0 + S(u, P, 1.0, 0.8) - S(0, P, 1.0, 0.8), x=S(u, P, 0.1, 0.0))


_IM = dict(
    l=_k((0, 0), (6, 3.0), (14, -7.0), (18, -5.0)),
    f=_k((0, 0), (8, 4.0), (18, 1.0)),
    y=_k((0, 0), (6, -0.3), (14, 0.3), (18, 0.0)),
    sq=_k((0, 1.0), (6, 0.97), (14, 1.0), (18, 1.0)))


def m_impaciente(f):
    a, P = 18.0, 60.0
    if f < a:
        return canais(inc_l=E(_IM["l"], f), inc_f=E(_IM["f"], f), y=E(_IM["y"], f), sq=E(_IM["sq"], f), x=-0.18 * suave(f / a))
    u = f - a
    # o peso passa de um lado para o outro a cada 30 quadros; um pulinho ao trocar de lado; um bufo para frente no meio do ciclo
    pulo = max(0.0, S(u, 30.0, 1.0, math.pi / 2)) ** 2
    return canais(inc_l=-5.0 * math.cos(2 * math.pi * u / P) - 0.0, x=-0.18 + 0.9 * (1 - math.cos(2 * math.pi * u / P)) * 0.5 * -1 + 0.0 + 0.9 * 0.0,
                  y=0.5 * pulo - 0.15, sq=1.0 - 0.03 * pulo + 0.02 * S(u, 30.0, 1.0, 0.0), inc_f=1.0 + 2.5 * S(u, P, 1.0, 0.0) + 1.0 * S(u, P / 2, 1.0, 1.0),
                  giro=-4.0 * math.cos(2 * math.pi * u / P))


_UF = dict(
    u=_k((0, 1.0), (10, 1.06), (22, 1.07), (30, 0.975), (38, 1.01), (46, 0.995), (66, 1.0)),
    sq=_k((0, 0.97), (6, 0.95), (10, 1.03), (22, 1.04), (30, 0.9), (36, 0.94), (42, 0.98), (50, 1.0), (66, 1.0)),
    y=_k((0, 0), (10, 0.5), (22, 0.7), (30, -1.1), (38, -0.2), (46, -0.4), (56, 0.0), (66, 0.0)),
    f=_k((0, 0), (10, 2.0), (22, 4.0), (30, -5.5), (38, -1.5), (46, 0.5), (56, 0.0), (66, 0.0)),
    l=_k((0, 0), (22, 0.0), (32, 3.5), (44, -1.5), (56, 0.0), (66, 0.0)),
    t=_k((0, 0.0), (28, 0.0), (31, 1.0), (44, 0.0), (66, 0.0)))


def m_ufa(f):
    env = E(_UF["t"], f)
    return canais(u=E(_UF["u"], f), sq=E(_UF["sq"], f), y=E(_UF["y"], f), inc_f=E(_UF["f"], f), inc_l=E(_UF["l"], f), treme_l=1.6 * env * math.sin(2 * math.pi * f / 5.5))


_DE = dict(
    y=_k((0, 0), (8, 0.35), (22, -1.6), (34, -1.35), (48, -1.7), (66, -0.4), (84, 0.0)),
    sq=_k((0, 1.0), (8, 1.02), (22, 0.92), (34, 0.935), (48, 0.915), (66, 0.98), (84, 1.0)),
    u=_k((0, 1.0), (22, 0.97), (48, 0.965), (66, 0.995), (84, 1.0)),
    f=_k((0, 0), (8, -2.0), (22, 9.0), (34, 8.0), (48, 10.0), (66, 3.0), (84, 0.0)),
    l=_k((0, 0), (22, -6.0), (34, -7.5), (48, -6.0), (66, -1.5), (84, 0.0)),
    g=_k((0, 0), (22, 7.0), (48, 9.0), (66, 3.0), (84, 0.0)),
    x=_k((0, 0), (22, 0.3), (48, 0.4), (84, 0.0)))


def m_desanimar(f):
    return canais(y=E(_DE["y"], f), sq=E(_DE["sq"], f), u=E(_DE["u"], f), inc_f=E(_DE["f"], f), inc_l=E(_DE["l"], f), giro=E(_DE["g"], f), x=E(_DE["x"], f))


# nome: (quadros, mestre, ciclo)
ACOES = {
    "balao_parado": (180, m_parado, (0, 180)),
    "balao_inclinar": (96, m_inclinar, (24, 96)),
    "balao_pulinho": (40, m_pulinho, None),
    "balao_susto": (36, m_susto, None),
    "balao_estufar": (75, m_estufar, (27, 75)),
    "balao_murchar": (96, m_murchar, (48, 96)),
    "balao_comemorar": (66, m_comemorar, None),
    "balao_rir": (51, m_rir, (15, 51)),
    "balao_bravo": (60, m_bravo, None),
    "balao_concentrar": (114, m_concentrar, (30, 114)),
    "balao_impaciente": (78, m_impaciente, (18, 78)),
    "balao_ufa": (66, m_ufa, None),
    "balao_desanimar": (84, m_desanimar, None),
}

# mola de cada (osso, canal): (omega rad/s, zeta)
MOLAS = {
    ("espinha_1", "lean"): (20.0, 0.80), ("espinha_1", "giro"): (18.0, 0.80), ("espinha_1", "forma"): (24.0, 0.75),
    ("espinha_2", "lean"): (14.0, 0.55), ("espinha_2", "giro"): (13.0, 0.60), ("espinha_2", "forma"): (12.0, 0.50),
    ("espinha_3", "lean"): (10.5, 0.42), ("espinha_3", "giro"): (10.0, 0.50), ("espinha_3", "forma"): (9.0, 0.38),
    ("no", "lean"): (12.0, 0.50),
}
PARTE_DA_INCLINACAO = {"espinha_1": 0.50, "espinha_2": 0.30, "espinha_3": 0.20}
PARTE_DO_GIRO = {"espinha_1": 0.34, "espinha_2": 0.33, "espinha_3": 0.33}
GELATINA = 0.85


def sample_mestre(fn, n):
    return {c: np.array([fn(f)[c] for f in range(n)]) for c in BASE}


def baixar(fim, fn, ciclo):
    """Roda os mestres e as molas e devolve `{osso: {quadro: dict(r=T, mover=, escala=)}}` para os quadros 0..fim."""
    P = (ciclo[1] - ciclo[0]) if ciclo else 0
    extra = 3 * P + 6 if ciclo else 6
    n = fim + 1 + extra
    mestre = sample_mestre(fn, n)
    filtrado = {}

    def resp(canal, osso, grupo):
        k = (canal, osso, grupo)
        if k not in filtrado:
            om, ze = MOLAS[(osso, grupo)]
            filtrado[k] = mola(mestre[canal], om, ze)
        return filtrado[k]

    J = min(10, ciclo[0]) if ciclo else 0

    def valor(arr, f):
        """O valor no quadro `f`: no trecho que repete, o regime permanente das molas (três voltas depois), que fecha o ciclo; nos J quadros antes dele, a entrada se mistura a esse regime."""
        if not ciclo:
            return float(arr[f])
        a = ciclo[0]
        if f >= a:
            return float(arr[f + 3 * P])
        if f <= a - J:
            return float(arr[f])
        t = suave((f - (a - J)) / J)
        return float(arr[f]) * (1 - t) + float(arr[f + 3 * P]) * t

    saida = {o: {} for o in OSSOS_COM_CHAVE}
    for f in range(fim + 1):
        # antes do ciclo: mistura a entrada com o regime nos 12 quadros anteriores ao início do ciclo? (a entrada já termina no valor do ciclo)
        mx = lambda c: valor(mestre[c], f)
        # raiz: o corpo todo (sem mola: o mestre já é o arco desenhado)
        saida["raiz"][f] = dict(mover=(mx("x") + mx("treme_x"), mx("y"), mx("z")))
        for osso in ("espinha_1", "espinha_2", "espinha_3"):
            lean_f = valor(resp("inc_f", osso, "lean"), f) * PARTE_DA_INCLINACAO[osso]
            lean_l = valor(resp("inc_l", osso, "lean"), f) * PARTE_DA_INCLINACAO[osso] + (mx("treme_l") * (0.5 if osso == "espinha_1" else 0.8 if osso == "espinha_2" else 1.0)) * 0.5
            giro = valor(resp("giro", osso, "giro"), f) * PARTE_DO_GIRO[osso]
            h1 = valor(resp("sq", "espinha_1", "forma"), f)
            if osso == "espinha_1":
                h = h1 * mx("u")
                w = mx("u") / math.sqrt(max(h1, 1e-3))
                escala = (w, h, w)
            else:
                suave_ = valor(resp("sq", osso, "forma"), f)
                h = 1.0 + GELATINA * (suave_ - h1) * (0.7 if osso == "espinha_2" else 1.0)
                w = 1.0 / math.sqrt(max(h, 1e-3))
                escala = (w, h, w)
            saida[osso][f] = dict(r=(lean_f, lean_l, giro), escala=escala)
        n_f = -0.35 * valor(resp("inc_f", "no", "lean"), f)
        n_l = -0.35 * valor(resp("inc_l", "no", "lean"), f)
        saida["no"][f] = dict(r=(n_f, n_l, 0.0))
    return saida


# --- para o Blender -----------------------------------------------------------------------------------------------------------
def eixos_do_repouso(arm):
    """Para cada osso: os eixos (no referencial do osso) que inclinam a ponta para a frente (-Y) e para +X; o eixo do osso é o giro."""
    eixos = {}
    for b in arm.data.bones:
        M = b.matrix_local.to_3x3()
        y = (M @ Vector((0, 1, 0))).normalized()
        inv = M.inverted()

        def eixo(d):
            ax = y.cross(Vector(d))
            return inv @ ax.normalized() if ax.length > 1e-6 else Vector((0, 0, 0))
        eixos[b.name] = (eixo((0, -1, 0)), eixo((1, 0, 0)))
    return eixos


def valor_de_t(pb, eixos, t):
    frente, lado, giro = t
    f, s = eixos[pb.name]
    v = f * math.radians(frente) + s * math.radians(lado)
    return (v.x, v.y + math.radians(giro), v.z)


def zerar(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def criar_acao(arm, eixos, nome, fim, canais_):
    if nome in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[nome])
    ad = arm.animation_data_create()
    for tr in [t for t in ad.nla_tracks if t.name == nome]:
        ad.nla_tracks.remove(tr)
    ac = bpy.data.actions.new(nome)
    ac.use_fake_user = True
    ad.action = ac
    for osso, quadros in canais_.items():
        pb = arm.pose.bones[osso]
        pb.rotation_mode = "XYZ"
        usa = {c for v in quadros.values() for c in v}
        for t in sorted(quadros):
            v = quadros[t]
            pb.rotation_euler = valor_de_t(pb, eixos, v["r"]) if "r" in v else (0, 0, 0)
            pb.location = tuple(c * CM for c in v["mover"]) if "mover" in v else (0, 0, 0)
            pb.scale = v["escala"] if "escala" in v else (1, 1, 1)
            if "r" in usa:
                pb.keyframe_insert("rotation_euler", frame=t, group=osso)
            if "mover" in usa:
                pb.keyframe_insert("location", frame=t, group=osso)
            if "escala" in usa:
                pb.keyframe_insert("scale", frame=t, group=osso)
    ad.action = None
    faixa = ad.nla_tracks.new()
    faixa.name = nome
    faixa.strips.new(nome, 0, ac)
    return ac


def diagnostico(nome, fim, quadros, ciclo):
    """Números para conferir sem ver: o maior deslocamento, a maior velocidade do corpo e o fecho do ciclo."""
    y = np.array([quadros["raiz"][f]["mover"][1] for f in range(fim + 1)])
    f1 = np.array([quadros["espinha_1"][f]["r"][0] for f in range(fim + 1)])
    h1 = np.array([quadros["espinha_1"][f]["escala"][1] for f in range(fim + 1)])
    w1 = np.array([quadros["espinha_1"][f]["escala"][0] for f in range(fim + 1)])
    topo = np.array([quadros["espinha_3"][f]["r"][0] for f in range(fim + 1)])
    vol = h1 * w1 * w1
    txt = "%-18s %3d q  y [%.1f, %.1f] cm  vel.máx %.2f cm/q  inc_f1 [%.1f, %.1f]  topo [%.1f, %.1f]  esc.altura [%.2f, %.2f]" % (
        nome, fim, y.min(), y.max(), np.abs(np.diff(y)).max(), f1.min(), f1.max(), topo.min(), topo.max(), h1.min(), h1.max())
    if ciclo:
        a, b = ciclo
        dif = max(abs(quadros[o][b][c][i] - quadros[o][a][c][i]) for o in ("raiz", "espinha_1", "espinha_2", "espinha_3")
                  for c in (("mover",) if o == "raiz" else ("r", "escala")) for i in range(3))
        txt += "  fecho do ciclo %.4f" % dif
    else:
        fim_r = max(abs(quadros[o][fim][c][i]) for o in ("espinha_1", "espinha_2", "espinha_3") for c in ("r",) for i in range(3)) + abs(y[-1])
        txt += "  resíduo no último quadro %.3f" % fim_r
    return txt


def conferir_trechos():
    """O que o meta diz (`dados.TRECHOS`) tem de ser o que as ações fazem: o ciclo de cada uma e o fim da entrada."""
    for nome, (fim, _, ciclo) in ACOES.items():
        t = TRECHOS[nome]
        assert t.get("ciclo") == ciclo, (nome, t.get("ciclo"), ciclo)
        assert t.get("ciclo") is None or t["ciclo"][1] == fim, (nome, "o ciclo vai até o último quadro")
        assert "entrada" not in t or t["entrada"] == (0, ciclo[0]), (nome, t.get("entrada"))


def principal():
    conferir_trechos()
    bpy.context.scene.render.fps = FPS
    arm = bpy.data.objects["balao_esqueleto"]
    ad = arm.animation_data_create()
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    zerar(arm)
    eixos = eixos_do_repouso(arm)
    for nome, (fim, fn, ciclo) in ACOES.items():
        quadros = baixar(fim, fn, ciclo)
        print(diagnostico(nome, fim, quadros, ciclo))
        criar_acao(arm, eixos, nome, fim, quadros)
    zerar(arm)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, max(f for f, _, _ in ACOES.values())


principal()
