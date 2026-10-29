"""Desenhos novos do P6: rótulos de papel das garrafas (atlas 4x4 com bordas, grão e desgaste), adesivos de logo das cadeiras, e (mais abaixo) papel dos cartazes,
quadro de giz com pó, a rua da janela em camadas e o vidro sujo. Tudo por script (Pillow + numpy + a fonte de traço de `letras.py`), sem arte de terceiros:
marcas inventadas, nenhum logotipo real.
"""
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import sinais as S
import texturas as T


def _gradiente(px, fundo, escuro=0.88):
    a = np.zeros((px, px, 3), np.float32) + np.array(fundo, np.float32)
    yy = np.linspace(1.0, escuro, px)[:, None, None]
    return Image.fromarray(np.clip(a * yy, 0, 255).astype(np.uint8))


def _papel(im, semente, forca=0.10, sujo=0.12, riscos=14, borda=True):
    """Papel de rótulo velho: fibra, manchas, riscos brancos de arranhão e a borda do papel levemente clareada e gasta."""
    a = np.asarray(im.convert("RGB"), np.float32) / 255.0
    h, w = a.shape[:2]
    r = T.rng_de(semente)
    fibra = T.ruido(h, w, 0.8, aniso=(1.0, 1.0), rng=r)
    a = a * (1 - forca * 0.5 + forca * fibra)[:, :, None]
    mancha = T.lisstep(0.55, 0.9, T.ruido(h, w, 2.6, rng=r))
    a = a * (1 - sujo * mancha)[:, :, None] * np.array([1.0, 0.96, 0.88], np.float32)[None, None, :]
    img = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    d = ImageDraw.Draw(img, "RGBA")
    rng = np.random.default_rng(semente)
    for _ in range(riscos):    # arranhões claros curtos
        x0, y0 = rng.uniform(0, w), rng.uniform(0, h)
        ang = rng.uniform(0, math.pi)
        ln = rng.uniform(0.03, 0.14) * w
        d.line((x0, y0, x0 + ln * math.cos(ang), y0 + ln * math.sin(ang)), fill=(255, 250, 236, int(rng.uniform(40, 110))), width=max(1, w // 400))
    if borda:   # a borda do papel: fio claro e desgaste nos cantos
        e = max(2, w // 120)
        d.rectangle((0, 0, w - 1, h - 1), outline=(250, 244, 226, 150), width=e)
        for (cx, cy) in ((0, 0), (w, 0), (0, h), (w, h)):
            d.ellipse((cx - w * 0.04, cy - w * 0.04, cx + w * 0.04, cy + w * 0.04), fill=(236, 226, 200, 150))
    return img


def _rotulo_cell(S_px, dados, i):
    """Um rótulo `S_px` x `S_px` (desenhado em 2x e reduzido). Três estilos: clássico (faixas e emblema), moderno (listra e letrão), oval (selo)."""
    l1, l2, fundo, fg, dest, emb = dados
    ss = 2
    n = S_px * ss
    img = _gradiente(n, fundo)
    d = ImageDraw.Draw(img)
    estilo = i % 3
    u = n / 256.0
    d.rectangle((6 * u, 8 * u, 250 * u, 248 * u), outline=fg, width=int(5 * u))
    d.rectangle((13 * u, 15 * u, 243 * u, 241 * u), outline=dest, width=max(2, int(2 * u)))
    if estilo == 0:
        d.line((14 * u, 76 * u, 242 * u, 76 * u), fill=dest, width=int(5 * u))
        d.line((14 * u, 174 * u, 242 * u, 174 * u), fill=dest, width=int(5 * u))
        S._emblema(d, emb, 128 * u, 44 * u, 24 * u, dest)
        S._texto(img, l1, 128 * u, 119 * u, 32 * u, fg, 200 * u, 1.8)
        S._texto(img, l2, 128 * u, 160 * u, 28 * u, dest if sum(dest) > 240 and fundo != dest else fg, 200 * u, 1.8)
        d.ellipse((112 * u, 190 * u, 144 * u, 222 * u), outline=fg, width=int(4 * u))
        S._estrela(d, 128 * u, 206 * u, 11 * u, fg, 5)
    elif estilo == 1:
        d.rectangle((14 * u, 14 * u, 78 * u, 242 * u), fill=dest)
        S._emblema(d, emb, 46 * u, 58 * u, 22 * u, fundo)
        S._estrela(d, 46 * u, 128 * u, 12 * u, fundo, 5)
        S._estrela(d, 46 * u, 168 * u, 12 * u, fundo, 5)
        S._estrela(d, 46 * u, 208 * u, 12 * u, fundo, 5)
        S._texto(img, l1, 166 * u, 120 * u, 38 * u, fg, 150 * u, 1.6)
        d.line((92 * u, 140 * u, 236 * u, 140 * u), fill=dest, width=int(4 * u))
        S._texto(img, l2, 166 * u, 184 * u, 34 * u, dest if sum(dest) > 240 and fundo != dest else fg, 150 * u, 1.6)
        S._texto(img, "TRADICAO", 166 * u, 222 * u, 16 * u, fg, 130 * u, 1.4)
    else:
        d.ellipse((30 * u, 52 * u, 226 * u, 214 * u), fill=dest if sum(dest) > 240 else fg)
        d.ellipse((38 * u, 60 * u, 218 * u, 206 * u), fill=fundo)
        d.ellipse((46 * u, 68 * u, 210 * u, 198 * u), outline=dest, width=max(2, int(3 * u)))
        S._emblema(d, emb, 128 * u, 98 * u, 20 * u, dest)
        S._texto(img, l1, 128 * u, 140 * u, 30 * u, fg, 142 * u, 1.6)
        S._texto(img, l2, 128 * u, 172 * u, 24 * u, fg, 130 * u, 1.6)
        for k in range(7):
            S._estrela(d, (40 + k * 29) * u, 232 * u, 6 * u, dest, 5)
        S._texto(img, "ESTD. 1952", 128 * u, 38 * u, 16 * u, fg, 120 * u, 1.4)
    img = img.resize((S_px, S_px), Image.LANCZOS)
    return _papel(img, 300 + i)


def rotulos_p6(px=1536):
    """O atlas 4x4 dos rótulos (mesma ordem de `sinais.ROTULOS`): `px` de lado."""
    c = px // 4
    atlas = Image.new("RGB", (px, px), (30, 30, 30))
    for i, dados in enumerate(S.ROTULOS):
        atlas.paste(_rotulo_cell(c, dados, i), ((i % 4) * c, (i // 4) * c))
    return atlas


def _logo_cadeira(w, h, fundo_adesivo, fundo_plastico, cor1, cor2, linha1, linha2, semente):
    ss = 2
    im = Image.new("RGB", (w * ss, h * ss), fundo_plastico)
    d = ImageDraw.Draw(im)
    m = 0.05 * h * ss
    d.rounded_rectangle((m, m, w * ss - m, h * ss - m), int(0.2 * h * ss), fill=fundo_adesivo)
    d.rounded_rectangle((m * 2, m * 2, w * ss - m * 2, h * ss - m * 2), int(0.16 * h * ss), outline=cor2, width=int(0.035 * h * ss))
    S._coroa(d, 0.5 * w * ss, 0.24 * h * ss, 0.07 * h * ss * 2.0, cor2)
    im = im.resize((w, h), Image.LANCZOS)
    S._texto(im, linha1, w / 2, 0.66 * h, 0.27 * h, cor1, 0.74 * w, 1.6)
    S._texto(im, linha2, w / 2, 0.83 * h, 0.095 * h, cor2, 0.56 * w, 1.6)
    return _papel(im, semente, 0.05, 0.05, 6, borda=False)


def logo_cadeira_a(w=1024, h=448):
    """Adesivo da cadeira branca: "Rainha do Sul" (vermelho e dourado)."""
    return _logo_cadeira(w, h, (246, 236, 214), (206, 206, 196), (176, 30, 36), (210, 150, 30), "RAINHA", "CERVEJA DO SUL", 611)


def logo_cadeira_b(w=1024, h=448):
    """Adesivo da cadeira vermelha: "Dourada" (amarelo sobre o vermelho)."""
    return _logo_cadeira(w, h, (214, 140, 24), (138, 12, 14), (255, 246, 214), (120, 40, 8), "DOURADA", "SEMPRE GELADA", 612)


def gerar(pasta):
    """Os desenhos do P6 que não dependem do nível (em `<pasta>/sinais/`)."""
    import os
    os.makedirs(os.path.join(pasta, "sinais"), exist_ok=True)
    logo_cadeira_a().save(os.path.join(pasta, "sinais", "logo-cadeira-a.jpg"), quality=92, subsampling=0)
    logo_cadeira_b().save(os.path.join(pasta, "sinais", "logo-cadeira-b.jpg"), quality=92, subsampling=0)


# ---------------------------------------------------------------- cartazes: papel, fita, dobra, desbotado de sol; chapa esmaltada
def _fita(img, x, y, larg, alt, ang, semente):
    """Um pedaço de fita adesiva (bege translúcida, borda serrilhada, reflexo) colado em (x, y) com o ângulo `ang` (graus); desenhado sobre `img` (RGB)."""
    w, h = img.size
    cam = Image.new("RGBA", (int(larg * 1.2) + 8, int(alt * 1.4) + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(cam)
    rng = np.random.default_rng(semente)
    x0, y0, x1, y1 = 4 + larg * 0.1, 4 + alt * 0.2, 4 + larg * 1.1, 4 + alt * 1.2
    pts = [(x0 + rng.uniform(-2, 2), y0 + rng.uniform(-1, 1))]
    for k in range(1, 7):
        pts.append((x0 + (x1 - x0) * k / 6 + rng.uniform(-2, 2), y0 + rng.uniform(-2.5, 2.5)))
    pts.append((x1 + rng.uniform(-2, 2), y0 + 2))
    pts.append((x1 + rng.uniform(-2, 2), y1))
    for k in range(6, 0, -1):
        pts.append((x0 + (x1 - x0) * k / 6 + rng.uniform(-2, 2), y1 + rng.uniform(-2.5, 2.5)))
    pts.append((x0 + rng.uniform(-2, 2), y1))
    d.polygon(pts, fill=(238, 226, 190, 122))
    d.line([(x0 + 2, y0 + 3), (x1 - 2, y0 + 3)], fill=(255, 252, 235, 120), width=max(1, int(alt * 0.08)))
    d.line([(x0 + 2, y1 - 3), (x1 - 2, y1 - 3)], fill=(170, 150, 100, 80), width=max(1, int(alt * 0.06)))
    cam = cam.rotate(ang, expand=True, resample=Image.BICUBIC)
    img.paste(cam, (int(x - cam.size[0] / 2), int(y - cam.size[1] / 2)), cam)


def papel_cartaz(im, semente, fita=True, dobras=True, desbotar=0.2):
    """Cartaz de papel colado na parede: fibra, desbotado de sol (mais forte no alto), dobras em cruz, bordas amareladas e roídas, uma mancha de caneca e fita nos cantos de cima."""
    im = im.convert("RGB")
    w, h = im.size
    a = np.asarray(im, np.float32) / 255.0
    r = T.rng_de(semente)
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    # sol: desbota e esbranquiça, mais no alto e em manchas
    sol = np.clip(desbotar * (1.15 - yy) * (0.6 + 0.8 * T.ruido(h, w, 2.2, rng=r)[:, :, None]), 0, 0.6)
    cinza = a.mean(axis=2, keepdims=True)
    a = a * (1 - sol) + (cinza * 0.7 + 0.32) * sol
    # fibra do papel e grão
    fibra = T.ruido(h, w, 0.9, aniso=(1.0, 2.5), rng=r)
    a = a * (0.93 + 0.14 * fibra[:, :, None])
    img = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    d = ImageDraw.Draw(img, "RGBA")
    rng = np.random.default_rng(semente)
    if dobras:   # dobra vertical e horizontal: um vinco escuro e um claro lado a lado
        for horizontal in (False, True):
            pos = (rng.uniform(0.47, 0.53) * (h if horizontal else w))
            for off, cor, al in ((0, (60, 40, 20), 46), (max(2, w // 260), (255, 250, 236), 70)):
                if horizontal:
                    d.line((0, pos + off, w, pos + off + rng.uniform(-3, 3)), fill=cor + (al,), width=max(1, w // 330))
                else:
                    d.line((pos + off, 0, pos + off + rng.uniform(-3, 3), h), fill=cor + (al,), width=max(1, w // 330))
    if rng.random() < 0.55:   # anel de caneca
        cx, cy, rr = rng.uniform(0.2, 0.8) * w, rng.uniform(0.55, 0.9) * h, rng.uniform(0.06, 0.1) * w
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(110, 70, 30, 54), width=max(2, w // 120))
    e = max(3, w // 90)   # borda amarelada e roída
    d.rectangle((0, 0, w - 1, h - 1), outline=(214, 190, 140, 130), width=e)
    if fita:
        _fita(img, w * 0.1, h * 0.03, w * 0.2, h * 0.05, rng.uniform(-18, -6), semente + 1)
        _fita(img, w * 0.9, h * 0.03, w * 0.2, h * 0.05, rng.uniform(6, 18), semente + 2)
    return img


def chapa_esmaltada(im, semente):
    """Placa de esmalte aparafusada: arranhões, lascas que mostram a ferrugem, parafusos com o escorrido de ferrugem e amassado suave."""
    im = im.convert("RGB")
    w, h = im.size
    a = np.asarray(im, np.float32) / 255.0
    r = T.rng_de(semente)
    amassado = T.borrar(T.ruido(h, w, 2.8, rng=r), 3.0)
    a = a * (0.9 + 0.2 * amassado[:, :, None])
    img = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8))
    d = ImageDraw.Draw(img, "RGBA")
    rng = np.random.default_rng(semente)
    for _ in range(26):   # lascas nas bordas
        lado = rng.integers(0, 4)
        t = rng.uniform(0.05, 0.95)
        x = [t * w, w - 4, t * w, 4][lado] + rng.uniform(-3, 3)
        y = [4, t * h, h - 4, t * h][lado] + rng.uniform(-3, 3)
        rr = rng.uniform(2.5, 8) * w / 700
        d.polygon([(x + rr * math.cos(k * 1.1) * rng.uniform(0.6, 1.2), y + rr * math.sin(k * 1.1) * rng.uniform(0.6, 1.2)) for k in range(6)], fill=(96, 52, 26, 230))
    for _ in range(18):   # arranhões
        x0, y0 = rng.uniform(0, w), rng.uniform(0, h)
        ang = rng.uniform(0, math.pi)
        ln = rng.uniform(0.04, 0.2) * w
        d.line((x0, y0, x0 + ln * math.cos(ang), y0 + ln * math.sin(ang)), fill=(235, 232, 222, 90), width=max(1, w // 500))
    rp = max(5, w // 55)   # parafusos nos cantos e o escorrido
    for (px, py) in ((0.045 * w, 0.09 * h), (0.955 * w, 0.09 * h), (0.045 * w, 0.91 * h), (0.955 * w, 0.91 * h)):
        for k in range(18):
            al = int(90 * (1 - k / 18))
            d.line((px, py + rp + k * rp * 0.5, px + rng.uniform(-1.2, 1.2), py + rp + (k + 1) * rp * 0.5), fill=(120, 62, 28, al), width=max(2, int(rp * 0.7)))
        d.ellipse((px - rp, py - rp, px + rp, py + rp), fill=(150, 150, 146, 255), outline=(60, 60, 58, 255), width=max(1, rp // 4))
        d.line((px - rp * 0.6, py, px + rp * 0.6, py), fill=(60, 60, 58, 255), width=max(1, rp // 3))
    return img


def quadro_p6(w=1536, h=1024):
    """Quadro de giz (`texturas.quadro`) com o pó: borrão de apagador, auréola de pó em volta dos traços, pontinhos e uma faixa de pó acumulada embaixo."""
    a = T.quadro(w, h)
    r = T.rng_de(72)
    claro = (a.mean(axis=2) > 0.55).astype(np.float32)           # onde tem giz
    halo = T.borrar(claro, max(3.0, w / 200)) * 0.20
    haze = T.lisstep(0.45, 0.75, T.ruido(h, w, 2.0, aniso=(1.0, 0.5), rng=r)) * 0.10
    pontos = (T.ruido(h, w, 0.3, rng=r) > 0.78).astype(np.float32) * 0.18
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    base = T.lisstep(0.9, 1.0, yy) * (0.25 + 0.3 * T.ruido(h, w, 1.5, rng=r))
    poeira = np.clip(halo + haze + pontos + base, 0, 0.5)
    a = a * (1 - poeira[:, :, None]) + np.array([0.82, 0.86, 0.84], np.float32)[None, None, :] * poeira[:, :, None]
    return np.clip(a, 0, 1)


# ---------------------------------------------------------------- a rua à noite em camadas (janela): fundo (céu e prédios longe), fachada do outro lado, chão com a luz do poste
import letras  # noqa: E402


def _neon(img, texto, cx, cy, alt, cor, brilho=1.0, esp=1.0, largura_max=None):
    """Letreiro de neon com brilho: o traço da fonte única em `cor`, centro quase branco, e um halo borrado somado por cima."""
    w, h = img.size
    s = alt / 10.0
    tr, wt = letras.compor(texto, 1.6)
    if largura_max and wt * s > largura_max:
        s = largura_max / wt
    tr = letras.transformar(tr, s, cx - wt * s / 2, cy + 5 * s, True)
    halo = Image.new("RGB", (w, h), (0, 0, 0))
    nucleo = Image.new("RGB", (w, h), (0, 0, 0))
    dh, dn = ImageDraw.Draw(halo), ImageDraw.Draw(nucleo)
    lw = max(2, int(s * 1.3 * esp))
    for t in tr:
        dh.line(t, fill=cor, width=lw + 2, joint="curve")
        dn.line(t, fill=tuple(min(255, int(c * 0.5 + 135)) for c in cor), width=max(1, lw // 2), joint="curve")
    g1 = np.asarray(halo.filter(ImageFilter.GaussianBlur(max(2, s * 1.6))), np.float32)
    g2 = np.asarray(halo.filter(ImageFilter.GaussianBlur(max(1, s * 0.5))), np.float32)
    base = np.asarray(img, np.float32)
    out = base + brilho * (g1 * 1.1 + g2 * 0.9 + np.asarray(nucleo, np.float32) * 1.2)
    img.paste(Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)))


def _janelinha(d, x, y, w, h, rng, acesa=0.5):
    """Janela de prédio vista de longe: apagada, acesa quente com cortina e quina de móvel, ou azulada de TV."""
    if rng.random() > acesa:
        d.rectangle((x, y, x + w, y + h), fill=(14, 16, 26), outline=(8, 9, 14))
        d.line((x + 1, y + 1, x + w * 0.4, y + h * 0.3), fill=(26, 30, 46), width=max(1, int(w * 0.08)))
        return
    tom = [(255, 206, 120), (255, 178, 96), (214, 232, 255), (255, 232, 170)][int(rng.integers(0, 4))]
    d.rectangle((x, y, x + w, y + h), fill=tuple(int(c * 0.78) for c in tom), outline=(10, 10, 14))
    d.rectangle((x, y, x + w * rng.uniform(0.2, 0.4), y + h), fill=tuple(int(c * 0.5) for c in (200, 120, 90)))   # cortina
    d.rectangle((x + w * 0.5, y + h * 0.55, x + w * 0.9, y + h), fill=tuple(int(c * 0.35) for c in tom))          # móvel
    d.line((x + w / 2, y, x + w / 2, y + h), fill=(10, 10, 14), width=max(1, int(w * 0.07)))


def rua_fundo(w=1536, h=538, semente=62):
    """O fundo da rua (40 x 14 m a 22 m da janela): céu de cidade (laranja de poluição no horizonte), prédios em duas camadas com janelas, torre de rádio com luzes vermelhas, lua."""
    r = np.random.default_rng(semente)
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    topo, hor = np.array([5, 7, 22], np.float32), np.array([92, 52, 70], np.float32)
    ceu = topo * (1 - y ** 1.6) + hor * y ** 1.6
    img = Image.fromarray(np.clip(ceu * np.ones((h, w, 1), np.float32), 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for _ in range(90):   # estrelas fracas
        sx, sy = r.uniform(0, w), r.uniform(0, h * 0.45)
        b = int(r.uniform(70, 150))
        d.point((sx, sy), fill=(b, b, min(255, b + 30)))
    d.ellipse((w * 0.78, h * 0.1, w * 0.78 + 46, h * 0.1 + 46), fill=(228, 224, 200))
    d.ellipse((w * 0.78 + 14, h * 0.1 - 6, w * 0.78 + 62, h * 0.1 + 42), fill=tuple(int(c) for c in (20, 22, 50)))
    chao = int(h * 0.97)
    for camada, (tom, alt_min, alt_max, larg_min, larg_max, acesa) in enumerate((((26, 28, 54), 0.18, 0.55, 70, 190, 0.12), ((12, 13, 28), 0.1, 0.38, 80, 220, 0.18))):
        x = -int(r.integers(0, 80))
        while x < w:
            larg = int(r.integers(larg_min, larg_max))
            alt = int(h * r.uniform(alt_min, alt_max))
            d.rectangle((x, chao - alt, x + larg, chao), fill=tom)
            for jx in range(x + 8, x + larg - 14, 16):
                for jy in range(chao - alt + 10, chao - 14, 20):
                    if r.random() < acesa:
                        _janelinha(d, jx, jy, 8, 11, r, 0.85)
            x += larg + int(r.integers(0, 22))
    tx = int(w * 0.31)   # torre de rádio: treliça fina e luzes vermelhas
    d.line((tx, int(h * 0.16), tx - 12, chao - 150), fill=(22, 24, 44), width=3)
    d.line((tx, int(h * 0.16), tx + 12, chao - 150), fill=(22, 24, 44), width=3)
    for k in range(10):
        yy = int(h * 0.16) + k * ((chao - 150 - int(h * 0.16)) // 10)
        d.line((tx - 2 - k, yy, tx + 2 + k, yy + 14), fill=(22, 24, 44), width=1)
    for yy in (int(h * 0.16), int(h * 0.3), int(h * 0.44)):
        d.ellipse((tx - 3, yy - 3, tx + 3, yy + 3), fill=(255, 40, 30))
    return img.filter(ImageFilter.GaussianBlur(0.7))


def _ret(d, xy, **kw):
    x0, y0, x1, y1 = xy
    d.rectangle((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)), **kw)


def rua_fachada(w=2048, h=896, semente=63):
    """A fachada do outro lado da rua (14 x 6,1 m a 4,6 m da janela, de x = -8 a 6): portão e janelas de cima, lotérica de portão fechado, pastelaria acesa com neon, entrada de prédio.
    As janelas de cima mostram quartos de relance (cortina, lâmpada, móvel, a luz azul de uma TV)."""
    r = np.random.default_rng(semente)
    rr = T.rng_de(semente)
    base = np.zeros((h, w, 3), np.float32) + np.array([30, 32, 44], np.float32)
    base *= (0.8 + 0.4 * T.ruido(h, w, 1.6, aniso=(1.0, 0.7), rng=rr))[:, :, None]   # reboco manchado
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    mx = lambda x: int((x + 8.0) / 14.0 * w)       # noqa: E731 (metros -> px)
    my = lambda y: int((5.2 - y) / 6.1 * h)        # noqa: E731 (y do jogo -> px; o chão da rua em -0,9)
    chao_y = my(-0.9)
    # faixas pintadas e platibanda
    _ret(d, (0, my(4.9), w, my(5.2)), fill=(54, 50, 62))
    _ret(d, (0, my(0.45), w, my(0.6)), fill=(60, 52, 54))
    # janelas do segundo e terceiro andar
    for andar, (yj, hj) in enumerate(((2.55, 1.1), (4.0, 1.0))):
        for k in range(10):
            x0 = -7.5 + k * 1.4 + (0.35 if andar else 0)
            if x0 > 5.3:
                continue
            _janelinha(d, mx(x0), my(yj + hj), int(w / 14 * 0.8), int(h / 6.1 * hj), r, 0.42)
            _ret(d, (mx(x0) - 3, my(yj), mx(x0) + int(w / 14 * 0.8) + 3, my(yj) + 5), fill=(70, 66, 74))
    # lotérica: portão de enrolar fechado (listrado) e placa acesa em cima
    xa, xb = mx(-4.6), mx(-1.7)
    _ret(d, (xa, my(1.95), xb, chao_y), fill=(48, 50, 58))
    for yy in range(my(1.95), chao_y, 7):
        d.line((xa, yy, xb, yy), fill=(36, 38, 46), width=2)
        d.line((xa, yy + 3, xb, yy + 3), fill=(62, 64, 72), width=1)
    _ret(d, (xa - 6, my(2.15), xb + 6, my(1.95)), fill=(30, 30, 36))
    _ret(d, (xa + 30, my(3.02), xb - 30, my(2.25)), fill=(18, 40, 24), outline=(220, 200, 60), width=5)
    _neon(img, "LOTERIA", (xa + xb) / 2, my(2.72), 64, (250, 230, 60), 0.9, largura_max=xb - xa - 130)
    _neon(img, "SORTE GRANDE", (xa + xb) / 2, my(2.43), 36, (120, 255, 150), 0.7, largura_max=xb - xa - 150)
    for _ in range(14):   # pichação e sujeira no portão
        gx, gy = r.uniform(xa + 20, xb - 20), r.uniform(my(1.7), my(-0.5))
        d.line([(gx, gy), (gx + r.uniform(-30, 30), gy + r.uniform(-30, 30)), (gx + r.uniform(-60, 60), gy + r.uniform(-20, 20))], fill=(20, 24, 26), width=int(r.uniform(3, 7)))
    # pastelaria: vitrine acesa, balcão e gente, neon âmbar
    xc, xd = mx(-1.4), mx(2.6)
    _ret(d, (xc, my(2.0), xd, chao_y), fill=(26, 20, 22))
    vit = (xc + 14, my(1.9), xd - 14, my(-0.3))
    lum = np.zeros((vit[3] - vit[1], vit[2] - vit[0], 3), np.float32) + np.array([255, 190, 110], np.float32)
    lum *= (0.55 + 0.45 * np.linspace(1, 0.35, lum.shape[0], dtype=np.float32))[:, None, None]
    img.paste(Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8)), (vit[0], vit[1]))
    d = ImageDraw.Draw(img)
    _ret(d, (vit[0], my(0.5), vit[2], vit[3]), fill=(120, 84, 56))                      # balcão
    _ret(d, (vit[0], my(0.5), vit[2], my(0.5) + 6), fill=(210, 190, 160))
    for k in range(6):                                                                      # estufa e salgados
        _ret(d, (vit[0] + 40 + k * 90, my(0.95), vit[0] + 40 + k * 90 + 70, my(0.5)), fill=(248, 220, 150), outline=(130, 90, 40))
    for cx in (vit[0] + 190, vit[0] + 330):                                                 # fregueses de costas
        d.ellipse((cx - 17, my(1.45), cx + 17, my(1.45) + 34), fill=(60, 40, 38))
        _ret(d, (cx - 26, my(1.45) + 32, cx + 26, my(0.5)), fill=(52, 44, 66))
    d.line((vit[0] + (vit[2] - vit[0]) // 2, vit[1], vit[0] + (vit[2] - vit[0]) // 2, vit[3]), fill=(40, 32, 30), width=6)
    _ret(d, (xc, my(3.1), xd, my(2.1)), fill=(36, 14, 12))
    _neon(img, "PASTELARIA", (xc + xd) / 2, my(2.78), 82, (255, 176, 40), 1.0, largura_max=xd - xc - 90)
    _neon(img, "DONA CLARA", (xc + xd) / 2, my(2.35), 40, (255, 255, 230), 0.8, largura_max=xd - xc - 200)
    # entradas dos prédios dos lados
    for x0 in (-7.7, 3.1):
        a0, b0 = mx(x0), mx(x0 + 1.5)
        _ret(d, (a0, my(2.0), b0, chao_y), fill=(24, 22, 30), outline=(60, 54, 60), width=4)
        _ret(d, (a0 + 10, my(1.85), b0 - 10, my(0.3)), fill=(62, 90, 74))
        d.ellipse((b0 - 30, my(0.9), b0 - 18, my(0.9) + 12), fill=(210, 190, 90))
        d.ellipse((a0 + 6, my(2.5), b0 - 6, my(2.5) + 18), fill=(255, 224, 150))
    _ret(d, (0, chao_y - 3, w, h), fill=(36, 36, 44))   # calçada
    # a luz do poste lava a fachada (círculo quente, mais forte à esquerda do centro)
    a = np.asarray(img, np.float32)
    gy, gx = np.mgrid[0:h, 0:w].astype(np.float32)
    pole = np.exp(-(((gx - mx(-0.2)) / (w * 0.14)) ** 2 + ((gy - my(3.4)) / (h * 0.45)) ** 2))[:, :, None]
    a = a + pole * np.array([70, 48, 14], np.float32)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))


def rua_chao(w=1024, h=512, semente=64):
    """O chão da rua visto de cima (14 x 4,5 m, x de -8 a 6 e z de 3,5 a 8): calçada, meio-fio, asfalto molhado com o reflexo do neon e a poça de luz do poste."""
    r = np.random.default_rng(semente)
    rr = T.rng_de(semente)
    a = np.zeros((h, w, 3), np.float32) + np.array([16, 17, 21], np.float32)
    a *= (0.75 + 0.5 * T.ruido(h, w, 1.3, rng=rr))[:, :, None]
    zz = np.linspace(0, 1, h, dtype=np.float32)[:, None]     # 0 = calçada (perto da janela), 1 = fachada do outro lado
    calcada = (zz < 0.2).astype(np.float32)
    a = a * (1 - calcada[:, :, None]) + np.array([46, 44, 50], np.float32) * (0.8 + 0.4 * T.ruido(h, w, 1.5, rng=rr))[:, :, None] * calcada[:, :, None]
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    d.line((0, int(h * 0.2), w, int(h * 0.2)), fill=(88, 84, 84), width=5)            # meio-fio
    for k in range(0, w, 64):                                                            # juntas da calçada
        d.line((k, 0, k + 6, int(h * 0.2)), fill=(30, 30, 34), width=2)
    for k in range(9):                                                                   # faixa de pedestre
        d.rectangle((int(w * 0.55) + k * 34, int(h * 0.3), int(w * 0.55) + k * 34 + 20, int(h * 0.62)), fill=(150, 148, 140))
    d.ellipse((int(w * 0.18), int(h * 0.5), int(w * 0.18) + 46, int(h * 0.5) + 30), outline=(60, 60, 66), width=3)   # bueiro
    arr = np.asarray(img, np.float32)
    gy, gx = np.mgrid[0:h, 0:w].astype(np.float32)
    poste = np.exp(-(((gx - w * 0.5) / (w * 0.11)) ** 2 + ((gy - h * 0.2) / (h * 0.3)) ** 2))[:, :, None]
    arr = arr + poste * np.array([150, 105, 40], np.float32)
    for cx, cor in ((w * 0.5, (255, 176, 40)), (w * 0.28, (120, 255, 150)), (w * 0.12, (255, 60, 150))):   # reflexos compridos de neon no molhado
        faixa = np.exp(-((gx - cx) / (w * 0.012)) ** 2) * np.clip((gy / h - 0.25) * 2.0, 0, 1) * (0.5 + 0.5 * T.ruido(h, w, 1.2, aniso=(0.3, 1.0), rng=rr))
        arr = arr + faixa[:, :, None] * np.array(cor, np.float32) * 0.45
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def placa_hotel(w=256, h=640):
    """Placa de lâmina (perpendicular à fachada) do "Hotel Estrela": caixa escura com o texto vertical em neon rosa e azul."""
    img = Image.new("RGB", (w, h), (16, 10, 20))
    d = ImageDraw.Draw(img)
    d.rectangle((6, 6, w - 7, h - 7), outline=(60, 40, 70), width=6)
    for i, letra in enumerate("HOTEL"):
        _neon(img, letra, w / 2, 96 + i * 78, 54, (255, 60, 150), 0.95)
    S._estrela(d, w / 2, h - 118, 22, (120, 200, 255))
    _neon(img, "ESTRELA", w / 2, h - 42, 28, (130, 210, 255), 0.8, largura_max=w - 34)
    return img


def vidro_sujo(w=1024, h=1024, semente=65):
    """O vidro da janela em RGBA: quase transparente, com manchas de dedo, respingos secos de chuva escorridos e poeira nos cantos; o alfa é a sujeira (0,05 a 0,45)."""
    r = T.rng_de(semente)
    rng = np.random.default_rng(semente)
    suj = np.clip(0.04 + 0.05 * T.lisstep(0.5, 0.8, T.ruido(h, w, 2.2, rng=r)), 0, 1)
    gy, gx = np.mgrid[0:h, 0:w].astype(np.float32)
    pe = np.zeros((h, w), np.float32)
    m = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(m)
    for _ in range(46):   # escorridos verticais finos (gota seca)
        x0, y0 = rng.uniform(0, w), rng.uniform(0, h * 0.8)
        d.line((x0, y0, x0 + rng.uniform(-6, 6), y0 + rng.uniform(40, 260)), fill=int(rng.uniform(40, 110)), width=int(rng.uniform(2, 6)))
    for _ in range(24):   # dedos: oval com sulcos
        cx, cy = rng.uniform(0.1, 0.9) * w, rng.uniform(0.35, 0.85) * h
        d.ellipse((cx - 26, cy - 40, cx + 26, cy + 40), fill=int(rng.uniform(25, 60)))
    pe = np.asarray(m.filter(ImageFilter.GaussianBlur(3)), np.float32) / 255.0
    borda = np.minimum(np.minimum(gx, w - 1 - gx), np.minimum(gy, h - 1 - gy))
    cantos = np.exp(-borda / (0.07 * w)) * 0.18
    alfa = np.clip(suj + pe * 0.55 + cantos, 0.04, 0.5)
    cor = np.zeros((h, w, 3), np.float32) + np.array([172, 184, 178], np.float32)
    cor = cor * (1 - 0.35 * pe[:, :, None] - cantos[:, :, None])
    rgba = np.dstack([np.clip(cor, 0, 255), alfa * 255.0]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def poste_halo(n=256):
    """Brilho amarelo suave da luminária do poste (RGBA, alfa radial)."""
    gy, gx = np.mgrid[0:n, 0:n].astype(np.float32)
    d = np.sqrt(((gx - n / 2) / (n / 2)) ** 2 + ((gy - n / 2) / (n / 2)) ** 2)
    a = np.clip(1 - d, 0, 1) ** 2.2
    rgba = np.dstack([np.zeros((n, n), np.float32) + 255, np.zeros((n, n), np.float32) + 196, np.zeros((n, n), np.float32) + 96, a * 175]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def rua_plana(w=512, h=256):
    """O nível baixo: um quadro só da rua vista da janela (céu e prédios no alto, a fachada de baixo, o chão) como a composição das camadas."""
    fundo, fach, chao = rua_fundo(768, 269), rua_fachada(1024, 448), rua_chao(512, 256)
    img = fundo.resize((w, h), Image.LANCZOS)
    f = fach.crop((int(1024 * 0.27), int(448 * 0.12), int(1024 * 0.78), int(448 * 0.97))).resize((w, int(h * 0.78)), Image.LANCZOS)
    img.paste(f, (0, h - f.size[1]))
    return img


def gerar_janela(pasta, nivel, mestres=None):
    """A rua em camadas e o vidro sujo, no tamanho do nível (alto e médio); o baixo leva só a rua plana em `rua.jpg`."""
    import os
    base = os.path.join(pasta, nivel)
    os.makedirs(base, exist_ok=True)
    if nivel == "baixo":
        rua_plana(512, 256).save(os.path.join(base, "rua.jpg"), quality=88, optimize=True)
        return
    k = {"alto": 1.0, "medio": 0.5}[nivel]
    z = lambda im: im.resize((max(64, int(im.size[0] * k)), max(64, int(im.size[1] * k))), Image.LANCZOS) if k != 1.0 else im   # noqa: E731
    m = mestres or {}
    for nome, fn, ext in (("rua-fundo", rua_fundo, "jpg"), ("rua-fachada", rua_fachada, "jpg"), ("rua-chao", rua_chao, "jpg"), ("rua-placa", placa_hotel, "jpg"), ("poste-halo", poste_halo, "png"),
                          ("vidro-janela", vidro_sujo, "png")):
        im = m.get(nome) or fn()
        m[nome] = im
        im = z(im)
        if ext == "jpg":
            im.convert("RGB").save(os.path.join(base, nome + ".jpg"), quality=90, optimize=True, subsampling=0)
        else:
            im.save(os.path.join(base, nome + ".png"), optimize=True)
    return m
