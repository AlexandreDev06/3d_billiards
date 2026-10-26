"""Geometria do balão, pura (numpy, sem Blender): `gerar(lod, estado)` devolve vértices, pesos, faces e materiais.

Os vértices saem sempre na mesma ordem, qualquer que seja a expressão (`estado`); só as posições mudam. É isso que permite
tirar as formas (shape keys) por diferença. As faces vêm da primeira chamada. Tudo em centímetros.

Materiais (índice): 0 látex (o jogo tinge), 1 branco do olho, 2 preto do rosto (pupila, sobrancelha, boca), 3 rosa (língua, bochecha),
4 cordinha.
"""
import copy
import math
import os
import sys

import numpy as np

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import dados as D

LATEX, BRANCO, PRETO, ROSA, FIO = 0, 1, 2, 3, 4

ALTA = dict(
    nome="alta", lados=32, aneis_corpo=19,
    globo_setores=18, globo_aneis=5, globo_aneis_pupila=2, brilho2=True,
    sup_J=8, sup_R=4, inf_J=8, inf_R=3,
    sobr_K=6, sobr_colunas=3, boca_K=7, boca_linhas=3, lingua_K=5, bochecha_lados=14,
    fio_lados=6, fio_trechos=10, brilho_lados=8,
)
BAIXA = dict(
    nome="baixa", lados=16, aneis_corpo=9,
    globo_setores=8, globo_aneis=3, globo_aneis_pupila=1, brilho2=False,
    sup_J=3, sup_R=2, inf_J=3, inf_R=1,
    sobr_K=3, sobr_colunas=2, boca_K=5, boca_linhas=2, lingua_K=3, bochecha_lados=6,
    fio_lados=4, fio_trechos=4, brilho_lados=4,
)


def estado_da_cara(nome):
    return copy.deepcopy(D.CARAS[nome])


def sstep(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


# --- o corpo --------------------------------------------------------------------------------------------------------------
def raio_do_corpo_em_t(t):
    """O raio do balão à fração `t` da altura (0 no nó, 1 no topo): a gota de `silhueta.ts`."""
    k = min(max(t, 0.0), 1.0)
    f = D.FRACAO_DO_BOJO
    if k <= f:
        return D.RAIO * max(1 - ((f - k) / f) ** D.EXPOENTE_DE_BAIXO, 0.0) ** (1 / D.EXPOENTE_DE_BAIXO)
    return D.RAIO * max(1 - ((k - f) / (1 - f)) ** D.EXPOENTE_DE_CIMA, 0.0) ** (1 / D.EXPOENTE_DE_CIMA)


def raio_do_corpo(z):
    return raio_do_corpo_em_t((z + D.METADE_ALTURA) / (2 * D.METADE_ALTURA))


def inclinacao_do_corpo(z, h=0.01):
    return (raio_do_corpo(z + h) - raio_do_corpo(z - h)) / (2 * h)


def superficie(x, z, fora=0.0):
    """Ponto da pele a `x` cm do meio (ao longo do arco) na altura `z`, empurrado `fora` para fora; devolve (ponto, normal)."""
    r = raio_do_corpo(z)
    fi = x / max(r, 1e-6)
    n = np.array([math.sin(fi), -math.cos(fi), -inclinacao_do_corpo(z)])
    n /= np.linalg.norm(n)
    p = np.array([r * math.sin(fi), -r * math.cos(fi), z]) + n * fora
    return p, n


def pesos_do_corpo(z):
    """Mistura das três espinhas e do nó por altura: a faixa do rosto (-2,2 a 4,4) é só da `espinha_2`."""
    w3 = sstep((z - 4.4) / 2.2)
    w1 = sstep((-2.2 - z) / 3.3)
    w2 = 1.0 - w1 - w3
    wno = sstep((-6.3 - z) / 1.0)
    pesos = [("espinha_1", w1 * (1 - wno)), ("espinha_2", w2 * (1 - wno)), ("espinha_3", w3 * (1 - wno)), ("no", wno)]
    return [(b, w) for b, w in pesos if w > 1e-4]


# --- cordinha -------------------------------------------------------------------------------------------------------------
def catmull(pontos, por_trecho):
    pts = [np.array(p, dtype=float) for p in pontos]
    n = len(pts)
    saida = []
    for i in range(n - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n - 1)]
        for k in range(por_trecho):
            t = k / por_trecho
            saida.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    saida.append(pts[-1])
    return saida


