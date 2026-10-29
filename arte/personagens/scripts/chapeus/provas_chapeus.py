"""Provas dos chapéus, por script (sem abrir imagem).

  --oclusao: nenhum chapéu cobre sobrancelha nem olho em nenhuma das 12 caras (com e sem o estilo kawaii, que sobe a sobrancelha), vistos de câmeras a 0, 21 e 35 graus de elevação e
             a 0 e 30 graus de lado (rasteriza só o que importa: sobrancelhas, globos, pálpebras e o chapéu, com e sem o chapéu, e compara os pixels visíveis).
             blender -b --factory-startup --python arte/personagens/scripts/chapeus/provas_chapeus.py -- --oclusao [saida.txt]
  --pose:    com o `balao.blend` pronto, os chapéus presos à `ancora_chapeu` nos 13 clipes: o quanto cada chapéu entra na pele (penetração) e o quanto o aro fica longe dela (flutuar), para cada regra
             de escala (`segue` da largura e da altura). Escolhe a regra que mais encosta sem entrar.
             blender -b arte/personagens/balao.blend --python arte/personagens/scripts/chapeus/provas_chapeus.py -- --pose [saida.txt]
"""
import itertools
import math
import os
import sys

import numpy as np

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
BALAO = os.path.abspath(os.path.join(PASTA, "..", "balao"))
for p in (PASTA, BALAO):
    if p not in sys.path:
        sys.path.insert(0, p)
import dados_chapeus as C
import modelos_chapeus as MO
import dados as D
import geometria as G
import provas_olhos as PO
import raster as RS

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SAIDA = next((a for a in ARGV if not a.startswith("--")), None)
LINHAS = []


def dizer(t=""):
    print(t)
    LINHAS.append(t)


class Combinado:
    """Só o que a prova de oclusão desenha: o rosto (sobrancelhas, globos, pálpebras) e o chapéu, num objeto que o rasterizador entende."""

    def __init__(self, base, V_rosto, hat, partes_rosto):
        self.V = np.vstack([V_rosto, hat["V"]])
        n0 = len(V_rosto)
        F, M = [], []
        self.partes = {}
        for nome in partes_rosto:
            a, b = base.partes[nome]
            self.partes[nome] = (a, b)
        for f, mt in zip(base.F, base.M):
            if any(a <= f[0] < b for a, b in self.partes.values()):
                F.append(f)
                M.append(mt)
        for f, mt in zip(hat["F"], hat["M"]):
            F.append(tuple(i + n0 for i in f))
            M.append(50 + mt)
        self.F, self.M = F, M
        self.partes["chapeu"] = (n0, n0 + len(hat["V"]))
        self.UV = None


def chapeu_em_cm(id_, nivel="alta"):
    m = MO.MODELOS[id_](C.LOD[nivel])
    V = np.array(m.V)
    V[:, 2] += C.TOPO
    return {"V": V, "F": m.F, "M": m.M}


