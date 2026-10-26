"""Etapa 1e: acha, medindo a malha de verdade, os ângulos das poses que encostam em algo.

`pose_ponte_v` (o V segura o taco), `pose_punho` (o anel segura o cabo) e `pose_pinca` (cubo de giz de 2,2 cm).
Resolve com mínimos quadrados (`mao_solver.py`) e grava `poses_resolvidas.json`, que o `mao_poses.py` lê.
Rode na janela do Blender (ou sem janela) depois de `04_poses.py`: `resolver(["ponte"])`, `resolver(["punho"])`...
"""
import importlib
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import mao_dados as D
import mao_lib as L
import mao_provas as V
import mao_solver as S

for _m in (D, L, V, S):
    importlib.reload(_m)

CM = D.CM
ARQUIVO = os.path.join(PASTA, "poses_resolvidas.json")
EIXO = {"x": 0, "y": 1, "z": 2}


def carregar():
    return json.load(open(ARQUIVO)) if os.path.exists(ARQUIVO) else {}


def gravar(nome, pose, extra):
    dados = carregar()
    dados[nome] = {"pose": pose, "extra": extra}
    json.dump(dados, open(ARQUIVO, "w"), indent=1, sort_keys=True)


class Cena:
    """Tem a mão, o esqueleto e as funções de medir para os problemas."""

    def __init__(self, lod="mao_alta"):
        self.arm = bpy.data.objects["mao_esqueleto"]
        self.arm.animation_data_create().use_nla = False
        self.ob = bpy.data.objects[lod]
        self.ob.hide_set(False)
        L.zerar(self.arm)
        bpy.context.view_layer.update()
        self.rest = np.array([tuple(v.co) for v in self.ob.data.vertices])  # em metros

    def ancora(self, pos_cm):
        a = np.array([pos_cm[0] * CM, pos_cm[1] * CM, pos_cm[2] * CM])
        return int(np.argmin(((self.rest - a) ** 2).sum(axis=1)))

    def pose_de(self, base, params, x):
        """Dict de pose: a base mais os parâmetros 'osso:eixo' de x; devolve (pose, taco_ou_cubo dict)."""
        pose = {k: list(v) if k != "loc" else v for k, v in base.items()}
        livre = {}
        for p, v in zip(params, x):
            if ":" in p.nome and not p.nome.startswith(("taco:", "cubo:")):
                osso, eixo = p.nome.split(":")
                pose.setdefault(osso, [0.0, 0.0, 0.0])
                pose[osso][EIXO[eixo]] = float(v)
            else:
                livre[p.nome.split(":")[1]] = float(v)
        return pose, livre

    def medir(self, pose):
        L.aplicar(self.arm, {k: tuple(v) if k != "loc" else v for k, v in pose.items()})
        return V.vertices_deformados(self.ob), V.bvh_da_mao(self.ob)


def taco_de(livre, s):
    """Taco a partir de px, py, pz (cm) e yaw/pitch (graus)."""
    psi, phi = math.radians(livre.get("yaw", 0.0)), math.radians(livre.get("pitch", 0.0))
    u = Vector((math.sin(psi) * math.cos(phi), math.cos(psi) * math.cos(phi), math.sin(phi)))
    P = Vector((livre["px"] * CM, livre.get("py", 6.0) * CM, livre["pz"] * CM))
    return V.Taco(P, u, s)


def angulos(nome, lo, hi, ini, w=0.03, ref=None):
    return S.Param(nome, lo, hi, ini, pref=ref, peso=w)


# ---------------------------------------------------------------------------------------------------------------
# Ponte aberta (o V): palma e pontas dos dedos num plano, dedos em leque, polegar levantado colado no nó do indicador.
# ---------------------------------------------------------------------------------------------------------------
SETORES_V = {"esq": (225, 315), "dir": (90, 200)}  # o taco encosta no polegar (esquerda) e no ombro do indicador/teia (direita, embaixo)


