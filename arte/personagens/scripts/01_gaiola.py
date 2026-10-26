"""Etapa 1: a mão como gaiola de quadriláteros, no estilo luva de desenho (P1b).

Cada dedo é um tubo de raio constante (anel de 8 pontos) que sai de um bloco 2×2 da borda dos nós da palma, com um
anel a mais em cada junta (o nó é só uma dobra suave) e a ponta em domo; o polegar sai de um bloco 2×2 da parede da
palma. Tudo quadriláteros, então a subdivisão (Catmull-Clark, nível 1) dá superfície lisa e brilho limpo.
`mao_alta` = gaiola densa subdividida + punho; `mao_baixa` = gaiola rala sem subdivisão + punho.
Rode dentro do Blender; mede as duas malhas e guarda `n_mao` (vértices da mão, antes do punho) em cada uma.
"""
import importlib
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import mao_dados as D
import mao_lib as L

importlib.reload(D)
importlib.reload(L)

CM = D.CM
G = D.GAIOLA
NOMES = ["indicador", "medio", "anelar", "minimo"]

# o anel de 8 pontos de um bloco 2×2 (bloco de 3×3 vértices sem o do meio), no sentido do ângulo crescente
ANEL = [(-1, -1), (0, -1), (1, -1), (1, 0), (1, 1), (0, 1), (-1, 1), (-1, 0)]
TETA = [math.atan2(kb, ka) for ka, kb in ANEL]

# perímetro de cada anel da palma: linha de cima (j 0..11, i=2), lado direito, linha de baixo, lado esquerdo
PERIMETRO = [(j, 2) for j in range(12)] + [(11, 1)] + [(j, 0) for j in range(11, -1, -1)] + [(0, 1)]
LADO_ESQ = (24, 25)          # os dois segmentos da parede esquerda: (24→25) e (25→0)

ALTA = dict(nome="alta", aneis="cheio", domo=(38.0, 72.0), subdivisao=1, engorda=G["engorda"], estacoes=(0.0, 0.33, 0.55, 0.78, 1.0),
            lados_punho=18, por_trecho=1)
BAIXA = dict(nome="baixa", aneis="rala", domo=(55.0,), subdivisao=0, engorda=1.0, estacoes=(0.0, 0.33, 0.55, 0.78, 1.0),
             lados_punho=10, por_trecho=1)


def colunas_dos_nos():
    """x das 12 colunas da borda dos nós: borda, centro e borda de cada dedo."""
    xs = []
    for n in NOMES:
        d = D.DEDOS[n]
        xs += [d["raiz"][0] - d["raio"], d["raiz"][0], d["raiz"][0] + d["raio"]]
    return xs


def y_da_borda(xs):
    """Altura da borda dos nós em cada coluna: segue a base de cada dedo (o médio sobe mais, o mínimo desce)."""
    ancoras_x = [D.DEDOS[n]["raiz"][0] for n in NOMES]
    ancoras_y = [D.DEDOS[n]["raiz"][1] - G["descida_da_borda"] for n in NOMES]
    px = [xs[0] - 0.2] + ancoras_x + [xs[-1] + 0.2]
    py = [ancoras_y[0] - 0.35] + ancoras_y + [ancoras_y[-1] - 0.9]
    return [float(np.interp(x, px, py)) for x in xs]


def superelipse(u, v, n):
    """Leva o contorno do retângulo [-1,1]² para o da superelipse |u|ⁿ+|v|ⁿ=1, na mesma direção."""
    a = max(abs(u), abs(v))
    if a == 0:
        return 0.0, 0.0
    f = a / (abs(u) ** n + abs(v) ** n) ** (1.0 / n)
    return u * f, v * f


