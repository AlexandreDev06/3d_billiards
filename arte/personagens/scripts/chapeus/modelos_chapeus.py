"""Os oito chapéus do P8, cada um uma função `modelo(lod) -> Malha` (cm; origem no alto da cabeça, +Z sobe, frente -Y; ver `malha_chapeus.py`).

Cada chapéu assenta na calota do balão: a borda de baixo (o aro da cabeça) fica na altura em que o corpo tem o raio interno do chapéu (`profundidade_do_raio`), então ela encosta na curva do topo
(o balão é bem mais estreito em cima que um crânio) e nenhum chapéu desce abaixo da sobrancelha mais alta (`SOBRANCELHA_MAX_Z`).
A cada chapéu o seu jeito: panamá de malandro de boteco, boné de aba reta, cartola, gorro de pompom, chapéu de palha de festa junina, boina de pintor, chapéu de festa e coroa de rei da sinuca.
"""
import math

import numpy as np

import dados_chapeus as C
from malha_chapeus import Malha, pol

PI = math.pi


def amostra(pontos, lod, cada=2):
    """No nível baixo guarda um ponto a cada `cada` (sempre o primeiro e o último)."""
    if lod["fino"] >= 1.0 or len(pontos) <= 3:
        return list(pontos)
    sel = list(pontos[::cada])
    if sel[-1] != pontos[-1]:
        sel.append(pontos[-1])
    return sel


def deslocar_perfil(pontos, d):
    """Desloca uma linha de perfil (r, z), de baixo para cima com o sólido à esquerda, `d` cm para fora (a normal é a tangente girada -90 graus)."""
    P = np.array(pontos, float)
    out = []
    for i in range(len(P)):
        a = P[min(i + 1, len(P) - 1)] - P[max(i - 1, 0)]
        a /= np.linalg.norm(a)
        out.append(tuple(P[i] + d * np.array([a[1], -a[0]])))
    return out


def arco(c, a, b, t0, t1, k):
    """Pontos (r, z) de uma elipse de centro `c` e semieixos (a, b), de t0 a t1 graus (0 = para fora, 90 = para cima)."""
    return [(c[0] + a * math.cos(math.radians(t)), c[1] + b * math.sin(math.radians(t))) for t in np.linspace(t0, t1, k)]


def aba_circular(m, mat_topo, mat_baixo, mat_borda, rb, largura, z_topo, z_baixo, n, queda, k=6, rep=(6.0, 1.0)):
    """Uma aba que sai do aro: as faces de baixo, da borda e de cima. `queda(theta, t) -> dz` (t de 0 no aro a 1 na ponta) entorta a aba."""
    rs = [rb + largura * i / k for i in range(k + 1)]

    def defo(r, z, th):
        t = min(max((r - rb) / largura, 0.0), 1.0)
        return r, z + queda(th, t)
    m.revolucao([(r, z_baixo) for r in rs], n, mat_baixo, deformar=defo, repeticao=rep)
    m.revolucao([(rb + largura, z_baixo), (rb + largura, z_topo)], n, mat_borda, deformar=defo, repeticao=(rep[0], 1.0))
    m.revolucao([(r, z_topo) for r in reversed(rs)], n, mat_topo, deformar=defo, repeticao=rep)


def placa_plana(m, th0, th1, ncol, r_ini, r_fim, z0, z1, mat_topo, mat_baixo, mat_borda, k=4, inclina=0.0):
    """A aba reta do boné: um setor de th0 a th1 (graus), do raio `r_ini(theta)` ao `r_fim(theta)`, com espessura de z0 (baixo) a z1 (cima); `inclina` sobe a ponta (cm)."""
    th = np.radians(np.linspace(th0, th1, ncol))

    def pontos(z, fr):
        P = np.zeros((k + 1 if fr else 2, ncol, 3))
        return P
    topo = np.zeros((k + 1, ncol, 3))
    baixo = np.zeros((k + 1, ncol, 3))
    borda = np.zeros((2, ncol, 3))
    for j, t in enumerate(th):
        r0, r1 = r_ini(t), r_fim(t)
        for i in range(k + 1):
            f = i / k
            r = r0 + (r1 - r0) * f
            sobe = inclina * f ** 1.4
            topo[i, j] = pol(r, z1 + sobe, t)
            baixo[i, j] = pol(r, z0 + sobe, t)
        borda[0, j] = pol(r1, z0 + inclina, t)
        borda[1, j] = pol(r1, z1 + inclina, t)
    m.grade(topo, mat_topo, False, inverter=True)
    m.grade(baixo, mat_baixo, False)
    m.grade(borda, mat_borda, False)


