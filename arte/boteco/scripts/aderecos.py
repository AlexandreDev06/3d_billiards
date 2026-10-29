"""Os adereços do boteco (P5/P6): balcão e o que tem em cima, cartazes e quadro de giz, fiação aparente, decoração e utensílios de mesa. Garrafas e prateleira estão em
`garrafas.py`; geladeiras, TV, estufa, filtro, porta de aço e engradados em `aparelhos.py`. Cada função recebe a `Cena` (`c`) e escreve nas malhas por material; o nível
de detalhe (`c.lod`: 0 baixo, 1 médio, 2 alto) decide o que entra e quantos segmentos têm as formas redondas. As medidas vêm de `const.py`.
"""
import math
import random
import zlib

import numpy as np

import garrafas
import geom
from const import (BALCAO, FOLGA, PISO, TETO, TOPO_BALCAO, VENT, X0, X1, Z0, Z1, quad_parede, sg, uv_cel)
from geom import I4, caixa, caixa_chanfrada, cilindro, disco, lathe, mat, quad, tubo
from garrafas import copo, garrafa, lata, prateleiras  # noqa: F401
from aparelhos import cervejeira, engradados, estufa, filtro_de_barro, freezer, geladeira, porta_de_aco, tv  # noqa: F401

# materiais de sinais (cada um é uma imagem em texturas/sinais/): nome -> (largura m, altura m)
SINAL_TAM = {
    "cartaz-dourada": (0.30, 0.43), "cartaz-serra-azul": (0.30, 0.43), "cartaz-rainha": (0.30, 0.43), "cartaz-bemtevi": (0.30, 0.43),
    "cartaz-chopp": (0.30, 0.43), "cartaz-campeonato": (0.30, 0.43), "cartaz-jogo": (0.62, 0.43), "sinal-fiado": (0.52, 0.26), "sinal-ficha": (0.62, 0.31),
    "cardapio": (0.40, 0.55), "calendario": (0.30, 0.42), "escudo": (0.38, 0.48), "bandeira-time": (0.80, 0.51),
}


_PAREDE = {  # lado -> (direção do `u` ao longo da parede, direção da profundidade para dentro da sala, onde a parede está)
    "z-": ((1, 0, 0), (0, 0, 1), ("z", Z0)), "z+": ((-1, 0, 0), (0, 0, -1), ("z", Z1)),
    "x-": ((0, 0, -1), (1, 0, 0), ("x", X0)), "x+": ((0, 0, 1), (-1, 0, 0), ("x", X1)),
}


def _ponto_na_parede(lado, s, y, ua, va, prof):
    """Ponto do jogo no cartaz: `ua`, `va` = deslocamentos (m) ao longo da parede e para cima, `prof` = afastamento da parede (m)."""
    du, dp, (eixo, pos) = _PAREDE[lado]
    p = np.zeros(3)
    if eixo == "z":
        p[0], p[2] = s + du[0] * ua, pos + dp[2] * prof
    else:
        p[2], p[0] = s + du[2] * ua, pos + dp[0] * prof
    p[1] = y + va
    return tuple(p)


def sinal(c, nome, lado, s, y, e=0.010):
    """Pendura o sinal `nome` na parede: papel com leve barriga (a ponta de baixo se afasta), um canto levantado, tachinhas de plástico nos cantos de cima (a fita está pintada na
    textura); o material é o próprio nome (textura em `texturas/sinais/`, no atlas dos cartazes)."""
    w, h = SINAL_TAM[nome]
    from cena import MATERIAIS
    MATERIAIS.setdefault("sinal:" + nome, dict(c="a", dest="assado", dens=3.0, dest_med="cartazes", dens_med=(1.0, 1.0), tex="sinais/" + nome + ".jpg", rug=0.55))
    with c.objeto(f"sinal-{nome}"):
        m = c.m("sinal:" + nome)
        if c.lod == 0:
            quad_parede(c, m, lado, s, y, w, h, e=e)
            return
        rng = random.Random(zlib.crc32(nome.encode()))
        folha = nome in ("sinal-fiado", "sinal-ficha")   # as placas de esmalte não encurvam
        canto = None if folha else rng.choice([None, "bd", "be", "bd"])
        barriga = 0.0 if folha else rng.uniform(0.006, 0.014)
        rad = rng.uniform(0.07, 0.12)

        def fn(u, v):
            prof = e + 0.001
            if not folha:
                prof += barriga * (1 - v) ** 1.7 * (0.55 + 0.45 * math.sin(math.pi * u)) + 0.0025 * math.sin(math.pi * u) * math.sin(math.pi * v)
                if canto:
                    cu = u if canto.endswith("e") else 1 - u
                    cv = 1 - v
                    d_ = math.hypot(cu * w, cv * h)
                    prof += 0.028 * max(0.0, 1 - d_ / rad) ** 2
            return _ponto_na_parede(lado, s, y, (u - 0.5) * w, (v - 0.5) * h, prof)

        geom.superficie(m, I4, fn, sg(c, 1, 4, 8), sg(c, 1, 5, 10))
        for k, cor in ((-1, "plastico-vermelho"), (1, "plastico-azul")):   # tachinhas nos cantos de cima
            if rng.random() < 0.5 and not folha:
                continue
            ua = k * w * 0.45
            p0 = _ponto_na_parede(lado, s, y, ua, h / 2 - h * 0.035, e + 0.001)
            ang = {"z-": 0, "z+": 180, "x-": 90, "x+": -90}[lado]
            lathe(c.m(cor), mat(p0, yaw=ang, rx=90), [(0.0, 0.0), (0.0075, 0.0, "duro"), (0.0072, 0.0022), (0.0035, 0.0038), (0.0, 0.0041)], sg(c, 5, 6, 8))


