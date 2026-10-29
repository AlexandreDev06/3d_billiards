"""As texturas dos chapéus (autorais, em numpy; PNG pequeno): palha trançada, feltro, lã de tricô, tecido do boné, o emblema da bolinha 8, ouro escovado, xadrez da fita e as listras de festa.

Fora do Blender as funções só devolvem as matrizes RGBA (sRGB, linha 0 embaixo); dentro dele, `gravar` escreve o PNG em `arte/personagens/texturas/chapeus/`.
"""
import math
import os

import numpy as np

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
SAIDA = os.path.abspath(os.path.join(PASTA, "..", "..", "texturas", "chapeus"))


def _ruido(n, semente, escala):
    rng = np.random.default_rng(semente)
    g = rng.random((escala + 1, escala + 1))
    ys, xs = np.mgrid[0:n, 0:n] / n * escala
    x0, y0 = xs.astype(int), ys.astype(int)
    fx, fy = xs - x0, ys - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a = g[y0, x0] * (1 - fx) + g[y0, x0 + 1] * fx
    b = g[y0 + 1, x0] * (1 - fx) + g[y0 + 1, x0 + 1] * fx
    return a * (1 - fy) + b * fy


def _rgba(rgb, alfa=1.0):
    h, w = rgb.shape[:2]
    return np.dstack([np.clip(rgb, 0, 1), np.full((h, w), alfa) if np.isscalar(alfa) else alfa])


def palha(n=128):
    """Trançado de cestaria: tiras de 8 px em células de 16, uma por cima da outra; fios finos ao longo de cada tira."""
    ys, xs = np.mgrid[0:n, 0:n]
    c = 16
    ci, cj = xs // c, ys // c
    horizontal = (ci + cj) % 2 == 0
    ao_longo = np.where(horizontal, xs % c, ys % c) / c
    atravessa = np.where(horizontal, ys % 8, xs % 8) / 8.0
    perfil = np.sin(math.pi * atravessa) ** 0.55
    sombra_borda = 0.55 + 0.45 * perfil
    fio = 0.5 + 0.5 * np.sin(np.where(horizontal, ys, xs) * 2.7 + _ruido(n, 3, 12) * 9)
    pasta = _ruido(n, 4, 24)
    base = np.array([0.88, 0.74, 0.44])[None, None, :]
    tom = (0.82 + 0.10 * fio + 0.12 * pasta)[..., None] * sombra_borda[..., None]
    sob = 0.80 + 0.20 * np.sin(math.pi * ao_longo)          # a tira dobra sobre a outra nas pontas
    rgb = base * tom * sob[..., None]
    return _rgba(rgb)


def feltro(n=128):
    """Feltro: cinza médio com fibras e manchas suaves (a cor sai do fator do material)."""
    r = np.random.default_rng(11)
    g = 0.62 + 0.14 * (_ruido(n, 5, 16) - 0.5) * 2 + 0.07 * (r.random((n, n)) - 0.5) * 2
    return _rgba(np.dstack([g, g, g]))


