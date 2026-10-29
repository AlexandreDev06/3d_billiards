"""Leva a cena do boteco (`cena.py`) para o Blender, assa a luz no Cycles e exporta o .glb de um nível (P5).

    blender -b --factory-startup --python arte/boteco/scripts/construir.py -- --fase montar|exportar --nivel alto|medio|baixo [--rapido]

`montar`: constrói os objetos, põe as luzes (luminária, néon, lâmpadas, janela, geladeiras, TV) e uma mesa de referência que só faz sombra, desembrulha o que é
"assado" num atlas (UV2, densidade de texels por material) e assa no Cycles três coisas: a cor (albedo com foto, sujeira e decais), a luz (direta e indireta, só a luz,
sem a cor) e a oclusão de ambiente, mais um mapa de marcas (o que já nasce aceso).
Grava tudo em `arte/boteco/trabalho/<nivel>/` (npy e `final.blend`). `compor.py` junta as três camadas no atlas JPEG; `exportar` põe o atlas nos materiais sem luz
(`KHR_materials_unlit`, o three lê como MeshBasicMaterial) e exporta o .glb.
O que precisa brilhar ou refletir fica PBR de verdade: vidro, rótulos, metal, néon, janela, lâmpadas, telas (alto e médio). O baixo é quase todo assado.
Eixos: o Blender é Z para cima; a cena é do jogo (X, Y para cima, Z): (x, y, z) -> (x, -z, y).
"""
import json
import math
import os
import sys
import time

import bpy
import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import blender_mat as bm  # noqa: E402
import cena  # noqa: E402
from const import JANELA, LUMINARIA_Y, PISO, TETO, TOPO_BALCAO, X0, X1, Z0, Z1  # noqa: E402

RAIZ = os.path.abspath(os.path.join(AQUI, ".."))
NIVEIS = {"baixo": 0, "medio": 1, "alto": 2}

# resolução dos dois atlas (casco: piso, forro e paredes; objetos: o resto), da luz (menor), amostras e margem (px) por nível
CFG = {
    "alto": dict(casco=dict(res=4096, res_luz=2048), objetos=dict(res=4096, res_luz=2048), sinais=dict(res=3072, res_luz=1536), spp_luz=512, spp_ao=96, spp_cor=24, margem=4),
    "medio": dict(casco=dict(res=2048, res_luz=1024), objetos=dict(res=2048, res_luz=1024), sinais=dict(res=2048, res_luz=1024), spp_luz=384, spp_ao=64, spp_cor=16, margem=3),
    "baixo": dict(casco=dict(res=2048, res_luz=1024), objetos=dict(res=1024, res_luz=512), spp_luz=384, spp_ao=64, spp_cor=16, margem=3),
}
# P6: cartazes, quadro, adesivos e a porta da geladeira (os materiais `sinal:*` e `quadro`) vão num terceiro atlas (alto e médio), com densidade de texel alta para o texto ficar nítido;
# no .glb saem como um material PBR só emissivo, `cartazes` (cor-base preta, a textura no emissivo: o mesmo resultado dos sem luz, sem mexer na lista dos materiais sem luz do contrato)
DESTINO_ATLAS = {"piso": "casco", "forro": "casco", "paredes": "casco", "assado": "objetos", "decoracao": "objetos", "cartazes": "sinais"}
ATLAS = ("casco", "objetos", "sinais")
# o que o nível baixo assa mesmo sendo PBR nos outros (só ficam PBR o néon, a janela e a luminária); e o ganho do que já nasce aceso
CONVERTE_NO_BAIXO = {"vidro-ambar", "vidro-verde", "vidro-claro", "vidro-pet", "tampa", "cromado", "inox", "rotulos", "madeira-pa", "vitrine", "tv-tela", "luz-estufa", "lampada"}
ACESO = {"tv-tela": 1.5, "vitrine": 1.4, "luz-estufa": 1.9, "lampada": 2.4}
# força de emissão dos materiais na cena de assar (luz que eles jogam no salão); na exportação voltam a 1
EMISSAO = {"luz-estufa": 7.0, "vitrine": 4.0, "tv-tela": 5.0, "lampada": 28.0, "neon-rosa": 24.0, "neon-ciano": 24.0, "neon-ambar": 22.0, "neon-branco": 22.0,
           "luminaria-luz": 12.0, "letreiro": 7.0, "rua": 1.8, "rua-fundo": 0.9, "rua-fachada": 1.3, "rua-chao": 0.25, "rua-placa": 2.5, "poste-halo": 1.0}