# ----------------------------------------------------------------------------------------------------------------------------------------------------
def panama(lod):
    m = Malha()
    n = lod["n"]
    mp, mf = m.mat("palha"), m.mat("faixa_preta")
    r_in = 2.90
    zb = -C.profundidade_do_raio(r_in)
    rb = r_in + 0.12
    H = 2.5
    hs = list(np.linspace(0.0, H, 11 if lod["fino"] else 6))
    ztop = zb + H
    topr = rb - 0.80

    def raio(h):
        t = h / H
        return rb - 0.16 * t ** 2 - 0.64 * t ** 4

    perfil = [(raio(h), zb - 0.04 + h * (H + 0.04) / H) for h in hs]

    def defo(r, z, th):
        t = min(max((z - zb) / H, 0.0), 1.0)
        return r * (1 - 0.10 * t ** 2 * (0.5 + 0.5 * math.cos(th))), z
    m.revolucao(perfil, n, mp, deformar=defo, repeticao=(7.0, 2.0))

    def dente(r, z, th):
        t = min(max((z - zb) / H, 0.0), 1.0)
        rr = r * (1 - 0.10 * t ** 2 * (0.5 + 0.5 * math.cos(th)))
        x = rr * math.sin(th)
        return rr, z - 0.30 * math.exp(-(x * x) / (2 * 0.55 ** 2))
    m.revolucao([(topr, ztop), (topr * 0.66, ztop), (topr * 0.33, ztop), (0.0, ztop)], n, mp, deformar=dente, repeticao=(2.0, 1.0))
    # aro de baixo (a face que olha para o chão, para quem vê de baixo) e a aba: frente e trás caídas, os lados levantados (o estalo do malandro)
    m.revolucao([(r_in, zb - 0.04), (rb, zb - 0.04)], n, mp, repeticao=(7.0, 1.0))
    aba_circular(m, mp, mp, mp, rb, 1.40, zb + 0.04, zb - 0.04, n, lambda th, t: (-0.20 * math.cos(2 * th) + 0.04) * t ** 1.5, k=6 if lod["fino"] else 3, rep=(8.0, 2.0))
    rf = rb + 0.04
    m.revolucao([(rb, zb + 0.02), (rf, zb + 0.02), (rf, zb + 0.62), (rb - 0.01, zb + 0.62)], n, mf, repeticao=(6.0, 1.0))
    # o laço da faixa: uma pena curta presa do lado esquerdo (+X), como a do malandro
    if lod["fino"]:
        a = np.array([rf + 0.02, 0.0, zb + 0.5])
        pts = [a + np.array([0.02, 0.0, 0.0]), a + np.array([0.28, -0.55, 0.45]), a + np.array([0.45, -1.15, 0.95]), a + np.array([0.40, -1.65, 1.15])]
        m.tubo(pts, 0.05, mf, n=5, raios=[0.045, 0.075, 0.075, 0.03])
    return m


