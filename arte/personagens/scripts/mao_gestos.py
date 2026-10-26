"""Os gestos novos da mão (L29), escritos pelo que se vê: poses-chave em quadros a 30/s; `mao_anim.construir` faz o resto.

Convenções (as de `mao_poses.py`): graus por osso, (x, y, z) = (fecha, torce, abre). `pulso` gira a mão toda em volta do pulso: x positivo
dobra os dedos para a palma (para baixo), x negativo os levanta; y positivo vira a palma para a esquerda (polegar para cima); z positivo
leva os dedos para o lado do mínimo. O deslocamento do pulso é escrito no referencial da mão por `mover(x, y, z)` (z positivo sobe).

Cada gesto é um dict: `quadros` (as chaves), `duracao`, `atraso`/`molas`/`vida` (ver `mao_anim`) e `meta`: o que o jogo precisa saber
(quadro de pico, quadros que se repetem, contato). Gestos com contato levam `contato` e o `04_poses.py` encosta a mão no plano por medição.
`LAB` são poses soltas só para olhar nos renders (não vão para o .glb).
"""
import math

import mao_poses as P
from mao_anim import construir, mover

junta, dedo, polegar = P.junta, P.dedo, P.polegar
REPOUSO = P.POSES["pose_repouso"]


def com(base, pulso=(0.0, 0.0, 0.0), mov=(0.0, 0.0, 0.0), **extra):
    """A pose `base` (dedos) mais o pulso (graus) e o deslocamento da mão (cm, referencial da mão)."""
    d = dict(base)
    d["pulso"] = tuple(pulso)
    d["loc"] = mover(*mov)
    d.update(extra)
    return d


def punho(ap=0.0):
    """Punho de desenho: dedos enrolados na palma e o polegar por cima do indicador e do médio; `ap` (graus) aperta mais."""
    return junta(P._fechado(ap), polegar(cmc=(12, 28, 40), mcp=34 + ap * 0.4, ip=50 + ap * 0.5, torce2=-10))


def aberta(leque=1.0, estica=0.0):
    """Dedos esticados e espalhados (`leque` 1 = o da `pose_aberta`, 2 = o dobro)."""
    return junta(
        dedo("indicador", -4 - estica, 2, 2, abre=-7 * leque),
        dedo("medio", -4 - estica, 2, 2, abre=-1 * leque),
        dedo("anelar", -4 - estica, 2, 2, abre=5 * leque),
        dedo("minimo", -4 - estica, 2, 2, abre=12 * leque),
        polegar(cmc=(-6, 0, -14 * leque), mcp=-4, ip=-2),
    )


def mole(ap=0.0):
    """Dedos soltos de mão sem força: cada um um pouco mais curvo que o vizinho, o polegar pendurado."""
    return junta(
        dedo("indicador", 10 + ap, 16 + ap, 8 + ap, abre=-3),
        dedo("medio", 14 + ap, 22 + ap, 10 + ap, abre=1),
        dedo("anelar", 20 + ap, 28 + ap, 12 + ap, abre=6),
        dedo("minimo", 26 + ap, 32 + ap, 14 + ap, abre=11),
        polegar(cmc=(4, 0, 6), mcp=4, ip=8),
    )


# Poses soltas para ver nos renders.
LAB = {
    "lab_punho": com(punho(0)),
    "lab_punho_martelo": com(punho(4), (10, 90, 0)),
    "lab_aberta2": com(aberta(2.0)),
    "lab_mole": com(mole(), (70, 0, 0), (0, 0, -3)),
}

# --------------------------------------------------------------------------------------------------------------------
GESTOS = {}
META = {}

# gesto_soco_ar: o punho sobe com força. Antecipação (a mão afunda, recua e aperta), golpe para cima com exagero (passa do ponto),
# assenta, um repique menor e volta; os dedos chegam depois da palma (atraso) e a mola deixa o punho pulsar no fim.
_soco = [
    (0, com(REPOUSO)),
    (6, com(punho(0), (20, -8, 0), (0, -0.8, -1.8))),
    (8, com(punho(8), (30, -12, 2), (0, -1.6, -2.8)), True),
    (13, com(punho(3), (-74, 10, -4), (0, 2.0, 9.0))),
    (19, com(punho(0), (-58, 6, 0), (0, 1.4, 7.0))),
    (25, com(punho(2), (-66, 8, -2), (0, 1.7, 8.0))),
    (31, com(punho(-18), (-30, 2, 0), (0, 0.7, 3.2))),
    (38, com(REPOUSO, (0, 0, 0), (0, 0, 0)), True),
]
GESTOS["gesto_soco_ar"] = dict(quadros=_soco, duracao=38,
                               atraso={"pulso": 0.0, "palma": 0.6, "prox": 1.2, "meio": 2.0, "dist": 2.8, "polegar": 1.6},
                               molas={"prox": (30, 0.5), "meio": (28, 0.45), "dist": (26, 0.42)},
                               vida=[("pulso", 0, 1.2, 14.0, 0.0), ("minimo_1", 0, 2.0, 11.0, 0.3), ("indicador_1", 0, 2.0, 11.0, 0.1)])
