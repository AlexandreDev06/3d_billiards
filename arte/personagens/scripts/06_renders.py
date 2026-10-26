"""Etapa 2a: renders EEVEE da mão em cada pose, de três ângulos, com luz parecida com a do jogo.

Uso (sem janela, mas o EEVEE precisa do X aberto):
  DISPLAY=:1 blender -b arte/personagens/mao.blend --python arte/personagens/scripts/06_renders.py -- \
      --saida .outros/lote-p1/render [--poses pose_repouso,pose_ponte_v] [--lod alta|baixa] [--quadro 0] [--tam 640x480]

Luz do jogo: luminária quente por cima (spot a ~3200 K), um contraluz frio fraco para a silhueta e fundo escuro.
A mão sai na cor da equipe azul (a do .blend); o .glb leva cor base branca.
"""
import argparse
import importlib
import math
import os
import sys

import bpy
from mathutils import Vector

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import mao_dados as D
import mao_lib as L
import mao_provas as V

importlib.reload(D)
importlib.reload(L)
importlib.reload(V)

# direções da câmera, no referencial da mão (de onde ela olha); dorso para cima é +Z
ANGULOS = {
    "cima": Vector((0.0, -0.18, 1.0)),
    "tres_quartos": Vector((-0.55, -0.85, 0.62)),
    "lado": Vector((-1.0, -0.12, 0.18)),
    "baixo": Vector((0.0, -0.2, -1.0)),
    "frente": Vector((0.0, 1.0, 0.25)),
    "frente_baixo": Vector((-0.45, 0.75, -0.5)),
    # a câmera do jogo: atrás do taco e acima dele, olhando ao longo dele (a ponte tem o taco em +Y, o punho em +X)
    "jogo_ponte": Vector((0.0, -0.88, 0.47)),
    "jogo_ponte45": Vector((0.0, -0.7, 0.72)),  # a mesma, mais alta (45°): o taco da ponte elevada sobe 23° e a 28° ele tampava a lente
    "boca": Vector((0.0, -1.0, 0.25)),   # de frente para a boca do punho
    "jogo_punho": Vector((-0.82, -0.17, 0.55)),
}
TRES = ["cima", "tres_quartos", "lado"]


def argumentos():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--saida", required=True)
    p.add_argument("--poses", default="")
    p.add_argument("--angulos", default=",".join(TRES))
    p.add_argument("--lod", default="alta")
    p.add_argument("--quadro", type=float, default=None)
    p.add_argument("--quadros", default="", help="vários quadros de uma ação (a pose vira a ação de mesmo nome): 0,6,12")
    p.add_argument("--silhueta", action="store_true", help="só a silhueta: preta sobre branco (Workbench, luz chapada)")
    p.add_argument("--sem-apoio", action="store_true", help="não desenha o taco nem o plano de apoio")
    p.add_argument("--tam", default="640x480")
    p.add_argument("--amostras", type=int, default=48)
    p.add_argument("--props", default="json", help="json: taco e cubo vêm de poses_resolvidas.json; blend: os que já estão no .blend (backup do P1)")
    return p.parse_args(argv)


def montar_cena(tam, amostras):
    sc = bpy.context.scene
    try:
        sc.render.engine = "BLENDER_EEVEE"
    except TypeError:
        pass
    w, h = (int(x) for x in tam.split("x"))
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.film_transparent = False
    try:
        sc.eevee.taa_render_samples = amostras
        sc.eevee.use_shadows = True
        sc.eevee.use_raytracing = False
    except Exception:
        pass
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    # fundo escuro, levemente quente
    mundo = bpy.data.worlds.new("fundo") if not bpy.data.worlds else bpy.data.worlds[0]
    sc.world = mundo
    mundo.use_nodes = True
    bg = next(n for n in mundo.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.012, 0.011, 0.014, 1)
    bg.inputs["Strength"].default_value = 1.0
    for o in [o for o in bpy.data.objects if o.name.startswith("luz_") or o.name == "camera_render"]:
        bpy.data.objects.remove(o, do_unlink=True)
    # luminária quente por cima (spot) e contraluz frio fraco
    luz = bpy.data.lights.new("luz_lampada", "SPOT")
    luz.energy = 22
    luz.color = (1.0, 0.78, 0.5)
    luz.spot_size = math.radians(80)
    luz.spot_blend = 0.6
    luz.shadow_soft_size = 0.05
    o = bpy.data.objects.new("luz_lampada", luz)
    bpy.context.scene.collection.objects.link(o)
    o.location = (0.03, 0.05, 0.62)
    o.rotation_euler = (0, 0, 0)
    cont = bpy.data.lights.new("luz_contra", "AREA")
    cont.energy = 6
    cont.color = (0.55, 0.7, 1.0)
    cont.size = 0.25
    c = bpy.data.objects.new("luz_contra", cont)
    bpy.context.scene.collection.objects.link(c)
    c.location = (0.35, 0.45, 0.25)
    c.rotation_euler = (math.radians(70), 0, math.radians(140))
    preench = bpy.data.lights.new("luz_preench", "AREA")
    preench.energy = 3
    preench.color = (1.0, 0.85, 0.7)
    preench.size = 0.4
    f = bpy.data.objects.new("luz_preench", preench)
    bpy.context.scene.collection.objects.link(f)
    f.location = (-0.4, -0.35, 0.18)
    f.rotation_euler = (math.radians(75), 0, math.radians(-40))
    cam = bpy.data.cameras.new("camera_render")
    cam.lens = 70
    cam.clip_start = 0.01
    cam.clip_end = 5
    co = bpy.data.objects.new("camera_render", cam)
    bpy.context.scene.collection.objects.link(co)
    sc.camera = co
    return co