# as luzes do salão: nome -> (tipo, posição no jogo, direção ou None, tamanho, cor, watts)
LUZES = {
    "luminaria": ("area", (0.0, LUMINARIA_Y - 0.035, 0.0), "baixo", (1.46, 0.3), (1.0, 0.78, 0.5), 230.0),
    "janela-azul": ("area", (-0.6, 1.0, Z1 + 0.04), "z-", (2.1, 1.4), (0.42, 0.55, 1.0), 14.0),
    "enchimento": ("area", (1.5, TETO - 0.05, -0.8), "baixo", (4.0, 3.0), (1.0, 0.84, 0.64), 14.0),
    "neon-parede": ("area", (X0 + 0.12, 1.95, -1.75), "x+", (1.7, 0.45), (1.0, 0.25, 0.6), 24.0),
}


def args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    d = {"nivel": "alto", "fase": "montar", "rapido": False, "saida": RAIZ}
    i = 0
    while i < len(a):
        if a[i] in ("--nivel", "--fase", "--saida"):
            d[a[i][2:]] = a[i + 1]
            i += 2
        elif a[i] in ("--rapido", "--publicar"):
            d[a[i][2:]] = True
            i += 1
        else:
            i += 1
    return d


def bl(p):
    """Jogo (x, y para cima, z) -> Blender (x, -z, y)."""
    return (p[0], -p[2], p[1])


def tempo(rotulo, t0):
    print(f"[{time.time() - t0:6.1f}s] {rotulo}", flush=True)


# ------------------------------------------------------------------ malhas
def criar_malha(nome, ms_por_material, origem, materiais, uv2=False):
    """Um objeto com um slot por material (na ordem do dicionário); normais e UV do kit de geometria."""
    P, N, UV, F, MI = [], [], [], [], []
    n0 = 0
    slots = []
    for mnome, m in ms_por_material.items():
        if m.vazia():
            continue
        p, nn, uv, f = m.juntar()
        P.append(p)
        N.append(nn)
        UV.append(uv)
        F.append(f + n0)
        MI.append(np.full(len(f), len(slots), np.int32))
        n0 += len(p)
        slots.append(mnome)
    if not slots:
        return None, []
    P = np.concatenate(P) - np.array(origem)
    N = np.concatenate(N)
    UV = np.concatenate(UV)
    F = np.concatenate(F)
    MI = np.concatenate(MI)
    Pb = np.stack([P[:, 0], -P[:, 2], P[:, 1]], axis=1)
    Nb = np.stack([N[:, 0], -N[:, 2], N[:, 1]], axis=1)
    mesh = bpy.data.meshes.new(nome)
    mesh.from_pydata(Pb.tolist(), [], F.tolist())
    mesh.update()
    mesh.polygons.foreach_set("material_index", MI)
    mesh.polygons.foreach_set("use_smooth", np.ones(len(F), bool))
    uvl = mesh.uv_layers.new(name="UVMap")
    vi = np.empty(len(mesh.loops), np.int32)
    mesh.loops.foreach_get("vertex_index", vi)
    uvl.data.foreach_set("uv", UV[vi].ravel())
    mesh.normals_split_custom_set_from_vertices(Nb.tolist())
    for mnome in slots:
        mesh.materials.append(materiais[mnome])
    obj = bpy.data.objects.new(nome, mesh)
    obj.location = bl(origem)
    return obj, slots


# ------------------------------------------------------------------ materiais
def classe_efetiva(nome, spec, lod, grupo):
    """'a' (assa), 'p' (PBR) ou 'e' (emissivo). Fora do grupo fixo nada é assado; no baixo quase tudo é."""
    c = spec["c"]
    if grupo != "estatico":
        return "p" if c == "a" else c
    if lod == 0 and c in ("p", "e") and nome in CONVERTE_NO_BAIXO:
        return "a"
    return c


def alvo_no(mat):
    """O nó de imagem em que o Cycles escreve (um por material fonte, solto no grafo)."""
    n = mat.node_tree.nodes.new("ShaderNodeTexImage")
    n.name = "alvo"
    n.location = (-600, -600)
    return n


