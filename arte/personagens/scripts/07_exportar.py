"""Etapa 2b: exporta `exportados/mao.glb` (esqueleto, `mao_alta`, `mao_baixa` e todas as ações) e `mao-taco.json`.

No .glb a cor base é branca (o jogo tinge com a cor da equipe) e o verniz sai como KHR_materials_clearcoat. Cada pose e
o gesto viram uma animação com o nome da faixa NLA. O taco e o cubo de giz da cena são só provas: não vão no arquivo.
Sem janela: DISPLAY=:1 blender -b arte/personagens/mao.blend --python arte/personagens/scripts/07_exportar.py
"""
import importlib
import json
import math
import os
import sys

import bpy

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import mao_dados as D
import mao_lib as L
import mao_provas as V

importlib.reload(D)
importlib.reload(L)
importlib.reload(V)

SAIDA = os.path.abspath(os.path.join(PASTA, "..", "exportados"))
MALHAS = ("mao_alta", "mao_baixa")


def exportar():
    os.makedirs(SAIDA, exist_ok=True)
    arm = bpy.data.objects["mao_esqueleto"]
    objetos = [arm] + [bpy.data.objects[n] for n in MALHAS]
    original = {n: list(bpy.data.objects[n].data.materials) for n in MALHAS}
    branco = L.material_latex(nome="latex_glb", branco=True)
    fundo = L.material_latex(nome="latex_fundo_glb", branco=True, escuro=D.PUNHO_FUNDO["escuro"])  # o fundo do punho: o mesmo látex, mais escuro
    ocultos = [(o, o.hide_get(), o.hide_viewport) for o in objetos]
    for o in objetos:
        o.hide_set(False)
        o.hide_viewport = False
    for n in MALHAS:
        me = bpy.data.objects[n].data
        me.materials[0] = branco  # no lugar, sem `clear()`: ele zera o índice de material das faces (a tampa do punho é o 1)
        me.materials[1] = fundo
    ad = arm.animation_data_create()
    ad.use_nla = True
    ad.action = None
    L.zerar(arm)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objetos:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    propriedades = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    pedido = dict(
        filepath=os.path.join(SAIDA, "mao.glb"), export_format="GLB", use_selection=True, export_yup=True,
        export_apply=False, export_skins=True, export_def_bones=False, export_animations=True,
        export_animation_mode="NLA_TRACKS", export_frame_range=False, export_force_sampling=True, export_optimize_animation_size=False,
        export_materials="EXPORT", export_cameras=False, export_lights=False, export_extras=False,
        export_morph=False, export_texcoords=False, export_attributes=False,
    )
    try:
        bpy.ops.export_scene.gltf(**{k: v for k, v in pedido.items() if k in propriedades})
    finally:
        for n in MALHAS:
            me = bpy.data.objects[n].data
            for k, m in enumerate(original[n]):
                me.materials[k] = m
        for o, h, hv in ocultos:
            o.hide_set(h)
            o.hide_viewport = hv
    return os.path.join(SAIDA, "mao.glb")


def pontas_dos_dedos(dados):
    """{pose com apoio: {dedo: [x, y, z] m}}: o ponto mais baixo (a polpa) do último osso de cada dedo, medido na malha deformada."""
    arm, ob = bpy.data.objects["mao_esqueleto"], bpy.data.objects["mao_alta"]
    arm.animation_data_create().use_nla = False
    grupos = V.grupos_da_malha(ob)
    saida = {}
    for nome, d in dados.items():
        if "apoio_ponto_cm" not in d["extra"]:
            continue
        L.aplicar(arm, {k: tuple(v) for k, v in d["pose"].items()})
        Z = V.vertices_deformados(ob)
        pontas = {}
        for dedo in ("indicador", "medio", "anelar", "minimo", "polegar"):
            idx = grupos[dedo + "_3"]
            pontas[dedo] = [round(float(c), 5) for c in Z[idx[int(Z[idx, 2].argmin())]]]
        saida[nome] = pontas
    arm.animation_data.use_nla = True
    return saida


