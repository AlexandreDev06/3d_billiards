"""Garrafas, latas, copos e a prateleira do balcão (P6): silhueta de garrafa de verdade (ombro, gargalo, filete da boca, tampinha de coroa ou rolha),
normais suaves, casca de vidro (alfa) com o líquido por dentro, rótulo de papel curvo e a prateleira com as garrafas assentadas sem se atravessar.

Cada função recebe a `Cena` (`c`) e escreve nas malhas por material. As medidas das garrafas são de produtos comuns de bar (long neck 355 ml, 600 ml, cachaça 700 ml, vinho,
licor, PET de 2 l); as marcas dos rótulos são inventadas (`sinais.ROTULOS`).
"""
import math

import numpy as np

import geom
from const import PISO, X0, sg, uv_cel
from geom import I4, caixa, caixa_chanfrada, lathe, mat, tubo

# célula do atlas de rótulos (coluna, linha) por rótulo; `sinais.ROTULOS` tem os desenhos na mesma ordem
CELULAS = {n: (i % 4, i // 4) for i, n in enumerate(("cachaca", "pinga", "cerveja", "vinho", "bitter", "licor", "dose", "chopp", "serra", "rainha", "alambique", "guarana",
                                                     "laranjada", "tonica", "caju", "pimenta"))}