def problema_ponte(c, cue=(-4.8, 3.0)):
    t = D.POLEGAR
    a_t = math.radians(t["ang"])
    dt = np.array([-math.sin(a_t), math.cos(a_t), 0.0])
    ancoras = {"polegar_ponta": c.ancora(np.array(t["raiz"]) + dt * t["comp"])}
    for nome, d in D.DEDOS.items():
        dd = np.array(D.direcao(d["ang"]))
        ancoras["ponta_" + nome] = c.ancora(np.array(d["raiz"]) + dd * (d["comp"] - d["raio"] * 1.1) + np.array([0, 0, -d["raio"] * 0.95]))
    z_mesa = float(c.rest[:, 2].min())  # a palma sobre a tabela: o ponto mais baixo da mão em repouso

    params = [
        angulos("polegar_1:x", -85, 40, -45, 0.02, -45), angulos("polegar_1:y", -45, 45, 0, 0.05),
        angulos("polegar_1:z", -30, 30, 0, 0.05),
        angulos("polegar_2:x", -25, 40, -8, 0.06), angulos("polegar_2:y", -15, 15, 0, 0.08),
        angulos("polegar_3:x", -20, 45, -5, 0.06),
        angulos("indicador_1:x", -25, 35, 3, 0.05), angulos("indicador_1:z", -10, 6, -1, 0.3, -1),
        angulos("indicador_2:x", -8, 30, 0, 0.1), angulos("indicador_3:x", -8, 30, 0, 0.1),
    ]
    for nome, abre in (("medio", 0.0), ("anelar", 0.5), ("minimo", 1.5)):          # leque fechado: os dedos seguem o desenho de repouso
        params += [angulos(nome + "_1:x", -25, 35, 3, 0.05), angulos(nome + "_1:z", -8, 8, abre, 0.3, abre),
                   angulos(nome + "_2:x", -8, 25, 0, 0.1), angulos(nome + "_3:x", -8, 25, 0, 0.1)]
    params += [angulos("palma:x", -12, 12, 0, 0.1), angulos("palma:y", -10, 10, 0, 0.1)]
    params += [S.Param("taco:px", -9.0, -1.0, cue[0], peso=0.0, passo=0.1), S.Param("taco:pz", 0.5, 7.0, cue[1], peso=0.0, passo=0.1),
               S.Param("taco:yaw", -1.5, 1.5, 0, peso=0.02), S.Param("taco:pitch", -1.5, 1.5, 0, peso=0.02)]
    s_taco = 0.25
    estado = {}

    def residuos(x):
        pose, livre = c.pose_de({}, params, x)
        Z, bvh = c.medir(pose)
        taco = taco_de(livre, s_taco)
        pen, folgas = taco.penetracao(bvh)
        r = [max(0.0, -f) * 1000 * 2.0 for _, f in folgas]
        setor = V.folgas_por_setor(taco, bvh, SETORES_V)
        for nome in SETORES_V:
            r.append(max(setor[nome], -0.002) * 1000 * 2.0)
        for nome in D.DEDOS:
            r.append((Z[ancoras["ponta_" + nome]][2] - z_mesa) * 1000 * 1.0)
        ponta = Z[ancoras["polegar_ponta"]]
        r.append(max(0.0, 0.068 - (ponta[2] - z_mesa)) * 1000 * 1.2)  # polegar bem em pé
        r.append(max(0.0, taco.P.z + 0.015 - ponta[2]) * 1000 * 1.5)  # o polegar passa mais alto que o taco: é parede, não apoio
        r.append(max(0.0, ponta[0] - (taco.P.x + 0.005)) * 1000 * 1.5)  # e fica do lado esquerdo do taco
        r.append(max(0.0, (taco.P.x - 0.040) - ponta[0]) * 1000 * 1.0)  # sem ficar longe dele
        r.append(max(0.0, z_mesa - 0.0005 - Z[:, 2].min()) * 1000 * 3.0)
        estado.update(pose=pose, livre=livre, taco=taco, pen=pen, bvh=bvh, setor=setor)
        return np.array(r)

    return params, residuos, estado



# ---------------------------------------------------------------------------------------------------------------
# Punho: a mão de trás segura o cabo solto por cima; o polegar e o indicador fazem um anel em volta do taco.
# O taco corre ao longo de X (atravessa a palma por baixo), sob a mão (a palma olha para -Z).
# ---------------------------------------------------------------------------------------------------------------
SETORES_PUNHO = {
    "palma": [(335, 360), (0, 25)],   # em cima: a palma apoia no cabo
    "dedos": (215, 325),              # do lado dos dedos (+Y): os quatro dedos envolvem
    "baixo": (150, 215),
    "anel": (40, 125),                # do lado do pulso (−Y): o anel de polegar e indicador fecha
}


