"""Refaz tudo das skins de taco, do zero: PNGs, prévia, .blend, folha, metadados e conferência.

`python3 arte/skins/scripts/00_tudo.py [coral] [bicho-solto] [corujao] [dragao] [dragon-lore] [howl] [--sem-folha]`
Sem nomes, refaz as seis. Precisa do Blender 5 no PATH (ou na variável BLENDER). Nada aqui toca o jogo: tudo cai em `arte/skins/`
e a folha de revisão do P3 (Dragon Lore e Howl, normais e raras) em `.outros/lote-p3/folha.png`. O Corujão e o Dragão das Quinze
(P2) continuam em `exportados/`, mas ficam fora do catálogo (`especificacoes.SKINS_FORA`). `DL_AMOSTRAS` e `HOWL_AMOSTRAS` mudam as
amostras do Cycles das pinturas (padrão 64).
"""
import glob
import os
import shutil
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
SKINS_DIR = os.path.abspath(os.path.join(AQUI, ".."))
RAIZ = os.path.abspath(os.path.join(SKINS_DIR, "..", ".."))
BLENDER = os.environ.get("BLENDER") or shutil.which("blender") or "blender"

# cada skin: (script, argumentos) por chamada ao Blender
RECEITAS = {
    "coral": [("coral.py", ["ambos"])],
    "bicho-solto": [("bichos.py", ["tudo", "normal"]), ("bichos.py", ["tudo", "raro"])],
    "corujao": [("coruja.py", ["tudo", "ambos", "normal"]), ("coruja.py", ["tudo", "ambos", "raro"])],
    "dragao": [("dragao.py", ["tudo", "normal", "cor"]), ("dragao.py", ["tudo", "raro", "cor"]),
               ("dragao.py", ["haste", "normal", "emissivo"]), ("dragao.py", ["haste", "raro", "emissivo"])],
    # P3: cor, emissivo e metal (as máscaras todas pretas são descartadas depois), normal e rara
    "dragon-lore": [("dragon_lore.py", ["tudo", v, m]) for m in ("cor", "emissivo", "metal") for v in ("normal", "raro")],
    "howl": [("howl.py", ["tudo", v, m]) for m in ("cor", "emissivo") for v in ("normal", "raro")],
}
NOVAS = ("dragon-lore", "howl")


def blender(script, args):
    cmd = [BLENDER, "-b", "--factory-startup", "--python", os.path.join(AQUI, script), "--"] + args
    print("→", script, " ".join(args), flush=True)
    r = subprocess.run(cmd, cwd=tempfile.gettempdir(), capture_output=True, text=True)
    if r.returncode != 0 or "Traceback" in r.stdout + r.stderr:
        print(r.stdout[-2000:], r.stderr[-2000:])
        sys.exit(f"falhou: {script} {args}")


def descartar_pretos(skin):
    """Apaga os mapas emissivo e metal que saíram inteiros pretos (a peça não acende / não tem metal): o meta só lista o que existe."""
    from PIL import Image
    for caminho in sorted(glob.glob(os.path.join(SKINS_DIR, "exportados", f"{skin}-*-emissivo.png")) + glob.glob(os.path.join(SKINS_DIR, "exportados", f"{skin}-*-metal.png"))):
        with Image.open(caminho) as im:
            if max(im.convert("RGB").getextrema(), key=lambda e: e[1])[1] < 10:
                os.remove(caminho)
                print("   descartado (preto):", os.path.basename(caminho), flush=True)


def limpar_mapas(skin):
    for caminho in glob.glob(os.path.join(SKINS_DIR, "exportados", f"{skin}-*-emissivo.png")) + glob.glob(os.path.join(SKINS_DIR, "exportados", f"{skin}-*-metal.png")):
        if skin in NOVAS:
            os.remove(caminho)


def main():
    pedidas = [a for a in sys.argv[1:] if not a.startswith("--")]
    skins = pedidas or list(RECEITAS)
    for s in skins:
        limpar_mapas(s)
        for script, args in RECEITAS[s]:
            blender(script, args)
        if s in NOVAS:
            descartar_pretos(s)
    if "--sem-folha" in sys.argv:
        return
    previas = os.path.join(RAIZ, ".outros", "lote-p3", "previas")
    os.makedirs(previas, exist_ok=True)
    pistas = ["coral", "bicho-solto", "corujao", "dragao", "dragon-lore", "dragon-lore:raro", "howl", "howl:raro"]
    blender("folha.py", [previas] + pistas + [f"--blend={os.path.join(SKINS_DIR, 'skins.blend')}", "--detalhe2"])
    backup = os.path.join(SKINS_DIR, "skins.blend1")
    if os.path.exists(backup):
        os.remove(backup)
    subprocess.run([sys.executable, os.path.join(AQUI, "montar_folha_p3.py"), previas, os.path.join(RAIZ, ".outros", "lote-p3", "folha.png")], check=True)
    subprocess.run([sys.executable, os.path.join(AQUI, "meta.py")], cwd=AQUI, check=True)
    sys.exit(subprocess.run([sys.executable, os.path.join(AQUI, "verificar.py")], cwd=AQUI).returncode)


if __name__ == "__main__":
    main()
