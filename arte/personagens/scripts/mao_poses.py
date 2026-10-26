"""As poses e o gesto da mão como dados: graus por osso, (x, y, z) = (fecha, torce, abre).

As poses de contato (ponte, punho, pinça) vêm de `poses_resolvidas.json`, que o `05_resolver_poses.py` grava depois de
medir a malha de verdade; as outras são escritas à mão aqui.

x positivo fecha o dedo para a palma, z positivo abre para o lado do mínimo (no polegar, aproxima dos dedos).
`pulso` aceita também `loc` em cm (no referencial do osso: y para a frente, z positivo para baixo, o lado da palma). Ossos que não aparecem ficam em repouso (zero).
"""

import json
import os

DEDOS = ["indicador", "medio", "anelar", "minimo"]
RESOLVIDAS = os.path.join(os.path.dirname(os.path.abspath(globals().get("__file__", ""))), "poses_resolvidas.json")


def resolvida(nome):
    """A pose gravada pelo solver (dict osso → graus), ou {} se ainda não foi resolvida."""
    if not os.path.exists(RESOLVIDAS):
        return {}
    dados = json.load(open(RESOLVIDAS)).get(nome)
    return {osso: tuple(g) for osso, g in dados["pose"].items()} if dados else {}


def dedo(nome, mcp, pip, dip, abre=0.0, torce=0.0):
    return {
        nome + "_1": (mcp, torce, abre),
        nome + "_2": (pip, 0.0, 0.0),
        nome + "_3": (dip, 0.0, 0.0),
    }


def polegar(cmc=(0, 0, 0), mcp=0.0, ip=0.0, torce2=0.0):
    return {"polegar_1": cmc, "polegar_2": (mcp, torce2, 0.0), "polegar_3": (ip, 0.0, 0.0)}


def junta(*partes):
    r = {}
    for p in partes:
        r.update(p)
    return r


POSES = {
    # Mão solta de luva: dedos levemente enrolados, cada um um pouco mais que o vizinho, polegar descansando.
    "pose_repouso": junta(
        dedo("indicador", 14, 24, 12, abre=-5),
        dedo("medio", 18, 28, 14, abre=0),
        dedo("anelar", 24, 32, 16, abre=6),
        dedo("minimo", 30, 36, 18, abre=12),
        polegar(cmc=(6, 0, 4), mcp=6, ip=12),
    ),
    # Mão aberta bem espalmada (tchau/parar): dedos esticados e abertos, polegar para fora.
    "pose_aberta": junta(
        dedo("indicador", -4, 2, 2, abre=-7),
        dedo("medio", -4, 2, 2, abre=-1),
        dedo("anelar", -4, 2, 2, abre=5),
        dedo("minimo", -4, 2, 2, abre=12),
        polegar(cmc=(-6, 0, -14), mcp=-4, ip=-2),
    ),
    # Apontar: indicador esticado, os outros três e o polegar fechados.
    "pose_apontar": junta(
        dedo("indicador", 0, 0, 0, abre=-3),
        dedo("medio", 85, 95, 55, abre=0),
        dedo("anelar", 88, 98, 58, abre=2),
        dedo("minimo", 88, 98, 58, abre=4),
        polegar(cmc=(28, 12, 22), mcp=30, ip=22),
    ),
    "pose_ponte_v": resolvida("pose_ponte_v"),
    "pose_punho": resolvida("pose_punho"),
    "pose_pinca": resolvida("pose_pinca"),
    # L29: as outras cinco pontes (05b_resolver_pontes.py); as que ainda não foram resolvidas ficam de fora
    **{n: resolvida(n) for n in ("pose_ponte_laco", "pose_ponte_elevada", "pose_ponte_tabela", "pose_ponte_colada", "pose_ponte_canto") if resolvida(n)},
}


def _fechado(aperto=0.0):
    """Punho fechado com o polegar para fora; `aperto` (graus) fecha um pouco mais os dedos."""
    return junta(
        dedo("indicador", 88 + aperto, 98 + aperto, 60 + aperto, abre=-2),
        dedo("medio", 90 + aperto, 100 + aperto, 62 + aperto, abre=0),
        dedo("anelar", 92 + aperto, 102 + aperto, 64 + aperto, abre=2),
        dedo("minimo", 94 + aperto, 104 + aperto, 64 + aperto, abre=5),
    )


def _joinha(tempo, pulso, loc, aperto, cmc, mcp, ip, dedos=None):
    """Um quadro do joinha: o punho rola em volta do braço (`pulso` y ≈ 90° põe o polegar para cima)."""
    return (tempo, junta(dedos or _fechado(aperto), polegar(cmc=cmc, mcp=mcp, ip=ip), {"pulso": pulso, "loc": loc}))


# Gestos animados: lista de (quadro a 30 fps, pose). Antecipação (puxa e fecha), exagero (passa do ponto), conclusão
# (volta devagar) e um repique do polegar no fim. Nenhuma curva linear: o Blender interpola por Bézier.
GESTOS = {
    "gesto_joinha": [
        (0, POSES["pose_repouso"]),
        _joinha(7, (-14, -8, 0), (0, -1.6, 1.6), -30, (20, 10, 18), 22, 18, dedos=_fechado(-35)),
        _joinha(13, (-8, 28, 0), (0, -0.6, 1.0), 0, (22, 8, 16), 30, 26),
        _joinha(19, (6, 102, 0), (0, 1.6, -3.0), 4, (-14, 0, -24), -10, -12),
        _joinha(25, (2, 83, 0), (0, 0.8, -1.2), 2, (-9, 0, -17), -4, 0),
        _joinha(30, (3, 93, 0), (0, 1.1, -1.9), 3, (-12, 0, -21), -8, -9),
        _joinha(37, (1, 90, 0), (0, 0.9, -1.4), 2, (-11, 0, -19), -6, -5),
    ],
}