def problema_punho(c, cue=(8.0, -3.5), curva=1.0):
    t = D.POLEGAR
    ancoras = {}
    for nome, d in D.DEDOS.items():
        dd = np.array(D.direcao(d["ang"]))
        ancoras["ponta_" + nome] = c.ancora(np.array(d["raiz"]) + dd * d["comp"])
    a_t = math.radians(t["ang"])
    ancoras["ponta_polegar"] = c.ancora(np.array(t["raiz"]) + np.array([-math.sin(a_t), math.cos(a_t), 0.0]) * t["comp"])
    params = []
    for nome, abre in (("indicador", -4.0), ("medio", 0.0), ("anelar", 3.0), ("minimo", 6.0)):
        params += [angulos(nome + "_1:x", 15, 95, 60 * curva, 0.02, 55), angulos(nome + "_1:z", -22, 22, abre, 0.05, abre),
                   angulos(nome + "_2:x", 5, 115, 75 * curva, 0.02, 70), angulos(nome + "_3:x", 0, 85, 40 * curva, 0.02, 40)]
    params += [angulos("polegar_1:x", -25, 60, 10, 0.03), angulos("polegar_1:y", -75, 75, 35, 0.03),
               angulos("polegar_1:z", -35, 65, 30, 0.03), angulos("polegar_2:x", -10, 70, 30, 0.04),
               angulos("polegar_2:y", -25, 25, 0, 0.05), angulos("polegar_3:x", -10, 80, 30, 0.04)]
    params += [angulos("palma:x", -15, 15, 0, 0.08), angulos("palma:y", -15, 15, 0, 0.08)]
    params += [S.Param("taco:py", 3.0, 13.0, cue[0], peso=0.0, passo=0.1), S.Param("taco:pz", -7.0, -2.0, cue[1], peso=0.0, passo=0.1),
               S.Param("taco:yaw", -4, 4, 0, peso=0.05), S.Param("taco:pitch", -4, 4, 0, peso=0.05)]
    s_taco = 1.10
    estado = {}

    def residuos(x):
        pose, livre = c.pose_de({}, params, x)
        livre["px"] = 0.0
        Z, bvh = c.medir(pose)
        psi, phi = math.radians(livre["yaw"]), math.radians(livre["pitch"])
        u = Vector((math.cos(psi) * math.cos(phi), math.sin(psi) * math.cos(phi), math.sin(phi)))
        taco = V.Taco(Vector((0.0, livre["py"] * CM, livre["pz"] * CM)), u, s_taco)
        pen, folgas = taco.penetracao(bvh, -0.07, 0.07, 43)
        r = [max(0.0, -f) * 1000 * 2.0 for _, f in folgas]
        setor = V.folgas_radiais(taco, bvh, SETORES_PUNHO, -0.06, 0.06, 13)
        for nome in SETORES_PUNHO:
            r.append(max(setor[nome], -0.002) * 1000 * 1.0)
        pi, pp = Z[ancoras["ponta_indicador"]], Z[ancoras["ponta_polegar"]]
        r.append(max(0.0, np.linalg.norm(pi - pp) - 0.012) * 1000 * 1.5)  # as pontas se tocam: o anel fecha
        M = Vector(tuple((pi + pp) / 2))  # o encontro das pontas fica rente ao taco, do lado do pulso e de baixo: o taco passa pelo anel
        t_m, d_m, r_m = taco.posicao_e_raio(M)
        r.append(abs(d_m - (r_m + 0.007)) * 1000 * 1.0)
        cima, dire = V._base_do_taco(taco)
        v_m = M - taco.ponto(t_m)
        ang_m = math.degrees(math.atan2(v_m.dot(dire), v_m.dot(cima))) % 360
        r.append(max(0.0, 70.0 - ang_m, ang_m - 200.0) * 0.12)
        for nome in D.DEDOS:
            r.append(max(0.0, Z[ancoras["ponta_" + nome]][2] + 0.0023 - (-0.019 - 0.004)) * 1000 * 0.0)
        estado.update(pose=pose, livre=livre, taco=taco, pen=pen, bvh=bvh, setor=setor)
        return np.array(r)

    return params, residuos, estado



# ---------------------------------------------------------------------------------------------------------------
# Pinça: polegar, indicador e médio seguram um cubo de giz de 2,2 cm; as polpas dos três encostam nas faces.
# ---------------------------------------------------------------------------------------------------------------
CUBO_H = 0.011  # meia aresta (m)


