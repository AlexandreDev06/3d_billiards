"""Lê um .glb (só a biblioteca padrão) e conta o que importa: triângulos por nó e total, materiais, imagens (px e bytes), caixa do mundo,
marcadores (luzes e câmeras) e a folga em volta da mesa. `python3 contar.py arquivo.glb [--json]`."""
import json
import struct
import sys

PISO = -0.8
SEMI_X, SEMI_Z, FOLGA = 1.13, 0.68, 1.6


def ler(caminho):
    with open(caminho, "rb") as f:
        dados = f.read()
    _, _, total = struct.unpack("<4sII", dados[:12])
    pos = 12
    gj, binario = None, b""
    while pos < total:
        n, tipo = struct.unpack("<II", dados[pos:pos + 8])
        corpo = dados[pos + 8:pos + 8 + n]
        if tipo == 0x4E4F534A:
            gj = json.loads(corpo)
        elif tipo == 0x004E4942:
            binario = corpo
        pos += 8 + n
    return gj, binario, len(dados)


def tam_png_jpg(b):
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", b[16:24])
    i = 2
    while i < len(b):
        if b[i] != 0xFF:
            i += 1
            continue
        mk = b[i + 1]
        if mk in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", b[i + 5:i + 9])
            return w, h
        n = struct.unpack(">H", b[i + 2:i + 4])[0]
        i += 2 + n
    return (0, 0)


def analisar(caminho):
    g, binario, tamanho = ler(caminho)
    acc = g["accessors"]
    nos = g.get("nodes", [])
    meshes = g.get("meshes", [])
    saida = {"arquivo": caminho, "bytes": tamanho, "nos": [], "materiais": [], "imagens": [], "marcadores": [], "cameras": []}
    total = 0
    mn_g, mx_g = [1e9] * 3, [-1e9] * 3
    for i, no in enumerate(nos):
        t = no.get("translation", [0, 0, 0])
        if "mesh" in no:
            tri = 0
            mn, mx = [1e9] * 3, [-1e9] * 3
            for p in meshes[no["mesh"]]["primitives"]:
                if "indices" in p:
                    tri += acc[p["indices"]]["count"] // 3
                else:
                    tri += acc[p["attributes"]["POSITION"]]["count"] // 3
                a = acc[p["attributes"]["POSITION"]]
                for k in range(3):
                    mn[k] = min(mn[k], a["min"][k] + t[k])
                    mx[k] = max(mx[k], a["max"][k] + t[k])
            total += tri
            saida["nos"].append({"nome": no.get("name"), "triangulos": tri, "primitivas": len(meshes[no["mesh"]]["primitives"]), "min": mn, "max": mx})
            for k in range(3):
                mn_g[k], mx_g[k] = min(mn_g[k], mn[k]), max(mx_g[k], mx[k])
        elif "camera" in no:
            cam = g["cameras"][no["camera"]]
            saida["cameras"].append({"nome": no.get("name"), "pos": t, "yfov_graus": round(cam["perspective"]["yfov"] * 57.29578, 2), "rot": no.get("rotation")})
        else:
            saida["marcadores"].append({"nome": no.get("name"), "pos": t, "extras": no.get("extras")})
    saida["triangulos"] = total
    saida["caixa"] = [mn_g, mx_g]
    for m in g.get("materials", []):
        saida["materiais"].append({"nome": m.get("name"), "alfa": m.get("alphaMode", "OPAQUE"), "emissivo": m.get("emissiveFactor"),
                                   "textura": "pbrMetallicRoughness" in m and "baseColorTexture" in m["pbrMetallicRoughness"]})
    for im in g.get("images", []):
        bv = g["bufferViews"][im["bufferView"]]
        b = binario[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
        w, h = tam_png_jpg(b)
        saida["imagens"].append({"nome": im.get("name"), "mime": im.get("mimeType"), "px": [w, h], "bytes": bv["byteLength"]})
    saida["bytes_imagens"] = sum(i["bytes"] for i in saida["imagens"])
    # folga: nós de adereço (não casco, não luminária) com algo abaixo de 2,1 m do piso na faixa da mesa
    return saida


if __name__ == "__main__":
    r = analisar(sys.argv[1])
    if "--json" in sys.argv:
        print(json.dumps(r, indent=1))
    else:
        print(f"{r['arquivo']}  {r['bytes'] / 1e6:.2f} MB  {r['triangulos']} triângulos  {len(r['nos'])} nós de malha  {len(r['materiais'])} materiais  {len(r['imagens'])} imagens ({r['bytes_imagens'] / 1e6:.2f} MB)")
        for n in r["nos"]:
            print("  malha", n["nome"], n["triangulos"], "tris,", n["primitivas"], "primitivas")
        for m in r["marcadores"]:
            print("  marcador", m["nome"], [round(v, 2) for v in m["pos"]], m["extras"] and sorted(m["extras"].keys()))
        for m in r["cameras"]:
            print("  camera", m["nome"], [round(v, 2) for v in m["pos"]], "yfov", m["yfov_graus"])
        for m in r["materiais"]:
            print("  material", m["nome"], m["alfa"], m["emissivo"] or "", "tex" if m["textura"] else "")
        print("  caixa", [round(v, 2) for v in r["caixa"][0]], [round(v, 2) for v in r["caixa"][1]])