def criar_fontes(usados, lod, pastas):
    """Materiais da cena de assar: `fontes` (assados, com nó alvo) e `pbr` (o resto)."""
    fontes, pbr, classes = {}, {}, {}
    for (nome, grupo) in sorted(usados):
        spec = cena.MATERIAIS[nome]
        cl = classe_efetiva(nome, spec, lod, grupo)
        classes[(nome, grupo)] = cl
        chave = nome if cl == "a" else nome + "|pbr"
        if cl == "a" and nome not in fontes:
            mat = bpy.data.materials.new("f:" + nome)
            if spec["c"] == "a":
                bm.receita(mat, nome, spec, pastas["fotos"], pastas["tex"])
            else:   # um PBR/emissivo que o baixo assa: a cor ou a textura dele, e ele também joga luz se for aceso
                bm.generico(mat, nome, spec, pastas["tex"])
                if nome in EMISSAO:
                    _emissao_do_assado(mat, nome, spec, pastas["tex"])
            alvo_no(mat)
            fontes[nome] = mat
        elif cl != "a" and chave not in pbr:
            mat = bpy.data.materials.new(nome)
            bm.pbr(mat, nome, spec, pastas["tex"], EMISSAO.get(nome))
            pbr[chave] = mat
    return fontes, pbr, classes


def _emissao_do_assado(mat, nome, spec, pasta_tex):
    """Dá emissão (cor = a textura ou a cor emissiva) ao material fonte de uma peça acesa, para ela iluminar o salão na assadura."""
    nt = mat.node_tree
    p = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    base = p.inputs["Base Color"]
    if base.is_linked:
        nt.links.new(base.links[0].from_socket, p.inputs["Emission Color"])
    else:
        p.inputs["Emission Color"].default_value = (*spec.get("emissivo", spec.get("cor", (1, 1, 1))), 1.0)
    p.inputs["Emission Strength"].default_value = EMISSAO[nome]


def material_unlit(nome, imagem, dupla=False):
    """Material sem luz do .glb: o atlas direto na saída (o exportador marca KHR_materials_unlit)."""
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    saida = nt.nodes.new("ShaderNodeOutputMaterial")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = imagem
    t.interpolation = "Linear"
    t.extension = "EXTEND"
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
    nt.links.new(t.outputs["Color"], saida.inputs["Surface"])
    m.use_backface_culling = not dupla
    return m


def material_emissivo(nome, imagem):
    """Material PBR só emissivo (cor-base preta, o atlas no emissivo): cartazes e adesivos com a luz assada, mas passando pelo mipmap e pela anisotropia como qualquer textura."""
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    saida = nt.nodes.new("ShaderNodeOutputMaterial")
    p = nt.nodes.new("ShaderNodeBsdfPrincipled")
    p.inputs["Base Color"].default_value = (0, 0, 0, 1)
    p.inputs["Roughness"].default_value = 0.9
    p.inputs["Metallic"].default_value = 0.0
    p.inputs["Specular IOR Level"].default_value = 0.15
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = imagem
    t.interpolation = "Linear"
    t.extension = "EXTEND"
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
    nt.links.new(t.outputs["Color"], p.inputs["Emission Color"])
    p.inputs["Emission Strength"].default_value = 1.0
    nt.links.new(p.outputs["BSDF"], saida.inputs["Surface"])
    m.use_backface_culling = True
    return m


# ------------------------------------------------------------------ luz, mesa de referência, Cycles
def cycles_gpu(sc, amostras):
    sc.render.engine = "CYCLES"
    p = bpy.context.preferences.addons["cycles"].preferences
    try:
        p.compute_device_type = "OPTIX"
        p.get_devices()
        for d in p.devices:
            d.use = d.type == "OPTIX"
        sc.cycles.device = "GPU"
    except Exception as e:
        print("sem GPU, usa CPU:", e)
        sc.cycles.device = "CPU"
    sc.cycles.samples = amostras
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 8
    sc.cycles.diffuse_bounces = 6
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 2
    sc.cycles.sample_clamp_indirect = 8.0
    sc.cycles.sample_clamp_direct = 0.0
    sc.cycles.use_adaptive_sampling = False
    sc.view_settings.view_transform = "Standard"
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900


def pr_luzes(col):
    mundo = bpy.data.worlds.new("mundo")
    mundo.use_nodes = True
    bg = mundo.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.012, 0.009, 0.008, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    bpy.context.scene.world = mundo
    luzes = []
    for nome, (tipo, pos, direcao, tam, cor, watts) in LUZES.items():
        ld = bpy.data.lights.new(nome, "AREA")
        ld.shape = "RECTANGLE"
        ld.size, ld.size_y = tam
        ld.color = cor
        ld.energy = watts
        ld.spread = math.radians(160)
        o = bpy.data.objects.new(nome, ld)
        o.location = bl(pos)
        o.rotation_euler = {"baixo": (0, 0, 0), "x+": (0, math.radians(-90), 0), "z-": (math.radians(90), 0, 0)}[direcao]
        col.objects.link(o)
        luzes.append(o)
    return luzes


