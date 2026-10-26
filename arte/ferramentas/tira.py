"""Tira de quadros legendados (Pillow): `tira.py saida.png colunas "legenda=arquivo.png" ...` (a legenda vai no canto de cada quadro)."""
import sys

from PIL import Image, ImageDraw, ImageFont


def main():
    saida, cols = sys.argv[1], int(sys.argv[2])
    itens = [a.split("=", 1) for a in sys.argv[3:]]
    ims = [(r, Image.open(f).convert("RGB")) for r, f in itens]
    w, h = ims[0][1].size
    lin = (len(ims) + cols - 1) // cols
    folha = Image.new("RGB", (w * cols, h * lin), (20, 20, 24))
    fonte = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", max(12, w // 22))
    for i, (r, im) in enumerate(ims):
        x, y = (i % cols) * w, (i // cols) * h
        folha.paste(im, (x, y))
        d = ImageDraw.Draw(folha)
        d.rectangle((x, y, x + 12 + len(r) * max(8, w // 28), y + max(18, w // 17)), fill=(12, 12, 15))
        d.text((x + 4, y + 1), r, fill=(255, 220, 140), font=fonte)
    folha.save(saida)


main()
