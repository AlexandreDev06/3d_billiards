"""Etapa 1d: as ações do glTF (poses e gestos) a partir de `mao_poses.py`.

Cada pose vira uma ação de dois quadros iguais (0 e 2) e uma faixa NLA com o mesmo nome, para o exportador levar
todas. Pré-requisito: `03_esqueleto.py` rodou (objeto `mao_esqueleto`).
"""
import importlib
import json
import math
import os
import sys

import bpy
from mathutils import Vector

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import mao_dados as D
import mao_lib as L
import mao_gestos as G
import mao_poses as P

importlib.reload(D)
importlib.reload(L)
importlib.reload(P)
importlib.reload(G)

FPS = 30
CM_ESCALA = 0.01      # o loc está em cm e a malha em metros


zerar = L.zerar
aplicar = L.aplicar


def curvas(ac):
    """As curvas da ação (no Blender 5 elas moram em camadas → faixas → canais por slot)."""
    for camada in ac.layers:
        for faixa in camada.strips:
            for canais in faixa.channelbags:
                yield from canais.fcurves


def gravar_quadro(arm, quadro):
    for pb in arm.pose.bones:
        pb.keyframe_insert("rotation_euler", frame=quadro, group=pb.name)
        if pb.name == "pulso":
            pb.keyframe_insert("location", frame=quadro, group=pb.name)


def criar_acao(arm, nome, quadros):
    """`quadros` é uma lista de (quadro, pose). Cria a ação, grava e a deixa numa faixa NLA."""
    if nome in bpy.data.actions:
        bpy.data.actions.remove(bpy.data.actions[nome])
    ad = arm.animation_data_create()
    for tr in [t for t in ad.nla_tracks if t.name == nome]:
        ad.nla_tracks.remove(tr)
    ac = bpy.data.actions.new(nome)
    ac.use_fake_user = True
    ad.action = ac
    for k, (q, pose) in enumerate(quadros):
        aplicar(arm, pose)
        gravar_quadro(arm, q)
        if k == 0:
            # a primeira chave de uma ação nova sai com o valor do osso antes do `aplicar` (a do quadro anterior): grava de novo
            aplicar(arm, pose)
            gravar_quadro(arm, q)
    for fc in curvas(ac):
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
            kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
        fc.update()
    ad.action = None
    faixa = ad.nla_tracks.new()
    faixa.name = nome
    faixa.strips.new(nome, int(quadros[0][0]), ac)
    return ac


def principal():
    bpy.context.scene.render.fps = FPS
    arm = bpy.data.objects["mao_esqueleto"]
    ad = arm.animation_data_create()
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    for nome, pose in P.POSES.items():
        criar_acao(arm, nome, [(0, pose), (2, pose)])
    for nome, quadros in P.GESTOS.items():
        criar_acao(arm, nome, quadros)
    medidas = {}
    for nome, g in G.GESTOS.items():
        ac = criar_acao(arm, nome, construir_gesto(g))
        if g.get("contato"):
            medidas[nome] = encostar(arm, ac, g["contato"])
    for nome, quadros in G.GESTOS_DENSOS.items():
        criar_acao(arm, nome, quadros)
    json.dump(medidas, open(os.path.join(PASTA, "gestos_medidos.json"), "w"), indent=1, sort_keys=True)
    zerar(arm)
    print("ações:", sorted(a.name for a in bpy.data.actions))


def _extremo(Z, eixo, sentido, idx):
    """Índice do vértice mais extremo (mínimo se sentido < 0) no eixo, entre `idx` (todos se for None)."""
    col = Z[:, eixo] if idx is None else Z[idx, eixo]
    k = int(col.argmin() if sentido < 0 else col.argmax())
    return k if idx is None else int(idx[k])


def encostar(arm, ac, contato):
    """Encosta a mão no plano de contato por medição nos quadros do gesto (`contato`: eixo da mão 0|1|2, sentido −1|+1, quadros).

    O ponto mais extremo da malha (mínimo ou máximo no eixo) do primeiro quadro define o plano; nos outros a mão é movida (pelo `loc`
    do pulso, com os vizinhos acompanhando pela metade) até o extremo cair no plano. Devolve o plano, os pontos de contato e a normal da palma.
    """
    import mao_provas as V
    eixo, sentido, quadros = contato["eixo"], contato["sentido"], contato["quadros"]
    sinal_loc = (-1, 1, -1)[eixo]                      # o loc do osso tem x e z de sinal trocado em relação à mão
    ob = bpy.data.objects["mao_alta"]
    grupos = V.grupos_da_malha(ob)
    partes = contato.get("partes")
    idx = None if not partes else __import__("numpy").concatenate([grupos[g] for g in partes])
    ad = arm.animation_data
    ad.use_nla = False
    ad.action = ac
    fc = next(c for c in curvas(ac) if c.data_path == 'pose.bones["pulso"].location' and c.array_index == eixo)
    plano = None
    saida = {"contatos": []}
    for q in quadros:
        bpy.context.scene.frame_set(q)
        Z = V.vertices_deformados(ob)
        i = _extremo(Z, eixo, sentido, idx)
        extremo = float(Z[i, eixo])
        if plano is None:
            plano = extremo
        d = (plano - extremo) / CM_ESCALA * sinal_loc    # cm no loc para o extremo cair no plano
        for dq, w in ((-1, 0.5), (0, 1.0), (1, 0.5)):
            for kp in fc.keyframe_points:
                if int(round(kp.co[0])) == q + dq:
                    kp.co[1] += d * w
                    kp.handle_left[1] += d * w
                    kp.handle_right[1] += d * w
        fc.update()
        bpy.context.scene.frame_set(q)
        Z = V.vertices_deformados(ob)
        i = _extremo(Z, eixo, sentido, idx)
        n = arm.matrix_world.to_3x3() @ arm.pose.bones["palma"].matrix.to_3x3() @ Vector((0, 0, 1))
        saida["contatos"].append({"quadro": q, "ponto_m": [round(float(c), 5) for c in Z[i]], "normal_da_palma": [round(c, 4) for c in n],
                                  "folga_ao_plano_mm": round(float(Z[i, eixo] - plano) * 1000 * (1 if sentido < 0 else -1), 3)})
    # nenhum quadro do gesto pode passar do plano
    pior = 0.0
    for q in range(int(ac.frame_range[0]), int(ac.frame_range[1]) + 1):
        if min(abs(q - c) for c in quadros) > 2:
            continue
        bpy.context.scene.frame_set(q)
        Z = V.vertices_deformados(ob)
        e = float(Z[_extremo(Z, eixo, sentido, idx), eixo])
        pior = min(pior, (e - plano) * (1 if sentido < 0 else -1))
    saida.update(eixo="xyz"[eixo], sentido=sentido, plano_m=round(plano, 5), maior_afundamento_mm=round(-pior * 1000, 3))
    ad.action = None
    ad.use_nla = True
    return saida


def construir_gesto(g):
    """Quadros densos de um gesto de `mao_gestos` (chaves + atraso + mola + vida)."""
    from mao_anim import construir
    return construir(g["quadros"], g["duracao"], g.get("atraso"), g.get("molas"), g.get("vida"))


if __name__ == "__main__":
    principal()
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--salvar" in argv:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(argv[argv.index("--salvar") + 1]), compress=True)
