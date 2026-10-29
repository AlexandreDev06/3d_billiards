"""Cartazes, rótulos, adesivos, calendário, escudo, a tela da TV e o resto do que tem desenho no boteco (P5).

Tudo desenhado por script (Pillow + numpy, a fonte de traço de `letras.py`), sem arte de terceiros: marcas, times e logos são inventados
("Dourada", "Serra Azul", "Rainha do Sul", "Bem-te-vi", "E.C. Beco"). `gerar(pasta)` grava em `<pasta>/<nivel>/`: os sinais (JPG, cada um do tamanho
que o `cena.py` pede), o atlas de rótulos das garrafas (`rotulos.jpg`, 4x4 de 256 px) e as telas acesas (`tv-tela.jpg`, `vitrine.jpg`).
"""
import calendar
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import letras
import texturas as T

PAPEL = (236, 228, 208)


# ---------------------------------------------------------------- utilidades de desenho
def _tinta(img, tam, forca=0.1, semente=1, sujo=0.0):
    """Papel/plástico envelhecido: grão e manchas por cima do desenho."""
    a = np.asarray(img.convert("RGB"), np.float32) / 255.0
    h, w = a.shape[:2]
    r = T.rng_de(semente)
    a = a * (1.0 - forca * 0.5 + forca * T.ruido(h, w, 1.0, rng=r))[:, :, None]
    if sujo > 0:
        m = T.lisstep(0.58, 0.92, T.ruido(h, w, 2.4, rng=r))
        a = a * (1 - sujo * m)[:, :, None] * T.tinte(1.0, 0.95, 0.85)[None, None, :]
        borda = np.minimum(np.minimum(np.arange(w)[None, :], w - 1 - np.arange(w)[None, :]), np.minimum(np.arange(h)[:, None], h - 1 - np.arange(h)[:, None]))
        a = a * (1 - sujo * 0.6 * T.lisstep(18, 0, borda))[:, :, None]
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))


def _texto(img, txt, cx, yb, alt, cor, largura_max, gap=2.0, esp=1.0, ancora="centro"):
    s = alt / 10.0
    tr, wt = letras.compor(txt, gap)
    if wt * s > largura_max:
        s = largura_max / wt
    x0 = cx - wt * s / 2 if ancora == "centro" else (cx if ancora == "esq" else cx - wt * s)
    tr = letras.transformar(tr, s, x0, yb, True)
    d = ImageDraw.Draw(img)
    lw = max(2, int(s * 1.7 * esp))
    for t in tr:
        d.line(t, fill=cor, width=lw, joint="curve")
        for p in (t[0], t[-1]):
            d.ellipse((p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2), fill=cor)
    return wt * s


def _estrela(d, cx, cy, r, cor, pontas=5, interno=0.42, giro=-90):
    pts = []
    for k in range(pontas * 2):
        rr = r if k % 2 == 0 else r * interno
        a = math.radians(giro + 180 * k / pontas)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=cor)


def _super(w, h, fundo, fn, ss=2):
    """Desenha em `ss` vezes o tamanho e reduz (bordas suaves)."""
    im = Image.new("RGB", (w * ss, h * ss), fundo)
    fn(ImageDraw.Draw(im), ss)
    return im.resize((w, h), Image.LANCZOS)


def _garrafa_desenho(d, cx, y0, alt, cor, tampa=(220, 180, 40), ss=1):
    """Silhueta de garrafa de cerveja (corpo, ombro, gargalo) com a base em y0."""
    w = alt * 0.28
    d.rounded_rectangle((cx - w / 2, y0 - alt * 0.62, cx + w / 2, y0), int(w * 0.18), fill=cor)
    d.polygon([(cx - w / 2, y0 - alt * 0.6), (cx + w / 2, y0 - alt * 0.6), (cx + w * 0.17, y0 - alt * 0.86), (cx - w * 0.17, y0 - alt * 0.86)], fill=cor)
    d.rectangle((cx - w * 0.17, y0 - alt * 0.97, cx + w * 0.17, y0 - alt * 0.84), fill=cor)
    d.rectangle((cx - w * 0.19, y0 - alt, cx + w * 0.19, y0 - alt * 0.96), fill=tampa)
    d.rectangle((cx - w * 0.42, y0 - alt * 0.45, cx + w * 0.42, y0 - alt * 0.22), fill=(240, 232, 205))


def _copo_chope(d, cx, y0, alt, cor=(240, 170, 40), espuma=(250, 248, 240)):
    w = alt * 0.62
    d.polygon([(cx - w / 2, y0 - alt), (cx + w / 2, y0 - alt), (cx + w * 0.42, y0), (cx - w * 0.42, y0)], fill=cor)
    d.rectangle((cx - w * 0.46, y0 - alt * 1.22, cx + w * 0.46, y0 - alt * 0.96), fill=espuma)
    for dx in (-0.3, 0.0, 0.3):
        d.ellipse((cx + dx * w - w * 0.2, y0 - alt * 1.38, cx + dx * w + w * 0.2, y0 - alt * 1.02), fill=espuma)
    d.arc((cx + w * 0.4, y0 - alt * 0.85, cx + w * 0.95, y0 - alt * 0.25), -80, 80, fill=(236, 232, 220), width=max(3, int(alt * 0.07)))


def _coroa(d, cx, cy, r, cor):
    d.polygon([(cx - r, cy + r * 0.5), (cx - r, cy - r * 0.3), (cx - r * 0.5, cy + r * 0.1), (cx, cy - r * 0.6), (cx + r * 0.5, cy + r * 0.1), (cx + r, cy - r * 0.3), (cx + r, cy + r * 0.5)], fill=cor)


def _passaro(d, cx, cy, s, cor):
    """Um bem-te-vi de perfil: corpo, cabeça, bico, cauda e asa."""
    d.ellipse((cx - s * 0.5, cy - s * 0.28, cx + s * 0.4, cy + s * 0.3), fill=cor)
    d.ellipse((cx + s * 0.22, cy - s * 0.52, cx + s * 0.66, cy - s * 0.1), fill=cor)
    d.polygon([(cx + s * 0.62, cy - s * 0.34), (cx + s * 0.95, cy - s * 0.28), (cx + s * 0.62, cy - s * 0.22)], fill=(250, 200, 40))
    d.polygon([(cx - s * 0.4, cy + s * 0.05), (cx - s * 1.0, cy + s * 0.32), (cx - s * 0.85, cy + s * 0.42), (cx - s * 0.3, cy + s * 0.22)], fill=cor)
    d.ellipse((cx - s * 0.2, cy - s * 0.08, cx + s * 0.25, cy + s * 0.2), fill=(250, 204, 60))
    d.ellipse((cx + s * 0.46, cy - s * 0.36, cx + s * 0.52, cy - s * 0.3), fill=(250, 250, 250))


