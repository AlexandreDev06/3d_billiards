"""As texturas do balão, feitas em numpy (autorais, sem foto de ninguém).

P8: `esclera_<estilo>.png` (a esclera de cada estilo de olho, 256x256), `iris_<estilo>.png` (a íris em tons de cinza, 256x256: o jogo a tinge com a cor do olho),
`olheira.png` (64x64, alfa), `cabelo_<cor>.png` (os fios dos bigodes, 128x128) e `bochecha.png` (rubor com alfa, 64x64).

A esclera é um disco azimutal equidistante: o centro (0,5; 0,5) é o eixo do olhar e o raio vai de 0 a `dados.TEXTURA_GRAUS` graus (por baixo da íris tingível, até `IRIS_GRAUS`,
fica um marrom escuro). A íris é outro disco: o raio vai de 0 a `IRIS_GRAUS`. A pupila é geometria (preta, do tamanho da cara). Dentro do Blender: `bpy` grava o PNG; fora,
as funções só devolvem as matrizes.
"""
import math
import os
import sys

import numpy as np

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import dados as D

SAIDA = os.path.abspath(os.path.join(PASTA, "..", "..", "texturas"))


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ruido(n, semente, escala):
    """Ruído de valor suave em 2D (n x n), repetível."""
    rng = np.random.default_rng(semente)
    g = rng.random((escala + 1, escala + 1))
    ys, xs = np.mgrid[0:n, 0:n] / n * escala
    x0, y0 = xs.astype(int), ys.astype(int)
    fx, fy = xs - x0, ys - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = g[y0, x0] * (1 - fx) + g[y0, x0 + 1] * fx
    b = g[y0 + 1, x0] * (1 - fx) + g[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


# --- P8: esclera e íris por estilo ------------------------------------------------------------------------------------------------
def _grade(n):
    ys, xs = (np.mgrid[0:n, 0:n] + 0.5) / n
    return xs - 0.5, ys - 0.5


def esclera(estilo="olho_normal", n=256):
    """RGBA (n, n, 4), linha 0 embaixo: a esclera de um estilo (disco azimutal, 0 a `TEXTURA_GRAUS`). Por baixo da íris tingível (theta < `IRIS_GRAUS`) vai um marrom escuro."""
    dx, dy = _grade(n)
    theta = 2 * np.hypot(dx, dy) * D.TEXTURA_GRAUS
    omega = np.arctan2(dy, dx)
    iris = D.IRIS_GRAUS
    if estilo == "olho_kawaii":
        rgb = np.array([1.0, 1.0, 1.0])[None, None, :] * (1.0 - 0.10 * sstep(70.0, 100.0, theta))[..., None] * np.array([0.97, 0.985, 1.0])[None, None, :]
    elif estilo == "olho_bravo":
        quente = sstep(52.0, 100.0, theta)
        rgb = (np.array([1.0, 0.985, 0.96])[None, None, :] * (1.0 - 0.13 * quente)[..., None]) * (1.0 - 0.07 * quente)[..., None] * np.array([1.0, 0.97, 0.94])[None, None, :]
    elif estilo == "olho_cansado":
        rgb = _esclera_cansada(theta, omega, n)
    else:
        rgb = np.array([1.0, 0.995, 0.975])[None, None, :] * (1.0 - 0.16 * sstep(66.0, 100.0, theta))[..., None]
    # a sombra que a íris faz na esclera, bem de leve
    rgb = rgb * (1.0 - 0.07 * (1.0 - sstep(iris, iris + 7.0, theta)) * sstep(iris - 1.0, iris + 0.2, theta))[..., None]
    fundo = np.array([0.30, 0.19, 0.09])[None, None, :]
    dentro = 1.0 - sstep(iris - 0.6, iris + 0.2, theta)
    rgb = rgb * (1 - dentro[..., None]) + fundo * dentro[..., None]
    return np.dstack([np.clip(rgb, 0.0, 1.0), np.ones((n, n))])


def _veias(theta, omega, n, semente, quantas=20):
    """Alfa (0 a 1) de veinhas vermelhas: do aro do olho para a íris, com ramos, desenhadas por distância a segmentos (em coordenadas do disco da textura)."""
    rng = np.random.default_rng(semente)
    ys, xs = (np.mgrid[0:n, 0:n] + 0.5) / n
    alfa = np.zeros((n, n))

    def segmento(p, q, largura, forca):
        x0, y0 = int(max(min(p[0], q[0]) * n - 6, 0)), int(max(min(p[1], q[1]) * n - 6, 0))
        x1, y1 = int(min(max(p[0], q[0]) * n + 6, n)), int(min(max(p[1], q[1]) * n + 6, n))
        if x1 <= x0 or y1 <= y0:
            return
        px, py = xs[y0:y1, x0:x1], ys[y0:y1, x0:x1]
        vx, vy = q[0] - p[0], q[1] - p[1]
        L2 = max(vx * vx + vy * vy, 1e-9)
        t = np.clip(((px - p[0]) * vx + (py - p[1]) * vy) / L2, 0.0, 1.0)
        d = np.hypot(px - (p[0] + t * vx), py - (p[1] + t * vy))
        a = forca * np.exp(-(d / largura) ** 2)
        alfa[y0:y1, x0:x1] = np.maximum(alfa[y0:y1, x0:x1], a)

    def ponto(grau, azim):
        r = grau / D.TEXTURA_GRAUS * 0.5
        return (0.5 + r * math.cos(azim), 0.5 + r * math.sin(azim))

    for _ in range(quantas):
        azim = rng.uniform(0, 2 * math.pi)
        g = rng.uniform(86.0, 99.0)
        fim = rng.uniform(47.0, 66.0)
        passos = 14
        prev = ponto(g, azim)
        ramo = rng.integers(5, 9)
        for k in range(1, passos + 1):
            f = k / passos
            azim += rng.normal(0, 0.05)
            gk = g + (fim - g) * f
            cur = ponto(gk, azim)
            segmento(prev, cur, 0.0030 * (1.0 - 0.45 * f), 0.85 * (1.0 - 0.35 * f))
            if k == ramo:
                a2, g2 = azim + rng.choice([-1, 1]) * rng.uniform(0.22, 0.45), gk
                prev2 = cur
                for k2 in range(1, 7):
                    f2 = k2 / 7
                    a2 += rng.normal(0, 0.06)
                    c2 = ponto(g2 + (fim - 8.0 - g2) * f2 * 0.8, a2)
                    segmento(prev2, c2, 0.0022 * (1.0 - 0.5 * f2), 0.6 * (1.0 - 0.5 * f2))
                    prev2 = c2
            prev = cur
    return alfa


def _esclera_cansada(theta, omega, n):
    """A parte branca avermelhada com veinhas: rosada em todo o olho, mais vermelha para o aro e para os cantos, com as veias por cima."""
    rosa = np.array([1.0, 0.86, 0.84])
    vermelho = np.array([0.98, 0.58, 0.56])
    t = (0.25 + 0.55 * sstep(50.0, 100.0, theta))
    t = t * (0.9 + 0.2 * ruido(n, 11, 5))
    rgb = rosa[None, None, :] * (1 - t)[..., None] + vermelho[None, None, :] * t[..., None]
    veia = _veias(theta, omega, n, 5)
    cor_veia = np.array([0.74, 0.14, 0.16])
    rgb = rgb * (1 - 0.85 * veia)[..., None] + cor_veia[None, None, :] * (0.85 * veia)[..., None]
    return rgb * (1.0 - 0.14 * sstep(66.0, 100.0, theta))[..., None]


def _luz_da_iris(estilo, rho, omega, ys, n):
    """Tons de cinza de 0 a 1 da íris (`rho` 0 no centro, 1 na borda, em `IRIS_GRAUS`): 1,0 junto da pupila, 45 a 50 por cento perto da borda, mais o contorno escuro."""
    theta = rho * D.IRIS_GRAUS
    pup = D.PUPILA_BASE_GRAUS
    iris = D.IRIS_GRAUS
    t = np.clip((theta - pup) / (iris - pup), 0.0, 1.0)
    fibras = 0.5 + 0.5 * np.sin(omega * 47.0 + 2.2 * np.sin(omega * 7.0) + 6.0 * ruido(n, 1, 6))
    grao = ruido(n, 2, 64) - 0.5
    if estilo == "olho_kawaii":
        vy = ys * 2.0                                                  # -1 embaixo, +1 em cima
        base = 0.96 - 0.20 * sstep(0.0, 0.55, t) - 0.10 * sstep(0.55, 1.0, t)
        vertical = 0.56 + 0.44 * (1.0 - sstep(-0.85, 0.95, vy))        # o alto é mais escuro, o baixo é claro (o jeito de olho de desenho)
        luz = base * vertical
        brilho_baixo = 0.22 * np.exp(-(((rho - 0.70) / 0.20) ** 2)) * (1.0 - sstep(-0.1, 0.55, vy))
        luz = luz + brilho_baixo + 0.05 * (fibras - 0.5) * (1 - t)
        luz = luz * (1.0 - 0.58 * sstep(iris - 2.6, iris - 0.2, theta))
    elif estilo == "olho_bravo":
        base = 0.98 - 0.42 * sstep(0.0, 0.35, t) - 0.18 * sstep(0.35, 1.0, t)
        vertical = 0.80 + 0.20 * (1.0 - sstep(-0.8, 0.9, ys * 2.0))
        luz = base * vertical * (0.93 + 0.14 * fibras * (1 - 0.4 * t)) + 0.05 * np.exp(-((theta - (pup + 2.0)) / 1.6) ** 2)
        luz = luz * (1.0 - 0.72 * sstep(iris - 4.4, iris - 0.3, theta))
    elif estilo == "olho_cansado":
        base = 0.84 - 0.20 * sstep(0.0, 0.6, t) - 0.12 * sstep(0.6, 1.0, t)
        luz = base * (0.93 + 0.08 * fibras * (1 - 0.5 * t) + 0.10 * grao) + 0.04 * np.exp(-((theta - (pup + 2.0)) / 2.0) ** 2)
        luz = luz * (1.0 - 0.50 * sstep(iris - 3.0, iris - 0.3, theta))
    else:
        base = 0.96 - 0.20 * sstep(0.0, 0.55, t) - 0.26 * sstep(0.55, 1.0, t)
        luz = base * (0.94 + 0.10 * fibras * (1 - 0.6 * t) + 0.04 * grao * 2.0) + 0.07 * np.exp(-((theta - (pup + 2.0)) / 2.0) ** 2)
        luz = luz * (1.0 - 0.62 * sstep(iris - 3.4, iris - 0.3, theta))
    return np.clip(luz, 0.0, 1.0)


def iris(estilo="olho_normal", n=256):
    """RGBA (n, n, 4), linha 0 embaixo: a íris em tons de cinza (o jogo tinge com a cor do olho); disco de raio 0,5 = `IRIS_GRAUS`. Alfa 1 em todo o quadrado."""
    dx, dy = _grade(n)
    rho = np.clip(2 * np.hypot(dx, dy), 0.0, 1.0)
    omega = np.arctan2(dy, dx)
    luz = _luz_da_iris(estilo, rho, omega, dy, n)
    return np.dstack([luz, luz, luz, np.ones((n, n))])


def olheira(n=64):
    """O crescente da olheira (alfa macio, roxo acinzentado); x é o comprimento (de dentro para fora) e y a largura (de dentro para fora do crescente)."""
    ys, xs = (np.mgrid[0:n, 0:n] + 0.5) / n
    alfa = 0.62 * np.sin(np.pi * xs) ** 0.55 * np.sin(np.pi * ys) ** 0.9
    rgb = np.zeros((n, n, 3)) + np.array([0.30, 0.15, 0.37])
    return np.dstack([rgb, alfa])


COR_DO_CABELO = {"preto": (0.045, 0.040, 0.046), "castanho": (0.22, 0.115, 0.055), "grisalho": (0.40, 0.40, 0.42)}


def cabelo(cor, n=128):
    """Os fios do bigode: faixas finas ao longo de x (a direção do bigode), brilhos aleatórios; o grisalho mistura fios escuros e claros."""
    rng = np.random.default_rng({"preto": 21, "castanho": 22, "grisalho": 23}[cor])
    base = np.array(COR_DO_CABELO[cor])
    ys, xs = (np.mgrid[0:n, 0:n] + 0.5) / n
    fios = 56
    linha = rng.uniform(0.62, 1.30, fios)
    fase = rng.uniform(0, 6.28, fios)
    idx = np.minimum((ys * fios).astype(int), fios - 1)
    onda = 0.10 * np.sin(xs * 9.0 + fase[idx]) + 0.06 * np.sin(xs * 23.0 + 2.0 * fase[idx])
    v = linha[idx] + onda
    if cor == "grisalho":
        escuro = rng.random(fios) < 0.38
        v = np.where(escuro[idx], 0.42 + 0.2 * onda, 1.08 + 0.4 * onda)
    brilho = np.clip((ruido(n, 31, 12) - 0.55) * 0.9, 0.0, 1.0)
    rgb = base[None, None, :] * v[..., None] + brilho[..., None] * (0.10 if cor != "grisalho" else 0.08)
    return np.dstack([np.clip(rgb, 0.0, 1.0), np.ones((n, n))])


def todas():
    """Todas as texturas do balão: {nome do arquivo: RGBA}."""
    saida = {"bochecha.png": bochecha(), "olheira.png": olheira()}
    for e in D.IDS_DE_ESTILO:
        saida["esclera_%s.png" % e[len("olho_"):]] = esclera(e)
        saida["iris_%s.png" % e[len("olho_"):]] = iris(e)
    for c in COR_DO_CABELO:
        saida["cabelo_%s.png" % c] = cabelo(c)
    return saida


def bochecha(n=64):
    """O rubor: rosa-coral com alfa forte no meio e borda macia; sobre azul, laranja, verde ou violeta continua rosado (o corpo é tingido, a bochecha não)."""
    ys, xs = (np.mgrid[0:n, 0:n] + 0.5) / n
    r = 2 * np.hypot(xs - 0.5, ys - 0.5)
    alfa = 0.76 * (1 - sstep(0.25, 1.0, r)) ** 1.2
    rgb = np.zeros((n, n, 3)) + np.array([1.0, 0.66, 0.74])
    return np.dstack([rgb, alfa])


def gravar(nome, rgba):
    """Grava o PNG pelo Blender (sRGB) e devolve o caminho."""
    import bpy
    os.makedirs(SAIDA, exist_ok=True)
    caminho = os.path.join(SAIDA, nome)
    h, w = rgba.shape[:2]
    rascunho = "_gravando_" + nome            # outro nome: a imagem que o material já usa não pode sumir (ela só é recarregada do disco)
    for im in [i for i in bpy.data.images if i.name == rascunho]:
        bpy.data.images.remove(im)
    im = bpy.data.images.new(rascunho, w, h, alpha=True)
    im.colorspace_settings.name = "sRGB"
    lin = rgba.copy()
    lin[..., :3] = np.where(lin[..., :3] <= 0.04045, lin[..., :3] / 12.92, ((lin[..., :3] + 0.055) / 1.055) ** 2.4)   # o que pintei é sRGB: o buffer do Blender é linear
    im.pixels.foreach_set(lin.astype(np.float32).ravel())
    im.filepath_raw = caminho
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)
    return caminho


if __name__ == "__main__":
    for nome, rgba in todas().items():
        print(gravar(nome, rgba))