def quadro_do_taco():
    """O taco (e o cubo) de cada pose de contato, o plano de apoio das pontes e os contatos dos gestos, no referencial da mão, em metros."""
    dados = json.load(open(os.path.join(PASTA, "poses_resolvidas.json")))
    pontas = pontas_dos_dedos(dados)
    saida = {}
    for nome, d in sorted(dados.items()):
        e = d["extra"]
        if "taco_P_cm" in e:
            u = e["taco_u"]
            item = {"tipo": "taco", "ponto_m": [v / 100 for v in e["taco_P_cm"]], "direcao_cabo_para_ponta": u,
                    "ponta_a_ponto_m": e["taco_s_m"], "comprimento_m": 1.45, "raio_ponta_m": 0.006, "raio_cabo_m": 0.015}
            if "apoio_ponto_cm" in e:
                item["elevacao_do_taco_graus"] = round(math.degrees(math.asin(max(-1.0, min(1.0, -u[2])))), 1)  # + = cabo mais alto que a ponta
                folgas = e["folgas_ao_plano_mm"]
                item["apoio"] = {"tipo": e["apoio_tipo"], "ponto_m": [v / 100 for v in e["apoio_ponto_cm"]], "normal": e["apoio_normal"],
                                 "toca": sorted(k.replace("_3", "") for k, v in folgas.items() if k.endswith("_3") and abs(v) <= 0.5)
                                 + sorted(k for k, v in folgas.items() if k == "cuff" and abs(v) <= 0.5),
                                 "pontas_m": pontas[nome], "folgas_ao_plano_mm": folgas}
                z0 = e["apoio_ponto_cm"][2]
                item["altura_do_taco_ao_plano_mm"] = {"no_ponto": round((e["taco_P_cm"][2] - z0) * 10, 1),
                                                     "na_ponta": round((e["taco_P_cm"][2] + u[2] * e["taco_s_m"] * 100 - z0) * 10, 1)}  # do eixo
                if "apoio_borda_y_cm" in e:
                    item["apoio"]["quina_y_m"] = e["apoio_borda_y_cm"] / 100
            saida[nome] = item
        else:
            saida[nome] = {"tipo": "cubo_de_giz", "centro_m": [v / 100 for v in e["cubo_C_cm"]], "eixo_n": e["cubo_n"],
                           "eixo_e1": e["cubo_e1"], "aresta_m": e["cubo_aresta_m"]}
    medidas = os.path.join(PASTA, "gestos_medidos.json")
    if os.path.exists(medidas):
        for nome, m in sorted(json.load(open(medidas)).items()):
            normal_do_plano = [0.0, 0.0, 1.0] if m["eixo"] == "z" else [-1.0, 0.0, 0.0]
            saida[nome] = {"tipo": "contato", "quadro": m["contatos"][0]["quadro"], "quadros": [c["quadro"] for c in m["contatos"]],
                           "ponto_m": m["contatos"][0]["ponto_m"], "pontos_m": [c["ponto_m"] for c in m["contatos"]],
                           "plano": {"ponto_m": m["contatos"][0]["ponto_m"], "normal": normal_do_plano, "eixo": m["eixo"], "valor_m": m["plano_m"]},
                           "normal_da_palma": m["contatos"][0]["normal_da_palma"], "maior_afundamento_mm": m["maior_afundamento_mm"]}
    json.dump({"referencial": "da mão: +Y para os dedos, +X para o mínimo, +Z para o dorso; metros", **saida},
              open(os.path.join(SAIDA, "mao-taco.json"), "w"), indent=1)


def triangulos(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def meta():
    """`mao-meta.json`: o contrato da mão com o jogo (ações, ciclos, quadros de pico, aditivo), no estilo do `balao-meta.json`."""
    import mao_gestos as G
    arm = bpy.data.objects["mao_esqueleto"]
    acoes = {}
    for tr in sorted(arm.animation_data.nla_tracks, key=lambda t: t.name):
        ac = tr.strips[0].action
        q0, q1 = ac.frame_range
        item = {"quadros": int(q1 - q0) + 1, "fps": FPS, "segundos": round((q1 - q0) / FPS, 3),
                "tipo": "pose" if tr.name.startswith("pose_") else "gesto"}
        item.update(G.META.get(tr.name, {}))
        acoes[tr.name] = item
    json.dump({
        "arquivo": "mao.glb",
        "unidades": "metros; origem no pulso; +Y para os dedos, +X para o mínimo, +Z para o dorso (mão direita, palma para baixo); a esquerda é o espelho (escala X = -1)",
        "malhas": {n: {"triangulos": triangulos(bpy.data.objects[n])} for n in MALHAS},
        "esqueleto": {"ossos": len(arm.data.bones), "nomes": [b.name for b in arm.data.bones]},
        "acoes": acoes,
        "poses": "uma pose é um clipe de 3 quadros iguais (0, 1, 2): toque com LoopOnce e clampWhenFinished e entre uma e outra `crossFadeFrom`; o quadro 0 já é a pose",
        "gestos": "um gesto é um clipe de 30 quadros/s; `comeca_em` e `termina_em` dizem de onde ele sai e onde assenta (os de impacto saem e voltam à `pose_repouso`; `gesto_mole` termina pendurada, "
                  "balançando; `gesto_tamborilar` é um ciclo sobre a `pose_punho`; `gesto_respirar` é aditivo); o fade de entrada é do jogo (`crossFadeFrom`); `pico` e `picos` são os quadros "
                  "para sincronizar com o som; `ciclo` ([de, até], quadros) é o trecho que se repete; `mao-taco.json` leva o plano e o ponto de contato dos gestos de contato",
        "aditivo": "gesto_respirar é aditivo: `THREE.AnimationUtils.makeClipAdditive(clip, 0)` (o quadro 0 é a referência) e `action.blendMode = THREE.AdditiveAnimationBlendMode`, "
                   "em LoopRepeat e peso 1, por cima de qualquer pose ou gesto; o glTF não tem mistura aditiva própria",
    }, open(os.path.join(SAIDA, "mao-meta.json"), "w"), indent=1, ensure_ascii=False)


FPS = 30


if __name__ == "__main__":
    print("exportado:", exportar())
    quadro_do_taco()
    meta()
