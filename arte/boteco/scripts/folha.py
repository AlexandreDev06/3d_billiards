"""A folha de prova do boteco (P5): antes e depois na câmera do jogo nos três níveis, uma câmera de menu e dois detalhes, em 1600x900.

    uv run --with pillow python3 folha.py SAIDA.png [PASTA_DAS_CAPTURAS]

Precisa do servidor estático (`python3 -m http.server 8731 --bind 127.0.0.1` na raiz do repositório, nunca a 8001) e do Chrome. Os quadros são renderizados com o three, como no visor:
o .glb sem luz (KHR_materials_unlit) e o PBR com as luzes dos marcadores, tone mapping ACES, exposição 1. Os "antes" vêm de `.outros/lote-p5/antes/` (o nível baixo com `casco=leve`,
que é o que o jogo fazia). Se a pasta das capturas já tem os PNG, não captura de novo.
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
ANTES = "/.outros/lote-p5/antes"
DEPOIS = "/arte/boteco/exportados"
W, H = 640, 360
QUADROS = [  # arquivo, nível, câmera, extra, legenda
    ("antes_alto", "alto", "jogo", f"glb={ANTES}/boteco-alto.glb", "ANTES alto (31,7 mil tri)"),
    ("antes_medio", "medio", "jogo", f"glb={ANTES}/boteco-medio.glb", "ANTES médio (8,7 mil tri)"),
    ("antes_baixo", "baixo", "jogo", f"glb={ANTES}/boteco-baixo.glb&casco=leve", "ANTES baixo (1,3 mil tri, casco liso)"),
    ("dep_alto", "alto", "jogo", f"glb={DEPOIS}/boteco-alto.glb", "DEPOIS alto"),
    ("dep_medio", "medio", "jogo", f"glb={DEPOIS}/boteco-medio.glb", "DEPOIS médio"),
    ("dep_baixo", "baixo", "jogo", f"glb={DEPOIS}/boteco-baixo.glb", "DEPOIS baixo"),
    ("dep_menu", "alto", "menu3", f"glb={DEPOIS}/boteco-alto.glb", "Câmera de menu 3 (alto)"),
    ("dep_d1", "alto", "livre", f"glb={DEPOIS}/boteco-alto.glb&pos=-2.3,0.75,-0.2&alvo=-3.5,0.25,-1.3&fov=42", "Detalhe: balcão, estufa e prateleiras (alto)"),
    ("dep_d2", "alto", "livre", f"glb={DEPOIS}/boteco-alto.glb&pos=2.8,0.25,-1.4&alvo=3.1,-0.15,-3.2&fov=46", "Detalhe: azulejo, mesinha, planta, ladrilho (alto)"),
]


def capturar(nome, nivel, cam, extra, pasta):
    alvo = os.path.join(pasta, nome + ".png")
    if os.path.exists(alvo) and os.path.getsize(alvo) > 5000:
        return alvo
    env = dict(os.environ, VIRTUAL_TIME="60000")
    subprocess.run(["bash", os.path.join(RAIZ, "arte", "ferramentas", "captura_visor.sh"), "boteco", alvo, f"nivel={nivel}&cam={cam}&{extra}", str(W), str(H)], check=True, env=env, cwd=RAIZ)
    return alvo


def main():
    saida = sys.argv[1]
    pasta = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(saida) or ".", "capturas")
    os.makedirs(pasta, exist_ok=True)
    folha = Image.new("RGB", (1600, 900), (16, 16, 18))
    try:
        fonte = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 13)
    except OSError:
        fonte = ImageFont.load_default()
    tw, th = 1600 // 3, 300
    for i, (nome, nivel, cam, extra, legenda) in enumerate(QUADROS):
        im = Image.open(capturar(nome, nivel, cam, extra, pasta)).convert("RGB").resize((tw, th), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        tam = d.textbbox((0, 0), legenda, font=fonte)
        d.rectangle((0, 0, tam[2] + 12, tam[3] + 8), fill=(0, 0, 0))
        d.text((6, 3), legenda, fill=(255, 235, 190), font=fonte)
        folha.paste(im, ((i % 3) * tw + (1 if i % 3 == 2 else 0), (i // 3) * th))
    folha.save(saida)
    print(saida, folha.size)


if __name__ == "__main__":
    main()
