"""Monta os oito chapéus no Blender e exporta `exportados/chapeus.glb` (um nó raiz por chapéu e por nível: `<id>_alta` e `<id>_baixa`) e `chapeus-meta.json`.

A origem de cada nó é o alto da cabeça (o ponto que encosta na `ancora_chapeu` do balão), +Y sobe, a frente é +Z. Os materiais são PBR com textura pequena (PNG). A escrita é atômica:
o .glb e o meta nascem numa pasta temporária ao lado de `exportados/` e só então são movidos com `os.replace`. Se `VALIDADOR` (um `.mjs` do gltf-validator) achar erro, nada é movido.
`SAIDA_CHAPEUS=<pasta>` exporta para outro lugar (ensaio).

Sem janela:  blender -b --factory-startup --python arte/personagens/scripts/chapeus/exportar_chapeus.py
"""
import importlib
import json
import math
import os
import shutil
import struct
import subprocess
import sys

import bpy
import numpy as np

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import dados_chapeus as C
import modelos_chapeus as MO
import texturas_chapeus as T

for _m in (C, MO, T):
    importlib.reload(_m)

CM = 0.01
SAIDA = os.path.abspath(os.environ.get("SAIDA_CHAPEUS") or os.path.join(PASTA, "..", "..", "exportados"))
TEMP = os.path.join(os.path.dirname(SAIDA), ".exportando-chapeus")
ORCAMENTO = {"alta": 3000, "baixa": 600}

# nome do material -> como montar (tex: PNG; cor: fator multiplicado pela textura, em sRGB; rug/metal/verniz/lustro/emissao)
MATERIAIS = {
    "palha": dict(tex="palha.png", rug=0.78),
    "faixa_preta": dict(cor=(0.045, 0.045, 0.05), rug=0.6),
    "tecido_bone": dict(tex="tecido_bone.png", rug=0.85),
    "aba_bone": dict(tex="tecido_bone.png", cor=(0.78, 0.78, 0.80), rug=0.7),
    "emblema_8": dict(tex="emblema_8.png", rug=0.6),
    "feltro_preto": dict(tex="feltro.png", cor=(0.16, 0.16, 0.17), rug=0.9),
    "cetim_vermelho": dict(cor=(0.62, 0.05, 0.09), rug=0.28, lustro=1.0),
    "ouro": dict(tex="ouro.png", cor=(1.0, 0.90, 0.60), metal=0.7, rug=0.34, emissao=0.30),
    "la_listrada": dict(tex="la_listrada.png", rug=1.0),
    "la_barra": dict(tex="la_barra.png", rug=1.0),
    "la_pompom": dict(tex="la_pompom.png", rug=1.0),
    "xadrez": dict(tex="xadrez.png", rug=0.85),
    "fita_vermelha": dict(cor=(0.80, 0.08, 0.11), rug=0.5, lustro=0.5),
    "feltro_vinho": dict(tex="feltro.png", cor=(0.80, 0.10, 0.22), rug=0.9),
    "faixa_boina": dict(tex="feltro.png", cor=(0.50, 0.07, 0.14), rug=0.9),
    "listras_festa": dict(tex="listras_festa.png", rug=0.5),
    "elastico": dict(cor=(0.96, 0.93, 0.82), rug=0.6),
    "pompom_festa": dict(cor=(0.94, 0.20, 0.58), rug=0.9, lustro=0.6),
    "gema_vermelha": dict(cor=(0.90, 0.05, 0.10), rug=0.08, verniz=1.0, emissao=0.35),
    "gema_azul": dict(cor=(0.08, 0.30, 0.98), rug=0.08, verniz=1.0, emissao=0.35),
    "gema_verde": dict(cor=(0.06, 0.80, 0.28), rug=0.08, verniz=1.0, emissao=0.35),
}


def linear(c):
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c)


def material(nome):
    spec = MATERIAIS[nome]
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    m.use_nodes = True
    m.use_backface_culling = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "BSDF_PRINCIPLED" and n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    pb = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    for l in list(nt.links):
        if l.to_node == pb:
            nt.links.remove(l)
    pb.inputs["Roughness"].default_value = spec.get("rug", 0.6)
    pb.inputs["Metallic"].default_value = spec.get("metal", 0.0)
    pb.inputs["Coat Weight"].default_value = spec.get("verniz", 0.0)
    pb.inputs["Sheen Weight"].default_value = spec.get("lustro", 0.0)
    cor = spec.get("cor")
    if spec.get("tex"):
        im = bpy.data.images.get(spec["tex"]) or bpy.data.images.load(os.path.join(T.SAIDA, spec["tex"]))
        im.filepath = os.path.join(T.SAIDA, spec["tex"])
        im.reload()
        im.colorspace_settings.name = "sRGB"
        im.pack()
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = im
        tex.extension = "REPEAT"
        if cor:
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs[0].default_value = 1.0
            mix.inputs[7].default_value = (*linear(cor), 1.0)
            nt.links.new(tex.outputs["Color"], mix.inputs[6])
            nt.links.new(mix.outputs[2], pb.inputs["Base Color"])
        else:
            nt.links.new(tex.outputs["Color"], pb.inputs["Base Color"])
    else:
        pb.inputs["Base Color"].default_value = (*linear(cor), 1.0)
    if spec.get("emissao"):
        pb.inputs["Emission Color"].default_value = (*linear(cor), 1.0)
        pb.inputs["Emission Strength"].default_value = spec["emissao"]
    return m


