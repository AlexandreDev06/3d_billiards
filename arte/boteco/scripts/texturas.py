"""Texturas do boteco, todas feitas aqui (numpy + Pillow), sem nenhuma foto nem asset de terceiros.

`uv run --with numpy --with pillow python3 texturas.py [saida]` grava `texturas/<nivel>/` (alto, medio, baixo): JPEG para cor, PNG para o halo
do néon. Os ladrilhos (azulejo, reboco, piso, madeira, forro) são periódicos (ruído por FFT), então repetem sem emenda.
O que tem texto (quadro de giz, cartazes, rótulos) usa a fonte de traço de `letras.py`, também nossa.
"""
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
import letras
import marca


def rng_de(semente):
    return np.random.default_rng(semente)


def ruido(h, w, beta=2.0, aniso=(1.0, 1.0), rng=None, semente=1):
    """Ruído periódico 0..1 (média 0,5): espectro 1/f^beta; `aniso` = (ay, ax) estica a estrutura ao longo do eixo de menor valor."""
    rng = rng or rng_de(semente)
    ky = np.fft.fftfreq(h)[:, None] * aniso[0] * h / 64
    kx = np.fft.fftfreq(w)[None, :] * aniso[1] * w / 64
    k = np.sqrt(kx ** 2 + ky ** 2)
    k[0, 0] = 1.0
    esp = (rng.normal(size=(h, w)) + 1j * rng.normal(size=(h, w))) / k ** beta
    esp[0, 0] = 0
    r = np.fft.ifft2(esp).real
    r = (r - r.mean()) / (r.std() + 1e-9)
    return np.clip(0.5 + 0.2 * r, 0, 1)


def borrar(a, raio):
    if a.ndim == 3:
        return np.dstack([borrar(a[:, :, i], raio) for i in range(a.shape[2])])
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.filter(ImageFilter.GaussianBlur(float(raio))), dtype=np.float32) / 255.0


def lisstep(a, b, x):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def cor(r, g, b):
    return np.array([r, g, b], np.float32) / 255.0


def tinte(r, g, b):
    """Fator de cor (já em 0..1), para multiplicar."""
    return np.array([r, g, b], np.float32)


