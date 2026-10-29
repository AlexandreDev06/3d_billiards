"""Um rasterizador mínimo em numpy (z-buffer, sem sombreamento) para conferir o rosto por script, sem abrir imagem.

`ids(m, camera, tam)` devolve duas matrizes: o material e a parte (índice em `m.partes`) do triângulo mais próximo de cada pixel.
A câmera é (posição, alvo, fov_vertical_graus), em cm; o mundo é o do Blender (rosto para -Y, +Z para cima). Faces de costas são descartadas
(as malhas são de um lado só, como no jogo).
"""
import math

import numpy as np



def _triangulos(m):
    tri, mat = [], []
    for f, mt in zip(m.F, m.M):
        for i in range(1, len(f) - 1):
            tri.append((f[0], f[i], f[i + 1]))
            mat.append(mt)
    return np.array(tri, dtype=np.int64), np.array(mat, dtype=np.int64)


def parte_de_cada_vertice(m):
    ordem = np.full(len(m.V), -1, dtype=np.int64)
    nomes = list(m.partes)
    for k, nome in enumerate(nomes):
        a, b = m.partes[nome]
        ordem[a:b] = k
    return ordem, nomes


def ids(m, camera, tam=(240, 240), V=None):
    pos, alvo, fov = (np.array(camera[0], float), np.array(camera[1], float), camera[2])
    V = np.array(m.V if V is None else V, float)
    fw = alvo - pos
    fw /= np.linalg.norm(fw)
    dir_dir = np.cross(fw, np.array([0.0, 0.0, 1.0]))
    dir_dir /= np.linalg.norm(dir_dir)
    cima = np.cross(dir_dir, fw)
    rel = V - pos
    x, y, z = rel @ dir_dir, rel @ cima, rel @ fw
    W, H = tam
    f = (H / 2) / math.tan(math.radians(fov) / 2)
    px = W / 2 + f * x / z
    py = H / 2 - f * y / z
    tri, mat = _triangulos(m)
    parte_v, _ = parte_de_cada_vertice(m)
    zbuf = np.full((H, W), np.inf)
    mid = np.full((H, W), -1, dtype=np.int64)
    pid = np.full((H, W), -1, dtype=np.int64)
    for t, mt in zip(tri, mat):
        a, b, c = t
        x0, y0, x1, y1, x2, y2 = px[a], py[a], px[b], py[b], px[c], py[c]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if area >= -1e-9:               # de costas (a ordem anti-horária no mundo vira horária na tela com y para baixo) ou degenerado
            continue
        xmin, xmax = int(max(math.floor(min(x0, x1, x2)), 0)), int(min(math.ceil(max(x0, x1, x2)), W - 1))
        ymin, ymax = int(max(math.floor(min(y0, y1, y2)), 0)), int(min(math.ceil(max(y0, y1, y2)), H - 1))
        if xmax < xmin or ymax < ymin:
            continue
        gx, gy = np.meshgrid(np.arange(xmin, xmax + 1) + 0.5, np.arange(ymin, ymax + 1) + 0.5)
        w0 = ((x1 - gx) * (y2 - gy) - (x2 - gx) * (y1 - gy)) / area
        w1 = ((x2 - gx) * (y0 - gy) - (x0 - gx) * (y2 - gy)) / area
        w2 = 1 - w0 - w1
        dentro = (w0 >= -1e-6) & (w1 >= -1e-6) & (w2 >= -1e-6)
        if not dentro.any():
            continue
        zz = w0 * z[a] + w1 * z[b] + w2 * z[c]
        sub = zbuf[ymin:ymax + 1, xmin:xmax + 1]
        melhor = dentro & (zz < sub - 1e-5)
        sub[melhor] = zz[melhor]
        mid[ymin:ymax + 1, xmin:xmax + 1][melhor] = mt
        pid[ymin:ymax + 1, xmin:xmax + 1][melhor] = parte_v[a]
    return mid, pid


CARACTERES = {-1: " ", 0: ".", 1: "W", 2: "#", 3: "t", 4: "c", 5: "*", 6: "o", 7: "d", 8: "m", 9: "i", 10: "e"}


def ascii_de(mid, passo=(2, 2), caixa=None):
    """Imprime o mapa de materiais: . látex, W olho, # preto, t língua, * brilho, o bochecha, d dentes, m interior da boca."""
    if caixa:
        x0, y0, x1, y1 = caixa
        mid = mid[y0:y1, x0:x1]
    linhas = []
    for j in range(0, mid.shape[0], passo[1]):
        linhas.append("".join(CARACTERES[int(mid[j, i])] for i in range(0, mid.shape[1], passo[0])))
    return "\n".join(linhas)


class Subconjunto:
    """Só as faces cujos vértices estão todos nas partes pedidas (para ver o que apareceria se nada tapasse)."""

    def __init__(self, m, nomes):
        self.V, self.UV, self.partes = m.V, m.UV, m.partes
        faixas = [m.partes[n] for n in nomes]
        F, M = [], []
        for f, mt in zip(m.F, m.M):
            if all(any(a <= i < b for a, b in faixas) for i in f):
                F.append(f)
                M.append(mt)
        self.F, self.M = F, M