def objeto(nome, malha):
    for o in [o for o in bpy.data.objects if o.name == nome]:
        bpy.data.objects.remove(o, do_unlink=True)
    for me in [x for x in bpy.data.meshes if x.name == nome]:
        bpy.data.meshes.remove(me)
    V = [tuple(np.array(v) * CM) for v in malha.V]
    me = bpy.data.meshes.new(nome)
    me.from_pydata(V, [], [tuple(f) for f in malha.F])
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    uv = me.uv_layers.new(name="UVMap")
    k = 0
    for p, uvs in zip(me.polygons, malha.UVF):
        for i in range(p.loop_total):
            uv.data[p.loop_start + i].uv = uvs[i]
            k += 1
    for nm in malha.nomes:
        me.materials.append(material(nm))
    for p, mi in zip(me.polygons, malha.M):
        p.material_index = mi
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def montar():
    for nome, rgba in T.todas().items():
        T.gravar(nome, rgba)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    objetos, info = [], {}
    for i in C.IDS:
        info[i] = {}
        for lod in ("alta", "baixa"):
            malha = MO.MODELOS[i](C.LOD[lod])
            nome = "%s_%s" % (i, lod)
            ob = objeto(nome, malha)
            objetos.append(ob)
            V = np.array(malha.V)
            info[i][lod] = {"no": nome, "triangulos": malha.triangulos(), "vertices": len(malha.V), "materiais": list(malha.nomes),
                            "caixa_cm": {"x": [round(float(V[:, 0].min()), 3), round(float(V[:, 0].max()), 3)], "y_sobe": [round(float(V[:, 2].min()), 3), round(float(V[:, 2].max()), 3)],
                                         "z_frente": [round(float(-V[:, 1].max()), 3), round(float(-V[:, 1].min()), 3)]}}
            assert info[i][lod]["triangulos"] <= ORCAMENTO[lod], (nome, info[i][lod]["triangulos"])
    return objetos, info


def exportar(destino, objetos):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objetos:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objetos[0]
    propriedades = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    pedido = dict(
        filepath=destino, export_format="GLB", use_selection=True, export_yup=True, export_apply=False, export_skins=False, export_animations=False,
        export_materials="EXPORT", export_cameras=False, export_lights=False, export_extras=False, export_morph=False,
        export_texcoords=True, export_attributes=False, export_vertex_color="NONE", export_image_format="AUTO",
    )
    bpy.ops.export_scene.gltf(**{k: v for k, v in pedido.items() if k in propriedades})


def validar(caminho):
    validador = os.environ.get("VALIDADOR")
    if not validador:
        return None
    r = subprocess.run(["node", validador, caminho], capture_output=True, text=True)
    print(r.stdout.strip())
    return "erros 0 " in r.stdout


def principal():
    shutil.rmtree(TEMP, ignore_errors=True)
    os.makedirs(TEMP)
    os.makedirs(SAIDA, exist_ok=True)
    objetos, info = montar()
    glb = os.path.join(TEMP, "chapeus.glb")
    exportar(glb, objetos)
    meta = {
        "arquivo": "chapeus.glb", "versao": 1,
        "unidades": "metros; a origem de cada nó é o alto da cabeça do balão (o ponto que encosta na `ancora_chapeu` de `balao.glb`); +Y sobe e a frente do rosto é +Z",
        "nos": "um nó raiz por chapéu e por nível, com o id do contrato mais `_alta` ou `_baixa` (por exemplo `cartola_alta`, `chapeu_palha_baixa`): sem prefixo `chapeu_` a mais",
        "como_usar": "clone o nó do nível em uso (`SkeletonUtils` não é preciso: são malhas comuns), ponha-o como filho do nó `ancora_chapeu` do balão (posição e giro zero) e aplique a regra de escala de "
                     "`balao-meta.json` > `ancora_chapeu.escala_do_chapeu` (o nó herda a escala do osso `espinha_3`, que estica e amassa)",
        "orcamento_triangulos": ORCAMENTO,
        "chapeus": info,
        "ids": C.IDS,
        "assento": "a borda de baixo de cada chapéu está na altura em que o corpo do balão tem o raio interno do chapéu (a curva do topo); nenhum desce abaixo da sobrancelha mais alta (z do corpo %.2f cm)" % C.SOBRANCELHA_MAX_Z,
    }
    caminho_meta = os.path.join(TEMP, "chapeus-meta.json")
    with open(caminho_meta, "w") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
        f.write("\n")
    ok = validar(glb)
    if ok is False:
        print("O validador achou erro: nada foi movido; arquivos em", TEMP)
        sys.exit(1)
    os.replace(glb, os.path.join(SAIDA, "chapeus.glb"))
    os.replace(caminho_meta, os.path.join(SAIDA, "chapeus-meta.json"))
    shutil.rmtree(TEMP, ignore_errors=True)
    print("exportado", os.path.join(SAIDA, "chapeus.glb"), os.path.getsize(os.path.join(SAIDA, "chapeus.glb")), "bytes")
    for i in C.IDS:
        print("  %-14s alta %5d  baixa %4d" % (i, info[i]["alta"]["triangulos"], info[i]["baixa"]["triangulos"]))


principal()
