"""Refaz a cena inteira (forma, malhas, esqueleto, poses) do zero, na ordem.

Na janela do Blender (pelo MCP): exec deste arquivo. Sem janela:
  blender -b --factory-startup --python arte/personagens/scripts/00_tudo.py -- --salvar arte/personagens/mao.blend
"""
import os
import sys

import bpy

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))


def rodar(nome):
    caminho = os.path.join(PASTA, nome)
    exec(compile(open(caminho).read(), caminho, "exec"), {"__file__": caminho, "__name__": "__main__"})


def principal():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    sc.unit_settings.length_unit = "CENTIMETERS"
    for nome in ("01_gaiola.py", "03_esqueleto.py", "04_poses.py"):
        rodar(nome)
    bpy.data.objects["mao_baixa"].hide_set(True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--salvar" in argv:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(argv[argv.index("--salvar") + 1]), compress=True)


principal()
