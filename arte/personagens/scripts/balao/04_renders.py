"""Etapa 3d: renders EEVEE do balão com a luz do jogo (a mesma da mão), para as rodadas de olhar e corrigir e para a folha.

Uso (o EEVEE precisa do X aberto):
  DISPLAY=:1 blender -b arte/personagens/balao.blend --python arte/personagens/scripts/balao/04_renders.py -- \
      --saida DIR --vistas rosto,corpo --formas cara_sorriso,cara_susto [--acao balao_pulinho --quadros 10,20] [--lod alta|baixa] \
      [--tam 640x640] [--olhar x,y,z (cm, mundo)] [--cor azul|branco]

Uma imagem por (forma ou quadro, vista): `<rotulo>_<vista>.png`. `--formas` aceita `nome` ou `nome=0.5`.
Vistas: rosto, rosto34, corpo, lado, jogo (câmera do jogo, feltro verde, 1,3 m atrás, a 0,5 m de altura).
"""
import argparse
import importlib
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

R = importlib.import_module("06_renders")   # a luz e a cena de EEVEE da mão

CM = D.CM
# nome: (alvo em cm, distância em cm, direção de onde a câmera olha, lente)
VISTAS = {
    "rosto": ((0, -4.5, 0.9), 22, (0, -1, 0.03), 70),
    "rosto34": ((0, -4.0, 0.9), 22, (0.55, -1, 0.1), 70),
    "corpo": ((0, 0, -2.2), 54, (0, -1, 0.04), 70),
    "lado": ((0, 0, -2.2), 54, (1, -0.05, 0.04), 70),
}


def argumentos():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--saida", required=True)
    p.add_argument("--vistas", default="rosto,corpo")
    p.add_argument("--formas", default="")
    p.add_argument("--acao", default="")
    p.add_argument("--quadros", default="")
    p.add_argument("--lod", default="alta")
    p.add_argument("--tam", default="640x640")
    p.add_argument("--amostras", type=int, default=48)
    p.add_argument("--olhar", default="")
    p.add_argument("--cor", default="azul")
    p.add_argument("--dist", type=float, default=0.0, help="distância da câmera em cm (substitui a da vista); --alvo z em cm do ponto de mira")
    p.add_argument("--alvoz", type=float, default=None)
    p.add_argument("--yaw", type=float, default=0.0, help="giro do balão em graus na vista do jogo")
    return p.parse_args(argv)


def apontar(cam, alvo, dist, direcao, lente):
    cam.data.lens = lente
    d = Vector(direcao).normalized()
    cam.location = Vector(alvo) * CM + d * dist * CM
    cam.rotation_euler = (Vector(alvo) * CM - cam.location).to_track_quat("-Z", "Y").to_euler()


def feltro():
    """Um plano verde de feltro, para a vista do jogo (o balão fica pairando acima da mesa)."""
    for o in [o for o in bpy.data.objects if o.name == "feltro_previa"]:
        bpy.data.objects.remove(o, do_unlink=True)
    me = bpy.data.meshes.new("feltro_previa")
    me.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new("feltro_previa", me)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.get("feltro_previa") or bpy.data.materials.new("feltro_previa")
    mat.use_nodes = True
    pb = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    pb.inputs["Base Color"].default_value = (0.01, 0.15, 0.035, 1)
    pb.inputs["Roughness"].default_value = 0.9
    me.materials.append(mat)
    return ob


def aplicar_formas(ob, formas):
    """formas: {nome: valor}. Zera as outras."""
    for kb in ob.data.shape_keys.key_blocks[1:]:
        kb.value = formas.get(kb.name, 0.0)


