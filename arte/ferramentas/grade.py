"""Monta uma grade de imagens com legenda: grade.py saida.png colunas largura_da_celula arquivo[:legenda] ...  (Pillow)."""
import sys

from PIL import Image, ImageDraw, ImageFont

saida, colunas, larg = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
itens = [a.split(":", 1) if ":" in a else [a, ""] for a in sys.argv[4:]]
fonte = ImageFont.load_default(size=max(11, larg // 24))
celulas = []
for arq, legenda in itens:
    im = Image.open(arq).convert("RGB")
    alt = round(im.height * larg / im.width)
    celulas.append((im.resize((larg, alt), Image.LANCZOS), legenda))
alt = max(c[0].height for c in celulas)
linhas = (len(celulas) + colunas - 1) // colunas
folha = Image.new("RGB", (colunas * larg, linhas * alt), (6, 6, 8))
d = ImageDraw.Draw(folha)
for i, (im, legenda) in enumerate(celulas):
    x, y = (i % colunas) * larg, (i // colunas) * alt
    folha.paste(im, (x, y))
    if legenda:
        d.text((x + 6, y + 4), legenda, fill=(240, 232, 214), font=fonte, stroke_width=2, stroke_fill=(0, 0, 0))
folha.save(saida)
print(saida, folha.size)