def construir_palma(bm, p):
    """Palma: anéis de 26 pontos por estação, a borda dos nós em grade e o furo de 2×2 da parede do polegar."""
    xs = colunas_dos_nos()
    ycap = y_da_borda(xs)
    c = (xs[0] + xs[-1]) / 2
    w_cap = (xs[-1] - xs[0]) / 2
    ests = [e for e in G["estacoes"] if p["estacoes"] is None or any(abs(e[0] - f) < 1e-6 for f in p["estacoes"])]
    nk = len(ests)
    n = G["expoente"]
    eng = p["engorda"]

    def posicao(s, w, t, j, i):
        u, v = superelipse((xs[j] - c) / w_cap, float(i - 1), n)
        x = c + u * w * eng
        z = v * t * eng
        y = G["y_pulso"] + (G["y_nos"] - G["y_pulso"]) * s + (ycap[j] - G["y_nos"]) * s ** 2
        return Vector((x, y, z))

    aneis = []
    for (s, w, t) in ests:
        aneis.append([bm.verts.new(posicao(s, w, t, j, i) * CM) for (j, i) in PERIMETRO])
    cap = {}
    for m, (j, i) in enumerate(PERIMETRO):
        cap[(j, i)] = aneis[-1][m]
    s, w, t = ests[-1]
    for j in (2, 3, 5, 6, 8, 9):                      # o meio das bordas dos blocos, dentro da borda dos nós
        cap[(j, 1)] = bm.verts.new(posicao(s, w, t, j, 1) * CM)

    # a parede do polegar fica nas estações das frações 0,33, 0,55 e 0,78 (índices ia, ib, ic)
    fr = [e[0] for e in ests]
    ia, ib, ic = (min(range(nk), key=lambda k: abs(fr[k] - f)) for f in (0.33, 0.55, 0.78))
    for k in range(nk - 1):
        for m in range(26):
            if ia <= k < ic and (m in LADO_ESQ):
                continue
            a, b = (m + 1) % 26, m
            bm.faces.new((aneis[k][b], aneis[k][a], aneis[k + 1][a], aneis[k + 1][b]))
    for j in (2, 5, 8):                                # as três faixas de vão entre os dedos
        for i in (0, 1):
            bm.faces.new((cap[(j, i)], cap[(j + 1, i)], cap[(j + 1, i + 1)], cap[(j, i + 1)]))
    # o vértice do meio do furo da parede some com as faces
    meio = aneis[ib][25]
    pat = {
        (-1, -1): aneis[ia][24], (0, -1): aneis[ib][24], (1, -1): aneis[ic][24], (1, 0): aneis[ic][25],
        (1, 1): aneis[ic][0], (0, 1): aneis[ib][0], (-1, 1): aneis[ia][0], (-1, 0): aneis[ia][25],
    }
    bm.verts.remove(meio)
    base_dedo = []
    for f in range(4):
        j0 = 3 * f
        base_dedo.append([cap[(j0 + 1 + ka, 1 + kb)] for (ka, kb) in ANEL])
    base_polegar = [pat[k] for k in ANEL]
    return base_dedo, base_polegar, (ia, ib, ic, aneis)


def prune(lista, minimo=0.38):
    """Tira os anéis (t, fator) a menos de `minimo` do anterior; o último (a ponta do tubo) sempre fica."""
    saida = []
    for k, (t, f) in enumerate(lista):
        if saida and t - saida[-1][0] < minimo:
            if k == len(lista) - 1:
                saida.pop()
            else:
                continue
        saida.append((t, f))
    return saida


def aneis_do_dedo(comp, div, r, t_base, p):
    j1, j2 = comp * div[0], comp * (div[0] + div[1])
    ponta = comp - r
    if p["aneis"] == "cheio":
        lista = [(t_base + 0.85, 1.0), (j1 - 0.30, G["cintura"]), (j1 + 0.30, G["cintura"]),
                 (j2 - 0.26, G["cintura"]), (j2 + 0.26, G["cintura"]), (ponta, 1.0)]
    else:
        lista = [(j1, G["cintura"]), (j2, G["cintura"]), (ponta, 1.0)]
    return prune(lista)


def extrudar(bm, base, origem, eixo, lateral, aneis, comp, r, p):
    """Do anel `base` (8 vértices da palma) até a ponta: anéis circulares de raio constante, domo e vértice-ápice."""
    eng = p["engorda"]
    up = Vector((0, 0, 1))

    def anel(t, raio):
        centro = origem + eixo * t
        return [bm.verts.new((centro + (lateral * math.cos(a) + up * math.sin(a)) * raio * eng) * CM) for a in TETA]

    todos = [base]
    for t, f in aneis:
        todos.append(anel(t, r * f))
    t_g = comp - r
    for phi in p["domo"]:
        ph = math.radians(phi)
        todos.append(anel(t_g + r * math.sin(ph) * (1 + G["ponta"] / r), r * math.cos(ph)))
    apice = bm.verts.new((origem + eixo * (comp + G["ponta"])) * CM)
    for a, b in zip(todos[:-1], todos[1:]):
        for m in range(8):
            n = (m + 1) % 8
            bm.faces.new((a[m], a[n], b[n], b[m]))
    u = todos[-1]
    b0, b1, b2, b3, b4, b5, b6, b7 = u
    for q in ((b0, b1, apice, b7), (b1, b2, b3, apice), (apice, b3, b4, b5), (b7, apice, b5, b6)):
        bm.faces.new(q)