def bone(lod):
    m = Malha()
    n = lod["n"]
    mt, ma, me = m.mat("tecido_bone"), m.mat("aba_bone"), m.mat("emblema_8")
    r_in = 3.15
    zb = -C.profundidade_do_raio(r_in)
    rb = r_in + 0.12
    Hc = 2.3
    hs = np.linspace(0.0, Hc * 0.995, 12 if lod["fino"] else 6)

    def raio(h):
        return rb * math.sqrt(max(1 - (h / Hc) ** 2, 0.0))
    perfil = [(raio(h), zb + h) for h in hs] + [(0.0, zb + Hc)]

    def defo(r, z, th):
        if not lod["fino"]:
            return r, z
        g = math.exp(-((abs(math.cos(3 * th)) / 0.07) ** 2))
        return r - 0.035 * g * min(max((z - zb) / 0.25, 0.0), 1.0), z
    m.revolucao(perfil, n, mt, deformar=defo, repeticao=(6.0, 2.0))
    m.revolucao([(r_in, zb - 0.04), (rb, zb - 0.04), (rb, zb)], n, ma, repeticao=(6.0, 1.0))
    if lod["fino"]:
        m.esfera((0.0, 0.0, zb + Hc + 0.04), 0.25, mt, n=12, m=6)
    # aba reta, um pouco levantada na ponta (a vista de cima não cobre a sobrancelha)
    placa_plana(m, -82, 82, 21 if lod["fino"] else 9,
                lambda t: rb - 0.02, lambda t: rb - 0.02 + 1.9 * max(math.cos(t * 1.10), 0.0) ** 0.7, zb - 0.04, zb + 0.06, ma, ma, ma, k=5 if lod["fino"] else 2, inclina=0.50)
    # o emblema: uma bolinha 8 (preto, círculo branco, dois aros) no painel da frente
    if lod["fino"]:
        rho = 0.82
        h0 = 1.05
        P = np.zeros((6, 24, 3))
        for i in range(6):
            for j in range(24):
                f = i / 5 * rho
                ph = 2 * PI * j / 24
                hh = min(max(h0 + f * math.sin(ph), 0.05), Hc * 0.97)
                th = (f * math.cos(ph)) / max(raio(hh), 0.5)
                P[i, j] = pol(raio(hh) + 0.014, zb + hh, th)
        m.grade(P, me, True, uv=lambda i, j, nl, nc: (0.5 + 0.5 * (i / (nl - 1)) * math.cos(2 * PI * j / (nc - 1)), 0.5 + 0.5 * (i / (nl - 1)) * math.sin(2 * PI * j / (nc - 1))), inverter=True)
    return m


def cartola(lod):
    m = Malha()
    n = lod["n"]
    mf, mc, mo = m.mat("feltro_preto"), m.mat("cetim_vermelho"), m.mat("ouro")
    r_in = 3.0
    zb = -C.profundidade_do_raio(r_in)
    rb = r_in + 0.13
    H = 5.1
    rt = rb - 0.18
    ztop = zb + H
    perfil = [(rb, zb - 0.04), (rb - 0.01, zb + 1.0), (rb - 0.07, zb + 2.5), (rb - 0.14, zb + 4.0), (rt, ztop - 0.18), (rt - 0.03, ztop - 0.07), (rt - 0.12, ztop - 0.016)]
    if lod["fino"]:
        perfil = [perfil[0]] + [(rb - 0.012 * h - 0.0 - 0.0004 * h ** 3, zb + h) for h in (0.5, 1.0, 1.8, 2.6, 3.4, 4.2)] + perfil[4:]
    m.revolucao(perfil, n, mf, repeticao=(6.0, 3.0))
    m.revolucao([(rt - 0.12, ztop - 0.016), (rt * 0.66, ztop), (rt * 0.33, ztop), (0.0, ztop)], n, mf, repeticao=(2.0, 1.0))
    m.revolucao([(r_in, zb - 0.04), (rb, zb - 0.04)], n, mf, repeticao=(6.0, 1.0))
    aba_circular(m, mf, mf, mf, rb, 1.05, zb + 0.04, zb - 0.04, n, lambda th, t: 0.38 * math.sin(th) ** 2 * t ** 1.3, k=4 if lod["fino"] else 2, rep=(6.0, 1.0))
    rf = rb - 0.0 + 0.045
    m.revolucao([(rb - 0.01, zb + 0.18), (rf, zb + 0.18), (rf, zb + 1.08), (rb - 0.02, zb + 1.08)], n, mc, repeticao=(6.0, 1.0))
    if lod["fino"]:
        # a fivela de ouro, um retângulo de fio sobre a cinta, na frente
        cx, cy = 0.0, -(rf + 0.03)
        z0, z1, w = zb + 0.30, zb + 0.96, 0.46
        ret = [(-w, z0), (w, z0), (w, z1), (-w, z1), (-w, z0)]
        pts = []
        for x, z in ret:
            th = x / (rf + 0.03)
            pts.append(pol(rf + 0.05, z, th))
        m.tubo(pts, 0.07, mo, n=6)
        m.tubo([pol(rf + 0.05, zb + 0.63, -w), pol(rf + 0.05, zb + 0.63, w)], 0.055, mo, n=5)
    return m


