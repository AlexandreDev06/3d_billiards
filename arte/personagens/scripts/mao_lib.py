"""Funções comuns dos scripts da mão. Importado por `01_forma.py` ... `06_renders.py`; não roda sozinho."""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

import mao_dados as D

CM = D.CM


def v(t):
    """Tupla em cm → Vector em metros."""
    return Vector((t[0] * CM, t[1] * CM, t[2] * CM))


def apagar(prefixo):
    """Apaga objetos cujo nome começa com o prefixo, e os dados que ficarem sem uso."""
    for o in [o for o in bpy.data.objects if o.name.startswith(prefixo)]:
        dados_nome = o.data.name if o.data is not None else None
        bpy.data.objects.remove(o, do_unlink=True)
        for colecao in (bpy.data.meshes, bpy.data.armatures, bpy.data.metaballs):
            d = colecao.get(dados_nome) if dados_nome else None
            if d is not None and d.users == 0:
                colecao.remove(d)


def material_latex(nome="latex", cor=D.COR_PREVIA, branco=False, escuro=1.0):
    """Látex liso e brilhante: cor base (branca no .glb) e verniz por cima (KHR_materials_clearcoat). `escuro` < 1 é o mesmo látex mais escuro."""
    mat = bpy.data.materials.get(nome) or bpy.data.materials.new(nome)
    mat.use_nodes = True
    pb = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    pb.inputs["Base Color"].default_value = (escuro, escuro, escuro, 1) if branco else (*[c * escuro for c in cor], 1)
    pb.inputs["Roughness"].default_value = 0.32
    pb.inputs["Metallic"].default_value = 0.0
    for chave, valor in (("Coat Weight", 0.8), ("Coat Roughness", 0.06), ("Specular IOR Level", 0.5)):
        if chave in pb.inputs:
            pb.inputs[chave].default_value = valor
    return mat


def malha_de_bmesh(nome, bm):
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.update()
    return me


def reparar(bm, tentativas=5):
    """Apaga as faces ao redor de arestas/vértices não-manifold (defeitos do marching cubes) e fecha os buracos."""
    for i in range(tentativas):
        ruins = set()
        for e in bm.edges:
            if not e.is_manifold or e.is_boundary:
                ruins.update(e.link_faces)
        for vt in bm.verts:
            if not vt.is_manifold:
                ruins.update(vt.link_faces)
        if not ruins:
            return i
        bmesh.ops.delete(bm, geom=list(ruins), context="FACES")
        bmesh.ops.delete(bm, geom=[vt for vt in bm.verts if not vt.link_faces], context="VERTS")
        bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=64)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    raise RuntimeError("não consegui deixar a casca manifold")