# Perfis (r, y) de baixo para cima, em metros, com a base em y = 0: o fundo côncavo, o canto arredondado, o corpo, o ombro em S, o gargalo, o filete da boca.
PERFIS = {
    "cerveja": dict(  # long neck de 355 ml
        vidro="vidro-ambar", liquido="liquido-ambar", nivel=0.208, tampa="tampa", boca=0.0158,
        perfil=[(0, 0.0045), (0.016, 0.0032), (0.0255, 0.0006), (0.0292, 0.003), (0.0306, 0.009), (0.0307, 0.02), (0.0307, 0.105), (0.0299, 0.124), (0.0271, 0.1415),
                (0.0226, 0.1595), (0.0181, 0.1775), (0.0151, 0.195), (0.0140, 0.215), (0.0139, 0.225), (0.0142, 0.234), (0.0153, 0.240), (0.0161, 0.2442), (0.0157, 0.2476),
                (0.0140, 0.2490), (0, 0.2490)],
        rot=(0.034, 60), pescoco=(0.2, 0.232)),
    "litrao": dict(   # garrafa de 600 ml
        vidro="vidro-ambar", liquido="liquido-ambar", nivel=0.248, tampa="tampa", boca=0.0158,
        perfil=[(0, 0.005), (0.017, 0.0035), (0.0285, 0.0007), (0.0343, 0.0035), (0.0364, 0.011), (0.0366, 0.025), (0.0366, 0.135), (0.0358, 0.155), (0.0322, 0.1745),
                (0.0262, 0.1945), (0.0203, 0.2135), (0.0160, 0.231), (0.0146, 0.2495), (0.0142, 0.2610), (0.0146, 0.2700), (0.0155, 0.2765), (0.0163, 0.2815), (0.0160, 0.2850),
                (0.0141, 0.2865), (0, 0.2865)],
        rot=(0.045, 62), pescoco=(0.235, 0.268)),
    "cachaca": dict(  # 700 ml, ombro alto, rolha
        vidro="vidro-claro", liquido="liquido-claro", nivel=0.2, tampa="rolha", boca=0.0148,
        perfil=[(0, 0.005), (0.017, 0.0035), (0.0285, 0.001), (0.0335, 0.004), (0.0352, 0.011), (0.0354, 0.03), (0.0354, 0.15), (0.0344, 0.17), (0.0301, 0.1885),
                (0.0224, 0.2045), (0.0166, 0.2165), (0.0146, 0.2265), (0.0140, 0.2500), (0.0141, 0.2780), (0.0148, 0.2845), (0.0158, 0.2880), (0.0152, 0.2910), (0.0132, 0.2918), (0, 0.2918)],
        rot=(0.04, 58), pescoco=None),
    "pinga": dict(    # baixa e larga, verde
        vidro="vidro-verde", liquido="liquido-claro", nivel=0.145, tampa="tampa-vermelha", boca=0.0150,
        perfil=[(0, 0.004), (0.016, 0.003), (0.0262, 0.0008), (0.0315, 0.0035), (0.0335, 0.0095), (0.0337, 0.022), (0.0337, 0.115), (0.0326, 0.133), (0.0285, 0.1495),
                (0.0222, 0.1625), (0.0170, 0.1735), (0.0145, 0.1835), (0.0140, 0.1965), (0.0146, 0.2040), (0.0156, 0.2085), (0.0153, 0.2110), (0.0135, 0.2122), (0, 0.2122)],
        rot=(0.03, 55), pescoco=None),
    "vinho": dict(    # bordalesa
        vidro="vidro-verde", liquido="liquido-vinho", nivel=0.215, tampa="capsula", boca=0.0158,
        perfil=[(0, 0.012), (0.012, 0.0135), (0.023, 0.0070), (0.0305, 0.0015), (0.0340, 0.006), (0.0361, 0.014), (0.0365, 0.03), (0.0365, 0.17), (0.0356, 0.19), (0.0312, 0.2125),
                (0.0238, 0.2325), (0.0184, 0.2490), (0.0158, 0.2640), (0.0149, 0.2760), (0.0148, 0.2950), (0.0152, 0.3010), (0.0161, 0.3040), (0.0158, 0.3070), (0.0140, 0.3080), (0, 0.3080)],
        rot=(0.055, 64), pescoco=(0.272, 0.306)),
    "licor": dict(    # cintura larga, âmbar
        vidro="vidro-ambar", liquido="liquido-licor", nivel=0.215, tampa="rolha", boca=0.0125,
        perfil=[(0, 0.005), (0.017, 0.0035), (0.0335, 0.0008), (0.0415, 0.005), (0.0449, 0.014), (0.0452, 0.035), (0.0452, 0.115), (0.0432, 0.14), (0.0372, 0.1635),
                (0.0292, 0.1835), (0.0206, 0.2040), (0.0150, 0.2210), (0.0126, 0.2350), (0.0123, 0.2560), (0.0128, 0.2635), (0.0136, 0.2680), (0.0128, 0.2700), (0.0110, 0.2706), (0, 0.2706)],
        rot=(0.04, 50), pescoco=None),
    "pet": dict(      # PET de 2 l com fundo de pétalas e gargalo largo
        vidro="vidro-pet", liquido="liquido-guarana", nivel=0.28, tampa="tampa-plastico", boca=0.0150,
        perfil=[(0, 0.012), (0.017, 0.010), (0.029, 0.0035), (0.0345, 0.0), (0.0405, 0.012), (0.0418, 0.035), (0.0418, 0.20), (0.0412, 0.225), (0.0385, 0.250), (0.0325, 0.2715),
                (0.0248, 0.2885), (0.0185, 0.3010), (0.0160, 0.3115), (0.0155, 0.3240), (0.0165, 0.3290), (0.0158, 0.3330), (0.0150, 0.3345), (0, 0.3345)],
        rot=(0.08, 66), pescoco=None),
}
ROTULOS_DE = {"cerveja": ["cerveja", "serra", "rainha", "chopp"], "litrao": ["cerveja", "serra", "rainha"], "cachaca": ["cachaca", "alambique", "bitter", "dose"],
              "pinga": ["pinga", "dose", "pimenta", "caju"], "vinho": ["vinho", "licor"], "licor": ["licor", "caju", "bitter"], "pet": ["guarana", "laranjada", "tonica"]}
LIQUIDO_DO_ROTULO = {"guarana": "liquido-guarana", "laranjada": "liquido-laranja", "tonica": "liquido-claro"}
ESPESSURA = 0.0022   # parede do vidro (m)


def _dp(pts, tol):
    """Douglas-Peucker sobre (r, y): tira os pontos do perfil que a silhueta dispensa."""
    if len(pts) < 3:
        return list(pts)
    a, b = np.array(pts[0][:2]), np.array(pts[-1][:2])
    ab = b - a
    n2 = float(ab @ ab) or 1e-12
    d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / math.sqrt(n2) for p in pts[1:-1]]
    i = int(np.argmax(d))
    if d[i] > tol:
        return _dp(pts[:i + 2], tol)[:-1] + _dp(pts[i + 1:], tol)
    return [pts[0], pts[-1]]