def gorro(lod):
    m = Malha()
    n = lod["n"]
    ml, mb, mp = m.mat("la_listrada"), m.mat("la_barra"), m.mat("la_pompom")
    r_in = 3.2
    zb = -C.profundidade_do_raio(r_in)
    rc = r_in + 0.20
    cuff = 0.95
    # a barra dobrada (um anel reto de tricô de canelado) e, por cima, o corpo: uma cúpula folgada que sobe acima da cabeça
    z0 = zb + cuff
    alto = 1.85
    ts = np.linspace(0.0, 90.0, 13 if lod["fino"] else 6)
    cupula = [(rc * (0.985 - 0.015 * math.sin(math.radians(2 * t))) * math.cos(math.radians(t)) ** 0.9 + 0.0, z0 + alto * math.sin(math.radians(t)) ** 1.1) for t in ts]
    cupula[0] = (rc - 0.02, z0)
    cupula[-1] = (0.0, z0 + alto)
    m.revolucao(cupula, n, ml, repeticao=(10.0, 2.0))
    m.revolucao([(r_in, zb - 0.03), (rc, zb - 0.03), (rc, zb + cuff), (rc - 0.02, zb + cuff)], n, mb, repeticao=(24.0, 1.0))
    # o pompom: bolota fofa, com ruído
    rng = np.random.default_rng(5)
    semente = rng.random((6, 6, 6))

    def fofo(x, y, z):
        i, j, k = int((x + 1) * 2.4), int((y + 1) * 2.4), int((z + 1) * 2.4)
        return 1.0 + 0.10 * (semente[i % 6, j % 6, k % 6] - 0.5) + 0.04 * math.sin(9 * x + 5 * y) * math.sin(7 * z)
    m.esfera((0.0, 0.0, z0 + alto + 0.62), 0.95, mp, n=18 if lod["fino"] else 8, m=12 if lod["fino"] else 6, ruido=fofo if lod["fino"] else None)
    return m


def palha(lod):
    m = Malha()
    n = lod["n"]
    mp, mx, mf = m.mat("palha"), m.mat("xadrez"), m.mat("fita_vermelha")
    r_in = 2.85
    zb = -C.profundidade_do_raio(r_in)
    rb = r_in + 0.13
    H = 1.95
    hs = np.linspace(0.0, H * 0.96, 8 if lod["fino"] else 4)

    def raio(h):
        t = h / H
        return rb * (1 - 0.30 * t ** 2.0 - 0.10 * t ** 6)
    perfil = [(raio(h), zb - 0.04 + h) for h in hs]
    topo_r = raio(H * 0.96)
    perfil += [(topo_r * 0.8, zb + H * 0.985), (topo_r * 0.5, zb + H), (topo_r * 0.2, zb + H * 1.01), (0.0, zb + H * 1.012)]
    m.revolucao(perfil, n, mp, repeticao=(7.0, 2.0))
    m.revolucao([(r_in, zb - 0.04), (rb, zb - 0.04)], n, mp, repeticao=(7.0, 1.0))
    aba_circular(m, mp, mp, mp, rb, 1.5, zb + 0.04, zb - 0.04, n, lambda th, t: -0.22 * t ** 1.6 + (0.05 * math.sin(7 * th) * t ** 3 if lod["fino"] else 0.0), k=6 if lod["fino"] else 3, rep=(9.0, 2.0))
    rf = rb + 0.04
    m.revolucao([(rb - 0.01, zb + 0.03), (rf, zb + 0.03), (rf, zb + 0.66), (rb - 0.03, zb + 0.66)], n, mx, repeticao=(14.0, 1.0))
    if lod["fino"]:
        # o laço da fita, na frente à esquerda: dois lóbulos e um nó
        th0 = math.radians(-38)
        base = pol(rf + 0.05, zb + 0.34, th0)
        for lado in (-1, 1):
            c = base + np.array([lado * 0.40 * math.cos(th0), lado * 0.40 * math.sin(th0), 0.0])
            m.esfera(tuple(c + np.array([0.0, -0.05, 0.0])), 0.30, mf, n=10, m=6, escala=(1.0, 0.45, 0.62))
        m.esfera(tuple(base + np.array([0.0, -0.02, 0.0])), 0.17, mf, n=8, m=5)
        m.tubo([base + np.array([0.02, -0.02, -0.1]), base + np.array([0.12, -0.12, -0.55]), base + np.array([0.20, -0.14, -0.90])], 0.05, mf, n=4, raios=[0.08, 0.09, 0.06])
        m.tubo([base + np.array([-0.02, -0.02, -0.1]), base + np.array([-0.16, -0.12, -0.48]), base + np.array([-0.30, -0.12, -0.82])], 0.05, mf, n=4, raios=[0.08, 0.09, 0.06])
    return m


