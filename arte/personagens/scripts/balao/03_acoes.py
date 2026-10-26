"""Etapa 3c: as seis ações do balão (30 quadros por segundo), cada uma numa faixa NLA com o mesmo nome.

Só os ossos animam. O rosto (formas `cara_*` e `piscar`) e o olhar são do jogo; o par de cada ação está em `PAR_DE_CARA`.
Os valores são escritos pelo que o espectador vê, não pelos eixos do osso: `T(frente, lado, giro)` inclina o osso (graus) para o
rosto, para o +X do mundo (a direita de quem olha de frente) e gira em torno dele; `escala` é (largura, altura, profundidade);
`mover` é (direita, cima, frente) em centímetros. A conversão para os eixos de cada osso sai da posição de repouso.
"""
import importlib
import math
import os
import sys

import bpy
from mathutils import Vector

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import dados as D

importlib.reload(D)
CM = D.CM
FPS = 30

PAR_DE_CARA, TRECHOS = D.PAR_DE_CARA, D.TRECHOS
CORDINHA = ["cordinha_%d" % i for i in range(1, D.CORDINHA_OSSOS + 1)]
ESPINHAS = ["espinha_1", "espinha_2", "espinha_3"]


def sen(t, periodo, fase=0.0, harm=1):
    return math.sin(2 * math.pi * harm * t / periodo + fase)


def T(frente=0.0, lado=0.0, giro=0.0):
    return ("T", frente, lado, giro)


def esc(largura=1.0, altura=1.0, profundidade=None):
    return (largura, altura, largura if profundidade is None else profundidade)


# ------------------------------------------------------------------------------------------------------------------------
def parado():
    P = 78
    fim, ch = P, {}
    for t in range(0, P + 1, 6):
        b = sen(t, P, -0.6)
        quadro = {
            "raiz": dict(mover=(0, 0.55 * sen(t, P, 0.0), 0), r=T(0, 0, 1.6 * sen(t, P, 1.0))),
            "espinha_1": dict(r=T(1.0 * sen(t, P, 1.6), 2.0 * sen(t, P, 0.4)), escala=esc(1 - 0.012 * b, 1 + 0.03 * b)),
            "espinha_2": dict(r=T(0.9 * sen(t, P, 0.9), 1.6 * sen(t, P, -0.1))),
            "espinha_3": dict(r=T(0.8 * sen(t, P, 0.4), 2.2 * sen(t, P, -0.6), 1.8 * sen(t, P, 0.2))),
            "no": dict(r=T(5 * sen(t, P, 0.5), 6 * sen(t, P, -1.0))),
        }
        for i, o in enumerate(CORDINHA):
            a = (7, 10, 13, 16)[i]
            quadro[o] = dict(r=T(a * sen(t, P, 0.1 - 0.55 * i), 0.8 * a * sen(t, P, -0.8 - 0.55 * i)))
        for o, v in quadro.items():
            ch.setdefault(o, []).append((t, v))
    return fim, ch