def esfera(m, T, r, seg=10, aneis=6):
    pts = [(r * math.sin(math.pi * k / aneis), -r * math.cos(math.pi * k / aneis)) for k in range(aneis + 1)]
    lathe(m, T, [(max(p[0], 0.0), p[1]) for p in pts], seg)


# garrafas, latas, copos e a prateleira: `garrafas.py`


# ------------------------------------------------------------------ balcão
def balcao(c):
    L = c.lod
    b = BALCAO
    cx, cz = (b["x0"] + b["x1"]) / 2, (b["z0"] + b["z1"]) / 2
    sx, sz = b["x1"] - b["x0"], b["z1"] - b["z0"]
    with c.objeto("balcao"):
        mm = c.m("madeira")
        corpo = (sx - 0.02, b["alt"] - 0.06, sz)
        caixa(c.m("formica"), mat((cx, PISO + (b["alt"] - 0.06) / 2, cz)), corpo, esc=1.0)
        top = (sx + 0.14, 0.05, sz + 0.08)
        tp = mat((cx + 0.07, PISO + b["alt"] - 0.025, cz))
        if L >= 1:
            caixa_chanfrada(mm, tp, top, 0.012, esc=1.0)
        else:
            caixa(mm, tp, top, esc=1.0)
        if L >= 1:  # ripas da frente, rodapé de ferro, apoio de pé cromado
            n = sg(c, 5, 5, 9)
            for i in range(n):
                z = b["z0"] + (i + 0.5) * sz / n
                caixa(mm, mat((b["x1"] + 0.006, PISO + 0.55, z)), (0.016, 0.8, sz / n - 0.1), esc=1.0)
            caixa(c.m("ferro"), mat((b["x1"] + 0.03, PISO + 0.04, cz)), (0.06, 0.08, sz))
            ro = c.m("cromado")
            if L == 2:
                tubo(ro, I4, [(b["x1"] + 0.1, PISO + 0.22, b["z0"] + 0.15), (b["x1"] + 0.1, PISO + 0.22, b["z1"] - 0.1)], 0.026, 10)
                for z in np.linspace(b["z0"] + 0.4, b["z1"] - 0.3, 6):
                    tubo(ro, I4, [(b["x1"] + 0.03, PISO + 0.22, z), (b["x1"] + 0.1, PISO + 0.22, z)], 0.014, 6)
            else:
                caixa(ro, mat((b["x1"] + 0.1, PISO + 0.22, cz)), (0.04, 0.04, sz - 0.25))
    balcao_em_cima(c)


