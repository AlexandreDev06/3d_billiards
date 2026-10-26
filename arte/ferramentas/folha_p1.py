"""Folha do P1 (1600×900, 6 quadros legendados): referência, L27 × Blender (ponte e punho), joinha e a versão baixa.

Uso: python3 arte/ferramentas/folha_p1.py .outros/lote-p1/folha.png
Depende das imagens geradas por `06_renders.py` (r3/cima, r3/baixa3) e pelo visor (`visor/joinha_*.png`).
"""
import sys

from PIL import Image, ImageDraw, ImageFont

RAIZ = "."
L27 = RAIZ + "/.outros/lote-27/ferramentas/"
P1 = RAIZ + "/.outros/lote-p1/"
FUNDO = (22, 22, 26)


def fonte(t):
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", t)


def abrir(caminho, caixa=None):
    im = Image.open(caminho).convert("RGB")
    return im.crop(caixa) if caixa else im


def ajustar(im, w, h):
    esc = min(w / im.width, h / im.height)
    return im.resize((max(1, int(im.width * esc)), max(1, int(im.height * esc))), Image.LANCZOS)


def centro(im, largura=400):
    """Recorte retrato no meio da imagem (as mãos ficam no centro dos renders e dos quadros do L27)."""
    x = (im.width - largura) // 2
    return im.crop((x, 0, x + largura, im.height))


def lado_a_lado(a, b, w, h, rotulos=("L27 (código)", "Blender")):
    """Duas imagens lado a lado na mesma altura, com rótulo pequeno em cada uma."""
    metade = (w - 6) // 2
    a, b = ajustar(a, metade, h), ajustar(b, metade, h)
    quadro = Image.new("RGB", (w, h), (12, 12, 15))
    d = ImageDraw.Draw(quadro)
    quadro.paste(a, (0, (h - a.height) // 2))
    quadro.paste(b, (metade + 6, (h - b.height) // 2))
    d.text((8, 6), rotulos[0], fill=(255, 220, 140), font=fonte(20))
    d.text((metade + 14, 6), rotulos[1], fill=(140, 210, 255), font=fonte(20))
    return quadro


def tira(imagens, w, h):
    q = Image.new("RGB", (w, h), (12, 12, 15))
    cw = w // len(imagens)
    for k, im in enumerate(imagens):
        im = ajustar(im, cw - 4, h)
        q.paste(im, (k * cw + (cw - im.width) // 2, (h - im.height) // 2))
    return q


def main():
    saida = sys.argv[1]
    W, H, LEG, ALT = 1600, 900, 22, 392
    folha = Image.new("RGB", (W, H), FUNDO)
    d = ImageDraw.Draw(folha)
    f = fonte(LEG)
    ponte = lado_a_lado(abrir(L27 + "ponte-otim.png", (650, 0, 1070, 440)), centro(abrir(P1 + "render/r3/cima/pose_ponte_v_cima.png"), 420), 780, ALT)
    punho = lado_a_lado(abrir(L27 + "punho-otim.png", (1420, 0, 1840, 440)), centro(abrir(P1 + "render/r3/cima/pose_punho_cima.png"), 420), 780, ALT)
    j1 = centro(abrir(P1 + "visor/joinha_a.png"), 420)
    j2 = centro(abrir(P1 + "visor/joinha_b.png"), 420)
    ref = abrir(RAIZ + "/arte/referencias/maos-cartoon-usuario.png")
    baixa = tira([centro(abrir(P1 + "render/r3/baixa3/pose_%s_cima.png" % p), 420) for p in ("repouso", "apontar", "punho")], 540, ALT)
    celulas = [
        (10, 0, ponte, "ponte V, de cima: L27 × Blender cartum"),
        (810, 0, punho, "punho, de cima: L27 × Blender cartum"),
        (10, 450, ajustar(j1, 384, ALT), "joinha 0,23 s: antecipação"),
        (404, 450, ajustar(j2, 384, ALT), "joinha 0,63 s: exagero"),
        (798, 450, ajustar(ref, 240, ALT), "referência do usuário"),
        (1048, 450, baixa, "versão baixa, 886 triângulos"),
    ]
    for x, y, im, leg in celulas:
        folha.paste(im, (x, y + 4))
        d.text((x + 2, y + 8 + im.height), leg, fill=(235, 235, 235), font=f)
    folha.save(saida)
    print(saida, folha.size)


main()