def inclinar():
    seg = {
        0: ((0, 0, 0), (0, 0, 0), (0, 0, 0), esc(1, 1), (0, 0, 0)),
    }
    # (quadro, frente das três espinhas, escala do corpo, mover da raiz)
    base = [
        (0, (0, 0, 0), esc(1, 1), (0, 0, 0)),
        (6, (-6, -3.5, -2.5), esc(1.03, 0.97), (0, -0.2, -0.4)),     # antecipação: recua e achata
        (15, (17.5, 11, 6), esc(0.99, 1.02), (0, 0.1, 2.0)),      # passa do ponto
        (19, (14.5, 9.5, 6.2), esc(1, 1), (0, 0, 1.7)),
        (24, (14, 9, 5), esc(1, 1), (0, -0.2, 1.6)),
    ]
    ch = {}
    for t, f, s, m in base:
        # a espinha de cima atrasa o movimento do corpo: segue 2 quadros atrás
        ch.setdefault("raiz", []).append((t, dict(mover=m)))
        ch.setdefault("espinha_1", []).append((t, dict(r=T(f[0]), escala=s)))
        ch.setdefault("espinha_2", []).append((t, dict(r=T(f[1]))))
        ch.setdefault("espinha_3", []).append((t, dict(r=T(f[2]))))
        ch.setdefault("no", []).append((t, dict(r=T(0.5 * f[0]))))
        for i, o in enumerate(CORDINHA):
            ch.setdefault(o, []).append((t, dict(r=T(-0.7 * f[0] * (i + 1) / 4))))
    # o ciclo de espera: respira e balança de leve em volta da pose
    for t in range(30, 85, 6):
        u = t - 24
        b = sen(u, 60, 0.0)
        ch["raiz"].append((t, dict(mover=(0.2 * sen(u, 60, 0.8), -0.2 + 0.18 * b, 1.6 + 0.2 * sen(u, 60, 1.6)))))
        ch["espinha_1"].append((t, dict(r=T(14 + 0.7 * sen(u, 60, 0.5), 1.0 * sen(u, 60, 1.4)), escala=esc(1 - 0.008 * b, 1 + 0.02 * b))))
        ch["espinha_2"].append((t, dict(r=T(9 + 0.5 * sen(u, 60, 0.0), 0.9 * sen(u, 60, 1.0)))))
        ch["espinha_3"].append((t, dict(r=T(5 + 0.5 * sen(u, 60, -0.4), 1.2 * sen(u, 60, 0.4), 1.0 * sen(u, 60, 0.2)))))
        ch["no"].append((t, dict(r=T(5 + 3 * sen(u, 60, 0.4), 4 * sen(u, 60, -0.8)))))
        for i, o in enumerate(CORDINHA):
            a = (-2.5 - 1.5 * i) + (4 + 2 * i) * sen(u, 60, 0.0 - 0.5 * i)
            ch[o].append((t, dict(r=T(a, (3 + 2 * i) * sen(u, 60, -1.0 - 0.5 * i)))))
    for o in ch:
        ch[o].sort(key=lambda x: x[0])
    # fecha o ciclo: o quadro 84 repete o 24 para o jogo poder repetir 24–84
    for o in ch:
        quad24 = next(v for t, v in ch[o] if t == 24)
        ch[o][-1] = (84, quad24)
    return 84, ch


def pulinho():
    # (quadro, subida em cm, escala (l, a), roll, atraso do topo)
    corpo = [
        (0, 0.0, esc(1, 1), 0.0), (4, -0.7, esc(1.07, 0.90), 1.5), (8, 4.2, esc(0.94, 1.12), 5.0), (13, 5.6, esc(0.99, 1.02), 2.0),
        (18, 2.2, esc(0.97, 1.06), -4.0), (21, -0.5, esc(1.08, 0.91), -1.0), (25, 0.7, esc(0.99, 1.02), 1.5), (28, 0.0, esc(1, 1), 0.0),
        (36, 0.0, esc(1, 1), 0.0),
    ]
    ch = {}
    for t, y, s, roll in corpo:
        ch.setdefault("raiz", []).append((t, dict(mover=(0, y, 0))))
        ch.setdefault("espinha_1", []).append((t, dict(escala=s, r=T(0, roll))))
    # a cabeça e o topo seguem o corpo com atraso (follow-through)
    topo = [(0, 0.0, 1.0), (6, -2.5, 1.0), (10, 6.0, 1.0), (15, 1.0, 1.0), (20, -4.0, 1.0), (24, 3.0, 1.0), (28, -1.2, 1.0), (32, 0.4, 1.0), (36, 0, 1.0)]
    for t, f, _ in topo:
        ch.setdefault("espinha_2", []).append((t, dict(r=T(f * 0.6, 0))))
        ch.setdefault("espinha_3", []).append((t, dict(r=T(f, 0.7 * f))))
    # nó e cordinha: arrastam para baixo na subida, chicoteiam na descida, assentam por último
    arrasto = [(0, 0.0), (6, 2.0), (10, 7.0), (15, 2.5), (20, -8.0), (23, -4.5), (27, 4.5), (31, -2.0), (36, 0.0)]
    for t, a in arrasto:
        ch.setdefault("no", []).append((t, dict(r=T(0.5 * a))))
        for i, o in enumerate(CORDINHA):
            k = (i + 1) / 2.0
            ch.setdefault(o, []).append((min(t + i, 36), dict(r=T(a * (0.5 + 0.5 * k), 0.4 * a * k * (1 if i % 2 else -1)))))
    return 36, ch


