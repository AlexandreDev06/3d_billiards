"""Gera `arte/skins/skins-meta.json`: o que o Frontend precisa saber de cada PNG (tamanho físico, emissivo, raro, material sugerido).

`python3 meta.py` (sem Blender; só Pillow para ler o tamanho dos PNGs que existem).
"""
import json
import os

from PIL import Image

import especificacoes as E
import medidas as M

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

CONVENCOES = {
    "arquivos": "arte/skins/exportados/<skin>-<peca>.png (cor), -emissivo.png (brilho), -raro.png / -raro-emissivo.png (variante rara)",
    "pixels": "sRGB, 8 bits, RGB sem alfa; maior lado <= 2048 px; proporcional a circunferencia x comprimento da peca (ppm abaixo)",
    "colorSpace": "SRGBColorSpace no mapa de cor e no emissivo; no emissivo, preto = apagado (multiplicar por emissiveIntensity, ~1 a 3)",
    "origem": "a linha de baixo do PNG e v=0 (lado da ponta do taco), o que o TextureLoader do three.js (flipY) espera",
    "espelho": "o UV de torneado.ts corre u para a esquerda vendo de fora: use texture.repeat.x = -1 e offset.x = 1 (RepeatWrapping em S) para a arte sair como no PNG",
    "orientacao": "o alto da figura aponta para a ponta do taco, que na camera do jogo fica no alto da tela; por isso o PNG sai de cabeca para baixo, de proposito",
    "emenda": "o PNG fecha em x (u = 0 e u = 1 se encontram sem emenda): RepeatWrapping em S; em T, ClampToEdge",
    "variacao_por_taco": "o rolo (offset.x) gira a arte em volta do taco sem emenda; o -raro.png e uma variante de paleta, nao precisa de deslocamento",
    "margem_v": "a arte chega ate as bordas de cada peca (as vizinhas sao pecas separadas; junta e anel, de raio ~4% maior, escondem no maximo o ultimo milimetro); a cauda do dragao termina a 9 mm do fim do cabo, antes da borracha",
    "metal": "-metal.png (so onde ha metal, nas skins do P3): mascara de metal sRGB-linear em tons de cinza, branco = ouro/prata batido, preto = nao e metal; use como metalnessMap com metalness 1 (o mapa de cor e a cor do metal); sem envMap o metal escurece, entao se o jogo nao tem ambiente use metalness 0.6 a 0.7 (a previa do Blender usa 0.7)",
    "haste": "a haste fica em 2,95 px/mm (limite de 2048 px no comprimento de 695 mm); antebraco, punho e base ficam entre 3 e 8 px/mm",
}

NOTAS = {
    "coral": "So o antebraco e pintado: escamas de cobra-coral (vermelho, amarelo, preto). A haste e o cabo ficam lisos; veja complementos.",
    "bicho-solto": "Mosaico de doze bichos de adesivo, dois por volta (sem emenda). Haste e antebraco pintados; junta, anel e base lisos em rosa e azul.",
    "corujao": "Coruja de olhos ambar no antebraco, ceu da madrugada na haste (corujinhas de olhos acesos), plumagem barrada no punho. Emissivo nos olhos, estrelas e vagalumes.",
    "dragon-lore": "Dragao europeu nosso em manuscrito celta (nome do CS, desenho proprio): pergaminho bege-oliva com ornamentos celtas apagados; corpo de nos entrelacados marrom e ouro; cabeca e garras vermelho-alaranjadas, chifres claros, olho que acende; chama de vitral (vermelho ao amarelo, contorno claro, espirais) saindo da boca (antebraco) e correndo pela haste ate a ponta. Haste = a chama; antebraco = cabeca, asas e pescoco; base = patas e cauda em nó de ouro; o punho (liso) esconde o meio. Emissivo: olho, boca e chama (suave); metal: ouro. Rara: Esmeralda (verde e ouro).",
    "howl": "Lobo uivando nosso (nome do CS, desenho proprio), grafico e chapado em vermelho, laranja e preto, fundo escuro com detalhes vermelhos: cabeca de perfil com a boca aberta e o focinho voltado para a ponta (antebraco, com lua e pelo em lascas pontudas), o uivo como chevrons que esfriam ate a ponta (haste) e o pelame com tres pares de olhos acesos (punho). Emissivo: olhos e boca. Rara: Lobo da Geada (azul-gelo e branco).",
    "dragao": "Um dragao so, em hélice, do pescoco (haste) ate a cauda (cabo), continuo de uma peca a outra; o punho (liso, escuro) esconde o trecho entre o antebraco e o cabo. Emissivo nos olhos, na boca e na fumaca de giz.",
}


