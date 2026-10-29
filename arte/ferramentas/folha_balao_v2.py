"""Folha de prova do balão (contrato v2): filma o visor (arte/visor/balao.html) pelo protocolo DevTools e monta `.outros/lote-p7/folha.png` (1600x900) e as folhas
maiores em `.outros/lote-p7/capturas/`.

Pré-requisito: python3 -m http.server 8731 --bind 127.0.0.1 na raiz do repositório (nunca a 8001). Uso: python3 arte/ferramentas/folha_balao_v2.py [--so-montar]
Quadros de ação: o visor toca a ação pelo mixer em `t` segundos (determinístico, sem relógio).
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LOTE = os.path.join(RAIZ, ".outros", "lote-p7")
CAP = os.path.join(LOTE, "capturas")
FILMAR = os.path.join(RAIZ, "arte", "ferramentas", "filmar_visor.mjs")
ANTES_GLB = "/.outros/lote-p7/antes/balao.glb"
OLHA_FRENTE = [0, 0.011, 0.6]
CARAS = ["cara_neutro", "cara_sorriso", "cara_susto", "cara_bravo", "cara_triste", "cara_rindo", "cara_convencido", "cara_concentrado",
         "cara_desconfiado", "cara_ufa", "cara_tedio", "cara_comemorando"]
CARAS_V1 = CARAS[:5]
CARAS_34 = ["cara_sorriso", "cara_rindo", "cara_comemorando", "cara_bravo", "cara_convencido", "cara_concentrado", "cara_desconfiado", "cara_tedio"]
CARAS_BAIXA = ["cara_neutro", "cara_rindo", "cara_bravo", "cara_comemorando"]
# (rótulo, vetor do alvo do olhar em metros) para o olho esquerdo do balão (o da direita de quem olha), em 4 direções
OLHARES = [("esq", [-0.45, 0.011, 0.5]), ("dir", [0.45, 0.011, 0.5]), ("cima", [0, 0.40, 0.5]), ("baixo", [0, -0.38, 0.5])]
# quadros-chave (números de quadro a 30 por segundo) de cada ação mostrada
ACOES = {"balao_comemorar": [0, 7, 11, 15, 21, 26, 43], "balao_bravo": [0, 7, 13, 30, 38, 41, 45], "balao_rir": [0, 6, 10, 15, 19, 24, 28]}


def filmar(nome, trabalhos, tam, query=""):
    arq = os.path.join(LOTE, "tmp-" + nome + ".json")
    json.dump(trabalhos, open(arq, "w"))
    r = subprocess.run(["node", FILMAR, arq, CAP, tam, query], capture_output=True, text=True)
    print(r.stdout.strip(), r.stderr.strip())
    os.remove(arq)
    if r.returncode:
        sys.exit(1)


def fotografar():
    depois = []
    for c in CARAS:
        depois.append({"arquivo": "frente/%s.png" % c, "passo": {"cam": "rosto", "lod": "alta", "cara": c, "olhar": OLHA_FRENTE}})
    for c in CARAS_34:
        depois.append({"arquivo": "tq/%s.png" % c, "passo": {"cam": "rosto34", "lod": "alta", "cara": c, "olhar": OLHA_FRENTE}})
    for c in CARAS_BAIXA:
        depois.append({"arquivo": "baixa/%s.png" % c, "passo": {"cam": "rosto", "lod": "baixa", "cara": c, "olhar": OLHA_FRENTE}})
    for nome, alvo in OLHARES:
        depois.append({"arquivo": "olhar/%s.png" % nome, "passo": {"cam": "olho", "lod": "alta", "cara": "cara_neutro", "olhar": alvo}})
    filmar("depois", depois, "640x480", "cam=rosto")
    acoes = []
    for acao, quadros in ACOES.items():
        par = {"balao_comemorar": "cara_comemorando", "balao_bravo": "cara_bravo", "balao_rir": "cara_rindo"}[acao]
        for k, f in enumerate(quadros):
            acoes.append({"arquivo": "acoes/%s_%d.png" % (acao, k), "passo": {"cam": "corpo", "lod": "alta", "acao": acao, "t": f / 30, "cara": par, "olhar": OLHA_FRENTE, "reiniciar": True,
                                                                        "dist": 0.46, "alvoy": 0.04 if acao == "balao_comemorar" else 0.012}})
    filmar("acoes", acoes, "450x600", "cam=corpo")
    filmar("depois-jogo", [{"arquivo": "jogo/depois.png", "passo": {"cam": "jogo", "lod": "alta", "cara": "cara_sorriso", "olhar": [0, 0.3, 0.9]}}], "960x720", "cam=jogo")
    filmar("depois-jogo-baixa", [{"arquivo": "jogo/depois_baixa.png", "passo": {"cam": "jogo", "lod": "baixa", "cara": "cara_sorriso", "olhar": [0, 0.3, 0.9]}}], "960x720", "cam=jogo")
    q = "glb=" + ANTES_GLB
    antes = [{"arquivo": "antes/frente_%s.png" % c, "passo": {"cam": "rosto", "lod": "alta", "cara": c, "olhar": OLHA_FRENTE}} for c in CARAS_V1]
    antes += [{"arquivo": "antes/tq_cara_sorriso.png", "passo": {"cam": "rosto34", "lod": "alta", "cara": "cara_sorriso", "olhar": OLHA_FRENTE}}]
    antes += [{"arquivo": "antes/olhar_%s.png" % n, "passo": {"cam": "olho", "lod": "alta", "cara": "cara_neutro", "olhar": a}} for n, a in OLHARES]
    antes += [{"arquivo": "antes/baixa_cara_neutro.png", "passo": {"cam": "rosto", "lod": "baixa", "cara": "cara_neutro", "olhar": OLHA_FRENTE}}]
    filmar("antes", antes, "640x480", q + "&cam=rosto")
    filmar("antes-jogo", [{"arquivo": "antes/jogo.png", "passo": {"cam": "jogo", "lod": "alta", "cara": "cara_sorriso", "olhar": [0, 0.3, 0.9]}}], "960x720", q + "&cam=jogo")


def _fonte(tam):
    for caminho in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"):
        if os.path.exists(caminho):
            return ImageFont.truetype(caminho, tam)
    return ImageFont.load_default(size=tam)


FONTE = _fonte(12)


def abrir(caminho, caixa=None, tam=(200, 150)):
    im = Image.open(os.path.join(CAP, caminho)).convert("RGB")
    if caixa:
        im = im.crop(caixa)
    return im.resize(tam, Image.LANCZOS)


def grade(folha, x0, y0, colunas, arquivos, legendas=None, tam=(200, 150)):
    d = ImageDraw.Draw(folha)
    for i, a in enumerate(arquivos):
        x, y = x0 + (i % colunas) * tam[0], y0 + (i // colunas) * tam[1]
        folha.paste(abrir(a, tam=tam), (x, y))
        if legendas:
            d.text((x + 4, y + 2), legendas[i], fill=(240, 232, 214), font=FONTE, stroke_width=2, stroke_fill=(0, 0, 0))


def montar():
    folha = Image.new("RGB", (1600, 900), (6, 6, 8))
    d = ImageDraw.Draw(folha)
    curto = lambda c: c.replace("cara_", "")
    # canto de cima à esquerda: as 12 caras de frente
    grade(folha, 0, 0, 4, ["frente/%s.png" % c for c in CARAS], [curto(c) for c in CARAS])
    # canto de cima à direita: 8 caras de 3/4 e 4 do nível baixo
    grade(folha, 800, 0, 4, ["tq/%s.png" % c for c in CARAS_34] + ["baixa/%s.png" % c for c in CARAS_BAIXA],
          [curto(c) + " 3/4" for c in CARAS_34] + ["baixa " + curto(c) for c in CARAS_BAIXA])
    # canto de baixo à esquerda: antes, depois, olhar
    jogo_a = Image.open(os.path.join(CAP, "antes/jogo.png")).convert("RGB").crop((240, 180, 720, 540)).resize((200, 150), Image.LANCZOS)
    jogo_d = Image.open(os.path.join(CAP, "jogo/depois.png")).convert("RGB").crop((240, 180, 720, 540)).resize((200, 150), Image.LANCZOS)
    antes = ["antes/frente_cara_neutro.png", "antes/tq_cara_sorriso.png", "antes/frente_cara_bravo.png"]
    depois = ["frente/cara_neutro.png", "tq/cara_sorriso.png", "frente/cara_bravo.png"]
    grade(folha, 0, 450, 4, antes, ["ANTES neutro", "ANTES sorriso 3/4", "ANTES bravo"])
    grade(folha, 0, 600, 4, depois, ["DEPOIS neutro", "DEPOIS sorriso 3/4", "DEPOIS bravo"])
    folha.paste(jogo_a, (600, 450))
    folha.paste(jogo_d, (600, 600))
    d.text((604, 452), "ANTES jogo (1,3 m)", fill=(240, 232, 214), font=FONTE, stroke_width=2, stroke_fill=(0, 0, 0))
    d.text((604, 602), "DEPOIS jogo (1,3 m)", fill=(240, 232, 214), font=FONTE, stroke_width=2, stroke_fill=(0, 0, 0))
    grade(folha, 0, 750, 4, ["olhar/%s.png" % n for n, _ in OLHARES], ["olho " + n + " (pálpebras)" for n, _ in OLHARES])
    # canto de baixo à direita: 3 ações em 4 quadros-chave
    y = 450
    for acao, quadros in ACOES.items():
        grade(folha, 800, y, 7, ["acoes/%s_%d.png" % (acao, k) for k in range(len(quadros))], ["%s q%d" % (acao.replace("balao_", "")[:4], f) for f in quadros], tam=(112, 150))
        y += 150
    # linhas finas entre os quadrantes
    d.line([(0, 450), (1600, 450)], fill=(60, 56, 70), width=2)
    d.line([(800, 0), (800, 900)], fill=(60, 56, 70), width=2)
    folha.save(os.path.join(LOTE, "folha.png"))
    print("folha", folha.size)


if __name__ == "__main__":
    os.makedirs(CAP, exist_ok=True)
    if "--so-montar" not in sys.argv:
        fotografar()
    montar()