META["gesto_soco_ar"] = dict(pico=13, nota="o punho chega ao alto (ápice, hora do som de impacto/whoosh); repique em 25")


# gesto_tapinha: o punho de martelo (a palma vira para a esquerda, o lado do mínimo desce) dá um tapinha duas vezes num plano
# horizontal embaixo dele. O `04_poses.py` encosta o ponto mais baixo da mão no plano nos quadros de contato (`contato`).
_tapa = [
    (0, com(REPOUSO)),
    (4, com(punho(0), (-6, 40, 0), (0, 0, 1.0))),
    (7, com(punho(2), (-38, 88, 0), (0, -1.0, 5.8)), True),
    (11, com(punho(10), (4, 90, 0), (0, 0.4, -1.5))),
    (14, com(punho(0), (-14, 86, 0), (0, 0, 1.6))),
    (17, com(punho(2), (-24, 88, 0), (0, -0.4, 3.0)), True),
    (20, com(punho(10), (4, 90, 0), (0, 0.4, -1.5))),
    (23, com(punho(0), (-10, 86, 0), (0, 0, 0.9))),
    (28, com(punho(-20), (-8, 50, 0), (0, 0, 0.3))),
    (34, com(REPOUSO), True),
]
GESTOS["gesto_tapinha"] = dict(quadros=_tapa, duracao=34,
                               atraso={"pulso": 0.0, "palma": 0.5, "prox": 1.0, "meio": 1.5, "dist": 2.0, "polegar": 1.0},
                               molas={"prox": (34, 0.6), "meio": (32, 0.55), "dist": (30, 0.5)},
                               contato=dict(eixo=2, sentido=-1, quadros=[11, 20]),
                               vida=[("pulso", 0, 1.0, 12.0, 0.0)])
META["gesto_tapinha"] = dict(pico=11, picos=[11, 20], nota="contato do punho no plano (quadro 11 e o segundo tapa em 20)")


# gesto_quase: a mão se abre de surpresa. Encolhe (o susto), explode com os dedos espalhados e tremem até assentar.
_quase = [
    (0, com(REPOUSO)),
    (4, com(punho(-34), (12, 0, 0), (0, -0.8, -0.6))),
    (9, com(aberta(2.1, 6), (-16, 0, 0), (0, -2.0, 1.0)), True),
    (11, com(aberta(1.7, 4), (-11, 0, 2), (0, -1.5, 0.8))),
    (13, com(aberta(2.0, 5), (-14, 0, -2), (0, -1.8, 0.9))),
    (15, com(aberta(1.6, 3), (-10, 0, 1.5), (0, -1.4, 0.7))),
    (18, com(aberta(1.35, 2), (-8, 0, -1), (0, -1.0, 0.5))),
    (24, com(aberta(0.7, 0), (-3, 0, 0), (0, -0.3, 0.2))),
    (31, com(REPOUSO), True),
]
GESTOS["gesto_quase"] = dict(quadros=_quase, duracao=31,
                             atraso={"pulso": 0.0, "palma": 0.5, "prox": 0.8, "meio": 1.4, "dist": 2.0, "polegar": 0.6},
                             molas={"prox": (36, 0.38), "meio": (34, 0.34), "dist": (32, 0.3)},
                             vida=[("pulso", 0, 0.8, 9.0, 0.0), ("indicador_1", 2, 1.2, 7.0, 0.0), ("minimo_1", 2, 1.2, 7.0, 0.5)])
META["gesto_quase"] = dict(pico=9, nota="a mão explode aberta (ápice do susto); treme até 18")