def _perfil_de(tipo, perto, lod=2):
    p = PERFIS[tipo]["perfil"]
    return p if perto else _dp(p, (0.0012, 0.0021, 0.0012)[lod] if lod < 2 else 0.0012)


def _r_em(perfil, y):
    ys = [p[1] for p in perfil]
    rs = [p[0] for p in perfil]
    return float(np.interp(y, ys, rs))


def _perfil_do_liquido(perfil, nivel, esp=ESPESSURA):
    """O líquido por dentro da garrafa: a mesma silhueta, `esp` para dentro, do fundo até `nivel`; a superfície é plana."""
    ys = [p[1] for p in perfil if 0.006 < p[1] < nivel and p[1] > 0.0075]
    ys = [0.007] + ys + [nivel]
    pts = [(0.0, ys[0])]
    for k, y in enumerate(ys):
        r = max(_r_em(perfil, y) - esp, 0.002)
        pts.append((r, y, "duro") if k in (0, len(ys) - 1) else (r, y))
    pts.append((0.0, nivel))
    return pts


def garrafa(c, tipo, x, y, z, yaw, rotulo, escala=1.0, cheia=True, seg=None, perto=False):
    """Uma garrafa: casca de vidro (alfa), líquido, tampa e rótulo. `y` é a base. `perto` = perfil completo e mais lados (as de cima das mesas); no fundo do balcão o perfil é decimado."""
    L = c.lod
    p = dict(PERFIS[tipo])
    p["perfil"] = _perfil_de(tipo, perto, L)
    seg = seg or (sg(c, 6, 6, 10) if not perto else sg(c, 6, 10, 16))
    T = mat((x, y, z), yaw=yaw, s=escala)
    lathe(c.m(p["vidro"]), T, p["perfil"], seg)
    liquido = LIQUIDO_DO_ROTULO.get(rotulo, p["liquido"]) if tipo == "pet" else p["liquido"]
    if cheia and L >= 1:
        lathe(c.m(liquido), T, _perfil_do_liquido(p["perfil"], p["nivel"]), max(6, seg - 2))
    y0, arco = p["rot"]
    r_ = _r_em(p["perfil"], y0 + 0.01) + 0.0005
    altura = r_ * math.radians(arco * 2) * 0.95
    col, row = CELULAS[rotulo]
    u0, u1, v0, v1 = uv_cel(col, row, 4, 4)
    folga = 0.0004
    lathe(c.m("rotulos"), T, [(_r_em(p["perfil"], y0 + k * altura / 2) + folga, y0 + k * altura / 2) for k in range(3)], sg(c, 4, 4, 8 if perto else 6),
          esc_u=u1 - u0, esc_v=(v1 - v0) / altura, arco=(-arco, arco), v0=v0, u0=u0)
    if L >= 1:
        topo = p["perfil"][-2][1]
        tipo_tampa = p["tampa"]
        r_boca = p["boca"]
        if tipo_tampa == "rolha":
            lathe(c.m("rolha"), T, [(r_boca * 0.9, topo - 0.012, "duro"), (r_boca * 0.95, topo - 0.012), (r_boca * 1.1, topo + 0.002), (r_boca * 1.2, topo + 0.0045), (r_boca * 1.2, topo + 0.016),
                                    (r_boca * 1.12, topo + 0.0185), (0, topo + 0.0185)], sg(c, 6, 8, 12))
        elif tipo_tampa == "capsula":   # cápsula de vinho: papel-alumínio sobre a boca
            lathe(c.m("capsula"), T, [(r_boca + 0.0007, topo - 0.030, "duro"), (r_boca + 0.0009, topo - 0.002), (r_boca + 0.0009, topo + 0.0015), (r_boca * 0.8, topo + 0.0022), (0, topo + 0.0022)], sg(c, 6, 8, 12))
        else:
            rc = r_boca + 0.0012
            nome_m = {"tampa": "tampa", "tampa-vermelha": "tampa-vermelha", "tampa-plastico": "tampa-plastico"}[tipo_tampa]
            if nome_m == "tampa-plastico":
                lathe(c.m(nome_m), T, [(rc + 0.001, topo - 0.014, "duro"), (rc + 0.001, topo + 0.002), (rc, topo + 0.0042), (0, topo + 0.0042)], sg(c, 6, 8, 12))
            else:
                lathe(c.m(nome_m), T, [(rc + 0.0009, topo - 0.0072, "duro"), (rc + 0.0001, topo - 0.0036), (rc - 0.0018, topo + 0.0008), (0, topo + 0.0010)], 8 if perto else 6)
        if p["pescoco"] and tipo in ("cerveja", "litrao", "vinho"):   # gargantilha de papel-alumínio no pescoço
            a, b = p["pescoco"]
            if tipo != "vinho":
                lathe(c.m("tampa"), T, [(_r_em(p["perfil"], a) + 0.0006, a), (_r_em(p["perfil"], (a + b) / 2) + 0.0006, (a + b) / 2), (_r_em(p["perfil"], b) + 0.0006, b)], sg(c, 4, 6, 8), arco=(-80, 80))


