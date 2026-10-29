"""Compara o balao.glb + balao-meta.json novos com os do v1 (a cópia em `.outros/lote-p7/antes/`): o contrato v2 só pode ACRESCENTAR.

Uso: python3 arte/ferramentas/comparar_contrato.py [novo.glb] [antigo.glb]   (python puro, sem Blender)
Confere: nós, malhas, ações e formas do v1 continuam (formas na mesma ordem), chaves do meta, tamanhos de repouso, pontos das mãos, olhos (centro e eixo),
nenhum canal de ação em `cordinha_*`/`olho_*`, látex branco, texturas e os nós de repouso que mudaram.
"""
import json
import os
import struct
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
NOVO = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "arte", "personagens", "exportados", "balao.glb")
VELHO = sys.argv[2] if len(sys.argv) > 2 else os.path.join(RAIZ, ".outros", "lote-p7", "antes", "balao.glb")


def ler(caminho):
    b = open(caminho, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + n])
    meta = json.load(open(caminho.replace("balao.glb", "balao-meta.json"), encoding="utf-8"))
    return j, meta


def formas_de(j, malha="balao_alta"):
    for m in j["meshes"]:
        if m["name"] == malha:
            return m.get("extras", {}).get("targetNames", [])
    return []


v1, m1 = ler(VELHO)
v2, m2 = ler(NOVO)
n1 = {n["name"] for n in v1["nodes"] if "name" in n}
n2 = {n["name"] for n in v2["nodes"] if "name" in n}
print("nos do v1 que sumiram no v2:", sorted(n1 - n2) or "nenhum")
print("nos novos no v2:", sorted(n2 - n1) or "nenhum")
print("malhas v1:", [m["name"] for m in v1["meshes"]], "v2:", [m["name"] for m in v2["meshes"]])
a1 = [a["name"] for a in v1["animations"]]
a2 = [a["name"] for a in v2["animations"]]
print("acoes v1 todas no v2:", all(a in a2 for a in a1), "| v2:", len(a2))
f1, f2 = formas_de(v1), formas_de(v2)
print("formas v1:", f1)
print("formas v2 (as v1 primeiro, mesma ordem):", f2[:len(f1)] == f1, len(f2))
ausentes = [k for k in m1 if k not in m2]
print("chaves v1 do meta ausentes no v2:", ausentes or "nenhuma")
print("tamanho_repouso_cm igual:", m1["tamanho_repouso_cm"] == m2["tamanho_repouso_cm"], "| pontos das maos iguais:", m1["pontos_das_maos"] == m2["pontos_das_maos"],
      "| olhos (centro/eixo) iguais:", m1["olhos"] == m2["olhos"])
for k in m1["olhos"]:
    print("  ", k, "v1", m1["olhos"][k]["centro_m"], "v2", m2["olhos"][k]["centro_m"])
canais = []
nomes_no = [n.get("name") for n in v2["nodes"]]
for a in v2["animations"]:
    for c in a["channels"]:
        nome = nomes_no[c["target"]["node"]] or ""
        if nome.startswith(("cordinha_", "olho_")):
            canais.append((a["name"], nome))
print("canais em cordinha_* ou olho_* nas acoes:", canais or "nenhum")
branco = all("baseColorFactor" not in m.get("pbrMetallicRoughness", {}) or m["pbrMetallicRoughness"]["baseColorFactor"][:3] == [1, 1, 1] for m in v2["materials"] if m.get("name") == "latex_glb")
print("latex base branco (sem tingir):", branco)
print("imagens embutidas:", [(i.get("name"), i.get("mimeType")) for i in v2.get("images", [])] or "nenhuma")
print("doubleSided em algum material:", any(m.get("doubleSided") for m in v2["materials"]))
dif = []
for a in v1["nodes"]:
    b = next((x for x in v2["nodes"] if x.get("name") == a.get("name")), None)
    if not b:
        continue
    for k in ("translation", "rotation", "scale"):
        x, y = a.get(k), b.get(k)
        if (x is None) != (y is None) or (x is not None and any(abs(p - q) > 1e-5 for p, q in zip(x, y))):
            dif.append((a["name"], k))
print("nos de repouso diferentes (v1 x v2):", dif or "nenhum")
