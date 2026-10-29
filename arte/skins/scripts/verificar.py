"""Confere os PNGs de `arte/skins/exportados`: formato, tamanho, proporção com a peça, emenda em x, mapas emissivo/metal não vazios e os
matizes das skins pintadas (o Dragão das Quinze não podia ser verde e ouro; o Dragon Lore e o Howl, sim: só se mostra a distribuição).

`python3 verificar.py` (sem Blender). Sai com código 1 se algum teste falhar.
"""
import glob
import os
import sys

from PIL import Image

import especificacoes as E
import medidas as M

PECAS = {"haste", "antebraco", "punho", "base"}


def _diff_colunas(im, x0, x1, passo=3):
    a, b = [], []
    w, h = im.size
    for y in range(0, h, passo):
        p, q = im.getpixel((x0 % w, y)), im.getpixel((x1 % w, y))
        a.append(sum(abs(p[k] - q[k]) for k in range(3)) / 3)
    return sum(a) / len(a)


def _faixas_de_matiz(im):
    hsv = im.convert("HSV")
    dados = list(hsv.getdata())[::5]
    sel = [h * 360.0 / 255 for (h, s, v) in dados if s > 127 and v > 114]
    if not sel:
        return {}
    def f(a, b):
        return round(sum(1 for h in sel if a <= h < b) / len(sel), 2)
    return {"vermelho": round(f(0, 15) + f(345, 361), 2), "laranja": f(15, 35), "amarelo": f(35, 70), "verde": f(70, 170),
            "azul_ciano": f(170, 260), "roxo_magenta": f(260, 345)}


def main():
    pasta = E.EXPORTADOS
    falhas = 0
    linhas = []
    for caminho in sorted(glob.glob(os.path.join(pasta, "*.png"))):
        nome = os.path.basename(caminho)[:-4]
        peca = next((p for p in PECAS if f"-{p}" in nome), None)
        with Image.open(caminho) as im:
            modo, tam = im.mode, im.size
            im = im.convert("RGB")
            lado = max(tam)
            ok_formato = modo == "RGB" and lado <= 2048
            m = M.medidas_da_peca(peca)
            prop = (tam[0] / tam[1]) / (m["circunferencia_mm"] / m["comprimento_mm"])
            ok_prop = 0.97 <= prop <= 1.03
            costura = _diff_colunas(im, 0, tam[0] - 1)
            vizinha = max(_diff_colunas(im, 100, 101), 1.0)
            ok_costura = costura <= vizinha * 2.0 + 1.5
            extra = ""
            if nome.startswith(("dragao-", "dragon-lore-", "howl-")) and not nome.endswith(("emissivo", "metal")):
                faixas = _faixas_de_matiz(im)
                extra = f" matizes={faixas}"
            ok_conteudo = True
            if nome.endswith(("emissivo", "metal")):
                topo = max(e[1] for e in im.getextrema())
                ok_conteudo = topo >= 10
                extra += f" brilho_max={topo}"
            ok = ok_formato and ok_prop and ok_costura and ok_conteudo
            falhas += 0 if ok else 1
            linhas.append(f"{'ok ' if ok else 'ERRO'} {nome:34s} {modo} {tam[0]}x{tam[1]} proporcao={prop:.3f} costura={costura:.1f} (vizinhas {vizinha:.1f}){extra}")
    print("\n".join(linhas))
    print(f"\n{len(linhas)} PNGs, {falhas} com problema")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