def raio_do_polegar(t, j1, r, rb):
    """O polegar é grosso na base e afina um pouco depois da primeira junta."""
    k = min(max((t - (j1 - 0.4)) / 1.6, 0.0), 1.0)
    return rb + (r - rb) * k


def gerar_gaiola(p):
    bm = bmesh.new()
    base_dedo, base_polegar, _ = construir_palma(bm, p)
    for f, nome in enumerate(NOMES):
        d = D.DEDOS[nome]
        psi = math.radians(d["ang"])
        eixo = Vector((math.sin(psi), math.cos(psi), 0.0))
        lateral = Vector((math.cos(psi), -math.sin(psi), 0.0))
        origem = Vector(d["raiz"])
        t_base = ((sum((v.co for v in base_dedo[f]), Vector()) / 8) / CM - origem).dot(eixo)
        aneis = aneis_do_dedo(d["comp"], d["div"], d["raio"], t_base, p)
        extrudar(bm, base_dedo[f], origem, eixo, lateral, aneis, d["comp"], d["raio"], p)

    t = D.POLEGAR
    psi = math.radians(t["ang"])
    eixo = Vector((-math.sin(psi), math.cos(psi), 0.0))
    lateral = Vector((math.cos(psi), math.sin(psi), 0.0))
    origem = Vector(t["raiz"])
    j1, j2 = t["comp"] * t["div"][0], t["comp"] * (t["div"][0] + t["div"][1])
    t_base = ((sum((v.co for v in base_polegar), Vector()) / 8) / CM - origem).dot(eixo)
    if p["aneis"] == "cheio":
        ts = [t_base + 0.55, j1 - 0.28, j1 + 0.30, (j1 + j2) / 2 + 0.1, j2 - 0.28, j2 + 0.30]
    else:
        ts = [j1, j2]
    ponta = t["comp"] - t["raio"]
    ts = [(x, G["cintura"] if abs(x - j1) < 0.35 or abs(x - j2) < 0.35 else 1.0) for x in ts] + [(ponta, 1.0)]
    ts = prune(ts)
    aneis = [(x, raio_do_polegar(x, j1, t["raio"], t["raio_base"]) / t["raio"] * f) for x, f in ts]
    extrudar(bm, base_polegar, origem, eixo, lateral, aneis, t["comp"], t["raio"], p)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bm.calc_volume(signed=True) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    return bm


def subdividir(bm, niveis):
    """Catmull-Clark pelo modificador (limite da superfície), devolve o bmesh da malha avaliada."""
    if niveis == 0:
        return bm
    me = bpy.data.meshes.new("tmp_gaiola")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("tmp_gaiola", me)
    bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new("sub", "SUBSURF")
    m.levels = m.render_levels = niveis
    m.subdivision_type = "CATMULL_CLARK"
    bpy.context.view_layer.update()
    ev = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    novo = bmesh.new()
    novo.from_mesh(ev)
    bpy.data.meshes.remove(ev)
    return novo


def construir(p):
    L.apagar("mao_" + p["nome"])
    mao = subdividir(gerar_gaiola(p), p["subdivisao"])
    n_mao = len(mao.verts)
    punho = L.malha_do_punho(p["lados_punho"], p["por_trecho"])
    bm = L.unir_bmeshes(mao, punho)
    me = L.malha_de_bmesh("mao_" + p["nome"], bm)
    me["n_mao"] = n_mao  # os vértices da mão vêm antes dos do punho (o esqueleto usa isto)
    ob = bpy.data.objects.new("mao_" + p["nome"], me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(L.material_latex(branco=False))
    me.materials.append(L.material_latex(nome="latex_fundo", branco=False, escuro=D.PUNHO_FUNDO["escuro"]))
    return ob


def principal():
    for p in ("tmp_gaiola", "mao_forma"):
        L.apagar(p)
    alta, baixa = construir(ALTA), construir(BAIXA)
    for ob in (alta, baixa):
        print(ob.name, "triângulos", sum(len(q.vertices) - 2 for q in ob.data.polygons), "vértices", len(ob.data.vertices),
              "mão:", ob.data["n_mao"])
    return alta, baixa


if __name__ == "__main__":
    principal()
