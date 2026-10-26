"""Etapa 1b: da forma de metabolas às malhas finais: `mao_alta` (~4 mil triângulos) e `mao_baixa` (~800).

Retopologia em quadriláteros regulares (Quadriflow) da casca da forma, mais o punho enrolado como casca à parte.
Pré-requisito: `01_forma.py` rodou (objeto `mao_forma`).
"""
import importlib
import os
import sys

import bpy
import bmesh

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import mao_dados as D
import mao_lib as L

importlib.reload(D)
importlib.reload(L)

# quadriláteros da mão sem o punho, e do punho: lados × anéis do perfil
ALTA = dict(quadros=1480, lados_punho=20, por_trecho=2)
BAIXA = dict(quadros=330, lados_punho=10, por_trecho=1)


def construir_lod(nome, base, quadros, lados_punho, por_trecho, branco=False):
    L.apagar(nome)
    ob_tmp = L.quadriflow(base.copy(), quadros, "tmp_" + nome)
    bm = bmesh.new()
    bm.from_mesh(ob_tmp.data)
    meshes_tmp = ob_tmp.data
    bpy.data.objects.remove(ob_tmp, do_unlink=True)
    bpy.data.meshes.remove(meshes_tmp)
    n_mao = len(bm.verts)
    punho = L.malha_do_punho(lados_punho, por_trecho)
    bm = L.unir_bmeshes(bm, punho)
    me = L.malha_de_bmesh(nome, bm)
    me["n_mao"] = n_mao  # os vértices da mão vêm antes dos do punho (o esqueleto usa isto)
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(L.material_latex(branco=branco))
    return ob


def principal():
    for p in ("mao_alta", "mao_baixa", "tmp_"):
        L.apagar(p)
    bm = L.malha_densa_da_forma()
    base = L.reduzir(bm)
    alta = construir_lod("mao_alta", base, **ALTA)
    baixa = construir_lod("mao_baixa", base, **BAIXA)
    bpy.data.meshes.remove(base)
    for ob in (alta, baixa):
        print(ob.name, "quadros", sum(1 for p in ob.data.polygons if len(p.vertices) == 4),
              "triângulos", sum(len(p.vertices) - 2 for p in ob.data.polygons), "vértices", len(ob.data.vertices))
    if "mao_forma" in bpy.data.objects:
        bpy.data.objects["mao_forma"].hide_set(True)
        bpy.data.objects["mao_forma"].hide_render = True
    return alta, baixa


if __name__ == "__main__":
    principal()
