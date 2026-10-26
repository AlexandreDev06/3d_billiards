"""Etapa 1c: esqueleto feito à mão (pulso, palma e 3 ossos por dedo) e pesos limpos nas duas malhas.

Ossos: `pulso` (raiz), `palma`, e `<dedo>_1..3` (indicador, medio, anelar, minimo, polegar). O eixo X local de cada osso
de dedo é a dobradiça: rotação positiva em X fecha o dedo para a palma; rotação em Z abre o dedo (positivo vai para o
mínimo); Y é o comprimento do osso. Pré-requisito: `02_malha.py` rodou.
"""
import importlib
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

importlib.reload(D)
importlib.reload(L)

CM = D.CM
NOMES_DEDOS = ["indicador", "medio", "anelar", "minimo"]
CADEIAS = NOMES_DEDOS + ["polegar"]


def cadeia(nome):
    """(raiz, direção, comprimento, divisão, raio, raio da base) de um dedo, em cm."""
    if nome == "polegar":
        t = D.POLEGAR
        a = math.radians(t["ang"])
        d = Vector((-math.sin(a), math.cos(a), 0.0))
        return Vector(t["raiz"]), d, t["comp"], t["div"], t["raio"], t["raio_base"]
    f = D.DEDOS[nome]
    d = Vector(D.direcao(f["ang"]))
    return Vector(f["raiz"]), d, f["comp"], f["div"], f["raio"], f["raio"]


def juntas(nome):
    """As quatro pontas dos três ossos do dedo (raiz, juntas e ponta), em cm."""
    raiz, d, comp, div, _, _ = cadeia(nome)
    acum = [0.0, div[0], div[0] + div[1], 1.0]
    return [raiz + d * (comp * a) for a in acum]


def definir_ossos():
    """Lista ordenada de (nome, cabeça, cauda, pai, conectado, deforma), em cm."""
    ossos = [
        ("pulso", Vector((0, -2.0, 0)), Vector((0, 0.6, 0)), None, False, True),
        ("palma", Vector((0, 0.6, 0)), Vector((0, 9.0, 0)), "pulso", True, True),
    ]
    for nome in CADEIAS:
        j = juntas(nome)
        for i in range(3):
            pai = "palma" if i == 0 else "%s_%d" % (nome, i)
            ossos.append(("%s_%d" % (nome, i + 1), j[i], j[i + 1], pai, i > 0, True))
    return ossos


def criar_esqueleto():
    L.apagar("mao_esqueleto")
    dados = bpy.data.armatures.new("mao_esqueleto")
    arm = bpy.data.objects.new("mao_esqueleto", dados)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.update()
    for o in list(bpy.context.view_layer.objects):
        if o is not None:
            o.select_set(False)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = dados.edit_bones
    for nome, cab, cau, pai, con, deforma in definir_ossos():
        b = eb.new(nome)
        b.head = cab * CM
        b.tail = cau * CM
        b.align_roll(Vector((0, 0, -1)))  # Z local para a palma (para baixo), X local para o lado do polegar
        b.use_deform = deforma
        if pai:
            b.parent = eb[pai]
            b.use_connect = con
    bpy.ops.object.mode_set(mode="OBJECT")
    dados.display_type = "OCTAHEDRAL"
    arm.show_in_front = True
    return arm


def sstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)


PASSADAS = 6


def calcular_pesos(ob):
    """Pesos por distância ao eixo de cada dedo, com a mistura nas juntas e entre dedos; devolve {osso: array}."""
    me = ob.data
    n_mao = int(me.get("n_mao", len(me.vertices)))
    P = np.array([tuple(v.co) for v in me.vertices]) / CM
    n = len(P)
    W = {nome: np.zeros(n) for nome, *_ in definir_ossos()}
    soma = np.zeros(n)
    partes = {}
    for nome in CADEIAS:
        raiz, d, comp, div, r, r_base = cadeia(nome)
        raiz, d = np.array(raiz), np.array(d)
        rel = P - raiz
        s = rel @ d
        lat = np.linalg.norm(rel - np.outer(s, d), axis=1)
        s1, s2 = comp * div[0], comp * (div[0] + div[1])
        polegar = nome == "polegar"
        h = 1.25 if polegar else 1.0
        w3 = sstep((s - (s2 - h)) / (2 * h))
        w1 = 1 - sstep((s - (s1 - h)) / (2 * h))
        w2 = np.clip(1 - w1 - w3, 0, 1)
        r_loc = np.where(s < s1, r_base, r)
        m = 1 - sstep((lat - r_loc) / (r_loc * (0.9 if polegar else 0.4)))
        a0, a1 = (-1.4, 2.6) if polegar else (-1.0, 1.6)
        t = sstep((s - a0) / (a1 - a0))
        bruto = t * m
        partes[nome] = (bruto, w1, w2, w3)
        soma += bruto
    escala = np.where(soma > 1, 1 / np.maximum(soma, 1e-9), 1.0)
    usado = np.zeros(n)
    for nome, (bruto, w1, w2, w3) in partes.items():
        f = bruto * escala
        usado += f
        W[nome + "_1"] += f * w1
        W[nome + "_2"] += f * w2
        W[nome + "_3"] += f * w3
    resto = np.clip(1 - usado, 0, 1)
    wp = 1 - sstep((P[:, 1] + 0.5) / 3.0)
    W["pulso"] += resto * wp
    W["palma"] += resto * (1 - wp)

    # o punho (vértices depois dos da mão) é rígido no osso do pulso
    for nome in W:
        W[nome][n_mao:] = 0.0
    W["pulso"][n_mao:] = 1.0

    # alisa os pesos da mão pelas arestas (PASSADAS passadas: mais passadas abrandam a prega da teia do polegar), sem tocar o punho
    viz = [[] for _ in range(n)]
    for e in me.edges:
        a, b = e.vertices
        if a < n_mao and b < n_mao:
            viz[a].append(b)
            viz[b].append(a)
    for _ in range(PASSADAS):
        for nome in W:
            w = W[nome]
            novo = w.copy()
            for i in range(n_mao):
                if viz[i]:
                    novo[i] = 0.5 * w[i] + 0.5 * np.mean(w[viz[i]])
            W[nome] = novo

    # no máximo 4 influências por vértice (limite do glTF) e soma 1
    nomes = list(W)
    M = np.stack([W[k] for k in nomes], axis=1)
    corte = np.argsort(-M, axis=1)[:, 4:]
    np.put_along_axis(M, corte, 0.0, axis=1)
    M /= np.maximum(M.sum(axis=1, keepdims=True), 1e-9)
    return {k: M[:, i] for i, k in enumerate(nomes)}


def aplicar_pesos(ob, arm):
    ob.vertex_groups.clear()
    for m in [m for m in ob.modifiers if m.type == "ARMATURE"]:
        ob.modifiers.remove(m)
    W = calcular_pesos(ob)
    for nome, w in W.items():
        g = ob.vertex_groups.new(name=nome)
        for i in np.nonzero(w > 1e-4)[0]:
            g.add([int(i)], float(w[i]), "REPLACE")
    ob.parent = arm
    ob.matrix_parent_inverse.identity()
    mod = ob.modifiers.new("esqueleto", "ARMATURE")
    mod.object = arm


def principal():
    arm = criar_esqueleto()
    for nome in ("mao_alta", "mao_baixa"):
        aplicar_pesos(bpy.data.objects[nome], arm)
    ossos = arm.data.bones
    print("ossos", len(ossos), "deformam", sum(1 for b in ossos if b.use_deform))
    return arm


if __name__ == "__main__":
    principal()
