"""O letreiro do jogo: "SINUCA" e "PAR OU ÍMPAR" em néon de boteco, aceso e apagado, em SVG e PNG transparente (2048 px de largura).

Só traços das letras de `letras.py` (desenhadas aqui; nenhuma fonte de terceiros). Roda com `uv run --with numpy --with pillow python3 marca.py [saida]`.
O PNG aceso é "luz sobre transparente": o alfa é o maior canal, então por cima de um fundo escuro dá a soma de luz de um néon de verdade.
`elementos(variante, escala)` também alimenta a textura do letreiro do boteco (`texturas.py`).
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import letras

LARGURA = 2048
MARGEM = 190
COR = {"rosa": (255, 46, 140), "ciano": (40, 218, 255), "ambar": (255, 178, 44), "estrela": (255, 238, 170)}
COR_APAGADO = {"rosa": (176, 124, 150), "ciano": (126, 164, 178), "ambar": (178, 152, 104), "estrela": (196, 186, 150)}


class El:
    """Um traço em pixels: pontos, cor, largura, se tem as pontas fechadas."""

    def __init__(self, pontos, cor, largura):
        self.pontos, self.cor, self.largura = pontos, cor, largura


def _estrela(cx, cy, r, cor, larg):
    return [El([(cx - r, cy), (cx + r, cy)], cor, larg), El([(cx, cy - r), (cx, cy + r)], cor, larg),
            El([(cx - r * .45, cy - r * .45), (cx + r * .45, cy + r * .45)], cor, larg * .6),
            El([(cx - r * .45, cy + r * .45), (cx + r * .45, cy - r * .45)], cor, larg * .6)]


def _circulo(cx, cy, r, cor, larg):
    return El([(cx + r * math.cos(a), cy + r * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 48)], cor, larg)


def elementos(variante="completo", largura=LARGURA, margem=MARGEM):
    """Lista de traços (em px) e a altura do quadro. variante: completo | sinuca | par-ou-impar."""
    els = []
    tr1, w1 = letras.compor("SINUCA", 2.7)
    util = largura - 2 * margem
    s1 = util / w1
    larg1 = 0.95 * s1
    y = margem + 2.4 * s1 * 0  # topo do desenho: a altura da letra é 10 unidades
    topo = margem
    if variante in ("completo", "sinuca"):
        base1 = topo + 10 * s1
        for t in letras.transformar(tr1, s1, margem, base1, True):
            els.append(El(t, "rosa", larg1))
        y = base1
        els += _estrela(margem + util * 0.985, topo - 0.1 * s1, 0.55 * s1, "estrela", larg1 * .3)
        els += _estrela(margem - 0.02 * util, base1 + 0.2 * s1, 0.36 * s1, "estrela", larg1 * .26)
        yl = base1 + 1.8 * s1
        # taco e bolas: a linha âmbar entre as duas partes
        raio = 0.62 * s1
        x0, x1 = margem + raio, margem + util - raio
        meio = (x0 + x1) / 2
        gap = 1.6 * s1
        els.append(El([(x0 + raio, yl), (meio - gap, yl)], "ambar", larg1 * .55))
        els.append(El([(meio + gap, yl), (x1 - raio, yl)], "ambar", larg1 * .55))
        els += _estrela(meio, yl, 0.95 * s1, "estrela", larg1 * .34)
        els.append(_circulo(x0, yl, raio, "ambar", larg1 * .55))
        els.append(_circulo(x1, yl, raio, "ambar", larg1 * .55))
        els.append(_circulo(x0, yl, raio * .38, "ambar", larg1 * .3))
        y = yl + raio
    if variante in ("completo", "par-ou-impar"):
        s2 = 0.4 * s1 if variante == "completo" else None
        if variante == "par-ou-impar":
            tr0, w0 = letras.compor("PAR OU ÍMPAR", 2.4)
            s2 = util / w0 * 0.9
            tr2, w2 = tr0, w0
        else:
            tr2, w2 = letras.justificar("PAR OU ÍMPAR", util / s2, 2.4)
        larg2 = 0.95 * s2 * (1.0 if variante == "par-ou-impar" else 1.25)
        topo2 = y + (1.6 * s1 if variante == "completo" else margem * 0.0) + (2.7 * s2 if variante == "par-ou-impar" else 0)
        base2 = topo2 + 10 * s2 + (0 if variante == "completo" else 0)
        off = margem + (0 if variante == "completo" else (util - w2 * s2) / 2)
        for t in letras.transformar(tr2, s2, off, base2, True):
            els.append(El(t, "ciano", larg2))
        y = base2
        if variante == "par-ou-impar":
            els += _estrela(margem * .9, base2 - 5 * s2, 0.9 * s2, "estrela", larg2 * .3)
            els += _estrela(largura - margem * .9, base2 - 5 * s2, 0.9 * s2, "estrela", larg2 * .3)
    altura = int(math.ceil(y + margem * 0.9 + (0.3 * margem if variante != "completo" else 0)))
    if variante == "par-ou-impar":
        altura = int(math.ceil(y + margem + 2.3 * 0.4 * s1))
    return els, altura


def _mascara(els, w, h, ss=2, largura_fator=1.0, deslocamento=(0, 0)):
    from PIL import Image, ImageDraw
    img = Image.new("L", (w * ss, h * ss), 0)
    d = ImageDraw.Draw(img)
    for e in els:
        lw = max(1, int(round(e.largura * largura_fator * ss)))
        pts = [((x + deslocamento[0]) * ss, (y + deslocamento[1]) * ss) for x, y in e.pontos]
        if len(pts) == 1 or (len(pts) == 2 and pts[0] == pts[1]):
            r = lw / 2
            d.ellipse((pts[0][0] - r, pts[0][1] - r, pts[0][0] + r, pts[0][1] + r), fill=255)
            continue
        d.line(pts, fill=255, width=lw, joint="curve")
        r = lw / 2
        for p in (pts[0], pts[-1]):
            d.ellipse((p[0] - r, p[1] - r, p[0] + r, p[1] + r), fill=255)
    if ss != 1:
        img = img.resize((w, h), Image.LANCZOS)
    return np.asarray(img, dtype=np.float32) / 255.0


def _borrar(m, raio):
    from PIL import Image, ImageFilter
    img = Image.fromarray((np.clip(m, 0, 1) * 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(float(raio))), dtype=np.float32) / 255.0


def render_aceso(els, w, h, ss=2):
    """RGBA straight; o alfa é o maior canal da luz somada."""
    acc = np.zeros((h, w, 3), np.float32)
    for chave in ("rosa", "ciano", "ambar", "estrela"):
        sub = [e for e in els if e.cor == chave]
        if not sub:
            continue
        lw = np.mean([e.largura for e in sub])
        col = np.array(COR[chave], np.float32) / 255.0
        m = _mascara(sub, w, h, ss)
        nucleo = _mascara(sub, w, h, ss, 0.34)
        luz = 1.1 * m + 0.62 * _borrar(m, lw * 0.55) + 0.5 * _borrar(m, lw * 1.7) + 0.30 * _borrar(m, lw * 3.4) + 0.14 * _borrar(m, lw * 6.0)
        acc += col[None, None, :] * luz[:, :, None]
        branco = np.array([1.0, 0.93, 0.95], np.float32) if chave != "ciano" else np.array([0.9, 1.0, 1.0], np.float32)
        acc += branco[None, None, :] * (0.78 * nucleo)[:, :, None]
    acc = np.clip(acc, 0, 1)
    alfa = acc.max(axis=2)
    rgb = np.where(alfa[:, :, None] > 1e-4, acc / np.maximum(alfa[:, :, None], 1e-4), 0)
    # o brilho que passa de 1 no núcleo vira cor mais clara: já está no `acc`
    return np.dstack([rgb, alfa])


def _sobre(rgba, m, col, op=1.0):
    a = rgba[:, :, 3]
    ma = m * op
    na = ma + a * (1 - ma)
    c = (np.array(col, np.float32)[None, None, :] / 255.0 * ma[:, :, None] + rgba[:, :, :3] * (a * (1 - ma))[:, :, None]) / np.maximum(na[:, :, None], 1e-5)
    rgba[:, :, :3] = c
    rgba[:, :, 3] = na


def render_apagado(els, w, h, ss=2):
    """Tubo de vidro fosco, sem luz: borda escura, corpo desbotado, brilho de janela e as tampas pretas nas pontas."""
    rgba = np.zeros((h, w, 4), np.float32)
    for e in els:
        pass
    for chave in ("rosa", "ciano", "ambar", "estrela"):
        sub = [e for e in els if e.cor == chave]
        if not sub:
            continue
        lw = np.mean([e.largura for e in sub])
        _sobre(rgba, _mascara(sub, w, h, ss, 1.18), (52, 46, 52), 1.0)
    for chave in ("rosa", "ciano", "ambar", "estrela"):
        sub = [e for e in els if e.cor == chave]
        if not sub:
            continue
        corpo = COR_APAGADO[chave]
        _sobre(rgba, _mascara(sub, w, h, ss, 1.0), corpo, 1.0)
        _sobre(rgba, _mascara(sub, w, h, ss, 0.5), tuple(int(c * 0.86) for c in corpo), 0.6)
        lw = np.mean([e.largura for e in sub])
        _sobre(rgba, _mascara(sub, w, h, ss, 0.2, (-lw * 0.2, -lw * 0.22)), (240, 240, 244), 0.55)
    tampas = []
    for e in els:
        if len(e.pontos) > 2 and math.hypot(e.pontos[0][0] - e.pontos[-1][0], e.pontos[0][1] - e.pontos[-1][1]) < e.largura * 0.2:
            continue
        for p in (e.pontos[0], e.pontos[-1]):
            tampas.append(El([p], "x", e.largura * 0.95))
    if tampas:
        _sobre(rgba, _mascara(tampas, w, h, ss), (34, 30, 36), 1.0)
    return rgba


def para_png(rgba, caminho):
    from PIL import Image
    a = np.clip(rgba * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(a, "RGBA").save(caminho, optimize=True)


def para_svg(els, w, h, aceso, caminho):
    def pts(e):
        return " ".join(f"{x:.1f},{y:.1f}" for x, y in e.pontos)

    def hexa(c):
        return "#%02x%02x%02x" % tuple(int(v) for v in c)
    linhas = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">']
    if aceso:
        linhas.append('<defs>' + "".join(
            f'<filter id="b{i}" filterUnits="userSpaceOnUse" x="0" y="0" width="{w}" height="{h}"><feGaussianBlur stdDeviation="{d}"/></filter>'
            for i, d in enumerate((14, 38, 70))) + '</defs>')
    for chave in ("rosa", "ciano", "ambar", "estrela"):
        sub = [e for e in els if e.cor == chave]
        if not sub:
            continue

        def grupo(fator, cor, extra="", filtro=None, op=1.0):
            f = f' filter="url(#{filtro})"' if filtro else ""
            corpo = "".join(
                (f'<circle cx="{e.pontos[0][0]:.1f}" cy="{e.pontos[0][1]:.1f}" r="{e.largura * fator / 2:.1f}" fill="{cor}"/>' if len(e.pontos) == 1 else
                 f'<polyline points="{pts(e)}"/>') for e in sub)
            # a largura varia por elemento: um grupo por largura distinta
            return corpo, f
        por_largura = {}
        for e in sub:
            por_largura.setdefault(round(e.largura, 1), []).append(e)
        for lw, grupo_els in por_largura.items():
            def g(fator, cor, filtro=None, op=1.0, desloc=(0, 0)):
                f = f' filter="url(#{filtro})"' if filtro else ""
                t = f' transform="translate({desloc[0]:.1f} {desloc[1]:.1f})"' if desloc != (0, 0) else ""
                corpo = "".join(f'<polyline points="{pts(e)}"/>' for e in grupo_els)
                return (f'<g fill="none" stroke="{cor}" stroke-width="{lw * fator:.1f}" stroke-linecap="round" stroke-linejoin="round" '
                        f'opacity="{op}"{f}{t}>{corpo}</g>')
            if aceso:
                c = hexa(COR[chave])
                linhas.append(g(1.0, c, "b2", 0.55))
                linhas.append(g(1.0, c, "b1", 0.8))
                linhas.append(g(1.0, c, "b0", 0.9))
                linhas.append(g(1.0, c))
                linhas.append(g(0.34, "#fff4f6" if chave != "ciano" else "#e6ffff", None, 0.95))
            else:
                linhas.append(g(1.18, "#34303a"))
                linhas.append(g(1.0, hexa(COR_APAGADO[chave])))
                linhas.append(g(0.2, "#f0f0f4", None, 0.55, (-lw * 0.2, -lw * 0.22)))
    if not aceso:
        for e in els:
            if len(e.pontos) > 2 and math.hypot(e.pontos[0][0] - e.pontos[-1][0], e.pontos[0][1] - e.pontos[-1][1]) < e.largura * 0.2:
                continue
            for p in (e.pontos[0], e.pontos[-1]):
                linhas.append(f'<circle cx="{p[0]:.1f}" cy="{p[1]:.1f}" r="{e.largura * 0.475:.1f}" fill="#221e24"/>')
    linhas.append("</svg>")
    with open(caminho, "w") as f:
        f.write("\n".join(linhas))


def gerar(pasta):
    os.makedirs(pasta, exist_ok=True)
    saidas = []
    for variante, nome in (("completo", "letreiro"), ("sinuca", "sinuca"), ("par-ou-impar", "par-ou-impar")):
        els, h = elementos(variante)
        for aceso in (True, False):
            sufixo = "acesa" if aceso else "apagada"
            base = os.path.join(pasta, f"{nome}-{sufixo}")
            rgba = render_aceso(els, LARGURA, h) if aceso else render_apagado(els, LARGURA, h)
            para_png(rgba, base + ".png")
            para_svg(els, LARGURA, h, aceso, base + ".svg")
            saidas.append((base, LARGURA, h))
    return saidas


if __name__ == "__main__":
    pasta = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "marca")
    for base, w, h in gerar(pasta):
        print(os.path.relpath(base), w, h)