def curva_da_cordinha(por_trecho=12):
    """Os pontos da cordinha em repouso, do nó para baixo, e o comprimento acumulado de cada um."""
    z0 = D.NO_FUNDO_Z
    c = D.CORDINHA_COMPRIMENTO
    base = [(dx, dy, z0 - c * i / (len(D.CORDINHA_ONDA) - 1)) for i, (dx, dy) in enumerate(D.CORDINHA_ONDA)]
    pts = catmull(base, por_trecho)
    arco = [0.0]
    for a, b in zip(pts[:-1], pts[1:]):
        arco.append(arco[-1] + float(np.linalg.norm(b - a)))
    return pts, arco


def pontos_dos_ossos_da_cordinha():
    """(cabeça, cauda) de cada osso `cordinha_i`: pontos da curva a intervalos iguais de arco."""
    pts, arco = curva_da_cordinha()
    total = arco[-1]
    n = D.CORDINHA_OSSOS

    def em(s):
        s = min(max(s, 0.0), total)
        for i in range(len(arco) - 1):
            if arco[i + 1] >= s:
                f = (s - arco[i]) / max(arco[i + 1] - arco[i], 1e-9)
                return pts[i] + (pts[i + 1] - pts[i]) * f
        return pts[-1]
    return [(em(total * i / n), em(total * (i + 1) / n)) for i in range(n)]


# --- a montagem -----------------------------------------------------------------------------------------------------------
class Montagem:
    """Acumula vértices (com pesos) e faces (com material). As faces só valem na primeira montagem."""

    def __init__(self):
        self.V, self.W, self.F, self.M = [], [], [], []

    def v(self, p, pesos):
        self.V.append(np.array(p, dtype=float))
        self.W.append(pesos)
        return len(self.V) - 1

    def face(self, idx, mat, fora):
        """Uma face (3 ou 4 vértices) com a normal virada para `fora` (vetor, ou None para deixar como veio)."""
        idx = list(idx)
        if fora is not None:
            a, b, c = (self.V[i] for i in idx[:3])
            if np.dot(np.cross(b - a, c - a), fora) < 0:
                idx.reverse()
        self.F.append(tuple(idx))
        self.M.append(mat)


def _quadro_do_olho(x, z):
    """(centro da pele, normal, cima, direita) no ponto do olho; direita é a do espectador (+X no meio do rosto)."""
    p, n = superficie(x, z)
    cima = np.array([0.0, 0.0, 1.0]) - n * n[2]
    cima /= np.linalg.norm(cima)
    direita = np.cross(cima, n)
    return p, n, cima, direita


def centro_do_olho(lado):
    """O centro do globo do olho `esq` (lado=+1, +X) ou `dir` (lado=-1)."""
    p, n, _, _ = _quadro_do_olho(lado * D.OLHO_X, D.OLHO_Z)
    return p - n * D.OLHO_AFUNDADO


def eixo_do_olhar(lado):
    """O eixo do olhar em repouso: para a frente (-Y), paralelo nos dois olhos, não pela normal da pele."""
    return np.array([0.0, -1.0, 0.0])


def gerar(lod, estado):
    """Monta o balão neste nível de detalhe e nesta expressão (`estado`, um item de `dados.CARAS` com `palpebra_*` possivelmente trocados)."""
    m = Montagem()
    _corpo(m, lod)
    for lado in (+1, -1):
        _olho(m, lod, estado, lado)
        _palpebras(m, lod, estado, lado)
        _sobrancelha(m, lod, estado, lado)
        _bochecha(m, lod, estado, lado)
    _boca(m, lod, estado)
    _cordinha(m, lod)
    return m


