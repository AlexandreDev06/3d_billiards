"""Etapa 3b: o esqueleto do balão e a ligação das duas malhas.

Ossos (todos deformam, menos `olhar`): `raiz` (leva tudo: o balanço), `espinha_1` (gira e escala a partir do pescoço: estufar, murchar, inclinar), `espinha_2/3`
(curvatura e seguimento do corpo), `no` (filho da raiz: não escala com o corpo), `cordinha_1..4` (corrente em arco) e `olho_esq`/`olho_dir` (filhos de `espinha_2`; girar o osso é o olhar).
`olhar` é só o alvo da prévia no Blender (restrição Damped Track nos olhos), não vai no .glb.
Os pontos `mao_esq` e `mao_dir` são empties filhos de `espinha_2`: o Frontend põe a `mao.glb` neles.
O osso aponta para +Z do mundo (corpo), logo o Z local do osso é -Y do mundo: girar +X inclina o corpo para o rosto.
"""
import importlib
import math
import os
import sys

import bpy
from mathutils import Vector

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import dados as D
import geometria as G

importlib.reload(D)
importlib.reload(G)

CM = D.CM
NOME = "balao_esqueleto"
MALHAS = ("balao_alta", "balao_baixa")


def v(p):
    return Vector(tuple(c * CM for c in p))


def construir():
    for o in [o for o in bpy.data.objects if o.name in (NOME, "mao_esq", "mao_dir", "olhar_alvo")]:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in [a for a in bpy.data.armatures if a.name == NOME]:
        bpy.data.armatures.remove(a)
    arm_dado = bpy.data.armatures.new(NOME)
    arm = bpy.data.objects.new(NOME, arm_dado)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eds = arm_dado.edit_bones

    def osso(nome, cabeca, cauda, pai=None, deforma=True, rolagem=0.0):
        e = eds.new(nome)
        e.head, e.tail = v(cabeca), v(cauda)
        e.roll = rolagem
        e.use_deform = deforma
        if pai:
            e.parent = eds[pai]
        return e

    for nome, (c, t, pai) in D.OSSOS.items():
        osso(nome, c, t, pai)
    for i, (c, t) in enumerate(G.pontos_dos_ossos_da_cordinha()):
        osso("cordinha_%d" % (i + 1), tuple(c), tuple(t), "no" if i == 0 else "cordinha_%d" % i)
        if i > 0:
            eds["cordinha_%d" % (i + 1)].use_connect = False
    # olhos: da cabeça no centro do globo, a cauda 0,6 cm para fora (o eixo do olhar)
    for lado, nome in ((+1, "olho_esq"), (-1, "olho_dir")):
        c = G.centro_do_olho(lado)
        n = G.eixo_do_olhar(lado)
        osso(nome, tuple(c), tuple(c + n * 0.6), "espinha_2")
    osso("olhar", (0, -30.0, 1.45), (0, -30.0, 3.0), None, deforma=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    # restrições de prévia: os olhos acompanham o osso `olhar`
    bpy.ops.object.mode_set(mode="POSE")
    for nome in ("olho_esq", "olho_dir"):
        pb = arm.pose.bones[nome]
        c = pb.constraints.new("DAMPED_TRACK")
        c.target, c.subtarget = arm, "olhar"
        c.track_axis = "TRACK_Y"
        c.influence = 0.0   # zero por padrão: o osso `olhar` só prova a ideia; o jogo gira os ossos dos olhos direto
    bpy.ops.object.mode_set(mode="OBJECT")
    arm_dado.display_type = "OCTAHEDRAL"
    arm.show_in_front = True
    # as malhas deformam por este esqueleto
    for nm in MALHAS:
        ob = bpy.data.objects[nm]
        for m in [m for m in ob.modifiers if m.type == "ARMATURE"]:
            ob.modifiers.remove(m)
        md = ob.modifiers.new("esqueleto", "ARMATURE")
        md.object = arm
        ob.parent = arm
        ob.matrix_parent_inverse = arm.matrix_world.inverted()
    # os pontos das mãos
    for nome, p in D.PONTOS_DAS_MAOS.items():
        e = bpy.data.objects.new(nome, None)
        e.empty_display_type = "ARROWS"
        e.empty_display_size = 0.012
        bpy.context.scene.collection.objects.link(e)
        e.parent = arm
        e.parent_type = "BONE"
        e.parent_bone = "espinha_2"
        e.location = (0, 0, 0)
        # a posição no repouso, no referencial do osso `raiz`
        bpy.context.view_layer.update()
        osso_raiz = arm.data.bones["espinha_2"]
        mundo = v(p)
        local = (arm.matrix_world @ osso_raiz.matrix_local).inverted() @ mundo
        e.matrix_parent_inverse.identity()
        # empties filhos de osso ficam relativos à CAUDA do osso; conta isso
        cauda = Vector((0, osso_raiz.length, 0))
        e.location = local - cauda
    return arm


arm = construir()
print("ossos:", [b.name for b in arm.data.bones])
for nome in D.PONTOS_DAS_MAOS:
    bpy.context.view_layer.update()
    print(nome, "mundo (cm)", [round(c / CM, 2) for c in bpy.data.objects[nome].matrix_world.translation])