def balcao_em_cima(c):
    """Tudo que está sobre o balcão: caixa registradora, estufa de salgados, copos, chopeira, potes, filtro de barro, utensílios."""
    L = c.lod
    ty = TOPO_BALCAO
    with c.objeto("caixa-registradora"):
        z = -2.55
        fe = c.m("ferro")
        if L == 0:
            caixa(fe, mat((-3.57, ty + 0.1, z)), (0.34, 0.2, 0.4))
        else:
            caixa_chanfrada(fe, mat((-3.57, ty + 0.09, z)), (0.34, 0.18, 0.4), 0.02)
            caixa(fe, mat((-3.62, ty + 0.235, z), rz=-28), (0.17, 0.12, 0.3))
            caixa(c.m("plastico-branco"), mat((-3.55, ty + 0.185, z - 0.17)), (0.14, 0.015, 0.14), esc=1.0)
            if L == 2:
                caixa(c.m("cromado"), mat((-3.46, ty + 0.045, z)), (0.012, 0.045, 0.3))
    estufa(c, -3.58, -1.75)
    # copos de cabeça para baixo num pano (tecido branco) e uma garrafa térmica
    if L >= 1:
        with c.objeto("copos"):
            pano = c.m("plastico-branco")
            caixa(pano, mat((-3.55, ty + 0.004, -0.95)), (0.3, 0.008, 0.38), esc=1.0)
            n = 6 if L == 2 else 4
            for i in range(n):
                copo(c, -3.5 + 0.075 * (i % 2) - 0.04, ty + 0.008, -1.08 + 0.085 * (i // 2) - 0.02 + (0.085 if n == 4 else 0), de_cabeca=True)
        with c.objeto("garrafa-termica"):
            vm = c.m("plastico-vermelho")
            lathe(vm, mat((-3.6, ty, -3.0)), [(0, 0), (0.05, 0, "duro"), (0.055, 0.02), (0.055, 0.3), (0.045, 0.34), (0.03, 0.345), (0, 0.345)], sg(c, 6, 10, 14))
            lathe(c.m("ferro"), mat((-3.6, ty + 0.34, -3.0)), [(0.03, 0), (0.03, 0.03), (0.0, 0.03)], 8)
    if L >= 1:
        with c.objeto("pote-de-ovos"):   # vidro de ovos de codorna em conserva
            lathe(c.m("vidro-claro"), mat((-3.55, ty, 0.25)), [(0, 0), (0.07, 0, "duro"), (0.075, 0.03), (0.075, 0.2), (0.06, 0.22), (0.058, 0.235), (0, 0.235)], sg(c, 6, 10, 14))
            lathe(c.m("tampa"), mat((-3.55, ty + 0.235, 0.25)), [(0.062, 0), (0.062, 0.025), (0, 0.025)], 8)
            if L == 2:
                rr = c.rng
                for _ in range(16):
                    r_ = rr.uniform(0.0, 0.05)
                    a = rr.uniform(0, 6.28)
                    esfera(c.m("ovo"), mat((-3.55 + r_ * math.cos(a), ty + rr.uniform(0.04, 0.18), 0.25 + r_ * math.sin(a))), 0.016, 8, 5)
        with c.objeto("vidro-de-balas"):
            lathe(c.m("vidro-claro"), mat((-3.5, ty, 0.5)), [(0, 0), (0.06, 0, "duro"), (0.07, 0.04), (0.07, 0.16), (0.05, 0.19), (0.05, 0.2), (0, 0.2)], sg(c, 6, 8, 14))
            if L == 2:
                rr = c.rng
                for _ in range(14):
                    esfera(c.m(("plastico-vermelho", "tampa", "plastico-branco")[rr.randrange(3)]),
                           mat((-3.5 + rr.uniform(-0.04, 0.04), ty + rr.uniform(0.02, 0.1), 0.5 + rr.uniform(-0.04, 0.04))), 0.012, 6, 4)
    filtro_de_barro(c, -3.6, 0.72)
    utensilios_de_balcao(c)
    with c.objeto("chopeira"):
        if L >= 1:
            cr = c.m("cromado")
            T = mat((-3.46, ty, -0.1))
            lathe(cr, T, [(0, 0), (0.05, 0, "duro"), (0.045, 0.03), (0.032, 0.3), (0.036, 0.34), (0, 0.34)], sg(c, 8, 10, 16))
            for dz in (-1, 1):
                tubo(cr, I4, [(-3.46 + 0.02, ty + 0.25, -0.1 + dz * 0.01), (-3.46 + 0.1, ty + 0.25, -0.1 + dz * 0.04), (-3.46 + 0.1, ty + 0.2, -0.1 + dz * 0.04)], 0.009, 6)
            caixa(c.m("tampa"), mat((-3.46, ty + 0.01, -0.1)), (0.02, 0.02, 0.2), esc=1.0)


def utensilios_de_balcao(c):
    if c.lod == 0:
        return
    ty = TOPO_BALCAO
    with c.objeto("cinzeiros-do-balcao"):
        for z in (-1.35, -0.4):
            cinzeiro(c, -3.38, ty, z)
    with c.objeto("paliteiros-do-balcao"):
        paliteiro(c, -3.4, ty, -1.28)
        guardanapos(c, -3.42, ty, -0.32)
        saleiro(c, -3.4, ty, 0.05)


def cinzeiro(c, x, y, z):
    L = c.lod
    lathe(c.m("inox"), mat((x, y, z)), [(0, 0), (0.055, 0, "duro"), (0.065, 0.012), (0.07, 0.03), (0.062, 0.03, "duro"), (0.055, 0.012), (0, 0.01)], sg(c, 6, 10, 16))
    if L == 2:
        for k in range(2):
            cilindro(c.m("plastico-branco"), mat((x + 0.02 * k, y + 0.012, z + 0.015 - 0.03 * k), yaw=40 * k, rz=90), 0.004, 0.035, 6, tampas=False)
            cilindro(c.m("ferro"), mat((x + 0.02 * k + 0.001, y + 0.012, z + 0.015 - 0.03 * k), yaw=40 * k, rz=90), 0.0042, 0.006, 6, tampas=False)


def paliteiro(c, x, y, z):
    lathe(c.m("plastico-vermelho"), mat((x, y, z)), [(0, 0), (0.022, 0, "duro"), (0.024, 0.02), (0.022, 0.07), (0.018, 0.07), (0, 0.065)], sg(c, 5, 8, 12))
    if c.lod == 2:
        for k in range(14):
            a = 2 * math.pi * k / 14
            r = 0.01 * (1 + (k % 3) * 0.3)
            tubo(c.m("madeira-clara"), I4, [(x + r * math.cos(a), y + 0.06, z + r * math.sin(a)), (x + r * math.cos(a) * 1.6, y + 0.098, z + r * math.sin(a) * 1.6)], 0.0012, 3, tampas=False)


def guardanapos(c, x, y, z):
    caixa(c.m("inox"), mat((x, y + 0.045, z)), (0.1, 0.09, 0.15), esc=1.0)
    if c.lod >= 1:
        caixa(c.m("plastico-branco"), mat((x, y + 0.1, z)), (0.085, 0.03, 0.12), esc=1.0)


def saleiro(c, x, y, z):
    lathe(c.m("vidro-claro"), mat((x, y, z)), [(0, 0), (0.022, 0, "duro"), (0.024, 0.02), (0.02, 0.06), (0.022, 0.07), (0, 0.075)], sg(c, 5, 8, 12))
    lathe(c.m("cromado"), mat((x, y + 0.07, z)), [(0.022, 0), (0.022, 0.015), (0, 0.02)], 8)


# ------------------------------------------------------------------ fiação aparente, lâmpadas, interruptores
def _arco(cx, cy, R, ang):
    """Pontos (x, y) de um círculo de centro (cx, cy) e raio R nos ângulos `ang` (graus): as dobras do cabo."""
    return [(cx + R * math.cos(math.radians(a)), cy + R * math.sin(math.radians(a))) for a in ang]


def _cabo_pendurado(m, x_ini, y_ini, z_ini, sentido, x_cai, y_piso, z_faixa, r, rodape_ferro_x, seg=8, ate=None):
    """Cabo que sai de um plugue, dobra para baixo (raio 3 cm), cai quase colado à parede, dobra de novo ao pousar no piso e corre rente ao rodapé até `rodape_ferro_x`.
    `sentido` = -1 sai para -x, +1 para +x, 0 já sai para baixo; `x_cai` = x da queda; a queda se encosta na parede aos poucos (z de `z_ini` para `z_faixa`).
    Devolve nada: escreve o tubo em `m` (uma malha só, de ponta a ponta, sem emenda)."""
    R = 0.03
    yo = y_ini
    pts = []
    if sentido:
        pts += [(x, y) for x, y in _arco(x_ini, yo - R, R, (90, 60, 30, 0) if sentido > 0 else (90, 120, 150, 180))]
        y_top = yo - R
    else:
        pts += [(x_ini, yo)]
        y_top = yo
    y_arco = y_piso + r + R                       # onde começa a dobra do piso
    n_meio = max(1, int((y_top - y_arco) / 0.07))
    for k in range(1, n_meio + 1):
        pts.append((x_cai, y_top + (y_arco - y_top) * k / (n_meio + 1)))
    pts += _arco(x_cai - R, y_arco, R, (0, -30, -60, -90))
    # z: o cabo sai em `z_ini` e vai para a faixa do piso suavemente (smoothstep em y), sem inclinar mais que uns graus
    y_a, y_b = y_top, y_piso + 0.05
    curva = []
    for x, y in pts:
        t = min(1.0, max(0.0, (y_a - y) / (y_a - y_b)))
        curva.append((x, y, z_ini + (z_faixa - z_ini) * t * t * (3 - 2 * t)))
    reta = [(x, y_piso + r, z_faixa) for x in ate]
    tubo(m, I4, geom.spline(curva, 2) + reta, r, seg, tampas=False)


def _tomada_com_benjamim(c):
    """A tomada do alto da parede -z (x -3,0 m, 0,3 m acima do piso) com um benjamim de três saídas: um carregador branco para a esquerda, um plugue para a direita e outro
    para baixo. Cada cabo sai do corpo do plugue, dobra para baixo (raio 3 cm), cai por gravidade perto da parede (nada cruza o ar), pousa no piso (raio 3,5 a 4,5 mm) e corre
    rente ao rodapé (0,014 m) em três faixas lado a lado até o rodapé de ferro do balcão (x -3,30 a -3,24), onde some. A 1,64 m da mesa, fora da folga."""
    xo, yo = -3.0, PISO + 0.3
    zc = Z0 + 0.0425                     # o meio do benjamim em z
    rod = Z0 + 0.014                     # a frente do rodapé de parede
    pb, br, pp = c.m("plastico-branco"), c.m("borracha"), c.m("plastico-preto")
    caixa(pb, mat((xo, yo, Z0 + 0.015)), (0.08, 0.08, 0.02))                        # espelho da tomada
    caixa_chanfrada(pb, mat((xo, yo, zc)), (0.075, 0.055, 0.035), 0.004, esc=1.0)     # benjamim
    # esquerda: carregador de celular (corpo branco; o cabo fino sai pela ponta)
    caixa_chanfrada(pb, mat((xo - 0.0625, yo, zc)), (0.05, 0.034, 0.034), 0.005, esc=1.0)
    # direita: plugue preto com a capa de borracha afunilada
    caixa_chanfrada(pp, mat((xo + 0.0575, yo, zc)), (0.04, 0.036, 0.036), 0.005, esc=1.0)
    tubo(br, I4, [(xo + 0.0775, yo, zc), (xo + 0.0975, yo, zc)], [0.0075, 0.0048], 8, tampas=False)
    # baixo: plugue preto virado para o piso
    caixa_chanfrada(pp, mat((xo, yo - 0.0475, zc)), (0.036, 0.04, 0.036), 0.005, esc=1.0)
    tubo(br, I4, [(xo, yo - 0.0675, zc), (xo, yo - 0.0875, zc)], [0.0075, 0.0048], 8, tampas=False)
    # as três faixas do piso (z do centro de cada cabo): a de trás encosta no rodapé, a do meio e a da frente ficam a 1,4 cm uma da outra
    r_e, r_d, r_b = 0.0035, 0.0045, 0.0042
    z_e, z_d, z_b = rod + r_e, rod + 0.0145 + r_d + 0.001, rod + 0.0145 + 0.0135 + r_b + 0.001
    _cabo_pendurado(pb, xo - 0.0875, yo, zc, -1, xo - 0.1175, PISO, z_e, r_e, -3.27, ate=(-3.19, -3.27))
    _cabo_pendurado(br, xo + 0.0975, yo, zc, +1, xo + 0.1275, PISO, z_d, r_d, -3.27, ate=(-2.95, -3.1, -3.2, -3.27))
    _cabo_pendurado(br, xo, yo - 0.0875, zc, 0, xo, PISO, z_b, r_b, -3.27, ate=(-3.1, -3.2, -3.27))


def fiacao(c):
    """Fios pretos presos no forro e nas paredes, canaleta, caixas de luz, tomadas com benjamim e as lâmpadas pendentes (com soquete e cabo)."""
    L = c.lod
    if L == 0:
        return
    pr = c.m("borracha")
    fe = c.m("ferro")
    with c.objeto("fiacao*"):
        # fio principal: caixa de luz na parede -z (-4.5), ao longo do forro até o meio, desce às lâmpadas do balcão
        caminhos = [
            [(-4.6, TETO - 0.05, Z0 + 0.02), (-4.0, TETO - 0.04, Z0 + 0.03), (-2.5, TETO - 0.04, Z0 + 0.05), (-0.8, TETO - 0.05, -2.4), (-0.3, TETO - 0.05, -0.6)],
            [(-3.58, TETO - 0.04, -2.5), (-3.58, TETO - 0.045, 0.2), (-3.2, TETO - 0.045, 0.9)],
            [(-0.3, TETO - 0.05, -0.6), (0.0, TETO - 0.06, -0.3), (0.55, TETO - 0.06, 0.0)],
            [(X0 + 0.03, 1.6, 2.1), (X0 + 0.03, 2.4, 2.1), (X0 + 0.03, TETO - 0.04, 1.9), (-1.0, TETO - 0.04, 1.9)],
            [(1.0, TETO - 0.04, Z0 + 0.06), (2.8, TETO - 0.05, Z0 + 0.05), (4.4, TETO - 0.04, Z0 + 0.08), (X1 - 0.05, TETO - 0.05, -2.0)],
        ]
        for caminho in caminhos:
            pts = []
            for a, b in zip(caminho[:-1], caminho[1:]):
                for k in range(0, 5 if L == 2 else 2):
                    t = k / (5 if L == 2 else 2)
                    sag = 0.05 * math.sin(math.pi * t)
                    pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag, a[2] + (b[2] - a[2]) * t))
            pts.append(caminho[-1])
            tubo(pr, I4, pts, 0.004, sg(c, 3, 4, 5), tampas=False)
        # canaleta de PVC branca descendo até o interruptor, no pilar da parede x+
        caixa(c.m("plastico-branco"), mat((X1 - 0.02, PISO + 1.1, -3.05)), (0.025, 2.0, 0.025), esc=1.0)
        # caixas de luz (emendas) no teto e interruptores
        for (x, z) in ((-4.6, Z0 + 0.03), (-0.3, -0.6), (0.55, 0.0)):
            caixa(c.m("plastico-branco"), mat((x, TETO - 0.025, z)), (0.08, 0.05, 0.08), esc=1.0)
        for (lado, s, y) in (("x+", -3.05, 0.3), ("z-", 4.8, 0.35), ("x-", 0.82, 0.4)):
            if lado == "x+":
                caixa(c.m("plastico-branco"), mat((X1 - 0.015, y, s)), (0.02, 0.1, 0.07), esc=1.0)
                caixa(c.m("ferro"), mat((X1 - 0.026, y, s)), (0.006, 0.05, 0.03)) if L == 2 else None
            elif lado == "z-":
                caixa(c.m("plastico-branco"), mat((s, y, Z0 + 0.015)), (0.07, 0.1, 0.02), esc=1.0)
            else:
                caixa(c.m("plastico-branco"), mat((X0 + 0.015, y, s)), (0.02, 0.1, 0.07), esc=1.0)
        # tomada com benjamim, um carregador e dois plugues, ao lado do caixa; os cabos caem pela parede, encostam no piso e correm junto ao rodapé até sumirem no
        # rodapé de ferro do balcão (P6b)
        if L == 2:
            _tomada_com_benjamim(c)
    # lâmpadas pendentes sobre o balcão e uma sobre a mesa do fundo (cabo, soquete e bulbo aceso)
    with c.objeto("pendentes"):
        for (x, z) in ((-3.58, -2.5), (-3.58, -1.4), (-3.58, -0.3), (3.7, -2.4)) if L == 2 else ((-3.58, -2.5), (-3.58, -1.4), (-3.58, -0.3)):
            yb = 1.35 if x < 0 else 1.55
            pts = [(x, TETO - 0.04, z), (x + 0.0, TETO - 0.5, z), (x, yb + 0.1, z)]
            tubo(pr, I4, pts, 0.003, 4, tampas=False)
            cilindro(c.m("ferro"), mat((x, yb + 0.05, z)), 0.017, 0.05, sg(c, 4, 6, 10))
            if L == 2:
                lathe(c.m("lampada"), mat((x, yb - 0.03, z)), [(0.0, -0.01), (0.02, 0.0), (0.038, 0.035), (0.036, 0.07), (0.022, 0.1), (0.017, 0.12), (0.0, 0.12)], 12)
            else:
                lathe(c.m("lampada"), mat((x, yb - 0.03, z)), [(0.0, -0.01), (0.038, 0.035), (0.017, 0.12), (0.0, 0.12)], 6)