def caixa_dos_alvos(alvos):
    """Pontos do mundo (malhas avaliadas) → (centro, raio)."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for ob in alvos:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        pts += [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    centro = (mn + mx) / 2
    raio = max((p - centro).length for p in pts)
    return centro, raio


def apontar(cam, centro, raio, direcao):
    d = direcao.normalized()
    sc = bpy.context.scene
    lado_curto = cam.data.sensor_width * min(sc.render.resolution_x, sc.render.resolution_y) / max(sc.render.resolution_x, sc.render.resolution_y)
    fov = 2 * math.atan(lado_curto / 2 / cam.data.lens)
    dist = raio / math.sin(fov / 2) * 1.05
    cam.location = centro + d * dist
    cam.rotation_euler = (centro - cam.location).to_track_quat("-Z", "Y").to_euler()


def _material(nome, cor, rugosidade=0.8):
    mat = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    mat.use_nodes = True
    pb = next(nn for nn in mat.node_tree.nodes if nn.type == "BSDF_PRINCIPLED")
    pb.inputs["Base Color"].default_value = (*cor, 1)
    pb.inputs["Roughness"].default_value = rugosidade
    return mat


def _plano_de_apoio(nome, ponto_cm, normal, tipo, borda_y_cm=None, lado=0.5):
    """Uma lâmina fina (pano verde ou madeira) no plano de apoio, para ver a mão pousar; `borda_y_cm` corta a lâmina numa quina."""
    import bmesh
    from mathutils import Matrix
    P, n = Vector(ponto_cm) * D.CM, Vector(normal).normalized()
    e1 = (Vector((1, 0, 0)) - n * n.x).normalized()
    e2 = n.cross(e1)
    y0, y1 = -lado / 2, lado / 2
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vt in bm.verts:
        vt.co = Vector((vt.co.x * lado, (y0 if vt.co.y < 0 else y1), vt.co.z * 0.012 - 0.006))
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = Matrix(((e1.x, e2.x, n.x, P.x), (e1.y, e2.y, n.y, P.y), (e1.z, e2.z, n.z, P.z), (0, 0, 0, 1)))
    if borda_y_cm is not None:
        ob.location += Vector((0, borda_y_cm * D.CM - lado / 2, 0)) if abs(n.z) > 0.99 else Vector((0, 0, 0))
    cores = {"pano": (0.03, 0.30, 0.14), "madeira": (0.34, 0.14, 0.05)}
    me.materials.append(_material("apoio_" + tipo, cores.get(tipo, (0.3, 0.3, 0.3))))
    return ob


def criar_props():
    """Taco, cubo de giz e plano de apoio de cada pose de contato, a partir de `poses_resolvidas.json` (o .blend não os guarda).

    Devolve {pose: [nomes dos objetos]} para mostrar só os da pose renderizada.
    """
    import json
    from mathutils import Matrix
    dados = json.load(open(os.path.join(PASTA, "poses_resolvidas.json")))
    for o in [o for o in bpy.data.objects if o.name.startswith(("taco", "cubo", "apoio_"))]:
        bpy.data.objects.remove(o, do_unlink=True)
    mapa = {}
    for nome, d in dados.items():
        e = d["extra"]
        mapa[nome] = []
        if "taco_P_cm" in e:
            ponte = "apoio_ponto_cm" in e  # a ponte mostra o taco da ponta para trás (o cabo some atrás da câmera); o resto, 25 cm de cada lado
            V.criar_taco_visual(V.Taco(Vector(e["taco_P_cm"]) * D.CM, Vector(e["taco_u"]), e["taco_s_m"]), "taco_" + nome,
                                comprimento=0.9 if ponte else 0.5, ate_a_ponta=ponte)
            mapa[nome].append("taco_" + nome)
        if "apoio_ponto_cm" in e:
            _plano_de_apoio("apoio_" + nome, e["apoio_ponto_cm"], e["apoio_normal"], e.get("apoio_tipo", "pano"), e.get("apoio_borda_y_cm"))
            mapa[nome].append("apoio_" + nome)
        if "cubo_C_cm" in e:
            n, e1 = Vector(e["cubo_n"]), Vector(e["cubo_e1"])
            e2, C = n.cross(e1), Vector(e["cubo_C_cm"]) * D.CM
            import bmesh
            me = bpy.data.meshes.new("cubo_giz")
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=e["cubo_aresta_m"])
            bm.to_mesh(me)
            bm.free()
            ob = bpy.data.objects.new("cubo_giz", me)
            bpy.context.scene.collection.objects.link(ob)
            ob.matrix_world = Matrix(((n.x, e1.x, e2.x, C.x), (n.y, e1.y, e2.y, C.y), (n.z, e1.z, e2.z, C.z), (0, 0, 0, 1)))
            me.materials.append(_material("giz_azul", (0.9, 0.55, 0.1), 0.9))
            mapa[nome].append("cubo_giz")
    return mapa


def modo_silhueta():
    """Workbench com luz chapada: a mão toda preta sobre fundo branco (para ler o gesto só pela silhueta)."""
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "FLAT"
    sh.color_type = "SINGLE"
    sh.single_color = (0.0, 0.0, 0.0)
    sh.show_object_outline = False
    sc.view_settings.view_transform = "Standard"
    sc.world.use_nodes = False
    sc.world.color = (1, 1, 1)
    try:
        sc.display.render_aa = "8"
    except TypeError:
        pass


def principal():
    a = argumentos()
    os.makedirs(a.saida, exist_ok=True)
    cam = montar_cena(a.tam, a.amostras)
    import mao_poses as P
    importlib.reload(P)
    arm = bpy.data.objects["mao_esqueleto"]
    arm.hide_render = True
    arm.animation_data_create().use_nla = False  # a pose vem de `aplicar` ou de uma ação escolhida, não da pilha NLA
    for nome, ob in (("mao_alta", bpy.data.objects.get("mao_alta")), ("mao_baixa", bpy.data.objects.get("mao_baixa"))):
        if ob:
            ob.hide_render = not nome.endswith(a.lod)
            ob.hide_viewport = ob.hide_render
    mapa = criar_props() if (a.props == "json" and not a.sem_apoio) else {}
    if a.silhueta:
        modo_silhueta()
    alvo = bpy.data.objects["mao_" + a.lod]
    import mao_gestos as G
    importlib.reload(G)
    todas = {**P.POSES, **G.LAB}
    poses = [p for p in a.poses.split(",") if p] or list(P.POSES)
    ANGULOS["joinha"] = Vector((0.7, 0.9, 0.35))
    angulos = [x for x in a.angulos.split(",") if x]
    quadros = [float(q) for q in a.quadros.split(",") if q] or ([a.quadro] if a.quadro is not None else [None])
    for nome in poses:
        fixa = None
        if len(quadros) > 1:                         # câmera parada: a caixa que cobre a mão em todos os quadros pedidos
            pts = []
            for quadro in quadros:
                arm.animation_data.action = bpy.data.actions[nome]
                bpy.context.scene.frame_set(int(quadro))
                bpy.context.view_layer.update()
                c0, r0 = caixa_dos_alvos([alvo])
                pts.append((c0, r0))
            mn = Vector((min(c.x - r for c, r in pts), min(c.y - r for c, r in pts), min(c.z - r for c, r in pts)))
            mx = Vector((max(c.x + r for c, r in pts), max(c.y + r for c, r in pts), max(c.z + r for c, r in pts)))
            fixa = ((mn + mx) / 2, max(r for _, r in pts) * 1.15 + (mx - mn).length * 0.12)
        for quadro in quadros:
            if quadro is None:
                L.aplicar(arm, todas[nome])
            else:
                arm.animation_data.action = bpy.data.actions[nome]
                bpy.context.scene.frame_set(int(quadro))
            for o in bpy.data.objects:
                if o.name.startswith(("taco", "cubo", "apoio_")):
                    o.hide_render = o.name not in mapa.get(nome, [])
            bpy.context.view_layer.update()
            centro, raio = fixa if fixa else caixa_dos_alvos([alvo])
            for ang in angulos:
                apontar(cam, centro, raio, ANGULOS[ang])
                sufixo = "" if quadro is None else "_q%d" % quadro
                bpy.context.scene.render.filepath = os.path.join(a.saida, "%s%s_%s.png" % (nome, sufixo, ang))
                bpy.ops.render.render(write_still=True)
                print("render", bpy.context.scene.render.filepath)


if __name__ == "__main__":
    principal()