# ---------------------------------------------------------------- rótulos das garrafas (atlas 4x4, 256 px por célula)
ROTULOS = [  # (linha 1, linha 2, fundo, texto, destaque, emblema)
    ("CACHACA", "BEM-TE-VI", (236, 206, 60), (30, 70, 40), (30, 120, 60), "passaro"),
    ("PINGA", "SERRANA", (232, 214, 160), (110, 44, 30), (170, 80, 40), "montanha"),
    ("CERVEJA", "DOURADA", (210, 150, 30), (255, 250, 230), (120, 60, 10), "coroa"),
    ("VINHO", "CANTARES", (110, 24, 52), (250, 226, 160), (220, 170, 90), "uva"),
    ("BITTER", "DO MATO", (26, 100, 66), (255, 240, 176), (230, 190, 70), "folha"),
    ("LICOR", "JENIPAPO", (200, 120, 30), (60, 20, 10), (255, 232, 160), "sol"),
    ("DOSE", "DUPLA", (240, 238, 230), (190, 36, 36), (30, 30, 30), "estrela"),
    ("CHOPP", "ALVORADA", (230, 130, 30), (255, 255, 255), (80, 30, 10), "sol"),
    ("SERRA AZUL", "PILSEN", (28, 74, 160), (255, 255, 255), (150, 210, 255), "montanha"),
    ("RAINHA", "DO SUL", (176, 30, 36), (255, 246, 220), (255, 214, 96), "coroa"),
    ("CACHACA", "ALAMBIQUE", (30, 28, 30), (240, 196, 84), (200, 150, 50), "estrela"),
    ("GUARANA", "ONCA", (40, 140, 60), (255, 236, 90), (255, 255, 255), "folha"),
    ("LARANJADA", "SOLAR", (250, 150, 30), (255, 255, 255), (130, 50, 0), "sol"),
    ("AGUA", "TONICA", (190, 216, 230), (24, 70, 120), (255, 255, 255), "estrela"),
    ("CAJU", "AMARELO", (250, 210, 90), (140, 40, 20), (60, 120, 50), "folha"),
    ("PIMENTA", "MALAGUETA", (200, 36, 24), (255, 232, 140), (30, 90, 30), "folha"),
]


def _emblema(d, tipo, cx, cy, r, cor):
    if tipo == "estrela":
        _estrela(d, cx, cy, r, cor)
    elif tipo == "sol":
        d.ellipse((cx - r * 0.55, cy - r * 0.55, cx + r * 0.55, cy + r * 0.55), fill=cor)
        for k in range(12):
            a = math.radians(30 * k)
            d.line((cx + r * 0.7 * math.cos(a), cy + r * 0.7 * math.sin(a), cx + r * math.cos(a), cy + r * math.sin(a)), fill=cor, width=max(2, int(r * 0.12)))
    elif tipo == "coroa":
        _coroa(d, cx, cy, r, cor)
    elif tipo == "passaro":
        _passaro(d, cx, cy, r * 1.4, cor)
    elif tipo == "montanha":
        d.polygon([(cx - r, cy + r * 0.6), (cx - r * 0.3, cy - r * 0.5), (cx + r * 0.1, cy + r * 0.1), (cx + r * 0.5, cy - r * 0.8), (cx + r, cy + r * 0.6)], fill=cor)
    elif tipo == "uva":
        for k in range(10):
            row = int((math.sqrt(8 * k + 1) - 1) / 2)
            col = k - row * (row + 1) // 2
            d.ellipse((cx + (col - row / 2) * r * 0.5 - r * 0.24, cy - r * 0.6 + row * r * 0.42 - r * 0.24, cx + (col - row / 2) * r * 0.5 + r * 0.24, cy - r * 0.6 + row * r * 0.42 + r * 0.24), fill=cor)
    elif tipo == "folha":
        d.pieslice((cx - r, cy - r * 0.5, cx + r * 0.3, cy + r * 0.9), 200, 360, fill=cor)
        d.pieslice((cx - r * 0.3, cy - r * 0.9, cx + r, cy + r * 0.5), 20, 180, fill=cor)


def rotulos(w=1024, h=1024):
    img = Image.new("RGB", (w, h), (30, 30, 30))
    d = ImageDraw.Draw(img)
    for i, (l1, l2, fundo, fg, dest, emb) in enumerate(ROTULOS):
        x0, y0 = (i % 4) * 256, (i // 4) * 256
        d.rectangle((x0, y0, x0 + 255, y0 + 255), fill=fundo)
        d.rectangle((x0 + 8, y0 + 10, x0 + 247, y0 + 245), outline=fg, width=5)
        d.line((x0 + 8, y0 + 84, x0 + 247, y0 + 84), fill=dest, width=5)
        d.line((x0 + 8, y0 + 176, x0 + 247, y0 + 176), fill=dest, width=5)
        _emblema(d, emb, x0 + 128, y0 + 46, 26, dest)
        sub = Image.new("RGB", (256, 256), fundo)
        _texto(sub, l1, 128, 126, 40, fg, 206, 1.8)
        _texto(sub, l2, 128, 168, 38, dest if sum(dest) > 240 and fundo != dest else fg, 206, 1.8)
        img.paste(sub.crop((0, 86, 256, 176)), (x0, y0 + 86))
        d.ellipse((x0 + 112, y0 + 190, x0 + 144, y0 + 222), outline=fg, width=4)
        _estrela(d, x0 + 128, y0 + 206, 11, fg, 5)
    return _tinta(img, None, 0.08, 91)


# ---------------------------------------------------------------- cartazes
def _molde(w, h, fundo, borda, semente, sujo=0.18, raio=18):
    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=fundo)
        d.rectangle((14 * ss, 14 * ss, (w - 14) * ss, (h - 14) * ss), outline=borda, width=6 * ss)
    return _super(w, h, fundo, fn)


def cartaz_dourada(w=700, h=1000):
    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=(248, 220, 120))
        d.rectangle((0, 0, w * ss, 330 * ss), fill=(205, 130, 20))
        d.rectangle((14 * ss, 14 * ss, (w - 14) * ss, (h - 14) * ss), outline=(120, 50, 10), width=7 * ss)
        _coroa(d, 350 * ss, 138 * ss, 78 * ss, (255, 236, 150))
        _copo_chope(d, 350 * ss, 760 * ss, 380 * ss)
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "DOURADA", 350, 285, 78, (255, 250, 220), 600, 1.6)
    _texto(im, "SEMPRE", 350, 880, 54, (120, 50, 10), 560, 1.8)
    _texto(im, "GELADA", 350, 950, 54, (120, 50, 10), 560, 1.8)
    return _tinta(im, None, 0.12, 101, 0.2)


