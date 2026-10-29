"""Geometria do balão (v2), pura (numpy, sem Blender): `gerar(lod, estado)` devolve vértices, pesos, UVs, cores de vértice, faces e materiais.

Os vértices saem sempre na mesma ordem, qualquer que seja a expressão (`estado`); só as posições mudam. É isso que permite
tirar as formas (shape keys) por diferença. As faces vêm da primeira chamada. Tudo em centímetros.

Materiais (índice): 0 látex (o jogo tinge), 1 olho (esclera e íris, com textura), 2 preto do rosto (pupila, sobrancelha, contorno das pálpebras),
3 língua, 4 cordinha, 5 brilho dos olhos (reflexos), 6 bochecha (alfa), 7 dentes, 8 interior da boca, 9 íris (P8: cinza, o jogo tinge com a cor do olho; uma segunda pele
sobre o globo, um fio acima), 10 olheira (P8: alfa, só aparece no estilo cansado).

O rosto é pintado sobre a pele, um fio acima dela. Cada pálpebra é uma casca esférica um pouco maior que o globo, que se enrola na borda e
pousa no globo (sem fresta); a borda enrolada de cima é preta (o contorno do olho, legível de longe).
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

LATEX, OLHO, PRETO, LINGUA, FIO, BRILHO, BLUSH, DENTE, BOCA, IRIS, OLHEIRA = range(11)
NOMES_DOS_MATERIAIS = ["latex", "olho", "rosto_preto", "lingua", "cordinha", "brilho", "bochecha", "dente", "boca", "iris", "olheira"]

ALTA = dict(
    nome="alta", sobra=D.SOBRA, lados=72, aneis_corpo=46, no_sub=4,
    globo_setores=32, globo_thetas=[31.0, 36.0, 41.0, 46.0, 55.0, 66.0, 80.0, 98.0, 118.0, 142.0, 164.0], brilho2=True, brilho_lados=14,
    lid_J=20, lid_Rs=5, lid_phis=[67.5, 45.0, 22.5, 0.0], liner_sup=1, liner_inf=0,
    sobr_K=11, sobr_cols=3, boca_K=11, boca_linhas=4, dentes_K=9, lingua_K=9, bochecha_lados=16, bochecha_aneis=3, fio_aneis=44, fita_K=13, fita_lash=4,
    iris_thetas=[31.0, 36.0, 41.0], vagas_reflexo=4, est_Rs=3, est_phis=[60.0, 30.0, 0.0], olheira_K=13, olheira_W=3, bigode_K=48, ponta_K=36,
)
BAIXA = dict(
    nome="baixa", sobra=D.SOBRA_BAIXA, lados=28, aneis_corpo=17, no_sub=2,
    globo_setores=16, globo_thetas=[36.0, 54.0, 78.0, 110.0, 150.0], brilho2=False, brilho_lados=6,
    lid_J=8, lid_Rs=2, lid_phis=[45.0, 0.0], liner_sup=1, liner_inf=0,
    sobr_K=6, sobr_cols=2, boca_K=7, boca_linhas=2, dentes_K=5, lingua_K=5, bochecha_lados=8, bochecha_aneis=2, fio_aneis=11, fita_K=7, fita_lash=2,
    iris_thetas=[34.0, 41.0], vagas_reflexo=2, est_Rs=2, est_phis=[45.0, 0.0], olheira_K=7, olheira_W=2, bigode_K=14, ponta_K=10,
)
SOBR_ESPESSURA = 0.36
SINK_FITA = D.SINK_FITA


def estado_da_cara(nome):
    return copy.deepcopy(D.estado_da_forma(nome))


def sstep(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def unit(v):
    return v / np.linalg.norm(v)


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


def cor_do_corpo(z, fi):
    """Cor de vértice do látex (cinza multiplicado pela cor da equipe): o mais claro onde o látex estica (a barriga e o ombro), o mais escuro perto do nó."""
    perto_do_no = 0.52 + 0.48 * sstep((z + 8.5) / 2.9)
    ombro = 1.0 - 0.05 * sstep((z - 4.5) / 2.1)
    prega = 1.0 + 0.07 * math.cos(D.NO_LOBOS * fi) * sstep((-4.5 - z) / 2.3)
    return min(1.0, perto_do_no * ombro * prega)


# --- curvas ---------------------------------------------------------------------------------------------------------------
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
    """Acumula vértices (com pesos, UV e cor) e faces (com material). As faces só valem na primeira montagem."""

    def __init__(self):
        self.V, self.W, self.UV, self.COL, self.F, self.M = [], [], [], [], [], []
        self.com_faces = True
        self.partes = {}

    def v(self, p, pesos, uv=(0.0, 0.0), cor=1.0):
        self.V.append(np.array(p, dtype=float))
        self.W.append(pesos)
        self.UV.append(uv)
        self.COL.append(cor)
        return len(self.V) - 1

    def face(self, idx, mat, fora):
        """Uma face (3 ou 4 vértices) com a normal virada para `fora` (vetor, ou None para deixar como veio)."""
        if not self.com_faces:
            return
        idx = list(idx)
        if fora is not None:
            a, b, c = (self.V[i] for i in idx[:3])
            if np.dot(np.cross(b - a, c - a), fora) < 0:
                idx.reverse()
        self.F.append(tuple(idx))
        self.M.append(mat)

    def inicio(self, nome):
        self.partes[nome] = [len(self.V), None]

    def fim(self, nome):
        self.partes[nome][1] = len(self.V)

    def copiar(self):
        n = Montagem()
        n.V, n.W, n.UV, n.COL = list(self.V), list(self.W), list(self.UV), list(self.COL)
        n.F, n.M = list(self.F), list(self.M)
        n.partes = {k: list(v) for k, v in self.partes.items()}
        return n


def quadro_do_olho(lado):
    """(centro da pele, normal, cima, direita) no ponto do olho; direita é a do espectador (+X no meio do rosto)."""
    p, n = superficie(lado * D.OLHO_X, D.OLHO_Z)
    cima = np.array([0.0, 0.0, 1.0]) - n * n[2]
    cima /= np.linalg.norm(cima)
    direita = np.cross(cima, n)
    return p, n, cima, direita


def centro_do_olho(lado, afunda=0.0):
    """O centro do globo do olho `esq` (lado=+1, +X) ou `dir` (lado=-1); `afunda` (cm) é o quanto o olho fechado afundou na pele."""
    p, n, _, _ = quadro_do_olho(lado)
    return p - n * (D.OLHO_AFUNDADO + afunda)


def afunda_do_olho(olho):
    """Quanto o globo e as pálpebras afundam na pele neste olho (cm): 0 aberto, `SINK_FECHADO` fechado."""
    return olho["fecha"] * D.SINK_FECHADO


def afunda_da_palpebra_do_estilo(olho, chave):
    """A pálpebra do estilo (P8) sai da vista pela normal da pele: `SINK_EST` quando o estilo não a liga (mais `SINK_FECHADO` quando o olho fecha, como o globo).
    O giro do olhar é feito antes, sobre a pálpebra à mostra; o afundamento é só uma translação depois, então as formas somam sem erro."""
    return (1.0 - olho["est_on"][chave]) * D.SINK_EST


def eixo_do_olhar(lado):
    """O eixo do olhar em repouso: para a frente (-Y), paralelo nos dois olhos, não pela normal da pele."""
    return np.array([0.0, -1.0, 0.0])


def superficie_do_olho(x, z, fora, lado, afunda=0.0):
    """Como `superficie`, mas por cima do calombo da pálpebra quando o ponto cai nele (a sobrancelha pousa na pálpebra, não some dentro dela)."""
    p, n = superficie(x, z, 0.0)
    c = centro_do_olho(lado, afunda)
    rho = D.OLHO_RAIO * D.PALPEBRA_RAIO_INF + 0.03
    w = p - c
    b = float(np.dot(w, n))
    disc = b * b - (float(np.dot(w, w)) - rho * rho)
    if disc > 0:
        t = -b + math.sqrt(disc)
        if t > 0:
            q = p + n * t
            n = unit(q - c)
            p = q
    return p + n * fora, n


def gerar(lod, estado, com_faces=True):
    """Monta o balão neste nível de detalhe e nesta expressão (`estado`, um item de `dados.CARAS` ou de `dados.estado_da_forma`)."""
    m = _corpo(lod).copiar()
    m.com_faces = com_faces
    for lado in (+1, -1):
        nome = "esq" if lado > 0 else "dir"
        _olho(m, lod, estado[nome], lado, nome)
        _palpebra(m, lod, estado, lado, "sup")
        _palpebra(m, lod, estado, lado, "inf")
        for chave in D.CHAVES_DA_PALPEBRA_DE_ESTILO:
            _palpebra(m, lod, estado, lado, chave)
        _brilhos(m, lod, estado[nome], lado, nome)
        _olheira(m, lod, estado[nome], lado, nome)
        _fita(m, lod, estado[nome], lado, nome)
        _sobrancelha(m, lod, estado[nome], lado, nome, estado["rot_palpebras"])
        _bochecha(m, lod, estado, lado, nome)
    _boca(m, lod, estado)
    return m


_CACHE = {}


def _corpo(lod):
    """O corpo e a cordinha: não dependem da expressão, então saem uma vez por nível (com as faces)."""
    if lod["nome"] in _CACHE:
        return _CACHE[lod["nome"]]
    m = Montagem()
    _pele(m, lod)
    _cordinha(m, lod)
    _CACHE[lod["nome"]] = m
    return m


def _perfil(lod):
    """Os anéis do corpo, do topo ao fundo do nó: (raio, z). A silhueta da gota, o pescoço e o funil do nó em curva suave."""
    H = D.METADE_ALTURA
    n = lod["aneis_corpo"]
    t_fim = 0.012
    corpo = []
    for k in range(1, n + 1):
        s = 0.5 - 0.5 * math.cos(math.pi * k / n)
        t = 1 - s * (1 - t_fim)
        corpo.append((raio_do_corpo_em_t(t), -H + 2 * H * t))
    controle = [corpo[-1], (0.42, -6.80), (0.36, -7.05)] + D.NO_PERFIL[1:]
    funil = catmull(controle, lod["no_sub"])[1:]
    return corpo + [(float(r), float(z)) for r, z in funil]


def _pele(m, lod):
    lados = lod["lados"]
    H = D.METADE_ALTURA
    aneis = _perfil(lod)
    topo = m.v((0, 0, H), pesos_do_corpo(H), cor=cor_do_corpo(H, 0.0))
    fundo = m.v((0, 0, D.NO_FUNDO_Z), [("no", 1.0)], cor=0.5)
    todos = []
    for r, z in aneis:
        pw = pesos_do_corpo(z)
        a_pescoco = D.NO_AMPLITUDE_PESCOCO * sstep((-4.5 - z) / 2.3) + D.NO_AMPLITUDE_NO * sstep((-7.3 - z) / 0.8)
        anel = []
        for k in range(lados):
            fi = 2 * math.pi * k / lados
            rr = r + a_pescoco * min(1.0, r / 0.45) * math.cos(D.NO_LOBOS * fi + D.NO_TORCAO * (z + 6.0))
            uv = (k / lados, 0.0)
            anel.append(m.v((rr * math.sin(fi), -rr * math.cos(fi), z), pw, uv, cor_do_corpo(z, fi + D.NO_TORCAO * (z + 6.0) / D.NO_LOBOS)))
        todos.append(anel)
    for k in range(lados):
        m.face((topo, todos[0][k], todos[0][(k + 1) % lados]), LATEX, np.array([0, 0, 1.0]))
    for i in range(len(todos) - 1):
        a, b = todos[i], todos[i + 1]
        for k in range(lados):
            m.face((b[k], b[(k + 1) % lados], a[(k + 1) % lados], a[k]), LATEX, None)   # a ordem dá a normal para fora ao longo de todo o perfil
    for k in range(lados):
        m.face((fundo, todos[-1][(k + 1) % lados], todos[-1][k]), LATEX, np.array([0, 0, -1.0]))
    if m.com_faces:                                  # a normal da barriga tem de apontar para fora: se não, inverte os quadrões
        i = len(todos) // 3
        a, b = todos[i], todos[i + 1]
        p0, p1, p2 = (m.V[j] for j in (b[0], b[1], a[1]))
        centro = (p0 + p1 + p2) / 3
        if np.dot(np.cross(p1 - p0, p2 - p0), np.array([centro[0], centro[1], 0.0])) < 0:
            m.F = [tuple(reversed(f)) if len(f) == 4 else f for f in m.F]


def _dir_no_olho(vet, theta, omega):
    """Direção a `theta` do eixo do olhar e `omega` (graus a partir da direita, para cima), na base (direita, cima, normal)."""
    t, o = math.radians(theta), math.radians(omega)
    d, c, n = vet
    return math.sin(t) * (math.cos(o) * d + math.sin(o) * c) + math.cos(t) * n


def _uv_do_globo(theta, omega):
    rho = min(theta / D.TEXTURA_GRAUS, 1.0)
    o = math.radians(omega)
    return (0.5 + 0.5 * rho * math.cos(o), 0.5 + 0.5 * rho * math.sin(o))


def theta_do_anel(theta, k):
    """O ângulo (graus a partir do eixo do olhar) onde o anel de `theta` fica quando a íris tem escala `k` (estilo): a íris e o miolo crescem, a esclera cede
    e o efeito some a 120 graus; é crescente para `k` de 0,8 a 1,4 (nenhum anel passa por cima de outro)."""
    if abs(k - 1.0) < 1e-9:
        return theta
    ate = min(theta, D.IRIS_GRAUS)
    cai = 1.0 if theta <= D.IRIS_GRAUS else 1.0 - sstep((theta - D.IRIS_GRAUS) / (120.0 - D.IRIS_GRAUS))
    return theta + (k - 1.0) * ate * cai


def _olho(m, lod, olho, lado, nome):
    """O globo: calota de pupila (preta, tamanho da cara), anéis de íris e esclera com UV azimutal, e o resto da esfera até o polo de trás.
    P8: a íris tingível (material `iris`) é uma segunda pele sobre o globo, entre o anel da pupila e o de `IRIS_GRAUS`, um fio acima dele; `iris_k` do estilo a alarga."""
    m.inicio("globo_" + nome)
    centro = centro_do_olho(lado, afunda_do_olho(olho))
    osso = "olho_esq" if lado > 0 else "olho_dir"
    pw = [(osso, 1.0)]
    n = eixo_do_olhar(lado)
    cima = np.array([0.0, 0.0, 1.0])
    direita = np.cross(cima, n)
    base = (direita, cima, n)
    R = D.OLHO_RAIO
    setores = lod["globo_setores"]
    theta_p = D.PUPILA_BASE_GRAUS * olho["pupila"]
    fixos = lod["globo_thetas"]
    ik = olho["iris_k"]
    polo = m.v(centro + n * R, pw, (0.5, 0.5))
    fileira_p = [m.v(centro + R * _dir_no_olho(base, theta_p, 360.0 * k / setores), pw, _uv_do_globo(D.PUPILA_BASE_GRAUS, 360.0 * k / setores)) for k in range(setores)]
    fileiras = [fileira_p]
    for th in fixos:
        fileiras.append([m.v(centro + R * _dir_no_olho(base, theta_do_anel(th, ik), 360.0 * k / setores), pw, _uv_do_globo(th, 360.0 * k / setores)) for k in range(setores)])
    atras = m.v(centro - n * R, pw, _uv_do_globo(180.0, 0.0))
    for k in range(setores):
        m.face((polo, fileira_p[k], fileira_p[(k + 1) % setores]), PRETO, n)
    for i in range(len(fileiras) - 1):
        for k in range(setores):
            a, b = fileiras[i], fileiras[i + 1]
            fora = (m.V[a[k]] + m.V[b[k]]) / 2 - centro
            m.face((a[k], a[(k + 1) % setores], b[(k + 1) % setores], b[k]), OLHO, fora)
    for k in range(setores):
        a = fileiras[-1]
        m.face((atras, a[(k + 1) % setores], a[k]), OLHO, -n)
    # a íris tingível: do anel da pupila (o mesmo) aos anéis de `iris_thetas`; o UV vai de 0 (centro) a 1 (a borda, em `IRIS_GRAUS`)
    alt = R + D.IRIS_ALTURA
    uv_i = lambda th_uv, w: (0.5 + 0.5 * (th_uv / D.IRIS_GRAUS) * math.cos(math.radians(w)), 0.5 + 0.5 * (th_uv / D.IRIS_GRAUS) * math.sin(math.radians(w)))
    ant = [m.v(centro + alt * _dir_no_olho(base, theta_p, 360.0 * k / setores), pw, uv_i(D.PUPILA_BASE_GRAUS, 360.0 * k / setores)) for k in range(setores)]
    for th in lod["iris_thetas"]:
        nova = [m.v(centro + alt * _dir_no_olho(base, theta_do_anel(th, ik), 360.0 * k / setores), pw, uv_i(th, 360.0 * k / setores)) for k in range(setores)]
        for k in range(setores):
            fora = (m.V[ant[k]] + m.V[nova[k]]) / 2 - centro
            m.face((ant[k], ant[(k + 1) % setores], nova[(k + 1) % setores], nova[k]), IRIS, fora)
        ant = nova
    m.fim("globo_" + nome)


def _brilhos(m, lod, olho, lado, nome):
    """Os reflexos: disquinhos brancos um fio acima do globo, presos à `espinha_2` (a cabeça), não ao osso do olho: ficam parados enquanto o olho gira."""
    m.inicio("brilhos_" + nome)
    centro = centro_do_olho(lado, afunda_do_olho(olho))
    n = eixo_do_olhar(lado)
    cima = np.array([0.0, 0.0, 1.0])
    direita = np.cross(cima, n)
    base = (direita, cima, n)
    R = D.OLHO_RAIO
    pw = [("espinha_2", 1.0)]
    vagas = lod["vagas_reflexo"]
    reflexos = list(olho["brilhos"])[:vagas]
    reflexos += [(14.0, -52.0 + 90.0 * i, 0.0) for i in range(len(reflexos), vagas)]       # vaga sem uso: raio 0, sob o globo
    lados_b = lod["brilho_lados"]
    for theta, omega, raio in reflexos:
        dc = _dir_no_olho(base, theta, omega)
        escondido = raio <= 0.0
        raio = 0.08 if escondido else raio
        rg = math.degrees(raio / R)
        topo = R - 0.14 if escondido else R + D.BRILHO_ALTURA
        c = m.v(centro + topo * dc, pw)
        e1 = np.cross(dc, n)
        if np.linalg.norm(e1) < 1e-6:
            e1 = direita
        e1 = e1 / np.linalg.norm(e1)
        e2 = np.cross(dc, e1)
        anel = []
        for k in range(lados_b):
            w = 2 * math.pi * k / lados_b
            d = dc * math.cos(math.radians(rg)) + math.sin(math.radians(rg)) * (math.cos(w) * e1 + math.sin(w) * e2)
            anel.append(m.v(centro + topo * d / np.linalg.norm(d), pw))
        for k in range(lados_b):
            m.face((c, anel[k], anel[(k + 1) % lados_b]), BRILHO, dc)
    m.fim("brilhos_" + nome)


def _beta_da_borda(par, psi, lado):
    """Graus a partir do alto (ou de baixo) onde a borda da pálpebra fica na direção azimutal `psi` (graus; 0 = de frente, +90 = lado de +X).

    No meio vale a média linear entre o canto de dentro e o de fora (mais `meio` graus); para os cantos a abertura fecha em 90
    (as duas pálpebras se encontram na lateral do globo): a abertura é uma amêndoa, sem fresta nos cantos."""
    interna, externa, meio = par
    ps = math.radians(psi)
    f = 0.5 + 0.5 * math.sin(ps) if lado > 0 else 0.5 - 0.5 * math.sin(ps)
    centro = interna + (externa - interna) * f + meio * math.cos(ps)
    w = max(math.cos(ps), 0.0) ** D.PALPEBRA_EXPOENTE if abs(psi) < 90.0 else 0.0
    return min(max(90.0 - (90.0 - centro) * w, 2.0), 125.0)


def _giro(d, k, ang):
    """Gira o vetor `d` em volta do eixo unitário `k` por `ang` graus (Rodrigues)."""
    a = math.radians(ang)
    return d * math.cos(a) + np.cross(k, d) * math.sin(a) + k * np.dot(k, d) * (1 - math.cos(a))


def _palpebra(m, lod, estado, lado, chave):
    """Uma pálpebra: o polo, anéis de casca até `beta - rolo` e a borda enrolada (um quarto de elipse) que desce e pousa no globo."""
    nome = "esq" if lado > 0 else "dir"
    m.inicio("palpebra_%s_%s" % (chave, nome))
    estilo = chave.startswith("est_")                   # P8: a pálpebra de cima de um estilo (bravo, cansado), uma casca entre o globo e a pálpebra da cara
    par = D.ESTILOS["olho_" + chave[len("est_"):]]["est"] if estilo else estado[nome][chave]
    sup = chave != "inf"
    sinal = 1.0 if sup else -1.0
    _, n, cima, direita = quadro_do_olho(lado)
    c = centro_do_olho(lado, afunda_do_olho(estado[nome]))
    desloca = -n * afunda_da_palpebra_do_estilo(estado[nome], chave) if estilo else 0.0
    R = D.OLHO_RAIO
    rho_s = D.PALPEBRA_RAIO_EST if estilo else D.PALPEBRA_RAIO_SUP if sup else D.PALPEBRA_RAIO_INF
    rho_0 = D.PALPEBRA_BORDA_EST if estilo else D.PALPEBRA_BORDA_SUP if sup else D.PALPEBRA_BORDA_INF
    H = rho_s - rho_0
    delta0 = math.degrees(H / rho_0)
    J, Rs, phis = lod["lid_J"], lod["lid_Rs"], lod["lid_phis"]
    if estilo:
        Rs, phis = lod["est_Rs"], lod["est_phis"]
    pretas = lod["liner_sup" if sup else "liner_inf"]
    eixo = -direita
    ang = estado["rot_palpebras"]
    pw = [("espinha_2", 1.0)]
    psis = [-D.PALPEBRA_PSI + 2 * D.PALPEBRA_PSI * j / (2 * J) for j in range(2 * J + 1)]
    be = [_beta_da_borda(par, psi, lado) for psi in psis]
    db = [min(delta0, 0.5 * b) for b in be]
    bc = [b - d for b, d in zip(be, db)]
    cor = 0.93

    def ponto(beta, psi, rho):
        b, s = math.radians(beta), math.radians(psi)
        d = math.sin(b) * (math.sin(s) * direita + math.cos(s) * n) + math.cos(b) * sinal * cima
        if ang:
            d = _giro(d, eixo, ang)
        return c + R * rho * d + desloca

    polo_d = sinal * cima if not ang else _giro(sinal * cima, eixo, ang)
    polo = m.v(c + R * rho_s * polo_d + desloca, pw, cor=cor)
    linhas = []
    for i in range(1, Rs + 1):
        linhas.append([m.v(ponto(bc[j] * i / Rs, psis[j], rho_s), pw, cor=cor) for j in range(2 * J + 1)])
    for phi in phis:
        f, s = math.cos(math.radians(phi)), math.sin(math.radians(phi))
        linhas.append([m.v(ponto(bc[j] + db[j] * f, psis[j], rho_0 + H * s), pw, cor=cor * 0.96) for j in range(2 * J + 1)])
    for j in range(2 * J):
        m.face((polo, linhas[0][j], linhas[0][j + 1]), LATEX, (m.V[linhas[0][j]] + m.V[linhas[0][j + 1]]) / 2 - c)
    for i in range(len(linhas) - 1):
        seg_borda = i - (Rs - 1)                       # 0 = primeiro segmento da borda enrolada
        mat = PRETO if seg_borda >= len(phis) - pretas else LATEX
        a, b = linhas[i], linhas[i + 1]
        for j in range(2 * J):
            fora = (m.V[a[j]] + m.V[b[j + 1]]) / 2 - c
            m.face((a[j], a[j + 1], b[j + 1], b[j]), mat, fora)
    m.fim("palpebra_%s_%s" % (chave, nome))


def _fita(m, lod, olho, lado, nome):
    """O olho fechado: uma fita escura sobre a pele, o arco "^ ^" com um cílio que cai na ponta de fora. Com o olho aberto (`fecha` = 0) ela fica por baixo da pele (escondida).

    A fita é sempre montada com a mesma topologia; só `fecha` a faz subir à pele e engrossar. O desenho (`linha`) vem do estado do olho."""
    m.inicio("fita_" + nome)
    l = olho["linha"]
    fecha = olho["fecha"]
    K, K_l = lod["fita_K"], lod["fita_lash"]
    sobra = lod["sobra"]
    pw = [("espinha_2", 1.0)]
    base_z = D.OLHO_Z + l["z"]
    esp0 = 0.34 * l["esp"] * (0.35 + 0.65 * fecha)
    comp_c = 0.52 * l["cilio"] * (0.35 + 0.65 * fecha)
    # a linha de centro em (x desde o centro do olho, z): o arco dos cantos (s = -1 a +1, de dentro para fora) e depois o cílio, que continua a descida
    centro = []
    for k in range(K):
        sg = -1.0 + 2.0 * k / (K - 1)
        centro.append((sg * l["meia"], base_z + l["arco"] * (1 - sg * sg), 0.30 + 0.70 * math.sqrt(max(1 - sg ** 4, 0.0))))
    x1, z1, _ = centro[-1]
    zp = -2 * l["arco"] * (1.0 / l["meia"])             # a inclinação do arco no canto de fora (dz/dx)
    for k in range(1, K_l + 1):
        t = k / K_l
        centro.append((x1 + comp_c * 0.95 * t, z1 + (zp * 0.5 - 0.55) * comp_c * t - 0.30 * comp_c * t * t, 0.30 * (1 - t) + 0.08))
    colunas = 3
    fileiras = [[] for _ in range(colunas)]
    pts = [(x, z) for x, z, _ in centro]
    for i, (x, z, e) in enumerate(centro):
        a, b = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        nrm = math.hypot(tx, tz) or 1.0
        nx, nz = -tz / nrm, tx / nrm                      # normal no plano da pele (x, z)
        for c in range(colunas):
            f = c / (colunas - 1) - 0.5
            fora = sobra * 0.9 + 0.025 * (1 - abs(2 * f)) - SINK_FITA * (1 - fecha)
            p, _ = superficie(lado * (D.OLHO_X + x + nx * f * esp0 * e), z + nz * f * esp0 * e, fora)
            fileiras[c].append(m.v(p, pw))
    _, nor = superficie(lado * D.OLHO_X, D.OLHO_Z, 0)
    for c in range(colunas - 1):
        for i in range(len(centro) - 1):
            a, b = fileiras[c], fileiras[c + 1]
            m.face((a[i], a[i + 1], b[i + 1], b[i]), PRETO, nor)
    m.fim("fita_" + nome)


def _sobrancelha(m, lod, olho, lado, nome, rot=0.0):
    """A sobrancelha: uma pincelada que afina nas pontas e sobe no meio, pousada na pele (ou na pálpebra, onde ela abaulou).

    Onde ela pousa na pálpebra, acompanha o giro das formas `palpebra_cima`/`palpebra_baixo` (o resto fica na pele)."""
    m.inicio("sobrancelha_" + nome)
    _, n_s, cima_s, direita_s = quadro_do_olho(lado)
    afunda = afunda_do_olho(olho)
    c_olho = centro_do_olho(lado, afunda)
    s = olho["sobr"]
    K, colunas = lod["sobr_K"], lod["sobr_cols"]
    sobra = lod["sobra"]
    pw = [("espinha_2", 1.0)]
    fileiras = [[] for _ in range(colunas)]
    for k in range(K):
        sig = -1.0 + 2.0 * k / (K - 1)            # -1 interna, +1 externa
        x = lado * (s["x"] + sig * s["meia"])
        y = D.OLHO_Z + s["yc"] + s["incl"] * sig + s["arco"] * (1 - sig * sig)
        esp = SOBR_ESPESSURA * s["esp"] * (0.25 + 0.75 * math.sqrt(max(1 - sig ** 4, 0.0)))
        for c in range(colunas):
            f = c / (colunas - 1) - 0.5
            elevar = sobra + (0.07 * (1 - abs(2 * f)) if colunas > 2 else 0.0)
            p, nor = superficie_do_olho(x, y + f * esp, elevar, lado, afunda)
            if rot:
                dist = np.linalg.norm(p - c_olho) / D.OLHO_RAIO
                peso = 1.0 - sstep((dist - 1.30) / 0.35)
                if peso > 0:
                    p = c_olho + _giro(p - c_olho, -direita_s, rot * peso)
            fileiras[c].append(m.v(p, pw))
    for c in range(colunas - 1):
        for k in range(K - 1):
            a, b = fileiras[c], fileiras[c + 1]
            _, nor = superficie(lado * s["x"], D.OLHO_Z + s["yc"], 0)
            m.face((a[k], a[k + 1], b[k + 1], b[k]), PRETO, nor)
    m.fim("sobrancelha_" + nome)


def _bochecha(m, lod, estado, lado, nome):
    """Um disco rosa sobre a pele, em anéis (a pele é curva: um leque de triângulos grandes afundaria nela no meio); a textura de alfa (UV radial) o apaga nas bordas."""
    m.inicio("bochecha_" + nome)
    lados = lod["bochecha_lados"]
    aneis_n = lod["bochecha_aneis"]
    r = max(estado["bochecha"][0 if lado > 0 else 1], 0.06)
    pw = [("espinha_2", 1.0)]
    cx, cz = lado * D.BOCHECHA_X, D.BOCHECHA_Z
    fora = lod["sobra"] * 0.6
    p, nor = superficie(cx, cz, fora)
    c = m.v(p, pw, (0.5, 0.5))
    aneis = []
    for j in range(1, aneis_n + 1):
        f = j / aneis_n
        anel = []
        for k in range(lados):
            w = 2 * math.pi * k / lados
            q, _ = superficie(cx + f * r * 1.35 * math.cos(w), cz + f * r * 1.05 * math.sin(w), fora)
            anel.append(m.v(q, pw, (0.5 + 0.5 * f * math.cos(w), 0.5 + 0.5 * f * math.sin(w))))
        aneis.append(anel)
    for k in range(lados):
        m.face((c, aneis[0][k], aneis[0][(k + 1) % lados]), BLUSH, nor)
    for j in range(aneis_n - 1):
        for k in range(lados):
            a, b = aneis[j], aneis[j + 1]
            m.face((a[k], a[(k + 1) % lados], b[(k + 1) % lados], b[k]), BLUSH, nor)
    m.fim("bochecha_" + nome)


def _olheira(m, lod, olho, lado, nome):
    """A olheira do estilo cansado: um crescente macio (alfa) na pele, sob o olho. Com `olheira` = 0 ele fica por baixo da pele (escondido); a forma do estilo o sobe."""
    m.inicio("olheira_" + nome)
    K, W = lod["olheira_K"], lod["olheira_W"]
    pw = [("espinha_2", 1.0)]
    fora = lod["sobra"] * 0.5 - (1.0 - olho["olheira"]) * D.SINK_OLHEIRA
    cx, cz = lado * D.OLHO_X, D.OLHO_Z
    fileiras = []
    for j in range(W):
        v = j / (W - 1)
        linha = []
        for k in range(K):
            a = -1.0 + 2.0 * k / (K - 1)
            phi = math.radians(-90.0 + a * D.OLHEIRA_ABERTURA)
            esp = D.OLHEIRA_ESP * max(math.cos(0.5 * math.pi * a), 0.0) ** 0.8
            r = D.OLHEIRA_R_IN + v * esp
            p, _ = superficie(cx + r * math.cos(phi), cz + r * math.sin(phi), fora)
            linha.append(m.v(p, pw, (k / (K - 1), v)))
        fileiras.append(linha)
    _, nor = superficie(cx, cz - D.OLHEIRA_R_IN, 0.0)
    for j in range(W - 1):
        for k in range(K - 1):
            a, b = fileiras[j], fileiras[j + 1]
            m.face((a[k], a[k + 1], b[k + 1], b[k]), OLHEIRA, nor)
    m.fim("olheira_" + nome)


def _boca(m, lod, estado):
    """A boca: o interior escuro, a borda de lábio em relevo (látex), os dentes de cima e a língua (que pode passar do lábio)."""
    m.inicio("boca")
    b = estado["boca"]
    K, linhas = lod["boca_K"], lod["boca_linhas"]
    sobra = lod["sobra"]
    pw = [("espinha_2", 1.0)]
    x0, meia = b["x0"], b["meia"]

    def y_de(par, s):
        centro, ponta = par
        return centro + (ponta - centro) * s * s + b["inclina"] * s + b["canto"] * max(s, 0.0) ** 2

    def yt(s):
        return max(y_de(b["topo"], s), y_de(b["fundo"], s) + 0.04)

    def yb(s):
        return y_de(b["fundo"], s)

    _, nor0 = superficie(0, D.BOCA_Z, 0)

    def pele(s, y, elevar):
        p, _ = superficie(x0 + meia * s, D.BOCA_Z + y, elevar)
        return p

    # interior
    cols = []
    for i in range(linhas):
        f = i / (linhas - 1)
        cols.append([m.v(pele(-1.0 + 2.0 * k / (K - 1), yt(-1.0 + 2.0 * k / (K - 1)) + (yb(-1.0 + 2.0 * k / (K - 1)) - yt(-1.0 + 2.0 * k / (K - 1))) * f, sobra * 0.5), pw) for k in range(K)])
    for i in range(linhas - 1):
        for k in range(K - 1):
            m.face((cols[i][k], cols[i][k + 1], cols[i + 1][k + 1], cols[i + 1][k]), BOCA, nor0)
    # os lábios: duas faixas em relevo, que somem nos cantos e descem até a pele por fora
    for lado_l, sinal in (("cima", 1.0), ("baixo", -1.0)):
        dentro, fora = [], []
        for k in range(K):
            s = -1.0 + 2.0 * k / (K - 1)
            y = yt(s) if sinal > 0 else yb(s)
            larg = 0.16 * math.cos(0.5 * math.pi * s) ** 0.8 + 0.01
            dentro.append(m.v(pele(s, y, 0.085 if lod["nome"] == "alta" else 0.11), pw, cor=0.96))
            fora.append(m.v(pele(s, y + sinal * larg, sobra * 0.4), pw, cor=0.94))
        for k in range(K - 1):
            m.face((dentro[k], dentro[k + 1], fora[k + 1], fora[k]), LATEX, nor0)
    # os dentes de cima
    Kd = lod["dentes_K"]
    alt = max(b["dentes"], 0.001)
    ta, tb = [], []
    for k in range(Kd):
        s = -0.8 + 1.6 * k / (Kd - 1)
        top = yt(s) - 0.012
        bot = top - min(alt, max((yt(s) - yb(s)) * 0.92, 0.001))
        ta.append(m.v(pele(s, top, sobra * 0.75), pw))
        tb.append(m.v(pele(s, bot, sobra * 0.75), pw))
    for k in range(Kd - 1):
        m.face((ta[k], ta[k + 1], tb[k + 1], tb[k]), DENTE, nor0)
    # a língua: uma lente sobre o lábio de baixo; `lingua_fora` é a ponta que passa dele
    Kl = lod["lingua_K"]
    lx, lw = b["lingua_x"], b["lingua_larg"]
    topo_l, base_l = [], []
    for k in range(Kl):
        u = -1.0 + 2.0 * k / (Kl - 1)
        s = lx + lw * u
        s_c = min(max(s, -1.0), 1.0)
        bump = max(1 - u * u, 0.0) ** 1.2
        y_base = yb(s_c)
        altura = min(b["lingua"] * bump, max((yt(s_c) - yb(s_c)) * 0.9, 0.0)) + 0.001
        topo_l.append(m.v(pele(s_c, y_base + altura, sobra * 1.6 + 0.04), pw))
        base_l.append(m.v(pele(s_c, y_base - b["lingua_fora"] * bump, sobra * 1.6 + 0.04), pw))
    for k in range(Kl - 1):
        m.face((base_l[k], base_l[k + 1], topo_l[k + 1], topo_l[k]), LINGUA, nor0)
    m.fim("boca")


def _cordinha(m, lod):
    """A cordinha: uma fita estreita que gira ao longo do comprimento, presa aos quatro ossos `cordinha_*`."""
    m.inicio("cordinha")
    por = max(lod["fio_aneis"] // (len(D.CORDINHA_ONDA) - 1), 2)
    pts, arco = curva_da_cordinha(por)
    total = arco[-1]
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

    lados = 6 if lod["nome"] == "alta" else 4
    aneis = []
    ref = np.array([1.0, 0.0, 0.0])
    for i, p in enumerate(pts):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, len(pts) - 1)]
        tang = unit(b - a)
        e1 = unit(np.cross(tang, ref))
        e2 = np.cross(tang, e1)
        torcao = 2 * math.pi * D.CORDINHA_VOLTAS * arco[i] / total
        u1 = math.cos(torcao) * e1 + math.sin(torcao) * e2
        u2 = -math.sin(torcao) * e1 + math.cos(torcao) * e2
        pw = pesos_em(arco[i])
        aneis.append([m.v(p + 0.5 * D.CORDINHA_LARGURA * math.cos(2 * math.pi * k / lados) * u1 + 0.5 * D.CORDINHA_ESPESSURA * math.sin(2 * math.pi * k / lados) * u2,
                          pw, (k / lados, arco[i] / total)) for k in range(lados)])
    ponta = m.v(pts[-1] + unit(pts[-1] - pts[-2]) * 0.05, pesos_em(total))
    for i in range(len(aneis) - 1):
        for k in range(lados):
            a, b = aneis[i], aneis[i + 1]
            centro = (m.V[a[k]] + m.V[b[(k + 1) % lados]]) / 2
            eixo = (pts[i] + pts[i + 1]) / 2
            m.face((a[k], a[(k + 1) % lados], b[(k + 1) % lados], b[k]), FIO, centro - eixo)
    for k in range(lados):
        m.face((ponta, aneis[-1][k], aneis[-1][(k + 1) % lados]), FIO, m.V[ponta] - pts[-1])
    m.fim("cordinha")


def contagem(m):
    return sum(len(f) - 2 for f in m.F)


if __name__ == "__main__":
    import time
    for lod in (ALTA, BAIXA):
        t0 = time.time()
        m = gerar(lod, estado_da_cara(D.NOME_DA_BASE))
        print(lod["nome"], "triângulos", contagem(m), "vértices", len(m.V), "faces", len(m.F), "(%.1fs)" % (time.time() - t0))
        por_mat = {}
        for f, mat in zip(m.F, m.M):
            por_mat[NOMES_DOS_MATERIAIS[mat]] = por_mat.get(NOMES_DOS_MATERIAIS[mat], 0) + len(f) - 2
        print("  triângulos por material:", por_mat)
        for nome in D.FORMAS:
            m2 = gerar(lod, estado_da_cara(nome), com_faces=False)
            assert len(m2.V) == len(m.V), nome
        print("  %d formas com a mesma topologia" % len(D.FORMAS))