# gesto_palmas: uma mão só, a direita; a palma vira para a esquerda e bate num plano vertical (x constante) três vezes. O jogo espelha a
# outra mão e as junta no mesmo quadro. O `04_poses.py` encosta o ponto mais à esquerda da mão no plano nos quadros de contato.
_PALMA = aberta(0.3, 0)
_palmas = [
    (0, com(REPOUSO)),
    (4, com(_PALMA, (-6, 82, 0), (6.8, 0.6, 2.6))),
    (8, com(_PALMA, (0, 90, 0), (-0.4, 1.0, 2.6))),
    (12, com(_PALMA, (-8, 86, 0), (6.4, 0.6, 2.8))),
    (16, com(_PALMA, (0, 90, 0), (-0.4, 1.0, 2.6))),
    (20, com(_PALMA, (-8, 86, 0), (6.4, 0.6, 2.8))),
    (24, com(_PALMA, (0, 90, 0), (-0.4, 1.0, 2.6))),
    (28, com(_PALMA, (-8, 84, 0), (6.8, 0.6, 3.0))),
    (36, com(REPOUSO), True),
]
GESTOS["gesto_palmas"] = dict(quadros=_palmas, duracao=36,
                              atraso={"pulso": 0.0, "palma": 0.4, "prox": 0.9, "meio": 1.4, "dist": 1.9, "polegar": 0.9},
                              molas={"prox": (36, 0.55), "meio": (34, 0.5), "dist": (32, 0.45)},
                              contato=dict(eixo=0, sentido=-1, quadros=[8, 16, 24], partes=["palma"] + [d + "_" + k for d in ("indicador", "medio", "anelar", "minimo") for k in "123"]),
                              vida=[("pulso", 2, 0.8, 12.0, 0.0)])
META["gesto_palmas"] = dict(pico=8, picos=[8, 16, 24], ciclo=[4, 12], nota="contatos em 8, 16 e 24; 4 a 12 é um aplauso inteiro e pode repetir")


# gesto_mole: a mão perde a força: o pulso despenca, os dedos soltos ficam para trás e balançam, o repique e o balanço lento.
_mole = [
    (0, com(REPOUSO)),
    (4, com(REPOUSO, (4, 0, 0), (0, 0, 0.5))),
    (10, com(mole(), (80, 0, 0), (0, -0.4, -2.8))),
    (13, com(mole(4), (96, 0, 7), (0, -0.6, -3.6))),
    (19, com(mole(), (66, 0, -5), (0, -0.2, -2.4))),
    (26, com(mole(2), (79, 0, 5), (0, -0.4, -3.0))),
    (34, com(mole(), (72, 0, -3), (0, -0.3, -2.7))),
    (44, com(mole(1), (76, 0, 2), (0, -0.3, -2.9)), True),
]
GESTOS["gesto_mole"] = dict(quadros=_mole, duracao=44,
                            atraso={"pulso": 0.0, "palma": 1.2, "prox": 2.4, "meio": 3.8, "dist": 5.0, "polegar": 3.0},
                            molas={"pulso": (24, 0.42), "palma": (20, 0.35), "prox": (17, 0.28), "meio": (16, 0.25), "dist": (15, 0.22)},
                            vida=[("pulso", 2, 3.0, 40.0, 0.0), ("pulso", 0, 2.0, 30.0, 0.2), ("indicador_1", 0, 3.0, 20.0, 0.0),
                                  ("minimo_1", 0, 3.0, 20.0, 0.4)])
META["gesto_mole"] = dict(pico=13, nota="o fundo da queda (o 'plof'); balança devagar até o fim")


def _golpe(t, t0, subida=5.0, descida=3.0, repique=0.14):
    """0 a 1: o dedo sobe desacelerando, cai acelerando (a velocidade máxima é a do toque) e repica um pouco, sem passar de zero."""
    s = t - t0
    if s <= 0:
        return 0.0
    if s < subida:
        u = s / subida
        return 1 - (1 - u) ** 2.2
    if s < subida + descida:
        u = (s - subida) / descida
        return 1 - u ** 2.0
    s2 = s - subida - descida
    if s2 < 3.0:
        return repique * math.sin(math.pi * s2 / 3.0) ** 2
    return 0.0


