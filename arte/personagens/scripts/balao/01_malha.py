"""Etapa 3a: as malhas do balão (`balao_alta`, `balao_baixa`), com materiais, grupos de vértices e as formas do rosto.

As formas (shape keys) são relativas à base, que já é o rosto neutro: `cara_neutro` fica no zero e só existe pelo nome
(muda a bochecha em 0,02 cm). Cada forma é a malha inteira refeita na expressão, então a topologia nunca muda.
Na janela do Blender (pelo MCP): exec deste arquivo. O esqueleto vem depois (`02_esqueleto.py`).
"""
import importlib
import os
import sys

import bpy

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
PAI = os.path.dirname(PASTA)
if PAI not in sys.path:
    sys.path.insert(0, PAI)
import dados as D
import geometria as G
import mao_lib as L

importlib.reload(D)
importlib.reload(G)

NOMES_DOS_MATERIAIS = ["latex", "olho_branco", "rosto_preto", "lingua", "cordinha"]
FORMAS = ["cara_neutro", "cara_sorriso", "cara_susto", "cara_bravo", "cara_triste", "piscar"]


def materiais(branco=False):
    """Os cinco materiais, em ordem do índice. O látex leva a cor da equipe (prévia) ou branco (.glb)."""
    nome_latex = "latex_glb" if branco else "latex"
    latex = L.material_latex(nome=nome_latex, cor=D.COR_PREVIA, branco=branco)
    pb = next(n for n in latex.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    pb.inputs["Roughness"].default_value = 0.2   # balão de festa: mais lustroso que a luva
    pb.inputs["Coat Weight"].default_value = 1.0

    def simples(nome, cor, rugosidade, verniz=0.0, brilho=0.0, cor_brilho=(1, 1, 1)):
        m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
        m.use_nodes = True
        p = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        p.inputs["Base Color"].default_value = (*cor, 1)
        p.inputs["Roughness"].default_value = rugosidade
        p.inputs["Metallic"].default_value = 0.0
        if "Coat Weight" in p.inputs:
            p.inputs["Coat Weight"].default_value = verniz
        if brilho and "Emission Color" in p.inputs:
            p.inputs["Emission Color"].default_value = (*cor_brilho, 1)
            p.inputs["Emission Strength"].default_value = brilho
        return m
    return [
        latex,
        simples("olho_branco", (0.96, 0.96, 0.94), 0.12, verniz=1.0, brilho=0.30),
        simples("rosto_preto", (0.012, 0.011, 0.014), 0.5, verniz=0.0),
        simples("lingua", (0.93, 0.36, 0.44), 0.45, verniz=0.4, brilho=0.22, cor_brilho=(0.93, 0.36, 0.44)),
        simples("cordinha", (0.92, 0.86, 0.70), 0.55),
    ]


def estado(nome):
    e = G.estado_da_cara(D.NOME_DA_BASE)
    if nome == "piscar":
        e["palpebra_sup"], e["palpebra_inf"] = D.PISCAR["palpebra_sup"], D.PISCAR["palpebra_inf"]
    elif nome == "cara_neutro":
        e["bochecha"] += 0.02
    else:
        e = G.estado_da_cara(nome)
    return e


def construir_malha(lod):
    base = G.gerar(lod, estado(D.NOME_DA_BASE))
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
        m = G.gerar(lod, estado(forma))
        assert len(m.V) == len(base.V) and m.F == base.F, forma
        sk = ob.shape_key_add(name=forma, from_mix=False)
        sk.slider_min, sk.slider_max, sk.value = 0.0, 1.0, 0.0
        for i, v in enumerate(m.V):
            sk.data[i].co = tuple(v * D.CM)
    ob.data.shape_keys.name = nome + "_formas"
    return ob, G.contagem(base)


for lod in (G.ALTA, G.BAIXA):
    ob, tris = construir_malha(lod)
    print(ob.name, "triângulos", tris, "vértices", len(ob.data.vertices), "formas", [k.name for k in ob.data.shape_keys.key_blocks])
