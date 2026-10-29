"""Monta `folha.png` (1600×900): o taco inteiro das quatro skins em tiras e um detalhe de perto de cada uma.

Roda fora do Blender (Pillow), depois de `folha.py` ter gravado `<skin>-inteiro.png` e `<skin>-detalhe.png`:
`python3 montar_folha.py <pasta_das_previas> <saida.png>`
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

LARGURA, ALTURA = 1600, 900
FUNDO = (20, 20, 26)
RECORTE = 520  # largura (px da foto de 800) que o painel mostra: o taco é fino, então se aproxima
SKINS = (
    ("coral", "Coral", "cobra-coral só no antebraço"),
    ("bicho-solto", "Bicho Solto", "mosaico de bichos, haste + antebraço"),
    ("corujao", "Corujão", "coruja da madrugada, olhos acesos"),
    ("dragao", "Dragão das Quinze", "15 bolas em escamas, giz soprado"),
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
    f_nome, f_peq = fonte(15, True), fonte(11)
    d.text((10, 6), "P2 · skins de taco do Pincel — taco inteiro (acima) e detalhe de perto (abaixo), renderizados no Blender com a luz da mesa", font=f_peq, fill=(210, 210, 220))

    # tiras do taco inteiro: a ponta à esquerda
    tira_w = LARGURA - 20
    y = 26
    for chave, nome, _ in SKINS:
        im = Image.open(os.path.join(pasta, f"{chave}-inteiro.png")).convert("RGB")
        h = int(round(im.height * tira_w / im.width))
        folha.paste(im.resize((tira_w, h), Image.LANCZOS), (10, y))
        d.text((16, y + 2), nome, font=f_nome, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))
        y += h + 5

    # detalhes: quatro painéis lado a lado, recortando o miolo da foto (o taco é fino)
    topo = y + 6
    pw, ph = (LARGURA - 20 - 3 * 8) // 4, ALTURA - topo - 10
    for k, (chave, nome, legenda) in enumerate(SKINS):
        im = Image.open(os.path.join(pasta, f"{chave}-detalhe.png")).convert("RGB")
        # recorte com a proporção do painel, centrado no taco
        cw = min(im.width, RECORTE)
        ch = int(cw * ph / pw)
        x0 = (im.width - cw) // 2
        y0 = max(0, (im.height - ch) // 2)
        painel = im.crop((x0, y0, x0 + cw, y0 + ch)).resize((pw, ph), Image.LANCZOS)
        x = 10 + k * (pw + 8)
        folha.paste(painel, (x, topo))
        d.rectangle((x, topo, x + pw, topo + 36), fill=(0, 0, 0))
        d.text((x + 6, topo + 3), nome, font=f_nome, fill=(255, 255, 255))
        d.text((x + 6, topo + 21), legenda, font=f_peq, fill=(200, 200, 210))
    os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
    folha.save(saida)
    print(saida, folha.size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