def susto():
    ch = {}

    def p(osso, t, **v):
        ch.setdefault(osso, []).append((t, v))
    p("raiz", 0, mover=(0, 0, 0)); p("raiz", 3, mover=(0, 1.4, -0.8)); p("raiz", 8, mover=(0, 0.6, -0.4)); p("raiz", 16, mover=(0, 0.3, -0.2))
    p("raiz", 24, mover=(0, 0.1, 0)); p("raiz", 30, mover=(0, 0, 0))
    p("espinha_1", 0, escala=esc(1, 1), r=T(0)); p("espinha_1", 3, escala=esc(0.85, 0.86), r=T(-9, 0)); p("espinha_1", 5, escala=esc(0.89, 0.90), r=T(-7, 0))
    for i, t in enumerate(range(7, 25, 2)):
        a = math.exp(-(t - 5) / 9.0)
        s = (-1) ** i
        p("espinha_1", t, escala=esc(0.90 + 0.012 * s * a + 0.004 * (t - 7) / 2, 0.91 + 0.01 * s * a + 0.004 * (t - 7) / 2), r=T(-5 * a, 3.4 * s * a))
    p("espinha_1", 27, escala=esc(1.02, 1.01), r=T(0.8, 0)); p("espinha_1", 30, escala=esc(1, 1), r=T(0))
    for osso, atraso, fator in (("espinha_2", 1, 0.7), ("espinha_3", 2, 1.0)):
        p(osso, 0, r=T(0, 0)); p(osso, 4 + atraso, r=T(-5 * fator, 0))
        for i, t in enumerate(range(8 + atraso, 25, 2)):
            a = math.exp(-(t - 6) / 9.0)
            p(osso, t, r=T(-3 * fator * a, -3.2 * ((-1) ** i) * a * fator))
        p(osso, 30, r=T(0, 0))
    p("no", 0, r=T(0)); p("no", 3, r=T(14, 5)); p("no", 7, r=T(-8, -4))
    for i, t in enumerate(range(10, 25, 2)):
        a = math.exp(-(t - 6) / 8.0)
        p("no", t, r=T(6 * ((-1) ** i) * a, 5 * ((-1) ** (i + 1)) * a))
    p("no", 30, r=T(0))
    for i, o in enumerate(CORDINHA):
        k = i + 1
        p(o, 0, r=T(0)); p(o, min(3 + i, 7), r=T(4 + 1.2 * k, 2.5 * k)); p(o, 9 + i, r=T(-3 - 1.5 * k, -1.8 * k))
        for j, t in enumerate(range(13 + i, 28, 3)):
            a = math.exp(-(t - 9) / 8.0)
            p(o, t, r=T(3 * k * ((-1) ** j) * a, 2.5 * k * ((-1) ** (j + 1)) * a))
        p(o, 30, r=T(0))
    return 30, ch


