"""Grava `exportados/boteco-meta.json`: o contrato do boteco com o jogo (eixos, folga, nós, luzes, câmeras, triângulos e bytes por nível).
`uv run --with numpy python3 meta.py` (depois de `construir.py` nos três níveis)."""
import json
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import cena  # noqa: E402
import contar  # noqa: E402
import glb_info  # noqa: E402

RAIZ = os.path.join(AQUI, "..")
NIVEIS = ("alto", "medio", "baixo")


def arred(v, n=3):
    if isinstance(v, (list, tuple)):
        return [arred(x, n) for x in v]
    if isinstance(v, float):
        return round(v, n)
    return v


def classes_de_materiais(caminho):
    """Materiais do .glb por classe (sem luz, emissivo, PBR), lidos do próprio arquivo: a lista do contrato não fica velha."""
    j, _ = glb_info.ler(caminho)
    sem_luz, emissivos, pbr = [], [], []
    for m in j["materials"]:
        nome = m["name"]
        if "KHR_materials_unlit" in m.get("extensions", {}):
            sem_luz.append(nome)
        elif any(m.get("emissiveFactor", [0, 0, 0])):
            emissivos.append(nome + (" (alfa)" if m.get("alphaMode") == "BLEND" else ""))
        else:
            pbr.append(nome + (" (alfa)" if m.get("alphaMode") == "BLEND" else ""))
    return sem_luz, sorted(emissivos), sorted(pbr)


def main():
    niveis, c_alto = {}, None
    for i, n in enumerate(NIVEIS):
        r = contar.analisar(os.path.join(RAIZ, "exportados", f"boteco-{n}.glb"))
        c = cena.construir(2 - i)
        if n == "alto":
            c_alto = c
        folga, quem = c.folga_minima()
        niveis[n] = {
            "arquivo": f"exportados/boteco-{n}.glb", "bytes": r["bytes"], "triangulos": r["triangulos"],
            "nos": [{"nome": x["nome"], "triangulos": x["triangulos"], "primitivas": x["primitivas"]} for x in r["nos"]],
            "materiais": len(r["materiais"]), "imagens": len(r["imagens"]), "bytes_das_imagens": r["bytes_imagens"],
            "texturas": [{"nome": im["nome"], "px": im["px"], "bytes": im["bytes"]} for im in r["imagens"]],
            "maior_textura_px": max(max(im["px"]) for im in r["imagens"]),
            "caixa": arred(r["caixa"]), "folga_minima_m": round(folga, 3), "adereco_mais_perto": quem,
            "adereco_na_folga": c.folga_violada() or None,
        }
    alto = contar.analisar(os.path.join(RAIZ, "exportados", "boteco-alto.glb"))
    sem_luz, emissivos, pbr = classes_de_materiais(os.path.join(RAIZ, "exportados", "boteco-alto.glb"))
    meta = {
        "versao": 3,
        "fonte": "arte/boteco/scripts/00_tudo.sh (Blender 5.2 + Cycles: a luz é assada em atlas)",
        "convencao": {
            "unidade": "metro", "eixos": "os do jogo: x ao longo da mesa, y para cima, z na largura; mesma origem e escala nos três níveis",
            "origem": "centro do pano da mesa; a mesa do jogo NÃO está no .glb",
            "piso_y": cena.PISO, "teto_y": cena.TETO, "sala_x": [cena.X0, cena.X1], "sala_z": [cena.Z0, cena.Z1],
            "folga": {"metros": cena.FOLGA, "mesa_por_fora_da_moldura": [cena.SEMI_X, cena.SEMI_Z],
                      "zona_livre_x": [-(cena.SEMI_X + cena.FOLGA), cena.SEMI_X + cena.FOLGA], "zona_livre_z": [-(cena.SEMI_Z + cena.FOLGA), cena.SEMI_Z + cena.FOLGA],
                      "regra": "nada abaixo de 2,1 m do piso entra na zona livre, exceto a luminária (grupo `luminaria`, 1,5 x 0,32 a 0,9 m do pano, como a do jogo)"},
        },
        "nos": {
            "boteco": "tudo que é fixo (casco, balcão, móveis, bandeirinhas...), uma malha com um material por primitiva; as superfícies assadas (luz do Cycles na textura) saem sem luz (KHR_materials_unlit)",
            "luminaria": "a luminária comprida; origem em (0, 0,9, 0); esconda ou troque pela do jogo",
            "ventilador-helice": "só as pás; origem no cubo: gire em Y",
            "letreiro-neon": "o letreiro (alto: tubos + brilho; médio e baixo: placa com a textura acesa); origem no centro da placa",
            "janela-rua": "a rua à noite vista pela janela (emissiva)",
        },
        "materiais_sem_luz": {
            "nota": "KHR_materials_unlit: o three lê como MeshBasicMaterial (a luz já está na textura; continua com o tone mapping do renderer). Não ligam à luz nenhuma do jogo e não recebem a sombra da mesa (a da mesa já está assada no piso).",
            "piso": "ladrilho hidráulico + sujeira + sombra da mesa e da luminária", "forro": "forro e vigas", "paredes": "azulejo, barrado, reboco e rodapé",
            "assado": "todo o resto que é opaco e não brilha (balcão, banquetas, mesinhas, geladeiras, cartazes, engradados...); no baixo também garrafas, vidros, metais, tela da TV, vitrine e lâmpadas",
            "decoracao": "bandeirinhas e relógio (duas faces)", "prateleira-garrafas": "só no baixo: o quadro desenhado do fundo do balcão",
            "atlas": "baixo: dois (casco: piso, forro, paredes; objetos: assado, decoração); médio e alto: três (casco, objetos e sinais); JPEG, UV própria. `sinais` é o atlas dos cartazes, do quadro de giz, da porta da geladeira e dos logos, com densidade de texel alta para o texto ficar nítido; ele sai no material PBR emissivo `cartazes` (cor-base preta, o atlas na emissão), não num material sem luz: os cinco nomes sem luz acima não mudam",
        },
        "materiais_sem_luz_no_arquivo": sem_luz,
        "materiais_pbr": pbr,
        "materiais_emissivos": emissivos,
        "nota_vidros": "casca de vidro em alfa (`BLEND`, uma face; o three não escreve profundidade) com o líquido opaco por dentro; a janela é `vidro-janela` (alfa por textura, com sujeira) na frente de `rua-*` (camadas emissivas em profundidades diferentes: paralaxe de verdade quando a câmera anda)",
        "luzes": [{"nome": m["nome"], "pos": arred(m["pos"]), "extras": m["extras"]} for m in alto["marcadores"] if m["nome"].startswith("luz-")],
        "cameras": [{"nome": m["nome"], "pos": arred(m["pos"]), "yfovGraus": m["yfov_graus"], "alvo": next(mk["extras"]["alvo"] for mk in c_alto.marcadores if mk["nome"] == m["nome"])}
                    for m in alto["cameras"]],
        "niveis": niveis,
        "aderecos_alto": {k: {"min": arred([float(x) for x in v[0]], 2), "max": arred([float(x) for x in v[1]], 2)} for k, v in sorted(c_alto.objetos.items())},
    }
    with open(os.path.join(RAIZ, "exportados", "boteco-meta.json"), "w") as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    for n in NIVEIS:
        v = niveis[n]
        print(f"{n}: {v['triangulos']} triângulos, {v['bytes'] / 1e6:.2f} MB, maior textura {v['maior_textura_px']} px, folga mínima {v['folga_minima_m']} m ({v['adereco_mais_perto']})")


main()