# ------------------------------------------------------------------ cartazes, quadro, bandeira, relógio
def murais(c):
    L = c.lod
    cx, cy = -1.6, 0.8
    w, h = 1.5, 1.0
    with c.objeto("quadro-de-giz"):
        qz = Z0 + 0.04
        quad(c.m("quadro"), I4, (cx - w / 2, cy - h / 2, qz), (cx + w / 2, cy - h / 2, qz), (cx + w / 2, cy + h / 2, qz), (cx - w / 2, cy + h / 2, qz), (0, 0), (1, 0), (1, 1), (0, 1))
        if L >= 1:
            mm = c.m("madeira-clara")
            f = 0.06
            sub = caixa_chanfrada if L == 2 else (lambda m_, T_, t_, c_, esc=1.0: caixa(m_, T_, t_, esc=esc))
            sub(mm, mat((cx, cy + h / 2 + f / 2, Z0 + 0.027)), (w + 2 * f, f, 0.054), 0.008, esc=1.0)
            sub(mm, mat((cx, cy - h / 2 - f / 2, Z0 + 0.027)), (w + 2 * f, f, 0.054), 0.008, esc=1.0)
            for s_ in (-1, 1):
                sub(mm, mat((cx + s_ * (w / 2 + f / 2), cy, Z0 + 0.027)), (f, h, 0.054), 0.008, esc=1.0)
            # bandeja do giz, com a frente alta, o giz e o apagador
            sub(mm, mat((cx, cy - h / 2 - f - 0.012, Z0 + 0.06)), (w * 0.92, 0.024, 0.11), 0.005, esc=1.0)
            caixa(mm, mat((cx, cy - h / 2 - f + 0.004, Z0 + 0.112)), (w * 0.92, 0.03, 0.012), esc=1.0)
            if L == 2:
                for k, (dx, cor) in enumerate(((-0.42, "plastico-branco"), (-0.37, "plastico-branco"), (-0.33, "salgado"))):
                    cilindro(c.m(cor), mat((cx + dx, cy - h / 2 - f + 0.001, Z0 + 0.06 + 0.012 * k), rz=90, yaw=20 * k), 0.0065, 0.075, 8, tampas=True)
                caixa(c.m("madeira-clara"), mat((cx + 0.35, cy - h / 2 - f + 0.031, Z0 + 0.06), yaw=8), (0.13, 0.03, 0.055), esc=1.0)
                caixa(c.m("borracha"), mat((cx + 0.35, cy - h / 2 - f + 0.052, Z0 + 0.06), yaw=8), (0.13, 0.015, 0.055), esc=1.0)
    # cartazes
    z_ = [("cartaz-dourada", "z-", 0.45, 0.95), ("cartaz-serra-azul", "z-", 0.9, 0.95), ("cartaz-rainha", "z-", 1.35, 0.95), ("cartaz-campeonato", "z-", 1.8, 0.95),
          ("sinal-ficha", "z-", -0.05, 1.7), ("calendario", "z-", -3.0, 1.25), ("bandeira-time", "z-", 2.7, 0.9),
          ("escudo", "z+", 1.45, 1.1), ("cartaz-chopp", "z+", 3.5, 0.95), ("cartaz-bemtevi", "z+", 4.2, 0.95), ("cartaz-jogo", "z+", -2.6, 1.0),
          ("sinal-fiado", "x+", 0.95, 1.5), ("cardapio", "x+", -2.7, 1.0)]
    if L == 0:
        z_ = [s for s in z_ if s[0] in ("cartaz-dourada", "cartaz-serra-azul", "bandeira-time", "escudo", "sinal-fiado", "calendario")]
    for nome, lado, s, y in z_:
        sinal(c, nome, lado, s, y)


