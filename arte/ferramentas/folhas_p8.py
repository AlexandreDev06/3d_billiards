"""As quatro folhas de prova do P8 (cada uma até 1600x900, balão azul e laranja), filmando o visor (`arte/visor/balao.html`) pelo protocolo DevTools:

  folha-chapeus.png   os 8 chapéus de frente (azul) e a 3/4 (laranja), mais dois no pico de um pulo (a regra de escala em ação)
  folha-bigodes.png   os 5 bigodes com neutro, rindo, susto e bravo
  folha-olhos.png     os 4 estilos com 3 cores de olho: neutro, piscar a meio, rindo e olhando para baixo
  folha-combos.png    6 combinações completas na câmera do jogo a 1,5 m (pixels do jogo, ampliados 2x) e duas no nível baixo

Pré-requisito: python3 -m http.server 8731 --bind 127.0.0.1 na raiz do repositório (nunca a 8001).
Uso: python3 arte/ferramentas/folhas_p8.py [--glb=/arte/personagens/exportados/balao.glb] [--chapeus=/arte/personagens/exportados/chapeus.glb]
                                           [--saida=.outros/lote-p8] [--so=chapeus,bigodes,olhos,combos]
"""
import json
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FILMAR = os.path.join(RAIZ, "arte", "ferramentas", "filmar_visor.mjs")
args = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else True) for a in sys.argv[1:] if a.startswith("--")}
GLB = args.get("--glb", "/arte/personagens/exportados/balao.glb")
CHAPEUS = args.get("--chapeus", "/arte/personagens/exportados/chapeus.glb")
SAIDA = os.path.join(RAIZ, args.get("--saida", ".outros/lote-p8"))
SO = args["--so"].split(",") if "--so" in args else ["chapeus", "bigodes", "olhos", "combos"]
TMP = os.path.join(SAIDA, "tmp-folhas")
AZUL, LARANJA = "3aa0ff", "ff8a1f"
FRENTE = [0, 0.011, 0.6]
BAIXO = [0, -0.38, 0.5]
PARADO = {"acao": "balao_parado", "t": 0}
FUNDO = (22, 22, 26)

HATS = [("chapeu_panama", "panamá"), ("bone_aba_reta", "boné aba reta"), ("cartola", "cartola"), ("gorro_pompom", "gorro de pompom"),
        ("chapeu_palha", "chapéu de palha"), ("boina", "boina"), ("chapeu_festa", "chapéu de festa"), ("coroa", "coroa")]
BIGS = [("bigode_fino", "fino"), ("bigodao", "bigodão"), ("bigode_guidao", "guidão"), ("bigode_dali", "Dalí"), ("bigode_chevron", "chevron")]


def fonte(tam):
    for nome in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVuSans.ttf"):
        try:
            return ImageFont.truetype(nome, tam)
        except OSError:
            pass
    return ImageFont.load_default()


def filmar(trabalhos, tam, query=""):
    """Filma os trabalhos [(arquivo, passo)] e devolve a pasta com os PNGs."""
    os.makedirs(TMP, exist_ok=True)
    arq = os.path.join(TMP, "trabalhos.json")
    json.dump([{"arquivo": a, "passo": p} for a, p in trabalhos], open(arq, "w"))
    r = subprocess.run(["node", FILMAR, arq, TMP, tam, "glb=%s&chapeus=%s&%s" % (GLB, CHAPEUS, query)], capture_output=True, text=True)
    print(r.stdout.strip(), r.stderr.strip())
    if r.returncode:
        sys.exit(r.returncode)
    return TMP


def legenda(folha, x, y, texto, tam=15, largura=None):
    d = ImageDraw.Draw(folha)
    d.text((x, y), texto, fill=(235, 235, 235), font=fonte(tam))


def colar(folha, caminho, x, y, tam):
    im = Image.open(caminho).convert("RGB")
    if im.size != tam:
        im = im.resize(tam, Image.LANCZOS)
    folha.paste(im, (x, y))


