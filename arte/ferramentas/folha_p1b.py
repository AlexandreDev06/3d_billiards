"""Folha do P1b (1600×900): L27, P1 e P1b lado a lado, nas mesmas vistas, para ponte, punho e pinça.

Uso: python3 arte/ferramentas/folha_p1b.py .outros/lote-p1/folha-b.png
Depende dos renders de `06_renders.py` em `.outros/lote-p1/render/b3` (P1b) e `.../p1d` (P1, a partir de `mao-p1.blend`),
das folhas do L27 (`.outros/lote-27/ferramentas`, `.outros/lote-27b`).
Colunas: [de cima: L27 | P1 | P1b] [câmera do jogo: L27 | P1 | P1b]; linhas: ponte, punho, pinça.
"""
import sys

from PIL import Image, ImageDraw, ImageFont

RAIZ = "."
L27 = RAIZ + "/.outros/lote-27/ferramentas/"
L27B = RAIZ + "/.outros/lote-27b/"
P1B = RAIZ + "/.outros/lote-p1/render/b3/"
P1 = RAIZ + "/.outros/lote-p1/render/p1d/"
FUNDO = (22, 22, 26)
COR = {"L27": (255, 220, 140), "P1": (190, 190, 200), "P1b": (140, 210, 255)}


def fonte(t):
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", t)


def abrir(caminho, caixa=None):
    im = Image.open(caminho).convert("RGB")
    return im.crop(caixa) if caixa else im


def celula(im, rotulo, w, h, caber=False):
    """Imagem ajustada a w×h (cobrindo, centrada; `caber` inteira, com fundo escuro) com o rótulo no canto."""
    esc = (min if caber else max)(w / im.width, h / im.height)
    im = im.resize((max(1, int(im.width * esc)), max(1, int(im.height * esc))), Image.LANCZOS)
    if caber:
        q = Image.new("RGB", (w, h), (12, 12, 15))
        q.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    else:
        x, y = (im.width - w) // 2, (im.height - h) // 2
        q = im.crop((x, y, x + w, y + h))
    d = ImageDraw.Draw(q)
    d.rectangle((0, 0, 8 + 13 * len(rotulo), 24), fill=(12, 12, 15))
    d.text((5, 1), rotulo, fill=COR[rotulo], font=fonte(18))
    return q


def main():
    saida = sys.argv[1]
    W, H = 1600, 900
    folha = Image.new("RGB", (W, H), FUNDO)
    d = ImageDraw.Draw(folha)
    f = fonte(20)
    cw, ch, folga, alt_leg = 262, 262, 4, 26
    # (legenda, vista do P1/P1b, recorte do L27 de cima, recorte do L27 do jogo)
    linhas = [
        ("ponte V", "cima", "jogo_ponte", (L27 + "ponte-otim.png", (650, 0, 1070, 440)),
         (L27B + "web-folha-2-perto-da-tabela.png", (470, 430, 710, 670))),
        ("punho", "cima", "jogo_punho", (L27 + "punho-otim.png", (1420, 0, 1840, 440)),
         (L27B + "web-folha-2-perto-da-tabela.png", (430, 600, 760, 720))),
        ("pinça", "frente_baixo", "tres_quartos", (L27 + "pinca-otim.png", (0, 0, 640, 440)),
         (L27 + "pinca-otim.png", (1280, 440, 1920, 880))),
    ]
    nomes = {"ponte V": "pose_ponte_v", "punho": "pose_punho", "pinça": "pose_pinca"}
    y = 4
    for leg, vista_a, vista_b, l27_a, l27_b in linhas:
        pose = nomes[leg]
        grupos = (
            (0, vista_a, l27_a, "de cima" if vista_a == "cima" else "de baixo, pela frente"),
            (3, vista_b, l27_b, "câmera do jogo" if vista_b.startswith("jogo") else "três quartos"),
        )
        for col0, vista, (arq, caixa), descr in grupos:
            for k, (rot, origem) in enumerate((("L27", None), ("P1", P1), ("P1b", P1B))):
                if origem is None:
                    im = abrir(arq, caixa)
                else:
                    sufixo = "_q0" if origem == P1 else ""
                    im = abrir("%s%s%s_%s.png" % (origem, pose, sufixo, vista))
                x = 6 + (col0 + k) * (cw + folga + 2)
                folha.paste(celula(im, rot, cw, ch, caber=origem is None and leg == "punho" and col0 == 3), (x, y))
            d.text((6 + col0 * (cw + folga + 2), y + ch + 2), "%s, %s" % (leg, descr), fill=(235, 235, 235), font=f)
        y += ch + alt_leg + 14
    folha.save(saida)
    print(saida, folha.size)


main()
