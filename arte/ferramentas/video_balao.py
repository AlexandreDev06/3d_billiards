"""Vídeo das 13 ações do balão (`acoes.webm`): filma o visor (arte/visor/balao.html) quadro a quadro pelo protocolo DevTools e junta com o ffmpeg (VP9).

Pré-requisito: python3 -m http.server 8731 --bind 127.0.0.1 na raiz do repositório (nunca a 8001).
Uso: python3 arte/ferramentas/video_balao.py [--glb=/arte/personagens/exportados/balao.glb] [--saida=.outros/lote-p7/acoes.webm] [--paralelo=4]
Cada ação toca uma vez (a entrada e o ciclo, como no meta) com o rosto par dela, o olhar passeando e uma piscada a cada 2,4 s (ações de olho fechado já fecham sozinhas).
"""
import json
import math
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FILMAR = os.path.join(RAIZ, "arte", "ferramentas", "filmar_visor.mjs")
args = {a.split("=")[0]: (a.split("=", 1)[1] if "=" in a else True) for a in sys.argv[1:] if a.startswith("--")}
GLB = args.get("--glb", "/arte/personagens/exportados/balao.glb")
SAIDA = os.path.join(RAIZ, args.get("--saida", ".outros/lote-p7/acoes.webm"))
PARALELO = int(args.get("--paralelo", 4))
PASTA = os.path.join(RAIZ, ".outros", "lote-p7", "rascunho", "video")
META = json.load(open(os.path.join(RAIZ, GLB.lstrip("/").replace("balao.glb", "balao-meta.json")), encoding="utf-8"))
ORDEM = ["balao_parado", "balao_inclinar", "balao_pulinho", "balao_susto", "balao_estufar", "balao_murchar", "balao_comemorar", "balao_rir", "balao_bravo",
         "balao_concentrar", "balao_impaciente", "balao_ufa", "balao_desanimar"]
ALTO = {"balao_comemorar": 0.04, "balao_pulinho": 0.03}


def olhar(t):
    return [0.40 * math.sin(2 * math.pi * t / 5.3), 0.011 + 0.22 * math.sin(2 * math.pi * t / 3.7 + 1.0), 0.6]


def piscar(t):
    f = (t % 2.4) / 0.2           # uma piscada de 0,2 s a cada 2,4 s
    return 0.0 if f >= 2 else (f if f < 1 else 2 - f)


def trabalhos():
    por_acao, n = [], 0
    for nome in ORDEM:
        quadros = META["acoes"][nome]["quadros"]
        job = []
        for q in range(quadros):
            t = q / 30
            passo = {"cam": "corpo", "lod": "alta", "acao": nome, "t": t, "cara": META["par_de_cara"][nome], "olhar": olhar(t + 7.0 * len(por_acao)),
                     "piscar": piscar(t), "dist": 0.52, "alvoy": ALTO.get(nome, 0.012), "reiniciar": q == 0}
            job.append({"arquivo": "v%04d.png" % n, "passo": passo})
            n += 1
        por_acao.append((nome, job))
    return por_acao, n


def filmar(nome, job):
    arq = os.path.join(PASTA, "tmp-%s.json" % nome)
    json.dump(job, open(arq, "w"))
    r = subprocess.run(["node", FILMAR, arq, PASTA, "400x520", "glb=" + GLB + "&cam=corpo"], capture_output=True, text=True)
    os.remove(arq)
    print(nome, r.stdout.strip().splitlines()[-1] if r.stdout.strip() else "", r.stderr.strip()[:200], flush=True)
    return r.returncode


if __name__ == "__main__":
    shutil.rmtree(PASTA, ignore_errors=True)
    os.makedirs(PASTA)
    por_acao, total = trabalhos()
    with ThreadPoolExecutor(PARALELO) as ex:
        codigos = list(ex.map(lambda a: filmar(*a), por_acao))
    if any(codigos):
        sys.exit("falhou um lote de quadros")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "30", "-i", os.path.join(PASTA, "v%04d.png"), "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0",
                    "-pix_fmt", "yuv420p", SAIDA], check=True)
    print("video", SAIDA, "%d quadros, %.1f s, %d bytes" % (total, total / 30, os.path.getsize(SAIDA)))