def mesa_de_referencia(col):
    """A mesa do jogo (só aqui, para a sombra e o verde do pano que sobe): não vai no .glb. Medidas da física (const.py)."""
    from geom import Malha, caixa
    objs = []

    def caixa_obj(nome, centro, tam, cor, rug=0.8):
        m = Malha()
        caixa(m, np.eye(4), tam)
        p, n, uv, f = m.juntar()
        me = bpy.data.meshes.new(nome)
        me.from_pydata([(v[0], -v[2], v[1]) for v in p.tolist()], [], f.tolist())
        me.update()
        mt = bpy.data.materials.new(nome)
        mt.use_nodes = True
        pb = mt.node_tree.nodes["Principled BSDF"]
        pb.inputs["Base Color"].default_value = (*cor, 1)
        pb.inputs["Roughness"].default_value = rug
        me.materials.append(mt)
        o = bpy.data.objects.new(nome, me)
        o.location = bl(centro)
        col.objects.link(o)
        objs.append(o)
    sx, sz = cena.SEMI_X, cena.SEMI_Z
    madeira = (0.05, 0.022, 0.01)
    caixa_obj("mesa-pano", (0, -0.01, 0), (2.1, 0.02, 1.2), (0.004, 0.2, 0.065), 0.9)
    caixa_obj("mesa-trilho-a", (0, -0.015, sz - 0.06), (sx * 2, 0.09, 0.12), madeira)
    caixa_obj("mesa-trilho-b", (0, -0.015, -sz + 0.06), (sx * 2, 0.09, 0.12), madeira)
    caixa_obj("mesa-trilho-c", (sx - 0.06, -0.015, 0), (0.12, 0.09, sz * 2 - 0.24), madeira)
    caixa_obj("mesa-trilho-d", (-sx + 0.06, -0.015, 0), (0.12, 0.09, sz * 2 - 0.24), madeira)
    caixa_obj("mesa-saia", (0, -0.14, 0), (sx * 2 - 0.1, 0.16, sz * 2 - 0.1), madeira)
    for sxn in (-1, 1):
        for szn in (-1, 1):
            caixa_obj("mesa-pe", (sxn * (sx - 0.12), (-0.22 + PISO) / 2, szn * (sz - 0.12)), (0.12, -0.22 - PISO, 0.12), madeira)
    return objs


