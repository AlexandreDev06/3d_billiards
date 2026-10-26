"""Monta uma folha de imagens legendadas (para a revisão visual), de até 1600×900.

Uso: python3 arte/ferramentas/montar_folha.py saida.png --colunas 3 [--largura 1600 --altura 900]
         "legenda 1=imagem1.png" "legenda 2=imagem2.png" ...
"""
import argparse
import sys

from PIL import Image, ImageDraw, ImageFont

FUNDO = (22, 22, 26)


def fonte(tam):
    for nome in ("DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(nome, tam)
        except OSError:
            pass
    return ImageFont.load_default()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("saida")
    p.add_argument("itens", nargs="+", help='"legenda=arquivo.png"')
    p.add_argument("--colunas", type=int, default=3)
    p.add_argument("--largura", type=int, default=1600)
    p.add_argument("--altura", type=int, default=900)
    p.add_argument("--legenda", type=int, default=22)
    a = p.parse_args()
    itens = [i.split("=", 1) for i in a.itens]
    linhas = -(-len(itens) // a.colunas)
    cw, ch = a.largura // a.colunas, a.altura // linhas
    folha = Image.new("RGB", (a.largura, a.altura), FUNDO)
    d = ImageDraw.Draw(folha)
    f = fonte(a.legenda)
    for k, (leg, arq) in enumerate(itens):
        im = Image.open(arq).convert("RGB")
        area_h = ch - a.legenda - 14
        esc = min((cw - 8) / im.width, area_h / im.height)
        im = im.resize((int(im.width * esc), int(im.height * esc)), Image.LANCZOS)
        x0, y0 = (k % a.colunas) * cw, (k // a.colunas) * ch
        folha.paste(im, (x0 + (cw - im.width) // 2, y0 + 4))
        d.text((x0 + 10, y0 + 4 + im.height + 4), leg, fill=(235, 235, 235), font=f)
    folha.save(a.saida)
    print(a.saida, folha.size)


if __name__ == "__main__":
    sys.exit(main())