def decoracao(c):
    L = c.lod
    if L == 0:
        return
    m = c.m("decoracao")
    centros = [(0.125, 0.875), (0.375, 0.875), (0.125, 0.625), (0.375, 0.625)]
    for ic, (zc, yc) in enumerate(((-2.3, 2.12), (1.0, 2.18))):
        with c.objeto(f"bandeirinhas#{ic}"):
            n = 24 if L == 2 else 12
            xa, xb = -1.9, 4.85
            xs = np.linspace(xa, xb, n * 2 + 1)
            corda = [(x, yc + 0.2 - 0.34 * (1 - ((x - (xa + xb) / 2) / ((xb - xa) / 2)) ** 2), zc) for x in xs]
            tubo(c.m("ferro"), I4, corda, 0.003, 3, tampas=False)
            for i in range(n):
                p0, p1 = corda[2 * i], corda[2 * i + 2]
                ap = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.2, zc)
                uv = centros[(i + ic) % 4]
                m.add(I4, [p0, p1, ap], [(0, 0, 1)] * 3, [uv] * 3, [(0, 2, 1)])    # a frente (+z): o giro da face acompanha a normal
                m.add(I4, [p0, p1, ap], [(0, 0, -1)] * 3, [uv] * 3, [(0, 1, 2)])   # o verso: cada lado assa a sua luz
    with c.objeto("relogio"):
        T = mat((X0 + 0.03, 1.9, 1.55), rz=-90)
        disco(m, T, 0.17, sg(c, 8, 12, 24), (0.75, 0.75), 0.235, y=0.0)
        if L == 2:
            tubo(c.m("ferro"), I4, geom.anel(X0 + 0.028, 1.9, 1.55, 0.172, 24, plano="yz"), 0.01, 6, fechado=True)
    # taqueira na parede -z
    with c.objeto("taqueira"):
        mm = c.m("madeira")
        cx = 3.65
        caixa(mm, mat((cx, PISO + 0.95, Z0 + 0.06)), (0.74, 0.09, 0.1), esc=1.0)
        caixa(mm, mat((cx, PISO + 1.75, Z0 + 0.04)), (0.74, 0.05, 0.07), esc=1.0)
        for k in range(6):
            x = cx - 0.3 + k * 0.12
            cilindro(c.m("madeira-clara"), mat((x, PISO + 1.0, Z0 + 0.075)), 0.0145, 1.42, sg(c, 4, 6, 10), tampas=(L == 2), r_topo=0.006)
    # garrafas e copos nas mesinhas (alto e médio)
    if L >= 1:
        for i, (x, z, yaw) in enumerate(((-0.5, 2.84, 20), (-0.72, 2.7, -10), (3.62, -2.71, 40))):
            with c.objeto(f"garrafa-da-mesinha#{i}"):
                garrafa(c, "cerveja" if i % 2 == 0 else "litrao", x, PISO + 0.718, z, yaw, "cerveja" if i != 1 else "serra", perto=True)
        for i, (x, z) in enumerate(((-0.62, 2.96), (3.82, -2.88), (-0.45, 2.62))):
            with c.objeto(f"copo-da-mesinha#{i}"):
                copo(c, x, PISO + 0.718, z, cheio=(0.8, 0.0, 0.55)[i], espuma=(i != 1))
        for i, (x, z) in enumerate(((-0.5, 2.62), (3.62, -2.9))):
            with c.objeto(f"cinzeiro-da-mesinha#{i}"):
                cinzeiro(c, x, PISO + 0.718, z)
        for i, (x, z) in enumerate(((-0.8, 2.92), (3.88, -2.6))):
            with c.objeto(f"utensilios-da-mesinha#{i}"):
                paliteiro(c, x, PISO + 0.718, z)
                guardanapos(c, x + 0.1, PISO + 0.718, z + 0.02)