def lata(c, x, y, z, yaw, rotulo):
    """Lata de 350 ml: corpo, ombro afunilado, aro e tampa de alumínio com argola."""
    L = c.lod
    seg = sg(c, 6, 10, 14)
    T = mat((x, y, z), yaw=yaw)
    col, row = CELULAS[rotulo]
    u0, u1, v0, v1 = uv_cel(col, row, 4, 4)
    h_corpo = 0.1
    lathe(c.m("rotulos"), T, [(0, 0.004), (0.026, 0.0, "duro"), (0.0331, 0.0045), (0.033, 0.01), (0.033, h_corpo), (0.0305, 0.108, "duro"), (0.0268, 0.1175), (0.0268, 0.122)], seg,
          esc_u=u1 - u0, esc_v=(v1 - v0) / 0.1, u0=u0, v0=v0)
    if L >= 1:
        lathe(c.m("cromado"), T, [(0.0268, 0.1217), (0.0285, 0.1230), (0.0270, 0.1243), (0.0235, 0.1233), (0, 0.1233)], sg(c, 6, 8, 12))
        if L == 2:
            tubo(c.m("cromado"), I4, geom.anel(x + 0.004 * math.cos(math.radians(yaw)), y + 0.1236, z, 0.0075, 8, plano="xz"), 0.0009, 4, fechado=True)


def copo(c, x, y, z, cheio=0.0, de_cabeca=False, espuma=False):
    """Copo americano de vidro grosso (casca de fora, de dentro e boca arredondada). `cheio` = fração de líquido; `de_cabeca` vira o copo no pano."""
    L = c.lod
    seg = sg(c, 8, 12, 18)
    perfil = [(0, 0.0095), (0.0215, 0.0085, "duro"), (0.0246, 0.0005), (0.0262, 0.0), (0.0263, 0.0035), (0.0335, 0.103), (0.0352, 0.1095, "duro"), (0.0360, 0.1085), (0.0358, 0.1065),
              (0.0345, 0.1055), (0.0328, 0.0985), (0.0265, 0.0105), (0, 0.0105)]
    if de_cabeca:
        T = mat((x, y + 0.11, z), rx=180)
    else:
        T = mat((x, y, z))
    lathe(c.m("vidro-claro"), T, perfil, seg)
    if cheio > 0 and not de_cabeca and L >= 1:
        n = 0.0105 + (0.1 - 0.0105) * cheio
        r0 = 0.0265 + (0.0328 - 0.0265) * (n - 0.0105) / (0.0985 - 0.0105)
        pts = [(0.0, 0.0108), (0.0262, 0.0108, "duro"), (r0 - 0.0003, n, "duro"), (0.0, n)]
        lathe(c.m("liquido-ambar"), T, pts, sg(c, 6, 8, 14))
        if espuma and L >= 1:
            lathe(c.m("espuma"), T, [(r0 - 0.0003, n, "duro"), (r0 + 0.0004, n + 0.008), (r0 - 0.003, n + 0.017), (r0 - 0.012, n + 0.021), (0, n + 0.022)], sg(c, 6, 8, 14))