# ------------------------------------------------------------------ UV
def desembrulhar(obj, slots, res, margem_px, lod=2):
    """UV2 'Lightmap': smart project, ilhas escaladas pela densidade de cada material e empacotadas pelo Blender. Devolve o relatório de densidade."""
    me = obj.data
    uvl = me.uv_layers.new(name="Lightmap")
    me.uv_layers.active = uvl
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.context.scene.tool_settings.use_uv_select_sync = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    n_l, n_p = len(me.loops), len(me.polygons)
    vi = np.empty(n_l, np.int32)
    me.loops.foreach_get("vertex_index", vi)
    mi = np.empty(n_p, np.int32)
    me.polygons.foreach_get("material_index", mi)
    area = np.empty(n_p, np.float32)
    me.polygons.foreach_get("area", area)
    uv = np.empty(n_l * 2, np.float32)
    me.uv_layers["Lightmap"].data.foreach_get("uv", uv)   # sempre buscar a camada de novo: o ponteiro antigo fica obsoleto depois do modo de edição
    uv = uv.reshape(-1, 2)
    tri = np.arange(n_p) * 3                       # todo polígono é triângulo
    assert n_l == n_p * 3
    q = np.round(uv * 1e5).astype(np.int64)
    pai = list(range(n_p))

    def raiz(a):
        while pai[a] != a:
            pai[a] = pai[pai[a]]
            a = pai[a]
        return a
    visto = {}
    for f in range(n_p):
        for k in range(3):
            la, lb = tri[f] + k, tri[f] + (k + 1) % 3
            ka, kb = (int(vi[la]), int(q[la, 0]), int(q[la, 1])), (int(vi[lb]), int(q[lb, 0]), int(q[lb, 1]))
            chave = (ka, kb) if ka < kb else (kb, ka)
            if chave in visto:
                ra, rb = raiz(f), raiz(visto[chave])
                if ra != rb:
                    pai[ra] = rb
            else:
                visto[chave] = f
    ilha = np.array([raiz(f) for f in range(n_p)])
    _, ilha = np.unique(ilha, return_inverse=True)
    n_i = ilha.max() + 1
    uvt = uv.reshape(n_p, 3, 2)
    a_uv = 0.5 * np.abs((uvt[:, 1, 0] - uvt[:, 0, 0]) * (uvt[:, 2, 1] - uvt[:, 0, 1]) - (uvt[:, 2, 0] - uvt[:, 0, 0]) * (uvt[:, 1, 1] - uvt[:, 0, 1]))
    dens_mat = np.array([cena.dens(s, lod) for s in slots], np.float32)
    A3 = np.bincount(ilha, weights=area, minlength=n_i)
    AU = np.bincount(ilha, weights=a_uv, minlength=n_i)
    W = np.bincount(ilha, weights=area * dens_mat[mi], minlength=n_i) / np.maximum(A3, 1e-12)
    escala = W * np.sqrt(A3 / np.maximum(AU, 1e-12))
    pontos = uvt.reshape(-1, 2)
    il_ponto = np.repeat(ilha, 3)
    mn = np.full((n_i, 2), 1e9)
    mx = np.full((n_i, 2), -1e9)
    np.minimum.at(mn, il_ponto, pontos)
    np.maximum.at(mx, il_ponto, pontos)
    cen = (mn + mx) / 2
    novo = (pontos - cen[il_ponto]) * escala[il_ponto][:, None] + cen[il_ponto]
    nt0 = novo.reshape(n_p, 3, 2)
    a00 = 0.5 * np.abs((nt0[:, 1, 0] - nt0[:, 0, 0]) * (nt0[:, 2, 1] - nt0[:, 0, 1]) - (nt0[:, 2, 0] - nt0[:, 0, 0]) * (nt0[:, 1, 1] - nt0[:, 0, 1]))
    novo = (novo - novo.min(axis=0)) * math.sqrt(0.42 / max(float(a00.sum()), 1e-12))   # área total 0,42 (o empacotador cresce tudo por igual até encher o quadrado)
    me.uv_layers["Lightmap"].data.foreach_set("uv", novo.astype(np.float32).ravel())
    me.update()
    if os.environ.get("DEPURA_UV"):
        nt = novo.reshape(n_p, 3, 2)
        a0 = 0.5 * np.abs((nt[:, 1, 0] - nt[:, 0, 0]) * (nt[:, 2, 1] - nt[:, 0, 1]) - (nt[:, 2, 0] - nt[:, 0, 0]) * (nt[:, 1, 1] - nt[:, 0, 1]))
        print("DENS antes do empacotamento:", {s: round(float(math.sqrt(a0[mi == i].sum() / area[mi == i].sum())), 3) for i, s in enumerate(slots) if (mi == i).any()}, flush=True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    r = bpy.ops.uv.pack_islands(udim_source="ACTIVE_UDIM", rotate=True, scale=True, margin_method="FRACTION", margin=margem_px / res)
    assert "FINISHED" in r, r
    bpy.ops.object.mode_set(mode="OBJECT")
    uvl = me.uv_layers["Lightmap"]   # o ponteiro antigo vira obsoleto depois do modo de edição
    plano = np.empty(n_l * 2, np.float32)
    uvl.data.foreach_get("uv", plano)
    uv = plano.reshape(-1, 2)
    uvt = uv.reshape(n_p, 3, 2)
    a_uv2 = 0.5 * np.abs((uvt[:, 1, 0] - uvt[:, 0, 0]) * (uvt[:, 2, 1] - uvt[:, 0, 1]) - (uvt[:, 2, 0] - uvt[:, 0, 0]) * (uvt[:, 1, 1] - uvt[:, 0, 1]))
    rel = {"ilhas": int(n_i), "cobertura": float(a_uv2.sum()), "fora_do_quadrado": int(((uv < -1e-4) | (uv > 1 + 1e-4)).any(axis=1).sum()), "px_por_m": {}}
    for si, s in enumerate(slots):
        sel = mi == si
        if sel.any() and area[sel].sum() > 1e-9:
            rel["px_por_m"][s] = round(float(math.sqrt(a_uv2[sel].sum() / area[sel].sum()) * res), 1)
    return rel


# ------------------------------------------------------------------ bake
def imagem_float(nome, w, h):
    im = bpy.data.images.new(nome, w, h, alpha=True, float_buffer=True)
    im.colorspace_settings.name = "Non-Color"
    return im


def guardar(im, caminho):
    w, h = im.size
    a = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(a)
    np.save(caminho, a.reshape(h, w, 4).astype(np.float16 if w * h > 2_000_000 else np.float32))


def assar(obj, fontes, tipo, im, filtro, amostras, margem, uv="Lightmap", **kw):
    for mat in fontes.values():
        n = mat.node_tree.nodes["alvo"]
        n.image = im
        n.select = True
        mat.node_tree.nodes.active = n
    bpy.context.scene.cycles.samples = amostras
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.bake(type=tipo, pass_filter=filtro, margin=margem, margin_type="EXTEND", use_clear=True, uv_layer=uv, **kw)


def material_de_marca(nome, ganho, imagem):
    """Material só de emissão (ganho, 0, 0) com o nó alvo: o mapa de marcas diz o que já nasce aceso."""
    m = bpy.data.materials.new("marca-" + nome)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    saida = nt.nodes.new("ShaderNodeOutputMaterial")
    e = nt.nodes.new("ShaderNodeEmission")
    e.inputs["Color"].default_value = (ganho, 0.0, 0.0, 1.0)
    e.inputs["Strength"].default_value = 1.0
    nt.links.new(e.outputs["Emission"], saida.inputs["Surface"])
    n = nt.nodes.new("ShaderNodeTexImage")
    n.name = "alvo"
    return m


def montar(a):
    t0 = time.time()
    nivel = a["nivel"]
    lod = NIVEIS[nivel]
    cfg = dict(CFG[nivel])
    if a["rapido"]:
        cfg = dict(casco=dict(res=1024, res_luz=512), objetos=dict(res=512, res_luz=256), sinais=dict(res=512, res_luz=256), spp_luz=24, spp_ao=12, spp_cor=4, margem=3)
    saida = os.path.abspath(a["saida"])
    pastas = {"tex": os.path.join(saida, "texturas", nivel), "fotos": os.path.join(saida, "fotos")}
    pastas["tex_comum"] = os.path.join(saida, "texturas")
    trab = os.path.join(saida, "trabalho", nivel)
    os.makedirs(trab, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    sc = bpy.context.scene
    cycles_gpu(sc, cfg["spp_luz"])
    col = bpy.data.collections.new(f"boteco-{nivel}")
    sc.collection.children.link(col)

    c = cena.construir(lod)
    usados = set()
    for g, ms in c.grupos.items():
        for m, ml in ms.items():
            if not ml.vazia():
                usados.add((m, g))
    # texturas de sinais ficam em texturas/sinais; os níveis têm as suas em texturas/<nivel>
    pastas["tex"] = pastas["tex"]
    fontes, pbr, classes = criar_fontes(usados, lod, pastas)
    tempo(f"{len(fontes)} materiais assados, {len(pbr)} PBR", t0)

    nomes = {"estatico": "boteco", "luminaria": "luminaria", "ventilador-helice": "ventilador-helice", "neon": "letreiro-neon", "janela-rua": "janela-rua"}
    saida_objs = {}
    objs_a, obj_p = {}, None
    for g, ms in c.grupos.items():
        origem = c.origem.get(g, (0, 0, 0))
        if g == "estatico":
            ms_p = {m: ml for m, ml in ms.items() if not ml.vazia() and classes[(m, g)] != "a"}
            for ag in ATLAS:
                ms_g = {m: ml for m, ml in ms.items() if not ml.vazia() and classes[(m, g)] == "a" and DESTINO_ATLAS[cena.destino(m, lod)] == ag}
                if ms_g:
                    obj, _ = criar_malha(ag + "-fonte", ms_g, origem, fontes)
                    col.objects.link(obj)
                    objs_a[ag] = obj
            obj_p, _ = criar_malha("pbr-fonte", ms_p, origem, {m: pbr[m + "|pbr"] for m in ms_p})
            if obj_p:
                col.objects.link(obj_p)
        else:
            ms = {m: ml for m, ml in ms.items() if not ml.vazia()}
            mats = {m: pbr[m + "|pbr"] for m in ms}
            o, _ = criar_malha(nomes.get(g, g), ms, origem, mats)
            if o:
                col.objects.link(o)
                saida_objs[nomes.get(g, g)] = o
    # marcadores (luzes e câmeras do contrato)
    marcadores = []
    for mk in c.marcadores:
        if mk["tipo"] == "camera":
            cd = bpy.data.cameras.new(mk["nome"])
            cd.sensor_fit = "VERTICAL"
            cd.sensor_height = 24.0
            cd.lens = 12.0 / math.tan(math.radians(mk["extras"].get("fovGraus", 50)) / 2)
            cd.clip_start, cd.clip_end = 0.05, 60.0
            obj = bpy.data.objects.new(mk["nome"], cd)
            obj.location = bl(mk["pos"])
            from mathutils import Vector
            d = Vector(bl(mk["alvo"])) - Vector(bl(mk["pos"]))
            obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        else:
            obj = bpy.data.objects.new(mk["nome"], None)
            obj.empty_display_type = "PLAIN_AXES"
            obj.empty_display_size = 0.15
            obj.location = bl(mk["pos"])
        for k, v in mk["extras"].items():
            obj[k] = v
        col.objects.link(obj)
        marcadores.append(obj)

    luzes = pr_luzes(col)
    mesa = mesa_de_referencia(col)
    sc.world.light_settings.distance = 0.45
    tempo("cena montada", t0)

    info = {"nivel": nivel, "cfg": cfg}

    # ---- UV e passes, um atlas por grupo
    info["uv"] = {}
    for ag, obj in objs_a.items():
        cg = cfg[ag]
        pasta_g = os.path.join(trab, ag)
        os.makedirs(pasta_g, exist_ok=True)
        slots_a = [s.material.name[2:] for s in obj.material_slots]
        rel = desembrulhar(obj, slots_a, cg["res"], cfg["margem"], lod)
        info["uv"][ag] = rel
        tempo(f"UV {ag}: {rel['ilhas']} ilhas, cobertura {rel['cobertura']:.2f}, fora do quadrado {rel['fora_do_quadrado']}", t0)
        fontes_g = {n: fontes[n] for n in slots_a}
        res, rl = cg["res"], cg["res_luz"]
        im_cor = imagem_float("cor", res, res)
        assar(obj, fontes_g, "DIFFUSE", im_cor, {"COLOR"}, cfg["spp_cor"], cfg["margem"])
        guardar(im_cor, os.path.join(pasta_g, "cor.npy"))
        for n_, m_ in fontes_g.items():
            bm.amortecer_normais(m_, n_)
        im_ao = imagem_float("ao", res, res)
        assar(obj, fontes_g, "AO", im_ao, set(), cfg["spp_ao"], cfg["margem"])
        guardar(im_ao, os.path.join(pasta_g, "ao.npy"))
        tempo(f"{ag}: cor e oclusão assadas", t0)
        im_luz = imagem_float("luz", rl, rl)
        assar(obj, fontes_g, "DIFFUSE", im_luz, {"DIRECT", "INDIRECT"}, cfg["spp_luz"], max(2, cfg["margem"] * rl // res))
        guardar(im_luz, os.path.join(pasta_g, "luz.npy"))
        tempo(f"{ag}: luz assada", t0)
        # mapa de marcas: R = ganho de quem já nasce aceso (tela, vitrine, lâmpada), 0 no resto
        if any(n in ACESO for n in slots_a):
            im_mk = imagem_float("marcas", res // 2, res // 2)
            originais = [s_.material for s_ in obj.material_slots]
            for s_ in obj.material_slots:
                s_.material = material_de_marca(s_.material.name[2:], ACESO.get(s_.material.name[2:], 0.0), im_mk)
            fontes_mk = {s_.material.name: s_.material for s_ in obj.material_slots}
            assar(obj, fontes_mk, "EMIT", im_mk, set(), 1, max(2, cfg["margem"] // 2))
            for s_, m_ in zip(obj.material_slots, originais):
                s_.material = m_
            guardar(im_mk, os.path.join(pasta_g, "marcas.npy"))
        info.setdefault("grupos", []).append(ag)

    # ---- objetos finais
    finalizar(objs_a, obj_p, pbr, pastas["tex"], lod)
    info["tempo_s"] = round(time.time() - t0, 1)
    with open(os.path.join(trab, "info.json"), "w") as f:
        json.dump(info, f, indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(trab, "final.blend"), relative_remap=False)
    print("TRIANGULOS", nivel, c.total(), json.dumps(c.triangulos()), "FOLGA", c.folga_violada() or "ok")
    tempo("montar pronto", t0)


# ------------------------------------------------------------------ finalização
def finalizar(objs_a, obj_p, pbr, pasta_tex, lod=2):
    """Troca os materiais fonte pelos finais (piso, forro, paredes e assado/decoração: sem luz, cada um num dos dois atlas), junta tudo (e o PBR) em `boteco` e tira o que não vai no .glb."""
    atlas = {}
    finais = {}
    for ag, obj in objs_a.items():
        me = obj.data
        # a UV 'Lightmap' vira a UV única das faces assadas
        uv1, uv2 = me.uv_layers["UVMap"], me.uv_layers["Lightmap"]
        buf = np.empty(len(me.loops) * 2, np.float32)
        uv2.data.foreach_get("uv", buf)
        uv1.data.foreach_set("uv", buf)
        me.uv_layers.remove(uv2)
        nomes = [s.material.name[2:] for s in obj.material_slots]
        destinos = []
        for n in nomes:
            d = cena.destino(n, lod)
            if d not in destinos:
                destinos.append(d)
        atlas[ag] = bpy.data.images.new("atlas-" + ag, 8, 8)
        atlas[ag].colorspace_settings.name = "sRGB"
        mi = np.empty(len(me.polygons), np.int32)
        me.polygons.foreach_get("material_index", mi)
        novo_idx = np.array([destinos.index(cena.destino(n, lod)) for n in nomes], np.int32)[mi]
        me.materials.clear()
        for d in destinos:
            if d not in finais:
                finais[d] = material_emissivo(d, atlas[ag]) if d == "cartazes" else material_unlit(d, atlas[ag], dupla=(d == "decoracao"))
            me.materials.append(finais[d])
        me.polygons.foreach_set("material_index", novo_idx)
        me.update()
    for m in list(bpy.data.materials):
        if m.name.startswith(("f:", "marca-")):
            bpy.data.materials.remove(m)
    # junta o assado com o PBR num objeto só, `boteco`
    objs = list(objs_a.values()) + ([obj_p] if obj_p is not None else [])
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    boteco = bpy.context.view_layer.objects.active
    boteco.name = "boteco"
    boteco.data.name = "boteco"
    # desenhos que saem sem luz e sem assar (classe "u": a prateleira de garrafas do baixo): o material PBR da cena de assar dá lugar a um sem luz com a imagem
    for sl in boteco.material_slots:
        spec = cena.MATERIAIS.get(sl.material.name) if sl.material else None
        if spec and spec["c"] == "u":
            nome = sl.material.name
            im = bpy.data.images.load(os.path.join(pasta_tex, spec["tex"]))
            im.colorspace_settings.name = "sRGB"
            sl.material.name = nome + ".fonte"
            sl.material = material_unlit(nome, im)
    # o que não vai: luzes e mesa de referência
    for o in list(bpy.data.objects):
        if o.type == "LIGHT" or o.name.startswith("mesa-"):
            bpy.data.objects.remove(o, do_unlink=True)
    # emissão: força 1 só nos que acendem (o three a escala por `emissiveIntensity`); o resto zero, senão o exportador grava emissivo branco
    for m in pbr.values():
        p = next((nn for nn in m.node_tree.nodes if nn.type == "BSDF_PRINCIPLED"), None)
        if p:
            p.inputs["Emission Strength"].default_value = 1.0 if m.name in EMISSAO else 0.0
    bpy.context.scene.world = None
    return boteco


def exportar(a):
    t0 = time.time()
    nivel = a["nivel"]
    saida = os.path.abspath(a["saida"])
    trab = os.path.join(saida, "trabalho", nivel)
    bpy.ops.wm.open_mainfile(filepath=os.path.join(trab, "final.blend"))
    bpy.context.preferences.filepaths.save_version = 0
    for ag in ATLAS:
        if "atlas-" + ag not in bpy.data.images:
            continue
        im = bpy.data.images["atlas-" + ag]
        im.filepath = os.path.join(trab, ag, "atlas.jpg")
        im.source = "FILE"
        im.reload()
        im.colorspace_settings.name = "sRGB"
    bpy.ops.object.select_all(action="SELECT")
    glb = os.path.join(saida, "exportados" if a.get("publicar") else os.path.join("trabalho", nivel), f"boteco-{nivel}.glb")
    os.makedirs(os.path.dirname(glb), exist_ok=True)
    kw = dict(filepath=glb, export_format="GLB", export_cameras=True, export_extras=True, export_lights=False, export_apply=True, export_yup=True, export_texcoords=True,
              export_normals=True, export_materials="EXPORT", export_animations=False, export_skins=False, export_morph=False, export_tangents=False, use_selection=True,
              export_image_format="AUTO", export_jpeg_quality=92)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError as e:
        print("parametro nao aceito:", e)
        for k in ("export_jpeg_quality", "export_morph", "export_skins"):
            kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)
    if a.get("publicar"):
        bpy.ops.file.pack_all()   # o .blend leva as imagens junto (a pasta de trabalho não vai para o git)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(saida, f"boteco-{nivel}.blend"), relative_remap=True)
    print(f"exportado {glb} em {time.time() - t0:.1f}s")


def main():
    a = args()
    if a["fase"] == "montar":
        montar(a)
    else:
        exportar(a)


main()