def base_do_cubo(yaw, pitch, roll):
    """(n, e1, e2): o eixo da pinça (do cubo para o polegar) e as outras duas direções das faces."""
    y, p, r = math.radians(yaw), math.radians(pitch), math.radians(roll)
    n = Vector((math.cos(y) * math.cos(p), math.sin(y) * math.cos(p), math.sin(p)))
    ref = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((0, 1, 0))
    e1 = (ref - n * ref.dot(n)).normalized()
    e2 = n.cross(e1)
    e1, e2 = e1 * math.cos(r) + e2 * math.sin(r), e2 * math.cos(r) - e1 * math.sin(r)
    return n, e1, e2


def pontos_do_cubo(C, n, e1, e2, k=4):
    """Pontos nas seis faces do cubo (grade k×k por face) para medir se a mão entra nele."""
    saida = []
    g = np.linspace(-CUBO_H, CUBO_H, k)
    for eixo, (a, b) in ((n, (e1, e2)), (e1, (n, e2)), (e2, (n, e1))):
        for sinal in (-1, 1):
            for u in g:
                for w in g:
                    saida.append(C + eixo * (sinal * CUBO_H) + a * u + b * w)
    return saida


def problema_pinca(c, indicador=(30.0, 38.0, 28.0), medio=(34.0, 42.0, 28.0), folga=0.0, inicio=None):
    """Polegar de um lado do cubo, indicador e médio do outro; o contato é medido na malha, não em âncoras.

    O centro da face do polegar encosta na pele (a polpa fica na face, nunca na quina); duas polpas dos dedos encostam na
    face oposta; nada entra no cubo. O cubo é livre (posição e três ângulos). `inicio` é um {"pose", "extra"} anterior.
    """
    params = []
    for nome, abre, ini in (("indicador", -3.0, indicador), ("medio", 1.0, medio)):
        params += [angulos(nome + "_1:x", 3, 62, ini[0], 0.02, ini[0]), angulos(nome + "_1:z", -10, 10, abre, 0.4, abre),
                   angulos(nome + "_2:x", 3, 75, ini[1], 0.02, ini[1]), angulos(nome + "_3:x", 0, 50, ini[2], 0.02, ini[2])]
    for nome, abre, ini in (("anelar", 5.0, (40, 52, 32)), ("minimo", 9.0, (46, 58, 34))):
        params += [angulos(nome + "_1:x", 0, 75, ini[0], 0.3, ini[0]), angulos(nome + "_1:z", -18, 18, abre, 0.3, abre),
                   angulos(nome + "_2:x", 0, 90, ini[1], 0.3, ini[1]), angulos(nome + "_3:x", 0, 60, ini[2], 0.3, ini[2])]
    params += [angulos("polegar_1:x", -25, 60, 15, 0.03), angulos("polegar_1:y", -75, 75, 30, 0.03),
               angulos("polegar_1:z", -35, 65, 25, 0.03), angulos("polegar_2:x", -10, 70, 25, 0.04),
               angulos("polegar_2:y", -25, 25, 0, 0.05), angulos("polegar_3:x", -10, 80, 25, 0.04)]
    params += [angulos("palma:x", -15, 15, 0, 0.1), angulos("palma:y", -15, 15, 0, 0.1)]
    cx, cy, cz, yaw, pitch, roll = -2.8, 11.5, -1.5, -86.0, -7.0, 0.0
    if inicio:
        e = inicio["extra"]
        cx, cy, cz = e["cubo_C_cm"]
        n0 = Vector(e["cubo_n"])
        yaw, pitch = math.degrees(math.atan2(n0.y, n0.x)), math.degrees(math.asin(max(-1.0, min(1.0, n0.z))))
        for q in params:
            osso, eixo = q.nome.split(":")
            if osso in inicio["pose"]:
                q.inicio = inicio["pose"][osso][EIXO[eixo]]
    params += [S.Param("cubo:cx", -9.0, 4.0, cx, peso=0.0, passo=0.1), S.Param("cubo:cy", 8.0, 15.0, cy, peso=0.0, passo=0.1),
               S.Param("cubo:cz", -6.0, 3.0, cz, peso=0.0, passo=0.1), S.Param("cubo:yaw", -180.0, 180.0, yaw, peso=0.0, passo=1.0),
               S.Param("cubo:pitch", -80.0, 80.0, pitch, peso=0.0, passo=1.0), S.Param("cubo:roll", -90.0, 90.0, roll, peso=0.0, passo=1.0)]
    estado = {}

    def residuos(x):
        pose, livre = c.pose_de({}, params, x)
        Z, bvh = c.medir(pose)
        C = Vector((livre["cx"] * CM, livre["cy"] * CM, livre["cz"] * CM))
        n, e1, e2 = base_do_cubo(livre["yaw"], livre["pitch"], livre["roll"])
        r = []
        F = C + n * CUBO_H                                                           # centro da face do polegar
        r.append(V.distancia_assinada(bvh, F) * 1000 * 1.5)
        G = C - n * CUBO_H                                                           # face dos dedos: cinco pontos, valem os dois mais próximos
        d = sorted(abs(V.distancia_assinada(bvh, G + e * CUBO_H * k)) * 1000
                   for e, k in ((e1, 0.0), (e1, 0.5), (e1, -0.5), (e2, 0.5), (e2, -0.5)))
        r += [d[0] * 1.0, d[1] * 1.0]
        for p in pontos_do_cubo(C, n, e1, e2):
            r.append(max(0.0, -(V.distancia_assinada(bvh, p)) - 0.0005) * 1000 * 2.0)  # a mão não entra no cubo
        r.append(max(0.0, 0.102 - C.y) * 1000 * 0.8)                                 # à frente da palma: nada de punho fechado
        estado.update(pose=pose, cubo=(C, n, e1, e2), bvh=bvh)
        return np.array(r)

    return params, residuos, estado