def estufar():
    ch = {}

    def p(osso, t, **v):
        ch.setdefault(osso, []).append((t, v))
    corpo = [(0, esc(1, 1), -0.0), (6, esc(1.03, 0.94), -0.6), (15, esc(1.43, 1.50), 1.6), (21, esc(1.31, 1.36), 0.8), (27, esc(1.35, 1.40), 0.0)]
    for t, s, y in corpo:
        p("espinha_1", t, escala=s, r=T(0, 0))
        p("raiz", t, mover=(0, y, 0))
    topo = [(0, 1.0), (7, 0.97), (17, 1.07), (23, 0.98), (27, 1.0)]
    for t, s in topo:
        p("espinha_3", t, escala=esc(1, s), r=T(0, 0))
        p("espinha_2", t, escala=esc(1, 1 + (s - 1) * 0.6), r=T(0, 0))
    for t in range(30, 76, 3):
        u = t - 27
        b = sen(u, 24, 0.0)
        p("espinha_1", t, escala=esc(1.35 + 0.045 * b, 1.40 + 0.05 * b), r=T(0.8 * sen(u, 48, 0.3), 1.6 * sen(u, 48, 0.0)))
        p("raiz", t, mover=(0, 0.35 * b, 0))
        p("espinha_3", t, escala=esc(1, 1 + 0.03 * sen(u, 24, -0.9)), r=T(0.6 * sen(u, 24, -0.5), 1.0 * sen(u, 48, -0.6)))
        p("espinha_2", t, escala=esc(1, 1 + 0.02 * sen(u, 24, -0.5)), r=T(0, 0.6 * sen(u, 48, -0.3)))
    ch["espinha_1"][-1] = (75, ch["espinha_1"][next(i for i, (t, _) in enumerate(ch["espinha_1"]) if t == 27)][1])
    for o in ("espinha_2", "espinha_3", "raiz"):
        quad27 = next(v for t, v in ch[o] if t == 27)
        ch[o][-1] = (75, quad27)
    for t in (0, 6, 15, 24, 33, 45, 60, 75):
        p("no", t, r=T(6 * sen(t, 30, 0.2) * (0 if t == 0 else 1), 5 * sen(t, 30, -0.7) * (0 if t == 0 else 1)))
    for i, o in enumerate(CORDINHA):
        for t in (0, 8, 17, 26, 36, 50, 62, 75):
            p(o, t, r=T(8 * (i + 1) * sen(t, 36, 0.0 - 0.5 * i) * (0 if t == 0 else 1) / 2.5, 6 * (i + 1) * sen(t, 36, -1.2 - 0.5 * i) * (0 if t == 0 else 1) / 2.5))
    return 75, ch


def murchar():
    ch = {}

    def p(osso, t, **v):
        ch.setdefault(osso, []).append((t, v))
    corpo = [(0, esc(1, 1), 0), (8, esc(1.04, 1.05), 0.5), (16, esc(0.96, 0.80), -0.8), (24, esc(0.93, 0.62), -2.0), (30, esc(0.95, 0.64), -2.3),
             (38, esc(0.90, 0.54), -3.2), (48, esc(0.88, 0.50), -3.8)]
    for t, s, y in corpo:
        p("espinha_1", t, escala=s)
        p("raiz", t, mover=(0, y, 0.3 * min(1.0, -y / 3.0) if y < 0 else 0))
    # pende para a direita de quem olha e um pouco para a frente; o topo atrasa e passa um pouco do ponto
    inclina = [(0, (0, 0, 0)), (8, (-1, -0.5, -0.5)), (16, (2, 4, 2)), (30, (5, 11, 8)), (40, (7, 12, 12)), (48, (8, 12, 10))]
    for t, (a, b, c) in inclina:
        p("espinha_1", t, r=T(a * 0.8, b))
        p("espinha_2", t, r=T(a * 0.6, b * 0.9))
        p("espinha_3", t, r=T(a * 0.8, c * 0.9 + (3 if 36 <= t <= 44 else 0)))
    for i, o in enumerate(CORDINHA):
        for t, a in ((0, 0), (10, 6), (20, -10), (32, 16), (44, 20), (48, 18)):
            p(o, t, r=T(a * (0.4 + 0.3 * i) / 2, (a * 0.7) * (0.3 + 0.25 * i) / 2))
    for t, a in ((0, 0), (10, 5), (22, -6), (34, 8), (48, 10)):
        p("no", t, r=T(0.6 * a, a))
    # o ciclo final (48–84): balança de leve, o corpo pendurado
    for t in range(54, 85, 6):
        u = t - 48
        b = sen(u, 36, 0.0)
        p("espinha_1", t, escala=esc(0.88 + 0.006 * b, 0.50 + 0.012 * b), r=T(8 * 0.8 + 0.5 * sen(u, 36, 0.8), 12 + 0.9 * b))
        p("raiz", t, mover=(0, -3.8 + 0.12 * b, 0.3))
        p("espinha_2", t, r=T(8 * 0.6 + 0.4 * b, 12 * 0.9 + 0.8 * sen(u, 36, -0.6)))
        p("espinha_3", t, r=T(8 * 0.8 + 0.6 * sen(u, 36, -0.5), 10 * 0.9 + 1.4 * sen(u, 36, -1.0)))
        p("no", t, r=T(6 * 0.6 + 2.0 * sen(u, 36, -0.4), 10 + 3 * sen(u, 36, 0.2)))
        for i, o in enumerate(CORDINHA):
            p(o, t, r=T((18 * (0.4 + 0.3 * i) / 2) + 2.5 * (i + 1) * sen(u, 36, -0.6 * i), (18 * 0.7 * (0.3 + 0.25 * i) / 2) + 2.0 * (i + 1) * sen(u, 36, -1.1 - 0.5 * i)))
    for o in ch:
        quad48 = next(v for t, v in ch[o] if t == 48)
        ch[o][-1] = (84, quad48)
    return 84, ch