# garrafa de 600 ml de verdade (24,7 cm de altura, 6,3 cm de diâmetro): o perfil `litrao` a 86%
ESCALA_600 = 0.86
ALTURA_600 = PERFIS["litrao"]["perfil"][-1][1] * ESCALA_600 + 0.001
# perfis enxutos (r, y, sem escala) da garrafa de engradado: de longe só a silhueta conta, e pelas frestas se vê o corpo
_ENXUTO = [(0.0, 0.004), (0.0285, 0.0007), (0.0366, 0.012), (0.0366, 0.135), (0.0322, 0.1745), (0.0203, 0.2135), (0.0146, 0.2495), (0.0160, 0.2815), (0.0, 0.2865)]
_CORPO_TOPO = [(0.0, 0.004), (0.0285, 0.0007), (0.0366, 0.012), (0.0366, 0.135), (0.0322, 0.1745), (0.0203, 0.2135), (0.0, 0.2135)]
_PESCOCO_TOPO = [(0.0203, 0.2135), (0.0150, 0.2375), (0.0143, 0.262), (0.0163, 0.2815), (0.0141, 0.2865), (0.0, 0.2865)]


def garrafa_de_engradado(c, T, x, y, z, yaw, perto=False, seg=6):
    """Garrafa inteira de 600 ml de pé num engradado (substitui a antiga `gola_de_garrafa`, que era só o gargalo). `T` é a matriz do engradado, `(x, y, z)` a base da garrafa no
    referencial dele (y = o fundo ou as réguas do fundo) e `yaw` a volta dela (graus). Poucos lados e normais suaves bastam: pelas frestas só se vê o corpo.
    - `perto` (alto, engradado do topo da pilha, onde o gargalo e a tampinha passam do aro): corpo e ombro de vidro escuro opaco, pescoço de vidro âmbar em alfa, tampinha de
      coroa e o rótulo curvo;
    - o resto: um torno só, de vidro escuro opaco, com a tampinha."""
    L = c.lod
    Tb = T @ mat((x, y, z), yaw=yaw, s=ESCALA_600)
    topo = PERFIS["litrao"]["perfil"][-2][1]
    rc = PERFIS["litrao"]["boca"] + 0.0012
    if perto and L == 2:
        lathe(c.m("liquido-ambar"), Tb, _CORPO_TOPO, seg)
        lathe(c.m("vidro-ambar"), Tb, _PESCOCO_TOPO, seg)
        y0, arco = PERFIS["litrao"]["rot"]
        perfil = PERFIS["litrao"]["perfil"]
        altura = (_r_em(perfil, y0 + 0.01) + 0.0005) * math.radians(arco * 2) * 0.95
        u0, u1, v0, v1 = uv_cel(*CELULAS[rotulo_de_engradado(x, z)], 4, 4)
        lathe(c.m("rotulos"), Tb, [(_r_em(perfil, y0 + k * altura / 2) + 0.0004, y0 + k * altura / 2) for k in range(3)], 4, esc_u=u1 - u0, esc_v=(v1 - v0) / altura,
              arco=(-arco, arco), v0=v0, u0=u0)
    else:
        lathe(c.m("liquido-ambar"), Tb, _ENXUTO, seg)
    lathe(c.m("tampa"), Tb, [(rc + 0.0009, topo - 0.0072, "duro"), (rc + 0.0001, topo - 0.0036), (rc - 0.0018, topo + 0.0008), (0, topo + 0.0010)], seg)


def rotulo_de_engradado(x, z):
    """Qual rótulo vai na garrafa que está em (x, z) do engradado: as cervejas do boteco, em rodízio."""
    return ("cerveja", "serra", "rainha")[int(round((x * 8 + z * 5) / 0.12)) % 3]


# ------------------------------------------------------------------ prateleiras do fundo do balcão
def _largura(tipo, esc=1.0):
    return _r_em(PERFIS[tipo]["perfil"], 0.02) * esc


