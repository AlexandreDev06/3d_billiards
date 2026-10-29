"""Mede o olho numa captura de frente do visor (python puro + Pillow, sem numpy): o tamanho visível do branco do olho (esclera) em pixels e sobre a largura do corpo.

Uso: python3 arte/ferramentas/medir_olho.py captura.png [captura2.png ...]
O fundo é preto; o branco do olho é o que é claro e quase sem cor (R, G e B altos). Os reflexos (brancos puros) ficam dentro do olho e contam como olho.
"""
import sys
from collections import deque

from PIL import Image


def componentes(mascara, L, A):
    visto = bytearray(L * A)
    saida = []
    for y0 in range(A):
        for x0 in range(L):
            i0 = y0 * L + x0
            if not mascara[i0] or visto[i0]:
                continue
            fila = deque([(x0, y0)])
            visto[i0] = 1
            pts = []
            while fila:
                x, y = fila.popleft()
                pts.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < L and 0 <= ny < A and mascara[ny * L + nx] and not visto[ny * L + nx]:
                        visto[ny * L + nx] = 1
                        fila.append((nx, ny))
            saida.append(pts)
    return saida


def medir(caminho):
    im = Image.open(caminho).convert("RGB")
    L, A = im.size
    px = im.load()
    clara = bytearray(L * A)
    corpo = bytearray(L * A)
    for y in range(A):
        for x in range(L):
            r, g, b = px[x, y]
            if max(r, g, b) > 28:
                corpo[y * L + x] = 1
            if min(r, g, b) > 165 and max(r, g, b) - min(r, g, b) < 40:
                clara[y * L + x] = 1
    comps = [c for c in componentes(clara, L, A) if len(c) > 60]
    comps.sort(key=len, reverse=True)
    olhos = comps[:2]
    if len(olhos) < 2:
        return "%s: achei %d olho(s)" % (caminho, len(olhos))
    olhos.sort(key=lambda c: min(p[0] for p in c))
    out = []
    for c in olhos:
        xs, ys = [p[0] for p in c], [p[1] for p in c]
        yc = (min(ys) + max(ys)) // 2
        linha = [x for x in range(L) if corpo[yc * L + x]]
        largura_corpo = max(linha) - min(linha) + 1
        out.append((max(xs) - min(xs) + 1, max(ys) - min(ys) + 1, largura_corpo, len(c)))
    w = sum(o[0] for o in out) / 2
    h = sum(o[1] for o in out) / 2
    corpo_l = sum(o[2] for o in out) / 2
    area = sum(o[3] for o in out) / 2
    return "%s: olho %.0f x %.0f px, corpo %.0f px na altura do olho -> largura do olho / corpo %.3f, altura / corpo %.3f, area branca %.0f px" % (
        caminho, w, h, corpo_l, w / corpo_l, h / corpo_l, area)


if __name__ == "__main__":
    for a in sys.argv[1:]:
        print(medir(a))
