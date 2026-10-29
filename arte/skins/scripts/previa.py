"""A prévia no Blender: o taco inteiro, torneado como no jogo, com as pinturas em cima, sob uma luz parecida com a da mesa.

O taco usa as mesmas medidas e o mesmo UV de `apps/web/src/cena/torneado.ts` (`medidas.py`). No Blender o eixo do taco corre
em +X a partir da ponta (X = q), `Z = -r·cos(a)` e `Y = -r·sin(a)` (o rolo de 180° põe u = 0,5 virado para cima, para a arte do centro
do canvas ficar de frente). A luz imita `luz.luminaria` do `config.ts`: painel de 1,5 × 0,32 m a 0,9 m do pano, 3000 K.

`python3`-livre: roda dentro do Blender (`blender -b --factory-startup --python <script> -- ...`). As funções são usadas por `folha.py`.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cor as C  # noqa: E402
import medidas as M  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
EXPORTADOS = os.path.join(RAIZ, "exportados")

ALTURA_DO_TACO = 0.0286 + 0.012  # m acima do pano (altura do centro da bola + folga do raio do cabo)
PASSO_DO_PERFIL = {"sola": 0.001, "virola": 0.004, "haste": 0.02, "junta": 0.002, "antebraco": 0.01, "punho": 0.01, "anel": 0.002, "base": 0.01, "borracha": 0.002}
COURO = C.rgb("#76502c")
GIZ = C.rgb("#3d8bff")


def _principled(nt):
    return next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")


def _material_base(nome):
    m = bpy.data.materials.new(nome)
    if m.node_tree is None:
        m.use_nodes = True
    return m


def _entrada(bsdf, *nomes):
    for n in nomes:
        if n in bsdf.inputs:
            return bsdf.inputs[n]
    raise KeyError(nomes)


def material_pintado(nome, png, emissivo=None, rugosidade=0.35, metal=0.0, verniz=0.6, forca_emissivo=3.0, metal_png=None):
    m = _material_base(nome)
    nt = m.node_tree
    b = _principled(nt)
    img = bpy.data.images.load(png, check_existing=True)
    img.colorspace_settings.name = "sRGB"
    # O UV do taco (`torneado.ts`) corre u para a esquerda vendo de fora com v para cima: a prévia o desvira (u' = 1 - u), que é o
    # `texture.repeat.x = -1` que o jogo precisa para mostrar a arte como no PNG.
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapa = nt.nodes.new("ShaderNodeMapping")
    mapa.vector_type = "POINT"
    mapa.inputs["Location"].default_value = (1.0, 0.0, 0.0)
    mapa.inputs["Scale"].default_value = (-1.0, 1.0, 1.0)
    nt.links.new(coord.outputs["UV"], mapa.inputs["Vector"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.extension = "REPEAT"
    tex.interpolation = "Cubic"
    nt.links.new(mapa.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rugosidade
    b.inputs["Metallic"].default_value = metal
    _entrada(b, "Coat Weight", "Clearcoat").default_value = verniz
    _entrada(b, "Coat Roughness", "Clearcoat Roughness").default_value = 0.08
    if metal_png:   # máscara de metal (branco = metal): liga o `Metallic` do Principled
        mm = bpy.data.images.load(metal_png, check_existing=True)
        mm.colorspace_settings.name = "Non-Color"
        tm = nt.nodes.new("ShaderNodeTexImage")
        tm.image = mm
        tm.extension = "REPEAT"
        tm.interpolation = "Cubic"
        nt.links.new(mapa.outputs["Vector"], tm.inputs["Vector"])
        # a luz da prévia tem pouco ambiente: com metal 1 o ouro escurece; a prévia usa 0,7 (o PNG fica puro, a sugestão ao jogo está no meta)
        esc = nt.nodes.new("ShaderNodeMath")
        esc.operation = "MULTIPLY"
        esc.inputs[1].default_value = 0.7
        nt.links.new(tm.outputs["Color"], esc.inputs[0])
        nt.links.new(esc.outputs[0], b.inputs["Metallic"])
    if emissivo:
        e = bpy.data.images.load(emissivo, check_existing=True)
        e.colorspace_settings.name = "sRGB"
        te = nt.nodes.new("ShaderNodeTexImage")
        te.image = e
        te.extension = "REPEAT"
        te.interpolation = "Cubic"
        nt.links.new(mapa.outputs["Vector"], te.inputs["Vector"])
        nt.links.new(te.outputs["Color"], _entrada(b, "Emission Color"))
        _entrada(b, "Emission Strength").default_value = forca_emissivo
    return m


def material_liso(nome, cor, rugosidade=0.4, metal=0.0, verniz=0.0, faixas=None, emissivo=None):
    """Cor lisa; `faixas = [(de, ate, cor)]` (fração do comprimento da peça) pintam anéis por cima, com a rampa por v do UV."""
    m = _material_base(nome)
    nt = m.node_tree
    b = _principled(nt)
    b.inputs["Roughness"].default_value = rugosidade
    b.inputs["Metallic"].default_value = metal
    _entrada(b, "Coat Weight", "Clearcoat").default_value = verniz
    _entrada(b, "Coat Roughness", "Clearcoat Roughness").default_value = 0.1
    if faixas:
        uv = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(uv.outputs["UV"], sep.inputs[0])
        rampa = nt.nodes.new("ShaderNodeValToRGB")
        rampa.color_ramp.interpolation = "CONSTANT"
        elementos = rampa.color_ramp.elements
        pts = [(0.0, cor)]
        for de, ate, c in sorted(faixas):
            pts.append((de, c))
            pts.append((ate, cor))
        # reaproveita os 2 elementos iniciais da rampa
        while len(elementos) < len(pts):
            elementos.new(0.5)
        for el, (pos, c) in zip(elementos, pts):
            el.position = min(max(pos, 0.0), 1.0)
            el.color = C.linear(c) + (1.0,)
        nt.links.new(sep.outputs["Y"], rampa.inputs["Fac"])
        nt.links.new(rampa.outputs["Color"], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = C.linear(cor) + (1.0,)
    if emissivo:
        _entrada(b, "Emission Color").default_value = C.linear(emissivo[0]) + (1.0,)
        _entrada(b, "Emission Strength").default_value = emissivo[1]
    return m


def _malha_da_peca(nome, lados=96, rolo=math.pi):
    d, a = M.de(nome), M.ate(nome)
    n = max(int(math.ceil((a - d) / PASSO_DO_PERFIL[nome])), 10 if nome in ("sola", "borracha") else 2)
    pontos = []
    for i in range(n + 1):
        t = i / n
        f = t * t if nome == "sola" else (1 - (1 - t) ** 2 if nome == "borracha" else t)
        q = d + (a - d) * f
        pontos.append((q, M.raio(nome, q)))
    ext = pontos[-1][0] - pontos[0][0] or 1.0
    verts, uvs_v, faces = [], [], []
    cols = lados + 1
    for q, r in pontos:
        for j in range(cols):
            ang = 2 * math.pi * j / lados
            verts.append((q, r * math.sin(ang + rolo), r * math.cos(ang + rolo)))
            uvs_v.append((j / lados, (q - pontos[0][0]) / ext))
    for i in range(len(pontos) - 1):
        for j in range(lados):
            a0 = i * cols + j
            faces.append((a0, a0 + 1, a0 + cols + 1, a0 + cols))
    malha = bpy.data.meshes.new(nome)
    malha.from_pydata(verts, [], faces)
    malha.update()
    uv = malha.uv_layers.new(name="UV")
    for lp in malha.loops:
        uv.data[lp.index].uv = uvs_v[lp.vertex_index]
    for p in malha.polygons:
        p.use_smooth = True
    return malha


def criar_taco(nome, materiais, origem=(0.0, 0.0, 0.0), rolo_graus=0.0, colecao=None):
    """`materiais`: {peca: material}. Devolve a lista de objetos. O `rolo_graus` gira o taco em volta do eixo (u de frente)."""
    colecao = colecao or bpy.context.scene.collection
    objs = []
    for peca in M.PECAS:
        malha = _malha_da_peca(peca, rolo=math.pi + math.radians(rolo_graus))
        ob = bpy.data.objects.new(f"{nome}-{peca}", malha)
        colecao.objects.link(ob)
        ob.location = origem
        ob.data.materials.append(materiais[peca])
        objs.append(ob)
    return objs


def girar_taco(objs, graus):
    """Gira o taco em volta do próprio eixo (as peças têm a origem no eixo): põe o u que se quer de frente para a câmera."""
    for ob in objs:
        ob.rotation_euler = (math.radians(graus), 0.0, 0.0)


def pano(nome, centro, tamanho=(3.0, 1.6)):
    m = _material_base(nome + "-pano")
    b = _principled(m.node_tree)
    b.inputs["Base Color"].default_value = C.linear(C.rgb("#1d6b42")) + (1.0,)
    b.inputs["Roughness"].default_value = 0.95
    malha = bpy.data.meshes.new(nome + "-pano")
    hx, hy = tamanho[0] / 2, tamanho[1] / 2
    malha.from_pydata([(-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new(nome + "-pano", malha)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = centro
    ob.data.materials.append(m)
    return ob


def luz(centro, nome="luminaria", energia=16.0, deslocamento_y=-0.15):
    """Painel de 1,5 × 0,32 m a 0,9 m do pano, 3000 K (aprox.), mais um preenchimento fraco de céu."""
    l = bpy.data.lights.new(nome, "AREA")
    l.shape = "RECTANGLE"
    l.size, l.size_y = 1.5, 0.32
    l.energy = energia
    l.color = (1.0, 0.66, 0.34)  # ~3000 K em linear
    ob = bpy.data.objects.new(nome, l)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (centro[0] + 0.72, centro[1] + deslocamento_y, 0.9)
    ob.rotation_euler = (0, 0, 0)  # apontada para baixo
    ob.visible_camera = False
    # preenchimento: um painel frio e fraco do lado oposto, para não perder o azul e o roxo nas sombras
    f = bpy.data.lights.new(nome + "-preenchimento", "AREA")
    f.shape = "RECTANGLE"
    f.size, f.size_y = 1.2, 1.2
    f.energy = 2.5
    f.color = (0.75, 0.82, 1.0)
    of = bpy.data.objects.new(nome + "-preenchimento", f)
    bpy.context.scene.collection.objects.link(of)
    of.location = (centro[0] + 0.7, centro[1] + 0.55, 0.7)
    of.rotation_euler = (math.radians(-30), 0, 0)
    of.visible_camera = False
    return ob


def preparar_cena(amostras=96):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = amostras
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 6
    sc.cycles.device = "CPU"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for tipo in ("OPTIX", "CUDA"):
            prefs.compute_device_type = tipo
            prefs.get_devices()
            if any(d.type == tipo for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == tipo
                sc.cycles.device = "GPU"
                break
    except Exception:
        pass
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.display_settings.display_device = "sRGB"
    mundo = bpy.data.worlds.new("sala")
    sc.world = mundo
    mundo.color = (0.012, 0.008, 0.006)
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    return sc


def camera_ortografica(nome, centro, escala, larg, alt):
    cam = bpy.data.cameras.new(nome)
    cam.type = "ORTHO"
    cam.ortho_scale = escala
    ob = bpy.data.objects.new(nome, cam)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = (centro[0], centro[1], 1.2)
    ob.rotation_euler = (0, 0, 0)
    return ob, (larg, alt)


def camera_olhando(nome, posicao, alvo, cima=(1, 0, 0), lente_mm=70.0):
    cam = bpy.data.cameras.new(nome)
    cam.lens = lente_mm
    cam.sensor_width = 36.0
    cam.clip_start, cam.clip_end = 0.01, 20.0
    ob = bpy.data.objects.new(nome, cam)
    bpy.context.scene.collection.objects.link(ob)
    p, a = Vector(posicao), Vector(alvo)
    z = (p - a).normalized()
    x = Vector(cima).cross(z).normalized()
    y = z.cross(x)
    ob.matrix_world = Matrix(((x.x, y.x, z.x, p.x), (x.y, y.y, z.y, p.y), (x.z, y.z, z.z, p.z), (0, 0, 0, 1)))
    return ob


def fotografar(camera, caminho, larg, alt):
    sc = bpy.context.scene
    sc.camera = camera
    sc.render.resolution_x, sc.render.resolution_y = larg, alt
    sc.render.resolution_percentage = 100
    sc.render.filepath = os.path.abspath(caminho)
    os.makedirs(os.path.dirname(os.path.abspath(caminho)), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    return caminho