def cartaz_serra_azul(w=700, h=1000):
    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=(24, 64, 150))
        d.polygon([(0, 560 * ss), (180 * ss, 340 * ss), (300 * ss, 470 * ss), (470 * ss, 260 * ss), (700 * ss, 600 * ss), (700 * ss, 1000 * ss), (0, 1000 * ss)], fill=(14, 40, 104))
        d.polygon([(470 * ss, 260 * ss), (410 * ss, 340 * ss), (450 * ss, 330 * ss), (480 * ss, 372 * ss), (520 * ss, 326 * ss), (545 * ss, 340 * ss)], fill=(240, 246, 255))
        d.rectangle((14 * ss, 14 * ss, (w - 14) * ss, (h - 14) * ss), outline=(255, 255, 255), width=6 * ss)
        _garrafa_desenho(d, 350 * ss, 900 * ss, 420 * ss, (30, 110, 60), ss=ss)
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "SERRA AZUL", 350, 150, 64, (255, 255, 255), 580, 1.6)
    _texto(im, "PILSEN", 350, 220, 60, (150, 214, 255), 460, 1.8)
    _texto(im, "GELADA DEMAIS", 350, 975, 40, (255, 255, 255), 520, 1.6)
    return _tinta(im, None, 0.1, 102, 0.15)


def cartaz_rainha(w=700, h=1000):
    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=(176, 28, 34))
        d.ellipse((90 * ss, 330 * ss, 610 * ss, 850 * ss), fill=(250, 232, 190), outline=(255, 214, 96), width=10 * ss)
        _coroa(d, 350 * ss, 590 * ss, 140 * ss, (176, 28, 34))
        _estrela(d, 350 * ss, 760 * ss, 40 * ss, (176, 28, 34))
        d.rectangle((14 * ss, 14 * ss, (w - 14) * ss, (h - 14) * ss), outline=(255, 214, 96), width=7 * ss)
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "RAINHA", 350, 190, 100, (255, 246, 220), 560, 1.6)
    _texto(im, "DO SUL", 350, 290, 84, (255, 214, 96), 440, 1.8)
    _texto(im, "A CERVEJA DA REALEZA", 350, 940, 32, (255, 246, 220), 600, 1.6)
    return _tinta(im, None, 0.1, 103, 0.2)


def cartaz_bemtevi(w=700, h=1000):
    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=(244, 206, 70))
        d.rectangle((14 * ss, 14 * ss, (w - 14) * ss, (h - 14) * ss), outline=(30, 90, 50), width=8 * ss)
        _passaro(d, 330 * ss, 460 * ss, 380 * ss, (50, 40, 30))
        d.line((40 * ss, 640 * ss, 660 * ss, 640 * ss), fill=(30, 90, 50), width=8 * ss)
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "BEM-TE-VI", 350, 170, 84, (30, 90, 50), 600, 1.6)
    _texto(im, "A PINGA DO POVO", 350, 720, 48, (60, 40, 20), 580, 1.6)
    _texto(im, "DOSE R$ 4", 350, 880, 80, (176, 30, 36), 560, 1.8)
    return _tinta(im, None, 0.12, 104, 0.22)


def cartaz_chopp(w=700, h=1000):
    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=(28, 28, 34))
        d.rectangle((14 * ss, 14 * ss, (w - 14) * ss, (h - 14) * ss), outline=(255, 120, 180), width=6 * ss)
        _copo_chope(d, 230 * ss, 800 * ss, 360 * ss)
        _copo_chope(d, 470 * ss, 800 * ss, 360 * ss, cor=(226, 150, 30))
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "CHOPP", 350, 190, 120, (250, 214, 90), 560, 1.6)
    _texto(im, "CREMOSO", 350, 300, 76, (255, 255, 255), 540, 1.8)
    _texto(im, "R$ 7", 350, 940, 100, (255, 120, 180), 400, 1.8)
    return _tinta(im, None, 0.1, 105, 0.18)


def cartaz_campeonato(w=700, h=1000):
    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=(20, 110, 60))
        d.rectangle((14 * ss, 14 * ss, (w - 14) * ss, (h - 14) * ss), outline=(255, 232, 120), width=7 * ss)
        for k, (cx, cy) in enumerate(((350, 440), (350, 640), (350, 840))):
            d.ellipse(((cx - 52) * ss, (cy - 52) * ss, (cx + 52) * ss, (cy + 52) * ss), fill=[(250, 210, 40), (30, 80, 200), (200, 36, 36)][k])
            d.ellipse(((cx - 20) * ss, (cy - 20) * ss, (cx + 20) * ss, (cy + 20) * ss), fill=(250, 250, 250))
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "CAMPEONATO", 350, 150, 78, (255, 232, 120), 600, 1.6)
    _texto(im, "DE SINUCA", 350, 250, 78, (255, 255, 255), 560, 1.6)
    _texto(im, "SABADO 20H", 350, 340, 46, (255, 232, 120), 560, 1.6)
    return _tinta(im, None, 0.12, 106, 0.2)


def cartaz_jogo(w=1000, h=700):
    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=(24, 24, 30))
        d.rectangle((14 * ss, 14 * ss, (w - 14) * ss, (h - 14) * ss), outline=(255, 214, 96), width=7 * ss)
        d.ellipse((90 * ss, 260 * ss, 330 * ss, 500 * ss), fill=(250, 250, 250), outline=(20, 20, 20), width=6 * ss)
        d.polygon([(210 * ss, 300 * ss), (270 * ss, 346 * ss), (248 * ss, 416 * ss), (172 * ss, 416 * ss), (150 * ss, 346 * ss)], fill=(20, 20, 20))
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "HOJE TEM JOGO", 640, 220, 100, (255, 214, 96), 620, 1.6)
    _texto(im, "TELAO E", 640, 360, 80, (255, 255, 255), 560, 1.8)
    _texto(im, "CERVEJA GELADA", 640, 470, 70, (255, 120, 180), 620, 1.6)
    _texto(im, "NAO ACEITAMOS FIADO", 520, 640, 38, (200, 200, 200), 820, 1.6)
    return _tinta(im, None, 0.1, 107, 0.18)


def sinal_fiado(w=1024, h=512):
    def fn(d, ss):
        d.rounded_rectangle((0, 0, w * ss, h * ss), 40 * ss, fill=(248, 206, 36))
        d.rounded_rectangle((20 * ss, 20 * ss, (w - 20) * ss, (h - 20) * ss), 28 * ss, outline=(28, 24, 22), width=10 * ss)
        for x in range(60, w - 40, 56):
            d.polygon([(x * ss, 30 * ss), ((x + 28) * ss, 30 * ss), ((x + 12) * ss, 52 * ss)], fill=(28, 24, 22))
            d.polygon([(x * ss, (h - 30) * ss), ((x + 28) * ss, (h - 30) * ss), ((x + 12) * ss, (h - 52) * ss)], fill=(28, 24, 22))
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "FIADO SO", 512, 240, 130, (28, 24, 22), 900, 1.6)
    _texto(im, "AMANHA", 512, 410, 130, (176, 30, 36), 760, 1.6)
    return _tinta(im, None, 0.12, 108, 0.25)


