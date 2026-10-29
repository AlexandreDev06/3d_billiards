"""Etapa 3c (P8): o que o balão ganha para ser personalizado: a âncora do chapéu, os cinco bigodes (um por nível de detalhe) e a vitrine dos estilos de olho.

- `ancora_chapeu`: um empty filho do osso `espinha_3` (o que acompanha o topo da cabeça no estica e amassa), no topo do balão (z = 6,6 cm), +Z do Blender (+Y do glTF) para fora da cabeça.
- `<bigode>_alta` e `<bigode>_baixa`: malhas comuns (sem pele) filhas do osso `espinha_2`, com as mesmas formas do rosto (`dados.FORMAS`). O rosto inteiro (z de -2,2 a 4,4) é só da `espinha_2`,
  então um bigode rígido preso a ela anda exatamente como a boca. Ocultos por padrão.
- `estilos_de_olho`: uma malha de seis triângulos minúsculos dentro do corpo, só para o arquivo levar os materiais (esclera e íris) dos estilos que o corpo não usa. Oculta.

Na janela do Blender (pelo MCP): exec deste arquivo. Roda depois de `02_esqueleto.py`.
"""
import importlib
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import bigodes as B
import dados as D
import geometria as G
import materiais as M

for _m in (D, G, B, M):
    importlib.reload(_m)

CM = D.CM
ARM = "balao_esqueleto"


def matriz_do_filho_de_osso(arm, osso):
    """A matriz do pai que o Blender usa para um filho de osso: a do osso em repouso, deslocada até a CAUDA dele (convenção do Blender)."""
    b = arm.data.bones[osso]
    return arm.matrix_world @ b.matrix_local @ Matrix.Translation((0.0, b.length, 0.0))


def prender_ao_osso(ob, arm, osso):
    """Prende `ob` ao osso sem mexer onde ele está no mundo (os vértices já estão em coordenadas do mundo)."""
    bpy.context.view_layer.update()
    ob.parent = arm
    ob.parent_type = "BONE"
    ob.parent_bone = osso
    ob.matrix_parent_inverse = matriz_do_filho_de_osso(arm, osso).inverted()
    ob.matrix_basis = Matrix.Identity(4)


def ancora_do_chapeu(arm):
    for o in [o for o in bpy.data.objects if o.name == D.ANCORA_CHAPEU["nome"]]:
        bpy.data.objects.remove(o, do_unlink=True)
    e = bpy.data.objects.new(D.ANCORA_CHAPEU["nome"], None)
    e.empty_display_type = "ARROWS"
    e.empty_display_size = 0.012
    bpy.context.scene.collection.objects.link(e)
    prender_ao_osso(e, arm, D.ANCORA_CHAPEU["osso"])
    mundo = Vector(tuple(c * CM for c in D.ANCORA_CHAPEU["pos"]))
    # o filho de osso mede a posição a partir da cauda: ancora o empty no ponto pedido sem girá-lo (o +Y do glTF sai para cima)
    e.matrix_basis = Matrix.Translation(mundo)
    bpy.context.view_layer.update()
    return e


def malha_do_bigode(arm, id_do_bigode, lod):
    nome = "%s_%s" % (id_do_bigode, lod["nome"])
    for o in [o for o in bpy.data.objects if o.name == nome]:
        bpy.data.objects.remove(o, do_unlink=True)
    for me in [x for x in bpy.data.meshes if x.name == nome]:
        bpy.data.meshes.remove(me)
    base = B.gerar_bigode(lod, G.estado_da_cara(D.NOME_DA_BASE), id_do_bigode)
    me = bpy.data.meshes.new(nome)
    me.from_pydata([tuple(v * CM) for v in base.V], [], [tuple(f) for f in base.F])
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(M.material_do_bigode(D.COR_DO_BIGODE[id_do_bigode]))
    uv = me.uv_layers.new(name="UVMap")
    idx = np.zeros(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", idx)
    uv.data.foreach_set("uv", np.array(base.UV, dtype=np.float32)[idx].ravel())
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.shape_key_add(name="Basis", from_mix=False)
    for forma in D.FORMAS:
        m = B.gerar_bigode(lod, D.estado_da_forma(forma), id_do_bigode)
        assert len(m.V) == len(base.V), (id_do_bigode, forma)
        sk = ob.shape_key_add(name=forma, from_mix=False)
        sk.slider_min, sk.slider_max, sk.value = 0.0, 1.0, 0.0
        sk.data.foreach_set("co", (np.array(m.V) * CM).astype(np.float32).ravel())
    ob.data.shape_keys.name = nome + "_formas"
    prender_ao_osso(ob, arm, "espinha_2")
    ob.hide_set(True)
    ob.hide_viewport = True
    ob.hide_render = True
    return ob, B.contagem(base), len(base.V)


def vitrine_dos_estilos(arm):
    """Uma malha minúscula, dentro do corpo, com um triângulo por material de estilo (esclera e íris de cada estilo que o corpo não usa)."""
    nome = "estilos_de_olho"
    for o in [o for o in bpy.data.objects if o.name == nome]:
        bpy.data.objects.remove(o, do_unlink=True)
    for me in [x for x in bpy.data.meshes if x.name == nome]:
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(nome)
    verts, faces, mats = [], [], []
    i = 0
    materiais = []
    for estilo, esclera, iris in M.materiais_dos_estilos():
        for mat in (esclera, iris):
            materiais.append(mat)
            x = (i - 2.5) * 0.004
            verts += [(x, 0.012, -0.030), (x + 0.0015, 0.012, -0.030), (x, 0.012, -0.0285)]
            faces.append((3 * i, 3 * i + 1, 3 * i + 2))
            mats.append(i)
            i += 1
    me.from_pydata(verts, [], faces)
    me.update()
    for mat in materiais:
        me.materials.append(mat)
    for p, k in zip(me.polygons, mats):
        p.material_index = k
    uv = me.uv_layers.new(name="UVMap")
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    prender_ao_osso(ob, arm, "espinha_2")
    ob.hide_set(True)
    ob.hide_viewport = True
    ob.hide_render = True
    return ob


arm = bpy.data.objects[ARM]
bpy.context.view_layer.objects.active = arm
a = ancora_do_chapeu(arm)
print("ancora_chapeu mundo (cm)", [round(c / CM, 3) for c in a.matrix_world.translation])
for i in D.IDS_DE_BIGODE:
    for lod in (G.ALTA, G.BAIXA):
        ob, tris, nv = malha_do_bigode(arm, i, lod)
        print(ob.name, "triângulos", tris, "vértices", nv, "formas", len(ob.data.shape_keys.key_blocks) - 1)
vitrine_dos_estilos(arm)
