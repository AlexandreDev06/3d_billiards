"""Medidas sobre a malha deformada da mão: distância assinada, taco cônico, cubo de giz e âncoras na superfície.

Tudo em metros (referencial da mão). O taco do jogo tem 1,45 m, raio de 6 mm na ponta e 15 mm no cabo (`packages/fisica`).
"""
import math

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

CM = 0.01
TACO_COMP = 1.45
TACO_R_PONTA = 0.006
TACO_R_CABO = 0.015


def bvh_da_mao(ob):
    """BVH da malha avaliada (deformada pelo esqueleto) do objeto."""
    bpy.context.view_layer.update()
    return BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())


def vertices_deformados(ob):
    """Posições (n, 3) dos vértices depois do esqueleto, em metros."""
    bpy.context.view_layer.update()
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    n = len(me.vertices)
    a = np.empty(n * 3, dtype=np.float64)
    me.vertices.foreach_get("co", a)
    ev.to_mesh_clear()
    return a.reshape(n, 3)


def distancia_assinada(bvh, p):
    """Distância de p à superfície: positiva fora, negativa dentro (pela normal do ponto mais próximo)."""
    loc, nor, _, dist = bvh.find_nearest(p)
    if loc is None:
        return 1e3
    return dist if (p - loc).dot(nor) >= 0 else -dist


class Taco:
    """O taco como eixo + raio cônico. `u` aponta do cabo para a ponta; `s` é a distância da ponta a `P`."""

    def __init__(self, P, u, s):
        self.P = Vector(P)
        self.u = Vector(u).normalized()
        self.s = s

    def raio(self, t):
        d_ponta = min(max(self.s - t, 0.0), TACO_COMP)
        return TACO_R_PONTA + (TACO_R_CABO - TACO_R_PONTA) * d_ponta / TACO_COMP

    def ponto(self, t):
        return self.P + self.u * t

    def posicao_e_raio(self, p):
        """(t, distância ao eixo, raio do taco ali) de um ponto."""
        t = (p - self.P).dot(self.u)
        return t, (p - self.ponto(t)).length, self.raio(t)

    def penetracao(self, bvh, t0=-0.11, t1=0.11, n=45):
        """Maior penetração (m) do taco na malha, e as amostras (t, folga) com folga = distância − raio."""
        folgas = []
        for t in np.linspace(t0, t1, n):
            p = self.ponto(float(t))
            folgas.append((float(t), distancia_assinada(bvh, p) - self.raio(float(t))))
        pen = max(0.0, -min(f for _, f in folgas))
        return pen, folgas

    def contatos(self, bvh, t0=-0.11, t1=0.11, n=45, tol=0.0015):
        """Direções (graus em volta do eixo) onde o taco encosta (folga < tol), para saber se está preso."""
        ang = []
        ref = Vector((0, 0, 1)) if abs(self.u.z) < 0.9 else Vector((1, 0, 0))
        e1 = (ref - self.u * ref.dot(self.u)).normalized()
        e2 = self.u.cross(e1)
        for t in np.linspace(t0, t1, n):
            p = self.ponto(float(t))
            loc, nor, _, dist = bvh.find_nearest(p)
            if loc is None:
                continue
            if abs(dist - self.raio(float(t))) < tol:
                d = (loc - p)
                ang.append(math.degrees(math.atan2(d.dot(e2), d.dot(e1))) % 360)
        return ang


def _base_do_taco(taco):
    """(cima, direita) no plano perpendicular ao taco, vendo de trás para a ponta (para u = +Y: cima = +Z, direita = +X)."""
    ref = Vector((0, 0, 1)) if abs(taco.u.z) < 0.9 else Vector((0, 1, 0))
    cima = (ref - taco.u * ref.dot(taco.u)).normalized()
    return cima, taco.u.cross(cima)


def folgas_por_setor(taco, bvh, setores, t0=-0.11, t1=0.11, n=45, vazio=0.006):
    """Menor folga (m) do taco em cada setor angular (graus a partir de "cima", crescendo para a direita).

    `setores` é {nome: (de, ate)}. Setor sem nenhum contato por perto devolve `vazio`.
    """
    cima, dire = _base_do_taco(taco)
    achado = {k: vazio for k in setores}
    for t in np.linspace(t0, t1, n):
        p = taco.ponto(float(t))
        loc, nor, _, dist = bvh.find_nearest(p)
        if loc is None:
            continue
        d = loc - p
        ang = math.degrees(math.atan2(d.dot(dire), d.dot(cima))) % 360
        folga = (dist if (p - loc).dot(nor) >= 0 else -dist) - taco.raio(float(t))
        for k, faixas in setores.items():
            for de, ate in (faixas if isinstance(faixas, list) else [faixas]):
                if de <= ang <= ate:
                    achado[k] = min(achado[k], folga)
    return achado