def sinal_ficha(w=700, h=350):
    def fn(d, ss):
        d.rounded_rectangle((0, 0, w * ss, h * ss), 28 * ss, fill=(24, 20, 28))
        d.rounded_rectangle((14 * ss, 14 * ss, (w - 14) * ss, (h - 14) * ss), 20 * ss, outline=(255, 56, 140), width=7 * ss)
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "FICHA DA SINUCA", 350, 150, 70, (255, 120, 180), 600, 1.6)
    _texto(im, "R$ 2", 350, 290, 110, (255, 214, 96), 300, 1.8)
    return _tinta(im, None, 0.1, 109, 0.15)


def cardapio(w=800, h=1100):
    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=(250, 242, 214))
        d.rectangle((16 * ss, 16 * ss, (w - 16) * ss, (h - 16) * ss), outline=(176, 30, 36), width=8 * ss)
        d.rectangle((16 * ss, 16 * ss, (w - 16) * ss, 190 * ss), fill=(176, 30, 36))
        for k in range(5):
            y = (360 + k * 140) * ss
            for x in range(60, w - 60, 22):
                d.ellipse(((x + 330) * ss, (y + 20) * ss, (x + 334) * ss, (y + 24) * ss), fill=(150, 130, 100)) if 330 + x < w - 220 else None
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "PORCOES", 400, 145, 96, (255, 240, 200), 600, 1.6)
    itens = [("TORRESMO", "R$ 25"), ("CALABRESA", "R$ 30"), ("FRANGO A PASSARINHO", "R$ 38"), ("PASTEL", "R$ 9"), ("COXINHA", "R$ 7")]
    for k, (n, p) in enumerate(itens):
        y = 340 + k * 150
        _texto(im, n, 60, y, 44, (60, 30, 20), 520, 1.6, ancora="esq")
        _texto(im, p, w - 60, y, 50, (176, 30, 36), 200, 1.6, ancora="dir")
    _texto(im, "FIADO SO AMANHA", 400, 1050, 36, (90, 60, 30), 600, 1.6)
    return _tinta(im, None, 0.12, 110, 0.3)


def calendario(w=640, h=900, ano=2026, mes=10):
    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=(250, 246, 232))
        d.rectangle((0, 0, w * ss, 430 * ss), fill=(88, 150, 170))
        d.polygon([(0, 430 * ss), (170 * ss, 230 * ss), (300 * ss, 360 * ss), (430 * ss, 170 * ss), (640 * ss, 430 * ss)], fill=(46, 96, 74))
        d.ellipse((470 * ss, 60 * ss, 560 * ss, 150 * ss), fill=(252, 226, 120))
        d.rectangle((0, 0, w * ss, 14 * ss), fill=(176, 30, 36))
        d.rectangle((0, 430 * ss, w * ss, 500 * ss), fill=(176, 30, 36))
        d.ellipse((290 * ss, -12 * ss, 350 * ss, 40 * ss), fill=(60, 60, 60))
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "MERCEARIA SAO BENTO", 320, 480, 30, (255, 246, 220), 560, 1.6)
    _texto(im, "OUTUBRO 2026", 320, 545, 40, (60, 30, 20), 520, 1.6)
    dias = "D S T Q Q S S".split()
    cal = calendar.Calendar(firstweekday=6)
    for i, nome in enumerate(dias):
        _texto(im, nome, 55 + i * 88, 600, 22, (176, 30, 36) if i == 0 else (60, 60, 60), 40, 1.0)
    d = ImageDraw.Draw(im)
    for r, sem in enumerate(cal.monthdayscalendar(ano, mes)):
        for i, dia in enumerate(sem):
            if dia:
                _texto(im, str(dia), 55 + i * 88, 660 + r * 62, 26, (176, 30, 36) if i == 0 else (40, 40, 40), 60, 1.0)
    d.ellipse((55 + 4 * 88 - 30, 660 + 3 * 62 - 36, 55 + 4 * 88 + 30, 660 + 3 * 62 + 20), outline=(176, 30, 36), width=4)
    return _tinta(im, None, 0.1, 111, 0.12)


FORMA_ESCUDO = [(70, 60), (530, 60), (530, 420), (300, 700), (70, 420)]   # o contorno do escudo no desenho de 600 x 760; abaixo de y 420 ele afina até a ponta (300, 700)
PAPEL_ESCUDO = (236, 230, 214)


def escudo_cru(w=600, h=760, ss=2):
    """O escudo do E.C. Beco, time inventado (verde-água, ouro e branco), antes do grão e do texto. Tudo o que é de dentro (listras, faixa dourada, bola, estrelas)
    é desenhado numa folha à parte e colado só onde a máscara da forma do escudo deixa: nada vaza para o papel. Devolve (imagem, máscara) em tamanho final."""
    P = [(x * ss, y * ss) for x, y in FORMA_ESCUDO]
    tam = (w * ss, h * ss)
    im = Image.new("RGB", tam, PAPEL_ESCUDO)
    dentro = Image.new("RGB", tam, (250, 244, 226))
    d = ImageDraw.Draw(dentro)
    for k in range(5):
        x0 = 84 + k * 86
        if k % 2 == 0:
            d.rectangle((x0 * ss, 74 * ss, (x0 + 43) * ss, 700 * ss), fill=(15, 139, 141))
    d.rectangle((84 * ss, 74 * ss, 516 * ss, 300 * ss), fill=(242, 177, 52))
    d.ellipse((220 * ss, 330 * ss, 380 * ss, 490 * ss), fill=(250, 250, 250), outline=(20, 30, 30), width=8 * ss)
    d.polygon([(300 * ss, 356 * ss), (344 * ss, 392 * ss), (328 * ss, 444 * ss), (272 * ss, 444 * ss), (256 * ss, 392 * ss)], fill=(20, 30, 30))
    for x in (180, 300, 420):
        _estrela(d, x * ss, 160 * ss, 34 * ss, (20, 70, 76), 5)
    mascara = Image.new("L", tam, 0)
    ImageDraw.Draw(mascara).polygon(P, fill=255)
    im.paste(dentro, (0, 0), mascara)
    ImageDraw.Draw(im).polygon(P, outline=(20, 70, 76), width=14 * ss)
    return im.resize((w, h), Image.LANCZOS), mascara.resize((w, h), Image.LANCZOS)


