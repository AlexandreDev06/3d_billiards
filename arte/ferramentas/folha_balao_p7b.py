"""Folha de prova do P7b: o balão v1 e o v2b lado a lado, na mesma câmera, com o corpo azul e laranja. Filma o visor (arte/visor/balao.html) pelo protocolo DevTools.

Pré-requisito: python3 -m http.server 8731 --bind 127.0.0.1 na raiz do repositório (nunca a 8001).
Uso: python3 arte/ferramentas/folha_balao_p7b.py [--so-montar] [--glb=/.outros/lote-p7/rascunho/balao.glb] [--saida=.outros/lote-p7/folha-b.png]
Sem --glb, o v2b é o `exportados/balao.glb`. O v1 é a cópia em `.outros/lote-p7/antes/balao.glb`.
Cada par é (v1 | v2b); as cenas sem equivalente no v1 (rindo, comemorando, tédio, concentrado) mostram, do lado do v1, a cara mais próxima dele.
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOTE = os.path.join(RAIZ, ".outros", "lote-p7")
CAP = os.path.join(LOTE, "capturas-b")
FILMAR = os.path.join(RAIZ, "arte", "ferramentas", "filmar_visor.mjs")
GLB_V1 = "/.outros/lote-p7/antes/balao.glb"
args = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else True) for a in sys.argv[1:] if a.startswith("--")}
GLB_V2 = args.get("--glb", "/arte/personagens/exportados/balao.glb")
SAIDA = os.path.join(RAIZ, args.get("--saida", ".outros/lote-p7/folha-b.png"))
AZUL, LARANJA = "3aa0ff", "ff8a1f"
FRENTE = [0, 0.011, 0.6]
CIMA, BAIXO = [0, 0.40, 0.5], [0, -0.38, 0.5]
# (id, rótulo, cara v2b, cara v1, cor, passo extra)
CENAS = [
    ("neutro_a", "neutro", "cara_neutro", "cara_neutro", AZUL, {"cam": "rosto", "olhar": FRENTE}),
    ("neutro_l", "neutro", "cara_neutro", "cara_neutro", LARANJA, {"cam": "rosto", "olhar": FRENTE}),
    ("neutro34_a", "neutro 3/4", "cara_neutro", "cara_neutro", AZUL, {"cam": "rosto34", "olhar": FRENTE}),
    ("sorriso_a", "sorriso", "cara_sorriso", "cara_sorriso", AZUL, {"cam": "rosto", "olhar": FRENTE}),
    ("sorriso_l", "sorriso", "cara_sorriso", "cara_sorriso", LARANJA, {"cam": "rosto", "olhar": FRENTE}),
    ("rindo_a", "rindo", "cara_rindo", "cara_sorriso", AZUL, {"cam": "rosto", "olhar": FRENTE}),
    ("rindo_l", "rindo", "cara_rindo", "cara_sorriso", LARANJA, {"cam": "rosto", "olhar": FRENTE}),
    ("rindo34_a", "rindo 3/4", "cara_rindo", "cara_sorriso", AZUL, {"cam": "rosto34", "olhar": FRENTE}),
    ("comem_a", "comemorando", "cara_comemorando", "cara_sorriso", AZUL, {"cam": "rosto", "olhar": FRENTE}),
    ("comem_l", "comemorando", "cara_comemorando", "cara_sorriso", LARANJA, {"cam": "rosto", "olhar": FRENTE}),
    ("piscar_a", "piscar 1", "cara_neutro", "cara_neutro", AZUL, {"cam": "rosto", "olhar": FRENTE, "piscar": 1}),
    ("piscar_l", "piscar 1", "cara_neutro", "cara_neutro", LARANJA, {"cam": "rosto", "olhar": FRENTE, "piscar": 1}),
    ("tedio_a", "tédio", "cara_tedio", "cara_neutro", AZUL, {"cam": "rosto", "olhar": FRENTE}),
    ("tedio_l", "tédio", "cara_tedio", "cara_neutro", LARANJA, {"cam": "rosto", "olhar": FRENTE}),
    ("conc_a", "concentrado", "cara_concentrado", "cara_neutro", AZUL, {"cam": "rosto", "olhar": FRENTE}),
    ("bravo_a", "bravo", "cara_bravo", "cara_bravo", AZUL, {"cam": "rosto", "olhar": FRENTE}),
    ("conc_l", "concentrado", "cara_concentrado", "cara_neutro", LARANJA, {"cam": "rosto", "olhar": FRENTE}),
    ("bravo_l", "bravo", "cara_bravo", "cara_bravo", LARANJA, {"cam": "rosto", "olhar": FRENTE}),
    ("cima_a", "olhando p/ cima", "cara_neutro", "cara_neutro", AZUL, {"cam": "rosto", "olhar": CIMA}),
    ("baixo_a", "olhando p/ baixo", "cara_neutro", "cara_neutro", AZUL, {"cam": "rosto", "olhar": BAIXO}),
    ("baixa_a", "rindo, nível baixo", "cara_rindo", "cara_sorriso", AZUL, {"cam": "rosto", "olhar": FRENTE, "lod": "baixa"}),
    ("wink_l", "sorriso + piscadinha", "cara_sorriso", "cara_sorriso", LARANJA, {"cam": "rosto", "olhar": FRENTE, "esq": 1}),
]
JOGO = [("jogo_a", "jogo 1,5 m", "cara_neutro", "cara_neutro", AZUL), ("jogo_l", "jogo 1,5 m sorriso", "cara_sorriso", "cara_sorriso", LARANJA)]
CELULA = (200, 150)


def filmar(nome, trabalhos, tam, glb):
    arq = os.path.join(LOTE, "tmp-" + nome + ".json")
    json.dump(trabalhos, open(arq, "w"))
    r = subprocess.run(["node", FILMAR, arq, CAP, tam, "glb=" + glb + "&cam=rosto"], capture_output=True, text=True)
    print(nome, r.stdout.strip(), r.stderr.strip())
    os.remove(arq)
    if r.returncode:
        sys.exit(1)


def fotografar():
    for versao, glb in (("v1", GLB_V1), ("v2", GLB_V2)):
        trabalhos = []
        for cid, _, c2, c1, cor, extra in CENAS:
            passo = dict(extra)
            passo.update({"lod": extra.get("lod", "alta"), "cara": c1 if versao == "v1" else c2, "cor": cor})
            trabalhos.append({"arquivo": "%s/%s.png" % (versao, cid), "passo": passo})
        filmar("celulas-" + versao, trabalhos, "400x300", glb)
        jogos = [{"arquivo": "%s/%s.png" % (versao, cid), "passo": {"cam": "jogo", "dist": 1.5, "lod": "alta", "cara": c1 if versao == "v1" else c2, "cor": cor, "olhar": [0, 0.3, 0.9]}}
                 for cid, _, c2, c1, cor in JOGO]
        filmar("jogo-" + versao, jogos, "960x720", glb)


def _fonte(tam):
    for caminho in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"):
        if os.path.exists(caminho):
            return ImageFont.truetype(caminho, tam)
    return ImageFont.load_default(size=tam)


def montar():
    fonte = _fonte(11)
    folha = Image.new("RGB", (1600, 900), (6, 6, 8))
    d = ImageDraw.Draw(folha)
    cenas = [(cid, rot, c1, c2) for cid, rot, c2, c1, cor, _ in CENAS] + [(cid, rot, c1, c2) for cid, rot, c2, c1, cor in JOGO]
    cw, ch = CELULA
    colunas = 8
    for i, (cid, rot, c1, c2) in enumerate(cenas):
        x = (i % 4) * 2 * cw
        y = (i // 4) * ch
        if cid.startswith("jogo"):
            for k, versao in enumerate(("v1", "v2")):
                im = Image.open(os.path.join(CAP, versao, cid + ".png")).convert("RGB")
                cx, cy = im.size[0] // 2, int(im.size[1] * 0.50)
                recorte = im.crop((cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2))     # em escala real: 1 pixel do jogo = 1 pixel da folha
                folha.paste(recorte, (x + k * cw, y))
        else:
            for k, versao in enumerate(("v1", "v2")):
                im = Image.open(os.path.join(CAP, versao, cid + ".png")).convert("RGB").resize(CELULA, Image.LANCZOS)
                folha.paste(im, (x + k * cw, y))
        for k, versao in enumerate(("v1", "v2b")):
            nome = rot + (" (v1: %s)" % c1.replace("cara_", "") if versao == "v1" and c1 != c2 else "") + (" (v1 não tem)" if versao == "v1" and "piscadinha" in rot else "")
            d.text((x + k * cw + 4, y + 2), "%s %s" % (versao, nome), fill=(240, 232, 214), font=fonte, stroke_width=2, stroke_fill=(0, 0, 0))
    for i in range(1, 4):
        d.line([(i * 2 * cw, 0), (i * 2 * cw, 900)], fill=(70, 66, 82), width=2)
    for j in range(1, 6):
        d.line([(0, j * ch), (1600, j * ch)], fill=(40, 38, 50), width=1)
    for i in range(4):
        d.line([(i * 2 * cw + cw, 0), (i * 2 * cw + cw, 900)], fill=(40, 38, 50), width=1)
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    folha.save(SAIDA)
    print("folha", folha.size, SAIDA)


if __name__ == "__main__":
    os.makedirs(CAP, exist_ok=True)
    if "--so-montar" not in args:
        fotografar()
    montar()