ACOES = {"balao_parado": parado, "balao_inclinar": inclinar, "balao_pulinho": pulinho, "balao_susto": susto,
         "balao_estufar": estufar, "balao_murchar": murchar}


# ------------------------------------------------------------------------------------------------------------------------
def eixos_do_repouso(arm):
    """Para cada osso: os eixos (no referencial do osso) que inclinam a ponta para a frente (-Y) e para +X; o eixo do osso é o giro."""
    eixos = {}
    for b in arm.data.bones:
        M = b.matrix_local.to_3x3()
        y = (M @ Vector((0, 1, 0))).normalized()
        inv = M.inverted()

        def eixo(d):
            ax = y.cross(Vector(d))
            return inv @ ax.normalized() if ax.length > 1e-6 else Vector((0, 0, 0))
        eixos[b.name] = (eixo((0, -1, 0)), eixo((1, 0, 0)))
    return eixos


def valor_de_t(pb, eixos, t):
    _, frente, lado, giro = t
    f, s = eixos[pb.name]
    v = f * math.radians(frente) + s * math.radians(lado)
    return (v.x, v.y + math.radians(giro), v.z)


def curvas(ac):
    for camada in ac.layers:
        for faixa in camada.strips:
            for canais in faixa.channelbags:
                yield from canais.fcurves


def zerar(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def criar_acao(arm, eixos, nome, fim, canais):
    if nome in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[nome])
    ad = arm.animation_data_create()
    for tr in [t for t in ad.nla_tracks if t.name == nome]:
        ad.nla_tracks.remove(tr)
    ac = bpy.data.actions.new(nome)
    ac.use_fake_user = True
    ad.action = ac
    for osso, quadros in canais.items():
        pb = arm.pose.bones[osso]
        quadros = sorted(quadros, key=lambda x: x[0])
        if quadros[0][0] != 0:
            quadros.insert(0, (0, {}))
        if quadros[-1][0] != fim:
            quadros.append((fim, {}))
        usa = {c for _, v in quadros for c in v}
        for t, v in quadros:
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = valor_de_t(pb, eixos, v["r"]) if "r" in v else (0, 0, 0)
            pb.location = tuple(c * CM for c in v["mover"]) if "mover" in v else (0, 0, 0)
            pb.scale = v["escala"] if "escala" in v else (1, 1, 1)
            if "r" in usa:
                pb.keyframe_insert("rotation_euler", frame=t, group=osso)
            if "mover" in usa:
                pb.keyframe_insert("location", frame=t, group=osso)
            if "escala" in usa:
                pb.keyframe_insert("scale", frame=t, group=osso)
    for fc in curvas(ac):
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
        fc.update()
    ad.action = None
    faixa = ad.nla_tracks.new()
    faixa.name = nome
    faixa.strips.new(nome, 0, ac)
    return ac


def principal():
    bpy.context.scene.render.fps = FPS
    arm = bpy.data.objects["balao_esqueleto"]
    ad = arm.animation_data_create()
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    zerar(arm)
    eixos = eixos_do_repouso(arm)
    resumo = {}
    for nome, fn in ACOES.items():
        fim, canais = fn()
        criar_acao(arm, eixos, nome, fim, canais)
        resumo[nome] = fim
    zerar(arm)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, 84
    print("ações:", resumo)


principal()
