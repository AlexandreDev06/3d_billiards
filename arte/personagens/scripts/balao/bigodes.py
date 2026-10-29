"""Os cinco bigodes do balão (P8), em numpy puro: `gerar_bigode(lod, estado, id)` monta o bigode na boca da cara pedida.

Cada bigode é uma ou mais fitas coladas na pele, em coordenadas da pele (x ao longo do arco, z de altura; ver `geometria.superficie`). A fita de corpo fica sobre o
lábio de cima: a borda de baixo acompanha o contorno de fora do lábio (`borda_do_labio`) da cara, então o bigode sobe com o sorriso, estreita com o susto e anda de lado
com a boca torta, sem nunca descer à boca. As pontas dos bigodes de guidão e de Dalí (fitas de linha de centro) partem do canto da boca e acompanham o canto. Nada passa de
`teto_do_olho` (um círculo em volta de cada olho, com folga): o bigode nunca encosta no olho nem na pálpebra de baixo, em nenhuma cara.

A topologia é a mesma em toda cara (só as posições mudam), por isso as formas saem por diferença, como as do rosto. Não há pesos: o rosto inteiro (z de -2,2 a 4,4)
é só da `espinha_2`, então o bigode vai como malha comum filha desse osso e anda exatamente como a boca. O UV é (ao longo, através): a textura de fios corre ao longo.
"""
import math
import os
import sys

import numpy as np

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import dados as D
import geometria as G

RAIO_PROIBIDO = 1.30          # cm, em volta do centro de cada olho (na pele): o bigode não entra (o fundo da pálpebra de baixo é 1,23; a sobrancelha pousa a 1,26)
MARGEM_SOBRE_O_LABIO = 0.02   # cm: o pé da fita fica um fio acima do contorno do lábio (a corda da malha baixa e as misturas pela metade não o fazem entrar na boca)
SOBRA_BIGODE = 0.8            # a borda do bigode fica `SOBRA_BIGODE * sobra` acima da pele (a malha baixa sobe mais)


def _passo(x):
    return G.sstep(x)


def funcoes_da_boca(b):
    """As contas da boca de `geometria._boca` (z relativo a `BOCA_Z`): x(s), topo(s), fundo(s) e a largura do lábio de cima em s."""
    x0, meia = b["x0"], b["meia"]

    def y_de(par, s):
        centro, ponta = par
        return centro + (ponta - centro) * s * s + b["inclina"] * s + b["canto"] * max(s, 0.0) ** 2

    def topo(s):
        return max(y_de(b["topo"], s), y_de(b["fundo"], s) + 0.04)

    def larg(s):
        return 0.16 * math.cos(0.5 * math.pi * s) ** 0.8 + 0.01

    return x0, meia, topo, larg


def borda_do_labio(b):
    """`f(x)`: a altura (z da pele) do contorno de fora do lábio de cima nesta boca, e além dos cantos uma subida suave (o bigode continua na face)."""
    x0, meia, topo, larg = funcoes_da_boca(b)

    def f(x):
        s = (x - x0) / meia
        sc = min(max(s, -1.0), 1.0)
        z = D.BOCA_Z + topo(sc) + larg(sc)
        d = (abs(s) - 1.0) * meia
        if d > 0:
            z += 0.18 * (1.0 - math.exp(-d / 0.6))
        return z
    return f


def teto_do_olho(x):
    """A altura máxima (z) permitida em `x`: abaixo do círculo proibido em volta de cada olho; sem limite fora deles."""
    teto = 99.0
    for lado in (+1, -1):
        dx = abs(x - lado * D.OLHO_X)
        if dx < RAIO_PROIBIDO:
            teto = min(teto, D.OLHO_Z - math.sqrt(RAIO_PROIBIDO ** 2 - dx * dx))
    return teto


def _dentro_do_olho(x, z, folga=0.01):
    return any(math.hypot(x - lado * D.OLHO_X, z - D.OLHO_Z) < RAIO_PROIBIDO - folga for lado in (+1, -1))


def _empurra_do_olho(x, z):
    """O ponto fora do círculo proibido em volta de cada olho (empurrado na direção que sai do centro do olho), para as pontas finas nunca entrarem no olho."""
    for lado in (+1, -1):
        dx, dz = x - lado * D.OLHO_X, z - D.OLHO_Z
        d = math.hypot(dx, dz)
        if 1e-6 < d < RAIO_PROIBIDO:
            x, z = lado * D.OLHO_X + dx / d * RAIO_PROIBIDO, D.OLHO_Z + dz / d * RAIO_PROIBIDO
    return x, z


def _ruido(u, v, semente, f=1.0):
    """Ruído suave e determinístico de duas variáveis (soma de ondas), de -1 a 1."""
    a = math.sin(6.3 * f * u + 1.7 * semente + 2.1 * math.sin(2.9 * f * v + semente))
    b = math.sin(11.7 * f * u - 2.3 * semente + 1.3 * math.sin(5.1 * f * v - semente))
    c = math.sin(4.1 * f * v + 3.1 * semente + 1.9 * math.sin(3.3 * f * u))
    return (a + 0.6 * b + 0.8 * c) / 2.4