def oclusao():
    formas = PO.Formas(G.ALTA)
    base = formas.base
    caras = [n for n in D.FORMAS if n.startswith("cara_")]
    estilos = [{}, {"estilo_kawaii": 1.0}]
    ids = [a[len("--chapeus="):].split(",") for a in ARGV if a.startswith("--chapeus=")]
    ids = ids[0] if ids else list(C.IDS)
    if "--rapido" in ARGV:
        caras = ["cara_neutro", "cara_susto", "cara_comemorando", "cara_rindo"]
    alvo = np.array([0.0, -4.0, 3.0])
    cams = []
    for el, az in itertools.product((0, 21, 35), (0, 30)):
        d = np.array([math.sin(math.radians(az)) * math.cos(math.radians(el)), -math.cos(math.radians(az)) * math.cos(math.radians(el)), math.sin(math.radians(el))])
        cams.append(((el, az), (tuple(alvo + 40.0 * d), tuple(alvo), 22.0)))
    partes = [n for n in base.partes if n.startswith(("sobrancelha_", "globo_", "palpebra_"))]
    vazio = {"V": np.zeros((0, 3)), "F": [], "M": []}
    chapeus = {id_: chapeu_em_cm(id_) for id_ in ids}
    _, nomes = RS.parte_de_cada_vertice(Combinado(base, formas.posicoes({}), vazio, partes))     # a ordem das partes é a do objeto desenhado, não a do rosto inteiro
    sob = [i for i, n in enumerate(nomes) if n.startswith("sobrancelha_")]
    olh = [i for i, n in enumerate(nomes) if n.startswith(("globo_", "palpebra_"))]
    dizer("== oclusão: pixels de sobrancelha e de olho (globo + pálpebras) visíveis com o chapéu / sem o chapéu (menor razão entre as %d caras e as câmeras do grupo) ==" % (len(caras) * len(estilos)))
    GRUPOS = (("jogo (0 e 21 graus)", lambda el: el <= 21), ("de cima (35 graus)", lambda el: el > 21))
    pior = {(id_, g): dict(s=(2.0, ""), o=(2.0, "")) for id_ in ids for g, _ in GRUPOS}
    for rot, pesos in [(c + ("+kawaii" if e else ""), {c: 1.0, **e}) for c in caras for e in estilos]:
        V = formas.posicoes(pesos)
        sem = Combinado(base, V, vazio, partes)
        coms = {id_: Combinado(base, V, h, partes) for id_, h in chapeus.items()}
        for (el, az), cam in cams:
            mid0, pid0 = RS.ids(sem, cam, (150, 112), V=sem.V)
            s0 = int(np.isin(pid0, sob).sum())
            o0 = int(np.isin(pid0, olh).sum())
            for id_, com in coms.items():
                mid1, pid1 = RS.ids(com, cam, (150, 112), V=com.V)
                s1, o1 = int(np.isin(pid1, sob).sum()), int(np.isin(pid1, olh).sum())
                for g, ok in GRUPOS:
                    if not ok(el):
                        continue
                    if s0 and s1 / s0 < pior[(id_, g)]["s"][0]:
                        pior[(id_, g)]["s"] = (s1 / s0, "%s el=%d az=%d" % (rot, el, az))
                    if o0 and o1 / o0 < pior[(id_, g)]["o"][0]:
                        pior[(id_, g)]["o"] = (o1 / o0, "%s el=%d az=%d" % (rot, el, az))
    for g, _ in GRUPOS:
        dizer("-- câmeras: %s" % g)
        for id_ in ids:
            p = pior[(id_, g)]
            dizer("%-14s sobrancelhas %.3f (%s)   olhos %.3f (%s)" % (id_, p["s"][0], p["s"][1], p["o"][0], p["o"][1]))
    if SAIDA:
        open(SAIDA, "w").write("\n".join(LINHAS) + "\n")


