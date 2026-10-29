"""Os nove materiais do balão (índices de `geometria.NOMES_DOS_MATERIAIS`), em nós do Blender.

O látex tem duas versões: a de prévia (cor da equipe x cor de vértice `cor`) e a do .glb (`latex_glb`: só a cor de vértice, branca por baixo; o jogo tinge).
"""
import os

import bpy

import dados as D
import textura as T


def _no(m, tipo, x, y):
    n = m.node_tree.nodes.new(tipo)
    n.location = (x, y)
    return n


def _principled(m):
    m.use_nodes = True
    m.use_backface_culling = True       # as malhas são de um lado só (todas fechadas): no .glb sai `doubleSided: false`
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def _imagem(nome):
    caminho = os.path.join(T.SAIDA, nome)
    if not hasattr(_imagem, "feito"):               # as texturas saem dos números de `textura.py` a cada montagem (nunca ficam velhas no disco)
        for arquivo, rgba in T.todas().items():
            T.gravar(arquivo, rgba)
        _imagem.feito = True
    im = bpy.data.images.get(nome) or bpy.data.images.load(caminho)
    im.filepath = caminho
    im.reload()
    im.colorspace_settings.name = "sRGB"
    im.pack()
    return im


def latex(branco):
    """O látex: branco no .glb (o jogo tinge) com a cor de vértice (o escuro do nó e do pescoço); na prévia, a cor da equipe vezes a cor de vértice."""
    nome = "latex_glb" if branco else "latex"
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    pb = _principled(m)
    for n in [n for n in m.node_tree.nodes if n.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL")]:
        m.node_tree.nodes.remove(n)
    attr = _no(m, "ShaderNodeVertexColor", -500, 200)
    attr.layer_name = "cor"
    # cor de vértice x cor da equipe (branca no .glb): é o desenho que o exportador do glTF reconhece como COLOR_0
    mix = _no(m, "ShaderNodeMix", -300, 200)
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = (1.0, 1.0, 1.0, 1.0) if branco else (*D.COR_PREVIA, 1.0)
    m.node_tree.links.new(attr.outputs["Color"], mix.inputs["A"])
    m.node_tree.links.new(mix.outputs["Result"], pb.inputs["Base Color"])
    pb.inputs["Roughness"].default_value = 0.2
    pb.inputs["Metallic"].default_value = 0.0
    pb.inputs["Coat Weight"].default_value = 1.0
    pb.inputs["Coat Roughness"].default_value = 0.05
    pb.inputs["Specular IOR Level"].default_value = 0.5
    if "Sheen Weight" in pb.inputs:
        pb.inputs["Sheen Weight"].default_value = 0.25
        pb.inputs["Sheen Roughness"].default_value = 0.45
    return m


def simples(nome, cor, rugosidade, verniz=0.0, brilho=0.0, cor_brilho=None):
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    p = _principled(m)
    p.inputs["Base Color"].default_value = (*cor, 1)
    p.inputs["Roughness"].default_value = rugosidade
    p.inputs["Metallic"].default_value = 0.0
    p.inputs["Coat Weight"].default_value = verniz
    if brilho:
        p.inputs["Emission Color"].default_value = (*(cor_brilho or cor), 1)
        p.inputs["Emission Strength"].default_value = brilho
    return m


def material_do_olho(estilo="olho_normal"):
    """A esclera de um estilo: o normal chama `olho` (o nome do v2); os outros, `olho_kawaii`, `olho_bravo` e `olho_cansado`."""
    nome = "olho" if estilo == "olho_normal" else estilo
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    pb = _principled(m)
    tex = m.node_tree.nodes.get("textura") or _no(m, "ShaderNodeTexImage", -500, 200)
    tex.name = "textura"
    tex.image = _imagem("esclera_%s.png" % estilo[len("olho_"):])
    tex.interpolation = "Linear"
    tex.extension = "EXTEND"
    m.node_tree.links.new(tex.outputs["Color"], pb.inputs["Base Color"])
    m.node_tree.links.new(tex.outputs["Color"], pb.inputs["Emission Color"])
    pb.inputs["Emission Strength"].default_value = 0.30
    pb.inputs["Roughness"].default_value = 0.14
    pb.inputs["Metallic"].default_value = 0.0
    pb.inputs["Coat Weight"].default_value = 1.0
    pb.inputs["Coat Roughness"].default_value = 0.02
    return m


def _linear(hexa):
    """`#RRGGBB` (sRGB) para (r, g, b) lineares: é o que o Blender e o glTF guardam em fatores de cor."""
    c = [int(hexa[i:i + 2], 16) / 255.0 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def material_da_iris(estilo="olho_normal", cor=None):
    """A íris em tons de cinza vezes a cor do olho (fator de cor do material: o jogo troca `color` e `emissive`). Sem tom, o `castanho`. O normal chama `iris`."""
    nome = "iris" if estilo == "olho_normal" else "iris_" + estilo[len("olho_"):]
    m = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    pb = _principled(m)
    for n in [n for n in m.node_tree.nodes if n.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL")]:
        m.node_tree.nodes.remove(n)
    tex = _no(m, "ShaderNodeTexImage", -600, 200)
    tex.name = "textura"
    tex.image = _imagem("iris_%s.png" % estilo[len("olho_"):])
    tex.extension = "EXTEND"
    mix = _no(m, "ShaderNodeMix", -300, 200)
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = (*_linear(D.CORES_DE_OLHO[cor or D.COR_PADRAO_DE_OLHO]["cor"]), 1.0)
    m.node_tree.links.new(tex.outputs["Color"], mix.inputs["A"])
    m.node_tree.links.new(mix.outputs["Result"], pb.inputs["Base Color"])
    m.node_tree.links.new(mix.outputs["Result"], pb.inputs["Emission Color"])
    pb.inputs["Emission Strength"].default_value = 0.30
    pb.inputs["Roughness"].default_value = 0.14
    pb.inputs["Metallic"].default_value = 0.0
    pb.inputs["Coat Weight"].default_value = 1.0
    pb.inputs["Coat Roughness"].default_value = 0.02
    return m


def material_da_olheira():
    m = bpy.data.materials.get("olheira") or bpy.data.materials.new("olheira")
    pb = _principled(m)
    tex = m.node_tree.nodes.get("textura") or _no(m, "ShaderNodeTexImage", -500, 200)
    tex.name = "textura"
    tex.image = _imagem("olheira.png")
    tex.extension = "EXTEND"
    m.node_tree.links.new(tex.outputs["Color"], pb.inputs["Base Color"])
    m.node_tree.links.new(tex.outputs["Alpha"], pb.inputs["Alpha"])
    pb.inputs["Roughness"].default_value = 0.6
    pb.inputs["Coat Weight"].default_value = 0.0
    try:
        m.surface_render_method = "BLENDED"
    except Exception:
        pass
    try:
        m.blend_method = "BLEND"
    except Exception:
        pass
    return m


def material_do_bigode(cor):
    """O bigode tem cor fixa (preto, castanho ou grisalho): textura de fios, sem tinta da equipe."""
    m = bpy.data.materials.get("bigode_" + cor) or bpy.data.materials.new("bigode_" + cor)
    pb = _principled(m)
    tex = m.node_tree.nodes.get("textura") or _no(m, "ShaderNodeTexImage", -500, 200)
    tex.name = "textura"
    tex.image = _imagem("cabelo_%s.png" % cor)
    tex.extension = "REPEAT"
    m.node_tree.links.new(tex.outputs["Color"], pb.inputs["Base Color"])
    pb.inputs["Roughness"].default_value = 0.55
    pb.inputs["Metallic"].default_value = 0.0
    pb.inputs["Coat Weight"].default_value = 0.0
    if "Sheen Weight" in pb.inputs:
        pb.inputs["Sheen Weight"].default_value = 0.35
        pb.inputs["Sheen Roughness"].default_value = 0.5
    return m


def materiais_dos_estilos():
    """Os materiais dos estilos que não são o normal, na ordem de `D.IDS_DE_ESTILO[1:]`: (esclera, íris) de cada um; vão numa malha escondida (vitrine) para o jogo achar."""
    return [(e, material_do_olho(e), material_da_iris(e)) for e in D.IDS_DE_ESTILO[1:]]


def material_da_bochecha():
    m = bpy.data.materials.get("bochecha") or bpy.data.materials.new("bochecha")
    pb = _principled(m)
    tex = m.node_tree.nodes.get("textura") or _no(m, "ShaderNodeTexImage", -500, 200)
    tex.name = "textura"
    tex.image = _imagem("bochecha.png")
    tex.extension = "EXTEND"
    m.node_tree.links.new(tex.outputs["Color"], pb.inputs["Base Color"])
    m.node_tree.links.new(tex.outputs["Alpha"], pb.inputs["Alpha"])
    m.node_tree.links.new(tex.outputs["Color"], pb.inputs["Emission Color"])       # o rubor é rosa de qualquer luz: sem isto ele escurece e vira mancha vermelha
    pb.inputs["Emission Strength"].default_value = 0.45
    pb.inputs["Roughness"].default_value = 0.4
    pb.inputs["Coat Weight"].default_value = 0.0
    try:
        m.surface_render_method = "BLENDED"
    except Exception:
        pass
    try:
        m.blend_method = "BLEND"
    except Exception:
        pass
    return m


def materiais(branco=False):
    """Os nove materiais, em ordem do índice de `geometria.NOMES_DOS_MATERIAIS`."""
    return [
        latex(branco),
        material_do_olho(),
        simples("rosto_preto", (0.012, 0.011, 0.014), 0.45),
        simples("lingua", (0.93, 0.36, 0.44), 0.4, verniz=0.4, brilho=0.2),
        simples("cordinha", (0.92, 0.86, 0.70), 0.5),
        simples("brilho", (1.0, 1.0, 1.0), 0.35, brilho=1.0),
        material_da_bochecha(),
        simples("dente", (0.99, 0.98, 0.95), 0.28, verniz=0.5, brilho=0.30),
        simples("boca", (0.075, 0.012, 0.02), 0.5),
        material_da_iris("olho_normal"),
        material_da_olheira(),
    ]