def _corpo(m, lod):
    lados = lod["lados"]
    H = D.METADE_ALTURA
    t_min = 0.02
    aneis = []   # (r, z)
    n = lod["aneis_corpo"]
    for k in range(1, n + 1):
        s = 0.5 - 0.5 * math.cos(math.pi * k / n)     # 0..1, mais denso nas pontas
        t = 1 - s * (1 - t_min)
        aneis.append((raio_do_corpo_em_t(t), -H + 2 * H * t))
    aneis += [(r, z) for r, z in D.NO_PERFIL]
    topo = m.v((0, 0, H), pesos_do_corpo(H))
    fundo = m.v((0, 0, D.NO_FUNDO_Z), [("no", 1.0)])
    todos = []
    for r, z in aneis:
        pw = pesos_do_corpo(z)
        todos.append([m.v((r * math.sin(2 * math.pi * k / lados), -r * math.cos(2 * math.pi * k / lados), z), pw) for k in range(lados)])
    for k in range(lados):
        m.face((topo, todos[0][k], todos[0][(k + 1) % lados]), LATEX, np.array([0, 0, 1.0]))
    for i in range(len(todos) - 1):
        for k in range(lados):
            a, b = todos[i], todos[i + 1]
            alto = np.mean([m.V[j] for j in (a[k], a[(k + 1) % lados], b[k], b[(k + 1) % lados])], axis=0)
            fora = np.array([alto[0], alto[1], 0.0])
            m.face((a[k], a[(k + 1) % lados], b[(k + 1) % lados], b[k]), LATEX, fora)
    for k in range(lados):
        a = todos[-1]
        m.face((fundo, a[(k + 1) % lados], a[k]), LATEX, np.array([0, 0, -1.0]))


def _dir_no_olho(vet, theta, omega):
    """Direção a `theta` do eixo do olhar e `omega` (graus a partir da direita, para cima), na base (direita, cima, normal)."""
    t, o = math.radians(theta), math.radians(omega)
    d, c, n = vet
    return math.sin(t) * (math.cos(o) * d + math.sin(o) * c) + math.cos(t) * n


def _olho(m, lod, estado, lado):
    centro = centro_do_olho(lado)
    osso = "olho_esq" if lado > 0 else "olho_dir"
    pw = [(osso, 1.0)]
    n = eixo_do_olhar(lado)
    cima = np.array([0.0, 0.0, 1.0])
    direita = np.cross(cima, n)
    base = (direita, cima, n)
    R = D.OLHO_RAIO
    setores, aneis, de_pupila = lod["globo_setores"], lod["globo_aneis"], lod["globo_aneis_pupila"]
    theta_p = D.PUPILA_RAIO_GRAUS * estado["pupila"]
    thetas = [theta_p * (i + 1) / de_pupila for i in range(de_pupila)]
    resto = aneis - de_pupila
    thetas += [theta_p + (D.GLOBO_ABERTURA - theta_p) * (j + 1) / resto for j in range(resto)]
    polo = m.v(centro + n * R, pw)
    fileiras = []
    for th in thetas:
        fileiras.append([m.v(centro + R * _dir_no_olho(base, th, 360.0 * k / setores), pw) for k in range(setores)])
    for k in range(setores):
        m.face((polo, fileiras[0][k], fileiras[0][(k + 1) % setores]), PRETO, n)
    for i in range(len(fileiras) - 1):
        mat = PRETO if i + 1 < de_pupila else BRANCO
        for k in range(setores):
            a, b = fileiras[i], fileiras[i + 1]
            fora = (m.V[a[k]] + m.V[b[k]]) / 2 - centro
            m.face((a[k], a[(k + 1) % setores], b[(k + 1) % setores], b[k]), mat, fora)
    # os reflexos: disquinhos brancos um fio acima da pupila; o grande no alto à esquerda (de quem olha), um pequeno no lado oposto (só na alta)
    reflexos = [(0.52 * theta_p + 3.0, D.BRILHO_GRAUS[1], D.BRILHO_RAIO * (0.6 + 0.4 * estado["pupila"]))]
    if lod["brilho2"]:
        reflexos.append((0.42 * theta_p, D.BRILHO_GRAUS[1] + 180.0, D.BRILHO_RAIO * 0.42))
    lados_b = lod["brilho_lados"]
    for t_g, o_g, raio in reflexos:
        dc = _dir_no_olho(base, t_g, o_g)
        rg = math.degrees(raio / R)
        c = m.v(centro + (R + D.SOBRA) * dc, pw)
        e1 = np.cross(dc, n)
        if np.linalg.norm(e1) < 1e-6:
            e1 = direita
        e1 = e1 / np.linalg.norm(e1)
        e2 = np.cross(dc, e1)
        anel = []
        for k in range(lados_b):
            w = 2 * math.pi * k / lados_b
            d = dc * math.cos(math.radians(rg)) + math.sin(math.radians(rg)) * (math.cos(w) * e1 + math.sin(w) * e2)
            anel.append(m.v(centro + (R + D.SOBRA) * d / np.linalg.norm(d), pw))
        for k in range(lados_b):
            m.face((c, anel[k], anel[(k + 1) % lados_b]), BRANCO, dc)