def _hex(c):
    return "#%02x%02x%02x" % tuple(int(round(v * 255)) for v in c[:3])


def _peca(skin, peca, cfg):
    m = M.medidas_da_peca(peca)
    w, h, ppm = M.tamanho_em_pixels(peca)
    base = E.caminho_png(skin, peca)
    info = {
        "peca": peca,
        "arquivo": f"exportados/{skin}-{peca}.png",
        "comprimento_mm": round(m["comprimento_mm"], 1),
        "circunferencia_mm": round(m["circunferencia_mm"], 1),
        "raio_ponta_mm": round(m["raio_ponta_mm"], 2),
        "raio_cabo_mm": round(m["raio_cabo_mm"], 2),
        "px_esperados": [w, h],
        "px_por_mm": round(ppm, 2),
        "rugosidade_sugerida": cfg["rug"],
        "metal_sugerido": cfg["metal"],
        "verniz_sugerido": cfg.get("verniz", 0.0),
        "emissivo": os.path.exists(E.caminho_png(skin, peca, "-emissivo")),
        "raro": os.path.exists(E.caminho_png(skin, peca, "-raro")),
    }
    if cfg.get("forca_emissivo"):
        info["emissive_intensity_sugerida"] = cfg["forca_emissivo"]
    if os.path.exists(E.caminho_png(skin, peca, "-metal")):
        info["metal_mapa"] = True
        info["arquivo_metal"] = f"exportados/{skin}-{peca}-metal.png"
    if info["emissivo"]:
        info["arquivo_emissivo"] = f"exportados/{skin}-{peca}-emissivo.png"
    if info["raro"]:
        info["arquivo_raro"] = f"exportados/{skin}-{peca}-raro.png"
        if os.path.exists(E.caminho_png(skin, peca, "-raro-emissivo")):
            info["arquivo_raro_emissivo"] = f"exportados/{skin}-{peca}-raro-emissivo.png"
        if os.path.exists(E.caminho_png(skin, peca, "-raro-metal")):
            info["arquivo_raro_metal"] = f"exportados/{skin}-{peca}-raro-metal.png"
    if os.path.exists(base):
        with Image.open(base) as im:
            info["px"] = list(im.size)
    return info


def _lisa(cfg):
    d = {"cor": _hex(cfg["cor"]), "rugosidade": cfg.get("rug", 0.4), "metal": cfg.get("metal", 0.0), "verniz": cfg.get("verniz", 0.0)}
    if cfg.get("faixas"):
        d["faixas_q_m"] = [[a, b, _hex(c)] for a, b, c in cfg["faixas"]]
    return d


def main():
    saida = []
    for skin, esp in E.SKINS.items():
        item = {
            "skin": skin,
            "nome": esp["nome"],
            "faixa_sugerida": esp["faixa"],
            "fora_do_catalogo": skin in E.SKINS_FORA,
            "notas": NOTAS[skin],
            "pecas_pintadas": [_peca(skin, p, cfg) for p, cfg in esp["pintadas"].items()],
            "pecas_lisas_sugeridas": {p: _lisa(c) for p, c in esp["lisas"].items()},
        }
        if esp.get("lisas_raro"):
            item["pecas_lisas_sugeridas_raro"] = {p: _lisa(c) for p, c in {**esp["lisas"], **esp["lisas_raro"]}.items() if p in esp["lisas_raro"]}
        if skin in E.SKINS_FORA:
            item["motivo_fora"] = "substituida no catalogo por " + ("Howl" if skin == "corujao" else "Dragon Lore") + " (decisao de 2026-10-26); a arte fica em exportados/"
        saida.append(item)
    doc = {"versao": 2, "gerado_por": "arte/skins/scripts/meta.py", "convencoes": CONVENCOES, "skins": saida}
    caminho = os.path.join(RAIZ, "skins-meta.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(caminho)


if __name__ == "__main__":
    main()
