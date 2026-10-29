"""Prévia plana (sem Blender): as peças do taco deitadas, a ponta à esquerda, empilhadas em faixas de 1000 px no máximo.

`python3 plano_previa.py <saida.png> <arquivo.png:peca:s_lo:s_hi> ...` (s em mm da ponta; cada faixa recorta s_lo..s_hi da peça).
Serve para olhar a composição de uma skin numa imagem só, pequena, sem ler cada PNG de 2048 px.
"""
import os
import sys

from PIL import Image

import medidas as M

LARGURA = 1000


def faixa(arquivo, peca, s_lo, s_hi, largura=LARGURA):
    im = Image.open(arquivo).convert("RGB")
    # o PNG sai de cabeça para baixo (a ponta embaixo): girar 90° horário deita o taco com a ponta à esquerda
    im = im.rotate(-90, expand=True)
    de, ate = M.de(peca) * 1000.0, M.ate(peca) * 1000.0
    pxmm = im.width / (ate - de)
    x0 = int(round((max(s_lo, de) - de) * pxmm))
    x1 = int(round((min(s_hi, ate) - de) * pxmm))
    rec = im.crop((x0, 0, max(x1, x0 + 1), im.height))
    k = largura / rec.width
    return rec.resize((largura, max(int(round(rec.height * k)), 1)), Image.LANCZOS)


def main():
    saida = sys.argv[1]
    faixas = []
    for spec in sys.argv[2:]:
        partes = spec.split(":")
        arq, peca, lo, hi = partes[:4]
        faixas.append(faixa(arq, peca, float(lo), float(hi), int(partes[4]) if len(partes) > 4 else LARGURA))
    alt = sum(f.height for f in faixas) + 4 * (len(faixas) - 1)  # faixas mais estreitas que LARGURA ficam à esquerda
    folha = Image.new("RGB", (LARGURA, alt), (24, 24, 30))
    y = 0
    for f in faixas:
        folha.paste(f, (0, y))
        y += f.height + 4
    os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
    folha.save(saida)
    print(saida, folha.size)


if __name__ == "__main__":
    main()