def _beta(par, psi, lado):
    """Graus a partir do topo (ou de baixo) na direção azimutal `psi` (−90 = esquerda do espectador): `par` = (interna, externa)."""
    interna, externa = par
    # o olho esq (+X) tem a borda interna do lado do meio do rosto, ou seja, a −90 (esquerda do espectador)
    f = (psi + 90.0) / 180.0 if lado > 0 else 1.0 - (psi + 90.0) / 180.0
    return interna + (externa - interna) * f


def _palpebras(m, lod, estado, lado):
    _, n, cima, direita = _quadro_do_olho(lado * D.OLHO_X, D.OLHO_Z)
    centro = centro_do_olho(lado)
    base_dir = (direita, cima, n)
    Rl = D.OLHO_RAIO * D.PALPEBRA_RAIO
    pw = [("espinha_2", 1.0)]
    for chave, sinal, J, R in (("palpebra_sup", 1.0, lod["sup_J"], lod["sup_R"]), ("palpebra_inf", -1.0, lod["inf_J"], lod["inf_R"])):
        par = estado[chave]
        polo = m.v(centro + Rl * sinal * cima, pw)
        fileiras = []
        for i in range(1, R + 1):
            fila = []
            for j in range(2 * J + 1):
                psi = -90.0 + 180.0 * j / (2 * J)
                beta = math.radians(_beta(par, psi, lado)) * i / R
                ps = math.radians(psi)
                d = math.sin(beta) * (math.sin(ps) * direita + math.cos(ps) * n) + math.cos(beta) * sinal * cima
                fila.append(m.v(centro + Rl * d, pw))
            fileiras.append(fila)
        for j in range(2 * J):
            m.face((polo, fileiras[0][j], fileiras[0][j + 1]), LATEX, (m.V[fileiras[0][j]] + m.V[fileiras[0][j + 1]]) / 2 - centro)
        for i in range(R - 1):
            for j in range(2 * J):
                a, b = fileiras[i], fileiras[i + 1]
                fora = (m.V[a[j]] + m.V[b[j + 1]]) / 2 - centro
                m.face((a[j], a[j + 1], b[j + 1], b[j]), LATEX, fora)


def _sobrancelha(m, lod, estado, lado):
    s = estado["sobrancelha"]
    K, colunas = lod["sobr_K"], lod["sobr_colunas"]
    pw = [("espinha_2", 1.0)]
    fileiras = []
    for c in range(colunas):
        fileiras.append([])
    for k in range(K):
        sig = -1.0 + 2.0 * k / (K - 1)            # −1 interna, +1 externa
        x = lado * (s["x"] + sig * s["meia"])
        y = D.OLHO_Z + s["yc"] + s["inclinacao"] * sig + s["arco"] * (1 - sig * sig)
        esp = D.SOBRANCELHA_ESPESSURA * (1 - 0.45 * sig * sig)
        for c in range(colunas):
            f = c / (colunas - 1) - 0.5
            elevar = D.SOBRA + (0.07 * (1 - abs(2 * f)) if colunas > 2 else 0.0)
            p, nor = superficie(x, y + f * esp, elevar)
            fileiras[c].append(m.v(p, pw))
    for c in range(colunas - 1):
        for k in range(K - 1):
            a, b = fileiras[c], fileiras[c + 1]
            p, nor = superficie(lado * s["x"], D.OLHO_Z + s["yc"], 0)
            m.face((a[k], a[k + 1], b[k + 1], b[k]), PRETO, nor)


def _bochecha(m, lod, estado, lado):
    lados = lod["bochecha_lados"]
    r = estado["bochecha"]
    pw = [("espinha_2", 1.0)]
    cx, cz = lado * D.BOCHECHA_X, D.BOCHECHA_Z
    p, nor = superficie(cx, cz, D.SOBRA * 0.5)
    c = m.v(p, pw)
    anel = []
    for k in range(lados):
        w = 2 * math.pi * k / lados
        q, _ = superficie(cx + r * 1.25 * math.cos(w), cz + r * 0.8 * math.sin(w), D.SOBRA * 0.5)
        anel.append(m.v(q, pw))
    for k in range(lados):
        m.face((c, anel[k], anel[(k + 1) % lados]), ROSA, nor)


def _curva_da_boca(par, s):
    centro, ponta = par
    return centro + (ponta - centro) * s * s