def folha_chapeus():
    trab = []
    for i, _ in HATS:
        trab.append(("f_%s.png" % i, {"cam": "cabeca", "chapeu": i, "cara": "cara_neutro", "cor": AZUL, "olhar": FRENTE, **PARADO}))
    for i, _ in HATS:
        trab.append(("t_%s.png" % i, {"cam": "cabeca34", "chapeu": i, "cara": "cara_neutro", "cor": LARANJA, "olhar": FRENTE, **PARADO}))
    # no pico do pulo (a âncora sobe a 13 cm e a 15 cm; o balão estica e amassa): o chapéu acompanha pela regra do meta
    trab.append(("p_cartola.png", {"cam": "cabeca", "dist": 0.44, "alvoy": 0.115, "chapeu": "cartola", "acao": "balao_comemorar", "t": 0.533, "cara": "cara_comemorando", "cor": LARANJA, "olhar": FRENTE}))
    trab.append(("p_palha.png", {"cam": "cabeca", "dist": 0.40, "alvoy": 0.10, "chapeu": "chapeu_palha", "acao": "balao_pulinho", "t": 0.467, "cara": "cara_sorriso", "cor": AZUL, "olhar": FRENTE}))
    filmar(trab, "400x400", "cam=cabeca&lod=alta")
    cols, cel = 6, (266, 300)
    folha = Image.new("RGB", (1600, 900), FUNDO)
    itens = [("f_%s.png" % i, "%s, de frente" % n) for i, n in HATS] + [("t_%s.png" % i, "%s, a 3/4" % n) for i, n in HATS]
    itens += [("p_cartola.png", "cartola, pico do pulo"), ("p_palha.png", "palha, pico do pulinho")]
    for k, (arq, leg) in enumerate(itens):
        x, y = (k % cols) * cel[0], (k // cols) * cel[1]
        colar(folha, os.path.join(TMP, arq), x, y, (cel[0], cel[0]))
        legenda(folha, x + 8, y + cel[0] + 3, leg)
    return folha


def folha_bigodes():
    faces = [("cara_neutro", "neutro", AZUL), ("cara_rindo", "rindo", LARANJA), ("cara_susto", "susto", AZUL), ("cara_bravo", "bravo", LARANJA)]
    trab = [("%s_%s.png" % (b, c), {"cam": "rosto", "dist": 0.125, "alvoy": 0.002, "bigode": b, "cara": c, "cor": cor, "olhar": FRENTE, **PARADO}) for b, _ in BIGS for c, _, cor in faces]
    filmar(trab, "480x300", "cam=rosto&lod=alta")
    cel = (320, 225)
    folha = Image.new("RGB", (1600, 900), FUNDO)
    for j, (c, nome_c, _) in enumerate(faces):
        for i, (b, nome_b) in enumerate(BIGS):
            x, y = i * cel[0], j * cel[1]
            colar(folha, os.path.join(TMP, "%s_%s.png" % (b, c)), x, y, (320, 200))
            legenda(folha, x + 8, y + 203, "%s | %s" % (nome_b, nome_c))
    return folha


def folha_olhos():
    estilos = [("olho_normal", "normal"), ("olho_kawaii", "kawaii"), ("olho_bravo", "bravo"), ("olho_cansado", "cansado")]
    cores = ["castanho", "verde", "violeta"]
    poses = [("neutro", {"cara": "cara_neutro"}), ("piscar 0,3", {"cara": "cara_neutro", "piscar": 0.3}), ("rindo", {"cara": "cara_rindo"}),
             ("olhando p/ baixo", {"cara": "cara_neutro", "olhar": BAIXO})]
    trab = []
    for e, _ in estilos:
        for c in cores:
            for k, (_, p) in enumerate(poses):
                trab.append(("%s_%s_%d.png" % (e, c, k), {"cam": "rosto", "dist": 0.085, "alvoy": 0.0125, "olhos": e, "cor_olho": c, "cor": AZUL if e in ("olho_normal", "olho_kawaii") else LARANJA,
                                                           "olhar": FRENTE, **PARADO, **p}))
    filmar(trab, "450x300", "cam=rosto&lod=alta")
    cel = (200, 150)
    folha = Image.new("RGB", (1600, 900), FUNDO)
    for b, (e, nome_e) in enumerate(estilos):
        bloco_x = (b % 2) * 4 * cel[0]
        bloco_y = (b // 2) * 3 * cel[1]
        for ci, c in enumerate(cores):
            for k, (nome_p, _) in enumerate(poses):
                x, y = bloco_x + k * cel[0], bloco_y + ci * cel[1]
                colar(folha, os.path.join(TMP, "%s_%s_%d.png" % (e, c, k)), x, y, (200, 133))
                legenda(folha, x + 5, y + 133, "%s %s, %s" % (nome_e, c, nome_p), tam=11)
    return folha


COMBOS = [
    ("cartola", "bigode_fino", "olho_normal", "castanho", AZUL, "alta"),
    ("chapeu_palha", "bigodao", "olho_kawaii", "verde", LARANJA, "alta"),
    ("coroa", "bigode_dali", "olho_bravo", "vermelho", AZUL, "alta"),
    ("gorro_pompom", "bigode_guidao", "olho_cansado", "violeta", LARANJA, "alta"),
    ("bone_aba_reta", "bigode_chevron", "olho_kawaii", "azul", AZUL, "alta"),
    ("chapeu_festa", "bigodao", "olho_normal", "dourado", LARANJA, "alta"),
    ("chapeu_palha", "bigodao", "olho_kawaii", "verde", LARANJA, "baixa"),
    ("gorro_pompom", "bigode_guidao", "olho_cansado", "violeta", LARANJA, "baixa"),
]


def folha_combos():
    trab = []
    for k, (h, b, e, c, cor, lod) in enumerate(COMBOS):
        trab.append(("c%d.png" % k, {"cam": "jogo", "dist": 1.5, "alvoy": 0.04, "chapeu": h, "bigode": b, "olhos": e, "cor_olho": c, "cor": cor, "lod": lod,
                                     "cara": "cara_sorriso", "olhar": [0, 0.05, 0.6], **PARADO}))
    filmar(trab, "1600x900", "cam=jogo&lod=alta")
    cel = (400, 450)
    folha = Image.new("RGB", (1600, 900), FUNDO)
    for k, (h, b, e, c, cor, lod) in enumerate(COMBOS):
        im = Image.open(os.path.join(TMP, "c%d.png" % k)).convert("RGB")
        recorte = im.crop((700, 340, 900, 565)).resize(cel, Image.LANCZOS)       # 200x225 pixels do jogo, ampliados 2x
        x, y = (k % 4) * cel[0], (k // 4) * cel[1]
        folha.paste(recorte, (x, y))
        d = ImageDraw.Draw(folha)
        d.rectangle((x, y + cel[1] - 44, x + cel[0], y + cel[1]), fill=(0, 0, 0))
        legenda(folha, x + 8, y + cel[1] - 42, "%s + %s" % (h.replace("chapeu_", "").replace("_", " "), b.replace("bigode_", "").replace("bigodao", "bigodão")), tam=14)
        legenda(folha, x + 8, y + cel[1] - 22, "%s %s, %s%s" % (e.replace("olho_", "olho "), c, "1,5 m" if lod == "alta" else "1,5 m, nível baixo", ""), tam=14)
    return folha


def main():
    os.makedirs(SAIDA, exist_ok=True)
    try:
        for nome, fn in (("chapeus", folha_chapeus), ("bigodes", folha_bigodes), ("olhos", folha_olhos), ("combos", folha_combos)):
            if nome in SO:
                f = fn()
                assert f.width <= 1600 and f.height <= 900, f.size
                f.save(os.path.join(SAIDA, "folha-%s.png" % nome))
                print("folha-%s.png" % nome, f.size)
    finally:
        shutil.rmtree(TMP, ignore_errors=True)


if __name__ == "__main__":
    main()
