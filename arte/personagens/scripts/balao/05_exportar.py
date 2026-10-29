"""Etapa 3e: exporta `exportados/balao.glb` (esqueleto, `balao_alta`, `balao_baixa`, os pontos das mãos, a âncora do chapéu, os bigodes, a vitrine dos estilos de olho, as 20 formas e as 13 ações)
e `balao-meta.json` (contrato v3: o v2 mais `ancora_chapeu`, `bigodes`, `estilos_de_olho` e `cores_de_olho`).

No .glb o látex tem cor base branca (o jogo tinge), a cor de vértice COLOR_0 (o sombreado do pescoço e do nó) e verniz em KHR_materials_clearcoat. As formas do rosto
saem como morph targets esparsos (os nomes em `extras.targetNames`). O osso `olhar` não vai (só serve de alvo da prévia no Blender).
Das ações saem os canais dos olhos (`olho_*`) e da cordinha (`cordinha_*`): quem escreve neles é o jogo.

A escrita é atômica: o .glb e o meta são feitos numa pasta temporária ao lado de `exportados/` (mesmo disco) e só então movidos com `os.replace`,
porque os testes de `packages/personagens` leem o arquivo de verdade enquanto o lote roda. Se `VALIDADOR` (um `.mjs` do gltf-validator) estiver no ambiente e achar
erro, nada é movido.

Sem janela, depois de `00_tudo.py -- --salvar arte/personagens/balao.blend`:
  blender -b arte/personagens/balao.blend --python arte/personagens/scripts/balao/05_exportar.py
"""
import importlib
import json
import math
import os
import shutil
import struct
import subprocess
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
PAI = os.path.dirname(PASTA)
for p in (PASTA, PAI):
    if p not in sys.path:
        sys.path.insert(0, p)
import bigodes as B
import dados as D
import geometria as G
import materiais as M
import provas_olhos as PO
import textura as T

importlib.reload(D)
importlib.reload(G)
importlib.reload(B)
importlib.reload(M)
importlib.reload(PO)

SAIDA = os.path.abspath(os.environ.get("SAIDA_BALAO") or os.path.join(PASTA, "..", "..", "exportados"))     # `SAIDA_BALAO`: ensaio fora de `exportados/` (o jogo lê de lá)
TEMP = os.path.join(os.path.dirname(SAIDA), ".exportando")
MALHAS = ("balao_alta", "balao_baixa")
BIGODES = ["%s_%s" % (i, n) for i in D.IDS_DE_BIGODE for n in ("alta", "baixa")]
VITRINE = "estilos_de_olho"
ESCONDIDOS = BIGODES + [VITRINE]          # nós que o arquivo leva com escala 0 (o three 0.186 ainda não lê KHR_node_visibility): o jogo mostra o que o jogador equipou
FPS = 30
CM = D.CM
OSSOS_SEM_CANAL = ("olho_esq", "olho_dir", "cordinha_1", "cordinha_2", "cordinha_3", "cordinha_4")


def glb_coord(p):
    """Blender (x, y, z) em metros → glTF (x, z, -y)."""
    return [round(float(p[0]), 5), round(float(p[2]), 5), round(float(-p[1]), 5)]


