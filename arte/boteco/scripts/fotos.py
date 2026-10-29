"""Baixa as fotos PBR CC0 do ambientCG (https://ambientcg.com, licença CC0 1.0) que o boteco usa, só o necessário, em 1024 px.

    uv run --with pillow --with numpy python3 fotos.py [pasta]      (padrão: ../fotos)

Para cada material grava `<id>/cor.jpg` (sRGB), `<id>/normal.jpg` (NormalGL, convenção do glTF) e `<id>/rug.jpg` (rugosidade) a partir do zip
`<id>_1K-JPG.zip`; quem já existe não é baixado de novo. A lista abaixo é o que o `cena.py` pede por papel; `LICENCAS.md` sai ao lado das fotos.
"""
import io
import os
import sys
import urllib.request
import zipfile

from PIL import Image

# papel no boteco -> id no ambientCG
FOTOS = {
    "azulejo": "Tiles040",         # azulejo branco antigo (o desenho das juntas; a sujeira vem do shader)
    "barrado": "Tiles100",         # azulejo português azul e branco
    "reboco": "PaintedPlaster003", # reboco pintado de verde com lascas
    "reboco-gasto": "PaintedPlaster010",  # reboco descascado com o tijolo à mostra (máscara de desgaste)
    "madeira": "Wood018",          # madeira escura e gasta do balcão
    "madeira-clara": "Wood013",    # madeira de estante e banqueta
    "forro": "PaintedWood006C",    # forro de madeira pintado de creme
    "formica": "Plastic007",       # fórmica vermelha da frente do balcão
    "aco": "CorrugatedSteel003",   # porta de aço de enrolar
}
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) sinuca-artista"}


def baixar(id_, pasta, tam=1024):
    alvo = os.path.join(pasta, id_)
    if all(os.path.exists(os.path.join(alvo, f)) for f in ("cor.jpg", "normal.jpg", "rug.jpg")):
        return
    os.makedirs(alvo, exist_ok=True)
    req = urllib.request.Request(f"https://ambientcg.com/get?file={id_}_1K-JPG.zip", headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        z = zipfile.ZipFile(io.BytesIO(r.read()))
    nomes = {"cor": "_Color.jpg", "normal": "_NormalGL.jpg", "rug": "_Roughness.jpg"}
    for chave, sufixo in nomes.items():
        membro = next(n for n in z.namelist() if n.endswith(sufixo))
        im = Image.open(io.BytesIO(z.read(membro)))
        im = im.convert("L" if chave == "rug" else "RGB")
        if im.size[0] != tam:
            im = im.resize((tam, tam), Image.LANCZOS)
        im.save(os.path.join(alvo, chave + ".jpg"), quality=90, optimize=True)


def main():
    pasta = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "fotos"))
    for papel, id_ in FOTOS.items():
        baixar(id_, pasta)
        print(papel, id_)
    with open(os.path.join(pasta, "LICENCAS.md"), "w") as f:
        f.write("# Fotos PBR do boteco (ambientCG, CC0 1.0)\n\nTodas de https://ambientcg.com (licença CC0 1.0, domínio público; sem obrigação de crédito, que está em `docs/creditos.md`).\n\n")
        for papel, id_ in FOTOS.items():
            f.write(f"- `{id_}`: {papel}. https://ambientcg.com/view?id={id_}\n")


if __name__ == "__main__":
    main()