def malha_densa_da_forma():
    """A casca do marching cubes da metabola, soldada, triangulada e com normais para fora (metros)."""
    ob = bpy.data.objects["mao_forma"]
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    me.transform(ob.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    reparar(bm)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return bm


def reduzir(bm, alvo_tris=20000):
    """Colapso de arestas até ~20 mil triângulos: o Quadriflow só aceita malhas nesse tamanho."""
    me = malha_de_bmesh("tmp_densa", bm)
    ob = bpy.data.objects.new("tmp_densa", me)
    bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new("dec", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = min(1.0, alvo_tris / max(1, len(me.polygons)))
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    return me2


def quadriflow(me, quadros, nome):
    """Retopologia em quadriláteros regulares (determinística, seed 1). Devolve o objeto."""
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    for o in list(bpy.context.view_layer.objects):
        if o is not None:
            o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    r = bpy.ops.object.quadriflow_remesh(
        target_faces=quadros, use_mesh_symmetry=False, use_preserve_sharp=False,
        use_preserve_boundary=False, smooth_normals=True, mode="FACES", seed=1)
    if "FINISHED" not in r:
        raise RuntimeError("Quadriflow recusou a malha: %s" % (r,))
    return ob


def catmull_rom(pontos, por_trecho):
    """Curva suave que passa pelos pontos (2D), `por_trecho` amostras entre dois pontos."""
    n = len(pontos)
    saida = []
    for i in range(n - 1):
        p0 = pontos[max(i - 1, 0)]
        p1, p2 = pontos[i], pontos[i + 1]
        p3 = pontos[min(i + 2, n - 1)]
        for k in range(por_trecho):
            t = k / por_trecho
            t2, t3 = t * t, t * t * t
            saida.append(tuple(
                0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2
                       + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(2)))
    saida.append(pontos[-1])
    return saida


def malha_do_punho(lados=18, por_trecho=1):
    """O punho enrolado de luva: casca de revolução (elíptica) com a borda enrolada e uma tampa côncava no fundo. Em metros.

    A tampa (`PUNHO_FUNDO`) leva o material 1 (`latex_fundo`, o mesmo látex mais escuro); o resto da casca, o 0.
    """
    a0, b0 = D.PUNHO_ELIPSE
    perfil = catmull_rom([(u, y) for (u, y) in D.PUNHO_PERFIL], por_trecho)
    bm = bmesh.new()
    topo = bm.verts.new(v((0, perfil[0][1], 0)))
    aneis = []
    for (u, y) in perfil:
        anel = []
        for k in range(lados):
            t = 2 * math.pi * k / lados
            anel.append(bm.verts.new(v(((a0 + u) * math.cos(t), y, (b0 + u) * math.sin(t)))))
        aneis.append(anel)
    boca_u, boca_y = perfil[-1]
    fundo = D.PUNHO_FUNDO
    tampa = []
    for s in fundo["aneis"]:
        y = boca_y + fundo["fundura"] * (1 - s * s)
        tampa.append([bm.verts.new(v(((a0 + boca_u) * s * math.cos(2 * math.pi * k / lados), y,
                                      (b0 + boca_u) * s * math.sin(2 * math.pi * k / lados)))) for k in range(lados)])
    centro = bm.verts.new(v((0, boca_y + fundo["fundura"], 0)))
    for k in range(lados):
        bm.faces.new((topo, aneis[0][(k + 1) % lados], aneis[0][k]))
    for i in range(len(aneis) - 1):
        for k in range(lados):
            bm.faces.new((aneis[i][k], aneis[i][(k + 1) % lados], aneis[i + 1][(k + 1) % lados], aneis[i + 1][k]))
    escuras = []
    seq = [aneis[-1]] + tampa
    for i in range(len(seq) - 1):
        for k in range(lados):
            escuras.append(bm.faces.new((seq[i][k], seq[i][(k + 1) % lados], seq[i + 1][(k + 1) % lados], seq[i + 1][k])))
    for k in range(lados):
        escuras.append(bm.faces.new((centro, tampa[-1][k], tampa[-1][(k + 1) % lados])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    for f in escuras:
        f.material_index = 1
    return bm


def unir_bmeshes(*bms):
    """Junta bmeshes numa só (cascas separadas, sem soldar)."""
    saida = bmesh.new()
    for b in bms:
        me = bpy.data.meshes.new("tmp_uniao")
        b.to_mesh(me)
        saida.from_mesh(me)
        bpy.data.meshes.remove(me)
        b.free()
    return saida


def zerar(arm):
    """Esqueleto em repouso (todas as rotações e deslocamentos em zero)."""
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)


def aplicar(arm, pose):
    """Põe a pose (dict osso → graus; `loc` em cm desloca o pulso) no esqueleto, sem gravar nada."""
    zerar(arm)
    for nome, rot in pose.items():
        if nome == "loc":
            continue
        arm.pose.bones[nome].rotation_euler = tuple(math.radians(a) for a in rot)
    if "loc" in pose:
        arm.pose.bones["pulso"].location = tuple(c * CM for c in pose["loc"])
    bpy.context.view_layer.update()