def olhar_para(arm, ponto_cm):
    """Gira os dois olhos para o ponto (mundo, cm), com o limite do jogo; mesma conta que o Frontend vai fazer."""
    bpy.context.view_layer.update()
    for nome in ("olho_esq", "olho_dir"):
        pb = arm.pose.bones[nome]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1, 0, 0, 0)
        bpy.context.view_layer.update()
        cabeca = arm.matrix_world @ pb.head
        alvo = Vector(ponto_cm) * CM
        repouso = (arm.matrix_world @ pb.matrix).to_3x3() @ Vector((0, 1, 0))
        d = (alvo - cabeca).normalized()
        q = repouso.rotation_difference(d)
        ang = q.angle
        lim = math.radians(D.LIMITE_DO_OLHAR)
        if ang > lim:
            q = repouso.rotation_difference(repouso.lerp(d, lim / ang).normalized())
        # q está no mundo; passa para o referencial do osso (que o `pb.matrix` define)
        base = (arm.matrix_world @ pb.matrix).to_3x3()
        pb.rotation_quaternion = (base.inverted() @ q.to_matrix() @ base).to_quaternion()
    bpy.context.view_layer.update()


def principal():
    a = argumentos()
    os.makedirs(a.saida, exist_ok=True)
    cam = R.montar_cena(a.tam, a.amostras)
    arm = bpy.data.objects["balao_esqueleto"]
    arm.hide_render = True
    ad = arm.animation_data_create()
    ad.use_nla = False
    for nm in ("balao_alta", "balao_baixa"):
        ob = bpy.data.objects.get(nm)
        if ob:
            ob.hide_render = not nm.endswith(a.lod)
            ob.hide_viewport = ob.hide_render
    corpo = bpy.data.objects["balao_" + a.lod]
    if a.cor == "branco":
        corpo.data.materials[0] = bpy.data.materials["latex_glb"] if "latex_glb" in bpy.data.materials else corpo.data.materials[0]
    for o in bpy.data.objects:
        if o.name.startswith("mao_"):
            o.hide_render = True
    pedidos = []
    if a.acao:
        for q in a.quadros.split(","):
            pedidos.append(("%s_q%03d" % (a.acao, int(q)), {D.PAR_DE_CARA[a.acao]: 1.0} if not a.formas else {}, int(q)))
    else:
        formas = [f for f in a.formas.split(",") if f] or ["cara_neutro"]
        for f in formas:
            nome, _, val = f.partition("=")
            pedidos.append((f, {nome: float(val or 1.0)}, None))
    vistas = [v for v in a.vistas.split(",") if v]
    if "jogo" in vistas:
        feltro()
    for rotulo, formas_val, quadro in pedidos:
        for ob in (bpy.data.objects.get("balao_alta"), bpy.data.objects.get("balao_baixa")):
            if ob and ob.data.shape_keys:
                aplicar_formas(ob, formas_val)
        if a.acao:
            ac = bpy.data.actions[a.acao]
            ad.action = ac
            if hasattr(ad, "action_slot") and ac.slots:
                ad.action_slot = ac.slots[0]
            bpy.context.scene.frame_set(quadro)
        else:
            for pb in arm.pose.bones:
                pb.rotation_mode = "XYZ"
                pb.rotation_euler, pb.location, pb.scale = (0, 0, 0), (0, 0, 0), (1, 1, 1)
        if a.olhar:
            olhar_para(arm, [float(x) for x in a.olhar.split(",")])
        bpy.context.view_layer.update()
        for vista in vistas:
            if vista == "jogo":
                # balão a 1 m do olho, câmera mais alta que ele, como no jogo
                arm.location = (0.0, 0.0, 0.16)
                arm.rotation_euler = (0, 0, math.radians(a.yaw))
                cam.data.lens = 38
                cam.location = Vector((0.0, -1.3, 0.5))
                alvo = Vector((0.0, 0.0, 0.14))
                cam.rotation_euler = (alvo - cam.location).to_track_quat("-Z", "Y").to_euler()
            else:
                alvo, dist, direcao, lente = VISTAS[vista]
                if a.dist:
                    dist = a.dist
                if a.alvoz is not None:
                    alvo = (alvo[0], alvo[1], a.alvoz)
                apontar(cam, alvo, dist, direcao, lente)
            bpy.context.scene.render.filepath = os.path.join(a.saida, "%s_%s.png" % (rotulo, vista))
            bpy.ops.render.render(write_still=True)
            print("render", bpy.context.scene.render.filepath)


principal()