def criar_cubo_visual(C, n, e1, e2, nome="cubo_giz"):
    import bmesh
    for o in [o for o in bpy.data.objects if o.name == nome]:
        bpy.data.objects.remove(o, do_unlink=True)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2 * CUBO_H)
    me = bpy.data.meshes.new(nome)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nome, me)
    bpy.context.scene.collection.objects.link(ob)
    from mathutils import Matrix
    m = Matrix(((n.x, e1.x, e2.x, C.x), (n.y, e1.y, e2.y, C.y), (n.z, e1.z, e2.z, C.z), (0, 0, 0, 1)))
    ob.matrix_world = m
    mat = bpy.data.materials.get("giz_azul") or bpy.data.materials.new("giz_azul")
    mat.use_nodes = True
    pb = next(nn for nn in mat.node_tree.nodes if nn.type == "BSDF_PRINCIPLED")
    pb.inputs["Base Color"].default_value = (0.9, 0.55, 0.1, 1)
    pb.inputs["Roughness"].default_value = 0.9
    me.materials.append(mat)
    return ob


PROBLEMAS = {"ponte": problema_ponte, "punho": problema_punho, "pinca": problema_pinca}


def resolver(nomes=("ponte",), iteracoes=40, partidas=None):
    """Resolve cada problema; `partidas` é uma lista de argumentos extras para tentar (vence o menor custo)."""
    c = Cena()
    for nome in nomes:
        melhor = None
        for extra in (partidas or [{}]):
            params, residuos, estado = PROBLEMAS[nome](c, **extra)
            x, custo = S.resolver(params, residuos, iteracoes=iteracoes, verboso=False)
            print(" ", nome, extra, "custo", round(custo, 2))
            if melhor is None or custo < melhor[0]:
                melhor = (custo, params, residuos, estado, x)
        custo, params, residuos, estado, x = melhor
        residuos(x)
        pose = {k: [round(a, 2) for a in v] for k, v in estado["pose"].items()}
        destino = "pose_ponte_v" if nome == "ponte" else "pose_" + nome
        if nome == "pinca":
            C, n, e1, e2 = estado["cubo"]
            print(nome, "custo", round(custo, 3), "cubo", [round(v / CM, 2) for v in C], [round(v, 2) for v in n])
            gravar(destino, pose, {"cubo_C_cm": [round(v / CM, 3) for v in C], "cubo_n": [round(v, 4) for v in n],
                                   "cubo_e1": [round(v, 4) for v in e1], "cubo_aresta_m": 2 * CUBO_H})
            criar_cubo_visual(C, n, e1, e2)
            continue
        taco = estado["taco"]
        ang = taco.contatos(estado["bvh"])
        print(nome, "custo", round(custo, 3), "penetração do taco (mm)", round(estado["pen"] * 1000, 2),
              "setores com contato", V.cobertura_angular(ang), "taco", [round(v / CM, 2) for v in taco.P], [round(v, 3) for v in taco.u])
        extra = {"taco_P_cm": [round(v / CM, 3) for v in taco.P], "taco_u": [round(v, 4) for v in taco.u], "taco_s_m": taco.s}
        gravar(destino, pose, extra)
        V.criar_taco_visual(taco, "taco_" + nome)
        print("  setores:", {k: round(v * 1000, 2) for k, v in estado["setor"].items()})
    return c


if __name__ == "__main__":
    pass