def prateleiras(c):
    """O fundo do balcão: três tábuas com garrafas, latas e PETs, agrupadas por marca como num bar (no baixo, um quadro desenhado no lugar das garrafas).
    Cada garrafa fica de pé na tábua e a uma distância de suas vizinhas que a impede de se atravessarem (conferido em `conferir_prateleiras`)."""
    L = c.lod
    ys = [0.35, 0.72, 1.09]
    zi, zf = -3.0, 0.6
    xc = X0 + 0.125
    with c.objeto("prateleiras"):
        mm = c.m("madeira-clara")
        for y in ys:
            caixa_chanfrada(mm, mat((xc, y - 0.015, (zi + zf) / 2)), (0.25, 0.03, zf - zi), 0.004, esc=1.0) if L >= 1 else caixa(mm, mat((xc, y - 0.015, (zi + zf) / 2)), (0.25, 0.03, zf - zi), esc=1.0)
            if L >= 1:
                caixa_chanfrada(mm, mat((xc + 0.118, y + 0.006, (zi + zf) / 2)), (0.014, 0.03, zf - zi), 0.004, esc=1.0)   # frente da tábua
        caixa(mm, mat((X0 + 0.006, 0.7, (zi + zf) / 2)), (0.012, 1.2, zf - zi), esc=1.0)               # fundo
        for z in (zi + 0.02, zf - 0.02):
            caixa(mm, mat((xc, 0.7, z)), (0.25, 1.15, 0.04), esc=1.0)
        if L == 2:
            for y in ys:
                for z in np.linspace(zi + 0.5, zf - 0.5, 4):
                    caixa(c.m("ferro"), mat((X0 + 0.11, y - 0.05, z)), (0.2, 0.02, 0.03))
    if L == 0:   # no baixo, as garrafas são um quadro desenhado diante do fundo (2 triângulos)
        with c.objeto("prateleira-garrafas"):
            x = xc + 0.003
            geom.quad(c.m("prateleira-garrafas"), I4, (x, 0.30, zf), (x, 0.30, zi), (x, 1.35, zi), (x, 1.35, zf), (0, 0), (1, 0), (1, 1), (0, 1))
        return
    rng = c.rng
    c.garrafas = []   # (tipo, x, y, z, r) de cada peça de pé, para a conferência
    tipos = ["cerveja", "cerveja", "cachaca", "pinga", "vinho", "litrao", "licor", "pet", "cerveja", "pinga", "vinho", "litrao", "cachaca"]
    with c.objeto("garrafas"):
        for fila, y in enumerate(ys):
            z = zi + 0.075
            ultimo_r = 0.0
            while z < zf - 0.075:
                if rng.random() < sg(c, 0.0, 0.55, 0.22):        # vão na prateleira (no médio, mais; o resto vem na distância)
                    z += rng.uniform(0.06, 0.2)
                    ultimo_r = 0.0
                    continue
                grupo = rng.randint(2, 5)
                if fila == 0 and rng.random() < 0.18 and L == 2:
                    t = "lata"
                    rot = rng.choice(["guarana", "laranjada", "cerveja", "serra"])
                else:
                    t = rng.choice(tipos)
                    rot = rng.choice(ROTULOS_DE[t])
                for _ in range(grupo):
                    esc = rng.uniform(0.98, 1.02)
                    r = 0.033 if t == "lata" else _largura(t, esc) * 1.0
                    z += ultimo_r + r + rng.uniform(0.003, 0.012)
                    if z > zf - 0.07:
                        break
                    px = xc + rng.uniform(-0.025, 0.035)
                    yaw = rng.uniform(-40, 40) if rng.random() < 0.8 else rng.uniform(-180, 180)
                    if t == "lata":
                        lata(c, px, y, z, yaw, rot)
                    else:
                        garrafa(c, t, px, y, z, yaw, rot, escala=esc)
                    c.garrafas.append((t, px, y, z, r * 1.0))
                    ultimo_r = r


def conferir_prateleiras(c):
    """Garrafas flutuando ou atravessadas: devolve (peças, flutuando, sobrepostas, fora da tábua)."""
    g = getattr(c, "garrafas", [])
    ys = [0.35, 0.72, 1.09]
    xc = X0 + 0.125
    flut = sum(1 for (_, _, y, _, _) in g if min(abs(y - yy) for yy in ys) > 1e-6)
    sobre = 0
    for i, a in enumerate(g):
        for b in g[i + 1:]:
            if abs(a[2] - b[2]) < 1e-6 and math.hypot(a[1] - b[1], a[3] - b[3]) < a[4] + b[4] - 1e-4:
                sobre += 1
    fora = sum(1 for (_, x, _, _, r) in g if x - r < X0 + 0.012 or x + r > xc + 0.12)
    return len(g), flut, sobre, fora
