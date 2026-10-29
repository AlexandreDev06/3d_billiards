"""Lê o JSON de um .glb: materiais, malhas (primitivas), imagens e extensões. uso: python3 glb_info.py arquivo.glb [--materiais]"""
import json
import struct
import sys


def ler(caminho):
    d = open(caminho, "rb").read()
    n = struct.unpack("<I", d[12:16])[0]
    j = json.loads(d[20:20 + n])
    return j, d


if __name__ == "__main__":
    j, d = ler(sys.argv[1])
    print("tamanho", len(d), "extensoes", j.get("extensionsUsed"))
    print("imagens", [(i.get("name"), i.get("mimeType"), j["bufferViews"][i["bufferView"]]["byteLength"]) for i in j.get("images", [])])
    if "--materiais" in sys.argv:
        for m in j["materials"]:
            p = m.get("pbrMetallicRoughness", {})
            print(m["name"], "cor", [round(x, 3) for x in p.get("baseColorFactor", [])], "tex", "baseColorTexture" in p, "metal", p.get("metallicFactor"), "rug", p.get("roughnessFactor"),
                  "emis", m.get("emissiveFactor"), "ext", list(m.get("extensions", {})), "dupla", m.get("doubleSided"), "alfa", m.get("alphaMode"))
