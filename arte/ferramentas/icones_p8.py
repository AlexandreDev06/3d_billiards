"""Os 25 ícones da loja (P8): `arte/personagens/exportados/icones/<id>.png`, 256x256 com fundo transparente.

- 8 chapéus e 5 bigodes: o item no balão neutro em cinza claro (a cabeça e o rosto de perto);
- 4 estilos de olho: o olho de perto (em recorte redondo);
- 8 cores de olho: uma íris de perto, no `olho_normal` (em recorte redondo).

Filma o visor (`arte/visor/balao.html`) a 512x512 com luz de estúdio e fundo transparente (`filmar_visor.mjs`) e reduz para 256x256 (suaviza as bordas).
Pré-requisito: python3 -m http.server 8731 --bind 127.0.0.1 na raiz do repositório (nunca a 8001).
Uso: python3 arte/ferramentas/icones_p8.py [--glb=/arte/personagens/exportados/balao.glb] [--chapeus=/arte/personagens/exportados/chapeus.glb] [--saida=arte/personagens/exportados/icones] [--so=id1,id2]
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageChops, ImageDraw

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FILMAR = os.path.join(RAIZ, "arte", "ferramentas", "filmar_visor.mjs")
args = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else True) for a in sys.argv[1:] if a.startswith("--")}
GLB = args.get("--glb", "/arte/personagens/exportados/balao.glb")
CHAPEUS = args.get("--chapeus", "/arte/personagens/exportados/chapeus.glb")
SAIDA = os.path.join(RAIZ, args.get("--saida", "arte/personagens/exportados/icones"))
SO = args["--so"].split(",") if "--so" in args else None
CINZA = "b9bfc9"
FRENTE = [0, 0.011, 0.6]
TAM = 512

CHAPEUS_IDS = ["chapeu_panama", "bone_aba_reta", "cartola", "gorro_pompom", "chapeu_palha", "boina", "chapeu_festa", "coroa"]
BIGODES_IDS = ["bigode_fino", "bigodao", "bigode_guidao", "bigode_dali", "bigode_chevron"]
ESTILOS_IDS = ["olho_normal", "olho_kawaii", "olho_bravo", "olho_cansado"]
CORES_IDS = ["castanho", "mel", "verde", "azul", "cinza", "violeta", "vermelho", "dourado"]

# (id, recorte redondo?, passo do visor)
ICONES = []
TOPO_DA_CABECA = 0.066           # m: onde a `ancora_chapeu` fica
ABAIXO_DOS_OLHOS = -0.018        # m: o enquadramento dos chapéus vai até abaixo dos olhos (a vista é de cima e um pouco de lado)


def altura_do_chapeu(i):
    """O quanto o chapéu sobe acima da âncora (m), lido do `chapeus-meta.json` que está ao lado do `chapeus.glb`."""
    meta = os.path.join(RAIZ, CHAPEUS.lstrip("/").replace("chapeus.glb", "chapeus-meta.json"))
    return json.load(open(meta))["chapeus"][i]["alta"]["caixa_cm"]["y_sobe"][1] / 100.0


def enquadrar_chapeu(i):
    """(distância, alvo y) da vista `icone` (lente de 60 mm: meia altura = 0,3 x distância) para o chapéu e a parte de cima do rosto caberem."""
    topo = TOPO_DA_CABECA + altura_do_chapeu(i) + 0.010
    meia = max((topo - ABAIXO_DOS_OLHOS) / 2, 0.062)
    return round(meia / 0.3, 3), round((topo + ABAIXO_DOS_OLHOS) / 2, 4)


for i in CHAPEUS_IDS:
    d, y = enquadrar_chapeu(i)
    ICONES.append((i, False, {"cam": "icone", "dist": d, "alvoy": y, "chapeu": i, "cara": "cara_neutro", "cor": CINZA, "olhar": FRENTE}))
for i in BIGODES_IDS:
    ICONES.append((i, False, {"cam": "rosto", "dist": 0.125, "alvoy": 0.0, "bigode": i, "cara": "cara_neutro", "cor": CINZA, "olhar": FRENTE}))
for i in ESTILOS_IDS:
    ICONES.append((i, True, {"cam": "olho", "dist": 0.064, "alvoy": 0.0158, "olhos": i, "cara": "cara_neutro", "cor": CINZA, "olhar": FRENTE}))
for i in CORES_IDS:
    ICONES.append((i, True, {"cam": "olho", "dist": 0.048, "alvoy": 0.0135, "olhos": "olho_normal", "cor_olho": i, "cara": "cara_neutro", "cor": CINZA, "olhar": FRENTE}))


def recorte_redondo(im):
    """Deixa só um círculo (borda suave) e apaga o resto: o ícone vira um medalhão sobre o fundo transparente."""
    maior = im.size[0] * 4
    mascara = Image.new("L", (maior, maior), 0)
    ImageDraw.Draw(mascara).ellipse((maior * 0.03, maior * 0.03, maior * 0.97, maior * 0.97), fill=255)
    mascara = mascara.resize(im.size, Image.LANCZOS)
    saida = im.copy()
    saida.putalpha(ImageChops.multiply(im.getchannel("A"), mascara))
    return saida


def main():
    alvo = [(i, r, p) for i, r, p in ICONES if SO is None or i in SO]
    tmp = tempfile.mkdtemp(prefix="icones-p8-", dir=os.path.join(RAIZ, ".outros"))
    try:
        arq = os.path.join(tmp, "trabalhos.json")
        json.dump([{"arquivo": i + ".png", "passo": p} for i, _, p in alvo], open(arq, "w"))
        r = subprocess.run(["node", FILMAR, arq, tmp, "%dx%d" % (TAM, TAM),
                            "glb=%s&chapeus=%s&lod=alta&fundo=transparente&luz=estudio&cam=rosto" % (GLB, CHAPEUS)], capture_output=True, text=True)
        print(r.stdout.strip(), r.stderr.strip())
        if r.returncode:
            sys.exit(r.returncode)
        os.makedirs(SAIDA, exist_ok=True)
        for i, redondo, _ in alvo:
            im = Image.open(os.path.join(tmp, i + ".png")).convert("RGBA")
            if redondo:
                im = recorte_redondo(im)
            im = im.resize((256, 256), Image.LANCZOS)
            im.save(os.path.join(SAIDA, i + ".png"), optimize=True)
        print("%d ícones em %s" % (len(alvo), SAIDA))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
