"""Refaz o balão inteiro (malhas, esqueleto, ações) do zero, na ordem.

Na janela do Blender (pelo MCP): exec deste arquivo. Sem janela:
  blender -b --factory-startup --python arte/personagens/scripts/balao/00_tudo.py -- --salvar arte/personagens/balao.blend
"""
import os
import sys

import bpy

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))


def rodar(nome):
    caminho = os.path.join(PASTA, nome)
    if not os.path.exists(caminho):
        print("falta", nome)
        return
    exec(compile(open(caminho).read(), caminho, "exec"), {"__file__": caminho, "__name__": "__main__"})


def principal():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    sc.unit_settings.length_unit = "CENTIMETERS"
    sc.render.fps = 30
    for nome in ("01_malha.py", "02_esqueleto.py", "03_acoes.py"):
        rodar(nome)
    bpy.data.objects["balao_baixa"].hide_set(True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--salvar" in argv:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(argv[argv.index("--salvar") + 1]), compress=True)


principal()