# ------------------------------------------------------------------ cantinhos: o que sobrou de boteco real (extintor, botijão, vassoura, planta, split, caixa de som, lixeira)
def folha_espada(c, base, direcao, comp, larg, pontas):
    """Uma folha de espada-de-são-jorge: faixa que afina até a ponta, dupla face (cada lado assa a sua luz). `direcao` unitária (sobe e abre)."""
    m = c.m("folha")
    b = np.array(base, float)
    d = np.array(direcao, float)
    d /= np.linalg.norm(d)
    lado = np.cross(d, (0, 1, 0))
    lado = lado / (np.linalg.norm(lado) or 1.0)
    pts = [b - lado * larg * 0.55, b + lado * larg * 0.55]
    for t, w in ((0.35, 1.0), (0.7, 0.8)):
        centro = b + d * comp * t + np.array((0, -0.18 * comp * t * t, 0))
        pts += [centro - lado * larg * w * 0.5, centro + lado * larg * w * 0.5]
    pts.append(b + d * comp + np.array((0, -0.12 * comp, 0)))
    P = np.array(pts)
    F = [(0, 1, 3), (0, 3, 2), (2, 3, 5), (2, 5, 4), (4, 5, 6)]
    # normal da frente: do giro do primeiro triângulo; o verso usa o inverso
    n = np.cross(P[1] - P[0], P[3] - P[0])
    n /= np.linalg.norm(n)
    uv = [(0.5, 0.5)] * len(P)
    m.add(I4, P, [n] * len(P), uv, F)
    m.add(I4, P, [-n] * len(P), uv, [(a, cc, bb) for a, bb, cc in F])