def pose():
    import bpy
    from mathutils import Matrix, Vector
    from mathutils.bvhtree import BVHTree
    arm = bpy.data.objects["balao_esqueleto"]
    anc = bpy.data.objects["ancora_chapeu"]
    corpo = bpy.data.objects["balao_baixa"]
    for o in bpy.data.objects:
        if o.name.startswith(("bigo", "estilos")):
            o.hide_viewport = True
    hats = {}
    for id_ in C.IDS:
        h = chapeu_em_cm(id_, "alta")
        V = h["V"].copy()
        V[:, 2] -= C.TOPO                                  # cm, origem no alto da cabeça
        V *= 0.01                                          # m
        sel = np.arange(0, len(V), 3)
        baixos = V[:, 2] <= V[:, 2].min() + 0.0006         # o aro de baixo
        hats[id_] = {"V": V[sel], "aro": V[baixos][::2]}
    R = D.ESCALA_DO_CHAPEU
    escolhida = (R["largura"]["segue"], R["altura"]["segue"], R["largura"]["teto"])
    regras = [(l, a, t) for l in (0.35, 0.5, 0.65, 0.8) for a in (0.0, 0.15, 0.3) for t in (1.14, 1.22, 1.32)]
    if escolhida not in regras:
        regras.append(escolhida)       # (segue da largura, segue da altura, teto da largura)
    pen = {(id_, r): 0.0 for id_ in C.IDS for r in regras}
    gap = {(id_, r): 0.0 for id_ in C.IDS for r in regras}
    sc = bpy.context.scene
    ad = arm.animation_data_create()
    dg = bpy.context.evaluated_depsgraph_get()
    for ac in [a for a in bpy.data.actions if a.name.startswith("balao_")]:
        ad.action = ac
        for f in range(int(ac.frame_range[0]), int(ac.frame_range[1]) + 1, 3):
            sc.frame_set(f)
            bpy.context.view_layer.update()
            dg = bpy.context.evaluated_depsgraph_get()
            ev = corpo.evaluated_get(dg)
            me = ev.to_mesh()
            vs = [ev.matrix_world @ v.co for v in me.vertices]
            tris = [tuple(p.vertices) for p in me.polygons]
            bvh = BVHTree.FromPolygons(vs, tris)
            ev.to_mesh_clear()
            M = np.array(anc.matrix_world)
            S = np.array([np.linalg.norm(M[:3, i]) for i in range(3)])            # escala do nó em x, y (largura) e z (altura) do Blender
            for (l, a, t) in regras:
                larg = min(max(1 + l * ((S[0] + S[1]) / 2 - 1), R["largura"]["piso"]), t)
                alt = min(max(1 + a * (S[2] - 1), R["altura"]["piso"]), R["altura"]["teto"])
                sc_loc = np.array([larg / S[0], larg / S[1], alt / S[2]])
                for id_, h in hats.items():
                    W = (M[:3, :3] @ (h["V"] * sc_loc).T).T + M[:3, 3]
                    A = (M[:3, :3] @ (h["aro"] * sc_loc).T).T + M[:3, 3]
                    for p in W:
                        loc, nor, idx, d = bvh.find_nearest(Vector(p))
                        if loc is not None and (Vector(p) - loc).dot(nor) < 0:
                            pen[(id_, (l, a, t))] = max(pen[(id_, (l, a, t))], d * 100)
                    for p in A[::2]:
                        loc, nor, idx, d = bvh.find_nearest(Vector(p))
                        if loc is not None:
                            sinal = 1.0 if (Vector(p) - loc).dot(nor) >= 0 else -1.0
                            gap[(id_, (l, a, t))] = max(gap[(id_, (l, a, t))], sinal * d * 100)
    dizer("== chapéu preso à ancora_chapeu nos 13 clipes (um quadro a cada 3): penetração máxima na pele e distância máxima do aro, em cm, por regra (segue_largura, segue_altura, teto_da_largura) ==")
    dizer("regra            " + " ".join("%-13s" % i[:13] for i in C.IDS) + "  pior")
    melhor = None
    for r in regras:
        pens = [pen[(i, r)] for i in C.IDS]
        gaps = [gap[(i, r)] for i in C.IDS]
        custo = max(pens) * 3 + max(gaps)
        dizer("larg %.2f alt %.2f teto %.2f  " % r + " ".join("%5.2f/%5.2f   " % (p, g) for p, g in zip(pens, gaps)) + " pen %.2f gap %.2f custo %.2f" % (max(pens), max(gaps), custo))
        if melhor is None or custo < melhor[0]:
            melhor = (custo, r, max(pens), max(gaps))
    dizer("MELHOR: segue_largura %.2f segue_altura %.2f teto_da_largura %.2f (penetração máxima %.2f cm, aro até %.2f cm da pele)" % (melhor[1][0], melhor[1][1], melhor[1][2], melhor[2], melhor[3]))
    pe = max(pen[(i, escolhida)] for i in C.IDS)
    ga = max(gap[(i, escolhida)] for i in C.IDS)
    dizer("ESCOLHIDA (dados.ESCALA_DO_CHAPEU): largura segue %.2f (piso %.2f, teto %.2f), altura segue %.2f (piso %.2f, teto %.2f): penetração máxima %.2f cm, aro até %.2f cm da pele" % (
        R["largura"]["segue"], R["largura"]["piso"], R["largura"]["teto"], R["altura"]["segue"], R["altura"]["piso"], R["altura"]["teto"], pe, ga))
    dizer("(penetração = o pior ponto do chapéu abaixo da pele; distância do aro = o quanto o aro de baixo se afasta da pele no pior quadro das 13 ações, com o balão no máximo do estica/amassa; no repouso o aro encosta, a 0,05 cm)")
    if SAIDA:
        open(SAIDA, "w").write("\n".join(LINHAS) + "\n")


if "--oclusao" in ARGV:
    oclusao()
elif "--pose" in ARGV:
    pose()
