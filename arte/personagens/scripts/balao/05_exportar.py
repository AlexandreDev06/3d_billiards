"""Etapa 3e: exporta `exportados/balao.glb` (esqueleto, `balao_alta`, `balao_baixa`, os pontos das mãos e as seis ações) e `balao-meta.json`.

No .glb o látex tem cor base branca (o jogo tinge) e verniz em KHR_materials_clearcoat. As formas do rosto saem como morph targets
(os nomes em `extras.targetNames`). O osso `olhar` não vai (só serve de alvo da prévia no Blender).
Sem janela: DISPLAY=:1 blender -b arte/personagens/balao.blend --python arte/personagens/scripts/balao/05_exportar.py
"""
import importlib
import json
import math
import os
import sys

import bpy
from mathutils import Vector

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
PAI = os.path.dirname(PASTA)
for p in (PASTA, PAI):
    if p not in sys.path:
        sys.path.insert(0, p)
import dados as D
import geometria as G
import mao_lib as L

importlib.reload(D)
importlib.reload(G)
importlib.reload(L)

SAIDA = os.path.abspath(os.path.join(PASTA, "..", "..", "exportados"))
MALHAS = ("balao_alta", "balao_baixa")
FORMAS = ["cara_neutro", "cara_sorriso", "cara_susto", "cara_bravo", "cara_triste", "piscar"]
FPS = 30


def glb_coord(p):
    """Blender (x, y, z) em metros → glTF (x, z, -y)."""
    return [round(p[0], 5), round(p[2], 5), round(-p[1], 5)]


