"""Cores: tudo é escrito em sRGB (#rrggbb) e convertido para linear só na hora de entregar ao Blender."""
import colorsys


def _lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def rgb(hexa):
    """'#rrggbb' ou 0xrrggbb → (r, g, b) em sRGB, 0 a 1."""
    if isinstance(hexa, str):
        hexa = int(hexa.lstrip("#"), 16)
    return ((hexa >> 16) & 255) / 255.0, ((hexa >> 8) & 255) / 255.0, (hexa & 255) / 255.0


def linear(c):
    """(r, g, b) sRGB → linear, o que o Blender guarda."""
    r, g, b = c[:3]
    return _lin(r), _lin(g), _lin(b)


def misturar(a, b, t):
    """Mistura em sRGB (perceptual, o que o olho espera de um degradê pintado)."""
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def hsv(c):
    return colorsys.rgb_to_hsv(*c[:3])


def de_hsv(h, s, v):
    return colorsys.hsv_to_rgb(h % 1.0, min(max(s, 0), 1), min(max(v, 0), 1))


def claro(c, t):
    """Clareia `t` (0 a 1) em direção ao branco."""
    return misturar(c, (1, 1, 1), t)


def escuro(c, t):
    """Escurece `t` (0 a 1) em direção ao preto."""
    return misturar(c, (0, 0, 0), t)


def ajustar(c, dh=0.0, ds=0.0, dv=0.0):
    h, s, v = colorsys.rgb_to_hsv(*c[:3])
    return colorsys.hsv_to_rgb((h + dh) % 1.0, min(max(s + ds, 0), 1), min(max(v + dv, 0), 1))


# As quinze bolas (cores de bar: o amarelo é amarelo, o 8 é preto). 9 a 15 são as mesmas cores com a listra branca.
BOLAS = {
    1: rgb("#f6c515"),  # amarela
    2: rgb("#1d4fd6"),  # azul
    3: rgb("#e22a1d"),  # vermelha
    4: rgb("#5a2a93"),  # roxa
    5: rgb("#f27a12"),  # laranja
    6: rgb("#0f8a46"),  # verde
    7: rgb("#7d1d27"),  # grená
    8: rgb("#14141a"),  # preta
}
for _n in range(9, 16):
    BOLAS[_n] = BOLAS[_n - 8]
LISTRADAS = tuple(range(9, 16))