def escudo(w=600, h=760):
    """O escudo do E.C. Beco no papel; o nome e o ano também são recortados pela forma (por dentro do contorno)."""
    im, mascara = escudo_cru(w, h)
    interna = mascara.filter(ImageFilter.MinFilter(29))   # a forma menos a grossura do contorno: o texto não pisa nele
    com_texto = im.copy()
    _texto(com_texto, "E.C. BECO", 300, 262, 52, (20, 70, 76), 360, 1.6)
    _texto(com_texto, "1987", 300, 580, 56, (242, 177, 52), 220, 1.8)
    im = Image.composite(com_texto, im, interna)
    return _tinta(im, None, 0.08, 112, 0.1)


def bandeira_time(w=1000, h=640):
    def fn(d, ss):
        for k in range(7):
            d.rectangle((k * w // 7 * ss, 0, (k + 1) * w // 7 * ss, h * ss), fill=(15, 139, 141) if k % 2 == 0 else (250, 244, 226))
        d.ellipse((350 * ss, 140 * ss, 650 * ss, 440 * ss), fill=(242, 177, 52), outline=(20, 70, 76), width=14 * ss)
        _estrela(d, 500 * ss, 290 * ss, 100 * ss, (20, 70, 76), 5)
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "EC BECO", 500, 570, 80, (20, 70, 76), 700, 1.6)
    return _tinta(im, None, 0.12, 113, 0.3)


def geladeira_porta(w=700, h=1800):
    """A porta da geladeira branca de casa: esmalte envelhecido, duas portas, adesivos, ímãs, um bilhete, sujeira."""
    r = T.rng_de(114)

    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=(226, 228, 226))
        d.rectangle((0, 0, 6 * ss, h * ss), fill=(150, 154, 154))
        d.rectangle(((w - 6) * ss, 0, w * ss, h * ss), fill=(150, 154, 154))
        d.rectangle((0, 560 * ss, w * ss, 584 * ss), fill=(130, 134, 136))     # junta das portas
        d.rectangle((0, 0, w * ss, 8 * ss), fill=(150, 154, 154))
        d.rounded_rectangle((60 * ss, 80 * ss, 160 * ss, 420 * ss), 20 * ss, fill=(190, 194, 196))   # puxador
        d.ellipse((120 * ss, 900 * ss, 330 * ss, 1110 * ss), fill=(30, 100, 190), outline=(250, 250, 250), width=8 * ss)          # adesivo "gelada"
        d.polygon([(400 * ss, 640 * ss), (640 * ss, 640 * ss), (640 * ss, 760 * ss), (400 * ss, 760 * ss)], fill=(196, 34, 34))
        d.rectangle((410 * ss, 650 * ss, 630 * ss, 750 * ss), outline=(255, 232, 120), width=5 * ss)
        _estrela(d, 480 * ss, 1240 * ss, 70 * ss, (250, 210, 40), 5)
        d.ellipse((410 * ss, 1170 * ss, 560 * ss, 1320 * ss), outline=(250, 210, 40), width=6 * ss)
        d.rectangle((90 * ss, 1380 * ss, 330 * ss, 1450 * ss), fill=(20, 110, 60))
        d.rectangle((360 * ss, 1430 * ss, 640 * ss, 1500 * ss), fill=(242, 177, 52))
        d.rectangle((250 * ss, 1180 * ss, 340 * ss, 1290 * ss), fill=(250, 244, 226), outline=(120, 120, 120), width=3 * ss)     # bilhete
        for k in range(4):
            d.line((258 * ss, (1198 + k * 22) * ss, 332 * ss, (1198 + k * 22) * ss), fill=(60, 60, 130), width=3 * ss)
        for cx, cy, c in ((560, 1050, (214, 44, 52)), (610, 1090, (30, 90, 190)), (150, 620, (40, 150, 70)), (260, 700, (250, 210, 40))):
            d.ellipse(((cx - 24) * ss, (cy - 24) * ss, (cx + 24) * ss, (cy + 24) * ss), fill=c)      # imãs
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "GELADA", 225, 1032, 44, (255, 255, 255), 170, 1.6)
    _texto(im, "AQUI TEM", 520, 700, 26, (255, 232, 120), 200, 1.6)
    _texto(im, "PASTEL", 520, 738, 26, (255, 255, 255), 160, 1.6)
    _texto(im, "SABOR", 210, 1427, 24, (255, 255, 255), 200, 1.4)
    _texto(im, "MILHO", 500, 1480, 24, (60, 30, 10), 200, 1.4)
    a = np.asarray(im, np.float32) / 255.0
    ruido = T.ruido(h, w, 1.1, rng=r)
    a *= (0.93 + 0.1 * ruido)[:, :, None]
    base = T.lisstep(h * 0.78, h, np.arange(h, dtype=np.float32))[:, None] * np.ones((1, w), np.float32)
    a *= (1 - 0.45 * base * (0.5 + 0.5 * T.ruido(h, w, 1.6, rng=r)))[:, :, None]
    ferrugem = T.lisstep(0.7, 0.9, T.ruido(h, w, 2.4, rng=r)) * T.lisstep(h * 0.85, h, np.arange(h, dtype=np.float32))[:, None]
    a = a * (1 - 0.7 * ferrugem)[:, :, None] + T.cor(150, 80, 40)[None, None, :] * (0.55 * ferrugem)[:, :, None]
    mancha = T.lisstep(0.8, 0.95, T.ruido(h, w, 2.0, rng=r))
    a *= (1 - 0.15 * mancha)[:, :, None] * T.tinte(1.0, 0.97, 0.9)[None, None, :]
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))


