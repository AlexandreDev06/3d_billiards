"""Etapa 3a: as malhas do balão (`balao_alta`, `balao_baixa`), com materiais, UVs, cor de vértice, grupos de vértices e as formas do rosto.

As formas (shape keys) são relativas à base, que já é o rosto neutro: `cara_neutro` fica quase no zero e só existe pelo nome
(muda a bochecha em 0,02 cm). Cada forma é a malha inteira refeita no estado dela, então a topologia nunca muda.
Na janela do Blender (pelo MCP): exec deste arquivo. O esqueleto vem depois (`02_esqueleto.py`).
"""
import importlib
import os
import sys

import bpy
import numpy as np

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
PAI = os.path.dirname(PASTA)
if PAI not in sys.path:
    sys.path.insert(0, PAI)
import dados as D
import geometria as G
import materiais as M
import textura as T

importlib.reload(D)
importlib.reload(G)
importlib.reload(T)
importlib.reload(M)

FORMAS = D.FORMAS
materiais = M.materiais


def construir_malha(lod):
    base = G.gerar(lod, D.estado_da_forma(D.NOME_DA_BASE))
    nome = "balao_" + lod["nome"]
    for o in [o for o in bpy.data.objects if o.name == nome]:
        bpy.data.objects.remove(o, do_unlink=True)
    for me in [m for m in bpy.data.meshes if m.name == nome]:
        bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(nome)
    me.from_pydata([tuple(v * D.CM) for v in base.V], [], [tuple(f) for f in base.F])
    me.update()
    for p, mat in zip(me.polygons, base.M):
        p.use_smooth = True
        p.material_index = mat
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    for mt in materiais():
        me.materials.append(mt)
    # UV (do vértice para o canto) e cor de vértice
    uv = me.uv_layers.new(name="UVMap")
    idx = np.zeros(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", idx)
    uv.data.foreach_set("uv", np.array(base.UV, dtype=np.float32)[idx].ravel())
    ca = me.color_attributes.new(name="cor", type="FLOAT_COLOR", domain="POINT")
    cor = np.array(base.COL, dtype=np.float32)
    ca.data.foreach_set("color", np.stack([cor, cor, cor, np.ones_like(cor)], axis=1).ravel())
    # grupos de vértices: um por osso, os pesos de `geometria.py`
    grupos = {}
    for i, pesos in enumerate(base.W):
        for osso, w in pesos:
            if osso not in grupos:
                grupos[osso] = ob.vertex_groups.new(name=osso)
            grupos[osso].add([i], w, "REPLACE")
    # formas
    ob.shape_key_add(name="Basis", from_mix=False)
    for forma in FORMAS:
        e = D.estado_da_forma(forma)
        if forma == D.NOME_DA_BASE:
            e["bochecha"] = tuple(b + 0.02 for b in e["bochecha"])
        m = G.gerar(lod, e, com_faces=False)
        assert len(m.V) == len(base.V), forma
        sk = ob.shape_key_add(name=forma, from_mix=False)
        sk.slider_min, sk.slider_max, sk.value = 0.0, 1.0, 0.0
        pos = (np.array(m.V) * D.CM).astype(np.float32)
        sk.data.foreach_set("co", pos.ravel())
    ob.data.shape_keys.name = nome + "_formas"
    return ob, G.contagem(base)


for lod in (G.ALTA, G.BAIXA):
    ob, tris = construir_malha(lod)
    print(ob.name, "triângulos", tris, "vértices", len(ob.data.vertices), "formas", len(ob.data.shape_keys.key_blocks) - 1)
