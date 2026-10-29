"""Coral: escamas de cobra-coral (vermelho, amarelo e preto) no antebraço.

A cobra-coral verdadeira tem anéis vermelho, amarelo, preto, amarelo, vermelho. Cada escama é uma peça lustrosa e
sobreposta (a de cima cobre a de trás, rumo ao rabo = cabo), com a ponta das vermelhas pintada de preto, um traço de brilho
e um furinho na ponta. A cor de cada escama vem da faixa em que ela cai, então a borda das faixas sai serrilhada como na cobra.

`blender -b --factory-startup --python coral.py -- [normal|raro|ambos]`
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cor as C  # noqa: E402
import desenho as D  # noqa: E402
from tela import Tela, argumentos  # noqa: E402

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SAIDA = os.path.join(RAIZ, "exportados")

# Paletas: (faixa A, faixa B, anel, faixa C): vermelho/preto separados por anéis amarelos.
PALETAS = {
    "normal": {
        "vermelho": C.rgb("#e0281c"),
        "preto": C.rgb("#16141b"),
        "anel": C.rgb("#f7de4c"),
        "ponta_preta": True,
    },
    # A rara: coral-de-giz, azul-cobalto no lugar do vermelho e o anel branco-osso.
    "raro": {
        "vermelho": C.rgb("#1f63d8"),
        "preto": C.rgb("#0d1018"),
        "anel": C.rgb("#eef0e4"),
        "ponta_preta": True,
    },
}

N_VOLTA = 24  # escamas em volta
FATOR_COMPRIMENTO = 1.62  # comprimento ÷ largura da escama
PASSO_FILA = 0.54  # passo entre fileiras ÷ comprimento (sobreposição de ~46%)

# Unidade que se repete, da ponta para o cabo (mm): vermelho, anel, preto, anel.
PADRAO = (("vermelho", 15.0), ("anel", 4.0), ("preto", 12.5), ("anel", 4.0))


def faixa_em(y, deslocamento=0.0):
    total = sum(m for _, m in PADRAO)
    t = (y + deslocamento) % total
    for nome, mm in PADRAO:
        if t < mm:
            return nome, t / mm
        t -= mm
    return PADRAO[-1][0], 1.0


def contorno_da_escama(w, L):
    """Escudo apontado para +y (o rabo): largo no terço de baixo, ponta arredondada."""
    pts = [(0.0, -0.50), (0.34, -0.40), (0.50, -0.12), (0.43, 0.17), (0.22, 0.40), (0.0, 0.50), (-0.22, 0.40), (-0.43, 0.17), (-0.50, -0.12), (-0.34, -0.40)]
    return D.suave([(x * w, y * L) for x, y in pts], True, 3)


def escama(t, rng, x, y, w, L, base, ponta_preta, brilho_forte):
    corpo = contorno_da_escama(w, L)
    c = D.mover(corpo, x, y)
    # sombra que a escama joga na de trás (para o rabo, +y) e fio escuro entre as escamas
    sombra = D.mover(D.expandir(corpo, 0.16 * w), x, y + 0.08 * L)
    t.poligono(sombra, (0.02, 0.02, 0.03), alfa=0.32)
    t.poligono(D.mover(D.expandir(corpo, 0.035 * w), x, y), (0.03, 0.03, 0.04))
    claro = C.claro(base, 0.22 if brilho_forte else 0.16)
    borda = C.escuro(base, 0.20)
    t.poligono(c, borda, centro=(x, y + 0.06 * L), cor_centro=claro)
    if ponta_preta:
        # a ponta preta esmaece para o vermelho: três camadas, cada uma menor e mais escura que a de baixo
        for y0, alfa in ((0.12 * L, 0.30), (0.22 * L, 0.45), (0.31 * L, 0.80)):
            topo = _ponta_preta(corpo, y0, 0.05 * L)
            if topo:
                t.poligono(D.mover(topo, x, y), C.rgb("#16141b"), alfa=alfa)
    # traço de brilho: uma gota clara perto do alto-esquerdo
    gx, gy = x - 0.12 * w, y + 0.02 * L
    glint = D.elipse(gx, gy, 0.075 * w, 0.28 * L, rot=0.18, n=14)
    t.poligono(glint, (1.0, 0.97, 0.9), alfa=0.0, centro=(gx, gy), cor_centro=(1.0, 0.97, 0.9), alfa_centro=0.42 if brilho_forte else 0.30)
    # furinho de ponta
    px, py = x + rng.uniform(-0.04, 0.04) * w, y + 0.37 * L
    t.poligono(D.elipse(px, py, 0.045 * w, 0.045 * w, n=8), C.escuro(base, 0.7), alfa=0.8)


def _ponta_preta(corpo, y0, fundo):
    """A parte do escudo acima de `y0`, fechada embaixo por um arco que desce `fundo` no meio (ponta preta da escama vermelha)."""
    cadeia = [p for p in corpo if p[1] >= y0]
    if len(cadeia) < 3:
        return None
    # `corpo` vai de baixo, sobe pela direita e desce pela esquerda: a cadeia acima de y0 é contígua se começar no 1º ponto alto
    i0 = next(i for i, p in enumerate(corpo) if p[1] >= y0 and corpo[i - 1][1] < y0)
    n = len(corpo)
    cadeia = []
    i = i0
    while corpo[i % n][1] >= y0:
        cadeia.append(corpo[i % n])
        i += 1
        if len(cadeia) > n:
            break
    a, b = cadeia[0], cadeia[-1]
    arco = [(a[0] + (b[0] - a[0]) * k / 6, y0 - fundo * math.sin(math.pi * k / 6)) for k in range(1, 6)]
    return cadeia + arco


def pintar(variante="normal", saida=None):
    pal = PALETAS[variante]
    t = Tela("coral-antebraco", "antebraco", modo="cor")
    rng = D.sorteio(11 if variante == "normal" else 23)
    # fundo: pele escura entre as escamas
    t.fundo((0.02, 0.02, 0.03))
    w = t.W / N_VOLTA
    L = w * FATOR_COMPRIMENTO
    passo = L * PASSO_FILA
    fileiras = int(t.H / passo) + 4
    # da ponta do rabo (cabo, em cima) para a cabeça (ponta, embaixo): a escama da frente cobre a de trás, então se pinta de cima para baixo
    for f in range(fileiras, -3, -1):
        y = f * passo
        for k in range(N_VOLTA):
            x = (k + (0.5 if f % 2 else 0.0)) * w + rng.uniform(-0.015, 0.015) * w
            nome, pos = faixa_em(y + rng.uniform(-0.4, 0.4))
            base = pal["anel"] if nome == "anel" else pal[nome]
            # cada escama varia um pouco no tom e no valor, como a pele de verdade
            h, s, v = C.hsv(base)
            base = C.de_hsv(h + rng.uniform(-0.008, 0.008), s + rng.uniform(-0.04, 0.03), v * rng.uniform(0.93, 1.06))
            ponta_preta = pal["ponta_preta"] and nome == "vermelho"
            escama(t, rng, x, y, w * 1.03, L, base, ponta_preta, brilho_forte=(nome != "preto"))
    if saida is None:
        saida = os.path.join(SAIDA, "coral-antebraco" + ("" if variante == "normal" else "-raro") + ".png")
    t.renderizar(saida)
    return saida


if __name__ == "__main__":
    a = argumentos()
    qual = a[0] if a else "ambos"
    caminho = a[1] if len(a) > 1 else None
    for v in (("normal", "raro") if qual == "ambos" else (qual,)):
        print("coral:", pintar(v, caminho if qual != "ambos" else None))
