"""Etapa 1a: a forma da mão como união suave de metabolas (dedos roliços, palma cheia, polegar gordo).

Rode dentro do Blender (janela ou --background). Cria o objeto `mao_forma` (metabola) na cena.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import importlib

import mao_dados as D

importlib.reload(D)

K = 0.55  # raio visível / raio da metabola, com rigidez 2 e limiar 0,6 (calibrado no Blender 5.2)
CM = D.CM
# A resolução mínima da metabola é 5 mm. Para ter 1 mm modelamos 10× maior e o objeto leva escala 1/10.
ESC = 10.0


def v(t):
    return Vector((t[0] * CM * ESC, t[1] * CM * ESC, t[2] * CM * ESC))


def capsula(mb, p0, p1, raio_vis):
    """Cápsula do segmento p0→p1 (cm) com o raio visível dado; a ponta redonda passa de p1 pelo raio."""
    a, b = v(p0), v(p1)
    eixo = b - a
    e = mb.elements.new(type="CAPSULE")
    e.co = (a + b) / 2
    e.radius = raio_vis * CM * ESC / K
    e.stiffness = 2.0
    e.size_x = eixo.length / 2
    e.rotation = Vector((1, 0, 0)).rotation_difference(eixo.normalized())
    return e


def elipsoide(mb, centro, meia):
    e = mb.elements.new(type="ELLIPSOID")
    R = 0.04 * ESC
    e.co = v(centro)
    e.radius = R
    e.stiffness = 2.0
    e.size_x, e.size_y, e.size_z = (m * CM * ESC / (K * R) for m in meia)
    return e


def caixa(mb, centro, meia, arred):
    e = mb.elements.new(type="CUBE")
    e.co = v(centro)
    e.radius = arred * CM / K
    e.stiffness = 2.0
    e.size_x, e.size_y, e.size_z = (m * CM for m in meia)
    return e


def criar_metabola(resolucao=0.01):
    for o in [o for o in bpy.data.objects if o.name.startswith("mao_forma")]:
        bpy.data.objects.remove(o, do_unlink=True)
    mb = bpy.data.metaballs.new("mao_forma")
    mb.threshold = 0.6
    mb.resolution = resolucao
    mb.render_resolution = resolucao
    ob = bpy.data.objects.new("mao_forma", mb)
    ob.scale = (1 / ESC,) * 3
    bpy.context.scene.collection.objects.link(ob)

    for el in D.PALMA:
        elipsoide(mb, el["centro"], el["meia"])

    for nome, d in D.DEDOS.items():
        dx, dy, dz = D.direcao(d["ang"])
        r = d["raio"]
        raiz = Vector(d["raiz"])
        dir_ = Vector((dx, dy, dz))
        p0 = raiz - dir_ * 0.9  # afunda na palma para a união ficar macia
        p1 = raiz + dir_ * (d["comp"] - r)  # centro da ponta redonda
        capsula(mb, p0, p1, r)

    t = D.POLEGAR
    a = math.radians(t["ang"])
    dir_t = Vector((-math.sin(a), math.cos(a), 0.0))
    raiz_t = Vector(t["raiz"])
    mcp_t = raiz_t + dir_t * t["comp"] * t["div"][0]
    capsula(mb, raiz_t, mcp_t, t["raio_base"])
    capsula(mb, mcp_t, raiz_t + dir_t * (t["comp"] - t["raio"]), t["raio"])
    return ob


def material_latex(nome="latex", cor=D.COR_PREVIA, branco=False):
    mat = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    mat.use_nodes = True
    nos = mat.node_tree.nodes
    pb = next(n for n in nos if n.type == "BSDF_PRINCIPLED")
    c = (1, 1, 1, 1) if branco else (*cor, 1)
    pb.inputs["Base Color"].default_value = c
    pb.inputs["Roughness"].default_value = 0.28
    pb.inputs["Metallic"].default_value = 0.0
    for chave, valor in (("Coat Weight", 0.6), ("Coat Roughness", 0.08), ("Specular IOR Level", 0.5)):
        if chave in pb.inputs:
            pb.inputs[chave].default_value = valor
    return mat


if __name__ == "__main__" or "bpy" in globals():
    ob = criar_metabola()
    ob.data.materials.append(material_latex())
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    me.transform(ob.matrix_world)
    xs = [p.co.x for p in me.vertices]
    ys = [p.co.y for p in me.vertices]
    zs = [p.co.z for p in me.vertices]
    print("triângulos", len(me.polygons), "caixa (cm): x", round(min(xs) * 100, 2), round(max(xs) * 100, 2),
          "y", round(min(ys) * 100, 2), round(max(ys) * 100, 2), "z", round(min(zs) * 100, 2), round(max(zs) * 100, 2))
    bpy.data.meshes.remove(me)