def boina(lod):
    m = Malha()
    n = lod["n"]
    mf, mb = m.mat("feltro_vinho"), m.mat("faixa_boina")
    r_in = 3.05
    zb = -C.profundidade_do_raio(r_in)
    rb = r_in + 0.10
    # o corpo da boina: um travesseiro achatado que sobra para os lados
    perfil = [(rb, zb + 0.26), (3.55, zb + 0.34), (3.98, zb + 0.62), (4.12, zb + 1.02), (3.92, zb + 1.46), (3.35, zb + 1.82), (2.45, zb + 2.04), (1.2, zb + 2.15), (0.0, zb + 2.18)]
    if lod["fino"]:
        perfil = [(rb, zb + 0.26), (3.30, zb + 0.30), (3.72, zb + 0.46), (3.98, zb + 0.70), (4.10, zb + 1.02), (4.04, zb + 1.30), (3.84, zb + 1.54), (3.5, zb + 1.74), (3.0, zb + 1.92), (2.3, zb + 2.06), (1.4, zb + 2.15), (0.6, zb + 2.19), (0.0, zb + 2.20)]
    m.revolucao(perfil, n, mf, repeticao=(8.0, 3.0))
    ztop = zb + (2.20 if lod["fino"] else 2.18)
    m.tubo([(0.0, 0.0, ztop - 0.03), (0.0, 0.0, ztop + 0.30)], 0.11, mf, n=7 if lod["fino"] else 5, raios=[0.13, 0.09])
    m.girar(1, 9.0, centro=(0.0, 0.0, zb + 0.3))      # inclinada para o lado, com jeito de pintor
    m.revolucao([(r_in, zb - 0.04), (rb, zb - 0.04), (rb, zb + 0.30), (rb - 0.02, zb + 0.30)], n, mb, repeticao=(8.0, 1.0))
    return m


def festa(lod):
    m = Malha()
    n = lod["n"]
    ml, me, mp = m.mat("listras_festa"), m.mat("elastico"), m.mat("pompom_festa")
    r_in = 2.62
    zb = -C.profundidade_do_raio(r_in)
    rb = r_in + 0.06
    Hc = 6.6
    ks = np.linspace(0.0, 0.97, 10 if lod["fino"] else 5)
    perfil = [(rb * (1 - k) ** 1.05, zb - 0.03 + k * Hc) for k in ks] + [(0.04, zb + Hc), (0.0, zb + Hc + 0.01)]
    m.revolucao(perfil, n, ml, repeticao=(1.0, 1.0))
    m.revolucao([(r_in, zb - 0.03), (rb, zb - 0.03)], n, ml, repeticao=(1.0, 1.0))
    m.esfera((0.0, 0.0, zb + Hc + 0.06), 0.30, mp, n=12 if lod["fino"] else 6, m=8 if lod["fino"] else 4)
    # o elástico: dois fios que descem pelos lados da cabeça, rente à pele, até um grampo
    for lado in (-1, 1):
        zs = np.linspace(zb + 0.04, -2.3, 10 if lod["fino"] else 4)
        pts = [np.array([lado * (max(C.raio_da_calota(z), rb * 0.96 if z > zb else 0.0) + 0.07), 0.0, z]) for z in zs]
        m.tubo(pts, 0.04, me, n=5 if lod["fino"] else 3)
        m.esfera(tuple(pts[-1] + np.array([0.0, 0.0, -0.05])), 0.11, me, n=8 if lod["fino"] else 5, m=5 if lod["fino"] else 3)
    return m


