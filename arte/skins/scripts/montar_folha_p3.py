"""Monta `folha.png` (1600×900) do P3: o taco inteiro de Dragon Lore e Howl (normal e rara) e um detalhe de perto de cada um.

Roda fora do Blender (Pillow), depois de `folha.py` ter gravado `<skin>[-raro]-inteiro.png` e `<skin>-detalhe.png` / `-detalhe2.png`:
`python3 montar_folha_p3.py <pasta_das_previas> <saida.png>`. Só desenhos nossos: nenhuma imagem de referência entra na folha.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

LARGURA, ALTURA = 1600, 900
FUNDO = (20, 20, 26)
RECORTE = 520
TIRAS = (
    ("dragon-lore", "Dragon Lore", "dragão de nós celta, chama de vitral"),
    ("dragon-lore-raro", "Dragon Lore rara: Esmeralda", "verde e ouro"),
    ("howl", "Howl", "lobo uivando, vermelho, laranja e preto"),
    ("howl-raro", "Howl raro: Lobo da Geada", "azul-gelo e branco"),
)
PAINEIS = (
    ("dragon-lore-detalhe", "Dragon Lore", "cabeça, asas e o começo da chama"),
    ("dragon-lore-detalhe2", "Dragon Lore", "patas e cauda em nó de ouro, no cabo"),
    ("howl-detalhe", "Howl", "o lobo uivando, olho aceso"),
    ("howl-detalhe2", "Howl", "o pelame do punho, olhos na sombra"),
)


def fonte(tam, negrito=False):
    nome = "DejaVuSans-Bold.ttf" if negrito else "DejaVuSans.ttf"
    for caminho in (nome, f"/usr/share/fonts/truetype/dejavu/{nome}"):
        try:
            return ImageFont.truetype(caminho, tam)
        except OSError:
            pass
    return ImageFont.load_default()


def main(pasta, saida):
    folha = Image.new("RGB", (LARGURA, ALTURA), FUNDO)
    d = ImageDraw.Draw(folha)
    f_nome, f_peq = fonte(14, True), fonte(11)
    d.text((10, 6), "P3 · Dragon Lore e Howl — desenhos nossos. Taco inteiro (acima, normal e rara) e detalhe de perto (abaixo); Blender, Cycles, luz da mesa", font=f_peq, fill=(210, 210, 220))
    tira_w = LARGURA - 20
    y = 24
    for chave, nome, legenda in TIRAS:
        im = Image.open(os.path.join(pasta, f"{chave}-inteiro.png")).convert("RGB")
        h = int(round(im.height * tira_w / im.width))
        folha.paste(im.resize((tira_w, h), Image.LANCZOS), (10, y))
        d.text((16, y + 2), f"{nome} — {legenda}", font=f_nome, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))
        y += h + 4
    topo = y + 4
    pw, ph = (LARGURA - 20 - 3 * 8) // 4, ALTURA - topo - 8
    for k, (chave, nome, legenda) in enumerate(PAINEIS):
        im = Image.open(os.path.join(pasta, f"{chave}.png")).convert("RGB")
        cw = min(im.width, RECORTE)
        ch = int(cw * ph / pw)
        x0 = (im.width - cw) // 2
        y0 = max(0, (im.height - ch) // 2)
        painel = im.crop((x0, y0, x0 + cw, min(y0 + ch, im.height))).resize((pw, ph), Image.LANCZOS)
        x = 10 + k * (pw + 8)
        folha.paste(painel, (x, topo))
        d.rectangle((x, topo, x + pw, topo + 34), fill=(0, 0, 0))
        d.text((x + 6, topo + 3), nome, font=f_nome, fill=(255, 255, 255))
        d.text((x + 6, topo + 19), legenda, font=f_peq, fill=(200, 200, 210))
    os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
    folha.save(saida)
    print(saida, folha.size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