# --- as fitas ---------------------------------------------------------------------------------------------------------------
class _Fita:
    """Uma grade (ao longo x através) de pontos da pele: `xz[k][j]` (x e z), `elev[k][j]` (cm acima da pele)."""

    def __init__(self, xz, elev, ao_longo=None):
        self.xz = xz
        self.elev = elev


def _faixa(b, x_de_u, base_de_u, alt_de_u, esp_de_u, K, V, lump=0.0, semente=0):
    """Uma fita de corpo: sobre o lábio, de `base` (z do pé) até `base + alt`, `esp` cm de espessura no meio. As funções recebem u de -1 a 1 e o x absoluto."""
    borda = borda_do_labio(b)
    xz = np.zeros((K, V, 2))
    elev = np.zeros((K, V))
    for k in range(K):
        u = -1.0 + 2.0 * k / (K - 1)
        x = x_de_u(u)
        xc = x_de_u(0.0)
        zb = borda(x) + base_de_u(u, x) + MARGEM_SOBRE_O_LABIO
        n = 0
        while _dentro_do_olho(x, zb) and abs(x - xc) > 0.03 and n < 200:        # a boca sobe perto do olho (convencido, rindo): a ponta da fita para antes, em vez de entrar no círculo do olho
            x -= math.copysign(0.03, x - xc)
            zb = borda(x) + base_de_u(u, x) + MARGEM_SOBRE_O_LABIO
            n += 1
        h = alt_de_u(u, x)
        if lump:
            h *= 1.0 + lump * _ruido(u, 0.0, semente, 1.0)
        zt = zb + h
        sala = teto_do_olho(x) - zb                      # quanto cabe entre o pé e o círculo proibido
        if sala < h:
            h = max(sala, 0.03)                          # estreita em vez de entrar no olho (a espessura acompanha para a fita não virar fio)
            zt = zb + h
        esp = esp_de_u(u, x) * min(1.0, 0.35 + h / max(alt_de_u(u, x), 1e-6) * 0.65)
        for j in range(V):
            v = j / (V - 1)
            xz[k, j] = (x, zb + v * (zt - zb))
            e = math.sin(math.pi * v) ** 0.55
            if lump:
                e *= 1.0 + 0.5 * lump * _ruido(u, v, semente + 1, 1.6)
            elev[k, j] = esp * e
    return _Fita(xz, elev)


def _ponta(b, a_x, a_dz, caminho, larg0, larg1, esp, K, V, sinal):
    """Uma ponta (bigode de guidão e de Dalí): linha de centro que parte do ponto A (x relativo à posição `a_x` do canto, z relativo ao lábio mais `a_dz`) e segue
    `caminho(t)` -> (dx, dz) para fora (para o lado do `sinal`), com meia largura de `larg0` a `larg1`."""
    borda = borda_do_labio(b)
    x0, meia, _, _ = funcoes_da_boca(b)
    ax = x0 + sinal * max(a_x, meia + 0.05)
    az = borda(ax) + a_dz
    pts = []
    for k in range(K):
        t = k / (K - 1)
        dx, dz = caminho(t)
        pts.append((ax + sinal * dx, az + dz))
    xz = np.zeros((K, V, 2))
    elev = np.zeros((K, V))
    for k in range(K):
        a, c = pts[max(k - 1, 0)], pts[min(k + 1, K - 1)]
        tx, tz = c[0] - a[0], c[1] - a[1]
        n = math.hypot(tx, tz) or 1.0
        nx, nz = -tz / n, tx / n
        t = k / (K - 1)
        w = larg0 + (larg1 - larg0) * t
        for j in range(V):
            v = j / (V - 1) * 2.0 - 1.0
            x, z = pts[k][0] + nx * v * w, pts[k][1] + nz * v * w
            teto = teto_do_olho(x)
            z = min(z, teto - 0.01) if teto < 90 else z
            x, z = _empurra_do_olho(x, z)
            xz[k, j] = (x, z)
            elev[k, j] = esp * (1.0 - 0.75 * t) * (1.0 - v * v) ** 0.5
    return _Fita(xz, elev)


# --- os desenhos ------------------------------------------------------------------------------------------------------------
def _fino(b, lod):
    x0, meia, _, _ = funcoes_da_boca(b)
    K, V = lod["bigode_K"], 3
    L = 1.50
    return [_faixa(b, lambda u: x0 + L * u, lambda u, x: 0.015, lambda u, x: 0.10 + 0.17 * math.cos(0.5 * math.pi * abs(u)) ** 1.3,
                   lambda u, x: 0.085, K, V)]


def _bigodao(b, lod):
    x0, meia, _, _ = funcoes_da_boca(b)
    K, V = lod["bigode_K"] + 10, 5
    L = 2.05

    def base(u, x):
        d = (abs(x - x0) - meia - 0.05) / 0.55
        return -0.30 * _passo(d)                       # as pontas caem ao lado do canto da boca, nunca sobre ela

    return [_faixa(b, lambda u: x0 + L * u, base, lambda u, x: 0.15 + 0.52 * math.cos(0.5 * math.pi * abs(u) ** 1.4) ** 1.1,
                   lambda u, x: 0.30 * (0.55 + 0.45 * math.cos(0.5 * math.pi * u)), K, V, lump=0.13, semente=3)]