def _tricot(n, cor_a, cor_b, faixa, passo_x=8, passo_y=6):
    """Pontos de tricô em V (meia): colunas de pontos, cada um um V; `faixa` px por listra de `cor_a` e `cor_b` (None = só `cor_a`)."""
    ys, xs = np.mgrid[0:n, 0:n]
    u = (xs % passo_x) / passo_x
    v = (ys % passo_y) / passo_y
    perna = np.abs(u - 0.5) * 2
    dobra = np.clip(1.0 - np.abs(perna - (1.0 - v)) * 2.2, 0.0, 1.0)
    luz = 0.58 + 0.42 * dobra
    luz *= 0.88 + 0.12 * _ruido(n, 7, 32)
    if faixa:
        sel = ((ys // faixa) % 2 == 0)[..., None]
        cor = np.where(sel, np.array(cor_a)[None, None, :], np.array(cor_b)[None, None, :])
    else:
        cor = np.array(cor_a)[None, None, :] + 0 * luz[..., None]
    return _rgba(cor * luz[..., None])


def la_listrada(n=128):
    return _tricot(n, (0.84, 0.10, 0.14), (0.96, 0.92, 0.80), 64)


def la_barra(n=64):
    ys, xs = np.mgrid[0:n, 0:n]
    costela = 0.62 + 0.38 * np.sin(xs / 4.0 * math.pi) ** 2
    ru = 0.9 + 0.1 * _ruido(n, 9, 16)
    return _rgba(np.array([0.96, 0.92, 0.80])[None, None, :] * (costela * ru)[..., None])


def la_pompom(n=64):
    r = np.random.default_rng(13)
    f = 0.80 + 0.14 * (_ruido(n, 15, 20) - 0.5) * 2 + 0.10 * (r.random((n, n)) - 0.5)
    return _rgba(np.array([0.97, 0.94, 0.86])[None, None, :] * f[..., None])


def tecido_bone(n=128):
    ys, xs = np.mgrid[0:n, 0:n]
    sarja = 0.5 + 0.5 * np.sin((xs + ys) * 2 * math.pi / 6)
    f = 0.86 + 0.10 * sarja + 0.07 * (_ruido(n, 17, 24) - 0.5) * 2
    return _rgba(np.array([0.84, 0.12, 0.14])[None, None, :] * f[..., None])


def emblema_8(n=128):
    """Uma bolinha 8: disco branco com contorno preto e um 8 feito de dois aros (UV centrada em 0,5)."""
    ys, xs = (np.mgrid[0:n, 0:n] + 0.5) / n
    dx, dy = xs - 0.5, ys - 0.5
    rho = np.hypot(dx, dy)
    rgb = np.ones((n, n, 3)) * 0.97
    preto = np.array([0.03, 0.03, 0.04])
    anel = (rho > 0.43) & (rho <= 0.5)
    for cy, raio in ((0.13, 0.115), (-0.13, 0.145)):
        r2 = np.hypot(dx, dy - cy)
        anel |= (r2 > raio - 0.055) & (r2 <= raio)
    rgb[anel] = preto
    dentro = (rho <= 0.5)
    return _rgba(rgb, dentro.astype(float))


def ouro(n=64):
    ys, xs = np.mgrid[0:n, 0:n]
    risco = 0.5 + 0.5 * np.sin(ys * 1.3 + _ruido(n, 19, 8) * 6)
    f = 0.86 + 0.09 * risco + 0.05 * (_ruido(n, 21, 24) - 0.5) * 2
    return _rgba(np.array([1.0, 0.80, 0.32])[None, None, :] * f[..., None])


def xadrez(n=64):
    ys, xs = np.mgrid[0:n, 0:n]
    c = (((xs // 16) + (ys // 16)) % 2 == 0)[..., None]
    tec = 0.88 + 0.12 * np.sin((xs + ys) * math.pi / 2) * 0.5 + 0.06 * (_ruido(n, 23, 24) - 0.5)
    rgb = np.where(c, np.array([0.84, 0.10, 0.13])[None, None, :], np.array([0.97, 0.96, 0.92])[None, None, :]) * tec[..., None]
    return _rgba(rgb)


def listras_festa(n=128):
    ys, xs = np.mgrid[0:n, 0:n]
    cores = np.array([[0.98, 0.82, 0.14], [0.93, 0.17, 0.55], [0.10, 0.70, 0.92], [0.98, 0.97, 0.94]])
    k = (((xs + ys) % 64) // 16)
    rgb = cores[k]
    r = np.random.default_rng(29)
    for _ in range(26):
        x, y, rr = r.integers(0, n), r.integers(0, n), r.integers(2, 4)
        m = np.hypot(xs - x, ys - y) < rr
        rgb[m] = np.array([0.98, 0.97, 0.94]) if k[y % n, x % n] != 3 else np.array([0.93, 0.17, 0.55])
    return _rgba(rgb * (0.94 + 0.06 * _ruido(n, 31, 16))[..., None])


def todas():
    return {
        "palha.png": palha(), "feltro.png": feltro(), "la_listrada.png": la_listrada(), "la_barra.png": la_barra(), "la_pompom.png": la_pompom(),
        "tecido_bone.png": tecido_bone(), "emblema_8.png": emblema_8(), "ouro.png": ouro(), "xadrez.png": xadrez(), "listras_festa.png": listras_festa(),
    }


def gravar(nome, rgba):
    """Grava o PNG pelo Blender (sRGB) e devolve o caminho (o buffer do Blender é linear: converte antes)."""
    import bpy
    os.makedirs(SAIDA, exist_ok=True)
    caminho = os.path.join(SAIDA, nome)
    h, w = rgba.shape[:2]
    rascunho = "_gravando_" + nome
    for im in [i for i in bpy.data.images if i.name == rascunho]:
        bpy.data.images.remove(im)
    im = bpy.data.images.new(rascunho, w, h, alpha=True)
    im.colorspace_settings.name = "sRGB"
    lin = rgba.copy()
    lin[..., :3] = np.where(lin[..., :3] <= 0.04045, lin[..., :3] / 12.92, ((lin[..., :3] + 0.055) / 1.055) ** 2.4)
    im.pixels.foreach_set(lin.astype(np.float32).ravel())
    im.filepath_raw = caminho
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)
    return caminho


if __name__ == "__main__":
    for nome, rgba in todas().items():
        print(gravar(nome, rgba))