def normal_de(altura, forca=2.0):
    """Mapa de normais (convenção glTF/OpenGL: +Y para cima) de um mapa de alturas periódico."""
    dx = (np.roll(altura, -1, 1) - np.roll(altura, 1, 1)) * 0.5 * forca
    dy = (np.roll(altura, -1, 0) - np.roll(altura, 1, 0)) * 0.5 * forca
    n = np.dstack([-dx, dy, np.ones_like(dx)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


# ---------------------------------------------------------------- azulejo
def azulejo(n=1024, ladrilhos=4):
    r = rng_de(11)
    t = n // ladrilhos
    yy, xx = np.mgrid[0:n, 0:n]
    ix, iy = xx % t, yy % t
    d = np.minimum(np.minimum(ix, t - 1 - ix), np.minimum(iy, t - 1 - iy)).astype(np.float32)
    junta_l = 4.0 * n / 1024
    junta = d < junta_l
    tom = r.normal(0, 0.012, (ladrilhos, ladrilhos))[yy // t, xx // t]
    base = cor(240, 238, 226)[None, None, :] + tom[:, :, None]
    face = base * (1 - 0.1 * np.exp(-(d - junta_l) / (9.0 * n / 1024)))[:, :, None]
    face *= (0.97 + 0.06 * ruido(n, n, 2.2, rng=r))[:, :, None]
    # esmalte craquelado: veias finas
    veia = ruido(n, n, 2.6, rng=r)
    trinca = lisstep(0.006, 0.0, np.abs(veia - 0.5)) * 0.16
    face *= (1 - trinca)[:, :, None]
    sujo = lisstep(0.62, 0.9, ruido(n, n, 2.6, rng=r))
    face = face * (1 - 0.08 * sujo)[:, :, None] * tinte(1.0, 0.985, 0.94)[None, None, :]
    rejunte = cor(146, 142, 132)[None, None, :] * (0.82 + 0.3 * ruido(n, n, 1.0, rng=r))[:, :, None]
    sujo_j = lisstep(0.5, 0.8, ruido(n, n, 2.0, rng=r))
    rejunte = rejunte * (1 - 0.4 * sujo_j)[:, :, None]
    img = np.where(junta[:, :, None], rejunte, face)
    alt = np.where(junta, 0.0, 1.0) * lisstep(0, 7.0 * n / 1024, d - junta_l + 0.5) * 0.9 + 0.1 + 0.03 * ruido(n, n, 1.6, rng=r)
    alt = np.where(junta, 0.0, alt)
    alt = borrar(alt, 1.0)
    return np.clip(img, 0, 1), normal_de(alt, 6.0)


def barrado(w=1024, h=128):
    """Faixa decorativa de 15 cm: ladrilho azul e branco com flor de quatro pétalas, repete a cada `h` px."""
    r = rng_de(12)
    ss = 4
    im = Image.new("RGB", (w * ss, h * ss), (238, 233, 216))
    d = ImageDraw.Draw(im)
    azul, ouro = (36, 78, 150), (230, 170, 40)
    for i in range(w // h):
        ox = i * h * ss
        c = (ox + h * ss / 2, h * ss / 2)
        R = h * ss * 0.34
        for ang in (0, 90, 180, 270):
            a = math.radians(ang)
            px, py = c[0] + math.cos(a) * R * 0.48, c[1] + math.sin(a) * R * 0.48
            d.ellipse((px - R * 0.44, py - R * 0.44, px + R * 0.44, py + R * 0.44), fill=azul)
        d.ellipse((c[0] - R * 0.26, c[1] - R * 0.26, c[0] + R * 0.26, c[1] + R * 0.26), fill=ouro)
        for ang in (45, 135, 225, 315):
            a = math.radians(ang)
            px, py = c[0] + math.cos(a) * R * 1.12, c[1] + math.sin(a) * R * 1.12
            d.ellipse((px - R * 0.12, py - R * 0.12, px + R * 0.12, py + R * 0.12), fill=azul)
        d.rectangle((ox, 0, ox + 5 * ss, h * ss), fill=(150, 146, 136))
    d.rectangle((0, 0, w * ss, 4 * ss), fill=(150, 146, 136))
    d.rectangle((0, h * ss - 4 * ss, w * ss, h * ss), fill=(150, 146, 136))
    a = np.asarray(im.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255.0
    a *= (0.95 + 0.08 * ruido(h, w, 2.0, rng=r))[:, :, None]
    return np.clip(a, 0, 1)


# ---------------------------------------------------------------- reboco
def reboco(n=1024):
    r = rng_de(21)
    base = cor(104, 148, 128)
    grao = ruido(n, n, 0.9, rng=r)
    medio = ruido(n, n, 2.2, rng=r)
    grande = ruido(n, n, 3.0, rng=r)
    tom = 0.9 + 0.16 * (medio - 0.5) * 2 + 0.2 * (grande - 0.5)
    img = base[None, None, :] * tom[:, :, None] * (0.94 + 0.12 * grao)[:, :, None]
    # mofo e umidade: manchas escuras esverdeadas, mais verticais
    umido = lisstep(0.58, 0.9, ruido(n, n, 2.4, aniso=(0.35, 1.4), rng=r))
    img = img * (1 - 0.22 * umido)[:, :, None] * tinte(0.96, 1.0, 0.95)[None, None, :]
    # tinta soltando: o reboco claro por baixo
    lasca = lisstep(0.885, 0.91, ruido(n, n, 1.1, rng=r) + 0.25 * (grao - 0.5)) * 0.75
    reboco_nu = cor(168, 166, 146)[None, None, :] * (0.85 + 0.3 * grao)[:, :, None]
    img = img * (1 - lasca)[:, :, None] + reboco_nu * lasca[:, :, None]
    veia = ruido(n, n, 1.3, rng=r)
    img *= (1 - 0.38 * lisstep(0.01, 0.0, np.abs(veia - 0.5)))[:, :, None]
    alt = 0.5 * grao + 0.3 * medio - 0.5 * lasca
    return np.clip(img, 0, 1), normal_de(borrar(alt, 0.6), 5.0)


# ---------------------------------------------------------------- piso
def piso(n=1024, ladrilhos=4):
    r = rng_de(31)
    t = n // ladrilhos
    ss = 4
    S = t * ss
    cre, verm, esc = (190, 170, 132), (128, 58, 42), (44, 38, 36)

    def ladrilho(inverso):
        im = Image.new("RGB", (S, S), verm if inverso else cre)
        d = ImageDraw.Draw(im)
        fundo, fig = (verm, cre) if inverso else (cre, verm)
        c = S / 2
        d.polygon([(c, S * .08), (S * .92, c), (c, S * .92), (S * .08, c)], fill=fig)
        d.polygon([(c, S * .2), (S * .8, c), (c, S * .8), (S * .2, c)], fill=fundo)
        d.polygon([(c, S * .3), (S * .7, c), (c, S * .7), (S * .3, c)], fill=esc if not inverso else (210, 170, 70))
        for (cx, cy) in ((0, 0), (S, 0), (0, S), (S, S)):
            d.pieslice((cx - S * .24, cy - S * .24, cx + S * .24, cy + S * .24), 0, 360, fill=esc if not inverso else fig)
        d.rectangle((S * .035, S * .035, S * .965, S * .965), outline=esc, width=int(S * .02))
        return np.asarray(im.resize((t, t), Image.LANCZOS), dtype=np.float32) / 255.0
    A, B = ladrilho(False), ladrilho(True)
    img = np.zeros((n, n, 3), np.float32)
    for i in range(ladrilhos):
        for j in range(ladrilhos):
            img[j * t:(j + 1) * t, i * t:(i + 1) * t] = A if (i + j) % 2 == 0 else B
    yy, xx = np.mgrid[0:n, 0:n]
    ix, iy = xx % t, yy % t
    d = np.minimum(np.minimum(ix, t - 1 - ix), np.minimum(iy, t - 1 - iy)).astype(np.float32)
    junta = d < 2.5 * n / 1024
    uso = lisstep(0.4, 0.75, ruido(n, n, 2.4, rng=r))
    img = img * (1 - 0.45 * uso)[:, :, None]
    img *= (0.78 + 0.22 * ruido(n, n, 1.0, rng=r))[:, :, None]
    rej = cor(92, 88, 80)[None, None, :] * (0.8 + 0.4 * ruido(n, n, 1.2, rng=r))[:, :, None]
    img = np.where(junta[:, :, None], rej, img)
    arranhao = lisstep(0.015, 0.0, np.abs(ruido(n, n, 1.2, rng=r) - 0.5)) * 0.25
    img *= (1 - arranhao)[:, :, None]
    alt = np.where(junta, 0.0, 1.0) * 0.8 + 0.1 * ruido(n, n, 1.5, rng=r)
    return np.clip(img, 0, 1), normal_de(borrar(alt, 1.0), 4.0)


# ---------------------------------------------------------------- madeira
def madeira(n=1024, tabuas=8, base=((92, 54, 30), (150, 94, 54)), semente=41):
    r = rng_de(semente)
    h = n // tabuas
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    fibra = ruido(n, n, 1.6, aniso=(5.0, 0.35), rng=r)
    fibra2 = ruido(n, n, 2.6, aniso=(3.0, 0.5), rng=r)
    # a cada tábua um tom; as emendas de topo caem em x diferentes
    tom_t = r.uniform(0, 1, tabuas)
    linha = (yy // h).astype(int)
    tom = tom_t[linha]
    emenda_x = r.integers(0, n, tabuas)
    lado = ((xx.astype(int) - emenda_x[linha]) % n) < (n // 2)
    tom = np.clip(tom + np.where(lado, 0.0, r.uniform(-0.25, 0.25, tabuas)[linha]), 0, 1)
    a, b = cor(*base[0]), cor(*base[1])
    corpo = a[None, None, :] * (1 - tom)[:, :, None] + b[None, None, :] * tom[:, :, None]
    veio = 0.5 + 0.5 * np.sin(2 * math.pi * ((yy % h) / h * 7.0 + 5.5 * fibra + 2.2 * fibra2))
    corpo = corpo * (0.9 + 0.14 * veio + 0.35 * (fibra - 0.5) + 0.12 * (fibra2 - 0.5))[:, :, None]
    sulco = (yy % h) < 3.0 * n / 1024
    sulco |= (((xx.astype(int) - emenda_x[linha]) % n) < 2.0 * n / 1024)
    corpo = np.where(sulco[:, :, None], cor(22, 12, 8)[None, None, :], corpo)
    # verniz gasto: brilho que varia
    gasto = lisstep(0.5, 0.85, ruido(n, n, 2.4, rng=r))
    corpo = corpo * (1 + 0.12 * gasto)[:, :, None]
    return np.clip(corpo, 0, 1)


def forro(n=512):
    r = rng_de(51)
    ripas = 8
    w = n // ripas
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    ix = xx % w
    base = cor(222, 214, 196)
    fibra = ruido(n, n, 1.5, aniso=(0.3, 5.0), rng=r)
    img = base[None, None, :] * (0.9 + 0.14 * fibra)[:, :, None]
    fumaca = lisstep(0.5, 0.9, ruido(n, n, 2.5, rng=r))
    img = img * (1 - 0.14 * fumaca)[:, :, None] * tinte(1.0, 0.97, 0.9)[None, None, :]
    sulco = (ix < 2.0 * n / 512) | (ix > w - 2.0 * n / 512)
    img = np.where(sulco[:, :, None], cor(88, 70, 50)[None, None, :], img)
    mancha = lisstep(0.72, 0.92, ruido(n, n, 2.2, rng=r))
    img = img * (1 - 0.16 * mancha)[:, :, None] * tinte(1.0, 0.95, 0.85)[None, None, :]
    return np.clip(img, 0, 1)


# ---------------------------------------------------------------- rua à noite (janela)
def rua(w=2048, h=1024):
    r = rng_de(61)
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    ceu = cor(8, 11, 34)[None, None, :] * (1 - y)[:, :, None] + cor(74, 40, 80)[None, None, :] * y[:, :, None]
    img = np.broadcast_to(ceu, (h, w, 3)).copy()
    luz = np.zeros((h, w, 3), np.float32)
    im = Image.new("RGB", (w, h), (0, 0, 0))
    d = ImageDraw.Draw(im)
    chao = int(h * 0.7)
    # prédios ao fundo, em duas camadas
    for camada, (tom, base_y, alt_min, alt_max) in enumerate((((22, 26, 54), chao, 150, 420), ((14, 16, 36), chao, 90, 300))):
        x = -int(r.integers(0, 80))
        while x < w:
            larg = int(r.integers(110, 260))
            alt = int(r.integers(alt_min, alt_max))
            d.rectangle((x, base_y - alt, x + larg, base_y), fill=tom)
            for jx in range(x + 14, x + larg - 22, 34):
                for jy in range(base_y - alt + 18, base_y - 30, 44):
                    if r.random() < (0.16 if camada == 0 else 0.1):
                        c = [(255, 214, 120), (255, 160, 80), (190, 230, 255)][int(r.integers(0, 3))]
                        d.rectangle((jx, jy, jx + 16, jy + 22), fill=c)
            x += larg + int(r.integers(8, 40))
    cena = np.asarray(im, dtype=np.float32) / 255.0
    pred = (cena.sum(axis=2) > 0)[:, :, None]
    img = np.where(pred, cena, img)
    # lua
    lua = Image.new("L", (w, h), 0)
    ld = ImageDraw.Draw(lua)
    ld.ellipse((270, 90, 350, 170), fill=255)
    ld.ellipse((292, 82, 372, 162), fill=0)
    lm = np.asarray(lua, dtype=np.float32) / 255.0
    luz += cor(255, 240, 200)[None, None, :] * (lm * 0.95 + borrar(lm, 14) * 0.5)[:, :, None]
    # rua molhada
    asf = np.zeros((h, w), np.float32)
    asf[chao:, :] = 1.0
    img = np.where(asf[:, :, None] > 0, cor(20, 21, 30)[None, None, :] * (0.8 + 0.5 * ruido(h, w, 1.5, rng=r))[:, :, None], img)
    calc = Image.new("L", (w, h), 0)
    cd = ImageDraw.Draw(calc)
    cd.rectangle((0, chao, w, chao + 36), fill=255)
    cm = np.asarray(calc, dtype=np.float32) / 255.0
    img = np.where(cm[:, :, None] > 0, cor(64, 62, 76)[None, None, :], img)
    # carro estacionado: silhueta com lanterna traseira
    carro = Image.new("L", (w, h), 0)
    kd = ImageDraw.Draw(carro)
    cx, cy = 760, chao + 150
    kd.rounded_rectangle((cx, cy - 70, cx + 420, cy + 20), 28, fill=255)
    kd.rounded_rectangle((cx + 70, cy - 126, cx + 330, cy - 50), 36, fill=255)
    kd.ellipse((cx + 40, cy - 8, cx + 120, cy + 72), fill=255)
    kd.ellipse((cx + 300, cy - 8, cx + 380, cy + 72), fill=255)
    km = np.asarray(carro, dtype=np.float32) / 255.0
    img = np.where(km[:, :, None] > 0.5, cor(10, 10, 16)[None, None, :], img)
    lant = Image.new("L", (w, h), 0)
    ImageDraw.Draw(lant).rounded_rectangle((cx + 4, cy - 56, cx + 30, cy - 30), 6, fill=255)
    lm2 = np.asarray(lant, dtype=np.float32) / 255.0
    luz += cor(255, 40, 30)[None, None, :] * (lm2 + borrar(lm2, 18) * 1.4)[:, :, None]
    # poste de luz de sódio
    px = 1560
    pd = Image.new("L", (w, h), 0)
    pdd = ImageDraw.Draw(pd)
    pdd.rectangle((px - 7, 250, px + 7, chao + 30), fill=255)
    pdd.line((px, 252, px - 120, 232), fill=255, width=12)
    pdd.rounded_rectangle((px - 188, 224, px - 104, 246), 8, fill=255)
    pm = np.asarray(pd, dtype=np.float32) / 255.0
    img = np.where(pm[:, :, None] > 0.5, cor(6, 6, 10)[None, None, :], img)
    lamp = Image.new("L", (w, h), 0)
    ImageDraw.Draw(lamp).rounded_rectangle((px - 176, 244, px - 116, 252), 4, fill=255)
    lamm = np.asarray(lamp, dtype=np.float32) / 255.0
    cone = np.zeros((h, w), np.float32)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dist = np.sqrt(((xx - (px - 146)) / 380.0) ** 2 + ((yy - (chao + 150)) / 110.0) ** 2)
    cone = np.where(yy > chao, lisstep(1.0, 0.0, dist), 0.0)
    luz += cor(255, 170, 70)[None, None, :] * (lamm * 1.2 + borrar(lamm, 22) * 1.7 + borrar(lamm, 70) * 1.3)[:, :, None]
    luz += cor(255, 150, 60)[None, None, :] * (cone * 0.5)[:, :, None]
    # cruz de farmácia em verde
    cz = Image.new("L", (w, h), 0)
    zd = ImageDraw.Draw(cz)
    zx, zy = 420, 330
    zd.rectangle((zx - 18, zy - 70, zx + 18, zy + 70), fill=255)
    zd.rectangle((zx - 70, zy - 18, zx + 70, zy + 18), fill=255)
    zm = np.asarray(cz, dtype=np.float32) / 255.0
    luz += cor(60, 255, 130)[None, None, :] * (zm * 0.9 + borrar(zm, 10) * 1.0 + borrar(zm, 40) * 0.9)[:, :, None]
    # reflexos de luz no asfalto molhado
    refl = np.zeros((h, w), np.float32)
    for (rx, forca, cc) in ((px - 146, 0.9, cor(255, 160, 60)), (zx, 0.5, cor(60, 255, 130)), (cx + 17, 0.6, cor(255, 40, 30))):
        faixa = lisstep(70, 0, np.abs(xx - rx)) * lisstep(h, chao + 20, yy) * (yy > chao)
        faixa *= 0.6 + 0.4 * ruido(h, w, 1.2, aniso=(0.4, 3.0), rng=r)
        luz += cc[None, None, :] * (faixa * forca * 0.55)[:, :, None]
    img = img + luz
    img += 0.012 * r.normal(size=img.shape).astype(np.float32)
    return np.clip(img, 0, 1)


# ---------------------------------------------------------------- giz
def _giz(img, tracos, larg, cor_giz, semente, opac=0.92):
    """Desenha traços como giz: máscara com grão, borda irregular."""
    h, w, _ = img.shape
    ss = 2
    m = Image.new("L", (w * ss, h * ss), 0)
    d = ImageDraw.Draw(m)
    for t in tracos:
        pts = [(x * ss, y * ss) for x, y in t]
        if len(pts) < 2 or (len(pts) == 2 and pts[0] == pts[1]):
            rr = larg * ss / 2
            d.ellipse((pts[0][0] - rr, pts[0][1] - rr, pts[0][0] + rr, pts[0][1] + rr), fill=255)
            continue
        d.line(pts, fill=255, width=max(1, int(larg * ss)), joint="curve")
        rr = larg * ss / 2
        for p in (pts[0], pts[-1]):
            d.ellipse((p[0] - rr, p[1] - rr, p[0] + rr, p[1] + rr), fill=255)
    m = np.asarray(m.resize((w, h), Image.LANCZOS), dtype=np.float32) / 255.0
    r = rng_de(semente)
    grao = ruido(h, w, 0.6, rng=r)
    desgaste = lisstep(0.32, 0.62, grao + 0.25 * ruido(h, w, 1.6, rng=r))
    m2 = m * (0.35 + 0.65 * desgaste) * opac
    m2 = np.clip(m2 + 0.25 * borrar(m, 2.0) * desgaste, 0, 1)
    img[:] = img * (1 - m2[:, :, None]) + cor(*cor_giz)[None, None, :] * m2[:, :, None]


def quadro(w=1536, h=1024):
    r = rng_de(71)
    base = cor(28, 42, 38)[None, None, :] * np.ones((h, w, 1), np.float32)
    nuvem = ruido(h, w, 2.4, aniso=(1.0, 0.6), rng=r)
    img = base * (0.9 + 0.3 * nuvem)[:, :, None]
    # apagador: passadas largas e fracas de giz branco borrado
    for k in range(7):
        x0, y0 = r.uniform(0, w * .6), r.uniform(0, h * .8)
        passada = Image.new("L", (w, h), 0)
        ImageDraw.Draw(passada).line([(x0, y0), (x0 + r.uniform(300, 700), y0 + r.uniform(-40, 40))], fill=255, width=int(r.uniform(60, 120)))
        pm = borrar(np.asarray(passada, dtype=np.float32) / 255.0, 26)
        img = img + cor(80, 96, 90)[None, None, :] * (pm * 0.16 * ruido(h, w, 1.0, rng=r))[:, :, None]
    cx = w / 2

    def linha(txt, s, y_base, x, cor_giz, larg, ancora="esq", gap=2.0, semente=1):
        tr, wt = letras.compor(txt, gap)
        if ancora == "centro":
            x = x - wt * s / 2
        elif ancora == "dir":
            x = x - wt * s
        _giz(img, letras.transformar(tr, s, x, y_base, True), larg, cor_giz, semente)
        return wt * s
    # título
    wt = linha("SINUCA", 19, 250, cx, (246, 244, 236), 13, "centro", 2.6, 1)
    yb = 292
    _giz(img, [[(cx - wt / 2, yb), (cx + wt / 2, yb + 6)], [(cx - wt / 2 + 20, yb + 24), (cx + wt / 2 - 30, yb + 26)]], 7, (255, 214, 96), 2)
    # bolas oito dos dois lados
    for bx in (cx - wt / 2 - 120, cx + wt / 2 + 120):
        c = [(bx + 52 * math.cos(a), 168 + 52 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 40)]
        _giz(img, [c], 8, (246, 244, 236), 3)
        tr8, w8 = letras.compor("8", 1)
        _giz(img, letras.transformar(tr8, 4.6, bx - w8 * 4.6 / 2, 198, True), 7, (255, 214, 96), 4)
    # tabela de preços
    itens = [("FICHA", "R$ 2", (246, 244, 236)), ("CERVEJA", "R$ 8", (255, 156, 190)), ("PINGA", "R$ 4", (255, 214, 96)), ("PORÇÃO", "R$ 25", (140, 214, 255))]
    y = 470
    for i, (nome, preco, cc) in enumerate(itens):
        a = linha(nome, 7.2, y, 150, cc, 9, "esq", 2.4, 10 + i)
        b = linha(preco, 7.2, y, w - 150, cc, 9, "dir", 2.4, 20 + i)
        x0 = 150 + a + 34
        x1 = w - 150 - b * 0 - (letras.compor(preco, 2.4)[1] * 7.2) - 34
        pontos = [[(px, y - 4), (px, y - 3.5)] for px in np.arange(x0, x1, 26)]
        _giz(img, pontos, 8, cc, 30 + i)
        y += 118
    # rodapé
    linha("FIADO SÓ AMANHÃ", 5.0, 960, cx, (255, 214, 96), 7, "centro", 2.4, 40)
    onda = [(120 + k * 6, 984 + 5 * math.sin(k * 0.5)) for k in range(int((w - 240) / 6))]
    _giz(img, [onda], 4, (255, 214, 96), 41)
    # moldura de giz fina
    _giz(img, [[(48, 48), (w - 48, 50), (w - 50, h - 48), (50, h - 50), (48, 48)]], 4, (246, 244, 236), 50, 0.5)
    img = img + 0.01 * r.normal(size=img.shape).astype(np.float32)
    return np.clip(img, 0, 1)


# ---------------------------------------------------------------- cartazes e rótulos
def _placa(d_img, caixa, fundo, borda, linhas, semente=1):
    """Uma placa: retângulo com borda, texto em traços grossos (linhas = [(texto, escala_da_altura, cor)])."""
    x0, y0, x1, y1 = caixa
    d = ImageDraw.Draw(d_img)
    d.rounded_rectangle((x0, y0, x1, y1), 26, fill=fundo)
    d.rounded_rectangle((x0 + 22, y0 + 22, x1 - 22, y1 - 22), 16, outline=borda, width=8)
    return d


def _texto_px(img, txt, cx, y_base, alt, cor_t, largura_max, gap=2.0):
    s = alt / 10.0
    tr, wt = letras.compor(txt, gap)
    if wt * s > largura_max:
        s = largura_max / wt
    tr = letras.transformar(tr, s, cx - wt * s / 2, y_base, True)
    d = ImageDraw.Draw(img)
    lw = max(3, int(s * 1.7))
    for t in tr:
        d.line(t, fill=cor_t, width=lw, joint="curve")
        for p in (t[0], t[-1]):
            d.ellipse((p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2), fill=cor_t)


def cartazes(w=2048, h=1024):
    """Quatro placas, cada uma numa célula de 1024x512 (esq-cima, dir-cima, esq-baixo, dir-baixo)."""
    r = rng_de(81)
    img = Image.new("RGB", (w, h), (40, 36, 34))
    # 1 proibido fiado
    d = _placa(img, (10, 10, 1014, 502), (196, 34, 34), (255, 255, 255), [])
    _texto_px(img, "PROIBIDO", 512, 250, 120, (255, 255, 255), 820)
    _texto_px(img, "FIADO", 512, 420, 120, (255, 232, 120), 600)
    # 2 cerveja gelada
    d = _placa(img, (1034, 10, 2038, 502), (28, 70, 146), (255, 255, 255), [])
    _texto_px(img, "CERVEJA", 1536 + 90, 230, 112, (255, 255, 255), 640)
    _texto_px(img, "GELADA", 1536 + 90, 400, 112, (140, 226, 255), 600)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((1090, 150, 1210, 330), 14, fill=(255, 205, 70))
    d.rounded_rectangle((1100, 190, 1200, 322), 10, fill=(236, 150, 30))
    d.rounded_rectangle((1090, 118, 1218, 176), 24, fill=(255, 255, 255))
    d.arc((1190, 190, 1270, 290), -90, 90, fill=(255, 205, 70), width=16)
    # 3 hoje tem jogo
    d = _placa(img, (10, 522, 1014, 1014), (22, 112, 62), (255, 232, 120), [])
    _texto_px(img, "HOJE TEM", 512 + 60, 740, 112, (255, 232, 120), 700)
    _texto_px(img, "JOGO", 512 + 60, 910, 112, (255, 255, 255), 500)
    d = ImageDraw.Draw(img)
    d.ellipse((60, 690, 190, 820), fill=(250, 250, 250), outline=(20, 20, 20), width=6)
    d.polygon([(125, 722), (152, 742), (142, 772), (108, 772), (98, 742)], fill=(20, 20, 20))
    # 4 aviso de ficha
    d = _placa(img, (1034, 522, 2038, 1014), (24, 20, 28), (255, 56, 140), [])
    _texto_px(img, "FICHA", 1536, 740, 112, (255, 120, 180), 700)
    _texto_px(img, "R$ 2", 1536, 920, 130, (255, 214, 96), 500)
    a = np.asarray(img, dtype=np.float32) / 255.0
    a *= (0.92 + 0.12 * ruido(h, w, 1.2, rng=r))[:, :, None]
    a = a * (1 - 0.18 * lisstep(0.6, 0.9, ruido(h, w, 2.4, rng=r)))[:, :, None]
    return np.clip(a, 0, 1)


def rotulos(w=1024, h=512):
    """Oito rótulos de garrafa (cada um 256x256), marcas inventadas; o desenho usa a parte central e a garrafa mostra uma fatia."""
    r = rng_de(91)
    img = Image.new("RGB", (w, h), (30, 30, 30))
    modelos = [("CACHACA", (210, 40, 36), (255, 236, 150)), ("PINGA", (232, 214, 150), (110, 40, 30)),
               ("GELADA", (30, 80, 160), (255, 255, 255)), ("VINHO", (96, 22, 46), (250, 220, 150)),
               ("BITTER", (26, 110, 70), (255, 240, 170)), ("LICOR", (250, 190, 40), (120, 30, 20)),
               ("DOSE", (240, 240, 232), (190, 36, 36)), ("CHOPP", (230, 130, 30), (255, 255, 255))]
    for i, (nome, fundo, fg) in enumerate(modelos):
        x0, y0 = (i % 4) * 256, (i // 4) * 256
        d = ImageDraw.Draw(img)
        d.rectangle((x0, y0, x0 + 255, y0 + 255), fill=fundo)
        d.rectangle((x0 + 10, y0 + 12, x0 + 245, y0 + 243), outline=fg, width=5)
        d.line((x0 + 10, y0 + 70, x0 + 245, y0 + 70), fill=fg, width=4)
        d.line((x0 + 10, y0 + 190, x0 + 245, y0 + 190), fill=fg, width=4)
        sub = Image.new("RGB", (256, 256), fundo)
        _texto_px(sub, nome, 128, 150, 52, fg, 200, 1.6)
        img.paste(sub.crop((0, 70, 256, 190)), (x0, y0 + 70))
        d.ellipse((x0 + 108, y0 + 20, x0 + 148, y0 + 60), fill=fg)
        d.ellipse((x0 + 108, y0 + 198, x0 + 148, y0 + 238), outline=fg, width=4)
    a = np.asarray(img, dtype=np.float32) / 255.0
    return np.clip(a * (0.94 + 0.1 * ruido(h, w, 1.0, rng=r))[:, :, None], 0, 1)


# ---------------------------------------------------------------- decoração: cores das bandeirinhas, relógio, bandeira de time
def decoracao(n=512):
    """Atlas 2x2 (cada célula n/2): bandeirinhas (4 cores), relógio, bandeira listrada de time."""
    ss = 4
    h = n // 2
    img = Image.new("RGB", (n * ss, n * ss), (24, 22, 24))
    d = ImageDraw.Draw(img)
    H = h * ss
    for i, c in enumerate(((30, 150, 70), (250, 200, 30), (30, 90, 190), (214, 44, 52))):
        x, y = (i % 2) * H // 2, (i // 2) * H // 2
        d.rectangle((x, y, x + H // 2, y + H // 2), fill=c)
    cx, cy, R = H + H // 2, H // 2, int(H * 0.47)
    d.ellipse((cx - R, cy - R, cx + R, cy + R), fill=(236, 232, 218), outline=(30, 24, 20), width=int(H * 0.035))
    for k in range(12):
        a = math.radians(30 * k)
        r0, r1 = R * (0.82 if k % 3 else 0.74), R * 0.92
        d.line((cx + r0 * math.cos(a), cy + r0 * math.sin(a), cx + r1 * math.cos(a), cy + r1 * math.sin(a)), fill=(30, 24, 20), width=int(H * (0.025 if k % 3 else 0.04)))
    for ang, comp, larg in ((-60, 0.5, 0.045), (60 + 90, 0.72, 0.03)):
        a = math.radians(ang)
        d.line((cx, cy, cx + R * comp * math.cos(a), cy + R * comp * math.sin(a)), fill=(30, 24, 20), width=int(H * larg))
    d.ellipse((cx - H * 0.03, cy - H * 0.03, cx + H * 0.03, cy + H * 0.03), fill=(190, 30, 30))
    x0, y0 = 0, H
    for k in range(7):
        d.rectangle((x0 + k * H // 7, y0, x0 + (k + 1) * H // 7, y0 + H), fill=(26, 24, 26) if k % 2 == 0 else (240, 238, 232))
    d.ellipse((x0 + H * 0.34, y0 + H * 0.34, x0 + H * 0.66, y0 + H * 0.66), fill=(200, 34, 40), outline=(240, 238, 232), width=int(H * 0.02))
    a = np.asarray(img.resize((n, n), Image.LANCZOS), dtype=np.float32) / 255.0
    return np.clip(a, 0, 1)


# ---------------------------------------------------------------- néon do boteco
def letreiro_halo(larg=1024):
    els, h = marca.elementos("completo", 2048, 190)
    rgba = marca.render_aceso(els, 2048, h, 1)
    im = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA")
    return im.resize((larg, int(round(h * larg / 2048))), Image.LANCZOS)


def letreiro_placa(larg=1024):
    """O letreiro aceso sobre uma placa escura, opaco: para o emissivo dos níveis sem tubos."""
    halo = letreiro_halo(larg)
    fundo = Image.new("RGBA", halo.size, (14, 10, 18, 255))
    fundo.alpha_composite(halo)
    return fundo.convert("RGB")


# ---------------------------------------------------------------- saída
def salvar(a, caminho, tamanho=None, q=86):
    if isinstance(a, np.ndarray):
        im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    else:
        im = a
    if tamanho and im.size != tamanho:
        im = im.resize(tamanho, Image.LANCZOS)
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    if caminho.endswith(".png"):
        im.save(caminho, optimize=True)
    else:
        im.convert("RGB").save(caminho, quality=q, optimize=True, subsampling=0 if q >= 90 else 2)


NIVEIS = {  # fator de escala sobre o alto, e quais mapas cada nível leva
    "alto": 1.0,
    "medio": 0.5,
    "baixo": 0.25,
}


def gerar(pasta):
    """Os desenhos do boteco. O azulejo, o reboco, o piso, a madeira e o forro agora são fotos CC0 (`fotos.py`); aqui ficam a rua, o quadro de giz,
    as bandeirinhas e o relógio e o letreiro; os cartazes, rótulos, adesivos e telas estão em `sinais.py`."""
    import sinais_p6
    mestres = {"decoracao": decoracao(512), "quadro": sinais_p6.quadro_p6(1536, 1024)}
    cache = {}
    placa = letreiro_placa(1024)
    halo = letreiro_halo(1024)
    for nivel, f in NIVEIS.items():
        base = os.path.join(pasta, nivel)
        for nome, a in mestres.items():
            h, w = a.shape[:2]
            tam = (max(128, int(w * f)), max(64, int(h * f)))
            salvar(a, os.path.join(base, nome + ".jpg"), tam)
        if nivel == "alto":
            salvar(halo, os.path.join(base, "letreiro-halo.png"))
        salvar(placa, os.path.join(base, "letreiro.jpg"), (int(1024 * max(f, 0.5)), int(placa.size[1] * max(f, 0.5))))
        cache = sinais_p6.gerar_janela(pasta, nivel, cache) or cache
    import sinais
    sinais.gerar(pasta, NIVEIS)


if __name__ == "__main__":
    pasta = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "texturas")
    gerar(pasta)
    for nivel in NIVEIS:
        tot = 0
        for f in sorted(os.listdir(os.path.join(pasta, nivel))):
            tot += os.path.getsize(os.path.join(pasta, nivel, f))
        print(nivel, f"{tot / 1e6:.2f} MB", len(os.listdir(os.path.join(pasta, nivel))), "arquivos")