def _guidao(b, lod):
    x0, meia, _, _ = funcoes_da_boca(b)
    K, V = lod["bigode_K"], 4
    L = 1.30
    corpo = _faixa(b, lambda u: x0 + L * u, lambda u, x: 0.012, lambda u, x: 0.11 + 0.25 * math.cos(0.5 * math.pi * abs(u)) ** 1.2,
                   lambda u, x: 0.13, K, V, lump=0.05, semente=5)

    def caminho(t):
        # haste para fora e, no fim, o cacho: um quarto de volta mais três quartos de espiral que fecha para dentro
        if t < 0.42:
            q = t / 0.42
            return (0.95 * q, 0.04 * q + 0.03 * q * q)
        q = (t - 0.42) / 0.58
        ang = math.radians(-90.0 + 292.0 * q)
        rho = 0.23 * (1.0 - 0.45 * q)
        return (0.95 + rho * math.cos(ang), 0.07 + 0.23 + rho * math.sin(ang))

    n = lod["ponta_K"]
    pontas = [_ponta(b, 1.25, 0.03, caminho, 0.115, 0.075, 0.10, n, 3, s) for s in (+1, -1)]
    return [corpo] + pontas


def _dali(b, lod):
    x0, meia, _, _ = funcoes_da_boca(b)
    K, V = lod["bigode_K"], 3
    L = 1.15
    corpo = _faixa(b, lambda u: x0 + L * u, lambda u, x: 0.012, lambda u, x: 0.075 + 0.115 * math.cos(0.5 * math.pi * abs(u)) ** 1.2,
                   lambda u, x: 0.09, K, V)

    def caminho(t):
        # curva de Bézier cúbica: sai rente ao lábio, passa por baixo do olho e sobe pelo lado de fora dele
        p = [(0.0, 0.0), (1.0, 0.0), (1.9, 0.02), (2.2, 1.05)]
        a = (1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3
        return (sum(w * q[0] for w, q in zip(a, p)), sum(w * q[1] for w, q in zip(a, p)))

    n = lod["ponta_K"] + 14
    pontas = [_ponta(b, 1.10, 0.04, caminho, 0.095, 0.035, 0.085, n, 3, s) for s in (+1, -1)]
    return [corpo] + pontas


def _chevron(b, lod):
    x0, meia, _, _ = funcoes_da_boca(b)
    K, V = lod["bigode_K"], 5
    L = 1.32
    return [_faixa(b, lambda u: x0 + L * u, lambda u, x: 0.02, lambda u, x: 0.04 + 0.40 * max(1.0 - abs(u) ** 3.2, 0.0) ** 0.5,
                   lambda u, x: 0.17 * (0.8 + 0.2 * math.cos(0.5 * math.pi * u)), K, V, lump=0.06, semente=9)]


DESENHOS = {"bigode_fino": _fino, "bigodao": _bigodao, "bigode_guidao": _guidao, "bigode_dali": _dali, "bigode_chevron": _chevron}


def gerar_bigode(lod, estado, id_do_bigode):
    """O bigode `id_do_bigode` na boca de `estado`: devolve uma `geometria.Montagem` (vértices, UV, faces; um material só) e, em `m.pele`, (x, z, elevação) de cada vértice."""
    m = G.Montagem()
    m.com_faces = True
    m.pele = []
    sobra = lod["sobra"] * SOBRA_BIGODE
    fitas = DESENHOS[id_do_bigode](estado["boca"], lod)
    _, nor = G.superficie(0.0, D.BOCA_Z, 0.0)
    for f in fitas:
        K, V, _ = f.xz.shape
        idx = np.zeros((K, V), dtype=np.int64)
        for k in range(K):
            for j in range(V):
                x, z = f.xz[k, j]
                e = f.elev[k, j]
                p, _ = G.superficie(float(x), float(z), sobra + float(e))
                idx[k, j] = m.v(p, [], (k / (K - 1), j / (V - 1)))
                m.pele.append((float(x), float(z), sobra + float(e)))
        for k in range(K - 1):
            for j in range(V - 1):
                m.face((idx[k, j], idx[k + 1, j], idx[k + 1, j + 1], idx[k, j + 1]), 0, G.superficie(float(f.xz[k, j, 0]), float(f.xz[k, j, 1]), 0.0)[1])
    return m


def contagem(m):
    return G.contagem(m)


if __name__ == "__main__":
    for lod in (G.ALTA, G.BAIXA):
        for i in D.IDS_DE_BIGODE:
            m = gerar_bigode(lod, G.estado_da_cara("cara_neutro"), i)
            print(lod["nome"], i, "triângulos", contagem(m), "vértices", len(m.V))
            for nome in D.FORMAS:
                m2 = gerar_bigode(lod, G.estado_da_cara(nome), i)
                assert len(m2.V) == len(m.V), (i, nome)