def _tamborilar(periodo=24):
    """O punho do taco (a `pose_punho`) com os quatro dedos batendo no cabo do mínimo ao indicador; o ciclo fecha em `periodo`."""
    base = P.POSES["pose_punho"]
    saida = []
    ordem = [("minimo", 0.0), ("anelar", 3.0), ("medio", 6.0), ("indicador", 9.0)]
    for q in range(periodo + 1):
        pose = {k: tuple(v) if k != "loc" else v for k, v in base.items()}
        for nome, t0 in ordem:
            for osso, dq, atraso in (("_1", 40.0, 0.0), ("_2", 30.0, 0.8), ("_3", 16.0, 1.6)):
                x, y, z = pose[nome + osso]
                pose[nome + osso] = (x - dq * _golpe(q, t0 + atraso), y, z)
        pose["polegar_2"] = (pose["polegar_2"][0] + 1.0 * math.sin(2 * math.pi * q / periodo) ** 2, *pose["polegar_2"][1:])
        saida.append((q, pose))
    return saida


GESTOS_DENSOS = {"gesto_tamborilar": _tamborilar()}
META["gesto_tamborilar"] = dict(
    picos=[10, 13, 16, 19], ciclo=[0, 24],
    nota="o ciclo repete de 0 a 24 (o 24 é igual ao 0); os toques no cabo são 10 (mínimo), 13 (anelar), 16 (médio) e 19 (indicador)")


def _respirar(periodo=90):
    """Ciclo de respiração em torno da `pose_repouso`: o primeiro quadro é a referência (o jogo soma só a diferença)."""
    base = REPOUSO
    saida = []

    def onda(ph, fase, amp, harm=1.0):
        return amp * (math.sin(2 * math.pi * (ph * harm - fase)) - math.sin(2 * math.pi * (-fase)))

    for q in range(periodo + 1):
        ph = q / periodo
        pose = {k: tuple(v) for k, v in base.items()}
        pose["pulso"] = (onda(ph, 0.10, 0.7), onda(ph, 0.25, 0.4), onda(ph, 0.35, 0.3))
        pose["loc"] = mover(0, onda(ph, 0.05, 0.05), onda(ph, 0.0, 0.12))
        pose["palma"] = (onda(ph, 0.14, 0.8), onda(ph, 0.3, 0.4), 0.0)
        for k, nome in enumerate(("indicador", "medio", "anelar", "minimo")):
            f = 0.04 * k
            x1, y1, z1 = pose[nome + "_1"]
            pose[nome + "_1"] = (x1 + onda(ph, 0.18 + f, 1.7) + onda(ph, 0.1, 0.35, 2), y1, z1 + onda(ph, 0.2 + f, 0.5))
            x2, y2, z2 = pose[nome + "_2"]
            pose[nome + "_2"] = (x2 + onda(ph, 0.23 + f, 2.2) + onda(ph, 0.15, 0.4, 2), y2, z2)
            x3, y3, z3 = pose[nome + "_3"]
            pose[nome + "_3"] = (x3 + onda(ph, 0.28 + f, 1.6), y3, z3)
        c, m, i = pose["polegar_1"], pose["polegar_2"], pose["polegar_3"]
        pose["polegar_1"] = (c[0] + onda(ph, 0.3, 1.6), c[1] + onda(ph, 0.35, 0.8), c[2] + onda(ph, 0.3, 0.8))
        pose["polegar_2"] = (m[0] + onda(ph, 0.34, 1.8), m[1], m[2])
        pose["polegar_3"] = (i[0] + onda(ph, 0.4, 1.5), i[1], i[2])
        saida.append((q, pose))
    return saida


GESTOS_DENSOS["gesto_respirar"] = _respirar()
META["gesto_respirar"] = dict(
    pico=52, ciclo=[0, 90], aditivo=True,
    nota="ciclo de 3 s (a inspiração máxima é o quadro 52); é uma ação aditiva: o quadro 0 é a referência e o jogo soma só a diferença (three: AnimationUtils.makeClipAdditive(clip, 0), "
         "action.blendMode = AdditiveAnimationBlendMode, LoopRepeat) por cima de qualquer pose")

# de onde cada gesto sai e onde assenta (o `mao-meta.json` leva isso; o fade de entrada é do jogo)
for _n in ("gesto_soco_ar", "gesto_tapinha", "gesto_quase", "gesto_palmas"):
    META[_n].update(comeca_em="pose_repouso", termina_em="pose_repouso")
META["gesto_mole"].update(comeca_em="pose_repouso", termina_em="pendurada (não volta ao repouso: segura balançando até o jogo fazer o fade para a próxima pose)")
META["gesto_tamborilar"].update(comeca_em="pose_punho", termina_em="pose_punho (ciclo: o jogo entra com fade a partir da pose_punho)")