def _boca(m, lod, estado):
    b = estado["boca"]
    K, linhas = lod["boca_K"], lod["boca_linhas"]
    pw = [("espinha_2", 1.0)]
    cols = []
    for i in range(linhas):
        f = i / (linhas - 1)         # 0 no topo, 1 no fundo
        cols.append([])
        for k in range(K):
            s = -1.0 + 2.0 * k / (K - 1)
            ytopo = _curva_da_boca(b["topo"], s)
            yfundo = _curva_da_boca(b["fundo"], s)
            y = D.BOCA_Z + ytopo + (yfundo - ytopo) * f
            p, nor = superficie(b["meia"] * s, y, D.SOBRA)
            cols[i].append(m.v(p, pw))
    _, nor0 = superficie(0, D.BOCA_Z, 0)
    for i in range(linhas - 1):
        for k in range(K - 1):
            m.face((cols[i][k], cols[i][k + 1], cols[i + 1][k + 1], cols[i + 1][k]), PRETO, nor0)
    # a língua: um remendo rosa no fundo da boca; sem altura, ele colapsa na borda de baixo
    Kl = lod["lingua_K"]
    topo_l, baixo_l = [], []
    for k in range(Kl):
        u = -1.0 + 2.0 * k / (Kl - 1)
        s = u * 0.55
        yfundo = _curva_da_boca(b["fundo"], s)
        yt = _curva_da_boca(b["topo"], s)
        alt = min(b["lingua"] * (1 - 0.85 * u * u), (yt - yfundo) * 0.85)
        p1, _ = superficie(b["meia"] * s, D.BOCA_Z + yfundo + 0.02, D.SOBRA * 1.6)
        p2, _ = superficie(b["meia"] * s, D.BOCA_Z + yfundo + 0.02 + max(alt, 0.0), D.SOBRA * 1.6)
        baixo_l.append(m.v(p1, pw))
        topo_l.append(m.v(p2, pw))
    for k in range(Kl - 1):
        m.face((baixo_l[k], baixo_l[k + 1], topo_l[k + 1], topo_l[k]), ROSA, nor0)


def _cordinha(m, lod):
    pts, arco = curva_da_cordinha(lod["fio_trechos"])
    total = arco[-1]
    lados = lod["fio_lados"]
    n_o = D.CORDINHA_OSSOS

    def pesos_em(s):
        u = s / total * n_o
        ws = []
        for i in range(n_o):
            w = max(0.0, 1.0 - abs(u - (i + 0.5)))
            if i == 0 and u < 0.5:
                w = 1.0
            if i == n_o - 1 and u > n_o - 0.5:
                w = 1.0
            if w > 1e-4:
                ws.append(("cordinha_%d" % (i + 1), w))
        soma = sum(w for _, w in ws)
        return [(b, w / soma) for b, w in ws]

    aneis = []
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        tang = b - a
        tang /= np.linalg.norm(tang)
        ref = np.array([1.0, 0.0, 0.0]) if abs(tang[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
        e1 = np.cross(tang, ref)
        e1 /= np.linalg.norm(e1)
        e2 = np.cross(tang, e1)
        pw = pesos_em(arco[i])
        aneis.append([m.v(p + D.CORDINHA_RAIO * (math.cos(2 * math.pi * k / lados) * e1 + math.sin(2 * math.pi * k / lados) * e2), pw)
                      for k in range(lados)])
    ponta = m.v(pts[-1] + (pts[-1] - pts[-2]) / np.linalg.norm(pts[-1] - pts[-2]) * D.CORDINHA_RAIO, pesos_em(total))
    for i in range(len(aneis) - 1):
        for k in range(lados):
            a, b = aneis[i], aneis[i + 1]
            centro = (m.V[a[k]] + m.V[b[(k + 1) % lados]]) / 2
            eixo = (pts[i] + pts[i + 1]) / 2
            m.face((a[k], a[(k + 1) % lados], b[(k + 1) % lados], b[k]), FIO, centro - eixo)
    for k in range(lados):
        m.face((ponta, aneis[-1][k], aneis[-1][(k + 1) % lados]), FIO, m.V[ponta] - pts[-1])


def contagem(m):
    return sum(len(f) - 2 for f in m.F)


if __name__ == "__main__":
    for lod in (ALTA, BAIXA):
        m = gerar(lod, estado_da_cara(D.NOME_DA_BASE))
        print(lod["nome"], "triângulos", contagem(m), "vértices", len(m.V))
        for nome in D.CARAS:
            m2 = gerar(lod, estado_da_cara(nome))
            assert len(m2.V) == len(m.V) and len(m2.F) == len(m.F), nome
        print("  expressões com a mesma topologia")