# ---------------------------------------------------------------- telas acesas
def tv_tela(w=640, h=480):
    """A TV de tubo passando um jogo (times inventados): campo, linhas, jogadores, placar, chuvisco leve."""
    r = T.rng_de(115)
    im = Image.new("RGB", (w, h), (20, 110, 40))
    d = ImageDraw.Draw(im)
    for k in range(10):
        d.rectangle((0, k * h // 10, w, (k + 1) * h // 10), fill=(26, 124, 48) if k % 2 == 0 else (22, 108, 42))
    d.rectangle((40, 70, w - 40, h - 90), outline=(236, 240, 236), width=3)
    d.line((w // 2, 70, w // 2, h - 90), fill=(236, 240, 236), width=3)
    d.ellipse((w // 2 - 54, (h - 20) // 2 - 54, w // 2 + 54, (h - 20) // 2 + 54), outline=(236, 240, 236), width=3)
    d.rectangle((40, 170, 120, h - 190), outline=(236, 240, 236), width=3)
    d.rectangle((w - 120, 170, w - 40, h - 190), outline=(236, 240, 236), width=3)
    for k in range(11):
        x, y = 70 + r.integers(0, w - 140), 100 + r.integers(0, h - 210)
        c = (250, 210, 40) if k < 5 else ((20, 110, 200) if k < 10 else (250, 250, 250))
        d.ellipse((x - 7, y - 7, x + 7, y + 7), fill=c)
        d.rectangle((x - 3, y + 6, x + 3, y + 18), fill=c)
    d.ellipse((w // 2 + 30, h // 2 - 30, w // 2 + 40, h // 2 - 20), fill=(250, 250, 250))
    d.rectangle((16, 14, 330, 56), fill=(10, 14, 40))
    _texto(im, "BECO 2 X 1 VIZ", 24, 46, 28, (250, 240, 120), 300, 1.4, ancora="esq")
    d.rectangle((w - 140, 14, w - 16, 56), fill=(176, 30, 36))
    _texto(im, "67 MIN", w - 78, 46, 26, (255, 255, 255), 112, 1.4)
    a = np.asarray(im, np.float32) / 255.0
    linhas = 0.9 + 0.1 * (np.arange(h) % 3 == 0)[:, None]
    a = a * linhas[:, :, None] + 0.04 * r.normal(size=a.shape).astype(np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    vin = 1 - 0.45 * np.clip(((xx / w - 0.5) * 2) ** 2 + ((yy / h - 0.5) * 2) ** 2 - 0.35, 0, 1)
    a *= vin[:, :, None]
    a = T.borrar(a, 0.6)
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))


def vitrine(w=512, h=1280):
    """Dentro da cervejeira vertical: prateleiras de garrafas e latas contra a luz fria; é a textura emissiva da porta de vidro."""
    r = T.rng_de(116)
    im = Image.new("RGB", (w, h), (176, 214, 236))
    d = ImageDraw.Draw(im)
    n = 6
    for k in range(n):
        y1 = int((k + 1) * h / n) - 14
        y0 = int(k * h / n) + 16
        d.rectangle((0, y1, w, y1 + 10), fill=(120, 160, 184))
        x = 24
        while x < w - 30:
            tipo = r.integers(0, 3)
            if tipo == 0:
                _garrafa_desenho(d, x + 18, y1, min(y1 - y0 - 4, 200), (96, 52, 18))
                x += 42
            elif tipo == 1:
                c = [(196, 34, 34), (30, 80, 170), (230, 190, 40), (30, 130, 70)][int(r.integers(0, 4))]
                d.rounded_rectangle((x, y1 - 96, x + 36, y1), 6, fill=c)
                d.rectangle((x + 4, y1 - 62, x + 32, y1 - 40), fill=(245, 245, 240))
                x += 42
            else:
                d.rounded_rectangle((x, y1 - 150, x + 34, y1), 8, fill=(224, 226, 230))
                d.rectangle((x, y1 - 104, x + 34, y1 - 64), fill=(176, 30, 36))
                x += 40
    a = np.asarray(im, np.float32) / 255.0
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    a = a * (0.8 + 0.25 * (1 - yy))
    a = T.borrar(a, 0.8)
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))


def logo_mesa(w=512, h=512):
    """Selo do plástico "Dourada": círculo vermelho num fundo branco-plástico (o mesmo tom do móvel, a emenda não aparece)."""
    def fn(d, ss):
        d.rectangle((0, 0, w * ss, h * ss), fill=(209, 209, 199))
        d.ellipse((60 * ss, 60 * ss, 452 * ss, 452 * ss), fill=(176, 30, 36))
        d.ellipse((84 * ss, 84 * ss, 428 * ss, 428 * ss), outline=(255, 236, 190), width=8 * ss)
        _coroa(d, 256 * ss, 190 * ss, 60 * ss, (255, 220, 120))
    im = _super(w, h, (0, 0, 0), fn)
    _texto(im, "DOURADA", 256, 310, 54, (255, 246, 220), 300, 1.4)
    _texto(im, "BEBIDAS", 256, 380, 34, (255, 220, 120), 260, 1.4)
    return _tinta(im, None, 0.05, 117, 0.0)


def anel_de_copo(w=2048, h=352):
    """Marcas de copo e de garrafa suada (RGBA): anéis escuros de bordas irregulares, para o tampo do balcão (4,1 x 0,69 m)."""
    r = T.rng_de(118)
    a = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    gasto = 0.5 + 0.5 * T.ruido(h, w, 1.4, rng=r)
    for _ in range(40):
        cx, cy, rad = r.uniform(40, w - 40), r.uniform(40, h - 40), r.uniform(18, 28)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        anel = T.lisstep(3.2, 0.0, np.abs(d - rad)) * (0.5 + 0.5 * gasto)
        if r.random() < 0.4:
            anel = np.maximum(anel, T.lisstep(1.0, 0.0, np.abs(d - rad * 0.55)) * 0.6)
        a = np.maximum(a, anel * r.uniform(0.4, 1.0))
    a = T.borrar(a, 0.7)
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = 30, 14, 6
    rgba[..., 3] = (np.clip(a * 0.7, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def trinca(w=512, h=512):
    """Uma trinca em azulejo (RGBA): linhas finas e escuras que se ramificam."""
    r = T.rng_de(119)
    im = Image.new("L", (w * 2, h * 2), 0)
    d = ImageDraw.Draw(im)

    def ramo(x, y, ang, n, larg):
        for _ in range(n):
            ang += r.normal(0, 0.35)
            nx, ny = x + math.cos(ang) * r.uniform(14, 36), y + math.sin(ang) * r.uniform(14, 36)
            d.line((x, y, nx, ny), fill=255, width=max(1, int(larg)))
            if r.random() < 0.18 and larg > 1.4:
                ramo(nx, ny, ang + r.choice((-1, 1)) * r.uniform(0.5, 1.1), n // 2, larg * 0.6)
            x, y = nx, ny
    ramo(w * 0.45, h * 0.1, math.pi / 2 + 0.2, 28, 4)
    a = np.asarray(im.resize((w, h), Image.LANCZOS), np.float32) / 255.0
    a = T.borrar(a, 0.6)
    rgba = np.zeros((h, w, 4), np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = 40, 34, 28
    rgba[..., 3] = (np.clip(a * 1.1, 0, 1) * 220).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


# ---------------------------------------------------------------- ladrilho hidráulico (o piso)
def ladrilho(ntiles=4, px=256, semente=77):
    """Cartela sem emenda de `ntiles` x `ntiles` ladrilhos hidráulicos de 20 cm (cada um com `px` pixels): duas estampas alternadas (flor e losango) em creme, terracota,
    verde-petróleo e ocre, com junta de argamassa suja, lascas nos cantos, desgaste no miolo e variação de tom ladrilho a ladrilho. Desenhado por fórmula, sem arte de terceiros."""
    r = np.random.default_rng(semente)
    ss = 2
    n = ntiles * px * ss
    cel = px * ss
    creme, terra, verde, ocre, escuro, junta = (np.array(c, np.float32) / 255.0 for c in ((196, 172, 128), (160, 62, 40), (26, 84, 86), (190, 140, 56), (30, 24, 20), (86, 78, 68)))
    img = np.zeros((n, n, 3), np.float32)
    yy, xx = np.mgrid[0:cel, 0:cel].astype(np.float32)
    u0 = (xx + 0.5) / cel * 2 - 1
    v0 = (yy + 0.5) / cel * 2 - 1
    for j in range(ntiles):
        for i in range(ntiles):
            k = int(r.integers(0, 4))
            u, v = u0, v0
            for _ in range(k):   # gira de 90 em 90 graus
                u, v = -v, u
            au, av = np.abs(u), np.abs(v)
            c = np.tile(creme, (cel, cel, 1)).astype(np.float32)

            def pinta(m, cor):
                c[m] = cor

            if (i + j) % 2 == 0:   # flor: quartos de círculo verdes nos cantos, quatro pétalas terracota, miolo ocre
                d_canto = np.hypot(au - 1.0, av - 1.0)
                pinta(d_canto < 0.62, verde)
                pinta(d_canto < 0.44, creme)
                pinta(d_canto < 0.22, verde)
                for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    pinta(np.hypot(u - 0.36 * sx, v - 0.36 * sy) < 0.3, terra)
                pinta(np.hypot(u, v) < 0.2, ocre)
                pinta(np.hypot(u, v) < 0.07, escuro)
            else:                   # losango: faixa verde, estrela terracota, pontas ocre
                d = au + av
                pinta(d < 0.82, verde)
                pinta(d < 0.64, creme)
                pinta(np.sqrt(au) + np.sqrt(av) < 0.78, terra)
                pinta(np.maximum(au, av) < 0.1, ocre)
                pinta(np.hypot(au - 0.97, av - 0.97) < 0.2, ocre)
                pinta(np.hypot(au - 0.97, av - 0.97) < 0.09, terra)
            m = np.maximum(au, av)
            pinta((m > 0.84) & (m < 0.9), terra)           # filete
            pinta((m > 0.9) & (m < 0.935), escuro)
            # variação de tom por ladrilho e grão
            c *= (1.0 + r.normal(0, 0.035))
            c *= (1.0 + 0.04 * (T.ruido(cel, cel, 3.0, rng=r) - 0.5))[:, :, None]
            # desgaste no miolo: clareia e desbota onde o povo pisa
            gasto = T.lisstep(0.45, 0.8, T.ruido(cel, cel, 1.6, rng=r)) * T.lisstep(1.05, 0.2, np.hypot(u, v)) * r.uniform(0.2, 0.55)
            cinza = c.mean(axis=2, keepdims=True) * np.array([1.12, 1.08, 1.0], np.float32)
            c = c * (1 - gasto[:, :, None]) + cinza * gasto[:, :, None]
            # lascas nos cantos
            for _ in range(int(r.integers(0, 4))):
                cx, cy = r.choice((-1, 1)) * r.uniform(0.82, 1.0), r.choice((-1, 1)) * r.uniform(0.82, 1.0)
                raio = r.uniform(0.04, 0.12)
                lasca = (np.hypot(u - cx, v - cy) < raio * (0.7 + 0.6 * T.ruido(cel, cel, 12.0, rng=r)))
                c[lasca] = junta * 1.15
            # junta e borda escura do ladrilho
            g = m > 0.955
            c[g] = junta * (0.8 + 0.4 * T.ruido(cel, cel, 8.0, rng=r))[g][:, None]
            img[j * cel:(j + 1) * cel, i * cel:(i + 1) * cel] = c
    # sujeira geral e riscos
    sujo = T.lisstep(0.55, 0.9, T.ruido(n, n, 5.0, rng=r)) * 0.22
    img = img * (1 - sujo)[:, :, None] * np.array([1.0, 0.96, 0.88], np.float32)
    img = np.clip(img, 0, 1)
    im = Image.fromarray((img * 255 + 0.5).astype(np.uint8)).resize((ntiles * px, ntiles * px), Image.LANCZOS)
    return im


# ---------------------------------------------------------------- prateleira de garrafas desenhada (o nível baixo)
def prateleira_garrafas(w=1536, h=448, semente=5):
    """O fundo do balcão visto de frente (3 prateleiras, ~30 garrafas, latas e PETs; marcas inventadas), já escurecido como o salão à noite: serve de quadro no nível baixo,
    que não tem malha de garrafa. 3,6 m x 1,05 m (z de +0,6 a -3,0; y de 0,30 a 1,35)."""
    r = np.random.default_rng(semente)
    k = 2
    W, H = w * k, h * k
    img = Image.new("RGB", (W, H), (30, 20, 14))
    d = ImageDraw.Draw(img)
    ppm = W / 3.6
    ys = (0.35, 0.72, 1.09)
    y_top = 1.35
    # fundo de madeira escura com um degradê quente no alto
    for y in range(H):
        t = y / H
        d.line((0, y, W, y), fill=(int(52 - 18 * t), int(34 - 12 * t), int(22 - 8 * t)))
    vidros = {"ambar": (122, 58, 14), "verde": (22, 88, 44), "claro": (150, 176, 168), "vinho": (46, 14, 24), "pet": (140, 170, 150)}
    rotulos = [(228, 216, 186), (176, 44, 34), (222, 182, 54), (42, 76, 142), (210, 210, 200), (30, 110, 70)]
    def garrafa(cx, base, alt, larg, vidro, rot, tipo):
        cor = vidros[vidro]
        xl, xr = cx - larg / 2, cx + larg / 2
        topo_corpo = base - alt * (0.58 if tipo != "litrao" else 0.62)
        pescoco = larg * (0.2 if tipo != "pet" else 0.26)
        d.rounded_rectangle((xl, topo_corpo, xr, base), radius=larg * 0.22, fill=cor)
        d.polygon([(xl + larg * 0.04, topo_corpo + larg * 0.18), (cx - pescoco, base - alt * 0.9), (cx + pescoco, base - alt * 0.9), (xr - larg * 0.04, topo_corpo + larg * 0.18)], fill=cor)
        d.rectangle((cx - pescoco, base - alt, cx + pescoco, base - alt * 0.88), fill=tuple(int(c * 0.9) for c in cor))
        d.rectangle((cx - pescoco * 1.1, base - alt * 1.02, cx + pescoco * 1.1, base - alt * 0.95), fill=(188, 142, 36) if vidro != "pet" else (200, 60, 40))
        ly0, ly1 = base - alt * 0.5, base - alt * 0.2
        d.rectangle((xl + 1, ly0, xr - 1, ly1), fill=rot)
        for i in range(2):   # "texto" do rótulo: dois riscos
            yy = ly0 + (ly1 - ly0) * (0.3 + 0.35 * i)
            d.rectangle((xl + larg * 0.18, yy, xr - larg * 0.18, yy + max(2, larg * 0.045)), fill=tuple(int(c * 0.35) for c in rot))
        d.rectangle((xl + larg * 0.14, topo_corpo + larg * 0.1, xl + larg * 0.26, base - 3), fill=tuple(min(255, int(c * 1.35 + 18)) for c in cor))   # reflexo
        d.rectangle((xr - larg * 0.1, topo_corpo, xr, base), fill=tuple(int(c * 0.55) for c in cor))                                            # sombra
    def lata(cx, base, alt, larg, rot):
        d.rounded_rectangle((cx - larg / 2, base - alt, cx + larg / 2, base), radius=larg * 0.12, fill=rot)
        d.rectangle((cx - larg / 2, base - alt * 0.64, cx + larg / 2, base - alt * 0.3), fill=(236, 230, 214))
        d.rectangle((cx - larg / 2, base - alt, cx + larg / 2, base - alt * 0.94), fill=(180, 184, 188))
    for fila, y in enumerate(ys):
        base = (y_top - y) * ppm
        d.rectangle((0, base, W, base + 0.03 * ppm), fill=(112, 76, 42))      # a tábua
        d.rectangle((0, base + 0.03 * ppm, W, base + 0.045 * ppm), fill=(38, 24, 14))
        x = 0.12 * ppm
        while x < W - 0.12 * ppm:
            if r.random() < 0.08:
                x += 0.1 * ppm
                continue
            if fila == 0 and r.random() < 0.15:
                for j in range(2):
                    lata(x + j * 0.068 * ppm, base, 0.115 * ppm, 0.062 * ppm, tuple(int(c) for c in rotulos[int(r.integers(0, len(rotulos)))]))
                x += 0.15 * ppm
                continue
            tipo = r.choice(["cerveja", "cachaca", "pinga", "vinho", "litrao", "licor", "pet"])
            vidro = {"cerveja": "ambar", "cachaca": "claro", "pinga": "claro", "vinho": "vinho", "litrao": "ambar", "licor": "verde", "pet": "pet"}[tipo]
            alt = {"cerveja": 0.26, "cachaca": 0.3, "pinga": 0.27, "vinho": 0.33, "litrao": 0.34, "licor": 0.29, "pet": 0.31}[tipo] * ppm * r.uniform(0.95, 1.05)
            larg = {"cerveja": 0.062, "cachaca": 0.07, "pinga": 0.066, "vinho": 0.076, "litrao": 0.085, "licor": 0.07, "pet": 0.085}[tipo] * ppm
            garrafa(x, base, alt, larg, vidro, rotulos[int(r.integers(0, len(rotulos)))], tipo)
            x += larg + r.uniform(0.012, 0.035) * ppm
    # luz: um degradê quente no alto (a luminária) e a escuridão do fundo; grão
    a = np.asarray(img, np.float32) / 255.0
    yy = np.linspace(0, 1, H)[:, None, None]
    xx = np.linspace(0, 1, W)[None, :, None]
    a = a * (0.62 + 0.32 * (1 - yy)) * (0.78 + 0.25 * np.sin(np.pi * xx))
    a = a * np.array([1.06, 0.98, 0.86], np.float32)
    a = np.clip(a, 0, 1)
    return Image.fromarray((a * 255 + 0.5).astype(np.uint8)).resize((w, h), Image.LANCZOS)


# ---------------------------------------------------------------- saída
SINAIS = {  # arquivo -> função (para os níveis; o tamanho final é reduzido por nível em `gerar`)
    "cartaz-dourada": cartaz_dourada, "cartaz-serra-azul": cartaz_serra_azul, "cartaz-rainha": cartaz_rainha, "cartaz-bemtevi": cartaz_bemtevi,
    "cartaz-chopp": cartaz_chopp, "cartaz-campeonato": cartaz_campeonato, "cartaz-jogo": cartaz_jogo, "sinal-fiado": sinal_fiado, "sinal-ficha": sinal_ficha,
    "cardapio": cardapio, "calendario": calendario, "escudo": escudo, "bandeira-time": bandeira_time, "geladeira-porta": geladeira_porta, "logo-mesa": logo_mesa,
}


def gerar(pasta, fator_por_nivel):
    """Grava os sinais em `<pasta>/sinais/` (um tamanho só: o bake reamostra) e as telas acesas e rótulos em cada nível."""
    os.makedirs(os.path.join(pasta, "sinais"), exist_ok=True)
    import sinais_p6
    papeis = ("cartaz-dourada", "cartaz-serra-azul", "cartaz-rainha", "cartaz-bemtevi", "cartaz-chopp", "cartaz-campeonato", "cartaz-jogo", "cardapio", "calendario")
    for i, (nome, fn) in enumerate(SINAIS.items()):
        im = fn()
        if nome in papeis:
            im = sinais_p6.papel_cartaz(im, 700 + i, fita=(nome != "cardapio"), desbotar=0.12 + 0.03 * (i % 4))
        elif nome in ("sinal-fiado", "sinal-ficha"):
            im = sinais_p6.chapa_esmaltada(im, 800 + i)
        im.save(os.path.join(pasta, "sinais", nome + ".jpg"), quality=93, subsampling=0)
    ladrilho().save(os.path.join(pasta, "sinais", "ladrilho.jpg"), quality=93, subsampling=0)
    os.makedirs(os.path.join(pasta, "baixo"), exist_ok=True)
    prateleira_garrafas().save(os.path.join(pasta, "baixo", "prateleira.jpg"), quality=88, optimize=True)
    anel_de_copo().save(os.path.join(pasta, "sinais", "aneis-de-copo.png"), optimize=True)
    trinca().save(os.path.join(pasta, "sinais", "trinca.png"), optimize=True)
    import sinais_p6
    sinais_p6.gerar(pasta)
    base = {"tv-tela": tv_tela(), "vitrine": vitrine()}
    for nivel, f in fator_por_nivel.items():
        for nome, im in base.items():
            tam = (max(64, int(im.size[0] * max(f, 0.5))), max(64, int(im.size[1] * max(f, 0.5))))
            os.makedirs(os.path.join(pasta, nivel), exist_ok=True)
            im.resize(tam, Image.LANCZOS).save(os.path.join(pasta, nivel, nome + ".jpg"), quality=88, optimize=True)
        sinais_p6.rotulos_p6({"alto": 1536, "medio": 1024, "baixo": 512}[nivel]).save(os.path.join(pasta, nivel, "rotulos.jpg"), quality=90, optimize=True, subsampling=0)