def exportar():
    os.makedirs(SAIDA, exist_ok=True)
    arm = bpy.data.objects["balao_esqueleto"]
    maos = [bpy.data.objects[n] for n in D.PONTOS_DAS_MAOS]
    objetos = [arm] + [bpy.data.objects[n] for n in MALHAS] + maos
    original = {n: list(bpy.data.objects[n].data.materials) for n in MALHAS}
    latex_branco = L.material_latex(nome="latex_glb", branco=True)
    pb = next(n for n in latex_branco.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    pb.inputs["Roughness"].default_value = 0.2
    pb.inputs["Coat Weight"].default_value = 1.0
    ocultos = [(o, o.hide_get(), o.hide_viewport) for o in objetos]
    for o in objetos:
        o.hide_set(False)
        o.hide_viewport = False
    for n in MALHAS:
        bpy.data.objects[n].data.materials[0] = latex_branco
        for kb in bpy.data.objects[n].data.shape_keys.key_blocks[1:]:
            kb.value = 0.0
    ad = arm.animation_data_create()
    ad.use_nla = True
    ad.action = None
    L.zerar(arm)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objetos:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    propriedades = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    pedido = dict(
        filepath=os.path.join(SAIDA, "balao.glb"), export_format="GLB", use_selection=True, export_yup=True,
        export_apply=False, export_skins=True, export_def_bones=True, export_animations=True,
        export_animation_mode="NLA_TRACKS", export_frame_range=False, export_force_sampling=True, export_optimize_animation_size=False,
        export_materials="EXPORT", export_cameras=False, export_lights=False, export_extras=False,
        export_morph=True, export_morph_normal=False, export_morph_tangent=False, export_texcoords=False, export_attributes=False,
        export_nla_strips=True,
    )
    try:
        bpy.ops.export_scene.gltf(**{k: v for k, v in pedido.items() if k in propriedades})
    finally:
        for n in MALHAS:
            me = bpy.data.objects[n].data
            for k, m in enumerate(original[n]):
                me.materials[k] = m
        for o, h, hv in ocultos:
            o.hide_set(h)
            o.hide_viewport = hv
    return os.path.join(SAIDA, "balao.glb")


def tirar_canais_dos_olhos(caminho):
    """Os olhos são do jogo (olhar): as ações não podem escrever neles. Tira esses canais do .glb e reescreve o bloco JSON."""
    import struct
    b = open(caminho, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    olhos = {i for i, nd in enumerate(j["nodes"]) if nd.get("name") in ("olho_esq", "olho_dir")}
    for a in j["animations"]:
        a["channels"] = [c for c in a["channels"] if c["target"]["node"] not in olhos]
        usados = sorted({c["sampler"] for c in a["channels"]})
        novo = {v: k for k, v in enumerate(usados)}
        a["samplers"] = [a["samplers"][i] for i in usados]
        for c in a["channels"]:
            c["sampler"] = novo[c["sampler"]]
    texto = json.dumps(j, separators=(",", ":")).encode()
    texto += b" " * (-len(texto) % 4)
    resto = b[20 + n:]
    comp = 12 + 8 + len(texto) + len(resto)
    open(caminho, "wb").write(b[:8] + struct.pack("<I", comp) + struct.pack("<I", len(texto)) + b[16:20] + texto + resto)


def meta(arquivo):
    """`balao-meta.json`: tudo que o Frontend precisa saber para usar o balão sem abrir o Blender."""
    arm = bpy.data.objects["balao_esqueleto"]
    bpy.context.view_layer.update()
    olhos = {}
    for lado, nome in ((+1, "olho_esq"), (-1, "olho_dir")):
        c = G.centro_do_olho(lado)
        olhos[nome] = {"centro_m": glb_coord(c * D.CM), "eixo_do_olhar_no_repouso": glb_coord(G.eixo_do_olhar(lado)), "pai": "espinha_2"}
    acoes = {}
    for ac in bpy.data.actions:
        if ac.name.startswith("balao_"):
            r = D.TRECHOS.get(ac.name, {})
            acoes[ac.name] = {
                "quadros": int(ac.frame_range[1]), "fps": FPS, "segundos": round(ac.frame_range[1] / FPS, 3),
                "repete": "ciclo" in r and r["ciclo"][0] == 0, "entrada_quadros": list(r["entrada"]) if "entrada" in r else None,
                "ciclo_quadros": list(r["ciclo"]) if "ciclo" in r else None, "cara_par": D.PAR_DE_CARA[ac.name],
            }
    tris = {}
    for n in MALHAS:
        me = bpy.data.objects[n].data
        tris[n] = sum(len(p.vertices) - 2 for p in me.polygons)
    return {
        "arquivo": os.path.basename(arquivo),
        "unidades": "metros; origem no centro do corpo; o rosto olha para +Z (yaw 0 do jogo); +X é a esquerda do balão (a direita de quem o vê de frente)",
        "tamanho_repouso_cm": {"metade_altura": D.METADE_ALTURA, "raio": D.RAIO, "no_z": D.Z_DO_NO, "cordinha": D.CORDINHA_COMPRIMENTO},
        "malhas": {"balao_alta": {"triangulos": tris["balao_alta"]}, "balao_baixa": {"triangulos": tris["balao_baixa"]}},
        "materiais": {"latex_glb": "branco, o jogo tinge com a cor da equipe (verniz KHR_materials_clearcoat)", "olho_branco": "globo e reflexos",
                      "rosto_preto": "pupila, sobrancelha, boca", "lingua": "língua e bochecha", "cordinha": "cordinha e nó em creme"},
        "formas": {
            "nomes": FORMAS,
            "uso": "morph targets em `morphTargetDictionary`; peso 0 é o rosto neutro; `cara_neutro` é o rosto-base e só existe pelo nome; "
                   "`piscar` soma às caras (peso 1 fecha as pálpebras, ao multiplicar a cara por 1 - piscar o resto fica certo); "
                   "o GLTFLoader cria um filho por material: aplique o peso nos `morphTargetInfluences` de TODOS os filhos de `balao_alta`/`balao_baixa`",
        },
        "olhos": olhos,
        "olhar": {
            "limite_graus": D.LIMITE_DO_OLHAR,
            "como": "no carregamento, eixo_repouso_no_pai = inverse(quaternion_mundial_do_pai) * eixo_do_olhar_no_repouso e quaternion_de_repouso = quaternion do osso do olho; "
                    "a cada quadro (depois do mixer), q = setFromUnitVectors(eixo_repouso_no_pai, direcao_do_alvo_no_pai), com o ângulo limitado a `limite_graus`, "
                    "e osso.quaternion = q * quaternion_de_repouso; `olharPara` em arte/visor/balao.js é a conta pronta",
        },
        "ossos": {
            "raiz": "leva tudo (balanço, pulo)",
            "espinha_1": "gira e escala a partir do pescoço (estufar, murchar, inclinar)",
            "espinha_2": "meio do corpo e do rosto; pai dos olhos e dos pontos das mãos",
            "espinha_3": "topo",
            "no": "nó (filho da raiz; não escala com o corpo)",
            "cordinha_1..4": "corrente da cordinha, do nó para baixo",
            "olho_esq/olho_dir": "olhar",
        },
        "pontos_das_maos": {n: {"pai": "espinha_2", "posicao_repouso_m": glb_coord(Vector(p) * D.CM),
                                "uso": "ponha a `mao.glb` aqui; use só a posição (e a orientação), não a escala do pai"} for n, p in D.PONTOS_DAS_MAOS.items()},
        "acoes": acoes,
        "par_de_cara": D.PAR_DE_CARA,
    }


def principal():
    arquivo = exportar()
    tirar_canais_dos_olhos(arquivo)
    caminho = os.path.join(SAIDA, "balao-meta.json")
    with open(caminho, "w") as f:
        json.dump(meta(arquivo), f, indent=2, ensure_ascii=False)
    print("exportado", arquivo, os.path.getsize(arquivo), "bytes;", caminho)


principal()
