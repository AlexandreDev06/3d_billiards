"""Folha do L29 (1600×900): as cinco pontes novas na câmera do jogo e a tira dos sete gestos no quadro de pico, todas do visor three.js.

Uso: python3 arte/ferramentas/folha_l29.py .outros/lote-29/folha-artista.png
Depende dos quadros do visor em `.outros/lote-29/artista/visor/` (`f_ponte_*.png`, 320×420, e `f_<gesto>.png`, 228×420: o clipe do `mao.glb`
tocado com fade de 0,2 s a partir da `pose_repouso`, parado no quadro de pico) e de `arte/personagens/exportados/mao-taco.json` (as legendas).
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

RAIZ = "."
VISOR = RAIZ + "/.outros/lote-29/artista/visor/"
TACO = json.load(open(RAIZ + "/arte/personagens/exportados/mao-taco.json"))
FUNDO, TEXTO, DESTAQUE = (22, 22, 26), (217, 210, 196), (255, 220, 140)
NOMES_DEDOS = {"indicador": "ind", "medio": "méd", "anelar": "ane", "minimo": "mín", "polegar": "pol", "cuff": "punho"}


def fonte(t, negrito=False):
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % ("-Bold" if negrito else ""), t)


def legenda(im, titulo, linhas, larg):
    """Título no canto de cima e as linhas de dados embaixo, sobre faixa escura."""
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, larg, 26), fill=(12, 12, 15))
    d.text((6, 3), titulo, fill=DESTAQUE, font=fonte(16, True))
    y = im.height - 18 * len(linhas) - 6
    d.rectangle((0, y - 2, larg, im.height), fill=(12, 12, 15))
    for k, t in enumerate(linhas):
        d.text((6, y + 18 * k), t, fill=TEXTO, font=fonte(12))


def ponte(nome):
    d = TACO["pose_ponte_" + nome]
    a = d["apoio"]
    z = a["ponto_m"][2] * 1000
    elev = d["elevacao_do_taco_graus"]
    toca = " ".join(NOMES_DEDOS.get(x, x) for x in a["toca"])
    return ["%s z %+.1f mm · taco %+.1f°" % (a["tipo"], z, elev), "toca: " + toca]


PONTES = [("laco", "ponte laço"), ("elevada", "ponte elevada"), ("tabela", "ponte tabela"), ("colada", "ponte colada"), ("canto", "ponte canto")]
GESTOS = [("soco", "soco_ar", ["pico q13", "repique q25"]), ("tapinha", "tapinha", ["contato q11 e q20", "plano z (martelo)"]),
          ("quase", "quase", ["pico q9", "treme até q18"]), ("palmas", "palmas", ["contato q8 q16 q24", "plano x, normal −X"]),
          ("tamborilar", "tamborilar", ["toques q10 13 16 19", "ciclo 0–24"]), ("mole", "mole", ["fundo q13", "fica balançando"]),
          ("respirar", "respirar", ["aditivo, pico q52", "ciclo 3 s (somado)"])]


def main():
    saida = sys.argv[1]
    folha = Image.new("RGB", (1600, 900), FUNDO)
    x = 0
    for chave, titulo in PONTES:
        im = Image.open(VISOR + "f_ponte_%s.png" % chave).convert("RGB")
        legenda(im, titulo, ponte(chave), im.width)
        folha.paste(im, (x, 0))
        x += im.width
    x = 0
    for chave, titulo, linhas in GESTOS:
        im = Image.open(VISOR + "f_%s.png" % chave).convert("RGB")
        legenda(im, titulo, linhas, im.width)
        folha.paste(im, (x, 440))
        x += im.width
    d = ImageDraw.Draw(folha)
    d.text((8, 868), "L29 artista · mao.glb no three.js: pontes na câmera do jogo (45°, taco de 6 mm na ponta); gestos no quadro de pico depois do fade a partir da pose_repouso",
           fill=TEXTO, font=fonte(14))
    folha.save(saida)
    print(saida, folha.size)


main()
