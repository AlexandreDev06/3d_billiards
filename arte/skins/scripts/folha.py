"""A folha de revisão: o taco inteiro e um detalhe de perto de cada skin, renderizados no Blender (Cycles) com a luz da mesa.

`blender -b --factory-startup --python folha.py -- <saida_dir> [skin[:raro] ...] [--blend=<skins.blend>] [--detalhe2] [--amostras=N]` grava
`<skin>-inteiro.png`, `<skin>-detalhe.png` (e `-detalhe2.png`) e, com `--blend`, o `.blend` com as skins em pistas. A montagem final (Pillow) é `montar_folha.py`, fora do Blender.
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import especificacoes as E  # noqa: E402
import previa as P  # noqa: E402
from tela import argumentos  # noqa: E402

PISTA_Y = 3.0  # distância entre as pistas no .blend (m), para uma luz não tocar a outra


def montar_skin(chave, pista, raro=False):
    esp = E.SKINS[chave]
    suf = "-raro" if raro else ""
    nome_skin = chave + suf
    mats = {}
    for peca in ("sola", "virola", "haste", "junta", "antebraco", "punho", "anel", "base", "borracha"):
        if peca in esp["pintadas"]:
            p = esp["pintadas"][peca]
            emi = E.caminho_png(chave, peca, suf + "-emissivo")
            met = E.caminho_png(chave, peca, suf + "-metal")
            usa_metal = p.get("metal_mapa") and os.path.exists(met)
            mats[peca] = P.material_pintado(f"{nome_skin}-{peca}", E.caminho_png(chave, peca, suf), emi if os.path.exists(emi) and p.get("emissivo", True) else None,
                                            p["rug"], 0.0 if usa_metal else p["metal"], p["verniz"], p.get("forca_emissivo", 3.0), met if usa_metal else None)
        else:
            l = dict(esp["lisas"][peca])
            if raro:
                l.update(esp.get("lisas_raro", {}).get(peca, {}))
            mats[peca] = P.material_liso(f"{nome_skin}-{peca}", l["cor"], l.get("rug", 0.4), l.get("metal", 0.0), l.get("verniz", 0.0), l.get("faixas"), l.get("emissivo"))
    y = pista * PISTA_Y
    objs = P.criar_taco(nome_skin, mats, origem=(0.0, y, P.ALTURA_DO_TACO))
    P.pano(nome_skin, (0.72, y, 0.0), (3.0, 1.6))
    P.luz((0.0, y), deslocamento_y=-0.40)
    return esp, y, objs


def fotografar_skin(chave, pista, saida_dir, qual=("inteiro", "detalhe"), raro=False):
    esp, y, objs = montar_skin(chave, pista, raro)
    nome = chave + ("-raro" if raro else "")
    saidas = {}
    if "inteiro" in qual:
        P.girar_taco(objs, 0.0)
        cam, (w, h) = P.camera_ortografica(f"{nome}-inteiro", (0.725, y), 1.62, 3240, 160)
        saidas["inteiro"] = P.fotografar(cam, os.path.join(saida_dir, f"{nome}-inteiro.png"), w, h)
    for chave_d, sufixo in (("detalhe", "detalhe"), ("detalhe2", "detalhe2")):
        if sufixo not in qual or chave_d not in esp:
            continue
        d = esp[chave_d]
        inclina = math.radians(35.0)
        P.girar_taco(objs, d.get("rolo", -35.0))
        alt = P.ALTURA_DO_TACO
        dist = d["extensao_m"] / (2 * 0.2586)  # lente de 70 mm, sensor 36 mm: tg(meio campo vertical) ≈ 0.2586
        alvo = (d["q"], y, alt)
        pos = (d["q"], y + dist * math.sin(inclina), alt + dist * math.cos(inclina))
        cam = P.camera_olhando(f"{nome}-{sufixo}", pos, alvo, cima=(-1, 0, 0), lente_mm=70.0)
        saidas[sufixo] = P.fotografar(cam, os.path.join(saida_dir, f"{nome}-{sufixo}.png"), 800, 1160)
    return saidas


if __name__ == "__main__":
    a = argumentos()
    saida_dir = a[0]
    blend = next((x.split("=", 1)[1] for x in a if x.startswith("--blend=")), None)
    pedidas = [x for x in a[1:] if not x.startswith("--")] or list(E.SKINS)
    qual = ("inteiro", "detalhe")
    if any(x.startswith("--detalhe2") for x in a):
        qual = ("inteiro", "detalhe", "detalhe2")
    P.preparar_cena(amostras=int(next((x.split("=", 1)[1] for x in a if x.startswith("--amostras=")), "96")))
    for i, pedida in enumerate(pedidas):
        chave, _, variante = pedida.partition(":")     # "howl" ou "howl:raro"
        print(fotografar_skin(chave, i, saida_dir, qual, raro=variante == "raro"))
    if blend:
        # as quatro skins, cada uma na sua pista, com as imagens por caminho relativo ao .blend
        os.makedirs(os.path.dirname(os.path.abspath(blend)), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend), relative_remap=True, compress=True)
        bpy.ops.file.make_paths_relative()
        bpy.ops.wm.save_mainfile()