def cantinhos(c):
    L = c.lod
    # extintor na parede leste, entre o freezer e os engradados
    with c.objeto("extintor"):
        x, z, y0 = X1 - 0.1, 1.93, PISO + 0.42
        lathe(c.m("plastico-vermelho"), mat((x, y0, z)), [(0, 0), (0.07, 0, "duro"), (0.075, 0.03), (0.075, 0.34), (0.055, 0.41), (0.03, 0.44), (0, 0.44)], sg(c, 6, 10, 16))
        cilindro(c.m("cromado"), mat((x, y0 + 0.43, z)), 0.022, 0.06, sg(c, 5, 6, 8))
        caixa(c.m("plastico-preto"), mat((x - 0.025, y0 + 0.5, z)), (0.11, 0.02, 0.025))
        caixa(c.m("ferro"), mat((X1 - 0.015, y0 + 0.3, z)), (0.03, 0.04, 0.17))   # braçadeira
        if L >= 1:
            tubo(c.m("plastico-preto"), I4, [(x - 0.02, y0 + 0.47, z + 0.02), (x - 0.09, y0 + 0.4, z + 0.07), (x - 0.095, y0 + 0.2, z + 0.075), (x - 0.04, y0 + 0.1, z + 0.05)], 0.008, sg(c, 3, 5, 6), tampas=False)
        caixa(c.m("plastico-vermelho"), mat((X1 - 0.008, y0 + 0.98, z)), (0.012, 0.22, 0.22))   # placa
        caixa(c.m("plastico-branco"), mat((X1 - 0.016, y0 + 0.98, z)), (0.004, 0.12, 0.12))
    # botijão de gás ao lado da geladeira
    with c.objeto("botijao"):
        x, z = X0 + 0.38, 0.86
        lathe(c.m("plastico-azul"), mat((x, PISO, z)), [(0, 0), (0.12, 0, "duro"), (0.15, 0.03), (0.157, 0.09), (0.157, 0.25), (0.14, 0.32), (0.09, 0.355), (0.05, 0.37, "duro"), (0.05, 0.4), (0, 0.4)], sg(c, 8, 12, 18))
        if L >= 1:
            lathe(c.m("ferro"), mat((x, PISO + 0.365, z)), [(0.1, 0), (0.1, 0.02), (0.085, 0.07), (0.07, 0.07), (0.07, 0)], sg(c, 6, 8, 12))   # coroa de proteção
            cilindro(c.m("cromado"), mat((x, PISO + 0.4, z)), 0.018, 0.04, 6)
            lathe(c.m("ferro"), mat((x, PISO, z)), [(0.13, 0), (0.13, 0.02), (0.115, 0.02), (0.115, 0)], sg(c, 8, 12, 18))     # pé
    # vassoura, rodo e balde no canto do fundo, à direita
    with c.objeto("limpeza"):
        xw = X1 - 0.06
        cilindro(c.m("madeira-clara"), mat((xw - 0.12, PISO, -3.0), rz=-6), 0.012, 1.45, sg(c, 4, 5, 8))
        caixa(c.m("plastico-preto"), mat((xw - 0.075, PISO + 0.05, -3.0), rz=-6), (0.05, 0.1, 0.3))
        cilindro(c.m("madeira-clara"), mat((xw - 0.1, PISO, -2.82), rz=-5), 0.011, 1.35, sg(c, 4, 5, 8))
        caixa(c.m("ferro"), mat((xw - 0.07, PISO + 0.03, -2.82), rz=-5), (0.025, 0.04, 0.42))
        caixa(c.m("borracha"), mat((xw - 0.055, PISO + 0.012, -2.82), rz=-5), (0.02, 0.02, 0.42))
        lathe(c.m("plastico-preto"), mat((xw - 0.12, PISO, -2.45)), [(0, 0), (0.1, 0, "duro"), (0.14, 0.26), (0.15, 0.27), (0.138, 0.27, "duro"), (0.0, 0.05)], sg(c, 8, 12, 16))
    # planta num vaso, no fundo
    with c.objeto("planta"):
        x, z = 1.9, -2.98
        lathe(c.m("ceramica"), mat((x, PISO, z)), [(0, 0), (0.1, 0, "duro"), (0.16, 0.26), (0.175, 0.3), (0.15, 0.3, "duro"), (0.0, 0.25)], sg(c, 8, 12, 18))
        n = sg(c, 6, 9, 14)
        for k in range(n):
            a = 2 * math.pi * k / n + 0.4
            sob = 0.55 + 0.35 * ((k * 7) % 5) / 4
            d = (math.cos(a) * (0.35 + 0.15 * (k % 3)), 1.0, math.sin(a) * (0.35 + 0.15 * (k % 3)))
            folha_espada(c, (x + math.cos(a) * 0.04, PISO + 0.28, z + math.sin(a) * 0.04), d, 0.55 + 0.45 * sob, 0.085, 0)
    # ar-condicionado split alto na parede da janela, caixa de som alta na parede leste
    with c.objeto("split"):
        x, y = 3.3, PISO + 2.8
        if L >= 1:
            caixa_chanfrada(c.m("geladeira"), mat((x, y, Z1 - 0.11)), (0.95, 0.3, 0.22), 0.03)
        else:
            caixa(c.m("geladeira"), mat((x, y, Z1 - 0.11)), (0.95, 0.3, 0.22))
        caixa(c.m("plastico-preto"), mat((x, y - 0.12, Z1 - 0.22)), (0.84, 0.025, 0.012))
        if L >= 1:
            caixa(c.m("cromado"), mat((x + 0.38, y + 0.03, Z1 - 0.22)), (0.05, 0.012, 0.012))
            tubo(c.m("ferro"), I4, [(x + 0.46, y - 0.05, Z1 - 0.03), (x + 0.6, y - 0.05, Z1 - 0.03), (x + 0.6, y + 0.4, Z1 - 0.03)], 0.012, sg(c, 4, 6, 8), tampas=False)
    with c.objeto("caixa-de-som"):
        x, y, z = X1 - 0.13, PISO + 2.75, -1.2
        caixa_chanfrada(c.m("plastico-preto"), mat((x, y, z)), (0.26, 0.42, 0.28), 0.02) if L >= 1 else caixa(c.m("plastico-preto"), mat((x, y, z)), (0.26, 0.42, 0.28))
        cilindro(c.m("ferro"), mat((x - 0.131, y - 0.09, z), rz=90), 0.085, 0.014, sg(c, 8, 12, 18))
        cilindro(c.m("ferro"), mat((x - 0.131, y + 0.1, z), rz=90), 0.045, 0.014, sg(c, 6, 10, 14))
        if L >= 1:
            caixa(c.m("ferro"), mat((X1 - 0.015, y + 0.15, z)), (0.03, 0.03, 0.2))
    # lixeira na ponta do balcão
    with c.objeto("lixeira"):
        lathe(c.m("plastico-preto"), mat((-3.3, PISO, 1.25)), [(0, 0), (0.11, 0, "duro"), (0.14, 0.4), (0.15, 0.42), (0.13, 0.42, "duro"), (0.0, 0.05)], sg(c, 8, 12, 16))
        if L >= 1:
            caixa(c.m("plastico-preto"), mat((-3.3, PISO + 0.43, 1.25 + 0.16)), (0.13, 0.014, 0.06))