def folgas_radiais(taco, bvh, setores, t0=-0.11, t1=0.11, n=45, vazio=0.02, passo_ang=15):
    """Como `folgas_por_setor`, mas lançando raios do eixo do taco para fora: setor vazio mede a distância até a mão (com gradiente)."""
    cima, dire = _base_do_taco(taco)
    achado = {k: vazio for k in setores}
    for t in np.linspace(t0, t1, n):
        p = taco.ponto(float(t))
        r = taco.raio(float(t))
        for k, faixas in setores.items():
            for de, ate in (faixas if isinstance(faixas, list) else [faixas]):
                for ang in np.arange(de, ate + 0.1, passo_ang):
                    a = math.radians(float(ang))
                    d = (cima * math.cos(a) + dire * math.sin(a)).normalized()
                    hit, _, _, dist = bvh.ray_cast(p, d, vazio + r)
                    if hit is not None:
                        achado[k] = min(achado[k], dist - r)
    return achado


def cobertura_angular(angulos, passo=30):
    """Quantos setores de `passo` graus em volta do taco têm contato (12 setores de 30°)."""
    return len({int(a // passo) for a in angulos})


def ancora(ob_malha, pos_cm):
    """Índice do vértice (malha em repouso) mais próximo de um ponto dado em cm."""
    alvo = Vector((pos_cm[0] * CM, pos_cm[1] * CM, pos_cm[2] * CM))
    me = ob_malha.data
    return min(range(len(me.vertices)), key=lambda i: (me.vertices[i].co - alvo).length_squared)


def criar_taco_visual(taco, nome="taco_prova", comprimento=0.5, ate_a_ponta=False):
    """Cone do taco (só para ver na cena e nos renders; não vai para o .glb). Centrado em `P`; com `ate_a_ponta` termina na ponta (t = s) e cresce para o cabo."""
    import bmesh
    for o in [o for o in bpy.data.objects if o.name == nome]:
        bpy.data.objects.remove(o, do_unlink=True)
    bm = bmesh.new()
    lados = 24
    t_ini, t_fim = (taco.s - comprimento, taco.s) if ate_a_ponta else (-comprimento / 2, comprimento / 2)
    aneis = []
    for t in np.linspace(t_ini, t_fim, 14):
        r = taco.raio(float(t))
        anel = [bm.verts.new(Vector((r * math.cos(2 * math.pi * k / lados), r * math.sin(2 * math.pi * k / lados), float(t))))
                for k in range(lados)]
        aneis.append(anel)
    for i in range(len(aneis) - 1):
        for k in range(lados):
            bm.faces.new((aneis[i][k], aneis[i][(k + 1) % lados], aneis[i + 1][(k + 1) % lados], aneis[i + 1][k]))
    bm.faces.new(aneis[0][::-1])
    bm.faces.new(aneis[-1])
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    # o eixo +Z local do cone vira a direção u e fica centrado em P
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(taco.u)
    ob.location = taco.P
    mat = bpy.data.materials.get("madeira_taco") or bpy.data.materials.new("madeira_taco")
    mat.use_nodes = True
    pb = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    pb.inputs["Base Color"].default_value = (0.62, 0.34, 0.12, 1)
    pb.inputs["Roughness"].default_value = 0.45
    me.materials.append(mat)
    return ob


def pesos_da_malha(ob):
    """(W, nomes): matriz (n vértices × n grupos) com os pesos de pele da malha e o nome de cada grupo."""
    me = ob.data
    nomes = [g.name for g in ob.vertex_groups]
    W = np.zeros((len(me.vertices), len(nomes)))
    for v in me.vertices:
        for g in v.groups:
            W[v.index, g.group] = g.weight
    return W, nomes


def grupos_da_malha(ob, minimo=0.5):
    """Índices dos vértices por parte da mão: `cuff` (o punho rígido), `palma` e `<dedo>_1..3` (o osso que mais pesa ali).

    A ponta de um dedo é o `<dedo>_3`; o ponto mais baixo dele é onde a polpa pousa.
    """
    W, nomes = pesos_da_malha(ob)
    saida = {"cuff": np.nonzero(W[:, nomes.index("pulso")] > 0.99)[0], "palma": np.nonzero(W[:, nomes.index("palma")] >= 0.8)[0]}
    for i, nome in enumerate(nomes):
        if nome[-2:] in ("_1", "_2", "_3"):
            saida[nome] = np.nonzero(W[:, i] >= minimo)[0]
    return saida


def altura_no_plano(Z, indices, ponto, normal):
    """Menor distância assinada (m) dos vértices `indices` ao plano (ponto, normal); positiva acima do plano."""
    n = np.asarray(normal, dtype=float)
    return float(((Z[indices] - np.asarray(ponto, dtype=float)) @ n).min())