def zerar(arm):
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def exportar(destino):
    arm = bpy.data.objects["balao_esqueleto"]
    maos = [bpy.data.objects[n] for n in D.PONTOS_DAS_MAOS]
    extras = [bpy.data.objects[n] for n in [D.ANCORA_CHAPEU["nome"]] + ESCONDIDOS]
    objetos = [arm] + [bpy.data.objects[n] for n in MALHAS] + maos + extras
    original = {n: list(bpy.data.objects[n].data.materials) for n in MALHAS}
    latex_branco = M.latex(True)
    ocultos = [(o, o.hide_get(), o.hide_viewport) for o in objetos]
    for o in objetos:
        o.hide_set(False)
        o.hide_viewport = False
    for n in MALHAS:
        bpy.data.objects[n].data.materials[0] = latex_branco
    for n in MALHAS + tuple(BIGODES):
        for kb in bpy.data.objects[n].data.shape_keys.key_blocks[1:]:
            kb.value = 0.0
    ad = arm.animation_data_create()
    ad.use_nla = True
    ad.action = None
    zerar(arm)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objetos:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    propriedades = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    pedido = dict(
        filepath=destino, export_format="GLB", use_selection=True, export_yup=True,
        export_apply=False, export_skins=True, export_def_bones=True, export_animations=True,
        export_animation_mode="NLA_TRACKS", export_frame_range=False, export_force_sampling=True, export_optimize_animation_size=True,
        export_materials="EXPORT", export_cameras=False, export_lights=False, export_extras=False,
        export_morph=True, export_morph_normal=True, export_morph_tangent=False, export_try_sparse_sk=True,
        export_texcoords=True, export_attributes=False, export_vertex_color="MATERIAL", export_all_vertex_colors=False, export_active_vertex_color_when_no_material=False,
        export_image_format="AUTO", export_nla_strips=True,
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


def reescrever_json(caminho, alterar):
    """Abre o bloco JSON do .glb, deixa `alterar(j)` mexer nele e regrava (o bloco binário segue igual)."""
    b = open(caminho, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    alterar(j)
    texto = json.dumps(j, separators=(",", ":")).encode()
    texto += b" " * (-len(texto) % 4)
    resto = b[20 + n:]
    comp = 12 + 8 + len(texto) + len(resto)
    open(caminho, "wb").write(b[:8] + struct.pack("<I", comp) + struct.pack("<I", len(texto)) + b[16:20] + texto + resto)


def sem_normais_nos_bigodes(j):
    """Os bigodes são fitas finas e quase rígidas: a normal que o morph carregaria muda pouco e custaria ~0,5 MB. O morph leva só a posição; a normal fica a do bigode em repouso."""
    for m in j["meshes"]:
        if m["name"] in BIGODES:
            for p in m["primitives"]:
                for alvo in p.get("targets", []):
                    alvo.pop("NORMAL", None)


def enxugar(caminho):
    """Tira do .glb os acessores que nada usa (sobras dos canais tirados e das normais dos bigodes) e refaz o bloco binário só com o que sobrou."""
    b = open(caminho, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n
    tam = struct.unpack("<I", b[off:off + 4])[0]
    binario = b[off + 8:off + 8 + tam]
    usados = set()
    for m in j["meshes"]:
        for p in m["primitives"]:
            usados.update(p["attributes"].values())
            if "indices" in p:
                usados.add(p["indices"])
            for alvo in p.get("targets", []):
                usados.update(alvo.values())
    for a in j.get("animations", []):
        for sa in a["samplers"]:
            usados.update((sa["input"], sa["output"]))
    for sk in j.get("skins", []):
        if "inverseBindMatrices" in sk:
            usados.add(sk["inverseBindMatrices"])
    novo_acessor = {v: k for k, v in enumerate(sorted(usados))}
    acessores = [j["accessors"][i] for i in sorted(usados)]
    vistas = set()
    for a in acessores:
        if "bufferView" in a:
            vistas.add(a["bufferView"])
        if "sparse" in a:
            vistas.update((a["sparse"]["indices"]["bufferView"], a["sparse"]["values"]["bufferView"]))
    for im in j.get("images", []):
        if "bufferView" in im:
            vistas.add(im["bufferView"])
    ordem = sorted(vistas)
    nova_vista = {v: k for k, v in enumerate(ordem)}
    pedacos, vistas_novas, pos = [], [], 0
    for i in ordem:
        bv = dict(j["bufferViews"][i])
        dados = binario[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
        pad = -len(dados) % 4
        bv["byteOffset"] = pos
        bv["buffer"] = 0
        vistas_novas.append(bv)
        pedacos.append(dados + b"\0" * pad)
        pos += len(dados) + pad
    for a in acessores:
        if "bufferView" in a:
            a["bufferView"] = nova_vista[a["bufferView"]]
        if "sparse" in a:
            a["sparse"]["indices"]["bufferView"] = nova_vista[a["sparse"]["indices"]["bufferView"]]
            a["sparse"]["values"]["bufferView"] = nova_vista[a["sparse"]["values"]["bufferView"]]
    for im in j.get("images", []):
        if "bufferView" in im:
            im["bufferView"] = nova_vista[im["bufferView"]]
    for m in j["meshes"]:
        for p in m["primitives"]:
            p["attributes"] = {k: novo_acessor[v] for k, v in p["attributes"].items()}
            if "indices" in p:
                p["indices"] = novo_acessor[p["indices"]]
            p["targets"] = [{k: novo_acessor[v] for k, v in alvo.items()} for alvo in p.get("targets", [])] if "targets" in p else None
            if p["targets"] is None:
                del p["targets"]
    for a in j.get("animations", []):
        for sa in a["samplers"]:
            sa["input"], sa["output"] = novo_acessor[sa["input"]], novo_acessor[sa["output"]]
    for sk in j.get("skins", []):
        if "inverseBindMatrices" in sk:
            sk["inverseBindMatrices"] = novo_acessor[sk["inverseBindMatrices"]]
    j["accessors"] = acessores
    j["bufferViews"] = vistas_novas
    novo_bin = b"".join(pedacos)
    j["buffers"] = [{"byteLength": len(novo_bin)}]
    texto = json.dumps(j, separators=(",", ":")).encode()
    texto += b" " * (-len(texto) % 4)
    comp = 12 + 8 + len(texto) + 8 + len(novo_bin)
    open(caminho, "wb").write(b[:8] + struct.pack("<I", comp) + struct.pack("<I", len(texto)) + b[16:20] + texto
                              + struct.pack("<I", len(novo_bin)) + b[off + 4:off + 8] + novo_bin)


def tirar_canais(j):
    """Os olhos e a cordinha são do jogo: as ações não podem escrever neles. Tira esses canais (e os samplers que sobrarem sem uso)."""
    fora = {i for i, nd in enumerate(j["nodes"]) if nd.get("name") in OSSOS_SEM_CANAL}
    for a in j["animations"]:
        a["channels"] = [c for c in a["channels"] if c["target"]["node"] not in fora]
        usados = sorted({c["sampler"] for c in a["channels"]})
        novo = {v: k for k, v in enumerate(usados)}
        a["samplers"] = [a["samplers"][i] for i in usados]
        for c in a["channels"]:
            c["sampler"] = novo[c["sampler"]]


def esconder_nos(j):
    """Os bigodes e a vitrine saem com escala 0 e `extras` dizendo porquê: nenhum carregador mostra o que o jogador não equipou. Mostrar = `scale.set(1, 1, 1)`."""
    marcados = 0
    for nd in j["nodes"]:
        if nd.get("name") in ESCONDIDOS:
            nd["scale"] = [0.0, 0.0, 0.0]
            nd["extras"] = {"oculto_por_padrao": True, "escala_ao_mostrar": [1.0, 1.0, 1.0]}
            marcados += 1
    assert marcados == len(ESCONDIDOS), marcados


def canais_por_acao(caminho):
    b = open(caminho, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    nome = {i: nd.get("name") for i, nd in enumerate(j["nodes"])}
    return {a["name"]: sorted({nome[c["target"]["node"]] for c in a["channels"]}) for a in j["animations"]}


def cordinha():
    pares = G.pontos_dos_ossos_da_cordinha()
    comprimentos = [float(np.linalg.norm(np.array(t) - np.array(c))) * CM for c, t in pares]
    return {
        "simulada": True,
        "ossos": ["cordinha_%d" % (i + 1) for i in range(len(pares))],
        "pai_da_primeira": "no",
        "comprimento_de_cada_junta_m": [round(c, 5) for c in comprimentos],
        "comprimento_total_m": round(sum(comprimentos), 5),
        "largura_m": round(D.CORDINHA_LARGURA * CM, 5),
        "direcao_de_repouso": "para baixo (-Y do glTF), com uma leve onda; cada osso aponta para a cabeça do próximo",
        "massa_sugerida_g_por_junta": 0.12,
        "amortecimento_sugerido": 0.9,
        "como": "as ações NÃO têm chave nos ossos `cordinha_*`: o jogo simula a corrente (pêndulo encadeado preso ao osso `no`, que acompanha a `raiz`) "
                "e escreve a rotação de cada junta depois do mixer; as 4 juntas têm o comprimento acima, e o limite de dobra sugerido é 55 graus por junta",
        "limite_de_dobra_graus": 55,
    }


def abertura_das_caras():
    return {c: D.abertura_da_cara(c) for c in D.FORMAS if c.startswith("cara_")}


def piscadinha():
    """Quanto da cara (peso) ainda combina com uma piscada de um olho só, medido na malha de alta por `provas_olhos.py`."""
    formas = PO.Formas(G.ALTA)
    return {c: PO.peso_da_cara_na_piscadinha(formas, c) for c in D.FORMAS if c.startswith("cara_")}


def estatisticas_da_cor():
    me = bpy.data.objects["balao_alta"].data
    cor = me.color_attributes["cor"]
    dados = np.zeros(len(me.vertices) * 4, dtype=np.float32)
    cor.data.foreach_get("color", dados)
    c = dados.reshape(-1, 4)[:, 0]
    return {"minimo": round(float(c.min()), 3), "maximo": round(float(c.max()), 3), "media": round(float(c.mean()), 3)}


def hex_srgb(rgb):
    """Cor linear (como o `textura.py` guarda) em #RRGGBB sRGB."""
    def c(v):
        v = min(max(float(v), 0.0), 1.0)
        return v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055
    return "#%02X%02X%02X" % tuple(int(round(c(v) * 255)) for v in rgb)


def estatisticas_da_ancora():
    """A escala e o desvio do nó `ancora_chapeu` (no mundo) em todos os quadros das ações: o que o chapéu herdaria se fosse só filho do nó."""
    arm = bpy.data.objects["balao_esqueleto"]
    anc = bpy.data.objects[D.ANCORA_CHAPEU["nome"]]
    sc = bpy.context.scene
    ad = arm.animation_data_create()
    atual = ad.action
    mn = np.full(3, 9.0)
    mx = np.full(3, -9.0)
    incl = 0.0
    zmn, zmx = 9.0, -9.0
    for ac in [a for a in bpy.data.actions if a.name.startswith("balao_")]:
        ad.action = ac
        for f in range(int(ac.frame_range[0]), int(ac.frame_range[1]) + 1):
            sc.frame_set(f)
            bpy.context.view_layer.update()
            M_ = anc.matrix_world
            esc = np.array([Vector(M_.col[i][:3]).length for i in range(3)])
            mn, mx = np.minimum(mn, esc), np.maximum(mx, esc)
            u = M_.to_3x3().col[2]
            incl = max(incl, math.degrees(math.acos(max(-1.0, min(1.0, u.z / u.length)))))
            zmn, zmx = min(zmn, M_.translation.z), max(zmx, M_.translation.z)
    ad.action = atual
    sc.frame_set(1)
    return {"escala_no_mundo": {"largura_x": [round(mn[0], 2), round(mx[0], 2)], "largura_z": [round(mn[1], 2), round(mx[1], 2)], "altura_y": [round(mn[2], 2), round(mx[2], 2)]},
            "inclinacao_maxima_graus": round(incl, 1), "altura_do_topo_m": [round(zmn, 4), round(zmx, 4)]}


def ancora_meta():
    e = bpy.data.objects[D.ANCORA_CHAPEU["nome"]]
    topo = Vector(D.ANCORA_CHAPEU["pos"]) * CM
    cabeca_do_osso = Vector((0.0, 0.0, D.OSSOS[D.ANCORA_CHAPEU["osso"]][0][2] * CM))       # no glTF o filho se mede a partir da CABEÇA do osso pai
    pos_no_pai = [c + 0.0 for c in glb_coord(topo - cabeca_do_osso)]
    return {
        "no": D.ANCORA_CHAPEU["nome"], "pai": D.ANCORA_CHAPEU["osso"],
        "posicao_repouso_m": [c + 0.0 for c in glb_coord(topo)],
        "posicao_no_pai_m": pos_no_pai,
        "rotacao_no_pai": [0.0, 0.0, 0.0, 1.0],
        "eixo_para_fora": [0.0, 1.0, 0.0],
        "o_que_e": "o ponto do alto da cabeça, no topo da curva do balão. A origem de cada chapéu de `chapeus.glb` é o ponto que encosta aqui, com +Y para fora da cabeça.",
        "acompanha": "o nó é filho do osso `espinha_3` (o topo): sobe, desce e inclina com o pulo, o inclinar, o estufar e o murchar. Se o chapéu for só filho do nó, ele herda também a escala do osso (estica e amassa), "
                     "que vai a mais de 1,4 no estufar e a 0,7 no murchar: o chapéu amassaria junto. Por isso há uma regra de escala (`escala_do_chapeu`).",
        "escala_do_chapeu": D.ESCALA_DO_CHAPEU,
        "medido_nas_13_acoes": estatisticas_da_ancora(),
    }


def bigodes_meta():
    cores = {c: hex_srgb(rgb) for c, rgb in T.COR_DO_CABELO.items()}
    itens = {}
    for i in D.IDS_DE_BIGODE:
        tris = {}
        for lod in (G.ALTA, G.BAIXA):
            tris[lod["nome"]] = B.contagem(B.gerar_bigode(lod, G.estado_da_cara(D.NOME_DA_BASE), i))
        itens[i] = {
            "no_alta": i + "_alta", "no_baixa": i + "_baixa", "pai": "espinha_2", "triangulos": tris,
            "cor": D.COR_DO_BIGODE[i], "cor_hex": cores[D.COR_DO_BIGODE[i]], "material": "bigode_" + D.COR_DO_BIGODE[i],
        }
    return {
        "ids": D.IDS_DE_BIGODE,
        "itens": itens,
        "oculto_por_padrao": "cada nó sai com escala 0 e `extras.oculto_por_padrao` (o three 0.186 não lê KHR_node_visibility): para mostrar o bigode equipado, `no.scale.set(1, 1, 1)`; os outros ficam como estão",
        "como": "os nós são malhas comuns (sem pele) filhas do osso `espinha_2`, o mesmo do rosto inteiro: o bigode anda exatamente como a boca. Têm as mesmas 20 formas do rosto (`formas.nomes`), na mesma ordem: "
                "aplique em cada bigode visível os MESMOS pesos que usa em `balao_alta`/`balao_baixa` (o morph só leva a posição; as `estilo_*` e as pálpebras não mexem nele). "
                "Fica colado sobre o lábio de cima em todas as caras e nunca desce ao queixo (nada de barba).",
        "nome_dos_nos": "o id do contrato mais `_alta` ou `_baixa` (por exemplo `bigode_fino_alta`, `bigodao_baixa`): não há prefixo `bigode_` a mais",
        "cores_do_pelo": cores,
        "cor": "fixa por item (textura de fios `cabelo_*`, sheen leve); não tinge com a cor da equipe",
    }


def estilos_meta():
    out = {}
    for sid in D.IDS_DE_ESTILO:
        e = D.ESTILOS[sid]
        normal = sid == "olho_normal"
        forma = None if normal else "estilo_" + sid[len("olho_"):]
        out[sid] = {
            "forma": forma,
            "esclera": {"material": "olho" if normal else sid, "textura": "esclera_%s.png (256 px, embutida)" % sid[len("olho_"):],
                        "no_corpo": "o `balao_alta`/`balao_baixa` já vêm com o `olho_normal`; os outros estilos têm o material na vitrine `estilos_de_olho`" if normal else
                        "troque o material `olho` dos dois níveis pelo material `%s` (achado nos filhos da vitrine `estilos_de_olho`; clone-o)" % sid},
            "iris": {"material": "iris" if normal else "iris_" + sid[len("olho_"):], "textura": "iris_%s.png (256 px, em tons de cinza, embutida)" % sid[len("olho_"):],
                     "tinge": "material.color = cor do olho; material.emissive = cor do olho x 0,30 (o arquivo já traz o castanho assim)",
                     "no_corpo": "a malha `iris` do corpo" if normal else "troque o material `iris` dos dois níveis pelo `iris_%s` e tinja-o" % sid[len("olho_"):]},
            "iris_escala": e["iris_k"], "pupila_escala": e["pupila_k"],
            "brilhos": len(e["brilhos"]),
            "olheira": bool(e["olheira"]),
            "palpebra_do_estilo": ("est_" + sid[len("olho_"):]) if e["est"] is not None else None,
            "o_que_faz": {"olho_normal": "o olho de sempre",
                          "olho_kawaii": "íris e pupila maiores, quatro reflexos e sobrancelha um pouco mais alta",
                          "olho_bravo": "pálpebra de cima inclinada para dentro (a parte de dentro desce) e sobrancelha franzida",
                          "olho_cansado": "esclera avermelhada com veinhas, olheira sob o olho e pálpebra caída, sobrancelha baixa"}[sid],
            "como_ligar": "nenhum: é o corpo" if normal else "peso 1 em `%s` (e 0 nas outras `estilo_*`), somado a qualquer cara, a `piscar` e às pálpebras do olhar; desligar = peso 0 e o material `olho_normal`" % forma,
        }
    return {
        "ids": D.IDS_DE_ESTILO,
        "itens": out,
        "vitrine": {"no": VITRINE, "o_que_e": "uma malha de seis triângulos minúsculos dentro do corpo, com escala 0, que só leva os materiais dos estilos que o corpo não usa: "
                                           "`olho_kawaii`, `iris_kawaii`, `olho_bravo`, `iris_bravo`, `olho_cansado`, `iris_cansado`. Não a mostre; leia os `material` dos seus filhos."},
        "regra_das_formas": "as `estilo_*` somam com as caras sem fresta nem mancha (provado em `provas_olhos.py` para cada estilo contra as 12 caras, o piscar, a piscadinha e o olhar até o limite): "
                            "a pálpebra do estilo é uma casca à parte, que o giro do olhar move como as outras e que o olho fechado esconde sob a pele",
        "limites_provados": {"fresta_cm": 0.07, "afundar_cm": -0.08, "cantos_cm": 0.05, "mancha_px": 8, "iris_visivel_ate_o_limite_do_olhar": 0.84},
    }


def cores_meta():
    return {
        "ids": list(D.CORES_DE_OLHO), "padrao": D.COR_PADRAO_DE_OLHO,
        "cores": {i: dict(c) for i, c in D.CORES_DE_OLHO.items()},
        "como": "`cor` (sRGB) é o tom que tinge a íris cinza: material.color.set(cor) e material.emissive.set(cor).multiplyScalar(0,30). `centro` e `borda` são o par para quem quiser um gradiente "
                "(centro mais claro, borda mais escura); a íris cinza já dá esse efeito sozinha. A cor vale para qualquer estilo.",
    }


def meta(arquivo):
    """`balao-meta.json`: tudo que o Frontend precisa saber para usar o balão sem abrir o Blender."""
    bpy.context.view_layer.update()
    olhos = {}
    for lado, nome in ((+1, "olho_esq"), (-1, "olho_dir")):
        c = G.centro_do_olho(lado)
        olhos[nome] = {"centro_m": glb_coord(c * CM), "eixo_do_olhar_no_repouso": glb_coord(G.eixo_do_olhar(lado)), "pai": "espinha_2"}
    acoes = {}
    for ac in bpy.data.actions:
        if ac.name.startswith("balao_"):
            r = D.TRECHOS.get(ac.name, {})
            fim = int(round(ac.frame_range[1]))
            acoes[ac.name] = {
                "quadros": fim, "fps": FPS, "segundos": round(fim / FPS, 3),
                "repete": "ciclo" in r and r["ciclo"][0] == 0, "entrada_quadros": list(r["entrada"]) if "entrada" in r else None,
                "ciclo_quadros": list(r["ciclo"]) if "ciclo" in r else None, "cara_par": D.PAR_DE_CARA[ac.name],
                "o_que_e": D.DESCRICAO_DAS_ACOES[ac.name],
            }
    tris = {n: sum(len(p.vertices) - 2 for p in bpy.data.objects[n].data.polygons) for n in MALHAS}
    caras = [c for c in D.FORMAS if c.startswith("cara_")]
    return {
        "arquivo": os.path.basename(arquivo),
        "versao": D.VERSAO,
        "revisao": "P8 (2026-10-28): contrato v3 (amplia o v2, nada do v2 muda): âncora do chapéu, 5 bigodes, 4 estilos de olho (as 3 formas `estilo_*` ao fim de `formas.nomes`), 8 cores de olho; "
                   "o rosto do P7b continua o mesmo, com os mesmos nomes, a mesma ordem e as mesmas ações",
        "unidades": "metros; origem no centro do corpo; o rosto olha para +Z (yaw 0 do jogo); +X é a esquerda do balão (a direita de quem o vê de frente)",
        "tamanho_repouso_cm": {"metade_altura": D.METADE_ALTURA, "raio": D.RAIO, "no_z": D.Z_DO_NO, "cordinha": D.CORDINHA_COMPRIMENTO},
        "malhas": {n: {"triangulos": tris[n]} for n in MALHAS},
        "materiais": {
            "latex_glb": "branco com a cor de vértice COLOR_0 (o jogo tinge com a cor da equipe e liga `vertexColors: true`); verniz KHR_materials_clearcoat",
            "olho": "esclera do `olho_normal` (textura 256, branca limpa com sombra só na borda); a íris é uma segunda pele, o material `iris` (cinza, tingível, ver `estilos_de_olho` e `cores_de_olho`), com a pupila grande e nítida em geometria",
            "iris": "íris em tons de cinza (textura 256 + a cor do olho em `color` e em `emissive` x 0,30); o arquivo já vem castanho",
            "olheira": "crescente macio (alfa) sob o olho, só do estilo cansado; escondido sob a pele nos outros (material `olheira`, alphaMode BLEND)",
            "rosto_preto": "sobrancelha, delineador da pálpebra de cima e a fita do olho fechado (o arco \"^ ^\" com cílio)", "lingua": "língua", "cordinha": "fita da cordinha, em creme", "brilho": "reflexos (presos à espinha_2)",
            "bochecha": "textura 64 com alfa (alphaMode BLEND), rubor rosa e macio; é emissivo (continua rosa sob qualquer luz e sobre azul, laranja, verde ou violeta); o jogo tinge o corpo, não a bochecha", "dente": "dentes", "boca": "interior da boca",
        },
        "latex_proposta": {
            "aviso": "números para o jogo experimentar no `MeshPhysicalMaterial` do látex (nenhum código do jogo foi mexido); o .glb já leva o que cabe no formato",
            "roughness": 0.2, "metalness": 0.0, "clearcoat": 1.0, "clearcoatRoughness": 0.05, "sheen": 0.25, "sheenRoughness": 0.45,
            "sheenColor_dica": "a cor da equipe clareada a 40 por cento (o brilho de veludo que o látex tem na borda)",
            "specularIntensity": 0.5, "ior": 1.45, "vertexColors": True,
            "cor_de_vertice": "COLOR_0 em tons de cinza multiplicando a cor da equipe: %s; 1,0 é a cor da equipe pura no ventre esticado (onde o látex fica mais claro) "
                              "e o valor cai no pescoço e no nó (látex dobrado, mais escuro); sem `vertexColors` o balão fica chapado, mas continua certo" % json.dumps(estatisticas_da_cor()),
        },
        "formas": {
            "nomes": D.FORMAS,
            "uso": "morph targets em `morphTargetDictionary`; peso 0 é o rosto neutro; `cara_neutro` é o rosto-base e só existe pelo nome; "
                   "uma cara por vez (peso 1) e `piscar` soma às caras: a cara multiplicada por (1 - piscar) mais `piscar` fecha direito; "
                   "o GLTFLoader cria um filho por material: aplique o peso nos `morphTargetInfluences` de TODOS os filhos de `balao_alta`/`balao_baixa`",
        },
        "olho_fechado": {
            "caras": [c for c in caras if D.CARAS[c]["esq"]["fecha"] >= 0.5],
            "como": "nestas caras e em `piscar`, `piscar_esq` e `piscar_dir` o globo, os reflexos e as pálpebras AFUNDAM %.2f cm na pele (ao longo da normal) e uma fita escura sobe à pele no lugar: o arco \"^ ^\" com um cílio na ponta de fora "
                    "(com o olho aberto a fita fica %.2f cm por baixo da pele). O jogo não precisa fazer nada: o osso do olho continua girando em volta do centro de repouso e o globo fica escondido (provado até %d graus), "
                    "e as formas se somam sem pálpebra inchada: uma piscadinha de um olho só aguenta a cara inteira (peso 1)" % (D.SINK_FECHADO, D.SINK_FITA, D.LIMITE_DO_OLHAR),
        },
        "caras": caras,
        "abertura_da_cara": abertura_das_caras(),
        "piscar": {
            "formas": {"os_dois": "piscar", "esquerdo": "piscar_esq", "direito": "piscar_dir"},
            "regra": "piscar dos dois olhos: peso_da_cara = (1 - p) e piscar = p (p vai 0 -> 1 -> 0 em uns 6 quadros; fechar é mais rápido que abrir)",
            "piscadinha": "um olho só: some `piscar_esq` ou `piscar_dir` (peso 1) por cima da cara. O olho que fecha afunda na pele (`olho_fechado`), então a soma não deixa fresta nem pálpebra "
                          "inchada e `peso_da_cara_na_piscadinha` é 1 em todas as caras (o campo fica no contrato: se uma cara nova precisar, o valor cai abaixo de 1 e o jogo já o lê)",
            "peso_da_cara_na_piscadinha": piscadinha(),
        },
        "palpebras": {
            "cima": {"forma": "palpebra_cima", "olhar_graus_para_peso_1": D.LIMITE_DO_OLHAR, "gira_graus_no_peso_1": D.PALPEBRA_GRAUS_NO_PESO_1,
                     "quando": "o olhar sobe: as pálpebras acompanham o globo para cima"},
            "baixo": {"forma": "palpebra_baixo", "olhar_graus_para_peso_1": D.LIMITE_DO_OLHAR, "gira_graus_no_peso_1": D.PALPEBRA_GRAUS_NO_PESO_1,
                      "quando": "o olhar desce: as pálpebras acompanham o globo para baixo"},
            "regra": "peso_cima = clamp(olhar_vertical_para_cima / olhar_graus_para_peso_1, 0, 1) * abertura_da_cara[cara]; peso_baixo igual para baixo; "
                     "só um dos dois por vez; com os olhos fechados (`piscar` ou cara de olho fechado) o peso é zero. Sem a regra as pálpebras ficam paradas, o que é só um pouco menos vivo",
        },
        "olhos": olhos,
        "olhar": {
            "limite_graus": D.LIMITE_DO_OLHAR,
            "como": "no carregamento, eixo_repouso_no_pai = inverse(quaternion_mundial_do_pai) * eixo_do_olhar_no_repouso e quaternion_de_repouso = quaternion do osso do olho; "
                    "a cada quadro (depois do mixer), q = setFromUnitVectors(eixo_repouso_no_pai, direcao_do_alvo_no_pai), com o ângulo limitado a `limite_graus`, "
                    "e osso.quaternion = q * quaternion_de_repouso; `olharPara` em arte/visor/balao.js é a conta pronta; "
                    "até `limite_graus` a íris continua visível (84 por cento ou mais da área) e as pálpebras (com `palpebras` e `abertura_da_cara`) abraçam o globo sem fresta nem mancha de látex",
        },
        "cordinha": cordinha(),
        "ancora_chapeu": ancora_meta(),
        "bigodes": bigodes_meta(),
        "estilos_de_olho": estilos_meta(),
        "cores_de_olho": cores_meta(),
        "ossos": {
            "raiz": "leva tudo (balanço, pulo)",
            "espinha_1": "gira e escala a partir do pescoço (estufar, murchar, inclinar); o achatamento conserva o volume",
            "espinha_2": "meio do corpo e do rosto; pai dos olhos, dos reflexos e dos pontos das mãos",
            "espinha_3": "topo",
            "no": "nó (filho da raiz; não escala com o corpo)",
            "cordinha_1..4": "corrente da cordinha, do nó para baixo; SEM chave nas ações (o jogo simula)",
            "olho_esq/olho_dir": "olhar; SEM chave nas ações (o jogo mira)",
        },
        "pontos_das_maos": {n: {"pai": "espinha_2", "posicao_repouso_m": glb_coord(Vector(p) * CM),
                                "uso": "ponha a `mao.glb` aqui; use só a posição (e a orientação), não a escala do pai"} for n, p in D.PONTOS_DAS_MAOS.items()},
        "acoes": acoes,
        "par_de_cara": D.PAR_DE_CARA,
    }


def validar(caminho):
    validador = os.environ.get("VALIDADOR")
    if not validador:
        return None
    r = subprocess.run(["node", validador, caminho], capture_output=True, text=True)
    print(r.stdout.strip())
    return "erros 0 " in r.stdout


def principal():
    shutil.rmtree(TEMP, ignore_errors=True)
    os.makedirs(TEMP)
    os.makedirs(SAIDA, exist_ok=True)
    glb = os.path.join(TEMP, "balao.glb")
    exportar(glb)
    reescrever_json(glb, lambda j: (tirar_canais(j), esconder_nos(j), sem_normais_nos_bigodes(j)))
    enxugar(glb)
    caminho_meta = os.path.join(TEMP, "balao-meta.json")
    with open(caminho_meta, "w") as f:
        json.dump(meta(glb), f, indent=2, ensure_ascii=False)
        f.write("\n")
    canais = canais_por_acao(glb)
    proibidos = {a: [o for o in os_ if o in OSSOS_SEM_CANAL] for a, os_ in canais.items()}
    assert not any(proibidos.values()), proibidos
    ok = validar(glb)
    if ok is False:
        print("O validador achou erro: nada foi movido; arquivos em", TEMP)
        sys.exit(1)
    os.replace(glb, os.path.join(SAIDA, "balao.glb"))
    os.replace(caminho_meta, os.path.join(SAIDA, "balao-meta.json"))
    shutil.rmtree(TEMP, ignore_errors=True)
    print("exportado", os.path.join(SAIDA, "balao.glb"), os.path.getsize(os.path.join(SAIDA, "balao.glb")), "bytes")
    for a, os_ in canais.items():
        print("  ", a, "ossos com chave:", ",".join(os_))


principal()
