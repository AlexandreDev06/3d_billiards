"""Folha do balão (1600×900): as seis caras, três quadros de duas ações, o balão na câmera do jogo, um quadro do visor three.js e o balão de hoje.

Uso: python3 arte/ferramentas/folha_balao.py .outros/lote-p1/folha-balao.png
Depende dos renders de `04_renders.py` em `.outros/lote-p1/render/c3` e do quadro do visor em `.outros/lote-p1/visor-c/visor_jogo.png`
(arte/ferramentas/captura_visor.sh). O balão de hoje (feito por código) vem de `.outros/lote-24/web-balao-media-vez-do-outro-azul.png`.
"""
import sys

from PIL import Image, ImageDraw, ImageFont

RAIZ = "."
R = RAIZ + "/.outros/lote-p1/render/c3/"
VISOR = RAIZ + "/.outros/lote-p1/visor-c/visor_jogo.png"
HOJE = RAIZ + "/.outros/lote-24/web-balao-media-vez-do-outro-azul.png"
FUNDO = (22, 22, 26)


def fonte(t):
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", t)


def celula(im, rotulo, w, h, caixa=None, cor=(140, 210, 255)):
    im = im.convert("RGB")
    if caixa:
        im = im.crop(caixa)
    esc = max(w / im.width, h / im.height)
    im = im.resize((max(1, int(im.width * esc)), max(1, int(im.height * esc))), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    q = im.crop((x, y, x + w, y + h))
    d = ImageDraw.Draw(q)
    d.rectangle((0, 0, 10 + 11 * len(rotulo), 24), fill=(12, 12, 15))
    d.text((5, 2), rotulo, fill=cor, font=fonte(16))
    return q


def main():
    saida = sys.argv[1]
    W, H = 1600, 900
    folha = Image.new("RGB", (W, H), FUNDO)
    cw = 266
    caras = ["cara_neutro", "cara_sorriso", "cara_susto", "cara_bravo", "cara_triste", "piscar"]
    for i, n in enumerate(caras):
        im = Image.open(R + n + "_rosto.png")
        folha.paste(celula(im, n, cw, 266, caixa=(40, 30, 480, 470)), (i * (cw + 1), 0))
    y = 270
    for i, (ac, qs) in enumerate((("balao_pulinho", (4, 13, 21)), ("balao_murchar", (0, 30, 84)))):
        for j, q in enumerate(qs):
            im = Image.open(R + "%s_q%03d_corpo.png" % (ac, q))
            folha.paste(celula(im, "%s q%d" % (ac.replace("balao_", ""), q), cw, 300, cor=(255, 220, 140)), ((i * 3 + j) * (cw + 1), y))
    y = 574
    jogo = Image.open(R + "cara_sorriso_jogo.png")
    folha.paste(celula(jogo, "câmera do jogo", 533, 300, caixa=(373, 190, 906, 490)), (0, y))
    visor = Image.open(VISOR)
    folha.paste(celula(visor, "visor three.js", 533, 300, caixa=(373, 250, 906, 550), cor=(170, 240, 170)), (534, y))
    hoje = Image.open(HOJE)
    folha.paste(celula(hoje, "hoje (por código)", 533, 300, caixa=(720, 360, 1020, 529), cor=(190, 190, 200)), (1068, y))
    folha.save(saida)
    print(saida, folha.size)


main()
