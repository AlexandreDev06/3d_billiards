"""Etapa 1f (L29): acha, medindo a malha, as cinco pontes novas e o plano de apoio de cada uma.

`pose_ponte_laco`, `pose_ponte_elevada`, `pose_ponte_tabela`, `pose_ponte_colada` e `pose_ponte_canto`. Cada ponte é um
problema de mínimos quadrados (`mao_solver.py`) sobre a malha deformada: o taco (cone de 1,45 m) não atravessa a pele e
encosta onde a ponte o segura; as pontas dos dedos que pousam tocam o plano de apoio sem passar dele. Grava em
`poses_resolvidas.json` a pose e, em `extra`, o taco (`taco_P_cm`, `taco_u`, `taco_s_m`) e o apoio (`apoio_ponto_cm`,
`apoio_normal`, `apoio_tipo`, as folgas das partes da mão ao plano).

Uso (sem janela): `blender -b arte/personagens/mao.blend --python arte/personagens/scripts/05b_resolver_pontes.py -- ponte_laco [semente]`.
`pose_ponte_v` ganha o apoio dela por `completar_ponte_v()` (o P1b só gravou o taco).
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
import mao_poses as MP
import mao_solver as S

R = importlib.import_module("05_resolver_poses")
for _m in (D, L, V, S, R, MP):
    importlib.reload(_m)

CM = D.CM
EIXO = {"x": 0, "y": 1, "z": 2}
DEDOS = ["indicador", "medio", "anelar", "minimo"]
Z_PANO = -2.954 * CM  # o ponto mais baixo da mão em repouso: a borda do punho; no V as pontas dos dedos pousam aí também
S_TACO = 0.25
ARQUIVO = R.ARQUIVO


class Cena2(R.Cena):
    """A `Cena` do P1b mais os índices dos vértices de cada parte e `loc:x|y|z` (deslocamento do pulso, cm, no referencial do osso)."""

    def __init__(self, lod="mao_alta"):
        super().__init__(lod)
        self.grupos = V.grupos_da_malha(self.ob)

    def pose_de(self, base, params, x):
        pose = {k: list(v) for k, v in base.items() if k != "loc"}
        if "loc" in base:
            pose["loc"] = list(base["loc"])
        livre = {}
        for p, v in zip(params, x):
            ns, eixo = p.nome.split(":")
            if ns in ("taco", "cubo", "plano"):
                livre[eixo] = float(v)
            elif ns == "loc":
                pose.setdefault("loc", [0.0, 0.0, 0.0])[EIXO[eixo]] = float(v)
            else:
                pose.setdefault(ns, [0.0, 0.0, 0.0])[EIXO[eixo]] = float(v)
        return pose, livre


def a(nome, lo, hi, ini, w=0.03, ref=None):
    return S.Param(nome, lo, hi, ini, pref=ref, peso=w, passo=0.5)


def fixo(nome, lo, hi, ini, passo=0.1):
    return S.Param(nome, lo, hi, ini, peso=0.0, passo=passo)


def p_dedo_plano(nome, mcp=(-12, 45), pip=(-6, 70), dip=(-6, 55), ini=(3, 2, 2), abre=(-8, 8), abre_ini=0.0, w=0.04):
    """Os quatro ângulos de um dedo que pousa: ficam perto de `ini` (peso `w`) a menos que o contato peça outra coisa."""
    return [a(nome + "_1:x", *mcp, ini[0], w, ini[0]), a(nome + "_1:z", *abre, abre_ini, 0.3, abre_ini),
            a(nome + "_2:x", *pip, ini[1], w, ini[1]), a(nome + "_3:x", *dip, ini[2], w, ini[2])]


def p_polegar(ini=(0, 0, 0, 0, 0), w=0.02, lim=None):
    lim = lim or {"1x": (-60, 60), "1y": (-75, 75), "1z": (-60, 65), "2x": (-10, 70), "2y": (-25, 25), "3x": (-15, 80)}
    return [a("polegar_1:x", *lim["1x"], ini[0], w), a("polegar_1:y", *lim["1y"], ini[1], w), a("polegar_1:z", *lim["1z"], ini[2], w),
            a("polegar_2:x", *lim["2x"], ini[3], w), a("polegar_2:y", *lim["2y"], 0, 0.05), a("polegar_3:x", *lim["3x"], ini[4], w)]


def taco_de(livre, s=S_TACO):
    psi, phi = math.radians(livre.get("yaw", 0.0)), math.radians(livre.get("pitch", 0.0))
    u = Vector((math.sin(psi) * math.cos(phi), math.cos(psi) * math.cos(phi), math.sin(phi)))
    return V.Taco(Vector((livre["px"] * CM, livre.get("py", 6.0) * CM, livre["pz"] * CM)), u, s)


def r_taco(taco, bvh, t0=-0.11, t1=0.11, n=45, peso=2.0):
    pen, folgas = taco.penetracao(bvh, t0, t1, n)
    return [max(0.0, -f) * 1000 * peso for _, f in folgas], pen


def r_setores(taco, bvh, setores, alvo_mm=0.0, peso=1.0, t0=-0.04, t1=0.04, n=11, vazio=0.02, passo=15):
    s = V.folgas_radiais(taco, bvh, setores, t0, t1, n, vazio=vazio, passo_ang=passo)
    return [max(s[k] * 1000 - alvo_mm, -2.0) * peso for k in setores], s


def r_plano(Z, grupos, tocam, z0, peso=1.0, peso_pen=3.0):
    """As pontas que pousam encostam no plano z = z0 (horizontal) e nada da mão passa dele."""
    r = [(Z[grupos[g], 2].min() - z0) * 1000 * peso for g in tocam]
    r.append(max(0.0, z0 - 0.0005 - Z[:, 2].min()) * 1000 * peso_pen)
    return r


def penetra_taco_longo(taco, bvh):
    """Maior penetração (mm) do taco inteiro que se vê nos renders (de −25 a +25 cm em volta do ponto)."""
    pen, _ = taco.penetracao(bvh, -0.25, 0.25, 101)
    return pen * 1000


# --------------------------------------------------------------------------------------------------------------------
# Ponte em laço: a mão cupulada no pano; o indicador vira para o polegar e se enrola por cima do taco (o anel); o polegar,
# o médio, o anelar e o mínimo pousam no pano.
# --------------------------------------------------------------------------------------------------------------------
SETORES_LACO = {"cima": (320, 400), "esq": (235, 305), "dir": (55, 125)}


def problema_laco(c, py=11.0):
    p = []
    p += [a("indicador_1:x", -60, 70, 8, 0.01), a("indicador_1:y", -90, 30, 0, 0.01), a("indicador_1:z", -95, 10, -60, 0.01),
          a("indicador_2:x", -10, 125, 70, 0.01), a("indicador_3:x", -10, 95, 50, 0.01)]
    p += p_dedo_plano("medio", ini=(6, 8, 4), abre_ini=2.0) + p_dedo_plano("anelar", ini=(8, 8, 4), abre_ini=5.0) \
        + p_dedo_plano("minimo", ini=(10, 8, 4), abre_ini=10.0)
    p += p_polegar(ini=(10, -10, -30, 15, 10))
    p += [a("palma:x", -10, 10, 0, 0.1), a("palma:y", -10, 10, 0, 0.1),
          a("pulso:x", -12, 14, 0, 0.05), a("pulso:y", -10, 10, 0, 0.05), a("pulso:z", -10, 10, 0, 0.05),
          a("loc:x", -1.0, 1.0, 0.0, 0.2), a("loc:y", -1.0, 1.0, 0.0, 0.2), a("loc:z", -4.0, 0.5, -1.5, 0.05)]
    p += [fixo("taco:px", -10.0, -1.0, -6.0), fixo("taco:pz", -4.0, 5.0, -1.0), a("taco:yaw", -1.5, 1.5, 0, 0.02),
          a("taco:pitch", -1.5, 1.5, 0, 0.02)]
    estado = {}

    def residuos(x):
        pose, livre = c.pose_de({}, p, x)
        livre["py"] = py
        Z, bvh = c.medir(pose)
        taco = taco_de(livre)
        r, pen = r_taco(taco, bvh)
        rs, setor = r_setores(taco, bvh, SETORES_LACO, 0.8, 1.0)
        r += rs
        r += r_plano(Z, c.grupos, ["medio_3", "anelar_3", "minimo_3", "polegar_3"], Z_PANO)
        r.append(max(0.0, Z_PANO - (taco.P.z - taco.raio(0.0)) + 0.0005) * 1000 * 2.0)            # o taco não afunda no pano
        r.append(max(0.0, 0.040 - (taco.P.z - Z_PANO)) * 1000 * 0.4)                              # altura do taco sobre o pano ≥ 4 cm
        estado.update(pose=pose, livre=livre, taco=taco, pen=pen, bvh=bvh, setor=setor, Z=Z)
        return np.array(r)

    return p, residuos, estado


def base_v():
    return {k: list(v) if k != "loc" else v for k, v in MP.POSES["pose_ponte_v"].items()}


def p_polegar_v(base, lim_x=(-85, 40)):
    """O polegar em pé da ponte V como ponto de partida."""
    b = base
    return [a("polegar_1:x", *lim_x, b["polegar_1"][0], 0.015, b["polegar_1"][0]), a("polegar_1:y", -45, 45, b["polegar_1"][1], 0.05),
            a("polegar_1:z", -30, 30, b["polegar_1"][2], 0.05), a("polegar_2:x", -25, 40, b["polegar_2"][0], 0.05),
            a("polegar_2:y", -15, 15, b["polegar_2"][1], 0.08), a("polegar_3:x", -20, 45, b["polegar_3"][0], 0.05)]


def p_corpo(pulso_x=(-12, 14, 0.0), loc_z=(-4.0, 1.5, 0.0), loc_y=(-1.5, 1.5)):
    return [a("palma:x", -12, 12, 0, 0.1), a("palma:y", -10, 10, 0, 0.1),
            a("pulso:x", pulso_x[0], pulso_x[1], pulso_x[2], 0.04), a("pulso:y", -10, 10, 0, 0.05), a("pulso:z", -10, 10, 0, 0.05),
            a("loc:x", -1.0, 1.0, 0.0, 0.2), a("loc:y", *loc_y, 0.0, 0.2), a("loc:z", loc_z[0], loc_z[1], loc_z[2], 0.05)]


# --------------------------------------------------------------------------------------------------------------------
# Ponte elevada: palma no alto, só as pontas dos quatro dedos no pano, em arco; o polegar em pé e o V alto; o taco desce
# 25° para a ponta (o cabo no alto, por cima da bola).
# --------------------------------------------------------------------------------------------------------------------
SETORES_V = {"esq": (225, 315), "dir": (90, 200)}


def problema_elevada(c, py=6.0):
    b = base_v()
    p = []
    for d, ini, ab in (("indicador", (34, 48, 24), -1.0), ("medio", (38, 52, 26), 0.0), ("anelar", (42, 54, 28), 3.0), ("minimo", (46, 56, 30), 6.0)):
        p += p_dedo_plano(d, mcp=(-5, 80), pip=(0, 105), dip=(0, 80), ini=ini, abre=(-12, 10), abre_ini=ab, w=0.012)
    p += p_polegar_v(b)
    p += p_corpo(pulso_x=(0, 40, 14.0), loc_z=(-4.0, 2.0, -0.5))
    p += [fixo("taco:px", -9.0, -1.0, -4.07), fixo("taco:pz", 0.0, 14.0, 7.0), a("taco:yaw", -1.5, 1.5, 0, 0.02),
          a("taco:pitch", -29.0, -21.0, -25.0, 0.02), fixo("plano:z", -14.0, -2.0, -8.0, 0.1)]
    estado = {}

    def residuos(x):
        pose, livre = c.pose_de({}, p, x)
        livre["py"] = py
        Z, bvh = c.medir(pose)
        taco = taco_de(livre)
        z0 = livre["z"] * CM
        r, pen = r_taco(taco, bvh)
        rs, setor = r_setores(taco, bvh, SETORES_V, 0.8, 1.0, t0=-0.05, t1=0.05)
        r += rs
        r += r_plano(Z, c.grupos, [d + "_3" for d in DEDOS], z0)
        r.append(max(0.0, 0.040 - (Z[c.grupos["palma"], 2].min() - z0)) * 1000 * 0.3)               # a palma bem acima do plano
        r.append(max(0.0, 0.035 - (Z[c.grupos["cuff"], 2].min() - z0)) * 1000 * 0.2)
        ponta = Z[c.grupos["polegar_3"]].mean(axis=0)
        r.append(max(0.0, taco.P.z + 0.010 - ponta[2]) * 1000 * 1.0)                                  # o polegar passa do taco: é a parede do V
        estado.update(pose=pose, livre=livre, taco=taco, pen=pen, bvh=bvh, setor=setor, Z=Z, z0=z0)
        return np.array(r)

    return p, residuos, estado


# --------------------------------------------------------------------------------------------------------------------
# Ponte na tabela: a palma sobre a moldura, as pontas dos dedos na madeira (curvadas e juntas); o taco corre entre o polegar,
# deitado e baixo, e o indicador, uns 3 cm acima do plano da palma.
# --------------------------------------------------------------------------------------------------------------------
def problema_tabela(c, py=6.0):
    b = base_v()
    p = []
    for d, ini, ab in (("indicador", (14, 20, 10), -2.0), ("medio", (16, 22, 10), 0.0), ("anelar", (18, 24, 12), 2.0), ("minimo", (20, 26, 12), 4.0)):
        p += p_dedo_plano(d, mcp=(-5, 60), pip=(0, 80), dip=(0, 60), ini=ini, abre=(-8, 8), abre_ini=ab, w=0.03)
    p += p_polegar_v(b)
    p[-6] = a("polegar_1:x", -85, 40, -22.0, 0.02, -22.0)
    p += p_corpo(pulso_x=(-8, 10, 0.0), loc_z=(-2.0, 1.0, 0.0))
    p += [fixo("taco:px", -9.0, -1.0, -4.5), fixo("taco:pz", 0.0, 5.0, 2.8), a("taco:yaw", -1.5, 1.5, 0, 0.02), a("taco:pitch", -1.5, 1.5, 0, 0.02)]
    estado = {}

    def residuos(x):
        pose, livre = c.pose_de({}, p, x)
        livre["py"] = py
        Z, bvh = c.medir(pose)
        taco = taco_de(livre)
        r, pen = r_taco(taco, bvh)
        rs, setor = r_setores(taco, bvh, SETORES_V, 0.8, 1.0, t0=-0.05, t1=0.05)
        r += rs
        r += r_plano(Z, c.grupos, [d + "_3" for d in DEDOS] + ["cuff"], Z_PANO)
        r.append(max(0.0, 0.026 - taco.P.z) * 1000 * 0.4)                                            # taco ≥ 2,6 cm sobre a palma
        r.append(max(0.0, taco.P.z - 0.034) * 1000 * 0.4)                                            # e não mais que 3,4
        ponta = Z[c.grupos["polegar_3"]].mean(axis=0)
        r.append(max(0.0, taco.P.z + 0.004 - ponta[2]) * 1000 * 1.0)
        estado.update(pose=pose, livre=livre, taco=taco, pen=pen, bvh=bvh, setor=setor, Z=Z, z0=Z_PANO)
        return np.array(r)

    return p, residuos, estado


# --------------------------------------------------------------------------------------------------------------------
# Ponte colada: a mão chapada na moldura, o taco deitado na madeira entre o indicador e o médio (afastados). A mão sobe o
# bastante para a palma e o punho passarem por cima do taco; as pontas dos dedos ficam no plano da moldura.
# --------------------------------------------------------------------------------------------------------------------
SETORES_COLADA = {"esq": (235, 305), "dir": (55, 125), "cima": (340, 380)}
PITCH_COLADO = -0.36   # o taco deitado: o cone afina 9 mm em 1,45 m, então o eixo desce 0,36° para a ponta


def problema_colada(c, py=12.0):
    p = []
    p += [a("indicador_1:x", -10, 40, 4, 0.03, 4), a("indicador_1:z", -30, 6, -14, 0.01), a("indicador_2:x", -6, 50, 4, 0.03), a("indicador_3:x", -6, 40, 3, 0.03)]
    p += [a("medio_1:x", -10, 40, 4, 0.03, 4), a("medio_1:z", -6, 30, 8, 0.01), a("medio_2:x", -6, 50, 4, 0.03), a("medio_3:x", -6, 40, 3, 0.03)]
    p += p_dedo_plano("anelar", ini=(6, 6, 3), abre_ini=8.0, mcp=(-10, 40)) + p_dedo_plano("minimo", ini=(8, 6, 3), abre_ini=12.0, mcp=(-10, 40))
    p += [a("polegar_1:x", -40, 50, 6, 0.02), a("polegar_1:y", -60, 60, 0, 0.03), a("polegar_1:z", -40, 60, 18, 0.02),
          a("polegar_2:x", -10, 60, 8, 0.03), a("polegar_2:y", -20, 20, 0, 0.05), a("polegar_3:x", -15, 60, 6, 0.03)]
    p += p_corpo(pulso_x=(-12, 12, 0.0), loc_z=(-3.0, 0.5, -1.2), loc_y=(-1.5, 1.5))
    p += [fixo("taco:px", -6.0, 0.0, -2.8), fixo("plano:z", -6.0, -2.0, -3.0, 0.1)]
    estado = {}

    def residuos(x):
        pose, livre = c.pose_de({}, p, x)
        livre["py"] = py
        livre["yaw"], livre["pitch"] = 0.0, PITCH_COLADO
        z0 = livre["z"] * CM
        taco0 = taco_de({**livre, "pz": 0.0})
        livre["pz"] = (z0 + taco0.raio(0.0)) / CM                                                    # o taco deitado na madeira
        Z, bvh = c.medir(pose)
        taco = taco_de(livre)
        r, pen = r_taco(taco, bvh)
        rs, setor = r_setores(taco, bvh, SETORES_COLADA, 0.8, 1.0, t0=-0.03, t1=0.03)
        r += rs
        r += r_plano(Z, c.grupos, [d + "_3" for d in DEDOS] + ["polegar_3"], z0)
        estado.update(pose=pose, livre=livre, taco=taco, pen=pen, bvh=bvh, setor=setor, Z=Z, z0=z0)
        return np.array(r)

    return p, residuos, estado


# --------------------------------------------------------------------------------------------------------------------
# Ponte no canto: sem a palma; os dedos esticados e as pontas numa quina, a mão inclinada para a frente; o taco corre sob o
# polegar, que o segura por cima, e sobre o lado do indicador.
# --------------------------------------------------------------------------------------------------------------------
SETORES_CANTO = {"polegar": (330, 390), "indicador": (135, 225)}


def problema_canto(c, py=8.0):
    p = []
    for d, ini, ab in (("indicador", (8, 6, 4), -3.0), ("medio", (10, 6, 4), 0.0), ("anelar", (12, 6, 4), 3.0), ("minimo", (14, 6, 4), 6.0)):
        p += p_dedo_plano(d, mcp=(-10, 50), pip=(-4, 40), dip=(-4, 40), ini=ini, abre=(-10, 10), abre_ini=ab, w=0.05)
    p += [a("polegar_1:x", -85, 50, -32, 0.005), a("polegar_1:y", -75, 75, 0, 0.01), a("polegar_1:z", -50, 65, 16, 0.005),
          a("polegar_2:x", -25, 70, -6, 0.01), a("polegar_2:y", -25, 25, 0, 0.05), a("polegar_3:x", -25, 80, 10, 0.01)]
    p += p_corpo(pulso_x=(0, 60, 30.0), loc_z=(-3.0, 3.0, 0.0), loc_y=(-2.0, 2.0))
    p += [fixo("taco:px", -7.0, -1.0, -4.0), fixo("taco:pz", -4.0, 12.0, 2.2), a("taco:yaw", -1.5, 1.5, 0, 0.02),
          a("taco:pitch", -14.0, -2.0, -8.0, 0.02), fixo("plano:z", -16.0, -2.0, -9.0, 0.1)]
    estado = {}

    def residuos(x):
        pose, livre = c.pose_de({}, p, x)
        livre["py"] = py
        Z, bvh = c.medir(pose)
        taco = taco_de(livre)
        z0 = livre["z"] * CM
        r, pen = r_taco(taco, bvh)
        rs, setor = r_setores(taco, bvh, SETORES_CANTO, 0.8, 1.0, t0=-0.04, t1=0.04)
        r += rs
        r += r_plano(Z, c.grupos, [d + "_3" for d in DEDOS], z0)
        r.append(max(0.0, 0.025 - (Z[c.grupos["palma"], 2].min() - z0)) * 1000 * 0.4)               # sem a palma: bem acima do plano
        r.append(max(0.0, 0.030 - (Z[c.grupos["cuff"], 2].min() - z0)) * 1000 * 0.2)
        ponta = Z[c.grupos["polegar_3"]].mean(axis=0)
        r.append(max(0.0, taco.P.x + 0.004 - ponta[0]) * 1000 * 1.0)                                  # o polegar passa por cima do taco, não fica ao lado
        estado.update(pose=pose, livre=livre, taco=taco, pen=pen, bvh=bvh, setor=setor, Z=Z, z0=z0)
        return np.array(r)

    return p, residuos, estado


PROBLEMAS = {"ponte_laco": problema_laco, "ponte_elevada": problema_elevada, "ponte_tabela": problema_tabela,
             "ponte_colada": problema_colada, "ponte_canto": problema_canto}
APOIO = {"ponte_laco": "pano", "ponte_elevada": "pano", "ponte_tabela": "madeira", "ponte_colada": "madeira", "ponte_canto": "madeira"}


def gravar(nome, pose, extra):
    dados = R.carregar()
    dados[nome] = {"pose": pose, "extra": extra}
    json.dump(dados, open(ARQUIVO, "w"), indent=1, sort_keys=True)


def resolver(nome, semente=0, partidas=12, iteracoes=60, ruido=18.0, gravar_se_melhor=True):
    """Resolve a ponte com `partidas` pontos de partida (o primeiro é o desenhado à mão, os outros o perturbam)."""
    c = Cena2()
    rng = np.random.default_rng(semente)
    melhor = None
    for k in range(partidas):
        params, residuos, estado = PROBLEMAS[nome](c)
        if k > 0:
            for q in params:
                if q.peso > 0 or q.nome.startswith(("pulso", "loc", "taco", "plano")):
                    amp = ruido * (q.hi - q.lo) / 120.0 if q.nome.startswith(("loc", "taco", "plano")) else ruido
                    q.inicio = float(np.clip(q.inicio + rng.normal(0, amp), q.lo, q.hi))
        x, custo = S.resolver(params, residuos, iteracoes=iteracoes, verboso=False)
        residuos(x)
        print("  partida", k, "custo", round(custo, 2), "pen mm", round(estado["pen"] * 1000, 2), "setores mm",
              {q: round(v * 1000, 2) for q, v in estado["setor"].items()})
        if melhor is None or custo < melhor[0]:
            melhor = (custo, params, residuos, estado, x)
    custo, params, residuos, estado, x = melhor
    residuos(x)
    return c, custo, estado


def medir_partes(c, Z, z0):
    """Folga (mm) de cada parte da mão ao plano horizontal z = z0 (o ponto mais baixo dela)."""
    return {g: round((Z[i, 2].min() - z0) * 1000, 2) for g, i in c.grupos.items() if g in ("cuff", "palma") or g.endswith("_3") or g.endswith("_2")}


def salvar(nome, c, estado, z0, tipo, extra_apoio=None):
    taco, pose, Z = estado["taco"], estado["pose"], estado["Z"]
    pose = {k: ([round(a_, 2) for a_ in v]) for k, v in pose.items()}
    extra = {"taco_P_cm": [round(v / CM, 3) for v in taco.P], "taco_u": [round(v, 4) for v in taco.u], "taco_s_m": taco.s,
             "apoio_ponto_cm": [0.0, 0.0, round(z0 / CM, 3)], "apoio_normal": [0.0, 0.0, 1.0], "apoio_tipo": tipo,
             "folgas_ao_plano_mm": medir_partes(c, Z, z0), "taco_penetracao_visivel_mm": round(penetra_taco_longo(taco, estado["bvh"]), 2)}
    extra.update(extra_apoio or {})
    gravar("pose_" + nome, pose, extra)
    return extra


def completar_ponte_v():
    """Acrescenta o apoio à `pose_ponte_v` (o P1b só gravou o taco): o plano horizontal na altura média das pontas dos quatro dedos."""
    dados = R.carregar()
    d = dados["pose_ponte_v"]
    arm, ob = bpy.data.objects["mao_esqueleto"], bpy.data.objects["mao_alta"]
    arm.animation_data_create().use_nla = False
    grupos = V.grupos_da_malha(ob)
    L.aplicar(arm, {k: tuple(v) for k, v in d["pose"].items()})
    Z = V.vertices_deformados(ob)
    z0 = float(np.mean([Z[grupos[x + "_3"], 2].min() for x in DEDOS]))
    folgas = {g: round(float((Z[i, 2].min() - z0) * 1000), 2) for g, i in grupos.items()
              if g in ("cuff", "palma") or g.endswith("_3") or g.endswith("_2")}
    d["extra"].update({"apoio_ponto_cm": [0.0, 0.0, round(z0 / CM, 3)], "apoio_normal": [0.0, 0.0, 1.0], "apoio_tipo": "pano",
                       "folgas_ao_plano_mm": dict(sorted(folgas.items()))})
    R.gravar("pose_ponte_v", d["pose"], d["extra"])
    print("pose_ponte_v apoio z", round(z0 / CM, 3), "cm", dict(sorted(folgas.items())))


def principal():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if argv and argv[0] == "completar_ponte_v":
        return completar_ponte_v()
    nome = argv[0]
    semente = int(argv[1]) if len(argv) > 1 else 0
    partidas = int(argv[2]) if len(argv) > 2 else 12
    c, custo, estado = resolver(nome, semente, partidas)
    print(nome, "custo", round(custo, 2), "setores", {k: round(v * 1000, 2) for k, v in estado["setor"].items()})
    z0 = estado.get("z0", Z_PANO)
    print("folgas ao plano", medir_partes(c, estado["Z"], z0))
    print("taco", [round(v / CM, 2) for v in estado["taco"].P], [round(v, 4) for v in estado["taco"].u], "penetração visível mm", round(penetra_taco_longo(estado["taco"], estado["bvh"]), 2))
    salvar(nome, c, estado, z0, APOIO[nome])


if __name__ == "__main__":
    principal()