def coroa(lod):
    m = Malha()
    n = 50 if lod["fino"] else 25
    mo = m.mat("ouro")
    gemas = [m.mat("gema_vermelha"), m.mat("gema_azul"), m.mat("gema_verde")]
    r_in = 3.0
    zb = -C.profundidade_do_raio(r_in)
    rb = r_in + 0.10
    Hb = 1.15
    pontas = 5
    pico = 1.95

    def sobe(th):
        d = abs(((th * pontas / (2 * PI)) + 0.5) % 1.0 - 0.5)       # 0 na ponta, 0,5 no vale
        return pico * max(1 - 2.0 * d, 0.0) ** 1.15

    def defo(r, z, th):
        t = min(max((z - zb) / Hb, 0.0), 1.0)
        return r + 0.08 * t, zb + t * (Hb + sobe(th)) - 0.0 if z >= zb + Hb - 1e-6 else z
    # parede de fora: a cinta e as pontas (a linha de cima acompanha as pontas)
    linhas = [(rb, zb - 0.03), (rb + 0.01, zb + 0.30), (rb + 0.03, zb + 0.62), (rb + 0.08, zb + Hb)]
    P = np.zeros((len(linhas), n, 3))
    th = 2 * PI * np.arange(n) / n
    for i, (r, z) in enumerate(linhas):
        for j in range(n):
            f = i / (len(linhas) - 1)
            zz = zb - 0.03 + (z - (zb - 0.03)) + (sobe(th[j]) * (f ** 1.4) if i == len(linhas) - 1 else 0.0)
            P[i, j] = pol(r - 0.0 * f, zz, th[j])
    m.grade(P, mo, True, uv=lambda i, j, nl, nc: (pontas * 1.0 * j / (nc - 1), i / (nl - 1)))
    # parede de dentro (vista pelos vãos) e a borda de cima
    Pi = np.zeros_like(P)
    for i in range(len(linhas)):
        for j in range(n):
            Pi[i, j] = P[i, j] + np.array([-0.0, 0.0, 0.0])
            Pi[i, j] = pol(max(linhas[i][0] - 0.11, 0.2), P[i, j][2], th[j])
    m.grade(Pi, mo, True, inverter=True)
    topo = np.zeros((2, n, 3))
    for j in range(n):
        topo[0, j] = P[-1, j]
        topo[1, j] = Pi[-1, j]
    m.grade(topo, mo, True)
    m.revolucao([(rb - 0.11, zb - 0.03), (rb, zb - 0.03)], n, mo, repeticao=(pontas, 1.0))
    if lod["fino"]:
        for k in range(pontas):
            t = 2 * PI * k / pontas
            # pérola na ponta e gema na cinta, entre as pontas
            ponta = pol(rb + 0.10, zb + Hb + pico + 0.18, t)
            m.esfera(tuple(ponta), 0.22, gemas[k % 3], n=10, m=6)
            tv = t + PI / pontas
            g = pol(rb + 0.10, zb + 0.52, tv)
            m.esfera(tuple(g), 0.20, gemas[(k + 1) % 3], n=8, m=5, escala=(1.0, 1.0, 1.15))
    else:
        for k in range(pontas):
            t = 2 * PI * k / pontas
            m.esfera(tuple(pol(rb + 0.10, zb + Hb + pico + 0.16, t)), 0.22, gemas[k % 3], n=6, m=4)
    return m


MODELOS = {
    "chapeu_panama": panama, "bone_aba_reta": bone, "cartola": cartola, "gorro_pompom": gorro,
    "chapeu_palha": palha, "boina": boina, "chapeu_festa": festa, "coroa": coroa,
}
